-- B-XSTOCK-FEE-CONTRACT (#1010) — Step-7 verification: which fee rates were actually BOOKED after the deploy.
--
-- HOW TO RUN (staging, as deploy, env sourced), after the deploy has taken:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v deploy_at='<this batch''s recorded deployed_at>' \
--        -f scripts/analysis/b_xstock_fee_contract_verify.sql
--
-- WHAT PASSES STEP 7 (pre-audit / scope): an xStock MAKER fill booked with a NEGATIVE entry fee (the rebate),
-- xStock TAKER fills booked at 0.0010, and crypto unchanged at 0.008 / 0.004.
-- ⛔ A WINDOW WITH ZERO xStock FILLS IS NOT A PASS — it is "not yet observable". Say so, and re-run later.
-- xStock trades 24/5 (CLAUDE.md rule 17): a weekend window legitimately holds no xStock fills.
--
-- CONTROL (section 0): the same columns in the 7 days BEFORE the deploy must show the OLD xStock pair (0.008 / 0.004).
-- If they do not, the column is not carrying the rate and the post-deploy reading proves nothing.

\echo === (0) CONTROL: fee rates booked in the 7 days BEFORE the deploy, by class and entry mode ===
SELECT 'paper open+closed' AS surface, asset_class, chosen_entry_mode, entry_fee_rate, count(*) AS n
FROM (
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, opened_at FROM active_open_positions
  UNION ALL
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, opened_at FROM closed_trades
) p
WHERE opened_at >= :'deploy_at'::timestamptz - interval '7 days' AND opened_at < :'deploy_at'::timestamptz
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'vts', asset_class, chosen_entry_mode, entry_fee_rate, count(*)
FROM vts_open_trades
WHERE opened_at >= :'deploy_at'::timestamptz - interval '7 days' AND opened_at < :'deploy_at'::timestamptz
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;

\echo === (1) AFTER the deploy: fee rates booked, by surface, class and entry mode ===
SELECT 'paper open+closed' AS surface, asset_class, chosen_entry_mode, entry_fee_rate, count(*) AS n
FROM (
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, opened_at FROM active_open_positions
  UNION ALL
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, opened_at FROM closed_trades
) p
WHERE opened_at >= :'deploy_at'::timestamptz
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT 'vts', asset_class, chosen_entry_mode, entry_fee_rate, count(*)
FROM vts_open_trades
WHERE opened_at >= :'deploy_at'::timestamptz
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;

\echo === (1b) DENOMINATORS for section (1): a rate claim rests on the STAMPED rows only ===
-- ⛔ Langston, Step 8: "crypto unchanged" rests on the rows that actually carry a rate. Post-deploy VTS crypto was
-- 514 of 533 rows NULL (twins/shadow rows carry no fee stamp). A share quoted over the whole population is wrong by
-- ~28x. Print the denominator beside every rate claim, and never let a NULL-blind predicate stand in for a zero.
SELECT surface, asset_class,
       count(*) AS rows_in_window,
       count(entry_fee_rate) AS stamped,
       count(*) - count(entry_fee_rate) AS unstamped_null_rate
FROM (
  SELECT 'vts' AS surface, asset_class, entry_fee_rate FROM vts_open_trades WHERE opened_at >= :'deploy_at'::timestamptz
  UNION ALL
  SELECT 'paper open', asset_class, entry_fee_rate FROM active_open_positions WHERE opened_at >= :'deploy_at'::timestamptz
  UNION ALL
  SELECT 'paper closed', asset_class, entry_fee_rate FROM closed_trades WHERE opened_at >= :'deploy_at'::timestamptz
) q
GROUP BY 1, 2 ORDER BY 1, 2;

\echo === (2) AFTER the deploy: xStock paper fills with the booked FEE AMOUNTS, and the implied rate of each leg ===
-- ⛔ A CLOSE counts even when the position OPENED before the deploy: the exit fee is resolved at close from the live
-- fee rows, so a pre-deploy entry with a post-deploy maker exit is exactly where the rebate first appears. An
-- opened_at-only filter misses those rows — it did on the first Step-7 read.
SELECT 'open' AS state, symbol, chosen_entry_mode, entry_fee_rate, entry_fee, NULL::numeric AS exit_fee, NULL::text AS exit_fee_mode,
       NULL::numeric AS implied_exit_rate, opened_at, NULL::timestamptz AS closed_at
FROM active_open_positions
WHERE asset_class = 'xstock_spot' AND opened_at >= :'deploy_at'::timestamptz
UNION ALL
SELECT 'closed', symbol, chosen_entry_mode, entry_fee_rate, entry_fee, exit_fee, exit_fee_mode,
       round((exit_fee / NULLIF(quantity * exit_price, 0))::numeric, 6), opened_at, closed_at
FROM closed_trades
WHERE asset_class = 'xstock_spot' AND (opened_at >= :'deploy_at'::timestamptz OR closed_at >= :'deploy_at'::timestamptz)
ORDER BY 9
LIMIT 50;

\echo === (3a) VERDICT, ENTRY-SIDE population: rows OPENED after the deploy, with its denominator ===
-- ⛔ Langston, Step 8: an entry-side counter and a close-side counter may not share one population. Mixed, the
-- counter loses all discriminating power - a real failure (a post-deploy xStock taker entry stamped 0.008) and a
-- benign pre-deploy-entry close both add 1, so it can never alarm again. Two populations, two denominators, and a
-- zero that is readable rather than ambiguous with an empty population.
SELECT
  count(*) FILTER (WHERE asset_class = 'xstock_spot') AS xstock_entries_in_window,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND entry_fee_rate IS NULL) AS xstock_entries_unstamped,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode = 'maker' AND entry_fee < 0) AS xstock_maker_entry_rebate,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode = 'maker' AND entry_fee >= 0) AS xstock_maker_entry_no_rebate,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode IS DISTINCT FROM 'maker'
                     AND entry_fee_rate IS NOT NULL AND entry_fee_rate <> 0.0010) AS xstock_taker_entry_wrong_rate,
  count(*) FILTER (WHERE asset_class = 'crypto_spot') AS crypto_entries_in_window,
  count(*) FILTER (WHERE asset_class = 'crypto_spot' AND entry_fee_rate IS NULL) AS crypto_entries_unstamped,
  count(*) FILTER (WHERE asset_class = 'crypto_spot' AND entry_fee_rate IS NOT NULL
                     AND entry_fee_rate NOT IN (0.008, 0.004)) AS crypto_unexpected_rate
FROM (
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, entry_fee, opened_at FROM active_open_positions
  UNION ALL
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, entry_fee, opened_at FROM closed_trades
  UNION ALL
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, NULL::numeric, opened_at FROM vts_open_trades
) p
WHERE opened_at >= :'deploy_at'::timestamptz;

\echo === (3b) VERDICT, CLOSE-SIDE population: rows CLOSED after the deploy, with its denominator ===
-- The exit fee is resolved at close, so this population legitimately contains pre-deploy entries. Read it alone.
SELECT
  count(*) FILTER (WHERE asset_class = 'xstock_spot') AS xstock_closes_in_window,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND exit_fee_mode IS NULL) AS xstock_closes_unstamped_mode,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND exit_fee_mode = 'maker' AND exit_fee < 0) AS xstock_maker_exit_rebate,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND exit_fee_mode = 'maker' AND exit_fee >= 0) AS xstock_maker_exit_no_rebate,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND exit_fee_mode = 'taker'
                     AND round((exit_fee / NULLIF(quantity * exit_price, 0))::numeric, 6) IS DISTINCT FROM 0.001000) AS xstock_taker_exit_wrong_rate,
  count(*) FILTER (WHERE asset_class = 'crypto_spot') AS crypto_closes_in_window,
  count(*) FILTER (WHERE asset_class = 'crypto_spot' AND exit_fee_mode = 'maker'
                     AND round((exit_fee / NULLIF(quantity * exit_price, 0))::numeric, 6) IS DISTINCT FROM 0.004000) AS crypto_maker_exit_wrong_rate
FROM closed_trades
WHERE closed_at >= :'deploy_at'::timestamptz;
