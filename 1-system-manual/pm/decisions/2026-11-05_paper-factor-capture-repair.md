# Decision pack — repair paper confidence-factor capture (#1244 / #231)? (2026-11-05)

> KD-34 protocol (`1-system-manual/pm/DECISION_PROTOCOL.md`). Owner CC-A (OLD Claude); deciders CC-A + Langston + Coltrane; PM Claude records. Assembled by CC-A at PM Claude's request (2026-11-05 ~14:10Z).

## 1. The question
Should the paper path's per-factor confidence record (`regime_factor_alternates`, `source_type='active_signal'`) be repaired now — and if so in what order and relative to KD-30's confidence redesign — given that every paper write has been failing?

## 2. What was intended, when and why
- **B67 (2026-04-28 → 05-03), the ablation framework:** each row is a per-factor COUNTERFACTUAL — `real_decision`, `alternate_decision` ("what would have been decided with this factor absent") and `replay_outcome` against the trade's actual price path — so each factor's marginal lift can be measured against realized outcomes (`BATCH_CATALOG.md:246`, "Batch 67 … All 8 foundation sub-deliverables LIVE"; B67.0 is the emitter). It was built while active trading was OFF, so only the VTS source was ever exercised.
- **#231 (2026-06-14, P19-B3b, Langston-agreed):** the active-signal source needs an INTEGER `signal_id` (FK to `trading_signals.id`); the orchestrator only has a string id. Forcing it (`parseInt`, or widening the type) was refused as a rule-15 patch. *"Fix: wire an integer `trading_signals.id` into the active-signal path … when the B67 ablation factors actually deploy."* (`RUNNING_ISSUES.md:2991`).
- **Roadmap 25-9 (xStock pair correlation):** *"needs paper-active WR data to set the right modifier coefficient"* (`POST_AUDIT_ROADMAP.md:314`) — the intended consumer of paper rows.
- **KD-30 (Kyle 2026-11-05):** no confidence data capture until the score is audited and a new score agreed; the audit is `B-CONFIDENCE-AUDIT`, CC-A, sprint row 141a (KD-33).

## 3. What is built today (measured)
- **Langston, staging, 2026-11-05 13:02:15Z:** paper capture is NOT off — it fires every ~30 s cycle and every write fails: 3,304 `[B67.0][ablation-emitter] Failed to persist … invalid input syntax for type integer: "DRV/USD-volatility_edge-…"` lines in the current `error.log` (651,789 lines). `signal-orchestrator.ts:796` builds the string id; `:1849` passes it as `{kind:'active_signal', signalId}`; the fire-and-forget `.catch()` at `factor-ablation-emitter.ts:182` is why nobody saw it. ⇒ **#1244's cause is #231, established.**
- `regime_factor_alternates`: 55,357 rows, all `vts_trade`, 2026-08-06 → today (Langston, #1244).
- **Even if the writer were fixed, paper rows could not be replayed:** `replay-ablation.ts:138-152` stamps every pending `active_signal` row `unreplayable_active_no_signal_id_join` — `closed_trades` stores no signal id — and `b67_0_alternates_retention_days` = 90 sweeps them (`:258-271`).
- Cohorts are separable: every row carries `real_decision.metadata.calibrationFrameworkVersion` (`'b76_chain_final'`), and the aggregator already filters by it (the B76 precedent).
- **CC-A preliminary (KD-30's first ask, `Scope Files/CONFIDENCE_AUDIT_PRELIM_PAPER_2026-11-05.md`):** on 1,371 closed paper trades the stored confidence shows no stable link to outcomes.

## 4. What the plans say is coming
`B-CONFIDENCE-AUDIT` (row 141a, after row 125, before row 142), whose key output is the ordering answer — must confidence be rebuilt (row 148a) before the modifier calibrations (rows 145-147). Roadmap 25-9 reads paper rows. Langston proposed (in #1244) a batch `B-ABLATION-ACTIVE-SIGNAL-ZERO` after row 105; not placed.

## 5. Options
| option | benefits | risks |
|---|---|---|
| **A — repair now, in a forced order: (1) one integer identity for the active signal carried by BOTH `regime_factor_alternates.signal_id` and `closed_trades`; (2) the writer; (3) the replay join.** Rows version-stamped so KD-30's cohort never mixes with today's. (Langston's proposal.) | starts the only paper (selected-population) evidence the redesign can use; 90-day retention means every week of delay is data that will never exist; ends 3,300+ error lines per log | touches the open path (the identity must be written at open, KD-17's area) — needs its own Step 2; under KD-30's wording it is "capture before the audit" |
| **B — wait until B-CONFIDENCE-AUDIT and KD-30's new score** (KD-30 as worded) | no capture built on a score being replaced | the redesign then has NO paper evidence to weight factors with; the writer keeps failing every cycle; the 90-day window that would have held the data passes empty |
| **C — silence the failing write now, repair later** | stops the error-log noise | throws away the same data as B; adds a change only to be undone |

**The distinction Langston draws, which decides between A and B:** the table records per-FACTOR counterfactuals, not the combined score; the redesign is a re-weighting, and the ablation record is its input. The KD-30 constraint is on CONSUMPTION (nothing sizes or ranks on a factor until its own lift is measured), not on RECORDING.

## 6. Positions (each round recorded)
- **Langston (2026-11-05 ~13:05Z, Discord, to Coltrane):** A, in that order, ahead of any KD-30 weight-setting; confidence need not be calibrated first. Flags a hypothesis for the audit: does anything downstream (SQE, RTB ranking, sizing) consume `confidenceModulated` / `chain_modulated_confidence` (`signal-orchestrator.ts:1890/:1897`)?
- **CC-A (2026-11-05):** **A, agreeing with Langston on the order.** Two additions: (i) step (1) is designed with `B-CLOSE-WRITER-COSTS` in view — that batch already changes how the close finds its record, so the identity link should be the same key rather than a second one; (ii) Langston's downstream-consumer question is answered FIRST in `B-CONFIDENCE-AUDIT`'s provenance step, because an anti-predictive score that only records is a different problem from one that acts. Placement: a new batch, so it goes to Kyle's list as "the group agreed this, placed here" (the KD-34 rule for additions).
- **Coltrane (2026-11-05 ~13:5xZ, Discord; read before the pack landed, on the stated options + code):** **A, ordering tightened.** (i) The confidence audit FIRST names the downstream consumer and the exact quantity and semantics; (ii) then identity-link → writer → replay, **landing DARK** (built, not capturing) until that answer exists; capture is enabled before weight-setting — this keeps KD-30 (no capture before the audit settles what is worth capturing). (iii) The active source needs an integer `trading_signals.id` (`factor-ablation-emitter.ts:121-122`; `shared/schema.ts:581`): create that durable identity at ADMISSION and carry it into the trade/close record — designed with `B-CLOSE-WRITER-COSTS` but **signal identity and trade/close identity are distinct nodes, not one overloaded key**. (iv) An immutable score-definition / capture-schema version beyond `b76_chain_final`; every consumer filters it; no old rows replayed into the new cohort.
- **CC-A round 2 (2026-11-05):** **agree with Coltrane's tightening in full** — it supersedes my "same key" note (distinct nodes is right: a signal can be admitted and never become a trade). Consensus candidate: **A as Coltrane states it.** Awaiting Langston's confirmation of the dark-landing and the version stamp.
