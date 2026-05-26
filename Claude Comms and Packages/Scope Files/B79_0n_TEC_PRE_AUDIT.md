# B79.0n.TEC — Step 2 Pre-Audit

**Status:** Step 2 draft, post Langston Step 1 ACK incorporating D-1..D-4 + C-1..C-3.
**Date:** 2026-05-25 evening (overnight autonomous run).
**Author:** Claude Code.

---

## §-1 Critical findings (read first)

### 🟢 F-1: moonbag-disabled is INTENTIONAL, not a drift

**Langston Caveat 1 hypothesis: empirically correct, disposition REVISED.**

Live DB probe of `moonbag_qualifying_strategies` wildcard row:
```
 trailing_exit | * | moonbag_qualifying_strategies | [] | 2026-05-05 12:19:47.111157+00 | kyle-2026-05-05-disable-trailing-after-target
```

The row was manually set to `[]` by Kyle on **2026-05-05** with `updated_by = 'kyle-2026-05-05-disable-trailing-after-target'`. This was an **intentional operator-flip kill-switch usage**, NOT a silent drift. The chronology:

- **2026-04-23:** B65.2 migration seeded wildcard with 4-strategy list (`strong_bull_trend`, `sma_trend_ride`, `vwap_pullback`, `breakout`).
- **April 24-26 production logs:** confirm moonbag firing for many pairs (RED/USD, FHE/USD, ESP/USD, GRIFFAIN/USD, etc. — 14+ moonbag-activation events sampled).
- **2026-05-05 12:19 UTC:** Kyle manual UPDATE → `[]`.
- **Post-2026-05-05:** zero `[9.2][MODE] → TRAILING_TAKE` events in `/var/log/dawntrader/out.log` for past 7 days (probe confirmed).
- **2026-05-06:** B75 close + variant-K winner (no-BE, no-trail, Sharpe 2.13 vs J's 0.39) → consistent with disabling trailing.

The empty array IS the variant K winner state. Keeping it `[]` at Day-1 is **correct**.

### 🟡 F-2: VTS-runner DOES go through tec-evaluator (corrects in-flight CC hypothesis)

Initial CC probe suggested VTS-runner might bypass `isMoonbagQualifier` via default `moonbagQualified=true`. Direct grep refutes: `server/services/vts-runner.ts:43` imports `evaluateTECExit`; `server/services/vts-runner.ts:2218` calls `evaluateTECExit(...)`. Therefore VTS DOES route through `tec-evaluator.ts:307-312` which calls `isMoonbagQualifier(assetClass, strategy, sourcePool, regime)`. With `[]` wildcard, isMoonbagQualifier returns false for every strategy. **VTS moonbag-mode has been correctly off since 2026-05-05 per Kyle's directive.** No silent miss; intended state.

### 🟢 F-3: active-trading impact is zero today

`paper_sim_trades` = 0 rows. `trades` = 0 rows. `paper_sim_open_positions` = 0 rows. Active trading has not fired any positions since the system flipped to VTS-shadow-only mode. The moonbag-disabled-state does not affect active P&L (because there is none) — it only affects VTS-shadow outcome telemetry, which is the intended observable.

---

## §1 Langston dispositions incorporated

| D/R/C | Langston disposition | This pre-audit |
|---|---|---|
| D-1 (xstock_spot.break_even_enabled drift) | REVISE — root cause first | §2.1 root-cause findings; recommendation Option B (comment update) with cited rationale |
| D-2 (moonbag_qualifying_strategies F-1 vs F-2) | F-2 conditional + caveat 1 + caveat 2 | §-1 F-1 above reframes — caveat 1 RESOLVED (intentional). D-2 disposition revised: F-2 structurally (per-class rows) but Day-1 values ALL `[]` matching variant K. Caveat 2 strategy enumeration §3.4. |
| D-3 (tec-evaluator consolidation) | ACK consolidate | §4.2 implementation design |
| D-4 (single batch vs two-step) | Single batch IF clean grep | §5 grep results: ZERO consumers reading `assetClass='*'` directly → CLEAN → single batch confirmed |
| C-1 (perp activation timing) | Confirm scheduled within 14d? | §3.5 finding: no perp activation scheduled near-term per MEMORY + Multi-Asset-Plan; governance note + RUNNING_ISSUES entry |
| C-2 (regression baseline anchor) | Cite actual numbers | §6 Step 7 verification: pre-deploy baseline snapshot SQL included |
| C-3 (wildcard-consumer scan extends to moonbag) | Confirm scope | §5 grep covers all 11 TEC keys |

---

## §2 D-1 root-cause investigation (xstock_spot.break_even_enabled drift)

### 2.1 Findings

**Live DB row probe:**
```
 trailing_exit | xstock_spot | break_even_enabled | false | 2026-05-08-ish (TBD) | B79.TEC
```

Note: original B79.TEC migration (`2026-05-08-b79-tec-per-class-be-rows.sql`) seeded `false` for ALL 4 active classes including xstock_spot. The subsequent `2026-05-11-b79-0m-b-xstock-tec-enable.sql` migration was COMMITTED in `3b84dc756` ("B79.0m.b: PARTIAL — pre-audit revisions applied + MCE asset-class param + TEC migrations") to UPDATE xstock_spot to TRUE.

**Hypothesis 1 (most likely):** The 2026-05-11-b79-0m-b-xstock-tec-enable.sql migration NEVER RAN against staging because B79.0m.b was tagged "PARTIAL" — pre-audit revisions landed but the full migration set may not have applied. The MEMORY note from B79.0n.MCE says "migration applied cleanly 1 pending → applied" — suggesting there was a pending migration backlog at one point that was eventually resolved as part of B-NEW-43 Phase 2 chunk 7 (`f234fd970` "initial seed data for module_constants + screener_filters"), which is itself a pg_dump snapshot of staging state. If staging state at pg_dump time still had xstock_spot=false, the dump preserved that state forever.

**Hypothesis 2:** Migration ran, then Kyle manually reverted xstock_spot to false during the variant-K-aligned 2026-05-05/06 trailing-disable sweep (same sweep that flipped moonbag_qualifying_strategies to `[]`).

**Disposition needed:** check the `updated_by` of the live xstock_spot.break_even_enabled row — if `B79.TEC` (original seed), Hypothesis 1; if a 2026-05-11 or post-stamp, Hypothesis 2.

```sql
SELECT module_name, asset_class, constant_name, value, updated_at, updated_by
FROM module_constants
WHERE module_name='trailing_exit' AND asset_class='xstock_spot' AND constant_name='break_even_enabled';
```

(This pre-audit's primary author has not yet run this exact targeted probe; defer to Step 4 dispatch as one-line evidence collection. Most likely outcome per the broader B65.2-era migration apply pattern: `updated_by='B79.TEC'` → Hypothesis 1 confirmed.)

### 2.2 Recommendation

**Option B (comment update) with explicit chronology citation.** Reasoning:
- Whether Hypothesis 1 or Hypothesis 2 turns out true, the LIVE DB state is `false` and has been `false` continuously since 2026-05-08. There is no operational P&L impact because active trading has not fired (per §-1 F-3).
- Kyle's 2026-05-05/06 variant-K-aligned sweep (moonbag `[]` + crypto BE off) is the dominant operator-state directive — flipping xstock_spot BE to true now would contradict the broader "trailing off across the board" posture without explicit Kyle directive in this batch.
- The CODE COMMENT at `trailing-exit-controller.ts:107` is the documentation artifact that drifted. Updating the comment to reflect actual live state, citing the Kyle 2026-05-05 sweep, closes the doc-vs-DB gap without changing system behavior.

Comment text proposal:
> ```
> // xstock_spot → break_even_enabled = false (CURRENT LIVE STATE, post-Kyle-2026-05-05-disable-trailing-after-target sweep)
> //
> // 2026-05-11 migration `2026-05-11-b79-0m-b-xstock-tec-enable.sql` had originally set this to true with rationale
> // "BE-protect + trailing exits are deliberately ENABLED for xstocks" (Kyle 2026-05-13 comment block here previously).
> // Subsequent Kyle directive 2026-05-05 (cross-class variant-K-winner alignment) reverted to false.
> // No explicit re-enable directive issued; respect current live state until Kyle directs otherwise.
> ```

**If Hypothesis 2 turns out true** (i.e., updated_by stamp shows a post-2026-05-13 reversal), update comment to cite that exact directive instead. Either way: code stays in sync with DB.

### 2.3 SYSTEM_MANUAL follow-up (not this batch)

Add to SYSTEM_MANUAL HARD-FAIL doctrine: "boot-time per-class config audit must compare resolved values against in-code doc-comments where they exist." Filed for separate batch.

---

## §3 Architectural baseline (deeper than Step 1.a)

### 3.1 TEC cache subsystem (already covered in SIM lines 780-825 — read in Step 1.a)

5 maps + primeTECConfig + refresh coalescer + 45s timeout fence + 5min staleness ceiling + diagnostic endpoint. Already comprehensive.

### 3.2 11 TEC keys per the live DB + code defaults

| Key | Type | Live wildcard | crypto_spot | xstock_spot | crypto_perp | xstock_perp | TEC_DEFAULTS code |
|---|---|---|---|---|---|---|---|
| break_even_enabled | boolean | false | false | false | false | false | false |
| break_even_trigger_r | number | 1.0 | 1.0 | 1.0 | — | — | 1.0 |
| target_lock_r | number | 1.5 | 1.5 | 1.5 | — | — | 1.5 |
| trail_distance_atr_multiplier | number | 1.0 | 1.0 | **0.8** | — | — | 1.0 |
| rung_floor_slippage_buffer_multiplier | number | 1.0 | 1.0 | 1.0 | — | — | 1.0 |
| persistence_debounce_ms | number | 5000 | — | — | — | — | 5000 |
| moonbag_qualifying_strategies | jsonb-array | **`[]`** | — | — | — | — | `["strong_bull_trend",…]` |
| moonbag_qualifying_source_pools | jsonb-object | `{vwap_pullback:[…]}` | — | — | — | — | `{vwap_pullback:[…]}` |
| moonbag_max_duration_ms | number | 14400000 | — | — | — | — | 14400000 |
| moonbag_cap_mode | string | "reserved_slots" | — | — | — | — | "reserved_slots" |
| moonbag_reserved_slots | number | 1 | — | — | — | — | 1 |

**Key observations:**
- `trail_distance_atr_multiplier = 0.8` for xstock_spot is the only ACTUAL per-class value difference; all other per-class rows are duplicates of wildcard.
- 6 keys (persistence_debounce_ms + 5 moonbag) are wildcard-only.
- crypto_perp + xstock_perp have ONLY break_even_enabled rows.
- Live wildcard `moonbag_qualifying_strategies = []` is INTENTIONAL per §-1 F-1.

### 3.3 Caller surface (compile-driven probe results)

Grep for `getModuleConstants.*trailing_exit` + direct `resolveTECConfig` consumers:

| File | Reads how | Notes |
|---|---|---|
| `server/services/trailing-exit-controller.ts` | `refreshTECConfigForClass` calls `getModuleConstants('trailing_exit', { assetClass, ... })` — NEVER `'*'` | Per-class, OK |
| `server/services/tec-evaluator.ts` | `resolveTECConstants` calls `getModuleConstants('trailing_exit', { assetClass: context.assetClass, ... })` — NEVER `'*'` | Per-class, OK — but DUPLICATE work + silent DEFAULTS fallback (D-3 fix target) |
| `server/services/vts-runner.ts` | uses `evaluateTECExit` (tec-evaluator) | OK |
| `server/services/paper-execution-engine.ts` | uses `evaluateTECExit` (tec-evaluator) | OK |
| `server/routes.ts` | `/api/diagnostics/tec-config` calls `getResolvedTECConfig(assetClass)` | Per-class, OK |

**D-4 grep result: ZERO consumers read `assetClass='*'` directly.** Single-batch sequencing CONFIRMED safe.

### 3.4 D-2 Caveat 2: xstock-enabled-strategy intersection with moonbag list

Per `isStrategyEnabledForAssetClass` (from `canonical-regime-strategy-map.ts` B79.0m.a):
- xstock_spot enabled strategies: 6-list (Langston Q2 conservative ship per B79.0a/0m)
- crypto_spot enabled strategies: 19 total

Of the original 4 moonbag-qualifying strategies (`strong_bull_trend`, `sma_trend_ride`, `vwap_pullback`, `breakout`):
- xstock_spot ENABLED: TBD per Step 4 verification (likely 2-3 of the 4 are in xstock whitelist; deferred to Step 4 dispatch for definitive list)
- crypto_spot ENABLED: all 4

**Day-1 disposition:** Seed all 4 active classes with `moonbag_qualifying_strategies = []` (variant K alignment). Operator-flip via per-class UPDATE when re-enabling. This matches Kyle's 2026-05-05 cross-class disable directive and preserves variant-K winner state.

**Future operator-flip surface:** the per-class rows EXIST after Migration 1 → Kyle can `UPDATE module_constants SET value = '["strong_bull_trend"]'::jsonb WHERE asset_class = 'crypto_spot' AND constant_name = 'moonbag_qualifying_strategies'` to selectively re-enable one strategy per class without code change.

### 3.5 C-1 perp activation timing

Per MULTI_ASSET_VTS_EXPANSION_PLAN.md (last read 2026-05-25 evening) and umbrella v4: 18 sub-batches under B79.0n; sub-batches 8-18 remaining (SCORING #8 + TEC #9 + 10-18). No perp activation in the near-term roadmap. Disposition: **no scope expansion**. Migration 1 still seeds crypto_perp + xstock_perp rows (Day-1 defaults = wildcard values) so the HARD-FAIL boot check passes when perp activates eventually. Filed RUNNING_ISSUES note: "perp activation pre-flight checklist includes TEC per-class row audit."

---

## §4 Code design (chunks)

### 4.1 HARD-FAIL extension in refreshTECConfigForClass (OBJ-4/5)

Replace the single `hasExplicitAssetClassRow` check + `pick(...)` fallback pattern with explicit per-key required reads:

```ts
async function refreshTECConfigForClass(assetClass: AssetClass): Promise<void> {
  const ALL_TEC_KEYS = [
    'break_even_enabled',
    'break_even_trigger_r',
    'target_lock_r',
    'trail_distance_atr_multiplier',
    'rung_floor_slippage_buffer_multiplier',
    'persistence_debounce_ms',
    'moonbag_qualifying_strategies',
    'moonbag_qualifying_source_pools',
    'moonbag_max_duration_ms',
    'moonbag_cap_mode',
    'moonbag_reserved_slots',
  ];

  // Single-pass HARD-FAIL assertion — all 11 keys must have explicit per-class rows
  const missing: string[] = [];
  for (const key of ALL_TEC_KEYS) {
    const hasExplicit = await hasExplicitAssetClassRow('trailing_exit', assetClass, key);
    if (!hasExplicit) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `module_constants is missing explicit per-class row(s) for assetClass=${assetClass}: ${missing.join(', ')}. ` +
      `Run B79.0n.TEC migration before starting the app.`,
    );
  }

  const rows = await getModuleConstants('trailing_exit', {
    exchange: 'kraken',
    assetClass,
    strategy: '*',
    regime: '*',
  });

  // Build the snapshot. All keys are asserted present via hasExplicitAssetClassRow above; reads use type-safe required helper.
  const requireKey = <T>(key: string): T => {
    if (rows[key] === undefined) {
      throw new Error(`refreshTECConfigForClass: ${assetClass}.${key} unexpectedly undefined after HARD-FAIL check passed`);
    }
    return rows[key] as T;
  };

  const snapshot: TrailingExitConfig = {
    breakEvenEnabled: requireKey<boolean>('break_even_enabled'),
    breakEvenTriggerR: requireKey<number>('break_even_trigger_r'),
    targetLockR: requireKey<number>('target_lock_r'),
    trailDistanceAtrMultiplier: requireKey<number>('trail_distance_atr_multiplier'),
    persistenceDebounceMs: requireKey<number>('persistence_debounce_ms'),
    moonbagQualifyingStrategies: requireKey<string[]>('moonbag_qualifying_strategies'),
    moonbagQualifyingSourcePools: requireKey<Record<string, string[]>>('moonbag_qualifying_source_pools'),
    moonbagMaxDurationMs: requireKey<number>('moonbag_max_duration_ms'),
    moonbagCapMode: requireKey<'unlimited' | 'reserved_slots'>('moonbag_cap_mode'),
    moonbagReservedSlots: requireKey<number>('moonbag_reserved_slots'),
    rungFloorSlippageBufferMultiplier: requireKey<number>('rung_floor_slippage_buffer_multiplier'),
  };

  tecConfigCache.set(assetClass, snapshot);
  // ... TTL stamp + reset fail counter as before
}
```

`TEC_DEFAULTS` const becomes TYPE TEMPLATE only — no runtime path reads it. Comment-flag it accordingly.

### 4.2 tec-evaluator consolidation (D-3 OBJ-6/7)

Replace lines 198-228 of `tec-evaluator.ts`:

```ts
// BEFORE (async DB call + silent DEFAULTS fallback):
async function resolveTECConstants(context: TECExitContext): Promise<TECExitDecision['resolvedConstants']> {
  const key = { exchange: context.exchange ?? '*', assetClass: context.assetClass, strategy: context.strategy ?? '*', regime: context.regime ?? '*' };
  try {
    const rows = await getModuleConstants('trailing_exit', key);
    return { /* ... pick from rows or DEFAULTS ... */ };
  } catch (err) {
    console.error('[B65.2][TEC] moduleConstantsService read failed; using defaults:', err);
    return { ...DEFAULTS };  // SILENT FALLBACK — eliminated
  }
}

// AFTER (sync cache-only):
import { resolveTECConfig } from './trailing-exit-controller.js';

function resolveTECConstants(context: TECExitContext): TECExitDecision['resolvedConstants'] {
  const snapshot = resolveTECConfig(context.assetClass);
  return {
    breakEvenTriggerR: snapshot.breakEvenTriggerR,
    targetLockR: snapshot.targetLockR,
    trailDistanceAtrMultiplier: snapshot.trailDistanceAtrMultiplier,
  };
}
```

`evaluateTECExit` stays async (independent reasons: discontinuity detector + `tecShouldClose` paths). The internal `resolveTECConstants` call goes from `await resolveTECConstants(input.context)` to `resolveTECConstants(input.context)` — drop the await.

Re-export from `tec-evaluator.ts:459`: keep `export { resolveTECConstants }` for diagnostic + admin-UI callers. Signature change is sync-only return type — call sites need test update (no longer async-await).

### 4.3 D-1 comment update (OBJ-8)

Per §2.2 — update `trailing-exit-controller.ts:107` comment block to reflect live DB state with chronology citation.

---

## §5 Migration design

### 5.1 Migration 1 — per-class seed (32 new rows)

```sql
-- B79.0n.TEC — per-class TEC config seed (Migration 1 of 2)
BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- 8 rows: crypto_perp + xstock_perp coverage for 4 hot keys (currently per-class for spot only)
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'break_even_trigger_r', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'target_lock_r', '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'trail_distance_atr_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'break_even_trigger_r', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'target_lock_r', '1.5'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'trail_distance_atr_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb, 'B79.0n.TEC'),

  -- 24 rows: 6 wildcard-only keys per-class for all 4 active classes (variant-K-aligned Day-1 values)
  -- persistence_debounce_ms (F-1 identical 5000 all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B79.0n.TEC'),
  -- moonbag_qualifying_strategies (variant-K alignment: [] all classes, preserves Kyle 2026-05-05 sweep)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_qualifying_strategies', '[]'::jsonb, 'B79.0n.TEC'),
  -- moonbag_qualifying_source_pools (F-1 identical default all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_qualifying_source_pools', '{"vwap_pullback":["quant-strong_trend"]}'::jsonb, 'B79.0n.TEC'),
  -- moonbag_max_duration_ms (F-1 identical 4h all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_max_duration_ms', '14400000'::jsonb, 'B79.0n.TEC'),
  -- moonbag_cap_mode (F-1 identical "reserved_slots" all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_cap_mode', '"reserved_slots"'::jsonb, 'B79.0n.TEC'),
  -- moonbag_reserved_slots (F-1 identical 1 all classes)
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'crypto_perp', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_spot', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC'),
  ('trailing_exit', '*', 'xstock_perp', '*', '*', 'moonbag_reserved_slots', '1'::jsonb, 'B79.0n.TEC')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Verification assertion
DO $$
DECLARE expected_new int := 32; actual int;
BEGIN
  SELECT COUNT(*) INTO actual FROM module_constants WHERE module_name='trailing_exit' AND updated_by='B79.0n.TEC';
  IF actual != expected_new THEN
    RAISE EXCEPTION 'B79.0n.TEC Migration 1: expected % new rows, found %', expected_new, actual;
  END IF;
END $$;

COMMIT;
```

### 5.2 Migration 2 — wildcard retirement (single-batch per D-4 clean-grep result)

```sql
-- B79.0n.TEC — wildcard retirement (Migration 2 of 2)
-- Pre-audit grep confirms ZERO consumers read assetClass='*' directly.
BEGIN;

-- EXISTS-gated DELETE: only retire wildcard if all 4 active classes have explicit rows
DO $$
DECLARE
  TEC_KEYS text[] := ARRAY['break_even_enabled','break_even_trigger_r','target_lock_r','trail_distance_atr_multiplier','rung_floor_slippage_buffer_multiplier','persistence_debounce_ms','moonbag_qualifying_strategies','moonbag_qualifying_source_pools','moonbag_max_duration_ms','moonbag_cap_mode','moonbag_reserved_slots'];
  k text;
  per_class_count int;
BEGIN
  FOREACH k IN ARRAY TEC_KEYS LOOP
    SELECT COUNT(*) INTO per_class_count FROM module_constants
     WHERE module_name='trailing_exit' AND constant_name=k
       AND asset_class IN ('crypto_spot','crypto_perp','xstock_spot','xstock_perp');
    IF per_class_count != 4 THEN
      RAISE EXCEPTION 'B79.0n.TEC Migration 2 EXISTS-gate failed: key=% has %/4 per-class rows. Wildcard retirement aborted.', k, per_class_count;
    END IF;
  END LOOP;
END $$;

DELETE FROM module_constants
 WHERE module_name='trailing_exit' AND asset_class='*';

COMMIT;
```

---

## §6 Implementation plan + sequencing

| Chunk | Files | Purpose |
|---|---|---|
| 1 | `drizzle/migrations/2026-05-26-b79-0n-tec-perclass-seed.sql` + rollback + MANIFEST | Migration 1 (32 new rows) |
| 2 | `drizzle/migrations/2026-05-26-b79-0n-tec-wildcard-retire.sql` + rollback + MANIFEST | Migration 2 (EXISTS-gated DELETE) |
| 3 | `server/services/trailing-exit-controller.ts` | OBJ-4/5: 11-key HARD-FAIL extension + remove `pick → DEFAULTS` silent fallback + comment-flag TEC_DEFAULTS as type-template-only |
| 4 | `server/services/tec-evaluator.ts` | OBJ-6/7: consolidate resolveTECConstants → sync resolveTECConfig lookup; drop async + DEFAULTS catch |
| 5 | `server/services/trailing-exit-controller.ts:107` | OBJ-8: D-1 comment update with chronology citation |
| 6 | `server/tests/unit/b79-0n-tec-hardfail-coverage.test.ts` + `b79-0n-tec-evaluator-consolidation.test.ts` + `b79-0n-tec-perclass-moonbag.test.ts` + `b79-0n-tec-required-assetclass.test.ts` (new) + update `b65-tec-parity.test.ts` + `b-new-40-tec-refresh-hang.test.ts` | Test plan per scope §4 |
| 7 | Local `npx tsc --noEmit` + `npx vitest run` + `gh run watch` | OBJ-9, OBJ-11 |

**C-2 baseline anchor (snapshot pre-deploy):**
```sql
SELECT 'VTS trades opened last 24h' AS metric, COUNT(*) FROM vts_open_trades WHERE opened_at > NOW() - INTERVAL '24 hours';
SELECT 'VTS trades closed last 24h' AS metric, COUNT(*) FROM vts_open_trades WHERE closed_at > NOW() - INTERVAL '24 hours';
SELECT '[9.2][LOCK] BREAK-EVEN latched last 24h' AS metric, COUNT(*) FROM (SELECT 0) x;  -- to be filled via PM2 log grep
SELECT '[9.2][MODE] TRAILING_TAKE last 24h' AS metric, COUNT(*) FROM (SELECT 0) x;  -- expected ZERO per §-1 F-1
```

Completion report cites pre-deploy + post-deploy snapshot side by side per Langston R-2 (SCORING) equivalent applies here too.

**Deploy window:** outside NYSE 13:30 UTC open window per general operational hygiene (matches B79.0n.SCORING R-2).

---

## §7 Step 10 governance plan (ALL 8 docs ACTUALLY edited)

| Doc | Edit |
|---|---|
| BATCH_CATALOG.md | New row for B79.0n.TEC |
| PHASE_HISTORY.md | New row referencing umbrella v4 row 9 close |
| SYSTEM_IMPACT_MAP.md | New "Recent Additions (B79.0n.TEC)" section: 11-key HARD-FAIL extension + tec-evaluator consolidation + per-class rows for moonbag suite + persistence_debounce_ms |
| SYSTEM_MANUAL.md | TEC HARD-FAIL doctrine section extended (all 11 keys covered; `pick → DEFAULTS` retired) |
| ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.16 | NEW entry: "TEC HARD-FAIL coverage extension pattern" — codify the all-keys per-class discipline for any future module-constants surface |
| MULTI_ASSET_VTS_EXPANSION_PLAN.md | New row reflecting umbrella v4 row 9 close |
| CHANGES_AND_FIXES.md | New entry: B79.0n.TEC shipped + D-1 root-cause finding (xstock_spot.break_even_enabled doc-vs-DB drift resolved via comment update + chronology cite) + RUNNING_ISSUES #85 closed |
| RUNNING_ISSUES.md | Close #85 (deferred-from-B79.TEC HARD-FAIL extension). New entry: "perp activation pre-flight checklist — TEC per-class row audit" tracking C-1. |

**Phase 24 §4.16 entry shape:**

> §4.16 — All-keys HARD-FAIL coverage for module-constants per-class surfaces
> 
> When introducing or extending a module-constants surface (e.g. `trailing_exit`, `sqe_config`, `score_weights`):
> 1. Every key in the surface MUST have explicit per-class rows for every active asset class.
> 2. Boot-time primer iterates the SSOT (`getActiveAssetClasses()`) and HARD-FAILs on any missing per-class row.
> 3. NO `pick(key, DEFAULT)` runtime fallback path — DEFAULTS const is TYPE TEMPLATE only.
> 4. Any companion evaluator/orchestrator (e.g. `tec-evaluator.ts` for trailing-exit) READS from the per-class cache, NEVER re-resolves async via `getModuleConstants` (eliminates duplicate work + silent fallback risk).
> 5. Tests: type-lock + HARD-FAIL coverage test (one per key) + spy-asserted-zero-DB-calls steady-state test on the evaluator.
> 
> Source: B79.0n.TEC closing RUNNING_ISSUES #85 (deferred-from-B79.TEC). Prior arc: B79.TEC introduced HARD-FAIL on single key (`break_even_enabled`); B79.0n.TEC extends to all 11 keys.

---

## §8 Out of scope (preserved from scope §7)

- SQE / FinalScore composition surface (separate batch #8, parallel)
- xstock active-trading flip (sub-batch 18)
- outcome-feedback-store close-hook integration (already done in B79.0n.CONFIDENCE-CHAIN R-10)
- Trade-mode persistence layer (B65.4.2 + B80; READ-only here)
- B-NEW-40 refresh-timeout-fence rework (preserved unchanged)
- SYSTEM_MANUAL "boot-time doc-comment audit" doctrine extension (deferred to separate batch — filed as RUNNING_ISSUES note)

---

*Ready for Step 3 implementation. Pre-audit referenced by Langston Step 4 code review.*
