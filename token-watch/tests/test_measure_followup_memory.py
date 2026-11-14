"""
token-watch — the P1 replay harness (B-TOKEN-WATCH-FOLLOWUP-MEMORY). A small pristine store is built here, then
`index`, `prepare` and `run` are driven exactly as on the box, each `run` in its own process (config reads
TOKEN_WATCH_ROOT at import). The egress check is skipped (no systemd unit here); everything else is real.

Each block states its expectation first. Run:  python3 token-watch/tests/test_measure_followup_memory.py  (exit 0 = all pass)
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone


def SHA(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

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
                             "observed_at": "2026-11-07T00:00:00+00:00", "sha256": SHA(b)}) + "\n")
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
    fh.write(json.dumps({"mint": "M000", "source": "dexscreener_token_state", "body": b, "bytes": len(b), "sha256": SHA(b)}) + "\n")
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
    fh.write(json.dumps({"mint": "MBX", "source": "dexscreener_token_state", "body": mb_body, "bytes": len(mb_body), "sha256": SHA(mb_body)},
                        ensure_ascii=False) + chr(10))
p = tool("index", "--pristine", MB, "--out", os.path.join(WORK, "mb.sqlite"))
rep = json.loads(p.stdout) if p.returncode == 0 else {}
import sqlite3  # noqa: E402
row = sqlite3.connect(os.path.join(WORK, "mb.sqlite")).execute("SELECT body, bytes FROM bodies").fetchone() if rep else (None, None)
venue = json.dumps(json.loads(mb_body), separators=(",", ":"), ensure_ascii=False)   # the venue encoding, built here
stored = row[1]
check("I2 bytes are UTF-8 bytes of the VENUE encoding, and the field divergence is counted",
      rep.get("bytes_field_vs_utf8_divergent") == 1 and row[0] == venue
      and stored == len(venue.encode("utf-8")) and stored > len(venue), "%s stored=%s chars=%d" % (rep, stored, len(venue)))
check("I2 the re-encoding is reported: stored-form total above venue-form total",
      rep.get("stored_encoding_bytes_total", 0) == len(mb_body.encode("utf-8")) > rep.get("venue_encoding_bytes_total", 0) == stored,
      str(rep))


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
print("A2 expect: a held periodic.lock in a fresh run dir (the killed run's leftover) -> run_hour skips -> VOID 'no work', exit 16 (was: exit 0, all_shed control 'satisfied' by 0 == 0)")
run_root_l, _ = prepare("run-locked")
os.makedirs(os.path.join(run_root_l, "state"), exist_ok=True)
open(os.path.join(run_root_l, "state", "periodic.lock"), "w").write("follow_up 1 2026-11-14T06:25:00+00:00")
p, res = run("all_shed", run_root_l)
check("A2 exit 16 (no work)", p.returncode == 16, "rc=%s %s" % (p.returncode, p.stderr[-800:]))
check("A2 void names the skip and the zero", "no work" in str(res.get("void")) and "skipped=True" in str(res.get("void"))
      and res.get("due_minus_requeued") == 0, str(res.get("void")))
print("A3 expect: the same guard on the live arm (it is every arm's): live on a locked run dir -> exit 16")
run_root_l2, _ = prepare("run-locked-live")
os.makedirs(os.path.join(run_root_l2, "state"), exist_ok=True)
open(os.path.join(run_root_l2, "state", "periodic.lock"), "w").write("follow_up 1 2026-11-14T06:25:00+00:00")
p, res = run("live", run_root_l2)
check("A3 exit 16 on live too", p.returncode == 16, "rc=%s %s" % (p.returncode, p.stderr[-800:]))
print("A4 expect: a NON-skipped empty hour (all 48 due buckets present and emptied) -> skipped False, due 0 -> exit 16")
run_root_e, _ = prepare("run-empty")
emptied = 0
for fn in os.listdir(os.path.join(run_root_e, "due")):
    open(os.path.join(run_root_e, "due", fn), "w").close()
    emptied += 1
p, res = run("all_shed", run_root_e)
check("A4 exit 16 on an empty, unskipped hour", p.returncode == 16 and "skipped=False" in str(res.get("void"))
      and res.get("stats", {}).get("buckets_read") == 48, "rc=%s emptied=%d %s" % (p.returncode, emptied, res.get("void")))
print("A5 expect: --now 10 h early -> only part of the 48 buckets read -> VOID 'partial population', exit 17")
run_root_p, _ = prepare("run-partial")
early = (datetime.fromisoformat(NOW) - timedelta(hours=10)).isoformat()
out_p = os.path.join(WORK, "partial.json")
p = tool("run", "--arm", "all_shed", "--run-root", run_root_p, "--bodies", BODIES, "--now", early, "--out", out_p,
         "--skip-memory-check", "--skip-egress-check", root=run_root_p)
res = json.load(open(out_p)) if os.path.exists(out_p) else {}
check("A5 exit 17 on a partial read", p.returncode == 17 and "partial population" in str(res.get("void"))
      and 0 < res.get("stats", {}).get("buckets_read", 0) < 48, "rc=%s %s %s" % (p.returncode, res.get("void"), p.stderr[-600:]))

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
print("E1 expect: with no deny, a literal probe's UDP send goes out -> VOID exit 6 (listener up or down alike)")
import socket  # noqa: E402
srv = socket.socket()
srv.bind(("127.0.0.1", 0))
srv.listen(1)
port = srv.getsockname()[1]
run_root_e, _ = prepare("run-egress")
p, res = run("live", run_root_e, "--egress-probe", "127.0.0.1:%d" % port, skip_egress=False)
check("E1 no deny, listener up -> void", p.returncode == 6 and "SUCCEEDED" in str(res.get("void")), "rc=%s %s" % (p.returncode, res.get("void")))
srv.close()
p, res = run("live", run_root_e, "--egress-probe", "127.0.0.1:%d" % port, skip_egress=False)
check("E1 no deny, port closed -> still void (a refused TCP connect is not a deny)",
      p.returncode == 6 and "SUCCEEDED" in str(res.get("void")), "rc=%s %s" % (p.returncode, res.get("void")))

# ── E2: the control's verdicts, in-process, socket outcomes injected (Step 7: staging's deny = UDP EPERM + TCP timeout)
print("E2 expect: UDP EPERM + TCP timeout -> proven (staging's measured shape); every other shape -> not proven")


class _FakeUdp:
    def __init__(self, outcome):
        self.outcome = outcome

    def sendto(self, data, addr):
        if self.outcome is not None:
            raise OSError(self.outcome, os.strerror(self.outcome))

    def close(self):
        pass


def _egress_with(udp_errno, tcp, probes=("1.1.1.1:443", "api.dexscreener.com:443")):
    """udp_errno: None = the send goes out; tcp: 'timeout' | 'connect' | an errno."""
    real_sock, real_cc = mfm.socket.socket, mfm.socket.create_connection
    udp_calls = []

    def fake_sock(family=-1, type=-1, *a, **k):
        udp_calls.append(type)
        return _FakeUdp(udp_errno)

    def fake_cc(addr, timeout=None):
        if tcp == "connect":
            return _FakeUdp(None)
        if tcp == "timeout":
            raise TimeoutError("timed out")
        raise OSError(tcp, os.strerror(tcp))
    mfm.socket.socket, mfm.socket.create_connection = fake_sock, fake_cc
    try:
        return mfm._egress_control(list(probes)), udp_calls
    finally:
        mfm.socket.socket, mfm.socket.create_connection = real_sock, real_cc


import errno as _errno  # noqa: E402
(ok, why), calls = _egress_with(_errno.EPERM, "timeout")
check("E2 UDP EPERM + TCP timeout -> proven", ok and "UDP send refused (EPERM)" in why, why)
check("E2 the UDP probe is a datagram socket, once (the literal only)", calls == [socket.SOCK_DGRAM], str(calls))
(ok, why), _ = _egress_with(_errno.EACCES, _errno.EPERM)
check("E2 UDP EACCES + TCP EPERM -> proven", ok, why)
(ok, why), _ = _egress_with(_errno.EPERM, "connect")
check("E2 UDP EPERM but TCP CONNECTS -> not proven", not ok and "SUCCEEDED" in why, why)
(ok, why), _ = _egress_with(None, "timeout")
check("E2 UDP send goes out -> not proven", not ok and "UDP send" in why and "SUCCEEDED" in why, why)
(ok, why), _ = _egress_with(_errno.ENETUNREACH, "timeout")
check("E2 UDP ENETUNREACH -> not proof of a deny", not ok and "not EPERM" in why, why)
(ok, why), calls = _egress_with(_errno.EPERM, "timeout", probes=("api.dexscreener.com:443",))
check("E2 hostname only, TCP timeout -> not proven (no literal probe)", not ok and "no literal-IP probe" in why and calls == [], why)

# ── E3: Langston r7 riders — a DNS failure is "not attempted", IPv6 is refused, two literal /8s by default ──────────
print("E3 expect: gaierror -> 'not attempted (DNS failure)'; an IPv6 probe -> refused; default probes hold 2 literal /8s")


def _egress_dns(probes):
    real_sock, real_cc = mfm.socket.socket, mfm.socket.create_connection

    def fake_cc(addr, timeout=None):
        if all(ch.isdigit() or ch == "." for ch in addr[0]):
            raise TimeoutError("timed out")
        raise socket.gaierror(-3, "Temporary failure in name resolution")
    mfm.socket.socket = lambda *a, **k: _FakeUdp(_errno.EPERM)
    mfm.socket.create_connection = fake_cc
    try:
        return mfm._egress_control(list(probes))
    finally:
        mfm.socket.socket, mfm.socket.create_connection = real_sock, real_cc


ok, why = _egress_dns(("1.1.1.1:443", "api.dexscreener.com:443"))
check("E3 DNS failure reads 'not attempted', never 'refused'",
      ok and "api.dexscreener.com:443 TCP not attempted (DNS failure)" in why and "gaierror" not in why, why)
(ok, why), calls = _egress_with(_errno.EPERM, "timeout", probes=("[2606:4700::1111]:443", "1.1.1.1:443"))
check("E3 an IPv6 probe is refused, not parsed into a non-proof leg", not ok and "IPv6" in why and calls == [], why)
(ok, why), calls = _egress_with(_errno.EPERM, "timeout", probes=("2606:4700::1111:443",))
check("E3 a bare IPv6 probe is refused too", not ok and "IPv6" in why, why)
lits = [x.rsplit(":", 1)[0] for x in mfm.DEFAULT_EGRESS_PROBES if all(c.isdigit() or c in ".:" for c in x)]
check("E3 the default probes hold two literals in different /8s",
      len(lits) == 2 and len({x.split(".")[0] for x in lits}) == 2, str(mfm.DEFAULT_EGRESS_PROBES))

# ── T1: --trace reaches the identity map ───────────────────────────────────────────────────────────────────────────
print("T1 expect: --trace writes snapshots, including around summary._identity_map (A2's site)")
run_root_t, _ = prepare("run-trace")
tdir = os.path.join(WORK, "trace")
p, res = run("live", run_root_t, "--trace", tdir)
names = sorted(os.listdir(tdir)) if os.path.isdir(tdir) else []
check("T1 exit 0", p.returncode == 0, p.stderr[-1500:])
check("T1 identity map bracketed", any("before-summary._identity_map" in n for n in names)
      and any("after-summary._identity_map" in n for n in names), str(names))

# ── S1: --sample (P2a) - markers at every stage Langston named, cgroup fields parsed, start/end bracket ───────────
print("S1 expect: --sample writes start, samples, the stage markers in order (incl. inside summary.build) and end")
cgs = os.path.join(WORK, "cg-sample")
os.makedirs(cgs)
open(os.path.join(cgs, "memory.max"), "w").write("536870912\n")
open(os.path.join(cgs, "memory.current"), "w").write("123456789\n")
open(os.path.join(cgs, "memory.peak"), "w").write("234567890\n")
open(os.path.join(cgs, "memory.events"), "w").write("low 0\nhigh 0\nmax 7\noom 0\noom_kill 0\n")
open(os.path.join(cgs, "memory.stat"), "w").write(
    "anon 1000\nfile 2000\nkernel_stack 30\npagetables 40\nshmem 5\nfile_dirty 6\nfile_writeback 7\n"
    "slab_reclaimable 8\nslab_unreclaimable 9\npgscan 10\npgsteal 11\n")
run_root_s, _ = prepare("run-sample")
sfile = os.path.join(WORK, "samples.jsonl")
p, res = run("live", run_root_s, "--cgroup-dir", cgs, "--sample", sfile, "--sample-interval", "0.02", skip_memory=False)
lines = [json.loads(x) for x in open(sfile, encoding="utf-8")] if os.path.exists(sfile) else []
marks = [x.get("stage") for x in lines if x.get("kind") == "mark"]
check("S1 exit 0", p.returncode == 0, p.stderr[-1500:])
check("S1 first line is start, last is end", lines and lines[0]["kind"] == "start" and lines[-1]["kind"] == "end",
      str([x.get("kind") for x in lines[:2] + lines[-2:]]))
check("S1 seq is 1..n with no gap", [x["seq"] for x in lines] == list(range(1, len(lines) + 1)))
want = ["after-follow_up.dead_set", "before-summary.build", "after-summary._fold", "before-summary.tombstone_path",
        "before-summary._oldest_survivors", "after-summary._oldest_survivors", "before-summary._latest_observations",
        "before-summary._identity_map", "after-summary._identity_map", "after-summary.build"]
check("S1 every named stage marker present", all(w in marks for w in want), str([w for w in want if w not in marks]))
# in ORDER: each stage searched for after the previous one. tombstone_path is also called inside _fold
# (summary.py:153, the new-tombstone offset read), so the dead-set read's marker is the one AFTER after-summary._fold.
pos, at = [], -1
for w in want[1:5] + want[9:]:
    at = marks.index(w, at + 1) if w in marks[at + 1:] else -1
    pos.append(at)
    if at < 0:
        break
check("S1 inside summary.build in order: _fold, the dead-set read, _oldest_survivors, ... build ends", -1 not in pos,
      str(pos))
loops = [x for x in lines if x.get("stage") == "loop"]
ends = [x for x in lines if x.get("stage") == "loop-end"]
check("S1 a loop marker at entry 0 and a loop-end carrying the entry count", loops and loops[0].get("entries") == 0
      and ends and ends[0].get("entries") == res.get("stats", {}).get("due"),
      "loop0=%s end=%s due=%s" % (loops[:1], ends[:1], res.get("stats", {}).get("due")))
m0 = next((x for x in lines if x.get("stage") == "after-summary.build"), {})
check("S1 a marker carries the cgroup reads", m0.get("memory_current") == 123456789 and m0.get("memory_peak") == 234567890
      and m0.get("events") == {"max": 7, "oom": 0, "oom_kill": 0}, str({k: m0.get(k) for k in ("memory_current", "memory_peak", "events")}))
check("S1 memory.stat: exactly the ten named keys, shmem not among them", m0.get("stat") == {
    "anon": 1000, "file": 2000, "kernel_stack": 30, "pagetables": 40, "file_dirty": 6, "file_writeback": 7,
    "slab_reclaimable": 8, "slab_unreclaimable": 9, "pgscan": 10, "pgsteal": 11}, str(m0.get("stat")))
check("S1 a marker carries the Python counters (A-3)", isinstance(m0.get("allocated_blocks"), int)
      and isinstance(m0.get("len_prev"), int) and isinstance(m0.get("len_dead_cache"), int),
      str({k: m0.get(k) for k in ("allocated_blocks", "len_prev", "len_dead_cache")}))
check("S1 the result names the side file", res.get("sample_file") == sfile, str(res.get("sample_file")))

# ── S2: a line written before a SIGKILL survives it (the reason the sampler uses os.write, R3 C-2) ─────────────────
print("S2 expect: a process that writes two lines and then SIGKILLs itself leaves both lines whole")
kfile = os.path.join(WORK, "killed.jsonl")
code = ("import os, signal, sys; sys.path.insert(0, %r); import measure_followup_memory as m; "
        "s = m.Sampler(%r, None, 3600); s.write('start'); s.mark('before-kill'); os.kill(os.getpid(), signal.SIGKILL)"
        % (os.path.join(HERE, "tools"), kfile))
pk = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
klines = [json.loads(x) for x in open(kfile, encoding="utf-8")] if os.path.exists(kfile) else []
check("S2 the process was killed", pk.returncode == -9, "rc=%s %s" % (pk.returncode, pk.stderr[-300:]))
check("S2 both lines survive, whole", [x.get("kind") for x in klines] == ["start", "mark"], str(klines))

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
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t), "sha256": SHA(t)}) + "\n")
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
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t), "sha256": SHA(t)}) + "\n")
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
            fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": t, "bytes": len(t), "sha256": SHA(t)}) + "\n")
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
first["sha256"] = SHA(first["body"])                 # a deliberately edited body carries its own digest
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

print("SY expect: _synthesise(k=4) returns TEXT holding four pairs with distinct pairAddress, ~4x the bytes")
# The copy depth is NOT fenced here (Langston, Step 4, 2026-11-07): _synthesise's internal dict shares the
# nested objects across pairs (dict() is shallow), and json.loads of ANY text returns independent objects, so a
# no-shared-object assertion on the parsed result cannot fail. The cure is that the function returns TEXT; the
# live fence on a shared graph is the C-6 control, parses == served. Do not cite SY as proof of a deep copy.
# The template is a COMPACT, multibyte body written here as a literal, the venue's form (Langston, Step 4,
# 2026-11-07): a fixture written with json.dumps(sort_keys=True) would put numerator and denominator in the same
# inflated encoding and re-ratify the bias. Every other fixture in this file is that inflated form, which is why
# this one is a literal.
tmpl_text = ('{"schemaVersion":"1.0.0","pairs":[{"chainId":"solana","pairAddress":"PSYN","baseToken":'
             '{"address":"SYNTH","name":"Döge 猫","symbol":"🚀"},"txns":{"h24":{"buys":3,"sells":1}},'
             '"volume":{"h24":12.5},"liquidity":{"usd":900.0},"priceUsd":"0.0001"}]}')
check("SE the encoder reproduces a compact multibyte venue body byte-exact",
      mfm._venue_text(json.loads(tmpl_text)) == tmpl_text, mfm._venue_text(json.loads(tmpl_text)))
syn_text = mfm._synthesise(tmpl_text, 4)
check("SY returns text, not a shared object", isinstance(syn_text, str), type(syn_text).__name__)
ps = json.loads(syn_text)["pairs"]
check("SY four pairs, distinct pairAddress", len(ps) == 4 and len({p["pairAddress"] for p in ps}) == 4, str([p.get("pairAddress") for p in ps]))
want = json.loads(tmpl_text)
want["pairs"] = [dict(want["pairs"][0], pairAddress="PSYN~%d" % i) for i in range(4)]
check("SE the synthesised body is byte-exact the venue encoding of a real 4-pair body",
      syn_text == json.dumps(want, separators=(",", ":"), ensure_ascii=False), syn_text[:160])
for label, bad in (("no pairs", '{"schemaVersion":"1.0.0","pairs":null}'),
                   ("two pairs", '{"pairs":[{"pairAddress":"A"},{"pairAddress":"B"}]}'),
                   ("no pairAddress", '{"pairs":[{"chainId":"solana"}]}')):
    try:                                         # any exception is caught, so a mutation fails here with a tally
        mfm._synthesise(bad, 4)
        raised = "nothing"
    except Exception as e:                       # noqa: BLE001
        raised = type(e).__name__
    check("SR _synthesise refuses a template with %s (ValueError, by its own check)" % label, raised == "ValueError", raised)

print("I3 expect: a record whose sha256 does not match its body -> the index REFUSES (the digest's last check)")
BADSHA = os.path.join(WORK, "badsha")
os.makedirs(os.path.join(BADSHA, "provenance", "follow-up"))
with open(os.path.join(BADSHA, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for m in ("GOOD1", "BAD01"):
        bb = json.dumps(body(m), sort_keys=True)
        fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": bb, "bytes": len(bb),
                             "sha256": SHA(bb) if m == "GOOD1" else SHA(bb + " ")}) + "\n")
p = tool("index", "--pristine", BADSHA, "--out", os.path.join(WORK, "badsha.sqlite"))
check("I3 refused, naming the mint", p.returncode == 2 and "sha256" in p.stderr and "BAD01" in p.stderr
      and not os.path.exists(os.path.join(WORK, "badsha.sqlite")), "rc=%s %s" % (p.returncode, p.stderr))

print("EC expect: an all-ASCII index is 'moot'; a non-ASCII one is 'pending' and derive-n refuses until encoding-check")
v_ascii = sqlite3.connect(BODIES_THIN0).execute("SELECT verdict FROM encoding_check").fetchone()[0]
check("EC an all-ASCII index reads moot", v_ascii == "moot", v_ascii)
MBDB = os.path.join(WORK, "mb.sqlite")
v_mb, d_mb = sqlite3.connect(MBDB).execute("SELECT verdict, detail FROM encoding_check").fetchone()
check("EC a non-ASCII index reads pending, naming its most non-ASCII mint",
      v_mb == "pending" and json.loads(d_mb)["mint"] == "MBX", "%s %s" % (v_mb, d_mb))
SHAPE_F = os.path.join(WORK, "ec-shape.json")
with open(SHAPE_F, "w", encoding="utf-8") as fh:
    json.dump({"share": {"0": 0.5, "1": 0.48, "2": 0.015, "3+": 0.005}, "alive_share": 0.45}, fh)
p = tool("derive-n", "--bodies", MBDB, "--shape", SHAPE_F)
check("EC derive-n refuses a pending index, exit 2 with the reason", p.returncode == 2 and "encoding" in p.stderr,
      "rc=%s %s" % (p.returncode, p.stderr[-200:]))
mb_obj = json.loads(sqlite3.connect(MBDB).execute("SELECT body FROM bodies").fetchone()[0])
cases = (("raw UTF-8 (the venue as stated)", json.dumps(mb_obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
          0, "confirmed"),
         ("escaped non-ASCII", json.dumps(mb_obj, separators=(",", ":")).encode("utf-8"), 4, "venue-escapes"),
         ("an all-ASCII fresh reply", json.dumps(body("MBX"), separators=(",", ":")).encode("utf-8"), 3, "unsettled"),
         # MIXED: raw UTF-8 for one name and an escape for another — high bytes present, so only the "no escape"
         # half of the confirm rule can refuse it (the all-escaped case above has no high byte at all)
         ("mixed raw and escaped", json.dumps(mb_obj, separators=(",", ":"), ensure_ascii=False)
          .replace("猫", "\\u732b", 1).encode("utf-8"), 4, "venue-escapes"))
real_fetch = mfm._fetch_raw
for i, (label, raw, want_rc, want_v) in enumerate(cases):
    dbc = os.path.join(WORK, "ec-%d.sqlite" % i)
    shutil.copy(MBDB, dbc)
    mfm._fetch_raw = lambda mint, raw=raw: raw
    rc = mfm.main(["encoding-check", "--bodies", dbc])
    got = sqlite3.connect(dbc).execute("SELECT verdict FROM encoding_check").fetchone()[0]
    check("EC %s -> exit %d, verdict %s" % (label, want_rc, want_v), rc == want_rc and got == want_v,
          "rc=%s verdict=%s" % (rc, got))
mfm._fetch_raw = real_fetch
p = tool("derive-n", "--bodies", os.path.join(WORK, "ec-0.sqlite"), "--shape", SHAPE_F)
check("EC once confirmed, derive-n is no longer refused for the encoding",
      "encoding" not in p.stderr and p.returncode in (0, 14), "rc=%s %s" % (p.returncode, p.stderr[-200:]))

print("EP expect: a NAME holding the literal text \\u00e9 is not an escape (backslash parity); a real one is")
lit = {"pairs": [{"pairAddress": "P", "baseToken": {"address": "L", "name": "\\u00e9 cat", "symbol": "猫"}}]}
raw_lit = json.dumps(lit, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
check("EP the literal-name reply reads confirmed (0 real escapes)",
      mfm._non_ascii_escapes(raw_lit) == 0 and mfm._judge("L", raw_lit)["verdict"] == "confirmed",
      str(mfm._judge("L", raw_lit)))
raw_esc = json.dumps(lit, separators=(",", ":")).encode("utf-8")          # 猫 escaped for real, name literal kept
check("EP a real escape beside the literal one is counted once", mfm._non_ascii_escapes(raw_esc) == 1, str(raw_esc[:120]))
check("EP an escaped backslash before a real escape (\\\\\\u732b) still counts",
      mfm._non_ascii_escapes(b'"a\\\\\\u732b"') == 1 and mfm._non_ascii_escapes(b'"a\\\\u732b"') == 0)

print("EW expect: the walk steps past a mint whose fresh reply cannot discriminate, to the next non-ASCII mint")
WALK = os.path.join(WORK, "walk")
os.makedirs(os.path.join(WALK, "provenance", "follow-up"))
wbodies = {"W1": dict(body("W1"), pairs=[dict(body("W1")["pairs"][0], baseToken={"address": "W1", "name": "猫猫猫", "symbol": "W"})]),
           "W2": dict(body("W2"), pairs=[dict(body("W2")["pairs"][0], baseToken={"address": "W2", "name": "é", "symbol": "W"})]),
           "W3": body("W3")}
with open(os.path.join(WALK, "provenance", "follow-up", "2026-10-01.jsonl"), "w", encoding="utf-8") as fh:
    for m, ob in wbodies.items():
        bb = json.dumps(ob, sort_keys=True)
        fh.write(json.dumps({"mint": m, "source": "dexscreener_token_state", "body": bb, "bytes": len(bb), "sha256": SHA(bb)}) + "\n")
WDB = os.path.join(WORK, "walk.sqlite")
tool("index", "--pristine", WALK, "--out", WDB)
fresh = {"W1": json.dumps(body("W1"), separators=(",", ":")).encode("utf-8"),            # relisted: no non-ASCII now
         "W2": json.dumps(wbodies["W2"], separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
         "W3": json.dumps(body("W3"), separators=(",", ":")).encode("utf-8")}
calls = []
mfm._fetch_raw = lambda mint: (calls.append(mint), fresh[mint])[1]
for label, argv, want_rc, want_v, want_calls in (
        ("walk W1 (unsettled) -> W2 (confirmed); the ASCII mint W3 is never tried", [], 0, "confirmed", ["W1", "W2"]),
        ("--max-tries 1 stops after W1 -> unsettled", ["--max-tries", "1"], 3, "unsettled", ["W1"]),
        ("--mint W2 judges only W2", ["--mint", "W2"], 0, "confirmed", ["W2"])):
    dbw = os.path.join(WORK, "walk-%d.sqlite" % len(want_calls) + label[:2].strip())
    shutil.copy(WDB, dbw)
    del calls[:]
    rc = mfm.main(["encoding-check", "--bodies", dbw] + argv)
    v, det = sqlite3.connect(dbw).execute("SELECT verdict, detail FROM encoding_check").fetchone()
    check("EW %s" % label, rc == want_rc and v == want_v and calls == want_calls
          and len(json.loads(det)["attempts"]) == len(want_calls), "rc=%s v=%s calls=%s" % (rc, v, calls))
del calls[:]
rc = mfm.main(["encoding-check", "--bodies", BODIES_THIN0, "--mint", "ANY"])
check("EW --mint on a moot index is refused and fetches nothing", rc == 2 and calls == [], "rc=%s calls=%s" % (rc, calls))

print("EG expect: encoding-check REFUSES (exit 2, no fetch, nothing written) on a missing, non-SQLite, pre-gate or empty index")
missing = os.path.join(WORK, "no-such-index.sqlite")
nonsql = os.path.join(WORK, "eg-not-sqlite.sqlite")
nonsql_bytes = b"this exists, but is not a sqlite database\n"
with open(nonsql, "wb") as fh:
    fh.write(nonsql_bytes)
nogate, empty = os.path.join(WORK, "eg-nogate.sqlite"), os.path.join(WORK, "eg-empty.sqlite")
for path, sql in ((nogate, "DROP TABLE encoding_check"), (empty, "DELETE FROM encoding_check")):
    shutil.copy(WDB, path)
    cx = sqlite3.connect(path)
    cx.execute(sql)
    cx.commit()
    cx.close()
for label, path in (("a mistyped path", missing), ("an existing non-SQLite file", nonsql),
                    ("an index built before the gate", nogate), ("an empty verdict table", empty)):
    del calls[:]
    try:
        rc = mfm.main(["encoding-check", "--bodies", path])
    except Exception as exc:                     # noqa: BLE001 — a traceback is the failure this check exists for
        rc = type(exc).__name__
    check("EG %s -> exit 2, no fetch" % label, rc == 2 and calls == [], "rc=%s calls=%s" % (rc, calls))
check("EG a mistyped path does not CREATE an index file", not os.path.exists(missing))
check("EG the refused non-SQLite input is byte-identical", open(nonsql, "rb").read() == nonsql_bytes)
mfm._fetch_raw = real_fetch
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
