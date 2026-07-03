/**
 * ══════════════════════════════════════════════════════════════════════════════
 * reorg-B4 — Shadow-trade telemetry layer ISOLATION + exit-math drift guards.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The shadow layer opens a counterfactual simulated trade for EVERY RTB-pool
 * member each promotion cycle (selection-quality telemetry), and MUST NOT
 * perturb the live trading path or the VTS learning path. The guarantees are
 * by-construction (separate Map + allowlist close + isolated sink). These tests
 * pin that construction so a future edit can't silently break the isolation:
 *
 *   OBJ-3a — active path byte-identical: the shadow apparatus never reaches
 *            executePromotedSignal / closed_trades.
 *   OBJ-3b — VTS-learning byte-identical (closed-side): shadowClose is an
 *            ALLOWLIST — it touches ONLY the isolated rtb_shadow_pairings sink
 *            (+ the shadow's own backing row + its TEC state), never a learning
 *            store (outcomeFeedbackStore / telemetry / persistRealPriceTrade /
 *            exit-archive / updateRollingAverages).
 *   OBJ-3b — open-side: shadows land in openShadowTrades, never openVirtualTrades.
 *   Drift guard — the shadow resolver reuses the SAME exit-math service
 *            (evaluateTECExit) as the real resolver; only maxHoldMs differs.
 *   Math parity — the shadow PnL/R-multiple formula equals the real cascade's.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeShadowOutcomeMath, shadowDedupeKey } from '../../services/vts-runner.js';

const SRC_DIR = path.resolve(__dirname, '../..');
const vtsRunnerSrc = fs.readFileSync(path.join(SRC_DIR, 'services/vts-runner.ts'), 'utf8');
const shadowStoreSrc = fs.readFileSync(path.join(SRC_DIR, 'services/rtb-shadow-store.ts'), 'utf8');
const rtbServiceSrc = fs.readFileSync(path.join(SRC_DIR, 'core/rtb/ready_to_buy_service.ts'), 'utf8');

/** Strip block + line comments so grep-guards assert CODE, not prose. */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/**
 * Extract a function body by brace-matching. Starts AFTER the parameter list and
 * skips the return-type (which may itself contain `{ ... }` inside `Promise<...>`)
 * by ignoring braces while angle-bracket depth > 0.
 */
function extractFunctionBody(src: string, signaturePrefix: string): string {
  const start = src.indexOf(signaturePrefix);
  if (start === -1) throw new Error(`function not found: ${signaturePrefix}`);
  // Walk past the parameter list.
  let i = src.indexOf('(', start);
  let parenDepth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parenDepth++;
    else if (src[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
  }
  // Find the body `{` at angle-depth 0 (skips the return-type's Promise<{...}>).
  let angle = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '<') angle++;
    else if (c === '>') { if (angle > 0) angle--; }
    else if (c === '{' && angle === 0) break;
  }
  const braceStart = i;
  let depth = 0;
  for (let j = braceStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); }
  }
  throw new Error(`unterminated function body: ${signaturePrefix}`);
}

// The learning sinks a shadow close must NEVER touch (the by-construction targets
// Langston enumerated at Step-2: the two updateEma/telemetry vectors + the two
// extra leak sites + the real persist + the exit-archive + the active store).
const FORBIDDEN_SINKS = [
  'outcomeFeedbackStore',
  'recordPairTelemetry',
  'updateRollingAverages',
  'persistRealPriceTrade',
  'archiveExitDecision',
  'closed_trades',
  'phase10SessionTrades',
];

describe('reorg-B4 shadow isolation — closed-side allowlist (OBJ-3b)', () => {
  const shadowCloseBody = extractFunctionBody(vtsRunnerSrc, 'async function shadowClose(');
  const shadowCloseCode = stripComments(shadowCloseBody);

  test('shadowClose touches NONE of the learning sinks', () => {
    for (const sink of FORBIDDEN_SINKS) {
      expect(shadowCloseCode, `shadowClose must not reference ${sink}`).not.toContain(sink);
    }
  });

  test('shadowClose writes ONLY the allowlisted targets', () => {
    expect(shadowCloseBody).toContain('updateShadowPairingOutcome'); // the isolated sink
    expect(shadowCloseBody).toContain('markOpenTradeClosed');        // the shadow's own backing row
    expect(shadowCloseBody).toContain('clearTrailingState');         // exit-mechanics cleanup
    expect(shadowCloseBody).toContain('openShadowTrades.delete');    // map removal
  });
});

describe('reorg-B4 shadow isolation — sink purity (rtb-shadow-store)', () => {
  test('the store writer touches ONLY rtb_shadow_pairings', () => {
    expect(shadowStoreSrc).toContain('rtb_shadow_pairings');
    const code = stripComments(shadowStoreSrc); // the header doc-comment NAMES the avoided sinks; assert on CODE
    for (const sink of FORBIDDEN_SINKS) {
      expect(code, `store must not reference ${sink}`).not.toContain(sink);
    }
  });
});

describe('reorg-B4 shadow isolation — open-side separation (OBJ-3b)', () => {
  const registerBody = extractFunctionBody(vtsRunnerSrc, 'export async function registerOpenShadowTrade(');

  test('registerOpenShadowTrade adds to openShadowTrades, never openVirtualTrades', () => {
    expect(registerBody).toContain('openShadowTrades.set');
    expect(stripComments(registerBody)).not.toContain('openVirtualTrades.set');
  });

  test('a persisted shadow carries the shadow:true discriminator for the rehydration split', () => {
    expect(registerBody).toContain('shadow: true');
    // The boot rehydration routes shadow rows away from the live Map.
    expect(vtsRunnerSrc).toContain('.shadow === true');
  });
});

describe('reorg-B4 persisted-table readers exclude shadow rows (OBJ-3b, Langston Step-4 load-bearing)', () => {
  // Shadow trades are real rows in the SHARED vts_open_trades table. Every
  // non-shadow-path reader must filter them via the single shared predicate, or
  // the learning/telemetry population silently absorbs the full RTB-pool shadow set.
  const factorReplaySrc = fs.readFileSync(path.join(SRC_DIR, 'services/factor-replay-core.ts'), 'utf8');
  const persistenceSrc = fs.readFileSync(path.join(SRC_DIR, 'services/vts-trade-persistence.ts'), 'utf8');
  const routesSrc = fs.readFileSync(path.join(SRC_DIR, 'routes.ts'), 'utf8');

  test('the canonical exclusion predicate exists as a single shared SQL fragment', () => {
    expect(persistenceSrc).toContain("export const VTS_OPEN_TRADES_EXCLUDE_SHADOW");
    expect(persistenceSrc).toContain("(context->>'shadow') IS DISTINCT FROM 'true'");
  });

  test('loadClosedVtsTradesFromDb (factor replay / ablation feed) excludes shadows', () => {
    expect(factorReplaySrc).toContain('VTS_OPEN_TRADES_EXCLUDE_SHADOW');
  });

  test('the xStock 24h telemetry count excludes shadows', () => {
    expect(routesSrc).toContain('VTS_OPEN_TRADES_EXCLUDE_SHADOW');
  });

  test('the bootstrap boot-gate count excludes shadows', () => {
    expect(persistenceSrc).toContain("WHERE closed = false AND ${VTS_OPEN_TRADES_EXCLUDE_SHADOW}");
  });
});

describe('reorg-B4 active path byte-identical (OBJ-3a)', () => {
  test('the shadow apparatus never reaches the real execution / store', () => {
    const registerBody = stripComments(extractFunctionBody(vtsRunnerSrc, 'export async function registerOpenShadowTrade('));
    const resolveBody = stripComments(extractFunctionBody(vtsRunnerSrc, 'async function resolveOpenShadowTrades('));
    const shadowCloseBody = stripComments(extractFunctionBody(vtsRunnerSrc, 'async function shadowClose('));
    for (const body of [registerBody, resolveBody, shadowCloseBody]) {
      expect(body).not.toContain('executePromotedSignal');
      expect(body).not.toContain('closed_trades');
    }
  });
});

describe('reorg-B4 exit-math same-service drift guard', () => {
  const resolveBody = extractFunctionBody(vtsRunnerSrc, 'async function resolveOpenShadowTrades(');

  test('the shadow resolver calls the SAME exit-math service evaluateTECExit', () => {
    expect(resolveBody).toContain('evaluateTECExit({');
  });

  test('only the maxHoldMs PARAM differs (SHADOW_MAX_HOLD_MS), not the math', () => {
    expect(resolveBody).toContain('maxHoldMs: SHADOW_MAX_HOLD_MS');
    // it must NOT re-implement stop/target comparison locally — it delegates.
    expect(resolveBody).not.toContain('exitReason = currentPrice <=');
  });
});

describe('reorg-B4 shadow capture hook (full-pool, ranker-selected flag)', () => {
  test('captureShadowPool iterates the full pool and flags promoted = rank < limit', () => {
    const body = extractFunctionBody(rtbServiceSrc, 'private async captureShadowPool(');
    // reorg-B4.1 refactored the literal to a hoisted const (`const promoted = i < limit`)
    // so it can be reused on both the trade-open and the per-cycle member-row write.
    expect(body).toContain('const promoted = i < limit');
    expect(body).toContain('promotionRank: i');
    expect(body).toContain('registerOpenShadowTrade');
  });

  test('the hook fires AFTER the sort, capturing validSignals before the slice', () => {
    // captureShadowPool receives the full validSignals; the return still slices.
    expect(rtbServiceSrc).toContain('this.captureShadowPool(mode, validSignals, limit, assetClass)');
    expect(rtbServiceSrc).toContain('return validSignals.slice(0, limit);');
  });
});

describe('reorg-B4 dedupe-key byte-identical across open / rehydration / close (Langston Step-4 (b))', () => {
  test('same inputs → same key (the open key == the rehydration re-seed key)', () => {
    const openKey = shadowDedupeKey('paper', 'sig-123', 'BTC/USD', 'breakout');
    const rehydrateKey = shadowDedupeKey('paper', 'sig-123', 'BTC/USD', 'breakout');
    expect(openKey).toBe(rehydrateKey);
    expect(openKey).toBe('paper:sig-123');
  });

  test('the symbol:strategy fallback fires ONLY when signalId is absent — identically', () => {
    expect(shadowDedupeKey('live', null, 'ETH/USD', 'vwap_pullback')).toBe('live:ETH/USD:vwap_pullback');
    expect(shadowDedupeKey('live', undefined, 'ETH/USD', 'vwap_pullback')).toBe('live:ETH/USD:vwap_pullback');
  });

  test('a missing mode defaults to paper consistently (so a null round-trip cannot split the key)', () => {
    expect(shadowDedupeKey(undefined, 'sig-9', 'X', 'y')).toBe('paper:sig-9');
    expect(shadowDedupeKey(null, 'sig-9', 'X', 'y')).toBe('paper:sig-9');
  });
});

describe('reorg-B4 shadow outcome math parity with the real cascade', () => {
  test('grossPnl = (exit - entry)/entry; netPnl subtracts friction', () => {
    const r = computeShadowOutcomeMath({
      entryPrice: 100, exitPrice: 110, stopLoss: 95, frictionCost: 0.018, openedAt: 1000, now: 4600,
    });
    expect(r.grossPnl).toBeCloseTo(0.10, 10);
    expect(r.netPnl).toBeCloseTo(0.082, 10);
    expect(r.holdingMs).toBe(3600);
  });

  test('rMultiple = (exit - entry)/|entry - stop|', () => {
    const r = computeShadowOutcomeMath({
      entryPrice: 100, exitPrice: 110, stopLoss: 95, openedAt: 0, now: 0,
    });
    // reward 10 / risk 5 = +2R
    expect(r.rMultiple).toBeCloseTo(2.0, 10);
  });

  test('a losing shadow is negative; rMultiple null when stop == entry (no risk leg)', () => {
    const loss = computeShadowOutcomeMath({ entryPrice: 100, exitPrice: 95, stopLoss: 95, openedAt: 0, now: 0 });
    expect(loss.grossPnl).toBeCloseTo(-0.05, 10);
    expect(loss.rMultiple).toBeCloseTo(-1.0, 10);
    const degenerate = computeShadowOutcomeMath({ entryPrice: 100, exitPrice: 105, stopLoss: 100, openedAt: 0, now: 0 });
    expect(degenerate.rMultiple).toBeNull();
  });
});
