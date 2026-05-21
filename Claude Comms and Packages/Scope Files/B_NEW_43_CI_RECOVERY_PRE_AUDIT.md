# B-NEW-43 — CI Recovery — Pre-Implementation Audit (Step 2)

> **Status:** Step 2 pre-audit — **Langston Step 2 ACK received, consensus reached** (2026-05-22). See §13 for the consensus record + the b-new-42b diagnostic Langston requested.
> **Scope reference:** `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` rev2 (FINALIZED, Langston Step 1 ACK).
> **Author:** Claude Code, 2026-05-22.
> **Evidence base:** GitHub Actions CI run **26255691977** (latest run on `migration/aws-supabase`, push "Memory sync: B79.0n.MCE Steps 1-5 done + B-NEW-43 scope finalized", 2026-05-21T22:01Z). This commit changed only `MEMORY.md` + the scope file — zero code change vs the B79.0n.MCE Step-5 fix-forward — so the error set is identical to the run the scope cited (26245428198) and is the current, stable baseline.
> **Method note:** every count in this document is a mechanical re-extraction from the CI job logs (`gh run view 26255691977 --log-failed`), not a hand estimate. Extraction commands and groupings are reproducible.

---

## §0 — PREVIOUSLY-STATED-VS-NOW deltas (CLAUDE.md §9.2 — mandatory)

| Item | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| Total TypeScript errors | **694** (scope §1.1 headline) | **696** | Scope headline was approximate — its own sub-counts (client 37 + server 658 + other 2) summed to 697. Pre-audit gives the exact mechanical tally: 696. Treat 696 as authoritative. |
| Test Suite failures | **98** (scope §1.2) | **98** | Confirmed — no delta. (1319 passed, 12 skipped, 1429 total, 20 failed files.) |
| "ECONNREFUSED ~8" DB-dependent failures | **~8**, implied to be the integration tests (scope §1.2) | **≈9**, but the composition is different — see §3.3 | The integration tests (`dynamic_sizing`, `cost_telemetry`, `net_expectancy`) actually fail on module-not-warm, NOT on DB connection. The DB-connection failures are concentrated in a **unit** test (`b79-0m-b2-pattern-filter`, 7 of 9) that performs live DB I/O. Composition delta surfaced for Langston. |
| "Genuine assertion-failure tail ~13-30" | **~13-30** (scope §1.2) | **≈31** | Measured count lands at/above the top of the scope's range. Phase 2 step 4 (genuine-failure investigation) is slightly larger than scoped. Effort note in §11. |
| Phase 2.2 CI-DB bootstrap tool | **`npm run db:push`** (scope §3 Phase 2.2, Langston Q3) | **MUST be `npm run db:migrate`** — see §4.2 | NEW FINDING. `drizzle-kit push` (= `db:push`) is documented-**broken** on this schema (the PG-ARRAY-default introspection bug — the exact reason `scripts/db-migrate.ts` was written to replace it in B65.1-HF3). `db:push` would die before creating any schema. This is a scope correction, not a scope-tightening — flagged prominently for Langston. |
| vi.mock module-hoist failure | not mentioned | **1 new root cause** (`b70-run-mode-controller.test.ts`) | NEW FINDING — a distinct test-infra root cause (vi.mock factory hoisting) not in the scope's 4-cluster model. §3.6. |

---

## §1 — Audit method & evidence base

The CI failed-job log (9,135 lines) was pulled and split into two analysis streams:

- **TypeScript Check stream** — 696 lines matching `<file>(<line>,<col>): error TS<code>: <message>`, extracted to a clean file and grouped by error code, by file, and by message-payload (missing name / missing property / target type).
- **Test Suite stream** — the verbose vitest output, ANSI-stripped, parsed for the run summary, the 20 `FAIL` files, the 98 individual `FAIL … > …` test entries, and the first error line of each failing test for reason classification.

Classification of test failures uses a priority scan of each failure's first ~19 log lines: `is not warm` → NOT_WARM (with module name); else `ECONNREFUSED`/`pg-pool`/`AggregateError` → DB_CONNECTION; else `sector_coverage_floor` → KNOB; else `missing an explicit per-class row` → PERCLASS_ROW; else `error when mocking a module` → VITEST_MOCK; else `AssertionError` → ASSERTION; else TypeError/ReferenceError/OTHER. The classifier total lands at ≈100 against the authoritative 98 — a ±2-3 imprecision from nested error objects (a NOT_WARM failure whose stack also contains a downstream DB error, etc.). Cluster sizes below are therefore stated as "≈"; the 98 total is exact.

---

## §2 — TypeScript Check: root-cause clustering (696 errors)

### §2.1 — Distribution by error code

| Code | Count | Meaning |
|---|---|---|
| TS2339 | 220 | Property does not exist on type |
| TS2345 | 114 | Argument not assignable to parameter |
| TS2304 | 87 | Cannot find name |
| TS2353 | 45 | Object literal — unknown property |
| TS2322 | 45 | Type not assignable |
| TS18046 | 34 | Value is of type 'unknown' |
| TS2769 | 25 | No overload matches this call |
| TS2554 | 21 | Wrong number of arguments |
| TS7006 | 15 | Parameter implicitly 'any' |
| TS2551 | 15 | Property does not exist (with "did you mean") |
| TS2352 | 14 | Conversion may be a mistake |
| TS2307 | 10 | Cannot find module |
| (22 other codes) | 51 | long tail |

### §2.2 — Distribution by file (top 12 — 5 files = 392 errors = 56%)

| File | Errors | Note |
|---|---|---|
| `server/routes.ts` | 213 | Monolithic — 21,991 lines (SIM line 615). Epicenter. |
| `server/storage.ts` | 59 | **40 of 59 collapse to one missing type** — see §2.3. |
| `server/routes/vts.ts` | 44 | VTS route module. |
| `server/services/vts-runner.ts` | 43 | VTS execution loop (~1,850 lines per SIM). |
| `server/services/signal-orchestrator.ts` | 33 | Signal pipeline hub. |
| `client/src/pages/machine-learning.tsx` | 23 | Largest client-side cluster. |
| `server/services/unified-core.ts` | 21 | |
| `server/services/autonomy-scheduler.ts` | 16 | |
| `server/services/fx5-scanner.ts` | 15 | |
| `server/services/stage-b-validator.ts` | 12 | |
| `server/services/asset-capabilities.ts` | 11 | |
| `server/core/rtb/ready_to_buy_service.ts` | 9 | |

Split: `server/` 658 (94%), `client/` 37 (5%), other 1.

### §2.3 — TS2304 "Cannot find name" (87) — root causes

| Missing name | Count | Where | Root cause |
|---|---|---|---|
| `TradingMode` | 40 | **all 40 in `server/storage.ts`** | ONE missing type import/declaration. Fixing the single `TradingMode` import in `storage.ts` clears **40 of storage.ts's 59 errors (68%)**. |
| `settings` | 14 | command-router.ts (5), stage-b-validator.ts (7), historic-signal-generator.ts (2), paper-48hr-simulation.ts (2) | NOT one root cause — `settings`/`userSettings` are local-scope variables that were renamed or had their declaration removed. ~4 distinct fixes (one per file). |
| `aiOpportunitiesService` | 5 | single service | One missing import/declaration. |
| `systemAlerts`, `signalFinalScore` | 3 each | | likely one each (renamed symbol). |
| `userSettings`, `tradingEngines`, `regimeWeight`, `discrepanciesFound`, `confidence`, `OpenAI` | 2 each | | ~6 small fixes. |
| 8 singletons | 1 each | | long tail. |

**TS2304 verdict:** ~3 fixes (`TradingMode`, `aiOpportunitiesService`, plus the `settings` family) clear ~59 of 87. Confirms the scope's "fix 3 imports resolves ~68%" — but note `settings` is 4 fixes not 1, so the realistic figure is **~7 fixes clear ~64 errors**.

### §2.4 — TS2339 "Property does not exist" (220) — root causes

Clusters by the **type the property is missing from** (top groups):

| Mis-typed type | Count | Interpretation |
|---|---|---|
| `{ id; username; isAdmin?; role?; permissions? }` | 20 | The Express `req.user` auth object. Code reads properties the auth-user type does not declare. **ONE fix** — widen the canonical authed-user type (or the `Express.Request['user']` augmentation). 20 of those 20 are in `routes.ts`. |
| `DatabaseStorage` | 21 | Methods called on the storage class that the class type does not expose. Either the methods exist but aren't on the public type, or the storage interface drifted from the class. ONE-to-few fixes. |
| `Phase10TradeRecord` | 17 | Named domain type missing members — schema/code drift. |
| conflict-resolution row literal | 12 | A Drizzle `$inferSelect` row type — code reads a column not in the table def. |
| paper-sim balance row literal | 8 | Drizzle row — same pattern. |
| `SQESignalInput` | 8 | Named type missing members. |
| VTS open-trade union literal | 7+4 | Drizzle row union — same pattern. |
| `OpenVirtualTrade` | 7 | VTS in-memory trade interface. |
| agent-trace row / task-queue row literals | 6+6 | Drizzle rows. |
| `typeof import(".../shared/schema")` | 5 | Code accesses a `schema.ts` export that does not exist (renamed/removed table). |
| `TradeSafetyResult` | 5 | Named type missing members. |
| `PaperExecutionEngine` | 4 | Class type missing members. |
| `PgTableWithColumns<…>` (historic_signals, trades, ethics_conflict_register) | 4+3+3 | Code references a Drizzle **column** the table definition lacks. |

**TS2339 verdict:** the 220 are NOT 220 bugs. They resolve into **~15-22 root-cause type definitions** — confirming the scope. The dominant pattern is **schema↔code drift**: Drizzle row/table inferred types and named domain types (`Phase10TradeRecord`, `SQESignalInput`, `TradeSafetyResult`) that the consuming code has outgrown. The `req.user` cluster (20) is the single highest-leverage fix.

### §2.5 — TS2345 "Argument not assignable" (114) — root causes

| Target parameter type | Count | Interpretation |
|---|---|---|
| `string` | 57 | Something (often `string \| undefined` or a wrong type) passed where `string` required. Will sub-cluster during Phase 1 — likely a handful of mis-typed call sites repeated. |
| `"live" \| "paper"` | 20 | A bare `string` passed where the trade-mode literal union is required. ONE pattern — a `mode` value typed `string` upstream. Likely one upstream type fix clears most. |
| `ResolutionKey` | 9 | The `module_constants` resolution-key shape. |
| `SQL \| PgTable \| Subquery` | 5 | Drizzle query-builder argument. |
| `MarketRegime` | 4 | regime enum. |
| long tail | 19 | per-site. |

42 of 114 are in `routes/vts.ts`, 24 in `routes.ts` — 66 of 114 in two route files, consistent with the scope.

### §2.6 — `routes.ts` internal breakdown (213 errors) + chunk plan

By code inside `routes.ts`: TS2339 91, TS2345 24, TS2353 18, TS2322 15, TS2304 14, TS2554 11, TS7006 9, TS2769 9, TS2307 6, TS7017 5, TS2551 4, TS2352 4.

The 91 TS2339 in `routes.ts` break down as: `req.user` narrow type 20, `DatabaseStorage` 15, VTS-trade row literals 11+2, paper-sim balance row 8, agent-trace/task-queue rows 6+6, `TradeSafetyResult` 5, `PaperExecutionEngine` 4, misc. So `routes.ts`'s 91 TS2339 largely **share root causes with the cross-cutting type fixes** in §2.4 — a meaningful fraction of routes.ts errors will clear "for free" once the shared types are corrected. The residual is genuinely routes.ts-local.

**Chunk plan (Langston concern 1).** `routes.ts` carries `// ===== PHASE X: NAME =====` section banners throughout (auth / diagnostics / RTB / VTS / xStocks / scanner / WebSocket-health / etc. — 30+ sections sampled). These are the natural commit-chunk boundaries. Proposed Phase-1 sequence for `routes.ts`:
1. First land the **cross-cutting type fixes** from §2.4 (req.user, DatabaseStorage, the Drizzle row types) in their own commits — re-measure routes.ts after each.
2. Then chunk the **routes.ts-residual** by section banner, ~20-40 errors per commit. Estimate **6-9 routes.ts chunk-commits** after the cross-cutting fixes land.

### §2.7 — `storage.ts` internal breakdown (59 errors) + chunk plan

By code: TS2304 40 (**all `TradingMode`**), TS2339 12, TS2769 4, TS2353 2, TS2741 1.

**Chunk plan:** commit 1 = the single `TradingMode` import fix (clears 40). Commit 2 = the residual 19 (TS2339 storage-class-method drift + 4 overload + 3 object-literal). `storage.ts` is **2 commits**, not the "split by storage-method group" the scope anticipated — because 40 of 59 are one fix, the file does not need fine-grained chunking. (Scope concern 1 satisfied: the file is reviewable in 2 commits.)

### §2.8 — Estimated distinct root-cause count

| Bucket | Distinct root-cause fixes |
|---|---|
| TS2304 | ~7 (clears ~64) |
| TS2339 cross-cutting type defs | ~15-22 (clears ~150) |
| TS2345 | ~10-15 |
| routes.ts-local residual | ~20-35 |
| Long tail (TS2353/2322/18046/2769/2554/7006/etc.) | ~30-50 individual |
| **Total** | **~80-130 distinct fixes** |

This is **above the scope's "~40-70" estimate.** The scope counted root-cause *clusters*; this pre-audit counts *commits/fixes* including the long tail. The high-leverage front (TS2304 + TS2339 cross-cutting, ~25-30 fixes) still clears **~55-60% of all 696 errors**. The remaining ~40% is genuinely a long tail of smaller fixes. **Effort implication in §11.**

---

## §3 — Test Suite: root-cause clustering (98 failures, 20 files)

### §3.1 — Per-file failure count + dominant reason

| Failures | Test file | Dominant reason |
|---|---|---|
| 16 | `integration/dynamic_sizing.test.ts` | NOT_WARM: position_sizing |
| 11 | `unit/b-new-42b-price-discontinuity-detector.test.ts` | ASSERTION (all "expected false to be true") |
| 9 | `unit/directive-11.7S-strategy-modes.test.ts` | NOT_WARM: governance_modes |
| 9 | `unit/b63-item16-dbs-store.test.ts` | NOT_WARM: dbs_calculation |
| 9 | `system/mapping_drift_integrity.test.ts` | NOT_WARM: drift_detector |
| 7 | `unit/b79-0m-b2-pattern-filter.test.ts` | DB_CONNECTION (pg-pool AggregateError) |
| 6 | `unit/b-phase-a2-xstock-dbs-store.test.ts` | KNOB: sector_coverage_floor (5) + NOT_WARM (1) |
| 5 | `unit/b-new-36-lifecycle-controller.test.ts` | ASSERTION |
| 4 | `unit/b79-0f-asset-class-collisions.test.ts` | ASSERTION (3) + DB_CONNECTION (1) |
| 4 | `unit/b73-exit-strategy-replay.test.ts` | ASSERTION |
| 4 | `integration/net_expectancy.test.ts` | NOT_WARM: cost_geometry |
| 3 | `unit/b63-item12-geometry-override.test.ts` | NOT_WARM: strategy.vwap_pullback |
| 3 | `integration/cost_telemetry.test.ts` | NOT_WARM: position_sizing |
| 2 | `unit/b79-0d-orb.test.ts` | ASSERTION |
| 2 | `unit/b68-5-path-b-sustainability.test.ts` | ASSERTION |
| 2 | `unit/b-new-42-tec-split-resilience.test.ts` | ASSERTION |
| 1 | `unit/b74-universe-loader.test.ts` | ASSERTION |
| 1 | `unit/b70-run-mode-controller.test.ts` | VITEST_MOCK hoist (file-level load failure) |
| 1 | `unit/b-new-42-tec-halt-resilience.test.ts` | ASSERTION |
| 1 | `integration/b72-dbs-routing-guards-consistency.test.ts` | DB_CONNECTION |

### §3.2 — Cluster summary

| Cluster | ≈Count | Root cause |
|---|---|---|
| NOT_WARM | ≈54 | Test exercises sync `module_constants` reads on a cold cache; no harness pre-warm. |
| ASSERTION | ≈31 | Real test-vs-code assertions failing. Needs per-failure investigation. |
| DB_CONNECTION | ≈9 | `pg-pool` cannot reach Postgres (no DB in CI). |
| KNOB: sector_coverage_floor | 5 | Stale **per-test inline mock** — see §3.4. |
| VITEST_MOCK hoist | 1 | `vi.mock` factory references a top-level variable — see §3.6. |

### §3.3 — NOT_WARM cluster (≈54) — production warm-list cross-check

Modules failing in tests: `position_sizing` (≈20), `dbs_calculation` (≈9), `governance_modes` (≈9), `drift_detector` (≈9), `cost_geometry` (≈4), `strategy.vwap_pullback` (≈4).

**Cross-checked against the production boot warm-list** — `PREFETCH_MODULES` in `server/startup/b72-warmup.ts` (the single production prefetch site; `warmModuleConstantsForSyncCallers()` is the only production caller). Result:

| Failing module | In production `PREFETCH_MODULES`? |
|---|---|
| `position_sizing` | ✅ yes (line 28) |
| `dbs_calculation` | ✅ yes (line 40) |
| `governance_modes` | ✅ yes (line 76) |
| `drift_detector` | ✅ yes (line 47) |
| `cost_geometry` | ✅ yes (line 36) |
| `strategy.vwap_pullback` | ✅ yes (line 84) |

**ALL 6 failing modules are already in the production warm-list.** This satisfies Langston concern 2 cleanly: the harness fix **mirrors production, it does not hide a bug**. No test needs a module production does not warm. The recommended harness fix is therefore the strongest possible mirror — a shared setup that calls the **exact same `warmModuleConstantsForSyncCallers()` function** the production boot path calls (not a hand-maintained copy of the list). If a future test needs a module not in `PREFETCH_MODULES`, the warm call will not cover it, the test will fail NOT_WARM, and that surfaces a real code-side bug (a sync read of an un-warmed module) — exactly the behavior Langston's rule wants. **Authoritative warm-list = `PREFETCH_MODULES` in `b72-warmup.ts` (≈50 modules); reproduced in §6.**

**Critical dependency:** `warmModuleConstantsForSyncCallers()` → `prefetchModule()` → `loadModule()` → **real DB read**. It also **hard-throws if any module returns 0 rows** ("migration has not been applied"). So the harness pre-warm **cannot run without a reachable, schema-loaded, seed-populated Postgres.** This ties Phase 2.1 (module warming) hard to Phase 2.2 (CI DB) — they are not independent. See §4 and §7.

### §3.4 — KNOB cluster (5) — stale per-test mock, NOT a canonical fixture

The 5 `unexpected required knob sector_coverage_floor` failures come from `unit/b-phase-a2-xstock-dbs-store.test.ts` lines 46-50 — the test defines its **own inline mock** of `module-constants-service` with a hand-written `getCachedNumberRequired` that `throw new Error(\`unexpected required knob ${knob}\`)` for any knob it does not recognise. B-PHASE-A2 added the `sector_coverage_floor` knob but did not update its own test's mock to recognise it.

**Finding for Langston concern 4:** there is **no single canonical module-constants test fixture** in the codebase. Tests that touch module-constants either (a) mock the service inline per-test (drift-prone — this is exactly what bit B-PHASE-A2), or (b) do not mock and hit the cold-cache throw (the 54 NOT_WARM failures). The scope's concern-4 rule ("a batch adding a required knob updates the canonical test fixture") presumes a canonical fixture **that does not yet exist.** Phase 2/3 should therefore either (i) create one canonical module-constants fixture/warm-helper and migrate inline mocks onto it, or (ii) at minimum, the concern-4 governance rule must say "update the canonical warm-helper **and** any inline per-test mock that lists knobs." Surfaced as open question Q3 in §10.

### §3.5 — ASSERTION cluster (≈31) — per-file disposition + genuine-failure flags

These are the scope §4 / Langston-concern-3 danger zone. First-look disposition (full per-failure investigation happens in Phase 2 step 4, each with its own commit + justification):

- **`b-new-42b-price-discontinuity-detector.test.ts` (11) — 🚩 HIGH PRIORITY GENUINE-FAILURE CANDIDATE.** All 11 are "expected false to be true" — the price-discontinuity detector returns `false` where the test expects `true`. Per SIM line 2088 the detector reads hardcoded values matching its seeds (no live `module_constants` dependency), so this is **not** a cold-cache artifact — it is a genuine logic-vs-test mismatch. B-NEW-42b is a **recent** batch. Either the detector has a real bug or the test was written against a since-changed contract. **Must be surfaced to Kyle, not silently re-baselined.**
- **`b-new-36-lifecycle-controller.test.ts` (5) — 🚩 HIGH PRIORITY GENUINE-FAILURE CANDIDATE.** Failures: "expected [] to include 'weekend_shutdown'", "…'weekend_restart'", "expected undefined to be 'boot_state_reconciliation'" — the lifecycle controller's scheduled-timer registry returns empty where the test expects timers registered. **This directly intersects an active system alert:** alert `283bd74e` fires 2026-05-23T00:05Z to verify the *first real* `weekend_shutdown` timer fires on staging. If the controller genuinely fails to register timers, that is a real production bug and the soak alert will catch it tomorrow. The test failure and the soak alert are two views of the same risk. **Must be surfaced to Kyle now**, and the Phase-2 investigation of this file must coordinate with the 2026-05-23 alert outcome.
- **`b73-exit-strategy-replay.test.ts` (4), `b79-0f-asset-class-collisions.test.ts` (3), `b79-0d-orb.test.ts` (2), `b68-5-path-b-sustainability.test.ts` (2), `b-new-42-tec-split-resilience.test.ts` (2), `b74-universe-loader.test.ts` (1), `b-new-42-tec-halt-resilience.test.ts` (1)** — mixed; investigate per-test in Phase 2. The "expected 'crypto_spot' to be 'xstock_spot'" sub-cluster (≈4, mostly in `b79-0f-asset-class-collisions`) suggests asset-class-resolution test/code drift — relevant to the very arc B-NEW-43 protects.

**Disposition rule (Langston concern 3):** none of these 31 may be "fixed" by editing the assertion to match current code without an explicit per-failure justification: (a) what the test asserts, (b) what the code does, (c) which is correct and why. Each genuine failure (or tight cluster of ~3) gets its own commit. Any failure that turns out to be a real code bug is surfaced to Kyle and either fixed properly or filed to RUNNING_ISSUES — never silently re-baselined.

### §3.6 — VITEST_MOCK hoist failure (1) — NEW root cause

`b70-run-mode-controller.test.ts` fails at **file load** (whole file, not one test): `Error: [vitest] There was an error when mocking a module … vi.mock factory … no top level variables`. A `vi.mock()` factory in the test references a top-level variable, which vitest hoists above the variable's declaration. This is a **fifth root-cause category** not in the scope's 4-cluster model. Fix is mechanical (move the variable inside the factory or use `vi.hoisted()`), one file. Flagged as a numeric-delta in §0.

---

## §4 — CI infrastructure findings — the silent-regression root cause

### §4.1 — 🔴 `continue-on-error: true` on the TypeScript Check job — THIS is why CI went red unnoticed

`.github/workflows/ci.yml` line 24-26, on the `typecheck` job:

```yaml
  typecheck:
    name: TypeScript Check
    # Non-blocking: codebase has ~20 pre-existing TSC errors in files not related to migration.
    # This job reports status but does not gate build/test/docker.
    continue-on-error: true
```

The TypeScript Check job has **`continue-on-error: true`**. The job runs `npx tsc --noEmit`, sees 696 errors, exits non-zero — but `continue-on-error` makes GitHub treat the job as **non-blocking**: the overall run is not failed by it. The comment even documents the original intent ("~20 pre-existing TSC errors"). The error count then grew from ~20 to 696 across the B79.0n arc and **nothing gated on it.** The recent CI runs show as "failure" only because the **Test Suite** job (which has no `continue-on-error`) is red.

This is the concrete mechanism behind scope Objective 4 ("CI cannot silently regress to red unnoticed again") and behind the stale CLAUDE.md §7 claim ("ALL 4 GREEN since B56"). **Objective 4 is not satisfied by adding a per-batch status-check step alone** — `continue-on-error: true` must be **removed** from the typecheck job once the errors are fixed, so a future regression actually fails the run. If it is left in, the next silent regression is guaranteed. This is the single most important infrastructure fix in the batch.

> Sequencing note: `continue-on-error` must be removed **only after** Phase 1 reaches zero errors (or green-minus-documented-residual). Removing it earlier would hard-fail every CI run mid-batch. The removal is the **last commit of Phase 1 / first of Phase 3** and gets its own Step-4 review (it is a CI-workflow change — Langston concern 5).

### §4.2 — 🔴 `db:push` is BROKEN on this schema — Phase 2.2 must use `db:migrate`

The scope §3 Phase 2.2 and Langston Q3 both specify **`npm run db:push`** (`drizzle-kit push`) to bootstrap the CI Postgres schema. **`db:push` does not work on this project.** `scripts/db-migrate.ts` (the file-based migration runner) documents exactly why, in its own header:

> "`drizzle-kit push` introspects the live DB and diffs against `shared/schema.ts` … That introspector (kit v0.31.4) can't parse PG ARRAY column defaults like `ARRAY['USD','USDT']::text[]` … It dies with `SyntaxError: Unexpected token 'R', "RAY" is not valid JSON`. This has blocked schema-driven migrations since B65.1."

`db:push` would crash before creating a single table. `scripts/db-migrate.ts` (npm script `db:migrate`) was **created specifically to replace `db:push`** for exactly this reason. It runs the SQL files in `drizzle/migrations/` in lexicographic (date) order against `DATABASE_URL`, tracking applied files in a `_migrations` ledger table (idempotent), each file in its own transaction.

**Correction:** Phase 2.2 must run **`npm run db:migrate`** against the CI Postgres, not `db:push`. This is strictly better than the scope's plan in three ways: (1) it actually works; (2) it produces **schema AND seed data** — see §4.2-note; (3) it exercises the real migration path, so CI would now also catch a broken migration before it reaches staging.

**§4.2-note — why this matters beyond "schema":** `db:push` (even if it worked) syncs only the **schema** from `shared/schema.ts`. It does **not** insert data. The ≈54 NOT_WARM tests need the harness to call `warmModuleConstantsForSyncCallers()`, which reads **rows** from the `module_constants` table and **hard-throws on zero rows**. Those rows are seeded by data-migration SQL files (e.g. `2026-04-23-b65-create-module-constants.sql`, `2026-04-23-b65-2-trailing-exit-seeds-and-trade-mode.sql`, and ~dozens more). Only `db:migrate` (which runs every migration file) produces a Postgres that has both the schema and the seed rows. **A `db:push`-only plan would fix the 9 DB_CONNECTION failures but leave all 54 NOT_WARM failures unfixable** (warm would throw "zero rows"). `db:migrate` fixes both. See §7.

`drizzle/migrations/` currently holds 117 `.sql` files; the runner skips `*rollback*.sql`, so ≈58-60 forward migrations apply. Phase 0 must validate a clean end-to-end `db:migrate` run against an empty Postgres (open risk Q1, §10).

### §4.3 — No Postgres service, no `setupFiles` in the test job

`.github/workflows/ci.yml` `test` job (lines 43-68): runs `npx vitest run --reporter=verbose` with `NODE_ENV=test` + `COINGECKO_API_TIER=demo`. There is **no `services:` block** — no Postgres. `vitest.config.ts` sets `env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'` — pointing at a host:port with nothing listening → the ≈9 DB_CONNECTION failures.

`vitest.config.ts` has **no `setupFiles`** entry — there is currently **no global test setup hook at all.** That is the natural home for the shared module-warming `beforeAll` (Phase 2.1). It does not exist yet and must be created.

### §4.4 — Proposed `ci.yml` change set (own commit, own Step-4 review — Langston concern 5)

The `.github/workflows/ci.yml` diff is small but gates every future CI run (HIGH blast radius). It must be **one isolated commit** with its own Step-4 review attention. The changes:

1. Add a `postgres` **service container** to the `test` job (`postgres:16` image, health-check, ephemeral `test/test/test` creds).
2. Add a workflow **step** before `vitest`: `npm run db:migrate` with `DATABASE_URL` pointed at the service container.
3. Confirm `DATABASE_URL` wiring: the service container's URL must reach both the `db:migrate` step and `vitest` (vitest currently hardcodes `localhost:5432` in `vitest.config.ts` — align the service container to publish on 5432 so no config change is needed, OR override via env; pre-audit recommends matching 5432 to keep `vitest.config.ts` untouched).
4. **Remove `continue-on-error: true`** from the `typecheck` job — **last, after Phase 1 is green** (§4.1).

This commit is authored in Phase 2, but item 4 lands only when error count is zero.

---

## §5 — System Impact Map consultation & blast-radius analysis

**Framing — B-NEW-43 is a type-and-test-only batch (scope §7): zero intended runtime-behavior change.** The server BUILD already passes (esbuild transpiles without type-checking; staging runs fine). So the SIM blast-radius question is inverted from a normal batch: the *intended* runtime blast radius is **ZERO**. The audit's job is to identify where a "type fix" could **accidentally** become a behavior change, and to confirm the touched components against the SIM.

| Component | SIM reference | Blast-radius finding |
|---|---|---|
| `server/routes.ts` | SIM line 615 — "~23,349 lines — monolithic"; lines 652/978 — Walter + ai-analyst route-handler excisions. | 213 type errors. Runtime blast radius of correct type-only fixes: **ZERO**. **Risk:** routes.ts has had heavy surgery (Walter/ai-analyst removed) — some TS2304/TS2339 errors may point at genuinely-dead references left behind by those excisions. Deleting dead code is fine; the danger is "fixing" an error in a live handler by changing what it returns. Discipline: type fixes only. |
| `server/storage.ts` | SIM line 846 — dropping the `AssetClass` import breaks 38 callers; line 846 also notes the `b79-0n-storage-required-assetclass.test.ts` **type-lock test** using `@ts-expect-error`. | 59 errors, 40 = one `TradingMode` import. Runtime blast radius: ZERO. **Risk:** storage.ts is a hub (every route + service reads it). A wrong type *widening* here could mask a real caller bug. The `TradingMode` fix must import the *correct existing* type, not invent a loose one. |
| `server/services/vts-runner.ts` | SIM line 421 (~1,850 lines); **SIM line 280 — `vts-runner.ts:877` HALF-WIRED DEAD CODE** (`biasModifier` computed, never used); line 1005 — strong-trend geometry override **mirrored** with `paper-execution-engine.ts`. | 43 errors. **Risk:** when a type error sits on or near the documented dead `biasModifier` path, the fix is to correct the type — **not** to "wire up" the dead code (that is a behavior change, out of scope, escalate). If a fix touches the strong-trend geometry override, the mirrored site in `paper-execution-engine.ts` must be checked (SIM line 1005). |
| `server/services/signal-orchestrator.ts` | SIM lines 1217/1227/1242/2029 — ablation emit hooks; line 1432 — archive hook dormant until live trading. | 33 errors. **Risk:** the emitter API is type-enforced (SIM line 2045 — `emitAblationRecord` has a required `assetClass` param, no default). A type fix here must not relax that enforcement. |
| `server/routes/vts.ts` | (VTS route module; not separately in SIM.) | 44 errors, 42 of them TS2345. Same type-only discipline. |
| `module_constants` infra | SIM line 1016 (B65.1) — `module-constants-service.ts`, 5-dim keying, hard-fail no-silent-fallback policy. | Not modified by B-NEW-43, but the **test harness** consumes it. The harness warm-helper must respect the hard-fail policy — a test that cannot warm a module is a real signal, not something to suppress. |
| `.github/workflows/ci.yml` | (CI config — not in SIM component map.) | **HIGHEST blast radius in the batch** — gates every future CI run for every future batch. Isolated commit, own Step-4 review (Langston concern 5). |
| Test harness (`vitest.config.ts` + new `setupFiles`) | (Not in SIM.) | **MEDIUM-HIGH blast radius** — a shared `beforeAll` runs before all 102 test files. A bad warm-helper (e.g. one that throws on an unrelated module, or leaves an open DB handle) could break the **1,319 currently-passing tests**. The warm-helper must be additive and defensive; Phase 2.1 must re-run the full suite and confirm zero regressions among the currently-green tests. |

**SIM governance gap noted:** the SIM has no entry for the CI workflow, the test harness, or `routes.ts` as a typed surface. That is acceptable (SIM tracks runtime component dependencies, not build/CI infra) — but Phase 3 / Step 10 governance should add a short SIM note that the CI typecheck gate exists and is load-bearing, so a future batch does not re-disable it. Recorded as a Step-10 governance item.

**RUNNING_ISSUES cross-reference:** SIM line 868 records **RUNNING_ISSUES #132 — "tsconfig TS-hardening sweep."** B-NEW-43 overlaps this issue. Step 10 governance must reconcile #132 against B-NEW-43's outcome (close it, fold it in, or explicitly scope it as the post-B-NEW-43 follow-on for `tsconfig` strictness flags — B-NEW-43 fixes errors under the *current* tsconfig; it does not tighten tsconfig).

---

## §6 — Production module warm-list (authoritative reference for Phase 2.1)

Per Langston concern 2, the harness pre-warm must mirror **exactly** this list. It is `PREFETCH_MODULES` in `server/startup/b72-warmup.ts` (lines 24-94), consumed only by `warmModuleConstantsForSyncCallers()`. **≈50 modules:**

`strategy_dbs_routing_guards`, `position_sizing`, `roi_gating`, `expectancy_tuning`, `expectancy_gates`, `queue_admission`, `rtb_ranking`, `rtb_config`, `cost_geometry`, `vts_scoring`, `goals_weighting`, `dbs_calculation`, `paper_sizing`, `vts_service`, `cost_model`, `learning_governance`, `pattern_pool_gates`, `drift_detector`, `paper_execution`, `signal_orchestrator`, `vts_runner`, `regime_age`, `strategy.adaptive_flow`, `strategy.volatility_edge`, `strategy.defensive_hedge`, `strategy.inside_bar_reversal`, `strategy.morning_star`, `strategy.pivot_shift`, `strategy.reverse_impulse`, `strategy.support_bounce`, `strategy.strong_bull_trend`, `strategy_gates`, `mce_config`, `sqe_config`, `expectancy_kernel`, `directional_integrity`, `governance_modes`, `adaptive_weights`, `concentration_risk`, `guardrail_defaults`, `goal_alignment`, `strategy_profiles`, `strategy.vwap_pullback`, `strategy.abcd_long`, `strategy.sma_trend_ride`, `strategy.breakout`, `strategy.mean_reversion`, `strategy.range_trade`, `strategy.vwap_bounce`, `strategy.liquidity_trap`, `strategy.dhma`.

**Recommended Phase 2.1 implementation:** the harness must NOT copy this list. It must `import { warmModuleConstantsForSyncCallers } from 'server/startup/b72-warmup'` and call it in the shared `setupFiles`/`beforeAll`. That guarantees the harness can never drift from production — the list has exactly one definition. (`b72-warmup.ts` is import-safe for tests: its only side effect is the prefetch loop inside the exported function; the background refresher is `NODE_ENV==='test'`-gated to a no-op.)

---

## §7 — Phase 2 architecture: how the CI Postgres gets schema + seed data

This is the central architectural decision the pre-audit surfaces for Langston's Step-2 review. The NOT_WARM cluster (≈54, the single biggest) cannot be fixed without it.

**The dependency chain (established in §3.3 + §4.2):** harness `beforeAll` → `warmModuleConstantsForSyncCallers()` → `prefetchModule()` → DB read of `module_constants` rows → **hard-throws on zero rows.** Therefore the CI Postgres must have, before `vitest` runs: (a) the schema, (b) the `module_constants` seed rows, (c) every other table any test reads.

**Recommended approach — `db:migrate` against the CI service container.**

1. `ci.yml` `test` job gets a `postgres:16` service container (creds `test/test/test`, db `test`, port 5432 — matching the `vitest.config.ts` hardcoded `DATABASE_URL`).
2. A workflow step `npm run db:migrate` runs after `npm ci`, before `vitest`. This applies ≈58-60 forward migrations → full schema + all seed data including `module_constants`.
3. `vitest.config.ts` gains a `setupFiles` entry → a shared setup that calls `warmModuleConstantsForSyncCallers()` once (`beforeAll`, global). With the DB seeded, every module returns >0 rows, warm succeeds, the ≈54 NOT_WARM failures clear.
4. The ≈9 DB_CONNECTION failures clear automatically (the DB is now reachable).

**Why not the alternatives:**
- *`db:push` + curated seed* — `db:push` is broken (§4.2). Dead on arrival.
- *Direct in-memory cache seeding (a test fixture that populates the `module-constants-service` cache without a DB)* — avoids needing a DB for warming, BUT (a) it is a hand-maintained fixture that drifts (the exact failure mode of the `sector_coverage_floor` mock, §3.4); (b) it does not help the ≈9 genuinely DB-dependent tests, which need a real DB anyway; (c) it does not mirror production (production warms from the DB). Rejected.
- *Run only the `module_constants` seed migrations, not all ≈58* — fragile to identify the exact subset; other tables are read by other tests; `db:migrate`'s ledger makes running all of them cheap and idempotent. Rejected in favour of the full run.

**Cost:** ≈58-60 small migrations on a fresh local Postgres in a CI container — estimated 15-45 s added per CI run. Acceptable, and it buys real migration-path coverage.

**Open risk (Q1, §10):** a clean `db:migrate` against a *truly empty* Postgres has likely never been exercised — staging/Supabase were migrated incrementally over many months. A migration that assumes a pre-existing object, or a data-retag migration (`2026-05-03-b69-asset-class-retag.sql`) that assumes rows to retag, could error on an empty DB. **Phase 0 must run `db:migrate` end-to-end against a fresh local Postgres and fix any migration that is not empty-DB-safe before Phase 2.2 depends on it.** This is additional Phase 0 scope not in the rev2 scope.

---

## §8 — Fake-green audit baseline (Langston concern 6)

The scope §4 fake-green audit greps each phase boundary for **newly-introduced** suppressions. "Newly-introduced" requires a baseline to diff against. Measured now (server/, current commit):

| Pattern | Baseline count | Audit note |
|---|---|---|
| `as any` (server non-test) | **669** | Large pre-existing debt. B-NEW-43 must **not add** to it; removing the 669 is explicitly **out of scope** (would explode the batch). The audit is a strict **diff** — new `as any` in the batch range only. |
| `@ts-expect-error` (server non-test) | **0** | Clean baseline. Any new one in non-test code is a 🚩 unless it carries a RUNNING_ISSUES justification. |
| `@ts-ignore` (server non-test) | **1** | Near-clean. Treat as 0 for new-introduction purposes. |
| `@ts-expect-error` (test files) | **19** | Includes **legitimate type-lock tests** (e.g. `b79-0n-storage-required-assetclass.test.ts` asserts a call MUST fail to compile). A NEW `@ts-expect-error` inside a type-lock test is **legitimate** (it is the assertion). The audit must distinguish *type-lock-test* `@ts-expect-error` (allowed) from *suppression* `@ts-expect-error` (flagged). |
| `it.skip` / `describe.skip` / `test.skip` (test files) | **8** | Baseline. No new skips may be introduced to make a test "pass." |

**Audit mechanic for each phase boundary:** `git diff <phase-start>..<phase-end>` filtered to added lines, grep for the five patterns. Net-new count must be 0, or each new instance carries a tracked RUNNING_ISSUES entry reviewed by Langston. Baseline figures above go in the completion report so the diff is verifiable.

---

## §9 — Langston's 6 folded concerns — pre-audit disposition checklist

Langston's Step-1 ACK folded 6 concerns "into the Step 2 pre-audit checklist." Disposition:

| # | Concern | Pre-audit disposition |
|---|---|---|
| 1 | routes.ts/storage.ts commit-chunking | ✅ Addressed. `routes.ts`: cross-cutting type fixes first, then ~6-9 chunk-commits by `// ===== PHASE =====` section banner (§2.6). `storage.ts`: 2 commits (the `TradingMode` fix clears 40; residual 19 in commit 2) — finer chunking unnecessary (§2.7). |
| 2 | Module-warming mirrors production, doesn't hide | ✅ Addressed. All 6 failing modules confirmed present in production `PREFETCH_MODULES` (§3.3). Authoritative list reproduced (§6). Recommendation: harness imports and calls `warmModuleConstantsForSyncCallers()` directly — structurally impossible to drift. |
| 3 | Genuine assertion failures surfaced individually | ✅ Addressed. ≈31 enumerated per-file (§3.5). Two clusters flagged 🚩 HIGH-PRIORITY genuine-failure candidates (`b-new-42b` ×11, `b-new-36` ×5) for surfacing to Kyle. Per-failure commit + justification discipline restated. |
| 4 | Required-knob → canonical test fixture | ⚠️ Addressed **with a finding**: there is **no canonical module-constants test fixture today** (§3.4). The `sector_coverage_floor` failures are a stale *inline per-test mock*. Phase 2/3 must either create a canonical fixture/warm-helper or word the concern-4 governance rule to cover inline mocks too. Open question Q3 (§10). |
| 5 | CI-workflow YAML own Step-4 review | ✅ Addressed. `ci.yml` change set specified (§4.4) as one isolated commit; HIGH blast radius confirmed via SIM analysis (§5). Note: the `continue-on-error` removal is the load-bearing part and must land last (§4.1). |
| 6 | Fake-green audit at phase boundaries | ✅ Addressed. Baseline suppression counts measured (§8), incl. the `as any`=669 pre-existing debt and the type-lock-test `@ts-expect-error` nuance. Audit is a strict batch-range diff. |

---

## §10 — Risks & open questions for Langston (Step-2 review gate)

**Q1 — `db:migrate` against an empty Postgres is unproven.** §7 recommends `db:migrate` for the CI DB. The ≈58-60 forward migrations have only ever run incrementally against a long-lived DB. Some may not be empty-DB-safe (assume a pre-existing object; data-retag migrations like `2026-05-03-b69-asset-class-retag.sql` assume rows). **Proposed:** Phase 0 adds a task — run `db:migrate` end-to-end on a fresh local Postgres, fix any non-empty-DB-safe migration. Concur this is in-scope Phase 0?

**Q2 — `db:push` → `db:migrate` correction.** The scope and your Q3 both say `db:push`; §4.2 shows `db:push` is documented-broken on this schema and `db:migrate` is the working replacement (and the only one that also seeds `module_constants`, without which the 54 NOT_WARM tests cannot be fixed). Confirm the correction to `db:migrate`.

**Q3 — canonical module-constants test fixture (your concern 4).** There is no canonical fixture today (§3.4). Two paths: (i) Phase 2 creates one canonical warm-helper and migrates inline mocks onto it (more work, structurally correct); (ii) keep inline mocks but word the governance rule to require updating them. Recommendation: (i) for the warm path (just call `warmModuleConstantsForSyncCallers()`), and for tests that genuinely need a *mock* (not a warm) keep inline mocks but add the governance rule. Concur?

**Q4 — root-cause count is higher than scoped.** §2.8 estimates ~80-130 distinct fixes vs the scope's ~40-70. The high-leverage front still clears ~55-60% fast; the rest is a long tail. This pushes Phase 1 toward the **upper** end of the 1.5-3 day estimate, and the batch toward the upper end of 3-6 days. Not a split trigger yet (scope §6A trigger is >6 days) — flagging for visibility. Concur it stays one batch?

**Q5 — assertion-failure investigation may surface real production bugs.** §3.5 flags `b-new-42b` (×11) and `b-new-36` (×5) as likely genuine. If Phase 2 confirms a real bug, scope §7 says runtime-behavior fixes are out of B-NEW-43's scope. **Proposed handling:** B-NEW-43 fixes the *test* only when the test is provably wrong; when the *code* is wrong, B-NEW-43 files a RUNNING_ISSUES entry + surfaces to Kyle, and either (a) the test is marked with a tracked, justified `it.skip` pointing at the issue, or (b) if small and safe, Kyle approves an in-scope exception. Concur with this handling?

**Q6 — `b-new-36` test failure intersects live alert `283bd74e` (2026-05-23T00:05Z).** The lifecycle-controller test failures and the first-real-`weekend_shutdown`-timer soak alert are two views of the same risk. Phase 2's investigation of `b-new-36-lifecycle-controller.test.ts` should be timed to use the 2026-05-23 alert outcome as evidence. Noted; no decision needed — flagging the coupling.

---

## §11 — Effort calibration

| Phase | Scope estimate | Pre-audit estimate | Note |
|---|---|---|---|
| Phase 0 — local typecheck mirror | ~0.5 d | **~0.75-1 d** | +Q1 empty-DB `db:migrate` validation added. |
| Phase 1 — TS errors → green | ~1.5-3 d | **~2.5-3.5 d** | ~80-130 fixes (§2.8) vs scoped 40-70; routes.ts is still the wildcard. |
| Phase 2 — test failures → green | ~1-1.5 d | **~1.5-2 d** | NOT_WARM + DB clusters are one infra fix; the ≈31 assertion tail is per-failure work, slightly larger than scoped. |
| Phase 3 — lock it | ~0.5 d | ~0.5 d | unchanged. |
| **Total** | **3-6 d** | **~5.25-7 d** | Trends toward / slightly past the scope's upper bound. **Not yet a split trigger** (scope §6A: >6 d). Re-calibrate after Phase 0 + first TS2339 cluster, per scope §6A. |

If the post-Phase-0 calibration confirms >6 days, CC re-surfaces the split option to Kyle per scope §6A — but the recommendation now remains **one batch**, because the phases are tightly coupled (a working local typecheck unblocks everything; green TS is the precondition for meaningful green tests) and a single completion report keeps the recovery coherent.

---

## §12 — Pre-audit verdict

The scope rev2's approach is **sound and confirmed by the evidence** — the errors cluster heavily, root-cause-first is correct, the phasing is correct. Three substantive findings modify the *execution*, not the approach:

1. **`db:push` → `db:migrate`** (§4.2) — a required correction; `db:push` is broken and would also fail to seed the data the 54 NOT_WARM tests need.
2. **`continue-on-error: true` on the typecheck job** (§4.1) — this is *the* silent-regression mechanism; Objective 4 is not met unless this line is removed.
3. **Root-cause count (~80-130) and assertion tail (≈31)** run above the scope's estimates (§2.8, §3.5), pushing effort toward the upper bound — flagged, not yet a split trigger.

Plus one new test root cause (vi.mock hoist, §3.6) and one governance finding (no canonical module-constants fixture exists, §3.4).

Recommend: Langston Step-2 review of this audit, decision on Q1-Q5, then proceed to Phase 0.

— Claude Code, 2026-05-22 (B-NEW-43 CI-Recovery Step 2 pre-implementation audit)

---

## §13 — Step 2 consensus record + b-new-42b diagnostic (addendum, 2026-05-22)

### §13.1 — Langston Step 2 ACK

Langston returned **Step 2 pre-audit ACK**. He confirmed the three load-bearing findings (db:push→db:migrate, continue-on-error removal, no-canonical-fixture), approved the warm-list cross-check + the "import `warmModuleConstantsForSyncCallers()` directly" recommendation, and answered the six open questions:

- **Q1** (empty-Postgres `db:migrate` validation in Phase 0) — ✅ concur, in-scope Phase 0; specifically validate `2026-05-03-b69-asset-class-retag.sql` and any data-retag/UPDATE migration on a fresh DB; make non-empty-DB-safe migrations idempotent/guarded before Phase 2.2 depends on the migrate path.
- **Q2** (`db:push` → `db:migrate`) — ✅ confirmed.
- **Q3** (canonical module-constants fixture) — ✅ **path (i)**: Phase 2 creates a canonical warm-helper (calls `warmModuleConstantsForSyncCallers()`), migrates inline mocks onto it for warm-path cases; tests that genuinely need a *mock* keep inline mocks. Phase-3 governance rule must explicitly cover BOTH "update the canonical warm-helper AND any inline per-test mock that lists knobs."
- **Q4** (root-cause count 80-130 vs 40-70) — ✅ concur, stays one batch; Phase 0 calibration is the recheck gate; re-surface split to Kyle per scope §6A only if >6 d confirmed.
- **Q5** (genuine bugs surface) — ✅ concur the handling, **with a strengthening for b-new-42b** — see §13.2.
- **Q6** (b-new-36 + alert `283bd74e` coupling) — ✅ noted.

**Two additions to Phase 0** (consensus): (1) the b-new-42b CI-history diagnostic + Kyle surface, done below in §13.2; (2) the empty-Postgres `db:migrate` validation per Q1.

**Non-blocking flags accepted:** file a RUNNING_ISSUES follow-on for the hardcoded `postgresql://test:test@localhost:5432/test` in `vitest.config.ts` (env-driven test DB URL — not in B-NEW-43 scope); §3.6 vi.mock hoist folds into Phase 2; Step-10 governance adds a SIM note that the CI typecheck gate is load-bearing; same dead-code discipline as `vts-runner.ts:877` applies to the `routes.ts` Walter/ai-analyst excision residue (delete dead refs, but escalate if a type fix would resurrect dead code); fake-green baseline approved.

### §13.2 — b-new-42b diagnostic (Langston's requested Phase-0 pre-work) — 🚩 CONFIRMED CROSS-BATCH REGRESSION

Langston's pushback asked: did `b-new-42b-price-discontinuity-detector.test.ts` ever pass in CI, and if it regressed, which commit. Diagnostic run 2026-05-22:

**Evidence chain:**
- The detector source (`server/services/price-discontinuity-detector.ts`) AND its test file were both added in exactly **one** commit — `d8e0f5885` (B-NEW-42b ship, 2026-05-17 22:09) — and **neither has been modified since** (`git log` confirms a single commit for each file).
- In B-NEW-42b's own ship CI run (run **26001413225**, commit d8e0f5885), the b-new-42b test **PASSED 11/11** — every test `✓`. (That run was already red overall — 73 other failures — but b-new-42b's own suite was green.)
- In the current CI run (26255691977) the same byte-identical test **FAILS 11/11**, all "expected false to be true."

**Root cause — commit `230348507` (B79.0n.UNIVERSE-DISCOVERY Phase B-F, 2026-05-21).** That batch converted `XSTOCK_SPOT_SYMBOLS` in `shared/asset-classes.ts` from a **statically module-load-populated** Set:
```ts
export const XSTOCK_SPOT_SYMBOLS: ReadonlySet<string> = new Set(XSTOCK_SPOT_REGISTRY.keys());
```
to a Set that is **empty at module load** and only filled in **at server boot** by `xstockUniverseService.initializeFromDB()` (via `_replaceXstockUniverse()`):
```ts
const _xstockSymbolsInternal = new Set<string>();          // empty at import
export const XSTOCK_SPOT_SYMBOLS: ReadonlySet<string> = _xstockSymbolsInternal;
```
The detector's first line of logic (`price-discontinuity-detector.ts:247`) is `if (!XSTOCK_SPOT_SYMBOLS.has(symbol)) return { active: false };`. In a **unit test there is no `server/index.ts` boot sequence**, so `_xstockSymbolsInternal` stays empty, so the detector treats every xStock symbol (`AAPL/USD`, `KO/USD`) as non-xStock and early-returns `{ active: false }` — hence all 11 xStock-path assertions fail "expected false to be true." (The one crypto test still passes — `BTC/USD` is non-xStock either way.)

**This is a textbook cross-batch cascade regression** — the exact failure class B-NEW-43 exists to prevent. UNIVERSE-DISCOVERY's change silently broke b-new-42b's tests; because CI was already red (and the typecheck gate non-blocking), nobody saw it.

**Runtime-safety assessment (for Kyle's decision):**
- **Production is most likely unaffected** — `server/index.ts` runs `xstockUniverseService.initializeFromDB()` at boot, so `XSTOCK_SPOT_SYMBOLS` is populated before live trading. A boot-populated universe is a legitimate design (CLAUDE.md §15 "cold-start warmup is acceptable").
- **Two real residual concerns** that need explicit verification (NOT assumed away):
  1. **Boot-window race** — if the price-discontinuity detector (or any other `XSTOCK_SPOT_SYMBOLS` consumer) can execute before `initializeFromDB()` completes, it sees an empty Set and **fails open** (returns "no discontinuity" → spike protection OFF). For a *protection* layer, failing-open during the startup window is a §15 cold-start concern. UNIVERSE-DISCOVERY's boot sequencing must be checked to confirm no consumer runs in that window.
  2. **Zero working test coverage** — until the test harness is fixed to populate the universe (call `_replaceXstockUniverse()` in `beforeEach`), the price-spike protection has **no passing automated test at all**.

**Impact on B-NEW-43 Phase 2 (revises §3.5):** the b-new-42b cluster (11 failures) is **ONE root cause**, not 11 individual investigations — the harness must seed the xStock universe. The same empty-`XSTOCK_SPOT_SYMBOLS` mechanism very likely also explains the ≈4 `b79-0f-asset-class-collisions` "expected 'crypto_spot' to be 'xstock_spot'" failures (`asset-classes.ts:483` resolves to crypto when `XSTOCK_SPOT_SYMBOLS.has()` is false). So ≈15 of the ≈31 ASSERTION cluster collapse into this single boot-populated-universe root cause — Phase 2's genuine-assertion tail is correspondingly **smaller** than §3.5 estimated.

**Surfaced to Kyle** 2026-05-22 (plain-language) per Langston's Q5 strengthening. **Kyle directed "verify now, in parallel"** — verification done, §13.3.

### §13.3 — b-new-42b runtime-safety verification (Kyle-directed, 2026-05-22) — ✅ NO RUNTIME RISK

Kyle chose verify-now over defer. The two residual concerns from §13.2 were checked:

**(1) Boot-window race — RESOLVED, no race exists.** Call path: `isDiscontinuityActive` is consumed only by `tec-evaluator.ts:303` and `trailing-exit-controller.ts:1051` (the TEC trailing-exit path). The xStock universe is initialised in `server/index.ts:55-96` as a **top-level `await xstockUniverseService.initializeFromDB()`** with a 5-layer fallback chain (DB → file cache → bootstrap) and **`process.exit(1)` if all layers are exhausted** ("refusing to boot"). That block completes **before `const app = express()` at line 98** — before routes register, before the server listens, before any trading/exit loop starts. `XSTOCK_SPOT_SYMBOLS` is therefore a **hard boot gate**: by the time any detector consumer can run, the universe is guaranteed populated, or the process exited. No consumer can observe the empty set.

**(2) Module-load-time capture sweep — clean.** All 9 code usages of `XSTOCK_SPOT_SYMBOLS` across `server/` + `shared/` (excluding tests) are **call-time** — inside functions, route handlers, or the post-init boot block. Zero module-load-time captures (no `const X = new Set(XSTOCK_SPOT_SYMBOLS)` or `.size`/`.has` evaluated at import). The exported `XSTOCK_SPOT_SYMBOLS` is a stable reference to `_xstockSymbolsInternal`, mutated **in place** by `_replaceXstockUniverse()`, so even a held reference sees the populated contents after boot.

**Verdict: production runtime is SAFE. No fast-follow runtime batch needed.** The price-discontinuity detector works correctly in production — every consumer runs post-boot. B79.0n.UNIVERSE-DISCOVERY did the boot-gating correctly (hard `await` + `process.exit(1)` on total failure).

**The only residual is the test-coverage gap** (already B-NEW-43 Phase 2 scope): the b-new-42b harness must seed the universe (`_replaceXstockUniverse()` in `beforeEach`) so the 11 tests can run. Until B-NEW-43 Phase 2 lands, the price-spike protection has no passing automated test — but the feature itself is sound. This is a test-infrastructure fix, not a runtime fix; it stays inside B-NEW-43, no parallel batch.

— Claude Code, 2026-05-22 (Step 2 consensus addendum + runtime-safety verification)
