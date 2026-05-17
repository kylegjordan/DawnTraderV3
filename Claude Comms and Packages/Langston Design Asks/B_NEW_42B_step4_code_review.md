# B-NEW-42b Step 4 Code Review — Full Diff

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42b (price-discontinuity detector + TEC integration)
**Pre-audit:** your CLEAN ACK with 5 refinements applied 2026-05-17

---

## What landed (Step 3)

### NEW files

1. **`server/services/price-discontinuity-detector.ts`** (358 lines) — the sentinel module.
   - 3 active kinds: `halt_resume_gap`, `corp_action`, `ex_dividend` + the `cold_start` fail-safe-skip kind you required at pre-audit rev1 #1.
   - **Detector-owned cache** (your design refinement approved): in-process `Map<symbol, SymbolEntry>` with `{state, lastPrice, lastTs, activeKind, resumePrice, resumeTs, corpActionExpiresAt}`. No caller-side prev-tick plumbing required.
   - State machine: IDLE / DISCONTINUITY_ACTIVE / CLEARING with all 5 transitions enumerated in code comments + matching state diagram in scope rev2 §2.1.1.
   - **Stateless timestamp comparison** (your pre-audit rev1 #5): hard-ceiling check is `(now - state.activatedAt) > HARD_CEILING_MS`, no setTimeout.
   - **Lazy eviction** at 24h (your pre-audit rev1 #1) — gated on `state === 'IDLE'` so DISCONTINUITY_ACTIVE/CLEARING entries reach their natural state-machine resolution.
   - **Cold-start fail-safe-skip** (your non-negotiable): first call per symbol returns `{active: true, kind: 'cold_start'}` + `[B-NEW-42b][DETECTOR_COLD_START_SKIP]` log line per your spec.
   - Curated dividend calendar lazy-loaded from `1-system-manual/audits/b-new-42/dividend-calendar-seed.json`; ex-dividend window 7:30-9:30 ET on known ex-dates uses `Intl.DateTimeFormat` with `America/New_York` (same DST-aware pattern as `server/asset_classes/xstock_spot/market-hours.ts`).
   - Hardcoded thresholds match the seeded `module_constants.price_discontinuity_detector.*` rows (DB-resolution deferred to future Phase E calibration batch; detector header documents the deferral).

2. **`server/tests/unit/b-new-42b-price-discontinuity-detector.test.ts`** (215 lines) — 13 detector tests (all green): cold-start, crypto no-op, halt state machine (active/clearing/hard-ceiling/multi-tick active), corp-action TTL, ex-dividend calendar (in-block, out-of-block, off-date, unknown-symbol), lazy eviction, explicit clearSymbolState.

3. **`1-system-manual/audits/b-new-42/dividend-calendar-seed.json`** — curated 60-entry calendar (15 div-paying symbols × Q3+Q4 2026 ex-dates). Wrapper JSON has `_metadata` block for handover documentation; consumer reads `entries[]`.

4. **`drizzle/migrations/2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql`** — seed migration with `ON CONFLICT DO NOTHING` (idempotent per your pre-audit rev1 #4b). Seeds wildcard + xstock_spot + crypto_spot per-class rows. Verified landed on staging DB (24 rows present, query in commit body).

### MODIFIED files

5. **`server/services/trailing-exit-controller.ts`** — 2 gate sites:
   - `shouldClosePosition`: added optional `currentTs?: number` param (defaults `Date.now()`). Wrapped with `isDiscontinuityActive(state.symbol, currentPrice, currentTs)`. If active, logs `[B-NEW-42b][TEC_DISCONTINUITY_SKIP_STOP]` and returns false.
   - `updatePosition` target-lock site (~line 1009): wrapped with the same detector call. If active, logs `[B-NEW-42b][TEC_DISCONTINUITY_SKIP_TARGETLOCK]` and skips the target-lock latch.
   - `PositionUpdate` type extended with optional `currentTs?: number` for test-time injection (production omits → Date.now() default).

6. **`server/services/tec-evaluator.ts`** — added optional `currentTs?: number` to `TECExitInput`; propagates to `tecUpdatePosition` call.

7. **`server/tests/unit/b-new-42-tec-split-resilience.test.ts`** + **`b-new-42-tec-halt-resilience.test.ts`** — assertion inversions (gap → fix verification):
   - FORWARD SPLIT: `expect(postSplit.shouldExit).toBe(false)` (was true; detector flags corp_action on 50% drop).
   - REVERSE SPLIT: `expect(postJump.modeChanged).toBeFalsy()` (was true; target-lock short-circuited on 2× jump). Symbol changed from STRUGGLE/USD → TSLA/USD (real xStock).
   - SANITY: symbol changed from NORMAL/USD → NVDA/USD.
   - POST-RESUME GAP: `expect(postResume.shouldExit).toBe(false)` (was true; detector flags halt_resume_gap on 10-min wallclock + 9.76% Δ). Test now uses explicit `currentTs` values to synthesize the 10-min halt window (without that, real-wallclock microsecond gap doesn't trigger).

8. **`1-system-manual/ADJUSTMENT_FRAMEWORK.md`** — Appendix A added (per pre-audit rev1 #4): catalogues the 8 new per-asset-class knobs with tier classification (Tier 1 calibration / Tier 2 polish / Tier 3 hygiene).

## Verification

- **B-NEW-42b detector test (NEW):** 13/13 passing.
- **B-NEW-42 assertion-inverted tests:** 6/6 passing.
- **Crypto regression** (b65-tec-parity + b80-tec-per-trade-keying + b79-tec-per-class-cache + trailing-exit): 55/55 passing. No crypto path touched.
- **Migration on staging:** ran cleanly (`INSERT 0 8` × 3 batches = 24 rows). Verification SELECT in commit log.

## What I want you to look at

1. **Detector module logic** — especially the state machine transitions (lines ~190-310). The IDLE → DISCONTINUITY_ACTIVE branch has corp_action checked BEFORE halt_resume_gap because corp_action threshold (≥40%) supersedes halt threshold (≥0.5%). Is the precedence right?

2. **Cold-start integration with target-lock** — pre-audit §3 said cold-start returns ACTIVE. In `updatePosition`, that means the FIRST eval cycle per symbol skips both stop check AND target-lock. For a brand-new trade that opens with currentPrice already above target (rare but possible), target-lock would be deferred by exactly one tick. Acceptable per pre-audit §3 "one tick delay" framing?

3. **Currents plumbing** — added `currentTs?: number` to PositionUpdate + TECExitInput. Production callers omit → default Date.now(). Tests pass explicit. **This is a minor signature expansion** vs my pre-audit §3 promise of "caller-site surface unchanged" — see if you want a different test approach (vi.useFakeTimers in tests instead).

4. **Lazy eviction gated on state===IDLE** — the modification I made when the corp_action TTL test failed (lazy-eviction was clobbering 24h corp_action TTL because both windows were ~24h). Now only IDLE entries evict by age; DISCONTINUITY_ACTIVE/CLEARING entries reach state-machine resolution regardless. Is that the right call?

5. **Detector cache LIFECYCLE on PM2 restart** — restart discards the cache; first call per symbol post-restart triggers cold_start skip. Pre-audit §3 said "document explicitly in SYSTEM_MANUAL Trading Halts subsection" — I haven't added that doc yet (planned for Step 10 governance pass). OK to defer to Step 10, or want it before push?

6. **Module_constants seeded but not read** — detector uses hardcoded defaults matching seeded values. DB-resolution deferred to Phase E calibration batch. Detector header has a comment explaining this. Are you OK with that, or do you want the DB-resolution wired now?

## Code diff

Full commit pending push. Snippets pasted to topic 21 if you want eyes-on before push. Otherwise you can review the diff at `git show HEAD~..HEAD` once it lands.

## Step 4 → Step 5/6

If clean, I push to GitHub + deploy to staging + run §10 governance updates + write completion report. Verification step (§7-8) confirms tests stay green in CI + you Step 8 review the diff and the staging-side migration row count.

— CC
