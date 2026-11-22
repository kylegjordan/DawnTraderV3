# B-DB-REGIME-ENUM-ALIGN — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · owner: CC-C (ANALYST Claude) · issue `#1263` · `STEP: 2 of 11`
Scope: `B_DB_REGIME_ENUM_ALIGN_SCOPE.md` (Step 1 PROCEED with A1–A4 and calls 1–3, Langston msg `1574052660531695717`).
All `path:line` read at `origin/migration/aws-supabase` (`f7593fe4d`/`603377f0e` era; lines re-read 2026-11-22).

---

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED (scope) | NOW | REASON |
|---|---|---|---|
| 1 | OBJ-2: the `:284` fallback evaluates to `undefined` and is the reached failure | The fallback is **unreachable**. `:261` sets `pairRegime: data.pairRegime ?? this.currentRegime`, and `currentRegime` is initialised to `RANGE_BOUND_STABLE` (`:134`) and never changed (`updateMarketRegime` `:761` has no caller — F3). So every write carries a label. **The real first-write failure is the database refusing the canonical label (OBJ-1).** | Langston A1, re-derived at the ref (F1) |
| 2 | §0: the first live session "fails on its first telemetry write" | The write is refused, then **caught and logged** (`persistTelemetryAsync` try/catch → `console.error`). Trading continues; **every telemetry write is lost, loudly in the log, silently to everything else.** | A1 wording ruling |
| 3 | OBJ-4: six `.tsc-baseline.json` entries are this defect | **Ten**: aggregator TS2322 `:261` ×1, TS2339 ×1, TS2345 ×3; adaptive-learning TS2769 ×4 (`eq(adaptiveLearning.regime, regime)` at `:59`, `:90`, `:134`, `:210`), TS2322 `:154` ×1. Aggregator TS2322 `:1597` (FX5 object) is **not** this defect and stays. | F5, every site read |
| 4 | Scope §1: `HIGH_VOL_IMPULSE → IMPULSE_EXPANSION` entry location implied `:630` | `canonical-regime-strategy-map.ts:632` | F4 |
| 5 | OBJ-3: "one bounded staging run with `FORCE_PERSIST=true`, then switched back off" | **A one-shot script process** on the deployed batch build, with `FORCE_PERSIST=true` in that process only, writing `mode='paper'` through the real writer. The live app's environment is never changed and the engine is never restarted for the proof. | A4; a pm2 env change is a restart of live trading and wipes every in-memory window (F17) |
| 6 | Scope §3: VTS runner callers at `:4437`/`:6164` | `vts-runner.ts:4447`, `:6174` | line drift since `f7593fe4d` |
| 7 | Scope: "write a regime drift test" (implied new instrument) | An instrument **already exists and already sees this defect**: the enum-parity check (CI step, continue-on-error) reported at CI run `45025681207` exactly six code-only values: `market_regime.{TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION, HIGH_VOL_IMPULSE}`. A required unit test is still added (P4), because the parity step is outside the required result. | F18 |

---

## 1. Sources read (the six)

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | Code at the ref | yes | F1–F10, F15 |
| 2 | Runtime + DB | yes — `dt-sql` 2026-11-22: `pg_enum` six old labels; `telemetry_history` and `adaptive_learning` 0 live rows, 0 `n_tup_ins` | OBJ-1/OBJ-3 controls |
| 3 | System Impact Map | yes — §7.6 (`:876-881`) | F11 |
| 4 | System Manual | yes | F12 |
| 5 | Ledger (`RUNNING_ISSUES`, `BATCH_CATALOG`, completion reports) | yes — `#1063` (pattern enum, 09-13 ruling), `#1006` (dead `migrations/` lane), B-WORKFLOW-IMPROVE OBJ-10 (parity check) | F13, F18 |
| 6 | `bridge/canonical/` | yes — **no coverage of telemetry persistence**. Its "Phase 11.1A" is the *Canonical Dictionary* (`Phase_11_Implementation_History.md:144`), a different item from the 11.1A telemetry-persistence directive. It does record `HIGH_VOL_IMPULSE` and `TRANSITION` as **pre-March regime names** (`DawnTrader_Current_State_Reference.md:227-228`, `:374-375`) — i.e. both are old-era labels, which supports call 2 (drop `HIGH_VOL_IMPULSE`, normalize it). | provenance |

Git provenance (scope §4, unchanged): intent `2bc1b5d1d` (2026-01-10), fallback `8c40fc6d5` (2026-01-23), break `5bfa63bd1` (2026-03-05).

---

## 2. Entry-point enumeration (repo-wide, tests excluded) — BEFORE the census

**Writers into `telemetry_history` / `adaptive_learning`:**
| entry | started by | reached? |
|---|---|---|
| `recordPairTelemetry` (`telemetry-aggregator.ts:181`) → `persistTelemetryAsync` (`:281`) → `saveTelemetryRecord` | VTS runner `:4447`, `:6174` | **yes, but gated by `shouldPersist()`** (`telemetry-repository.ts:129`: live, or `FORCE_PERSIST`) ⇒ never in paper |
| `persistAdaptiveLearning` (`:862`) → `saveAdaptiveWeights` (`adaptive-learning-repository.ts:154`) | no caller | no |
| `saveAdaptiveWeightsBatch` (`adaptive-learning-repository.ts:189`) | no caller | no |
| ★ `persistCostSnapshot` (`server/core/telemetry/cost-telemetry.ts:75`, insert `:97`, regime sentinel `TREND_FRIENDLY_STABLE`) | `startCostTelemetryLoop` (`:223`) — **zero callers at the ref** (control: the same grep finds `getCostHistory`'s two importers, `routes.ts:8698` and `cost-drift-monitor.ts:18`) | no — F15 |

**Boot / scheduler entries:** no boot assertion reads `market_regime` or `pg_enum` in `server/` outside tests (grep `assert.*(CANONICAL_REGIMES|market_regime)|pg_enum`, one hit, the parity test). No rehydrate runs at boot (`rehydrateTelemetryState` method `:780` and `rehydrateAdaptiveLearning` `:828` have zero callers; the module-level `rehydrateTelemetryState` at `:1641/:1665` is a **different function** that reads a JSON state file, not the database). b72-warmup reads `CANONICAL_REGIMES` (F9) and is safe.

**Readers (regime-filtered):** `loadRecentTelemetry` (via the dead rehydrate), `loadAdaptiveWeights` (`:59`/`:90`) reached only from `dynamic-sizing-engine.ts:46` inside `computeDynamicSize` — **which has zero callers** (`routes/dse.ts:8` imports only the diagnostics getters; `core/risk/index.ts:7` re-exports it and nothing imports the barrel). `getAdaptiveLearningStats` (`:210`) — no caller. `getCostHistory` (reads `telemetry_history`, not regime-filtered) — two readers (F16).

REVIEWER: claim-only · "name the objects that settle C1 (the dead methods have zero production callers), C2 (`loadAdaptiveWeights` is reached only via dead code), C3 (`saveTelemetryRecord` is the only runtime inserter); what other states are consistent?" · C1 holds; C2 holds with a correction (the DSE caller itself has no caller, not "only a diagnostics route"); **C3 HIT — a second inserter, `cost-telemetry.ts:97`** · re-derived y (grep at the ref with the importer control above).

---

## 3. Findings

**F1 — The writer always carries a label; the enum refuses it.** `:134`/`:261` above. Any live-mode write today sends `RANGE_BOUND_STABLE` or a VTS trade's regime (canonical, `vts-runner.ts:5755`) into a six-label enum ⇒ refused. `REGIMES.TRANSITION` (`:284`) is absent from `REGIMES` (`:495`) but unreachable. ★ **One non-canonical input does reach the writer:** the VTS trade record sets `regime: pairRegime ?? 'UNKNOWN'` (`vts-runner.ts:6147`) and `:6174` passes it as `pairRegime` ⇒ `'UNKNOWN'` is neither canonical nor a known ghost, and `normalizeRegime` would silently relabel it `STRUCTURAL_TRANSITION` — the case P3's warn line exists for.

**F2 — `MarketRegime` / `toDBRegime` die with the fix.** `telemetry-repository.ts:50-66`. After normalization at the writer nothing needs the `'TRANSITION'` widening. Importers: aggregator `:87`, `:196`; DSE `:49`; adaptive-learning repository signatures. Collapse to the DB type (`MarketRegimeDB`, regenerated from the pgEnum) — the canonical five plus the six old labels the DB still holds.

**F3 — Dead-code census** (§2): `updateMarketRegime :761`, `rehydrateTelemetryState :780`, `rehydrateAdaptiveLearning :828`, `persistAdaptiveLearning :862`, `saveAdaptiveWeightsBatch`, `getAdaptiveLearningStats`, `computeDynamicSize` (+ its private `getAdaptiveWeights`), `startCostTelemetryLoop`/`persistCostSnapshot`. All zero production callers. Provenance: 11.1A1 *intended* live-mode rehydration — so these are not junk, they are an **unfinished capability**.

**F4 — Map location**: `GHOST_REGIME_NORMALIZATION` `:621-634` (ten entries), `HIGH_VOL_IMPULSE → IMPULSE_EXPANSION` at `:632`, `TRANSITION → STRUCTURAL_TRANSITION`; `normalizeRegime :655-660` returns canonical as-is, else the map, else `STRUCTURAL_TRANSITION`.

**F5 — tsc pairing** (table §0 row 3). The adaptive-learning TS2769 message is generic ("No overload matches this call."), so its cause was settled by reading each site: all four are `eq(adaptiveLearning.regime, regime)` with `regime: MarketRegime` (includes `'TRANSITION'`). **Gate mechanics** (`scripts/check-tsc-baseline.mjs`): CI fails only on a rise or a new message; a drop prints "VERIFY" and passes in CI, but the **push hook fails a drop in a file the push did not touch** (`TSC_GATE_TOUCHED_FILES`, `#680`). Removing `HIGH_VOL_IMPULSE` from the pgEnum changes the type text inside the adaptive-learning TS2322 message ⇒ that file must be in the same push, and the baseline is re-synced in the same commit with every (code, message) delta enumerated (A3).

**F6** — `loadAdaptiveWeights` is reached only via the dead DSE path (§2).
**F7** — `TRANSITION` is also a **stability state** name elsewhere; normalization is applied only where a value is a regime (the writer), never by string-replace.
**F8** — `EXTREME_NOISE` is both an old regime label and the VN veto name; the enum value stays (cannot drop), nothing renames the veto.
**F9** — b72-warmup iterates `CANONICAL_REGIMES` ⇒ unaffected.
**F10** — Client regime strings are display-only; the one filter-with-override path is on an off-limits page and is not touched (Kyle 2026-10-19).
**F11** — System Impact Map §7.6 (`:876-881`) is **silent** on the DB writes, the `shouldPersist` gate and the enum — a governance gap; plus the stale "pairTelemetry remains DB-backed only" and "Downstream: Adaptive Ratio Manager" (removed `e3a22c15a`).
**F12** — System Manual stale sites: enum table `~:11299`, §11 tables `:11149-11150`, DSE "ACTIVE" `:3836`/`:4542`, adaptive-learning "Status: Active" `~:6826/:6843`, `:1740`, `:1867-1943`, `:2967` (correct, keep), and `HIGH_VOL_IMPULSE` as a live regime at `:384, :1881, :2059, :2098, :2107, :2135, :2153, :2291, :2423, :10698`.
**F13** — `#1063` (09-13): Langston ruled the pattern fix was "the value, not a canonicalize-away". This batch composes with it: **regimes** are canonicalized at the writer **and** the five values are added — the normalizer exists for regimes, it does not for patterns.
**F14** — `module_constants.module_name='market_regime'` (seeds `2026-04-22b`, b72) is a **name collision only**, not the enum. Untouched.
**F15 — Second dead inserter** (C3 hit): `cost-telemetry.ts:97` would write the `TREND_FRIENDLY_STABLE` sentinel — refused today, accepted after OBJ-1 — if anything ever started its loop. Nothing does.
**F16 — `getCostHistory` reads `telemetry_history`** (always empty) for `routes.ts:8698` and the cost-drift monitor. NOT RE-READ beyond the import lines. Whether the drift monitor runs against an empty series is out of scope.
**F17 — `FORCE_PERSIST` on the live app means a pm2 restart** (env is read at process start), which wipes in-memory rolling windows (workflow-06). Hence §0 row 5.
**F18 — The enum-parity check** (`server/tests/enum-parity/enum-parity.parity.ts`, B-WORKFLOW-IMPROVE OBJ-10) already reports the six `market_regime` code-only values on a migrated CI database. It is continue-on-error.

---

## 4. Dispositions (§9.4) for what this batch does not build

| item | disposition |
|---|---|
| Dead 11.1A methods (F3) | **Fold (1)**: type-fix in place (the normalize + type collapse clears TS2345 `:791/:832/:873`, needed for OBJ-4). **Delete-vs-reconnect → decision item for Kyle's list** (11.1A1 live rehydration was the original intent; reconnecting is new capability; deleting removes an unfinished design). No code removed in this batch. |
| `computeDynamicSize` / DSE (F6) | Docs corrected (OBJ-6). Deletion → proposal for Kyle's list (call 3). |
| `persistCostSnapshot`/`startCostTelemetryLoop` (F15) | Same proposal entry as F3 (dead writer, rule 18), listed in the OBJ-5 census. |
| F16 cost-drift monitor on an empty series | **Scheduled review (4)** at Step 3: read `cost-drift-monitor.ts` and `routes.ts:8698`; if a defect, it goes to Kyle as a find, not folded. |
| Old six labels | **(5) left intentionally** — `DELETED_COMPONENTS_LOG.md` §15 entry (Postgres cannot drop an enum value). |

---

## 5. Implementation plan (each item → its finding)

| # | item | from |
|---|---|---|
| P1 | Migration `drizzle/migrations/2026-11-2x-b-db-regime-enum-align.sql`: five `ALTER TYPE market_regime ADD VALUE IF NOT EXISTS '<canonical>'`, no BEGIN/COMMIT (precedent `2026-11-05-b-balance-session-pairing-block-reasons.sql`, four statements, one file; `#1063`'s `2026-10-02` file). Appended to `MANIFEST.txt`. Rollback file deletes only the `_migrations` row (values cannot be dropped) — in git with `-f`, **not** in MANIFEST. `HIGH_VOL_IMPULSE` is **not** added (call 2). | F1, F18, call 2 |
| P2 | `shared/schema.ts:1011-1025`: drop `HIGH_VOL_IMPULSE` ⇒ eleven labels = live DB after P1. | F4, call 2 |
| P3 | Writer (call 1): `persistTelemetryAsync` call at `:281-292` passes `normalizeRegime(entry.pairRegime)`; `:284`'s `REGIMES.TRANSITION` fallback removed (the label is always present, F1). `pairRegime` field types become `string` in, canonical out. **Judgement call for Langston:** `normalizeRegime`'s unknown-label fallback to `STRUCTURAL_TRANSITION` is silent — propose a one-line `console.warn` at the writer when the input was not canonical *and* not a known ghost, so a new label is visible rather than relabelled. | F1, F4, F7 |
| P4 | Required unit test `server/tests/unit/b-db-regime-enum-align.test.ts` on the `b-pattern-enum-drift.test.ts` template: storable = initial `CREATE TYPE` + MANIFEST-registered `ADD VALUE`s; assert `CANONICAL_REGIMES ⊆ storable`, schema pgEnum `⊆ storable`, P1 registered, rollback not registered; plus a writer test pinning `:261` (no `pairRegime` → `currentRegime`) and ghost input (`HIGH_VOL_IMPULSE` → `IMPULSE_EXPANSION`, `TRANSITION` → `STRUCTURAL_TRANSITION`) reaching `saveTelemetryRecord` normalized. | F1, F4, F18, OBJ-2 |
| P5 | Delete `MarketRegime` + `toDBRegime` (`telemetry-repository.ts:50-66`); retype importers (aggregator, adaptive-learning repository, DSE `:49`) to the DB type; correct the false header `:18-25`. | F2, F5 |
| P6 | `.tsc-baseline.json` re-synced in the same commit; change list enumerates every per-(file, code, message) delta — expected −10 (§0 row 3), and **any** new message justified. Adaptive-learning file is in the push (F5 push-hook rule). | F5, A3 |
| P7 | System Impact Map §7.6: the writer, the `shouldPersist` gate, the enum and its migration, the dead readers, the cost-telemetry inserter; strike the two stale lines. | F11 |
| P8 | System Manual: each F12 site corrected to a measured statement; `HIGH_VOL_IMPULSE` re-labelled as a ghost normalized to `IMPULSE_EXPANSION`. DSE: docs only. | F12, call 3 |
| P9 | `DELETED_COMPONENTS_LOG.md` §15: old six labels left intentionally; dead-method/DSE/cost-telemetry deletion proposal referenced (not deleted). | §4 |
| P10 | OBJ-5 census written into the change list: every regime-filtered reader + its guard (all dead today; each now typed to the DB type, so an unvalidated string no longer compiles). | §2, OBJ-5 |
| P11 | **OBJ-3 proof (A4):** after this batch's sha is deployed by `dt-deploy`, run a one-shot `npm run` script on staging with `FORCE_PERSIST=true` in its own env, `MODE=paper`, that calls `recordPairTelemetry` for one canonical and one ghost label. PASS = `n_tup_ins` moves from its pre-run value, rows carry canonical labels and `mode='paper'`. Rows left in place (ids recorded; rehydrate reads live only). **Which build:** the deployed batch sha — never the 33-hour-behind build. | F17, A4 |
| P12 | **Deploy-window call (KD-56 / OBJ-7):** P1 adds enum values and P3 changes a write that never runs in paper ⇒ **no trading behaviour changes and no `DEPLOY_WINDOWS` row for this batch's own change.** But `dt-deploy` ships the branch head, which carries other sessions' undeployed work (staging 33 h behind, alert `d92423ce`) ⇒ at Step 6 the deploy names every open window and tells their owners, as every deploy does. | A4, OBJ-7 |

No plan item is `UNAUDITED`.

## 6. NOT RE-READ (load-bearing claims not routed to a reader)
- F16: what the cost-drift monitor does with an empty series (import lines only).
- F10: the off-limits filter-with-override path (not opened).
- P11's assumption that `recordPairTelemetry` can be driven from a script without the VTS runner's state — checked at Step 3 when the script is written.

## 7. Plain-language summary
The audit confirmed Langston's correction: the code always sends a regime name, so the real problem is simply that the database refuses today's five names. The plan adds those five names to the database, stops the code using two retired names, tidies the old code and documents around them, and proves the fix with one real write on staging run as a separate one-off process, so live trading is never restarted for the test. Nine pieces of unused code built for live mode are left in place and offered to Kyle as a keep-or-delete decision.
