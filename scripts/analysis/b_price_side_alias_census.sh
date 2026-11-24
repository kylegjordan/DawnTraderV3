# Governed issue-1024 census runner. Database reads go only through the
# installed dt_reader boundary; this file never loads the application login.
set -eu

DT_SQL=/usr/local/bin/dt-sql
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORK=$(mktemp -d /tmp/b-price-side-alias.XXXXXX)
cleanup() {
  case "$WORK" in
    /tmp/b-price-side-alias.*) rm -rf -- "$WORK" ;;
    *) echo "refusing unsafe cleanup path: $WORK" >&2; exit 2 ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

role=$($DT_SQL -c 'SELECT current_user')
if [ "$role" != dt_reader ]; then
  echo "refusing census: dt-sql returned current_user=$role, wanted dt_reader" >&2
  exit 2
fi

columns=$($DT_SQL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'xstock_spot_universe' ORDER BY ordinal_position")
echo "database role: $role"
echo "universe columns: $(printf '%s\n' "$columns" | paste -sd ' ')"
$DT_SQL -c 'SELECT symbol FROM xstock_spot_universe ORDER BY symbol' > "$WORK/xuniverse.txt"
curl --fail --silent --show-error https://api.kraken.com/0/public/AssetPairs > "$WORK/assetpairs.json"
date -u +'census_at %FT%TZ'
python3 "$SCRIPT_DIR/b_price_side_alias_census.py" "$WORK/assetpairs.json" "$WORK/xuniverse.txt"
