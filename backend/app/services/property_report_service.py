"""
LYKA Realty — Property Analytics / Reporting Service.

Builds dataset-only property reports from the verified in-memory LYKA Dubai
property dataset (``lyka_dubai_properties.csv``) that backs the public
property tools.

Design rules honoured here:
  - Every number in a report comes from real dataset rows; nothing is invented,
    extrapolated, or approximated beyond arithmetic on real rows.
  - No market trends, live prices, availability, rental yields, or investment
    guarantees are produced — the report only reports dataset-level summary
    statistics and is explicitly marked as such.
  - No CRM or customer data ever enters this service.

Reports are exposed to the customer-facing AI through the approved
public-property tool only; internal CRM metrics live on staff-only routes
(see routers/leads.py ``/stats`` and routers/staff.py).
"""
import logging
import os
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from statistics import mean, median

from app.services.property_service import CSV_PATH, get_all_properties

logger = logging.getLogger("lyka.property_report")

REPORT_DISCLAIMER = (
    "Report generated from LYKA's verified Dubai property dataset. Figures are "
    "dataset-level summary statistics only; no market trends, live prices, "
    "availability, rental yields or investment guarantees are implied or offered."
)


def _safe(s: Optional[str]) -> str:
    return (s or "").strip()


def _to_float(val: Any) -> Optional[float]:
    try:
        if val is None or val == "":
            return None
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_int(val: Any) -> Optional[int]:
    try:
        if val is None or val == "":
            return None
        return int(float(str(val).replace(",", "").strip()))
    except (ValueError, TypeError):
        return None


def dataset_timestamp() -> Dict[str, Any]:
    """Timestamp of the underlying verified dataset (CSV file mtime)."""
    info: Dict[str, Any] = {
        "source": "lyka_dubai_properties.csv",
        "path": CSV_PATH,
        "modified_at": None,
        "row_count": 0,
    }
    try:
        info["modified_at"] = datetime.fromtimestamp(os.path.getmtime(CSV_PATH), tz=timezone.utc).isoformat()
    except Exception:
        info["modified_at"] = None
    return info


def build_property_report(top_communities: int = 12) -> Dict[str, Any]:
    """Compute a read-only analytics report from the verified property dataset."""
    t0 = time.perf_counter()
    props: List[Dict[str, Any]] = get_all_properties() or []
    dt = dataset_timestamp()
    dt["row_count"] = len(props)

    generated_at = datetime.now(timezone.utc)
    total = len(props)

    report: Dict[str, Any] = {
        "generated_at": generated_at.isoformat(),
        "data_timestamp": dt,
        "disclaimer": REPORT_DISCLAIMER,
        "total_listings": total,
        "insufficient_data": total == 0,
        "counts_by_community": [],
        "price_summary": {},
        "asking_price_summary": {},
        "asking_price_summary_by_listing_type": {},
        "price_per_sqft": {},
        "property_type_distribution": {},
        "listing_type_distribution": {},
    }

    if total == 0:
        report["price_per_sqft"] = {"valid_rows": 0, "message": "Insufficient data"}
        return report

    # ── Counts by community ──────────────────────────────────────────────────
    community_counts: Counter = Counter()
    for p in props:
        loc = _safe(p.get("location"))
        if loc:
            community_counts[loc] += 1
    top_communities_n = max(1, int(top_communities or 12))
    report["counts_by_community"] = [
        {"location": loc, "count": n}
        for loc, n in sorted(community_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top_communities_n]
    ]

    # ── Price statistics ─────────────────────────────────────────────────────
    def _stats(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        prices = [_to_float(p.get("price_aed")) for p in rows]
        prices = [x for x in prices if x is not None and x > 0]
        if not prices:
            return {"count": 0, "min": None, "max": None, "median": None, "mean": None}
        return {
            "count": len(prices),
            "min": min(prices),
            "max": max(prices),
            "median": median(prices),
            "mean": mean(prices),
        }

    sale_rows = [p for p in props if (_safe(p.get("listing_type")) or "Sale") == "Sale"]
    rent_rows = [p for p in props if (_safe(p.get("listing_type")) or "") == "Rent"]
    report["price_summary"] = {
        "sale": _stats(sale_rows),
        "rent": _stats(rent_rows),
        "all": _stats(props),
    }

    def _asking(rows: List[Dict[str, Any]], key: str) -> Dict[str, Any]:
        vals = [_to_float(p.get(key)) for p in rows]
        vals = [x for x in vals if x is not None and x > 0]
        if not vals:
            return {"count": len(rows), "min": None, "max": None, "median": None, "mean": None}
        return {"count": len(vals), "min": min(vals), "max": max(vals), "median": median(vals), "mean": mean(vals)}

    report["asking_price_summary"] = _asking(props, "price_aed")
    report["asking_price_summary_by_listing_type"] = {
        "Sale": _asking(sale_rows, "price_aed"),
        "Rent": _asking(rent_rows, "price_aed"),
    }

    # ── Price per square foot (only where valid area data exists) ──────────
    sqft_rows = [
        p for p in props
        if (_to_float(p.get("property_size_sqft")) or 0) > 0
        and (_to_float(p.get("price_per_sqft_aed")) or 0) > 0
    ]
    sqfps = [_to_float(p.get("price_per_sqft_aed")) for p in sqft_rows]
    report["price_per_sqft"] = {
        "valid_rows": len(sqfps),
        "sqft_min": _to_float(sqft_rows[0].get("property_size_sqft")) if sqft_rows else None,
        "price_per_sqft_min": min(sqfps) if sqfps else None,
        "price_per_sqft_max": max(sqfps) if sqfps else None,
        "price_per_sqft_median": median(sqfps) if sqfps else None,
        "price_per_sqft_mean": mean(sqfps) if sqfps else None,
    }

    # ── Distributions ───────────────────────────────────────────────────────
    lt_counter: Counter = Counter()
    pt_counter: Counter = Counter()
    for p in props:
        lt_counter[_safe(p.get("listing_type")) or "Unknown"] += 1
        pt_counter[_safe(p.get("property_type")) or "Unknown"] += 1
    report["listing_type_distribution"] = dict(sorted(lt_counter.items()))
    report["property_type_distribution"] = dict(sorted(pt_counter.items()))

    report["stats_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    return report


def format_property_report_reply(report: Dict[str, Any]) -> str:
    """Deterministic human-readable reply built ONLY from report figures."""
    if report.get("insufficient_data"):
        return (
            "I'm sorry — the property knowledge base currently has no verified listings "
            "to report on. Please check back later or contact LYKA Realty directly."
        )
    lines: List[str] = [
        "Here is the latest verified property report from LYKA Realty:",
        f"- Verified listings in our knowledge base: {report.get('total_listings')}",
        "- Properties by community:",
    ]
    for row in report.get("counts_by_community") or []:
        lines.append(f"  • {row.get('location')}: {row.get('count')} listing(s)")
    for lt, st in (report.get("price_summary") or {}).items():
        if st and st.get("count"):
            lines.append(
                f"- {lt.title()} properties — asking price AED {st.get('min')} to {st.get('max')} "
                f"(median {st.get('median')})"
            )
    app_ = report.get("asking_price_summary") or {}
    lines.append(
        f"- Average asking price: AED {app_.get('mean')} (range {app_.get('min')} – {app_.get('max')}) across {app_.get('count')} listing(s)"
    )
    pp = report.get("price_per_sqft") or {}
    if pp.get("valid_rows"):
        lines.append(
            f"- Valid price-per-square-foot data available for {pp.get('valid_rows')} listing(s): "
            f"AED {pp.get('price_per_sqft_median')} median / {pp.get('price_per_sqft_mean')} mean per sq ft."
        )
    lines.append(
        f"- Property types in dataset: {', '.join(f'{k} ({v})' for k, v in (report.get('property_type_distribution') or {}).items()) or 'n/a'}"
    )
    lines.append("- This is a dataset summary only, not a forecast or investment advice.")
    return "\n".join(lines)
