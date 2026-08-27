# B-TOKEN-WATCH — PRE-REGISTRATION

> **★ THIS DOCUMENT IS WRITTEN BEFORE ANY DATA EXISTS, AND THAT IS ITS ENTIRE POINT.**
> Langston's condition, verbatim: *"Hypothesis, predictor set, outcome definition, decision rule, all written before data arrives. Otherwise you'll fit the cohort."*
> ⛔ **AMENDING THIS AFTER DATA ARRIVES IS PERMITTED ONLY AS AN APPENDED, DATED AMENDMENT THAT STATES WHAT CHANGED AND WHY.** Editing it in place would destroy the only thing it does.

**Owner:** CC-INFRA · **Written:** 2026-08-28, before a single row was collected · **Status:** pre-data

---

## 1. THE QUESTION

**Is anything observable at or very near a token's creation predictive of whether it survives — at a rate that beats the base rate, out of sample?**

Not *"do winners share traits"* — they trivially will. The question is whether those traits **separate winners from the thousands of failures that looked the same on day one.**

## 2. WHY THIS IS WORTH RUNNING EVEN IF THE ANSWER IS NO

Langston's reframe, adopted: the published survival result is **already published**, so re-discovering it is replicating a paper. The durable output is the **case-control survival machinery**, built where a **published answer key exists to check our work against**, then pointed at our own strategy population — `#594` (six strategies never traded), `#596` (outcome corpus not representative), `#597` (ranking on pre-trade estimates from a single observation) — which are all the same statistical problem, on data that is scarce, expensive, and has no answer key. **The machinery is what we keep.** A null result here still validates the machinery.

## 3. HYPOTHESES, STATED BEFORE DATA

- **H1 (replication).** Advertised social presence at creation is associated with higher survival. *Published comparator: Telegram presence 1.485% vs 0.166% graduation, an 8.94× lift; all three channels 1.919% vs 0.110%, 17.4×.* **If our cohort does not reproduce a lift of this order, our instrument is suspect before our conclusion is.**
- **H2 (replication).** Initial size above the platform default is associated with higher survival. *Published comparator: HR 4.51.*
- **H3 (novel).** Creator-wallet history — whether the same wallet has launched before, and how those launches ended — separates outcomes independently of H1/H2.
- **H4 (novel).** Early trade *composition* in the first hour — distinct buyers, and buy/sell balance — separates outcomes independently of H1/H2.

**H3 and H4 are the ones worth running.** H1/H2 exist to prove the instrument works.

## 4. PREDICTORS — FIXED NOW, NOT CHOSEN LATER

Recorded at birth for **every** token: on-chain creation timestamp · first-sight timestamp · advertised Telegram / website / social presence · initial size · initial liquidity · creator wallet · launch venue.
Recorded at each follow-up: still trading · price · liquidity · 24h volume · buy count · sell count · distinct-trader proxy.

⛔ **NO PREDICTOR MAY BE ADDED AFTER DATA COLLECTION BEGINS** except as a dated amendment (§9), and any such predictor is reported **separately** as exploratory, never pooled with the above.

## 5. OUTCOMES — DEFINED BEFORE WE CAN SEE THEM

- **Primary:** still trading at **90 days** (at least one trade in the trailing 24h at the 90-day checkpoint).
- **Secondary:** graduation to a standard trading pool.
- **Death class**, recorded not inferred: **faded** (volume decays to nil) vs **liquidity-pulled** (removed in a single transaction). ★ Both end at zero, so a win/lose column would treat them identically — but they may differ on day one, and **that difference is a primary object of the study, not a footnote.**

## 6. SAMPLING POLICY — STATED UP FRONT, NOT TUNED TO BUDGET

Langston: *"Don't tune the schedule to the budget — that makes coverage 'whatever we could afford,' which is unstateable."*

- **Census on birth. No sampling.** The birth record IS the predictor; a sampled birth record destroys the base rate irrecoverably.
- **Case-control on follow-up:** **100% of trait-carriers**, plus a **fixed random control sample of non-carriers**. ⛔ The control is not optional — without it, trait-carrier follow-up has no comparison and we are studying winners again.
- **Fixed observation grid: 1h · 6h · 24h · 3d · 7d · 30d · 90d.** Fixed ages, not an adaptive taper, so cohorts pool across launch days and censoring is uniform.
- **Death defined ex ante; dead tokens are never re-checked.**

## 7. THE KNOWN LEAK, AND HOW IT IS MEASURED RATHER THAN ASSUMED AWAY

The bias here is **left-truncation, not survivorship** (Langston's correction — the name changes the fix). We see a token only once it enters our feed. With ~68.67% of tokens dying on launch day, any discovery delay removes a large and **non-random** slice — precisely the rug class we most want to characterise. Worse, size-at-birth is the strongest published predictor, and a delayed first sight silently converts it into *size-at-discovery* while we call it the published variable.

**Controls, both mandatory:**
1. **Record both timestamps** — on-chain creation and first sight. Their difference is the **discovery-lag distribution**, converting an unknown bias into a stated bound. *(Chain-direct capture should make this near-zero; the measurement proves it rather than assuming it.)*
2. **Positive control on coverage** — cross-check our daily indexed launch count against an independently sourced count for the same day. If we index 60% of what the chain produced, we know our denominator. **A discovery feed's silence is worth nothing until it is shown able to speak.**

## 8. DECISION RULE — WHAT COUNTS AS A FINDING

Declared now so it cannot be chosen to fit the result:

1. **Instrument check first.** If H1/H2 do not reproduce a lift of the published order, **we report an instrument problem, not a finding.**
2. **Out-of-sample or it does not count.** The cohort is split by launch date; predictors are fit on the earlier half and evaluated on the later. **An in-sample separation is not a result.**
3. **A finding requires the out-of-sample separation to hold with the control group included** — trait-carriers versus matched non-carriers, not trait-carriers versus the population.
4. **A null result is a result** and gets written up identically. The machinery (§2) is the deliverable either way.

## 9. WHAT WOULD MAKE US STOP

- Discovery lag large enough that the earliest deaths are systematically missed, with no control available.
- Coverage materially below the independent count with no explanation.
- Out-of-sample separation indistinguishable from the base rate.

## 10. READ-OUT

**One read-out, at 90 days from first collected row.** Langston's cost constraint, adopted: *"One batch to stand it up, then zero governance drip until a stated readout date. If it needs iterating, it's not cheap."* No interim reporting, no dashboards, no partial conclusions.

## 11. AMENDMENTS

*(None. Any amendment is appended here with its date, what changed, and why — never by editing the sections above.)*
