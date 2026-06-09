# ITEM 4 Phase B — STEP 2 COMPLETION REPORT (D1 + D1b + D9 + labeled learning substrate + calibration epochs)

> Gate-2 packet §4 step 2, closed 2026-06-10 under Kyle's overnight autonomous directive. Deploy `becf000dc`; CI run `27239916433` all-4-green; migration `2026-06-10-item4-step2-calibration-epoch.sql` applied + boot-asserted.
>
> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (§9.1):** this step makes the data/learning substrate separation-correct — it does NOT make paper or live trade-ready (Phase 19 / Phase 21). **would_admit capture = step-2b** (split with Langston's agreement).

## Objectives — ALL YES
| Objective | Verdict | Evidence |
|---|---|---|
| D9: learning store source-partitioned, source REQUIRED, source-matched reads | **YES** | key `(source, assetClass, regime, strategy)`; 4 callers threaded; 30/30 disk keys re-homed `vts_` on first boot |
| Welford + per-source calibration epoch ALONGSIDE retained EMA (zero factor change) | **YES** | EMA math byte-identical (test 2a); Welford correctness (test 2b); epoch reset semantics (test 3); rules in ADJUSTMENT_FRAMEWORK |
| D1: archivers take the CARRIED mode; `getCurrentMode()` write-time lookup deleted | **YES** | **1,122 signal-eval rows DURING active paper ALL `mode='vts'`** (22:49:44–22:53:05Z, session `paper_6O8XNOJphJ`) — zero cross-stamps; pre-step-2 ALL would have mislabeled |
| pair-scan = shared substrate | **YES** | 347/347 rows `mode='shared'` in the window |
| D1b: confluence buffer source-namespaced | **YES** | key + filtered reads; tests 4/5 (namespace isolation, no decay-clock cross-refresh) |
| Epoch infra fail-hard | **YES** | migration 3 rows verified; b72-warmup all-3-rows assertion fired clean at boot 22:30:41 (Langston's required addition) |
| VTS cadence regression | **YES** | exact 60s beats through the paper window |

## Gates
Langston plan-ACK (3 decisions + amendments) → Step-4 **APPROVE** (1 required addition — folded) → push `becf000dc` → CI `27239916433` all-4-green → deploy + migration → acceptance transient → Langston **Step-8 CONFIRMED** (independent exact-count reproduction of all evidence; migration-before-assertion ordering verified genuine). Bench: tsc zero new; full vitest 11 pre-existing only; new `item4-step2-labeled-learning.test.ts` (5 invariants) green.

## Notes
- **Calibration-epoch bump enforcement is now LIVE governance** (ADJUSTMENT_FRAMEWORK "CALIBRATION EPOCHS"): every calibration batch's completion report carries the bump or "no calibration impact" — Langston checks at Step 4/8.
- Known accepted limitation (documented, not a bug): post-bump the EMA carries cross-epoch signal until a future estimator swap.
- eval-cycle's 4 hardcoded `'vts'` stamps correct today; future active-xStock routing must thread a mode param (SIM note).
- Non-blocking cosmetics (indentation) → step-2b diff. `settings.local.json` excluded from batch commits going forward (Langston note).

## Governance files changed
`ADJUSTMENT_FRAMEWORK.md` (CALIBRATION EPOCHS section — **Langston Step-8 conditional item 1**) · `SYSTEM_IMPACT_MAP.md` (step-2 Recent Additions: 'shared' value-set + store/epoch/buffer entries + future-mis-stamp note — **conditional item 2**) · `RUNNING_ISSUES.md` (#210 → RESOLVED) · `BATCH_CATALOG.md` (step-2 row) · `PHASE_HISTORY.md` (step-2 block) · this report · MEMORY 3-way.

**Next: step-2b** (would_admit capture at VTS archive hooks — SQE-threshold replay, `would_admit_v0` + stamped threshold if basis differs) **→ step 3** (switch cleave / independent controls).

---

## STEP-2b ADDENDUM (would_admit_v0 bridge) — CLOSED 2026-06-10
Deploy `e5b91332f`; CI run `27241756486` all-4-green. Langston Step-4 **APPROVE conditional on R1** — R1 (10s failure cooldown in the threshold cache; no per-row retry hammering of a degraded config path) + N1 (`no_final_score` basis so EVERY post-deploy VTS row carries a basis) both folded; final hunk notified per his no-re-review condition. **Live verification (first ~90s post-warmup):** every post-deploy VTS signal-eval row stamped — `no_final_score` 1,194 (reject-stage rows, expected majority) · full verdict `final_score_vs_paper_finalScoreMin` 6 (would_admit_v0=true, threshold carried) · `thresholds_not_warm` 2 (the designed honest-null cold window) · zero unstamped post-deploy rows. The B.3 bridge (tier-2a comparison precondition; the tier-2b pooling prerequisite #1) is accruing forward data. Design: ONE stamp site (the archiver convergence point); v0 basis explicit per #211. Files: `would-admit-cache.ts` (NEW) + `signal-eval-archiver.ts`.
