"""
token-watch — the birth receiver. (OBJ-1, OBJ-2)

A single-process HTTP endpoint that Helius pushes token-creation events to,
appends one census row per launch, and schedules that launch's observation
grid. It is the ONLY writer of birth records.

⛔ HOSTED ON STAGING — KYLE OVERRULED THE HELSINKI-ONLY FENCE, 2026-08-28.
   This header said the opposite until today, so it is corrected rather than
   annotated. His reason defeated the argument on evidence: four capture-only
   legs already run on that box (`server/services/passive-archive/`,
   `crypto-perp-archiver.ts:8-11` says CAPTURE ONLY in its own header), storing
   everything and trading none of it. "A collector cannot sit on the trading
   box" was refuted by four collectors that do.

   ★ AND THE SECURITY AXIS RAN THE OTHER WAY FROM MY ARGUMENT: staging already
     serves :443 publicly behind Caddy with a valid certificate, so this is a
     NEW PATH ON AN ALREADY-PUBLIC PROXY. Helsinki would have meant opening the
     FIRST non-SSH port on the box running the reviewer and the crew's comms.

⛔ WHAT THE FENCE'S HOST PROTECTION IS REPLACED BY, because losing it was real:
   own unprivileged user · own path · NO study data in the trading database
   (stricter than the precedent, which writes to Supabase) · `MemoryMax=` in
   the unit — staging has SWAP: 0, so the OOM killer selects on RSS and would
   take the TRADING process, not this one · a store cap, because the archivers'
   bytes go to Supabase and OURS LAND ON THE TRADING APP'S DISK. The diff test
   still cannot enforce any of it, so it is stated in the unit where it is
   visible in a listing.

★ WHY A WEBHOOK AND NOT POLLING, measured rather than assumed: the launchpad
  program runs ~500 transactions/second — 43.2M/day, 83% of them failed bot
  attempts. Launches are ~0.05% of that traffic. Unfiltered ingestion is
  impossible at EVERY tier, including the $999 one. Everything depends on the
  provider filtering server-side, which is why verifying that a creation is
  separable from the noise was the decisive test rather than a detail.

⚠️ A WEBHOOK PUSH DROPS SILENTLY, with no local error — the #704 class. AND
   THE SENTENCE THAT USED TO SIT HERE WAS FALSE IN HALF: it read "nothing here
   can detect that", which is true of one failure direction and wrong about
   the other. Langston caught it, and an asserted absence about our OWN
   capability is the #453 class — the one this batch keeps paying for.

   PARTIAL drop — some creations delivered, some lost. GENUINELY undetectable
     locally; we cannot miss what we were never told about. This is what OBJ-3
     is for, and it correctly waits for the proving run.

   TOTAL stop — dead endpoint, crashed proxy, revoked secret, provider outage.
     DETECTABLE HERE AND NOW, at zero credits and with no network call, because
     the arrival rate is known: ~20,700/day is 0.24/s, so a long window with
     zero RECORDED CENSUS ROWS is a Poisson impossibility. `liveness.py` does
     exactly this, and it counts ROWS rather than POSTs so that it also catches
     the failure below — a systematic parse error answering 200 forever looks
     perfectly healthy from the POST side.

   ⇒ this module's silence is still not evidence of a quiet market. It is now
     evidence that something is checked, rather than that nothing can be.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import budget
import provenance
from config import CONTROL_INCLUSION_P, PLATFORM_DEFAULT_SIZE
from store import ensure_dirs, record_birth

UTC = timezone.utc
LOG = logging.getLogger("token-watch.receiver")

LISTEN_HOST = os.environ.get("TOKEN_WATCH_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("TOKEN_WATCH_PORT", "8797"))
MAX_BODY = 4 * 1024 * 1024

# Plausibility bounds for a creation timestamp. A launch cannot predate the
# launchpad, and one dated in the future is a provider or clock fault, not a
# token. Both are REFUSALS: a fabricated creation time is invisible and lands
# in the strongest published predictor.
EPOCH_FLOOR = 1_600_000_000            # 2020-09-13; well before this venue existed
FUTURE_TOLERANCE_S = 3600              # a modest clock skew, not a decade


def _epoch_ceiling() -> float:
    return datetime.now(UTC).timestamp() + FUTURE_TOLERANCE_S


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


def _journal_launch(day: str, followed: bool, reason: str, size_source: str,
                    now: datetime) -> None:
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
    # ⛔ size_source RIDES THE JOURNAL so something COUNTS it. Langston,
    #    BLOCKER-3: it was persisted on the birth row and had NO READER —
    #    nothing tallied it, nothing warned on it. An extraction break (the
    #    provider renames a field, feePayer goes absent) makes every size
    #    unresolvable → non-carrier → the 3% control arm, so THE SIZE LIMB OF
    #    THE TRAIT DEFINITION SWITCHES OFF SILENTLY and the study degrades to
    #    socials-only with no alarm.
    # ★ Identical in shape to the received/recorded mismatch I fixed two
    #   functions away — on the limb I had myself called the weakest thing in
    #   the diff.
    budget.record_pending("birth", 1, now, day=day, followed=followed,
                          reason=reason, size_source=size_source)


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

    # ⛔ THE CREATION TIMESTAMP IS VALIDATED, NOT ASSUMED — and a missing one
    #    is a REFUSAL, not a substitution.
    #
    #    The first version read `ts` as POSIX seconds and fell back to "now"
    #    when it was falsy. A fresh reader found two failures in that one line:
    #    a MILLISECOND timestamp raises, which the caller's broad except
    #    swallows into a log line and DROPS THE LAUNCH FROM THE CENSUS; and
    #    `ts == 0` is falsy, so created_at silently became now() — making
    #    discovery_lag_s zero and recording the left-truncation that OBJ-2
    #    exists to expose as ABSENT.
    # ★ A fabricated creation time is worse than a refused event, because the
    #   fabrication is invisible and lands in the strongest published predictor.
    ts = event.get("timestamp")
    if ts is None:
        return None
    try:
        ts = float(ts)
    except (TypeError, ValueError):
        return None
    # ⛔ NORMALISE BY MAGNITUDE UNTIL IT IS PLAUSIBLE, THEN BOUND IT.
    #    My first fix divided by exactly 1000 once, for milliseconds, and never
    #    re-checked — so MICROSECOND and NANOSECOND timestamps still raised,
    #    were still swallowed by the caller's broad handler, and the launch was
    #    still dropped from the census. A fresh reader executed all four units:
    #    seconds and milliseconds accepted, microseconds and nanoseconds
    #    raising. ★ That is the IDENTICAL failure one unit over — the same
    #    shape as replacing "position 0" with "first match".
    for _ in range(3):
        if ts <= 1e11:
            break
        ts /= 1000.0
    if ts <= 0:
        return None
    # ⛔ AND A PLAUSIBILITY BOUND, because "parseable" is not "valid". A far
    #    future value was accepted and gave created_at in 2286 — a NEGATIVE
    #    discovery lag with the whole observation grid scheduled decades out.
    #    An epoch-adjacent value made all seven grid points misses. Neither
    #    raised; both silently corrupted the strongest published predictor.
    if not (EPOCH_FLOOR <= ts <= _epoch_ceiling()):
        return None
    created = datetime.fromtimestamp(ts, UTC)

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
    # ⛔ THE LARGEST transfer FROM the creator, not the first one.
    #    A fresh reader reproduced the flaw in my first fix: the creator also
    #    pays priority fees, account rent and mint rent FROM THE SAME ACCOUNT,
    #    and those can be ordered before the buy. Given transfers of 5,000
    #    lamports then 3 SOL, taking the first returned 0.000005 SOL — a wrong
    #    near-zero number WEARING THE "RESOLVED" LABEL, which lands the token
    #    at non-carrier and into the 3% control arm.
    # ★ That is the original index bug moved down one level: I replaced
    #   "position 0" with "first match" and kept the same assumption that
    #   ordering means something.
    creator = event.get("feePayer")
    size, size_source = None, "unresolved"
    mine = [t for t in (event.get("nativeTransfers") or [])
            if creator and t.get("fromUserAccount") == creator]
    if mine:
        biggest = max(mine, key=lambda t: t.get("amount") or 0)
        size = (biggest.get("amount") or 0) / 1e9
        size_source = ("feePayer_largest_of_%d" % len(mine)) if len(mine) > 1 \
            else "feePayer_sole_transfer"

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
    unresolved = 0
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
                size_source=launch["size_source"],
                initial_liquidity=launch["initial_liquidity"],
                creator=launch["creator"],
                socials=launch["socials"],
                followed=followed,
                follow_reason=reason,
            )
            _journal_launch(seen.strftime("%Y-%m-%d"), followed, reason,
                            launch["size_source"], seen)
            if launch["size_source"] == "unresolved":
                unresolved += 1
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
    if unresolved and n and unresolved == n:
        LOG.warning(
            "size_source=unresolved for ALL %d recorded launches in this "
            "delivery — if this persists the size limb of the trait definition "
            "has switched off and every token is routing to the control arm", n)
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
    if not received:
        return
    # ⛔ kind="delivery", NOT a zero-credit "birth". A fresh reader found that
    #    the note rode in as a birth row: it incremented the fold's `folded`
    #    counter (100 births reported as 101 rows) and injected an n=0 birth
    #    event into the burn monitor's event stream. A record that is not
    #    spend must not be counted as spend, even at zero.
    budget.record_pending("delivery", 1, datetime.now(UTC),
                          received=received, recorded=recorded)


class Handler(BaseHTTPRequestHandler):
    def _remote(self) -> str:
        """The caller, preferring the proxy's forwarded address.

        ⚠️ X-Forwarded-For IS CALLER-CONTROLLED and this does not pretend
           otherwise — it is recorded for the AUDIT TRAIL, never trusted for a
           decision. Nothing in this file authorises on it.
        """
        fwd = self.headers.get("X-Forwarded-For")
        if fwd:
            return fwd.split(",")[0].strip()
        try:
            return self.client_address[0]
        except Exception:
            return "unknown"

    def do_POST(self):  # noqa: N802
        remote = self._remote()
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            provenance.record_rejected("body_too_large", remote, length)
            self.send_response(413)
            self.end_headers()
            return

        # ⛔⛔ THE AUTH GATE SITS AHEAD OF EVERYTHING, AND AHEAD OF THE BODY
        #    READ WHERE IT CAN. An unauthenticated caller must not be able to
        #    reach the parser, the census, or the raw store — the raw store
        #    especially, because writing an unauthenticated body to disk is
        #    handing a stranger a write primitive.
        ok, reason = provenance.authorized(self.headers.get("Authorization"))
        if not ok:
            raw = self.rfile.read(min(length, MAX_BODY)) if length else b""
            provenance.record_rejected(
                reason, remote, length,
                hashlib.sha256(raw).hexdigest() if raw else None)
            # 401 with NO detail. Telling the caller which half was wrong tells
            # an attacker which half to fix.
            self.send_response(401)
            self.end_headers()
            return

        raw = self.rfile.read(length)

        # ★ THE RAW COPY LANDS BEFORE THE PARSE, AND THAT ORDER IS THE POINT.
        #   Persisting after a successful parse would keep a record of exactly
        #   the deliveries that already worked, and lose the ones that reveal a
        #   parser defect — which is the case the store most needs to answer.
        try:
            provenance.record_accepted(raw, remote)
        except OSError:
            # Never let an audit-write failure drop a census row: the census is
            # irreversible and the audit is not. Loud, and it continues.
            LOG.exception("provenance write FAILED — census row proceeds "
                          "unaudited; this is a degraded state, not a normal one")

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
