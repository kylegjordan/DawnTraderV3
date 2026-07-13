# B-DISCORD-INBOUND-LIVENESS — Completion Report

**Owner:** CC-A (Claude Old). **Reviewer:** Langston. **change-class:** non_architecture (comms-infra; SIM-scope, SYSTEM_MANUAL N/A). **Home:** RUNNING_ISSUES #462. **Date:** 2026-07-13.
**Directive:** Kyle 2026-07-13 — *"please fix the silent-feed watchdog issue."*
**Files (source in-repo `comms-infra/discord/`, deployed to Helsinki `/opt/discord-bridges/`):** NEW `gateway_watchdog.py` + `gateway_watchdog_test.py`; `discord-cc-bridge.py`, `discord-langston-bridge.py`, both `.service` units. Backup: `/root/discord-bridges-backup-20260713-092137`. Origin head `3bb3314d3` (+ governance).

## The problem
The Discord inbound-receive path could die silently while the process stayed green (the only heartbeat proved the worker thread, not the gateway). Confirmed twice — ~95 min (#462) and ~21 h (2026-07-12→13, both CCs blind, caught only by a human). `client.run(reconnect=True)` zombied without recovering.

## Objectives — checklist with evidence
| Obj | Result | Evidence |
|---|---|---|
| **OBJ-1** gateway receive-liveness signal | ✅ YES | `last_gateway_recv` advanced by `on_socket_raw_receive` (`enable_debug_events=True`) incl. the ~41 s heartbeat ACK → decoupled from channel traffic. Live log: `gateway ready; heartbeat=41.25s stale-threshold=165s`. Misleading worker-heartbeat replaced. |
| **OBJ-2** staleness → loud + auto-recover | ✅ YES | **Kill-test:** block 09:33:49 → `watchdog: gateway stale → alerted → exiting for systemd restart` at 09:36:29 (~165 s); loud DEAF alert posted via the gateway-INDEPENDENT REST path (+notify Kyle) WHILE inbound dead; `os._exit(1)` → systemd restart. Layered: `sd_notify(WATCHDOG=1)` while fresh + `WatchdogSec=300` backstop for a full-loop hang. `TimeoutStartSec=infinity` — unit sat `activating` during the ongoing block, did NOT trip StartLimit/`failed`-latch (Langston Step-4 catch, validated live). |
| **OBJ-3** startup backfill (no lost messages) | ✅ YES | `on_ready` replays channel history missed during downtime through each bridge's own handler, deduped by `message_id` scoped to that bridge's kinds (#494 cross-bridge false-skip guard). Kill-test: backfill re-fed on reconnect; **verified ZERO double-log** (Kyle rows deduped) and **ZERO spurious Langston re-enqueue**. |
| **OBJ-4** same hardening on the Langston bridge | ✅ YES | `discord-langston-bridge.py` (identical zombie failure, `:713`) gets the same `install_watchdog`; deployed active, `heartbeat=41.25s threshold=165s`, 0 re-enqueue. State under `/home/langston/.discord-bridge/` (runs as User=langston). |
| **OBJ-5** wake-watcher boundary documented (honest) | ✅ YES | This fix keeps the feed alive + makes a dead feed LOUD, so the wake watcher can't be silently starved again. It does NOT change the watcher's own drop modes: context-compaction kill (covered by the existing SessionStart re-arm hook) and full session close (platform limit). Silent death is now impossible from the FEED side, not the watcher side. |

## Verification (outcomes-based, LIVE)
- Unit: `gateway_watchdog_test.py` 29/29 (threshold derivation, staleness, cooldown, backfill dedup incl. #494 kind-scoping, epoch persist/fsync, inbox scan).
- On-box: `py_compile` OK; both units `WatchdogUSec=5min`, `NotifyAccess=main`, `is-active=active` (=`READY=1` received); LF verified byte-level after scp.
- **Kill-test (CC bridge, gateway `.234` blocked, REST `.232/.233` alive):** stall→alert(+phone)→`os._exit`→wait-during-block(no failed-latch)→unblock 09:37:24→reconnect 09:37:32 (~8 s, new PID)→backfill re-fed→recovery alert. Exactly ONE DEAF + ONE recovered (cooldown correct). iptables clean.

## Three runtime bugs caught at deploy (static review couldn't)
1. base `discord.Client` has no `add_listener` (ext.commands.Bot only) → attribute-assignment registration + wrap the bridge's on_ready.
2. heartbeat interval is `ws._keep_alive.interval` (sec), not `ws.heartbeat_interval` — was falling to the 120 s floor; now 165 s.
3. backfill honest "re-fed N recent" log + 8 MB scan margin; zero double-log confirmed.

## Langston review
- Step-1 scope APPROVED; Step-2 pre-audit CLEARED (fsync-ordering + StartLimit reframe folded); Step-4 diff review — one CHANGES-NEEDED (`TimeoutStartSec=infinity`, applied) else clean.
- **Step-8 second-pass: _(pending — requested with the full kill-test timeline; to be recorded on his PASS)_.**

## Governance files changed
SIM "Discord Comms Fabric" (watchdog entry — new cross-cutting liveness state + `.service` directives), RUNNING_ISSUES (#462 resolve), BATCH_CATALOG (this row), PHASE_HISTORY, CHANGES_AND_FIXES (FIX-2026-07-13), this report, MEMORY_CC_A + Langston MEMORY. SYSTEM_MANUAL N/A (comms infra). Scope + pre_audit in `Claude Comms and Packages/Scope Files/`.

## Note — the §10.5 ssh alert leg
The guaranteed loud path (Discord `--notify` → Kyle's phone) is fully wired + proven. The optional secondary §10.5 tracked-queue insert (`WATCHDOG_SSH_ALERT_CMD`) is OFF by default — enabling it needs a root@Helsinki→staging path; deferred as a non-blocking enhancement (the Discord path is independent and proven).
