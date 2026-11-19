# B-TOKEN-ECONOMY — SCOPE (Step 1)

change-class: non_architecture
owner: PM Claude (KD-103; crew tooling only, no trading code) · reviewer for this batch: Coltrane (Kyle named "Langston or Coltrane" in KD-103; Langston is off for usage) · plan row: `SPRINT_TO_LIVE_PLAN.md` stage 0 (PM Claude) order 1
STEP: 1 of 11 (gate passed with conditions, r2) · NEXT STEP: 2 of 11

## Intent (Kyle's words, KD-103 and 11-17/11-18)
- 11-17: "I want you to... propose a system that allows us to manage this as automatically as possible. I'd like to be involved in it as little as possible."
- KD-103: "the usage plan (capping your tokens before compaction and reducing the rules file as per your plan and the using lessor model-agents where possible)... Make sure to include in your plans, that what you design works for both the Claude and Codex sessions."
- Rejected (11-18): a pacer that defers "non-urgent" work. Rejected (11-18): per-step model switching and effort changes.

**Done means:**
- The crew's weekly allowance burns measurably slower, against a pre-registered baseline.
- No rule is lost.
- No session loses its place across a compaction.
- The same savings apply on the Codex shift.

## Design sources (reviewed)
- `B_TOKEN_ECONOMY_PROPOSAL.md` r4: Coltrane PROCEED WITH CONDITIONS, 11-18 22:54Z, six conditions folded.
- `1-system-manual/pm/reviews/2026-11-19_CREW_EFFICIENCY_AND_WORKFLOW_DESIGN.md` §3 and §6: Coltrane PROCEED WITH CONDITIONS, 11-19 01:40Z, six conditions folded.

Where this scope and those documents differ, this scope is the build contract.

## Objectives
Each objective carries its proof: what is observed, the instrument, and the pass condition. Every proof is re-derived at Step 7, then challenged at Step 8.

**OBJ-0 — Baseline, pre-registered before any change.**
- A committed file `Change Lists/B_TOKEN_ECONOMY_BASELINE.md` records:
  - weekly-percent readings and the burn per active crew-day;
  - compactions per session;
  - always-loaded bytes per start (`~/.claude/instructions-loaded.jsonl`);
  - per-prompt hook bytes;
  - alert-lane posts per day;
  - helper calls by model.
- Each leg gets acceptance and rollback criteria.
- **Proof:** the file's commit precedes every OBJ-1 to OBJ-8 change commit.

**OBJ-1 — Claude compaction cap, canary on the PM session.**
- Set `autoCompactWindow` ≈ 250k and `idleCompaction: false` for the PM clone only, at project scope.
- **Proof:** each of these is observed after a real compaction at the new threshold:
  - the threshold fires as set;
  - every start-up chunk loads (CONDUCT 4/4, own memory, session reminder);
  - the CURRENT POSITION and the in-flight task survive;
  - the wake watcher re-arms when the crew runs;
  - the alert check runs;
  - resume works;
  - zero duplicate transcript ids (`memory/validate.py`).
- **Rollback trigger:** any check fails → remove the setting, which is one line.

**OBJ-2 — Claude rollout.**
- The same setting goes to the OLD, NEW, ANALYST and Infra clones.
- **Proof:** a smoke check in each folder confirms the effective threshold, and the first compaction in each passes the OBJ-1 checks.

**OBJ-3 — Codex compaction cap, canary then rollout.**
- `model_auto_compact_token_limit` is set to the matching value.
- **Proof:** on one Codex session, observe the effective configuration and its scope and precedence (project versus user), the exact threshold, continuity, and rollback. Then each Codex folder gets a smoke check.
- Nothing is assumed from documentation.

**OBJ-4 — Helper agents on cheaper models, both crews.**
- **Claude:**
  - helpers default to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL`);
  - our own `Explore` agent runs on Haiku for literal file finding;
  - an allowed-models ceiling of Opus 5.5.
- **Codex:** `[agents]` roles, each with a config file setting a cheaper model.
- **The rule, two lines in CLAUDE.md:** delegate only work that is self-contained and independently checkable, returns a short cited answer, and costs less to check than to read yourself. Haiku for finding files, Sonnet for interpretation, never for decisions, design, shipping code or trading review.
- **Proof:** four served-model controls per crew, observed from the served model and not from configuration:
  1. the default comes back as Sonnet;
  2. an explicit Haiku call comes back as Haiku;
  3. a requested Opus 5.5 comes back as Opus 5.5;
  4. a model above the ceiling is refused or substituted.

**OBJ-5 — Slim CLAUDE.md to an exact byte ceiling, nothing lost.**
- Move depth (incident narratives, MEASURED history, comms internals, infrastructure reference) to the named runbooks, skills and history doc. Keep the operative rules at their point of action, as listed in Coltrane condition 3 (r4).
- Section 8 becomes a pointer to `LANGSTON_ARCHITECTURE.md`.
- **Target:** ≤ 78,000 B, from 122,263 B at `0ec528c6a`.
- **Proof:**
  - **(a) A move ledger** lists every removed paragraph with its destination `path:line` at the ref. A script checks that each moved passage exists at its destination.
  - **(b) A crew-by-rule reachability manifest** (Coltrane 11-19 condition 1) shows each kept or moved rule reachable for Claude (auto-load or a named read) and for Codex (via `AGENTS.md` §2 reads).
  - **(c) A byte-cap warning,** in the same form as CONDUCT's in `load-conduct.mjs`, is tested red by exceeding the ceiling on a scratch copy.
  - **(d) One-in-one-out** is written beside the cap.
  - **(e) A duplicate audit** confirms no rule now has two homes.

**OBJ-6 — Alert injection by change, with state rules.**
- One shared script computes the delta; the Claude hook (`inject-due-alerts.mjs`) calls it.
  - The first prompt after start, resume or compaction gets the full list.
  - Later prompts get changes only: new, owner, severity, due state, resolved or gone.
  - Every prompt also gets a count line that tells zero, unchanged and check-failed apart.
  - The baseline advances only after a complete successful read.
- Map the PM clone in `alert-split.mjs`.
- **The full path stays as a fallback until the delta is independently green** (11-19 condition 4).
- **Codex:** the same script, run by hand per `AGENTS.md` §2.
  - **Proof:** after a real Codex auto-compaction, the instruction reappears and runs.
  - If it does not, Codex keeps the full manual read.
- **Proof:** a positive control (seed a new alert, which must appear once) and a negative control (an unchanged queue must show the unchanged count, not silence).

**OBJ-7 — Advisory hook warnings shown once per session per kind.**
- Applies to `guard-measurement-shape`, `guard-stale-fetch` and the `guard-result-shape` legs.
- Blocks, changed violations, failures and the first warning after compaction always show.
- **Proof:** a repeat of an identical warning is suppressed; a block still shows; the first warning after a compaction shows.

**OBJ-8 — DROPPED (Langston Step-1 ruling, condition 1).** The cadence lives in `computeResurfaceStale` (`server/services/system-alerts.ts:785-802`), keyed by state and severity only, so a per-key cadence is app code, outside KD-103. The want is written as a rider on `#1074` item (v). OBJ-6 already stops an unchanged alert from repeating in each prompt.

**OBJ-9 — Handover carries the settings.**
- `pm-usage-stop`, `pm-codex-usage-stop`, `pm-transition-to-codex` and `pm-transition-to-claude` name the new settings and checks.
- **Proof:** each skill names them at the ref.

**OBJ-10 — Measure after every leg.**
- Each leg's result is recorded against OBJ-0's criteria.
- The weekly usage line goes to Kyle.

## Out of scope (named homes)
- **Langston's stable prompt prefix and the heartbeat as a plain script.** These are Langston-box and Infra files, and B-HEARTBEAT-RESCOPE is already placed after live. They go to increment 2 of this batch, with Infra consulted. The proposal's section D lists them.
- **The governance-history search and every workflow change:** B-WORKFLOW-IMPROVE.

## 1.a Architectural read (System Impact Map and System Manual)
**`SYSTEM_IMPACT_MAP.md` covers the touched components:**
- **Section "Claude Code Hook Layer (laptop sessions, NOT the app)".** It has rows for `inject-due-alerts`, `due-alerts.py`, `guard-measurement-shape`, `guard-stale-fetch` and `guard-result-shape` (including the `cap-bound` leg).
- **Section "Session-Instruction Loading Estate".** `load-own-memory` is rated LOW and `load-conduct` MEDIUM, because every session's conduct depends on it.
- **The B-CODEX-FAILOVER "INSTRUCTION SURFACE" line.** `AGENTS.md` is the Codex counterpart and supplies manual replacements for hooks.

Both sections need content updates at Step 10.

**`SYSTEM_MANUAL.md` is silent on all of them.** That is correct: they are crew tooling, not trading architecture. The search was a grep for each hook name; the positive control is the same grep returning hits on the System Impact Map.

**Upstream and downstream:**
- The alert hook reads the staging alerts file over SSH, plus the wake filter's owner file.
- The loaders feed every session's start.
- The per-Bash guards write JSONL sinks that `scripts/measure-gate/hook-selftest.mjs` checks.
- The governance checker runs on staging and feeds the alert queue, Langston's triage and then the owner.

**The load-own-memory and load-conduct registrations (×5 each) are deliberate delivery slices** (B-CONDUCT-DELIVERY-HOTFIX `a917353d1`: start-up output over ~10 KB is cut to a ~2 KB preview). They are not touched.

## 1.b Provenance read
Corpora searched: `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the completion reports, `git log -S` (not path-limited), the governance-checker README, and the feature-watch run logs.

| Component | Tier | Introducing commit (verbatim) | Disposition |
|---|---|---|---|
| `inject-due-alerts.mjs` | 1 | `d0f3c3ee0` 2026-09-02 "OBJ-1 stage 2: the alert injector, built against the OBSERVED UserPromptSubmit shape - and a failed check is injected as a visible failure, never as silence"; owner narrowing B-TOKEN-BURN-CUT; last `a23e42871` 2026-10-03 | (2) relevant, update to today's intent (delta mode); its failure-is-visible rule is kept |
| `scripts/due-alerts.py` | 2 | `9608a3da5` 2026-09-29 "B-GOV-REPORTING r6: carry out Langston's rulings on the reporting rules that were never applied" | (1) unchanged; read by the delta script |
| `guard-measurement-shape.mjs` | 1 | `94d50fede` 2026-08-31 "OBJ-4 built, proven offline 28/28, wired - and it fired a true positive on its author within seconds" | (2) keep the check, dedupe identical advisory repeats |
| `guard-stale-fetch.mjs` | 1 | `8bcee9db8` 2026-09-02 "OBJ-1 stage 1 + OBJ-2 + OBJ-3 built and proven; the OBJ-5 reader loop closed with the self-test correcting two of its own inputs" | (2) same |
| `guard-result-shape.mjs` | 1 | `d1f7754d4` 2026-09-02 "B-MEASURE-GATE Step-3: OBJ-6c built, proven 28/28, wired on PostToolUse, delivery measured live" | (2) same |
| `load-conduct.mjs` (cap-warning pattern) | 2 | `9d4832359` 2026-08-20 "B-CONDUCT-FILE Step-3: the conduct file, its loader, and the CLAUDE.md strip" | (1) unchanged; its cap warning is the model for OBJ-5c |
| `CLAUDE.md` | 1 | Slimmed by B-CONDUCT-FILE (`9d4832359`, 140,011 → 116,796 B), B-RULES-1d (`077c435f7`, the eleven step skills), B-CLAUDEMD-SLIM (`f22ba8bcb`, → 112,081 B); BATCH_CATALOG records the batch "does not stop the regrowth"; +10.2 KB in 25 commits since | (2) slim again, add the missing growth control |
| `gov-openmaxage` / `gov-staleopen` (`poller.mjs`) | 1 | `3d3dce073` 2026-06-17 "B-GOV Step-3: governance-checker (deterministic doc-set + deadline detector; inert scaffolding)"; `ec37b2990` 2026-06-19 "B-GOV-2: activate the governance-checker — change-class declaration + dead-man heartbeat + path-heuristic guard + shadow mode" | see Finding 1 |
| `autoCompactWindow`, `CLAUDE_CODE_SUBAGENT_MODEL`, `model_auto_compact_token_limit` | 2 | No prior adoption. `git log -S` shows only this batch's proposal and design commits, plus feature-watch run logs of 10-10 and 10-12 noting the setting with no finding (control: `load-own-memory` returns its commits) | new |

## Finding 1 — the open-batch nag overlaps #1074
`RUNNING_ISSUES` #1074 (OPEN 2026-09-22, owner CC-B) reads: "THE GOVERNANCE CHECKER'S TWO OPEN-BATCH BACKSTOP ALERTS HAVE NO RESOLVE EDGE". It is placed as item (iv) of 2.4b B-ALERT-QUEUE-INTEGRITY, on the after-live list. This batch's cadence change touches the same function.

**Proposed for Coltrane's ruling at this step:** this batch changes only the cadence (fire at the threshold, then weekly, owner changes at once). The resolve edge stays with #1074 and CC-B. A cross-reference is written on #1074 so neither change overwrites the other.

The alternative is to drop OBJ-8 and leave the whole thing to #1074 after live.

DISPOSITION: no work here — withdrawn, citing Langston's Step-1 ruling (`Langston Design Asks/B_TOKEN_ECONOMY_B_WORKFLOW_IMPROVE_STEP1_VERDICTS.md`); rider added to #1074.

## Governance applicable (Step 10, judged now, confirmed then)
- `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (Hook Layer and Loading Estate content), `CLAUDE.md`, `AGENTS.md`, the four handover skills, `SEARCH_SURFACES.md` (only if the helper rule touches it), `RUNNING_ISSUES` (#1074 cross-reference), and the memory files.
- `SYSTEM_MANUAL`: not applicable (crew tooling; the reason is cited above).

## Risks
- **A compaction loses in-flight state.** Guarded by the OBJ-1 canary and its rollback trigger.
- **A moved rule becomes unreachable for Codex.** Guarded by the OBJ-5 reachability manifest.
- **Helpers silently run a different model.** Guarded by the OBJ-4 served-model controls.
- **The alert delta hides an alert.** Guarded by the full-path fallback, the controls, and the baseline advancing only after a complete read.

## r2 — Langston's Step-1 conditions (2026-11-19, at `72bd37a4a`; verdict file `Langston Design Asks/B_TOKEN_ECONOMY_B_WORKFLOW_IMPROVE_STEP1_VERDICTS.md`), all accepted
1. **OBJ-8 is dropped and a rider is written on #1074** (above).
2. **The batch is gradable by the governance checker.** OBJ-6's shared delta script lands under `scripts/crew-tooling/`, a `CODE_PREFIXES` path (`scripts/governance-checker/config.mjs:102`), so the checker enforces the batch. Step 2 names every file and prefix. If nothing lands under a code prefix, the Step-10 ledger is the sole control, and the scope will say so.
3. **The class is confirmed `non_architecture`.** Both System Impact Map sections (Hook Layer, Loading Estate) are required-by-judgement in the Step-10 ledger; neither may take N/A.
4. **The OBJ-0 baseline excludes the usage stop.** The baseline window is 2026-11-09 23:26Z (crew resumed on Claude) to 2026-11-16 19:45Z (usage stop). The denominator is active crew-hours, meaning hours with at least one building session working. The stop period is reported separately and never mixed in.
5. **The OBJ-5 move ledger sweeps stated-size pointers.** For example, `AGENTS.md` line 26 says CLAUDE.md is "~118 KB" when it measures 122,263 B. Such pointers are replaced with a named read of the live size, never a figure.
