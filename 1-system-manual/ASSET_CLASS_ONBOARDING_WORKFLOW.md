# Asset Class Onboarding Workflow

**Tier 2 governance document.** Mandatory pre-read before any new asset class enters DawnTrader. Created in B79 (Phase 24) with `xstock_spot` as the canonical worked example.

**Living doc.** Every asset class onboarded adds a new Section H entry + iterates the template based on what was learned. By the time a fifth asset class lands, the doc is battle-tested.

**Phase 24 status (2026-05-10):** xstock_spot has been fully onboarded across 9 sub-batches (B79 + B79.TEC + B79.0a + B79.0b + B79.0c + B79.0d + B79.0f + B79.0g + B79.0e). The post-mortem (Section H.1.x) and updated decision rules (Section H.1.y) capture every lesson. **Read H.1.x and H.1.y first** before starting any new asset class — they're the highest-value content in this doc.

**Scope:** asset-class onboarding, not exchange onboarding. Exchange differences (API, symbol normalization, fee schedule) are mostly mechanical. Asset-class differences (regime classification, strategy applicability, friction model, market hours, telemetry partitioning) ripple deep into the system. Exchange-onboarding is a separate, simpler doc — flagged here as future work.

---

## Plain-language front-matter (per Langston rev 3 §G)

For each asset class, lead with non-jargon: **what is this asset class, what's special about it, and why does DawnTrader treat it differently from the asset classes we already support?**

This section answers Kyle's stated need: "explain it without code." Every Section H worked example begins with this front-matter block, then drills into the technical decisions.

---

## Section A.0 — Asset Class Definition + Operational Profile

For every new asset class, populate this table BEFORE anything else. The table sets the operational facts that downstream architectural decisions key off.

| Field | Definition |
|---|---|
| Trading hours | 24/7? 24/5? Session-bound (RTH only)? Weekend gap? Pre/post-market? |
| Settlement | Centralized exchange book? On-chain? Custodial broker? T+0 / T+1 / T+2? |
| Geography / regulatory | Restricted jurisdictions? KYC requirements? Sanctioned-country considerations? |
| Fees (maker / taker) | Volume tier brackets? Stablecoin discounts? Payment-in-kind options? |
| Custody model | Self-custody available? Exchange-custody only? On-chain wallet required? |
| Exchange WS endpoint | Path + protocol version + heartbeat cadence + reconnect semantics |
| Exchange REST endpoint | Path + auth model + rate limits |
| Symbol form on each endpoint | Canonical form? Display form? WS feed form? Are these all the same? |
| Universe size + dynamism | Static? Growing? Shrinking? Frequent listings/delistings? |
| Tick size / lot size / fractional | Decimal precision in price + quantity. Minimum order size. |

### Section A.0 — xstock_spot worked example (B79)

| Field | xstock_spot value |
|---|---|
| Trading hours | 24/5. Closed Sat-Sun + US market holidays. |
| Settlement | Solana on-chain (1:1 backed equity tokens, Backed Finance). T+0 spot trade. |
| Geography / regulatory | Available on Kraken Pro non-US. UAE-resident user → permitted. |
| Fees | Same as Kraken Spot fee table. Taker 0.26%, Maker 0.16% at base tier. |
| Custody model | Kraken-custody on-platform. On-chain Solana wallet required for withdrawal (Phase 19 active-trading concern). |
| Exchange WS endpoint | `wss://ws-equities.kraken.com` (separate from `wss://ws.kraken.com/v2`) |
| Exchange REST endpoint | Equity Spot REST returns NO xStocks tickers; data via WS only or via the B74 archiver's per-pair candle endpoint. |
| Symbol form | Canonical = `<TICKER>/USD` (e.g. `AAPL/USD`). WS feed = same. Display = `<TICKER>x/USD` (e.g. `AAPLx/USD`). resolveAssetClass dispatches via XSTOCK_SPOT_SYMBOLS allow-list. |
| Universe size | 275 symbols today; growing toward 500 by EOY. Static config in `server/config/xstocks-universe.json`; manual update + commit. |
| Tick / lot / fractional | $1 minimum (fractional). Tick size verified via WS depth feed (pre-audit). |

---

## Section A — Discovery + Inventory

Use Section A.0 + this checklist to confirm the asset class is operationally well-understood before architecture decisions.

- [ ] Operational facts captured (Section A.0)
- [ ] Pair universe source identified
- [ ] Universe-refresh cadence decided
- [ ] Ticker / OHLC source(s) identified
- [ ] Live-pricing infrastructure path decided (extend existing vs build dedicated)
- [ ] Per-pair characteristics inventory completed (compare to BATCH_79_SCOPE.md §4)
- [ ] Asset-specific characteristics inventoried (sector, fundamentals, IV, etc.)

### Section A — xstock_spot worked example

- Pair universe: `xstocks-universe.json` static config; manual PR adds new symbols.
- Ticker: WS-only (`ws-equities.kraken.com`); 24h volume aggregated from `equity_spot_ohlc_1m` table populated by B74 archiver.
- Live-pricing: B79 uses 1m archive lookup (no real-time WS subscriber). Real-time WS adapter deferred to **B79.5** (Phase 19 active-trading prerequisite).
- Asset-specific characteristics:
  - **Sector classification** — required for Stage 12.5 portfolio-cluster prevention. Source: `yfinance.Ticker(symbol).info['sector']`. Refresh: annual cron. Stored as `sector` field in `xstocks-universe.json`.
  - Earnings calendar — DEFERRED to B79.x.
  - Market-cap classification, P/E, IV, analyst ratings — DEFERRED.

---

## Section B — Architecture Decisions

For every new asset class, decide:

| Decision | Options | Decision criteria |
|---|---|---|
| Scanner | Shared FX5 vs Dedicated | Telemetry isolation requirement. If signal distributions are materially different (equity vs crypto microstructure), dedicated. |
| Family filter path | Shared vs Separate | Family taxonomy (TFS/RBS/IE/HVU/ST) is regime-based, not asset-class-based; usually share. Per-family IMF thresholds asset-class-scoped. |
| RTB pool | Shared vs Separate | Day 1 share with biased ranking; B81's `expectedNetReturnR` primitive provides cross-asset parity. |
| Live-pricing | Extend existing vs Dedicated adapter | If endpoint differs (different WS host), dedicated adapter. |
| Telemetry isolation | By instance vs By assetClass param | The B79 fix establishes assetClass param plumbing as the cross-cutting standard. |
| Pattern pool | Shared vs Separate vs Disabled | Default: separate per asset class with asset-class-specific guardrails. |
| Quant family paths | Shared vs Separate per asset class | rev 7 §-2.5 SSOT: separate. Family-path keys asset-class-prefixed. |

### Section B — xstock_spot decisions (rev 7 consensus)

- Scanner: **DEDICATED** xstock scanner. (rev 5 §C: telemetry isolation + market-hours-aware loop + independent benchmarks.)
- Family filter path: **SHARED** taxonomy (TFS/RBS/IE/HVU/ST applies to equities), but per-family IMF thresholds asset-class-scoped per rev 7 §-2.5.
- RTB pool: **SHARED Day 1**, biased ranking acknowledged; cross-asset parity via B81 `expectedNetReturnR`.
- Live-pricing: **DEFERRED to B79.5**. B79 uses 1m archive lookup.
- Telemetry isolation: **assetClass param** at every boundary, default `'crypto_spot'` (backward-compatible). PairFailureTracker partitioned by-instance via dedicated AdaptiveScanManager.
- Pattern pool: **SEPARATE xstock_spot pattern pool**. 3 file-based strategies enabled Day 1: `inside_bar_reversal`, `morning_star`, `pivot_shift`.
- Quant family paths: **SEPARATE per asset class** with `xstock_spot.tfs` / `xstock_spot.rbs` / etc. SSOT keys.

---

## Section C — Schema + Configuration Surface

Every new asset class touches these schema concerns:

- `module_constants` — verify scope dimension supports asset_class scoping.
- `screener_filters` — has asset_class column? If yes, insert row. If no, schema migration first.
- `paper_sim_trades` — asset_class column present?
- `paper_sim_open_positions` — asset_class column present?
- `signal_eval_archive` — asset_class column present?
- `regime_factor_alternates` — asset_class column present?
- `tunable_status` column — does the row tag values as `pending_layer_3` for unknown thresholds?

### Section C — xstock_spot worked example

- screener_filters: B79 schema migration adds `asset_class` (text NOT NULL DEFAULT 'crypto_spot') + `tunable_status` (text DEFAULT 'active') columns. Backfill all existing rows to `asset_class='crypto_spot'`. Insert xstock_spot row with NO max_price cap (per Kyle).
- module_constants: scope-based lookup verified (B78 work). `xstock_spot.*` keys added per family-path SSOT discipline (rev 7 §-2.5).
- paper_sim_trades / signal_eval_archive / regime_factor_alternates / paper_sim_open_positions: B70+ era expected to have asset_class. PIA Step §2 audits + adds if missing.

---

## Section D — Code Surface

For every new asset class, build:

- `server/asset_classes/<class>/regime-thresholds.ts` — branch-condition constants, leaf module
- `server/asset_classes/<class>/friction.ts` — fee/spread/slippage model
- `server/asset_classes/<class>/pattern-pool-filters.ts` — guardrails for pattern path
- `server/asset_classes/<class>/market-hours.ts` — ONLY if session-bound
- `server/asset_classes/<class>/index.ts` — re-exports public surface

And wire into:

- `calculatePairRegime` — asset-class dispatch in `market-regime.ts`
- `cost-model.ts` — asset-class friction lookup
- `market-scanner.ts` (if dedicated scanner; instantiate factory)
- `signal_quality_evaluator.ts` — asset-class gates (confidence_threshold, di/adx/momentum mins)
- `resolveAssetClass` (in `shared/asset-classes.ts`) — symbol-to-class dispatch
- `MULTI_FAMILY_ELIGIBILITY` (in `canonical-regime-strategy-map.ts`) — strategy-asset-class scoping
- Telemetry / ratio / aggregator boundaries — `assetClass` param plumbed
- TEC stop-evaluation — `if (!isMarketOpenForAssetClass) return SKIP`

---

## Section E — 18-Stage Walkthrough Checklist

For every new asset class, walk all 18 stages. At each, answer:

- What variables / thresholds / gates apply?
- Are they asset-class-scoped or shared?
- Where do values come from (DB rows, TS constants, derived)?
- Layer 1 (domain-knowledge baseline) value?
- Tagged `pending_layer_3` if no domain knowledge available?

The 18 stages (B79 scope §1) are: Connection / Discovery / Adaptive Batch / DBS / Global Filter / Pattern Pool (PARALLEL) / Family-IMF / Regime / MCE / Strategy Detect / SQE / Cost / Ranking / Portfolio Risk / Trade Entry / Lifecycle / Position Mgmt / Trade Close / Calibration.

A row-per-stage table per asset class lives in Section H worked examples.

---

## Section F — Layer 1 / Layer 2 / Layer 3 protocol

Three-layer calibration discipline per `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §6.2:

| Layer | Source | Duration | Output |
|---|---|---|---|
| **Layer 1** | Domain-knowledge baseline. Engineer judgment + literature. | 1-2 hrs in scope. | TS constants + DB rows tagged `tunable_status='active'` if confident OR `'pending_layer_3'` if not. |
| **Layer 2** | Cross-asset shadow-classify sanity check. Compare to crypto baseline. | 2-3 hrs in scope. | Confirms or revises Layer 1 values. |
| **Layer 3** | Live shadow-mode VTS observation. | per-asset-class (see §F.X). | Tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. Promotes `pending_layer_3` to `active`. |

### Section F.0 — Two parallel ablation frameworks run during Layer 3 (locked Kyle directive 2026-05-08)

Every new asset class onboarding runs **two parallel ablation frameworks** during shadow-mode observation. Both deliver Layer 3 evidence; both must be wired before live-loop activation:

1. **Factor-calibration ablation (B67.0 framework).** Per-factor counterfactuals on each chain modulator (b67_1 macro modifier, b67_2 phase, b67_4 outcome feedback, b68_1 multi-TF, b68_2 volume regime, b68_3 pair correlation, b68_4 regime age, b68_5 Path B sustainability). Stored in `regime_factor_alternates` (asset_class-scoped per B69). Drives the confidence-modifier chain calibration decisions per asset class (post-composition floor, individual factor enable/disable, lift-vs-control evaluation).
2. **Exit-strategy ablation (B73 framework).** 12 variants (BE A-F + Trail G-J + Combined K-L) per closed trade. Stored in `exit_strategy_alternates` (asset_class-scoped). Drives the **per-asset-class TEC configuration decisions** — specifically: should `break_even_enabled`, `trailing_exit` engagement, `target_lock_r`, `moonbag_*` constants be ON or OFF for THIS asset class? Crypto's B73 ablation showed Variant K (BE-disabled) wins; equity microstructure may differ.

Both frameworks are extensible: B67.0 hook in factor-ablation-emitter is asset-class-agnostic; B73 hook in `vts-service.persistRealPriceTrade` is asset-class-agnostic. **What's required for each new asset class:** confirm both hooks emit when `assetClass === '<new_class>'` + extend the aggregator paths (drift-dashboard for B67.0, exit-strategy-ablation for B73) so each asset class has its own results panel.

**Replacement is not the answer — parallel observation is.** B79.4 extends B73 to xstock_spot alongside crypto's existing B73 (both run side by side, separate aggregator scope filters by asset_class). Same pattern for B80 + future asset classes.

### Section F.X — Observation Period Sizing (per-asset-class flexibility)

Standard for crypto_spot: 14 days for B67/B68 calibration windows + 2 weeks for B73 exit ablation. **Other asset classes may differ** — equities trade 24/5 (~80 hr/wk) vs crypto 24/7 (168 hr/wk), so equivalent sample volume takes longer wall-clock. Each new asset class declares its observation period sizing during scope-lock, populated as PIA evidence on sample-rate-per-day accumulates in the first 24-48h post-live-wire.

**Decision criteria for the observation period length per asset class:**
- Target sample count per regime per factor bucket: ≥150 (per Langston cc-inbox #856 calibration check threshold)
- Wall-clock minimum: enough days to span at least one full weekly cycle (captures Mon/Fri intraday-pattern variation)
- Wall-clock maximum: don't observe past the point where regime conditions have shifted enough that early data is no longer comparable to current behavior

xstock_spot's specific observation period sizing populates as a Section H.1 entry once Layer 1 sample-rate evidence is in.

### Exit observation metrics (per Langston rev 5, scope §-2 row 7)

For asset classes with different volatility profiles than crypto (B79: equities are LESS volatile), Layer 3 explicitly calibrates exit-side constants. 6 metrics:

1. Time-to-target by regime
2. MAE-before-profit
3. MFE-at-exit
4. ATR-vs-%-stop comparative performance
5. Partial-take impact on net P&L
6. Hold-time by regime

These feed into Stage 14a position-management trigger calibration (BE-stop arming, trailing-stop activation, partial-take fractions).

---

## Section G — Verification + Forward-Watch

For every new asset class onboarding, define:

- **Behavioral verify checklist** — run on staging post-deploy, before claiming Step 7+8 complete
- **No-touch fence SQL** — query that confirms existing asset classes' factor-emission cadence is unchanged. Pattern from B78:
  ```sql
  SELECT factor_name, COUNT(*) FROM regime_factor_alternates
  WHERE asset_class = 'crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
  GROUP BY factor_name;
  ```
  Acceptance: counts within ±10% of pre-deploy baseline.
- **24h forward-watch dashboard** — what metrics get checked at +24h post-go-live
- **7d forward-watch dashboard** — what metrics get checked at +7d
- **Strategy-gap monitoring discipline** (per Langston rev 5, scope §2.X.9) — explicit gap-watching criteria during shadow-mode. 5 concrete triggers:
  1. Fire-rate by regime <50% of crypto baseline
  2. ≥80% concentration in ≤2 strategies
  3. Win-rate clustering 40-50% (no edge)
  4. Identifiable temporal windows where no strategy fires
  5. Named pattern recurrence in unfilled signal opportunities

Each trigger has a documented next-action (typically: open a sub-batch to add the missing strategy).

---

## Section H — Worked Examples

### Section H.1 — xstock_spot (B79, Phase 24)

#### H.1 Plain-language front-matter

xStocks are tokenized 1:1 backed equities listed on Kraken's Pro venue at `wss://ws-equities.kraken.com`. Each xStock token (e.g. AAPLx) is fully collateralized by an actual share of the underlying NYSE/NASDAQ stock (AAPL) held by Backed Finance, a regulated Liechtenstein issuer. They settle on the Solana blockchain (T+0 atomic), trade fractionally with a $1 minimum, and operate on US market hours (24/5 — closed Sat/Sun + US holidays + early-close days).

Why DawnTrader treats them as a separate asset class:

- **Hours.** Crypto is 24/7; equities are 24/5. The scanner must early-return on weekends; the trade lifecycle controller must freeze stops when the market is closed (a stop can't fire when there's no price action).
- **Volatility profile.** Crypto pairs run 2-8% ATR%; equities run 0.5-2%. Regime classifier thresholds halved as Layer 1 baseline.
- **Microstructure.** Crypto has flat 24/7 volume; equities have a U-shape (open-bell + close-auction peaks, lunch lull). Volume-normalized indicators behave differently.
- **Macro inputs.** BTC dominance and crypto funding rates are irrelevant; equities respond to VIX, S&P trend, sector rotation. Macro modifier defaults to 1.0 in B79; equity-equivalent macro inputs deferred to **B79.3**.
- **Failure modes.** Crypto rarely halts; equities have LULD halts, circuit breakers, dividends, splits, scheduled earnings windows. New taxonomy table per scope §1.X.
- **Sector correlation.** Equities cluster by sector (5 tech stocks all move together) much harder than crypto's symbol-similarity grouping. Portfolio-cluster prevention needs sector-aware logic in **B79.6**.
- **Tokenization vs underlying.** AAPLx may or may not trade like AAPL. The Q-D pre-implementation probe (yfinance comparison, 4-window correlation, 3-tier decision tree) determines downstream design intuitions before coefficient calibration is trusted.

This worked example walks the full Section A through G for xstock_spot.

#### H.1.A.0 Operational Profile

(See Section A.0 above.)

#### H.1.B Architecture Decisions

(See Section B above.)

#### H.1.C Schema

- `screener_filters` migration: `asset_class` + `tunable_status` columns; xstock_spot row with no max_price cap.
- xstock_spot module_constants seed rows:
  - `xstock_spot.regime.*` per regime-thresholds.ts (asset-class-prefixed keys per rev 7 §-2.5)
  - `xstock_spot.sqe.confidence_threshold = 70` (vs crypto 60; conservative Day 1 Layer 1)
  - `xstock_spot.sqe.di_min_quant = 18`, `adx_min = 18`, `momentum_min = 0.002`, `di_min_pattern = 10`
  - `xstock_spot.macro_modifier = 1.0` (placeholder pending B79.3)
  - `xstock_spot.orb_enabled = false` (Q-D-gated)

#### H.1.D Code Surface

Files added / modified — see BATCH_79 commit hashes (linked in BATCH_CATALOG entry).

#### H.1.E 18-Stage Walkthrough

Per scope §1 / scope §2.X. Cross-references stages 0-16 + cross-cutting failure mode taxonomy.

#### H.1.F Layer 1 / 2 / 3 Status

- Layer 1: complete in B79 (regime thresholds, SQE thresholds, friction values).
- Layer 2: cross-asset shadow-classify spot-check (xstock pairs into existing classifier with shared math; verify branch routing makes sense).
- Layer 3: live shadow-mode VTS observation 48-72h+. Drives sub-batches B79.1+ (coefficient tuning, equity-specific strategy additions, exit-side calibration).

#### H.1.G Forward-Watch

- 24h post-deploy: confirm shadow-mode VTS emission for xstock_spot pairs, factor-ablation counts populating in `regime_factor_alternates`, no-touch fence SQL on crypto_spot still green.
- 7d post-deploy: strategy-gap monitoring (5 triggers from Section G); resource-watch metrics from scope §11.5.

#### H.1.x POST-MORTEM — lessons learned from the full Phase 24 stretch (B79 + B79.TEC + B79.0a–0g)

Populated 2026-05-10 after the entire 9-sub-batch stretch landed. xstock_spot is now the canonical worked example referenced by every section in this doc. The post-mortem groups lessons by where they bite next time.

**SCAFFOLD-VS-LIVE separation (B79 → B79.0a):**
- Day-1 dormant scaffold ships PROVED its worth: zero blast radius until the live wire-in runs.
- Don't conflate "scaffold ships dormant" with "code is correct." B79.0a's pre-deploy load test surfaced cycle-runtime overshoot that was invisible until centralClock-driven evaluation actually fired.
- **Lesson:** scaffold-ship-then-go-live as separate sub-batches IS the right pattern. Resist pressure to compress into one batch.

**TELEMETRY PARTITIONING (B79.0a):**
- AdaptiveRatioManager + TelemetryAggregator + AdaptiveRatioManager + PairFailureTracker were all module-scoped singletons pre-B79.0a. xstock_spot needed its own cohort without polluting crypto's signal-quality history.
- **The pattern:** instantiate `getAssetClassInstances(class)` factory returning a TRIAD (telemetry + ratioManager + failureTracker + scanManager). Crypto path returns the existing globals (back-compat). Each new asset class lazy-instantiates its own.
- Constructor-injection-with-default is the cross-cutting plumb. NOT param-plumbing through every callsite (Langston rejected that lean — silent-corruption risk).

**PER-ASSET-CLASS BEHAVIORAL CONFIG (B79.TEC):**
- TEC config (`break_even_enabled`, trailing distances, BE-trigger-R, etc.) was wildcard-only. xstock_spot's exit profile differs from crypto's — wildcards leak crypto's policy onto the new asset class.
- **The pattern:** `Map<AssetClass, TrailingExitConfig>` cache. `resolveTECConfig(assetClass)` looks up by class. `primeTECConfig()` warmup at boot HARD-FAILS if any registered asset class lacks an explicit row (no silent fallback).
- **Generalization:** ANY behavioral knob (regime thresholds, confidence floors, friction values, BE-protection rules, trailing rules) must be DB-resolved with `asset_class` as a first-class scoping dimension. A wildcard `*` row is a starting placeholder ONLY when the value is genuinely identical across all classes; the moment any class needs a different value, the wildcard is replaced with explicit per-class rows.

**STATE-VS-CONFIG REHYDRATE BOUNDARY (B79.TEC):**
- `state.*` (latched flags, peaks, trailing-active) rehydrates verbatim from disk.
- `config.*` (whether to latch, multipliers, thresholds) re-resolves from current DB rows.
- **Lesson:** when a feature has both runtime state AND configuration, the rehydrate path must distinguish them. State persists; config gets re-resolved on every restart so DB changes take effect deterministically.

**N3+N4 CLEANUP DISCIPLINE (B79.0b):**
- N3 — dead-code truthy guards on TS-guaranteed-non-undefined fields: `if (input.strategy && ...)` when `strategy: string` is the type. Cleaner code; future readers don't ask "why is this still here." Cleanup is 0-blast-radius and should ride along on the next sub-batch.
- N4 — boundary tests for surfaces SHIPPED WITHOUT TEST COVERAGE at time of ship. Catches nothing the first time (best-case outcome) AND establishes regression coverage going forward.
- **Generalization:** every new asset class onboarding ships with at least one boundary-test sub-batch retroactively covering surfaces that didn't have tests at original ship.

**24/7 VS 24/5 WITHIN AN ASSET CLASS (B79.0c):**
- A subset of xStock tokens trades 24/7 (Kraken Phase 1, announced 2025-12-03). Treating the whole asset class as 24/5 silently rejects valid weekend signals on those names.
- **The pattern:** per-symbol predicate `isMarketOpen(symbol, now?)` instead of class-wide `isMarketOpen(now?)`. Required-symbol signature (Langston Q4 push-back) — optional with silent ARCA fallback creates a silent-bug class.
- **Generalization:** asset classes are NOT necessarily monolithic. If the exchange treats some symbols differently (24/7 names; halted-but-listed names; pre/post-market windows), the predicate must be per-symbol from Day 1.
- **Pre-ship probe pattern.** Don't trust documentation alone. Empirically probe the WS feed for the documented behavior. B79.0c's 60-second probe to ws-equities for the 10 24/7 names returned 0 ticker / 0 OHLC — Kraken's WS goes silent on weekends regardless of the 24/7 marker. Filed RUNNING_ISSUES #89 and explicitly avoided claiming "live data flow."

**STRATEGY REAL-IMPLEMENTATION PATTERN (B79.0d):**
- Scaffolding ≠ implementation. ORB shipped in B79 as a 7-line scaffold returning null. B79.0d wrote the actual ~210-line detect logic.
- **The 6-step pattern for activating a strategy on a new asset class:**
  1. Write detect logic (range, breakout, confidence formula, geometry)
  2. Register in strategy-engine dispatch (import + enum + wrapper method)
  3. Wire into signal-orchestrator dispatch loop (gated on activeStrategies + asset-class)
  4. Add to `CANONICAL_REGIME_STRATEGY_MAP` for applicable regimes
  5. Seed Layer-1 thresholds in `module_constants.strategy.<key>` for the asset class
  6. Flip DB gate `module_constants.strategy_gates.<class>.<strategy>.enabled` true
- **Triple-defense asset-class guard.** detect-internal guard + dispatch-block guard + SQE whitelist. Any single missed gate could fire the strategy on the wrong asset class. Belt-and-suspenders.
- **Strategy-agnostic ablation.** B73 replay-service is strategy-agnostic — new strategies flow through automatically once `persistRealPriceTrade` runs with their key. No registration code needed (just verify `asset_class_disabled` whitelist enforcement and STRATEGY_DISPLAY_NAMES coverage).
- **DB-tunable rollback.** UPDATE `module_constants.strategy_gates.*.<strategy>.enabled = false` neutralizes the strategy on next tick. No code revert needed.

**TICKER COLLISIONS (B79.0f) — the SUI bug class:**
- A single base-symbol exists in BOTH the new asset class's universe AND an existing asset class's universe. The same canonical form (e.g. `SUI/USD`) maps to two different assets.
- **Discovery process:** at scope time for any new asset class, run a live intersection: `<new-class-symbols> ∩ <existing-class-symbols-on-same-exchange>` via `/0/public/AssetPairs` (or equivalent). Document the collision set with PROVENANCE (source URL + date verified).
- **Resolver gating:** the new asset class's membership-set fast-path must be GATED on collision-set non-membership. Tickers in the collision set fall through to the existing asset class on the regular exchange path; explicit display-form (e.g. `SUIx/USD`) routes to the new class.
- **WARN log on collision drift.** When a collision ticker hits the regular path without disambiguating form, emit a `[<batch>][COLLISION_RESOLVE]` log so the data-source invariant gets exercised and any future drift in upstream behavior surfaces immediately.
- **Standing rule:** quarterly re-audit of the collision set. New tokens added by exchanges create new collisions over time.
- **Backfill discipline.** When the collision-bug existed in production, do an audit + remediation:
  1. READ-ONLY audit script first (SELECT-only across all tables with asset_class column).
  2. Backfill UPDATE statements COMMENTED OUT in the audit script. Manual uncomment after Kyle reviews counts.
  3. Per-table row counts paper-trailed in CHANGES_AND_FIXES.md (not just RUNNING_ISSUES).
- **Don't trust documentation.** Crypto SUI = Sui Network; Kraken xStock SUI = Sun Communities equity (NYSE: SUI). The collision was non-obvious until the live API query made it visible.

**PERSISTENCE-AT-TRADE-OPEN ARCHITECTURE (B79.0g):**
- The principle. Every consumer of asset_class (or any other trade-derived field) reads from the persisted ROW, never re-resolves from a canonical form. Re-resolution from canonical form is fundamentally ambiguous when collisions exist.
- **Trade-open path:** AWAIT INSERT BEFORE Map.set. Any fire-and-forget pattern at trade-open creates an observer-divergence window where downstream observers (TEC, scanner cycle, signal logging) see the trade live before persistence completes — and if persistence fails, you get a half-state.
- **Trade-close path:** atomic single transaction wrapping DELETE-from-open + INSERT-to-closed. If `persistRealPriceTrade` doesn't expose a tx handle (current state), accept fire-and-log as deviation BUT pin a follow-up numbered batch (e.g. B79.0g-tx) — RUNNING_ISSUES alone is not sufficient paper trail (Langston rule).
- **Bootstrap from memory:** when first-deploying persistence-at-open into a system that has in-memory open trades from before the deploy, RE-RESOLVE asset_class via `safeResolveAssetClass(symbol, exchange)` BEFORE INSERT. Critical: the in-memory record may carry a stale value baked in by an earlier (buggy) resolver; blindly snapshotting freezes the wrong value into DB and defeats the purpose.
- **Rehydrate-on-boot:** read all open-trade rows back into the in-memory Map after the existing trailing-engine state restoration but BEFORE scanner.start so cycle 1 sees correct state. Soft-fail policy (log + continue with empty Map) keeps boot non-blocking.

**NAMESPACE HYGIENE (B79.0e):**
- Legacy field-VALUE renames (e.g. `equity_spot` → `xstock_spot` for the asset_class column) DON'T automatically rename TABLE names that were created with the old naming convention.
- **The cutover pattern:** `ALTER TABLE RENAME` is metadata-only — sub-second on multi-million-row tables; live archiver buffers absorb the gap.
- **Don't forget the children.** Partition-children + indexes don't auto-rename with parent. `DO $$ FOR r IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'old_prefix%' LOOP ... ALTER TABLE %I RENAME TO %I ... END LOOP $$;` — same DO block for indexes via pg_indexes.
- **Module_constants key strings carry table names too.** `data_lifecycle.equity_spot_*.hot_retention_days` keys would orphan from the renamed parents. Same `UPDATE module_constants SET constant_name = REPLACE(...)` pattern.
- **Reserve the namespace.** `equity_*` reserved for FUTURE real (non-tokenized) US equities. xStocks are tokenized representations — own namespace `xstock_*`. Don't burn the original namespace on the wrong concept.
- **Rollback symmetry.** Forward + rollback must touch the SAME 4 surfaces (parents, parent indexes, partitions/children via DO block, indexes via DO block, module_constants UPDATE). Any asymmetry is a future foot-gun.

**COMMS-INFRA PROTOCOLS (process, not architecture — but critical for the workflow):**
- **File-first for any large content (>3KB).** Design asks, scope drafts, multi-question reviews go in `Claude Comms and Packages/Langston Design Asks/<batch>_<topic>_<rev>.md`; Telegram + watchdog prompt is the SHORT (under 1KB) pointer to the file. Never shorten content to dodge API hang on large prompts — putting it on disk is the proper solution.
- **Watchdog v2 stream-json sidecar.** Tool-use cycles count as liveness; first-byte timeout 60s + idle timeout 600s for substantive reviews; sidecar NDJSON for forensics. v1 watchdog (text output) confused tool-use stalls with API hangs.
- **`bypassPermissions` for code-review work.** `acceptEdits` mode hangs on Bash tool use because watchdog doesn't auto-accept. Code-review prompts that need ad-hoc grep/Bash require bypass mode (Langston runs in sandboxed user account anyway).
- **GDrive FUSE recursive-grep timeout on Hetzner.** Tell Langston explicitly "Read tool only, no Bash/Grep recursive ops." If he runs `rg` against the FUSE mount, it times out at 20s and the watchdog stalls.
- **Telegram bot-to-bot platform block.** When `@CCDTCommsBot` posts in a topic, `@LangstonDTBot`'s getUpdates poll never sees it — Telegram rule, no flag bypass. Use SSH+claude-cli direct delivery for me→Langston, not Telegram.
- **MANDATORY verbatim Telegram relay of Langston responses** (CLAUDE.md §6.5 Step 3). Watchdog-via-SSH responses don't auto-post to Telegram; CC manually curls them via `@LangstonDTBot`'s sendMessage prefixed `**LANGSTON SPEAKING:**`. Otherwise Kyle has zero visibility into what Langston actually said.

---

#### H.1.y Updated decision-framework rules (post-Phase-24)

These extend Section I.0 and Section I's if/then table with rules surfaced by B79.0a–0g.

| Rule (new, post-B79.0a-0g) | What triggers it | What to do |
|---|---|---|
| Telemetry partitioning required when signal distributions differ | Asset-class signal/null-rate distributions are NOT equivalent to existing classes | Build separate-instance triad (Telemetry + ARM + scanner + PFT) via `getAssetClassInstances` factory. Crypto returns global singletons; new class lazy-instantiates fresh triad. |
| Per-asset-class behavioral config required | Asset class needs ANY behavioral knob different from defaults | DB-resolve with explicit `asset_class` rows. Wildcard ONLY when truly identical. HARD-FAIL on boot if any registered class lacks explicit rows. |
| State-vs-config rehydrate boundary | Feature has both runtime state + configuration | State persists from disk; config re-resolves from current DB rows. |
| N4 boundary tests retroactively | Surfaces shipped without test coverage | Sub-batch retroactively adds tests; catches nothing first time = best case. |
| Per-symbol predicates | Asset class has 24/7 + 24/5 mix OR halt-able names | Required-symbol signature (no optional silent-fallback). Pre-ship empirical probe to verify upstream documented behavior. |
| Strategy real-implementation pattern | Activating a strategy for a new asset class | 6-step: detect → dispatch → orchestrator → regime-map → thresholds → gate-flip. Triple-defense asset-class guard. |
| Ticker-collision-set discovery | Two asset classes share an exchange | Live intersection via `/AssetPairs`. Document with provenance (URL + date). Resolver gates on collision-set non-membership. WARN log + standing quarterly re-audit. |
| Persistence-at-trade-open | Anywhere downstream consumers might re-resolve from canonical form | INSERT-before-Map.set. Atomic close-time DELETE+INSERT (single tx). Bootstrap-from-memory RE-RESOLVES before INSERT. |
| Namespace reserve | Adding a tokenized representation of existing asset class | Reserve original namespace (`equity_*`) for FUTURE non-tokenized; new namespace (`xstock_*`) for the tokenized. Don't conflate. |
| File-first comms with Langston | Any prompt content >3KB OR any multi-question review | Stage at `Langston Design Asks/<batch>_<topic>_<rev>.md`. Watchdog prompt is short pointer. |

### Section H.2 — crypto_perp (B80, Phase 25)

To be populated when B80 ships.

### Section H.3 — (future asset classes)

---

## Section I — Onboarding Decision Framework

If/then rules surfaced from xstock_spot worked example. Apply on every new asset class:

### Section I.0 — Universal rules (Kyle directives 2026-05-08, applied to ALL onboardings)

1. **NO PATCHES.** Every fix and feature must be a long-term, sustainable, stable, scalable solution. No duct tape. No "good enough for now." Surfaced bugs trigger root-cause investigation + design-then-implement, not patches. Cold-start warmup is acceptable (1-5 minute deterministic startup beats instant-on with stale-cache races). Every architecture decision discussed gets documented BEFORE implementation in the relevant governance doc the same session it's discussed. Verbal "we'll do that later" without paper-trail is rejected.
2. **Backpressure is never asset-class shedding.** Resource ceilings trigger vertical-scale (Hetzner / Supabase tier upgrade) or computational-distribution refactor — never drop-cycles or throttle-on-a-live-asset-class. Pre-deploy load test is a sizing decision-gate, not a squeeze-it-in gate.
3. **Per-asset-class configuration is the default for behavioral knobs.** Trading-policy decisions (BE enable, trailing exits, regime thresholds, confidence floors, friction values) MUST be DB-resolved with `asset_class` as a first-class scoping dimension. Wildcard `*` is acceptable as a starting placeholder ONLY when the value is genuinely identical across all classes; the moment any class needs a different value, the wildcard is replaced with explicit per-class rows. No silent fallbacks.
4. **Both ablation frameworks run during shadow-mode.** Factor-calibration ablation (B67.0) AND exit-strategy ablation (B73) — parallel, both required, each contributes Layer 3 evidence to per-asset-class trading-policy decisions. Replacement of an existing asset class's ablation is never the answer — parallel observation is.
5. **Per-asset-class observation period.** No universal "X days" rule — each new asset class declares its observation period during scope-lock based on sample-rate-per-day evidence. Minimum bound: ≥150 samples per regime per bucket. Wall-clock minimum: at least one full weekly cycle.
6. **Each new asset class gets its OWN dedicated observation UI tab** (Kyle directive 2026-05-08). Do NOT stack new ablation panels under existing tabs — those tabs grow unwieldy as multiple asset classes accumulate. Crypto_spot's Drift Dashboard tab stays as-is for crypto observation. xstock_spot observation panels live on a new dedicated tab (B79.4 deliverable). crypto_perp observation panels live on a new dedicated tab when B80 ships. Future asset classes follow the same pattern. This applies to BOTH ablation panels (factor-calibration AND exit-strategy) — they live side-by-side on the same per-asset-class tab.
7. **Update RUNNING_ISSUES + governance docs SAME SESSION as discussion** (Kyle directive 2026-05-08). Verbal commitments without paper-trail are rejected. Every architectural decision and every scope addition gets documented BEFORE implementation in the relevant governance doc the same session it's discussed. The project is too large + runs over too many phases for verbal commitments to survive.
8. **Comms with Langston follow file-first protocol for any large content** (CLAUDE.md §6.5.0; Kyle directive 2026-05-08). Design asks, scope drafts, multi-question reviews go in `Claude Comms and Packages/Langston Design Asks/<batch>_<topic>_<rev>.md`; Telegram + watchdog prompt is the SHORT (under 1KB) pointer to the file. Never shorten content to fit a prompt — putting it on disk is the proper solution.


| If | Then |
|---|---|
| Session-bound (not 24/7) | Build `market-hours.ts` + holiday calendar; mandatory scanner early-return + TEC stop-freeze gates. |
| Macro factors non-trivial | Ship macro_modifier=1.0 default; defer equity-equivalent macro inputs to a sub-batch with explicit Layer 3 evidence trigger. |
| Unique microstructure (vs existing classes) | Strategy-gap analysis required pre-ship. Document gap-watching triggers. |
| Session timing introduces systematic gaps (overnight, weekend) | BE-stop trigger reviewed not inherited. Trailing-stop activation thresholds re-derived in Layer 3. |
| Sector / cluster correlation > intra-class crypto correlation | Portfolio-cluster sector-aware. Sector classification source identified + scripted. |
| New failure modes (halts, circuit breakers, dividends, earnings) | Failure-mode taxonomy table populated before ship. Detection + handling for the most-likely modes implemented or deferred-with-tracking-issue. |
| Settlement model differs (on-chain, custody, T+1) | Phase 19 active-trading prerequisites flagged. Friction model accounts for any settlement-side cost. |
| Universe is dynamic | Refresh protocol decided + automated where possible. Static config for stable, automated for rapid-change. |
| Real-time pricing on a different WS endpoint | Live-pricing adapter onboarded as a separate sub-batch. B79 ships archive-lookup-only as Day 1 path. |

---

## Section J — Reusability for B80 + future

When B80 (crypto_perp) implementer starts:

1. Open this doc. **Read Sections H.1.x (post-mortem) and H.1.y (updated decision rules) first** — they encode every lesson from the 9-sub-batch xstock_spot stretch.
2. Walk Section A through G for crypto_perp.
3. Identify perp-specific deltas:
   - Funding rate (per-pair signal, NEW input to macro modifier composition)
   - Leverage + liquidation
   - Perpetual settlement
   - Funding-time clustering (8-hour funding windows)
4. **Run the H.1.x checklist explicitly** — for each lesson, ask "does this apply to crypto_perp?" Most will. Items in scope confirmed BEFORE writing code:
   - Telemetry partitioning triad (yes — perp signal distributions ≠ spot)
   - Per-asset-class TEC config (yes — perp exit thresholds differ from spot)
   - Per-symbol predicates (yes — funding-window-related quirks may need per-symbol)
   - Ticker collision check (mandatory — run live intersection vs crypto_spot + xstock_spot universes; document collision set + provenance)
   - Persistence-at-trade-open (yes — perp trades go through same vts-runner trade-open path)
   - Namespace hygiene (perp namespace is `crypto_perp_*` for archive tables — confirm B69 alignment)
5. Update Section H.2 with crypto_perp as worked example. Add new H.2.x post-mortem at T+7d post-go-live.
6. Iterate the template based on what crypto_perp reveals (e.g. Section A.0 may need a "leverage profile" row added).

**Compounding value:** every new asset class strengthens the workflow. By the time we add FX (Phase later), the doc is battle-tested against equity, perp, and existing crypto-spot baselines.

---

## Section K — Future: Exchange-onboarding workflow

Out of scope for this doc. Exchange-onboarding (when adding Binance, Coinbase, Bybit, etc.) is mostly mechanical: API auth, symbol normalization, fee schedule, WS protocol differences. To be authored as a separate doc when the second exchange is added.

---

*End ASSET_CLASS_ONBOARDING_WORKFLOW.md.*
