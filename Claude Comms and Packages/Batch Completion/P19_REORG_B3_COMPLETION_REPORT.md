# P19 reorg-B3 — COMPLETION REPORT

> **Batch:** reorg-B3 · **Phase:** 19 · **change-class: architecture** (signal-pipeline) · **Author:** NEW Claude (CC-B)
> **Scope:** `Claude Comms and Packages/Scope Files/P19_REORG_B3_SCOPE.md` · **Pre-audit:** `P19_REORG_B3_PRE_AUDIT.md` · **Change list:** `Change Lists/P19_REORG_B3_CHANGE_LIST.md`
> **#233** EV-input thread (Option B, FX5-pool-carried). **RUNNING_ISSUES home:** #233 (EV-input plumbing) RESOLVED; §13 follow-ups #377/#378/#379.

## 🚨 SCOPE DISCLAIMERS (§9.1)
> 🚨 **reorg-B3 does NOT make crypto OPEN a trade.** It is accuracy + strong-trend parity, NOT a crypto opener. H1: threading real DI gives ZERO EV lift (default DI=50 already caps the standard pWin branch at the 0.60 ceiling). H2: dbsScore is the lone EV-relevant thread (lifts the strong-trend pWin off the 0.40 floor). The crypto opener stays the FEE LADDER (reorg-B7 maker + Phase-25 pWin).
> 🚨 **The entire reorg-B3 thread is on the DORMANT active path** (buildSizedSignalForStrategy + the open-gate run only when active trading is ON; the system is in VTS/passive). The live proof (`rtb-metrics evInputThreadProof.strongTrendWithDbs > 0`) is GATED ON paper-active turn-on (Phase-19). The achievable proof NOW is the integration test.

## Objective checklist
| Obj | Status | Evidence |
|---|---|---|
| **OBJ-1 — thread DI + dbsScore to the open-gate (the #233 fix)** | ✅ DONE | FX5-pool-carried (Option B, Langston-endorsed): `active-filter-pool` carries `di` (+ existing `dbsScore`); `getFX5DataForSymbol` widened; typed `rtb_signals.di_at_queue`/`dbs_score_at_queue` columns; orchestrator populates; open-gate reads the typed carrier (no metadata fallback, no coerce). Migration applied (cols confirmed via ledger + verify DO-block). |
| **OBJ-2 — friction-decomposition audit** | ✅ DONE (no code change) | `cost-model.computeTotalRoundTripCost = (fee×2)+(slippage×2)+spread` — spread added ONCE (correct half-spread/leg), taker both legs (EV-conservative), fee DB-governed (fail-hard on missing). No double-count, no wrong-tier code bug. Recorded; no fix. |
| **OBJ-3 — ranking/sizing on absolute NetEV check** | ✅ DONE — proven no-op | `dynamic-sizing-engine.ts` has ZERO netEV refs (no raw-NetEV sizing); ranking is finalScore-native; netEV is the >0 sign-gate only. No fix. |
| **OBJ-4 — surface the per-input EV-reject breakdown on rtb-metrics** | ✅ DONE | `rtb-metrics-service` `EvInputSample` buffer + `recordEvInputSample` (hooked at the open-gate) + `getEvInputThreadProof`; surfaced on `GET /api/diagnostics/rtb-metrics`. **Forward-instrumentation (§9.1) — empty until paper-active turns on.** Deploy-verify (§9.3) caught the endpoint subset-map dropping it → instance fix; defect-class homed #379. |
| **OBJ-5 — pattern-vs-[HF9] DI consistency** | ✅ DONE (documented; no behavior change) | The inline [HF9] NetEV pre-filter recomputes DI at evaluate-time (live VTS path); the open-gate uses the at-queue snapshot. Provenance documented at the recompute site + System Manual; HF9 LEFT untouched (changing a live VTS filter's DI freshness is out of #233 scope; DI is accuracy-only). |
| **OBJ-6 — named proof a NON-DEFAULT dbsScore reaches evaluateTradeExpectancy + the strong-trend branch FIRES** | ✅ DONE (test) / ⏳ live-gated | Integration test 8/8 asserts the strong-trend branch FIRES with a non-default dbsScore (positive assertion) + the OBJ-4 surface captures it. **LIVE proof gated on paper-active turn-on (§9.1) — the active path is dormant.** Named home = turn-on. |

## What landed
1. **`server/services/active-filter-pool.ts`** — `di?` on `ActiveFilteredPair`; `DI?` on the `addSurvivors` survivor param (the scanner already carried it; only the param dropped it); `di: survivor.DI` in both `newEntry` builds; `getFX5DataForSymbol` return widened to `{price, volume24h, dbsScore?, di?}` (one caller, additive-safe).
2. **`shared/schema.ts`** — `rtb_signals.di_at_queue` + `dbs_score_at_queue` (DECIMAL(8,4), nullable) + at-queue-semantics column comment.
3. **`drizzle/migrations/2026-06-24-p19-reorg-b3-rtb-ev-inputs.sql`** (+ `-rollback.sql` OUT of git; MANIFEST registered) — ADD COLUMN IF NOT EXISTS + verify DO-block.
4. **`server/services/signal-orchestrator.ts`** — `buildSizedSignalForStrategy` reads the FX5 entry once (`fx5Data`) + populates `diAtQueue`/`dbsScoreAtQueue` (+ `volume24h`). OBJ-5 DI-provenance comment at the [HF9] recompute.
5. **`server/core/rtb/ready_to_buy_service.ts`** — `SQESignalInput` + 2 scalars; `queueSQESignal` persists them to the typed columns (xStock → NULL).
6. **`server/services/paper-execution-engine.ts`** — promote conversion carries the 2 scalars (parsed string→number) **+ `sourcePool`** (FIND 1) onto the promoted signal; `executeSimulatedTrade` param intersection extended; open-gate reads `signal.diAtQueue/dbsScoreAtQueue ?? undefined`; OBJ-4 sample hook.
7. **`server/services/rtb-metrics-service.ts`** + **`server/routes.ts`** — OBJ-4 `EvInputSample`/`evInputThreadProof` surface + endpoint exposure (the `99887f90e` follow-up).
8. **`server/tests/unit/reorg-b3-ev-input-thread.test.ts`** (NEW, 8/8) — pool carry; H2 (strong-trend branch fires with non-default dbsScore + null-pins-floor); H1 (real DI = zero lift); OBJ-4 surface proof.

## ★ FIND 1 — latent bug (root-caused, CHANGES_AND_FIXES FIX-2026-06-24-A)
The promote conversion `checkRtbPromotion` built the promoted signal's metadata WITHOUT `sourcePool`, so the open-gate read `sourcePool = undefined` for every promoted signal → the kernel `quant-strong_trend` pWin branch NEVER fired → reorg-B3's dbsScore thread (the lone EV-relevant half) would itself have been INERT. Blast radius (all on the dormant active path, no live damage; would have bitten at turn-on): the EV strong-trend branch + the trade/position-record `sourcePool` persists (stored NULL) + sourcePool-keyed sizing. One thread (`promotedSignal.metadata.sourcePool`) fixes all consumers. Langston verified the rtb-row `metadata.sourcePool` IS populated (so the fix is not itself inert).

## Verification
- **Bench:** `node scripts/check-tsc-baseline.mjs` → OK, no regressions above baseline (all 6 touched server files + routes.ts). New test 8/8.
- **CI (§5.19):** core `28063641366` on `d5562c385` — all 4 GREEN; OBJ-4 followup `28063929575` on `99887f90e` — all 4 GREEN.
- **Deploy:** staging HEAD `99887f90e`, pm2 restart#411 online HTTP 200. Migration applied — `db:migrate` reports "no pending" (the verify DO-block would have aborted the deploy if `di_at_queue`/`dbs_score_at_queue` were absent → ledger-applied ⟹ columns exist).
- **Step-7 (CC, §9.3 live-surface):** `GET /api/diagnostics/rtb-metrics` returns `evInputThreadProof` = `{totalSamples:0, withNonNullDbs:0, withNonNullDi:0, strongTrendBranchFired:0, strongTrendWithDbs:0}` — the CORRECT empty state (forward-instrumentation, active path dormant); `byBlockReason`/`totals`/etc. unchanged (additive-only payload). The OBJ-6 LIVE proof (`strongTrendWithDbs > 0`) lights up at paper-active turn-on.
- **Step-8 (Langston 2nd-pass):** ⏳ requested.

## Langston review
- **Step-1/2:** PROCEED (Option B endorsed over the original MCE Option A — coherence win: the pool dbsScore is the SAME value that drove strong-trend routing).
- **Step-4:** **APPROVED for push** (read the full 664-line `git show`; verified FIND 1 live against staging source). 5 conditions satisfied (snapshot identity / at-queue semantics / null-no-coerce / caller-sweep / additive-safe widening); FIND 1 + FIND 2 + di_at_open homes per §13.
- **OBJ-4 followup:** approved; NO-PATCHES point (the endpoint subset-map is a defect class — `openFailedByStage` also dropped) → §13 verbatim-minus-redaction refactor homed #379.

## §13 follow-ups homed
- **#377** — xStock strong-trend reaches the gate with NULL `dbs_score_at_queue` → 0.40 floor (fail-safe). REAL fix (wire xStock per-class DBS into the at-queue carrier) → home: reorg-B8 / xStock active-path, before xStock turn-on.
- **#378** — `di_at_open` persists a constant 50 to the trailing-exit engine (separate consumer; out of #233 EV-gate scope) → small tracked fix (read `di_at_queue`).
- **#379** — `/api/diagnostics/rtb-metrics` subset-maps `getSummary()` → silently drops fields (`openFailedByStage` too) → §13 verbatim-minus-redaction refactor (consumer byte-for-byte diff required).

## Governance files changed
- `1-system-manual/SYSTEM_MANUAL.md` — §3 Net Expectancy Kernel: added the B63 strong-trend pWin branch to the formula + a new "EV-input provenance" content section (where DI/dbsScore come from; defaults→at-queue-threaded; H1/H2; FIND 1).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — reorg-B3 cross-cutting EV-input data-flow (FX5 pool `di` carry → typed `rtb_signals` columns → promoted-signal fields → open-gate; FIND 1 sourcePool thread; OBJ-4 surface).
- `1-system-manual/CHANGES_AND_FIXES.md` — FIX-2026-06-24-A (the #233 thread + FIND 1 latent bug + blast radius).
- `1-system-manual/RUNNING_ISSUES.md` — #233 EV-input-plumbing RESOLVED note; #377/#378/#379 homed.
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md` (plain-language), `PHASE_19_PLAN.md` (§1 board + §5 decision log).
- `MEMORY_CC_B.md` (+ repo mirror) + Langston `/home/langston/MEMORY.md` (§10.b).
- This completion report + `Change Lists/P19_REORG_B3_CHANGE_LIST.md`.

## Deploy
Single trading-app deploy (core `d5562c385`) + a one-file OBJ-4 endpoint followup (`99887f90e`), each CI-4-green. Migration applied (the only schema change). No VTS/active behavior change today (dormant path); forward-prep for paper-active turn-on.
