/**
 * Row `8c` (switch-on) — the WIRING, proved at the source (the orchestrator and engine need their whole graph to run):
 * where the birth re-base sits, that every refusal returns, which knobs the walk reads, the maker arm's resting price, the
 * stamps that must survive re-sizing, and the P7 funnel file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFunnelSnapshotLine, LEVEL_BASIS_FUNNEL_FILE, LEVEL_BASIS_FUNNEL_INTERVAL_MS } from '../../services/level-basis-funnel-writer.js';
import { makerEntryOf } from '../../core/trading/crypto-birth-levels.js';

const ROOT = join(__dirname, '..', '..', '..');
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const O = src('server/services/signal-orchestrator.ts');
const E = src('server/services/active-execution-engine.ts');
const uniq = (s: string, x: string) => { const i = s.indexOf(x); expect(i, x).toBeGreaterThan(-1); expect(s.lastIndexOf(x), `unique: ${x}`).toBe(i); return i; };

describe('8c — the birth re-base seam', () => {
  const seam = uniq(O, "if (sizingContext.assetClass === 'crypto_spot') {\n      const _cbSigSym = rawSignal.symbol;");
  const body = O.slice(seam, O.indexOf('// ══ F-G-1 (OBJ-7 / OBJ-7b / P1-P3) — VENUE PRICE GRID', seam));
  it('sits AFTER the funnel denominator and BEFORE the venue grid (round the sided triple, then gate)', () => {
    expect(seam).toBeGreaterThan(uniq(O, 'if (_fClass) recordActiveSignalsGenerated(sizingContext.mode, _fClass, 1);'));
    expect(seam).toBeLessThan(uniq(O, '// ══ F-G-1 (OBJ-7 / OBJ-7b / P1-P3) — VENUE PRICE GRID'));
    expect(body.length).toBeGreaterThan(500); // instrument control: the slice is the block, not empty
  });
  it('condition 1: an unreadable knob and every re-base refusal RETURN (no mid fallback path past the block)', () => {
    expect(body).toContain("try { _cbKnobs = readCryptoLevelBuildKnobs(); } catch { return _cbRefuse('knobs_unreadable'); }");
    expect(body).toContain('if (!_cb.ok) return _cbRefuse(_cb.reason);');
    expect(body).toContain("quote: _cbSel.ok\n");
    expect(body).toContain(': null,'); // a refused walk hands the re-base NO quote — it refuses `no_transactable_basis`
  });
  it('the triple that leaves the block is the re-based one, stamped', () => {
    expect(body).toContain('entryPrice: _cb.entryPrice,\n        stopPrice: _cb.stopPrice,\n        targetPrice: _cb.targetPrice,');
    expect(body).toContain('metadata: { ...(rawSignal.metadata ?? {}), ..._cb.stamp },');
  });
  it('the walk reads the DB-governed level-build knobs and records its OWN stage', () => {
    expect(body).toContain('{ maxAgeMs: _cbKnobs.maxAgeMs, maxSpreadFraction: _cbKnobs.maxSpreadFraction }');
    expect(body).toContain("stage: 'active_level_build'");
    expect(O).not.toMatch(/LEVEL_BASIS_OBSERVATION_MAX_(AGE_MS|SPREAD_FRACTION)/);
  });
  it('the refusal is counted as a pre-SQE drop with a level_ prefix', () => {
    expect(body).toContain("recordActivePreSqeReject(sizingContext.mode, 'crypto_spot', reason.startsWith('level_') ? reason : `level_${reason}`, strategyId);");
    expect(O).not.toContain('level_level_');
  });
});

describe('8c — the birth maker/taker decision flips WITH the levels (P4, S1)', () => {
  it('reads the geometry from the one reader and the maker entry from the build record', () => {
    expect(O).toContain('const _mtGeometry = levelGeometryOf(rawSignal.metadata);');
    expect(O).toContain('levelGeometry: _mtGeometry,');
    expect(O).toContain("entryPriceMaker: _mtGeometry === 'sided' && _mtMakerEntry !== null ? _mtMakerEntry : rawSignal.entryPrice,");
    expect(O).not.toMatch(/const _mtDecision = decideMakerTaker\(\{[\s\S]{0,400}levelGeometry: 'mid' as const/);
  });
});

describe('8c — the engine rests a maker at the maker role price', () => {
  it('the resting limit is the recorded bid on a sided triple, the shared entry otherwise', () => {
    expect(E).toContain('const _b72cLimit = makerEntryOf(signal.metadata) ?? signal.entryPrice;');
  });
  it('makerEntryOf: the bid only on a sided triple with a usable record', () => {
    expect(makerEntryOf({ levelGeometry: 'sided', levelBasisAtBirth: { bid: 99.9, ask: 100.1 } })).toBe(99.9);
    expect(makerEntryOf({ levelBasisAtBirth: { bid: 99.9, ask: 100.1 } })).toBeNull();
    expect(makerEntryOf({ levelGeometry: 'sided' })).toBeNull();
    expect(makerEntryOf({ levelGeometry: 'sided', levelBasisAtBirth: { bid: 100.2, ask: 100.1 } })).toBeNull(); // crossed
  });
});

describe('8c — the stamps survive re-sizing (ruling item 4 class)', () => {
  it('pattern-pool signals are stamped at their builder and the pass carries it', () => {
    const P = src('server/services/pattern-recognizer.ts');
    expect(P).toContain("levelSpec: { stop: { form: 'distance' }, target: { form: 'distance' } } satisfies LevelSpec,");
    expect(P).toMatch(/const stopDistance = atr \* 1\.5;\n  const targetDistance = atr \* 2\.5;/); // the legs ARE entry ± k·ATR
    expect(O).toContain('levelSpec: tradeSignal.metadata.levelSpec,');
  });
  it('a HYBRID carries the quant signal\'s level stamps into its fresh metadata', () => {
    expect(O).toContain('...pickLevelStamps(hybrid.metadata),');
    expect(O).toContain("for (const k of ['levelSpec', 'levelGeometry', 'levelBasisAtBirth'] as const)");
  });
});

describe('8c P7 — the funnel file', () => {
  it('every line carries the lifetime anchor and the rows', () => {
    const line = buildFunnelSnapshotLine(Date.parse('2026-11-08T00:15:00Z'), {
      startedAtMs: Date.parse('2026-11-07T19:06:00Z'), pid: 4242, pmUptimeMs: Date.parse('2026-11-07T19:05:58Z'),
      pmRestartCount: 571, buildSha: 'abc',
    });
    expect(line.endsWith('\n')).toBe(true);
    const j = JSON.parse(line);
    expect(j.kind).toBe('level_basis_funnel_snapshot');
    expect(j.snapshotAt).toBe('2026-11-08T00:15:00.000Z');
    expect(j.lifetime).toEqual({
      processStartedAt: '2026-11-07T19:06:00.000Z', pid: 4242, pmUptime: '2026-11-07T19:05:58.000Z', pmRestartCount: 571, buildSha: 'abc',
    });
    expect(Array.isArray(j.rows)).toBe(true);
  });
  it('the ruled path and cadence, started once at boot', () => {
    expect(LEVEL_BASIS_FUNNEL_FILE).toBe('/var/log/dawntrader/level-basis-funnel.jsonl');
    expect(LEVEL_BASIS_FUNNEL_INTERVAL_MS).toBe(900_000);
    const I = src('server/index.ts');
    expect(I.match(/startLevelBasisFunnelWriter\(\);/g) ?? []).toHaveLength(1);
  });
});
