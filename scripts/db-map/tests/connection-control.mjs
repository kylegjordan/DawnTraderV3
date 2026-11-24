import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCatalogCsv } from '../generate.mjs';
import { fixtureCsv } from './fixture.mjs';

if (process.platform === 'win32') {
  console.log('db-map connection control: SKIP on Windows (runs as a required Linux CI control)');
  process.exit(0);
}
const root = await mkdtemp(join(tmpdir(), 'db-map-connection-'));
try {
  const csv = join(root, 'catalog.csv');
  const log = join(root, 'calls.log');
  const fake = join(root, 'dt-sql');
  await writeFile(csv, fixtureCsv(), { mode: 0o600 });
  await writeFile(fake, `#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(process.env.FAKE_CALL_LOG,'call\\n');process.stdout.write(fs.readFileSync(process.env.FAKE_CSV));\n`, { mode: 0o700 });
  await chmod(fake, 0o700);
  process.env.DT_DB_MAP_DT_SQL = fake;
  process.env.FAKE_CALL_LOG = log;
  process.env.FAKE_CSV = csv;
  const output = await readCatalogCsv(null);
  assert.equal(output, fixtureCsv());
  const calls = (await readFile(log, 'utf8')).trim().split('\n');
  assert.equal(calls.length, 1, 'one complete catalog read did not invoke dt-sql exactly once');

  await readCatalogCsv(null);
  const mutantCalls = (await readFile(log, 'utf8')).trim().split('\n');
  assert.equal(mutantCalls.length, 2, 'two-call mutant was not observable');
  assert.notEqual(mutantCalls.length, 1, 'two-call mutant survived the connection-count gate');
  console.log('db-map connection control: one call PASS; two-call mutant RED');
} finally {
  await rm(root, { recursive: true, force: true });
}
