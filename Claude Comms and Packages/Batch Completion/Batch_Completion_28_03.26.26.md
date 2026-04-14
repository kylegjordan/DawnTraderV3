# Batch 28 Completion Report

**Date**: 2026-03-26
**Batch**: 28
**Phase**: 14.6
**Commit**: `ca831f50`

## Executive Summary
Fixed the pattern-path DI threshold that was causing 4,915 DI failures per 24h. Root cause: hardcoded fallback of 30 while family paths used 8-12. Added DB seed rows for active_pattern (DI_MIN=10) and vts_pattern (DI_MIN=8). Updated existing DB rows via SQL UPDATE (onConflictDoNothing skipped inserts because rows already existed with old values). Lowered hardcoded fallback from 30 to 10.

## Changes
| File | Change |
|------|--------|
| server/db/seed-family-filters.ts | Added active_pattern and vts_pattern rows |
| server/services/fx5-scanner.ts | Fallback DI_MIN: 30 → 10 |
| Database (runtime) | active_pattern diMin=10.00, vts_pattern diMin=8.00 confirmed |

## Post-Implementation Audit
- Code review: Both edits verified in clone
- Git log: Clean fast-forward, commit ca831f50
- DB state: Confirmed via raw SQL that active_pattern=10.00, vts_pattern=8.00
- **Note**: Existing DB rows had old values (30/20) from a prior batch. `onConflictDoNothing()` skipped inserts. Had to UPDATE rows via SQL. Seed file is now correct for fresh deployments.
- **Server needs restart** for code changes + DB threshold pickup

## Verification (post-restart)
- Pattern DI failures should drop significantly (from ~4,915 to much lower with threshold 10 vs 30)
- Pattern pool survivors should increase correspondingly

## Next Steps
- Batch 29: UI layout + taxonomy + labeling
- Server restart needed for Batches 27+28 to take effect
