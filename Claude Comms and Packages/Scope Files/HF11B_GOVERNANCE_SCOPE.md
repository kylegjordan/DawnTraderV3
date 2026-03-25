# HF11B — Governance Enforcement & Session Management

> **Type**: Governance-only batch (no code changes)
> **Target file**: `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
> **Prerequisite**: None — this must land BEFORE Phase 14.5 (Batch 19) and BEFORE Langston's next session window
> **Date**: 2026-03-14

---

## Problem Statement

Kyle identified that governance steps are documented but not enforced. Specific gaps:

1. **Stale references** in CCPI that weren't caught during HF10B governance updates
2. **No session transition protocol** in CCPI — exists only in Claude Code's MEMORY.md (not visible to Langston or future sessions)
3. **No capacity monitoring ownership** — nobody is formally responsible for tracking or reporting token/context limits
4. **No pre-flight checklist** — sessions start work without verifying governance is current
5. **No post-batch audit checklist** — governance updates are hoped-for, not verified
6. **No batch completion report template** — reports vary in content and may miss critical information

Kyle's directive: "Codify governance into law. The more we relax and skip steps, the more we miss things. That's when serious bugs happen."

---

## Part 1: Fix Stale References

### 1A. Four Actors Table (Lines 33-38)

**Current (stale):**
| Actor | Role | Tools |
|-------|------|-------|
| Claude Code | Writes directives, reviews implementations, writes code changes, prepares zip packages for Replit, updates governance documents. Has read access to a local clone of the repository. Does NOT push to GitHub. | Claude Code terminal, file read/write on local clone |
| Replit | Applies code changes from zip packages. Runs validation. Pushes to GitHub. The ONLY actor that pushes to the repo. Replit does NOT make autonomous changes. | Replit Agent, bash shell, npm/node |
| Langston | Autonomous AI project manager on Hetzner server. Manages Replit operations (deploy, test, push), generates reports, communicates with Kyle via Telegram. Can relay messages between Kyle and Claude Code. | OpenClaw gateway, Replit browser automation, Telegram, Google Drive, report-gen |
| Kyle | Approves directives and batch scopes, transfers zip packages between Claude Code and Replit, runs sync-repo.bat, makes decisions on ambiguities. | Google Drive, Git, File Explorer, Telegram |

**Updated:**
| Actor | Role | Tools |
|-------|------|-------|
| Claude Code (You) | Reads source code, writes scope docs, creates batch zips, runs `git pull` to sync clone from GitHub, monitors Langston's capacity. Does NOT push to GitHub. | Claude Code terminal, file read/write on local clone, SSH to Langston's server |
| Replit | Applies code changes from zip packages. Runs validation. Does NOT make autonomous changes — see Replit Behavior Constraints below. | Replit Agent, bash shell, npm/node |
| Langston | Autonomous AI on Hetzner server. Deploys zips to Replit, pushes to GitHub, generates reports, monitors Claude Code's capacity. Reviews scope docs and builds deep system knowledge before deploying. | OpenClaw gateway (Claude Opus 4.6), Replit browser automation, Telegram, Google Drive, report-gen |
| Kyle | Approves scopes, makes decisions on ambiguities, sets up OAuth auth sessions. | Google Drive, Telegram |

### 1B. Post-Push Verification (Line 519)

**Current:** "After every `sync-repo.bat` pull, run:"
**Updated:** "After every `git pull` sync, run:"

### 1C. Last Commit (Line 637)

**Current:** `5f04e4eb` (HF10)
**Updated:** `bbb4612f` (HF10B)

---

## Part 2: Session Transition Protocol (NEW SECTION)

Add after the "How to Start a New Session" section (after line 733). This formalizes what currently exists only in Claude Code's MEMORY.md.

### New Section: Session Lifecycle & Transitions

```markdown
## Session Lifecycle & Transitions

### Token Budget Awareness

Both Claude Code and Langston operate with ~200,000 token context windows. Context degrades as usage increases — responses become repetitive, earlier context is lost, and critical details get dropped. Transitions must be planned, never reactive.

**Warning Thresholds:**
| Usage | Action |
|-------|--------|
| **50%** | Note in conversation: "Session at ~50% context. Current batch can continue." |
| **75%** | Active warning: "Session at ~75% context. Wrap up current task. Do NOT start new batches." |
| **90%** / frequent compaction | Transition required: "Session must transition. Completing handoff now." |

**Hard rule:** Never start a new batch if estimated to exceed remaining token budget. Prefer to transition between batches, never mid-batch.

### Cross-Actor Capacity Monitoring

Each actor monitors the OTHER's capacity — not their own. A degrading session is the least reliable reporter of its own degradation.

| Monitor | Monitored | How |
|---------|-----------|-----|
| **Claude Code** | Langston | SSH to check session health: `openclaw sessions --json`. Watch for repetitive messages, lost context, inability to follow multi-step instructions. |
| **Langston** | Claude Code | Watch for signs in Claude Code's messages: repeated questions, lost awareness of recent batches, contradicting earlier statements. Report to Kyle via Telegram. |

**Escalation:** If either actor detects the other is degrading, notify Kyle immediately with: (1) which actor is degrading, (2) evidence (specific examples), (3) recommended action (transition now vs. finish current task first).

### Post-Batch Capacity Announcement

After every batch closeout (once governance push is verified), each actor announces the OTHER's capacity status. This is not in the batch completion report — it's a live announcement in the conversation/Telegram.

- **Claude Code** announces: "Langston capacity: ~X%" (based on session health check via SSH)
- **Langston** announces: "Claude Code capacity: ~X%" (based on observed message quality)

This creates a regular heartbeat so Kyle always knows where both actors stand — not just at emergency thresholds.

### Claude Code Session Handoff

When approaching token limits or context compaction:
1. Complete the current task (never leave mid-batch)
2. Update MEMORY.md and topic files with any new learnings
3. Update CCPI "Current State" section if batch status changed
4. Write a handoff summary to the cc-inbox or Telegram thread 21 so Langston knows
5. Tell Kyle: "Session reaching context limits. Please start a new session."
6. The new session reads MEMORY.md + CCPI and picks up where the old one left off

### Langston Session Handoff

When Langston's context is degrading:
1. Langston should complete current task and save state to his memory files
2. Claude Code or Kyle clears his session: `openclaw sessions` to manage
3. His persistent memory at `/root/.openclaw/workspace/memory/` survives session clears
4. Kyle sets up fresh OAuth auth for the new session
5. New session reads SOUL.md, IDENTITY.md, TOOLS.md, and memory files to restore context
6. Claude Code sends a context briefing to the new session via cc-inbox

**Important:** Never transition both Claude Code and Langston simultaneously. Transition one, let the new session stabilize, then transition the other if needed. At least one actor must maintain full context continuity at all times.
```

---

## Part 3: Governance Enforcement Mechanisms (NEW SECTION)

Add after the "Rules" section (after line 722). These are the concrete enforcement mechanisms Kyle asked for.

### New Section: Governance Enforcement

```markdown
## Governance Enforcement

### Pre-Flight Checklist (Every Session Start)

Before doing ANY work, every Claude Code session must complete this checklist. No exceptions.

- [ ] Read full CCPI (this file) — not just headers
- [ ] Read MEMORY.md for learnings from previous sessions
- [ ] Verify last commit in CCPI matches `git log --oneline -1`
- [ ] Read DIRECTIVE_INDEX.md for current state
- [ ] Check cc-inbox for unread messages from Langston
- [ ] Report own capacity status to conversation
- [ ] Check Langston's capacity: `ssh root@204.168.141.77 "openclaw sessions --json"`
- [ ] Report Langston's capacity status to Kyle

If any checklist item reveals a discrepancy (e.g., last commit doesn't match, stale references found), flag it immediately before starting work.

### Post-Batch Governance Audit

After every code batch is verified (git pull confirms changes landed), before writing the governance batch:

1. **Tier 1 check**: Open the Governance Update Rules matrix (above). For each Tier 1 file, confirm it will be updated in the governance batch.
2. **Stale reference scan**: Search CCPI for references to the changed functionality. Are any descriptions, role tables, workflow steps, or line references now outdated?
3. **Four Actors table check**: Do the role descriptions still accurately reflect what each actor does?
4. **Rules section check**: Do any rules need updating based on process changes?
5. **"How to Start a New Session" check**: Is the startup procedure still accurate?

This audit is a STEP in the process, not something hoped-for. The governance batch is incomplete without it.

### Batch Completion Report — Mandatory Sections

Every batch completion report (generated by Langston) must include ALL of the following sections:

| Section | Content |
|---------|---------|
| **Executive Summary** | What was deployed, how many batches, pipeline status |
| **Per-Batch Details** | For each batch: commit hash, type (code/governance), files changed, what was fixed/added |
| **Governance Updates** | Which governance files were updated and what changed. If process/workflow changes were made, call them out explicitly |
| **Capacity Status** | Current token usage estimates for both Claude Code and Langston |
| **Stale Reference Check** | Confirmation that CCPI was audited for stale references after governance batch |
| **Next Steps** | What comes next, any blockers, any decisions needed from Kyle |

If a section is empty or missing, the report is incomplete. Langston should not send incomplete reports.
```

---

## Part 4: Update "How to Start a New Session" (Lines 725-733)

**Current:**
```
1. Read this file — read it fully, not just the headers
2. Read the snapshot log
3. Read DIRECTIVE_INDEX.md
4. Verify permission settings
5. Ask Kyle what to work on
6. Before writing any code: agree on scope with Kyle
```

**Updated:**
```
1. Read this file (CCPI) — read it fully, not just the headers
2. Read MEMORY.md for learnings and context from previous sessions
3. Read the snapshot log (DT_Frozen_Snapshots/SNAPSHOT_LOG.md)
4. Read DIRECTIVE_INDEX.md to see what's completed and what's next
5. Verify permission settings in .claude/ settings files
6. Complete the Pre-Flight Checklist (see Governance Enforcement section)
7. Report capacity status for self and Langston to Kyle
8. Ask Kyle what to work on, or continue from where the previous session left off
9. Before writing any code: agree on scope with Kyle, write a scope document, and conduct a pre-implementation audit
```

---

## Summary of All Changes

| # | What | Where | Type |
|---|------|-------|------|
| 1 | Fix Four Actors table — update all 4 role descriptions | Lines 33-38 | Fix stale reference |
| 2 | Fix Post-Push Verification — remove sync-repo.bat reference | Line 519 | Fix stale reference |
| 3 | Fix Last Commit — update to bbb4612f (HF10B) | Line 637 | Fix stale reference |
| 4 | Add Session Lifecycle & Transitions section | After line 733 | New section |
| 5 | Add Governance Enforcement section (pre-flight, post-batch audit, report template) | After line 722 | New section |
| 6 | Update "How to Start a New Session" — add MEMORY.md, pre-flight checklist, capacity reporting | Lines 725-733 | Update existing |
| 7 | Update Last Updated header | Line 6 | Standard update |
| 8 | Add HF11B to Completed Directives table | Lines 629-630 | Standard update |

**Files in this batch:** 1 file only (CLAUDE_CODE_PROJECT_INSTRUCTIONS.md)
**Risk:** None — governance documentation only
