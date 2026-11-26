-- #1073 P4. Export with the approved read-only route at the terminal cut.
-- psql -X -qAt -v ON_ERROR_STOP=1 -v activation_utc=... -v receipt_ids_json='[...]' -f this-file
-- receipt_ids_json contains the exact trade IDs from the independent receipt enumeration.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
WITH bounds AS (
  SELECT :'activation_utc'::timestamptz AS activation,
    :'activation_utc'::timestamptz + interval '168 hours' AS placements_until,
    :'activation_utc'::timestamptz + interval '192 hours' AS terminal_at
), logged AS (
  SELECT jsonb_array_elements_text(:'receipt_ids_json'::jsonb) AS id
), positions AS (
  SELECT p.id AS position_id, p.metadata->>'tradeId' AS trade_id, p.mode, p.asset_class,
    p.symbol, p.state, p.opened_at,
    (extract(epoch FROM p.maker_placed_at) * 1000)::bigint AS placed_at_ms,
    (extract(epoch FROM p.maker_deadline AT TIME ZONE 'UTC') * 1000)::bigint AS deadline_at_ms
  FROM active_open_positions p CROSS JOIN bounds b
  WHERE p.mode = 'paper' AND p.asset_class IN ('crypto_spot', 'xstock_spot')
    AND (p.state = 'pending' OR p.chosen_entry_mode = 'maker')
    AND (p.metadata->>'tradeId' IN (SELECT id FROM logged)
      OR p.opened_at >= b.activation AND p.opened_at < b.terminal_at
      OR p.maker_placed_at >= b.activation AND p.maker_placed_at < b.placements_until)
), trades AS (
  SELECT t.id AS trade_id, t.mode, t.asset_class, t.symbol, t.side,
    t.opened_at, t.closed_at, t.close_reason, t.exit_price::text AS exit_price,
    t.entry_decision_price::text AS entry_decision_price,
    t.metadata->'paperMakerPlacement' AS placement,
    t.metadata->'paperMakerRefusal' AS refusal,
    t.metadata->'paperMakerTerminal' AS terminal,
    t.metadata->>'neverFilledReason' AS unfilled_reason
  FROM closed_trades t CROSS JOIN bounds b
  WHERE t.mode = 'paper' AND t.asset_class IN ('crypto_spot', 'xstock_spot')
    AND (t.id IN (SELECT id FROM logged)
      OR t.id IN (SELECT trade_id FROM positions)
      OR t.chosen_entry_mode = 'maker' AND (
        -- opened_at is sampled after the placement clock. A commit without a receipt or
        -- stamp near the seven-day edge can leave only a terminal row in the next day.
        t.opened_at >= b.activation AND t.opened_at < b.terminal_at
        OR CASE WHEN jsonb_typeof(t.metadata->'paperMakerPlacement'->'makerPlacedAtMs') = 'number'
          THEN (t.metadata->'paperMakerPlacement'->>'makerPlacedAtMs')::numeric
            >= extract(epoch FROM b.activation) * 1000
            AND (t.metadata->'paperMakerPlacement'->>'makerPlacedAtMs')::numeric
            < extract(epoch FROM b.placements_until) * 1000
          ELSE false
        END))
)
SELECT jsonb_build_object(
  'version', 1, 'captured_at', statement_timestamp(),
  'activation', b.activation, 'placements_until', b.placements_until, 'terminal_at', b.terminal_at,
  'receipt_ids', COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM logged), '[]'::jsonb),
  'trades', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.trade_id) FROM trades t), '[]'::jsonb),
  'positions', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.position_id) FROM positions p), '[]'::jsonb)
) FROM bounds b;
COMMIT;
