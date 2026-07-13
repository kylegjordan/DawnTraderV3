#!/usr/bin/env python3
"""
gateway_watchdog.py — shared gateway receive-liveness watchdog for the Discord bridges.
(B-DISCORD-INBOUND-LIVENESS, RUNNING_ISSUES #462)

The failure this closes: discord.py's `client.run(reconnect=True)` can ZOMBIE — the
gateway websocket stops receiving while the process + worker threads stay alive, so
every prior health signal reads green (the worker-thread "alive" heartbeat does NOT
observe the gateway). Confirmed twice: ~95 min (2026-07-11) and ~21 h (2026-07-12),
both leaving CC + Langston silently blind.

This module supplies a TRUE receive-liveness signal (advanced by every gateway frame
incl. the ~41 s server heartbeat ACK, so it is decoupled from channel chatter) plus a
LAYERED watchdog:
  - PRIMARY (loud): on staleness → persist+fsync the alert-cooldown epoch (BEFORE exit,
    so a restart honors the cooldown) → Discord alert via the gateway-INDEPENDENT outbound
    path (--notify Kyle) → best-effort time-boxed ssh system-alerts → os._exit(1); systemd
    `Restart=always` brings it back fresh.
  - BACKSTOP (silent): sd_notify(WATCHDOG=1) pinged ONLY while receive is fresh; a fully
    hung event loop stops the pings → systemd `WatchdogSec` → SIGABRT → restart. Catches
    the full-hang case the in-process task (same loop) could not.

The pure decision functions (resolve_threshold / is_stale / should_alert / dedup_backfill)
are unit-tested in gateway_watchdog_test.py; the I/O (alert+exit, sd_notify, inbox scan,
epoch persistence) is integration-verified live on the box.
"""
import json
import os
import socket
import subprocess
import time
from pathlib import Path

# ── Tunables (Langston Step-1/2 rulings) ─────────────────────────────────────
THRESHOLD_FLOOR_S = 120.0      # never trip faster than this even if heartbeat is tiny
THRESHOLD_N = 4               # N × measured heartbeat; 2-3 tolerate a slow ACK, >5 re-widens the blind window
ALERT_COOLDOWN_S = 15 * 60    # one loud alert per outage window, then a re-reminder each cooldown
RECOVERY_WINDOW_S = 60 * 60   # on_ready within this of the last alert ⇒ post a single "recovered" line
WATCHDOG_CHECK_INTERVAL_S = 15  # how often the in-process watchdog task runs


# ── Pure decision core (unit-tested) ─────────────────────────────────────────
def resolve_threshold(heartbeat_interval_s, floor_s=THRESHOLD_FLOOR_S, n=THRESHOLD_N):
    """Stale threshold = max(floor, N × measured HELLO heartbeat interval).

    Derived at runtime from Discord's server-sent heartbeat interval, never a bare literal,
    so it stays 'N missed beats' even if Discord changes the interval (Langston Q4).
    """
    hb = heartbeat_interval_s or 0
    return max(float(floor_s), float(n) * float(hb))


def is_stale(last_recv_monotonic, now_monotonic, threshold_s):
    """True iff no gateway frame has been received within `threshold_s` (monotonic clock)."""
    return (now_monotonic - last_recv_monotonic) > threshold_s


def should_alert(last_alert_epoch, now_epoch, cooldown_s=ALERT_COOLDOWN_S):
    """Spam control: alert only if no alert within `cooldown_s` (Langston F2)."""
    if last_alert_epoch is None:
        return True
    return (now_epoch - last_alert_epoch) >= cooldown_s


def dedup_backfill(candidate_ids, existing_ids):
    """Return candidate message_ids NOT already present.

    Key on message_id ALONE, not a row count — one id fans into multiple inbox rows by
    `kind` (Langston #494), so 'already present' = the id appears in ≥1 existing row.
    Order-preserving.
    """
    ex = set(existing_ids)
    return [i for i in candidate_ids if i not in ex]


# ── Alert-cooldown persistence (fsync BEFORE os._exit — Langston Q1) ──────────
def read_last_alert_epoch(state_path):
    """Last alert epoch (float) or None. Tolerates a missing/corrupt file (→ None → will alert)."""
    try:
        return float(Path(state_path).read_text().strip())
    except Exception:
        return None


def persist_alert_epoch(state_path, epoch):
    """Write + fsync the epoch. MUST complete before the caller's os._exit — otherwise the
    buffered write is lost on _exit and a restart re-reads a stale/empty epoch and re-alerts,
    defeating the cooldown (Langston Q1)."""
    p = Path(state_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        os.write(fd, f"{epoch}\n".encode())
        os.fsync(fd)
    finally:
        os.close(fd)


def clear_alert_epoch(state_path):
    """Clear the cooldown/outage marker (called on confirmed recovery)."""
    try:
        os.remove(state_path)
    except FileNotFoundError:
        pass
    except Exception:
        pass


# ── systemd backstop (no new dependency — raw datagram) ──────────────────────
def sd_notify(state):
    """Send a datagram to $NOTIFY_SOCKET (e.g. 'READY=1', 'WATCHDOG=1'). No-op if unset.

    Requires the unit to be Type=notify with WatchdogSec set for WATCHDOG=1 to matter."""
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return False
    if addr[0] == "@":                       # abstract namespace
        addr = "\0" + addr[1:]
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            s.connect(addr)
            s.sendall(state.encode())
        finally:
            s.close()
        return True
    except Exception:
        return False


# ── Inbox scan for backfill dedup ────────────────────────────────────────────
def inbox_message_ids(inbox_log, tail_bytes=2_000_000, kinds=None):
    """Set of message_ids already present in the inbox log (tail-scan bounded for speed).

    `kinds` (optional set): count an id only if it appears in a row whose `kind` is in the set.
    This SCOPES the dedup to the rows a given bridge itself writes — both bridges fan one
    message_id into DIFFERENT kind rows (a Kyle→Langston message = a "" Kyle row from the CC
    bridge AND a langston_inbound row from the Langston bridge, #494). Without scoping, a bridge
    recovering from downtime could false-SKIP a message the OTHER bridge logged under its kind and
    never wake on it — a miss, the exact failure we're closing. Erring toward re-deliver (a
    harmless double-wake) beats a miss. `kinds=None` = all kinds (used only where that's intended).
    """
    ids = set()
    try:
        with open(inbox_log, "rb") as f:
            try:
                f.seek(-tail_bytes, os.SEEK_END)
            except OSError:
                f.seek(0)
            data = f.read()
        for line in data.splitlines():
            try:
                e = json.loads(line)
            except Exception:
                continue
            if kinds is not None and e.get("kind") not in kinds:
                continue
            mid = e.get("message_id")
            if mid is not None:
                ids.add(mid)
    except FileNotFoundError:
        pass
    return ids


# ── The loud exit path (integration; ordering is load-bearing) ───────────────
def raise_and_exit(bridge_name, send_alert_fn, state_path, log_fn,
                   ssh_alert_cmd=None, ssh_timeout_s=8, cooldown_s=ALERT_COOLDOWN_S):
    """Staleness detected → alert (once per cooldown) → exit for a systemd restart.

    ORDER (Langston Q1 + D3), all before os._exit:
      1. If NOT within cooldown: persist+fsync the alert epoch FIRST (so a restart within
         the cooldown does not re-alert), then send the Discord alert (gateway-independent),
         then a best-effort TIME-BOXED ssh into the tracked §10.5 queue.
      2. Always os._exit(1) → systemd Restart=always brings the gateway back fresh.
    A within-cooldown stall still EXITS (to keep trying to recover) but stays silent.
    """
    now = time.time()
    last = read_last_alert_epoch(state_path)
    if should_alert(last, now, cooldown_s):
        persist_alert_epoch(state_path, now)          # fsync'd, strictly before exit
        msg = (f"⚠️ **{bridge_name}: inbound gateway is DEAF** — no Discord frames received "
               f"past the liveness threshold. Auto-restarting the bridge now to reconnect. "
               f"(This alert went out the outbound path, which is independent of the dead "
               f"receive path.) If this repeats, comms may be degraded.")
        try:
            send_alert_fn(msg)
        except Exception as e:
            log_fn(f"watchdog: Discord alert send failed (continuing to exit): {e}")
        if ssh_alert_cmd:
            try:
                subprocess.run(ssh_alert_cmd, shell=isinstance(ssh_alert_cmd, str),
                               timeout=ssh_timeout_s,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception as e:
                log_fn(f"watchdog: ssh system-alerts failed/timed out (non-fatal): {e}")
        log_fn(f"watchdog: gateway stale → alerted → exiting for systemd restart")
    else:
        log_fn(f"watchdog: gateway stale but within alert cooldown → silent exit for restart")
    os._exit(1)


def note_recovery(bridge_name, state_path, send_alert_fn, log_fn, recovery_window_s=RECOVERY_WINDOW_S):
    """Called from on_ready: if we alerted recently, the gateway is back → post ONE 'recovered'
    line and clear the cooldown marker so the next outage alerts immediately."""
    last = read_last_alert_epoch(state_path)
    if last is None:
        return
    if (time.time() - last) <= recovery_window_s:
        try:
            send_alert_fn(f"✅ **{bridge_name}: inbound gateway recovered** — receiving again.")
        except Exception as e:
            log_fn(f"watchdog: recovery notice send failed: {e}")
    clear_alert_epoch(state_path)


# ── Integration entry point (discord.py-duck-typed; NOT imported at module level, so the
#    pure core above stays dependency-free + unit-testable without discord installed) ────
def _normalize_heartbeat(hb):
    """discord.py 2.x exposes client.ws.heartbeat_interval in SECONDS (~41.25). Guard anyway:
    a value that looks like milliseconds (>1000) is divided; None/0 → None → threshold floor."""
    if not hb:
        return None
    return hb / 1000.0 if hb > 1000 else hb


async def _backfill_missed(client, channel_id, inbox_log, replay_message, log_fn,
                           limit=30, dedup_kinds=None):
    """On (re)connect, replay channel messages missed during downtime, deduped by message_id
    against the inbox (Langston F1: key on the id alone, #494 fanout), SCOPED to this bridge's
    own kinds (`dedup_kinds`) so a cross-bridge kind-row can't false-skip a real miss. Replays
    oldest→newest through the bridge's OWN message handler so per-bridge logic is reused."""
    ch = client.get_channel(channel_id)
    if ch is None:
        return
    already = inbox_message_ids(inbox_log, kinds=dedup_kinds)
    pending = []
    async for m in ch.history(limit=limit):
        if m.id not in already:
            pending.append(m)
    replayed = 0
    for m in reversed(pending):                      # oldest → newest
        try:
            await replay_message(m)
            replayed += 1
        except Exception as e:
            log_fn(f"watchdog: backfill replay of {m.id} failed: {e}")
    if replayed:
        log_fn(f"watchdog: backfill replayed {replayed} missed message(s) since downtime")


def install_watchdog(client, *, bridge_name, send_alert_fn, state_path, log_fn,
                     inbox_log, channel_id, replay_message, ssh_alert_cmd=None,
                     dedup_kinds=None):
    """Wire the receive-liveness watchdog onto an existing discord.py Client.

    Uses add_listener (NOT @client.event) so it coexists with the bridge's own on_ready/
    on_message handlers. REQUIRES the Client to be built with enable_debug_events=True so
    on_socket_raw_receive fires (that frame — incl. the ~41 s heartbeat ACK — is the true
    receive-liveness signal, independent of channel traffic).
    """
    import asyncio
    mono = time.monotonic
    recv = {"t": mono()}          # last gateway frame (monotonic)
    started = {"v": False}

    async def _on_socket_raw_receive(_raw):
        recv["t"] = mono()

    async def _on_message_touch(_message):
        recv["t"] = mono()

    async def _on_resumed():
        recv["t"] = mono()
        log_fn("watchdog: gateway RESUMED")

    async def _watchdog_loop(threshold):
        while True:
            await asyncio.sleep(WATCHDOG_CHECK_INTERVAL_S)
            if is_stale(recv["t"], mono(), threshold):
                # PRIMARY loud path — persist+fsync epoch, Discord alert, time-boxed ssh, os._exit.
                raise_and_exit(bridge_name, send_alert_fn, state_path, log_fn,
                               ssh_alert_cmd=ssh_alert_cmd)
            else:
                sd_notify("WATCHDOG=1")          # BACKSTOP: only pinged while receive is fresh

    async def _on_ready():
        recv["t"] = mono()
        sd_notify("READY=1")
        hb = _normalize_heartbeat(getattr(getattr(client, "ws", None), "heartbeat_interval", None))
        threshold = resolve_threshold(hb)
        log_fn(f"watchdog: gateway ready; heartbeat={hb}s stale-threshold={threshold:.0f}s")
        note_recovery(bridge_name, state_path, send_alert_fn, log_fn)
        try:
            await _backfill_missed(client, channel_id, inbox_log, replay_message, log_fn,
                                   dedup_kinds=dedup_kinds)
        except Exception as e:
            log_fn(f"watchdog: backfill error (non-fatal): {e}")
        if not started["v"]:
            started["v"] = True
            client.loop.create_task(_watchdog_loop(threshold))
            log_fn("watchdog: liveness loop started")

    client.add_listener(_on_socket_raw_receive, "on_socket_raw_receive")
    client.add_listener(_on_message_touch, "on_message")
    client.add_listener(_on_resumed, "on_resumed")
    client.add_listener(_on_ready, "on_ready")
