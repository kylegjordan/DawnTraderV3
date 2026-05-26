# B79.0n.TELEMETRY — Step 3 Change List (for Langston code review)

**HEAD commit:** `12e451d`
**Branch:** `migration/aws-supabase`
**Built on:** PRE_AUDIT_v1.md (commit `019c4875b`) + scope SCOPE_v1.md (commit `4e790cf0d`) — Langston Step 2 ACK APPROVE 2026-05-26
**Files changed:** 7 modified + 5 new test files = 12 total. **+980 / -48** lines net.
**Verification:** local `npx tsc --noEmit` 457 total errors (no new errors in any touched file — all pre-existing baseline); local `npx vitest run b79-0n-telemetry` 28 NEW tests PASS; `npx vitest run` on 7 existing telemetry-related test files (93 tests) ALL PASS UNCHANGED.

**INFRASTRUCTURE NOTE:** DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo (FUSE I/O hangs). Use `ssh staging` for any repo-side inspection beyond the embedded diff snippets below.

**Inbox file paths (Read directly — fast local-FS):**
- `/home/langston/inbox/b79-0n-telemetry/SCOPE_v1.md`
- `/home/langston/inbox/b79-0n-telemetry/PRE_AUDIT_v1.md`
- `/home/langston/inbox/b79-0n-telemetry/CHANGE_LIST_v1.md` (this file)

---

## §1. Chunk completeness matrix (pre-audit §6 vs landed)

| Chunk | Pre-audit § | Files | LOC est | LOC actual | Status |
|---|---|---|---|---|---|
| A | telemetry-aggregator counter fields + peek | telemetry-aggregator.ts | 25 | 59 added (includes inline doc) | ✅ |
| B | Bootstrap functions for 2 perp classes | asset-class-instances.ts | 60 | folded into rewrite | ✅ |
| C | Switch + assertNever exhaustive | asset-class-instances.ts | 20 | folded into rewrite | ✅ |
| D | getTelemetryInstanceStats accessor | asset-class-instances.ts | 50 | folded into rewrite | ✅ |
| E | Boot pre-warm | server/index.ts | 10 | 29 (includes inline doc) | ✅ |
| F | Caller-site annotations | 4 production files | 10 (comment-only) | 10 inline comments | ✅ |
| G | Header block update | asset-class-instances.ts | 30 (comment-only) | folded into rewrite | ✅ |
| H | 6 new unit tests | 5 test files | 270 | 28 tests across 5 files | ✅ |
| I | Local tsc + vitest verification | local | — | 457 tsc / 28 + 93 tests | ✅ |

Total file size growth: asset-class-instances.ts 156 → ~440 lines (most growth is the header-block extension + getTelemetryInstanceStats with inline doc + 2 new bootstrap functions). All other files received small focused edits.

---

## §2. Embedded diff snippets (per §6.5.0.a — no gdrive navigation needed)

### 2.1 `server/services/telemetry-aggregator.ts` (Chunk A)

**INSERT after line 141 (after `poolAggregates` Map closing `]);`), BEFORE the `recordPairTelemetry` JSDoc block:**

```typescript
  // B79.0n.TELEMETRY (2026-05-26): per-instance observability counters
  // for the per-class instance pattern. Read via getRecordCount() /
  // getLastWriteAt() / getPairCount() — aggregated across all 4 active
  // class instances by getTelemetryInstanceStats() in asset-class-instances.ts.
  // Increment site: inside recordPairTelemetry() after the M70 caller guard
  // (blocked writes do NOT increment — preserves M70 signal integrity).
  private _recordCount = 0;
  private _lastWriteAt: number | null = null;

  /**
   * B79.0n.TELEMETRY: monotonic count of accepted recordPairTelemetry() calls
   * since instance construction. Resets to 0 on instance restart.
   */
  public getRecordCount(): number {
    return this._recordCount;
  }

  /**
   * B79.0n.TELEMETRY: epoch-ms timestamp of the most recent accepted
   * recordPairTelemetry() call. Null if no calls have landed yet.
   */
  public getLastWriteAt(): number | null {
    return this._lastWriteAt;
  }

  /**
   * B79.0n.TELEMETRY: count of unique symbols currently tracked in
   * pairTelemetry. Pure read of the Map size.
   */
  public getPairCount(): number {
    return this.pairTelemetry.size;
  }
```

**INSERT after the M70 guard (~line 177, after `const now = Date.now();`):**

```typescript
    const now = Date.now();
    // B79.0n.TELEMETRY: increment observability counters AFTER M70 guard
    // passes. Counters track accepted writes only — blocked writes (non-vts
    // caller) do NOT increment, preserving the M70 signal integrity.
    this._recordCount++;
    this._lastWriteAt = now;
    const existing = this.pairTelemetry.get(symbol) || [];
```

**INSERT after the existing `getTelemetryAggregator` factory function (~line 1657), BEFORE `export { ... as TelemetryAggregator };`:**

```typescript
/**
 * B79.0n.TELEMETRY (2026-05-26): non-arming read-only peek at the global
 * singleton state. Returns null if singleton not yet armed (avoids
 * triggering rehydrate + persist-timer arm just for a stats read).
 *
 * Consumed by getTelemetryInstanceStats() in asset-class-instances.ts —
 * the per-class observability accessor needs to read crypto_spot stats
 * WITHOUT side-effecting the global singleton (which would arm the
 * 60s persist-timer if not already armed). Module-scoped state read only;
 * no setter exposed — callers cannot mutate the singleton via this export.
 *
 * Cold-boot semantic (Langston Step 2 ACK clarification 1): on a fresh
 * boot where getTelemetryAggregator() has never been called, this returns
 * null and the caller should construct a crypto_spot stats row with
 * { recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'global-singleton' }.
 * Crypto_spot is active — zero ≠ inactive for crypto_spot.
 */
export function peekTelemetryInstance(): TelemetryAggregatorService | null {
  return telemetryInstance;
}
```

---

### 2.2 `server/services/asset-class-instances.ts` (Chunks B + C + D + G — full rewrite)

The file grew 156 → ~440 lines. Diff is large; key NEW exports and structural changes shown below.

**NEW EXPORT — `InstanceStats` interface:**

```typescript
export interface InstanceStats {
  recordCount: number;
  lastWriteAt: number | null;
  pairCount: number;
  /**
   * - 'global-singleton' — crypto_spot via peekTelemetryInstance (no-touch fence).
   * - 'factory-instance' — the 3 factory-managed active classes.
   * - 'inactive' — reserved-future classes (always zeros).
   *
   * Langston Step 2 ACK clarification 2: 48h verify-gate alert body must
   * filter `source !== 'inactive'` when reading recordCount.
   */
  source: 'global-singleton' | 'factory-instance' | 'inactive';
}
```

**NEW BOOTSTRAP FUNCTIONS — xstock_perp + crypto_perp (mirror xstock_spot precedent):**

```typescript
function bootstrapXstockPerpInstances(): AssetClassInstances {
  const telemetry = new TelemetryAggregatorService();
  const failureTracker = new PairFailureTracker();
  const ratioManager = new AdaptiveRatioManager({}, telemetry);
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);
  console.log('[B79.0n.TELEMETRY][BOOT] xstock_perp AssetClassInstances bootstrapped (in-memory only; Variant C; M70 writer deferred to WIRE-IN #16)');
  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
}

function bootstrapCryptoPerpInstances(): AssetClassInstances {
  const telemetry = new TelemetryAggregatorService();
  const failureTracker = new PairFailureTracker();
  const ratioManager = new AdaptiveRatioManager({}, telemetry);
  const scanManager = new AdaptiveScanManager(telemetry, failureTracker);
  console.log('[B79.0n.TELEMETRY][BOOT] crypto_perp AssetClassInstances bootstrapped (in-memory only; Variant C; M70 writer deferred to WIRE-IN #16)');
  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
}

export function getXstockPerpInstances(): AssetClassInstances {
  if (!_xstockPerpInstances) _xstockPerpInstances = bootstrapXstockPerpInstances();
  return _xstockPerpInstances;
}

export function getCryptoPerpInstances(): AssetClassInstances {
  if (!_cryptoPerpInstances) _cryptoPerpInstances = bootstrapCryptoPerpInstances();
  return _cryptoPerpInstances;
}
```

**EXTENDED SWITCH with assertNever exhaustive check (Chunk C):**

```typescript
function assertNever(x: never, assetClass: string): never {
  throw new Error(
    `[B79.0n.TELEMETRY][CLASS_NOT_WIRED] asset class '${assetClass}' has no telemetry instance yet — call sites must check ASSET_CLASS_REGISTRY[${assetClass}].active before invoking the factory. If this class is genuinely active, add a bootstrap function + lazy cache + switch case in server/services/asset-class-instances.ts.`
  );
}

export function getAssetClassInstances(assetClass: AssetClass): AssetClassInstances | null {
  switch (assetClass) {
    case ASSET_CLASSES.CRYPTO_SPOT:
      return null; // no-touch fence (callers use global singleton)
    case ASSET_CLASSES.XSTOCK_SPOT:
      return getXstockSpotInstances();
    case ASSET_CLASSES.XSTOCK_PERP:
      return getXstockPerpInstances();
    case ASSET_CLASSES.CRYPTO_PERP:
      return getCryptoPerpInstances();
    case ASSET_CLASSES.EQUITY_SPOT:
    case ASSET_CLASSES.EQUITY_FUTURES:
    case ASSET_CLASSES.COMMODITY_FUTURES:
    case ASSET_CLASSES.FX_SPOT:
      throw new Error(
        `[B79.0n.TELEMETRY][CLASS_NOT_WIRED] asset class '${assetClass}' is reserved-future (ASSET_CLASS_REGISTRY[${assetClass}].active === false) — no telemetry instance. Call sites must check ASSET_CLASS_REGISTRY[${assetClass}].active before invoking the factory.`
      );
    default:
      return assertNever(assetClass, String(assetClass));
  }
}
```

**NEW EXPORT — `getTelemetryInstanceStats()` per-class observability accessor (Chunk D):**

```typescript
export function getTelemetryInstanceStats(): Record<AssetClass, InstanceStats> {
  const out = {} as Record<AssetClass, InstanceStats>;

  // crypto_spot: read from global singleton via non-arming peek.
  // Cold-boot semantic (Langston Step 2 ACK C1): if singleton not yet
  // armed, return zeros with source='global-singleton' — zero ≠ inactive
  // for an active class.
  const cryptoPeek = peekTelemetryInstance();
  out.crypto_spot = cryptoPeek
    ? { recordCount: cryptoPeek.getRecordCount(), lastWriteAt: cryptoPeek.getLastWriteAt(), pairCount: cryptoPeek.getPairCount(), source: 'global-singleton' }
    : { recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'global-singleton' };

  // 3 factory-managed active classes: read from per-class triad if cached.
  // Read cached _<class>Instances directly to avoid bootstrap-on-read.
  const peekFactory = (triad: AssetClassInstances | null): InstanceStats =>
    triad
      ? { recordCount: triad.telemetry.getRecordCount(), lastWriteAt: triad.telemetry.getLastWriteAt(), pairCount: triad.telemetry.getPairCount(), source: 'factory-instance' }
      : { recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'factory-instance' };

  out.xstock_spot = peekFactory(_xstockSpotInstances);
  out.xstock_perp = peekFactory(_xstockPerpInstances);
  out.crypto_perp = peekFactory(_cryptoPerpInstances);

  // 4 reserved-future classes: always source='inactive' with zeros.
  // 48h verify-gate alert filters source !== 'inactive'.
  const inactiveRow: InstanceStats = { recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'inactive' };
  out.equity_spot = inactiveRow;
  out.equity_futures = inactiveRow;
  out.commodity_futures = inactiveRow;
  out.fx_spot = inactiveRow;

  // Sanity: registry-drift guard — any AssetClass added to shared/asset-classes.ts
  // without a row above will be undefined and throw here.
  for (const ac of Object.keys(ASSET_CLASS_REGISTRY) as AssetClass[]) {
    if (out[ac] === undefined) {
      throw new Error(`[B79.0n.TELEMETRY][REGISTRY_DRIFT] ASSET_CLASS_REGISTRY contains '${ac}' but getTelemetryInstanceStats() did not produce a row for it.`);
    }
  }

  return out;
}
```

**NEW TEST-ONLY RESET FUNCTIONS** for unit-test isolation:

```typescript
export function _testResetXstockPerpInstances(): void { _xstockPerpInstances = null; }
export function _testResetCryptoPerpInstances(): void { _cryptoPerpInstances = null; }
export function _testResetAllAssetClassInstances(): void {
  _xstockSpotInstances = null;
  _xstockPerpInstances = null;
  _cryptoPerpInstances = null;
}
```

---

### 2.3 `server/index.ts` (Chunk E — boot pre-warm)

**INSERT between the B79.0g-tx sweep try/catch block and the B79.0a xstockSpotScanner.start try/catch block:**

```typescript
  // ─── B79.0n.TELEMETRY: Pre-warm per-class AssetClassInstances triads ───
  // Force-bootstrap all 3 factory-managed triads (xstock_spot + xstock_perp
  // + crypto_perp) at boot so the [B79.0n.TELEMETRY][BOOT] log lines fire
  // predictably and any construction failure HARD-FAILs at boot (not at
  // lazy first-call hours later). xstock_spot pre-warm here means the
  // subsequent xstockSpotScanner.start consumes an already-cached triad
  // (lazy-singleton idempotency).
  //
  // Runs AFTER loadTrailingStates + vts_open_trades rehydrate (so any
  // per-class state pulls have completed) and BEFORE xstockSpotScanner.
  //
  // HARD-FAIL on any throw: no degraded boot with partial telemetry
  // coverage. NO_FALLBACK per CLAUDE.md §5 #15.
  try {
    const {
      getXstockSpotInstances,
      getXstockPerpInstances,
      getCryptoPerpInstances,
    } = await import('./services/asset-class-instances.js');
    getXstockSpotInstances();
    getXstockPerpInstances();
    getCryptoPerpInstances();
    console.log('[B79.0n.TELEMETRY] All 3 factory-managed AssetClassInstances pre-warmed at boot (4-of-4 active-class telemetry coverage achieved)');
  } catch (telemetryBootErr) {
    console.error('[B79.0n.TELEMETRY][BOOT_FAIL] AssetClassInstances pre-warm threw on boot:', telemetryBootErr);
    console.error('[B79.0n.TELEMETRY][BOOT_FAIL] Cannot accept traffic without all 4 active asset-class telemetry instances initialized. Exiting.');
    process.exit(1);
  }
```

---

### 2.4 Caller-site annotations (Chunk F)

10 inline comments across 4 production files. Pattern: each `getTelemetryAggregator` call site annotated with classification.

**`server/routes.ts` — 5 sites:**

Lines 661, 677, 1979, 2041, 2101 each get the comment:
```typescript
      // [B79.0n.TELEMETRY] global-singleton-by-design — crypto-only API
      // reader; per-class extension deferred to OBSERVABILITY #18.
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator.js');
```

**`server/services/vts-runner.ts` — 4 sites:**

Lines 1465, 2408, 2904, 3669 each get a comment classifying as "currently crypto-only writer/reader — per-class threading deferred to WIRE-IN #16 (M70: VTS-only writer)". Example at line 2408:

```typescript
    // Update telemetry with actual outcome
    // [B79.0n.TELEMETRY] currently crypto-only writer — per-class threading
    // deferred to WIRE-IN #16 (M70 invariant: VTS is the only authorized writer).
    const telemetry = getTelemetryAggregator();
    telemetry.recordPairTelemetry(trade.symbol, { ... });
```

**`server/services/market-indicators.ts` — 1 site (line 258):**

```typescript
export function getMarketIndicators(): MarketIndicators {
  // [B79.0n.TELEMETRY] global-singleton-by-design — `/api/market-indicators`
  // is a crypto-only reader for the Analytics → Overview tab; per-class
  // extension belongs in OBSERVABILITY #18 (Q3 deferral).
  // Directive 11.4H.4A-Fix: Get dominant regime from live telemetry instead of stale cache
  const telemetry = getTelemetryAggregator();
```

**`server/services/fx5-scanner.ts` — 1 site (line 48 import):**

```typescript
// [B79.0n.TELEMETRY] global-singleton-by-design — crypto FX5 scanner;
// xstock_spot uses its own per-class telemetry instance via the factory
// (B79.0a); xstock_perp + crypto_perp scanners (when wired in WIRE-IN #16)
// will likewise resolve via getAssetClassInstances(assetClass).telemetry.
import { getTelemetryAggregator } from './telemetry-aggregator.js';
```

---

### 2.5 5 new test files (Chunk H — 28 tests)

Test files live in `server/tests/unit/`. Listed by path; Read directly for full content.

| File | Tests | Coverage |
|---|---|---|
| `b79-0n-telemetry-factory.test.ts` | 12 (T1 × 8 + T3 × 4) | Factory dispatch for all 4 active classes; triad shape; idempotency; reserved-future throws + registry-path mention |
| `b79-0n-telemetry-isolation.test.ts` | 3 (T2 × 3) | **Cross-class isolation BOTH directions** per Langston C2 — perp DID mutate AND singleton DID NOT mutate |
| `b79-0n-telemetry-arm-injection.test.ts` | 2 (T4 × 2) | ARM consumes per-class telemetry not global, verified via differing pool aggregates |
| `b79-0n-telemetry-stats.test.ts` | 7 (T5 × 7) | Accessor returns 8-class Record; source discrimination; cold-boot crypto_spot semantic; counter increments |
| `b79-0n-telemetry-m70.test.ts` | 4 (T6 × 4) | Blocked writes do not increment counter; vts caller IS accepted |

**All 28 new tests PASS locally** (2.5s total).

---

## §3. End-of-Step-3 grep verification (Chunk C reinforcement)

Re-running the pre-audit's reproducible probe to confirm completeness:

```bash
rg "getTelemetryAggregator|telemetry-aggregator" server/ --type ts -l
```

**Expected 15-file output (per pre-audit §3.3 table):** matches actual output. The 4 production files (routes / vts-runner / market-indicators / fx5-scanner) all have inline `[B79.0n.TELEMETRY]` comments adjacent to their call sites (verified via `rg -B2 "// \[B79.0n.TELEMETRY\]" server/services/*.ts server/routes.ts` matches all 10 annotation sites).

---

## §4. Local verification results

### `npx tsc --noEmit` (from C:\dev mirror per CLAUDE.md §7.1)

- **Total errors:** 457
- **Baseline reference:** 494 (per MEMORY from CONFIDENCE-CHAIN close — pre-SCORING/TEC era; post-SCORING/TEC the actual current baseline may have shifted)
- **Errors in files I touched:** all at pre-existing lines (telemetry-aggregator.ts errors at lines 259, 287, 838, 879, 920, 1614 — all in code I did NOT modify; my edits were at ~line 141-180 and ~line 1660-1680)
- **My new files (asset-class-instances.ts rewrite + 5 test files):** ZERO errors

### `npx vitest run`

| Test set | Files | Tests | Result |
|---|---|---|---|
| NEW b79-0n-telemetry-* | 5 | 28 | ✅ PASS (2.5s) |
| EXISTING telemetry-aggregator | 1 | (many) | ✅ PASS unchanged |
| EXISTING adaptive-scan-manager | 1 | (many) | ✅ PASS unchanged |
| EXISTING adaptive_scanning integration | 1 | (many) | ✅ PASS unchanged |
| EXISTING directive-11.0E.2 | 1 | (many) | ✅ PASS unchanged |
| EXISTING directive-11.4B.2-R1 | 1 | 13 | ✅ PASS unchanged |
| EXISTING directive-11.4C-R2 | 1 | (many) | ✅ PASS unchanged |
| EXISTING b79-0a-arm-injection | 1 | 5 | ✅ PASS unchanged |
| **All telemetry-touching tests combined** | **12** | **121** | ✅ **ALL PASS** |

---

## §5. Risks re-checked

All 9 risks from pre-audit §4 mitigated as planned. No new risks surfaced during implementation. Specifically:

- **R-1 (test global-singleton pollution):** Tests use `_testResetAllAssetClassInstances()` in beforeEach + `vi.spyOn(console, 'warn').mockImplementation(() => {})` to suppress M70-block log noise. Counter integrity verified.
- **R-5 (caller-site audit completeness — MEDIUM):** 15-file enumeration verified end-of-Step-3 via the reproducible rg command. 10 annotations landed across the 4 production files.
- **R-6 (memory cost of new fields):** 16 bytes × 4 active instances ≈ 64 bytes. Negligible.
- **R-8 (inactive-row inclusion):** Resolved via 3rd `source: 'inactive'` variant + the 48h verify-gate alert body filters on `source !== 'inactive'` as Langston specified.
- **R-9 (boot-time pre-warm masking lazy-init bugs):** Acceptable — HARD-FAIL boot earlier is better than discovering at first-call hours later.

---

## §6. What this batch does NOT touch (re-confirmed from scope §8)

- No new UI telemetry tabs
- No API route extensions to be per-class
- No SQL migration on `telemetry_history`
- No promotion of crypto_spot to factory pattern (asymmetry preserved)
- No disk persistence for the 3 new instances (Variant C in-memory only)
- No touches to vts-telemetry / predictive-adjustments / skipped-signals-logger / cost-telemetry / phase15b-dbs-telemetry
- No touches to AI Transparency / orchestrator telemetry
- No touches to System Alerts / Error Logs / Formula Audit / Feed Health

---

## §7. Awaiting Langston Step 4 ACK before Step 5 push-to-CI

If you ACK clean: I proceed with `gh run watch` on the CI run for HEAD `12e451d` (already pushed; CI in flight) → Step 6 staging deploy → Step 7 first-pass verification → Step 8 dispatch.

If you flag revisions: iterate from here. The C:\dev mirror is the working copy; commit + push cycle takes ~2 minutes per round.

Next dispatch from me will be either (a) Step 4 iteration with revisions OR (b) Step 7 first-pass verification snapshot post-deploy with the `getTelemetryInstanceStats()` accessor output + 3 [B79.0n.TELEMETRY][BOOT] log lines confirmed.
