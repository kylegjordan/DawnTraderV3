# B-DIAG-387 — xStock Filter-Diagnostics EV-Reject Counter Fix

change-class: non_architecture

**Phase:** 19 · **Owner:** Claude New (CC-B) · **Issue:** RUNNING_ISSUES #387
**Drafted:** 2026-06-25 · combined Scope (Step 1) + Pre-Audit (Step 2)

---

## 0. Why now (Kyle directive 2026-06-25)

Fix #387 FIRST (ahead of reorg-B4), because the xStock Net-Expectancy-floor
rejection rate is the **clean instrument for the reorg-B7 maker/taker baseline**
(per the #385 decision to keep the Net-EV floor enforcing). Today the dashboard
shows that count as **0**, which is what produced my retracted #386
"xStock clears EV" error — the data IS being captured durably in
`signal_eval_archive`, but the dashboard counter the human reads is broken.
This batch makes the dashboard match the archive.

**This is observability-only.** NO gate decision, strategy, regime, signal-
pipeline, or EV math changes. Only telemetry counters + their endpoint
surfacing + panel rendering. Hence change-class `non_architecture`.

---

## 1. Root cause (verified in code)

1. **The dead read.** `server/routes.ts:7844` (the `/api/xstocks/filter-diagnostics`
   endpoint) emits:
   ```ts
   rejectedReasons: { netEvBelowFloor: byReason['net_ev_below_floor'] || totalRejected },
   ```
   `byReason` (declared :7414) is never populated — the comment at :7416 calls it
   "declaration scaffolding for the existing reference shape." `totalRejected`
   (:7413) stays `0`. So the value is **always 0**.

2. **The missing write.** The xStock eval-cycle net-EV reject site
   (`server/asset_classes/xstock_spot/eval-cycle.ts:716-742`) does
   `counters.signalsRejectedBySQE++` and archives `reason:'net_ev_below_floor'`,
   but records the reason in **no in-memory counter** the endpoint reads (it does
   NOT touch `nullReasonAggregate` or the per-lane aggregates).

3. **Crypto parity (reference).** Crypto (`server/services/vts-runner.ts`)
   increments `vtsEvalCounters.rejectedReasons.netEvBelowFloor` at its reject
   sites (:3826, :3910) and the rolling-24h aggregator sums them (:352-359). The
   xStock endpoint already emits the **same output shape**
   (`rejectedReasons.netEvBelowFloor`) — it just sources it from the dead var.

4. **The lifetime path works.** `scanner.ts:1033-1035` merges every
   `nullReasonAggregate` key from the per-cycle counters into the lifetime
   accumulator `lt.nullReasonAggregate`. So a new reason key written at the
   reject site automatically reaches the endpoint.

5. **Secondary — hidden pre-open gates.** `checkPreOpenGates`
   (`vts-runner.ts:3000`) can return `reentry_cooldown`, `duplicate_position`,
   `price_past_stop`, `price_past_target`, `max_open_trades`. The xStock pre-open
   reject site (eval-cycle.ts:754-778) writes `nullReasonAggregate[gateCheck.reason]`.
   Of these, `duplicate_position` + `max_open_trades` already render (panel
   Section 2). The other three — **`reentry_cooldown`, `price_past_stop`,
   `price_past_target`** — are in `nullReasonAggregate`/`nullReasonDetail` but are
   rendered by neither the structured `nullReasons` rows nor the panel's grouped
   `detail` (groupDefs at machine-learning.tsx:2990-2997 don't list them). So they
   are invisible = hidden gates (violates Kyle's no-hidden-gates rule).

---

## 2. Objectives + verification

### OBJ-1 (PRIMARY, decision-grade) — `rejectedReasons.netEvBelowFloor` reports the true count
- **eval-cycle.ts net-EV reject site (:716):** increment
  `counters.nullReasonAggregate['net_ev_below_floor']` (feeds the endpoint total
  via `lt`) AND the per-lane aggregate the panel's per-pool columns already read —
  `(lane.kind==='pattern' ? counters.patternNullReasonAggregate : counters.quantNullReasonAggregate)['net_ev_rejected']`
  (the client reads `quantDetail['net_ev_rejected']`/`patternDetail['net_ev_rejected']`
  at machine-learning.tsx:3148-3149).
- **endpoint routes.ts:7844:** source from the real counter —
  `rejectedReasons: { netEvBelowFloor: lt?.nullReasonAggregate?.['net_ev_below_floor'] ?? 0 }`.
- **per-cycle block (lastCycleVtsEval, :7893-7935):** add
  `rejectedReasons: { netEvBelowFloor: ec?.nullReasonAggregate?.['net_ev_below_floor'] ?? 0 }`
  for parity/completeness.
- **VERIFY:** on staging, `/api/xstocks/filter-diagnostics` `vtsEvaluation.rejectedReasons.netEvBelowFloor`
  is non-zero and within ~±15% of the `signal_eval_archive` count
  (`reject_stage='sqe'` AND `gate_decision->>'reason'='net_ev_below_floor'`,
  `asset_class='xstock_spot'`) over a matched window. UI Section-3 "Net EV Below
  Floor" row renders the real number (Claude-in-Chrome, §9.3).

### OBJ-2 (SECONDARY, no-hidden-gates) — surface the 3 invisible pre-open gate reasons
- **endpoint structured `nullReasons` (:7829-7843):** add
  `reentryCooldown`, `pricePastStop`, `pricePastTarget` keys sourced from
  `live['reentry_cooldown'|'price_past_stop'|'price_past_target']`.
- **shared panel (machine-learning.tsx Section 2 "Pre-Evaluation Skips"):** add 3
  rendered rows (guarded `?? 0`, additive — crypto reads its own `nullReasons`,
  renders 0 harmlessly until/unless crypto endpoint is later extended).
- **VERIFY:** xStock panel shows the 3 rows with real counts; cross-check against
  `signal_eval_archive` (`reject_stage='tcl'`, `gate_decision->>'reason' IN
  ('reentry_cooldown','price_past_stop','price_past_target')`).

---

## 3. Files touched (blast radius)
- `server/asset_classes/xstock_spot/eval-cycle.ts` — +counter writes at net-EV
  reject site (OBJ-1). No control-flow change.
- `server/routes.ts` — endpoint surfacing (OBJ-1 + OBJ-2). xStock endpoint only.
- `client/src/pages/machine-learning.tsx` — shared FilterDiagnosticsPanel render
  rows (OBJ-1 already wired; OBJ-2 adds 3 rows). Additive, `?? 0`-guarded.
- **No** schema/migration/DB change (counters are in-memory; archive already has
  the durable data). **No** crypto-side code change. **No** gate logic change.

## 4. SIM / System Manual applicability
- **SIM:** xStock filter-diagnostics is a display/observability surface — SIM-scope
  (component data-flow). Update the xStock diagnostics endpoint note.
- **System Manual:** NOT applicable — no architecture/strategy/regime/filter/signal-
  pipeline/math change (per §9 applicability judgment; this is a counter/display fix).

## 5. Open question for Langston (Step-1/2)
Is OBJ-2 in-scope here, or should it be a separately-§13-homed follow-up? My call:
keep it — it's additive, observability-only, same files, and directly serves the
no-hidden-gates rule. But flag if you'd rather isolate OBJ-1 (the decision-grade
counter) to keep the batch minimal.
