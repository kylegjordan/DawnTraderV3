# ASSIGNMENT 3: WHAT IS STOPPING THIS SYSTEM FROM DOING WHAT IT IS FOR (r2)

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

★ **AND ONE ANSWER MUST ALWAYS BE AVAILABLE TO YOU, ranking equally with the rest: `STRUCTURAL CONSTRAINT — NOT A DEFECT`.** If something limits returns and is **not fixable by us** — a venue cost floor, a market-microstructure reality, an information limit — **say that, and size it.** ⛔ **An audit conducted against a very high bar can be pushed into manufacturing optimism, and a constraint reported as a defect sends people to work on something that cannot move.** Naming a real wall accurately is worth more than a hopeful fix.

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
- **Strong-trend lane reachability.** We measured zero `strong_bull_trend` evaluations on the active/paper lane across two days while the passive lane evaluated thousands, and the pre-filter routed 53,121 pairs into that family on the active lane the same day. ⚠️ **Our own measurement has a stated hole: the active lane records no internal-rejection rows for ANY strategy, so "zero rows" may mean "not recorded" rather than "not run."** **The history of how that lane was built is in the batch reports.**

---

## 3. ⭐⭐ THE NEW QUESTION KYLE ADDED — WHICH PRICE, FOR WHICH JOB, AND HOW FRESH MUST IT BE

**This is a LIVE, UNRESOLVED internal debate. Kyle wants your eyes on it while it is being decided, not after.** It is not a defect hunt; it is a design question we have not settled.

**THE SITUATION.** A price does at least four different jobs in this system: **generating a signal** (where the entry, stop and target levels get set), **ranking candidates**, **triggering an action** (a stop or target being hit), and **booking a result**. ⛔ **We currently use the MIDPOINT for all four**, and because it is built at the feed layer, both asset classes and both trading modes inherit it.

**The proposal under debate:** where a price only *estimates value*, the midpoint is right; where it **becomes a level, fires an action, or is recorded as a result**, it should be the side you could actually transact on. ⛔ **And per-leg: an entry is a BUY on the ask, a stop and a target are SELLS on the bid — opposite by construction, so the error is a FULL SPREAD, not half of one.**

**THE OTHER HALF, AND IT IS THE ONE KYLE MOST WANTS LOOKED AT — WHAT A TIMESTAMP ON A PRICE ACTUALLY MEANS HERE:**
⛔⛔ **MEASURED AND CONFIRMED IN OUR OWN CODE: the venue's ticker frame carries NO timestamp at all** (`server/services/passive-archive/equity-spot-archiver.ts:127` — *"Our receipt time for THIS frame (the venue's ticker frame carries no timestamp)"*, issue `#943`). ⇒ **every age we compute is measured from OUR RECEIPT, not from when the price occurred at the exchange.** That receipt time includes network transit, queueing and our own processing.
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
- ✅ **But SIGNAL GENERATION IS FEE-FREE** — detector geometry is price, ATR and structure with no cost input. **The candidate SET is uncontaminated. Only filtering, mode choice and ranking were distorted.**

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
3. ⛔ **Split at deploy boundaries inside the window. ENUMERATE the exit-touching deploys; do not assume one population.** *(Candidates include a 2026-09-04 xStock change and a 2026-09-07 exit change — candidates, not an enumeration either of us has done.)*

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

---

## 9. DELIVERABLES

| file | contents |
|---|---|
| `REPORT.md` | Pinned sha + porcelain first. Then §3 (price side + freshness), §2.b (the two restored subjects), Q1, Q2, Q3 — each with population, method, evidence-against, confidence, falsifier; or `INSUFFICIENT`; or `STRUCTURAL CONSTRAINT`. **Close with the four questions of §1 answered directly: what is missing, what is right, what needs improvement, what is wrong.** |
| `QUESTIONS.md` | Anything you need that the export or the repo does not carry. |
| `SUBMISSION.md` | Freeze record + hash. |

*Ship order: §3 → Q1 → §2.b → Q2 → Q3. **§3 is first because a live decision is waiting on it.** A complete answer to one question beats partial answers to five.*
