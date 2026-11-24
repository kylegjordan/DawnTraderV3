export function csvEscape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function fixtureCsv(overrides = {}) {
  const sections = {
    meta: [{ catalog_version: 1, current_user: 'dt_reader', database: 'fixture', server_version_num: '180000', extracted_at_utc: '2026-11-24T00:00:00.000000Z' }],
    schemas: [{ name: 'auth', comment: null }, { name: 'public', comment: null }],
    relations: [
      { schema: 'auth', name: 'users', relkind: 'r', persistence: 'p', estimated_rows: 2, rls_enabled: true, rls_forced: false, comment: null, table_bytes: 10, index_bytes: 4, total_bytes: 14, last_analyze: null, last_autoanalyze: null },
      { schema: 'public', name: 'parents', relkind: 'p', persistence: 'p', estimated_rows: -1, rls_enabled: false, rls_forced: false, comment: 'parent', table_bytes: 0, index_bytes: 0, total_bytes: 0, last_analyze: null, last_autoanalyze: null },
      { schema: 'public', name: 'users', relkind: 'r', persistence: 'p', estimated_rows: 3, rls_enabled: false, rls_forced: false, comment: null, table_bytes: 20, index_bytes: 8, total_bytes: 28, last_analyze: null, last_autoanalyze: null },
      { schema: 'public', name: 'users_2026', relkind: 'r', persistence: 'p', estimated_rows: -1, rls_enabled: false, rls_forced: false, comment: null, table_bytes: 8, index_bytes: 2, total_bytes: 10, last_analyze: null, last_autoanalyze: null },
      { schema: 'public', name: 'user_view', relkind: 'v', persistence: 'p', estimated_rows: -1, rls_enabled: false, rls_forced: false, comment: null, table_bytes: null, index_bytes: null, total_bytes: null, last_analyze: null, last_autoanalyze: null },
    ],
    columns: [
      { schema: 'auth', relation: 'users', ordinal: 1, name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()', identity: null, generated: null, collation: null, comment: null },
      { schema: 'public', relation: 'parents', ordinal: 1, name: 'id', type: 'bigint', nullable: false, default: null, identity: 'a', generated: null, collation: null, comment: null },
      { schema: 'public', relation: 'users', ordinal: 1, name: 'id', type: 'bigint', nullable: false, default: null, identity: 'd', generated: null, collation: null, comment: null },
      { schema: 'public', relation: 'users', ordinal: 2, name: 'email', type: 'text', nullable: false, default: "'none'::text", identity: null, generated: null, collation: null, comment: null },
      { schema: 'public', relation: 'users', ordinal: 3, name: 'email_lower', type: 'text', nullable: true, default: 'lower(email)', identity: null, generated: 's', collation: null, comment: null },
      { schema: 'public', relation: 'users_2026', ordinal: 1, name: 'id', type: 'bigint', nullable: false, default: null, identity: null, generated: null, collation: null, comment: null },
      { schema: 'public', relation: 'user_view', ordinal: 1, name: 'id', type: 'bigint', nullable: true, default: null, identity: null, generated: null, collation: null, comment: null },
    ],
    constraints: [
      { schema: 'auth', relation: 'users', name: 'auth_users_pkey', type: 'p', definition: 'PRIMARY KEY (id)', columns: ['id'], referenced_schema: null, referenced_relation: null, referenced_columns: [], comment: null },
      { schema: 'public', relation: 'users', name: 'users_pkey', type: 'p', definition: 'PRIMARY KEY (id)', columns: ['id'], referenced_schema: null, referenced_relation: null, referenced_columns: [], comment: null },
      { schema: 'public', relation: 'users', name: 'users_email_key', type: 'u', definition: 'UNIQUE (email, id)', columns: ['email', 'id'], referenced_schema: null, referenced_relation: null, referenced_columns: [], comment: null },
      { schema: 'public', relation: 'users', name: 'users_email_check', type: 'c', definition: "CHECK (email <> '')", columns: ['email'], referenced_schema: null, referenced_relation: null, referenced_columns: [], comment: null },
      { schema: 'public', relation: 'users', name: 'users_auth_fk', type: 'f', definition: 'FOREIGN KEY (id) REFERENCES auth.users(id)', columns: ['id'], referenced_schema: 'auth', referenced_relation: 'users', referenced_columns: ['id'], comment: null },
    ],
    indexes: [{ schema: 'public', relation: 'users', name: 'users_email_idx', unique: false, primary: false, valid: true, definition: 'CREATE INDEX users_email_idx ON public.users (lower(email)) WHERE (email IS NOT NULL)', predicate: '(email IS NOT NULL)', columns: ['lower(email)'], comment: null }],
    partition_edges: [{ parent_schema: 'public', parent_relation: 'parents', child_schema: 'public', child_relation: 'users_2026', bound: 'FOR VALUES FROM (0) TO (100)' }],
    policies: [{ schema: 'auth', relation: 'users', name: 'self', permissive: true, command: 'r', roles: ['authenticated'], using: '(id = auth.uid())', check: null }],
    enums: [{ schema: 'public', name: 'side', label: 'buy', sort_order: 1 }, { schema: 'public', name: 'side', label: 'sell', sort_order: 2 }],
    ...overrides,
  };
  const order = ['meta', 'schemas', 'relations', 'columns', 'constraints', 'indexes', 'partition_edges', 'policies', 'enums'];
  const lines = ['section,section_order,row_order,payload_json'];
  order.forEach((section, sectionIndex) => {
    if (section !== 'meta') lines.push([section, sectionIndex + 1, 0, JSON.stringify({ _section_marker: true })].map(csvEscape).join(','));
    sections[section].forEach((payload, rowIndex) => {
    lines.push([section, sectionIndex + 1, rowIndex + 1, JSON.stringify(payload)].map(csvEscape).join(','));
    });
  });
  return `${lines.join('\n')}\n`;
}
