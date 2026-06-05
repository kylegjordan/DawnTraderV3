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

## Langston review refinements (2026-06-05) — folded in

**Close boundary (Kyle decision 2026-06-05).** Steps 2 and 3b need paper-active outcomes (the shadow/paper pipeline = Phase 19), so they cannot finish pre-19. Split:
- **Pre-19:** Step 1 (soak), Step 3a (EV-gate calibration on existing VTS data), Step 4 (gate-placement architecture decision).
- **Phase 25 (calibration-with-evidence):** Step 2 (pattern negative-control — needs the shadow's slot scarcity) + Step 3b (buy-the-dip forward validation — needs paper outcomes) **MOVE to Phase 25** alongside the other outcome-dependent calibrations — NOT held as a Phase-19 acceptance gate (Kyle override of Langston's "Phase-19 acceptance" framing).
- **AMR is DECOUPLED from this umbrella (Kyle override 2026-06-05):** AMR was scheduled pre-Phase-19 independently, before any xStock-calibration work existed, so it does NOT gate on this umbrella at all — **the AMR body proceeds pre-19 on its own schedule** regardless of where the xStock steps land. (Supersedes the earlier "AMR gates on the pre-19-closeable subset" framing.)

**Per-step pins:**
- **Step 1 — #201 read (CC):** RANGE_BOUND ≈0% live is **a PROPERTY of the accepted forming-bar-classification design, NOT a classifier defect.** The B.3 regime audit proved the classifier sound on settled bars (RBS ~6.4% recompute) and traced the live collapse to the in-progress forming bar inflating intrabar range; **Kyle LOCKED "forming-bar classification accepted as intended; no classifier change" 2026-06-03.** So predicted-RBS-6.6 (settled-derived) vs live-RBS-≈0 (forming-derived) is an apples-to-oranges artifact, not a soak failure. → Take Langston's **option (b): close condition 1 on the 4 undistorted buckets + carry RBS-vs-#201 as a NAMED explicit open.** The #201 EV-leakage fix (forming-bar-aware regime adjustment or settle-before-classify, WITHOUT reverting forming-bar responsiveness) is its OWN design item — most naturally Phase 19 (EV-leakage that bites when active trading is on), NOT a soak blocker. This is NO-PATCHES-compatible: name + route, don't paper over.
- **Step 2 —** bind the acceptance test to the **shadow** explicitly (firehose has no slot scarcity → self-demotion is unmeasurable there); precondition: confirm pattern-only signals are scored on the **same expected-edge axis** as EV-gated signals (else we measure scoring coverage, not ranking quality).
- **Step 3a —** anchor the EV-gate threshold at a **populated decile (top 10–20%, hundreds of trades)**, NOT the top-2% point (~46 trades — least reliable on the monotone curve).
- **Step 3b —** **pre-register** the "recent high" definition (lookback window / bar count / session-high vs N-day-high) + the 2–5% band + accept threshold BEFORE the forward test (result is sensitive to the high definition and was in-sample on a thin subset).
- **Step 4 —** non-negotiable: "firehose may skip admission gates" = an **`enforce=false` parameter to the shared evaluator that still COMPUTES and LOGS the would-be verdict** — never a separate firehose path or a bypass that skips the call. Skip = don't-enforce, not don't-evaluate (a bypass re-duplicates gate logic by the back door AND destroys the Step-2 negative-control telemetry, which needs the would-be verdict logged).

**VTS-standalone (firehose) batch design requirements (Langston):** scope it TIGHTLY (fan-out layer + firehose partition only — the shadow is Phase 19, don't gold-plate pre-19); and the single-ingest-fan-to-N design makes the feed a single point of failure → the fan-out layer needs buffering / backpressure + per-consumer health, handled by vertical-scale / smarter-distribution, NEVER consumer or asset-class shedding (§8 #15). Kyle to explicitly acknowledge Phase 19 now sits behind this pre-19 infra batch.

**AMR-body / adaptive-lookback layer distinction (Langston):** volatility-adaptive **lookbacks live inside the strategy at signal generation** (same side of the Step-4 line as buy-the-dip); AMR **dials are outside-strategy posture** (size/stop/target/floor/cooldown). The AMR classification can legitimately *bias which lookback regime is active*, but the lookback adaptation itself is NOT an AMR dial — keep them cooperating-but-distinct; decide the wiring in the AMR-body scope.

## Governance touched on close
BATCH_CATALOG + PHASE_HISTORY + MEMORY (Tier 1); MULTI_ASSET_VTS_EXPANSION_PLAN working-list; SYSTEM_MANUAL/SIM if trade-construction math changes. Crypto edge-scoring mis-calibration → routed to B3.2/#181 (Phase 25), not this scope.
