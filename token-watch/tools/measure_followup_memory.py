"""
token-watch — replay the follow-up pass over the 48 buckets it died on, and measure its memory.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, the measurement; #1132.)

SUBCOMMANDS, each run as `tokenwatch`:

  index    --pristine <scratch tree> --out <bodies.sqlite>
           Builds mint -> captured DexScreener body (+ its byte count) from the capture's provenance/follow-up.
           ⛔ WHY SQLITE: the replay must not hold 361,853 bodies in its own heap — that would be measured as the
              follow-up's memory. One indexed lookup per call; a 2 MiB cache.
           ⛔ It REFUSES a duplicate mint (the capture calls each mint once and --resume skips captured ones, so a
              duplicate means an anomaly, and keeping either copy silently would be a choice nobody made), an empty
              index, and an --out under the production store.

  prepare  --pristine <scratch tree> --run-root <run dir> --now <ISO> [--with-bodies]
           A fresh run dir per run (run_hour writes). The copy holds TODAY's journals, so now's month's journal is
           cut to the rows with ts <= now (ts parsed, not compared as text) and later months are removed: on
           2026-10-02 the October journal held two days. The September tail is left as it is (cursor 253M of
           260M is only consistent with no fold since 09-30, which is the premise; a 10-02 pass would drain it).
           ⛔ The DISK FLOOR is held here as in make_followup_scratch.sh: it refuses unless free space on / stays
              >= 10 GiB after the copy, re-checks after, and copies under nice 19 / ionice idle. provenance/follow-up
              is NOT copied unless --with-bodies (the index serves the bodies).
           Writes <run dir>/PREPARE.json; `run` carries it into its result, so the tree a run used is on record.

  run      --arm {all_shed,live,x4,xn,sept} --run-root <run dir> --bodies <bodies.sqlite> --now <ISO> --out <result.json>
           [--trace <dir>] [--min-served-share 0.95]
           Meant for `systemd-run -p MemoryMax=512M -p IPAddressDeny=any -p CPUQuota=40% --uid=tokenwatch`
           (tools/run_followup_arm.sh records the unit's own Result, which is how a KILL is recorded).
           ⛔ THREE CONTROLS BEFORE ANYTHING IS MEASURED, each voiding the run with its own exit code:
              (1) MemoryMax (exit 8): the cgroup's memory.max must be exactly 536,870,912. A run under
                  MemoryMax=infinity returns a clean memory.peak and reads as "it fits".
              (2) IPAddressDeny (exit 6): a connect to a LITERAL IP must fail with EPERM/EACCES (a DNS failure is
                  not proof: under IPAddressDeny DNS fails too, and so it does with no resolver), and the named
                  host must fail as well. The probe target is a flag so a test can point it at a live socket.
              (3) the clock (exit 10): all seven modules that read `datetime` are frozen at --now, or the run is
                  void. ⛔ `providers.token_state` calls `budget.allowed("follow_up")` with NO now (the wall clock)
                  while `run_hour` folds with the injected one; without the freeze arm (a)'s ledger is discarded as
                  the wrong month by the gate's own read and arm (a) silently becomes arm (b). `receiver` is in the
                  import closure (promote) and is NOT frozen: its three clock reads are webhook-path only,
                  unreachable from run_hour (Langston, Step 4 r1).
           The run: cursor last_bucket = the first bucket − 1h, so `_buckets_to_read` returns the 48 buckets.
           Ledger: all_shed = now's month with spent over the cap (cap + 1, independent of > vs >=); live/x4 = a
           fresh ledger for now's month. The journal offset starts at 0 because the copied ledger is a later month
           (`_load` discards it) — and 0 IS faithful: no fold has run since 09-30, so a real 10-02 pass met a
           blank October ledger at offset 0.
           The egress `providers._request` is replaced:
              DexScreener -> the captured body, re-PARSED from text every call. Arm x4 builds a 4x TEXT before
                parsing: the body plus `_pad` = three copies of the body itself, inert (token_state reads top-level
                `pairs` only), so bytes AND objects are ~4x;
              a mint with no captured body -> a no-pairs body, counted apart;
              Helius -> getAccountInfo answered with one of the 40 REAL curve-account replies in
                tests/fixtures/pumpfun_curves.json (chosen by a hash of the pool address), so the one-call curve
                path runs as it does for ~97% of live tokens; anything else (getTokenAccountsByOwner) -> [].
                Every Helius call is counted apart and labelled SYNTHETIC — never an observed fan-out.
           `token_state` is counted AT THE FOLLOW-UP LOOP'S CALL SITE (a proxy swapped into follow_up.providers;
           promote keeps the real module, r1e), and the loop's own served / no-body split is counted inside it.
           VOID (exit 7) if all_shed's control fails: egress == 0 AND call-site == due − requeued AND shed rows
           written this run == the same. VOID (exit 9) if live/x4 serve under --min-served-share of the loop's
           calls from captured bodies (an empty or thin index would otherwise publish a figure off no-pairs bodies).
           Recorded: memory.max, memory.peak (INCLUDES PAGE CACHE — stated), memory.events (max, oom, oom_kill),
           ru_maxrss, stats, the fan-out, the frozen modules, the bytes p99/max of the bodies THIS run served, and
           the PREPARE.json it ran on.
           --trace: tracemalloc snapshots (top 10, to disk) after the fold, after each dead_set, around promote.run,
           around summary.build, and around `summary._identity_map` (A2's 321 MB site — summary binds it at import
           as `from store import identity_map as _identity_map`, so that name is the one wrapped). A wrap target
           that does not exist RAISES rather than skipping.

  lookup-baseline --run-root <run dir> --bodies <bodies.sqlite> --out <result.json>
           The harness's own read-path footprint: fetches every distinct mint of the 48 buckets from the index,
           exactly as `run` would, and nothing else. Its ru_maxrss sits beside the arms (Langston (d)).

Exit: 0 done · 2 refused · 6 egress control · 7 all_shed control · 8 MemoryMax control · 9 served-share floor
      · 10 clock-freeze control · 11 arm sept NOT RUN (under 30 one-pair templates, the basis) · 12 fresh-parse
      control (parses != served) · 13 arm sept control (wiring, alive below the reference, Helius range)
      · 14 derive-n: N VOID · 15 run_hour reported an error (a deterministic replay must have none).
Arms xn (`--n`, the derived N: ceil(N) − 1 pad copies) and sept (`--shape`, §6 AMENDMENTS 1-2: classes under 30 real
templates are synthesised from class 1, labelled in the result's `sept.source`) are specified in the pre-audit §6.
"""

from __future__ import annotations

import argparse
import errno
import hashlib
import math
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone

PRODUCTION_ROOT = "/var/lib/token-watch"
FIRST_BUCKET = "2026-09-30T14"
BUCKETS = 48
EXPECT_MEMORY_MAX = 512 * 1024 * 1024
FLOOR_BYTES = 10 * 2**30
UTC = timezone.utc
CLOCK_MODULES = ("budget", "provenance", "store", "follow_up", "promote", "summary", "providers")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CURVES = os.path.join(HERE, "tests", "fixtures", "pumpfun_curves.json")


MIN_CLASS = 30                                                  # §6 C-3: a size/template class needs >= 30 bodies
_CLASS_SQL = {"0": "pairs = 0", "1": "pairs = 1", "2": "pairs = 2", "3+": "pairs >= 3"}
_CLASS_K = {"0": 0, "1": 1, "2": 2, "3+": 4}                   # §6 C-3: the 3+ class counts as k = 4 (09-26 mean 3.7484)


def _hash_int(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16)


def _load_shape(path: str) -> dict:
    """{"day": ..., "share": {"0","1","2","3+"}, "alive_share": ...} — the reference day's shape, written down first."""
    if not path:
        raise SystemExit("REFUSED: arm sept and derive-n need --shape (the reference day's shape, written down first)")
    s = json.load(open(path, encoding="utf-8"))
    if set(s.get("share", {})) != {"0", "1", "2", "3+"} or not 0 < s.get("alive_share", 0) < 1:
        raise SystemExit("REFUSED: --shape must carry share{0,1,2,3+} and alive_share")
    if abs(sum(s["share"].values()) - 1) > 1e-3:
        raise SystemExit("REFUSED: --shape shares sum to %.6f, not 1" % sum(s["share"].values()))
    return s


def _venue_text(obj) -> str:
    """THE ONE ENCODER for every body this harness serves: the venue's own — compact, UTF-8 unescaped (Langston,
    Step 4, 2026-11-07, measured against the live DexScreener API: a compact re-dump of a 30-pair body is byte-exact
    at 41,432 B; `json.dumps(sort_keys=True)` of the same object is 44,206 B, +6.70%, and `ensure_ascii` escaping
    adds more on a multibyte name). The capture stores bodies in that inflated form (`provenance.py:201`), so
    `cmd_index` re-encodes every body through here, and the synthesised, no-pairs and padded bodies use it too —
    one encoding across all classes and arms, or the per-class sizes are not comparable. Key order does not change
    the length, so it is left as parsed.
    ⚠️ BYTE-EXACT ONLY ON THE MEASURED 30-PAIR ASCII BODY. It is not a property of the encoder: number formatting was
    lost at capture (`_request` parses before the store), and a re-dump can move a number's length (`0.000001` ->
    `1e-06`, -3 B; `1e-7` -> `1e-07`, +1 B; Langston, measured). The NON-ASCII leg (`ensure_ascii=False`) is the
    largest term on an emoji-dense name (-18.3% on his synthetic) and is SETTLED per corpus by `encoding-check` on
    the raw wire bytes, never assumed: if the venue escapes, this encoder UNDERSTATES, the unsafe direction."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def _non_ascii(text: str) -> int:
    return sum(ord(ch) > 127 for ch in text)


ENCODING_OK = ("moot", "confirmed")


def _encoding_refusal(db) -> str | None:
    """None when the index's encoding verdict permits sizes to be used; otherwise the reason (derive-n, arm sept)."""
    try:
        row = db.execute("SELECT verdict, detail FROM encoding_check").fetchone()
    except sqlite3.OperationalError:
        return "the index has no encoding_check table (built before the encoding gate): rebuild it"
    if row is None or row[0] not in ENCODING_OK:
        return "encoding verdict is %r, not one of %s: run encoding-check first (%s)" % (
            row and row[0], ENCODING_OK, row and row[1])
    return None


def _fetch_raw(mint: str) -> bytes:
    """ONE fresh DexScreener reply, as RAW WIRE BYTES, read before any parse (`providers._request` parses on read,
    so it cannot answer this). Paced by the package's own pacer; a follow-up call costs no credits."""
    sys.path.insert(0, HERE)
    import urllib.request
    import providers  # noqa: E402
    url = "%s/latest/dex/tokens/%s" % (providers.DEXSCREENER_BASE, mint)
    providers._pace(url)
    req = urllib.request.Request(url, headers={"User-Agent": providers.USER_AGENT})
    with urllib.request.urlopen(req, timeout=providers.TIMEOUT) as resp:
        return resp.read()


NO_PAIRS_TEXT = _venue_text({"schemaVersion": "1.0.0", "pairs": None})


def _synthesise(text: str, k: int) -> str:
    """§6 AMENDMENT 2: a class-k body built from a class-1 template — its one pair duplicated k times, each copy with
    a distinct pairAddress — returned as TEXT in the venue encoding. The dict built here is SHALLOW (the k pairs share
    txns/volume/baseToken objects); the cure is that it is returned as text and parsed fresh by the caller, so the
    served graph holds k independent pairs (fenced by C-6, parses == served — not by SY). A template that does not
    hold exactly one pair with a pairAddress RAISES: a fidelity harness does not stand in an empty or "None~0" pair
    (Langston, Step 4, 2026-11-07); inside run_hour the raise lands in its `errors`, which voids the arm (exit 15)."""
    tmpl = json.loads(text)
    pairs = tmpl.get("pairs") or []
    if len(pairs) != 1 or not isinstance(pairs[0], dict) or not pairs[0].get("pairAddress"):
        raise ValueError("_synthesise: template must hold exactly one pair with a pairAddress, holds %d" % len(pairs))
    pair = pairs[0]
    tmpl["pairs"] = [dict(pair, pairAddress="%s~%d" % (pair["pairAddress"], i)) for i in range(k)]
    return _venue_text(tmpl)


def _class_of(mint: str, share: dict) -> str:
    u = (_hash_int("class:" + mint) % 10**9) / 10**9
    acc = 0.0
    for k in ("0", "1", "2", "3+"):
        acc += share[k]
        if u < acc:
            return k
    return "3+"


def _refuse_production(path: str) -> None:
    if not path:
        print("REFUSED: empty path", file=sys.stderr)
        sys.exit(2)
    real, prod = os.path.realpath(path), os.path.realpath(PRODUCTION_ROOT)
    if real == prod or real.startswith(prod + os.sep):
        print("REFUSED: %r is (inside) the production store" % path, file=sys.stderr)
        sys.exit(2)


def _parse_ts(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if d.tzinfo is None:
        raise ValueError("timestamp without a timezone: %r" % s)
    return d.astimezone(UTC)


def _stats(sizes: list[int]) -> dict:
    if not sizes:
        return {"n": 0}
    s = sorted(sizes)
    return {"n": len(s), "p99": s[min(len(s) - 1, -(-99 * len(s) // 100) - 1)], "max": s[-1],
            "mean": round(sum(s) / len(s), 1)}


def _maxrss_kib():
    try:
        import resource                              # Linux only; the run is meant for the staging box
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:
        return None


def _cgroup_dir(override: str | None) -> str | None:
    if override:
        return override
    try:
        with open("/proc/self/cgroup") as fh:
            rel = fh.read().strip().split("::", 1)[1]
        return os.path.join("/sys/fs/cgroup", rel.lstrip("/"))
    except Exception:                                # noqa: BLE001 — no cgroup v2 here; the control then voids
        return None


def _read(path: str):
    try:
        with open(path) as fh:
            return fh.read().strip()
    except OSError:
        return None


def _cgroup(cg: str | None) -> dict:
    out = {"dir": cg, "memory_max": None, "memory_peak_incl_page_cache": None, "memory_events": None}
    if not cg:
        return out
    out["memory_max"] = _read(os.path.join(cg, "memory.max"))
    peak = _read(os.path.join(cg, "memory.peak"))
    out["memory_peak_incl_page_cache"] = int(peak) if peak and peak.isdigit() else peak
    ev = _read(os.path.join(cg, "memory.events"))
    if ev:
        out["memory_events"] = {k: int(v) for k, v in (line.split() for line in ev.splitlines())
                                if k in ("max", "oom", "oom_kill")}
    return out


def _free(path="/") -> int:
    return shutil.disk_usage(path).free


def _du(path: str) -> int:
    total = 0
    for base, _d, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(base, f))
            except OSError:
                pass
    return total


# ── index ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_index(a) -> int:
    _refuse_production(a.pristine)
    _refuse_production(a.out)
    folder = os.path.join(a.pristine, "provenance", "follow-up")
    if os.path.exists(a.out):
        print("REFUSED: %s exists" % a.out, file=sys.stderr)
        return 2
    tmp = a.out + ".building"
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.execute("CREATE TABLE bodies (mint TEXT PRIMARY KEY, body TEXT NOT NULL, bytes INTEGER NOT NULL, "
               "pairs INTEGER NOT NULL)")
    db.execute("CREATE INDEX bodies_by_pairs ON bodies (pairs)")   # arm sept's template lookups (m3)
    db.execute("CREATE TABLE encoding_check (verdict TEXT NOT NULL, detail TEXT NOT NULL)")
    n, dups, divergent, stored_total, venue_total = 0, [], 0, 0, 0
    bad_digest, best = [], (0, None)                    # best = (non-ASCII chars, mint): encoding-check's subject
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".jsonl"):
            continue
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            for line in fh:
                rec = json.loads(line)
                if rec.get("source") != "dexscreener_token_state":
                    continue
                # ⛔ THE LAST PLACE THE DIGEST CAN BE CHECKED (Langston, Step 4 rider): the stored text is not kept
                #    past this loop, and `sha256` (provenance.py:207) is the corpus's only integrity field.
                if hashlib.sha256(rec["body"].encode("utf-8")).hexdigest() != rec.get("sha256"):
                    bad_digest.append(rec.get("mint"))
                    continue
                parsed = json.loads(rec["body"])
                npairs = len(parsed.get("pairs") or [])
                # ⛔ BYTES, MEASURED HERE (Langston, Step 4 r2): the record's own `bytes` is `len(body)` on a str
                #    (provenance.py:206) — characters — while the pad arms measure `len(text.encode("utf-8"))`.
                #    One instrument both sides: the UTF-8 byte length, and count where the record's field disagrees.
                stored = len(rec["body"].encode("utf-8"))
                divergent += stored != rec.get("bytes")
                # ⛔ AND THE ENCODING IS THE VENUE'S, NOT THE STORE'S (Langston, Step 4, 2026-11-07): the stored text
                #    is `json.dumps(sort_keys=True)` (provenance.py:201), ~6.7% larger than what the venue serves.
                #    Re-encode here so every arm and every class serves one encoding; report both totals.
                vtext = _venue_text(parsed)
                nbytes = len(vtext.encode("utf-8"))
                stored_total += stored
                venue_total += nbytes
                na = _non_ascii(vtext)
                if na > best[0]:
                    best = (na, rec["mint"])
                cur = db.execute("INSERT OR IGNORE INTO bodies VALUES (?, ?, ?, ?)",
                                 (rec["mint"], vtext, nbytes, npairs))
                if cur.rowcount == 1:
                    n += 1
                else:
                    dups.append(rec["mint"])
    # the encoding verdict: "moot" when no indexed body holds a non-ASCII character (ensure_ascii cannot matter);
    # otherwise "pending" naming the most non-ASCII mint, until encoding-check settles it on the raw wire bytes
    if best[1] is None:
        verdict = ("moot", json.dumps({"reason": "no indexed body holds a non-ASCII character"}))
    else:
        verdict = ("pending", json.dumps({"mint": best[1], "non_ascii_chars": best[0]}))
    db.execute("INSERT INTO encoding_check VALUES (?, ?)", verdict)
    db.commit()
    db.close()
    if bad_digest or dups or n == 0:
        os.remove(tmp)
        why = ("%d body/bodies whose sha256 does not match the record, e.g. %s" % (len(bad_digest), bad_digest[:3])
               if bad_digest else "%d duplicate mint(s), e.g. %s" % (len(dups), dups[:3]) if dups
               else "no body indexed")
        print("REFUSED: %s" % why, file=sys.stderr)
        return 2
    os.replace(tmp, a.out)
    print(json.dumps({"indexed": n, "out": a.out, "encoding_verdict": verdict[0],
                      "encoding_detail": json.loads(verdict[1]),
                      "bytes_field_vs_utf8_divergent": divergent,
                      "bytes_field_vs_utf8_divergent_note": "FORWARD FENCE: zero by construction while the producer "
                      "stores json.dumps(ensure_ascii=True) (provenance.py:201, the dict branch); it can only fire on "
                      "a future raw-text writer, so a zero here says nothing about the char/byte question",
                      "stored_encoding_bytes_total": stored_total, "venue_encoding_bytes_total": venue_total}))
    return 0


# ── encoding-check ─────────────────────────────────────────────────────────────────────────────────────────────────
_ESCAPE = re.compile(rb"(\\+)u([0-9a-fA-F]{4})")


def _non_ascii_escapes(raw: bytes) -> int:
    """`\\uXXXX` escapes above 0x7F that are REAL escapes: the `u` must follow an ODD run of backslashes. An even run
    is escaped backslashes followed by a literal `u` — e.g. a token NAME holding the seven characters `\\u00e9`,
    which serialises as `\\\\u00e9` and must not read as the venue escaping (Langston, Step 4, 2026-11-07)."""
    return sum(len(run) % 2 == 1 and int(h, 16) > 127 for run, h in _ESCAPE.findall(raw))


def _judge(mint: str, raw: bytes) -> dict:
    parsed = json.loads(raw.decode("utf-8"))
    venue = _venue_text(parsed).encode("utf-8")
    high = sum(b > 127 for b in raw)
    escaped = _non_ascii_escapes(raw)
    out = {"mint": mint, "raw_bytes": len(raw), "venue_text_bytes": len(venue),
           "delta_bytes": len(venue) - len(raw), "raw_high_bytes": high, "raw_non_ascii_escapes": escaped,
           "fresh_non_ascii_chars": _non_ascii(_venue_text(parsed))}
    if out["fresh_non_ascii_chars"] == 0:
        out["verdict"] = "unsettled"
    elif escaped == 0 and high > 0:
        out["verdict"] = "confirmed"
    else:
        out["verdict"] = "venue-escapes"
    return out


def cmd_encoding_check(a) -> int:
    """How the venue's serializer writes non-ASCII, read off the RAW WIRE BYTES of fresh replies (Langston, Step 4,
    2026-11-07). ⚠️ THE OBJECT IS THE VENUE AT FETCH TIME, FROM ONE DISCRIMINATING REPLY — not the captured corpus's
    wire bytes, which are unrecoverable by construction (`_request` parses before the store). And a `moot` verdict
    (no indexed body holds a non-ASCII character) discharges the question for this corpus while leaving the venue's
    escaping UNMEASURED: no one may cite a `moot` run as evidence the venue serves raw UTF-8.
    Subjects: `--mint` if given, else the indexed non-ASCII mints in descending order of non-ASCII characters
    (recomputed from `bodies.body`, which holds the venue text), at most `--max-tries` fetches, until one reply
    DISCRIMINATES — a dead or relisted mint whose fresh reply carries no non-ASCII character is skipped, not final.
    Exit 0 confirmed / moot; 3 UNSETTLED (no tried reply discriminated); 4 the venue ESCAPES (this encoder
    understates; nothing may use the sizes). The verdict and every attempt are written into the index, where
    derive-n and arm sept read it."""
    db = sqlite3.connect(a.bodies)
    row = db.execute("SELECT verdict, detail FROM encoding_check").fetchone()
    if row[0] == "moot":                              # nothing in the corpus can be affected; never overwritten here
        if a.mint:
            print("REFUSED: the index is moot (no non-ASCII body); --mint would only measure the venue, and an "
                  "unsettled probe must not block a corpus it cannot affect", file=sys.stderr)
            return 2
        print(json.dumps({"verdict": "moot", "detail": json.loads(row[1]),
                          "note": "the venue's escaping is UNMEASURED by a moot run"}))
        return 0
    if a.mint:
        subjects = [a.mint]
    else:
        ranked = [(_non_ascii(body), mint) for mint, body in db.execute("SELECT mint, body FROM bodies")]
        subjects = [mint for n, mint in sorted((r for r in ranked if r[0] > 0), key=lambda r: (-r[0], r[1]))]
    attempts, final = [], None
    for mint in subjects[:a.max_tries]:
        out = _judge(mint, _fetch_raw(mint))
        attempts.append(out)
        if out["verdict"] != "unsettled":
            final = out
            break
    verdict = final["verdict"] if final else "unsettled"
    record = {"verdict": verdict, "decided_by": final, "attempts": attempts, "candidates": len(subjects),
              "max_tries": a.max_tries, "object": "the venue's serializer at fetch time, from one discriminating reply"}
    db.execute("DELETE FROM encoding_check")
    db.execute("INSERT INTO encoding_check VALUES (?, ?)", (verdict, json.dumps(record, sort_keys=True)))
    db.commit()
    db.close()
    print(json.dumps(record, sort_keys=True))
    return {"confirmed": 0, "unsettled": 3, "venue-escapes": 4}[verdict]


# ── prepare ────────────────────────────────────────────────────────────────────────────────────────────────────────
def _be_gentle() -> None:
    try:
        os.nice(19)
        subprocess.run(["ionice", "-c3", "-p", str(os.getpid())], check=False, capture_output=True)
    except Exception:                                # noqa: BLE001 — off Linux (tests); the copy still runs
        pass


def cmd_prepare(a) -> int:
    _refuse_production(a.pristine)
    _refuse_production(a.run_root)
    now = _parse_ts(a.now)
    if os.path.exists(a.run_root):
        print("REFUSED: %s exists; remove it deliberately first" % a.run_root, file=sys.stderr)
        return 2
    ignore = None if a.with_bodies else shutil.ignore_patterns("follow-up")
    need = _du(a.pristine) - (0 if a.with_bodies else _du(os.path.join(a.pristine, "provenance", "follow-up")))
    free_before = _free()
    if free_before - need < FLOOR_BYTES:
        print("REFUSED: free %d - copy %d is under the 10 GiB floor" % (free_before, need), file=sys.stderr)
        return 2
    _be_gentle()
    shutil.copytree(a.pristine, a.run_root, symlinks=True, ignore=ignore)
    free_after = _free()
    state = os.path.join(a.run_root, "state")
    month = now.strftime("%Y-%m")
    report = {"run_root": a.run_root, "pristine": a.pristine, "now": now.isoformat(), "with_bodies": a.with_bodies,
              "copied_bytes_estimate": need, "free_before": free_before, "free_after": free_after, "journals": {}}
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
                    if _parse_ts(json.loads(line)["ts"]) <= now:
                        dst.write(line)
                        kept += 1
                    else:
                        cut += 1
            os.replace(tmp, path)
            report["journals"][name] = {"rows_kept": kept, "rows_cut": cut, "bytes_after": os.path.getsize(path)}
    with open(os.path.join(a.run_root, "PREPARE.json"), "w") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
    print(json.dumps(report, sort_keys=True))
    if free_after < FLOOR_BYTES:
        print("WARNING: free space after the copy is under the 10 GiB floor; remove the run dir", file=sys.stderr)
        return 2
    return 0


# ── run ────────────────────────────────────────────────────────────────────────────────────────────────────────────
class Counts:
    def __init__(self):
        self.egress = 0           # every call into the replaced _request
        self.served = 0           # DexScreener, a captured body (loop + promote)
        self.no_body = 0          # DexScreener, no captured body: a no-pairs body (loop + promote)
        self.synthetic = 0        # Helius, A7's synthetic leg — never an observed fan-out
        self.call_site = 0        # token_state calls made by the follow-up loop itself
        self.loop_served = 0      # ... of which served from a captured body
        self.loop_no_body = 0     # ... of which had no captured body
        self.in_loop = False
        self.served_bytes: list[int] = []
        self.parses = 0           # body texts parsed into a fresh object graph (C-6: == served lookups)
        self.loop_alive = 0       # loop token_state results with alive True
        self.loop_class0 = 0      # arm sept: loop lookups assigned class 0
        self.loop_shaped = 0      # arm sept: loop lookups shaped
        self.loop_synthetic = 0   # Helius calls made inside the follow-up loop
        self.synthetic_shape = 0  # arm sept: bodies synthesised from a class-1 template (§6 AMENDMENT 2)


def _freeze_clock(now: datetime, modules) -> list[str]:
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return now if tz is None or tz is UTC else now.astimezone(tz)

        @classmethod
        def utcnow(cls):
            return now.replace(tzinfo=None)
    frozen = []
    for m in modules:
        if getattr(m, "datetime", None) is datetime:
            m.datetime = Frozen
            frozen.append(m.__name__)
    return frozen


def _egress_control(probes: list[str]) -> tuple[bool, str]:
    """True when every probe is refused the deny-shaped way. A literal IP must fail with EPERM/EACCES."""
    notes = []
    for p in probes:
        host, port = p.rsplit(":", 1)
        literal = all(ch.isdigit() or ch == "." for ch in host)
        try:
            socket.create_connection((host, int(port)), timeout=5).close()
            return False, "a connection to %s SUCCEEDED; IPAddressDeny is not in force" % p
        except OSError as exc:
            if literal and exc.errno not in (errno.EPERM, errno.EACCES):
                return False, "%s failed with %s, not EPERM/EACCES: not proof of a deny" % (p, errno.errorcode.get(exc.errno, exc.errno))
            notes.append("%s refused (%s)" % (p, errno.errorcode.get(exc.errno, type(exc).__name__)))
    return True, "; ".join(notes)


def cmd_run(a) -> int:
    _refuse_production(a.run_root)
    if os.path.realpath(os.environ.get("TOKEN_WATCH_ROOT", "")) != os.path.realpath(a.run_root):
        print("REFUSED: TOKEN_WATCH_ROOT must equal --run-root (config reads it at import)", file=sys.stderr)
        return 2
    now = _parse_ts(a.now)
    prepared = json.load(open(os.path.join(a.run_root, "PREPARE.json")))

    def void(code: int, why: str, extra: dict | None = None) -> int:
        rec = {"arm": a.arm, "void": why, "exit": code, "prepare": prepared, **(extra or {})}
        with open(a.out, "w") as fh:
            json.dump(rec, fh, indent=2, sort_keys=True, default=str)
        print(json.dumps(rec, sort_keys=True, default=str))
        return code

    # (1) MemoryMax
    cg = _cgroup_dir(a.cgroup_dir)
    cgroup_before = _cgroup(cg)
    if not a.skip_memory_check and cgroup_before["memory_max"] != str(EXPECT_MEMORY_MAX):
        return void(8, "MemoryMax control: memory.max is %r, not %d" % (cgroup_before["memory_max"], EXPECT_MEMORY_MAX),
                    {"cgroup": cgroup_before})
    # (2) IPAddressDeny
    if a.skip_egress_check:
        egress_note = "SKIPPED (test)"
    else:
        ok, egress_note = _egress_control(a.egress_probe or ["1.1.1.1:443", "api.dexscreener.com:443"])
        if not ok:
            return void(6, "egress control: " + egress_note)

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

    sys.path.insert(0, HERE)
    import budget, follow_up, promote, provenance, providers, store, summary  # noqa: E401,E402
    from config import MONTHLY_CREDIT_CAP  # noqa: E402
    mods = {"budget": budget, "provenance": provenance, "store": store, "follow_up": follow_up,
            "promote": promote, "summary": summary, "providers": providers}
    # (3) the clock
    frozen = [] if a.no_clock_freeze else _freeze_clock(now, [mods[n] for n in CLOCK_MODULES])
    if not a.no_clock_freeze and sorted(frozen) != sorted(CLOCK_MODULES):
        return void(10, "clock control: froze %s, expected %s" % (frozen, list(CLOCK_MODULES)))

    first = datetime.strptime(FIRST_BUCKET, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    cur = store.load_state("follow_up_cursor", {})
    cur["last_bucket"] = (first - timedelta(hours=1)).strftime("%Y-%m-%dT%H")
    store.save_state("follow_up_cursor", cur)
    ledger = budget._blank(budget._month_key(now))
    if a.arm == "all_shed":
        ledger["spent"]["birth"] = MONTHLY_CREDIT_CAP + 1
    store.save_state(budget.STATE, ledger)

    c = Counts()
    db = sqlite3.connect("file:%s?mode=ro" % a.bodies, uri=True)
    db.execute("PRAGMA cache_size = -2048")            # 2 MiB: the harness's own cache, small and constant
    curves = json.load(open(CURVES, encoding="utf-8"))
    shape = templates = source = None
    if a.arm == "sept":
        try:
            shape = _load_shape(a.shape)
        except SystemExit as exc:                       # a refusal leaves a void record, never a bare exit (m1)
            return void(2, str(exc))
        refusal = _encoding_refusal(db)                 # per-class served bytes need a settled encoding
        if refusal:
            return void(2, "REFUSED: " + refusal)
        templates = {k: db.execute("SELECT count(*) FROM bodies WHERE " + _CLASS_SQL[k]).fetchone()[0]
                     for k in ("1", "2", "3+")}
        # §6 AMENDMENT 2: class 1 is the BASIS and is never synthesised; a thinner class 2 / 3+ is built from it
        if templates["1"] < MIN_CLASS:
            return void(11, "arm sept NOT RUN: %d captured bodies with exactly 1 pair, under %d (the basis)" % (
                templates["1"], MIN_CLASS), {"templates": templates})
        source = {"1": "real (%d templates)" % templates["1"]}
        for k in ("2", "3+"):
            source[k] = ("real (%d templates)" % templates[k] if templates[k] >= MIN_CLASS else
                         "synthetic-shape from class 1 (%d real templates in the class)" % templates[k])
    # the guard BEFORE the arithmetic (Langston, Step 4): a missing --n must leave a refusal record, not a traceback
    if a.arm == "xn" and (a.n is None or a.n < 1):
        return void(2, "arm xn needs --n >= 1 (the derived N, written down before the run)")
    # ceil, not round: a bound's rounding goes conservative (N = 2.5 pads 2 copies -> 3x text, never 2x)
    pad_copies = 3 if a.arm == "x4" else (max(0, math.ceil(a.n) - 1) if a.arm == "xn" else 0)

    def fake_request(req):
        c.egress += 1
        url = req.full_url
        if "helius" in url:
            c.synthetic += 1
            c.loop_synthetic += c.in_loop                  # the loop's own Helius calls (the nit: promote's are apart)
            payload = json.loads(req.data.decode())
            if payload.get("method") == "getAccountInfo":
                pick = int(hashlib.sha1(str(payload["params"][0]).encode()).hexdigest(), 16) % len(curves)
                return json.loads(json.dumps(curves[pick]["account_info"]))
            return {"jsonrpc": "2.0", "id": "token-watch", "result": {"value": []}}
        mint = url.rsplit("/", 1)[-1]
        if a.arm == "sept":
            # ARM (d), pre-registered (§6 AMENDMENT 1, C-4..C-6): a pair-count class by a hash of the mint on the
            # reference day's cumulative shares; class 0 -> the no-pairs body; class k -> a REAL captured body of
            # that class (template chosen by the same hash), parsed FRESH, every pair's baseToken.address set to
            # this mint. pair_address / name / symbol stay the template's (stated in §6).
            k = _class_of(mint, shape["share"])
            c.loop_class0 += c.in_loop and k == "0"
            c.loop_shaped += c.in_loop
            if k == "0":
                c.served += 1
                c.loop_served += c.in_loop
                c.parses += 1
                c.served_bytes.append(len(NO_PAIRS_TEXT.encode("utf-8")))   # served_bytes.n == served here (m2)
                return json.loads(NO_PAIRS_TEXT)
            synth = templates[k] < MIN_CLASS              # only class 2 / 3+ can be thin here (class 1 is checked)
            cls = "1" if synth else k
            off = _hash_int(mint) % templates[cls]
            text, nbytes = db.execute("SELECT body, bytes FROM bodies WHERE " + _CLASS_SQL[cls] +
                                      " ORDER BY pairs, rowid LIMIT 1 OFFSET ?", (off,)).fetchone()
            if synth:                                      # §6 AMENDMENT 2: the class-1 pair duplicated k times
                text = _synthesise(text, _CLASS_K[k])      # built as TEXT, so the parse below is k real pairs
                nbytes = len(text.encode("utf-8"))         # and the bytes are the body SERVED, not the template's
                c.synthetic_shape += 1
            body = json.loads(text)
            c.parses += 1
            for p in body.get("pairs") or []:
                if isinstance(p.get("baseToken"), dict):
                    p["baseToken"]["address"] = mint
            c.served += 1
            c.loop_served += c.in_loop
            c.served_bytes.append(nbytes)
            return body
        row = db.execute("SELECT body, bytes FROM bodies WHERE mint = ?", (mint,)).fetchone()
        if row is None:
            c.no_body += 1
            c.loop_no_body += c.in_loop
            return json.loads(NO_PAIRS_TEXT)
        c.served += 1
        c.loop_served += c.in_loop
        text, nbytes = row
        if pad_copies:                                  # the venue encoding throughout: no separator spaces
            inner = text.strip()
            copies = ",".join([inner] * pad_copies)
            text = '{"_pad":[%s],%s' % (copies, inner[1:]) if inner != "{}" else '{"_pad":[%s]}' % copies
            nbytes = len(text.encode("utf-8"))
        c.served_bytes.append(nbytes)
        c.parses += 1
        return json.loads(text)                         # a FRESH object graph per call (C-6)

    providers._request = fake_request
    providers.helius_key = lambda: "synthetic"

    class CallSite:
        def __getattr__(self, name):
            return getattr(providers, name)

        def token_state(self, mint):
            c.call_site += 1
            c.in_loop = True
            try:
                state = providers.token_state(mint)
                c.loop_alive += bool(state.get("alive"))
                return state
            finally:
                c.in_loop = False

        def pool_sol_reserves(self, pair_address):
            # the loop's alive-branch Helius call runs AFTER token_state returns, so it is marked here, at its own
            # call site, or loop_synthetic would count zero by construction
            c.in_loop = True
            try:
                return providers.pool_sol_reserves(pair_address)
            finally:
                c.in_loop = False
    follow_up.providers = CallSite()

    if tracer:
        def wrap(mod, name, before=True, after=True):
            fn = getattr(mod, name)                    # a missing target RAISES: a silent skip misses A2's site

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
        wrap(summary, "_identity_map")

    obs_day = store.observation_path(now)
    rows_before = sum(1 for _ in open(obs_day, encoding="utf-8")) if os.path.exists(obs_day) else 0

    stats = follow_up.run_hour(now)

    shed_rows = 0
    with open(obs_day, encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i >= rows_before and '"shed":' in line:
                shed_rows += 1
    expected = stats["due"] - stats["requeued_not_yet_due"]
    loop_lookups = c.loop_served + c.loop_no_body
    result = {
        "arm": a.arm, "now": now.isoformat(), "egress_control": egress_note, "frozen_modules": frozen,
        "cgroup": _cgroup(cg), "ru_maxrss_kib": _maxrss_kib(),
        "memory_check": "SKIPPED (test)" if a.skip_memory_check else "memory.max == %d" % EXPECT_MEMORY_MAX,
        "stats": {k: v for k, v in stats.items() if k != "summary"},
        "fanout": {"call_site_token_state": c.call_site, "egress": c.egress, "served_bodies": c.served,
                   "no_body_mints": c.no_body, "loop_served": c.loop_served, "loop_no_body": c.loop_no_body,
                   "synthetic_helius_calls": c.synthetic, "synthetic_label": "SYNTHETIC - not an observed fan-out"},
        "served_body_bytes": _stats(c.served_bytes),
        "shed_observation_rows": shed_rows, "due_minus_requeued": expected, "prepare": prepared,
        "parses": c.parses, "loop_alive": c.loop_alive, "pad_copies": pad_copies, "n": a.n,
        "loop_synthetic_helius_calls": c.loop_synthetic,
        "bodies_file_bytes": os.path.getsize(a.bodies),   # page cache is in memory.peak; the term differs by arm (m3)
    }
    if a.arm == "sept":
        # built BEFORE the void chain (Langston r2 tidy): a sept run voided at 15 or 12 still publishes its
        # templates and sources, which are exactly what that void needs to be read
        n = c.loop_shaped
        class0 = c.loop_class0 / n if n else 0.0
        alive = c.loop_alive / n if n else 0.0
        result["sept"] = {"shape": shape, "templates": templates, "source": source, "loop_lookups": n,
                          "synthetic_shape_bodies": c.synthetic_shape,
                          "class0_share": round(class0, 6), "alive_share": round(alive, 6),
                          "class0_test": "WIRING control (C-4), not fidelity to the reference day",
                          "alive_direction": "below the reference alive share voids; above stands (C-5)"}
    code = 0
    if stats.get("errors"):
        # §6 AMENDMENT 2: a deterministic replay with a run_hour error is a harness defect by construction
        # (follow_up.py swallows exceptions into this count, where no other control can see them)
        result["void"] = "run_hour reported %d error(s); a replay must have none" % stats["errors"]
        code = 15
    elif a.arm != "all_shed" and c.parses != c.served:
        result["void"] = "fresh-parse control (C-6): %d parses for %d served lookups" % (c.parses, c.served)
        code = 12
    elif a.arm == "all_shed" and not (c.egress == 0 and c.call_site == expected and shed_rows == expected):
        result["void"] = "arm all_shed control failed: egress=%d call_site=%d shed_rows=%d expected=%d" % (
            c.egress, c.call_site, shed_rows, expected)
        code = 7
    elif a.arm == "sept":
        if abs(class0 - shape["share"]["0"]) > a.wiring_tolerance:
            result["void"] = "wiring: class-0 share %.4f vs %.4f, outside +/-%.3f" % (class0, shape["share"]["0"],
                                                                                      a.wiring_tolerance)
            code = 13
        elif alive < shape["alive_share"]:
            result["void"] = "alive share %.4f is BELOW the reference %.4f: the fan-out driver is understated" % (
                alive, shape["alive_share"])
            code = 13
        elif not (0 < c.loop_synthetic <= 2 * c.loop_alive):
            result["void"] = "the loop's synthetic Helius calls %d not in (0, 2 x %d alive]" % (c.loop_synthetic,
                                                                                          c.loop_alive)
            code = 13
    elif a.arm != "all_shed":
        share = (c.loop_served / loop_lookups) if loop_lookups else 0.0
        result["loop_served_share"] = round(share, 6)
        if share < a.min_served_share:
            result["void"] = "served-share floor: %.4f of the loop's %d lookups served from captured bodies, under %.2f" % (
                share, loop_lookups, a.min_served_share)
            code = 9
    result["exit"] = code
    with open(a.out, "w") as fh:
        json.dump(result, fh, indent=2, sort_keys=True, default=str)
    print(json.dumps(result, sort_keys=True, default=str))
    return code


# ── derive-n ───────────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_derive_n(a) -> int:
    """§6 AMENDMENT 1 item 1 and C-3: N = E_sept / E_capture, from the reference day's shares and size per class."""
    try:
        shape = _load_shape(a.shape)
    except SystemExit as exc:                           # an invalid --shape exits 2 with a reason, as documented
        print(json.dumps({"void": str(exc)}), file=sys.stderr)
        return 2
    db = sqlite3.connect("file:%s?mode=ro" % a.bodies, uri=True)
    refusal = _encoding_refusal(db)                     # sizes are not used until the encoding is settled
    if refusal:
        print(json.dumps({"void": "REFUSED: " + refusal}), file=sys.stderr)
        return 2
    counts, size, notes = {}, {}, []
    for k in ("0", "1", "2", "3+"):
        n, mean = db.execute("SELECT count(*), avg(bytes) FROM bodies WHERE " + _CLASS_SQL[k]).fetchone()
        counts[k], size[k] = n, mean
    total, e_capture = db.execute("SELECT count(*), avg(bytes) FROM bodies").fetchone()
    out = {"shape": shape, "counts": counts, "size_measured": size, "E_capture": e_capture, "bodies": total}
    # ⛔ BOTH ALWAYS-MEASURED CLASSES ARE CHECKED BEFORE ANY ARITHMETIC, each with its own reason (Langston, Step 4):
    #    size(1) is the substitution BASIS (a thin mean would propagate into size(2) and size(3+)); size(0) has no
    #    valid formula at all (k = 0 would price a no-pairs body at 0 bytes). Neither is ever substituted.
    voids = []
    if counts["1"] < MIN_CLASS:
        voids.append("%d bodies with exactly 1 pair, under %d (the substitution basis)" % (counts["1"], MIN_CLASS))
    if counts["0"] < MIN_CLASS:
        voids.append("%d no-pairs bodies, under %d (no formula can stand in for it)" % (counts["0"], MIN_CLASS))
    if voids:
        out["void"] = "N VOID (C-3): " + "; ".join(voids) + "; x4 stands alone"
        print(json.dumps(out, indent=2, sort_keys=True))
        return 14
    used = {}
    for k in ("0", "1", "2", "3+"):
        if k in ("0", "1") or counts[k] >= MIN_CLASS:
            used[k] = size[k]
        else:
            used[k] = _CLASS_K[k] * size["1"]
            notes.append("size(%s) = %d x size(1): only %d bodies in the class" % (k, _CLASS_K[k], counts[k]))
    e_sept = sum(shape["share"][k] * used[k] for k in used)
    # which class N actually rests on: each class's share of E_sept (Langston, Step 4 tidy 2)
    contribution = {k: round(shape["share"][k] * used[k] / e_sept, 6) for k in used}
    out.update({"size_used": used, "substitutions": notes, "E_sept": e_sept, "N": e_sept / e_capture,
                "contribution_to_E_sept": contribution,
                "label": "x N bounds the TRANSIENT per-body parse/serialise peak only; never headroom (C-2)"})
    print(json.dumps(out, indent=2, sort_keys=True))
    return 0


# ── lookup-baseline ────────────────────────────────────────────────────────────────────────────────────────────────
def cmd_lookup_baseline(a) -> int:
    _refuse_production(a.run_root)
    first = datetime.strptime(FIRST_BUCKET, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    seen, found = set(), 0
    db = sqlite3.connect("file:%s?mode=ro" % a.bodies, uri=True)
    db.execute("PRAGMA cache_size = -2048")
    for i in range(BUCKETS):
        path = os.path.join(a.run_root, "due", (first + timedelta(hours=i)).strftime("%Y-%m-%dT%H") + ".jsonl")
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                m = json.loads(line).get("mint")
                if m and m not in seen:
                    seen.add(m)
                    row = db.execute("SELECT body FROM bodies WHERE mint = ?", (m,)).fetchone()
                    found += row is not None
    result = {"lookups": len(seen), "found": found, "ru_maxrss_kib": _maxrss_kib(),
              "cgroup": _cgroup(_cgroup_dir(a.cgroup_dir)), "sqlite_cache_bound_bytes": 2048 * 1024,
              "note": "the set of seen mints is held, as run_hour holds its own; the bodies are not"}
    with open(a.out, "w") as fh:
        json.dump(result, fh, indent=2, sort_keys=True)
    print(json.dumps(result, sort_keys=True))
    return 0


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
    p.add_argument("--with-bodies", action="store_true", help="also copy provenance/follow-up (the index serves them)")
    r = sub.add_parser("run")
    r.add_argument("--arm", required=True, choices=("all_shed", "live", "x4", "xn", "sept"))
    r.add_argument("--n", type=float, help="arm xn: the DERIVED N, written down before the run (derive-n)")
    r.add_argument("--shape", help="arm sept: the reference day's shape JSON")
    r.add_argument("--wiring-tolerance", type=float, default=0.01, help="arm sept: class-0 share tolerance (C-4)")
    r.add_argument("--run-root", required=True)
    r.add_argument("--bodies", required=True)
    r.add_argument("--now", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--trace")
    r.add_argument("--min-served-share", type=float, default=0.95)
    r.add_argument("--egress-probe", action="append", help="host:port; repeatable (tests point it at a live socket)")
    r.add_argument("--cgroup-dir", help="TEST ONLY: read memory.* from here instead of this process's cgroup")
    r.add_argument("--skip-egress-check", action="store_true", help="TEST ONLY")
    r.add_argument("--skip-memory-check", action="store_true", help="TEST ONLY")
    r.add_argument("--no-clock-freeze", action="store_true",
                   help="TEST CONTROL ONLY: proves arm all_shed goes void without the freeze")
    e = sub.add_parser("encoding-check", help="settle ensure_ascii on the raw wire bytes of ONE fresh reply")
    e.add_argument("--bodies", required=True)
    e.add_argument("--mint", help="judge this mint only (a dead or relisted best-candidate can be stepped past)")
    e.add_argument("--max-tries", type=int, default=5, help="fetches at most, walking the non-ASCII mints")
    d = sub.add_parser("derive-n")
    d.add_argument("--bodies", required=True)
    d.add_argument("--shape", required=True)
    b = sub.add_parser("lookup-baseline")
    b.add_argument("--run-root", required=True)
    b.add_argument("--bodies", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--cgroup-dir")
    a = ap.parse_args(argv)
    return {"index": cmd_index, "prepare": cmd_prepare, "run": cmd_run, "encoding-check": cmd_encoding_check,
            "derive-n": cmd_derive_n, "lookup-baseline": cmd_lookup_baseline}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
