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

from config import CONTROL_INCLUSION_P
from store import ensure_dirs, load_state, record_birth, save_state

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


def _log_inclusion(day: str, followed: bool, reason: str) -> None:
    """Daily realised counts — the denominator for inverse-probability
    weighting, which is pre-registered NOW rather than reconstructed at
    analysis time. The DESIGN probability is a constant; this is the TRUTH,
    and where they disagree the analysis uses this.
    """
    st = load_state("inclusion", {})
    d = st.setdefault(day, {"launches": 0, "trait_carrier": 0, "control_sample": 0, "not_sampled": 0})
    d["launches"] += 1
    d[reason] = d.get(reason, 0) + 1
    save_state("inclusion", st)


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
    return {
        "mint": mint,
        "created_at": created,
        "venue": event.get("source") or "unknown",
        "initial_size": (event.get("nativeTransfers") or [{}])[0].get("amount", 0) / 1e9
        if event.get("nativeTransfers") else None,
        "initial_liquidity": None,
        "creator": event.get("feePayer"),
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
            _log_inclusion(seen.strftime("%Y-%m-%d"), followed, reason)
            n += 1
        except Exception:
            LOG.exception("event dropped — this is a hole in the census, not a nuisance")
    return n


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
