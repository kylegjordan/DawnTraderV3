#!/bin/sh
# token-watch — the access the off-box upload needs, and nothing more. (B-TOKEN-WATCH-STORAGE OBJ-2, P3)
# Run as root on staging. Idempotent. EXITS NON-ZERO ON ANY FAILED ASSERTION — it proves, it does not print.
#
# ⛔ ORDER MATTERS (Langston, Step 2 condition 1): the r-- entry goes on the FILES only, and the directory's
#    rwx is applied LAST, so a recursive r-- can never overwrite it (without rwx the uploader cannot unlink).
# ⛔ The store's existing ACL is ADDED TO, never replaced. cold/ already carries a default ACL
#    (user::rwx, user:deploy:r-x, group::---, mask::r-x, other::---); this adds one default entry.
# ⚠️ offbox/ inherits the store root's default ACL, so deploy can read the manifest. Decided, not fenced:
#    it holds file names, B2 file ids, hashes and sizes — no secret.
set -eu
ROOT=/var/lib/token-watch
COLD=$ROOT/cold
OFFBOX=$ROOT/offbox
U=tokenwatch-cold

fail() { echo "FAIL $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"

id "$U" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$U"
setfacl -m "u:$U:--x" "$ROOT"
find "$COLD" -maxdepth 1 -type f -exec setfacl -m "u:$U:r--" {} +
setfacl -d -m "u:$U:r--" "$COLD"
setfacl -m "u:$U:rwx" "$COLD"                 # LAST
install -d -o "$U" -g "$U" -m 0750 "$OFFBOX"

# ── assertions ──────────────────────────────────────────────────────────────
first=$(find "$COLD" -maxdepth 1 -type f -name '*.gz' | head -n 1)
[ -n "$first" ] || fail "no backlog file in $COLD to test against"
runuser -u "$U" -- head -c 1 "$first" >/dev/null || fail "$U cannot read an existing backlog file ($first)"
scratch="$COLD/.access-probe-$$"
runuser -u "$U" -- sh -c "echo probe > '$scratch' && rm -f '$scratch'" || fail "$U cannot create and unlink in $COLD"
[ ! -e "$scratch" ] || fail "scratch file survived"
runuser -u "$U" -- sh -c "echo probe > '$OFFBOX/.probe' && rm -f '$OFFBOX/.probe'" || fail "$U cannot write $OFFBOX"
tw="$COLD/.tier-probe-$$"
runuser -u tokenwatch -- sh -c "umask 027; echo probe > '$tw'" || fail "tokenwatch can no longer write $COLD"
getfacl -p "$tw" | grep -q '^user::rw-$' || { rm -f "$tw"; fail "a new tokenwatch file lost its owner rw-"; }
# Prove the inherited entry by READING, not by matching getfacl text: an entry neutered by the mask still prints
# `user:<U>:r--` with `#effective:---` on the same line (Langston, Step 4 record (f)).
runuser -u "$U" -- head -c 1 "$tw" >/dev/null || { rm -f "$tw"; fail "a new tokenwatch file is not readable by $U"; }
rm -f "$tw"
unreadable=$(find "$COLD" -maxdepth 1 -type f -name '*.gz' ! -exec runuser -u "$U" -- test -r {} \; -print | wc -l)
[ "$unreadable" = 0 ] || fail "$unreadable backlog file(s) still unreadable by $U"
total=$(find "$COLD" -maxdepth 1 -type f -name '*.gz' | wc -l)
if runuser -u "$U" -- ls "$ROOT/state" >/dev/null 2>&1; then fail "$U can read $ROOT/state — the grant is too wide"; fi
echo "PASS: $U reads all $total backlog files, can create and unlink in cold/, writes offbox/, cannot read state/;"
echo "      tokenwatch still writes cold/ with rw- and new files grant $U r--."
getfacl -p "$ROOT" "$COLD" "$OFFBOX"
