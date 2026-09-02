#!/usr/bin/env bash
# B-ALERT-ACTOR-ALLOWLIST (#987) — Step 7 OBJ-6 live checks on staging. Runs as deploy.
set -u
cd /home/deploy/dawntrader
CLI="npm run -s system-alerts --"
TS=$(date -u -d '-2 minutes' +%Y-%m-%dT%H:%M:%SZ)
mk() { $CLI add --triggers-at "$TS" --category one_off --severity info --title "$1" --body "B-ALERT-ACTOR-ALLOWLIST #987 Step-7 live check; delete-safe" 2>&1 | grep -oE '"id": "[0-9a-f-]{36}"' | head -1 | grep -oE '[0-9a-f-]{36}'; }
A=$(mk "p987 check A (CLI ack alias -> canonical)")
B=$(mk "p987 check B (API ack alias -> canonical; API 400)")
C=$(mk "p987 check C (UI select ack)")
echo "created A=$A B=$B C=$C"
echo "== fire-due (promote scheduled -> active; info/one_off does not deliver to Discord)"
$CLI fire-due 2>&1 | tail -3
echo "== NEG 1: retired form refused (expect ONE line, exit 1, no 'Fatal:')"
$CLI ack "$A" --by cc-session-2026-09-02; echo "exit=$?"
echo "== NEG 2: canonical name + appended text refused (Langston L3)"
$CLI ack "$A" --by "langston (transport: langston ssh key via deploy@staging)"; echo "exit=$?"
echo "== NEG 3: resolve with retired form refused BEFORE the evidence gate (no evidence given -> the actor line must be the one printed)"
$CLI resolve "$A" --by cc-session-2026-09-02 --evidence NO-EVIDENCE-GIVEN; echo "exit=$?"
echo "== POS 1: ack A --by cc-analyst -> stored cc-c"
$CLI ack "$A" --by cc-analyst 2>&1 | grep -E '"(state|acknowledged_by)"'
echo "== POS 2: resolve A --by infra-claude -> stored cc-infra, transport cli"
$CLI resolve "$A" --by infra-claude --evidence "server/services/system-alerts.ts:268" 2>&1 | grep -E '"(state|acknowledged_by|resolved_by_claimed|resolved_by_transport)"'
echo "== POS 3: repeat resolve as governance-checker (the checker's pattern) still accepted"
$CLI resolve "$A" --by governance-checker --evidence "server/services/system-alerts.ts:268" 2>&1 | grep -E '"(state|resolved_by_claimed)"'
echo "== API"
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"username":"testuser123","password":"SecurePass123!"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
echo "-- GET actors:"; curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/system-alerts | python3 -c "import json,sys; d=json.load(sys.stdin); print([a['value']+':'+a['tag'] for a in d.get('actors',[])])"
echo "-- POST ack B with retired form (expect 400 + actors):"; curl -s -o /tmp/p987_400.json -w "http=%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"by":"cc-session-2026-09-02"}' "http://localhost:5000/api/system-alerts/$B/acknowledge"; python3 -c "import json; d=json.load(open('/tmp/p987_400.json')); print(d.get('error'), '|', d.get('message','')[:90], '| actors:', len(d.get('actors',[])))"
echo "-- POST ack B with 'Langston (reviewer)' (expect 200, stored langston):"; curl -s -w " http=%{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"by":"Langston (reviewer)"}' "http://localhost:5000/api/system-alerts/$B/acknowledge" | python3 -c "import json,sys; s=sys.stdin.read(); j=json.loads(s.split(' http=')[0]); print('state=',j['alert']['state'],'acknowledged_by=',j['alert']['acknowledged_by'], s.split(' http=')[1].strip())"
echo "C_ID=$C"
