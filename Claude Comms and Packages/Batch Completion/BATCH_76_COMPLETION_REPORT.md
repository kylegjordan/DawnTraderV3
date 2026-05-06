# BATCH 76 — Chain-Final Calibration Framework Refactor — Completion Report

**Status:** SHIPPED 2026-05-06
**Workflow:** 11-step canonical workflow
**Branch:** `migration/aws-supabase`
**HEAD at close:** `c8b8709ed` (1 hotfix on top of B76 main `235237ffd` — comment-character parser fix). Commit chain: `235237ffd` (B76 main) → `c8b8709ed` (hotfix: `*/` in JSDoc + backtick in SQL template-literal comment).
**PM2:** TBD post-deploy.

---

## §A. Trigger

RUNNING_ISSUES **#54**: "Calibration aggregator 'shift' metric is structurally not measuring per-factor effect." Pre-B76 `realDecision.confidence` stored raw classifier value while alternates were built with mid-chain partial confidences captured at point-of-fire — mixing raw-vs-mid-chain values. b67_2_phase_preference showed +0.0pp predictive lift by construction (FIRST in chain → without-factor == baseConf == real). b67_1_macro_modifier same problem. Multiplicative B68.x factors had non-zero shifts but magnitude was not a clean per-factor measurement.

**Why now:** B67.5 consumer wiring window opens **2026-05-15**. Without trustworthy per-factor predictive lift, the B67.5 gating decision (which factors graduate from observational to active) is being made on structurally biased data. Hard deadline 2026-05-14 to land B76 + collect ≥7d clean window.

**Authority for B76 scope:** Langston Step-1 consensus on B75 §H.4 Item 3.

---

## §B. Outcome

**Two-pass stash-then-build pattern** in both orchestrator emit paths:

```
PASS 1 (per-factor fire point):
  compute factor → multiply into _modulatedConfChain
  push FactorAlternateInput {kind, factor-specific data} onto stash
  NO build helper called

PASS 2 (after final post-floor clamp on _modulatedConfChain):
  ablationAlternates = buildAllAlternates(stash, chainFinalConf, regimeLabel)
  emitAblationRecord(source, pair, {confidence: chainFinalConf, metadata: {predictiveConfidenceRaw: rawConf, ...}}, ablationAlternates, strategy)
```

Each divide-out alternate now satisfies `alt.confidence = realConfidenceFinal / factor`. Persister stamps every row with `realDecision.metadata.calibrationFrameworkVersion = CALIBRATION_FRAMEWORK_VERSION = 'b76_chain_final'`. Drift-dashboard-aggregator removes two `factor_name NOT IN (...)` filters and version-filters b67_1_*/b67_2_* surfacing queries to chain-final rows only.

**Zero formula/weight/threshold change. No DB migration. No new module_constants.** Pure plumbing per Langston's single-purpose fence.

---

## §C. Components shipped

### C.1 New files

| Path | LOC | Description |
|---|---|---|
| `server/services/factor-ablation-builders.ts` | ~211 | Discriminated-union `FactorAlternateInput` (8 kinds) + `buildAllAlternates(inputs, realConfidenceFinal, regimeLabel)` dispatcher with TS-exhaustiveness check. b67_1 expands to 3 alternates; B68.5 special-cases label-counterfactual. |
| `server/tests/unit/b76-chain-final-emit.test.ts` | ~169 | vitest suite: CALIBRATION_FRAMEWORK_VERSION literal, divide-out semantics for B67_4/B67_2/B68_1/B68_2/B68_3/B68_4, edge cases (factor=0 fall-through; factor=1.0 idempotent; penalty<1.0 → alt > real; boost>1.0 → alt < real), buildAllAlternates dispatcher (b67_1 expands to 3; empty inputs → empty output). |

### C.2 Modified files

| Path | Description |
|---|---|
| `server/services/factor-ablation-emitter.ts` | Added `export const CALIBRATION_FRAMEWORK_VERSION = 'b76_chain_final' as const` + `CalibrationFrameworkVersion` type alias. JSDoc on `emitAblationRecord` documents the chain-final contract (callers MUST pass chain-final `realDecision.confidence`). `persistRecord` stamps every row with `realDecision.metadata.calibrationFrameworkVersion`. Signature unchanged — internal contract amended. |
| `server/core/metrics/regime-phase.ts` | NEW `buildB67_2Alternate(realConfidenceFinal, realRegimeLabel, phase, phaseAgeSeconds, strategy, phaseWeight)` extracted from inline blocks duplicated in both orchestrators (signal-orchestrator.ts:733 + vts-runner.ts:1517). Divide-by-weight semantics. Metadata key rename `confidence_with_phase_pref` → `confidence_with_factor` for uniformity with other helpers. |
| `server/services/signal-orchestrator.ts` | Restructured emit hook (L682-995) from build-at-point-of-fire → two-pass stash-then-build. `_modulatedConfChain` declared at outer scope; PASS 1 mutations occur inside the bare block; PASS 2 (after final clamp) constructs alternates and calls `emitAblationRecord` with chain-final `confidence` + raw preserved at `metadata.predictiveConfidenceRaw`. |
| `server/services/vts-runner.ts` | Same restructure (L1456-1759) — VTS path mirror. |
| `server/services/drift-dashboard-aggregator.ts` | L504 (computeAblationComparison) `factor_name NOT IN (...)` filter REMOVED. L1052 (computeFactorCalibration) `NOT IN` REMOVED and replaced with version-filter logic per Langston Step-1 §4 revision: `factor_name NOT IN (6 sensitive names) OR realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'`. |

**Total diff:** 9 files changed, +1018 / -218 lines (server side).

### C.3 Helpers NOT modified

`outcome-feedback-store.ts`, `multi-tf-agreement.ts`, `volume-regime.ts`, `pair-correlation.ts`, `regime-age-factor.ts` — signatures unchanged. The chain-final contract is satisfied at the CALL sites in the orchestrators (Pass 2 dispatcher passes chain-final), not at the helper signature level. Per pre-audit §B.2 + Langston Step-4 ack §4, this avoids needless TS surface-area churn.

---

## §D. Hotfixes within close window

| # | Commit | Trigger | Fix |
|---|---|---|---|
| 1 | `c8b8709ed` | CI Build + Test failed on first push (`235237ffd`). Two parser-breaking comment characters: (a) `factor-ablation-emitter.ts:56` JSDoc contained the literal string `b67_1_*/b67_2` — the `*/` substring closed the JSDoc block early, causing tsc to parse subsequent lines as code (TS1005/TS1434/TS1127 cascade). (b) `drift-dashboard-aggregator.ts:1057` SQL comment inside a sql\`...\` template literal contained backtick-delimited factor names — backticks in the SQL comment closed the JS template literal. | (a) Rephrase comment to avoid `*/`. (b) Drop backticks from SQL comment (use plain text). No behavioral change. |

**Lesson:** future JSDoc/SQL-comment inside template-literals discipline — sanity-check `*/` doesn't appear in JSDoc and backticks don't appear inside `sql\`...\``. Both are silent until tsc runs.

---

## §E. Verification

### E.1 CI gate (hotfix run `25463588416`)

| Job | Conclusion | Notes |
|---|---|---|
| Build | ✅ success | clean |
| Docker Build | ✅ success | clean |
| TypeScript Check | ❌ failure | **legacy infrastructure baseline** (664 errors before B76 = 664 after; CI runs full project tsc; B76 file refs introduce zero new errors) — same disposition as every batch since B68.1 |
| Test Suite | ❌ failure | **legacy infrastructure baseline** (`module 'governance_modes' is not warm` in vitest env — 59 failed / 992 passed / 5 skipped from 1056 tests; identical pattern to B72.x noted in MEMORY); **all 9 of `b76-chain-final-emit.test.ts` PASSED** (verified per-test in CI log) |

Per Kyle directive 2026-05-06 (MEMORY): "Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline." Build+Docker pass + zero new B76 test failures = clear to deploy.

### E.2 Live `regime_factor_alternates` rows (post-deploy)

PM2 #178 deployed 22:04 UTC. First B76-marked emit at 22:06:24 UTC (~2 min warmup). 15-minute window post-deploy:

```
factor_name                 | n  | avg_shift   notes
b67_1_btc_dominance         | 1  |  0.0000    macro modifier=1.0 fallback (legitimate; uninformative on n=1)
b67_1_funding_rates         | 1  |  0.0000    same
b67_1_mcap_momentum         | 1  |  0.0000    same
b67_2_phase_preference      | 1  | -0.0115    ⭐ NON-ZERO. Pre-B76 was 0.0000 by construction (FIRST in chain bug).
b67_4_outcome_feedback      | 1  | -0.0005    divide-out math fired
b68_1_multi_tf_agreement    | 1  |  0.0000    cold-start COMPATIBLE factor=1.0 (legitimate)
b68_2_volume_regime         | 1  | -0.0020    divide-out
b68_3_pair_correlation      | 1  |  0.0041    divide-out
b68_4_regime_age            | 1  | -0.0190    divide-out
b68_5_path_b_sustainability | 1  | -0.3897    label-counterfactual flip
```

**Critical outcome:** `b67_2_phase_preference` shift = **−0.0115** (non-zero). Pre-B76 was 0.0000 by construction (FIRST in chain → without-factor == baseConf == real). The canary is alive — RUNNING_ISSUES #54 RESOLVED.

**Cohort marker rate post-warmup (Langston Step-8 ask):** 100%.

```sql
SELECT real_decision->'metadata'->>'calibrationFrameworkVersion' AS version, COUNT(*)
FROM regime_factor_alternates
WHERE evaluated_at > '2026-05-06 22:06:24'::timestamptz
GROUP BY version;

     version     | count
-----------------+-------
 b76_chain_final |    90    ← 100% of post-warmup rows carry the marker
```

### E.3 Pre-B76 reference values (anchor for 24-48h ±1pp comparison per Langston Step-8)

Pulled from `/api/analytics/factor-calibration?window=rolling_7d` immediately after B76 deploy (window predominantly pre-B76 cohort; only ~15 min of post-B76 rows in the 7-day window):

| Factor | Pre-B76 predictive lift | Decision-grade |
|---|---|---|
| b67_4_outcome_feedback | +2.95pp | ✅ (n=237) |
| b68_1_multi_tf_agreement | +5.71pp | accumulating (n=105) |
| b68_2_volume_regime | +4.13pp | ✅ (n=218) |
| b68_3_pair_correlation | +4.13pp | ✅ (n=218) |
| b68_4_regime_age | +2.94pp | ✅ (n=238) |
| b68_5_path_b_sustainability | −1.78pp | ✅ (n=224) |

**24-48h gate:** all 6 lifts must preserve sign and stay within ±1pp of these values to confirm Step-1 §4.iv "first-order bias cancels in predictive lift" claim. If any flips sign → `git revert c8b8709ed 235237ffd` (hotfix first per Langston Step-8 correction, then main).

b67_1_*/b67_2_phase_preference are version-filtered to chain-final cohort only; they will appear in the calibration table once n≥150 post-B76 rows accumulate (~12-24h at current emit cadence).

### E.4 Drift dashboard UI

Deferred to 24h post-deploy (need population-level samples to render meaningfully). Spot-check at that point should show previously-frozen `b67_1_macro_modifier` + `b67_2_phase_dimension` factor names with non-zero shift in the calibration table.

---

## §F. Langston review trail

| Step | Round | Outcome |
|---|---|---|
| 1 | Scope rev 1 review | APPROVED-WITH-REVISIONS. Architecture two-pass stash-then-build over deferred-closure validated. Two revisions to fold into Step 3: (1) aggregator query version-filter on b67_1_*/b67_2_* surfacing queries (Langston §4); (2) `CALIBRATION_FRAMEWORK_VERSION` exported as TS const to prevent string-literal drift (Langston §6). Two pre-audit clarifications: (a) §3 floor-wording — confirm it's the existing `[floor, 1.0]` clamp not B67.5 lookahead; (b) §4.6 A/B split — restated as non-optional for b67_1/b67_2 specifically. |
| 2+4 | Pre-audit + code review combined | APPROVED-WITH-REVISIONS. ONE BLOCKER: missing `.js` ESM extensions on value imports in `factor-ablation-builders.ts` (10 imports) + new import block in `regime-phase.ts` (1 import) — would have crashed orchestrator at first signal eval since Node's ESM strict resolution fails on extension-less paths. Type-only imports (`import type`) erased at compile time would not have failed at runtime, but added .js for repo consistency. **Fix applied pre-push.** Other notes: (i) metadata key rename in buildB67_2Alternate (cited above §C.2); (ii) B68.5 7th-arg semantic shift baseConf → chain-final (label-counterfactual computation unchanged — chain-final attached for completeness, not used in divide-out math); (iii) test coverage gap on B68.5 dispatch arm (deferred — B68.5 logic itself unchanged); (iv) load-bearing claim "first-order bias cancels in predictive lift for non-b67 factors" trusted per Step-1 analysis; (v) style nit on import block placement (skipped to keep diff minimal). |
| 8 | Second-pass verify | **APPROVED to close.** Two small corrections folded: (1) post-warmup marker rate confirmed 100% (90/90 rows post-22:06:24 carry `b76_chain_final`); (2) revert order corrected to `git revert c8b8709ed 235237ffd` (hotfix first per Langston) so the comment-fix doesn't merge-conflict against the still-present main commit. Pre-B76 reference lift values cited inline at §E.3 as 24-48h gate anchor. b67_2_phase_preference non-zero shift on first marked emit accepted as proof-of-life; population-level confirmation is the 24-48h gate. |

**GDrive FUSE mount issue surfaced during Langston review:** his git log/status commands hung 30+ min in uninterruptible disk-wait against `/mnt/gdrive/`. Killed; switched to staging diffs at `/tmp/` and instructing Langston to use Read tool against absolute /tmp/ paths only. Pattern documented in MEMORY.

---

## §G. Pre/Post-B76 cohort distinguishability

`regime_factor_alternates` rows pre-B76: missing `realDecision.metadata.calibrationFrameworkVersion`. Rows post-B76: value present `'b76_chain_final'`.

**Aggregator behavior:**
- `computeAblationComparison` (replay-status counts): no version filter — pre-B76 rows continue to show in summary counts (legitimate forensic data; no shift math involved).
- `computeFactorCalibration` (per-tertile WR + predictive lift): version-filter ENFORCED for the 6 first-in-chain factor names (`b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`, `b67_1_macro_modifier`, `b67_2_phase_preference`, `b67_2_phase_dimension`). Other 7 factors mix cohorts safely because predictive lift cancels first-order bias.

---

## §H. Governance updates

| File | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B76 entry inserted above B75. |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation" row for B76 SHIPPED. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New B76 section above B67.0; documents two-pass pattern + forward-couples + cohort distinguishability + verification SQL. |
| `1-system-manual/CHANGES_AND_FIXES.md` | INFRA-2026-05-06-C entry. |
| `1-system-manual/RUNNING_ISSUES.md` | New B76 close section: #54 RESOLVED. Summary counts updated (RESOLVED 46→47). |
| `MEMORY.md` (truth + repo persistence) | B76 closure block; section CURRENT STATE updated; sequencing updated; recent batch history extended. 150 lines (under 200 cap). |
| `Claude Comms and Packages/Scope Files/BATCH_76_SCOPE.md` | rev 1 (final). |
| `Claude Comms and Packages/Scope Files/BATCH_76_PRE_AUDIT.md` | Step 2 deliverable. |
| `Claude Comms and Packages/Batch Completion/BATCH_76_COMPLETION_REPORT.md` | This report. |

_(System Manual calibration framework section + CURRENT_SETTINGS_REGISTRY refresh: pending post-deploy verification.)_

---

## §I. Pending external

None. B76 is pure plumbing — no Kyle external action required.

---

## §J. Lessons learned

1. **Comment-character traps inside template literals.** Backticks inside SQL comments inside `sql\`...\`` template literals close the template. Same for `*/` inside JSDoc. Both are silent until tsc runs. Discipline: scan touched files for these patterns before push, especially when adding multi-line SQL comments to existing template literals.
2. **ESM strict-resolution `.js` extensions are non-negotiable on value imports.** Type-only imports (`import type`) erased at compile time get away with extensionless paths but value imports crash at first runtime require. Langston's blocker catch saved us a production deploy crash.
3. **Hetzner GDrive FUSE mount is broken for recursive ops.** Git/find against `/mnt/gdrive/` hang in uninterruptible disk-wait. For Langston reviews referencing repo files, stage diffs at `/tmp/` via scp first and tell him explicitly NOT to touch the GDrive mount or run git commands. Pattern documented in MEMORY for future batches.
4. **Two-pass stash-then-build > deferred closures** for orchestrator emit refactors. Discriminated-union input records are: pure data (debuggable in logs), auditable (`stash.length` at emit equals push site count), exhaustively-typed at the dispatcher, and don't leak orchestrator-frame state into closure capture. Langston's Step-1 architecture call validated by clean Step-3 implementation.
5. **Load-bearing claim "predictive lift cancels first-order bias" preserved B68.x mid-chain analysis** through the framework refactor. We didn't need to backfill or invalidate prior B68.1/.2/.3/B67.4 lift measurements — only b67_1_*/b67_2_* are version-filtered going forward.

---

*End of BATCH_76_COMPLETION_REPORT.md (pending post-deploy verification fill-in).*
