# B79.0n.ORCHESTRATOR Step 2 — CC reply to Langston probes 7 + 8

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Resolving probes 7 (pattern-filter-profile shim consumers) + 8 (no-silent-fallback at sizePaperPositionForSignal) before Step 3 clearance.

---

## Probe 7 — pattern-filter-profile.ts shim transitive consumers

**Langston's citation needs correction.** You cited `server/services/fx5-scanner.ts:74` as having `import { PATTERN_POOL_THRESHOLDS, getPatternPoolThresholds } from '../config/pattern-filter-profile.js'`. Verified against staging code:

- **fx5-scanner.ts:74** is inside the `computeATRFromOHLC` function body (ATR-from-OHLC iteration loop, lines 70-82). NOT an import.
- **fx5-scanner.ts:105** explicitly states: `// B54 Fix 4: PATTERN_POOL_THRESHOLDS import removed — all filter thresholds from DB only`
- **Full-server grep for any consumer of `pattern-filter-profile`:** zero hits. Only mention is at `server/startup/b72-warmup.ts:46` as a COMMENT reference, not an import.

**Net finding:** the `pattern-filter-profile.ts` shim has ZERO live consumers across the codebase. The B54 Fix 4 cleanup removed the last one. The shim file itself is fully dead code (its own docstring says `@deprecated B78 — REMOVED in B81`).

**Disposition:** No deferral needed. RUNNING_ISSUES #73 (B78 re-export shim removal) is already tracking the file deletion for B81. No additional consumer surface for ORCHESTRATOR. The shim exists but has no live readers.

Want to double-check my work? `grep -rn "from .*pattern-filter-profile" server/` should return zero hits.

---

## Probe 8 — No-silent-fallback at sizePaperPositionForSignal call sites

**Both call sites confirmed** at the locations you cited (paper-execution-engine.ts:2529 + signal-orchestrator.ts:432). Both currently lack any `assetClass` argument (will be added in Chunk B).

**My pre-commit confirm:** at both new call sites, use `resolveAssetClass(signal.symbol, 'kraken')` deterministically. NOT `signal.metadata?.assetClass || 'crypto_spot'`. Rationale:

- `resolveAssetClass(symbol, 'kraken')` is deterministic by-symbol → never silently returns crypto_spot for an xstock symbol.
- Matches the pattern already used at signal-orchestrator.ts:1529 (capture-and-reuse `_pairAssetClass = resolveAssetClass(symbol, 'kraken')`).
- If the symbol is unparseable (B69 unregistered), `resolveAssetClass` THROWS — which is the right behavior (no silent fallback). Upstream caller catches or fails-fast.
- Cleaner than depending on `signal.metadata?.assetClass` which is upstream-supplied + susceptible to absence.

**Concrete pattern at both sites (Chunk B implementation):**

```typescript
// paper-execution-engine.ts:2529 area
const sizingResult = sizePaperPositionForSignal({
  // ... existing args ...
  assetClass: resolveAssetClass(signal.symbol, 'kraken'),  // NEW — deterministic, no fallback
});

// signal-orchestrator.ts:432 area
const sizingResult = sizePaperPositionForSignal({
  // ... existing args ...
  assetClass: resolveAssetClass(rawSignal.symbol, 'kraken'),  // NEW — same pattern
});
```

If you want me to prefer `metadata?.assetClass` and fall back to `resolveAssetClass(symbol, 'kraken')` as the second source (mirroring the orchestrator's other patterns), I can do that — it's still no-silent-default behavior (deterministic fallback to symbol-based resolution, not to crypto_spot literal). Let me know if you prefer the prefer-metadata-then-symbol form vs the symbol-only form. My lean: symbol-only is cleaner; metadata threading at the upstream sites is the right place to ensure metadata.assetClass is populated correctly (B79.0n.STORAGE already enforces SQEInput.assetClass REQUIRED via TypeScript).

---

## Asks

If both resolutions check out, ACK clean → Step 3 implementation. If you want adjustments on either (e.g., prefer the metadata-then-symbol resolution shape), reply with specifics.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. This reply at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_PREAUDIT_REPLY_v1.md`.
