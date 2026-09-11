#!/usr/bin/env bash
# B-PRICE-SIDE-BY-JOB r5 P-7a — the Step-8 "before" baseline (D3), taken on staging just before the OBJ-7 deploy.
# Same instruments, same window length, re-run after the restart. Run as root on 188.245.193.8.
set -u
LOG=/var/log/dawntrader/out.log
echo "=== reach: out.log first and last line timestamps ==="
head -c 300 "$LOG" | head -1 | cut -c1-120
tail -1 "$LOG" | cut -c1-120

echo "=== [B78.1][WS_TICK_RATE], last 30 lines (emitter kraken-websocket-adapter.ts:395) ==="
grep -F "[B78.1][WS_TICK_RATE]" "$LOG" | tail -30

echo "=== live subscription audit: [I8C-AUDIT][SUMMARY], last 5 lines (kraken-websocket-adapter.ts:3095; absent = the audit is not emitting in out.log reach, state it) ==="
grep -F "[I8C-AUDIT][SUMMARY]" "$LOG" | tail -5

echo "=== eventLoopLag from /api/metrics/snapshot, 5 samples 10 s apart ==="
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
for i in 1 2 3 4 5; do
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/metrics/snapshot | python3 -c '
import json, sys
def walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            p = path + "." + k if path else k
            if "lag" in k.lower():
                print(p, "=", json.dumps(v)[:200])
            walk(v, p)
    elif isinstance(o, list):
        for i, v in enumerate(o[:20]):
            walk(v, path + "[" + str(i) + "]")
raw = sys.stdin.read()
try:
    walk(json.loads(raw))
except Exception as e:
    print("unparseable response:", raw[:200])
'
  echo "--- sample $i at $(date -u +%FT%TZ)"
  sleep 10
done
