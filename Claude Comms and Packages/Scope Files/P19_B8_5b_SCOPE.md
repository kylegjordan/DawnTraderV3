# P19-B8.5b — Pre-Flip Capture + Gate-Feed Batch (Step-1 Scope)

change-class: architecture

**Batch:** P19-B8.5b — the second pre-flip prep batch (pre-flip gate #1 of the four crew-locked gates + the #498 feed fix). Owner: NEW Claude (CC-B). **architecture** — OBJ-2/3 change what the VTS expectancy kernel CONSUMES (real DI replaces the proxy = an EV-input change on the learning substrate) and DELETE a component (rule 18); OBJ-4 changes which SQE gates actually run at refresh. SysManual + SIM content owed at close.

**Naming/absorption (Langston to ratify at Step-1):** this batch ABSORBS the previously-named **B-NEW-53.3** (the five decision-time scalars, #206) plus **#500** (real-DI carry + bridge delete) plus **#498** (refresh-omission feed — which had a timing+owner home but NO batch name; per Kyle's name-the-fix rule re-enforced 2026-07-13, it gets this name now). One named pre-flip CC-B batch instead of three fragments; #206/#498/#500 all point here at close.

## Objectives

1. **OBJ-1 (B-NEW-53.3 / #206) — persist the five decision-time indicator scalars** (vwap / atr / sma / high24h / low24h; + avg-volume for crypto if the read-surface audit confirms it is strategy-consumed) on `signal_eval_provenance` at decision time. Step-2 decides scalars-vs-`settled_window_hash`-vs-both against the per-strategy read-surface (the #206 open design question). Purpose: lift decision-replay fidelity from the measured 70.73% toward the ≥99% gate (unblocks 25-12 after ~3wk accrual post-flip).
2. **OBJ-2 (#500a) — real-DI carry, BOTH lanes.** Carry the scanner-computed DI onto the scan-batch hand-off (`ScanBatchPair.di` — the same ride `dbsScore` got in B63) and consume it in the VTS kernel + `decideMakerTaker` inputs (`vts-runner`) and the xstock eval-cycle. DI is PRICE-ONLY (`analysis-utils.ts:107`) — no data obstacle on either class; xstock already computes it in its filter evaluations. Fills B8.5a's `realDiAtOpen` with real values on both lanes.
3. **OBJ-3 (#500b) — DELETE the `predictiveConfidence×100` bridge** (`vts-runner.ts:1657` + `eval-cycle.ts:706` + the hardcoded `diAtOpen`-adjacent proxy uses) — **deleted, not left as a fallback** (rule 18, crew-locked 2026-07-13; DELETED_COMPONENTS_LOG entry + blast-radius trace at the cut). `kernelDiInputAtOpen` then records the REAL DI (the field stays honest either way).
4. **OBJ-4 (#498) — feed the refresh-side SQE.** Both RTB-refresh `sqeInput`s (`ready_to_buy_service.ts:909-920` single + `:1163-1176` batch) gain `regimeStability` + `sourcePool` so the confidence floor (`signal_quality_evaluator.ts:355`), governance gate (`:392`), pattern elevated floor, and AMR pool-awareness (`:376`) actually run at refresh (today they silently skip). Source: the stored row + metadata (enumerate at Step-2; honest-absent where genuinely unavailable — no fabrication).

## Behavior-change honesty (stated up front)
- OBJ-2/3: VTS netEV values and VTS-floor decisions CHANGE when real DI replaces the proxy — that is the point. Expect a VTS volume/mix shift; called out at close, watched, not a regression.
- OBJ-4: refresh-side rejections will INCREASE (gates that silently skipped now run). Expected; the funnel counters (B8.4b) make it visible.

## Verification criteria
- OBJ-1: a provenance row carries the five scalars at decision time; a replay of that row reproduces the decision (spot sample).
- OBJ-2: a VTS open (each lane) carries `realDiAtOpen` == the scanner's DI for that pair (non-null, ≠ proxy); the kernel input traces to it.
- OBJ-3: zero references to the proxy remain (`tsc` + grep proof); DELETED_COMPONENTS_LOG entry; archived `.removed` copy.
- OBJ-4: a refresh-cycle SQE evaluation demonstrably runs the confidence floor + governance gate (test with injected inputs); pattern-pool refresh uses the elevated floor.
- Bench green (tsc baseline + vitest) · Langston Step-2 pre-audit BEFORE code + Step-4 diff BEFORE push · CI 4-green · migration only if OBJ-1 needs columns (Step-2 decides) · Step-8 · SysManual+SIM content at close.

## Out of scope (named homes)
#499 B-OPS-PM2-LOG (CC-A) · #501 backtest-baseline harness (CC-A, sequences after this batch for honest-DI) · B8.5 THE SWITCH-ON (carries the B8.5a behavioral proofs per §9.1) · Phase-25 calibration (the ratified §8 set).
