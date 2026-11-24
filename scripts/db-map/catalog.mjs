import { CONFIG } from './config.mjs';
import { assert, parseCsv, relationKey } from './util.mjs';

function jsonPayload(row) {
  assert(/^\d+$/.test(row.section_order), `invalid section_order for ${row.section}`);
  assert(/^\d+$/.test(row.row_order), `invalid row_order for ${row.section}`);
  try {
    return JSON.parse(row.payload_json);
  } catch (error) {
    throw new Error(`invalid payload_json in ${row.section}: ${error.message}`);
  }
}

export function parseCatalogCsv(text) {
  const raw = parseCsv(text);
  assert(raw.length > 0, 'catalog stream is empty');
  const rows = raw.map((row) => {
    assert(Object.hasOwn(row, 'section') && Object.hasOwn(row, 'section_order') && Object.hasOwn(row, 'row_order') && Object.hasOwn(row, 'payload_json'), 'catalog CSV header is incomplete');
    return { section: row.section, sectionOrder: Number(row.section_order), rowOrder: Number(row.row_order), payload: jsonPayload(row) };
  });
  for (let i = 1; i < rows.length; i += 1) {
    const before = rows[i - 1];
    const after = rows[i];
    assert(before.sectionOrder < after.sectionOrder || (before.sectionOrder === after.sectionOrder && before.rowOrder < after.rowOrder), 'catalog stream is not strictly ordered');
  }
  const sections = Object.fromEntries(CONFIG.requiredCatalogSections.map((name) => [name, []]));
  for (const row of rows) {
    assert(Object.hasOwn(sections, row.section), `unknown catalog section: ${row.section}`);
    sections[row.section].push(row.payload);
  }
  for (const name of CONFIG.requiredCatalogSections) assert(sections[name].length > 0, `missing catalog section: ${name}`);
  assert(sections.meta.length === 1, 'catalog must have exactly one meta row');
  assert(sections.meta[0].current_user === 'dt_reader', `catalog was read as ${sections.meta[0].current_user}, not dt_reader`);
  return normalizeCatalog(sections);
}

function unique(rows, keyOf, label) {
  const seen = new Set();
  for (const row of rows) {
    const key = keyOf(row);
    assert(!seen.has(key), `duplicate ${label}: ${key}`);
    seen.add(key);
  }
  return seen;
}

function knownEstimate(value) {
  if (value === null || value === undefined || Number(value) < 0) return { state: 'unknown', value: null, reason: 'catalog estimate unavailable' };
  return { state: 'known', value: Number(value), reason: null };
}

export function normalizeCatalog(sections) {
  const relationIds = unique(sections.relations, (row) => relationKey(row.schema, row.name), 'relation');
  unique(sections.columns, (row) => `${relationKey(row.schema, row.relation)}:${row.ordinal}`, 'column ordinal');
  unique(sections.constraints, (row) => `${relationKey(row.schema, row.relation)}:${row.name}`, 'constraint');
  unique(sections.indexes, (row) => `${relationKey(row.schema, row.relation)}:${row.name}`, 'index');
  for (const row of [...sections.columns, ...sections.constraints, ...sections.indexes, ...sections.policies]) {
    assert(relationIds.has(relationKey(row.schema, row.relation)), `catalog ${row.name ?? 'row'} points to missing relation ${relationKey(row.schema, row.relation)}`);
  }
  for (const edge of sections.partition_edges) {
    assert(relationIds.has(relationKey(edge.parent_schema, edge.parent_relation)), 'partition parent is missing');
    assert(relationIds.has(relationKey(edge.child_schema, edge.child_relation)), 'partition child is missing');
  }
  const parentByChild = new Map(sections.partition_edges.map((edge) => [relationKey(edge.child_schema, edge.child_relation), edge]));
  const childrenByParent = new Map();
  for (const edge of sections.partition_edges) {
    const key = relationKey(edge.parent_schema, edge.parent_relation);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(edge);
  }
  const source = new Map(sections.relations.map((row) => [relationKey(row.schema, row.name), row]));
  const relations = sections.relations.map((row) => {
    const key = relationKey(row.schema, row.name);
    const parent = parentByChild.get(key) ?? null;
    return {
      ...row,
      key,
      estimated_rows: knownEstimate(row.estimated_rows),
      is_partition_child: Boolean(parent),
      parent: parent ? relationKey(parent.parent_schema, parent.parent_relation) : null,
      size_applicable: !['v'].includes(row.relkind),
    };
  });
  const logicalRollups = [...childrenByParent.entries()].sort().map(([parent, edges]) => {
    let estimatedRows = 0;
    let unknownRows = 0;
    let totalBytes = 0;
    let unknownBytes = 0;
    for (const edge of edges) {
      const child = source.get(relationKey(edge.child_schema, edge.child_relation));
      if (child.estimated_rows === null || Number(child.estimated_rows) < 0) unknownRows += 1;
      else estimatedRows += Number(child.estimated_rows);
      if (child.total_bytes === null) unknownBytes += 1;
      else totalBytes += Number(child.total_bytes);
    }
    return { parent, child_count: edges.length, known_estimated_rows: estimatedRows, unknown_row_child_count: unknownRows, known_total_bytes: totalBytes, unknown_size_child_count: unknownBytes };
  });
  const physicalTotals = relations.filter((row) => row.relkind !== 'p' && row.size_applicable).reduce((acc, row) => {
    if (row.total_bytes === null) acc.unknown_relation_count += 1;
    else acc.known_total_bytes += Number(row.total_bytes);
    return acc;
  }, { known_total_bytes: 0, unknown_relation_count: 0 });
  return {
    schema_version: CONFIG.catalogVersion,
    meta: sections.meta[0],
    schemas: sections.schemas,
    relations,
    columns: sections.columns,
    constraints: sections.constraints,
    indexes: sections.indexes,
    partition_edges: sections.partition_edges,
    policies: sections.policies,
    enums: sections.enums,
    logical_rollups: logicalRollups,
    physical_totals: physicalTotals,
    rls_warning: CONFIG.rlsWarning,
  };
}
