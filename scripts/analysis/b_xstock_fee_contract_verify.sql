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

\echo === (2) AFTER the deploy: xStock paper fills with the booked FEE AMOUNTS (a maker entry must be negative) ===
SELECT 'open' AS state, symbol, chosen_entry_mode, entry_fee_rate, entry_fee, NULL::numeric AS exit_fee, NULL::text AS exit_fee_mode, opened_at
FROM active_open_positions
WHERE asset_class = 'xstock_spot' AND opened_at >= :'deploy_at'::timestamptz
UNION ALL
SELECT 'closed', symbol, chosen_entry_mode, entry_fee_rate, entry_fee, exit_fee, exit_fee_mode, opened_at
FROM closed_trades
WHERE asset_class = 'xstock_spot' AND opened_at >= :'deploy_at'::timestamptz
ORDER BY opened_at
LIMIT 50;

\echo === (3) AFTER the deploy: the verdict counts ===
SELECT
  count(*) FILTER (WHERE asset_class = 'xstock_spot') AS xstock_paper_fills,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode = 'maker' AND entry_fee < 0) AS xstock_maker_negative_fee,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode = 'maker' AND entry_fee >= 0) AS xstock_maker_nonnegative_fee,
  count(*) FILTER (WHERE asset_class = 'xstock_spot' AND chosen_entry_mode IS DISTINCT FROM 'maker' AND entry_fee_rate IS DISTINCT FROM 0.0010) AS xstock_taker_wrong_rate,
  count(*) FILTER (WHERE asset_class = 'crypto_spot' AND entry_fee_rate NOT IN (0.008, 0.004)) AS crypto_unexpected_rate
FROM (
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, entry_fee, opened_at FROM active_open_positions
  UNION ALL
  SELECT asset_class, chosen_entry_mode, entry_fee_rate, entry_fee, opened_at FROM closed_trades
) p
WHERE opened_at >= :'deploy_at'::timestamptz;
