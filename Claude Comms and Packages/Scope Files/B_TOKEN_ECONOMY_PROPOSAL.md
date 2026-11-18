# B-TOKEN-ECONOMY — proposal (PM Claude, 2026-11-18)

change-class: non_architecture (crew tooling: settings, hooks, rules files, Langston-box scripts; no trading code)
Status: PROPOSAL for Kyle's list. Not placed. Langston is off (usage stop 11-16); his review is required before any shared-machinery change lands.

## Why
The weekly Claude allowance went 62% → 87% in about 20 hours on 11-16 and ran out in roughly four days. Kyle (11-17): gather every existing initiative into one batch, research improvements, and propose a system that manages usage as automatically as possible, with Kyle involved as little as possible, including transcript trimming.

## What already exists (inventory, at origin/migration/aws-supabase)
Shipped:
- B-TOKEN-BURN-CUT (CC-A, closed 10-01): watcher ends on first wake (45-76 empty wakes/session/day → 0); Langston reply wakes only its addressee; per-turn due-alert list narrowed per session.
- B-LANGSTON-RELIEF (Infra, closed 11-05): the Sonnet alert lane (batched, 20 s window, up to 15 alerts a call, escalates to Langston by rule); Langston's loaded set 919 KB → 161 KB.
- B-LANGSTON-CLAUDEMD-RESIDUAL (closed 11-14): Langston rules file 57 KB, loaded set ~143 KB.
- B-TRANSCRIPT-ARCHIVE (closed 11-10): nightly archive of the five session folders.
- B-INSTRUMENTS-OVER-RULES (closed 10-01): loaded-set log `~/.claude/instructions-loaded.jsonl`.
- pm-usage-stop skill; KD-99 stop line 90%.
Placed but not done: KD-46 shorter-conversation trial (restart at ~400k tokens, one session); B-HEARTBEAT-RESCOPE (after live); B-INSTRUMENTS-OVER-RULES OBJ-3 path-scoped rules (after live); B-ALERT-LANE-LEDGER-OWNER and row 1l (alert owner stored on the alert).
Never placed: automatic transcript/context limits; per-prompt hook output size; subagent model defaults.

## What measurement shows (11-14 to 11-16, files and logs; billed tokens not measured)
1. **Context per turn is the big one.** Every session runs the 1M-token context; auto-compact fires only near ~967k. Each turn re-reads the whole live context (at the cached rate). Live transcripts are 286-382 MB per building session; PM's own context was ~900k tokens on 11-17. Note: file size on disk is not what costs tokens; the live (post-compaction) context is.
2. **Always-loaded rules ~196 KB (~50k tokens) per start and per compaction**; repo CLAUDE.md is 123 KB of that (60%). CONDUCT 24.7 KB, shared MEMORY 24.5 KB, own memory ~24.5 KB.
3. **Per-prompt alert list**: the same 25-35 due alerts injected on every prompt (PM's clone is unmapped so it gets the full list); est. 2-4 KB each prompt.
4. **Per-Bash hook warnings** (8 guards, 2 observers) echo text into context on most commands.
5. **Langston on Opus 5 [1m]**, a fresh `claude -p` per message: 97-166 replies a day; 36-94 alerts a day reach the alert lane, 25-38 lane posts a day. Many alerts are standing nags ("batch open > 7 d") that re-surface.
6. **Hourly heartbeat** is a fresh Claude session every hour (24 a day) for a check a plain script can do.

## Proposed system (one batch, automatic once installed)
**A. Cap the live context (largest saving, zero Kyle involvement).**
- Set `autoCompactWindow` to ~250k for all crew sessions (user-level settings), and `idleCompaction: false` so idle sessions do not spend.
- The session's own memory file is already re-injected after compaction (load-own-memory hook), so continuity holds.
- Folds in KD-46 (supersedes the one-session trial with a crew-wide setting, measured before/after).
- Transcript files on disk keep growing but no longer cost tokens; B-TRANSCRIPT-ARCHIVE keeps them searchable. A monthly rotation (start a fresh session from the handover when a file passes ~150 MB) is offered as an optional manual step, not required for usage.

**B. Slim what loads every turn, and stop it growing back.**
- Provenance: OLD Claude slimmed CLAUDE.md in four batches, 2026-08-20 to 08-29 (B-CONDUCT-FILE, B-RULES-1c/1d with the eleven step skills, B-CLAUDEMD-SLIM): 140,011 B to 112,081 B. Its own catalog entry says it "does not stop the regrowth", and it has not: 122,263 B now, +10.2 KB in 25 commits since 08-30 (roster names, the opening-list wake rule, alert-routing rules, the 10-19 rules in 9.4, dt-sql, each added with its incident story).
- What can still move (judged section by section, not measured): comms and wake mechanics 6.1-6.10 to a comms skill or runbook (~12 KB); rule backstories and "MEASURED" paragraphs in 5 to the history doc and skills (~9-10 KB); 7.1 backup and who-moves-what detail to the topology runbook (~5 KB); 8 Langston runtime, already in LANGSTON_ARCHITECTURE (~5 KB); 3.0/3.1/9-intro/10.5 mechanics to the step skills (~7 KB); 9.4 essays (~4 KB); 0.a narrative (~3-4 KB); 4 file index (~3 KB). About 45-50 KB, to ~72-77 KB. The earlier 40 KB target was too aggressive: the eight non-negotiables, the 9.4 and 9.5 triggers, the sync gate, the one-direction rule, the per-turn alert check and the roster names must stay always-loaded.
- New: a size cap with one-in-one-out, warned at session start the way CONDUCT.md's cap is, so the next addition has to move something out. This is what the August batches lacked.
- Due-alert hook: inject only alerts that are new or changed since the session's last turn, plus a one-line count; map PM's clone.
- Hook warnings: once per session per kind, not per command.
- Fix the five-way registration of load-own-memory/load-conduct if it duplicates.

**C. Cut the alert volume at the source.**
- Standing "batch open > 48 h / > 7 d" nags fire once and then weekly, not on every sweep; store the owner on the alert (row 1l) so the lane stops re-guessing.
- Alert lane stays on Sonnet; Langston only by rule (already). Add a daily cap on lane posts with a digest.

**D. Cheaper models, automatically, under a ceiling (Kyle 11-18).**
What the tools allow (official docs, model-config, sub-agents and prompt-caching pages, read 11-18):
- Ceiling: yes. An allowed-models list in settings caps every session, helper agent and skill at Opus 5.5 while allowing Sonnet and Haiku. A blocked choice falls back to the default.
- Helper agents: yes, cleanly. Default them to Sonnet (CLAUDE_CODE_SUBAGENT_MODEL, with the force flag so built-in search agents follow), Haiku for plain file searches. No quality risk to the main conversation.
- The main conversation: there is no built-in "pick by difficulty" model. Two automatic routes exist:
  1. A skill can carry its own model. The routine workflow steps (5 CI, 6 deploy, 7 first-pass verify reads, memory housekeeping, alert reads) can run on Sonnet; scope, audit, implementation and review stay on Opus. The switch happens on its own when the step's skill loads.
  2. PM can set a running session's model and effort from outside, at a step boundary.
  "opusplan" (Opus while planning, Sonnet otherwise) is not recommended: the crew rarely uses plan mode, so it would run almost everything on Sonnet.
- Cost of switching: each model has its own cache, so every switch re-reads the whole live conversation once at the uncached rate. Switch only at step boundaries; with A's 250k cap, one switch costs at most ~250k uncached tokens.
- Effort is the cheaper lever: lowering thinking effort keeps the cache. Routine steps can run at lower effort without changing model.
- Trial first: one session for one week, model per step, measured against its own previous week, before the crew.
- Langston: keep Opus 5 for reviews; stable prompt prefix so repeat calls hit the cache; heartbeat becomes a plain script (no Claude session), folding in B-HEARTBEAT-RESCOPE.

**E. Measurement (no pacing).**
- Weekly usage line from the usage reading and the loaded-set log, before and after each change.
- Kyle rejected a pacer that defers "non-urgent" work (11-18: "who's to say what's urgent and what is not?"). The stop line at KD-99's 90% stays as today; nothing else stops work.

## Ownership and order
- Owner: PM Claude (Kyle 11-17: not Infra), reviewed by Langston at each step; Infra consulted only for Langston-box files.
- Order: A first (settings, reversible in one line), then D's helper-agent default and ceiling (also settings), then B, C, the D skill-model trial, E. A can be applied while the crew is stopped so the restart benefits.

## Kyle's decisions
Given 11-18: approve A to D; reject the pacer; add automatic model switching under a ceiling.
Still his:
1. The batch's place: now, ahead of other crew work, while the crew is stopped.
2. Whether A, and D's ceiling and helper-agent default (persistent laptop settings), may go in before Langston is back, with his review on resume, or wait for him.
