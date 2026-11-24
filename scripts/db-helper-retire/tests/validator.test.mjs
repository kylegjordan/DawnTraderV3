import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExactMarkerSet, detectConnectionMarkers, validateLedgerObject } from '../validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
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

const controlled = new Map([['known.ts', ['node_postgres_constructor']]]);
assertExactMarkerSet(controlled, new Set(['known.ts']));
checks += 1;
controlled.set('mutant.ts', ['node_postgres_constructor']);
rejects(() => assertExactMarkerSet(controlled, new Set(['known.ts'])), /mutant\.ts/, 'new unclassified marker path turns red');

console.log(`B-DB-HELPER-RETIRE mutations: ${checks} checks passed`);
