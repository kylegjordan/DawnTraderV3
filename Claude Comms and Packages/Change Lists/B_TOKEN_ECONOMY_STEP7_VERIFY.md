# B-TOKEN-ECONOMY — Step 5, Step 6 and Step 7 record

Owner: PM Claude (KD-103). Written 2026-11-19 ~21:45Z. Ref verified: `63cacfea0` (fetched; local = origin, 0 ahead / 0 behind).

## Step 5 — CI

`63cacfea0` (the Step-4 conditions commit): run 44618271147, **4/4 success** — TypeScript Check (baseline gate), Test Suite, Build, Docker Build. The Test Suite job now runs `move-ledger-check.mjs --dupes` **blocking** (no `--ci`), after both `--self-test` calls; the cap check stays warn-only (Langston judgement call 3).

## Step 6 — staging deploy: NOT APPLICABLE

Nothing in the batch runs on the staging server. `git diff --name-only 2392829c0^ 63cacfea0`, with crew tooling (`scripts/crew-tooling/`), hooks and agents (`.claude/`), CI (`.github/`), `CLAUDE.md`, governance documents and `Claude Comms and Packages/` removed, leaves **two of 40 files**: `AGENTS.md` (the Codex crew's rules file) and `scripts/measure-gate/test-guard-measurement-shape.mjs` (a test of a laptop hook). Neither is served or run by the staging app. The app server, its database and its UI are untouched, so there is nothing for `dt-deploy` to release. For Langston to confirm at Step 8.

## Step 7 — first-pass verification, where each change actually runs

The changes run in the Claude clones on the laptop and in CI, not on staging, so the instrument for each is the place it runs. **No staging UI check: there is no staging change to see** (workflow-07, "verify the thing that changed, with the instrument that showed the problem").

| OBJ | what | instrument and result |
|---|---|---|
| 1 | 250k context window, no idle compaction | `get_usage` on this session after a compaction: `contextWindow 250000`, `autoCompactsAtPercent 87`. Was 200,000 at baseline (canary Obs 1). |
| 4 | Default helpers on cheaper models | **general-purpose override, positive control (Langston Step-4 condition 5b):** a `general-purpose` agent spawned with **no** `model` returned API `message.model` = **`claude-sonnet-5-5`** in its transcript (`subagents/agent-a2fc342d8ff0cf68b.jsonl`); the parent session runs `claude-opus-5-5`. The instrument can show the main model (the same file's `advisorModel` field carries `claude-opus-5-5`), so the Sonnet reading discriminates. Explore (Haiku) passed its canary earlier (Obs 2). |
| 5 | CLAUDE.md slimmed, nothing lost | `claude-md-cap.mjs --report`: 77,480 B of 78,000 B (LF), 520 B headroom. SessionStart form prints nothing, exit 0 (silent under cap; self-test proves it speaks over cap). `move-ledger-check.mjs --dupes`: OK, 55 moves, each once at destination, unchanged, gone from CLAUDE.md, one home each. `--self-test` 5/5 (mutation proof). |
| 6 | Alert delta, shadow only | `alert-delta.mjs --verify` (1.1): 14 rows, `delta` **10** verified, 0 mismatches, 0 unparsed, 1 session → `VERDICT: NOT YET (10 of 50 verified deltas)`, **exit 3**. Correct: below the gate, and NOT YET no longer exits 0 (Step-4 defect 1). `--self-test` 14/14. The full alert list is still injected on every prompt (seen this turn). |
| 7 | Warn-only guards show each kind once per session | Live in this session after the compaction: the measurement-shape guard showed `worktree-not-ref` and `truncation-is-not-population` once, then `count-from-search` once, each with "(each kind shown once per session until the next compaction)"; no kind repeated. The kinds shown before the compaction showed again after it, which is the reset path. `warn-dedupe.mjs --self-test` 10/10. |
| 9 | Handover skills name the settings + smoke check | Committed in `6bfb3613d`; not exercised (no handover ran). |
| 10 | Measurement record | Canary Obs 5 (`B_TOKEN_ECONOMY_CANARY.md`). |
| 2, 3 | Crew rollout of the window; Codex canary | **Not run.** The crew is stopped until the usage reset; Codex has no session yet. Open, carried to the close as the outstanding objectives. |

## Langston Step-4 condition 5 — discharged in this commit

(a) `.claude/agents/general-purpose.md` committed. (b) Positive control above. (c) `CLAUDE_CODE_FEATURE_WATCH.md` gains a row in "Already adopted / known" saying the override is undocumented behaviour and must be re-checked on every Claude Code version change, with the transcript-field method.

## Reviewer record

REVIEWER: none spawned for this step. Load-bearing claims **NOT RE-READ** by a fresh reader: the Step 6 N/A file filter, and the reading of `message.model` as the served model.
