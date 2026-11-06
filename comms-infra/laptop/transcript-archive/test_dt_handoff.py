#!/usr/bin/env python3
"""Tests for dt_handoff (B-TRANSCRIPT-ARCHIVE P8): the writer's refusals and the guard's drill cases (1)-(5), design §5:
each run starts green, plants ONE mutation and must go red FOR THE RIGHT REASON, then green again. A scratch git repo
with a local bare remote makes the ref and fetch legs real; the census and alert sources are planted.
`python3 -I test_dt_handoff.py` - exit 0 = all pass."""
import datetime
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_handoff as dh  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass
FAILS = []


def ok(name, cond, detail=None):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or detail is None else "   [%r]" % (detail,)))
    if not cond:
        FAILS.append(name)


def sh(cwd, *a):
    subprocess.run(list(a), cwd=cwd, check=True, capture_output=True)


base = tempfile.mkdtemp(prefix="dt-hand-")
bare, clone, root = (os.path.join(base, x) for x in ("remote.git", "clone", "archive"))
sh(base, "git", "init", "-q", "--bare", bare)
sh(base, "git", "clone", "-q", bare, clone)
for k, v in (("user.email", "t@t"), ("user.name", "t")):
    sh(clone, "git", "config", k, v)
sh(clone, "git", "checkout", "-q", "-b", dh.BRANCH)
os.makedirs(os.path.join(clone, "Scope"))
open(os.path.join(clone, "Scope", "PACK.md"), "w").write("pack\n")
sh(clone, "git", "add", ".")
sh(clone, "git", "commit", "-q", "-m", "c1")
sh(clone, "git", "push", "-q", "-u", "origin", dh.BRANCH)
C1 = subprocess.run(["git", "-C", clone, "rev-parse", "HEAD"], capture_output=True).stdout.decode().strip()
os.makedirs(os.path.join(root, "CC-B"))
open(os.path.join(root, "CC-B", "2026-11-06_0fe1c46a.md"), "w").write("archived\n")

T0 = datetime.datetime(2026, 11, 6, 18, 0, 0, tzinfo=datetime.timezone.utc)
STATE = {"open": [{"id": "1568300000000000001"}], "alerts": ["aaaaaaaa-1111-2222-3333-444444444444"], "gf": []}


def census(alias, since_ms):
    return {"open": list(STATE["open"]), "not_received": [], "guard_failed": list(STATE["gf"]),
            "not_checked": ["NOT CHECKED — Coltrane's posts"]}


def alerts():
    if STATE.get("alerts_fail"):
        raise RuntimeError("unreachable")
    return list(STATE["alerts"])


FIELDS = """## 1. position
STEP: 3 of 11
## 2. brief
build it
## 6. open dispatches
1568300000000000001 — the writer review
## 11. archive link
`CC-B/2026-11-06_0fe1c46a.md` lines 1-1
## 12. withdrawn claims
none
## 13. owned triggers
none
## 14. active pack
`Scope/PACK.md` gate Step 4 at %s
""" % C1


def write(fields=FIELDS, clock=T0):
    return dh.write("CC-B", clone, fields, root, census=census, alerts=alerts, clock=lambda: clock)


def guard(clock=T0 + datetime.timedelta(minutes=5)):
    return dh.guard("CC-B", clone, root, census=census, alerts=alerts, clock=lambda: clock)


print("the writer")
try:
    write(FIELDS.replace("## 12. withdrawn claims\nnone\n", "## 12. withdrawn claims\n\n"))
    ok("a blank required field (12) is refused", False)
except dh.Refused as e:
    ok("a blank required field (12) is refused", "12" in str(e), str(e))
STATE["open"] = [{"id": "1568300000000000001"}, {"id": "1568300000000000002"}]
try:
    write()
    ok("a handoff that omits an open dispatch the log shows is refused", False)
except dh.Refused as e:
    ok("a handoff that omits an open dispatch the log shows is refused", "1568300000000000002" in str(e), str(e))
STATE["open"] = [{"id": "1568300000000000001"}]
p = write()
txt = open(p, "rb").read()
ok("the handoff is written, LF, with the machine fields READ (origin, head, porcelain, dispatches, alerts)",
   b"\r\n" not in txt and C1.encode() in txt and b"1568300000000000001" in txt and b"aaaaaaaa-1111" in txt)

print("baseline: green")
b, lines, _ = guard()
ok("a fresh handoff with nothing changed is CLEAN", b.startswith("HANDOFF GUARD: CLEAN"), (b, lines))

print("(1) an omitted gate-holding dispatch")
STATE["open"] = [{"id": "1568300000000000001"}, {"id": "1568300000000000777"}]
b, lines, _ = guard()
ok("red for the right reason: MISSING_OPEN_DISPATCH with the exact id, banner STALE/BLOCKED",
   b.startswith("STALE/BLOCKED") and "MISSING_OPEN_DISPATCH 1568300000000000777" in lines, (b, lines))
ok("...and the listed dispatch (the positive control) is not reported missing", "MISSING_OPEN_DISPATCH 1568300000000000001" not in lines)
STATE["open"] = [{"id": "1568300000000000001"}]
ok("restored: green", guard()[0].startswith("HANDOFF GUARD: CLEAN"))
STATE["open"] = []
b, lines, _ = guard()
ok("a reply on a listed dispatch since the handoff is DRIFT", b.startswith("STALE (drift)") and any("reply on 1568300000000000001" in l for l in lines), (b, lines))
STATE["open"] = [{"id": "1568300000000000001"}]

print("(2) a stale ref")
other = os.path.join(base, "other")
sh(base, "git", "clone", "-q", "-b", dh.BRANCH, bare, other)
for k, v in (("user.email", "t@t"), ("user.name", "t")):
    sh(other, "git", "config", k, v)
open(os.path.join(other, "new.txt"), "w").write("x\n")
sh(other, "git", "add", ".")
sh(other, "git", "commit", "-q", "-m", "c2")
sh(other, "git", "push", "-q", "origin", dh.BRANCH)
C2 = subprocess.run(["git", "-C", other, "rev-parse", "HEAD"], capture_output=True).stdout.decode().strip()
b, lines, _ = guard()
ok("red for the right reason: the exact old and new shas", b.startswith("STALE (drift) — ref") and ("DRIFT ref: origin/%s %s -> %s" % (dh.BRANCH, C1, C2)) in lines, (b, lines))
sh(clone, "git", "pull", "-q", "--ff-only")
STATE["open"] = [{"id": "1568300000000000001"}]
p = write(clock=T0 + datetime.timedelta(minutes=10))
ok("restored by a NEW handoff with the field corrected: green", guard(T0 + datetime.timedelta(minutes=15))[0].startswith("HANDOFF GUARD: CLEAN"))
open(os.path.join(other, "new2.txt"), "w").write("y" + chr(10))
sh(other, "git", "add", ".")
sh(other, "git", "commit", "-q", "-m", "c3")
sh(other, "git", "push", "-q", "origin", dh.BRANCH)
write(clock=T0 + datetime.timedelta(minutes=16))          # the remote moved; the WRITER must fetch before stamping
b, lines, _ = guard(T0 + datetime.timedelta(minutes=17))
ok("the writer fetches first: a handoff written after the remote moved is CLEAN, not born STALE", not any(l.startswith("DRIFT ref") for l in lines), (b, lines))
sh(clone, "git", "pull", "-q", "--ff-only")
write(clock=T0 + datetime.timedelta(minutes=18))

print("(3) a guard failure: an unreachable remote")
sh(clone, "git", "remote", "set-url", "origin", os.path.join(base, "nowhere.git"))
b, lines, _ = guard(T0 + datetime.timedelta(minutes=15))
ok("red for the right reason: GUARD FAILED — ref not checked, counted as STALE", b.startswith("GUARD FAILED — ref not checked") and "STALE" in b, (b, lines))
sh(clone, "git", "remote", "set-url", "origin", bare)
ok("restored: green", guard(T0 + datetime.timedelta(minutes=15))[0].startswith("HANDOFF GUARD: CLEAN"))
STATE["gf"] = ["unknown kind 'x'"]
b, lines, _ = guard(T0 + datetime.timedelta(minutes=15))
ok("a census that cannot be trusted -> GUARD FAILED — open-dispatch", b.startswith("GUARD FAILED") and "open-dispatch" in b and any("unknown kind" in l for l in lines), (b, lines))
STATE["gf"] = []
STATE["alerts_fail"] = True
b, _l, _ = guard(T0 + datetime.timedelta(minutes=15))
ok("an unreadable alert source -> GUARD FAILED — alert", b.startswith("GUARD FAILED") and "alert" in b, b)
STATE["alerts_fail"] = False

print("(4) the aged backstop")
b, lines, _ = guard(T0 + datetime.timedelta(hours=13))
ok("past 12 h with no drift: AGED, NOT STALE", b == "AGED (backstop, no drift found)", (b, lines))
ok("under 12 h: green", guard(T0 + datetime.timedelta(hours=11))[0].startswith("HANDOFF GUARD: CLEAN"))

STATE["alerts"] = STATE["alerts"] + ["cccccccc-1111-2222-3333-444444444444"]
b, _l, _ = guard(T0 + datetime.timedelta(hours=13))
ok("drift on an OLD handoff is STALE, never AGED (event beats age)", b.startswith("STALE (drift)"), b)
STATE["alerts"] = STATE["alerts"][:1]

print("the head leg on its own")
open(os.path.join(clone, "local.txt"), "w").write("x\n")
sh(clone, "git", "add", "local.txt")
sh(clone, "git", "commit", "-q", "-m", "local")
b, lines, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("a local commit since the handoff -> DRIFT head", "head" in b and any(l.startswith("DRIFT head:") for l in lines), (b, lines))
sh(clone, "git", "reset", "-q", "--hard", "HEAD~1")
ok("restored: green", guard(T0 + datetime.timedelta(minutes=20))[0].startswith("HANDOFF GUARD: CLEAN"))

print("(5) a positive control on every leg")
STATE["alerts"] = STATE["alerts"] + ["bbbbbbbb-1111-2222-3333-444444444444"]
b, lines, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("a planted due alert -> DRIFT alert with its id", b.startswith("STALE (drift) — alert") and "DRIFT alert: newly due bbbbbbbb-1111-2222-3333-444444444444" in lines, (b, lines))
STATE["alerts"] = STATE["alerts"][:1]
open(os.path.join(clone, "planted.txt"), "w").write("x\n")
b, lines, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("a planted untracked file -> DRIFT dirty naming it", b.startswith("STALE (drift) — dirty") and any("planted.txt" in l for l in lines), (b, lines))
os.remove(os.path.join(clone, "planted.txt"))
ok("restored: green", guard(T0 + datetime.timedelta(minutes=20))[0].startswith("HANDOFF GUARD: CLEAN"))
os.rename(os.path.join(clone, "Scope", "PACK.md"), os.path.join(clone, "Scope", "GONE.md"))
b, lines, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("the pack path is validated, not trusted", "pack" in b and any("PACK.md" in l for l in lines), (b, lines))
os.rename(os.path.join(clone, "Scope", "GONE.md"), os.path.join(clone, "Scope", "PACK.md"))
os.remove(os.path.join(root, "CC-B", "2026-11-06_0fe1c46a.md"))
b, lines, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("the archive link is validated, not trusted", "archive link" in b, (b, lines))
open(os.path.join(root, "CC-B", "2026-11-06_0fe1c46a.md"), "w").write("archived\n")

print("the banner")
open(dh.latest(root, "CC-B"), "a").write("")
with open(dh.latest(root, "CC-B"), encoding="utf-8") as fh:
    t = fh.read()
open(dh.latest(root, "CC-B"), "w", encoding="utf-8", newline="\n").write(t.replace("```json handoff-machine", "```json"))
b, _l, _ = guard(T0 + datetime.timedelta(minutes=20))
ok("a handoff whose machine block is missing is GUARD FAILED, never CLEAN", b.startswith("GUARD FAILED"), b)
shutil.rmtree(base, ignore_errors=True)
print("\n%d failed" % len(FAILS))
sys.exit(1 if FAILS else 0)
