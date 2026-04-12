# Batch 60 Scope — Phase 15b: Rules-Based Predictive Execution ("Smart Thermostat")

> **Author**: Claude Code (Lead Architect)
> **Date**: 2026-04-12
> **Phase**: 15b (Rules-Based Predictive Execution — Policy Engine)
> **Branch**: migration/aws-supabase
> **Prerequisite**: Batch 59 (Phase 15a — UI Audit & Data Path Fixes) + Batch 58 (Adjustment Framework)
> **Langston Review**: REQUIRED before implementation
> **Prior CC Session Review**: Completed — recommended this split from original mega-scope

---

## What This Phase Is and Why It Matters

DawnTrader currently has a complete predictive learning system that **watches everything but does nothing**. It logs 381+ observations per week — pattern confidence weights, regime performance metrics, calibration recommendations — but none of these observations ever change a single parameter in the live system.

**Batch 58** built the governance framework — the Adjustment Framework defines bounds, evidence thresholds, and reversion triggers. The Authority Baseline captured the known-good state.

**Batch 59** fixed the data foundation — ensuring Regime Archive, Mapping Drift, and telemetry tabs show accurate data that the Policy Engine can trust.

**Batch 60 (this batch)** builds the "Smart Thermostat" — a Policy Engine that reads the B58 rulebook, watches the B59-verified evidence, and makes small, careful, reversible adjustments to filter thresholds when the data clearly supports it.

---

## Desired Outcomes — What Success Looks Like After B60

### 1. The system self-tunes filter thresholds based on VTS evidence
Example: The reversal family is rejecting 70% of pairs because vn_max=0.85 is too tight. VTS data from 1,200+ evaluations over 7 days shows relaxing it to 0.87 would let through quality trades without degrading win rate. The policy engine does it automatically, within bounds, and logs why.

### 2. Bad adjustments are automatically reversed
If the system relaxes a threshold and signal quality drops, the Reversion Monitor rolls it back within 30 minutes. The system enters a cooldown period to prevent oscillation.

### 3. You can see exactly what it's doing
A new Policy Engine panel shows: "Evaluated at 3:00 AM. Proposed relaxing vn_max for reversal family from 0.85 to 0.87. Evidence: 1,200 evals over 7 days, null rate 65%, regime stable. Decision: EXECUTED. Reversion checkpoint active."

### 4. The system adapts to market conditions within safe bounds
All bounded by the Adjustment Framework, all reversible, all auditable.

### 5. It proves the execution machinery before ML arrives
Phase 15 is the "rules + sensors" layer. Phase 17-18 ML will flow through the same engine.

---

## How B58 and B59 Enable B60

- **B58** built the guardrails (Adjustment Framework, Authority Baseline, Adjustment Registry, validation layer)
- **B59** fixed the data (Regime Archive VTS data path, Mapping Drift sync, tab accuracy)
- **B60** connects the sensors to the thermostat (Policy Engine reads evidence, checks governance, executes bounded adjustments)

---

## Numbered Objectives

### Objective 1: Policy Engine Core (`server/core/policy/policy-engine.ts`)

Create the deterministic policy evaluation engine that:

1.1. Accepts adjustment recommendations from any learning source (ML Calibration, Predictive Adjustments, manual trigger)

1.2. Evaluates each recommendation against:
- **Governance tier**: Is this parameter Tier 1 (auto-adjustable), Tier 2 (supervised), or Tier 3 (locked)?
- **Evidence thresholds**: Does the supporting evidence meet minimum time window, evaluation volume, and realized-outcome requirements per the Adjustment Framework?
- **Safety constraints**: Would this adjustment exceed max concurrent adjustments (3 filter, 2 strategy, 1 scoring)? Is any mandatory reversion trigger active?
- **Cooldown check**: Has the cadence limit (7-30 days per parameter) been respected?
- **Regime stability**: Is the current regime stable enough for learning updates? (Uses existing `shouldDeferLearning()` from learning-cooldown.ts)

1.3. Returns a typed decision: `EXECUTE`, `DEFER`, `REJECT`, or `ESCALATE` (Tier 2 items requiring human/Langston review)

1.4. All decisions logged via `logPredictiveAdjustment()` with decision reason, evidence snapshot, and governance tier

**Verification**: Policy engine unit tests covering all 4 decision paths with mock evidence data. At least 10 test cases.

### Objective 2: Evidence Collector (`server/core/policy/evidence-collector.ts`)

Create the evidence aggregation layer that:

2.1. Queries VTS trade outcomes from the last N days (configurable, default 7) per family/path/strategy

2.2. Queries pair-pool evaluation counts from VTS telemetry per family/path

2.3. Queries closed paper trade outcomes (when trading is active) per strategy

2.4. Returns a typed `EvidenceSnapshot` with full segmentation (per Langston review #4):
- `operatingMode`: VTS / Paper / Live (evidence precedence enforced in code, not just docs)
- `sourcePath`: quant / pattern
- `family`: trend / reversal / breakout / oscillation / pattern
- `regime`: current canonical regime
- `evalCount`: number of evaluations per family/path
- `tradeCount`: number of closed trades per strategy
- `winRate`: rolling win rate per strategy/regime
- `expectancy`: average expectancy (R-multiple) per strategy — more meaningful than raw win rate
- `signalRate`: signal generation rate per family
- `nullRate`: null rate per family/path (for reversion trigger detection)
- `windowDays`: actual days of data available
- `preChangeBaseline`: metrics snapshot from BEFORE the most recent adjustment (for attribution)
- `postChangeObservation`: metrics snapshot from AFTER the most recent adjustment (for comparison)

2.5. Compares current metrics against Authority Baseline for drift detection

2.6. Enforces evidence mode precedence in code: Live > Paper > VTS. If Live data exists and meets thresholds, VTS evidence for the same parameter is ignored. (Per Langston review #3C.)

**Verification**: Evidence collector returns valid snapshots from staging data (verified by B59 data fixes). Pre/post windowing produces distinct snapshots. Mode precedence verified. At least 8 test cases.

### Objective 3: Adjustment Executor (`server/core/policy/adjustment-executor.ts`)

Create the execution layer that:

3.1. Takes an approved adjustment from the policy engine

3.2. Reads current parameter value from source (DB for filters, config for strategy constants)

3.3. Validates the change via `adjustment-registry.validateFilterChange()` in **enforce** mode

3.4. For filter parameters: writes to `screener_filters` via `storage.upsertScreenerFilters()` **directly** (not through the API route handler). The executor calls the storage method directly but performs its own enforce-mode validation first. This avoids the route-level log-only validation path used by manual UI changes. (Per prior CC session review — DB write path clarification.)

3.5. For in-memory parameters (pattern confidence weights, volume gate soft factors): updates the runtime value with audit trail

3.6. Broadcasts change via `contextBridge.broadcast()` for immediate notification. Note: FX5 Scanner reads from DB every 30-second cycle, so DB-persisted changes will be picked up regardless — broadcast provides faster propagation but is not critical-path.

3.7. Records execution in adjustment log with: parameter, old value, new value, evidence snapshot reference, baseline version, execution timestamp, approver ('policy_engine_v1')

3.8. Registers a reversion checkpoint (see Objective 4)

**Verification**: Executor successfully writes a filter threshold change to staging DB. Change reflected in next FX5 scan cycle. Audit log entry created. Reversion checkpoint stored.

### Objective 4: Reversion Monitor (`server/core/policy/reversion-monitor.ts`)

Create the automatic reversion system that:

4.1. Runs on a configurable interval (default: every 30 minutes) checking all active adjustment checkpoints

4.2. Compares post-adjustment metrics against pre-adjustment baseline using evidence collector

4.3. Triggers automatic reversion using **compound logic** (per Langston review #2):

**Hard immediate revert triggers** (any ONE fires reversion):
- Net EV turns negative for affected family/path
- Expectancy drops below zero for affected strategy

**Compound revert triggers** (require TWO or more degradation signals in the SAME family/path the rule touched):
- Signal rate drops >30% AND (win rate drops >10% OR expectancy degrades >20%)
- Null rate increases >25% in same family/path AND signal quality degrades
- Win rate drops >15% AND expectancy drops >15%

**Advisory-only signals** (logged, do NOT trigger reversion alone):
- Signal rate drops >30% in isolation
- Null rate increases in a different family/path than the one adjusted

4.4. Reverts parameter to pre-adjustment value (NOT baseline — to the value before the specific adjustment)

4.5. Logs reversion event with full context (which trigger fired, pre/post metrics, parameter restored to)

4.6. Enters a cooldown period after reversion (double the normal cadence) to prevent oscillation

4.7. **PM2 restart persistence** (per prior CC session review): Active checkpoints and reversion monitors MUST persist across PM2 restarts. Implementation: serialize active checkpoints to `logs/policy_engine/active_checkpoints.json` on every checkpoint create/update/remove. On boot, the reversion monitor loads persisted checkpoints and resumes monitoring. An orphaned adjustment with no reversion protection must never occur.

**Verification**: Simulate a degradation scenario in test. Reversion fires automatically. Parameter restored. Cooldown enforced. PM2 restart preserves active checkpoints.

### Objective 5: Policy Rules — Tier 1 Filter Adjustments

Define the initial set of deterministic policy rules. Per Langston review #1, rules are staged into two graduation tiers:

**Graduation Tier A — Execute-capable on first graduation** (cleaner family/path-level knobs):

5.1. **Volume Noise (vn_max) relaxation rule**: When null rate for a family exceeds 60% AND regime is stable (not TRANSITION) AND eval count > 1,000 in 7 days → propose vn_max increase by step size (0.02), capped at family bounds

5.2. **DI threshold tightening rule**: When signal rate for trend/breakout family exceeds 40% (over-permissive) AND expectancy < 0.5R AND trade count > 50 → propose di_min increase by step size (3), capped at family bounds

5.3. **VTS_NET_EV_FLOOR rule**: When average net EV of VTS-approved trades is consistently > +2% over 7 days AND eval count > 2,000 → propose tightening floor by 0.005 (from -0.01 toward 0)

**Graduation Tier B — Evaluate-only until stronger evidence** (per Langston review #1):

5.4. **Volume gate soft factor rule**: When a soft-gated strategy shows >20% higher expectancy with volume-qualifying trades vs non-qualifying AND trade count > 100 per strategy → propose increasing soft factor weight by 0.05. Stays evaluate-only until Tier A rules complete 2 full adjustment cycles without reversion.

**Architectural safety rules** (per Langston review #3A and #3B):

5.5. **Exclusive lease model**: Only ONE adjustment may be active per family/path scope at a time. Prevents overlapping rule interactions and oscillation.

5.6. **Observation window**: After any adjustment executes, the policy engine must wait a minimum 48 hours before self-grading the outcome. No rapid self-grading within the same evaluation cycle.

5.7. Each rule includes: trigger condition, proposed change, evidence requirements, cadence limit, compound reversion conditions, graduation tier

**Verification**: Each rule has at least 2 unit tests. Rules respect per-family bounds. Exclusive lease prevents simultaneous adjustments to same scope. Observation window enforced.

### Objective 6: Adjustment Registry Upgrade — Enforce Mode

6.1. Switch `adjustment-registry.ts` validation from `log-only` to `enforce` for policy-engine-initiated changes

6.2. Keep `log-only` for manual UI changes (PUT /api/filters-v2) — Kyle's manual adjustments are never blocked

6.3. Add `source` field to validation: `'manual'` (log-only) vs `'policy_engine'` (enforce)

6.4. Add cadence tracking: store last adjustment timestamp per parameter, reject if within cadence window

**Verification**: Policy engine changes validated in enforce mode. Manual changes still work. Cadence violations rejected.

### Objective 7: Boot Integration & Scheduling

7.1. Register policy engine in `boot_orchestrator.ts` initialization sequence (after Authority Baseline load)

7.2. Create scheduled evaluation cycle: every 6 hours (configurable). In evaluate-only mode this logs what it would do. In execute mode it acts. Note: with 48-hour observation windows and 7-day cadence limits, most execute-mode cycles will correctly log "no action needed."

7.3. Reversion monitor starts on boot, loads persisted checkpoints from disk, runs every 30 minutes

7.4. Add API endpoint: `GET /api/policy/status` — returns current state, active checkpoints, last evaluation, next evaluation

7.5. Add API endpoint: `POST /api/policy/evaluate` — manual trigger for policy evaluation (requires editor role)

**Verification**: Policy engine starts on PM2 restart. Persisted checkpoints restored. Scheduled evaluations run on time. API endpoints return valid responses.

### Objective 8: UI Integration — Policy Engine Panel

8.1. Add a **Policy Engine** sub-tab to the Analytics & Diagnostics page showing:
- Current policy engine status (active/paused/evaluate-only/error)
- Last evaluation timestamp and result summary
- Active adjustment checkpoints (parameter, family/path, old value, new value, date, reversion conditions, time remaining)
- Pending reversion alerts (if any trigger thresholds approaching)
- Policy rule evaluation history (last 7 days) with decisions (EXECUTE/DEFER/REJECT/ESCALATE)
- Evidence snapshot summary (eval counts, trade counts, win rates per family)

8.2. Update the Predictive Adjustments tab (Machine Learning page) to distinguish:
- **Observational** adjustments — default style
- **Executed** adjustments — green highlight
- **Reverted** adjustments — orange/red highlight
- Add filter toggle: "Show all" / "Executed only" / "Reverted only"

**Verification**: New panel renders without errors. Shows correct state. Executed vs observational visually distinct.

### Objective 9: Governance Documentation

9.1. Update SYSTEM_IMPACT_MAP.md with new components (Policy Engine, Evidence Collector, Adjustment Executor, Reversion Monitor) with upstream/downstream dependencies and blast radius

9.2. Update CCPI, BATCH_CATALOG.md, PHASE_HISTORY.md, POST_AUDIT_ROADMAP.md

9.3. Write BATCH_60_COMPLETION_REPORT.md

9.4. Update CHANGES_AND_FIXES.md if applicable

**Verification**: All Tier 1+2 governance docs updated. Completion report lists all files changed.

---

## Graduation Criteria: Evaluate-Only → Execute Mode (Langston Review #5)

The policy engine deploys in **evaluate-only mode**. Graduation to execute mode requires ALL of the following:

| # | Criterion | Required |
|---|-----------|----------|
| G1 | At least 3 full evaluation cycles (18+ hours) without engine errors | YES |
| G2 | End-to-end audit logging verified — every cycle produces complete log with evidence snapshot and decisions | YES |
| G3 | Authority Baseline drift detection returns accurate results | YES |
| G4 | Reversion checkpoint creation verified — each mock execution creates valid checkpoint with compound triggers | YES |
| G5 | No conflicting-rule write attempts — exclusive lease model prevents overlapping adjustments | YES |
| G6 | Manual dry-run review: compare engine recommendations against what Kyle/Langston would choose. Document agreement/disagreement. | YES |
| G7 | Evidence collector segmentation verified: mode-aware, path-aware, family-aware, pre/post windowed | YES |
| G8 | Langston signs off on dry-run review and graduation readiness | YES |

### Post-Graduation Staged Unlock:
1. **First**: Only Tier A rules (vn_max, DI, VTS_NET_EV_FLOOR) can execute
2. **After 2 successful Tier A cycles without reversion**: Tier B rules may graduate
3. **If any Tier A adjustment triggers reversion**: Pause all execution, review before resuming

---

## Langston Review Consensus (from original combined scope)

**Review date**: 2026-04-12
**Verdict**: Approved direction with 5 tightening recommendations (all incorporated)

| # | Recommendation | Status |
|---|---------------|--------|
| L1 | Stage rules into Tier A (execute-capable) and Tier B (evaluate-only longer) | INCORPORATED — Obj 5.4 stays evaluate-only |
| L2 | Compound reversion triggers, not single-metric | INCORPORATED — Obj 4.3 compound logic |
| L3 | Three architectural risks: feedback-loop, overlapping rules, evidence contamination | INCORPORATED — Obj 5.5 exclusive lease, 5.6 observation window, 2.6 mode precedence |
| L4 | Evidence collector needs deeper segmentation with pre/post windowing | INCORPORATED — Obj 2.4 full segmentation |
| L5 | Explicit graduation criteria, graduate narrowest subset first | INCORPORATED — G1-G8 checklist + staged unlock |

---

## Prior CC Session Review (from original combined scope)

**Review date**: 2026-04-12
**Verdict**: Approved direction with 7 issues/suggestions (all addressed)

| # | Issue | Resolution |
|---|-------|-----------|
| P1 | Scope too large for one batch | SPLIT — B59 (UI audit) + B60 (Policy Engine, this file) |
| P2 | Obj 1 (UI audit) should be separate batch | SPLIT — B59 handles this |
| P3 | PM2 restart persistence for checkpoints | ADDED — Obj 4.7 checkpoint persistence to disk |
| P4 | 6-hour cycle mostly "no action" in execute mode | DOCUMENTED — Obj 7.2 note |
| P5 | DB write path needs clarification (storage direct vs API route) | CLARIFIED — Obj 3.4 calls storage directly with own enforce validation |
| P6 | Verify test runner handles new files | NOTED — will verify before writing tests |
| P7 | contextBridge.broadcast() may be redundant for DB changes | DOCUMENTED — Obj 3.6 note about FX5 30s cycle |

---

## Risk Assessment: MEDIUM-HIGH

Mitigations:
1. **Evaluate-only first**: Logs decisions, doesn't execute, until G1-G8 graduation checklist passed
2. **Conservative rules**: Only Tier 1 parameters with large safety margins
3. **Automatic reversion**: Compound triggers, 30-minute monitoring, PM2-restart-safe
4. **Evidence gating**: All three evidence thresholds required
5. **Cadence limits**: 7-30 day minimums per parameter
6. **Max concurrent**: At most 3 filter adjustments simultaneously
7. **Regime stability gate**: No adjustments during transition instability
8. **Exclusive lease**: One adjustment per family/path scope at a time
9. **48-hour observation window**: No self-grading within same cycle

---

## Files Expected to be Modified/Created

### New Files (~8-10)
- `server/core/policy/policy-engine.ts`
- `server/core/policy/evidence-collector.ts`
- `server/core/policy/adjustment-executor.ts`
- `server/core/policy/reversion-monitor.ts`
- `server/core/policy/policy-rules.ts`
- `server/core/policy/types.ts`
- `server/routes/policy.ts`
- `tests/policy-engine.test.ts`
- `tests/evidence-collector.test.ts`
- `tests/policy-rules.test.ts`

### Modified Files (~8-12)
- `server/config/adjustment-registry.ts` — enforce mode, cadence tracking, source field
- `server/core/boot_orchestrator.ts` — policy engine init + scheduling + checkpoint restore
- `server/routes.ts` — mount policy routes
- `client/src/pages/analytics.tsx` — Policy Engine panel
- `client/src/pages/machine-learning.tsx` — executed vs observational distinction
- `1-system-manual/SYSTEM_IMPACT_MAP.md`
- `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
- `1-system-manual/BATCH_CATALOG.md`
- `1-system-manual/PHASE_HISTORY.md`
- `1-system-manual/POST_AUDIT_ROADMAP.md`
- `1-system-manual/CHANGES_AND_FIXES.md`

---

## Dependencies

- **B59 complete**: Data path fixes verified (Regime Archive, Mapping Drift, tab accuracy)
- **B58 complete**: Adjustment Framework + Authority Baseline deployed
- **VTS running**: Active VTS data for evidence collection
- **Langston review gates**: Scope → Pre-audit → Code review → Completion report

---

## Out of Scope for B60

- Tier 2 parameter adjustments (rankingScore weights, regime-strategy map) — require supervised review
- Machine Learning integration — Phase 17/18, post-live
- Strategy constant modifications — only filter thresholds and soft gate weights
- Live mode changes — policy engine operates on paper mode only
- New policy rules beyond the initial 4 defined in Objective 5
