# DawnTrader Post-Replit Workflow
## GitHub + Hetzner Staging + Supabase + Governance Model

**Authors:** Claude Code + Langston
**Date:** 2026-03-31 (Revision 2 -- incorporates Kyle's feedback)
**Status:** Pending Kyle approval
**Replaces:** The 17-step Replit-centered batch workflow in CCPI Pages 2-3

---

## 1. Purpose

The new workflow exists to produce **better outcomes**, not just faster deployment.

The old Replit pipeline forced the team to work through an indirect execution path: zip packaging, INSTRUCTIONS.md handoff, Replit Agent interpretation, delayed access to logs, DB state, and applied code.

The new workflow removes that indirection. We now have direct access to:
- **GitHub** -- actual code and branch state
- **Hetzner staging server (current host: 188.245.193.8)** -- actual deployed runtime, PM2 logs, SSH access
- **Supabase** -- actual DB schema and data, queryable via psql
- **Application logs** -- direct runtime evidence via `pm2 logs`
- **Staging UI** -- actual user-visible behavior (currently http://188.245.193.8)
- **Clone repo on Google Drive** -- Langston can review actual code changes before they are pushed
- **Claude-in-Chrome** -- Claude Code can navigate, screenshot, and inspect the staging UI
- **Langston browser automation** -- Langston can independently verify the staging UI

That direct access must produce tangible improvements:
1. Faster root-cause analysis (read actual logs and stack traces instead of inferring from screenshots)
2. More accurate verification (inspect actual DB state via psql, not guess from UI)
3. Less implementation drift (deploy real code, not interpreted instructions)
4. Stronger code review (Langston sees actual git diffs, not INSTRUCTIONS.md descriptions)
5. Tighter outcome-based iteration (correct, complete, reviewed, and verified -- with direct evidence at every step)
6. Governance that matches reality (verify docs against actual deployed state)

---

## 2. Core Principles

### Principle 1 -- GitHub is the source of truth
If it is not in GitHub, it is not real.

### Principle 2 -- Staging is the proving ground
The Hetzner staging site (currently http://188.245.193.8) is where all work is validated. Every deploy updates what Kyle sees in his browser.

### Principle 3 -- Replit is frozen
Replit stays as-is -- no updates, no syncing. It is a frozen backup. After 2-3 successful batches on the new setup, we stop the FX5 scanner on Replit. No code flows to or from Replit from this point forward.

### Principle 4 -- Outcomes over activity
A batch is not complete because code was written, tests passed, or deployment succeeded. A batch is complete only when **every objective from the scope document is verifiably achieved in the staging UI** and confirmed by both Claude Code and Langston.

### Principle 5 -- Direct access must improve quality
Logs, DB access, UI access, and server control are quality tools. The workflow must use them deliberately, not incidentally.

### Principle 6 -- Governance remains mandatory
The mechanics are simpler, but the documentation discipline stays strict. ALL governance docs live in BOTH the repo AND Google Drive. No split.

---

## 3. Roles

### Kyle
- Approves scope, architecture decisions, priority shifts, and cutover decisions
- Reviews major outcomes and unresolved tradeoffs in the staging UI
- Owns billing/account decisions
- Breaks ties when Claude Code and Langston disagree
- Decides when Replit scanner is stopped and when cutover is final

### Claude Code
- **Only actor who commits to the DawnTrader GitHub repository** (Langston reviews but does not commit unless Kyle explicitly instructs otherwise)
- Primary implementer -- writes code directly in the clone repo
- Presents changes to Langston for code-level review BEFORE pushing to GitHub
- Deploys to staging via SSH after GitHub push
- Performs first-pass verification (logs, DB, UI via Claude-in-Chrome, CI)
- Drafts governance updates, scope files, and completion reports
- Explicitly calls out all surgical edits to existing files in the review presentation

### Langston
- **Code-level reviewer** -- reads actual diffs, traces upstream/downstream impacts, verifies surgical edits are correct. Not high-level "looks right" but "I read the code and the logic is sound."
- Reviews in the clone repo (via Google Drive mount) BEFORE changes are pushed to GitHub
- Independently verifies UI behavior and outcome attainment after staging deploy
- Reviews governance docs for accuracy and completeness
- Reviews batch completion reports and confirms all scope objectives are met

---

## 4. Workflow Phases

### Phase 1 -- Planning and Scope

Kyle gives a directive or problem statement. Claude Code drafts `BATCH_N_SCOPE.md` in `Claude Comms and Packages/Scope Files/`.

**Scope must include:**
1. Intent -- what problem are we solving
2. Desired Outcomes -- specific, verifiable objectives (numbered)
3. Verification Criteria -- how each objective will be proven
4. Files expected to change
5. Risks and mitigations
6. Verification surfaces: which of logs / DB / UI / CI / server health apply
7. Success evidence: what proof will be shown at review time

**Langston gate:** No implementation starts until the scope is outcome-oriented and every objective has a verification method.

### Phase 2 -- Pre-Implementation Audit

Claude Code inspects the real system before changing it:
- Current code path (read the actual files in the clone)
- Runtime dependencies
- Relevant environment variables on staging (check via SSH)
- Tests and baseline state
- Relevant DB tables/schema (query Supabase directly via psql)
- Relevant PM2 logs (check current runtime behavior)
- Current UI state of the feature/area being changed (Claude-in-Chrome screenshot)

Langston reviews the audit reasoning and checks for missed dependencies or scope drift.

**Why this matters:** With direct access to logs, DB, and running code, there is no excuse for assumption-based implementation.

### Phase 3 -- Implementation

Claude Code implements the approved batch directly in the clone repo on the `migration/aws-supabase` branch (or the primary branch after cutover).

No more `DT_Staged_Changes/`, no zips, no INSTRUCTIONS.md.

**Surgical edits to existing files** must be explicitly documented in the review presentation. For every file that receives a surgical edit (as opposed to a full replacement or new file), Claude Code must list:
- The file path
- What was changed (before/after or description)
- Why the change is necessary
- What upstream/downstream code depends on the changed lines

### Phase 4 -- Code Review Gate (Langston reviews BEFORE GitHub push)

**This happens in the clone repo, on Google Drive, BEFORE anything is pushed to GitHub.**

Claude Code presents to Langston:
- Complete `git diff` of all changes
- List of files changed with descriptions
- Explicit callout of every surgical edit
- Expected effect on runtime behavior
- Risk areas and upstream/downstream impact analysis
- Deployment and verification plan

**Langston performs code-level review:**
- Reads the actual diff (not a summary)
- Traces upstream/downstream impacts of surgical edits
- Checks for missed dependencies, edge cases, regression risk
- Verifies architecture fit
- Confirms the changes will achieve the scope objectives

**If Langston identifies issues:** Claude Code revises before pushing. The review-revise cycle repeats until Langston approves.

### Phase 5 -- GitHub Push + CI

After Langston approves, Claude Code commits and pushes to GitHub. CI runs automatically (typecheck, build, Docker build).

If CI fails, Claude Code fixes and re-pushes. Langston is informed of the fix.

### Phase 6 -- Staging Site Update

Claude Code updates the Hetzner staging server via SSH:

```bash
ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha>'"   # B-DEPLOY-LOCK #649: dt-deploy replaces this chain — npm ci is now CONDITIONAL on a lockfile diff, in-chain
```
*(Current staging host: 188.245.193.8)*

**Required evidence before proceeding to verification:**
- Deployed commit hash confirmed (`git log -1 --oneline`)
- PM2 shows process online with 0 recent restarts
- Startup logs show no fatal errors (`pm2 logs dawntrader --lines 20`)
- Staging URL responds HTTP 200
- The staging site is serving the intended build

### Phase 7 -- First-Pass Verification by Claude Code

Claude Code verifies across ALL relevant surfaces defined in the scope:

**A. Logs** (via `pm2 logs dawntrader`):
Startup errors, runtime exceptions, retry storms, connection failures, repeated warnings, silent failure patterns

**B. Database** (via `psql` to Supabase):
Migrations applied correctly, critical tables/rows/state, expected records exist, no unintended data issues

**C. UI / Staging Site** (via Claude-in-Chrome):
Navigate to the specific screens identified in the scope. Take screenshots as evidence. Verify target behaviors work. Check adjacent areas for regression. **The intended result must be visible in the UI.**

**D. CI / Tests** (via GitHub Actions):
Workflow status, typecheck/build pass, any baseline shifts explained

**E. Runtime Health** (via SSH):
Server remains alive, endpoints respond, PM2 stable, scanner running, no deploy-only failures

### Phase 8 -- Second-Pass Verification by Langston

**This is mandatory.** Langston independently reviews:
- Claude Code's verification findings
- The staging UI (navigate and verify visually)
- Critical logs/DB evidence needed to validate the claims

**Langston's focus:**
- Was the intended outcome actually achieved?
- Does the UI prove it?
- Do the logs and DB state agree with the UI?
- Is the explanation consistent with observed reality?
- Are we solving the real problem, or just improving the appearance of success?

### Phase 9 -- Outcome-Based Iteration

**This is the core rule.** A batch is NOT done when code compiles, CI passes, or staging deploy succeeds.

A batch is done only when **every numbered objective from the scope document is verified in the running staging UI** and the supporting logs/DB state confirm the same story.

**Iteration loop:**
1. Claude Code diagnoses the gap between desired and actual outcome
2. Fixes the code in the clone
3. Langston reviews the fix (code-level)
4. Push to GitHub
5. Deploy to staging (git pull + build + pm2 restart)
6. Re-run verification (logs, DB, UI)
7. Report findings
8. Langston re-reviews

Repeat until every objective is achieved or a real blocker emerges.

**Rule: Code-level review on every substantive iteration.** Any substantive code change during iteration goes back through Langston code-level review in the clone, then GitHub push, then staging deploy, then verification. Langston's review is not a one-time gate -- it applies to every meaningful change.

**Escalate to Kyle when:**
- Architecture must change
- Scope must change materially
- A meaningful risk tradeoff appears
- 3+ iterations fail without a clear path

### Phase 10 -- Governance Update

**ALL governance docs live in BOTH places -- no exceptions, no split.**

**In the repo** (`1-system-manual/` and relevant directories):

| Tier | Document | Update When |
|------|----------|-------------|
| **1 (every batch)** | `CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` | Always |
| **1 (every batch)** | `BATCH_CATALOG.md` | Always |
| **1 (every batch)** | `PHASE_HISTORY.md` | Always (if phase applies) |
| **1 (every batch)** | `MEMORY.md` | Always |
| **1 (every batch)** | Scope File | Always |
| **1 (every batch)** | Batch Completion Report | Always |
| **2 (when applicable)** | `SYSTEM_MANUAL.md` | If system behavior changes |
| **2 (when applicable)** | `SYSTEM_IMPACT_MAP.md` | If dependencies change |
| **2 (when applicable)** | `CHANGES_AND_FIXES.md` | If bugs resolved/discovered |
| **2 (when applicable)** | `POST_AUDIT_ROADMAP.md` | If roadmap changes |

**On Google Drive** (`Claude Comms and Packages/`):
All of the above docs PLUS decision memos, architecture notes, migration docs, and audit summaries.

**Rule:** Repo and Google Drive must contain the same documents and tell the same story. Scope files are governance documents and must exist in both locations.

**Langston reviews:** Factual accuracy, completeness, correct closure status, deferred items captured honestly, risks documented accurately.

### Phase 11 -- Batch Completion Report and Closure

Claude Code prepares the batch completion report in `Reports/Batch Completion/`.

**The report must include:**
- Batch number/title
- Branch used and deployed commit hash
- What changed (describe the CONTENT, not just the hash)
- **Scope objectives checklist** -- every numbered objective from the scope document listed with:
  - Verified? YES / NO / PARTIAL
  - Evidence (log excerpt, screenshot, DB query result, UI observation)
  - If NO or PARTIAL: what remains and what is the plan
- Logs checked and findings
- DB checks performed and findings
- UI verification result (with screenshots where applicable)
- CI status
- Remaining risks
- Deferred items
- Closure state: **CLOSED** (all objectives met) or **CONDITIONALLY CLOSED** (with explicit list of what remains)

**Langston reviews the report and confirms:**
- Every scope objective has been addressed
- The evidence supports the closure claim
- No objectives have been silently dropped
- Deferred items are captured and tracked

**The batch is marked CLOSED only when Kyle's desired outcomes from the scope are verifiably complete and confirmed by both Claude Code and Langston.**

---

## 5. How Direct Access Improves Each Phase

| Phase | Old (Replit) | New (Direct Access) | Quality Improvement |
|-------|-------------|--------------------| --------------------|
| Pre-audit | Read clone files, guess runtime state | Read clone + SSH to check live logs, DB, UI | Reality-based instead of assumption-based |
| Implementation | Write to DT_Staged_Changes, create zip + INSTRUCTIONS.md | Write directly to branch in clone | No translation layer, no relay errors |
| Code review | Langston reviews zip contents and INSTRUCTIONS.md descriptions | Langston reviews actual `git diff` in the clone | Sees every changed line, including surgical edits |
| Deploy | replit-cmd upload + Agent + push + pull (multi-step relay) | SSH: git pull + build + pm2 restart (direct) | No Agent interpretation, no message fragmentation |
| Verification | Screenshot-based, UI-only, indirect | Logs + DB queries + UI navigation + CI | Multi-surface verification with actual evidence |
| Debugging | Infer from screenshots, guess from behavior | pm2 logs for stack traces, psql for DB queries | Direct root-cause analysis |
| Iteration | Fix + re-zip + re-upload + re-Agent (multi-step relay) | Fix + review + push + pull + build + restart (direct) | More direct iteration with code review preserved |
| Governance | Governance zips through Replit Agent | Direct git commit + Google Drive update | No packaging overhead |

---

## 6. Replit Policy

Replit is **frozen as of March 30, 2026**. No code changes, no deployments, no syncing.

- Replit remains available as an emergency fallback
- The FX5 scanner continues running on Replit temporarily
- After 2-3 successful batches on the new setup, Kyle will decide when to stop the Replit scanner
- Once stopped, Replit is a cold backup only
- No code ever flows to or from Replit from this point forward

---

## 7. Diagnostics Policy

The staging server has existing diagnostics (Filter Diagnostics tab, System Monitoring page). These are sufficient for routine verification.

**Baseline diagnostics stay in place** for health, scanner state, signal/trade pipeline visibility, and system monitoring (Filter Diagnostics tab, System Monitoring page). These are always on.

**Do not pre-wire heavy ad hoc diagnostics proactively.** Instead:
- Use `pm2 logs` for runtime debugging
- Use `psql` to Supabase for data investigation
- Use Claude-in-Chrome for UI verification
- Add deeper instrumentation temporarily for targeted investigations
- Remove temporary diagnostics once the issue is resolved

The direct access to logs, DB, and server makes heavy pre-wired diagnostics less necessary than they were on Replit.

---

## 8. Cutover Decision

All work currently happens on the `migration/aws-supabase` branch. This is not a per-batch decision -- it is a one-time transition.

**When Kyle approves cutover:**
- The migration branch becomes the primary working branch (renamed or merged to `main`)
- Replit scanner is stopped
- Replit is decommissioned as active infrastructure
- The staging server becomes the primary environment
- A production server may be provisioned later (separate decision)

**Until then:** All batches go on the migration branch, deployed to staging only.

---

## 9. Closure Standard

A batch is CLOSED only when ALL are true:
1. Every numbered scope objective is verified as achieved
2. Evidence exists for each objective (logs, DB, UI screenshots)
3. Staging site is updated with the correct build
4. Claude Code completed first-pass verification
5. Langston completed second-pass verification (code-level + UI)
6. Logs, DB, and UI tell a consistent story
7. Repo governance docs updated (all applicable Tier 1 + Tier 2)
8. Google Drive governance docs updated (same documents, same story)
9. Batch completion report written with scope objectives checklist
10. Langston reviewed and confirmed the completion report
11. Closure state explicitly declared (CLOSED or CONDITIONALLY CLOSED)

---

## 10. One-Line Summary

**Scope (with numbered objectives) -> Pre-audit (read real system) -> Implement in clone -> Langston code-level review in clone BEFORE push -> Push to GitHub -> Deploy to staging -> Claude Code verifies logs/DB/UI -> Langston verifies UI and evidence -> Iterate until every objective is proven -> Governance update (repo + Google Drive) -> Completion report with scope checklist -> Langston confirms -> Close**

---

## 11. Required Follow-On: Governance Sweep

Once this workflow is approved, a governance sweep is required to remove conflicting instructions from the Replit era:
- Update CCPI to replace the old 17-step workflow with this workflow
- Update MEMORY.md with new workflow references
- Update Langston's context/governance/workflow docs
- Remove or archive any "clone repo is read-only" references
- Remove or archive any Replit Agent instructions, replit-cmd references, zip packaging rules
- Ensure Claude Code and Langston context files both reference this workflow as canonical

This sweep is a one-time governance batch performed after Kyle approves this document.
