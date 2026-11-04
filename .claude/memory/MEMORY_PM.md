# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 4 of 11 (increment P1) · NEXT STEP: 5-6 for P1 (CI, then install + five-session re-arm).** Step 2 PROCEED 20:51:50Z (class `non_architecture`). P0 rows `3ce8fecb7`. P1 wake filter `5f467af47`, change list `fca415392`, dispatched (msg `1567646629610262601`). P1b (heartbeat ALIASES + skill lists + tests) split out, after PM's watcher is proven. Card: Implementation, Blocked on Langston. `npm ci` done in this clone.
- **Decision ledger KD-1..KD-12** (`1-system-manual/pm/DECISIONS.md`). Run `node scripts/pm/reconcile-decisions.mjs` at every check and before any status report. KD numbers (not D-: those collide in RUNNING_ISSUES); first relays said "D-2" = KD-2.
- **WAITING ON KYLE:** OLD Claude's before-live list. My recommended order after OLD's pool guard + disk tiering: B-CLOSE-WRITER-COSTS (row 72), #527 (88), #914 (126), 25-9 collection (105), #522/#235 end-to-end audit last (101-102). After live: dead-code removals 79/82/84/84a, crew tooling.
- **WAITING ON OTHERS:** NEW ACK of KD-7/9/10/11 (relayed 21:0xZ). Infra's KD-12 Coltrane check (Infra pinged Coltrane 20:54Z).
- **I am session `994e6488-db2e-49a0-8e00-4d3635208c2d`.** Until P1/P2 land: no watcher, nothing auto-injects this file or the rules; read both plus shared `MEMORY.md` by hand after a compaction. Replies naming "PM Claude" broadcast to all four until the new filter is installed. I watch for replies with background inbox polls.
- **Pushing:** check CI is idle as its own call, then push; the push hook runs tsc only when the push command also commits — commit and push in SEPARATE calls.

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
