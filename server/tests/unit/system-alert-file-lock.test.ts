import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withAlertFileLock } from '../../services/system-alert-file-lock.mjs';

const lockModule = new URL('../../services/system-alert-file-lock.mjs', import.meta.url).href;
const reaper = fileURLToPath(new URL('../../scripts/reap-system-alert-lock.mjs', import.meta.url));
const linux = process.platform === 'linux';
let scratch: string;
let ledger: string;
let lock: string;
let children: ChildProcess[];

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'dt-alert-lock-'));
  ledger = join(scratch, 'alerts.jsonl');
  lock = `${ledger}.lock`;
  children = [];
});

afterEach(async () => {
  await Promise.all(children.map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
  }));
  await rm(scratch, { recursive: true, force: true });
});

function start(executable: string, args: string[]): ChildProcess {
  const child = spawn(executable, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  children.push(child);
  return child;
}

async function hold() {
  const holder = start(process.execPath, ['--input-type=module', '-e', `
    import { withAlertFileLock } from ${JSON.stringify(lockModule)};
    await withAlertFileLock(process.argv[1], async () => {
      process.send('locked');
      await new Promise(resolve => process.once('message', resolve));
    });
    process.disconnect();
  `, ledger]);
  expect((await once(holder, 'message'))[0]).toBe('locked');
  return holder;
}

async function ageOwner() {
  const aged = Date.now() / 1000 - 31;
  await utimes(lock, aged, aged);
}

describe('system alert file lock', () => {
  it('serializes two writers and releases the token after a failed operation', async () => {
    const holder = await hold();
    const owner = JSON.parse(await readFile(lock, 'utf8'));
    expect(owner.pid).toBe(holder.pid);
    const expected = new Error('failed operation');
    let entered = false;
    const writer = withAlertFileLock(ledger, async () => {
      entered = true;
      const token = JSON.parse(await readFile(lock, 'utf8'));
      expect(token.token).not.toBe(owner.token);
      throw expected;
    });
    expect(entered).toBe(false);
    holder.send('release');
    await expect(writer).rejects.toBe(expected);
    await expect(readFile(lock)).rejects.toHaveProperty('code', 'ENOENT');
    await expect(withAlertFileLock(ledger, () => true)).resolves.toBe(true);
  });

  it.skipIf(!linux)('times out behind an aged live owner and lets two writers outlive a dead owner', async () => {
    const holder = await hold();
    const original = await readFile(lock, 'utf8');
    await ageOwner();
    await expect(withAlertFileLock(ledger, () => assertNotEntered())).rejects.toThrow('5000ms');
    expect(await readFile(lock, 'utf8')).toBe(original);

    const exit = once(holder, 'exit');
    holder.kill('SIGKILL');
    expect(await exit).toEqual([null, 'SIGKILL']);

    const order: string[] = [];
    const write = (name: string) => withAlertFileLock(ledger, async () => {
      order.push(`enter ${name}`);
      await new Promise(resolve => setTimeout(resolve, 40));
      order.push(`exit ${name}`);
    });
    await Promise.all([write('a'), write('b')]);
    expect([['enter a', 'exit a', 'enter b', 'exit b'], ['enter b', 'exit b', 'enter a', 'exit a']]).toContainEqual(order);
    await expect(readFile(lock)).rejects.toHaveProperty('code', 'ENOENT');
  }, 15_000);

  it.skipIf(!linux).each([true, false])('protects a successor only with the final token comparison (check=%s)', async check => {
    const holder = await hold();
    const pidStatPath = `/proc/${holder.pid}/stat`;
    await ageOwner();
    const preload = `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const read = fs.readFile;
      fs.readFile = async (path, ...args) => {
        if (path === ${JSON.stringify(pidStatPath)}) {
          process.send('checking old owner');
          await new Promise(resolve => process.once('message', resolve));
          process.disconnect();
        }
        return read(path, ...args);
      };
      syncBuiltinESMExports();
    `;
    let command = [reaper, lock];
    if (!check) {
      const source = await readFile(new URL(lockModule), 'utf8');
      const comparison = "if (await readFile(lockPath, 'utf8') === deadToken) await unlink(lockPath);";
      expect(source.split(comparison)).toHaveLength(2);
      const mutant = join(scratch, 'reaper-without-final-check.mjs');
      await writeFile(mutant, source.replace(comparison, 'await unlink(lockPath);'));
      command = ['--input-type=module', '-e',
        `import { reapDeadAlertFileLockUnderGuard } from ${JSON.stringify(pathToFileURL(mutant).href)}; await reapDeadAlertFileLockUnderGuard(process.argv[1]);`, lock];
    }
    const reclaimer = start('/usr/bin/flock', [
      '--nonblock', '--no-fork', `${lock}.reap`, process.execPath,
      '--import', `data:text/javascript,${encodeURIComponent(preload)}`, ...command,
    ]);
    expect((await once(reclaimer, 'message'))[0]).toBe('checking old owner');
    const holderExit = once(holder, 'exit');
    holder.send('release');
    expect(await holderExit).toEqual([0, null]);

    const successor = await hold();
    const token = await readFile(lock, 'utf8');
    expect(JSON.parse(token).pid).toBe(successor.pid);
    const reclaimerExit = once(reclaimer, 'exit');
    reclaimer.send('continue');
    expect(await reclaimerExit).toEqual([0, null]);
    if (check) expect(await readFile(lock, 'utf8')).toBe(token);
    else await expect(readFile(lock)).rejects.toHaveProperty('code', 'ENOENT');

    const successorExit = once(successor, 'exit');
    successor.send('release');
    expect(await successorExit).toEqual([0, null]);
    await expect(readFile(lock)).rejects.toHaveProperty('code', 'ENOENT');
  });
});

function assertNotEntered(): never {
  throw new Error('entered while live owner held the lock');
}
