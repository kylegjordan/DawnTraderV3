# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md` (draft, adopted in B-PM-CLAUDE). Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (built in OBJ-3).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 2 of 11 · NEXT STEP: 3 of 11.** r1 CHANGES (Langston 19:42Z, 4 plan conditions); r2 at `885280bef` re-dispatched (§5 only, msg `1567626648184946712`); card Pre-Audit, Review SENT BACK. `#1238` filed (Codex backup gap, placement waits on Kyle).
- ⛔ **Before any code increment: `npm ci` in this clone** — no node_modules, so the push hook's tsc check fails (refused a push 19:5xZ).
- **KYLE 2026-11-04 ~20:05Z: be his ADVISOR** (added to rules §1): analyse effectiveness and whether we progress or just unearth issues; recommend before/after live and where for each issue; decide together. First ask: slot `#1238`. My recommendation given: after live, after-live list, "Crew, reviewer, governance and alert tooling", owner Infra Claude. AWAITING KYLE; offered a progress-vs-new-issues measurement as the first analysis.
- **KYLE 2026-11-04 ~19:50Z: "make sure this gets assigned and fixed now. We need to understand why all of our systems are failing."** Alert `e3a74c68` (xStock OHLC archive dropped 206 bars, statement timeout, minted 19:37:08Z, 73 s after the 19:35:53Z restart with ANALYST's R5) — proposed owner ANALYST (msg `1567626233762812075`); asked Langston to re-route + a cross-cutting why-read (msg `1567626263206695053`). Follow through until ANALYST says he has it and Langston answers; report to Kyle. Branch head RED (c2b5a9fc0, b75 test, OLD on it).
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
