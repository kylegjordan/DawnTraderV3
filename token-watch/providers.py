"""
token-watch — every outbound network call, in one module.

WHY ONE MODULE: the credit budget is only enforceable if there is exactly one
place that spends it. Scattering HTTP calls through the collector would make
`budget.allowed()` advisory — a check somebody remembers to call — instead of
a gate everything passes through. So the rule here is structural: no other
module in this package imports urllib.

⚠️ LICENSING WAS A PRE-CODE GATE, not a footnote (Langston). CoinGecko /
   GeckoTerminal are UNUSABLE for this study at EVERY tier, free and paid
   alike: their terms 6.1/6.2 forbid storing or deriving from the Data, and
   require any cache to refresh within 24h. That forbids the DATASET, not the
   tier. Had this been checked after the build, the build would have finished
   and then been unusable.

   DexScreener's terms were READ, not assumed: commercial use is explicitly
   permitted and there is NO storage or derivation prohibition.

★ AND ONE RETRACTION LIVES HERE BECAUSE IT SHAPES THE CODE (pre-reg
  AMENDMENT 2): I claimed DexScreener "cannot see" bonding-curve tokens. FALSE.
  It returns the pair, the venue, the price and the volume. What it returns as
  null is the LIQUIDITY FIELD. That is a field gap, not a visibility gap —
  which is exactly why the liquidity leg exists and why it is small.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

import budget
import provenance
from config import DEXSCREENER_BASE, HELIUS_ENV

UTC = timezone.utc
TIMEOUT = 20
USER_AGENT = "dawntrader-token-watch/1.0 (observation study; no trading)"


class Shed(Exception):
    """Raised when the budget refuses a call. NOT an error condition —
    it is the shed order working, and callers must record it as an observation
    that did not happen rather than swallowing it. A silent skip and a
    completed call must never look the same in the record.
    """


def _get(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def helius_key() -> str:
    """Read the key from its env file at call time.

    ⛔ NEVER hard-code it and never log it. Read at call time rather than at
    import so a rotation takes effect on the next call instead of the next
    restart — the key is Kyle's and rotating it must not require me.
    """
    if not os.path.exists(HELIUS_ENV):
        raise RuntimeError(
            f"{HELIUS_ENV} is absent. FAILING HARD rather than continuing without a key: "
            "a collector that silently records nothing is indistinguishable from a quiet market."
        )
    with open(HELIUS_ENV, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("HELIUS_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(f"HELIUS_API_KEY not found in {HELIUS_ENV}")


# ─────────────────────────────────────────────────────────────────────────────
# FOLLOW-UP — DexScreener. Free, no account, no key. 300 req/min against our
# ~19k/day need (under 5% of the limit).
# ⚠️ NO ACCOUNT MEANS NO SERVICE GUARANTEE. Named residual: if it throttles or
#    changes, the fallback is chain-direct on the spare Helius allowance —
#    which is the same headroom the liquidity leg uses, so the fallback and the
#    liquidity budget compete. Stated rather than discovered later.
# ─────────────────────────────────────────────────────────────────────────────
def _socials(pair: dict) -> dict:
    """Advertised channels, as reported by the follow-up provider.

    ⚠️ THIS IS *SOCIALS AS OBSERVED NOW*, NOT *SOCIALS AT LAUNCH*, and the two
       are different claims. A token can add a channel on day three. The
       observation carries the age it was taken at, so the analysis can say
       which it is; the field name must never imply the stronger one.
    """
    info = pair.get("info") or {}
    kinds = {str(s.get("type") or "").lower() for s in (info.get("socials") or [])}
    return {
        "telegram": "telegram" in kinds,
        "twitter": "twitter" in kinds or "x" in kinds,
        "website": bool(info.get("websites")),
    }


def token_state(mint: str) -> dict:
    """One call returns everything a checkpoint needs.

    Returns a dict with `alive`, and — when a pair exists — price, 24h volume,
    buy/sell counts and the pair's creation time. `liquidity_usd` is None for
    bonding-curve pools; that is the FIELD gap above, not an absence of data.
    """
    if not budget.allowed("follow_up"):
        raise Shed("follow_up")
    try:
        data = _get(f"{DEXSCREENER_BASE}/latest/dex/tokens/{mint}")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise Shed("follow_up rate-limited")
        raise
    budget.charge("follow_up", 1)

    # ⛔ PERSIST THE RAW RESPONSE BEFORE EXTRACTING FROM IT. Below, eight
    #    fields are taken out of a response that carries far more, and the
    #    choice of which eight is a decision made TODAY about what matters —
    #    exactly the thing a 90-day study discovers it got wrong. Written
    #    first so a response that CRASHES the extraction is still kept.
    provenance.record_follow_up(mint, "dexscreener_token_state", data)

    pairs = (data or {}).get("pairs") or []
    if not pairs:
        # ⚠️ NO PAIR IS NOT PROOF OF DEATH. It is also what an indexing gap
        # looks like, and the two are indistinguishable from here. The caller
        # decides, against the death definition — this function reports.
        # ⛔ `socials: None` IS NOT COSMETIC — IT IS THE DIFFERENCE BETWEEN
        #    "no channels" AND "we could not look". Langston, BLOCKER-A: the
        #    caller did `state.get("socials") or {}`, so an ABSENT key became
        #    an EMPTY dict became `had_channel: False`, and the token was
        #    assigned as a CONFIRMED non-carrier off a lookup that resolved
        #    nothing. No-pairs is what an INDEXING GAP looks like as well as
        #    a dead token — this function's own comment says so four lines
        #    up — and the direction is adverse, because no-pairs correlates
        #    with dying fast, which is the outcome under study.
        return {"alive": False, "pairs": 0, "evidence": "no_pairs_returned",
                "socials": None}

    p = max(pairs, key=lambda x: float((x.get("volume") or {}).get("h24") or 0))
    txns = (p.get("txns") or {}).get("h24") or {}
    liq = (p.get("liquidity") or {}).get("usd")
    vol = float((p.get("volume") or {}).get("h24") or 0)
    return {
        "alive": vol > 0,
        "pairs": len(pairs),
        "dex_id": p.get("dexId"),
        "price_usd": p.get("priceUsd"),
        "volume_h24": vol,
        "buys_h24": txns.get("buys"),
        "sells_h24": txns.get("sells"),
        "liquidity_usd": liq,          # None on a bonding curve — a field gap
        "pair_created_at": p.get("pairCreatedAt"),
        # SOCIALS RIDE THIS RESPONSE, FREE. The webhook payload carries none —
        # both branches receiver.parse_creation reads are empty on every real
        # creation (#973) — but the follow-up call we ALREADY make returns them
        # in `info`. Verified on a 12-minute-old pump.fun token: `info.socials`
        # held its twitter link. Zero provider credits; this is the same request.
        "socials": _socials(p),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LIQUIDITY — chain-direct, on the spare Helius allowance.
# ★ NOT optional colour: liquidity being PULLED is the clearest rug signal, and
#   it is the one field the free follow-up leg cannot give us for the cohort we
#   care most about (pre-graduation tokens).
# ⛔ FIRST IN THE SHED ORDER. If the budget is tight this stops and births
#   continue — that ordering is the whole of OBJ-9.
# ─────────────────────────────────────────────────────────────────────────────
def pool_liquidity(mint: str) -> dict:
    if not budget.allowed("liquidity"):
        raise Shed("liquidity")
    key = helius_key()
    url = f"https://mainnet.helius-rpc.com/?api-key={key}"
    body = json.dumps({
        "jsonrpc": "2.0", "id": "token-watch", "method": "getTokenLargestAccounts",
        "params": [mint],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json", "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    budget.charge("liquidity", 1)
    # Same reasoning as token_state: the chain response carries the full
    # holder list and we keep three numbers off it.
    provenance.record_follow_up(mint, "helius_largest_accounts", data)
    holders = ((data or {}).get("result") or {}).get("value") or []
    return {
        "holder_count": len(holders),
        "top_holder_amount": holders[0].get("uiAmount") if holders else None,
        "read_at": datetime.now(UTC).isoformat(),
    }


def chain_creations(start_slot_time, end_slot_time) -> list:
    """★ OBJ-3's coverage control — enumerate creations directly from the chain
    for one short window, and compare against what the webhook delivered.

    ⚠️ STATED REACH, and it covers ONE leg of three: it catches DELIVERY LOSS —
    a push that dropped silently with no local error, the #704 class. It does
    NOT catch provider-side indexing gaps, because it asks the same provider.
    A control covering one leg is never described as covering three.

    Left unimplemented deliberately at Step 3: it needs the enhanced-transaction
    endpoint's paging semantics verified against live data, and inventing them
    from documentation is how a control ends up confirming what it never
    measured. Implemented and evidenced in the Phase-3 proving run.
    """
    raise NotImplementedError(
        "chain_creations: implemented in the Phase-3 proving run, against live "
        "paging verified rather than assumed. See B_TOKEN_WATCH_PRE_AUDIT.md P3.1."
    )
