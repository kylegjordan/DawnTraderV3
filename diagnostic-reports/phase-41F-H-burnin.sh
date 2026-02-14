#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:5000"
USER="testuser123"
PASS="SecurePass123!"
DUR_SECS="${1:-1800}"   # default 30m; pass 1200 for 20m
INTERVAL=15             # poll every 15s
LOOPS=$(( DUR_SECS / INTERVAL ))

echo "⏳ Phase 41F-H burn-in for ${DUR_SECS}s (${LOOPS} loops @ ${INTERVAL}s)"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"'"$USER"'","password":"'"$PASS"'"}' | jq -r '.accessToken')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "❌ Failed to get token"; exit 1
fi
echo "🔐 Token acquired"

START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CRIT_COUNT=0
WARN_COUNT=0
RECOVERY_COUNT=0
MAX_LAT_MS=0
MEM_PEAK_MB=0

# Determine script directory and set paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SCRIPT_DIR/phase-41F-H-burnin-log.ndjson"
REPORT="$SCRIPT_DIR/phase-41F-H-stability-burnin.md"
: > "$LOG"

for i in $(seq 1 $LOOPS); do
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # 1) Health anomalies
  ANOM=$(curl -s "$BASE/api/health/anomalies?limit=50" -H "Authorization: Bearer $TOKEN")
  ACOUNT=$(echo "$ANOM" | jq '.anomalies | length')
  ACRIT=$(echo "$ANOM" | jq '[.anomalies[]? | select(.level=="critical")] | length')
  AWARN=$(echo "$ANOM" | jq '[.anomalies[]? | select(.level=="warning")] | length')

  # track counts (rolling window)
  CRIT_COUNT=$(( CRIT_COUNT + ACRIT ))
  WARN_COUNT=$(( WARN_COUNT + AWARN ))

  # extract last broadcast latency if present
  LAT=$(echo "$ANOM" | jq -r '.anomalies[]? | select(.component=="broadcast" and .metric=="latency") | .value' | tail -n1)
  if [[ "$LAT" =~ ^[0-9]+$ ]] && [[ $LAT -gt $MAX_LAT_MS ]]; then
    MAX_LAT_MS=$LAT
  fi

  # 2) Recovery timeline
  RECV=$(curl -s "$BASE/api/health/recovery/log?limit=25" -H "Authorization: Bearer $TOKEN")
  RCOUNT=$(echo "$RECV" | jq '.recoveries | length')
  RECOVERY_COUNT=$(( RECOVERY_COUNT + RCOUNT ))

  # 3) System health snapshot (optional, if available)
  SYS=$(curl -s "$BASE/api/system/health" -H "Authorization: Bearer $TOKEN" || echo '{}')

  # 4) Server memory/process probe (Replit friendly best-effort)
  MEM=$(ps -o rss= -p $(pgrep -f "node .*server" | head -n1) 2>/dev/null || echo 0)
  MEM_MB=$(( MEM / 1024 ))
  if [[ $MEM_MB -gt $MEM_PEAK_MB ]]; then
    MEM_PEAK_MB=$MEM_MB
  fi

  # log line
  jq -n --arg ts "$TS" \
        --argjson ac "$ACOUNT" --argjson aw "$AWARN" --argjson aci "$ACRIT" \
        --argjson rc "$RCOUNT" --argjson lat "${LAT:-0}" --argjson mem "$MEM_MB" \
        '{ts:$ts, anomalies:$ac, warnings:$aw, criticals:$aci, recoveries:$rc, lastLatencyMs:$lat, memMB:$mem}' \
        >> "$LOG"

  echo "[$TS] anomalies=$ACOUNT warn=$AWARN crit=$ACRIT recov+=$RCOUNT lat=${LAT:--}ms mem=${MEM_MB}MB"
  sleep $INTERVAL
done

END_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Summaries (use -s to slurp NDJSON into array)
TOTAL_REC=$(jq -s '[.[] | .recoveries] | add // 0' "$LOG")
TOTAL_WARN=$(jq -s '[.[] | .warnings] | add // 0' "$LOG")
TOTAL_CRIT=$(jq -s '[.[] | .criticals] | add // 0' "$LOG")

cat > "$REPORT" <<EOF
# Phase 41F-H Stability Burn-In Report

**Window:** $START_TS → $END_TS  
**Duration:** ${DUR_SECS}s  
**Polling:** every ${INTERVAL}s

## Roll-up
- Total warnings (sum across polls): ${TOTAL_WARN}
- Total criticals (sum across polls): ${TOTAL_CRIT}
- Total recoveries observed (sum across polls): ${TOTAL_REC}
- Max observed broadcast latency: ${MAX_LAT_MS} ms
- Peak server memory (RSS): ${MEM_PEAK_MB} MB

## Pass/Fail Criteria
- Critical anomalies: **0** required
- Warnings: **≤ 3** total across window
- Recoveries: **0** after first 60s warm-up
- Max broadcast latency: **< 100 ms** after warm-up
- Memory: **no monotonic creep** (peak stable within a small band)

EOF

echo "✅ Burn-in complete. Report at: $REPORT"
