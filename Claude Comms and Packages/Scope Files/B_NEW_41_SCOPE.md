# B-NEW-41 — Voice Transcription (CCDT + Langston bridges) + Langston Staging SSH

**Batch ID:** B-NEW-41
**Type:** Quick-win infrastructure batch (two bundled deliverables)
**Author:** Claude Code
**Date:** 2026-05-17
**Branch:** `migration/aws-supabase`

---

## §1 Background

Kyle directive 2026-05-17: combine two independent quick wins into a single batch:

1. **Voice transcription for both bots.** When Kyle leaves a voice note in DM with `@CCDTCommsBot` or in topic 21 of the Dawn Trader HQ group, the cc-comms-bridge detects the voice message, downloads the audio, transcribes it locally via whisper.cpp, and writes the transcribed text to `/var/log/cc-bridge-inbox.jsonl` as if it were a text message — so CC sees the content via its existing inbox-tail pattern. Same wiring for `@LangstonDTBot`: voice → transcribe → invoke claude-cli with the transcribed text as the prompt.

2. **Langston SSH access to staging.** Resolves the B-NEW-40 Step 8 architectural gap (RUNNING_ISSUES #108). Generates an ed25519 keypair on the Langston Helsinki box as the `langston` user, installs the pubkey into `/home/deploy/.ssh/authorized_keys` on staging (188.245.193.8) — granting `deploy`-user SSH access (least-privilege per Q5 reconsideration). Install performed via CC's existing root SSH session to staging (per §2.4). Updates Langston's CLAUDE.md / MEMORY so he knows he can SSH directly to staging for live verification.

**Transcription engine choice:** self-host whisper.cpp per Kyle 2026-05-17. No new external API dependencies. ~244MB English-only `small.en` model is the recommended starting tier (≈real-time-ish on the CPX22 4 vCPU; high accuracy for Kyle's typical voice-note length of 10-60s).

**SSH user choice:** `deploy` per Kyle 2026-05-17 (revised from initial `root` after Langston Step 1 defense-in-depth pushback). Least-privilege posture: `deploy` already has logs + pm2 + localhost-curl access — everything Langston needs for Step 8 verification. If Langston later needs a specific extra capability, add via group/sudoers rather than full root.

---

## §2 Objectives

### 2.1 Whisper.cpp install on Langston Helsinki box (`204.168.141.77`)

- Build `whisper.cpp` from upstream source (`ggerganov/whisper.cpp`) at a pinned recent stable tag (e.g. `v1.7.5` or whatever is current at install time — pin and record in CHANGES_AND_FIXES).
- **Build system note (Langston revision 1):** upstream migrated `Makefile` → `CMake` and renamed `main` → `whisper-cli`. Install build deps `build-essential cmake` (not just gcc/make). Expected binary path post-build: `/opt/whisper.cpp/build/bin/whisper-cli`.
- Download `ggml-small.en.bin` (≈244MB English-only model) to `/opt/whisper.cpp/models/`.
- Smoke-test transcription with a known sample audio file (use one of whisper.cpp's `samples/jfk.wav` — bundled). Record wallclock + transcript accuracy as baseline.
- Install root path: `/opt/whisper.cpp/`. Owner: `root:root` for binary + model; readable + executable by all users (so both bridges running as `langston` can invoke).

### 2.2 Voice-message handling in `cc-comms-bridge`

- Extend the existing `getUpdates` poll loop to detect `update.message.voice` (Telegram voice messages, `.ogg` Opus codec) AND `update.message.audio` (uploaded audio files, various codecs).
- **Explicit allowlist (Langston Q4):** only process voice from DM-with-bot OR topic 21 of group `-1003575211453`. Any other chat/topic → skip silently (no transcription, no inbox entry). Defaults-to-off; any future topic must opt in via explicit code change.
- **Size cap (Langston revision 3):** before download, inspect `getFile` metadata. If `file_size > 20MB` (Telegram Bot API ceiling for `getFile`), skip download, write `kind: "voice_inbound_failed"` entry with `failure_reason: "oversize"`, post fallback notice.
- On detection: call Telegram `getFile` API with `file_id` to obtain `file_path`, then download via `https://api.telegram.org/file/bot<TOKEN>/<file_path>` to `/tmp/voice-<msg_id>.ogg`.
- **Whisper invocation:** `subprocess.run(['/opt/whisper.cpp/build/bin/whisper-cli', '-m', '/opt/whisper.cpp/models/ggml-small.en.bin', '-f', <audio_path>, '-t', '3', '-otxt', '-of', <txt_out_prefix>], timeout=120)`. CPU thread cap `-t 3` per Langston Q1: leaves 1 vCPU free for bridge poll loop + claude-cli on the 4-vCPU CPX22. Capture stderr for failure logging.
- **Concurrency policy (Langston revision 4):** at-most-1-concurrent whisper invocation per bridge; queued FIFO (Python `queue.Queue`); bridge poll loop continues during processing (subprocess does not block the main loop because the bridge spawns a worker thread to consume the queue). Document this in the bridge file header.
- Write the result to `/var/log/cc-bridge-inbox.jsonl` with `kind: "voice_inbound"` discriminator and the following fields per Langston Q2:
  - `schema_version: 1`
  - `text` (transcribed content)
  - `transcription_source: "whisper.cpp/ggml-small.en"`
  - `transcription_duration_ms` (whisper.cpp wallclock)
  - `audio_duration_s` (from whisper.cpp output or ffprobe)
  - `audio_archive_path` (absolute path to archived `.ogg`)
  - `file_id` (Telegram file_id, for re-download if needed)
- Archive the original audio to `/var/log/cc-bridge-voice-archive/YYYY-MM-DD/<msg_id>.ogg` for debugging / re-transcription.
  - 30-day retention via logrotate AND total-size ceiling 5GB enforced by daily cron `cc-voice-archive-prune.timer` (oldest-first prune if exceeded — insurance against unexpected volume spike).
- On transcription failure (whisper.cpp non-zero exit, timeout > 120s, oversize, or empty output): write a `kind: "voice_inbound_failed"` entry to inbox log with: `schema_version: 1`, `failure_reason`, `whisper_exit_code`, `stderr_tail` (last ~500 bytes), `file_id`, `audio_archive_path` (if downloaded before failure). AND post a fallback notice back to the originating chat ("Voice transcription failed — please retry as text or paste the message again").
- Mirror outbound: when CC posts via `cc-comms-bridge send`, behavior unchanged.

### 2.3 Voice-message handling in `langston-bridge.py`

- Same detection logic as 2.2 for `update.message.voice` and `update.message.audio`.
- Same allowlist (DM-with-@LangstonDTBot or topic 21 of `-1003575211453`).
- Same size cap (20MB), same `whisper-cli` invocation with `-t 3` CPU cap, same 120s budget.
- Same at-most-1-concurrent-per-bridge FIFO queue policy (independent queue from cc-comms-bridge).
- **On success:** Substitute the transcribed text as the prompt to `claude -p --session-id <UUID> --model claude-opus-4-7 --permission-mode bypassPermissions` (same flow as today's text path).
- Mirror to `/var/log/cc-bridge-inbox.jsonl` with `kind: "langston_inbound_voice"` so CC has visibility. Entry shape includes all Q2 fields (schema_version, text, transcription_source, transcription_duration_ms, audio_duration_s, audio_archive_path, file_id) PLUS Langston's stdout reply for full round-trip auditability.
- **On failure:** post fallback notice to chat, write `kind: "langston_inbound_voice_failed"` log entry with same failure fields as 2.2.

### 2.4 Langston SSH keypair generation + install

- On Langston Helsinki box, as `langston` user: `ssh-keygen -t ed25519 -N "" -f /home/langston/.ssh/id_ed25519 -C "langston@helsinki"`.
- Capture pubkey content.
- **Host-key pre-pin (Langston Step 1 item 5):** before any `accept-new` SSH from Langston box, capture staging host key from CC's side via `ssh-keyscan -t ed25519 188.245.193.8`, then write directly to `/home/langston/.ssh/known_hosts`. Defeats first-connection MITM even if practical risk is low.
- On staging (`188.245.193.8`), as `root`: append pubkey to `/home/deploy/.ssh/authorized_keys` (preserve existing entries; do not overwrite). Verify file mode `0600`, dir mode `0700`, ownership `deploy:deploy`.
- Test from Langston Helsinki: `sudo -u langston ssh deploy@188.245.193.8 'hostname && date'` — confirm returns staging hostname.
- Verify Langston can read what he needs as `deploy`: `tail /var/log/dawntrader/out.log`, `pm2 list`, `curl -s localhost:5000/api/health`. If any specific cap missing, file as a follow-up RUNNING_ISSUES entry (add via group/sudoers later, not by escalating to root now).
- Update `/home/langston/.ssh/config` (as `langston` user) with `Host staging` alias → `User deploy`, `HostName 188.245.193.8`, `IdentityFile ~/.ssh/id_ed25519`.

### 2.5 Update Langston's CLAUDE.md + MEMORY.md for new capabilities

- Add to `/home/langston/CLAUDE.md` (Langston-side) a new section: "Staging SSH access — use `ssh deploy@188.245.193.8 ...` (or `ssh staging ...`) for live verification of logs, API endpoints, PM2 state. Read-only by design (deploy user). Unblocks Step 8 second-pass verification without CC-paste-evidence workaround."
- **Dual-update requirement (Langston revision 8):** in the SAME commit, update BOTH `/home/langston/CLAUDE.md` (Hetzner Helsinki, via scp) AND `G:/My Drive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/CLAUDE.md` §10.5 (project root, via Edit). This prevents CC-side / Langston-side drift on the per-turn alerts check protocol.
- New §10.5 wording for Langston-side: per-turn check runs `ssh deploy@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl 2>/dev/null'` and parses surfaceable entries. CC-side wording unchanged (CC continues to ssh as root for its own ops + reading the queue).
- Sync `/home/langston/MEMORY.md` so the next Langston session has the SSH capability + new §10.5 path in immediate context.

### 2.6 systemd service updates (idempotent reload)

- `langston-bridge.service`: no service-file change expected (Python script changes are loaded on restart). Restart the unit after deploying the new Python.
- `cc-comms-bridge.service`: same.
- Add a sanity check after restart: tail journal for 30s, confirm no startup exceptions.

### 2.7 Whisper.cpp install on staging? (DECISION RECORD — NOT IN SCOPE)

**OUT OF SCOPE for B-NEW-41.** Whisper.cpp lives only on the Langston Helsinki box because that's where both bridges run. No need on staging.

---

## §3 Out of Scope

- Whisper.cpp tier upgrade beyond `small.en` (deferred — start small, upgrade if accuracy proves insufficient).
- Multilingual whisper (Kyle is English-speaker; `small.en` is faster + more accurate for English than the multilingual `small`).
- Voice note responses FROM CC / Langston back to Kyle (text-to-speech is a future batch; outbound stays text-only).
- Voice notes in group topic 28 (Design) or other topics — only DMs + topic 21 (the existing comm surfaces).
- Re-transcription of historical voice notes (archive starts fresh; pre-batch voice messages were not captured).
- Replacing OpenClaw's image-relay infrastructure for voice notes (orthogonal — image relay is unchanged).
- Any change to the trading system itself (no DB writes, no strategy changes, no algorithm changes).

---

## §4 Files Affected (SIM consult deferred to Step 2 pre-audit)

**Code:**
- `/usr/local/bin/cc-comms-bridge` (or `cc-comms-bridge.py`) on Hetzner Helsinki — voice detection + transcription + inbox-write logic
- `/usr/local/bin/langston-bridge.py` on Hetzner Helsinki — voice detection + transcription + claude-cli substitution

**Config:**
- `/etc/systemd/system/cc-comms-bridge.service` — likely unchanged; restart only
- `/etc/systemd/system/langston-bridge.service` — likely unchanged; restart only
- New: `/etc/logrotate.d/cc-bridge-voice-archive` — 30-day retention on voice audio archive

**Filesystem:**
- New: `/opt/whisper.cpp/` (binary + models)
- New: `/var/log/cc-bridge-voice-archive/` (with subdir per date)
- New: `/home/langston/.ssh/id_ed25519` + `.pub` + `config`
- Updated: `/home/deploy/.ssh/authorized_keys` on staging (append pubkey, don't overwrite; mode `0600`, dir `0700`, owner `deploy:deploy`)

**Governance docs (in-repo):**
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new bridge-side entries for voice-handling + Langston SSH path
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-41 row
- `1-system-manual/CHANGES_AND_FIXES.md` — INFRA-2026-05-17-B entry
- `1-system-manual/RUNNING_ISSUES.md` — #108 partially RESOLVED (SSH branch installed), #109 unchanged
- `CLAUDE.md` — §10.5 updated with Langston-side SSH branch

**Out-of-repo (on Hetzner Helsinki box):**
- `/home/langston/CLAUDE.md` — staging SSH capability note added
- `/home/langston/MEMORY.md` — synced

---

## §5 Verification Matrix

| # | Verification Criterion | Method |
|---|------------------------|--------|
| V1 | Whisper.cpp builds + runs on Langston Helsinki box | Smoke test: pre-recorded 10s English audio sample produces correct transcription text |
| V2 | Voice note in @CCDTCommsBot DM → transcription appears in inbox log | Kyle records a 15-30s voice note in DM with @CCDTCommsBot; within 60s, a `kind: "voice_inbound"` entry appears in `/var/log/cc-bridge-inbox.jsonl` with non-empty `text` field |
| V3 | Voice note in @CCDTCommsBot via topic 21 → same | Kyle records voice in topic 21; same `voice_inbound` entry pattern in the inbox log |
| V4 | Voice note in @LangstonDTBot DM → Langston processes the transcription | Kyle records 15-30s voice note in DM with @LangstonDTBot; Langston returns a coherent reply within 5 minutes; reply posts to topic 21 per existing flow |
| V5 | Transcription failure → fallback notice to Kyle | Test by sending a 1-second silence or an unreadable file; bridge writes `..._failed` entry to inbox log AND posts a fallback notice to the chat |
| V6 | Langston can SSH to staging | From Langston Helsinki, `sudo -u langston ssh deploy@188.245.193.8 'tail -3 /var/log/dawntrader/out.log'` (or `sudo -u langston ssh staging 'tail -3 /var/log/dawntrader/out.log'` via the config alias) returns log lines successfully |
| V7 | Langston-side per-turn §10.5 check works via SSH | On next Langston dispatch after deploy, his per-turn check successfully reads `/var/log/dawntrader/system-alerts.jsonl` from staging (file is readable + parseable JSONL, regardless of entry count — does NOT require non-empty queue per Langston revision 6). Test pre-seeds an FYI entry if needed for surfacing confirmation. |
| V8 | Both bridges restart cleanly after deploy | `systemctl status cc-comms-bridge.service langston-bridge.service` both `active (running)` with no startup errors in 60s journal tail |
| V9 | Voice archive logrotate works | Verify `/etc/logrotate.d/cc-bridge-voice-archive` rotates a test file; no permission errors |

---

## §6 Risk Assessment

| Risk | Mitigation |
|------|------------|
| Whisper.cpp install fails on Ubuntu 24.04 / armhf-vs-x86 / dependency hell | Use upstream prebuilt where available, OR install build deps (gcc, make, libsdl2-dev — actually no SDL needed for our CLI-only path). Pin to a known-working tag. |
| Whisper transcription takes too long on real voice notes (> 120s for a 60s note) | Empirical smoke test first. If too slow, fall back to `ggml-tiny.en` (39MB, real-time on tiny CPUs). |
| Telegram bot doesn't have voice-message-read permission | Voice messages are part of standard bot API — no special permission needed beyond `can_read_all_group_messages` already enabled. |
| The 120s timeout window collides with the bridge's Telegram long-poll cycle | Run transcription in a worker thread / subprocess so the main poll loop isn't blocked. CRITICAL: the bridge MUST keep polling Telegram during transcription so we don't miss other inbound messages. |
| Langston pubkey gets compromised | Mitigated by usual SSH-key hygiene + defense-in-depth via `deploy` user choice (Q5 reconsidered post-Langston-pushback). Pubkey only grants `deploy`-level read access (logs, pm2 read, localhost curl) — strictly LESS than CC's root path. Compromise of Helsinki box does NOT escalate to staging root. Materially smaller blast radius than the originally-proposed root posture; the whole point of the Q5 reconsideration. |
| Voice notes in non-English languages get garbage transcription on `small.en` | Kyle confirmed English-speaking. If multilingual ever becomes needed, swap model to `small` (multilingual) in a future micro-batch. |

---

## §7 Workflow Steps (this batch)

1. **Step 1 — Scope draft + Langston sign-off.** This file → Langston review.
2. **Step 2 — Pre-audit.** SIM consult for both bridges + SSH attack surface review. Langston review.
3. **Step 3 — Implementation.** Two phases:
   - **3a:** Whisper.cpp build + model + smoke test (no bridge changes yet).
   - **3b:** Bridge code changes (cc-comms + langston) + service restart.
   - **3c:** SSH keypair generation + staging install + Langston CLAUDE.md/MEMORY update.
4. **Step 4 — Code-diff review (Langston).** Change list package.
5. **Step 5 — Push + CI.** No CI implications expected (changes are all on Hetzner Helsinki, not in the repo's main code tree). The in-repo governance docs ARE in the CI path; CI is currently red on pre-existing #39, so the bar is "no new red."
6. **Step 6 — Deploy.** Restart both systemd units on Hetzner Helsinki. Update staging authorized_keys.
7. **Step 7 — First-pass verification (CC).** Run V1–V9 from §5.
8. **Step 8 — Second-pass verification (Langston).** Langston dispatches from his own session to verify the new SSH path is alive + run V6/V7 himself + one-time pass over `/var/log/dawntrader/` to map actual log layout (Langston observation 2 — baseline reference for future Step 8s).
9. **Step 9 — Iterate if any objective not met.** Expected no-op but documented for canonical 11-step workflow integrity (Langston revision 7).
10. **Step 10 — Governance updates.** SIM, BATCH_CATALOG, CHANGES_AND_FIXES, RUNNING_ISSUES, CLAUDE.md.
11. **Step 11 — Completion report.** Standard format.

---

## §8 Step 1 Open Questions — RESOLVED (rev4, 2026-05-17)

All five questions answered by Langston Step 1 review + Kyle Q5 reconsideration:

1. **Subprocess vs thread** — RESOLVED: subprocess with `-t 3` CPU thread cap (Langston). Documented in §2.2 + §2.3.
2. **Inbox-log shape** — RESOLVED: schema_version + transcription_duration_ms + audio_duration_s + audio_archive_path + file_id + (on fail) whisper_exit_code + stderr_tail. Documented in §2.2.
3. **30-day retention** — RESOLVED: 30 days + 5GB total-size ceiling via daily cron prune. Documented in §2.2.
4. **Topic 28 / explicit allowlist** — RESOLVED: explicit allowlist (DM-with-bot + topic 21 only). Documented in §2.2 + §2.3.
5. **SSH user** — RESOLVED: `deploy` (Kyle revised from initial `root` after Langston defense-in-depth pushback). Documented in §1 + §2.4.

## §9 Step 1 Additional Revisions Applied (rev4)

All eight Langston revisions integrated:

1. ✅ Whisper binary path corrected (`whisper-cli` not `main`, CMake not Make) — §2.1.
2. ⏳ Bridge file paths + concurrency model — deferred to Step 2 pre-audit (will inspect actual code).
3. ✅ Telegram getFile 20MB size cap — §2.2.
4. ✅ At-most-1-concurrent FIFO queue concurrency policy — §2.2 + §2.3.
5. ✅ ssh-keyscan host-key pre-pin from CC side first — §2.4.
6. ✅ V7 rewritten as "file readable + parseable, regardless of count" — §5.
7. ✅ Step 9 (Iterate) added to workflow — §7.
8. ✅ Dual-update CLAUDE.md (Langston-side + project-root) in same commit — §2.5.

---

**rev4 ready for Langston confirmation pass before Step 2 pre-audit.**
