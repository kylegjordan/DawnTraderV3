"""
token-watch — THE ACCEPT PATH: the secret gate and the provenance store.

★ THIS SUITE EXISTS BECAUSE THE ACCEPT DIRECTION IS THE ONE THING THE ARCHIVER
  PRECEDENT DOES NOT COVER. The four passive-archive legs DIAL OUT: they can
  only receive answers to questions they asked over connections they opened.
  This endpoint ACCEPTS — it takes whatever arrives from whoever finds the path.

⛔ EVERY BLOCK CARRIES BOTH CONTROLS, and Langston required the negative one by
   name: a positive control proves the gate can ADMIT, a negative control
   proves it can REFUSE. A gate that has only ever been shown admitting is
   indistinguishable from no gate at all.
"""

import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-accept-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import provenance  # noqa: E402
import store  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
SECRET_ENV = provenance.SECRET_ENV


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % detail) if detail else ""))


def rejected_rows():
    if not os.path.exists(provenance.REJECTED_PATH):
        return []
    with open(provenance.REJECTED_PATH, encoding="utf-8") as fh:
        return [json.loads(x) for x in fh if x.strip()]


def reset():
    for name in os.listdir(ROOT):
        shutil.rmtree(os.path.join(ROOT, name), ignore_errors=True)
    store.ensure_dirs()


print("\n=== 1. FAIL CLOSED WHEN THE SECRET IS ABSENT (Langston's hard condition)")
reset()
os.environ.pop(SECRET_ENV, None)
ok, reason = provenance.authorized("anything-at-all")
check("⛔ a MISSING secret refuses, it does not skip the check", ok is False)
check("and the reason names the misconfiguration", reason == "no_secret_configured")
ok2, _ = provenance.authorized(None)
check("no credential + no secret also refuses", ok2 is False)

# ★ The discriminating case: an EMPTY secret must not become a valid one.
os.environ[SECRET_ENV] = "   "
ok3, reason3 = provenance.authorized("   ")
check("⛔ a whitespace-only secret is NOT configured, so presenting it fails",
      ok3 is False and reason3 == "no_secret_configured", reason3)

print("\n=== 2. POSITIVE AND NEGATIVE CONTROLS ON THE GATE ITSELF")
os.environ[SECRET_ENV] = "s3cret-value"
ok, reason = provenance.authorized("s3cret-value")
check("POSITIVE CONTROL — the correct credential is admitted", ok is True and reason == "ok")
ok, reason = provenance.authorized("s3cret-valuE")
check("NEGATIVE CONTROL — a one-character difference is refused",
      ok is False and reason == "credential_mismatch")
ok, reason = provenance.authorized("")
check("an empty credential is refused as absent, not as mismatched",
      ok is False and reason == "no_credential_presented")
ok, reason = provenance.authorized("s3cret-value-with-suffix")
check("a correct PREFIX is refused — not a prefix comparison", ok is False)

print("\n=== 3. A REJECTION IS LOGGED — refusing silently is half a control")
reset()
body = b'{"forged": true}'
provenance.record_rejected("credential_mismatch", "203.0.113.9", len(body),
                           hashlib.sha256(body).hexdigest())
rows = rejected_rows()
check("the rejection is persisted", len(rows) == 1)
check("with the reason", rows[0]["reason"] == "credential_mismatch")
check("with the caller, so a guessing source is identifiable",
      rows[0]["remote"] == "203.0.113.9")
check("and a body HASH", rows[0]["sha256"] == hashlib.sha256(body).hexdigest())
check("⛔ but NOT the body itself — a rejection must not be a write primitive",
      "body" not in rows[0])

print("\n=== 4. THE RAW STORE KEEPS BYTES, NOT A PARSE")
reset()
raw = b'{"type": "CREATE", "source": "PUMP_FUN", "weird": "\\u00e9"}'
rec = provenance.record_accepted(raw, "198.51.100.4")
check("the body is stored verbatim", rec["body"] == raw.decode("utf-8"))
check("with a content hash for reconciliation",
      rec["sha256"] == hashlib.sha256(raw).hexdigest())
check("and the caller, so a compromise is PARTITIONABLE by source",
      rec["remote"] == "198.51.100.4")
check("and the arrival time, so it is partitionable by WINDOW",
      "received_at" in rec)

# ★ THE POINT OF KEEPING BYTES: the census could be rebuilt from this even if
#   the parser turns out to be wrong. A parsed copy would be wrong identically.
on_disk = open(provenance._raw_path(datetime.now(UTC)), encoding="utf-8").read()
check("POSITIVE CONTROL — it really reached the disk, not just the return value",
      hashlib.sha256(raw).hexdigest() in on_disk)

print("\n=== 5. THE STORE IS APPEND-ONLY AND SEPARATE FROM THE CENSUS")
reset()
for i in range(5):
    provenance.record_accepted(b'{"n": %d}' % i, "198.51.100.4")
st = provenance.stats()
check("every delivery is retained", st["accepted"] == 5)
check("the mean body size is MEASURED, not projected", st["mean_body_bytes"] > 0)
births = os.path.join(ROOT, "births")
census_files = os.listdir(births) if os.path.isdir(births) else []
check("⛔ and NOTHING was written to the census — the two stores are separate",
      census_files == [], census_files)

print("\n=== 6. THE REJECTED COUNT IS VISIBLE — a guessing attacker is countable")
reset()
provenance.record_accepted(b'{"ok": 1}', "198.51.100.4")
for i in range(3):
    provenance.record_rejected("credential_mismatch", "203.0.113.9", 10, "deadbeef")
st = provenance.stats()
check("accepted and rejected are counted separately",
      st["accepted"] == 1 and st["rejected"] == 3, st)

print("\n=== 7. THE REAL HTTP HANDLER — everything above tests FUNCTIONS")
# ⛔ THE DISCRIMINATING BLOCK. Blocks 1-6 prove the gate works when called.
#    NOTHING there proves the SERVER calls it — which is exactly how
#    `budget.charge` sat with zero production call sites while 57 checks
#    passed. This starts the real HTTPServer with the real Handler and speaks
#    HTTP to it, so an unwired gate cannot pass.
import threading  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402
from http.server import HTTPServer  # noqa: E402

import receiver  # noqa: E402

reset()
os.environ[SECRET_ENV] = "live-secret"

srv = HTTPServer(("127.0.0.1", 0), receiver.Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

now = datetime.now(UTC)
event = [{"type": "CREATE", "source": "PUMP_FUN",
          "timestamp": int(now.timestamp()),
          "feePayer": "CREATOR_1",
          "tokenTransfers": [{"mint": "MINT_E2E"}],
          "nativeTransfers": [{"fromUserAccount": "CREATOR_1",
                               "amount": 3_000_000_000}]}]
body = json.dumps(event).encode()


def post(auth):
    req = urllib.request.Request("http://127.0.0.1:%d/" % port, data=body,
                                 method="POST")
    req.add_header("Content-Type", "application/json")
    if auth is not None:
        req.add_header("Authorization", auth)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


# ── NEGATIVE CONTROL FIRST, so a pass cannot be an artefact of prior state ──
code, _ = post("wrong-secret")
check("⛔ NEGATIVE CONTROL — a wrongly-signed request is REJECTED (401)", code == 401, code)
code_none, _ = post(None)
check("⛔ an UNSIGNED request is rejected too", code_none == 401, code_none)

rows = rejected_rows()
check("★ and BOTH rejections were LOGGED — rejected AND logged, not silently dropped",
      len(rows) == 2, rows)
check("the mismatch is distinguishable from the absence",
      {r["reason"] for r in rows} == {"credential_mismatch", "no_credential_presented"},
      {r["reason"] for r in rows})

# ⛔ THE REJECTED REQUEST MUST NOT HAVE TOUCHED EITHER STORE.
check("⛔ a rejected request wrote NO census row",
      not os.path.exists(store.birth_path(now)), "census file exists")
check("⛔ and NO raw-provenance row — an unauthenticated caller gets no write",
      provenance.stats()["accepted"] == 0)

# ── POSITIVE CONTROL: the same server, the same body, the right credential ──
code, payload = post("live-secret")
check("POSITIVE CONTROL — the correct credential is admitted (200)", code == 200, code)
check("and the launch was recorded", json.loads(payload)["recorded"] == 1, payload)
check("★ the census row landed", os.path.exists(store.birth_path(now)))
check("★ and the raw body landed in the provenance store",
      provenance.stats()["accepted"] == 1)

# ★ The two stores must hold the SAME delivery, or they cannot reconcile.
raw_line = open(provenance._raw_path(now), encoding="utf-8").read()
check("the stored bytes reconcile to what was sent",
      hashlib.sha256(body).hexdigest() in raw_line)

srv.shutdown()

print("\n%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
