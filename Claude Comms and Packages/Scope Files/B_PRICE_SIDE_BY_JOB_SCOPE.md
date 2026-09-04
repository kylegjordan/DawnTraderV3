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

⚠️⚠️ **AND THE ADJUDICATION I QUOTED IS SITED IN A BLOCK MARKED HISTORICAL (Langston FINDING-A, re-read at `b0e78d9a7`).** `SYSTEM_MANUAL.md:8439-8440` is verbatim as quoted — but it is housed inside the **Directive 8.9.0-B** block whose status line reads *"REMOVED — P19-B6.7 … The text below is retained for historical reference only."* **The substance describes a LIVE path; the siting says historical.** ⇒ ✅ **OBJ-6 DISCHARGED 2026-09-04/05 — MARKED IN PLACE, NOT MOVED, AND THE CITATION NOW POINTS AT THE LIVE HOME.** The `8.9.0-B` block carries an explicit in-place marker (*"THE PARAGRAPH BELOW DESCRIBES A **LIVE** PATH AND IS SITED INSIDE A BLOCK HEADED 'REMOVED … retained for historical reference only' … THE SITING IS WRONG, NOT THE TEXT (B-PRICE-SIDE-BY-JOB P9, 2026-09-04)"*), and the **live home is the "The LEVEL BASIS" section under Net Execution Geometry** — cite THAT for current behaviour.
★ **MARKED RATHER THAN MOVED, DELIBERATELY, AND THE REASON IS THE FAILURE THIS BATCH KEEPS MEETING: excising the note would leave the `8.9.0-B` block reading as though the mark substitution DIED WITH THE ADAPTER. It did not — the adapter was deleted and the substitution is live.** ⇒ **a silent removal would have converted a mis-sited truth into an absent one, which is strictly worse.**
⚠️ **RESIDUAL, NAMED: two homes now exist for one fact, which is the `#641` shape.** It is accepted here because they are not peers — **the historical block holds a POINTER and the live section holds the STATEMENT** — and the pointer says so in its own text. **If they ever both state it, that is the drift, and the pointer is the one to cut.**

⇒ ⛔⛔ **DISPOSITION FOR THE CRYPTO PRODUCER: (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT. NOT (1), NOT (4).**

---

### 1.1 ⛔⛔ BLOCKER-1 — THERE ARE **TWO** PRODUCERS AND I RAN 1.b ON ONE OF THEM (Langston, re-derived at the object)

⚠️⚠️ **MY r1 CLAIM OVER-REACHED ITS BLAST RADIUS, AND IT DID SO ONTO THE EXACT POPULATION I NAMED AS THE REASON NOT TO TOUCH ANYTHING.** I argued that removing the mid would re-introduce the 8.9.1 staleness defect *"on the low-volume xStock universe, which is most of it."* **Directive 8.9.1 does not reach the xStock universe at all.**

**MEASURED AT THE OBJECT:** `translateV2ToV1` has exactly **ONE** consumer — `kraken-websocket-adapter.ts:680` — so 8.9.1 governs the **crypto ticker path only**. The xStock mid is a **DIFFERENT PRODUCER**: `equity-spot-archiver.ts:173-174` via `markKindOf`. ★ **And `mark-kind.ts:9-11`, a file I had already read, states the split in its own header:** *"they cite different provenance (`8.9.1` for the translator, `P19-B8.5` for the archiver)."* **I read past it.** My own `B_EXIT_TRANSACTABLE_SIDE_2_SCOPE.md:674` says the same thing at the same ref.

**THE xSTOCK PRODUCER'S OWN PROVENANCE, quoted verbatim from the code that carries it** — `equity-spot-archiver.ts:104`:

> `// ── P19-B8.5 xSTOCK MARKS (Langston design-APPROVED 2026-07-16) ──`

⇒ ⛔ **DISPOSITION FOR THE xSTOCK PRODUCER: ALSO (2), BUT ON DIFFERENT GROUNDS AND WITH A STANDING CAUTION.** It is a **Langston design-APPROVED decision**, so §9.5(b-ii) applies directly: re-scoping it as a defect is the precise failure that rule exists to prevent. It is in scope only as *a mark serving jobs it was not chosen for* — never as *a mark that is wrong*.

⛔⛔ **AND ITS FALLBACK SEMANTICS DIFFER, WHICH MATTERS FOR THIS BATCH:** `markKindOf` (`mark-kind.ts:33-35`) returns `'last'` when **EITHER** side is missing. On the xStock side a missing bid therefore falls back to the **LAST TRADE** — which is the stale-mark case `B-XSTOCK-FEED-SANITY` is measuring right now. ⇒ **The two producers fail in different directions, so a single rule that classifies both must be argued, not assumed.**

★★ **AND THIS IS THE FINDING THAT SHOULD DRIVE THE WHOLE BATCH, BECAUSE IT IS NOT THE ONE I EXPECTED TO FIND.** The midpoint was chosen — deliberately, correctly, and for a reason that still holds — to be a better **MARK**: a continuous estimate of value on a pair whose last trade goes stale. **It was never evaluated as a TRIGGER, as a LEVEL, or as a BOOKED RESULT.** It acquired those three jobs silently, by being the value sitting in the field every consumer reads.

⇒ ⛔ **SO THIS BATCH MUST NOT REMOVE THE MIDPOINT MARK.** Doing so would re-introduce the stale-last-trade defect that Directive 8.9.1 correctly fixed, on exactly the low-volume pairs that are most of the xStock universe. **The change is to stop a value chosen as an ESTIMATE from serving as a LEVEL and a TRIGGER** — which is a narrower, safer and more defensible change than "switch to the bid", and it is what the provenance read bought.

---

## 2. THE FOUR JOBS — AND WHAT IS ALREADY SCOPED ELSEWHERE

⛔⛔ **§9.5(b-ii) CHECK RUN FIRST, AND IT MOVED THE SCOPE: TWO OF THE FOUR JOBS ARE ALREADY OWNED BY `F-G-2`, WHICH IS DEPLOYED AND MEASURING.** Kyle's *"I feel like we've been at this point before"* is **correct**, and re-scoping `F-G-2`'s work here would be the exact failure §9.5(b-ii) exists to prevent.

| # | job | where the price comes from | status |
|---|---|---|---|
| **1** | **SIGNAL GENERATION** — a setup exists, and **where entry/stop/target SIT** | ⚠️ **ILLUSTRATION ONLY, NOT THE CENSUS (Langston FINDING-2):** `:2387` is the scan preamble and `:2276-2278` is the **pattern-lane FALLBACK** branch (`?? currentPrice*0.97` / `*1.03`) — the same fabricated-constant class as `#927`. **The QUANT lane is where levels are actually set, and it is OBJ-1's job to enumerate it.** | ⛔ **UNSCOPED — THIS BATCH.** Kyle's catch. |
| **2** | **RANKING** across candidates | the same cache; the 15-minute bar close on the xStock side | ◐ **THIS BATCH — expected outcome "no change", argued not assumed** |
| **3** | **TRIGGERING** a stop or target | `active-execution-engine.ts:1503` | ✅ **`F-G-2` OBJ-0/OBJ-1 — SHADOW ARM LIVE ON CRYPTO. DO NOT RE-SCOPE.** xStock legs HELD at `F-G-2` §7.4 rows 1-2. |
| **4** | **BOOKING** the result | the fill path | ✅ **`F-G-2` OBJ-5a/5b/5c SHIPPED** (VTS mark-booked, maker leg, epoch cut) |

### 2.1 ⚠️ THE SHADOW ARM IS RUNNING AND NOBODY HAD READ IT — WHAT IT HAS PRODUCED SO FAR, AND WHY IT SETTLES NOTHING YET

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
⇒ **The observable damage is DELAY, not the half-spread accounting I had been describing to Kyle.**

⛔⛔ **BUT I NAMED THE MECHANISM WRONG, AND IT WOULD HAVE REACHED KYLE AS REASSURANCE (Langston Q3(c)).** *"The mid lags the bid"* **is not lag.** The mid sits a **STATIC HALF-SPREAD** above the bid; the observable DELAY is that offset **÷ price velocity**. ⇒ ★★ **THAT INVERTS THE REASSURANCE: the delay is UNBOUNDED ON A QUIET TAPE and near-zero on a fast one.** So *"magnitudes are small, max 0.342%"* describes **this sample**, not **the exposure** — and the sample is six trades drawn from whatever velocity happened to obtain. **LABELLED HYPOTHESIS (rule 29(c)) until the offset-÷-velocity form is measured against realised move.**

⛔⛔ **AND IT IS NON-LOAD-BEARING FOR EVERY OBJECTIVE IN THIS BATCH (Langston Q3(b)).** It is **`F-G-2`'s instrument, inside `F-G-2`'s still-open window, and `F-G-2`'s pre-registration (A1–A4) governs its interpretation.** ⇒ **No objective here may rest on it, and `F-G-2` Step 8 may NOT cite this scope back as independent support** — that would be `#452`, a reviewer ruling on a gloss of his own instrument.

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
*Verification:* the census is committed as a table of `path:line` at `origin/migration/aws-supabase`, each row saying **which KIND** of value it consumes. **If a list has exactly one member, it says so explicitly.**

⛔⛔ **AND THE TAXONOMY IN r1 WAS ALREADY FALSIFIED BEFORE IT WAS WRITTEN (Langston FINDING-1) — THIS IS THE SINGLE MOST IMPORTANT ROW OF THE CENSUS.** r1 offered three kinds (mid / bar close / transactable side). **The crypto QUANT lane's level input is none of them:** `signal-orchestrator.ts:2400` `getSmoothedPrice(...)` → `:2425 const currentPrice = smoothedPrice` → `:2456 mce.computeContext(...)` → `:2513 currentPrice: mceContext.indicators.currentPrice` → the 19-strategy dispatch. **A KALMAN-SMOOTHED MID IS A FOURTH KIND**, and by OBJ-2's own falsification clause it **falsifies the rule as r1 stated it**.
⇒ ★★ **AND IT KILLS THE EASY IMPLEMENTATION: "put the level on the transactable side" is NOT a substitution on this lane, because a FILTER sits between the price and the level.** Smoothing a bid is not the same object as smoothing a mid, and the filter's own state carries the old basis across the change.
⚠️ **LANGSTON'S STATED LIMIT, CARRIED VERBATIM RATHER THAN GLOSSED:** *"I verified the smoothed value is handed to MCE at `:2456` and read back at `:2513`; I did NOT verify MCE passes it through unchanged — that is OBJ-1's job and must be a census row."* ⇒ **that pass-through is a REQUIRED census row, and it is not assumed in either direction.**

**OBJ-2 — DECIDE THE RULE, WITH LANGSTON, AND WRITE IT DOWN AS A RULE RATHER THAN A DIFF.** Candidate, to be attacked rather than confirmed: *a price that ESTIMATES VALUE stays the mid; a price that BECOMES A LEVEL, FIRES AN ACTION, or IS RECORDED must be the side we could transact at.*
*Verification:* the rule lands in `SYSTEM_MANUAL.md` with its failure direction stated, and every site in OBJ-1's census is classified under it. **A site the rule cannot classify falsifies the rule.**

**OBJ-3 — PER-LEG TRANSACTABILITY. ⛔⛔ THIS OBJECTIVE WAS WRONG IN r1 AND THE CORRECTION IS THE MOST IMPORTANT THING IN THE SCOPE (Langston BLOCKER-2).**

⚠️⚠️ **r1 SAID "THE LEVEL AND THE TRIGGER MUST BE ON THE SAME SIDE." THAT IS NOT ACHIEVABLE AND IT IS THE WRONG INVARIANT.** **An entry is a BUY and fills on the ASK. A stop and a target are SELLS and fire on the BID.** They are opposite sides *by construction* — demanding they match asks for something the market does not offer.

⛔⛔ **THREE SIDES ARE IN PLAY, NOT TWO: the level BASIS (a mid), the entry FILL (the ask), and the exit TRIGGER (the bid).** ⇒ **a stop set 3% below a mid-derived entry, fired on the bid, against a real ask fill, has realised risk ≈ `(0.03·mid + h)/(mid + h)` for half-spread `h` — OUT BY ROUGHLY A FULL SPREAD, NOT HALF**, and **R:R moves in OPPOSITE directions on the two legs.**
★★ **I TOLD KYLE "HALF THE SPREAD" TWICE. THAT UNDERSTATED IT BY A FACTOR OF TWO AND IT IS CORRECTED TO HIM IN THE SAME TURN AS THIS REVISION.**

⇒ ✅ **THE INVARIANT IS PER-LEG TRANSACTABILITY: each leg is expressed on the side THAT LEG transacts at, and R:R is computed from those** — never from a common basis that no leg trades on.

*Verification:* a fence asserting per-leg transactability across the level-setting and trigger sites, **shipped with a positive control proving it can see a mismatch** (the standing rule this crew earned on 2026-09-03: a negative assertion must first prove it can see the thing present).
⛔⛔ **AND r2 STILL HAD IT WRONG — IT PINNED THE FENCE TO AN EVENT THAT DOES NOT OCCUR (Langston BLOCKER-3, re-derived at the ref).** r2 said *"`F-G-2` OBJ-0 lands first — it is deployed."* ★ **THAT CONFLATES THE INSTRUMENTATION DEPLOY WITH THE RUN.** `F_G_2_PROGRESS_REPORT.md:7` — OBJ-0 *"measures the bid-side decision as a SHADOW arm **before switching anything**"*; `:33` — *"the run is NOT armed yet"*. **The live trigger stays on the MID for the whole 14-day window**, and the switch at window close is **conditional** (`:40`: n-floor 20, Wilson upper bound < 5%, else a depth guard is a precondition). ⇒ **my declared trip event has no date and no certainty.**

⇒ ⛔ **AND THE JOINT DOES NOT MOVE TO `F-G-2` EITHER (I asked; the answer was "neither"): `F-G-2` CHANGES NOTHING ON THE LIVE DECISION PATH, SO IT CANNOT OWN A JOINT IT NEVER CREATES.** The joint belongs here, because this batch owns the census.

✅ **SO OBJ-3 SPLITS — IT WAS CARRYING TWO INVARIANTS UNDER ONE NAME:**

**OBJ-3a — PER-LEG LEVEL TRANSACTABILITY. Internal to this batch, assertable, ships with the change.** Each leg expressed on the side that leg transacts at, and R:R computed from those.
*Verification:* a fence asserting it across the level-setting sites, **with a positive control proving it can see a mismatch**.

**OBJ-3b — LEVEL-BASIS ↔ TRIGGER-BASIS COHERENCE. ⛔ NOT ASSERTABLE DURING THE `F-G-2` WINDOW, AND THAT IS THE WHOLE POINT.** While levels sit on the bid and the trigger still fires on the mid, the two are **deliberately mismatched** — so a pure consistency assertion would **trip on its own landing**, which is a fence that punishes correct work.
⛔⛔ **AND r3's ANSWER — "a required row in the switch's own checklist" — WAS WORSE THAN I THOUGHT, AND NOT FOR THE REASON I GUESSED (Langston, r3).** I asked whether a row in someone else's checklist was too weak a home. **It is not weak because it is someone else's. IT IS WEAK BECAUSE NO SUCH CHECKLIST EXISTS AT THE REF, AND ITS TRIGGER IS AN EVENT THAT MAY NOT OCCUR.** `PHASE_19_PLAN.md` has **no switch row and no switch batch**. What `F-G-2` has is a **WINDOW-CLOSE** checklist — and **window close ≠ switch**: the switch is conditional, with a pre-registered branch in which the window closes and **the switch does not happen** (the guard becomes a precondition). ★ **My own §4a says 52 stop-side bid-arm first exits "may well NOT EXIST in 14 days"** — so I homed an obligation in a document that only comes into being on the branch I myself rated least likely. **And `F-G-2` already parks one deferral at that same non-event** (`false_target_rate` → the post-switch calibration decision). **Two deferrals collecting at an undated conditional is §9.4's "queued is not a home", one level up.**

⇒ ✅ **THE FIX IS NOT A HARDER HOME — IT IS NO DEFERRAL AT ALL.** ⛔ **r4 CLOSED THIS SENTENCE WITH A CLAUSE ASSERTING THE TWO DATES MADE THE FIX COSTLESS. THAT CLAUSE IS STRUCK, AND IS DELIBERATELY NOT REPRODUCED HERE — it rested the whole fix on a coincidence between an approximation I wrote and a date that can move five ways, and reproducing retired wording is how a search for it stops meaning anything (the `F-CROSSED` fence lesson, same day).** ⇒ ⭐ **WHAT ACTUALLY MAKES IT FREE IS THE DEPENDENCY BELOW: `F-G-2`'s DISPOSITION IS KNOWN AT OBJ-3b's OWN DEPLOY BECAUSE THE DEPLOY IS GATED ON THAT DISPOSITION BEING RECORDED — not because two dates happen to line up.** So OBJ-3b is not pre-committed to counter-then-promote; **its FORM is decided at its deploy by reading that disposition:**

| `F-G-2` disposition at window close | OBJ-3b ships as |
|---|---|
| **switch THROWN** | ⇒ **an ASSERTION. No counter, no promotion, no residual obligation.** |
| **switch DEFERRED behind the depth guard** | ⇒ **counter form — AND the guard batch is placed as a REAL PLAN ROW WITH AN OWNER in the same turn, carrying OBJ-3b's promotion as one of its objectives.** ★ **A checklist row dies with its document; a plan row does not.** |
| **window VOID / re-opened** | ⇒ **re-arms against the new window; the decision is re-taken, never inherited.** |
| **the mismatch becomes the STANDING state** | ⇒ **OBJ-3b is promoted to an assertion OF THE MISMATCH — never left as a counter of a condition nobody intends to fix.** |

*Verification:* the disposition is read from `F_G_2_PROGRESS_REPORT.md` **at the ref, on the day of this batch's deploy**, and the branch taken is recorded in this scope's status section with the ref it was read at.

⛔⛔ **CONDITION ON THE COUNTER FORM, AND IT CORRECTS AN ASYMMETRY THAT WAS BACKWARDS (Langston r3):** OBJ-3a's fence carries a positive control and the counter carried none — **but the COUNTER is the one whose ZERO gets read at promotion time.** A zero with no control is indistinguishable from a counter that never fired (`#661` leg 3; the F-G-1 *"increments something nothing reads"* shape). ⇒ **the counter ships with (i) a NAMED READER, (ii) a stated READ CADENCE, and (iii) a POSITIVE CONTROL demonstrating it increments on a constructed mismatch — before any zero it reports is read as agreement.**

⛔⛔ **AND THE ORDER IS NOT MINE TO ARRANGE — IT IS SET BY A WINDOW (Langston BLOCKER-4, pre-registered in `F-G-2` §4a this turn).** A level-basis change **moves the thing both `F-G-2` arms are compared against**, which is more perturbing than the two cadence changes A4 already enumerates and is plausibly **VOID-grade** rather than split-grade. ⇒ **OBJ-1, OBJ-2, OBJ-5 and OBJ-6 are READ-ONLY and run NOW, in parallel. Only a crypto DEPLOY is gated.**

⇒ ⛔⛔ **THE DEPLOY GATE IS A DEPENDENCY, NOT A DATE — AND I WROTE IT AS A DATE FIRST (Langston C1, 2026-09-03; I flagged my own coincidence and he confirmed the distrust was warranted).** **`2026-09-18T16:08Z` IS NOT AN EXACT DATE. It is the OUTPUT of a conditional chain with FIVE pre-registered ways to move:** the origin is *"the LATER of {F-G-1 PASS, the rider deploy}"* (`F_G_2:34`) and the rider was still pending; F-G-1 may return something other than PASS on 09-04; a cadence deploy inside the window **SPLITS** it (`:40`); **one extension is explicitly pre-registered** (`:50`) and my own §4a says the 52-row floor *"may well NOT EXIST in 14 days"*; and a VOID re-arms on a new window.
⛔ **A DATE-SHAPED GATE ON A MOVING WINDOW FAILS IN THE EXACT DIRECTION THE GATE EXISTS TO PREVENT:** if the window EXTENDS and I deploy because *"~09-18 arrived"*, the level-basis change lands **INSIDE** the window — the VOID-grade perturbation I pre-registered myself.
⇒ ✅ **THE GATE, IN ITS BINDING FORM: NO CRYPTO DEPLOY OF THIS BATCH BEFORE `F-G-2`'s DISPOSITION IS RECORDED AT THE REF.** ★ **This is strictly stronger AND it keeps the property for free: "the disposition is known at OBJ-3b's own deploy" then holds BY CONSTRUCTION on every branch — PASS, SPLIT, VOID, EXTEND — instead of on the one branch where a coincidence I authored happens to be true.** **EXTEND simply means the deploy waits, which is the gate working rather than a case needing its own row.**
★ **I had written the order as convenience and Langston named it: the honest reason is a measurement window I would otherwise have voided, in a batch I also own.**

**OBJ-4 — READ THE SHADOW ARM PROPERLY WHEN IT HAS A TARGET IN IT.** §2.1 is 6 rows and all stops. **The target side is unmeasured and the lag works the opposite way there.**
*Verification:* the read is re-run against a population containing at least one `target_hit` on both arms, or it is reported as **still unmeasured on the target side** — never averaged over a population that has none.

**OBJ-5 — RANKING: ARGUE THE "NO CHANGE" EXPLICITLY.** The expected answer is that a mid is correct for ranking, because it is a relative comparison applied identically to every candidate.
*Verification:* stated out loud with its reason in the pre-audit, not skipped by default (§9 anti-pattern). **If ranking also sets a level, it is an OBJ-1 site and the rule governs it.**

**OBJ-6 — FIX THE SITING OF THE ADJUDICATION THIS SCOPE RESTS ON (Langston FINDING-A).** `SYSTEM_MANUAL.md:8439-8440` carries a live-path adjudication inside a block whose status line says *"REMOVED … retained for historical reference only."*
*Verification:* the text is moved to a live section or marked as live-in-place, and **this scope's §1 citation points at the corrected siting**. ⛔ **Until then §1 quotes it WITH its siting stated** — a live claim sourced from a block labelled historical is a citation that cannot survive its own reader.

---

## 5. WHAT WOULD FALSIFY THE PREMISE

- **If the census (OBJ-1) finds levels are already derived from a transactable side**, the batch is far narrower than this scope assumes and re-declares.
- **If the shadow arm, once it holds targets, shows the mid firing targets late and profitably**, then "always the transactable side" is too simple and the rule needs a per-direction form — which is a design change, not a tuning knob.
- **If Directive 8.9.1's staleness problem is worse than the level error**, the mark stays everywhere and this batch closes as disposition (1).

---

## 6. STATUS

**Step 1 r4 — CHANGES-NEEDED (r3) applied; re-dispatched.** ⚠️ **THIS LINE READ "Step 1 r2" ON AN r3 DISPATCH (Langston r3, fix (a)) — in the one section whose entire job is to state status, which already carries a `verification-weaker-than-claim` note for exactly this.** Second instance in the same paragraph; the note below stands and this is its recurrence.

⛔ **r1 OF THIS SECTION ASSERTED THE BOARD CARD EXISTED. IT DID NOT.** Langston's census returned **77 of 77, `hasNextPage: false`, assertion passed** — a measured absence, not a query that missed it. ★ **A false statement of fact in my own scope, in the one section whose entire job is to state status.** The card now exists (board total 78, verified by the same enumeration), set `Status = Scope`, `Owner = Analyst`, `Blocked on = Langston`.

**MISTAKE: verification-weaker-than-claim** — wrote a status line describing an action I had not taken, in a document whose §1 correctly insists every claim be re-derived at the object.
