"""
token-watch — THE DEAD-MAN'S SWITCH.

Langston's catch, 2026-08-28, and it closes a limb that `receiver.py` wrongly
declared closed to us. The receiver's header said a dropped push is undetectable
here and that OBJ-3 was the only answer. THAT IS TRUE OF HALF THE FAILURE AND
FALSE OF THE OTHER HALF:

  PARTIAL drop  — some creations delivered, some lost. Genuinely undetectable
                  locally: we cannot miss what we were never told about. This
                  IS OBJ-3's job and it correctly waits for the proving run.

  TOTAL stop    — dead hostname, crashed proxy, revoked secret, provider
                  outage. DETECTABLE RIGHT NOW, at zero credits and with no
                  network call at all, because we know the arrival rate:
                  ~20,700/day is 0.24/s, and a long window with zero recorded
                  rows is a Poisson impossibility against that.

★ TRANSPORT-INDEPENDENT BY CONSTRUCTION. It reads the census we wrote; it does
  not know or care how the bytes arrived. That is why it did not belong behind
  OBJ-3 and why it shipped before the transport question was settled.

⛔ IT COUNTS RECORDED CENSUS ROWS, NEVER POSTS RECEIVED — Langston's first
   property, and the reason is that counting POSTs would be blind to the
   receiver's own judgement-call #3: a systematic parse failure answers 200
   forever and looks perfectly healthy. Counting the rows that actually landed
   catches BOTH the transport failure and the parse failure with ONE
   instrument. A POST that produced no row is, for the study, a push that
   never happened.

⛔ IT WRITES A GAP RECORD, NOT JUST AN ALERT — his second property, and it is
   the one that matters at analysis time. The census is the denominator of
   every rate in the study. A silent window biases every one of them downward
   and is INVISIBLE in the finished data. A gap record with a start and an end
   converts unknown loss into KNOWN, BOUNDED, EXCLUDABLE loss. An alert
   informs a human who may be asleep; a gap record informs the analysis.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from config import (
    BIRTHS_DIR,
    EXPECTED_LAUNCHES_PER_DAY,
    LIVENESS_GAP_SECONDS,
    ROOT,
    STORE_CAP_BYTES,
    STORE_CAP_WARN_BYTES,
)
from store import load_state, save_state

UTC = timezone.utc
LOG = logging.getLogger("token-watch.liveness")

PROVENANCE_DIR = f"{ROOT}/provenance"
GAPS_PATH = f"{PROVENANCE_DIR}/gaps.jsonl"

STATE = "liveness"


def _now() -> datetime:
    return datetime.now(UTC)


def _birth_path(day: datetime) -> str:
    return f"{BIRTHS_DIR}/{day.strftime('%Y-%m-%d')}.jsonl"


def _append_gap(rec: dict) -> None:
    """Append one gap record. Its own append-only file, never rewritten.

    ⛔ SEPARATE FROM THE CENSUS ON PURPOSE. A gap is a statement ABOUT the
       census, not a member of it. Putting a non-observation into the
       observation stream is the shape the change list already flags as an
       open question (judgement call #4); this does not repeat it.
    """
    os.makedirs(PROVENANCE_DIR, exist_ok=True)
    with open(GAPS_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def _estimate_rows(seconds: float) -> float:
    """Rows we would EXPECT in a window of this length.

    ⚠️ AN ESTIMATE FROM THE MEAN, AND THE MEAN IS THE WRONG SHAPE FOR THE
       PROCESS. Launches are bursty and diurnal; this figure is an
       order-of-magnitude bound for excluding a window, NEVER a count of what
       was lost. Labelled `estimate_basis` in the record so no analysis can
       read it as observed.
    """
    return round(seconds * (EXPECTED_LAUNCHES_PER_DAY / 86400.0), 1)


def _parse_ts(line: str):
    """Return the arrival timestamp of one census row, or None.

    Uses `first_seen_at` — WHEN WE SAW IT, not when it was created on chain.
    Liveness is a property of our feed, so a token created hours ago and
    delivered now is evidence the feed is ALIVE, and `created_at` would call
    it stale.
    """
    try:
        rec = json.loads(line)
    except (ValueError, TypeError):
        return None
    raw = rec.get("first_seen_at")
    if not raw:
        return None
    try:
        ts = datetime.fromisoformat(raw)
    except (ValueError, TypeError):
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


def _read_new_rows(path: str, offset: int):
    """Read complete lines from `offset`. Returns (timestamps, new_offset, bad).

    Truncation-detecting and torn-tail-safe, the same idiom the spend journal
    uses: a final line with no newline is a row STILL BEING WRITTEN, so it is
    not consumed and the offset does not advance past it. Consuming it would
    parse half a record and then never see the other half.
    """
    if not os.path.exists(path):
        return [], offset, 0
    size = os.path.getsize(path)
    if size < offset:
        # The file shrank. It is append-only, so this is truncation or
        # replacement, not normal operation. Restart from the beginning rather
        # than silently skipping whatever now sits under the stale offset.
        LOG.error("liveness: %s shrank (%d -> %d) — restarting cursor at 0",
                  path, offset, size)
        offset = 0
    if size == offset:
        return [], offset, 0
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        raw = fh.read()
    if not raw:
        return [], offset, 0
    consumed = len(raw.encode("utf-8"))
    if not raw.endswith("\n"):
        cut = raw.rfind("\n")
        if cut < 0:
            return [], offset, 0          # a single partial line; wait for it
        raw = raw[: cut + 1]
        consumed = len(raw.encode("utf-8"))
    stamps, bad = [], 0
    for line in raw.splitlines():
        if not line.strip():
            continue
        ts = _parse_ts(line)
        if ts is None:
            bad += 1
            continue
        stamps.append(ts)
    return stamps, offset + consumed, bad


def check(now: datetime = None) -> dict:
    """One liveness pass. Returns stats; never raises on a missing store.

    TWO LEGS, and the retrospective one is what makes an hourly checker able to
    see a gap that opened AND CLOSED between two of its own checks:

      RETROSPECTIVE — inter-arrival deltas read off the rows themselves. A
                      15-minute hole between two consecutive census rows is a
                      gap whether or not anyone was looking at the time.
      PROSPECTIVE   — now minus the last row we have seen. This is the leg that
                      catches a feed that is STILL down, which the
                      retrospective leg structurally cannot: a gap with no
                      closing row has no second timestamp to measure against.
    """
    now = now or _now()
    st = load_state(STATE, {})
    stats = {"rows": 0, "gaps": 0, "bad_lines": 0, "first_run": False}

    first_run = not st.get("cursor")
    if first_run:
        st["cursor"] = {"path": _birth_path(now), "offset": 0}
        stats["first_run"] = True

    cursor = st["cursor"]
    last_seen = st.get("last_row_at")
    last_dt = datetime.fromisoformat(last_seen) if last_seen else None

    # Walk the cursor's day forward to today. A day roll leaves the previous
    # file closed, so its tail MUST be drained before the cursor moves on —
    # otherwise midnight silently eats every row written after the last check.
    day = datetime.fromisoformat(cursor["path"].rsplit("/", 1)[-1][:-6]).replace(tzinfo=UTC) \
        if cursor["path"].endswith(".jsonl") else now
    offset = cursor["offset"]
    stamps = []
    guard = 0
    while day.date() <= now.date() and guard < 400:
        guard += 1
        path = _birth_path(day)
        got, offset, bad = _read_new_rows(path, offset)
        stamps.extend(got)
        stats["bad_lines"] += bad
        if day.date() == now.date():
            break
        day = day + timedelta(days=1)
        offset = 0                      # a new file starts at its beginning
    cursor["path"], cursor["offset"] = _birth_path(day), offset

    stamps.sort()
    stats["rows"] = len(stamps)

    # ── RETROSPECTIVE ────────────────────────────────────────────────────────
    prev = last_dt
    for ts in stamps:
        if prev is not None:
            delta = (ts - prev).total_seconds()
            if delta > LIVENESS_GAP_SECONDS:
                _append_gap({
                    "kind": "feed_gap",
                    "detected": "retrospective",
                    "started_at": prev.isoformat(),
                    "ended_at": ts.isoformat(),
                    "duration_s": round(delta, 1),
                    "estimated_rows_missed": _estimate_rows(delta),
                    "estimate_basis": "mean rate; bursty and diurnal — a bound "
                                      "for excluding the window, not a count",
                    "recorded_at": now.isoformat(),
                })
                stats["gaps"] += 1
                LOG.warning("liveness: %.0fs gap in the census between %s and %s "
                            "— gap record written", delta, prev.isoformat(),
                            ts.isoformat())
        prev = ts
    if prev is not None:
        last_dt = prev

    # ── PROSPECTIVE ──────────────────────────────────────────────────────────
    open_gap = st.get("open_gap")
    if last_dt is not None:
        silent = (now - last_dt).total_seconds()
        if silent > LIVENESS_GAP_SECONDS:
            if not open_gap:
                st["open_gap"] = {"started_at": last_dt.isoformat()}
                LOG.error("liveness: NO CENSUS ROWS FOR %.0fs — the feed may be "
                          "down. Silence here is not evidence of a quiet "
                          "market.", silent)
            else:
                LOG.error("liveness: still no census rows — silent for %.0fs",
                          silent)
        elif open_gap:
            started = datetime.fromisoformat(open_gap["started_at"])
            dur = (last_dt - started).total_seconds()
            _append_gap({
                "kind": "feed_gap",
                "detected": "prospective_closed",
                "started_at": open_gap["started_at"],
                "ended_at": last_dt.isoformat(),
                "duration_s": round(dur, 1),
                "estimated_rows_missed": _estimate_rows(dur),
                "estimate_basis": "mean rate; bursty and diurnal — a bound "
                                  "for excluding the window, not a count",
                "recorded_at": now.isoformat(),
            })
            stats["gaps"] += 1
            st["open_gap"] = None
            LOG.warning("liveness: feed recovered after %.0fs — gap closed and "
                        "recorded", dur)
    elif first_run:
        # ⚠️ NO ROWS AND NO HISTORY. We cannot tell "never started" from
        #    "stopped", so we do NOT manufacture a gap out of our own
        #    ignorance — but we say so, because a silent first run is exactly
        #    how an absence gets read as a valid zero.
        LOG.warning("liveness: first run and the census is empty — no gap "
                    "recorded, because 'not yet started' and 'stopped' are "
                    "indistinguishable from here")

    if last_dt is not None:
        st["last_row_at"] = last_dt.isoformat()
    st["cursor"] = cursor
    st["checked_at"] = now.isoformat()
    save_state(STATE, st)

    stats.update(_store_size_check())
    return stats


def _store_size_check() -> dict:
    """The accept-side dual of the switch. See config's STORE_CAP_BYTES.

    ⛔ NOT HOUSEKEEPING. An append-only store cannot defend itself against a
       flood, and the header of this module explains why the flood direction
       has no detector of its own. This is that detector.
    """
    total = 0
    for base, _dirs, files in os.walk(ROOT):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(base, name))
            except OSError:
                continue
    out = {"store_bytes": total, "store_state": "ok"}
    if total >= STORE_CAP_BYTES:
        out["store_state"] = "over_cap"
        LOG.error("liveness: STORE OVER CAP — %.2f GiB >= %.2f GiB. The "
                  "trading app shares this filesystem; a full disk stops it "
                  "writing with no database write anywhere in the story.",
                  total / 2**30, STORE_CAP_BYTES / 2**30)
    elif total >= STORE_CAP_WARN_BYTES:
        out["store_state"] = "warn"
        LOG.warning("liveness: store at %.2f GiB, warning line %.2f GiB",
                    total / 2**30, STORE_CAP_WARN_BYTES / 2**30)
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    print(json.dumps(check(), indent=2, sort_keys=True))
