# B-PATTERN-ENUM-DRIFT — SCOPE (hotfix path) · r2 2026-10-02 ~21:45Z: TRI_STAR added (Kyle)

change-class: hotfix

**Issue:** `#1063` · **Plan row:** `PHASE_19_PLAN` 3m-ENUM (sprint row 51) · **Owner:** CC-B (NEW Claude) · **Directed by:** Kyle, 2026-10-02 (~21:20Z): *"Please pull the pattern-name fix forward."* · **Rides:** deploy B (not before Monday 2026-10-05), as migration 10.

## 1. The qualifying test (`workflow-hotfix` §1) — all three hold

| # | test | answer |
|---|---|---|
| 1 | **Broken now** | Yes. Every pattern-confirmed `volatility_edge` signal fails the position insert: `invalid input value for enum pattern_type: "ABCD"`. Since deploy A's restart (2026-10-02T20:37:49Z) it is the only thing reaching promotion: 26 passes 20:38Z-20:52Z, 20 `promoted=0, failed=1`, 6 empty, `remainingSlots=9`; all 20 failures `QNT/USD` ABCD; zero exposure refusals in that window against 300 in the 2.5 h before (`#1063` amendment, `852335a8d`). Paper opens: 1 on 10-02, 2 on 10-01, against 4-9 a day the week before. |
| 2 | **Waiting causes real harm** | Kyle directed it (he owns the urgency call). Independently: deploy B's sizing change is expected to loosen the exposure jam, so an unfixed ABCD becomes a larger share of what blocks paper opens; and each failure is re-minted every cycle (`#1136`). |
| 3 | **Blast radius small and proven** | §3 below. One enum value added; no row rewritten; every reader already typed for it. |

## 2. Entry path — PATH A: the defect is already a finding of a completed audit
**Cited, not repeated:** `RUNNING_ISSUES` `#1063` (2026-09-13), with Langston's census and ruling re-derived at `0ea7ead5b`:
- the declared union `shared/schema.ts:111` holds six values incl. `ABCD`; the database holds five (`2026-04-22-initial-schema.sql:707`, live `pg_enum`);
- scope requirement (i) discharged: `normalizePatternToCanonical`'s output set is `PINBAR|ENGULFING|MORNING_STAR|ABCD|TRI_STAR|INSIDE_BAR|null`, and on the **reachable** population exactly one value is unstorable, `ABCD`;
- the ruling: *"an ITEM, not a batch … If it has fired ⇒ a one-objective `ALTER TYPE … ADD VALUE` rider."* **It has fired** — CC-C counted 392 / 1,212 / 2,486 / 1,245 failures a day on 09-14 → 09-17 (`#1063`, 2026-09-18), and the 2026-10-02 counts are above.
- **Outcome (1) add the value, not (3) canonicalize away:** canonicalize-away is a four-site change (`canonical-regime-strategy-map.ts:310`, `hybrid-compatibility-registry.ts:18`, `signal-orchestrator.ts:2965`, `volatility-edge.ts:264`) plus a second live producer (`selectContextAwareStrategy:860`), **and it would relabel a harmonic measured-move as a candlestick** (Langston, `#1063` (b)). `ABCD` is a pattern label of `volatility_edge` (HYBRID), separate from the QUANT strategy `abcd_long` (`bridge/canonical/DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md:20,:25`).

## 3. Blast radius — measured 2026-10-02
- **What the change writes:** one enum label on type `pattern_type`. `ADD VALUE` rewrites no rows and takes a brief lock on the type.
- **Who uses the type (staging, `information_schema.columns`):** `active_open_positions.pattern_type`, `closed_trades.pattern_type`, `trades.pattern_type` — three columns. **Views or rules depending on the type: 0** (`pg_depend` over `pg_rewrite`).
- **Who reads it (§9.5(a-ii)):** no raw SQL names `pattern_type` outside `shared/schema.ts` (`git grep` over `server`, `shared`, `client/src`, tests excluded — positive control: `schema.ts` itself returns four hits). All access is through the drizzle column, whose TypeScript type already includes `ABCD`, so every typed reader (63 lines naming `.patternType`; the row readers display it or pass it through — `vts-*-trades-table.tsx`, `paper-trade-adapter.ts`, `vts-runner.ts`, `export-csv.ts`) is already compiled against the value. **No `switch` on a pattern type and no `Record<…PatternType…>` exists** (`git grep` over the same trees, empty; control: the same `switch (` pattern finds 2 in `active-execution-engine.ts`).
- **Other sites with the same defect (fix the class):** on the reachable population, none (requirement (i) above). **`TRI_STAR` is the same gap, latent:** in the canonical pattern set (`canonical-regime-strategy-map.ts:79`, `:774`, and `DOJI → TRI_STAR` at `:778`) and routed to `adaptive_flow` (`hybrid-integration.ts:225`), but in neither the `pgEnum` nor the database; **0 insert failures 2026-09-19 → 10-02 against 22,368 for `ABCD`** (control). ⭐ **IN SCOPE BY KYLE'S RULING (r2, 2026-10-02):** *"It may be unlocked as we calibrate, and if/when that happens, it shouldn't be blocked by a known error we couldn't be bothered to fix when we fixed the same issue for another pattern."* **`THREE_SOLDIERS`** is a DB value the canonicaliser can never write — a data question, no work.
- **Runner:** `scripts/db-migrate.ts` runs a file as one `client.query`; a single-statement `ALTER TYPE … ADD VALUE IF NOT EXISTS` runs standalone, as the precedent `2026-05-24a-b79-0n-strategy-enum-orb.sql` did.
- **Larger design fault?** Only that nothing compared the declared enum with the migrations. The guard test below closes that for `pattern_type`; a general schema-vs-database enum reconciler was explicitly NOT to be built without a measured population (Langston, `#1063`).

## 4. The fix
1. `drizzle/migrations/2026-10-02-b-pattern-enum-drift-abcd.sql` — `ALTER TYPE pattern_type ADD VALUE IF NOT EXISTS 'ABCD';` **and the same for `'TRI_STAR'`** (idempotent; PostgreSQL 12+ allows `ADD VALUE` in a transaction block as long as the value is not used before commit; CI applies every forward migration to a PostgreSQL 17 container), registered last in `MANIFEST.txt`.
1b. **`shared/schema.ts:111`** — `TRI_STAR` added to the declared `pgEnum` (the one code line). The column's TypeScript type widens by one value; the TypeScript baseline gate reads **339 errors against a baseline of 339**.
2. `…-abcd-rollback.sql` — **clears the ledger row only.** PostgreSQL cannot drop an enum value; removing it would rebuild the type and rewrite three columns. Leaving the value is safe on every earlier sha, because their code already declares `ABCD`.
3. `server/tests/unit/b-pattern-enum-drift.test.ts` — every value in the declared `pgEnum("pattern_type", …)` must be created by the initial `CREATE TYPE` or a registered forward `ADD VALUE`. **Mutation-proved:** with the migration unregistered, 3 of 4 tests fail; with only the `TRI_STAR` statement removed, 2 of 4 fail; the positive control (the initial five are seen) passes either way.
**No behaviour code changes; one declaration line.**

## 5. Where it ships, and what it splits
- **Deploy B, as migration 10** (after the VTS valve's migration 9). Undo order for B becomes **10, 9, 8, … 3**; this one's rollback is ledger-only.
- **It admits a class of opens that cannot open today** (pattern-confirmed `volatility_edge`). Deploy B is already a declared population boundary for every open window (sizing change + `PAPER-RESET-3000`), so this adds no new boundary. **Recorded for the excursion ratchet (`PHASE_19_PLAN` 2.4g-3):** do not pool pre- and post-B excursions — already required there.
- **Observation windows `#1063` (iii) named:** `B-XSTOCK-FEE-CONTRACT` P8/Arm B — closed 2026-10-02 before this ships; `B-GEOMETRY-REACH-BASELINE` — ruled unaffected 2026-09-13 and closed; F-G-2's re-open anchor — CC-C's, and B is already a boundary for it.

## 6. Out of scope, with homes
- **`THREE_SOLDIERS`** (a DB value the canonicaliser can never write — a data question) stays on `#1063`, `HOME: B-PATTERN-ENUM-DRIFT remainder, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 51, after this hotfix`. (`TRI_STAR` moved into scope at r2.)
- **The re-mint loop itself** — `#1136`, row 9j. This fix removes its ABCD driver; the exposure driver remains.

## 7. Verification after deploy B — the same instruments that showed the defect
- `error.log`: `trade_insert_err … pattern_type: "ABCD"` count after B's restart = **0**, against 352 on 10-02 (the control is the pre-B day).
- The first pattern-confirmed `volatility_edge` open after B appears in `active_open_positions` / `closed_trades` with `pattern_type = 'ABCD'` (until one is promoted, "no failures" is unexercised, not a pass).
- `pg_enum` lists `ABCD` for `pattern_type`.
