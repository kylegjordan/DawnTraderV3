# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md` (draft, adopted in B-PM-CLAUDE). Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (built in OBJ-3).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 2 of 11 · NEXT STEP: 3 of 11.** Pre-audit + plan r1 at `f41b6c846` (`Scope Files/B_PM_CLAUDE_PRE_AUDIT.md`), dispatched to Langston 2026-11-04 (Discord msg `1567619465510785085`); card moved to Pre-Audit, Blocked on = Langston. Step 1: PROCEED (C1-C6 folded, scope r2 `f6227fd49`).
- **BLOCKED-ON:** Langston's Step-2 ruling (reply led "PM Claude"): `ssh root@204.168.141.77 "grep langston_outbound /var/log/cc-discord-inbox.jsonl | grep 'PM Claude' | tail -2"`. On PROCEED: Step 3 starts with P1 (wake filter + five-session re-arm).
- Langston 19:23Z: Step-1 `Review = Approved` set; Step 2 in his queue. His note: the §0a `B-PM-CLAUDE` line is an OBJ-6 CLOSE CONDITION (plan P5 lands it with the checker change).
- Infra Claude told once (msg `1567619553867989113`) about #1237, F4 push notice, P8 installs, F1 caller census. Do not follow up (CONDUCT §5).
- **I am session `994e6488-db2e-49a0-8e00-4d3635208c2d`** (fresh, on `C:\DawnTraderV3-pm`, Kyle's 3b decision). Bind the roster (OBJ-1a) to this id.
- **Start-up gaps until OBJ-1 lands:** nothing auto-injects this file or `PM_CLAUDE_RULES.md`; read both plus the shared `MEMORY.md` by hand at every start and compaction.
- **Not yet set up:** no roster name, no wake watcher, no Discord name in the filter. Until OBJ-2 lands, a Langston reply led "PM Claude" BROADCASTS to all four.

# OPEN
- Waking: the app's `SendMessage` needs a session's `local_…` id; `list_sessions` gives them (the roster holds CLI ids — a different id space). Live 2026-11-04: OLD `local_66dbb030…`, NEW `local_0fe1c46a…`, ANALYST `local_4dfcc10e…`, INFRA `local_1a70b6ce…` (all "(fork)" titles).
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar (7+ on 11-04) — ask Kyle whether to archive.

# LOG
- 2026-11-04 ~19:15Z: fresh session started; Step 1 closed (scope r2 `f6227fd49`).
- 2026-11-04: my push 4b8e22d8b cancelled OLD Claude's CI run on 3f5d36fff (told him; replacement run 41893049457 covers it). ⛔ Check CI is IDLE as its own call, and push only after it reads completed — never in the same command. (Mirror of this line not yet committed.)
- 2026-11-04: Kyle chose the fresh-session option; first PM session handed over via this file.
- 2026-11-04 ~19:00Z: started; crew picture given to Kyle; fixed the stale pre-sprint line for Infra's B-TOKEN-WATCH-STORAGE (Step 1 → Step 7), `235eaa97c`.
