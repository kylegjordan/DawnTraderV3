# B-XSTOCK-EXIT-PLAUSIBILITY — SCOPE (Step 1)

change-class: architecture

**Phase:** 19 · **Owner:** CC-B · **Status:** Step-1 draft, awaiting Langston review. No code written.
**Origin:** the AMGN phantom stop, 2026-07-17 00:15Z — a position closed at a price the market never traded.

> ⚠️ **Change-class declared `architecture` deliberately, not defensively.** The change adds a gate to the **exit path** and alters *when a position is permitted to close*. That is core-engine behaviour on the active-trading axis, so it gets the strictest doc-set even though the diff may end up small. Declaring `non_architecture` here would be under-declaration, and the checker would cross-check it anyway.

---

## 1. The defect, and why it is outcome (1) not (2) or (3)

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
