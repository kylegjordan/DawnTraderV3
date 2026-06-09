# ITEM 4 — Throughput Study: Methodology (Gate-2 deliverable)

> Item 4, Phase A deliverable for **O6** (Kyle directive: can the shared services carry the systems at once without confusing data or overloading?). Methodology per Langston Q4. **Design only — the study RUNS in Phase B.**
>
> **★ CORRECTED per Kyle 2026-06-09 (`ITEM_4_SYSTEM_SEPARATION_SCOPE.md` §1.6 #1):** there is **NO live no-op scaffold** — live always places real orders and stays un-run until Phase 21. So the study measures the **two real producers that exist pre-Phase-21: VTS + paper.** The third producer (`live`) is a **reserved partition + a projection**, not a fake-live load; true 3-concurrent is measured for real when live is built (Phase 21). Wherever this doc said "live-scaffold 3rd producer," read "VTS+paper now; live projected/deferred."

## 1. Question the study answers
Under **VTS + paper** producing at once (the pre-Phase-21 reality), and **projected** to a third (live) producer, do the **shared calculators** (MCE, FX5 + xStock scanners, pattern detection, strategy modules), the **queues/services** (SQE/RTB/TCL/refresh), and the **storage writers** (B70 archive, B74 OHLC, provenance) hold up — (a) **without confusing data** (cross-producer contamination), and (b) **without overloading** (latency, queue growth, CPU, event-loop stall, write backpressure)? Output sizes any Hetzner / Supabase upgrade to a MEASUREMENT, not a guess.

## 2. Ramp (2 measured stages pre-Phase-21 + a projected 3rd)
1. **Baseline — VTS only** (today's state). Capture the metric set (§3) as the reference.
2. **VTS + paper** (the two real producers that exist pre-Phase-21) — the measured end-state for item 4.
3. **+ live (PROJECTED, not run).** No fake-live load (Kyle: no scaffold). Estimate the third producer's marginal cost by **instrumented projection** off the measured VTS+paper deltas (live's per-cycle pipeline cost ≈ paper's, since live reuses the same compute + selection + queue path; the difference is real-order I/O, which is a small bounded add). The **real** 3-concurrent measurement happens when live is built (Phase 21).
Primary method = **synthetic concurrent load on staging**; instrumented **projection** for the live increment. **★ Hazard (Langston):** a load that merely replays MCE shows FALSE headroom — each producer MUST be driven through its REAL selection → queue → storage path with **distinct in-flight positions**, or the contention (per-mode position/selection state) is never exercised.

## 3. Metric set (captured at every ramp stage)
- Per-cycle **MCE compute time** + **compute-count per (symbol, cycle)** (must stay = 1).
- **Cycle cadence** (VTS + each scanner) vs. nominal.
- **Queue depths**: SQE / RTB / TCL (and rtb-refresh buckets).
- **CPU** (per-core + total) and **event-loop lag** (the in-process starvation signal — Q2).
- **Archive write latency** + **write-queue depth / backpressure** (B70 + B74 + provenance writers).
- **Data-integrity probes** (see §4).

## 4. Pass / fail (RATIOS off the measured baseline — ratify the exact numbers in Phase A after the baseline run; do NOT hardcode blind)
- **Data integrity — HARD GATE (presence-not-count):** per-producer calibration query returns exactly ONE mode; ZERO rows where the stamp ≠ the producer; the learning store has a **single writer PER PARTITION** (no producer writes another producer's labeled partition — per `ITEM_4_STORAGE_AND_LEARNING_DESIGN.md` Part B). **Any violation = FAIL** (this is the whole point of the separation).
- **Compute-once:** exactly **1 MCE compute per (symbol, cycle)** under the concurrent producers; cycle counter / telemetry must NOT multiply. **>1 = FAIL.**
- **Latency:** p95 cycle→signal **≤ ~1.5× baseline** (tune post-baseline).
- **Queue depth:** RTB/SQE/TCL show **no monotonic growth** over a sustained window (≥30 min) and return to baseline between cycles. **Monotonic growth = FAIL.**
- **Event-loop lag:** p99 **under ~100 ms** (the in-process starvation signal; informs whether Phase 19 needs the separate VTS process).
- **Write backpressure:** archive write p95 **≤ N× baseline**, no write-queue overflow.

## 5. Outputs
- Documented **headroom** under the measured **VTS+paper** model **+ the projected live increment** + the **capacity recommendation**: stay on current Hetzner (2 cores / 4 GB) or upgrade, and by how much; whether Supabase compute/storage needs a bump — each sized to the measured numbers (the live slice projected, re-measured for real at Phase 21).
- A **go/no-go** on running the producers concurrently in-process vs. needing the separate VTS process pulled forward (the event-loop-lag result decides).
- Zero data-integrity violations (or a list of exactly what leaks, to fix before Phase B closes).

## 6. Cross-refs
Scope `ITEM_4_SYSTEM_SEPARATION_SCOPE.md` §O6 + §1.5 (Langston Q4); architecture `ITEM_4_ARCHITECTURE_INVESTIGATION.md`; capacity context — Hetzner resize + Supabase compute/storage upgrade both on-demand (Kyle Q 2026-06-09).
