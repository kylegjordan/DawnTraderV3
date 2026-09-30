SET statement_timeout = '600s';
CREATE TEMP TABLE _al(symbol text PRIMARY KEY);
INSERT INTO _al VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD');
CREATE TEMP TABLE _x AS
SELECT a.captured_at, a.mode, a.reject_stage, (al.symbol IS NOT NULL) AS alias,
       CASE WHEN a.captured_at < '2026-09-11T20:09:47Z' THEN 'PRE'
            WHEN a.captured_at < '2026-09-14T08:34:00Z' THEN 'S0'
            WHEN a.captured_at < '2026-09-15T11:59:00Z' THEN 'S1'
            WHEN a.captured_at < '2026-09-19T00:02:00Z' THEN 'S2'
            WHEN a.captured_at < '2026-09-22T14:38:00Z' THEN 'S4'
            ELSE 'S5' END AS seg,
       CASE WHEN extract(hour from a.captured_at) BETWEEN 13 AND 19 THEN 'h13-19' ELSE 'other' END AS hb
FROM signal_eval_archive a LEFT JOIN _al al ON al.symbol=a.symbol
WHERE a.captured_at >= '2026-09-03T00:00:00Z' AND a.captured_at < '2026-09-29T14:00:00Z'
  AND a.asset_class='xstock_spot' AND a.gate_decision->>'gate'='net_ev_floor' AND a.mode='vts'
  AND NOT (a.captured_at >= '2026-09-07' AND a.captured_at < '2026-09-08');
SELECT seg, hb, count(*) FILTER (WHERE reject_stage='admitted') a, count(*) g,
  round(100.0*count(*) FILTER (WHERE reject_stage='admitted')/count(*),3) pct
FROM _x WHERE NOT alias GROUP BY 1,2 ORDER BY 1,2;
\echo == 09-14 split at 08:34
SELECT captured_at < '2026-09-14T08:34:00Z' AS before_p2, count(*) FILTER (WHERE reject_stage='admitted') a, count(*) g
FROM _x WHERE NOT alias AND captured_at >= '2026-09-14' AND captured_at < '2026-09-15' GROUP BY 1;
\echo == 09-11 split at deploy
SELECT captured_at < '2026-09-11T20:09:47Z' AS before_dep, count(*) FILTER (WHERE reject_stage='admitted') a, count(*) g
FROM _x WHERE NOT alias AND captured_at >= '2026-09-11' AND captured_at < '2026-09-12' GROUP BY 1;
\echo == 08-31..09-03 PRE hourband same slots as S0 (Fri 20-24 + Mon 00-08:34)
SELECT count(*) FILTER (WHERE reject_stage='admitted') a, count(*) g FROM _x WHERE NOT alias AND seg='PRE'
 AND ((extract(isodow from captured_at)=5 AND extract(hour from captured_at)>=20) OR (extract(isodow from captured_at)=1 AND (extract(hour from captured_at)<8 OR (extract(hour from captured_at)=8 AND extract(minute from captured_at)<34))));
