# Batch 47 Follow-Up Hotfixes (f15) — Change List

> **Date**: 2026-04-03
> **Commits**: `490a018c`, `6d6e5f31`, `ea262243`, `d198a26c`
> **Context**: Hotfixes from Kyle review of Batches 43-47

## Files Modified

### 1. `ecosystem.config.cjs` (490a018c)
- max_memory_restart: '1G' → '2G' (Kyle directive)

### 2. `server/utils/export-csv.ts` (6d6e5f31)
- pool field: changed from `sourcePool || pool` to `pool` only (Ideal/Rotational)
- sourcePool: added as separate field in return type and response

### 3. `client/src/pages/machine-learning.tsx` (6d6e5f31)
- Pool header: "Pool" → "Pool (I/R)" in both open+closed tables
- Source header: "Source" → "Source Pool" in both tables

### 4. `server/routes.ts` (6d6e5f31)
- JWT access token expiresIn: '12h' → '7d'

### 5. `server/services/vts-runner.ts` (ea262243)
- Added `lastSetupHash` Map and `computeSetupHash()` function
- Added setup-hash check after strategy signal computation
- Records hash on trade open, blocks if identical to last closed trade

### 6. `server/services/fx5-scanner.ts` (d198a26c)
- Disabled code-driven regime overrides for pattern DI thresholds
- DB values (screener_filters table) are now sole authority
- Original Batch 19C code retained as comment
