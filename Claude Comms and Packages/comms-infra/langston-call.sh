#!/bin/bash
# /usr/local/bin/langston-call (v2 — 2026-05-08, B79.TEC comms-infra fix)
#
# Watchdog wrapper for langston's `claude -p` invocations.
# Streams stream-json events to a sidecar file so tool-use cycles count as
# liveness (v1 used text output, where 30-200s tool-use stalls looked
# identical to API hangs). On clean exit, extracts the final assistant text
# from the sidecar's `{"type":"result"}` envelope into the canonical OUTPUT_FILE.
#
# Designed jointly with Langston 2026-05-08 per CLAUDE.md §6.7 (peer-to-peer
# infra design). Diagnosis recorded in `Claude Comms and Packages/Langston
# Design Asks/B79_TEC_step3_code_review.md` follow-up + RUNNING_ISSUES #84.
#
# Usage:
#   langston-call <prompt-file> <output-file> [--first-byte-timeout N] [--idle-timeout N] [--max-attempts N] [--model NAME]
#
# Defaults (Langston v2 review):
#   --first-byte-timeout 60   (was 240; system-init JSON envelope fires sub-second under stream-json)
#   --idle-timeout 120        (was 30; tool-use cycles can take 30-90s between text events)
#   --max-attempts 5
#
# Exit codes:
#   0 = success (OUTPUT_FILE written from result envelope)
#   1 = exhausted (all attempts hung or failed)
#   2 = usage error
#
# Logs: /var/log/langston-call.log
# Sidecar stream-json: /tmp/langston-stream/<timestamp>-<uuid>.ndjson (last 10 retained)
# Stderr (per attempt): /var/log/langston-call.stderr

set -u

PROMPT_FILE=""
OUTPUT_FILE=""
FIRST_BYTE_TIMEOUT=60
IDLE_TIMEOUT=120
MAX_ATTEMPTS=5
MODEL="claude-fable-5[1m]"
LOG=/var/log/langston-call.log
STDERR_LOG=/var/log/langston-call.stderr
STREAM_DIR=/tmp/langston-stream

while [ $# -gt 0 ]; do
  case "$1" in
    --first-byte-timeout) FIRST_BYTE_TIMEOUT=$2; shift 2;;
    --idle-timeout)       IDLE_TIMEOUT=$2;       shift 2;;
    --max-attempts)       MAX_ATTEMPTS=$2;       shift 2;;
    --model)              MODEL=$2;              shift 2;;
    -h|--help)
      grep '^#' "$0" | head -30
      exit 0;;
    *)
      if [ -z "$PROMPT_FILE" ]; then
        PROMPT_FILE=$1
      elif [ -z "$OUTPUT_FILE" ]; then
        OUTPUT_FILE=$1
      else
        echo "langston-call: unexpected arg: $1" >&2
        exit 2
      fi
      shift;;
  esac
done

if [ -z "$PROMPT_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
  echo "usage: langston-call <prompt-file> <output-file> [--first-byte-timeout N] [--idle-timeout N] [--max-attempts N] [--model NAME]" >&2
  exit 2
fi

if [ ! -r "$PROMPT_FILE" ]; then
  echo "langston-call: cannot read prompt file: $PROMPT_FILE" >&2
  exit 2
fi

# Ensure sidecar dir exists + writable
mkdir -p "$STREAM_DIR" 2>/dev/null || true

export CLAUDE_CODE_OAUTH_TOKEN="$(cat /etc/langston/oauth.env | cut -d= -f2-)"
export HOME=/home/langston

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG"
}

# Rotate sidecar dir: keep newest 10 files, prune the rest.
rotate_sidecar() {
  ls -1t "$STREAM_DIR"/*.ndjson 2>/dev/null | tail -n +11 | xargs -r rm -f
}

attempt=0
while [ $attempt -lt $MAX_ATTEMPTS ]; do
  attempt=$((attempt + 1))
  UUID=$(cat /proc/sys/kernel/random/uuid)
  PROMPT_BYTES=$(stat -c%s "$PROMPT_FILE")
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  SIDECAR="$STREAM_DIR/${TS}-${UUID}.ndjson"
  log "attempt=$attempt/$MAX_ATTEMPTS uuid=$UUID prompt_bytes=$PROMPT_BYTES output=$OUTPUT_FILE sidecar=$SIDECAR (v2:stream-json)"

  : > "$OUTPUT_FILE"
  : > "$SIDECAR"
  : > "$STDERR_LOG"

  cd /home/langston
  /usr/local/bin/langston-log-loaded langston-call || true
  cat "$PROMPT_FILE" | /usr/bin/claude -p \
    --session-id "$UUID" \
    --model "$MODEL" \
    --output-format stream-json \
    --verbose \
    --include-partial-messages \
    --permission-mode acceptEdits \
    > "$SIDECAR" 2> "$STDERR_LOG" &
  PID=$!

  last_size=0
  first_byte_elapsed=0
  idle_elapsed=0
  killed=""

  while kill -0 $PID 2>/dev/null; do
    sleep 5
    current_size=$(stat -c%s "$SIDECAR" 2>/dev/null || echo 0)

    if [ "$current_size" -eq 0 ]; then
      first_byte_elapsed=$((first_byte_elapsed + 5))
      if [ $first_byte_elapsed -ge $FIRST_BYTE_TIMEOUT ]; then
        killed="first-byte-timeout (${FIRST_BYTE_TIMEOUT}s, sidecar empty — claude failed to emit system-init)"
        kill -9 $PID 2>/dev/null
        break
      fi
    elif [ "$current_size" -eq "$last_size" ]; then
      idle_elapsed=$((idle_elapsed + 5))
      if [ $idle_elapsed -ge $IDLE_TIMEOUT ]; then
        killed="idle-timeout (${IDLE_TIMEOUT}s no stream growth, last_size=$current_size)"
        kill -9 $PID 2>/dev/null
        break
      fi
    else
      idle_elapsed=0
      last_size=$current_size
    fi
  done

  wait $PID 2>/dev/null
  exit_code=$?
  final_size=$(stat -c%s "$SIDECAR" 2>/dev/null || echo 0)

  if [ -n "$killed" ]; then
    log "attempt=$attempt KILLED reason=\"$killed\" sidecar_bytes=$final_size"
    rotate_sidecar
    sleep 2
    continue
  fi

  if [ "$exit_code" -ne 0 ] || [ "$final_size" -eq 0 ]; then
    STDERR_PREVIEW=$(head -c 300 "$STDERR_LOG" | tr '\n' ' ')
    log "attempt=$attempt FAILED exit=$exit_code sidecar_bytes=$final_size stderr=\"$STDERR_PREVIEW\""
    rotate_sidecar
    sleep 2
    continue
  fi

  # Extract the final assistant text from the sidecar's result envelope.
  # Schema (smoke-tested 2026-05-08): {"type":"result","subtype":"success","result":"<text>",...}
  if ! command -v jq >/dev/null 2>&1; then
    log "attempt=$attempt SUCCESS-but-no-jq fallback to raw sidecar output_bytes=$final_size uuid=$UUID"
    cp "$SIDECAR" "$OUTPUT_FILE"
    rotate_sidecar
    exit 0
  fi

  jq -r 'select(.type=="result") | .result' "$SIDECAR" > "$OUTPUT_FILE" 2>>"$STDERR_LOG"
  output_bytes=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo 0)

  if [ "$output_bytes" -eq 0 ]; then
    log "attempt=$attempt EXTRACT_FAIL sidecar_bytes=$final_size — no result envelope found"
    rotate_sidecar
    sleep 2
    continue
  fi

  log "attempt=$attempt SUCCESS exit=$exit_code sidecar_bytes=$final_size output_bytes=$output_bytes uuid=$UUID"
  rotate_sidecar
  exit 0
done

log "EXHAUSTED max_attempts=$MAX_ATTEMPTS. Surfacing failure."
echo "ERROR: langston-call exhausted $MAX_ATTEMPTS attempts (first-byte=${FIRST_BYTE_TIMEOUT}s, idle=${IDLE_TIMEOUT}s). See /var/log/langston-call.log + /tmp/langston-stream/ for forensics." >> "$OUTPUT_FILE"
exit 1
