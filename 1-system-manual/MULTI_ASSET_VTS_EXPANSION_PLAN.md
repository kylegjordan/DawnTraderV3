# Multi-Asset Expansion — Living Plan Document

> **Filename note (Kyle directive 2026-05-09):** file is named `MULTI_ASSET_VTS_EXPANSION_PLAN.md` for git-history continuity, but **scope covers BOTH the VTS shadow-mode evaluation path AND the active trading path end-to-end** (signal-orchestrator emit → paper-execution-engine admission → RTB pool insertion → TEC). Every new asset class gets wired into BOTH paths. Live-trading testing of new asset classes lives in Phase 19; until then the active path is wire-in-only-no-trades. Future filename rename to drop "VTS" queued as low-priority cleanup.

> **Status:** LIVING. Update this doc BEFORE every batch in this stretch (sanity-check assumptions still hold) and AFTER (record what landed vs. what's now expected). Per Kyle directive 2026-05-07.
> **Owner:** Claude Code, with Langston review at every step gate.
> **Created:** 2026-05-07
> **Window:** 2026-05-07 → 2026-05-15 (8 days). Hard fence at 2026-05-15: B67.5 consumer-wiring window opens, calibration cohort closes.
> **Change log:** see §11 at bottom.

---

## §1. The pivot — what changed and why

Kyle directive 2026-05-07: **skip Phase 16 (legacy cleanup) for now and use the 8-day observational period to ship the Modularization phase + Multi-Asset VTS expansion.** Phase 16 stays parked.

**Active-trading wire-in is IN SCOPE for this stretch — but cannot be tested live yet.** Per Kyle clarification 2026-05-07 evening: we DO wire xstock_spot + crypto_perp into the active trading path (signal-orchestrator emit, paper-execution-engine, RTB pool, etc.) so the codepath is end-to-end ready. We just don't flip the active-trading switch on the new asset classes during this stretch — testing those wire-ins lives in **Phase 19** (component-by-component active trading audit), and the live-trading enablement gate is later still. Net effect: the new asset-class code paths exist in production but are dormant for active trading until Phase 19 reaches them.

Reason for the pivot: every prerequisite for adding the new asset classes is now in place — B69 asset-class plumbing live, Kraken XStocks + Kraken Futures feed already scanning + archiving, B72-family lever migration complete, B76 chain-final calibration framework working. The 8 days are wasted if we sit on legacy cleanup when we could ship this expansion observationally.

Confidence in 8-day fit: HIGH (Kyle ground-truth: CC consistently does in hours/days what it estimates in weeks). Conservative gate: if any single batch slips two days past target, defer the LAST one (B81 ranking parity is most deferrable; B78 modularization is on the critical path).

---

## §2. Scope summary

**In scope (this stretch):**
- B78 — Modularization phase (8-module extraction across `(exchange, asset_class, filter, strategy, regime)`).
- B79 — Xstock_spot (Kraken XStocks Pro) integration into VTS.
- B80 — Crypto_perp (Kraken Futures) integration into VTS.
- B81 — RTB ranking parity + SQE asset-class evaluation in VTS.

**Out of scope:**
- Live-trading **testing** of any new asset class (Phase 19 owns the component-by-component active trading audit; live trading enablement is downstream of that).
- Phase 16 (legacy cleanup).
- Crypto_spot threshold tuning (LOCKED through 2026-05-15 per calibration window).
- Anything that touches the chain-final calibration framework on crypto_spot.

**In scope (wire-in only, not tested live):**
- `signal-orchestrator.ts` emit hooks for xstock_spot + crypto_perp signals.
- `paper-execution-engine.ts` admission path for new asset classes.
- RTB pool insertion + ranking for new asset classes.
- VTS evaluation for new asset classes (THIS is what gets behaviorally verified during this stretch).

**Hard fence — no-touch list during this stretch:**
- `b67_5PostCompositionFloor` (currently 0.20, DB-only).
- `b68_5PathBMomentumMin` (currently 0.001, DB-only).
- `moonbag_qualifying_strategies` (currently `[]`, DB-only).
- `break_even_enabled` (currently `false`, variant K).
- Any `module_constants` row scoped to `asset_class='crypto_spot'` or `asset_class='*'` that affects crypto_spot resolution.
- Any change to factor-ablation-emitter, factor-ablation-builders, or the 9 build helpers' math.
- Any change to the regime classifier math for crypto_spot.

---

## §3. Why the observation period is safer than it looks

The B67.4/B68.x calibration windows measure per-factor predictive lift on `asset_class='crypto_spot'` rows. Every `regime_factor_alternates` row carries its `asset_class` tag (B69 work, 2026-05-03 ship). Adding xstock_spot/crypto_perp rows to that table does NOT contaminate the crypto_spot calibration windows — the aggregator filters by asset_class.

**Mandatory aggregator-query update (lands in B78 governance):** `drift-dashboard-aggregator.ts` `computeFactorCalibration` query gets `AND asset_class = 'crypto_spot'` added to the WHERE clause. One line, no schema change. Ensures pre-2026-05-15 calibration analysis stays scoped to crypto_spot regardless of how much xstock_spot/crypto_perp data accumulates in the table.

**No-touch fence — Step 0 of every batch in this stretch (mandatory pre-flight + post-deploy check):**

```sql
-- Pre-flight before any code change deploys
SELECT factor_name, COUNT(*) AS n_last_hour
FROM regime_factor_alternates
WHERE asset_class='crypto_spot'
  AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

Confirms crypto_spot ablation continues at expected cadence (~10 factors × ~12 evals/hr ≈ 120 rows/hr). If it drops materially post-deploy, halt and revert. Same query post-deploy: verify cadence didn't shift. Documented in CLAUDE.md §2 Step 7 as B78+ pre-flight requirement.

---

## §4. Sequencing (8 days, working backward from 2026-05-15)

> **2026-05-07 update (Kyle directive):** No deferrals in this stretch. The three B78 deferrals (ws-adapter cycle break, friction extraction, filter-as-first-class) are folded into named batches below — none left as orphan "address later" items.

| Batch | Days | Description | Active-trading impact | Critical path? |
|---|---|---|---|---|
| **B78** | 1 (DONE 2026-05-07) | Modularization scaffold. Pure file/import refactor + aggregator scope filter. SHIPPED at HEAD `de827f37b`. | None | YES |
| **B78.1** | 1 (DONE 2026-05-07) | **Cycle break: DI inversion for `kraken-websocket-adapter ↔ live-pricing-adapter`.** Event-emitter pattern + ws-adapter move to `server/exchanges/kraken/`. SHIPPED at HEAD `fb9a58667`. Madge 47 → 46 cycles, #10 absent. Verify surfaced RUNNING_ISSUES #76 (5-week-old upstream WS subscribe failure — pre-existing, masked by REST fallback). |
| **B78.2** | 2 (DONE 2026-05-07) | **Kraken WS v1→v2 format fix.** RESOLVED RUNNING_ISSUES #76. Root cause: keep-alive ping at `kraken-websocket-adapter.ts:2767` sending v1-format `{event:'ping'}` to v2 endpoint (~21s cadence matched `PING_INACTIVITY_MS=20000`). Fix: `{method:'ping'}` per v2 spec, plus pre-emptive v1→v2 at `subscribeToBookChannel` L2292. Error stream STOPPED at deploy boundary. SHIPPED at HEAD `5ec57cbd3`. "Subscribed Symbols: 0" reframed NOT-A-BUG (empty positions table = position-gated I8C subscribe by design; B78.1 wiring ready). Original entry below for context: |
| _superseded_ | _Kraken WS subscribe fix_ | _Original B78.2 description (no longer authoritative; kept for change-log clarity)._ The kraken-websocket-adapter has been failing `subscribe` calls since 2026-04-03 (49K health-checks all show Subscribed Symbols=0; 142K "Method(s) not found" rejections). System functions on REST fallback + B74 archivers — but B78.1's EventEmitter wiring is wired-and-idle until upstream subscribe works. Compare ws-adapter's outbound JSON against current Kraken WS v2 subscribe spec; likely 1-line message-shape fix. **Per Langston Step-8 sequencing call:** must precede B79 Day 0 — without flowing ticks, B78.1 inversion isn't end-to-end-validated, and stacking xstock_spot on a broken WS path adds confounding variables to any B79 anomaly. ETA 1-2hr; won't materially delay B79. | None | YES |
| **B79** | 3-5 | Xstock_spot (Kraken XStocks Pro): **Day 0 — per-asset-class friction extraction** (was deferred from B78; folded here per no-deferrals directive). Then VTS evaluation + active-path wire-in (signal-orchestrator emit, paper-execution-engine admission, RTB insertion). Threshold derivation, regime mapping, strategy gates. 24/5 calendar handling. **Live-trading test deferred to Phase 19; VTS path is what gets behaviorally verified now.** | wire-in only (dormant for live trading until Phase 19) | medium |
| **B80** | 5-6 | Crypto_perp (Kraken Futures): same shape as B79 — VTS + active wire-in (dormant). Funding-rate handling joins macro modifier on perps. crypto_perp friction.ts populated (interface defined in B79 Day 0). | wire-in only | medium |
| **B81** | 6-7 | **Day 0 — filter-as-first-class promotion** (was deferred from B78; folded here per no-deferrals directive): each filter (`volume_min`, `price_min`, `spread_max`, `liquidity_min`, etc.) becomes a `module_name='filter:<name>'` row in `module_constants`; `pattern-pool-filters.ts` becomes a thin consumer reading from `module_constants` instead of holding TS constants. Then RTB ranking parity (`expectedNetReturnR` primitive). SQE asset-class threshold rows. Friction-normalized cross-asset opportunity scoring. Removes B78 re-export shims (RUNNING_ISSUES #73). | wire-in only | medium (was LOW pre-no-deferrals) |
| Slack | 7-8 | Bug-fix + Langston Step-8 second-pass on whichever batches need it. Buffer. | — | — |

**Inserted batches per Kyle directive 2026-05-09 (after B79.0a + B79.0b shipped):**

| Batch | Status | Description | Active-trading impact | Critical path? |
|---|---|---|---|---|
| **B79.0c** | NEXT (target: ship before Sun 2026-05-10 22:00 UTC ARCA reopen) | **24/7 xstock support.** Kraken Pro Phase 1 announcement 2025-12-03: 10 xstock_spot tokens trade 24/7 (TSLAx, QQQx, SPYx, NVDAx, CRCLx, AAPLx, HOODx, MSTRx, GLDx, GOOGLx). Our `isXstockMarketOpenUTC()` predicate is symbol-blind — returns false for ALL xstocks during the weekend window, blocking scanner/SQE/freshness/TEC for the 24/7 names too. Scope: add `XSTOCK_SPOT_24_7_SYMBOLS` constant set in `shared/asset-classes.ts`; modify `isXstockMarketOpenUTC(symbol?, now?)` to short-circuit-open for 24/7 names; update 4 callsites (scanner.ts:188 + signal_quality_evaluator.ts:181 + data-freshness.ts:95 + trailing-exit-controller.ts:648) to pass symbol; modify scanner to scan only the 10 names during weekend windows; SQE accepts signals for 24/7 names regardless of weekend; TEC continues stop-evaluation for 24/7 positions; boundary tests. **Both VTS and active-path** affected (active path wire-in remains dormant until Phase 19 but the codepath must handle 24/7 correctly). Possibly also addresses the silent-since-11:12-UTC xstock_spot WS archiver gap (under investigation). | wire-in only | YES (calendar-driven gate) |
| **B79.0d** | TARGET: in place before Sun 2026-05-10 22:00 UTC | **ORB strategy activation for xstock_spot (Kyle re-locked 2026-05-09 night).** NOT a new strategy from scratch. ORB skeleton already exists at `server/strategies/orb.ts` (B79 ship; Q-D-gated dormant via `module_constants.strategy_gates.xstock_spot.orb.enabled=false`). Scope: flip DB gate to true + register ORB in strategy-engine dispatch + verify regime-strategy map includes ORB for right xstock_spot regimes + Layer-1 default thresholds (opening-range minutes, breakout-confirmation R-multiple, vol-min, post-breakout retest gates) seeded into module_constants + integration tests + ablation registration. ORB doesn't apply to the 24/7 names (no "open"); applies cleanly to the 24/5 names at Sunday-reopen + weekday-open boundaries. **Both VTS and active-path** (active dormant until Phase 19). | wire-in only | YES (markets reopen Sunday) |
| **B79.0e** | After B79.0c+0d (low priority but tracked) | **xstock_spot/perp table rename `equity_*` → `xstock_*`.** B69 retagged the asset-class field VALUES (`equity_spot` → `xstock_spot`) but DB tables still use the legacy `equity_spot_ohlc_1m` / `equity_spot_ticker_snap` / `equity_perp_*` naming. This violates the B69 naming convention which explicitly preserves the `equity_*` namespace for FUTURE real (non-tokenized) equities — when real equities arrive, the table-name collision will be a real bug. Cross-cutting rename: shared/schema.ts (Drizzle ORM), shared/asset-classes.ts registry, 4 server scripts (B74 partition + B75 retention/rehydrate), drift-dashboard-aggregator, storage-client, passive-archive-bootstrap, scanner.ts + data-freshness.ts + 2 B79.0a scripts. DB cutover: `ALTER TABLE equity_spot_ohlc_1m RENAME TO xstock_spot_ohlc_1m` + sequence rename + index rename (1.2M+ rows; metadata-only operation, no data copy). Alias view for transition window + then cutover. Older drizzle migration SQL files keep legacy table names (historical record). Own scope+PIA+impl batch. | none (data path unchanged; table-name only) | low |
| **B79.4** | After B79.0c+0d | Extend B73 exit-strategy ablation framework to xstock_spot (parallel to crypto path; new dedicated UI tab per Kyle directive 2026-05-08; schema lift on aggregator key from `(regime, strategy)` → `(regime, strategy, asset_class)`). Captures Layer-3 evidence on xstock signals → drives later threshold/strategy calibration. Operational from t=0 with sparse data (empty windows expected during early observation, NOT bugs). | observation only | medium |

**No-deferrals directive impact on slack:** B78.1 consumes 1-2 days that were originally slack. B79/B81 each absorb a Day 0 prerequisite. Net stretch still fits within the 8-day window because B81 was originally rated "LOW critical path / most deferrable" — meaning it had room to absorb its Day 0. Risk if any single batch slips ≥2 days: tradeoff conversation with Kyle, NOT silent re-defer.

---

## §5. B78 — Modularization phase (Day 1-3)

**Goal:** structural refactor of `server/` so per-asset-class logic lives in proper modules. With this scaffolding, B79/B80 become "implement the xstock_spot module" and "implement the crypto_perp module" rather than "shoehorn new logic into crypto-shaped files."

**8-module target** (per `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` §V):

```
server/
├── asset_classes/                          ← NEW top-level module
│   ├── crypto_spot/
│   │   ├── filters.ts                      ← family-specific filter thresholds
│   │   ├── regime-thresholds.ts            ← classifier thresholds
│   │   ├── friction.ts                     ← per-pair fee + slippage model
│   │   └── index.ts                        ← public surface
│   ├── crypto_perp/                        ← scaffolded, populated in B80
│   │   └── (placeholder + index.ts)
│   └── xstock_spot/                        ← scaffolded, populated in B79
│       └── (placeholder + index.ts)
├── exchanges/
│   ├── kraken/
│   │   ├── ws-client.ts                    ← MOVED from server/services/
│   │   ├── futures-client.ts               ← MOVED (B74)
│   │   └── xstocks-client.ts               ← scaffolded
└── (existing folders unchanged)
```

**File moves (not behavioral changes):**
- `server/services/kraken-ws-*.ts` → `server/exchanges/kraken/`
- `server/config/pattern-filter-profile.ts` → `server/asset_classes/crypto_spot/filters.ts`
- `server/core/metrics/market-regime.ts` thresholds extracted into `server/asset_classes/<class>/regime-thresholds.ts`
- `server/utils/cost-model.ts` per-pair friction → `server/asset_classes/<class>/friction.ts`
- All callers updated to new import paths.

**Critical: zero behavioral change on crypto_spot.** Same code, different file paths. Verified via:
- `tsc --noEmit` clean.
- Unit suite green (existing 992 passing tests stay passing).
- Pre-flight + post-deploy ablation cadence query confirms no drop in `asset_class='crypto_spot'` row emit rate.

**Aggregator-query update (in same B78):** add `AND asset_class='crypto_spot'` to `drift-dashboard-aggregator.ts:1055` `computeFactorCalibration` WHERE clause. Locks calibration window to crypto_spot cohort regardless of future equity/perp data accumulation.

**Langston Step-2 ask:** review the import graph for cycles. The 8-module extraction can produce subtle circular imports between `core/metrics/market-regime.ts` and `asset_classes/crypto_spot/regime-thresholds.ts` if I'm not careful. He should pull the dep graph in his review.

**Risk:** medium-low. ~50-80 file moves. Each move + import update is mechanical. CI catches breakage.

---

## §6. B79 — Xstock_spot (Kraken XStocks Pro) into VTS (Day 4-5)

**Pre-existing infrastructure to verify (not rebuild):**
- Kraken XStocks pairs already scanning + archiving (Kyle confirmed 2026-05-07).
- B69 asset-class plumbing live: `resolveAssetClass(symbol, 'kraken')` returns `'xstock_spot'` for XStocks pairs (verify in pre-audit).
- `regime_factor_alternates` already accepts `asset_class='xstock_spot'` (no schema change).

**What's new in B79:**

### §6.1 Operational facts about Kraken xStocks (from web research 2026-05-07)

- **Tokenized equities**, 1:1 backed by underlying stocks/ETFs.
- **Fractional buying supported** down to **$1 minimum**. Same sizing semantics as crypto — no "must buy whole share" constraint. Position-sizing convention from crypto carries over: $1000 base → ~$150/trade.
- **Trading hours: 24/5** (24h Mon-Fri, closed weekend). NOT 24/7. **VTS must pause xstock_spot evaluations on weekends** to avoid stale-price evaluations and false signals during the gap.
- **Settlement: Solana on-chain** (SPL tokens). Affects Phase 19 active trading wire-in (custody / withdrawal / transfer) but NOT VTS.
- **100 listings as of 2026-05-07**, growing toward 500 by year-end. Pair list is dynamic.
- **Geographic restriction:** not accessible US/Canada/UK/Australia. Kyle in UAE — clear.

**Action item:** weekend-pause logic is the only NEW execution-flow concern for VTS. Implementation: SQE evaluation gate checks `assetClass==='xstock_spot' && isWeekendUTC()` early-return with a `pairsSkippedWeekendClosure` null-reason counter. ~10 LOC.

### §6.2 Threshold derivation — three-layer approach

**Layer 1: Domain-knowledge baseline (Day 4 morning, 1-2h):**
- Xstock_spot intraday ATR%: ~0.5-2% vs crypto's 2-8% → halve volatility-regime thresholds for xstock_spot.
- Tighter spreads (~5-15 bps vs crypto's 10-50 bps) → friction model uses tighter spread distribution.
- Trends slower-moving but more persistent → ADX threshold can drop 25-30 → 15-20 because trends are weaker but more reliable.
- DI threshold tighter (less directional noise).
- Volume profile U-shaped (open + close peaks, midday flat) → liquidity_min threshold time-of-day aware.

**Layer 2: Cross-asset shadow-classify (Day 4 afternoon, 2-3h):**
- Run `calculatePairRegime` on xstock_spot historical OHLC (B70 archive has this since 2026-05-04).
- Inspect 100-200 historical bars per pair across 10-15 representative XStocks pairs (AAPLx, NVDAx, MSFTx, SPYx, QQQx, etc.).
- TFS detection sanity check: does it fire on clearly-trending stocks (AAPL Q1 2024-style behavior) without firing on whipsaws?
- RBS sensitivity check: stocks tend to range-bound midday — does RBS over-fire? If yes, tighten RBS confidence threshold for xstock_spot.
- Output: `asset_classes/xstock_spot/regime-thresholds.ts` with deltas vs crypto baseline.

**Layer 3: Shadow-mode VTS collection (Day 5-7, ongoing during B80/B81):**
- VTS evaluates xstock_spot signals in shadow mode (no admission, no active trades).
- 48-72h window collects: signals/day per pair, regime distribution, factor lift comparable to crypto baselines.
- Calibration discipline matches B67.4 — tertile-monotonic WR + ≥7pp HIGH-LOW gap gate before Phase 19 considers active.
- Compressed to 48-72h vs crypto's 14-day windows because thresholds start from a known-correlated baseline rather than scratch.

### §6.3 Strategy gates per asset class

`MULTI_FAMILY_ELIGIBILITY` map in `canonical-regime-strategy-map.ts` is asset-class-agnostic in v1. For xstock_spot:
- `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce` should map cleanly. Same regime detection inputs (OHLC + ADX + momentum) work on equity bars.
- `liquidity_trap`, `dhma`, `abcd_long` may not detect properly — pattern-based, depends on crypto-specific microstructure. **B79 Step-2 audit:** pattern-match each strategy's detect logic against equity behavior; either keep or scope-disable per asset class.
- New module_constants rows: `module='strategy.<key>', asset_class='xstock_spot'` for any threshold that varies. Most-specific-wins resolver picks them up automatically.

### §6.4 SQE evaluation per asset class

`sqe_config` module already supports `asset_class` resolution dimension (B69). New rows seeded:
- `sqe_config.di_min` for `asset_class='xstock_spot'`: tighter than crypto (e.g., 15-20 vs 25-30).
- `sqe_config.adx_min` for `asset_class='xstock_spot'`: 15-20 vs 25-30.
- `sqe_config.momentum_min` for `asset_class='xstock_spot'`: scaled by ATR% ratio.

NO code change to SQE itself. Just module_constants seeds.

### §6.5 Friction model per asset class

`server/asset_classes/xstock_spot/friction.ts` — fees + slippage tuned for tokenized equities. Kraken XStocks fee schedule per pair (need to verify on-chain Solana settlement adds anything beyond Kraken's spread). Spread distribution from B70 archive (already capturing tick data).

### §6.6 Numbered objectives for B79

1. Weekend-pause logic in VTS evaluation gate.
2. Xstock_spot threshold rows seeded in `module_constants` (regime, sqe, friction).
3. Strategy detect functions audited against equity microstructure; non-applicable strategies scope-disabled per asset class.
4. VTS shadow-mode emits xstock_spot signals into `signal_eval_archive` AND `regime_factor_alternates` (no admission).
5. Verify `asset_class='xstock_spot'` rows accumulating in both archive tables.
6. Verify NO impact on `asset_class='crypto_spot'` row cadence (no-touch fence).
7. Governance + Langston MEMORY sync.

---

## §7. B80 — Crypto_perp (Kraken Futures) into VTS (Day 5-6)

Same shape as B79. Specific deltas for perps:

### §7.1 Funding rate as macro-modifier input

Perps have a **funding rate** that periodically transfers between long and short holders. Crypto_spot doesn't have this. The macro modifier (B67.1) already includes a funding-rate term but it operates on aggregate funding (BTC + ETH funding z-score) for crypto_spot context. For perps, the PER-PAIR funding rate is a stronger directional signal:

- Long perp + negative funding = paid to hold long, but mean-reversion pressure (shorts crowded).
- Long perp + positive funding = paying to hold long, trend-confirmation signal.

**B80 design:** add a per-pair funding-rate term to crypto_perp's macro modifier resolution. New `asset_classes/crypto_perp/macro-extension.ts` that augments B67.1's modifier output with per-pair funding when `asset_class='crypto_perp'`. NOT a new factor — extends existing one. Stays out-of-scope for the chain-final calibration framework (no new ablation kind needed).

### §7.2 Other perp deltas

- Position sizing: same dollar-amount as crypto_spot ($1000 base → $150/trade).
- 24/7 trading (same as spot crypto). No weekend pause.
- Settlement: synthetic perpetual contracts (no on-chain custody). Phase 19 active wire-in handles funding-rate auto-payment.
- ATR profile: similar to crypto_spot. Inherit thresholds with cross-asset shadow-classify validation.

### §7.3 Numbered objectives for B80

1. Crypto_perp threshold rows seeded.
2. Funding-rate per-pair extension to macro modifier.
3. VTS shadow-mode emits crypto_perp signals.
4. `asset_class='crypto_perp'` rows accumulating.
5. No-touch fence holds.
6. Governance + Langston MEMORY sync.

---

## §8. B81 — RTB ranking parity + SQE asset-class evaluation (Day 6-7)

**This section captures the RTB ranking parity design Kyle wants iterated to consensus with Langston before B81 implementation begins.**

### §8.1 The current state — why it doesn't level the playing field

Current `computeRankingScore` in `server/config/ranking-weights.ts`:

```ts
score = predictiveConfidence × regimeWeight + CONTEXT_BONUS
```

Both `predictiveConfidence` and `regimeWeight` are dimensionless [0,1]. CONTEXT_BONUS is a fixed adder. Mathematically asset-class-agnostic.

**The selection bias** comes from friction. A crypto signal at 0.7 confidence and 1R target = ~50bps net edge after fees + slippage. An equity signal at 0.7 confidence and 1R target on a tighter-spread XStock = ~80bps net edge. **Equities will systematically outrank crypto** if we don't level on net-expected edge.

### §8.2 The B81 fix — `expectedNetReturnR` primitive

Introduce a friction-adjusted return metric as the ranking primitive — not raw confidence.

```ts
// Per-signal compute at admission time:
const expectedNetReturnR =
  ((targetPrice - entryPrice) / atr)      // gross R-multiple from geometry
  - friction_R(asset_class, pair);        // friction expressed in R-units

// Pool-relative normalization within the current admission cycle:
const pool = currentRTBPool;
const minNetR = Math.min(...pool.map(s => s.expectedNetReturnR));
const maxNetR = Math.max(...pool.map(s => s.expectedNetReturnR));
const normalizedNetR =
  maxNetR > minNetR
    ? (expectedNetReturnR - minNetR) / (maxNetR - minNetR)
    : 0.5; // pool-uniform fallback

// Final ranking score:
score = predictiveConfidence × normalizedNetR + CONTEXT_BONUS;
```

**Properties:**
- `friction_R(asset_class, pair)` reads from `asset_classes/<class>/friction.ts` (per-asset-class friction model). Already exists in shape via `cost-model.ts`; B78 modularization extracts it cleanly.
- Pool-relative normalization means the BEST opportunity in the current admission window scores 1.0 on the net-return axis regardless of asset class. Crypto wins when it's the best crypto OR the best multi-class opportunity. Equities win on the same basis.
- `predictiveConfidence` axis is unchanged (chain-final modulated confidence, B76).
- CONTEXT_BONUS unchanged (regime-pool fit bonus from B22).
- `regimeWeight` factor REMOVED from this formula because confidence-modulation already absorbed regime-fit (post-B67/B68 chain).

### §8.3 SQE asset-class evaluation

SQE primary admission gates (DI, ADX, momentum floor) need asset-class-scoped thresholds. Already supported by `module_constants.sqe_config` per-`(exchange, asset_class, strategy, regime)` resolution. B81 ships:
- New `sqe_config` rows for each `asset_class IN ('xstock_spot', 'crypto_perp')` × each gate.
- NO code change to SQE itself. SQE already reads from module_constants per scope. Verifies it works in shadow mode for new asset classes during B79/B80.

### §8.4 Open architectural questions (Langston review at B81 Step-1)

1. **Pool-relative vs absolute normalization:** pool-relative means rankings shift as the pool composition changes. Cleaner alternative: absolute scale `expectedNetReturnR / typical_winning_R(asset_class)`. Pool-relative is simpler; absolute is more interpretable in dashboards. Langston should weigh in.
2. **CONTEXT_BONUS asset-class scoping:** does the regime-pool fit bonus translate cleanly to xstock_spot? CONTEXT_BONUS rewards signals that match the global regime context. Whose global regime — crypto's or equity market's? B81 Step-2 audit needs to surface this. Probably needs per-asset-class context bonus values.
3. **Position-sizing parity:** $1000 base → $150/trade works for crypto and tokenized equities (same fractional sizing). Does it work for perps too (~10x leverage native to perps)? Default to "yes, same dollar notional" but flag for Langston review.
4. **Friction in R-units vs $:** R-units make ranking comparable; $ makes P&L direct. Probably store both, rank on R, P&L-track on $.

### §8.5 Numbered objectives for B81

1. `expectedNetReturnR` computed at signal admission per signal in RTB pool.
2. Pool-relative normalization within RTB cycle.
3. New ranking formula deployed; old formula removed (no fallback).
4. SQE asset-class threshold rows seeded for xstock_spot + crypto_perp.
5. Verify: VTS RTB pool ranks signals across asset classes by friction-adjusted opportunity score.
6. Verify: no-touch fence holds. crypto_spot ranking behavior changes ONLY in the friction-normalization, not in confidence math.
7. Governance + Langston MEMORY sync.

---

## §9. Threshold-derivation cross-reference table (for §6, §7, §8 use)

This is what gets populated as we work through B79/B80 thresholds. **Update this table at the close of each batch.**

| Threshold | crypto_spot (locked) | xstock_spot (B79) | crypto_perp (B80) | Source / rationale |
|---|---|---|---|---|
| `regime.adx_min_tfs` | 25 | TBD (~15-20) | inherit crypto_spot | B79 Layer 2 shadow-classify |
| `regime.adx_min_ie` | 30 | TBD | inherit | same |
| `regime.volatility_high_threshold` | TBD | halve | inherit | ATR% delta |
| `sqe_config.di_min_quant` | 25 | TBD (~15-20) | inherit | B79 Layer 1 domain |
| `sqe_config.di_min_pattern` | 10 | TBD (~8-12) | inherit | same |
| `sqe_config.adx_min` | 25 | TBD | inherit | same |
| `sqe_config.momentum_min` | 0.005 | TBD (~0.002) | inherit | scaled by ATR% ratio |
| `friction.spread_bps_default` | 25 | TBD (~10) | TBD | B79/B80 §6.5/§7 friction models |
| `friction.fee_bps_taker` | 26 | TBD (~26 same) | TBD | Kraken fee schedule per asset class |
| `b67_1_macro_modifier.funding_weight` | 0.03 | n/a (no funding) | extended (per-pair) | B80 §7.1 |
| Weekend evaluation pause | n/a | TRUE | n/a | B79 §6.1 |
| 24/5 vs 24/7 calendar | 24/7 | 24/5 | 24/7 | B79 §6.1 |

---

## §10. Risks + dependencies

**Top 3 risks:**

1. **Modularization import cycles (B78).** Files moved between modules can produce circular imports that work in development but break under production-mode tree-shaking. Mitigation: `tsc --noEmit` clean is necessary but not sufficient; CI Build job (Vite production build) must also pass. If Build job fails on B78 push, halt + revert.

2. **Equity strategy detect-logic mismatches (B79).** Some strategies (`liquidity_trap`, `dhma`, `abcd_long`) are tuned for crypto microstructure. They may detect false positives on equities (different intraday volume profile, different gap behavior). Mitigation: B79 Step-2 audit reviews each strategy's detect logic against representative equity OHLC; non-applicable strategies are scope-disabled per `asset_class` rather than re-tuned. Conservative: ship B79 with only the 6 well-understood strategies (vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride, vwap_bounce); revisit the 3 pattern-heavy ones in a follow-up.

3. **Crypto_spot calibration window contamination (B78-B81).** Any code change that touches the chain-final ablation framework on crypto_spot can drift the lift measurements. Mitigation: no-touch fence per §3, mandatory pre-flight + post-deploy SQL check, hard-coded "do-not-edit" list in §2.

**Dependencies:**

- B78 → B79, B80, B81 (modularization scaffolding required).
- B79 ↔ B80 (independent; can run in parallel if ambitious).
- B79 + B80 → B81 (RTB parity assumes both new asset classes are emitting signals).
- B81 → Phase 19 (active trading uses the new ranking primitive).

---

## §10b. B78.1 design (cycle break — DI inversion)

**Goal:** Break the `kraken-websocket-adapter.ts ↔ live-pricing-adapter.ts` bidirectional import cycle (madge cycle #10 of 47, confirmed B78 pre-flight) BEFORE moving ws-adapter into `server/exchanges/kraken/`. Result: ws-adapter becomes a clean leaf in the exchange layer, live-pricing remains in services/ as the cross-source price abstraction.

**Current shape:**
- `kraken-websocket-adapter.ts:3` imports `livePricingAdapter` from `./live-pricing-adapter.js`.
- `live-pricing-adapter.ts:6` imports `krakenWebSocketAdapter` from `./kraken-websocket-adapter.js`.
- Cycle is invisible today because both intra-package; ESM tolerates intra-package cycles via mutable bindings.

**Target shape (event-emitter inversion):**
- `kraken-websocket-adapter.ts` extends `EventEmitter` (or exposes `.on('priceTick', cb)` surface). Emits events when it receives Kraken WS price ticks. **Imports nothing from live-pricing-adapter.**
- `live-pricing-adapter.ts` at startup calls `krakenWebSocketAdapter.on('priceTick', ...)`. Subscribes once. **No call sites from ws-adapter back into live-pricing.**
- ws-adapter MOVES to `server/exchanges/kraken/kraken-websocket-adapter.ts` (the original B78 plan, now safely possible).

**Behavioral verify (required — this is data-feed surgery, NOT pure refactor):**
1. PM2 log side-by-side diff against pre-deploy baseline (~10 min window). Tick counts per pair must match within tolerance (price-tick rate is high; exact match unrealistic but order of magnitude must hold).
2. VTS scan loop (30s) must continue evaluating without missed cycles.
3. `live-pricing-adapter` price freshness metric (if exists) within normal range.
4. No-touch fence post-deploy SQL: ablation cadence on crypto_spot must hold (B78 baseline ~24/factor/hr post-recovery).

**Risks:**
- **EventEmitter listener leak:** if subscriber is registered multiple times (e.g. on hot-reload), tick callback runs N times. Mitigation: subscription is registered ONCE at module-load; documented invariant.
- **Subscription order race:** if live-pricing subscribes BEFORE ws-adapter is initialized, no events flow. Mitigation: ws-adapter initializes synchronously at import time; live-pricing import order in `index.ts` startup chain ensures correct ordering.
- **Behavioral drift in error paths:** today, errors propagate through the direct method-call chain; with events, errors in subscribers don't bubble back to ws-adapter. Mitigation: subscriber wraps callback in try/catch + logs; ws-adapter doesn't depend on subscriber success.

**Out of scope for B78.1:**
- Generalizing the event-emitter pattern to other adapters (Binance, etc.) — when those land.
- Funding-rate WS feed (B80 territory).
- Active-trading order placement events (Phase 19).

---

## §10c. Phase 24 commitments locked 2026-05-08 (Kyle directives)

These are corrections + locked-in commitments from the 2026-05-07 evening / 2026-05-08 morning session post-B79 ship. They drive sub-batches B79.4 + B79.TEC (or whatever number lands per CC/Langston sequencing call) and update the workflow doc Section F + I.

### §10c.1 NO PATCHES doctrine (CLAUDE.md §5 #15 added)

Every fix and feature must be a long-term, sustainable, stable, scalable solution. No duct tape. No "good enough for now." No "yeah it sometimes fires accidentally." Surfaced bugs trigger root-cause investigation + design-then-implement, not patches. **Cold-start warmup is acceptable** (1-5 minute deterministic startup beats instant-on with stale-cache races). Production restarts will be infrequent — sacrifice immediate functioning for clean startup. **Every architecture decision discussed gets documented BEFORE implementation** in the relevant governance doc (scope / plan / workflow / RUNNING_ISSUES / roadmap) the same session it's discussed. Verbal commitments without paper-trail are rejected.

### §10c.2 Backpressure policy revised — vertical-scale, never asset-class shedding

Previous scope §11.2 said "skip xstock cycles when overloaded." **Wrong.** Asset-class shedding is a load-shedding cop-out, not a strategy. Corrected policy:

- **First-line response:** computational-distribution refactor IF possible without weeks of work (e.g. cycle interleaving, off-hour batching, smarter scheduler tick allocation across asset classes). If a cleaner distribution is identifiable + bounded in implementation effort, do that.
- **Default response:** vertical scale. Hetzner CPX22 → CPX31 → CCX23 / Supabase Pro tier upgrade. Predictable cost steps ($30-100/mo), fast change, no architectural risk. **The tier upgrade is the answer when there's no smarter distribution available.**
- **NEVER:** drop asset-class scanner cycles, throttle scan cadence on a live asset class, defer telemetry writes silently. Resource ceilings are infrastructure problems with infrastructure solutions.

The pre-deploy 1.3× synthetic load test becomes a **sizing decision-gate**: it tells us "are you on the right tier for this asset class to ship?" — not "can we squeeze it in?" If headroom <30% on any surface (CPU / memory / DB connections / API rate / log throughput) at projected post-deploy load, gate is **upgrade hardware tier before ship**.

`[B79][RESOURCE_PRESSURE]` log line stays as a TELEMETRY signal that triggers a hardware-upgrade evaluation, not as a runtime drop-cycles action.

### §10c.3 TEC configuration per-asset-class — proper architecture, not a patch

The B79 ship surfaced that BE-latch is firing for new trades despite `break_even_enabled = 'false'` (DB wildcard row). Two structural issues:

1. **TEC config resolution hardcodes `assetClass: 'crypto_spot'` at `trailing-exit-controller.ts:104`** — even though `module_constants` supports asset_class scoping with most-specific-wins, the TEC never asks for a per-asset-class lookup. Once we onboard xstock_spot trades that flow through TEC, they get the crypto config silently. Wrong.
2. **`cachedConfig` initial value is `TEC_DEFAULTS` (with `breakEvenEnabled: true`) until first async call refreshes it.** `primeTECConfig()` exists for cold-start warmup but is never called by app bootstrap. Sync `updatePosition` reads stale defaults during the warm-up window. Combined with #1, NEW trades after PM2 restart can BE-latch incorrectly.

**Locked architectural fix (no patch):**
- TEC config cache becomes per-asset-class: `Map<AssetClass, TrailingExitConfig>`
- `resolveTECConfig` accepts `assetClass` parameter; `updatePosition` plumbs `update.assetClass` through
- `primeTECConfig()` called in app bootstrap for ALL registered asset classes (warm cache for crypto_spot + xstock_spot pre-first-trade)
- Per-asset-class DB rows seeded: `(trailing_exit, *, crypto_spot, *, *, break_even_enabled) = false` (current Variant K winner) + `(trailing_exit, *, xstock_spot, *, *, break_even_enabled) = false` (Day 1 default; flip after B73 exit-strategy ablation evidence per §10c.4)
- Wildcard `(*, *, *, *)` row for `break_even_enabled` removed once all live asset classes have explicit rows. No silent fallback.
- TEC defaults (`TEC_DEFAULTS.breakEvenEnabled`) revisited — fail-closed (false) for the warmup window even if cache miss, since fail-open silently re-enables a behaviorally-disabled feature

**The 4 zombie BE-latched trades** in `/tmp/trailing-states.json` from 2026-04-25 era (Q/USD, RAIN/USD, UMXM/USD, RENDER/EUR) are LEFT AS-IS per Kyle directive 2026-05-08. They run through their existing state to natural close. Not worth clearing.

**Sequencing:** B79.TEC (whatever batch number CC/Langston settle on — could be a Phase-24 sub-batch alongside B79.0a, or its own slot) carries the architectural fix. Iterates with Langston Step 1 design review before implementation.

### §10c.4 Exit-strategy ablation extended to every new asset class — workflow standard

The B73 exit-strategy ablation framework (12 variants: BE A-F + Trail G-J + Combined K-L, `exit_strategy_alternates` table with asset_class column from B69) currently observes crypto_spot only. Extending to xstock_spot was missing from B79's plan. **Now locked as part of every new asset class onboarding:**

- **Workflow doc Section F (Layer 1/2/3 protocol)** updated to say: every new asset class gets BOTH (a) factor-calibration ablation (existing B67.0 framework) AND (b) exit-strategy ablation (B73 framework) running during shadow-mode observation. Both deliver Layer 3 evidence; calibration drives confidence-modifier decisions, exit-ablation drives BE/trail/target-only decisions per asset class.
- B73 hook in `vts-service.persistRealPriceTrade` is asset-class-agnostic in framework — extending to xstock_spot is one new emit-call + per-asset-class aggregator (parallel to drift-dashboard which is currently B78-scoped to crypto_spot). No replacement of crypto's B73 — it's a parallel add.
- **Per-asset-class observation period.** Crypto's standard is 14 days for B67/B68 calibration windows + 2 weeks for B73 exit ablation. xstock_spot may be different — equities trade 24/5 (~80hr/wk) vs crypto 24/7 (168hr/wk), so equivalent sample volume takes longer wall-clock. Workflow doc adds a Section F.X "Observation Period Sizing" subsection where each new asset class declares its target sample-count + matching wall-clock estimate. xstock_spot Day 1 estimate: TBD, populated during PIA when sample-rate-per-day evidence accumulates first 24-48h post-live-wire.

**Sequencing:** B79.4 (already in scope as "equity exit observation calibration") carries this deliverable. Was underspecified; now explicit per this entry.

### §10c.4b Phase 24 sub-batch sequencing LOCKED (Langston design call 2026-05-08 07:44 UTC)

After CC's condensed design ask + Langston's architectural reply (relayed verbatim to Telegram), Phase 24 sequencing locked:

1. **B79.TEC FIRST** — per-asset-class TEC config + `primeTECConfig` at bootstrap + per-class DB rows + fail-closed defaults. Before B79.0a live wire-in.
2. **B79.0a** — live xstock scanner via `centralClock` + ARM constructor injection + Q-D AAPLx-vs-AAPL yfinance probe + Step-4 N2-N4 cleanup.
3. **B79.4** — extend B73 exit-strategy ablation to xstock_spot (parallel panel, NOT replacement of crypto). Per-asset-class observation period sizing.
4. **B79.1/.2/.3/.5/.6/.x** — per scope §-1 (observation-triggered).

**Why B79.TEC first** (Langston counter to CC's lean of B79.TEC AFTER B79.0a):
> "CC's 'benign window' argument relies on crypto's BE value coinciding with xstock's Day 1 value. True for `break_even_enabled` — doesn't extend to the rest of TEC config (trailing ATR multipliers, lock thresholds, etc.). xstock's Day 1 row will likely copy crypto's params as starting placeholders, but routing xstock through the hardcoded-crypto path is architecturally wrong even when values happen to match. Kyle locked NO PATCHES yesterday; sequencing that depends on value coincidence is exactly the reasoning that doctrine guards against. Also: xstock's earliest VTS observations are the B79.4 baseline. Running them on a hardcoded-crypto path — even briefly — contaminates the data ablation will need."

CC concedes. The architectural rule: don't route a new asset class through hardcoded-other-class config even briefly, regardless of whether values happen to coincide.

### §10c.4c B79.4 design flags (Langston call-outs 2026-05-08 + Kyle UI directive 2026-05-08)

Three flags on B79.4 scope before formal scope-doc draft:

1. **`exit_strategy_alternates` aggregator key likely needs a schema lift** from `(regime, strategy)` → `(regime, strategy, asset_class)`. Non-trivial migration. Must be called out explicitly in B79.4 scope doc — not a minor wiring task. (Langston flag.)
2. **xstock panel operational from t=0 with sparse data.** Empty observation windows during early Layer 3 are EXPECTED, not bugs. Workflow doc Section G "Forward-Watch" should make this explicit so the panel isn't mis-flagged as broken when sample-count is low in the first 24-72h. (Langston flag.)
3. **xstock_spot ablation UI gets its OWN dedicated tab on the staging server, NOT stacked under the existing Drift Dashboard tab** (Kyle directive 2026-05-08). The current Drift Dashboard tab is already long with multiple crypto-scoped tables (Factor Calibration, Factor Ablation Comparison, Exit Strategy Ablation, Regime Distribution, Family Flicker, RBS Drift, DBS Distribution, Global DBS). Adding xstock-equivalent panels to that same tab makes it unwieldy. **New tab name TBD in B79.4 scope** — likely "Multi-Asset Observation" or "xStock Observation" — containing both the xstock-scoped factor-calibration ablation panel AND the xstock-scoped exit-strategy ablation panel side-by-side. Crypto's existing Drift Dashboard tab stays unchanged. Pattern locks into the workflow doc Section D / Section H — every new asset class onboarding gets its own dedicated observation tab, not appended to existing tabs.

### §10c.4d B79.TEC architectural refinements LOCKED (Langston Q1-Q5 reply 2026-05-08 08:03 UTC)

Reply lives at `Claude Comms and Packages/Langston Design Asks/B79_TEC_design_ask_rev1_reply.md` (10032 bytes, verbatim Telegram-relayed in 3 chunks). Five locked refinements over CC's architectural lean — all to be reflected in upcoming B79.TEC scope-doc draft + PIA + System Manual entry:

**Q1 cache structure:**
- `Map<AssetClass, TrailingExitConfig>` confirmed.
- `resolveTECConfig(assetClass: AssetClass): TrailingExitConfig` — drop optional `strategy?` / `regime?` params from CC's lean (decorative if not in cache key; future strategy/regime axes is a refactor batch, not a backdoor signature extension).
- Snapshots immutable wholesale (refresh on TTL, not per-field invalidation). "When was this snapshot taken" has a single answer per class.
- Document the intentional limitation in scope doc + System Manual: "Strategy and regime axes are intentionally NOT cache keys — current TEC params are policy-level per asset class."

**Q2 cold-start ordering:**
- primeTECConfig BEFORE loadTrailingStates. Definitively.
- Canonical boot order: (1) DB connectivity → (2) primeTECConfig populates cache for ALL registered classes (and HARD-FAILS if any class's row not found — see Q3) → (3) loadTrailingStates rehydrates open trade states from disk → (4) market data feed connects → (5) updatePosition becomes callable.
- **State vs config rehydrate boundary** written into scope doc: `state.*` (`breakEvenLatched`, peak price, trailing-active flag) rehydrate from disk verbatim — path-dependent on the trade's lived history; `config.*` (whether to latch, trailing multipliers, lock thresholds) re-resolve from current DB rows on rehydrate. Practical effect: trade open through a config change continues with accumulated state but its policy gates reflect operator's current intent. Matches Kyle changing module_constants meaning "apply going forward, including in-flight trades."

**Q3 fail-closed default flip:**
- `TEC_DEFAULTS.breakEvenEnabled` default flips `true` → `false`. Asymmetric risk: accidentally-on costs real money on BE-stopped trades meant to ride through pullbacks (current state); accidentally-off is degraded but functional TEC.
- Fail-closed default is NOT a silent fallback per CLAUDE.md §11 — it is explicit, documented, intentional safe-state for a pathological condition. primeTECConfig is the deterministic path that should make the default unreachable in normal operation.
- "Log loud" defined operationally:
  - `console.error('[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for assetClass=X reason=Y')` — grep-friendly prefix in PM2.
  - Health endpoint returns degraded status until primeTECConfig succeeds for ALL registered classes — failure visible at ops surface, not buried in PM2 logs.
  - Cache-miss path in `resolveTECConfig` ALSO logs loud (not silently return defaults) — missed asset class produces visible signal, not quiet behavior change.
- **`[KYLE_DECISION]` open question:** should app boot HARD-FAIL if primeTECConfig fails, or boot in degraded mode? Langston lean: production hard-fail; dev tolerates degraded boot for iteration speed via env flag `TEC_BOOTSTRAP_REQUIRED=true` (prod) / `false` (dev). Surfaced for Kyle's call before scope-doc lock.

**Q4 zombie trades during transition:**
- Substantive answer agreed: 4 zombies retain `breakEvenLatched=true`, line-503 latch-gate skips because already-latched, BE-stop fires on price reversal, trades close per Kyle's directive.
- Audit must LINE-CITE not assume (lesson from BUG-2026-05-06-A in CHANGES_AND_FIXES). PIA acceptance criteria:
  - Cite exact conditional at latch gate (file:line, quoted code)
  - Cite BE-stop exit logic separately (file:line, quoted) — must NOT consult `config.breakEvenEnabled`
  - Grep-confirm `config.breakEvenEnabled` checked at exactly one site (the latch gate), not multiple sites
- Adjacent risk flagged (NOT B79.TEC scope): other state-vs-config entanglements in TEC (trailing-active flag, lock-threshold-hit flag, etc.). If PIA surfaces any, log to RUNNING_ISSUES as candidate for future batch — do NOT scope-creep into B79.TEC.

**Q5 wildcard-row removal migration:**
- Two-step retained. CC's writeup said "operational `scripts/` UPDATE that DELETEs" — make it `DELETE` cleanly.
- Step 2 idempotent + signature-guarded:
  - Pre-check `SELECT COUNT(*)` returns exactly 1 (assert, abort if 0 or >1)
  - Capture row before DELETE for rollback (`SELECT * INTO log` or equivalent)
  - DELETE with signature WHERE clause: `AND value = false AND created_at < <step1_deploy_timestamp>` so we're not deleting a freshly-inserted wildcard
- Verification gate between Step 1 + Step 2:
  - Instrument resolveTECConfig with resolution-path-by-class counter / log line
  - After Step 1 deploys, monitor for `[TEC]` resolution events
  - Confirm resolution hits explicit-class rows for crypto + xstock, never falls through to wildcard
  - Telemetry, then act. Audit-then-cut.
- **Minimum 48-hour gap** between Step 1 deploy and Step 2 execution. Resource-cheap insurance. Captures full intraday cycle + ideally one weekend liquidity behavior window.
- Rollback path documented in Step 2 script header: "If this DELETE turns out wrong, run `INSERT INTO module_constants (...) VALUES (<captured row>);`."

**Next:** CC drafts formal B79.TEC scope-doc + PIA reflecting all 5 refinements. Kyle answers Q3 `[KYLE_DECISION]` (hard-fail vs degraded boot) before scope-doc lock. Langston greenlights scope before any code.

### §10c.4e Boot Readiness Coordinator DEFERRED to Phase 19 (Kyle directive 2026-05-08)

CC surveyed the current boot architecture and found it is a patchwork: 12 separate bootstrap files in `server/startup/`, 8 separate health/monitor files in `server/services/`, the existing SystemHealthMonitor itself broken (`startPeriodicChecks is not a function` per PM2 logs), bootstraps run AFTER `server.listen()` so the app accepts traffic before subsystems are ready, and per-component error-handling is inconsistent (B74/B70 catch-and-continue, others throw, others silently degrade).

CC proposed building a unified Boot Readiness Coordinator as its own batch BEFORE B79.TEC, citing NO PATCHES doctrine.

**Kyle directive 2026-05-08:** Defer the Boot Readiness Coordinator to **Phase 19** (Paper Mode Audit). The TEC bootstrap is no bigger of an issue than any other subsystem during the patchwork era. For B79.TEC specifically, ship with **hard-fail-on-boot** (no env-flag carve-out — both production and dev hard-fail). If patchwork issues compound during Phase 19 paper-mode testing, address them then with the coordinator design.

**Q3 [KYLE_DECISION] — RESOLVED:** TEC hard-fails on boot if `primeTECConfig` fails for any registered asset class. No degraded-boot path. No env flag. Same behavior in production and development. App refuses to start until DB connectivity + module_constants warmup succeed for all registered classes.

**Phase 19 follow-on:** Boot Readiness Coordinator is added to `POST_AUDIT_ROADMAP.md` as a Phase 19.x sub-phase deliverable (number TBD when Phase 19 work formally begins). Scope: unified coordinator registering all critical subsystems with declared dependencies + readiness checks + diagnostic providers + smart-wait-with-ETA + single consolidated status surface. Replaces the patchwork of 12 bootstrap files + 8 health monitors. Fixes the broken SystemHealthMonitor. Enforces "all-green-before-traffic" gate.

**Why deferring is acceptable:** the patchwork has been running for many batches. We are not at the point where we have hard data showing it's the cause of recurring failures. B79.TEC's hard-fail handles its own correctness regardless of the broader boot architecture. If Phase 19 surfaces compounding issues, the coordinator becomes urgent; if not, it ships as planned cleanup work.

### §10c.6 Oscillator family-filter removal (Kyle directive 2026-05-14)

**Decision:** the `oscillator` filter-family is an architectural orphan and gets removed as a Phase 24 follow-up batch (sub-batch identifier TBD when sequenced — likely B79.0p or similar, after the xStocks UI sprint closes).

**Background:** Audit 2026-05-14 confirmed `FILTER_FAMILIES` (server/config/canonical-regime-strategy-map.ts:847) includes `'oscillator'`, DB has `vts_oscillator` + `active_oscillator` rows with active thresholds for both `crypto_spot` and `xstock_spot`, and pairs ARE evaluated against the gate — but `STRATEGY_FAMILY_MAP` (line 806) has **zero strategies tagged `oscillator`**. Pairs that pass `vts_oscillator` and no other family lane dead-end at strategy iteration. The orphan has existed since pre-Phase-24; it became visible during xstock filter-diagnostics audits.

**Langston's call (2026-05-14, recorded via 3-step protocol):** Option 2 — remove the family entirely. Rejected Option 1 (add a real oscillator strategy — would be 1-2 batch effort with detect signature + parameter discovery + SIM coverage + backtest + ML hooks; no proven net-EV gap demands a 19th strategy now; placeholders violate NO-PATCHES). Rejected Option 3 for this batch (retag a "reversal"-tagged strategy to `oscillator` — Langston pushed back that `range_trade` is range-detection not oscillator-archetype; the actual oscillator candidate is `mean_reversion`, but retagging changes IMF lane routing and needs SIM coverage; park as separate future question).

**Surface area for the removal batch:**
1. `server/config/canonical-regime-strategy-map.ts:804` — drop `'oscillator'` from `StrategyFamily` union (TS compiler will surface any orphan literal references)
2. `server/config/canonical-regime-strategy-map.ts:847` — drop from `FILTER_FAMILIES` (5 → 4 lanes: trend / reversal / breakout / strong_trend)
3. DB migration — `DELETE FROM screener_filters WHERE filter_path IN ('vts_oscillator', 'active_oscillator')` for both `crypto_spot` AND `xstock_spot`
4. Read-audit `vts-runner.ts`, `xstock_spot/eval-cycle.ts`, `lane-eligibility.ts` for any literal `'oscillator'` / `'vts_oscillator'` / `'active_oscillator'` references — drop or update
5. `1-system-manual/SYSTEM_MANUAL.md:11121` — drop `'vts_oscillator'` from the filter-path enumeration
6. Governance trail: BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES note (anomaly: oscillator orphan since [git blame to identify origin batch], resolved [batch-id]); add one-line note that `mean_reversion → oscillator` retag is deferred / open question so we don't lose the thread

**Pre-deploy verification gate:** SIM `byStrategy` query confirming zero signals have ever fired with `sourcePool='quant-oscillator'` or equivalent. If nonzero, Langston's Option 2 read is wrong and re-audit triggers per the "audit-conclusion-that-contradicts-telemetry triggers re-audit" standing rule.

**Sequencing:** runs after the xStocks UI sprint (B-NEW-N items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`) closes. Small batch — one type literal, one const, ~4 DB rows, file audits, one System Manual edit. Should fold into a near-term Phase 24 follow-up batch rather than spawn a dedicated batch given the limited surface area.

**Open follow-up (separate batch, not this one):** decide whether `mean_reversion` (canonical-regime-strategy-map line 193: `'RSI < 30 or > 70 • Price deviation > 1σ'`) should be retagged from `'reversal'` to a different family. The behavior-change (different IMF lane routing → different LQ/VN/DI admit/reject distribution) requires SIM coverage before deploy. Parked as open question for Langston review.

### §10c.7 xstock data-volume actuals vs B75 projection (logged 2026-05-14)

B75 (2026-05-06) sized the tiered-storage architecture around projected B74 data volumes. Phase 24 actuals after 8 days of xstock_spot operation are higher than the B75 forecast assumed:

**Observed (24 GB DB total, 2026-05-14):**
- `xstock_spot_ticker_snap_2026_05`: **12 GB / month** (146 rows/sec sustained — Kraken WS-equities ticker feed)
- `xstock_spot_ohlc_1m_2026_05`: 3 GB / month
- `xstock_perp_ticker_snap_2026_05`: 2.6 GB / month
- Other tables (crypto OHLC + signal_eval_archive + pair_scan + etc): ~6 GB / month combined

**Projection delta:** B75 (`§10c.1 NO PATCHES doctrine` era) implicitly assumed hot-tier steady-state of ~10–15 GB. Current trajectory points to **~30–45 GB hot-tier steady-state** once the first 30-day sweep cycle activates (early June 2026 for May partitions).

**Cost implication on Supabase Pro:** $25 base + 8 GB included + $0.125/GB/mo overage. At 40 GB current = $29/mo. At eventual ~45 GB steady-state = ~$29.60/mo. **Within $3–4/mo of the original B75 projection**, well below the 200 GB plan cap (which would be $49/mo). Auto-expansion 27 → 40 GB is normal Supabase Pro mechanics, NOT a sign of plan-cap risk.

**Action items (added to Phase 24 follow-ups):**
1. **Early-June check-in** — confirm the first 30-day b75-retention-sweep cycle activates as designed on 2026-05 partitions. `data_archive_manifest` currently shows 4 rows in `active` state (sweeps confirmed working on April data); we need to see May partitions transition through `pending → uploaded → verified → active`. If the cycle doesn't fire on schedule, that's a real bug to chase.
2. **Document the xstock ticker-volume actual** in `1-system-manual/SYSTEM_MANUAL.md` storage section so future asset-class additions can budget against the empirical 146 rows/sec / 12 GB-month figure rather than re-estimate from scratch.
3. **Per-asset-class data-volume capture rule (new standing rule):** any new asset class added in Phase 24+ ships with a data-volume actuals row appended to this section §10c.7 at the end of its first 30 days. This way future tier-storage retunes have empirical inputs, not estimates.

**Not a blocker.** Storage is on track within tolerance. The retention-sweep architecture from B75 is correct; we just need the first sweep cycle to actually run on the new asset-class partitions to confirm the pipeline closes.

### §10c.5 Documentation discipline (rule, not just a reminder)

Kyle directive: discussions get forgotten when implementation happens 3-4 phases later. To prevent yes-yes-yes-then-not-done failure mode:
- Every architectural decision goes into the right governance doc the SAME SESSION it's discussed
- Every commitment gets a numbered home (sub-batch, RUNNING_ISSUES entry, scope-doc section, workflow-doc section)
- Verbal "we'll do that later" without paper-trail is rejected — if it's worth doing, it's worth filing
- This document (§10c) is itself the artifact of that discipline — these 4 corrections are filed BEFORE the corresponding implementation batches start

---

## §11. Open questions log

Items requiring decision before / during the relevant batch.

| # | Question | Owner | Required by | Status |
|---|---|---|---|---|
| 1 | Pool-relative vs absolute normalization for `expectedNetReturnR` (§8.4 Q1) | Langston review | B81 Step-1 | OPEN |
| 2 | CONTEXT_BONUS per-asset-class scoping (§8.4 Q2) | Langston review | B81 Step-1 | OPEN |
| 3 | Perp position-sizing parity (§8.4 Q3) | Kyle + Langston | B81 Step-1 | OPEN — default same-as-crypto |
| 4 | Friction units in DB (R vs $) (§8.4 Q4) | Langston review | B81 Step-1 | OPEN — default both |
| 5 | Pattern-heavy strategy applicability to equities (§10 Risk 2) | Langston Step-2 audit | B79 Step-2 | OPEN |
| 6 | Macro-modifier funding-rate per-pair extension shape (§7.1) | Langston Step-1 | B80 Step-1 | OPEN |
| 7 | Equity strategy whitelist if §10 Risk 2 forces conservative ship (§6.3) | Kyle | B79 Step-2 | OPEN |

---

## §12. Update log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | CC | Document created per Kyle directive 2026-05-07. Initial scope per CC's earlier message + Kyle's pivot reply. RTB ranking parity (§8) captured per Kyle's explicit ask. xStocks operational facts (§6.1) verified via web research. |
| 2026-05-07 | CC | Sequencing caveat per Kyle: active-trading wire-in IS in scope (codepath end-to-end ready); live-trading testing of new asset classes deferred to Phase 19. Updated §1, §2, §4 table accordingly. |
| 2026-05-07 | CC | **B78 kickoff.** Pre-flight no-touch fence SQL run — healthy baseline (10 factors × 9–10 rows/hr each on `asset_class='crypto_spot'`). Fixed §3 typo: column is `evaluated_at`, not `captured_at` (verified against schema). BATCH_78_SCOPE.md drafted (rev 1) — file-system layout per §5, mandatory aggregator-query update on `drift-dashboard-aggregator.ts:1055`, re-export-shim grace policy = 1 batch (cleared in B81). Sent to Langston for Step 1+2 combined review. |
| 2026-05-07 | CC | **B78.2 SHIPPED** (commits `5c3ce00b3` + `5ec57cbd3`; PM2 #182 → #183). Resolves RUNNING_ISSUES #76. Root cause was the keep-alive ping at L2767 sending v1-format `{event:'ping'}` to v2 endpoint (~21s cadence matched `PING_INACTIVITY_MS=20000`). Initial scope assumed `subscribeToBookChannel` L2292 was the failing path; Risk #4 from scope §4 materialized when error rate didn't drop post-deploy of `5c3ce00b3` — diagnosed L2767 within 30min, hotfix `5ec57cbd3` resolved. Error stream STOPPED at deploy boundary (last 14:16:48; first v2 ping accepted 14:20:09). **"Subscribed Symbols: 0" reframed NOT-A-BUG** — empty `paper_sim_open_positions` = position-gated I8C subscribe by design; B78.1 EventEmitter wiring ready when positions open. **No B78.3 needed.** Compressed-workflow validation: Step-1+2 APPROVED in 2m45s, Step-8 APPROVED in 25s via watchdog (3 round-trips total). **Sequencing back to plan:** B79 (xstock_spot) is next per §4. T+24h forward-watch (#74) tomorrow also covers B78.2 1hr-clean-log per Langston Step-8 §C item 1. |
| 2026-05-07 | CC | **B78.1 SHIPPED** (commits `bcbea1896` + 2 hotfixes `ee7c8dc3e` + `fb9a58667`; PM2 #181). Cycle break via EventEmitter inversion. Madge 47 → 46, #10 absent. Langston Step-1+2 APPROVED rev 2; Step-8 APPROVED to close. **NEW DISCOVERY filed as RUNNING_ISSUES #76:** kraken-websocket-adapter has been failing `subscribe` to Kraken WS for 5 weeks (since 2026-04-03; 49K health-checks all 0 subscribed; 142K rejection log lines). Pre-existing, masked by REST fallback + B74 archivers. **Sequencing per Langston Step-8 §C:** B78.2 (Kraken WS subscribe fix) must precede B79 Day 0 (not parallel) — without flowing ticks B78.1 inversion isn't end-to-end-validated, and B79 can't get a clean baseline. **Plus:** watchdog `langston-call` shipped (60s first-byte / 30s idle / 5 attempts; auto-retries on hang). Brought Step-8 review latency from 22-min hang → 35-sec success. Source archived at `Claude Comms and Packages/Langston/langston-call.sh`. |
| 2026-05-07 | CC | **No-deferrals directive (Kyle 2026-05-07):** the three B78 deferrals (ws-adapter cycle break, friction extraction, filter-as-first-class) are folded into named batches per §4 update. No orphan defer-list. New B78.1 batch added for cycle break (own batch because data-feed surgery doesn't fit B79 asset-class population). B79 Day 0 absorbs friction extraction. B81 Day 0 absorbs filter-as-first-class promotion. Slack-budget tradeoff: B78.1 consumes 1-2 days originally slack; B81 was rated "most deferrable" so can absorb its Day 0. If any batch slips ≥2 days, escalate — do NOT re-defer silently. |
| 2026-05-07 | CC | **B78 SHIPPED** (commits `e814461d6` + `57220ab4b` hotfix; PM2 #180). 4 review rounds (REVISE rev 1 with 6 items → REVISE rev 2 propagation A+B → REVISE rev 3 line 69 + footer → APPROVED rev 4). Step-4 code review APPROVED. Step-8 verify APPROVED to close (cadence math extrapolates to 10 rows/factor/hr, matches baseline). **Deltas vs plan §5:** (a) `kraken-websocket-adapter.ts` deferred out of B78 — bidirectional cycle with `live-pricing-adapter.ts` confirmed via madge; cycle break gets its own batch where DI inversion is the explicit objective. (b) Friction extraction deferred to B79/B80 — `cost-model.ts` is at `server/core/math/` (not `server/utils/` as plan/scope wrote pre-fix), exchange-keyed not asset-class-keyed; resolution-hierarchy inversion risk. Plan §5 file path corrected. (c) `kraken-futures-*` was a misattribution — B74 work is at `server/services/passive-archive/equity-perp-archiver.ts`, not moved. (d) `pattern-pool-filters.ts` filename used (not generic `filters.ts`) per Langston Q2. **§9 threshold-table population: stays empty for B78** — xstock/perp threshold rows enter in B79 (Layer 1 domain knowledge → Layer 2 cross-asset shadow-classify → Layer 3 shadow-mode VTS) and B80 (inherit-from-crypto-spot + funding-rate per-pair extension). **Forward-watch RUNNING_ISSUES #74:** confirm crypto_spot ablation cadence ~9-10/factor/hr at +30 min and +24h; revert `git revert 57220ab4b e814461d6` if drop. **Lessons:** (i) pre-flight grep needs broader pattern — `(\\.\\.?/)+services/kraken` missed 23 intra-services callers using bare `./kraken[.js]`; CI Build caught it. (ii) scope-doc revision discipline — same-name strings can drift across sections invisibly; after each revision, search-replace ALL instances. |
| 2026-05-07 evening | CC | **B79 SHIPPED — Phase 24 NEW.** Commits `d7ca57340` (PIA + workflow doc + 4 schema migrations) + `a991f40a4` (MEMORY mirror) + `260cc8cc5` (Step 3 implementation: 5 new + 11 modified files; +1759/-84) + `871038509` (Step 4 prep). PM2 #184. CI Build+Docker green; Test 59/995/5/1059 baseline-match. **Dormant scaffold ship** per Langston-greenlit framing — code paths exist + schema applied (screener_filters with NO max_price cap; module_constants 8 xstock seeds) + bootstrap factory in place + workflow doc canonical; live xstock scanner setInterval deferred to B79.0a. **PIA two-instance partitioning approach locked** (Langston pushed back on CC's param-plumbing lean per silent-corruption argument; CC conceded). Static-state hazard surfaced (TelemetryAggregator disk-persist module-scoped at line 1600-1602; xstock instance in-memory only Day 1). **Step 4 PUSH_GREENLIT** with 4 non-blocking notes for B79.0a (require→static-import; SQE pattern-pool floor crypto-scoped; redundant truthy strategy guard; missing boundary tests). **Step 6 verify:** HTTP 200, no B79 errors, no-touch fence on crypto_spot returns 12 emissions/factor/hr (within ±10% of pre-deploy baseline). **NEW Tier-2 governance doc:** `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — Section A.0 through K, Section H.1 = xstock_spot worked example. **Phase 24 reframe locked:** B79 + sub-batches B79.0a/.1/.2/.3/.4/.5/.6/.x; Phase 25 = B80 + sub-batches; out-of-sequence with 15c (consistent with Phase 19.0 pull-forward pattern). **§9 threshold table population** — first xstock_spot rows landing in module_constants: macro_modifier=1.0 placeholder, pattern_pool_gates {final_score_floor=0.45, max_position_pct=0.50}, strategy_gates.orb.enabled=false, sqe_config {di_min_quant=18, adx_min=18, momentum_min=0.002, di_min_pattern=10}; regime branch-condition thresholds in TS leaf module per scope §2.3 Layer 1 baseline. Layer 2/3 calibration begins when B79.0a wires the live scanner. |
| 2026-05-08 | CC | **B79.TEC SHIPPED.** Per-asset-class TEC config (`Map<AssetClass, TrailingExitConfig>`) + HARD-FAIL boot + state-vs-config rehydrate boundary. Wildcard fallback removed for crypto_spot + xstock_spot. Variant K (BE-disabled) win locked into crypto_spot row. xstock_spot row carries Day-1 Layer-1 placeholders pending B79.4 evidence. |
| 2026-05-08 | CC | **B79.0a SHIPPED.** Live xstock_spot scanner via centralClock subscription (NOT setInterval — same tick-source as FX5 scanner). Telemetry partitioning via separate-instance triad (`getAssetClassInstances` factory). New `data-freshness.ts` helper (asset-class-aware closed-market belt-and-suspenders). Q-D probe artifact dispatched but yfinance returned null (RUNNING_ISSUES #86 — continuous probe deferred). Pre-deploy load test = DECISION:SHIP. Hostile-sim verified (BACKPRESSURE_OBSERVED fires every cycle as designed; no skipped ticks). |
| 2026-05-09 | CC | **B79.0b SHIPPED.** N3+N4 cleanup pattern. N3 dead-code truthy guards stripped at signal_quality_evaluator.ts:199+285 (TS-guaranteed `string` type). 4 N4 boundary test files retroactively covering surfaces shipped without coverage in B79+B79.0a. B79.0a SQE wildcard DELETE script committed-not-executed (manual operator step at +48h gate). |
| 2026-05-09 | CC | **B79.0c SHIPPED.** Per-symbol 24/7 predicate. Required-symbol signature (Langston Q4 push-back vs optional silent-fallback). 10 Kraken Phase-1 24/7 names bypass ARCA gate. Pre-ship WS probe to ws-equities.kraken.com confirmed empirically: Kraken WS goes silent for ALL xstocks weekends regardless of 24/7 marker (RUNNING_ISSUES #89). Predicate ships correct standalone; live data flow blocked upstream. |
| 2026-05-09 | CC | **B79.0d SHIPPED.** ORB strategy real implementation (~210 lines). 6-step activation pattern: detect logic + strategy-engine dispatch + signal-orchestrator dispatch block + IMPULSE_EXPANSION + STRUCTURAL_TRANSITION regime mapping + 7 Layer-1 thresholds in module_constants.strategy.orb + DB gate flip. Triple-defense asset-class guard (detect+dispatch+SQE whitelist). 24/7 names guard inside detect (no opening bell semantics). B73 ablation auto-included (replay-service is strategy-agnostic — no registration code needed). RUNNING_ISSUES #90 queued for `risk_reward_ratio` rename to `target_range_multiple`. |
| 2026-05-10 | CC | **B79.0f SHIPPED — live bug fix.** Asset-class collision disambiguation (the SUI bug class). Live Kraken `/0/public/AssetPairs` query intersected with XSTOCK_SPOT_SYMBOLS: 9 USD-quote ticker collisions (BDX, CVX, DASH, EDU, MET, OPEN, PEP, SUI, T) + 8 EUR pre-emptive. New XSTOCK_SPOT_KRAKEN_COLLISIONS set with provenance comment + standing quarterly re-audit rule. Resolver gate: collision-set membership PRECEDES the xStock fast-path → routes to crypto_spot + emits `[B79.0f][COLLISION_RESOLVE]` WARN log. Backfill applied: 4862 mis-tagged rows in signal_eval_archive flipped (DASH/USD 337 + MET/USD 1598 + OPEN/USD 44 + SUI/USD 2883). Other tables clean. PM2 #204. |
| 2026-05-10 | CC | **B79.0g SHIPPED.** Persistence-at-trade-open per Langston Q4 lock from B79.0f review. New `vts_open_trades` table (hybrid 14 cols + jsonb context); new `vts-trade-persistence.ts` service. Trade-open AWAITS INSERT BEFORE Map.set per Langston Step 4 F1 invert (no observer-divergence). Bootstrap-from-memory RE-RESOLVES asset_class via safeResolveAssetClass — defeats stale legacy values from pre-B79.0f resolver (Langston Q4 add'l #1 critical lock). Rehydrate-on-boot wired into server/index.ts. Q5 atomic close-time DELETE+INSERT deferred to RUNNING_ISSUES #91 (B79.0g-tx pinned batch ID per Langston Step 4 F2 paper-trail rule). PM2 #205. |
| 2026-05-10 | CC | **B79.0e SHIPPED.** `equity_*` → `xstock_*` namespace cleanup. 172 DB objects renamed in single transaction (4 parents + 52 partition children + 4 parent indexes + 108 partition indexes + 4 module_constants `data_lifecycle.equity_*.hot_retention_days` keys). 15 code files updated (Drizzle schema const + literals; archiver maps; scanner/freshness/storage-client/drift-aggregator/scripts/test). Type aliases retained pointing at new consts (cosmetic modernization queued). Langston Step 4 F1 catch: rollback symmetry — extended rollback SQL with reverse DO blocks + module_constants UPDATE. PM2 #206. |
| 2026-05-10 | CC | **B79.0h — governance retrospective.** Phase 24 close. ASSET_CLASS_ONBOARDING_WORKFLOW.md updated with Sections H.1.x post-mortem (lessons by sub-batch + comms-infra protocols) and H.1.y updated decision rules (10 new if-then triggers from B79.0a-0g). SYSTEM_IMPACT_MAP.md updated with collision-set + vts_open_trades + table renames entries. SYSTEM_MANUAL.md appended with Phase 24 retrospective + 10 cross-cutting architectural patterns. PHASE_HISTORY.md sub-batch table populated. POST_AUDIT_ROADMAP.md Phase 24 closure recorded. **Phase 24 success criteria MET 2026-05-10:** xstock_spot in production VTS shadow-mode + onboarding workflow battle-tested through 9 sub-batches + ready for Phase 25 (B80 crypto_perp). |
| 2026-05-10 evening | CC | **B79.0i.a + B79.0i.b SHIPPED — Phase 24 standing rule #10 obligation closed for xstock_spot.** Three-revision arc under two Kyle pushbacks. **Final form:** xStocks tab inside Machine Learning page contains 5 sections all reusing existing crypto components: Scanner Cycle Header (xstock-specific) + Per-Pair Fresh-Tick Latency (xstock-specific) + FilterDiagnosticsPanel (REUSED from machine-learning.tsx via export — full Pipeline Summary + Last Scan + 24h Rolling + VTS Eval Detail by-strategy + Setup Nulls + Pre-Eval Skips + Post-Signal Rejections + Filter Metric Ranges) + ExitStrategyAblationSection (REUSED from analytics.tsx via export+endpointBase prop) + FactorCalibrationSection (REUSED from analytics.tsx via export+endpointBase prop). 3 NEW sibling endpoints under `/api/xstocks/`. Aggregators `computeExitStrategyAblation` + `computeFactorCalibration` parameterized with optional `assetClass` — defaults preserve byte-identical pre-change behavior; verified post-deploy curl on `/api/analytics/factor-calibration` returns unchanged `factors: 10`. **Two new architectural patterns established (now Phase 24 standing rules #6 + #7 in SYSTEM_MANUAL appendix):** (a) cross-asset-class UI component reuse via export+endpointBase prop with default preserving legacy; (b) shared aggregator parameterization via optional asset_class with default preserving legacy. Pattern documented as canonical recipe in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Section M for B80 implementer. **Terminology:** "shadow-mode" terminology dropped per Kyle directive 2026-05-10 evening; replaced with "VTS Observation". **Outstanding follow-up:** RUNNING_ISSUES #92 — wire xstockSpotScanner through signal-orchestration so FilterDiagnosticsPanel funnel-rejection counters populate (currently zero — observability-only scanner; future B79.x batch). PM2 #210. |
| 2026-05-14 | CC | **Mid-stretch update — xStocks UI sprint still in flight (B-NEW-N items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`); B79.0m.b2 partial-ship intervening commits 2026-05-11 → 2026-05-13 not separately logged here per Kyle's "trial-and-error history belongs in completion reports + tracker, not the plan doc" directive (2026-05-10).** Two new entries: **§10c.6** Oscillator family-filter removal — Langston-approved Option 2 (remove entirely) per 3-step protocol exchange 2026-05-14. Sub-batch sequenced for after xStocks UI sprint closes. Open follow-up: `mean_reversion → oscillator` retag is parked as separate future question. **§10c.7** xstock data-volume actuals — observed 12 GB/month for `xstock_spot_ticker_snap` (146 rows/sec WS feed), higher than B75 implicit forecast. Cost-tracking: ~$29/mo on Supabase Pro at current 40 GB allocation, vs B75 projection ~$26/mo. Within tolerance, not a plan-change trigger. Two action items: early-June check-in that first 30-day b75-retention-sweep cycle activates on May partitions; new standing rule that every new asset class ships with a 30-day data-volume actuals row appended to §10c.7 so future tier-storage retunes have empirical inputs. |
| _(append rows here at every batch close, plus any mid-batch finding that changes the plan)_ | | |

---

*End of MULTI_ASSET_VTS_EXPANSION_PLAN.md. Living document — update at every batch boundary. Move to `_archive/` when Phase 19 closes.*
