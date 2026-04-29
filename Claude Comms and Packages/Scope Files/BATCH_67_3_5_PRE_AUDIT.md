# BATCH 67.3.5 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_67_3_5_SCOPE.md` (commit `3da1b179`)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** Drafted, awaiting Langston review (Step 2)

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

Per CLAUDE.md §9: every component the batch touches gets upstream/downstream/shared-state/background-execution/blast-radius analysis.

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | Regime classifier (TFS branch) | `server/core/metrics/market-regime.ts:177-184` | Replace step-function with continuous mapping | **HIGH** — TFS = ~55-60% of pairs; touches every signal admission |
| 2 | Phase store | `server/core/metrics/regime-phase.ts:132-152` (`tick`) | Augment first-observation path with backfill walk | **MEDIUM** — every cold pair on cold-start; persisted state shape unchanged |
| 3 | MCE integration | `server/services/market-context-engine.ts:408-428` | No code change; consumes new behavior | NONE (passthrough) |
| 4 | Module constants | `module_constants` table | Add 4 new keys (B67.3.5 desat scales) | LOW (additive) |
| 5 | OHLC source for backfill | `server/services/market-context-engine.ts` (caller of `tick`) | Pass historical OHLC slices into backfill helper | MEDIUM — adds work to MCE init |
| 6 | Tests | `server/tests/unit/b67-2-phase-dimension.test.ts` + new desat test | Add backfill scenarios + desat formula coverage | NONE |

**Upstream feeders unchanged:**
- DBS (B62) — propagated unchanged from FX5 scanner
- B67.1 macro modifier — multiplies new raw confidence; no change to modifier logic
- B67.2 phase boundaries — `earlyMaxHours`, `primeMaxHours` from `module_constants`; unchanged
- 60-min OHLC cache — already has the historical depth needed for the backward walk

**Downstream consumers unchanged:**
- `applyPhasePreference` — receives modulated confidence; formula unchanged
- B67.0 ablation framework — emits factor rows with new raw values; row schema unchanged
- B67.2.1 trade record persistence — captures new values via existing columns
- B67.3 cohort A/B cap — unchanged
- B67.5 (future) — will read more meaningful confidence values; that's the point
- Dashboard rendering — pulls from existing columns; no UI changes

**Shared state:**
- `regimePhaseStore` — adds backfilled `enteredAt` values; persistence file shape unchanged (same fields). On disk-load post-deploy, no migration needed — old entries remain valid; new entries get backfill on next first-observation.
- No DB schema changes (only `module_constants` additive seeds).

**Background execution:**
- Cold start adds ~177 × up to 12 = ~2,124 `calculatePairRegime` calls during MCE init. Pure function, <1s wall time. Runs serially before first MCE refresh cycle completes.
- No new timers, no new intervals, no new background tasks.

### §A.2 System Manual sections to update on close

- §27 (or wherever regime classifier formula lives) — TFS branch math change with derivation note for new scales
- Phase dimension section — add backfill mechanism explanation + DBS-approximation caveat
- Add cross-ref between TFS desaturation entry and CHANGES_AND_FIXES B67.3.5 lessons-learned

### §A.3 Cascade risk check

Reviewed each downstream consumer for the 3 system-architecture failure modes per SIM discipline:

| Risk | Verdict | Mitigation |
|---|---|---|
| TFS confidence shifts cause downstream gates to start admitting/rejecting different signals | **No active gating yet** — confidence is decorative pre-B67.5. Routes change zero. Only ablation rows + trade-record columns reflect new values. | None needed; deferred risk to B67.5 batch with calibration window in between. |
| Backfilled phase changes phase-weight applied to admission | Same as above — phase weight modulates a not-yet-consumed confidence number. Live behavior change is "ablation row contents differ" and "trade record columns reflect actual age," nothing else. | None needed. |
| `regimePhaseStore` persistence corruption from new backfill code path | Backfill writes through the existing `entries.set() + saveToDisk()` path. No new disk format. | Unit tests + post-deploy log line check. |

**Net:** because confidence is decorative pre-B67.5 and B67.4 hasn't shipped, the desaturation is observably quiet — the only visible change is more spread in the `regime_confidence_raw` column on new closed trades. This is the goal.

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1:** `server/core/metrics/regime-phase.ts`

**Add** (new method on `RegimePhaseStore`):
```typescript
/**
 * Backfill regime entry time for a cold pair using historical OHLC.
 * Walks backward through 60-min windows running calculatePairRegime;
 * the most recent window with a DIFFERENT regime label is the boundary.
 * If no different regime found in the 12h window, caps age at 12h.
 * If insufficient history (< minimum candles required), sets enteredAt=now
 * and emits structured warning. ONE-SHOT: only runs on first observation.
 */
backfillFromHistory(
  symbol: string,
  currentRegime: string,
  ohlcData: OHLCData[],   // most-recent-last
  dbsScore: number,        // current DBS as approximation
  now: number,
  windowsToWalk: number = 12,
  windowSizeMs: number = 60 * 60 * 1000,
): number {  // returns enteredAt (epoch ms)
```

**Modify** `tick()`:
- Add optional 4th + 5th params: `ohlcData?: OHLCData[]`, `dbsScore?: number`
- If no existing entry AND ohlcData present: call `backfillFromHistory`, use its return as `enteredAt`
- If no existing entry AND no ohlcData: existing behavior (`enteredAt = now`) — preserves test compatibility

#### **File 2:** `server/core/metrics/market-regime.ts:177-184`

**Replace** the TFS branch:

```typescript
} else if ((mom > 0.003 && dx > 50) || absDbs >= 0.30) {
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // B67.3.5: continuous mapping replaces step-function. Output [0.50, 0.90].
  // Multiplicative — any weak input collapses score (semantic match for
  // "trend-friendly STABLE" = all three should align).
  // Scales seeded from indicator threshold analysis; recalibrate post-window.
  const momScale = TFS_MOMENTUM_SCALE;     // module_constant resolved at module load
  const volScale = TFS_VOLATILITY_SCALE;
  const minBound = TFS_DESAT_MIN;
  const maxBound = TFS_DESAT_MAX;
  const momentum_factor = Math.max(0, Math.min(1, mom / momScale));
  const dbs_strength   = Math.max(0, Math.min(1, absDbs / 0.7));
  const vol_inverse    = Math.max(0, Math.min(1, (volScale - vol) / volScale));
  confidence = minBound + (maxBound - minBound) * (momentum_factor * dbs_strength * vol_inverse);
}
```

The 4 module_constants are resolved by MCE on startup and passed in via a new arg to `calculatePairRegime` OR read at module load with hard-fail. **Preferred:** new function signature param `regimeConfig: { tfsMomScale, tfsVolScale, tfsDesatMin, tfsDesatMax }`. This matches the existing pattern (we already added `macroModifier` as required param).

#### **File 3:** `server/services/market-context-engine.ts`

- Resolve 4 new constants in `refreshMacroContext` (or a new sibling `refreshRegimeConfig` if the resolution should run independently). Hard-fail on missing per §0.9.
- Add to MCE state: `regimeConfig: RegimeConfig | null`.
- Pass `regimeConfig` through to `calculatePairRegime`.
- Pass `ohlcData` and `dbs.score` through to `regimePhaseStore.tick()`.

#### **File 4:** `drizzle/migrations/2026-04-29-b67-3-5-tfs-desat.sql`

```sql
-- B67.3.5: TFS branch desaturation scales
INSERT INTO module_constants (key, value, ...) VALUES
  ('b67_3_5_tfs_desat_min',         0.50, ...),
  ('b67_3_5_tfs_desat_max',         0.90, ...),
  ('b67_3_5_tfs_momentum_scale',    0.020, ...),
  ('b67_3_5_tfs_volatility_scale',  0.025, ...);
```

(Pattern matches prior B67 migrations — populate all required columns: module, scope, version, etc.)

#### **File 5:** `server/tests/unit/b67-2-phase-dimension.test.ts`

Add 5 new test cases:
- Backfill: short history → fallback to `enteredAt = now` + warning
- Backfill: regime label same throughout 12h → enteredAt = now − 12h
- Backfill: regime label changes 5h ago → enteredAt = now − 5h
- Backfill: subsequent tick on already-backfilled pair → no re-backfill
- Persistence round-trip: backfilled entry survives a save/load cycle

#### **File 6:** `server/tests/unit/market-regime-tfs-desat.test.ts` (new)

- Strong-all-three pair (high mom, |DBS|=0.7, low vol) → confidence ≈ 0.90
- Moderate pair (mom=0.01, |DBS|=0.4, vol=0.012) → confidence in [0.60, 0.75]
- Borderline pair (mom=0.004, |DBS|=0.30, vol=0.020) → confidence in [0.50, 0.55]
- Edge: zero momentum → confidence = 0.50
- Edge: zero DBS → confidence = 0.50
- Edge: vol > vol_scale → confidence = 0.50
- Output bounds: never < 0.50, never > 0.90 from raw formula

### §B.2 Seed value derivation (per Langston Q5)

**Methodology used:** since live `regime_confidence_raw` distribution is empty (B67.2.1 columns are populated forward-only and few new closed trades since deploy), seeds are derived from existing threshold analysis in `market-regime.ts:157-165` plus B62 indicator distribution comments. Once the desat ships and 7-day data accrues, recalibrate via the methodology Langston prescribed (compute P50 of normalized momentum + volatility across TFS-classified pairs from the last 7d of VTS data).

**Derivation:**

| Constant | Seed | Reasoning |
|---|---|---|
| `b67_3_5_tfs_desat_min` | **0.50** | "Barely qualifies as TFS" floor per Langston Q2. Below this and it's not TFS. |
| `b67_3_5_tfs_desat_max` | **0.90** | Leaves room for B67.1×B67.2 chain (0.90 × 1.05 × 1.10 = 1.04 → clamps to 1.0) only on truly excellent setups. Per Langston Q2. |
| `b67_3_5_tfs_momentum_scale` | **0.020** | Existing TFS bonus (`Math.min(mom × 8, 0.15)`) saturates at mom = 0.01875. "Strong" momentum threshold in code = 0.005. Scale = 0.020 puts factor=1.0 at mom=0.020 (top decile per code comments), factor=0.5 at mom=0.010 (intra-day median trending), factor=0 at mom≤0. |
| `b67_3_5_tfs_volatility_scale` | **0.025** | Existing thresholds: quiet < 0.012, elevated > 0.020. TFS wants LOW vol → `vol_inverse = (scale - vol) / scale`. Scale = 0.025 puts vol_inverse=1.0 at vol=0, =0.5 at vol=0.0125 (between quiet and elevated bands), =0 at vol=0.025 (clearly elevated, would route HVU not TFS anyway). |

DBS denominator (`0.7`) is hardcoded in the formula because it's a dimensionless input range constant — DBS by spec is in [-1, +1], and 0.7 matches the existing "strong" threshold of |DBS| ≥ 0.50 + buffer to allow factor=1.0 at |DBS|=0.7 (top of typical strong-trend range). If Langston prefers it as a 5th constant (`b67_3_5_tfs_dbs_scale`), happy to add.

**Recalibration trigger:** if post-deploy 7d distribution shows P50 confidence outside [0.60, 0.80], recalibrate scales via psql query and `UPDATE module_constants` — no code change needed.

### §B.3 Order of operations (Step 3)

1. Migration SQL (4 module_constants seeds)
2. `regime-phase.ts` — add `backfillFromHistory` method + augmented `tick` signature
3. `market-regime.ts` — replace TFS branch, add `regimeConfig` param to `calculatePairRegime` signature
4. `market-context-engine.ts` — resolve 4 constants in refresh, pass into classifier + phase store
5. Update existing callers of `calculatePairRegime` (3 sites: `diagnostic-11.4G.ts`, 2 unit tests) to pass a default `regimeConfig` or use a test helper
6. Update existing callers of `regimePhaseStore.tick` — only MCE calls it in production; new optional params backwards-compatible
7. New test file + augmented existing test file
8. `npm run check` — TypeScript clean
9. `npm test` — all green
10. Local commit + push (Step 4 = Langston code review BEFORE push per workflow)

### §B.4 Risks I'm explicitly accepting

- **DBS approximation in backfill:** Langston-approved per cc-inbox #850 Q2.
- **No retroactive update of old paper_sim_trades rows:** rows that opened before this deploy keep their old confidence values. New rows reflect new formula. Acceptable — calibration window only counts new trades anyway.
- **Other 4 regime branches still saturate:** scope explicitly defers; `RUNNING_ISSUES.md` entry tracks.
- **Cold-start adds ~1s to MCE init:** no SLA on init time; not user-facing.

### §B.5 Rollback plan

If post-deploy distribution looks pathological:
1. Revert via DB only: `UPDATE module_constants SET value=<old> WHERE key='b67_3_5_*'` — emergency parameters can shift formula behavior but cannot fully restore step-function. For full rollback:
2. `git revert <commit>` and redeploy. Module_constants seeds remain (harmless — unused after revert). Drop migration with a follow-up DELETE if desired.

Persistence file `/tmp/regime-phase-store.json` retains backfilled `enteredAt` values across rollback — those are still valid (they're closer to truth than the original `enteredAt=now` behavior). Rollback of phase-store changes is purely a code revert; persisted data stays.

---

## §C. Open questions for Langston (Step 2 review)

1. **DBS denominator (`0.7`) hardcoded vs 5th `module_constant`** — see §B.2 final paragraph. Hardcoded matches the dimensionless nature; constant matches the §0.9 governance rule strictly. Lean?

2. **`regimeConfig` as new function parameter vs. module-load read with hard-fail** — same tradeoff as `macroModifier` got: passing in is more testable, module-load read is cleaner at call site. I leaned toward parameter to match existing pattern. Agree?

3. **Backfill applies on cold pair OR on regime transition too?** Currently planning first-observation only. If a pair transitions TFS → ST → TFS, the second TFS entry stamps `enteredAt = now` (correct — it just transitioned). Backfill is for cold-start only. Agree, or do you want backfill on every regime entry?

4. **Should the seed values go in via a separate "seeds verification" step before code lands, where we deploy migration + query distribution + adjust seeds before code changes ship?** Adds a day. Or ship code + seeds together and recalibrate via DB UPDATE post-deploy as needed?

5. **Anything missing or wrongly scoped?**

---

*End of B67.3.5 pre-audit. On Langston approval, proceed to Step 3 implementation.*
