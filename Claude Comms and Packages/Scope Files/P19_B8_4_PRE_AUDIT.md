# P19-B8.4 — Pre-Implementation Audit (Step-2)

change-class: architecture · **Author:** CC-B · **Reviewer:** Langston (Step-2) · Scope: `P19_B8_4_SCOPE.md` (Step-1 APPROVED)

> Depth beyond the scope per CLAUDE.md §2/§9: per-component upstream/downstream/shared-state/blast-radius + the MUST-1..4 resolutions + the new-singleton design + the "does this duplicate an existing component?" check (★FEEDBACK 2026-06-21). Sources: the 4 read-agents (SQE / orchestrator / RTB / scan-diag+FD), `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, SIM Cross-Cutting Registry (S1–S18) + FD/xstocks-tab entries, SysManual Ch.12 + :480 active-gate topology.

## §1 — MUST-item resolutions (Langston Step-1 gate)

- **MUST-1 (load-bearing — PROVEN on staging 2026-07-07):** `GET /api/active-engine/diagnostics/scan?mode=paper` returned LIVE numbers with paper-active OFF — `universe_count=1534, evaluated=500, eligible=1, ineligible=499`, full 12-way `breakdown`. Verified in code: `active-scan-diagnostic.ts` has **no `isEngineActive`/session guard** — `performUniverseScan` loads Kraken ticker+pairs and runs the scan on-demand (45s cache). ⟹ the "Part 1 observable immediately" premise HOLDS. §6/OBJ-1 stand.
- **MUST-2 (dormant≠zero):** every downstream stage/gate renders an explicit "awaiting activation" state on Paper/Live, never `0`. Applies to the SysManual:480 **dormant active-path SQE ROI gate** too (it never fires on the active path — entry/target/regime unset on the active sqeInput at `signal-orchestrator.ts:669`), which must read DORMANT, not "0 rejections." Implemented as a tri-state per counter: `{status:'dormant'|'active', value?}` — the client renders status, not a bare number.
- **MUST-3 (singleton robustness):** the new accumulator is a durable module-singleton on the guard-eval-tracker pattern — atomic **temp-file + rename** checkpoint (never in-place), ~60s unref'd timer, reload-on-module-load with a `keySchema` guard that DISCARDS-and-loud-logs on mismatch. Cadence = 60s snapshot; retention = the checkpoint is a single latest-state file (not a growing log) → no retention sweep needed (contrast the S15 probe's history table). Registered as **S21** in the SIM registry (§4 below).
- **MUST-4 (double-count = two labeled numbers):** SQE-at-generation and SQE-during-refresh are TWO distinct labeled counts, carried through to the display via a per-signal `_sqeAttemptCount` (1 at generation, ++ per refresh). Never a silent sum. The funnel endpoint returns them as separate fields; the panel renders "SQE (at generation)" and "SQE (during RTB refresh)" as distinct rows.

## §2 — Component blast-radius (per-component upstream / downstream / shared-state)

| Component | File | Change | Upstream | Downstream | Shared-state / blast |
|---|---|---|---|---|---|
| **Active-path funnel accumulator (NEW)** | `server/core/observability/active-funnel-tracker.ts` (NEW) | NEW durable singleton `_stats: Map<'${mode}:${assetClass}:${stage}:${reason}',count>` + `_sqeGateStats` + `_rtbRefresh` + `_startedAt` | written by orchestrator + SQE recorder + RTB refresh | read by the new funnel endpoint | **NEW singleton S21** — mode+class-keyed from day one (not mode-invariant like S16); telemetry-only, not split-brain; atomic checkpoint |
| **Signal orchestrator** | `signal-orchestrator.ts` | emit pre-SQE reject + signalsGenerated counters at the 5 known sites (:444 unmappable, :477 strategy-gate, :552 sizing, :815 position-cap, :1325 reachability) + family-IMF drops; persist `this.stats` per (mode,class) | `SizingContext.assetClass` (carried stamp — S note P19-B6.5d), engine `mode` | the funnel accumulator | reads existing scattered logs → converts to counters; NO behavior change (telemetry-only additions) |
| **SQE recorder** | `signal_quality_evaluator.ts:408` + `performance_monitor.ts:85` | extend `recordSQEEvaluation(passed, failures?, mode, assetClass)` → per-gate tally **derived from `failures[]` tokens** (SSOT — §9.4; a new gate auto-appears) | SQE `failures[]` (already carries gate reason; first token = gate) | the funnel accumulator | **must not change SQE pass/fail semantics** — pure additive tally; VTS still skips confidence+governance (unchanged) |
| **RTB refresh + metrics** | `rtb-refresh-service.ts:1034/1165/1198`, `rtb-metrics-service.ts` (S16) | add refreshCyclesRun / refreshedAttempted / promoted / rejectedInRefresh to `getSummary()`, (mode,assetClass)-keyed; single-writer-per-event invariant | `refreshAndRank` reconfirmed/expired (today console-only), lifecycle-audit promoted | `getSummary()` → funnel endpoint | **EXTENDS S16** (does not duplicate — see §3); consolidates promoted out of lifecycle-audit into the one metrics home |
| **New funnel endpoint** | `server/routes.ts` (or `routes/active-engine.ts`) | `GET /api/active-engine/diagnostics/funnel?mode=` — **shares the response envelope shape with `/api/vts/filter-diagnostics`** (Langston Q1 — DRY the display) | the accumulator + rtb-metrics + SQE recorder | the FD panel (Paper/Live) | read-only; admin-gated like the sibling scan endpoint |
| **FD panel (client)** | `vts-filter-diagnostics-panel.tsx` | on `enforce`: scanner stage ← `/scan`+`/scan-24h?mode=`; downstream ← the funnel endpoint; dormant→"awaiting activation" (not 0) | the two active endpoints | — | extends B8.3b enforce disposition; **§9.3 both-branch visual walk is the completion gate** |
| **xstocks-tab (client)** | `machine-learning/xstocks-tab.tsx` | HIDE Exit Strategy Ablation + Factor Calibration on Paper/Live (gate to VTS-only); keep on VTS | — | — | components + endpoints PRESERVED (Phase-25); "left intentionally / VTS-scoped" note in DELETED_COMPONENTS_LOG (rule-18, not a deletion) |

## §3 — "Does this duplicate an existing component?" (★FEEDBACK 2026-06-21 discipline)

- **RTB refresh counters** — EXTEND S16 (`rtb-metrics-service`), the existing single home for RTB accounting. NOT a new counter service. Langston 9.5 single-home invariant satisfied by construction.
- **Pre-SQE + SQE-gate counters** — genuinely NEW; no existing active-path home (the VTS's `vtsEvalCounters`/`byStrategy` is the passive-lane equivalent, NOT reusable — different lane, different thresholds). The NEW accumulator is the right home; it does not duplicate guard-eval-tracker (that tracks shared-guard suppression, a different axis) or S16 (RTB-stage only).
- **Scanner stage** — REUSE the live `/scan` pipe; do NOT build a parallel scanner (Langston endorsed).
- **Display shells** — REUSE the FD panel's existing category shells (Pre-Eval Skips / Post-Signal Rejections / Setup Nulls / By-Strategy) — re-point their feed, don't fork the components (Langston Q1 DRY).

## §4 — New singleton S21 (SIM registry entry to land at Step-10)

> **S21** | `active-funnel-tracker.ts` `_stats`/`_sqeGateStats`/`_rtbRefresh` | active-path funnel counters (signalsGenerated, pre-SQE rejects, SQE per-gate, RTB refresh) | **keyed `(mode, assetClass)` from day one** | 🟢 telemetry, NOT split-brain (like S16) but explicitly mode+class-keyed | W: orchestrator + SQE recorder + RTB refresh + checkpoint timer. R: the funnel endpoint. Atomic tmp+rename checkpoint `logs/active-funnel-checkpoint.json`; `keySchema` guard; DORMANT until B8.5 (§9.1). |

Also update **S16** note: the NEW RTB-refresh fields are (mode,assetClass)-keyed from the start (getting ahead of S16's own "mode-key before Phase-21" TODO for the new fields).

## §5 — Keying schema (Langston 9.1 — (mode, assetClass) everywhere)

Every counter key = `${mode}:${assetClass}[:${stage}][:${reason|gate|strategy}]`. mode∈{paper,live}; assetClass∈{crypto_spot,xstock_spot}. SQE per-gate keyed (mode,assetClass,gate) — NOT per-strategy (≈648 buckets; strategy dimension lives in the orchestrator pre-SQE breakdown per Q4). Pre-SQE rejects keyed (mode,assetClass,reason,strategy) — strategy IS meaningful here.

## §6 — Step-8 verification without live traffic (9.7)

Counters are ZERO until B8.5. Proof of plumbing:
1. **Unit tests** — the accumulator increments correctly per (mode,assetClass); the SQE per-gate tally matches a synthetic `failures[]`; the RTB double-count renders two labeled numbers; dormant renders as status not 0.
2. **Synthetic-emit integration harness** — a test-only injector fires N synthetic signals through the emit points (or directly calls the recorder) and asserts the funnel endpoint returns the expected 2×2-keyed breakdown. This distinguishes "wired" from "not wired" — which a zero cannot.
3. **§9.3 visual walk** of both branches (enforce/paper + enforce/live + tag/VTS), crypto + xStock: scanner shows live mode-keyed numbers; downstream shows "awaiting activation"; calibration hidden on Paper/Live.
4. Real accumulation is proven AT B8.5 switch-on (the scaffolding→functional gate).

## §7 — Implementation order (2 Parts, each its own Langston Step-4 diff)

**Part 1 (display, observable now):** OBJ-1 re-point scanner stage → `/scan`+`/scan-24h?mode=`; OBJ-2 revive Stage-A display; OBJ-3 dormant≠zero downstream; OBJ-4 hide calibration tables. Ships + verifies first.
**Part 2 (instrument, inert):** the S21 accumulator + orchestrator emit + SQE per-gate recorder + RTB-refresh S16 extension + the funnel endpoint + wire into the dormant shells. Split trigger: if the Part-2 diff (orchestrator + SQE + rtb-metrics + endpoint + client) exceeds clean-review size → spin **B8.4b** for the engine-side emission (named home per §13).

## §8 — Open confirmations for Langston (Step-2)

1. S21 accumulator vs. folding the new counters into S16 (rtb-metrics) — I lean a SEPARATE S21 (rtb-metrics is RTB-stage-scoped; the funnel spans B–D). RTB-refresh fields still extend S16 (their natural home). Agree?
2. Funnel endpoint envelope: confirm sharing the `/api/vts/filter-diagnostics` response shape is worth the coupling vs. a purpose-built active shape (I lean share-the-shape per your Q1, so the panel reuses one renderer).
3. The `failures[]`-token derivation for SQE per-gate (9.4): the reason's first token is the gate (e.g. `FinalScore`, `RegimeWeight`, `Governance:`, `AMR`); confirm keying on that token is the SSOT-safe derivation (a new gate emits a new token → auto-appears), vs. a shared exported gate-id enum.
