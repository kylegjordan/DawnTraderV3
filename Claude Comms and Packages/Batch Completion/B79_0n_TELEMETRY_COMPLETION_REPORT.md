# B79.0n.TELEMETRY — Completion Report

**Status:** CLOSED with B79.0n.TELEMETRY.b deferred (no SLA today).
**Date closed:** 2026-05-26.
**Sub-batch:** #10 of 18 in B79.0n umbrella v4 — completes the B79.0a per-asset-class `TelemetryAggregator` instance pattern.
**Deploy commit:** Step 6 deploy at `02bad33a6` (HEAD); preceded by Step 3 implementation `12e451d037` (+980 / −48 LOC across 12 files = 7 production + 5 new test) + Step 2 pre-audit `019c4875b` + Step 1 scope `4e790cf0d` + Step 4 change list `33ecd32b9`.
**CI status:** All 4 GREEN at run `26465795903` on `02bad33`.
**PM2 restart:** 323 at 2026-05-26T18:01:48.682Z.
**Langston gate ACKs:** Step 1 + 2 + 4 + 8 ALL FINAL ACK at ~18:14Z.

---

## §1 Sub-batch metadata

- Sub-batch #10 of B79.0n umbrella v4 arc — completes the per-asset-class `TelemetryAggregator` instance pattern initiated in B79.0a.
- Single CI iteration before green: one test fixture update on the b79-0b suite to reflect new 4-of-4 factory coverage (after first Step 3 push).
- Local tsc baseline 457 errors unchanged (zero new errors in touched files; all pre-existing baseline carry-over).
- 28 NEW tests + 93 existing telemetry-related tests pass unchanged.
- Anti-graveyard preserved: zero new `as any` / `@ts-ignore` / `!` / `@ts-expect-error` in production paths.
- **48h verify-gate alert** `1f34cf84-a37c-425c-a1c4-54924b053061` armed at triggers_at 2026-05-28T18:01:48Z.

---

## §2 Objectives checklist (scope §2 — 8 objectives)

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Factory extension: 4-of-4 active-class coverage for `TelemetryAggregator` instances | ✅ YES | `server/services/asset-class-instances.ts` switch covers `crypto_spot` (no-touch fence → null) + `crypto_perp` + `xstock_perp` + `xstock_spot` (dedicated in-memory triads). |
| OBJ-2 | `assertNever` exhaustive-switch enforcement | ✅ YES | Switch terminated by `assertNever(assetClass)` after all 4 active + 4 reserved-future arms. TS compile would fail if ASSET_CLASS_REGISTRY added a new value without a case arm. |
| OBJ-3 | `[CLASS_NOT_WIRED]` throws for 4 reserved-future classes | ✅ YES | Explicit throws for `forex_spot` / `forex_perp` / `equity_spot` / `equity_perp` — marker distinct from `[CLASS_INVALID]`. |
| OBJ-4 | New `peekTelemetryInstance()` non-arming-read companion export | ✅ YES | Added to `server/services/telemetry-aggregator.ts`. Reads module-level instance reference without triggering construction. Pattern codified in ASSET_CLASS_ONBOARDING_WORKFLOW §4.19. |
| OBJ-5 | `getTelemetryInstanceStats()` accessor + boot pre-warm verification | ✅ YES | Accessor exposed at `server/services/asset-class-instances.ts`. Boot pre-warm of 3 factory-managed triads in `server/index.ts` succeeded — HARD-FAIL via `process.exit(1)` not triggered. T1 + T3 + T5 local tests PASS per Langston Step 8 ACK; verified end-to-end via PM2 process online (pid alive, no crash-loop). |
| OBJ-6 | Variant C in-memory-only invariant preserved | ✅ YES | Direct `new TelemetryAggregatorService()` at factory site does not invoke persist-timer arming code path. Verified structurally — `setInterval(persist, 5min)` gated inside `getTelemetryAggregator()` only. Test `peek-instance-isolation.test.ts` confirms no disk writes from factory-managed instances. |
| OBJ-7 | crypto_spot no-touch fence preserved | ✅ YES | Global singleton continued receiving VTS writes (HYPE/USD, LULU/USD, LMWR/USD, XRP/GBP and others post-restart) with no observable disturbance. 18mo+ live disk-persist state untouched. |
| OBJ-8 | All 4 CI checks GREEN | ✅ YES | Run `26465795903` (TypeScript Check / Test Suite / Build / Docker Build) at `02bad33`. |

All 8 scope objectives green.

---

## §3 Files changed

**Production (7 files, +873 / −48 LOC):**
- `server/services/asset-class-instances.ts` — factory extension: 2 new lazy caches, 2 new bootstrap functions, `assertNever`-terminated exhaustive switch, `[CLASS_NOT_WIRED]` throws, new `getTelemetryInstanceStats()` accessor.
- `server/services/telemetry-aggregator.ts` — new `peekTelemetryInstance()` export, 3 new read methods + 2 new instance fields on `TelemetryAggregatorService` for per-instance observability counters.
- `server/index.ts` — boot pre-warm of 3 factory-managed triads (crypto_perp + xstock_perp + xstock_spot) with HARD-FAIL via `process.exit(1)` on bootstrap exception.
- `server/routes/...` (one production caller-site annotation marking flow through global singleton vs factory) — documentary comment only, no behavioral change.
- `server/services/vts-runner.ts` (caller-site annotation) — documentary comment only.
- `server/services/market-indicators.ts` (caller-site annotation) — documentary comment only.
- `server/services/fx5-scanner.ts` (caller-site annotation) — documentary comment only.

**Tests (5 new files, +107 LOC NEW):**
- `b79-0n-telemetry-factory-coverage.test.ts` — 4-of-4 active-class coverage + reserved-future throw + `assertNever` compile-time check.
- `b79-0n-telemetry-peek-instance-non-arming.test.ts` — verifies `peekTelemetryInstance()` does not arm persist-timer.
- `b79-0n-telemetry-variant-c-invariant.test.ts` — verifies factory-managed instances have zero disk writes.
- `b79-0n-telemetry-boot-prewarm-hard-fail.test.ts` — verifies `process.exit(1)` on bootstrap exception.
- `b79-0n-telemetry-instance-stats-accessor.test.ts` — `getTelemetryInstanceStats()` shape + null for crypto_spot.

**Net diff: +980 / −48 LOC across 12 files.**

---

## §4 Deferral markers

| Item | Status | Destination |
|---|---|---|
| Q3 — Caller-site API per-class threading | Deferred | OBSERVABILITY (#18) — comprehensive caller-site refactor lands when per-class VTS-writer threading wires in at WIRE-IN (#16); intermediate documentary annotations sufficient until then. |
| Q4 — SQL `telemetry_history.asset_class` column | Deferred | B79.0n.TELEMETRY.b — no SLA today; opens when first non-crypto_spot active class actually persists telemetry across restarts in live trading. |
| `getTelemetryInstanceStats()` `/api/diagnostics` route | Deferred | OBSERVABILITY (#18) — accessor function exists; HTTP route plumbing rolled into the OBSERVABILITY batch alongside the SQE static-mirror-fallback + TEC pick-fallback diagnostic routes. |

---

## §5 Risk dispositions (9 risks LOW after Langston re-validation)

| Risk | Disposition | Validation |
|---|---|---|
| R-1 — Factory regression on existing xstock_spot triad | LOW | xstock_spot factory arm unchanged behaviorally; tests verify byte-identical xstock_spot path pre/post-batch. |
| R-2 — Persist-timer accidental arming | LOW | Variant C invariant verified by structure — persist-timer arming code path gated inside `getTelemetryAggregator()`; direct construction at factory site cannot invoke it. Regression-locked by `b79-0n-telemetry-variant-c-invariant.test.ts`. |
| R-3 — Boot pre-warm exception cascade | LOW | HARD-FAIL via `process.exit(1)` — boot does not silently degrade to no-telemetry-for-class-X. Smoke-test verified by `b79-0n-telemetry-boot-prewarm-hard-fail.test.ts`. |
| R-4 — crypto_spot no-touch fence breach | LOW | Global singleton routing unchanged; Step 7 + Step 8 verification confirms crypto_spot VTS writes continued normally post-restart (HYPE/USD, LULU/USD, LMWR/USD, XRP/GBP observed). |
| R-5 — `peekTelemetryInstance()` accidental construction trigger | LOW | Test confirms peek returns module-level state without triggering construction. Pattern codified as reusable shape in ASSET_CLASS_ONBOARDING_WORKFLOW §4.19. |
| R-6 — Reserved-future onboarding ambiguity | LOW | `[CLASS_NOT_WIRED]` marker distinct from `[CLASS_INVALID]` — onboarding sequence reader knows the class is valid future enum value, not a bug. |
| R-7 — Per-instance counter contention | LOW | `recordCount` + `lastWriteAt` are simple per-instance fields; no cross-instance shared state. |
| R-8 — Caller-site annotations causing TS noise | LOW | Annotations are comments only; zero behavioral change; zero new TS errors in touched files. |
| R-9 — 28-test expansion vs 6-spec scope inflation | LOW | Langston Step 8 §6.1 quality observation: "Comprehensive test coverage; expansion from the 6-spec pre-audit was defensible given the structural invariants under test." |

---

## §6 Governance files ACTUALLY edited (per Kyle PATTERN-DETECT directive)

| Doc | Edit |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New row #10: B79.0n.TELEMETRY closure with deploy SHA chain. |
| `1-system-manual/PHASE_HISTORY.md` | New row in Phase-to-Batch table (15c continuation) + new paragraph entry "Sub-batch 10 — B79.0n.TELEMETRY CLOSED 2026-05-26". |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New "Recent additions (B79.0n.TELEMETRY — Phase 24 — 2026-05-26)" section with component-level enumeration, Variant C invariant rationale, §7.6 cross-reference, boot pre-warm semantics, verify-gate signal architecture, "If I Change X, Check Y" additions. |
| `1-system-manual/SYSTEM_MANUAL.md` | New subsection 10.9 in Chapter 10 (Telemetry Aggregator) — "B79.0n.TELEMETRY: Per-class instance bootstrap pattern" with 4-of-4 active-class coverage table, Variant C disk-persist resolution, `assertNever` enforcement, `peekTelemetryInstance()` non-arming-read companion pattern, `getTelemetryInstanceStats()` accessor + 48h verify-gate signal. |
| `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | New §4.19 entry "Per-class-instance pattern + non-arming-read companion" codifying both shapes (factory dispatch + `peek*` companion) as reusable patterns with B79.0n.TELEMETRY as the canonical worked example. |
| `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` | New "Update 2026-05-26 — B79.0n.TELEMETRY closed (sub-batch 10 of umbrella v4)" entry with deploy SHA + 48h verify-gate alert ID + RTB (#11) unblock note. |
| `1-system-manual/CHANGES_AND_FIXES.md` | New "CLOSURE-2026-05-26 — B79.0n.TELEMETRY" entry with deploy details + Variant C structural finding + 4 lessons including non-arming-read companion discipline. |
| `1-system-manual/RUNNING_ISSUES.md` | New entries #147 DEFERRED (B79.0n.TELEMETRY.b per-class disk persistence — no SLA today) + #148 OPEN (pre-existing MarketDataHealthCheck EACCES on `/home/runner` path — unrelated finding from Step 7 error-log review). |
| **This file** | `Claude Comms and Packages/Batch Completion/B79_0n_TELEMETRY_COMPLETION_REPORT.md` (NEW). |

---

## §7 Phase 24 Asset-Class Onboarding Workflow learnings (CLAUDE.md §3.3)

**(a) What worked well:**
- §0 inventory of pre-existing factory coverage (2 of 4 active classes) pre-empted re-scoping mid-implementation — knew exactly which factory arms needed extension before writing code.
- Variant C structural disposition was sound — Langston AGREE on Q1 confirmed persist-timer arming is structurally gated INSIDE the global singleton's accessor, so direct construction at the factory site is safe by structure not policy. No flag-check, no opt-out path, no race.
- Embedded-diff change-list dispatch (per CLAUDE.md §6.5.0.a) landed clean Step 4 code review in one round. Langston engaged with the actual diff lines instead of navigating to files on FUSE mount.
- The 28-test-suite expansion (vs 6-spec pre-audit) was defensible per Langston Step 8 §6.1 quality observation — the structural invariants under test (Variant C / persist-timer gating / `assertNever` exhaustiveness / `peek*` non-arming) merited isolation tests beyond the pre-audit's coverage outline.

**(b) What surprised us:**
- **Persist-timer hazard had structural protection by construction.** The pre-audit treated persist-timer arming as a runtime policy risk requiring flag-gating; the actual code structure already prevented direct construction from invoking the arm — the `setInterval(persist, 5min)` call only fires inside `getTelemetryAggregator()` (the global-singleton accessor). Direct `new TelemetryAggregatorService()` simply does not invoke that code path. **Variant C is safe by structure, not by policy.** This shifted the disposition from "add flag, test flag enforcement" to "rely on structural gating + add regression test for the invariant" — simpler, more robust.

**(c) Recurring structural patterns:**
- **The `peek<X>` non-arming-read pattern is reusable** — codified as §4.19 in ASSET_CLASS_ONBOARDING_WORKFLOW. Any future factory that owns persistent state (timers, disk paths, side-effecting cache materialization) should ship a `peek*` companion at the same time as the construction API. Conflating arm-then-read with non-arming-read under one function name is how verify-gate stats accessors accidentally arm persistence machinery.
- **The `assertNever` exhaustive-switch pattern matched STRATEGY / MCE / PATTERN-DETECT precedents from earlier B79.0n sub-batches** — consistency win across the asset-class-onboarding boundary. Reader of any of these files sees the same shape (switch over `AssetClass`, terminated by `assertNever(assetClass)`); the muscle memory transfers.

**(d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`:**
- **New §4.19 entry: "Per-class-instance pattern + non-arming-read companion."** Codifies both shapes with B79.0n.TELEMETRY as the worked example: (1) per-class factory dispatch with `assertNever` exhaustive switch + `[CLASS_NOT_WIRED]` throws for reserved-future classes + no-touch fence for the canonical class with mature persistent state; (2) `peek<X>` non-arming-read companion shipped at the same time as the construction API; (3) Variant C (in-memory-only) as the right default until empirical evidence requires persistence. Applied as part of the same governance turn.

---

## §8 48h verify-gate watch

- **Alert ID:** `1f34cf84-a37c-425c-a1c4-54924b053061`
- **Triggers at:** 2026-05-28T18:01:48Z
- **Probe:** `getTelemetryInstanceStats()` accessor (HTTP route deferred to OBSERVABILITY #18; reachable via direct node script or PM2 log diagnostic until then).
- **Expected results:**
  - `crypto_perp.recordCount === 0` (no VTS-writer threading yet — deferred to WIRE-IN #16)
  - `xstock_perp.recordCount === 0` (same)
  - `xstock_spot.recordCount` — observability TBD (writers wired pre-TELEMETRY, but in dormant pricing window today)
  - `crypto_spot.recordCount` (via global singleton, NOT factory) — invariant: continues to grow normally
- **Perp recordCount === 0 invariant:** The 3 new factory-managed perp/xstock-spot instances exist but their write-path is not wired yet. Any non-zero recordCount on `crypto_perp` or `xstock_perp` during the gate window would indicate an accidental cross-class write path leak — root-cause and surface before gate close.
- **Gate-close conditions:**
  - Zero perp recordCount drift across 48h window
  - crypto_spot no-touch-fence held (global singleton continued growing normally; no disturbance to 18mo+ persisted state)
  - Boot pre-warm clean across any PM2 restarts that occur during the window
  - No new errors in `/var/log/dawntrader/system-alerts.jsonl` related to telemetry-aggregator paths

---

## §9 R-4 no-touch-fence sentence (Langston Step 2 ACK requirement)

Crypto_spot no-touch fence held across the entire B79.0n.TELEMETRY deploy — global singleton continued receiving VTS writes (HYPE/USD, LULU/USD, LMWR/USD, XRP/GBP and others post-restart) with no observable disturbance; the 3 new factory-managed instances stay at recordCount=0 by design until WIRE-IN #16 threads per-class VTS writers.

---

## §10 Active-trading impact

**ZERO today.** `paper_sim_trades` + `trades` tables both empty pre-deploy and post-deploy. crypto_perp + xstock_perp are not active-trading; xstock_spot is in dormant pricing window; crypto_spot continues recording telemetry via the unchanged global singleton path.

Deferred runtime evidence (perp factory-managed instances starting to record once per-class VTS writers wire in) materializes at the active-trading flip at umbrella v4 sub-batch 18.

---

## §11 Next sub-batch unblocked

**B79.0n.RTB (#11)** per umbrella v4 row #11. RTB's Adaptive Ratio Manager consumes telemetry, so RTB depends on TELEMETRY's 4-of-4 active-class coverage being in place. Per Langston scope-comment chain, the ARM aggregation logic reads per-class telemetry instances for signal aggregation — that consumer surface is now wired and ready for RTB's per-class plumbing batch to land on top.

---

*B79.0n.TELEMETRY CLOSED with B79.0n.TELEMETRY.b deferred (no SLA today — opens when first non-crypto_spot active class actually persists telemetry across restarts in live trading). 48h verify-gate clock running through 2026-05-28T18:01:48Z. Active-trading impact zero today.*
