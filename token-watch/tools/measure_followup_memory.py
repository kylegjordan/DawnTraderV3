"""
token-watch — replay the follow-up pass over the 48 buckets it died on, and measure its memory.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, the measurement; #1132.)

THREE SUBCOMMANDS, run in this order, each as `tokenwatch`:

  index    --pristine <scratch tree> --out <bodies.sqlite>
           Builds mint -> captured DexScreener body from the capture's provenance/follow-up/*.jsonl.
           ⛔ WHY SQLITE: the replay must not hold 361,853 bodies in its own heap — that would be measured as the
              follow-up's memory. One indexed lookup per call keeps the harness's own footprint small and constant.

  prepare  --pristine <scratch tree> --run-root <run dir> --now <ISO>
           Copies the pristine tree to a fresh run dir (every run starts from the same state, because run_hour
           writes), then makes the ledger history FAITHFUL TO --now: the spend journal of now's month is cut to
           the rows with ts <= now, and journals of later months are removed. (The copy holds today's journals;
           on 2026-10-02 the October journal held two days, not the month. Folding 287 MB that did not exist then
           would measure work the 09-30 pass never did.) Prints what it cut.

  run      --arm {all_shed,live,x4} --run-root <run dir> --bodies <bodies.sqlite> --now <ISO> --out <result.json>
           [--trace <dir>] [--skip-egress-check]
           Meant to run inside `systemd-run -p MemoryMax=512M -p IPAddressDeny=any -p CPUQuota=40% --uid=tokenwatch`.
           1. POSITIVE CONTROL FIRST: a real TCP connect to api.dexscreener.com:443 must FAIL, or the run is void
              (exit 6) — `IPAddressDeny` is proved, not assumed.
           2. THE CLOCK IS FROZEN AT --now in every module that reads it (`from datetime import datetime` in budget,
              provenance, store, follow_up, promote, summary, providers). ⛔ Not optional: `providers.token_state`
              calls `budget.allowed("follow_up")` with no `now`, i.e. the WALL clock, while `run_hour` folds with the
              injected one. Without the freeze, arm (a)'s October ledger is discarded as the wrong month by the
              gate's own read (`budget._load`), the gate opens, and arm (a) silently becomes arm (b).
           3. The cursor is set so `_buckets_to_read` returns the 48 buckets (last_bucket = first bucket − 1h).
           4. The ledger: all_shed = now's month with spent over the monthly cap (bound (b), `remaining > 0`);
              live / x4 = a fresh ledger for now's month.
           5. The egress `providers._request` is replaced: DexScreener → the captured body (x4: padded to 4× its
              bytes with a `_pad` field, so the parse and the provenance write are 4× and no field changes meaning);
              a mint with no captured body (promote's births) → a no-pairs body, COUNTED SEPARATELY; Helius →
              A7's shape-true SYNTHETIC reply (getAccountInfo value null, then an empty token-account list),
              COUNTED SEPARATELY AND LABELLED synthetic — never an observed fan-out.
           6. `token_state` is counted AT THE FOLLOW-UP LOOP'S CALL SITE: `follow_up.providers` is swapped for a
              proxy that counts, while `promote` keeps the real module (r1e: promote shares the budget key).
           7. arm all_shed's own control, or the run is VOID (exit 7): egress == 0 AND call-site token_state ==
              due − requeued_not_yet_due AND shed observation ROWS written by this run == the same number.
           8. Recorded: cgroup memory.peak (INCLUDES PAGE CACHE — stated), ru_maxrss, run_hour's stats, the fan-out
              (call-site token_state, served bodies, no-body mints, synthetic Helius calls), alive/dead counts.
           --trace: tracemalloc on, a snapshot's top 10 written to disk at each stage boundary (after the fold,
           after each dead_set, around promote.run, around summary.build and around the identity map), so a kill
           still leaves the last stage's sites. Traced runs are SEPARATE runs (tracemalloc's own memory).

It refuses the production store in every subcommand.
Exit: 0 done · 2 refused · 6 egress control failed (void) · 7 arm all_shed's control failed (void).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

PRODUCTION_ROOT = "/var/lib/token-watch"
FIRST_BUCKET = "2026-09-30T14"
UTC = timezone.utc
CLOCK_MODULES = ("budget", "provenance", "store", "follow_up", "promote", "summary", "providers")


def _refuse_production(path: str) -> None:
    if not path or os.path.realpath(path) == os.path.realpath(PRODUCTION_ROOT):
        print("REFUSED: %r is the production store (or empty)" % path, file=sys.stderr)
        sys.exit(2)


def _parse_now(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise SystemExit("--now must carry a timezone")
    return d.astimezone(UTC)


# ── index ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_index(a) -> int:
    _refuse_production(a.pristine)
    folder = os.path.join(a.pristine, "provenance", "follow-up")
    if os.path.exists(a.out):
        print("REFUSED: %s exists" % a.out, file=sys.stderr)
        return 2
    db = sqlite3.connect(a.out)
    db.execute("CREATE TABLE bodies (mint TEXT PRIMARY KEY, body TEXT NOT NULL, bytes INTEGER NOT NULL)")
    n = dup = 0
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".jsonl"):
            continue
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            for line in fh:
                rec = json.loads(line)
                if rec.get("source") != "dexscreener_token_state":
                    continue
                cur = db.execute("INSERT OR IGNORE INTO bodies VALUES (?, ?, ?)", (rec["mint"], rec["body"], rec["bytes"]))
                n += cur.rowcount
                dup += 1 - cur.rowcount
    db.commit()
    print(json.dumps({"indexed": n, "duplicate_mints_ignored": dup, "out": a.out}))
    return 0


# ── prepare ────────────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_prepare(a) -> int:
    _refuse_production(a.pristine)
    _refuse_production(a.run_root)
    now = _parse_now(a.now)
    if os.path.exists(a.run_root):
        print("REFUSED: %s exists; remove it deliberately first" % a.run_root, file=sys.stderr)
        return 2
    shutil.copytree(a.pristine, a.run_root, symlinks=True,
                    ignore=shutil.ignore_patterns("follow-up") if a.skip_bodies else None)
    state = os.path.join(a.run_root, "state")
    month = now.strftime("%Y-%m")
    report = {"run_root": a.run_root, "now": now.isoformat(), "journals": {}}
    for name in sorted(os.listdir(state)):
        if not (name.startswith("spend-journal-") and name.endswith(".jsonl")):
            continue
        m = name[len("spend-journal-"):-len(".jsonl")]
        path = os.path.join(state, name)
        if m > month:
            report["journals"][name] = {"removed": os.path.getsize(path)}
            os.remove(path)
        elif m == month:
            kept = cut = 0
            tmp = path + ".cut"
            with open(path, encoding="utf-8") as src, open(tmp, "w", encoding="utf-8") as dst:
                for line in src:
                    if json.loads(line).get("ts", "") <= now.isoformat():
                        dst.write(line)
                        kept += 1
                    else:
                        cut += 1
            os.replace(tmp, path)
            report["journals"][name] = {"rows_kept": kept, "rows_cut": cut, "bytes_after": os.path.getsize(path)}
    print(json.dumps(report, sort_keys=True))
    return 0


# ── run ────────────────────────────────────────────────────────────────────────────────────────────────────────────
class Counts:
    def __init__(self):
        self.egress = 0          # every call into the replaced _request
        self.served = 0          # DexScreener, a captured body
        self.no_body = 0         # DexScreener, no captured body (promote's births): a no-pairs body
        self.synthetic = 0       # Helius, A7's synthetic reply — never an observed fan-out
        self.call_site = 0       # token_state calls made by the follow-up loop itself


def _freeze_clock(now: datetime, modules) -> None:
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return now if tz is None or tz is UTC else now.astimezone(tz)

        @classmethod
        def utcnow(cls):
            return now.replace(tzinfo=None)
    for m in modules:
        if getattr(m, "datetime", None) is datetime:
            m.datetime = Frozen


def _maxrss_kib() -> int | None:
    try:
        import resource                              # Linux only; the run is meant for the staging box
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:
        return None


def _cgroup_peak() -> int | None:
    try:
        with open("/proc/self/cgroup") as fh:
            rel = fh.read().strip().split("::", 1)[1]
        with open(os.path.join("/sys/fs/cgroup", rel.lstrip("/"), "memory.peak")) as fh:
            return int(fh.read().strip())
    except Exception:                                # noqa: BLE001 — absent off a cgroup v2 unit; reported as null
        return None


def cmd_run(a) -> int:
    _refuse_production(a.run_root)
    if os.path.realpath(os.environ.get("TOKEN_WATCH_ROOT", "")) != os.path.realpath(a.run_root):
        print("REFUSED: TOKEN_WATCH_ROOT must equal --run-root (config reads it at import)", file=sys.stderr)
        return 2
    now = _parse_now(a.now)
    if not a.skip_egress_check:
        try:
            socket.create_connection(("api.dexscreener.com", 443), timeout=5).close()
            print(json.dumps({"void": "egress control: a live connection SUCCEEDED; IPAddressDeny is not in force"}))
            return 6
        except OSError as exc:
            egress_control = "refused as required (%s)" % type(exc).__name__
    else:
        egress_control = "SKIPPED (test)"

    tracer = None
    if a.trace:
        import tracemalloc
        tracemalloc.start(10)
        os.makedirs(a.trace, exist_ok=True)
        tracer = {"n": 0}

        def snap(stage):
            tracer["n"] += 1
            s = tracemalloc.take_snapshot()
            cur, peak = tracemalloc.get_traced_memory()
            with open(os.path.join(a.trace, "%02d-%s.txt" % (tracer["n"], stage)), "w") as fh:
                fh.write("traced current %d peak %d\n" % (cur, peak))
                for st in s.statistics("lineno")[:10]:
                    fh.write("%s\n" % st)
    else:
        def snap(stage):
            return None

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import budget, follow_up, promote, provenance, providers, store, summary  # noqa: E401,E402
    from config import MONTHLY_CREDIT_CAP  # noqa: E402
    if not a.no_clock_freeze:
        _freeze_clock(now, (budget, provenance, store, follow_up, promote, summary, providers))

    first = datetime.strptime(FIRST_BUCKET, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    cur = store.load_state("follow_up_cursor", {})
    cur["last_bucket"] = (first - timedelta(hours=1)).strftime("%Y-%m-%dT%H")
    store.save_state("follow_up_cursor", cur)
    ledger = budget._blank(budget._month_key(now))
    if a.arm == "all_shed":
        ledger["spent"]["birth"] = MONTHLY_CREDIT_CAP
    # keep the journal cursor the copy carries (the fold's offset), so the fold does the work it would have done
    old = store.load_state(budget.STATE, {})
    if old.get("month") == ledger["month"]:
        ledger["journal_offset"] = old.get("journal_offset", 0)
    store.save_state(budget.STATE, ledger)

    c = Counts()
    db = sqlite3.connect("file:%s?mode=ro" % a.bodies, uri=True)
    db.execute("PRAGMA cache_size = -2048")            # 2 MiB: the harness's own cache, small and constant

    def fake_request(req):
        c.egress += 1
        url = req.full_url
        if "helius" in url:
            c.synthetic += 1
            method = json.loads(req.data.decode()).get("method")
            if method == "getAccountInfo":
                return {"jsonrpc": "2.0", "id": "token-watch", "result": {"value": None}}
            return {"jsonrpc": "2.0", "id": "token-watch", "result": {"value": []}}
        mint = url.rsplit("/", 1)[-1]
        row = db.execute("SELECT body FROM bodies WHERE mint = ?", (mint,)).fetchone()
        if row is None:
            c.no_body += 1
            return {"schemaVersion": "1.0.0", "pairs": None}
        c.served += 1
        body = json.loads(row[0])
        if a.arm == "x4":
            body["_pad"] = "x" * (3 * len(row[0]))
        return body

    providers._request = fake_request
    providers.helius_key = lambda: "synthetic"

    class CallSite:
        def __getattr__(self, name):
            return getattr(providers, name)

        def token_state(self, mint):
            c.call_site += 1
            return providers.token_state(mint)
    follow_up.providers = CallSite()

    if tracer:
        def wrap(mod, name, before=True, after=True):
            fn = getattr(mod, name, None)
            if fn is None:
                return

            def w(*args, **kw):
                if before:
                    snap("before-%s.%s" % (mod.__name__, name))
                try:
                    return fn(*args, **kw)
                finally:
                    if after:
                        snap("after-%s.%s" % (mod.__name__, name))
            setattr(mod, name, w)
        wrap(budget, "fold_pending", before=False)
        wrap(follow_up, "dead_set", before=False)
        wrap(promote, "run")
        wrap(summary, "build")
        wrap(store, "identity_map")
        wrap(summary, "identity_map")

    obs_day = store.observation_path(now)
    rows_before = sum(1 for _ in open(obs_day, encoding="utf-8")) if os.path.exists(obs_day) else 0

    stats = follow_up.run_hour(now)

    shed_rows = 0
    with open(obs_day, encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i >= rows_before and '"shed":' in line:
                shed_rows += 1
    expected = stats["due"] - stats["requeued_not_yet_due"]
    result = {
        "arm": a.arm, "now": now.isoformat(), "egress_control": egress_control,
        "memory_peak_bytes_cgroup_incl_page_cache": _cgroup_peak(),
        "ru_maxrss_kib": _maxrss_kib(),
        "stats": {k: v for k, v in stats.items() if k not in ("summary",)},
        "fanout": {"call_site_token_state": c.call_site, "egress": c.egress, "served_bodies": c.served,
                   "no_body_mints": c.no_body, "synthetic_helius_calls": c.synthetic},
        "shed_observation_rows": shed_rows, "due_minus_requeued": expected,
    }
    void = None
    if a.arm == "all_shed" and not (c.egress == 0 and c.call_site == expected and shed_rows == expected):
        void = "arm all_shed control failed: egress=%d call_site=%d shed_rows=%d expected=%d" % (
            c.egress, c.call_site, shed_rows, expected)
        result["void"] = void
    with open(a.out, "w") as fh:
        json.dump(result, fh, indent=2, sort_keys=True, default=str)
    print(json.dumps(result, sort_keys=True, default=str))
    return 7 if void else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("index")
    i.add_argument("--pristine", required=True)
    i.add_argument("--out", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--pristine", required=True)
    p.add_argument("--run-root", required=True)
    p.add_argument("--now", required=True)
    p.add_argument("--skip-bodies", action="store_true", help="do not copy provenance/follow-up (the index has them)")
    r = sub.add_parser("run")
    r.add_argument("--arm", required=True, choices=("all_shed", "live", "x4"))
    r.add_argument("--run-root", required=True)
    r.add_argument("--bodies", required=True)
    r.add_argument("--now", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--trace")
    r.add_argument("--skip-egress-check", action="store_true")
    r.add_argument("--no-clock-freeze", action="store_true",
                   help="TEST CONTROL ONLY: proves arm all_shed goes void without the freeze")
    a = ap.parse_args(argv)
    return {"index": cmd_index, "prepare": cmd_prepare, "run": cmd_run}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
