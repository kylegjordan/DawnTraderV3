import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SystemAlert } from '../../services/system-alerts.js';
import { withAlertFileLock } from '../../services/system-alert-file-lock.mjs';
import { commitWatchdogAttempt, enqueueWatchdogAlert, readWatchdogHead, recordWatchdogRecovery } from '../../services/watchdog-alert-store.mjs';

const run = promisify(execFile);
const watchdog = 'server/scripts/staging-liveness-watchdog.mjs';
const cli = ['node_modules/tsx/dist/cli.mjs', 'scripts/system-alerts.ts'];
const key = 'watchdog-http';
const holdManifest = process.env.DT_WATCHDOG_1191_PROOF_MANIFEST;
const holdRef = '423616c386';
const holdBase = 'feddf5c73';
let scratch: string;
let ledger: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'dt-watchdog-queue-'));
  ledger = join(scratch, 'alerts.jsonl');
  env = { ...process.env, SYSTEM_ALERTS_FILE: ledger, WATCHDOG_APP_DIR: join(scratch, 'missing-cli') };
});

afterEach(async () => { await rm(scratch, { recursive: true, force: true }); });

function node(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return run(process.execPath, args, { env: { ...env, ...extraEnv }, timeout: 15_000 });
}

function runCli(...args: string[]) {
  return node([...cli, ...args]);
}

async function rows(): Promise<SystemAlert[]> {
  const text = await readFile(ledger, 'utf8');
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function scheduled(dedupeKey: string): SystemAlert {
  const time = new Date().toISOString();
  return {
    schema_version: 1, id: randomUUID(), created_at: time, triggers_at: time, fired_at: null,
    acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by_claimed: null,
    resolved_by_transport: null, resolution_evidence: null, state: 'scheduled', category: 'breakage',
    severity: 'critical', title: dedupeKey, body: `${dedupeKey} check failed`, metadata: {},
    recurrence_interval_seconds: null, dedupe_key: dedupeKey,
  };
}

async function waitFor(condition: () => Promise<boolean>) {
  const end = performance.now() + 4_000;
  while (performance.now() < end) {
    if (await condition()) return;
    await delay(20);
  }
  throw new Error('The other writer did not reach its expected boundary');
}

async function pauseLedgerReplacement(target: 'ledger' | 'pending-state' = 'ledger') {
  const preload = join(scratch, 'pause-replace.mjs');
  const waiting = join(scratch, 'at-replace');
  const release = join(scratch, 'release-replace');
  await writeFile(preload, `
    import fs from 'node:fs';
    import fsp from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const ledger = ${JSON.stringify(ledger)};
    const target = ${JSON.stringify(target)};
    const waiting = ${JSON.stringify(waiting)};
    const release = ${JSON.stringify(release)};
    const syncRename = fs.renameSync;
    const asyncRename = fsp.rename;
    function pause(path) {
      if (target === 'ledger' ? path !== ledger : !path.startsWith(ledger + '.watchdog-')) return;
      fs.writeFileSync(waiting, 'the ledger snapshot is already staged for replacement');
      const end = performance.now() + 5_000;
      const timer = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(release)) {
        if (performance.now() >= end) throw new Error('fixture release timed out');
        Atomics.wait(timer, 0, 0, 20);
      }
    }
    fs.renameSync = (from, to) => { pause(to); return syncRename(from, to); };
    fsp.rename = async (from, to) => { pause(to); return asyncRename(from, to); };
    syncBuiltinESMExports();
  `);
  return {
    env: { NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(preload).href}`.trim() },
    waiting: () => access(waiting).then(() => true, () => false),
    release: () => writeFile(release, 'continue'),
  };
}

function controlWrite() {
  return [...cli, 'add', '--triggers-at', new Date().toISOString(), '--category', 'health_check',
    '--severity', 'info', '--title', 'Independent write', '--body', 'Concurrent control', '--dedupe-key', 'independent-writer'];
}

async function applyCandidateToHoldSource(relativePath: string) {
  const [base, pinned, candidate] = await Promise.all([
    run('git', ['show', `${holdBase}:${relativePath}`]).then(result => result.stdout),
    run('git', ['show', `${holdRef}:${relativePath}`]).then(result => result.stdout),
    readFile(relativePath, 'utf8'),
  ]);
  const inputs = await Promise.all([candidate, base, pinned].map(async (source, index) => {
    const input = join(scratch, `${index}-${relativePath.replaceAll('/', '-')}`);
    await writeFile(input, source.replaceAll('\r\n', '\n'));
    return input;
  }));
  return (await run('git', ['merge-file', '--stdout', ...inputs])).stdout;
}

async function buildHoldDispatcher() {
  const entry = resolve('scripts/system-alerts.ts');
  const [contents, service] = await Promise.all([
    applyCandidateToHoldSource('scripts/system-alerts.ts'),
    applyCandidateToHoldSource('server/services/system-alerts.ts'),
  ]);
  expect(contents.includes("&& alert.dedupe_key?.startsWith(RAIL_KEY_PREFIX) === true")).toBe(true);
  expect(contents.includes("&& alert.state === 'active' && alert.category === 'breakage' && alert.severity === 'warning'")).toBe(true);
  expect(service.includes('if (defer?.(fresh))')).toBe(true);
  const outfile = join(scratch, 'pinned-hold-candidate.cjs');
  await build({
    stdin: { contents, sourcefile: entry, resolveDir: dirname(entry), loader: 'ts' },
    platform: 'node', bundle: true, format: 'cjs', outfile,
    plugins: [{
      name: 'pinned-hold-alert-service',
      setup(plugin) {
        plugin.onLoad({ filter: /[\\/]server[\\/]services[\\/]system-alerts\.ts$/ }, args => ({
          contents: service, loader: 'ts', resolveDir: dirname(args.path),
        }));
      },
    }],
  });
  return outfile;
}

describe('durable watchdog alert queue', () => {
  it.each(['canonical', 'watchdog'])('preserves both writers when %s has already read the ledger', async first => {
    const control = { ...scheduled('preexisting-control'), severity: 'info' };
    await writeFile(ledger, `${JSON.stringify(control)}\n`);
    const pause = await pauseLedgerReplacement();
    const canonical = controlWrite();
    const failure = [watchdog, '--self-fail'];
    const order = first === 'canonical' ? [canonical, failure] : [failure, canonical];
    const holder = node(order[0], pause.env);
    void holder.catch(() => {});
    let contender: ReturnType<typeof node> | undefined;
    let id: string | undefined;
    try {
      await waitFor(pause.waiting);
      contender = node(order[1]);
      void contender.catch(() => {});
      await waitFor(async () => (await readdir(scratch)).some(name => name.startsWith('alerts.jsonl.lock.')));
      expect(await rows()).toEqual([control]);
      id = (await readWatchdogHead(ledger, 'watchdog-self-fail'))?.row.id;
      expect(id).toBeTruthy();
    } finally {
      await pause.release();
      await Promise.all([holder, contender]);
    }
    const stored = await rows();
    expect(stored.find(row => row.id === control.id)).toEqual(control);
    expect(stored.filter(row => row.dedupe_key === 'independent-writer')).toHaveLength(1);
    expect(stored.filter(row => row.dedupe_key === 'watchdog-self-fail').map(row => row.id)).toEqual([id]);
  }, 20_000);

  it('reproduces the lost UUID with the pinned old unlocked watchdog', async () => {
    const legacy = join(scratch, 'legacy-watchdog.mjs');
    const source = await run('git', ['show', `${holdBase}:${watchdog}`]);
    await writeFile(legacy, source.stdout);
    const control = { ...scheduled('preexisting-control'), severity: 'info' };
    await writeFile(ledger, `${JSON.stringify(control)}\n`);
    const pause = await pauseLedgerReplacement();
    const holder = node(controlWrite(), pause.env);
    void holder.catch(() => {});
    let id: string | undefined;
    try {
      await waitFor(pause.waiting);
      const result = await node([legacy, '--self-fail']);
      expect(result.stdout).toContain('alert appended directly');
      id = (await rows()).find(row => row.dedupe_key === 'watchdog-self-fail')?.id;
      expect(id).toBeTruthy();
    } finally {
      await pause.release();
      await holder;
    }
    const stored = await rows();
    expect(stored.some(row => row.id === id)).toBe(false);
    expect(stored.find(row => row.id === control.id)).toEqual(control);
    expect(stored.filter(row => row.dedupe_key === 'independent-writer')).toHaveLength(1);
  }, 15_000);

  it('keeps the real failure-notify UUID through a held ledger, watchdog exit and weekly retry', async () => {
    const control = { ...scheduled('independent-control'), severity: 'info' };
    await writeFile(ledger, `${JSON.stringify(control)}\n`);
    let attemptId: string | undefined;
    await withAlertFileLock(ledger, async () => {
      const blocked = await node([watchdog, '--self-fail']);
      expect(blocked.stdout).toContain('still pending');
      expect(await rows()).toEqual([control]);
      const head = await readWatchdogHead(ledger, 'watchdog-self-fail');
      expect(head?.matchedId).toBeNull();
      attemptId = head?.row.id;
      expect(attemptId).toBeTruthy();
    });

    const heartbeat = await node([watchdog, '--heartbeat']);
    expect(heartbeat.stdout).toContain(`attempt ${attemptId} matched ledger row ${attemptId}`);
    await node([watchdog, '--heartbeat']);
    const stored = await rows();
    expect(stored.find(row => row.id === control.id)).toEqual(control);
    expect(stored.filter(row => row.dedupe_key === 'watchdog-self-fail').map(row => row.id)).toEqual([attemptId]);
    expect(stored.filter(row => row.dedupe_key === `watchdog-heartbeat-${new Date().toISOString().slice(0, 10)}`)).toHaveLength(1);
  }, 20_000);

  it.skipIf(process.platform !== 'linux')('reuses a durable CLI UUID after killing the writer before matched state is retired', async () => {
    const first = scheduled(key);
    await enqueueWatchdogAlert(ledger, first);
    const pause = await pauseLedgerReplacement('pending-state');
    // Import tsx directly so SIGKILL targets the actual writer process.
    const writer = node(['--import', 'tsx', 'scripts/system-alerts.ts', 'watchdog-commit', '--dedupe-key', key, '--id', first.id], pause.env);
    void writer.catch(() => {});
    try {
      await waitFor(pause.waiting);
      expect((await rows()).map(row => row.id)).toEqual([first.id]);
      expect((await readWatchdogHead(ledger, key))?.matchedId).toBeNull();
    } finally {
      writer.child.kill('SIGKILL');
      await expect(writer).rejects.toHaveProperty('signal', 'SIGKILL');
    }
    const aged = Date.now() / 1000 - 31;
    const locks = (await readdir(scratch)).filter(name => name.endsWith('.lock'));
    expect(locks).toHaveLength(2);
    await Promise.all(locks.map(name => utimes(join(scratch, name), aged, aged)));
    await node([watchdog, '--heartbeat']);
    const recovered = (await rows()).filter(row => row.dedupe_key === key);
    expect(recovered.map(row => [row.id, row.metadata.emit_path])).toEqual([[first.id, 'cli']]);
    expect((await readWatchdogHead(ledger, key))?.matchedId).toBe(first.id);
  }, 20_000);

  it.skipIf(process.platform !== 'linux')('records a single healthy watchdog tick while its first outage is still pending', async () => {
    const pm2 = join(scratch, 'pm2');
    const state = join(scratch, 'watchdog-state.json');
    const archive = join(scratch, 'archive.log');
    await writeFile(pm2, "#!/bin/sh\nprintf '%s\\n' '[{\"name\":\"dawntrader\",\"pm2_env\":{\"status\":\"online\"}}]'\n", { mode: 0o755 });
    await writeFile(state, JSON.stringify({ streaks: { http: 1 } }));
    await writeFile(archive, `[archival-health] started at ${new Date().toISOString()}\n[archival-health] DONE — all_ok=true\n`);
    await writeFile(ledger, '');
    let healthy = false;
    const received: string[] = [];
    const sink = createServer(async (req, res) => {
      if (req.url === '/receipt') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')).content);
        res.writeHead(204).end();
      } else if (req.url === '/liveness') {
        res.writeHead(200).end('{"engineExpected":false}');
      } else {
        res.writeHead(healthy ? 200 : 503).end();
      }
    });
    try {
      await new Promise<void>((accept, reject) => sink.once('error', reject).listen(0, '127.0.0.1', accept));
      const address = sink.address();
      if (!address || typeof address === 'string') throw new Error('No isolated watchdog fixture port');
      const url = `http://127.0.0.1:${address.port}`;
      Object.assign(env, {
        PATH: `${scratch}:${env.PATH}`, WATCHDOG_STATE_FILE: state, WATCHDOG_ARCHIVAL_HEALTH_LOG: archive,
        WATCHDOG_APP_URL: url, WATCHDOG_LIVENESS_URL: `${url}/liveness`, WATCHDOG_PM2_NAME: 'dawntrader',
        ALERTS_DISCORD_WEBHOOK_URL: `${url}/receipt`, WATCHDOG_DISK_WARN_PCT: '101',
        WATCHDOG_DISK_CRIT_PCT: '101', WATCHDOG_DISK_CRIT_FREE_BYTES: '0',
      });

      let first: string | undefined;
      await withAlertFileLock(ledger, async () => {
        await node([watchdog]);
        first = (await readWatchdogHead(ledger, key))?.row.id;
        expect(first).toBeTruthy();
        healthy = true;
        await node([watchdog]);
        expect(await readWatchdogHead(ledger, key)).toMatchObject({ row: { id: first }, recovery: expect.stringContaining('http check passed'), matchedId: null });
        healthy = false;
        await node([watchdog]);
        await node([watchdog]);
        expect(await rows()).toEqual([]);
        expect((await readWatchdogHead(ledger, key))?.row.id).toBe(first);
      });

      await node([watchdog]);
      expect((await rows()).map(row => [row.id, row.state])).toEqual([[first, 'scheduled']]);
      await runCli('fire-due');
      expect(received).toHaveLength(1);
      expect(received[0]).toContain(first!);
      await node([watchdog], { WATCHDOG_APP_DIR: process.cwd() });
      const entries = await rows();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ id: first, state: 'resolved', resolved_by_claimed: 'staging-liveness-watchdog' });
      expect(entries[1]).toMatchObject({ state: 'scheduled', dedupe_key: key });
      expect(entries[1].id).not.toBe(first);
      expect((await readWatchdogHead(ledger, key))?.row.id).toBe(entries[1].id);
    } finally {
      sink.close();
    }
  }, 45_000);

  it.skipIf(!holdManifest)('keeps the pinned #1191 warning held while the watchdog gets its first receipt', async () => {
    const manifest = await readFile(holdManifest!);
    expect(createHash('sha256').update(manifest).digest('hex')).toBe('37dc0d1d99c37a49a614f24a136434a04ad5263be80fe19e20ee0906e24f9816');
    const pinnedId = manifest.toString('utf8').split('\n')[0];
    const binary = await buildHoldDispatcher();
    const now = Date.parse('2026-11-27T06:00:00Z');
    const { RAIL_KEY_PREFIX } = await import('../../core/trading/vts-rail.js');
    const held = {
      ...scheduled(`${RAIL_KEY_PREFIX}fixture`), id: pinnedId, state: 'active', severity: 'warning',
      created_at: new Date(now - 48 * 3600_000).toISOString(), fired_at: new Date(now - 47 * 3600_000).toISOString(),
    };
    const watchdogRow = { ...scheduled(key), triggers_at: new Date(now - 60_000).toISOString() };
    const laterRow = { ...scheduled(key), triggers_at: watchdogRow.triggers_at };
    await writeFile(ledger, `${JSON.stringify(held)}\n`);
    await enqueueWatchdogAlert(ledger, watchdogRow);
    await commitWatchdogAttempt(ledger, key, watchdogRow.id, 'fallback_atomic');
    await recordWatchdogRecovery(ledger, key, `watchdog run ${randomUUID()}: fixture recovered before dispatch`);
    await enqueueWatchdogAlert(ledger, laterRow);
    const received: Array<{ status: number; content: string }> = [];
    const statuses = [204, 503, 503, 204];
    const sink = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const { content } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const status = statuses.shift() ?? 500;
      received.push({ status, content });
      res.writeHead(status).end();
    });
    try {
      await new Promise<void>((accept, reject) => sink.once('error', reject).listen(0, '127.0.0.1', accept));
      const address = sink.address();
      if (!address || typeof address === 'string') throw new Error('No isolated webhook port');
      const runHold = (at: number, ...args: string[]) => node([
        '--import', `data:text/javascript,${encodeURIComponent(`Date.now = () => ${at}`)}`, binary, ...args,
      ], { DT_VTS_NOV26_REPEAT_HOLD_FILE: holdManifest, ALERTS_DISCORD_WEBHOOK_URL: `http://127.0.0.1:${address.port}` });
      const args = (id: string) => ['--dedupe-key', key, '--id', id];
      const result = await runHold(now, 'fire-due');
      expect(result.stdout).toContain('repeat hold deferred 1');
      expect(result.stdout).toContain(`Discord alert posted for ${watchdogRow.id}`);
      expect(received).toHaveLength(1);
      expect(received[0].content).toContain(watchdogRow.id);
      const stored = await rows();
      expect(stored.find(row => row.id === pinnedId)).toEqual(held);
      expect(stored.find(row => row.id === watchdogRow.id)?.metadata).toMatchObject({
        watchdog_first_receipt: { id: watchdogRow.id },
      });
      await runHold(now, 'watchdog-recover', ...args(watchdogRow.id));
      await runHold(now, 'watchdog-commit', ...args(laterRow.id));
      await recordWatchdogRecovery(ledger, key, `watchdog run ${randomUUID()}: later outage cleared`);
      await runHold(now, 'fire-due');
      await runHold(now + 60_000, 'fire-due');
      expect(received.map(({ status }) => status)).toEqual([204, 503]);
      await runHold(now + 2 * 3600_000 + 1, 'fire-due');
      expect((await rows()).find(row => row.id === laterRow.id)?.metadata.resurface_count).toBeUndefined();
      await runHold(now, 'watchdog-recover', ...args(laterRow.id));
      expect((await rows()).find(row => row.id === laterRow.id)?.state).toBe('active');
      const retry = await runHold(now + 2 * 3600_000 + 1000, 'fire-due');
      expect(retry.stdout).toContain(`Discord alert posted for ${laterRow.id}`);
      expect(received.map(({ status }) => status)).toEqual([204, 503, 503, 204]);
      expect(received.slice(1).every(({ content }) => content.includes(laterRow.id))).toBe(true);
      await runHold(now + 2 * 3600_000 + 1000, 'watchdog-recover', ...args(laterRow.id));
      expect((await rows()).find(row => row.id === laterRow.id)).toMatchObject({ state: 'resolved', metadata: { resurface_count: 1 } });
      expect((await rows()).find(row => row.id === pinnedId)).toEqual(held);
    } finally {
      sink.close();
    }
  }, 30_000);

  it('keeps recovery and a separate relapse UUID until the first alert has a confirmed delivery', async () => {
    const first = scheduled(key);
    const relapse = scheduled(key);
    const recovery = `watchdog run ${randomUUID()}: fixture check passed`;
    await withAlertFileLock(ledger, async () => {
      await enqueueWatchdogAlert(ledger, first);
      await recordWatchdogRecovery(ledger, key, recovery);
      await enqueueWatchdogAlert(ledger, relapse);
      expect(await readWatchdogHead(ledger, key)).toMatchObject({ row: { id: first.id }, recovery, matchedId: null });
    });

    const args = (id: string) => ['--dedupe-key', key, '--id', id];
    await runCli('watchdog-commit', ...args(first.id));
    await runCli('watchdog-recover', ...args(first.id));
    await runCli('watchdog-commit', ...args(relapse.id));
    expect((await rows()).map(row => [row.id, row.state])).toEqual([[first.id, 'scheduled']]);

    const received: Array<{ status: number; content: string }> = [];
    const statuses = [503, 503, 204];
    const sink = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const { content } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const status = statuses.shift() ?? 500;
      received.push({ status, content });
      res.writeHead(status).end();
    });
    try {
      await new Promise<void>((resolve, reject) => sink.once('error', reject).listen(0, '127.0.0.1', resolve));
      const address = sink.address();
      if (!address || typeof address === 'string') throw new Error('No isolated webhook port');
      env.ALERTS_DISCORD_WEBHOOK_URL = `http://127.0.0.1:${address.port}`;
      const original = await runCli('fire-due');
      expect(original.stdout).toContain(`- ${first.id} [critical]`);
      expect((await rows())[0]).toMatchObject({ id: first.id, state: 'active' });
      await runCli('watchdog-recover', ...args(first.id));
      await runCli('fire-due');
      expect(received.map(({ status }) => status)).toEqual([503]);

      // Move only this fixture's promotion time to the ordinary 2-hour TTL.
      const [aged] = await rows();
      aged.fired_at = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000).toISOString();
      await writeFile(ledger, `${JSON.stringify(aged)}\n`);
      await runCli('fire-due');
      expect((await rows())[0].metadata.resurface_count).toBeUndefined();
      await runCli('watchdog-recover', ...args(first.id));
      expect((await rows())[0].state).toBe('active');

      const succeeding = await runCli('fire-due');
      expect(succeeding.stdout).toContain(`Discord alert posted for ${first.id}`);
      expect(received.map(({ status }) => status)).toEqual([503, 503, 204]);
      expect(received.every(({ content }) => content.includes(first.id))).toBe(true);
      expect((await rows())[0].metadata.resurface_count).toBe(1);
      await runCli('watchdog-recover', ...args(first.id));
      expect((await rows())[0]).toMatchObject({ id: first.id, state: 'resolved', resolution_evidence: recovery });
      expect(await readWatchdogHead(ledger, key)).toMatchObject({ row: { id: relapse.id } });

      // A delayed older worker can read its terminal UUID but cannot retire
      // the successor. The plain-Node writer can then commit that successor.
      await runCli('watchdog-commit', ...args(first.id));
      await commitWatchdogAttempt(ledger, key, relapse.id, 'fallback_atomic');
      expect((await rows()).map(row => [row.id, row.state])).toEqual([[first.id, 'resolved'], [relapse.id, 'scheduled']]);
    } finally {
      sink.close();
    }
  }, 45_000);
});
