#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { completeSuccessfulRun, freshnessAlertActions, weeklyAlertActions } from './dt-db-map-policy.mjs';

const STATE = process.env.DT_DB_MAP_STATE ?? '/var/lib/dt-db-map';
const REPO = process.env.DT_DB_MAP_REPO ?? '/opt/governance-checker/DawnTraderV3';
const APP = process.env.DT_DB_MAP_APP ?? '/home/deploy/dawntrader';
const REF = process.env.DT_DB_MAP_REF ?? 'refs/remotes/origin/migration/aws-supabase';
const NODE = process.execPath;
const TBLs = '/usr/local/lib/dt-db-map/tbls-v1.97.0/tbls';
const RECEIPTS = join(STATE, 'receipts');
const NPM = process.env.DT_DB_MAP_NPM ?? '/usr/bin/npm';

function now() { return new Date().toISOString(); }
function git(args, options = {}) { return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options }); }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${(result.stderr || result.stdout).slice(-3000)}`);
  return result.stdout;
}

async function atomicJson(path, value) {
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

async function rotateReceipts() {
  const rows = (await readdir(RECEIPTS)).filter((name) => name.endsWith('.json')).sort().reverse();
  for (const name of rows.slice(8)) await rm(join(RECEIPTS, name), { force: true });
}

function alertArgs(command, key, evidence, body = '') {
  if (command === 'resolve-key') return ['--prefix', APP, 'run', '-s', 'system-alerts', '--', 'resolve-key', key, '--by', 'codex-infra', '--evidence', evidence];
  return ['--prefix', APP, 'run', '-s', 'system-alerts', '--', 'add', '--triggers-at', now(), '--category', 'breakage', '--severity', 'warning', '--title', `Database map: ${key.split(':')[1]}`, '--body', body, '--dedupe-key', key, '--metadata', JSON.stringify({ dedupe_key: key, owner: 'CC-INFRA', source: 'dt-db-map' })];
}

function alert(command, key, evidence, body = '') {
  return run(NPM, alertArgs(command, key, evidence, body), { env: { ...process.env, PATH: '/usr/bin:/bin', HOME: '/home/deploy', npm_config_cache: '/tmp/dt-db-map-npm-cache' } });
}

function applyWeeklyAlerts(success, structuralMatch, receipt) {
  for (const action of weeklyAlertActions({ success, structuralMatch })) {
    if (action.command === 'resolve-key') alert(action.command, action.key, `${receipt.result}:${receipt.source_ref ?? 'unresolved'}`);
    else alert('add', action.key, '', action.key === 'db-map:drift'
      ? `Verified candidate ${receipt.source_ref} differs structurally from reviewed baseline ${receipt.baseline_source_ref}. Evidence: ${RECEIPTS}. Resolve only after a reviewed baseline refresh or a verified match.`
      : `Database-map generation did not complete. Bounded evidence is in ${RECEIPTS}; source ref ${receipt.source_ref ?? 'not established'}.`);
  }
}

async function skipped() {
  await mkdir(RECEIPTS, { recursive: true, mode: 0o700 });
  const stamp = now().replace(/[-:.]/g, '');
  await atomicJson(join(RECEIPTS, `${stamp}-skipped.json`), { schema_version: 1, at: now(), result: 'lock-held-skip', success: false });
  await rotateReceipts();
}

async function weekly() {
  await mkdir(RECEIPTS, { recursive: true, mode: 0o700 });
  await chmod(STATE, 0o750); await chmod(RECEIPTS, 0o700);
  const receipt = { schema_version: 1, started_at: now(), generation_success: false, alert_delivery_success: false, success: false, result: 'failure' };
  let runRoot = null;
  try {
    run('/usr/bin/git', ['-C', REPO, 'fetch', '--no-tags', 'origin', 'migration/aws-supabase']);
    const sourceRef = git(['rev-parse', '--verify', `${REF}^{commit}`]).trim();
    if (!/^[0-9a-f]{40}$/.test(sourceRef)) throw new Error('remote branch did not peel to immutable 40-hex');
    receipt.source_ref = sourceRef;
    runRoot = await mkdtemp(join(STATE, 'run-'));
    await chmod(runRoot, 0o700);
    const archive = join(runRoot, 'source.tar');
    run('/usr/bin/git', ['-C', REPO, 'archive', '--format=tar', `--output=${archive}`, sourceRef]);
    const source = join(runRoot, 'source'); await mkdir(source, { mode: 0o700 });
    run('/usr/bin/tar', ['-xf', archive, '-C', source]);
    const candidate = join(runRoot, 'candidate');
    const env = { ...process.env, HOME: '/home/deploy', NODE_PATH: '/usr/local/lib/dt-db-map/node_modules', DT_DB_MAP_DT_SQL: '/usr/local/bin/dt-sql' };
    run(NODE, [join(source, 'scripts/db-map/generate.mjs'), '--repo', REPO, '--source-ref', sourceRef, '--output', candidate, '--tbls', TBLs], { env });
    run(NODE, [join(source, 'scripts/db-map/verify.mjs'), '--repo', REPO, '--root', candidate], { env });
    const candidateManifest = JSON.parse(await readFile(join(candidate, 'manifest.json'), 'utf8'));
    const catalog = JSON.parse(await readFile(join(candidate, 'catalog.json'), 'utf8'));
    const artifactRef = git(['log', '-1', '--format=%H', sourceRef, '--', 'docs/database-map/manifest.json']).trim();
    if (!/^[0-9a-f]{40}$/.test(artifactRef)) throw new Error('checked-in database-map artifact ref is absent or unreadable');
    const baselineArchive = join(runRoot, 'baseline.tar');
    const baselineRoot = join(runRoot, 'baseline'); await mkdir(baselineRoot, { mode: 0o700 });
    run('/usr/bin/git', ['-C', REPO, 'archive', '--format=tar', `--output=${baselineArchive}`, sourceRef, 'docs/database-map']);
    run('/usr/bin/tar', ['-xf', baselineArchive, '-C', baselineRoot]);
    const baselineMap = join(baselineRoot, 'docs/database-map');
    run(NODE, [join(source, 'scripts/db-map/verify.mjs'), '--repo', REPO, '--root', baselineMap, '--artifact-ref', artifactRef], { env });
    const baseline = JSON.parse(await readFile(join(baselineMap, 'manifest.json'), 'utf8'));
    receipt.baseline_artifact_ref = artifactRef;
    receipt.baseline_source_ref = baseline.source_ref;
    receipt.baseline_structural_sha256 = baseline.structural_sha256;
    receipt.candidate_structural_sha256 = candidateManifest.structural_sha256;
    receipt.extraction_utc = candidateManifest.extraction_utc;
    receipt.statistics = {
      relation_count: catalog.relations.length,
      column_count: catalog.columns.length,
      constraint_count: catalog.constraints.length,
      index_count: catalog.indexes.length,
      rls_relation_count: catalog.relations.filter((row) => row.rls_enabled).length,
      unknown_row_estimate_count: catalog.relations.filter((row) => row.estimated_rows.state === 'unknown').length,
      known_physical_total_bytes: catalog.physical_totals.known_total_bytes,
      unknown_physical_size_count: catalog.physical_totals.unknown_relation_count,
    };
    if (baseline.structural_sha256 === candidateManifest.structural_sha256) {
      receipt.result = 'match';
    } else {
      receipt.result = 'drift';
    }
    receipt.completed_at = now();
    completeSuccessfulRun(receipt, () => applyWeeklyAlerts(true, receipt.result === 'match', receipt));
  } catch (error) {
    receipt.success = false;
    receipt.error = `${error.stack ?? error}`.slice(0, 4000);
    receipt.completed_at = now();
    if (!receipt.generation_success) {
      try { applyWeeklyAlerts(false, false, receipt); }
      catch (alertError) { receipt.alert_error = `${alertError}`.slice(0, 1000); }
    } else {
      receipt.alert_error = receipt.error;
    }
  } finally {
    const stamp = receipt.started_at.replace(/[-:.]/g, '');
    await atomicJson(join(RECEIPTS, `${stamp}-${receipt.result}.json`), receipt);
    await rotateReceipts();
    if (runRoot) await rm(runRoot, { recursive: true, force: true });
  }
  if (!receipt.success) process.exitCode = 1;
}

async function stale() {
  await mkdir(RECEIPTS, { recursive: true, mode: 0o700 });
  const names = (await readdir(RECEIPTS)).filter((name) => name.endsWith('.json')).sort().reverse();
  let newestSuccess = null;
  for (const name of names) {
    const row = JSON.parse(await readFile(join(RECEIPTS, name), 'utf8'));
    if (row.success) { newestSuccess = row; break; }
  }
  const nowMs = Date.now();
  const runAge = newestSuccess ? nowMs - Date.parse(newestSuccess.completed_at) : Infinity;
  const sourceRef = git(['rev-parse', '--verify', `${REF}^{commit}`]).trim();
  const baseline = JSON.parse(git(['show', `${sourceRef}:docs/database-map/manifest.json`]));
  const baselineAge = nowMs - Date.parse(baseline.extraction_utc);
  for (const action of freshnessAlertActions({ runAgeMs: runAge, baselineAgeMs: baselineAge })) {
    if (action.command === 'resolve-key') alert(action.command, action.key, action.key === 'db-map:run-stale' ? `fresh-receipt:${newestSuccess.source_ref}` : `fresh-baseline:${baseline.source_ref}`);
    else alert('add', action.key, '', action.key === 'db-map:run-stale'
      ? `No successful database-map receipt is newer than 8 days. Receipt root: ${RECEIPTS}.`
      : `The reviewed database-map baseline is older than 35 days. Baseline source ${baseline.source_ref}; fetched ref ${sourceRef}.`);
  }
}

const mode = process.argv[2];
if (mode === 'weekly') await weekly();
else if (mode === 'stale') await stale();
else if (mode === 'lock-skipped') await skipped();
else { console.error('Usage: dt-db-map-runner.mjs <weekly|stale|lock-skipped>'); process.exit(2); }
