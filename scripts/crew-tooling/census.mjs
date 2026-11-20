#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-5 (Q4) - the component census for an audit: every way into a target.
// For a symbol (or a file, or a database table) it lists:
//   1. type-aware uses (code-refs.mjs, the repo's own TypeScript);
//   2. reach: the shortest import chain from each start file (server/index.ts, plus any file a PM2 or
//      systemd entry runs) to each file that uses the target, static and literal dynamic import() alike;
//   3. the entry-point inventory filtered to the target: `.start(`, `setInterval(`, `cron.schedule(`,
//      `cron.createTask(`, `cronRegistry.register(` lines in a file that uses the target or names it;
//      PM2 `ecosystem.config.cjs` scripts; `comms-infra` systemd ExecStart lines naming it;
//   4. for a table: drizzle references to its pgTable constant (type-aware) and raw-SQL lines naming
//      the table (TEXT MATCH, labelled - a string the type checker cannot follow).
// It ALWAYS prints the searched population and the surfaces it cannot see. A LEAD, never a verdict.
// Usage: node scripts/crew-tooling/census.mjs (--symbol NAME [--file PATH] | --path FILE | --table SQL_NAME) [--json]
// Exit:  0 something found, 1 nothing found on any surface, 2 error.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = resolve(opt('--root') || process.cwd());
const HERE = dirname(fileURLToPath(import.meta.url));
const asJson = args.includes('--json');
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };
const rel = (f) => relative(ROOT, f).split('\\').join('/');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let symbol = opt('--symbol');
const symFile = opt('--file');
const pathTarget = opt('--path');
const table = opt('--table');
if (!symbol && !pathTarget && !table) fail('usage: census.mjs (--symbol NAME [--file PATH] | --path FILE | --table SQL_NAME) [--json]');

let ts;
try { ts = createRequire(join(ROOT, 'package.json'))('typescript'); } catch (e) { fail(`cannot load the repo's typescript: ${e.message}`); }
const tracked = git('ls-files').split('\n').filter(Boolean);
const head = git('rev-parse', '--short', 'HEAD').trim();
const dirty = git('status', '--porcelain', '--untracked-files=no').trim() !== '';

function codeRefs(name, file) {
  const a = [join(HERE, 'code-refs.mjs'), name, '--root', ROOT];
  if (file) a.push('--file', file);
  try { return JSON.parse(execFileSync('node', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
  catch (e) { try { return JSON.parse(e.stdout); } catch { fail(`code-refs failed for ${name}`); } }
}

// ---- 4a. Table -> its drizzle constant (type-aware leg) -------------------------------------------
const SCHEMA_FILES = ['shared/schema.ts', 'shared/diagnostic-schema.ts'].filter((f) => existsSync(join(ROOT, f)));
let tableInfo = null;
if (table) {
  const decl = [];
  for (const f of SCHEMA_FILES) read(f).split('\n').forEach((l, i) => {
    const m = l.match(/export\s+const\s+(\w+)\s*=\s*pgTable\(\s*['"`]([^'"`]+)['"`]/);
    if (m && m[2] === table) decl.push({ file: f, line: i + 1, constant: m[1] });
  });
  tableInfo = { sql_name: table, drizzle_declarations: decl, schema_files_searched: SCHEMA_FILES };
  if (decl.length === 1 && !symbol) { symbol = decl[0].constant; tableInfo.note = `type-aware leg runs on the pgTable constant ${symbol}`; }
  else if (decl.length === 0) tableInfo.note = 'NO pgTable declaration in the schema files: the table is reached only by raw SQL (or is declared elsewhere) - the type-aware leg does not apply';
}

// ---- 1. Type-aware uses -------------------------------------------------------------------------
let refs = null;
const targetFiles = new Set();
if (symbol) {
  refs = codeRefs(symbol, symFile);
  if (refs.error) fail(`code-refs: ${refs.error}${refs.declarations ? ' ' + JSON.stringify(refs.declarations) : ''}`);
  for (const r of refs.references) targetFiles.add(r.file);
}
if (pathTarget) {
  if (!tracked.includes(pathTarget)) fail(`--path ${pathTarget} is not a tracked file`);
  targetFiles.add(pathTarget);
}
const names = [symbol, pathTarget && basename(pathTarget).replace(/\.[cm]?[jt]sx?$/, ''), table].filter(Boolean);
const nameRe = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`);

// ---- 2. Import graph and reach ------------------------------------------------------------------
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, ROOT);
const tsFiles = tracked.filter((f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f) && !f.startsWith('node_modules/') && !f.includes('/dist/'));
const graph = new Map();
const dynamicEdges = new Map();
for (const f of tsFiles) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  const pre = ts.preProcessFile(text, true, true);
  const out = [];
  for (const imp of pre.importedFiles) {
    const r = ts.resolveModuleName(imp.fileName, join(ROOT, f), cfg.options, ts.sys).resolvedModule;
    if (!r || r.isExternalLibraryImport) continue;
    const to = rel(r.resolvedFileName);
    out.push(to);
    const lineNo = text.slice(0, imp.pos).split('\n').length;
    if (/import\s*\(\s*$/.test(text.slice(Math.max(0, imp.pos - 20), imp.pos))) dynamicEdges.set(`${f}->${to}`, lineNo); // pos is the opening quote
    else if (!dynamicEdges.has(`${f}->${to}`)) dynamicEdges.set(`${f}->${to}:static`, lineNo);
  }
  graph.set(f, [...new Set(out)]);
}
const edgeLine = (a, b) => (dynamicEdges.has(`${a}->${b}`) ? `${a}:${dynamicEdges.get(`${a}->${b}`)} (dynamic import)` : `${a}:${dynamicEdges.get(`${a}->${b}:static`) ?? '?'}`);

// Start files: the app, plus whatever PM2 and systemd run that is a tracked source file.
const pm2 = [];
if (existsSync(join(ROOT, 'ecosystem.config.cjs'))) read('ecosystem.config.cjs').split('\n').forEach((l, i) => {
  const m = l.match(/(script|args)\s*:\s*['"`]([^'"`]+)['"`]/); if (m) pm2.push({ line: i + 1, [m[1]]: m[2], text: l.trim() });
});
const unitFiles = tracked.filter((f) => f.startsWith('comms-infra/') && /\.(service|timer)$/.test(f));
const units = [];
for (const f of unitFiles) read(f).split('\n').forEach((l, i) => { if (/^\s*(ExecStart|ExecStartPre|OnCalendar|OnUnitActiveSec|Unit)\s*=/.test(l)) units.push({ file: f, line: i + 1, text: l.trim() }); });
const starts = ['server/index.ts'];
for (const p of pm2) if (p.script && !p.script.startsWith('dist/')) { const s = p.script.replace(/^\.\//, ''); if (tracked.includes(s)) starts.push(s); }
for (const u of units) for (const tok of u.text.split(/[\s=]+/)) { const s = tok.replace(/^\/?(opt|home)\/[^ ]*?\/(dawntrader|DawnTraderV3)\//, ''); if (tracked.includes(s) && /\.(ts|mjs|js|cjs)$/.test(s)) starts.push(s); }

function chain(from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]); const q = [from];
  while (q.length) { const n = q.shift(); for (const m of graph.get(n) || []) if (!prev.has(m)) { prev.set(m, n); if (m === to) { const p = [m]; let c = n; while (c) { p.unshift(c); c = prev.get(c); } return p; } q.push(m); } }
  return null;
}
const reach = [...targetFiles].sort().map((t) => {
  for (const s of [...new Set(starts)]) { const c = chain(s, t); if (c) return { file: t, from: s, hops: c.length - 1, chain: c.slice(0, -1).map((a, i) => edgeLine(a, c[i + 1])).concat(t) }; }
  return { file: t, from: null, note: 'NOT REACHED from any start file by a resolvable import - a test, a script run by hand, a string-keyed or computed import, or dead code' };
});

// ---- 3. Entry-point inventory, filtered ---------------------------------------------------------
const serverSrc = tracked.filter((f) => f.startsWith('server/') && /\.tsx?$/.test(f) && !/\.test\.ts$|\/tests\//.test(f));
const EP_RE = /(\.start\(|setInterval\(|cron\.schedule\(|cron\.createTask\(|cronRegistry\.register\()/;
const epAll = [];
for (const f of serverSrc) readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (EP_RE.test(l) && !/^\s*(\*|\/\/)/.test(l)) epAll.push({ file: f, line: i + 1, kind: l.match(EP_RE)[1].replace(/[.(]/g, ''), text: l.trim().slice(0, 160) }); });
// An entry point counts when it sits in the target's OWN file (the declaring file, or --path), or names
// the target. A file that merely USES the target is shown by reach, not here: server/index.ts uses
// almost everything, so 'any entry point in a using file' would list every start-up line.
const ownFiles = new Set([refs && refs.declaration ? refs.declaration.file : null, pathTarget].filter(Boolean));
const epHits = epAll.filter((e) => ownFiles.has(e.file) || nameRe.test(e.text));
const pm2Hits = pm2.filter((p) => nameRe.test(p.text));
const unitHits = units.filter((u) => nameRe.test(u.text));

// ---- 4b. Raw-SQL text hits (labelled) ------------------------------------------------------------
let rawSql = null;
if (table) {
  const SQL_RE = /(sql`|\.query\(|\.execute\(|\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\b)/i;
  const tRe = new RegExp(`\\b${table}\\b`);
  const hits = [];
  for (const f of serverSrc.concat(tracked.filter((f) => /^(scripts|comms-infra)\//.test(f) && /\.(ts|mjs|js|py|sh|sql)$/.test(f)))) {
    readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (tRe.test(l)) hits.push({ file: f, line: i + 1, sql_on_line: SQL_RE.test(l), text: l.trim().slice(0, 160) }); });
  }
  hits.sort((a, b) => Number(b.sql_on_line) - Number(a.sql_on_line));
  rawSql = { label: 'TEXT MATCH - every line naming the table; [sql] marks an SQL keyword or call on the same line (a multi-line query names the table on a line of its own, so unmarked lines are kept). Not type-checked; includes comments; misses a table name built at runtime', hits };
}

const population = {
  ref: `${head}${dirty ? ' + uncommitted changes' : ''} (working tree)`,
  typescript_program_files: refs ? refs.program_files : null,
  import_graph_files: graph.size,
  start_files: [...new Set(starts)],
  server_files_scanned_for_entry_points: serverSrc.length,
  entry_point_lines_total: epAll.length,
  pm2_entries: pm2.length,
  systemd_unit_files: unitFiles.length,
  raw_sql_files_scanned: table ? serverSrc.length + tracked.filter((f) => /^(scripts|comms-infra)\//.test(f) && /\.(ts|mjs|js|py|sh|sql)$/.test(f)).length : null,
};
// Langston Step-4 gate 2 fold-in: with no --symbol there is no code-refs run, so its blind spots are stated here
// rather than dropped. Leg 2 (the import graph) DOES walk .mjs/.js/.cjs and every tracked root, so the TypeScript-only
// lines are not inherited for it.
const NO_SYMBOL_BLIND = [
  'type-aware uses: --path and --table run no language-server search, so readers of the target are seen only as import edges (leg 2) or raw text (--table)',
  'string-keyed access (obj[name], route strings, config keys, JSON)',
  'shell, Python and systemd files are read for entry-point lines only, never as importers',
];
const unresolved = [
  ...(refs ? refs.unresolved_surfaces : NO_SYMBOL_BLIND),
  'import() with a computed path, and require() of a computed path (no edge in the reach graph)',
  'routes reached by HTTP string (an API path is reach by request, not by import)',
  'systemd units and cron on a host but not in this repo; PM2 runs dist/ build output, mapped back to server/index.ts by assumption',
  'entry points not using .start / setInterval / cron.schedule / cron.createTask / cronRegistry.register (setTimeout chains, event listeners, queue consumers)',
];
const result = {
  tool: 'census.mjs', tool_version: '1.1', root: ROOT, target: { symbol: symbol || null, file: symFile || null, path: pathTarget || null, table: table || null },
  declaration: refs ? refs.declaration : null,
  counts: { uses: refs ? refs.counts.uses : null, files_using: targetFiles.size, reached: reach.filter((r) => r.from).length, not_reached: reach.filter((r) => !r.from).length, entry_points: epHits.length + pm2Hits.length + unitHits.length, raw_sql_lines: rawSql ? rawSql.hits.length : null, raw_sql_lines_with_keyword: rawSql ? rawSql.hits.filter((h) => h.sql_on_line).length : null },
  table: tableInfo, reach, entry_points: { app: epHits, pm2: pm2Hits, systemd: unitHits }, raw_sql: rawSql,
  population, unresolved_surfaces: unresolved,
};
// --path: the file always exists, so 'found' means it is reached from a start file or named by an entry point;
// a file nothing reaches exits 1 (it used to exit 0 on its own presence - Langston Step-4 gate 2 fold-in).
const found = (refs && refs.counts.uses) || epHits.length || pm2Hits.length || unitHits.length || (rawSql && rawSql.hits.length) || (pathTarget && reach.some((r) => r.from));
if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(found ? 0 : 1); }

const c = result.counts;
console.log(`CENSUS ${names.join(' / ')} at ${population.ref}`);
if (refs) console.log(`declared ${refs.declaration.file}:${refs.declaration.line}; ${c.uses} type-aware uses in ${c.files_using} files`);
if (tableInfo) console.log(`table ${table}: ${tableInfo.drizzle_declarations.map((d) => `${d.constant} at ${d.file}:${d.line}`).join(', ') || 'no pgTable declaration'}${tableInfo.note ? ` - ${tableInfo.note}` : ''}`);
console.log(`reach (${c.reached} reached, ${c.not_reached} not):`);
for (const r of reach) console.log(!r.from ? `  ${r.file}  ${r.note}` : r.hops === 0 ? `  ${r.file}  (a start file)` : `  ${r.file}  <- ${r.chain.slice(0, -1).join(' -> ')}`);
console.log(`entry points touching the target (${c.entry_points}):`);
for (const e of epHits) console.log(`  [${e.kind}] ${e.file}:${e.line}  ${e.text}`);
for (const p of pm2Hits) console.log(`  [pm2] ecosystem.config.cjs:${p.line}  ${p.text}`);
for (const u of unitHits) console.log(`  [systemd] ${u.file}:${u.line}  ${u.text}`);
if (rawSql) { console.log(`raw SQL (${rawSql.hits.length} lines, ${c.raw_sql_lines_with_keyword} with a keyword on the line) - ${rawSql.label}`); for (const h of rawSql.hits.slice(0, 40)) console.log(`  ${h.sql_on_line ? '[sql]' : '     '} ${h.file}:${h.line}  ${h.text}`); if (rawSql.hits.length > 40) console.log(`  ... ${rawSql.hits.length - 40} more (--json)`); }
console.log(`searched: ${JSON.stringify(population)}`);
console.log('cannot see:'); for (const u of unresolved) console.log(`  - ${u}`);
process.exit(found ? 0 : 1);
