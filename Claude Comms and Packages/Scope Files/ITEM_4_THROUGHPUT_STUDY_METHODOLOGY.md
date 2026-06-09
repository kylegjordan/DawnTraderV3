# ITEM 4 — Throughput Study: Methodology (Gate-2 deliverable)

> Item 4, Phase A deliverable for **O6** (Kyle directive: can the shared services carry 2–3 systems at once without confusing data or overloading?). Methodology per Langston Q4. **Design only — the study RUNS in Phase B.** Active trading OFF (the live producer in the study is the no-op SCAFFOLD — consumes compute + writes telemetry, routes zero orders).

## 1. Question the study answers
Under VTS + paper + live (scaffold) all producing at once, do the **shared calculators** (MCE, FX5 + xStock scanners, pattern detection, strategy modules), the **queues/services** (SQE/RTB/TCL/refresh), and the **storage writers** (B70 archive, B74 OHLC, provenance) hold up — (a) **without confusing data** (cross-producer contamination), and (b) **without overloading** (latency, queue growth, CPU, event-loop stall, write backpressure)? Output sizes any Hetzner / Supabase upgrade to a MEASUREMENT, not a guess.

## 2. Ramp (3 stages, instrument at each)
1. **Baseline — VTS only** (today's state). Capture the metric set (§3) as the reference.
2. **VTS + paper** (2 producers).
3. **VTS + paper + live-scaffold** (3 producers) — the scaffold consumes the same shared compute + writes its own telemetry/positions but routes zero orders.
Primary method = **synthetic concurrent load on staging**; instrumented **projection** only for what a real live load can't reach. **★ Hazard (Langston):** a load that merely replays MCE shows FALSE headroom — each producer MUST be driven through its REAL selection → queue → storage path with **distinct in-flight positions**, or the contention (per-mode position/selection state) is never exercised.

## 3. Metric set (captured at every ramp stage)
- Per-cycle **MCE compute time** + **compute-count per (symbol, cycle)** (must stay = 1).
- **Cycle cadence** (VTS + each scanner) vs. nominal.
- **Queue depths**: SQE / RTB / TCL (and rtb-refresh buckets).
- **CPU** (per-core + total) and **event-loop lag** (the in-process starvation signal — Q2).
- **Archive write latency** + **write-queue depth / backpressure** (B70 + B74 + provenance writers).
- **Data-integrity probes** (see §4).

## 4. Pass / fail (RATIOS off the measured baseline — ratify the exact numbers in Phase A after the baseline run; do NOT hardcode blind)
- **Data integrity — HARD GATE (presence-not-count):** per-producer calibration query returns exactly ONE mode; ZERO rows where the stamp ≠ the producer; the learning store has a SINGLE writer. **Any violation = FAIL** (this is the whole point of the separation).
- **Compute-once:** exactly **1 MCE compute per (symbol, cycle)** under 3 producers; cycle counter / telemetry must NOT multiply. **>1 = FAIL.**
- **Latency:** p95 cycle→signal **≤ ~1.5× baseline** (tune post-baseline).
- **Queue depth:** RTB/SQE/TCL show **no monotonic growth** over a sustained window (≥30 min) and return to baseline between cycles. **Monotonic growth = FAIL.**
- **Event-loop lag:** p99 **under ~100 ms** (the in-process starvation signal; informs whether Phase 19 needs the separate VTS process).
- **Write backpressure:** archive write p95 **≤ N× baseline**, no write-queue overflow.

## 5. Outputs
- Documented **headroom** under the 3-producer model + the **capacity recommendation**: stay on current Hetzner (2 cores / 4 GB) or upgrade, and by how much; whether Supabase compute/storage needs a bump — each sized to the measured numbers.
- A **go/no-go** on running all three concurrently in-process vs. needing the separate VTS process pulled forward (the event-loop-lag result decides).
- Zero data-integrity violations (or a list of exactly what leaks, to fix before Phase B closes).

## 6. Cross-refs
Scope `ITEM_4_SYSTEM_SEPARATION_SCOPE.md` §O6 + §1.5 (Langston Q4); architecture `ITEM_4_ARCHITECTURE_INVESTIGATION.md`; capacity context — Hetzner resize + Supabase compute/storage upgrade both on-demand (Kyle Q 2026-06-09).
