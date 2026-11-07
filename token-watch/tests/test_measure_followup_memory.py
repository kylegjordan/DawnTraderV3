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

# ── I1: index ──────────────────────────────────────────────────────────────────────────────────────────────────────
print("I1 expect: 134 bodies indexed (144 mints, the last 10 without a body)")
p = tool("index", "--pristine", PRISTINE, "--out", BODIES)
check("I1 indexed 134", p.returncode == 0 and json.loads(p.stdout)["indexed"] == 134, p.stdout + p.stderr)
check("I1 refuses to overwrite", tool("index", "--pristine", PRISTINE, "--out", BODIES).returncode == 2)
check("I1 refuses the production store", tool("index", "--pristine", "/var/lib/token-watch", "--out",
                                               os.path.join(WORK, "x.sqlite")).returncode == 2)


def prepare(name):
    run_root = os.path.join(WORK, name)
    p = tool("prepare", "--pristine", PRISTINE, "--run-root", run_root, "--now", NOW, "--skip-bodies")
    return run_root, p


# ── P1: prepare makes the ledger history faithful to NOW ───────────────────────────────────────────────────────────
print("P1 expect: October cut to the 2 rows <= NOW, November removed")
run_root, p = prepare("run-live")
rep = json.loads(p.stdout) if p.returncode == 0 else {}
check("P1 October cut", rep.get("journals", {}).get("spend-journal-2026-10.jsonl", {}).get("rows_kept") == 2
      and rep["journals"]["spend-journal-2026-10.jsonl"]["rows_cut"] == 1, p.stdout + p.stderr)
check("P1 November removed", not os.path.exists(os.path.join(run_root, "state", "spend-journal-2026-11.jsonl")))
check("P1 refuses an existing run dir", prepare("run-live")[1].returncode == 2)


def run(arm, run_root, *extra):
    out = os.path.join(WORK, arm + "-" + os.path.basename(run_root) + ".json")
    p = tool("run", "--arm", arm, "--run-root", run_root, "--bodies", BODIES, "--now", NOW, "--out", out,
             "--skip-egress-check", *extra, root=run_root)
    res = json.load(open(out)) if os.path.exists(out) else {}
    return p, res


# ── L1: the live arm ───────────────────────────────────────────────────────────────────────────────────────────────
print("L1 expect: 48 buckets, 144 due, 2 requeued; 142 call-site token_state; bodies served, no-body counted apart")
p, res = run("live", run_root)
st, fo = res.get("stats", {}), res.get("fanout", {})
check("L1 exit 0", p.returncode == 0, p.stdout[-800:] + p.stderr[-1500:])
check("L1 read the 48 buckets", st.get("buckets_read") == 48, str(st))
check("L1 due 144, requeued 2", st.get("due") == 144 and st.get("requeued_not_yet_due") == 2, str(st))
check("L1 call-site count = due - requeued", fo.get("call_site_token_state") == 142, str(fo))
check("L1 no extraction errors on the shape-true body", st.get("errors") == 0, str(st))
check("L1 served + no-body + synthetic = egress", fo.get("served_bodies", 0) + fo.get("no_body_mints", 0)
      + fo.get("synthetic_helius_calls", 0) == fo.get("egress"), str(fo))
check("L1 the uncaptured mints were counted apart: 10 without a body, minus the 2 requeued, plus promote's 3 = 11",
      fo.get("no_body_mints") == 11, str(fo))
check("L1 POSITIVE CONTROL: promote made its own token_state calls (so the call-site count discriminates)",
      (res.get("stats", {}).get("promote") or {}).get("checked", 0) + (res.get("stats", {}).get("promote") or {})
      .get("unresolved_no_pairs", 0) >= 1, str(res.get("stats", {}).get("promote")))
check("L1 the Helius leg ran, synthetic, counted", fo.get("synthetic_helius_calls", 0) > 0, str(fo))

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

# ── R1: refusals ───────────────────────────────────────────────────────────────────────────────────────────────────
print("R1 expect: TOKEN_WATCH_ROOT different from --run-root -> exit 2")
out = os.path.join(WORK, "r1.json")
p = tool("run", "--arm", "live", "--run-root", run_root, "--bodies", BODIES, "--now", NOW, "--out", out,
         "--skip-egress-check", root=PRISTINE)
check("R1 mismatched root refused", p.returncode == 2, p.stderr)

shutil.rmtree(WORK, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
