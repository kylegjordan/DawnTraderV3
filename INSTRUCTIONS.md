# Batch 19G VN HF2 — Independent Pattern IMF for VTS

## Files Modified

- `server/services/fx5-scanner.ts` — Merge pattern-only IMF survivors into VTS scan batch

## What Changed

The VTS scan batch was built exclusively from `classifiedSurvivors` (quant global filter survivors). Pattern-only pairs — those that passed pattern global filter and pattern IMF but failed quant global filter — were never included in the VTS batch. This meant VTS/passive learning never processed pattern-only pairs.

**Fix:** After computing `vtsQuantSurvivors` (renamed from `vtsFilteredSurvivors`), we identify pattern-only IMF survivors from `patternPoolSurvivors` that are NOT already in the quant survivors, then merge them in. The combined array becomes the new `vtsFilteredSurvivors`. The existing sourcePool tagging logic correctly handles these pattern-only pairs (they get `sourcePool: 'pattern'`).

## Commit Message

```
Batch 19G VN HF2: Independent pattern IMF — all pattern global survivors go through pattern IMF regardless of quant results
```

## Push Command (bulletproof)

```bash
git -C $HOME/workspace add -A ; git -C $HOME/workspace commit --amend -m "Batch 19G VN HF2: Independent pattern IMF — all pattern global survivors go through pattern IMF regardless of quant results" 2>/dev/null ; git -C $HOME/workspace commit -m "Batch 19G VN HF2: Independent pattern IMF — all pattern global survivors go through pattern IMF regardless of quant results" 2>/dev/null ; git -C $HOME/workspace push origin dawntrader-v4
```
