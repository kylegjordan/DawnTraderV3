# Directive 12.1.4: Remove Simulated Price Display (BUG-020)

> **Phase**: 12.1 — Critical Math & Security Fixes
> **Status**: COMPLETE
> **Date Issued**: 2026-02-23
> **Date Complete**: 2026-02-23
> **Batch**: 3 (combined with 12.1.3 + 12.1.5)
> **Commit**: `0ddc8db1`
> **Review Cycles**: 1

---

## Problem Statement

The v1 `active-trades.tsx` component displayed a hardcoded fake current price for every active trade:

```typescript
const currentPrice = parseFloat(trade.entryPrice) * 1.02; // Simulated current price
```

This meant every trade showed a fabricated +2% unrealized gain, regardless of actual market conditions. The entire P/L column — dollar amount, percentage, and R-multiple — was derived from this fake price. Users saw misleading green P/L numbers that had no connection to reality.

The v2 component (`active-trades-v2.tsx`) already fetches real prices via WebSocket + polling and was unaffected by this bug.

---

## Resolution

### What Changed

1. **Removed the simulated price calculation** — `entryPrice * 1.02` replaced with `entryPrice` (no fake markup)
2. **P/L values set to zero** — cannot calculate real P/L without live price data
3. **Current price display** — shows entry price with "(entry)" label instead of fake green number
4. **P/L column** — shows "—" with "Awaiting live price" instead of misleading fabricated gains

### Why Not Add Live Price Fetching?

The v2 component already handles live pricing correctly via WebSocket. Rather than duplicate that complexity into the v1 component, this fix makes the v1 component honest about what it doesn't know. The v2 component is the correct, production-ready implementation. The v1 component remains functional for viewing trade metadata (symbol, side, quantity, entry price, risk amount) without displaying incorrect P/L data.

---

## Impact Analysis

- **Blast Radius**: LOW — display-only change, no backend logic affected
- **Behavioral Change**: Active trades v1 shows entry price + "Awaiting live price" instead of fake +2% gain
- **Risk**: None — this was a pure display bug with zero trading logic implications
- **Tests**: 816 pass, 81 fail (unchanged baseline)

---

## Registry Items Resolved

| Item | Type | Resolution |
|------|------|------------|
| BUG-020 | Simulated current price in active trades | RESOLVED — fake price removed, honest display |
| ADD-5 | Kyle directive: remove simulated price display | RESOLVED — implemented |

---

## Rollback

```bash
git reset --hard 67dd76d1  # Reverts to SNAPSHOT-005 (pre-Batch 3)
```
