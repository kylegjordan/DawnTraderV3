# B-NEW-43 — CI Recovery — Scope (Step 1 draft)

> **Proposed batch ID:** B-NEW-43 (number to be confirmed against BATCH_CATALOG — B-NEW-41 + B-NEW-42b are the most recent B-NEW entries in memory).
> **Type:** Standalone CI-health batch. NOT part of the B79.0n umbrella arc.
> **Trigger:** During B79.0n.MCE Step 5 (2026-05-21) CI verification, CC discovered the CI TypeScript Check + Test Suite have been RED for multiple commits. CLAUDE.md §7 "ALL 4 CI checks GREEN since B56" is badly stale. B79.0n.STORAGE / UNIVERSE-DISCOVERY / HYGIENE all shipped against this red.
> **Status:** Step 1 scope — Kyle decisions LOCKED 2026-05-21 (one batch w/ internal phases; runs before B79.0n sub-batch #5; CI PostgreSQL service approved). Awaiting Langston Step 1 review.
> **Why now:** the remaining 14 sub-batches of the B79.0n arc are all type-level asset-class refactors — exactly the work that most needs a working type-checker as a safety net. There is currently NO working typecheck anywhere (CI buried under pre-existing errors; local tsc infra-blocked by the GDrive FUSE mount). Recovering the gate before continuing the arc protects every remaining sub-batch.

---

## §1 — Investigation findings (2026-05-21)

Source: GitHub Actions CI run 26245428198 (B79.0n.MCE Step 5 fix-forward push). Build + Docker Build GREEN; TypeScript Check + Test Suite RED.

### §1.1 — TypeScript Check: 694 errors

**Distribution:**
- `client/` — 37 errors (5%)
- `server/` — 658 errors (94%)
- other — 2 errors

**By error code (top 6):**

| Code | Count | Meaning |
|---|---|---|
| TS2339 | 220 | Property does not exist on type |
| TS2345 | 114 | Argument not assignable to parameter |
| TS2304 | 87 | Cannot find name |
| TS2353 | 45 | Object literal unknown property |
| TS2322 | 45 | Type not assignable |
| TS18046 | 34 | Value is of type 'unknown' |

**Concentration — the errors are NOT 694 independent bugs. They cascade from a moderate set of root causes:**

Top files (5 files = 393 errors = 56% of all errors):

| File | Errors |
|---|---|
| `server/routes.ts` | 213 |
| `server/storage.ts` | 59 |
| `server/routes/vts.ts` | 44 |
| `server/services/vts-runner.ts` | 43 |
| `server/services/signal-orchestrator.ts` | 34 |

**Root-cause clustering — concrete evidence:**

- **TS2304 (87 "cannot find name"):** 40 are a single missing type `TradingMode`; 14 are a single missing `settings`; 5 are `aiOpportunitiesService`. Top 3 root causes = 59 of 87 errors. Fixing 3 imports/declarations resolves ~68%.
- **TS2339 (220 "property does not exist"):** clusters by the mis-typed TYPE — 21 on the storage class, 20 on a too-narrow user/auth object literal, 17 on `Phase10TradeRecord`, 12 on a conflict-resolution row type, 8 on a paper-sim balance row, 8 on `SQESignalInput`, etc. ~15-20 root-cause type definitions drive the bulk. Fixing one type definition resolves 8-21 errors each.
- **TS2345 (114 "argument not assignable"):** 42 in `routes/vts.ts`, 24 in `routes.ts` — 66 of 114 in two route files, likely a small number of mis-shaped call arguments repeated.

**Interpretation:** the 694 errors are accumulated type-debt, not 694 runtime bugs (the server BUILD passes via esbuild, which transpiles without type-checking; the system runs on staging). They are type-soundness gaps that nonetheless HIDE any new real error introduced by a future batch. A realistic estimate: **~40-70 distinct root-cause fixes** resolve the large majority; the residual is a long tail of individual errors.

### §1.2 — Test Suite: 98 failing tests across 20 files

Failure reasons (characterized from CI run log):

| Reason cluster | Count | Root cause |
|---|---|---|
| `module 'X' is not warm — call prefetchModule(...)` | ~52 | Tests exercise code doing sync `module_constants` reads but the test harness does not pre-warm the module cache in `beforeAll`/`beforeEach`. Modules seen: position_sizing, governance_modes, drift_detector, dbs_calculation, cost_geometry, strategy.vwap_pullback, etc. |
| `connect ECONNREFUSED ...:5432` | ~8 | Integration tests need a PostgreSQL instance; the CI workflow does not provide one. |
| `unexpected required knob sector_coverage_floor` | ~6 | B-PHASE-A2 added the `sector_coverage_floor` knob; some tests' module fixtures don't expect it. |
| Genuine assertion failures (`expected false to be true`, `expected 'crypto_spot' to be 'xstock_spot'`, etc.) | ~13 | Real test-vs-code mismatches needing individual investigation. |
| Remaining long tail | ~19 | Mixed — investigate per-test. |

**Interpretation:** the test suite red is largely NOT "the product is broken" — ~52 of 98 are test-harness setup gaps (modules not pre-warmed), ~8 are CI-infrastructure (no DB). The production code mostly works (it runs on staging). The genuine-assertion-failure tail (~13-30) is the only part that may indicate real code/test drift.

### §1.3 — Local typecheck infrastructure

The working clone lives on a Google Drive FUSE mount (`G:\My Drive\...`). `npm install` cannot complete there — npm's many-small-files write pattern triggers `EBADF` / `TAR_ENTRY_ERROR` failures on the FUSE layer. `node_modules` is permanently incomplete, so `npx tsc` produces ~18k cascade errors from missing type definitions — unusable. **There is no working local typecheck.** During B79.0n.MCE the only verification method available was diffing CI error counts against a known-good prior commit — a fragile workaround that degrades as batches rewrite more code.

---

## §2 — Objectives

| # | Objective | Verification |
|---|---|---|
| 1 | Restore a working LOCAL typecheck (off the FUSE mount) | `npx tsc --noEmit` runs to completion in the local dev environment + a documented runbook exists |
| 2 | CI TypeScript Check → GREEN (zero errors) OR green-minus-explicitly-documented-residual | CI run shows TypeScript Check ✓, OR a residual list is tracked in RUNNING_ISSUES with each entry justified |
| 3 | CI Test Suite → GREEN | CI run shows Test Suite ✓ |
| 4 | CI cannot silently regress to red unnoticed again | A per-batch CI-status confirmation step is added to the canonical workflow (Step 5) + documented in CLAUDE.md |
| 5 | CLAUDE.md §7 "ALL 4 GREEN" claim corrected to reflect reality + the recovery | §7 updated; PHASE_HISTORY / BATCH_CATALOG record the recovery |

---

## §3 — Approach — root-cause-first, phased

The investigation shows both reds cluster heavily. The batch is phased so the cheapest high-leverage work lands first and unblocks fast local iteration.

### Phase 0 — Restore local typecheck (do FIRST)

Establish a second clone of the repo on a **non-GDrive local disk** (e.g. `C:\dev\DawnTraderV3`) used purely for `tsc` + `vitest`. The GDrive-mounted clone stays the canonical working copy (Langston's mount visibility, governance docs). The local mirror is sync-from-canonical for fast type/test feedback. Document the runbook in CLAUDE.md (a new "Local verification environment" section). ~half day. This unblocks every subsequent phase — the fixer can iterate locally instead of waiting 3-4 min per CI round-trip.

**Alternative considered:** run tsc on the staging server. Rejected — staging is at the deployed commit; syncing uncommitted changes there pollutes the deploy environment.

### Phase 1 — TypeScript errors → green

Root-cause-first, NOT file-by-file-symptom-chasing. Order:

1. **TS2304 quick wins** — fix the `TradingMode` / `settings` / `aiOpportunitiesService` missing-name root causes (~59 errors from 3 fixes).
2. **TS2339 type-definition cluster** — fix each mis-typed root-cause type (storage class, user/auth object, `Phase10TradeRecord`, conflict-resolution row, paper-sim balance row, `SQESignalInput`, etc.). Each fix resolves 8-21 errors. ~15-20 root causes.
3. **TS2345 route-argument cluster** — `routes/vts.ts` + `routes.ts` argument mismatches.
4. **`routes.ts` deep-clean** — at 213 errors this file is the epicenter and likely needs its own focused sub-phase even after the cross-cutting type fixes land. Expect 20-40 distinct root causes within this one file.
5. **Long-tail residual** — individual errors not covered by a cluster.

### Phase 2 — Test failures → green

1. **Module-warming harness fix (~52 failures)** — establish a shared test-setup helper that pre-warms the required `module_constants` modules in `beforeAll`. ONE harness fix pattern resolves the bulk.
2. **CI PostgreSQL service (~8 failures)** — add a `postgres` service container to the CI workflow so DB-dependent integration tests can run. (Decision point — see §6.)
3. **`sector_coverage_floor` fixture updates (~6 failures)** — update test module-fixtures to include the B-PHASE-A2 knob.
4. **Genuine assertion-failure tail (~13-30)** — investigate each; fix real code/test drift. THIS is where care is needed — a failing assertion may be a real bug, not a stale test.

### Phase 3 — Lock it

Add a per-batch CI-status confirmation to the canonical Step 5 workflow + a CLAUDE.md note, so a future silent regression to red is caught immediately rather than discovered N batches later.

---

## §4 — Risk discipline (NON-NEGOTIABLE)

**"Fixing" type errors is deceptively dangerous.** The lazy fix is to widen a type to `any`, add a non-null `!`, or loosen a signature until the error disappears — which HIDES a real mismatch instead of resolving it. Per CLAUDE.md §15 NO PATCHES:

- Every type fix must address the actual mismatch — correct the type definition, fix the real shape, or correctly narrow. Not `any`-casting it away.
- Every test "fix" must preserve the test's intent. If a test genuinely asserts wrong behavior, that is a code bug to surface, not a test to silence.
- Each phase gets a Langston code-level review of the actual diff (this batch is high-touch — many files — so review discipline matters MORE, not less).
- Any error that genuinely cannot be fixed without a larger refactor is documented as a tracked RUNNING_ISSUES residual with a justification — never `@ts-expect-error`-ed into fake-green silently.

---

## §5 — Sequencing

Recommended: **B-NEW-43 runs BEFORE the next B79.0n sub-batch (#5).** Rationale — the remaining 14 sub-batches are all type-refactors; each one shipped without a typecheck gate compounds the risk. B79.0n.MCE deploys 2026-05-22T12:00Z+ as planned (it is already verified-clean-relative-to-baseline + Langston-ACK'd — no reason to hold it). B-NEW-43 begins after B79.0n.MCE closes (Step 11).

**Not recommended:** interleaving B-NEW-43 with the arc. Two batches in flight breaks the one-batch-at-a-time workflow.

---

## §6 — Decisions

**Kyle decisions LOCKED 2026-05-21:**

(A) **Batch size — ONE batch with internal Phases 0-3.** ✅ LOCKED. The phases are tightly coupled (green TS is the precondition for meaningful green tests) and a single completion report keeps the recovery coherent. If the effort estimate after Phase 0 calibration exceeds ~6 days, CC re-surfaces a split proposal to Kyle — otherwise it stays one batch.

(C) **CI PostgreSQL service — APPROVED.** ✅ LOCKED. A `postgres` service container is added to the CI workflow so the ~8 DB-dependent integration tests run rather than being skipped. Requires a `.github/workflows/` CI-workflow file change (in scope for Phase 2).

**Sequencing — LOCKED:** B-NEW-43 runs BEFORE B79.0n sub-batch #5. ✅ (See §5.)

**Standing items (not decisions — recorded for the record):**

(B) **Effort estimate.** Honest range: **3-6 focused days.** Phase 0 ~0.5d; Phase 1 ~1.5-3d (routes.ts is the wildcard); Phase 2 ~1-1.5d; Phase 3 ~0.5d. Firms up after Phase 0 + the first TS2339 cluster fix calibrates the per-cluster rate. If it trends past ~6d, CC re-surfaces the split option per (A).

(D) **Green target.** Aim for FULL green on both checks. If a genuine hard residual emerges it gets a tracked RUNNING_ISSUES entry with justification — but the default target is zero. NOT `@ts-expect-error`-faked.

(E) **B79.0n.MCE attribution.** Verified: B79.0n.MCE added zero new server TS errors (it removed one). The 694 are all pre-B79.0n.MCE debt. B-NEW-43 owns all of it.

---

## §7 — What this batch does NOT do

- Does not touch asset-class / B79.0n functionality.
- Does not change runtime behavior — type fixes + test-harness fixes only. Any change that would alter runtime behavior is out of scope and gets flagged to Kyle.
- Does not rewrite `routes.ts` architecture — it fixes the type errors in place. A routes.ts structural refactor, if warranted, is a separate future batch.

---

## §8 — Open questions for Langston (Step 1 ACK gate)

1. Concur with root-cause-first phasing over file-by-file symptom-chasing?
2. Concur Phase 0 (local-tsc infra) goes first as the iteration-unblocker?
3. Concur the CI PostgreSQL service addition (§6 C)?
4. One batch with internal phases, or split (§6 A)?
5. Any concern with running B-NEW-43 before B79.0n sub-batch #5?

Reply: **scope ACK** / **concerns** / **resequencing**.

— Claude Code, 2026-05-21 PM (B-NEW-43 CI-Recovery scope draft)
