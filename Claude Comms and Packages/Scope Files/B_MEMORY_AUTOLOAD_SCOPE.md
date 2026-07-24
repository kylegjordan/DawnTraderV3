# B-MEMORY-AUTOLOAD — SCOPE

**change-class: non_architecture** (tooling + governance-doc reorganization; no trading-pipeline code)
**Owner:** Claude Analyst (CC-C) · **Review:** Langston (Step-1 + Step-4)

## PROBLEM (verified this session)

The harness natively auto-loads only the file **named** `MEMORY.md` from the project memory dir. The three sessions' project dirs are **junctions onto ONE folder** (verified: `dir /AL` shows `C--DawnTraderV3-old|-new|-analyst` all junction to `G--My-Drive-…`), so that one `MEMORY.md` is necessarily **shared**. Consequence, verified against this session's own auto-loaded context: **only the shared `MEMORY.md` auto-loads; the per-session `MEMORY_CC_A/B/C.md` files do NOT** — a session had to manually read its own, and after a compaction usually didn't. So per-session working state was not reliably present.

Second problem: the shared `MEMORY.md` had become a **second rulebook** — 8 "operational non-negotiables" that were **all already in CLAUDE.md** (each cited its own rule), plus a session-start procedure. A duplicate rulebook drifts: on 2026-07-23 Kyle corrected the Langston-review timing in CLAUDE.md and the non-negotiable copy was left saying the old (wrong) thing.

## OBJECTIVES

1. **Per-session memory auto-loads.** A new SessionStart hook (`startup|resume|compact`) identifies the session by its clone folder and injects that session's `MEMORY_CC_<X>.md` — so each session auto-loads its own state on every start/compaction, **without un-junctioning** the shared folder. Fail-open (unmapped folder / missing file → inject nothing, exit 0; never blocks a session).
2. **Shared `MEMORY.md` stops being a second rulebook.** The 8 non-negotiables are removed (redundant — all already in CLAUDE.md). What stays: the operational session-start commands (wake-watcher, alerts, comms — Kyle's decision to keep these here) + the ~20 lines of project-consensus truths.
3. **`CLAUDE.md` gains a lean read-first index** — 8 one-line pointers to the non-negotiables' existing homes. Pointers only, no duplicated rule text (satisfies Kyle's "only if not redundant").
4. **The "read the shared MEMORY.md / read your own file" manual step is retired** — both now auto-load.
5. **Governance docs (§3.1, §10) describe the new mechanism.**

## END STATE — what auto-loads every start/compaction

`CLAUDE.md` (shared rules) + shared `MEMORY.md` (ops commands + truths) + your own `MEMORY_CC_<X>.md` (state, via hook). One caveat, stated honestly: the harness-native auto-load of the shared `MEMORY.md` **cannot be disabled** (built-in, keyed on the filename) — but with that file now small, it's harmless and carries the shared truths, so it's moot.

## FILES

- `.claude/hooks/load-own-memory.mjs` — NEW (the hook)
- `.claude/settings.local.json` — register the hook in the SessionStart array
- `.claude/memory/MEMORY.md` (+ its user-cache truth file) — strip non-negotiables, add the 3-session pointer, retire the manual-read step
- `CLAUDE.md` — read-first index (§5 top) + §3.1 hook description

## VERIFICATION

- Hook tested across all four cases (each clone → correct file; unmapped → empty; mirror fallback works). ✅ done pre-push.
- After push: confirm CC-A and CC-B's next start/compaction injects their own file (they'll report).
- No UI surface; no staging deploy (tooling + docs only).

## RISK

Bounded by fail-open: worst case is "no injection," identical to today's manual-read world. The hook can never corrupt state or block a session. It runs in all three clones once pushed (settings is git-tracked) — which is the intended behavior.
