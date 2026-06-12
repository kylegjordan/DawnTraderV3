# P19-B1 PRE-AUDIT — Test-Suite Cleanup (Step 2)

**Date:** 2026-06-12/13 · **Author:** Claude New (CC-B) · **Scope:** `P19_B1_SCOPE.md` (Langston ACK with 3 notes, all addressed below)
**Status:** v1 — dispatched for Langston Step-2 review. **One Kyle decision pending (§2) — blocks Bucket-A implementation only.**

---

## §0 PREVIOUSLY-STATED-VS-NOW

1. **PREVIOUSLY:** Bucket C = "2 files / 8 tests need genuine diagnosis." **NOW:** Bucket C is EMPTY — diagnosis completed at pre-audit. All 7 `b79-0m-b2-pattern-filter` failures share ONE root cause (unmocked DB dependency, §1); `b72-dbs-routing-guards-consistency` is a suite-level DB collapse (same class as Bucket A). **Zero production regressions found.** REASON: evidence-first diagnosis (assertion capture + git archaeology) ran ahead of schedule.
2. **PREVIOUSLY:** red-list arithmetic 13 vs headline 12 (Langston note 1). **NOW resolved:** 12 failed tests = pattern-filter 7 + regime-scan 5; b72 fails at suite level (hook/import) contributing 0 to the test count. Pinned by isolated re-run: `3 failed files | 12 failed tests | 4 passed | 5 skipped`.

## §1 Bucket A — hypothesis CONFIRMED by direct evidence (stronger than the planned DB-up falsification)

Captured assertion output for pattern-filter (c)-(h): every case dies pre-assertion with `AggregateError: connect ECONNREFUSED ::1:5432 / 127.0.0.1:5432`, thrown from a REAL pg query in production code the test never mocks:

- `server/asset_classes/xstock_spot/pattern-filter.ts:247` — `await getConstant('xstock_spot','min_ohlc_history_bars',...)` → `server/services/module-constants-service.ts:142` → `:82` `db.select()` → pool connect → refused (nothing listens on the `vitest.config.ts:10` hardcoded `postgresql://test:test@localhost:5432/test` on the bench).
- **Git archaeology:** test + module authored `4c60d259e` (2026-05-11) with HARDCODED floor 60 — DB-free, green. `756b64e49` (B-NEW-34, 2026-05-15) replaced the hardcode with the DB read — the unmocked dependency enters here. `2117dfb45` (B-NEW-43 chunk 9, 2026-05-23) modernized fixtures but added no mock; the SAME DAY B-NEW-43 chunk 2 gave CI its Postgres container, so CI went green **via the database**, masking the gap ever since.
- Cases (a)/(b) pass because they return at `:166-175` / `:181-190`, before the `:247` read.
- **Both Langston Bucket-C drift hypotheses REFUTED with evidence:** thresholds come from the test's own mocked row (lqMin 43 / vnMax 0.98 / di 3..100 — never the DB; case (c) already threshold-agnostic regex); `evaluateXstockPatternFilter` signature + `getScreenerFilters({mode, assetClass, filterPath})` call shape unchanged since authorship (B.1.5 only appended optional back-compat params).
- CI head run `27447644295` completed success = positive control.

**Re-bucketed red list:** Bucket A = 8 whole-file collapses + b72 (suite-level) + pattern-filter's environment trigger = everything except the 5 regime-scan tests (Bucket B, Windows-path artifact in the TEST).

## §2 Bench environment — machine survey + decision (⚠️ KYLE APPROVAL REQUIRED)

Survey of the bench machine (2026-06-13): **NO Docker, NO WSL, NO native Postgres (`psql` absent), port 5432 silent, no podman.** There is currently no way to run the DB-coupled test files locally at all.

**Recommendation (Langston-endorsed Step-1 note 2): install Docker Desktop (with WSL2 backend) on the bench machine.**
- Compose file checked into the repo pinning `pgvector/pgvector:pg17` — the exact ci.yml image — creating user/pass/db `test`/`test`/`test` on :5432 to conform to the `vitest.config.ts:10` URL (the config is CI-parity ground truth; the bench conforms to it, never vice versa).
- One-command runbook falls out: compose up → `npm run db:migrate` → `npx vitest run`.
- **Why Kyle must decide:** it is an admin software install on his machine (WSL2 enable + Docker Desktop, possible reboot). Docker Desktop is free for personal use.
- **Fallback if declined:** native Postgres 17 for Windows + hand-built pgvector — WORKS but is a separately-versioned parity gap (Langston: "a parity batch creating a new parity gap") and a heavier maintenance tail. Not recommended.
- **Interim (until install):** Buckets B, C-fix (mock route §3), D-prep, and E proceed; DB-coupled files stay bench-red, CI remains the gate for them. Bucket-A close criterion unchanged.

## §3 Pattern-filter fix route — MOCK route (decision + rationale)

Fix the unit test by mocking `module-constants-service` (sibling precedent: `b79-0m-b2-pattern-strategy-constants-fallback.test.ts:63`; test-only seeder exists: `_seedModuleCacheForTests`, `module-constants-service.ts:266`). Rationale: a UNIT test must not carry a hidden integration dependency even after the bench gets a DB — the environment route would mask the same class of gap the next time production gains a dependency. The 8 integration/system files keep the environment route (they are legitimately DB-coupled; that is what integration means). b72 gets the same treatment as the other integration files.

## §4 Bucket B — test-side path normalization

Normalize scanned paths (or the exemption matcher) to forward slashes before the `server/config/` exemption test. Guard-the-guard criterion stands: a deliberately-planted violation in a scratch file must still be caught post-fix on both separators.

## §5 Bucket D — TEC.b strict restore (park record verified + Langston's required production check DONE)

- **Park record:** RUNNING_ISSUES #141, line 367 block (2026-06-09): strict flip attempted, type-clean, but full vitest 12 → 62 (+50 across ~15-20 files) from stale TEC mocks missing `rung_floor_slippage_buffer_multiplier` (the soft `pick` silently backfilled it); REVERTED clean; Kyle folded into Phase-19-start cleanup. (Disambiguation: B79.TEC.b May-10 SQL-wildcard item is a different, closed thing.)
- **Surface (HEAD):** `server/services/trailing-exit-controller.ts` — `ALL_TEC_KEYS` 11-key SSOT `:344-356`; soft `pick` closure `:402-415`; **`refreshTECConfigForClass` `:369-443` is the flip target**; scaffolding to remove `:362-367` (`_tecPickFallbackCount`, `TEC_PICK_FALLBACK_LOG_EVERY`, `getTECPickFallbackStats`); callers `:288` + `:1340`; strict test `b79-0n-tec-b-strict-hardfail.test.ts` was reverted with the park and must be RE-CREATED.
- **✅ Langston Step-1 required check — staging production `PICK_FALLBACK` grep: ZERO** in both `/var/log/dawntrader/out.log` and `error.log` (window: since last restart, 2026-06-12 ~13:30Z deploy, full active trading day). Corroborates the 48h verify-gate (passed 2026-05-28, alert `cbe84d5b`, re-confirmed over 200k PM2 log lines). The restore is **test-surface-only**; no live key seeding needed.
- **Stale-mock inventory (per-key grep at HEAD):** 6 files confirmed missing ONLY the rung-floor key (`trailing-exit.test.ts`, `b65-tec-parity`, `b79-tec-per-class-cache`, `b80-tec-per-trade-keying`, `b-new-42-tec-split-resilience`, `b-new-42-tec-halt-resilience`); 2 partial-key files to verify (`b65-migration-validation`, `b65-module-constants-resolution`); model 11/11 fixture = `b-new-40-tec-refresh-hang.test.ts:37-45`. The park record's ~15-20 includes INDIRECT TEC bootstrappers (candidate superset: 39 files matching `getModuleConstants|module-constants-service` under server/tests/) — exact +50 membership is only re-derivable on a DB-parity bench.
- **ORDERING CONSEQUENCE (added to step plan):** Bucket A lands BEFORE Bucket D so the strict flip's true blast radius is measured on a bench that can run the whole suite.
- **Blast-radius addition:** `server/core/math/cost-model.ts` is a third consumer of the rung-floor key — include in the Step-4 diff review checklist. SIM consultation: TEC refresh fence + cache maps (SIM `:815-829`), edit-trailing-exit-controller caller checklist (SIM `:1196` — tec-evaluator, vts-runner exit loop, paper checkExitConditions, parity tests b65/b80), cost-model coupling (SIM `:933`).

## §6 Bucket E — 141 skips

Audit at Step 3 as scoped. Per Langston's exit-gate nuance: platform-conditional skips become the named reconciliation artifact for bench-vs-CI totals ("match modulo documented platform-conditional skips, each named").

## §7 Revised implementation order

A (env parity — **gated on Kyle §2**) → B (path fix) → C-fix (mock route, can start immediately) → D (strict flip, AFTER A) → E (skip audit). Single Step-4 dispatch with per-bucket embedded diffs. If Kyle's Docker decision is delayed: B + C-fix + E proceed; A + D wait.
