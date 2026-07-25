# B-MEMORY-AUTOLOAD — PRE-AUDIT

**change-class: non_architecture** · Owner: Claude Analyst (CC-C) · produced retroactively 2026-07-25 to close the governance docgap; the analysis below is what was actually verified before implementation.

## Scope of the pre-audit

This batch touches ONLY session tooling (`.claude/hooks/`, `.claude/settings.local.json`) and governance docs (`CLAUDE.md`, the shared `MEMORY.md`). **It touches NO system component** — no service, no route, no DB, no trading-pipeline code. Therefore the SIM blast-radius / upstream-downstream / shared-state analysis that §2 Step-2 mandates for component changes is **N/A by construction**: there is no component to trace. What follows is the equivalent pre-implementation verification for a tooling change.

## What was verified BEFORE implementing (not assumed)

1. **The junction structure — measured, not recalled.** `dir /AL` on `C:\Users\kyleg\.claude\projects\` confirmed `C--DawnTraderV3-old|-new|-analyst` are all NTFS junctions onto the single physical folder `G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3`. This is WHY the harness-native auto-load of `MEMORY.md` is necessarily shared, and why the per-session files never auto-loaded — the root cause the batch fixes.
2. **The auto-load mechanism — proven from this session's own context.** The system-reminder at session start cites only `MEMORY.md` as "user's auto-memory"; `MEMORY_CC_A/B/C.md` are absent from the loaded context. So the harness loads by the exact filename `MEMORY.md`, and the per-session files are not auto-loaded. (Four memory files present in the dir; only the one named `MEMORY.md` loaded.)
3. **The SessionStart hook contract — verified against the existing hooks.** `session-reminder.mjs` proves a SessionStart hook's stdout is injected as context, firing on `startup|resume|compact` (its output appeared in THIS session post-compaction). `settings.local.json` already wires two SessionStart hooks; adding a third is additive.
4. **The discriminator — `CLAUDE_PROJECT_DIR` / `transcript_path`.** Each session runs in its own clone (`DawnTraderV3-old|-new|-analyst`), so the clone basename is a deterministic per-session key; the live truth-file dir is derivable from the hook's stdin `transcript_path`, with the in-clone `.claude/memory/` mirror as fallback.

## Blast radius (for a tooling change)

- `settings.local.json` is git-tracked, so the new hook goes live for ALL THREE sessions on their next start/resume/compaction once pushed. **Bounded by fail-open construction:** any unmapped folder / unreadable file → inject nothing, exit 0 — never worse than the prior manual-read world, never blocks a session, never corrupts state.
- Redundant-rulebook risk: the shared `MEMORY.md`'s 8 non-negotiables were checked against `CLAUDE.md` — each already present (each cites its own rule), so removing them loses no content; the copy had already drifted (the 2026-07-23 Langston-timing correction landed in CLAUDE.md and not the copy), which is the failure the removal prevents.

## Reviewer

Langston reviewed the implementation diff at the ref (Step-4 APPROVED) and independently re-confirmed all 8 relocated non-negotiables are already in CLAUDE.md. Two refinements folded in (loud-on-mapped-but-unreadable; mirror-fallback tag).
