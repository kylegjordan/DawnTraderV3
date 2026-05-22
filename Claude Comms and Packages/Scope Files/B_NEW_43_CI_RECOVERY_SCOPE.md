# B-NEW-43 — CI Recovery — Scope (rev3 — Phase 4 alert-notification fix folded in per Kyle directive)

> **rev3 (2026-05-22):** Kyle directive — fold the system-alerts active-push notification fix (RUNNING_ISSUES #135) into B-NEW-43 as a new **Phase 4**. Rationale (Kyle's call): small, self-contained ops-hardening; avoids a separate single-item batch; thematically adjacent to Phase 3 (both prevent silent failures going unnoticed). **Material implication surfaced to Kyle:** B-NEW-43 is no longer purely type-and-test-only — Phase 4 IS a runtime change (the system-alerts dispatcher gains Telegram-post + Langston-invoke behavior). §7 amended to carve out Phase 4; Phase 4 gets its own staging deploy + Step 4/7/8 verification + a focused pre-audit addendum authored when Phase 4 is reached. Phases 0-3 (the CI work) are unchanged and unaffected — Phase 4 runs strictly last so it cannot entangle them. Added: objective 6 (§2), Phase 4 (§3), §6(A)/(B) updated, §7 amended. **Langston ACK'd rev3** — Phase 4 addition approved; 8 concerns recorded for the Phase-4 pre-audit addendum (listed in §3 Phase 4) + a §5 Phase-4 escape clause added at his recommendation. Phases 0-3 remain ACK'd from rev2.

> **rev2 (2026-05-21):** Langston Step 1 ACK received — all 5 §8 questions concur, all 3 Kyle decisions sound, 6 code-level concerns folded in below (scope-tightening, not approach-changing — Langston: "fold them into the Step 2 pre-audit checklist and we're aligned"). Scope is FINALIZED. Folded: (1) routes.ts/storage.ts commit-chunking discipline → §3 Phase 1; (2) module-warming harness mirrors-production-not-hides rule → §3 Phase 2.1; (3) genuine-assertion-tail per-failure individual surfacing → §3 Phase 2 + §4; (4) "batch adding a required knob updates the canonical test fixture" → §3 Phase 3; (5) CI-workflow YAML own Step-4 review → §3 Phase 2.2; (6) "fake-green audit" git-grep at phase boundaries → §4. Plus Q2 local-mirror sync protocol → §3 Phase 0; Q3 CI database schema bootstrap → §3 Phase 2.2.



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
| 6 | System-alerts queue actively pushes when an alert fires (RUNNING_ISSUES #135) — no longer relies solely on the §10.5 per-turn pull check | The `fire-due` dispatcher posts each newly-promoted alert to Telegram topic 21 + invokes Langston; verified by a test alert firing → Telegram post observed + a Langston session running |

---

## §3 — Approach — root-cause-first, phased

The investigation shows both reds cluster heavily. The batch is phased so the cheapest high-leverage work lands first and unblocks fast local iteration.

### Phase 0 — Restore local typecheck (do FIRST)

Establish a second clone of the repo on a **non-GDrive local disk** (e.g. `C:\dev\DawnTraderV3`) used purely for `tsc` + `vitest`. The GDrive-mounted clone stays the canonical working copy (Langston's mount visibility, governance docs). Document the runbook in CLAUDE.md (a new "Local verification environment" section). ~half day. This unblocks every subsequent phase — the fixer can iterate locally instead of waiting 3-4 min per CI round-trip.

**Sync protocol — ONE-DIRECTION-EDIT discipline (Langston Q2 concern — split-brain prevention).** Two working copies is a drift hazard. The rule:
- **Code edits land in the local mirror ONLY** (where `tsc` + `vitest` run fast). Push to GitHub from the mirror.
- **The GDrive clone is refreshed via `git pull` only** — never edited for code. It stays canonical for governance-doc authoring + Langston's FUSE-mount visibility.
- **No bidirectional rsync.** Bidirectional sync is the classic split-brain footgun — explicitly forbidden. Git is the single sync channel (mirror → push → GDrive clone pulls).
- The CLAUDE.md runbook documents this as a hard rule.

**Alternatives considered + rejected:**
- *tsc on the staging server* — rejected: staging is at the deployed commit; syncing uncommitted changes there pollutes the deploy environment.
- *A non-staging Hetzner dev box* — rejected vs the local C:-drive mirror on workflow-simplicity grounds: a remote box means SSH-based editing or a sync-to-remote step, whereas the local mirror keeps editing on Kyle's laptop with zero added latency. The mirror is the simplest path to a fast local typecheck for a laptop-based workflow.

### Phase 1 — TypeScript errors → green

Root-cause-first, NOT file-by-file-symptom-chasing. Order:

1. **TS2304 quick wins** — fix the `TradingMode` / `settings` / `aiOpportunitiesService` missing-name root causes (~59 errors from 3 fixes).
2. **TS2339 type-definition cluster** — fix each mis-typed root-cause type (storage class, user/auth object, `Phase10TradeRecord`, conflict-resolution row, paper-sim balance row, `SQESignalInput`, etc.). Each fix resolves 8-21 errors. ~15-20 root causes.
3. **TS2345 route-argument cluster** — `routes/vts.ts` + `routes.ts` argument mismatches.
4. **`routes.ts` deep-clean** — at 213 errors this file is the epicenter and likely needs its own focused sub-phase even after the cross-cutting type fixes land. Expect 20-40 distinct root causes within this one file.
5. **Long-tail residual** — individual errors not covered by a cluster.

**Commit-chunking discipline (Langston concern 1).** A single mega-commit of 213 errors in `routes.ts` makes the Step 4 review impractical. `routes.ts` fixes are chunked by logical route section (auth routes / VTS routes / scanner routes / etc.) so each commit is ~20-40 errors and individually reviewable. Same constraint on `storage.ts` (59 errors) — split by storage-method group. Each chunk-commit is independently Langston-reviewable; the Step 4 review proceeds chunk-by-chunk rather than as one unreviewable blob.

### Phase 2 — Test failures → green

1. **Module-warming harness fix (~52 failures)** — establish a shared test-setup helper that pre-warms the required `module_constants` modules in `beforeAll`. ONE harness fix pattern resolves the bulk.

   **MIRRORS-production-not-HIDES rule (Langston concern 2).** The harness `beforeAll` pre-warms **exactly the module list the production boot sequence pre-warms** (`prefetchModule` calls in the server bootstrap path). The harness fix matches production reality — production warms these modules at startup, so a test that warms the same set is testing the real configured state, not masking a gap. **Hard rule:** if a test needs a module that the production boot sequence does NOT warm, that is a code-side bug (a sync read of an un-warmed module) to surface and fix — NOT a reason to extend the harness warm-list beyond production's. The pre-audit enumerates production's exact warm-list as the authoritative reference.

2. **CI PostgreSQL service (~8 failures)** — add a `postgres` service container to the CI workflow so DB-dependent integration tests can run (§6 C — Kyle-LOCKED).

   **CI database schema bootstrap (Langston Q3 concern).** A bare Postgres container has no schema — without bootstrapping, the ~8 `ECONNREFUSED` failures just convert to `relation does not exist` failures (same red, different reason). **Decision: the CI workflow runs `npm run db:push` (Drizzle `drizzle-kit push`, already an npm script) against the CI Postgres in a workflow step BEFORE `vitest`.** Drizzle's `db:push` syncs the schema directly from `shared/schema.ts` — no separate committed schema dump to maintain (it can't drift from the source of truth). The workflow wires `DATABASE_URL` to the service container's ephemeral credentials. Pre-audit confirms the exact service-container config + env wiring.

   **CI-workflow YAML own-Step-4-review (Langston concern 5).** The `.github/workflows/` YAML diff (Postgres service + db:push step + DATABASE_URL wiring) is small but high-blast-radius — it gates every future CI run. It gets its OWN explicit Step 4 review attention, in its own commit, NOT bundled with test-code edits.

3. **`sector_coverage_floor` fixture updates (~6 failures)** — update test module-fixtures to include the B-PHASE-A2 knob.

4. **Genuine assertion-failure tail (~13-30)** — investigate each; fix real code/test drift. THIS is where care is needed — a failing assertion may be a real bug, not a stale test.

   **Per-failure individual surfacing (Langston concern 3).** This is where the "silence the test" temptation lives. Each genuine assertion failure gets, in the Step 4 review: (a) what the test asserts, (b) what the code actually does, (c) which is correct and why. These are NOT buried in a bulk commit alongside fixture updates — each genuine failure (or a tight cluster of ~3 closely-related ones) gets its own commit with a per-commit justification block. A failing assertion that turns out to be a real code bug is surfaced to Kyle, not silently "fixed" by adjusting the test.

### Phase 3 — Lock it

Add a per-batch CI-status confirmation to the canonical Step 5 workflow + a CLAUDE.md note, so a future silent regression to red is caught immediately rather than discovered N batches later.

**Required-knob / test-fixture drift rule (Langston concern 4).** The `sector_coverage_floor` failures exist because B-PHASE-A2 added a required `module_constants` knob but did not update the canonical test fixture in the same batch. Phase 3 adds a standing rule to CLAUDE.md governance: **when a batch adds a required `module_constants` knob (or any required config key the test harness reads), the SAME batch updates the canonical test fixture / harness warm-list.** This is folded into the per-batch CI-status confirmation step so the drift cannot recur silently.

### Phase 4 — System-alerts active-push notification (folded in rev3, Kyle directive 2026-05-22)

**Runs LAST, strictly after Phase 3.** Closes RUNNING_ISSUES #135. The system-alerts queue is currently passive — the `fire-due` dispatcher cron only flips a scheduled alert to `state=active` when `triggers_at` passes; it posts nothing and invokes no one. The sole surfacing path is the CLAUDE.md §10.5 per-turn pull check, which has two coverage gaps: (a) it only runs while a CC session is actively in progress; (b) Langston — a non-persistent process invoked per `claude -p` — cannot run it autonomously at all.

**Fix:** when `fire-due` promotes an alert to active, it additionally (1) posts the alert (title + body, plain text) to Telegram topic 21 via `cc-comms-bridge` so Kyle sees it, and (2) invokes Langston via SSH+`claude -p` with the alert body so a Langston session actually runs and performs the §10.5 surfacing. The push is idempotent — an already-pushed alert is not re-pushed (guard on a `pushed_at` field or equivalent on the alert record).

**This phase IS a runtime change** (unlike Phases 0-3 — see §7). It therefore: gets a focused **pre-audit addendum** authored when Phase 4 begins (blast radius: the `fire-due` dispatcher + its cron wrapper, `cc-comms-bridge`, the Langston SSH-invoke path, the alert-record schema if a `pushed_at` guard field is added); gets its **own Step 4 review**; lands in its **own commit(s)**; and requires a **staging deploy** (the dispatcher runs on staging) plus Step 7/8 verification. Effort ~0.5-1 day.

**Verification:** schedule a near-future test alert; on fire, confirm (a) it posts to Telegram topic 21 and (b) a Langston session runs and surfaces it; then remove/ack the test alert. Langston's Step 8 independently re-confirms.

**Phase-4 pre-audit addendum must address Langston's rev3-ACK concerns (8):** (1) schema-change blast radius if a `pushed_at` guard field is added to the alert record — `shared/schema.ts` diff + migration plan + other consumers; (2) the Langston SSH-invoke model — fresh-UUID vs canonical session, response egress path (bridge relay vs discarded stdout); (3) plain-language discipline — the Telegram-push surface ships alert `body` directly to Kyle with no CC-rendering cleanup layer, so alert `body` must be plain-English-only (technical detail → `metadata`); (4) partial-failure semantics — per-surface flags (`telegram_pushed_at` / `langston_invoked_at`) + retry-until-both; (5) concurrent fires in one cron tick (N>1 behavior); (6) restart-mid-promotion idempotency — `state=active AND pushed_at IS NULL` re-pickup; (7) effort may stretch to ~1.5d; (8) the §5 escape clause above. Langston ACK'd rev3 with these as addendum items, not scope-blockers.

---

## §4 — Risk discipline (NON-NEGOTIABLE)

**"Fixing" type errors is deceptively dangerous.** The lazy fix is to widen a type to `any`, add a non-null `!`, or loosen a signature until the error disappears — which HIDES a real mismatch instead of resolving it. Per CLAUDE.md §15 NO PATCHES:

- Every type fix must address the actual mismatch — correct the type definition, fix the real shape, or correctly narrow. Not `any`-casting it away.
- Every test "fix" must preserve the test's intent. If a test genuinely asserts wrong behavior, that is a code bug to surface, not a test to silence.
- Each phase gets a Langston code-level review of the actual diff (this batch is high-touch — many files — so review discipline matters MORE, not less).
- Any error that genuinely cannot be fixed without a larger refactor is documented as a tracked RUNNING_ISSUES residual with a justification — never `@ts-expect-error`-ed into fake-green silently.

**Fake-green audit at every phase boundary (Langston concern 6).** At the end of Phase 1 AND the end of Phase 2, run an explicit suppression-audit: `git diff` the batch's range and `git grep` for any NEWLY-introduced `@ts-expect-error`, `@ts-ignore`, `as any`, `!` non-null assertion, or `it.skip` / `describe.skip`. **Zero tolerance** — every such introduction must either be removed (real fix applied instead) or carry a tracked RUNNING_ISSUES entry with an explicit justification reviewed by Langston. This is a lightweight mechanical check that catches the slippery fix-by-suppression failure mode before it ships. The audit result is recorded in the completion report.

---

## §5 — Sequencing

Recommended: **B-NEW-43 runs BEFORE the next B79.0n sub-batch (#5).** Rationale — the remaining 14 sub-batches are all type-refactors; each one shipped without a typecheck gate compounds the risk. B79.0n.MCE deploys 2026-05-22T12:00Z+ as planned (it is already verified-clean-relative-to-baseline + Langston-ACK'd — no reason to hold it). B-NEW-43 begins after B79.0n.MCE closes (Step 11).

**Not recommended:** interleaving B-NEW-43 with the arc. Two batches in flight breaks the one-batch-at-a-time workflow.

**Phase 4 escape clause (Langston rev3 concern 8).** Phases 0-3 (the CI work) are what gate the B79.0n arc — they must close green before sub-batch #5. Phase 4 (alert-notification fix) is independent ops-hardening. If Phases 0-3 close green but Phase 4 hits a snag, B-NEW-43 may close on the completed CI work with Phase 4 split to an immediate follow-up (B-NEW-43.4 or equivalent) rather than held open — alert-push trouble must not hold up the 14 remaining type-refactor sub-batches.

---

## §6 — Decisions

**Kyle decisions LOCKED 2026-05-21:**

(A) **Batch size — ONE batch with internal Phases 0-4** (Phase 4 added rev3 per Kyle directive). ✅ LOCKED. Phases 0-3 are tightly coupled (green TS is the precondition for meaningful green tests) and a single completion report keeps the recovery coherent. Phase 4 (alert-notification fix) is a deliberately-isolated last phase — independent of the CI work, runs strictly after Phase 3. If the effort estimate after Phase 0 calibration exceeds ~8 days, CC re-surfaces a split proposal to Kyle — otherwise it stays one batch.

(C) **CI PostgreSQL service — APPROVED.** ✅ LOCKED. A `postgres` service container is added to the CI workflow so the ~8 DB-dependent integration tests run rather than being skipped. Requires a `.github/workflows/` CI-workflow file change (in scope for Phase 2).

**Sequencing — LOCKED:** B-NEW-43 runs BEFORE B79.0n sub-batch #5. ✅ (See §5.)

**Standing items (not decisions — recorded for the record):**

(B) **Effort estimate.** Honest range (pre-audit-revised §11 + Phase 4): **~5.75-8 focused days.** Phase 0 ~0.75-1d; Phase 1 ~2.5-3.5d (routes.ts is the wildcard); Phase 2 ~1.5-2d; Phase 3 ~0.5d; Phase 4 ~0.5-1d. Firms up after Phase 0 + the first TS2339 cluster fix calibrates the per-cluster rate. If it trends past ~8d, CC re-surfaces the split option per (A).

(D) **Green target.** Aim for FULL green on both checks. If a genuine hard residual emerges it gets a tracked RUNNING_ISSUES entry with justification — but the default target is zero. NOT `@ts-expect-error`-faked.

(E) **B79.0n.MCE attribution.** Verified: B79.0n.MCE added zero new server TS errors (it removed one). The 694 are all pre-B79.0n.MCE debt. B-NEW-43 owns all of it.

---

## §7 — What this batch does NOT do

- Does not touch asset-class / B79.0n functionality.
- **Phases 0-3 do not change runtime behavior** — type fixes + test-harness fixes + CI-config only. Any runtime-behavior change within Phases 0-3 is out of scope and gets flagged to Kyle. **Phase 4 is the sole, deliberate exception** (folded in rev3): it is an isolated runtime change to the system-alerts dispatcher, with its own pre-audit addendum, Step 4 review, staging deploy, and verification — kept strictly last so it cannot entangle the Phases 0-3 type/test work.
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
