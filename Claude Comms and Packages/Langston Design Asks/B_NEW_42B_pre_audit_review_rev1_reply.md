Reading all three files now.

Standard Step 2 review — numbered responses, then sign-off.

---

**1. Design refinement (detector-owned cache).**

**ACCEPT the refinement WITH one preservation.** The outcome IS structurally equivalent to scope §2.2.3 intent — detector knows the gap, integration site unchanged. Three points strongly favor detector-owned over caller-propagation:

- **Silent-disable risk class eliminated.** Variant (a)'s asset-class assertion was a runtime guard against the failure mode "future caller forgets to plumb prevPrice." With detector-owned cache that failure mode is structurally impossible. This is genuinely *better* than what scope §2.2.3 captured, not just equivalent.
- **Caller-site surface unchanged.** Zero plumbing in paper-execution-engine.ts:946 + vts-runner.ts:2145 + tec-evaluator.ts. Smaller diff = smaller blast radius.
- **Test mock fidelity preserved.** Successive in-test calls populate the cache exactly as production would — no synthetic prev-tick mocking.

**BUT — preserve the fail-safe-skip posture on cold start.** Pre-audit §3 point 3 says "first call per symbol post-restart has no cached prior tick → detector returns inactive." I disagree with that posture. The whole point of variant (a) was: in absence of certainty about prior-tick state, default to safe-skip rather than safe-execute. Cold-start IS absence of certainty — we don't know if a discontinuity landed during the blind window (process restart at t=0, symbol actually entered halt-resume gap at t=-5s, first post-restart tick at t=+10s is the gap-down resume price).

Concrete fix: detector returns `{active: true, kind: 'cold_start'}` on the FIRST call per symbol when cache is empty. Cache populates from that call. Second call onward evaluates normally. Effect: legit stops delayed exactly one tick after restart per symbol — operationally trivial. Same fail-safe-skip posture as variant (a). Add a one-line log `[B-NEW-42b][DETECTOR_COLD_START_SKIP] <symbol>` so we can see the events in pm2 logs.

State-management items to nail at Step 4 (not Step 2 blockers):
- **Eviction policy.** Prefer lazy eviction (on each call, drop entry if `now - lastTs > 24h`, treat as cold-start) over background sweep or symbol-refcount-on-clearTrailingState. Cheaper, no timer, no refcount tracking.
- **Hard ceiling timer.** See answer to #5 — prefer stateless timestamp comparison over setTimeout.
- **Restart semantics.** Document explicitly in SYSTEM_MANUAL Trading Halts subsection: "detector cache is in-process; restart discards cache; first tick per symbol post-restart triggers cold_start skip, protecting against the unfillable-fill failure mode during the blind window."

---

**2. SIM coverage.**

7 components is reasonably complete. Two minor adds:

- **`isXstockSymbol` utility** (wherever it lives — likely `server/asset_classes/xstock_spot/`) is an upstream dep of the detector. Worth a one-line SIM mention so a future rename doesn't silently break the class assertion.
- **Migration file** (`drizzle/migrations/2026-05-17-b-new-42b-...sql`) should land in SYSTEM_IMPACT_MAP's migrations subsection if that subsection exists, otherwise note in the detector's SIM entry as "DDL state managed via this migration."

Neither is blocking. Add at Step 3 governance update pass.

---

**3. Sub-step ordering.**

Approved. Halt → corp-action → ex-div sequencing matches scope §3 intent. Each independently shippable. Compatible with no-inter-step-blocking rule.

One nit: pre-audit §6 step 4 is "module constants migration" listed AFTER ex-dividend. Migration should run BEFORE any code path that reads from `module_constants.price_discontinuity_detector.*` rows. Either run the migration on staging DB first (parallel with halt-detector authoring) or wildcard-default the reads with sentinel defaults so the code-side is robust to pre-migration DB state. Latter is more defensive given B79.0a `_NO_WINDOW = Infinity` precedent — recommend that pattern.

---

**4. Risk register completeness.**

7 items cover the major surface. Three small adds worth a row each:

- **Cold-start mid-halt blindspot** (after the refinement above is applied this becomes Low/Low — small window, fail-safe-skip protects against unfillable-fill outcome. Before the refinement it would have been Medium/High). Worth documenting explicitly so the residual risk is captured for post-deploy reasoning.
- **Migration idempotency.** Seed migration must use INSERT-IGNORE or ON CONFLICT DO NOTHING — if rows pre-exist (re-run, staging vs prod drift), must not crash. One-line risk + mitigation.
- **Detector cache unbounded growth.** Low likelihood — xStock universe is ~50-100 symbols, bounded. But if lazy-eviction (per #1) isn't implemented, memory grows monotonically across long uptime. One-line risk + mitigation (lazy eviction on each call).

---

**5. 5min HARD_CEILING auto-clear timer mechanism.**

**Prefer stateless timestamp comparison over per-call setTimeout.** Reasoning:

- No timer reference to track in state, no clearTimeout on transition, no leak surface on restart.
- Deterministic — only evaluates when a tick arrives. No background firing.
- Trivially testable with synthetic timestamps in unit tests (no fake timers, no `vi.useFakeTimers()` boilerplate).
- Functionally equivalent: if WS drops entirely between t=10s and t=5min10s, no shouldClosePosition calls happen → no stops fire → state expiry doesn't matter. If a tick arrives at t=5min10s, the stateless check `(now - state.activatedAt) > HARD_CEILING_MS` returns true, force-transitions to IDLE, evaluates the new tick normally. Same outcome as setTimeout but without the timer.

setTimeout-per-call also has a subtle gotcha I want to flag for Step 4: each tick that lands in DISCONTINUITY_ACTIVE with |Δ%| ≥ 0.5% extends the active state but doesn't reset the timer — if implemented naively, a "stuck in active" symbol could time-out after 5min from the FIRST gap-tick even though we kept seeing gap-ticks. The stateless approach is unambiguous: cleared when `now - activatedAt > HARD_CEILING_MS`, full stop.

If you have a strong reason to prefer setTimeout (B-NEW-40 doctrine alignment is a fine reason — your call), the implementation needs to handle clearTimeout on every state transition AND on `clearTrailingState`. State at Step 4 explicitly which pattern you went with so I can verify cleanup paths.

---

**Sign-off:** Pre-audit is clean to proceed to Step 3, with the cold_start fail-safe-skip preservation in #1 as the only non-negotiable. Everything else (eviction policy, stateless timer, the three risk-register adds, the SIM minor adds, the migration-first ordering) is Step 3/4 implementation polish — flag your decisions at Step 4 dispatch and I'll verify in the diff review.

Proceed to Step 3.
