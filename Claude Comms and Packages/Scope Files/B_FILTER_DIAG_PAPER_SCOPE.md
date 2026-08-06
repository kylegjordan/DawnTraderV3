# B-FILTER-DIAG-PAPER — Scope r1

change-class: non_architecture
**Owner:** CC-B · **Date:** 2026-08-06 · **Directive:** Kyle 2026-08-01: *"We still need to fix the filter diagnostics tabs in paper trading, and that will help us with the reasons why strategies are rejecting signals before the SQE."* **The reason outranks the ask: the tabs must make the pre-SQE rejection story LEGIBLE — this unblocks #648 (six never-traded strategies), which Kyle has TABLED until this lands. Telemetry + display only; zero engine-behavior change; no migration.**

## 1. Step-1 findings (measured 2026-08-06, live staging)

**The plumbing is NOT missing — it is illegible.** `/api/active-engine/diagnostics/funnel?mode=paper` (B8.4b tracker, envelope `active-funnel/v3`) returns `status: "active"` for BOTH classes with 3 weeks of data (since 2026-07-14), and the panel's dormant-fallback wiring works (`vts-filter-diagnostics-panel.tsx:254-283`: non-active → `DormantPipelineTables`). What the data actually shows (crypto_spot paper, cumulative):

| Bucket | Value | The problem it poses |
|---|---|---|
| `sqeGateRejects.uncategorized` | **541,469** (vs Confidence 4,071 + RegimeWeight 793) | **99.1% of SQE gate rejects land in the DISCOVERY bucket.** `active-funnel-tracker.ts:37` designed it to surface unknown reason-tokens "for deliberate promotion to a canonical gate" — never promoted. The single number Kyle needs most is unreadable. |
| `preSqeRejects` / `preSqeRejectsByStrategy` | **{} empty** after 318,418 signals | The 3 writer sites (`signal-orchestrator.ts:511/:545/:598` — unmappable_symbol / strategy_gate / sizing_zero) never fire on this path; the REAL pre-SQE deaths sit in `strategyAttrition` (family-filter drops, per strategy, no reason detail) and in the archive's `reject_stage`. |
| `signal_eval_archive.reject_stage` (1 day, measured 2026-08-01) | `pre_filter` 1,590,990 · `strategy_internal` 479,378 · `sqe` 31,414 · `admitted` 3,379 · `tcl` 1,224 | **The truth store already records per-decision stage + strategy — but NO endpoint aggregates it and NO tab renders it.** The six never-traded strategies die at `strategy_internal`, BEFORE the SQE. |

## 2. Provenance (§2 1.b — tier-1 = behaviour changed by this batch; corpora searched: BATCH_CATALOG, completion reports B8.3/B8.3b/B8.4b/B8.4c, RUNNING_ISSUES, SIM S22 row, code comments)

| Component | Original intent (quoted/cited) | Disposition |
|---|---|---|
| `active-funnel-tracker.ts` (T1) | B8.4b (SIM S22): per-(mode,class) funnel counters; `uncategorized` = "discovery bucket… surfacing it for deliberate promotion" (`:37`) | **(2) update to today's intent** — perform the promotion the design intended: classify the dominant reason-tokens into canonical gates. |
| `vts-filter-diagnostics-panel.tsx` active-tables section (T1) | B8.4c OBJ-8: dormant mirrors "awaiting activation (B8.5)"; B8.5-era wiring reads the funnel | **(2)** — render the per-strategy × per-stage story, not only the aggregate buckets. |
| `DormantPipelineTables` (T2) | honest pre-activation placeholder, "NEVER a bare 0" | **(1) still correct** — stays as the non-active fallback. |
| `signal-eval-archiver.ts` `reject_stage` (T2) | P19-B5a reject capture: per-decision stage taxonomy | **(1) still correct** — this batch READS it (new aggregate endpoint); no write change. |
| `preSqeRejects` writer sites (T1 if changed) | B8.4b: named pre-SQE reject reasons on the signal-build path | **(2) or (1)** — decide at pre-audit: either the empty bucket is correct-by-design (deaths happen upstream at family-filter/archive stages — then the TABS must say so) or reasons should be recorded at the sites that actually reject. NOT assumed at scope. |
| `gate-columns.ts` disposition model (T2) | B8.3: enforce Rejected = Evals−Passed identity | **(1)** — untouched; new tables must not violate the identity. |

## 3. Objectives

1. **Per-strategy × per-stage rejection table on the Paper FD tabs (both classes).** New read-only endpoint aggregating `signal_eval_archive` by (strategy, reject_stage) over a window (24h default), rendered as a table whose rows are the 19 canonical strategies and whose columns are the stage taxonomy (`pre_filter` / `strategy_internal` / `sqe` / `admitted` / `tcl`). Verification: the six never-traded strategies visibly show WHERE they die; counts reconcile with a direct psql aggregate (±the window boundary).
2. **Promote the `uncategorized` SQE gate rejects.** Measure the actual reason-token distribution feeding `uncategorized` (tracker loud-logs + a one-off read), extend `SQE_CANONICAL_GATES` with the dominant real gates, and keep `uncategorized` as the residual discovery bucket. Verification: after a soak interval, `uncategorized` share of new sqeGateRejects < 5% (it is 99.1% today).
3. **Funnel tables tell the pre-SQE story honestly.** Where a bucket is structurally empty on this path (e.g. `preSqeRejects` if pre-audit confirms deaths occur upstream), the tab labels it so ("rejections occur at scan/family stages — see the stage table") instead of rendering an empty section. No bare zeros, no misleading emptiness (B8.4c OBJ-5 honesty carried forward).
4. **§9.3 UI walk of BOTH classes × Paper, both branches (active and dormant-fallback), desktop + mobile widths** — this surface's history proves the diff review structurally cannot catch ungated blocks (B8.3b's third block was caught only by the walk). Any visual defect Kyle reported that survives to Step-2 is enumerated there and folded in.

## 4. Non-goals
No engine/strategy/SQE behavior change; no threshold moves; no VTS-side changes; no schema migration (reads existing tables); #648's ANALYSIS stays tabled — this batch builds the instrument, the analysis is Kyle's next move.

## 5. Verification criteria
CI 4/4; Langston Steps 1/2/4/8; dt-deploy with `--by CC-B`; funnel + new endpoint curls; the reconciliation query; the §9.3 walk with screenshots; completion report with §4c board reconciliation.
