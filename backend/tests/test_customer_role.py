import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Customer-role mapping unit tests (isolated temp DB).

Proves trusted backend logic assigns roles:
  1. Verified email with no staff row -> Customer (automatic).
  2. No/invalid claims -> Customer.
  3. Active staff email -> its staff role (identity from the UID/email
     binding, never from any client-supplied role value).
  4. Inactive staff email -> Customer (no lingering permissions).

Run: python test_customer_role.py
"""
import os
import tempfile

tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
os.environ["DATABASE_URL"] = "sqlite:///" + tmp.name

from app.database import SessionLocal, init_db  # noqa: E402
from app.models import StaffUser  # noqa: E402
from app.services.roles import CUSTOMER, resolve_role  # noqa: E402

init_db()
db = SessionLocal()
db.add(StaffUser(email="admin@t.ae", name="AD", role="admin", is_active=True,
                 firebase_uid="uid-admin-1"))
db.add(StaffUser(email="off@t.ae", name="OFF", role="salesperson", is_active=False))
db.commit()

passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


check("no claims -> customer", resolve_role(db, None)[0] == CUSTOMER)
check("empty claims -> customer", resolve_role(db, {})[0] == CUSTOMER)

role, email, uid = resolve_role(db, {"uid": "uid-new-9", "email": "newcustomer@x.ae"})
check("unknown verified email -> customer automatically",
      (role, email, uid) == (CUSTOMER, "newcustomer@x.ae", "uid-new-9"))

role, email, uid = resolve_role(db, {"uid": "uid-admin-1", "email": "admin@t.ae"})
check("staff resolves by UID binding", role == "admin", role)

role, _, _ = resolve_role(db, {"uid": "uid-other", "email": "ADMIN@T.AE"})
check("staff resolves by email fallback (case-insensitive)", role == "admin", role)

role, _, _ = resolve_role(db, {"uid": "uid-off", "email": "off@t.ae"})
check("inactive staff -> customer", role == CUSTOMER, role)

db.close()
print("PASSED %d checks" % len(passed))
