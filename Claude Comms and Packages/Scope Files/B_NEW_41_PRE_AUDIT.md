# B-NEW-41 — Pre-Audit (Step 2)

**Batch:** B-NEW-41 (whisper.cpp voice transcription for both bots + Langston staging SSH access)
**Date:** 2026-05-17
**Author:** Claude Code
**Scope reference:** `B_NEW_41_SCOPE.md` rev4 (Langston APPROVED)

---

## §1 SIM (System Impact Map) Consult

The two bridges (`cc-comms-bridge`, `langston-bridge.py`) live on Hetzner Helsinki at `/usr/local/bin/`, **not in the in-repo source tree.** The repo SIM (`1-system-manual/SYSTEM_IMPACT_MAP.md`) tracks repo-side components only. There is no existing SIM entry for either bridge — they are pure infrastructure operated from outside the repo. This is consistent with how the bridges have always been treated (per CLAUDE.md §8 the bridge architecture is documented but not in SIM).

**B-NEW-41 will add new boundary-component entries to SIM** for visibility, even though the code itself stays on Hetzner Helsinki:

| Component | Path (Hetzner) | Upstream feeders | Downstream consumers | Blast radius |
|-----------|----------------|------------------|----------------------|--------------|
| `cc-comms-bridge` voice handler | `/usr/local/bin/cc-comms-bridge` | Telegram Bot API getUpdates poll on `@CCDTCommsBot` | `/var/log/cc-bridge-inbox.jsonl` (read by CC sessions) | LOW — boundary-only, no trading-system path. Failure mode: voice notes silently skipped, text path unaffected. |
| `langston-bridge.py` voice handler | `/usr/local/bin/langston-bridge.py` | Telegram Bot API getUpdates poll on `@LangstonDTBot` | Langston Claude Code session (claude-cli stdin); shared `/var/log/cc-bridge-inbox.jsonl` mirror | LOW — same boundary surface as cc-comms-bridge. Failure mode: voice routing fails, text-only path unaffected. |
| `whisper.cpp` build | `/opt/whisper.cpp/build/bin/whisper-cli` + `/opt/whisper.cpp/models/ggml-small.en.bin` | Audio file invocation from either bridge | stdout transcription text → bridge inbox/claude-cli prompt | LOW — pure CPU subprocess on Hetzner Helsinki. No network, no DB. Failure mode: subprocess exit nonzero → bridge logs failure + posts fallback. |
| Voice audio archive | `/var/log/cc-bridge-voice-archive/YYYY-MM-DD/<msg_id>.ogg` | Bridge after successful getFile download | Manual debugging / re-transcription | LOW — disk-only. 30-day logrotate + 5GB daily-prune ceiling. |
| Langston SSH path → staging | Helsinki `langston@204.168.141.77` → Frankfurt `deploy@188.245.193.8` | Langston claude-cli SSH calls (read-only ops) | staging `/var/log/dawntrader/*`, pm2 status, localhost APIs | MEDIUM — boundary surface expansion. Mitigated by `deploy`-only posture + `from="204.168.141.77"` IP restriction. **Explicit escalation chain (Langston Step 2 Rev 3 — must be visible):** Helsinki compromise → Langston SSH key theft → `deploy@staging` access → `/home/deploy/dawntrader/.env` read → `DATABASE_URL` extracted → DB read/write authorization. Acceptable risk for this batch given (a) IP restriction blocks key-only theft, (b) ForceCommand wrapper is a 2-hr follow-up batch when time permits, (c) DB compromise from Helsinki theft also requires DB to be reachable from attacker's network — Supabase is internet-reachable so this caveat alone doesn't fully mitigate. Recommend a `from=` IP restriction on the DB user as a future follow-up. |
| Existing `cc-comms-bridge` text path | unchanged | unchanged | unchanged | UNCHANGED — voice path is additive, not replacing |
| Existing `langston-bridge` text path | unchanged | unchanged | unchanged | UNCHANGED — voice path is additive, not replacing |

**Trading-system blast radius: ZERO.** No B-NEW-41 component touches `server/`, `client/`, DB, strategies, signals, or any trading logic. This is pure agent-infrastructure work.

### SIM update plan (Step 10)

Add new subsection `## Agent Bridges (Hetzner Helsinki)` to SIM with the table above. Cross-link to CLAUDE.md §6 / §8 which describe the bridge architecture but not file-level. Note explicitly that code lives on Hetzner, not in repo.

---

## §2 Bridge Code Audit (Langston revision 2 — confirmed via Read)

Both bridges copied locally to `Claude Comms and Packages/Scope Files/b41_bridge_inspect/` for inspection. Findings:

### §2.1 `cc-comms-bridge` (252 lines)
- **Language:** Python 3, stdlib only (no asyncio, no external deps).
- **Concurrency model:** SINGLE-THREADED synchronous polling. Main loop calls `tg_request("getUpdates", timeout=25)` which blocks. On each batch of updates: iterates sequentially, processes each, then loops.
- **Path:** `/usr/local/bin/cc-comms-bridge` (no `.py` extension).
- **Subcommands:** `daemon` (default) and `send` (CLI outbound).
- **Inbox write:** `append_inbox(entry)` writes JSON to `/var/log/cc-bridge-inbox.jsonl`.
- **Auto-ACK behavior:** every human inbound gets a "✅ Logged" reply (B79.0c — restored OpenClaw UX). Voice inbounds should NOT collide with this; on success the ACK becomes "✅ Transcribed: <preview>" or similar. On failure, fallback notice replaces the standard ACK.

### §2.2 `langston-bridge.py` (296 lines)
- **Language:** Python 3, stdlib only.
- **Concurrency model:** SAME — single-threaded synchronous polling.
- **Path:** `/usr/local/bin/langston-bridge.py`.
- **Allowlist:** `should_handle(msg)` filters by `ALLOWED_SENDERS = {KYLE_USER_ID, CC_RELAY_USER_ID}` AND chat must be DM or topic 21 of group. **Voice handler MUST reuse `should_handle` so the same allowlist applies** (scope §2.3 confirmed).
- **claude-cli invocation:** `invoke_claude(prompt, session_id)` subprocess.run with 15-min timeout. Voice handler will call invoke_claude with the transcription as `prompt`.
- **Mirror events:** writes to `/var/log/cc-bridge-inbox.jsonl` with `source: "langston-bridge"` + `kind` discriminator.
- **Reaction:** adds 👀 emoji on inbound. Voice path should do same so Kyle sees acknowledgment even before transcription completes.

### §2.3 Concurrency policy implementation (Langston rev2 #4 + Step 2 Rev 1 — locked)

**The single-threaded sync model means a synchronous `subprocess.run` for whisper would block the main poll loop for 30-60s during transcription.** During that window, Telegram messages queue at Telegram's side (they don't drop — `getUpdates` fetches them on the next call), but ACKs are delayed. On burst (3 voice notes in 10s) the loop processes them strictly serially, freezing the bot's responsiveness for 90-180s.

**For `cc-comms-bridge`:** spawn ONE worker thread at startup, owning a `queue.Queue`. Voice tasks enqueued by main loop; worker dequeues, runs whisper subprocess, writes to inbox, calls send-fallback if needed. Main poll loop never blocks on whisper. **At-most-1-concurrent + FIFO + non-blocking poll** satisfied.

**For `langston-bridge.py` — DIFFERENT pattern (Langston Step 2 Rev 1 — critical):**

The naive "voice-only worker" pattern is **broken** for langston-bridge because main loop calls `invoke_claude(text, session_id)` inline today. If voice worker runs `invoke_claude(transcription, session_id)` while a text message arrives mid-flight → **two concurrent `claude --session-id <same UUID>` subprocesses against one conversation = undefined behavior / session-state corruption.**

**Correct pattern (Langston option a — preferred):** route ALL inbound (text + voice) through the same worker queue. Main loop becomes a pure enqueuer that does:
1. detect handle-or-not (`should_handle`)
2. detect voice-or-text
3. enqueue `{kind: "text", text: cleaned, ...}` OR `{kind: "voice", file_id: ..., ...}` onto worker queue
4. return to next poll iteration

Worker:
1. dequeue
2. if voice: download via getFile + transcribe via whisper-cli → produces `transcription_text`
3. invoke `claude -p --session-id <UUID> ...` with `transcription_text` (voice) or `cleaned` (text)
4. send reply to Telegram

**Single-claude-at-a-time invariant guaranteed** across both text and voice. **FIFO ordering preserved.** Main poll loop never blocks on either whisper OR claude.

Pseudo-code skeleton:

```python
import queue, threading, subprocess

task_q = queue.Queue()  # holds {kind: "text"|"voice", ...}

def task_worker():
    while True:
        task = task_q.get()
        try:
            if task["kind"] == "voice":
                transcription = transcribe(task)  # whisper subprocess
                if transcription is None:
                    send_fallback_notice(task)
                    task_q.task_done()
                    continue
                prompt = transcription
            else:
                prompt = task["text"]
            response = invoke_claude(prompt, state["session_id"])
            send_reply(task, response)
            mirror_event(...)
        except Exception as e:
            log(f"task worker error: {type(e).__name__}: {e}")
        finally:
            task_q.task_done()

threading.Thread(target=task_worker, daemon=True).start()

# Main poll loop: on any handle-able inbound, enqueue + continue. NEVER blocks.
```

**Heartbeat:** worker logs `task worker alive, queue depth=N` every 60s (covers risk item §10 "worker thread silent failure").

**System-wide concurrency:** at-most-2 whisper invocations across both bridges (one from cc-comms, one from langston). On CPX22 with `-t 3` per invocation: 2 workers × 3 threads = 6 logical threads peak, ~2 CPU-bound concurrent. Acceptable on 4-vCPU. If observed contention in practice, easy hardening: single shared whisper-worker process behind Unix socket — premature now.

**Atomic JSONL writes:** all inbox writes use a single `f.write(json.dumps(entry) + "\n")` call per entry. POSIX guarantees atomic writes under PIPE_BUF (4KB) on regular files — sufficient for our entries (typically <2KB). Prevents JSONL corruption on mid-write SIGKILL (Langston Step 2 Q2 caveat).

---

## §3 Whisper.cpp Build Plan (Langston rev2 #1 — confirmed)

### §3.1 Source pinning (Step 2 Rev 2 — locked NOW)

- Clone from `https://github.com/ggml-org/whisper.cpp.git` (upstream renamed org from `ggerganov` → `ggml-org`; old org redirects but pin canonical URL)
- **Pin tag:** `v1.8.4` (published 2026-03-19)
- **Pin commit SHA:** `9386f239401074690479731c1e41683fbbeac557`
- Record both in CHANGES_AND_FIXES + B_NEW_41_COMPLETION_REPORT for reproducibility

### §3.2 Build deps
On Ubuntu 24.04 (Langston box already verified `lsb_release` confirms):
```
apt-get install -y build-essential cmake git curl
```
No SDL, no PortAudio, no FFmpeg dep needed for CLI-only invocation with pre-recorded `.ogg` files. Telegram voice notes are Opus-in-Ogg, which whisper.cpp handles natively via its built-in ffmpeg-free decoder (`whisper-cli` accepts `.ogg`, `.wav`, `.mp3`, `.flac`, etc.).

### §3.3 Build commands
```
cd /opt && git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
git checkout v1.8.4
git rev-parse HEAD  # expected: 9386f239401074690479731c1e41683fbbeac557
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target whisper-cli -j$(nproc)
# Binary: /opt/whisper.cpp/build/bin/whisper-cli
```

### §3.4 Model download
```
cd /opt/whisper.cpp && bash ./models/download-ggml-model.sh small.en
# Result: /opt/whisper.cpp/models/ggml-small.en.bin (~244MB)
```

### §3.5 Smoke test
```
/opt/whisper.cpp/build/bin/whisper-cli -m /opt/whisper.cpp/models/ggml-small.en.bin -f /opt/whisper.cpp/samples/jfk.wav -t 3 -otxt -of /tmp/jfk_test
cat /tmp/jfk_test.txt
# Expected: "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country."
```

### §3.6 Permissions
- Binary owner `root:root`, mode `0755` (readable+executable by all)
- Models dir owner `root:root`, mode `0755`
- Model file owner `root:root`, mode `0644`
- Bridge processes run as `langston` user — both have execute access to whisper-cli via world-x

---

## §4 SSH Attack Surface Review

### §4.1 Threat model
- **Helsinki box compromise** (e.g. SSH key theft from `/home/langston/.ssh/id_ed25519`): attacker gains `deploy`-level read access to staging — logs, pm2 status, localhost API curls. They cannot:
  - Restart services (no `pm2 restart` privilege as deploy? — confirm in §4.3)
  - Write to logs (read-only)
  - Modify database (no direct DB access from `deploy`; DB creds in env files owned by `deploy` though — see §4.3 confirmation needed)
  - Change firewall/iptables (no sudo)
- **Staging box compromise** (independent): unchanged from today. Langston pubkey gives them nothing new.
- **Telegram bot token theft**: unchanged surface. Bot tokens already in `/etc/langston/`.

### §4.2 Pubkey scope hardening (Step 2 Rev 3 — locked IN-BATCH)

**Helsinki static IPv4: `204.168.141.77`** (verified via `curl ifconfig.me` from Helsinki, 2026-05-17).

**Prepend `from="204.168.141.77"` to the authorized_keys line on staging during Step 6.** Free defense-in-depth — closes the pubkey-leak-without-IP-leak scenario. If Helsinki IP changes (Hetzner reassigns), update the authorized_keys line and refresh `from=`. Hetzner CPX IPs are static under normal operation; planned datacenter migration would trigger a coordinated update.

Authorized_keys line format:
```
from="204.168.141.77" ssh-ed25519 <pubkey-content> langston@helsinki
```

### §4.3 Pre-install checks (verify before keygen)
Before keygen on Helsinki, run these on staging via CC's existing SSH:

1. Confirm `/home/deploy/.ssh/` exists; if not, create with `0700` perms owned by `deploy:deploy`.
2. Confirm `deploy` user can:
   - `tail /var/log/dawntrader/out.log` — YES (deploy owns these logs per current architecture)
   - `pm2 list` and `pm2 logs dawntrader` — YES (deploy owns the pm2 instance)
   - `curl localhost:5000/api/health` — YES (no privilege needed)
   - `psql` to Supabase via `DATABASE_URL` — YES (deploy has env file access)
3. **What deploy CANNOT do (intentional):** sudo to root, restart services, modify config files outside `/home/deploy/dawntrader/`, change auth settings.

### §4.4 Host-key pre-pin
From CC side: `ssh-keyscan -t ed25519 188.245.193.8 > /tmp/staging_hostkey` → scp to Helsinki → write to `/home/langston/.ssh/known_hosts`. Verifies first-connection-MITM resistance per Langston rev2 #5.

---

## §5 Telegram getFile Sizing (Langston rev2 #3 — locked)

### §5.1 Limits
- Telegram Bot API `getFile` returns metadata including `file_size` (in bytes). **20MB hard cap** for direct download via bot.
- Voice messages (`message.voice`): always Opus-in-Ogg. Bitrate ~32-64kbps → 60s voice = ~250-500KB. Well under cap.
- Audio uploads (`message.audio`): user-controlled file size. Can exceed 20MB.

### §5.2 Implementation
```python
file_meta = tg_request("getFile", {"file_id": file_id})
if not file_meta.get("ok"):
    fail("getFile metadata fetch failed", file_id=file_id)
    return
file_size = file_meta["result"].get("file_size", 0)
MAX = 20 * 1024 * 1024
if file_size > MAX:
    fail(f"oversize {file_size} > {MAX}", file_id=file_id, file_size=file_size)
    return
file_path = file_meta["result"]["file_path"]
# Download via https://api.telegram.org/file/bot<TOKEN>/<file_path>
```

### §5.3 Empty / zero-byte audio
Edge case: Telegram sometimes serves 0-byte files for transient upload failures. Add check: if downloaded size is 0, fail with `failure_reason: "zero_byte_file"`.

---

## §6 Central Clock Audit (mandatory per CLAUDE.md)

**Zero new Central Clock subscribers added by B-NEW-41.** The bridges run on Hetzner Helsinki and have no access to the staging Central Clock (different box, different process). Whisper invocations are one-shot subprocesses with their own subprocess.run timeouts. The voice archive prune cron is a systemd `OnCalendar` timer (not Central Clock).

**Compliance: PASS.**

---

## §7 Service Restart Plan (Step 6)

```bash
# After deploying new scripts to /usr/local/bin/:
systemctl restart cc-comms-bridge.service
sleep 5
systemctl status cc-comms-bridge.service
journalctl -u cc-comms-bridge.service --since "1 minute ago" --no-pager | tail -30

systemctl restart langston-bridge.service
sleep 5
systemctl status langston-bridge.service
journalctl -u langston-bridge.service --since "1 minute ago" --no-pager | tail -30
```

Both should remain `active (running)` with no exception traces. The worker thread startup logs should appear (`voice worker thread starting`).

---

## §8 Resolved Questions (Step 2 rev2)

**Q3 (ACK phrasing) — LOCKED by Langston:** on successful transcription, bot posts to originating chat:
```
✅ Voice transcribed: "<first 100 chars of transcription>..." — Logged (msg <id>). CC will see at next session start.
```
100-char preview (not 80) so 60s voice notes give enough context. On failure, fallback notice replaces this with the standard failure-reason message per §2.2.

**Q1, Q2, Q4, Q5 — all locked.** See Langston Step 2 review (this batch's `/home/langston/inbox/b_new_41/`).

---

## §9 Remaining Open Questions for Langston (post-Rev1-4)

1. **Pre-existing systemd unit file edits:** I don't expect `cc-comms-bridge.service` or `langston-bridge.service` unit files to need editing — Python script change is hot-loaded on `systemctl restart`. Confirm no edit needed unless `ExecStart` path changes (which it doesn't).

2. **Worker-thread daemon=True:** the scope says `threading.Thread(target=voice_worker, daemon=True).start()`. `daemon=True` means the worker dies cleanly on process exit (no orphan workers when systemd stops the unit). Confirm this is the right call vs. graceful shutdown handler (which would require signal handling). My read: daemon=True is correct for a transcription worker — if the bridge crashes, in-flight transcriptions are abandoned, but the audio is archived so re-transcription is trivial.

3. **ACK message phrasing for voice success:** what should the bot post back to Kyle after a successful transcription? Options:
   - **A.** `✅ Logged (voice, transcribed N chars) — CC will see at next session start.`
   - **B.** `✅ Transcribed: "<first 80 chars>..." — Logged.`
   - **C.** No ACK on voice (rely on the bot's existing `setMessageReaction` 👀 emoji + the existing text-path ACK conventions).

   I lean **B** so Kyle gets immediate visual confirmation the transcription text is correct (catches whisper errors fast). Pushback?

4. **Audio re-transcription mechanism:** If a transcription comes back garbled, Kyle should be able to ask "re-transcribe message <id>" or similar. **Scope decision: out of scope for this batch.** Re-transcription is a follow-up. The archive is in place (per §2 audio_archive_path field) so we can manually `whisper-cli` against the .ogg later if needed.

5. **Cron prune timer vs logrotate-only:** §2.2 scope says BOTH 30-day logrotate AND 5GB ceiling daily cron. Is the dual approach right, or overkill? My read: logrotate handles age-based, cron handles size-based — they cover different threat models (slow steady accumulation vs. sudden spike). Keep both.

---

## §9 Verification Strategy for Step 7 (CC first-pass)

V1–V9 from scope §5. Notes on operational mechanics:

- **V1 (whisper smoke)**: I'll run this myself after the build in §3.5. Doesn't require Kyle.
- **V2 (voice in @CCDTCommsBot DM)**: requires Kyle to record an actual voice note. **Kyle-in-the-loop step.**
- **V3 (voice in topic 21)**: same — Kyle records voice.
- **V4 (voice in @LangstonDTBot DM)**: same — Kyle records voice.
- **V5 (transcription failure → fallback)**: I can test by sending a synthetic 1-second silence `.ogg` via Telegram from CC's side. Doesn't need Kyle.
- **V6 (Langston SSH to staging)**: I'll dispatch Langston to run this himself in Step 8.
- **V7 (per-turn §10.5 check)**: confirms in Step 8 — Langston's next session should successfully `ssh deploy@188.245.193.8 ...`.
- **V8 (bridge restart clean)**: I'll verify via systemd status + journalctl in Step 6.
- **V9 (logrotate works)**: I'll generate a test 0-byte file in the archive dir and force a logrotate run.

**Step 7 is partially Kyle-in-the-loop** (V2, V3, V4). I'll set up the infrastructure, deploy, and ask Kyle to send 2-3 test voice notes. He sees the inbox entries appear in real time + the bot's transcription-confirmation reply.

---

## §10 Risk Items Re-Evaluated

| Original risk | Updated status post-audit |
|---|---|
| Whisper.cpp install fails on Ubuntu 24.04 | LOW — `build-essential cmake` are standard; whisper.cpp builds clean on Ubuntu 22.04 and 24.04 per upstream CI. Smoke test catches breakage. |
| Whisper transcription too slow | LOW — `small.en` benchmarks at 2-3x real-time on a single CPX22-class vCPU. With `-t 3` cap, a 60s voice note transcribes in ~20-30s wallclock. Well under 120s timeout. Fall back to `tiny.en` (40MB, real-time on any CPU) if observed too slow in practice. |
| Telegram permission for voice | NONE — bot voice/audio read is part of standard Bot API. Already-enabled `can_read_all_group_messages` covers it. |
| 120s timeout collides with poll cycle | RESOLVED — worker thread pattern (§2.3) keeps main poll loop unblocked. |
| Langston pubkey compromise | LOW (with deploy posture) — Helsinki compromise gives deploy-level read access on staging, NOT root. Per scope §6. |
| Non-English voice on `small.en` | LOW — Kyle is English-speaker per his confirmation. If observed, swap to `small` (multilingual) in micro-batch. |
| **NEW: Worker thread silent failure** | MITIGATION — wrap voice_worker loop in try/except; on uncaught exception, log it and continue. Worker should NEVER die silently. Add periodic heartbeat log every 60s ("voice worker alive, queue depth=N"). |
| **NEW: Disk fills before logrotate runs** | MITIGATION — cron prune runs daily (faster than logrotate's weekly default). 5GB ceiling on a 40GB disk = 12% headroom. Acceptable. |
| **NEW: Whisper subprocess hangs (model load issue, infinite loop bug)** | MITIGATION — 120s `timeout=` parameter on `subprocess.run`. On timeout, kill subprocess, log failure, post fallback. |

---

## §11 Step 2 Deliverables

- This file (`B_NEW_41_PRE_AUDIT.md`).
- Inspection bundle at `Claude Comms and Packages/Scope Files/b41_bridge_inspect/` (cc-comms-bridge.py + langston-bridge.py local copies for Langston reference).

---

## §12 Step 10 Governance Deliverables (Langston Step 2 Rev 4 — locked)

Step 10 governance updates MUST include:

- **SIM** (in-repo): new "Agent Bridges (Hetzner Helsinki)" subsection with the §1 table including the explicit Langston-SSH escalation chain phrasing.
- **CLAUDE.md §10.5** (in-repo, project-root): rewrite to distinguish CC and Langston per-turn alerts check paths:
  - CC sessions: `ssh root@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl'` (unchanged from B-NEW-40).
  - Langston sessions: `ssh deploy@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl'` (new path enabled by §2.4 keypair install).
  - **NOT** "Read local file" — the queue lives on staging, both sessions reach it via SSH but as different users.
- **`/home/langston/CLAUDE.md`** (Hetzner Helsinki, scp-deployed): matching §10.5 update so the next Langston session picks up the SSH branch on auto-load. Per scope §2.5 dual-update requirement.
- **BATCH_CATALOG.md**: B-NEW-41 row.
- **CHANGES_AND_FIXES.md**: `INFRA-2026-05-17-B` entry with whisper.cpp pin tag (v1.8.4) + commit SHA + `from=` IP restriction note.
- **RUNNING_ISSUES.md**: mark #108 RESOLVED (SSH branch installed); leave #109 open. Add new entry `#110` if recommend follow-up batch: ForceCommand wrapper to restrict Langston pubkey to specific commands (logs read + curl localhost only).

---

**Ready for Langston Step 2 rev2 review.**
