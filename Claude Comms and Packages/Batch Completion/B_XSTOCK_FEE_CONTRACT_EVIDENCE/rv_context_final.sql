-- B-XSTOCK-FEE-CONTRACT (#1010) context read, REBUILT 2026-10-01 by CC-B. It replaces the lost rv3.sql and is NOT that query.
-- Implied maker-over-taker advantage per entry = the recorded EVs with the fill haircut undone:
--   onFill = (maker_net_ev_adjusted + (1 - pFill) * non_fill_cost_pct * E) / pFill   (maker-taker-decision.ts makerNetEVAdjusted)
--   maker.netEV = onFill + adverse_selection_pct * E                                   (makerNetEVOnFill = maker.netEV - adverseSelectionPerUnit)
--   adv = (maker.netEV - taker_net_ev) / E   (netEV = rawEV - totalFriction; equals makerEntryAdvantagePct when the two entries are equal)
-- Post-period end: 2026-10-02 20:09:47 (the window's end; run after it).
-- E = the paired rtb_shadow_pairings.entry_price (same +/-600 s join as p8_q2.sql). READ-ONLY.
SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off
SELECT now() AS read_instant;
WITH per(period, a, b) AS (VALUES
  ('pre',  timestamptz '2026-09-04 19:27:07+00', timestamptz '2026-09-11 20:09:47+00'),
  ('post', timestamptz '2026-09-11 20:09:47+00', timestamptz '2026-10-02 20:09:47+00')),
ev AS (
  SELECT e.*, per.period FROM switch_on_shadow_evidence e JOIN per ON e.captured_at >= per.a AND e.captured_at < per.b
  WHERE e.proof_type='maker_taker' AND e.asset_class='xstock_spot'),
cand AS (
  SELECT m.evidence_id, m.captured_at, p.entry_price,
         row_number() OVER (PARTITION BY m.evidence_id, m.captured_at ORDER BY abs(extract(epoch FROM (m.captured_at - p.created_at)))) AS rn
  FROM ev m JOIN rtb_shadow_pairings p
    ON p.symbol = m.symbol AND p.strategy = m.strategy AND p.asset_class = m.asset_class
   AND p.created_at BETWEEN m.captured_at - interval '600 seconds' AND m.captured_at + interval '600 seconds'),
j AS (
  SELECT e.period, e.chosen_entry_mode, c.entry_price AS E,
    ((e.maker_net_ev_adjusted + (1 - e.maker_fill_probability) * e.non_fill_cost_pct * c.entry_price) / NULLIF(e.maker_fill_probability,0)
      + e.adverse_selection_pct * c.entry_price - e.taker_net_ev) / c.entry_price AS adv
  FROM ev e JOIN cand c ON c.evidence_id = e.evidence_id AND c.captured_at = e.captured_at AND c.rn = 1)
SELECT period, coalesce(chosen_entry_mode,'(both)') AS mode, count(*) AS joined, count(adv) AS with_adv,
       count(*) FILTER (WHERE adv < 0.004) AS below_0_004,
       round(min(adv)::numeric,5) AS min_adv, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY adv))::numeric,5) AS median_adv,
       round(max(adv)::numeric,5) AS max_adv
FROM j GROUP BY ROLLUP (period, chosen_entry_mode) HAVING period IS NOT NULL ORDER BY period DESC, mode;
