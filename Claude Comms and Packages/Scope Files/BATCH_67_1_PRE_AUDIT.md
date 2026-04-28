# Batch 67.1 — Pre-Implementation Audit

**Sub-deliverable:** B67.1 — Macro Confidence Modifier
**Author:** Claude Code
**Date:** 2026-04-28
**Status:** APPROVED 2026-04-28 by Langston (cc-inbox #844). All 4 open questions resolved — see §6.
**Companion to:** `BATCH_67_1_SCOPE.md`
**Methodology:** SIM consultation per CLAUDE.md §9 + code-level inspection of every affected file + §11 decision 12 BTC-correlation codebase grep.

---

## 1. SIM consultation — components affected

Per CLAUDE.md §9: every component touched by B67.1 traced for upstream / downstream / shared state / background execution / blast radius.

### 1.1 SIM §5.1 — `calculatePairRegime()` (`server/core/metrics/market-regime.ts`)

| Dimension | Today | Post-B67.1 |
|---|---|---|
| **Upstream** | OHLC candles (60-min); DBS score from MCE | OHLC unchanged; DBS unchanged; **NEW:** optional `macroModifier: number` parameter, threaded from MCE |
| **Downstream** | VTS Runner (via MCE); Signal Orchestrator (via MCE); `getDynamicRegimeScore()` (advisory only) | All three unchanged structurally. Confidence VALUE changes when `b67_1_enabled`; consumers unaffected because no consumer reads `confidence` as a gate today. |
| **Shared state** | None — pure function of (ohlcData, dbsScore) | None — pure function of (ohlcData, dbsScore, macroModifier) |
| **Background execution** | Synchronous, called per pair per MCE cycle (60s) | Unchanged |
| **Blast radius** | HIGH per SIM (regime determines strategy selection) | HIGH unchanged. **But scoped:** the LABEL is preserved; only the confidence number changes. No regime-to-strategy map change; no SQE threshold change; no FinalScore weight change. The high blast radius applies to the LABEL, which is unchanged. |

**Code-level inspection 2026-04-28:** function body lines 128-185. Confidence is set per-branch then clamped `Math.min(Math.max(confidence, 0.4), 0.95)` on line 176. Modifier application happens BEFORE the clamp so the clamp catches any out-of-band products. Clamp upper bound raised 0.95 → 1.0 to accommodate 0.95 × 1.05 = 0.9975. **Verified zero callers depend on the 0.95 ceiling** via grep `0\.95` in callers — no assertions found.

**`isHighConfidenceRegime(result)` callers:** zero. Function is dead code as a consumer (definition exists at line 261 but no `isHighConfidenceRegime(` invocations anywhere in `server/`). Confidence is currently decorative — confirmed.

### 1.2 SIM §5.2.5 — Market Context Engine (`server/services/market-context-engine.ts`)

| Dimension | Today | Post-B67.1 |
|---|---|---|
| **Upstream** | OHLC data (caller-provided); `calculatePairRegime()`; `CANONICAL_REGIME_STRATEGY_MAP` | + `externalMacroFeed.getLatest()` (NEW singleton service) |
| **Downstream** | Signal Orchestrator; VTS Runner; `market-indicators.ts` `getMarketIndicators()`; `getDominantRegime()` | All unchanged structurally. MarketContext gains an optional `macro` field. |
| **Shared state** | Per-symbol context cache (60s TTL), singleton instance | + macro snapshot caching belongs to `external-macro-feed.ts` (singleton, separate cache) |
| **Background execution** | Synchronous per-symbol per cycle | Unchanged. Macro feed polls separately via internal scheduler — does NOT add latency to per-pair MCE call |
| **Blast radius** | HIGH per SIM (all regime + indicators flow through MCE) | HIGH unchanged. Net change: one optional field added to MarketContext, populated only when `b67_1_enabled`. |

**Code-level inspection 2026-04-28:** `computeContext` body, line 162: `calculatePairRegime(ohlcData, directionalBias.score)`. B67.1 wire-in: read `externalMacroFeed.getLatest()` once per cycle outside the per-pair loop (it's already cached in the singleton with 60s TTL); compute `macroModifier` once per cycle, pass it to every `calculatePairRegime` call in this cycle. **NOT per-pair recomputation** — macro modifier is global, not per-pair.

### 1.3 SIM §5.1b + §5.1c — DBS Store + Directional Bias

**No B67.1 change.** B67.1 is downstream of DBS. DBS still feeds the regime classifier as it does today. The macro modifier is independent — a multiplier on the classifier's confidence output AFTER DBS-aware classification.

### 1.4 SIM §5.5 — `getMarketIndicators()` (`server/services/market-indicators.ts`)

| Dimension | Today | Post-B67.1 |
|---|---|---|
| **Upstream** | MCE singleton; Telemetry Aggregator (fallback) | Unchanged |
| **Downstream** | Signal Orchestrator (market indicators); ranking context bonus | Unchanged |
| **Blast radius** | MEDIUM per SIM | UNCHANGED — B67.1 does not touch `getMarketIndicators`. |

### 1.5 SIM §4.1 — Signal Orchestrator + §7.1 — VTS Runner

**No structural change in B67.1.** Both consume MCE output via existing paths. The B67.0 ablation hooks already exist in both files (signal-orchestrator.ts line ~617 active path, vts-runner.ts line ~1349 VTS path) with empty `alternate_decision`. B67.1 wire-up is to populate that JSONB, not add a new hook.

**Inspection 2026-04-28:** `signal-orchestrator.ts:629` carries the comment "(macro modifier), B67.2 (phase), B67.4 (outcome feedback), B68.1" — the B67.0 work already pre-staged the comment for these. Wire-up is straightforward.

### 1.6 No B67.5 consumer files touched in B67.1

B67.5 wires regime confidence into 7 consumer files (FinalScore in score-calculator.ts, Kelly sizing in paper-position-sizing.ts, EV gate in expectancy.ts, strategy routing tiebreak, TEC parameters at trade-open, VTS feature column, RTB tiebreak). **None of these are touched in B67.1.** Confirmed.

---

## 2. Pre-existing BTC-related logic — §11 decision 12 audit

Per master plan §11 decision 12 + Langston Step-2 review point: codebase grep for any pre-existing BTC correlation / dominance logic that B67.1 might double-count or cancel.

### 2.1 Grep results (5 files, 14 hits)

| # | File | Lines | What | Conflict with B67.1? |
|---|---|---|---|---|
| 1 | `server/config/canonical-regime-strategy-map.ts` | 125 | Regime description text "volatility-first vs momentum-first dominance" | NO — descriptive text, not logic |
| 2 | `server/core/metrics/adaptive-goals-weight.ts` | 7 | Comment "AI confidence dominance" | NO — different sense of "dominance" (ML weighting, not BTC) |
| 3 | `server/strategies/defensive-hedge.ts` | 160, 162, 163, 223, 244, 269 | **Per-pair Spearman correlation between asset returns and BTC returns**, gate at `Math.abs(corr) >= DH_MAX_CORRELATION`, decorrelation score in confidence formula | **CRITICAL — see §3.4 below** |
| 4 | `server/services/market-snapshot.ts` | 7, 26 | Pre-existing `MarketSnapshot.btcDominance?: number` field with stub value `54.2` | **CRITICAL — see §3.5 below** |
| 5 | `server/services/pattern-recognizer.ts` | 104, 120, 139 | Comments about "directional dominance" in pattern wick analysis | NO — pattern detection geometry, not BTC |

### 2.2 Conclusion

Two real findings. Three irrelevant matches. Both real findings are addressed in §3 below.

---

## 3. Coexistence requirements

### 3.1 B62 DBS-integrated classifier

B62 made DBS the primary input to `calculatePairRegime`. B67.1 modulates the confidence output AFTER classification. **No conflict** — DBS continues to drive regime LABEL; macro modifier scales CONFIDENCE on top. The two are independent dimensions of the same decision.

### 3.2 B63 mode-overlay-bypass for `sourcePool='quant-strong_trend'`

Already established in `BATCH_67_PRE_AUDIT.md` V2: B67.1 does NOT touch TEC, mode overlay, or sourcePool routing. The strong-trend lane bypass is a CONSUMPTION-side concern; B67.1 only changes the confidence VALUE that consumers read. Consumers handle their own gating. **No B67.1 sourcePool gate needed** (per Langston cc-inbox #842 reconfirmation).

### 3.3 Pattern Pool guardrails (FINAL_SCORE_FLOOR=0.45, MAX_POSITION_PCT=15)

Pattern Pool sits downstream in FinalScore + position sizing — both untouched in B67.1 (B67.5 territory). **No conflict.** Reconfirmed Langston cc-inbox #842.

### 3.4 `defensive-hedge` per-pair BTC correlation — orthogonal, not in conflict

`defensive-hedge.ts` lines 160-269 compute `btcCorrelation = spearmanRankCorrelation(assetReturns, btcReturns)` and use it for:

- **Entry gate:** if `Math.abs(btcCorrelation) >= DH_MAX_CORRELATION` → reject signal
- **Confidence component:** `decorrelScore = (1 - Math.abs(btcCorrelation) / DH_MAX_CORRELATION) * DH_DECORR_WEIGHT` contributes to the strategy's own confidence number

**Comparison to B67.1:**

| | `defensive-hedge` BTC correlation | B67.1 BTC dominance |
|---|---|---|
| Quantity measured | Per-pair return correlation with BTC over a rolling window | BTC's market-cap share of total crypto mcap (%) |
| Time scale | Rolling correlation, hours-to-days | Macro market state, days-to-weeks |
| Decision point | Strategy-level entry filter inside `defensive-hedge` | Regime classifier confidence modulator (system-wide) |
| Effect when extreme | Rejects highly-BTC-correlated pairs | Penalizes regime confidence in extreme-dominance regimes |
| Affects all strategies? | NO — only `defensive_hedge` strategy reads it | YES — modulates regime confidence consumed by all signals |

**Conclusion:** orthogonal signals at different decision points. No double-counting risk. Both can fire simultaneously without either canceling the other. Documented here and to be reflected in the SIM update at Step 10.

**Defensive flag:** if a future batch promotes per-pair BTC correlation into the regime classifier itself, that batch must re-evaluate this coexistence claim. Not an issue today.

### 3.5 Pre-existing `market-snapshot.ts` stub — must reconcile, not parallel-create

`market-snapshot.ts` already declares the carrier type `MarketSnapshot` with the EXACT fields B67.1 needs:

```ts
export type MarketSnapshot = {
  utcIso: string;
  btcDominance?: number;          // %
  totalMarketCapUsd?: number;
  avgVolatility30d?: number;
  avgVolume24hUsd?: number;
  trendScore?: number;
  riskOnScore?: number;
  notes?: string[];
};
```

`getMarketSnapshot()` body is a stub returning hardcoded values (line 26: `btcDominance: 54.2`).

**Reconciliation plan (binding):**

- **Step 3a — grep `getMarketSnapshot` callers.** Any caller is a pre-B67.1 consumer that's been silently reading stub values. Must catalog before changing the function body.
- **Step 3b — replace body** with `return externalMacroFeed.getLatest()` (or equivalent thin wrapper). Type signature preserved; stub callers transparently get real data.
- **Step 3c — funding rate field.** `MarketSnapshot` does NOT currently declare a funding-rate field. Add one: `fundingRate?: number; // aggregated z-score across BTC + ETH perps`.
- **Step 3d — add `notes` flag for stale-data state** so existing callers can detect fallback.

**Anti-pattern explicitly ruled out:** creating a parallel `MacroSnapshot` type in `external-macro-feed.ts` while leaving `market-snapshot.ts` untouched. That would orphan the existing stub forever, exactly the burial pattern CLAUDE.md §9 warns against.

### 3.6 B65.1 `module_constants` infrastructure

B67.1 adds 10 rows under `macro_modifier` module. Existing infrastructure handles arbitrary modules transparently. **No conflict.** No schema change required.

### 3.7 B67.0 ablation framework

B67.0's emitter API (`emitAblationRecord`) accepts an arbitrary `alternate_decision` JSONB. B67.1 wire-up is to populate the agreed shape (§5 of scope). **No B67.0 API change.** No new emitter.

---

## 4. Blast radius summary

| Component | Pre-B67.1 | Post-B67.1 | Net change |
|---|---|---|---|
| `calculatePairRegime` | HIGH (label) | HIGH (label) + LOW (confidence multiplier) | Low net additional risk — confidence has zero downstream consumers today |
| MCE | HIGH | HIGH | One optional field added |
| Signal Orchestrator | HIGH | HIGH | Ablation row JSONB populated; no flow change |
| VTS Runner | HIGH | HIGH | Ablation row JSONB populated; no flow change |
| FinalScore / Kelly / EV / TEC / RankingScore | NOT TOUCHED | NOT TOUCHED | Zero — B67.5 territory |
| Pattern Pool guardrails | NOT TOUCHED | NOT TOUCHED | Zero |
| Strong-trend lane (B63) | NOT TOUCHED | NOT TOUCHED | Zero |
| `defensive-hedge` BTC correlation | unchanged | unchanged | Zero (orthogonal signal, §3.4) |
| `market-snapshot.ts` | stub returning hardcoded values | thin wrapper returning real values | Existing callers transparently upgrade |
| **Net new schema** | n/a | 10 module_constants rows | Additive, zero-risk |
| **Net new external dependencies** | n/a | CoinGecko REST + Binance public-futures REST | Failure mode is graceful (modifier=1.0 + flag) |

**Overall:** modulating a number that nothing reads + populating an ablation row + adding a graceful external feed + reconciling one pre-existing stub. **Low net risk** despite touching files marked HIGH blast radius in SIM, because the consumed VALUE is decorative today.

---

## 5. Code-level inspection summary (files to be modified)

| File | Lines inspected | Modification scope confirmed |
|---|---|---|
| `server/core/metrics/market-regime.ts` | 1-280 | New optional `macroModifier` param on `calculatePairRegime`; modulation BEFORE clamp; clamp upper raised 0.95→1.0; zero existing callers depend on ceiling |
| `server/services/market-context-engine.ts` | 124-180 (computeContext), 505 (getDominantRegime) | Read macro feed once per cycle; thread modifier into `calculatePairRegime` calls; attach to MarketContext.macro |
| `server/types/market-context.ts` | 1-86 (whole file) | Add `MacroContext` interface; extend `MarketContext` with optional `macro` |
| `server/services/market-snapshot.ts` | 1-46 (whole file) | Replace stub body; add `fundingRate?` field; add stale-flag note semantic |
| `server/services/factor-ablation-emitter.ts` | (B67.0 file, not yet read; will inspect at Step 3) | No API change needed — JSONB blob is opaque to emitter; populate at call sites |
| `server/services/signal-orchestrator.ts` | line 629 (B67.0 hook comment) | Populate `alternate_decision` JSONB with B67.1 shape |
| `server/services/vts-runner.ts` | line ~1349 (B67.0 hook) | Same as above for VTS path |

---

## 6. Open questions — resolved (Langston cc-inbox #844)

1. **§6.1 — `market-snapshot.ts` caller migration:** RESOLVED. Grep + reconcile at Step 3. If >5 callers → separate decoupling commit BEFORE the main B67.1 commit (clean bisect history). If ≤5 → inline.
2. **§6.2 — Z-score baseline storage:** RESOLVED. **Option (a) — in-memory rolling window**, with **min-48-sample floor**: below 48 samples in the rolling window, force `modifier=1.0` and `fallbackActive=true`. Covers cold start. Promotes to DB persistence in B67.4 only if calibration specifically requires restart-surviving baselines. New constant `b67_1_zscore_min_sample_count` (default 48) added to scope §4.
3. **§6.3 — Funding-rate aggregation:** RESOLVED. BTC + ETH perps weighted average (~85% of total OI). USDC variants dropped — USDT perps are canonical. **Funding rate stored as raw 8h rate** (Binance native unit) before z-scoring; documented inline in `external-macro-feed.ts`. Z-scoring removes time-unit dependency.
4. **§6.4 — Polling cadence + stale threshold in `module_constants` from day 1:** RESOLVED. Yes — both already in scope §4 as `b67_1_external_feed_cache_seconds=60` and `b67_1_external_feed_stale_seconds=300`. No new hardcoded values.

---

## 7. Verification plan (Step 7 first-pass)

After staging deploy in shadow mode:

1. PM2 logs grep `[B67.1][feed]` — confirm 60s emission cadence
2. PM2 logs grep `[B67.1][modifier]` — confirm zero (b67_1_enabled=false at deploy)
3. `psql ... 'select count(*) from regime_factor_alternates where evaluated_at > now() - interval ''1 hour'' '` — non-zero (B67.0 emits regardless of B67.1 enable state)
4. `psql ... 'select alternate_decision from regime_factor_alternates where alternate_decision->>''factor_name'' = ''b67_1_macro_modifier'' limit 5'` — confirms shape is populated even in shadow (modifier computed but not applied)
5. `select value from module_constants where module_name='macro_modifier'` — 10 rows, expected defaults
6. After 24h: flip `b67_1_enabled=true`. Confirm `[B67.1][modifier]` lines appear; confirm at least one ablation row shows `confidence_with_modifier !== confidence_without_modifier`
7. Stale-feed simulation — restart with CoinGecko URL temporarily set to invalid domain; confirm graceful fallback + flag set

---

## 8. Cross-references

- `BATCH_67_1_SCOPE.md` (companion)
- `BATCH_67_PRE_AUDIT.md` V2 (macro-B67 SIM)
- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §5.1, §5.1b, §5.1c, §5.2.5, §5.5
- `1-system-manual/SYSTEM_MANUAL.md` (regime classifier formula section — to be updated post-B67.1 ship)

*End of B67.1 pre-audit.*
