# PHASE 24 — UMBRELLA COMPLETION REPORT (xstock_spot onboarding + calibration arc)

**Date:** 2026-06-08. **Status: ✅ PHASE 24 GOVERNANCE-CLOSED.** Onboarding closed 2026-05-10; the calibration *tail* is honestly data-blocked and parked in Phase 25 (self-clearing via the decision-provenance capture). This is the single umbrella report for all of Phase 24, written as item 2 of the Phase-24→19 plan. It does not replace the per-sub-batch completion reports under `Claude Comms and Packages/Batch Completion/` — it summarizes them and records what landed vs. what deferred. **Nearly every sub-batch closed via a formal `*_COMPLETION_REPORT.md`; a few sub-studies closed via a conclusion or review doc instead** — B.5 (the W2/W3 calibration arc) via `Claude Comms and Packages/Scope Files/B_5_W20b_CONCLUSION.md`, and B3.1a (the gate-correctness audit) via `B_3_1_GATE_CORRECTNESS_REPORT.md`. Those are genuine closures, just not via the formal report template.

**Active trading was OFF throughout all of Phase 24.** Every change was telemetry-only / VTS-observation / scaffolding-for-Phase-19; zero capital was at risk.

---

## 1. What Phase 24 was

Phase 24 onboarded **`xstock_spot`** — Kraken's tokenized 1:1-backed equities (AAPLx, etc.) — as DawnTrader's second asset class alongside `crypto_spot`. It became the canonical worked example for the whole asset-class-onboarding discipline. The arc ran across ~30 sub-batches in four waves:

1. **Scaffold + live wire-in** (B79 → B79.0a–0m): dormant scaffold first, then the live dedicated scanner, then the functional pipeline.
2. **REQUIRED-`assetClass` hardening** (the B79.0n umbrella, 12 named sub-batches #2–#13 + POOL skipped-by-design; HYGIENE folded into the scaffold wave): make `assetClass` a typed REQUIRED parameter across every surface (storage, compute/math, strategy-detect, pattern-recognition, the confidence-modulator chain, scoring, TEC, telemetry, RTB, orchestrator, execution) so a dropped dimension is a COMPILE error, not a silent runtime bug.
3. **15-minute foundation + calibration** (B-XSTOCK-CALIB, B.1–B.5 + B-PHASE-A2 + B-CALSCORE + F-NOW): switch xStock to 15-minute bars, recalibrate regime/IMF/DBS to the new bar scale, build the order-book-depth liquidity gate, and run the calibration cycle.
4. **Decision-provenance + at-entry capture** (B-NEW-52 / 53 / 53.1 / 53.2): retire the fragile weekend cron, and capture the engine's exact decision-time inputs forward so the data-blocked calibration studies can resume in Phase 25.

---

## 2. Sub-batch roster (every Phase-24 sub-batch CLOSED; nearly all via a formal completion report)

All deploy commits + completion-report links are in `PHASE_HISTORY.md` and `BATCH_CATALOG.md`. Grouped (exceptions that closed via a conclusion/review doc rather than a formal report are flagged where they appear):

**Scaffold + live wire-in:** B79 (scaffold), B79.0a (live scanner), B79.0b, B79.0c (feed probe), B79.0d (ORB strategy), B79.0e (`equity_*`→`xstock_*` rename, 172 objects), B79.0f (ticker-collision + `vts_open_trades` persistence), B79.0g + B79.0g_tx (close-cascade tx safety), B79.0i.a/b (observation UI tab), B79.0j (the VTS-path ORB dispatch fix), B79.0k, B79.0L (market-hours weekend gate), B79.0m.a (inert thresholds), B79.0m.b2 (functional pipeline), B79.TEC (per-class TEC config), B79.0n.HYGIENE.

**B79.0n REQUIRED-`assetClass` umbrella (12 named sub-batches #2–#13, all CLOSED):** UNIVERSE-DISCOVERY (#2), STORAGE (#3), MCE (#4), **STRATEGY (#5, deploy `85ea78e`)**, **PATTERN-DETECT (#6, `c0479b2`)**, **CONFIDENCE-CHAIN (#7, `b6e45a8`)**, SCORING (#8), TEC (#9), TELEMETRY (#10), RTB (#11), ORCHESTRATOR (#12), EXECUTION (#13); + POOL (skipped by design — no M:N selection problem at 489-pair scale); HYGIENE is a B79.0n sub-batch counted in the scaffold wave above. *(Sub-batches 5/6/7 PHASE_HISTORY prose entries were backfilled in this governance close — RUNNING_ISSUES #145.)* **One carry-forward (Langston 2026-06-08):** TEC (#9) seeded all 11 behavioral keys per-class + retired the wildcards, but the strict-throw HARD-FAIL restoration (#141 / B79.0n.TEC.b, cleared-to-ship 2026-06-04) has not yet shipped — a soft `pick`-fallback is the live mechanism; #141 remains the carved-out open item.

**15-minute foundation + calibration:** B-PHASE-A2 (xStock DBS), B.1 (regime-classifier calibration — validate-and-document), B.1.5 (depth-based liquidity + the producer-consumer-contract redeploy unblocker), B.2.UI / B.2 (observability-field plumbing + lq_min), B3.1a (gate-correctness audit — *closed via `B_3_1_GATE_CORRECTNESS_REPORT.md`, not a formal completion report*), B3.1b (volume-confirmation removal), B.4 (the 15-minute foundation — bar plumbing + regime/IMF/DBS recalibration + ORB-plumb-ready, with a regime-label parity exit gate ≤1.3pp), B.5 (per-strategy calibration W2/W3 — *closed via `B_5_W20b_CONCLUSION.md`*; see §4 honest endpoint), B-CALSCORE (the Calibration Scoreboard), F-NOW (`calibration_state` tag plumbing).

**Decision-provenance + supporting infra:** B-NEW-52 (weekend-cron retirement), B-NEW-53 / 53.1 / 53.2 (decision-provenance + admitted-features capture), plus the comms/ops batches that supported the arc (B-NEW-43 CI recovery, B-NEW-45/46 alert→Langston push, B-NEW-49 cron observability, B-NEW-47 cold-storage tiering, B-NEW-50 cron-parser ESM fix).

---

## 3. What LANDED (Phase-24 deliverables, all live, active trading OFF)

- **xStock is a fully-onboarded second asset class** on its own dedicated scanner, evaluating on 15-minute bars, with a DB-dynamic ~489-symbol universe (daily discovery cron + 5-layer boot fallback), its own observation UI tab, and its own telemetry instance triad.
- **`assetClass` is type-REQUIRED across the entire pipeline** — the "crypto-first / asset-class-lost" bug class (which recurred 5+ times in 24–48 h early in the arc) is now structurally a compile error.
- **Per-class configuration is the default for every behavioral knob** (regime, SQE, strategy gates, friction, TEC/BE/trailing, pattern-pool, freshness) — DB-resolved, HARD-FAIL-on-missing, with EXISTS-gated wildcard retirement where a class genuinely diverges.
- **The 15-minute foundation** recalibrated all 14 regime thresholds (percentile-preserving, parity exit-gate passed at max |Δ| 1.30pp), the time-anchored MCE lookbacks, IMF (VN bar-invariant but DI recalibrated), and DBS (332k 15-minute rows), with ORB plumbed-ready (left disabled pending edge-validation, #203).
- **The liquidity gate runs on a metric xStock actually has** (order-book DEPTH median, not the wrong-data 24h equity volume, which was removed on the xStock path).
- **Decision-provenance capture is live and proven** on both spot classes — the forward fix for the backward-replay wall three studies hit.

---

## 4. The HONEST ENDPOINT — what DEFERRED to Phase 25, and why

The calibration *tail* is genuinely data-blocked, not skipped. The headline finding from the **HCE study** (22,810 VTS trades, crypto + xStock never pooled, closed 2026-06-05 with full CC+Langston consensus): **selectivity is the lever, not gates or post-entry geometry** — no hidden context gate flips a strategy net-positive within admitted trades. xStock's top-decile-by-edge is net-positive monotone; crypto's edge-scoring inverts (a Phase-25 fix).

Three calibration studies (W2.0a stop/target geometry; RI-a stop-anchor; W2.0b entry-trigger) all hit the **same backward-replay wall**: the engine's exact decision-time inputs (the in-progress FORMING bar + the resolved constants) were never persisted, so no backward replay reproduces a live decision to ≥99% (W2.0b maxed 80%). The correct response was NOT to tune on a low-fidelity reconstruction (a patch trap) — it was to build **forward capture** (B-NEW-53.x, now live and proven). So:

- **Deferred to Phase 25 (data-blocked, self-clearing):** W2.2 per-strategy re-fit + W3 ORB re-enable (roadmap 25-12/13/14/15). These re-run on the captured provenance once it accrues; the §10.5 proof-of-capture alert `7362f63f` (2026-07-05) re-surfaces the entry-trigger sweep automatically.
- **Deferred to Phase 25 (needs paper-active outcomes):** the crypto edge-scoring re-calibration, the AMR M2 "brain," and the HCE rejected-arm causal study (#205).

This is the correct close: Phase 24 delivered the onboarding + the foundation + the capture; the calibration that consumes the capture is Phase-25 work that could not be done sooner without fabricating fidelity.

---

## 5. §3.3 — Asset-class onboarding workflow learnings (mandatory section)

Per CLAUDE.md §3.3, every Phase-24 completion report carries this section. As the umbrella report, this synthesizes the Phase-24-wide learnings — **all of which are now folded into the rebuilt `ASSET_CLASS_ONBOARDING_WORKFLOW.md`** (item 1, finalized 2026-06-08).

**(a) What worked well.** The "capture-the-compiler" discipline (promote `assetClass?:` → REQUIRED `assetClass: AssetClass`, then let `tsc` enumerate every caller) was the single highest-leverage pattern — it beat grep by ~20% and converted a recurring silent-runtime bug class into compile errors. The dormant-scaffold-first / live-second split kept the incumbent's pooled aggregates uncontaminated. The independent Langston Step-2 pre-audit + Step-4 review caught the highest-value bugs (TEC silent-no-op, await-before-Map.set, close-cascade re-run, the shared-aggregator-feeds-live-UI trap).

**(b) What surprised us.** A numeric carryover is NOT a valid carryover (the `lq_min=43` crypto-volume value silently became a ~$20k depth bar). Bar-frequency is a first-class foundation decision, not a flag — and the two classes' answers were opposite (xStock finer, crypto coarser). VN is bar-invariant but DI contracts toward 50, so IMF needed a different recalibration shape than regime. The production ESM bundle is a verification surface CI does not cover (the cron-parser named-CJS-import crash, the canonical-JSON module-init-ordering crash). node-cron can silently fail to fire with no exception and no log line.

**(c) Recurring structural patterns.** The "crypto-first / asset-class-lost" bug class; the wildcard-retirement EXISTS-gated migration; per-class factory dispatch + `assertNever`; capture-and-reuse + `safeResolveAssetClass`; the writer/reader asset-class enumeration audit; the audit-row + poll-reconcile safety net for every scheduled task; the producer-consumer canonical-artifact contract.

**(d) Concrete edits applied to the workflow doc.** The entire rebuilt doc IS the applied edit: ~90 de-duplicated learnings reorganized into one lifecycle sequence (Phases 0–9, 83 steps) + a 28-entry reference library + the filled xstock_spot worked example. **No NEW onboarding learning surfaced during this governance-close turn beyond what the rebuild already folded in.** Going forward (per the §3.3 flip below), onboarding learnings are captured ad-hoc as they surface.

---

## 6. Governance: the §3.3 learning-capture rule converts to ad-hoc

With Phase 24 now governance-closed AND `ASSET_CLASS_ONBOARDING_WORKFLOW.md` finalized, the CLAUDE.md §3.3 time-bounded rule's own condition ("after Phase 24 closes with finalized doc") is met. The rule converts from "every Phase-24 batch's completion report MUST carry an onboarding-learnings section" to **"ad-hoc update when a substantive learning surfaces."** This umbrella report is the last one that carries the mandatory §3.3 section. (The CLAUDE.md §3.3 edit is applied in the same governance turn as this report.)

---

## 7. Governance files updated in this close

`RUNNING_ISSUES.md` (flipped resolved-but-OPEN trackers #54/#77/#79/#82/#85; closed #145; regenerated the stale tally), `PHASE_HISTORY.md` (backfilled B79.0n sub-batches 5/6/7), `POST_AUDIT_ROADMAP.md` (19-20 marked done; 19-19 AMR-precondition wording reconciled to the decoupled sequencing), `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (header marked finalized — item 1), `CLAUDE.md` (§3.3 converted to ad-hoc), `PHASE_24_TO_19_READINESS_CHECKLIST.md` (items 1+2 marked done), this umbrella report, MEMORY (truth + mirror + Langston).

---

## 8. What remains before Phase 19 (the rest of the between-plan)

Phase 24 is closed. The Phase-24→19 plan continues: **item 3** ml-service restart fix (process-name/guardrail mismatch + dual-spawn), **item 4** VTS standalone always-on Simulation service (storage-architecture design FIRST), **item 4.5** Kraken July-2026 tiered-fee-model fix (must land before the Phase-19 paper-audit), **item 5** AMR body (roadmap 19-19). Phase 19 kicks off only after items 3–5 complete.
