# Asset Class Onboarding Workflow

**Tier 2 governance document.** Mandatory pre-read before any new asset class enters DawnTrader. Created in B79 (Phase 24) with `xstock_spot` as the canonical worked example.

**Living doc.** Every asset class onboarded adds a new Section H entry + iterates the template based on what was learned. By the time a fifth asset class lands, the doc is battle-tested.

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

#### H.1.x What we'd do differently — POST-MORTEM (populated at T+7d post-go-live)

To be filled in 7 days after B79 ships.

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

1. Open this doc.
2. Walk Section A through G for crypto_perp.
3. Identify perp-specific deltas:
   - Funding rate (per-pair signal, NEW input to macro modifier composition)
   - Leverage + liquidation
   - Perpetual settlement
   - Funding-time clustering (8-hour funding windows)
4. Update Section H.2 with crypto_perp as worked example.
5. Iterate the template based on what crypto_perp reveals (e.g. Section A.0 may need a "leverage profile" row added).

**Compounding value:** every new asset class strengthens the workflow. By the time we add FX (Phase later), the doc is battle-tested against equity, perp, and existing crypto-spot baselines.

---

## Section K — Future: Exchange-onboarding workflow

Out of scope for this doc. Exchange-onboarding (when adding Binance, Coinbase, Bybit, etc.) is mostly mechanical: API auth, symbol normalization, fee schedule, WS protocol differences. To be authored as a separate doc when the second exchange is added.

---

*End ASSET_CLASS_ONBOARDING_WORKFLOW.md.*
