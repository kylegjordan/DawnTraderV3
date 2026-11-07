# B-PRICE-FEED-COVERAGE (#1222) — live module_constants, age-related rows (Step-2 evidence)

**Read 2026-11-08 ~00:0xZ on staging** (`psql` as `deploy`, read-only), filtering on all SIX primary-key columns as returned (`module_name, exchange, asset_class, strategy, regime, constant_name` — Langston's r8 note: a one-column read returns a false zero, a two-column filter collapses per-class rows). Filter: `constant_name ~* '(age|stale|fresh|cold|quiet|window_ms|interval_ms|silence|ttl|throttle|ceiling)'` OR `module_name ~* '(fresh|stale|staleness|liveness|fill_safety|depth_gate|mark_staleness|close_fill|passive_archive|feed_health|price_discovery)'`. **110 rows of 1,057** in the table. Values truncated to 60 characters (`vlen` = full length). The filter is a widening net, so non-age rows are included; an age setting whose name matches neither pattern would be missed — Step 2 reconciles this list against the census rows' own key names.

Observations for the plan: `passive_archive.b74_ticker_snapshot_min_interval_ms` = **4000** live (code default 1,000 — the xStock sampling throttle is the live value, as Langston's r7 condition 1 required); `fill_depth_gate.warmth_max_age_ms` crypto 5000 / xStock 15000; `xstock_fill_safety.active_fill_max_age_ms` 15000; `mark_staleness` floor 15000 / cap 300000 / budget_k 0.5 / cold 15000; `price_discovery_liveness` xStock enabled, min_moves 1, min_snaps 5, window 2,700,000; **`market_data.data_freshness_window_ms` xStock 90000 — not in the keyword census; its reader is for the seam-first enumeration to name**; **no `promotion_price_max_age_ms` row** (B-ENTRY-GATE increment B's P7 seed is not deployed — expected absent).

```
         module_name          | exchange | asset_class |     strategy      | regime |              constant_name              |                            value               
------------------------------+----------+-------------+-------------------+--------+-----------------------------------------+------------------------------------------------
 active_execution             | *        | *           | *                 | *      | monitoring_interval_ms                  | 1500                                           
 active_execution             | *        | *           | *                 | *      | rtb_promotion_loop_interval_ms          | 30000                                          
 amr_friction_sample          | *        | xstock_spot | *                 | *      | freshness_window_seconds                | 150                                            
 amr_friction_sample          | *        | xstock_spot | *                 | *      | min_fresh_names                         | 25                                             
 amr_input_health             | *        | crypto_spot | *                 | *      | staleness_tolerance_epochs              | 10                                             
 amr_input_health             | *        | xstock_spot | *                 | *      | staleness_tolerance_epochs              | 10                                             
 book_state                   | *        | xstock_spot | *                 | *      | feed_stub_window_ms                     | 90000                                          
 book_state                   | *        | xstock_spot | *                 | *      | ri_abs_spread_ceiling_pct               | 1.0                                            
 close_fill_contract          | *        | crypto_spot | *                 | *      | cold_refusal_cap                        | 60                                             
 close_fill_contract          | *        | xstock_spot | *                 | *      | cold_refusal_cap                        | 60                                             
 close_fill_contract          | *        | crypto_spot | *                 | *      | up_tol                                  | 0.01                                           
 close_fill_contract          | *        | xstock_spot | *                 | *      | up_tol                                  | 0.01                                           
 close_fill_contract          | *        | crypto_spot | *                 | *      | witness_max_age_ms                      | 21600000                                       
 cost_geometry                | *        | *           | *                 | *      | geometry_max_age_ms                     | 180000                                         
 data_lifecycle               | *        | *           | *                 | *      | cold_bucket                             | "dt-archive-cold"                              
 data_lifecycle               | *        | *           | *                 | *      | cold_prefix                             | ""                                             
 data_lifecycle               | *        | *           | *                 | *      | cold_provider                           | "b2"                                           
 data_lifecycle               | *        | *           | *                 | *      | cold_rotator_dry_run                    | false                                          
 dbs_calculation              | *        | xstock_spot | *                 | *      | sector_coverage_floor                   | 7                                              
 expectancy_kernel            | *        | *           | *                 | *      | pwin_ceiling                            | 0.60                                           
 feed_health                  | *        | crypto_spot | *                 | *      | critical_age_ms                         | 10000                                          
 feed_health                  | *        | xstock_spot | *                 | *      | critical_age_ms                         | 120000                                         
 feed_health                  | *        | crypto_spot | *                 | *      | recorder_live_share_floor               | 0.60                                           
 feed_health                  | *        | crypto_spot | *                 | *      | recorder_live_window_ms                 | 7200000                                        
 feed_health                  | *        | xstock_spot | *                 | *      | warmup_grace_ms                         | 120000                                         
 feed_health                  | *        | crypto_spot | *                 | *      | warning_age_ms                          | 5000                                           
 feed_health                  | *        | xstock_spot | *                 | *      | warning_age_ms                          | 60000                                          
 fill_depth_gate              | *        | crypto_spot | *                 | *      | beyond_depth_penalty_bps                | 50                                             
 fill_depth_gate              | *        | xstock_spot | *                 | *      | beyond_depth_penalty_bps                | 50                                             
 fill_depth_gate              | *        | crypto_spot | *                 | *      | min_levels                              | 3                                              
 fill_depth_gate              | *        | xstock_spot | *                 | *      | min_levels                              | 1                                              
 fill_depth_gate              | *        | crypto_spot | *                 | *      | sufficiency_multiple                    | 3                                              
 fill_depth_gate              | *        | xstock_spot | *                 | *      | sufficiency_multiple                    | 2                                              
 fill_depth_gate              | *        | crypto_spot | *                 | *      | warmth_max_age_ms                       | 5000                                           
 fill_depth_gate              | *        | xstock_spot | *                 | *      | warmth_max_age_ms                       | 15000                                          
 friction_divergence          | *        | crypto_spot | *                 | *      | min_reanchor_interval_ms                | 86400000                                       
 friction_divergence          | *        | xstock_spot | *                 | *      | min_reanchor_interval_ms                | 86400000                                       
 macro_modifier               | *        | *           | *                 | *      | b67_1_external_feed_stale_seconds       | 300                                            
 macro_modifier               | *        | xstock_spot | *                 | *      | b67_1_external_feed_stale_seconds       | 300                                            
 mark_staleness               | *        | xstock_spot | *                 | *      | budget_k                                | 0.5                                            
 mark_staleness               | *        | xstock_spot | *                 | *      | cap_ms                                  | 300000                                         
 mark_staleness               | *        | xstock_spot | *                 | *      | cold_mark_max_ms                        | 15000                                          
 mark_staleness               | *        | xstock_spot | *                 | *      | floor_ms                                | 15000                                          
 mark_staleness               | *        | xstock_spot | *                 | *      | null_stop_budget_pct                    | 0.005                                          
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_classwide_percentile              | 0.90                                           
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_max_age_ms                        | 900000                                         
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_min_observations                  | 200                                            
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_query_timeout_ms                  | 4000                                           
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_refresh_after_ms                  | 300000                                         
 mark_staleness               | *        | xstock_spot | *                 | *      | sigma_window_ms                         | 1800000                                        
 market_data                  | *        | xstock_spot | *                 | *      | data_freshness_window_ms                | 90000                                          
 passive_archive              | *        | *           | *                 | *      | b74_crypto_capture_enabled              | true                                           
 passive_archive              | *        | *           | *                 | *      | b74_crypto_min_volume_24h_usd           | 10000                                          
 passive_archive              | *        | *           | *                 | *      | b74_equity_capture_enabled              | true                                           
 passive_archive              | *        | *           | *                 | *      | b74_partition_lookhead_months           | 12                                             
 passive_archive              | *        | *           | *                 | *      | b74_perp_capture_enabled                | true                                           
 passive_archive              | *        | *           | *                 | *      | b74_ticker_snapshot_min_interval_ms     | 4000                                           
 passive_archive              | *        | *           | *                 | *      | b74_ws_reconnect_max_backoff_sec        | 30                                             
 passive_archive              | *        | *           | *                 | *      | crypto_perp_capture_enabled             | true                                           
 passive_archive              | *        | *           | *                 | *      | crypto_perp_universe.classified         | [{"base": "BTC", "quote": "USD", "symbol": "PF_
 passive_archive              | *        | *           | *                 | *      | crypto_perp_universe.last_recompute_at  | "2026-08-19T21:20:59.715Z"                     
 passive_archive              | *        | *           | *                 | *      | crypto_perp_universe.max_symbols        | 400                                            
 passive_archive              | *        | *           | *                 | *      | crypto_perp_universe.members            | ["PF_1INCHUSD", "PF_2ZUSD", "PF_AAVEUSD", "PF_A
 passive_archive              | *        | *           | *                 | *      | crypto_spot_silence_ms                  | 120000                                         
 passive_archive              | *        | *           | *                 | *      | futures_silence_ms                      | 120000                                         
 passive_archive              | *        | *           | *                 | *      | ohlc_frame_skip_alert_streak            | 10                                             
 passive_archive              | *        | *           | *                 | *      | recorder_subscribe_reply_timeout_ms     | 15000                                          
 passive_archive              | *        | *           | *                 | *      | recorder_watch_clear_after_data_ms      | 600000                                         
 passive_archive              | *        | *           | *                 | *      | recorder_watch_consecutive_forced_alert | 3                                              
 passive_archive              | *        | *           | *                 | *      | recorder_watch_forced_per_hour_alert    | 12                                             
 passive_archive              | *        | crypto_perp | *                 | *      | ticker_snapshot_min_interval_ms         | 10000                                          
 passive_archive              | *        | *           | *                 | *      | xstock_perp_universe.classified         | ["PF_GLDXUSD", "PF_QQQXUSD", "PF_SPYXUSD", "PF_
 price_discontinuity_detector | *        | *           | *                 | *      | corp_action_ttl_seconds                 | 86400                                          
 price_discontinuity_detector | kraken   | crypto_spot | *                 | *      | corp_action_ttl_seconds                 | 86400                                          
 price_discontinuity_detector | kraken   | xstock_spot | *                 | *      | corp_action_ttl_seconds                 | 86400                                          
 price_discontinuity_detector | *        | *           | *                 | *      | halt_hard_ceiling_seconds               | 300                                            
 price_discontinuity_detector | kraken   | crypto_spot | *                 | *      | halt_hard_ceiling_seconds               | 300                                            
 price_discontinuity_detector | kraken   | xstock_spot | *                 | *      | halt_hard_ceiling_seconds               | 300                                            
 price_discontinuity_detector | *        | *           | *                 | *      | symbol_cache_stale_seconds              | 86400                                          
 price_discontinuity_detector | kraken   | crypto_spot | *                 | *      | symbol_cache_stale_seconds              | 86400                                          
 price_discontinuity_detector | kraken   | xstock_spot | *                 | *      | symbol_cache_stale_seconds              | 86400                                          
 price_discovery_liveness     | *        | xstock_spot | *                 | *      | enabled                                 | true                                           
 price_discovery_liveness     | *        | xstock_spot | *                 | *      | min_moves                               | 1                                              
 price_discovery_liveness     | *        | xstock_spot | *                 | *      | min_snaps                               | 5                                              
 price_discovery_liveness     | *        | xstock_spot | *                 | *      | query_timeout_ms                        | 2000                                           
 price_discovery_liveness     | *        | xstock_spot | *                 | *      | window_ms                               | 2700000                                        
 qd_probe                     | *        | xstock_spot | *                 | *      | freshness_ceiling_ms                    | 600000                                         
 ranking_context_bonus        | *        | xstock_spot | *                 | *      | spy_bar_staleness_minutes               | 45                                             
 regime_age                   | *        | *           | *                 | *      | b68_4_target_age_hours                  | 6.0                                            
 regime_age                   | *        | xstock_spot | *                 | *      | b68_4_target_age_hours                  | 2.0                                            
 rtb_config                   | *        | *           | *                 | *      | geometry_max_age_ms                     | 180000                                         
 rtb_config                   | *        | crypto_perp | *                 | *      | refresh_interval_ms                     | 30000                                          
 rtb_config                   | *        | crypto_spot | *                 | *      | refresh_interval_ms                     | 30000                                          
 rtb_config                   | *        | xstock_perp | *                 | *      | refresh_interval_ms                     | 30000                                          
 rtb_config                   | *        | xstock_spot | *                 | *      | refresh_interval_ms                     | 30000                                          
 signal_orchestrator          | *        | *           | *                 | *      | evaluation_interval_ms                  | 30000                                          
 signal_orchestrator          | *        | *           | *                 | *      | weights_cache_refresh_ms                | 60000                                          
 strategy.dhma                | *        | *           | dhma              | *      | confidence_ceiling                      | 0.9                                            
 strategy.dhma                | *        | *           | dhma              | *      | post_mtf_confidence_ceiling             | 0.95                                           
 strategy.strong_bull_trend   | *        | *           | strong_bull_trend | *      | max_confidence_ceiling                  | 0.95                                           
 trailing_exit                | *        | crypto_perp | *                 | *      | rung_floor_slippage_buffer_multiplier   | 1.0                                            
 trailing_exit                | *        | crypto_spot | *                 | *      | rung_floor_slippage_buffer_multiplier   | 1.0                                            
 trailing_exit                | *        | xstock_perp | *                 | *      | rung_floor_slippage_buffer_multiplier   | 1.0                                            
 trailing_exit                | *        | xstock_spot | *                 | *      | rung_floor_slippage_buffer_multiplier   | 1.0                                            
 venue_quiet                  | *        | xstock_spot | *                 | *      | quiet_ticking_min                       | 346                                            
 xstock_fill_safety           | *        | xstock_spot | *                 | *      | active_fill_max_age_ms                  | 15000                                          
 xstock_fill_safety           | *        | xstock_spot | *                 | *      | liquid_fill_window_close_min_et         | 960                                            
 xstock_fill_safety           | *        | xstock_spot | *                 | *      | liquid_fill_window_open_min_et          | 570                                            
 xstock_fill_safety           | *        | xstock_spot | *                 | *      | stall_reconnect_ms_offrth               | 750000                                         
 xstock_fill_safety           | *        | xstock_spot | *                 | *      | stall_reconnect_ms_rth                  | 75000                                          
(110 rows)

 total_rows 
------------
       1057
(1 row)

```
