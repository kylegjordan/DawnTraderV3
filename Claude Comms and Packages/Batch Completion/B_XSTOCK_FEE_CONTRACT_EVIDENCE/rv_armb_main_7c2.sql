SET statement_timeout = '600s';
CREATE TEMP TABLE _al(symbol text PRIMARY KEY);
INSERT INTO _al VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD');
CREATE TEMP TABLE _x AS
SELECT a.captured_at, a.symbol, a.mode, a.source, a.strategy, a.reject_stage,
       a.gate_decision->>'gate' AS gate, (al.symbol IS NOT NULL) AS alias,
       CASE WHEN a.captured_at < '2026-09-11T00:00:00Z' THEN 'PRE'
            WHEN a.captured_at < '2026-09-11T20:09:47Z' THEN 'PRE-DAY'
            WHEN a.captured_at < '2026-09-14T08:34:00Z' THEN 'S0'
            WHEN a.captured_at < '2026-09-15T11:59:00Z' THEN 'S1'
            WHEN a.captured_at < '2026-09-19T00:02:00Z' THEN 'S2'
            WHEN a.captured_at < '2026-09-20T21:19:40Z' THEN 'S3'
            WHEN a.captured_at < '2026-09-22T14:38:00Z' THEN 'S4'
            ELSE 'S5' END AS seg
FROM signal_eval_archive a LEFT JOIN _al al ON al.symbol=a.symbol
WHERE a.captured_at >= '2026-08-31T00:00:00Z' AND a.captured_at < '2026-09-29T14:00:00Z'
  AND a.asset_class='xstock_spot'
  AND (a.gate_decision->>'gate'='net_ev_floor' OR a.mode='paper_sim');
\echo == per-day pre (B1 vts, any-mode gate, B2) split alias
SELECT captured_at::date d, extract(isodow from captured_at) dow, alias,
  count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') b1a,
  count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') b1g,
  count(*) FILTER (WHERE gate='net_ev_floor') gate_anymode,
  count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') b2
FROM _x WHERE seg IN ('PRE','PRE-DAY') GROUP BY 1,2,3 ORDER BY 1,3;
\echo == per segment
SELECT seg, alias,
  count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') b1a,
  count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') b1g,
  round(100.0*count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted')/NULLIF(count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor'),0),3) b1pct,
  count(*) FILTER (WHERE gate='net_ev_floor') gate_anymode,
  count(*) FILTER (WHERE gate='net_ev_floor' AND reject_stage='admitted') gate_anymode_adm,
  count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') b2,
  count(DISTINCT date_trunc('hour',captured_at)) FILTER (WHERE gate='net_ev_floor') act_h
FROM _x WHERE seg NOT IN ('PRE','PRE-DAY') GROUP BY 1,2 ORDER BY 1,2;
\echo == weekend rows post-deploy (isodow 6,7) by alias/mode/gate
SELECT alias, mode, gate, reject_stage, count(*) FROM _x WHERE seg NOT IN ('PRE') AND extract(isodow from captured_at) IN (6,7)
 GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
\echo == first/last gate row per weekday post-deploy (verdict pop)
SELECT captured_at::date d, extract(isodow from captured_at) dow, min(captured_at), max(captured_at), count(DISTINCT date_trunc('hour',captured_at)) h
FROM _x WHERE gate='net_ev_floor' AND NOT alias AND captured_at >= '2026-09-11' GROUP BY 1,2 ORDER BY 1;
\echo == B2 per-day post
SELECT captured_at::date d, alias, count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') b2,
 count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') b1a,
 count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') b1g
FROM _x WHERE captured_at >= '2026-09-11' GROUP BY 1,2 ORDER BY 1,2;
\echo == strategy split per seg (verdict, vts gate)
SELECT seg, strategy, count(*) FILTER (WHERE reject_stage='admitted') a, count(*) g
FROM _x WHERE mode='vts' AND gate='net_ev_floor' AND NOT alias AND strategy IN ('vwap_pullback','strong_bull_trend') GROUP BY 1,2 ORDER BY 1,2;
\echo == B2 by source per seg
SELECT seg, alias, source, count(*) FROM _x WHERE mode='paper_sim' AND reject_stage='admitted' GROUP BY 1,2,3 ORDER BY 1,2,3;
