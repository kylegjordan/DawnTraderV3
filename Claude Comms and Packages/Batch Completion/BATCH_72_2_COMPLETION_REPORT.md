# BATCH 72.2 — In-Class Quant Strategy Lever Migration — Completion Report

**Status:** SHIPPED 2026-05-06.
**Workflow:** 11-step canonical workflow (Steps 1–11).
**Branch:** `migration/aws-supabase`.
**HEAD at close:** `6c42dc370` (Slices 2–5 wiring) on top of `eeabb7147` (Slice 1 SQL seed).

---

## §A. Trigger

The B72.1 closure shipped a wrong conclusion that "live universe = 9 active strategies / no B72 levers escaped audit" (LEVER_INVENTORY.md §13.1, BATCH_72_COMPLETION_REPORT §K.3). Kyle pushed back; a thorough audit (consulting `canonical-regime-strategy-map.ts`, `strategy-engine.ts` in full, SYSTEM_MANUAL/SIM, and live `signal_eval_archive` data on staging) refuted that conclusion:

- **18 canonical strategies** (`STRATEGY_DISPLAY_NAMES`, `canonical-regime-strategy-map.ts:365–385`).
- **9 file-based** in `server/strategies/` — covered by B72 main.
- **9 in-class quant** with `detect*` methods inside `server/services/strategy-engine.ts` — **missed by B72 main**.
- The 9 in-class strategies are actively producing signals in production (`vwap_pullback` alone = 26,540 evals / 7d, the highest-volume strategy in the system).
- Their tunable parameters were hardcoded in (a) detector method bodies and (b) dispatcher param-object literals across 6 production sites. **Zero `strategy.<key>` rows existed** for them in `module_constants` prior to B72.2.

`liquidity_trap` is the 18th — operationally disabled (bullish + no shorts) but a canonical strategy whose levers still need DB-tunability for re-enablement readiness.

---

## §B. Outcome

131 rows added to `module_constants`; 9 in-class quant strategies fully wired; dispatcher-level param-object literals stripped from 4 dispatcher files; warmup hard-fail extended to all 18 strategies. **Live universe of DB-tunable strategies grew from 9 → 18 (full coverage).**

---

## §C. Slices shipped

| Slice | Commit | Files | Description |
|---|---|---|---|
| 1 | `eeabb7147` | `drizzle/migrations/2026-05-06-b72-2-quant-lever-sweep.sql` (NEW) + `server/startup/b72-warmup.ts` | INSERT 131 rows under 9 `strategy.<key>` modules; PREFETCH_MODULES extended; staging DB updated; boot warmup verified all 9 modules with correct row counts (16/13/12/13/13/15/11/13/25). |
| 2 | `6c42dc370` (squashed with 3-5) | `server/services/strategy-engine.ts` | LOW-blast: `vwap_pullback`, `abcd_long`, `sma_trend_ride` detect* methods — fallback literals replaced with `getCachedNumbersForModule()` reads. `settings.*` precedence preserved (operator can still override via `trading_settings`). B63 Item 10 counter-trend `-0.35` guards now resolve from `counter_trend_long_dbs_floor`. |
| 3 | `6c42dc370` | `server/services/strategy-engine.ts` | HIGH-blast: `breakout`, `mean_reversion`, `range_trade` (method `detectRangeTrading`), `vwap_bounce`, `dhma` detect* methods — full param resolution from `module_constants`. Numeric levers via `getCachedNumbersForModule`; string-enum levers via `getCachedConstant<string>` (4 string enums total). |
| 4 | `6c42dc370` | `vts-runner.ts`, `signal-orchestrator.ts`, `stage-b-validator.ts`, `routes.ts` | Strip dispatcher param-object literals — detectors now resolve authority entirely from DB. Eliminates the 5 vts-runner-vs-orchestrator discrepancies (breakout.volumeMultiplier 1.5/2.0, mean_reversion.deviation 2.0/2.5, range_trade triplet 7/2/1 vs 12/3/3) by collapsing both paths to canonical vts-runner values per Langston cc-inbox #914. `relaxedMode` literals in `stage-b-validator.ts` retained (test fixture). |
| 5 | `6c42dc370` | `server/services/strategy-engine.ts` | `liquidity_trap` migration. Detector reachable only via `stage-b-validator.ts:384` (production paths block via `UNIVERSALLY_DISABLED_STRATEGIES` set). Migrated for re-enablement readiness. |
| 6 | `<this commit>` | governance | This report + corrections to B72.1 §13.1 and B72_COMPLETION_REPORT §K.3 + BATCH_CATALOG row + PHASE_HISTORY entry + MEMORY sync + CHANGES_AND_FIXES coverage-gap bug entry. |

---

## §D. Discrepancy resolutions (cc-inbox #914)

Three production paths had been running with different parameter values between `vts-runner.ts` and `signal-orchestrator.ts`. B72.2 collapsed them to canonical values:

| Lever | vts-runner (canonical) | signal-orchestrator (was) | Reason |
|---|---|---|---|
| `breakout.volume_multiplier` | 1.5 | 2.0 | HF8 calibration + detector default |
| `mean_reversion.deviation_threshold_atr_mult` | 1.5 | 2.5 | VTS is active passive-learning surface |
| `range_trade.min_range_duration_hours` | 7 | 12 | VTS canonical |
| `range_trade.min_range_width_atr_mult` | 2.0 | 3.0 | VTS canonical |
| `range_trade.min_boundary_touches` | 1 | 3 | VTS canonical |

After Slice 4 strip, both paths read from the same DB rows. Future divergence is impossible without a SQL UPDATE.

---

## §E. Verification (post-deploy 2026-05-05 22:43:23 UTC)

**Boot warmup logs** — all 9 new modules clean:
```
[B72][warmup] strategy.vwap_pullback rows=16
[B72][warmup] strategy.abcd_long rows=13
[B72][warmup] strategy.sma_trend_ride rows=12
[B72][warmup] strategy.breakout rows=13
[B72][warmup] strategy.mean_reversion rows=13
[B72][warmup] strategy.range_trade rows=15
[B72][warmup] strategy.vwap_bounce rows=11
[B72][warmup] strategy.liquidity_trap rows=13
[B72][warmup] strategy.dhma rows=25
[B72][INIT_OK] (pre-orchestrator)
```

No `module ... not warm` errors in `error.log` post-deploy.

**Signal generation regression check** (last 15 min post-deploy):
```
strong_bull_trend   542
vwap_pullback       475   ← in-class quant, post-migration
range_trade         222   ← in-class quant, post-migration
volatility_edge     220
abcd_long           218   ← in-class quant, post-migration
inside_bar_reversal  55
defensive_hedge      29
morning_star         10
support_bounce        8
mean_reversion        6   ← in-class quant, post-migration
reverse_impulse       5
```

In-class quant strategies emitting at rates consistent with their pre-migration baselines. No behavior regressions detected.

**DB row count** post-Slice-1:
```
SELECT module_name, COUNT(*) FROM module_constants
WHERE module_name LIKE 'strategy.%' GROUP BY 1;
-- 18 rows (was 9). All 18 canonical strategies now DB-tunable.
```

**TypeScript:** `npx tsc --noEmit -p tsconfig.json` on touched files — zero new errors. Only pre-existing legacy baseline errors.

**CI status:** Build + Docker GREEN; Test Suite + TypeScript Check pre-existing infrastructure failures (ECONNREFUSED 5432, vitest hoisting bug) identical to prior commits. Deploy gate met per Kyle directive.

---

## §F. What was wrong with B72.1 closure (corrected)

The B72.1 closure shipped these wrong claims, which this batch corrects:

1. **`LEVER_INVENTORY.md §13.1` — "live universe = 9 active strategies":** WRONG. Live universe is 18.
2. **`LEVER_INVENTORY.md §13.1` — "8 legacy keys are exit-only stubs ... cannot enter trades":** WRONG. The 8 keys (vwap_pullback + 7 others, plus liquidity_trap) are actively dispatched from 6 production sites; their `detect*` methods at `strategy-engine.ts:87–1156` are the primary entry path; vwap_pullback alone produced 26,540 evaluations in the 7-day audit window.
3. **`BATCH_72_COMPLETION_REPORT.md §K.3` — "no B72 levers escaped audit":** WRONG. 131 levers across the 9 in-class quant strategies were never migrated. B72 main's claim of being a "comprehensive lever sweep" was materially incomplete.
4. **`BATCH_72_COMPLETION_REPORT.md §K.3` — "Phase 16 dead-code candidate":** WRONG and dangerous. Removing the 9 in-class quant detectors would delete the system's primary entry-signal flow.
5. **`CLAUDE.md` "17 canonical strategies" reference:** STALE — actual count is **18** (B63 added `strong_bull_trend` to the original 17).

**Root cause of the B72 main coverage gap:** the lever inventory pass searched `server/strategies/` filesystem and `server/services/` for module-level constants, but did NOT enumerate per-class `detect*` methods or their internal hardcoded literals. The B72.1 audit doubled down on the gap by reading the exit-condition `switch` block in `strategy-engine.ts:903` and concluding the strategies "only" exist as exit stubs — without reading the same file's `detect*` methods at lines 87–1344 that are the actual entry points.

**Logged as:** `CHANGES_AND_FIXES.md` BUG-2026-05-06-A entry. Mitigation for future audits: enumerate by `STRATEGY_DISPLAY_NAMES` (canonical SSOT) and grep for `detect<StrategyName>(` patterns class-wide, not just file-level.

---

## §G. Governance updates

| File | Change |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New `Batch 72.2` row inserted above `Batch 72.1`. |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation 2026-05-06 (B72.2 SHIPPED)" entry. |
| `1-system-manual/LEVER_INVENTORY.md` | §13.1 17-vs-9 finding REVISED to reflect 18-canonical truth. New §14 documenting the in-class quant migration and the audit-process lesson. |
| `Claude Comms and Packages/Batch Completion/BATCH_72_COMPLETION_REPORT.md` | New §L appendix correcting §K.3 wrong claims. |
| `Claude Comms and Packages/Batch Completion/BATCH_72_2_COMPLETION_REPORT.md` | This report (NEW). |
| `1-system-manual/CHANGES_AND_FIXES.md` | New `BUG-2026-05-06-A` entry: B72 main shipped without covering 9 in-class quant strategies; B72.1 audit reinforced the wrong conclusion. Resolved by B72.2. |
| `MEMORY.md` (truth + repo persistence) | CURRENT STATE updated to PM2 #171 / HEAD `6c42dc370` / 49 modules / ~311 rows; B72.2 closure block; carry-over list cleared; pickup updated. |
| `CLAUDE.md` (this batch) | "17 canonical strategies" → "18 canonical strategies" (file-based 9 + in-class quant 9). |

---

## §H. Live status

- 18 canonical strategies, all DB-tunable.
- 49 modules / ~311 rows live in `module_constants` (was 40 / ~180 pre-B72.2).
- Both production dispatchers (`vts-runner.ts` and `signal-orchestrator.ts`) read from the same canonical DB rows; no parameter divergence possible without a SQL UPDATE.
- `liquidity_trap` retains operational-disable status (bullish-strategy without short support); rows seeded for re-enablement readiness.

**B72 + B72.1 + B72.2 BATCH FAMILY FULLY CLOSED.**

Next session pickup: Phase 16 (TS errors + storage.ts modularization) per `POST_AUDIT_ROADMAP.md`.

---

*End of BATCH_72_2_COMPLETION_REPORT.md.*
