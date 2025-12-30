# Directive 8.8.9 — WebSocket Symbol Normalization & Ticker Parsing Patch

## Implementation Summary

**Target System:** Dawn Trader v3.1 Infrastructure  
**Primary File:** `server/services/kraken-websocket-adapter.ts`  
**Date:** 2025-12-30  
**Status:** IMPLEMENTED (Architect Approved - 3rd Iteration)

## Objective

Fix the "Silent Failure" issue by:
1. Parsing Kraken's array-formatted ticker messages
2. Translating Kraken's ISO-prefixed pair codes (e.g., XBT/USD) into internal symbols (BTC/USD)
3. Updating Sentinel channel-health timestamps on each tick to prevent false connection resets

## Root Cause Analysis

| Problem | Effect |
|---------|--------|
| Kraken sends ticker updates as arrays like `[42, data, "ticker", "XBT/USD"]` | Parser expected object messages |
| Kraken uses ISO symbols (XBT/USD, XETH/USD) | System expects normalized names (BTC/USD, ETH/USD) |
| Sentinel watches symbolStats.lastUpdate | Never refreshed → false "connection lost" resets |
| tickerData can be array or object | Parser only handled object form |
| warningLogged undefined in legacy entries | Sentinel issued false warnings |

## Changes Implemented (Final Version)

### 1. handleMessage() Refactored - ARRAY-FIRST Processing
- Process array ticker messages FIRST, before checking object events
- Explicit event whitelist: `['heartbeat', 'pong', 'subscriptionStatus', 'systemStatus', 'error', 'info']`
- Unrecognized events logged with `[8.8.9][WS] Unknown event type`
- Added `[8.8.9][WS] Sub OK/Error` logging

### 2. handleTickerUpdate() Enhanced - tickerData Normalization
- Normalizes rawTickerData to handle both object and array-batched forms:
  ```typescript
  const tickerData = Array.isArray(rawTickerData) ? rawTickerData[0] : rawTickerData;
  ```
- Reset `warningLogged = false` on each tick
- Added `[8.8.9][WS_TICK]` logging for validation

### 3. SymbolStats Interface Updated
- Added `warningLogged?: boolean` property with default `false`
- Enables Sentinel to track warning state per symbol

## Log Tags

| Tag | Purpose |
|-----|---------|
| `[8.8.9][WS_SUB]` | Subscription requests with symbol mapping |
| `[8.8.9][WS] Sub OK` | Successful subscription confirmations |
| `[8.8.9][WS] Sub Error` | Subscription failures |
| `[8.8.9][WS_TICK]` | Ticker data received |

## Verification Checklist

- [ ] `[8.8.9][WS_SUB]` + `[8.8.9][WS] Sub OK` logs for all open pairs
- [ ] `[8.8.9][WS_TICK]` entries appear regularly for each active pair
- [ ] Sentinel no longer prints reset warnings for active pairs
- [ ] Open Trades → Source = WS or WS (cached) (not REST)
- [ ] REST RateLimiter blocks ≈ 0 for active pairs

## Integration Notes

- Uses existing `kraken-symbol-resolver.ts` for symbol translation
- Integrates with Phase 8.8.5 Tiered Sentinel architecture
- No new watchdog loops added (Sentinel handles tier-based timeouts)
- Maintains backward compatibility with all previous directives
