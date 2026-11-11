import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const LAUNCHER = path.join(ROOT, 'server/scripts/b75-retention-run.sh');
const linuxOnly = process.platform === 'win32' ? describe.skip : describe;
const children: ChildProcess[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(): { dir: string; lock: string; entered: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-flock-'));
  tempDirs.push(dir);
  return { dir, lock: path.join(dir, 'sweep.lock'), entered: path.join(dir, 'entered') };
}

function env(lock: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    B75_SWEEP_LOCK_FILE: lock,
    B75_SWEEP_TEST_EXEC: '/bin/sh',
  };
}

function startHolder(lock: string, entered: string, tag: string): ChildProcess {
  const child = spawn(LAUNCHER, ['-c', `printf '%s\\n' '${tag}' >> '${entered}'; exec sleep 30`], {
    cwd: ROOT,
    env: env(lock),
    stdio: 'pipe',
  });
  children.push(child);
  return child;
}

async function waitForLine(file: string, line: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(/\r?\n/).includes(line)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${line}`);
}

linuxOnly('B-XSTOCK-SNAPSHOT-RETENTION kernel run lock', () => {
  it('keeps a live holder exclusive even when the lock inode is aged past six hours', async () => {
    const f = fixture();
    const holder = startHolder(f.lock, f.entered, 'holder');
    await waitForLine(f.entered, 'holder');
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
    fs.utimesSync(f.lock, old, old);

    const contender = spawnSync(LAUNCHER, ['-c', `printf '%s\\n' contender >> '${f.entered}'`], {
      cwd: ROOT,
      env: env(f.lock),
      encoding: 'utf8',
    });
    expect(contender.status).toBe(0);
    expect(contender.stdout).toContain('another run still holds the kernel lock');
    expect(fs.readFileSync(f.entered, 'utf8').trim().split(/\r?\n/)).toEqual(['holder']);
    holder.kill('SIGKILL');
  });

  it('recovers immediately after a crash and the departed owner cannot release its successor', async () => {
    const f = fixture();
    expect(fs.readFileSync(LAUNCHER, 'utf8')).not.toMatch(/^\s*(?:rm|unlink)\b/m);
    const first = startHolder(f.lock, f.entered, 'first');
    await waitForLine(f.entered, 'first');
    first.kill('SIGKILL');
    await new Promise<void>((resolve) => first.once('exit', () => resolve()));

    const successor = startHolder(f.lock, f.entered, 'successor');
    await waitForLine(f.entered, 'successor');
    expect(fs.existsSync(f.lock)).toBe(true);

    const contender = spawnSync(LAUNCHER, ['-c', `printf '%s\\n' overlap >> '${f.entered}'`], {
      cwd: ROOT,
      env: env(f.lock),
      encoding: 'utf8',
    });
    expect(contender.status).toBe(0);
    expect(contender.stdout).toContain('another run still holds the kernel lock');
    expect(fs.readFileSync(f.entered, 'utf8').trim().split(/\r?\n/)).toEqual(['first', 'successor']);
    successor.kill('SIGKILL');
  });

  it('serialises cron and manual shapes through the same lock inode', async () => {
    const f = fixture();
    const cron = startHolder(f.lock, f.entered, 'cron');
    await waitForLine(f.entered, 'cron');

    const manual = spawnSync(LAUNCHER, ['--snapshot-only', '-c', `printf '%s\\n' manual >> '${f.entered}'`], {
      cwd: ROOT,
      env: env(f.lock),
      encoding: 'utf8',
    });
    expect(manual.status).toBe(0);
    expect(manual.stdout).toContain('another run still holds the kernel lock');
    expect(fs.readFileSync(f.entered, 'utf8').trim()).toBe('cron');
    cron.kill('SIGKILL');
  });
});
