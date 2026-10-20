---
name: dt-verification
description: "Multi-stage verification for DawnTrader batches. Use when: (1) reviewing Claude Code's scope or code output, (2) verifying Replit deployment, (3) testing functionality in the preview window, (4) checking test counts, (5) validating desired outcomes were achieved, (6) detecting anomalies, (7) deciding whether to iterate or advance. Triggers on: verify, check, validate, test, audit, review, anomaly, compare, confirm, iterate."
---

# DawnTrader Verification

Verification happens at EVERY stage of the pipeline, not just after deployment. You are the quality gate. Never trust blindly — always verify independently.

## Test Baseline
- Current: ~784 pass / ~83 fail (867 total)
- Pre-existing timeout flakiness causes +/-5 variance
- Any NEW test failures introduced by a batch are BLOCKING
- Pre-existing failures are tracked separately
- Update this baseline in MEMORY.md after each batch

## Stage 1: Scope Verification

After Claude Code produces the scope document:
- Does the scope capture Kyle's original intent accurately?
- Is the Desired Outcome measurable and verifiable?
- Are the Verification Criteria specific enough to actually verify?
- Are ALL files that need modification listed?
- Are the estimated line counts reasonable?
- Are dependencies identified — what must be true before this batch can work?
- Are risks identified — what could go wrong?
- Does this batch align with the forest-level project mission?

## Stage 2: Code Review Verification

After Claude Code produces the code batch:
- Read every modified and new file
- Compare implementation against scope — was everything implemented?
- Compare against INTENT — does this achieve what we actually want?
- Check for logic errors, math errors, integration errors
- Check for missing edge cases and error handling
- Check INSTRUCTIONS.md completeness — will Replit know exactly what to do?
- Verify test files are adequate for the changes
- Check that no out-of-scope files were modified

## Stage 3: Deployment Verification

After Replit applies the batch:

### File Verification
- All files placed in correct locations
- Surgical edits applied correctly
- No extra files created outside scope
- No files accidentally deleted

### Test Verification
- Run full test suite
- Compare pass/fail counts against baseline
- Categorize any failures: NEW (blocking) vs PRE-EXISTING (known)
- If new failures: do NOT proceed — diagnose and fix first

### Git Verification
- Confirm push to GitHub succeeded
- Confirm commit hash matches after sync-repo.bat
- Confirm commit message matches prescribed format
- Confirm branch is dawntrader-v4

## Stage 4: Intent and Outcome Verification

This is the most important verification stage. Tests can pass while the desired outcome is missed.

For each batch, check against the scope document:

### Intent Check
"Does the implementation serve the intent stated in the scope?"
- If the intent was "reduce API calls while maintaining coverage" and API calls dropped but coverage also dropped — the intent was NOT met even if tests pass.

### Desired Outcome Check
"Was the specific desired outcome achieved?"
- If the desired outcome was "pattern strategies produce signals in the RTB queue" — verify that pattern signals actually appear in the queue.
- This may require functional testing in the preview window, log analysis, or database queries.

### Verification Criteria Check
Walk through each verification criterion from the scope:
- Test verification: did pass/fail counts change as expected?
- Functional verification: does the feature work as described when tested?
- Data verification: do logs/telemetry/database show expected values?

## Stage 5: Functional Testing (Preview Window)

For batches that add or modify functionality:

1. Open the app in the Replit preview
2. Navigate to the relevant page/tab
3. Verify the new/modified feature is visible and functional
4. Test normal operation: does it do what the scope says it should?
5. Test edge cases: what happens with empty data, extreme values, rapid clicks?
6. Check browser console for errors
7. Check network requests for API failures
8. Compare actual behavior against Desired Outcome

## Iteration Decision Tree

After verification, one of three outcomes:

### Outcome A: All Clear
- All tests pass (within baseline tolerance)
- Desired outcome achieved
- Functional testing confirms behavior
- Proceed to governance batch

### Outcome B: Fixable Issues
- Minor bugs or omissions found
- Root cause is clear
- Direct Claude Code to produce fix
- Redeploy and reverify
- Send Hotfix Report to Kyle if significant

### Outcome C: Fundamental Problem
- Desired outcome not achieved despite code working as written
- Design flaw or scope gap identified
- OR 3+ iterations without resolution
- Escalate to Kyle with:
  - What the desired outcome was
  - What actually happened
  - What was tried
  - What the options are going forward

## Anomaly Detection

Flag immediately if ANY of these occur:
- Test count shifts by more than +/-5 from baseline without explanation
- Pass count decreases while fail count stays same (tests deleted?)
- New files appear that were not in scope
- Import paths reference deleted or non-existent files
- Performance metrics degrade (scan times increase, API calls increase)
- Log patterns change unexpectedly
- Paper trades behave differently than expected
- FinalScore distributions shift without code changes to scoring logic

## Verification Standards

- Never trust blindly — Claude Code and Replit both make mistakes
- Always verify independently — do not accept self-reported success
- Numbers must add up — even small discrepancies warrant investigation
- Intent over spec — if implementation technically matches spec but misses the trading objective, it is wrong
- Small anomalies equal expensive mistakes in trading systems
- When in doubt, investigate. When still in doubt, escalate.
