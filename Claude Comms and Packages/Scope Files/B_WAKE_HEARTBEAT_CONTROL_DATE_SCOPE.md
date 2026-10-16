# B-WAKE-HEARTBEAT-CONTROL-DATE — SCOPE r1 (2026-10-16)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1q**, after row 1n · **Issue:** `#1162` · **Reviewer:** Langston

## 0. WHY
The hourly heartbeat task (`comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md`; live copy `~/.claude/scheduled-tasks/wake-watcher-heartbeat/SKILL.md`, the same content apart from line endings, measured 2026-10-16) is meant to page Kyle only when a wake watcher has really failed. **On 2026-10-16 it paged his phone five times (08:16, 10:16, 11:15, 12:16 and 15:15 UTC) with "control NOT answered: CC-A, CC-B, CC-C, CC-INFRA" while the CC-A and CC-C watchers were alive and delivering.** That teaches Kyle to ignore the one line that should mean something.

## 1. MEASURED (inbox `/var/log/cc-discord-inbox.jsonl`, sender `Heartbeat`, 2026-10-06T20Z → 2026-10-16T15Z; controls from `/var/log/cc-wake.log`)
- **(a) `#1162` as filed — a false NOT answered before that day's control is issued — did NOT recur in this window.** Every pre-09:00-local run reads "not run" (for example 10-12 22:14Z → 10-13 06:14Z). It was a wording-dependent reading of "today", and the prompt still says "today's date". It is unfixed, only not currently triggered.
- **(b) A NEW, LARGER FORM — a control issued while a watcher is down can never be answered that day.** The 10-16 controls were written at 07:13Z, the first run at or after 09:00 local (laptop clock UTC+2). CC-A's watcher was re-armed after the crew switch from a position saved on 10-13. The watcher printed *"the watcher resumed after more than 12 h away … anything posted since 2026-10-13T13:23:28Z was NOT delivered"* (task output `b5l0ec9p0`). It therefore started at the end of the log by design (`STALE_S = 12 * 3600`, `cc-wake-filter.py:323`, `:857`), so it never saw the 07:13Z line. Every later run reported NOT answered and added `--notify`. **CC-B and CC-C show the same signature** (`.control` files dated 2026-10-13 09:14 local; leases renewed on 10-16), but the mechanism is confirmed for CC-A only. CC-INFRA's watcher has been DEAD since 10-08 (lease 10-08 09:19), so its NOT answered duplicates its DEAD.
- `--notify` on those runs is double-caused: DEAD CC-B/CC-INFRA also add it. Fixing the control alone does not silence Kyle's phone while a watcher is dead; it removes the false half.

## 2. PROVENANCE (tier 1: step 2c of the heartbeat, whose behaviour this batch changes)
- **Introduced by** `3a31cf3a6` (2026-09-30, `B-TOKEN-BURN-CUT` Step 3). Verbatim from its message: *"daily control answered by a file; heartbeat DEAD/control-unanswered delivered"* and *"Heartbeat task (repo copy): liveness from each watcher's .alive file, no wake; daily control gated on every session having switched."*
- **What it is for**, from that batch's change list (`B_TOKEN_BURN_CUT_CHANGE_LIST.md:46`, Langston's condition C3): *"`.alive` proves the pipeline STARTED, not that the filter DELIVERS"*. **The control is the end-to-end delivery proof** that `.alive` cannot give. The pre-audit flagged the line format and the 12 h threshold as *"design choices, flagged for attack"* (`B_TOKEN_BURN_CUT_PRE_AUDIT.md:83`).
- **Corpora searched:**
  - by file and symbol: `RUNNING_ISSUES.md` (`#1162`, `#1127`), `BATCH_CATALOG.md`, the `B_TOKEN_BURN_CUT_*` scope, pre-audit and change list;
  - `git log -S "WATCHER-CONTROL" --reverse`;
  - `SYSTEM_IMPACT_MAP.md` wake-watcher block (`:3764`);
  - `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:27`.

  The control is not mentioned in the System Manual (it is crew tooling, not trading logic).
- **Disposition: (2) relevant, needs updating to today's intent.** The purpose stands; its date test and its answerability window are wrong.
- **Tier 2 (read, not changed):** `cc-wake-filter.py` control handler (`:996-1001`; writes `<state>.control`, no wake) and the stale-state start (`:857`). **Neither changes under this scope's preferred design.**

## 3. OBJECTIVES
| obj | objective | verified by |
|---|---|---|
| OBJ-1 | "Answered" is judged against the **newest issued** `WATCHER-CONTROL` line for that alias (read from `cc-wake.log`), never against the laptop's local date. A run before that day's issue reads "not run" by rule, not by wording. | the prompt text, plus a dry run at a pre-09:00-local time against the live files reading "not run" or answered, never NOT answered |
| OBJ-2 | **A watcher armed after its control was issued gets that control re-issued once** (that alias only, no `--notify`), and is reported "re-issued" instead of NOT answered. The control keeps proving delivery: the re-issued line must reach the filter and be answered by file. | a live run on a day with a late arm: "re-issued" for that alias, then "answered" on the next run, and `.control` re-dated |
| OBJ-3 | `--notify` for the control fires only for a **genuine** miss: a live watcher armed before the newest issue (or after a re-issue) that still has not answered on the following run. Never for a watcher already reported DEAD (it already paged as DEAD). | the step-4 rule text, plus a dry run with one DEAD alias reading DEAD only |

**"Armed after the issue"** is read from the alias's lease file mtime (`<ALIAS>.lease`, written at every arm under `#1140`) against the issue line's time. **JUDGEMENT CALL A, for attack:** the lease mtime is the cheapest arm-time signal on the laptop. Is it the right one, or can a lease be renewed without a re-arm?

## 4. DESIGN CHOICE, FOR ATTACK
- **Preferred: change only the heartbeat prompt (step 2c + step 4).** The filter is untouched, and the late line is delivered through the normal path, so the control still proves delivery.
- **Alternative (rejected unless Langston prefers it):** the filter replays its own newest control line at arm time. That makes the filter answer a line it never received through the pipeline, which is exactly the proof `.alive` already gives. **It would turn the delivery proof into a start proof** (C3).
- **JUDGEMENT CALL B:** a re-issue appends one line to the shared `cc-wake.log`. A watcher of a different alias ignores it (`:998`), so the cost is one line per late arm per day.

## 5. OUT OF SCOPE
- Waking dead watchers, and the switch-driven push wake Kyle asked for today: row 1z `B-CODEX-FAILOVER-AUTOMATION` (`#731`).
- Re-arming CC-B and CC-INFRA, whose watchers are DEAD: their sessions' own job.
- The 12 h stale threshold itself: by design, from the original pre-audit.

## 6. DOCUMENT SET (class `non_architecture`)
- this SCOPE and a PRE_AUDIT;
- the change list;
- the completion report;
- `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (wake-watcher block), `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK` layer 3, `RUNNING_ISSUES` `#1162`, the sprint plan row 1q, and CC-A's task list;
- the board card.

`SYSTEM_MANUAL`: N/A (no trading logic).
