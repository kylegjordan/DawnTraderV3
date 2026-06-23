/**
 * B-ALERT-PROTOCOL (#340) — stale-alert re-surface tests.
 *
 * Verifies the no-silent-drop closure guarantee (computeResurfaceStale, pure)
 * and markResurfaced bookkeeping, against Langston's Step-1 build-locked spec:
 *  - two-tier TTL: un-acked `active` re-surfaces at the SHORT fuse, `acknowledged`
 *    gets a LONGER leash;
 *  - ack does NOT reset the staleness clock (measured from fired_at) — only
 *    resolve stops re-surfacing;
 *  - the back-off WIDENS each re-surface (1× → 2× → 4× TTL); 2nd+ escalates to Kyle;
 *  - info never pushes; scheduled/resolved never re-surface.
 *
 * computeResurfaceStale is pure (alerts + nowMs in) so most cases need no file IO;
 * markResurfaced uses the SYSTEM_ALERTS_FILE env-override to a throwaway tmp file.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const TMP = path.join(os.tmpdir(), `sa-resurface-test-${process.pid}.jsonl`);
process.env.SYSTEM_ALERTS_FILE = TMP;

function clean() {
  for (const f of [TMP, `${TMP}.lock`]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
beforeEach(clean);
afterAll(clean);

async function load() {
  return await import('../../services/system-alerts.js');
}

const H = 3_600_000;
const NOW = Date.parse('2026-06-23T12:00:00Z');

// Build a SystemAlert-shaped object; `firedHrsAgo` sets fired_at relative to NOW.
function mkAlert(o: any = {}): any {
  return {
    schema_version: 1,
    id: o.id ?? 'a1',
    created_at: new Date(NOW - 100 * H).toISOString(),
    triggers_at: new Date(NOW - 50 * H).toISOString(),
    fired_at: o.fired_at ?? new Date(NOW - (o.firedHrsAgo ?? 0) * H).toISOString(),
    acknowledged_at: o.acknowledged_at ?? null,
    acknowledged_by: o.acknowledged_by ?? null,
    state: o.state ?? 'active',
    category: o.category ?? 'breakage',
    severity: o.severity ?? 'warning',
    title: 't',
    body: 'b',
    metadata: o.metadata ?? {},
    recurrence_interval_seconds: null,
    dedupe_key: null,
  };
}

describe('B-ALERT-PROTOCOL computeResurfaceStale', () => {
  it('un-acked active re-surfaces at the SHORT TTL (warning 6h), 1st re-surface does not escalate', async () => {
    const { computeResurfaceStale } = await load();
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 5 })], NOW)).toHaveLength(0);
    const out = computeResurfaceStale([mkAlert({ firedHrsAgo: 6 })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].resurfaceCount).toBe(1);
    expect(out[0].escalateToKyle).toBe(false);
  });

  it('acknowledged gets a LONGER leash (warning 12h) than an active alert of the same age', async () => {
    const { computeResurfaceStale } = await load();
    const ack8 = mkAlert({ firedHrsAgo: 8, state: 'acknowledged', acknowledged_at: new Date(NOW - 1 * H).toISOString(), acknowledged_by: 'CC-A' });
    expect(computeResurfaceStale([ack8], NOW)).toHaveLength(0);     // owned → 12h leash, not yet
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 8 })], NOW)).toHaveLength(1); // un-acked → 6h fuse, fires
  });

  it('ack does NOT reset the staleness clock — measured from fired_at, not acknowledged_at', async () => {
    const { computeResurfaceStale } = await load();
    // fired 13h ago, acked just 1h ago. acknowledged TTL = 12h; clock from fired (13h) >= 12h → re-surfaces.
    // (If ack reset the clock to 1h ago, 1h < 12h and it would NOT — so this proves no-reset.)
    const a = mkAlert({ firedHrsAgo: 13, state: 'acknowledged', acknowledged_at: new Date(NOW - 1 * H).toISOString(), acknowledged_by: 'CC-A' });
    expect(computeResurfaceStale([a], NOW)).toHaveLength(1);
  });

  it('widening back-off: 2nd gap is 2× TTL; the 2nd re-surface escalates to Kyle', async () => {
    const { computeResurfaceStale } = await load();
    // count=1, last re-surface 6h ago, warning active TTL 6h → gap = 6h×2 = 12h → not yet at 6h
    const at6 = mkAlert({ firedHrsAgo: 20, metadata: { resurface_count: 1, last_resurfaced_at: new Date(NOW - 6 * H).toISOString() } });
    expect(computeResurfaceStale([at6], NOW)).toHaveLength(0);
    // last 12h ago → 12h >= 12h → re-surfaces; count→2; escalates
    const at12 = mkAlert({ firedHrsAgo: 30, metadata: { resurface_count: 1, last_resurfaced_at: new Date(NOW - 12 * H).toISOString() } });
    const out = computeResurfaceStale([at12], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].resurfaceCount).toBe(2);
    expect(out[0].escalateToKyle).toBe(true);
  });

  it('critical has a shorter fuse than warning (2h active)', async () => {
    const { computeResurfaceStale } = await load();
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 2, severity: 'critical' })], NOW)).toHaveLength(1);
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 1, severity: 'critical' })], NOW)).toHaveLength(0);
  });

  it('info never re-surfaces; scheduled + resolved never re-surface', async () => {
    const { computeResurfaceStale } = await load();
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 100, severity: 'info' })], NOW)).toHaveLength(0);
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 100, state: 'resolved' })], NOW)).toHaveLength(0);
    expect(computeResurfaceStale([mkAlert({ firedHrsAgo: 100, state: 'scheduled' })], NOW)).toHaveLength(0);
  });
});

describe('B-ALERT-PROTOCOL processResurface (delivery-gated back-off — the Step-4 blocker fix)', () => {
  // Stand up a stale alert: active warning, fired 7h ago (> the 6h active TTL).
  async function staleAlert(mod: any) {
    const a = await mod.addAlert({ triggers_at: new Date(NOW - 7 * H).toISOString(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
    await mod.fireDue(NOW - 7 * H); // promote → active, fired_at ~7h ago
    return a;
  }

  it('does NOT advance the back-off when delivery FAILS (an undelivered re-surface must not consume the window)', async () => {
    const mod = await load();
    await staleAlert(mod);
    const r = await mod.processResurface(NOW, async () => false); // every sink failed/unconfigured
    expect(r).toHaveLength(1);
    expect(r[0].delivered).toBe(false);
    expect(mod.readAllAlerts()[0].metadata.resurface_count ?? 0).toBe(0); // back-off NOT advanced
  });

  it('advances the back-off exactly once when delivery SUCCEEDS', async () => {
    const mod = await load();
    await staleAlert(mod);
    const r = await mod.processResurface(NOW, async () => true); // a channel delivered
    expect(r[0].delivered).toBe(true);
    expect(mod.readAllAlerts()[0].metadata.resurface_count).toBe(1); // advanced once
  });

  it('re-reads fresh per alert and SKIPS one resolved DURING the pass (the race guard — no bogus post/escalation)', async () => {
    const mod = await load();
    // two stale alerts (both active, fired 7h ago). a1 is older → processed first.
    const a1 = await mod.addAlert({ triggers_at: new Date(NOW - 7 * H).toISOString(), category: 'breakage', severity: 'warning', title: 't1', body: 'b' });
    const a2 = await mod.addAlert({ triggers_at: new Date(NOW - 7 * H).toISOString(), category: 'breakage', severity: 'warning', title: 't2', body: 'b' });
    await mod.fireDue(NOW - 7 * H);
    const delivered: string[] = [];
    const r = await mod.processResurface(NOW, async (alert: any) => {
      delivered.push(alert.id);
      // simulate a CC resolving the OTHER alert while the first one is being delivered
      if (delivered.length === 1) await mod.resolveAlert(a2.id, 'CC-A');
      return true;
    });
    expect(delivered).toEqual([a1.id]);                      // a2 never delivered (re-read caught the resolve)
    expect(r.find((x: any) => x.id === a2.id)?.skipped).toBe('resolved');
    expect(r.find((x: any) => x.id === a2.id)?.delivered).toBe(false);
  });
});

describe('B-ALERT-PROTOCOL markResurfaced', () => {
  it('bumps resurface_count + stamps last_resurfaced_at; is a no-op once the alert is resolved', async () => {
    const { addAlert, fireDue, markResurfaced, resolveAlert } = await load();
    const a = await addAlert({ triggers_at: new Date(NOW - 10 * H).toISOString(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
    await fireDue(NOW); // scheduled → active
    const m1 = await markResurfaced(a.id, NOW);
    expect(m1?.metadata.resurface_count).toBe(1);
    expect(typeof m1?.metadata.last_resurfaced_at).toBe('string');
    const m2 = await markResurfaced(a.id, NOW);
    expect(m2?.metadata.resurface_count).toBe(2);
    await resolveAlert(a.id, 'CC-A');
    expect(await markResurfaced(a.id, NOW)).toBeNull(); // resolved → not re-stamped
  });
});
