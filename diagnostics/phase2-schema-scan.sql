-- Phase 2: Schema Integrity Audit
-- Scan for user_id columns in database schema

\echo '🔍 Phase 2: Database Schema User ID Scan'
\echo '=========================================='
\echo ''

-- Find all columns with user_id in the name
SELECT 
  table_schema,
  table_name, 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE column_name ILIKE '%user_id%'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_name, column_name;

\echo ''
\echo '📊 Results: Columns containing "user_id"'
\echo ''

-- Count total matches
SELECT 
  COUNT(*) as user_id_column_count
FROM information_schema.columns
WHERE column_name ILIKE '%user_id%'
  AND table_schema NOT IN ('pg_catalog', 'information_schema');

\echo ''
\echo '=========================================='
