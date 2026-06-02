-- B.2 — record the LQ (liquidity) recalibration DECISION on the calibration scoreboard (planned side).
-- PROPOSAL ONLY — nothing live changes. Active trading is OFF; this fills the scoreboard's planned
-- column so the before/after is visible. The live screener_filters gate is changed at the APPLY/
-- point-tighten step (after the pre-APPLY load check + >=5 true-RTH sessions of depth).
--
-- DECISION (single value, not a range): lq_min 43 -> 38 for the main 22 family/pattern paths.
--   The LQ "score" is log10(askDepthUsd+1)*10 on a 0-100 scale (NOT dollars): 43 ~= $19,950 ask-depth,
--   38 ~= $6,309, 35 ~= $3,161. 43 is a crypto-VOLUME carryover that rejects the MEDIAN xStock book
--   (median ask-depth ~$16k). 38 is the lens-appropriate solid-fill floor: admits ~89% of names in the
--   depth replay (432/485), rejecting only the genuinely-thin sub-$6k books where a fill would be poor.
--   38 = the conservative end of the lens zone (Langston guardrail: do not go below ~38 until the
--   Phase-25 position-size anchor is set; true-RTH data may later support lowering toward 35).
--
-- planned_result LEFT NULL deliberately: the current_result (34,285/56,725) is a per-family LQ-reject
-- over a 3-week eval window; the depth replay is per-(symbol x 20-min) over a 2-day window that contains
-- NO true US-RTH session yet. Storing a 2-day names-basis number next to the 3-week per-family number
-- would be apples-to-oranges. The matched-denominator planned_result fills at the point-tighten once
-- true-RTH depth accumulates. (Replay impact, plain: lq_min 43 admits 149/485 names; 38 admits 432/485.)
--
-- UNCHANGED this batch: strong_trend lanes (lq_min 30/35 stay LOOSER than main 38 -> Q4 ordering holds,
-- does not fire); min_depth_usd ($2,000 vts is a coherent thin-book floor, 9.4% two-way reject; $5,000
-- active flagged "revisit at the active-trading flip / Phase 19"). min_volume keep-inert (separate note).

UPDATE calibration_ledger
SET planned_value      = '38',
    planned_result_num = NULL,
    planned_result_den = NULL,
    planned_sub_batch  = 'B.2',
    status             = 'proposed',
    updated_at         = NOW()
WHERE asset_class = 'xstock_spot'
  AND sub_batch   = 'B.0'
  AND setting_key = 'lq_min'
  AND scope       = 'imf · 22 paths';

-- Rollback:
-- UPDATE calibration_ledger SET planned_value=NULL, planned_result_num=NULL, planned_result_den=NULL,
--   planned_sub_batch=NULL, status='baseline', updated_at=NOW()
-- WHERE asset_class='xstock_spot' AND sub_batch='B.0' AND setting_key='lq_min' AND scope='imf · 22 paths';
