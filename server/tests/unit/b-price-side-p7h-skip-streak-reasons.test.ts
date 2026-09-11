// B-PRICE-SIDE-BY-JOB r5 — P-7h r2 (Langston chunk-2 BLOCKER-2): the engine carries the price-skip streak's REASON
// HISTOGRAM and hands it to the alert copy, so the escalation names the streak rather than the tick that crossed the
// threshold.
//
// POSITIVE CONTROL: against r1 (`cdb953290`) the engine passes only the last tick's reason, so test 1's streak of 39
// `rest_no_data` + 1 `rest_token_exhausted` raises the self-throttled copy and test 1 fails; test 2's source fence finds
// no histogram.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { addAlert } = vi.hoisted(() => ({ addAlert: vi.fn(async (_a: unknown) => undefined) }));
vi.mock('../../services/system-alerts.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addAlert,
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';

afterEach(() => {
  addAlert.mockClear();
  vi.restoreAllMocks();
});

type Rec = (this: unknown, p: { id: string; symbol: string; assetClass?: unknown }, reason: string, detail?: string) => Promise<void>;
const record = (ActiveExecutionEngine.prototype as unknown as { _recordPriceSkip: Rec })._recordPriceSkip;

describe('P-7h r2 — the engine carries the streak\'s reason histogram into the escalation', () => {
  it('1. ★ 39 rest_no_data then 1 rest_token_exhausted raises the ABSENCE copy with its share', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = { _priceSkipStreak: new Map(), _priceSkipReasons: new Map(), mode: 'paper' };
    const pos = { id: 'p7h-r2', symbol: 'BTC/USD', assetClass: 'crypto_spot' };
    // The threshold is DB-knobbed; with the knob cold in a unit test the engine's stated fail-safe default (40) applies.
    for (let i = 0; i < 39; i++) await record.call(engine, pos, 'rest_no_data');
    expect(addAlert).not.toHaveBeenCalled();
    await record.call(engine, pos, 'rest_token_exhausted');

    expect(addAlert).toHaveBeenCalledTimes(1);
    const alert = addAlert.mock.calls[0][0] as { title: string; body: string; dedupe_key: string };
    expect(alert.body).toMatch(/returned a usable price/i);
    expect(alert.body).not.toMatch(/request budget was empty/i);
    expect(alert.title).toContain('39 of 40 ticks');
    expect(engine._priceSkipReasons.get(pos.id)).toEqual(new Map([['rest_no_data', 39], ['rest_token_exhausted', 1]]));
  });

  it('2. the histogram is cleared in exactly one place, beside the streak, on a venue price — never on a reason change', () => {
    const src = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf-8');
    const deletes = src.match(/this\._priceSkipReasons\.delete\(position\.id\)/g) ?? [];
    expect(deletes.length).toBe(1);
    // r3 (Langston condition 5): the fence is symmetric; a second streak-delete site would break the lockstep silently.
    expect((src.match(/this\._priceSkipStreak\.delete\(position\.id\)/g) ?? []).length).toBe(1);
    const at = src.indexOf('this._priceSkipStreak.delete(position.id);');
    expect(src.slice(at, at + 120)).toContain('this._priceSkipReasons.delete(position.id);');
    expect(src).not.toMatch(/_priceSkipReasons\.(clear|set\(position\.id, new Map)/);
  });
});
