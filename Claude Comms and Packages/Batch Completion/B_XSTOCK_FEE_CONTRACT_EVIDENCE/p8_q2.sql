-- P8 read (B-XSTOCK-FEE-CONTRACT #1010) — per-pick classification. READ-ONLY.
-- Join (pre-audit r8 P8): switch_on_shadow_evidence (maker_taker, xstock_spot) -> rtb_shadow_pairings on
-- symbol + strategy + asset_class within +/-600 s. Pairing timestamp used: created_at (opened_at reported beside it).
-- r = (maker_net_ev_adjusted - taker_net_ev) / (0.0084 * entry), entry = the pairing's entry_price.
SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off

\echo === (2) EVERY post-deploy xStock maker pick, joined and classified ===
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
  FROM switch_on_shadow_evidence e
  JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  LEFT JOIN alias al ON al.symbol = e.symbol
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.id AS pairing_id, p.mode AS p_mode, p.entry_price, p.created_at AS p_created, p.opened_at AS p_opened,
         p.promoted, p.promotion_rank,
         extract(epoch FROM (m.captured_at - p.created_at)) AS lag_s,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn,
         count(*) OVER (PARTITION BY m.evidence_id, m.captured_at) AS n_cand
  FROM mk m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds')
SELECT m.seg, m.part, m.evidence_id, m.captured_at, m.symbol, m.strategy, m.mode,
       m.taker_net_ev, m.maker_net_ev_adjusted, m.hard_floor_fired, m.non_fill_cost_pct,
       c.n_cand, c.pairing_id, c.p_mode, round(c.lag_s::numeric,1) AS lag_s,
       round(extract(epoch FROM (c.p_opened - c.p_created))::numeric,3) AS opened_minus_created_s,
       c.entry_price,
       round(((m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price))::numeric, 4) AS r,
       round((m.taker_net_ev / c.entry_price)::numeric, 6) AS taker_ev_frac,
       CASE WHEN m.hard_floor_fired IS TRUE OR c.pairing_id IS NULL THEN '(i)'
            WHEN (m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price) > 1 THEN '(ii)'
            ELSE '(iii)' END AS klass
FROM mk m LEFT JOIN cand c ON c.evidence_id = m.evidence_id AND c.captured_at = m.captured_at AND c.rn = 1
ORDER BY m.captured_at;

\echo === (2s) SUMMARY of (2) per segment x part x class ===
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
  FROM switch_on_shadow_evidence e
  JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  LEFT JOIN alias al ON al.symbol = e.symbol
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.entry_price,
         extract(epoch FROM (m.captured_at - p.created_at)) AS lag_s,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn,
         count(*) OVER (PARTITION BY m.evidence_id, m.captured_at) AS n_cand
  FROM mk m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds'),
cl AS (
  SELECT m.seg, m.part, c.n_cand, c.lag_s,
         (m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price) AS r,
         CASE WHEN m.hard_floor_fired IS TRUE OR c.entry_price IS NULL THEN '(i)'
              WHEN (m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price) > 1 THEN '(ii)'
              ELSE '(iii)' END AS klass
  FROM mk m LEFT JOIN cand c ON c.evidence_id = m.evidence_id AND c.captured_at = m.captured_at AND c.rn = 1)
SELECT seg, part, klass, count(*) AS n, count(*) FILTER (WHERE n_cand > 1) AS ambiguous,
       count(*) FILTER (WHERE lag_s > 0) AS evidence_after_pairing,
       round(min(r)::numeric,4) AS min_r, round(max(r)::numeric,4) AS max_r
FROM cl GROUP BY ROLLUP (seg, part, klass) ORDER BY seg NULLS LAST, part NULLS LAST, klass NULLS LAST;

\echo === (3) JOIN CONTROL over ALL post-deploy xStock decisions (maker + taker): join rate, ambiguity, lag direction, per segment ===
WITH seg(s, a, b) AS (VALUES
  ('S0', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-09-14 08:34:00+00'),
  ('S1', timestamptz '2026-09-14 08:34:00+00', timestamptz '2026-09-15 11:59:00+00'),
  ('S2', timestamptz '2026-09-15 11:59:00+00', timestamptz '2026-09-19 00:02:00+00'),
  ('S3', timestamptz '2026-09-19 00:02:00+00', timestamptz '2026-09-20 21:19:40+00'),
  ('S4', timestamptz '2026-09-20 21:19:40+00', timestamptz '2026-09-22 14:38:00+00'),
  ('S5', timestamptz '2026-09-22 14:38:00+00', timestamptz '2099-01-01 00:00:00+00')),
ev AS (
  SELECT e.*, s.s AS seg FROM switch_on_shadow_evidence e JOIN seg s ON e.captured_at >= s.a AND e.captured_at < s.b
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.captured_at >= timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at,
         extract(epoch FROM (m.captured_at - p.created_at)) AS lag_s,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn,
         count(*) OVER (PARTITION BY m.evidence_id, m.captured_at) AS n_cand
  FROM ev m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds')
SELECT e.seg, e.chosen_entry_mode, count(*) AS n, count(c.lag_s) AS joined, count(*) FILTER (WHERE c.n_cand > 1) AS ambiguous,
       count(*) FILTER (WHERE c.lag_s > 0) AS evidence_after_pairing,
       round(min(c.lag_s)::numeric,1) AS min_lag_s, round(max(c.lag_s)::numeric,1) AS max_lag_s,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY c.lag_s))::numeric,1) AS median_lag_s
FROM ev e LEFT JOIN cand c ON c.evidence_id = e.evidence_id AND c.captured_at = e.captured_at AND c.rn = 1
GROUP BY ROLLUP (e.seg, e.chosen_entry_mode) ORDER BY e.seg NULLS LAST, e.chosen_entry_mode NULLS LAST;

\echo === (4) POSITIVE CONTROL for r: pre-deploy maker picks [f8870022f 2026-09-04T19:27:07Z, deploy 2026-09-11T20:09:47Z), same join + ratio ===
WITH mk AS (
  SELECT e.* FROM switch_on_shadow_evidence e
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot' AND e.chosen_entry_mode='maker'
    AND e.captured_at >= timestamptz '2026-09-04 19:27:07+00' AND e.captured_at < timestamptz '2026-09-11 20:09:47+00'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.entry_price,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn,
         count(*) OVER (PARTITION BY m.evidence_id, m.captured_at) AS n_cand
  FROM mk m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds')
SELECT count(*) AS maker_picks, count(c.entry_price) AS joined,
       count(*) FILTER (WHERE (m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price) <= 1) AS r_le_1,
       count(*) FILTER (WHERE (m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price) > 1) AS r_gt_1,
       round(max((m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price))::numeric,4) AS worst_case_r,
       round(min((m.maker_net_ev_adjusted - m.taker_net_ev) / (0.0084 * c.entry_price))::numeric,4) AS min_r
FROM mk m LEFT JOIN cand c ON c.evidence_id = m.evidence_id AND c.captured_at = m.captured_at AND c.rn = 1;
