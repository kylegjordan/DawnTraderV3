# OBJ-4 — LIVE FIRE RATE: **50.5%, AGAINST A 2% BAR. AS BUILT, IT DOES NOT SHIP.**

**Owner:** CC-A · 2026-08-31 · Step 3 · measured from the hook's own sink within ~40 minutes of wiring

---

## ⛔⛔ THE NUMBER, AND IT IS A DESIGN SIGNAL AVAILABLE BEFORE ANY ADJUDICATION

| | |
|---|---|
| invocations recorded | **122** |
| decided (hook did not bail) | **107** |
| **FIRED** | **54** |
| **FIRE RATE** | ⛔ **50.5%** |
| pre-registered bar | **≤1 false block per 50 gated results = 2%** |
| **ratio** | ⛔⛔ **25×** |

★★ **THE ARITHMETIC SETTLES IT WITHOUT ADJUDICATING A SINGLE FIRE: 25× IS THE CEILING REACHABLE *IF EVERY FIRE WERE A TRUE POSITIVE*.** A fire rate cannot be a false-positive rate — but when it exceeds the FP bar by an order of magnitude, **the bar is unreachable no matter how the fires adjudicate.** ⇒ **no sampling round is needed to know this design fails its own gate.**

⚠️ **AND THEY ARE PLAINLY NOT ALL TRUE.** One fire was `grep -c 'ITERATE TO CONSENSUS' <file>` used as an **existence check** — the count was never going to become a claim. The hook cannot tell that, because **whether a reading becomes a claim is not visible before the command runs.**

---

## 1. ⛔ THIS IS THE OUTCOME LANGSTON REJECTED AN ENTIRE DESIGN ARM TO AVOID

His Q2 ruling killed the output-anomaly predicate on exactly this ground: *"a zero, a round number, an empty result are properties of the result alone with no link to any claim — they are correct constantly, and that is a **banner-blindness generator**."*

⛔⛔ **I THEN BUILT ONE ANYWAY, ON THE OTHER SIDE OF THE EXECUTION BOUNDARY.** `grep -c` and *"a search that could return zero"* are **properties of the COMMAND alone with no link to any claim** — and they are correct constantly, because that is what ordinary work in this repository looks like. **Same defect, different surface, and I did not recognise it while writing the matcher he had just warned me about.**

---

## 2. THE PER-SHAPE BREAKDOWN — TWO OF THE FOUR ARE THE SAME DETECTOR

| shape | total fires | fires **ALONE** |
|---|---|---|
| `count-is-not-a-set` | 29 | ⛔ **0** |
| `absence-without-control` | 30 | ⛔ **1** |
| `truncation-is-not-population` | 11 | 11 |
| `worktree-not-ref` | 18 | 13 |

⛔ **`count-is-not-a-set` NEVER FIRES ALONE, AND `absence-without-control` FIRES ALONE ONCE.** Both key on `grep -c`. **They are one detector wearing two names**, and presenting them as two shapes overstated the design's coverage — a reader counting four shapes would infer four independent signals.
✅ **The two that do discriminate are `worktree-not-ref` (13 solo) and `truncation-is-not-population` (11 solo)** — and both are narrower: they key on a *specific* wrong surface (a CRLF checkout) and a *specific* truncation, not on a general-purpose tool.
★ **That is the shape of the fix, if there is one: PREDICATES THAT NAME A SPECIFIC WRONG OBJECT SURVIVE; PREDICATES THAT NAME A COMMON INSTRUMENT DO NOT.**

---

## 3. ⚠️ 15 OF 122 INVOCATIONS DID NOT DECIDE — AND THE SILENCE IS READABLE ONLY BECAUSE THE FIELD EXISTS

| reason | n |
|---|---|
| `parse_failed` | 8 |
| `no_command` | 8 |

★ **The `decided: false` field is what makes this visible at all.** Without it, 15 invocations would have produced no context and been indistinguishable from *"the command was clean"* — **a fail-open hook's silence reading as a pass, which is the enforcement-layer lookalike failure this batch exists to prevent.**
⚠️ **`parse_failed` × 8 IS AN OPEN UNKNOWN, NOT A DISMISSAL: the matcher is scoped to `Bash`, so a payload it cannot parse is unexplained.** ⛔ **NOT diagnosed, NOT hand-waved — recorded as unknown and owed an answer before any FP measurement is quoted, because 8 undecided invocations sit inside the denominator.**

---

## 4. ⇒ THE DISPOSITION I AM PUTTING TO LANGSTON, NOT TAKING

⛔ **OBJ-4 AS BUILT DOES NOT SHIP.** The question is whether it is *tunable* or *structurally misplaced*, and I think it is the second:

**THE MISSING SIGNAL IS "IS THIS READING ABOUT TO BECOME A CLAIM?" — AND IT IS NOT PRESENT BEFORE EXECUTION.** It lives in the result, and in what the session does next. ⇒ **a pre-execution stage can only ever fire on the instrument, and firing on the instrument is what produces 50%.**

★★ **WHICH IS AN ARGUMENT FOR LANGSTON'S OWN Q2 PREDICATE AND AGAINST MY OBJECTIVE: *"a RESULT THAT COULD NOT HAVE ANSWERED THE REQUEST"* is a claim-linked property, and it is only available on `PostToolUse`.** ⇒ **OBJ-4's work may belong in OBJ-6c rather than in front of it.**

✅ **WHAT SURVIVES REGARDLESS, and it is not nothing:**
- **`worktree-not-ref`** — a genuinely narrow, high-value predicate on a defect measured **three times in one day** by its own author. It fires 18 times, 13 alone, and every instance of the underlying error this session was real.
- **the sink and its `decided` field** — the FP measurement apparatus works, and it is what produced this finding in 40 minutes rather than at Step 7.
- **the use-vs-mention leg**, which is independent of where the predicate lives.

⚠️ **AND THE HONEST FRAMING OF THE RESULT: THE OBJECTIVE FAILED ITS BAR, AND THE INSTRUMENT BUILT TO MEASURE IT WORKED PERFECTLY.** *(That distinction is `#661` leg 3 and it is the difference between a batch that learned something and a batch that shipped a dud.)*
