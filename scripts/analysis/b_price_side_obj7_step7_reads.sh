#!/usr/bin/env bash
# B-PRICE-SIDE-BY-JOB r5 OBJ-7 Step-7 first-pass reads, after the restart. Run as root on 188.245.193.8.
# $1 = restart instant 'YYYY-MM-DD HH:MM:SS' (UTC, from the deploy record). Every section filters lines at or after it.
# console.log -> out.log; console.warn and console.error -> error.log. A zero is read against its positive control.
set -u
R="$1"
OUT=/var/log/dawntrader/out.log
ERR=/var/log/dawntrader/error.log
after() { awk -v r="$R" 'substr($0,1,19) >= r'; }
echo "=== identity ==="
cat /home/deploy/dawntrader-deploy.record
echo "BUILD_SHA=$(cat /home/deploy/dawntrader/dist/BUILD_SHA 2>&1)"
su - deploy -c 'pm2 jlist' | python3 -c 'import json,sys; [print(p["name"], p["pm2_env"]["status"], "restarts", p["pm2_env"]["restart_time"], "uptime_ms_since", p["pm2_env"]["pm_uptime"]) for p in json.load(sys.stdin)]'
echo "=== reach: first line at or after R, and the last line ==="
after < "$OUT" | head -1 | cut -c1-120
tail -1 "$OUT" | cut -c1-120
echo "=== P-7k: [PriceCache][HEALTH], last 3 after R ==="
grep -F "[PriceCache][HEALTH]" "$OUT" | after | tail -3
echo "=== P-7h: [EVAL_EXIT], count after R and last 3 ==="
grep -F "[I7-PRICE-FIX][EVAL_EXIT]" "$OUT" | after | wc -l
grep -F "[I7-PRICE-FIX][EVAL_EXIT]" "$OUT" | after | tail -3
echo "=== P-7a: [B78.1][WS_TICK_RATE] after R ==="
grep -F "[B78.1][WS_TICK_RATE]" "$OUT" | after | tail -5
echo "=== Sub OK after R: line count, then distinct internal symbols ==="
grep -F "[8.9.0-B][WS] Sub OK:" "$OUT" | after | wc -l
grep -F "[8.9.0-B][WS] Sub OK:" "$OUT" | after | awk '{print $NF}' | sort | uniq -c | sort -rn | head -40
echo "=== WebSocket write after-set: [I7-WS-A][CACHE_UPDATE] writes per internal symbol after R ==="
grep -F "[I7-WS-A][CACHE_UPDATE]" "$OUT" | after | awk '{for(i=1;i<=NF;i++) if (index($i,"internal_symbol=")==1) print substr($i,17)}' | sort | uniq -c | sort -rn
echo "=== P-7b: Unsub OK after R (out.log) and WS_UNSUB_REJECTED after R (error.log) ==="
grep -F "[8.9.0-B][WS] Unsub OK:" "$OUT" | after | tail -10
grep -F "[P-7b][WS_UNSUB_REJECTED]" "$ERR" | after | wc -l
echo "=== P-7h: PRICE_SKIP_ESCALATION after R (error.log) ==="
grep -F "PRICE_SKIP_ESCALATION" "$ERR" | after | tail -5
echo "=== P-7j: REWARM and KALMAN line counts after R ==="
grep -F "[9.3][REWARM]" "$OUT" | after | wc -l
grep -F "[9.3][KALMAN]" "$OUT" | after | wc -l
echo "=== P-7e: bookTickerDisagreement from /api/xstocks/filter-diagnostics (key path searched, absent is printed) ==="
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/xstocks/filter-diagnostics | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    doc = json.loads(raw)
except Exception:
    print("unparseable response:", raw[:200]); sys.exit(0)
hits = []
def walk(o, path):
    if isinstance(o, dict):
        for k, v in o.items():
            p = path + "." + k if path else k
            if k == "bookTickerDisagreement":
                hits.append((p, v))
            walk(v, p)
walk(doc, "")
print("key found" if hits else "key ABSENT from this response", len(hits))
for p, v in hits:
    print(p, "=", json.dumps(v)[:1500])
'
echo "=== errors after R (error.log): lines matching Error, count and last 5 ==="
grep -E "Error|Unhandled|FATAL" "$ERR" | after | wc -l
grep -E "Error|Unhandled|FATAL" "$ERR" | after | tail -5 | cut -c1-220
