# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` P1d (slot check, KD-28) STEP: 1 of 11 · NEXT STEP: 2 of 11.** Scope r4 adds OBJ-9 at `a74a15b19`; sent to Langston msg `1567679895281213594` with 3 questions (Guard-1 fail mode; `kind` column for Guard 2; plan as authority since only CC_A's task list has an order table). P1d runs AHEAD of P1c. Design: deterministic `scripts/pm/slot-check.mjs` (reuse planRowsByBatch/firstSession/presprintRows), Sonnet/Haiku agent reads it, Guard 1 on wrap_up + cc-send, Guard 2 on DECISIONS commits + reconcile.
- **P1b (heartbeat) STEP: 7 of 11** — read the next hourly heartbeat post: names all five, lists CC-PM, no CHECK FAILED.
- ⛔ **UNTIL P1d LANDS: before ANY slotting/owner/order advice, read the owner's task list section 00, their open plan rows and every KD binding them (rules file, KD-28).**
- **Ledger KD-1..KD-28; run `node scripts/pm/reconcile-decisions.mjs` at every check.** KD-25/26/27 ACKED by OLD (rows 18-19 his, after #527, 25-9, then row 72). B-CLOSE-WRITER-COSTS scope RULED by Langston (msg `1567679032332521534`): guard + unique index + lookup one key; no-row close stops deleting the position same increment. Relayed to OLD.
- **MORNING QUEUE FOR KYLE (do not wake him):** #1241 B-WAKE-OPENING-LIST (Infra, Discord `1567685418810343667`, proceeding on the recommended answers): Q1 should Kyle's own posts follow the opening-list rule? rec NO (he posts ~10/month, KD-21 aimed at sessions). Q2 accept that 1,010 of 1,750 session posts last month named someone only later and would stop waking them? rec ACCEPT (KD-21's intent; @crew / ALL SESSIONS still reach all).
- **MORNING FYI (not a question):** NEW's B-XSTOCK-DBS-TO-STRATEGIES F1 — volatility_edge's strong-trend cut-off was a fixed number in code while its siblings read it from settings; same value today, but this batch makes it live on xStock. I told NEW to fold the one-line fix in (rule 23 + Kyle's no-hardcoded-settings gate), Discord `1567685895463641220`.
- **MORNING CORRECTION FOR KYLE:** I told him #527 fixed paper xStock costs; it is the VTS records' cost split and was already done 2026-07-17 (KD-13 DONE, `c7945a419`). Asked OLD (Discord `1567687026541862973`) whether PAPER xStock trades carry the full cost split; if not, that gap is the real item to bring to Kyle.
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
