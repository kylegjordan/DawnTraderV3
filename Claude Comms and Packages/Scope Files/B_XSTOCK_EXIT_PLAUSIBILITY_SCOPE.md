# B-XSTOCK-EXIT-PLAUSIBILITY — SCOPE (Step 1)

change-class: architecture

**Phase:** 19 · **Owner:** CC-B · **Status:** Step-1 draft, awaiting Langston review. No code written.
**Origin:** the AMGN phantom stop, 2026-07-17 00:15Z — a position closed at a price the market never traded.

> ⚠️ **Change-class declared `architecture` deliberately, not defensively.** The change adds a gate to the **exit path** and alters *when a position is permitted to close*. That is core-engine behaviour on the active-trading axis, so it gets the strictest doc-set even though the diff may end up small. Declaring `non_architecture` here would be under-declaration, and the checker would cross-check it anyway.

---

## 0. PROBLEM STATEMENT — rewritten 2026-07-20 to Langston's lock (supersedes §1's outcome-(1) framing)

> ⚠️ **§1 below is SUPERSEDED on its rule-24 disposition and retained only for its evidence.** It classified this outcome-(1) REAL DEFECT. **That was wrong** — see §0.3.

### 0.1 The removal rationale, quoted VERBATIM (`server/services/active-execution-engine.ts:970-982`, read at `origin/migration/aws-supabase`)

> *"We fill against Kraken's book, so a non-Kraken tick is not actionable information — it's a number that looks like one (Langston's phrasing; today's phantom stops were the proof). The actionable chain is now EXACTLY: `kraken_ws → kraken_rest → SKIP-THIS-TICK`. binance / coingecko / mock / last_known_good / entry_seed are OFF the actionable path… **This supersedes the same-day C prong-2 sanity gate, which existed to referee heterogeneous sources — with a homogeneous venue chain there is nothing left to referee** (its observe-only WS-vs-REST divergence log survives in the REST leg)."*

### 0.2 Why "nothing left to referee" does NOT reach the within-venue case

**The rationale is entirely about SOURCE DISAGREEMENT, and it is correct about it.** Prong-2 existed to adjudicate *between* sources — when binance, coingecko and Kraken each offered a different number, something had to decide which was real. Collapse the chain to one venue and that adjudication genuinely has no work left: **there is no second opinion to weigh, and — per this batch's negative requirement — none is wanted.**

**But "which source do we believe?" and "is this value believable?" are different questions, and only the first was answered.** A single trusted venue can emit a value its own book never printed — a feed glitch, a bad snapshot, a malformed tick. **That is not a refereeing problem: there is no disagreement, because there is only one voice, and it is wrong.** Prong-2's removal is silent on it — not mistaken about it, *silent*. **Homogeneity eliminates the conflict; it does not confer correctness.**

⇒ So the venue-only cut did not leave a hole where a check used to be. **It correctly removed a between-source referee, and a within-source value check was never specified in the first place** — not by prong-2, not by the freshness guard, not anywhere.

### 0.3 Rule-24 disposition: **OUTCOME (2)**, not (1) — corrected, and it changes what this batch IS

**The freshness guard does precisely what it was specified to do.** `active-execution-engine.ts:933-963` gates on four things — knob-present, tick-present, `Number.isFinite && > 0`, `age ≤ max` — and **a fresh wrong tick satisfies all four.** That is not a malfunction; it is the specification, met.

**What is missing is a DECISION that was never made:** *should the system check that a price is believable, and what should it do when it is not?* **Nobody decided that and got it wrong — nobody decided it.** ⇒ **Working-as-designed-but-UNADDRESSED. This is a SCOPE CALL for Kyle, not a defect fix**, and it must be presented to him as an options decision rather than shipped as a repair.

⚠️ **AND MY OWN OVERREACH IS PART OF THE RECORD.** I classified this outcome-(1) on the strength of the reflog. **The reflog proves the guard was DEPLOYED and did not PREVENT the close — it does not prove the guard EVALUATED AMGN**, and §0.4 now shows that step is **unprovable from surviving evidence**. So the outcome-(1) claim rested on **inference**, which is the exact move I spent 2026-07-20 objecting to in others. Corrected on Langston's reframe, accepted without argument.

### 0.4 The forensic step is CLOSED AS UNPROVABLE — and that is itself a finding

Langston proposed an airtight closer: `priceSource = 'kraken_equities_ws'` is written at `:958` **only**, reachable only after the age gate passes, so the AMGN row's persisted `price_source` would prove the tick was fresh-and-evaluated. **I ran it. The field is never persisted.** Enumerated, not inferred:

| surface | result |
|---|---|
| `closed_trades` — every `%source%` column | only `source_pool`. **No `price_source`** |
| `closed_trades.metadata` | `->>'priceSource'` **and** `->>'price_source'` both EMPTY on the AMGN row |
| `active_open_positions` — every `%source%`/`%price%` column | `avg_price`, `current_price`, `exit_limit_price`, `intended_entry_price`, `maker_limit_price`, `source_pool`. **No `price_source`** (direct select errors) |

**The row itself is confirmed:** `AMGN/USD · close_reason=stop_hit · exit_price=369.51 · actual_exit_price=369.51 · closed_at=2026-07-17 00:15:01.516+00`.

⇒ `:958`'s value is **in-memory/log-only**, and pm2 logs have rotated past 07-17. **The "was AMGN evaluated" step cannot be closed from any surviving evidence. It is not open — it is unprovable.**

**★ AND THAT IS CR-1'S FAMILY HITTING US IN REAL TIME.** `#547` CR-1 says we keep the reasoning for trades we TOOK and discard it for signals we REFUSED. **This is a third case neither of us named: we discard the reasoning for the trades we TOOK too, whenever it lives only in a log.** The field needed to reconstruct *why* a position closed was computed, used to make the decision, and thrown away. **Six days later the decision is unreconstructable — and that cost us this answer.** Better evidence for CR-1 than anything currently in the entry. **Not widened into this batch; recorded, and cross-referenced from `#547`.**

---

## 1. ~~The defect~~ EVIDENCE (retained; disposition superseded by §0.3)

**A tick can be perfectly fresh and still carry a price the market never printed.** The existing xStock guard (`184c41881`) gates on **AGE**: if the latest equity tick is older than `exit_integrity.max_equity_tick_age_ms` (xstock_spot = 90,000ms) it skips and takes the escalation rail. That guard is correct and stays. **It simply never asks whether the price is believable** — so a fresh-but-wrong tick passes *by construction*, reaches `currentPrice`, and drives the stop/target comparison.

### Both competing readings were tested. One is dead.

| Reading | Verdict | Evidence |
|---|---|---|
| **(a)** the guard was not deployed yet — a timing accident, nothing structural | ❌ **DISPROVEN** | staging reflog: `184c41881 HEAD@{2026-07-16 16:25:41 +0000}` — **7h50m BEFORE** the 00:15Z incident, with **five** further ancestor-preserving fast-forwards on top (18:22, 19:06, 20:31, 21:05) — it was live and stayed live |
| **(b)** the guard checks FRESHNESS, not PLAUSIBILITY — a fresh wrong tick passes by construction | ✅ **SURVIVES** | CC-A's independent code read of the equities branch, converging with the timeline from the opposite direction |

⇒ **Rule-24 disposition: outcome (1), a REAL DEFECT.** Not working-as-designed-but-unaddressed (the design intends stops to fire on real prices), and not legacy-vs-intent (the guard is three days old and current). **Two independent routes — deployment record and code read — reached the same answer.**

⚠️ **NOT ESTABLISHED, and it is the one gap in the chain:** this proves the guard was *deployed* and did not *prevent* the event. It does **not** independently prove the guard *evaluated AMGN* at 00:15Z — a skip for an unrelated reason would look identical from the reflog. CC-A's code read is what closes that step, and it is carried here as **RULED ON REPORTED FACT**. **Step-2 must confirm AMGN was in the evaluated set at that timestamp**, or the causal chain has a hole.

---

## 2. Objectives

### OBJ-1 — a plausibility gate on the exit mark, alongside the age gate (not replacing it)

Before a venue mark is allowed to drive a stop/target comparison for an xStock position, it must be **believable** as well as **fresh**. Failing plausibility takes the **same escalation rail** the staleness skip already uses — *skip the evaluation, do not close the position, surface it* — never a silent substitution.

**★ NEGATIVE REQUIREMENT — LOAD-BEARING, inherited from CC-A and NOT re-litigable at Step-3:**
> **The comparator MUST be the pair's OWN price history. NEVER a second venue.**
> A cross-venue plausibility check would undo venue-only and **re-import exactly the fiction that produced the XRP/GBP Binance-ghost-market class** (already fixed, #509 / `2a3315db3`). Any design that reaches for another exchange's price is wrong by construction, however convenient.

**Candidate mechanism (Step-2 decides, not assumed):** the **retired** `exit_integrity.max_fallback_deviation_pct` knob (~`active-execution-engine.ts:1058`). ⚠️ It is retired — reviving it is a real decision, not a shortcut, and it inherits the full rule-18/§9.5(a) census (who writes / reads / mutates / deletes / schedules) **before** any revival. Do not assume revival is cheaper than a fresh mechanism until that census is run.

**Verification criteria.** A named test proves a fresh-but-implausible tick is REFUSED, and a fresh-plausible tick still closes normally (the gate must not become a silent no-close). The escalation surfaces. §9.3 UI-navigated verification on the affected tab.

### OBJ-2 — the six phantom rows keep their disposition, and stay excluded from analysis

Already established and **not** re-opened here: 5 rows are the XRP/GBP ghost class fixed at #509 and annotated KEEP-AS-DATA; the AMGN row is the residual this batch addresses. **They inflate stop-hit rate and depress win-rate**, so ANALYST has been told to exclude/flag all six. **This batch does not mutate historical rows** — it prevents recurrence. Any correction of history is a separate decision with its own home.

### OBJ-3 — the gap this defect exposes, stated once so it is not lost

**Provenance and plausibility are orthogonal**, and the system currently only checks provenance (right feed, right symbol, recent enough). **Step-2 must state whether the crypto path has the same gap** — the xStock branch is where it surfaced, but nothing about the reasoning is xStock-specific. If crypto is equally exposed, that is a finding with its own disposition, **not** a silent scope expansion into this batch.

---

## 3. Explicitly OUT of scope

- Any cross-venue price comparison (see the negative requirement — this is a hard exclusion, not a preference).
- Mutating historical closed-trade rows.
- Changing the age gate itself, its knob, or the escalation rail (all working as designed).
- Fixing the crypto path if OBJ-3 finds it exposed — that is a separate named batch, decided at the moment OBJ-3 answers.

## 4. Questions for Langston at Step-1

1. **Comparator design:** what is the honest plausibility test against a pair's own history — a deviation band off the last accepted mark, a rolling-window bound, or an ATR-scaled envelope? My lean is an ATR-scaled band, because a fixed percentage misjudges both a quiet mega-cap and a volatile small-cap, but I have not measured the false-refusal cost of any of the three and will not pick on aesthetics.
2. **Revive vs rebuild:** is reviving the retired `max_fallback_deviation_pct` knob right, or does it carry enough retired-era baggage that a fresh mechanism is cleaner? Rule 18 says do not leave legacy lingering — reviving a retired knob is arguably the opposite of that.
3. **Failure direction:** on plausibility failure the position stays open and unevaluated. **That is itself a risk** — a genuinely-moving market with a flaky feed means a stop that should fire, does not. Is skip-and-escalate right, or does a repeated-failure path need to escalate harder (and to what)? **This is the objective's real tension and I would rather surface it than design past it.**

## 5. Governance at Step-10 (judged, not defaulted)

Tier 1: `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN` (§1 + §5), `RUNNING_ISSUES`, `MEMORY_CC_B`, completion report.
Tier 2: **`SYSTEM_MANUAL` APPLICABLE** — this changes exit-path behaviour and adds a gate to the signal/execution pipeline. **`SYSTEM_IMPACT_MAP` APPLICABLE** — new/modified component on the exit path. `CHANGES_AND_FIXES` — bug registry entry. `DELETED_COMPONENTS_LOG` — only if the retired knob is formally re-retired or removed.
