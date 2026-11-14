"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P2b-2: the identity lookup reads only the wanted mints (F-d1), the survivor
walk streams the census and keeps today's order and unresolved count exactly (F-d2, Langston C-1 / C-2), `prev` is
released after its save (F-e), and the socials sweep's births read is streamed with its old output kept exactly (F-f).

Run:  python tests/test_p2b2_memory_fixes.py        (exit 0 = every check passed)

⛔ EQUIVALENCE, NOT ENDORSEMENT. F-f and F-d2 are pinned against the code they replaced, kept here verbatim in
   behaviour. Where that old behaviour carries a known defect (#1257: the socials sweep's cursor strands a retry), the
   checks assert the new code reproduces it - this memory batch changes representation, not semantics - and say so.
"""

import heapq  # noqa: F401  (documented equality the walk relies on; imported so a reader sees where it comes from)
import json
import os
import random
import shutil
import sys
import tempfile
import tracemalloc
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p2b2-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import summary  # noqa: E402
import follow_up  # noqa: E402
import promote  # noqa: E402
import providers  # noqa: E402
from config import BIRTHS_DIR  # noqa: E402

UTC = timezone.utc
NOW = datetime(2026, 11, 30, 12, 0, 0, tzinfo=UTC)
PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def reset():
    for name in os.listdir(ROOT):
        p = os.path.join(ROOT, name)
        if os.path.isdir(p):
            shutil.rmtree(p, ignore_errors=True)
        else:
            os.remove(p)
    store.ensure_dirs()
    store._DEAD_CACHE["mtime"] = None
    store._DEAD_CACHE["set"] = store.DeadSet()
    store._DEAD_STATUS["bad_lines"] = 0


def write_lines(path, lines):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        for x in lines:
            fh.write((x if isinstance(x, str) else json.dumps(x)) + NL)


# ═════════════════════════════════════════════════════════════════════════════════════════════════ F-d1
print(NL + "=== I1. THE IDENTITY LOOKUP KEEPS ONLY THE WANTED MINTS, AND THE LAST WRITE WINS (F-d1)")
reset()
write_lines(store.IDENTITY_PATH, [
    {"mint": "A", "name": "a-old", "symbol": "A"},
    {"mint": "B", "name": "b", "symbol": "B"},
    {"mint": "C", "name": "c", "symbol": "C"},
    {"mint": "A", "name": "a-new", "symbol": "A2"},
])
got = store.identity_for({"A", "C", "ZZ"})
check("I1 only the wanted mints that exist are returned", set(got) == {"A", "C"}, got)
check("I1 the LAST write wins for a mint written twice", got.get("A") == {"name": "a-new", "symbol": "A2"}, got.get("A"))
check("I1 POSITIVE CONTROL: an unwanted mint present in the file is not returned", "B" not in got, got)
check("I1 the whole-file map is gone (rule 18: deleted in the same change)", not hasattr(store, "identity_map"))
write_lines(store.IDENTITY_PATH, [{"mint": "A", "name": "a", "symbol": "A"}, "{broken"])
try:
    store.identity_for({"A"})
    err = None
except ValueError as exc:
    err = exc
check("I1 bad-line behaviour unchanged: an unparseable identity line still raises", err is not None)
check("I1 an empty request reads nothing (and so cannot raise)", store.identity_for(set()) == {})

print(NL + "=== I2. THE SUMMARY'S ENRICH ASKS FOR ITS OWN ROWS' MINTS ONLY")
reset()
asked = []
_real_for = summary._identity_for
summary._identity_for = lambda mints: (asked.append(set(mints)) or {})
try:
    summary._enrich([{"mint": "X1", "initial_size": 1.0}, {"mint": "X2", "initial_size": 2.0}])
finally:
    summary._identity_for = _real_for
check("I2 _enrich passes exactly its row mints", asked == [{"X1", "X2"}], asked)


# ═════════════════════════════════════════════════════════════════════════════════════════════════ F-d2
def old_oldest(dead, limit, now):
    """The walk it replaced, verbatim in behaviour (summary.py before P2b-2), minus _enrich."""
    corrections = store._correction_index()
    unresolved = 0
    out = []
    for name in summary._birth_files():
        try:
            rows = list(summary.store_iter_census(name, corrections))
        except (OSError, ValueError):
            continue
        rows.sort(key=lambda r: r.get("created_at") or "")
        for r in rows:
            if r.get("mint_unresolved"):
                unresolved += 1
                continue
            if r.get("mint") in dead:
                continue
            out.append(r.get("mint"))
            if len(out) >= limit:
                return out, unresolved
    return out, unresolved


def new_oldest(dead, limit, now):
    real = summary._enrich
    summary._enrich = lambda rows: rows
    try:
        rows, unresolved = summary._oldest_survivors(dead, limit, now)
    except Exception as exc:                   # a crash compares unequal and reads as a FAIL line, never a bare exit
        return ("RAISED", type(exc).__name__)
    finally:
        summary._enrich = real
    return [r["mint"] for r in rows], unresolved


def birth_row(mint, created):
    return {"mint": mint, "created_at": created, "first_seen_at": created, "venue": "PUMP_FUN",
            "initial_size": 1.0, "follow_reason": "trait_carrier", "followed": True}


print(NL + "=== W1. THE STREAMED WALK EQUALS THE OLD SORT, ROW ORDER AND UNRESOLVED COUNT, on 300 random fixtures (C-1)")
rng = random.Random(20261114)
real_iter = summary.store_iter_census
mismatch = []
tie_cases = fill_cases = 0
for case in range(300):
    reset()
    days = rng.randint(1, 4)
    unres = set()
    dead = set()
    for d in range(days):
        day = "2026-10-%02d.jsonl" % (d + 1)
        rows = []
        for i in range(rng.randint(0, 25)):
            # few distinct timestamps on purpose: ties are where a stable sort and a heap can part company
            ts = "2026-10-%02dT%02d:00:00+00:00" % (d + 1, rng.randint(0, 3)) if rng.random() > 0.05 else None
            m = "M%d_%d_%d" % (case, d, i)
            rows.append(birth_row(m, ts))
            r = rng.random()
            if r < 0.12:
                unres.add(m)
            elif r < 0.30:
                dead.add(m)
        write_lines(os.path.join(BIRTHS_DIR, day), rows)
        if len({x["created_at"] for x in rows}) < len(rows):
            tie_cases += 1

    def tagged(day, *a, _u=frozenset(unres), **k):
        for r in real_iter(day, *a, **k):
            yield dict(r, mint_unresolved=True) if r.get("mint") in _u else r
    summary.store_iter_census = tagged
    try:
        limit = rng.randint(1, 40)
        old = old_oldest(dead, limit, NOW)
        new = new_oldest(dead, limit, NOW)
    finally:
        summary.store_iter_census = real_iter
    if len(old[0]) == limit:
        fill_cases += 1
    if old != new:
        mismatch.append((case, limit, old, new))
check("W1 identical on every fixture", not mismatch, mismatch[:1])
check("W1 POSITIVE CONTROL: the fixtures exercised ties and files that fill the limit",
      tie_cases > 100 and fill_cases > 50, (tie_cases, fill_cases))

print(NL + "=== W2. A DAY FILE WITH A BAD LINE CONTRIBUTES NOTHING - NO ROWS AND NO UNRESOLVED COUNT - AND THE WALK GOES ON (C-2)")
reset()
write_lines(os.path.join(BIRTHS_DIR, "2026-10-01.jsonl"),
            [birth_row("U1", "2026-10-01T00:00:00+00:00"), birth_row("GOOD1", "2026-10-01T01:00:00+00:00"), "{broken",
             birth_row("U2", "2026-10-01T02:00:00+00:00")])
write_lines(os.path.join(BIRTHS_DIR, "2026-10-02.jsonl"),
            [birth_row("GOOD2", "2026-10-02T00:00:00+00:00"), birth_row("U3", "2026-10-02T01:00:00+00:00")])


def tagged2(day, *a, **k):
    for r in real_iter(day, *a, **k):
        yield dict(r, mint_unresolved=True) if r.get("mint", "").startswith("U") else r


summary.store_iter_census = tagged2
try:
    old = old_oldest(set(), 10, NOW)
    try:
        new = new_oldest(set(), 10, NOW)
        werr = None
    except Exception as exc:
        new, werr = None, type(exc).__name__
finally:
    summary.store_iter_census = real_iter
check("W2 the walk does not raise on the bad line", werr is None, werr)
check("W2 the bad file contributes no rows and no unresolved count; the next file is read",
      new == (["GOOD2"], 1), new)
check("W2 and that is exactly what the old whole-file read did", new == old, (old, new))

print(NL + "=== W3. THE WALK STOPS THE INSTANT THE LIMIT IS MET - the next day file is never opened (C-1(b))")
reset()
for d in range(3):
    write_lines(os.path.join(BIRTHS_DIR, "2026-10-%02d.jsonl" % (d + 1)),
                [birth_row("D%d_%d" % (d, i), "2026-10-%02dT0%d:00:00+00:00" % (d + 1, i)) for i in range(5)])
opened = []


def counting(day, *a, **k):
    opened.append(day)
    return real_iter(day, *a, **k)


summary.store_iter_census = counting
try:
    rows, _u = new_oldest(set(), 5, NOW)
    w3err = None
except Exception as exc:                       # a crash must read as a FAIL line, not as a silent exit
    rows, w3err = None, type(exc).__name__
finally:
    summary.store_iter_census = real_iter
check("W3 five rows from the first file and the second file is not opened", w3err is None
      and rows == ["D0_%d" % i for i in range(5)] and opened == ["2026-10-01.jsonl"], (w3err, rows, opened))
opened.clear()
summary.store_iter_census = counting
try:
    rows, _u = new_oldest(set(), 7, NOW)
finally:
    summary.store_iter_census = real_iter
check("W3 POSITIVE CONTROL: a limit the first file cannot meet reads the second and stops there",
      len(rows) == 7 and opened == ["2026-10-01.jsonl", "2026-10-02.jsonl"], (rows, opened))

print(NL + "=== W4. census() IS STILL THE WHOLE CORRECTED LIST - its contract is unchanged")
reset()
write_lines(os.path.join(BIRTHS_DIR, "2026-10-01.jsonl"),
            [birth_row("C%d" % i, "2026-10-01T0%d:00:00+00:00" % i) for i in range(4)])
check("W4 census returns a list equal to list(iter_census)", isinstance(store.census("2026-10-01.jsonl"), list)
      and store.census("2026-10-01.jsonl") == list(store.iter_census("2026-10-01.jsonl")))
check("W4 the raw generator is private (C-3): no public iter_census_uncorrected",
      not hasattr(store, "iter_census_uncorrected") and hasattr(store, "_iter_census_uncorrected"))


# ═════════════════════════════════════════════════════════════════════════════════════════════════ F-e
print(NL + "=== E1. run_hour NO LONGER HOLDS `prev` WHEN promote.run AND summary.build RUN (F-e)")
reset()
seen = {}
_real_prom, _real_build = follow_up.promote.run, follow_up.summary.build


def prom_probe(now):
    seen["promote"] = "prev" in sys._getframe(1).f_locals
    return {}


def build_probe(now):
    seen["build"] = "prev" in sys._getframe(1).f_locals
    return {}


follow_up.promote.run, follow_up.summary.build = prom_probe, build_probe
try:
    follow_up.run_hour(NOW)
finally:
    follow_up.promote.run, follow_up.summary.build = _real_prom, _real_build
check("E1 both probes ran inside run_hour", set(seen) == {"promote", "build"}, seen)
check("E1 `prev` is not a live local of run_hour at promote.run or summary.build", seen.get("promote") is False
      and seen.get("build") is False, seen)


# ═════════════════════════════════════════════════════════════════════════════════════════════════ F-f
OLD_SKIPPED = [0]          # the old reader's skip count (non-blank lines it did not yield), for the caller comparison


def old_read_new(path, offset, objects_only=False):
    """promote._read_new before P2b-2, verbatim in behaviour (logging dropped). `objects_only` adds the ONE deliberate
    difference (Langston item 1): a parsed line that is not an object is treated exactly like an unparseable one."""
    if not os.path.exists(path):
        return [], [], offset
    size = os.path.getsize(path)
    if size < offset:
        offset = 0
    if size == offset:
        return [], [], offset
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        raw = fh.read()
    if not raw:
        return [], [], offset
    if not raw.endswith(NL):
        cut = raw.rfind(NL)
        if cut < 0:
            return [], [], offset
        raw = raw[: cut + 1]
    rows, sizes = [], []
    for line in raw.splitlines(keepends=True):
        nbytes = len(line.encode("utf-8"))
        body = line.strip()
        if not body:
            if rows:
                sizes[-1] += nbytes
            else:
                offset += nbytes
            continue
        try:
            parsed = json.loads(body)
            if objects_only and not isinstance(parsed, dict):
                raise ValueError("not an object")
            rows.append(parsed)
            sizes.append(nbytes)
        except ValueError:
            OLD_SKIPPED[0] += 1
            if rows:
                sizes[-1] += nbytes
            else:
                offset += nbytes
    return rows, sizes, offset


def new_read_new(path, offset):
    it = promote._read_new(path, offset)
    pairs = list(it)
    return [p[0] for p in pairs], [p[1] for p in pairs], it.base


print(NL + "=== F1. THE STREAMED BIRTHS READ EQUALS THE OLD ONE, rows, sizes and base, on 400 random fixtures")
rng = random.Random(1257)
pieces = [
    lambda: json.dumps({"mint": "R%d" % rng.randint(0, 9999), "follow_reason": "deferred"}) + NL,
    lambda: NL,                                              # blank
    lambda: "   " + NL,                                      # whitespace-only
    lambda: "{broken" + NL,                                  # unparseable
    lambda: "123" + NL,                                      # valid JSON, not an object (now skipped like junk)
    lambda: "[1, 2]" + NL,
    lambda: json.dumps({"mint": "LS", "name": "a" + chr(0x2028) + "b"}, ensure_ascii=False) + NL,  # raw U+2028
    lambda: "{bro" + chr(0x2028) + "ken" + NL,               # a split-producing separator inside junk
    lambda: json.dumps({"mint": "UNI", "name": "é漢"}, ensure_ascii=False) + NL,                  # multibyte
]
path = os.path.join(ROOT, "f1.jsonl")
diffs = []
for case in range(400):
    body = "".join(rng.choice(pieces)() for _ in range(rng.randint(0, 12)))
    if rng.random() < 0.3:
        body += json.dumps({"mint": "PARTIAL"})               # a row still being written
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(body)
    size = os.path.getsize(path)
    # the offset is a real line start in the old code's own coordinate (a prior cursor), or 0, or past the end (shrink)
    starts = [0]
    acc = 0
    for line in body.splitlines(keepends=True):
        acc += len(line.encode("utf-8"))
        starts.append(acc)
    offset = rng.choice(starts + [size + 5])
    o, n = old_read_new(path, offset, objects_only=True), new_read_new(path, offset)
    if o != n:
        diffs.append((case, offset, body[:120], o, n))
    if any(not isinstance(r, dict) for r in n[0]):
        diffs.append((case, "a non-object was yielded", n[0]))
check("F1 identical on every fixture to the old reader with the object filter, and no non-object is ever a row",
      not diffs, diffs[:1])
it = promote._read_new(path, 0)
with open(path, "w", encoding="utf-8", newline="") as fh:
    fh.write("{broken" + NL + json.dumps({"mint": "OK1"}) + NL + "123" + NL + NL + "[1]" + NL + json.dumps({"mint": "OK2"}) + NL)
got = list(it)
check("F1 the skips are counted (unparseable and non-object; a blank line is not a skip)",
      [r["mint"] for r, _n in got] == ["OK1", "OK2"] and it.skipped == 3, (got, it.skipped))
check("F1 a missing file yields nothing and keeps the offset", new_read_new(os.path.join(ROOT, "nope"), 7) == ([], [], 7))

print(NL + "=== F2. THE STREAMED READ HOLDS ONE ROW, NOT THE WHOLE REMAINDER (the 303.0 MiB term)")
big = os.path.join(ROOT, "f2.jsonl")
with open(big, "w", encoding="utf-8", newline="") as fh:
    for i in range(30000):
        fh.write(json.dumps({"mint": "BIG%07d" % i, "follow_reason": "size_carrier", "pad": "x" * 200}) + NL)
fsize = os.path.getsize(big)
tracemalloc.start()
n_rows = 0
for _row, _nb in promote._read_new(big, 0):
    n_rows += 1
_cur, new_peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
tracemalloc.start()
old_rows = old_read_new(big, 0)
_cur, old_peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
del old_rows
check("F2 every row streamed", n_rows == 30000, n_rows)
check("F2 the streamed read's peak is under 1 MiB on a %.1f MiB file" % (fsize / 1048576.0), new_peak < 1048576,
      new_peak)
check("F2 POSITIVE CONTROL: the old read's peak exceeds the file size (the instrument sees a whole-file hold)",
      old_peak > fsize, (old_peak, fsize))

print(NL + "=== F3. promote.run SAVES THE SAME CURSORS AND WRITES THE SAME CHECKS WITH EITHER READER")


class OldReader:
    """The old reader behind the new interface, so promote.run's caller code is compared, not just the reader."""

    def __init__(self, path, offset):
        OLD_SKIPPED[0] = 0
        self.rows, self.sizes, self.base = old_read_new(path, offset, objects_only=True)
        self.skipped = OLD_SKIPPED[0]

    def __iter__(self):
        return iter(zip(self.rows, self.sizes))


def promote_case(reader, seed):
    reset()
    r = random.Random(seed)
    os.makedirs(BIRTHS_DIR, exist_ok=True)
    for d in range(2):
        lines = []
        for i in range(r.randint(1, 14)):
            k = r.random()
            if k < 0.08:
                lines.append("{broken")
            elif k < 0.12:
                lines.append("")
            elif k < 0.15:
                lines.append("123")                            # a non-object line (item 1)
            else:
                lines.append(json.dumps(dict(birth_row("P%d_%d_%d" % (seed, d, i), "2026-10-01T00:00:00+00:00"),
                                             follow_reason=r.choice(["deferred", "deferred", "size_carrier"]))))
        write_lines(os.path.join(BIRTHS_DIR, "2026-10-%02d.jsonl" % (d + 1)), lines)
    outcomes = {}
    for line_no, fn in enumerate(sorted(os.listdir(BIRTHS_DIR))):
        for raw in open(os.path.join(BIRTHS_DIR, fn), encoding="utf-8"):
            try:
                m = json.loads(raw).get("mint")
            except (ValueError, AttributeError):
                continue
            # "shed" is rare on purpose: it stops the whole run, and the other arms must still be reached
            outcomes[m] = "shed" if r.random() < 0.04 else r.choice(["twitter", "none", "nopair", "boom"])

    def fake_get(url, headers=None):
        o = outcomes.get(url.rsplit("/", 1)[-1], "none")
        if o == "shed":
            raise providers.Shed("budget exhausted (test)")
        if o == "nopair":
            return {"pairs": []}
        if o == "boom":
            raise RuntimeError("provider exploded")
        return {"pairs": [{"volume": {"h24": 5.0}, "txns": {"h24": {}}, "liquidity": {"usd": 1.0}, "dexId": "pumpfun",
                           "info": {"socials": [{"type": "twitter"}] if o == "twitter" else []}}]}
    real_get, real_reader, real_max = providers._get, promote._read_new, promote.MAX_CHECKS_PER_RUN
    providers._get, promote._read_new = fake_get, reader
    promote.MAX_CHECKS_PER_RUN = r.randint(1, 12)              # exercises bounded_out
    try:
        res = []
        for h in range(3):
            st = promote.run(NOW + timedelta(hours=h))
            res.append((store.load_state(promote.STATE, {}).get("cursors"), {k: v for k, v in st.items()}))
        chk = open(promote.CHECKS_PATH, encoding="utf-8").read() if os.path.exists(promote.CHECKS_PATH) else ""
        chk = [{k: v for k, v in json.loads(x).items() if k != "checked_at"} for x in chk.splitlines() if x.strip()]
        return res, chk
    finally:
        providers._get, promote._read_new, promote.MAX_CHECKS_PER_RUN = real_get, real_reader, real_max


bad, skip_bad, skip_seen = [], [], [0]
# "shed" (Langston's condition): the ONLY path that reads .base with the reader suspended mid-file
paths = {"bounded_out": 0, "errors": 0, "unresolved_no_pairs": 0, "checked": 0, "shed": 0}
for seed in range(60):
    a, b = promote_case(OldReader, seed), promote_case(promote._read_new, seed)
    # skipped_lines is the ONE stat allowed to differ, and only downward on a SHED run: the streamed reader counts the
    # lines it actually reached; the old whole-remainder read counted lines past the shed it never processed (and that
    # the next hour re-reads). Equal on every run without a shed.
    for (ca, sa), (cb, sb) in zip(a[0], b[0]):
        so, sn = sa.pop("skipped_lines", 0), sb.pop("skipped_lines", 0)
        skip_seen[0] += 1 if sn else 0          # for the positive control below
        if (sn != so) if not sb.get("shed") else (sn > so):
            skip_bad.append((seed, so, sn, sb.get("shed")))
    if a != b:
        why = []
        for h, ((ca, sa), (cb, sb)) in enumerate(zip(a[0], b[0])):
            if ca != cb:
                why.append(("cursor", h))
            why += [(k, h, sa.get(k), sb.get(k)) for k in sorted(set(sa) | set(sb)) if sa.get(k) != sb.get(k)]
        if a[1] != b[1]:
            why.append("checks")
        bad.append((seed, why[:4]))
    for _cur, st in b[0]:
        for k in paths:
            paths[k] += 1 if st.get(k) else 0
check("F3 skipped_lines equal on every run without a shed, never higher on a shed run", not skip_bad, skip_bad[:3])
check("F3 POSITIVE CONTROL: the fixtures reach bounded-out, error, no-pairs retries, real checks, a SHED and"
      " skipped lines",
      all(v > 5 for v in paths.values()) and skip_seen[0] > 5, (paths, skip_seen))
check("F3 identical cursors, stats and check records over 3 hourly runs on 60 fixtures (#1257's stranding included:"
      " this batch changes representation, not the cursor arithmetic)", not bad, bad[:5])

print(NL + "=== F4. THE SAVED CURSOR IS AN ABSOLUTE FILE OFFSET: base + bytes handled (F3 compares two readers through the"
      " SAME caller, so it cannot see a caller defect)")
reset()
f4 = os.path.join(BIRTHS_DIR, "2026-10-01.jsonl")
write_lines(f4, ["{broken", ""] + [json.dumps(dict(birth_row("S%d" % i, "2026-10-01T00:00:00+00:00"),
                                                   follow_reason="size_carrier")) for i in range(4)])
size4 = os.path.getsize(f4)
cur4 = []
for h in range(2):
    promote.run(NOW + timedelta(hours=h))
    cur4.append(store.load_state(promote.STATE, {}).get("cursors", {}).get("2026-10-01.jsonl"))
check("F4 after one run every byte is consumed, leading junk included: cursor == file size", cur4[0] == size4,
      (cur4, size4))
check("F4 a second run with nothing new keeps the cursor at the end, not at the bytes it handled", cur4[1] == size4,
      (cur4, size4))

print(NL + "=== F5. A NON-OBJECT BIRTHS LINE IS SKIPPED AND COUNTED; THE RUN COMPLETES AND DOES NOT REPEAT ITS WORK (item 1)")
reset()
f5 = os.path.join(BIRTHS_DIR, "2026-10-01.jsonl")
write_lines(f5, [json.dumps(dict(birth_row("N1", "2026-10-01T00:00:00+00:00"), follow_reason="deferred")), "123",
                 json.dumps(dict(birth_row("N2", "2026-10-01T00:00:00+00:00"), follow_reason="deferred"))])
_rg = providers._get
providers._get = lambda url, headers=None: {"pairs": [{"volume": {"h24": 5.0}, "txns": {"h24": {}},
                                                       "liquidity": {"usd": 1.0}, "dexId": "pumpfun",
                                                       "info": {"socials": [{"type": "twitter"}]}}]}
try:
    st5 = []
    for h in range(2):
        try:
            st5.append(promote.run(NOW + timedelta(hours=h)))
        except Exception as exc:
            st5.append({"RAISED": type(exc).__name__})
finally:
    providers._get = _rg
recs5 = [json.loads(x)["mint"] for x in open(promote.CHECKS_PATH, encoding="utf-8")] if os.path.exists(promote.CHECKS_PATH) else []
check("F5 the run completes and counts the skipped line", "RAISED" not in st5[0] and st5[0].get("skipped_lines") == 1,
      st5[0])
check("F5 both real rows are checked exactly once across two runs (no hourly repeat)", recs5 == ["N1", "N2"], recs5)
check("F5 the cursor reaches the end of the file", store.load_state(promote.STATE, {}).get("cursors", {}).get(
    "2026-10-01.jsonl") == os.path.getsize(f5))

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
