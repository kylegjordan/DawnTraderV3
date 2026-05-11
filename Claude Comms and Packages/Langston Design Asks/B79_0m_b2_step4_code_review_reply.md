I've completed the Step 4 review. Pulling the reply together.

---

**Langston → Claude Code (B79.0m.b2 Step 4 reply)**

(a) **Approved for push to GitHub.** No blocking concerns. 7 non-blocking nits + 1 pre-existing bug I noticed in-passing.

**Direct answers to your 4 questions first:**

**Q1 — Fan-out inflation (~600-700 evals/cycle):** No storage concern. Bounded above by `pairs × lanes × |regimeStrategies|`, but `isStrategyEligibleForLane` collapses most inner iterations to a `family_filter_mismatch` counter increment without an archive write. Actual `signal_eval_archive` writes per pair = ~1-2 per eligible strategy per lane it's eligible in. Crypto runs this volume daily. Move on.

**Q2 — `computeDirectionalIntegrity` duplication of `imf-evaluator.ts:70-81`:** Accept the duplication. Layer-1 self-contained module is the right call. If a 3rd consumer emerges, promote to `server/core/metrics/directional-integrity.ts` in a Phase 24 cleanup batch — not now.

**Q3 — Unbounded `ORDER BY interval_begin ASC` in xstock B73 fetch (`exit-strategy-replay-service.ts:148-155`):** Not actually unbounded — `WHERE interval_begin >= sinceTs AND interval_begin <= endTs` caps the result at `(maxHoldMs + 14min)/1min ≈ 10094 rows` worst case. EXPLAIN ANALYZE at 1.035ms with full partition coverage confirms it. No LIMIT needed.

**Q4 — Drizzle drift on the schema.ts index fix:** **This is worth attention.** Production has `(mode, asset_class, filter_path)` from the B79.0m.a hotfix, but the Drizzle migration *journal* still records `(mode, filterPath)` because that hotfix bypassed drizzle-kit. Closing the schema-file drift is correct, but the next `drizzle-kit generate` run will likely emit a surprise migration (DROP old idx + CREATE new) that no-ops in prod yet leaves a real SQL file in `drizzle/migrations/`. Recommendation: in a follow-up commit (does not need to block this push), add a hand-written no-op meta migration that updates the journal-equivalent state — or run `drizzle-kit generate` once now and either (i) edit the produced SQL to idempotent `DROP INDEX IF EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS` form, or (ii) `DROP INDEX IF EXISTS screener_filters_mode_filter_path_idx;` only. Either way, file it before next batch's drizzle work surfaces the conflict.

**Non-blocking nits (follow-up commit, no need to block this push):**

1. `b79-0m-b2-lane-eligibility.test.ts:32-45` — re-implements `isStrategyEligibleForLane` rather than importing it from `eval-cycle.ts`. The test validates the MAP entries + the test's own copy of the function; production drift would not be caught. Either export the helper from `eval-cycle.ts` (test-only export marker is fine) or wire the test through `evaluateXstockPairForVTS` with mocks. Worth fixing before this code stabilizes — the test is currently load-bearing on convention, not behavior.

2. `b79-0m-b2-pattern-strategy-constants-fallback.test.ts:63-74` — mocks `getCachedNumbersForModule` and then asserts the mock returns the hardcoded values. The intent (catch wildcard-fallback regressions) is right; the implementation tests the mock, not the resolver. Add an integration variant that exercises the real resolver against a test-DB-seeded `module_constants` table, or use a fake cache backing the real resolver. Current form gives ~zero assurance about production behavior.

3. `b79-0m-b2-pattern-filter.test.ts:14` — docblock lists "(f) DI outside band → fail with `pattern_di_*_outside_*`" but no (f) test is implemented. Either add the test (cheap — flip `metrics.DI` to return null or set `diMin > 100`) or drop the (f) line from the docblock. Coverage gap on the DI gate.

4. `b79-0m-b2-pattern-filter.test.ts:130-136` test (h) — comment admits "We can't directly observe the storage call args via the mock as-is." Tighten with `vi.fn()` so you can assert `mockStorage.getScreenerFilters` was called with `filterPath: 'active_pattern'` when `mode='live'`. As written, (h) only confirms no-throw on the live branch.

5. `b79-0d-orb.test.ts:9` docblock — "(c) Breakout-down generates SELL" is now wrong post-B79.0m.b2; should read "(c) Breakout-down returns null with sell_disabled_long_only." Test body is correct; docblock just rotted.

6. `eval-cycle.ts:38-44` pattern-pool guardrails (`final_score_floor=0.45`, `max_position_pct=0.50`) are documented as NOT enforced at this layer, deferred per §-1.10. Acceptable for the b2 cut — but the absence of a tripwire counter means we won't see if a low-`finalScore` pattern signal squeaks through to a trade. Add a `signalsBelowPatternFinalScoreFloor` counter (informational only) in Phase 24 calibration so we can size the eventual gate before flipping it on.

7. `eval-cycle.ts:462`, `:546`, `:575`, `:597` — `archiveSignalEval` failures are caught with `catch { /* hot path */ }`. Pre-existing pattern (matches crypto), not introduced by this batch, but worth a `counters.archiveFailures` increment for future observability. Roll into a B79.x cleanup.

**Pre-existing bug I noticed (NOT introduced by this batch, do not let it block the push):**

- `exit-strategy-replay-service.ts:339` references `ohlcBars.length` in the success-log `console.log`. `ohlcBars` is only an object-literal property at line 318 (`ohlcBars: replayBars`); the variable in scope is `allBars`/`replayBars`. The full_diff confirms this hunk is unchanged. The reference is wrapped in the outer `try { … } catch (err)` block (lines 332-346), so it throws `ReferenceError` on every successful persist and gets logged as a "persist failed" — which masks the real signal in the log. File as a standalone ticket; replace with `replayBars.length` (or `allBars.length` if you want the full window count). Surface in RUNNING_ISSUES — don't piggyback this push.

**Verdict:** push it. Migration + lane composition + ORB LONG-only + B73 asset-class branch + schema drift fix all look correct. The pre-deploy crypto ORB baseline is captured per §-1.7. Counters and tripwires are wired (especially `patternRejectByMinHistory` for §-1.1).

After push, watch G1 (CI) and G2 (DB migration apply). On staging deploy, the first xstock cycle should show `patternFanOut > 0` and `pairsPassedPattern > 0` if the pattern-row params are reasonable; if `patternRejectByMinHistory` dominates, the 60-bar floor is biting and we need a Layer-3 pull-forward.

— Langston
