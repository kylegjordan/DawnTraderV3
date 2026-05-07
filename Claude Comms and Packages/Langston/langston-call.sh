#!/bin/bash
# /usr/local/bin/langston-call
# Watchdog wrapper for langston's `claude -p` invocations.
# Auto-detects hangs (no stdout progress) and retries with fresh UUID.
#
# Usage:
#   langston-call <prompt-file> <output-file> [--first-byte-timeout N] [--idle-timeout N] [--max-attempts N] [--model NAME]
#
# Exit codes:
#   0  = success (output produced, attempt exited cleanly)
#   1  = all attempts exhausted (hang detected on every attempt)
#   2  = usage error
#
# Logs every attempt + cause-of-kill to /var/log/langston-call.log
# Stderr from claude -p captured to /var/log/langston-call.stderr (not log; replaced per attempt)

set -u

PROMPT_FILE=""
OUTPUT_FILE=""
FIRST_BYTE_TIMEOUT=60
IDLE_TIMEOUT=30
MAX_ATTEMPTS=5
MODEL="claude-opus-4-7"
LOG=/var/log/langston-call.log
STDERR_LOG=/var/log/langston-call.stderr

while [ $# -gt 0 ]; do
  case "$1" in
    --first-byte-timeout) FIRST_BYTE_TIMEOUT=$2; shift 2;;
    --idle-timeout)       IDLE_TIMEOUT=$2;       shift 2;;
    --max-attempts)       MAX_ATTEMPTS=$2;       shift 2;;
    --model)              MODEL=$2;              shift 2;;
    -h|--help)
      grep '^#' "$0" | head -25
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

# Set up langston environment
export CLAUDE_CODE_OAUTH_TOKEN="$(cat /etc/langston/oauth.env | cut -d= -f2-)"
export HOME=/home/langston

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG"
}

attempt=0
while [ $attempt -lt $MAX_ATTEMPTS ]; do
  attempt=$((attempt + 1))
  UUID=$(cat /proc/sys/kernel/random/uuid)
  PROMPT_BYTES=$(stat -c%s "$PROMPT_FILE")
  log "attempt=$attempt/$MAX_ATTEMPTS uuid=$UUID prompt_bytes=$PROMPT_BYTES output=$OUTPUT_FILE"

  : > "$OUTPUT_FILE"
  : > "$STDERR_LOG"

  cd /home/langston
  cat "$PROMPT_FILE" | /usr/bin/claude -p \
    --session-id "$UUID" \
    --model "$MODEL" \
    --permission-mode acceptEdits \
    > "$OUTPUT_FILE" 2> "$STDERR_LOG" &
  PID=$!

  last_size=0
  first_byte_elapsed=0
  idle_elapsed=0
  killed=""

  while kill -0 $PID 2>/dev/null; do
    sleep 5
    current_size=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo 0)

    if [ "$current_size" -eq 0 ]; then
      first_byte_elapsed=$((first_byte_elapsed + 5))
      if [ $first_byte_elapsed -ge $FIRST_BYTE_TIMEOUT ]; then
        killed="first-byte-timeout (${FIRST_BYTE_TIMEOUT}s, output still empty — likely API hang)"
        kill -9 $PID 2>/dev/null
        break
      fi
    elif [ "$current_size" -eq "$last_size" ]; then
      idle_elapsed=$((idle_elapsed + 5))
      if [ $idle_elapsed -ge $IDLE_TIMEOUT ]; then
        killed="idle-timeout (${IDLE_TIMEOUT}s no growth, last_size=$current_size)"
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
  final_size=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo 0)

  if [ -n "$killed" ]; then
    log "attempt=$attempt KILLED reason=\"$killed\" output_bytes=$final_size"
    sleep 2
    continue
  fi

  # Success = clean exit AND non-empty output. Even short replies (e.g. "[SILENT]") are valid.
  if [ "$exit_code" -eq 0 ] && [ "$final_size" -gt 0 ]; then
    log "attempt=$attempt SUCCESS exit=$exit_code output_bytes=$final_size uuid=$UUID"
    exit 0
  fi

  STDERR_PREVIEW=$(head -c 300 "$STDERR_LOG" | tr '\n' ' ')
  log "attempt=$attempt FAILED exit=$exit_code output_bytes=$final_size stderr=\"$STDERR_PREVIEW\""
  sleep 2
done

log "EXHAUSTED max_attempts=$MAX_ATTEMPTS. Surfacing failure."
echo "ERROR: langston-call exhausted $MAX_ATTEMPTS attempts (first-byte=${FIRST_BYTE_TIMEOUT}s, idle=${IDLE_TIMEOUT}s). See /var/log/langston-call.log." >> "$OUTPUT_FILE"
exit 1
