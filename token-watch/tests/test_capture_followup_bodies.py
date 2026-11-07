"""
token-watch — the P1 body capture (B-TOKEN-WATCH-FOLLOWUP-MEMORY). Every refuse condition is driven, and the egress is
a fake: `providers._request` is replaced, so no call leaves the process and the pacer never sleeps.

Each block states its expectation first. Run:  python3 token-watch/tests/test_capture_followup_bodies.py  (exit 0 = all pass)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import namedtuple

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(HERE, "tools", "capture_followup_bodies.py")
ROOT = tempfile.mkdtemp(prefix="token-watch-capture-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tools"))
os.makedirs(os.path.join(ROOT, "due"))

import capture_followup_bodies as cap  # noqa: E402
import providers  # noqa: E402

PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


def bucket(hour, mints):
    with open(os.path.join(ROOT, "due", hour + ".jsonl"), "w", encoding="utf-8") as fh:
        for m in mints:
            fh.write(json.dumps({"mint": m, "age": "1h", "due_at": hour + ":00:00+00:00"}) + "\n")


def records(log):
    with open(log, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


CALLS = []


def fake_request(req):
    CALLS.append(req.full_url)
    return {"pairs": []}


providers._request = fake_request

# ── R1/R2: the production store is refused before anything is imported ──────────────────────────────────────────────
print("R1 expect: TOKEN_WATCH_ROOT unset -> exit 2, REFUSED")
env = {k: v for k, v in os.environ.items() if k != "TOKEN_WATCH_ROOT"}
p = subprocess.run([sys.executable, TOOL, "--first", "2026-09-30T14", "--last", "2026-09-30T14", "--log",
                    os.path.join(ROOT, "r1.jsonl")], env=env, capture_output=True, text=True)
check("R1 unset root refused", p.returncode == 2 and "REFUSED" in p.stderr, "rc=%s %s" % (p.returncode, p.stderr))
print("R2 expect: TOKEN_WATCH_ROOT = the production store -> exit 2, nothing written")
env["TOKEN_WATCH_ROOT"] = cap.PRODUCTION_ROOT
p = subprocess.run([sys.executable, TOOL, "--first", "2026-09-30T14", "--last", "2026-09-30T14", "--log",
                    os.path.join(ROOT, "r2.jsonl")], env=env, capture_output=True, text=True)
check("R2 production root refused", p.returncode == 2 and "production store" in p.stderr, "rc=%s %s" % (p.returncode, p.stderr))
check("R2 no log written", not os.path.exists(os.path.join(ROOT, "r2.jsonl")))

# ── M1: a missing bucket is refused, and named ──────────────────────────────────────────────────────────────────────
print("M1 expect: a gap in the bucket range -> exit 3 naming the hour; --allow-missing names it and the run proceeds")
bucket("2026-09-30T14", ["A", "B", "A"])
bucket("2026-09-30T16", ["C", "D", "B"])
log = os.path.join(ROOT, "m1.jsonl")
rc = cap.main(["--first", "2026-09-30T14", "--last", "2026-09-30T16", "--log", log])
recs = records(log)
check("M1 exit 3", rc == 3, "rc=%s" % rc)
check("M1 names the hour", recs[-1].get("missing") == ["2026-09-30T15"], str(recs[-1]))
check("M1 no call made", CALLS == [], str(CALLS))

# ── N1: the normal run — one call per DISTINCT mint, bodies by the production writer, counted ───────────────────────
print("N1 expect: 6 entries, 4 distinct mints -> 4 calls, 4 bodies this run, exit 0, a fresh ledger for this month")
log = os.path.join(ROOT, "n1.jsonl")
rc = cap.main(["--first", "2026-09-30T14", "--last", "2026-09-30T16", "--log", log, "--allow-missing", "2026-09-30T15"])
recs = records(log)
start, end = recs[0], recs[-1]
check("N1 exit 0", rc == 0, "rc=%s" % rc)
check("N1 start counts entries and distinct mints", start["entries"] == 6 and start["distinct_mints"] == 4, str(start))
check("N1 the gap is listed, not hidden", [b for b in start["buckets"] if not b["exists"]][0]["hour"] == "2026-09-30T15")
check("N1 one call per distinct mint", len(CALLS) == 4, str(len(CALLS)))
check("N1 bodies this run = 4", end["bodies_this_run"] == 4 and end["distinct_mints_with_body"] == 4, str(end))
check("N1 the gate was open", start["allowed_follow_up"] is True)
check("N1 a checkpoint at the end", any(r["kind"] == "checkpoint" and r["attempted"] == 4 for r in recs))

# ── N2: --resume calls only what has no body ────────────────────────────────────────────────────────────────────────
print("N2 expect: --resume over the same window -> 0 calls")
CALLS.clear()
log = os.path.join(ROOT, "n2.jsonl")
rc = cap.main(["--first", "2026-09-30T14", "--last", "2026-09-30T16", "--log", log, "--allow-missing",
               "2026-09-30T15", "--resume"])
check("N2 nothing re-called", rc == 0 and CALLS == [] and records(log)[0]["to_call"] == 0, str(records(log)[0]))

# ── S1: a gate that sheds every call -> exit 4 at 1,000 ATTEMPTED, even with bodies already in the tree ───────────────
print("S1 expect: every call shed, 1,000 new mints, 4 bodies already present -> exit 4 at attempted 1000")
bucket("2026-10-01T00", ["S%04d" % i for i in range(1200)])
real_token_state = providers.token_state


def always_shed(mint):
    raise providers.Shed("follow_up")


providers.token_state = always_shed
log = os.path.join(ROOT, "s1.jsonl")
rc = cap.main(["--first", "2026-10-01T00", "--last", "2026-10-01T00", "--log", log])
recs = records(log)
check("S1 exit 4", rc == 4, "rc=%s" % rc)
check("S1 stopped at 1,000 attempted", [r for r in recs if r["kind"] == "checkpoint"][-1]["attempted"] == 1000)
check("S1 the copied bodies did not count", [r for r in recs if r["kind"] == "checkpoint"][-1]["bodies"] == 0)
providers.token_state = real_token_state

# ── D1: the disk floor aborts and records it ────────────────────────────────────────────────────────────────────────
print("D1 expect: free space under 10 GiB -> exit 5 at the first checkpoint, recorded")
Usage = namedtuple("Usage", "total used free")
real_usage = shutil.disk_usage
shutil.disk_usage = lambda path: Usage(100, 99, 1)
log = os.path.join(ROOT, "d1.jsonl")
rc = cap.main(["--first", "2026-10-01T00", "--last", "2026-10-01T00", "--log", log])
recs = records(log)
check("D1 exit 5", rc == 5, "rc=%s" % rc)
check("D1 abort recorded with the numbers", recs[-1]["kind"] == "abort" and recs[-1]["reason"] == "disk floor"
      and recs[-1]["floor_bytes"] >= cap.FLOOR_BYTES, str(recs[-1]))
shutil.disk_usage = real_usage

# ── D2: low disk at the LAST checkpoint is recorded on the end record, not an abort ─────────────────────────────────
print("D2 expect: 3 new mints, free 1 B at their single (last) checkpoint -> exit 0, end says free_below_floor_at_end")
bucket("2026-10-01T05", ["E1", "E2", "E3"])
shutil.disk_usage = lambda path: Usage(100, 99, 1)
log = os.path.join(ROOT, "d2.jsonl")
rc = cap.main(["--first", "2026-10-01T05", "--last", "2026-10-01T05", "--log", log])
recs = records(log)
shutil.disk_usage = real_usage
check("D2 a finished capture exits 0", rc == 0, "rc=%s %s" % (rc, recs[-1]))
check("D2 the low reading is on the end record", recs[-1]["kind"] == "end" and recs[-1]["free_below_floor_at_end"] is True,
      str(recs[-1]))

# ── S2: a stall that starts AFTER the first checkpoint stops the run (Langston, measured) ───────────────────────────
print("S2 expect: 2,500 mints, bodies for the first 1,000 then every call shed -> exit 6 at attempted 2,000")
bucket("2026-10-01T02", ["T%04d" % i for i in range(2500)])
served = {"n": 0}


def bodies_then_shed(mint):
    served["n"] += 1
    if served["n"] > 1000:
        raise providers.Shed("follow_up rate-limited")
    return real_token_state(mint)


providers.token_state = bodies_then_shed
log = os.path.join(ROOT, "s2.jsonl")
rc = cap.main(["--first", "2026-10-01T02", "--last", "2026-10-01T02", "--log", log])
recs = records(log)
providers.token_state = real_token_state
check("S2 exit 6 (stall)", rc == 6, "rc=%s" % rc)
check("S2 stopped at 2,000, naming the stall", recs[-1]["kind"] == "abort" and recs[-1]["attempted"] == 2000
      and "stall" in recs[-1]["reason"], str(recs[-1]))

# ── S3: a run under 1,000 mints is asserted too ─────────────────────────────────────────────────────────────────────
print("S3 expect: 10 mints, all shed -> exit 4 at the single checkpoint (the first version exited 0)")
bucket("2026-10-01T03", ["U%02d" % i for i in range(10)])
providers.token_state = always_shed
log = os.path.join(ROOT, "s3.jsonl")
rc = cap.main(["--first", "2026-10-01T03", "--last", "2026-10-01T03", "--log", log])
providers.token_state = real_token_state
check("S3 exit 4", rc == 4, "rc=%s %s" % (rc, records(log)[-1]))

# ── B2: an empty-but-present bucket is refused ──────────────────────────────────────────────────────────────────────
print("B2 expect: a bucket that exists with 0 entries -> exit 3 naming it as empty")
bucket("2026-10-01T04", [])
log = os.path.join(ROOT, "b2.jsonl")
rc = cap.main(["--first", "2026-10-01T04", "--last", "2026-10-01T04", "--log", log])
check("B2 exit 3, empty named", rc == 3 and records(log)[-1].get("empty") == ["2026-10-01T04"], str(records(log)[-1]))

# ── R3: a root INSIDE the production store is refused ───────────────────────────────────────────────────────────────
print("R3 expect: TOKEN_WATCH_ROOT = <production>/scratch -> exit 2")
env["TOKEN_WATCH_ROOT"] = cap.PRODUCTION_ROOT + "/scratch"
p = subprocess.run([sys.executable, TOOL, "--first", "2026-09-30T14", "--last", "2026-09-30T14", "--log",
                    os.path.join(ROOT, "r3.jsonl")], env=env, capture_output=True, text=True)
check("R3 inside-production refused", p.returncode == 2 and "inside it" in p.stderr, "rc=%s %s" % (p.returncode, p.stderr))

# ── S4/S5: the final interval's power (Langston, Step 4 r2, modelled) ──────────────────────────────────────────────
print("S4 expect: 1,001 mints, the last one always errors (a reliable 404) -> exit 0, end says no_body_in_final_interval=1")
bucket("2026-10-01T06", ["V%04d" % i for i in range(1001)])


def last_errors(mint):
    if mint == "V1000":
        raise RuntimeError("HTTP Error 404: Not Found")
    return real_token_state(mint)


providers.token_state = last_errors
log = os.path.join(ROOT, "s4.jsonl")
rc = cap.main(["--first", "2026-10-01T06", "--last", "2026-10-01T06", "--log", log])
recs = records(log)
providers.token_state = real_token_state
check("S4 a finished capture with a one-mint zero tail exits 0", rc == 0, "rc=%s %s" % (rc, recs[-1]))
check("S4 the tail is on the end record", recs[-1]["kind"] == "end" and recs[-1]["no_body_in_final_interval"] == 1,
      str(recs[-1]))
print("S5 expect: 1,500 mints, a stall from 1,001 (500-attempt final interval) -> still exit 6")
bucket("2026-10-01T07", ["W%04d" % i for i in range(1500)])
served["n"] = 0
providers.token_state = bodies_then_shed
log = os.path.join(ROOT, "s5.jsonl")
rc = cap.main(["--first", "2026-10-01T07", "--last", "2026-10-01T07", "--log", log])
providers.token_state = real_token_state
check("S5 a 500-attempt zero final interval is a stall", rc == 6, "rc=%s %s" % (rc, records(log)[-1]))

shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
