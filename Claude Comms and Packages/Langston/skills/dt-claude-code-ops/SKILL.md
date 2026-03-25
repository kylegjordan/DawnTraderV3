---
name: dt-claude-code-ops
description: "Manage Claude Code sessions for DawnTrader development. Use when: (1) delegating coding work to Claude Code, (2) reviewing code Claude Code produced, (3) iterating on code quality with Claude Code, (4) directing Claude Code to fix bugs or improve implementation, (5) running code analysis or audits. Triggers on: Claude Code, code changes, implement, build, develop, coding task, spawn, code review, fix, debug, analyze code."
---

# Working with Claude Code

Claude Code is your developer. It writes all code, creates all files, builds all zips, writes all governance docs. You are the reviewer, approver, and conductor. You understand the code and math — use that to be a better reviewer than Kyle could be.

## CRITICAL: How Claude Code Sessions Work

Each Claude Code invocation is a SEPARATE PROCESS. When it finishes, the process exits. The conversation is saved to a session file on disk.

WITHOUT `--continue`: Every message goes to a FRESH Claude Code that has NO MEMORY of previous exchanges. It only knows what is in CLAUDE.md and the project instruction files. DO NOT DO THIS for multi-step work — you will be talking to a wall.

WITH `--continue`: The new Claude Code process LOADS THE PREVIOUS SESSION from disk before processing your message. It sees the entire conversation history — every prompt you sent, every response Claude Code gave, every file it read or wrote. This is how you have a real back-and-forth conversation.

### The Rule (NON-NEGOTIABLE)
- First message of a new batch/task: NO --continue (fresh session)
- Every subsequent message within that same batch/task: ALWAYS use --continue
- If you forget --continue on a follow-up, Claude Code will not know what you are talking about

### What --continue Gives Claude Code Access To
The full conversation chain: your original prompt, Claude Code's response, your follow-up question, Claude Code's answer, your revision request, Claude Code's revision — all of it, in sequence. Plus the auto-loaded CLAUDE.md and project instructions.

### When to Start Fresh (No --continue)
- Beginning a brand new batch (Batch 19 after Batch 18 is done)
- Switching from code batch to governance batch
- Claude Code's context window (~200K tokens) is full (conversation too long)
- The previous session is corrupted or confused

## How to Run Claude Code

### Start New Batch (Fresh Session)
```bash
cd /mnt/gdrive/Dawn\ Trader/DT_Clone_Repo/DawnTraderV3 && claude --permission-mode bypassPermissions --print "YOUR FIRST PROMPT FOR THIS BATCH"
```

### Continue the Conversation (EVERY follow-up message)
```bash
cd /mnt/gdrive/Dawn\ Trader/DT_Clone_Repo/DawnTraderV3 && claude --continue --permission-mode bypassPermissions --print "YOUR FOLLOW-UP"
```

### Resume a Specific Session by ID
```bash
cd /mnt/gdrive/Dawn\ Trader/DT_Clone_Repo/DawnTraderV3 && claude --resume SESSION_ID --permission-mode bypassPermissions --print "YOUR MESSAGE"
```

### Background Task (For Long-Running Work)
```bash
bash workdir:"/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3" background:true command:"claude --permission-mode bypassPermissions --print 'YOUR PROMPT'"
```
Then continue with:
```bash
bash workdir:"/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3" command:"claude --continue --permission-mode bypassPermissions --print 'FOLLOW-UP'"
```

### Monitor Background Sessions
```bash
process action:log sessionId:XXX
process action:poll sessionId:XXX
```

## Context Window Management

Claude Code (Opus 4.6) has a ~200K token context window. Within a single batch workflow (scope, implementation, review, fixes), this is typically enough for the full conversation chain.

If the conversation grows too long (very large batch with many iterations):
1. Claude Code will start dropping older context or degrading
2. You will notice responses becoming less coherent or missing earlier context
3. At that point: start a fresh session and re-provide the critical context in the first prompt
4. Include a summary of what was done so far and what remains

CRITICAL: The project governance files (CLAUDE_CODE_PROJECT_INSTRUCTIONS.md, MEMORY.md) are Claude Code's persistent memory ACROSS batches. Within a batch, --continue is the memory mechanism. Across batches, the governance files are the memory mechanism. Both must be maintained rigorously.

## Your Collaboration Pattern with Claude Code

### Scope Phase
You direct Claude Code to draft the scope. Then you REVIEW it:
- Does the scope capture Kyle's intent accurately?
- Are the desired outcomes measurable and verifiable?
- Are the file changes comprehensive — nothing missing?
- Are the architecture assumptions correct? (Read the actual source files to verify.)
- Is there scope creep?

If you have concerns, send specific feedback:
- "The scope assumes MCE returns X but the actual code shows Y — revise."
- "Missing the filterTier tagging on pattern-pool signals — add to scope."
- "The desired outcome is too vague — rewrite as: [specific measurable outcome]."

Iterate until you are satisfied the scope is complete and correct.

### Implementation Phase
Direct Claude Code with a clear prompt:

```
You are implementing DawnTrader Batch N — [Title].

INTENT: [from scope doc]
DESIRED OUTCOME: [from scope doc]

READ these source files (DO NOT MODIFY ORIGINALS):
- /mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/[path1]
- /mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/[path2]

WRITE modified/new files to:
- /mnt/gdrive/Dawn Trader/DT_Staged_Changes/BATCH_N/[repo-relative-path]

CHANGES:
[Specific changes from scope document]

CONSTRAINTS:
- Clone repo is READ ONLY
- Preserve existing test compatibility
- Follow TypeScript conventions in the codebase
- Do not modify files outside scope
- Include INSTRUCTIONS.md and README.md in batch folder
- Zip the batch folder and place at:
  /mnt/gdrive/Dawn Trader/DT_Clone_Repo/Claude Comms and Packages/Batch Zips/BATCH_N-DIR_X.Y.Z_DESCRIPTION.zip

When finished, list all files created/modified with a brief description of each change.
```

### Code Review Phase (YOUR MOST IMPORTANT JOB)
After Claude Code delivers, review everything:

1. Read each modified file — understand what changed and why
2. Compare against the scope — was everything implemented?
3. Compare against the INTENT — does this actually achieve what we want?
4. Look for:
   - Logic errors (wrong conditions, off-by-one, missing null checks)
   - Math errors (wrong formulas, incorrect normalization, boundary issues)
   - Integration errors (wrong imports, missing exports, broken call chains)
   - Missing edge cases (what happens when data is empty, when API fails, when values are extreme)
   - Test coverage gaps
5. Check INSTRUCTIONS.md — will Replit know exactly what to do?

If issues found, send precise feedback:
```
Issues found in Batch N code review:

1. [FILE]: [specific issue] — [what should be done instead]
2. [FILE]: [specific issue] — [what should be done instead]

Please fix these and update the zip.
```

### Iteration Phase (When Things Do Not Work)
After Replit deployment, if verification fails:

1. Gather evidence: test output, error logs, preview behavior
2. Direct Claude Code to analyze:
```
Batch N was deployed but verification failed.

DESIRED OUTCOME: [what we wanted]
ACTUAL RESULT: [what happened]
EVIDENCE: [test output, errors, screenshots]

Diagnose the root cause and propose a fix. Do not guess — trace the actual code path.
```
3. Review Claude Code's diagnosis — does it make sense?
4. Direct the fix, redeploy, reverify

### Governance Phase
Direct Claude Code to produce the governance batch:
```
Batch N code is verified and working. Produce governance batch BATCH_NB.

Update these files with surgical edits:
1. CHANGES_AND_FIXES.md — log what changed in Batch N
2. SYSTEM_MANUAL.md — update any architecture descriptions affected
3. SYSTEM_IMPACT_MAP.md — add/update file entries for new/modified files
4. DIRECTIVE_INDEX.md — update directive statuses
5. CLAUDE_CODE_PROJECT_INSTRUCTIONS.md — update current state section

Write all governance files to: /mnt/gdrive/Dawn Trader/DT_Staged_Changes/BATCH_NB/
Include INSTRUCTIONS.md with PART B surgical edits (these files are too large to include wholesale).
Zip and place in Governance Zips/.
```

## Troubleshooting with Claude Code

When bugs appear in paper/live trading:
1. Observe the symptom (preview window, logs, telemetry)
2. Gather data (error messages, stack traces, unexpected values)
3. Direct Claude Code to trace the code path and diagnose
4. Review the diagnosis — does the root cause explain ALL observed symptoms?
5. Direct the fix — produce a hotfix batch
6. Deploy, verify, send Hotfix Report to Kyle

## Rules

- Claude Code writes ALL code and documentation — you never edit files directly
- You ALWAYS review before approving — you are the quality gate
- Clone repo is READ ONLY for both you and Claude Code
- All output goes to DT_Staged_Changes/BATCH_N/
- If Claude Code and you disagree on approach after genuine effort, escalate to Kyle
