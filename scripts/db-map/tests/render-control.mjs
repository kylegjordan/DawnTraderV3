import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generate } from '../generate.mjs';
import { verify } from '../verify.mjs';
import { fixtureCsv } from './fixture.mjs';

const binary = process.env.DT_DB_MAP_TBLS;
if (!binary) throw new Error('DT_DB_MAP_TBLS is required');
const repo = resolve(process.cwd());
const root = await mkdtemp(join(tmpdir(), 'db-map-render-'));
try {
  const csv = join(root, 'catalog.csv');
  const out = join(root, 'out');
  const out2 = join(root, 'out-2');
  await writeFile(csv, fixtureCsv(), { mode: 0o600 });
  const result = await generate({ repo, sourceRef: 'HEAD', catalogCsv: csv, output: out, tblsBinary: binary, allowUnpinnedRuntime: true });
  const repeat = await generate({ repo, sourceRef: 'HEAD', catalogCsv: csv, output: out2, tblsBinary: binary, allowUnpinnedRuntime: true });
  assert.equal(result.manifest.tbls.rendered, true);
  assert.deepEqual(result.manifest.artifact_hashes, repeat.manifest.artifact_hashes, 'fixed input did not render byte-identically');
  const rendered = await readFile(join(out, 'tbls', 'README.md'), 'utf8');
  assert.match(rendered, /fixture/i);
  const verified = await verify({ root: out, repo });
  assert.equal(verified.source_ref, result.manifest.source_ref);
  console.log(`db-map pinned render: PASS (${verified.artifacts} hashed artifacts)`);
} finally {
  await rm(root, { recursive: true, force: true });
}
