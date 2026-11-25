# B-TOKEN-ECONOMY — PROGRESS REPORT

**OPEN — waiting on the Claude crew rollout of the 250k window (OBJ-2), landing the approved Codex canary record (OBJ-3), and the alert-delta shadow reaching 50 verified deltas (parent P6).**

Owner: PM Claude · Kyle KD-103 · change-class `non_architecture` · sprint plan stage 0 row 1 · written 2026-11-19.
Scope `Scope Files/B_TOKEN_ECONOMY_SCOPE.md` · pre-audit `Scope Files/B_TOKEN_ECONOMY_PRE_AUDIT.md` · change list `Change Lists/B_TOKEN_ECONOMY_CHANGE_LIST.md`.

## 1. What the batch is for, and what shipped

Slow the weekly Claude allowance burn without dropping a rule or a check, designed for both the Claude and Codex crews.

| leg | commit | what |
|---|---|---|
| P0 | `2392829c0` | pre-registered baseline + `scripts/crew-tooling/token-baseline.py` |
| P1/P4 | `424a61945`, `4ce227502` | `autoCompactWindow 250000`, `idleCompaction false`; Explore agent on Haiku |
| P6 | `ea9c7c1dc` | `alert-delta.mjs` in shadow (full alert list still injected) |
| P7 | `14cee87c9` | warn-only guards show each kind once per session |
| P5 | `198e6ddcb` | CLAUDE.md 122,263 → 77,480 B, 55 passages moved verbatim, move ledger + checks |
| P8, P9 | `6bfb3613d`, `eafd993eb` | PM handover skills; measurement record (canary Obs 5) |
| Step-4 fixes | `63cacfea0` | alert-delta 1.1 (only PASS exits 0, gate on verified deltas, log rotation); ledger check blocking in CI |
| Step 7 | `14c8d7678` | general-purpose agent on Sonnet committed; feature-watch row |

## 2. Steps, with evidence

| step | result |
|---|---|
| 1 Scope, 2 Pre-audit | Langston passed both (pre-audit r2 with conditions, 2026-11-19 14:30Z) |
| 3 Build | legs above, each canaried (`Change Lists/B_TOKEN_ECONOMY_CANARY.md`) |
| 4 Code review | Langston **PROCEED** at `00e317fd7`, four conditions, all applied at `63cacfea0` (`Change Lists/B_TOKEN_ECONOMY_STEP4_REVIEW.md`) |
| 5 CI | 4/4 at `63cacfea0` (run 44618271147) and at `14c8d7678` (run 44621617365) |
| 6 Deploy | **N/A** — 0 of 42 files run on staging; Langston re-derived it (no `server/ client/ shared/ migrations/`, `package.json` has 0 references to the tooling) |
| 7 First pass | `Change Lists/B_TOKEN_ECONOMY_STEP7_VERIFY.md` |
| 8 Second pass | Langston **PASS WITH CONDITIONS** (direct invoke 2026-11-19T21:50Z): Step 6 N/A and conditions 1-4 re-derived; condition 5(b), OBJ-1 and OBJ-7 ruled on reported fact (laptop-only) |
| 10 Governance | ledger below |

**Condition 5(b) evidence, verbatim from the artifact** (Langston Step 8: quote the fields, not a summary). File `~/.claude/projects/C--DawnTraderV3-pm/994e6488-db2e-49a0-8e00-4d3635208c2d/subagents/agent-a2fc342d8ff0cf68b.jsonl`, the one `assistant` record:
`{"type": "assistant", "timestamp": "2026-11-19T21:40:05.697Z", "message.model": "claude-sonnet-5-5", "requestedModel": "claude-sonnet-5-5", "advisorModel": "claude-opus-5-5"}`
The agent was spawned as `general-purpose` with no `model`. `advisorModel` shows the same file can carry the main model.

**Reported fact, not re-derived by Langston:** OBJ-1 (`get_usage`: `contextWindow 250000`, `autoCompactsAtPercent 87`) and OBJ-7 (each warning kind shown once per session, shown again after a compaction).

## 3. PRE-REGISTERED close criteria — written before the data arrives

| item | PASS | FAIL |
|---|---|---|
| OBJ-2 crew rollout | each of OLD, NEW, ANALYST and Infra, after resume and a restart, reads `contextWindow 250000` on `get_usage` | any session reads another window after a restart, with the setting present at the ref |
| OBJ-3 Codex canary | the Codex-side equivalent named in the scope is applied in one Codex session and its measured effect is recorded | not applicable to Codex, recorded with the reason, and the scope objective amended with Langston |
| P6 shadow → live | `alert-delta.mjs --verify` exits 0: ≥50 verified deltas, 0 mismatches, `counts.check_failed` 0 or explained; then Langston rules on the flip as a separate commit | any mismatch, or a `check_failed` count that cannot be explained |

Window shape: **quantity** (50 verified deltas) for P6; **event** (crew resume, first Codex session) for OBJ-2 and OBJ-3. The batch closes when the data is in **and** the decision is recorded (flip or not, rollout done or not).

### PM-only continuation on 2026-11-24

- **OBJ-3 evidence passed independent review.** Coltrane ruled PROCEED at `43ab8679d` on 2026-11-23 at 22:44:30 UTC. The canary record in `Change Lists/B_TOKEN_ECONOMY_CANARY.md`, Observation 6, records a strict configuration read in all five DawnTrader Codex folders and an isolated low-threshold run that compacted and continued. The 250k threshold was checked by configuration and precedence. The original trial did not force a 250k crossing. Keep the Workflow Improve OBJ-8 step-file reading leg distinct from this compaction evidence.
- **PM-owned alert follow-up (KD-115 follow-on, amendment P8).** The hourly check now recognizes `CC-PM` receipt records and `PM Claude` action posts. When PM owns the alert, follow-up asks PM to check its own receipt or action. Four seeded cases went from failing to passing, including a critical alert with no receipt and a builder's post that must not count as PM action. All 21 offline checks passed. This change is pending reviewer acceptance and has not been installed or run on live alert data.
- **P6 has two separate evidence sets.** The parent's 50 verified deltas are the gate for shortening the injected alert list. The amendment's alert-owner routing observation is documented in `Change Lists/B_TOKEN_ECONOMY_AMD1_P6_STEP7_VERIFY.md`. Its day-3 read (`6fcc5d572`) found no routing events while Langston was off and contributes no agreement evidence.
- **Remaining amendment closeout:** P10 consolidates measured Claude/Codex parity by leg, and P11 reconciles the governance records. Both remain open.

## 4. Unproven, stated as unproven

- Whether the shorter alert list saves what the shadow predicts: only 10 verified deltas so far, from one session.
- That the general-purpose override survives a Claude Code version change (feature-watch row tells the daily check to re-test).
- The overall token saving across the crew: the crew has been stopped since 2026-11-16, so no post-change week exists yet.

## 5. Governance files changed so far

CHANGE-CLASS: non_architecture

| document | verdict | line |
|---|---|---|
| batch SCOPE | ✅ | `Scope Files/B_TOKEN_ECONOMY_SCOPE.md` |
| batch PRE_AUDIT | ✅ | `Scope Files/B_TOKEN_ECONOMY_PRE_AUDIT.md` |
| COMPLETION_REPORT | BLOCKED — `GOVERNANCE_EXCEPTIONS.md` open row 2026-11-19T22:05:00Z | this PROGRESS report converts at close |
| `BATCH_CATALOG.md` | ✅ | entry added, IN OBSERVATION |
| `PHASE_HISTORY.md` | ✅ | entry added |
| `SPRINT_TO_LIVE_PLAN.md` row | ✅ | stage 0 row 1 → IN OBSERVATION + this report |
| `PHASE_19_PLAN.md` | N/A — no row there | not a `P19-*` batch |
| `MEMORY_PM.md` (own memory) | ✅ | position line updated each leg and at Step 10 |
| shared `MEMORY.md` | N/A — judged | it holds only session-start commands and consensus truths (CLAUDE.md §3.1); batch state lives in `MEMORY_PM.md` |
| Langston's `MEMORY.md` | ✅ | one pointer line at :113 via `langston-memory-write` (his loaded set is 5 B under its ceiling, so the line is a pointer; the carried P6 condition lives in §3 here) |
| Observation column | ✅ | board card moved to Observation 2026-11-19 ~22:00Z; window in §3 |
| the four session task lists | N/A — not mine (×4) | PM has no task list in that set |
| `SYSTEM_MANUAL.md` | N/A | no trading architecture, formula or threshold in the diff |
| `SYSTEM_IMPACT_MAP.md` | N/A | no app component in the diff (0 files under `server/ client/ shared/`) |
| `RUNNING_ISSUES.md` | ✅ | `#1261` three pre-existing test failures, both refs side by side |
| `CHANGES_AND_FIXES.md` | N/A | no bug or risk fixed in the app |
| `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item |
| `ADJUSTMENT_FRAMEWORK.md`, `AUTHORITY_BASELINE.md`, `STORAGE_POLICY.md` | N/A | no parameter, baseline or retention change |
| `MULTI_ASSET_VTS_EXPANSION_PLAN.md`, `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no asset-class work; xStock working list untouched by this diff |
| `BUILD_METHOD_PLAYBOOK.md` | N/A | method unchanged (gates and roles the same) |
| `LANGSTON_ARCHITECTURE.md` | N/A | reviewer build unchanged (direct invoke is the existing usage-window path) |
| `CLAUDE.md` / `_archive/CLAUDE_MD_RULE_HISTORY.md` | ✅ | P5 moves: 55 pointers / 55 verbatim blocks, ledger-proved; no rule text altered (Langston Step 4) |
| `CONDUCT.md` | N/A | not touched (still 146 B over its cap; not this batch) |
| `DELETED_COMPONENTS_LOG.md` | N/A | nothing deleted; P5 moved text |
| `MISTAKE_PATTERNS.md` | N/A | one `MISTAKE: wrong-object` trailer at `63cacfea0`; the weekly pass collects trailers |
| `GOVERNANCE_EXCEPTIONS.md` | ✅ | declared `open` row, confirmer langston |
| `ALERT_HANDLING_PROTOCOL.md`, `DELIVERY_BOARD_PROTOCOL.md` | N/A | process unchanged (alert-delta is shadow only) |
| `CLAUDE_CODE_FEATURE_WATCH.md` | ✅ | agent-override row |
| `DEPLOY_WINDOWS.jsonl` | N/A | Step 6 N/A, `dt-deploy` never ran, so the KD-56 guard does not apply |
