# Batch 19G VN HF2B — Active Trading Pattern Pool Dual-Pass Fix

## Problem
In the active trading path (signal-orchestrator.ts), pairs that survive BOTH quant and pattern filter paths only get processed through the quant loop. The pattern loop skips them with `if (fx5SymbolSet.has(symbol)) continue`. This means these pairs never get pattern detection evaluation in active trading mode.

The VTS was already fixed to process pairs through both paths. This fix applies the same logic to active trading.

## Fix
Removed the `fx5SymbolSet.has(symbol) continue` skip on line 846 of signal-orchestrator.ts. Now pairs that survive both paths get:
- Loop 1 (quant): Regime-driven strategy selection, all enabled strategies
- Loop 2 (pattern): Pattern detection, PATTERN + HYBRID strategies only

Both loops can generate independent signals for the same pair.

## File Changed
- `server/services/signal-orchestrator.ts` — line 846: removed quant-pool skip in pattern loop

## Push Command
```
git -C $HOME/workspace add -A ; git -C $HOME/workspace commit --amend -m "Batch 19G VN HF2B: Active trading pattern pool dual-pass — pairs in both pools now evaluated by both paths" 2>/dev/null ; git -C $HOME/workspace commit -m "Batch 19G VN HF2B: Active trading pattern pool dual-pass — pairs in both pools now evaluated by both paths" 2>/dev/null ; git -C $HOME/workspace push origin dawntrader-v4
```
