---
name: dt-governance
description: "DawnTrader governance documentation management. Use when: (1) directing Claude Code to create governance batches, (2) reviewing governance updates, (3) updating CHANGES_AND_FIXES.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, DIRECTIVE_INDEX.md, or CLAUDE_CODE_PROJECT_INSTRUCTIONS.md. Triggers on: governance, documentation update, changes log, system manual, impact map, directive, Batch NB, governance batch."
---

# DawnTrader Governance

Claude Code writes ALL governance documents. You review them before approving for Replit upload.

## Governance Files (5 Documents)

| File | Purpose | When Updated |
|---|---|---|
| CHANGES_AND_FIXES.md | Chronological log of all changes, fixes, decisions | Every batch |
| SYSTEM_MANUAL.md | Living technical reference for the entire system | When architecture changes |
| SYSTEM_IMPACT_MAP.md | File-level dependency and impact tracking | When files added/modified/deleted |
| DIRECTIVE_INDEX.md | Index of all directives with status tracking | When directives change status |
| CLAUDE_CODE_PROJECT_INSTRUCTIONS.md | Persistent context for Claude Code sessions | When state changes significantly |

All located in: /mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/1-system-manual/

## Governance Batch Workflow

1. Code batch must be applied AND verified working first — never skip this
2. Direct Claude Code to produce governance batch BATCH_NB
3. Claude Code reads the current state of all governance files from clone repo
4. Claude Code writes updates to DT_Staged_Changes/BATCH_NB/
5. Claude Code creates INSTRUCTIONS.md with PART B surgical edits (these files are too large to include wholesale in the zip)
6. Claude Code zips and places in Governance Zips/
7. You review the governance batch:
   - Are the changes accurate and complete?
   - Do CHANGES_AND_FIXES entries match what actually happened?
   - Are SYSTEM_IMPACT_MAP entries correct for all new/modified files?
   - Are directive statuses correct in DIRECTIVE_INDEX?
   - Is CLAUDE_CODE_PROJECT_INSTRUCTIONS up to date?
   - Are any bugs/risks marked RESOLVED prematurely? (NEVER before code verification)
8. If issues: send feedback to Claude Code, iterate
9. If satisfactory: upload to Replit (use dt-replit-ops skill)
10. Verify governance deployment

## Your Review Standards

### CHANGES_AND_FIXES.md
- Does the entry accurately describe what changed and why?
- Does it reference the correct batch number and directive ID?
- Are test impact numbers correct (before/after)?
- Are decisions documented (especially anything that deviated from original scope)?

### SYSTEM_MANUAL.md
- Are new components/features described clearly?
- Are existing descriptions updated to reflect changes?
- Is the technical detail sufficient for someone reading it cold?

### SYSTEM_IMPACT_MAP.md
- Are all new files listed with correct dependencies and dependents?
- Are modified file entries updated?
- Are deleted files removed?
- Are test coverage references correct?

### DIRECTIVE_INDEX.md
- Are directive statuses accurate (IN PROGRESS, COMPLETE, DEFERRED, CANCELED)?
- Are completion dates correct?
- Are batch references correct?

### CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
- Does the "Current State" section reflect the latest batch?
- Are roadmap block statuses updated?
- Are architecture descriptions current?
- Is the test baseline correct?

## Hard Rules

- Governance batch is ALWAYS separate from code batch
- Governance comes AFTER code is verified, never before
- Never mark bugs or risks RESOLVED until the code fix is verified working
- Surgical edits only — these files are too large to include wholesale
- Always reference batch number and directive ID in updates
