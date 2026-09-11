# Runner for b_price_side_alias_census.py. On staging: copy both to /tmp as cc_c_alias_run.sh and cc_c_alias.py,
# then: su - deploy -c 'bash /tmp/cc_c_alias_run.sh'
cd /home/deploy/dawntrader || exit 1
set -a; . ./.env; set +a
echo "universe columns: $(psql "$DATABASE_URL" -X -At -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'xstock_spot_universe' ORDER BY ordinal_position" | paste -sd ' ')"
psql "$DATABASE_URL" -X -At -c "SELECT symbol FROM xstock_spot_universe" > /tmp/cc_c_xuniverse.txt
curl -s https://api.kraken.com/0/public/AssetPairs > /tmp/cc_c_assetpairs.json
date -u +'census_at %FT%TZ'
python3 /tmp/cc_c_alias.py /tmp/cc_c_assetpairs.json /tmp/cc_c_xuniverse.txt
