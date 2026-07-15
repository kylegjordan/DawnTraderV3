-- P19-B8.5 sizing tune, iteration 2 (the Langston-signed design is "risk knob tunes to
-- pin ~$150 — MEASURED, not guessed"; this is the measurement doing its job): at the
-- first-pass 2.70% the live opens landed at ~$209 notional (measured on 5 real
-- positions at the $2,400 balance — the sizing relation is ~7.75%/1% risk, steeper
-- than the $800-era estimate). 2.70 x (150/209) = 1.94 -> 1.95% pins ~$150.
UPDATE guardrails_v2
SET portfolio_risk_per_trade_pct = 1.95,
    last_updated = NOW(),
    last_updated_by = 'p19-b8-5-sizing-tune-2 (measured iteration)'
WHERE mode = 'paper';
