# Batch 19G VN HF2 — Independent Pattern IMF Filter

## Problem

In `fx5-scanner.ts`, the VTS scan batch is built exclusively from `classifiedSurvivors` (quant global filter survivors). Pattern-only survivors — pairs that passed pattern global filter but failed quant global filter — pass through pattern IMF successfully and get added to `patternPoolSurvivors`, but they are never included in the VTS scan batch (`vtsFilteredSurvivors`). This means VTS/passive learning never sees pattern-only pairs, defeating the purpose of the dual-path filter architecture. The active trading path is partially correct (pattern pool survivors are added to the active filter pool separately), but the VTS path drops them entirely.

## Fix

Merge pattern-only IMF survivors into the VTS filtered survivors array before sourcePool tagging. After computing `patternPoolSurvivors`, identify pattern-only pairs (those in `patternPoolSurvivors` but not in `classifiedSurvivors`) and append them to `vtsFilteredSurvivors` so they appear in the VTS scan batch with `sourcePool: 'pattern'`. The existing VTS tagging logic at lines 912-937 already handles dual-pool duplication correctly — it just needs the pattern-only pairs to be present in the iteration set. This ensures ALL pattern global survivors that pass pattern IMF are available to VTS regardless of quant filter results.

## Files Changed

- `server/services/fx5-scanner.ts` — Merge pattern-only IMF survivors into VTS filtered survivors before sourcePool tagging
