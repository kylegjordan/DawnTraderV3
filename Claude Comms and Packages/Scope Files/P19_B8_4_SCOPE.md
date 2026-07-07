# P19-B8.4 — Paper/Live Active-Path Filter Diagnostics Instrumentation — SCOPE (Step-1)

change-class: architecture

**Batch:** P19-B8.4. **Author:** CC-B (Claude New). **Reviewer:** Langston (Step-1 scope → Step-2 pre-audit → Step-4 diff → Step-8). **Peer:** CC-A.
**Kyle directive (2026-07-07):** make the Paper and Live **Filter Diagnostics** tabs mode-honest and instrument the active path so real per-mode data flows once paper-active turns on. **RENUMBER:** the switch-on that used to be called B8.4 is now **B8.5**; this instrumentation batch is B8.4 and MUST land before B8.5. Kyle is actively engaged in this batch.

**Sources read for this scope (Kyle-directed):** `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md` (§2 pipeline map, §5 SQE stage, H-findings), `SYSTEM_IMPACT_MAP.md` (the B8.1 mode-axis contract line, the FD-panel + xstocks-tab entries, active-scan-diagnostic rename key), `SYSTEM_MANUAL.md` (Ch.12 SQE deep-dive, the active-path gate-topology note at :480), and a full read of the archived Phase-8 `filter-insights-component.tsx.…removed`. Step-2 pre-audit goes deeper per §2/§9.

---

## 1. Why (the problem, in one paragraph)

Paper and Live active trading are OFF. But the Paper/Live Filter Diagnostics tabs read the **VTS** feed (`/api/vts/filter-diagnostics`, `/api/xstocks/filter-diagnostics`), so they display the VTS/passive pipeline's numbers — filter breakdowns, strategy nulls, signal rejections, evaluation metrics — all computed with **VTS thresholds**, none of it the paper/live active path. Kyle's requirement: on the Paper/Live tabs, show **only the shared scanner stage** (its own mode-keyed numbers) with **everything downstream dormant** ("populates when active trading turns on"), and **instrument the active path** so that at switch-on (B8.5) real per-mode data accumulates: signals generated, the pre-SQE rejections, the **SQE per-gate screening breakdown** (the confirmed gap), and the RTB refresh refreshed/promoted/rejected stats — for **both crypto and xStock**.

## 2. The funnel (Active Trading Path Audit §2 — the skeleton for the tabs)

```
[A] SCAN (mode-keyed)         universe → 12 global filters → eligible pool     ← the "scanner stage" Kyle wants shown
[B] SIGNAL GENERATION         VN veto → regime→strategies → family IMF → run strategies → inline NetEV
[C] SQE                       9 gates (+ AMR sub-gates) — THE quality gate
[D] RTB QUEUE                 hold + 15s refresh micro-cycle (re-runs SQE)
[E] TCL PROMOTION             mechanical slot-limiter + exposure filters
[F] OPEN PATH                 guardrail → [11.8B] NetEV gate → sizing → depth → fill
```
Stage A is mode-keyed but otherwise the same scan; **B onward is active-path pipeline output** that must read as DORMANT on Paper/Live until B8.5, then fill with that mode's real data.

## 3. Archaeology result — KEEP / RE-WIRE / BUILD-NEW (Kyle: "understand what's wired before building new pipes")

| Funnel stage | Status today | Disposition in B8.4 |
|---|---|---|
| **[A] Scan + global filters + eligible pool** | **BUILT + LIVE** — `/api/active-engine/diagnostics/scan?mode=` + `/scan-24h?mode=` (mode-keyed, on-demand, 45s cache; returns `universe_count`, `breakdown` = 12 rejection counters, `eligible_count`, `top_candidates`). The Phase-8 Filter Insights is the display template. | **RE-WIRE** — re-point the Paper/Live scanner-stage sections to this pipe (off the VTS endpoint); revive the archived display. |
| **FD-panel display categories** (Pre-Eval Skips, Post-Signal Rejections, Setup Nulls, By-Strategy) | **DISPLAY EXISTS** but fed from VTS `signal_eval_archive`. B8.3 enforce-disposition + `ActivePipelineTail` + dormant placeholders already scaffolded. | **KEEP the display shells**; re-point to active-path data (built in Part 2). |
| **[B] Signals generated + pre-SQE rejections** | **NOT accumulated on active path.** `signalsGenerated` internal-only (`this.stats`); strategy-gate / sizing / position-cap / reachability rejects are **scattered logs, zero counters**. (The VTS has rich `vtsEvalCounters`/`byStrategy` — the active path does not.) | **BUILD** — mode+class+strategy-keyed active-path counters, modeled on the VTS byStrategy shape. |
| **[B] Family IMF (LQ/VN/DI)** | Not in the scan diagnostic; not in the old Filter Insights (Kyle's memory confirmed). | **BUILD** — orchestrator-side IMF drop breakdown (mode-keyed). |
| **[C] SQE per-gate breakdown** | **Aggregate only** — `recordSQEEvaluation(passed)`. 9 gates + AMR sub-gates; `failures[]` carries the reason (first token = gate) but no numeric tally. Mode+class-aware already. | **BUILD** (the confirmed gap) — per-gate rejection tally, mode+class-keyed. Reflect active-path reality (the SQE ROI gate is dormant on the active path per SysManual :480 — do not imply it fires). |
| **[D] RTB refresh (refreshed / promoted / rejected)** | Computed in `refreshAndRank` (`reconfirmedCount`/`expiredCount`) but **console-log only**; promoted lives in the lifecycle audit; none in `rtbMetricsService.getSummary()`. No double-count flag. | **BUILD** — new counters in `rtbMetricsService` (refreshCyclesRun / refreshedAttempted / promoted / rejectedInRefresh) + an **honest double-count** flag (per-signal `_sqeAttemptCount`) so SQE-at-generation vs SQE-during-refresh are distinguishable, not silently summed. |
| **Exit Strategy Ablation + Factor Calibration** (xstocks-tab) | Render unconditionally (reused from analytics via `endpointBase`). VTS Phase-25 calibration, not active-path. | **HIDE (not delete)** — gate to VTS-only; keep the components + endpoints intact for Phase-25 (Kyle: no point rebuilding; delete later only if Phase-25 proves them unneeded). |

## 4. Objectives

**Part 1 — FIX THE DISPLAY NOW (mode-honest tabs; the half that can land first):**
- **OBJ-1** — Re-point the Paper/Live Filter Diagnostics tabs (crypto + xStock) so their **scanner-stage** sections read the mode-keyed active-engine scan pipe (`/api/active-engine/diagnostics/scan?mode=` + `/scan-24h?mode=`), not the VTS endpoint. The scanner stage shows that mode's own numbers.
- **OBJ-2** — Revive the Stage-A display from the archived Filter Insights (Universe / Cycle Info / Last Scan / 24h Filter Activity / Eligible Pool / Global-Filter Breakdown), adapted to the active-scan response shape.
- **OBJ-3** — Everything downstream of the scanner (IMF / signal-gen / SQE / RTB) renders an honest **DORMANT** state on Paper/Live ("Active-path … populates when paper trading turns on") until Part 2's counters exist AND the engine is on. No VTS numbers bleed onto Paper/Live (extends the B8.3b gating; **completion gates on the §9.3 visual walk of BOTH branches**, not just the diff — the B8.3b lesson).
- **OBJ-4** — HIDE the Exit Strategy Ablation + Factor Calibration tables on Paper/Live (gate to VTS-only); components + endpoints preserved for Phase-25.

**Part 2 — INSTRUMENT THE ACTIVE PATH (built inert; proves out at B8.5):**
- **OBJ-5** — Emit active-path **signals-generated + pre-SQE rejection** counters (strategy-gate, sizing, position-cap, reachability, family IMF drops), mode+class+strategy-keyed, into a persisted/queryable active-path diagnostics accumulator; expose via a mode-keyed active endpoint.
- **OBJ-6** — Build the **SQE per-gate screening breakdown**: extend the SQE eval recorder to tally per-gate rejections (9 gates + AMR sub-gates), keyed by mode + asset class; surface it in the active diagnostics feed. Honest about which gates actually fire on the active path.
- **OBJ-7** — Build the **RTB refresh** stats (refreshed / promoted / rejected-via-re-SQE) in `rtbMetricsService`, with the honest **double-count** between SQE-at-generation and SQE-during-refresh explicitly labeled (not summed silently).
- **OBJ-8** — Wire Part 2's counters into the Paper/Live FD tabs' dormant shells so they light up at switch-on.

**Cross-cutting:**
- **OBJ-9** — Everything applies to **both crypto and xStock**. **Live mode**: build the shared mode-keyed display; replace live's current all-error screens with honest dormant. Live's data does not need to actually flow until Phase 21 — that's acceptable and stated.

## 5. Proposed implementation shape

Two Parts as above. Part 1 is separable and low-risk (display re-point + gating) and can land + verify first; Part 2 is the larger build (engine-side emission). **Recommend one batch B8.4 with two Parts, each getting its own Langston Step-4 diff review** (as B8.2 ran impl-1..5). If Part 2's engine-side emission proves larger than one clean review, we spin **B8.4b** for it rather than bloat one diff — flagging that option now for Langston's call.

## 6. 🚨 Scaffolding disclaimer (§9.1)

**THIS BATCH DOES NOT MAKE THE PAPER/LIVE ACTIVE-PATH DIAGNOSTICS SHOW REAL TRADING DATA. The active-path counters are built INERT and remain empty until paper-active trading is turned ON in B8.5.** Part 1 (display fix + scanner-stage re-point) IS observable immediately; Part 2 (orchestrator/SQE/RTB emission) can only be proven populating once B8.5 flips the engine on. That is expected and acceptable per Kyle.

## 7. Verification criteria

- §9.3 **visual walk of BOTH branches** (enforce/paper + enforce/live + tag/VTS), crypto AND xStock: scanner stage shows mode-keyed numbers; everything downstream reads DORMANT; no VTS numbers on Paper/Live; calibration tables hidden on Paper/Live, present on VTS.
- Part 2 counters proven wired by unit tests + a synthetic/replay injection (accumulators increment correctly, mode+class-keyed, per-gate tally matches the `failures[]` reason) — since live accumulation can't be shown pre-switch-on.
- Bench green (tsc baseline + vitest); CI 4-green; deployed staging HTTP 200; Langston Step-4 (per Part) + Step-8.
- Governance: BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN §1/§5 + **SIM** (new active-diagnostics component/endpoint + FD-panel re-point + calibration-hide) + **System Manual** (SQE per-gate instrumentation — Ch.12; active-path funnel emission) + RUNNING_ISSUES (#418 confirmation it stays a B8.5 gate; any new items homed) + this scope + pre-audit + completion report + MEMORY. DELETED_COMPONENTS_LOG only if anything is removed (calibration is HIDDEN, not deleted → a "left intentionally" note, not a deletion).

## 8. Open questions for Langston (Step-1)

1. **New endpoint vs extend:** build a new mode-keyed `/api/active-engine/diagnostics/funnel?mode=` accumulator endpoint (parallel to `/api/vts/filter-diagnostics`), or extend `/api/active-engine/pipeline-tail`? Recommendation: new endpoint (pipeline-tail is a light snapshot; the funnel is richer, per-stage, per-strategy).
2. **Accumulator persistence:** in-memory module singleton (like the guard-eval-tracker, with on-disk checkpoint) vs a DB table. Recommendation: mirror the guard-eval-tracker pattern (durable singleton, mode+class-keyed) — no migration, restart-resilient, proven.
3. **Part split:** one B8.4 (two Parts) vs pre-declaring B8.4b for the engine-side emission. Recommendation: start as one; spin B8.4b only if Part 2's diff is too large for a clean single review.
4. **SQE per-gate keying:** confirm mode+asset-class is the right cardinality (not per-strategy too — that could explode the key space; per-strategy can live in the orchestrator pre-SQE breakdown instead).
