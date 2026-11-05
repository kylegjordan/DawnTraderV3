-- ROLLBACK for 2026-11-05-b-xstock-dbs-to-strategies.sql (not in MANIFEST).
-- Roll back the CODE first: with the code still deployed, removing these rows makes volatility_edge's detect and the
-- crypto strong-trend attach throw (getCachedNumberRequired), which on crypto loses every later strategy for the
-- pair/symbol that cycle (pre-audit §1.3).
BEGIN;
DELETE FROM module_constants WHERE updated_by = 'b-xstock-dbs-to-strategies';
COMMIT;
