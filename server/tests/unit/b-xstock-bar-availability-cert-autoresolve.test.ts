import { beforeEach, describe, expect, it, vi } from 'vitest';

// R4 (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan): the certification-pending alert resolves itself
// only on a MEASURED GLOBAL ZERO of uncertified revisions; a daily warning tally keeps the count and
// is never resolved by the repair.
const state = vi.hoisted(() => ({
  pendingIds: [] as string[],
  globalPending: 0,
  certifyFails: false,
  countQueries: 0,
  addAlert: vi.fn(),
  mergeAlertMetadata: vi.fn(),
  resolveAlertsByDedupeKey: vi.fn(),
}));

function text(q: unknown): string { return JSON.stringify(q); }

vi.mock('../../db.js', () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      execute: async (q: unknown) => {
        const t = text(q);
        if (t.includes('SET LOCAL')) return { rows: [] };
        if (t.includes('count(*)')) { state.countQueries += 1; return { rows: [{ pending: state.globalPending }] }; }
        if (t.includes('SELECT revision_id')) return { rows: state.pendingIds.map((revision_id) => ({ revision_id })) };
        if (t.includes('certify_xstock_bar_revision_events')) {
          if (state.certifyFails) throw new Error('canceling statement due to statement timeout');
          return { rows: state.pendingIds.map((revision_id, i) => ({
            revision_id, visible_by: new Date().toISOString(), visible_seq: i + 1, certificate_primary_identity: 'p',
          })) };
        }
        return { rows: [] };
      },
    }),
  },
}));
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: state.addAlert,
  mergeAlertMetadata: state.mergeAlertMetadata,
  resolveAlertsByDedupeKey: state.resolveAlertsByDedupeKey,
}));

async function load() {
  vi.resetModules();
  return import('../../services/passive-archive/xstock-bar-availability.js');
}

beforeEach(() => {
  state.pendingIds = [];
  state.globalPending = 0;
  state.certifyFails = false;
  state.countQueries = 0;
  state.addAlert.mockReset();
  state.addAlert.mockImplementation(async (opts: any) => ({ id: 'row-1', created_at: new Date().toISOString(), metadata: opts.metadata ?? {} }));
  state.mergeAlertMetadata.mockReset();
  state.resolveAlertsByDedupeKey.mockReset();
  state.resolveAlertsByDedupeKey.mockResolvedValue(['row-1']);
});

describe('R4 certification auto-resolve', () => {
  it('resolves on a measured global zero, as the machine actor, with a run uuid in the evidence', async () => {
    const m = await load();
    state.pendingIds = ['a', 'b'];
    state.globalPending = 0;
    await m.repairPendingXstockCertificates();
    expect(state.resolveAlertsByDedupeKey).toHaveBeenCalledTimes(1);
    const [key, actor, evidence, transport] = state.resolveAlertsByDedupeKey.mock.calls[0];
    expect(key).toBe(m.XSTOCK_CERTIFICATION_PENDING_KEY);
    expect(actor).toBe(m.XSTOCK_BAR_REPAIR_ACTOR);
    expect(evidence).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(evidence).toContain('visible_by IS NULL = 0');
    expect(transport).toBe('engine');
  });

  it('does not resolve while ANY revision is still uncertified, even if this batch certified', async () => {
    const m = await load();
    state.pendingIds = ['a'];
    state.globalPending = 3; // more pending beyond this repair's batch
    await m.repairPendingXstockCertificates();
    expect(state.resolveAlertsByDedupeKey).not.toHaveBeenCalled();
  });

  it('stops counting once clear, and checks again after a new failure is raised', async () => {
    const m = await load();
    await m.repairPendingXstockCertificates(); // first tick after boot: checks once, finds 0
    expect(state.countQueries).toBe(1);
    await m.repairPendingXstockCertificates(); // nothing open: no count query
    expect(state.countQueries).toBe(1);
    state.pendingIds = ['a'];
    state.certifyFails = true;
    await m.repairPendingXstockCertificates(); // fails, raises the alert, re-arms the check
    state.certifyFails = false;
    await m.repairPendingXstockCertificates();
    expect(state.countQueries).toBe(2);
  });

  it('a certification failure also writes the daily warning tally, and a later failure that day increments it', async () => {
    const m = await load();
    state.pendingIds = ['a'];
    state.certifyFails = true;
    await m.repairPendingXstockCertificates();
    const dayCall = state.addAlert.mock.calls.find((c) => String(c[0].dedupe_key).startsWith('xstock-bar-availability-certification-failures-day:'));
    expect(dayCall).toBeDefined();
    expect(dayCall![0].severity).toBe('warning');
    expect(dayCall![0].dedupe_key).toBe(m.xstockCertificationFailureDayKey());
    expect(state.mergeAlertMetadata).not.toHaveBeenCalled();

    // Second failure: addAlert now returns the EXISTING row (created earlier).
    state.addAlert.mockImplementation(async () => ({
      id: 'day-row', created_at: new Date(Date.now() - 60_000).toISOString(), metadata: { failures: 1 },
    }));
    await m.repairPendingXstockCertificates();
    expect(state.mergeAlertMetadata).toHaveBeenCalledWith('day-row', expect.objectContaining({ failures: 2 }));
    // The daily key is never resolved by the repair.
    expect(state.resolveAlertsByDedupeKey.mock.calls.some((c) => String(c[0]).includes('failures-day'))).toBe(false);
  });
});
