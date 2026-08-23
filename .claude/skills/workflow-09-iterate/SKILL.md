---
name: workflow-09-iterate
description: STEP 9 ONLY of the DawnTrader batch workflow - Iterate. Use when a scope objective was not met and the fix-review-push-deploy-verify loop must run again. NOT for the initial implementation, NOT for writing governance documents.
---

# STEP 9 — ITERATE

**Ends when:** every scope objective is green.

If any objective is not met: **fix → Langston reviews → push → CI → deploy → verify.** Repeat until all green.
⛔ **Do not close with an objective silently unmet.** An open item is disclosable — a **named owner, a dated home, and BOTH a closing condition and a failure condition written before the fact.** What disqualifies a close is an objective *claimed* on evidence nobody can read.

## ⛔ A PARTIAL FIX PRESENTED AS COMPLETE IS WORSE THAN NO FIX
**Fixing one of five identical sites is a worse outcome than fixing none — because it makes the remaining four look investigated.** When you fix a defect, **grep repo-wide for the PATTERN, not for the symptom you were handed**, and state how many sites you found and how many you changed.
**And apply §9.5(a-ii) to every removal:** a deletion is verified by *zero callers AND every state it wrote has no surviving reader* — never by zero callers alone. **A removed writer whose reader survives produces no compile error and no failing test**, so caller-tracing, green CI and a clean `tsc` all pass while the deletion silently breaks a live dependency.


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Card stays in **`Verification`** while you iterate. **Do not move it backwards** — the column reflects the furthest point reached, not the current activity.
★ **YOU move the card; LANGSTON sets `Review`.** *(Kyle 2026-08-03 — his approval gates the move but is not the move, or the board freezes every time he is mid-review.)*
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

9. **Iterate** — If any scope objective not met: fix → Langston reviews → push → deploy → verify. Repeat until all green.
