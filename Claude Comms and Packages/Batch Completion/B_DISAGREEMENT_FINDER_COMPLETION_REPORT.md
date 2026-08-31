# B-DISAGREEMENT-FINDER — COMPLETION REPORT

**Owner:** CC-A · **Closed:** 2026-08-31 · **change-class:** `non_architecture`
**Scope** `1ceeaf0b2` (Step-1 APPROVED r2) · **Pre-audit + pre-registration** `8dd1152e9` · **r4 census** `3a4dfe073` · **Langston's verdict** 2026-08-31 05:07Z

---

## ⛔⛔ STATED AT THE TOP: THIS BATCH CLOSES ON A **NEGATIVE RESULT**. IT DID NOT SHIP A DETECTOR, AND IT SHOULD NOT HAVE.

**The pre-registered gate FAILED and is recorded as a failure, not converted into a delay.**

| the criterion, quoted as written at `8dd1152e9` | the outcome |
|---|---|
| *"More than 3 of 9 wrong under the corrected criterion ⇒ the frame is still wrong and substantive finds do not rescue it."* | ⛔ **7 DETECTOR ERROR · 2 SUBSTANTIVE · 0 TRIVIAL** |
| *"≥1 substantive ⇒ build the recurring pass."* | **2 substantive — but the primary gate is the error rate, and it fails first.** |

★★ **AND IT HOLDS UNDER THE MOST GENEROUS REPAIR AVAILABLE TO ME, which is the number that matters because it is the one I cannot engineer away:** fix the extraction unit, flip `#489` and `#669` outright, **and it is still 5 of 9.** ⇒ **the frame fails WITHOUT leaning on the instrument bug at all.**

⚠️ **A criterion chosen after seeing the window can always be made to pass. This one was committed before the draw, and it is applied as written.**

---

## 1. THE FINDING THAT OUTLIVES THE BATCH — **THE AXIS WAS WRONG**

⛔⛔ **THE DETECTOR ASKS *"DO TWO COPIES DISAGREE?"* — AND THE FAILURES THAT ACTUALLY COST US ARE EVERY COPY *AGREEING*, ALL OF THEM LAGGING THE SYSTEM.** Langston's word for it: **CONSENSUS STALENESS.** **A disagreement-detector is blind to it BY CONSTRUCTION.**

**His three measured instances, none of which this instrument could ever have caught:**
- his own `MEMORY.md` carried **four stale headings**;
- **every batch carried *"CI 4/4 unsatisfiable"* for three weeks** after `#669` closed it;
- `#732` had **three copies of a withdrawn posture**.

★ **It caught `#732` ONLY because one copy happened to lag the CORRECTION rather than the STATE — an accident of which way the staleness ran, not a capability.**

**TWO VERDICTS ARE WORTH QUOTING BECAUSE THEY INDICT THE DESIGN, NOT THE CODE:**
- ⛔ **`#301` — THE DETECTOR TAXES COMPLIANCE.** `RUNNING_ISSUES` (resolved) vs `SYSTEM_MANUAL` (architecture): *"They agree — and §17 REQUIRES that pair to exist. A batch that does its SysManual content update manufactures a hit."*
- ⛔ **`#669` — MY INSTRUMENT REPRODUCED THE DEFECT IT WAS BUILT TO FIND.** The register appends updates chronologically rather than editing the entry, so `#669`'s resolution sits physically **inside the `#675` region**. *"A per-heading slice structurally cannot see it."*

⇒ **THE RE-AIM, in his words: three things this census DID surface are all SINGLE-FILE and none needs a two-home compare — a superseded block retained beside a resolution · an id whose live work sits under a closed heading · a copy lagging a withdrawal.**

---

## 2. OBJECTIVES

| # | objective | verdict | evidence |
|---|---|---|---|
| **1** | detector: exact IDs, never similarity | ✅ **YES** | 549 homed · 438 single-homed (positive control) · 111 multi-homed at pinned ref `e4425782` |
| **2** | separate true multi-homing from namespace collision | ⚠️ **PARTIAL** | split works, **but Langston proved the (a)/(b) axis cannot catch a collision where one side IS the register** |
| **3** | output decides nothing; both texts, no recommendation | ✅ **YES** | 9 pairs emitted with empty verdict slots; no recommendation anywhere |
| **4** | mutation test proven to fire | ✅ **YES — AND IT IS THE BATCH'S BEST RESULT.** See §3 | caught 2 of my own bugs before either reached review |
| **5** | attach to the live checker | ⛔ **NOT DONE — CORRECTLY** | the gate failed at Step 2; nothing was built |
| **6** | governance | ✅ **YES** | §5 ledger |

---

## 3. ✅ THE MUTATION TEST EARNED ITS PLACE — IT CAUGHT TWO OF MY BUGS BEFORE REVIEW

★★ **This is the one mechanism in the batch that demonstrably worked, and it is worth more than the detector would have been.**
1. ⛔ **MY FIRST FIX OVERCORRECTED.** Told to reject one form, I *also* required a state token — a condition nobody asked for. **Multi-homed fell 151 → 5 and it MISSED `#732`, the one case verified by hand.** Arm 2 failed and stopped me. ⇒ **implement what was asked, not what I assumed was implied.**
2. ⛔ **MY GENRE AXIS CLASSIFIED PER *ID* INSTEAD OF PER *PAIR*.** `#732` has three homes — two living and genuinely disagreeing, plus one frozen — and taking the *set* of genres collapsed it to `LIVE-vs-FROZEN`, **dropping the verified true positive out of the target set.**

⚠️ **Neither reached Langston. Both were mine, and the check found them.**

---

## 4. WHAT THIS BATCH ACTUALLY DELIVERED, DESPITE CLOSING NEGATIVE

- ✅ **`#732` FIXED — a live stale guard, in a file I own.** `MISTAKE_PATTERNS.md` presented a tripwire as the standing guard for a deferral **Kyle had re-opened four days earlier**, and the tripwire's population **IS the mislabelled rows**, so a clear reading proves nothing. Superseded-banner added, original preserved (`#339` NO-TRIM), run-log entry left intact.
- ✅ **`#970` — the multi-homing measurement**, pinned and reproducible: 556 homed · 151 multi-homed · 405 single-homed control · **96% of comparable pairs sharing under half their text**, which is what killed the consolidation design.
- ✅ **KYLE'S OBJECTION WAS TESTED AND CARRIED THE BATCH.** *"We end up losing real decisions that were slightly different."* **96%, measured.** Consolidation was removed from the design before any code existed.
- ✅ **The 168-pair `LIVE-vs-FROZEN` surface published by file-pair** — Langston's asymmetry: a wrongly-LIVING pair enters and he kills it; **a wrongly-FROZEN pair leaves silently and nobody sees it.**
- ✅ **`#449` retired on evidence** — the checker's clone self-advances via `ExecStartPre`; the *"no deploy path at all"* record was stale.

---

## 5. GOVERNANCE LEDGER

**CHANGE-CLASS: `non_architecture`.** `REQ` = required for this class and cannot take `N/A`.

| document | req? | verdict | one line |
|---|---|---|---|
| `BATCH_CATALOG.md` | **REQ** | ✅ | entry added, recording the negative close |
| `PHASE_HISTORY.md` | **REQ** | ✅ | Phase-19 governance line |
| `PHASE_19_PLAN.md` | **REQ** | ✅ | row 8.5 closed; follow-on re-ranked per §6 |
| shared `MEMORY.md` + `MEMORY_CC_A.md` | **REQ** | ✅ | position + queue updated |
| the batch `SCOPE` | **REQ** | ✅ | r2, four conditions + two corrections |
| the `PRE_AUDIT` | **REQ** | ✅ | PART A pre-registration at `8dd1152e9` |
| the `COMPLETION_REPORT` | **REQ** | ✅ | this document |
| Langston's `MEMORY.md` | **REQ** | ✅ | the consensus-staleness class recorded |
| `RUNNING_ISSUES.md` | jdg | ✅ | `#970` filed; `#651` minted per §6 |
| `MISTAKE_PATTERNS.md` | jdg | ✅ | `#732` supersession banner |
| `SYSTEM_IMPACT_MAP.md` | jdg | **N/A** | ⛔ **nothing was built — the checker is unchanged** |
| `SYSTEM_MANUAL.md` · `CHANGES_AND_FIXES.md` · `POST_AUDIT_ROADMAP.md` · `ADJUSTMENT_FRAMEWORK.md` · `AUTHORITY_BASELINE.md` · `STORAGE_POLICY.md` · `DELETED_COMPONENTS_LOG.md` · `LANGSTON_ARCHITECTURE.md` | jdg | **N/A** | no architecture, parameter, retention, deletion or build change |

---

## 6. ⛔ THE FOLLOW-UP, RANKED BY KYLE'S OWN CRITERION

> **His criterion, verbatim: prioritise by *"how much it fixes the issue that we're trying to address right now, which is all these mistakes being made and constantly commented on … so that every time we try to run a batch, it's all commentary and reporting on mistakes and very little actual implementing."***

**MEASURED FROM THE LEDGER — 43 distinct patterns, 162 trailered instances (control: 166 raw occurrences, so 4 malformed; the instrument is sound). NINE are over the promotion threshold. The distribution is not flat:**

| pattern | instances | batches | share |
|---|---|---|---|
| ⛔ **`wrong-object`** | **77** | **24** | **48%** |
| `silence-not-evidence` | 12 | 8 | 7% |
| `verification-weaker-than-claim` | 9 | 6 | 6% |
| `fix-follows-pointer` | 8 | 6 | 5% |

⛔⛔ **ONE PATTERN IS HALF OF EVERY MISTAKE WE HAVE EVER RECORDED. THE TOP FOUR ARE 65%.**

★★ **AND THE DECIDING FACT, WHICH IS THIS PROGRAMME'S OWN THESIS ARRIVING AS A NUMBER: `wrong-object` IS ALREADY THE MOST HEAVILY RULED PATTERN WE OWN** — `CLAUDE.md` rule 29, `CONDUCT.md` §10, and slot 1 of the always-loaded short list. ⇒ **THE MOST-RULED PATTERN IS THE MOST FREQUENT, BY A FACTOR OF SIX. Promoting these to further RULES would repeat the measured failure. The output must be a GATE.**

**⇒ RANKED, and the ranking is the recommendation:**

| rank | item | why it earns the position |
|---|---|---|
| **1** | ★★ **`B-MEASURE-GATE`** — the measure-time gate refusing a number with no stated object, population and ref | ⛔ **It gates the pattern that is 48% of all recorded mistakes.** Already Langston-approved and **unbuilt**. **Six times the leverage of anything else on the list.** ⇒ **MOVE IT UP THE QUEUE.** |
| **2** | **`B-STALENESS-SWEEP`** *(new — the re-aim)* | Langston's consensus-staleness class **plus** `fix-follows-pointer` (8/6) are the same defect. **All three of his surfaced shapes are SINGLE-FILE** — no two-home compare, so the design that just failed does not carry over. |
| **3** | the promotion pass for `silence-not-evidence` (12/8) and `verification-weaker-than-claim` (9/6) | real and over threshold, **but 13% between them against 48%** |

⚠️ **NOT STARTED, DELIBERATELY. Kyle's instruction: *"Let's not jump from one incomplete fix to starting up another."*** These are **placed**, not begun.

---

## 7. HONEST RESIDUAL — WHAT THIS BATCH DID NOT ESTABLISH

1. ⛔ **It never tested whether a working disagreement-detector would be USEFUL.** It established the axis is wrong. **Whether the re-aimed version is worth building is unproven.**
2. ⛔ **THE EXTRACTION UNIT IS STILL UNSTATED, and Langston required it be stated before anything else runs on this instrument.** `#669` proved a per-heading slice cannot see chronologically-appended updates. ⇒ **carried into `B-STALENESS-SWEEP` as its first item.**
3. ⚠️ **Five of the seven DETECTOR-ERROR verdicts rest on `RULED ON REPORTED FACT` for the quoted opposite side.** ★ **He states why it is tolerable and I am not improving on it: the extraction defect TRUNCATES AWAY RESOLUTIONS, so it can only make homes look MORE in conflict — it cannot manufacture agreement. The agree-verdicts are robust in the one direction the known bug runs.**
4. ⛔ **`#651` — open work living under a CLOSED heading, invisible to every open-issue enumeration.** Langston's disposition (3): its own item, **owner Infra Claude**, minted and placed per §6.
5. ⚠️ **`168` is per-PAIR; r3's `95` was per-ID.** Same objects, different unit — recorded so a reader diffing the two sees a unit change, not a number moving.
