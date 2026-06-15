# B-NAMES — Step-2 Pre-Audit (read-only findings + design revisions)

**Batch:** B-NAMES (crypto) · **Date:** 2026-06-15 · **Author:** Claude New (CC-B) · **Step:** 2
**Status:** _pending Langston Step-2 sign-off ("clear these at pre-audit and I'm green to implement")._
**Implements:** #298 crypto half. xStock = B-NAMES.1 (scheduled immediately after).

---

## Findings (code-verified, file:line)

**F1 — Crypto name is NOT on the price path.** The price call is CoinGecko `/simple/price` (`server/services/market-data.ts:131`) — returns price only, no `name`. Today's crypto name comes from a SECOND static map `SYMBOL_TO_COIN_NAME` (`market-data.ts:40-62`). The discovery service already proves CoinGecko **`/coins/markets`** returns `name` (`xstock-universe-discoverer.ts:120`, `CoinGeckoCoin.name :61`). → the resolver should use `/coins/markets?ids=…` (name + market-cap in one call) or `/coins/list` (symbol→id).

**F2 — ★ REVISION to Langston's tier-1 disambiguation (Step-1 C3/Q4).** The symbol→CoinGecko-id map is a **static 21-entry** `SYMBOL_TO_COINGECKO_ID` (`market-data.ts:16-38`) — NOT the full traded universe, NOT a DB table. Crypto is priced primarily by **Kraken** (by symbol), so **there is NO pre-pinned CoinGecko-id for most traded crypto symbols.** Langston's "reuse the already-pinned trade id = zero ambiguity" therefore only covers ~21 coins. **For the broad universe the resolver must do `/coins/list` symbol→id resolution WITH disambiguation (his tier-2: highest market-cap above a clear-leader gap; skip→hide if ambiguous).** This is the primary path, not the exception — slightly larger than "nearly free." **(Q for Langston — confirm.)**

**F3 — Rate-limit lane.** There is **no shared CoinGecko throttle** — the only one is an inline single-retry 3s 429-backoff in the macro feed (`external-macro-feed.ts:309-359`, with the B69.3 tier-aware `x-cg-demo/pro-api-key` auth at `:245-282`). The Kraken `restRateLimiter` is Kraken-only. → B-NAMES adds a small throttle and **batches `/coins/markets?ids=a,b,c…`** (one call resolves many names) + reuses the B69.3 backoff. No per-symbol hammering.

**F4 — xStock name source = FINNHUB (for B-NAMES.1).** The ticker-echo bug (Langston C5) is exactly `xstock-universe-discoverer.ts:603`: `name: override?.name_override ?? finnhubMeta.name ?? symbol.split('/')[0]` — when Finnhub returns no name (missing key, or an **ETF like PALL** with a null profile), it falls back to the **bare ticker** and persists it (`upsertUniverseRow :447`, dup file-cache fallback `:638`). Fix = `?? null` (store null, let the resolver backfill). Ripples into the non-null `XstockSpotEntry.name` type + `universe-service.ts:101` load. **B-NAMES.1** = this `?? null` fix + a curated static map for the bounded xStock set (esp. ETFs Finnhub misses), per Langston Q2.

**F5 — Persistence is net-new (C4).** NO `asset_names` table exists in `shared/schema.ts`. Crypto has **NO server-side name overlay** — names come ONLY from the client static `CRYPTO_NAMES` map (`shared/asset-names.ts:53-208`, ~140 entries). The xStock overlay pattern exists: `/api/xstocks/asset-names` (`routes.ts:8150`) → client `setXstockNameOverlay` (`asset-names.ts:41`). → B-NAMES adds: a new `asset_names` table `(symbol, asset_class, name, source, confidence, resolved_at)` + a crypto-parallel (or generalized) name endpoint + a crypto overlay setter mirroring the xStock plumbing.

**F6 — Sweep target is split.** `getOpenVirtualTradesForML()` (`vts-runner.ts:4315`) exposes `symbol` + `assetClass`, but VTS today is **crypto_spot only** (comment `:4317-4320`). xStock surfaces via a different path. → the resolver sweeps the union of (a) VTS open/closed crypto symbols and (b) the `xstock_spot_universe` table (B-NAMES.1).

**F7 — xStock universe is bounded** (CoinGecko `xstocks-ecosystem` ∪ S&P-500 backstop, filtered by Kraken acceptance; bootstrap floor 20) → dozens-to-low-hundreds, NOT open-ended → supports Langston's "curated static map + provider metadata, not a flaky general stock API" call for B-NAMES.1. Row-count confirm SQL: `SELECT count(*) FILTER (WHERE is_delisted=false), count(*) FILTER (WHERE name=split_part(symbol,'/',1)) FROM xstock_spot_universe;`

---

## B-NAMES (crypto) — design (revised)

1. **New `asset_names` table** (`shared/schema.ts` + migration): `symbol, asset_class, name, source, confidence, resolved_at`, plus a **negative-cache** row type (Langston C1: a resolved-miss with TTL/backoff so unresolvable symbols aren't re-hit every sweep). Re-resolve/override path = a manual clear.
2. **Server-side `asset-name-resolver` service** (background sweep, NOT request hot path): for each unnamed crypto symbol → check `asset_names` (incl. negative-cache) → `/coins/list` symbol→id (cached) → **disambiguate** (mcap-rank + gap; ambiguous → skip→hide, count it) → name from `/coins/markets` → write-through `asset_names` (positive) or negative-cache (miss). Reuse B69.3 backoff + a small throttle; batch the markets call.
3. **Crypto name overlay endpoint + client setter** (mirror xStock); client keeps reading local map first, overlay second (no client-side external calls).
4. **Observable counters** (Langston C3): resolved / ambiguous-skip / hard-miss distinct.
5. Fail-graceful: any failure → hidden line (already shipped). Never blocks render.

**Q for Langston (Step-2):** confirm F2 (the resolver leans on `/coins/list`+mcap-disambiguation as the PRIMARY crypto path since only 21 symbols have a pinned id) — accept the slightly larger crypto scope? Everything else maps cleanly to your Step-1 conditions.

---

## Langston Step-2 outcome (2026-06-15) — PROCEED-to-implement (refinements accepted, consensus)

Full review: `Claude Comms and Packages/Langston Design Asks/B_NAMES_STEP2_LANGSTON_REVIEW.md`. F2 confirmed (accept the larger scope), **with a tier-0 refinement + 2 build conditions for Step-3:**

- **TIER-0 (the 21 pinned coins) — keep, don't discard:** if the symbol is in `SYMBOL_TO_COINGECKO_ID` (`market-data.ts:16-38`), use that id DIRECTLY → zero ambiguity, zero `/coins/list` lookup (our most-traded coins; pin-first keeps disambiguation risk off the symbols that matter most). A ~3-line guard BEFORE the `/coins/list` call. Then **TIER-1** = `/coins/list` symbol→id → mcap-gap disambiguation → `/coins/markets` (the broad universe; where the volume lives).
- **CONDITION 1 — disambiguation gap = a NAMED, documented config constant, not a magic number.** CoinGecko ticker collisions are severe (scam/clone tokens routinely outrank by listing, not real mcap). Define: leader mcap ≥ N× runner-up **AND** leader above an absolute mcap floor — as a constant with a comment naming the failure it guards. Ambiguous OR no-clear-leader OR leader-below-floor → **skip→hide, counted**. (Rather hide than render the wrong project's name — a wrong name reads as a data-integrity bug.)
- **CONDITION 2 — the skip counter is TWO-WAY:** distinguish **collision-ambiguous** (multiple coins, no clear leader → tune the gap) from **hard-miss** (symbol not on `/coins/list` at all → needs a curated entry). Don't collapse into one number.

All other Step-1 conditions confirmed mapped (asset_names + negative-cache + manual-clear; batch `/coins/markets` + B69.3 backoff + dedicated throttle; background sweep off hot path; fail-graceful → hidden line; observable counters). **B-NAMES.1:** `?? null` at `discoverer.ts:603` + curated static map for the bounded ETF set confirmed; blast radius = `XstockSpotEntry.name` non-null→nullable + `universe-service.ts:101` load (trace at Step-4). **Langston: "Green to implement. I'll take the diff at Step-4 — want eyes on the disambiguation constant and the two-way counter split specifically."**

**NEXT (Step-3 implementation, next session):** `asset_names` migration + table → resolver service (tier-0 pinned-id → tier-1 `/coins/list`+mcap-gap → `/coins/markets` name → write-through / negative-cache) → named disambiguation constant + two-way counter → crypto name endpoint + client overlay → background sweep → tests/bench/CI/deploy/UI-verify → Langston Step-4 (eyes on the constant + counter). Then B-NAMES.1 (xStock). Then #298 CLOSE. Then resume P19-B4b D5.
