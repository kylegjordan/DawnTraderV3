# Phase 8.8.3-H3: Multi-Currency Support for LPCP

## Overview

This phase enables Low-Priced Coin Protection (LPCP) to operate correctly on pairs quoted in EUR, GBP, USDT, JPY, CAD, CHF, etc., not only USD. All LPCP guardrails now operate on USD-normalized values, ensuring consistent protection regardless of the quote currency.

## Date Implemented

December 1, 2025

## Changes Made

### 1. New FX Conversion Service

**File:** `server/services/fx-conversion-service.ts`

A new service that provides:
- **30-second TTL cache** for FX rates
- **Symbol parsing** to extract base/quote currencies from various formats:
  - Slash format: `XRP/USD`, `ETH/GBP`
  - Concatenated: `ARBEUR`, `BTCUSDT`, `XRPUSD`
  - Kraken legacy: `XETHXXBT`, `XXRPZUSD`
- **USD conversion** via Kraken public API endpoint `/0/public/Ticker`

**Supported FX Pairs:**
- USDT/USD
- EUR/USD
- GBP/USD
- JPY/USD
- CAD/USD
- CHF/USD

### 2. LPCP Multi-Currency Integration

**File:** `server/services/risk-manager.ts`

Updated `checkLowPricedCoinProtection()` to:
1. Parse symbol to extract quote currency
2. Convert entry price to USD before threshold check
3. Convert stop price to USD for ATR calculations
4. Convert ATR value to USD if needed
5. All notional calculations now use USD values

### 3. Fail-Safe Behavior

If FX conversion fails:
- Trade is **blocked** with code `FX_CONVERSION_FAILED`
- Error logged with tag `[8.8.3-H3][FX_FAIL]`
- Ensures no trades execute with incorrect price comparisons

## Logging Tags

All logs use consistent tags:
- `[8.8.3-H3][FX]` - Normal FX operations
- `[8.8.3-H3][FX_FAIL]` - FX errors/failures

### Example Log Output

```
[8.8.3-H3][FX] Symbol parsed: ARB/EUR → base=ARB, quote=EUR
[8.8.3-H3][FX] Fetching FX rates from Kraken...
[8.8.3-H3][FX] FX rates fetched: {USD: 1, EUR: 1.09, ...}
[8.8.3-H3][FX] Converted prices: entry 0.40 EUR → $0.436000 USD, stop 0.38 EUR → $0.414200 USD
[8.8.3-H] LPCP active: priceUSD 0.436000 ≤ threshold 0.5
```

## Test Scenarios

| Symbol | Quote Currency | Price | USD Equivalent | LPCP Triggered? |
|--------|---------------|-------|----------------|-----------------|
| VINE/USD | USD | $0.35 | $0.35 | ✅ Yes |
| XRP/USDT | USDT | 0.40 USDT | $0.40 | ✅ Yes |
| ARB/EUR | EUR | €0.40 | ~$0.44 | ✅ Yes |
| BTC/JPY | JPY | ¥15,000,000 | ~$100,000 | ❌ No (price > threshold) |
| ETH/GBP | GBP | £2,500 | ~$3,175 | ❌ No (price > threshold) |

## Unchanged Components

The following remain unmodified:
- UI components (no changes required)
- Other guardrails (only LPCP uses FX)
- RTB (Ready-to-Buy) flow
- Active Filtered Pool
- Strategy engine
- Scanner logic
- Position sizing calculations (outside LPCP)

## API Endpoint Used

```
GET https://api.kraken.com/0/public/Ticker?pair=USDTUSD,EURUSD,GBPUSD,JPYUSD,CADUSD,CHFUSD
```

Response format:
```json
{
  "error": [],
  "result": {
    "EURZUSD": {
      "c": ["1.0900", "volume"],
      ...
    }
  }
}
```

## Cache Behavior

- **TTL:** 30 seconds
- **Refresh:** On next request after TTL expires
- **Concurrent requests:** Coalesced to single fetch
- **Failure handling:** Uses last cached value if available, otherwise blocks trade

## Architecture Diagram

```
TradeSignal → checkLowPricedCoinProtection()
                     │
                     ▼
              fxConversionService.parseSymbol()
                     │
                     ▼
              requiresConversion(quoteCurrency)?
                     │
            ┌────────┴────────┐
            ▼                 ▼
         No (USD)          Yes (EUR, GBP, etc.)
            │                 │
            │                 ▼
            │         convertToUSD(price, quote)
            │                 │
            │          ┌──────┴──────┐
            │          ▼             ▼
            │      Cached?      Fetch Kraken
            │          │             │
            │          └──────┬──────┘
            │                 ▼
            │           Apply FX rate
            │                 │
            └────────┬────────┘
                     ▼
              priceUSD ≤ threshold?
                     │
            ┌────────┴────────┐
            ▼                 ▼
           No               Yes
            │                 │
            ▼                 ▼
        APPROVED       Apply LPCP rules
                       (ATR floor, min notional)
```

## Verification

Tested with:
1. ✅ USD pair (VINE/USD) - behavior unchanged
2. ✅ USDT pair (XRP/USDT) - treated as USD
3. ✅ EUR pair (ARB/EUR) - price × EUR/USD rate applied
4. ✅ JPY pair (BTC/JPY) - correctly bypasses LPCP (high USD price)
5. ✅ Low-priced EUR pair - LPCP triggers correctly

## Files Modified

1. `server/services/fx-conversion-service.ts` (NEW)
2. `server/services/risk-manager.ts` (MODIFIED)
3. `docs/phase_8.8.3-H3_multi_currency_LPCP.md` (NEW - this file)

## Rollback Instructions

If issues arise:
1. Remove FX conversion import from `risk-manager.ts`
2. Revert `checkLowPricedCoinProtection()` to use `signal.entryPrice` directly
3. Delete `fx-conversion-service.ts` (optional)
