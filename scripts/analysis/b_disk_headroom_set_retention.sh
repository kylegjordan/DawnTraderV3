#!/usr/bin/env bash
# B-DISK-HEADROOM P3 / P5 / P8 — set ONE one-minute-bar table's hot window, and prove it landed.
#
#   b_disk_headroom_set_retention.sh <table> <days> <updated_by>
#     table       xstock_spot_ohlc_1m | crypto_spot_ohlc_1m | xstock_perp_ohlc_1m   (nothing else is accepted)
#     days        a whole number, 1..365
#     updated_by  e.g. "B-DISK-HEADROOM OBJ-3 stage A"
#
# Run as `deploy` in /home/deploy/dawntrader (it reads DATABASE_URL from .env there).
# DRY=1 runs every step-1 assertion and then ROLLS BACK (nothing written); step 2 is skipped.
#
# WHY EVERY CHECK (Langston, Step-2 ruling 2026-11-07, condition (b)):
#  - The sweep's loadConfig reads data_lifecycle into a Map keyed on constant_name ALONE (b75-retention-sweep.ts:219-225),
#    so the key must hit the ONE existing row on all six columns, and exactly one row may exist for the constant_name.
#  - The UPDATE's own rowcount must be 1: a six-column key that missed changes nothing, and a read-back of "one row" would
#    still pass.
#  - The value must be stored as a JSON NUMBER. The sweep's reqNum is a strict `typeof v === 'number'` and throws from
#    loadConfig, which runs ONCE before any table (`:145`): a value stored as a JSON string ABORTS THE WHOLE NIGHT'S
#    SWEEP, all fifteen tables, not just this one.
#  - An in-transaction read-back proves what the transaction WILL commit. Step 2 re-reads in a NEW session, after COMMIT.
set -euo pipefail

case "${1:-}" in
  xstock_spot_ohlc_1m|crypto_spot_ohlc_1m|xstock_perp_ohlc_1m) TABLE="$1" ;;
  *) echo "REFUSED: table must be one of the three one-minute bar tables" >&2; exit 2 ;;
esac
DAYS="${2:-}"
if ! [[ "$DAYS" =~ ^[0-9]+$ ]] || (( DAYS < 1 || DAYS > 365 )); then
  echo "REFUSED: days must be a whole number 1..365" >&2; exit 2
fi
BY="${3:-}"
if ! [[ "$BY" =~ ^B-DISK-HEADROOM\ [A-Za-z0-9\ -]+$ ]]; then
  echo "REFUSED: updated_by must start 'B-DISK-HEADROOM ' and hold only letters, digits, spaces and dashes" >&2; exit 2
fi
CNAME="${TABLE}.hot_retention_days"

cd /home/deploy/dawntrader
set -a; . ./.env; set +a

# ── 1. the write: one transaction; any failed assertion raises, ON_ERROR_STOP aborts, nothing commits ──
END_TX=COMMIT; [[ "${DRY:-0}" == "1" ]] && END_TX=ROLLBACK
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v cname="$CNAME" -v days="$DAYS" -v by="$BY" -v end_tx="$END_TX" <<'SQL'
BEGIN;
SELECT set_config('dh.cname', :'cname', true), set_config('dh.days', :'days', true), set_config('dh.by', :'by', true);
DO $$
DECLARE
  n_before int; n_updated int; n_after int; v jsonb; t text; b text;
  cname text := current_setting('dh.cname'); days int := current_setting('dh.days')::int; who text := current_setting('dh.by');
BEGIN
  SELECT count(*) INTO n_before FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = cname;
  IF n_before <> 1 THEN RAISE EXCEPTION 'BEFORE: % rows for (data_lifecycle, %), expected 1', n_before, cname; END IF;
  UPDATE module_constants
     SET value = to_jsonb(days), updated_at = now(), updated_by = who
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = cname;
  GET DIAGNOSTICS n_updated = ROW_COUNT;
  IF n_updated <> 1 THEN RAISE EXCEPTION 'UPDATE hit % rows on the six-column key, expected 1', n_updated; END IF;
  SELECT count(*) INTO n_after FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = cname;
  SELECT value, jsonb_typeof(value), updated_by INTO v, t, b
    FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = cname;
  IF n_after <> 1 OR t <> 'number' OR v <> to_jsonb(days) OR b IS DISTINCT FROM who THEN
    RAISE EXCEPTION 'IN-TX READ-BACK: rows=% type=% value=% by=%', n_after, t, v, b;
  END IF;
  RAISE NOTICE 'IN-TX OK: % = % (number), by %', cname, v, b;
END $$;
:end_tx;
SQL
if [[ "$END_TX" == ROLLBACK ]]; then echo "DRY: every in-transaction check passed; rolled back, nothing written"; exit 0; fi

# ── 2. the proof: a NEW session, after COMMIT ──
OUT=$(psql "$DATABASE_URL" -X -q -A -t -F '|' -v cname="$CNAME" <<'SQL'
SELECT count(*) OVER (), value, jsonb_typeof(value), updated_by, updated_at
  FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = :'cname';
SQL
)
echo "POST-COMMIT (new session): $OUT"
IFS='|' read -r N V T B U <<<"$OUT"
if [[ "$N" == "1" && "$V" == "$DAYS" && "$T" == "number" && "$B" == "$BY" ]]; then
  echo "PASS: $CNAME = $DAYS (number), exactly one row, by '$BY', at $U"
else
  echo "FAIL: post-commit read does not match the write — investigate before the 02:15Z sweep" >&2; exit 4
fi
