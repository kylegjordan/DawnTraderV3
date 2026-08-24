---
name: workflow-07-verify-cc
description: STEP 7 ONLY of the DawnTrader batch workflow - first-pass verification by the implementing Claude session. Use when gathering evidence that a deployed change works - PM2 logs, Supabase queries, and mandatory navigation of the staging UI in a browser. NOT for Langston second-pass verification, which is step 8.
---

# STEP 7 — FIRST-PASS VERIFICATION (CC)

**Ends when:** evidence is captured **and the UI has been navigated**.

## ⛔ "STAGING VERIFIED" MEANS UI-NAVIGATED, NOT CURL-CHECKED
It is **NOT** satisfied by a successful API curl, a psql row count, a PM2 log line, or a build + restart. Those are backend health checks — **they do not prove the panel renders, that values are not showing as "--", or that the layout is not broken.**
**Requires:** navigate the staging URL in the browser, read the actual DOM, cross-check rendered values, screenshot where useful.

## ⛔ UI VERIFICATION IS THE DEFAULT, NOT AN EXTRA
With active trading on, **most changes have a staging-visible surface.** For any change with one, load the affected tabs and verify it renders and behaves. **"Working in the background but not showing on the front end" is a failure state Kyle cannot detect.**
**If there is genuinely no UI surface, SAY SO AND SAY WHY** — state the judgement rather than skipping the step.

## ALSO
- PM2 logs, psql, CI status, server health — **as well as**, not instead of.
- ⚠️ **The application log retains only a couple of hours.** An empty grep over an older window proves nothing; **state the window the instrument actually covers.**
- **Every issue Kyle raises gets reproduced, located in code, and quoted from real data** — never dismissed, never marked N/A without evidence.

## ⛔ VERIFY THE THING THAT CHANGED, WITH THE INSTRUMENT THAT SHOWED THE PROBLEM
**"The server came back up" is not verification. Neither is "no errors in the log."**
- **Re-run the SAME measurement that established the problem.** A different instrument showing a different number proves nothing about the change; **the same instrument, before and after, is the only comparison that carries.**
- **PROVE THE INSTRUMENT FIRST.** Run it where you already KNOW the answer — the positive control — before reading its silence as good news. *(Three log-filter tests read as PASS while processing nothing at all: a missing header meant every line was silently dropped. It was caught only when a known-good line also produced nothing.)*
- ⛔⛔ **A POSITIVE CONTROL MUST MATCH THE POPULATION’S *SIZE*, NOT ONLY ITS *STREAM* (Langston, 2026-08-23).** A fixture drawn from the right source but the wrong SHAPE passes while the real thing fails. **MEASURED:** an alert-routing fix was proven with six hand-written controls — correct stream, correct field, all passing — and shipped a mechanism that could not execute on **99.5%** of real traffic, because the controls were a few hundred characters and the real bodies have a **median of 2,289**, putting the matched token past a 400-char truncation. **Re-run against the REAL population: old code routed 4 of 1,026; the fix routes 1,018.** ⇒ **Before trusting a control, ask what the real inputs LOOK like — length, position, multiplicity — and draw at least one fixture from the actual data.**
- ⛔ **TESTING THE FILE IS NOT TESTING THE PROCESS.** A running service holds the code it started with. **Verifying a fixed file proves the file; it says nothing about the process still running the old one.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). This step IS the object-check — but apply it to your own evidence too: **prove the instrument on a known answer, and confirm your fixtures match the real population’s SIZE, not just its source.**
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Verification`**.
★ **YOU move the card; LANGSTON sets `Review`.** *(Kyle 2026-08-03 — his approval gates the move but is not the move, or the board freezes every time he is mid-review.)*
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

7. **First-Pass Verification (CC)** — Check PM2 logs, psql to Supabase, UI via Claude-in-Chrome, CI status, server health. Capture evidence.
