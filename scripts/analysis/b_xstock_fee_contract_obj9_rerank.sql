-- B-XSTOCK-FEE-CONTRACT OBJ-9 (Step 2, read-only) — what the wrong xStock fee did to RTB rank 0.
-- Source of every number in B_XSTOCK_FEE_CONTRACT_PRE_AUDIT.md §A9. Run against staging with psql -f. SELECTs only.
-- POPULATION IS PINNED: cycles whose every member row was written before :cutoff, so a re-run reproduces the counts.
-- Fee change: xStock taker 0.008 -> 0.0010, maker 0.004 -> -0.0002; xStock maker_fill_probability 0.50.
-- Each xStock member's corrected R lies in [R + lo, R + hi]:
--   lo = 0.5 * 0.0112 * entry / |entry - stop|  (maker arm)   hi = 0.014 * entry / |entry - stop|  (taker arm)
-- Crypto R is unchanged. Pool rows do not store the chosen arm, so only the interval is known.
-- CERTAIN / POSSIBLE are per cycle and hold AMONG RECORDED POOL MEMBERS only.
-- R is numeric(10,4): CERTAIN needs a margin > 0.0001; POSSIBLE accepts a margin >= -0.0001.
\set cutoff '2026-09-11 16:00:00+00'

\echo === (0) ranker order check: rank 0 = max predicted R, 2000 most recent multi-member cycles before cutoff, any class ===
WITH c AS (SELECT cycle_key FROM rtb_shadow_pool_members GROUP BY 1 HAVING count(*) > 1 AND max(created_at) < :'cutoff' ORDER BY max(created_at) DESC LIMIT 2000),
m AS (SELECT m.* FROM rtb_shadow_pool_members m JOIN c USING (cycle_key))
SELECT count(*) AS cycles, count(*) FILTER (WHERE r0 = rmax) AS rank0_is_max_r, count(*) FILTER (WHERE f0 = fmax) AS control_final, count(*) FILTER (WHERE s0 = smax) AS control_ranking
FROM (SELECT cycle_key, max(predicted_r_multiple) FILTER (WHERE promotion_rank=0) r0, max(predicted_r_multiple) rmax,
             max(final_score) FILTER (WHERE promotion_rank=0) f0, max(final_score) fmax,
             max(ranking_score) FILTER (WHERE promotion_rank=0) s0, max(ranking_score) smax FROM m GROUP BY 1) z;

\echo === (1) pool member table by mode before cutoff, unbounded ===
SELECT mode, asset_class, count(*) AS rows, count(DISTINCT cycle_key) AS cycles, min(created_at), max(created_at)
FROM rtb_shadow_pool_members WHERE created_at < :'cutoff' GROUP BY 1,2 ORDER BY 1,2;

\echo === (2) CERTAIN and POSSIBLE rank-0 change, among recorded members ===
WITH xc AS (SELECT cycle_key FROM rtb_shadow_pool_members GROUP BY 1 HAVING bool_or(asset_class = 'xstock_spot') AND max(created_at) < :'cutoff'),
m AS (
  SELECT m.cycle_key, m.id, m.asset_class, m.promotion_rank, m.pool_size, date_trunc('month', m.created_at) AS mon,
         m.predicted_r_multiple::float8 AS r,
         CASE WHEN m.asset_class='xstock_spot' THEN 0.0056 * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8) ELSE 0 END AS lo,
         CASE WHEN m.asset_class='xstock_spot' THEN 0.014  * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8) ELSE 0 END AS hi
  FROM rtb_shadow_pool_members m JOIN xc USING (cycle_key) JOIN rtb_shadow_pairings p ON p.id = m.shadow_trade_id
),
inc AS (SELECT DISTINCT ON (cycle_key) cycle_key, id AS inc_id, asset_class AS inc_ac, promotion_rank AS inc_rank, r AS inc_r, lo AS inc_lo, hi AS inc_hi
        FROM m ORDER BY cycle_key, promotion_rank, id),
c AS (
  SELECT i.cycle_key, i.inc_ac, i.inc_rank, min(m.mon) AS mon, count(*) AS n, max(m.pool_size) AS pool_size,
         count(DISTINCT m.promotion_rank) AS distinct_ranks,
         bool_or(m.id <> i.inc_id AND m.asset_class='xstock_spot' AND (m.r + m.lo) - (i.inc_r + i.inc_hi) >  0.0001) AS certain,
         bool_or(m.id <> i.inc_id AND m.asset_class='xstock_spot' AND (m.r + m.hi) - (i.inc_r + i.inc_lo) >= -0.0001) AS possible,
         bool_or(m.id <> i.inc_id AND m.r - i.inc_r > 0) AS control_zero_shift_strict,
         bool_or(m.id <> i.inc_id AND abs(m.r - i.inc_r) <= 0.0001) AS tie_within_4dp
  FROM inc i JOIN m ON m.cycle_key = i.cycle_key
  GROUP BY i.cycle_key, i.inc_ac, i.inc_rank
)
SELECT inc_ac AS rank0_class_as_recorded, count(*) AS cycles, count(*) FILTER (WHERE n > 1) AS multi,
       count(*) FILTER (WHERE certain) AS change_certain,
       count(*) FILTER (WHERE possible) AS change_possible,
       count(*) FILTER (WHERE control_zero_shift_strict) AS control_must_be_0,
       count(*) FILTER (WHERE tie_within_4dp) AS cycles_with_leader_tie_within_4dp,
       count(*) FILTER (WHERE inc_rank <> 0) AS rank0_row_missing,
       count(*) FILTER (WHERE n < pool_size) AS fewer_rows_than_pool_size,
       count(*) FILTER (WHERE n > pool_size) AS more_rows_than_pool_size,
       count(*) FILTER (WHERE distinct_ranks < n) AS duplicate_ranks
FROM c GROUP BY ROLLUP (inc_ac) ORDER BY inc_ac NULLS LAST;

\echo === (3) the same counts by month ===
WITH xc AS (SELECT cycle_key FROM rtb_shadow_pool_members GROUP BY 1 HAVING bool_or(asset_class = 'xstock_spot') AND max(created_at) < :'cutoff'),
m AS (
  SELECT m.cycle_key, m.id, m.asset_class, m.promotion_rank, date_trunc('month', m.created_at) AS mon, m.predicted_r_multiple::float8 AS r,
         CASE WHEN m.asset_class='xstock_spot' THEN 0.0056 * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8) ELSE 0 END AS lo,
         CASE WHEN m.asset_class='xstock_spot' THEN 0.014  * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8) ELSE 0 END AS hi
  FROM rtb_shadow_pool_members m JOIN xc USING (cycle_key) JOIN rtb_shadow_pairings p ON p.id = m.shadow_trade_id
),
inc AS (SELECT DISTINCT ON (cycle_key) cycle_key, id AS inc_id, r AS inc_r, lo AS inc_lo, hi AS inc_hi FROM m ORDER BY cycle_key, promotion_rank, id),
c AS (SELECT i.cycle_key, min(m.mon) AS mon,
        bool_or(m.id <> i.inc_id AND m.asset_class='xstock_spot' AND (m.r + m.lo) - (i.inc_r + i.inc_hi) >  0.0001) AS certain,
        bool_or(m.id <> i.inc_id AND m.asset_class='xstock_spot' AND (m.r + m.hi) - (i.inc_r + i.inc_lo) >= -0.0001) AS possible
      FROM inc i JOIN m ON m.cycle_key = i.cycle_key GROUP BY i.cycle_key)
SELECT to_char(mon,'YYYY-MM') AS month, count(*) AS cycles, count(*) FILTER (WHERE certain) AS certain, count(*) FILTER (WHERE possible) AS possible
FROM c GROUP BY 1 ORDER BY 1;

\echo === (4) inputs the bounds depend on, in the same cycles: all must be 0 for the bounds to cover every member ===
WITH xc AS (SELECT cycle_key FROM rtb_shadow_pool_members GROUP BY 1 HAVING bool_or(asset_class = 'xstock_spot') AND max(created_at) < :'cutoff')
SELECT m.asset_class, count(*) AS member_rows,
       count(*) FILTER (WHERE m.predicted_r_multiple IS NULL) AS null_r,
       count(*) FILTER (WHERE p.id IS NULL) AS no_pairing_row,
       count(*) FILTER (WHERE p.id IS NOT NULL AND (p.entry_price IS NULL OR p.stop_price IS NULL)) AS null_entry_or_stop,
       count(*) FILTER (WHERE p.entry_price IS NOT NULL AND p.stop_price IS NOT NULL AND p.entry_price = p.stop_price) AS zero_risk
FROM rtb_shadow_pool_members m JOIN xc USING (cycle_key) LEFT JOIN rtb_shadow_pairings p ON p.id = m.shadow_trade_id
GROUP BY 1 ORDER BY 1;

\echo === (5) pairing table by mode before cutoff ===
SELECT mode, asset_class, count(*) FROM rtb_shadow_pairings WHERE created_at < :'cutoff' GROUP BY 1,2 ORDER BY 1,2;

\echo === (6) size of the shift on xStock members, in R units ===
WITH xc AS (SELECT cycle_key FROM rtb_shadow_pool_members GROUP BY 1 HAVING bool_or(asset_class = 'xstock_spot') AND max(created_at) < :'cutoff')
SELECT count(*) AS x_members,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY 0.0056 * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8)) AS median_low_shift,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY 0.014  * p.entry_price::float8 / abs(p.entry_price::float8 - p.stop_price::float8)) AS median_high_shift,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.predicted_r_multiple::float8) AS median_recorded_r,
  count(*) FILTER (WHERE m.predicted_r_multiple < 0) AS recorded_r_negative
FROM rtb_shadow_pool_members m JOIN xc USING (cycle_key) JOIN rtb_shadow_pairings p ON p.id = m.shadow_trade_id
WHERE m.asset_class = 'xstock_spot' AND p.entry_price <> p.stop_price;
