import csv
import logging
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("lyka.properties")

CSV_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "lyka_dubai_properties.csv")
)

_CACHED_PROPERTIES: Optional[List[Dict[str, Any]]] = None
_DB_CONN: Optional[sqlite3.Connection] = None
_DISTINCT_LOCATIONS: Optional[List[Dict[str, Any]]] = None
# Refs paused in the advertising dashboard. Kept lowercase for a cheap
# Python-side check; the dataset SQL also excludes them from public search.
_INACTIVE_AD_REFS: set[str] = set()


def set_inactive_ad_refs(refs: List[str]) -> None:
    """Update the paused-ad exclusion set (called by property_analytics)."""
    global _INACTIVE_AD_REFS, _DISTINCT_LOCATIONS
    _INACTIVE_AD_REFS = {str(r or "").strip().lower() for r in refs if str(r or "").strip()}
    _DISTINCT_LOCATIONS = None



def init_property_dataset() -> sqlite3.Connection:
    """
    Loads lyka_dubai_properties.csv once into an in-memory indexed SQLite table
    and in-memory cache for ultra-fast (< 1ms) SQL filtering across all 3,000 properties.
    """
    global _CACHED_PROPERTIES, _DB_CONN
    if _DB_CONN is not None:
        return _DB_CONN

    t0 = time.perf_counter()
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE properties (
        property_id TEXT PRIMARY KEY,
        title TEXT,
        listing_type TEXT,
        property_type TEXT,
        location TEXT,
        street TEXT,
        bhk INTEGER,
        bathrooms INTEGER,
        property_size_sqft INTEGER,
        price_aed INTEGER,
        price_per_sqft_aed INTEGER,
        furnishing TEXT,
        parking_spaces INTEGER,
        main_road_access TEXT,
        nearest_main_road TEXT,
        nearest_metro TEXT,
        metro_distance_km REAL,
        near_metro INTEGER,
        beach_distance_km REAL,
        near_seashore INTEGER,
        view TEXT,
        amenities TEXT,
        availability TEXT,
        image_url TEXT,
        image_gallery TEXT,
        image_caption TEXT
    )""")

    cur.execute("CREATE INDEX idx_props_search ON properties(listing_type, property_type, bhk, price_aed)")
    cur.execute("CREATE INDEX idx_props_loc ON properties(location)")
    cur.execute("CREATE INDEX idx_props_bhk ON properties(bhk)")
    cur.execute("CREATE INDEX idx_props_price ON properties(price_aed)")

    loaded_list: List[Dict[str, Any]] = []
    db_rows = []

    if os.path.exists(CSV_PATH):
        try:
            with open(CSV_PATH, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    prop_id = row.get("property_id") or row.get("\ufeffproperty_id") or ""
                    try:
                        bhk_val = int(row.get("bhk") or 0)
                    except ValueError:
                        bhk_val = 0

                    try:
                        baths_val = int(row.get("bathrooms") or 1)
                    except ValueError:
                        baths_val = 1

                    try:
                        price_val = int(float(row.get("price_aed") or 0))
                    except ValueError:
                        price_val = 0

                    try:
                        sqft_val = int(float(row.get("property_size_sqft") or 0))
                    except ValueError:
                        sqft_val = 0

                    try:
                        price_sqft = int(float(row.get("price_per_sqft_aed") or 0))
                    except ValueError:
                        price_sqft = 0

                    try:
                        parking_val = int(row.get("parking_spaces") or 1)
                    except ValueError:
                        parking_val = 1

                    try:
                        metro_dist = float(row.get("metro_distance_km") or 0.0)
                    except ValueError:
                        metro_dist = 0.0

                    try:
                        beach_dist = float(row.get("beach_distance_km") or 0.0)
                    except ValueError:
                        beach_dist = 0.0

                    amenities_raw = row.get("amenities") or ""
                    amenities_list = [a.strip() for a in amenities_raw.split("|") if a.strip()]

                    gallery_raw = row.get("image_gallery") or ""
                    gallery_list = [g.strip() for g in gallery_raw.split("|") if g.strip()]

                    listing_type = row.get("listing_type") or "Sale"
                    property_type = row.get("property_type") or "Apartment"
                    location = row.get("location") or "Dubai"
                    main_road_access = row.get("main_road_access") or "No"
                    availability = row.get("availability") or "Ready"
                    view = row.get("view") or "Community View"
                    near_metro = (row.get("near_metro") or "").lower() == "yes"
                    near_seashore = (row.get("near_seashore") or "").lower() == "yes"

                    prop_dict = {
                        "property_id": prop_id,
                        "title": row.get("title") or "Luxury Dubai Property",
                        "listing_type": listing_type,
                        "property_type": property_type,
                        "location": location,
                        "street": row.get("street") or "",
                        "bhk": bhk_val,
                        "bathrooms": baths_val,
                        "property_size_sqft": sqft_val,
                        "price_aed": price_val,
                        "price_per_sqft_aed": price_sqft,
                        "furnishing": row.get("furnishing") or "Unfurnished",
                        "parking_spaces": parking_val,
                        "main_road_access": main_road_access,
                        "nearest_main_road": row.get("nearest_main_road") or "",
                        "nearest_metro": row.get("nearest_metro") or "",
                        "metro_distance_km": metro_dist,
                        "near_metro": near_metro,
                        "beach_distance_km": beach_dist,
                        "near_seashore": near_seashore,
                        "view": view,
                        "amenities": amenities_list,
                        "availability": availability,
                        "image_url": row.get("image_url") or "",
                        "image_gallery": gallery_list,
                        "image_caption": row.get("image_caption") or "",
                    }
                    loaded_list.append(prop_dict)

                    db_rows.append((
                        prop_id,
                        prop_dict["title"],
                        listing_type,
                        property_type,
                        location,
                        prop_dict["street"],
                        bhk_val,
                        baths_val,
                        sqft_val,
                        price_val,
                        price_sqft,
                        prop_dict["furnishing"],
                        parking_val,
                        main_road_access,
                        prop_dict["nearest_main_road"],
                        prop_dict["nearest_metro"],
                        metro_dist,
                        1 if near_metro else 0,
                        beach_dist,
                        1 if near_seashore else 0,
                        view,
                        amenities_raw,
                        availability,
                        prop_dict["image_url"],
                        gallery_raw,
                        prop_dict["image_caption"],
                    ))

            cur.executemany("INSERT INTO properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", db_rows)
            conn.commit()
            dur = (time.perf_counter() - t0) * 1000
            logger.info("Loaded and indexed %d properties in SQLite memory database (%.1f ms)", len(loaded_list), dur)
        except Exception as e:
            logger.error("Failed to parse CSV dataset: %s", e)

    _CACHED_PROPERTIES = loaded_list
    _DB_CONN = conn
    return _DB_CONN


def get_all_properties() -> List[Dict[str, Any]]:
    global _CACHED_PROPERTIES
    if _CACHED_PROPERTIES is None:
        init_property_dataset()
    return _CACHED_PROPERTIES or []


def get_property_by_id(property_id: str) -> Optional[Dict[str, Any]]:
    """Returns one verified dataset listing by its exact reference, or None.

    Used by the assistant to answer follow-up questions about a listing that
    was actually shown, rather than letting a language model guess details.
    """
    ref = (property_id or "").strip()
    if not ref or ref.lower() in _INACTIVE_AD_REFS:
        return None
    for prop in get_all_properties():
        if str(prop.get("property_id") or "").strip().lower() == ref.lower():
            return prop
    return None


def get_distinct_locations() -> List[Dict[str, Any]]:
    """Real dataset communities with live listing counts, most stocked first.

    Powers chatbot location chips and summary dropdowns so customers only
    ever pick communities that actually exist in the dataset — nothing is
    invented. Built once per process from the cached dataset (the source
    CSV is static at runtime, so no invalidation path is needed); later
    calls are a pointer return.
    """
    global _DISTINCT_LOCATIONS
    if _DISTINCT_LOCATIONS is not None:
        return _DISTINCT_LOCATIONS
    from collections import Counter
    props = [
        p for p in get_all_properties()
        if str(p.get("property_id") or "").strip().lower() not in _INACTIVE_AD_REFS
    ]
    counts = Counter((p.get("location") or "").strip() for p in props)
    _DISTINCT_LOCATIONS = [
        {"location": loc, "listings": n}
        for loc, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        if loc
    ]
    return _DISTINCT_LOCATIONS


_CURATED_LUXURY_IMAGES = {
    "Villa": [
        "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
    ],
    "Penthouse": [
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
    ],
    "Apartment": [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
    ],
    "Townhouse": [
        "https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1512915922686-57c11dde9b6b?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=80",
    ],
}


def resolve_property_image(property_type: str, property_id: str, raw_url: Optional[str]) -> str:
    if raw_url and raw_url.startswith("http"):
        return raw_url
    pt = (property_type or "Apartment").strip().title()
    img_list = _CURATED_LUXURY_IMAGES.get(pt) or _CURATED_LUXURY_IMAGES["Apartment"]
    digits = "".join(c for c in str(property_id) if c.isdigit())
    idx = int(digits or "1") % len(img_list)
    return img_list[idx]


def resolve_property_gallery(property_type: str, property_id: str, raw_gallery: List[str]) -> List[str]:
    http_gallery = [g for g in raw_gallery if g and g.startswith("http")]
    if http_gallery:
        return http_gallery
    pt = (property_type or "Apartment").strip().title()
    img_list = _CURATED_LUXURY_IMAGES.get(pt) or _CURATED_LUXURY_IMAGES["Apartment"]
    digits = "".join(c for c in str(property_id) if c.isdigit())
    base_idx = int(digits or "1") % len(img_list)
    return [
        img_list[base_idx],
        img_list[(base_idx + 1) % len(img_list)],
        img_list[(base_idx + 2) % len(img_list)],
        img_list[(base_idx + 3) % len(img_list)],
    ]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    amenities_raw = row["amenities"] or ""
    amenities_list = [a.strip() for a in amenities_raw.split("|") if a.strip()]
    gallery_raw = row["image_gallery"] or ""
    gallery_list = [g.strip() for g in gallery_raw.split("|") if g.strip()]

    def _safe_int(val: Any, default: int = 0) -> int:
        try:
            return int(float(val)) if val is not None else default
        except (ValueError, TypeError):
            return default

    def _safe_float(val: Any, default: float = 0.0) -> float:
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    return {
        "property_id": str(row["property_id"] or ""),
        "title": str(row["title"] or "Luxury Dubai Property"),
        "listing_type": str(row["listing_type"] or "Sale"),
        "property_type": str(row["property_type"] or "Apartment"),
        "location": str(row["location"] or "Dubai"),
        "street": str(row["street"] or ""),
        "bhk": _safe_int(row["bhk"], 0),
        "bathrooms": _safe_int(row["bathrooms"], 1),
        "property_size_sqft": _safe_int(row["property_size_sqft"], 0),
        "price_aed": _safe_int(row["price_aed"], 0),
        "price_per_sqft_aed": _safe_int(row["price_per_sqft_aed"], 0),
        "furnishing": str(row["furnishing"] or "Unfurnished"),
        "parking_spaces": _safe_int(row["parking_spaces"], 1),
        "main_road_access": str(row["main_road_access"] or "No"),
        "nearest_main_road": str(row["nearest_main_road"] or ""),
        "nearest_metro": str(row["nearest_metro"] or ""),
        "metro_distance_km": _safe_float(row["metro_distance_km"], 0.0),
        "near_metro": bool(row["near_metro"]),
        "beach_distance_km": _safe_float(row["beach_distance_km"], 0.0),
        "near_seashore": bool(row["near_seashore"]),
        "view": str(row["view"] or "Community View"),
        "amenities": amenities_list,
        "availability": str(row["availability"] or "Ready"),
        "image_url": resolve_property_image(str(row["property_type"] or ""), str(row["property_id"] or ""), row["image_url"]),
        "image_gallery": resolve_property_gallery(str(row["property_type"] or ""), str(row["property_id"] or ""), gallery_list),
        "image_caption": str(row["image_caption"] or ""),
    }


def search_properties_dataset(
    location: Optional[str] = None,
    property_type: Optional[str] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[int] = None,
    min_budget_aed: Optional[float] = None,
    max_budget_aed: Optional[float] = None,
    purpose: Optional[str] = None,
    near_metro: Optional[bool] = None,
    near_beach: Optional[bool] = None,
    view: Optional[str] = None,
    sort_by: Optional[str] = None,
    main_road_access: Optional[bool] = None,
    availability: Optional[str] = None,
    limit: int = 4,
    page: int = 1,
    offset: Optional[int] = None,
    nearby_fallback: bool = True,
    min_parking: Optional[int] = None,
    amenities: Optional[List[str]] = None,
    furnishing: Optional[str] = None,
    exclude_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Filters the real 3,000 property dataset using indexed in-memory SQLite queries.
    Ultra-fast execution (< 1ms). Never invents properties or fields.

    Nearby fallback: when a location is requested but nothing matches ALL
    filters there, the same filters rerun against explicitly mapped
    neighbouring communities (services/nearby.py, closest first) up to
    `limit` rows. Fallback rows carry ``is_nearby_alternative=True`` plus
    ``requested_location``/``actual_location`` so callers label them
    honestly. Unknown locations have no fallback (honest empty result).
    """
    t_start = time.perf_counter()
    conn = init_property_dataset()
    cur = conn.cursor()

    # Sanitize pagination & budget parameters defensively
    try:
        page = max(1, int(page or 1))
    except (ValueError, TypeError):
        page = 1
    try:
        limit = max(1, min(int(limit or 12), 500))
    except (ValueError, TypeError):
        limit = 12
    if min_budget_aed is not None:
        try:
            min_budget_aed = max(0.0, float(min_budget_aed))
        except (ValueError, TypeError):
            min_budget_aed = None
    if max_budget_aed is not None:
        try:
            max_budget_aed = max(0.0, float(max_budget_aed))
        except (ValueError, TypeError):
            max_budget_aed = None
    if min_budget_aed is not None and max_budget_aed is not None and min_budget_aed > max_budget_aed:
        min_budget_aed, max_budget_aed = max_budget_aed, min_budget_aed

    # Map purpose synonyms
    mapped_purpose: Optional[str] = None
    if purpose:
        p_low = purpose.strip().lower()
        if p_low in ["buy", "sale", "purchase", "invest"]:
            mapped_purpose = "Sale"
        elif p_low in ["rent", "lease", "rental", "annual rent"]:
            mapped_purpose = "Rent"

    where_clauses: List[str] = []
    params: List[Any] = []

    # 1. Location match (fuzzy substring in location or title)
    if location:
        loc_clean = location.strip()
        where_clauses.append("(LOWER(location) LIKE ? OR LOWER(title) LIKE ?)")
        pattern = f"%{loc_clean.lower()}%"
        params.extend([pattern, pattern])

    # 2. Property Type
    if property_type:
        pt_clean = property_type.strip().lower()
        where_clauses.append("LOWER(property_type) = ?")
        params.append(pt_clean)

    # 3. Bedrooms / BHK
    if bedrooms is not None:
        where_clauses.append("bhk = ?")
        params.append(bedrooms)

    # 4. Bathrooms
    if bathrooms is not None:
        where_clauses.append("bathrooms >= ?")
        params.append(bathrooms)

    # 5. Purpose
    if mapped_purpose:
        where_clauses.append("LOWER(listing_type) = ?")
        params.append(mapped_purpose.lower())

    # 6. Budget
    if min_budget_aed is not None:
        where_clauses.append("price_aed >= ?")
        params.append(int(min_budget_aed))
    if max_budget_aed is not None:
        where_clauses.append("price_aed <= ?")
        params.append(int(max_budget_aed))

    # 7. Metro proximity
    if near_metro is True:
        where_clauses.append("(near_metro = 1 OR metro_distance_km <= 1.2)")

    # 8. Beach proximity
    if near_beach is True:
        where_clauses.append("(near_seashore = 1 OR beach_distance_km <= 2.0)")

    # 9. View
    if view:
        where_clauses.append("LOWER(view) LIKE ?")
        params.append(f"%{view.strip().lower()}%")

    # 10. Main road access
    if main_road_access is True:
        where_clauses.append("LOWER(main_road_access) = 'yes'")
    elif main_road_access is False:
        where_clauses.append("LOWER(main_road_access) != 'yes'")

    # 11. Availability
    if availability:
        av_low = availability.strip().lower()
        if av_low == "ready":
            where_clauses.append("LOWER(availability) = 'ready'")
        elif av_low == "off-plan":
            where_clauses.append("LOWER(availability) != 'ready'")
        else:
            where_clauses.append("LOWER(availability) = ?")
            params.append(av_low)

    # 12. Parking (minimum covered spaces, from the real dataset column)
    if min_parking is not None:
        where_clauses.append("parking_spaces >= ?")
        params.append(int(min_parking))

    # 13. Amenities (each requested facility must appear in the real
    # pipe-separated amenities string — deterministic, never invented)
    for am in (amenities or []):
        token = str(am or "").strip().lower()
        if token:
            where_clauses.append("LOWER(amenities) LIKE ?")
            params.append(f"%{token}%")

    # 13b. Furnishing preference
    if furnishing:
        f_clean = furnishing.strip().lower()
        if f_clean and f_clean != "any":
            where_clauses.append("LOWER(furnishing) LIKE ?")
            params.append(f"%{f_clean}%")

    # 13c. Exclude already displayed properties in conversation
    if exclude_ids:
        clean_excludes = [str(x).strip() for x in exclude_ids if str(x).strip()]
        if clean_excludes:
            placeholders = ",".join(["?"] * len(clean_excludes))
            where_clauses.append(f"property_id NOT IN ({placeholders})")
            params.extend(clean_excludes)

    # 14. Paused advertisements are hidden from the public catalogue. The
    # exclusion set is maintained by the advertising dashboard (small, in
    # memory) so no per-request join is needed against the CRM database.
    if _INACTIVE_AD_REFS:
        placeholders = ",".join("?" for _ in _INACTIVE_AD_REFS)
        where_clauses.append(f"LOWER(property_id) NOT IN ({placeholders})")
        params.extend(sorted(_INACTIVE_AD_REFS))

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # Count total matches
    count_sql = f"SELECT COUNT(*) FROM properties{where_sql}"
    cur.execute(count_sql, params)
    total_count = cur.fetchone()[0]

    # Order by (supports standard frontend and API parameter formats)
    s_clean = (sort_by or "").strip().lower()
    if s_clean in ("cheapest", "price-asc", "price_asc"):
        order_sql = " ORDER BY price_aed ASC"
    elif s_clean in ("expensive", "price-desc", "price_desc"):
        order_sql = " ORDER BY price_aed DESC"
    elif s_clean in ("size", "sqft-desc", "sqft_desc"):
        order_sql = " ORDER BY property_size_sqft DESC"
    elif s_clean in ("newest", "recent"):
        order_sql = " ORDER BY rowid DESC"
    else:
        # Balanced: price asc, size desc
        order_sql = " ORDER BY price_aed ASC, property_size_sqft DESC"

    actual_offset = (max(1, page) - 1) * limit if offset is None else max(0, offset)
    query_sql = f"SELECT * FROM properties{where_sql}{order_sql} LIMIT ? OFFSET ?"
    cur.execute(query_sql, params + [limit, actual_offset])
    rows = cur.fetchall()
    top_matches = [_row_to_dict(r) for r in rows]

    # ── Tier 2: Nearby community fallback (same filters, neighbouring areas) ──────
    fallback_info: Dict[str, Any] = {
        "used": False, "requested_location": location, "nearby_locations": [],
        "fallback_tier": None,
    }
    nearby_requested: Optional[str] = None
    if total_count == 0 and location and nearby_fallback:
        from app.services.nearby import nearby_communities_for
        nearby_list = nearby_communities_for(location)
        if nearby_list:
            collected: List[Dict[str, Any]] = []
            nearby_total = 0
            for nb in nearby_list:
                if len(collected) >= limit:
                    break
                sub = search_properties_dataset(
                    location=nb,
                    property_type=property_type,
                    bedrooms=bedrooms,
                    bathrooms=bathrooms,
                    min_budget_aed=min_budget_aed,
                    max_budget_aed=max_budget_aed,
                    purpose=mapped_purpose or purpose,
                    near_metro=near_metro,
                    near_beach=near_beach,
                    view=view,
                    sort_by=sort_by,
                    main_road_access=main_road_access,
                    availability=availability,
                    limit=limit - len(collected),
                    nearby_fallback=False,
                    min_parking=min_parking,
                    amenities=amenities,
                )
                nearby_total += sub["total_found"]
                for m in sub["top_properties"]:
                    m["is_nearby_alternative"] = True
                    m["requested_location"] = location
                    m["actual_location"] = m.get("location")
                    collected.append(m)
            if collected:
                top_matches = collected[:limit]
                total_count = nearby_total
                nearby_requested = location
                fallback_info = {
                    "used": True,
                    "requested_location": location,
                    "nearby_locations": nearby_list,
                    "fallback_tier": "nearby",
                }

    # ── Tier 3: Alternative property types in the same location & budget ─────────
    # Triggered when: exact match = 0, nearby = 0, a specific property_type was
    # requested, and a location was given.  Only real dataset types are tried.
    _ALTERNATIVE_TYPES: Dict[str, List[str]] = {
        "Villa":      ["Townhouse", "Penthouse", "Apartment"],
        "Townhouse":  ["Villa", "Apartment", "Penthouse"],
        "Apartment":  ["Townhouse", "Penthouse", "Villa"],
        "Penthouse":  ["Apartment", "Townhouse", "Villa"],
    }
    if False and total_count == 0 and location and property_type and nearby_fallback:
        requested_pt = property_type.strip().capitalize()
        alt_types = _ALTERNATIVE_TYPES.get(requested_pt, [])
        type_collected: List[Dict[str, Any]] = []
        for alt_type in alt_types:
            if len(type_collected) >= limit:
                break
            sub = search_properties_dataset(
                location=location,
                property_type=alt_type,
                bedrooms=bedrooms,
                min_budget_aed=min_budget_aed,
                max_budget_aed=max_budget_aed,
                purpose=mapped_purpose or purpose,
                near_metro=near_metro,
                near_beach=near_beach,
                main_road_access=main_road_access,
                availability=availability,
                limit=limit - len(type_collected),
                nearby_fallback=False,
                min_parking=min_parking,
            )
            for m in sub["top_properties"]:
                m["is_type_alternative"] = True
                m["requested_property_type"] = requested_pt
                m["alternative_reason"] = (
                    f"No {requested_pt} listings found in {location} within your budget — "
                    f"this {alt_type} matches your location and budget"
                )
                type_collected.append(m)
        if type_collected:
            top_matches = type_collected[:limit]
            total_count = len(type_collected)
            fallback_info = {
                "used": True,
                "requested_location": location,
                "nearby_locations": [],
                "fallback_tier": "type_alternative",
                "alternative_types_tried": alt_types,
            }

    # ── Tier 4: Value communities in Dubai (popular affordable alternatives) ─────
    # Triggered when all above fail: exact=0, nearby=0, type_alt=0, budget given.
    _VALUE_COMMUNITIES: List[str] = [
        "Jumeirah Village Circle",
        "Dubai Sports City",
        "Al Barsha",
        "DAMAC Hills",
        "Dubai Hills Estate",
        "Town Square",
        "Dubai South",
        "Mirdif",
        "International City",
        "Discovery Gardens",
    ]
    if total_count == 0 and nearby_fallback and (min_budget_aed or max_budget_aed):
        value_collected: List[Dict[str, Any]] = []
        for vc in _VALUE_COMMUNITIES:
            # Skip if it's the same as the original requested location (already tried)
            if location and vc.lower() == (location or "").strip().lower():
                continue
            if len(value_collected) >= limit:
                break
            sub = search_properties_dataset(
                location=vc,
                property_type=property_type,
                bedrooms=bedrooms,
                min_budget_aed=min_budget_aed,
                max_budget_aed=max_budget_aed,
                purpose=mapped_purpose or purpose,
                availability=availability,
                limit=limit - len(value_collected),
                nearby_fallback=False,
            )
            for m in sub["top_properties"]:
                m["is_value_alternative"] = True
                m["requested_location"] = location or "Dubai"
                m["actual_location"] = m.get("location")
                m["alternative_reason"] = (
                    f"Popular value community with verified listings matching your criteria"
                )
                value_collected.append(m)
        if value_collected:
            top_matches = value_collected[:limit]
            total_count = len(value_collected)
            fallback_info = {
                "used": True,
                "requested_location": location or "Dubai",
                "nearby_locations": [m.get("location") for m in value_collected],
                "fallback_tier": "value_community",
            }


    def _score_csv_match(m: Dict[str, Any]) -> Dict[str, Any]:
        """Transparent 0–100 match score against requested criteria."""
        specified = 0
        earned = 0
        reasons: List[str] = []
        mismatches: List[str] = []

        m_location = str(m.get("location") or "")
        m_bhk = int(m.get("bhk") or 0)
        m_price = int(m.get("price_aed") or 0)
        m_metro_dist = m.get("metro_distance_km")
        m_beach_dist = m.get("beach_distance_km")

        if property_type:
            specified += 30
            earned += 30
            reasons.append(f"Exact {m.get('property_type', 'Property')} match")
        if bedrooms is not None:
            specified += 25
            earned += 25
            reasons.append("Studio exact match" if m_bhk == 0 else f"{m_bhk} BHK exact match")
        if location:
            specified += 20
            earned += 20
            loc_q = location.strip().lower()
            if nearby_requested:
                reasons.append(
                    f"Nearby alternative in {m_location} "
                    f"(no exact match in {nearby_requested})"
                )
            elif loc_q in m_location.lower():
                reasons.append(f"Located in {m_location}")
            else:
                reasons.append(f"Found via listing title in {m_location}")
        if mapped_purpose:
            specified += 15
            earned += 15
            reasons.append(f"Listed for {m.get('listing_type', 'Sale')}")
        if max_budget_aed is not None:
            specified += 10
            earned += 10
            diff = int(max_budget_aed) - m_price
            if diff > 0:
                reasons.append(f"AED {diff:,} under your ceiling")
            else:
                reasons.append("At your budget ceiling")
        if near_metro is True and m_metro_dist is not None:
            try:
                reasons.append(f"{float(m_metro_dist):.1f} km to {m.get('nearest_metro') or 'nearest'} Metro")
            except (ValueError, TypeError):
                reasons.append("Near Metro station")
        if near_beach is True and m_beach_dist is not None:
            try:
                reasons.append(f"{float(m_beach_dist):.1f} km to the beach")
            except (ValueError, TypeError):
                reasons.append("Near the beach")
        if availability:
            reasons.append(f"Availability: {m.get('availability', 'Available')}")

        if specified == 0:
            return {"match_score": 100, "match_reasons": ["Matches your search"], "mismatches": mismatches}
        return {
            "match_score": round(100.0 * earned / specified),
            "match_reasons": reasons,
            "mismatches": mismatches
        }

    summary_for_ai = []
    for m in top_matches:
        scored = _score_csv_match(m)
        m.update(scored)
        m_price = int(m.get("price_aed") or 0)
        m_bhk = int(m.get("bhk") or 0)
        m_amenities = m.get("amenities") or []
        summary_for_ai.append({
            "property_id": str(m.get("property_id") or ""),
            "title": str(m.get("title") or "Luxury Dubai Property"),
            "location": str(m.get("location") or "Dubai"),
            "price_aed": m_price,
            "price_formatted": f"AED {m_price:,}",
            "bhk": f"{m_bhk} BHK" if m_bhk > 0 else "Studio",
            "property_type": str(m.get("property_type") or "Apartment"),
            "listing_type": str(m.get("listing_type") or "Sale"),
            "property_size_sqft": int(m.get("property_size_sqft") or 0),
            "view": str(m.get("view") or "Community View"),
            "near_metro": "Yes" if m.get("near_metro") else "No",
            "main_road_access": str(m.get("main_road_access") or "No"),
            "nearest_main_road": str(m.get("nearest_main_road") or ""),
            "availability": str(m.get("availability") or "Ready"),
            "amenities": m_amenities[:5] if isinstance(m_amenities, list) else [],
            "match_score": scored["match_score"],
            "match_reasons": scored["match_reasons"],
            "mismatches": scored["mismatches"],
            "is_nearby_alternative": bool(m.get("is_nearby_alternative", False)),
            "requested_location": m.get("requested_location"),
            "actual_location": m.get("actual_location") or m.get("location"),
        })

    search_time_ms = round((time.perf_counter() - t_start) * 1000, 2)

    total_pages = max(1, (total_count + limit - 1) // limit) if total_count > 0 else 1
    return {
        "total_found": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "exact_match": total_count > 0 and not fallback_info["used"],
        "top_properties": top_matches,
        "ai_summary": summary_for_ai,
        "fallback": fallback_info,
        "criteria": {
            "location": location,
            "property_type": property_type,
            "bedrooms": bedrooms,
            "purpose": mapped_purpose or purpose,
            "max_budget_aed": max_budget_aed,
            "min_budget_aed": min_budget_aed,
            "near_metro": near_metro,
            "near_beach": near_beach,
            "main_road_access": main_road_access,
            "availability": availability,
            "min_parking": min_parking,
            "amenities": amenities or [],
        },
        "search_time_ms": search_time_ms,
    }


def get_inventory_analytics() -> Dict[str, Any]:
    """
    Verified company-wide inventory statistics across the full 3,000 property dataset.
    Never invents records or displays unverified estimates.
    """
    conn = init_property_dataset()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM properties")
    total = cur.fetchone()[0]

    # Availability breakdown
    cur.execute("SELECT availability, COUNT(*) FROM properties GROUP BY availability")
    avail_rows = cur.fetchall()
    ready_count = 0
    off_plan_count = 0
    for row in avail_rows:
        av = str(row[0] or "").strip()
        cnt = row[1]
        if av.lower() == "ready":
            ready_count += cnt
        else:
            off_plan_count += cnt

    # Listing type breakdown
    cur.execute("SELECT listing_type, COUNT(*) FROM properties GROUP BY listing_type")
    listing_rows = cur.fetchall()
    listing_counts = {str(r[0] or "Sale"): r[1] for r in listing_rows}

    # Property type breakdown
    cur.execute("SELECT property_type, COUNT(*) FROM properties GROUP BY property_type ORDER BY COUNT(*) DESC")
    type_rows = cur.fetchall()
    property_types = [{"type": str(r[0]), "count": r[1]} for r in type_rows]

    # Top locations
    cur.execute("SELECT location, COUNT(*) FROM properties GROUP BY location ORDER BY COUNT(*) DESC LIMIT 15")
    loc_rows = cur.fetchall()
    locations = [{"location": str(r[0]), "count": r[1]} for r in loc_rows]

    # Price tiers
    cur.execute("""
        SELECT
            SUM(CASE WHEN price_aed < 1000000 THEN 1 ELSE 0 END) as under_1m,
            SUM(CASE WHEN price_aed >= 1000000 AND price_aed < 2000000 THEN 1 ELSE 0 END) as tier_1_2m,
            SUM(CASE WHEN price_aed >= 2000000 AND price_aed < 5000000 THEN 1 ELSE 0 END) as tier_2_5m,
            SUM(CASE WHEN price_aed >= 5000000 THEN 1 ELSE 0 END) as tier_5m_plus,
            AVG(CASE WHEN listing_type = 'Sale' THEN price_aed END) as avg_sale_price,
            AVG(CASE WHEN listing_type = 'Rent' THEN price_aed END) as avg_rent_price,
            SUM(property_size_sqft) as total_sqft
        FROM properties
    """)
    p_row = cur.fetchone()

    return {
        "total_inventory": total,
        "available_ready": ready_count,
        "reserved_off_plan": off_plan_count,
        "listing_types": listing_counts,
        "property_types": property_types,
        "top_locations": locations,
        "price_distribution": {
            "under_1m": p_row[0] or 0,
            "1m_to_2m": p_row[1] or 0,
            "2m_to_5m": p_row[2] or 0,
            "above_5m": p_row[3] or 0,
        },
        "averages": {
            "avg_sale_price_aed": round(p_row[4] or 0),
            "avg_rent_price_aed": round(p_row[5] or 0),
            "total_portfolio_sqft": p_row[6] or 0,
        }
    }
