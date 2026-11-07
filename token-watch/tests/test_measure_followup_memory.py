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
print("I2 expect: a body with a multibyte name -> the index stores UTF-8 BYTES and reports the field divergence")
MB = os.path.join(WORK, "multibyte")
for d in ("due", os.path.join("provenance", "follow-up")):
    os.makedirs(os.path.join(MB, d))
mb_body = json.dumps(dict(body("MBX"), pairs=[dict(body("MBX")["pairs"][0], baseToken={"address": "MBX", "name": "Döge 猫", "symbol": "猫"})]),
                     ensure_ascii=False, sort_keys=True)
with open(os.path.join(MB, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"mint": "MBX", "source": "dexscreener_token_state", "body": mb_body, "bytes": len(mb_body)},
                        ensure_ascii=False) + chr(10))
p = tool("index", "--pristine", MB, "--out", os.path.join(WORK, "mb.sqlite"))
rep = json.loads(p.stdout) if p.returncode == 0 else {}
import sqlite3  # noqa: E402
stored = sqlite3.connect(os.path.join(WORK, "mb.sqlite")).execute("SELECT bytes FROM bodies").fetchone()[0] if rep else None
check("I2 bytes are UTF-8 bytes, and the divergence is counted", rep.get("bytes_field_vs_utf8_divergent") == 1
      and stored == len(mb_body.encode("utf-8")) and stored > len(mb_body), "%s stored=%s chars=%d" % (rep, stored, len(mb_body)))


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

# ── §6 AMENDMENT 1: derive-n, arm xn, arm sept ─────────────────────────────────────────────────────────────────────
# A second pristine tree whose captured bodies carry a MIX of pair counts (40 with 0, 40 with 1, 5 with 2, 2 with 3),
# under mints unrelated to the due buckets: arm sept chooses templates by class, not by mint.
def body_k(mint, k):
    b = body(mint)
    pair = b["pairs"][0]
    b["pairs"] = [dict(pair, pairAddress="PAIR%s_%d" % (mint, i)) for i in range(k)] if k else None
    return b


PRISTINE2 = os.path.join(WORK, "pristine2")
shutil.copytree(PRISTINE, PRISTINE2)
with open(os.path.join(PRISTINE2, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for k, n in ((0, 40), (1, 40), (2, 5), (3, 2)):
        for i in range(n):
            m = "TPL%d_%02d" % (k, i)
            t = json.dumps(body_k(m, k), sort_keys=True)
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t)}) + "\n")
BODIES2 = os.path.join(WORK, "bodies2.sqlite")
check("S0 index of the mixed tree", tool("index", "--pristine", PRISTINE2, "--out", BODIES2).returncode == 0)
SHAPE = os.path.join(WORK, "shape.json")
json.dump({"day": "2026-09-26", "share": {"0": 0.50052, "1": 0.486807, "2": 0.010978, "3+": 0.001695},
           "alive_share": 0.454697}, open(SHAPE, "w"))

print("N1 expect: derive-n -> size per class, the 2 and 3+ classes substituted (k x size(1)), N = E_sept / E_capture")
p = tool("derive-n", "--bodies", BODIES2, "--shape", SHAPE)
dn = json.loads(p.stdout) if p.returncode == 0 else {}
check("N1 exit 0 with counts 40/40/5/2", p.returncode == 0 and dn.get("counts") == {"0": 40, "1": 40, "2": 5, "3+": 2},
      p.stdout[-600:] + p.stderr[-600:])
check("N1 the thin classes are substituted and say so", len(dn.get("substitutions", [])) == 2
      and abs(dn["size_used"]["3+"] - 4 * dn["size_used"]["1"]) < 1e-6, str(dn.get("substitutions")))
check("N1 N is E_sept / E_capture and carries its label", dn.get("N") and abs(dn["N"] - dn["E_sept"] / dn["E_capture"]) < 1e-9
      and "never headroom" in dn.get("label", ""), str(dn))

print("N2 expect: under 30 one-pair bodies -> N VOID (exit 14)")
THIN = os.path.join(WORK, "thin")
shutil.copytree(PRISTINE, THIN)
with open(os.path.join(THIN, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for k, n in ((0, 40), (1, 10)):
        for i in range(n):
            m = "THN%d_%02d" % (k, i)
            t = json.dumps(body_k(m, k), sort_keys=True)
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t)}) + "\n")
BODIES_THIN = os.path.join(WORK, "thin.sqlite")
tool("index", "--pristine", THIN, "--out", BODIES_THIN)
p = tool("derive-n", "--bodies", BODIES_THIN, "--shape", SHAPE)
check("N2 exit 14, N void", p.returncode == 14 and "N VOID" in p.stdout, p.stdout[-400:])

print("N3 expect: under 30 NO-PAIRS bodies (40 one-pair) -> N VOID naming class 0 (exit 14)")
THIN0 = os.path.join(WORK, "thin0")
shutil.copytree(PRISTINE, THIN0)
with open(os.path.join(THIN0, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for k, n in ((0, 25), (1, 40)):
        for i in range(n):
            m = "TH0%d_%02d" % (k, i)
            t = json.dumps(body_k(m, k), sort_keys=True)
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t)}) + "\n")
BODIES_THIN0 = os.path.join(WORK, "thin0.sqlite")
tool("index", "--pristine", THIN0, "--out", BODIES_THIN0)
p = tool("derive-n", "--bodies", BODIES_THIN0, "--shape", SHAPE)
check("N3 exit 14, the void names the no-pairs class", p.returncode == 14 and "no-pairs" in p.stdout and "(C-3)" in p.stdout,
      p.stdout[-400:])
check("N1 the output carries each class's contribution to E_sept", set(dn.get("contribution_to_E_sept", {})) == {"0", "1", "2", "3+"}
      and abs(sum(dn["contribution_to_E_sept"].values()) - 1) < 1e-3, str(dn.get("contribution_to_E_sept")))

print("XN expect: arm xn with N = 6 pads five copies; served bytes ~6x the live arm's")
run_root_xn, _ = prepare("run-xn")
p, resn = run("xn", run_root_xn, "--n", "6")
check("XN exit 0", p.returncode == 0, p.stdout[-400:] + p.stderr[-1200:])
check("XN five pad copies, bytes ~6x", resn.get("pad_copies") == 5 and live_mean
      and 5.8 <= resn.get("served_body_bytes", {}).get("mean", 0) / live_mean <= 6.2, str(resn.get("served_body_bytes")))
check("XN fresh-parse control: parses == served", resn.get("parses") == resn.get("fanout", {}).get("served_bodies"),
      "%s vs %s" % (resn.get("parses"), resn.get("fanout")))
print("XN2 expect: N = 2.5 rounds UP (ceil) -> 2 pad copies, bytes ~3x; a missing --n and --n 0.5 refuse with a record")
run_root_xn2, _ = prepare("run-xn2")
p, resn2 = run("xn", run_root_xn2, "--n", "2.5")
check("XN2 ceil: 2 copies at N = 2.5", p.returncode == 0 and resn2.get("pad_copies") == 2, str(resn2.get("pad_copies")))
run_root_xn3, _ = prepare("run-xn3")
p, resn3 = run("xn", run_root_xn3)
check("XN2 a missing --n -> exit 2 with a void record, not a traceback", p.returncode == 2
      and "needs --n" in str(resn3.get("void")) and "Traceback" not in p.stderr, p.stderr[-300:])
p, resn4 = run("xn", run_root_xn3, "--n", "0.5")
check("XN2 --n 0.5 -> exit 2", p.returncode == 2 and "needs --n" in str(resn4.get("void")), str(resn4.get("void")))


def run2(arm, run_root, *extra):
    out = os.path.join(WORK, arm + "-" + os.path.basename(run_root) + ".json")
    p = tool("run", "--arm", arm, "--run-root", run_root, "--bodies", BODIES2, "--now", NOW, "--out", out,
             "--skip-memory-check", "--skip-egress-check", *extra, root=run_root)
    return p, (json.load(open(out)) if os.path.exists(out) else {})


print("D1 expect: arm sept -> exit 0; class-0 share near 0.50 (wiring), alive above the reference, Helius in range")
run_root_d, _ = prepare("run-sept")
p, resd = run2("sept", run_root_d, "--shape", SHAPE, "--wiring-tolerance", "0.15")
sd = resd.get("sept", {})
check("D1 exit 0", p.returncode == 0, str(resd.get("void")) + p.stderr[-1200:])
check("D1 the alive branch ran: alive lookups and synthetic Helius calls", resd.get("loop_alive", 0) > 0
      and 0 < resd.get("fanout", {}).get("synthetic_helius_calls", 0) <= 2 * resd["loop_alive"], str(resd.get("fanout")))
check("D1 alive share above the reference (adverse-safe)", sd.get("alive_share", 0) >= 0.454697, str(sd))
check("D1 the class-0 test is labelled a wiring control", "WIRING" in sd.get("class0_test", ""))
check("D1 fresh-parse control", resd.get("parses") == resd.get("fanout", {}).get("served_bodies"))
print("D2 expect: the same arm with a tolerance of 0.0001 -> wiring VOID (exit 13)")
run_root_d2, _ = prepare("run-sept2")
p, res2 = run2("sept", run_root_d2, "--shape", SHAPE, "--wiring-tolerance", "0.0001")
check("D2 exit 13 wiring", p.returncode == 13 and "wiring" in str(res2.get("void")), str(res2.get("void")))
print("D3 expect: a reference alive share of 0.95 -> realised alive BELOW it -> VOID (exit 13)")
SHAPE_HI = os.path.join(WORK, "shape_hi.json")
json.dump({"day": "x", "share": {"0": 0.50052, "1": 0.486807, "2": 0.010978, "3+": 0.001695}, "alive_share": 0.95},
          open(SHAPE_HI, "w"))
run_root_d3, _ = prepare("run-sept3")
p, res3 = run2("sept", run_root_d3, "--shape", SHAPE_HI, "--wiring-tolerance", "0.15")
check("D3 exit 13 alive below", p.returncode == 13 and "BELOW" in str(res3.get("void")), str(res3.get("void")))
print("D4 expect: under 30 one-pair templates -> arm sept NOT RUN (exit 11)")
run_root_d4, _ = prepare("run-sept4")
out4 = os.path.join(WORK, "sept4.json")
p = tool("run", "--arm", "sept", "--run-root", run_root_d4, "--bodies", BODIES_THIN, "--now", NOW, "--out", out4,
         "--skip-memory-check", "--skip-egress-check", "--shape", SHAPE, root=run_root_d4)
check("D4 exit 11 not run", p.returncode == 11 and "NOT RUN" in open(out4).read(), p.stdout[-300:])

# ── §6 AMENDMENT 2 ─────────────────────────────────────────────────────────────────────────────────────────────────
SHAPE_WIDE = os.path.join(WORK, "shape_wide.json")
json.dump({"day": "test", "share": {"0": 0.4, "1": 0.3, "2": 0.2, "3+": 0.1}, "alive_share": 0.3}, open(SHAPE_WIDE, "w"))
print("D5 expect: classes 2 and 3+ EMPTY (25/40/0/0) under a wide shape -> exit 0, both classes synthesised and labelled,"
      " no run_hour error (the old code divided by zero inside the loop and the error was swallowed)")
run_root_d5, _ = prepare("run-sept5")
out5 = os.path.join(WORK, "sept5.json")
p = tool("run", "--arm", "sept", "--run-root", run_root_d5, "--bodies", BODIES_THIN0, "--now", NOW, "--out", out5,
         "--skip-memory-check", "--skip-egress-check", "--shape", SHAPE_WIDE, "--wiring-tolerance", "0.2", root=run_root_d5)
r5 = json.load(open(out5)) if os.path.exists(out5) else {}
s5 = r5.get("sept", {})
check("D5 exit 0, errors 0", p.returncode == 0 and r5.get("stats", {}).get("errors") == 0, str(r5.get("void")) + p.stderr[-600:])
check("D5 both thin classes are labelled synthetic", "synthetic-shape" in s5.get("source", {}).get("2", "")
      and "synthetic-shape" in s5.get("source", {}).get("3+", "") and s5.get("source", {}).get("1", "").startswith("real"),
      str(s5.get("source")))
check("D5 synthetic bodies were actually served", s5.get("synthetic_shape_bodies", 0) > 0, str(s5.get("synthetic_shape_bodies")))
check("D5 the loop's own Helius calls are counted", r5.get("loop_synthetic_helius_calls", 0) > 0, str(r5.get("loop_synthetic_helius_calls")))
print("D6 expect: arm sept without --shape -> exit 2 WITH a void record")
run_root_d6, _ = prepare("run-sept6")
out6 = os.path.join(WORK, "sept6.json")
p = tool("run", "--arm", "sept", "--run-root", run_root_d6, "--bodies", BODIES2, "--now", NOW, "--out", out6,
         "--skip-memory-check", "--skip-egress-check", root=run_root_d6)
check("D6 exit 2 and a record", p.returncode == 2 and os.path.exists(out6) and "--shape" in json.load(open(out6)).get("void", ""),
      p.stderr[-300:])
print("E15 expect: a captured body whose extraction raises (volume 'x') -> run_hour counts an error -> VOID exit 15")
BAD = os.path.join(WORK, "bad")
shutil.copytree(PRISTINE, BAD)
bad_lines = open(os.path.join(BAD, "provenance", "follow-up", "2026-10-01.jsonl"), encoding="utf-8").read().splitlines()
first = json.loads(bad_lines[0])
broken = json.loads(first["body"])
broken["pairs"][0]["volume"] = {"h24": "x"}
first["body"] = json.dumps(broken, sort_keys=True)
bad_lines[0] = json.dumps(first)
open(os.path.join(BAD, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8").write(chr(10).join(bad_lines) + chr(10))
BODIES_BAD = os.path.join(WORK, "bad.sqlite")
tool("index", "--pristine", BAD, "--out", BODIES_BAD)
run_root_e15, _ = prepare("run-e15")
out15 = os.path.join(WORK, "e15.json")
p = tool("run", "--arm", "live", "--run-root", run_root_e15, "--bodies", BODIES_BAD, "--now", NOW, "--out", out15,
         "--skip-memory-check", "--skip-egress-check", "--min-served-share", "0.9", root=run_root_e15)
r15 = json.load(open(out15)) if os.path.exists(out15) else {}
check("E15 exit 15 naming the errors", p.returncode == 15 and "error" in str(r15.get("void")), "rc=%s %s" % (p.returncode, r15.get("void")))
check("R2 the result records the bodies file size", r5.get("bodies_file_bytes", 0) > 0)

print("SY expect: _synthesise(k=4) gives FOUR INDEPENDENT pairs (no shared nested object), distinct pairAddress, ~4x the bytes")
tmpl_text = json.dumps(body_k("SYNTH", 1), sort_keys=True)
syn = json.loads(mfm._synthesise(tmpl_text, 4))
ps = syn["pairs"]
check("SY four pairs, distinct pairAddress", len(ps) == 4 and len({p["pairAddress"] for p in ps}) == 4, str([p.get("pairAddress") for p in ps]))
check("SY no nested object shared across pairs (txns, volume, baseToken)",
      all(ps[0][f] is not ps[1][f] for f in ("txns", "volume", "baseToken")))
ratio = len(mfm._synthesise(tmpl_text, 4).encode("utf-8")) / len(tmpl_text.encode("utf-8"))
check("SY ~4x the template's bytes", 3.3 <= ratio <= 4.1, "ratio %.3f" % ratio)
print("SB expect: in D5 (class 3+ synthesised at k = 4), the largest served body is ~4x the class-1 mean, not the template's size")
c1_mean = sqlite3.connect(BODIES_THIN0).execute("SELECT avg(bytes) FROM bodies WHERE pairs = 1").fetchone()[0]
mx = r5.get("served_body_bytes", {}).get("max", 0)
check("SB served bytes measure the body SERVED", c1_mean and 3.3 <= mx / c1_mean <= 4.1, "max %s, class-1 mean %s" % (mx, c1_mean))
print("DN expect: derive-n with an invalid --shape -> exit 2 with a reason, not a bare exit 1")
BADSHAPE = os.path.join(WORK, "badshape.json")
json.dump({"share": {"0": 1.0}}, open(BADSHAPE, "w"))
p = tool("derive-n", "--bodies", BODIES2, "--shape", BADSHAPE)
check("DN exit 2", p.returncode == 2 and "void" in p.stderr, "rc=%s %s" % (p.returncode, p.stderr[-300:]))

shutil.rmtree(WORK, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
