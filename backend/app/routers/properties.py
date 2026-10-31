"""
Property management REST endpoints (Admin only for modifications — enforced on the backend).
"""
import csv
import io
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CRMProperty
from app.schemas import (
    PropertyCreate, PropertyOut, PropertyUpdate,
    PropertyImportRow, PropertyImportResult, PropertyAnalyticsOut
)
from app.services.audit_service import log_audit
from app.services.property_analytics import sync_crm_ad
from app.services.roles import require_roles, require_staff

router = APIRouter(prefix="/api/properties", tags=["properties"])

# Property catalogue reads: any staff. Writes: Admin only.
require_property_write = require_roles("admin")


# ─── GET /api/properties/analytics ───────────────────────────────────────────
# Placed before /{prop_id:int} so it won't collide

@router.get("/analytics", response_model=PropertyAnalyticsOut, summary="Company inventory analytics (Admin only)")
def get_inventory_analytics(
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    total = db.query(CRMProperty).count()
    available = db.query(CRMProperty).filter(CRMProperty.is_available == True).count()  # noqa: E712
    reserved = db.query(CRMProperty).filter(CRMProperty.status == "Reserved").count()
    sold = db.query(CRMProperty).filter(CRMProperty.status == "Sold").count()
    rented = db.query(CRMProperty).filter(CRMProperty.status == "Rented").count()
    verified = db.query(CRMProperty).filter(CRMProperty.verification_status == "verified").count()
    pending = db.query(CRMProperty).filter(CRMProperty.verification_status == "pending").count()

    total_val = float(db.query(func.coalesce(func.sum(CRMProperty.price_sale), 0.0)).scalar() or 0.0)

    # Calculate average price per sqft
    all_props = db.query(CRMProperty.price_sale, CRMProperty.size_sqft).filter(
        CRMProperty.price_sale > 0, CRMProperty.size_sqft > 0
    ).all()
    avg_sqft = (
        sum(p[0] / p[1] for p in all_props) / len(all_props)
        if all_props else 0.0
    )

    # Counts by type
    type_counts: Dict[str, int] = {}
    for pt, count in db.query(CRMProperty.property_type, func.count(CRMProperty.id)).group_by(CRMProperty.property_type).all():
        if pt:
            type_counts[str(pt)] = count

    # Counts by location
    loc_counts: Dict[str, int] = {}
    for loc, count in db.query(CRMProperty.location, func.count(CRMProperty.id)).group_by(CRMProperty.location).all():
        if loc:
            loc_counts[str(loc)] = count

    return PropertyAnalyticsOut(
        total_properties=total,
        available_count=available,
        reserved_count=reserved,
        sold_count=sold,
        rented_count=rented,
        verified_count=verified,
        pending_verification_count=pending,
        total_portfolio_value_aed=round(total_val, 2),
        avg_price_sqft=round(avg_sqft, 2),
        by_property_type=type_counts,
        by_location=loc_counts,
    )


# ─── POST /api/properties/import ──────────────────────────────────────────────

@router.post("/import", response_model=PropertyImportResult, summary="Import authorized dataset (Admin only)")
def import_properties_dataset(
    payload: List[PropertyImportRow],
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    imported = 0
    skipped = 0
    errors: List[str] = []

    for row in payload:
        try:
            clean_ref = row.ref_code.strip()
            if not clean_ref:
                errors.append(f"Row missing ref_code: {row.title}")
                continue

            existing = db.query(CRMProperty).filter(CRMProperty.ref_code == clean_ref).first()
            if existing:
                skipped += 1
                continue

            prop = CRMProperty(
                ref_code=clean_ref,
                title=row.title.strip(),
                property_type=row.property_type.strip(),
                listing_type=row.listing_type.strip(),
                location=row.location.strip(),
                community=row.community.strip() if row.community else None,
                bedrooms=row.bedrooms,
                bathrooms=row.bathrooms,
                size_sqft=row.size_sqft,
                price_sale=row.price_sale,
                price_rent_monthly=row.price_rent_monthly,
                description=row.description,
                amenities=row.amenities or [],
                near_metro=row.near_metro,
                near_beach=row.near_beach,
                view=row.view,
                status=row.status or "Available",
                is_available=row.is_available,
                image_url=row.image_url,
                verification_status="imported",
                document_status="pending",
            )
            db.add(prop)
            imported += 1
        except Exception as e:
            errors.append(f"Error importing {getattr(row, 'ref_code', 'unknown')}: {str(e)}")

    if imported > 0:
        db.commit()
        log_audit(db, ctx, "dataset_imported", "property_dataset", 0,
                  details={"processed": len(payload), "imported": imported, "skipped": skipped})

    return PropertyImportResult(
        success=len(errors) == 0,
        processed=len(payload),
        imported=imported,
        skipped_duplicates=skipped,
        errors=errors[:20],
    )


# ─── GET /api/properties ──────────────────────────────────────────────────────

@router.get("", response_model=List[PropertyOut], summary="List CRM properties")
def list_properties(
    location: Optional[str] = Query(None),
    listing_type: Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    bedrooms: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    verification_status: Optional[str] = Query(None),
    is_featured: Optional[bool] = Query(None),
    available_only: bool = Query(False),
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    q = db.query(CRMProperty)
    if available_only:
        q = q.filter(CRMProperty.is_available == True)  # noqa: E712
    if location:
        q = q.filter(CRMProperty.location.ilike(f"%{location}%"))
    if listing_type:
        q = q.filter(CRMProperty.listing_type == listing_type)
    if property_type:
        q = q.filter(CRMProperty.property_type == property_type)
    if bedrooms is not None:
        q = q.filter(CRMProperty.bedrooms == bedrooms)
    if status:
        q = q.filter(CRMProperty.status == status)
    if verification_status:
        q = q.filter(CRMProperty.verification_status == verification_status)
    if is_featured is not None:
        q = q.filter(CRMProperty.is_featured == is_featured)
    return q.order_by(CRMProperty.id.desc()).all()


# ─── POST /api/properties ─────────────────────────────────────────────────────

@router.post("", response_model=PropertyOut, status_code=201, summary="Add property (Admin only)")
def create_property(
    payload: PropertyCreate,
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    existing = db.query(CRMProperty).filter(CRMProperty.ref_code == payload.ref_code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Property {payload.ref_code} already exists.")

    data = payload.model_dump()
    # Default status to Available if is_available is true
    if "status" not in data or not data["status"]:
        data["status"] = "Available" if data.get("is_available", True) else "Reserved"
    prop = CRMProperty(**data)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    sync_crm_ad(db, prop)
    log_audit(db, ctx, "property_created", "property", prop.id,
              details={"ref_code": prop.ref_code, "listing_type": prop.listing_type})

    try:
        from app.services import notification_service
        notification_service.create_notification(
            db=db,
            recipient_role="all",
            title="New Property Added",
            message=f"New listing added: {prop.title} ({prop.ref_code}) in {prop.location}.",
            category="recommendations",
            notification_type="property_added",
            related_entity_type="property",
            related_entity_id=prop.id,
            action_url=f"/properties/{prop.id}",
        )
    except Exception as exc:
        logger.warning("Failed to broadcast property creation notification: %s", exc)

    return prop


# ─── PATCH /api/properties/:id ────────────────────────────────────────────────

@router.patch("/{prop_id:int}", response_model=PropertyOut, summary="Update property (Admin only)")
def update_property(
    prop_id: int,
    payload: PropertyUpdate,
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    prop = db.query(CRMProperty).filter(CRMProperty.id == prop_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)

    # Keep status and is_available synchronized
    if payload.status:
        prop.is_available = (payload.status.lower() == "available")
    elif payload.is_available is not None:
        prop.status = "Available" if payload.is_available else "Reserved"

    db.commit()
    db.refresh(prop)
    sync_crm_ad(db, prop)
    log_audit(db, ctx, "property_updated", "property", prop.id,
              details={"fields": sorted(payload.model_dump(exclude_unset=True).keys())})
    return prop


# ─── PATCH /api/properties/:id/verify ─────────────────────────────────────────

@router.patch("/{prop_id:int}/verify", response_model=PropertyOut, summary="Verify property listing (Admin only)")
def verify_property(
    prop_id: int,
    payload: Dict[str, Any],
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    prop = db.query(CRMProperty).filter(CRMProperty.id == prop_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    new_status = payload.get("verification_status", "verified")
    valid_statuses = ("verified", "pending", "unverified", "imported")
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid verification status. Must be one of {valid_statuses}")

    prop.verification_status = new_status
    if new_status == "verified":
        prop.document_status = "approved"

    db.commit()
    db.refresh(prop)
    log_audit(db, ctx, "property_verification_updated", "property", prop.id,
              details={"verification_status": new_status})
    return prop


# ─── PATCH /api/properties/:id/status ─────────────────────────────────────────

@router.patch("/{prop_id:int}/status", response_model=PropertyOut, summary="Update property status (Admin only)")
def update_property_status(
    prop_id: int,
    payload: Dict[str, Any],
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    prop = db.query(CRMProperty).filter(CRMProperty.id == prop_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    new_status = payload.get("status")
    valid_statuses = ("Available", "Reserved", "Sold", "Rented")
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

    prop.status = new_status
    prop.is_available = (new_status == "Available")

    db.commit()
    db.refresh(prop)
    sync_crm_ad(db, prop)
    log_audit(db, ctx, "property_status_updated", "property", prop.id,
              details={"status": new_status, "is_available": prop.is_available})

    try:
        from app.services import notification_service
        notification_service.create_notification(
            db=db,
            recipient_role="all",
            title="Property Status Changed",
            message=f"{prop.title} ({prop.ref_code}) is now {prop.status}.",
            category="recommendations",
            notification_type="property_status_changed",
            related_entity_type="property",
            related_entity_id=prop.id,
            action_url=f"/properties/{prop.id}",
        )
    except Exception as exc:
        logger.warning("Failed to broadcast property status notification: %s", exc)

    return prop


# ─── PATCH /api/properties/:id/featured ───────────────────────────────────────

@router.patch("/{prop_id:int}/featured", response_model=PropertyOut, summary="Toggle featured property (Admin only)")
def toggle_featured_property(
    prop_id: int,
    payload: Dict[str, Any],
    ctx: Dict[str, Any] = Depends(require_property_write),
    db: Session = Depends(get_db),
):
    prop = db.query(CRMProperty).filter(CRMProperty.id == prop_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")

    is_feat = bool(payload.get("is_featured", False))
    prop.is_featured = is_feat

    db.commit()
    db.refresh(prop)
    log_audit(db, ctx, "property_featured_updated", "property", prop.id,
              details={"is_featured": is_feat})
    return prop


# ─── GET /api/properties/:id ──────────────────────────────────────────────────

@router.get("/{prop_id:int}", response_model=PropertyOut, summary="Get single property")
def get_property(
    prop_id: int,
    ctx: Dict[str, Any] = Depends(require_staff),
    db: Session = Depends(get_db),
):
    prop = db.query(CRMProperty).filter(CRMProperty.id == prop_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found.")
    return prop
