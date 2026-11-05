# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` P1d (slot check, KD-28) STEP: 2 of 11 · NEXT STEP: 3 of 11.** Step 1 APPROVED by Langston with C1-C3 (folded, scope r4a). Step 2: r4 `54d031a4c` CHANGES (C1 binds parsing, C2 amend/attested bypass, C3 record deadlock, C4 scoping controls); r5 at `ab770a274` sent to Langston. First act of Step 3 = P1d-1 probe (does a PreToolUse hook fire on wrap_up?). settings.local.json is TRACKED: hooks must self-scope to the PM clone.
- **P1b (heartbeat) STEP: 8 of 11** — Step 7 evidence recorded (heartbeats 23:15Z and 00:14Z name all five, CC-PM issued+answered, no CHECK FAILED); Step 8 asked of Langston.
- ⛔ **UNTIL P1d LANDS: before ANY slotting/owner/order advice, read the owner's task list section 00, their open plan rows and every KD binding them (rules file, KD-28).**
- **Ledger KD-1..KD-28; run `node scripts/pm/reconcile-decisions.mjs` at every check.** KD-25/26/27 ACKED by OLD (rows 18-19 his, after #527, 25-9, then row 72). B-CLOSE-WRITER-COSTS scope RULED by Langston (msg `1567679032332521534`): guard + unique index + lookup one key; no-row close stops deleting the position same increment. Relayed to OLD.
- **Guard tally:** 01:50Z 39%, no nudges (all four active within 5 min). Pace ~2%/h since 00:33Z (33%→39%); at that pace ~80% by the 23:00Z reset — tell Kyle in the morning that the line could be reached late tonight.
- **MORNING BRIEF for Kyle: `1-system-manual/pm/reviews/2026-11-05_MORNING_BRIEF.md`** (9 items; walk him through it when he is back).
- **WAITING ON OTHERS:** Langston on r4. (NEW's ACK of KD-7/9/10/11 found: 20:56Z.)
- ⚠️ Laptop clock is UTC+1: use `date -u`. I am session `994e6488-…`, alias CC-PM; watcher armed (re-arm after every wake, shared MEMORY 4.5). Nothing auto-injects this file until P2; after a compaction read it, the rules and shared MEMORY by hand.
- **OVERNIGHT (Kyle 2026-11-05 ~00:40Z, asleep): DRIVE the four sessions to keep working; at 85% weekly usage stop all four AND Langston at a good point.** Job `235a7af6` (:17 and :47, session-only) does usage check then nudges any session idle 40+ min (max 2 nudges without new activity). Kickoff nudge sent 00:45Z to all four. 33% at 00:33Z; week resets 2026-11-05 22:59Z. Leave COMMAND CENTER alone. NEW: watchdog in 48h watch to 11-06 ~15:47Z; started #1235 Step 1.
- **Pushing:** CI idle check as its own call; commit and push in SEPARATE calls.

# DONE TODAY (2026-11-04; detail in git)
- Sweep of 4 weeks of chats → `1-system-manual/pm/reviews/2026-11-04_PLAN_SWEEP.md` (`e98581076`). 451 items, ~50 unplaced, 25 stalled.
- Kyle's "why is everything failing": Langston measured three causes (connection leak, disk, unwatched feed); e3a74c68 to ANALYST.
- KD-2 front stage "00 — data truth first" in the pre-sprint table (`efb2a0622`); #1239 pool guard (OLD), #1240 log trim; all four ACKed.

# OPEN
- Waking: the app's `SendMessage` needs a session's `local_…` id; `list_sessions` gives them. Live 2026-11-04: OLD `local_66dbb030…`, NEW `local_0fe1c46a…`, ANALYST `local_4dfcc10e…`, INFRA `local_1a70b6ce…`.
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

# LOG
- 2026-11-04: my push 4b8e22d8b cancelled OLD Claude's CI run (told him). ⛔ CI idle check as its own call, push only after it reads completed.
- 2026-11-04 ~19:15Z: fresh session started (Kyle's fresh-session decision).

- 2026-11-05: Langston's alert markers keep using owner=Infra-Claude (dropped by the filter, 5+ times tonight, even after my note — he is stateless). Fold an alias or his file fix into P1c (ALERT_OWNERS and its copy in his CLAUDE.md §10.5).
