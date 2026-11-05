/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment (4c) (row 2) — the opening settle, the join split, the moonbag basis line.
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4C_PRE_AUDIT.md` r3 (Langston PROCEED 2026-11-05).
 * The member-clock behaviour test lives beside the (4a) in-memory store in `b-xstock-bid-trigger-reland-inc4a.test.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isXstockRailPagingTime, XSTOCK_PAGE_OPEN_SETTLE_MS, isInXstockWeekendClose } from '../../asset_classes/xstock_spot/market-hours';
import { getXstockSession } from '../../asset_classes/xstock_spot/time-of-day';
import { onCrossing, railCounts, _resetVtsRailState, type VtsRailDeps, type RailAlertRow } from '../../services/vts-rail-reporting';

const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

// EDT (UTC-4): 2026-10-29 Thu. EST (UTC-5): 2026-11-03 Tue.
const EDT = (hhmmss: string) => new Date(`2026-10-29T${hhmmss}Z`);
const EST = (hhmmss: string) => new Date(`2026-11-03T${hhmmss}Z`);

describe('P1 — the opening settle (paging time starts 09:45 ET)', () => {
  it('is 15 minutes, a whole number of minutes (the predicate compares whole ET minutes)', () => {
    expect(XSTOCK_PAGE_OPEN_SETTLE_MS).toBe(15 * 60_000);
    expect(XSTOCK_PAGE_OPEN_SETTLE_MS % 60_000).toBe(0);
  });
  it('EDT: 09:44:59 ET is not paging time, 09:45:00 is; 15:59 is, 16:00 is not', () => {
    expect(isXstockRailPagingTime(EDT('13:44:59'))).toBe(false);
    expect(isXstockRailPagingTime(EDT('13:45:00'))).toBe(true);
    expect(isXstockRailPagingTime(EDT('19:59:00'))).toBe(true);
    expect(isXstockRailPagingTime(EDT('20:00:00'))).toBe(false);
  });
  it('EST: the same boundaries one hour later in UTC', () => {
    expect(isXstockRailPagingTime(EST('14:44:59'))).toBe(false);
    expect(isXstockRailPagingTime(EST('14:45:00'))).toBe(true);
    expect(isXstockRailPagingTime(EST('20:59:00'))).toBe(true);
    expect(isXstockRailPagingTime(EST('21:00:00'))).toBe(false);
  });
  it('09:30-09:45 ET is still the REGULAR session (the label is unchanged) but not paging time', () => {
    const t = EST('14:35:00'); // 09:35 ET
    expect(getXstockSession(t)).toBe('regular');
    expect(isXstockRailPagingTime(t)).toBe(false);
  });
  it('never paging time in the weekend close, pre-market, after-hours or overnight', () => {
    const sat = new Date('2026-10-31T15:00:00Z'); // Sat 11:00 ET
    expect(isInXstockWeekendClose(sat)).toBe(true);
    expect(isXstockRailPagingTime(sat)).toBe(false);
    expect(isXstockRailPagingTime(EST('13:00:00'))).toBe(false); // 08:00 ET pre
    expect(isXstockRailPagingTime(EST('22:00:00'))).toBe(false); // 17:00 ET after
    expect(isXstockRailPagingTime(EST('06:00:00'))).toBe(false); // 01:00 ET overnight
  });
  it('agrees with "regular session and at least 15 min past the open" at every minute of a weekday', () => {
    for (let min = 0; min < 24 * 60; min++) {
      const t = new Date(Date.parse('2026-11-04T05:00:00Z') + min * 60_000); // Wed 00:00 ET onward
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(t);
      const h = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
      const m = h * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
      const expected = getXstockSession(t) === 'regular' && m >= 9 * 60 + 45;
      expect(isXstockRailPagingTime(t)).toBe(expected);
    }
  });
});

describe('P1 / P4 — one predicate per meaning, fenced at the call sites (Langston r2 BLOCKER, r3 record item 2)', () => {
  const runner = src('services/vts-runner.ts');
  const rail = src('services/vts-rail-reporting.ts');
  it('the crossing/doorbell gate reads the paging-time predicate', () => {
    expect(runner).toMatch(/const _ntXsOffHours = trade\.assetClass === 'xstock_spot' && !isXstockRailPagingTime\(new Date\(\)\);/);
  });
  it('the member clock reads isRailPagingTime, not the session label', () => {
    expect(rail).toMatch(/const regular = deps\.isRailPagingTime\(nowMs\);/);
    expect(rail).not.toMatch(/const regular = deps\.isRegularSession\(nowMs\);/);
  });
  it('the unpriced-close session label still reads isRegularSession (a 09:35 close is a regular-session close)', () => {
    expect(runner).toMatch(/session: d\.isRegularSession\(now\) \? 'regular' : 'off_session'/);
    expect(rail).toMatch(/isRegularSession: \(nowMs\) => !isInXstockWeekendClose\(new Date\(nowMs\)\) && getXstockSession\(nowMs\) === 'regular',/);
    expect(rail).toMatch(/isRailPagingTime: \(nowMs\) => isXstockRailPagingTime\(new Date\(nowMs\)\),/);
  });
});

describe('P3 — moonbag_timeout prints its basis in its siblings’ shape', () => {
  it('trigger=none, mark=…, and the _xsTag (which carries basis=)', () => {
    const aee = src('services/active-execution-engine.ts');
    expect(aee).toMatch(/type=moonbag_timeout trigger=none mark=\$\{currentPrice\}\$\{_xsTag\}/);
    expect(aee).not.toMatch(/type=moonbag_timeout price=/);
  });
});

describe('P2 — joins split by reason, and the parts sum to the whole', () => {
  beforeEach(() => _resetVtsRailState());
  let verdict: 'quiet' | 'closed' | 'not_quiet' = 'quiet';
  function store(): VtsRailDeps {
    const rows: RailAlertRow[] = [];
    let seq = 0;
    return {
      addAlert: async (a: Record<string, unknown>) => {
        const key = a.dedupe_key as string;
        const ex = rows.find((r) => r.dedupe_key === key && r.state !== 'resolved');
        if (ex) return { ...ex };
        const row: RailAlertRow = { id: `a${++seq}`, dedupe_key: key, state: 'scheduled', created_at: new Date(0).toISOString(), body: '', metadata: { ...((a.metadata as Record<string, unknown>) ?? {}) } };
        rows.push(row);
        return { ...row };
      },
      mergeAlertMetadata: async (id, patch) => { const r = rows.find((x) => x.id === id); if (!r) return null; r.metadata = { ...(r.metadata ?? {}), ...patch }; return { ...r }; },
      resolveAlert: async () => null,
      readAllAlerts: () => rows,
      closedTradeIds: async () => new Set<string>(),
      xstockVerdict: () => verdict,
      isRegularSession: () => true,
      isRailPagingTime: () => true,
    } as VtsRailDeps;
  }
  it('too_wide and too_old (on a quiet OR a closed verdict) each count once; a paging reason counts in none (Langston C-1)', async () => {
    verdict = 'quiet';
    const d = store();
    const now = Date.parse('2026-11-04T16:00:00Z');
    const c = (id: string, reason: string) => ({ tradeId: id, symbol: `${id}/USD`, assetClass: 'xstock_spot', lastReason: reason, pageSinceMs: now - 10 * 60_000, title: 't', body: 'b' });
    expect(await onCrossing(c('w1', 'no_transactable_side (too_wide)'), now, d)).toBe('joined');
    expect(await onCrossing(c('w2', 'no_transactable_side (too_wide)'), now, d)).toBe('joined');
    expect(await onCrossing(c('o1', 'no_transactable_side (too_old)'), now, d)).toBe('joined');
    expect(await onCrossing(c('p1', 'no_usable_mark'), now, d)).toBe('paged');
    verdict = 'closed';
    expect(await onCrossing(c('o2', 'no_transactable_side (too_old)'), now, d)).toBe('joined');
    verdict = 'not_quiet';
    expect(await onCrossing(c('o3', 'no_transactable_side (too_old)'), now, d)).toBe('paged');
    expect(railCounts.joins).toBe(4);
    expect(railCounts.joinsTooWide).toBe(2);
    expect(railCounts.joinsTooOld).toBe(2);
    // Langston C-2: the join predicate admits exactly two reasons, so the catch-all bucket must stay empty.
    expect(railCounts.joinsOther).toBe(0);
    expect(railCounts.joinsTooWide + railCounts.joinsTooOld + railCounts.joinsOther).toBe(railCounts.joins);
  });
  it('the sweep line names all three parts', () => {
    expect(src('services/vts-rail-reporting.ts')).toMatch(/joinsTooWide=\$\{railCounts\.joinsTooWide\} joinsTooOld=\$\{railCounts\.joinsTooOld\} joinsOther=\$\{railCounts\.joinsOther\}/);
  });
});
