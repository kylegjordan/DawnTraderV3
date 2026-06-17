# P19-B6.5c — Step-4 Change List (Langston code review)

> **Commit:** `52adcdf6f` on `migration/aws-supabase` (LOCAL, NOT pushed — awaiting your APPROVE + the B6.5d push-sequencing). **Bench:** tsc-baseline OK (no regressions above baseline); 20 targeted tests green (14 new resolver + 6 byte-identity incl. 2 updated); full suite **1904 passed**, the 9 failing files are the DB-integration set failing only on an absent Docker test-db (CI's Postgres covers them).
> **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the mount.** Load-bearing hunks embedded below; for anything else use `ssh staging 'cd /home/deploy/dawntrader && git show 52adcdf6f -- <file>'` after push.
> Implements your Step-1 rulings: D1 (DROP IF EXISTS + DB-dep check), D2 (orchestrator-side resolve; recognizer stops asserting a strategy), D3 (exact-match-or-drop as an additive sibling, observable counter, selectContextAwareStrategy untouched), D4 (site-1 canonicalize, site-2 REMOVE).

---

## F1 — migration: drop the drifted `cwqi` column (D1)

`drizzle/migrations/2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql`:
```sql
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS cwqi;
```
`...-rollback.sql` (nullable re-add — documented asymmetry; original NOT-NULL-no-default was the bug):
```sql
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS cwqi numeric;
CREATE INDEX IF NOT EXISTS rtb_signals_cwqi_idx ON rtb_signals (cwqi);
```
**DB-dep check (live staging):** 0 views / 0 constraints / 0 triggers / 0 generated-or-default refs; only dependent object = index `rtb_signals_cwqi_idx` (auto-dropped with the column); table had 0 rows. Registered in MANIFEST (forward); both files `git add -f` (gitignored `*.sql`, matching the b6-5a precedent). DELETED_COMPONENTS_LOG entry added.

## F2 — NEW exact-match resolver + observable counter (D3) — `server/config/canonical-regime-strategy-map.ts`

Strictly additive; `selectContextAwareStrategy` UNCHANGED (shared with VTS/xStock).
```ts
const patternNoMatchDrops = new Map<string, number>();
function recordPatternNoMatchDrop(canonicalPattern, regime, assetClass) {
  const key = `${canonicalPattern ?? 'null'}|${regime}|${assetClass}`;
  patternNoMatchDrops.set(key, (patternNoMatchDrops.get(key) ?? 0) + 1);
}
export function getPatternNoMatchDropStats(): Record<string, number> { return Object.fromEntries(patternNoMatchDrops); }
export function resetPatternNoMatchDropStats(): void { patternNoMatchDrops.clear(); }

export function resolvePatternConsumingStrategy(regime, detectedPattern, assetClass)
  : { strategy: string; signalType: CanonicalSignalType; patternType: CanonicalPatternType } | null {
  const canonicalPattern = normalizePatternToCanonical(detectedPattern);
  if (!canonicalPattern) return null;                  // unrecognized → null, UNcounted
  const classTree = CANONICAL_REGIME_STRATEGY_MAP[assetClass as AssetClassKey];
  const mapping = classTree?.[regime];
  if (!mapping || mapping.strategies.length === 0) { recordPatternNoMatchDrop(canonicalPattern, regime, assetClass); return null; }
  const match = mapping.strategies.find(s =>
    (s.signalType === 'HYBRID' || s.signalType === 'PATTERN') && s.patternType === canonicalPattern);
  if (!match) { recordPatternNoMatchDrop(canonicalPattern, regime, assetClass); return null; }   // exact-match-or-DROP
  return { strategy: match.strategyKey, signalType: match.signalType, patternType: match.patternType };
}
```

## F3 — recognizer stops asserting a strategy (D2) — `server/services/pattern-recognizer.ts`

`patternToTradeSignal` return type loses `strategy: string;`, and the body loses:
```ts
-    strategy: `pattern_${pattern.pattern.toLowerCase()}`,   // ← the invalid pattern_* origin, REMOVED
```
Now returns geometry/confidence/metadata only. (Directive-10.2-LOCKED recognizer stays free of strategy taxonomy.)

## F4 — orchestrator site-1 (pattern pool) CANONICALIZE (D2/D3/D4) — `server/services/signal-orchestrator.ts`

```ts
for (const patternSig of buyPatterns) {
  const atr = context.indicators?.atr ?? (currentPrice * 0.02);
  // resolve the consuming canonical strategy for THIS regime, exact-match-or-drop:
  const patternRegime = normalizeRegime((context as any).regime?.regime ?? '');
  const consuming = resolvePatternConsumingStrategy(patternRegime, patternSig.pattern, 'crypto_spot');
  if (!consuming) { continue; }                         // no consumer in this regime → DROP (counted)
  const tradeSignal = getPatternRecognizer().patternToTradeSignal(patternSig, currentPrice, atr, 'crypto_spot');
  const rawSignal: StrategySignal = {
    symbol,
    strategy: consuming.strategy as StrategySignal['strategy'],   // verified-canonical (was the pattern_* bridge)
    entryPrice: tradeSignal.entryPrice ?? currentPrice,
    stopPrice:  tradeSignal.stopPrice  ?? currentPrice * 0.97,
    targetPrice:tradeSignal.targetPrice?? currentPrice * 1.03,
    confidence: tradeSignal.confidence ?? patternSig.strength,
    metadata: { signalType: 'PATTERN', sourcePool: 'pattern', assetClass: DEFAULT_ASSET_CLASS,
                patternType: patternSig.pattern, patternStrength: patternSig.strength },
  };
  const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, consuming.strategy as StrategyType, sizingContext);
  ...
```
(The old P19-B3b `(tradeSignal.strategy || patternSig.pattern) as StrategySignal['strategy']` bridge is gone; sizing now keys on the resolved canonical strategy, not the fabricated label.)

## F5 — orchestrator site-2 (evaluateMarket loop) REMOVED (D4) — `server/services/signal-orchestrator.ts`

The whole `// Convert pattern signals to trade signals and add to queue` `for (const patternSig of patternSignals)` block (~35 lines) is deleted, replaced by a removal note. **Coverage proof:** the `activeStrategies` dispatch directly above it (lines ~1689-2040) already evaluates every pattern-consuming strategy via `detect*()` + `buildPatternInputForStrategy` (`activeStrategies.has('morning_star'|'inside_bar_reversal'|'support_bounce'|'pivot_shift'|'reverse_impulse'|'defensive_hedge'|'adaptive_flow'|'volatility_edge')` at lines 1934-1999). The removed loop also sized under hardcoded `'breakout'` (incoherent). Per your D4: canonicalizing a duplicate emitter would double-count; REMOVE is correct.

**RTB dedup confirm (your crux):** `upsertRtbSignal` on-conflict target = `(mode, symbol, strategy)` (storage.ts:4020). A pair in both pools resolving to the same canonical strategy via site-1 (pattern path) and the dispatch (quant path) collapses to one row — no double-count.

## F6 — import — `server/services/signal-orchestrator.ts`
Added `normalizeRegime, resolvePatternConsumingStrategy` to the existing `canonical-regime-strategy-map.js` import.

## F7 — tests
- `b79-0n-pattern-detect-byte-identity.test.ts`: the two `expect(tradeSignal.strategy).toBe('pattern_*')` assertions → `expect((tradeSignal as any).strategy).toBeUndefined()` (geometry preserved, strategy field gone). **6 green.**
- NEW `p19-b6-5c-pattern-canonical-resolve.test.ts` (**14 green**): regime-dependent exact matches (PINBAR→reverse_impulse [HVU] / support_bounce [RBS]; MORNING_STAR→morning_star [TFS]; INSIDE_BAR→inside_bar_reversal; ENGULFING→defensive_hedge; ABCD→volatility_edge [IE] and explicitly **≠ abcd_long**; THREE_SOLDIERS→morning_star; DOJI→adaptive_flow); no-match DROP + counter (PINBAR in TFS → null + counted; ABCD in RBS → null — the conflation guard); counter keyed by (pattern,regime,class); unrecognized/null → null UNcounted; **selectContextAwareStrategy fallback contract UNCHANGED** (still returns a non-null hybrid_fallback where the exact resolver drops).

## Gate-10 plan (your scope-gap adds)
On APPROVE → push (sequenced after Claude Old's B6.5d) → CI all-4-green → deploy → re-run the crypto dry-run: confirm signals now reach RTB, watch ≥1 FULL closed lifecycle, and verify the CLOSED trade's **`paper_sim_trades.strategy_name` is a canonical name end-to-end** (your D2-flows-all-the-way proof) + surface the `getPatternNoMatchDropStats()` drop rates in the dry-run telemetry. Then revert. Governance (both B6.5b + B6.5c): System Manual + SIM CONTENT (pattern→strategy routing contract, cwqi schema reconciliation, 17→19 strategy-count fix) + per-batch state docs.

---
*Step-4 dispatch. On APPROVE → push + CI + deploy + gate-10 dry-run. Files: 3 source + 2 tests + migration(+rollback) + MANIFEST + DELETED_COMPONENTS_LOG.*
