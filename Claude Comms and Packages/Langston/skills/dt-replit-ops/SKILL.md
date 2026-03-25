---
name: dt-replit-ops
description: "Full Replit interaction for DawnTrader deployments. Use when: (1) uploading batch zips to Replit, (2) telling Replit to apply changes, (3) running Replit shell commands, (4) viewing and testing the app in the preview window, (5) monitoring paper trading, (6) reading Replit logs or error output, (7) verifying deployments. Triggers on: Replit, upload, deploy, preview, test app, paper trading, shell, push, apply batch."
---

# Replit Operations

You are responsible for all Replit interactions. Kyle no longer uploads zips or runs commands — you do.

## Uploading a Batch Zip

1. Locate the zip in Batch Zips/ or Governance Zips/ on Google Drive
2. Upload the zip file to Replit's workspace
3. Tell Replit:
```
Please unzip BATCH_N-DIR_X.Y.Z_DESCRIPTION.zip and follow the INSTRUCTIONS.md file inside.
```

## What Replit Does (You Verify Each Step)

### For Code Batches
1. Replit unzips the batch
2. Replit places files according to PART A of INSTRUCTIONS.md
3. Replit applies surgical edits from PART B (if any)
4. Replit runs the commit and push using REPLIT_PUSH_SCRIPT.sh with the message from PART C
5. Replit pushes to GitHub

### For Governance Batches
Same process, but files are documentation updates, not code.

## Verification After Deployment

### File Verification
- Confirm all files were placed in the correct locations
- Confirm surgical edits were applied correctly
- Confirm no extra files were created or modified outside scope

### Test Verification
- Ask Replit to run the test suite
- Compare pass/fail counts against baseline (~784 pass / ~83 fail)
- Any NEW failures are blocking — do not proceed
- Pre-existing failures (the ~83) are tracked separately

### Git Verification
- Confirm Replit pushed to GitHub successfully
- After Kyle runs sync-repo.bat (or if automated): verify clone repo has the new commit
- Confirm commit message matches the prescribed format

## Preview Window Testing

For batches that add or modify functionality, test in the Replit preview window:

1. Navigate to the app URL in the preview
2. Test the specific functionality added/modified by the batch
3. Check that existing functionality still works
4. Look for visual errors, broken layouts, missing data
5. Check browser console for JavaScript errors
6. Check network requests for API failures

### What to Test Per Batch Type
- **New UI component**: verify it renders, displays correct data, responds to interaction
- **API changes**: verify endpoints return expected data, error handling works
- **Filter/scanner changes**: verify scan results reflect new filter parameters
- **Signal pipeline changes**: verify signals flow through the pipeline correctly
- **Strategy changes**: verify strategy detect functions fire under correct conditions

## Paper Trading Monitoring

When paper trading is active, monitor:
1. Scan cycle output — are pairs being filtered correctly?
2. Signal generation — are signals being produced with correct FinalScore, rankingScore?
3. Trade execution — are paper trades opening and closing as expected?
4. Position management — are stop losses and take profit levels correct?
5. Telemetry — are metrics being recorded accurately?

If anomalies detected:
1. Capture the evidence (logs, screenshots, data)
2. Consult Claude Code for diagnosis (use dt-claude-code-ops skill)
3. Produce hotfix if needed
4. Send Troubleshooting Report to Kyle (use dt-kyle-reports skill)

## Replit Shell Commands

### Run Tests
```
npm test
```

### Run Specific Test File
```
npx vitest run path/to/test.ts
```

### Check Server Status
```
npm run dev
```

### Push to GitHub
```
bash REPLIT_PUSH_SCRIPT.sh "Commit message here"
```

### Pull Latest
```
git pull origin dawntrader-v4
```

## Troubleshooting Replit Issues

### Upload Failed
- Check file size limits
- Try uploading individual files instead of zip
- Verify zip is not corrupted

### Tests Failing After Deployment
- Get the full error output
- Identify if failures are new (blocking) or pre-existing (known)
- If new: diagnose with Claude Code, produce fix, redeploy

### Preview Not Loading
- Check if the dev server is running
- Check console for build errors
- Check network requests for failing API calls

### Push Failed
- Check git status for conflicts
- Verify branch is correct (dawntrader-v4)
- Check for authentication issues
