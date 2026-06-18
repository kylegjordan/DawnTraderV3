# P19-B6.5e — Pre-Audit (Step 2) · open-path silent-failure repair

> **Batch:** P19-B6.5e · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-18 · **Issue:** #325
> Companion to `P19_B6_5e_SCOPE.md` (Langston Step-1 **PROCEED** 2026-06-18, all 3 JC answered). This carries the SIM cross-cutting-state consultation (Langston's `non_architecture` CONDITION), the OBJ-1 blast-radius, and the dry-run envelope. Dormant baseline re-verified at run-start (paper+live `is_engine_active=f`, `active_asset_classes={}` both modes — confirmed 2026-06-18 via `system_context`).

## 1. SIM cross-cutting-state consultation (Langston's condition — mandatory SIM CONTENT update)

Read: `SYSTEM_IMPACT_MAP.md` → "Cross-Cutting Runtime State, Singletons & Liveness Registry" (S1–S15 + liveness model + per-class gate) + Layer-1 §1.2 Net-Expectancy Kernel.

**Finding — `rtb-metrics-service` is an UNREGISTERED cross-cutting telemetry singleton (a governance gap this batch closes).** `RtbMetricsService.getInstance()` (`rtb-metrics-service.ts:74`) holds the in-memory I3 accounting (`attemptsTotal / openedTotal / blockedTotal / blockedByReason` + `bySymbol / byStrategy` + the I5 `blockEventBuffer`). It is **NOT listed** in the S1–S15 registry. Per the registry's own maintenance-discipline rule (SIM line 63: *"any batch that adds/removes/re-keys a … module-singleton / static field … MUST update this registry"*), and per Langston's Step-1 condition, B6.5e MUST:
- **(i) REGISTER it** as a new row (proposed **S16**) — verdict **MODE-INVARIANT telemetry** (like S2/S5/S8/S15; a single global counter, NOT trade state, won't corrupt decisions).
- **(ii) CONTENT-update** the registry + the I3 description for the NEW invariant shape `attemptsTotal === openedTotal + blockedTotal + openFailedTotal` (+ `openFailedByStage`), and note `recordDepthGateBlock` (depth-source.ts `_gateBlocks`, already SIM-noted in the B4b.1 callout) is the fine-grained per-class breakdown UNDERNEATH the new coarse `openFailedByStage`.
- **(iii) HOME the Phase-21 question (§9.4):** the singleton is a SINGLE global across modes; a paper+live co-run would COMINGLE both modes' I3 counters. Telemetry-only (not split-brain trade state), so NOT a B6.5e blocker, but the per-mode funnel would be muddied at co-run. → **RUNNING_ISSUES home: "P19-B4b/Phase-21 telemetry mode-isolation" candidate** (mode-key rtb-metrics like S7/S9). Flagged, not fixed here (dry-run is crypto-only single-mode paper).

**SIM is the right doc (not System Manual):** this is a cross-cutting-STATE registry change + the EV-gate is already documented in Layer-1 §1.2; no NEW architecture/strategy/regime/math. System-Manual content-update **N/A** (judged per §9 applicability — a telemetry-accounting + control-flow-honesty change, not a math/architecture change). SIM content update is **in-scope + mandatory** (Langston condition).

## 2. OBJ-1 blast radius (the control-flow + invariant change)

| Change | File · symbol | Upstream / callers | Downstream / consumers | Risk |
|---|---|---|---|---|
| `executeSimulatedTrade` `void` → typed `OpenOutcome` | `paper-execution-engine.ts:1892` | sole caller `processSignal` (:1863, via `executePromotedSignal`) — currently ignores return | `executePromotedSignal` (:1827) consumes outcome directly; DELETE the `getPaperSimTradesBySymbol` before/after delta inference (:1836/:1866) | LOW-MED — single caller; the trade-count-delta removal is a net simplification. Verify no OTHER caller of `executeSimulatedTrade` (grep: only `processSignal`). |
| each post-guardrail bare-`return` → `{opened:false, stage, reason}` | `paper-execution-engine.ts` (EV 2044 / qty 2125 / class 2133·2314 / depth 2142 / fill 2155·2159·2173 / dup 2211 / insert-catch 2611) | n/a | the new outcome + `rtbMetricsService.recordOpenFailed(symbol, strategy, stage, reason)` | LOW — additive labelling; behavior (the skip) unchanged, only now reported |
| NEW `openFailedTotal` + `openFailedByStage` + `recordOpenFailed()` | `rtb-metrics-service.ts` | the open-stage early-exits | I2 `getSummary` + I3 `logInvariantCheck` (invariant → `=== opened+blocked+openFailed`); `GET /api/diagnostics/rtb-metrics` (`routes.ts:8704`) | LOW-MED — touches the shared singleton + the API shape (additive field; existing consumers keep working). UI reads it (rtb-metrics panel) — additive, no break. |
| `recordOpen` placement | `paper-execution-engine.ts:2574` | unchanged | unchanged | NONE |

**Invariant correctness after OBJ-1:** every path from `recordAttempt` (trade-safety:674) now terminates in exactly one of `recordOpen` / `recordBlock` (guardrail) / `recordOpenFailed` (post-guardrail) → `attempts === opened + blocked + openFailed` HOLDS by construction. The depth-gate already calls `recordDepthGateBlock`; B6.5e ADDS the `recordOpenFailed(stage:DEPTH_GATE)` alongside so the coarse I3 invariant reconciles AND the fine per-class counter persists (no double-count: `recordDepthGateBlock` is a separate map, not part of `blockedTotal`).

## 3. OBJ-2 candidate ranking (post-Langston)
1. **(d) depth-sufficiency gate `no_book`** — leading. `getBookForFill` (`kraken-websocket-adapter.ts:3062`) returns null if `orderBooks.get(symbol)` empty / `bookUpdatedAt` unset / 0 levels; warmth blocks if age>5000ms or <3 levels. The scanner subscribes ticker+book together (`:1117-1134`) so an actively-scanned pair *should* be warm — UNCONFIRMED for a just-promoted crypto symbol at first-open; the dry-run + OBJ-1 `openFailedByStage` decides. The book subscription for the trade (`i8cSubscribeNewTrade`, :2488) is AFTER the gate → cannot help the first open.
2. **(a) Net-Expectancy gate (11.8B, :2044)** — Langston's #2 watch. Fires AFTER the $102.20 sizing, on crypto friction (spread+fees via cost-model) the dry-run hasn't characterized; a silent bare-`return`. Hold as #2.
3. Deprioritized: (f) dup-guard (contained dry-run, cleaned `paper_sim`, no prior position → won't fire first-open); (b) qty≤0 (sizing succeeded); (c) unclassifiable (B6.5d fixed crypto classify).

**Escape hatch (Langston):** if OBJ-1 reveals MULTIPLE distinct open-stage breaks (not one), promote to a full **P19-B7** — flagged here at Step-2, decided at Step-3 once the `openFailedByStage` histogram is in hand; NOT silently absorbed.

## 4. Dry-run envelope (contained, reuse B6.5 §5 — REVERTED)
Staging paper, fake money, internal validate-vetted fill, NO real orders. Re-verify dormant baseline at run-start; arm daily-loss kill (20%); crypto_spot the ONLY active class (xStock OFF); tiny balance + hard position cap. OBJ-1 instrumentation **deploys BEFORE** this run (Langston note 1). Flip via `setAssetClassActive(…,'paper','crypto_spot',true)` + start engine → observe the I3 `openFailedByStage` + open-path tags → name the stage → (Step-3) fix root cause → re-run for gate-10 (full closed lifecycle) → revert (`setAssetClassActive(…,false)` + stop; verify `active_asset_classes={}` + paper_sim clean). xStock `LIVENESS_SPLIT=0` witness throughout.

## 5. kraken.ts LOCK respected
OBJ-2's likely fix (ensure a promoted crypto symbol's WS book is subscribed+warm before open) uses the existing `krakenWebSocketAdapter` PUBLIC API (`i8cSubscribeNewTrade` / a pre-open ensure-subscribed call / `getBookForFill`) — **NOT** an edit to the 🔒 LOCKED `kraken.ts` (the REST service; the WS adapter is `kraken-websocket-adapter.ts`, separate + not locked). Confirmed the WS adapter is the open-side feed, kraken.ts (REST) is untouched.

---
*Step-2 complete. → Step-3: implement OBJ-1 (instrument) → bench → CI → deploy → OBJ-2 dry-run pinpoint → root-cause fix → gate-10 re-run → OBJ-4 #327 → OBJ-5 JC#4 disposition → Step-4 embedded-diff review → governance (incl. mandatory SIM S16 content update) → close.*
