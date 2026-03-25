# HF10 Scope — KrakenService Property Name Fix

## Summary
Fix a latent bug in signal-orchestrator.ts where `this.krakenService` is used but the property is declared as `this.kraken`.

## Bug Details
- **File**: `server/services/signal-orchestrator.ts`
- **Line**: 1036
- **Bug**: `this.krakenService` is passed to `cascadingScan()` but the class property is `this.kraken` (declared at line 179)
- **Impact**: `cascadingScan()` receives `undefined` instead of the KrakenService instance, causing the Multi-Timeframe Cascade (Directive 10.7) to fail silently when `TIMEFRAME_CONFIG.CASCADE.ENABLED` is true
- **Current status**: Latent — CASCADE is currently disabled, so this path is not executing. Will become active when Phase 14.5 enables pattern scanning.

## Fix
Single-line change:
```
Line 1036: this.krakenService -> this.kraken
```

## Files Changed
- `server/services/signal-orchestrator.ts` (1 line)

## Risk
- Minimal — only changes an unused code path (CASCADE is disabled)
- No test changes needed (existing tests don't cover CASCADE path)
- No other files reference `this.krakenService` in signal-orchestrator.ts

## Approved By
Kyle (pre-approved as part of the three-batch pipeline discussion, 2026-03-14)
