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

import base64
import struct
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

import budget
import provenance
from config import (DEXSCREENER_BASE, HELIUS_ENV, RATE_PER_MIN_BY_HOST,
                    UNPACED_HOSTS)

UTC = timezone.utc
TIMEOUT = 20
USER_AGENT = "dawntrader-token-watch/1.0 (observation study; no trading)"


class Shed(Exception):
    """Raised when the budget refuses a call. NOT an error condition —
    it is the shed order working, and callers must record it as an observation
    that did not happen rather than swallowing it. A silent skip and a
    completed call must never look the same in the record.
    """


import threading
import time
import urllib.parse

# Shared by every caller in this process, because the LIMIT is the provider's,
# not the caller's. Module-level state is the right scope: both sweeps run in
# the same process (the follow-up service invokes the socials sweep).
_LAST_CALL: dict = {}
_PACE_LOCK = threading.Lock()

def _pace(url: str) -> None:
    """Space calls to a rate-limited host, at the ONE point they all pass.

    ⛔ THIS IS NOT A RETRY AND MUST NOT BECOME ONE. A retry would convert a
       refusal into a delay and delete the signal: the shed record is how the
       study knows a checkpoint was missed, and survival is reported as an
       UPPER BOUND precisely because those records exist. Pacing prevents the
       refusal; it never hides one that happens anyway.
    """
    host = urllib.parse.urlsplit(url).hostname or ""
    per_min = RATE_PER_MIN_BY_HOST.get(host)
    if per_min is None:
        # ⛔ REFUSE AN UNCLASSIFIED HOST RATHER THAN SILENTLY NOT PACING IT.
        #    Unlisted-by-omission and deliberately-exempt used to be the same
        #    code path, so a new host was unpaced and looked fine.
        if host not in UNPACED_HOSTS:
            raise RuntimeError(
                "unclassified host %r: add it to RATE_PER_MIN_BY_HOST with a "
                "rate, or to UNPACED_HOSTS with the reason it needs none" % host)
        return
    interval = 60.0 / per_min
    with _PACE_LOCK:
        last = _LAST_CALL.get(host)
        now = time.monotonic()
        if last is not None:
            wait = interval - (now - last)
            if wait > 0:
                time.sleep(wait)
                now = time.monotonic()
        _LAST_CALL[host] = now


def _request(req):
    """⛔⛔ THE ONE EGRESS. EVERY outbound call in this package goes through
    here, and the pacer is inside it.

    Langston, 2026-08-31 (BLOCKER-1): the pacer was added to `_get` -- the
    function that had been REPORTED -- and `pool_liquidity` built its own
    Request and called `urlopen` directly, so it never passed through either.
    Two egress sites, one paced. That is fix-follows-the-pointer INSIDE the
    fix for fix-follows-the-pointer: the correction travelled to the function
    named in the finding and not to the CLASS, which is every outbound call.

    ⚠️ IT WAS HARMLESS ON THE DAY AND THAT IS NOT THE POINT. `pool_liquidity`
    calls a host with no entry in RATE_PER_MIN_BY_HOST, so even routed through
    the pacer it would return unpaced. THE DEFECT IS THAT THE GUARD REACHED
    LESS FAR THAN IT APPEARED TO, and the appearance is what the next person
    acts on: the first person to add that host to the rate table will believe
    they have paced it. The documented DexScreener fallback -- chain-direct on
    the spare Helius allowance -- is precisely the change that arms it.
    """
    _pace(req.full_url)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    return _request(req)


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


def _sol_usd(pair: dict):
    """SOL/USD at the moment of THIS observation, from this pair.

    A pair quoted in SOL prices the token both in USD and in SOL, so the ratio
    is the SOL price -- no extra call, no global constant, and it is stamped
    with the same timestamp as everything else in the row.
    Returns None when the pair is not SOL-quoted, rather than guessing.
    """
    if ((pair.get("quoteToken") or {}).get("symbol") or "").upper() != "SOL":
        return None
    try:
        native = float(pair.get("priceNative"))
        usd = float(pair.get("priceUsd"))
    except (TypeError, ValueError):
        return None
    return (usd / native) if native > 0 else None


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
        # FIELDS THE PROVIDER ALREADY SENDS AND WE WERE DISCARDING (Kyle,
        #    2026-09-01). The raw response was persisted above, so these were
        #    never LOST -- but nothing parsed them, so the study could not read
        #    a token's NAME without re-parsing archived payloads. The comment
        #    four lines up predicted exactly this: "the choice of which eight
        #    is a decision made TODAY about what matters."
        "name": (p.get("baseToken") or {}).get("name"),
        "symbol": (p.get("baseToken") or {}).get("symbol"),
        "market_cap_usd": p.get("marketCap"),
        "fdv_usd": p.get("fdv"),
        "chart_url": p.get("url"),
        # THE POOL'S OWN ADDRESS. The corrected liquidity read needs the POOL,
        #    not the mint: liquidity is a property of the pot, and the mint is
        #    only the label on one side of it.
        "pair_address": p.get("pairAddress"),
        # THE SOL PRICE AT THIS OBSERVATION, NOT A GLOBAL MEDIAN (Langston).
        #    "value now vs at launch" is meant to isolate the TOKEN's move;
        #    applying one rate to both ends folds SOL's own move into the
        #    comparison. Today the daily range is ~1%, but this is a 90-day
        #    artifact and SOL will not stay in a 2% band for 90 days.
        #    Derived from this pair when it is quoted in SOL: a SOL-quoted
        #    pair's priceUsd / priceNative IS the SOL price at that moment.
        "sol_usd": _sol_usd(p),
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
# Wrapped SOL. Named because it appears in two unrelated places and a bare
# 44-character literal in each is how a typo becomes a silent zero.
WSOL_MINT = "So11111111111111111111111111111111111111112"

PUMPFUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"


def _rpc(method: str, params: list):
    """One Helius JSON-RPC call, through the paced chokepoint."""
    body = json.dumps({"jsonrpc": "2.0", "id": "token-watch",
                       "method": method, "params": params}).encode()
    req = urllib.request.Request(
        f"https://mainnet.helius-rpc.com/?api-key={helius_key()}",
        data=body, headers={"Content-Type": "application/json",
                            "User-Agent": USER_AGENT})
    return _request(req)


def pool_sol_reserves(pair_address: str) -> dict:
    """THE REAL MONEY IN THE POOL, in SOL. The number this study always meant.

    ⛔⛔ WHAT THIS REPLACES, AND WHY IT MATTERS. The previous function was named
       `pool_liquidity` and called `getTokenLargestAccounts` -- which returns
       who holds the most TOKENS. That is holder concentration, not liquidity.
       So the study reserved a credit budget for a liquidity measurement, spent
       it for two days, and never once measured liquidity. The death class
       `liquidity_pulled` has never been backed by a liquidity figure.

    TWO SHAPES, AND THE ACCOUNT ITSELF SAYS WHICH -- we do not trust a label:
      - A PUMP.FUN BONDING CURVE (97% of live observations). The curve account
        stores its own reserves. `real_sol_reserves` is the money that is
        actually there.
      - A GRADUATED POOL (the other 3%). The SOL sits in a wrapped-SOL token
        account owned by the pool.

    ⚠️ THE TRAP THAT VALIDATION CAUGHT, AND EITHER WOULD HAVE SHIPPED SILENTLY:
      - The pool address's PLAIN balance is the account's rent minimum, not the
        liquidity. Measured 0.0030 SOL against a true 6.1933.
      - The curve also reports VIRTUAL reserves -- a pricing device, not money.
        Measured 30.0676 SOL virtual against 0.0676 SOL real, a 445x
        overstatement that would have looked entirely plausible.

    ★ VALIDATED AGAINST GROUND TRUTH BEFORE IT WAS BUILT (2026-09-02):
      - graduated: provider said 6.1933 SOL, this returns 6.193328353.
      - bonding curve: the provider reports NO liquidity, so instead the decode
        SELF-CHECKS -- the price implied by the decoded reserves is
        0.00000002809 against the provider's own 0.00000002808, a ratio of
        1.0002. A decode that reproduces an independently-published price is
        not a plausible number; it is the right one.
    """
    if not budget.allowed("liquidity"):
        raise Shed("liquidity")
    if not pair_address:
        return {"sol": None, "source": "no_pool_address",
                "read_at": datetime.now(UTC).isoformat()}

    info = _rpc("getAccountInfo", [pair_address, {"encoding": "base64"}])
    budget.charge("liquidity", 1)
    val = ((info or {}).get("result") or {}).get("value") or {}
    provenance.record_follow_up(pair_address, "helius_pool_account", info)

    if val.get("owner") == PUMPFUN_PROGRAM:
        try:
            raw = base64.b64decode((val.get("data") or ["", ""])[0])
            # 8-byte discriminator, then five u64s. real_sol_reserves is the
            # fourth -- the one the trap above is about.
            _vtok, _vsol, _rtok, rsol, _supply = struct.unpack_from("<QQQQQ", raw, 8)
        except (ValueError, struct.error, IndexError, TypeError):
            return {"sol": None, "source": "curve_decode_failed",
                    "read_at": datetime.now(UTC).isoformat()}
        return {"sol": rsol / 1e9, "source": "bonding_curve_real_reserves",
                "read_at": datetime.now(UTC).isoformat()}

    # Graduated: the SOL is a wrapped-SOL token account the pool owns.
    if not budget.allowed("liquidity"):
        raise Shed("liquidity")
    accts = _rpc("getTokenAccountsByOwner",
                 [pair_address, {"mint": WSOL_MINT}, {"encoding": "jsonParsed"}])
    budget.charge("liquidity", 1)
    vals = ((accts or {}).get("result") or {}).get("value") or []
    for v in vals:
        amt = ((((v.get("account") or {}).get("data") or {})
                .get("parsed") or {}).get("info") or {}).get("tokenAmount") or {}
        ui = amt.get("uiAmount")
        if ui is not None:
            return {"sol": float(ui), "source": "graduated_pool_wsol_account",
                    "read_at": datetime.now(UTC).isoformat()}
    return {"sol": None, "source": "no_wsol_account_found",
            "read_at": datetime.now(UTC).isoformat()}


def holder_concentration(mint: str) -> dict:
    """Who holds the most of this token. NOT liquidity -- renamed 2026-09-02.

    ★ THE DATA IS GOOD AND IS KEPT: two holders with one of them holding
      essentially the entire supply is a strong signal in its own right. It was
      only ever mislabelled, and the label is what made a missing measurement
      invisible for two days.
    """
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
    data = _request(req)
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
