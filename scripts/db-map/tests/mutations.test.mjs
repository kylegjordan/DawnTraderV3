import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCatalogCsv } from '../catalog.mjs';
import { assertAdapterFidelity, toTblsSchema } from '../adapter.mjs';
import { verifyArtifactSet, verifyFence } from '../verify.mjs';
import { relationKey, sha256 } from '../util.mjs';
import { fixtureCsv } from './fixture.mjs';

let killed = 0;
function mustFail(fn, label) {
  try { fn(); } catch { killed += 1; return; }
  assert.fail(`mutant survived: ${label}`);
}

async function mustFailAsync(fn, label) {
  try { await fn(); } catch { killed += 1; return; }
  assert.fail(`mutant survived: ${label}`);
}

const catalog = parseCatalogCsv(fixtureCsv());
const base = toTblsSchema(catalog);
function mutate(label, change) {
  const candidate = structuredClone(base);
  change(candidate);
  mustFail(() => assertAdapterFidelity(catalog, candidate), label);
}

mutate('relation removed', (x) => x.tables.pop());
mutate('column removed', (x) => x.tables.find((t) => t.name === 'public.users').columns.pop());
mutate('column default removed', (x) => { delete x.tables.find((t) => t.name === 'public.users').columns[1].default; });
mutate('identity marker removed', (x) => { delete x.tables.find((t) => t.name === 'public.users').columns[0].extra_def; });
mutate('generated marker removed', (x) => { delete x.tables.find((t) => t.name === 'public.users').columns[2].extra_def; });
for (const type of ['PRIMARY KEY', 'UNIQUE', 'CHECK', 'FOREIGN KEY']) mutate(`${type} removed`, (x) => {
  const table = x.tables.find((t) => t.name === 'public.users');
  table.constraints = table.constraints.filter((row) => row.type !== type);
});
mutate('index removed', (x) => { x.tables.find((t) => t.name === 'public.users').indexes = []; });
mutate('FK relation removed', (x) => { x.relations = []; });

const missingSection = fixtureCsv().split('\n').filter((line) => !line.startsWith('indexes,')).join('\n');
mustFail(() => parseCatalogCsv(missingSection), 'catalog section removed');
const duplicateRelation = fixtureCsv().replace('\ncolumns,4,1,', `\nrelations,3,99,${fixtureCsv().split('\n').find((line) => line.startsWith('relations,3,1,')).split(',').slice(3).join(',')}\ncolumns,4,1,`);
mustFail(() => parseCatalogCsv(duplicateRelation), 'relation duplicated');

const artifactRoot = await mkdtemp(join(tmpdir(), 'db-map-artifact-set-'));
try {
  const body = Buffer.from('declared\n');
  await writeFile(join(artifactRoot, 'manifest.json'), '{}\n');
  await writeFile(join(artifactRoot, 'declared.txt'), body);
  await verifyArtifactSet(artifactRoot, { 'declared.txt': sha256(body) }); killed += 1;
  await writeFile(join(artifactRoot, 'unlisted.txt'), 'mutant\n');
  await mustFailAsync(() => verifyArtifactSet(artifactRoot, { 'declared.txt': sha256(body) }), 'unlisted artifact added');
  await rm(join(artifactRoot, 'unlisted.txt'));
  await rm(join(artifactRoot, 'declared.txt'));
  await mustFailAsync(() => verifyArtifactSet(artifactRoot, { 'declared.txt': sha256(body) }), 'declared artifact removed');
  await mustFailAsync(() => verifyArtifactSet(artifactRoot, { '../escape.txt': sha256(body) }), 'escaping artifact path');
} finally {
  await rm(artifactRoot, { recursive: true, force: true });
}

assert.notEqual(relationKey('a.b', 'c'), relationKey('a', 'b.c')); killed += 1;
mustFail(() => assert.notEqual(`${'a.b'}.${'c'}`, `${'a'}.${'b.c'}`), 'plain dotted relation identity collision');

const repo = await mkdtemp(join(tmpdir(), 'db-map-fence-'));
try {
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  await writeFile(join(repo, 'source.ts'), 'export const value = 1;\n');
  git('add', 'source.ts'); git('commit', '-m', 'source');
  const source = git('rev-parse', 'HEAD');
  await mkdir(join(repo, 'docs/database-map'), { recursive: true });
  await writeFile(join(repo, 'docs/database-map/index.md'), '# map\n');
  git('add', 'docs/database-map/index.md'); git('commit', '-m', 'artifact');
  const artifact = git('rev-parse', 'HEAD');
  assert.equal(verifyFence(repo, source, artifact), artifact); killed += 1;
  await writeFile(join(repo, 'source.ts'), 'export const value = 2;\n');
  git('add', 'source.ts'); git('commit', '-m', 'covered source');
  mustFail(() => verifyFence(repo, source, 'HEAD'), 'covered source plus artifact history');
  git('checkout', '-b', 'mode-mutant', artifact);
  if (process.platform !== 'win32') {
    await chmod(join(repo, 'source.ts'), 0o755); git('add', 'source.ts'); git('commit', '-m', 'mode');
    mustFail(() => verifyFence(repo, source, 'HEAD'), 'covered executable mode');
  }
  git('checkout', '-B', 'rename-mutant', artifact);
  git('mv', 'source.ts', 'renamed.ts'); git('commit', '-m', 'rename');
  mustFail(() => verifyFence(repo, source, 'HEAD'), 'covered rename');
} finally {
  await rm(repo, { recursive: true, force: true });
}

console.log(`db-map mutations: ${killed} mutants killed`);
