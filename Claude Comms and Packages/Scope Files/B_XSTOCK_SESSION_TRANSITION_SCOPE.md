# B-XSTOCK-SESSION-TRANSITION — SCOPE (Step 1)

**Batch:** `B-XSTOCK-SESSION-TRANSITION` · **Issue:** `#943` (plan row **3b.b**) · **Owner:** CC-C · **Phase 19**
change-class: architecture

> ⛔ **THIS ROW WAS "BLOCKED ON KYLE" AND HE HAS NOW DECIDED IT.** Row 3b.b was reframed 2026-08-30 as *"a SCOPE DECISION FOR KYLE, not a defect"*, routed through `XSTOCK_PRICING_DECISION_PATH.md` **Q3 — may the exit path act during every session?**

---

## 0. ⭐ KYLE'S DECISION, 2026-08-31 — RECORDED FIRST BECAUSE IT IS THE SCOPE'S PREMISE

> **"xStocks can trade in all four sessions, but there needs to be a way of handling the 8:15 PM price anomaly that happens every night."**

⇒ ✅ **Q3 IS ANSWERED: NO SESSION IS CLOSED TO THE EXIT PATH.** ⛔ **This scope may NOT propose a session blackout, a trading-hours restriction, or "don't act in extended hours" in any form.** That option is **decided against** and re-proposing it is out of scope.
⇒ **What is IN scope is exactly one thing: the TRANSITION INSTANT.**

**His description of the anomaly, which the measurement below confirms:** at 8:15 PM the bid prices drop dramatically for **one reading**, there are no further readings for a few minutes, and then pricing resumes — sourced from models and index futures, with wider spreads. **8:15 PM ET = 00:15 UTC**, which is the cluster already on file.

---

## 1. ⛔ THE MEASUREMENT — UNIVERSE-WIDE, WITH THE NEXT FRAME AS ITS OWN CONTROL

**Object:** `xstock_spot_ticker_snap`. **Population:** every symbol's FIRST frame at/after `00:15:00Z`, against that same symbol's NEXT frame.

| | n | mean spread | **median spread** |
|---|---|---|---|
| **frame 1 — at `00:15:00`** | 479 | 178.64% | ⛔ **42.90%** |
| **frame 2 — the very next frame** | 466 | 23.81% | ✅ **8.25%** |

⇒ ⭐⭐ **THE TRANSITION FRAME'S MEDIAN SPREAD IS FIVE TIMES THE NEXT FRAME'S, ACROSS THE WHOLE UNIVERSE.** The control is the same symbols seconds later, so this is not a symbol-selection or venue-quality artifact.

**Per-night, bid movement from frame 1 → frame 2:**
| night | symbols | mean jump | max jump | symbols moving >2% |
|---|---|---|---|---|
| 08-27 | 466 | +0.84% | **917%** | 62 |
| 08-28 | 467 | −4.63% | **373%** | 49 |
| 08-31 | 466 | **+64.25%** | **1126%** | ⛔ **279 of 466 (60%)** |
*(08-29 absent — Saturday; the market is shut, which is itself a control: the anomaly occurs on trading nights only.)*

⚠️ **DIRECTION IS NOT UNIFORM AND I WILL NOT CLAIM IT IS.** 08-28's mean is **negative**. **The honest finding is that the transition frame is UNRELIABLE, not that it is uniformly low** — the magnitudes (max 373–1126%, 49–279 symbols/night past 2%) carry this, not the signed mean.

**A worked specimen, `BABA/USD`, 2026-08-31 — the whole shape in six rows:**
| time | bid | ask | spread |
|---|---|---|---|
| `00:13:27` | 112.000 | 132.000 | 17.86% |
| *(93-second gap — no frames)* | | | |
| ⛔ `00:15:00` | **108.000** | 119.600 | 10.74% |
| `00:15:04` | 117.050 | 118.500 | **1.24%** |
| `00:15:08` | 118.240 | 118.500 | **0.22%** |
| `00:15:16` | 118.000 | 118.500 | **0.42%** |
⇒ **the `00:15:00` bid sits 8.4% below the bid four seconds later.** ★ **And this is the row that closed a real position:** `BABA/USD` `stop_hit`, trigger 112.750 → booked 118.400.

## 1b. ✅ HOW THIS RECONCILES WITH `EXIT_PATH_MACHINERY_AUDIT` §14 — WHICH APPEARS TO CONTRADICT IT

§14 measured **n=77,060** wide rows and found **no bid-collapse signature, including at 00:15** (`pos` 0.511, 59.5% mid-ish), concluding symmetric widening in a thin market. **Both are true, and §14 already named the gap:**
- **§14's population is ALL rows in the 00:15 MINUTE** — roughly 80 frames per symbol, of which **one** is the transition frame. **An 80-to-1 average cannot see it.**
- **§14.4 states this explicitly:** *"a 59.5%-mid-ish aggregate cannot exonerate an individual row"*, and flags the one unexplained case — `NOW/USD`, a tight venue book coexisting with a bad mark — as **not covered by §14.2** and needing the raw frame.
⇒ ✅ **§14 STANDS for the session's SUSTAINED wide quotes — those are real, Kraken's, and not ours. THIS BATCH IS ABOUT THE SINGLE TRANSITION FRAME, which is §14.4's named residual.** ⛔ **Nothing here reopens §14.**

---

## 2. ⛔ PROVENANCE (MANDATORY 1.b) — CORPORA NAMED

**Searched:** `RUNNING_ISSUES` `#943`/`#531`, `PHASE_19_PLAN` rows 3b.b/3c, `XSTOCK_PRICING_DECISION_PATH.md`, `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md` §14/§14.4/§14.5, `BATCH_74_SCOPE.md`, `BATCH_79_SCOPE.md`.

| thing | original intent | disposition |
|---|---|---|
| the xStock ticker feed (`ws-equities`) | `BATCH_74_SCOPE.md:37` — built as a **passive archive** that would share **no state** with trading, before xStocks were a trading class | **(2) relevant, needs updating to today's intent** — it became the trading feed without a decision (`#950`, row 3b.e) |
| the exit monitor's mark read | decide on a live venue mark | **(1) still relevant and correct** — the reader is fine; the FRAME it reads is the problem |
| session awareness | ⛔ **NONE EXISTS.** All four Kraken sessions are treated identically (`XSTOCK_PRICING_DECISION_PATH` Q3) | **(3) disconnected, should be RECONNECTED** — the venue publishes session state and we ignore it |

⛔ **`#943`'s own eliminations stand and are NOT re-litigated:** not stale (`ageMs=1479`), not a restart, not `last_known_good`, not a cron, **entries unaffected** (opens do not cluster at 00:15).

---

## 3. OBJECTIVES

### ⛔ OBJ-0 — INSTRUMENT FIRST, BEHAVIOUR SECOND. *(no behaviour change)*
Record, on every xStock exit decision, whether the mark it used was **the first frame after a feed gap** and **what the previous frame was**. **Verification:** a post-deploy 00:15 event produces rows from which the transition frame is identifiable **without** a time-of-day filter.
★ **Rationale: every clock-based identification we have is a proxy. `00:15` is a SYMPTOM LOCATION, not the mechanism** — and if Kraken moves the boundary or DST shifts it, a clock rule silently stops working.

### ⛔ OBJ-1 — THE ENGINE MUST NOT ACT ON AN UNCORROBORATED TRANSITION FRAME
A mark that is **the first frame after a feed gap** may not, on its own, drive a stop or target. **HOLD and re-evaluate on the next frame** — the same disposition already chosen for the 15-second freshness guard (`XSTOCK_PRICING_PLAN` P1).
**Verification:** replay the 08-31 `BABA` sequence; the `00:15:00` frame must not produce an exit, and the `00:15:04` frame must be evaluated normally.
⛔ **KILL SWITCH AND FORCE-CLOSE ARE EXEMPT** — same carve-out as P1. A safety exit must never be blocked by a data-quality gate.

### ⛔ OBJ-2 — CAUSAL, NOT CLOCK
The rule keys on **observable frame properties** — a gap in the feed, and corroboration by the following frame — **NOT on `00:15` and NOT on a session name.**
**Verification:** the implementation contains no time-of-day literal; a synthetic mid-session gap triggers the same path.
⛔⛔ **NO NEW FLOORS, CLAMPS OR THRESHOLDS ON PRICE.** *(Kyle, 2026-08-27: "every time we've instituted floors and ceilings, it hasn't worked out well.")* **A corroboration requirement is not a price threshold — it does not reject a price for being far away, it declines to act on a value that has been seen once.** ★ **If this objective cannot be met without a magnitude threshold, the batch STOPS and returns to Kyle rather than smuggling one in.**

### OBJ-3 — QUANTIFY WHAT IT WOULD HAVE CHANGED *(analysis, no code)*
Over `#943`'s 65-close cohort, state how many exits the OBJ-1 rule would have deferred, and what the next frame's price was in each case. **Verification:** a table, with the cohort defined by OBJ-0's recorded property where available and by the clock only for the historical rows that predate it — **labelled as two different populations.**

### OBJ-4 — GOVERNANCE
`XSTOCK_PRICING_DECISION_PATH.md` Q3 marked **ANSWERED** with Kyle's decision and its date; `SYSTEM_IMPACT_MAP` for the changed component; `#943` updated.

---

## 4. ⛔ WHAT THIS BATCH DOES **NOT** DO
1. ⛔ **It does not restrict trading in any session.** Kyle decided against that.
2. ⛔ **It does not reopen §14.** The sustained wide overnight quotes are real and are not touched.
3. ⛔ **It does not change WHICH price the exit reads** (mid vs bid vs last) — that is Q2, Kyle's, and it depends on Q1. **This batch changes only whether we act on a given FRAME.**
4. ⛔ **It does not subscribe to the `book` channel** — that is `#949`/3b.d, and Langston has registered it CAPTURE-ONLY while two observation windows are open.
5. ⚠️ **It does not claim the anomaly's cause at the venue.** We observe the frame; Kraken's session mechanics are theirs.

## 5. ⚠️ KNOWN LIMITS, STATED NOW
- **The n is small per night** and the direction of the bid move is **not** consistent (08-28 negative). The claim rests on **unreliability**, not on a signed bias.
- **`is_extended_hours` exists on the snapshot table** and is **not** yet verified as a usable session marker — OBJ-2 must not assume it.
- **A feed gap is not yet defined numerically.** Deriving that bound is OBJ-0's job and it must come from data, not from choosing a number.
- **Sequencing conflict, stated rather than resolved by me:** Langston ruled today that **F-G-2 crypto Step 2 is next**. Kyle then decided Q3 and directed this scope. **Both are recorded; Langston rules on the order.**
