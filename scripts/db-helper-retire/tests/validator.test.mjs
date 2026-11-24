import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExactMarkerSet, detectConnectionMarkers, validateLedgerObject } from '../validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const VALIDATOR = resolve(HERE, '../validate.mjs');
const ledger = JSON.parse(await readFile(resolve(HERE, '../disposition-ledger.json'), 'utf8'));
let checks = 0;
function check(condition, message) { checks += 1; assert.ok(condition, message); }
function rejects(fn, pattern, message) {
  checks += 1;
  assert.throws(fn, pattern, message);
}

validateLedgerObject(structuredClone(ledger));
checks += 1;

const missing = structuredClone(ledger);
missing.checked_in.splice(17, 1);
rejects(() => validateLedgerObject(missing), /checked-in population/, 'missing ledger row turns red');

const duplicate = structuredClone(ledger);
duplicate.checked_in[17] = structuredClone(duplicate.checked_in[16]);
duplicate.checked_in[17].number = 18;
rejects(() => validateLedgerObject(duplicate), /identities are unique/, 'duplicate identity turns red');

const unknown = structuredClone(ledger);
unknown.checked_in[17].disposition = 'KEEP_MAYBE';
rejects(() => validateLedgerObject(unknown), /unknown disposition/, 'unknown disposition turns red');

const fixtures = new Map([
  ['hidden-absolute.sh', '#!/bin/sh\n/usr/bin/psql "$DATABASE_URL" -c "select 1"\n'],
  ['package.json', '{"scripts":{"x":"sh -c \'psql "$DATABASE_URL" -c select\ 1\'"}}'],
  ['shell.sh', '#!/bin/sh\npsql "$DATABASE_URL" -c "select 1"\n'],
  ['.env', 'DATABASE_URL=postgresql://example.invalid/db\n'],
  ['ordinary.ts', "import { Client, Pool } from 'pg'; new Client(); new Pool();\n"],
  ['property.ts', "const pg = await import('pg'); new pg.default.Client(); new pg.default.Pool();\n"],
  ['property-alias.ts', "const C = pg.Client; new C({ connectionString: cfg.url });\n"],
  ['require-alias.ts', "const C = require('pg').Client; new C({ connectionString: cfg.url });\n"],
  ['import-alias.ts', "import { Client as C } from 'pg'; new C({ connectionString: cfg.url });\n"],
]);
for (const [path, text] of fixtures) {
  const markers = detectConnectionMarkers(path, text);
  check(markers.length > 0, `${path} is detected`);
  if (path.endsWith('.ts')) check(markers.some((marker) => marker.startsWith('node_postgres_')), `${path} constructor is detected`);
  if (path === '.env') check(markers.includes('app_env') && markers.includes('database_url'), 'app .env is detected as both identity and credential marker');
  if (path.endsWith('.sh') || path === 'package.json') check(markers.includes('direct_psql'), `${path} psql execution is detected`);
}

const controlled = new Map([['known.ts', { node_postgres_constructor: 1 }]]);
assertExactMarkerSet(controlled, new Map([['known.ts', { node_postgres_constructor: 1 }]]));
checks += 1;
controlled.set('mutant.ts', { node_postgres_constructor: 1 });
rejects(() => assertExactMarkerSet(controlled, new Map([['known.ts', { node_postgres_constructor: 1 }]])), /path set differs/, 'new unclassified marker path turns red');

const wrapperPath = resolve(REPO, 'comms-infra/staging/psql-wrapper');
const wrapperOriginal = await readFile(wrapperPath);
try {
  await writeFile(wrapperPath, Buffer.concat([wrapperOriginal, Buffer.from('\n/usr/bin/psql "$@"\n')]));
  const result = spawnSync(process.execPath, [VALIDATOR], { cwd: REPO, encoding: 'utf8' });
  check(result.status !== 0 && result.stderr.includes('connection-marker surface counts differ: comms-infra/staging/psql-wrapper'), 'second psql invocation in an allowed file turns the full validator red');
} finally {
  await writeFile(wrapperPath, wrapperOriginal);
}

const trapRelative = `scripts/db-helper-retire-comment-trap-${process.pid}.mjs`;
const trapPath = resolve(REPO, trapRelative);
const trapSource = `import { execFileSync } from 'node:child_process';\nconst bait = "/*";\nexecFileSync('/usr/bin/psql', [process.env.DATABASE_URL, '-c', 'select 1']);\n/* genuine comment close */\n`;
try {
  await writeFile(trapPath, trapSource);
  execFileSync(process.execPath, ['--check', trapPath], { stdio: 'pipe' });
  const result = spawnSync(process.execPath, [VALIDATOR], { cwd: REPO, encoding: 'utf8' });
  check(result.status !== 0 && `${result.stdout}\n${result.stderr}`.includes(trapRelative), 'string-contained block-comment opener cannot hide a filesystem-enrolled psql source');
} finally {
  await unlink(trapPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

const namespaceMutants = [
  ['esm-namespace', `import * as dbdriver from 'pg';\nnew dbdriver.Client();\n`],
  ['commonjs-namespace', `const dbdriver = require('pg');\nnew dbdriver.Client();\n`],
];
for (const [name, source] of namespaceMutants) {
  const relative = `scripts/db-helper-retire-${name}-${process.pid}.mjs`;
  const path = resolve(REPO, relative);
  try {
    await writeFile(path, source);
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
    const result = spawnSync(process.execPath, [VALIDATOR], { cwd: REPO, encoding: 'utf8' });
    check(result.status !== 0 && `${result.stdout}\n${result.stderr}`.includes(relative), `${name} pg alias is enrolled through the filesystem and turns the full validator red`);
  } finally {
    await unlink(path).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

const amrPath = resolve(REPO, 'scripts/b5-amr-correctness-audit.ts');
const amrOriginal = await readFile(amrPath, 'utf8');
const amrMutants = [
  ['approved API route removed', amrOriginal.replace("'/usr/local/bin/dt-api'", "'/usr/local/bin/not-dt-api'"), /approved dt-api account/],
  ['caller-held login restored', `${amrOriginal}\n// /api/auth/login testuser123 SecurePass123! Authorization: Bearer \${token}\n`, /caller-held credential/],
];
for (const [name, source, expected] of amrMutants) {
  try {
    await writeFile(amrPath, source);
    const result = spawnSync(process.execPath, [VALIDATOR], { cwd: REPO, encoding: 'utf8' });
    check(result.status !== 0 && expected.test(`${result.stdout}\n${result.stderr}`), `${name} turns the full validator red`);
  } finally {
    await writeFile(amrPath, amrOriginal);
  }
}

console.log(`B-DB-HELPER-RETIRE mutations: ${checks} checks passed`);
