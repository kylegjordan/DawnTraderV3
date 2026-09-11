# B-PRICE-SIDE-BY-JOB r5 P-7h — runner for b_price_side_p7h_limiter_class_census.py. Run on staging as deploy:
#   scp both files to /tmp as cc_c_coupling_run.sh and cc_c_coupling.py, then: su - deploy -c 'bash /tmp/cc_c_coupling_run.sh'
# Reads every out.log and out__*.log (15 files on 2026-09-11) and the DB's xStock symbols from closed + open trades.
cd /home/deploy/dawntrader || exit 1
set -a; . ./.env; set +a
psql "$DATABASE_URL" -X -At -c "SELECT DISTINCT symbol FROM closed_trades WHERE asset_class = 'xstock_spot' UNION SELECT DISTINCT symbol FROM active_open_positions WHERE asset_class = 'xstock_spot'" > /tmp/cc_c_xstock_syms.txt
echo "db xstock symbols: $(wc -l < /tmp/cc_c_xstock_syms.txt)"
cd /var/log/dawntrader || exit 1
echo "out files read: $(ls out.log out__*.log | wc -l)"
grep -h -F -e "[8.8.5][RestRateLimiter]" -e "[P19-B8.9][XSTOCK_REST_GATE]" out.log out__*.log | python3 /tmp/cc_c_coupling.py /tmp/cc_c_xstock_syms.txt
