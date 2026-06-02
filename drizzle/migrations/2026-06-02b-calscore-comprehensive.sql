-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-02b · B-CALSCORE.b — COMPREHENSIVE re-seed of the Calibration Scoreboard
--
-- Kyle 2026-06-02: the v1 board showed only the headline "definitely off" findings,
-- which misrepresented the scope. Re-seed with the FULL Phase-24 xStock calibration
-- surface, grouped (one row per distinct setting-value; filter paths that share a
-- value collapse into one row noting the path count). EVERY Phase-24-calibrated
-- setting included; NO Phase-25 / closed-outcome items.
--
-- Adds `category` (owning step + group label) + `display_order` for organized
-- display. Clears the v1 B.0 rows and inserts the comprehensive set. Idempotent.
-- Rollback: 2026-06-02b-calscore-comprehensive-rollback.sql (drops the 2 columns;
--   the table itself rolls back via the v1 rollback).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE calibration_ledger ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE calibration_ledger ADD COLUMN IF NOT EXISTS display_order INT;

-- Clear v1 rows; re-seed comprehensively (display-only table, no external refs).
DELETE FROM calibration_ledger WHERE asset_class = 'xstock_spot';

INSERT INTO calibration_ledger
  (sub_batch, asset_class, setting_key, scope, category, display_order, metric_label, current_value, current_result_num, current_result_den, status, decision_grade, notes)
VALUES
-- ───────────────────────────── B.1 · Regime classification (thresholds → regime share is the measurable result) ─────────────────────────────
('B.0','xstock_spot','RANGE_BOUND_STABLE','regime','B.1 · Regime classification',10,'regime share (3wk) — the thresholds gate it','vol≤0.006 / DX≤35 / DBS≤0.10',8437,5970917,'baseline',TRUE,'~0% EVERY day — near-never classified. Top B.1 target: loosen RBS thresholds.'),
('B.0','xstock_spot','IMPULSE_EXPANSION','regime','B.1 · Regime classification',11,'regime share (3wk)','A: vol≥0.010,DX≥40 / B: vol≥0.0075,DBS≥0.50',240458,5970917,'baseline',TRUE,'~4%.'),
('B.0','xstock_spot','TREND_FRIENDLY_STABLE','regime','B.1 · Regime classification',12,'regime share (3wk)','A: mom≥0.0015,DX≥35 / DBS≥0.30',2312485,5970917,'baseline',TRUE,'~39%.'),
('B.0','xstock_spot','HIGH_VOLATILITY_UNSTABLE','regime','B.1 · Regime classification',13,'regime share (3wk)','vol≥0.0075 / mom≤-0.0015,DX≥45 / mom≤-0.0025',741349,5970917,'baseline',TRUE,'~12% (rising 5%→23% late-May — drift, likely genuine vol).'),
('B.0','xstock_spot','STRUCTURAL_TRANSITION','regime','B.1 · Regime classification',14,'regime share (3wk)','(fallback — no thresholds)',2668188,5970917,'baseline',TRUE,'~45% — dominant fallback; shrinks as the other regime bands are widened.'),
-- ───────────────────────────── B.2 · IMF filters (grouped by value; result = per-family reject, rolling-24h) ─────────────────────────────
('B.0','xstock_spot','lq_min','imf · 22 paths','B.2 · IMF filters',20,'LQ reject per family (ask-depth)','43',34285,56725,'baseline',TRUE,'#1: 43 ≈ ~$19,950 ask-depth (crypto-VOLUME carryover) → ~60% per family. Recalibrate onto depth scale + coordinate with min_depth.'),
('B.0','xstock_spot','lq_min','imf · vts_strong_trend','B.2 · IMF filters',21,'LQ reject (strong_trend)','30',0,56725,'baseline',TRUE,'≈ ~$1,000 ask-depth → barely filters (0% live).'),
('B.0','xstock_spot','lq_min','imf · active_strong_trend','B.2 · IMF filters',22,'LQ reject (strong_trend, active)','35',NULL,NULL,'baseline',TRUE,'≈ ~$3,162; active path not running in VTS — measure forward.'),
('B.0','xstock_spot','vn_max','imf · 11 vts paths','B.2 · IMF filters',23,'VN reject (rolling-24h)','0.95',2603,283625,'baseline',TRUE,'VN median 0.74 → 0.95 sits upper-tail → light filter (~0.9%).'),
('B.0','xstock_spot','vn_max','imf · 8 active paths','B.2 · IMF filters',24,'VN reject (active)','0.85',NULL,NULL,'baseline',TRUE,'Active path not running in VTS — measure forward.'),
('B.0','xstock_spot','vn_max','imf · 5 pattern/strong paths','B.2 · IMF filters',25,'VN reject (pattern/strong)','0.98',NULL,NULL,'baseline',TRUE,'Loosest VN bar.'),
('B.0','xstock_spot','di_max','imf · family_reversal','B.2 · IMF filters',26,'DI reject (reversal ceiling)','40',18103,56725,'baseline',TRUE,'Trims trending names on reversal — sensible.'),
('B.0','xstock_spot','di_max','imf · family_oscillator','B.2 · IMF filters',27,'DI reject (oscillator ceiling)','35',20069,56725,'baseline',TRUE,'Oscillator family slated for Phase-16 removal — confirm before tuning.'),
('B.0','xstock_spot','di_max','imf · active_oscillator','B.2 · IMF filters',28,'DI reject (oscillator, active)','30',NULL,NULL,'baseline',TRUE,'Active path — measure forward.'),
('B.0','xstock_spot','di_max','imf · 16 trend/breakout/strong paths','B.2 · IMF filters',29,'DI reject (no ceiling)','100',0,56725,'baseline',TRUE,'di_max=100 never binds.'),
('B.0','xstock_spot','di_min','imf · 8 trend/breakout paths','B.2 · IMF filters',30,'DI reject (floor)','10',0,56725,'baseline',TRUE,'di_min=10 never binds (DI rarely <10).'),
('B.0','xstock_spot','di_min','imf · 10 reversal/oscillator paths','B.2 · IMF filters',31,'DI reject (no floor)','0',0,56725,'baseline',TRUE,'di_min=0 never rejects.'),
('B.0','xstock_spot','di_min','imf · vts_quant','B.2 · IMF filters',32,'DI reject (quant floor)','15',NULL,NULL,'baseline',TRUE,'Quant-path DI floor.'),
('B.0','xstock_spot','di_min','imf · vts_pattern','B.2 · IMF filters',33,'DI reject (pattern floor)','3',NULL,NULL,'baseline',TRUE,'Pattern-path DI floor.'),
('B.0','xstock_spot','corr_max','imf · 30 paths','B.2 · IMF filters',34,'Correlation reject (rolling-24h)','0.92',0,283625,'baseline',TRUE,'NON-FUNCTIONAL (no benchmark → const 0.5). REMOVE from IMF at END of Phase-24 calibrations; canonical IMF = LQ/VN/DI; benchmark-modulator setup deferred to Phase 25.'),
-- ───────────────────────────── B.2 · Global admission gates ─────────────────────────────
('B.0','xstock_spot','min_depth_usd','global · quant/pattern vts','B.2 · Global gates',40,'min(ask,bid) reject (RTH)','2000',19,485,'baseline',TRUE,'Shallower-side hard gate; nearly redundant vs LQ. Reconcile the STATISTIC with LQ (ask-only).'),
('B.0','xstock_spot','min_depth_usd','global · quant/pattern active','B.2 · Global gates',41,'min(ask,bid) reject (RTH)','5000',65,485,'baseline',TRUE,'Active-mode hard depth gate.'),
('B.0','xstock_spot','max_bid_ask_spread','global · 22 paths','B.2 · Global gates',42,'spread reject (RTH)','1.0',5,485,'baseline',TRUE,'Spread median 0.08% / p99 0.81% → 1% barely bites. Target ~0.25-0.4% if it should screen.'),
('B.0','xstock_spot','max_bid_ask_spread','global · quant/pattern','B.2 · Global gates',43,'spread reject (RTH)','3.0',2,485,'baseline',TRUE,'3% essentially never bites.'),
('B.0','xstock_spot','max_bid_ask_spread','global · 2 paper-active paths','B.2 · Global gates',44,'spread reject','0.5',NULL,NULL,'baseline',TRUE,'Tightest spread bar (paper active).'),
('B.0','xstock_spot','max_bid_ask_spread','global · vts oscillator/reversal','B.2 · Global gates',45,'spread reject','1.5',NULL,NULL,'baseline',TRUE,'Looser spread bar on osc/reversal.'),
('B.0','xstock_spot','min_volume','global · all paths','B.2 · Global gates',46,'volume reject','0',0,60469,'baseline',TRUE,'INERT (set to 0 in B.1.5; depth-based LQ replaced it).'),
('B.0','xstock_spot','min_price','global','B.2 · Global gates',47,'price-floor reject (live)','1.00',2342,60469,'baseline',TRUE,'$1 floor.'),
('B.0','xstock_spot','max_price','global','B.2 · Global gates',48,'price-ceiling reject','(no cap)',NULL,NULL,'baseline',TRUE,'No cap per Kyle 2026-05-07.'),
('B.0','xstock_spot','final_score_min','global · scoring','B.2 · Global gates',49,'confidence-floor reject','0.35',NULL,NULL,'baseline',TRUE,'Same as crypto; tagged pending_layer_3.'),
('B.0','xstock_spot','confidence_threshold','global · scoring','B.2 · Global gates',50,'confidence-threshold reject','70',NULL,NULL,'baseline',TRUE,'Conservative Day-1; pending_layer_3.'),
('B.0','xstock_spot','min_ohlc_history_bars','global','B.2 · Global gates',51,'history reject','24',NULL,NULL,'baseline',TRUE,'~1 trading day of 60m bars.'),
('B.0','xstock_spot','di_min_quant','sqe · quant','B.2 · Global gates',52,'SQE DI floor (quant)','18',NULL,NULL,'baseline',TRUE,'Signal-quality-evaluator DI floor.'),
('B.0','xstock_spot','di_min_pattern','sqe · pattern','B.2 · Global gates',53,'SQE DI floor (pattern)','10',NULL,NULL,'baseline',TRUE,'SQE DI floor (pattern path).'),
-- ───────────────────────────── B.3 · Strategy gates (value = enabled/disabled; result = VTS firing rate, den 1879) ─────────────────────────────
('B.0','xstock_spot','vwap_pullback','strategy','B.3 · Strategy gates',60,'VTS firing rate','enabled',941,1879,'baseline',TRUE,'Dominant (~50%).'),
('B.0','xstock_spot','morning_star','strategy','B.3 · Strategy gates',61,'VTS firing rate','enabled',554,1879,'baseline',TRUE,'~29%.'),
('B.0','xstock_spot','sma_trend_ride','strategy','B.3 · Strategy gates',62,'VTS firing rate','enabled',162,1879,'baseline',TRUE,'~9%.'),
('B.0','xstock_spot','vwap_bounce','strategy','B.3 · Strategy gates',63,'VTS firing rate','enabled',73,1879,'baseline',TRUE,'~4%.'),
('B.0','xstock_spot','pivot_shift','strategy','B.3 · Strategy gates',64,'VTS firing rate','enabled',65,1879,'baseline',TRUE,'~3% (watchlist: pivot calc + overnight gap — D-audit).'),
('B.0','xstock_spot','range_trade','strategy','B.3 · Strategy gates',65,'VTS firing rate','enabled',61,1879,'baseline',TRUE,'~3% (watchlist: overnight bound-crossing).'),
('B.0','xstock_spot','mean_reversion','strategy','B.3 · Strategy gates',66,'VTS firing rate','enabled',2,1879,'baseline',TRUE,'Fires ~never (2). Watchlist: RSI excursion assumptions.'),
('B.0','xstock_spot','breakout','strategy','B.3 · Strategy gates',67,'VTS firing rate','enabled',0,1879,'baseline',TRUE,'ENABLED but NEVER fired in 3wk — D-audit.'),
('B.0','xstock_spot','inside_bar_reversal','strategy','B.3 · Strategy gates',68,'VTS firing rate','enabled',0,1879,'baseline',TRUE,'ENABLED but NEVER fired in 3wk — D-audit.'),
('B.0','xstock_spot','orb','strategy','B.3 · Strategy gates',69,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled; ORB redesign (5/15/30/60m opening-range) is a D-audit item.'),
('B.0','xstock_spot','strong_bull_trend','strategy','B.3 · Strategy gates',70,'VTS firing rate','disabled',21,1879,'baseline',TRUE,'GATE-BYPASS: disabled since 05-11 yet 21 opens 05-21→26 then ceased — D-audit root cause.'),
('B.0','xstock_spot','abcd_long','strategy','B.3 · Strategy gates',71,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','dhma','strategy','B.3 · Strategy gates',72,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','liquidity_trap','strategy','B.3 · Strategy gates',73,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','volatility_edge','strategy','B.3 · Strategy gates',74,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','defensive_hedge','strategy','B.3 · Strategy gates',75,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','reverse_impulse','strategy','B.3 · Strategy gates',76,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','support_bounce','strategy','B.3 · Strategy gates',77,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
('B.0','xstock_spot','adaptive_flow','strategy','B.3 · Strategy gates',78,'VTS firing rate','disabled',0,1879,'baseline',TRUE,'Disabled.'),
-- ───────────────────────────── B.4/B.5 · Friction & cost (result = Phase-24 measures vs observed; dash for now) ─────────────────────────────
('B.0','xstock_spot','feeRateTaker','friction','B.4/5 · Friction & cost',80,'taker fee','0.26%',NULL,NULL,'baseline',TRUE,'Kraken spot taker; calibrate per observed fills.'),
('B.0','xstock_spot','feeRateMaker','friction','B.4/5 · Friction & cost',81,'maker fee','0.16%',NULL,NULL,'baseline',TRUE,'Kraken spot maker.'),
('B.0','xstock_spot','spreadRateDefault','friction','B.4/5 · Friction & cost',82,'default spread cost','0.12%',NULL,NULL,'baseline',TRUE,'12 bps default; observed spread median ≈0.08% (B.0) → likely lower.'),
('B.0','xstock_spot','slippageRateDefault','friction','B.4/5 · Friction & cost',83,'default slippage','0.05%',NULL,NULL,'baseline',TRUE,'5 bps ARCA-aligned.'),
('B.0','xstock_spot','maxCostBound','friction','B.4/5 · Friction & cost',84,'round-trip cost cap','0.50%',NULL,NULL,'baseline',TRUE,'Total round-trip cap; current model ≈0.70% round-trip.'),
-- ───────────────────────────── B.6 · TEC stop PRIORS (Phase-24; posteriors are Phase-25) ─────────────────────────────
('B.0','xstock_spot','trail_distance_atr_multiplier','tec · trailing','B.6 · TEC stops (priors)',90,'trailing-stop ATR×','0.8',NULL,NULL,'baseline',TRUE,'PRIOR. ATR baseline ≈0.78%/hr (B.0) → 0.8×ATR ≈0.6%; result needs closed trades (Phase 25).'),
('B.0','xstock_spot','break_even_trigger_r','tec · break-even','B.6 · TEC stops (priors)',91,'break-even trigger (R)','1.0',NULL,NULL,'baseline',TRUE,'PRIOR. R-multiple to latch BE stop.'),
('B.0','xstock_spot','target_lock_r','tec · target','B.6 · TEC stops (priors)',92,'target-lock (R)','1.5',NULL,NULL,'baseline',TRUE,'PRIOR.'),
('B.0','xstock_spot','moonbag_qualifying_strategies','tec · moonbag','B.6 · TEC stops (priors)',93,'moonbag policy','[] (disabled)',NULL,NULL,'baseline',TRUE,'Moonbag disabled (Kyle 2026-05-05).'),
-- ───────────────────────────── B.7 · Sector concentration (NOT YET BUILT) ─────────────────────────────
('B.0','xstock_spot','sector_concentration_gate','sector','B.7 · Sector concentration',100,'per-sector cap','(not built)',NULL,NULL,'provisional',TRUE,'B.7 ADDS a per-sector max-positions / portfolio-heat gate (SSOT = XSTOCK_SPOT_REGISTRY sector). Universe: 15 sectors, XLK largest (78), 50 UNCATEGORIZED.'),
-- ───────────────────────────── C · Macro modifier ─────────────────────────────
('B.0','xstock_spot','macro_modifier','macro','C · Macro modifier',110,'confidence multiplier','1.0 (flat no-op)',NULL,NULL,'baseline',TRUE,'Flat 1.0 (b67_1_asset_class_no_op_active=true). C designs the VIX/DXY dial → [0.85,1.15]; crypto BTC-dominance/funding inputs are meaningless for equities.')
ON CONFLICT (sub_batch, asset_class, setting_key, scope) DO NOTHING;

COMMIT;
