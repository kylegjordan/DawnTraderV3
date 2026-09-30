-- P8 class-(iii) discharge buckets + implied-advantage consistency test. READ-ONLY.
SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off

\echo === xStock positions opened post-deploy, entry mode x entry_fee_rate (context) ===
SELECT 'closed_trades' AS src, mode::text AS mode, chosen_entry_mode, entry_fee_rate, count(*) FROM closed_trades
WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:09:47+00' GROUP BY 1,2,3,4
UNION ALL
SELECT 'active_open_positions', trade_mode::text, chosen_entry_mode, entry_fee_rate, count(*) FROM active_open_positions
WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:09:47+00' GROUP BY 1,2,3,4
ORDER BY 1,2,3,4;

\echo === (6) per maker pick: pairing -> rtb_signals (by signal_id) -> position (by promoted_trade_id, else symbol+strategy within 6h) ===
WITH seg(s, a, b) AS (VALUES
  ('S0', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-09-14 08:34:00+00'),
  ('S1', timestamptz '2026-09-14 08:34:00+00', timestamptz '2026-09-15 11:59:00+00'),
  ('S2', timestamptz '2026-09-15 11:59:00+00', timestamptz '2026-09-19 00:02:00+00'),
  ('S3', timestamptz '2026-09-19 00:02:00+00', timestamptz '2026-09-20 21:19:40+00'),
  ('S4', timestamptz '2026-09-20 21:19:40+00', timestamptz '2026-09-22 14:38:00+00'),
  ('S5', timestamptz '2026-09-22 14:38:00+00', timestamptz '2099-01-01 00:00:00+00')),
alias(symbol) AS (VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),
  ('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD')),
mk AS (
  SELECT e.*, s.s AS seg, CASE WHEN al.symbol IS NULL THEN 'verdict' ELSE 'alias17' END AS part
  FROM switch_on_shadow_evidence e JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  LEFT JOIN alias al ON al.symbol = e.symbol
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.signal_id, p.promoted, p.entry_price,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn
  FROM mk m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds'),
j AS (
  SELECT m.seg, m.part, m.evidence_id, m.captured_at, m.symbol, m.strategy, c.signal_id, c.promoted AS pairing_promoted, c.entry_price
  FROM mk m LEFT JOIN cand c ON c.evidence_id = m.evidence_id AND c.captured_at = m.captured_at AND c.rn = 1),
rs AS (
  SELECT j.evidence_id, j.captured_at, count(r.*) AS rtb_rows,
         string_agg(DISTINCT r.status::text, '|') AS rtb_status,
         max(r.promoted_trade_id) AS promoted_trade_id,
         string_agg(DISTINCT r.chosen_entry_mode, '|') AS rtb_mode_now
  FROM j LEFT JOIN rtb_signals r ON r.signal_id = j.signal_id
  GROUP BY 1,2),
pos AS (
  SELECT 'closed' AS src, id, symbol, strategy_name::text AS strategy, opened_at, chosen_entry_mode, entry_fee_rate, entry_fee, mode::text AS md
  FROM closed_trades WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:00:00+00'
  UNION ALL
  SELECT 'open', id, symbol, strategy_name::text, opened_at, chosen_entry_mode, entry_fee_rate, entry_fee, trade_mode::text
  FROM active_open_positions WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:00:00+00'),
byid AS (
  SELECT rs.evidence_id, rs.captured_at, p.src, p.id, p.opened_at, p.chosen_entry_mode, p.entry_fee_rate, p.entry_fee, p.md
  FROM rs JOIN pos p ON p.id = rs.promoted_trade_id),
bywin AS (
  SELECT j.evidence_id, j.captured_at, count(*) AS n_pos_6h,
         string_agg(p.src || ':' || p.id || ':' || coalesce(p.chosen_entry_mode,'null') || ':' || coalesce(p.entry_fee_rate::text,'null') || ':' ||
                    round(extract(epoch FROM (p.opened_at - j.captured_at))::numeric,0)::text || 's', ' ; ' ORDER BY p.opened_at) AS pos_6h
  FROM j JOIN pos p ON p.symbol = j.symbol AND p.strategy = j.strategy
   AND p.opened_at BETWEEN j.captured_at AND j.captured_at + interval '6 hours'
  GROUP BY 1,2)
SELECT j.seg, j.part, j.evidence_id, j.captured_at, j.symbol, j.strategy, j.signal_id, j.pairing_promoted,
       rs.rtb_rows, rs.rtb_status, rs.promoted_trade_id, rs.rtb_mode_now,
       b.src AS id_src, b.chosen_entry_mode AS id_entry_mode, b.entry_fee_rate AS id_entry_fee_rate, b.entry_fee AS id_entry_fee,
       w.n_pos_6h, w.pos_6h
FROM j LEFT JOIN rs ON rs.evidence_id=j.evidence_id AND rs.captured_at=j.captured_at
LEFT JOIN byid b ON b.evidence_id=j.evidence_id AND b.captured_at=j.captured_at
LEFT JOIN bywin w ON w.evidence_id=j.evidence_id AND w.captured_at=j.captured_at
ORDER BY j.captured_at;

\echo === (7) IMPLIED MAKER ADVANTAGE per decision: adv = [(maker_adj + (1-pFill)*C*E)/pFill - taker]/E + A  (maker-taker-decision.ts) ===
\echo === adv = (feeT - feeM) + spread + slippage >= fee delta. OLD delta 0.004 (0.008-0.004); NEW 0.0012 (0.0010-(-0.0002)). ===
\echo === E is NOT recorded on the evidence row, so E comes from the joined pairing; unjoined rows are listed as NULL. ===
WITH seg(s, a, b) AS (VALUES
  ('PRE f8870022f->deploy', timestamptz '2026-09-04 19:27:07+00', timestamptz '2026-09-11 20:09:47+00'),
  ('S0', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-09-14 08:34:00+00'),
  ('S1', timestamptz '2026-09-14 08:34:00+00', timestamptz '2026-09-15 11:59:00+00'),
  ('S2', timestamptz '2026-09-15 11:59:00+00', timestamptz '2026-09-19 00:02:00+00'),
  ('S3', timestamptz '2026-09-19 00:02:00+00', timestamptz '2026-09-20 21:19:40+00'),
  ('S4', timestamptz '2026-09-20 21:19:40+00', timestamptz '2026-09-22 14:38:00+00'),
  ('S5', timestamptz '2026-09-22 14:38:00+00', timestamptz '2099-01-01 00:00:00+00')),
ev AS (
  SELECT e.*, s.s AS seg FROM switch_on_shadow_evidence e JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.entry_price,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn
  FROM ev m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds'),
x AS (
  SELECT e.seg, e.chosen_entry_mode, c.entry_price AS E,
         ((e.maker_net_ev_adjusted + (1 - e.maker_fill_probability) * e.non_fill_cost_pct * c.entry_price) / e.maker_fill_probability
           - e.taker_net_ev) / c.entry_price + e.adverse_selection_pct AS adv
  FROM ev e LEFT JOIN cand c ON c.evidence_id=e.evidence_id AND c.captured_at=e.captured_at AND c.rn=1)
SELECT seg, chosen_entry_mode, count(*) AS n, count(adv) AS with_E,
       count(*) FILTER (WHERE adv < 0.0012 - 1e-6) AS adv_below_new_delta_IMPOSSIBLE,
       count(*) FILTER (WHERE adv >= 0.0012 - 1e-6 AND adv < 0.004 - 1e-6) AS adv_in_new_only_band,
       count(*) FILTER (WHERE adv >= 0.004 - 1e-6) AS adv_ge_old_delta,
       round(min(adv)::numeric,6) AS min_adv, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY adv))::numeric,6) AS med_adv,
       round(max(adv)::numeric,6) AS max_adv,
       count(*) FILTER (WHERE abs(adv - 0.0017 - 0.0012) < 1e-6) AS new_fee_static_spread_exact,
       count(*) FILTER (WHERE abs(adv - 0.0045 - 0.0012) < 1e-6) AS old_fee_static_spread_exact
FROM x GROUP BY ROLLUP (seg, chosen_entry_mode) ORDER BY seg NULLS LAST, chosen_entry_mode NULLS LAST;
