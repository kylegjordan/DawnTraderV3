# Batch 12 Scope — Directive 12.3.2 (Spec Phase): Strategy Specification Placement

**Directive**: 12.3.2 (Spec phase only — no code implementation)
**Type**: Documentation placement
**Baseline Commit**: `2064d5c9` (Batch 11B governance)
**Risk**: NONE — documentation only, no code changes

---

## Context

Through sessions spanning 2026-02-27 to 2026-03-03, a complete mathematical specification for the 8 unimplemented strategies (3 PATTERN + 5 HYBRID) was:

1. **Drafted** with full formulas, constants, entry/exit/confidence logic for all 8 strategies
2. **Reviewed** by 4 LLMs (xAI Grok, Google Gemini, ChatGPT, Claude) in Round 1
3. **Consolidated** into 30 decision items (6 bugs, 3 safeguards, 11 calibrations, 10 enhancements)
4. **Resolved** through Round 2 consensus (unanimous or clear majority on all 30 items)
5. **Finalized** with all 30 decisions incorporated into the specification

This batch places the finalized specification into the repository's system manual structure for permanent reference.

---

## Scope

### Files Created (2) — in `1-system-manual/directives/12.3.2/`

| File | Lines | Purpose |
|------|-------|---------|
| `DIRECTIVE_12.3.2.md` | ~80 | Directive overview, status tracking, dependency notes |
| `STRATEGY_SPECIFICATION_12.3.2_FINAL.md` | ~1,460 | Complete vetted mathematical specification for all 8 strategies |

### Files Modified (1)

| File | Change |
|------|--------|
| `1-system-manual/directives/DIRECTIVE_INDEX.md` | Update 12.3.2 row to show SPEC COMPLETE status and spec date |

---

## Upload Instructions

1. Create folder `1-system-manual/directives/12.3.2/` on Replit
2. Upload both files from this batch's `12.3.2/` folder into that directory
3. Upload the updated `DIRECTIVE_INDEX.md` to `1-system-manual/directives/`, replacing the existing file

---

## Impact Summary

| Metric | Value |
|--------|-------|
| Files created | 2 |
| Files modified | 1 |
| Code changes | 0 |
| Test baseline impact | None — 800/81 unchanged |
| Risk level | NONE |

---

## What This Does NOT Do

- Does NOT implement any strategy code (that's Phase C, Batch 14+)
- Does NOT modify Signal Orchestrator or strategy-engine.ts
- Does NOT affect runtime behavior in any way
- Does NOT change test baseline

---

## Reference Documents (in Claude Comms and Packages/Scope Files/)

These documents chronicle the full review process but do NOT need to be uploaded to Replit:

| Document | Purpose |
|----------|---------|
| `STRATEGY_SPECIFICATION_12.3.2.md` | Original draft (superseded by FINAL) |
| `STRATEGY_REVIEW_CONSOLIDATED_DECISIONS.md` | Round 1 review consolidation |
| `STRATEGY_CONSENSUS_ROUND_2.md` | Round 2 consensus prompt |
| `Consensus Round 2 Responses.md` | Round 2 LLM responses |
| `PHASE_12.3_INVESTIGATION_SCOPE.md` | Investigation scope for all 4 remaining directives |
