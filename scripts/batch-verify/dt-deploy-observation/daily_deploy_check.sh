#!/usr/bin/env bash
# Daily dt-deploy observation (alert 7814ebc5) — four checks at the objects.
cd /home/deploy/dawntrader || exit 1
echo "== (1a) RECORD tail"
tail -n 9 /home/deploy/dawntrader-deploy.record
REC_SHA=$(grep -E '^sha=' /home/deploy/dawntrader-deploy.record | tail -1 | cut -d= -f2)
REC_RT=$(grep -E '^restart_time=' /home/deploy/dawntrader-deploy.record | tail -1 | cut -d= -f2)
REC_BY=$(grep -E '^deployed_by_claimed=' /home/deploy/dawntrader-deploy.record | tail -1 | cut -d= -f2)
echo "== (1b) LIVE"
LIVE_RT=$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin)
a=[p for p in d if p["name"]=="dawntrader"][0]
print(a["pm2_env"]["restart_time"])')
LIVE_STATUS=$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin)
a=[p for p in d if p["name"]=="dawntrader"][0]
print(a["pm2_env"]["status"])')
BUILD_SHA=$(cat dist/BUILD_SHA 2>/dev/null)
HEAD_SHA=$(git rev-parse HEAD)
echo "record.sha       = $REC_SHA"
echo "dist/BUILD_SHA   = $BUILD_SHA"
echo "git HEAD         = $HEAD_SHA"
echo "record.restart   = $REC_RT   live.restart = $LIVE_RT   status = $LIVE_STATUS"
echo "deployed_by_claimed = '$REC_BY'"
[ "$REC_SHA" = "$BUILD_SHA" ] && echo "  sha record-vs-built: MATCH" || echo "  sha record-vs-built: DRIFT (#647 class - overwrite)"
[ "$REC_SHA" = "$HEAD_SHA" ] && echo "  sha record-vs-HEAD:  MATCH" || echo "  sha record-vs-HEAD:  DRIFT"
if [ "$LIVE_RT" -gt "$REC_RT" ]; then echo "  restart_time HIGHER than record => crash-restart since deploy (delta $((LIVE_RT-REC_RT)))"
elif [ "$LIVE_RT" -lt "$REC_RT" ]; then echo "  restart_time LOWER than record => boot-resurrect"
else echo "  restart_time EQUAL to record => no restart since deploy"; fi
[ -n "$REC_BY" ] && echo "  deployed_by_claimed populated: YES (#656)" || echo "  deployed_by_claimed EMPTY (#656)"
echo "== (2) LOCK"
if [ -e /home/deploy/dawntrader-deploy.lock ]; then echo "  PRESENT:"; ls -l /home/deploy/dawntrader-deploy.lock; else echo "  absent: PASS"; fi
echo "== (3) installed dt-deploy vs git blob at the recorded sha"
INST=$(sha256sum /usr/local/bin/dt-deploy 2>/dev/null | cut -d' ' -f1)
BLOB=$(git show "$REC_SHA:scripts/dt-deploy.sh" 2>/dev/null | sha256sum | cut -d' ' -f1)
echo "  installed /usr/local/bin/dt-deploy = ${INST:-<absent>}"
echo "  git blob  $REC_SHA:scripts/dt-deploy.sh = ${BLOB:-<unreadable>}"
[ -n "$INST" ] && [ "$INST" = "$BLOB" ] && echo "  drift check: MATCH" || echo "  drift check: DIFFERS - read before concluding"
echo "== (4) reflog vs record (LIMIT: record has no history; covers the most recent deploy only)"
git reflog --date=iso -n 6 | cut -c1-140
