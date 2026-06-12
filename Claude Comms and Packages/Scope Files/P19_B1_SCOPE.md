# P19-B1 SCOPE — Test-Suite Cleanup (Phase 19 batch 1)

**Date:** 2026-06-12/13 · **Author:** Claude New (CC-B) · **Status:** v1 — dispatched for Langston Step-1 ACK
**Plan home:** `1-system-manual/PHASE_19_PLAN.md` §1 row P19-B1 (roadmap §16.7 + TEC.b fold-in)
**Purpose (Kyle):** every bug Phase 19 surfaces must show up against a quiet background — a red or noisy suite hides real regressions.

---

## §0 PREVIOUSLY-STATED-VS-NOW (§9.2)

1. **PREVIOUSLY:** "59 pre-existing legacy failures" (recent completion reports) / "a dozen known stale failures" (kickoff list). **NOW:** CI = **0 failures** (Test Suite job runs `npx vitest run` with NO continue-on-error, NO baseline shim — green on HEAD `0fc03ba8e`); local C:\dev bench = **12 failed tests / 11 failed files** (1703 passed, 141 skipped, 160 files) on tonight's full run at the same commit. **REASON:** B-NEW-43 (2026-05-23) gave CI a Postgres service container + db:migrate, fixing the CI-side failures; subsequent "59"/"12" citations were bench-local numbers conflated with suite health. The roadmap §16.7 inventory (2026-05-13 snapshot) predates the B-NEW-43 fix and is stale.
2. **PREVIOUSLY:** TEC.b described as "queued, no SLA." **NOW:** PARKED 2026-06-09 (strict-throw restore exposed ~15-20 stale TEC test mocks ≈ 50 new test failures); explicitly folded into THIS batch per the park record. Tonight's bench run shows 10 distinct `[B79.0n.TEC][PICK_FALLBACK]` keys firing (count=1 each) under test — the soft-pick path is live and the mocks are still stale.

## §1 Red-list ground truth (bench run 2026-06-13, commit 0fc03ba8e, full suite 45s)

**Bucket A — whole-file collapses (8 files), hypothesis: bench-environment (no local Postgres / module_constants warm-throw):**
- `server/tests/integration/cost_telemetry.test.ts`
- `server/tests/integration/dynamic_sizing.test.ts`
- `server/tests/integration/market_indicators_narrative.test.ts`
- `server/tests/integration/net_expectancy.test.ts`
- `server/tests/system/mapping_drift_integrity.test.ts`
- `server/tests/unit/b63-item12-geometry-override.test.ts`
- `server/tests/unit/b63-item16-dbs-store.test.ts`
- `server/tests/unit/directive-11.7S-strategy-modes.test.ts`

These show `FAIL file [ file ]` (collapse before any test executes). CI runs them GREEN with its pgvector/pg17 service container + `npm run db:migrate` seeding `module_constants`. The bench runs vitest with NO database listening on the hardcoded `postgresql://test:test@localhost:5432/test` (vitest.config.ts:10).

**Bucket B — Windows-path artifact (1 file, 5 tests):** `server/tests/unit/regime_mapping_integrity.test.ts` — the no-hardcoded-regime-strings source scan flags `server/config/canonical-regime-strategy-map.ts` itself, which the test's own description exempts ("outside config/tests"). On Windows the scanned path is backslash-form (`C:\dev\...\server\config\...`), so a forward-slash `server/config/` exemption match fails. Pure path-normalization bug in the TEST.

**Bucket C — needs diagnosis (2 files, 8 tests):**
- `server/tests/unit/b79-0m-b2-pattern-filter.test.ts` — 7 of its cases fail (history/LQ/VN/DI gates, all-pass, mode-resolution).
- `server/tests/integration/b72-dbs-routing-guards-consistency.test.ts` — 1 case ("DBS routing guards mutual consistency").
No cause asserted yet — diagnosis is objective 3, not assumption.

**Bucket D — TEC.b fold-in:** restore strict 11-key HARD-FAIL in the TEC per-class config resolver (kill the `PICK_FALLBACK` soft path) + repair every stale TEC mock the restore exposes (estimated ~15-20 mocks / ~50 assertions per the park record — verify at Step 2).

**Bucket E — skipped-test audit:** 141 skipped tests across the suite. Parked-as-skipped is where stale failures hide. Audit EVERY skip: (a) legitimately conditional (platform/external-dependency) — document why inline; (b) parked-stale — un-park and fix, or delete with rationale; (c) dead test for removed features — delete (legacy register if a production-code question surfaces, per §5.18).

## §2 Numbered objectives + verification criteria

1. **Bench/CI environment parity (structural, NO-PATCHES).** The bench must run the SAME suite the CI gate runs, against a real local Postgres (Docker `pgvector/pgvector:pg17` mirroring ci.yml, or native install — decided at Step 2 pre-audit) with the same `db:migrate` bootstrap. Deliverable includes a one-command bench runbook (refresh → migrate → test). **Verify:** Bucket-A files execute (not collapse) on the bench; bench totals match CI totals on the same commit.
2. **Fix Bucket B in the test** (path normalization so the scan works on both separators). **Verify:** 5 regime-string tests green on bench AND CI; the scan still CATCHES a deliberately-planted violation (guard the guard).
3. **Diagnose + fix Bucket C at root cause** — test-data drift vs real regression decided per case with evidence; any real production bug found gets surfaced to Kyle before fixing (it may be its own batch per blast radius). **Verify:** all 8 green both environments, cause documented per case in the change list.
4. **TEC.b strict-throw restore + mock repair (Bucket D).** **Verify:** `PICK_FALLBACK` counter zero across the full suite run; strict resolver hard-fails on a deliberately-omitted key in a unit test; all repaired mocks carry the full 11-key set.
5. **Skipped-test audit (Bucket E).** **Verify:** every one of the 141 skips dispositioned (a)/(b)/(c) in a table in the completion report; remaining skips ≤ the documented-legitimate set.
6. **Exit gate:** full suite green on bench AND CI at the close commit — **0 failed / 0 unexplained skips**; CI 4/4 green cited with run ID; PHASE_19_PLAN.md §1 row P19-B1 → DONE + §5 decision entries.

## §3 Explicit NON-goals
- No production-code refactors beyond what a Bucket-C root cause strictly requires (anything bigger → surfaced to Kyle, candidate separate batch).
- No new test frameworks/runners; vitest stays.
- The #137 type-error intake (54 files / 231 errors) is P19-B3, NOT this batch — this batch is the RUNTIME test suite only.

## §4 Blast radius (Step 1.a read)
Test-only batch except: (a) TEC.b touches the TEC config resolver strict path — same surface as parked B79.0n.TEC.b, SIM TEC section + park record re-read at Step 2; (b) Bucket-C fixes MAY touch production code if a real regression is found — escalation rule in objective 3 covers it; (c) bench tooling additions live outside server runtime. CI workflow file untouched (it is already correct — zero tolerance).

## §5 Step plan
Standard 11-step. Step 2 pre-audit = Bucket-A hypothesis verification (run one collapsed file with a local DB up), Bucket-C diagnosis, TEC.b park-record + SIM re-read, Docker-vs-native bench decision. Implementation chunked per bucket (A → B → C → D → E), local verify after each, single review dispatch with per-bucket diffs embedded.
