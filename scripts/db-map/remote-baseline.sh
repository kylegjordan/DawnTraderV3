#!/bin/sh
# Run on staging as deploy. Stdout is only a gzip-compressed candidate artifact tree.
set -eu
REPO=${1:-/opt/governance-checker/DawnTraderV3}
REF=${2:-}
[ -n "$REF" ] || { echo "usage: remote-baseline.sh <repo> <immutable-ref>" >&2; exit 2; }
case "$REF" in *[!0-9a-f]*|'') echo "ref must be lowercase 40-hex" >&2; exit 2;; esac
[ "${#REF}" -eq 40 ] || { echo "ref must be lowercase 40-hex" >&2; exit 2; }
[ "$(git -C "$REPO" cat-file -t "$REF")" = commit ] || { echo "ref is not a commit" >&2; exit 2; }

TMP=$(mktemp -d /tmp/dt-db-map-baseline.XXXXXX)
chmod 700 "$TMP"
trap 'rm -rf -- "$TMP"' EXIT HUP INT TERM
mkdir -m 700 "$TMP/source" "$TMP/tbls"
git -C "$REPO" archive --format=tar --output="$TMP/source.tar" "$REF"
tar -xf "$TMP/source.tar" -C "$TMP/source"
curl --fail --location --silent --show-error --output "$TMP/tbls.tar.gz" \
  https://github.com/k1LoW/tbls/releases/download/v1.97.0/tbls_v1.97.0_linux_amd64.tar.gz
[ "$(wc -c < "$TMP/tbls.tar.gz" | tr -d ' ')" = 31694635 ] || { echo "tbls archive size differs" >&2; exit 1; }
printf '%s  %s\n' 43c81f408495d9b626d0265a6ebb57c6d1c4a5e072d3eecc3e88825cc6c64e9a "$TMP/tbls.tar.gz" | sha256sum --check --status
tar -xzf "$TMP/tbls.tar.gz" -C "$TMP/tbls" tbls
[ "$(sha256sum "$TMP/tbls/tbls" | awk '{print $1}')" = 44bf748bf0b8f4ed66c21173d19792714a61953b5dff21da8805cb7caa1f6258 ] || { echo "tbls binary checksum differs" >&2; exit 1; }

HOME=/home/deploy NODE_PATH=/home/deploy/dawntrader/node_modules DT_DB_MAP_DT_SQL=/usr/local/bin/dt-sql \
  /usr/bin/node "$TMP/source/scripts/db-map/generate.mjs" \
  --repo "$REPO" --source-ref "$REF" --output "$TMP/candidate" --tbls "$TMP/tbls/tbls" >&2
HOME=/home/deploy NODE_PATH=/home/deploy/dawntrader/node_modules \
  /usr/bin/node "$TMP/source/scripts/db-map/verify.mjs" --repo "$REPO" --root "$TMP/candidate" >&2
tar -czf - -C "$TMP/candidate" .
