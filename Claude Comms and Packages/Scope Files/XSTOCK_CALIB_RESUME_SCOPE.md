# xStock Calibration — Resume Scope (post-HCE)

> **Created 2026-06-05 (Kyle directive).** Resumes the xStock calibration arc after the Hidden-Contextual-Edge study. Identify/plan → Langston ACK before implementation. Strategic context: `1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`; roadmap: `POST_AUDIT_ROADMAP.md` (2026-06-05 update). Active trading OFF (VTS); xStock-scoped, crypto untouched.

## Where we are
B.4 foundation (15-minute bars) is CLOSED/LIVE. The HCE study is the "pattern-detection review + per-strategy evidence" input the sequence (foundation → pattern review → per-strategy W2) was waiting for. Two HCE leads carry into the per-strategy work: (1) **EV-gate selectivity demonstrably profits on xStock** (top-decile by expected-edge net-positive; top 2% +1.17%/52% win — monotone); (2) **a raw buy-the-dip feature** (buying xStock 2–5% below its recent high = +0.16%/trade net-positive vs −0.91% at the high; mean-reversion tilt the logged labels missed).

## Steps

**1. Close the B.4 activation soak (the one open foundation item).**
Re-capture the live 15-minute xStock regime mix from `pair_scan_archive_2026_06` (asset_class=xstock_spot, regime_label) after 2–3 more live sessions; compare to the predicted mix (TFS≈25 / ST≈31 / HVU≈21 / IE≈17 / RBS≈6.6); send to Langston to close condition 1 (condition 2 already closed). Watch item: RUNNING_ISSUES #201 (live forming-bar makes RANGE_BOUND ≈0%, starving range/mean-reversion strategies) — confirm whether it materially distorts the live mix.

**2. LOCK the pattern-path decision: pattern path STAYS ON for xStock (Kyle 2026-06-05).**
Reversing the earlier lean-toward-off. Rationale (Kyle): in VTS it's telemetry-only so a weak path costs nothing, and it becomes a **free negative-control test of the ready-to-buy queue ranking** — if the ranking is built right, weaker pattern signals self-demote and rarely win a slot. CC caveat folded in: this test is only valid where the ranking works — it works on xStock (expected-edge monotone), so the xStock pattern-path-sinks behavior is a genuine acceptance test. Action: NO code change to disable the xStock pattern path; instead **define the acceptance test** — measure, once paper/shadow is running, whether xStock pattern-only signals correctly rank low and rarely trade. Document as a Phase-19 acceptance check.

**3. Per-strategy (W2) trade-construction + gates, using the two HCE leads.**
Re-fit each live xStock strategy's signal/trade-construction settings at 15m (entry trigger, stop/target geometry, hold horizon, indicator periods, pattern tolerances) — the work motivated by the 2026-06-03 strategy-fit finding — now informed by:
- (a) **Selectivity is the lever, not context-gating survivors** — calibrate the xStock EV gate / expected-edge threshold (the thing the HCE selectivity test showed works) rather than adding per-strategy context filters that the study showed don't separate survivors.
- (b) **Build the buy-the-dip / distance-below-high feature into xStock trade construction** (entry timing favoring 2–5% below recent high / after a small pullback). Validate it forward before trusting (thin sample, VTS-derived).

**4. Gate-placement architecture (Kyle question — decide during W2).**
Per-gate rule: gates about *"is this setup good?"* (entry timing like buy-the-dip, indicator bands) live at **signal generation / inside the strategy** so the signal is born carrying its quality; gates about *"does this signal beat others / clear the bar?"* (net-EV, confidence, friction, cross-signal comparison) live in **SQE**. NON-NEGOTIABLE: every gate lives in **one shared component both VTS and the active path call**, resolved from the same per-asset-class settings — never duplicated (or VTS and live drift and the "lab" stops matching live). This ties to the VTS-standalone design (firehose may deliberately skip admission gates; shadow runs the identical stack as live).

## Governance touched on close
BATCH_CATALOG + PHASE_HISTORY + MEMORY (Tier 1); MULTI_ASSET_VTS_EXPANSION_PLAN working-list; SYSTEM_MANUAL/SIM if trade-construction math changes. Crypto edge-scoring mis-calibration → routed to B3.2/#181 (Phase 25), not this scope.
