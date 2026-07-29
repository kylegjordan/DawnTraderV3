# AMR viability — four-way consensus ask (Kyle-directed 2026-07-30)

**Convened by:** CC-B · **Participants:** Langston + CC-A + CC-C + CC-B · **Decider:** Kyle
**Kyle's authorisation:** *"I need you, Langston, and the other two sessions to iterate to consensus based on what the math would tell us. What is best?"* → then **"Please proceed."**
**Why a panel and not the §27 default:** cross-cutting architecture, binding on other sessions' batches, and a question about whether a whole subsystem is viable. This is the case where a four-way earns its cost.

---

## 0. Kyle's question, in his words — do not answer a narrower one

> *"Can the AMR do its job properly and properly classify conditions as favorable without all the information it's currently set up to take in? Are we able to give them the proper classification with the data that we currently have coming in and the quantity of data coming in? … we need this classification system to be able to work off of what our system is bringing in, not what it ideally could bring in. So far, it seems like we have a system that is never gonna work because we don't have the data to pull it off. Does that mean that the system just will never work the way that it's designed, or any system like this can never work because we don't have enough data flowing in? Or have we just set our standards up too high?"*

And explicitly: **is there real-world/industry practice we should model off or learn from**, and **would loosening the VTS filters to manufacture volume "give us unrealistic junk that taints our learning data"?**

---

## 1. THE FIVE INPUTS (live values, `module_constants` where `module_name='amr_weather_rules'`)

| input | weight | what it measures | health today |
|---|---|---|---|
| **friction** | **0.30** | round-trip trading cost, 0-100 | ✅ flowing · crypto p50 **54**, min ever **43** |
| **DBS** | 0.20 | directional-bias strength | ✅ flowing (`dbs_null = 0` across the ledger) |
| **EV-gap** | 0.20 | **predicted vs realized** — the calibration-honesty term | ❌ **present on 2.17% of crypto cycles** |
| **regime flips** | 0.20 | regime churn in the window | ✅ flowing |
| **macro** | 0.10 | max abs macro z | ✅ flowing (893 nulls of 134,595) |

**Score** = Σ(w·fav)/Σw · **`favorable_min_score` = 0.70** · thresholds per class (crypto friction choppy/stormy **40/60**, xstock **45/70**).
★ **ALL FIVE ARE REQUIRED:** `amr-weather-report.ts:280-281` — `if (parts.length < 5) score = Math.min(score, favorable_min_score − 0.001)` ⇒ **a missing input clamps the score to 0.699, strictly below the boundary. FAVORABLE becomes arithmetically unreachable.** Fires on **94.6%** of crypto cycles.

---

## 2. ★ THE FINDING THAT REFRAMES THE WHOLE DECISION — IT IS NOT A DATA-VOLUME PROBLEM

`ev_gap_window_n` = **100 (crypto) / 30 (xstock)**, used as BOTH ring capacity (`:159`) and emit-minimum (`:167`).

**It is not 100 trades per day. It is 100 accumulated in a rolling window that never self-resets.**
- Observations reaching the feed: **~60/day** (measured — `[B67.4][feedback]` enumeration, and `PERSIST 60 = feedback 60` on 07-27).
- ⇒ **at 60/day the window fills in under two days and then stays full permanently.**
- ⇒ **BUT `evGap: []` (`:126`) is an in-process array with NO persist and NO rehydrate path** (grep-confirmed both sides) ⇒ **every deploy or restart zeroes it.** Measured sawtooth: `min = 0` on **19 of 21 days**; mean fill **17.7/100**.

⇒ ★★ **THE SHORTAGE IS NOT OF TRADES. WE KEEP ERASING THE COUNT.**
⇒ **This dissolves the two options Kyle was being asked to weigh**, and he should not have to choose between them:
- ❌ **loosening VTS filters to manufacture volume** — his own instinct is right, it risks junk that taints the learning data, and it is **unnecessary** if the window persists;
- ❌ **lowering `ev_gap_window_n` 100→30** — the seeds were **captured from measured distributions** (`ed9be95cd`: *"~140 provenance-commented seeds (friction/DBS distributions captured pre-seed per Pull-in B)"*), so it is not a free knob;
- ✅ **persist the window across restarts** — precedent exists in-tree: `outcome-feedback-store.ts` writes itself to `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json` via `fs.writeFileSync` (`:291`).

---

## 3. WHAT THE PANEL MUST RULE ON (the maths, not the vibe)

**Q1 — Is persistence sufficient?** At ~60/day accumulating, does the window reach and hold 100? **What is the actual mean uptime between deploys?** If we deploy more than once per ~40h, persistence alone may still not hold it. **Measure, don't assume.**

**Q2 — Once the fifth input is PRESENT, does the score behave sensibly, or does friction alone still pin it?** ★ This is the question that decides whether the design is viable at all, and it is **arithmetic we can do now**:
- crypto friction p50 **54** ⇒ `fav_friction = 0.5·(1 − (54−40)/20) = 0.150` ⇒ contributes `0.30 × 0.150 = 0.045`
- ⇒ **ceiling with all four others perfect = 0.045 + 0.70 = 0.745.** Above 0.70, but the headroom is **0.045**.
- ⇒ **friction alone consumes 85% of the entire imperfection budget between a perfect score and the boundary.**
- ⇒ **SO: even with all five inputs healthy, FAVORABLE requires the other four to be NEAR-PERFECT.** **Is that a correctly-calibrated bar, or is it a bar nothing will ever clear?** ★ **This, not the missing input, may be the real viability question — and it is the one nobody has asked yet.**

**Q3 — Is "refuse when an input is missing" the right design at all?** Our system **refuses to classify** on partial evidence. Much of the field instead **classifies with a widened uncertainty band** and lets downstream sizing shrink accordingly. **These are genuinely different philosophies**, and ours has the property that a single starved input silently pins the output — **which is what happened for seven weeks and read as "conditions are bad" rather than "we don't know."** ⇒ **the failure mode of refuse-on-missing is that it is INDISTINGUISHABLE from a confident negative.**

**Q4 — Industry practice: what should we model off?** Named so nobody hand-waves: warm-up/burn-in handling for rolling calibration estimates; shrinkage toward a prior while a window fills (empirical-Bayes — already raised in `ITEM_4_STORAGE_AND_LEARNING_DESIGN.md` §6 ask 3 and NOT closed); regime-classification confidence bands; and implementation-shortfall practice for the friction term. **★ The specific question: is there a standard treatment for "estimate not yet warm" that is neither refuse nor pretend?**

**Q5 — Kyle's junk-data worry, answered on the maths:** if volume ever IS needed, does loosening VTS filters bias the learning population? ⇒ **it must** — the VTS population would then include trades the live filter would reject, so its realized distribution stops being a sample of what we would actually trade. **§B.8 already flagged this shape** (*"blending toward the broad simulator average would quietly penalize the real pipeline"*). **Recommend against, and say why on the numbers.**

---

## 4. CC-B's position, offered to be argued with

**The design is NOT unworkable, but it has never actually been tested.** Four inputs are healthy; the fifth is starved by a persistence bug, not by data scarcity. ⇒ **fix persistence first (cheap, no threshold change, no filter change), THEN judge viability on Q2** — because until the fifth input is present, *every* judgement about whether the score is well-calibrated is unfalsifiable.
⚠️ **But I hold this loosely and Q2 is why:** if friction structurally leaves only 0.045 of headroom, the AMR could have all five inputs and still never reach FAVORABLE — in which case the honest answer to Kyle is **"the bar is wrong,"** not "the plumbing was broken." **I do not know which yet, and I would rather say so than pick.**

## 5. Standing constraints on this panel
Rule 24's three outcomes; rule 24.a (announce symptoms freely, causes only after testing reach); §9.5(a) census; **CLAUDE.md §2 1.b provenance + the FIVE dispositions** with Langston's amendments — **quote intent verbatim, name the corpora, and mark inference `INFERRED-FROM-CODE`.** Nothing here proposes code; this is a design consensus for Kyle's decision.
