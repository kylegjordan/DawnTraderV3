# B-DISCORD-INBOUND-LIVENESS — Scope (Step-1)

change-class: non_architecture

> **Owner:** CC-A (Claude Old). **Reviewer:** Langston (Step-1/4/8, never owns/pushes). **Home:** RUNNING_ISSUES #462.
> **Directive:** Kyle 2026-07-13 — "please fix the silent-feed watchdog issue." Comms-infra hardening; no engine/strategy/regime/signal-pipeline/math touched (SIM-scope, not System-Manual-scope).

## The problem (grounded in the code, not guessed)
The Discord **inbound-receive path can silently die while the process looks perfectly healthy**, and nothing detects it. Confirmed twice: ~95 min on 2026-07-11 (#462) and **~21 h on 2026-07-12 → 08:29Z 07-13** (both CCs blind; caught only because Langston pinged and got no reply).

Root, from `comms-infra/discord/discord-cc-bridge.py`:
- The daemon runs `client.run(BOT_TOKEN, reconnect=True)` (`:195`). discord.py's built-in `reconnect=True` **did not recover** the zombied gateway — the websocket receive stopped, the process + threads stayed up, no reconnect fired.
- The only heartbeat — `"voice worker alive, queue depth=0"` (`:119`) — proves the **voice-worker thread** is alive. It does **not** observe the gateway receive path, so every health signal read GREEN while the bridge was deaf. **This is the false-health trap.**
- No `on_disconnect` / `on_resumed` handler, no tracking of "when did we last receive a gateway event."
- The wake watcher tails the inbox log; when the feed dies the log goes quiet, so a *healthy* watcher still goes silent — a dead feed is indistinguishable from a quiet channel.

Two enabling facts the fix leans on:
- **Outbound send is REST/webhook (`rest_send`/`webhook_send`), independent of the gateway** — proven to keep working while receive was dead. So the watchdog **can** raise a loud alert even when receiving is dead.
- **`discord-cc-bridge.service` is `Restart=always, RestartSec=10`** — a watchdog that *exits* the process on detected staleness gets an automatic fresh restart (gateway reconnects clean). No fragile in-process reconnect required.

## Objectives (numbered, with verification criteria)

**OBJ-1 — Gateway receive-liveness signal (the core).** Track a monotonic `last_gateway_recv` timestamp updated on every *true* gateway signal that fires independent of channel chatter (candidate mechanisms, to be chosen in Step-2/3: `on_socket_raw_receive` with `enable_debug_events=True` — fires on every frame incl. the ~41 s heartbeat ACK; and/or `on_resumed`/`on_ready`/`on_message` + discord.py `client.latency`). Fix the misleading heartbeat: the periodic "alive" log must reflect **gateway-receive** liveness, not just the voice-worker thread.
- *Verify:* with the bridge idle on a quiet channel, `last_gateway_recv` still advances (heartbeat-ACK driven), proving liveness is decoupled from message traffic.

**OBJ-2 — Detect staleness → LOUD + auto-recover.** A watchdog (candidate: an internal thread/asyncio task, OR systemd `WatchdogSec=` + `sd_notify(WATCHDOG=1)` pinged only while `last_gateway_recv` is fresh — Step-2 decides) that, when `now − last_gateway_recv > STALE_THRESHOLD` (candidate ~180 s ≈ 4 missed heartbeats): (a) posts an **outbound Discord alert** (survives gateway death) with `--notify` to Kyle; (b) fires a §10.5 system-alert so it enters the tracked alert queue (mechanism TBD Step-2: ssh to staging `system-alerts` vs a marker the dispatcher promotes); (c) **exits the process** so systemd restarts it fresh.
- *Verify:* simulate a stall (kill the gateway socket / block receive) → within threshold+margin a Discord alert posts AND the process restarts AND the gateway reconnects — observed live, not asserted.

**OBJ-3 — Startup backfill (no lost messages).** On `on_ready`/reconnect, fetch recent channel history since the last-logged `message_id` and replay any missed messages into the inbox log (gateway reconnect does NOT replay — #462 flagged missed messages as unrecoverable today).
- *Verify:* stop the bridge, post a message while it's down, restart → the missed message appears in `cc-discord-inbox.jsonl` and wakes CC.

**OBJ-4 — Same hardening on the Langston bridge.** `discord-langston-bridge.py` shares the identical gateway pattern and the identical failure mode (it is how Langston receives). Apply OBJ-1/2/3 to it too — a watchdog on only one bridge leaves the other able to die silently. (Scope option, Langston to weigh: do both here, or split the Langston bridge to a fast-follow if blast radius argues for it.)
- *Verify:* the Langston bridge shows the same decoupled liveness + stall→alert→restart behavior.

**OBJ-5 — Answer Kyle's question on the record.** Document in the completion report exactly how this relates to the wake watcher: the fix keeps the feed alive + makes a dead feed loudly detectable, so the watcher can't be *silently starved* again; it does NOT change the watcher's own separate failure modes (context-compaction kill → the existing SessionStart re-arm hook; full session close → platform limit). Honest boundary, not overclaim.

## Out of scope / non-goals
- No change to message routing, wake-filter logic, or the alert dispatcher's grading. No engine/trading code. No new asset-class behavior.
- The checker-state reconcile (#352) and orphan-sweep class-awareness (#497) are CC-B's B-GOV-ORPHAN-CLASS — not this batch.

## Testing & deploy notes
- Bridges are Python; tsc/vitest N/A. Add unit coverage for the pure staleness-decision logic (mirror `langston_queue_test.py`); the gateway/backfill parts verify LIVE on Helsinki.
- Source of truth in-repo: `comms-infra/discord/` → deployed to Helsinki `/opt/discord-bridges/` via `comms-infra/discord/deploy.sh`. Bridge code is documentation-graded, not CI-diff-graded (#463) — so the change list + live proof carry the review weight.
- Governance: RUNNING_ISSUES #462 (resolve on close), SIM "Discord Comms Fabric" (new liveness/watchdog cross-cutting behavior), CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, completion report. SYSTEM_MANUAL N/A (comms infra).

## Open questions for Langston (Step-1)
1. Watchdog mechanism preference: internal thread/task vs systemd `WatchdogSec`+`sd_notify`? (I lean systemd-native — it makes the OS the watchdog, and the process can't lie about its own liveness.)
2. §10.5 alert emission from Helsinki: ssh-to-staging `system-alerts` call vs a lighter Discord-only loud alert with a dispatcher-recognized `category` marker?
3. Fold the Langston bridge (OBJ-4) into this batch, or fast-follow?
4. STALE_THRESHOLD value — 180 s reasonable, or tie it to a multiple of the measured heartbeat interval?
