# Batch 59 Scope — Phase 15a: Predictive Learning UI Audit & Data Path Fixes

> **Author**: Claude Code (Lead Architect)
> **Date**: 2026-04-12
> **Phase**: 15a (Predictive Learning Foundation — UI Audit & Fixes)
> **Branch**: migration/aws-supabase
> **Prerequisite**: Batch 58 (Phase 11 Finalization — Adjustment Framework + Authority Baseline)
> **Langston Review**: REQUIRED before implementation
> **Prior CC Session Review**: Completed — recommended splitting original scope into B59 (this) + B60 (Policy Engine)

---

## What This Batch Is and Why It Matters

Before building the Phase 15 Policy Engine (B60), we need to ensure the predictive learning system's existing infrastructure is accurate and trustworthy. The Policy Engine will rely on data from VTS trade outcomes, regime archives, and telemetry — if that data is wrong or missing, the engine makes bad decisions.

**Problem discovered during staging UI audit (2026-04-12):**
- Regime Archive shows 0% win rate and $0 P&L for all 39 entries — despite VTS running with 459 closed trades in 7 days. The data path from VTS trade closure to regime archive is broken.
- Mapping Drift canonical sync stuck at 2026-03-05 (over a month stale), only 9/30 required samples.
- Predictive tab model diagnostics may show placeholder data rather than real pipeline metrics.
- None of the existing tabs reflect the dual-path (quant + pattern) architecture built in B19-B57.

**This batch fixes the foundation so B60 (Policy Engine) can trust its evidence sources.**

---

## Desired Outcomes

After B59 is deployed:

1. **Regime Archive shows real VTS trade outcomes** — win rates, P&L, expectancy per regime/strategy from the 459+ closed VTS trades per week
2. **Mapping Drift is current** — sync date is recent, drift analysis runs when 30+ samples available
3. **Every predictive learning tab is either accurate or clearly labeled** — no misleading placeholder data
4. **Data paths verified end-to-end** — VTS trade closure → regime archive → evidence collection chain is confirmed working, ready for B60's Evidence Collector to consume

---

## Numbered Objectives

### Objective 1: Regime Archive VTS Data Path Fix (CRITICAL)

The Regime Archive shows 0% win rate and $0 P&L for all entries despite VTS producing 459 closed trades in 7 days (10 currently open). This is a broken data path.

1.1. Trace the code path from VTS trade closure (in `vts-runner.ts` or `vts-service.ts`) to regime archive ingestion (`regime-archiver.ts`). Identify where the connection is broken — is the archiver filtering for active trading outcomes only? Is it not reading VTS closed trades? Is the query wrong?

1.2. Fix the data path so that VTS simulated trade outcomes (entry price, exit price, P&L, win/loss, strategy, regime) feed into the regime archive's per-strategy, per-regime metrics

1.3. Verify that the archive correctly computes win rate, average P&L, and confidence from VTS closed trade data

1.4. Verify the Regime Archive API endpoints (`/api/vts/regime-archive/*`) return the corrected data

1.5. Verify the Machine Learning > Regime Archive UI tab displays real win rates and P&L values

**Verification**: Regime Archive tab shows non-zero win rates and P&L for strategies with closed VTS trades. API returns accurate metrics. At least 3 regime/strategy combinations have real data.

### Objective 2: Mapping Drift Canonical Sync Fix

2.1. Investigate why Mapping Drift Last Sync is stuck at 2026-03-05 — is the sync scheduler disabled? Is the data source unavailable? Is there a code error?

2.2. Fix the sync mechanism so canonical mapping data is refreshed on a regular schedule

2.3. Investigate why only 9/30 samples have been collected despite continuous VTS operation — is the sample collection counting the wrong events? Is the 30-sample threshold too high?

2.4. Ensure drift analysis runs automatically when sufficient samples (30+) are available

2.5. If the "Force Sync Canonical" button in the UI works, trigger it and verify results

**Verification**: Mapping Drift tab shows a recent sync date (within last 24 hours of deploy). Sample count increases over time. Drift Score computes when 30+ samples available.

### Objective 3: Predictive Tab Accuracy Audit

3.1. Determine whether the "ensemble_primary" model diagnostics (82% accuracy, 78% confidence, 0.120 calibration drift) reflect real pipeline data or are seed/placeholder values. Trace where these numbers come from in `predictive-diagnostics.service.ts`.

3.2. Determine whether the Weight Contribution percentages (Volatility Z-Score 33%, Trend Z-Score 29%, ADX 22%, Momentum 16%) are computed from real telemetry or are static defaults.

3.3. Verify the top-level metrics (Signals Processed: 0, Pass Rate: 0.0%, Avg Confidence: 0.0%) — are these zero because trading is stopped, or because the counters aren't wired?

3.4. Verify the Decision Traceback (50 accepted, 0 rejected) reflects real VTS pre-execution decisions

3.5. If any values are placeholder/seed data, either wire them to real data sources or clearly label them as "Awaiting real data — placeholder values shown"

**Verification**: Each metric on the Predictive tab is either confirmed real or explicitly labeled as placeholder. No misleading data.

### Objective 4: Governance Tab Dual-Path Assessment

4.1. Assess whether learning cooldown, stability, and block rate should show per-family/per-path breakdowns (currently global only)

4.2. If feasible without major refactor, add family/path context to the Governance tab cards (e.g., "Learning Cooldown: Trend family — 0 deferred, Pattern path — 0 deferred")

4.3. If not feasible in this batch, document the gap and flag as a B60 UI objective

**Verification**: Governance tab either shows per-family context or documents why it doesn't yet.

### Objective 5: Predictive Adjustments Tab Assessment

5.1. Audit whether the ML Calibration Scheduler is producing meaningful, varied recommendations — currently logs the same 4 pattern weight bumps (MORNING_STAR, PINBAR, ENGULFING, ABCD) every few hours

5.2. Determine if the repetitive pattern is correct behavior (calibration genuinely recommends the same thing) or a bug (scheduler not evaluating different parameters)

5.3. Document findings — this informs B60's policy rule design

**Verification**: Documented assessment of calibration scheduler behavior with recommendation for B60.

### Objective 6: Governance Documentation

6.1. Update CCPI current state section

6.2. Update BATCH_CATALOG.md with B59 entry

6.3. Update PHASE_HISTORY.md with Phase 15a entry

6.4. Update CHANGES_AND_FIXES.md with Regime Archive data gap fix and Mapping Drift fix

6.5. Update RUNNING_ISSUES.md if new issues discovered

6.6. Write BATCH_59_COMPLETION_REPORT.md

**Verification**: All Tier 1+2 governance docs updated. Completion report lists all files changed.

---

## Risk Assessment: LOW-MEDIUM

This batch is diagnostic and fix-oriented — no new autonomous behavior, no parameter modification capability. Risks:

1. **Regime Archive fix may reveal deeper data model issues** — VTS trades may not have the fields the archiver expects. Mitigation: trace the full data path before coding.
2. **Mapping Drift sync may require scheduler changes** — could affect other scheduled jobs. Mitigation: audit scheduler dependencies before modifying.
3. **Placeholder data removal could break UI expectations** — if the Predictive tab relies on non-zero seed values for rendering. Mitigation: test UI with real (possibly zero) data.

---

## Files Expected to be Modified

### Modified Files (~5-10)
- `server/core/archival/regime-archiver.ts` — VTS data path fix
- `server/services/predictive-diagnostics.service.ts` — placeholder vs real data audit
- Mapping Drift related files (TBD during Objective 2 investigation)
- `client/src/pages/analytics.tsx` — possible tab updates
- `client/src/pages/machine-learning.tsx` — Regime Archive display fix
- `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
- `1-system-manual/BATCH_CATALOG.md`
- `1-system-manual/PHASE_HISTORY.md`
- `1-system-manual/CHANGES_AND_FIXES.md`
- `Reports/RUNNING_ISSUES.md`

### New Files (~1-2)
- `Claude Comms and Packages/Reports/Batch Completion/BATCH_59_COMPLETION_REPORT.md`
- `Claude Comms and Packages/Scope Files/BATCH_59_PRE_AUDIT.md`

---

## Dependencies

- **B58 complete**: Confirmed
- **VTS running**: Confirmed (10 open trades, 459 closed in 7d)
- **Langston review gates**: Scope → Pre-audit → Code review → Completion report

---

## Relationship to B60

B59 fixes the data foundation. B60 (Policy Engine — Smart Thermostat) builds on top of it. B60 scope is drafted separately at `Claude Comms and Packages/Scope Files/BATCH_60_SCOPE.md`.
