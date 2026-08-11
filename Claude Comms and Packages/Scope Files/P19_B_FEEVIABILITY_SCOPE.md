# P19-B-FEEVIABILITY — SCOPE

**CC-C, 2026-08-10. Kyle-directed. For Langston Step-1 review.**
**change-class: `architecture`** — touches the SQE reject write path, a per-class gate constant, and per-strategy geometry levers. Declared strict per §2 1.b.
**Supersedes the shape in `STRATEGY_FEE_VIABILITY_TWO_BATCH_PROPOSAL.md` §1.** The investigation moved the batch's centre of gravity: it is **no longer primarily about tuning targets.**

---

## 0. WHAT CHANGED, AND WHY THE BATCH IS NOT WHAT WE PROPOSED THIS MORNING

**The arithmetic survey said which strategies COULD clear the fee. The hit-rate replay said what raising a target COSTS. Together they invert three of the four changes originally proposed.**

**★ THE FINDING THAT RESHAPED IT: two of the three best candidates are blocked by something OTHER than their own geometry.** `pivot_shift` is blocked by an uncalibrated placeholder ceiling; `volatility_edge` is blocked by a regime that occurs 2.1% of the time. **Removing an obstruction in front of a strategy that already works beats tuning one that does not.**

---

## 1. THE EVIDENCE THIS SCOPE RESTS ON (all measured this session; object + population stated)

### 1.1 The fee-viability survey — OBJECT `vts_open_trades` (ungated ⇒ no admission bias on geometry), POPULATION all crypto rows opened in the trailing 21 days, n≥20 per strategy
`T_required = ((1−p)·S + F) / p`, `p = maxPWin = 0.60`, `F` at both bounds (taker 1.60%, maker 0.80%).
**Crypto: 4 of 11 clear at their current settings; 7 do not.** ~**71% of crypto signal generation (≈22,000 of 31,000)** comes from strategies that cannot clear the fee as set.

### 1.2 The hit-rate decay — COUNTERFACTUAL REPLAY, no setting changed
**Method:** raising a target changes **neither the entry nor the stop**, so for every recorded trade we hold entry, stop and the actual subsequent prices — walk them forward and ask whether the larger target was reached before the stop. **Dodges Langston's break-case because VTS is UNGATED** (no admission selection on the swept axis). 24h forward window; both-hit scored as **loss** (conservative); August partition.

| strategy | n | current | +25% | +50% | +100% |
|---|---|---|---|---|---|
| **pivot_shift** | 135 | **73.3** | 69.6 | **69.6** | 10.4 |
| **volatility_edge** | 4,267 | **45.2** | **45.0** | 28.7 | 11.0 |
| **sma_trend_ride** | 376 | 14.9 | 14.9 | **14.6** | 10.1 |
| inside_bar_reversal | 299 | 52.2 | **6.4** | 6.4 | 0.0 |
| reverse_impulse | 169 | 23.1 | 11.2 | 8.9 | 8.9 |
| strong_bull_trend | 160 | 18.1 | 12.5 | 9.4 | 3.1 |
| morning_star | 553 | **2.0** | 0.7 | 0.7 | 0.7 |
| vwap_pullback | 40 | 0.0 | 0.0 | 0.0 | 0.0 |

⚠️ **CC-C's pooled "~10 points per half-multiple" is WITHDRAWN — it was meaningless.** Decay is wildly strategy-specific.

### 1.3 Two gates upstream of netEV that the earlier funnels MISSED
**OBJECT** `/var/log/dawntrader/out.log`, **SPAN** 06:34:32→11:44:02 = 5.2h, **positive control** 3,279 hits: **`unreachable` 1,452 · `rr_below_min` 1,827** — together ≈ the volume reaching the netEV gate. **Unreachable drops fall on `sma_trend_ride` 926, `vwap_pullback` 512, `strong_bull_trend` 14** — i.e. on strategies whose geometry CLEARS.

### 1.4 Provenance of the blocking constants — **they were never calibrated**
`BATCH_CATALOG:378` (reorg-B2, 2026-06-20) verbatim: **"Seeds 4%/2.5/4.0 both classes (placeholder; Phase-25 calibrates)."** Homed at roadmap **25-17** (*"calibrate the floor and reach_atr_max DOWN on its own realized paper-active data"*) + `RUNNING_ISSUES` **#336**.
**★ The placeholder's stated rationale no longer holds:** it was justified by the **taker** fee wall. **MEASURED, `closed_trades` post-2026-07-28 cutover: crypto fills MAKER 44 of 46 = 96%** at 0.40%/side; xStock fills **TAKER 82 of 96 = 85%**. Crypto pays **half** xStock's friction and still cannot clear.
**★ INDUSTRY RE-DERIVATION (Kyle-directed):** practitioner literature uses **1.5–2× ATR as a target SETTING** and 3–4× for position trading — **nowhere as a maximum-reachable CEILING.** We appear to have borrowed a number from a context where it means close to the opposite. *Reasoning only; no source states a cost basis.*

### 1.5 `volatility_edge` — not killed, rarely ELIGIBLE
6,681 log events, **every categorised one VTS/MCE — zero active-path.** Cause at `canonical-regime-strategy-map.ts:139`: it is **IE-registered**. **MEASURED regime distribution** (`signal_eval_archive`, crypto, 24h, all 22,196 labelled rows): RBS 7,893 · TFS 7,089 · ST 6,427 · **IE 462 (2.1%, six pairs)** · HVU 293.

### 1.6 Pair-exclusivity — a real exit, recorded NOWHERE
**122 blocks in 5.2h** (`hasActivePair`, strategy-agnostic) on VVV 56 / ICNT 46 / XMR 20 — **all three genuinely held; the block is CORRECT behaviour.** Ten of fifteen slots were free ⇒ **not capacity, exclusivity.** **POSITIVE CONTROL:** `signal_eval_archive` over all **369,409** crypto rows in the same window returns **4,010** rows matching `netev` and **ZERO** matching `duplicate`/`pair`. ⇒ the funnel is blind to it, and **shadows cannot recover it** (no pool entry ⇒ no shadow row).

**★ LIVE WORKED EXAMPLE — Kyle screenshotted it 2026-08-11 08:05 UTC, and the evidence was gone 25 minutes later.**
A **PUMP/EUR** signal sat in the Ready-to-Buy pool for **18 minutes**, `pivot_shift`, netEV **0.000003**, **Maker** mode, **10 of 15 slots free** — and was never promoted.
**CAUSE, verified in `closed_trades`: PUMP/EUR was ALREADY AN OPEN POSITION at that instant** — opened `07:46:49Z`, closed `08:10:43Z` on `stop_hit`, lane **`organic`**. ⇒ **capacity was never the constraint; pair exclusivity was.**
**WHY IT IS THE ARGUMENT FOR OBJ-1:** the block wrote **nothing** to the archive, the position has since closed, and the pooled signal is gone. **Without the screenshot there would be no trace at all.** A rejection class that erases itself inside half an hour cannot be measured across a marked window.
*Three incidental facts worth keeping: the trade was **organic** (so the organic lane is not fully dead — it produces occasionally and this one stopped out); it was **`pivot_shift`**, an OBJ-4 candidate, confirming it does reach the pool; and netEV `0.000003` is the survey's knife-edge arithmetic appearing in a single live row.*

---

## 2. OBJECTIVES

> **Sequenced. OBJ-0 runs FIRST; OBJ-1 and OBJ-2 are PRECONDITIONS — nothing else deploys before them.**

**★ OBJ-0 — RUN THE OBSERVATIONAL DECISION GATE, ROADMAP ITEM 25-5. Runs BEFORE OBJ-1. (Kyle-flagged 2026-08-11; CC-C had wrongly filed this to batch two with NO DATE — the §9.4 vague-deferral failure, on an item whose triggers are ALREADY MET.)**

**⚠️ NAMING CORRECTED — Kyle was right and CC-C was using a dead label.** It is **roadmap item `25-5`**, **Phase-25-homed**. `POST_AUDIT_ROADMAP:310` catalogues it as `| 25-5 | §19.4.5 Observational Decision Gate |`, and `:291` states the four calibration sections *"keep their original anchor numbers but are Phase-25-homed."* ⇒ **`19.4.5` is a preserved SECTION ANCHOR, not its phase.** This makes OBJ-0 **the same kind of phase-move as OBJ-3 (25-17), not a special case** — both pull a Phase-25 item forward because paper-active data now exists and the item gates work in front of it. *(⚠️ `:245` still positions the gate in the Phase-19 run order — an internal inconsistency in the roadmap; flagging, not fixing, in this batch.)*

**WHAT IT IS:** created 2026-04-26 after B65.6 closed via SKIP; nine items to decide once 1–2 weeks of clean active-paper data exist. Reference: `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md`.
**STATE: NEVER RUN.** No `PHASE_19_OBSERVATIONAL_DECISIONS` document exists anywhere in the repo, and `19.4.5` returns **zero hits in `PHASE_19_PLAN.md`** — it fell out of the live plan.

**TWO OF ITS NINE TRIGGERS ARE ALREADY MET:**
- **Item 2 — fewer than 5 signals/day** ⇒ trigger is to **widen the pair universe**. **Crypto is at 3 organic trades in 21 days.** Met by a wide margin.
- **Item 3 — outcome-vs-confidence inversion** comparable to the 04-22 VTS pattern (**TFS 13.8% WR vs STR 83.3%**) ⇒ trigger is to **reopen B65.6 as a PRE-LAUNCH fix**.

**★ WHY IT CANNOT SIT IN BATCH TWO — this is a SEQUENCING constraint, not a priority preference:**
1. **Item 3's remedy changes the confidence inputs → changes pWin → changes what clears the netEV gate — which is exactly what OBJ-4 measures.** Landing it *during* the marked window is a second, undeclared change inside a controlled experiment. It must land **before the mark or after the window closes; never during.**
2. **Item 2's remedy — widen the pair universe — is the SAME PROBLEM as §1.6 pair-exclusivity.** Only ~7 crypto pairs qualify; holding one blocks every strategy on it. Deciding OBJ-4's change set without first deciding whether the universe widens risks measuring strategy changes against a pair ceiling we were about to lift.
⇒ **BOTH triggered items DECIDE WHAT BATCH ONE CONTAINS. Running the gate afterwards means either contaminating the window or delaying its answers by the full window length.**

**SCOPE OF OBJ-0 (deliberately narrow — this is not the whole nine-item gate):** evaluate and produce a written decision for **items 2 and 3 only**, the two whose triggers have fired. The remaining seven stay in Phase 19.4.5 and are re-evaluated at its normal time.
**OWNER:** CC-C. **DUE: before OBJ-1 begins** — it gates the batch.
**OUTPUT:** `1-system-manual/PHASE_19_OBSERVATIONAL_DECISIONS.md`, stating per item what was observed, whether the threshold for moving work pre-launch was met, the decision, and the justification (the format the gate itself specifies).
**VERIFY:** the document exists at the graded ref; `PHASE_19_PLAN.md` carries 19.4.5 with its status; `RUNNING_ISSUES` #336 and the B65.6 record cross-reference it.
**⚠️ ESCALATION:** if item 3 says reopen B65.6 pre-launch, that is a **Kyle scope call**, not CC-C's — it re-orders Phase 19 itself.

**OBJ-1 — PERSIST THE DECLINED-SIGNAL RECORD (blocking).**
Write geometry + **config VERSION** (not value — Langston r2.1(b)) at the **SQE reject hook**, by **write-site parity with the `vts-runner` writer** (which already writes `target`/`atrAtOpen` at 32/32 while `signal-orchestrator` writes 0 of 6,077).
**ALSO persist the pair-exclusivity rejection** (§1.6) with the blocking symbol + the holding strategy — same hook region, same job.
**VERIFY:** post-deploy, SQE-reject rows carry non-null geometry + version at ≥99%; pair-exclusivity blocks appear in `signal_eval_archive` with a count reconcilable to the `duplicate_pair_active` log line over the same window.

**OBJ-2 — RAISE `SHADOW_MAX_HOLD_MS` 6h → 48h (blocking, Langston-approved).**
**Change the CONSTANT, not the switch:** `isVtsMaxHoldEnabled()` is ONE boolean gating both the shadow TTL and the real VTS 7-day zombie valve — flipping it re-creates the B63 regression in one move.
**Cap interaction CLOSED by Langston's own event-replay:** peak concurrent shadows 1,405 @6h → **3,284 @48h** against `SHADOW_CAP=10000` = **3.0× headroom at the historical maximum**. CC-C's 23k–52k estimate **withdrawn** (it scaled a wrong code comment).
**VERIFY:** TTL-cut share of shadow closes falls materially below the measured 27.3%; `shadowDropCount` stays 0.

**OBJ-3 — RECALIBRATE `reach_atr_max` FOR CRYPTO (the phase-move; needs Kyle + Langston sign-off).**
Move roadmap item **25-17** into this batch **for `reach_atr_max` only**. Set from crypto's own realized distribution, per class.
**WHY IT CANNOT WAIT:** it drops **926 `sma_trend_ride` signals in 5.2h**, and it **structurally excludes `pivot_shift`** — the strategy with the flattest decay curve we measured (69.6% at +50%). **A placeholder is blocking the strategy best able to absorb a bigger target.**
**VERIFY:** `unreachable` drop rate falls; no strategy whose geometry clears is dropped for reachability at the new value.
**⛔ `min_rr` IS EXPLICITLY NOT IN SCOPE — see §3.**

**OBJ-4 — THE PER-STRATEGY GEOMETRY CHANGE SET, chosen on benefit AND cost.**
**Candidates: `pivot_shift`, `volatility_edge`, `sma_trend_ride`** — the three flattest decay curves.
**WITHDRAWN from the earlier proposal, each with its reason:** `morning_star` (**2.0% hit rate at its CURRENT target — broken, not mis-set;** rule-24 outcome-3 candidate, 553 trades of evidence); `inside_bar_reversal` (**+25% costs 46 points**, 52.2→6.4); `support_bounce`, `reverse_impulse`, `vwap_bounce`, `defensive_hedge` (decay too steep or unmeasured).
**Per-class rows only** — the mechanism is proven live (`strategy.vwap_pullback/volume_confirmation_enabled` is `*`=1 **and** `xstock_spot`=0). **A DB row, not a code change.**
**VERIFY:** each changed strategy's post-mark signal count and fill count read separately by `strategy_name`; slot utilisation tracked as a first-class metric.

**OBJ-5 — THE MARK.**
A **commit + UTC timestamp**, not a date. **PRE-REGISTERED BAN on cross-half comparison of admission-conditioned metrics** — win rate, average R, fill rate, hit rate — named in writing before the cut (Langston: labelling was never the missing half; attribution is necessary and *not sufficient*). **Post-mark row count measured before anything is called a population.** **Read `rtb_shadow_pairings`, NOT `rtb_signals.{hybrid_score,regime_weight,decay_penalty}`** — those columns are NULL from birth and the live reads are elsewhere.
**⚠️ STATE THE UNVERIFIED PREMISE:** #581's live ≥2-distinct-atr fence was DEFERRED-PENDING-SIGNAL-FLOW and **has never gone green** ⇒ post-mark `atr` is **code-correct, not live-verified.**

---

## 3. EXPLICITLY OUT OF SCOPE — with the reason, so none is silently revisited

- **`min_rr` 2.5.** Industry band is 1:2–1:3, so 2.5 sits **inside** the recommended range; the literature says that an algo rejecting most signals at 2.5 has a **geometry** problem, not a threshold problem — and our measured crypto R:R is 1.67–2.00. **★ Kyle's correction, which sharpens rather than softens it: their band EXCLUDES fees, so it does not transfer — at our friction we would need MORE than 2.5, not less.** Our strategies are industry-*normal* and industry-normal does not survive our costs. **Lowering it is moving away from the standard. CC-C's earlier argument for lowering is withdrawn.**
- **The Kraken+ subscription.** **RETRACTED IN FULL.** Kraken's own documentation: *"Kraken+ applies only to the Kraken platform (app and website). It does not apply to other Kraken products, such as Kraken Pro."* **API and Kraken Pro spot trades are explicitly excluded**, and spread applies regardless. We trade entirely by API. *(Error class: verified what the benefit DOES without verifying it applies to us.)*
- **The regime→strategy mapping.** **The provenance vindicates it:** RBS is documented as where *"mean-reversion and range-bound strategies have their strongest historical performance"*, with trades *"smaller and shorter, focusing on quick gains."* **Nothing is mis-assigned.** The conflict is that **RBS is the most common crypto regime and its designed trade style cannot survive 0.80% round-trip.** That is a Kyle scope call (§4), not a repair.
- **Changing venue**, the combinations study, and the SEVEN untriggered items of the 19.4.5 gate → **batch two.** ⚠️ **The TWO TRIGGERED 19.4.5 items are NOT deferred — they are OBJ-0 of THIS batch (§2), because both decide what this batch contains.**

---

## 4. DECISIONS THIS SCOPE DOES NOT MAKE — for Kyle, surfaced not buried

1. **Do we trade crypto in the Range-Bound regime at all?** It is the most common regime and its trade style is structurally unprofitable at our fees. Forcing bigger targets onto range strategies fights the regime's nature.
2. **`morning_star`'s disposition** — 2.0% hit rate over 553 trades. Retire for crypto, or rebuild?
3. **Is turnover itself the target?** **MEASURED: fees are $1,008/30d on a $2,250 portfolio = 45% of the account per month**, because we recycle the portfolio **~34×/month**. At live sizing ($800, 5 slots, ~$150/trade) that is **~$132/month = 16.5% of the account.** **Fee damage is rate × turnover, and every lever discussed today addressed only the rate.**

---

## 5. OPEN QUESTIONS FOR LANGSTON

1. **OBJ-3 phase-move:** does `reach_atr_max` move into this batch? The `pivot_shift` exclusion is my strongest argument — attack it.
2. **OBJ-1 scope:** does pair-exclusivity persistence belong here, or as its own issue?
3. **`vwap_pullback` returns 0.0% hit rate at every level (n=40).** I do not trust it and have not explained it. Does it block OBJ-4?
4. **The 24h replay window** counts slower winners as misses. Does that bias the decay curves enough to change the candidate set?
