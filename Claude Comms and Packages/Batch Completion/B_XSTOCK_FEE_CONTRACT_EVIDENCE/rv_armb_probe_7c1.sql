SET statement_timeout = '600s';
SELECT now();
SELECT a.mode, a.source, a.reject_stage, count(*), min(a.captured_at), max(a.captured_at)
FROM signal_eval_archive a
WHERE a.captured_at >= '2026-09-22T00:00:00Z' AND a.captured_at < '2026-09-23T00:00:00Z'
  AND a.asset_class='xstock_spot' AND a.gate_decision->>'gate'='net_ev_floor'
GROUP BY 1,2,3 ORDER BY 1,2,3;
SELECT jsonb_object_keys(gate_decision) k, count(*) FROM (
 SELECT gate_decision FROM signal_eval_archive a
 WHERE a.captured_at >= '2026-09-22T00:00:00Z' AND a.captured_at < '2026-09-22T06:00:00Z'
  AND a.asset_class='xstock_spot' AND a.gate_decision->>'gate'='net_ev_floor' LIMIT 2000) s GROUP BY 1 ORDER BY 1;
SELECT gate_decision FROM signal_eval_archive a
 WHERE a.captured_at >= '2026-09-22T00:00:00Z' AND a.captured_at < '2026-09-22T06:00:00Z'
  AND a.asset_class='xstock_spot' AND a.gate_decision->>'gate'='net_ev_floor' AND reject_stage='admitted' LIMIT 1;
SELECT gate_decision FROM signal_eval_archive a
 WHERE a.captured_at >= '2026-09-22T00:00:00Z' AND a.captured_at < '2026-09-22T06:00:00Z'
  AND a.asset_class='xstock_spot' AND a.gate_decision->>'gate'='net_ev_floor' AND reject_stage<>'admitted' LIMIT 1;
