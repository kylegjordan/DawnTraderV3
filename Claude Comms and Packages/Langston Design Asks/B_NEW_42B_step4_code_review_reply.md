Walked the diff. Hit two issues that need attention before push. Not clean. Detector module structure is solid — state machine is clear, lazy-eviction-IDLE-gating is correct, corp_action precedence over halt is correct. But the TEC integration has a plumbing gap and a state-machine over-advance.

## BLOCKER 1 — `currentTs` plumbing is incomplete, post-resume-gap test passes for the wrong reason

`tec-evaluator.ts:367`:
```ts
if (tecShouldClose(input.tradeId, currentPrice)) {
```

`input.currentTs` is **not** forwarded to `tecShouldClose`. So in tests that synthesize timing with explicit `currentTs`, the two detector consultations on the same logical tick see different timestamps — `t0` from `tecUpdatePosition` and `Date.now()` (real wallclock ~2.4 years later, since `t0 = 1_700_000_000_000`) from `tecShouldClose`.

Trace the POST-RESUME GAP test you call out as "10-min wallclock + 9.76% Δ":
- `preHalt` at `t0`: updatePosition's detector → cold_start, cache={state:IDLE, lastTs:t0}. shouldClose's detector with `Date.now()` → lazy eviction fires (`(Date.now()-t0)/1000 ≫ 86400`), entry deleted, cold_start ACTIVE again, lastTs=Date.now().
- `steadyState` at `t0+60_000`: updatePosition's detector → IDLE, gap is `(t0+60_000 - Date.now())/1000` = **large negative**, halt check `gap > 300` fails. INACTIVE. Lazy eviction doesn't fire (negative is not > 86400), but lastTs ends at `t0+60_000`. Then shouldClose's detector with `Date.now()` → lazy eviction fires again → cold_start ACTIVE.
- `postResume` at `t0+660_000`, currentPrice=185: updatePosition's detector → IDLE, gap = negative, halt check fails (gap > 300 fails on negative), absPct=9.76 < 40 corp_action skip. INACTIVE. Target-lock not skipped (but 185 < 230, no latch anyway). shouldClose's detector with `Date.now()` → lazy eviction fires → **cold_start** ACTIVE again. tecShouldClose returns false.

The assertion `expect(postResume.shouldExit).toBe(false)` passes — but kind=`cold_start`, not `halt_resume_gap`. The test claims to verify halt-gap detection; it actually verifies cold_start fail-safe-skip firing repeatedly because the wallclock/synthesized-time mismatch keeps tripping lazy eviction.

If you fix the plumbing (pass `input.currentTs` to `tecShouldClose`), the test should then genuinely exercise the halt_resume_gap path: updatePosition's detector flips IDLE→DISCONTINUITY_ACTIVE on the postResume call (gap=600s>300, absPct=9.76>0.5), tecShouldClose's detector sees DISCONTINUITY_ACTIVE and short-circuits. That's what the test header is claiming.

**Fix:** `tec-evaluator.ts:367` →
```ts
if (tecShouldClose(input.tradeId, currentPrice, input.currentTs)) {
```

The `currentTs?` param already exists on `shouldClosePosition` (trailing-exit-controller.ts:1377). Just forward it.

## BLOCKER 2 — Double detector consultation per tick over-advances the state machine

Production correctness, not a test issue. TEC calls the detector **twice** per logical tick:
1. `updatePosition` line 1029 — for the target-lock-skip decision.
2. `shouldClosePosition` line 1383 — for the stop-check-skip decision.

Both within microseconds (or even synchronously in the same call stack via `evaluateTECExit`). Each call advances the state machine by one transition. So a halt-resume on a single real tick A and a next real tick B plays out as:

- Real tick A, call 1 (updatePosition): IDLE → DISCONTINUITY_ACTIVE (gap>300, |Δ|≥0.5%). Returns ACTIVE.
- Real tick A, call 2 (shouldClose): state=DISCONTINUITY_ACTIVE. `sinceResumeSeconds`≈0, `pctFromResume`=0 (same currentPrice as call 1). Branch 5c fires → **CLEARING**. Returns ACTIVE.
- Real tick B, call 1: state=CLEARING → IDLE. Returns INACTIVE. (target-lock now runs.)
- Real tick B, call 2: state=IDLE, gap≈0 since call 1 just updated lastTs, absPct=0. No re-flag. Returns INACTIVE. **Stop check runs on tick B.**

Net: the intended 2-real-tick deferral (DISCONTINUITY_ACTIVE → confirming-tick CLEARING → IDLE) collapses to 1-real-tick because the second detector consultation within tick A consumes the CLEARING transition. On tick B, the stop fires at the original stop price even though the actual market price is at the gapped-down level — the exact unfillable-fill failure mode this batch is supposed to close.

For a halt that resumes with multi-tick volatility (the realistic case), tick B is rarely a confirming tick at the resume price. The fix loses most of its protective value in that scenario.

**Fix options, ranked:**

A. **Hoist the detector consultation to one call per logical tick in `tec-evaluator.ts`** — consult once, pass `{active, kind}` down to both `tecUpdatePosition` and `tecShouldClose` as a parameter rather than each consulting independently. This is the architecturally clean fix and de-duplicates the gate decision into a single source-of-truth per tick.

B. **Make the second consultation query-only** — add an `observeOnly: true` mode to `isDiscontinuityActive` that returns the current state without mutating. tecShouldClose passes observeOnly=true.

C. **Gate CLEARING transition on minimum elapsed time** — require `sinceResumeSeconds >= MIN_CLEARING_INTERVAL_SECONDS` (e.g. 1s) before CLEARING can fire. Cheapest fix but feels like a band-aid; doesn't address the architectural duplication.

I'd push for (A). The current pattern of two independent consultations is structurally fragile — any future site that wants to consult the detector adds another transition consumed per tick.

## Minor — corp_action diagnostic logging captures post-mutation values as "prev"

`price-discontinuity-detector.ts:317-334`. Compare against the halt branch at 336-354 which correctly captures `const prevPrice = entry.lastPrice; const prevTs = entry.lastTs;` BEFORE mutating. The corp_action branch sets `entry.resumePrice = currentPrice` and `entry.resumeTs = currentTs` first, then returns `details: { prevPrice: entry.resumePrice, prevTs: new Date(entry.resumeTs) }` — so the logged prevPrice == currentPrice and prevTs == currentTs. Diagnostic only, not functional, but it'll mislead anyone reading `[B-NEW-42b][TEC_DISCONTINUITY_SKIP_*]` logs to debug a corp_action event.

**Fix:** capture entry.lastPrice / entry.lastTs into locals before the mutation, same pattern as the halt branch.

## Your 6 questions

1. **Corp_action precedence in IDLE.** Correct as designed. 40%+ supersedes 0.5%+ regardless of gap duration; the more-extreme signal should win.
2. **Cold-start one-tick target-lock deferral.** Acceptable per pre-audit §3.
3. **`currentTs` plumbing.** See Blocker 1. The signature expansion is fine; the issue is incomplete forwarding. The `vi.useFakeTimers` alternative would also work but doesn't address Blocker 2.
4. **Lazy eviction gated on state===IDLE.** Right call. Without that gate, the 24h corp_action TTL would race the eviction window.
5. **PM2 restart documentation deferred to Step 10.** Fine.
6. **module_constants seeded but not read.** Fine — header comment is clear about the Phase E deferral. The wildcard/per-class rows are in place for when calibration lands.

## Verdict

Not clean. Don't push yet. Two action items:

1. Fix `tec-evaluator.ts:367` to forward `input.currentTs` to `tecShouldClose`. Re-run the halt-resilience test and confirm the post-resume-gap path now triggers `halt_resume_gap` kind (not `cold_start`). Add a `details.kind` assertion if you can — would catch the test-fidelity regression we just saw and ensure future drift doesn't silently mask via cold_start.
2. Address the double-consultation. My preference is (A) — hoist consultation to tec-evaluator, consult once per logical tick, pass result down. If you have a strong reason to keep the consultations at the call sites, then (B) observeOnly mode is acceptable.

Minor: fix the corp_action diagnostic prevPrice/prevTs capture while you're in the file.

Once those land + tests re-green, I'm good to ack Step 4 and you push.
