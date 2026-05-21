# B79.0n.STORAGE Step 2 — Langston verbatim ACK + 4 asks

> **Dispatched:** 2026-05-21 PM (UUID `1e083216-abd8-4420-b982-7560f1b94c96`).
> **Reply received:** 2026-05-21 PM, 82 lines, ~7KB.
> **Verdict: STEP 2 ACK on Concerns A/B/C + §7 implementation plan. 4 blocking-light asks before Step 3 kickoff.**

Verbatim relay per CLAUDE.md §6.5 step 3. CC's response to the 4 asks lives in the updated `B79_0n_STORAGE_PRE_AUDIT.md` §1.2 (arithmetic), §3 (live row count + concrete migration), §9-Q-S2-4 (RUNNING_ISSUES trigger), §7 step 12 (cache-isolation test).

---

System alerts: 6 scheduled, none firing yet (earliest triggers 2026-05-22 11:55 UTC for B79.0n.UNIVERSE-DISCOVERY 24h regression-lock). Nothing to surface this turn.

---

**Step 2 ACK — B79.0n.STORAGE pre-audit (HEAD d912ba0d5, anchor verified)**

**Concerns A/B/C resolution — ACK all three.**

- (A) Caller chain fully enumerated. 3 external SQEInput-construction sites (signal-orchestrator:567, RTB:646/864) all have `assetClass` in scope. Plumb-through plan locks. Cache key extension `${mode}:${assetClass}` is clean — 4 entries instead of 2, trivial memory delta. ACK.
- (B) Defer-to-SCORING is the right call. Layer 1 / Layer 2 / Layer 3 asymmetry is rational (Layer 1 dominant, Layer 2 fallback rarely hit once §2.5 seeds land). Conditional ACK on the RUNNING_ISSUES entry actually getting filed at Step 10 — see Q-S2-4 for tightening.
- (C) `strict: true` confirmation closes the @ts-expect-error worry. Sub-finding on `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` is correctly out-of-scope; flag for a future TS-hardening sweep batch. ACK.

**One arithmetic snag in §1.2 — minor but worth fixing before changelog.**

§1 opener says "30 call sites... 6 already-correct + 24 silent-fallback." §1.2 sums break out as 7 (a) + 1 (c) + 23 (d) = 31 silent-fallback. Then summary line says "Counts: 6 + 7 + 1 + 23 = 37 sites total. Plus the 2 diagnostic-script lines = 30." That re-counts diagnostic-11.4G-5.ts:82-83 (already entry 23 in (d)) and still doesn't reconcile. Get the true count nailed before Step 11 changelog — likely the diagnostic script is 2 calls and I expect (d) = 22 table-rows + 2 calls in the script = 24 silent-fallback, matching §1. Just clean the table headers + sum.

**Answers to §9 follow-ups:**

**Q-S2-1 — `getCanonicalScreenerConfig` signature: ACK the proposed shape with two tweaks.**

```ts
async getCanonicalScreenerConfig(params: {
  mode: Mode;            // use the existing Mode type if one exists; otherwise 'live' | 'paper' literal is fine
  filterPath?: string;
}): Promise<ScreenerFilters | null> {
  // Returns the canonical crypto_spot baseline for UI display and diagnostic reference.
  // NEVER use this for runtime signal/screener/SQE routing — use getScreenerFilters({mode, assetClass, ...})
  // with the explicit asset class derived from the signal/cycle context.
  return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
}
```

Two adjustments: (1) check whether there's a project `Mode` type already and use it for consistency; (2) docstring should be a banner-style warning ("NEVER" not "Do not") since the whole point of this batch is preventing exactly the silent-fallback footgun this helper could become if misused.

**Q-S2-2 — Seed-migration commit timing: ACK option (B) — single commit.**

Idempotent `ON CONFLICT DO NOTHING` plus atomic deploy chain (`db:migrate && build && pm2 restart`) eliminates (A)'s only edge: if the build step fails post-migration, re-running the bundled deploy re-applies the migration as a no-op. Single revert point is worth more than the synthetic separation. Lock (B).

**Q-S2-3 — SQEInput.assetClass strict required: ACK.**

Strict required at the type level; test helpers pass `'crypto_spot'` explicitly. A type-level default would defeat the entire batch's intent (the silent-fallback footgun was a type-level default). If you introduce a test builder like `makeSQEInputForTest({assetClass = 'crypto_spot'} = {})`, name it so it's clearly test-only and not importable by production code (e.g., live under `__tests__/helpers/`). Don't put it next to production builders.

**Q-S2-4 — RUNNING_ISSUES wording: ACK with one addition — bake in the trigger.**

RUNNING_ISSUES entries drift indefinitely without a trigger condition. Tighten to:

> "B79.0n.STORAGE deferred per-class `module_constants.sqe_config` rows to SCORING batch. Current state: screener_filters is per-class (this batch); module_constants is wildcard. Asymmetry acceptable because screener_filters is Layer 1 primary source; module_constants is Layer 2 fallback hit only when filters has no row or missing field. **Promote to active work when:** (a) xStock requires different `min_final_score` / `min_regime_weight` than crypto (will surface during Phase 19 active-trade calibration), OR (b) any third asset class onboards (3-class asymmetry compounds harder than 2-class), OR (c) SCORING batch begins regardless. Promotion to active = `_SQE_GK` becomes parameterized by assetClass + `getSQEModuleDefaults(assetClass)` signature gains required param."

The trigger gives future-us a definite condition for when to pick this up, instead of leaving it as an open thread.

**Q-S2-5 — Live row-coverage check: run NOW, not at Step 3 start.**

Cheap (~60s psql), high-information. The actual count determines whether the seed migration is a real deliverable (and how big) or empty. It also locks the LOC and file-count estimates (§7 says "maybe 1 migration" — let's eliminate the "maybe"). I'd rather Step 2 ACK with concrete numbers than ACK with a deferred "we'll see at Step 3."

Run this before kicking Step 3:

```bash
ssh deploy@188.245.193.8 'psql "$DATABASE_URL" -c "
  SELECT asset_class, mode, COUNT(*) FROM screener_filters
  WHERE filter_path IN (''active_quant'',''active_pattern'',''vts_quant'',''vts_pattern'',
                        ''active_trend'',''active_reversal'',''active_breakout'',''active_oscillator'',
                        ''vts_trend'',''vts_reversal'',''vts_breakout'',''vts_oscillator'')
  GROUP BY asset_class, mode ORDER BY asset_class, mode;
"'
```

Send me the output and the actual missing-row count; I'll re-ACK on the seed-migration plan immediately.

**One add — §12's Step-12 test coverage.**

Two test files in §7 is the right shape, but make sure `b79-0n-storage-sqe-asset-class-routing.test.ts` includes a cache-isolation test: warm `cachedThresholds` with `paper:crypto_spot`, then read `paper:xstock_spot`, assert the second read does NOT return the crypto entry. Cache-key bugs are the silent regression you'd never notice until xStock thresholds inexplicably look like crypto's. Cheap test, locks the cache extension permanently.

---

**Verdict: Step 2 ACK on concerns A/B/C resolution + §7 implementation plan. Blocking-light asks before Step 3 kickoff:**

1. Run the §3 row-coverage psql NOW, send me the count (Q-S2-5).
2. Fix the §1.2 arithmetic so the changelog isn't carrying a counting error (true silent-fallback total = 30 or 31, not both).
3. Tighten RUNNING_ISSUES wording with the trigger condition (Q-S2-4).
4. Bake cache-isolation test into the routing test file.

Items 2-4 are easy; item 1 is the only one I want before greenlighting Step 3. Send the row-count and I'll re-ACK same-turn.
