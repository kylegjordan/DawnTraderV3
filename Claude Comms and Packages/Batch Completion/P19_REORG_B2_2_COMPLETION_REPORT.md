# P19 reorg-B2.2 — COMPLETION REPORT

> **Batch:** reorg-B2.2 · **Phase:** 19 · **change-class: architecture** · **Author:** NEW Claude (CC-B)
> **Scope:** `Claude Comms and Packages/Scope Files/P19_REORG_B2_2_SCOPE.md` · **Pre-audit:** `P19_REORG_B2_2_PRE_AUDIT.md`
> **RUNNING_ISSUES home:** #374 (this batch) ↔ #371/#372/#373.

## Objective checklist
| Obj | Status | Evidence |
|---|---|---|
| **OBJ-A — tracker persistence (durable + crash-proof)** | ✅ DONE (prior; commit `cf9e26d07`) | Atomic tmp+rename checkpoint + reload-on-boot + non-ENOENT loud log; Langston Step-4 APPROVED. Deployed in the A+B bundle (this batch). |
| **OBJ-B — per-(strategy,assetClass) re-key + per-class Filter-Diagnostics surfacing** | ✅ DONE (commit `283bf4d6a`) | Composite key; #372 aggregate byte-preserved (sum raw + re-derive); per-class crypto/xStock tabs render the Reward-vs-Risk/Reachability gate by-reason. Langston Step-4 PROCEED. |
| **OBJ-C — retire normalizer (`signal-target-normalizer.ts`)** | ⏸ OUT — gated on #373 (the #371 effectiveATR/atrsToTarget divergence, measured on the per-class data) | Not in this batch; stays #373-gated. |

> 🚨 OBJ-C remains OUT. reorg-B2.2 closes OBJ-A + OBJ-B; the normalizer retire is sequenced after the #371 divergence read on the new per-class window.

## What landed (OBJ-B)
1. **`server/strategies/guard-eval-tracker.ts`** — `_stats` re-keyed to composite `${strategy}::${assetClass}`; `recordGuardEval` gains a required `assetClass: AssetClass` 5th arg; `getGuardEvalStats()` folds buckets per strategy by SUMMING raw fields + RE-DERIVING ratios (FLAG-2 — #372 read byte-preserved); new `getGuardEvalStatsByClass(assetClass)` + `getGuardEvalStatsPerClass()`; checkpoint carries `keySchema='strategy::assetClass/v1'` and reload DISCARDS-and-loud-logs on mismatch incl. an unversioned legacy checkpoint (FLAG-1).
2. **18 `recordGuardEval` call sites** updated with `assetClass` (8 in `strategy-engine.ts`, 10 file-based). Required param → tsc-green proves all sites updated. `liquidity_trap` is short-disabled and has NO guard call (confirmed — not left at 4 args).
3. **Endpoints** — `/api/vts/filter-diagnostics` (crypto) + `/api/xstocks/filter-diagnostics` (xStock) each return per-class `guardDrops` + `trackerStartedAt`; raw `/api/diagnostics/guard-eval-stats` adds additive `statsByClass` (schema v2→v3, `stats` aggregate unchanged). Both tab endpoints degrade to `{}` on tracker-import failure (no 500).
4. **Shared UI** `client/src/pages/machine-learning.tsx` — `FilterDiagnosticsPanel` gains a "Reward-vs-Risk / Reachability Gate" card: by-reason rows (`rr_below_min`/`unreachable`/`stop_distance`/`invalid_atr` via `formatFilterName`) + meanRR + RR-suppression, with a distinct "no evaluations" state ≠ 0% (FLAG-3). Both tabs reuse the panel → one edit, both classes.
5. **Test** `server/tests/unit/reorg-b2-2-guard-eval-rekey.test.ts` (6/6): aggregate re-derive (incl. 52/102-not-0.75 FLAG-2 pin), per-class split, FLAG-3 empty map, keySchema unversioned-discard + matching reload.

## Verification
- **Bench:** `node scripts/check-tsc-baseline.mjs` → OK, no regressions above baseline. New test 6/6. Full `npx vitest run` → only the pre-existing no-DB-in-bench 9 files fail (PROVEN identical on the clean baseline via `git stash`); none from this batch.
- **CI (§5#19):** run `28052594844` on head `283bf4d6a` — **all 4 jobs GREEN** (TypeScript Check, Test Suite, Build, Docker Build; conclusion=success).
- **Deploy:** pm2 `dawntrader` restart#409, online, HTTP 200, clean boot (only pre-existing TEC_STALE dormant-system + `/home/runner` EACCES env noise; no guard-eval-tracker error). No migration. First boot hit ENOENT (no prior checkpoint — OBJ-A never previously deployed) → fresh window `trackerStartedAt=2026-06-23T19:51:53Z`; the keySchema-discard branch is unit-tested and fires on a future key change.
- **Endpoints live:** raw `/api/diagnostics/guard-eval-stats` schema `guard-eval-stats/v3` + `statsByClass` present; `/api/vts/filter-diagnostics` (`filter-diagnostics/v1.5`) + `/api/xstocks/filter-diagnostics` (`xstocks-filter-diagnostics/v2.1`) both carry per-class `guardDrops` + `trackerStartedAt`.
- **Step-7 (CC, §9.3 UI-navigated):** ✅ both tabs rendered the "Reward-vs-Risk / Reachability Gate" card. **Crypto tab:** mean_reversion (2 evals, meanRR 2.54, 0% supp). **xStock tab:** morning_star (40, 0.73, 100%), vwap_pullback (12, 2.00, 100%), sma_trend_ride (3, 2.00, 100%) — distinct per-class data, correct enum labels, formatted Mean RR/suppression, no undefined/"--".
- **Step-8 (Langston 2nd-pass):** ✅ **APPROVED on deploy integrity.** Independently verified (ssh staging, deploy-user): HEAD `283bf4d6a` match, pm2 restart#409 + fresh window, all 3 routes wired/auth-gated, clean boot, no active alerts. Carve-outs (honest, non-blocking): could not re-derive the auth-gated v3 payload / §9.3 card values as the deploy user (401) → trusts the UI-navigated evidence; did not re-pull the CI run (HEAD-match + clean boot corroborate). Flag (non-blocking, not this batch's files): pre-existing uncommitted `M` drift on staging `audit/phase30-fx4-6-report.md` + `bridge/canonical/mapping-regime-strategy.json` — surfaced to the channel.

## Langston review
- **Step-1/2:** consensus (FLAG-1 path (a) bundle A+B; FLAG-2 sum-raw-re-derive; FLAG-3 no-evaluations state; FLAG-4 SIM-scope + singleton liveness).
- **Step-4:** **PROCEED.** Three hold-me-to items OK (lastIndexOf split; required-arg self-proving at 18 sites; try/catch→{} on tab endpoints). Nits: v2→v3 doc comment (FIXED in `283bf4d6a`); latent `rrMin/rrMax` Infinity-sentinel round-trip → homed #376.

## Latent item homed (§13)
**#376** — `rrMin: Infinity`/`rrMax: -Infinity` serialize to `null` over JSON; the tracker reload already restores the sentinels (so the consequential reload path is guarded), leaving only the HTTP wire payload showing `null` for `rrMin/rrMax` (a field the UI does not render — impact nil). Pre-existing from reorg-B2.1. Home: fold the explicit-sentinel-serialization cleanup into the next tracker-touching sub-batch (reorg-B2.2 OBJ-C).

## Governance files changed
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — per-class composite re-key + the two endpoint feeds + shared panel; guard-eval-tracker singleton liveness + on-disk checkpoint entry.
- `1-system-manual/SYSTEM_MANUAL.md` — one-line content note at the §reorg-B2.1 guard-eval-tracker/#372 line: tracker is now per-(strategy,assetClass), surfaced per-class in the two Filter-Diagnostics tabs.
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` (§1/§5), `RUNNING_ISSUES.md` (#374 progress + #376 home), this completion report.
- `MEMORY_CC_B.md` (+ repo mirror).

## Deploy
A+B bundle, single trading-app deploy (no migration — no schema change). Deploy order consensus: this is the trading-app deploy round; B-GOV-3 go-live is CC-A's separate non-app-restarting step, gated on the branch settling.
