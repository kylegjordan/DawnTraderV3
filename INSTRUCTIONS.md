# BATCH 19G VN GOVERNANCE — Deployment Instructions

## Commit Message
```
Batch 19G VN governance: Phase 14.5 CLOSED — VN formula + threshold calibration documented
```

## Push Command
```bash
git -C ~/workspace add -A && git -C ~/workspace commit -m "Batch 19G VN governance: Phase 14.5 CLOSED — VN formula + threshold calibration documented" && git -C ~/workspace push origin dawntrader-v4
```

## Files to Place (repo-relative paths)

| File | Destination |
|------|-------------|
| `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` | Replace existing |
| `1-system-manual/directives/DIRECTIVE_INDEX.md` | Replace existing |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Replace existing |

## What Changed

### CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
- **Last Updated** line updated to 2026-03-20 (Batch 19G VN GOV)
- **Completed Directives table**: Added Batch 19G HF2 (`238d3315`), HF3 (`ed284dff`), VN (`aa4babfc`), and VN GOV rows
- **Last commit** updated to `aa4babfc` (Batch 19G VN)
- **Next step** updated: Strategy-Family Filter Profiles -> Phase 14.6 (X Stocks) -> Phase 11 Finalization
- **Phase 14.5 status note** expanded with VN formula revision details and threshold calibration
- **Langston Brain** (Quick Reference): GPT-5.4 permanently, no more model switching
- **Rule 13** (push command): Added `git -C ~/workspace` as preferred push method
- **Investigation Notes**: Added Batch 19G HF2, HF3, and VN entries
- **Pending Directives note**: Updated with VN revision details and new roadmap

### DIRECTIVE_INDEX.md
- Added 3 new rows to Phase 14.5 table: Batch 19G HF2, HF3, VN
- Summary statistics updated (8 -> 11 batches in Phase 14.5, review cycles 36 -> 39)

### SYSTEM_IMPACT_MAP.md
- **Last Updated** line updated to 2026-03-20
- **Section 3.4 (IMF Metrics)**: Added Batch 19G VN details — new `calculateVolNoise()` formula (log-returns MAD/median), distribution shift from ~0.15 to ~0.64, empirically calibrated thresholds (0.60/0.68/0.72/0.80), frontend hardcoded values removed, downstream consumer impact noted

## Validation
- Governance-only batch — no code changes, no compilation needed
- Verify files are placed at correct repo-relative paths
- Verify git push succeeds

## Replit Autonomy Reminder
You are Replit. You apply file changes exactly as provided. You do NOT:
- Reformat, restructure, or "improve" any files
- Add comments, headers, or metadata not in the original
- Skip or reorder any files
- Make autonomous decisions about file placement
Place files exactly as specified, run the push command, report the result.
