# Phase 19 — Reorganized Both-Classes Active-Trading Plan — *as of 2026-06-19*

> **What this is.** The reorganized "rest of Phase 19" program, rebuilt after the Active Trading Pipeline Audit + the July-9 fee-reality decision + Kyle's both-classes directive. **Status: CC-B DRAFT for 3-way review** (CC-B + CC-A + Langston) → on consensus, folds into `PHASE_19_PLAN.md` §1 as the live batch board. Standalone here to avoid colliding with CC-A's in-flight governance edits.
>
> **Sources of the decisions below:** the audit (`1-system-manual/ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, 3-way APPROVED), the fee 3-way (CC-A + Langston + CC-B converging), and Kyle directives 2026-06-18/19 (this conversation).

---

## §1 — Governing decisions (locked with Kyle 2026-06-18/19)

**D1 — Both in code, one live at a time (CC-B + Langston converged; Kyle agreed).** Build every SHARED architectural piece for BOTH asset classes from the start — do NOT crypto-restrict (restricting manufactures a false second pass + a later refactor of proven code). xStock's net-new modules are built as code in the same arc. Only the *live activation, debugging focus, and calibration values* are sequenced.

**D2 — Shared fixes apply to BOTH on the spot (Kyle 2026-06-19).** While debugging crypto first, any bug found in *shared* code is fixed for both classes immediately — never deferred to "xStock's turn." The only things sequenced are debugging focus and the live switch, never a shared fix.

**D3 — BOTH classes paper-active ON by Phase-19 close.** The Phase-19 finish line is that crypto AND xStock are turned on in *paper* active trading and feeding through correctly — the "wired + working" bar, NOT "calibrated + profitable." We sequence the turn-on (crypto debugged-to-working first as the proven template, xStock right behind using that template) so we never debug two brand-new pipelines at once — but both end Phase 19 running in paper. (You cannot start calibration until the system is running.)

**D4 — Calibration timing (Kyle 2026-06-19).** Phase 25 calibrates BOTH classes; crypto reaches "comfortable" first (24/7 data) while xStock's slower 24/5 data trails. If xStock can't finish inside Phase 25's window, its calibration *spills over to run in parallel with the Phase 16/20 cleanup* (CC-A + Langston on xStock tuning, CC-B on cleanup — independent workstreams, different owners). Either path: **both calibrated by the time Phase 21 opens.** This refines Kyle's 2026-06-08 "strictly sequential" call for these two genuinely-independent workstreams.

**D5 — Live launch goal (Kyle 2026-06-19).** By Phase 21 both are calibrated → **launch live together** as the goal. Avoid the failure mode of crypto sitting idle for *weeks* waiting on xStock. A short (days, not weeks) real-money safety stagger — crypto live first as the final real-money sanity check — is the only acceptable deviation, decided AT Phase 21, not now.

**D6 — The fee reality (July-9 Tier-1).** 0.80% taker / 0.40% maker, account-wide, no US-accessible escape (DEXs out for the start). The 3-rung fee ladder (from the fee 3-way):
- **Rung 1** — bigger targets (≈3.5–4%, RR ≥ 2.5–3:1) at TAKER rates → trades open NOW; low-build (target-floor + universe). *(Langston's asymmetric-stop math: losers pay maker-entry + taker-stop, so target FLOOR 3.5%, prefer 4%.)*
- **Rung 2** — maker-entry execution (halves entry fee) + the asymmetric-stop EV kernel + the shared maker/taker service (active + VTS); brings targets back down.
- **Rung 3** — raise the pWin ceiling ONLY on measured win-rates (Phase 25; gated on calibration, see §4).

**D7 — Langston's hard gate.** "Only one asset class in active-trading at a time during the validation window." xStock code is written/merged/run in shadow/VTS; it does NOT go to live activation until crypto's template is validated. Goes into `PHASE_19_PLAN.md` §1 the session it's agreed (§13 — named home, not "we'll sequence it later").

---

## §2 — Build sequence (the rest of Phase 19)

*Each item tagged: **SHARED** (build both-class now, xStock config defaulted inert) · **CRYPTO-FIRST** (debug/validate crypto first, xStock right behind on the proven template) · **XSTOCK-NET-NEW** (no crypto equivalent; built as code in the same arc, activated after crypto template).* Exact batch IDs + micro-order finalized with CC-A + Langston.

| # | Workstream | Tag | What it does | Build size |
|---|---|---|---|---|
| B1 | **Symbol-recognition completeness** (B6.5f, in flight) | SHARED | Canonicalizer quote-currency completeness + loud unknown-quote alert so signals stop being silently dropped. Crypto quote-currencies are the immediate fix; apply the same recognition discipline to xStock symbols in the same arc. | small (in flight) |
| B2 | **Rung-1: target-floor + liquid-volatile universe** | SHARED | Raise the min-target to ~3.5–4% (RR ≥ 2.5–3) so signals clear the EV gate AT TAKER rates → **crypto trades start opening (gate-10)**; add a "top ~15–30 by venue USD-vol × real ATR" active universe selector so targets are reachable within a day. Per-class (each class its own liquid-volatile universe). **★KYLE DIRECTIVES 2026-06-20 (placement + visibility):** (1) the "liquid" half REUSES the EXISTING **LQ (liquidity) filter** in the filter phase — do NOT build a duplicate liquidity gate. (2) The genuinely-NEW dimension = **movement/reachability** (real ATR vs the raised target — can the pair travel far enough in the hold window); it lives in the **FILTER phase alongside LQ/VN/DI**, NOT a hidden new gate in SQE or RTB. (3) Any pair/signal it excludes MUST be **surfaced by-reason in the existing IMF filter diagnostics** (which already counts failedLQ/failedVN/failedDI) — we never hide a filter/threshold/gate. (4) The target FLOOR **and CEILING** become **per-class DB-governed for BOTH crypto AND xStock** (today hardcoded `ROI_MIN=0.010`/`ROI_MAX=0.040` in `adaptive-thresholds.ts` — 1% floor is BELOW the ~1.8% taker fee wall, the root reason crypto can't open). (5) The new movement filter + the raised thresholds MUST be built into **Filter Diagnostics (B6) for paper mode, BOTH classes** — see B6. **(6) MULTI-PATH CONSISTENCY (Kyle 2026-06-20): the new movement filter AND the raised target floor/ceiling MUST be wired into EVERY path that runs the filter — the VTS/passive path AND each active paper-mode path (the FX5 main scan, the pattern-pool/pattern-only path, and the per-class xStock active-dispatch path) — not just one.** Mirror the existing LQ/VN/DI IMF filter, which already runs in the active main scan + pattern path + a VTS-relaxed variant (`dbVtsImfThresholds`). Per-class DB-governed thresholds; VTS may run a looser threshold but it is the SAME filter governed the SAME way. VTS must also adopt the raised targets. Rationale: if VTS filters/targets differently from active, the Phase-25 calibration data won't reflect actual paper behavior → drift. **The scope ENUMERATES every path explicitly; Langston Step-1 checks the enumeration is complete.** | low |
| B3 | **EV-input plumbing (#233, one site)** | SHARED | Thread real DI / VolNoise / sourcePool / dbsScore at the RTB→promote metadata boundary (Langston: ONE fix-site, consumption already wired). Accuracy + strong-trend parity. **Does NOT unblock crypto by itself** (pWin capped 0.60) — it's correctness, not the opener. | low |
| B4 | **Shadow-trade layer (P19-B8 / 19-17)** | SHARED | Pulled FORWARD (Kyle + 3-way): open a *simulated* trade for every signal reaching RTB (and optionally SQE-rejected, tagged), telemetry-only / partitioned. The data engine (outcomes on every signal, not just the 3-4 real opens) + the selection-quality measurement. Runs ON the uncalibrated system *because* that's what it measures. Guardrail: telemetry-only, never auto-feeds live behavior. | moderate |
| B5 | **The ranking fix** (the make-or-break) | SHARED | Wire a score that actually *correlates with winning* into the live promotion picker (today it ranks on finalScore, which the audit found anti-predictive ~−0.14 on crypto; the better rankingScore is computed only on the VTS path → inert on active). WIRING is Phase 19; the WEIGHTS calibrate in Phase 25. Also retire the dead ranker (`getTopSignal`/`checkForPromotion`) per the disposition decision. | moderate |
| B6 | **Filter Diagnostics tab** | SHARED | Visibility: the whole pipeline scan→close, where signals drop, bug-vs-filtered, selection quality. Views crypto → xStock → live. Pairs with B4. (Kyle's originally-locked next-step, now paired with the shadow layer.) **★KYLE 2026-06-20: MUST include the B2 movement/reachability filter + the B2 raised target floor/ceiling thresholds, surfaced by-reason for paper mode in BOTH crypto AND xStock** (no filter/threshold/gate hidden). | moderate |
| B7 | **Rung-2: maker build** | SHARED | Post-only limit entry path in the order-placer + wait/fill model off the real WS price path + cross-fallback on A+ conviction; the asymmetric-stop EV kernel change (win-path maker / loss-path taker — two frictions, not one symmetric round-trip); the shared maker/taker fee-selection SERVICE that BOTH active execution and the VTS simulated fill consume (so VTS learns honest economics). | moderate |
| B8 | **xStock net-new modules** | XSTOCK-NET-NEW | Mostly already built (B4a active wire-in, B4b.1 depth gate, B5 macro capture) — debug + activate after the crypto template: trading-hours/holiday calendar, depth/liquidity gate + MM-quote handling, macro (VIX/DXY) overlay, sector clustering. **+ the recurring global-fields open-stamp regression → real ROOT-CAUSE fix + tripwire (CC-A; §8 #11 no-patches: it regressed twice, the cause isn't found).** | mixed |
| B9 | **Turn-on + validate** | CRYPTO-FIRST | Turn crypto paper-active ON → debug to working (the proven template) → turn xStock paper-active ON → validate. **Both ON by Phase-19 close** (D3). Per-class active gate already exists (B6.5a). | — |

**Sequencing note:** the minimum to get crypto *opening* is B1 + B2. B4/B5/B6 build the data + selection + visibility around it. B7 (maker) is the ladder optimization + VTS-honesty piece. B8/B9 bring xStock on the proven template. The exact ordering is for the 3-way to finalize; the SHAPE + the gates (D1–D7) are the locked part.

---

## §3 — §13 homes for surfaced items (audit + fee work)

| Item | Disposition |
|---|---|
| `criteria-limiter.ts` CriteriaLimiter (dead "TCL") | delete-on-the-spot (zero callers, no coupling) — its own small removal batch |
| `getTopSignal` / `checkForPromotion` (dead rankingScore ranker) | park WITH the ranking fix (B5) — revive-and-wire or delete per that decision |
| V3 two fee-sources (EV gate `getCachedCostMetrics` vs fill `getFrictionForAssetClass`) | reconcile-to-one-source — fold into B7 (maker build touches the fee path) |
| V5 no regime-flip exit | fresh decision: "not wanted + rationale" OR a roadmap item — decide in the 3-way |
| maker-path + liquid-volatile universe + realized-tier tracking | B2 (universe) + B7 (maker) + a realized-fee-tier tracker (fee ladder) |
| size/concurrency/win-rate + start-balance study | **Phase 25 item 25-16** (committed 2026-06-19, grouped with 25-11, early-Phase-25) |
| confidence/win-probability recalibration (inversion confirmed B-NEW-36/37/39) | **Phase 25 items 25-2 / 25-3 / 25-10** (re-validate on paper-active outcomes) |

---

## §4 — Phase 25 + beyond (calibration → live)

- **Phase 25 — Calibration With Evidence:** both classes calibrate on their accumulated paper-active + shadow-layer outcomes. Crypto comfortable first; xStock trails on slower data. The confidence inversion (25-2/3/10), the ranking weights (B5), the size/concurrency/balance study (25-16), rung-3 pWin ceiling — all here, gated on outcomes. Go-live gate = "calibrate in paper until COMFORTABLE, THEN proceed."
- **If xStock calibration spills past Phase-25's crypto-comfortable point** → it runs in parallel with **Phase 16 + 20 (cleanup + hardening)** — CC-A + Langston on xStock tuning, CC-B on cleanup (D4). Works *because* "both in code" settled xStock's STRUCTURE in Phase 19, so its Phase-25 work is value-tuning (no structural code changes that would conflict with hardening).
- **Phase 21 — Live Mode Activation:** both calibrated by now → launch live together (D5), short real-money safety stagger only if a Phase-21 reason emerges. The `live_engine_enabled` flip + the live-build-approach decision (19-18) gate this.

---

## §5 — Open before lock (then this folds into `PHASE_19_PLAN.md` §1)

1. **CC-A's concur** on the crypto-vs-both hybrid (D1–D7). *(Langston: APPROVED the hybrid + sharpened to "both in code, one live at a time"; CC-A: pending — pulled onto B-GOV-2 activation.)*
2. **The unified fee-consensus post** (CC-A finalizing; CC-B audit-lens build answer delivered — rung-1 is low-build at taker, rung-2 maker needs the asymmetric kernel first).
3. **V5 regime-flip-exit decision** (3-way).
4. Then: write D1–D7 + the B1–B9 board into `PHASE_19_PLAN.md` §1 (with the D7 hard gate), make any roadmap edits, and start the first build batch (B1 recognition, re-scoped both-class).

---

*CC-B draft 2026-06-19. No code/governance-doc changes pending: CC-A finishes his governance batches → signals clean → CC-A concurs + posts fee consensus → this folds into PHASE_19_PLAN §1 → first batch starts.*
