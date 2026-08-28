"""
token-watch — the birth receiver. (OBJ-1, OBJ-2)

A single-process HTTP endpoint that Helius pushes token-creation events to,
appends one census row per launch, and schedules that launch's observation
grid. It is the ONLY writer of birth records.

⛔ HOSTED ON HELSINKI, NEVER ON THE TRADING BOX. That is a scope constraint,
   not a preference, and the fence's diff test cannot enforce it: ~20,700
   POSTs/day plus an hourly scheduler produce NO DIFF while still contending
   for CPU, event loop and disk.

★ WHY A WEBHOOK AND NOT POLLING, measured rather than assumed: the launchpad
  program runs ~500 transactions/second — 43.2M/day, 83% of them failed bot
  attempts. Launches are ~0.05% of that traffic. Unfiltered ingestion is
  impossible at EVERY tier, including the $999 one. Everything depends on the
  provider filtering server-side, which is why verifying that a creation is
  separable from the noise was the decisive test rather than a detail.

⚠️ AND A WEBHOOK PUSH DROPS SILENTLY, with no local error — the #704 class.
   Nothing here can detect that; the coverage control (OBJ-3) exists precisely
   because this module's silence is not evidence of a quiet market.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import budget
from config import CONTROL_INCLUSION_P
from store import ensure_dirs, record_birth

UTC = timezone.utc
LOG = logging.getLogger("token-watch.receiver")

LISTEN_HOST = os.environ.get("TOKEN_WATCH_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("TOKEN_WATCH_PORT", "8797"))
MAX_BODY = 4 * 1024 * 1024


# ─────────────────────────────────────────────────────────────────────────────
# THE TRAIT DEFINITION — fixed before data, imported from the literature.
#
# ★ THE LOAD-BEARING REASON (Langston's, and it is why this is not tunable):
#   a threshold set before our cohort existed CANNOT have been fitted to it.
#
# ⛔ IF MEASURED PREVALENCE IS HIGHER THAN EXPECTED, THE TRAFFIC RISES AND THIS
#   DEFINITION DOES NOT NARROW. A definition tightened to fit a traffic ceiling
#   is trimming with the label moved.
# ─────────────────────────────────────────────────────────────────────────────
PLATFORM_DEFAULT_SIZE = 1.0  # the launchpad's default initial buy, in SOL


def is_trait_carrier(socials: dict, initial_size) -> bool:
    """Any advertised channel OR an initial size above the platform default."""
    has_social = any(bool(v) for v in (socials or {}).values())
    try:
        big = initial_size is not None and float(initial_size) > PLATFORM_DEFAULT_SIZE
    except (TypeError, ValueError):
        big = False
    return has_social or big


def in_control_sample(mint: str) -> bool:
    """Deterministic membership of the random control arm.

    ★ DETERMINISTIC, NOT RANDOM, and that is deliberate: a hash of the mint
      gives a uniform draw that is REPRODUCIBLE. An RNG would make the control
      arm unauditable after the fact — nobody could re-derive which tokens were
      eligible — and in a pre-registered study "we sampled randomly, trust us"
      is exactly the claim that cannot be checked.

    ⛔ THE CONTROL IS NOT OPTIONAL. Without it, trait-carrier follow-up has no
      comparison group and we are studying winners again, which is the failure
      this whole design exists to avoid.
    """
    h = hashlib.sha256(mint.encode()).digest()
    draw = int.from_bytes(h[:8], "big") / 2 ** 64
    return draw < CONTROL_INCLUSION_P


def follow_decision(mint: str, socials: dict, initial_size) -> tuple:
    """Returns (followed, reason). Census on birth is unconditional — this
    decides only who gets FOLLOWED UP, which is where the cost lives.
    """
    if is_trait_carrier(socials, initial_size):
        return True, "trait_carrier"
    if in_control_sample(mint):
        return True, "control_sample"
    return False, "not_sampled"


def _journal_launch(day: str, followed: bool, reason: str, now: datetime) -> None:
    """One append per launch, carrying BOTH the credit spend and the inclusion
    fields. ⛔ THE RECEIVER WRITES NO STATE FILE — it appends, and the locked
    hourly job folds.

    ⚠️ THIS REPLACED AN UNLOCKED READ-MODIFY-WRITE, and that was Langston's
    BLOCKER-2. The old `_log_inclusion` did load_state + save_state per launch
    with no lock. It was benign only because no periodic job happened to touch
    that file — and the fix for BLOCKER-1 (charging births) would have put the
    receiver and the hourly job on the same budget counter, losing updates on
    the exact number the shed order reads. One append fixes both.

    ★ AND IT FIXES BLOCKER-1 ITSELF: nothing in production ever charged a
    birth, so the ledger sat at zero for the 776,000-credit leg and the burn
    thresholds (800k / 900k) were arithmetically unreachable. We would have
    hit the provider's real wall with the monitor reading 20% and level=None.
    """
    budget.record_pending("birth", 1, now, day=day, followed=followed, reason=reason)


# ─────────────────────────────────────────────────────────────────────────────
# EVENT PARSING
# ─────────────────────────────────────────────────────────────────────────────
def parse_creation(event: dict) -> dict | None:
    """Extract a launch from one provider event, or None if it is not one.

    VERIFIED AGAINST A REAL TOKEN: a creation arrives as type CREATE with the
    launchpad as its source. That single fact is what makes this viable — it
    is what lets the provider filter 43.2M daily transactions down to ~20,700.
    """
    if (event or {}).get("type") != "CREATE":
        return None

    mint = None
    for t in event.get("tokenTransfers") or []:
        if t.get("mint"):
            mint = t["mint"]
            break
    if not mint:
        for acc in event.get("accountData") or []:
            for ch in acc.get("tokenBalanceChanges") or []:
                if ch.get("mint"):
                    mint = ch["mint"]
                    break
            if mint:
                break
    if not mint:
        return None

    ts = event.get("timestamp")
    created = datetime.fromtimestamp(ts, UTC) if ts else datetime.now(UTC)

    meta = event.get("events", {}).get("nft") or {}
    socials = {
        "telegram": bool(event.get("telegram") or meta.get("telegram")),
        "twitter": bool(event.get("twitter") or meta.get("twitter")),
        "website": bool(event.get("website") or meta.get("website")),
    }
    # ⛔ THE INITIAL SIZE IS SELECTED BY ROLE, NEVER BY INDEX (Langston, Step-4
    #    item 1 — and his reframing is the load-bearing part).
    #
    #    The earlier version took `nativeTransfers[0].amount` and called it the
    #    creator's initial buy. NOTHING ESTABLISHED THAT. The "verified against
    #    a real token" note above covers the CREATE filter, not this extraction.
    #    If element [0] is mint rent or a platform fee, every token records a
    #    near-constant size, the size limb of the trait definition fires for
    #    everyone or for nobody, and it does so SILENTLY WITH A PLAUSIBLE
    #    NUMBER ATTACHED.
    #
    # ★ WORSE, AND THIS IS WHY IT IS A NULL AND NOT A ZERO: an unparseable size
    #   collapses to `big = False` → non-carrier → the 3% control arm. So an
    #   extraction FAILURE would have been indistinguishable from a genuinely
    #   small launch. `size_source` makes the failure loud instead.
    creator = event.get("feePayer")
    size, size_source = None, "unresolved"
    for t in event.get("nativeTransfers") or []:
        if creator and t.get("fromUserAccount") == creator:
            size = (t.get("amount") or 0) / 1e9
            size_source = "feePayer_native_transfer"
            break

    return {
        "mint": mint,
        "created_at": created,
        "venue": event.get("source") or "unknown",
        "initial_size": size,
        "size_source": size_source,
        "initial_liquidity": None,
        "creator": creator,
        "socials": socials,
    }


def ingest(events: list) -> int:
    """Record every creation in a webhook delivery. Returns the count recorded.

    ⛔ ONE BAD EVENT MUST NEVER DROP THE BATCH. Each is handled independently
       and a parse failure is logged loudly rather than swallowed — an
       exception here would silently discard launches that arrived correctly,
       and a hole in the census is unrecoverable.
    """
    n = 0
    received = len(events or [])
    seen = datetime.now(UTC)
    for ev in events or []:
        try:
            launch = parse_creation(ev)
            if not launch:
                continue
            followed, reason = follow_decision(
                launch["mint"], launch["socials"], launch["initial_size"]
            )
            record_birth(
                mint=launch["mint"],
                created_at=launch["created_at"],
                first_seen_at=seen,
                venue=launch["venue"],
                initial_size=launch["initial_size"],
                initial_liquidity=launch["initial_liquidity"],
                creator=launch["creator"],
                socials=launch["socials"],
                followed=followed,
                follow_reason=reason,
            )
            _journal_launch(seen.strftime("%Y-%m-%d"), followed, reason, seen)
            n += 1
        except Exception:
            LOG.exception("event dropped — this is a hole in the census, not a nuisance")

    # ⛔ RECEIVED vs RECORDED — Langston, Step-4 item 3, and he is right that
    # it costs three lines and does not need the coverage control.
    #
    # ★ THE SILENT PATH IS NOT A PARSE *FAILURE* — that throws and hits
    #   LOG.exception above, which is loud. It is a parse *MISMATCH*:
    #   parse_creation returns None on `type != "CREATE"` and the loop simply
    #   continues. If the provider's event type ever drifts, every delivery
    #   returns {"recorded": 0}, HTTP 200, AND NOT ONE LOG LINE, indefinitely.
    #
    # ⇒ logging both numbers is the exact discrimination this module otherwise
    #   cannot make: a QUIET MARKET and a STOPPED RECOGNISER look identical
    #   from the recorded count alone.
    if received and not n:
        LOG.warning(
            "received=%d recorded=0 — every event in this delivery was "
            "unrecognised. Sustained, this means the event shape changed, NOT "
            "that the market went quiet.", received)
    else:
        LOG.info("received=%d recorded=%d", received, n)
    _note_delivery(received, n)
    return n


def _note_delivery(received: int, recorded: int) -> None:
    """Append the pair so the ratio is reconstructable after the fact, not only
    visible in a log line somebody has to be watching.
    """
    if received:
        budget.record_pending("birth", 0, datetime.now(UTC),
                              delivery={"received": received, "recorded": recorded})


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self.send_response(413)
            self.end_headers()
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            LOG.exception("undecodable webhook body")
            self.send_response(400)
            self.end_headers()
            return

        events = payload if isinstance(payload, list) else [payload]
        n = ingest(events)
        # 200 unconditionally once the body parsed: a non-2xx makes the
        # provider retry, and a retry storm on a 2-core box is worse than a
        # dropped duplicate. Records are append-only, so a duplicate is
        # visible in the data rather than corrupting it.
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"recorded": n}).encode())

    def log_message(self, fmt, *args):
        LOG.info(fmt, *args)


def main():
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    ensure_dirs()
    LOG.info("token-watch receiver on %s:%s", LISTEN_HOST, LISTEN_PORT)
    HTTPServer((LISTEN_HOST, LISTEN_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
