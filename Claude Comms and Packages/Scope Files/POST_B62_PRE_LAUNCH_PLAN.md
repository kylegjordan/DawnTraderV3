# Post-B62 / Pre-Launch Plan

**Owner:** Kyle Jordan (approved 2026-04-18)
**Status:** LOCKED — items below must complete before go-live
**Scope:** Everything between B62 close (~Apr 19) and live-mode activation
**ML work:** DEFERRED to post-launch. Items below are data/infrastructure PREP for ML; model work itself comes later.

---

## Item 1: Regime Drift Tracking Dashboard Tab

**Source:** CC design mockup dated 2026-04-17 (approved in principle; detailed answers pending from Kyle).

**Scope:**
- New permanent tab in the DawnTrader UI showing live DBS + regime distribution + drift metrics + warnings
- Four primary metric cards: RBS drift contamination, TFS+IE share, family-level flicker, global DBS status
- Regime distribution view (pie/bar + table)
- DBS category distribution
- Drift history time series (RBS drift % over time)
- Active warnings panel with context-appropriate action buttons
- Actions panel: diagnostic (safe one-click) + corrective (confirm + audit-logged)
- User-configurable alert thresholds

**Open design questions** (from mockup review — Kyle to answer before build):
1. Default time window (suggested: 24h)
2. Notification channel (Telegram DM, email, both?)
3. Corrective actions — one-click or confirmation-gated?
4. "Open drift remediation batch" button — should it auto-generate a scope doc?
5. Additional metrics beyond the base set?
6. Visual style — match existing dashboards or distinct?

**Effort estimate:** 1 batch (~1 week). Data plumbing already exists; work is API endpoint + React component + alert wiring.

**Reference:** Mockup in CC session transcript 2026-04-17.

---

## Item 2: Data Archiving Update — Pair + Trade, All Three Modes

**Scope:**

### 2a. Unified trade record schema across VTS / Paper mode / Live mode

Every trade, regardless of mode, must capture the same rich context:
- **Signal/entry fields:** entry/exit price, stop, target, strategy, signal type, pattern type, pattern strength, final score, hybrid score, predictive confidence, regime weight, expected edge
- **Outcome fields:** gross P/L, net P/L, fees, position size, result type, close reason, exit time
- **Context fields (B61/B62 additions):** regime (pair-level), globalRegime, pairFriction, globalFriction, pairDirectionalBias, globalDirectionalBias, pairDirectionalBiasScore, globalDirectionalBiasScore, filterTier, sourcePool, **assetClass (NEW — see Item 5)**
- **Integrity fields:** schemaVersion, dataIntegrityTier (see 2d), classifierVersion (pre-B62 vs B62-design-b)

Currently:
- **VTS** (`virtual_trades/*.json`) has all of these (except assetClass and integrity tier markers) ✅
- **Paper sim** (`paper_sim_trades` DB table) has most columns but **MISSING** globalRegime, pairFriction, globalFriction, pairDirectionalBias, globalDirectionalBias, pairDirectionalBiasScore, globalDirectionalBiasScore, filterTier — needs migration
- **Live** (`trades` DB table) — same gaps as paper_sim_trades — needs migration

**Work:** DB migrations + trade writer updates + unified archiver that reads from all three sources.

### 2b. Pair-level scan data archiving

Capture every pair evaluated by the FX5 scanner every cycle, regardless of whether it passes filters or generates a trade:

- All filter metric values (volume 24h, spread, daily range, liquidity score, volatility, directional integrity)
- Filter verdict (passed / which specific filter rejected it)
- OHLC snapshot reference (or full 48-candle window; see 2c)
- Derived indicators if reached MCE (DBS, regime, vol, ADX, momentum)
- Scan cycle ID + timestamp

**Storage estimate:** ~330 pairs × 60s cycles × ~500 bytes = ~165 KB/cycle = ~240 MB/day uncompressed, ~72 MB/day gzipped. ~26 GB/year gzipped. Trivial on current disk.

**Value:** Enables ML training on "why did we NOT trade pair X" counterfactuals. Enables filter calibration review. Enables retroactive classifier analysis on rejected pairs.

### 2c. OHLC snapshot persistence

Persist the OHLC window used at each decision point. Options:
- **Per-cycle-per-pair snapshot** (full blood-sample approach) — ~5 GB/year gzipped, every pair's OHLC captured every cycle
- **Per-trade snapshot only** — much smaller but loses context for non-trading pairs

**Recommendation:** Per-cycle-per-pair. Small marginal cost, massive future ML value.

### 2d. Data integrity tier backfill (Option B)

Retroactively assign integrity tiers and recomputed regime labels to existing VTS data:

| Tier | Date range | Characteristics |
|---|---|---|
| **TIER_0_SIMULATED** | < 2026-01-20 11:05 UTC | Random values; not usable |
| **TIER_2_REAL_PRICES** | 2026-01-20 to 2026-03-06 | Real prices + outcomes, stubbed strategy scoring |
| **TIER_1_FULL_OLD_CLASSIFIER** | 2026-03-06 to 2026-04-16 09:15 UTC | Full integrity, pre-B62 classifier labels |
| **TIER_1_FULL_B62** | 2026-04-16 onwards | Full integrity, B62 classifier labels |

**Option B (Kyle approved 2026-04-18):**
- Mark TIER_1_FULL_OLD_CLASSIFIER trades with `classifierVersion: pre-B62`
- **Retroactively re-label regime** using B62 Design B classifier applied to each trade's captured pairDirectionalBiasScore + vol + ADX + momentum values. Store as `regime_b62_recomputed` alongside the original `regime` field.
- Net gain: ~10,000-15,000 pre-B62 trades upgraded to B62-classifier-compatible training data (~10x multiplier on clean corpus vs post-B62 only)
- One-time backfill script; a few hours of effort

**Policy:** No pre-Mar-6 VTS data used for ML. Pre-Jan-20 data archived-read-only for historical record but excluded from all training/inference pipelines.

### Storage budget for Item 2

| Data store | Per day (gzipped) | Per year |
|---|---|---|
| Pair-level scan records (~330 pairs × 1,440 cycles, OHLC referenced not embedded) | ~72 MB | ~26 GB |
| Central OHLC snapshot store (330 pairs × hourly candles, deduplicated) | ~12 MB | ~4 GB |
| Trade records (unified VTS + paper + live, avg ~300 trades/day once active) | ~0.6 MB | ~220 MB |
| Post-B62 MCE telemetry (already running) | ~25 MB | ~9 GB |
| **Total** | **~110 MB/day** | **~40 GB/year** |

**Storage runway:** On the Hetzner CPX22's 80 GB disk, ~18 months before needing disk upgrade or tiered cold storage for older data. Manageable. For context: 1 year of full-capture is roughly the size of a high-resolution movie.

**Tiering policy (recommended):**
- Hot (last 30 days): uncompressed or light gzip, fast read access
- Warm (30-365 days): aggressive gzip (zstd -19 or similar)
- Cold (>1 year): offload to Supabase storage or similar cheap object store; indexed for lookup but rehydrated only on demand

### Effort estimate for Item 2 (all parts): 1-2 batches

---

## Item 3: Global DBS Architecture Fix

**Design:** CC + Langston consensus from 2026-04-17, modified by Kyle to use fixed minimum (not % of peak).

**Implementation:**
- **Persistent per-pair DBS store** — `Map<symbol, {score, timestamp, sentinelZero}>` separate from the MCE TTL cache. Updated whenever MCE computes a pair's context. No expiry; entry only removed if pair leaves FX5 universe entirely.
- **End-of-cycle snapshot** — after each complete VTS scan cycle, take atomic snapshot of persistent store and publish as "current global DBS." All downstream consumers read this snapshot, not the live store.
- **Coverage gate replaced with fixed floor** — **minimum 20 valid (non-sentinel-zero, non-stale) pairs** required before computing global DBS. Below this, return NEUTRAL with a log entry and keep the last-good snapshot marked stale.
- **Staleness handling:** soft target = updated within last 2 scan intervals (~120s); hard expiry = 5 min. Entries older than 5 min dropped from snapshot.
- **Weighting:** transformed/capped volume weighting (volume-based but with per-pair cap to prevent single-pair dominance). Existing `GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT` constant stays; default remains disabled (1.0); activate at 20-25% only if BTC consistently > 40% of weight.
- **External signals** (Fear & Greed, BTC dominance, altcoin momentum) used as monitoring overlays only — NOT blended into the canonical formula.
- **Benchmarks included** (already deployed in B62).

**Effort estimate:** 2-4 hours of code. Requires PM2 restart to deploy.

---

## Item 4: Canonical Regime/Strategy Map — Sync Main File and UI

**Scope:**
- Verify `server/config/canonical-regime-strategy-map.ts` reflects all current strategy-to-regime assignments
- Verify the UI's Analytics and Diagnostics page → Overview tab renders the same mapping
- Specifically check: **IMPULSE_EXPANSION regime definition** in the map's `metrics` field still shows old momentum/ADX criteria but the B62 classifier now admits IE via `|DBS| >= 0.50 && vol > 0.015`. Update map's IE metrics description to reflect the new definition.
- If any strategies were reassigned between regimes in B62 (none were, per the scope), reflect that.
- Ensure the daily bridge sync (`sync-canonical-bridge.ts`) regenerates bridge JSON/Markdown from the updated source of truth.

**Effort estimate:** < 1 day. Mostly documentation + UI verification.

---

## Item 5: Asset Class + Standardized Signal/Trade Schema

**Scope:**

### 5a. Add `assetClass` field to all signal + trade tables

Enum values (initial set, extensible):
- `CRYPTO_SPOT`
- `CRYPTO_PERPETUAL` (future)
- `EQUITY_SPOT` (future — Kraken X-stocks)
- `EQUITY_OPTIONS` (future)
- `FX_SPOT` (some Kraken pairs like EUR/USD are already FX, should be tagged as such)
- `COMMODITY_SPOT` (gold proxies like PAXG/XAUT)
- `STABLECOIN` (stablecoin pairs)

Applied to: VTS open/closed tables, active trading tables (filter, RTB, open, closed), paper sim tables, live trade tables.

### 5b. Standardize displayed-data = captured-data

**Principle:** Whatever fields we capture for ML/archival must also be what's displayed in the UI tables, and vice versa. No field should exist in capture but not in display, or in display but not in capture.

**Scope:**
- VTS Open Simulated Trades table
- VTS Closed Simulated Trades table
- Active Trading — Filter table
- Active Trading — RTB table
- Active Trading — Open table
- Active Trading — Closed table
- Paper sim equivalents

**Required field set** (applied to all 6+ tables):
- Symbol, **assetClass**, B/S (benchmark/standard) type
- Regime (pair), global regime
- Strategy, signal type, pattern type, pattern strength
- Entry/exit price, stop, target, position size, quantity
- P/L gross, P/L net, fees, slippage
- Entry time, exit time, duration
- Final score, hybrid score, predictive confidence, regime weight
- Pair friction, global friction
- Pair DBS (category + score), global DBS (category + score)
- Source pool, filter tier
- Schema version, classifier version, data integrity tier
- Result type, close reason

**Effort estimate:** 1 batch (DB migrations + writer updates + UI table updates).

---

## Implementation Order (suggested)

1. **Item 3 (Global DBS fix)** — smallest, blocks nothing else, can deploy immediately after B62 closes. Single PM2 restart.
2. **Item 4 (Canonical map sync)** — docs/UI only, no restart needed, can happen in parallel.
3. **Item 5 (Standardized schema + asset class)** — prerequisite for 2a's unified archiver. Do before paper mode activates.
4. **Item 2 (Data archiving)** — the big one. Multiple batches. Depends on Item 5.
5. **Item 1 (Dashboard)** — consumes data captured by earlier items. Do last.

---

## Prerequisites before "launch"

Per Kyle's 2026-04-18 directive, ALL five items above must complete before live mode activates. ML work does not start until after launch, but all the data infrastructure must be in place BEFORE launch so the system is capturing correctly from day one.

---

*End of POST_B62_PRE_LAUNCH_PLAN.md*
