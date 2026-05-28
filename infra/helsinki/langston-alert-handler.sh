#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# B-NEW-46 — Langston alert handler (Helsinki-side)
#
# Invoked by the staging alert dispatcher (scripts/system-alerts.ts
# invokeLangstonForAlert) via SSH:
#   sudo -u langston /usr/local/bin/langston-alert-handler.sh \
#     <alert_id> <severity> <category> <title> <body>
#
# Runs a fresh Langston claude-cli session on the alert, appends the response
# to the invoke log, and RELAYS the response to Telegram topic 21 via
# @LangstonDTBot so Kyle sees a visible confirmation — closing the gap where
# Langston's alert handling was only a silent server-side acknowledgment
# (Kyle directive 2026-05-28).
#
# Failure-visibility invariant (Langston Step-1 review 5a, REQUIRED): every
# path that does NOT produce a normal relayed response still posts SOMETHING
# to Telegram, so Kyle is never left with ambiguous silence after an alert.
#
# Source of truth lives in the repo at infra/helsinki/langston-alert-handler.sh.
# Re-deploy with infra/helsinki/deploy-langston-alert-handler.sh.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

ALERT_ID="${1:-unknown}"
SEVERITY="${2:-unknown}"
CATEGORY="${3:-unknown}"
TITLE="${4:-untitled}"
BODY="${5:-}"

LOG=/var/log/langston-alert-invokes.log
GROUP_CHAT_ID=-1003575211453
TOPIC_ID=21
TG_TOKEN_FILE=/etc/langston/telegram-bot.env   # @LangstonDTBot (5d: NOT @CCDTCommsBot)
OAUTH_FILE=/etc/langston/oauth.env

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s [b-new-46] %s\n' "$(ts)" "$1" >> "$LOG" 2>/dev/null || true; }

# 5d — confirm bot identity: relay MUST use @LangstonDTBot, fail loud if missing.
if [[ ! -f "$TG_TOKEN_FILE" ]]; then
  log "FATAL alert=${ALERT_ID}: ${TG_TOKEN_FILE} missing — cannot relay to Telegram"
  exit 3
fi
# tr strips any stray CR/LF from the token line (defensive; Langston Step-4 nit 2).
TG_TOKEN=$(grep -oP '(?<=TOKEN=).*' "$TG_TOKEN_FILE" | tr -d '\r\n')

# Relay a plain-text message to topic 21 (5b/Q4: NO parse_mode — Markdown
# parse-entity errors silently dropped messages in B-NEW-43 Phase 4).
# Truncates at 3500 chars with a pointer to the full log (Q4).
relay() {
  local text="$1"
  if (( ${#text} > 3500 )); then
    text="${text:0:3500}"$'\n\n[truncated at 3500 chars — full response in '"${LOG}"' on Helsinki]'
  fi
  local http
  http=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${GROUP_CHAT_ID}" \
    -d "message_thread_id=${TOPIC_ID}" \
    --data-urlencode "text=${text}" 2>/dev/null)
  log "relay HTTP=${http} alert=${ALERT_ID}"   # 5c — relay result in same log
}

# 5b/5e — anchor Langston's register + bind the response to this specific alert.
PROMPT="SYSTEM ALERT promoted to active. Your response will be relayed VERBATIM to Kyle on Telegram. Write it as a direct plain-language message to him — no file paths, function names, SQL, table names, or jargon. Open with 're: ${ALERT_ID} ${TITLE}' then state in plain English what the alert means and what action you are taking or recommending (or 'no action needed because ...'). Alert id: ${ALERT_ID}. Severity: ${SEVERITY}. Category: ${CATEGORY}. Title: ${TITLE}. Body: ${BODY}"

# Symmetric existence check on the OAuth file (Langston Step-4 nit 3) — without
# it a missing oauth.env auth-errors claude-cli and 5a fires with a generic
# "exit code N", not flagging it's a credential issue.
if [[ ! -f "$OAUTH_FILE" ]]; then
  log "FATAL alert=${ALERT_ID}: ${OAUTH_FILE} missing — cannot start claude session"
  relay "LANGSTON SPEAKING (alert response) — INVOKE FAILED for ${ALERT_ID} (${TITLE}): the AI helper's credential file is missing on Helsinki, so the alert could not be processed. See ${LOG} on Helsinki."
  exit 6
fi
export CLAUDE_CODE_OAUTH_TOKEN="$(cut -d= -f2- "$OAUTH_FILE" | tr -d '\r\n')"
export HOME=/home/langston
cd /home/langston || { log "FATAL alert=${ALERT_ID}: cannot cd /home/langston"; relay "LANGSTON SPEAKING (alert response) — INVOKE FAILED for ${ALERT_ID} (${TITLE}): handler could not start. See ${LOG} on Helsinki."; exit 4; }
FRESH_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")

log "invoke START alert=${ALERT_ID} sev=${SEVERITY} uuid=${FRESH_UUID}"
RESP=$(timeout 600 /usr/bin/claude -p --session-id "$FRESH_UUID" --model claude-opus-4-7 --permission-mode bypassPermissions "$PROMPT" 2>>"$LOG")
RC=$?

# 5a — failure-case relay (REQUIRED): non-zero exit / timeout.
if [[ $RC -ne 0 ]]; then
  log "invoke FAILED alert=${ALERT_ID} exit=${RC}"
  relay "LANGSTON SPEAKING (alert response) — INVOKE FAILED for ${ALERT_ID} (${TITLE}): the handling session exited with code ${RC} (600s timeout = 124). See ${LOG} on Helsinki."
  exit "$RC"
fi

# 5a — empty-response is also a failure (don't leave Kyle with silence).
# [[:space:]] strips tabs/newlines too, not just spaces (Langston Step-4 nit 4).
if [[ -z "${RESP//[[:space:]]/}" ]]; then
  log "invoke EMPTY alert=${ALERT_ID}"
  relay "LANGSTON SPEAKING (alert response) — ${ALERT_ID} (${TITLE}): the handling session returned no text. See ${LOG} on Helsinki."
  exit 5
fi

printf '%s\n' "$RESP" >> "$LOG"
relay "LANGSTON SPEAKING (alert response): ${RESP}"
log "invoke DONE alert=${ALERT_ID}"
