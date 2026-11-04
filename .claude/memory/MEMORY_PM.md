# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 6 of 11 (increment P1) · NEXT STEP: 7 of 11 for P1 (the four live probes).** P1 PROCEED 21:34Z, conditions folded `efc6c3b5c`; CI 41918893184 4/4 on `e2a3e47b8`; INSTALLED 22:47Z `~/.claude/cc-wake-filter.py` sha256 `9cdd99d4…` = blob (backup `.pre-b-pm-claude-p1`, `7c8ed302…`). **My watcher is ARMED, alias CC-PM** (re-arm with shared MEMORY 4.5, A=CC-PM). Re-arm request to the four sent (msg `1567656714407387309`); collect their sha receipts, then run the probes. Then P1b (heartbeat), P1c (ALERT_OWNERS), P2…
- **Decision ledger KD-1..KD-21** (`1-system-manual/pm/DECISIONS.md`). Run `node scripts/pm/reconcile-decisions.mjs` at every check and before any status report. KD numbers (not D-: those collide in RUNNING_ISSUES); first relays said "D-2" = KD-2.
- **OPEN WITH LANGSTON + OLD (Kyle: iterate to consensus):** B-CLOSE-WRITER-COSTS scope (KD-17): my proposal = atomic record+delete, remove the fee zero-default, read the VTS close path. Also pending: Langston's ruling on WHEN the end-to-end audit (#522/#235) runs (Kyle's instinct: before calibration). Bring both to Kyle.
- **WAITING ON OTHERS:** NEW ACK of KD-7/9/10/11. Four sessions' re-arm sha receipts for P1.
- **I am session `994e6488-db2e-49a0-8e00-4d3635208c2d`, wake alias CC-PM.** Until P2 lands nothing auto-injects this file or the rules; read both plus shared `MEMORY.md` by hand after a compaction. Since 22:47Z replies naming "PM Claude" wake me through my own watcher.
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
