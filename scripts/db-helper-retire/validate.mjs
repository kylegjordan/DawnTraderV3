import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, stat } from 'node:fs/promises';
import { extname, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const LEDGER_PATH = resolve(HERE, 'disposition-ledger.json');
const EXCLUSIONS_PATH = resolve(HERE, 'typed-exclusions.json');
const SURFACE_BASELINE_PATH = resolve(HERE, 'surface-baseline.json');
const LIVE_ROOT = resolve(REPO, '1-system-manual/_archive/deleted-code/live-staging/2026-11-24-b-db-helper-retire');
const SOURCE_ARCHIVE_ROOT = resolve(REPO, '1-system-manual/_archive/deleted-code/b-db-helper-retire/2026-11-24');
const ALLOWED_DISPOSITIONS = new Set(['RETIRE', 'RETAIN_GOVERNED_DIRECT', 'RETAIN_TEST_LOCAL', 'ROUTE_DT_SQL', 'OWNER_HOLD']);
const CODE_SUFFIXES = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts', '.py', '.pyw', '.sh', '.sql', '.yml', '.yaml']);
const SKIP_PREFIXES = ['Claude Comms and Packages/', 'docs/', 'diagnostic-reports/', 'attached_assets/', 'logs/', 'backups and data dumps/', '1-system-manual/'];

const SUPPLEMENTAL = [
  ['package.json', 13, 'direct psql package command'],
  ['scripts/analysis/b_disk_headroom_lock_sampler.sh', 45, 'bare psql shell'],
  ['scripts/analysis/b_disk_headroom_set_retention.sh', 50, 'bare psql shell writer'],
  ['scripts/analysis/b_price_side_alias_census.sh', 5, 'bare psql shell'],
  ['scripts/analysis/b_price_side_p7h_limiter_class_census.sh', 6, 'bare psql shell'],
  ['scripts/b5-amr-correctness-audit.ts', 270, 'new pg.default.Client'],
  ['audit/run-phase31h-audit.sh', 60, 'bare psql shell'],
];
const RETIRED_COMPANIONS = ['scripts/analysis/b_price_side_p7h_limiter_class_census.py'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalText(text) {
  return text.replace(/\r\n/g, '\n');
}

function sourceArchivePath(path) {
  return resolve(SOURCE_ARCHIVE_ROOT, `${path.replaceAll('\\', '/').replaceAll('/', '__')}.removed`);
}

function sourceArchiveGitPath(path) {
  return `1-system-manual/_archive/deleted-code/b-db-helper-retire/2026-11-24/${path.replaceAll('\\', '/').replaceAll('/', '__')}.removed`;
}

function liveArchivePath(path) {
  return resolve(LIVE_ROOT, `${basename(path)}.removed`);
}

function liveArchiveGitPath(path) {
  return `1-system-manual/_archive/deleted-code/live-staging/2026-11-24-b-db-helper-retire/${basename(path)}.removed`;
}

function identity(row) {
  return `${row.path}\0${row.line}\0${row.kind}`;
}

export function validateLedgerObject(ledger) {
  assert.equal(ledger.schema_version, 1, 'ledger schema version');
  assert.equal(ledger.batch, 'B-DB-HELPER-RETIRE', 'ledger batch');
  assert.equal(ledger.checked_in.length, 92, 'checked-in population');
  assert.equal(ledger.live.length, 53, 'live population');
  assert.deepEqual(ledger.checked_in.map((row) => row.number), Array.from({ length: 92 }, (_, index) => index + 1), 'checked-in row numbers are exact and ordered');
  assert.equal(new Set(ledger.checked_in.map(identity)).size, 92, 'checked-in identities are unique');
  assert.equal(new Set(ledger.live.map((row) => row.path)).size, 53, 'live paths are unique');
  for (const row of ledger.checked_in) {
    assert(ALLOWED_DISPOSITIONS.has(row.disposition), `unknown disposition at checked-in row ${row.number}`);
    assert(row.reason && row.authority, `reason/authority missing at checked-in row ${row.number}`);
  }
  for (const row of ledger.live) {
    assert.equal(row.disposition, 'RETIRE', `live disposition for ${row.path}`);
    assert(/^[0-9a-f]{64}$/.test(row.sha256), `live sha256 for ${row.path}`);
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0, `live bytes for ${row.path}`);
    assert(/^0[0-7]{3}$/.test(row.mode), `live mode for ${row.path}`);
    assert(row.reason && row.authority, `live reason/authority for ${row.path}`);
  }
  const counts = Object.fromEntries([...ALLOWED_DISPOSITIONS].sort().map((value) => [value, ledger.checked_in.filter((row) => row.disposition === value).length]));
  assert.deepEqual(counts, { OWNER_HOLD: 1, RETAIN_GOVERNED_DIRECT: 36, RETAIN_TEST_LOCAL: 20, RETIRE: 33, ROUTE_DT_SQL: 2 }, 'checked-in disposition counts');
}

function stripTypeScriptComments(source) {
  const output = [...source];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    for (let index = scanner.getTokenPos(); index < scanner.getTextPos(); index += 1) {
      if (output[index] !== '\n') output[index] = ' ';
    }
  }
  return output.join('');
}

function failClosedSourceText(path, text) {
  const source = text.replace(/\r\n/g, '\n');
  const suffix = extname(path).toLowerCase();
  const slashComments = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.mts']).has(suffix);
  if (slashComments) return stripTypeScriptComments(source);
  const blockComments = slashComments || suffix === '.sql';
  const hashComments = new Set(['.py', '.pyw', '.sh', '.yml', '.yaml']).has(suffix);
  const pythonSource = suffix === '.py' || suffix === '.pyw';
  const dashComments = suffix === '.sql';
  let result = '';
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      if (quote.length === 3 && source.slice(index, index + 3) === quote) {
        result += quote;
        index += 2;
        quote = null;
        continue;
      }
      result += char;
      if (char === '\\' && suffix !== '.sql' && index + 1 < source.length) {
        result += source[++index];
      } else if (char === quote) {
        if (suffix === '.sql' && next === quote) result += source[++index];
        else quote = null;
      }
      continue;
    }
    if (pythonSource && (source.slice(index, index + 3) === "'''" || source.slice(index, index + 3) === '"""')) {
      quote = source.slice(index, index + 3);
      result += quote;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      result += char;
      continue;
    }
    if (blockComments && char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) return source; // ambiguous input is scanned raw, never hidden
      const comment = source.slice(index, end + 2);
      result += comment.replace(/[^\n]/g, ' ');
      index = end + 1;
      continue;
    }
    const lineStart = source.lastIndexOf('\n', index - 1) + 1;
    const hashIsWholeLine = source.slice(lineStart, index).trim() === '';
    const lineComment = (slashComments && char === '/' && next === '/')
      || (hashComments && hashIsWholeLine && char === '#' && !(index === 0 && next === '!'))
      || (dashComments && char === '-' && next === '-');
    if (lineComment) {
      const end = source.indexOf('\n', index);
      if (end === -1) {
        result += ' '.repeat(source.length - index);
        break;
      }
      result += ' '.repeat(end - index);
      result += '\n';
      index = end;
      continue;
    }
    result += char;
  }
  if (quote !== null) return source; // malformed/ambiguous source is fail-closed
  return result;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

export function detectConnectionSurfaceCounts(path, text) {
  const source = failClosedSourceText(path, text);
  const counts = {
    direct_psql: countMatches(source, /(?:^|[\s"'`;&|({])(?:\/usr\/bin\/|\/usr\/local\/bin\/)?psql(?=$|[\s"'`;&|)])/gm),
    database_url: countMatches(source, /\bDATABASE_URL\b/g),
    pgpassword: countMatches(source, /\bPGPASSWORD\b/g),
    node_postgres_constructor: countMatches(source, /new\s+(?:pg(?:\.default)?\.)?(?:Client|Pool)\s*\(/g),
    dt_sql: countMatches(source, /(?:\/usr\/local\/bin\/)?dt-sql\b/g),
    installed_psql_path: countMatches(source, /\/usr\/local\/bin\/psql|\/usr\/bin\/psql/g),
    app_env: path.endsWith('/.env') || path === '.env' ? 1 : 0,
  };
  const pgAliases = new Set();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*pg(?:\.default)?\.(?:Client|Pool)\b/g)) pgAliases.add(match[1]);
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]pg['"]\s*\)\.(?:Client|Pool)\b/g)) pgAliases.add(match[1]);
  for (const declaration of source.matchAll(/\bimport\s*{([^}]*)}\s*from\s*['"]pg['"]/g)) {
    for (const match of declaration[1].matchAll(/\b(?:Client|Pool)\s+as\s+([A-Za-z_$][\w$]*)/g)) pgAliases.add(match[1]);
  }
  for (const declaration of source.matchAll(/\b(?:const|let|var)\s*{([^}]*)}\s*=\s*require\s*\(\s*['"]pg['"]\s*\)/g)) {
    for (const match of declaration[1].matchAll(/\b(?:Client|Pool)\s*:\s*([A-Za-z_$][\w$]*)/g)) pgAliases.add(match[1]);
  }
  let aliasConstructorCount = 0;
  for (const alias of pgAliases) {
    aliasConstructorCount += countMatches(source, new RegExp(`\\bnew\\s+${alias}\\s*\\(`, 'g'));
  }
  counts.node_postgres_alias_constructor = aliasConstructorCount;
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0).sort(([left], [right]) => left.localeCompare(right)));
}

export function detectConnectionMarkers(path, text) {
  return Object.keys(detectConnectionSurfaceCounts(path, text));
}

function git(args, options = {}) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: options.binary ? undefined : 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

export async function currentMarkerMap() {
  const paths = git(['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const result = new Map();
  for (const path of paths) {
    if (path.endsWith('.removed') || SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    const suffix = extname(path).toLowerCase();
    if (path !== 'package.json' && !CODE_SUFFIXES.has(suffix) && suffix) continue;
    let bytes;
    try {
      const found = await lstat(resolve(REPO, path));
      if (!found.isFile()) continue;
      bytes = await readFile(resolve(REPO, path));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!suffix && path !== 'package.json' && !bytes.subarray(0, 2).equals(Buffer.from('#!'))) continue;
    const markers = detectConnectionSurfaceCounts(path, bytes.toString('utf8'));
    if (Object.keys(markers).length) result.set(path, markers);
  }
  return result;
}

export function assertExactMarkerSet(markerMap, expectedMap) {
  const actualPaths = [...markerMap.keys()].sort();
  const expectedPaths = [...expectedMap.keys()].sort();
  assert.deepEqual(actualPaths, expectedPaths, 'classified connection-marker path set differs');
  for (const path of expectedPaths) {
    assert.deepEqual(markerMap.get(path), expectedMap.get(path), `connection-marker surface counts differ: ${path}`);
  }
}

async function main() {
  const ledger = JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
  const exclusions = JSON.parse(await readFile(EXCLUSIONS_PATH, 'utf8'));
  const surfaceBaseline = JSON.parse(await readFile(SURFACE_BASELINE_PATH, 'utf8'));
  validateLedgerObject(ledger);

  const audit = await readFile(resolve(REPO, ledger.audit_path), 'utf8');
  assert.equal(sha256(canonicalText(audit)), ledger.audit_sha256, 'audited disposition source changed');
  assert.equal(new Set(exclusions.entries.map((row) => row.path)).size, exclusions.entries.length, 'typed exclusion paths are unique');
  for (const row of exclusions.entries) assert(row.path && row.type && row.reason, 'typed exclusion is incomplete');

  const sourceHelpers = JSON.parse(await readFile(resolve(REPO, 'docs/database-map/helpers.json'), 'utf8')).helpers;
  assert.deepEqual(ledger.checked_in.slice(0, 85).map(identity), sourceHelpers.map((row) => identity({ path: row.file, line: row.line, kind: row.kind })), 'immutable 85-row B-DB-MAP source differs from ledger');
  assert.deepEqual(ledger.checked_in.slice(85).map((row) => [row.path, row.line, row.kind]), SUPPLEMENTAL, 'seven supplemental source rows differ');

  for (const row of ledger.checked_in.filter((entry) => entry.disposition === 'RETIRE')) {
    await assert.rejects(stat(resolve(REPO, row.path)), { code: 'ENOENT' }, `retired source still exists: ${row.path}`);
    await stat(sourceArchivePath(row.path));
    const archived = git(['show', `:${sourceArchiveGitPath(row.path)}`], { binary: true });
    const reviewed = git(['show', `${ledger.reviewed_ref}:${row.path}`], { binary: true });
    assert.equal(sha256(archived), sha256(reviewed), `source archive bytes differ: ${row.path}`);
  }
  for (const path of RETIRED_COMPANIONS) {
    await assert.rejects(stat(resolve(REPO, path)), { code: 'ENOENT' }, `retired companion still exists: ${path}`);
    await stat(sourceArchivePath(path));
    const archived = git(['show', `:${sourceArchiveGitPath(path)}`], { binary: true });
    const reviewed = git(['show', `${ledger.reviewed_ref}:${path}`], { binary: true });
    assert.equal(sha256(archived), sha256(reviewed), `companion archive bytes differ: ${path}`);
  }
  for (const row of ledger.checked_in.filter((entry) => entry.disposition !== 'RETIRE')) await stat(resolve(REPO, row.path));

  const alias = await readFile(resolve(REPO, 'scripts/analysis/b_price_side_alias_census.sh'), 'utf8');
  assert(!/\bDATABASE_URL\b|(?:^|\s)psql(?:\s|$)/m.test(failClosedSourceText('scripts/analysis/b_price_side_alias_census.sh', alias)), 'alias census still has a direct application login');
  assert(alias.includes('/usr/local/bin/dt-sql') && alias.includes('current_user') && alias.includes('dt_reader'), 'alias census does not prove dt_reader');
  const amr = await readFile(resolve(REPO, 'scripts/b5-amr-correctness-audit.ts'), 'utf8');
  assert(!/import\(['"]pg['"]\)|\bDATABASE_URL\b|new\s+pg(?:\.default)?\.Client/.test(failClosedSourceText('scripts/b5-amr-correctness-audit.ts', amr)), 'AMR audit still has a direct application login');
  assert(amr.includes('/usr/local/bin/dt-sql') && amr.includes('current_user') && amr.includes('dt_reader'), 'AMR audit does not prove dt_reader');
  const pkg = JSON.parse(await readFile(resolve(REPO, 'package.json'), 'utf8'));
  assert(!('b-phase-a2:backfill' in pkg.scripts), 'stale phase-A2 package command remains');
  assert.equal(pkg.scripts['b-xstock-feed-sanity:recut'], 'tsx scripts/xstock-hollow-recut.ts', 'owner-held recut command changed');
  await assert.rejects(stat(resolve(REPO, 'tsconfig.w20c-census.json')), { code: 'ENOENT' }, 'sole-input W20c config remains');

  const manifest = JSON.parse(await readFile(resolve(LIVE_ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1, 'live manifest schema');
  assert.equal(manifest.files.length, 53, 'live manifest population');
  assert.deepEqual(manifest.files.map((row) => row.path), ledger.live.map((row) => row.path), 'live manifest paths/order differ');
  for (let index = 0; index < ledger.live.length; index += 1) {
    const expected = ledger.live[index];
    const actual = manifest.files[index];
    assert.equal(actual.sha256, expected.sha256, `manifest sha256 for ${expected.path}`);
    assert.equal(actual.bytes, expected.bytes, `manifest bytes for ${expected.path}`);
    assert.equal(actual.mode, expected.mode, `manifest mode for ${expected.path}`);
    assert.equal(actual.owner, 'deploy', `manifest owner for ${expected.path}`);
    assert.equal(actual.group, 'deploy', `manifest group for ${expected.path}`);
    assert(/^\d{4}-\d{2}-\d{2}T/.test(actual.mtime_utc) && /^\d+$/.test(actual.mtime_ns), `manifest mtime for ${expected.path}`);
    await stat(liveArchivePath(expected.path));
    const archived = git(['show', `:${liveArchiveGitPath(expected.path)}`], { binary: true });
    assert.equal(archived.length, expected.bytes, `live archive bytes for ${expected.path}`);
    assert.equal(sha256(archived), expected.sha256, `live archive sha256 for ${expected.path}`);
  }

  const allowed = new Set([
    ...ledger.checked_in.filter((row) => row.disposition !== 'RETIRE').map((row) => row.path),
    ...exclusions.entries.map((row) => row.path),
  ]);
  assert.equal(surfaceBaseline.schema_version, 1, 'surface baseline schema');
  assert.equal(surfaceBaseline.batch, 'B-DB-HELPER-RETIRE', 'surface baseline batch');
  const baseline = new Map(surfaceBaseline.paths.map((row) => [row.path, row.markers]));
  assert.equal(baseline.size, surfaceBaseline.paths.length, 'surface baseline paths are unique');
  const untypedBaselinePaths = [...baseline.keys()].filter((path) => !allowed.has(path)).sort();
  assert.deepEqual(untypedBaselinePaths, [], 'surface baseline contains paths without a reviewed disposition/exclusion');
  const markers = await currentMarkerMap();
  assertExactMarkerSet(markers, baseline);
  const staleExclusions = exclusions.entries.filter((row) => !markers.has(row.path)).map((row) => row.path);
  assert.deepEqual(staleExclusions, [], `typed exclusions no longer have connection markers:\n${staleExclusions.join('\n')}`);

  console.log(`B-DB-HELPER-RETIRE validator: 92 checked-in dispositions, 53 live archives, ${markers.size} classified current marker paths`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error); process.exit(1); });
}
