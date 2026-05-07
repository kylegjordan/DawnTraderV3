# Multi-Asset VTS Expansion — Living Plan Document

> **Status:** LIVING. Update this doc BEFORE every batch in this stretch (sanity-check assumptions still hold) and AFTER (record what landed vs. what's now expected). Per Kyle directive 2026-05-07.
> **Owner:** Claude Code, with Langston review at every step gate.
> **Created:** 2026-05-07
> **Window:** 2026-05-07 → 2026-05-15 (8 days). Hard fence at 2026-05-15: B67.5 consumer-wiring window opens, calibration cohort closes.
> **Change log:** see §11 at bottom.

---

## §1. The pivot — what changed and why

Kyle directive 2026-05-07: **skip Phase 16 (legacy cleanup) for now and use the 8-day observational period to ship the Modularization phase + Multi-Asset VTS expansion.** Phase 16 stays parked. Active trading is NOT in scope for this stretch — work stops at "fully working in VTS" for the new asset classes. Active-trading wire-in waits for **Phase 19** (component-by-component active trading audit).

Reason for the pivot: every prerequisite for adding the new asset classes is now in place — B69 asset-class plumbing live, Kraken XStocks + Kraken Futures feed already scanning + archiving, B72-family lever migration complete, B76 chain-final calibration framework working. The 8 days are wasted if we sit on legacy cleanup when we could ship this expansion observationally.

Confidence in 8-day fit: HIGH (Kyle ground-truth: CC consistently does in hours/days what it estimates in weeks). Conservative gate: if any single batch slips two days past target, defer the LAST one (B81 ranking parity is most deferrable; B78 modularization is on the critical path).

---

## §2. Scope summary

**In scope (this stretch):**
- B78 — Modularization phase (8-module extraction across `(exchange, asset_class, filter, strategy, regime)`).
- B79 — Equity_spot (Kraken XStocks Pro) integration into VTS.
- B80 — Crypto_perp (Kraken Futures) integration into VTS.
- B81 — RTB ranking parity + SQE asset-class evaluation in VTS.

**Out of scope:**
- Active trading wire-in for any new asset class (Phase 19).
- Phase 16 (legacy cleanup).
- Crypto_spot threshold tuning (LOCKED through 2026-05-15 per calibration window).
- Anything that touches the chain-final calibration framework on crypto_spot.

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

The B67.4/B68.x calibration windows measure per-factor predictive lift on `asset_class='crypto_spot'` rows. Every `regime_factor_alternates` row carries its `asset_class` tag (B69 work, 2026-05-03 ship). Adding equity_spot/crypto_perp rows to that table does NOT contaminate the crypto_spot calibration windows — the aggregator filters by asset_class.

**Mandatory aggregator-query update (lands in B78 governance):** `drift-dashboard-aggregator.ts` `computeFactorCalibration` query gets `AND asset_class = 'crypto_spot'` added to the WHERE clause. One line, no schema change. Ensures pre-2026-05-15 calibration analysis stays scoped to crypto_spot regardless of how much equity_spot/crypto_perp data accumulates in the table.

**No-touch fence — Step 0 of every batch in this stretch (mandatory pre-flight + post-deploy check):**

```sql
-- Pre-flight before any code change deploys
SELECT factor_name, COUNT(*) AS n_last_hour
FROM regime_factor_alternates
WHERE asset_class='crypto_spot'
  AND captured_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```

Confirms crypto_spot ablation continues at expected cadence (~10 factors × ~12 evals/hr ≈ 120 rows/hr). If it drops materially post-deploy, halt and revert. Same query post-deploy: verify cadence didn't shift. Documented in CLAUDE.md §2 Step 7 as B78+ pre-flight requirement.

---

## §4. Sequencing (8 days, working backward from 2026-05-15)

| Batch | Days | Description | Active-trading impact | Critical path? |
|---|---|---|---|---|
| **B78** | 1-3 | Modularization phase. 8-module extraction. Pure file/import refactor. CI green is the gate. Adds asset-class filter on aggregator query. | None | YES |
| **B79** | 4-5 | Equity_spot (Kraken XStocks Pro) into VTS. Threshold derivation, regime mapping, strategy gates, VTS-only path. 24/5 calendar handling. | None (VTS only) | medium |
| **B80** | 5-6 | Crypto_perp (Kraken Futures) into VTS. Same shape as B79; funding-rate handling joins macro modifier on perps. | None (VTS only) | medium |
| **B81** | 6-7 | RTB ranking parity (`expectedNetReturnR` primitive). SQE asset-class threshold rows. Friction-normalized cross-asset opportunity scoring. | None (RTB-only ranking change) | LOW (most deferrable) |
| Slack | 7-8 | Bug-fix + Langston Step-8 second-pass on whichever batches need it. Buffer. | — | — |

If B78 or B79 slips: B81 moves to post-Phase-16 per Kyle directive. B80 also deferrable. The minimum viable end-state for this stretch is "B78 + B79 shipped, B80 + B81 either shipped or scoped-and-deferred."

---

## §5. B78 — Modularization phase (Day 1-3)

**Goal:** structural refactor of `server/` so per-asset-class logic lives in proper modules. With this scaffolding, B79/B80 become "implement the equity_spot module" and "implement the crypto_perp module" rather than "shoehorn new logic into crypto-shaped files."

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
│   └── equity_spot/                        ← scaffolded, populated in B79
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

## §6. B79 — Equity_spot (Kraken XStocks Pro) into VTS (Day 4-5)

**Pre-existing infrastructure to verify (not rebuild):**
- Kraken XStocks pairs already scanning + archiving (Kyle confirmed 2026-05-07).
- B69 asset-class plumbing live: `resolveAssetClass(symbol, 'kraken')` returns `'equity_spot'` for XStocks pairs (verify in pre-audit).
- `regime_factor_alternates` already accepts `asset_class='equity_spot'` (no schema change).

**What's new in B79:**

### §6.1 Operational facts about Kraken xStocks (from web research 2026-05-07)

- **Tokenized equities**, 1:1 backed by underlying stocks/ETFs.
- **Fractional buying supported** down to **$1 minimum**. Same sizing semantics as crypto — no "must buy whole share" constraint. Position-sizing convention from crypto carries over: $1000 base → ~$150/trade.
- **Trading hours: 24/5** (24h Mon-Fri, closed weekend). NOT 24/7. **VTS must pause equity_spot evaluations on weekends** to avoid stale-price evaluations and false signals during the gap.
- **Settlement: Solana on-chain** (SPL tokens). Affects Phase 19 active trading wire-in (custody / withdrawal / transfer) but NOT VTS.
- **100 listings as of 2026-05-07**, growing toward 500 by year-end. Pair list is dynamic.
- **Geographic restriction:** not accessible US/Canada/UK/Australia. Kyle in UAE — clear.

**Action item:** weekend-pause logic is the only NEW execution-flow concern for VTS. Implementation: SQE evaluation gate checks `assetClass==='equity_spot' && isWeekendUTC()` early-return with a `pairsSkippedWeekendClosure` null-reason counter. ~10 LOC.

### §6.2 Threshold derivation — three-layer approach

**Layer 1: Domain-knowledge baseline (Day 4 morning, 1-2h):**
- Equity_spot intraday ATR%: ~0.5-2% vs crypto's 2-8% → halve volatility-regime thresholds for equity_spot.
- Tighter spreads (~5-15 bps vs crypto's 10-50 bps) → friction model uses tighter spread distribution.
- Trends slower-moving but more persistent → ADX threshold can drop 25-30 → 15-20 because trends are weaker but more reliable.
- DI threshold tighter (less directional noise).
- Volume profile U-shaped (open + close peaks, midday flat) → liquidity_min threshold time-of-day aware.

**Layer 2: Cross-asset shadow-classify (Day 4 afternoon, 2-3h):**
- Run `calculatePairRegime` on equity_spot historical OHLC (B70 archive has this since 2026-05-04).
- Inspect 100-200 historical bars per pair across 10-15 representative XStocks pairs (AAPLx, NVDAx, MSFTx, SPYx, QQQx, etc.).
- TFS detection sanity check: does it fire on clearly-trending stocks (AAPL Q1 2024-style behavior) without firing on whipsaws?
- RBS sensitivity check: stocks tend to range-bound midday — does RBS over-fire? If yes, tighten RBS confidence threshold for equity_spot.
- Output: `asset_classes/equity_spot/regime-thresholds.ts` with deltas vs crypto baseline.

**Layer 3: Shadow-mode VTS collection (Day 5-7, ongoing during B80/B81):**
- VTS evaluates equity_spot signals in shadow mode (no admission, no active trades).
- 48-72h window collects: signals/day per pair, regime distribution, factor lift comparable to crypto baselines.
- Calibration discipline matches B67.4 — tertile-monotonic WR + ≥7pp HIGH-LOW gap gate before Phase 19 considers active.
- Compressed to 48-72h vs crypto's 14-day windows because thresholds start from a known-correlated baseline rather than scratch.

### §6.3 Strategy gates per asset class

`MULTI_FAMILY_ELIGIBILITY` map in `canonical-regime-strategy-map.ts` is asset-class-agnostic in v1. For equity_spot:
- `vwap_pullback`, `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce` should map cleanly. Same regime detection inputs (OHLC + ADX + momentum) work on equity bars.
- `liquidity_trap`, `dhma`, `abcd_long` may not detect properly — pattern-based, depends on crypto-specific microstructure. **B79 Step-2 audit:** pattern-match each strategy's detect logic against equity behavior; either keep or scope-disable per asset class.
- New module_constants rows: `module='strategy.<key>', asset_class='equity_spot'` for any threshold that varies. Most-specific-wins resolver picks them up automatically.

### §6.4 SQE evaluation per asset class

`sqe_config` module already supports `asset_class` resolution dimension (B69). New rows seeded:
- `sqe_config.di_min` for `asset_class='equity_spot'`: tighter than crypto (e.g., 15-20 vs 25-30).
- `sqe_config.adx_min` for `asset_class='equity_spot'`: 15-20 vs 25-30.
- `sqe_config.momentum_min` for `asset_class='equity_spot'`: scaled by ATR% ratio.

NO code change to SQE itself. Just module_constants seeds.

### §6.5 Friction model per asset class

`server/asset_classes/equity_spot/friction.ts` — fees + slippage tuned for tokenized equities. Kraken XStocks fee schedule per pair (need to verify on-chain Solana settlement adds anything beyond Kraken's spread). Spread distribution from B70 archive (already capturing tick data).

### §6.6 Numbered objectives for B79

1. Weekend-pause logic in VTS evaluation gate.
2. Equity_spot threshold rows seeded in `module_constants` (regime, sqe, friction).
3. Strategy detect functions audited against equity microstructure; non-applicable strategies scope-disabled per asset class.
4. VTS shadow-mode emits equity_spot signals into `signal_eval_archive` AND `regime_factor_alternates` (no admission).
5. Verify `asset_class='equity_spot'` rows accumulating in both archive tables.
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
- New `sqe_config` rows for each `asset_class IN ('equity_spot', 'crypto_perp')` × each gate.
- NO code change to SQE itself. SQE already reads from module_constants per scope. Verifies it works in shadow mode for new asset classes during B79/B80.

### §8.4 Open architectural questions (Langston review at B81 Step-1)

1. **Pool-relative vs absolute normalization:** pool-relative means rankings shift as the pool composition changes. Cleaner alternative: absolute scale `expectedNetReturnR / typical_winning_R(asset_class)`. Pool-relative is simpler; absolute is more interpretable in dashboards. Langston should weigh in.
2. **CONTEXT_BONUS asset-class scoping:** does the regime-pool fit bonus translate cleanly to equity_spot? CONTEXT_BONUS rewards signals that match the global regime context. Whose global regime — crypto's or equity market's? B81 Step-2 audit needs to surface this. Probably needs per-asset-class context bonus values.
3. **Position-sizing parity:** $1000 base → $150/trade works for crypto and tokenized equities (same fractional sizing). Does it work for perps too (~10x leverage native to perps)? Default to "yes, same dollar notional" but flag for Langston review.
4. **Friction in R-units vs $:** R-units make ranking comparable; $ makes P&L direct. Probably store both, rank on R, P&L-track on $.

### §8.5 Numbered objectives for B81

1. `expectedNetReturnR` computed at signal admission per signal in RTB pool.
2. Pool-relative normalization within RTB cycle.
3. New ranking formula deployed; old formula removed (no fallback).
4. SQE asset-class threshold rows seeded for equity_spot + crypto_perp.
5. Verify: VTS RTB pool ranks signals across asset classes by friction-adjusted opportunity score.
6. Verify: no-touch fence holds. crypto_spot ranking behavior changes ONLY in the friction-normalization, not in confidence math.
7. Governance + Langston MEMORY sync.

---

## §9. Threshold-derivation cross-reference table (for §6, §7, §8 use)

This is what gets populated as we work through B79/B80 thresholds. **Update this table at the close of each batch.**

| Threshold | crypto_spot (locked) | equity_spot (B79) | crypto_perp (B80) | Source / rationale |
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
| _(append rows here at every batch close, plus any mid-batch finding that changes the plan)_ | | |

---

*End of MULTI_ASSET_VTS_EXPANSION_PLAN.md. Living document — update at every batch boundary. Move to `_archive/` when Phase 19 closes.*
