# B-DISCORD-INBOUND-LIVENESS — Pre-Audit (Step-2)

change-class: non_architecture · Owner CC-A · Reviewer Langston · #462
Folds Langston's Step-1 rulings + his two Step-2 flags. Read alongside `B_DISCORD_INBOUND_LIVENESS_SCOPE.md`.

## Components touched (SIM "Discord Comms Fabric") — upstream / downstream / shared-state / blast-radius

| Component | Upstream feeders | Downstream consumers | Shared state / bg execution | Blast radius |
|---|---|---|---|---|
| `discord-cc-bridge.py` (daemon) | Discord gateway (`on_message`), voice worker | `/var/log/cc-discord-inbox.jsonl` → wake watcher | gateway client; new `last_gateway_recv` (monotonic, written by socket/heartbeat hook, read by watchdog) | LOW-MED — boundary process; a bug that force-exits too eagerly = restart churn (dampened by StartLimit). `Restart=always` net. |
| `discord-langston-bridge.py` (daemon) | Discord gateway (`on_message` → enqueuer → single worker) | inbox log; `langston_queue.py` review queue; `claude -p` | same gateway pattern (`:713` `client.run(reconnect=True)`; `:541` worker-thread heartbeat); the queue | MED — carries the review queue; watchdog exit is safe (queue is `queue_lock`-serialized + move-not-delete since B-LANGSTON-QUEUE-2, so an exit mid-op doesn't corrupt/lose it). |
| `discord_common.py` | — | both bridges | `append_inbox` (plain JSONL append, **no dedup today**); `rest_send`/`webhook_send` (outbound, gateway-independent) | LOW — shared lib; the backfill-dedup helper lands here so both bridges share it. |
| `*.service` (both) | systemd | — | `Restart=always RestartSec=10 Type=simple`; ADD `WatchdogSec`, `StartLimitIntervalSec`/`StartLimitBurst` | LOW — unit config; a wrong `WatchdogSec` could restart-loop → mitigated by StartLimit + a WatchdogSec ≫ the in-process stale threshold. |
| `/var/log/cc-discord-inbox.jsonl` | both bridges | wake watcher tail (`cc-wake-filter.py`) | one `message_id` fans into MULTIPLE rows by `kind` (Langston #494) | LOW — append-only; dedup reads it, doesn't mutate. |
| §10.5 alert store (staging `system-alerts`) | dispatcher + external `system-alerts` CLI | Discord + Langston-invoke | the tracked alert queue (Frankfurt/staging, cross-network from Helsinki) | LOW — one best-effort, time-boxed alert insert; never on the critical path (Discord alert fires first). |

**No engine/strategy/regime/signal-pipeline/math component is in this table → SYSTEM_MANUAL N/A; SIM "Discord Comms Fabric" is the applicable Tier-2 doc (new cross-cutting liveness/watchdog state + the two new `.service` directives).**

## Design decisions (Langston Step-1 rulings, made concrete)

**D1 — Liveness signal (OBJ-1).** Track `last_gateway_recv` (monotonic clock) updated on every true gateway frame. Mechanism: discord.py `enable_debug_events=True` + `on_socket_raw_receive` (fires on EVERY frame incl. the server heartbeat ACK, ~41s, independent of channel traffic). Also refresh on `on_message`/`on_ready`/`on_resumed`. Replace the misleading worker-thread "alive" log line with one that reports gateway-recv age.

**D2 — Layered watchdog (OBJ-2, Langston Q1).** TWO layers:
- *Primary (loud):* an internal watchdog (asyncio task on the client loop) checks `now − last_gateway_recv > THRESHOLD` → (a) **persist `last_alert_epoch` to its state file and `os.fsync` it FIRST** — before anything else in the exit path (Langston Q1 caveat: `os._exit` skips atexit/buffer flushes; if the persist races the exit, a restart re-reads a stale/empty epoch and re-alerts, defeating the F2 cooldown — so persist+fsync is ordered strictly before the exit, and gated by the cooldown check so a still-fresh cooldown suppresses the alert entirely); (b) if not in cooldown, `webhook_send`/`rest_send` a loud alert `--notify` Kyle (gateway-independent, sent before the ssh hop); (c) best-effort **time-boxed** (`timeout ~8s`) ssh to staging `npm run system-alerts` to enter the tracked queue; (d) `os._exit(1)` → systemd `Restart=always` brings it back fresh.
- *Backstop (silent):* `sd_notify(WATCHDOG=1)` raw datagram to `$NOTIFY_SOCKET`, pinged ONLY while `last_gateway_recv` is fresh, with `WatchdogSec` set ≫ threshold. If the whole event loop hangs (so the primary can't even run), systemd's own timer expires → SIGABRT → restart. Catches the full-hang case an internal thread would miss. No new Python dep (raw socket).

**D3 — Alert ordering (Langston Q2).** Discord outbound FIRST (proven independent of the dead gateway) → then time-boxed ssh `system-alerts` (never the only path; time-box so it can't delay exit) → then exit. No new dispatcher category marker (reuse the tested path).

**D4 — Threshold (Langston Q4).** `THRESHOLD = max(FLOOR=120s, 4 × heartbeat_interval)` where `heartbeat_interval` is read from Discord's HELLO (`client.ws.heartbeat_interval`, ~41s → ~164s). Log the resolved value at startup. N=4 (2-3 flaps tolerate a slow ACK; >5 re-widens the blind window).

**D5 — Both bridges (Langston Q3).** OBJ-4 folded in — the staleness/alert/backfill logic is pure and lands in `discord_common.py`; both daemons call it. A watchdog on one bridge is a half-fix.

## Langston's two Step-2 flags — resolved

**F1 — OBJ-3 double-delivery (the real correctness hazard).** Backfill on `on_ready` fetches channel history since the last-seen id and could re-inject a message that (a) gateway reconnect already replayed, or (b) is already in the log. **Dedup rule:** before append/enqueue, read the set of `message_id`s already present in `cc-discord-inbox.jsonl` and SKIP any backfill message whose id is present. **Key on `message_id` alone, NOT a row-count** — one id fans into multiple rows by `kind` (#494), so "already present" = id appears in ≥1 row. For the Langston bridge, the same id-dedup gates ENQUEUE (so a review item can't double-fire — reinforced by the existing terminal-state/`apply_marker` guards from B-LANGSTON-QUEUE-2). Explicit verify step below.

**F2 — Restart-storm dampening (CORRECTED per Langston Step-2 Q2).** The spam control is the **in-process alert-dedup**, NOT a systemd `failed`-latch: persist `last_alert_epoch` (fsync'd before exit, per D2) and suppress re-alert within a 15-min cooldown → Kyle gets ONE loud alert per outage, not one per restart cycle; on recovery (`on_ready` after a stale period) post a single "recovered" line. **`Restart=always` continues to carry a slow Discord-side outage** (a stall exits ~every `THRESHOLD+RestartSec` ≈ 174s → ~3.4 exits/600s, which by design never reaches a burst cap — and we do NOT want a `failed`-latch on a recoverable outage: it would keep the bridge DOWN after Discord returns, needing a manual `reset-failed`, and nobody watches systemd unit-state cross-network from Helsinki, so `failed` is not actually "detectable" by anyone). `StartLimitIntervalSec=600 / StartLimitBurst=5` is retained ONLY to catch a *pathological fast crash-loop* — a bad config/import error exiting in <10s (5 such crashes/600s trips the guard) — which is the only fault it meaningfully guards. It does nothing for the slow-stall path, and that's correct.

## Blast radius, rollback, non-goals
- Both bridges are `os._exit`-safe mid-flight: the CC bridge only appends to the log; the Langston queue is `queue_lock`-serialized + move-not-delete (B-LANGSTON-QUEUE-2), so an exit can't corrupt it.
- **Rollback:** the deploy backs up both live files (`.pre-INBOUND-LIVENESS-<ts>`) + the two unit files; revert = restore + `daemon-reload` + restart. Source-of-truth stays in-repo `comms-infra/discord/`.
- Non-goals: no wake-filter/routing change, no dispatcher grading change, no engine code. #352/#497 (checker) are CC-B's separate batch.

## Verification plan (LIVE, outcomes-based — §9.3-analogue for comms infra)
1. **Liveness decoupled:** on a quiet channel, confirm `last_gateway_recv` advances (~every 41s) → proves heartbeat-ACK-driven, not traffic-driven.
2. **Stall → loud + restart:** force a gateway stall (block/kill the socket) → within `THRESHOLD + margin`: a Discord alert posts (phone push), a §10.5 alert appears in the tracked queue, the process exits and systemd restarts it, `on_ready` re-logs, gateway receives again.
3. **Backfill + dedup:** stop bridge → post a message while down → restart → the missed message appears in the inbox EXACTLY ONCE (no duplicate row-set for that id) and wakes CC; a message that WAS delivered before the stop is NOT re-injected.
4. **Alert-dedup (spam control):** simulate a persistent gateway STALL → confirm exactly ONE loud alert across many restart cycles (the 15-min cooldown holds across restarts because `last_alert_epoch` is fsync'd before exit), and a single "recovered" line when it comes back. **Separately, StartLimit guards only a fast crash-loop:** inject a fast-exit fault (bad config exiting <10s) → confirm the unit trips its `StartLimit` after the burst. (Do NOT expect a `failed`-latch from the slow-stall case — by design it never reaches the burst, and we don't want it to.)
5. **Both bridges:** repeat 1-2 on the Langston bridge.
6. **Full-hang backstop:** simulate an event-loop hang (no frames processed) → `sd_notify` pings stop → `WatchdogSec` fires SIGABRT → restart.

## Open for Langston (Step-2 clear)
- OK on `os._exit(1)` vs a graceful `client.close()` before exit? (I lean `os._exit` after the alert — a hung/zombied loop may not honor a graceful close; the alert already fired.)
- `StartLimitBurst=5 / IntervalSec=600` + 15-min alert cooldown reasonable, or tune?
