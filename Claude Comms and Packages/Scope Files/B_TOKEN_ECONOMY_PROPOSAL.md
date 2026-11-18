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
- Discord and wake: no skill read before each post. The few lines a session needs to post (its sender name, the opening-list wake rule, the send command, reply on Discord when woken there) stay in CLAUDE.md, ~1.5 KB; the tools already enforce the sender and parse the opening list. Bridge internals, chunking, diagnostics and history go to COMMS_BRIDGE_RUNBOOK and the wake-watcher runbook, read only when something breaks or is being changed.
- Langston's server (section 8): replace with a pointer to LANGSTON_ARCHITECTURE.md, which already holds it. It sits in CLAUDE.md because section 8 was written at the 05-06 migration, before that document existed (07-24), and was never moved.
- What can still move (judged section by section, not measured): comms and wake mechanics 6.1-6.10 to a comms skill or runbook (~12 KB); rule backstories and "MEASURED" paragraphs in 5 to the history doc and skills (~9-10 KB); 7.1 backup and who-moves-what detail to the topology runbook (~5 KB); 8 Langston runtime, already in LANGSTON_ARCHITECTURE (~5 KB); 3.0/3.1/9-intro/10.5 mechanics to the step skills (~7 KB); 9.4 essays (~4 KB); 0.a narrative (~3-4 KB); 4 file index (~3 KB). About 45-50 KB, to ~72-77 KB. The earlier 40 KB target was too aggressive: the eight non-negotiables, the 9.4 and 9.5 triggers, the sync gate, the one-direction rule, the per-turn alert check and the roster names must stay always-loaded.
- New: a size cap with one-in-one-out, warned at session start the way CONDUCT.md's cap is, so the next addition has to move something out. This is what the August batches lacked.
- Due-alert hook: inject only alerts that are new or changed since the session's last turn, plus a one-line count; map PM's clone.
- Hook warnings: once per session per kind, not per command.
- Fix the five-way registration of load-own-memory/load-conduct if it duplicates.

**C. Cut the alert volume at the source.**
- Standing "batch open > 48 h / > 7 d" nags fire once and then weekly, not on every sweep; store the owner on the alert (row 1l) so the lane stops re-guessing.
- Alert lane stays on Sonnet; Langston only by rule (already). Add a daily cap on lane posts with a digest.

**D. Cheaper models for helper agents only (Kyle 11-18).**
Kyle: helper agents only; no per-step model switching, no effort changes.
- When a helper is used: a self-contained read, search or measurement whose answer comes back short (searching many files, reading logs, git history, counting, docs lookups, slot checks). Not for decisions, design, code that ships, or review of trading logic; those stay in the session. Added saving: the file dumps stay out of the session's own conversation, so its 250k fills more slowly.
- Which model: Sonnet by default (one laptop setting, CLAUDE_CODE_SUBAGENT_MODEL=sonnet); Haiku for plain file-finding (our own Explore agent definition with model haiku, which replaces the built-in one that runs on Opus); Opus only when the session asks for it on that call, capped at Opus 5.5 by the allowed-models list.
- Quality check: the session checks a helper's answer against the object before relying on it (CONDUCT 6b, already a rule). Sonnet helpers already run PM's slot checks (KD-28) and research.
- Rule text: two lines in CLAUDE.md beside the delegation guidance; the setting does the rest.
- Langston: keep Opus 5 for reviews; stable prompt prefix so repeat calls hit the cache; heartbeat becomes a plain script (no Claude session), folding in B-HEARTBEAT-RESCOPE.

**E. Measurement (no pacing).**
- Weekly usage line from the usage reading and the loaded-set log, before and after each change.
- Kyle rejected a pacer that defers "non-urgent" work (11-18: "who's to say what's urgent and what is not?"). The stop line at KD-99's 90% stays as today; nothing else stops work.

## Ownership and order
- Owner: PM Claude (Kyle 11-17: not Infra), reviewed by Langston at each step; Infra consulted only for Langston-box files.
- Order: A first (settings, reversible in one line), then D (also settings), then B, C, E. A can be applied while the crew is stopped so the restart benefits.

## Kyle's decisions
Given 11-18: approve A to D; reject the pacer; cheaper models for helper agents only.
Still his:
1. The batch's place: now, ahead of other crew work, while the crew is stopped.
2. Whether A and D (persistent laptop settings) may go in before Langston is back, with his review on resume, or wait for him.
