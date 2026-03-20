# BATCH_19G_PUSH_GOV — Deployment Instructions

> **REPLIT AUTONOMY REMINDER**: You are applying a governance batch. Follow these instructions exactly. Do NOT make autonomous changes, add features, refactor code, or modify files not listed here. If something is unclear, stop and ask.

## Files to Update

| File | Action |
|------|--------|
| `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` | **REPLACE** with the version in this zip |

## Steps

1. Replace `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` with the file from this zip (overwrite the existing file completely).

2. Push to GitHub using the conditional push command:

```bash
git -C $HOME/workspace add -A && git -C $HOME/workspace diff --cached --quiet && git -C $HOME/workspace commit --amend -m "Batch 19G governance: conditional push command, batch report ownership, Langston GPT-5.4 permanent" || git -C $HOME/workspace commit -m "Batch 19G governance: conditional push command, batch report ownership, Langston GPT-5.4 permanent" ; git -C $HOME/workspace push origin dawntrader-v4
```

## What Changed

- **Push command updated**: `REPLIT_PUSH_SCRIPT.sh` deprecated. All push references now use the inline conditional command (`git add → diff --cached --quiet → amend or commit → push`). This handles Replit auto-commits cleanly — our commit message always wins.
- **Completed directives updated**: Added Batch 19G HF2, HF3, VN, VN HF to the completed table. Last commit updated to `8cbff9fd`.
- **Langston GPT-5.4 permanent**: Brain description updated to note GPT-5.4 is the final model choice (no more switching).
- **Batch report ownership**: Clarified that Claude Code writes batch completion reports (Rule 24), Langston posts them to Telegram.
- **Next step updated**: VN threshold calibration → Strategy-Family Filter Profiles → Phase 14.6 X Stocks → Phase 11 Finalization.

## Validation

- Verify the file was replaced by checking the `Last Updated` line reads: `2026-03-20 (after Batch 19G GOV ...)`
- Verify the `Last commit` line reads: `8cbff9fd`
