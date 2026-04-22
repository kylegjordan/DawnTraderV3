# Post-B62 / Pre-Launch Plan

**Owner:** Kyle Jordan (locked 2026-04-18, restructured 2026-04-19, **synced 2026-04-22 after B63 implementation close**)
**Status:** LOCKED — items below must complete before go-live
**Scope:** Everything between B62 close (~Apr 19) and live-mode activation
**ML work:** DEFERRED to post-launch. Items below are data/infrastructure PREP for ML; model work itself comes later.

**2026-04-19 restructure note:** After ~72h of B62 post-deploy data (174k MCE samples, 359 closed trades), analysis revealed that high-DBS pairs ARE reaching strategies but are LOSING MORE than neutral pairs. Existing "trend" strategies are actually reversal/pullback patterns being misapplied to trending pairs. Path D and TEC activation moved ahead of infrastructure items.

**2026-04-22 sync note:** B63 implementation closed 2026-04-21 with 19-item scope expansion. Items 1 and 3 below are now DONE (B63 absorbed global DBS fix as Item 16). Items 2, 4, 5, 6, 7 remain open. A large audit track (Items 15/17/18/19 inside B63) is running in parallel during 24-48h observation window. New items 8-11 added for B63-internal deliverables that span beyond the implementation close.

**Phase 15b folding:** The original B63 Sub-Phase C+D (DBS integration inventory + strategy re-audit) and B64/B65 (classifier deployment) are partly obsolete (B62 completed the classifier) and partly subsumed into the items below. Residual items preserved in §9.

---

## Priority order (synced 2026-04-22)

| # | Item | Effort | Batch | Status |
|---|---|---|---|---|
| 1 | **Strong Bull Trend strategy** (new strategy for high-DBS pairs, aka Path D) | shipped | **B63** | ✅ **DONE** — commits `b7d4e0f8`/`4c6f2a3e`/`3514859b`/`7a59771f` + B63.4 + post-audit Items 10-14. |
| 2 | **TEC as shared service** (wire advanced TEC to VTS + paper; per-strategy config) | ~1 day | **B64+ (deferred)** | ❌ NOT shipped in B63. Counterfactual audit reframed TEC as "amplifier for directionally-right entries, not rescue mechanism." Wiring still pending. |
| 3 | Global DBS architecture fix (persistent store + 20-pair min floor) | shipped | **B63 Item 16** | ✅ **DONE** — commit `a4f5dbe0`. Persistent store + atomic snapshot + fixed 20-pair floor + 5-row behavior spec. Cold-start T+3s, warm-up T+63s verified post-deploy. |
| 4 | Canonical Regime/Strategy map sync (main file + UI + IE metrics update + Strong Bull Trend entry) | < 1 day | **B64** | ⚠️ **PARTIAL** — strong_bull_trend registered in B63; MULTI_FAMILY_ELIGIBILITY added in B63 Item 11 for vwap_pullback. IE metrics description update + UI alignment still pending. |
| 5 | Asset class field + standardized signal/trade schema | 1 batch | B65 | ❌ NOT started. |
| 6 | Data archiving update (pair + trade, VTS/Paper/Live + Option B backfill) | 1-2 batches | B65/B66 | ❌ NOT started. |
| 7 | Regime drift tracking dashboard tab | 1 batch | B66 | ❌ NOT started — 6 open design questions from 2026-04-17 still pending Kyle's answers. |
| **NEW 8** | **B63 audit deliverables (Items 15/18/19)** — multi-lever adaptive framework + full SQE + classifier cadence/latency | ~1 week data-analysis | **B63 (open)** | ❌ Kicks off after 24-48h observation window closes (~2026-04-22 onward). |
| **NEW 9** | **B63 Item 13 decision gate** — vwap_pullback-in-lane KEEP/TUNE/BUILD_DEDICATED | 30 min at checkpoint | **B63 (open)** | ❌ Evaluated ≥ 1 week post-deploy = 2026-04-28. Pre-registered spec: `BATCH_63_ITEM13_DECISION_GATE_SPEC.md`. |
| **NEW 10** | **B64 authority baseline verification (Sections B + C)** — widen the Section A check | 2-4h | B64 | ⚠️ Section A verified 2026-04-22 (`B64-AUDIT-001` in CHANGES_AND_FIXES). B + C scheduled during B63 observation window. |
| **NEW 11** | **LQ threshold tune for strong_trend** (deferred from B63) | data-dependent | B66 | ❌ Tune after observation if Path D trade count is too low / too noisy. |
| **NEW 12** | **External Data Context Layer — Phase 1 (multi-TF + macro)** | 2-3 weeks | **B67** | ❌ Added 2026-04-22. Higher-timeframe OHLC (1h, 4h) + BTC dominance + crypto market cap momentum + perpetual funding rates. Free APIs only. Centralized context service consumed by existing strategies as optional confidence multipliers. Triggered by backtest findings that naive technical detectors (liquidity_trap inversion, VSB, simple bullish engulfing) converge to poor prospective signal/noise — adding NEW strategies is lower value than adding CONTEXT to existing strategies. Per `EXTERNAL_DATA_SOURCES_INVENTORY.md` Tier 1. |
| **NEW 13** | **External Data Context Layer — Phase 2 (derivatives + cross-asset)** | 2-3 weeks | **B68** | ❌ Added 2026-04-22. Exchange inflows/outflows (BTC/ETH) + liquidation cascades + DXY + SPX. Per `EXTERNAL_DATA_SOURCES_INVENTORY.md` Tier 2. Conditional on B67 showing measurable lift on existing-strategy WR. |

---

## Item 1: Strong Bull Trend Strategy (Path D) — B63

**Rationale (evidence from 2026-04-19 72h analysis):**
- 164 high-DBS trades (|DBS|≥0.30) over 72h → 25.6% win rate, $-3.01 total P/L
- 70.1% stop-out rate on high-DBS trades (vs 61.0% on neutral)
- Existing strategies mapped to TFS/IE are reversal/pullback patterns, NOT trend-riders:
  - morning_star = 3-candle reversal pattern (29% WR)
  - reverse_impulse = reversal of volatile move (22% WR)
  - vwap_pullback = pullback to VWAP (34% WR — classic mean-reversion within trend)
- Winning strategies (volatility_edge 64%, support_bounce 53%, range_trade 49%) all operate on LOW-DBS pairs at range extremes
- Gap: no strategy designed to enter WITH a strong trend and ride it

**Design principles:**
- **LONG-ONLY** (system doesn't support shorting) — hence "Strong BULL Trend"
- **Mapped regime:** TREND_FRIENDLY_STABLE (primary), IMPULSE_EXPANSION (secondary)
- **Entry gate:** |DBS| ≥ 0.30 AND DBS > 0 (bullish direction confirmed — not just magnitude)
- **Entry trigger:** continuation confirmation (e.g., price breaks prior swing high with volume > 1.3× avg) — NOT a reversal signal
- **Initial stop:** wider than mean-reversion strategies (proposed 3× ATR vs current ~1-2× ATR). Rationale: high-DBS pairs have larger intrabar counter-moves; a 1-ATR stop gets whipsawed.
- **Initial target:** modest (proposed 2× ATR) — main profit comes from TEC trailing, not hitting the initial TP
- **Hand-off to TEC:** once target is hit or break-even latched, TEC's MOONBAG mode takes over and trails the trend
- **No take-profit ceiling:** let the trailing stop decide when the trade ends

**Proposed strategy key:** `strong_bull_trend` (final name TBD — candidates: `strong_bull_trend`, `trend_rider`, `bull_continuation`)

**Signal type:** QUANT (indicator-based, not pattern-based). Potentially HYBRID if pattern confirmation at entry is wanted.

**Canonical regime-strategy map changes:**
- Add entry under TREND_FRIENDLY_STABLE with signalType QUANT
- Add entry under IMPULSE_EXPANSION with signalType QUANT (secondary — DBS ≥ 0.50 pairs go to IE)
- The strategy's detect function gates on DBS itself so it only fires for the right pairs

**Data capture:**
- Every Strong Bull Trend trade must be tagged so ML can distinguish its outcomes
- Entry-time DBS stored (already captured via pairDirectionalBiasScore)
- Track whether trade exited via initial TP, trailing stop (break-even), trailing stop (MOONBAG), or initial SL — see Item 2 for TEC standardized exit reasons

**Effort:** ~1 week. Scope: strategy detect function, entry/stop logic, canonical map entries, unit tests, VTS observation period.

**Folds in Phase 15b original items:** C.4 (TP/SL ratios in trending vs neutral markets), D.2/D.3 (opportunity flow to dormant strategies — now addressed by creating a new strategy instead).

---

## Item 2: TEC as Shared Service

**Current state:**
- **Simple trailing logic EXISTS in paper-execution-engine.ts (lines 905-924):** metadata-driven `trailingStopPercent` with `highWaterMark`, exits with `trailing_stop_hit` type. Naive — percentage-based trail from HWM.
- **Advanced TEC (trailing-exit-controller.ts) is BUILT BUT DORMANT:** full two-stage latching (break-even + target lock), K' dynamic distance based on DI/VolNoise, MOONBAG mode (TRAILING_TAKE), cost-aware net floors. Never wired to a consumer.
  - Likely dormant because active trading has been OFF since ≥2026-01-12. TEC was built as Phase 11.3A pre-launch infrastructure expecting to be wired up when active trading came back on.
- **VTS has NEITHER** — naive candle-based TP/SL checks in vts-service.ts:308-348.
- **Exit reason enum already exists in paper engine:** `target_hit | stop_hit | trailing_stop_hit | max_holding_period | guardrail | manual_stop`, with mapping to `TP | SL | TRAILING_STOP | MANUAL | KILL_SWITCH | ENGINE_STOP | UNKNOWN`. VTS lacks the `trailing_stop_hit` distinction.

**Scope:**

**2a. Wire advanced TEC as a SHARED SERVICE**
- Callable by both VTS `updateOpenTrades()` and paper-execution-engine's `evaluateExitConditions()`
- Per-trade state keyed by trade ID (not just symbol — future-proof for multiple positions same pair)
- Hot-swappable with existing paper simple trailing logic — paper opts in per trade

**2b. Per-strategy TEC config (NO hard-coded strategy checks in TEC)**
- TEC accepts `tecConfig` at `initializeTrailingState()`:
  - `K_base` (trailing distance base multiplier, default 1.0)
  - `alpha` (DI weight for K', default 0.5)
  - `beta` (VolNoise weight for K', default 0.8)
  - `breakEvenATR` (profit distance to latch break-even, default 1.0)
  - `targetLockMultiplier` (floor-above-target margin, default 1.0)
  - `useDBSEarlyExit` (C.7 subsumed — exit if DBS flips bearish while holding, default false)
- **Strategy config lives in the canonical regime-strategy map, NOT in TEC code**
- Each strategy declares its `tecConfig`. Strong Bull Trend declares `{ K_base: 2.0, alpha: 0.3, beta: 0.5, breakEvenATR: 2.0, useDBSEarlyExit: true }` for wider trailing. Existing strategies default to the existing K_base=1.0 behavior.
- Default config used if strategy doesn't declare one (backward compatible)

**2c. Standardize exit reason field across all modes**
- VTS's `resultType` enum extended: `take_profit | stop_loss | timeout | trailing_stop_breakeven | trailing_stop_moonbag`
- Paper engine's existing enum kept, with `trailing_stop_hit` split internally into the breakeven vs moonbag distinction
- Unified trade record's `closeReason` enum:
  - `SL` — original stop-loss hit (trade closed at a loss)
  - `TP` — original take-profit hit (target latch NOT yet engaged)
  - `TRAILING_BREAKEVEN` — trailing stop hit after break-even latched but before target latch (profit ≥ entry cost)
  - `TRAILING_MOONBAG` — trailing stop hit after target latch (profit ≥ original target)
  - `TIMEOUT`, `GUARDRAIL`, `MANUAL`, `KILL_SWITCH`, `ENGINE_STOP`

**2d. Archive fields for TEC decisions**
Every trade record (VTS, paper, live) captures:
- `tradeMode` at close: TARGET vs TRAILING_TAKE
- `breakEvenLatched`: boolean
- `targetLatched`: boolean
- `highWaterMark`: highest price achieved during hold
- `originalStopLoss`: entry-time stop (unchanged throughout trade)
- `finalStopPrice`: stop at moment of exit (may differ from originalStopLoss if trailing engaged)
- `stopMovedCount`: how many times TEC moved the stop
- `Kprime_at_exit`: K' value in use at exit
- `closeReason` (standardized enum from 2c)
- `dbsAtEntry`, `dbsAtExit` (for analysis of DBS trajectory during hold)

**2e. VTS observation integration**
- VTS trade records show all TEC fields
- ML page Open/Closed tables add key TEC columns (tradeMode, finalStopPrice) — may be collapsed by default
- TEC state persistence across PM2 restarts (already in TEC; wire into VTS startup/shutdown)

**Effort:** ~1 day for VTS integration (sequenced AFTER Item 1 so Strong Bull Trend's wider stop and TEC config are designed together).

**Folds in Phase 15b original item:** C.7 (TEC early-exit on DBS flip) — implemented as `useDBSEarlyExit` config flag.

---

## Item 3: Global DBS Architecture Fix

**Design** (CC + Langston consensus from 2026-04-17, modified by Kyle to use fixed minimum):

- **Persistent per-pair DBS store** — `Map<symbol, {score, timestamp, sentinelZero}>` separate from the MCE TTL cache. Updated whenever MCE computes a pair's context.
- **End-of-cycle snapshot** — after each complete VTS scan cycle, take atomic snapshot and publish as "current global DBS." All downstream consumers read snapshot, not live store.
- **Coverage gate = fixed floor of 20 pairs** (replaces "70% of peak"). Below 20, return NEUTRAL with log; keep last-good snapshot marked stale.
- **Staleness:** soft target 2 scan intervals (~120s); hard expiry 5 min; drop from snapshot after hard expiry.
- **Weighting:** transformed/capped volume weighting. `GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT` stays; default 1.0 (disabled); activate at 20-25% only if BTC consistently > 40% of weight.
- **External signals** (Fear & Greed, BTC dominance, altcoin momentum) used as monitoring overlays only — NOT blended into canonical formula.
- **Benchmarks included** (already deployed in B62).

**Effort:** 2-4 hours. Requires PM2 restart.

---

## Item 4: Canonical Regime/Strategy Map Sync

**Scope:**
- Verify `server/config/canonical-regime-strategy-map.ts` reflects current strategy assignments
- **Add Strong Bull Trend entry** (from Item 1) with its `tecConfig`
- Verify Analytics and Diagnostics → Overview tab renders correct mapping
- **Update IMPULSE_EXPANSION regime metrics description** to reflect B62's criteria (`|DBS| >= 0.50 && vol > 0.015`) — currently still shows old momentum/ADX thresholds
- **Add `tecConfig` field per strategy** (from Item 2b)
- Ensure daily bridge sync regenerates JSON/Markdown from updated source

**Effort:** < 1 day.

---

## Item 5: Asset Class + Standardized Schema

### 5a. `assetClass` enum (extensible)
- `CRYPTO_SPOT` (current default)
- `CRYPTO_PERPETUAL` (future — Kraken perp)
- `EQUITY_SPOT` (future — Kraken X-stocks)
- `EQUITY_OPTIONS` (future)
- `FX_SPOT` (tag EUR/USD, USD/CHF etc.)
- `COMMODITY_SPOT` (PAXG, XAUT — gold)
- `STABLECOIN` (USDG pairs etc.)

Applied to all trade and signal tables.

### 5b. Unified field set across ALL signal and trade tables

Tables in scope:
- VTS Open Simulated Trades, VTS Closed Simulated Trades
- Active Trading — Filter, RTB, Open, Closed
- Paper sim equivalents
- Live trade table (`trades`)

Required fields (displayed in UI = captured for archival = identical schema):
- Symbol, **assetClass**, B/S type
- Regime (pair), globalRegime
- Strategy, signalType, patternType, patternStrength
- Entry/exit price, stop, target, position size, quantity
- P/L gross, P/L net, fees, slippage
- Entry time, exit time, duration
- Final score, hybridScore, predictiveConfidence, regimeWeight
- pairFriction, globalFriction
- pairDirectionalBias (category + score), globalDirectionalBias (category + score)
- sourcePool, filterTier
- schemaVersion, classifierVersion, dataIntegrityTier
- **Item 2 additions:** tradeMode, breakEvenLatched, targetLatched, highWaterMark, originalStopLoss, finalStopPrice, stopMovedCount, Kprime_at_exit, closeReason (standardized), dbsAtEntry, dbsAtExit
- resultType/closeReason

**Principle:** whatever is captured must be displayable; whatever is displayed must be captured. No display-only derived values.

**Effort:** 1 batch.

---

## Item 6: Data Archiving Update

### 6a. Unified archiver — reads from VTS + paper + live
- Same rich record schema (established in Item 6)
- `tradeSource` field for filtering
- Archive job aggregates across all sources

### 6b. Pair-level scan data archiving
- Every pair evaluated by FX5 every cycle (survivors AND rejections)
- All filter metric values + verdict + OHLC snapshot reference
- Enables ML counterfactual training ("why did we NOT trade pair X")

### 6c. OHLC snapshot persistence
- Central OHLC store per pair per hour (deduped — 60-min candles don't change intra-hour)
- Referenced by scan records and trade records via (symbol, hour) key
- Indefinite retention (Olympic blood-sample principle)

### 6d. Data integrity tier backfill — Option B (Kyle approved 2026-04-18)
- TIER_0_SIMULATED (< 2026-01-20): excluded from ML
- TIER_2_REAL_PRICES (Jan 20 – Mar 5): real prices, stubbed scoring
- TIER_1_FULL_OLD_CLASSIFIER (Mar 6 – Apr 16 09:15): full integrity, pre-B62 labels
- TIER_1_FULL_B62 (Apr 16 onwards): full integrity, B62 labels
- **Retroactive re-label** of TIER_1_FULL_OLD_CLASSIFIER trades using B62 Design B classifier applied to captured vol/ADX/momentum/DBS; stores `regime_b62_recomputed` alongside original `regime`
- Gain: ~10-15k pre-B62 trades upgraded to B62-compatible training data

**Storage budget:**

| Store | /day gzipped | /year |
|---|---|---|
| Pair scan records | ~72 MB | ~26 GB |
| OHLC snapshots (deduped) | ~12 MB | ~4 GB |
| Trade records (unified) | ~0.6 MB | ~220 MB |
| MCE telemetry (existing) | ~25 MB | ~9 GB |
| **Total** | **~110 MB/day** | **~40 GB/year** |

Hetzner CPX22 (80 GB) runway: ~18 months before disk upgrade or cold-tier archive.

**Tiering:** hot (30d) uncompressed → warm (30-365d) aggressive gzip → cold (>1y) offload to Supabase storage.

**Effort:** 1-2 batches.

---

## Item 7: Regime Drift Tracking Dashboard

**Scope:** new permanent UI tab (mockup approved in principle 2026-04-17):
- 4 primary metric cards: RBS drift contamination, TFS+IE share, family-level flicker, global DBS
- Regime distribution (pie + table with Δ arrows)
- DBS category distribution (horizontal bar)
- Drift history time series (RBS drift % over time)
- Active warnings panel with action buttons
- Actions: diagnostic (safe one-click) + corrective (confirm + audit-logged)
- User-configurable alert thresholds

**Folds in Phase 15b original item:** C.8 (events feed DBS transitions) — surfaced in dashboard's drift history view.

**Open design questions (Kyle to answer before build):**
1. Default time window (suggested: 24h)
2. Notification channel (Telegram DM, email, both?)
3. Corrective action gating (one-click vs confirmation)
4. Auto-generate scope doc on drift-remediation button?
5. Additional metrics?
6. Visual style (match existing dashboards)

**Effort:** 1 batch.

---

## 9. Phase 15b residual items status

Items from the original Phase 15b Sub-Phase C/D/E plan, mapped to current disposition:

| Original Item | Status | Disposition |
|---|---|---|
| C.1 biasConfidenceModifier application | ✅ ADDRESSED | Dead code removed in B62. If DBS-modulated confidence is wanted future, rebuild fresh — don't resurrect dormant path. |
| C.2 Net_EV gate DBS-aware thresholds | ⏳ RESIDUAL | Defer to post-launch or fold into Item 1's strategy-specific gate if data supports. |
| C.3 Position sizing within risk limits | ✅ NO CHANGE NEEDED | VTS uses intentional fixed-sized trades (~$150/trade via $1000 nominal × regime risk). Kyle confirmed 2026-04-19: no real paper balance is meant to feed in; design preserves consistent trade sizing matched to expected Kraken capital. Regime-weighted multipliers work correctly on top of nominal base. |
| C.4 TP/SL ratios in trending vs neutral | ✅ SUBSUMED by Item 1 (Strong Bull Trend) |
| C.5 Entry filter opposing global DBS | ⏳ RESIDUAL | Defer to post-launch unless Item 1 data supports. |
| C.6 RTB rankingScore DBS alignment boost | ⏳ RESIDUAL | Defer to post-launch. |
| C.7 TEC early-exit on DBS flip | ✅ SUBSUMED by Item 2 (`useDBSEarlyExit` config flag) |
| C.8 Events feed DBS transitions | ✅ SUBSUMED by Item 7 (drift dashboard history) |
| D.1 range_trade false-range bleeding reduced? | ✅ ANSWERED in B62 72h data — RBS drift contamination 0.00% |
| D.2 Dormant strategies receive flow? | ⚠️ PARTIAL — DBS routes pairs correctly but some strategies receive flow they're not designed for. Addressed by Item 1. |
| D.3 Trade-selection economics improve? | ⚠️ MIXED — neutral pairs fine; high-DBS pairs bleed. Item 1 fixes this. |
| D.4/D.5 Full per-strategy/per-regime/per-DBS matrix | ⏳ RESIDUAL | Defer to post-launch. Non-blocking. |
| B64/B65 classifier + map implementation | ✅ COMPLETED in B62. Original scope obsolete. |
| E.5 VTS data migration under new classifier | ✅ ADDRESSED by Item 7d Option B backfill |

**Items still to track (not subsumed anywhere):** C.2, C.5, C.6, D.4/D.5 — all are "residual — defer to post-launch." Add to post-launch backlog. Non-blocking for go-live.

---

## Batch assignment (proposed)

- **B63 — Strong Bull Trend + TEC shared service** (Items 1 + 2). Largest single deliverable. End of B63, we have a new strategy AND working trailing exits in VTS.
- **B64 — Infrastructure cleanup** (Items 3, 4, 5). Global DBS fix + canonical map sync + position sizing. All small fixes bundled for one deploy.
- **B65 — Unified schema + asset class** (Item 6). DB migrations + UI updates.
- **B66 — Data archiving + drift dashboard** (Items 7 + 8). May split into two batches if B66 gets too large.

Phase 15b remains in effect through B66. Phase 16 begins after B66 closes (DB/Legacy Cleanup — pre-existing plan).

---

## Prerequisites before "launch"

Per Kyle's 2026-04-18 directive (confirmed 2026-04-19), ALL 7 items above must complete before live mode activates. ML model work does not start until post-launch; all data infrastructure must be in place BEFORE launch so the system captures correctly from day one.

Items 1 and 2 also improve VTS trade economics immediately, which matters for Phase 19 (Paper Mode Full Audit) and Phase 20 (Production Hardening).

---

*End of POST_B62_PRE_LAUNCH_PLAN.md — revised 2026-04-19*
