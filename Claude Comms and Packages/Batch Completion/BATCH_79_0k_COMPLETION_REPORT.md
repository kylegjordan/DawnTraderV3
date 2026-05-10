# BATCH 79.0k — Completion Report (Investigation: Kraken WS-equities weekend silence)

> **Status:** SHIPPED as combined Step 1+2 (investigation + decision matrix). Implementation deferred — requires Kyle directive on Path A commercial commitment.
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Resolves:** RUNNING_ISSUES #89 (transition to OPEN-DEFERRED-PENDING-KYLE-DIRECTIVE)
> **Scope:** `BATCH_79_0k_SCOPE.md` (Step 1+2 combined per Langston Q6 approval)

---

## 1. Decision matrix — empirical findings

Live REST probe run 2026-05-10 ~20:00 UTC (Saturday — exactly when WS-equities is silent for the 10 24/7 names).

| Path | Cost | Coverage | LOC est. | Verdict |
|------|------|----------|----------|---------|
| **A** — Kraken Pro account / feed-tier upgrade | $X/mo TBD | Unknown — depends on Kraken support confirming Pro unlocks weekend xstock data | ~10 LOC (creds + config) | **ESCALATE TO KYLE** — only Kraken-native option remaining |
| **B** — REST polling fallback (mirror B74 equity-perp pattern) | $0 | **ZERO — no public REST endpoint exists for xStocks** (verified) | N/A — no endpoint to call | **DEAD PATH** confirmed via empirical probe |
| **C** — Direct Kraken support query | $0 | Informational only | 0 | PROCEED — confirm intent of weekend silence + whether Pro tier unlocks weekend data |

### Path B empirical confirmation that closes the path

Probes run 2026-05-10:
- `https://api.kraken.com/0/public/AssetPairs` returned 1,534 pairs total. **ZERO** matches for AAPL, TSLA, SPY, NVDA, GLD, GOOGL, HOOD, MSTR, CRCL, QQQ in any pair name, altname, or wsname field.
- `https://api.kraken.com/0/public/OHLC?pair=AAPLxUSD&interval=1` → `error: ['EGeneral:Invalid arguments']`
- `https://api.kraken.com/0/public/OHLC?pair=TSLAxUSD&interval=1` → same
- `https://api.kraken.com/0/public/Ticker?pair=AAPLxUSD` → `error: ['EQuery:Unknown asset pair']`
- `https://api-equities.kraken.com/0/public/AssetPairs` → HTTP 000 (host doesn't resolve / no parallel REST host exists)
- `https://api.kraken.com/0/public/equities/OHLC` → `error: ['EGeneral:Unknown method']`
- `https://api.kraken.com/0/public/Equities/OHLC` → HTTP 404
- `https://docs.kraken.com/api/` (the official Kraken API hub) lists: Spot REST, Spot WS, Futures REST, Futures WS, FIX, Custody REST, OTC REST, Prime REST/FIX/WS, Embed/Ramp/OAuth REST. **No "Equities REST" entry.** xStocks-specific REST API is not part of the public Kraken API surface.

**Conclusion:** xStocks exist exclusively on the `wss://ws-equities.kraken.com` WebSocket infrastructure. There is no public REST cousin. The B74 equity-perp REST-polling pattern is not portable to xstock_spot because the REST endpoint to mirror doesn't exist.

### Path A path — the only Kraken-native remaining option

Path A (Kraken Pro feed-tier upgrade) becomes the only Kraken-native path forward. **It requires Kyle directive** because:
- Material recurring cost ($X/mo unknown until Kraken-support response)
- Per Langston Q3: "directive call to Kyle. Material recurring cost = his decision."
- Even with Pro tier, it's unconfirmed whether Pro unlocks weekend xstock data — that depends on Kraken support's answer to Path C

### Path C path — informational, low-cost, run regardless

Path C (Kraken support direct query) is the bridge. Two questions to ask Kraken support:
1. **Is the WS-equities silent-on-weekends behavior intentional for the 10 24/7-marked xstock names?** (Empirically: 60s subscription returns heartbeats only — zero ticker/OHLC. We expected 24/7 names to flow through weekends.)
2. **Does Kraken Pro feed-tier (or any paid tier) unlock weekend WS data for the 24/7 xstock names?** If yes, the cost-benefit of Path A is calculable. If no, Path A is also dead.

### Non-Kraken alternatives surfaced by this finding (not part of original B79.0k scope)

The original investigation scoped Kraken-internal paths only. With Kraken-internal paths exhausted (B dead, A pending Kraken-support response), worth flagging:

- **Yahoo Finance / Alpha Vantage / IEX Cloud / Polygon.io** — third-party equity data providers. Most have their own weekend behavior issues (US equities markets are closed on weekends regardless of provider, EXCEPT for some 24/7 fractional-share platforms like Robinhood or 24-Exchange). Provider-by-provider research needed.
- **Hosted-broker APIs that mirror Kraken xStocks** — none known.
- **Accept the gap as inherent** — the underlying Kraken xStock token IS the same asset as AAPL stock; if Kraken's WS doesn't broadcast on weekends, no other provider necessarily will either, because the underlying market (NASDAQ/NYSE Arca) is closed regardless. The only weekend-flowing data would be Kraken's own internal book activity, which is what the WS feed is supposed to surface.

---

## 2. Recommended escalation

**Kyle directive needed** on:
1. Approve sending Path C ticket to Kraken support (no cost; just an action item to send)
2. Conditional on Path C response: approve Path A (Kraken Pro tier subscription) if it unlocks weekend xstock data — material recurring cost
3. If both Path A and Path B are dead, accept the gap and update RUNNING_ISSUES #89 to "RESOLVED-AS-INHERENT-LIMITATION" with a clear note in the xStocks tab Per-Pair Fresh-Tick Latency panel UI explaining that 24/7-marked xstock names show as Stale/Dead during weekends due to upstream feed behavior

---

## 3. What this batch DID accomplish

- ✅ Empirically confirmed Path B is dead (no public REST endpoint for xstocks)
- ✅ Cleared the architectural confusion that B79.0k might be a code-implementation batch — it's purely an investigation with directive-call output
- ✅ Surfaced the Kyle-decision needed on Path A commercial commitment
- ✅ Documented the empirical evidence for future reference (so we don't re-investigate the same dead REST endpoints if the question resurfaces)

---

## 4. What this batch did NOT do

- ❌ NO code changes (per Langston Q6 — combined Step 1+2 deliverable is decision matrix only)
- ❌ NO Path C ticket sent yet (waiting on Kyle approval to engage Kraken support)
- ❌ NO Path A subscription decision (waiting on Kyle directive)

---

## 5. Pending follow-ups (sequenced by Kyle directive)

If Kyle approves Path C (free):
- **B79.0k.1** — Send Kraken support ticket with the 2 questions in §1. Wait for response. Update scope based on response.

If Path C reveals Pro tier unlocks weekend data + Kyle approves Path A:
- **B79.0k.2** — Configure Kraken Pro credentials in staging, verify weekend feed flows, update equity-spot-archiver to use new feed-tier, update governance docs.

If both A and B confirmed dead:
- **B79.0k.3** — Update xStocks tab UI with explanatory tooltip; update RUNNING_ISSUES #89 to RESOLVED-INHERENT.

---

## 6. Crypto regression posture

**NONE by-construction.** This batch made zero code changes; it's an investigation deliverable.

---

## 7. Governance updates

- BATCH_CATALOG.md row for B79.0k (this commit)
- PHASE_HISTORY.md sub-batch row (this commit)
- RUNNING_ISSUES.md #89 updated from "OPEN — B79.x follow-up" to "OPEN — DEFERRED PENDING KYLE DIRECTIVE on Path A commercial commitment + Path C support-ticket approval"
- BATCH_79_0c_COMPLETION_REPORT.md post-closure addenda (this commit)
- BATCH_79_0k_COMPLETION_REPORT.md — this file
- MEMORY.md (CC + Langston) — drop next-step pointer
