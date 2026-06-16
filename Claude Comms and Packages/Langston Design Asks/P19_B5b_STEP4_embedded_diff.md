# P19-B5b — Step-4 code review (embedded diff). Bench GREEN. APPROVE for push?

**From:** Claude New (CC-B) · **Date:** 2026-06-16 · **For:** Langston Step-4 (BEFORE push) · INFRASTRUCTURE NOTE: read this inbox file directly; `ssh staging` for repo inspection, NOT the gdrive mount.

**Bench:** tsc baseline → no regressions; `vitest run` → **175 files / 1992 tests** (1987 + 5 new). Diff: 1 modified (+8/−3) + 2 new files.

## ONE deviation from the pre-audit plan (flagging up front)
The pre-audit said "co-located helper *in* eval-cycle.ts." I **extracted `buildMacroSnapshot()` into its own tiny module** `server/asset_classes/xstock_spot/macro-snapshot.ts` — solely for **testability**: eval-cycle.ts has a heavy import chain (mce, score-calc, registerOpenVtsTrade, dispatchXstockActiveSignal, db…), so a unit test that imports it to reach the helper would drag all that in. The extracted module imports ONLY `getLatestEquitySnapshot`, so the null-preservation/freshness contract tests in isolation. Still xStock-scoped (lives in `xstock_spot/`, imported only by the eval cycle). If you'd rather it stay inline, say so — but I think testable-by-design is the NO-PATCHES call.

## Your 3 pre-flagged Step-4 checks — all satisfied
- **(1) ALL FOUR sites threaded** (not 3-of-4): the diff shows `macro: buildMacroSnapshot()` at `:566` (strategy_internal reject), `:667` (sqe reject), `:703` (tcl reject), `:820` (admitted). All inside `evaluateXstockPairForVTS`. ✓
- **(2) helper is straight-copy + cannot throw:** `getLatestEquitySnapshot()` is sync in-memory; `buildMacroSnapshot` is a pure object-literal field copy, no `await`/throw path. Safe on the live-on-merge hot path. ✓
- **(3) no conditional key-drop on null:** every field is a direct `s.x` copy (no `...(x && {x})`); `ageSeconds` Infinity→explicit `null`. The test asserts `"vixZ":null` survives JSON + `z=0` stays `0`. ✓

## NEW FILE — `server/asset_classes/xstock_spot/macro-snapshot.ts`
```ts
import { getLatestEquitySnapshot } from '../../services/amr-equity-feed.js';

/** P19-B5b (#94): build features.macro from the current equity-macro snapshot.
 *  Straight field copy (NOT omit-on-null) → explicit vixZ:null (market-closed)
 *  stays distinct from a neutral 0. Captures z AND raw vix/dxy (baseline-
 *  independent ground truth — 25-7 may recompute the baseline). Freshness via
 *  ageSeconds (Infinity/never-polled → explicit null) + per-source stamps.
 *  partialFeed = degraded-feed signal, not derivable from the value-nulls.
 *  getLatestEquitySnapshot is a sync in-mem read; this is pure + cannot throw. */
export function buildMacroSnapshot(): Record<string, unknown> {
  const s = getLatestEquitySnapshot();
  return {
    vixZ: s.vixZ,
    dxyZ: s.dxyZ,
    vix: s.vix,
    dxy: s.dxy,
    ageSeconds: Number.isFinite(s.ageSeconds) ? s.ageSeconds : null,
    partialFeed: s.partialFeed,
    vixObservedAt: s.vixObservedAt,
    dxyEcbDate: s.dxyEcbDate,
  };
}
```

## MODIFIED — `eval-cycle.ts` (diff)
```diff
+import { buildMacroSnapshot } from './macro-snapshot.js'; // P19-B5b (#94)
@@ :566 strategy_internal reject @@
-              features: { sourcePool: lane.sourcePool, detailReason: reason },
+              features: { sourcePool: lane.sourcePool, detailReason: reason, macro: buildMacroSnapshot() },
@@ :667 sqe reject @@
-              features: { sourcePool: lane.sourcePool },
+              features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() },
@@ :703 tcl reject @@
-              features: { sourcePool: lane.sourcePool },
+              features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() },
@@ :820 admitted (added before the features-object close) @@
+              // distinct from `macroModifierValue` above (the AMR modifier scalar)
+              macro: buildMacroSnapshot(),
```
(Note: the admitted block already carries `macroModifierValue` = the AMR class-level modifier scalar — a DIFFERENT thing from this `macro` VIX/DXY snapshot object. Distinct keys, no collision.)

## NEW FILE — `server/tests/unit/p19-b5b-macro-snapshot.test.ts` (5 tests)
All-8-fields-incl-raw / explicit-null-preserved-and-survives-JSON / z=0-stays-0 / Infinity-age→null / partialFeed-carried. Mocks `getLatestEquitySnapshot`.

## Capture set (your Q-A, all 8 kept)
`{ vixZ, dxyZ, vix, dxy, ageSeconds, partialFeed, vixObservedAt, dxyEcbDate }` into `features.macro`. Q4 crypto-no-macro satisfied by construction (file is the xStock eval cycle).

**Ask:** APPROVE for push (then CI all-4-green → deploy → governance incl. **PHASE_19_PLAN** §1+§5 per your §14 catch + SIM content note + System-Manual-N/A → Step-8), or CHANGES-NEEDED (incl. whether to keep the extraction or inline it).
