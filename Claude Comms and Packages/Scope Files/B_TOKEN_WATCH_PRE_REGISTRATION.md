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

### AMENDMENT 1 - 2026-08-28, STILL PRE-DATA (Langston Step-1, BLOCKER-2 and answers (a) and (c))

> **Appended, not edited.** Sections 1-10 above stand exactly as written on 2026-08-28. **This amendment is itself pre-data** - no row has been collected, no collector exists - so it changes the design, not the interpretation of a result. That distinction is the whole reason for the append-only rule, and it is the last moment at which it is true.

**WHY THIS AMENDMENT EXISTS, stated plainly because it is the document's own justification:** Langston found that **the primary outcome as written was unobservable for most of the cohort**, and that the out-of-sample test was therefore unevaluable. That defect becomes invisible the moment data starts arriving; it would have surfaced at the 90-day read-out, costing 90 days instead of an afternoon. **This is the property the document was bought for.**

#### A1.1 - THE OUTCOME HIERARCHY IS RESTRUCTURED (BLOCKER-2)

**The defect.** Read-out is 90 days from the first collected row; §5's primary outcome was *still trading at 90 days*. A token born on day *d* has only 90-*d* days of observation, so a day-45 token's primary outcome **never exists**. §8.2 splits by launch date and evaluates on the later half - **which contains zero tokens with an observed primary outcome.**

⛔ **AND §6's CLAIM THAT "censoring is uniform" IS WITHDRAWN AS FALSE.** Fixed ages make the *attempted* observations uniform. Administrative censoring is `read-out - launch date`, which is maximally NON-uniform **and correlated with the split** - the evaluation half is systematically the less-observed half, so outcomes are depressed there by construction and a model that generalised perfectly would read as failing.

**The replacement, adopting Langston's options 1 + 2 together:**
- **PRIMARY, for the out-of-sample test: GRADUATION.** Fast, near-fully observed across the whole cohort, and - decisively - **the H1/H2 published comparators are already stated in graduation terms** (1.485% vs 0.166%; 1.919% vs 0.110%). The instrument check in §8.1 already runs on this outcome, so the hierarchy now matches the only external answer key we have.
- **SECONDARY: 90-day survival, treated as RIGHT-CENSORED**, not as a missing value and never as a negative. A token observed for 45 days without dying is *censored at 45 days*; scoring it as "did not survive 90" would be a fabricated negative.
- **METHOD: explicit survival analysis with launch-date entry** (Kaplan-Meier / Cox), rather than a binary outcome at a fixed horizon.

★ **THIS IS THE MORE IMPORTANT HALF OF THE FIX, and it is about §2 rather than about tokens.** The stated durable prize is case-control **survival** machinery to point at `#596`/`#597` - which are themselves censored problems. **A design that assumes censoring away builds the wrong machinery**, and we would have carried that defect into the population that has no answer key to catch it.

#### A1.2 - TRAIT-CARRIER DEFINITION, IMPORTED NOT INVENTED (answer (a))

**A carrier is a token with ANY advertised social channel present OR initial size above the platform default** - the union of H1 and H2, exactly as the published comparators define them.

★ **The property that matters is not that this definition is better, but that it CANNOT HAVE BEEN FITTED: it was set by other people before our cohort existed.** Anything derived from first principles by me or by Langston is arguable; this is not.

⚠️ **THE ASSUMED PREVALENCE IS PUBLISHED HERE, because §5 of the scope depends on it and the causality was unstated.** The scope's ~19,000 follow-ups/day is *derived from* an assumed carrier prevalence of **~20% of ~20,700 daily launches (~4,140 carriers), plus a 500/day control, each followed across the seven-point grid with attrition.** **If measured prevalence materially exceeds 20%, the traffic rises - the DEFINITION DOES NOT NARROW.** A trait definition quietly tightened to fit a traffic ceiling is trimming with the label moved, and §6's "nothing is trimmed to fit" would become uncheckable.

#### A1.3 - CONTROL GROUP: 500 PER DAY, FIXED NUMBER, WITH ITS ARITHMETIC (answer (a))

**500 non-carriers per day, a fixed count rather than a fixed fraction.** Because §6 takes a **census at birth**, the base rate and denominator come from the census, not the control; the control need only estimate follow-up outcomes among non-carriers, for which stable absolute *n* per day is what is wanted.

**The arithmetic, recorded before day one so the number is derived rather than chosen:** at the published non-carrier graduation rate of 0.166%, **45,000 controls over 90 days yields ~75 expected events** - enough to bound the non-carrier base rate and support §8.3's matched comparison. That is ~2.4% of daily births and ~1,200 follow-up calls/day. ⚠️ **Attrition is accounted for, not ignored: with 68.67% dying on day one, a nominal control of *n* is ~0.31*n* by the 3-day checkpoint.**

**Three binding conditions:**
1. **Record the daily inclusion probability** (`control_n / non_carrier_births` that day) - a fixed count means unequal inclusion probability across days.
2. **Inverse-probability weighting is PRE-REGISTERED NOW for any pooled analysis.** Discovering this at analysis time and correcting it then would be a choice that looks fitted - the exact thing this document exists to prevent.
3. If the arithmetic above proves wrong, **the replacement number must be shown, not asserted.**

#### A1.4 - THE TEMPORAL SPLIT IS KEPT, WITH TWO CONFOUNDS NOW CONTROLLED (answer (c))

Splitting by launch date stands, and a random split is **rejected**: two tokens launched in the same hour share market conditions, and **a serial creator's launches would land on both sides - direct leakage into H3**, the most interesting hypothesis. Temporal is also the honest analogue of deployment.

- **DRIFT CHECK, pre-registered now:** report the base rate and predictor distributions in each half. ⛔ **If the base rate moves between halves beyond the threshold in A1.5, a failed out-of-sample test is declared UNINTERPRETABLE, NOT A NULL.** Declared now precisely because declared later it is an excuse.
- **WALLET LEAKAGE:** each creator wallet is assigned **entirely to the side of its first launch**. Boundary-crossing wallets are **not dropped** - serial launchers *are* the H3 signal.

#### A1.5 - THE STOP RULES GET NUMBERS (Langston condition 3)

§9's conditions were adjectives - *"large enough"*, *"materially below"*, *"indistinguishable from"* - and an unquantified stopping rule can be satisfied after the fact, which is the one thing this document exists to prevent. Replaced, before any data:

| §9 condition | now |
|---|---|
| discovery lag too large | **median first-sight minus on-chain-creation > 60s**, or **>5% of births exceeding 300s** |
| coverage materially below the independent count | **indexed count < 95%** of the audited count in the §A1.6 window, on **3 or more days in any rolling 7** |
| separation indistinguishable from base rate | out-of-sample graduation lift **< 2.0x** with a 95% interval spanning 1.0 |
| drift makes the split uninterpretable (A1.4) | between-half base-rate ratio **outside 0.5x-2.0x** |

#### A1.6 - THE COVERAGE CONTROL IS REPLACED (answer (d))

**§7's control does not reach, and it fails in the flattering direction.** The aggregator proposed as the independent count **cannot see bonding-curve tokens' pools** - which is the entire cohort at birth - so it plausibly under-indexes exactly the population being audited, making our coverage look **better** than it is.

**And it misses the failure that will actually happen: births arrive by webhook, and a push drops SILENTLY** - no local error. That is the same class as `#704`, already paid for once.

**Replacement - a windowed chain re-census.** One random N-minute window per day: enumerate **every** creation instruction on the launchpad program in that window directly from the chain, and compare against what the webhook actually delivered for the same window. Affordable because it is sampled - the §5 cost finding killed *continuous* unfiltered ingestion and says nothing about a windowed audit - and it detects delivery loss immediately as a window deficit.

⚠️ **STATED REACH, because a control that covers one leg must never be described as covering three:** auditing a provider's webhook against **that same provider's** archival RPC is a different code path and **catches delivery loss**, but **does NOT catch provider-side indexing gaps**. If a second provider's free RPC is available it covers both and should be used; if not, that gap is a known, written limitation rather than an implied absence. The aggregator is retained as a **secondary cross-check only** - a divergence is informative, but it is not the control.


### AMENDMENT 2 - 2026-08-28, STILL PRE-DATA (Langston Step-1 approval, CONDITION 1 and CONDITION 3)

> **Appended, not edited. Sections 1-10 and AMENDMENT 1 stand exactly as written.** Still pre-data: no row collected, no collector built. ⚠️ **This window closes ONCE** - the moment the collector runs, a correction here stops being a design change and becomes a re-interpretation of a result.

#### A2.1 - ⛔ RETRACTION: A1.6's CAPABILITY CLAIM IS FALSE

**A1.6 states:** *"The aggregator proposed as the independent count **cannot see bonding-curve tokens' pools** - which is the entire cohort at birth."*

**THAT IS WRONG, and it is refuted by my own measurement.** Langston probed the live API (`pumpfun` is a first-class indexed venue: 30/30 pairs on a venue query; six of eight freshly-profiled Solana tokens carry a live `pumpfun` pair; **zero of eight returned zero pairs**). I re-derived it against the same real token the cost work used:

| field | value |
|---|---|
| pairs returned | **1 - the pair IS indexed** |
| dexId | `pumpfun` |
| priceUsd | populated |
| volume h24 | populated |
| **liquidity.usd** | **null** |

**THE ERROR, NAMED:** I observed **one null field** (`liquidity.usd`) and generalised it into **blindness to the whole venue.** The true statement is *"it reports no liquidity figure for bonding-curve pools"*, which is a **field gap, not a visibility gap.** That is the `wrong-object` pattern in `CONDUCT.md` §13 - right name, wrong thing - committed inside the one document that is append-only by design.
**MISTAKE: wrong-object [B-TOKEN-WATCH] - claimed the aggregator cannot see bonding-curve pools; it sees them and returns price and volume, only the liquidity field is null.**

**AND THE AMBIGUITY IS RESOLVED: the aggregator is DEXSCREENER, named.** A bare noun was indefensible in a document whose §5 makes DexScreener load-bearing for the entire follow-up leg - a future reader would have taken A1.6 as indicting §5's own source.

#### A2.2 - WHAT SURVIVES, AND WHY THE CONTROL DOES NOT CHANGE

**OBJ-3's windowed chain re-census STANDS, on legs untouched by the retraction.** Its justification was never the aggregator's eyesight: **births arrive by webhook, and a push drops SILENTLY with no local error** - the `#704` class, already paid for once. A count-vs-count comparison against any third-party index cannot isolate that. **The design was right for a reason I stated badly.**

**Reach, restated honestly** (this is the part the retraction changes):
- **Capability: REFUTED** - DexScreener can see bonding-curve pairs. Measured.
- **Coverage: UNMEASURED.** The probe used a promoted-list endpoint, which is biased toward traction, **not a random sample of births.** Whether it indexes ~all launches is unknown.
- **Latency: UNMEASURED, and it is the one that bites** - our 1h checkpoint and OBJ-2's discovery lag both sit inside it.
⇒ DexScreener remains a **secondary cross-check**, and the reason is now *coverage and latency unmeasured*, **not** the false capability claim.

#### A2.3 - CONTROL GROUP: BOTH POPULATIONS STATED (CONDITION 3)

A1.3's *"45,000 controls -> ~75 expected events"* is across the **full 90 days**. §8.2 evaluates on the **later half only**, so the **operative control for the primary out-of-sample test is ~22,500 -> ~37 expected events.**

**500/day still stands** - the carrier arm is event-rich, so ~37 non-carrier events bound the base rate adequately against A1.5's 2.0x threshold. **Both figures are recorded because a single number without its population is the exact failure this document polices, and I had written the flattering one.**


### AMENDMENT 3 - 2026-08-28, STILL PRE-DATA (Langston Step-4 conditions on items 1 and 2)

> **Appended, not edited. Sections 1-10 and AMENDMENTS 1-2 stand exactly as written.**
> ⚠️ **PRE-DATA VERIFIED AT THE OBJECT, not assumed:** `/var/lib/token-watch` does not exist on the collector host and no `token-watch*` unit is installed. **No row has been collected.** This is the last moment at which a change here is a design decision rather than a re-interpretation of a result.
> ⛔ **A DIFFERENT "AMENDMENT 3" WAS PROPOSED AND WITHDRAWN BEFORE IT LANDED** - a 12-point superset observation grid. Kyle withdrew the *requirement* instead of accepting the amendment (*"three and seven days are fine"*), so **the grid has never been amended and section 6 stands unchanged.** That proposal is recorded in the Step-2 document; it never entered this one. **This is the first amendment to bear the number.**

#### A3.1 - THE TRAIT DEFINITION IS PROVISIONAL PENDING EXTRACTION VERIFICATION

**Langston's Step-4 condition, and his reframing is the load-bearing part.** I had put forward the *threshold* as the weakest thing in the batch. He agreed it was weak and pointed out I was **attacking the recoverable half**: `initial_size` is persisted on every birth row, so if the platform default is really 0.5 or 2.0 the split can be re-derived at analysis time and amended honestly.

⛔ **WHAT IS NOT RECOVERABLE IS THE MEASURAND.** Section 4 fixes `initial size` as a predictor. It does not say **which quantity that is**, and the code's extraction of it has never been verified against a real provider payload - the "verified against a real token" evidence covers the event-type filter, not this field. **If the extracted number is a platform fee or account rent rather than the creator's own buy, then every token records a near-constant value, the size limb of the trait definition fires for everyone or for nobody, and it does so silently with a plausible number attached.**

★ **AND THE FAILURE HAS A DIRECTION.** An unresolvable size collapses to *not a carrier* and lands the token in the ~3% control arm - so an **extraction failure would be indistinguishable from a genuinely small launch**, and the bias runs one way.

⇒ **THE TRAIT DEFINITION IN SECTION 4 IS HEREBY MARKED PROVISIONAL** in its size limb. It becomes final only when all three hold, in this order:
1. The extraction selects the creator's own transfer **by role, verified against captured real creation events** - not by position and not by first match. *(Both of those were tried and both were wrong; the current code takes the largest transfer from the fee payer and records `size_source` on every row.)*
2. An unresolvable size is recorded as **null with its `size_source`**, so a failure is loud rather than silently becoming a non-carrier.
3. **Only then** is the platform default set from the first day's observed distribution, **by a further dated amendment**.

⛔ **THE ORDER IS NOT NEGOTIABLE, and Langston's reason is why:** setting the default before the measurand is verified *"measures the wrong thing precisely."* **Until (1) and (2) are evidenced in the Phase-3 proving run, no analysis may report the size limb as a pre-registered predictor.** The social-channel limb is unaffected and remains final.

⚠️ **AND THE PROVENANCE IS STATED PLAINLY: the threshold value is MINE, not the literature's.** Section 3's protection - *a threshold set before our cohort existed cannot have been fitted to it* - **does not attach to it.** That argument protects figures imported from published work. This one was set before our cohort existed **by the person who will analyse it**, which buys none of that.

#### A3.2 - OBSERVATION TIMING: NOMINAL AGE IS A LABEL, TRUE AGE IS THE DATUM

**Langston's item 2, and my stated bound was wrong.** I claimed the 1h checkpoint bounded the exposure of the death-classification ambiguity. **It does not, because the observation does not happen at one hour.**

**MEASURED against the shipped scheduler and timer.** The job reads a whole hour-bucket at the top of the hour, while the entries inside it fall due at different minutes. True age at observation, for tokens born at :02, :10, :30, :55 and :59:

| born at | nominal age | TRUE age observed |
|---|---|---|
| :02 | 60 min | 60 min |
| :10 | 60 min | 52 min |
| :30 | 60 min | 32 min |
| :55 | 60 min | **7 min** |
| :59 | 60 min | **3 min** |

⛔ **EARLY IS WORSE THAN LATE, AND NOT SYMMETRICALLY SO.** With 68.67% dying on day one, a token read at three minutes looks alive - **and the entry is then consumed, so the real one-hour checkpoint never happens.** The observation is not merely noisy; it is spent.

**FIXED IN CODE, not documented around:** an entry that is not yet due is **re-queued to the next bucket** rather than observed. ⇒ **observations are LATE-BUT-NEVER-EARLY**, with true age falling in roughly `[nominal, nominal + 1h]`.

⇒ **PRE-REGISTERED NOW, so it cannot be chosen later:**
1. **The analysis uses TRUE age**, computed from `created_at` and `observed_at`, **never the nominal label.** The grid label identifies which checkpoint a row belongs to; it is **not** a measurement.
2. **Cohorts pool on the LABEL** - which is what section 6's fixed-ages requirement is for - **while every survival computation uses the true age.** These are different roles for the same row and were previously conflated.
3. **The true-age distribution is reported at read-out**, per checkpoint, as a stated property of the instrument rather than a footnote. If it is materially wider than `[nominal, nominal + 1h]`, that is an instrument finding and is reported as one.

⚠️ **A THIRD MECHANISM FOR THE SAME ONE-DIRECTIONAL BIAS, recorded because Langston found it and I had not:** the prior-sighting state the death classifier relies on is written once per run, so an exception escaping the per-token handler loses that hour's prior sightings while the observations are already on disk - and next hour a genuine liquidity pull reads as unclassified. **Same under-count, third route.** The per-age unclassified counts are now persisted, so the residual is **quantified rather than described**.


### AMENDMENT 4 - 2026-08-28, STILL PRE-DATA (Langston Step-4 r2, condition 3)

> **Appended, not edited. Sections 1-10 and AMENDMENTS 1-3 stand exactly as written.**
> ⚠️ **PRE-DATA RE-VERIFIED AT THE OBJECT, not carried over from AMENDMENT 3:** `/var/lib/token-watch` still does not exist on the collector host and no `token-watch*` unit is installed. **No row collected.**

#### A4.1 - THE REALISED AGE OF EACH CHECKPOINT, MEASURED AND PRE-REGISTERED

**AMENDMENT 3 established that observations are late-but-never-early. Langston's condition is that *recoverable* is not the same as *comparable to the published hazard*, and he is right — so the distribution is stated here BEFORE data exists rather than discovered at read-out.**

**MEASURED over all 60 birth-minutes x the timer's 0-5 minute jitter (n=360), for the `1h` checkpoint:**

| | minutes |
|---|---|
| minimum | **60** |
| 25th percentile | 75 |
| **median** | **90** |
| 75th percentile | 105 |
| maximum | **119** |
| **mean** | **89.5** |
| **observations EARLIER than nominal** | **0** |

⇒ **the `1h` label's realised age is uniform on roughly [60, 120] minutes, mean ~90 - a +49% overshoot** on the grid point that carries the day-one signal, where **68.67%** of the cohort dies. The same mechanism applies at every checkpoint, but the *proportional* distortion falls away with age: +49% at 1h, ~+2% at 3d, and under 0.1% at 90d.

⛔ **PRE-REGISTERED CONSEQUENCES, so none of these can be chosen after the fact:**
1. **The `1h` checkpoint is reported as a `[60, 120] min` window, never as "1 hour".** Any comparison against a published 1-hour hazard states this and is labelled **not directly comparable**.
2. **The analysis uses TRUE age** (A3.2) - this amendment does not change that; it bounds the label's meaning for the reader who sees only the grid.
3. **The realised distribution is reported at read-out** alongside the discovery-lag distribution, as a property of the instrument.

#### A4.2 - WHY THE SWEEP IS NOT RUN FINER, STATED AS A JUDGEMENT RATHER THAN A CONSTRAINT

**Langston offered the alternative: run the `1h` leg finer than hourly. Follow-ups cost zero credits and we sit under 5% of the provider's rate limit, so cost is not the obstacle — and he said so.**

⛔ **I AM NOT TAKING IT, AND THE REASON IS THIS BATCH'S OWN MEASURED PATTERN.** A sub-hourly sweep requires **consumption tracking**: the job would re-read the same bucket several times an hour, so it needs to know which entries it has already observed. That is new state, a new writer, and a new way for "already observed" and "never observed" to become indistinguishable - **the exact failure class this batch has now produced five times**, most recently in the catch-up limb where "no unread buckets" and "read this hour again" collapsed into one path.

★ **A +49% overshoot that is MEASURED, BOUNDED and PRE-REGISTERED is a weaker instrument than a 15-minute sweep. An unmeasured consumption-tracking bug is a CORRUPT one.** Given that the deliverable is the machinery rather than the token result, I take the weaker-but-honest instrument.

⚠️ **AND THE DECISION IS REVERSIBLE ON EVIDENCE, WITH THE TRIGGER NAMED NOW:** if the read-out shows the `1h` leg is materially less informative than the published comparator - i.e. if H1/H2 reproduce at 6h and later but NOT at 1h - **that is an instrument finding under §8.1, and the sweep granularity is the first thing to change.** It is a stated hypothesis about our own instrument, not an open question we will re-litigate from taste.

### AMENDMENT 5 - 2026-08-31, STILL PRE-DATA (the census is empty; the feed is not yet connected)

**DISCHARGES THE RISK NAMED IN THIS DOCUMENT AS UNRECOVERABLE.** Section 10 stated: *"the code's extraction of [initial size] has never been verified against a real provider payload - the 'verified against a real token' evidence covers the event-type filter, not this field. If the extracted number is a platform fee or account rent rather than the creator's own buy, then every token records a near-constant value, the size limb of the trait definition fires for everyone or for nobody, and it does so silently with a plausible number attached."**

**MEASURED, 2026-08-31, against 8 REAL creations pulled from the launchpad program with the provider's own `type=CREATE` filter, run through the PRODUCTION parser (`receiver.parse_creation`):**

| | result |
|---|---|
| creations parsed | **8 of 8** — none refused |
| size resolved | **8 of 8** — zero `unresolved` |
| distinct values | **8 of 8** |
| range | **0.01 to 3.457 SOL** |
| `size_source` | `feePayer_largest_of_10` … `_of_12` — every creation carries **10-12** creator transfers |

⇒ **THE VALUES ARE NOT NEAR-CONSTANT, so the extractor is reading the creator's own buy and not a fee or rent.** The named failure did not occur.

⛔⛔ **AND THE COUNTERFACTUAL IS THE PART THAT MATTERS, because it measures how close this came to happening.** The pre-fix code took `nativeTransfers[0]`. Against the same 8 real creations, the first creator transfer would have recorded **0.0000000010, 0.00001, 0.0022, 0.00251952, 0.00251952, 0.003, 0.008, 0.03 SOL** — **wrong in 8 of 8.**

★ **EVERY ONE OF THOSE WRONG VALUES IS BELOW `PLATFORM_DEFAULT_SIZE` (1.0 SOL). The size limb of the trait definition would therefore have fired for NOBODY**, the study would have degraded to socials-only, and it would have done so silently with a plausible number attached — which is precisely the sentence above, realised. The fix from position-0 to largest-creator-transfer was load-bearing, and this is the first evidence of it against real data rather than synthetic events.

⚠️ **WHAT THIS DOES NOT DISCHARGE, STATED SO THE AMENDMENT IS NOT READ AS WIDER THAN IT IS:**
- **n = 8.** It refutes *near-constant*; it does not establish the DISTRIBUTION of launch sizes, and no rate in this study may be computed from it.
- **`PLATFORM_DEFAULT_SIZE = 1.0` REMAINS MY ASSUMPTION, NOT THE LITERATURE'S.** 3 of these 8 sit above it and 5 below, which is the first real-data signal that the threshold splits the population at all rather than degenerately — but 8 observations cannot calibrate it, and **AMENDMENT 3's PROVISIONAL marking on the trait definition STANDS UNCHANGED.**
- The sample is 8 consecutive creations from one moment, so it carries whatever composition that moment had.

### AMENDMENT 6 - 2026-08-31, POST-FEED. THE CENSUS WAS RESET TO MAKE IT PRE-DATA AGAIN, AND THAT IS THE POINT

⛔⛔ **THIS AMENDMENT IS NOT PRE-DATA IN THE ORIGINAL SENSE AND MUST NOT BE READ AS IF IT WERE.** The feed went live at 05:12Z and 4,381 launches were recorded before this change. **The census was RESET rather than carried forward**, so the study's DATA is once again wholly downstream of its design — but the reset itself is a fact this document is obliged to carry.

**WHAT WAS ARCHIVED, NOT DELETED:** `/root/token-watch-preswitch-archive-2026-08-31` on staging — births 4,381 · raw provenance 4,381 · follow-up payloads 2,771 · observations 963 · deaths 7 · social checks 1,885. Read back and confirmed non-empty before the reset.

**WHY:** two design defects were found by the first hours of real traffic, and fixing either mid-stream would have left a permanent seam in hour four of a ninety-day study.

#### (a) THE SOCIALS LIMB WAS STRUCTURALLY DEAD (`#973`)

Section 4 defines a trait carrier as *"any advertised channel OR initial size above the platform default."* **MEASURED on 116 real launches: ZERO carried any channel, and the carrier count equalled the above-threshold count EXACTLY.** The provider's creation event has no social fields — both branches the parser reads are empty on every real payload, `events` is an empty object, and the handles live in the token's off-chain profile. **The first limb could never fire, so the definition in force was size-only.**

★ **The document predicted this SHAPE and got the half wrong.** Section 10 warned an extraction break would make *"the size limb switch off silently"* leaving socials-only. **The reverse happened.**

⇒ **RESOLVED, AT NO COST.** The follow-up provider we already call returns the channels in its `info` block — verified on a token 12 minutes old, the age at which we check. ~43k requests/day against a 432k/day ceiling and **zero credits**. Nothing is rationed and no launch is excluded.

#### (b) THE CONTROL ARM WAS DRAWN FROM THE WRONG POPULATION

`follow_decision` tested the carrier limbs first and drew the random control from the remainder. **But at birth SIZE is the only knowable fact, so "the remainder" meant "not big enough" — which is NOT "not a carrier."** A control token later found to have a channel is **a carrier inside the comparison group**, biasing every reported rate silently.

⛔ **MY PROPOSED FIX WAS TO RECLASSIFY SUCH TOKENS. KYLE REJECTED IT AND HE WAS RIGHT:** do not make the wrong assignment and then correct it — do not make it yet. *A logged reclassification is honest and still an artifact a reviewer is right to distrust; a single assignment made once has nothing to explain.*

⇒ **THE ASSIGNMENT RULE, AS NOW IN FORCE:**
| at | what happens |
|---|---|
| **birth** | size above the platform default ⇒ `trait_carrier`, followed immediately and **never reconsidered** (size is final). Everything else ⇒ **`deferred` — recorded in the census, in NO arm.** |
| **first hourly sweep** | channels fetched. **ONE arm assigned, for good:** `trait_carrier` if any channel, else the control draw over **confirmed non-carriers** ⇒ `control_sample` or `not_sampled`. |
| **ever after** | **nothing moves.** A resolved token is never re-examined, even if its channels later change. |

⚠️ **THE COST, STATED RATHER THAN GLOSSED: a deferred token starts being observed ~1h later than a size-carrier, so the arms carry different left-truncation.** That is unavoidable without a sub-hourly sweep, which **AMENDMENT 4 rejected on measured grounds**, and it is now **MEASURED, not unknown** — every socials check records `observed_at_age_s`, so the analysis can condition on it.

⚠️ **AND `socials` IS NOW *OBSERVED AT FIRST CHECK*, NOT *AT LAUNCH*.** A token can add a channel on day three. The field carries the age it was taken at, and no analysis may read it as a birth characteristic.

#### WHAT IS UNCHANGED, SO THE AMENDMENT IS NOT READ AS WIDER THAN IT IS

The observation grid, the death definitions, the census-on-birth rule, `PLATFORM_DEFAULT_SIZE`, and `CONTROL_INCLUSION_P` are all **untouched**. ★ The control's realised inclusion rate is still logged daily and **the analysis uses the log, not the constant** — a decision made before any data, and the reason the drawn rate differing from the planned one is self-correcting rather than a defect.

