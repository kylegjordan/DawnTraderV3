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

**B. Slim what loads every turn.**
- CLAUDE.md 123 KB → target ≤ 40 KB: move procedures into skills (load only when used), keep rules and pointers (the §4 placement rule already says this). Path-scoped rules (OBJ-3) pulled forward.
- Fix the five-way registration of load-own-memory/load-conduct if it duplicates.
- Due-alert hook: inject only alerts that are new or changed since the session's last turn, plus a one-line count; map PM's clone.
- Hook warnings: once per session per kind, not per command.

**C. Cut the alert volume at the source.**
- Standing "batch open > 48 h / > 7 d" nags fire once and then weekly, not on every sweep; store the owner on the alert (row 1l) so the lane stops re-guessing.
- Alert lane stays on Sonnet; Langston only by rule (already). Add a daily cap on lane posts with a digest.

**D. Cheaper models where quality allows.**
- Subagents default to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL`), Opus only when a session asks.
- Langston: keep Opus 5 for reviews (Kyle's rule: one model); stable prompt prefix so repeat calls hit the cache; heartbeat becomes a plain script (no Claude session), folding in B-HEARTBEAT-RESCOPE.

**E. Automatic governor (Kyle sees one weekly line).**
- PM guard already reads usage every 30 min. Add pacing: if the week is burning faster than the allowance allows, PM tells sessions to defer non-urgent work, and reports one line to Kyle; stop at the KD-99 line as today.
- Weekly usage report from `/usage` attribution and the loaded-set log, before/after each change.

## Ownership and order
- Owner: PM Claude (Kyle 11-17: not Infra), reviewed by Langston at each step; Infra consulted only for Langston-box files.
- Order: A first (settings, reversible in one line), then B, C, D, E. A can be applied while the crew is stopped so the restart benefits.

## Kyle's decisions
1. Approve the batch and its place (now, ahead of other crew work, while the crew is stopped).
2. Allow A (a persistent settings change on the laptop) to be applied before Langston is back, with his review on resume, or wait for him.
