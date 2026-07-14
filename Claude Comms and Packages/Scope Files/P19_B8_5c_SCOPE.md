# P19-B8.5c — SCOPE: VTS kernel-friction UNITS fix + telemetry decontamination (#503)

change-class: non_architecture
**Owner:** CC-B (NEW Claude) · **Date:** 2026-07-14 · **Home:** RUNNING_ISSUES #503 (filed 2026-07-14, Langston independently confirmed all four evidence legs at origin)

## Context (settled at #503 — not re-litigated here)
The net-expectancy kernel's contract is price-unit dollars: `netEV = pWin·distTarget − pLoss·distStop − totalFriction` with distances in dollars (`net-expectancy-kernel.ts:114-115`). Both VTS lanes' STANDALONE kernel calls pass `totalFriction` as a round-trip FRACTION (~0.018) with raw dollar prices — crypto `vts-runner.ts:1673/:1686`, xstock `eval-cycle.ts:719/:737` — mis-scaling friction by ~entryPrice× (direction flips at $1: >$1 symbols under-penalized, <$1 over-penalized). The GATES are already honest since B7.2b/d (both floors gate `decideMakerTaker.chosenNetEV`, which multiplies correctly at `maker-taker-decision.ts:217`) — the LIVE damage today is TELEMETRY/ARCHIVE: the bugged `kernelResult` ships daily into learning records and logs, and two in-code comments assert an equality that is false.

## Objectives
1. **OBJ-1 — fix the units at both standalone kernel calls.** Crypto `vts-runner.ts:1686` and xstock `eval-cycle.ts:737` pass `totalFriction × entryPrice` (price units). No behavior change AT THE GATES (they read `chosenNetEV`, unchanged); the change makes every remaining `kernelResult` consumer honest.
2. **OBJ-2 — decontaminate the telemetry/archive consumers.** Enumerate EVERY `kernelResult` read downstream of both call sites (known: xstock `expectedEdge`/`netEv` archived features, reject-row `takerNetEv`, `frictionCost`/`totalFriction` payload fields, the crypto `[18L]` log line) and verify each now records the honest number. NOTHING is renamed; values become correct.
3. **OBJ-3 — fix the two FALSE comments** (`vts-runner.ts:1707`, `eval-cycle.ts:756` claim `decision.takerNetEV == kernelResult.netEV`): after OBJ-1 the equality becomes TRUE (same fraction source × entryPrice both sides — verify inputs match exactly: crypto decision uses `costMetrics.slippage` while the kernel uses `estimatedSlippage = costMetrics.slippage || 0.001`, and xstock kernel uses hardcoded `spread = 0.001` vs decision `costMetrics.spread`; ALIGN the standalone call's inputs to the decision's cost source so one number exists, then the comment is honest). This is the single-consistent-number invariant (B7.2 OBJ-3) applied to the VTS lanes.
4. **OBJ-4 — stamp the cohort boundary.** The archive carries three regimes: (a) pre-07-01/03 = mis-scaled friction SELECTED + RECORDED; (b) 07-01/03 → this deploy = honest gate, mis-scaled RECORDED telemetry; (c) post-deploy = honest both. Record the three-regime boundary in CHANGES_AND_FIXES + the MULTI_ASSET working list + the #206/#501 replay notes (dates + affected fields), so no Phase-25 query mixes regimes unknowingly. No data rewrite (never-drop; the records are honest ABOUT what the system believed at the time).

## Non-goals
- No gate/threshold changes (floors still read `chosenNetEV`; VTS_NET_EV_FLOOR untouched — its price-space semantics are a known quirk, NOT worsened by this fix; if Langston wants it re-homed that is a separate item).
- No historical data rewrite. No active-path changes (it prices via the shared decision, already correct).

## Verification criteria
- Bench green (tsc baseline + vitest; new unit test: standalone kernel call site parity — `kernelResult.netEV === decision.takerNetEV` on identical inputs, the OBJ-3 invariant pinned).
- Step-7 live check (the #503/FIX-2026-07-13-B lesson): post-deploy, sampled fresh archive rows show `takerNetEv`/`expectedEdge` consistent with `chosenNetEV` scale (no more +0.97-vs-−7.41 impossibilities); the `[18L]` log line prints friction in dollars.
- xstock/crypto admit rates UNCHANGED at the gates (pre/post daily admit counts within noise — proves OBJ-1 touched telemetry only).

## Workflow
Full 11-step; Langston Step-1 (this doc) → Step-2 pre-audit (the OBJ-2 consumer enumeration IS the pre-audit's core) → Step-3/4 diff review pre-push → CI → deploy → Step-7 live-populate check → Step-8 → governance (#503 close, CHANGES_AND_FIXES, SIM archiver row note, completion report).
