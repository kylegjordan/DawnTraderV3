# B-DB-REGIME-ENUM-ALIGN — SCOPE

change-class: architecture
owner: CC-C (ANALYST Claude) · issue: `#1263` (KD-110; PM placement msg `1574016382264410243`, Langston NO-FOLD concurrence `1574017595747598528`) · status: STEP 1 of 11
priority: gap work — yields to row 2 (C-P5) and the B-XSTOCK-BAR-AVAILABILITY reads.

⚠️ **`#1263`, KD-110 and KD-111 are not yet at the ref** (Langston, `1574017595747598528`: not at `f0c3083d5`; re-checked at `f7593fe4d`, still absent). The plan-row cell edit (SPRINT_TO_LIVE_PLAN §4) lands in the commit after PM pushes them; this scope does not invent the row.

---

## 0. What the batch is for (plain language)

The database has a fixed list of regime names it will accept for its two learning tables. That list is out of date: the live database accepts only six names the trading system stopped using in March, while every regime the system produces today (the five canonical regimes) would be **refused** the moment those tables are written. Today nothing writes them, because writing is switched on only in live mode. **The batch makes the database accept today's five regime names, fixes the one writer that would send a blank regime, and clears out the code and documents built around the old list, so the first live-mode session does not fail on its first telemetry write.**

---

## 1. Kyle's condition — regime, strategy and pattern, delineated

Kyle: *"make sure ... that you understand all the regime names and the strategies that are matched to them ... and the patterns ... because there's overlap between regime names, pattern types, and strategies."*

Three different kinds of name, never interchangeable. Source: `server/config/canonical-regime-strategy-map.ts` at `f7593fe4d`.

**(a) REGIMES — five canonical (`REGIMES`, :495).** A regime is a description of the market a symbol is in. It is the ONLY kind of name this batch writes to the database.

| regime | strategies mapped to it (strategyKey · signalType · patternType) |
|---|---|
| TREND_FRIENDLY_STABLE | vwap_pullback · QUANT · — · morning_star · PATTERN · MORNING_STAR · pivot_shift · HYBRID · MORNING_STAR · strong_bull_trend · QUANT · — (lane-routed) |
| HIGH_VOLATILITY_UNSTABLE | mean_reversion · QUANT · — · reverse_impulse · HYBRID · PINBAR · defensive_hedge · HYBRID · ENGULFING · inside_bar_reversal · PATTERN · INSIDE_BAR |
| RANGE_BOUND_STABLE | range_trade · QUANT · — · support_bounce · PATTERN · PINBAR · abcd_long · QUANT · — · adaptive_flow · HYBRID · TRI_STAR |
| IMPULSE_EXPANSION | sma_trend_ride · QUANT · — · breakout · QUANT · — · vwap_bounce · QUANT · — · volatility_edge · HYBRID · ABCD · dhma · QUANT · — · strong_bull_trend · QUANT · — · orb · QUANT · — |
| STRUCTURAL_TRANSITION | liquidity_trap · QUANT · — · pivot_shift · HYBRID · MORNING_STAR · morning_star · PATTERN · MORNING_STAR · orb · QUANT · — |

(Per-class membership — `defensive_hedge` crypto-only, `orb` xStock-only — comes from `ASSET_CLASS_OVERRIDES` in the same file; this table is the base map.)

**(b) STRATEGIES — strategyKey.** A strategy is a trading rule. Some appear under two regimes (morning_star, pivot_shift, strong_bull_trend, orb). **No strategy name is written to the regime column.**

**(c) PATTERNS — `CanonicalPatternType` (:73): PINBAR, ENGULFING, INSIDE_BAR, MORNING_STAR, ABCD, TRI_STAR.** A pattern is a candle shape a strategy may require. `PATTERN_TO_CANONICAL` (:769) folds detector names into these six (EVENING_STAR and THREE_SOLDIERS → MORNING_STAR; DOJI → TRI_STAR; HAMMER, SHOOTING_STAR → PINBAR).

**The overlaps that cause confusion, named so the batch never crosses them:**
1. `IMPULSE_EXPANSION` is a **regime**; `reverse_impulse` is a **strategy** that lives under HIGH_VOLATILITY_UNSTABLE, not under IMPULSE_EXPANSION.
2. `INSIDE_BAR` is a **pattern**; `inside_bar_reversal` is the **strategy** that requires it.
3. `MORNING_STAR` is a **pattern** AND `morning_star` is a **strategy**; `pivot_shift` also requires the MORNING_STAR pattern.
4. `ABCD` is a **pattern** required by `volatility_edge` (HYBRID); `abcd_long` is a separate **QUANT strategy with no pattern** — the name does not mean it uses the ABCD pattern.
5. `TRI_STAR` is a pattern used only by `adaptive_flow`.
6. `STRUCTURAL_TRANSITION` (regime) is the fallback for any unrecognised label (`normalizeRegime`, :655, via the ten-entry `GHOST_REGIME_NORMALIZATION`); the old literal `TRANSITION` is **not** a regime any more.
7. The six old labels still in the live enum (EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP) are **old regime names**, not strategies or patterns.

---

## 2. Objectives (each with its PROOF line, written before any data)

**OBJ-1 — The live database accepts all five canonical regime names in `market_regime`.**
PROOF: `dt-sql` read of `pg_enum` for `market_regime` on staging after deploy. PASS = the five canonical labels present (old six may remain, see OBJ-5). FAIL = any canonical label absent. Control: the same read before deploy returns the six old labels only (measured 2026-11-22: EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP).

**OBJ-2 — The one reached writer never sends an undefined regime.** `telemetry-aggregator.ts:284` falls back to `REGIMES.TRANSITION`, a key removed from `REGIMES` at `5bfa63bd1` (2026-03-05) — so the fallback evaluates to `undefined` into a `NOT NULL` enum column (`schema.ts:1032`). The writer normalizes through `normalizeRegime` (or refuses and logs) — design chosen at Step 2.
PROOF: unit test at the ref: a telemetry entry with no `pairRegime` persists a canonical label; a ghost label persists its normalized canonical label. PASS = both. FAIL = undefined, a ghost label, or a throw that drops the batch.

**OBJ-3 — A real canonical insert succeeds on staging (Langston condition 1, `#661` leg 3).** Writing is gated by `shouldPersist()` (`telemetry-repository.ts:129`: `mode==='live' || FORCE_PERSIST`). One bounded staging run with `FORCE_PERSIST=true`, then switched back off.
PROOF: `dt-sql` count of `telemetry_history` rows with a canonical regime and `mode='paper'` written in the window, AND the `pg_stat_user_tables.n_tup_ins` counter for `telemetry_history` moving from its pre-run value (measured 2026-11-22: 0 live rows, 0 inserts; `adaptive_learning` the same). PASS = ≥1 row, every row's `mode` = the real mode (11.1A1: never relabelled live). FAIL = zero rows with the instrument shown able to see one, or any row labelled live.

**OBJ-4 — The declared types agree with the database.** `shared/schema.ts:1013` declares twelve labels while the live enum holds six; `HIGH_VOL_IMPULSE` appears in neither the canonical map nor the live enum. Schema, MANIFEST migration and live DB end on one list; `HIGH_VOL_IMPULSE` is normalized, not stored. The stale header claim at `telemetry-repository.ts:21-24` (*"all names now in DB enum"*) is corrected.
PROOF: tsc at the ref with the two `.tsc-baseline.json` entries for this defect removed (telemetry-aggregator TS2339 `TRANSITION` ×1, TS2322 ×1, TS2345 ×3; adaptive-learning-repository TS2322 ×1) and CI 4/4. PASS = green with the entries gone. FAIL = any of them still needed.

**OBJ-5 — Every left-over piece gets a disposition (Langston condition 2).** The six old labels: Postgres cannot drop an enum value in place; they stay, recorded as *left intentionally* in `DELETED_COMPONENTS_LOG.md` §15, and every route that passes a regime string into a filter is validated against the canonical five. Dead 11.1A/B code (`rehydrateTelemetryState` :780, `rehydrateAdaptiveLearning` :828, `persistAdaptiveLearning` :862 — 0 callers each at the ref) gets its rule-18 disposition at Step 2.
PROOF: the log entry at the ref + a census (git grep, tests excluded) showing each regime-filtered read normalizes or validates its input. PASS = every reader listed with its guard. FAIL = a reader passing an unvalidated string.

**OBJ-6 — The documents say what the code does.** System Manual: the enum table (~:11299) and the two "Active" statuses that the code contradicts (DynamicSizingEngine :3836/:4542 — its sizing function has no production caller, only the `/dse/status` and `/dse/history` diagnostics route; adaptive-learning repository §11 :6826). System Impact Map §7.6 (~:866): "pairTelemetry remains DB-backed only" and "Downstream: Adaptive Ratio Manager" (removed at `e3a22c15a`).
PROOF: the diff at the ref. PASS = each named line corrected to a measured statement. FAIL = any left.

**OBJ-7 — Deploy-window call stated (Langston condition 3).** Expected: no `DEPLOY_WINDOWS` row needed (KD-56) — the migration adds enum values and changes no trading behaviour; stated with its reason in the Step-2 commit.

---

## 3. 1.a — Architectural read (per component)

| component | SIM | System Manual | note |
|---|---|---|---|
| `market_regime` enum + `telemetry_history`, `adaptive_learning` | read | §11 tables :11149-11150, enum :11299 (six old labels), migration :11348 | SM :2967 already records *"telemetry_history … holds zero rows and always has — writes are fenced by shouldPersist()"* — confirmed 2026-11-22 (0/0). |
| `telemetry-aggregator.ts` (writer, reached from VTS runner :4437/:6164) | §7.6 ~:866 — stale (above) | — | fallback defect OBJ-2 |
| `telemetry-repository.ts` (`shouldPersist`, `toDBRegime`) | §7.6 | §11 | `toDBRegime` (:63) maps the literal `'TRANSITION'` but never sees it — the caller passes `undefined` |
| `adaptive-learning-repository.ts` | §7.6 | §11 :6826 "Status: Active" | regime-filtered reads `eq(adaptiveLearning.regime, regime)` at :59, :90, :134, :210 |
| `dynamic-sizing-engine.ts` | — (silence = gap, flagged) | :3836, :4542 "ACTIVE" | imports `loadAdaptiveWeights`; diagnostics route `routes/dse.ts` only |
| `canonical-regime-strategy-map.ts` | read | regime chapter | the authority for §1 |

## 4. 1.b — Provenance read

- **Intent (tier 1, verbatim):** `2bc1b5d1d` (2026-01-10) *"Update system to correctly record and query trading regimes and scores — Refactor telemetry recording and querying to use consistent market regime types and ensure VTS is the single source of truth for trading data."* Directives 11.1A / 11.1A1 (header of `telemetry-repository.ts` at the ref): persistence is live-only; `FORCE_PERSIST` enables writing but *"never relabels data as 'live'"*; rehydration loads only true live records.
- **The break (verbatim):** `5bfa63bd1` (2026-03-05) *"Update trading regime definitions and analytics display — Refactors market regime definitions in JSON and TypeScript … to reflect new regime names and schemas."* It removed `TRANSITION: 'TRANSITION'` from `REGIMES`, leaving the fallback added at `8c40fc6d5` (2026-01-23) dangling. The Phase-14 / Batch-15 header in `telemetry-repository.ts` claims the DB enum was expanded — the live database shows it was not (the MANIFEST lane's `2026-11-1A-persistent-intelligence.sql` and baseline `2026-04-22-initial-schema.sql:534` hold the old list; the dead `migrations/` lane is frozen, `#1006`).
- **Why it stayed hidden:** `.tsc-baseline.json` lists the exact type errors, so CI passes over them; and the only writer runs in live mode, which has never run.
- `bridge/canonical/`: NOT RE-READ for this scope — to be consulted at Step 2 for 11.1A intent.

**Dispositions (the five):** enum + schema + writer → **(2) relevant, update to today's intent**. Old six labels → **(5) stay disconnected, left intentionally** (cannot be dropped in place). Dead rehydrate/persist methods → **(4)/(5) decided at Step 2 with Langston**; reconnecting live-mode rehydration would be new capability not on Kyle's list. DynamicSizingEngine → documents corrected here (OBJ-6); any deletion is a proposal for Kyle's list, not folded.

## 5. Already decided / already exists

`#1006` (dead `migrations/` lane frozen) — cross-referenced, not reopened. ARM removal `e3a22c15a` — fixed point. Leftover strategy-name and passive/learning enum values elsewhere → Kyle's after-live list (PM, KD-110), out of scope.

## 6. Load-bearing claims not routed to a second reader — `NOT RE-READ`

- "no regime-filtered read is reachable in production" (census of `getAdaptiveLearningStats` / `loadAdaptiveWeights*` callers) — Step 2 re-derives it with a full entry-point enumeration.
- "the fallback evaluates to `undefined`" — from `REGIMES` at :495 lacking a `TRANSITION` key plus the baseline's TS2339 entry; not executed.
