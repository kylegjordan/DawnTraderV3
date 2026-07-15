-- P19-B8.5 (soak fix D) — one-time correction of the $800-clobbered paper balance.
--
-- WHAT HAPPENED (full trace in RUNNING_ISSUES #510 / the B8.5 completion report):
-- the /api/active-engine/start CONTINUE leg called getPortfolioState with a bare
-- string instead of a { mode } params object (the B-NEW-43 chunk-14 positional-args
-- bug, missed at this site), got undefined on every continue, and fell back to a
-- hardcoded $800 — which the REB 2.8.11 start-sync then wrote over the anchored
-- Kraken-mirror balance. Anchor-ledger truth (portfolio_anchor_events, start_new
-- b8d41be5, 2026-07-14 14:57Z): $824.11.
--
-- The WHERE is deliberately exact-match on the clobbered value so this can never
-- touch a legitimately different future balance; idempotent (0 rows on re-run).
UPDATE portfolio_state
SET balance = '824.11', last_update = NOW()
WHERE mode = 'paper' AND global_context_id = 'default' AND balance = '800.00';

-- Re-align any RUNNING paper session row still carrying the clobbered value, so
-- session/state stay coherent without waiting for the next restart (the code-side
-- ANCHOR_GUARD now enforces this on every future start).
UPDATE active_engine_sessions
SET starting_balance = '824.11'
WHERE mode = 'paper' AND status = 'running' AND starting_balance = '800.00';
