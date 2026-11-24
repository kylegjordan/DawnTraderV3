#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';
import { parseCatalogCsv } from './catalog.mjs';
import { enumeratePopulation, peelCommit } from './population.mjs';
import { scannerRuntime, scanRepository } from './scanner.mjs';
import { assertAdapterFidelity, toTblsSchema, validateAgainstOfficialSchema, validateTblsSchema, verifyVendoredSchema } from './adapter.mjs';
import { artifactHashes, assert, resetPrivateDir, sha256, sha256File, stableJson, writeAtomic } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function has(name) {
  return process.argv.includes(`--${name}`);
}

function materialize(repo, ref, root) {
  const archive = join(dirname(root), 'source.tar');
  execFileSync('git', ['-C', repo, 'archive', '--format=tar', `--output=${archive}`, ref], { stdio: 'inherit' });
  execFileSync('tar', ['-xf', archive, '-C', root], { stdio: 'inherit' });
}

async function listFiles(root, prefix = '') {
  const out = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listFiles(root, path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

function structuralProjection(catalog, scan) {
  const relations = catalog.relations.map(({ estimated_rows, table_bytes, index_bytes, total_bytes, last_analyze, last_autoanalyze, ...stable }) => stable);
  return {
    schema_version: 1,
    relations,
    columns: catalog.columns,
    constraints: catalog.constraints,
    indexes: catalog.indexes,
    partition_edges: catalog.partition_edges,
    policies: catalog.policies,
    enums: catalog.enums,
    usage: scan.usage,
    unresolved: scan.unresolved,
    helpers: scan.helpers,
  };
}

function markdownIndex(catalog, scan, sourceRef) {
  const rls = catalog.relations.filter((row) => row.rls_enabled).length;
  return `# DawnTrader database map\n\n` +
    `Generated from database catalog evidence and repository ref \`${sourceRef}\`.\n\n` +
    `- Physical relations: ${catalog.relations.length}\n` +
    `- Logical relations after partition folding: ${catalog.relations.length - catalog.partition_edges.length}\n` +
    `- Columns: ${catalog.columns.length}\n` +
    `- Constraints: ${catalog.constraints.length}\n` +
    `- Indexes: ${catalog.indexes.length}\n` +
    `- RLS-enabled relations: ${rls}\n` +
    `- Scanner inputs: ${scan.population.included_count} included, ${scan.population.excluded_count} excluded\n\n` +
    `> ${catalog.rls_warning}\n\n` +
    `Machine-readable authorities: [catalog.json](catalog.json), [usage.json](usage.json), ` +
    `[unresolved.json](unresolved.json), and [manifest.json](manifest.json).\n`;
}

function tableMarkdown(row, catalog, scan) {
  const columns = catalog.columns.filter((item) => item.schema === row.schema && item.relation === row.name);
  const constraints = catalog.constraints.filter((item) => item.schema === row.schema && item.relation === row.name);
  const usage = scan.usage.filter((item) => item.relation === row.key);
  const parent = row.parent ? `Partition of \`${row.parent}\`.` : 'Not a partition child.';
  const rows = columns.map((column) => `| ${column.ordinal} | \`${column.name}\` | \`${column.type}\` | ${column.nullable ? 'yes' : 'no'} | ${column.default === null ? '' : `\`${String(column.default).replaceAll('|', '\\|')}\``} | ${column.identity ?? ''} | ${column.generated ?? ''} |`).join('\n');
  const uses = usage.length ? usage.map((item) => `- ${item.operation}: \`${item.file}:${item.line}\` (${item.source}, ${item.evidence_class})`).join('\n') : `- ${scan.zero_hit_wording}`;
  return `# ${row.key}\n\nType: \`${row.relkind}\`. ${parent}\n\nRLS enabled: ${row.rls_enabled ? 'yes' : 'no'}; forced: ${row.rls_forced ? 'yes' : 'no'}.\n\n` +
    `## Columns\n\n| # | name | type | nullable | default | identity | generated |\n|---:|---|---|---|---|---|---|\n${rows}\n\n` +
    `## Constraints\n\n${constraints.length ? constraints.map((item) => `- \`${item.name}\`: ${item.definition}`).join('\n') : '- None in the captured catalog.'}\n\n` +
    `## Code evidence\n\n${uses}\n`;
}

export async function readCatalogCsv(path) {
  if (path) return readFile(path, 'utf8');
  const sql = await readFile(join(HERE, 'catalog.sql'), 'utf8');
  const tool = process.env.DT_DB_MAP_DT_SQL ?? '/usr/local/bin/dt-sql';
  const result = spawnSync(tool, ['--csv'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert(result.status === 0, `dt-sql catalog call failed with ${result.status}: ${(result.stderr ?? '').slice(-1000)}`);
  return result.stdout;
}

async function renderTbls(binary, out, schemaPath) {
  if (!binary) return { rendered: false };
  const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
  assert(version.status === 0 && `${version.stdout}${version.stderr}`.includes(CONFIG.tbls.version), 'tbls binary version does not match the pin');
  const dist = join(out, 'tbls');
  const result = spawnSync(binary, ['doc', '--rm-dist', `json://${schemaPath}`, dist], {
    encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tmpdir() }, maxBuffer: 64 * 1024 * 1024,
  });
  assert(result.status === 0, `tbls offline render failed: ${(result.stderr || result.stdout || '').slice(-2000)}`);
  return { rendered: true, version: `${version.stdout}${version.stderr}`.trim() };
}

export async function generate(options) {
  const repo = resolve(options.repo ?? REPO);
  const sourceRef = peelCommit(repo, options.sourceRef);
  const tracked = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  assert(!tracked.trim(), 'source repository has tracked changes; commit or restore them before generation');
  const work = await mkdtemp(join(tmpdir(), 'dt-db-map-'));
  await chmod(work, 0o700);
  const sourceRoot = join(work, 'source');
  await resetPrivateDir(sourceRoot);
  try {
    const typescript = await scannerRuntime();
    const runtime = {
      node_version: process.version,
      node_sha256: await sha256File(process.execPath),
      icu_version: process.versions.icu,
      typescript_version: typescript.version,
      typescript_sha256: typescript.sha256,
    };
    assert(runtime.typescript_version === CONFIG.runtime.typescriptVersion, `TypeScript version differs from pin: ${runtime.typescript_version}`);
    assert(runtime.typescript_sha256 === CONFIG.runtime.typescriptSha256, `TypeScript implementation differs from pin: ${runtime.typescript_sha256}`);
    if (!options.allowUnpinnedRuntime) {
      assert(runtime.node_version === CONFIG.runtime.nodeVersion, `Node version differs from pin: ${runtime.node_version}`);
      assert(runtime.node_sha256 === CONFIG.runtime.nodeSha256, `Node executable differs from pin: ${runtime.node_sha256}`);
    }
    materialize(repo, sourceRef, sourceRoot);
    const population = enumeratePopulation(repo, sourceRef);
    const catalogCsv = await readCatalogCsv(options.catalogCsv);
    const catalog = parseCatalogCsv(catalogCsv);
    const scan = await scanRepository(sourceRoot, population, catalog);
    const tbls = toTblsSchema(catalog);
    validateTblsSchema(tbls);
    assertAdapterFidelity(catalog, tbls);
    const officialSchema = await verifyVendoredSchema(join(HERE, 'vendor/tbls-v1.97.0.schema.json'));
    validateAgainstOfficialSchema(tbls, officialSchema);
    const out = resolve(options.output);
    await resetPrivateDir(out);
    const writes = {
      'catalog.json': stableJson(catalog),
      'usage.json': stableJson({ schema_version: 1, source_ref: sourceRef, evidence: scan.usage, zero_hit_wording: scan.zero_hit_wording }),
      'unresolved.json': stableJson({ schema_version: 1, source_ref: sourceRef, evidence: scan.unresolved }),
      'helpers.json': stableJson({ schema_version: 1, source_ref: sourceRef, helpers: scan.helpers }),
      'population.json': stableJson(scan.population),
      'tbls-schema.json': stableJson(tbls),
      'structural.json': stableJson(structuralProjection(catalog, scan)),
      'index.md': markdownIndex(catalog, scan, sourceRef),
    };
    for (const [path, body] of Object.entries(writes)) await writeAtomic(join(out, path), body);
    for (const row of catalog.relations) await writeAtomic(join(out, 'tables', `${sha256(Buffer.from(JSON.stringify([row.schema, row.name]))).slice(0, 20)}.md`), tableMarkdown(row, catalog, scan));
    const tblsResult = await renderTbls(options.tblsBinary, out, join(out, 'tbls-schema.json'));
    const artifacts = (await listFiles(out)).filter((path) => path !== 'manifest.json');
    const manifest = {
      schema_version: 1,
      source_ref: sourceRef,
      extraction_utc: catalog.meta.extracted_at_utc,
      database: { name: catalog.meta.database, server_version_num: catalog.meta.server_version_num, current_user: catalog.meta.current_user },
      extraction_query_sha256: sha256(await readFile(join(HERE, 'catalog.sql'))),
      scanner_config_sha256: sha256(await readFile(join(HERE, 'config.mjs'))),
      manifest_schema_sha256: sha256(await readFile(join(HERE, 'manifest.schema.json'))),
      generator_version: 2,
      scanner_version: CONFIG.scannerVersion,
      runtime,
      tbls: { ...CONFIG.tbls, rendered: tblsResult.rendered },
      population: scan.population,
      rls_warning: CONFIG.rlsWarning,
      artifact_hashes: await artifactHashes(out, artifacts),
      structural_sha256: sha256(await readFile(join(out, 'structural.json'))),
      manifest_self_hash: null,
    };
    validateAgainstOfficialSchema(manifest, JSON.parse(await readFile(join(HERE, 'manifest.schema.json'), 'utf8')));
    await writeAtomic(join(out, 'manifest.json'), stableJson(manifest));
    return { out, manifest, catalog, scan };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRef = arg('source-ref');
  const output = arg('output');
  if (!sourceRef || !output) {
    console.error('Usage: generate.mjs --source-ref <40-hex/ref> --output <private-dir> [--repo <repo>] [--catalog-csv <file>] [--tbls <binary>]');
    process.exit(2);
  }
  generate({ repo: arg('repo', REPO), sourceRef, output, catalogCsv: arg('catalog-csv'), tblsBinary: arg('tbls') })
    .then(({ manifest }) => console.log(JSON.stringify({ source_ref: manifest.source_ref, artifacts: Object.keys(manifest.artifact_hashes).length, structural_sha256: manifest.structural_sha256 })))
    .catch((error) => { console.error(`db-map generate: ${error.stack ?? error}`); process.exit(1); });
}
