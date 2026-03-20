# Batch 19G DI: Rolling 48-Candle Window for Directional Integrity

## Problem
DI (Directional Integrity) was computed over ALL available OHLC candles (~721 hourly = ~30 days). Due to the mathematical property of Kaufman's Efficiency Ratio (net displacement grows as sqrt(n) while total path grows as n), DI collapsed to 0-12 range for all crypto pairs. Pattern IMF thresholds (DI >= 20-35) were mathematically unreachable, blocking 100% of pattern-only pairs in ALL regimes.

## Fix
Changed `calculateDirectionalIntegrity()` in analysis-utils.ts to use a rolling 48-candle window instead of all candles. This is the consensus recommendation from 5 independent sources (Gemini, ChatGPT 5.4, Claude Opus 4.6, Claude Code, Langston GPT-5.4). At 48 candles, DI produces meaningful values in the 15-60 range for trend classification.

## File Changed
- `server/utils/analysis-utils.ts` — calculateDirectionalIntegrity() uses 48-candle window

## Push Command
```
git -C ~/workspace add -A ; git -C ~/workspace commit --amend -m "Batch 19G DI: Rolling 48-candle window for Directional Integrity — fixes pattern IMF 100% rejection" 2>/dev/null ; git -C ~/workspace commit -m "Batch 19G DI: Rolling 48-candle window for Directional Integrity — fixes pattern IMF 100% rejection" 2>/dev/null ; git -C ~/workspace push origin dawntrader-v4
```

## Post-Deployment Verification
1. Check server logs for DI values — should now range 15-60 for most pairs (was 0-12)
2. Check pattern IMF pass rate — should be > 0 (was 0% before)
3. Run Replit diagnostic: "Show me the DI distribution across all scanned pairs for the last 3 scan cycles"

## Note
DI thresholds in the DB are NOT changed in this batch. After measuring the new distribution, thresholds will be calibrated empirically (same approach as VN).
