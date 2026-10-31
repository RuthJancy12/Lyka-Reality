import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Customer portal + acquisition-channel regression tests (temp DB).

Profile load/save, UID ownership isolation, staff directory auth,
channel filtering/reporting, offline-safe validation. No new tables.
Run: python test_customer_portal.py
"""
import os
import tempfile
from unittest.mock import patch

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

import app.services.roles as roles  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CustomerProfile, Lead, StaffUser  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

init_db()
db = SessionLocal()
db.add_all([
    StaffUser(email="admin@c.ae", name="AD", role="admin", is_active=True),
    StaffUser(email="mgr@c.ae", name="MG", role="manager", is_active=True),
    StaffUser(email="sm@c.ae", name="SM", role="sales_manager", is_active=True),
    StaffUser(email="sp@c.ae", name="SP", role="salesperson", is_active=True,
              manager_email="sm@c.ae"),
    # One lead per channel: Google, Instagram, Facebook, Referral, Direct, Unknown.
    Lead(raw_enquiry_text="g", contact_email="g@x.ae", utm_source="google",
         utm_medium="cpc", status="new"),
    Lead(raw_enquiry_text="i", contact_email="i@x.ae", utm_source="Instagram",
         status="new"),
    Lead(raw_enquiry_text="f", contact_email="f@x.ae", utm_source="fb",
         status="new"),
    Lead(raw_enquiry_text="r", contact_email="r@x.ae",
         referrer="https://partner.example/deal", status="new"),
    Lead(raw_enquiry_text="d", contact_email="d@x.ae", status="new"),
    Lead(raw_enquiry_text="u", contact_email="u@x.ae", utm_source="some-new-network",
         status="new"),
    Lead(raw_enquiry_text="u2", contact_email="u2@x.ae", utm_medium="cpc",
         status="new"),
])
db.commit()
db.close()

client = TestClient(app, raise_server_exceptions=False)
passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


def as_user(email, uid=None):
    return patch.object(roles, "verify_bearer_token",
                        return_value={"uid": uid or ("u-" + email), "email": email})


CUST_A = ("buyerA@gmail.com", "UID-A")
CUST_B = ("buyerB@gmail.com", "UID-B")

# 1. Anonymous profile access blocked.
check("profile GET anon 401", client.get("/api/customer/profile").status_code == 401)
check("profile PUT anon 401", client.put(
    "/api/customer/profile", json={"name": "X"}).status_code == 401)

# 2. Save + load roundtrip; email comes from the token, never the body.
with as_user(*CUST_A):
    r = client.put("/api/customer/profile", json={
        "name": "Buyer A", "phone": "+971500000001", "city": "Dubai Marina",
        "utm_source": "google", "utm_medium": "cpc",
        "referrer": "https://ads.example/",
    })
    check("profile PUT 200", r.status_code == 200, r.text[:200])
    body = r.json()
    check("role reported customer", body["role"] == "customer", str(body["role"]))
    check("email from claims", body["profile"]["email"] == CUST_A[0], str(body))
    check("fields saved", body["profile"]["name"] == "Buyer A"
          and body["profile"]["city"] == "Dubai Marina", str(body["profile"]))
    r = client.get("/api/customer/profile")
    check("profile GET 200", r.status_code == 200 and r.json()["profile"]["phone"] == "+971500000001",
          r.text[:200])

# 3. First-touch attribution preserved on later updates.
with as_user(*CUST_A):
    r = client.put("/api/customer/profile", json={
        "name": "Buyer A2", "utm_source": "instagram",
        "referrer": "https://other.example/",
    })
    p = r.json()["profile"]
    check("name updated", p["name"] == "Buyer A2", str(p))
    check("first-touch kept", p["utm_source"] == "google"
          and p["referrer"] == "https://ads.example/", str(p))

# 4. Ownership: B sees only B; A untouched; blank name rejected.
with as_user(*CUST_B):
    r = client.get("/api/customer/profile")
    check("B sees own (null)", r.status_code == 200 and r.json()["profile"] is None, r.text[:160])
    check("blank name 422", client.put(
        "/api/customer/profile", json={"name": "   "}).status_code == 422)
d = SessionLocal()
a = d.query(CustomerProfile).filter(CustomerProfile.firebase_uid == "UID-A").first()
check("A row intact", a is not None and a.name == "Buyer A2" and a.email == CUST_A[0])
check("exactly one profile per uid",
      d.query(CustomerProfile).filter(CustomerProfile.firebase_uid == "UID-A").count() == 1)
d.close()

# 5. Staff customer directory: auth + permitted fields + staff excluded.
check("customers anon 401", client.get("/api/staff/customers").status_code == 401)
with as_user("buyerA@gmail.com", uid="UID-A"):
    check("customers customer 403", client.get("/api/staff/customers").status_code == 403)
with as_user("sp@c.ae"):
    check("customers salesperson 403", client.get("/api/staff/customers").status_code == 403)
with as_user("sm@c.ae"):
    check("customers SM 403", client.get("/api/staff/customers").status_code == 403)
with as_user("admin@c.ae"):
    rows = client.get("/api/staff/customers").json()
    check("admin sees customer", any(r["email"] == CUST_A[0] for r in rows), str(rows))
    check("no firebase_uid leaked", all("firebase_uid" not in r for r in rows), str(rows))
    check("permitted fields", all(set(r) == {"name", "email", "phone", "city", "country", "role",
          "utm_source", "utm_medium", "utm_campaign", "referrer",
          "discovery_source",
          "created_at", "updated_at"} for r in rows), str(rows[0].keys() if rows else []))
with as_user("mgr@c.ae"):
    check("manager sees customers", any(
        r["email"] == CUST_A[0] for r in client.get("/api/staff/customers").json()))

# 6. Channel filter: exact buckets, invalid rejected, role scope respected.
with as_user("admin@c.ae"):
    def ids(ch):
        return sorted(l["id"] for l in client.get(
            "/api/leads", params={"channel": ch}).json()["leads"])
    check("Google", ids("Google") == [1], str(ids("Google")))
    check("Instagram", ids("Instagram") == [2], str(ids("Instagram")))
    check("Facebook", ids("Facebook") == [3], str(ids("Facebook")))
    check("Referral", ids("Referral") == [4], str(ids("Referral")))
    check("Direct", ids("Direct") == [5], str(ids("Direct")))
    check("Unknown", ids("Unknown") == [6, 7], str(ids("Unknown")))
    check("bad channel 422", client.get(
        "/api/leads", params={"channel": "TikTok"}).status_code == 422)
    check("channel+search combine",
          [l["id"] for l in client.get(
              "/api/leads", params={"channel": "Google", "search": "g@x"}).json()["leads"]] == [1])
    ov = client.get("/api/staff/overview").json()
    check("overview breakdown sums",
          sum(ov["channel_breakdown"].values()) == ov["leads_total"] == 7, str(ov["channel_breakdown"]))
    check("overview breakdown keys",
          sorted(ov["channel_breakdown"]) == ["Direct", "Facebook", "Google", "Instagram", "Referral", "Unknown"],
          str(sorted(ov["channel_breakdown"])))

# 7. Preferences roundtrip: budget/property-type/purpose persist server-side
# and stay isolated per UID.
PREFS = {"locations": ["Dubai Marina"], "propertyType": "Apartment",
         "bedrooms": 2, "budgetMin": 1500000.0, "budgetMax": 2000000.0,
         "purpose": "Buy"}
with as_user(*CUST_A):
    r = client.put("/api/customer/profile", json={"name": "Buyer A", "preferences": PREFS})
    check("prefs PUT 200", r.status_code == 200, r.text[:200])
    got = r.json()["profile"]["preferences"]
    check("prefs saved", got["locations"] == ["Dubai Marina"] and got["bedrooms"] == 2
          and got["budgetMax"] == 2000000.0 and got["purpose"] == "Buy", str(got))
    r = client.get("/api/customer/profile")
    check("prefs loaded", r.json()["profile"]["preferences"]["propertyType"] == "Apartment",
          str(r.json()["profile"]["preferences"]))
with as_user(*CUST_B):
    r = client.put("/api/customer/profile", json={"name": "Buyer B"})
    check("B default prefs", r.json()["profile"]["preferences"]["locations"] == []
          and r.json()["profile"]["preferences"]["purpose"] is None,
          str(r.json()["profile"]["preferences"]))
d = SessionLocal()
a = d.query(CustomerProfile).filter(CustomerProfile.firebase_uid == "UID-A").first()
check("A prefs intact in db", a.preferences["budgetMin"] == 1500000.0, str(a.preferences))
d.close()

print("PASSED %d checks" % len(passed))
