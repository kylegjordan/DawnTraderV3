# B-LANGSTON-RELIEF — COMPLETION REPORT — OBJ-2 PASSED its pre-registered week; OBJ-3's ceiling carried to B-LANGSTON-CLAUDEMD-RESIDUAL (Kyle 2026-10-20)

> **Converted from `B_LANGSTON_RELIEF_PROGRESS_REPORT.md` on 2026-11-05** (`workflow-11-completion`: convert, never rewrite). Sections 1-4 below are the progress report as it stood, with the evidence it captured at the time. §2b and §3b are the close.
>
> **⛔ LEFT OPEN, stated at the top:**
> - **OBJ-3's ceiling** (the loaded set ≤ 143,856 B) is NOT met by this batch. Kyle chose option A on 2026-10-20 and carried it to `B-LANGSTON-CLAUDEMD-RESIDUAL` (§0a Infra Claude order 3, owner Infra Claude). Closing condition: `langston-size-watch --status` at or under the ceiling after that batch installs the trimmed rules file. Failure condition: still over after the install.
> - **Coltrane's clean stop** is not built. It is homed at `B-AGENT-INVOKE-FAILURE-NOTICE` (`#1198`, `#1206`), and the unsafe stop path was recorded there on 2026-11-05.

change-class: architecture · owner: Infra Claude (CC-INFRA) · directed by Kyle 2026-10-16 · scope `Scope Files/B_LANGSTON_RELIEF_SCOPE.md` · Step 2 `Scope Files/B_LANGSTON_RELIEF_PRE_AUDIT.md`


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

## 2b. Objectives — at close (2026-11-05)

| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | people before alerts; a restart loses nobody's message | **YES** | §2 above; unchanged since |
| OBJ-2 | the alert lane | **YES — passed its pre-registered week** | §3b |
| OBJ-3 | memory trimmed continuously; loaded set under the ceiling | **PARTIAL** — the trim is live; the ceiling was carried (Kyle, option A) | §2, §3 |
| OBJ-4 | Coltrane parity | **YES where it applies** — the clean stop is homed at `#1198` / `#1206` | §2 |

## 3. PRE-REGISTERED close criteria — written before the data

**OBJ-2, window: 7 days, 2026-10-16T13:47Z → 2026-10-23T13:47Z.**
- **PASS:** (a) every alert post in the window has either a lane routing reply posted to Discord or a lane escalation; AND (b) Langston is invoked for an alert only through an escalation — no alert-class task reaches him any other way.
- **FAIL:** any alert post in the window with neither; or any Langston invocation for an alert that was not an escalation.
- ⚠️ The instrument for (b) — telling an escalated alert task from any other in the bridge journal — must be named and proved on a known case before 2026-10-23. Until then (b) is unmeasured, not passing.

**OBJ-3:** PASS = `langston-size-watch --status` shows the loaded set ≤ `ceiling_bytes` (143,856). FAIL = over. Today: FAIL by 8,251 B. **DECIDED — Kyle, 2026-10-20: option A.** The last 8,251 B is carried into `B-LANGSTON-CLAUDEMD-RESIDUAL`, which now owns meeting the ceiling (the overage is mostly his rules file, which the trim cannot reach). This batch closes on OBJ-2's window, recording OBJ-3 as met except the carried ceiling.

## 3b. (a) What data came in, against the criterion · (b) what was decided

**The criterion, as pre-registered in §3 (quoted):** *"PASS: (a) every alert post in the window has either a lane routing reply posted to Discord or a lane escalation; AND (b) Langston is invoked for an alert only through an escalation — no alert-class task reaches him any other way."*

**The data — window 2026-10-16T13:47Z → 2026-10-23T13:47Z, measured 2026-11-05 on Helsinki, read-only** (`/var/log/cc-discord-inbox.jsonl` and the bridge's journal; script `relief_obj2.py`, its method stated here):

| measure | population | result |
|---|---|---|
| alert posts that reached the bridge | `langston_alert_inbound` records in the window | **283** (an alert id was read from 273 of them) |
| lane routing posts | `langston_outbound` with `lane == "alert"` | 121 |
| **(a)** routed by a lane post that names the alert's id | of the 283 | **181** |
| **(a)** escalated to Langston | journal `escalated msg <id> to Langston` | **102** |
| **(a)** NEITHER | of the 283 | **0** |
| **(b)** Langston alert-task starts | journal `handling msg … kind=alert:` | **101** |
| **(b)** of those, begun `[ESCALATED to you by the alert lane …]` | — | **101**. Instrument control: the class is non-empty, so the matcher can return a positive |
| **(b)** started any other way | — | **0** |

**(a) PASS: 181 + 102 = 283, with 0 unaccounted for. (b) PASS: 0 of 101.**
- The §3 warning said (b)'s instrument *"must be named and proved on a known case before 2026-10-23"*. It was named and proved only on 2026-11-05, after the window. The pre-registered criterion is unchanged and the data is the window's, so the read is valid; it is late.
- **Residual, stated rather than smoothed:** 102 escalations against 101 task starts. One escalated alert has no matching start inside the window — consistent with it being started after 13:47Z on 10-23, or folded into a restart's recovery pass. It was not traced. It does not touch (b), which counts starts that did NOT come through an escalation (0).

**(b) The decision:** OBJ-2 passes on the criterion written before the data, so the batch closes on it. That is what §3 set out: *"This batch closes on OBJ-2's window, recording OBJ-3 as met except the carried ceiling"* (Kyle 2026-10-20, option A). The decision is Infra Claude's, under that rule; Langston confirms at Step 11. **Kyle does not acknowledge a close** (Kyle, 2026-09-02).

**Since the window (record, not part of the criterion):** from 2026-10-21 12:00Z to 2026-11-04 the lane handled 602 alert posts. Langston ran 169 times, every one an escalation: 99 because his own past routing disagreed, 49 because no alert id could be read, and about 20 by the lane's rules. Two follow-ups are already homed:
- the owner read from the plan instead of his history: `#1201`, `B-ALERT-LANE-LEDGER-OWNER`;
- routing markers written with an owner or id the wake filter rejects: `#1201`, 2026-11-04.

## 4. What is unproven, stated as unproven

- ~~OBJ-2 (b) above: no proved per-class instrument yet.~~ Proved and read on 2026-11-05 (§3b), after the window.
- The size watch never alarms on a BREACH, only when it stops running (`#1215`, Langston's finding) — so "it went quiet" is not evidence the ceiling is met; read `--status`.
- Coltrane's clean stop: not built (`#1198`).

## 5. Governance files changed (the Step-10 ledger; closing lines added 2026-11-05)

**At close:**
- `BATCH_CATALOG.md` and `PHASE_HISTORY.md`: their entries were marked closed, with this report's name.
- `SPRINT_TO_LIVE_PLAN.md` §0a order 2: set to Step 11.
- `1-system-manual/CC_INFRA_SESSION_TASK_LIST.md`: updated.
- The two references to the old report name, in the catalog and the history, were updated in the same commit as the rename.
- **Langston's `MEMORY.md` row is his to write at Step 11**, through `langston-memory-write`; it is asked for in the confirm dispatch.
- **CI** for the branch head carrying every commit of this batch: run 41862993865 at `3add04f48`, all four jobs green, checked one by one on 2026-11-04.

**Earlier in the batch:**

`SYSTEM_IMPACT_MAP.md` · `COMMS_BRIDGE_RUNBOOK.md` · `LANGSTON_ARCHITECTURE.md` · `PHASE_19_PLAN.md` (row 2.8b read-site) · `SPRINT_TO_LIVE_PLAN.md` · `RUNNING_ISSUES.md` (`#1197`, `#1198`, `#1205`→`#979`, `#1206`, `#1207`, `#1215`, `#1216`, `#1219`) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · the batch `SCOPE` and `PRE_AUDIT` · `B_LANGSTON_CONTEXT_INC2_CHUNK2_PART2_CHANGE_LIST.md` (a pointer) · `.claude/memory/MEMORY_CC_INFRA.md`. **Still owed at close:** the session task list, Langston's `MEMORY.md` (net-zero, through `langston-memory-write`), `BATCH_CATALOG`/`PHASE_HISTORY` close lines, the plan row, the full tier ledger.
