/**
 * P19-B4a C3 — pure predicates + fail-closed config (no SUT mocks).
 *
 * Verifies the liquid-fill-window + weekend predicates with an injected clock
 * (June dates → EDT, UTC-4: 13:30 UTC = 09:30 ET) and the rule-15 fail-CLOSED
 * contract of the fill-safety config resolver.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isXstockLiquidFillWindowET,
  isInXstockWeekendClose,
} from '../../asset_classes/xstock_spot/market-hours.js';

// Only the config resolver's DB dep is mocked; predicates stay real.
let mockRows: Record<string, unknown> = {};
vi.mock('../../services/module-constants-service.js', () => ({
  getModuleConstants: async () => mockRows,
}));
import {
  resolveXstockFillSafetyConfig,
  _testClearFillSafetyCache,
} from '../../asset_classes/xstock_spot/fill-safety-config.js';

const OPEN = 570; // 09:30 ET
const CLOSE = 960; // 16:00 ET

describe('P19-B4a C3 — liquid-fill-window predicate (RTH 09:30–16:00 ET; fill-quality gate, not market hours)', () => {
  it('inside RTH → true (Wed 14:30 UTC = 10:30 ET)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-17T14:30:00Z'))).toBe(true);
  });
  it('pre-market → false (Wed 12:00 UTC = 08:00 ET)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-17T12:00:00Z'))).toBe(false);
  });
  it('after-hours → false (Wed 21:00 UTC = 17:00 ET)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-17T21:00:00Z'))).toBe(false);
  });
  it('exactly open → true inclusive (09:30 ET = 13:30 UTC)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-17T13:30:00Z'))).toBe(true);
  });
  it('exactly close → false exclusive (16:00 ET = 20:00 UTC)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-17T20:00:00Z'))).toBe(false);
  });
  it('weekend → false even when the clock is inside the window (Sat 14:30 UTC)', () => {
    expect(isXstockLiquidFillWindowET(OPEN, CLOSE, new Date('2026-06-20T14:30:00Z'))).toBe(false);
  });
});

describe('P19-B4a C3 — weekend-close predicate (24/5 feed-live boundary the watchdog gates on)', () => {
  it('Sat → closed', () => {
    expect(isInXstockWeekendClose(new Date('2026-06-20T14:00:00Z'))).toBe(true);
  });
  it('Wed RTH → open', () => {
    expect(isInXstockWeekendClose(new Date('2026-06-17T14:00:00Z'))).toBe(false);
  });
  it('Wed overnight (02:00 ET) → open — feed is live 24/5, NOT just RTH', () => {
    expect(isInXstockWeekendClose(new Date('2026-06-17T06:00:00Z'))).toBe(false);
  });
});

describe('P19-B4a C3 — fill-safety config (fail-CLOSED, rule-15: no silent default)', () => {
  beforeEach(() => { _testClearFillSafetyCache(); });

  it('complete row set → config object', async () => {
    mockRows = {
      active_fill_max_age_ms: 15000,
      liquid_fill_window_open_min_et: 570,
      liquid_fill_window_close_min_et: 960,
      stall_reconnect_ms_rth: 75000,
      stall_reconnect_ms_offrth: 750000,
    };
    const c = await resolveXstockFillSafetyConfig();
    expect(c).not.toBeNull();
    expect(c!.activeFillMaxAgeMs).toBe(15000);
    expect(c!.liquidFillWindowOpenMinEt).toBe(570);
    expect(c!.liquidFillWindowCloseMinEt).toBe(960);
    expect(c!.stallReconnectMsRth).toBe(75000);
    expect(c!.stallReconnectMsOffrth).toBe(750000);
  });

  it('one key missing → null (fail-closed)', async () => {
    _testClearFillSafetyCache();
    mockRows = { active_fill_max_age_ms: 15000 };
    expect(await resolveXstockFillSafetyConfig()).toBeNull();
  });

  it('empty config → null (fail-closed)', async () => {
    _testClearFillSafetyCache();
    mockRows = {};
    expect(await resolveXstockFillSafetyConfig()).toBeNull();
  });

  it('non-numeric value → null (fail-closed)', async () => {
    _testClearFillSafetyCache();
    mockRows = {
      active_fill_max_age_ms: 'oops',
      liquid_fill_window_open_min_et: 570,
      liquid_fill_window_close_min_et: 960,
      stall_reconnect_ms_rth: 75000,
      stall_reconnect_ms_offrth: 750000,
    };
    expect(await resolveXstockFillSafetyConfig()).toBeNull();
  });
});
