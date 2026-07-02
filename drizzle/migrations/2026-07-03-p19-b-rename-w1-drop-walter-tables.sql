-- P19-B-RENAME Wave-1 (Kyle ruling 2026-07-03, rule 18): DROP the Walter-era
-- paper_daily_briefs + paper_ai_reports tables. Both live-verified EMPTY (0 rows,
-- Supabase 2026-07-03); nothing ever wrote them (their create/update storage methods
-- had zero callers — the OpenAI-via-API "Walter" embed they served never worked).
-- The daily-reports concept returns later rebuilt on our own ML (POST_AUDIT_ROADMAP).
-- Forward-only; rollback = restore from the pre-drop schema in git history (empty tables).

DROP TABLE IF EXISTS paper_daily_briefs;
DROP TABLE IF EXISTS paper_ai_reports;
