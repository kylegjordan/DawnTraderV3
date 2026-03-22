# Batch 14 — Phase 13: MCE Installation + L12-L20 Legacy Removal

**Date**: 2026-03-04
**Commits**: `8f26369a` (Batch 14), `db521adc` (Batch 14-hotfix)
**Snapshot**: SNAPSHOT-022 (commit `589be749`)
**Branch**: dawntrader-v4
**Directive**: 13.1

---

## Batch Components

### Batch 14 (Code) — commit `8f26369a`
- MCE core build (2 new files)
- Signal orchestrator + VTS runner wired to MCE (2 modified)
- L12-L20 full removal (29 deleted)
- Consumer file updates (5 modified)
- Snapshot log update (1 modified)

### Batch 14-hotfix (Enum Fix) — commit `db521adc`
- `shared/schema.ts` — `strategyTypeEnum` expanded 9 → 18 values
- `migrations/0002_batch14_strategy_enum_expansion.sql` — ALTER TYPE for 9 new enum values
- Fixed `syncGlobalStrategies()` startup crash (range_trade + 8 new strategies missing from DB enum)

### Batch 14B (Governance) — this batch
- CHANGES_AND_FIXES.md — BUG-002, BUG-003, BUG-008, RISK-002, RISK-016, RISK-019, RISK-020 marked RESOLVED
- SYSTEM_MANUAL.md — MCE added to authoritative components, MCP/ARE marked removed, regime architecture updated
- SYSTEM_IMPACT_MAP.md — MCE added as component, MCP/ARE + L-Series marked removed
- DIRECTIVE_INDEX.md — Phase 13 section added, Directive 13.1 COMPLETE
- DIRECTIVE_13.1.md — Full directive write-up (new file)
- BATCH_14_README.md — This file (new file)
- CLAUDE_CODE_PROJECT_INSTRUCTIONS.md — Current state updated

---

## Files Changed Across All Three Batches

| Batch | New | Modified | Deleted | Net Lines |
|-------|-----|----------|---------|-----------|
| Batch 14 | 2 | 8 | 29 | ~-8,200 |
| Batch 14-hotfix | 1 | 1 | 0 | +20 |
| Batch 14B | 2 | 5 | 0 | +docs |
| **Total** | **5** | **14** | **29** | **~-8,180** |

---

## Test Baseline

| Metric | Before (Batch 13B) | After Batch 14 | After Hotfix |
|--------|---------------------|----------------|--------------|
| Pass | 791 | 782 | 791 |
| Fail | 90 | 84 | 90 |
| Skip | 0 | 15 | 0 |
| Total | 881 | 881 | 881 |

Baseline restored to 791/90 after hotfix resolved schema mismatch.
