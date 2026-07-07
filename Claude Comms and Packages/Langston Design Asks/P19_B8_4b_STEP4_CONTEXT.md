# P19-B8.4b Step-4 — active-path funnel ENGINE EMITS (the wiring half)

**From:** NEW Claude (CC-B) · **To:** Langston · **Step:** 4 (diff review BEFORE push) · **Change-class:** non_architecture (telemetry-only instrumentation; no trade-state, no order path)

**Diff to review:** `Claude Comms and Packages/Langston Design Asks/P19_B8_4b_STEP4_ENGINE_EMITS.diff` (376 lines, 8 files, +127/-7). Bench GREEN: tsc baseline = no regressions above baseline; the S21 unit test = 11/11 pass.

---

## What this batch is

B8.4b is the ENGINE-EMIT half of the active-path Filter-Diagnostics funnel. The accumulator (`active-funnel-tracker.ts`, S21), the shared envelope, the `/api/active-engine/diagnostics/funnel` endpoint, and the client dormant/active render all landed in Part-2/Part-2a and passed your earlier Step-4. This batch **wires the production emit calls into the active pipeline** so that — once paper-active turns ON at B8.5 — real per-(mode,assetClass) counts flow. Everything is **DORMANT (zero) today**: the writers are only reached from the active path, which is OFF. "Connected but unproven until switch-on" (Kyle) — the shape is proven by the synthetic-emit unit test; the live flow is proven by a B8.5 test harness before switch-on.

Also in this diff: the `postSqeRejects` shape extension (tracker record + envelope field + client StageBlock + one unit test) — added because the funnel order is honest only if post-SQE drops are a distinct bucket (see anchor-b below). That's the +18/+5/+3/+12 across tracker/envelope/client/test.

## Emit-site map (the load-bearing part)

**signal-orchestrator.ts — `buildSizedSignalForStrategy` (SHARED chokepoint; BOTH pipes flow through it, each carrying its own `sizingContext.assetClass`, so these are per-class-correct automatically):**
- top (per non-null rawSignal) → `recordActiveSignalsGenerated` — the funnel DENOMINATOR
- `:463` unmappable_symbol → preSqeReject
- `:497` strategy_gate (DB per-class gate) → preSqeReject (+strategy)
- `:573` sizing_zero → preSqeReject (+strategy)
- `:790` SQE-at-generation → `recordActiveSqeEvaluation(..., 'generation')` — records BOTH pass and fail (pass feeds the denominator)
- `:843` position_cap → **postSqeReject** (sits AFTER the :790 SQE)
- `:1356` reorg-B2 target gate → **postSqeReject** by `_b2.reason` (invalid_geometry/rr_below_min/invalid_atr/unreachable)

**signal-orchestrator.ts — `evaluateSymbol` family-filter loop (CRYPTO pipe only; xStock's external-dispatch pipe has no family stage):**
- `:1914` each strategy the family tags excluded → preSqeReject `family_imf` (+strategy). Emitted BEFORE `activeStrategies.clear()` (the pre-filter set is still intact there).

**rtb-refresh-service.ts — `refreshModeSignals` (anchor-a):**
- cyclesRun ticks per funnel class present in the bucket, right after `refreshAndRank` runs — so `hasActiveFunnelActivity` (which keys on cyclesRun) flips dormant→active only when a refresh micro-cycle actually runs.

**ready_to_buy_service.ts — `refreshAndRank` per-signal (each signal has its own `sqeAssetClass`):**
- refreshedAttempted (+1 as the signal enters re-eval)
- SQE-during-refresh → `recordActiveSqeEvaluation(..., 'refresh')` — the honest MUST-4 double-count: `atGeneration` vs `atRefresh`, two labelled numbers, never summed
- rejectedInRefresh (failed re-SQE → dropped)
- reconfirmed (survived re-SQE → stayed queued)

**active-execution-engine.ts — `checkRtbPromotion`:**
- promoted (+1 on promotion-success). Single home for `promoted` (refresh reconfirmed/rejected live only in ready_to_buy_service — one writer per event, no "add promoted to metrics too").

## Your three B8.4b anchors — how each is satisfied

- **anchor-a (cyclesRun on the REFRESH path):** ticked in `rtb-refresh-service.refreshModeSignals` per present class, not in the orchestrator. dormant→active keys on it.
- **anchor-b (blended-headline correctness, no double-count):** a signal rejected pre-SQE `return`s before reaching :790, so it is counted in `preSqeRejects` ONLY (never `sqeEvaluated`). A signal that fails SQE is in `sqeGateRejects` (never `preSqeRejects`). A signal that PASSES SQE then hits position_cap/target-gate is counted in `sqeEvaluated(passed)` AND `postSqeRejects` — different stages, not a double-count of one rejection. This is exactly why post-SQE drops needed a distinct bucket rather than being lumped into preSqeRejects (would have misstated funnel order).
- **anchor-c (client mirrors emit shape):** the `postSqeRejects` StageBlock was added to the client between the SQE and RTB blocks; the shared envelope carries the field so a shape change is a compile event on both sides.

## Isolation premise (the whole batch rests on this — please sanity-check)

`buildSizedSignalForStrategy` + `evaluateSymbol` + `refreshAndRank` + `checkRtbPromotion` are the ACTIVE path exclusively. VTS runs via `vts-runner.ts` autonomously and never calls these. So every count is an active-mode count, and all counters stay dormant until B8.5. Confirmed via the Step-2 pre-check; flag if you see a VTS reach into any of these four.

## Specific asks
1. Emit PLACEMENT correctness (esp. the two post-SQE sites really are post-SQE; family_imf really is before the clear()).
2. Double-count safety (anchor-b) — is the stage partition airtight?
3. Concurrency: `refreshAndRank` runs signals in `Promise.all` chunks; the tracker writers are synchronous Map `+=` (single-threaded-atomic, no await between read and write). Agree that's race-free?
4. Any counter without a single home?
