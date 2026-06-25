/**
 * ══════════════════════════════════════════════════════════════════════════════
 * reorg-B4.1 — per-cycle pool-membership capture + isolation guards.
 * ══════════════════════════════════════════════════════════════════════════════
 * Pins the load-bearing invariants of the per-cycle membership record:
 *   - sink purity: insertShadowPoolMember writes ONLY rtb_shadow_pool_members
 *     (no learning store) — the reorg-B4 isolation extends to the new sink.
 *   - the null→id return-contract change on registerOpenShadowTrade (dedupe now
 *     returns the existing trade id so the member row can FK it).
 *   - the transactional boundary: captureShadowPool writes a member row ONLY when
 *     a trade id was resolved (no dangling FK), and TOLERATES a member-write
 *     failure (the partial-cycle case Langston asked to cover explicitly).
 *   - pool_size is STAMPED from the ranked-signal count, never COUNT(*) of member
 *     rows (so a tolerated skip doesn't read as a phantom gap).
 * ══════════════════════════════════════════════════════════════════════════════
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const storeSrc = fs.readFileSync(path.join(SRC, 'services/rtb-shadow-store.ts'), 'utf8');
const vtsRunnerSrc = fs.readFileSync(path.join(SRC, 'services/vts-runner.ts'), 'utf8');
const rtbServiceSrc = fs.readFileSync(path.join(SRC, 'core/rtb/ready_to_buy_service.ts'), 'utf8');
const routesSrc = fs.readFileSync(path.join(SRC, 'routes.ts'), 'utf8');

function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.split('\n').map((l) => { const i = l.indexOf('//'); return i === -1 ? l : l.slice(0, i); }).join('\n');
}
function extractFunctionBody(src: string, signaturePrefix: string): string {
  const start = src.indexOf(signaturePrefix);
  if (start === -1) throw new Error(`not found: ${signaturePrefix}`);
  let i = src.indexOf('(', start), parenDepth = 0;
  for (; i < src.length; i++) { if (src[i] === '(') parenDepth++; else if (src[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } } }
  let angle = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '<') angle++; else if (c === '>') { if (angle > 0) angle--; } else if (c === '{' && angle === 0) break; }
  const braceStart = i; let depth = 0;
  for (let j = braceStart; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(braceStart, j + 1); } }
  throw new Error(`unterminated: ${signaturePrefix}`);
}

const FORBIDDEN_SINKS = [
  'outcomeFeedbackStore', 'recordPairTelemetry', 'updateRollingAverages',
  'persistRealPriceTrade', 'archiveExitDecision', 'paper_sim_trades',
];

describe('reorg-B4.1 — insertShadowPoolMember sink purity', () => {
  test('writes ONLY rtb_shadow_pool_members, never a learning store', () => {
    const body = stripComments(extractFunctionBody(storeSrc, 'export async function insertShadowPoolMember('));
    expect(body).toContain('INSERT INTO rtb_shadow_pool_members');
    for (const sink of FORBIDDEN_SINKS) {
      expect(body, `member-write must not reference ${sink}`).not.toContain(sink);
    }
  });
});

describe('reorg-B4.1 — registerOpenShadowTrade null→id dedupe contract', () => {
  const body = extractFunctionBody(vtsRunnerSrc, 'export async function registerOpenShadowTrade(');
  test('dedupe returns the EXISTING trade id (not null)', () => {
    const code = stripComments(body);
    // returns the existing id on dedupe; null is reserved for genuine failure.
    expect(code).toContain('const existingId = shadowOpenBySignal.get(dedupeKey)');
    expect(code).toContain('return existingId');
  });
  test('null is still returned on the cap-reject / persist-fail failure paths', () => {
    const code = stripComments(body);
    expect(code).toContain('return null'); // cap-reject + persist-fail still return null
  });
});

describe('reorg-B4.1 — captureShadowPool transactional boundary + pool_size stamp', () => {
  const body = stripComments(extractFunctionBody(rtbServiceSrc, 'private async captureShadowPool('));
  test('member row is written ONLY when a trade id resolved (no dangling FK)', () => {
    expect(body).toContain('const shadowTradeId = await registerOpenShadowTrade');
    expect(body).toContain('if (shadowTradeId)');
    expect(body).toContain('insertShadowPoolMember');
  });
  test('pool_size is stamped from the ranked-signal count, never COUNT(*)', () => {
    expect(body).toContain('const poolSize = pool.length');
    expect(body).toContain('poolSize,'); // passed onto the member row
  });
  test('a member-write failure is caught + tolerated (partial-cycle case)', () => {
    // The member-write has its own try/catch so one failure does not abort the pool
    // and does not roll back the trade — a cycle can hold FEWER member rows than poolSize.
    expect(body).toContain('member-write failed (tolerated)');
  });
});

describe('reorg-B4.1 — by-cycle endpoint uses the pool_size stamp, renders whatever rows exist', () => {
  // The endpoint is an apiRouter.get(...) arrow callback, not a named function — slice
  // the source region between its registration and the next route registration.
  const _start = routesSrc.indexOf("apiRouter.get('/shadow-trades/by-cycle'");
  const _next = routesSrc.indexOf('apiRouter.get(', _start + 20);
  const body = routesSrc.slice(_start, _next === -1 ? undefined : _next);
  test('the endpoint surfaces pool_size (the SSOT for N candidates), not COUNT(*) of members', () => {
    expect(body).toContain('MAX(pool_size) AS pool_size');
    expect(body).toContain('poolSize: Number(r.pool_size');
    // it must NOT derive the candidate count from a COUNT of member rows
    expect(stripComments(body)).not.toContain('COUNT(*) AS pool_size');
  });
  test('it is read-only — no learning store write', () => {
    const code = stripComments(body);
    for (const sink of FORBIDDEN_SINKS) {
      expect(code, `endpoint must not reference ${sink}`).not.toContain(sink);
    }
  });

  test('the selection-quality summary only scores FULLY-CLOSED cycles (Langston Step-4 F1)', () => {
    // The headline "promoted = best" metric must not score a cycle until the whole
    // field has resolved — gated on bool_and(p.closed). And it must be a SEPARATE
    // aggregate (over all cycles), not the page-scoped JS loop (F2).
    expect(body).toContain('bool_and(p.closed)');
    expect(body).toContain('promoted_was_best');
    // the old page-scoped JS loop is gone (no per-page summary accumulation)
    expect(stripComments(body)).not.toContain('if (bestPromotedPnl >= bestPnl) promotedWasBest++');
  });
});
