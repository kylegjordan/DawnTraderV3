#!/usr/bin/env bash
# B-ALERT-ACTOR-ALLOWLIST (#987) — Step 7 OBJ-6 live checks on staging. Runs as deploy.
set +x
set -u
cd /home/deploy/dawntrader || exit 1

if [[ -z ${TEST_USER_EMAIL:-} || -z ${TEST_USER_PASSWORD:-} ]]; then
  echo "Set TEST_USER_EMAIL and TEST_USER_PASSWORD for an existing test account." >&2
  exit 1
fi

# Validate sign-in before creating any alerts.
unset -v p987_access_token
if ! p987_access_token=$(
  set -o pipefail
  python3 -c 'import json, os, sys
json.dump({"username": os.environ["TEST_USER_EMAIL"], "password": os.environ["TEST_USER_PASSWORD"]}, sys.stdout)' |
    curl -q -fsS --noproxy '*' --header 'Content-Type: application/json' --data-binary @- \
      --write-out '\n%{http_code}' http://localhost:5000/api/auth/login |
    python3 -c 'import json, re, sys
body, _, status = sys.stdin.read().rpartition("\n")
if not re.fullmatch(r"2[0-9]{2}", status):
    sys.exit(1)
try:
    token = json.loads(body).get("accessToken")
except (ValueError, AttributeError):
    sys.exit(1)
if not isinstance(token, str) or token == "null" or not re.fullmatch(r"[!-~]+", token):
    sys.exit(1)
sys.stdout.write(token)'
); then
  echo "P987 sign-in failed." >&2
  exit 1
fi
unset -v TEST_USER_EMAIL TEST_USER_PASSWORD

api_curl() {
  printf 'Authorization: Bearer %s\n' "$p987_access_token" |
    curl -q -sS --noproxy '*' --header @- "$@"
}

# Check that the API accepts the bearer before any alert operation.
if ! actor_choices=$(
  set -o pipefail
  api_curl --fail --write-out '\n%{http_code}' http://localhost:5000/api/system-alerts |
    python3 -c 'import json, re, sys
body, _, status = sys.stdin.read().rpartition("\n")
if not re.fullmatch(r"2[0-9]{2}", status):
    sys.exit(1)
try:
    actors = json.loads(body)["actors"]
    if not isinstance(actors, list):
        sys.exit(1)
    print([actor["value"] + ":" + actor["tag"] for actor in actors])
except (ValueError, KeyError, TypeError):
    sys.exit(1)'
); then
  echo "P987 could not read the actor list with the configured sign-in." >&2
  exit 1
fi

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
echo "-- GET actors:"
printf '%s\n' "$actor_choices"

echo "-- POST ack B with retired form (expect 400 + actors):"
api_curl --write-out '\n%{http_code}' --header 'Content-Type: application/json' \
  --data-binary '{"by":"cc-session-2026-09-02"}' "http://localhost:5000/api/system-alerts/$B/acknowledge" |
  python3 -c 'import json, sys
body, _, status = sys.stdin.read().rpartition("\n")
d = json.loads(body)
print("http=" + status)
print(d.get("error"), "|", d.get("message", "")[:90], "| actors:", len(d.get("actors", [])))'

echo "-- POST ack B with 'Langston (reviewer)' (expect 200, stored langston):"
api_curl --write-out '\n%{http_code}' --header 'Content-Type: application/json' \
  --data-binary '{"by":"Langston (reviewer)"}' "http://localhost:5000/api/system-alerts/$B/acknowledge" |
  python3 -c 'import json, sys
body, _, status = sys.stdin.read().rpartition("\n")
alert = json.loads(body)["alert"]
print("state=", alert["state"], "acknowledged_by=", alert["acknowledged_by"], status)'
echo "C_ID=$C"
