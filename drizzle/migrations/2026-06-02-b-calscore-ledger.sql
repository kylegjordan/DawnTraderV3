-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-02 · B-CALSCORE — Calibration Scoreboard ledger
--
-- NEW read-only table backing the Analytics-page "Calibration" tab. One row per
-- calibrated setting: current value + current result (raw num/den, pct DERIVED
-- in the endpoint — num/den is SSOT, no hand-typed pct) vs planned value +
-- planned result (filled by each later calibration sub-batch). No win/loss
-- (P&L = Phase 25). Additive only; nothing else modified.
--
-- Seed = the 10 tunable threshold/gate rows from the B.0 baseline (current side
-- only; planned side NULL). Idempotent (ON CONFLICT DO NOTHING). The regime
-- RANGE_BOUND observation is intentionally EXCLUDED (Langston Step-1 C3 — it is
-- an observation, not a tunable; lives in B.0/B.1).
--
-- Rollback: 2026-06-02-b-calscore-ledger-rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS calibration_ledger (
  id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sub_batch           TEXT NOT NULL,                       -- batch that ESTABLISHED the current/baseline value
  planned_sub_batch   TEXT,                                -- batch that PROPOSED the planned value (Langston C1.1)
  asset_class         TEXT NOT NULL DEFAULT 'xstock_spot',
  setting_key         TEXT NOT NULL,                       -- e.g. 'lq_min', 'max_bid_ask_spread'
  scope               TEXT NOT NULL DEFAULT '*',           -- free-text convention (Langston C1.2): family_imf, quant_pattern_vts, ...
  metric_label        TEXT NOT NULL,                       -- what the reject rate measures
  current_value       TEXT,                                -- current threshold (text — may be non-numeric)
  current_result_num  BIGINT,                              -- numerator (SSOT — pct derived in endpoint)
  current_result_den  BIGINT,                              -- denominator
  planned_value       TEXT,                                -- nullable until a sub-batch proposes
  planned_result_num  BIGINT,
  planned_result_den  BIGINT,
  status              TEXT NOT NULL DEFAULT 'baseline',     -- baseline | proposed | applied | provisional
  decision_grade      BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- per-batch migration sets this explicitly on planned-side fill (C1.4)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS calibration_ledger_grain_idx
  ON calibration_ledger (sub_batch, asset_class, setting_key, scope);
CREATE INDEX IF NOT EXISTS calibration_ledger_asset_class_idx
  ON calibration_ledger (asset_class);

-- ── SEED: 10 tunable threshold/gate rows from the B.0 baseline (current side only) ──
INSERT INTO calibration_ledger
  (sub_batch, asset_class, setting_key, scope, metric_label, current_value, current_result_num, current_result_den, status, decision_grade, notes)
VALUES
  ('B.0','xstock_spot','lq_min','family_imf','LQ reject (RTH; ask-depth < ~$19,950)','43',338,485,'baseline',TRUE,
    '#1 finding: lq_min=43 is a crypto-volume carryover, now ~$20k on the depth scale. FINDING decision-grade; recalibration TARGET not yet (depth on ~1 day) — thicken forward / bound with range. B.2.'),
  ('B.0','xstock_spot','lq_min','family_strong_trend_vts','LQ reject strong_trend (RTH; ask-depth < ~$1,000)','30',9,485,'baseline',TRUE,
    'active lq_min=35 -> 19/485 (3.9%). Barely filters; far below family_imf 43.'),
  ('B.0','xstock_spot','min_depth_usd','quant_pattern_vts','min(ask,bid) reject (RTH)','2000',19,485,'baseline',TRUE,
    'Hard depth gate on the SHALLOWER side; nearly redundant vs LQ. B.2 must reconcile the statistic (LQ=ask-only).'),
  ('B.0','xstock_spot','min_depth_usd','quant_pattern_active','min(ask,bid) reject (RTH)','5000',65,485,'baseline',TRUE,
    'Active-mode hard depth gate. B.2.'),
  ('B.0','xstock_spot','max_bid_ask_spread','global_most','spread reject (RTH; spread > gate)','1.0',5,485,'baseline',TRUE,
    'Spread median 0.08% / p99 0.81% -> 1% gate barely bites. B.4/B.5 target ~0.25-0.4%.'),
  ('B.0','xstock_spot','max_bid_ask_spread','global_quant_pattern','spread reject (RTH; spread > gate)','3.0',2,485,'baseline',TRUE,
    '3% gate essentially never bites. B.4/B.5.'),
  ('B.0','xstock_spot','corr_max','imf_all','Correlation reject (rolling-24h IMF)','0.92',0,283625,'baseline',TRUE,
    'NON-FUNCTIONAL: called without a benchmark -> constant 0.5 -> rejects 0. Mis-placed inside IMF (canonical IMF = LQ/VN/DI). REMOVE from IMF at END of all calibrations; correlation stays a confidence modulator (Phase 25).'),
  ('B.0','xstock_spot','vn_max','imf_vts','VN reject (rolling-24h IMF)','0.95',2603,283625,'baseline',TRUE,
    'VN median 0.74 -> 0.95 threshold sits upper-tail -> light filter. B.2/B.3 judgment.'),
  ('B.0','xstock_spot','di_max','family_reversal','DI reject (rolling-24h; reversal ceiling)','40',18103,56725,'baseline',TRUE,
    'di_max ceiling trims trending names on the reversal family (sensible). di_min=10 never binds.'),
  ('B.0','xstock_spot','di_max','family_oscillator','DI reject (rolling-24h; oscillator ceiling)','35',20069,56725,'baseline',TRUE,
    'di_max ceiling on the oscillator family. Oscillator family slated for Phase-16 removal — confirm before tuning.')
ON CONFLICT (sub_batch, asset_class, setting_key, scope) DO NOTHING;

COMMIT;
