-- B-XSTOCK-FEE-CONTRACT (#1010) Arm B read, part 2 (context + 3n.v strategies). CC-B worker, READ-ONLY.
SET statement_timeout = '600s';
\set deploy_at '2026-09-11T20:09:47Z'
\set cutoff '2026-09-29T14:00:00Z'

CREATE TEMP TABLE _alias(symbol text PRIMARY KEY);
INSERT INTO _alias VALUES
  ('A/USD'), ('ADI/USD'), ('CAT/USD'), ('CVX/USD'), ('DASH/USD'), ('EDU/USD'), ('ES/USD'), ('IR/USD'), ('MET/USD'),
  ('OPEN/USD'), ('PEP/USD'), ('STRK/USD'), ('STX/USD'), ('SUI/USD'), ('T/USD'), ('WELL/USD'), ('WEN/USD');

CREATE TEMP TABLE _r AS
SELECT a.captured_at, a.symbol, a.mode, a.source, a.strategy, a.reject_stage,
       a.gate_decision->>'gate' AS gate, a.gate_decision->>'reason' AS reason,
       (al.symbol IS NOT NULL) AS is_alias,
       CASE WHEN a.captured_at < :'deploy_at'::timestamptz THEN 'BASE'
            WHEN a.captured_at < '2026-09-14T08:34:00Z'::timestamptz THEN 'S0'
            WHEN a.captured_at < '2026-09-15T11:59:00Z'::timestamptz THEN 'S1'
            WHEN a.captured_at < '2026-09-19T00:02:00Z'::timestamptz THEN 'S2'
            WHEN a.captured_at < '2026-09-20T21:19:40Z'::timestamptz THEN 'S3'
            WHEN a.captured_at < '2026-09-22T14:38:00Z'::timestamptz THEN 'S4'
            ELSE 'S5' END AS seg
FROM signal_eval_archive a
LEFT JOIN _alias al ON al.symbol = a.symbol
WHERE ((a.captured_at >= :'deploy_at'::timestamptz AND a.captured_at < :'cutoff'::timestamptz)
    OR (a.captured_at >= '2026-09-04T00:00:00Z'::timestamptz AND a.captured_at < '2026-09-11T00:00:00Z'::timestamptz
        AND date_trunc('day', a.captured_at) IN ('2026-09-04T00:00:00Z'::timestamptz, '2026-09-07T00:00:00Z'::timestamptz,
              '2026-09-08T00:00:00Z'::timestamptz, '2026-09-09T00:00:00Z'::timestamptz, '2026-09-10T00:00:00Z'::timestamptz)))
  AND a.asset_class = 'xstock_spot'
  AND (a.strategy IN ('vwap_pullback', 'strong_bull_trend', 'sma_trend_ride', 'morning_star', 'pivot_shift') OR a.mode = 'paper_sim');
SELECT count(*) AS rows_read FROM _r;

\echo === (L) the two 3n.v strategies: every xStock archive row by stage, per segment (where do they stop?) ===
SELECT seg, strategy, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part, mode, reject_stage, gate, count(*)
FROM _r WHERE strategy IN ('vwap_pullback', 'strong_bull_trend')
GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 2, 1, 3 DESC, 4, 5, 6;

\echo === (J) CONTEXT (not pre-registered): setup-level view at the gate. Distinct symbol x strategy x UTC-day at net_ev_floor, and how many had >=1 admit ===
SELECT seg, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part, strategy,
       count(DISTINCT (symbol, date_trunc('day', captured_at))) AS sym_days_at_gate,
       count(DISTINCT (symbol, date_trunc('day', captured_at))) FILTER (WHERE reject_stage = 'admitted') AS sym_days_admitted,
       count(*) AS gate_rows
FROM _r WHERE mode = 'vts' AND gate = 'net_ev_floor'
GROUP BY 1, 2, 3 ORDER BY 3, 1, 2 DESC;

\echo === (K) B2 engine rows (source active-execution-engine = a paper position OPENED) by strategy per segment ===
SELECT seg, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part, strategy, count(*)
FROM _r WHERE mode = 'paper_sim' AND reject_stage = 'admitted' AND source = 'active-execution-engine'
GROUP BY 1, 2, 3 ORDER BY 1, 2 DESC, 3;
