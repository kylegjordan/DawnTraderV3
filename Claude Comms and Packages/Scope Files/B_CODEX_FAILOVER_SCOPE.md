# B-CODEX-FAILOVER — SCOPE (RETROACTIVE — written at Step 7, 2026-10-13)

change-class: non_architecture

> ⛔ **THIS SCOPE DID NOT GATE THE WORK AND MUST NEVER BE CITED AS THOUGH IT DID.** Kyle directed a fast path on 2026-10-13 (at 87% of his weekly Claude allowance): no Step 1 or Step 2 was written before the code. Langston accepted that for this batch at Step 4 on exactly this condition (his `#1005` precedent from `B-WAKE-QUIET`). The decisions below are Kyle's, recorded as he gave them; the design record is `Claude Comms and Packages/Change Lists/B_CODEX_FAILOVER_CHANGE_LIST.md` and Langston's Step-4 rulings.

**Owner:** CC-A / OLD Codex during the failover · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1y**, after row 1x · **Issue:** `#1192` · **Reviewers:** Langston through Step 4; Coltrane for the Codex-shift Step 8 rerun

## 0. WHY
Kyle's weekly Claude allowance runs out before the week resets. Working on Anthropic credit is too expensive, so a Codex crew (ChatGPT plan) takes over for a day or two and hands back when Claude resets.

## 1. KYLE'S DECISIONS (2026-10-12/13, Desktop)
1. One Codex session per Claude session, in the same folder: OLD / NEW / ANALYST / INFRA Codex (+ a Command Center session, outside DawnTrader). Names work in either word order.
2. **Coltrane replaces Langston as reviewer** during a Codex shift; on a Claude shift he is a second reviewer, called by name. He is never switched off.
3. **No shift limits** — Codex runs the whole workflow and deploys under its own names; Langston reviews everything the shift changed when Claude returns.
4. **A handover on every switch, both directions**, with a guarantee each session gets the order (confirmation + escalation).
5. **No scheduled Codex check-ins** — Kyle opens the Codex sessions he needs.
6. **Langston must really shut down** on a switch to Codex (telling him did not work).
7. **Manual triggers**: `LANGSTON ON|OFF` and `<session> ON|OFF` on Discord.

## 2. OBJECTIVES
| obj | objective | verified by |
|---|---|---|
| OBJ-1 | Codex sessions load the crew's rules and resume from their counterpart's POSITION block | `AGENTS.md` at the ref; first real Codex shift |
| OBJ-2 | Codex sessions and Coltrane act under their OWN canonical names on deploys and alerts | staging accepts `codex-*` / `coltrane` in both word orders (measured 2026-10-13) |
| OBJ-3 | One Discord line switches the crew, a session, or Langston; every outgoing session must confirm; misses are re-sent and Kyle is told | `crew-switch` installed, tests 41/41; switch S1 completed all four outgoing handovers and recorded a late incoming receipt without reopening |
| OBJ-4 | Langston is OFF during a Codex shift — stopped AND disabled, read back | the switch's own read-back on the first real switch |

## 3. OUT OF SCOPE — HOMED AT STEP 10

- Coltrane/Codex automatic alert and wake delivery, hook-equivalent safeguards, reviewer-command wake noise and board identity options → `B-CODEX-FAILOVER-AUTOMATION`, issue `#731`, sprint row `1z`.
- The deploy record being one overwritten slot → existing provenance class `#1004`, `P19-B12`.
- The push guard's false refusal from a subfolder → existing `B-TSC-GUARD-CWD`, issue `#926`, Phase-19 tail.
- The tracked canonical file rewritten after process start → existing `B-CANONICAL-CORPUS-ACCURACY`, issue `#733`, Phase-19 row `3n.e`; the untracked CSAV reports are preserved as evidence for that batch's census.

## 4. OBSERVATION

No observation window was specified. The switch was verified as a discrete live event; future automation work is separated into row `1z` rather than holding this batch open.
