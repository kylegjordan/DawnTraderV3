# BATCH 79.0b — N3+N4 cleanup + B79.0a SQE wildcard DELETE (Phase 24)

**Status:** rev 1 — CC draft. Awaiting Langston Step 1 review.
**Workflow:** 11-step canonical (full).
**Branch:** `migration/aws-supabase`.
**Sequencing:** THIRD sub-batch in Phase 24 (after B79 dormant scaffold + B79.TEC + B79.0a). Mini-deploy post-B79.0a verify.
**Trigger:** B79.0a deferred items per scope §0 + completion report:
- N3: redundant truthy strategy guard (specific file:line surfaced via fresh grep here)
- N4: boundary tests for B79-era surfaces (`isXstockMarketOpenUTC`, `bootstrapXstockSpotInstances` idempotency, `safeResolveAssetClass`)
- B79.0a SQE wildcard row DELETE (Migration 2 from B79.0a left wildcards; verify gate at +48h post-B79.0a-deploy = 2026-05-10 21:38 UTC)

**Doctrine reference:** CLAUDE.md §5 #15 NO PATCHES — these are surgical follow-ons, not patches; each has a clean root-cause fix.

---

## §0 — Re-frame and scope boundary

**This batch closes the B79.0a deferral list cleanly.** Specifically:

✅ In scope:
- N3 fix: drop redundant `input.strategy &&` truthy check at `server/core/filters/signal_quality_evaluator.ts:199` (input.strategy is typed `string` non-optional; truthy guard is dead).
- N4 tests: 3 new test files covering the B79-era surfaces:
  - `b79-0b-market-hours.test.ts` — `isXstockMarketOpenUTC` weekday-during-hours / weekday-outside-hours / Saturday / Sunday-before-open / Friday-after-close
  - `b79-0b-asset-class-instances.test.ts` — `bootstrapXstockSpotInstances` idempotency (multiple calls return same triad); inactive class throws
  - `b79-0b-safe-resolve-asset-class.test.ts` — `safeResolveAssetClass` returns null on unknown patterns + does not throw + logs WARN
- B79.0a SQE wildcard DELETE migration script: removes `(sqe_config, *, *, *, *, min_final_score)` AND `(sqe_config, *, *, *, *, min_regime_weight)` rows. Wildcards are now redundant since per-class explicit rows landed in B79.0a Migration 2. Mirror of B79.TEC.b pattern — committed-not-executed; manual operator step at +48h gate.
- Verify checklist artifact `BATCH_79_0b_VERIFY_CHECKLIST.md` for the wildcard-DELETE manual deploy gate.

❌ Out of scope:
- B79.TEC.b wildcard `break_even_enabled` row removal — its own +48h gate (B79.TEC closed 2026-05-08; B79.TEC.b due 2026-05-10 ~21:13 UTC). Tracked separately.
- Signal-orchestrator wiring for xstock_spot — B79.x post-Layer-3 evidence.
- B73 ablation extension to xstock_spot — B79.4.
- Continuous Q-D probe with alternate API — RUNNING_ISSUES #86 / B79.x.

---

## §1 — Numbered objectives (outcomes-based)

1. **N3 redundant truthy guard removed.** `server/core/filters/signal_quality_evaluator.ts:199` `if (input.strategy && !isStrategyEnabledForAssetClass(...))` → `if (!isStrategyEnabledForAssetClass(...))`. Verification: TS compiles; SQE test suite still passes (the truthy guard was never load-bearing — `input.strategy: string` is type-guaranteed). No behavioral change expected.

2. **`isXstockMarketOpenUTC` boundary tests.** New `server/tests/unit/b79-0b-market-hours.test.ts`. Cases: weekday 14:30 UTC (open) / weekday 12:00 UTC (closed pre-open) / weekday 22:00 UTC (closed post-close) / Saturday any time (closed) / Sunday 23:00 UTC (closed) / Sunday 14:30 UTC (closed — different from weekday). Verification: tests pass; coverage on the function expands.

3. **`bootstrapXstockSpotInstances` idempotency tests.** New `server/tests/unit/b79-0b-asset-class-instances.test.ts`. Cases: first `getXstockSpotInstances()` call constructs the triad; second call returns the SAME object reference (no re-bootstrap); `_testResetXstockSpotInstances` clears the cache so next call reconstructs; `getAssetClassInstances('crypto_spot')` returns null (no-touch fence); `getAssetClassInstances('equity_spot')` (inactive class) throws. Verification: tests pass.

4. **`safeResolveAssetClass` null-return tests.** New `server/tests/unit/b79-0b-safe-resolve-asset-class.test.ts`. Cases: unknown symbol pattern returns null + does not throw; valid pattern returns AssetClass; empty string returns null; symbol on unsupported exchange returns null. Verification: tests pass.

5. **B79.0a SQE wildcard DELETE script committed (NOT executed).** New `scripts/b79-0a-sqe-remove-wildcards.sql` mirroring B79.TEC.b pattern: pre-check (exactly 2 rows match signature), capture-row-for-rollback, signature-guarded DELETE with `created_at < <step1_deploy_timestamp>` clause, documented rollback recipe. Script committed but NOT executed in B79.0b's Step 6 deploy. Manual operator step at +48h gate per `BATCH_79_0b_VERIFY_CHECKLIST.md`.

6. **`BATCH_79_0b_VERIFY_CHECKLIST.md` artifact.** Mirrors B79.TEC.b checklist shape: preconditions (live signals only), execution procedure, rollback recipe, sign-off table.

7. **No-touch fence on crypto_spot factor cadence holds.** Pre-deploy + post-deploy SQL on `regime_factor_alternates` ±10% of pre-B79.0b baseline.

8. **CI 4 checks gate.** Per Kyle directive: deploy after Test+Build+Docker pass — TS Check legacy baseline accepted; new B79.0b code must NOT add new TS errors.

---

## §2 — Component changes

### Files modified

| File | Change |
|---|---|
| `server/core/filters/signal_quality_evaluator.ts` | Drop redundant `input.strategy &&` at line 199 |

### Files added

| File | Purpose |
|---|---|
| `server/tests/unit/b79-0b-market-hours.test.ts` | `isXstockMarketOpenUTC` boundary coverage |
| `server/tests/unit/b79-0b-asset-class-instances.test.ts` | `bootstrapXstockSpotInstances` idempotency + factory dispatch |
| `server/tests/unit/b79-0b-safe-resolve-asset-class.test.ts` | `safeResolveAssetClass` null-return coverage |
| `scripts/b79-0a-sqe-remove-wildcards.sql` | Wildcard-DELETE script (committed NOT executed) |
| `Claude Comms and Packages/Scope Files/BATCH_79_0b_VERIFY_CHECKLIST.md` | 48h gate verify checklist |

---

## §3 — Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | N3 truthy-guard removal changes behavior on unexpected falsy `input.strategy` | LOW | TS type guarantees non-empty string; would be a typing violation upstream; no observed cases. Tests cover both old + new path. |
| 2 | Test files reference unstable internal helpers (`_testResetXstockSpotInstances`) | LOW | Helper already exists with `_test` prefix indicating test-only API |
| 3 | Wildcard DELETE script accidentally fires in B79.0b deploy | MEDIUM | Committed-not-executed pattern + verify checklist + signature-guarded WHERE clause + manual operator step at +48h |
| 4 | Per-class rows from B79.0a Migration 2 not yet exercised in production resolution path → wildcard DELETE prematurely cuts the safety net | MEDIUM | 48h gate ensures resolution-path traffic flows through explicit per-class rows; verify checklist precondition checks `[TEC_RESOLVE_AGGR]`-equivalent log signals (sqe_config has its own resolution-path; PIA enumerates) |
| 5 | Test additions surface a real bug in B79-era code | LOW | If they do, that's the value of the cleanup batch — fix or document |

---

## §4 — Pre-Implementation Audit (PIA) acceptance criteria

1. **N3 line-citation:** quote exact before/after of `signal_quality_evaluator.ts:199`. Confirm `input.strategy: string` (line 75) is type-guaranteed non-optional. Grep for any other call sites that might infer behavior from the truthy check.

2. **N4 test coverage rationale:** for each of the 3 new test files, state the boundary cases + which existing test file (if any) was already covering similar ground. `asset-classes.test.ts` covers `resolveAssetClass` extensively but NOT `isXstockMarketOpenUTC` / instance idempotency / `safeResolveAssetClass`.

3. **SIM consultation:** for the 1 modified file (`signal_quality_evaluator.ts`) + the 3 new test files. SIM update at Step 10: add note that B79-era test surfaces have boundary coverage.

4. **Wildcard-DELETE preconditions:** PIA enumerates the live signals the verify checklist will check (mirror of B79.TEC.b §1 #2-#6 — diagnostic readiness, fresh `hasExplicitAssetClassRow` probe equivalent for sqe_config, traffic-floor verification, no-touch fence holds, no SQE refresh-fail logs).

5. **Hostile-sim plan:** trivial for B79.0b — N3 + N4 are isolated; the wildcard-DELETE has its own integration verify (psql post-DELETE shows 0 wildcard rows + post-deploy SQE config resolution still works for crypto_spot + xstock_spot via explicit per-class rows).

---

## §5 — Verification criteria (Step 7+8)

### Step 7 first-pass (CC)
1. HTTP 200 staging post-deploy.
2. CI: Test Suite passes including 3 new test files (zero existing regressions).
3. No new TS errors in B79.0b code.
4. No-touch fence: crypto_spot regime_factor_alternates ±10% of pre-deploy baseline.
5. `/api/diagnostics/xstock-scanner` still ready (B79.0a unaffected).
6. `/api/diagnostics/tec-bootstrap` still ready (B79.TEC unaffected).

### Step 8 second-pass (Langston)
Independent verification of Step 7 + line-cite N3 fix + boundary-test review.

### B79.0a wildcard-DELETE +48h gate (separate operator action)
Per `BATCH_79_0b_VERIFY_CHECKLIST.md`. Executes at 2026-05-10 21:38 UTC (48h after B79.0a Migration 2 applied at 2026-05-08 21:38 UTC).

---

## §6 — Sequencing within Phase 24

1. ✅ B79 (dormant scaffold) — 2026-05-07
2. ✅ B79.TEC — 2026-05-08
3. ✅ B79.0a — 2026-05-08
4. **B79.0b (this batch)** — N3 + N4 + wildcard-DELETE-script. Code deploy in this session; manual wildcard-DELETE at +48h gate.
5. **B79.TEC.b** — wildcard `break_even_enabled` DELETE; separate +48h gate (2026-05-10 ~21:13 UTC). Can interleave with B79.0b's gate.
6. B79.4 — B73 exit-strategy ablation extended to xstock_spot.
7. B79.x — signal-orchestrator wiring + continuous Q-D probe + various.

---

## §7 — Open questions for Langston (Step 1+2 review)

1. **N3 fix scope.** CC fix is line-199 only. Line 285 has a similar `input.strategy &&` truthy in an `&&`-chain that ALSO has a needed truthy on `input.regimeStability`. Removing `input.strategy &&` from the chain is semantically equivalent (TS guarantees) but non-essential. Lean: leave 285 alone (smaller blast radius); only fix 199. Confirm.
2. **N4 test count.** 3 new test files covers the surfaces I identified. Is there a 4th surface I'm missing (e.g., `symbol-normalize.ts` boundary cases, `orb.ts` Q-D-gated detect path)?
3. **Wildcard-DELETE timing.** B79.0a Migration 2 applied 2026-05-08 21:38 UTC → +48h = 2026-05-10 21:38 UTC. B79.TEC Migration 1 applied 2026-05-08 ~11:24 UTC → B79.TEC.b +48h = 2026-05-10 11:24 UTC. Two separate manual gates. Acceptable to handle as separate ops events, OR fold both into a single +48h Sunday-morning operator session?
4. **Test file naming convention.** `b79-0b-*.test.ts` aligns with `b79-tec-*` and `b79-0a-*` precedents. Confirm.

---

## §8 — Process commitments

1. NO PATCHES — surgical fixes only.
2. No-touch fence on crypto_spot factor cadence + crypto path.
3. PIA includes line-citations.
4. MEMORY synced 3-way per CLAUDE.md §2 Step 10.b.
5. Plain-language summary in conversation at Step 11 close.
6. Step 10 governance commits AFTER Step 8 sign-off (Langston B79.TEC close note + B79.0a confirmation).

---

*End BATCH_79_0b_SCOPE.md rev 1.*
