/**
 * B-GOV-INTEGRITY-1 — unit tests for resolve provenance (OBJ-1), category SSOT
 * (OBJ-4), class-driven delivery (OBJ-3), and the Layer-A/Layer-B evidence seam.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Point the store at a throwaway file BEFORE importing the module.
const tmpFile = path.join(os.tmpdir(), `gi1-alerts-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
process.env.SYSTEM_ALERTS_FILE = tmpFile;

const load = () => import('../../services/system-alerts.js');

afterEach(() => {
  for (const f of [tmpFile, `${tmpFile}.lock`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe('OBJ-1 — resolution_evidence hard gate', () => {
  it('accepts reference tokens and sanctioned sentinels', async () => {
    const { isValidResolutionEvidence } = await load();
    // reference-shaped
    expect(isValidResolutionEvidence('server/foo.ts:42')).toBe(true);
    expect(isValidResolutionEvidence('4b46bec')).toBe(true);              // short sha
    expect(isValidResolutionEvidence('4b46bec570e1a2b3c4d5e6f7089a1b2c3d4e5f60')).toBe(true); // full sha
    expect(isValidResolutionEvidence('550e8400-e29b-41d4-a716-446655440000')).toBe(true); // uuid
    expect(isValidResolutionEvidence('SYSTEM_MANUAL.md §3.2')).toBe(true);
    expect(isValidResolutionEvidence('RUNNING_ISSUES #447')).toBe(true);
    // sentinels
    expect(isValidResolutionEvidence('NO-EVIDENCE-GIVEN')).toBe(true);
    expect(isValidResolutionEvidence('provenance-unknown-pre-F3b')).toBe(true);
  });

  it('REJECTS the texture of an empty close with a word added', async () => {
    const { isValidResolutionEvidence } = await load();
    // 'done at 3:00' is Langston's Step-4 example — a bare time must NOT satisfy
    // the path:line rule (which now requires a '.' or '/').
    for (const bad of ['', '   ', 'looks fine', 'verified', 'done', 'resolved', 'ok', 'done at 3:00', 'fixed by 9:15']) {
      expect(isValidResolutionEvidence(bad)).toBe(false);
    }
  });

  it('resolveAlert throws on invalid evidence and writes nothing', async () => {
    const { addAlert, resolveAlert, readAllAlerts } = await load();
    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
    await expect(resolveAlert(a.id, 'CC-A', 'looks fine', 'cli')).rejects.toThrow(/resolution_evidence rejected/);
    expect(readAllAlerts().find((x) => x.id === a.id)!.state).not.toBe('resolved');
  });

  it('resolveAlert records all four provenance fields on a valid close', async () => {
    const { addAlert, resolveAlert } = await load();
    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
    const r = await resolveAlert(a.id, 'CC-A', 'server/x.ts:10', 'cli');
    expect(r!.state).toBe('resolved');
    expect(r!.resolved_at).not.toBeNull();
    expect(r!.resolved_by_claimed).toBe('CC-A');
    expect(r!.resolved_by_transport).toBe('cli');
    expect(r!.resolution_evidence).toBe('server/x.ts:10');
  });
});

describe('OBJ-4 — category SSOT (cast deleted)', () => {
  it('assertCategoryCreatable accepts the 7 canonical categories', async () => {
    const { assertCategoryCreatable, ALERT_CATEGORIES } = await load();
    for (const c of ALERT_CATEGORIES) expect(assertCategoryCreatable(c)).toBe(c);
    expect(ALERT_CATEGORIES).toContain('governance');
    expect(ALERT_CATEGORIES).toContain('health_check');
    expect(ALERT_CATEGORIES).not.toContain('recurring'); // dropped, 0 writers
  });

  it('addAlert throws on an off-SSOT category (the hole the cast left open)', async () => {
    const { addAlert } = await load();
    await expect(
      addAlert({ triggers_at: new Date(), category: 'reorg_b2_1_window', severity: 'info', title: 't', body: 'b' }),
    ).rejects.toThrow(/not creatable/);
    // a plain typo too
    await expect(
      addAlert({ triggers_at: new Date(), category: 'governnace', severity: 'info', title: 't', body: 'b' }),
    ).rejects.toThrow(/not creatable/);
  });
});

describe('OBJ-3 — class-driven delivery', () => {
  it('warning/critical always deliver; info delivers only for must-never-be-silent categories', async () => {
    const { shouldDeliverToDiscord } = await load();
    // severity path (unchanged)
    expect(shouldDeliverToDiscord({ severity: 'critical', category: 'health_check' })).toBe(true);
    expect(shouldDeliverToDiscord({ severity: 'warning', category: 'one_off' })).toBe(true);
    // the fix: info governance/breakage now deliver
    expect(shouldDeliverToDiscord({ severity: 'info', category: 'governance' })).toBe(true);
    expect(shouldDeliverToDiscord({ severity: 'info', category: 'breakage' })).toBe(true);
    // routine info still skips
    expect(shouldDeliverToDiscord({ severity: 'info', category: 'health_check' })).toBe(false);
    expect(shouldDeliverToDiscord({ severity: 'info', category: 'reminder' })).toBe(false);
  });
});

describe('Layer-A / Layer-B evidence SEAM (regression guard)', () => {
  // NOTE (Langston Step-4): this guards SHAPE, not the coupling. It asserts the
  // Layer-A gate accepts a 40-hex sha + the sentinel — the two things the checker
  // emits TODAY. It does NOT observe poller.mjs, so it stays green if poller
  // changes its --evidence format (a separate .mjs boundary). It is a shape
  // contract, not a live-coupling test.
  it('the governance-checker graded-ref sha SHAPE passes the Layer-A gate', async () => {
    const { isValidResolutionEvidence } = await load();
    // Exactly what scripts/governance-checker/poller.mjs emits as --evidence today:
    expect(isValidResolutionEvidence('4b46bec570e1a2b3c4d5e6f7089a1b2c3d4e5f60')).toBe(true);
    // and its honest fetch-fail fallback:
    expect(isValidResolutionEvidence('NO-EVIDENCE-GIVEN')).toBe(true);
  });
});

describe('OBJ-2 — backfill is honest, idempotent, no-clobber', () => {
  it('backfills only provenance-less resolved rows and never touches others', async () => {
    const svc = await load();
    const { addAlert, resolveAlert, readAllAlerts, __backfillResolveProvenance__ } = svc;

    // A: a pre-F3b-style resolved row with NO provenance (simulate by resolving
    // then stripping the fields, as the historical data has them).
    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 'A', body: 'b' });
    // B: a resolved row that already carries real provenance (must be untouched).
    const b = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 'B', body: 'b' });
    await resolveAlert(b.id, 'CC-A', 'server/real.ts:1', 'cli');

    // Manually author A as a historical resolved row (ack present, no resolved_* fields).
    const all = readAllAlerts();
    const rowA = all.find((x) => x.id === a.id)!;
    rowA.state = 'resolved';
    rowA.acknowledged_at = '2026-06-01T00:00:00.000Z';
    rowA.acknowledged_by = 'kyle';
    rowA.resolved_at = null; rowA.resolved_by_claimed = null;
    rowA.resolved_by_transport = null; rowA.resolution_evidence = null;
    fs.writeFileSync(tmpFile, all.map((x) => JSON.stringify(x)).join('\n') + '\n');

    const first = await __backfillResolveProvenance__({ evidence: 'provenance-unknown-pre-F3b' });
    expect(first.backfilled).toBe(1); // only A

    const after = await load().then((m) => m.readAllAlerts());
    const A2 = after.find((x) => x.id === a.id)!;
    expect(A2.resolution_evidence).toBe('provenance-unknown-pre-F3b');
    expect(A2.resolved_by_claimed).toBe('kyle');            // the only identity we had
    expect(A2.resolved_at).toBe('2026-06-01T00:00:00.000Z'); // reconstructed, not minted
    expect(A2.resolved_by_transport).toBeNull();             // honest unknown

    const B2 = after.find((x) => x.id === b.id)!;
    expect(B2.resolution_evidence).toBe('server/real.ts:1'); // NOT clobbered

    // idempotent: a second run backfills nothing
    const second = await __backfillResolveProvenance__({ evidence: 'provenance-unknown-pre-F3b' });
    expect(second.backfilled).toBe(0);
  });
});
