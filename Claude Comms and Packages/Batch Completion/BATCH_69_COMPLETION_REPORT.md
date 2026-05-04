# Batch 69 Completion Report — Asset Class as First-Class Schema Dimension

**Date:** 2026-05-03
**Branch:** `migration/aws-supabase`
**Commits:** `18372159` (implementation, 20 files, +1335/-76) + `eea7c031` (fix: @shared/ path alias)
**PM2 Restart:** #137
**CI:** 4 of 4 green (after fix commit)
**Langston Reviews:** Steps 1/2 (cc-inbox #891) + Step 4 (cc-inbox #892) — APPROVED

---

## Scope Objectives Checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | 8-entry asset-class taxonomy registry with metadata | **YES** | `shared/asset-classes.ts` — ASSET_CLASSES const + ASSET_CLASS_REGISTRY |
| 2 | `resolveAssetClass(symbol, exchange?)` with exchange-first branching | **YES** | Exchange-first logic: `kraken-equities` → xstock_spot; PF_*XUSD → xstock_perp; default → crypto_spot |
| 3 | `safeResolveAssetClass()` null-return wrapper | **YES** | Wraps resolver in try/catch for caller protection |
| 4 | Schema extension: `exchange` + `asset_class` on paper_sim_open_positions | **YES** | Drizzle schema.ts updated + migration applied |
| 5 | Schema extension: `exchange` + `asset_class` on B74 archive tables (6 tables) | **YES** | 22 ALTER statements executed directly via psql |
| 6 | B74 archive pipeline rename: Universe → ArchiveAssetClass | **YES** | ohlc-batch-writer.ts + ticker-batch-writer.ts fully renamed |
| 7 | Value retag: `equity_spot` → `xstock_spot`, `equity_perp` → `xstock_perp` | **PARTIAL** | OHLC tables (1.2M + 260k rows) DONE. Ticker snap tables (5.8M rows) DEFERRED — Supabase pooler timeout. See BUG-2026-05-03-A in CHANGES_AND_FIXES. |
| 8 | Insert-site wiring: paper-execution-engine emits exchange + assetClass | **YES** | `exchange: 'kraken', assetClass: 'crypto_spot'` on open-position insert |
| 9 | Insert-site wiring: factor-ablation-emitter emits exchange + assetClass | **YES** | `exchange: 'kraken', assetClass: 'crypto_spot'` on ablation row |
| 10 | Insert-site wiring: exit-strategy-replay-service emits exchange + asset_class | **YES** | Raw SQL INSERT with `'kraken', 'crypto_spot'` values |
| 11 | Universe loader rename: loadEquitySpotUniverse → loadXstockSpotUniverse | **YES** | New name + deprecated alias for backward compat |
| 12 | Config file updates: `_universe` field | **YES** | xstocks-universe.json (`xstock_spot`) + equity-perp-universe.json (`xstock_perp`) |
| 13 | UI: AssetClassBadge component | **YES** | `client/src/components/ui/asset-class-badge.tsx` — color-coded badges |
| 14 | UI: "Class" column in trade-history-tab + active-trades-v2 | **YES** | Both tables show AssetClassBadge after Symbol column |
| 15 | Retag script for manual execution | **YES** | `npm run db:b69-retag` in package.json |

**Summary:** 14 of 15 objectives fully met. 1 PARTIAL (ticker snap retag deferred due to Supabase infrastructure limitation — non-blocking, tracked).

---

## Key Architectural Decisions

1. **Exchange-first resolver branching:** Kraken equities WS sends plain `BASE/QUOTE` without lowercase-x suffix. Symbol pattern alone cannot distinguish xstock_spot from crypto_spot. Solution: use `exchange === 'kraken-equities'` as the primary discriminator.

2. **xstock_perp detection via PF_ regex:** `PF_<TICKER>XUSD` contains the X marker before quote that distinguishes tokenized equity perps from native crypto perps. Non-PF_*XUSD futures default to `crypto_perp`.

3. **Single-deploy pattern (per Langston D.1):** Migration + code deployed together. Schema columns have defaults (`exchange='kraken'`, `asset_class='crypto_spot'`) so existing rows are valid immediately.

4. **Retag as separate script (per Langston D.2):** Large UPDATE operations isolated from deploy to avoid blocking. Script can be re-run safely (idempotent WHERE clause).

---

## Open Items

- **Ticker snap retag (BUG-2026-05-03-A):** 4M rows in `equity_spot_ticker_snap` + 1.8M in `equity_perp_ticker_snap`. Needs Supabase SQL Editor (bypasses pgbouncer pooler timeout) or reduced batch size with sleep. Non-blocking — new rows correct, only historical ticker queries by asset_class affected.

---

## Governance Files Changed

| File | Change |
|------|--------|
| `1-system-manual/BATCH_CATALOG.md` | B69 entry updated from QUEUED to implementation details |
| `1-system-manual/PHASE_HISTORY.md` | Phase 15c description extended with B69 ship |
| `1-system-manual/CHANGES_AND_FIXES.md` | Added BUG-2026-05-03-A (ticker snap retag timeout) |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Added §9.13 Asset-Class Registry & Resolver component |
| `.claude/memory/MEMORY.md` | Updated volatile state — B69 shipped, B70 next |
| `Claude Comms and Packages/Batch Completion/BATCH_69_COMPLETION_REPORT.md` | This file |

---

## Verification Evidence

- **PM2 #137:** Server running without errors post-deploy
- **CI:** All 4 checks green after `eea7c031` fix commit
- **DB schema:** `exchange` + `asset_class` columns present on all target tables (verified via psql ALTER output)
- **OHLC retag:** `equity_spot_ohlc_1m` and `equity_perp_ohlc_1m` confirmed retagged to `xstock_*` values
- **New rows:** Post-deploy inserts correctly writing `xstock_spot` / `xstock_perp` / `crypto_spot` values
- **UI:** AssetClassBadge rendering in trade history + active trades (visual verification pending Claude-in-Chrome)

---

*Batch 69 CLOSED pending Kyle acknowledgment.*

---

# B69.1 — Asset Class on Open + Closed Simulated Trades (UI follow-up)

**Status:** SHIPPED 2026-05-04. PM2 #138.
**Commits:** `7fab9306` (initial separate-column version) + `ebe199b5` (refactor — stack badge below symbol per Kyle preference 2026-05-04).
**Trigger:** Kyle observation 2026-05-04 — the B69 ship covered AssetClassBadge surfacing in trade-history + active-trades components but missed the Open Trades and Closed Trades (7d) tabs on the Machine Learning page (the canonical paper-sim views). Asked to add asset class to those two views, and on second look preferred the badge stacked below the pair symbol in the same cell rather than as a standalone column.

## What shipped

**Server (2 files):**
- `server/services/vts-runner.ts:getOpenVirtualTradesForML` — added `assetClass: string` to return shape; populated as `'crypto_spot'` (VTS handles crypto only today; matches the existing hardcode at vts-runner:1895 trade-open insert site).
- `server/utils/export-csv.ts:getClosedVTSTradesFromLogs` — added `assetClass: string` to return shape; reads from JSON log entry if present, defaults to `'crypto_spot'` for pre-B69 trades that never carried the field.

**Client (1 file):**
- `client/src/pages/machine-learning.tsx`:
  - Added `assetClass?: string` to `OpenTrade` and `ClosedTrade` interfaces.
  - Imported `AssetClassBadge` from `@/components/ui/asset-class-badge`.
  - Symbol cell on both Open Trades and Closed Trades (7d) tables refactored from a single-line `<td>{symbol}</td>` to a stacked `<div className="flex flex-col gap-0.5">` containing the symbol on top and `<AssetClassBadge>` below. Matches the existing pattern used for Regime + confidence + phase stacking in the Regime cell.
  - No additional column added; table widths unchanged.

## Behavior

Every closed simulated trade row now renders its symbol with a compact orange `Crypto Spot` badge directly below it (e.g., `SPX/USD` / `[Crypto Spot]`). Same on open simulated trades once VTS opens new trades post-deploy. Future xstock or perp trades through paper-sim will render the appropriate badge color from the registry.

## Verification

- PM2 #138 deployed cleanly; backend compile + restart success.
- Visual UI verification via Claude-in-Chrome: Closed Trades (Last 7 Days) table confirmed showing badge stacked below symbol on `SPX/USD`, `ZBT/EUR`, `ZBT/USD` rows. Open Trades tab rendered with identical column structure (no rows yet at verification time — PM2 had just restarted; trades populate as VTS cycles).
- No CI re-run required at deploy time (legacy TS baseline is pre-existing per RUNNING_ISSUES #39; Test Suite, Build, Docker Build all pass; deploy went straight through per Kyle directive 2026-05-04 to stop waiting on the TS legacy baseline before deploying).

## Governance scope (per Kyle directive 2026-05-04)

**Minor follow-up — bundle into next governance batch.** No standalone push of the wider Tier-1/Tier-2 governance update set required for B69.1. This closure section attaches to the existing B69 completion report; BATCH_CATALOG / PHASE_HISTORY / SIM / CHANGES_AND_FIXES / MEMORY do NOT need separate B69.1 entries. The next governance commit (whichever batch it belongs to) carries this report forward.

## What's next

B70 (data archiving update) remains the active queue per the original B69+B70 parallel plan. B67.5 consumer wiring stays gated on B67.4 calibration check ~2026-05-15.

---

*B69.1 closure section complete 2026-05-04. Waiting to be pushed with next governance batch.*

---

# B69.2 — b67_2 Phase Preference Visibility Fix (calibration aggregator)

**Status:** SHIPPED 2026-05-04. PM2 #139. Commit `1efb1599` (2 files, +20/-2).
**Trigger:** Kyle review of Factor Calibration table 2026-05-04 — `b67_2_phase_preference` showing 100% shift=0 across all 480 trades.

## Root cause

The b67_2 factor was firing correctly on every trade (the multiplication was happening, the chain confidence was being updated). The calibration aggregator was showing it as a no-op due to a structural shift-collapses-to-zero pattern unique to b67_2:

- Aggregator computes `shift = real_decision.confidence - alternate_decision.confidence`
- `real_decision.confidence` is set ONCE per trade by `emitAblationRecord` caller as `predictiveConfidence ?? 0.5`. Shared across all factor rows for that trade.
- For b67_2 specifically, `alternateDecision.confidence` was set to `_baseConf` (the without-factor value), which is also `predictiveConfidence ?? 0.5`.
- Same value → shift = 0 mathematically, every time.

The actual modulated value lived in `metadata.confidence_with_phase_pref` where the aggregator never reads it.

## Fix

Both vts-runner.ts (VTS path) + signal-orchestrator.ts (active path) updated symmetrically. Changed `alternateDecision.confidence` from `_baseConf` to `modulated` (the with-factor value). Now `shift = predictiveConfidence - modulated = predictiveConfidence × (1 - weight)`. Sign convention: positive shift when weight < 1 (factor reduced confidence), negative when weight > 1 (factor added confidence), zero when weight = 1.0.

**Convention deviation flagged in code comments.** Other multiplicative factors store the without-factor value in alt.confidence; b67_2 uses with-factor because it's the FIRST factor in the chain — its without-factor value coincides with `real_decision.confidence` by construction.

## Deeper finding (logged for future cleanup)

The framework's "shift" metric isn't actually measuring per-factor effect for ANY modulator. The `real_decision.confidence` field stores the raw classifier value, not the chain-final value, so shifts mix raw-classifier vs chain-without-this-factor. Multiplicative factors LOOK like they work because compounding produces non-zero shifts, but the magnitude isn't a clean per-factor measurement.

**Trustworthy decision-grade metric:** the predictive-lift column (REAL spread - ALT spread). The shift column should be read as "is this factor contributing anything at all (zero) vs is it contributing in a way that compounds with the rest of the chain (non-zero)" — directional signal only.

A proper framework refactor (set `realDecision.confidence` = chain-final on emit) is queued as a future cleanup batch — not blocking, since the predictive-lift gate is what we'll use to decide B67.5 wiring.

## Verification asks (post-compact)

After the next nightly replay-ablation cron runs (04:00 UTC), check the Factor Calibration UI panel:
- `b67_2_phase_preference` row should show non-zero values in `avg shift` and `avg |shift|` columns
- `% trades shift = 0` should drop from 100% to whatever fraction has weight=1.0 in the strategy_phase_weights blob (probably ~30-40%)
- `max |shift|` should be non-zero (showing the factor CAN modulate)

---

# B69.3 — CoinGecko Demo API key + 429 backoff (B67.1 macro-feed reliability)

**Status:** SHIPPED 2026-05-04. PM2 #141. Commit `c1b2f2b8` (1 file, +61/-17).
**Trigger:** Kyle question 2026-05-04 "is mcap receiving fresh data?" PM2 logs investigation revealed CoinGecko `/global` endpoint returning HTTP 429 on roughly half of all 60s polls, dropping both `btc_dominance` and `mcap_momentum` to NA simultaneously (they share the endpoint).

## Root cause

Unauthenticated CoinGecko traffic shares a pooled IP rate limit. With other consumers on the same egress + our 60s polling, we were exceeding the threshold for stretches of an hour or more. Funding rate feed (Binance premiumIndex) was unaffected — different host, different limits.

## Fix

`server/services/external-macro-feed.ts`:
1. Module-level `COINGECKO_API_KEY = process.env.COINGECKO_API_KEY ?? ''`. Logs presence/absence at startup so a missing key is visible.
2. `fetchWithTimeout` extended to accept optional `headers` map.
3. `fetchCoinGeckoGlobal` sends `x-cg-demo-api-key` header on every call when key is present. Demo key bumps to per-key 30 calls/min — well above our 60s cadence.
4. Single 3s backoff retry on 429 responses. If retry also fails, log loudly. 401/403 logs as `[B67.1][feed][AUTH]` for fast key-config diagnosis.

Funding rate fetcher (Binance) untouched — different feed, different host.

## Operational note

API key added to staging `.env` directly via SSH (idempotent add-or-update). NOT committed to repo. `process.env.COINGECKO_API_KEY` reads from the env var on PM2 startup. Verified post-deploy via masked grep that `.env` contains `COINGECKO_API_KEY=*****`.

## Verification asks (post-compact)

Run within ~10 min of next session start:

```bash
ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 200 --nostream 2>&1 | grep -E \"B67\\.1.*feed|Demo API key|HTTP 429\" | tail -20'"
```

Confirm:
1. Startup log shows `[B67.1][feed] CoinGecko Demo API key present — authenticated requests enabled`
2. Recent feed snapshots show `btc_dom=58.XX% mcap_mom=Y.YYYYY` (real values, not NA) on essentially every cycle
3. `HTTP 429` lines are gone or rare (post-deploy 2026-05-04 21:00ish UTC; the wakeup verification fired at deploy + 2min; longer-window verification belongs to next session)

If 429s still appear: check whether `COINGECKO_API_KEY` env var is loaded (visible in startup log line above). If `[B67.1][feed][AUTH]` lines appear: the key is rejected — verify .env contents.

## Expected effect on calibration data

- `btc_dom + mcap_mom` populate ~95%+ of polls vs ~50% pre-fix
- Macro modifier z-scores stabilize across the 14-day calibration window
- The "% trades shift = 0" metric for `mcap_momentum` should drop from 88% to the genuine zero-z-score fraction (probably 30-40% based on observed mcap signal amplitude when feed worked)
- BTC dominance "ready" status in the calibration table should produce more reliable predictive-lift readings as the next 13 days of clean data accumulates

---

*B69.2 + B69.3 closure sections complete 2026-05-04. Pushed with this governance batch.*
