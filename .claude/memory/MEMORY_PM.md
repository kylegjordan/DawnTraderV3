# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` P1d (slot check, KD-28) STEP: 1 of 11 · NEXT STEP: 2 of 11.** Scope r4 adds OBJ-9 at `a74a15b19`; sent to Langston msg `1567679895281213594` with 3 questions (Guard-1 fail mode; `kind` column for Guard 2; plan as authority since only CC_A's task list has an order table). P1d runs AHEAD of P1c. Design: deterministic `scripts/pm/slot-check.mjs` (reuse planRowsByBatch/firstSession/presprintRows), Sonnet/Haiku agent reads it, Guard 1 on wrap_up + cc-send, Guard 2 on DECISIONS commits + reconcile.
- **P1b (heartbeat) STEP: 7 of 11** — read the next hourly heartbeat post: names all five, lists CC-PM, no CHECK FAILED.
- ⛔ **UNTIL P1d LANDS: before ANY slotting/owner/order advice, read the owner's task list section 00, their open plan rows and every KD binding them (rules file, KD-28).**
- **Ledger KD-1..KD-28; run `node scripts/pm/reconcile-decisions.mjs` at every check.** KD-25/26/27 ACKED by OLD (rows 18-19 his, after #527, 25-9, then row 72). B-CLOSE-WRITER-COSTS scope RULED by Langston (msg `1567679032332521534`): guard + unique index + lookup one key; no-row close stops deleting the position same increment. Relayed to OLD.
- **WAITING ON OTHERS:** Langston on r4; NEW's ACK of KD-7/9/10/11.
- ⚠️ Laptop clock is UTC+1: use `date -u`. I am session `994e6488-…`, alias CC-PM; watcher armed (re-arm after every wake, shared MEMORY 4.5). Nothing auto-injects this file until P2; after a compaction read it, the rules and shared MEMORY by hand.
- **OVERNIGHT USAGE GUARD (Kyle 2026-11-05 ~00:35Z, going to bed):** at 85% of the weekly limit, stop all four sessions at a good stopping point. Hourly job `3d9afd11` (:17, session-only, dies if this session closes) runs the check. 33% at 00:33Z; weekly resets 2026-11-05 22:59Z. Leave COMMAND CENTER alone (other project).
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
