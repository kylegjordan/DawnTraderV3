# DawnTrader Directive Implementation Workflow

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-02-19
> **Purpose**: Governs the process for issuing, implementing, reviewing, and completing directives from Phase 12 onward. Ensures discipline, traceability, and system-wide awareness throughout all implementation work.
> **Participants**: Claude Code (directive author & reviewer), Replit (implementer), Kyle (approver & sync manager)

---

## The Three Rules

1. **No improvisation.** Directives must be detailed enough that Replit has zero ambiguity. Code blocks, line numbers, file paths. If the directive doesn't specify it, Replit doesn't do it.
2. **No stale files.** Never write a directive on stale code. Never review on stale code. Always sync first.
3. **No undocumented changes.** Every change flows through the document chain: Directive → Review → Completion → System Manual update.

---

## Repository Sync

### How to Sync (One-Click)

After Replit pushes to GitHub, run `sync-repo.bat` (located in `1-system-manual/`):

- **Double-click** the file, OR
- **Run from terminal**: `1-system-manual\sync-repo.bat`

The script fetches from GitHub, fast-forwards `dawntrader-v4`, and merges into the Claude worktree. It prints the last 5 commits so you can see what changed.

### When to Sync

| Moment | Who Syncs | Why |
|--------|-----------|-----|
| Before Claude writes a directive | Kyle runs sync | Claude needs current code to write accurate directives |
| After Replit implements a directive | Kyle runs sync | Claude needs updated code to review the implementation |
| After Replit makes corrections | Kyle runs sync | Claude needs corrected code to re-review |
| After Replit applies Document Update Package | Kyle runs sync | Claude needs to confirm doc updates are in place before next directive |

---

## The 7-Step Directive Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: PRE-DIRECTIVE SYNC                                  │
│   Kyle: run sync-repo.bat                                   │
│   Claude: confirm files visible, read affected code         │
├─────────────────────────────────────────────────────────────┤
│ Step 2: DIRECTIVE AUTHORING                                 │
│   Claude: consult SYSTEM_IMPACT_MAP.md                      │
│   Claude: write DIRECTIVE_X.Y.Z.md (with impact analysis)   │
│   Kyle: review and approve                                  │
├─────────────────────────────────────────────────────────────┤
│ Step 3: IMPLEMENTATION                                      │
│   Replit: implement directive exactly as written             │
│   Replit: provide validation evidence                       │
│   Replit: push to GitHub                                    │
├─────────────────────────────────────────────────────────────┤
│ Step 4: POST-IMPLEMENTATION SYNC                            │
│   Kyle: run sync-repo.bat                                   │
│   Claude: confirm updated files visible                     │
├─────────────────────────────────────────────────────────────┤
│ Step 5: IMPLEMENTATION REVIEW                               │
│   Claude: review code against directive                     │
│   Claude: write REVIEW_X.Y.Z.md                             │
│   If corrections needed → Step 5A (correction cycle)        │
├─────────────────────────────────────────────────────────────┤
│ Step 6: COMPLETION REPORT                                   │
│   Claude: write COMPLETION_X.Y.Z.md                         │
├─────────────────────────────────────────────────────────────┤
│ Step 7: DOCUMENT UPDATES                                    │
│   Claude: write DOC_UPDATE_X.Y.Z.md (Document Update Pkg)   │
│   Kyle: send package to Replit                               │
│   Replit: apply updates verbatim, push to GitHub             │
│   Kyle: run sync-repo.bat                                    │
│   → READY FOR NEXT DIRECTIVE                                │
└─────────────────────────────────────────────────────────────┘
```

### Step 5A: Correction Cycle

When review finds issues:

1. Claude writes correction steps in the REVIEW document (or a separate sub-directive if complex)
2. Kyle sends corrections to Replit
3. Replit implements corrections and pushes to GitHub
4. Kyle runs sync-repo.bat
5. Claude re-reviews the corrections
6. Repeat until APPROVED

For small corrections (1-2 tweaks): corrections go directly in the REVIEW document. For larger issues: a follow-up sub-directive is written (e.g., DIRECTIVE_12.1.1-FIX.md).

### Step 7: Document Update Package

**Why this step exists**: Claude Code maintains all governance documents (`1-system-manual/` files), but the only path to GitHub is through Replit (push-only). To bridge this gap, Claude Code produces a **Document Update Package** — a structured document containing every file edit needed, in the same REMOVE/REPLACE format used in directives. Kyle sends the package to Replit, Replit applies it verbatim, and pushes.

**How it works**:

1. Claude Code writes `DOC_UPDATE_X.Y.Z.md` in the directive folder (e.g., `directives/12.1.1/DOC_UPDATE_12.1.1.md`)
2. The package contains exact edits for each affected file — same format as directive implementation steps (file path, REMOVE block, REPLACE WITH block)
3. Kyle sends the package to Replit
4. Replit applies every edit **exactly as written** — no interpretation, no additions, no reformatting
5. Replit pushes to GitHub
6. Kyle runs `sync-repo.bat` to pull the updated docs into the local clone

**What a Document Update Package typically contains**:
- SYSTEM_MANUAL.md section updates (reflecting what the directive changed)
- CHANGES_AND_FIXES.md status updates (marking bugs/risks as RESOLVED)
- DIRECTIVE_INDEX.md status change (marking the directive COMPLETE)
- LEGACY_DEPRECATION_PLAN.md updates (if removal waves were completed)
- SYSTEM_IMPACT_MAP.md updates (if component dependencies changed)
- The COMPLETION_X.Y.Z.md file itself (new file creation)

**Replit's rule for Document Update Packages**: This is the **one exception** to the "never modify `1-system-manual/` files" rule. When Kyle provides a Document Update Package authored by Claude Code, Replit applies it character-for-character and pushes. Replit does not interpret, improve, or add to the package. If something looks wrong, Replit asks Kyle — it does not fix it independently.

---

## Directory Structure

```
1-system-manual/
  SYSTEM_MANUAL.md              ← What the system IS (kept current)
  CHANGES_AND_FIXES.md          ← Bug/risk registry
  LEGACY_DEPRECATION_PLAN.md    ← Removal plan
  POST_AUDIT_ROADMAP.md         ← Phases 12-22 roadmap
  SYSTEM_IMPACT_MAP.md          ← Component dependency map
  WORKFLOW.md                   ← This document
  sync-repo.bat                 ← One-click sync script
  directives/
    DIRECTIVE_INDEX.md           ← Master index of all directives
    12.1.1/
      DIRECTIVE_12.1.1.md        ← The directive
      REVIEW_12.1.1.md           ← Post-implementation review
      COMPLETION_12.1.1.md       ← Completion report
    12.1.2/
      DIRECTIVE_12.1.2.md
      REVIEW_12.1.2.md
      COMPLETION_12.1.2.md
    ...
```

---

## Document Templates

### Directive Template

```markdown
# Directive [X.Y.Z]: [Title]

> **Phase**: [Roadmap phase, e.g., Phase 12.1]
> **Author**: Claude Code
> **Date**: [Date]
> **Status**: DRAFT / APPROVED / IMPLEMENTED / COMPLETE
> **Related**: BUG-XXX, RISK-XXX, prior directives

---

## Context & Motivation

**What this directive does**: [1-2 sentence summary]

**Why this change is needed**: [The problem it solves, referencing the audit findings]

**Current behavior** (with file paths and line numbers):
- In `[file]`, line [N]: [what currently happens]
- [Additional current behavior]

**Expected behavior after this directive**:
- [What should happen instead]

---

## Impact Analysis

**Consulted**: SYSTEM_IMPACT_MAP.md — [Component Name]

**Directly affected files**:
| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file.ts` | MODIFY | [What changes] |
| `path/to/file.ts` | DELETE | [Why removed] |

**Upstream dependencies** (verify these still work):
- [Component]: [Why it matters, what to check]

**Downstream consumers** (verify these still receive correct data):
- [Component]: [Why it matters, what to check]

**Background services affected** (if any):
- [Service]: [Timer/lifecycle impact, restart behavior]

**Shared state / config affected**:
- [Config/state]: [What changes about it]

**Test files to verify**:
- `[test file]`: [What it validates]

---

## Scope

**Files to be modified**: [exact paths]
**Files to be created**: [if any]
**Files to be deleted**: [if any]
**Files explicitly OUT OF SCOPE** (do not touch): [files that look related but should not change]

---

## Implementation Steps

Numbered, specific, with code blocks:

### Step 1: [Description]
In `[file]`, line [N]:

**REMOVE**:
```typescript
// existing code to remove
```

**REPLACE WITH**:
```typescript
// new code
```

### Step 2: [Description]
[Continue with specific steps...]

---

## Validation & Verification Requirements

Replit must provide evidence for ALL of the following:

- [ ] TypeScript compiles with zero new errors (`npx tsc --noEmit`)
- [ ] All existing tests pass (`npm test`)
- [ ] [Specific behavioral verification]
- [ ] [Screenshot or console output proving the change works]
- [ ] [Edge case tests if applicable]

---

## Expected Outcomes

| Dimension | Before | After |
|-----------|--------|-------|
| [Behavior] | [Current] | [Expected] |

---

## Risks & Rollback

**What could go wrong**: [Specific risks]
**Rollback procedure**: [How to revert if needed]
**Dependencies**: [Other directives that must be complete first, or that depend on this]

---

## References

- Roadmap phase: Phase [X]
- Related bugs/risks: [BUG-XXX, RISK-XXX]
- System Manual chapter: Chapter [N]
- System Impact Map: Layer [N] — [Component]
- Prior directives: [None / Directive X.Y.Z]
```

---

### Review Template

```markdown
# Review: Directive [X.Y.Z] — [Title]

> **Reviewer**: Claude Code
> **Date**: [Date]
> **Review Cycle**: [1 = first review, 2+ = after corrections]

---

## Review Summary

| Dimension | Result |
|-----------|--------|
| **Status** | APPROVED / APPROVED WITH CORRECTIONS / REJECTED |
| **Files Reviewed** | [count] |
| **Implementation Accuracy** | [percentage or qualitative] |
| **Scope Compliance** | No unspecified changes / [deviations noted] |
| **Validation Evidence** | Provided and verified / [gaps noted] |

---

## Checklist

- [ ] All specified changes implemented
- [ ] No unspecified changes made (no scope creep)
- [ ] No new bugs or TypeScript errors introduced
- [ ] Code matches directive intent (not just letter)
- [ ] Upstream dependencies still function correctly
- [ ] Downstream consumers still receive correct data
- [ ] Background services unaffected (or impact addressed)
- [ ] Validation evidence provided and verified
- [ ] Test files pass

---

## Findings

### Correct (Implemented as specified)
- [File/change]: ✅ Matches directive

### Deviations (Implementation differs from directive)
- [File/change]: Directive specified [X], implementation did [Y]
  - Verdict: ACCEPTABLE / NEEDS FIX
  - Reason: [Why acceptable, or what needs to change]

### Missing (Not implemented)
- [Item]: Not found in implementation
  - Severity: CRITICAL / MINOR
  - Impact: [What this means for system behavior]

---

## Required Corrections (if status is not APPROVED)

### Correction 1: [Description]
In `[file]`, line [N]:
[Specific correction steps, same format as directive implementation steps]

### Correction 2: [Description]
[Continue...]

---

## Verdict

[Final assessment — 2-3 sentences summarizing the review outcome and any concerns]
```

---

### Completion Report Template

```markdown
# Completion Report: Directive [X.Y.Z] — [Title]

> **Author**: Claude Code
> **Date**: [Date]
> **Phase**: [Roadmap phase]

---

## Summary

| Dimension | Value |
|-----------|-------|
| **Directive** | [X.Y.Z] — [Title] |
| **Status** | COMPLETE |
| **Implementation Date** | [Date Replit completed] |
| **Review Cycles** | [1 = first try, 2+ = corrections needed] |
| **Total Duration** | [From directive issued to completion] |

---

## Changes Made

| File | Change | Purpose |
|------|--------|---------|
| `[path]` | [Modified/Created/Deleted] | [Why] |

---

## Validation Results

| Check | Result |
|-------|--------|
| TypeScript compilation | PASS |
| Existing test suite | PASS |
| [Specific check] | PASS |

---

## Impact on System

**Bugs resolved**: [BUG-XXX — mark RESOLVED in CHANGES_AND_FIXES.md]
**Risks resolved**: [RISK-XXX — mark RESOLVED in CHANGES_AND_FIXES.md]
**Risks mitigated**: [RISK-XXX — update status if partially addressed]
**Legacy items completed**: [Wave X item — mark COMPLETE in LEGACY_DEPRECATION_PLAN.md]
**New capabilities**: [If any]
**Behavior changes**: [If any — what users/system will notice]

---

## Document Updates Required

- [ ] SYSTEM_MANUAL.md — [Sections to update, what changed]
- [ ] CHANGES_AND_FIXES.md — [Bugs/risks to mark resolved]
- [ ] LEGACY_DEPRECATION_PLAN.md — [Items to mark complete]
- [ ] DIRECTIVE_INDEX.md — [Update status to COMPLETE]
- [ ] SYSTEM_IMPACT_MAP.md — [Update if dependencies changed]
```

---

### Document Update Package Template

```markdown
# Document Update Package: Directive [X.Y.Z] — [Title]

> **Author**: Claude Code
> **Date**: [Date]
> **Directive**: [X.Y.Z] — [Title]
> **Purpose**: Apply post-directive document updates to governance files.
> **Instructions for Replit**: Apply every edit below exactly as written. Do not interpret, improve, or add anything. If something looks wrong, ask Kyle.

---

## New Files to Create

### File 1: `1-system-manual/directives/[X.Y.Z]/COMPLETION_[X.Y.Z].md`

Create this file with the following content:

```
[Full content of the completion report]
```

---

## Edits to Existing Files

### Edit 1: SYSTEM_MANUAL.md — [Section description]

In `1-system-manual/SYSTEM_MANUAL.md`, locate this text:

**FIND**:
```
[Existing text to locate]
```

**REPLACE WITH**:
```
[Updated text]
```

### Edit 2: CHANGES_AND_FIXES.md — Mark [BUG/RISK] resolved

In `1-system-manual/CHANGES_AND_FIXES.md`, locate this text:

**FIND**:
```
[Existing bug/risk entry]
```

**REPLACE WITH**:
```
[Updated entry with RESOLVED status]
```

### Edit 3: DIRECTIVE_INDEX.md — Update status

In `1-system-manual/directives/DIRECTIVE_INDEX.md`, locate this text:

**FIND**:
```
| [X.Y.Z] | [Title] | IN REVIEW | [date] | — | — | — |
```

**REPLACE WITH**:
```
| [X.Y.Z] | [Title] | COMPLETE | [date] | [date] | [N] | — |
```

### Edit 4: [Additional files if needed]

[Same FIND/REPLACE format]

---

## Verification

After applying all edits, confirm:
- [ ] All FIND blocks were located successfully
- [ ] All REPLACE blocks were applied
- [ ] No other changes were made to any files
- [ ] Push to GitHub
```

---

## Key Principles

### Directive Quality
- **One directive = one logical change.** Don't combine unrelated changes.
- **Code over prose.** Show the exact code to write, not a description of what to write.
- **Line numbers are anchors.** Reference specific lines so Replit knows exactly where to look.
- **Impact analysis is mandatory.** Every directive must consult the System Impact Map.
- **Background services matter.** If the change touches anything with a timer, interval, or event handler, the directive must address lifecycle impact.

### Sequencing
- **Sequential directives wait.** If B depends on A, don't issue B until A is COMPLETE.
- **Independent directives can overlap.** But each gets its own review cycle.
- **One at a time is the default.** Parallel directives only when truly independent.

### Evidence
- **Replit proves the work.** Every directive includes specific validation requirements. "Done" is not evidence.
- **Screenshots for UI changes.** Before/after screenshots required for any frontend directive.
- **Console output for backend changes.** TypeScript compilation output, test results, or runtime logs.

### Document Discipline
- **System Manual updates after every directive.** It always reflects the system as it IS today, not yesterday.
- **Registry updates are immediate.** Resolved bugs/risks are marked the moment the directive is complete.
- **The chain is the audit trail.** Directive → Review → Completion → Document Update Package. No gaps.
- **Document updates go through Replit.** Claude Code writes the Document Update Package, Kyle sends it to Replit, Replit applies it verbatim and pushes. This is the only path for governance doc updates to reach GitHub.

---

## Directive Granularity Guidelines

| Roadmap Item | Typical Directive Count | Example |
|--------------|------------------------|---------|
| Single math fix | 1 | Fix DI divergence (BUG-004) |
| Security hardening (multiple files, same pattern) | 1-2 | Remove JWT fallback from 9 files |
| Dead code wave removal | 1-3 | Wave 1 safe deletions (batched by risk level) |
| Pipeline rewiring | 2-4 | Regime authority resolution + strategy routing + confidence cleanup |
| Major feature (MCE, VTS) | 5-10+ | Multiple sub-directives per feature component |

---

## Directive Index Location

`1-system-manual/directives/DIRECTIVE_INDEX.md`

Statuses: **PENDING** → **ISSUED** → **IN PROGRESS** → **IN REVIEW** → **CORRECTIONS** → **COMPLETE**

---

*This workflow is the governing process for all DawnTrader implementation work from Phase 12 onward. All participants (Claude Code, Replit, Kyle) follow this process for every directive.*
