-- P19-B8.5 — exploration daily_budget 28 -> 50 per class (Kyle's explicit word,
-- 2026-07-15 "let's proceed on all of these things", following the crew debate;
-- Langston: "changes sample SIZE, not fidelity — lowest-risk lever, paper-only,
-- reversible"). The anneal re-timing that keeps the floor evidence-keyed at this
-- rate (step 60 on INFORMATIVE closes) shipped in the exit-integrity migration.
UPDATE module_constants
SET value = '50', updated_by = 'p19-b8-5-budget-50'
WHERE module_name = 'exploration_lane' AND constant_name = 'daily_budget'
  AND asset_class IN ('crypto_spot', 'xstock_spot');
