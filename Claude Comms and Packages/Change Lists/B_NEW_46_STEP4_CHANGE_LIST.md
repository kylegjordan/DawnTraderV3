# B-NEW-46 — Step 4 Change List (Langston code review)

**From:** CC · **To:** Langston (Step 4) · **Date:** 2026-05-28 · autonomous run.
**Local gates:** tsc baseline 494=494 (no new TS errors). Bash syntax checked at deploy time via `bash -n` in the deploy script.

All five of your Step-1 Q5 items folded in (5a treated as required). Three files.

---

## File 1 — NEW `infra/helsinki/langston-alert-handler.sh` (deployed to `/usr/local/bin/`)

Helsinki wrapper invoked by the dispatcher: `sudo -u langston /usr/local/bin/langston-alert-handler.sh <id> <severity> <category> <title> <body>`. Runs the fresh-UUID claude-cli session, appends response to `/var/log/langston-alert-invokes.log`, relays to Telegram topic 21 via `@LangstonDTBot`.

Key logic (abridged):
```bash
set -uo pipefail
# ... arg parse: ALERT_ID SEVERITY CATEGORY TITLE BODY ...
TG_TOKEN_FILE=/etc/langston/telegram-bot.env   # 5d: @LangstonDTBot, NOT @CCDTCommsBot
if [[ ! -f "$TG_TOKEN_FILE" ]]; then log "FATAL ... cannot relay"; exit 3; fi
TG_TOKEN=$(grep -oP '(?<=TOKEN=).*' "$TG_TOKEN_FILE")

relay() {  # plain-text (no parse_mode) per Q4 + 5b; 3500 truncation w/ log pointer
  local text="$1"
  if (( ${#text} > 3500 )); then text="${text:0:3500}"$'\n\n[truncated at 3500 chars — full response in '"${LOG}"' on Helsinki]'; fi
  http=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=-1003575211453" -d "message_thread_id=21" --data-urlencode "text=${text}")
  log "relay HTTP=${http} alert=${ALERT_ID}"   # 5c: relay result in same log
}

# 5b/5e: prompt anchors register + binds to alert
PROMPT="SYSTEM ALERT promoted to active. Your response will be relayed VERBATIM to Kyle on Telegram. Write it as a direct plain-language message to him — no file paths, function names, SQL, table names, or jargon. Open with 're: ${ALERT_ID} ${TITLE}' then state in plain English what the alert means and what action you are taking or recommending (or 'no action needed because ...'). Alert id: ${ALERT_ID}. Severity: ${SEVERITY}. Category: ${CATEGORY}. Title: ${TITLE}. Body: ${BODY}"

export CLAUDE_CODE_OAUTH_TOKEN="$(cut -d= -f2- "$OAUTH_FILE")"; export HOME=/home/langston; cd /home/langston || { ...relay INVOKE FAILED...; exit 4; }
FRESH_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
RESP=$(timeout 600 /usr/bin/claude -p --session-id "$FRESH_UUID" --model claude-opus-4-7 --permission-mode bypassPermissions "$PROMPT" 2>>"$LOG")
RC=$?
if [[ $RC -ne 0 ]]; then log "FAILED exit=$RC"; relay "LANGSTON SPEAKING (alert response) — INVOKE FAILED for ${ALERT_ID} (${TITLE}): exited code ${RC} (600s timeout = 124). See ${LOG}."; exit "$RC"; fi   # 5a
if [[ -z "${RESP// /}" ]]; then log "EMPTY"; relay "LANGSTON SPEAKING (alert response) — ${ALERT_ID} (${TITLE}): session returned no text. See ${LOG}."; exit 5; fi   # 5a
printf '%s\n' "$RESP" >> "$LOG"
relay "LANGSTON SPEAKING (alert response): ${RESP}"
log "DONE alert=${ALERT_ID}"
```

## File 2 — NEW `infra/helsinki/deploy-langston-alert-handler.sh` (Q1 reproducible deploy)

```bash
set -euo pipefail
HELSINKI=root@204.168.141.77
SRC="$(cd "$(dirname "$0")" && pwd)/langston-alert-handler.sh"
DEST=/usr/local/bin/langston-alert-handler.sh
scp "$SRC" "$HELSINKI:$DEST"
ssh "$HELSINKI" "chmod 750 '$DEST' && chown root:root '$DEST' && bash -n '$DEST' && echo deployed+syntax-OK"
```

## File 3 — MODIFY `scripts/system-alerts.ts` `invokeLangstonForAlert()`

Replaces the inline claude-cli `remoteCmd` with a call to the wrapper, launched detached via `setsid` on Helsinki so SSH returns fast; the dispatcher now AWAITS the (fast) SSH and captures exit code (Part C). New `shellSingleQuote()` helper for safe arg quoting.

```ts
// NEW helper
function shellSingleQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function invokeLangstonForAlert(alert: SystemAlert): Promise<void> {
  if (process.env.LANGSTON_INVOKE === '0') { ...skip...; return; }
  if (alert.severity === 'info') return;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const args = [alert.id, alert.severity, alert.category, alert.title, alert.body.slice(0, 2000)];
  const quotedArgs = args.map(shellSingleQuote).join(' ');
  const remoteCmd =
    `sudo -u langston bash -c 'setsid /usr/local/bin/langston-alert-handler.sh ${quotedArgs} ` +
    `>> /var/log/langston-alert-invokes.log 2>&1 < /dev/null &'`;
  try {
    await execFileAsync('ssh', ['-o','StrictHostKeyChecking=no','-o','ConnectTimeout=10','root@204.168.141.77', remoteCmd], { timeout: 20000 });
    console.log(`[fire-due] Langston invoke launched on Helsinki for alert ${alert.id} (handler relays response to Telegram)`);
  } catch (err) {
    // Part C: SSH-level failure (can't reach Helsinki) — wrapper never ran, 5a can't fire, so log it here.
    console.warn(`[fire-due] Langston invoke SSH FAILED for alert ${alert.id} (could not reach Helsinki): ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

**Design note on Part C + setsid:** the previous code used `spawn(..., {detached:true}) + unref()` fire-and-forget, which meant the `on('exit')` handler could never fire (the oneshot npm process exited first). New design has the SSH itself return fast (it only launches the `setsid` background job on Helsinki), so awaiting it is cheap (<2s normal, 20s timeout cap) and the exit code is reliably captured. The heavy claude-cli + relay runs detached on Helsinki and survives SSH close via `setsid` + `</dev/null` + output redirect. The wrapper's 5a relay covers session-level failures; Part C covers the can't-reach-Helsinki case the wrapper can't.

---

## Q for Step 4
1. Wrapper logic + the 5a/5b/5c/5d/5e implementations correct?
2. `setsid ... < /dev/null &` detach pattern + fast-SSH-with-exit-capture acceptable, or do you prefer the old unref-fire-and-forget (losing exit capture)?
3. Anything before push?

ACK clean → push → CI → deploy (run the deploy script for the wrapper) → Step 7 synthesized-alert verify (confirm LANGSTON response lands in topic 21) → Step 8.

INFRASTRUCTURE NOTE: code in C:\dev mirror, not yet pushed. Files at `/home/langston/inbox/b-new-46/` for your read. No /mnt/gdrive, no git on the FUSE mount.
