#!/usr/bin/env bash
# B-CREDENTIALS-PRIVATE-REPO / #1117 — executable fixture for the incumbent compare reader.
# It drives the committed dt-deploy-drift.sh through its production entry point with ssh, git
# and curl replaced at PATH. No function is called directly and no live endpoint is reached.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/comms-infra/discord/dt-deploy-drift.sh"
T="$(mktemp -d /tmp/dt-drift-capture-test-XXXXXX)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/state"
POSIX_FS=1
case "$(uname -s)" in MINGW*|MSYS*) POSIX_FS=0 ;; esac

PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf 'PASS %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL %s — %s\n' "$1" "$2"; }
check() { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name" "predicate false"; fi; }

cat > "$T/bin/ssh" <<'SH'
#!/usr/bin/env bash
case "$*" in
  *dist/BUILD_SHA*) printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  *dawntrader-deploy.record*)
    printf '%s\n' 'sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' 'deployed_at=2026-11-08T01:31:46Z'
    ;;
  *system-alerts.jsonl*) printf '%s\n' __DT_STORE_EOF__ ;;
  *) echo "unexpected ssh: $*" >&2; exit 91 ;;
esac
SH
cat > "$T/bin/git" <<'SH'
#!/usr/bin/env bash
[ "$1" = ls-remote ] || { echo "unexpected git: $*" >&2; exit 92; }
printf '%s\t%s\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb refs/heads/migration/aws-supabase
SH
cat > "$T/bin/curl" <<'SH'
#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) shift; out="$1" ;;
    -w) shift ;;
  esac
  shift
done
cp -- "$DT_FIXTURE" "$out" || exit 93
printf '%s\n' "${DT_HTTP_STATUS:-200}"
SH
chmod +x "$T/bin/ssh" "$T/bin/git" "$T/bin/curl"

run_fixture() {
  local fixture="$1" status="$2" diag="$3"
  PATH="$T/bin:$PATH" \
  DT_FIXTURE="$fixture" DT_HTTP_STATUS="$status" \
  DT_DRIFT_LOG="$T/drift.log" DT_DRIFT_STATE_DIR="$T/state" \
  DT_DRIFT_FAILED_COMPARE_DIR="$diag" DT_DRIFT_FAILED_COMPARE_RETENTION_MINUTES=1 \
    bash "$SRC" --dry-run > "$T/out" 2>&1
  RC=$?
}

# #744 rider: non-empty AND syntactically non-JSON. A planted old diagnostic proves retention.
printf '<html>upstream unavailable</html>\n' > "$T/non-json.body"
mkdir -p "$T/diag"
printf 'old\n' > "$T/diag/compare-old.body"
touch -d '5 minutes ago' "$T/diag/compare-old.body"
printf 'keep\n' > "$T/diag/unrelated.txt"
run_fixture "$T/non-json.body" 502 "$T/diag"
check "non-JSON fixture exits measurement-failed" test "$RC" -eq 1
FILES=("$T/diag"/compare-*.body)
check "exactly one retained compare body remains" test "${#FILES[@]}" -eq 1
check "captured body is byte-identical" cmp -s "$T/non-json.body" "${FILES[0]}"
if [ "$POSIX_FS" -eq 1 ]; then
  check "captured body is 0600" test "$(stat -c %a "${FILES[0]}")" = 600
  check "diagnostic directory is 0700" test "$(stat -c %a "$T/diag")" = 700
else
  ok "mode assertions deferred to the Linux fixture host"
fi
check "old matching diagnostic is removed" test ! -e "$T/diag/compare-old.body"
check "unrelated file is retained" test -e "$T/diag/unrelated.txt"
check "alert detail names the saved path" grep -Fq "saved_body=${FILES[0]};retention_cleanup=ok" "$T/out"
check "HTTP status is diagnostic in the detail" grep -Fq 'http_status=502' "$T/out"
check "retention bound is named in the detail" grep -Fq 'retention_minutes=1' "$T/out"

# Empty bytes take the existing empty-response branch and create no persistent evidence.
mkdir -p "$T/empty-diag"
: > "$T/empty.body"
run_fixture "$T/empty.body" 200 "$T/empty-diag"
check "empty fixture exits measurement-failed" test "$RC" -eq 1
check "empty fixture does not enter the parser-capture branch" grep -Fq 'DETAIL: compare response empty' "$T/out"
if compgen -G "$T/empty-diag/compare-*.body" >/dev/null; then
  bad "empty fixture saves no body" "unexpected capture"
else
  ok "empty fixture saves no body"
fi

# A valid JSON body remains authoritative even with a non-2xx status: HTTP is diagnostic only.
printf '{"status":"identical","total_commits":0,"commits":[],"files":[]}\n' > "$T/valid.json"
mkdir -p "$T/valid-diag"
run_fixture "$T/valid.json" 503 "$T/valid-diag"
check "valid JSON controls flow, not HTTP status" test "$RC" -eq 0
check "valid JSON reaches ZERO" grep -Fq 'ZERO deployed=' "$T/out"
if compgen -G "$T/valid-diag/compare-*.body" >/dev/null; then
  bad "valid JSON saves no body" "unexpected capture"
else
  ok "valid JSON saves no body"
fi

# A symlinked leaf is refused and no bytes are written through it. Windows Git Bash does not
# provide a POSIX symlink/mode surface, so the strict assertions run on the Linux fixture host.
if [ "$POSIX_FS" -eq 1 ]; then
  mkdir -p "$T/outside"
  ln -s "$T/outside" "$T/link-diag"
  run_fixture "$T/non-json.body" 502 "$T/link-diag"
  check "symlinked diagnostic directory remains measurement-failed" test "$RC" -eq 1
  check "symlink refusal is named" grep -Fq 'saved_body=FAILED(diagnostic directory is a symlink)' "$T/out"
  if compgen -G "$T/outside/*" >/dev/null; then
    bad "symlink refusal writes nothing outside" "unexpected outside file"
  else
    ok "symlink refusal writes nothing outside"
  fi
else
  ok "symlink assertions deferred to the Linux fixture host"
fi

printf 'RESULT: %s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
