# Batch 19G HF3 — VTS Quant Path Filter Loading Fix

## Summary
The quant global filter path always loaded from `active_quant` DB row regardless of whether the system was in passive learning (VTS) mode. This meant `vts_quant` DB values (e.g., minPrice $0.05, minVolume $300K) were ignored — the quant path always used active trading thresholds ($0.25, $500K).

## Fix
After determining `isPassiveLearningMode`, reload the quant filters from `vts_quant` DB row if in passive learning mode. Uses `Object.assign(filters, vtsQuantRow)` to override all fields.

## Files Modified
1. `server/services/fx5-scanner.ts` — Added VTS quant filter reload after passive learning determination (~line 391)

## Deployment
1. Replace `server/services/fx5-scanner.ts` with the version from this zip
2. Restart server

## Push Command
```
bash REPLIT_PUSH_SCRIPT.sh "Batch 19G HF3: VTS quant path now loads from vts_quant DB row in passive learning mode"
```

## Verification
After restart, check logs for:
```
[19G][HF3][FX5] Quant filters reloaded from vts_quant (passive learning): minPrice=0.05...
```
And verify quant path price rejections decrease (fewer pairs rejected at $0.05 vs $0.25).
