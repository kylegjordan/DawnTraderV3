import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SystemAlert } from '../../services/system-alerts.js';
import { withAlertFileLock } from '../../services/system-alert-file-lock.mjs';
import { commitWatchdogAttempt, enqueueWatchdogAlert, readWatchdogHead, recordWatchdogRecovery } from '../../services/watchdog-alert-store.mjs';

const run = promisify(execFile);
const watchdog = 'server/scripts/staging-liveness-watchdog.mjs';
const cli = ['node_modules/tsx/dist/cli.mjs', 'scripts/system-alerts.ts'];
const key = 'watchdog-http';
let scratch: string;
let ledger: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'dt-watchdog-queue-'));
  ledger = join(scratch, 'alerts.jsonl');
  env = { ...process.env, SYSTEM_ALERTS_FILE: ledger, WATCHDOG_APP_DIR: join(scratch, 'missing-cli') };
});

afterEach(async () => { await rm(scratch, { recursive: true, force: true }); });

function node(args: string[]) {
  return run(process.execPath, args, { env, timeout: 15_000 });
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

describe('durable watchdog alert queue', () => {
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
