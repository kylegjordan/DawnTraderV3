-- P19-B8.5b (OBJ-1, #206/B-NEW-53.3) — the decision-time indicator scalars + the
-- settled-window hash on signal_eval_provenance.
--
-- WHAT: the five scalars the strategies actually READ at decision time (per the
-- 19-strategy read-surface enumeration, P19_B8_5b_PRE_AUDIT.md: vwap ×5 consumers,
-- atr universal via the reachability guard, sma ×1, high/low24h ×2) + CURRENT volume
-- (the volume-confirm compares' real input — avg-volume deliberately NOT persisted:
-- zero scalar consumers, always recomputed from candles) + settled_window_hash
-- (versioned 'swh1:' sha256 over the settled bar window — the byte-parity oracle for
-- array-fed reads: volume walks, patterns, ORB; B_NEW_53 findings §4.0).
-- WHY: lifts decision-replay fidelity from the measured 70.73% (B-NEW-53 parity)
-- toward the ≥99% gate; unblocks roadmap 25-12 after post-flip accrual.
-- SAFETY: purely ADDITIVE nullable columns (honest NULL where a hook had no
-- indicators in scope); ALTER on the partitioned parent propagates to partitions.
ALTER TABLE signal_eval_provenance
  ADD COLUMN IF NOT EXISTS ind_vwap double precision,
  ADD COLUMN IF NOT EXISTS ind_atr double precision,
  ADD COLUMN IF NOT EXISTS ind_sma double precision,
  ADD COLUMN IF NOT EXISTS ind_high24h double precision,
  ADD COLUMN IF NOT EXISTS ind_low24h double precision,
  ADD COLUMN IF NOT EXISTS ind_current_volume double precision,
  ADD COLUMN IF NOT EXISTS settled_window_hash text;
