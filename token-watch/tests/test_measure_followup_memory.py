"""
token-watch — the P1 replay harness (B-TOKEN-WATCH-FOLLOWUP-MEMORY). A small pristine store is built here, then
`index`, `prepare` and `run` are driven exactly as on the box, each `run` in its own process (config reads
TOKEN_WATCH_ROOT at import). The egress check is skipped (no systemd unit here); everything else is real.

Each block states its expectation first. Run:  python3 token-watch/tests/test_measure_followup_memory.py  (exit 0 = all pass)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(HERE, "tools", "measure_followup_memory.py")
UTC = timezone.utc
NOW = "2026-10-02T13:00:00+00:00"
WORK = tempfile.mkdtemp(prefix="token-watch-measure-")
PRISTINE = os.path.join(WORK, "pristine")
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


def tool(*args, root=None):
    env = dict(os.environ)
    if root:
        env["TOKEN_WATCH_ROOT"] = root
    return subprocess.run([sys.executable, TOOL] + list(args), env=env, capture_output=True, text=True, timeout=600)


def body(mint):
    return {"schemaVersion": "1.0.0", "pairs": [{
        "chainId": "solana", "dexId": "pumpfun", "pairAddress": "PAIR" + mint, "priceUsd": "0.0001",
        "volume": {"h24": 1234.5}, "txns": {"h24": {"buys": 3, "sells": 2}}, "pairCreatedAt": 1727700000000,
        "liquidity": None, "baseToken": {"address": mint, "name": "Tok" + mint, "symbol": "T" + mint}}]}


# ── the pristine store: 48 buckets from 2026-09-30T14, 3 entries each, two of them due in the future ───────────────
for d in ("due", "state", "births", "dead", "observations", "study", "public", os.path.join("provenance", "follow-up")):
    os.makedirs(os.path.join(PRISTINE, d), exist_ok=True)
first = datetime(2026, 9, 30, 14, tzinfo=UTC)
mints, entries = [], 0
for i in range(48):
    h = first + timedelta(hours=i)
    with open(os.path.join(PRISTINE, "due", h.strftime("%Y-%m-%dT%H") + ".jsonl"), "w", encoding="utf-8") as fh:
        for j in range(3):
            m = "M%02d%d" % (i, j)
            due_at = h + timedelta(minutes=10 * j)
            if i == 47 and j > 0:
                due_at = datetime(2026, 10, 2, 13, 30, tzinfo=UTC)     # not yet due at NOW: requeued, never called
            fh.write(json.dumps({"mint": m, "age": "1h", "due_at": due_at.isoformat(),
                                 "created_at": (due_at - timedelta(hours=1)).isoformat()}) + "\n")
            mints.append(m)
            entries += 1
# a captured body for every mint except the last ten (they replay a no-pairs body, counted apart)
with open(os.path.join(PRISTINE, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for m in mints[:-10]:
        b = json.dumps(body(m), sort_keys=True)
        fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": b, "bytes": len(b),
                             "observed_at": "2026-11-07T00:00:00+00:00", "sha256": "x"}) + "\n")
# the October journal: two rows before NOW, one after (prepare must cut the last)
with open(os.path.join(PRISTINE, "state", "spend-journal-2026-10.jsonl"), "w", encoding="utf-8") as fh:
    for ts in ("2026-10-01T00:00:01+00:00", "2026-10-02T12:59:59+00:00", "2026-10-20T00:00:00+00:00"):
        fh.write(json.dumps({"kind": "birth", "n": 1, "day": ts[:10], "ts": ts}) + "\n")
with open(os.path.join(PRISTINE, "state", "spend-journal-2026-11.jsonl"), "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"kind": "birth", "n": 1, "day": "2026-11-01", "ts": "2026-11-01T00:00:00+00:00"}) + "\n")
# three DEFERRED births, so `promote.run` (called inside run_hour) makes its own token_state calls on the same budget
# key. Without them the call-site count and a providers-wide wrapper count agree, and the test could not tell them
# apart (a mutation that wrapped providers.token_state survived until this fixture was added).
with open(os.path.join(PRISTINE, "births", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for k in range(3):
        fh.write(json.dumps({"mint": "BIRTH%d" % k, "follow_reason": "deferred",
                             "created_at": "2026-10-01T00:00:0%d+00:00" % k}) + "\n")

BODIES = os.path.join(WORK, "bodies.sqlite")

# ── I1: index, and its refusals ────────────────────────────────────────────────────────────────────────────────────
print("I1 expect: 134 bodies indexed (144 mints, the last 10 without a body); duplicates, empty and production refused")
p = tool("index", "--pristine", PRISTINE, "--out", BODIES)
check("I1 indexed 134", p.returncode == 0 and json.loads(p.stdout)["indexed"] == 134, p.stdout + p.stderr)
check("I1 refuses to overwrite", tool("index", "--pristine", PRISTINE, "--out", BODIES).returncode == 2)
check("I1 refuses a production --pristine", tool("index", "--pristine", "/var/lib/token-watch", "--out",
                                                  os.path.join(WORK, "x.sqlite")).returncode == 2)
check("I1 refuses a production --out", tool("index", "--pristine", PRISTINE, "--out",
                                             "/var/lib/token-watch/bodies.sqlite").returncode == 2)
DUP = os.path.join(WORK, "dup")
shutil.copytree(PRISTINE, DUP)
with open(os.path.join(DUP, "provenance", "follow-up", "2026-10-02.jsonl"), "w", encoding="utf-8") as fh:
    b = json.dumps(body("M000"), sort_keys=True)
    fh.write(json.dumps({"mint": "M000", "source": "dexscreener_token_state", "body": b, "bytes": len(b)}) + "\n")
p = tool("index", "--pristine", DUP, "--out", os.path.join(WORK, "dup.sqlite"))
check("I1 refuses a duplicate mint, and leaves no index", p.returncode == 2 and "duplicate" in p.stderr
      and not os.path.exists(os.path.join(WORK, "dup.sqlite")), p.stderr)
EMPTY = os.path.join(WORK, "empty")
for d in ("due", os.path.join("provenance", "follow-up")):
    os.makedirs(os.path.join(EMPTY, d))
p = tool("index", "--pristine", EMPTY, "--out", os.path.join(WORK, "empty.sqlite"))
check("I1 refuses an empty index", p.returncode == 2 and "no body" in p.stderr, p.stderr)


def prepare(name, *extra):
    run_root = os.path.join(WORK, name)
    return run_root, tool("prepare", "--pristine", PRISTINE, "--run-root", run_root, "--now", NOW, *extra)


# ── P1: prepare — faithful history, the floor, the report ──────────────────────────────────────────────────────────
print("P1 expect: October cut to the 2 rows <= NOW (parsed), November removed, PREPARE.json written, bodies not copied")
run_root, p = prepare("run-live")
rep = json.loads(p.stdout) if p.returncode == 0 else {}
check("P1 October cut", rep.get("journals", {}).get("spend-journal-2026-10.jsonl", {}).get("rows_kept") == 2
      and rep["journals"]["spend-journal-2026-10.jsonl"]["rows_cut"] == 1, p.stdout + p.stderr)
check("P1 November removed", not os.path.exists(os.path.join(run_root, "state", "spend-journal-2026-11.jsonl")))
check("P1 PREPARE.json says no bodies were copied", json.load(open(os.path.join(run_root, "PREPARE.json")))
      ["with_bodies"] is False and not os.path.exists(os.path.join(run_root, "provenance", "follow-up")))
check("P1 refuses an existing run dir", prepare("run-live")[1].returncode == 2)
print("P2 expect: free space under the floor -> prepare refuses before copying")
sys.path.insert(0, os.path.join(HERE, "tools"))
import measure_followup_memory as mfm  # noqa: E402
real_free = mfm._free
mfm._free = lambda path="/": 1
rc = mfm.main(["prepare", "--pristine", PRISTINE, "--run-root", os.path.join(WORK, "run-nospace"), "--now", NOW])
mfm._free = real_free
check("P2 floor refuses, nothing copied", rc == 2 and not os.path.exists(os.path.join(WORK, "run-nospace")))


def run(arm, run_root, *extra, skip_memory=True, skip_egress=True):
    out = os.path.join(WORK, arm + "-" + os.path.basename(run_root) + ".json")
    # the fixture leaves 8 of the loop's 142 mints uncaptured on purpose (0.944 served), so the default 0.95 floor
    # would void it; 0.9 here, and F1 overrides it upward to show the floor fires (argparse: the last value wins)
    flags = (["--skip-memory-check"] if skip_memory else []) + (["--skip-egress-check"] if skip_egress else [])         + ["--min-served-share", "0.9"]
    p = tool("run", "--arm", arm, "--run-root", run_root, "--bodies", BODIES, "--now", NOW, "--out", out,
             *flags, *extra, root=run_root)
    res = json.load(open(out)) if os.path.exists(out) else {}
    return p, res


# ── L1: the live arm ───────────────────────────────────────────────────────────────────────────────────────────────
print("L1 expect: 48 buckets, 144 due, 2 requeued; 142 call-site; 134 served (all in the loop), 11 no-body; real curves")
p, res = run("live", run_root)
st, fo = res.get("stats", {}), res.get("fanout", {})
check("L1 exit 0", p.returncode == 0, p.stdout[-800:] + p.stderr[-1500:])
check("L1 read the 48 buckets", st.get("buckets_read") == 48, str(st))
check("L1 due 144, requeued 2", st.get("due") == 144 and st.get("requeued_not_yet_due") == 2, str(st))
check("L1 call-site count = due - requeued", fo.get("call_site_token_state") == 142, str(fo))
check("L1 no extraction errors on the shape-true body", st.get("errors") == 0, str(st))
check("L1 served exactly the 134 captured bodies", fo.get("served_bodies") == 134 and fo.get("loop_served") == 134, str(fo))
check("L1 no-body: 10 uncaptured - 2 requeued + promote's 3 = 11, of which the loop's are 8",
      fo.get("no_body_mints") == 11 and fo.get("loop_no_body") == 8, str(fo))
check("L1 POSITIVE CONTROL: promote made its own token_state calls (so the call-site count discriminates)",
      (st.get("promote") or {}).get("checked", 0) + (st.get("promote") or {}).get("unresolved_no_pairs", 0) >= 1,
      str(st.get("promote")))
check("L1 the Helius leg ran on REAL curve replies: one call per alive token, labelled synthetic",
      0 < fo.get("synthetic_helius_calls", 0) <= 134 and "SYNTHETIC" in fo.get("synthetic_label", ""), str(fo))
check("L1 all seven clocks frozen", sorted(res.get("frozen_modules", [])) == sorted(mfm.CLOCK_MODULES), str(res.get("frozen_modules")))
check("L1 the served bodies' size is reported", res.get("served_body_bytes", {}).get("n") == 134, str(res.get("served_body_bytes")))
check("L1 the result carries the tree it ran on", res.get("prepare", {}).get("run_root") == run_root)

# ── X1: the x4 arm is 4x TEXT ──────────────────────────────────────────────────────────────────────────────────────
print("X1 expect: arm x4 exits 0, and the bodies it served are ~4x the live arm's bytes")
run_root_x, _ = prepare("run-x4")
p, resx = run("x4", run_root_x)
live_mean = res.get("served_body_bytes", {}).get("mean", 0)
x4_mean = resx.get("served_body_bytes", {}).get("mean", 0)
check("X1 exit 0", p.returncode == 0, p.stdout[-600:] + p.stderr[-1500:])
check("X1 bytes ~4x", live_mean and 3.9 <= x4_mean / live_mean <= 4.1, "live %s x4 %s" % (live_mean, x4_mean))
check("X1 the pad changed nothing the loop reads", resx.get("stats", {}).get("observed") == st.get("observed")
      and resx.get("stats", {}).get("errors") == 0, str(resx.get("stats")))

# ── A1: arm all_shed, with its own control ─────────────────────────────────────────────────────────────────────────
print("A1 expect: arm all_shed -> egress 0, call-site 142, shed rows 142, exit 0 (control satisfied)")
run_root_a, _ = prepare("run-shed")
p, res = run("all_shed", run_root_a)
fo = res.get("fanout", {})
check("A1 exit 0", p.returncode == 0, p.stdout[-800:] + p.stderr[-1500:])
check("A1 no egress", fo.get("egress") == 0, str(fo))
check("A1 call-site 142 and shed rows 142", fo.get("call_site_token_state") == 142
      and res.get("shed_observation_rows") == 142, str(res))
check("A1 not void", "void" not in res, str(res.get("void")))

# ── C1: the clock freeze is load-bearing ───────────────────────────────────────────────────────────────────────────
print("C1 expect: arm all_shed WITHOUT the clock freeze -> the gate reads the wall month, opens -> VOID, exit 7")
run_root_c, _ = prepare("run-nofreeze")
p, res = run("all_shed", run_root_c, "--no-clock-freeze")
check("C1 exit 7 (void)", p.returncode == 7, "rc=%s %s" % (p.returncode, p.stderr[-800:]))
check("C1 void names the control", "control failed" in str(res.get("void")), str(res.get("void")))

# ── F1: the served-share floor ─────────────────────────────────────────────────────────────────────────────────────
print("F1 expect: live with a 0.99 floor (134/142 = 0.944 served) -> VOID, exit 9")
run_root_f, _ = prepare("run-floor")
p, res = run("live", run_root_f, "--min-served-share", "0.99")
check("F1 exit 9", p.returncode == 9 and "served-share" in str(res.get("void")), "rc=%s %s" % (p.returncode, res.get("void")))

# ── M1: the MemoryMax control ──────────────────────────────────────────────────────────────────────────────────────
print("M1 expect: memory.max 'max' -> VOID exit 8 before anything runs; 536870912 -> proceeds and is recorded")
cg = os.path.join(WORK, "cg")
os.makedirs(cg)
open(os.path.join(cg, "memory.max"), "w").write("max\n")
open(os.path.join(cg, "memory.events"), "w").write("low 0\nhigh 0\nmax 3\noom 0\noom_kill 0\n")
run_root_m, _ = prepare("run-mem")
p, res = run("live", run_root_m, "--cgroup-dir", cg, skip_memory=False)
check("M1 unlimited -> exit 8", p.returncode == 8 and "MemoryMax" in str(res.get("void")), "rc=%s %s" % (p.returncode, res.get("void")))
check("M1 nothing ran", "stats" not in res)
open(os.path.join(cg, "memory.max"), "w").write("536870912\n")
p, res = run("live", run_root_m, "--cgroup-dir", cg, skip_memory=False)
check("M1 512M -> exit 0, memory.max and memory.events recorded", p.returncode == 0
      and res.get("cgroup", {}).get("memory_max") == "536870912"
      and res.get("cgroup", {}).get("memory_events") == {"max": 3, "oom": 0, "oom_kill": 0}, str(res.get("cgroup")))

# ── E1: the egress control actually fires ──────────────────────────────────────────────────────────────────────────
print("E1 expect: a probe that CONNECTS -> VOID exit 6; a literal IP refused the wrong way (ECONNREFUSED) -> VOID exit 6")
import socket  # noqa: E402
srv = socket.socket()
srv.bind(("127.0.0.1", 0))
srv.listen(1)
port = srv.getsockname()[1]
run_root_e, _ = prepare("run-egress")
p, res = run("live", run_root_e, "--egress-probe", "127.0.0.1:%d" % port, skip_egress=False)
check("E1 a live connection voids", p.returncode == 6 and "SUCCEEDED" in str(res.get("void")), "rc=%s %s" % (p.returncode, res.get("void")))
srv.close()
p, res = run("live", run_root_e, "--egress-probe", "127.0.0.1:%d" % port, skip_egress=False)
check("E1 ECONNREFUSED on a literal IP is not proof of a deny", p.returncode == 6 and "not EPERM" in str(res.get("void")),
      "rc=%s %s" % (p.returncode, res.get("void")))

# ── T1: --trace reaches the identity map ───────────────────────────────────────────────────────────────────────────
print("T1 expect: --trace writes snapshots, including around summary._identity_map (A2's site)")
run_root_t, _ = prepare("run-trace")
tdir = os.path.join(WORK, "trace")
p, res = run("live", run_root_t, "--trace", tdir)
names = sorted(os.listdir(tdir)) if os.path.isdir(tdir) else []
check("T1 exit 0", p.returncode == 0, p.stderr[-1500:])
check("T1 identity map bracketed", any("before-summary._identity_map" in n for n in names)
      and any("after-summary._identity_map" in n for n in names), str(names))

# ── B1: the read-path baseline ─────────────────────────────────────────────────────────────────────────────────────
print("B1 expect: lookup-baseline fetches the 144 distinct mints, finds 134")
out = os.path.join(WORK, "baseline.json")
p = tool("lookup-baseline", "--run-root", run_root, "--bodies", BODIES, "--out", out)
bl = json.load(open(out)) if os.path.exists(out) else {}
check("B1 144 lookups, 134 found", p.returncode == 0 and bl.get("lookups") == 144 and bl.get("found") == 134, str(bl))

# ── R1: refusals ───────────────────────────────────────────────────────────────────────────────────────────────────
print("R1 expect: TOKEN_WATCH_ROOT different from --run-root -> exit 2")
out = os.path.join(WORK, "r1.json")
p = tool("run", "--arm", "live", "--run-root", run_root, "--bodies", BODIES, "--now", NOW, "--out", out,
         "--skip-egress-check", "--skip-memory-check", root=PRISTINE)
check("R1 mismatched root refused", p.returncode == 2, p.stderr)

shutil.rmtree(WORK, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
