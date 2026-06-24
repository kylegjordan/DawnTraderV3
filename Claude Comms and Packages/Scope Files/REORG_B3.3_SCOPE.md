# reorg-B3.3 — Strategy-level VTS tag-don't-drop (the CORRECTED un-strangle)

change-class: architecture (signal-pipeline / VTS)
Author: CC-B (NEW Claude) 2026-06-24 · Reviewer: Langston (Step-1 scope + the §4 design fork) · Decider on fork: Langston (escalate to Kyle only on no-consensus)

---

## 0. Why this exists (the reorg-B3.2 correction)

reorg-B3.2 made the vts-runner downstream normalizer gate (`normalizeAndGateTarget`, `vts-runner.ts:1189`)
TAG-DON'T-DROP for the quality gates. **It is INERT** because the signal never reaches it: each of the 18
strategies DROPS the signal at signal-generation, upstream, via the reorg-B2.1 in-line guard:

```ts
// strong-bull-trend.ts:176-178 (identical shape in all 18 strategies)
const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
recordGuardEval(STRATEGY_KEY, _gr.rr, _gr.pass, _gr.dropReason, assetClass);
if (!_gr.pass) { setNullReason('guard_fail'); return null; }   // ← the drop, BEFORE vts-runner:1189
```

So vts-runner:1174 `callStrategyDetect(...)` returns null and vts-runner returns at :1176-1179 — the B3.2
gate at :1206 is dead code on the live path. reorg-B3.3 moves the un-strangle to where the drop actually
happens: the strategy guard.

## 1. Step-2 pre-audit — data-flow trace (DONE, in code)

**Three strategy-invocation sites (verified):**
1. `vts-runner.ts:1174` — `callStrategyDetect(...)` → `callStrategyDetectRaw` (`:911`) → `strategyEngine.detectXXX`. **Crypto VTS.** HAS the downstream B3.2 tag-don't-drop normalizer at :1189/1206.
2. `xstock_spot/eval-cycle.ts:526` — same `callStrategyDetect(...)`. **xStock VTS.** Has NO `normalizeAndGateTarget` (B3.2 never ran here); instead its own Net-EV-floor gate at `:657` (`netEV <= VTS_NET_EV_FLOOR` → SQE reject).
3. `signal-orchestrator.ts:1824–2107` — direct `this.strategyEngine.detectXXX(...)` calls. **Active path.**

**18 guard sites (verified):** 8 in-class detectors in `strategy-engine.ts` (`:302,436,569,680,780,888,990,1611`) + 10 file-based strategies (`morning-star, inside-bar-reversal, defensive-hedge, adaptive-flow, pivot-shift, reverse-impulse, support-bounce, volatility-edge, strong-bull-trend, orb`). Each file-based one is also wrapped by a `strategy-engine.ts` method (e.g. `:1735`).

**Staging evidence (decision-grade, `/api/vts/filter-diagnostics` 2026-06-24) — the strangle quantified:**
`vtsEvaluation.signalsGenerated = 1` across **136,779** strategy evaluations. `guardDrops`:

| strategy | evals | passes | rrDrops | reachDrops | validity (atr/stop) |
|---|---|---|---|---|---|
| strong_bull_trend | 547 | **0** | 387 | 0 | 160 atr |
| vwap_pullback | 419 | **0** | 216 | 203 | 0 |
| volatility_edge | 197 | **0** | 197 | 0 | 0 |
| morning_star | 1049 | 47 | 997 | 0 | 5 stop |
| range_trade | 308 | 80 | 184 | 4 | 40 stop |
| mean_reversion | 24 | 24 | 0 | 0 | 0 |

The quality gates (rrDrops + reachDrops) account for ~95%+ of drops; validity drops (atr/stop) are a small
minority. Un-strangling exactly the quality gates restores the bulk while still dropping degenerate geometry.

## 2. The fix (objectives)

**OBJ-1 — disposition policy SSOT (`strategy-helpers.ts`).** Add:
```ts
export type GateDisposition = 'enforce' | 'tag';
// VTS learning path tags (does NOT drop) the QUALITY/EV gates; everything else still drops.
const VTS_TAGGABLE_GUARD_REASONS = new Set<GuardDropReason>(['rr_below_min', 'unreachable']);
export function guardForcesDrop(gr: GuardResult, disposition: GateDisposition = 'enforce'): boolean {
  if (gr.pass) return false;
  if (disposition === 'enforce') return true;              // active/live: always drop on any guard fail
  return !VTS_TAGGABLE_GUARD_REASONS.has(gr.dropReason);   // VTS: validity (invalid_atr, stop_distance) drops; quality tags
}
```

**OBJ-2 — thread an opt-in `gateDisposition: GateDisposition = 'enforce'` (trailing, optional) through all 18
detect signatures (file fns + their strategy-engine wrappers + the 8 in-class methods).** Swap each guard
drop-site from `if (!_gr.pass) {...return null}` to `if (guardForcesDrop(_gr, gateDisposition)) {...return null}`.

**OBJ-3 — VTS dispatch opts into 'tag'.** `callStrategyDetect`/`callStrategyDetectRaw` thread the param;
`vts-runner.ts:1174` passes `'tag'`. On the crypto VTS path the tagged signal then flows to the EXISTING
B3.2 normalizer (:1189) which re-derives the same verdict, sets `vtsGateVerdict`, and simulates to close —
so reorg-B3.2 stops being inert and **composes** with B3.3. No new tagging logic needed on crypto.

**OBJ-4 — active path unchanged BY CONSTRUCTION.** The orchestrator's direct `detectXXX` calls omit the
param → default `'enforce'` → byte-identical disposition. Zero orchestrator edits. This is the safety property:
reorg-B3.3 changes ONLY the VTS learning path; active/live suppression is provably untouched.

**OBJ-5 — tests + governance.** Unit test: a rr_below_min signal DROPS under 'enforce', PASSES (tagged) under
'tag'; an invalid_atr/stop_distance signal DROPS under BOTH. Bench (tsc baseline + vitest) green; CI 4-green.
Governance: SYSTEM_MANUAL §3 (per-path guard disposition), SIM (gateDisposition cross-cutting), CHANGES_AND_FIXES,
RUNNING_ISSUES (#380 follow-through / new #), PHASE_HISTORY, PHASE_19_PLAN, BATCH_CATALOG, completion report.

**Step-7 success proof:** staging `vts_open_trades` opens climb back toward ~150/day; `guardDrops` passes > 0;
the tagged opens carry `vtsGateVerdict ∈ {rr_below_min, unreachable}`.

## 3. Validity-vs-quality split (the disposition table)

| dropReason | class | 'enforce' (active/live) | 'tag' (VTS) |
|---|---|---|---|
| `rr_below_min` | quality/EV | DROP | **TAG + simulate** |
| `unreachable` | quality/EV | DROP | **TAG + simulate** |
| `invalid_atr` | data-validity | DROP | DROP |
| `stop_distance` | degenerate geometry | DROP | DROP |
| `null` (pass) | — | continue | continue |

Rationale: simulating a sub-0.3%-stop or null-ATR signal is garbage, not learning signal; a low-RR but
geometrically-valid signal is exactly the counterfactual we must capture to un-circularize reorg-B2.3.

## 4. ⚠️ DESIGN FORK — needs your call: xStock this batch, or reorg-B3.3x fast-follow?

The crypto path is fully fixed + verifiable this batch (OBJ-3 composes with B3.2). **xStock is structurally
different:** eval-cycle:526 has NO B3.2 normalizer to re-derive/tag the verdict, and it has its own Net-EV-floor
gate (:657). So opting eval-cycle into `'tag'` alone would (a) push some signals to the EV floor which still
drops them, and (b) capture no `vtsGateVerdict` (no normalizer there).

- **Option A (my recommendation):** This batch builds the SHARED strategy `gateDisposition` param for BOTH
  classes (D1 satisfied at the shared-piece level) + opts CRYPTO into 'tag' (fully working). xStock's
  downstream disposition (eval-cycle 'tag' + an EV-floor tag-don't-drop + `vtsGateVerdict` capture, mirroring
  B3.2) is scoped as **reorg-B3.3x immediate fast-follow** — because it's a DIFFERENT gate layer (EV floor,
  not the strategy guard) and folding it in mixes two distinct changes in one diff. Precedent: B3.2 itself did
  crypto-only on the downstream side.
- **Option B:** Do both now — opt eval-cycle into 'tag' AND add the EV-floor tag-don't-drop + verdict capture
  to eval-cycle in this same batch, for one-shot D1 parity.

I lean A for a clean, verifiable diff + because the confirmed/quantified collapse and the ~150/day target are
crypto-specific. Your call — if you prefer B, I'll fold eval-cycle's downstream in.

## 5. Blast radius / risk

Wide but uniform + mechanical: ~13 files, one-line-per-strategy guard swap + a trailing optional param.
The ONLY behavioral change is on the VTS path under 'tag'; active/live is default-'enforce' = unchanged.
No schema/migration (verdict re-derived downstream; reuses B3.2's `vtsGateVerdict` column). Risk concentrated
in (a) signature-threading correctness (caught by tsc baseline) and (b) getting the validity/quality split
right (OBJ-1 SSOT + the §3 table + the unit test pin it).
