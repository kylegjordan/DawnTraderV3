# B-TOKEN-ECONOMY — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · owner: PM Claude (KD-103) · routine reviewer: Langston (CLAUDE mode, generation 3) · scope: `B_TOKEN_ECONOMY_SCOPE.md` r2 @ `5aa251e7a`
STEP: 2 of 11 (gate passed with conditions, r2) · NEXT STEP: 3 of 11

## PREVIOUSLY STATED vs NOW (read first)
- **PREVIOUSLY STATED:** "Map the PM clone in `alert-split.mjs`" (scope OBJ-6). **NOW:** the PM clone stays unmapped and keeps the full list. **REASON:** PM's role file obliges it to chase every governance-overdue alert across the crew (`PM_CLAUDE_RULES.md` line 15). Narrowing PM to "its own" alerts would hide the alerts it exists to chase. The delta (A3) makes the full list cheap.
- **PREVIOUSLY STATED:** "canary on the PM session only, at project scope". **NOW:** the setting goes into the tracked `.claude/settings.local.json`, so it reaches every DawnTrader clone when that clone pulls. **REASON:**
  - The only per-folder scope is that file, and it is tracked in git (A1).
  - `/autocompact` writes **user** settings (docs, `model-config.md#set-the-auto-compact-window`), which would change Kyle's other projects, the Command Center among them. It is ruled out.
  - The canary holds anyway: the crew is stopped, so PM is the only DawnTrader session running.
  - The rollout gate is a canary verdict before any crew resume. If the canary fails, the commit is reverted before resume.
- **PREVIOUSLY STATED (11-17 proposal):** large savings expected from helper agents. **NOW:** an expected saving of about 1.7% of crew tokens. **REASON:** PM's own 11-05 measurement found it (`pm/decisions/2026-11-05_cheaper-helpers-and-short-conversations.md` §3.4, an ESTIMATE). The same pack estimated the context cap at an upper bound of 64-68%. A2 and A4 are kept, with expectations set accordingly.
- **PREVIOUSLY STATED:** Codex follows the same alert delta (scope OBJ-6). **NOW:** Codex keeps the full manual read. **REASON:** Codex has no hooks and no per-session state here (`AGENTS.md` §3). A by-hand delta would need state the session does not hold. This is exactly Coltrane's 11-19 condition 4 fallback, adopted as the design rather than as a fallback.

## Sources read (the six)
| # | Source | Read |
|---|---|---|
| 1 | Code at `origin/migration/aws-supabase` | the hooks named in A1-A6, `alert-split.mjs`, `settings.local.json`, `governance-checker/config.mjs`, `log-instructions-loaded.mjs`, `fresh-rules.mjs` |
| 2 | Runtime logs | `~/.claude/instructions-loaded.jsonl` (2,365 lines, 2026-08-06 to 11-18T21:50; keys include `event`, `session_id`, `context_bytes_total`); hook sinks (`inject-due-alerts.jsonl`, `measurement-shape.jsonl`, `stale-fetch.jsonl`, `result-shape.jsonl`); the PM transcript; `get_usage` (live context reports `autoCompactsAtPercent`: 97 for this session, the positive control for A2) |
| 3 | `SYSTEM_IMPACT_MAP.md` | "Claude Code Hook Layer (laptop sessions, NOT the app)"; "Session-Instruction Loading Estate" |
| 4 | `SYSTEM_MANUAL.md` | silent on every component (grep by each hook name; control: the same grep hits the System Impact Map). Correct for crew tooling. |
| 5 | Batch reports and the ledger | B-TOKEN-BURN-CUT scope §0; the PM decision pack of 11-05 (KD-34) and KD-46 (shorter-conversation trial); `RUNNING_ISSUES` #1074 (items iv and v); B-MEASURE-GATE (hook origins); B-CONDUCT-FILE and B-CONDUCT-DELIVERY-HOTFIX (chunked delivery); B-CLAUDEMD-SLIM |
| 6 | `bridge/canonical/` | not applicable: every component post-dates the 2026-01/02 governance change (earliest 2026-06-17) |

## Audit findings

**A1 — settings scope.**
- `.claude/settings.local.json` is tracked in git. Its top-level keys are `permissions`, `hooks` and `defaultMode`, with no `env` and no `model`.
- `.gitignore` has no matching line.
- There is no `.claude/settings.json` and no `.claude/agents/` at the ref.
- Docs: `autoCompactWindow` is valid in any settings file; values are a token count ≥ 100,000 or `"auto"`. `idleCompaction` is valid in any file; its full entry (type, default) could not be retrieved and is **UNCONFIRMED**.
- Docs are silent on whether a running session picks up `autoCompactWindow`, so this is observed in the canary, not assumed.
- Precedence: managed, then CLI, then project local, then project, then user. A project-local value therefore overrides any user value for DawnTrader sessions only.
- **Census:**
  - writers: sessions editing the file by hand;
  - readers: the Claude Code harness in each DawnTrader clone, and `scripts/measure-gate/hook-selftest.mjs` (reads the registrations);
  - no scheduler.

**A2 — the observable for the compaction cap.** `get_usage` on a session reports `autoCompactsAtPercent` (97 now, for this session at a 1M window). At 250k it should read about 25. This is the threshold instrument for A2 and A3, and it is readable for any running session by id.

**A3 — `inject-due-alerts.mjs` today.**
- It runs the whole-file filter on staging and caps the output at 25 (`MAX_INJECT`).
- It emits failure lines: "COULD NOT RUN" and "HOOK THREW".
- It uses `splitAlerts` when the clone maps to an alias; unmapped clones get the full list.
- **It does not read stdin today,** although the payload carries `session_id`, `transcript_path` and `cwd`.
- It keeps no state between prompts. Its only write is the sink `~/.claude/inject-due-alerts.jsonl`.
- `CLONE_TO_ALIAS` (`alert-split.mjs:19-24`) maps old, new, analyst and infra; `pm` is unmapped.
- **Importers:** `inject-due-alerts.mjs:33` and `scripts/analysis/test-alert-split.mjs`, which runs in CI (`ci.yml:243`). Any change must keep that test green.
- Census: one entry point (`UserPromptSubmit`, timeout 5 s); one reader of the owners file (this hook), written by the wake filter.

**A4 — the advisory hooks.**
- `guard-measurement-shape` (PreToolUse) and `guard-stale-fetch` (PreToolUse) warn every time, with no dedupe.
- `guard-result-shape` (PostToolUse) already dedupes its cap-bound leg only. The key is sha256 of `session_id` plus the command; the state file is `~/.claude/result-shape-dedupe.json`, capped at 500 keys. Its other legs warn every time.
- `session_id` is on stdin for all three.
- `hook-selftest.mjs` proves a hook is running only from its sink file, so sinks must keep being written.
- All three are warn-only. The blocking guards (`guard-governed-read`, `guard-bare-commit`, `guard-push-tsc-baseline`, `guard-ci-cited`, `guard-pm-slot`, `guard-pm-decisions`) are not touched.

**A5 — readers of CLAUDE.md content.**
- `log-instructions-loaded.mjs:66` stats its size: the loaded-set baseline.
- `fresh-rules.mjs:56` announces when it changed.
- `governance-checker/config.mjs:41` matches its name as housekeeping-only.
- `check-reviewer-siblings.mjs:29`, `dt-backup-sync.sh:59` and `dt-review_tests.sh` match its name.
- No code found that parses its headings or line numbers. This is an absence claim, sent to a fresh reader (record below).
- **Citations:** 787 lines across 304 tracked `.md` files cite "CLAUDE.md §". Every section heading therefore stays in place as a forwarding address, the same rule used when §2 and §9.5 moved.
- `AGENTS.md:25` states "~118 KB", but the file measures 122,263 B. It is swept (scope r2 condition 5).

**A5b — one content reader found by the fresh reader, re-derived at the ref.**
- `scripts/measure-gate/test-guard-measurement-shape.mjs` (lines ~180-240) takes CLAUDE.md, `.claude/memory/MEMORY.md` and `.claude/settings.local.json` as "homes". It extracts every mandated alert or inbox read by regex: backticked `tail`/`cat` of system-alerts, cc-discord-inbox or cc-wake; backticked `due-alerts.py`; fenced `ssh|tail|cat` lines; and allowlist `"Bash(...)"` entries.
- Its check M0 fails when a home yields zero commands. Every extracted command must then run silent under `guard-measurement-shape`.
- It is not run by CI. A `git grep` of `.github`, `package.json` and `scripts/` for its name finds no caller. It is a manual self-test.
- **Constraint on P5:** CLAUDE.md keeps at least one such mandated read. The §10.5 by-hand `due-alerts.py` command and the §6.6 inbox read are operative rules and stay anyway.
- **Constraint on P1 and P4:** `settings.local.json` edits keep its allowlist entries.
- **P5's proof gains a check:** the self-test passes M0 for all three homes after the slim.

**A6 — destinations exist** (bytes at the ref):
| File | Bytes |
|---|---|
| `COMMS_BRIDGE_RUNBOOK.md` | 14,304 |
| `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` | 23,703 |
| `LANGSTON_ARCHITECTURE.md` | 43,941 |
| `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` | 11,402 |
| `_archive/CLAUDE_MD_RULE_HISTORY.md` | 84,357 |
| `CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK.md` | 8,943 |
| `CLAUDE_CODE_FEATURE_WATCH.md` | 198,318 |

None is auto-loaded, so moving text into them adds no per-turn cost.

**A7 — the size control is missing.** The only size check is CONDUCT's, in `load-conduct.mjs` (6,144 tokens = 24,576 B; it warns and still loads in full). Nothing checks CLAUDE.md, and Codex has no hooks. A session-start warning alone therefore cannot reach Codex. A CI check is the only crew-neutral place.

**A8 — baseline data.**
- **The loaded-set log** covers the window.
- **The per-turn context method:** the 11-05 pack defines turns deduplicated by `message.id`, context per turn as input + cache_creation + cache_read, and its population rules. Its scripts lived in `%TEMP%` and must be rebuilt into the repo.
- **Compaction markers disagree** in the PM transcript: 8 `compact_boundary` lines against 13 `isCompactSummary` lines (line counts, not events). The 11-05 pack's drop-of-more-than-40% rule is a third method. The canary's own compaction is the positive control that settles which marker counts.
- **Transcripts are trimmed by hand,** so the population is read from the B-TRANSCRIPT-ARCHIVE day files, with the trim stated.
- **No Claude weekly-percent series exists in the repo,** so the usage line starts with this batch.
- **Helper model:** subagent transcripts carry an assistant `model` field (`sonnet` lines seen in the PM transcript). It is tied to entries in the canary run.

**A9 — two-crew reachability.**
- Claude auto-loads `CLAUDE.md` and `CONDUCT.md`.
- Codex auto-loads `AGENTS.md` only. That file orders reads of `CONDUCT.md`, `CLAUDE.md` and the step files (`AGENTS.md:22-25`).
- Any rule moved out of `CLAUDE.md` must name its destination path in `CLAUDE.md` itself, so both crews follow the same pointer.
- The Codex config is per user (`~/.codex/config.toml`). Whether a project `.codex/config.toml` is honoured is unconfirmed (design §3).

**A10 — governance-checker gradability.** The new scripts land under `scripts/crew-tooling/`, a `CODE_PREFIXES` path (`config.mjs:102`), so the checker grades the batch. **Checked:** `scripts/crew-tooling/` does not exist yet (no collision).

**A11 — no staging observation window.** Nothing in this batch is observed on staging, so no `DEPLOY_WINDOWS.jsonl` row is filed. The alert reads are read-only, and `dt-deploy` is never run.

## Implementation plan (each item points at its finding)
| # | Objective | What is built | Finding | Proof (instrument, control) |
|---|---|---|---|---|
| P0 | OBJ-0 | `scripts/crew-tooling/token-baseline.py`: the 11-05 method rebuilt in the repo. Window 2026-11-09 23:26Z to 2026-11-16 19:45Z; denominator active crew-hours; population the archive day files plus live transcripts, trim stated. Also loaded-set bytes, `inject-due-alerts` sink bytes per prompt, lane posts per day (Helsinki inbox `sender` = lane), helper calls by model. Output `Change Lists/B_TOKEN_ECONOMY_BASELINE.md` with acceptance and rollback criteria per leg | A8 | Re-running the 11-05 population reproduces its table within rounding: positive control |
| P1 | OBJ-1 | `.claude/settings.local.json` gains `"autoCompactWindow": 250000` and `"idleCompaction": false` | A1, A2 | `autoCompactsAtPercent` moves from 97 to about 25 on this session (or after restart, recorded either way). After a real compaction: CONDUCT 4/4 and the other start-up lines appear; the `instructions-loaded` line has `event` compact; the CURRENT POSITION is restated; the alert line appears on the next prompt; zero duplicate transcript ids (`dedup`/`validate` tools of CLAUDE.md §6.11 — **UNAUDITED: their path is not yet located**, Step 3 finds them or writes an equivalent check); the session resumes its task. Rollback: revert the commit before any resume |
| P2 | OBJ-2 | Nothing new; the file reaches each clone at pull | A1 | At resume, `get_usage(session_id)` per session shows `autoCompactsAtPercent` about 25; the first compaction per session repeats P1's checks |
| P3 | OBJ-3 | Codex: `model_auto_compact_token_limit` in a project `.codex/config.toml` if honoured, else in `~/.codex/config.toml` | A9 | On the first Codex session after build, observe the effective limit and its scope. **Waits for a Codex session;** if none happens before close, OBJ-3 closes CLOSED-UNPROVEN with that home |
| P4 | OBJ-4 | `settings.local.json` `env.CLAUDE_CODE_SUBAGENT_MODEL = "sonnet"` (no FORCE, so a requested model still wins); `.claude/agents/Explore.md` (`model: haiku`, read-only tools; docs: a project agent named Explore overrides the built-in); `availableModels` = Opus 5.5, Sonnet, Haiku; two lines in CLAUDE.md beside the delegation guidance. Codex `[agents]` roles with the P3 canary | A1, A8 | Four controls read from each subagent transcript's assistant `model`: default gives sonnet, explicit haiku gives haiku, requested Opus 5.5 gives opus-5-5, a model above the list gives a fallback (docs: a fallback, unnamed). Positive control: the earlier sonnet helpers in this transcript |
| P5 | OBJ-5 | CLAUDE.md edited down to ≤ 78,000 B. Move depth to A6's destinations; keep every heading and the operative rules (Coltrane r4 condition 3); §8 becomes a pointer; sweep stated-size pointers (`AGENTS.md:25`). `Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json` (passage hash, origin heading, destination path) checked by `scripts/crew-tooling/move-ledger-check.mjs` (each passage present at its destination, absent from CLAUDE.md). `Change Lists/B_TOKEN_ECONOMY_REACHABILITY.md` (each kept or moved rule: Claude path, Codex path). Size control: `scripts/crew-tooling/claude-md-cap.mjs` run at session start (Claude) and as a CI step (both crews), **warn-only until Langston rules on blocking** (the B-WORKFLOW-IMPROVE ground rule, applied here) | A5, A6, A7, A9 | `test-guard-measurement-shape.mjs` passes M0 for all three homes; the move-ledger check passes and fails on a seeded missing passage; the cap check fails on a scratch copy at 78,001 B; the duplicate audit (`move-ledger-check --dupes`) finds no passage in two homes; `fresh-rules` announces the change |
| P6 | OBJ-6 | `scripts/crew-tooling/alert-delta.mjs` (state keyed by `session_id`, under `~/.claude/cc-wake-state/`); `inject-due-alerts.mjs` reads stdin `session_id`. A SessionStart marker (start, resume or compact) resets the session to the full list. Delta semantics: new, owner, severity, due state, resolved or gone, plus a count line telling zero, unchanged and check-failed apart. The baseline advances only after a complete successful read. **Shipped in shadow:** it logs the delta it would inject while still injecting the full list, for 50 prompts or 3 days, then switches if every shadow delta matches a recomputed diff. Codex keeps the full manual read | A3 | Seed a new alert (shows once, then counted as unchanged); an unchanged queue shows "unchanged N", never silence; a forced filter failure shows "check failed"; `test-alert-split.mjs` stays green |
| P7 | OBJ-7 | Extend `guard-result-shape`'s dedupe pattern (sha256 of `session_id` plus warning kind) to `guard-measurement-shape` and `guard-stale-fetch`, and to `guard-result-shape`'s other legs. The SessionStart compact marker clears the keys, so the first warning after a compaction shows. **Sinks are still written on every event** (A4, the selftest depends on them) | A4 | An identical repeat is suppressed; a different kind shows; after the compact marker it shows again; `hook-selftest` still reports running |
| P8 | OBJ-9 | Text edits to `pm-usage-stop`, `pm-codex-usage-stop`, `pm-transition-to-codex` and `pm-transition-to-claude`: name the settings and the smoke check | A1, A9 | Each names them at the ref |
| P9 | OBJ-10 | Re-run `token-baseline.py` after each leg; weekly line to Kyle | A8 | Same instrument as P0 |

**Order:** P0, then P1 (canary), then P4, then P6 (shadow), then P7, then P5, then P8. P2 and P3 follow at resume and at the next Codex session. Each leg is measured (P9) before the next.

**Files touched:**
- **New:**
  - `scripts/crew-tooling/` (four scripts)
  - `.claude/agents/Explore.md`
  - `Change Lists/B_TOKEN_ECONOMY_*`
- **Modified:**
  - `.claude/settings.local.json`
  - `.claude/hooks/inject-due-alerts.mjs`
  - `.claude/hooks/guard-measurement-shape.mjs`
  - `.claude/hooks/guard-stale-fetch.mjs`
  - `.claude/hooks/guard-result-shape.mjs`
  - one SessionStart marker hook (new) and its registration
  - `CLAUDE.md`
  - `AGENTS.md`
  - the A6 destinations
  - the four PM skills
  - `.github/workflows/ci.yml` (one warn-only step)

## Risks and blast radius
- **A canary compaction drops in-flight state.** Rollback is one commit, and P1's checks are observed.
- **The setting reaches all clones at their next pull.** They are stopped, and the resume is gated on the canary.
- **The hook edits run in every DawnTrader session.** Each is fail-open today and stays fail-open. The alert delta ships in shadow first.
- **The CI step** is warn-only.
- **CLAUDE.md:** headings stay, so the 787 citation lines still resolve; moved text is proven present at its destination.

## Fresh-reader record
REVIEWER: claim-only · "nothing in code depends on CLAUDE.md's internal structure; only its name is matched" (A5) · verdict: HIT — `test-guard-measurement-shape.mjs` reads CLAUDE.md content (M0) · re-derived y (A5b, at the ref, with its caller census). The original A5 absence claim is withdrawn and replaced by A5b. Server-side readers on Helsinki and staging were not searched; `dt-push-notice.sh:182` matches the name only.

## r2 — Langston's Step-2 conditions (2026-11-19 14:30Z, at `0b4bb0a8d`; verbatim in `Langston Design Asks/B_TOKEN_ECONOMY_B_WORKFLOW_IMPROVE_STEP1_VERDICTS.md`), all accepted
1. **The size pointer is at `AGENTS.md:25`.** That line reads: ⚠️ `CLAUDE.md` is large (~118 KB). It is corrected above and in the scope.
2. **The P5 move ledger also sweeps pinned line citations.** At the ref there are **101** `CLAUDE.md:<line>` citations (Langston's count). The live one is `.claude/skills/workflow-10-governance/SKILL.md:205` (pins `CLAUDE.md:108`), plus three in `test-guard-measurement-shape.mjs`. Each is re-pointed to a heading, or to the new line at the post-slim ref. The ledger lists every citation with its old and new target.
3. **Entry points, censused at Step 3 before P6 and P7 are built.**
   - The six registered hook events in `.claude/settings.local.json` are SessionStart, UserPromptSubmit, InstructionsLoaded, PreToolUse, PostToolUse and **PreCompact** (→ `dt_archive_trigger.py precompact`).
   - **HYPOTHESIS, not yet established:** "SessionStart carries a compact source". The registration matcher is `startup|resume|compact`, but no line of ours implements it. P6 and P7 will use whichever event is shown to fire once per compaction, PreCompact or SessionStart(compact), tested on the canary's real compaction.
   - **The deletes leg:** P5 deletes CLAUDE.md content. Its state-read census is A5 plus A5b plus condition 2. P6 and P7 delete no state, because sinks are kept and dedupe keys only expire.
4. **The canary is mechanical.**
   1. Apply the P1 settings in the PM clone's working tree, uncommitted. This is intentional local config under §7.1 check 3, and only PM sees it.
   2. Run the canary.
   3. Commit and push only after the canary verdict.

   That restores scope OBJ-1 (PM only) and OBJ-2 (rollout by push) as written. The "crew is stopped" reasoning is withdrawn as the safeguard.
5. **The mandated read P5 keeps is named:** the §10.5 by-hand `ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py` line in CLAUDE.md. The §6.6 inbox read also stays.
6. **Controls or tags at Step 3 for:**
   - **A8** "no Claude weekly-percent series": a grep with a positive control (the Codex readings it does find).
   - **A1's precedence chain:** observed in the canary (the project-local value wins over user).
   - **A2's `autoCompactsAtPercent` 97:** re-read and recorded with the session id and time.

   Until then each stays tagged RULED ON REPORTED FACT.
