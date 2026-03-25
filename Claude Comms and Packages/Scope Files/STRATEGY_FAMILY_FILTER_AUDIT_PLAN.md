# Strategy-Family Filter Profiles Audit Plan

**Date:** 2026-03-23  
**Status:** Draft for review and approval  
**Participants:** Kyle, Langston, Claude Code

---

## 1. Audit Goal

Determine whether DawnTrader’s current filtering and strategy-evaluation pipeline is **correctly sparse** or **incorrectly suppressive**, and define the evidence-based redesign needed to produce **strategy-family-relevant survivors** without breaking:

- active vs VTS parity
- the 4-path filter architecture
- duplicate-handling rules based on pair + strategy identity
- future extensibility to other asset types

This audit is **not** about inflating signal count for appearances. It is about verifying correctness, identifying defects or misplacements, and clarifying the right architecture for the upcoming filter restructure.

---

## 2. Intent

This audit serves two purposes at once:

1. **Investigate current signal starvation / suppression behavior**
   - low signal output relative to evaluations
   - high null returns
   - pattern-path concerns
   - DI threshold concerns
   - possible routing / handoff issues

2. **Provide planning evidence for the next filter-restructure phase**
   - define what belongs in global filters
   - define what belongs in family-level filters
   - define what belongs in strategy detection vs scoring vs hard gates
   - compare candidate architectures before implementation begins

The audit is therefore combined at the **investigation + planning** level, but the resulting implementation work must be split into separate batches afterward.

---

## 3. Desired Outcome

By the end of the audit, the team should have a reviewed and agreed answer to all of the following:

1. Whether the current system behavior is explained by:
   - intentional sparsity,
   - excessive strictness,
   - duplicated gating,
   - incorrect routing,
   - stale thresholds,
   - input/unit mismatches,
   - or some combination of the above.

2. Whether the VTS pattern path has a real pattern-to-strategy handoff flaw.

3. Whether DI thresholds need recalibration after the formula change, and if so, for which paths.

4. Whether family-aware filtering should be implemented via:
   - **Architecture A:** Early MCE before family IMF selection
   - **Architecture B:** Global survivors fan out through all relevant family IMF paths, with MCE staying where it is

5. A clean definition of what belongs in:
   - global filters
   - family filters
   - strategy detection
   - scoring / weighting
   - hard execution gates

6. A concrete, phased implementation recommendation based on findings.

---

## 4. What This Audit Must Confirm

### 4.1 Strategy Strictness / Signal Suppression
- Are strategies too strict relative to the filtered pair population reaching them?
- Are strategies rejecting setups because they are re-checking conditions already screened upstream?
- Are certain strategies effectively dead because of thresholds, units, routing, or context mismatch?

### 4.2 VTS Pattern Routing / Handoff
- After a pair survives pattern global + IMF filters, does pattern detection attempt **all 5 pattern types**?
- Can one pair legitimately detect multiple patterns in the same cycle?
- Are all detected patterns routed to their correct downstream strategy/strategies?
- Is VTS handing the correct detected pattern payload to the matching strategy, or collapsing to a single “best pattern” object?
- Does the active path behave differently from VTS, and if so, is the difference intentional and correct?

### 4.3 DI Calculation / Threshold Audit
- What changed in the DI formula?
- Were thresholds recalibrated after the formula change?
- Are DI distributions now materially different from what the current thresholds assume?
- Does DI need separate calibration for:
  - Quant Active
  - Quant VTS
  - Pattern Active
  - Pattern VTS
- Are pattern DI failures partly due to rolling-window contamination from pre-change data, or to genuinely stale thresholds?

### 4.4 Input / Units Audit
- Are strategy detect functions receiving the correct values and units?
- Are any strategies expecting:
  - percent vs decimal
  - raw vs normalized values
  - ratio vs absolute values
  - one indicator variant while receiving another
- Are filter functions and strategy functions consuming the same metrics in consistent form?

### 4.5 Layer Responsibility Audit
The audit must classify each check or condition into its proper layer:

- **Global Filters** — universal disqualifiers no strategy should want
- **Family Filters** — family-specific filtering for quant and pattern paths
- **Strategy Detection** — does a valid setup exist?
- **Scoring / Weighting** — how strong is the setup in context?
- **Hard Gates** — EV, duplication, portfolio/risk controls, execution eligibility

### 4.6 Context Placement Audit
- Should global-vs-pair alignment affect:
  - strategy detection,
  - scoring / weighting,
  - or hard gating?
- Which strategies, if any, legitimately require regime alignment inside detection?
- Which uses of context are architectural drift versus deliberate design?

### 4.7 Family-Aware Filter Architecture Audit
The audit must compare two candidate architectures.

#### Architecture A — Early MCE
FX5 → Global Filters → MCE → Family Classification → Family-Specific IMF → Strategy Evaluation

Questions:
- Are required MCE inputs already available at post-global stage?
- Is early MCE feasible without new data dependencies?
- Can MCE outputs be carried cleanly through all downstream paths?
- Does early MCE provide cleaner routing than fan-out?

#### Architecture B — Family Path Fan-Out (Current Front-Runner)
FX5 → Global Filters → All Relevant Family IMF Paths → MCE → Strategy Evaluation

Questions:
- Can global survivors be evaluated cheaply across all relevant family IMF paths?
- Can one pair legitimately survive multiple family paths?
- Is downstream handling already safe because duplicates are keyed by pair + strategy identity?
- Does this architecture remain clean and explainable when one pair survives multiple family filters?

### 4.8 Duplicate / Multi-Path Handling
- Confirm that different **pair + strategy** combinations are not considered duplicates.
- Confirm that a single pair can validly generate multiple signals if they correspond to different strategies.
- Confirm that this rule already covers:
  - multiple quant-family survivors,
  - quant vs pattern coexistence,
  - multiple detected patterns for one pair.

### 4.9 Telemetry / Observability Audit
- Are dashboard labels truthful?
- Are “pairs evaluated” and “strategy evaluations” clearly separated?
- Are null counters split correctly by quant / pattern / hybrid?
- Are rejection reasons recorded with enough specificity to diagnose behavior?
- Can we tell whether a strategy failed because of:
  - wrong pattern,
  - low strength,
  - volume fail,
  - ATR fail,
  - context mismatch,
  - EV fail,
  - guard fail,
  - or missing inputs?

### 4.10 Future Asset-Type Extensibility
- Does the current filter/strategy design hard-code crypto assumptions?
- Can family filter profiles be recalibrated for other asset classes later?
- What parts of the current system would need explicit re-tuning for new asset types?

---

## 5. Audit Scope

### In Scope
- quant global filters
- pattern global filters
- quant IMF filters
- pattern IMF filters
- family-specific filter profile logic
- VTS filter path and strategy evaluation path
- active trading filter path and strategy evaluation path
- pattern detection and pattern-to-strategy routing
- MCE placement, inputs, outputs, and dependency boundaries
- DI formula, DI thresholds, and DI consumers
- pair/global context usage in filters, strategy detection, scoring, and gates
- duplicate handling for pair + strategy identity
- telemetry / metrics counters and labeling used for diagnosis
- family profile data storage and DB support
- future extensibility implications for other asset types

### Specific Files / Areas to Audit
- `filter-pipeline.ts`
- `active-filter-pool.ts`
- `pattern-filter-profile.ts`
- `system-guards.ts`
- `signal-orchestrator.ts`
- `vts-runner.ts`
- strategy-family canonical mapping
- DI calculation utilities / services
- MCE service and its input requirements
- relevant metrics / telemetry code for Machine Learning / VTS breakdown screen
- `filter_profiles` DB schema
- `screener_filters` DB schema
- tests covering filters, VTS routing, pattern routing, and strategy evaluation

### Out of Scope
- broad MCE math redesign
- UI polish unrelated to metric truthfulness
- random threshold loosening for more trades
- broad strategy redesign for alpha hunting outside the audit findings
- implementation changes beyond minimal instrumentation / evidence gathering unless separately approved

---

## 6. Required Audit Artifacts

The audit must produce these artifacts before any implementation plan is approved:

### Artifact 1 — Dependency / Order-of-Operations Map
A map showing:
- exact pipeline stage order
- what each stage consumes
- what each stage outputs
- where family decisions occur or could occur
- where active and VTS diverge

### Artifact 2 — Input / Units Matrix
A matrix showing for each relevant filter and strategy:
- expected input name
- expected unit / scale
- actual provided source
- actual unit / scale
- mismatch risk

### Artifact 3 — Layer-Responsibility Matrix
A matrix assigning each key condition/check to one of:
- global filters
- family filters
- strategy detection
- scoring / weighting
- hard gates

### Artifact 4 — Architecture Comparison
A direct comparison of Architecture A vs B across:
- compute cost
- implementation complexity
- routing clarity
- parity impact
- duplicate/multi-path handling
- observability / explainability
- dead-path risk
- recommended choice

### Artifact 5 — Null / Rejection Diagnostics Plan
A plan for any telemetry needed to answer unresolved questions, including:
- null reason taxonomy
- rejection reason taxonomy
- quant/pattern/hybrid splits
- pair-vs-strategy evaluation labeling
- before/after comparison method

---

## 7. Read Order for the Audit

Recommended audit read order:

0.5. `screener_filters` current DB values / active rows
1. VTS metrics / telemetry definitions and UI labels
2. `vts-runner.ts`
3. `signal-orchestrator.ts`
4. pattern detection and pattern mapping code
5. quant and pattern filter pipeline code
6. DI calculation code and consumers
7. MCE service + inputs/outputs
8. family profile and filter profile data structures
9. duplicate / guard logic
10. relevant DB schema (`filter_profiles`, `screener_filters`)
11. current tests
12. any gaps requiring instrumentation

This order is intended to go from **observed behavior** → **execution path** → **upstream routing** → **architectural dependency** → **storage/contracts** → **verification coverage**.

---

## 8. File-by-File Audit Questions

### VTS Metrics / Telemetry Code
- What exactly is being counted?
- Are labels truthful?
- Are nulls and evaluations separated correctly?
- Are pattern nulls being mislabeled as quant nulls?

### `vts-runner.ts`
- How are quant survivors evaluated?
- How are pattern survivors evaluated?
- Can a pair spawn multiple strategy evaluations correctly?
- Is the pattern payload handoff correct per strategy?
- Are active and VTS intentionally different?

### `signal-orchestrator.ts`
- How does active trading handle pattern detection and routing?
- Does it attempt multiple patterns correctly?
- Does it preserve pair + strategy distinctness?
- Where does it diverge from VTS, and why?

### Quant / Pattern Filter Code
- Which filters are truly global?
- Which filters are family-specific already or should become family-specific?
- Are IMF checks cheap enough for family fan-out?
- Are there duplicated checks across filters and strategies?

### DI Calculation + Consumers
- What changed in the formula?
- Where are thresholds defined?
- Were thresholds updated after the formula change?
- What are the observed DI distributions now?

### MCE Service
- What inputs does MCE require?
- Which of those inputs are available at post-global stage?
- Can MCE be run earlier without additional fetches or dependencies?
- What hidden assumptions exist in the current system about MCE only running after IMF?
- What outputs must travel with the pair if MCE moves earlier?

### DB / Profile Structures
- Can current schema support family-specific filter profiles cleanly?
- Are extra rows/paths needed?
- Are `filter_profiles` and `screener_filters` sufficient as-is?

### Tests
- What current tests cover routing, filtering, and parity?
- What important cases are untested?
- What tests would need to exist before any implementation is trusted?

---

## 9. Expected Outputs from the Audit

The completed audit should return:

1. **Findings Summary**
   - key problems confirmed
   - problems ruled out
   - ambiguity that remains

2. **Architecture Recommendation**
   - A vs B decision
   - justification
   - implications

3. **Calibration Recommendation**
   - whether DI thresholds should change
   - whether changes differ by path

4. **Routing / Parity Recommendation**
   - VTS vs active differences
   - required fixes if mismatch exists

5. **Telemetry Recommendation**
   - what must be instrumented before implementation or tuning

6. **Implementation Sequencing Recommendation**
   broken into separate downstream tracks as needed:
   - telemetry fixes
   - confirmed bug fixes
   - filter architecture refactor
   - calibration changes
   - verification work

---

## 10. Verification Criteria for the Audit Itself

This audit is only complete if it:

- identifies actual defects vs apparent defects
- separates metrics confusion from logic problems
- produces evidence, not guesses
- defines the preferred architecture with reasons
- explains any recommended threshold changes
- proves or disproves the VTS pattern-routing concern
- confirms pattern detection breadth and correct routing
- confirms how duplicate rules apply to multi-family and multi-pattern outcomes
- provides a phased implementation recommendation instead of one giant mixed batch

---

## 11. Risks and Mitigations

### Risk: Audit scope drifts into implementation
**Mitigation:** keep deliverable focused on findings, artifacts, and recommendations.

### Risk: Architecture choice gets made on intuition instead of evidence
**Mitigation:** require explicit A vs B comparison with compute and contract analysis.

### Risk: Metrics confusion contaminates conclusions
**Mitigation:** verify telemetry truthfulness first.

### Risk: Pattern-path issue gets treated as secondary
**Mitigation:** keep pattern detection breadth and handoff as named audit items.

### Risk: Quant-only design decisions break pattern parity
**Mitigation:** require active + VTS + quant + pattern parity review in audit outputs.

---

## 12. Proposed Next Step After Approval

Once this draft is approved, the next step is to turn it into the **execution brief for the audit itself**, including:

- exact file locations
- assigned audit questions per file
- expected evidence collection method
- required outputs format
- and the first-pass prompt to Claude Code

---

## 13. Review / Approval Section

### Questions for Review
1. Does this plan include everything Kyle and Langston discussed yesterday?
2. Are the audit goal and desired outcome stated correctly?
3. Is Architecture A vs B framed correctly?
4. Is the pattern-path scope explicit enough?
5. Is the DI calibration scope explicit enough?
6. Is anything missing before we approve the plan?

### Status
- [ ] Kyle approved
- [ ] Langston approved
- [ ] Claude Code approved
- [ ] Revisions requested

---

## 14. Current Lean (Subject to Audit)

Current working lean based on discussion so far:

- **Architecture B** is the current front-runner
  - global survivors fan out through family IMF paths
  - MCE remains in current downstream location
  - pair + strategy identity handles multi-path duplicate concerns

But this remains **subject to audit confirmation**.

---

*End of draft.*
