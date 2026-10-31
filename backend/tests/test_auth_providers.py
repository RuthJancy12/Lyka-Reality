import os, sys
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

"""Firebase account/provider integrity test (live read-only lookup).

Verifies the load-bearing invariants behind LYKA sign-in and role
resolution, without passwords, tokens, or secrets:
  1. Every staff email maps to exactly one Firebase UID (no duplicates
     across staff accounts — duplicates would demote users to "customer").
  2. Every staff Firebase account is enabled (disabled accounts fail all
     sign-in methods, including Google).
  3. Every provider linked to a staff account is from the known set
     {google.com, password} — an unexpected provider blocks diagnosis.
  4. Each backend staff_users.firebase_uid binding (when set) equals the
     live Firebase UID for that email, so linking a password later (same
     UID) preserves roles, assignments, and permissions.

Deliberately does NOT assert password presence: linking a password is the
supported remedy for Google-only accounts, and must not break this suite.

Skips cleanly (exit 0) when the service account or network is unavailable.
Run: python test_auth_providers.py
"""
import os
import sqlite3
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("DATABASE_URL", "sqlite:///" + os.path.join(BASE, "lyka_realty.db"))

try:
    import firebase_admin
    from firebase_admin import credentials, auth as admin_auth
except ImportError:
    print("SKIP: firebase-admin not installed")
    sys.exit(0)

SA_PATH = os.path.join(BASE, "firebase-service-account.json")
if not os.path.exists(SA_PATH):
    print("SKIP: service account file missing")
    sys.exit(0)

try:
    try:
        app = firebase_admin.get_app("provider-audit")
    except ValueError:
        app = firebase_admin.initialize_app(
            credentials.Certificate(SA_PATH),
            {"projectId": "real-estimate-6b291"},
            name="provider-audit",
        )
except Exception as e:
    print("SKIP: admin init unavailable: %s" % str(e)[:160])
    sys.exit(0)

db = sqlite3.connect(os.path.join(BASE, "lyka_realty.db"))
db.row_factory = sqlite3.Row
try:
    staff = [dict(r) for r in db.execute(
        "SELECT email, role, is_active, firebase_uid FROM staff_users")]
finally:
    db.close()
staff = [s for s in staff if s["is_active"]]
assert staff, "FAIL: no active staff rows to audit"

passed = []


def check(name, cond, extra=""):
    assert cond, "FAIL: %s %s" % (name, extra)
    passed.append(name)
    print("ok:", name)


KNOWN_PROVIDERS = {"google.com", "password"}
uid_by_email = {}
providers_by_email = {}
for s in staff:
    email = s["email"]
    try:
        u = admin_auth.get_user_by_email(email, app=app)
    except Exception as e:
        print("SKIP: live lookup unavailable for %s: %s" % (email, str(e)[:120]))
        sys.exit(0)
    uid_by_email[email] = u.uid
    providers_by_email[email] = sorted(p.provider_id for p in u.provider_data)
    check("account enabled: %s" % email, u.disabled is False)
    check("known providers only: %s" % email,
          len(providers_by_email[email]) > 0
          and set(providers_by_email[email]) <= KNOWN_PROVIDERS,
          str(providers_by_email[email]))

uids = list(uid_by_email.values())
check("exactly one UID per staff email (no duplicates)", len(set(uids)) == len(uids),
      str(uid_by_email))

for s in staff:
    if s["firebase_uid"]:
        check("UID binding intact: %s" % s["email"],
              s["firebase_uid"] == uid_by_email[s["email"]],
              "db=%s live=%s" % (s["firebase_uid"], uid_by_email[s["email"]]))

print("provider sets (informational, may legitimately gain 'password'):")
for email in sorted(providers_by_email):
    print("  %s -> %s" % (email, providers_by_email[email]))
print("PASSED %d checks" % len(passed))
