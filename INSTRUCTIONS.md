# Batch 19F HF2 — Volume Unit Mismatch Fix (CRITICAL)

## Root Cause
Kraken's `ticker.v[1]` returns 24h volume in BASE CURRENCY (coin units), not USD.
All filter thresholds (minVolume=$500K quant, $250K pattern) are in USD.
The code was comparing COINS directly against USD thresholds — incompatible units.

Example: BTC with 100 coins traded = $8.5M USD volume.
Old code: `100 < 500,000` → REJECTED (wrong — $8.5M should pass)
Fixed code: `100 * 85,000 = 8,500,000 > 500,000` → ACCEPTED (correct)

This bug affected BOTH the quant AND pattern global filter paths.

## Fix
Applied coin-to-USD conversion (Directive 8.8.4-C.13.D) in market-scanner.ts:
- Quant path (line ~599): `volume24h = volume24hCoins * currentPrice`
- Pattern path (line ~748): `volume24h = volume24hCoins * currentPrice`

Both survivor outputs now carry USD-denominated volume for downstream consumers.

## Files Modified (1)

### server/services/market-scanner.ts
- Line ~599: Added `volume24hCoins` intermediate + USD conversion for quant global filter
- Line ~748: Same conversion for pattern global filter second pass
- Comments reference Directive 8.8.4-C.13.D and Batch 19F HF2

## Commit Message
```
Batch 19F HF2: Fix volume unit mismatch — convert coins to USD before filter comparison
```

## Impact
- Quant filter: Pairs with high USD volume but low coin count (BTC, ETH) will now correctly pass
- Pattern filter: Same fix ensures accurate volume filtering
- All downstream volume values (active filter pool, FX5 scanner) now consistently receive USD
- Filter counts on Guardrails page should change (may see more or fewer survivors depending on market conditions)

## Push Command
```
cd /home/runner/DawnTraderV3 && git add -A && git commit -m "Batch 19F HF2: Fix volume unit mismatch — convert coins to USD before filter comparison" && git push origin dawntrader-v4
```
