-- B72 Step 3 — Commit A — Rollback for DBS Routing Guards Group Migration
DELETE FROM module_constants
 WHERE module_name = 'strategy_dbs_routing_guards'
   AND constant_name = 'dbs_min_threshold'
   AND strategy IN ('strong_bull_trend', 'defensive_hedge', 'reverse_impulse', 'morning_star');
