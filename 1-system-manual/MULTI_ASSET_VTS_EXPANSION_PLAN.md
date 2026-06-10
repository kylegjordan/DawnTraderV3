# Multi-Asset Expansion — Living Plan Document

> **Filename note (Kyle directive 2026-05-09):** file is named `MULTI_ASSET_VTS_EXPANSION_PLAN.md` for git-history continuity, but **scope covers BOTH the VTS shadow-mode evaluation path AND the active trading path end-to-end** (signal-orchestrator emit → paper-execution-engine admission → RTB pool insertion → TEC). Every new asset class gets wired into BOTH paths. Live-trading testing of new asset classes lives in Phase 19; until then the active path is wire-in-only-no-trades. Future filename rename to drop "VTS" queued as low-priority cleanup.

> **Status:** LIVING. Update this doc BEFORE every batch in this stretch (sanity-check assumptions still hold) and AFTER (record what landed vs. what's now expected). Per Kyle directive 2026-05-07.
> **Owner:** Claude Code, with Langston review at every step gate.
> **Created:** 2026-05-07
> **Window:** 2026-05-07 → 2026-05-15 (8 days). Hard fence at 2026-05-15: B67.5 consumer-wiring window opens, calibration cohort closes.
> **Change log:** see §11 at bottom.
>
> **Forward reference (added 2026-05-15):** Phase 24 calibration follow-on work continues in **`1-system-manual/XSTOCK_CALIBRATION_PLAN.md`** — that doc is the locked plan for items 3 (regime/filter/strategy calibration), 4 (exit-strategy ablation), and 6 (cross-asset ranking parity prerequisites) from this doc's §4 sequencing table. Two CC sessions converged + Langston two-round design review completed 2026-05-15. **Plan starts where this one leaves off.**
>
> **Forward reference (added 2026-06-05, Kyle directive):** strategic directions from the Hidden-Contextual-Edge study + the post-study discussion are captured in **`1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`** and folded into `POST_AUDIT_ROADMAP.md` (2026-06-05 update). Two items bear directly on this multi-asset plan: (1) **independent standalone VTS (firehose) RESEQUENCED from post-launch to BETWEEN Phase 24 and Phase 19** — design = ingest market data once + fan out to N consumers (VTS/paper/live) so it costs zero extra Kraken API calls; "VTS shadow-mode" splits into a broad **firehose** (built pre-19) and a faithful **shadow = paper mode** (built as Phase 19). (2) **Perpetual-futures asset classes (crypto_perp / xstock_perp) now carry a delta-neutral funding-rate / cash-and-carry YIELD motivation** (long spot + short perp, collect funding) in addition to universe expansion — but remain POST-LAUNCH (onboarding a class is a long process; don't block first launch; bigger portfolio first). The xStock-calibration RESUME scope is `Claude Comms and Packages/Scope Files/XSTOCK_CALIB_RESUME_SCOPE.md`.

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
- **Order-placement connection — EMPIRICALLY PROVEN 2026-05-29** (validate-only `AddOrder` through Dawn Trader's own `KrakenService`, zero capital, no order placed). xStock orders go through the **SAME** `/0/private/AddOrder` REST endpoint + the existing IP-locked staging key (`dawntrader-staging`, order perms on) — **NOT a separate venue/host**. TWO requirements: **(1)** request parameter **`asset_class: "tokenized_asset"`**; **(2)** the **x-suffixed symbol** (`TSLAxUSD` or `TSLAx/USD`) — **NOT** the canonical no-x form (`TSLA/USD`). PROOF: with `asset_class`+`TSLAxUSD` → Kraken returns `EOrder:Cost minimum not met` (pair **recognized + accepted**, rejected only for sub-minimum size — identical to a crypto control); WITHOUT the param, or with the no-x `TSLA/USD` even *with* the param, → `EQuery:Unknown asset pair`. Account is confirmed **region-enabled for tokenized assets** (a disallowed account returns a permission error, not cost-min). **Phase 19 active-trading wire-in:** add `asset_class?: 'tokenized_asset'` to `addOrder` (`server/exchanges/kraken/kraken.ts` ~line 534) and use the symbol-normalizer **display** form (`TSLAx`) for the *order* pair (market-data/canonical form stays no-x `TSLA/USD`). Re-verify any time via a validate-only `AddOrder` (zero capital). This resolves the "can Dawn Trader actually trade xStocks on Kraken?" gate: **YES.** Context: market-data feed is `wss://ws-equities.kraken.com`; the execution venue is a real CLOB (20-level depth ladder confirmed).

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

## §10d. Observability backfill batch (added 2026-05-14 — Kyle directive after B83 pipeline-stall incident)

**Context.** BATCH_80 Phase 1 (commit `8ace0b859`, 2026-05-13) introduced a `ReferenceError: tradeId is not defined` in the second for-loop of `resolveOpenVirtualTrades` (server/services/vts-runner.ts:2349, :2570, :2572). The refactor renamed `getTrailingState(symbol)` → `getTrailingState(tradeId)` correctly in the first loop, but the second loop destructures the iteration variable as `id` — so the three rename sites in that loop body referenced an out-of-scope identifier. Every cycle where ≥1 trade should have closed, the function threw and aborted mid-loop. **~24 hours of silent pipeline stall, 85-trade backlog**, only spotted by Kyle visually inspecting `/machine-learning`. Fixed in commit `b4cde6b85` (B83 hotfix, 2026-05-14) — three single-character changes. **Detection took runtime instrumentation; static analysis couldn't find it because TS resolved `tradeId` against module-level scope rather than block scope.**

This batch addresses the **systemic observability gap** that allowed the regression to ship + run undetected. It's NOT another asset-class expansion item — it's infrastructure that every subsequent batch will rely on. Sequenced after the xStocks UI sprint (B-NEW-N items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`) closes, before resuming the §4 expansion sequence.

### §10d.1 Exit-cycle health dashboard

A new tab (or dedicated page within System Monitoring) surfaces real-time + rolling-window health of `resolveOpenVirtualTrades`:

| Metric | Source | Alert threshold |
|---|---|---|
| Cycles completed in last hour | `[B83-CYCLE]` log lines (already shipped) | < 50/hr → WARN |
| Trades closed in last hour | sum `resolved` from `[B83-CYCLE]` | drop > 50% vs 7d avg → CRIT |
| Trades opened in last hour | new VTS open inserts | drop > 50% vs 7d avg → WARN |
| Currently-open trade count | `vts_open_trades WHERE closed=false` | > N (TBD per asset class) → WARN |
| Oldest open trade age | `MAX(NOW() - opened_at)` | > 48h → WARN, > 7d → CRIT |
| Stale-bail count per cycle | `currentPrice === null` count in evaluator | > 10% of evaluated → WARN |
| ReferenceError / unhandled rejection count | parse PM2 error.log | > 0 → CRIT (was the missing alert for B83) |
| Avg evaluator duration | timer around evaluateTECExit | > 100ms → WARN |
| Per-asset-class breakdown | group by `trade.assetClass` | (informational) |

**Implementation note:** the `[B83-CYCLE]` log line (shipped in B83-DIAG commit `aad057c3c`) is the foundational data emission for this dashboard. It already fires unconditionally per cycle — the dashboard scrapes that log + supplements with DB queries.

### §10d.2 Multi-API rate-limit dashboard

Per Kyle directive 2026-05-14: **NOT Kraken-only — every external API we call must have rate-limit headroom tracking.** A new dashboard with one row per external service:

| Service | What we call | Documented rate limit | Track + alert |
|---|---|---|---|
| **Kraken Public REST** (`api.kraken.com/0/public/*`) | Ticker, OHLC, AssetPairs, Depth | 1 req/sec (tier 0); higher tiers if authenticated | weight consumed / sec, weight remaining, throttle events |
| **Kraken Private REST** (`api.kraken.com/0/private/*`) | Balance, AddOrder, OpenOrders (future Phase 19) | 15 req / 5 sec base, decays | tier counter, decay rate, near-limit warnings |
| **Kraken WebSocket** (`ws.kraken.com`, `ws-equities.kraken.com`) | Ticker subscriptions, book, ohlc | subscription cap (TBD documented), msgs/sec budget | active subscription count, reconnect frequency, ping-pong miss rate |
| **Kraken Futures REST** (`futures.kraken.com/api/charts/v1/*` + `derivatives/api/v3/*`) | Tickers, candles | 500 req/min documented | req/min, throttle responses |
| **CoinGecko** (`api.coingecko.com/api/v3/*`) | Macro modifier (btc_dom, mcap_mom, funding) | 30 req/min (free tier) | req/min, 429 rate, daily quota consumed |
| **Supabase Postgres** (`db.vqqyisaudwenrdhnmjwt.supabase.co:5432`) | All Drizzle queries + raw SQL | Pro tier: ~60 concurrent connections + statement_timeout 60s | active connections, slow-query count > 5s, statement-timeout errors (the B-NEW-21 freshness pattern) |
| **Supabase REST (PostgREST)** | (currently unused — would be if we migrate API layer) | tier-dependent | placeholder for future |
| **Anthropic API** (`api.anthropic.com/v1/messages`) | Langston relay + future ML calls | tier-dependent (Max plan for OAuth path; API for direct) | tokens/min, requests/min, near-limit warnings |
| **Telegram Bot API** (`api.telegram.org`) | CC ↔ Langston comms bridge | 30 msgs/sec per bot; 20 msgs/min per group | msg rate, 429 rate, queue depth |
| **GitHub API** (`api.github.com`) | gh CLI for PR + CI status checks | 5000 req/hr authenticated | req/hr remaining, near-limit warnings |
| **Finnhub** (mentioned in `[StockService]` warning) | Currently disabled (no FINNHUB_API_KEY) | when enabled: 60 req/min free | placeholder |

**Each row tracks:** current rate, peak last 60s, peak last 60min, near-limit alert threshold, hard-limit alert threshold, last 24h 429-rate. **Required behavior on near-limit:** WARN log + dashboard red. **Required on hard-limit hit:** CRIT log + auto-throttle + page-emit.

### §10d.3 System Monitoring page reorganization

Per Kyle directive 2026-05-14: many existing tabs in System Monitoring are stale or duplicate. As part of this batch:
- Audit every existing tab in System Monitoring
- Categorize: KEEP (still relevant), MOVE (relocate into the new health dashboard), DELETE (defunct).
- Specific candidates to evaluate:
  - WebSocket health diagnostics → MOVE into rate-limit dashboard
  - Per-pair freshness latency → MOVE into exit-cycle health
  - Existing CentralClock drift display → KEEP as a separate timing tab OR MOVE
- The new Exit-Cycle Health Dashboard and Multi-API Rate-Limit Dashboard become the two primary tabs.

### §10d.4 Code-side observability hardening

Three structural changes that prevent recurrence of the B83 silent-fail pattern:

1. **Promote unhandled promise rejections to alert-grade.** Currently the `ReferenceError: tradeId is not defined` was logged at error.log level but produced no alert. Wire a global `process.on('unhandledRejection')` handler that:
   - Emits to a dedicated `[CRIT][UNHANDLED]` log channel
   - Increments a counter visible on the health dashboard
   - Pages on any non-zero count

2. **Replace gated success-logs with unconditional summary logs.** The pre-B83 pattern `if (resolved > 0) { console.log('Resolution: ...') }` meant silence = failure OR healthy-idle, indistinguishable. The fix: unconditional per-cycle summary (now `[B83-CYCLE]` line shipped). Audit other gated logs in the codebase and remove similar `if (success)` gates.

3. **Pre-trade-close invariant assertion.** Add a runtime check inside the inner exit-cycle loop: if `decision.shouldExit === true` and the close persistence path doesn't complete, emit a `[CRIT][CLOSE_FAILED]` line with the tradeId + symbol. This would have caught B83 immediately because every single trade with shouldExit=true would have been emitting CRIT.

### §10d.5 Rename-inventory governance (CLAUDE.md / SIM addition)

Per Kyle directive 2026-05-14: **any refactor that renames an identifier (variable, function, type, exported symbol) referenced across the codebase must inventory every existing call site BEFORE the rename, and the change list must explicitly account for each one.** The B83 bug was caused by missing 3 of N call sites during BATCH_80 Phase 1.

**Required protocol (to be added to CLAUDE.md §3 governance + SIM "rename invariants" section):**

1. **Pre-rename inventory step.** Before any commit that renames an identifier `OLD` → `NEW`, the diff author runs `grep -nE '\bOLD\b' --include='*.ts' --include='*.tsx'` across the full repo and records the full list in a `change-list/rename-inventory-<batch>.md` file (one per rename).
2. **Diff-author commitment.** For each call site in the inventory, the author marks: KEPT-AS-OLD (intentionally referencing legacy), RENAMED (changed to NEW), or REMOVED (call site deleted). No call site can be left without an explicit decision.
3. **Langston review gate.** Code review pass must verify the inventory file matches `git grep` output post-rename: no remaining bare `OLD` references except those marked KEPT-AS-OLD with documented reason.
4. **CI check (future).** A CI step that runs the grep + diffs against the inventory file would catch missed renames automatically. Out of scope for this immediate fix but tracked here.

**SIM addition:** add a new SIM section "Rename invariants" that lists identifiers known to be referenced cross-module (e.g. `getTrailingState`, `clearTrailingState`, `evaluateTECExit`, etc.) so future refactors have a starting inventory to check against. Each entry: identifier name, modules that import it, modules that reference it via dynamic-import.

### §10d.6 Batch sequencing

This batch sits **between the xStocks UI sprint close and the §4 expansion sequence resumption**:

```
xStocks UI sprint (B-NEW-N items) → CLOSED
  ↓
BATCH_82 (xstock ablation/calibration data integrity — currently scoped) → SHIP
  ↓
THIS BATCH (§10d observability backfill) → SHIP
  ↓
Resume §4 expansion sequence (B81 RTB-parity, B80 crypto_perp wire-in, etc.)
```

**Rationale for this sequencing:** BATCH_82 ships first because (a) its scope is already drafted + Langston-reviewed-ready, (b) it's a data-integrity fix for xstock that's actively producing wrong tags every minute, and (c) the observability work would otherwise delay BATCH_82 by several days. The observability backfill then ships before the next asset-class wave (B80 perp wire-in) so that batch lands into instrumented production.

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
| 2026-05-14 | CC | **B83 incident + §10d observability backfill batch added.** ~24hr silent pipeline stall caused by BATCH_80 Phase 1 missed-rename (`getTrailingState(tradeId)` in for-loop body where destructure was `id`). 85 trades closed cleanly via natural exit rules once fixed; 44 remaining are legitimately in-flight. Root cause + fix detailed in §10d preface; observability backfill scope (§10d.1–§10d.6) added per Kyle directive: exit-cycle health dashboard, multi-API rate-limit dashboards (Kraken Public/Private/WS/Futures + CoinGecko + Supabase + Anthropic + Telegram + GitHub + Finnhub), System Monitoring page reorganization, code-side hardening (unhandled-rejection alerting, replace gated-success logs, pre-close invariant), rename-inventory governance protocol. Sequenced between BATCH_82 ship + §4 expansion resume. |
| 2026-05-14 | CC | **Mid-stretch update — xStocks UI sprint still in flight (B-NEW-N items in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`); B79.0m.b2 partial-ship intervening commits 2026-05-11 → 2026-05-13 not separately logged here per Kyle's "trial-and-error history belongs in completion reports + tracker, not the plan doc" directive (2026-05-10).** Two new entries: **§10c.6** Oscillator family-filter removal — Langston-approved Option 2 (remove entirely) per 3-step protocol exchange 2026-05-14. Sub-batch sequenced for after xStocks UI sprint closes. Open follow-up: `mean_reversion → oscillator` retag is parked as separate future question. **§10c.7** xstock data-volume actuals — observed 12 GB/month for `xstock_spot_ticker_snap` (146 rows/sec WS feed), higher than B75 implicit forecast. Cost-tracking: ~$29/mo on Supabase Pro at current 40 GB allocation, vs B75 projection ~$26/mo. Within tolerance, not a plan-change trigger. Two action items: early-June check-in that first 30-day b75-retention-sweep cycle activates on May partitions; new standing rule that every new asset class ships with a 30-day data-volume actuals row appended to §10c.7 so future tier-storage retunes have empirical inputs. |
| 2026-05-15 | CC | **xStock Calibration Plan v2 LOCKED + promoted to system-manual.** Two CC sessions converged on plan structure; Langston two-round design review completed (round 1 = substantive review + 9-question answers + 8 corner-case scrutiny + timeline pushback; round 2 = ACK with 3 inline clarifications: F-NOW migration scope correction, crypto-friction-review batch added to timeline, DBS backfill 7-day hard floor). Calibration follow-on items 3 / 4 / 6 from §4 sequencing table now live in **`1-system-manual/XSTOCK_CALIBRATION_PLAN.md`** as the canonical living doc. That plan covers Phase 0 (corporate-actions pre-flight) → Phase A (DBS foundation) → Phase B (7 sub-batches incl. friction model + sector concentration) → Phase C (equity macro modifier) → Phase D (strategy set + earnings handling) → Phase E (factor identification + 14d observation) → Phase F (two-stage exit ablation calibration). Phase G (cross-asset ranking parity, B81) remains post-launch reference. Timeline: 35-45 nominal / 55-65 conservative. Code starts at Phase 0 corp-actions audit when Kyle gives green light. Full paper trail in `Claude Comms and Packages/Cross-Session Briefs/` (5 docs) + `Claude Comms and Packages/Langston Design Asks/` (4 docs). |
| 2026-05-17 | CC | **xStock Calibration Phase 0 SHIPPED (B-NEW-42 audit + B-NEW-42b structural fix).** Phase 0 audit confirmed 3 structural TEC gaps via regression tests (forward-split stop fires / reverse-split phantom-promote / halt-resume-gap unfillable fill). B-NEW-42b shipped the price-discontinuity-detector sentinel module + TEC integration (commit `d8e0f5885`, PM2 #293). All 3 gaps closed structurally across VTS / paper / live exit paths. Entry-side gating ACCEPTED OUT OF SCOPE per Kyle Option A (mirror-image scanner consult deferred to Phase 19 live-trading prep). Phase A unblocked. |
| 2026-05-17 | CC | **xStock Calibration Phase A.1 + A.2 SHIPPED (B-PHASE-A2 batch).** Phase A.1 design call closed (rev2 LOCKED via `B_PHASE_A1_DBS_design_ask_rev2.md`); 14-bucket sector taxonomy locked; constructor-option discriminator pattern selected; dual-floor mechanic locked (global ≥30 + sector-coverage ≥7). Phase A.2 implementation closed (commits `e84657110` → `a418a7731`, PM2 #294); two-instance `directional-bias-store.ts` extension + 265-entry registry sector mapping (all GICS + special buckets + ADR/cryptoAdjacent flags) + scanner pre-cycle DBS compute + eval-cycle propagatedDbs threading + module_constants migration (8 xstock_spot rows) + xstock_dbs_backfill table + backfill script. Step 7 first-pass: 31,481 rows / 260 of 265 symbols / all 14 sector tags exercised. Step 8 Langston independent verify: all 5 §3 items reproduced. Live ARCA-open telemetry verification scheduled (alert `7b33b931` fires 2026-05-18T13:35Z). **Phase A.3 next** (DBS distribution verification gate). **B-PHASE-E-PRE-1 placeholder queued from §3.3 11/11-missing SPDR escalation** — see Phase E entry below. |
| 2026-05-18 evening | Kyle directive | **B-NEW-34a lookback-tune approach ABANDONED + plan sequence resequenced.** xStock scanner stuck at insufficient_history=75 every cycle since Mon 13:30 UTC ARCA reopen. Three lookback-tune iterations all hit SCAN_TIMEOUT: 240h (22M source rows pre-DISTINCT-ON exceeded budget), 168h (15M still exceeded), 120h (deployed as last-ditch, only partially works — non-24/7 names lag Mon morning). **Root insight (Kyle 2026-05-18 22:25 UTC):** lookback bumping is the wrong axis. The bars exist in `xstock_spot_ohlc_1m`; the per-30s scanner cycle is re-deriving them via expensive DISTINCT ON dedup every time. The right architecture is pre-compute ONCE (slow query, fine for one-off) + cache the result + scanner reads from snapshot. **Two-step recovery plan locked:** (A) NOW — build B-NEW-34b: `xstock_spot_ohlc_60m_snapshot` table + one-off pre-warm script populating 60 bars × 265 symbols from archive + `xstockOhlcCache` modification to read from snapshot on cold cache + ~12h narrow-window live aggregator overlay for fresh bars. Scanner immediately recovers. ETA ~1-2 hours. (B) NEXT — **off-hours session-lifecycle controller batch RESEQUENCED UP** (was item 4 in 2026-05-18 plan above; now item 2 immediately after Step A): scheduled task at Fri 8PM ET (= Sat 01:00 UTC) refreshes the snapshot table with closing-week data; open xStock VTS trades marked `weekend_suspended` so VTS sim cycle skips them (solves #116 TEC stale fail-closed as side-effect); scanner explicitly stops Fri 8PM → restarts Sun 8PM with snapshot pre-warmed; un-suspend cycle at Mon 13:30 UTC ARCA full reopen. (C) **B-NEW-35 (two-table architecture, source-side dedup) RESEQUENCED DOWN** — was top-priority post-hotfix, now sequenced AFTER B (off-hours lifecycle) because the snapshot architecture solves the per-cycle IO issue first; B-NEW-35 then becomes the structural backstop for non-snapshot read paths + addresses Supabase IO budget root cause. (D) **B79.0n active-trading wire-in** stays sequenced AFTER A+B+C. Filed as RUNNING_ISSUES #118 revision. |
| 2026-05-18 | Kyle directive | **CRITICAL — xStock active-trading wire-in (B79.0n pattern) NEVER SHIPPED.** Surfaced 2026-05-18 evening during B-PHASE-A2 close debrief. Per `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §"Step 7 — Active-trading path wire-in (signal orchestrator + paper execution)" + this plan line 707 (2026-05-07 Kyle directive: "active-trading wire-in IS in scope (codepath end-to-end ready); live-trading testing of new asset classes deferred to Phase 19"), B79.0n was planned to follow B79.0m's VTS pipeline wire-in. The batch never executed. Every xStock infrastructure batch since B79.0m has shipped VTS-only: B79.0m.a, B79.0m.b, B79.0m.b2, B79.0d (ORB inline hook is dead — `eligibleSymbols` is FX5-only), B-NEW-14, B-NEW-34, B-NEW-42b, **B-PHASE-A2** all routed only into `registerOpenVtsTrade`. **Locked plan order (Kyle 2026-05-18):** (1) PAUSE further xStock infrastructure additions; (2) **B79.0n — Active-trading wire-in batch.** Wire xStock filters / MCE / regime / DBS / TEC / strategy detect paths through signal-orchestrator's active-trading dispatch (paper-execution-engine asset-class branching too). Active trading stays OFF; code path becomes end-to-end ready. Estimated 5-10 days. Verifiable up to Phase 19 gate. (3) **B-PHASE-A2 DBS consumed automatically** through B79.0n once orchestrator path wires — no extension to A.2 needed; xstockDirectionalBiasStore singleton + sector registry + MCE non-crypto branch already in place. B79.0n threads `propagatedDbs` from `getLatestXstockGlobalDbsSnapshot()` into the orchestrator's xStock-handling code path. (4) **Off-hours session-lifecycle controller batch** after B79.0n — proactive Fri 8PM ET wind-down + Sun 8PM ET re-up. Coordinates scanner / signal-orchestrator / paper-execution-engine / TEC cache via explicit session state (replaces current short-circuit-and-hope pattern). Filed as RUNNING_ISSUES #117 (active-trading wire-in gap). |
| 2026-05-17 | CC | **B-PHASE-E-PRE-1 placeholder added.** Sector-correlation factor work in Phase E (`b68_3_pair_correlation` repurposed to "correlation with own-sector ETF") requires SPDR ETF prices per symbol. All 11 SPDR sector ETFs (XLK / XLE / XLV / XLF / XLI / XLP / XLY / XLU / XLB / XLRE / XLC) MISSING from xStock registry as verified empirically by B-PHASE-A1 §3.3 check on 2026-05-17. **Path-1 (FRED daily-close + Yahoo intraday offline feed) locked as recommended approach** per Langston Step 4 R2 review. Paths 2 (basket-synthesize) + 3 (defer factor) REJECTED — circularity / silent factor drop respectively. Estimated 5-7 days for adapter + scheduled fetch + archive table + integration. Triggers at Phase E kickoff design ask; Kyle override window at Phase E kickoff if final path needs to change. Cross-referenced from `XSTOCK_CALIBRATION_PLAN.md` Phase E section. **Not blocking Phase A.3 / B / C / D** — DBS itself uses pair-OHLC only; sector ETF prices enter the picture only for Phase E factor compute. |
| 2026-05-18 night | CC | **B-NEW-34b SHIPPED — snapshot architecture replaces abandoned B-NEW-34a lookback-tuning.** Commits `d9031fe8d` (initial implementation) + `4fd780c3d` (Langston Step 4 revisions). Four artifacts: (1) NEW table `xstock_spot_ohlc_60m_snapshot` (PK on `(symbol, bucket_ts)`, ~16k rows max bound) holding pre-aggregated 60-min OHLC buckets per symbol. (2) NEW one-off pre-warm script `scripts/b-new-34b-prewarm-snapshot.ts` — per-symbol DISTINCT ON aggregation at 14-day lookback, UPSERTs into snapshot, idempotent. (3) `xstock-ohlc-cache.ts:getOHLCDataBatch` 60-min branch rewritten: cold-miss reads snapshot first (single SQL ROW_NUMBER) + calls live aggregator with NARROW 24h overlay via new optional `lookbackHoursOverride` param + merges (live wins on bucket_ts collision) + fire-and-forget write-back of most-recent 24 buckets per symbol. (4) Aggregator gained the optional 3rd param; default 120h preserved as forensic-caller fallback with WARNING header. **Langston Step 4 verdict:** APPROVE WITH 3 FINDINGS (Finding 1 sql.raw IN/VALUES → TODO B-NEW-35 parameterization, Finding 2 timestamp type verified=number, Finding 3 nit-only); Q1-Q7 design ACK applied including write-back N=24 (aligned to overlay window per Q1), 120h default preserved (Q4), 240-min DEAD comment (Q5), 3 override unit tests added (Q6). **Deploy path (Langston-approved bypass for additive new-table):** `psql -f` migration + manual `INSERT INTO _migrations` to record, then `npm run b-new-34b:prewarm -- --days 14` then `npm run build && pm2 restart`. Migration runner bypassed because it surfaced 17 pre-existing pending migrations (ledger drift — see RUNNING_ISSUES #119); proper reconciliation tracked separately. **Net per-cycle DB IO drop ~75-85%** vs the abandoned 120h live path. **Manual pre-warm protocol** (interim until B-NEW-36 lifecycle controller ships) documented in `.claude/memory/MEMORY.md`: anyone restarting scanner must run pre-warm first. PM2 #N TBD (restart pending pre-warm coverage of rotation-batch symbols). Step 11 completion report queued. |
| 2026-05-18 night | CC | **B-NEW-36 (off-hours session-lifecycle controller) UNBLOCKED — next batch.** Now that B-NEW-34b shipped the snapshot table + pre-warm script + cache snapshot-first path, B-NEW-36 owns the SCHEDULING surface: (a) Fri 8PM ET (Sat 01:00 UTC) scheduled task that runs the pre-warm script to refresh snapshot with closing-week data; (b) scanner explicit `unsubscribe(centralClock)` between Fri 8PM ET and Sun 8PM ET (true OFF, not "universe=0"); (c) `vts_open_trades.state='weekend_suspended'` marker — VTS sim cycle (`runPhase10SimulationCycle`) skips weekend-suspended trades → eliminates #116 TEC stale fail-closed for xStock as side-effect; (d) Sun 8PM ET (Mon 01:00 UTC) scheduled task re-runs pre-warm + scanner re-subscribe + un-suspend 24/7-name trades; (e) Mon 13:30 UTC un-suspend non-24/7 trades. Estimated 1-2 days. Sequenced AFTER B-NEW-34b verified stable on staging; BEFORE B-NEW-35 (source-side dedup) and B79.0n (active-trading wire-in). |
| 2026-05-19 morning | Kyle directive | **B-NEW-35 RE-SEQUENCED UP, ahead of B-NEW-36.** After B-NEW-34b shipped, pre-warm attempts at `--days 14`/`--days 7`/`--days 3` all hit 26 Postgres statement_timeouts on the heavy-traded blue-chip names (SPY, TSLA, NVDA, QQQ + ~22 others). The snapshot architecture alone cannot bridge that read cost because the live-aggregator fallback hits the same DISTINCT-ON dedup over B74's 18-56× duplicate writes. Kyle directive 2026-05-19: "we shouldn't be satisfied with these blue chip xStocks not populating... we need to see this as a problem that we need to solve and then come up with a solution for it." Locked sequence revision: **B-NEW-34b ✅ → B-NEW-35 next (was item C) → B-NEW-36 (was item B, off-hours lifecycle controller) → B79.0n last**. The structural source-side dedup MUST land before the off-hours controller because the off-hours controller's pre-warm cycle needs to complete inside its scheduled window — without dedup, the heavy-symbol pre-warm cost is unbounded. Filed as RUNNING_ISSUES #118 update. |
| 2026-05-25 | CC | **B79.0n.CONFIDENCE-CHAIN SHIPPED** (sub-batch 7 of 18 in B79.0n umbrella v4 arc — parallel-eligible with SCORING (#8) + TEC (#9)). Deploy commit `b6e45a8`, PM2 #319 at 18:00Z. Confidence-modulator chain per-class plumbing — 9 modulator modules seeded per-class (~65 new xstock_spot rows + 2 new global flag constants `b67_1_asset_class_no_op_active` + `b68_3_compute_correlation_enabled`). 7 modulator surface APIs gain REQUIRED `assetClass: AssetClass`. 7 `FactorAlternateInput` discriminated-union arms extended. MCE `refreshMacroConfig`/`refreshPairCorrelationConfig`/`refreshPhaseConfig` refactored to per-class enumeration with **atomic Map-replace pattern** (R-11 mitigation) — `ReadonlyMap<AssetClass, T>` cache fields. 16 chain-composition push sites threaded across signal-orchestrator + vts-runner with `safeResolveAssetClass` capture-and-reuse pattern. **R-10 mitigation:** paper-execution-engine + vts-service close-hook `updateEma` resolves assetClass from `position.symbol` / `tradeData.symbol`. **Per-class disposition decisions D-1 through D-5 (Langston Step 1 ACK ✅ AGREE):** macro modifier xstock_spot NO-OP via `assetClassNoOpActive=true` (equity-macro feed deferred Phase 24); pair-correlation xstock_spot reference symbol `SPY/USD` (DB-confirmed) + `computeCorrelationEnabled=false` v1 default; phase-preference per-class JSONB blob (xstock_spot = 9 enabled strategies × 3 phases = 27 cells); outcome-feedback legacy-as-crypto disk-load re-key migration; canonical ASSET_CLASSES enumeration + fail-hard on missing-class. Outcome-feedback store key `<assetClass>_<regime>_<strategy>` + persistent path move `/tmp/` → `/home/deploy/dawntrader/data/` (R-9 mitigation — survives pm2 restart). HARD-FAIL on corrupt new-path data (no silent fallback). Same path move for regime-phase-store. **2 hotfixes during deploy:** `da92a79` MANIFEST.txt drift; `b6e45a8` esbuild dynamic-require. Local tsc baseline 494 unchanged across 7 chunks. 26 NEW tests + 94 existing test updates pass. Anti-graveyard: 12 `@ts-expect-error` confined to dedicated type-lock harness; zero new `as any`/`@ts-ignore`/`!` in modulator production files. Langston Step 1+2+4+8 all FINAL ACK with 1 non-blocking DRY suggestion (deferred to perp-onboarding batch) + 1 deploy-runbook observation (RUNNING_ISSUES #140). Step 7+8 GREEN: 18 DB rows; MCE `per_class_count=2` at 18:00:36 UTC; 10 crypto ablation factors emitting at 18:06-18:07 UTC. **xStock metadata stamping watch-item:** Memorial Day holiday today 2026-05-25 paused live xstock signal cadence (last xstock ablation row at 14:03 UTC pre-deploy). Deferred to Tuesday 2026-05-26 13:30 UTC ARCA reopen. **Next sub-batches:** SCORING (#8) + TEC (#9) parallel-eligible. |
| 2026-05-20 | CC | **B-NEW-35 SHIPPED — source-side dedup for B74 WS-archived OHLC tables.** Canonical deploy hash `f001002d9` (Phase 3 code-deploy + in-buffer Map dedup hotfix). Three-layer dedup protection: (1) PostgreSQL UNIQUE constraint on `(symbol, interval_begin)` for all three `_ohlc_1m` partitioned tables; (2) Drizzle `.onConflictDoUpdate()` clause at `ohlc-batch-writer.ts:147-164` replacing prior plain INSERT; (3) in-buffer `Map<string, Insert>` dedup at `ohlc-batch-writer.ts:105-114` with insertion-order last-wins semantics, required because PostgreSQL throws "ON CONFLICT DO UPDATE command cannot affect row a second time" when a single INSERT contains duplicate conflict-target keys. **Cleanup volume:** ~23.2M duplicate rows removed across three tables (~84% reduction). Phase 1 finally shipped via bash-per-symbol pattern (`/tmp/dedup_per_symbol.sh` on staging) after 5 SQL revisions hit Postgres statement_timeout — institutional-memory rule now in SIM: bounded-subset DELETE on Supabase > 1M-row tables MUST use bash-per-symbol pattern from day one because PL/pgSQL DO-block LOOP wallclock accumulates against statement_timeout regardless of internal COMMITs. Phase 2 ADD UNIQUE in a `pm2 stop` window to avoid validation-time fresh-duplicate landings. Phase 3 code-deploy + in-buffer-dedup hotfix in same deploy window after live "cannot affect row" failure. **Post-fix verified state (Langston independent-verify ~07:30 UTC against staging at `f001002d9`):** xstock_perp_2026_05 = 277,970 rows; xstock_spot_2026_05 = 1,604,733; crypto_spot_2026_05 = 2,492,118; zero duplicate `(symbol, interval_begin)` rows in any of the 3 tables; UNIQUE constraints present on all 3; zero `ERROR/FATAL/ON CONFLICT/duplicate key` in `/var/log/dawntrader/out.log`; scanner cycle wallclock median ~530ms over last 20 cycles (vs 25s SCAN_TIMEOUT pre-fix, >40× recovery); pre-warm post-fix 265 syms in 206s with zero failures (vs 9+ hours and 26 statement_timeouts pre-fix); DBS telemetry firing per cycle (`CYCLE_DBS_TIMING dbs_compute_ms=1-8 pairs_with_dbs=73-74/75`). **Supabase tier sequencing:** Micro → Small (Kyle upgrade during dedup) → Medium ($60/mo, needed for SPY chunked path during Phase 1) → Small (back to $15/mo post-ship — write IO ~20× lower, read IO ~5× lower from DISTINCT-ON cost vanishing). **Five-symbol snapshot gap finding** (folded into B-NEW-36 sub-batch c): xstock_spot_ohlc_60m_snapshot has 260 distinct symbols (not 265); BITF/HOLX/PARA/SAGE/WBA have zero rows in both April AND May source partitions — empirical Kraken-side absence under canonical symbol form, not a B-NEW-35 bug. Filed as RUNNING_ISSUES #120. **Soak verification scheduled:** alert `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf` triggers 2026-05-27T07:00:00Z (zero duplicates + Supabase Disk IO < 30%/day). **Crypto regression: NONE** — crypto_spot is part of the three-table dedup; same protection; verified 2,492,118 rows with zero duplicates. **Locked next:** B-NEW-36 (off-hours session-lifecycle controller + ledger reconciliation + xStock universe-split cleanup, Langston scope rev4 FINAL ACK at commit `5b9f91b40` already in place; pre-audit gate clear). Then B79.0n active-trading wire-in. |
| 2026-05-20 | CC | **B-NEW-36 SHIPPED — three-sub-batch combined ship closes the off-hours session-lifecycle + ledger reconciliation + xStock universe-split cleanup chunk.** Sub-batches (a) + (c) at commit `4dfe1deb6`; sub-batch (b) at commit `4a997eae2`. **Sub-batch (a) — `_migrations` ledger reconciliation:** 17 rows backfilled into `_migrations` (16 governance migrations from 2026-05-08 → 2026-05-17 + B-NEW-35 Phase 1 rev6). Per-file verification log at `B_NEW_36_a_LEDGER_RECONCILIATION.md`. `npm run db:migrate` now reports zero pending. RUNNING_ISSUES #119 → RESOLVED. **Sub-batch (c) — xStock universe-split cleanup:** retired `XSTOCK_SPOT_24_7_SYMBOLS` 10-name designation (199 insertions / 435 deletions across 7 production files + 2 tests + 1 deleted test). Empirical Q9 verified all 10 names show zero weekend bucket activity in `xstock_spot_ohlc_60m_snapshot` over Sat 2026-05-16 → Mon 2026-05-18 — Kraken WS-equities feed carries no weekend price activity for ANY xStock regardless of marketing designation. Off-ARCA-hours scanner universe expanded from ~10 to ~265 effective. `isXstockMarketOpenUTC(symbol, now?)` now returns identical results for every symbol (param retained in signature for backward compat). Five-symbol gap (BITF/HOLX/PARA/SAGE/WBA) traced via Kraken AssetPairs probe — inconclusive (endpoint doesn't index xStocks); retire-vs-keep deferred per RUNNING_ISSUES #120 update. **Sub-batch (b) — off-hours session-lifecycle controller:** NEW `server/services/session-lifecycle-controller.ts` with two `node-cron@^4.2.1` scheduled timers (Fri 8PM ET shutdown + Sun 8PM ET restart, both `timezone: 'America/New_York'`), boot-time affirmative state reconciliation per Q7+Q7.1 (computes inside-weekend-window state, pauses/resumes scanner + bulk-suspends/restores xStock VTS trades to match), Q6 pre-warm circuit-breaker (failure doesn't block lifecycle work). NEW migration `vts_open_trades.state` column with CHECK constraint enforcing closed↔state AND state↔asset_class consistency (weekend_suspended xstock_spot-only). NEW migration `scheduled_tasks_audit` forensic table with index on `(task_name, status, fired_at DESC)`. Scanner gets `pause()`/`resume()` methods preserving `clockTickHandler` reference (distinct from `stop()`/`start()` — graceful drain semantics, subscription retained). `markOpenTradeClosed` extended to atomically set `state='closed'` (critical guard preventing CHECK-constraint failure on every trade close). `rehydrateOpenTrades` surfaces state column. NEW bulk helpers `markAllXstockWeekendSuspended` / `unmarkAllXstockWeekendSuspended` (UPDATE + in-memory Map mirror). VTS sim cycle gets `state` field on `OpenVirtualTrade` interface + iteration filter (`if (t.state === 'weekend_suspended') continue;`) in both symbol-collection + per-trade evaluation loops. `runPrewarm()` extracted as named export from B-NEW-34b pre-warm script (CLI wrapper preserved via `import.meta.url` direct-invocation detection). **Post-deploy verification (Wed 2026-05-20 12:08 UTC):** `boot_state_reconciliation` audit row written with `status='success'`, `insideWeekendWindow=false`, `scannerAction='none'`, `tradesAffected=0`; 162 open trades all `state='open'`, 924 closed all `state='closed'`, zero `weekend_suspended` (correct mid-week); CHECK constraint deployed with both R1+R1.1 clauses verified via `pg_get_constraintdef`; scanner running mid-week (73 pairs scanned in latest cycle post-restart). **Langston Step 4 CLEAN ACK + Step 8 CLEAN ACK** (independent psql verification of all four focus areas). **Closes RUNNING_ISSUES #116 partially** (xstock_spot weekend instance eliminated by side-effect — sim cycle no longer routes weekend-suspended xstock trades to TEC eval; crypto_perp + xstock_perp residual sporadic-consumer fail-closed still open). **Sub-batch (b) governance pass also added Langston dispatch-anchoring rule** (`/home/langston/CLAUDE.md` §12) — explicit inbox-path in dispatch prompt OVERRIDES MEMORY-stated batch context (failure mode observed and caught via verification-anchor pattern earlier in same session). **First real timer fire:** Fri 2026-05-22 8 PM ET (= Sat 2026-05-23 01:00 UTC) — first test of pre-warm circuit-breaker + bulk-suspend + scanner pause + audit row. **NEW RUNNING_ISSUES #121** logged from Langston Step 8 PM2 log inspection: `setNullReason is not defined` ReferenceError spamming VTS Phase 10 simulation path — out of scope for B-NEW-36 (b); Tier 2 hygiene batch. **Locked sequence completed: B-NEW-34b ✅ → B-NEW-35 ✅ → B-NEW-36 ✅ → B79.0n (last).** Crypto regression: NONE (by-construction; all DB ops scoped on `asset_class='xstock_spot'`; CHECK constraint physically rejects crypto+weekend_suspended; scanner pause scoped to `xstockSpotScanner` instance). |
| 2026-06-01 | CC | **B-XSTOCK-CALIB F-NOW SHIPPED — calibration_state tag plumbing (VTS-only).** Deploy `cdac422b9`, CI `26757161780` all-4-green. Phase-24 plumbing so Phase 25 can exclude the pre-calibration xStock cohort. **No threshold-table population** (pure tagging/plumbing batch — no §9 threshold deltas). Added `calibration_state` to `vts_open_trades` (NOT NULL DEFAULT, back-stamped 1,793 xStock rows) + `exit_strategy_alternates` (nullable, 17,184 xStock VTS rows backfilled); writer propagates parent's tag via `resolveCalibrationState(originalSignalId)`. **Audit-miss recovery:** v1 pre-audit missed that the exit-ablation aggregator feeds the live xStocks-tab panel; Kyle pushback → exclusion reworked OPT-IN (default-off, INERT until Phase-25 caller; §9.1). Crypto regression NONE (crypto carries the harmless default tag, never read; live panels byte-identical). Active trading OFF. |
| 2026-06-08 | CC | **B-NEW-54 SHIPPED — retired the legacy ML predictive microservice (between Phase-24→19 ITEM 3).** Working-list **item F.2 (ml-service restart fix / 184k restart counter) RESOLVED VIA REMOVAL** — investigation reframed it: the helper was decorative (predictions logged-and-discarded), the real ML is future Phase 17/18, the counter was cumulative-historical (un-restartable helper, not a live crash loop). Kyle decided to retire rather than fix. Deleted the Python service+client+deps; stripped ML from boot_orchestrator (VTS preserved); removed the fire-and-forget block, health field, `dawntrader-ml` PM2 app, ML Dockerfile steps, `ML_SERVICE_*` env; drift-detector retrain → no-op. Head `87865efd7`, CI all-4-green; Langston Step-4+Step-8 APPROVE; staging clean (process gone, dump 0/0, health 200). `ml-calibration.ts`+freeze-controller+`/internal/calibration` → Phase-16 register (#174). Completion report `B_NEW_54_COMPLETION_REPORT.md`. Active trading OFF. |
| _(append rows here at every batch close, plus any mid-batch finding that changes the plan)_ | | |

---

## Update 2026-05-26 — B79.0n.SCORING + B79.0n.TEC closed (sub-batches 8 + 9 of umbrella v4)

**Sub-batch 8 — B79.0n.SCORING CLOSED 2026-05-26** (Step 6 deploy `ceeaa15c6` + R-5 hotfix `29bfda74f`, PM2 #322). SQE module_constants per-class extension for `crypto_perp` + `xstock_perp`; `crypto_spot` numeric threshold promotion from code-side hardcoded defaults to DB (values verbatim per Langston D-4: 25/25/10/0.005). Predictive-confidence cache key F-2 fix: `${assetClass}:${regime}:${strategy}` (cross-class telemetry contamination eliminated, 3 callers threaded). Static-mirror-fallback counter via `getSQEStaticMirrorFallbackStats()`. SQE_EVAL log line now carries `assetClass=` + threshold tags (R-5 schema parity, runtime dormant-test). **TWO-STEP per Langston D-5 pushback:** B79.0n.SCORING.b queued for EXISTS-gated wildcard retirement + F-1 resolver hooks for SCORE_WEIGHTS + RANKING_WEIGHTS after 48h verify-gate close. [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_SCORING_COMPLETION_REPORT.md).

**Sub-batch 9 — B79.0n.TEC CLOSED 2026-05-26** (same deploy chain). TEC module_constants per-class extension from 5 keys × 4 active classes (B79.0m.b legacy) to all 11 keys × 4 active classes (44 total rows; 0 wildcard post-Migration-2). HARD-FAIL kill-switch on `break_even_enabled` preserved; other 10 keys softened from strict `requireKey<T>` throw to observable `pick(key, TEC_DEFAULTS.x)` with per-key `[B79.0n.TEC][PICK_FALLBACK]` counter via `getTECPickFallbackStats()`. `tec-evaluator.resolveTECConstants` consolidated to sync per-class cache lookup (eliminates async DB round-trip + silent `catch → DEFAULTS` fallback). `trailing-exit-controller.ts:107` comment chronology updated citing Kyle 2026-05-21 directive (D-1 root cause). **B79.0n.TEC.b queued** for strict 11-key HARD-FAIL restoration via `requireKey<T>` (7-day SLA per Langston Step 4 ACK). [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_TEC_COMPLETION_REPORT.md).

After SCORING.b + TEC.b close, 8 sub-batches remain (10-18); xStock active-trading flip lands at sub-batch 18.

---

## Update 2026-05-26 — B79.0n.TELEMETRY closed (sub-batch 10 of umbrella v4)

**Sub-batch 10 — B79.0n.TELEMETRY CLOSED 2026-05-26** (Step 6 deploy `02bad33a6`, PM2 #323 at 18:01:48Z; CI all-4-green at run `26465795903`). Completes the B79.0a per-asset-class `TelemetryAggregator` instance pattern. Factory at `server/services/asset-class-instances.ts` extended from 2-of-4 active-class coverage (`crypto_spot` via no-touch fence → null; `xstock_spot` via dedicated in-memory triad) to **4-of-4** — `crypto_perp` + `xstock_perp` gain dedicated in-memory triads of their own. Compile-time `assertNever` exhaustive-switch enforcement covers ASSET_CLASS_REGISTRY's 4 reserved-future classes (`forex_spot`/`forex_perp`/`equity_spot`/`equity_perp`) via explicit `[CLASS_NOT_WIRED]` throws. New non-arming-read companion `peekTelemetryInstance()` export backs the new `getTelemetryInstanceStats()` accessor that serves the 48h verify-gate signal — perp recordCount must stay 0 since per-class VTS-writer threading deferred to WIRE-IN (#16). Per Langston AGREE on scope Q1 (**Variant C**), new instances are in-memory only by construction — direct `new TelemetryAggregatorService()` bypasses the global singleton's `setInterval(persist, 5min)` arm because the persist-timer arming is structurally gated INSIDE `getTelemetryAggregator()` factory only. **crypto_spot no-touch fence held** — 18mo+ live disk-persist state at global singleton untouched across the entire deploy; HYPE/USD, LULU/USD, LMWR/USD, XRP/GBP and others continued recording normally post-restart. **No DB migration; no API extensions; no SQL schema changes; no UI tabs.** Step 3 implementation commit `12e451d037` (+980/-48 LOC across 12 files = 7 production + 5 new test). 28 NEW tests + 93 existing telemetry-related tests pass unchanged. Local tsc baseline 457 errors unchanged. Single CI iteration before green (one test fixture update on b79-0b suite for new 4-of-4 factory coverage). Langston Step 1 + 2 + 4 + 8 ALL FINAL ACK at ~18:14Z. **48h verify-gate alert** `1f34cf84-a37c-425c-a1c4-54924b053061` armed at triggers_at 2026-05-28T18:01:48Z. **Deferrals:** Q3 caller-site API per-class threading → OBSERVABILITY (#18); Q4 SQL `telemetry_history.asset_class` column → TELEMETRY.b (no SLA today — opens when first non-crypto_spot active class persists across restarts in live trading); `getTelemetryInstanceStats` `/api/diagnostics` route → OBSERVABILITY (#18). **RTB (#11) is now unblocked** — Adaptive Ratio Manager consumes per-class telemetry instances for signal aggregation. [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_TELEMETRY_COMPLETION_REPORT.md).

After TELEMETRY close, 7 sub-batches remain (11-17 plus the 18 active-trading flip); RTB (#11) is the immediate next per umbrella v4 row #11.

---

## Update 2026-05-27 — B79.0n.RTB closed (sub-batch 11 of umbrella v4; combines former #11 RTB + former #12 RTB-REFRESH)

**Sub-batch 11 — B79.0n.RTB CLOSED 2026-05-27** (Step 6 deploy `6fd6bcac6`, PM2 #324 at 11:10:31Z; CI all-4-green at run `26507336347` on `a4ac36c`; backfill-dotenv hotfix `6fd6bca` rebased on `a4ac36c`). **Combines former sub-batch #11 RTB + former #12 RTB-REFRESH** per Kyle directive 2026-05-27 (same surface — RTB queue layer + RTB-refresh cadence; combine reduces sequencing risk + duplicate Step 1/2 work; CC + Langston agreed via pre-scope review). **Sub-batch count 18 → 17** for the remaining roadmap; subsequent sub-batches re-number accordingly (former #13 POOL now #12, former #14 ORCHESTRATOR now #13, etc.). **Per-class queue partitioning + cadence seed batch.** Schema-side: `rtb_signals.asset_class VARCHAR(32)` added as first-class column via 4-phase production-safe migration pattern (Phase 1 nullable + 4 module_constants cadence seed → Phase 2 backfill dual-path → Phase 3 CHECK + composite index → Phase 4 SET NOT NULL contingent on §6.4 48h zero-null gate). Code-side: `server/services/rtb-refresh-service.ts` LOCKED-module refactor — `signalBuckets: Map<AssetClass, Map<number, Set<string>>>` Option A nested per-class buckets per Langston C-1 (Option B starvation scenario walked through to consensus; under shared CPU pressure Option B starves xstock under crypto's larger volume). Shared global ACT pool (3-10 default 5) preserved per C-2 — ACT measures process-level CPU, not asset-class metric. `RTB_ACTIVE_CLASSES: readonly AssetClass[]` const + non-active-class warn path. Caller surface 25 across 4 RTB files / 2,655 LOC. `_RTB_GK` wildcard resolver at 8 FSM-threshold read sites preserved per C-8 §3.4 lock (FSM thresholds class-invariant today; per-class divergence requires EXISTS-gated explicit-row evidence). Module-constants cadence seed: 4 `rtb_config.refresh_interval_ms = 30000` rows uniform across all 4 active classes per Kyle directive 2026-05-27 (per-class plumbing operationally live — xstock value can change via DB-only UPDATE later without code change). `PromotionEvent.assetClass?: string` optional-additive field per C-7. New `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` per-class telemetry probe. `getQueuedSignals(mode, assetClass?)` + `getRankedSignals(mode, limit, assetClass?)` gain optional asset-class filter for hot read paths. `tcl_watchdog.checkSignalThresholdLive` JSDoc documents NEW-Q1 + NEW-Q2 decisions. `rtb_queue_refresher.ts` RETIRED (file deleted; zero production callers verified via Grep across server/client/shared). `server/index.ts` boot pre-warm enumerates 4 active classes + cadence values + HARD-FAIL `process.exit(1)` if any row missing. **Step 1.a architectural synthesis re-done after Kyle pushback** on hasty scope v1 (v1 cited 1 file / 1,809 LOC + 7 caller sites; v2 surfaced 4 files / 2,655 LOC + 25 caller sites + schema gap + LOCKED-module status). Step 3 implementation `8dd10c7b6` (+2083/-210 LOC across 24 files = 13 prod + 11 new test) + MANIFEST.txt drift hotfix `298cb2e76` + Step 4 change list `7650879eafb` + R1 fix-up `a4ac36c` + backfill-dotenv hotfix `6fd6bca`. 53 new unit tests across 11 files pass in 3.33s locally. **Step 4 Langston code review CLEAN-WITH-R1** (R1: package.json `b79-0n-rtb-backfill` script must be in HEAD before Step 5 push — landed as fix-up + N1+N2 folded inline + N3 deferred to completion report). Step 5 CI all-4-green on `a4ac36c`. Step 6 deploy: `npm run db:migrate` applied Phase 1 + Phase 3 in MANIFEST order (table empty so Phase 3 precondition trivially passed with 0 nulls) → `npm run b79-0n-rtb-backfill` NO-OP clean → `npm run build` → `pm2 restart`. **Step 7 first-pass + Step 8 second-pass verification ALL GREEN.** HTTP 200; boot pre-warm at 11:10:31Z; HARD-FAIL gate held; retire-line at 11:10:34Z; `_migrations` ledger shows both phases applied 11:09:21Z; `\d rtb_signals` confirms column + CHECK + index; 4 module_constants rows present; zero error-log hits; UI login screen renders cleanly. Langston Step 8 ACK GREEN with independent psql + log probes triangulated against CC's first-pass evidence. **Active-trading impact today ZERO** — paper_sim_trades + trades both empty; per-class buckets stay empty until scanner pipeline emits signals; structural pre-warm-only exercise. Active signal flow lands in WIRE-IN (#16). Crypto regression: NONE by construction (every silent crypto default became explicit `'crypto_spot'` literal; class-invariant FSM thresholds via wildcard `_RTB_GK`; ACT pool unchanged; shared cadence 30000ms unchanged). **POOL (#12) is now unblocked** — Adaptive Ratio Manager consumes per-class telemetry instances (TELEMETRY) + per-class queue depth + queue partitioning (this batch) as the substrate for cross-class pool sizing. [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_RTB_COMPLETION_REPORT.md).

After RTB close, 6 sub-batches remain in the umbrella v4 roadmap (POOL → ORCHESTRATOR → EXECUTION → WIRE-IN → ML-CALIBRATION (T2) → OBSERVABILITY (T2) + active-trading flip).

---

## Update 2026-05-27 — POOL (#12) SKIPPED as standalone sub-batch

**Decision:** Kyle directive 2026-05-27, after CC pre-scope architectural analysis. POOL is removed from the umbrella roadmap. Sub-batch count drops 17 → 16; subsequent sub-batches re-number (ORCHESTRATOR now #12, EXECUTION now #13, WIRE-IN now #14, ML-CALIBRATION now #15, OBSERVABILITY + active-trading flip now #16).

**Reasoning.** POOL was originally specced as the Adaptive Ratio Manager extension to all four active classes — building cross-class pool sizing logic + per-class ARM instances driven by per-class telemetry (from TELEMETRY #10) and per-class queue depth (from RTB #11). The Adaptive Ratio Manager solves a specific selection problem: when you have N scannable pairs and your scanner can only cycle through M per cycle where M << N, which M do you pick? Crypto's M:N ratio (~300 of 1500) makes Ideal-vs-Rotational allocation meaningful — choosing the right 300 out of 1500 has real performance consequences. xStock's universe is 489 pairs (per B79.0n.UNIVERSE-DISCOVERY first cycle) with a fast scanner cycle (~72ms steady-state per B79.0a load-test, p95 well under 100ms). The scanner can cover the entire xstock universe per cycle with budget to spare — there is effectively no selection problem for xStock. Building ARM machinery for xstock_spot would build infrastructure without a corresponding decision to make. Perp classes (crypto_perp + xstock_perp) are not on the near-term roadmap — crypto_perp (Kraken Futures, ~10 contracts) moved to post-launch by Kyle 2026-05-27; xstock_perp is a type-system registry placeholder (Backed Finance issues xStocks as spot tokens only — no perp product exists at Kraken).

**Pre-batch architectural state (from Step 1.a investigation).** Three Adaptive Ratio Manager instances are constructed by `asset-class-instances.ts` factory at lines 144 (xstock_spot, B79.0a), 167 (xstock_perp, B79.0n.TELEMETRY 2026-05-26), and 183 (crypto_perp, B79.0n.TELEMETRY 2026-05-26). **None are consumed by any production code.** The xstock scanner at `server/asset_classes/xstock_spot/scanner.ts` imports `getXstockSpotInstances()` to read the triad but accesses only `telemetry`, `scanManager`, `failureTracker` — never `ratioManager`. Only test files (`b79-0b-asset-class-instances.test.ts`, `b79-0a-arm-injection.test.ts`, `b79-0n-telemetry-arm-injection.test.ts`) reference the unused field. The three dead instances are benign: no persist-timer arming (Variant C invariant — direct construction structurally bypasses arming), no crypto state bleed (crypto uses the module-level singleton `adaptiveRatioManager` at `adaptive-ratio-manager.ts:307`, not the factory), no interference with active code paths.

**Cleanup disposition.** The 3 dead ARM constructions + the unused `ratioManager: AdaptiveRatioManager` field on the `AssetClassInstances` interface + the dead `import { AdaptiveRatioManager }` at line 86 of `asset-class-instances.ts` are **deferred to ORCHESTRATOR (#12) as one of its Step 3 chunks.** ORCHESTRATOR will be touching the asset-class factory + scanner-orchestration surfaces anyway, so removing the dead-code fits naturally without spinning up a micro-batch. Tests will need parallel cleanup (delete or refactor the 3 test files that exercise the ARM injection contract). Crypto's module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` remains unchanged.

**Re-evaluation trigger.** POOL re-opens as a sub-batch if any of: (a) xStock universe grows materially past 1500 pairs (current 489), (b) xstock scanner cycle slows beyond 200ms p95 (current ~72ms steady-state), (c) a new asset class onboards with a real M:N selection problem. RUNNING_ISSUES entry to track.

**Sub-batches remaining after POOL skip (5):** ORCHESTRATOR (#12) → EXECUTION (#13) → WIRE-IN (#14) → ML-CALIBRATION T2 (#15) → OBSERVABILITY T2 + active-trading flip (#16). ORCHESTRATOR is next per umbrella v4 sequencing — signal-orchestrator + paper-execution-engine threading per-class is the substrate for active-trading wire-in.

---

## Update 2026-05-27 — B79.0n.EXECUTION closed (sub-batch 13 of umbrella v4, last per-class plumbing before WIRE-IN)

**Sub-batch 13 — B79.0n.EXECUTION CLOSED 2026-05-27** (deploy commit `f283c2c`, PM2 #326 at 17:30:13Z; CI all-4-green at run `26527276989` 2m17s). Sub-batch 13 of 16 in B79.0n umbrella v4 arc — **LAST per-class plumbing sub-batch before WIRE-IN (#14, Phase 19a)** per Kyle directive 2026-05-27 (proceed autonomously with Langston while he was away). **TradeClosedEvent additive assetClass + position-record SSOT cleanup + diagnostic endpoint v2 nested-by-layer payload.**

CHUNK A landed the additive optional `assetClass?: string` field on `TradeClosedEvent` (server/lib/event-bus.ts) mirroring `PromotionEvent.assetClass` C-7 doctrine from B79.0n.RTB — all 3 listeners verified safe (paper-execution-engine self-handler, c13-validation-service, c14-validation-service). Emit site at `paper-execution-engine.ts:1545` populates `assetClass: position.assetClass` (canonical SSOT read from L2147 entry write per B79.TEC Finding 2, NOT re-resolved from symbol) + new canary log `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED]` per Langston Step 2 B2 mitigation for runtime observability once xstock active trading lights up.

CHUNK B landed position-record SSOT cleanup at `paper-execution-engine.ts:1376` (outcomeFeedback hook). Switched `safeResolveAssetClass(position.symbol, 'kraken')` re-resolve to `position.assetClass ?? safeResolveAssetClass(...)` belt-and-suspenders fallback per Langston Step 1.a Q4-B audit + Step 2 B2 reframe (defensive NOT load-bearing — L922 B79.TEC NO_FALLBACK hard-fails before flow reaches L1376 if position.assetClass missing).

CHUNK C restructured `/api/diagnostics/orchestrator-per-class-state` to v2 nested-by-layer payload `{ orchestrator: {...}, execution: {...}, _meta: { schemaVersion: 2, coverage: ['orchestrator','execution'], lastReviewed: '2026-05-27', knownGaps: [...] } }`. URL retained per Langston Q3 ACK (continuity over misleading-URL cost; zero callers verified across client/server/scripts via Step 1.b A6 thorough grep). Execution layer surfaces openPositions per class + recentCloses24h + wildcard feePercent/slippagePercent + CLASS_NOT_WIRED for perp variants. `_meta.knownGaps` inline-surfaces 3 deferred items (fee/slippage dispatch class-member wildcard, sizing-core risk-pct/max-position-pct mode-keyed, narrative-feed assetClass) — operators see deferrals without consulting docs.

CHUNK E landed 12 source-file regression-lock tests in `b79-0n-execution-audit.test.ts` (4 CHUNK A interface+emit+canary + 1 CHUNK B SSOT cleanup with no-throw skip semantics per Langston B3 + 7 CHUNK C nested payload + knownGaps + perp CLASS_NOT_WIRED + exchange-defaults import). All 12 green in 631ms.

Step 1.a CC architectural read narrow-scope hypothesis ACK clean with Langston Q4-A/B/C/D additions: TRADE_OPENED audit (no production emit path → NO WORK); position SSOT 1 drift site (CHUNK B); fee/slippage WILDCARD class-member (deferred to Phase 25/26 same as sizing-core); trading-engine + micro-execution dormancy holds (OUT). Implementation sequence per Langston Step 2 B5 #3: B → A → C → E (B validates SSOT discipline before A propagates downstream).

Step 4 Langston code review ACK CLEAN on all 5 C-asks with 3 non-blocking follow-ups (line-number drift in `_meta.knownGaps` future cleanup; JS-filter on 24h cutoff future SQL-pushdown candidate at WIRE-IN volume; canary log volume gating behind env flag once xstock past 30d burn-in).

Step 7 first-pass + Step 8 second-pass verification ALL GREEN. HTTP 200 in 16ms, diagnostic endpoint v2 payload verified (5 top-level keys, xstock 0.50 cap visible, perp CLASS_NOT_WIRED in BOTH layers, 3 knownGaps surfaced), PM2 #326 stable ~2m uptime, paper_sim_open_positions COUNT=0 + paper_sim_trades total-ever COUNT=0 matches endpoint exactly, zero error-log hits, Langston ACK GREEN at all 5 probes.

Langston C4 4-surface checklist: surfaces 3 (counter shape) + 4 (perp CLASS_NOT_WIRED regression) verified today; surfaces 1 (canary log) + 2 (outcomeFeedback EMA store) deferred to WIRE-IN per same structural gap as RTB + ORCHESTRATOR Step 7 closures (active trading off, paper_sim_trades empty by design pending WIRE-IN #14).

**Active-trading impact today ZERO.** Crypto regression: NONE by construction (additive optional field + defensive fallback + URL retained). New ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 (additive event-payload field pattern) + §4.24 (deferred-gap registry closure rule) codified for future per-class state batches.

**Next sub-batch: B79.0n.WIRE-IN (#14, Phase 19a).** Active trading flip; canary log + outcomeFeedback EMA store key + counter math all become observable on first trade landing. [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_EXECUTION_COMPLETION_REPORT.md).

---

## Update 2026-05-27 — B79.0n.ORCHESTRATOR closed (sub-batch 12 of umbrella v4)

**Sub-batch 12 — B79.0n.ORCHESTRATOR CLOSED 2026-05-27** (deploy commit `5e08568`, PM2 #325 at 13:17:34Z; CI all-4-green at run `26513242197`). Sub-batch 12 of 16 in B79.0n umbrella v4 arc — renumbered from #13 after POOL skip 2026-05-27. **Per-class consumer-site swap pattern + POOL skip cleanup.**

New domain-specific dispatcher at `server/asset_classes/pattern-pool-dispatch.ts` — `getPatternPoolGuardrailsForAssetClass(assetClass: AssetClass): PatternPoolGuardrails` with exhaustive switch over 8 AssetClass union members + `_exhaustive: never` lock + `[CLASS_NOT_WIRED]` throws for 6 non-spot classes with activation breadcrumbs pointing future onboarders at ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.22 + explicit `PatternPoolGuardrails` return type. Mirrors B79.0n.MCE `getFrictionForAssetClass` co-location pattern (domain-specific dispatcher file, not central SSOT — avoids all-classes-import coupling). **Consumer-site swaps (3 production + 1 diagnostic):** `paper-position-sizing.ts:145` (sizing function gains REQUIRED `assetClass: AssetClass` param threaded from 2 callers via `resolveAssetClass(signal.symbol, 'kraken')` deterministic per Langston Step 2 Probe 8 ACK no-silent-fallback; reads dispatcher result for MAX_POSITION_PCT cap); `signal_quality_evaluator.ts:285` (reads dispatcher via `input.assetClass` REQUIRED per B79.0n.STORAGE); `routes.ts:12645` `/pattern-pool` endpoint (gains optional `?assetClass=` query param). **Dead-import cleanup at signal-orchestrator.ts:101** — Step 1.a probe found PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS as unused imports; cleaned to keep DEFAULT_ASSET_CLASS only (still referenced at lines 670 + 1397 per "crypto active-trading path by construction" docstring at lines 1377-1379). **POOL skip cleanup at asset-class-instances.ts** — `ratioManager: AdaptiveRatioManager` field deleted from `AssetClassInstances` interface + import deleted + 3 dead factory ARM constructions deleted (xstock_spot/xstock_perp/crypto_perp); crypto module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` UNTOUCHED. **3 POOL test file dispositions:** DELETE `b79-0n-telemetry-arm-injection.test.ts` (95 LOC removed contract); REFACTOR `b79-0a-arm-injection.test.ts` + `b79-0b-asset-class-instances.test.ts` + `b79-0n-telemetry-factory.test.ts` (7 `.ratioManager` refs → `.failureTracker`/`.scanManager`/`.telemetry` assertions). **NEW `/api/diagnostics/orchestrator-per-class-state` endpoint** — no-auth public (B79.0a pattern); returns per-class JSON for wired classes + `{ status: 'CLASS_NOT_WIRED', reason }` for perps. **27 new tests** across 3 files (11 unit dispatcher + 7 unit consumer-swaps + 8 integration cascade with key-aware DB mock catching wrong-value-threaded-correctly bug class per Langston Q1). Local tsc baseline 494=494 unchanged. 14 files / +677/-131 LOC net. **Real behavioral correction visible at Step 8 endpoint:** xstock_spot pattern signals now route to 0.50 MAX_POSITION_PCT (DB-resolved) instead of crypto-bound 0.15 — takes effect at WIRE-IN (#14) when active trading flips; Phase 19 calibration validates xstock's 0.50 placeholder value. Active-trading impact ZERO today. Crypto regression: NONE by construction (same values via dispatcher; only routing layer changes). Step 1.a iteration with Langston converged after CC refined Q2 surface (cost-model.ts + market-regime.ts ARE proper dispatchers; signal-orchestrator.ts had 2 dead + 1 live import). Step 4 Langston ACK CLEAN with 4 non-blocking observations. Step 8 Langston second-pass ACK GREEN — all 5 independent probes passed. Telegram msg_ids 4275 (scope dispatch) + 4276 (Step 1 ACK relay) + 4277 (pre-audit dispatch) + 4278 (Step 2 ACK relay) + 4279 (Step 3+4 dispatch). [Completion report](../Claude%20Comms%20and%20Packages/Batch%20Completion/B79_0n_ORCHESTRATOR_COMPLETION_REPORT.md).

After ORCHESTRATOR close, 4 sub-batches remain in the umbrella v4 roadmap (EXECUTION → WIRE-IN → ML-CALIBRATION T2 → OBSERVABILITY T2 + active-trading flip).

---

## ITEM-4 record (2026-06-10) — separation landed; what it changes for this plan
Item 4 (separate VTS/paper/live + labeled learning substrate) CLOSED — see `ITEM_4_UMBRELLA_COMPLETION_REPORT.md`. Plan-relevant deltas: (1) **the learning store key is now `(source, assetClass, regime, strategy)`** — any future per-class calibration that touches outcome-feedback MUST name the source partition (VTS calibration writes/reads `vts_*` only); (2) **per-source calibration epochs are live governance** (ADJUSTMENT_FRAMEWORK "CALIBRATION EPOCHS") — xStock calibration batches that change scoring inputs must bump the affected source epochs and say so in their completion reports; (3) VTS is standalone always-on — xStock calibration data accrues regardless of active-trading state; (4) the throughput study measured xStock+crypto concurrent load comfortably within the current box (no capacity blocker for the calibration arc). **Working-list review this batch: no list items changed state** (item 4 was orthogonal to the 15-minute-bar recalibration items; the B.2 lq_min item remains in flight — point-tighten gated on 5 true-RTH sessions, apply expected 2026-06-10/11 on Kyle's conditional GO).

## WORKING LIST — items to reset / recalibrate for the xStock 15-MINUTE BAR switch (Kyle directive 2026-06-03)

> **LIVING TRACKER. Maintained + updated during every governance batch while the xStock calibration is in progress; retired when calibration completes (CLAUDE.md carries a temporary pointer to this list until then).** xStock chose 15-min over the inherited 60-min (B.4 study, `B_4_BAR_FREQUENCY_RESULTS_REPORT.md`; Langston 2-round sign-off). The bar-interval change is a FOUNDATION change — biggest risk = silent regime-classifier meaning-shift (`market-regime.ts:108-119` invariant). Plain-language companion: `B_4_15MIN_RECALIBRATION_LIST.md`. Status keys: ☐ not started · ◐ in progress · ☑ done. All xStock-scoped (crypto untouched).
>
> **Review 2026-06-09 (item-4 Phase B step-1 governance): no status changes** — the calibration arc sits at its honest endpoint (B.5 closed; W2.x/W3 data-blocked → Phase 25 via the 2026-07-05 provenance-accrual gate). Adjacent note: item-4 step 1 made VTS **standalone-always-on**, so Phase-25 studies will draw from an uninterrupted firehose even while Phase-19 paper debugging starts/stops engines (previously every active-trading experiment would have gapped the VTS dataset).
>
> **★ 2026-06-04 — FOUNDATION SWITCH LANDED (B.4 foundation, deploy `ae2ddc845`, CI `26939587681` all-4-green).** Section A (the bar-frequency sub-batch) is COMPLETE: 60-min → 15-min bar plumbing, TIME-anchored per-class regime/DBS lookbacks, 14 recalibrated regime thresholds, DBS history recomputed at 15m, VN/DI recalibrated, weekend prewarm depth, ORB plumbing-ready — all with the **regime-label PARITY exit gate PASSED + Langston SIGNED OFF**. Section B's bar-SENSITIVE foundation items (regime thresholds B.1 REDO + IMF VN/DI B.2) also landed here. **Still open (not-yet):** ORB `enable` flip (RUNNING_ISSUES #203), pattern-detection (section D), per-strategy gates + trade-construction (section E / W2), and the 2 activation-readiness soak conditions (wall-clock flip-rate + live-15m mix confirmation). Active trading OFF throughout.

> **★ 2026-06-08 — CALIBRATION ARC AT ITS HONEST ENDPOINT; the data-block's forward-unblock instrument is now BUILT + LIVE.** The B.5 per-strategy calibration reached an honest endpoint (W2.1 closed; W2.0a geometry keep-baseline; W2.0b entry-trigger INCONCLUSIVE-by-backward-data). The decision-provenance forward-capture that W2.0b was waiting on (was RUNNING_ISSUES #206 / roadmap 19-20) is now **BUILT + DEPLOYED + LIVE-PROVEN** as B-NEW-53 / 53.1 / 53.2 (both spot classes; xStock 36,531/36,531 = 100% coverage). So Sections D/E/F are no longer "blocked on building the instrument" — they are **DATA-ACCRUAL-blocked → Phase 25**, self-clearing via the `7362f63f` proof-of-capture §10.5 alert (2026-07-05) that re-surfaces the entry-trigger sweep (roadmap 25-12) on the captured rows. **Phase 24 (xstock_spot onboarding) is now GOVERNANCE-CLOSED** (umbrella report `Claude Comms and Packages/Batch Completion/PHASE_24_UMBRELLA_COMPLETION_REPORT.md`). This working list stays live until the Phase-25 calibration completes.

### A — FOUNDATION (the bar-frequency sub-batch; precedes all strategy work; gated by the regime-label PARITY report) — ✅ LANDED 2026-06-04 (B.4 foundation, deploy `ae2ddc845`)
| Item | Subsystem | What 15m needs | Status |
|---|---|---|---|
| Aggregator interval typing | ohlc-aggregator (15m branch, bucketExpr `/900`, `MAX_BARS_15M=240`) + scanner `getOHLCDataBatch` 60→15 flip | ✅ 15-min interval added + NEW `xstock_spot_ohlc_15m_snapshot` table + cache 15m branch (DRY-parameterized snapshot helpers) | ☑ |
| Regime lookbacks | regime classifier — `computeMomentum` + `computeADX` per-class via `RegimeConfig.momentumLookback`/`.adxPeriod`, resolved in `refreshRegimeConfig` | ✅ TIME-anchored per-class in `module_constants`: momentum 30→120, ADX 14→56 (≈30h/≈14h); crypto keeps shared 30/14 with a startup PARITY ASSERTION | ☑ |
| Regime thresholds | `regime-thresholds.ts` xStock vol/mom/ADX/DBS (14 consts) | ✅ 14 thresholds RECALIBRATED percentile-preserving + CALIBRATION-LENS (vol ↓~40%, ADX ↓~50%, DBS ~flat); 60m-old retained inline; study `b4-regime-recalib-study.ts` | ☑ |
| MCE indicator periods | MCE — momentum/ADX threaded per-class (above); other indicator windows ride the 15m bar substrate | ✅ regime momentum/ADX per-class; remaining per-strategy indicator periods (SMA-20, RSI band, etc.) carried into the per-strategy W2 work (section B/E) | ☑ (foundation portion) |
| **DBS** | DBS — `computeDirectionalBias` lookback + emaPeriods + normalization ATR (per-class); `xstock_dbs_backfill` | ✅ per-class `module_constants`: lookback 48→192, ema 12/26→48/104, atr 14→56 (≈48h/≈12h/≈26h/≈14h); backfill RECOMPUTED at 15m (31,481 60m rows → NEW `xstock_dbs_backfill_60m_archive`; 332,176 new 15m rows stamped `bar_interval_minutes=15`). NO split-brain (uniform 15m + 60m archived). Crypto keeps `DEFAULT_DBS_CONFIG` (Option B; →module_constants deferred, RUNNING_ISSUES #200) | ☑ |
| Bar caps | aggregator/cache — `MAX_BARS_15M=240`, 6h overlay, write-back 24 | ✅ derived for the 15-min window (240 cap sized to DBS-192 + margin) | ☑ |
| **Weekend-resume warmup depth (Kyle 2026-06-03)** | weekend off-hours controller / Sunday-reopen prewarm — `xstock-ohlc-cache` prewarm snapshot + `xstock_spot_ohlc_1m` archive retention | ✅ prewarm script now warms BOTH 60m (cap 60) + 15m (cap 240) snapshots so the reopen fully populates the longest 15m lookback (DBS 192 bars ≈48h); 1-min archive retention reaches far enough to rebuild the 15m warmup history | ☑ |
| ORB plumbing | ORB — candle source + `open_range_minutes` window + DB enable flag | ✅ ORB now rides the scanner's 15m candle feed + its time-based opening-range window maps onto 15m (plumbing-ready). `enable` STAYS FALSE — activation is a separate strategy-fit decision (RUNNING_ISSUES #203, section E) | ☑ (plumbing) / ◐ (enable deferred) |
| Load/storage gate | infra — ~4× 15m snapshot write rate vs CPX22 budget | ✅ deployed at pm2 #347, HTTP 200, no crash-loop, CI all-4-green; no asset-class shedding | ☑ |
| **EXIT GATE** | regime — old-60m vs new-15m label diff | ✅ PARITY REPORT PASSED + Langston SIGNED OFF: clean-60m→clean-15m max |Δ| 1.30pp, no collapse (old cutoffs would balloon STRUCTURAL_TRANSITION to 51%; new restore 30.7%). 2 activation-readiness conditions banked (wall-clock flip-rate; live-15m mix confirmation). Engine `b4-regime-parity.ts` | ☑ |

### B — ALREADY CALIBRATED (at 60m), bar-SENSITIVE → must REVISIT
| Item | Subsystem | Status |
|---|---|---|
| Regime thresholds (B.1) | regime — same as row A.3 (REDO) | ☑ DONE in B.4 foundation (14 thresholds recalibrated, parity exit gate PASSED — see section A) |
| Strategy indicator-gates (B.3 / B3.1a) — pivot_shift `indicator_filter` (RSI 35–65 + ADX-slope), sma_trend_ride / mean_reversion `indicator_filter` | filters (per-strategy) — bands sit on the 60m distribution; re-check/re-center at 15m | ☐ (per-strategy W2 — section E) |
| IMF filters — VN + DI components (B.2) | IMF — volatility/directional pieces are bar-based → revisit | ☑ DONE in B.4 foundation: confirmed BOTH bar-sensitive; 16 `screener_filters` rows recalibrated (di_max 30/35/40→40.3/42.8/45.2 contracting toward 50; vn_max 0.85→0.826 on 4 active families; VN near bar-invariant). Migration `2026-06-04-b4-foundation-vndi-15m-recalib.sql`; Langston signed off |

### C — bar-INDEPENDENT → STAYS (sanity-check only, no redo)
- Fee model ☑ B-4.5 SHIPPED 2026-06-11 — DB-governed Tier-1 (0.80/0.40), round-trip 1.80%/1.82%, taker both legs; admit-rate recalibration impact lands with the 06-11T19Z comparison. [unaffected by 15m bars]
- IMF/global liquidity filters — lq_min ☑ APPLIED 2026-06-10 (43→38 main 22 paths + strong_trend relational max(30,main−5)=33; five-session recheck 433/485 names vs 128/485; Langston Step-4 APPROVE + Kyle GO; relational contract recorded in ADJUSTMENT_FRAMEWORK §5.2). min_depth_usd still open (order-book depth, not bars — $5,000 active gate flagged 'revisit at Phase-19 active flip').
- B3.1b volume-confirmation removal (wrong-instrument data at any interval).
- Friction (B.4/5), TEC priors (B.6), sector (B.7), macro (C) — outcome/cost based, bar-independent.

### D — PATTERN-DETECTION (after foundation, before per-strategy; Kyle sequencing)
- `pattern-recognizer.ts` shape tolerances (MORNING_STAR body/range ratios, INSIDE_BAR tolerance, etc.) → make per-class + re-derive for 15m; re-measure base rates at 15m (shapes differ by interval). ☐

### E — PER-STRATEGY (W2, after pattern-detection) — ◐ PARTIALLY RESOLVED; entry-trigger DATA-BLOCKED (2026-06-06)
- Each strategy's `filters` (gate bands) + its trade construction (entry trigger, stop/target geometry, CLOCK-anchored hold, indicator periods, pattern tolerances) re-tuned at 15m; re-enable + re-fit the deferred equity-suitable strategies + ORB. ◐
- **W2.1 hold-time (ms unification): ☑ CLOSED** (commit `8bec43a9b`) — bar-count/hours hold keys → `max_holding_ms`; correctness fix, no re-tune.
- **W2.0a stop/target GEOMETRY sweep: ☑ CLOSED** — re-tuning geometry yields ≈no generalizing edge (Mode-A OHLC parity failed → Mode-B on recorded `originalStopPrice`, 98.3% walk-fidelity). Verdict = **keep-baseline / INCONCLUSIVE-by-default**; only `vwap_bounce` (N=103) a thin pre-register candidate. Confirms HCE: lever = selectivity, not post-entry geometry.
- **W2.0b ENTRY-TRIGGER / admission sweep: ◐ INCONCLUSIVE-by-backward-data → DATA-BLOCKED.** Detect-replay harness (`scripts/b5-w20b-entry-replay.ts`) cannot clear the ≥99% parity gate on historical data (vwap_pullback maxed 80%); the exact decision-time inputs (esp. the forming bar) were never persisted. **The decision-provenance forward-instrument it was blocked on is now BUILT + LIVE-PROVEN (B-NEW-53/53.1/53.2, 2026-06-07/08 — both spot classes, xStock 100% coverage);** so this is now DATA-ACCRUAL-blocked, NOT build-blocked → Phase 25. The `7362f63f` proof-of-capture §10.5 alert (2026-07-05) re-surfaces the entry-trigger sweep (roadmap 25-12) to re-run exact on the forward-accrued provenance rows. Full writeup `B_5_W20b_CONCLUSION.md`.
- **W2.2 per-strategy re-fit + W3 ORB re-enable:** downstream of W2.0b's entry evidence → the entry-trigger dimension is data-blocked with W2.0b; the geometry dimension is keep-baseline (W2.0a). ORB still needs its DST-aware anchor + 15m-bar-unit fixes + holiday calendar (#203) when un-blocked. **CARRY-FORWARD (don't lose): W2.0a's `vwap_bounce` thin pre-register geometry candidate** (N=103, ~0.75× tighter stop, test R +0.125, within 1 SE of 0) — pre-register for a forward power test (~100+ trades) when the arc resumes; do NOT seed until it clears forward. ☐

**ORB note (Kyle asked):** ORB revives under 15-min (was disabled in B-NEW-34 only because 60m left no intra-hour opening range). Not a free flag-flip — requires the row-A.7 candle-source + window + enable work, then validation.

### F — POST-ARC (run ONLY after ALL of A–E land; Kyle directives 2026-06-04)
- **F.1 — Historical outcome re-evaluation STUDY + report (Kyle 2026-06-04).** Once the 15-minute bar functionality AND all the follow-on calibration (A–E) are deployed, replay the OLD (60-minute-era) simulated trades through the FULLY-calibrated 15-minute setup: re-classify each historical bar's regime under the new thresholds, re-run which strategies would have fired, and re-evaluate whether each past trade's outcome would have been the same or different. **A sanity-check study + report only ("are we on the right track?"), NOT a live change / not a history rewrite.** Extends the parity-replay engine (`scripts/b4-regime-parity.ts`) downstream through strategy selection + trade-outcome simulation. **Strictly gated AFTER A–E complete.** ☐
- **F.2 — ml-service high-restart investigation (Kyle 2026-06-04).** PM2 `ml-service` shows restart_time ≈184k (~one restart/20s) while the main `dawntrader` process is healthy + isolated. Per Kyle's condition (NOT a current functional issue — main system unaffected, crypto untouched) it is DEFERRED to run **right after all currently-defined plan steps (A–E)**. Diagnose the crash-restart loop root cause + blast radius (does anything depend on it / is it doing real work between restarts?) + fix. Surfaced by Langston at B.4 Step-8 (2026-06-04). **★ RE-SEQUENCED 2026-06-08:** Kyle moved this up to **item 3 of the between-Phase-24→19 plan** — it is being addressed NOW (before the standalone-VTS + AMR items), not after A–E. The investigation already concluded the 184k counter is BENIGN (cumulative-never-reset, 49d stable, 0 unstable_restarts, empty error log); the REAL fix = the process is named `ml-service` but the ecosystem config names the ML app `dawntrader-ml`, so its `max_restarts:5` guardrail is NOT attached + there's a dual spawn path (`boot_orchestrator` also spawns `services/ml_service.py`). Unify under one managed name + guardrails. Canonical ordering: `PHASE_24_TO_19_READINESS_CHECKLIST.md` §4. ◐ (item 3, in progress) 

---

*End of MULTI_ASSET_VTS_EXPANSION_PLAN.md. Living document — update at every batch boundary. Move to `_archive/` when Phase 19 closes.*
