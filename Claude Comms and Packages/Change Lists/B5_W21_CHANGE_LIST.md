# B.5 W2.1 — Hold-time MS unification — CHANGE LIST (Step-4 code review)

**For:** Langston Step-4 code review (BEFORE push). **2026-06-06.** Active trading OFF. SHARED correctness fix (crypto + xStock), PRESERVES all current live behavior.

**INFRASTRUCTURE NOTE: do NOT cd /mnt/gdrive or run git on the gdrive mount. Full diff embedded below. For any repo/DB check use `ssh staging`.** Uncommitted working-tree changes in the Google Drive folder; I push only after your ACK.

## Verification (already green)
- **CI tsc-baseline gate** (`node scripts/check-tsc-baseline.mjs`): **PASS** — current 493 vs baseline 494, **zero new (file,code) pairs**. (The one delta is an unrelated -1 on `feed-integrity-auto-check.ts` already on HEAD.)
- **Unit tests:** 15/15 pass (`b5-w21-max-holding-ms.test.ts` 12 + `b79-0n-strategy-se-key-factory.test.ts` 3). Runtime log confirms `maxHold=86400000 ms`.
- Staging current values preserved (queried 2026-06-06): vwap_pullback `max_holding_period_bars_default=24` (24 bars@60m=24h→86400000ms); breakout `max_holding_hours=12`→43200000ms. Only those 2 rows exist.

## The defect (recap)
Hold-time was in 3 units: vwap_pullback bar-count (24), breakout hours (12), paper enforcer read the bar-count 24 as 24 HOURS, historic backtest hardcoded a 24-BAR loop. At 60m, 24 bars≈24h so paths coincided; at 15m the historic window is 6h while paper holds 24h = 4× sim-vs-live split. Fix: unify on explicit **milliseconds**, unit-explicit key `max_holding_ms`, metadata field `maxHoldingMs`.

## Files (9 code + 2 migration + 2 tests)

### 1. NEW shared stamp + DEFAULT (strategy-engine.ts) — the "one shared component" both paths call
```ts
export const DEFAULT_MAX_HOLDING_MS = 24 * 60 * 60 * 1000; // 86_400_000
export function stampMaxHoldingMs(signal: StrategySignal | null, assetClass: AssetClass): StrategySignal | null {
  if (!signal) return signal;
  if (!signal.metadata || typeof signal.metadata !== 'object') signal.metadata = {};
  if (typeof signal.metadata.maxHoldingMs === 'number' && isFinite(signal.metadata.maxHoldingMs)) return signal; // already set
  let resolved: number | undefined;
  try { resolved = getCachedConstant<number>(`strategy.${signal.strategy}`, 'max_holding_ms',
        { exchange: '*', assetClass, strategy: signal.strategy, regime: '*' }); } catch { resolved = undefined; }
  signal.metadata.maxHoldingMs = (typeof resolved === 'number' && isFinite(resolved)) ? resolved : DEFAULT_MAX_HOLDING_MS;
  return signal;
}
```
**INVARIANT (verified):** forward-prep only. VTS enforces holds via the 7-day `MAX_HOLD_MS` valve in tec-evaluator, NOT via metadata.maxHoldingMs. A full grep of vts-runner + tec-evaluator found NO code reader of the hold metadata (only a doc comment). The sole consumer is the dormant active-paper enforcer (active trading OFF). So stamping changes no live behavior.

### 2. vwap_pullback + breakout writers (strategy-engine.ts) — resolve ms, preserve the legacy override intent
```ts
// vwap_pullback (was: maxHoldingPeriod = settings.vwapMaxHoldingPeriod || c['max_holding_period_bars_default'])
const maxHoldingMs = settings.vwapMaxHoldingPeriod ? settings.vwapMaxHoldingPeriod * 60 * 60 * 1000  // legacy override = bar-count(60m era) → ms
                                                   : (c['max_holding_ms'] ?? DEFAULT_MAX_HOLDING_MS);
// ...metadata: { ..., maxHoldingMs }   (was maxHoldingPeriod)

// breakout (was: maxHoldingHours = params.maxHoldingHours || c['max_holding_hours'])
const maxHoldingMs = params.maxHoldingHours ? params.maxHoldingHours * 60 * 60 * 1000  // legacy override = hours → ms
                                            : (c['max_holding_ms'] ?? DEFAULT_MAX_HOLDING_MS);
// ...metadata: { ..., maxHoldingMs }   (was maxHoldingHours)
```

### 3. Central stamp call sites (both paths call the ONE helper)
```ts
// vts-runner.ts callStrategyDetect — thin wrapper stamps, delegates to callStrategyDetectRaw (the original switch)
return stampMaxHoldingMs(callStrategyDetectRaw(strategy, indicators, ohlcData, patternInput, symbol, assetClass), assetClass);
// signal-orchestrator.ts buildSizedSignalForStrategy — after symbol normalize, before enforcer
stampMaxHoldingMs(rawSignal, resolveAssetClass(rawSignal.symbol, 'kraken'));
```

### 4. paper-execution-engine.ts — read ms directly (was parseFloat-as-hours)
```ts
const maxHoldingMs = (typeof metadata?.maxHoldingMs === 'number' && isFinite(metadata.maxHoldingMs)) ? metadata.maxHoldingMs : undefined;
if (maxHoldingMs !== undefined) {
  const elapsedMs = Date.now() - new Date(position.openedAt).getTime();
  if (elapsedMs >= maxHoldingMs) { /* type:'max_holding_period', reason shows hours for readability */ }
}
```

### 5. historic-signal-generator.ts — clock-anchored, barMs from candle spacing (was hardcoded 24-bar loop)
```ts
const DEFAULT_HOLD_MS = 24*60*60*1000;
const holdMs = (typeof signal.metadata?.maxHoldingMs === 'number' && isFinite(signal.metadata.maxHoldingMs)) ? signal.metadata.maxHoldingMs : DEFAULT_HOLD_MS;
let barMs = 60*60*1000;
if (triggerIndex+1 < candles.length) { const d = candles[triggerIndex+1].time - candles[triggerIndex].time; if (isFinite(d) && d>0) barMs = d*1000; }
const maxHoldingPeriod = Math.max(1, Math.ceil(holdMs / barMs)); // bar count for the loop
```

### 6. Migration `drizzle/migrations/2026-06-06-b5-w21-max-holding-ms.sql` (+ rollback)
- (a) INSERT `max_holding_ms` at the 2 existing wildcard keys (vwap_pullback 86400000, breakout 43200000) — preserves crypto + all `*`-fallthrough classes. ON CONFLICT DO NOTHING.
- (b) **NO xstock_spot seeds** (I removed the agent's 10 uniform-24h rows): condition-5 is satisfied by the stamp alone (falls through to `*` or DEFAULT), and uniform-24h would silently change breakout-xStock 12h→24h with no evidence → per-class holds DEFERRED to W2.2.
- (c) DELETE the 2 legacy keys. Idempotent; rollback restores originals.

### 7. Docs/tests: tec-evaluator.ts + routes.ts doc-strings updated; `b79-0n-strategy-se-key-factory.test.ts` mock `max_holding_period_bars_default:24`→`max_holding_ms:86400000`; NEW `b5-w21-max-holding-ms.test.ts` (12 tests: paper enforcer fires at 6h not before; historic bar-count correct at 15m & 60m spacing; stamp no-op vs fallback).
> Out-of-scope (justified): `strategy-validators.ts` (Zod) + `strategies-tab.tsx` keep `maxHoldingHours` — a SEPARATE per-user settings/UI layer, not the module_constants hold or the metadata enforcement path. No behavioral link.

## Asks
ACK the diff, or flag anything. Specific checks I'd value your eyes on: (a) the legacy-override unit conversions (vwap bar-count×3.6e6, breakout hours×3.6e6); (b) the stamp invariant (no VTS reader); (c) removing the xstock_spot seeds (pure preserve-behavior vs the uniformity you asked for in condition 5 — I argue the stamp+wildcard/DEFAULT satisfies "every signal carries maxHoldingMs" without un-evidenced per-class rows). After your ACK I push → CI → deploy + run migration → verify.
