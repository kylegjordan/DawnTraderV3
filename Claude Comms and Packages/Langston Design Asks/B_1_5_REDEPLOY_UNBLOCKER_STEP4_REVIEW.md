# B.1.5 Redeploy Unblocker — Step 4 Code Review Dispatch

**Batch:** B.1.5 (xStock liquidity/volume data-integrity)
**Sub-fix:** producer-consumer drift between `sync-canonical-bridge.ts` (flat-shape emitter) and `getClassMap` (byAssetClass-nested consumer)
**Branch:** `migration/aws-supabase`
**Rolled-back HEAD:** `32d7e2c` (staging currently here, HTTP 200, scanner clean)
**Pre-audit addendum:** `Claude Comms and Packages/Scope Files/B_1_5_PRE_AUDIT.md` §11 (written FIRST per your non-negotiable #2)

> **INFRASTRUCTURE NOTE: DO NOT cd to `/mnt/gdrive` or run `git status/log` on the gdrive-mounted repo. Use `ssh staging` for any repo-side inspection. All diffs needed for this review are embedded inline below.**

---

## 1. Your 4 non-negotiables — status

1. **Unit test on `generateBridgeJSON` asserting output matches `getClassMap` contract** — ✅ DONE. New file `server/tests/unit/sync-canonical-bridge.test.ts` (9 tests, all green locally). Embedded diff §3.
2. **B.1.5 scope-file addendum with root-cause summary BEFORE implementation** — ✅ DONE. `B_1_5_PRE_AUDIT.md` §11 written BEFORE code edits. One-paragraph root cause + minimal-blast fix rationale + out-of-scope deeper structural fix + verification gates + process-learning capture.
3. **Commit message names what it unblocks** — Will use: `"B.1.5 redeploy unblocker: align bridge JSON producer with byAssetClass consumer contract introduced af99bd5"`
4. **Completion report + CHANGES_AND_FIXES update with BUG-2026-05-31-A** — Will land at Step 11 governance close; logging as TODO now.

---

## 2. Root cause (3 sentences)

The hand-authored `bridge/canonical/mapping-regime-strategy.json` byAssetClass shape (added af99bd5 B79.0n.STRATEGY 2026-05-24) and the runtime consumer `getClassMap` at `server/core/strategy-mapper.ts:43` (reads `typedCanonicalMap.byAssetClass?.[assetClass]`) form a contract; `sync-canonical-bridge.ts`'s `generateBridgeJSON()` still emitted the legacy flat-per-regime shape, silently drifting from that contract. The drift was latent because the sync script is a manual `npx ts-node` invocation never re-run since af99bd5. My B.1.5 deploy crashed at scanner boot (`[11.4H.6G][Mapper] No canonical regime-strategy map for asset class 'crypto_spot'`) — most likely because esbuild ESM module-init ordering shifted with my new module-level imports in the eval-cycle/scanner/filter chain, promoting `market-indicators.ts` initialization into a window where the atomic-write race or stale-bundle path read returned a partial-shape JSON.

---

## 3. Embedded diff — `server/scripts/sync-canonical-bridge.ts` (+128/−13)

### 3.a NEW — `ASSET_CLASS_OVERRIDES` const + helpers (inserted ~L63-170)

```ts
// B.1.5 redeploy unblocker (2026-05-31): byAssetClass overrides
// ──────────────────────────────────────────────────────────────────────────────
// Encodes the per-asset-class deltas vs. the flat in-source CANONICAL_REGIME_STRATEGY_MAP.
// Hand-authored into bridge/canonical/mapping-regime-strategy.json during B79.0n.STRATEGY
// (af99bd5, 2026-05-24); this script previously emitted the flat shape, silently
// drifting away from the consumer contract enforced by getClassMap
// (server/core/strategy-mapper.ts:43 → typedCanonicalMap.byAssetClass?.[assetClass]).
//
// Each per-class subtree is derived as:
//   subtreeStrategies(regime) = (source[regime].strategies - excludeStrategies[class][regime])
//                               + addStrategies[class][regime]
//
// Exclusion rationale:
//   • strong_bull_trend: globally excluded from canonical favored list — routed
//     via separate quant-strong-trend sourcePool (B63), not the canonical regime path.
//   • defensive_hedge: crypto-only (BTC-correlation hedging, not applicable to xStocks).
//   • orb: xstock-only (intraday opening-range breakout, equity-hours microstructure).
//
// Addition rationale:
//   • orb in xstock_spot TFS: hand-authored extension (B79.0n.STRATEGY) — ORB
//     fires on stable-trend breakouts not just impulse regimes for xStocks.
//
// favoredSignalTypes is derived from the resulting per-class strategy list
// (distinct set of signalType values, using STRATEGY_KEY_TO_SIGNAL_TYPE lookup
// for ADDED strategies whose source mapping is in a different regime).
//
// minConfidence + riskMultiplier are taken directly from the source regime mapping
// (same across asset classes per current hand-authored JSON).
//
// To change per-class strategy membership: edit ASSET_CLASS_OVERRIDES below,
// re-run `npx ts-node server/scripts/sync-canonical-bridge.ts`, then verify
// the JSON via the sync-canonical-bridge.test.ts unit test.
// ──────────────────────────────────────────────────────────────────────────────

const ASSET_CLASSES = ['crypto_spot', 'xstock_spot'] as const;
type AssetClassKey = typeof ASSET_CLASSES[number];

interface PerClassOverride {
  excludeStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
  addStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
}

const ASSET_CLASS_OVERRIDES: Record<AssetClassKey, PerClassOverride> = {
  crypto_spot: {
    excludeStrategies: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      HIGH_VOLATILITY_UNSTABLE: [],
      RANGE_BOUND_STABLE: [],
      IMPULSE_EXPANSION: ['strong_bull_trend', 'orb'],
      STRUCTURAL_TRANSITION: ['orb'],
    },
    addStrategies: {},
  },
  xstock_spot: {
    excludeStrategies: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      HIGH_VOLATILITY_UNSTABLE: ['defensive_hedge'],
      RANGE_BOUND_STABLE: [],
      IMPULSE_EXPANSION: ['strong_bull_trend'],
      STRUCTURAL_TRANSITION: ['orb'],
    },
    addStrategies: {
      TREND_FRIENDLY_STABLE: ['orb'],
    },
  },
};

/** Build strategyKey → signalType lookup once from the source map. */
function buildStrategyToSignalType(): Map<string, string> {
  const map = new Map<string, string>();
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const s of mapping.strategies) {
      map.set(s.strategyKey, s.signalType);
    }
  }
  return map;
}

function deriveClassSubtree(
  assetClass: AssetClassKey,
  strategyToSignalType: Map<string, string>
): Record<string, any> {
  const overrides = ASSET_CLASS_OVERRIDES[assetClass];
  const subtree: Record<string, any> = {};
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    const regimeKey = regime as CanonicalRegimeType;
    const excludes = new Set(overrides.excludeStrategies[regimeKey] ?? []);
    const adds = overrides.addStrategies[regimeKey] ?? [];
    const sourceKeys = mapping.strategies
      .filter(s => !excludes.has(s.strategyKey))
      .map(s => s.strategyKey);
    const favoredStrategies = [...sourceKeys, ...adds.filter(k => !sourceKeys.includes(k))];
    const favoredSignalTypes = [
      ...new Set(
        favoredStrategies
          .map(k => strategyToSignalType.get(k))
          .filter((v): v is string => typeof v === 'string')
      ),
    ];
    subtree[regime] = {
      favoredStrategies,
      favoredSignalTypes,
      riskMultiplier: mapping.riskMultiplier,
      minConfidence: mapping.minConfidence,
    };
  }
  return subtree;
}
```

### 3.b REPLACED — `generateBridgeJSON` (now exported, emits byAssetClass shape)

**BEFORE (flat shape, the bug):**
```ts
function generateBridgeJSON(): string {
  const bridge: Record<string, any> = {
    _schema: CANONICAL_SCHEMA_VERSION,
    _metadata: { ...CANONICAL_SCHEMA_METADATA, /* timestamps */ }
  };
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    bridge[regime] = {
      favoredStrategies: mapping.strategies.map(s => s.strategyKey),
      favoredSignalTypes: [...new Set(mapping.strategies.map(s => s.signalType))],
      riskMultiplier: mapping.riskMultiplier,
      minConfidence: mapping.minConfidence
    };
  }
  return JSON.stringify(sortObjectKeys(bridge), null, 2);
}
```

**AFTER (byAssetClass shape, matches getClassMap contract):**
```ts
export function generateBridgeJSON(): string {
  const strategyToSignalType = buildStrategyToSignalType();
  const byAssetClass: Record<string, Record<string, any>> = {};
  for (const assetClass of ASSET_CLASSES) {
    byAssetClass[assetClass] = deriveClassSubtree(assetClass, strategyToSignalType);
  }
  const bridge: Record<string, any> = {
    _schema: CANONICAL_SCHEMA_VERSION,
    _metadata: {
      ...CANONICAL_SCHEMA_METADATA,
      updatedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      generator: 'sync-canonical-bridge.ts',
      _changelog: {
        'v3.0.0': '…B79.0n.STRATEGY 2026-05-24 origin + B.1.5 redeploy unblocker 2026-05-31 producer alignment…',
      },
    },
    byAssetClass,
  };
  return JSON.stringify(sortObjectKeys(bridge), null, 2);
}
```

### 3.c UNCHANGED — `generateRegimeStrategyMarkdown`, `generateSignalPatternMarkdown`, `syncCanonicalBridge`, CLI guard

Markdown generators stay flat (docs-only artifact; consumers are humans + a structure-shape test in `mapping_drift_integrity.test.ts:120-136` that only checks "has table" / "has 'regime' word" — not per-class structure). `syncCanonicalBridge` orchestration unchanged. CLI ESM-compat guard unchanged.

---

## 4. NEW FILE — `server/tests/unit/sync-canonical-bridge.test.ts` (9 tests)

Locks the producer-consumer contract in CI.

```ts
import { describe, test, expect } from 'vitest';
import { generateBridgeJSON } from '../../scripts/sync-canonical-bridge';

const ALL_REGIMES = ['TREND_FRIENDLY_STABLE','HIGH_VOLATILITY_UNSTABLE','RANGE_BOUND_STABLE','IMPULSE_EXPANSION','STRUCTURAL_TRANSITION'] as const;
const ALL_CLASSES = ['crypto_spot','xstock_spot'] as const;

describe('sync-canonical-bridge — generateBridgeJSON producer-consumer contract', () => {
  // 1. output parses + has _schema (v3.0+), _metadata, byAssetClass top-level
  // 2. byAssetClass has BOTH crypto_spot + xstock_spot subtrees
  // 3. every (class,regime) has favoredStrategies (non-empty), favoredSignalTypes (non-empty), minConfidence (number), riskMultiplier (number)
  // 4. crypto HVU CONTAINS defensive_hedge; xstock HVU does NOT
  // 5. xstock TFS+IE CONTAIN orb; xstock ST does NOT; crypto NEVER has orb
  // 6. strong_bull_trend EXCLUDED from both classes everywhere (B63 separate sourcePool)
  // 7. simulates getClassMap consumer behaviour — no throw on either class, every regime addressable
  // 8. favoredSignalTypes ∈ {QUANT,PATTERN,HYBRID} only
  // 9. numeric thresholds in sane ranges (minConf 0-1, riskMult 0-3)
});
```

(Full source ≈155 lines, in `C:\dev\DawnTraderV3\server\tests\unit\sync-canonical-bridge.test.ts`; abbreviated above for review density.)

---

## 5. Verification — what I ran locally

| Gate | Command | Result |
|---|---|---|
| New unit test | `npx vitest run server/tests/unit/sync-canonical-bridge.test.ts` | **9/9 green**, 17ms |
| Adjacent tests | `npx vitest run server/tests/unit/{canonical_source_lock,directive-11.4C.3-harmonization,runtime_signal_consistency,signal_mapping_integrity,b1-5-xstock-liquidity-isolation,b79-0d-orb}.test.ts` | **90/90 green**, 387ms |
| tsc baseline | `npx tsc --noEmit` | **494 errors** (UNCHANGED from current-HEAD baseline; zero added) |
| Functional equivalence | `generateBridgeJSON()` output vs current staging `mapping-regime-strategy.json` (sorted-array compare per class/regime/field) | **0 mismatches** across 40 assertions (2 classes × 5 regimes × 4 fields) |

---

## 6. Six review questions

1. **Approach: encode deltas as ASSET_CLASS_OVERRIDES in the sync script vs. restructure the source const.** I went with overrides-in-script — the source const has 56+ consumers in /server (grep-verified), so restructuring it is a 2-4 day batch on its own. The overrides const co-locates the deltas with the producer; the unit test locks the consumer contract. The deeper structural fix (restructure source TS const to byAssetClass) is logged in pre-audit §11 as out-of-scope, will surface as a `RUNNING_ISSUES` entry for Phase-25 / B-NEW-48-class follow-up. **OK or do you want the bigger refactor in this batch?**

2. **xstock_spot TFS `addStrategies: ['orb']` is the only ADD.** Source TS const only has `orb` in IE+ST; the hand-authored JSON also puts it in xstock TFS (line 51 of the file). Confirmed via grep of staging JSON. **Acceptable as a per-class additive override, or should we instead add `orb` to the source TFS mapping and let the crypto-side exclusion remove it?** (Latter is cleaner conceptually but expands the source-const blast radius into 56+ consumers — every TFS-handling site would now see orb in its `.strategies[]` list and need a per-class filter, exactly the architectural debt this fix is trying to avoid.)

3. **`strong_bull_trend` is globally excluded from both classes everywhere.** Verified vs current staging JSON (not present in any subtree). Rationale per source const comment at line 296-298: "Registered in IE because B62 classifier routes |DBS|>=0.50 pairs to IE. Family gate (strong_trend) still enforces exclusivity — strategy only evaluates on quant-strong-trend sourcePool pairs." So it's a source-pool-routed strategy, not a canonical-favored one — the JSON correctly omits it from `favoredStrategies` everywhere. **Sanity-check: is this still correct, or has B63 sequencing changed it?**

4. **`favoredSignalTypes` derivation.** I derive it from the resulting per-class strategy list using a `strategyKey → signalType` lookup built once from the source. For ADDED strategies (like `orb` in xstock TFS), the lookup finds `orb`'s signalType from its source-IE/ST entry (= 'QUANT'). Result: byte-identical to current staging JSON (0 diffs). **Is the derivation pattern sound, or do you want explicit per-class signalType overrides too?**

5. **Markdown bridges left flat.** Generators for `DawnTrader_Regime_Strategy_Mapping.md` and `…_Signal_Pattern_Mapping.md` still iterate the flat source const → produce flat-per-regime markdown. The only consumer test (`mapping_drift_integrity.test.ts:120-136`) only validates "has table-like structure" + "contains word 'regime'" + "contains word 'strategy'". No per-class assertion on markdown. **Acceptable to defer per-class markdown to a docs-only follow-up batch (and surface in RUNNING_ISSUES), or do you want it done now?**

6. **JSON re-run safety.** If `npx ts-node server/scripts/sync-canonical-bridge.ts` is now run manually or by accident (e.g. some forgotten npm hook), it will REGENERATE the JSON in byAssetClass shape — output functionally identical to current staging file (verified 0-diff). So sync re-run is now safe + idempotent w.r.t. consumer behaviour. **Should the sync script also be added to `npm run build` as a guard step (auto-regenerate before bundle so the JSON is always fresh)? My lean: NO for this batch — adds a runtime dependency in build, risk of perturbing the build pipeline. Better to lock via the new unit test (CI breaks if generator output deviates from contract).**

---

## 7. Plan if you ACK

1. Push to GitHub on `migration/aws-supabase` with commit message: `"B.1.5 redeploy unblocker: align bridge JSON producer with byAssetClass consumer contract introduced af99bd5"`
2. Watch CI 4 jobs (TypeScript Check, Test Suite, Build, Docker Build) all-green via `gh run watch`
3. Re-deploy to staging (`git pull` + `npm run build` + `pm2 restart dawntrader`)
4. CC verification: scanner BOOT line in PM2 within 60s, first SCAN_CYCLE_DONE inside 90s, no `[11.4H.6G][Mapper]` error in error.log for 5 minutes, xStock LQ no longer pinned at 100, depth gate fires (failed_min_depth counter > 0)
5. You do Step-8 second-pass UI verification via Claude-in-Chrome / `ssh staging` log probe
6. Step 10 governance: SIM + System Manual + BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES (BUG-2026-05-31-A) + RUNNING_ISSUES (deeper source-restructure entry) + asset-class-onboarding-workflow learnings section + completion report

Active trading stays OFF the whole time (Phase 19 unchanged).

---

*Reply with ACK to push, ACK-W-REVISIONS with specifics, or BLOCK with reasoning. File path for your direct read: `/home/langston/inbox/B-1-5-REDEPLOY/B_1_5_REDEPLOY_UNBLOCKER_STEP4_REVIEW.md` after I SCP it.*
