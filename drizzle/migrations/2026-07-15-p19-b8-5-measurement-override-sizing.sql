-- P19-B8.5 — the $150/trade measurement-window sizing (Kyle framework decision
-- 2026-07-15: fix the LIVE-intended per-trade size first, then set paper to trade AT
-- that size with more slots; Langston-signed: $150 over $250, max-position cap 20%,
-- heat inside the standing 100% envelope, kill-switch slot-count-invariant).
--
-- 1) portfolio_anchor_events.note — free-text provenance (Langston requirement: a
--    later reader must never misread a deliberate override as a Kraken mirror).
ALTER TABLE portfolio_anchor_events ADD COLUMN IF NOT EXISTS note text;

-- 2) Paper guardrails: max position 12% -> 20% (named AC — $150 at live $824 = 18.2%,
--    20% gives headroom without inviting $250-class concentration), and per-trade risk
--    3.00% -> 2.70% to pin the average notional at ~$150 on the ~$2,400 override
--    balance (empirically derived: observed avg notional ≈ 7% of balance at 3.00%
--    risk; 2.70% ≈ 6.3% of $2,400 ≈ $150; 15 slots x $150 = $2,250 = 94% of balance,
--    inside the untouched 100% total-exposure cap). max_open_positions stays 15.
--    These fields are Kyle-LOCKED (locked_by_user) — the lock stops AUTO-tuning; this
--    change is the Kyle-directed act the lock reserves ("you can make the change to
--    the guardrail", 2026-07-15).
UPDATE guardrails_v2
SET max_position_percent_pct = 20.00,
    portfolio_risk_per_trade_pct = 2.70,
    last_updated = NOW(),
    last_updated_by = 'p19-b8-5-measurement-sizing (Kyle-directed)'
WHERE mode = 'paper';

-- NOTE: the $2,400 balance override itself is NOT written here — raw SQL would bypass
-- the single-writer principle this same batch established. It is minted through
-- executeReanchor('measurement_override') by the one-off script
-- server/scripts/b8-5-measurement-override.ts (note REQUIRED, paper-only enforced).
