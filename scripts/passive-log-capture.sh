#!/bin/bash
# Passive Log Capture Script for RTB Observation
# Duration: 30 minutes
# No modifications to running services

LOG_FILE="logs/validation/8.8.4-A3_RTB_Observation_$(date +%Y%m%d_%H%M%S).md"
DURATION_SECONDS=1800  # 30 minutes
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION_SECONDS))

# Counters
SCAN_CYCLES=0
REFRESH_EVENTS=0
PROMOTIONS=0
RTB_REMOVALS=0
DUPLICATE_DETECTIONS=0
REQUALIFICATION_FAILURES=0

# Initialize log file
cat > "$LOG_FILE" << EOF
# RTB Observation Session: 8.8.4-A3
# Started: $(date -Iseconds)
# Duration: 30 minutes
# Mode: Passive Capture (No modifications)
# 
# Components Monitored:
# - ready_to_buy_service.ts
# - fx5-scanner.ts  
# - active-execution-engine.ts
#
# Pattern Filters:
# - [FX5Scanner]
# - [8.8.4-A3][SQE][Validation]
# - [8.8.4-A3][RTB][Refresh]
# - [PROMOTION]
# - [TRADE_CREATE]
# - [RTB_REMOVE]
#
# ============================================
# LOG CAPTURE BEGIN
# ============================================

EOF

echo "Passive log capture started: $LOG_FILE"
echo "Will run for 30 minutes (until $(date -d @$END_TIME))"

# Tail system-health.log and filter patterns
tail -f logs/system-health.log 2>/dev/null | while read line; do
    CURRENT_TIME=$(date +%s)
    if [ $CURRENT_TIME -ge $END_TIME ]; then
        break
    fi
    
    # Check for target patterns
    if echo "$line" | grep -qE '\[FX5Scanner\]|\[8\.8\.4-A3\]|\[PROMOTION\]|\[TRADE_CREATE\]|\[RTB_REMOVE\]'; then
        TIMESTAMP=$(date -Iseconds)
        echo "[$TIMESTAMP] $line" >> "$LOG_FILE"
        
        # Update counters
        if echo "$line" | grep -q '\[FX5Scanner\].*cycle'; then
            ((SCAN_CYCLES++))
        fi
        if echo "$line" | grep -q '\[8\.8\.4-A3\]\[RTB\]\[Refresh\]'; then
            ((REFRESH_EVENTS++))
        fi
        if echo "$line" | grep -q '\[PROMOTION\]'; then
            ((PROMOTIONS++))
        fi
        if echo "$line" | grep -q '\[RTB_REMOVE\]'; then
            ((RTB_REMOVALS++))
        fi
        if echo "$line" | grep -q 'duplicate_pair'; then
            ((DUPLICATE_DETECTIONS++))
        fi
        if echo "$line" | grep -q 'fail.*requalification\|requalification.*fail'; then
            ((REQUALIFICATION_FAILURES++))
        fi
    fi
done &

CAPTURE_PID=$!
echo "Capture PID: $CAPTURE_PID"
echo $CAPTURE_PID > /tmp/passive_capture.pid

echo "Log file: $LOG_FILE"
