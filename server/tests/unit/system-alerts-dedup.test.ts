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
import type { VtsRefusalEvent } from '../../core/trading/vts-refusal-evidence.js';
import { vtsRefusalReceiptField } from '../../core/trading/vts-refusal-evidence.js';

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
      expect(queue.markDecision(rows[0].id, 2000)).toBeUndefined();
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

  it('keeps first refusal, the actual crossing and an exact hold through the worker and later alert writes', async () => {
    const { VtsAlertWriteQueue } = await import('../../services/vts-alert-write-queue.js');
    const { addAlert, fireDue, ackAlert, resolveAlert, readAllAlerts, readVtsRefusalEvidence } = await load();
    const id = { tradeId: 'trade-one', streakId: 'streak-one' };
    const first = {
      ...id, kind: 'first', symbol: 'NVO/USD', assetClass: 'xstock_spot',
      firstAtMs: 1_000, firstReason: 'no_usable_mark', thresholdMs: 600_000,
    } satisfies VtsRefusalEvent;
    const paging = { ...id, kind: 'paging', pageSinceMs: 5_000 } satisfies VtsRefusalEvent;
    const crossing = {
      ...id, kind: 'crossing', pageSinceMs: 5_000, observedAtMs: 605_000,
      reason: 'no_transactable_side (too_old)', feedCoverage: {
        key: 'kraken-equities/ticker/common-session', generation: 3,
        startMs: 10, endMs: 120_010, cutMs: 120_015, subscribed: 20, qualified: 18,
      },
    } satisfies VtsRefusalEvent;
    const queue = new VtsAlertWriteQueue();
    expect(await Promise.all([queue.recordRefusal(first), queue.recordRefusal(paging)])).toEqual([true, true]);
    const row = await addAlert(base);
    const before = fs.readFileSync(TMP);

    fs.unlinkSync(TMP);
    fs.mkdirSync(TMP);
    const error = vi.spyOn(console, 'error');
    try {
      const crossingWrite = queue.recordRefusal(crossing);
      const holdWrite = queue.recordRefusal({ ...id, kind: 'decided', atMs: 605_001 });
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[VTS_RAIL][DECISION_BATCH_FAILED]', expect.anything()));
      fs.rmdirSync(TMP);
      fs.writeFileSync(TMP, before);
      expect(readVtsRefusalEvidence()).toMatchObject([{ ...id, decidedAtMs: null, crossings: [] }]);
      expect(await Promise.all([crossingWrite, holdWrite])).toEqual([true, true]);

      expect((await fireDue()).map(({ id }) => id)).toEqual([row.id]);
      await ackAlert(row.id, 'cc-b');
      await resolveAlert(row.id, 'cc-b', 'NO-EVIDENCE-GIVEN', 'cli');
      expect(readAllAlerts().map(({ id, state }) => ({ id, state }))).toEqual([{ id: row.id, state: 'resolved' }]);
      const { kind: _, tradeId: _trade, streakId: _streak, ...crossingFields } = crossing;
      expect(readVtsRefusalEvidence()).toMatchObject([{
        ...id, firstAtMs: 1_000, firstReason: 'no_usable_mark', thresholdMs: 600_000,
        pagingStarts: [5_000], crossings: [crossingFields], decidedAtMs: 605_001,
      }]);

      // The old reader's shape gate keeps the inert envelope during a whole-store rewrite.
      const oldRows = fs.readFileSync(TMP, 'utf8').trim().split('\n').map(line => JSON.parse(line))
        .filter(candidate => candidate.id && candidate.state && candidate.triggers_at);
      expect(oldRows).toHaveLength(2);
      expect(oldRows.every(candidate => candidate.state === 'resolved')).toBe(true);
      fs.writeFileSync(TMP, oldRows.map(candidate => JSON.stringify(candidate)).join('\n') + '\n');
      expect(readVtsRefusalEvidence()).toMatchObject([{ ...id, crossings: [crossingFields] }]);
    } finally {
      error.mockRestore();
      if (fs.existsSync(TMP) && fs.statSync(TMP).isDirectory()) fs.rmdirSync(TMP);
    }
  }, 8_000);

  it('keeps two streaks on the same trade distinct and credits a crossing only at its confirmed paging boundary', async () => {
    const { editAlertStore, readVtsRefusalEvidence } = await load();
    const id = { tradeId: 'trade-one', streakId: 'first-streak' };
    const write = (event: VtsRefusalEvent) => editAlertStore((draft) => ({ value: draft.recordVtsRefusal(event) }));
    const first = {
      ...id, kind: 'first', symbol: 'NVO/USD', assetClass: 'xstock_spot',
      firstAtMs: 1_000, firstReason: 'no_usable_mark', thresholdMs: 600_000,
    } satisfies VtsRefusalEvent;
    const crossing = {
      ...id, kind: 'crossing', pageSinceMs: 2_000, observedAtMs: 602_000,
      reason: 'no_usable_mark', feedCoverage: null,
    } satisfies VtsRefusalEvent;

    expect(await write(first)).toBe(true);
    expect(await write(crossing)).toBe(false);
    expect(await write({ ...id, kind: 'paging', pageSinceMs: 2_000 })).toBe(true);
    expect(await write({ ...crossing, observedAtMs: 601_999 })).toBe(false);
    expect(await write({ ...crossing, tradeId: 'other-trade' })).toBe(false);
    expect(await write(crossing)).toBe(true);
    const saved = fs.readFileSync(TMP, 'utf8');
    expect(await write({ ...crossing, observedAtMs: 603_000 })).toBe(false);
    expect(fs.readFileSync(TMP, 'utf8')).toBe(saved);

    expect(await write({ ...first, streakId: 'second-streak', firstAtMs: 610_000 })).toBe(true);
    expect(await write({ ...id, streakId: 'second-streak', kind: 'decided', atMs: 610_001 })).toBe(true);
    expect(readVtsRefusalEvidence()).toMatchObject([
      { ...id, crossings: [{ observedAtMs: 602_000 }], decidedAtMs: null },
      { ...id, streakId: 'second-streak', crossings: [], decidedAtMs: 610_001 },
    ]);
  });
});

describe('#1191 restart reconciliation', () => {
  const firstAtMs = 1_000;
  const pageSinceMs = 2_000;
  const observedAtMs = 602_000;
  const restartAtMs = 2_000_000;

  function events(tradeId: string, streakId = tradeId, runId = 'before-restart'): VtsRefusalEvent[] {
    const identity = { tradeId, streakId };
    return [
      { ...identity, kind: 'first', runId, symbol: 'NVO/USD', assetClass: 'xstock_spot',
        firstAtMs, firstReason: 'no_usable_mark', thresholdMs: 600_000 },
      { ...identity, kind: 'paging', pageSinceMs },
      { ...identity, kind: 'crossing', pageSinceMs, observedAtMs,
        reason: 'no_transactable_side (too_old)', feedCoverage: null },
    ];
  }

  it('retries only proved, still-owed old crossings and keeps their original evidence after a restart', async () => {
    const { VtsAlertWriteQueue } = await import('../../services/vts-alert-write-queue.js');
    const { editAlertStore, readAllAlerts, readVtsRefusalEvidence, resolveAlert } = await load();
    const firstProcess = new VtsAlertWriteQueue();
    const earlier = [
      ...events('owed'), ...events('closed'), ...events('held'), ...events('joined'), ...events('individual'),
      ...events('unproved').slice(0, 2), ...events('current', 'current', 'new-run'),
      ...events('owed', 'later-streak', 'new-run').slice(0, 2),
      { kind: 'decided', tradeId: 'held', streakId: 'held', atMs: observedAtMs + 1 },
      { kind: 'decided', tradeId: 'owed', streakId: 'later-streak', atMs: observedAtMs + 1 },
    ] satisfies VtsRefusalEvent[];
    expect(await Promise.all(earlier.map(event => firstProcess.recordRefusal(event)))).toEqual(earlier.map(() => true));

    const joinedMarker = vtsRefusalReceiptField('joined', pageSinceMs);
    const individualMarker = vtsRefusalReceiptField('individual', pageSinceMs);
    const unrelatedMarker = vtsRefusalReceiptField('owed', pageSinceMs);
    const published = await editAlertStore(draft => ({
      value: [
        // A standing record can have lost the live member already. The exact join receipt is retained.
        draft.add({ ...base, dedupe_key: 'vts-quiet-xstock_spot', metadata: { [joinedMarker]: 'joined', member_joined: null } }),
        draft.add({ ...base, dedupe_key: 'no-trigger-vts-NVO/USD-individual', metadata: { tradeId: 'individual', [individualMarker]: 'individual' } }),
        draft.add({ ...base, dedupe_key: 'no-trigger-vts-NVO/USD-other', metadata: { tradeId: 'other', [unrelatedMarker]: 'other' } }),
      ],
    }));
    await resolveAlert(published[1].id, 'cc-b', 'NO-EVIDENCE-GIVEN', 'cli');

    const afterRestart = new VtsAlertWriteQueue();
    const closeLookup = vi.fn(async (_ids: string[]) => new Set(['closed']));
    expect(await afterRestart.reconcileRefusals(restartAtMs, 'new-run', closeLookup)).toBe(true);
    expect(closeLookup).toHaveBeenCalledExactlyOnceWith(['owed', 'closed', 'joined', 'individual', 'unproved']);
    const alerts = readAllAlerts();
    const recovered = alerts.filter(row => row.metadata.decisionAtRecovery === 'unknown');
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      state: 'scheduled',
      metadata: { tradeId: 'owed', originalRefusal: { streakId: 'owed', firstAtMs, pageSinceMs, observedAtMs } },
    });
    const evidence = new Map(readVtsRefusalEvidence().map(item => [item.streakId, item]));
    expect(evidence.get('owed')).toMatchObject({
      firstAtMs, decidedAtMs: null,
      crossings: [{ pageSinceMs, observedAtMs, disposition: { alertId: recovered[0].id, route: 'individual' } }],
    });
    expect(evidence.get('closed')).toMatchObject({ closed: true, firstAtMs, crossings: [{ observedAtMs }] });
    expect(evidence.get('held')).toMatchObject({ decidedAtMs: observedAtMs + 1, crossings: [{ observedAtMs }] });
    expect(evidence.get('joined')?.crossings[0].disposition).toEqual({ alertId: published[0].id, route: 'joined' });
    expect(evidence.get('individual')?.crossings[0].disposition).toEqual({ alertId: published[1].id, route: 'individual' });
    expect(evidence.get('unproved')).toMatchObject({ firstAtMs, pagingStarts: [pageSinceMs], crossings: [], decidedAtMs: null });
    expect(evidence.get('current')?.crossings[0].disposition).toBeUndefined();
    expect(evidence.get('later-streak')?.decidedAtMs).toBe(observedAtMs + 1);

    const persisted = fs.readFileSync(TMP, 'utf8');
    expect(await new VtsAlertWriteQueue().reconcileRefusals(restartAtMs + 60_000, 'new-run', closeLookup)).toBe(true);
    expect(fs.readFileSync(TMP, 'utf8')).toBe(persisted);
  }, 8_000);

  it('rechecks after the unlocked lookup and preserves owed warnings while the database read fails', async () => {
    const { VtsAlertWriteQueue } = await import('../../services/vts-alert-write-queue.js');
    const { editAlertStore, readAllAlerts, readVtsRefusalEvidence } = await load();
    const earlier = events('ordered');
    await editAlertStore(draft => ({ value: earlier.map(event => draft.recordVtsRefusal(event)) }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = new VtsAlertWriteQueue();
    try {
      const before = fs.readFileSync(TMP, 'utf8');
      expect(await worker.reconcileRefusals(restartAtMs, 'new-run', async () => { throw new Error('database unavailable'); })).toBe(false);
      expect(error).toHaveBeenCalledWith('[VTS_RAIL][RECOVERY_CLOSE_LOOKUP_FAILED]', expect.any(Error));
      expect(fs.readFileSync(TMP, 'utf8')).toBe(before);

      expect(await worker.reconcileRefusals(restartAtMs + 1, 'new-run', async () => {
        await editAlertStore(draft => ({
          value: draft.recordVtsRefusal({ kind: 'decided', tradeId: 'ordered', streakId: 'ordered', atMs: observedAtMs + 1 }),
        }));
        return new Set();
      })).toBe(true);
      expect(readAllAlerts()).toEqual([]);
      expect(readVtsRefusalEvidence()).toMatchObject([{ tradeId: 'ordered', decidedAtMs: observedAtMs + 1 }]);
    } finally {
      error.mockRestore();
    }
  }, 8_000);
});
