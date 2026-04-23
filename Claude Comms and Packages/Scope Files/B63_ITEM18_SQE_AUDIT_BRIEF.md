# B63 Item 18 — SQE Audit Brief

**Owner:** Langston
**Author:** Claude Code (this brief), with Kyle as authorizing stakeholder
**Date issued:** 2026-04-22 08:00 UTC
**Updated:** 2026-04-22 09:40 UTC — added §E Modularization Lens; noted Opus 4.6 continuation
**Deliverable target:** `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md`

## Continuation status (2026-04-22 09:40 UTC)

A GPT-5.4 Langston session produced an initial 4087-byte skeleton (see the existing deliverable file) containing:
- Part A scope + preliminary code reads: `MIN_FINAL_SCORE=0.35`, `MIN_REGIME_WEIGHT=0.30`, FinalScore formula `hybridScore*0.4 + confidence*0.3 + regimeWeight*0.2 - decayPenalty*0.1` clamped [0,1], pattern-pool floor distinction, async vs sync SQE path distinction
- Part B scope + RegimeWeight backfill formula `trendStrength*0.7 + (1 - volatility)*0.3` clamped [0.1,1]
- Parts C and D as structured placeholders

**What has NOT been done yet:** Part A data pull, Part B empirical matrix, Part C decile decomposition, Part D structural verdict, Executive Summary.

**Langston is now running on Anthropic Claude Opus 4.6 (977K context, 3.7× the previous 266K cap).** Continue the audit from where GPT-5.4 stopped. Do not redo the skeleton — extend it.

**Honesty rule:** BOOTSTRAP.md §PRIME INVARIANT + SOUL.md §Task Completion Honesty apply throughout. Three-option status protocol required for every status update.

## Critical operating-mode context (added 2026-04-22 10:35 UTC, post-unblock)

**Active trading is OFF and has been for months.** Only VTS (Virtual Trade Simulator, passive learning) is running. Paper trading is pending Phase 19. Live trading is pending Phase 20/21.

**Frame every finding through this lens:**

- SQE gates admitting 98%+ of signals is **expected and correct for VTS** — the simulator's purpose is to learn broadly from the largest possible signal population. A strict gate in VTS mode would starve the learning pipeline.
- SQE gates will need to become **actually active** before paper mode ships in Phase 19. Findings that say "threshold admits everything" are NOT current bugs — they are pre-Phase-19 work items.
- FinalScore being anti-predictive IS a real bug independent of mode — a broken composite score produces bad outcomes whether it's gating paper or training VTS. Calibration findings are always valid.
- Since VTS is building the training data that Phase 19 will inherit, calibration fixes done NOW prevent Phase 19 from shipping with a backwards baseline. **Fix during B66, not after paper turns on.**

**Frame Parts C and D accordingly:**
- Part C rankingScore finding: the schema gap is real, but its operational impact is zero in VTS mode. The gap becomes a problem in paper mode when ranking-cuts actually select between competing trades.
- Part D structural recommendation: treat SQE as "tuned for VTS broadness, needs recalibration before Phase 19." Do NOT recommend tightening thresholds for immediate deploy — that would disrupt the VTS learning pipeline.

**This is VTS-mode observation for Phase 19 preparation, not production-severity active-trading findings.** Urgency is B66 / pre-Phase-19, not emergency patch.

---

## 1. Purpose

The Signal Quality Evaluator (SQE) is the gate that decides whether a raw strategy signal is allowed to become a VTS / paper trade. It applies scoring, thresholds, regime-specific multipliers, and a final ranking cutoff. Item 18 is an audit of whether that gate is calibrated correctly and whether its structure (single-stage vs multi-stage) is still the right design.

**This is a read-only audit. No code changes. No threshold edits. No deploy-triggering work.** The B63 observation window is still running and the open book is being allowed to resolve without interference.

## 2. Three audit parts

### Part A — FinalScore threshold calibration

**Question:** Is the current FinalScore threshold producing the right admit/reject split?

**What to evaluate:**
- Distribution of FinalScore across the last 7 days of VTS trades (use `logs/virtual_trades/`).
- Admit rate today vs. the distribution — are we admitting the top X% of signals, and is X the right X?
- Cross-reference against trade outcomes: do trades in the top FinalScore decile have materially better WR / AvgR than trades in the bottom admitted decile? If the top and bottom admitted deciles perform the same, the threshold is effectively noise.
- Regime-segmented view: does the FinalScore threshold make sense in all 5 regimes (TFS, IE, ST, RBS, HVU), or does one regime need a different cutoff?

**Output:** a section of the audit doc titled "A. FinalScore threshold" with the distribution data, the decile-performance table, and a verdict: KEEP / RAISE / LOWER / REGIME-SEGMENT.

### Part B — RegimeWeight multiplier distribution + outliers

**Question:** Is the RegimeWeight multiplier behaving as designed, or are there outlier multipliers distorting downstream scoring?

**What to evaluate:**
- For each (strategy, regime) pair, what is the RegimeWeight multiplier being applied, and what does the distribution look like across the scan universe?
- Are there any (strategy, regime) pairs where the multiplier is effectively 0 (strategy never admitted in that regime) or 1.0 for everything (multiplier is a no-op)?
- Are there multipliers that are asymmetrically large (>1.5) or small (<0.5) that are pulling trade selection in a direction not justified by 7d closed-trade evidence?
- Compare designed multipliers vs empirical outcomes: if `(strategy_X, TFS)` has multiplier 1.3 but its 7d TFS closed WR is below universe average, the multiplier is miscalibrated.

**Output:** a section of the audit doc titled "B. RegimeWeight distribution" with a (strategy × regime) matrix showing designed multiplier vs empirical outcome proxy, and a list of concrete miscalibration candidates.

### Part C — rankingScore 3-outcome decomposition

**Question:** The rankingScore is the final cutoff that picks trades when multiple signals clear the FinalScore threshold in the same scan cycle. Is it discriminating correctly across the three possible outcomes?

**What to evaluate:**
- Bucket each closed trade by its rankingScore decile at entry.
- For each decile, compute the 3-outcome split:
  - **Outcome 1** — hit take-profit
  - **Outcome 2** — hit stop-loss
  - **Outcome 3** — timed out / force-closed
- The null hypothesis is: "rankingScore is noise" (all deciles have similar 3-outcome splits). If that's true, rankingScore is not doing its job.
- The passing hypothesis is: "top-decile rankingScore has materially higher TP% and lower SL% than bottom-admitted decile." Quantify the gap.

**Output:** a section titled "C. rankingScore 3-outcome decomposition" with the decile table and a verdict on whether rankingScore is discriminating (KEEP / REVISE / REMOVE).

### Part E — Modularization Lens (added 2026-04-22)

**Question:** From the audit evidence in Parts A-D, what are the natural module boundaries for a future modularization of the signal quality stack?

**Why this is here:** Items 15, 18, and 19 are collectively enumerating the 150+ variables that drive the system. The future modularization phase (currently in the post-live backlog) needs exactly this data. Rather than re-enumerating later, capture the modularization-relevant observations now, while the audit is already looking at every lever.

**What to evaluate (optional — complete Parts A-D first):**
- **Input-cluster analysis** — which SQE inputs (FinalScore, RegimeWeight, rankingScore, confidence floor, ROI gate, governance gate) share upstream data sources? Variables that always move together are candidates for the same module.
- **Independence analysis** — which SQE inputs could be swapped, replaced, or reweighted without touching the others? Independence is the modularization dividing line.
- **Cadence analysis** — which SQE inputs update at what frequency? Pattern-pool thresholds that change per-batch vs FinalScore weights that change per-calibration vs rankingScore that updates per-scan are candidates for separate modules with separate cadences.
- **Configuration surface analysis** — which constants are currently hard-coded in code (`server/core/filters/signal_quality_evaluator.ts`), which are in config files (`server/config/score-weights.config.ts`), which come from the DB? A modular system would lift ALL tunable parameters to config or DB. Identify the hard-coded ones that should move.

**Output:** a section titled "E. Modularization Notes" with:
- A proposed module partition of the SQE stack (e.g. "Gate module / Scoring module / Ranking module / Governance module") with the variables each would own
- A list of hard-coded constants that should be promoted to config or DB as part of the modularization
- A short recommendation — "SQE is a strong modularization candidate because [reason]" OR "SQE should stay monolithic because [reason]"

**Priority:** this section is optional for Item 18 if context runs short. It feeds into a post-audit synthesis document (`MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`) that Claude Code will write after all three audits land. Skip this section cleanly with an explicit note rather than half-completing it.

### Part D — Structural evaluation: single-vs-multi-stage SQE

**Question:** Should SQE stay a single-stage gate (one FinalScore + one threshold + one ranking) or should it split into multiple stages (e.g. quality gate → strategy-fit gate → regime-fit gate → ranking)?

**What to evaluate:**
- What does the code currently do — single-stage or already multi-stage?
- Read `server/services/sqe-*.ts` or wherever the SQE implementation lives. Map the sequence of checks.
- Where do signals drop out of the funnel today, and are those drop-outs justified by the data from Parts A/B/C?
- If a multi-stage design would provide more diagnostic clarity (which stage is rejecting what), propose the stage boundaries.
- If a single-stage design is sufficient, say so and explain why.

**Output:** a section titled "D. Structural evaluation" with the current-state map, the argument for/against restructuring, and a recommendation.

---

## 3. Evidence sources

**Required read-only inputs:**
- `logs/virtual_trades/*.jsonl` — last 7 days of VTS closed trades. Each row has FinalScore, rankingScore, regime, strategy, outcome.
- `server/services/` — SQE implementation files. Start with anything matching `sqe-*`, `signal-quality`, `filter-tier`.
- `server/config/canonical-regime-strategy-map.ts` — the canonical source for regime/strategy multiplier intent.
- `1-system-manual/SYSTEM_MANUAL.md` — look for the SQE / Signal Quality section for designed-behavior reference.

**Do NOT touch:**
- Anything that requires a git commit, a push, a build, or a PM2 restart.
- Any threshold values in config or source code, even if you identify a miscalibration — the finding goes in the audit doc, not in an edit.

---

## 4. Deliverable structure

File: `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md`

Suggested skeleton:
```
# B63 Item 18 — SQE Audit

## Executive Summary (3-5 bullets, written last)

## A. FinalScore threshold calibration
  - Distribution analysis
  - Decile performance table
  - Verdict

## B. RegimeWeight distribution
  - (strategy × regime) matrix
  - Miscalibration candidates
  - Verdict

## C. rankingScore 3-outcome decomposition
  - Decile x (TP/SL/timeout) table
  - Discrimination gap analysis
  - Verdict

## D. Structural evaluation (single vs multi-stage)
  - Current-state map
  - Recommendation

## Appendix — Data sources and queries used
```

---

## 5. Interaction protocol during the audit

- **Status updates:** use the three-option protocol. Concrete artifacts with specifics, or explicit "NO PROGRESS" with reason, or explicit "CANNOT COMPLETE" with alternative. No "working on it."
- **Questions for Claude Code:** if you hit a place where the scope is ambiguous or an input is missing, flag it directly in Thread 21 as a specific ask. Do not proceed on assumption.
- **Questions for Kyle:** escalate only if you hit a decision that requires his authority (e.g. you discover SQE is architecturally broken in a way that would require a code change before you can finish the audit). Otherwise stay in the Langston ↔ CC loop.
- **Partial deliverables:** if you finish Part A before Parts B/C/D, post Part A and continue. Do not wait until the whole doc is done.

---

## 6. Target timeline

- **Pre-registered:** kick off today (2026-04-22) post-reset.
- **First partial expected:** Part A section or similar within 1-2 exchange rounds of engagement.
- **Full audit doc expected:** by 2026-04-26 or sooner, so findings are available to inform the 2026-04-28 Item 13 decision gate and the B66 scope sizing.
- **If your context fills before completion:** explicit "NO PROGRESS, context too long, need reset" per the honesty rule. Do not stall silently.

---

## 7. What Claude Code is doing in parallel

- Running the 48h+ observation window on the open trade book (no code changes until book resolves).
- Updating SIM + System Manual governance for B63/B64a (separate workstream).
- Item 15 (adaptive framework audit) scaffolding.
- Item 19 (cadence/latency audit) scaffolding.
- Item 13 evidence-accumulation script for the 2026-04-28 decision gate.

Items 15 and 19 are CC-owned; Item 18 is yours. Item 13 is a decision gate both of us contribute evidence into.

---

*End of brief. Confirm receipt in Thread 21 before beginning, with an explicit acknowledgment of: (a) scope, (b) deliverable path, (c) in-scope vs out-of-scope, (d) honesty rule applies.*
