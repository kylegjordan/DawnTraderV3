# B-LANGSTON-RELIEF — PROGRESS REPORT — OPEN — waiting on a week of alert-lane data (OBJ-2) and on the ceiling (OBJ-3)

change-class: architecture · owner: Infra Claude (CC-INFRA) · directed by Kyle 2026-10-16 · scope `Scope Files/B_LANGSTON_RELIEF_SCOPE.md` · Step 2 `Scope Files/B_LANGSTON_RELIEF_PRE_AUDIT.md`

> ⛔ **NOT A COMPLETION REPORT.** This batch is not closed. It becomes the completion report (renamed) when the data below is in AND a decision has been taken on it (`workflow-10-governance`).

## 1. What the batch is for

Kyle, 2026-10-16: the lasting fix for Langston's delays. People's messages ahead of alerts; system alerts handled by a cheaper helper (the alert lane) instead of Langston; his memory trimmed automatically, by supersession, never by age; the same fixes for Coltrane where they apply.

## 2. Objectives — status at 2026-10-19 ~20:00Z

| # | objective (scope "done when") | status | evidence |
|---|---|---|---|
| OBJ-1 | people before alerts; a restart loses nobody's message | ✅ **MET** | priority queue live 2026-10-16 (`7bd58f282`); recovery floor; a reply counts only if it reached Discord (`b81720646`, `52562b2d7`); clean stop (`bfcb7b026` → `cb95097bf`); restarts only via `langston-bridge-restart` (r1-r4, `7056d8445`), 12:10Z 2026-10-17 restart Result=success. ⚠️ One bare restart before the helper existed dropped 9 messages (04:35Z 2026-10-17, repaired by hand; MISTAKE `skipped-step`). |
| OBJ-2 | the alert lane | ⏳ **LIVE, in its observation window** | live 2026-10-16 12:33Z (`7c33c236a`), precedent rules, the domain-guess rider (`597c9d7ce`). Measured 2026-10-16T13:47Z → 2026-10-19 ~20:00Z: 115 alert posts reached the bridge, 157 lane routing replies, all 157 posted (Discord message id present), 17 escalations to Langston. Its "done when" needs a WEEK. |
| OBJ-3 | memory trimmed continuously; loaded set under the ceiling | ⏳ **PARTLY MET** | ledger split, nightly trim on declared STATE lines, every version archived (2026-10-16); the trim leaves no index line (`481a836fe`…`90354999c`); a growth gate on the live sum; the harness index trimmed (`975405320`). Loaded set **918,745 → 152,107 B vs ceiling 143,856 — still over by 8,251 B** (`langston-size-watch --status`, 2026-10-19). The remaining overage is mostly his `CLAUDE.md` (67,896 B), which the trim cannot reach. |
| OBJ-4 | Coltrane parity | ✅ **MET where it applies** | his bot's restart recovery (`0004feaa6`); his library and archive (OBJ-4b); his instructions under their own ceiling. Does not apply: the alert lane (he receives no alerts). Not yet ported: the clean stop (`sudo` `use_pty` needs another design — `#1198`). |

Also shipped inside the batch: the privacy check's repo-text exclusion and bounds (`b862a6526`, `030ed50e5`); the trim no-op rows (r1-r6, reader `21c5d70a`); the root-run tools' state moved to a root-only directory (`739bb2439`, Kyle-approved 2026-10-19); the load canary re-anchored after this batch's ledger split disarmed it (`61b05fc80`); Coltrane's repo read restored (`#1219`).

## 3. PRE-REGISTERED close criteria — written before the data

**OBJ-2, window: 7 days, 2026-10-16T13:47Z → 2026-10-23T13:47Z.**
- **PASS:** (a) every alert post in the window has either a lane routing reply posted to Discord or a lane escalation; AND (b) Langston is invoked for an alert only through an escalation — no alert-class task reaches him any other way.
- **FAIL:** any alert post in the window with neither; or any Langston invocation for an alert that was not an escalation.
- ⚠️ The instrument for (b) — telling an escalated alert task from any other in the bridge journal — must be named and proved on a known case before 2026-10-23. Until then (b) is unmeasured, not passing.

**OBJ-3:** PASS = `langston-size-watch --status` shows the loaded set ≤ `ceiling_bytes` (143,856). FAIL = over. Today: FAIL by 8,251 B. **Kyle decides where the last 8 KB lives** (asked 2026-10-19): in this batch, or carried into the planned rules-file residual item (`B-LANGSTON-CLAUDEMD-RESIDUAL`).

## 4. What is unproven, stated as unproven

- OBJ-2 (b) above: no proved per-class instrument yet.
- The size watch never alarms on a BREACH, only when it stops running (`#1215`, Langston's finding) — so "it went quiet" is not evidence the ceiling is met; read `--status`.
- Coltrane's clean stop: not built (`#1198`).

## 5. Governance files changed so far

`SYSTEM_IMPACT_MAP.md` · `COMMS_BRIDGE_RUNBOOK.md` · `LANGSTON_ARCHITECTURE.md` · `PHASE_19_PLAN.md` (row 2.8b read-site) · `SPRINT_TO_LIVE_PLAN.md` · `RUNNING_ISSUES.md` (`#1197`, `#1198`, `#1205`→`#979`, `#1206`, `#1207`, `#1215`, `#1216`, `#1219`) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · the batch `SCOPE` and `PRE_AUDIT` · `B_LANGSTON_CONTEXT_INC2_CHUNK2_PART2_CHANGE_LIST.md` (a pointer) · `.claude/memory/MEMORY_CC_INFRA.md`. **Still owed at close:** the session task list, Langston's `MEMORY.md` (net-zero, through `langston-memory-write`), `BATCH_CATALOG`/`PHASE_HISTORY` close lines, the plan row, the full tier ledger.
