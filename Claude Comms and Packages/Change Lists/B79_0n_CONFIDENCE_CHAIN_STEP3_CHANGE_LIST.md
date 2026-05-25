# B79.0n.CONFIDENCE-CHAIN — Step 3 Change List (for Langston Step 4 review)

**Author:** Claude Code, 2026-05-25.
**Origin branch:** `migration/aws-supabase`
**Range:** scope-locked commit `8293ed5d2` (Step 1) → implementation HEAD `d73ec7a` (Chunks 1-7 complete).
**Pre-audit:** `B79_0n_CONFIDENCE_CHAIN_PRE_AUDIT.md` v1.1 (commit `aa8a81f49`) — Langston Step 2 ACK confirmed; clarifications 1-4 + R-10/R-11 addressed inline.

**Scope status:** all 21 numbered objectives from scope §3 implemented. 7-chunk plan complete locally + pushed. Local tsc baseline 494 unchanged. 26 new tests pass. CI run in progress at d73ec7a.

---

## §0 — Commit timeline

| Chunk | Commit | Description |
|---|---|---|
| 1 | `9537794` | Migration SQL — per-class seed for 9 modulator modules + rollback |
| 2 (B+D combined) | `1e8a531` | Modulator function signatures + 7 FactorAlternateInput arms |
| 3 | `32c1b2b` | MCE per-class refresh + accessors (macro, pair-correlation, regime-phase) — same commit as Chunk 4 |
| 4 | `32c1b2b` | Chain-composition threading at 16 push sites |
| (hotfix) | `da92a79` | MANIFEST.txt + CI failure recovery |
| (hotfix) | `854f744` | b68-3 test fixture: add `computeCorrelationEnabled: true` + thread assetClass |
| 5 | `1c230e3` | Outcome-feedback store key migration + persistent path move |
| 6 + 7 | `d73ec7a` | 3 new test files (26 tests) + verification gate |

---

## §1 — Chunk 1: Migration SQL (commit `9537794`)

**File:** `drizzle/migrations/2026-05-25-b79-0n-confidence-chain-per-class-seed.sql`
**Companion:** `drizzle/migrations/2026-05-25-b79-0n-confidence-chain-per-class-seed-rollback.sql`

Per-class seed for 9 modulator modules — about 65 new rows for `xstock_spot` cloned from crypto defaults except where per-class disposition diverges. Two new constant patterns introduced (`b67_1_asset_class_no_op_active` flag, `b68_3_compute_correlation_enabled` flag).

**Key seeds with per-class disposition (D-1, D-2, D-3):**

```sql
-- D-1: xstock macro NO-OP — modifier clamps to identity (1.0) + flag forces short-circuit
('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_modifier_max', '1.0'::jsonb, ...),
('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_modifier_min', '1.0'::jsonb, ...),
('macro_modifier', '*', '*',           '*', '*', 'b67_1_asset_class_no_op_active', 'false'::jsonb, ...),
('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_asset_class_no_op_active', 'true'::jsonb, ...),

-- D-2: pair correlation — SPY/USD reference + compute_enabled=false v1
('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_btc_reference_symbol', '"SPY/USD"'::jsonb, ...),
('pair_correlation', '*', '*',           '*', '*', 'b68_3_compute_correlation_enabled', 'true'::jsonb, ...),
('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_compute_correlation_enabled', 'false'::jsonb, ...),

-- D-3: phase weights JSONB blob for xstock — 9 enabled strategies x 3 phases = 27 cells at neutral 1.0
('regime_phase', '*', 'xstock_spot', '*', '*', 'b67_2_strategy_phase_weights',
  '{"breakout_EARLY": 1.0, ..., "vwap_pullback_LATE": 1.0}'::jsonb, ...),
```

Atomic BEGIN/COMMIT; idempotent via `ON CONFLICT DO NOTHING`. Rollback SQL deletes by `asset_class='xstock_spot'` AND `updated_by LIKE 'b79.0n.confidence-chain-seed%'` for safe revert.

**Hotfix `da92a79`** added the migration filename to `drizzle/migrations/MANIFEST.txt` after CI's drift-detect caught the missing entry.

---

## §2 — Chunk 2 (B+D combined): Modulator signatures + FactorAlternateInput arms (commit `1e8a531`)

7 modulator surface APIs gained REQUIRED `assetClass: AssetClass` parameter. The 7 `FactorAlternateInput` discriminated-union arms gained `assetClass: AssetClass` fields. The macro modifier gained two new fields (`assetClassNoOpActive` in config + result) for the no-op short-circuit; pair-correlation gained two new fields (`computeCorrelationEnabled` in config, `computeDisabled` in result + new `'COMPUTE_DISABLED'` label).

**Load-bearing diff — macro modifier no-op short-circuit (`server/core/metrics/macro-modifier.ts`):**

```ts
// New short-circuit at top of computeMacroModifier — fires BEFORE staleness/cold-start checks:
if (config.assetClassNoOpActive) {
  return {
    value: 1.0,
    btcDomZ: NaN, fundingZ: NaN, mcapZ: NaN,
    fallbackActive: false,
    staleDataFlag: false,
    assetClassNoOpActive: true,
  };
}
```

**Load-bearing diff — pair-correlation compute-disabled short-circuit (`server/core/metrics/pair-correlation.ts`):**

```ts
// New short-circuit at top of computePairCorrelation:
if (!config.computeCorrelationEnabled) {
  return {
    correlationToBtc: 0, decorrelationScore: 0,
    factor: 1.0,
    coldStart: false,
    sampleCount: 0,
    btcReferenceAvailable: false,
    isBtcSelfReference: false,
    label: 'COMPUTE_DISABLED',
    computeDisabled: true,
  };
}
```

**Load-bearing diff — FactorAlternateInput arms (`server/services/factor-ablation-builders.ts`):**

```ts
// Every arm (b67_1, b67_2, b67_4, b68_1, b68_2, b68_3, b68_4) gained:
{
  kind: 'b67_1',
  modifier: MacroModifierResult,
  admissionPossible: boolean,
  config: MacroModifierConfig,
  assetClass: AssetClass,  // ← B79.0n.CONFIDENCE-CHAIN REQUIRED
}
// b68_5 already had assetClass (B79.0n.MCE). Dispatch threads input.assetClass
// to every buildXAlternate callee. TS exhaustiveness check enforces.
```

**Other modulator signature changes (all REQUIRED `assetClass: AssetClass` last param):**

- `applyPhasePreference(strategy, phase, weights, baseConfidence, assetClass)` — missing-key throw includes asset_class in error message
- `computeOutcomeFeedbackFactor(entry, config, assetClass)` — result type also carries `assetClass: AssetClass` for chain-uniformity
- `computeVolumeRegime(ohlcData, config, _assetClass)` — F-1 by construction (math class-invariant); param threaded for downstream metadata stamping
- `computePairCorrelation(pairSymbol, pairOhlc, btcOhlc, config, assetClass)`
- `computeFreshnessFactor(ageMs, config, _assetClass)` — F-1 by construction; param for chain-uniformity
- All `buildBXX_YAlternate(..., assetClass)` — metadata.asset_class stamping for dashboard / replay filterability

---

## §3 — Chunk 3: MCE per-class refresh + accessors (commit `32c1b2b`)

Three of seven MCE modulator configs got per-class enumeration with **atomic Map-replace** pattern (R-11 mitigation per Langston Step 2 clarification 4):

- `macroConfigByClass: ReadonlyMap<AssetClass, MacroModifierConfig>`
- `pairCorrelationConfigByClass: ReadonlyMap<AssetClass, PairCorrelationConfig>`
- `phaseWeightsByClass` + `phaseEarlyMaxHoursByClass` + `phasePrimeMaxHoursByClass`

The other 4 modulator configs (`outcome_feedback`, `regime_age`, `volume_regime`, `multi_tf_agreement`) keep their existing global single-config caches because their math is class-invariant by construction (F-1 per scope §8) AND they don't have per-class flags.

**Load-bearing diff — atomic Map-replace pattern (R-11):**

```ts
private async refreshMacroConfig(): Promise<void> {
  const nextMap = new Map<AssetClass, MacroModifierConfig>();
  for (const ac of (['crypto_spot', 'xstock_spot'] as const)) {
    const RES_KEY = { exchange: '*', assetClass: ac, strategy: '*', regime: '*' } as any;
    const [btcW, fundW, mcapW, modMin, modMax, staleSec, zMinN, noOp] = await Promise.all([...]);
    // Hard-fail per-class if any constant missing for that class
    if (missing.length > 0) {
      throw new Error(`[B67.1][asset_class=${ac}] missing module_constants...`);
    }
    nextMap.set(ac, { ..., assetClassNoOpActive: noOp as boolean });
  }
  // Atomic Map-replace — readers see EITHER old or new map, never partial state.
  this.macroConfigByClass = nextMap;
  // Legacy back-compat: macroConfigCache holds the crypto_spot entry.
  const cryptoCfg = nextMap.get('crypto_spot');
  this.macroConfigCache = cryptoCfg!;
  // ...
}

// New per-class accessor:
getMacroConfigForClass(assetClass: AssetClass): MacroModifierConfig | null {
  if (this.macroConfigByClass.size === 0) return null; // cold-start
  const cfg = this.macroConfigByClass.get(assetClass);
  if (!cfg) {
    console.warn(`[B79.0n.CONFIDENCE-CHAIN][missing-class] ...`);
    return null;
  }
  return cfg;
}
```

**Per-class enumeration source** is hardcoded inline `(['crypto_spot', 'xstock_spot'] as const)` because the seed migration only covers these 2 of 4 active asset classes today; the perp classes (crypto_perp, xstock_perp) onboard in a future batch with their own seed migrations. Once the perp seeds land, the inline tuple expands.

---

## §4 — Chunk 4: Chain-composition consumer threading (commit `32c1b2b`)

Threaded `assetClass` through 16 discriminated-union push sites across 2 files using the **capture-and-reuse pattern** from B79.0n.PATTERN-DETECT Step 9. R-10 mitigation also added at `paper-execution-engine.ts:2024-2025` ablation-rebuild hook.

**Load-bearing diff — signal-orchestrator capture-and-reuse (`server/services/signal-orchestrator.ts`):**

```ts
const alternateInputs: FactorAlternateInput[] = [];
let modulatedConfChain = extendedMetrics.confidence ?? 0.5;
{
  const mce = getMarketContextEngine();
  // B79.0n.CONFIDENCE-CHAIN capture-and-reuse: single resolution at chain entry.
  // safeResolveAssetClass returns null + logs WARN on unresolvable (vs throw)
  // per CLAUDE.md §5 #15.
  const _pairAssetClass = safeResolveAssetClass(rawSignal.symbol, 'kraken');
  if (_pairAssetClass === null) {
    console.warn(`[B79.0n.CONFIDENCE-CHAIN][orchestrator] cannot resolve...`);
  } else {
    const macroConfig = mce.getMacroConfigForClass(_pairAssetClass) ?? mce.getCurrentMacroConfig();
    const phaseWeights = mce.getPhaseWeightsForClass(_pairAssetClass) ?? mce.getCurrentPhaseWeights();
    // ... 8 push sites each thread `assetClass: _pairAssetClass`
    alternateInputs.push({
      kind: 'b67_1',
      modifier: macro.modifier,
      admissionPossible: true,
      config: macroConfig,
      assetClass: _pairAssetClass,  // ← threaded
    });
    // ... b67_2, b68_4, b67_4, b68_2, b68_3, b68_1, b68_5 (8 total) ...
  }
}
```

**vts-runner** reuses the already-captured `_assetClass` from line 919 (B79.0n.PATTERN-DETECT Step 9) — same 8 push sites threaded with `assetClass: _assetClass`.

---

## §5 — Chunk 5: Outcome-feedback store key migration + path move (commit `1c230e3`)

Store key shape changed from `<regime>_<strategy>` to `<assetClass>_<regime>_<strategy>`. Same path move for `regime-phase-store.json` (no key change there — symbols are already class-distinct).

**Load-bearing diff — disk-load migration (legacy-as-crypto re-key per Langston D-4):**

```ts
const PERSIST_FILE_NEW = '/home/deploy/dawntrader/data/b67-4-outcome-feedback.json';
const PERSIST_FILE_LEGACY = '/tmp/b67-4-outcome-feedback.json';

private loadFromDisk(): void {
  const now = Date.now();
  // Try NEW path first.
  if (fs.existsSync(PERSIST_FILE_NEW)) {
    try {
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE_NEW, 'utf-8'));
      // ... load entries ...
      return;
    } catch (err) {
      // HARD-FAIL on corrupt new-path data — no silent fallback to legacy
      // per Langston Step 2 clarification 1.
      throw new Error(`[B67.4][outcomeFeedbackStore][load-corrupt] ...`);
    }
  }
  // NEW path absent — fall back to LEGACY + re-key under crypto_spot prefix.
  if (fs.existsSync(PERSIST_FILE_LEGACY)) {
    const data = JSON.parse(fs.readFileSync(PERSIST_FILE_LEGACY, 'utf-8'));
    for (const [tupleKey, entry] of Object.entries(data)) {
      const newKey = this.isNewShapeKey(tupleKey)
        ? tupleKey
        : `crypto_spot_${tupleKey}`;  // ← legacy-as-crypto re-key
      this.entries.set(newKey, entry);
    }
    this.saveToDisk();  // immediately write to NEW path
  }
}
```

**Load-bearing diff — key shape change:**

```ts
private key(assetClass: string, regime: string, strategy: string): string {
  return `${assetClass}_${regime}_${strategy}`;
}

updateEma(assetClass: AssetClass, regime: string, strategy: string, netPnlPct: number, alpha: number, now: number): void { ... }
peek(assetClass: AssetClass, regime: string, strategy: string): OutcomeFeedbackEntry | undefined { ... }
```

**Consumer threading (4 close-hook + peek sites):**

- `signal-orchestrator.ts:812`: `peek(_pairAssetClass, regimeLabel, strategyKey)`
- `vts-runner.ts:1676`: `peek(_assetClass, _regimeLabel, strategy)`
- `paper-execution-engine.ts:1371`: close-hook updateEma resolves `_assetClass = safeResolveAssetClass(position.symbol, 'kraken')` + skip-on-null
- `vts-service.ts:929`: VTS close-hook updateEma resolves from `tradeData.symbol`

---

## §6 — Chunks 6+7: New test surface + verification gate (commit `d73ec7a`)

3 new test files, 26 tests:

1. **`b79-0n-confidence-chain-required-assetclass.test.ts`** (12 tests) — Type-lock harness. One `@ts-expect-error` directive per surface API asserting calls without assetClass fail to compile. All 12 directives confined to this dedicated harness file (anti-graveyard discipline).

2. **`b79-0n-confidence-chain-outcome-feedback-isolation.test.ts`** (6 tests) — Per-class store key isolation. Crypto outcome does NOT contaminate xstock for same (regime, strategy); parallel EMAs with opposite signs evolve independently; wrong-class peek returns undefined; regimes + strategies stay independent within same asset class.

3. **`b79-0n-confidence-chain-asset-class-no-op.test.ts`** (8 tests) — b67_1 macro xstock no-op short-circuit + b68_3 pair-correlation compute-disabled short-circuit. Numeric chain-stability invariant (factor=1.0 identity multiplication) verified. Extreme inputs don't leak through the no-op short-circuit. SPY/USD reference for xstock + XBT/USD for crypto values preserved.

**Existing test updates** (back-compat):
- `b67-1-macro-modifier.test.ts`: 16 `computeMacroModifier` calls + 6 `buildB67_1Alternates` calls thread `'crypto_spot'`; DEFAULT_CONFIG fixture gains `assetClassNoOpActive: false`
- `b67-4-outcome-feedback.test.ts`: 13 updateEma + 13 peek + 5 computeOutcomeFeedbackFactor calls thread `'crypto_spot'`
- `b68-3-pair-correlation.test.ts`: 11 computePairCorrelation + 3 buildB68_3Alternate calls thread `'crypto_spot'`; CFG fixture gains `computeCorrelationEnabled: true`
- `b76-chain-final-emit.test.ts`: 9 buildBXX_YAlternate calls thread `'crypto_spot'`; b67_4 result fixture gains `assetClass` field

**Local verification gate (Chunk 7):**
- `npx tsc --noEmit`: 494 errors (baseline unchanged from pre-CONFIDENCE-CHAIN — zero net new)
- `npx vitest run`: 1343 tests passed (1317 pre + 26 new). 12 failures across 11 files — ALL pre-existing per `git stash` verification (regime_mapping_integrity, b63-item16-dbs-store, b79-0m-b2-pattern-filter, b72-dbs-routing-guards-consistency, integration suite). Not introduced by CONFIDENCE-CHAIN.
- Anti-graveyard grep: zero NEW `as any` / `@ts-ignore` / `!` in modulator production files (existing pre-batch `as any` patterns on RES_KEY untouched).

---

## §7 — Focus areas for Langston review

1. **The atomic Map-replace pattern in MCE (R-11):** is the ReadonlyMap field type + single-reference reassignment idiomatic + safe? Any concern about `getMacroConfigForClass` returning the old map's reference during the swap window?

2. **The hard-fail-on-corrupt-new-path policy in outcome-feedback-store + regime-phase-store:** intentional per your clarification 1 — but does the throw at constructor-time cause any concerning chain effect on MCE.start()? (My read: the constructor runs at import-resolution time, so throwing there crashes the process at boot — which is exactly what we want when the canonical persistent state file is corrupt. Verify this is what you intended.)

3. **The `_pairAssetClass` capture in signal-orchestrator wraps the ENTIRE ablation block in a `if (_pairAssetClass !== null) { ... }` else-branch.** When null, the whole chain skips. Is this the right disposition — versus running the chain with a fallback class? My read: skip is correct because the regime classifier itself already requires per-class config to produce a regime; if assetClass is unresolvable the upstream regime classification has already failed.

4. **`paper-execution-engine.ts` close-hook updateEma** uses `position.symbol` to resolve assetClass. If `position` is missing the symbol field or it's malformed, the safeResolveAssetClass returns null + we skip the EMA update (no fault). Same pattern for `vts-service.ts:929` via `tradeData.symbol`. Sound?

5. **The 12 `@ts-expect-error` directives in `b79-0n-confidence-chain-required-assetclass.test.ts`:** all are inside the dedicated type-lock harness per scope §7 anti-graveyard discipline. Each is documented with a `B79.0n.CONFIDENCE-CHAIN` comment. Acceptable confined-exception?

6. **Per-class enumeration `(['crypto_spot', 'xstock_spot'] as const)` hardcoded inline:** OK for v1 (perp classes have no modulator-chain config seeded yet; will be added in a future batch alongside their seed migrations). When the perp seeds land, this tuple expands. Is this disposition documented adequately at the call site?

7. **§-3 Obj 16 + §3 Obj 17:** both implemented as documented in scope. Verify the no-op + compute-disabled flags fire on staging xstock signals (Step 7 verification).

---

## §8 — Items deferred to Step 10 governance

- SIM §B69 per-class wording edits (per Langston nuance E)
- System Manual modulator-chain chapter updates
- ASSET_CLASS_ONBOARDING_WORKFLOW steps for per-class confidence-chain
- MULTI_ASSET_VTS_EXPANSION_PLAN row for CONFIDENCE-CHAIN
- BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES entries
- RUNNING_ISSUES updates
- **CLAUDE.md consolidation pass** (Kyle directive 2026-05-25 — reduce ~731 lines to ~400 by moving rule-origin backstories into `_archive/CLAUDE_MD_RULE_HISTORY.md`)

---

**End of change list. Please review and reply with Step 4 ACK or revisions. Infrastructure note: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo (FUSE hang risk per §6.5.0.a). Read the inbox file at /home/langston/inbox/b79-0n-confidence-chain/STEP3_CHANGE_LIST.md directly. Staging server `ssh staging` available for repo-side inspection if needed at commit `d73ec7a`.**
