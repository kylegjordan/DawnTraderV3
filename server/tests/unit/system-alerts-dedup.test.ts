/**
 * B-NEW-51 — system-alerts dedup tests.
 *
 * Verifies the optional `dedupe_key` on `addAlert`: a non-terminal alert with
 * the same key suppresses a duplicate; a `resolved` same-key alert does NOT;
 * and callers that omit the key keep the original always-append behavior.
 *
 * Uses SYSTEM_ALERTS_FILE env-override (B-NEW-51) to point the library at a
 * throwaway tmp file instead of the staging /var/log path.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const TMP = path.join(os.tmpdir(), `sa-dedup-test-${process.pid}.jsonl`);
process.env.SYSTEM_ALERTS_FILE = TMP;

function clean() {
  for (const f of [TMP, `${TMP}.lock`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

beforeEach(clean);
afterAll(clean);

async function load() {
  // Static import is fine — env is set above before any import resolves.
  return await import('../../services/system-alerts.js');
}

const base = {
  triggers_at: new Date().toISOString(),
  category: 'breakage' as const,
  severity: 'warning' as const,
  title: 'test',
  body: 'test body',
};

describe('B-NEW-51 system-alerts dedup', () => {
  it('suppresses a duplicate when a non-terminal alert with the same dedupe_key exists', async () => {
    const { addAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k1' });
    const b = await addAlert({ ...base, dedupe_key: 'k1' });
    expect(b.id).toBe(a.id);               // returned the existing one
    expect(readAllAlerts()).toHaveLength(1); // only one persisted
  });

  it('allows a new alert once the same-key alert is resolved', async () => {
    const { addAlert, resolveAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k2' });
    await resolveAlert(a.id, 'cc-b', 'NO-EVIDENCE-GIVEN', 'cli');
    const c = await addAlert({ ...base, dedupe_key: 'k2' });
    expect(c.id).not.toBe(a.id);            // fresh alert created
    expect(readAllAlerts()).toHaveLength(2); // resolved + new
  });

  it('still dedups against an ACKNOWLEDGED same-key alert (non-terminal)', async () => {
    const { addAlert, fireDue, ackAlert, readAllAlerts } = await load();
    const a = await addAlert({ ...base, dedupe_key: 'k3' });
    await fireDue();                  // scheduled → active
    await ackAlert(a.id, 'cc-b');     // active → acknowledged (non-terminal)
    const d = await addAlert({ ...base, dedupe_key: 'k3' });
    expect(d.id).toBe(a.id);
    expect(readAllAlerts()).toHaveLength(1);
  });

  it('no dedupe_key → always appends (backward-compatible)', async () => {
    const { addAlert, readAllAlerts } = await load();
    await addAlert({ ...base });
    await addAlert({ ...base });
    expect(readAllAlerts()).toHaveLength(2);
  });

  it('different dedupe_keys do not collide', async () => {
    const { addAlert, readAllAlerts } = await load();
    await addAlert({ ...base, dedupe_key: 'kA' });
    await addAlert({ ...base, dedupe_key: 'kB' });
    expect(readAllAlerts()).toHaveLength(2);
  });
});

describe('#1191 alert store edits', () => {
  it('commits all 450 exact member patches in the same edit and preserves another writer', async () => {
    const { addAlert, editAlertStore, mergeAlertMetadata, readAllAlerts } = await load();
    const row = await addAlert({ ...base, dedupe_key: 'incident' });
    const members = Array.from({ length: 450 }, (_, index) => `member_${index}`);
    const external = mergeAlertMetadata(row.id, { dispatcher: 'retained' });
    await editAlertStore((draft) => {
      expect(draft.rows.find((candidate) => candidate.id === row.id)?.metadata.dispatcher).toBe('retained');
      for (const member of members) draft.mergeMetadata(row.id, { [member]: { tradeId: member } });
      return { value: undefined };
    });
    await external;
    const [stored] = readAllAlerts();
    expect(stored.metadata).toEqual({
      dispatcher: 'retained',
      ...Object.fromEntries(members.map((member) => [member, { tradeId: member }])),
    });
  });

  it('keeps the original bytes after a failed multi-row edit and makes a retry idempotent', async () => {
    const { addAlert, editAlertStore, readAllAlerts } = await load();
    const first = await addAlert({ ...base, dedupe_key: 'first' });
    const before = fs.readFileSync(TMP, 'utf8');

    await expect(editAlertStore((draft) => {
      draft.mergeMetadata(first.id, { member: 'trade-a' });
      draft.add({ ...base, dedupe_key: 'second' });
      throw new Error('abort before publish');
    })).rejects.toThrow('abort before publish');
    expect(fs.readFileSync(TMP, 'utf8')).toBe(before);

    const attempt = () => editAlertStore((draft) => {
      draft.mergeMetadata(first.id, { member: 'trade-a' });
      return { value: draft.add({ ...base, dedupe_key: 'second' }).id };
    });
    const secondId = await attempt();
    expect(await attempt()).toBe(secondId);
    expect(readAllAlerts().map(({ id, metadata }) => ({ id, metadata }))).toEqual([
      { id: first.id, metadata: { member: 'trade-a' } }, { id: secondId, metadata: {} },
    ]);
  });

  it('writes real individual decision marks off the VTS loop and retries a failed batch', async () => {
    const { VtsAlertWriteQueue } = await import('../../services/vts-alert-write-queue.js');
    const { editAlertStore, readAllAlerts, resolveAlert } = await load();
    const rows = await editAlertStore((draft) => ({
      value: Array.from({ length: 451 }, (_, index) => draft.add({ ...base, dedupe_key: `member-${index}` })),
    }));
    const terminal = rows.pop()!;
    await resolveAlert(terminal.id, 'cc-b', 'NO-EVIDENCE-GIVEN', 'cli');
    const before = fs.readFileSync(TMP);
    fs.unlinkSync(TMP);
    fs.mkdirSync(TMP); // Force the first production worker edit to fail before publication.
    const error = vi.spyOn(console, 'error');
    const queue = new VtsAlertWriteQueue();
    try {
      const first = queue.markDecision(rows[0].id, 1000);
      expect(queue.markDecision(rows[0].id, 2000)).toBe(first);
      const pending = [first, ...rows.slice(1).map(({ id }) => queue.markDecision(id, 1000))];
      const resolved = queue.markDecision(terminal.id, 1000);
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[VTS_RAIL][DECISION_BATCH_FAILED]', expect.anything()));
      fs.rmdirSync(TMP);
      fs.writeFileSync(TMP, before);

      expect(await Promise.all(pending)).toEqual(Array(450).fill(true));
      expect(await resolved).toBe(false);
      const stored = readAllAlerts();
      expect(stored.slice(0, 450).map(({ metadata }) => metadata.decidedAtMs)).toEqual(Array(450).fill(1000));
      expect(stored[450].metadata).toEqual({});
    } finally {
      error.mockRestore();
      if (fs.existsSync(TMP) && fs.statSync(TMP).isDirectory()) fs.rmdirSync(TMP);
    }
  }, 8_000);
});
