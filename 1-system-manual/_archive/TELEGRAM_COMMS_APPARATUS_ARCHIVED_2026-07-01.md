# ARCHIVED — Telegram CC↔Langston Comms Apparatus (removed from CLAUDE.md 2026-07-01)

> **Why archived:** Discord (`COMMS_BACKEND=discord`) has been the live comms backend since the #333 cutover (2026-06-25). On Discord the bots see each other, so CC↔Langston is a normal in-channel post (lead with "Langston") — the entire Telegram SSH-deliver apparatus below is obsolete for day-to-day work. Kyle directed removal from CLAUDE.md 2026-07-01 (superseding the #339 "no-trim until bake" hold). This file preserves the full text verbatim as the **rollback reference**: the Telegram bridges are still running, and rollback is one line — `echo 'COMMS_BACKEND=telegram' > /etc/dawntrader/comms-active.env`. If that rollback is ever exercised, the procedures below are how CC↔Langston works again. When the Telegram bridges are finally decommissioned (per CLAUDE.md §5 rule 18 + `DELETED_COMPONENTS_LOG.md` after a clean Discord bake — the bake check fires 2026-07-02, #348), this archive can itself be retired.
>
> **Live path is Discord** — see CLAUDE.md §6.3/§6.4/§6.5/§6.7/§6.9. The infra detail (bridges, tokens, logs) lives in CLAUDE.md §8. This archive holds ONLY the Telegram-specific CC→Langston delivery procedure (old §6.5) + voice transcription (old §6.8).

---

## (ARCHIVED old §6.5) CC → Langston (AI-to-AI delivery) — Telegram path

**Telegram bot-to-bot is BLOCKED at the platform level.** When `@CCDTCommsBot` posts in topic 21, `@LangstonDTBot`'s `getUpdates` poll never sees it (Telegram rule, no flag bypasses). Cannot reach Langston via Telegram alone.

### old §6.5.0 Large-prompt protocol (Kyle directive 2026-05-08) — FILE-FIRST, NEVER SHORTEN CONTENT

When the prompt to Langston via SSH+claude-cli is more than ~3KB, do NOT send as CLI argument or stdin payload — the Anthropic API hangs unpredictably on large stdin prompts. Use file-first instead. See history doc §6.5.0 for the empirical evidence + GDrive FUSE cache lag context.

**The file-first pattern (mandatory for design asks / scope drafts / multi-question reviews / anything Langston needs to deeply consider):**

1. Write the full design ask as `Claude Comms and Packages/Langston Design Asks/<batch-id>_<topic>_<rev>.md`. Commit for paper trail.
2. **Stage to Langston's inbox via scp** (GDrive FUSE has multi-minute cache lag; pointing Langston at `/mnt/gdrive/...` paths for same-session files causes silent file-not-found):
   ```bash
   ssh root@204.168.141.77 'mkdir -p /home/langston/inbox/<batch>/ && chown -R langston:langston /home/langston/inbox'
   scp <local-file>... root@204.168.141.77:/home/langston/inbox/<batch>/
   ssh root@204.168.141.77 'chown langston:langston /home/langston/inbox/<batch>/*'
   ```
3. Send Langston a SHORT (<1KB) claude-cli prompt pointing at the staged inbox file: `"Read full design ask at /home/langston/inbox/<batch>/<filename>.md. Reply with your architectural call on the questions in §X."`
4. Visibility step in Telegram — post `@LangstonDTBot` mention with a SUMMARY of the ask + inbox path. Kyle sees the summary; full content in the committed markdown file.
5. Watchdog SSH+claude-cli call carries only the short pointer prompt — eliminates the API-hang failure mode.
6. Langston's reply comes back via watchdog stdout → Telegram verbatim relay (per §6.5.1 step 3). Typical reply under 5KB; outbound limits not the issue.

**Never shorten content** — file-first is the proper solution. Cutting content to dodge the hang loses scope items, risks, decisions. NO PATCHES applies to comms infra too.

### old §6.5.0.a — EMBED DIFF SNIPPETS INLINE for code reviews (Kyle directive 2026-05-17)

For code-review dispatches (Step 4), do NOT rely on Langston navigating to files in the repo. EMBED the load-bearing diff snippets directly in the design-ask file. See history doc §6.5.0.a for the B-NEW-42b empirical (30+ minute hangs from `cd /mnt/gdrive` + `git status` on the FUSE mount; embedded-diff dispatch ACK'd in <1 min).

**Pattern:** author the inbox file with NEW/MODIFIED/DELETED labelled sections; include actual BEFORE/AFTER code blocks (5-20 lines per snippet); include explicit "INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. Use `ssh staging` for any repo-side inspection." List the inbox file paths Langston can Read directly (local-FS, fast). Reference `ssh staging 'cd /home/deploy/dawntrader && git ...'` for any inspection beyond embedded snippets.

### old §6.5.0.b — HUNG-INSTANCE CHECKING (Kyle directive 2026-05-17)

CC sessions MUST actively check on background Langston SSH+claude-cli dispatches at 5-10 minute intervals. **DO NOT WAIT 30 MINUTES** before intervening. Typical Langston turnaround is 1-8 minutes; >10 min with 0-byte reply = almost certainly hung. See history doc §6.5.0.b for the 2026-05-17 workflow-violation context.

**Procedure:**
1. At 5-10 min elapsed: `ssh root@204.168.141.77 'pgrep -u langston -f "claude -p" >/dev/null && echo RUNNING ($(ps -p $(pgrep -u langston -f claude | head -1) -o etime= | tr -d " ")) || echo DONE'` + check local reply-file size.
2. If still running past 12 min AND reply file 0 bytes: inspect subprocess state (`ssh root@204.168.141.77 'ps -u langston -o pid,etime,cmd | head -20'`) — look for stuck `bash -c ... cd /mnt/gdrive ... git ...` patterns. Kill: `ssh root@204.168.141.77 'pgrep -u langston -f "claude -p\|git\|bash -c" | xargs -r sudo kill -9'`. Re-dispatch with embedded-diff + no-gdrive instructions per §6.5.0.a.
3. If 2-3 re-dispatch attempts all hang, ESCALATE to Kyle — signals infrastructure regression.

**ScheduleWakeup integration:** schedule first check at 5 min, NOT 4+ min fire-and-forget waits. The 30-second polling-loop pattern is acceptable only with a max-iteration cutoff (e.g. 24 iterations = 12 min total). NEVER let the polling loop run indefinitely.

### old §6.5.1 Two-step pattern (visibility + delivery)

1. **Visibility step** (Kyle sees the request): `cc-comms-bridge send --thread-id 21 --message "@LangstonDTBot ..."` (the @-mention is for Kyle's visual cue; doesn't trigger Langston's bridge).
2. **Delivery step** (Langston actually reasons): direct SSH invocation. Langston's response comes back on stdout. **Always use `--permission-mode bypassPermissions` and a fresh UUID** (see history doc §6.5.1 for the `acceptEdits` hang failure-mode):

    ```bash
    FRESH_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
    ssh root@204.168.141.77 "sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=\$(cat /etc/langston/oauth.env | cut -d= -f2-) && export HOME=/home/langston && cd /home/langston && /usr/bin/claude -p --session-id ${FRESH_UUID} --model claude-opus-4-8[1m] --permission-mode bypassPermissions \"<your message>\"'" > /tmp/langston_reply.txt 2>&1
    ```

3. **Post Langston's response to Telegram — MANDATORY (Kyle directive 2026-05-07)** via `@LangstonDTBot`'s `sendMessage`:

    ```bash
    BOT_TOKEN=$(ssh root@204.168.141.77 'cat /etc/langston/telegram-bot.env | grep -oP "(?<=TOKEN=).*"')
    ssh root@204.168.141.77 "cat /tmp/langston_reply.txt | curl -s -X POST 'https://api.telegram.org/bot${BOT_TOKEN}/sendMessage' \
      -d 'chat_id=-1003575211453' -d 'message_thread_id=21' \
      --data-urlencode 'text@-' -d 'parse_mode=Markdown' | jq .ok"
    ```

   For long replies, chunk at ~3500 chars. Prefix relayed message with `**LANGSTON SPEAKING:**` so Kyle can distinguish Langston's verbatim text from CC's interpretation. **CC's own summary post is supplementary — does NOT replace this verbatim relay.**

**Langston's canonical session UUID** lives in `/home/langston/.langston-bridge-state.json` (key `session_id`) — almost always locked by the bridge daemon's active poll. Use a fresh `uuidgen` per SSH-delivery. Context loss between turns is the trade-off; mitigate by including the relevant prior-turn pointer (commit hash, scope file path, reply file path) in the new prompt.

---

## (ARCHIVED old §6.8) Voice note transcription (B-NEW-41, 2026-05-17) — Telegram path

Both bridges detect voice/audio Telegram messages and transcribe locally via `whisper.cpp v1.8.4` + `ggml-small.en` model. Pipeline: Telegram `getFile` (20MB cap) → `ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le` to WAV → `whisper-cli -t 3` → text. Audio archived 30 days at `/var/log/cc-bridge-voice-archive/{cc,langston}/<YYYY-MM-DD>/<msg_id>.ogg`.

**Where transcription appears:**
- DM with `@CCDTCommsBot`: in `/var/log/cc-bridge-inbox.jsonl` as `kind: "voice_inbound"`. Bot posts ACK preview to chat.
- DM with `@LangstonDTBot`: same transcription, additionally fed to claude-cli as Langston's prompt. Langston replies normally.
- Topic 21: BOTH bots receive the voice. CC posts ACK. Langston transcribes silently (no preview ACK) and only posts back if his reply is non-[SILENT].

**Failure modes:** transcription failure → inbox entry `kind: "voice_inbound_failed"` + `failure_reason` + `stderr_tail`. DM bot posts a "⚠️ Voice transcription failed" notice; topic 21 is silent. Bridge wrapper errors logged to inbox; suppressed from group posts. Read transcriptions via the same `tail /var/log/cc-bridge-inbox.jsonl` pattern.

*(Voice on the live Discord path is handled by the discord-cc-bridge; this whisper.cpp pipeline is the Telegram-rollback transcription route.)*
