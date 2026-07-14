-- B-EVIDENCE-SINK — durable switch-on behavioral-evidence sink (3 proofs), CC-A 2026-07-14.
-- Extracts the FINALSCORE_SHADOW / EV_REJECT / maker-taker-pick proofs from the now-rotating stdout
-- (B-OPS-PM2-LOG #499: ~2d hold) into a retained, queryable, tiered table so the WEEKS-long paper-
-- validation window survives (STORAGE_POLICY §5.5 — valuable signals extracted from the rotated firehose).
-- Consumed by CC-B's B8.5 switch-on batch (the three §9.1 proofs) + Phase-25 pFill calibration (25-x).
-- Migration applied BEFORE code deploy (b75 retention sweep fails hard if the data_lifecycle key is absent).

BEGIN;

-- Partition-key PK requires an in-key id source; a sequence keeps evidence_id monotonic across partitions.
CREATE SEQUENCE IF NOT EXISTS switch_on_shadow_evidence_id_seq;

CREATE TABLE IF NOT EXISTS switch_on_shadow_evidence (
  captured_at            TIMESTAMPTZ  NOT NULL,
  evidence_id            BIGINT       NOT NULL DEFAULT nextval('switch_on_shadow_evidence_id_seq'),
  proof_type             TEXT         NOT NULL,   -- discriminator: 'sqe_shadow' | 'ev_reject' | 'maker_taker'
  -- Common decision context (self-describing — no join back to any base row).
  symbol                 TEXT         NOT NULL,
  strategy               TEXT         NOT NULL,
  asset_class            TEXT         NOT NULL,
  regime                 TEXT,
  source_pool            TEXT,
  mode                   TEXT         NOT NULL,   -- 'paper' | 'live'
  -- (i) sqe_shadow — would the RETIRED finalScore gate have rejected? (evidence for the post-paper field-kill).
  final_score            NUMERIC(12, 8),
  final_score_threshold  NUMERIC(12, 8),
  would_have_rejected    BOOLEAN,
  -- (ii) ev_reject — the 11.8B open-stage net-EV backstop reject = the RATE NUMERATOR (per occurrence,
  --      timestamped, with the offending netEV). DENOMINATOR = post-SQE admissions from CC-B's switch-on
  --      funnel (NOT a column here); the "EV_REJECT rate ~ 0 = gates-not-drifted" proof pairs the two.
  chosen_net_ev          NUMERIC(20, 10),         -- the offending chosen netEV (<= 0)
  reject_reason          TEXT,
  -- (iii) maker_taker — the pick PLUS the decision-time HAIRCUT SNAPSHOT (the Phase-25 pFill-calibration
  --       substrate; rtb_signals is transient (expires_at + clearQueue DELETE) and holds only pick OUTPUTS,
  --       never the APPLIED haircut inputs, so this is additive not a duplicate — see B_EVIDENCE_SINK_PRE_AUDIT).
  chosen_entry_mode      TEXT,                    -- 'maker' | 'taker'
  taker_net_ev           NUMERIC(20, 10),
  maker_net_ev_adjusted  NUMERIC(20, 10),
  signal_strength        NUMERIC(12, 8),          -- the flat_pwin_base strength driving adverse-selection
  adverse_selection_pct  NUMERIC(14, 10),         -- A = base + mult*signalStrength, AS APPLIED
  non_fill_cost_pct      NUMERIC(14, 10),         -- C, AS APPLIED (continuation/reversal adjusted)
  maker_fill_probability NUMERIC(6, 4),           -- pFill ASSUMED at decision time (the calibration target)
  hard_floor_fired       BOOLEAN,
  -- Proof-specific columns are NULL for the other two proof_types BY DESIGN (three STAGES, one lifecycle —
  -- documented; NOT the finalScore-blend anti-pattern which fabricated a per-decision correlation).
  PRIMARY KEY (captured_at, evidence_id)
) PARTITION BY RANGE (captured_at);

-- proof_type + time index: the per-window rate/cohort queries (EV_REJECT rate, maker-pick rate, shadow cohort).
CREATE INDEX IF NOT EXISTS switch_on_shadow_evidence_type_time
  ON switch_on_shadow_evidence (proof_type, captured_at);

-- Pre-create monthly partitions 2026-07 → 2027-07 (b70-create-monthly-partitions self-heals forward 12mo).
DO $$
DECLARE month_start DATE; month_end DATE; partition_name TEXT; i INTEGER;
BEGIN
  FOR i IN 0..12 LOOP
    month_start := DATE '2026-07-01' + (i || ' months')::INTERVAL;
    month_end   := month_start + INTERVAL '1 month';
    partition_name := 'switch_on_shadow_evidence_' || TO_CHAR(month_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partition_name, 'switch_on_shadow_evidence', month_start, month_end
    );
  END LOOP;
END $$;

-- Retention: HOT 90 days (≥ the paper-validation window + analysis lag, Langston ≥60d) then tier
-- hot→warm→cold move-not-delete via the B75 sweep (STORAGE_POLICY §3). never-drop.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'switch_on_shadow_evidence.hot_retention_days', '90'::jsonb, 'b-evidence-sink')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
