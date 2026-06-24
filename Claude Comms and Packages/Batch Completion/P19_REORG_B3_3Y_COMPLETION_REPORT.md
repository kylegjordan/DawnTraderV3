# reorg-B3.3y — Completion Report

**Batch:** P19 reorg-B3.3y — symmetric `invalid_geometry` (drop `target<=entry` / `reward<=0` longs)
**change-class:** non_architecture (validity-gate refinement, one condition)
**Date:** 2026-06-24 · **By:** CC-B (NEW Claude) + Langston (Step-4 CONCUR) · autonomous
**Deployed:** staging `2136c74fe`, restart#414, CI 4-green `28130496306`, **no migration**
**Sequence:** pulled AHEAD of reorg-B3.3x (Kyle directed the run order on the B3.3-ack turn; Langston OK'd — it was actively polluting)

---

## Why this batch

reorg-B3.3's VTS un-strangle EXPOSED a pre-existing asymmetry in `normalizeAndGateTarget`'s geometry guard:
it dropped a missing RISK leg (`stop >= entry`) as `invalid_geometry`, but a missing REWARD leg
(`target <= entry`, reward ≤ 0) computed signed `rr ≤ 0` and fell into the `rr_below_min` QUALITY-tag bucket.
So on the new VTS `'tag'` path, a degenerate reward≤0 long was tag-and-simulated instead of dropped — live:
`USDT/GBP/volatility_edge would-gate=rr_below_min rr=-0.00 — simulating anyway`, ~1/min since 17:59Z. That
contaminates the `rr_below_min` cohort (which exists to study geometrically-valid-but-low-RR trades) with
samples that can never pay. Langston's Step-8 call: reclassify to the validity-DROP bucket.

## The fix (one condition)

`server/core/calculations/signal-target-normalizer.ts` — geometry guard gains the reward leg:
```diff
-    entryPrice <= 0 || stopPrice <= 0 || stopPrice >= entryPrice
+    entryPrice <= 0 || stopPrice <= 0 || stopPrice >= entryPrice || nativeTarget <= entryPrice
```
**A valid long now requires `stop < entry < target`.** A reward≤0 long returns `invalid_geometry` (a VALIDITY
reason → DROP on every path), instead of `rr_below_min`.

## Objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Symmetric geometry guard (drop `target<=entry`) | ✅ YES | the one-condition diff above |
| OBJ-2 | Active path provably unchanged | ✅ YES | orchestrator `:1232` drops on ANY `!ok` → `target<=entry` already dropped (as `rr_below_min`); now `invalid_geometry` — outcome identical, only the log reason label moves. Both callers (active `signal-orchestrator:1227`, VTS `vts-runner:1203`) traced. |
| OBJ-3 | VTS reclassify tag→validity-drop | ✅ YES | VTS `vts-runner:1203` B3.2 split puts `invalid_geometry` in the DROP branch; reward≤0 longs now drop instead of tag-and-simulate |
| OBJ-4 | Test + bench + CI | ✅ YES | new `reorg-b3-3y` 5/5; tsc baseline OK; CI `28130496306` 4-green |
| OBJ-5 | Governance | ✅ YES | see list below |

## Test matrix (`reorg-b3-3y-target-geometry.test.ts`, 5/5)

- `target < entry` → `invalid_geometry` DROP (the bug B3.3y fixes)
- `target == entry` → `invalid_geometry` DROP
- `stop >= entry` → `invalid_geometry` DROP (pre-existing, regression guard)
- valid low-RR long (`stop<entry<target`, rr=1.0) → stays `rr_below_min` (NOT reclassified — the boundary)
- healthy long (rr≥minRR, reachable) → PASSES

## Step-7 verification

Deployed `2136c74fe`, restart#414, HTTP 200; the `nativeTarget <= entryPrice` guard confirmed present in the
built `dist/index.js`. Behavior-change proof (logs, post-restart#414): the `rr=-0.00` / `volatility_edge`
`TAG_NO_DROP` markers STOP (those reward≤0 longs now drop as `invalid_geometry` rather than tag-and-simulate),
while genuine low-RR-but-valid tags (target>entry) CONTINUE. **✅ CONFIRMED on the 3-cycle post-restart#414
read:** `rr=-0.00` / `volatility_edge` `TAG_NO_DROP` count = **0** (the reward≤0 longs stopped tagging — they
now drop silently as `invalid_geometry`, which has no loud stdout marker), while genuine low-RR-but-VALID tags
continue — e.g. `AVAX/USD/support_bounce would-gate=rr_below_min rr=2.32 — simulating anyway` (target above
entry, just under the 2.5 floor). So B3.3's un-strangle still captures real low-RR counterfactuals and B3.3y
surgically removed ONLY the degenerate reward≤0 geometry — the boundary is exactly where it should be.

## Governance files changed

- `1-system-manual/SYSTEM_MANUAL.md` — §11 reorg-B3.3y symmetric-geometry note
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — §1.2a-2 reorg-B3.3y line
- `1-system-manual/RUNNING_ISSUES.md` — #383 RESOLVED
- `1-system-manual/PHASE_19_PLAN.md` — §1 board row (deployed) + §5 log
- `1-system-manual/BATCH_CATALOG.md` — reorg-B3.3y row
- `1-system-manual/PHASE_HISTORY.md` — plain-language entry
- `Claude Comms and Packages/Batch Completion/P19_REORG_B3_3Y_COMPLETION_REPORT.md` (this)
- MEMORY (CC-B + Langston §10.b)

**Code:** `server/core/calculations/signal-target-normalizer.ts` + `server/tests/unit/reorg-b3-3y-target-geometry.test.ts`.

**Status:** all steps complete; Langston Step-4 CONCUR. Code + governance deployed/pushed, CI 4-green.
reorg-B3.3 family: B3.3 (closed), B3.3y (this, done), B3.3x (#382, next). Proceeding to reorg-B3.3x.
