# ASSIGNMENT 3: MARKET STRUCTURE, HOLDING PERIOD, AND THE COST HURDLE — WITH A CONSTRAINED DESIGN ANNEX (r1)

> **Read this whole file before starting.** It is shorter than assignment 2 **on purpose** — the largest question from that assignment has been **deliberately removed**, and §1 says why. Do not reconstruct it.

---

## 0. WHAT CHANGED SINCE ASSIGNMENT 2 — READ THIS FIRST, IT INVALIDATES PART OF YOUR OWN EVIDENCE BASE

⭐⭐ **YOUR FINDING 1 WAS RIGHT, AND ACTING ON IT FOUND AN 8× ERROR.** You asked whether our fee model is externally identified and **refused to rule without authenticated evidence.** That refusal is the reason we went and looked. What we found:

| | our `fee_model` held | Kraken charges, **account-confirmed** |
|---|---|---|
| `xstock_spot` taker | `0.008` | **`0.0010`** — **8× too high** |
| `xstock_spot` maker | `0.004` | **`−0.0002`** — **a REBATE. Our sign was inverted.** |
| `crypto_spot` both | `0.008 / 0.004` | ✅ **correct** — spot rung 1, account confirmed |

**The xStock rows were byte-identical to the crypto rows, same write timestamp, same author.** A taker/taker xStock round trip: **we modelled 1.60 %, the real figure is 0.20 %.** Confirmed on the account, per order: the venue's own order form quotes `Est. trading fee — Maker rebate — −0.0001 USD`.

⛔⛔ **THE CONSEQUENCE FOR YOU IS NOT THE NUMBER. IT IS THAT OUR SELECTION HISTORY IS CONTAMINATED.** The net-expectancy gate that decides which candidates are admitted is computed from these rates. ⇒ **every xStock candidate for three months was admitted or refused against roughly eight times the real cost.**
- ✅ **COST IS RECOMPUTABLE** from primitives. Not a problem.
- ⛔ **SELECTION IS NOT.** A candidate the gate refused was never simulated, so **there is no counterfactual to recover.** You cannot re-derive which trades *would* have existed from the set that does.
- ✅ **AND WHAT IS *NOT* CONTAMINATED, which is what makes this assignment possible: SIGNAL GENERATION IS FEE-FREE.** A detector's entry, stop and target are built from price, ATR and structure with **no cost input** (`strategy-engine.ts:244-262` is representative). **The candidate SET was generated identically. Only filtering, mode choice and ranking were distorted.**

⇒ **THE EXTERNAL CONTRACT NOW HAS A GOVERNED HOME: `1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md`** — all three account-confirmed ladders (spot crypto 17 rungs, Pro xStocks 2 rungs, futures 17 rungs), the qualifying measures, and what is still open. **Use it. Do not take a fee figure from our database or our code.**

⚠️ **THE CORRECTION IS NOT DEPLOYED YET** (`B-XSTOCK-FEE-CONTRACT`, in flight). It is not a constant edit: a startup rail refuses any fee outside `(0, 5 %]`, so a negative maker rate currently prevents the server booting.

---

## 1. ⛔⛔ WHAT WAS CUT, AND WHY YOU MUST NOT RECONSTRUCT IT

**"Does our selection add value?" — the ranking-counterfactual question that assignment 2's brief spent a whole section on — IS WITHDRAWN. It does not go now and it does not go after the fee correction either.**

**The reasoning, in our reviewer's words:** measured on this window it grades **the broken selector**, and that verdict has **no forward validity** once the operator changes. It can only be asked of a population the *corrected* system produces.

⛔⛔ **AND IT HAS A DISGUISE YOU MUST WATCH FOR.** *"Which strategies clear real costs, measured as per-strategy net expectancy on the trades we have"* **IS the selection question wearing a cost question's clothes** — and it is more dangerous than the original because **it comes back carrying a number, which reads as a finding.** §4's Q3 is the admissible re-cut. **If you find yourself computing a per-strategy net-EV ranking, you have reconstructed the withdrawn question — stop and say so.**

★ **THIS IS WHY THE DATA MANIFEST OMITS EVERY FEE-DERIVED AND GATE-OUTCOME COLUMN RATHER THAN LABELLING THEM.** It is not distrust. **We measured, on ourselves, that instruction-shaped safeguards fail** — three separate attempts to change a behaviour by instruction, three failures; only removing the thing worked. **An absent column cannot be audited as market structure. A caveated one can.** If a column you need is missing, **bounce it back — do not substitute a proxy.**

---

## 2. YOUR ACCESS, AND ITS BOUNDARIES

| | |
|---|---|
| **Repo** | A read-only copy, **allowlisted** — enumerated in, refused by default, re-resolved at every refresh, **failing closed if the manifest does not resolve.** Not a denylist: a denylist over a repo four sessions commit to daily is stale on the next commit and fails silently when it is. |
| **Data** | A raw export. Manifest in §5. |
| **Never** | ⛔ **Any authenticated account material.** The published ladder answers every cost question; the account view buys nothing and costs the whole confidentiality boundary. Do not ask for balances, positions, or account screenshots. |
| **Write** | None. The pin is enforced by the filesystem, not by your restraint. |

**Kyle has explicitly decided to grant the repo copy and the data export**, understanding that this is a third-party service. **That decision is his and is recorded.** Its scope is *this* material — it is not a standing grant.

**Your standing, unchanged and stated plainly so you can calibrate:** your output is **evidence, never a gate.** It enters as a **claim** and clears the same bar as any claim from any session — object, population, a positive control on any zero or absence, a mechanism citing an implementing line or else labelled `HYPOTHESIS`. **You never count as independent confirmation of our reviewer's ruling** — if you and he agree having read the same framing, that is two readings, not corroboration. **Nothing routes to you and nothing resolves by you.**

⭐ **AND THE REASON YOU ARE HERE, in Kyle's own framing: you run on a different model from the rest of the crew.** The value is that you **think differently** and can therefore check us — not that you are a second opinion from the same place. **Where your reading diverges from ours, say so loudly rather than reconciling toward it.**

---

## 3. ✅ `INSUFFICIENT / REFUSE` IS A FIRST-CLASS VERDICT

**Any question may be answered `INSUFFICIENT`** — naming what is missing and what would settle it. This is **not** a failure mode and carries no penalty.

★ **It is here because your single best measured behaviour was refusing to rule without authenticated evidence, and that refusal produced the 8× finding.** A format with no no-answer exit **pressures the answerer to manufacture one.**

---

## 4. THE QUESTIONS — THREE, IN SHIP ORDER

### ⭐ Q1 — SPREAD AND TICK BEHAVIOUR, PER ASSET CLASS  *(first: zero fee dependency, and a batch is waiting on it)*

**What is the observed spread and tick/grid structure per class and per instrument, and how does it behave across the session?** Quoted spread distribution, its variation by time of day, the venue tick size where it is published and the inferred increment where it is not, and how often the quoted spread is a material fraction of a typical move.

★ **This is the highest value per turn in the assignment.** It has **no dependence on our fees, our gates or our selection**, and an in-flight batch (`B-PRICE-SIDE-BY-JOB`) needs exactly this input. **A partial answer here beats a complete answer anywhere else.**
⚠️ **Crypto and xStock are structurally different and must not be pooled:** a crypto tick is the venue's published statement; an xStock increment is inferred by us.

### Q2 — HOLDING PERIOD  *(the question Kyle keeps asking — bounded, not disqualified)*

**How long do positions actually last, and what terminates them?**

**RULING: the selector picks *which* trades exist; it does not set exit geometry.** ⇒ contamination is a **per-stratum reweighting**, not a distortion *inside* a stratum. **Three constraints make it admissible, and all three are binding:**

1. ⛔ **STRATIFY BY `strategy × asset class × exit reason`. NEVER a pooled distribution.** A pooled median is a mixture average weighted by the broken selector.
2. ⛔ **SURVIVAL CURVES WITH CENSORING MODELLED EXPLICITLY, AND THE TWO WALLS NEVER POOLED.** The active lanes have **no force close** (right-censored short). The passive side has **two different walls — 7 days real, 48 hours shadow** — which are **different instruments.** ⛔ **A wall-terminated trade is CENSORED, not an event: count it as an observed exit and you manufacture a mode at the wall.**
3. ⛔ **SPLIT AT DEPLOY BOUNDARIES INSIDE THE WINDOW.** Holding period is set by exit mechanics and those changed mid-window. **ENUMERATE the exit-touching deploys and split there** — do not assume one population. *(We have not enumerated them for you; the export carries deploy timestamps. Candidates include a 2026-09-04 xStock change and a 2026-09-07 exit-side change.)*

⛔ **THE POPULATION STATEMENT IS A REQUIRED COLUMN ON EVERY ROW, not a trailing caveat** — same reason we withheld columns instead of labelling them.

### Q3 — THE COST HURDLE AGAINST THE TAPE  *(re-cut; read the boundary in §1)*

⛔ **NOT** "which strategies clear costs." **The admissible estimand is a property of the MARKET, not of our trades:**

**(a) What is the round-trip cost hurdle, in basis points, per class and per instrument**, under the confirmed ladder — taker/taker, maker/taker, and maker/maker, given the xStock maker rebate. **(b) What is the distribution of available move sizes on the tape**, per class and per instrument, measured over horizons you choose and state — **and what fraction of that distribution clears each hurdle in (a)?**

⛔ **NO per-strategy ranking and NO net-EV output anywhere in this answer.** If your working needs one, you have crossed into §1's withdrawn question.
★ **Why this is worth asking now: it is answerable against a CORRECT ladder for the first time**, and it answers *"is there enough movement to pay for the trading"* without reference to which trades we happened to take.

---

## 5. THE DESIGN ANNEX — GOES NOW, CONSTRAINED

**Design proposals are wanted in this assignment, not deferred.** Kyle wants designed fixes, not only findings.

⛔⛔ **THE LINE THAT MAKES THIS SAFE — MECHANISM vs SELECTION, and you must declare which side every proposal sits on:**

| | | |
|---|---|---|
| ✅ **MECHANISM** | how a level is set · how an exit is priced · where a stop sits · tick and grid structure | **selection-invariant ⇒ goes forward as a proposal** |
| ⛔ **SELECTION** | which strategy, symbol or regime to favour | **inherits the contamination SILENTLY ⇒ marked `HELD-PENDING-RESELECTION`** — not a proposal, not eligible for a work slot |

★ **WHY THE DISTINCTION IS DRAWN HERE AND NOT LEFT TO JUDGEMENT: a FINDING states its population; a DESIGN just looks reasonable.** A design built on a contaminated population carries the flaw invisibly, which a finding does not.

**EVERY proposal carries four fields. A missing field makes it MALFORMED and refusable:**
1. **Parent finding id**
2. **That finding's population**
3. **The measurement that would FALSIFY it**
4. **Which side of the mechanism/selection line it claims to be on**

⚠️ **A proposal is a CANDIDATE, never a scope.** It enters our disposition process under a named session and is accepted, rejected, deferred or withdrawn there.

**⛔ EXPLICITLY OUT OF SCOPE — do not propose fixes for these:** the **DHMA volatility-units defect** and the **strong-trend lane reachability** question. Both are already scoped as our own batches. **Not because the ground is settled, but because you have no access to the history and intent behind those scopes** — so what you return is a claim our reviewer is pre-committed to bouncing. **Building a lane whose output is bounced by construction wastes your turns and ours.**

---

## 6. RULES CARRIED FORWARD FROM ASSIGNMENTS 1 AND 2

- **Pin the commit.** Run `git rev-parse HEAD` and `git status --porcelain` and put both at the top of the deliverable.
- **Provenance before filing.** Search our issue ledger, batch catalog and completion reports for the component **and** the symbol before recording any behaviour as a defect. **State the search outcome including a NOT-FOUND, and show a positive control** — a search that returns nothing proves nothing until the instrument is shown able to return something.
- **Evidence against.** Every finding states what would argue the other way.
- **Confidence and falsifier** on every finding.
- **Name the object and the population** on every number.
- **A mechanism claim cites the implementing line, or is labelled `HYPOTHESIS`.**
- **Recompute from primitives.** Discard any stored derived value; apply your own cost model from the confirmed ladder.
- **Do not revise a frozen report to accommodate later evidence** — issue a separately labelled supplement.

---

## 7. DELIVERABLES

| file | contents |
|---|---|
| `REPORT.md` | Pinned sha + porcelain at the top. Q1, Q2, Q3, each with population, method, evidence-against, confidence, falsifier — or `INSUFFICIENT` with what would settle it. Then the design annex. |
| `QUESTIONS.md` | Anything you need that the export does not carry. **A request for cleaner primitives is a good outcome, not a failure of this brief.** |
| `SUBMISSION.md` | Freeze record + hash. |

⛔ **BOUNCE, DO NOT SUBSTITUTE.** If Q1 or Q3 needs a column the manifest does not carry, **say so and stop that question.** A proxy silently changes the estimand, and we will not be able to tell from the report that it happened.

---

*Ship order is Q1 → Q2 → Q3 → design annex. A complete Q1 delivered early is worth more than four partial answers.*
