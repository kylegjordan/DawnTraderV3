# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 7 of 11 (increment P1b, heartbeat) · NEXT STEP: 3 of 11 for P1c (ALERT_OWNERS + its two copies).** P1 DONE (installed 21:47Z, four live wakes). P1b installed (blobs at `b1a555649`, CI 41927726582 4/4, record `87dd12067` pushed); Step 7 = the next hourly heartbeat post names all five sessions and lists CC-PM with no CHECK FAILED. Then P1c, P2…
- **Decision ledger KD-1..KD-25** (`1-system-manual/pm/DECISIONS.md`). Run `node scripts/pm/reconcile-decisions.mjs` at every check and before any status report (last: 0 mismatches at `a79aa147d`).
- **KD-25 (22:4xZ):** coin + xStock sharing a ticker may be open at once within one mode → CLOSING objective of B-SYMBOL-CLASS-IDENTITY (row 19, #1024). **Owner question out (msg `1567672216030683218`): ANALYST replied NOT HIS (sprint names Infra; #1024's owner line is stale). Waiting on Infra's reply + load → take an owner recommendation to Kyle; then fix #1024's owner line.**
- **OPEN WITH LANGSTON + OLD:** B-CLOSE-WRITER-COSTS final scope (KD-17/24; OLD ACKed; Langston ruling pending) → bring to Kyle for a yes. Also Langston's ruling on WHEN the end-to-end audit (#522/#235) runs.
- **WAITING ON OTHERS:** NEW's ACK of KD-7/9/10/11.
- ⚠️ The laptop clock is UTC+1: use `date -u`.
- **I am session `994e6488-db2e-49a0-8e00-4d3635208c2d`, wake alias CC-PM; watcher ARMED (re-arm after every wake, shared MEMORY 4.5, A=CC-PM).** Until P2 lands nothing auto-injects this file or the rules; read both plus shared `MEMORY.md` by hand after a compaction.
- **Pushing:** check CI is idle as its own call, then push; commit and push in SEPARATE calls.

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
