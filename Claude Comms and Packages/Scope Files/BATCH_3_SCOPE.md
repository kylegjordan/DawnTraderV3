# Batch 3 Scope: Security Hardening + Simulated Price Fix (Directives 12.1.3 + 12.1.4)

> **Directives**: 12.1.3 (JWT Fallback Removal) + 12.1.4 (Remove Simulated Price Display)
> **Risks/Bugs**: RISK-049, RISK-050, RISK-051, BUG-020
> **Baseline Snapshot**: SNAPSHOT-005 (commit `67dd76d1`)
> **Batch Type**: Combined code change (zero file overlap between directives)

---

## Why These Two Together

- **Zero file overlap**: 12.1.3 touches `server/routes/*.ts` (backend auth). 12.1.4 touches `client/src/components/trading/active-trades.tsx` (frontend display). Completely independent code paths.
- **Both are mechanical, well-scoped fixes**: JWT is the same pattern repeated across files. BUG-020 is a single-line replacement with a known correct pattern already implemented in `active-trades-v2.tsx`.
- **Both are Pre-MCE priority**: Kyle confirmed timing for both.

---

## Directive 12.1.3: Security Hardening — JWT Fallback Removal + Auth Bypass Removal

### Problem

**RISK-049/050 (JWT Fallback)**: 12 files define `JWT_SECRET` with a hardcoded fallback string. If the `JWT_SECRET` environment variable is not set, authentication is trivially bypassable because the fallback secret is visible in source code.

**RISK-051 (Auth Bypass Headers)**: 3 route files allow any request with `x-internal-audit: true` or `x-validation-session: true` headers to skip JWT authentication entirely. No validation, no secret, no IP check — any client can send these headers.

### Files Affected (12 files)

**JWT Fallback Removal (12 files):**

| File | Current Fallback |
|------|-----------------|
| `server/routes/calibration.ts:24` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/paper_validation.ts:18` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/market.ts:22` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/maco.ts:27` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/m3b.ts:14` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/pricing.ts:17` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/rl.ts:28` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/vts.ts:78` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/vts-audit.ts:13` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/tlva.ts:16` | `'jwt-development-secret-do-not-use-in-production'` |
| `server/routes/regime-archive.ts:38` | `'your-secret-key'` (different!) |
| `server/routes.ts:121` | `'development_secret_change_in_production'` (main routes file) |

**NOT in scope (Walter legacy — will be deleted in Wave 3):**
- `server/services/walter-data-pipeline.ts:11` — `'your-secret-key'`
- `server/services/walter-health-monitor.ts:140` — `'development_secret_change_in_production'`

These are Walter files scheduled for deletion in Directive 12.2.3. Touching them now would be wasted work.

**Also NOT in scope:**
- `server/config/index.ts:9` — `JWT_SECRET: process.env.JWT_SECRET || 'development-temp-secret'`. This is the central config file. It may be consumed by other services. Needs separate investigation to understand its blast radius before modifying. Flagged for a follow-up.

**Auth Bypass Header Removal (3 files, already being touched for JWT):**

| File | Bypass | Line |
|------|--------|------|
| `server/routes/calibration.ts:31` | `x-internal-audit` AND `x-validation-session` |
| `server/routes/paper_validation.ts:25` | `x-internal-audit` |
| `server/routes/pricing.ts:24` | `x-internal-audit` |

`regime-archive.ts` is referenced in RISK-051 as having `x-validation-session` but the grep only found it in `calibration.ts`. Will verify during implementation and remove from regime-archive.ts if present.

### Change Pattern (JWT)

**Before** (in each file):
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';
```

**After**:
```typescript
// Directive 12.1.3: Fail-closed if JWT_SECRET not configured (RISK-049)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[12.1.3] FATAL: JWT_SECRET environment variable is not set. Server cannot start without authentication configured.');
}
```

For `routes.ts` (main file), the pattern is the same but the fallback string differs.

### Change Pattern (Auth Bypass)

**Before** (in calibration.ts, for example):
```typescript
if (req.headers['x-internal-audit'] === 'true' || req.headers['x-validation-session'] === 'true') {
  return next();
}
```

**After**: Lines removed entirely. No replacement — these endpoints will require standard JWT authentication like everything else.

### Risk Assessment

- **JWT removal**: Zero risk if `JWT_SECRET` env var is set (it is on Replit). The fail-hard throw ensures the server won't start silently with weak auth.
- **Auth bypass removal**: Zero risk for normal frontend usage (the frontend sends JWT tokens, never `x-internal-audit` headers). Only affects someone manually hitting endpoints with the bypass header — which is the security hole we're closing.

---

## Directive 12.1.4: Remove Simulated Price Display (BUG-020)

### Problem

In `client/src/components/trading/active-trades.tsx` line 30:
```typescript
const currentPrice = parseFloat(trade.entryPrice) * 1.02; // Simulated current price
```

The current price is hardcoded as entry price + 2%. Every active trade always shows a fake 2% profit. The P/L column is completely fabricated.

### File Affected

`client/src/components/trading/active-trades.tsx` — 1 file

### Correct Pattern (from active-trades-v2.tsx)

The v2 component already solves this correctly:
1. Maintains a `livePrices` state map: `Record<string, { price: number; timestamp: string }>`
2. Fetches live prices via `/api/paper/live-prices` (polling) or WebSocket
3. Merges live prices into trade data: `currentPrice: livePrice.price`
4. Falls back to entry price if no live price available (shows 0% P/L — honest, not fabricated)

### Change Approach

Rather than rewriting the v1 component from scratch, the fix should:
1. Add a `livePrices` query to fetch current prices from the backend (same endpoint v2 uses)
2. Pass a `currentPrice` prop to `TradeRow` (or look it up from the prices map)
3. Replace the fake `entryPrice * 1.02` with the real price (or entry price as fallback)
4. Ensure P/L calculations use the real price

This is a contained change in a single file. The correct implementation pattern is already proven in `active-trades-v2.tsx`.

### Risk Assessment

- If the price API returns no data for a symbol, fallback to entry price (0% P/L shown). This is honest — better than a fake 2%.
- No backend changes needed. The `/api/paper/live-prices` endpoint already exists and is used by v2.

---

## Also Resolving in Batch 3B Governance: 12.1.5 (RiskManager Cleanup)

**12.1.5 is already done.** Investigation confirmed:
- `server/services/risk-manager.ts` no longer exists (file deleted)
- All 12 import locations have been replaced with `// [9.0-FP] RiskManager removed` comments
- No active `import` or `require` for RiskManager anywhere in the codebase

This will be marked COMPLETE (no code change needed) in the Batch 3B governance update, noting it was already resolved during a prior phase. No code batch needed.

---

## File Overlap Matrix

| File | 12.1.3 | 12.1.4 |
|------|--------|--------|
| `server/routes/calibration.ts` | ✅ | — |
| `server/routes/paper_validation.ts` | ✅ | — |
| `server/routes/market.ts` | ✅ | — |
| `server/routes/maco.ts` | ✅ | — |
| `server/routes/m3b.ts` | ✅ | — |
| `server/routes/pricing.ts` | ✅ | — |
| `server/routes/rl.ts` | ✅ | — |
| `server/routes/vts.ts` | ✅ | — |
| `server/routes/vts-audit.ts` | ✅ | — |
| `server/routes/tlva.ts` | ✅ | — |
| `server/routes/regime-archive.ts` | ✅ | — |
| `server/routes.ts` | ✅ | — |
| `client/src/components/trading/active-trades.tsx` | — | ✅ |

**Zero overlap confirmed.**

---

## Constraints

- Do NOT modify Walter legacy files (`walter-data-pipeline.ts`, `walter-health-monitor.ts`) — scheduled for Wave 3 deletion
- Do NOT modify `server/config/index.ts` — blast radius needs separate investigation
- Do NOT modify `active-trades-v2.tsx` — it's correct, leave it alone
- Do NOT modify `computeTotalRoundTripCost()` or any other cost-model code
- The `throw new Error()` for missing JWT_SECRET must be clear enough that Replit/Kyle can immediately diagnose a startup failure

---

## Expected Deliverables

1. Modified files staged in `DT_Staged_Changes/BATCH_3/` with repo-relative paths
2. `INSTRUCTIONS.md` for Replit
3. `README.md` documenting all changes
4. Zip in `Claude Comms and Packages/Batch Zips/` named `BATCH_3-DIR_12.1.3+12.1.4_SECURITY_AND_PRICE_FIX.zip`

---

## Validation Criteria

- All JWT fallback strings removed from the 12 target files
- Auth bypass headers removed from calibration.ts, paper_validation.ts, pricing.ts
- `entryPrice * 1.02` removed from active-trades.tsx
- Live price fetching implemented in active-trades.tsx
- TypeScript compilation passes
- Existing test suite results unchanged (816+ pass, same pre-existing failures)
- Server starts successfully (requires `JWT_SECRET` env var to be set)

---

*This scope was prepared by Claude Code (System Cartographer). Kyle to review before implementation begins.*
