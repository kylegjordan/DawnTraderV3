# P19-B6.5 SCOPE — Crypto Active-Pipeline RESURRECTION

> **Batch:** P19-B6.5 (split into **B6.5a** + **B6.5b**) · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-17 · **Rev:** 2 (Langston Step-1 ACK + rulings adopted)
> **Issue:** #235 · **Roadmap:** PHASE_19_PLAN §1 rows P19-B6.5a/b · **Gate:** PHASE_19_PLAN §6 **gate 10** (B7b HARD-GATED on B6.5-green)
> **Predecessor closed:** P19-B6 (daily-loss auto-trip) — 2026-06-17.

---

## §0.5 REV-2 — LANGSTON STEP-1 RULING (ACK + adopted 2026-06-17)

**Step-1 = ACK** (scope sound, proof/repair-distinct-from-flip framing right, per-class-toggle gap correctly surfaced before committing to a mechanism).

- **Q1 → Option C (Langston OVERRODE CC's lean toward A).** Build a **first-class per-asset-class active gate**. Reasoning is gate-dependency, not preference: **B7b is staged crypto-first with xStock still dormant (gate 11/B6.6 unbuilt), so B7b ITSELF cannot flip the shared per-mode `isEngineActive` without co-activating the incomplete xStock path** → a per-class active gate is **mandatory B7b infrastructure that was missing**, not B6.5 scope-balloon. Option A (mid-chain harness) bypasses the very turn-on B6.5 must prove + leaves B7b's real mechanism unproven at the moment we hard-gate on it; rejected. Option B (fail-closed suppression) is a silent fallback → rule #10 / NO-PATCHES violation; rejected. **C subsumes B; the dry-run becomes a real, time-boxed, reverted crypto-only turn-on through the EXACT mechanism B7b will use (highest-fidelity proof).**
- **SPLIT ADOPTED (CC decision, Langston-sanctioned):** **B6.5a = the per-class active gate** (net-new infra + tests + the isolation acceptance test); **B6.5b = the accretion-delta audit + crypto-only dry-run + fill-parity** (uses the gate). Both stay under the single **B7b-green gate 10**. Rationale: the gate is discrete, independently testable B7b infrastructure deserving its own clean Langston review; bundling with the audit+dry-run mixes concerns. Matches the small-batch pattern.
- **Q2 → agree** (break-fix blocking a crypto lifecycle = in-batch; calibration/threshold tuning defers to a named §13 home decided at surfacing).
- **Q3 → agree + addition:** gate 10 = Obj-1 audit clean + Obj-2 full closed lifecycle + Obj-3 fill-parity **+ the C-gate verified** (crypto-only turn-on confirmed, xStock provably untouched, clean revert).
- **Q4 → agree + addition:** tiny balance + hard position cap + P19-B6 daily-loss armed **+ prove xStock-path isolation during the run (zero xStock signals/opens) = the new gate's acceptance test.**
- **Q5 → agree:** confirm gate 13 (crypto depth fill-quality, shipped B4b.1) + gate 7 (daily-loss, shipped B6) present + wired BEFORE the dry-run (it exercises both).

**★Finding elevated:** the per-asset-class active gate is a **B7b prerequisite**, not merely a B6.5 dry-run convenience — surfaced to Kyle in plain language. → Proceed to Step-2 pre-audit for **B6.5a**.

---

## §0 FRAMING — what this batch is, and is NOT

**Crypto active-paper trading has not run since ~Phase 8 (Nov 2025).** Since then the system has been in VTS/passive learning while extensive change accreted around the shared active path: asset-class awareness threaded through the whole chain, multi-asset (crypto + xStock) pair processing, and the B3/B4/B5/B6 active-path work. Crypto active was **covered only IMPLICITLY** so far:
- **B3** de-mined the shared path (landmine-2 would have silently dropped EVERY signal — crypto included — at active turn-on; fixed).
- **B4-C2** reuses the shared crypto pipeline for the xStock wire-in (so crypto's chain was exercised structurally but never RUN end-to-end).
- **B7b** is staged crypto-first; **B9** is the live run.

**This batch PROVES crypto active-paper actually works end-to-end, and REPAIRS what the accretion broke — separately from the turn-on flip (B7b).** Per Langston's framing (PHASE_19_PLAN §11): keep proof/repair (B6.5) distinct from the flip (B7b) so the repair cannot balloon and pressure an early flip.

**🚨 §9.1 SCAFFOLDING/DORMANCY NOTE:** B6.5 does **NOT** turn crypto active-paper on permanently. The permanent flip is **B7b**, which is HARD-GATED on B6.5 closing green (this batch's exit proof). Any turn-on inside B6.5 is a **controlled, supervised, time-boxed dry-run for observation**, reverted at the end — NOT the production switch-on.

**This is NOT:** the xStock side (that's B4a, dormant til B7b); the live-mode run (B9/Phase-21); the per-mode guardrail-set completion (B6.8); the holiday-liveness gate (B6.6, xStock); the validate-vetting / credential rate-limit lane (#296, locked `kraken.ts`).

---

## §1 OBJECTIVES (numbered, with verification criteria)

### **Obj-1 — Accretion-delta audit (READ-ONLY) of the shared crypto active chain vs the Phase-8 baseline.**
Trace the full active crypto pipeline as it stands today and identify every place the VTS-period accretion could break a crypto trade at turn-on. The chain (confirmed via Step-1.a architectural read):

`Central Clock → FX5 scanner (`fx5-scanner.ts`, isEngineActive-gated) → activeFilterPool (quant + pattern pools) → signal-orchestrator (FinalScore/NetEV, asset-class resolved once at source) → SQE (signal_quality_evaluator, MIN_FINAL_SCORE gate) → RTB (ready_to_buy_service.queueSQESignal → reEvaluateQueue → getTopSignal) → TCL watchdog (max_open_trades, duplicate_position) → paper-execution-engine.openPosition (internal validate-vetted fill) → trailing-exit-controller (per-class TEC config) → checkExitConditions → closePosition → TradeClosedEvent → cooldown + telemetry writes (paper_sim_trades, signal_eval_archive, exit_decision_archive) + daily-loss evaluator (P19-B6).`

**Prime suspects (Step-1.a finding):** (a) **asset-class awareness** — every hop now resolves/requires `assetClass` (orchestrator stamp-at-source; RTB `queueSQESignal` THROWS if absent; paper-engine open seam NO-default; TEC per-class HARD-FAIL on missing row; cost-model per-class friction); a crypto symbol mis-resolved, a collision-set ticker (the 17 dual crypto/xStock canonicals), or a missing per-class DB row breaks the trade. (b) **multi-asset pair processing** — crypto + xStock now flow through one orchestrator/one RTB/one engine per mode; verify crypto is never mislabeled or starved by xStock-oriented logic.

- **Verification:** a committed audit findings doc `P19_B6_5_AUDIT.md` enumerating, per hop: what changed since Phase-8, the crypto-specific breakage risk, and a verdict (OK / FIX-in-B6.5 / defer-with-home). Every "OK" backed by a direct code citation (`file:line`); every per-class DB dependency confirmed seeded for `crypto_spot` on staging.

### **Obj-2 — Crypto-only dry-run watching ≥1 FULL closed-trade lifecycle.**
Drive at least one crypto paper trade through the COMPLETE lifecycle — **open → trailing/exit management → close → cooldown → telemetry** — NOT merely signal emission. Observe on staging with evidence at each hop.

- **Verification:** captured evidence (log lines + psql rows) showing, for ≥1 crypto trade: (1) FX5 admitted the pair; (2) orchestrator emitted + queued one signal with correct `assetClass=crypto_spot`; (3) RTB ranked + promoted; (4) TCL admitted; (5) paper-engine OPENED via the internal fill with a `paper_sim_open_positions` row stamped `crypto_spot`; (6) TEC managed the position with the crypto_spot config; (7) the position CLOSED with an exit reason; (8) a `paper_sim_trades` row persisted with `assetClass=crypto_spot` + the telemetry archives wrote; (9) cooldown applied. Zero uncaught/unhandled errors in `out.log` across the run.

### **Obj-3 — Fill-path parity through the high-fidelity INTERNAL fill.**
Confirm the crypto paper fill behaves correctly through the B4b.1 depth-walk INTERNAL fill — **rule-20: there is NO Kraken spot paper-order system**; paper = a Kraken-vetted internal fill (real WS book depth-walk + real tiered fees + honest slippage). Confirm the B4b.1 24/5 book-depth-sufficiency + warmth gate (`fill_depth_gate`, crypto warmth 5s / sufficiency 3×) admits/blocks correctly for crypto using the live Kraken WS book.

- **Verification:** evidence that a crypto open walked the live ask book (VWAP fill, not a flat slippage constant), the depth gate evaluated (admit when deep, block when thin), fees applied per the crypto_spot friction row, and the close walked the bid book to a full fill. **D4 validate-round-trip vetting is OUT (deferred #296, locked `kraken.ts`)** — paper fill is depth-modeled, not yet venue-validate-vetted; this is stated, not silently assumed.

---

## §2 ★ KEY DESIGN QUESTION — RESOLVED → Option C (per-class active gate = B6.5a). See §0.5.

**Step-1.a surfaced a real blocker:** there is **no per-asset-class active toggle**. The active path is gated only on the per-MODE `system_context.isEngineActive` (confirmed `fx5-scanner.ts:543-555`; grep for `activeAssetClasses`/`isAssetClassActive` → 0 hits). The xStock active-dispatch (`active-dispatch.ts:123`) gates on the **same** `isEngineActive` flag. So **naively flipping paper `isEngineActive=true` activates BOTH crypto and the dormant xStock active paths at once** — which is not a crypto-only dry-run, and risks exercising the still-incomplete xStock turn-on (gate 11 holiday-liveness #236/B6.6 not built yet).

**CC's lean (for Langston's ruling):** Option A — a **synthetic/replay harness** that injects a real crypto signal into the live active chain and drives it to close, WITHOUT flipping the global `isEngineActive` (closest to a true unit-of-proof, no production-state change, no xStock co-activation). Fallbacks:
- **Option B — controlled time-boxed staging turn-on** with xStock held off. Requires a way to keep xStock from opening: either rely on xStock's fail-closed fill-safety (fragile/implicit) OR introduce a minimal per-class active gate (net-new; arguably belongs to B7b machinery, not B6.5).
- **Option C — add a first-class per-asset-class active gate** as part of B6.5 (then crypto can be turned on alone, and it becomes durable infrastructure B7b reuses). Larger scope; NO-PATCHES-compatible but expands the batch.

**Q1 (Langston): which dry-run mechanism — A (harness, no global flip), B (time-boxed turn-on with xStock suppressed), or C (build a per-class active gate)?** This decides the batch's shape and size.

---

## §3 OTHER OPEN QUESTIONS FOR LANGSTON
- **Q2 — Repair-scope boundary.** If Obj-1 finds crypto breakage, B6.5 fixes the crypto-specific defects in-batch (that IS the resurrection). Where is the line vs deferring to a named home? CC's lean: fix anything that blocks a crypto trade completing the lifecycle; defer anything that is correctness-tuning (thresholds, calibration) rather than break-fix.
- **Q3 — "Green" definition for the B7b hard-gate (§6 gate 10).** CC's lean: gate 10 = Obj-1 audit clean (no open FIX-in-B6.5 items) AND Obj-2 ≥1 full closed crypto lifecycle observed AND Obj-3 fill-parity confirmed. Agreed?
- **Q4 — Dry-run safety rails.** During any turn-on: tiny starting balance, a hard position cap, and the P19-B6 daily-loss kill armed (it now exists). Acceptable? Anything else required before any crypto active turn-on touches staging?
- **Q5 — Does the dry-run need the other B7b pre-flight gates** (gate 13 crypto depth fill-quality gate — shipped B4b.1; gate 7 daily-loss — shipped B6) **confirmed present first**, or is a supervised observation exempt? CC's lean: confirm the crypto-applicable gates (13 depth, 7 daily-loss) are present + wired before the dry-run, since the dry-run exercises them.

---

## §4 OUT OF SCOPE (explicit)
- xStock active turn-on (B4a dormant; B7b).
- Live-mode (Phase-21 / B9).
- Per-mode guardrail-set completion (B6.8).
- xStock holiday-liveness fill gate (B6.6).
- Validate-round-trip vetting + credential rate-limit lane (#296, locked `kraken.ts`).
- Strategy/threshold CALIBRATION (correctness-tuning) — B6.5 is break-fix + proof, not calibration.

## §5 SEQUENCING
B6 (done) → **B6.5a (per-class active gate)** → **B6.5b (audit + crypto-only dry-run + fill-parity)** → B6.6 → B6.7 → B6.8 → B7a → B7b. **B7b HARD-GATED on B6.5 green** (§6 gate 10 — both a + b green). B6.5a is the prerequisite infra for B6.5b's dry-run (and for B7b's crypto-first flip itself).

## §6 WORKFLOW
Full 11-step. Step-2 pre-audit will do the per-component DIRECT reads (run-mode-controller, trading-state-sync, the Phase-8 baseline diff via git archaeology of the last active-paper commit) + SIM consultation. Run AUTONOMOUSLY with Langston per standing directive; escalate to Kyle only on no-consensus or a Kyle-owned decision (e.g. if the dry-run mechanism needs his risk sign-off).

---
*Step-1 scope for Langston ACK. On ACK + Q1-Q5 rulings → Step-2 pre-audit.*
