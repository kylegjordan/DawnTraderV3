/**
 * B-ENTRY-GATE (`#1224`) increment B, P7 — the priced-pass record and the promotion price-age gate (pre-audit P7, r12 Q-4).
 * The refresh is the record's ONLY writer (a re-issue keeps the priced history); promotion needs a priced pass within
 * the class's limit; crypto is seeded from the refresh cadence, xStock is not seeded yet (off, and says so).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const rtb = strip(readFileSync('server/core/rtb/ready_to_buy_service.ts', 'utf-8'));
const storage = strip(readFileSync('server/storage.ts', 'utf-8'));
const mig = readFileSync('drizzle/migrations/2026-11-05-b-entry-gate-inc-b.sql', 'utf-8');

describe('P7 — the record', () => {
  it('the queue upsert never writes either column (a re-issue keeps the priced history)', () => {
    const i = storage.indexOf('async upsertRtbSignal(');
    const body = storage.slice(i, storage.indexOf('async ', i + 30));
    expect(body).not.toMatch(/lastPricedAt|consecutiveUnpricedPasses/);
  });
  it('the refresh writes it on every reconfirm: priced => stamp + reset, unpriced => +1', () => {
    expect(rtb).toMatch(/_rpPriced\?\.ok\s*\?\s*\{ lastPricedAt: now, consecutiveUnpricedPasses: 0 \}\s*:\s*\{ consecutiveUnpricedPasses: \(Number\(\(signal as any\)\.consecutiveUnpricedPasses\) \|\| 0\) \+ 1 \}/);
  });
});

describe('P7 — the promotion gate', () => {
  const p = rtb.indexOf('async promoteSignal(');
  const claim = rtb.indexOf('const removed = await storage.deleteRtbSignals({ mode, id: signal.id });', p);
  const seg = rtb.slice(p, claim);
  it('reads the per-class limit with the optional reader BEFORE the claim; a stale or never-priced plan is not opened', () => {
    expect(seg).toMatch(/getCachedConstant\('entry_gate', 'promotion_price_max_age_ms'/);
    expect(seg).toMatch(/return 'unpriced';/);
    expect(seg).toMatch(/Number\.isFinite\(_p7AgeMs\) && _p7AgeMs <= _p7Lim/); // never-priced (NaN) refuses
  });
  it('a bad row refuses loudly and an absent row is OFF with a once-per-class log — never a default', () => {
    expect(seg).toMatch(/!\(Number\.isFinite\(_p7Lim\) && _p7Lim > 0\)[\s\S]{0,300}return 'plan_age_unresolved';/);
    expect(seg).toMatch(/PRICE_AGE_GATE_OFF/);
  });
});

describe('P7 — the migration', () => {
  it('adds both columns and seeds crypto ONLY (xStock waits for its week and a named prediction)', () => {
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS last_priced_at timestamptz/);
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS consecutive_unpriced_passes integer NOT NULL DEFAULT 0/);
    expect(mig).toMatch(/'promotion_price_max_age_ms', '300000'::jsonb, 'crypto_spot'/);
    expect(mig).not.toMatch(/'promotion_price_max_age_ms'[^\n]*'xstock_spot'/);
  });
  it('is registered in the manifest and has a rollback file', () => {
    expect(readFileSync('drizzle/migrations/MANIFEST.txt', 'utf-8')).toMatch(/^2026-11-05-b-entry-gate-inc-b\.sql\r?$/m);
    expect(readFileSync('drizzle/migrations/2026-11-05-b-entry-gate-inc-b-rollback.sql', 'utf-8')).toMatch(/DROP COLUMN IF EXISTS last_priced_at/);
  });
});

describe('P7 — the per-symbol hourly record the xStock seed is read from', () => {
  it('every priced/unpriced refresh outcome is tallied per (class, symbol) and emitted once per UTC hour', () => {
    expect(rtb).toMatch(/this\._tallyPricedHour\(sqeAssetClass, normalizedSymbol, _rpAsk\.ok\);/);
    expect(rtb).toMatch(/\[B-ENTRY-GATE\]\[P7\]\[PRICED_SHARE_HOUR\] hour=/);
    expect(rtb).toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 13\)/);
  });
});
