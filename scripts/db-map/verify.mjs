#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';
import { validateAgainstOfficialSchema, validateTblsSchema, verifyVendoredSchema } from './adapter.mjs';
import { enumeratePopulation } from './population.mjs';
import { assert, compareBytes, readJson, sha256 } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function forbiddenSecret(text) {
  const patterns = [
    /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@/]+@/i,
    /\b(?:SUPABASE|DATABASE|PG)_(?:URL|PASSWORD)\s*[=:]\s*\S+/i,
    /\b(?:sk|sbp)_[A-Za-z0-9_-]{24,}\b/,
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  ];
  return patterns.find((pattern) => pattern.test(text)) ?? null;
}

async function artifactFiles(root, prefix = '') {
  const out = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await artifactFiles(root, path));
    else {
      assert(entry.isFile(), `artifact tree contains a non-regular file: ${path}`);
      out.push(path);
    }
  }
  return out.sort(compareBytes);
}

function canonicalArtifactPath(root, path) {
  assert(typeof path === 'string' && path.length > 0, 'artifact hash path is empty');
  assert(!path.includes('\\') && !path.includes('\0'), `artifact hash path is not canonical: ${path}`);
  assert(path !== 'manifest.json' && !path.startsWith('/') && posix.normalize(path) === path && !path.startsWith('../'), `artifact hash path is not canonical: ${path}`);
  const target = resolve(root, ...path.split('/'));
  assert(target.startsWith(`${root}${sep}`), `artifact hash path escapes the root: ${path}`);
}

export async function verifyArtifactSet(root, artifactHashes) {
  const absolute = resolve(root);
  const declared = Object.keys(artifactHashes);
  for (const path of declared) canonicalArtifactPath(absolute, path);
  declared.sort(compareBytes);
  const actual = await artifactFiles(absolute);
  const expected = [...declared, 'manifest.json'].sort(compareBytes);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `artifact path set differs: declared ${expected.length}, actual ${actual.length}`);
  return actual;
}

export function verifyFence(repo, sourceRef, artifactRef) {
  const target = execFileSync('git', ['-C', repo, 'rev-parse', '--verify', `${artifactRef}^{commit}`], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', sourceRef, target]);
  const raw = execFileSync('git', ['-C', repo, 'diff', '--raw', '-z', sourceRef, target], { encoding: 'utf8' });
  const tokens = raw.split('\0').filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const header = tokens[i];
    if (!header.startsWith(':')) continue;
    const status = header.trim().split(/\s+/).at(-1);
    const path = tokens[++i];
    const secondPath = /^[RC]/.test(status) ? tokens[++i] : null;
    for (const candidate of [path, secondPath].filter(Boolean)) {
      const allowed = candidate.startsWith('docs/database-map/') || candidate.startsWith('Claude Comms and Packages/Change Lists/B_DB_MAP_') || candidate === '.claude/memory/MEMORY_CC_INFRA.md';
      assert(allowed, `R..C fence rejects covered-source change: ${candidate}`);
    }
  }
  return target;
}

export async function verify(options) {
  const root = resolve(options.root);
  const repo = resolve(options.repo ?? REPO);
  const manifest = await readJson(join(root, 'manifest.json'));
  assert(manifest.schema_version === 1, 'manifest schema version is not supported');
  assert(/^[0-9a-f]{40}$/.test(manifest.source_ref), 'manifest source_ref is not immutable 40-hex');
  assert(manifest.database?.current_user === 'dt_reader', 'manifest catalog reader is not dt_reader');
  assert(manifest.manifest_self_hash === null && !Object.hasOwn(manifest.artifact_hashes, 'manifest.json'), 'manifest must explicitly exclude itself from artifact hashes');
  assert(manifest.tbls.version === CONFIG.tbls.version && manifest.tbls.archiveSha256 === CONFIG.tbls.archiveSha256 && manifest.tbls.archiveBytes === CONFIG.tbls.archiveBytes, 'tbls release metadata differs from the pin');
  assert(manifest.generator_version === 2 && manifest.scanner_version === CONFIG.scannerVersion, 'generator/scanner version differs');
  if (!options.allowUnpinnedRuntime) {
    assert(manifest.runtime?.node_version === CONFIG.runtime.nodeVersion && manifest.runtime?.node_sha256 === CONFIG.runtime.nodeSha256, 'Node runtime differs from the pin');
  }
  assert(manifest.runtime?.typescript_version === CONFIG.runtime.typescriptVersion && manifest.runtime?.typescript_sha256 === CONFIG.runtime.typescriptSha256, 'TypeScript runtime differs from the pin');
  assert(manifest.extraction_query_sha256 === sha256(await readFile(join(HERE, 'catalog.sql'))), 'catalog query hash differs');
  assert(manifest.scanner_config_sha256 === sha256(await readFile(join(HERE, 'config.mjs'))), 'scanner config hash differs');
  const manifestSchemaBytes = await readFile(join(HERE, 'manifest.schema.json'));
  assert(manifest.manifest_schema_sha256 === sha256(manifestSchemaBytes), 'manifest schema hash differs');
  validateAgainstOfficialSchema(manifest, JSON.parse(manifestSchemaBytes));
  const officialSchema = await verifyVendoredSchema(join(HERE, 'vendor/tbls-v1.97.0.schema.json'));
  const tblsSchema = await readJson(join(root, 'tbls-schema.json'));
  validateTblsSchema(tblsSchema);
  validateAgainstOfficialSchema(tblsSchema, officialSchema);
  const population = enumeratePopulation(repo, manifest.source_ref);
  assert(population.includedTupleSha256 === manifest.population.included_tuple_sha256, 'candidate-side included tuple population differs');
  assert(population.includedPathSha256 === manifest.population.included_path_sha256, 'candidate-side included path population differs');
  assert(population.excludedPathSha256 === manifest.population.excluded_path_sha256, 'candidate-side excluded population differs');
  assert(population.included.length === manifest.population.included_count && population.excluded.length === manifest.population.excluded_count, 'candidate-side population count differs');
  await verifyArtifactSet(root, manifest.artifact_hashes);
  for (const [path, expected] of Object.entries(manifest.artifact_hashes)) {
    const bytes = await readFile(join(root, path));
    assert(sha256(bytes) === expected, `artifact hash differs: ${path}`);
    const secret = forbiddenSecret(bytes.toString('utf8'));
    assert(!secret, `likely credential or DSN in artifact ${path}: ${secret}`);
  }
  assert(sha256(await readFile(join(root, 'structural.json'))) === manifest.structural_sha256, 'structural projection hash differs');
  let artifactRef = null;
  if (options.artifactRef) artifactRef = verifyFence(repo, manifest.source_ref, options.artifactRef);
  return { source_ref: manifest.source_ref, artifact_ref: artifactRef, artifacts: Object.keys(manifest.artifact_hashes).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = arg('root');
  if (!root) {
    console.error('Usage: verify.mjs --root <docs/database-map> [--repo <repo>] [--artifact-ref <C>]');
    process.exit(2);
  }
  verify({ root, repo: arg('repo', REPO), artifactRef: arg('artifact-ref') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(`db-map verify: ${error.stack ?? error}`); process.exit(1); });
}
