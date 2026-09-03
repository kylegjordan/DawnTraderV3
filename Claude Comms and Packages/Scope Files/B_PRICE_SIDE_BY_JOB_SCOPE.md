# B-PRICE-SIDE-BY-JOB — SCOPE (Step 1)

**change-class: architecture**

**Batch id:** `B-PRICE-SIDE-BY-JOB` · **Plan row:** `PHASE_19_PLAN` **3n** · **Owner:** CC-C · **Reviewer:** Langston (gates the design)
**Issue:** to be minted at Step 2 · **Related:** `#952`, `#941` (the label defect), `F-G-2` (the exit-trigger half — **NOT re-scoped here**)

---

## 0. WHY THIS EXISTS, AND WHO DECIDES IT

⭐⭐ **KYLE DELEGATED THIS DECISION TO CC-C + LANGSTON, 2026-09-03, AND HIS REASON IS THE BINDING CONSTRAINT RATHER THAN A PREAMBLE.** In his words: *"this is beyond my ability to understand enough to be able to make the right decision, plus I'm biased. You know, I want to see the trading results improve and be good. So I would be biased in picking one that I think is going to improve our trading, but it might not actually be the right — the correct thing to do if we're trying to have our system simulate as closely as possible the live trading."*

⇒ ⛔⛔ **THE TEST FOR EVERY CHOICE IN THIS BATCH IS FIDELITY TO LIVE TRADING. A change that improves reported results and reduces fidelity FAILS.** Any objective below that cannot be argued on fidelity alone is out of scope.

★ **AND HE FOUND THE GAP HIMSELF.** I gave him three uses of a price; he named the fourth — **signal generation** — and it is the one that matters most, because it is where the LEVELS are set. Recorded because the scope exists on the strength of his catch, not mine.

---

## 1. ⛔ MANDATORY 1.b — THE PROVENANCE READ, AND IT CHANGES THE DESIGN

**CORPORA SEARCHED:** `git log -S "Uses Midpoint" --reverse` (not path-limited, so it survives renames) · `RUNNING_ISSUES.md` · `BATCH_CATALOG.md` · `Batch Completion/` (8 reports matched on BEHAVIOUR — *midpoint* / *mark price* — not on a name I would have chosen) · `SYSTEM_MANUAL.md` · `bridge/canonical/`.

**THE INTRODUCING COMMIT, QUOTED VERBATIM, NOT SUMMARISED** — `b4c0d2d67d77d44c26555c5151f2ac167aa7c04a`, 2025-12-30 17:27:49 +0000, Replit era:

> Improve price calculation for low-volume trading pairs
>
> Update Kraken WebSocket adapters to v2 and implement midpoint pricing for improved accuracy on low-volume pairs.

**AND THE SYSTEM MANUAL ALREADY CARRIES THE ADJUDICATION** (ch. mark-price mechanism, recorded 2026-08-29):

> ★ INTENT (Directive 8.9.1, `b4c0d2d67` 2025-12-30): last-trade goes stale on low-volume pairs, so a mid is the better mark. **THAT REASONING IS SOUND AND THE SUBSTITUTION IS NOT A DEFECT TO REMOVE.**

⇒ ⛔⛔ **DISPOSITION: (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT. NOT (1), NOT (4).**

★★ **AND THIS IS THE FINDING THAT SHOULD DRIVE THE WHOLE BATCH, BECAUSE IT IS NOT THE ONE I EXPECTED TO FIND.** The midpoint was chosen — deliberately, correctly, and for a reason that still holds — to be a better **MARK**: a continuous estimate of value on a pair whose last trade goes stale. **It was never evaluated as a TRIGGER, as a LEVEL, or as a BOOKED RESULT.** It acquired those three jobs silently, by being the value sitting in the field every consumer reads.

⇒ ⛔ **SO THIS BATCH MUST NOT REMOVE THE MIDPOINT MARK.** Doing so would re-introduce the stale-last-trade defect that Directive 8.9.1 correctly fixed, on exactly the low-volume pairs that are most of the xStock universe. **The change is to stop a value chosen as an ESTIMATE from serving as a LEVEL and a TRIGGER** — which is a narrower, safer and more defensible change than "switch to the bid", and it is what the provenance read bought.

---

## 2. THE FOUR JOBS — AND WHAT IS ALREADY SCOPED ELSEWHERE

⛔⛔ **§9.5(b-ii) CHECK RUN FIRST, AND IT MOVED THE SCOPE: TWO OF THE FOUR JOBS ARE ALREADY OWNED BY `F-G-2`, WHICH IS DEPLOYED AND MEASURING.** Kyle's *"I feel like we've been at this point before"* is **correct**, and re-scoping `F-G-2`'s work here would be the exact failure §9.5(b-ii) exists to prevent.

| # | job | where the price comes from | status |
|---|---|---|---|
| **1** | **SIGNAL GENERATION** — a setup exists, and **where entry/stop/target SIT** | `signal-orchestrator.ts:2387` reads the cache (a mid); `:2276-2278` derive entry/stop/target from it | ⛔ **UNSCOPED — THIS BATCH.** Kyle's catch. |
| **2** | **RANKING** across candidates | the same cache; the 15-minute bar close on the xStock side | ◐ **THIS BATCH — expected outcome "no change", argued not assumed** |
| **3** | **TRIGGERING** a stop or target | `active-execution-engine.ts:1503` | ✅ **`F-G-2` OBJ-0/OBJ-1 — SHADOW ARM LIVE ON CRYPTO. DO NOT RE-SCOPE.** xStock legs HELD at `F-G-2` §7.4 rows 1-2. |
| **4** | **BOOKING** the result | the fill path | ✅ **`F-G-2` OBJ-5a/5b/5c SHIPPED** (VTS mark-booked, maker leg, epoch cut) |

### 2.1 ⭐ THE SHADOW ARM HAS ALREADY ANSWERED THE TRIGGER QUESTION, AND NOBODY HAS READ IT

**OBJECT:** `closed_trades.metadata.fg2Shadow`, which records the instant the **BID** would have triggered the exit beside the instant the **MID** actually did.
**POPULATION:** every close since the `F-G-2` deploy `2cc4a03ec` @ 2026-09-02T08:49:47Z carrying **both** arms — **n = 6** (of 12 closes in the window; 0 carry `fg2ShadowSkip`). **Crypto only, by design.**

| symbol | bid arm | mid arm | mid fired LATER by | bid worse by waiting |
|---|---|---|---|---|
| XMR/USDT | `stop_hit` | `stop_hit` | **33.5 min** | −0.134% |
| APR/USD | `stop_hit` | `stop_hit` | **22.6 min** | −0.108% |
| CHIP/USD | `stop_hit` | `stop_hit` | **17.3 min** | −0.342% |
| XMR/USD | `stop_hit` | `stop_hit` | **13.5 min** | −0.012% |
| CRV/USD | `stop_hit` | `stop_hit` | 0.9 min | +0.005% |
| XMR/USD | `stop_hit` | `stop_hit` | 0.1 min | +0.016% |

★ **WHAT IT SAYS:** both arms agree on **WHAT** happens — 6 of 6 are `stop_hit` on both — and differ on **WHEN**. The mid fires **later every time**, by 0.1 to 33.5 minutes, and in **4 of 6** the bid we would actually have sold at is **worse** for having waited.
⇒ **The damage is DELAY, not the half-spread accounting I have been describing to Kyle.** The mid lags the bid on the way down, so the stop fires late, and late is worse.

⚠️⚠️ **HONEST LIMITS, STATED BEFORE THE NUMBER IS USED FOR ANYTHING: n = 6. CRYPTO ONLY. ALL SIX ARE STOPS — there is not a single `target_hit` in the population, so this says NOTHING about the target side, where the same lag would fire targets LATE and therefore FAVOURABLY.** The magnitudes are small (max 0.342%). **This is a preliminary read of a live instrument, not a result.** It is in this scope to show the decision is measurable **without a new window**, not to pre-judge it.

---

## 3. WHAT THIS BATCH DOES **NOT** DO

1. ⛔ **It does not re-scope `F-G-2`.** The exit-trigger switch (job 3) and the booking work (job 4) are its objectives, its shadow arm and its close criteria.
2. ⛔ **It does not remove the midpoint mark** — see §1. Directive 8.9.1's reasoning stands.
3. ⛔ **It does not touch the xStock exit-decision legs** held at `F-G-2` §7.4 rows 1-2.
4. ⛔ **It invents no new threshold.** If a choice needs a number we do not already have, it is a finding with a disposition, not a knob added under time pressure.

---

## 4. NUMBERED OBJECTIVES, EACH WITH ITS VERIFICATION CRITERION

**OBJ-1 — ESTABLISH, AT THE CODE, EVERY SITE WHERE A MARK BECOMES A LEVEL.** Enumerate repo-wide (tests excluded) every site that derives an entry, stop or target from the price cache or from a bar close. **Not a path trace — a census at every hop** (§9.5(a)), and the entry points enumerated FIRST (§9.5(a-ii)) so a second producer cannot hide behind the first.
*Verification:* the census is committed as a table of `path:line` at `origin/migration/aws-supabase`, each row saying whether the value it consumes is a mid, a bar close, or a transactable side. **If a list has exactly one member, it says so explicitly.**

**OBJ-2 — DECIDE THE RULE, WITH LANGSTON, AND WRITE IT DOWN AS A RULE RATHER THAN A DIFF.** Candidate, to be attacked rather than confirmed: *a price that ESTIMATES VALUE stays the mid; a price that BECOMES A LEVEL, FIRES AN ACTION, or IS RECORDED must be the side we could transact at.*
*Verification:* the rule lands in `SYSTEM_MANUAL.md` with its failure direction stated, and every site in OBJ-1's census is classified under it. **A site the rule cannot classify falsifies the rule.**

**OBJ-3 — LEVEL/TRIGGER CONSISTENCY, AND IT IS THE OBJECTIVE MOST LIKELY TO BE GOT WRONG.** ⛔⛔ **A stop placed 3% below the MID but fired on the BID is tighter than 3% by half the spread, and nothing would say so.** Whatever OBJ-2 decides, the level and the trigger must be set on the SAME side, and that property must be enforced where it cannot be forgotten.
*Verification:* a fence that fails if a level-setting site and its trigger site read different sides — **shipped with a positive control proving the fence can see a mismatch**, per the standing rule this crew earned on 2026-09-03.

**OBJ-4 — READ THE SHADOW ARM PROPERLY WHEN IT HAS A TARGET IN IT.** §2.1 is 6 rows and all stops. **The target side is unmeasured and the lag works the opposite way there.**
*Verification:* the read is re-run against a population containing at least one `target_hit` on both arms, or it is reported as **still unmeasured on the target side** — never averaged over a population that has none.

**OBJ-5 — RANKING: ARGUE THE "NO CHANGE" EXPLICITLY.** The expected answer is that a mid is correct for ranking, because it is a relative comparison applied identically to every candidate.
*Verification:* stated out loud with its reason in the pre-audit, not skipped by default (§9 anti-pattern). **If ranking also sets a level, it is an OBJ-1 site and the rule governs it.**

---

## 5. WHAT WOULD FALSIFY THE PREMISE

- **If the census (OBJ-1) finds levels are already derived from a transactable side**, the batch is far narrower than this scope assumes and re-declares.
- **If the shadow arm, once it holds targets, shows the mid firing targets late and profitably**, then "always the transactable side" is too simple and the rule needs a per-direction form — which is a design change, not a tuning knob.
- **If Directive 8.9.1's staleness problem is worse than the level error**, the mark stays everywhere and this batch closes as disposition (1).

---

## 6. STATUS

**Step 1 — scope drafted, dispatched to Langston.** Board card `B-PRICE-SIDE-BY-JOB` created in `Scope`, `Blocked on = Langston`.
