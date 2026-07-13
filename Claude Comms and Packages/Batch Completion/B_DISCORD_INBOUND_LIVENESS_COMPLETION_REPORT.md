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
| **OBJ-2** staleness → loud + auto-recover | ✅ YES (zombie case) | **Kill-test (the #462 zombie: connected + receive-dead):** block 09:33:49 → `watchdog: gateway stale → alerted → exiting for systemd restart` at 09:36:29 (~165 s); loud DEAF alert posted via the gateway-INDEPENDENT REST path (+notify Kyle) WHILE inbound dead; `os._exit(1)` → systemd restart → reconnect 09:37:32 → recovery alert. Layered: `sd_notify(WATCHDOG=1)` while fresh + `WatchdogSec=300` backstop for a full-loop hang. **CORRECTION (Langston Step-8 + stress-test, do not overclaim):** the first kill-test's activating window was ~44 s (<90 s) so it did NOT exercise `TimeoutStartSec=infinity`; a follow-up stress-test then found `TimeoutStartSec` is effectively **inert** — on a can't-connect outage discord.py 2.7.1 CRASHES (`client.py:787` derefs `self.ws=None`) and the process EXITS at ~63 s (DROP) / crash-loops ~12 s/cycle (REFUSE, measured), before the 90 s start-timeout can fire. See the Crash-Exit Addendum. |
| **OBJ-3** startup backfill (no lost messages) | ✅ YES | `on_ready` replays channel history missed during downtime through each bridge's own handler, deduped by `message_id` scoped to that bridge's kinds (#494 cross-bridge false-skip guard). Kill-test: backfill re-fed on reconnect; **verified ZERO double-log** (Kyle rows deduped) and **ZERO spurious Langston re-enqueue**. |
| **OBJ-4** same hardening on the Langston bridge | ✅ YES | `discord-langston-bridge.py` (identical zombie failure, `:713`) gets the same `install_watchdog`; deployed active, `heartbeat=41.25s threshold=165s`, 0 re-enqueue. State under `/home/langston/.discord-bridge/` (runs as User=langston). |
| **OBJ-5** wake-watcher boundary documented (honest) | ✅ YES | This fix keeps the feed alive + makes a dead feed LOUD, so the wake watcher can't be silently starved again. It does NOT change the watcher's own drop modes: context-compaction kill (covered by the existing SessionStart re-arm hook) and full session close (platform limit). Silent death is now impossible from the FEED side, not the watcher side. |

## Verification (outcomes-based, LIVE)
- Unit: `gateway_watchdog_test.py` 29/29 (threshold derivation, staleness, cooldown, backfill dedup incl. #494 kind-scoping, epoch persist/fsync, inbox scan).
- On-box: `py_compile` OK; both units `WatchdogUSec=5min`, `NotifyAccess=main`, `is-active=active` (=`READY=1` received); LF verified byte-level after scp.
- **Kill-test (CC bridge, gateway `.234` blocked, REST `.232/.233` alive) — the ZOMBIE case:** stall→alert(+phone)→`os._exit`→unblock 09:37:24→reconnect 09:37:32 (~8 s, new PID)→backfill re-fed→recovery alert. Exactly ONE DEAF + ONE recovered (cooldown correct). iptables clean. (The can't-connect crash-mode + its StartLimit/OnFailure mitigation are in the Crash-Exit Addendum — separately measured, not conflated with this test.)

## Three runtime bugs caught at deploy (static review couldn't)
1. base `discord.Client` has no `add_listener` (ext.commands.Bot only) → attribute-assignment registration + wrap the bridge's on_ready.
2. heartbeat interval is `ws._keep_alive.interval` (sec), not `ws.heartbeat_interval` — was falling to the 120 s floor; now 165 s.
3. backfill honest "re-fed N recent" log + 8 MB scan margin; zero double-log confirmed.

## Crash-Exit Addendum (Langston Step-8 + stress-test — the honest scope of the systemd side)
The kill-test proved the **zombie** case (the actual #462 failure). A follow-up stress-test found a **second, distinct** failure mode and its honest limits:
- **Root:** on a can't-connect outage discord.py 2.7.1 crashes (`client.py:787` derefs `self.ws` when `None` on the reconnect path) → the bridge **process exits**, so a sustained outage crash-loops (it does NOT sit in `activating`). `TimeoutStartSec=infinity` is therefore inert — kept only as harmless defense-in-depth.
- **Measured cycles:** DROP/timeout outage ≈ **63 s/cycle**; REFUSE fast-fail ≈ **12 s/cycle** (restart counter reached 3 in ~36 s under OUTPUT-REJECT; same `:787` crash).
- **Mitigation shipped (three-way consensus me+Langston+CC-B):** `StartLimitIntervalSec 600→60` (Langston APPROVED) → a DROP/timeout outage (~73 s/cycle) is ≤1 start per 60 s window → **restarts forever under `Restart=always` → survives + auto-recovers.** HONEST LIMIT: a REFUSE/DNS fast-fail outage (~12 s/cycle) still trips 5-in-60 → latches — so **`OnFailure=discord-bridge-failed-notify@…`** converts that latch into a LOUD phone page. **LIVE-FIRE VERIFIED (Langston Step-8 required, observed not extrapolated):** a forced REFUSE crash-loop drove the unit to `ActiveState=failed`; the OnFailure oneshot ran and `bridge-failed-notify.sh` posted "🚨 …FAILED-LATCHED… needs a manual restart" to `#general` with `notify:true` (phone push; inbox message_ids `1526170948…`, `1526170990…`); bridge recovered clean after. (Minor: it fired 2× — OnFailure triggers per failure-transition during the loop, not only the final latch — bounded + loud; candidate refinement = a cooldown in the notify script.)
- **Durable ROOT fix homed:** `#465 / B-DISCORD-CONNECT-RESILIENCE` (owner CC-A) — wrap the initial connect so the library crash never exits the process (§5 #11 NO-PATCHES). Makes the latch moot.

## Langston review
- Step-1 scope APPROVED; Step-2 pre-audit CLEARED (fsync-ordering + StartLimit reframe folded); Step-4 diff review — one CHANGES-NEEDED (`TimeoutStartSec=infinity`, applied) else clean; Step-8 — deploy-path defect (deploy.sh reverting the units) FIXED + re-verified, precision-note on TimeoutStartSec + the crash-mode finding folded (StartLimit 600→60 APPROVED).
- **Step-8 final: ✅ PASS (Langston, 2026-07-13, verified independently at origin `c2989c05d`).** Core batch PASS ("600→60 closes the silent slow-timeout latch this batch existed to kill — ship it"); OnFailure hold discharged after the forced-latch LIVE-FIRE (unit→failed, oneshot ran, page landed with phone push). Addendum re-read at the ref, no overclaim. Root fix #465 acknowledged as the durable follow-on.

**BATCH CLOSED 2026-07-13** — all 5 objectives green + live-verified; Langston Step-1/2/4/8 all passed; deploy-path defect fixed; crash-mode measured + mitigated (StartLimit 600→60 + OnFailure live-fired) with the root fix homed at #465. Residual follow-ups (non-blocking): the OnFailure double-fire cooldown (candidate refinement) + #465 B-DISCORD-CONNECT-RESILIENCE (the retry-wrap root fix, my lane).

## Governance files changed
SIM "Discord Comms Fabric" (watchdog entry — new cross-cutting liveness state + `.service` directives), RUNNING_ISSUES (#462 resolve), BATCH_CATALOG (this row), PHASE_HISTORY, CHANGES_AND_FIXES (FIX-2026-07-13), this report, MEMORY_CC_A + Langston MEMORY. SYSTEM_MANUAL N/A (comms infra). Scope + pre_audit in `Claude Comms and Packages/Scope Files/`.

## Note — the §10.5 ssh alert leg
The guaranteed loud path (Discord `--notify` → Kyle's phone) is fully wired + proven. The optional secondary §10.5 tracked-queue insert (`WATCHDOG_SSH_ALERT_CMD`) is OFF by default — enabling it needs a root@Helsinki→staging path; deferred as a non-blocking enhancement (the Discord path is independent and proven).
