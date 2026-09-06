# ASSIGNMENT 3: WHAT IS STOPPING THIS SYSTEM FROM DOING WHAT IT IS FOR (r3)

> **r2 rewrote r1 on Kyle's direction.** Three things changed and they change the character of the assignment: the **lens** (§1), the **repo copy** — which dissolves the reason two questions were excluded (§2) — and the **removal of the design annex** in favour of designs as a separate next step (§8).

---

## 1. ⭐⭐ THE LENS — READ THIS BEFORE THE QUESTIONS. IT IS NOT PREAMBLE.

**Everything below is asked in service of ONE question, and Kyle has stated it directly:**

> ### **What is going on in this system that is preventing it from achieving what it is intended to do?**

**THE INTENTION, in his words, because the audit has to be measured against the real target and not a modest one:** an autonomous trading platform that is **more profitable than any retail trading tool available, and more profitable than in-house trading-firm systems.** **Professional grade.** Returns as **large**, as **fast** and as **frequent** as possible — **a high win rate as well as a high profit rate.** The bar set as high as it can be set. **The purpose of the whole thing is to build wealth for Kyle and his family.**

⇒ ⛔ **SO THE FOUR QUESTIONS BEHIND EVERY SECTION ARE:**
> **What are we MISSING? · What are we doing that is RIGHT? · What are we doing that NEEDS IMPROVEMENT? · What are we doing that is WRONG?**

⛔⛔ **AND A CORRECTION TO HOW A PREVIOUS DRAFT OF THIS BRIEF FRAMED YOUR ROLE, because it was wrong and Kyle said so:** an earlier revision told you to **state divergence loudly**. ⛔ **That is not what is wanted.** You are **not** here to prove the current build crew wrong, and disagreement is not the product.
✅ **YOU ARE HERE TO FIND WHAT IS MOST CORRECT.** In his words: *"with all this stuff there are multiple options, and many of them can be right in their own way, to lesser or greater degrees. What I want is the best and most correct answer for what we are trying to do."*
⇒ **Where you agree with the existing design, SAY SO and say why — that is a finding of equal value to a defect** (question two of the four). **Where several approaches are defensible, rank them against the intention above and say which is best and what it costs.** Where we are wrong, say that plainly. **The measure is always: does this get us closer to the intention, or further from it?**

★ **AND ONE ANSWER MUST ALWAYS BE AVAILABLE TO YOU, ranking equally with the rest: `STRUCTURAL CONSTRAINT — NOT A DEFECT`.**
⛔ **IT CARRIES THE SAME EVIDENCE BUNDLE AS EVERY OTHER FINDING — object, population, method, evidence-against, confidence, falsifier — PLUS ONE MORE: WHAT WOULD HAVE TO CHANGE FOR IT TO BECOME MOVABLE.** Without that last field it is an exit rather than a finding, and an exit is precisely what a hard question attracts. If something limits returns and is **not fixable by us** — a venue cost floor, a market-microstructure reality, an information limit — **say that, and size it.** ⛔ **An audit conducted against a very high bar can be pushed into manufacturing optimism, and a constraint reported as a defect sends people to work on something that cannot move.** Naming a real wall accurately is worth more than a hopeful fix.

---

## 1.b ⛔⛔ HOW TO ANSWER §2.b AND §3 — TWO STAGES, AND THE ORDER IS THE POINT

**§2.b and §3 both hand you OUR current reading before asking you to check it.** That is deliberate — Kyle wants your eyes on a live debate rather than a sanitised one — **but it ANCHORS you, and under §1 agreement is now a first-class finding.** ⇒ ★ **An ANCHORED agreement is indistinguishable from a DERIVED one, and we would have no way to tell which we got.**

✅ **SO ANSWER BOTH IN TWO STAGES, IN ONE DELIVERABLE:**
1. **STAGE A — derive it yourself first, from the code and the data, WITHOUT reference to our proposal.** Write that answer down before you read ours.
2. **STAGE B — then read our reading and critique it.** Where you agree, say whether Stage A had already reached it. Where you differ, say what we missed.

⛔ **Report BOTH stages.** *“Stage A reached the same place independently”* and *“Stage A did not consider this and I think you are right”* are **different findings carrying different weight**, and only you can tell us which one happened.

---

## 2. ✅ YOU NOW HAVE A REPO COPY — WHICH RESTORES TWO QUESTIONS AND CHANGES YOUR OBLIGATIONS

**r1 excluded two subjects on the grounds that you had no access to the history and intent behind them.** **Kyle overruled that, correctly: with a repo copy you HAVE the history — you just need to know where to look.** So the exclusion is lifted and the obligation replaces it.

### 2.a WHERE THINGS LIVE — the map, so "I could not find the history" is not available as an excuse

| what you want | where it is | ⛔ |
|---|---|---|
| **Current architecture + the maths** | `1-system-manual/SYSTEM_MANUAL.md` | Chapters + a table of contents at the top. **Read its "how to read & maintain" note first.** |
| **Component wiring, upstream/downstream, shared state** | `1-system-manual/SYSTEM_IMPACT_MAP.md` | Per-batch history is archived at the **bottom**; the live map is the top. |
| **Every open and closed issue** | `1-system-manual/RUNNING_ISSUES.md` | Numbered `#NNN`. **The single most useful file in the repo for you.** Search it before filing anything. |
| **What each batch did** | `1-system-manual/BATCH_CATALOG.md` + `Claude Comms and Packages/Batch Completion/` | The catalog is the index; the completion reports are the detail. |
| **What is planned and in what order** | `1-system-manual/PHASE_19_PLAN.md`, `POST_AUDIT_ROADMAP.md` | **In-flight work lives here.** Check before proposing something already queued. |
| **Scopes + pre-audits for work in progress** | `Claude Comms and Packages/Scope Files/` | Includes this brief and the two before it. |
| **The venue's own fee contract** | `1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md` | ⛔ **Take fee figures from HERE, never from our code or database.** |
| **The rules the crew works under** | `CLAUDE.md`, `CONDUCT.md` | Useful for understanding *why* a decision was made the way it was. |
| ⛔ **ARCHIVE — NOT CURRENT TRUTH** | `1-system-manual/_archive/`, `bridge/canonical/`, `Archived Reports - Pre-Phase 12 Governance Implementation/`, the bottom sections of the SIM | ⛔⛔ **`bridge/canonical/` is the PRE-GOVERNANCE corpus. The architecture has changed COMPLETELY since. Its value is ORIGINAL INTENT — why something was built as it was — and it is NEVER evidence of current behaviour.** |

⛔⛔ **THE OBLIGATION THAT COMES WITH THE ACCESS: BEFORE FILING ANY BEHAVIOUR AS A DEFECT, SEARCH THE LEDGER AND THE BATCH REPORTS FOR THE COMPONENT *AND* THE SYMBOL.** A deliberate, reviewed, Kyle-approved decision reported back to us as a defect is **worse than no finding** — it burns review time and impugns work that was done correctly. **State the search outcome, including a NOT-FOUND, and show a positive control** — a search that returns nothing proves nothing until you have shown the same search returning something.
★ **AND WHEN A CODE COMMENT NAMES ITS OWN PROVENANCE — a batch id, an issue number, "Langston-approved" — FOLLOW IT.** Do not read it and move on. That pointer is the history.

### 2.b THE TWO SUBJECTS RESTORED
Both were found by you or by your predecessor session and both are now scoped as our own work — **which is exactly why your read is still worth having, now that you can check our reasoning rather than guess at it.**
- **The DHMA volatility-units defect.** Its stop and target add `k × σ` to a price where σ is a **standard deviation of fractional returns**, i.e. dimensionless. Confirmed at the code and against live settings (`k_tp = 1.5`, `entry_premium_mult = 1.001`, one scope, no per-symbol override). **Our reading is that its target can only clear its own entry for instruments priced under roughly $1.50.** ⇒ **Check that reading, and tell us what the RIGHT volatility object is** — the history is in the repo.
- **The strong-trend lane.** ⚠️ **Deliberately NOT given a conclusion-shaped name — an earlier revision called it “reachability”, which hands you the answer. Work out what the question is.** We measured zero `strong_bull_trend` evaluations on the active/paper lane across two days while the passive lane evaluated thousands, and the pre-filter routed 53,121 pairs into that family on the active lane the same day. ⚠️ **Our own measurement has a stated hole: the active lane records no internal-rejection rows for ANY strategy, so "zero rows" may mean "not recorded" rather than "not run."** **The history of how that lane was built is in the batch reports.**

---

## 3. ⭐⭐ THE NEW QUESTION KYLE ADDED — WHICH PRICE, FOR WHICH JOB, AND HOW FRESH MUST IT BE

**This is a LIVE, UNRESOLVED internal debate. Kyle wants your eyes on it while it is being decided, not after.** It is not a defect hunt; it is a design question we have not settled.

**THE SITUATION.** A price does at least four different jobs in this system: **generating a signal** (where the entry, stop and target levels get set), **ranking candidates**, **triggering an action** (a stop or target being hit), and **booking a result**. ⛔ **We currently use the MIDPOINT for all four**, and because it is built at the feed layer, both asset classes and both trading modes inherit it.

**The proposal under debate:** where a price only *estimates value*, the midpoint is right; where it **becomes a level, fires an action, or is recorded as a result**, it should be the side you could actually transact on. ⛔ **And per-leg: an entry is a BUY on the ask, a stop and a target are SELLS on the bid — opposite by construction, so the error is a FULL SPREAD, not half of one.**

**THE OTHER HALF, AND IT IS THE ONE KYLE MOST WANTS LOOKED AT — WHAT A TIMESTAMP ON A PRICE ACTUALLY MEANS HERE:**
⛔⛔ **MEASURED AND CONFIRMED IN OUR OWN CODE, ON BOTH CLASSES — and the SCOPE of the claim matters, so read the qualifier below it:**
- **xStock:** `server/services/passive-archive/equity-spot-archiver.ts:127` — *“Our receipt time for THIS frame (the venue's ticker frame carries no timestamp)”*, issue `#943`.
- **Crypto:** the ticker frame type `KrakenV2TickerUpdate` (`server/services/market-data/kraken-v2-translator.ts:13-31`) declares **18 fields and NOT ONE is temporal**; the adapter stamps `Date.now()` (`server/exchanges/kraken/kraken-websocket-adapter.ts:714`).
⇒ **every age we compute is measured from OUR RECEIPT, not from when the price occurred at the exchange** — receipt time includes network transit, queueing and our own processing.

⚠️⛔ **THE REACH, STATED SO YOU DO NOT OVER-GENERALISE IT: THIS IS THE *TICKER* CHANNEL.** Kraken's **trade** channel does carry a per-trade venue timestamp. **“No venue clock exists anywhere” would be FALSE** — the true statement is that **the channel we currently price from does not carry one.** *(A live input to the questions below, not a pre-empted answer.)*
*(An earlier revision cited only the xStock file and generalised from it to both classes. The claim survives on both — but a one-class citation for a two-class claim is the adjacent-object error this project keeps retracting, and §3.4 forbids pooling the classes in the same breath.)*

✅ **AND ONE CAPABILITY THIS SECTION PREVIOUSLY UNDERSTATED: on the CRYPTO leg the raw venue SIDES ALREADY TRAVEL** — `bid`, `ask` and `sidesCapturedAtMs` are emitted alongside the mid (`kraken-websocket-adapter.ts:768-776`, dated 2026-09-05). ⇒ **for crypto, question 3 below is about USE, not ACQUISITION.** ⚠️ **Deploy status UNMEASURED — we have not confirmed it is live on the box. Treat it as present in code, unknown in production.**
⇒ ⛔ **CONSEQUENCE WE HAVE NOT RESOLVED: our freshness machinery cannot distinguish "the venue is quiet" from "our feed is lagging."** We run staleness ceilings, we skip exit checks when a mark ages past one, and we raise alerts on it — **all keyed to a clock that is ours, not the venue's.**

**WHAT WE WANT FROM YOU ON THIS:**
1. **Which price should do which job**, and why — judged against the intention in §1, not against elegance.
2. **What a receipt-time-based age can and cannot support.** Which of our freshness decisions are sound on that clock, which are not, and what would have to change. **If the honest answer is "you cannot know staleness without a venue timestamp," say so and say what the second-best estimator is.**
3. **Is there a better available source** — the order book, trade prints, anything else the venue publishes — and what does it cost in latency, complexity or coverage?
4. ⚠️ **Crypto and xStock differ structurally and must not be pooled.** A crypto tick is the venue's published statement; an xStock increment is inferred by us.

**Read `RUNNING_ISSUES` `#943`, `#952`, `#941` and the `B-PRICE-SIDE-BY-JOB` plan row before answering. This debate has history and it is written down.**

---

## 4. WHAT WE ALREADY FOUND AND FIXED SINCE YOUR LAST ASSIGNMENT — SO YOU DO NOT RE-FIND IT

⭐ **YOUR FINDING 1 WAS RIGHT AND IT PAID.** You asked whether our fee model is externally identified and **refused to rule without authenticated evidence.** That refusal is why we looked.

| | our model held | Kraken charges, **account-confirmed** |
|---|---|---|
| `xstock_spot` taker | `0.008` | **`0.0010`** — **8× too high** |
| `xstock_spot` maker | `0.004` | **`−0.0002`** — **a REBATE; our sign was inverted** |
| `crypto_spot` both | `0.008 / 0.004` | ✅ **correct** — spot rung 1, confirmed |

**A taker/taker xStock round trip: we modelled 1.60 %; the real figure is 0.20 %.** The xStock rows were byte-identical to the crypto rows, same timestamp, same author. **The correction is in flight, not yet deployed.**

⛔⛔ **THE PART THAT CONSTRAINS THIS ASSIGNMENT: OUR SELECTION HISTORY IS CONTAMINATED.** The gate deciding which candidates are admitted is computed from those rates, so **every xStock candidate for three months was admitted or refused against roughly eight times the real cost.**
- ✅ **Cost is recomputable** from primitives.
- ⛔ **Selection is not.** A refused candidate was never simulated. **There is no counterfactual to recover.**
- ✅ **NO FEE REACHES A LEVEL — and this is the precise version, because the loose one is false.** `normalizeAndGateTarget` takes entry, stop, target, floorPct, minRR, atr and reachAtrMax and **no cost input at all** (`signal-orchestrator.ts:1904-1908`, `signal-target-normalizer.ts:69`); `computeNetGeometry` returns **`executionStop = baseStop` and `executionTarget = baseTarget`, UNCHANGED** (`cost-model.ts:327-328`). **Fee enters only `totalCost` → `netExpectedEdge` / `netRewardToRisk`, which are GATE and RANKING inputs.**
- ⚠️⛔ **BUT THE ENTRY LEVEL *IS* COST-ADJUSTED, so “fee-free” without this carve-out is wrong: `executionEntry = baseEntry × (1 + slippage + spread/2)` (`cost-model.ts:326`)** — not by fee, by **slippage and half-spread.**
- ⇒ ⛔⛔ **THAT LANDS ON Q1: our spread is not merely OBSERVED, it MOVES the entry level.** A spread figure of ours may be **our cached estimate rather than the tape.** ⛔ **Derive spread from the quote files, never from anything we computed** — otherwise Q1's own primitive is our artefact.
- ⇒ **So: the candidate SET was generated by fee-free logic. Filtering, mode choice and ranking were distorted — plus the entry level, by slippage and spread.**

⇒ ⛔⛔ **THEREFORE ONE QUESTION IS OFF THE TABLE AND YOU MUST NOT RECONSTRUCT IT: "does our selection add value."** Measured on this window it grades **the broken selector**, and that verdict expires the moment the operator changes.
⛔ **IT HAS A DISGUISE.** *"Which strategies clear real costs, measured as per-strategy net expectancy on the trades we have"* **is the same question in a cost question's clothes** — and worse, because it returns a number that reads like a finding. **If you find yourself building a per-strategy net-EV ranking, you have reconstructed it. Stop and say so.** §5's Q3 is the admissible re-cut.

---

## 5. THE MEASUREMENT QUESTIONS

### Q1 — SPREAD AND TICK BEHAVIOUR, PER CLASS  *(ship first)*
Quoted spread distribution per class and instrument, its variation across the session, the venue tick where published and the inferred increment where not, and how often the spread is a material fraction of a typical move.
★ **First because it has zero dependence on our fees, our gates or our selection — and §3's decision needs it.**

### Q2 — HOLDING PERIOD  *(bounded, not disqualified — three binding constraints)*
**How long do positions last, and what ends them?** The selector picks *which* trades exist; it does not set exit geometry, so contamination is a per-stratum reweighting rather than a distortion inside a stratum. **All three constraints bind:**
1. ⛔ **Stratify by `strategy × class × exit reason`. NEVER a pooled distribution** — a pooled median is a mixture average weighted by the broken selector.
2. ⛔ **Survival curves with censoring explicit; the two walls NEVER pooled.** Active lanes have **no force close** (right-censored). The passive side has **two different walls — 7 days real, 48 hours shadow.** ⛔ **A wall-terminated trade is CENSORED, not an event — count it as observed and you manufacture a mode at the wall.**
3. ⛔ **Split at deploy boundaries inside the window. ENUMERATE the exit-touching deploys; do not assume one population.** *(⛔ **An earlier revision named a “2026-09-07 exit change.” THERE IS NO SUCH DEPLOY** — that was a measurement date, and a phantom boundary handed to an outside reader is worse than no candidate. **Struck.** The one real candidate we can name is the **2026-09-04** change, commit `f8870022f`. **A CANDIDATE, not an enumeration** — and see the data manifest: we cannot give you deploy TIMES at all.)*

⛔ **The population statement is a required column on every row, not a trailing caveat.**

### Q3 — THE COST HURDLE AGAINST THE TAPE
⛔ **NOT "which strategies clear costs."** **(a)** The round-trip cost hurdle in basis points per class and instrument under the confirmed ladder — taker/taker, maker/taker, maker/maker given the xStock rebate. **(b)** The distribution of **available move sizes on the tape**, per class and instrument, over horizons you choose and state — **and what fraction of it clears each hurdle.**
★ **A property of the MARKET, not of our trades.** ⛔ **No per-strategy ranking, no net-EV output.**

---

## 6. THE DATA

**You get RAW PRIMITIVES and you derive everything yourself.** Fills, sides, quantities, prices, timestamps, venue, symbol, strategy, mode, entry/stop/target as set at signal birth, open and close times, close reason.

⛔⛔ **YOU DO NOT GET OUR DERIVED OUTCOMES, our cost figures, our expected-value numbers or our gate decisions — AND THAT IS DELIBERATE.** Kyle's own instruction: *"we don't have to give it our actual outcomes, especially if they were tainted."*
★ **The reason it is an OMISSION rather than a warning label: we measured, on ourselves, that instruction-shaped safeguards fail** — three separate attempts to change a behaviour by instruction, three failures. **An absent column cannot be mistaken for market structure. A caveated one can.**
⇒ ⛔ **BOUNCE, DO NOT SUBSTITUTE.** If a question needs a column the export does not carry, **say so and stop that question.** A proxy silently changes what is being measured and **we would not be able to tell from the report that it happened.** **A request for more or cleaner primitives is a good outcome, not a failure of this brief.**

⛔⛔ **THE HONEST EXCEPTION — AND IT APPLIES TO THE ONE PROHIBITION THAT MOST NEEDS A MECHANISM, WHICH IS EXACTLY WHY IT IS WRITTEN OUT RATHER THAN GLOSSED.**
The argument above says omission beats instruction. **It does not cover §4's ban on a per-strategy net-EV ranking, and the brief would otherwise refute itself in its own words.**
**Per-strategy net expectancy is NOT an absent column — it is ONE JOIN off the primitives we are shipping.** Fills, sides, quantities, prices and close times reconstruct realized P&L, and `strategy` is right there beside them. ⛔ **We are NOT cutting `strategy`: that would kill Q2.**
⇒ **So that single fence is an INSTRUCTION, not a mechanism, and we are naming it as one rather than letting it borrow the credibility of the paragraph above.**
✅ **What we ask is therefore not silent compliance but a DECLARATION: if you compute a per-strategy net-EV ranking for any reason — including as an intermediate step — SAY SO in the report, and say why.** **An honest fence gets complied with; one that overstates its own strength does not.**

---

## 7. STANDARDS

- **Pin the commit.** `git rev-parse HEAD` and `git status --porcelain` at the top of the deliverable.
- ✅ **`INSUFFICIENT / REFUSE` is a first-class verdict, carrying no penalty** — name what is missing and what would settle it. **It is here because your best measured behaviour was refusing to rule without evidence, and that refusal produced the fee finding.** A format with no no-answer exit pressures the answerer to invent one.
- ✅ **`STRUCTURAL CONSTRAINT — NOT A DEFECT` is equally first-class** (§1).
- **Name the object and the population on every number.** A positive control on every zero or absence.
- **A mechanism claim cites the implementing line, or is labelled `HYPOTHESIS`.**
- **Every finding states the evidence AGAINST it**, plus a confidence and a falsifier.
- **Recompute from primitives.** Never trust a stored derived value.
- **Do not revise a frozen report** to accommodate later evidence — issue a labelled supplement.

**Your standing:** your output is **evidence, never a gate.** It enters as a claim and clears the same bar as any claim from any session. **Nothing routes to you; nothing resolves by you.**

---

## 8. ⛔ DESIGNS ARE THE NEXT STEP, NOT THIS ONE — BUT AUDIT WITH THEM IN MIND

**Kyle's direction: for now, auditing and analysis. Designs that can be turned into real plans and code are the step after.**

⇒ ✅ **SO WRITE THIS AUDIT KNOWING A DESIGN ASSIGNMENT FOLLOWS IT.** Pull the issues **into the light** — clearly enough, and with enough of the mechanism named, that a fix can be designed **from your finding** without the ground being re-covered. **Where a direction is obvious, you may say so in a sentence. Do not build out proposals here.**
★ **The reason for the order: we want to understand what is wrong or missing BEFORE anyone designs against it.** A design written against a misunderstood problem is more expensive than no design.

⚠️ **ONE AREA IS ALREADY UNDER A PRE-REGISTERED OBSERVATION WINDOW, and you should know where a suggestion would land rather than be fenced out of it: HOW AN EXIT IS PRICED** (`F-G-2`, open). Its own terms **VOID or SPLIT that window on a change to exit-mark cadence.** ⛔ **Not an exclusion** — say what you think; just know a live measurement sits in the path of anything touching exit-mark timing.

---

## 9. DELIVERABLES

| file | contents |
|---|---|
| `REPORT.md` | Pinned sha + porcelain first. Then §3 (price side + freshness), §2.b (the two restored subjects), Q1, Q2, Q3 — each with population, method, evidence-against, confidence, falsifier; or `INSUFFICIENT`; or `STRUCTURAL CONSTRAINT`. **Close with the four questions of §1 answered directly: what is missing, what is right, what needs improvement, what is wrong.** |
| `QUESTIONS.md` | Anything you need that the export or the repo does not carry. |
| `SUBMISSION.md` | Freeze record + hash. |

*Ship order: §3 → Q1 → §2.b → Q2 → Q3. **§3 is first because a live decision is waiting on it.** A complete answer to one question beats partial answers to five.*
