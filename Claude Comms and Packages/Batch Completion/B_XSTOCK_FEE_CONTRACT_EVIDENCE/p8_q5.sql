SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off
\echo === (8) S3 instrument-alive control: all switch_on_shadow_evidence rows in S3 by class x proof_type, and the S3 bounds weekday ===
SELECT asset_class, proof_type, count(*) FROM switch_on_shadow_evidence
WHERE captured_at >= timestamptz '2026-09-19 00:02:00+00' AND captured_at < timestamptz '2026-09-20 21:19:40+00'
GROUP BY 1,2 ORDER BY 1,2;
SELECT to_char(timestamptz '2026-09-19 00:02:00+00' AT TIME ZONE 'UTC','Dy') AS s3_start_dow, to_char(timestamptz '2026-09-20 21:19:40+00' AT TIME ZONE 'UTC','Dy') AS s3_end_dow;
\echo === last xStock maker_taker row before S3 and first after ===
SELECT max(captured_at) FILTER (WHERE captured_at < timestamptz '2026-09-19 00:02:00+00') AS last_before,
       min(captured_at) FILTER (WHERE captured_at >= timestamptz '2026-09-20 21:19:40+00') AS first_after
FROM switch_on_shadow_evidence WHERE proof_type='maker_taker' AND asset_class='xstock_spot' AND captured_at >= timestamptz '2026-09-18 00:00:00+00' AND captured_at < timestamptz '2026-09-22 00:00:00+00';

\echo === (9) bucket-link SENSITIVITY: maker picks linked to an xStock position by symbol+strategy, opened within 0-6h vs 0-48h; rates booked ===
WITH mk AS (
  SELECT e.* FROM switch_on_shadow_evidence e
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
pos AS (
  SELECT id, symbol, strategy_name::text AS strategy, opened_at, chosen_entry_mode, entry_fee_rate FROM closed_trades
  WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:00:00+00'
  UNION ALL
  SELECT id, symbol, strategy_name::text, opened_at, chosen_entry_mode, entry_fee_rate FROM active_open_positions
  WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:00:00+00')
SELECT w.win, count(DISTINCT m.evidence_id) AS maker_picks_linked,
       count(DISTINCT m.evidence_id) FILTER (WHERE p.entry_fee_rate IN (0.001, -0.0002)) AS linked_new_rate,
       count(DISTINCT m.evidence_id) FILTER (WHERE p.entry_fee_rate IN (0.008, 0.004)) AS linked_old_rate,
       count(DISTINCT m.evidence_id) FILTER (WHERE p.entry_fee_rate IS NULL) AS linked_null_rate
FROM (VALUES ('0-6h', interval '6 hours'), ('0-48h', interval '48 hours')) w(win, iv)
JOIN mk m ON true
JOIN pos p ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.opened_at BETWEEN m.captured_at AND m.captured_at + w.iv
GROUP BY 1 ORDER BY 1;

\echo === (10) all xStock positions opened post-deploy: any at an OLD rate, any NULL, any live? (the booking population the discharge reads) ===
SELECT count(*) AS n, count(*) FILTER (WHERE entry_fee_rate IN (0.008, 0.004)) AS old_rate, count(*) FILTER (WHERE entry_fee_rate IS NULL) AS null_rate,
       count(*) FILTER (WHERE mode::text <> 'paper') AS non_paper, min(opened_at), max(opened_at)
FROM closed_trades WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:09:47+00';
SELECT count(*) AS open_n FROM active_open_positions WHERE asset_class='xstock_spot';
\echo CONTROL: the same old-rate filter DOES see pre-deploy xStock rows
SELECT entry_fee_rate, count(*) FROM closed_trades WHERE asset_class='xstock_spot'
  AND opened_at >= timestamptz '2026-09-04 00:00:00+00' AND opened_at < timestamptz '2026-09-11 20:09:47+00' GROUP BY 1 ORDER BY 1;

\echo === (11) maker picks: implied advantage bands using the xStock slippage default 0.0005 (friction.ts:40) ===
WITH mk AS (
  SELECT e.* FROM switch_on_shadow_evidence e
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.entry_price,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn
  FROM mk m JOIN rtb_shadow_pairings p ON p.symbol=m.symbol AND p.strategy=m.strategy AND p.asset_class=m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds'),
x AS (
  SELECT m.evidence_id, m.symbol,
    ((m.maker_net_ev_adjusted + (1 - m.maker_fill_probability) * m.non_fill_cost_pct * c.entry_price) / m.maker_fill_probability - m.taker_net_ev) / c.entry_price
      + m.adverse_selection_pct AS adv
  FROM mk m JOIN cand c ON c.evidence_id=m.evidence_id AND c.captured_at=m.captured_at AND c.rn=1)
SELECT count(*) AS n,
       count(*) FILTER (WHERE adv < 0.0045 - 1e-6) AS old_fee_impossible_given_slip_0005,
       count(*) FILTER (WHERE adv < 0.004 - 1e-6) AS old_fee_impossible_any_slip,
       count(*) FILTER (WHERE adv >= 0.0045 - 1e-6) AS undetermined,
       round(min(adv - 0.0017)::numeric,6) AS min_implied_spread_newfee, round(max(adv - 0.0017)::numeric,6) AS max_implied_spread_newfee
FROM x;
