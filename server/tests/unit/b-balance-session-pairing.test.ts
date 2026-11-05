/**
 * B-BALANCE-SESSION-PAIRING (#618 leg 1, sprint §0a stage 00 order 6) — sizing and the exposure cap read the MONEY HELD.
 * Plan: `Scope Files/B_BALANCE_SESSION_PAIRING_PRE_AUDIT.md` r3 (Langston Step-2 PROCEED 2026-11-05, stamped 549a1cd66).
 *   money held = the anchor value + entry cost of positions OPEN at the anchor event + realized P&L since that event.
 * The anchor value and its time come from ONE event (state.anchor_version -> the ledger row with that version).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const h = vi.hoisted(() => ({
  state: { balance: 820, anchorVersion: 5 } as { balance: number; anchorVersion: number } | null,
  event: { occurredAt: new Date('2026-10-06T15:52:57.373Z'), newBalance: 820, reason: 'measurement_override' } as
    { occurredAt: Date; newBalance: number; reason: string } | null,
  straddle: { entryCost: 0, count: 0, invalidCount: 0 },
  realized: { realizedPnl: -211.49, tradeCount: 529 },
  retention: 365 as unknown,
  straddleAt: [] as Date[],
  realizedSince: [] as Date[],
  readThrows: null as Error | null,
}));

vi.mock('../../services/portfolio-anchor-service.js', () => ({
  getAnchorState: async () => { if (h.readThrows) throw h.readThrows; return h.state; },
  getAnchorEventByVersion: async (_m: string, v: number) => (h.event && h.state && v === h.state.anchorVersion ? h.event : null),
}));
vi.mock('../../storage', () => ({
  storage: {
    getStraddleEntryCostAt: async (_m: string, at: Date) => { h.straddleAt.push(at); return h.straddle; },
    getRealizedPnlSince: async (_m: string, since: Date) => { h.realizedSince.push(since); return h.realized; },
  },
}));
vi.mock('../../db.js', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (h.retention === undefined ? [] : [{ value: h.retention }]) }) }) }) },
}));

import { getMoneyHeld, MoneyHeldUnavailable } from '../../services/guardrail-settings';

const DAY = 86_400_000;
beforeEach(() => {
  h.state = { balance: 820, anchorVersion: 5 };
  h.event = { occurredAt: new Date(Date.now() - 30 * DAY), newBalance: 820, reason: 'measurement_override' };
  h.straddle = { entryCost: 0, count: 0, invalidCount: 0 };
  h.realized = { realizedPnl: -211.49, tradeCount: 529 };
  h.retention = 365;
  h.straddleAt = [];
  h.realizedSince = [];
  h.readThrows = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const refuses = async (re: RegExp) => {
  const err = await getMoneyHeld('paper').then(() => null, (e) => e);
  expect(err).toBeInstanceOf(MoneyHeldUnavailable);
  expect((err as MoneyHeldUnavailable).reason).toMatch(re);
};

describe('OBJ-1 — money held = anchor + entry cost of positions open at the anchor event + realized since it', () => {
  it('today\'s shape (v5, no straddlers): 820.00 - 211.49 = 608.51', async () => {
    expect(await getMoneyHeld('paper')).toBeCloseTo(608.51, 2);
  });
  it('the realized window and the straddle set both start at the ANCHOR EVENT, never an engine session', async () => {
    await getMoneyHeld('paper');
    expect(h.realizedSince).toEqual([h.event!.occurredAt]);
    expect(h.straddleAt).toEqual([h.event!.occurredAt]);
  });
  it('OBJ-2 discriminator — a synthetic anchor/session split: anchor at T0, an engine session started at T1 > T0; the closes between them count (only the anchor basis does that)', async () => {
    const T0 = new Date(Date.now() - 10 * DAY);
    h.event = { occurredAt: T0, newBalance: 820, reason: 'measurement_override' };
    await getMoneyHeld('paper');
    expect(h.realizedSince[0].getTime()).toBe(T0.getTime()); // a session-row basis would have asked from T1
    const src = readFileSync(join(process.cwd(), 'server/services/guardrail-settings.ts'), 'utf-8');
    const body = src.slice(src.indexOf('export async function getMoneyHeld'), src.indexOf('/**', src.indexOf('export async function getMoneyHeld')));
    expect(body).not.toMatch(/getEngineSessionStart/);
  });
  it('a restart changes nothing: the figure has no in-memory term', async () => {
    const a = await getMoneyHeld('paper');
    const b = await getMoneyHeld('paper');
    expect(b).toBe(a);
  });
  it('the v3/v4 shape — the latest event is an auto_divergence after an operator one: it reads from the AUTO event, so the losses the auto value already absorbed are not subtracted again', async () => {
    const v4 = new Date('2026-08-12T04:19:20.541Z');
    h.state = { balance: 824.11, anchorVersion: 4 };
    h.event = { occurredAt: v4, newBalance: 824.11, reason: 'auto_divergence' };
    h.realized = { realizedPnl: 0, tradeCount: 0 };
    h.retention = 3650;
    expect(await getMoneyHeld('paper')).toBeCloseTo(824.11, 2);
    expect(h.realizedSince[0].getTime()).toBe(v4.getTime());
  });
  it('a straddler (open at the event) adds its entry cost once; its P&L comes through realized once (the v4 measurement: 5 positions, $1,615.43)', async () => {
    h.straddle = { entryCost: 1615.43, count: 5, invalidCount: 0 };
    h.realized = { realizedPnl: 187.32, tradeCount: 5 };
    h.state = { balance: 824.11, anchorVersion: 4 };
    h.event = { occurredAt: new Date(Date.now() - DAY), newBalance: 824.11, reason: 'auto_divergence' };
    expect(await getMoneyHeld('paper')).toBeCloseTo(824.11 + 1615.43 + 187.32, 2);
  });
});

describe('OBJ-1 / OBJ-3 — refusals THROW MoneyHeldUnavailable; nothing returns 0', () => {
  it('live mode refuses with its reason (live money held is the exchange balance, Phase 21)', async () => {
    const err = await getMoneyHeld('live').then(() => null, (e) => e);
    expect(err).toBeInstanceOf(MoneyHeldUnavailable);
    expect((err as MoneyHeldUnavailable).reason).toMatch(/Phase 21/);
  });
  it('no state row', async () => { h.state = null; await refuses(/no readable portfolio_state row/); });
  it('no ledger row for the state row\'s version (a broken pair)', async () => { h.event = null; await refuses(/no anchor ledger row/); });
  it('a ledger value that disagrees with the state row (a broken pair)', async () => {
    h.event = { occurredAt: new Date(Date.now() - DAY), newBalance: 821, reason: 'measurement_override' };
    await refuses(/disagrees with portfolio_state.balance/);
  });
  it('anchor age at or past closed_trades hot retention (the sweep would drop realized rows)', async () => {
    h.event = { occurredAt: new Date(Date.now() - 365 * DAY), newBalance: 820, reason: 'measurement_override' };
    await refuses(/hot retention/);
  });
  it('a missing or non-positive retention constant refuses (no fallback)', async () => {
    h.retention = undefined; await refuses(/hot_retention_days unreadable/);
    h.retention = 0; await refuses(/hot_retention_days unreadable/);
  });
  it('a straddler with a non-positive quantity or price refuses (never summed as 0)', async () => {
    h.straddle = { entryCost: 100, count: 2, invalidCount: 1 };
    await refuses(/non-positive quantity or price/);
  });
  it('a non-positive result refuses', async () => {
    h.realized = { realizedPnl: -900, tradeCount: 10 };
    await refuses(/not positive/);
  });
  it('any read that throws is wrapped as a named refusal', async () => {
    h.readThrows = new Error('connection terminated');
    await refuses(/read failed: connection terminated/);
  });
});

// ── source fences (the rules a type cannot carry) ──
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8').replace(/\r\n/g, '\n');

describe('P2 — the money-held callers moved; the kill switch keeps the session-paired figure', () => {
  it('getPortfolioBalanceV2 is CALLED only by the kill switch, the dead CommandRouter (#136) and the three display routes', () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'tests') walk(p); } else if (p.endsWith('.ts')) { const n = (read(p).match(/getPortfolioBalanceV2\(/g) ?? []).length; if (n) hits.push(`${p.replace(/\\/g, '/')}:${n}`); } } };
    walk('server');
    expect(hits.sort()).toEqual([
      'server/routes.ts:3',                       // /api/portfolio/history, /value-history, /stats — display (Kyle 2026-10-19: Dashboard off-limits)
      'server/services/command-router.ts:1',      // dead code (#136)
      'server/services/daily-loss-budget.ts:2',   // the kill switch's denominator (:160) — session-paired by Kyle's decision (#632) — plus its type comment (:53)
      'server/services/guardrail-settings.ts:1',  // its own definition
    ]);
  });
  it('sizing, the exposure cap and the audit row read getMoneyHeld', () => {
    expect(read('server/services/signal-orchestrator.ts')).toContain('portfolioValue = await getMoneyHeld(this.mode);');
    expect(read('server/asset_classes/xstock_spot/active-dispatch.ts')).toContain("moneyHeld = await getMoneyHeld('paper');");
    expect(read('server/services/trade-safety.ts')).toContain('portfolioBalance = await getMoneyHeld(mode);');
    expect(read('server/services/guardrail-settings.ts')).toContain('portfolioValue = await getMoneyHeld(mode);');
    expect(read('server/services/active-execution-engine.ts')).toContain('portfolioValue = await getMoneyHeld(this.mode);');
  });
});

describe('P3 / C-1 — every reader refuses on a refusal; the audit row never turns a refusal into a failed open', () => {
  it('the OPENED audit read has its own catch that records null (not the insert try\'s TRADE_INSERT_ERROR catch)', () => {
    const aee = read('server/services/active-execution-engine.ts');
    const i = aee.indexOf('portfolioValue = await getMoneyHeld(this.mode);');
    const window = aee.slice(i - 200, i + 600);
    expect(window).toMatch(/try \{\s*portfolioValue = await getMoneyHeld\(this\.mode\);\s*\} catch \(e\) \{\s*if \(!\(e instanceof MoneyHeldUnavailable\)\) throw e;/);
    expect(window).toContain('portfolioValue = null;');
    expect(aee).toContain('portfolioValue: portfolioValue === null ? null : portfolioValue.toString(),');
    expect(aee).not.toContain('getPortfolioBalanceV2 cannot throw (its catch returns 0).\n      const portfolioValue');
  });
  it('the dry-run diagnostic does not coerce a refusal to $0 (Number(null) is 0)', () => {
    expect(read('server/services/active-execution-engine.ts')).toContain('portfolioValue: settings.portfolioValue == null ? undefined : Number(settings.portfolioValue),');
  });
  it('the position-size cap REFUSES on a missing money-held value (it used to skip with ok:true)', () => {
    const ts = read('server/services/trade-safety.ts');
    expect(ts).not.toContain('[J7][GUARDRAIL_SKIP]');
    expect(ts).toMatch(/check=MAX_POSITION[\s\S]{0,400}code: 'MONEY_HELD_UNAVAILABLE'/);
  });
  it('the orchestrator\'s unreachable <= 0 test is replaced by the catch, not left', () => {
    const so = read('server/services/signal-orchestrator.ts');
    expect(so).toContain('[B6][SIZING_ERROR] money held unavailable:');
    expect(so).not.toContain('[B6][SIZING_ERROR] Invalid portfolio value:');
  });
});

describe('P4 — the exposure check\'s two silent defaults refuse', () => {
  const ts = read('server/services/trade-safety.ts');
  it('no `|| \'0\'` price default and no one-share notional default remain', () => {
    expect(ts).not.toContain("pos.entryPrice?.toString() || pos.avgPrice?.toString() || '0'");
    expect(ts).not.toContain('trade.preComputedNotional || (trade.entryPrice * 1)');
    // An unsized candidate is checked at the fixed-notional size, the same rule as the position-size cap (B-SIZING-DEC-RESTORE 2c).
    expect(ts).toContain('tradeNotional = bufferedTradeNotional(portfolioBalance, maxTotalExposurePct, maxPositionPercent);');
  });
  it('the manual validate route passes its own estimate as the notional', () => {
    expect(read('server/services/pre-execution-validator.ts')).toContain('preComputedNotional: estimatedNotional,');
  });
});

describe('P5 — getActiveOpenPositions ignores its mode argument; only paper callers may use it', () => {
  it('the function is still a global select (record), and every non-test caller passes \'paper\' or is the paper branch', () => {
    const st = read('server/storage.ts');
    expect(st).toContain('async getActiveOpenPositions(mode: TradingMode): Promise<ActiveOpenPosition[]> {');
    const callers: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'tests') walk(p); } else if (p.endsWith('.ts')) { for (const m of read(p).matchAll(/getActiveOpenPositions\(([^)]*)\)/g)) callers.push(`${p.replace(/\\/g, '/')}:${m[1]}`); } } };
    walk('server');
    const live = callers.filter((c) => /'live'|"live"/.test(c));
    // MEASURED at Step 3: three callers ask for 'live' beside 'paper' and, because the argument is ignored, read the same
    // paper rows twice. Two union symbol sets (harmless); trailing-exit-controller re-writes the same row's tradeMode under a
    // 'live' log line. Nothing here touches paper or VTS behaviour today; it matters at Phase 21 — raised to Langston as an
    // item for #734 (live-mode go-live), not changed in this batch. A NEW live caller fails here until it is classified.
    expect(live.sort()).toEqual([
      "server/exchanges/kraken/kraken-websocket-adapter.ts:'live'",
      "server/index.ts:'live'",
      "server/services/trailing-exit-controller.ts:'live'",
    ]);
  });
});

describe('P11 — the null contract, by VALUE: every non-test file that names `portfolioValue` is classified, by count', () => {
  // Langston r2 BLOCKER: classify by symbol, not by `.portfolioValue`, and follow a money-held value one hop. A new
  // occurrence changes its file's count and fails here until it is classified. Counted as whole-word tokens.
  const CLASSIFIED: Record<string, [number, string]> = {
    'server/asset_classes/xstock_spot/active-dispatch.ts': [1, 'money held -> SizingContext (refused above the literal, P3)'],
    'server/services/guardrail-settings.ts': [9, 'the builder: money held or null (P2); V2 kept for the kill switch'],
    'server/services/signal-orchestrator.ts': [9, 'money held -> SizingContext -> params (one hop: active-position-sizing) and the C5 diagnostic; refused first (P3)'],
    'server/services/active-position-sizing.ts': [17, 'ONE HOP: destructured at :188; unreachable with a refused value (P12)'],
    'server/services/trade-safety.ts': [19, 'settings readers: the position-size cap refuses on null; the dormant LPCP body never runs'],
    'server/services/pre-execution-validator.ts': [7, 'settings reader: throws on == null (:104)'],
    'server/services/active-execution-engine.ts': [9, 'audit row (null-safe) and the dry-run diagnostic (null stays absent)'],
    'server/services/aj19-max-position-diagnostic.ts': [1, 'optional diagnostic field; receives undefined on a refusal'],
    'server/services/daily-loss-budget.ts': [14, 'the kill switch: getPortfolioBalanceV2, session-paired (Kyle, #632) — not money held'],
    'server/services/command-router.ts': [3, 'dead code (#136)'],
    'server/routes.ts': [9, 'display routes and request bodies — other objects (portfolio totals, req.body); Dashboard off-limits'],
    'server/services/vts-runner.ts': [6, 'the VTS virtual balance (getPortfolioValue) — a different object'],
    'server/services/lineage.ts': [3, 'a parameter type; its callers are classified in their own files'],
    'server/services/telemetry-trace.ts': [1, 'an optional type field'],
    'server/services/commitTradeAndUpdatePortfolio.ts': [1, 'portfolio.totalValue — a different object'],
    'server/services/trading-state-sync.ts': [1, 'portfolioOverview.totalValue — a different object'],
    'server/services/trading-engine.ts': [1, 'result.portfolio.totalValue — a different object (legacy live engine)'],
  };
  it('the census matches exactly', () => {
    const found: Record<string, number> = {};
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'tests') walk(p); } else if (p.endsWith('.ts')) { const n = (read(p).match(/\bportfolioValue\b/g) ?? []).length; if (n) found[p.replace(/\\/g, '/')] = n; } } };
    walk('server');
    const expected = Object.fromEntries(Object.entries(CLASSIFIED).map(([f, [n]]) => [f, n]));
    expect(found).toEqual(expected);
  });
});

describe('P12 — the sizer\'s silent zero is unreachable with a refused value (rule 24 outcome 2, a named fence)', () => {
  it('sizeActivePositionForSignal has exactly ONE non-test call site, in the orchestrator', () => {
    const calls: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'tests') walk(p); } else if (p.endsWith('.ts')) { const n = (read(p).match(/sizeActivePositionForSignal\(\{/g) ?? []).length; if (n) calls.push(`${p.replace(/\\/g, '/')}:${n}`); } } };
    walk('server');
    expect(calls).toEqual(['server/services/signal-orchestrator.ts:1']);
  });
  it('each SizingContext producer refuses on MoneyHeldUnavailable BEFORE constructing the context', () => {
    const so = read('server/services/signal-orchestrator.ts');
    expect(so.indexOf('portfolioValue = await getMoneyHeld(this.mode);')).toBeLessThan(so.indexOf('const sizingContext: SizingContext = {'));
    const ad = read('server/asset_classes/xstock_spot/active-dispatch.ts');
    expect(ad.indexOf("moneyHeld = await getMoneyHeld('paper');")).toBeLessThan(ad.indexOf('const sizingContext = {'));
    expect(ad).toContain('[B-BALANCE-SESSION-PAIRING][XSTOCK_DISPATCH_REFUSED]');
  });
});

describe('P1 — the straddle query', () => {
  it('reads positions opened before the event and closed after it or still open, never_filled excluded, by mode', () => {
    const st = read('server/storage.ts');
    const i = st.indexOf('async getStraddleEntryCostAt(');
    const body = st.slice(i, st.indexOf('\n  }\n', i));
    expect(body).toContain('${closedTradesTable.openedAt} < ${at}');
    expect(body).toContain('(${closedTradesTable.closedAt} IS NULL OR ${closedTradesTable.closedAt} > ${at})');
    expect(body).toContain("IS DISTINCT FROM 'never_filled'");
    expect(body).toContain('eq(closedTradesTable.mode, mode)');
    expect(body).toContain('SUM(${closedTradesTable.quantity} * ${closedTradesTable.entryPrice})');
  });
});
