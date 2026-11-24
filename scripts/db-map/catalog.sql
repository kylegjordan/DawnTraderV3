WITH
mapped_namespaces AS (
  SELECT n.oid, n.nspname
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname <> 'information_schema'
    AND n.nspname <> 'pg_catalog'
    AND n.nspname !~ '^pg_toast'
),
mapped_relations AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname, c.relkind, c.relpersistence,
         c.reltuples, c.relrowsecurity, c.relforcerowsecurity,
         pg_catalog.obj_description(c.oid, 'pg_class') AS comment,
         CASE WHEN c.relkind IN ('r','p','m') THEN pg_catalog.pg_table_size(c.oid) END AS table_bytes,
         CASE WHEN c.relkind IN ('r','p','m') THEN pg_catalog.pg_indexes_size(c.oid) END AS index_bytes,
         CASE WHEN c.relkind IN ('r','p','m') THEN pg_catalog.pg_total_relation_size(c.oid) END AS total_bytes,
         s.last_analyze, s.last_autoanalyze
  FROM pg_catalog.pg_class AS c
  JOIN mapped_namespaces AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_stat_all_tables AS s ON s.relid = c.oid
  WHERE c.relkind IN ('r','p','v','m','f')
),
meta_rows AS (
  SELECT 1::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'catalog_version', 1,
           'current_user', current_user,
           'database', current_database(),
           'server_version_num', current_setting('server_version_num'),
           'extracted_at_utc', pg_catalog.to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         ) AS payload
),
schema_rows AS (
  SELECT row_number() OVER (ORDER BY nspname)::bigint AS row_order,
         pg_catalog.jsonb_build_object('name', nspname, 'comment', pg_catalog.obj_description(oid, 'pg_namespace')) AS payload
  FROM mapped_namespaces
),
relation_rows AS (
  SELECT row_number() OVER (ORDER BY schema_name, relname)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', schema_name, 'name', relname, 'relkind', relkind,
           'persistence', relpersistence, 'estimated_rows', reltuples,
           'rls_enabled', relrowsecurity, 'rls_forced', relforcerowsecurity,
           'comment', comment, 'table_bytes', table_bytes,
           'index_bytes', index_bytes, 'total_bytes', total_bytes,
           'last_analyze', last_analyze, 'last_autoanalyze', last_autoanalyze
         ) AS payload
  FROM mapped_relations
),
column_rows AS (
  SELECT row_number() OVER (ORDER BY r.schema_name, r.relname, a.attnum)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', r.schema_name, 'relation', r.relname, 'ordinal', a.attnum,
           'name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
           'nullable', NOT a.attnotnull,
           'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
           'identity', NULLIF(a.attidentity, ''),
           'generated', NULLIF(a.attgenerated, ''),
           'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE co.collname END,
           'comment', pg_catalog.col_description(a.attrelid, a.attnum)
         ) AS payload
  FROM mapped_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  LEFT JOIN pg_catalog.pg_collation AS co ON co.oid = a.attcollation
),
constraint_parts AS (
  SELECT con.oid, con.conname, con.contype, con.conrelid, con.confrelid,
         r.schema_name, r.relname,
         rr.schema_name AS referenced_schema, rr.relname AS referenced_relation,
         pg_catalog.pg_get_constraintdef(con.oid, true) AS definition,
         pg_catalog.obj_description(con.oid, 'pg_constraint') AS comment,
         COALESCE((
           SELECT pg_catalog.jsonb_agg(a.attname ORDER BY u.ordinality)
           FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ordinality)
           JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = u.attnum
         ), '[]'::jsonb) AS columns,
         COALESCE((
           SELECT pg_catalog.jsonb_agg(a.attname ORDER BY u.ordinality)
           FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ordinality)
           JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.confrelid AND a.attnum = u.attnum
         ), '[]'::jsonb) AS referenced_columns
  FROM pg_catalog.pg_constraint AS con
  JOIN mapped_relations AS r ON r.oid = con.conrelid
  LEFT JOIN mapped_relations AS rr ON rr.oid = con.confrelid
  WHERE con.contype IN ('p','u','c','f')
),
constraint_rows AS (
  SELECT row_number() OVER (ORDER BY schema_name, relname, conname)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', schema_name, 'relation', relname, 'name', conname,
           'type', contype, 'definition', definition, 'columns', columns,
           'referenced_schema', referenced_schema, 'referenced_relation', referenced_relation,
           'referenced_columns', referenced_columns, 'comment', comment
         ) AS payload
  FROM constraint_parts
),
index_rows AS (
  SELECT row_number() OVER (ORDER BY r.schema_name, r.relname, ic.relname)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', r.schema_name, 'relation', r.relname, 'name', ic.relname,
           'unique', i.indisunique, 'primary', i.indisprimary, 'valid', i.indisvalid,
           'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
           'predicate', pg_catalog.pg_get_expr(i.indpred, i.indrelid),
           'columns', COALESCE((
             SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid, u.ordinality::integer, true) ORDER BY u.ordinality)
             FROM unnest(i.indkey) WITH ORDINALITY AS u(attnum, ordinality)
           ), '[]'::jsonb),
           'comment', pg_catalog.obj_description(i.indexrelid, 'pg_class')
         ) AS payload
  FROM pg_catalog.pg_index AS i
  JOIN mapped_relations AS r ON r.oid = i.indrelid
  JOIN pg_catalog.pg_class AS ic ON ic.oid = i.indexrelid
),
partition_rows AS (
  SELECT row_number() OVER (ORDER BY pn.nspname, p.relname, cn.nspname, c.relname)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'parent_schema', pn.nspname, 'parent_relation', p.relname,
           'child_schema', cn.nspname, 'child_relation', c.relname,
           'bound', pg_catalog.pg_get_expr(c.relpartbound, c.oid)
         ) AS payload
  FROM pg_catalog.pg_inherits AS inh
  JOIN pg_catalog.pg_class AS p ON p.oid = inh.inhparent
  JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.relnamespace
  JOIN pg_catalog.pg_class AS c ON c.oid = inh.inhrelid
  JOIN pg_catalog.pg_namespace AS cn ON cn.oid = c.relnamespace
  JOIN mapped_relations AS mapped_parent ON mapped_parent.oid = p.oid
  JOIN mapped_relations AS mapped_child ON mapped_child.oid = c.oid
),
policy_rows AS (
  SELECT row_number() OVER (ORDER BY r.schema_name, r.relname, p.polname)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', r.schema_name, 'relation', r.relname, 'name', p.polname,
           'permissive', p.polpermissive, 'command', p.polcmd,
           'roles', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_userbyid(role_oid) ORDER BY pg_catalog.pg_get_userbyid(role_oid)) FROM unnest(p.polroles) AS role_oid), '[]'::jsonb),
           'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           'check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
         ) AS payload
  FROM pg_catalog.pg_policy AS p
  JOIN mapped_relations AS r ON r.oid = p.polrelid
),
enum_rows AS (
  SELECT row_number() OVER (ORDER BY n.nspname, t.typname, e.enumsortorder)::bigint AS row_order,
         pg_catalog.jsonb_build_object(
           'schema', n.nspname, 'name', t.typname, 'label', e.enumlabel,
           'sort_order', e.enumsortorder
         ) AS payload
  FROM pg_catalog.pg_type AS t
  JOIN mapped_namespaces AS n ON n.oid = t.typnamespace
  JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
),
presence_rows(section, section_order, row_order, payload) AS (
  VALUES
    ('schemas'::text, 2::integer, 0::bigint, '{"_section_marker":true}'::jsonb),
    ('relations', 3, 0, '{"_section_marker":true}'::jsonb),
    ('columns', 4, 0, '{"_section_marker":true}'::jsonb),
    ('constraints', 5, 0, '{"_section_marker":true}'::jsonb),
    ('indexes', 6, 0, '{"_section_marker":true}'::jsonb),
    ('partition_edges', 7, 0, '{"_section_marker":true}'::jsonb),
    ('policies', 8, 0, '{"_section_marker":true}'::jsonb),
    ('enums', 9, 0, '{"_section_marker":true}'::jsonb)
),
stream AS (
  SELECT 'meta'::text AS section, 1::integer AS section_order, row_order, payload FROM meta_rows
  UNION ALL SELECT section, section_order, row_order, payload FROM presence_rows
  UNION ALL SELECT 'schemas', 2, row_order, payload FROM schema_rows
  UNION ALL SELECT 'relations', 3, row_order, payload FROM relation_rows
  UNION ALL SELECT 'columns', 4, row_order, payload FROM column_rows
  UNION ALL SELECT 'constraints', 5, row_order, payload FROM constraint_rows
  UNION ALL SELECT 'indexes', 6, row_order, payload FROM index_rows
  UNION ALL SELECT 'partition_edges', 7, row_order, payload FROM partition_rows
  UNION ALL SELECT 'policies', 8, row_order, payload FROM policy_rows
  UNION ALL SELECT 'enums', 9, row_order, payload FROM enum_rows
)
SELECT section, section_order, row_order, payload::text AS payload_json
FROM stream
ORDER BY section_order, row_order;
