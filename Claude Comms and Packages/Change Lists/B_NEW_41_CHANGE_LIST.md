# B-NEW-41 — Change List for Langston Code-Diff Review (Step 4)

**Batch:** B-NEW-41 (voice transcription + Langston staging SSH access)
**Date:** 2026-05-17
**Scope:** `B_NEW_41_SCOPE.md` rev4 (APPROVED)
**Pre-audit:** `B_NEW_41_PRE_AUDIT.md` rev2 (APPROVED)

---

## Files Changed (Hetzner Helsinki — outside repo)

| File | Status | One-liner |
|---|---|---|
| `/usr/local/bin/cc-comms-bridge` | MODIFIED (+225/-3 lines) | Added voice/audio detection, worker thread, whisper-cli subprocess, getFile + 20MB size cap, voice_inbound/voice_inbound_failed inbox entries, 100-char ACK preview. Text path unchanged. |
| `/usr/local/bin/langston-bridge.py` | MODIFIED (+255/-58 lines) | **Major restructure per your Step 2 Rev 1:** ALL inbound (text + voice) now routes through unified `task_q` consumed by single worker thread. Guarantees single-claude-at-a-time invariant. Main poll loop is now pure enqueuer. Added voice processing (download + transcribe + invoke claude). |
| `/opt/whisper.cpp/build/bin/whisper-cli` | NEW | Built from pinned v1.8.4 (SHA `9386f239401074690479731c1e41683fbbeac557`). Smoke-tested with jfk.wav: 8.3s wallclock for 11s audio (~0.75x real-time). |
| `/opt/whisper.cpp/models/ggml-small.en.bin` | NEW | Downloaded via upstream script. sha256: `c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d`. Size 487MB. |
| `/var/log/cc-bridge-voice-archive/` | NEW directory | Owner root:root, mode 0755. Per-date subdirs created at first archive write. |
| `/etc/logrotate.d/cc-bridge-voice-archive` | NEW | 30-day daily retention, compresses old audio. |
| `/usr/local/sbin/cc-voice-archive-prune` | NEW | 5GB ceiling prune script. Finds oldest files, removes until under ceiling. |
| `/etc/systemd/system/cc-voice-archive-prune.service` + `.timer` | NEW | Daily 04:00 UTC, RandomizedDelaySec=300. Active and enabled. |
| `/home/langston/.ssh/id_ed25519` + `.pub` | NEW | ed25519 keypair, no passphrase. Fingerprint `SHA256:gvtY9j7vBwXruVXaGNLhot/lWac/zVt3omObdSTHIQs`. Comment `langston@helsinki`. |
| `/home/langston/.ssh/known_hosts` | NEW | Pre-pinned staging host key (captured from CC side via `ssh-keyscan -t ed25519 188.245.193.8`). |
| `/home/langston/.ssh/config` | NEW | `staging` alias → `deploy@188.245.193.8` IdentityFile=~/.ssh/id_ed25519. |
| `/home/langston/CLAUDE.md` §10.5 | MODIFIED | Rewritten with SSH branch: `ssh deploy@188.245.193.8 'tail /var/log/dawntrader/system-alerts.jsonl'`. |
| `/home/langston/MEMORY.md` | MODIFIED | Synced with B-NEW-41 state. 83 lines (under 200 cap). |

## Files Changed (in-repo, governance only)

| File | Status | One-liner |
|---|---|---|
| `CLAUDE.md` §10.5 | MODIFIED | Updated to split CC (root) vs Langston (deploy) SSH paths per scope §2.5 dual-update mandate. |
| `Claude Comms and Packages/Scope Files/B_NEW_41_SCOPE.md` | NEW | Step 1 deliverable (APPROVED rev4). |
| `Claude Comms and Packages/Scope Files/B_NEW_41_PRE_AUDIT.md` | NEW | Step 2 deliverable (APPROVED rev2). |
| `Claude Comms and Packages/Scope Files/b41_bridge_inspect/cc-comms-bridge.py` | NEW | Pre-B-NEW-41 baseline copy for diff reference. |
| `Claude Comms and Packages/Scope Files/b41_bridge_inspect/cc-comms-bridge.py.new` | NEW | Post-B-NEW-41 bridge code. |
| `Claude Comms and Packages/Scope Files/b41_bridge_inspect/langston-bridge.py` | NEW | Pre-B-NEW-41 baseline copy for diff reference. |
| `Claude Comms and Packages/Scope Files/b41_bridge_inspect/langston-bridge.py.new` | NEW | Post-B-NEW-41 bridge code. |
| `Claude Comms and Packages/Change Lists/B_NEW_41_cc-comms-bridge.diff` | NEW | Full unified diff of cc-comms-bridge changes. |
| `Claude Comms and Packages/Change Lists/B_NEW_41_langston-bridge.diff` | NEW | Full unified diff of langston-bridge changes. |
| `Claude Comms and Packages/Change Lists/B_NEW_41_CHANGE_LIST.md` | NEW | This file. |

## Deferred to Step 10 governance

- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new "Agent Bridges (Hetzner Helsinki)" subsection.
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-41 row.
- `1-system-manual/CHANGES_AND_FIXES.md` — `INFRA-2026-05-17-B` entry with whisper.cpp v1.8.4 pin + model sha256.
- `1-system-manual/PHASE_HISTORY.md` — add subsection if applicable.
- `1-system-manual/RUNNING_ISSUES.md` — mark #108 RESOLVED (SSH branch installed); add #110 (ForceCommand wrapper follow-up).

---

## What Already Verified at Step 3 Completion

- ✅ V1: whisper smoke test (jfk.wav transcribed correctly, 8.3s wallclock)
- ✅ V6: Langston SSH to staging (deploy user; `ssh staging 'hostname && date'` works; tail logs / pm2 list / curl localhost all succeed)
- ✅ V8: both bridges restart clean (cc-comms-bridge tasks=2, langston-bridge tasks=2; voice worker + task worker threads spawned per boot log)
- ✅ Hostkey pre-pin: `/home/langston/.ssh/known_hosts` contains staging entry, StrictHostKeyChecking=yes works
- ✅ IP restriction: authorized_keys line on staging starts with `from="204.168.141.77"`
- ✅ Logrotate config installed; cc-voice-archive-prune.timer active (next fire: tomorrow 04:00 UTC)

## Still to Verify at Step 7 (CC first-pass — Kyle-in-the-loop)

- ⏳ V2: Kyle records voice in @CCDTCommsBot DM → bridge transcribes + writes voice_inbound entry to inbox
- ⏳ V3: Kyle records voice in topic 21 → same
- ⏳ V4: Kyle records voice in @LangstonDTBot DM → Langston processes transcription, returns reply
- ⏳ V5: Failure path (1-second silence or unreadable file) → fallback notice + voice_inbound_failed entry
- ⏳ V7: Langston-side per-turn §10.5 check works via SSH (will verify in your Step 8)
- ⏳ V9: Logrotate runs cleanly (will verify after first archived files exist)

---

## Code Review Focus Areas

1. **Unified task_q in langston-bridge** (lines 273-388 of `.new`) — the Step 2 Rev 1 fix. Worker dequeues, if voice: download + transcribe + invoke claude + send. If text: invoke claude + send. Confirm single-claude-at-a-time invariant holds for all paths.

2. **Atomic JSONL writes** — both bridges write inbox entries via single `f.write(json.dumps + "\n")` calls. POSIX atomicity under PIPE_BUF (4KB) — sufficient for typical entries (<2KB).

3. **Worker heartbeat** — both workers log `task worker alive, queue depth=N` every 60s (or after each task) per scope §10 risk mitigation for silent worker failure.

4. **Voice allowlist** — `should_handle_voice` (langston) and `is_allowed_voice` (cc-comms-bridge) both filter to: DM (private chat with bot) OR (chat_id=-1003575211453 AND thread_id=21). Bot senders explicitly rejected by sender_is_bot check in cc-comms-bridge.

5. **Failure paths** — every transcription failure produces both: (a) JSONL entry with kind=*_failed + failure_reason + stderr_tail, (b) fallback notice to chat per Q3-locked phrasing.

6. **SSH IP restriction** — `from="204.168.141.77"` prepended to authorized_keys line. Helsinki IP confirmed static via `curl ifconfig.me`.

7. **CLAUDE.md §10.5 dual-update** — Langston-side (`/home/langston/CLAUDE.md` line 275+) AND project-root (`G:/.../CLAUDE.md` line 547+) both updated. Distinguish CC (root) vs Langston (deploy) SSH paths.

---

**Ready for Langston Step 4 code-diff review.** Staging the change list + diffs + bridge .new files to inbox.
