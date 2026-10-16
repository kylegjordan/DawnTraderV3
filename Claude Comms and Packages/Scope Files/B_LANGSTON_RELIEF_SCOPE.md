# B-LANGSTON-RELIEF — scope

change-class: architecture

**Owner:** Infra Claude (CC-INFRA) · **Directed by:** Kyle, 2026-10-16 (Desktop) · **Plan home:** `SPRINT_TO_LIVE_PLAN.md` §0 Infra Claude row (the 2026-10-08 alert lane + continuous trim), moved up ahead of `B-CREW-ACCESS-HARDEN` P3a by Kyle the same day.
**Reviewer:** Coltrane for the increments that must land today (Kyle has routed reviews to him while Langston is the bottleneck); Langston second-pass once his queue is clear.

## Why (measured 2026-10-16, Helsinki)

1. **Langston is ~13 hours behind.** His Discord bridge holds one in-memory FIFO `queue.Queue` (`comms-infra/discord/discord-langston-bridge.py:876` at `d0f743dde`) shared by system alerts (`:838`) and people's messages (`:847`). Since the S2 restart at 07:10:43Z: **120** `ALERT enqueued` against **9** people's `text enqueued`, **13** invocations finished; queue depth 116-119 all morning. Kyle's 08:02Z and 08:15Z posts sit behind ~100 alerts. ANALYST resolved 107 of those alerts at 08:33Z, but resolving an alert does not remove its copy from the in-memory queue.
2. **A restart cannot clear the backlog without losing people's messages.** The queue is in memory. `gateway_watchdog._backfill_missed` exists to re-feed missed requests after a restart, but the bridge's replay guard (B-COMMS-CHUNK-FIX, `:713-722`) drops every message older than the process, so after a restart nothing queued comes back.
3. **His auto-loaded memory is 804,146 bytes** (`/home/langston/MEMORY.md`, imported by `@MEMORY.md` at line 3 of his `CLAUDE.md`), against a loaded-set ceiling of 143,856 (`langston-size-watch --status`: measured total 897,520, BREACH). It was 98,335 bytes on 2026-10-02. **661,729 bytes are the `### Retractions` subsection**, which his rule says is never pruned; 84 entries there are per-alert rows (179,728 bytes). Mean invoke time over the same period: 269-289 s (Oct 1-3) → 557 s (Oct 12) → 586 s (Oct 16, 13 invokes). Correlated with the growth, not proven to be its only cause.
4. **The alert lane Kyle agreed on 2026-10-08 was never built** (owner Infra Claude; paused for the token reset, then the S1 handover). 254 of 407 Langston invocations in the 48 h to 2026-10-08 were alerts.

## Objectives

| # | objective | done when |
|---|---|---|
| OBJ-1 | **People before alerts, and a restart that loses nobody's message.** The bridge serves Kyle's and the sessions' messages before self-advance re-invokes, before system alerts (FIFO within each). A one-shot, operator-written recovery floor makes a restarted bridge re-read the channel and re-feed people's messages Langston had not started — never system alerts. | Restarted live with the floor; the 9 waiting people's messages re-enqueued; Langston answers Kyle's 08:02Z/08:15Z posts next; journal shows the per-class depth. |
| OBJ-2 | **The alert lane.** System alerts stop invoking Langston. A separate triage agent on a cheaper model, with its own identity and its own worker, reads each alert on staging, re-affirms or chooses the owner, emits the `[[ALERT id=.. owner=..]]` marker the wake filter already routes on, notifies Kyle for Kyle-owned rows, and escalates to Langston only on rules Langston writes (critical severity, unclear owner, anything needing judgement or review). Langston's model never changes. | Alerts route through the lane; the wake filter trusts its markers as it trusts his; escalations reach Langston's queue as people-class tasks; a week's alert volume no longer appears in his invoke count. |
| OBJ-3 | **His memory trimmed, continuously.** The planned `PHASE_19_PLAN` 2.8c split lands: the Retractions block moves to `/home/langston/LEDGER.md` (the recall tool's PRIORITY ledger source, already wired), the writer's ledger-append targets that file, and MEMORY.md keeps a short pointer. A standing rule evicts by SUPERSESSION, never by age (2.8a), and the size watch's ceiling is met. Nothing is deleted: every version stays in `.memory-archive/`. | Auto-loaded total under the ceiling; `langston-recall` prints retractions from LEDGER.md; a new retraction lands in LEDGER.md; size watch PASS. |
| OBJ-4 | **Coltrane parity** (Kyle: *"run the same fixes that apply to Coltrane"*). Each of OBJ-1..3 is measured on Coltrane's bot and applied where the same defect exists. | A written per-objective applies / does-not-apply with the measurement. |

## Increment 1 — OBJ-1 (urgent; ready now)

**Blast-radius census** (`discord-langston-bridge.py` at the commit carrying this scope):
- **Writers of the task queue:** `on_message` (alert `:878`, voice `:882`, text `:887`), the chunk-group timeout flush (`:818`), `_self_advance` (`:316`). All `put`; unchanged.
- **Readers:** `task_worker` only (`get`, `task_done`, `qsize`, and the new `depth_by_class` in its liveness line). No other module touches the queue; `discord-cc-bridge.py` has its own separate `voice_q`.
- **New state:** `/home/langston/.discord-bridge/recover-since` — written only by an operator before a restart, read once by `lq.read_recover_floor` in `main()`, deleted by the recovery pass. Refused if absent, unparseable, in the future or older than 24 h.
- **State read:** `langston_inbound` ids in `/var/log/cc-discord-inbox.jsonl` (the worker writes one when it STARTS a task), via the existing `gw.inbox_message_ids`.
- **Unchanged:** the replay guard still drops every pre-start message outside the recovery pass, so the B-COMMS-CHUNK-FIX protection against RESUME re-delivery holds; pre-start system alerts are refused even inside it.
- **Starvation:** with a finite alert backlog nothing is starved — alerts run whenever no person's message waits. OBJ-2 removes alerts from this queue altogether.

**Evidence:** `langston_queue_test.py` 102/102 on Helsinki (ordering, FIFO within class, depth counts, the floor's five refusal cases and exact parse). A behaviour probe drove the real `on_message`/`on_ready` from a copy of the bridge with fake messages and no gateway: 12/12 — pre-start post without recovery still skipped; Kyle's post naming Langston recovered; one not naming him not enqueued; a pre-start alert not recovered; a session post leading with Langston recovered; a new alert still enqueued; people before alerts; history read after the floor, oldest first, unlimited; a started id skipped; the floor file consumed; a reconnect does not recover twice.

**Install:** `comms-infra/discord/deploy.sh --sha <reviewed> --only bridges` after review, then a restart with the floor set to the 07:10:43Z process start, timed between invokes so no person's message is mid-flight.

## Increments 2-4

OBJ-2, OBJ-3 and OBJ-4 follow in this batch, each with its own Step-2 audit and review, in that order.
