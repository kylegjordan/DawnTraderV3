-- B-XSTOCK-FEE-CONTRACT (#1010) Arm B read, CC-B worker, READ-ONLY. Pinned cutoff for reproducibility.
SET statement_timeout = '600s';
\set deploy_at '2026-09-11T20:09:47Z'
\set cutoff '2026-10-02T20:09:47Z'

CREATE TEMP TABLE _alias(symbol text PRIMARY KEY);
INSERT INTO _alias VALUES
  ('A/USD'), ('ADI/USD'), ('CAT/USD'), ('CVX/USD'), ('DASH/USD'), ('EDU/USD'), ('ES/USD'), ('IR/USD'), ('MET/USD'),
  ('OPEN/USD'), ('PEP/USD'), ('STRK/USD'), ('STX/USD'), ('SUI/USD'), ('T/USD'), ('WELL/USD'), ('WEN/USD');

-- Window rows: every xStock row at the net_ev_floor gate (B1 object) + every xStock paper_sim row (B2 object + context).
CREATE TEMP TABLE _w AS
SELECT a.captured_at, a.symbol, a.mode, a.source, a.strategy, a.reject_stage,
       a.gate_decision->>'gate' AS gate,
       (a.gate_decision ? 'chosenMode') AS has_chosen_mode,
       a.gate_decision->>'netEvFloor' AS floor_v,
       (al.symbol IS NOT NULL) AS is_alias,
       CASE WHEN a.captured_at < '2026-09-14T08:34:00Z'::timestamptz THEN 'S0'
            WHEN a.captured_at < '2026-09-15T11:59:00Z'::timestamptz THEN 'S1'
            WHEN a.captured_at < '2026-09-19T00:02:00Z'::timestamptz THEN 'S2'
            WHEN a.captured_at < '2026-09-20T21:19:40Z'::timestamptz THEN 'S3'
            WHEN a.captured_at < '2026-09-22T14:38:00Z'::timestamptz THEN 'S4'
            ELSE 'S5' END AS seg
FROM signal_eval_archive a
LEFT JOIN _alias al ON al.symbol = a.symbol
WHERE a.captured_at >= :'deploy_at'::timestamptz AND a.captured_at < :'cutoff'::timestamptz
  AND a.asset_class = 'xstock_spot'
  AND (a.gate_decision->>'gate' = 'net_ev_floor' OR a.mode = 'paper_sim');

-- Baseline rows: the five frozen Step-6 days, same filter, to re-derive the frozen figures (positive control).
CREATE TEMP TABLE _b AS
SELECT a.captured_at, a.symbol, a.mode, a.source, a.strategy, a.reject_stage,
       a.gate_decision->>'gate' AS gate,
       (a.gate_decision ? 'chosenMode') AS has_chosen_mode,
       a.gate_decision->>'netEvFloor' AS floor_v,
       (al.symbol IS NOT NULL) AS is_alias,
       'BASE'::text AS seg
FROM signal_eval_archive a
LEFT JOIN _alias al ON al.symbol = a.symbol
WHERE a.captured_at >= '2026-09-04T00:00:00Z'::timestamptz AND a.captured_at < '2026-09-11T00:00:00Z'::timestamptz
  AND date_trunc('day', a.captured_at) IN ('2026-09-04T00:00:00Z'::timestamptz, '2026-09-07T00:00:00Z'::timestamptz,
        '2026-09-08T00:00:00Z'::timestamptz, '2026-09-09T00:00:00Z'::timestamptz, '2026-09-10T00:00:00Z'::timestamptz)
  AND a.asset_class = 'xstock_spot'
  AND (a.gate_decision->>'gate' = 'net_ev_floor' OR a.mode = 'paper_sim');

SELECT (SELECT count(*) FROM _w) AS window_rows, (SELECT count(*) FROM _b) AS baseline_rows,
       (SELECT min(captured_at) FROM _w) AS w_first, (SELECT max(captured_at) FROM _w) AS w_last;

\echo === (A) CONTROL: re-derive the frozen Step-6 figures from the same five days (expect 100/54136; 105; 98/50633/103; 2/3503/2) ===
SELECT date_trunc('day', captured_at)::date AS day,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS b1_adm,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS b1_gate,
       count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') AS b2_adm
FROM _b GROUP BY ROLLUP (1) ORDER BY 1 NULLS LAST;
SELECT CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS b1_adm,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS b1_gate,
       count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') AS b2_adm
FROM _b GROUP BY 1 ORDER BY 1 DESC;

\echo === (B) PER SEGMENT: B1 (mode=vts, as the frozen query) and B2, verdict population vs the 17 alias symbols ===
SELECT seg, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS b1_adm,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS b1_gate,
       round(100.0 * count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted')
             / NULLIF(count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor'), 0), 3) AS b1_pct,
       count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') AS b2_adm,
       min(captured_at) AS first_row, max(captured_at) AS last_row
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x
GROUP BY 1, 2 ORDER BY 1, 2 DESC;

\echo === (B-lit) B1 on the pre-audit's LITERAL definition (no mode filter): any-mode rows at net_ev_floor, by mode ===
SELECT seg, mode, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part,
       count(*) FILTER (WHERE reject_stage='admitted') AS adm, count(*) AS at_gate
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE gate='net_ev_floor'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3 DESC;

\echo === (C) PER UTC DAY x SEGMENT: active hours (hours with any xStock VTS net_ev_floor row), B1 and B2, verdict and alias ===
SELECT seg, date_trunc('day', captured_at)::date AS day, to_char(captured_at AT TIME ZONE 'UTC', 'Dy') AS dow,
       count(DISTINCT date_trunc('hour', captured_at)) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS active_h,
       count(*) FILTER (WHERE NOT is_alias AND mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS v_b1_adm,
       count(*) FILTER (WHERE NOT is_alias AND mode='vts' AND gate='net_ev_floor') AS v_b1_gate,
       count(*) FILTER (WHERE NOT is_alias AND mode='paper_sim' AND reject_stage='admitted') AS v_b2,
       count(*) FILTER (WHERE is_alias AND mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS a_b1_adm,
       count(*) FILTER (WHERE is_alias AND mode='vts' AND gate='net_ev_floor') AS a_b1_gate,
       count(*) FILTER (WHERE is_alias AND mode='paper_sim' AND reject_stage='admitted') AS a_b2
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x
GROUP BY 1, 2, 3 ORDER BY 2, 1;

\echo === (D) TRADING-DAY EQUIVALENTS per segment: sum over UTC days of (active hours in segment / active hours that day) ===
WITH h AS (
  SELECT seg, date_trunc('day', captured_at) AS d, date_trunc('hour', captured_at) AS hr
  FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE mode='vts' AND gate='net_ev_floor'
  GROUP BY 1, 2, 3
), dayh AS (SELECT d, count(DISTINCT hr) AS day_h FROM h GROUP BY 1),
segday AS (SELECT seg, d, count(DISTINCT hr) AS seg_h FROM h GROUP BY 1, 2)
SELECT s.seg, count(*) AS utc_days_touched, round(sum(s.seg_h::numeric / dy.day_h), 3) AS trading_day_equiv,
       sum(s.seg_h) AS active_hours
FROM segday s JOIN dayh dy USING (d) GROUP BY 1 ORDER BY 1;

\echo === (E) B1 and B2 BY STRATEGY per segment (verdict population; alias in (E2)) ===
SELECT seg, strategy,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS b1_adm,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS b1_gate,
       count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') AS b2_adm
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE NOT is_alias
GROUP BY 1, 2 HAVING count(*) FILTER (WHERE (mode='vts' AND gate='net_ev_floor') OR (mode='paper_sim' AND reject_stage='admitted')) > 0
ORDER BY 1, 2;
\echo === (E2) the same, the 17 alias symbols only ===
SELECT seg, strategy,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor' AND reject_stage='admitted') AS b1_adm,
       count(*) FILTER (WHERE mode='vts' AND gate='net_ev_floor') AS b1_gate,
       count(*) FILTER (WHERE mode='paper_sim' AND reject_stage='admitted') AS b2_adm
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE is_alias
GROUP BY 1, 2 HAVING count(*) FILTER (WHERE (mode='vts' AND gate='net_ev_floor') OR (mode='paper_sim' AND reject_stage='admitted')) > 0
ORDER BY 1, 2;

\echo === (F) WRITER SHAPE at the gate: eval-cycle rows carry chosenMode; the vts-runner caller-side row does not ===
SELECT seg, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part, mode, source, has_chosen_mode, reject_stage, count(*)
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE gate='net_ev_floor'
GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 1, 2 DESC, 3, 4, 5, 6;

\echo === (G) the net-EV floor value recorded on reject rows, per segment ===
SELECT seg, floor_v, count(*) FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x
WHERE gate='net_ev_floor' AND reject_stage <> 'admitted' GROUP BY 1, 2 ORDER BY 1, 2;

\echo === (H) B2 by writer (source, gate) per segment, verdict vs alias ===
SELECT seg, CASE WHEN is_alias THEN 'alias17' ELSE 'verdict' END AS part, source, gate, count(*)
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE mode='paper_sim' AND reject_stage='admitted'
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2 DESC, 3, 4;

\echo === (I) CONTEXT: xStock paper_sim rows that are NOT admitted, per segment (the B2 denominator the archive lacks) ===
SELECT seg, reject_stage, source, gate, count(*)
FROM (SELECT * FROM _w UNION ALL SELECT * FROM _b) x WHERE mode='paper_sim' AND reject_stage <> 'admitted'
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4;
