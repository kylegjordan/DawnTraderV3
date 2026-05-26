# B79.0n.TELEMETRY — Pre-Audit (v1)

**Sub-batch:** #10 of 18 in B79.0n umbrella v4
**Step:** 2 (Pre-Implementation Audit)
**Author:** Claude Code (CC)
**Date drafted:** 2026-05-26
**Status:** Step 2 draft, awaiting Langston ACK
**Built on:** SCOPE_v1.md (commit `4e790cf0d`) — Langston Step 1 ACK 2026-05-26 with all 5 questions AGREED + 2 clarifications (C1, C2) + 1 reinforcement (Chunk C grep pattern). This pre-audit explicitly addresses all 3.

---

## §1. Mandatory SIM consultation (CLAUDE.md §9 rule 1)

Per CLAUDE.md §2 Step 2: "Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every affected component. Trace UPSTREAM dependencies, DOWNSTREAM consumers, SHARED STATE, BACKGROUND EXECUTION, BLAST RADIUS."

### 1.1 Primary affected components

#### `server/services/asset-class-instances.ts` (per SIM "Recent additions (B79)" §1820-1831)

- **Upstream:** none today (factory; called by xstock scanner loop in B79.0a + future RTB/ARM/ASM consumers).
- **Downstream:** when invoked, instantiates `TelemetryAggregatorService` + `AdaptiveRatioManager` + `PairFailureTracker` + `AdaptiveScanManager`. Each is per-instance isolated.
- **Shared state:** `_xstockSpotInstances` module-scoped cached triad (lazy singleton). **This batch adds `_xstockPerpInstances` + `_cryptoPerpInstances` mirror caches.**
- **Background execution:** none Day 1 of B79 (dormant). B79.0a wired the live xstock scanner consumer. **This batch will pre-warm all 3 lazy-bootstrap factory functions at boot to ensure `[B79.0n.TELEMETRY][BOOT]` log lines fire predictably (vs deferred-to-first-call).**
- **Blast radius:** LOW. Crypto path UNTOUCHED (returns null, no-touch fence). xstock_spot callers explicitly opt-in via `getXstockSpotInstances()`. **This batch extends the same opt-in pattern to xstock_perp + crypto_perp.**
- **Safety hazard inherited from B79:** `TelemetryAggregatorService` has a module-scoped disk-persist path at `telemetry-aggregator.ts:1600-1602`. Per SCOPE Q1 (Langston AGREE Variant C), new instances run in-memory only — `new TelemetryAggregatorService()` direct construction (per `bootstrapXstockSpotInstances` line 84 precedent) bypasses the `getTelemetryAggregator()` factory which arms the persist timer.

#### `server/services/telemetry-aggregator.ts` (per SIM §7.6 + System Manual Ch 10)

- **Upstream:** VTS Runner (trade outcomes — exclusive writer per Directive 11.4C.1 / M70).
- **Downstream:** AdaptiveRatioManager (pool performance), FX5 scanning (pair ranking), `/api/market-indicators` (regime via `getDominantRegime()`), `/api/system/mapping-drift` (via `computeMappingDrift()`), `/api/diagnostics/ranked-pairs` etc.
- **Shared state:** `pairTelemetry: Map<string, PairTelemetry[]>` (per-symbol rolling window). `cascadeHistory: CascadeEfficiency[]`. `poolAggregates: Map<PoolType, PoolPerformanceAggregate>` (ideal + rotational, 2 entries — NOT keyed by asset class). `pairZScoreHistory: Map<string, {volZ[]; trendZ[]}>`. **Internal state is ENTIRELY class-agnostic** — confirmed by `assetClass`/`asset_class` grep returning ZERO matches in this file.
- **Background execution:** module-level `telemetryPersistTimer` (60s setInterval) armed ONLY by `getTelemetryAggregator()` global singleton path (line 1651-1653). Direct `new TelemetryAggregatorService()` construction does NOT arm a timer. ← **This is the structural property that makes Variant C safe: new instances in this batch are in-memory by construction.**
- **Blast radius:** **MEDIUM** (per SIM §7.6). Affects pair selection bias. **This batch does NOT modify any code inside this file** — only the factory + caller-site annotations + new tests.

#### `server/services/adaptive-ratio-manager.ts` (per SIM §1760-1766)

- **Upstream:** caller invokes `computeAdaptiveRatio()` (RTB + ASM).
- **Downstream:** TelemetryAggregatorService.getPoolPerformanceComparison() (line 103-104).
- **Shared state:** `this.telemetry: TelemetryAggregatorService | null` (constructor-injected per B79.0a back-compat). `this.config: RatioConfig`. `this.currentRatio + lastComparison` instance state.
- **Background execution:** none (synchronous getter, called by callers).
- **Blast radius:** **MEDIUM** (per SIM §1764) — affects pair selection bias on xstock path. Crypto path unchanged via `this.telemetry ?? getTelemetryAggregator()` fallback (line 103).
- **This batch:** no changes to this file. The new xstock_perp + crypto_perp factory cases construct ARM with injected telemetry exactly per the xstock_spot precedent (`new AdaptiveRatioManager({}, telemetry)` at line 99 of `asset-class-instances.ts`).

#### `server/services/adaptive-scan-manager.ts` (per SIM main entry; lines 22, 170, 390 from grep)

- **Upstream:** central clock tick subscription (per asset class).
- **Downstream:** TelemetryAggregatorService.getTopPairs() / getTopPairsWithPool() / getAvailableIdealPoolCount() etc.
- **Shared state:** `this.telemetry` + `this.failureTracker` (constructor-injected per B79.0a). `adaptiveScanManagerInstance` module-level singleton (line 390) is the crypto_spot bootstrap path.
- **Background execution:** scanner cycle execution.
- **Blast radius:** **MEDIUM** — affects scanner batch composition.
- **This batch:** no changes to this file. New factory cases construct ASM with injected telemetry + failure-tracker per xstock_spot precedent (line 103 of `asset-class-instances.ts`).

#### `shared/asset-classes.ts` (per SIM §9.13)

- **Registry:** `ASSET_CLASSES` const (8 entries: 4 active + 4 reserved-future).
- **Resolver:** `resolveAssetClass(symbol, exchange?)` + `safeResolveAssetClass()` wrapper.
- **Blast radius:** **MEDIUM** (determines schema field values across trade/archive tables).
- **This batch:** no changes to this file. New factory exhaustive-switch IMPORTS `ASSET_CLASSES` to use as the switch domain, ensuring `assertNever` exhaustiveness check fails-compile if a new active class is added to the registry without factory wiring.

### 1.2 SIM gap surfaced by this pre-audit

The current SIM `Recent additions (B79)` section (lines 1820-1831) documents the per-asset-class instance pattern as **"crypto_spot returns null; xstock_spot lazy-bootstraps a fresh in-memory triad"** and notes that *"Promote persistence in B79.x if Layer 3 evidence requires."* It does NOT document the in-flight gap that xstock_perp + crypto_perp THROW. **Step 10 of this batch updates SIM to reflect 4-of-4 active-class coverage + the explicit Variant C in-memory-only invariant + the `assertNever` exhaustive-switch enforcement pattern.**

---

## §2. PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)

No prior-stated numbers differ from this audit's findings. The umbrella v4 row #10 spec ("per-asset-class buckets") is reinterpreted as "per-asset-class instances" given the B79.0a precedent — explicitly tabled in SCOPE §1 with Langston AGREE.

---

## §3. Langston Step 1 ACK items addressed

### 3.1 Clarification C1 — `getTelemetryInstanceStats()` accessor + crypto_spot

**Langston ask:** OBJ-5 says "returns `Record<AssetClass, {...}>`" and §6 Step 7 says "4 active-class rows immediately after boot." But crypto_spot returns null from the factory. Specify whether (a) the accessor reads crypto_spot stats from the global singleton via a thin pull, or (b) crypto_spot is excluded and we return 3 rows. Don't leave ambiguous because the 48h verify-gate signal depends on consistent reads.

**Resolution: Variant (a) with explicit inline-documented path.** The accessor returns a `Record<AssetClass, InstanceStats>` with 4 active-class entries. For crypto_spot, the stats come from the global singleton via a guarded read. For the 3 factory-managed classes, the stats come from the respective triad's `.telemetry` instance. Skeleton:

```typescript
// asset-class-instances.ts (new export)
export interface InstanceStats {
  recordCount: number;
  lastWriteAt: number | null;
  pairCount: number;
  /** 'global-singleton' for crypto_spot; 'factory-instance' for the rest. */
  source: 'global-singleton' | 'factory-instance';
}

export function getTelemetryInstanceStats(): Record<AssetClass, InstanceStats> {
  // crypto_spot: read from global singleton via a thin pull (no-touch fence preserved).
  // We do NOT invoke getTelemetryAggregator() here — that would arm the persist timer
  // if the singleton hasn't been initialized yet. Instead, we read the
  // module-scoped `telemetryInstance` via the existing exported `peekTelemetryInstance`
  // helper (NEW in this batch; non-arming read-only peek).
  const cryptoSpotPeek = peekTelemetryInstance(); // null if singleton not yet armed
  // ...assemble Record for all 4 active classes.
}
```

To support the non-arming peek, this batch adds a new exported function in `telemetry-aggregator.ts`:

```typescript
// telemetry-aggregator.ts (new export)
/**
 * B79.0n.TELEMETRY: non-arming read-only peek at the global singleton state.
 * Returns null if singleton not yet armed (avoids triggering rehydrate + persist-timer arm).
 */
export function peekTelemetryInstance(): TelemetryAggregatorService | null {
  return telemetryInstance; // module-level state already declared at line 1595
}
```

This is the ONLY new export added to `telemetry-aggregator.ts` in this batch. ~5 LOC.

**Counter increment plumbing for `recordCount`:** the existing `recordPairTelemetry` method at line 149 of `telemetry-aggregator.ts` is the single write entry point. This batch adds a private instance-level counter field + increment-on-each-call:

```typescript
// telemetry-aggregator.ts (private field)
private _recordCount = 0;
private _lastWriteAt: number | null = null;

// Inside recordPairTelemetry, after the M70 caller guard passes:
this._recordCount++;
this._lastWriteAt = now;
```

Plus 2 new public methods:

```typescript
public getRecordCount(): number { return this._recordCount; }
public getLastWriteAt(): number | null { return this._lastWriteAt; }
public getPairCount(): number { return this.pairTelemetry.size; }
```

These are READ-ONLY observability methods (no side effects). They're added to `TelemetryAggregatorService` itself so that BOTH the global singleton AND the factory-managed instances expose the same surface — `getTelemetryInstanceStats()` reads them uniformly.

**Total new code in `telemetry-aggregator.ts`:** ~25 LOC across the 2 instance fields + 3 read methods + 1 module-level peek export + counter increment inside `recordPairTelemetry`. No behavioral change to existing logic.

### 3.2 Clarification C2 — T2 isolation test BOTH directions

**Langston ask:** Test T2 should assert BOTH (i) `xstock_perp.telemetry` write DOES mutate xstock_perp's internal Maps, AND (ii) crypto_spot global singleton's pool aggregates DO NOT mutate.

**Resolution:** T2 explicit spec:

```typescript
// b79-0n-telemetry-isolation.test.ts
test('cross-class isolation — write to xstock_perp does NOT bleed into crypto_spot', () => {
  const cryptoSingleton = getTelemetryAggregator(); // global path (arms persist timer in test; clean it up in afterEach)
  const cryptoCountBefore = cryptoSingleton.getRecordCount();
  const cryptoPoolBefore = cryptoSingleton.getPoolPerformanceComparison();

  const xstockPerpTriad = getAssetClassInstances('xstock_perp')!;
  xstockPerpTriad.telemetry.recordPairTelemetry('PF_BTCUSD', {
    finalScore: 0.75, success: true, pool: 'ideal', caller: 'vts',
  });

  // (i) xstock_perp instance DID record
  expect(xstockPerpTriad.telemetry.getRecordCount()).toBe(1);
  expect(xstockPerpTriad.telemetry.getPairCount()).toBe(1);
  expect(xstockPerpTriad.telemetry.getPoolPerformanceComparison().ideal.totalTrades).toBe(1);

  // (ii) crypto_spot global singleton DID NOT mutate
  expect(cryptoSingleton.getRecordCount()).toBe(cryptoCountBefore);
  const cryptoPoolAfter = cryptoSingleton.getPoolPerformanceComparison();
  expect(cryptoPoolAfter.ideal.totalTrades).toBe(cryptoPoolBefore.ideal.totalTrades);
  expect(cryptoPoolAfter.rotational.totalTrades).toBe(cryptoPoolBefore.rotational.totalTrades);
});
```

Both directions explicit. Test fails closed if a future refactor accidentally points the perp instance at the global singleton.

### 3.3 Chunk C reinforcement — exact rg pattern + 15-file enumeration

**Langston ask:** "Commit the grep pattern into the Step 2 plan explicitly. I want to see the exact `rg "getTelemetryAggregator|telemetry-aggregator"` (or equivalent) command in Step 2 with the expected 15-file output enumerated."

**Resolution:** The probe command:

```bash
rg "getTelemetryAggregator|telemetry-aggregator" server/ --type ts -l
```

**Expected output (15 files; verified by CC during pre-audit drafting):**

| # | File | Path | Annotation classification |
|---|---|---|---|
| 1 | `routes.ts` | `server/routes.ts` (5 call sites at 661, 677, 1975, 2037, 2097) | global-singleton-by-design — crypto-only API readers; per-class threading deferred to OBSERVABILITY #18 |
| 2 | `vts-runner.ts` | `server/services/vts-runner.ts` (4 call sites at 1465, 2408, 2904, 3669 + import at 55) | currently crypto-only writer — per-class threading deferred to WIRE-IN #16 (M70 invariant: VTS is the only authorized writer) |
| 3 | `market-indicators.ts` | `server/services/market-indicators.ts` (line 258 reads `getDominantRegime`) | global-singleton-by-design — crypto-only `/api/market-indicators` endpoint reader |
| 4 | `fx5-scanner.ts` | `server/services/fx5-scanner.ts` (line 48 import) | global-singleton-by-design — crypto FX5 scanner (xstock scanner already uses per-class via factory) |
| 5 | `adaptive-ratio-manager.ts` | `server/services/adaptive-ratio-manager.ts` (constructor injection at line 67-103) | already factory-resolved via constructor injection (B79.0a) — no annotation needed; existing inline comments already document the pattern |
| 6 | `adaptive-scan-manager.ts` | `server/services/adaptive-scan-manager.ts` (line 170 constructor injection + line 390 crypto bootstrap) | already factory-resolved via constructor injection; line 390 is the crypto-spot global bootstrap (intentional) |
| 7 | `asset-class-instances.ts` | `server/services/asset-class-instances.ts` (the factory itself — line 81 + 139 + comments) | factory implementation file — IS the factory, no annotation needed |
| 8 | `telemetry-aggregator.ts` | `server/services/telemetry-aggregator.ts` (line 1642 self-export) | factory export site — N/A annotation |
| 9 | `telemetry-aggregator.test.ts` | `server/tests/unit/telemetry-aggregator.test.ts` | test isolation via `new TelemetryAggregatorService()` — correct pattern; no annotation needed |
| 10 | `adaptive-scan-manager.test.ts` | `server/tests/unit/adaptive-scan-manager.test.ts` | test isolation; no annotation |
| 11 | `directive-11.0E.2.test.ts` | `server/tests/unit/directive-11.0E.2.test.ts` | test isolation; no annotation |
| 12 | `directive-11.4B.2-R1.test.ts` | `server/tests/unit/directive-11.4B.2-R1.test.ts` | test isolation; no annotation |
| 13 | `directive-11.4C-R2.test.ts` | `server/tests/unit/directive-11.4C-R2.test.ts` | test isolation; no annotation |
| 14 | `b79-0a-arm-injection.test.ts` | `server/tests/unit/b79-0a-arm-injection.test.ts` | test isolation (B79.0a regression lock); no annotation |
| 15 | `adaptive_scanning.test.ts` | `server/tests/integration/adaptive_scanning.test.ts` | integration test; no annotation |

**Total annotation work (Chunk C):** 4 production files (routes.ts + vts-runner.ts + market-indicators.ts + fx5-scanner.ts) get `// [B79.0n.TELEMETRY]` inline comments at each call site classifying the path. ~10 comments total. **Zero behavioral change.**

**Re-running the probe at end of Step 3 verifies completeness:** the same `rg` command should return the same 15 files, AND every production-file match line should now have a `// [B79.0n.TELEMETRY]` comment within 5 lines of context (verified by `rg -B5 -A5` follow-up).

---

## §4. Risk re-enumeration (per scope §5, expanded)

**R-1 (LOW) — Test pollution of global singleton.** `getTelemetryAggregator()` is a one-way arming function — once called in a test, the persist timer is armed for the duration of the test process. Mitigation: T2's `cryptoSingleton` test uses the existing test cleanup pattern (afterEach calls `clearInterval(telemetryPersistTimer)`). Verified by inspecting `b79-0a-arm-injection.test.ts:48` which already does this.

**R-2 (LOW) — Disk-persist hazard.** Resolved by Variant C structurally. The new factory cases use `new TelemetryAggregatorService()` direct construction (precedent: `asset-class-instances.ts:84`). The persist-timer arming is gated on entry through `getTelemetryAggregator()` only (lines 1651-1653). No new persist-timer instances are created.

**R-3 (LOW) — Factory exhaustive-switch.** `assertNever` enforces compile-time exhaustiveness. New active classes added to `ASSET_CLASSES` registry without factory wiring fail-compile here. Throw-at-runtime for reserved-future classes per Langston Q2 AGREE.

**R-4 (LOW) — Crypto_spot asymmetry cognitive load.** Mitigation: scope §3 Q5 AGREE keeps the asymmetry; this pre-audit Step 10 governance work adds a clarifying header block to `asset-class-instances.ts` (extending the existing block at lines 1-52) explicitly listing the 4 active classes + which path each uses + why crypto_spot is asymmetric.

**R-5 (MEDIUM) — Caller-site audit completeness.** Addressed by Chunk C reinforcement (§3.3 above). 15 files enumerated by `rg`. The grep command is idempotent + re-runnable for verification.

**R-6 (LOW — NEW) — `_recordCount` field memory.** Adding 2 new instance fields (`_recordCount`, `_lastWriteAt`) to `TelemetryAggregatorService` affects the global singleton. Memory cost is 16 bytes per instance × 4 active instances ≈ 64 bytes. Negligible.

**R-7 (LOW — NEW) — `peekTelemetryInstance()` exposes module state.** The non-arming peek exports the existing module-level `telemetryInstance` variable read-only. No setter exposed. Callers cannot mutate the singleton via this export. No safety regression.

**R-8 (LOW — NEW) — Stats accessor `Record<AssetClass, ...>` may be queried for reserved-future classes.** Per Q2 (throw on reserved-future call to `getAssetClassInstances`), the stats accessor only iterates the 4 active classes. Reserved-future classes return `{recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'inactive'}` from the stats accessor with a 4th sentinel `source` value, OR are excluded entirely. **CC recommends: include with `source: 'inactive'` sentinel** so the verify-gate signal (perp recordCount expected to be 0) can be read consistently regardless of which class is queried. Add `'inactive'` as a 4th variant of the `source` union. ~3 LOC.

**R-9 (LOW — NEW) — Boot-time pre-warm could mask later test bootstrap failures.** Pre-warming all 3 lazy factory functions at boot means a bootstrap exception fires at boot (HARD-FAIL) instead of at first-call (lazier surface). This is desirable (per Variant C, in-memory only — no DB I/O at bootstrap; the only failure mode is `new TelemetryAggregatorService()` throwing, which would itself indicate a more severe issue). HARD-FAIL boot if pre-warm throws.

---

## §5. Test plan (expanded from scope §4 with C1 + C2 spec)

| Test ID | What | File | LOC est |
|---|---|---|---|
| T1 | Factory returns null for crypto_spot, valid triads for the other 3 active classes. Verify triad shape: telemetry instance is fresh (`recordCount === 0`), ratioManager has injected telemetry, scanManager has injected telemetry + failureTracker. | `b79-0n-telemetry-factory.test.ts` | ~50 |
| T2 | Cross-class isolation BOTH directions per §3.2 above | `b79-0n-telemetry-isolation.test.ts` | ~50 |
| T3 | Reserved-future classes throw `[CLASS_NOT_WIRED]` with the `ASSET_CLASS_REGISTRY[X].active` registry-path mention in error message per Langston Q2 ACK | `b79-0n-telemetry-factory.test.ts` | ~30 |
| T4 | ARM injection: `getAssetClassInstances('xstock_perp').ratioManager` computes adaptive ratio reading from the per-class TelemetryAggregator (NOT the global singleton). Verify by writing telemetry to global, then writing different data to perp triad, then asserting `computeAdaptiveRatio` reflects perp data, not global. | `b79-0n-telemetry-arm-injection.test.ts` | ~60 |
| T5 | `getTelemetryInstanceStats()` accessor returns correct 4-class Record. Test (a) all 4 classes present, (b) crypto_spot reads from global singleton (`source: 'global-singleton'`), (c) other 3 read from factory instances (`source: 'factory-instance'`), (d) post-write counts increment correctly. | `b79-0n-telemetry-stats.test.ts` | ~50 |
| T6 | M70 invariant: `getAssetClassInstances('xstock_perp').telemetry.recordPairTelemetry(symbol, {caller: 'fx5'})` is rejected with `[11.4C.1][BLOCKED]` log. Counter does NOT increment when blocked. | `b79-0n-telemetry-m70.test.ts` | ~30 |

**Total new test LOC:** ~270 across 5 new test files. Existing 9 telemetry-aggregator-touching tests should pass UNCHANGED (no behavior changes to recordPairTelemetry / getPoolPerformanceComparison / etc.).

---

## §6. Sequencing — Step 3 chunk plan (refined from scope §7)

| Chunk | What | Files | LOC | Risk |
|---|---|---|---|---|
| A | Add `_recordCount`, `_lastWriteAt` instance fields + 3 read methods (`getRecordCount`, `getLastWriteAt`, `getPairCount`) to `TelemetryAggregatorService`. Add `peekTelemetryInstance()` module-level export. Increment counter inside `recordPairTelemetry` after M70 guard passes. | `server/services/telemetry-aggregator.ts` | ~25 | LOW |
| B | Add `bootstrapXstockPerpInstances` + `bootstrapCryptoPerpInstances` lazy-bootstrap functions in `asset-class-instances.ts`. Each mirrors `bootstrapXstockSpotInstances` shape: new TelemetryAggregatorService() (NOT singleton path) → new PairFailureTracker → new AdaptiveRatioManager({}, telemetry) → new AdaptiveScanManager(telemetry, failureTracker) → log `[B79.0n.TELEMETRY][BOOT]` → return. | `server/services/asset-class-instances.ts` | ~60 | LOW |
| C | Update `getAssetClassInstances()` switch to handle all 4 active classes + add `assertNever`-style exhaustive-switch tail throwing `[CLASS_NOT_WIRED] asset class '<X>' has no telemetry instance yet — call sites must check ASSET_CLASS_REGISTRY[X].active before invoking the factory` for reserved-future classes. | `server/services/asset-class-instances.ts` | ~20 | LOW |
| D | Add `getTelemetryInstanceStats()` export to `asset-class-instances.ts` per §3.1 spec. Includes crypto_spot via `peekTelemetryInstance()` thin pull. 4 active classes + 4 inactive (source: 'inactive'). | `server/services/asset-class-instances.ts` | ~50 | LOW |
| E | Boot-sequence pre-warm: in `server/index.ts` after `loadTrailingStates` and BEFORE `xstockSpotScanner.start`, call `getXstockSpotInstances()` + `getXstockPerpInstances()` + `getCryptoPerpInstances()` so all 3 [BOOT] log lines fire predictably. HARD-FAIL boot if any throws. | `server/index.ts` | ~10 | LOW |
| F | Caller-site comment annotations per §3.3 table (4 production files, ~10 comments total). | `routes.ts` + `vts-runner.ts` + `market-indicators.ts` + `fx5-scanner.ts` | ~10 (comment-only) | LOW |
| G | Header-block update to `asset-class-instances.ts` per R-4 mitigation — extend existing block at lines 1-52 with the 4-class table + asymmetry rationale. | `server/services/asset-class-instances.ts` | ~30 (comment-only) | LOW |
| H | 6 new unit tests per §5. | `server/tests/unit/b79-0n-telemetry-*.test.ts` | ~270 | LOW |
| I | Local `npx tsc --noEmit` + `npx vitest run` from C:\dev mirror per CLAUDE.md §7.1. Verify zero new TS errors + all tests pass (new + existing). | local | — | — |

**Total LOC:** ~475 (most is tests). No DB migration. No schema changes. No new dependencies.

---

## §7. Verification deepening (scope §6 expanded)

### 7.1 Pre-deploy snapshot (CC, before Step 6)

- `getTelemetryAggregator()` global singleton crypto_spot `recordCount` snapshot — N (some non-zero baseline).
- Sub-batch SCORING+TEC verify-gate counters: `getTECPickFallbackStats()` + `getSQEStaticMirrorFallbackStats()` — should be 0.
- HTTP 200 on `/api/market-indicators` (proves global singleton still healthy).

### 7.2 Step 7 first-pass (CC, post-deploy)

- 3 `[B79.0n.TELEMETRY][BOOT]` log lines emitted at boot (xstock_perp, crypto_perp). xstock_spot's existing `[B79][BOOT]` already there from B79.
- `getTelemetryInstanceStats()` callable via a temporary diagnostic eval; returns 4 active-class rows + 4 inactive rows; crypto_spot `source: 'global-singleton'`; other 3 `source: 'factory-instance'`; all `recordCount: 0` on the 3 new instances; crypto_spot `recordCount: N` (continuing from pre-deploy).
- `getAssetClassInstances('xstock_perp')` no longer throws — returns valid triad.
- `getAssetClassInstances('crypto_perp')` no longer throws — returns valid triad.
- `getAssetClassInstances('crypto_spot_24_7' as AssetClass)` (a reserved-future class) THROWS `[CLASS_NOT_WIRED]` with `ASSET_CLASS_REGISTRY` mention.
- No new errors in PM2 logs across a 5-minute window post-restart.
- Crypto_spot global singleton `recordCount` keeps incrementing from VTS writes — proves no-touch fence held.

### 7.3 Step 8 second-pass (Langston, independent via `ssh staging`)

- Same checks per §7.2.
- Spot-check: VTS records crypto telemetry into the global singleton (M70 path unchanged).
- Optional: tail `/api/diagnostics/xstock-scanner` to confirm xstock_spot scanner consumer unchanged.

### 7.4 48h verify-gate

- xstock_perp + crypto_perp `recordCount` expected **zero over full 48h** (no live VTS path writes to them; M70 writers haven't been threaded per Q3 deferral). Any non-zero count signals an early mis-routing → investigate immediately.
- crypto_spot `recordCount` increments normally over the 48h window.
- xstock_spot `recordCount` increments normally (existing B79.0a path).

**Verify-gate alert:** schedule one alert at +48h post-deploy via `npm run system-alerts -- add` matching the SCORING+TEC pattern. Body cites the probe commands.

---

## §8. Open items / Step 4 dispatch items

No open items requiring Langston ACK before Step 3. Step 4 code-review dispatch will embed the diff snippets for Chunks A-G per CLAUDE.md §6.5.0.a (embedded-diff + no-gdrive instruction). Test files (Chunk H) listed by path only — Langston can read them locally if he wants depth.

---

## §9. Step 10 governance pre-plan (so it's not discovered at close time)

All 8 Tier 1+2 docs to be ACTUALLY edited per Kyle PATTERN-DETECT directive:

1. **`BATCH_CATALOG.md`** — add B79.0n.TELEMETRY row.
2. **`PHASE_HISTORY.md`** — add closure entry.
3. **`SYSTEM_IMPACT_MAP.md`** — update "Recent additions (B79)" section to reflect 4-of-4 active-class coverage; document `peekTelemetryInstance()` + `getTelemetryInstanceStats()` export sites; update §7.6 telemetry-aggregator entry to mention the new observability fields.
4. **`SYSTEM_MANUAL.md`** — add new sub-section to Chapter 10 titled "B79.0n.TELEMETRY — Per-class instance bootstrap" documenting Variant C in-memory invariant + factory exhaustive-switch + crypto_spot asymmetry rationale.
5. **`ASSET_CLASS_ONBOARDING_WORKFLOW.md`** — add §4.19 entry codifying "per-class-instance pattern is the canonical approach when a class owns persistent state" + the `peekTelemetryInstance` non-arming-read precedent (useful for future factories that face the same arming hazard).
6. **`MULTI_ASSET_VTS_EXPANSION_PLAN.md`** — update with 2026-05-26 entry; mark TELEMETRY (#10) closed in the table.
7. **`CHANGES_AND_FIXES.md`** — add CLOSURE-2026-05-26 entry citing the 3 chunks + the disk-persist Variant C decision.
8. **`RUNNING_ISSUES.md`** — close any TELEMETRY-prefixed open items; add the `TELEMETRY.b` follow-up entry (persistence for non-crypto_spot classes — opens when first perp class flips active-trading, no SLA).

### §9.1 Phase 24 onboarding learnings — pre-thoughts (for completion report 4-section block)

- **(a) What worked well:** §0 inventory pre-empted the "we already shipped this" pitfall; Langston's Step 1 ACK with all 5 AGREE confirmed the existing-pattern alignment (precedent-by-precedent — same shape as B79.0a per-class instance pattern).
- **(b) What surprised us:** the disk-persist hazard had structural protection (only `getTelemetryAggregator()` arms the timer; `new TelemetryAggregatorService()` direct construction is safe). Variant C is therefore not a deferral — it's the right answer because the multi-instance write-clash never existed for the new instances.
- **(c) Recurring structural patterns:** the `peekTelemetryInstance()` non-arming-read pattern is reusable — any factory that faces an init-side-effect hazard can use the same shape. Worth codifying in onboarding workflow §4.19.
- **(d) Concrete edits proposed to ASSET_CLASS_ONBOARDING_WORKFLOW.md:** §4.19 "Per-class-instance pattern + non-arming-read companion" with sample skeleton.

---

## §10. Awaiting Langston Step 2 ACK before Step 3 implementation

If Langston has further refinements, they go in here. Otherwise the next event is "proceed to Step 3."
