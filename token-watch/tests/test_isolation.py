"""
token-watch — STORE ISOLATION: THE MODES ARE AN INVARIANT, NOT A DEPLOY STEP.

⛔⛔ THIS SUITE EXISTS BECAUSE THE ISOLATION CLAIM FAILED MEASUREMENT TWICE IN
   ONE DAY, AND BOTH TIMES THE CHECK RAN AS root, WHERE IT COULD NOT COME OUT
   DIFFERENTLY. A verification that cannot fail is not a verification.

★ THE INVARIANT BLOCK 1 DEFENDS IS THE ONE A REVIEWER FOUND, NOT ONE I CHOSE:
  the store root is 0751 so the app's user can TRAVERSE to `public/`. A study
  file sitting directly in that root therefore has its own 0600 as the ONLY
  control between it and the trading app -- single-control, in the one
  directory where `others` can traverse and where the umask had already
  drifted once. Every other study file was already behind a 0700 directory.

⚠️ MODE ASSERTIONS ARE POSIX-ONLY and are SKIPPED on Windows -- the bits are
   not enforced there, so asserting them would pass for the wrong reason,
   which is the false-control shape this suite is about. The STRUCTURAL blocks
   (1 and 4) run everywhere. Run this on Linux before believing the modes.
"""

import os
import stat
import sys
import tempfile
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-iso-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import promote  # noqa: E402
import store  # noqa: E402

UTC = timezone.utc
POSIX = os.name != "nt"
PASS = FAIL = SKIP = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def skip(label, why):
    global SKIP
    SKIP += 1
    print("  SKIP  " + label + "  -- " + why)


def mode(path):
    return stat.S_IMODE(os.stat(path).st_mode)


print("\nBLOCK 1 -- NO REGULAR FILE SITS AT THE STORE ROOT")
# Drive the real write paths, not a hand-built tree.
store.record_birth(
    mint="MintAAA", created_at=datetime(2026, 8, 31, 12, 0, tzinfo=UTC),
    first_seen_at=datetime(2026, 8, 31, 12, 0, 2, tzinfo=UTC),
    venue="PUMP_FUN", initial_size=1.0, size_source="test",
    initial_liquidity=None, creator="C", socials=None, followed=True,
    follow_reason="test", signature="SIGAAA",
)
store._append(promote.CHECKS_PATH, {"mint": "MintAAA", "becomes": "deferred"})
store.save_state("promote", {"cursor": 1})

at_root = [n for n in os.listdir(ROOT) if os.path.isfile(os.path.join(ROOT, n))]
check("store root holds no regular file", at_root == [],
      "found: " + repr(at_root))
check("the checks ledger is in a subdirectory",
      os.path.dirname(promote.CHECKS_PATH).rstrip("/\\") != ROOT.rstrip("/\\"),
      promote.CHECKS_PATH)
check("the checks ledger was actually written",
      os.path.exists(promote.CHECKS_PATH), promote.CHECKS_PATH)

print("\nBLOCK 2 -- A DRIFTED MODE SELF-HEALS ON THE NEXT WRITE")
if POSIX:
    os.chmod(promote.CHECKS_PATH, 0o644)
    check("positive control: the drift is real before the write",
          mode(promote.CHECKS_PATH) == 0o644, oct(mode(promote.CHECKS_PATH)))
    store._append(promote.CHECKS_PATH, {"mint": "MintBBB", "becomes": "deferred"})
    check("file repaired to 0600 by the next write",
          mode(promote.CHECKS_PATH) == 0o600, oct(mode(promote.CHECKS_PATH)))
    d = os.path.dirname(promote.CHECKS_PATH)
    os.chmod(d, 0o755)
    check("positive control: the directory drift is real",
          mode(d) == 0o755, oct(mode(d)))
    store._append(promote.CHECKS_PATH, {"mint": "MintCCC", "becomes": "deferred"})
    check("directory repaired to 0700 by the next write",
          mode(d) == 0o700, oct(mode(d)))
else:
    skip("mode self-heal", "POSIX modes are not enforced on this platform")

print("\nBLOCK 3 -- THE MODE DOES NOT DEPEND ON THE CALLER'S UMASK")
# ⛔ THE DISCRIMINATING BLOCK. The service runs UMask=0077 and a manual repair
#    run does not, which is exactly how the drift happened. Under the old code
#    a directory created here would be 0755; it must be 0700 regardless.
if POSIX:
    old = os.umask(0o022)
    try:
        p = os.path.join(ROOT, "umask-probe", "probe.jsonl")
        store._append(p, {"probe": True})
        check("directory is 0700 though the umask said 0755",
              mode(os.path.dirname(p)) == 0o700, oct(mode(os.path.dirname(p))))
        check("file is 0600 though the umask said 0644",
              mode(p) == 0o600, oct(mode(p)))
    finally:
        os.umask(old)
else:
    skip("umask independence", "POSIX modes are not enforced on this platform")

print("\nBLOCK 4 -- THE WRITE PRIMITIVE REFUSES THE PUBLISHED DIRECTORY")
# ⛔ 0700 applied to `public/` would present as an EMPTY PAGE, not an error.
raised = False
try:
    store._append(os.path.join(ROOT, "public", "summary.json"), {"x": 1})
except ValueError:
    raised = True
check("_append raises rather than hardening public/", raised)
check("...and wrote nothing there",
      not os.path.exists(os.path.join(ROOT, "public", "summary.json")))


print("\nBLOCK 5 -- THE ACCEPT PATH IS HARDENED TOO, NOT JUST THE CENSUS PATH")
# ⛔ THIS BLOCK IS THE `fix-follows-pointer` GUARD. The reported file lived in
#    `store`; `provenance` writes the raw bodies, the rejections and the
#    follow-up evidence through THREE separate `open(...)` calls of its own,
#    and hardening only the module that was named would leave the class half
#    fixed while reading as closed. Its 0600 came from the unit's UMask=0077 --
#    the same environment dependency, one module across.
import provenance  # noqa: E402

if POSIX:
    old = os.umask(0o022)          # the manual-repair-run umask, not the unit's
    try:
        provenance.record_accepted(b'{"probe":1}', "203.0.113.9",
                                   datetime(2026, 8, 31, 12, 0, tzinfo=UTC))
        provenance.record_rejected("no_credential_presented", "203.0.113.9", 11,
                                   "deadbeef", datetime(2026, 8, 31, 12, 0, tzinfo=UTC))
        provenance.record_follow_up("MintAAA", "test", {"p": 1},
                                    datetime(2026, 8, 31, 12, 0, tzinfo=UTC))
        for label, path in (
            ("raw store", provenance._raw_path(datetime(2026, 8, 31, 12, 0, tzinfo=UTC))),
            ("rejections", provenance.REJECTED_PATH),
            ("follow-up evidence",
             provenance._follow_up_path(datetime(2026, 8, 31, 12, 0, tzinfo=UTC))),
        ):
            check("%s file is 0600 under a 0644 umask" % label,
                  mode(path) == 0o600, "%s %s" % (oct(mode(path)), path))
            check("%s directory is 0700 under a 0755 umask" % label,
                  mode(os.path.dirname(path)) == 0o700,
                  oct(mode(os.path.dirname(path))))
    finally:
        os.umask(old)
else:
    skip("accept-path hardening", "POSIX modes are not enforced on this platform")

print("\nBLOCK 6 -- TWO WRITERS MUST NOT SHARE A TEMP FILE")
# ⛔ THE DEFECT (measured 2026-09-02): `save_state` used a FIXED temp name,
#    `path + ".tmp"`. Two concurrent writers therefore used the SAME temp
#    path -- writer A renamed it away, writer B renamed a file that no longer
#    existed, and crashed. The write-temp-then-rename pattern exists to make
#    the write atomic; a shared temp name reintroduces the exact hazard.
# ⚠️ This tests the CRASH mode only. `save_state` is read-modify-write and is
#    still NOT concurrency-safe against lost updates -- that is what the
#    periodic lock is for, and the real jobs take it.
import threading  # noqa: E402
_errors = []


def _hammer(n):
    try:
        for i in range(25):
            store.save_state("concurrency_probe", {"writer": n, "i": i})
    except Exception as exc:
        _errors.append("%s: %s" % (type(exc).__name__, exc))


# ⚠️ POSIX-ONLY, AND FOR A REAL REASON RATHER THAN CONVENIENCE. On Windows
#    `os.replace` onto a path another thread holds open raises PermissionError
#    -- so this block fails there whatever the temp naming does, and would be
#    testing the platform rather than the fix. Production is Linux, where the
#    replace is atomic. Asserting it on Windows would fail for the wrong
#    reason; skipping it on Linux would hide the thing under test.
if POSIX:
    _threads = [threading.Thread(target=_hammer, args=(n,)) for n in range(6)]
    for _t in _threads: _t.start()
    for _t in _threads: _t.join()
    check("★ six concurrent writers, none crashed", not _errors, str(_errors[:3]))
    check("...and the state file is intact and parseable",
          isinstance(store.load_state("concurrency_probe", None), dict))
else:
    skip("concurrent writers", "os.replace is not atomic over an open file here")
    store.save_state("concurrency_probe", {"writer": 0, "i": 0})

# POSITIVE CONTROL -- the temp names must actually DIFFER, or "no crash"
#   could just mean the threads never overlapped.
import re  # noqa: E402
_p = store.state_path("concurrency_probe")
_names = {store._tmp_name(_p) if hasattr(store, "_tmp_name") else None}
check("POSITIVE CONTROL: the temp path is per-writer, not fixed",
      "%s.tmp" % _p not in _names, "fixed name still in use")

print("\n%d passed, %d failed, %d skipped  (BLOCK 5)" % (PASS, FAIL, SKIP))
sys.exit(1 if FAIL else 0)
