# Runner for b_price_age_truth_reserve_age_split.py. On staging as root: copy both to /tmp, then
#   bash /tmp/cc_c_reserve_split_run.sh ['START' ['END']]   (UTC 'YYYY-MM-DD HH:MM:SS'; omitted = whole files)
# Reads the three newest rotated out files plus out.log; the time window selects the population.
cd /var/log/dawntrader || exit 1
echo "files: $(ls -t out__*.log | head -3 | tr '\n' ' ') out.log"
grep -h -F -e "[8.8.5][REST_BLOCKED]" -e "[I7-WS-D][CACHE_WRITE]" $(ls -t out__*.log | head -3) out.log | python3 /tmp/cc_c_reserve_split.py "$@"
