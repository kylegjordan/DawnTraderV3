# B-AGENT-INVOKE-FAILURE-NOTICE — SCOPE r1

change-class: non_architecture

**Issues:** `#1198` (and its 2026-10-17 / 2026-11-06 riders), `#1206` (and its 2026-10-17 / 2026-11-05 legs). **Owner:** Infra Claude (CC-INFRA). **Placement:** `SPRINT_TO_LIVE_PLAN.md` §0 Infra order 12, AGREED by Kyle 2026-11-06 (KD-50): before live, next after Infra's in-flight work. Langston named and placed it (2026-10-16). Infra's in-flight batches are all on time windows tonight (B-DISK-HEADROOM proof night, B-TOKEN-WATCH-FOLLOWUP-MEMORY capture, B-LANGSTON-TWO-WORKERS qualifying days), so this scope does not compete with them for work; it does compete for Langston's review time, and is dispatched one gate at a time.

> **Class:** `non_architecture` — the two reviewer bridges on Helsinki (`comms-infra/discord/`, `comms-infra/codex/`) and the laptop census tool. No trading architecture, strategy, regime, filter, signal pipeline or math. **The System Impact Map applies** (its "Discord Comms Fabric" section and Coltrane's rows change); the System Manual does not.

## 0. What happens today — measured 2026-11-07 ~18:40Z on Helsinki (read-only)

**The live code is the repo's.** `sha256` of the four files at `origin/migration/aws-supabase` (`10b8a4cd0`) equals the installed copies: `discord-langston-bridge.py` `ae4b3d18…`, `langston_queue.py` `903e2dfb…`, `gateway_watchdog.py` `e8e2a6bd…`, `coltrane-bot.py` (`/usr/local/bin/`) `ac648613…`.

**Langston (`discord-langston-bridge.py`).**
- A bridge error on a channel post writes `mirror_event("langston_silent", …, reason="bridge_error_suppressed")` and returns, posting nothing (`:645-651`). **Population, `kind == "langston_silent"` rows in `/var/log/cc-discord-inbox.jsonl`:** 64 carry `bridge_error_suppressed`, 2026-06-22T09:53:33Z → 2026-11-07T12:23:08Z, over **59 distinct messages, 5 of them twice**. Control: the same read returns the file's other silent reasons (circuit_breaker 3, voice-not-addressed 4, four `[SILENT] …` rows). The issue's 61 (as of 11-06) + 3 since.
- **Of those 59 messages, 14 have more than one `langston_inbound` row** (handled more than once) and **20 have none** (not explained here; the pre-audit reads it — a `reply_to` that is a chunk group's first id is one candidate, not a finding). Control: 630 of 4,654 inbound message ids overall have more than one row.
- **The bridge's task log since the 11-06 install** (`/var/log/langston-tasks.jsonl`, 203 rows): text reply 172, escalated reply 26, **text timeout 2**, self_advance timeout 1, self_advance reply 1. Both text timeouts today are mine (the 09:04Z and 12:08Z bundled dispatches).
- **Restart recovery re-feeds a started message with no recorded reply** (`:1185-1214`: `started & replied`). A bridge-error message is exactly that, so a failed request is re-run at the next restart within the floor window — `#1198`'s 2026-10-17 measurement (ANALYST's superseded review re-fed, up to 15 min each time).
- **Nothing is written at enqueue.** `task_q.put(...)` (`:1414`, and the alert/voice puts above it) is followed only by a debug-log line; every inbox write is elsewhere. A request lost before a worker takes it leaves no inbox trace.

**Coltrane (`comms-infra/codex/coltrane-bot.py`).**
- **Run log** (`/var/log/coltrane-invokes.jsonl`, 384 lines, 0 unparsed, 2026-09-08 → 2026-11-07): **350 invoke rows, rc 0 = 349, rc 1 = 1** (2026-10-16T12:53:45Z, 115.9 s, `posted: "invoke failed rc=1"`, **no error text in any field**). No message id was invoked twice.
- **A failure posts nothing** (`:546-547`: `posted = "invoke failed rc=%d"` is a log value only).
- **A timeout writes NO row at all, by code:** `invoke()` runs `subprocess.run(..., timeout=900)` (`:395-400`); `TimeoutExpired` propagates out of `asyncio.to_thread` in `_handle` (`:525`), nothing catches it, and the `log(...)` at `:553` is never reached. `#1198`'s 11:21Z no-row request (2026-10-16) is consistent with this, **not shown to be it** — the bot's journal holds almost nothing (3 lines in the 11:15-11:45Z window), so it cannot confirm or exclude a timeout, and its zero tracebacks since 09-12 is NOT evidence of zero timeouts.
- **Recovery** (`:439-474`) re-feeds any post in the 24 h window whose row is not `answered: true`, at EVERY ready, with no attempt cap (`#1206`); the unit is `Restart=always`, `RestartSec=15`.
- **Stop and timeout are unsafe mid-invoke** (`#1206` legs): no `signal` handler, no `start_new_session`, no group kill; Helsinki sudoers has `Defaults use_pty`, so `sudo` runs codex in its own session — Langston's group-kill fix (`run_agent`/`stop_cleanly`, `bfcb7b026`) does not port as-is.

## 1. Provenance (CLAUDE.md step-1 1.b) — corpora searched: `git log -S` across `comms-infra` (not path-limited), `RUNNING_ISSUES.md` (#1198, #1206, #1207), the SIM "Discord Comms Fabric" section, `BATCH_CATALOG` by file name. `bridge/canonical/` has no coverage of either bridge (both are 2026-06 or later).

**TIER 1 (behaviour this batch changes):**
| component | introduced | intent, quoted | disposition |
|---|---|---|---|
| Langston's bridge-error branch, `process_task` `:645-651` | `192059eb1` 2026-06-20, *"B-DISCORD: Langston responds when called, ALWAYS (Kyle 2026-06-19)"* | code comment, verbatim: *"infra error, not a real reply — mirror only, don't spam the channel"* | **(2) relevant, needs updating to today's intent.** The intent kept is NO ERROR DUMP in the channel; a one-line notice to the requester respects it. The silence it produced is what `#1198` measured. |
| Langston's restart recovery, `on_ready` `:1171-1236` | `e47e52eff` 2026-10-16, *"B-LANGSTON-RELIEF Step-3: people before alerts, and a restart that loses nobody's message"*; "done = started and answered" `7bd58f282` and the 10-17 delivered-only change | *"a restart that loses nobody's message"* | **(2):** a request that FAILED and was told so is not lost — the requester owns the re-send — so recovery must not re-run it (`#1198` 10-17 rider; `#1206` condition 2). |
| Langston's enqueue, `on_message` `:1405-1414` (the alert, voice and text `task_q.put`s) | `04d7cb3e9` 2026-06-19, *"B-DISCORD (build phase)"* | single in-memory FIFO; durability added later by recovery | **(2):** add the enqueue row (folded 2026-11-06, Langston-agreed at `076705a16`). |
| Coltrane `invoke()` and the run-log row, `:372-406`, `:536-558` | `57544f6b3` 2026-09-08, *"Coltrane's replies now reach the wake filter…"* | the row is *"one row per wake that led to an invoke; token count is the spend surface"* (its `measures` field) | **(2):** the row must exist for EVERY outcome, timeouts included, and carry the failure text. |
| Coltrane recovery, `recover()` `:439-474` | `e399a449f` / `4f8f69072` 2026-10-17, *"Coltrane's bot recovers posts missed while it was down"*, *"keyed on answered"* | in-code limit, verbatim: *"an invoke that FAILED (nothing posted) is recorded `answered: false` and IS retried at the next ready"* | **(2):** retried with no cap and no notice (`#1206`) — gets a cap, and a notified failure stops counting as unanswered. |
| `dt_dispatch_census.py` (laptop) | `da60cedc0` 2026-11-06, *"B-TRANSCRIPT-ARCHIVE P8 piece 1: the open-dispatch census, from the inbox log alone"* | reads dispatch state from the inbox | **(2):** reads the new enqueue row as a third state (its stated blind spot). |

**TIER 2 (read or called, unchanged):** `langston_queue.lead_with_addressee` — the one rule for leading a reply with the requester's name (the notices use it, so they wake the requester). `gateway_watchdog.inbox_message_ids` / `dedup_kinds={"langston_inbound"}` — handled-rows only, on purpose (`gateway_watchdog.py:132-141`); **the enqueue row must stay out of it** (Langston, condition 1, blocker-grade). `discord_common.rest_send` — the post. `mirror_to_inbox` (Coltrane) — puts Coltrane's posts in the inbox so the wake filter sees them.

## 2. Objectives and how each is verified

**OBJ-1 — Coltrane logs EVERY invoke outcome, with the failure text.** A timeout, an exception, a non-zero exit and a send failure each produce one run-log row carrying `message_id`, an `outcome` (`reply` / `silent` / `failed` / `timeout` / `send_failed`) and, for a failure, a bounded tail of the error text.
*Verified:* a real-process test drives `_handle` (not `invoke` alone) through each outcome — including a stub codex that outlives the timeout — and asserts one row per outcome with the right fields; a mutation that removes the timeout catch fails it. Live: the first failure after install has a row with text.

**OBJ-2 — a failed request gets a one-line notice, on both agents.** Coltrane, on any failed outcome, and Langston, on the bridge-error branch, post ONE line to the requester, led by their name (so their session wakes): what failed in a few words and "please re-send" — never the error dump (the 06-20 intent). DMs get the same line in the DM. The notice is recorded (a row the census and recovery can read).
*Verified:* tests drive both branches and assert exactly one post, name-led by the rule `lead_with_addressee` uses, under 300 characters, no stack trace; the wake filter, fed the notice row, wakes the requester (run against the real `cc-wake-filter.py`). Live: one deliberate failure per agent on a throwaway request, read in the channel and the inbox.

**OBJ-3 — a failure that was notified is not re-run by recovery; a failure that was never attempted still is.** Langston: recovery skips a message whose last attempt ended in a notified failure. Coltrane: the same, and a hard cap on attempts per post inside the window, so a crash loop cannot multiply full-length invokes (`#1206`).
*Verified:* recovery's selection is tested on fixtures for each case (notified failure → skipped; enqueued-never-started → re-fed; started-no-reply-no-notice, e.g. a restart mid-invoke → re-fed; cap reached → skipped and logged). Live: the restart helper's own recovery summary after one controlled restart.

**OBJ-4 — Langston's bridge writes an enqueue row.** `langston_enqueued` (`message_id`, `sender_username`, kind) when it accepts a request; **NOT** in any dedup kind set (`:1186`, `:1434` stay `{"langston_inbound"}`). The census reads it as a third state (enqueued, not started).
*Verified:* a test fails if `langston_enqueued` enters either dedup set; the census's test gains the third state with a fixture; live, every request after install has an enqueue row before its inbound row.

**OBJ-5 — Coltrane stops and times out cleanly.** A stop (SIGTERM) or a timeout mid-invoke ends codex and its children, leaves no orphan, and does not hang on a pipe a grandchild holds — through `sudo` with `use_pty`. Design chosen at Step 2 (relay the signal through sudo, or a non-pty path for this one command), not here.
*Verified:* the `test_bridge_clean_stop.py` shape, run on Helsinki against the real sudo: a stub codex that ignores SIGTERM and forks a child is stopped mid-run; after, `pgrep -u coltrane` is empty, the unit stops inside `TimeoutStopSec`, and no failure page fires. Its mutation (the old `subprocess.run`) hangs or orphans.

**OBJ-6 — the two unrotated logs.** `/var/log/discord-langston-bridge.log` and `/var/log/cc-discord-inbox.jsonl` have no `logrotate.d` entry. The inbox is read by TAIL BYTES for dedup and recovery (`inbox_message_ids` 8 MB default; `:1192` reads 1 GiB), so rotating it can silently shrink what those readers see. **Step 2 decides, with that constraint named:** rotate the bridge log; for the inbox, either a rotation whose size keeps every reader's window inside the live file, or leave it out with its own placed home.
*Verified:* whichever is chosen, a forced rotation on a copy shows the readers still see their window.

## 3. Out of scope
- **Re-posting a reply that failed to post** (`#1207`, `B-LANGSTON-REPOST-FAILED`, placed after `B-AGENT-PRIVATE-TMP`).
- **Private `/tmp` for both agents** (`#979`/`#1205`, `B-AGENT-PRIVATE-TMP`, placed after this batch).
- Langston's own 900 s ceiling, and how dispatches are sized — unchanged; this batch only makes hitting it visible.

## 4. Risks named now
1. **A notice that wakes the wrong session, or nobody.** It must lead with the requester through the same rule as a reply; a notice on an alert-lane or self-advance item has no person to name and must not invent one (Step 2 decides those cases).
2. **A notice loop.** A notice must not itself be read as a request — by Langston's gate, Coltrane's gate, or the other agent. Tested against both gates.
3. **Recovery that stops re-running a request that should have been re-run.** The notified/not-notified split is the guard; the fixtures in OBJ-3 cover the restart-mid-invoke case explicitly.
4. **Touching a live reviewer.** Both bridges are restarted only through their safe paths (`langston-bridge-restart`; Coltrane only when `pgrep -u coltrane -f "codex exec"` is empty, until OBJ-5 lands).
