"""
token-watch — the feed watch: the dead-man's switch on its own timer. (B-TOKEN-WATCH-STORAGE amendment 1, OBJ-8)

★ WHY THIS EXISTS. The switch (`liveness.check()`) ran only inside the hourly
  follow-up sweep. When the sweep was switched off on 2026-09-30 for running
  out of memory (#1132), the switch went with it, and the feed then stopped
  for nine days (2026-10-18 → 10-27, #1247) with nothing recording it. This
  job runs the switch hourly on its own, and it is now the ONE writer of
  `state/liveness.json` (the call in `follow_up.run_hour` was removed, A9).

TWO STEPS, TWO IDENTITIES, ONE UNIT (`token-watch-feed-watch.service`):
  --check  as `tokenwatch` (ExecStart). `check()` writes `state/`, which is
           tokenwatch-only; run as root it would leave root-owned files there
           (the trap `ops/store_watch.py`'s header describes). It first runs
           `liveness.probe_readable()`: a store it cannot read must FAIL the
           unit, never read as a quiet feed (A6). Then `check()`, then the
           result for the mint step.
  --mint   as root (ExecStartPost=+). Only root can run the alert command as
           `deploy` (`alert_mint`). It reads the result the check step just
           wrote — refusing one that is stale or missing — and mints
           `token-watch-feed-gap` when a gap is OPEN. Nothing on a closed gap:
           a gap that opened and closed is recorded by `liveness._append_gap`
           in `provenance/gaps.jsonl`, which is the record the study reads.

⚠️ WHILE THE ROW STANDS, A SECOND GAP MINTS NOTHING (pre-audit A8). `add` on an
   unresolved key returns the existing row and writes nothing, and there is no
   update verb — so the row keeps the FIRST gap's start time. The owner reads
   `provenance/gaps.jsonl` before resolving. No machine actor exists for
   token-watch, so the row is resolved by its owner with evidence, never
   acked: an ack is not terminal and would block the key for good.

Imports: `config` and `liveness` only (`test_ops_boundary`'s ALLOWED_FOR_OPS).
"""

from __future__ import annotations

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import json
import logging
import sys
from datetime import datetime, timedelta, timezone

import alert_mint
import liveness
from config import LIVENESS_CHECK_INTERVAL_SECONDS, LIVENESS_GAP_SECONDS

LOG = logging.getLogger("token-watch.feed-watch")
UTC = timezone.utc
DEDUPE_KEY = "token-watch-feed-gap"
# The mint step runs straight after the check step, in the same unit. A result
# older than this was not written by this run, and is refused.
RESULT_MAX_AGE = timedelta(minutes=15)


def _maxrss_mb() -> float | None:
    try:
        import resource
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1)
    except Exception:                             # noqa: BLE001 — not on every platform; a reading, not a gate
        return None


def run_check(now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    problems = liveness.probe_readable()
    if problems:
        for p in problems:
            LOG.error("PROBE FAILED: %s", p)
        LOG.error("the census could not be read, so no liveness reading was taken — this is a failure, "
                  "not a quiet feed")
        return 2
    stats = liveness.check(now)
    gap = liveness.open_gap()
    result = {"checked_at": now.isoformat(), "open_gap": gap, "stats": stats, "maxrss_mb": _maxrss_mb()}
    liveness.save_feed_result(result)
    LOG.info("feed watch: rows=%s gaps_recorded=%s open_gap=%s store=%s maxrss_mb=%s",
             stats.get("rows"), stats.get("gaps"), gap, stats.get("store_state"), result["maxrss_mb"])
    return 0


def body_for(gap: dict, result: dict) -> str:
    stats = result.get("stats") or {}
    return "\n".join([
        "No census rows recorded since %s (checked %s). The token-watch feed may be down; "
        "silence here is not evidence of a quiet market." % (gap.get("started_at"), result.get("checked_at")),
        "Threshold: %d s without a recorded row (config.LIVENESS_GAP_SECONDS); checked every %d s "
        "(config.LIVENESS_CHECK_INTERVAL_SECONDS)." % (LIVENESS_GAP_SECONDS, LIVENESS_CHECK_INTERVAL_SECONDS),
        "Rows read this check: %s. Store: %s B (%s)." % (stats.get("rows"), stats.get("store_bytes"),
                                                       stats.get("store_state")),
        "",
        "WHILE THIS ROW STANDS, A LATER, SEPARATE GAP MINTS NOTHING, and this row keeps the FIRST gap's start. "
        "Read /var/lib/token-watch/provenance/gaps.jsonl (every gap, opened and closed) before resolving.",
        "Owner: Infra Claude (CC-INFRA). RESOLVE with evidence once the feed is back — never ack: an ack is not "
        "terminal and blocks this key for good.",
        "Source: token-watch/ops/feed_watch.py, unit token-watch-feed-watch (B-TOKEN-WATCH-STORAGE amendment 1).",
    ])


def run_mint(now: datetime | None = None, mint=alert_mint.mint) -> int:
    now = now or datetime.now(UTC)
    result = liveness.load_feed_result()
    try:
        checked = datetime.fromisoformat(result["checked_at"])
    except (KeyError, TypeError, ValueError):
        LOG.error("no feed-watch result to read (%r) — the check step did not leave one", result)
        return 1
    if now - checked > RESULT_MAX_AGE:
        LOG.error("the feed-watch result is from %s, older than %s — not this run's; refusing to read it",
                  result["checked_at"], RESULT_MAX_AGE)
        return 1
    gap = result.get("open_gap")
    if not gap:
        LOG.info("no open gap at %s — nothing to mint", result["checked_at"])
        return 0
    ok = mint(severity="warning", dedupe_key=DEDUPE_KEY,
              title="token-watch feed silent since %s" % gap.get("started_at"),
              body=body_for(gap, result))
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if argv[1:] == ["--check"]:
        return run_check()
    if argv[1:] == ["--mint"]:
        return run_mint()
    print("usage: feed_watch.py --check | --mint", file=sys.stderr)
    return 2


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    sys.exit(main(sys.argv))
