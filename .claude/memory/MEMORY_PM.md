# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md` (draft, adopted in B-PM-CLAUDE). Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (built in OBJ-3).

# ▶▶ CURRENT POSITION — READ FIRST
- **`B-PM-CLAUDE` STEP: 1 of 11 · NEXT STEP: 2 of 11.** Scope r1 at `f17130187` (`Claude Comms and Packages/Scope Files/B_PM_CLAUDE_SCOPE.md`), sent to Langston 2026-11-04 (Discord msg `1567613374253109324`, card Blocked on = Langston); board card `PVTI_lAHODmulEM4BfQP4zhGEKyM` (Scope, Owner empty — no PM option yet). Change-class architecture. Pre-sprint line NOT yet added (an owner the checker does not know = OBJ-6).
- **BLOCKED-ON:** Langston's Step-1 ruling (scope r1 dispatched by the FIRST PM session; his reply is led "PM Claude" — find it in the inbox: `ssh root@204.168.141.77 "grep langston_outbound /var/log/cc-discord-inbox.jsonl | grep 'PM Claude' | tail -3"`).
- ✅ **KYLE DECIDED 2026-11-04 (scope §3b): PM Claude is a FRESH session opened on `C:\DawnTraderV3-pm`** — the first PM session (CLI id `30a52af3-5a1d-4d02-a408-1c125581a2a5`, opened on OLD Claude's folder, transcript in `C--DawnTraderV3-old`) STOOD DOWN after handing over. **Bind the roster (OBJ-1a) to the fresh session's own id** (self-ID: a background Bash task's output path). Record the decision in the scope's §3b at the next revision.
- **Fresh session start-up gaps until OBJ-1 lands:** nothing auto-injects this file or `PM_CLAUDE_RULES.md`, and the shared `MEMORY.md` does not auto-load (the `C--DawnTraderV3-pm` project folder has no `memory\` link yet) — read all three by hand at every start and after every compaction.
- **Not yet set up:** no roster name, no wake watcher, no Discord name in the filter. Until OBJ-2 lands, a Langston reply led "PM Claude" names no known session and BROADCASTS to all four.

# OPEN
- Waking: the app's `SendMessage` needs a session's `local_…` id; `list_sessions` gives them (the roster holds CLI ids — a different id space). Live 2026-11-04: OLD `local_66dbb030…`, NEW `local_0fe1c46a…`, ANALYST `local_4dfcc10e…`, INFRA `local_1a70b6ce…` (all "(fork)" titles).
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar (7+ on 11-04) — ask Kyle whether to archive.

# LOG
- 2026-11-04: Kyle chose the fresh-session option; first PM session handed over via this file.
- 2026-11-04 ~19:00Z: started; crew picture given to Kyle; fixed the stale pre-sprint line for Infra's B-TOKEN-WATCH-STORAGE (Step 1 → Step 7), `235eaa97c`.
