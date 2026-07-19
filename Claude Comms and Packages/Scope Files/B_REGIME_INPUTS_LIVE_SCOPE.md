# B-REGIME-INPUTS-LIVE — SCOPE (Step 1)

**change-class: architecture**
**Owner:** CC-A · **Date:** 2026-07-19 · **Closes:** #543 + #538 (jointly — see OBJ-0)
**Authorisation:** Kyle approved the investigation + the recommended fix (2026-07-19, Discord). Kyle ALSO ruled: **do NOT pause active trading** while this is fixed.
**Langston:** Step-1 review requested. Home placement is an open question for you — see §7.

---

## 1. THE DEFECT, IN ONE PARAGRAPH

The **RegimeWeight admission gate** — one of only two gates that can actually reject a signal on the active path — **has no reachable reject path**, because both of its inputs are constants.
`calculateRegimeWeight = trendScore×0.70 + (1−min(1,volatility))×0.30`, clamped [0.1,1]. On the active path `trendStrength` is hardcoded `0.5` and `volatility` resolves to a fixed fallback, so the output is **0.6455, always**, against a floor of **0.3000** (`signal_quality_evaluator.ts:367`, sync variant `:548`). Live: 21/21 queued rows carry exactly those values.

**This is NOT a broken capability.** The same computation works correctly on the **VTS path**, fed by the **MCE**: `vts_open_trades` holds 16,183 trades (2026-05-10→07-19) with **9,041 distinct regimeWeight values**, full 0.0–1.0 range, of which **41.11% fall below the 0.30 floor**. ⇒ **Rule-24 outcome 3: the active path was never re-pointed at the MCE when the MCE became the market-context source.**

---

## 2. THE FIX IS SMALLER THAN THE FINDING — the live data is ALREADY IN SCOPE

The decisive architectural fact (SIM §5.2.5 + `:949`; verified in code):

- The **MCE is already on the active path** — `signal-orchestrator.ts:133` imports it, and **`:611` already fetches `const mceCtx = mce.getCachedContext(rawSignal.symbol, sizingContext.assetClass)`**.
- `mceCtx.raw` is a `RegimeCalculationResult` (`server/types/market-regime.types.ts:30-41`) carrying **`volatility`**, **`momentum`**, **`adx`**, `regime`, `confidence`, `regimeScore`.
- **~180 lines below that fetch, at `:790`, the code passes `trendStrength: 0.5` and `volatility: extendedMetrics.volatility ?? 0.3` into the SQE anyway.**

⇒ The live values are already retrieved, cached (no new computation, no new I/O), and sitting in a variable in the same function. **This is a wiring fix, not a data-acquisition project.**

---

## 3. OBJECTIVES

**OBJ-0 — #543 and #538 are fixed TOGETHER or neither.** Repairing volatility alone leaves 70% of the score pinned by `trendStrength`, producing a gate that **looks alive and still cannot reject** — strictly worse than the current honest deadness, because it would end the search. This is a hard constraint on the batch, not a preference.

**OBJ-1 — Route `volatility` at the MCE on BOTH paths.**
- Genesis: `signal-orchestrator.ts` (`:587`, `:790`, `:974` — all three SQEInput builds) consume `mceCtx.raw.volatility`, not `extendedMetrics.volatility ?? 0.3`.
- Refresh: `ready_to_buy_service.ts:799` `getVolatility(normalizedSymbol)` → the MCE read. Both refresh mechanisms already share `acquireRefreshedInputs`, so this is ONE edit covering both (the B-RTB-REFRESH-CONSOLIDATE transplant is what makes that true).

**OBJ-2 — Route `trendStrength` at the MCE.** Replace the hardcoded `0.5` at all three genesis sites and the `metadata.trendStrength ?? 0.5` at `ready_to_buy_service.ts:901`.
> ⚠️ **OPEN DECISION — NOT MINE TO INVENT (§7 Q1).** ADX is 0–100; `trendStrength` is 0–1. The mapping (e.g. `min(1, adx/50)`, with ADX>25 the conventional trending threshold) is a **modelling choice, not mechanical wiring**. I will NOT silently pick a formula — that would replace one unexplained constant with one unexplained curve, which is the same disease. Langston to rule the mapping, or explicitly defer it to Phase-25 calibration with a stated interim.

**OBJ-3 — FAIL LOUD on a missing input; never substitute.** Kyle's standing rule (CLAUDE.md §11): *"We're not supposed to be using any fallback numbers… when things aren't happening right, we're supposed to call it out and learn what's going on."* When the MCE context is absent, the signal must be **rejected or alarmed — not silently scored on a constant**. This is the same objective as B-RTB-REFRESH-CONSOLIDATE OBJ-3, which is the strongest argument for the two being one batch (§7 Q2).
> The `0.015` was never a chosen default — it is the *failure mode* of an unfilled cache, returned silently with no log line. Had it failed loud on the first miss, this surfaces on day one.

**OBJ-4 — Retire the orphan per rule 18.** Once nothing reads them: `volatilityCache`, `updateVolatilityData`, and the `return 0.015` fallback (`market-metrics.ts:28-62`). Record in `DELETED_COMPONENTS_LOG.md` with blast-radius evidence. **Do NOT resurrect `updateVolatilityData`** — that would build a SECOND volatility source beside the MCE, and it is exactly the wrong repair my first (outcome-1) reading would have produced.

**OBJ-5 — Governance.** SIM + SYSTEM_MANUAL content updates; close #543 + #538; **amend today's own SIM/SYSTEM_MANUAL text**, which overstates the regimeWeight refresh as "70% inert" when it is 100% inert.

---

## 4. VERIFICATION CRITERIA (a fix that cannot be faked)

1. **DISTRIBUTION TEST (primary).** After deploy, active-path `regimeWeight` must be **spread across a real range** with a non-trivial fraction below floor — qualitatively like the VTS distribution. **If it lands on a single pinned value again, the fix FAILED regardless of what the code says.** This is the acceptance test precisely because it cannot be satisfied by a plausible-looking diff.
2. **PROVE A REJECTION.** Observe at least one signal actually rejected by the RegimeWeight gate. **Do not infer liveness from a changed number.**
3. **FAIL-LOUD TEST.** With the MCE context absent, confirm the system alarms/rejects rather than scoring on a constant.
4. **UI (§9.3).** Confirm on the staging Filter Diagnostics / RTB surfaces that rejections appear.
5. **NO SILENT VOLUME COLLAPSE.** Trade volume WILL fall — that is the fix working (Kyle briefed + accepted). But a fall to ~zero means the threshold is wrong for the real distribution, which is §5.

---

## 5. EXPLICITLY OUT OF SCOPE — the 0.30 threshold

**The floor is NOT touched by this batch.** Provenance (CC-A + CC-B archaeology): `MIN_REGIME_WEIGHT: 0.30` was dictated verbatim by **Directive 11.0B (≈2026-01-07, `attached_assets/Pasted--Directive-11-0B-…txt`)** as a given constant with **zero derivation**; the directive's purpose was structural (purify the SQE), not calibrational. `finalScoreMin 0.35` shares the identical provenance — same directive, same sentence, same silence. The pre-governance corpus (`bridge/canonical/DawnTrader_Mathematical_Architecture_v1.5.0.md:246,380`) specifies a floor of **0.40** — but for a **different quantity**: a 0.6–1.2 macro-favourability MULTIPLIER that fed *sizing*, not a 0–1 gate score. **So 0.30-vs-0.40 is NOT a lowered bar; the quantity was redefined under its own name.** (Verified: regimeWeight does NOT feed active-path sizing today.)
⇒ **Fix the inputs, keep the existing floor, measure the real distribution, THEN bring Kyle the evidence.** He sets it as a first-time-on-evidence decision, not an adjustment — there is nothing behind the current value to preserve. Homed to Phase-25 calibration.

---

## 6. BLAST RADIUS

| Surface | Effect |
|---|---|
| RegimeWeight SQE gate | starts rejecting — **the intended change** |
| Trade volume | falls (Kyle briefed + accepted; §4.5 guards the pathological case) |
| Active-path sizing | **none** — verified regimeWeight is not wired into `active-position-sizing.ts` / `active-execution-engine.ts` |
| VTS | **none** — already correct; this batch does not touch it |
| Soak/calibration data | data gathered pre-fix is **provisional** — one of two gates was inert |
| `finalScore` | unaffected (retired to shadow, B8.5a) |

---

## 7. QUESTIONS FOR LANGSTON (Step-1)

**Q1 — the ADX→trendStrength mapping.** Rule it, or defer to Phase-25 with a stated interim. I will not invent a curve to replace a constant.
**Q2 — HOME.** I originally proposed folding into B-RTB-REFRESH-CONSOLIDATE's OBJ-3 (fail-loud is literally the same objective). The finding has since grown — impact quantified, two issues, MCE routing on two paths. Your call: fold, or stand alone as scoped here. **You said "a numbered P19 item, not a later" — this scope is written to satisfy either shape.**
**Q3 — sequencing vs the Mechanism-A retirement gate.** That gate ("observe `chosen_net_ev` AND `regime_weight` moving") is **unmeetable until this lands** — `chosen_net_ev` is moving correctly (−0.0059 → −31.91, proving the transplant works); `regime_weight` structurally cannot. I have NOT restated it to something passable. Confirm this batch is its prerequisite.
**Q4 — fail-loud severity.** Reject the signal, or admit-and-alarm? Rejecting is truer to Kyle's rule; admitting-and-alarming is safer against an MCE cache-miss storm taking the pool to zero. I lean **reject**, with the alarm, but this is a risk-shaped call.
