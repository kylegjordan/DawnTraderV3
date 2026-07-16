# P19-B8.7 — TRADE-TABLE PARITY: Completion Report (2026-07-16)

> change-class: non_architecture (Langston-agreed). Head `bf9a67a2b`, CI run
> `29504653999` all 4 GREEN, NO migration, deployed BUILD_EXIT=0 + engine CONTINUE
> (session `paper_VAooK2rHPP`). Langston: Step-1 pass (4 pin-downs) → Step-2 PASS →
> Step-4 APPROVED → Step-8 PASS (deploy parity + the #517 finding independently
> re-verified at the ref).

## PREVIOUSLY-STATED-VS-NOW
- PREVIOUSLY STATED (Step-4 dispatch): closed table "+6 columns". NOW: **+5**
  (B/S, TEC State, Signal/Pattern, Target/Stop, Duration). REASON: miscount in the
  dispatch message; the diff and Langston's independent count are 5 — "count-is-not-a-set."

## Scope objectives

| OBJ | Status | Evidence |
|---|---|---|
| OBJ-1 blank CLASS column | **YES** | API row += `assetClass` (stamp, never re-derived) + `patternType`; §9.3: first open row renders "Crypto Spot" badge |
| OBJ-2 blank Strategy (closed) | **YES** | Root cause WHITE-ON-WHITE (browser-DOM: computed rgb(255,255,255) on transparent) — stale color-map fallback killed the Badge bg, kept white text. Fallback now self-colored (`text-foreground`), visibility map-independent, dead `range_trading`→`range_trade`. §9.3: "support_bounce" renders at rgb(15,23,41) |
| OBJ-3 slots split-brain + fallback family | **YES** | Both display sites re-keyed to `guardrails_v2.max_open_positions` (the ONE engine-enforced constraint — named per Langston pin-down 2); `\|\|5` deleted; both engine `\|\|15`s → Number() + isFinite guard → halt-admissions-this-tick-LOUDLY, loop alive (Langston safe-degrade constraint, verified in his Step-4); `'50.00'` → DB `maxTotalExposurePct`; `dynamic-slots.ts` DELETED rule-18 (archived + logged; zero consumers). §9.3: "Guardrail Max: 15", slot "1/15", NO false OVER LIMIT at 11 open |
| OBJ-4 VTS-mirror columns | **YES (data-available set)** | Open +8 (B/S, TEC State, Signal/Pattern, Stop(SL), Edge, Rank, Regime Wt, Opened); closed +5; all em-dash-safe; column/body balance verified by Langston (8/8, 5/5). Capture gaps (Volume/OB, Pair/Glbl Friction split, Pair/Glbl DBS, Glbl Regime) = **#515** (withheld-not-fabricated) |
| OBJ-5 paper-richer columns INTO VTS | **PENDING KYLE** | Recommendation delivered (cost decomposition + close Reason + B8.6 exit stamps into VTS closed; skip Slot); ships on his ruling |
| OBJ-6 Closed-Trades analytics box | **PENDING KYLE** | Feed proven working server-side; redundancy vs the B8.3 dashboard ~total; joint recommendation DELETE; nothing cut without his sign-off + the endpoint-consumer trace |

## §9.3 verification (Kyle's mandatory navigate-and-look rule)
Paper open + closed walked in the browser, real rows read from the DOM (evidence above).
Live open/closed: **cannot meet even the structural bar** — pre-existing two-layer guard
(component `isPaper` short-circuit at `active-trades-v2.tsx:1244` + paper-hardcoded
routes, Langston-enumerated). Finding → **#517**, Phase-21 pre-activation home
(Langston: "clean §13 home — building it here would've been scope drift; deferring
without a home would've been the open-loop trap").

## Follow-ups (all homed)
- #515 active-path capture gaps (+ m5e private-copy rider) — Phase-19 small-batch or Phase-20 sweep.
- #516 → **P19-B8.8** guardrail sizing-fallback fail-loud sweep (Langston: home-not-fold;
  sizer fail-loud design differs — a sizer cannot skip-a-tick). Slot: after the #512 watchdog.
- #517 live-mode trade-table wiring — Phase-21 pre-activation checklist.
- OBJ-5/OBJ-6 execute on Kyle's rulings (this report amends when they land).

## Process notes
- Shared-tree incident: OLD Claude's bare-commit swept this batch's STAGED
  dynamic-slots deletion (half a pair → red CI); he owned + reverted (`f00a9f37d`).
  Both-sided fixes adopted: his `git diff --cached --stat` pre-commit check; my
  stage-only-at-the-moment-of-commit rule (a staged change parked in a shared index
  is a loaded trap).
- The tsc baseline gate caught 3 first-pass regressions pre-push (duplicate
  `tradeMode` property; a SECOND dynamic-slots consumer at the TopBar summary route
  the first grep missed; TS18047 narrowing) — all fixed before dispatch.

## Governance files changed (this close)
SYSTEM_IMPACT_MAP.md (★ B8.7 degrade-behavior + display re-key block — Langston's
required SIM content note) · RUNNING_ISSUES.md (#515 #516 #517) ·
DELETED_COMPONENTS_LOG.md (dynamic-slots) · BATCH_CATALOG.md (row) ·
PHASE_HISTORY.md (entry) · PHASE_19_PLAN.md (§5 row) · MEMORY_CC_B (+ mirror) ·
Langston MEMORY (10.b) · this report. Scope + pre-audit committed at Step-1/2.
SYSTEM_MANUAL: N/A (display/data-quality — Langston §16 confirmed at scope + Step-2).
