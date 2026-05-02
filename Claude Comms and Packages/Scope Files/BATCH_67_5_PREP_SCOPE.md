# BATCH 67.5-prep — Post-Composition Floor as Module Constant

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-03
**Status:** Streamlined mini-batch — scope + pre-audit + diff combined into single review request to Langston (Steps 1/2/4 consolidated due to small surface area)
**Predecessor:** B68.3 SHIPPED 2026-05-02
**Successor:** B68.1 Multi-TF agreement (gated on this fix per RUNNING_ISSUES #51)

## Why this exists

Langston cc-inbox #885 O.1: 6-modulator compound penalty stack worst case ~0.455. After B68.1 (7th modulator) ~0.43, at the historical 0.4 floor edge. Without intervention, the natural compound progressively erodes the historical 0.4 floor.

**Kyle approval 2026-05-03:** ship Langston's recommendation (raise floor to 0.45 as new module_constant `b67_5_post_composition_floor`).

## What this lever does

Replaces the hardcoded `0.4` floor at three clamp sites with a tunable module_constant:
- `market-regime.ts:249` — `calculatePairRegime` terminal clamp
- `vts-runner.ts:1639` — VTS emit hook chain clamp
- `signal-orchestrator.ts:902` — orchestrator emit hook chain clamp

Default seed: `0.45`. Tunable from calibration data via DB UPDATE without code redeploy.

## Files

- `drizzle/migrations/2026-05-03-b67-5-prep-floor.sql` (NEW, 1 INSERT)
- `drizzle/migrations/2026-05-03-b67-5-prep-floor-rollback.sql` (NEW)
- `server/types/market-regime.types.ts` — added `b67_5PostCompositionFloor` field to `RegimeConfig`
- `server/core/metrics/market-regime.ts` — `DEFAULT_REGIME_CONFIG` seeds 0.45; `calculatePairRegime` uses `regimeConfig.b67_5PostCompositionFloor`
- `server/services/market-context-engine.ts` — `refreshRegimeConfig` resolves 6th key; `assembleRegimeConfig` includes it; private state field tracks it; `stop()` clears
- `server/services/vts-runner.ts` — emit hook chain clamp uses `_fullRegimeConfig?.b67_5PostCompositionFloor ?? 0.4` (cold-start fallback to legacy)
- `server/services/signal-orchestrator.ts` — same pattern
- `server/tests/unit/b67-5-prep-floor.test.ts` (NEW, 4 cases)
- `server/tests/unit/b67-3-5-tfs-desat.test.ts` — `tightConfig` extended with new field

## Stats

7 modified + 3 new files. Single new module_constant. No new MCE refresh sub-method (folds into existing `refreshRegimeConfig`). No new accessors.

## Risk

- LOW. Pre-condition: clamp value must be in (0, 1). 0.45 is well within historical operating range (0.4 was the prior floor; raising 5pp is conservative).
- Cold-start fallback: emit hooks use `?? 0.4` so first-cycle behavior matches legacy until config loads.
- No behavior change for any classification that produced confidence > 0.45 (i.e., the vast majority of evaluations).

## Verification

- All 9 factor types still emitting post-deploy
- New module_constant present in DB
- `[Phase14][MCE] First refresh complete — all 8 config groups loaded` (count unchanged from B68.3)
- No `[B67.5]` errors in PM2 logs

## Workflow

Streamlined: combined Steps 1/2/4 into single review request to Langston (small surface, both of you already aligned on the design + value 0.45). Steps 5-11 standard.

---

*End of B67.5-prep scope.*
