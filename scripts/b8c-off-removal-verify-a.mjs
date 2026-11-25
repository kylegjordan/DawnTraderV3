// Read-only cutover check. Run as the staging app user from its checkout; follow it with the governed four-row DB census.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function verifyPhaseA(expected, evidence) {
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('expected the reviewed 40-character Phase A SHA');
  const { head, built, recordSha, healthSha, process, appDir, bundle, bundleMtime, deployedAt, restart } = evidence;
  for (const [source, value] of Object.entries({ head, built, recordSha, healthSha })) {
    if (value !== expected) throw new Error(`Phase A SHA mismatch: ${source}=${value}, expected=${expected}`);
  }
  if (
    process?.status !== 'online' ||
    !Number.isSafeInteger(process.pid) || process.pid <= 0 ||
    process.cwd !== appDir ||
    process.script !== bundle ||
    !Number.isSafeInteger(restart) || restart < 0 || process.restart !== restart ||
    !(Number.isFinite(bundleMtime) && process.uptime >= bundleMtime && process.uptime <= deployedAt)
  ) {
    throw new Error('Phase A process does not match the deployed bundle and recorded restart');
  }
}

async function main(expected) {
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('expected the reviewed 40-character Phase A SHA');
  const record = new Map(readFileSync('/home/deploy/dawntrader-deploy.record', 'utf8').trim().split('\n')
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const appDir = realpathSync('.');
  const bundle = resolve(appDir, 'dist/index.js');
  const command = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 10_000 }).trim();
  const apps = JSON.parse(command('pm2', ['jlist'])).filter(item => item.name === 'dawntrader');
  if (apps.length !== 1) throw new Error(`expected one DawnTrader process, found ${apps.length}`);
  const [{ pid, pm2_env: pm }] = apps;
  const health = await fetch('http://localhost:5000/api/health/liveness', { signal: AbortSignal.timeout(10_000) });
  if (!health.ok) throw new Error(`liveness returned HTTP ${health.status}`);
  const { buildSha: healthSha, engineExpected, engineRunning } = await health.json();
  if (typeof engineExpected !== 'boolean' || typeof engineRunning !== 'boolean' || (engineExpected && !engineRunning)) {
    throw new Error('liveness is malformed or the expected paper engine is stopped');
  }
  verifyPhaseA(expected, {
    head: command('git', ['rev-parse', 'HEAD']),
    built: readFileSync('dist/BUILD_SHA', 'utf8').trim(),
    recordSha: record.get('sha'),
    healthSha,
    process: { pid, status: pm.status, cwd: pm.pm_cwd, script: pm.pm_exec_path, restart: pm.restart_time, uptime: pm.pm_uptime },
    appDir,
    bundle,
    bundleMtime: statSync(bundle).mtimeMs,
    deployedAt: Date.parse(record.get('deployed_at')) + 999, // deploy record has only second precision
    restart: record.has('restart_time') ? Number(record.get('restart_time')) : NaN,
  });
  console.log(`Phase A identity PASS sha=${expected} pid=${pid} restarts=${pm.restart_time}; four-row census still required`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.length === 3 ? process.argv[2] : undefined).catch(error => {
    // pm2 jlist can contain process environment data. Emit only our own errors or the failing command's error class.
    console.error(`Phase A refused: ${error instanceof SyntaxError || 'stderr' in error ? 'could not read process evidence' : error.message}`);
    process.exitCode = 1;
  });
}
