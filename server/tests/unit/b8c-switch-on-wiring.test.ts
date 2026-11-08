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
import { computeNetGeometry, composeSidedFriction, computeTotalRoundTripCost } from '../../core/math/cost-model.js';

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
    expect(makerEntryOf({ levelGeometry: 'sided', levelBasisAtBirth: { bid: 99.9, ask: 100.1, capturedAtMs: 0, ageMs: 0, producer: 'x' } })).toBe(99.9);
    expect(makerEntryOf({ levelBasisAtBirth: { bid: 99.9, ask: 100.1, capturedAtMs: 0, ageMs: 0, producer: 'x' } })).toBeNull();
    expect(makerEntryOf({ levelGeometry: 'sided' })).toBeNull();
    expect(makerEntryOf({ levelGeometry: 'sided', levelBasisAtBirth: { bid: 100.2, ask: 100.1, capturedAtMs: 0, ageMs: 0, producer: 'x' } })).toBeNull(); // crossed
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

describe('8c P4 (amendment 5) — the spread is counted once at every site that judges a crypto triple', () => {
  it('computeNetGeometry: sided charges neither the entry half-spread nor the round-trip spread; geometry is REQUIRED', async () => {
    const c = { fee: 0.004, slippage: 0.0005, spread: 0.002 };
    const mid = computeNetGeometry(100, 98, 104, c, 'mid');
    const sided = computeNetGeometry(100, 98, 104, c, 'sided');
    expect(mid.executionEntry).toBeCloseTo(100 * (1 + 0.0005 + 0.001), 12);
    expect(sided.executionEntry).toBeCloseTo(100 * (1 + 0.0005), 12);
    // C-2: the sided arm charges each cost ONCE — entry slippage in the walk, both fees + the exit slippage after.
    expect(sided.netExpectedEdge).toBeCloseTo((104 - sided.executionEntry) / sided.executionEntry - (2 * 0.004 + 0.0005), 12);
    expect(sided.netExpectedEdge).not.toBeCloseTo((104 - sided.executionEntry) / sided.executionEntry - composeSidedFriction(0.004, 0.0005), 9);
    expect(mid.netExpectedEdge).toBeCloseTo((104 - mid.executionEntry) / mid.executionEntry - computeTotalRoundTripCost(0.004, 0.0005, 0.002), 12);
    expect(() => computeNetGeometry(100, 98, 104, c, undefined as never)).toThrow(/levelGeometry/);
  });
  it('fill economics: a sided triple is not charged the spread on top of its fill', async () => {
    const { computeFillEconomics } = await import('../../core/trading/fill-economics.js');
    const haircut = { adverseSelectionBase: 0.0, adverseSelectionStrengthMult: 0.0, pFillByUrgency: { patient: 0.9, neutral: 0.8, urgent: 0.7 }, nonFillCostPct: 0 } as any;
    const base = {
      arm: 'taker' as const, fillPrice: 100, stopPrice: 96, targetPrice: 108,
      costs: { fee: 0.004, slippage: 0.0005, spread: 0.002 } as any, feeRateMaker: 0.002, feeRateTaker: 0.004,
      DI: 20, sourcePool: undefined, dbsScore: undefined, minPWin: 0.40, maxPWin: 0.60, diPWinFactor: 200,
      signalStrength: 0.3, urgencyClass: 'neutral' as const, haircut, measuredBasePWin: 0.317,
    };
    const mid = computeFillEconomics({ ...base, levelGeometry: 'mid' });
    const sided = computeFillEconomics({ ...base, levelGeometry: 'sided' });
    // The taker at its walked ASK fill already paid the entry half; mid-priced exits owed the exit half (C-1). Sided exits
    // carry that half in the levels, so the difference is exactly HALF a spread per unit — no more.
    expect(sided.netEvAtFill - mid.netEvAtFill).toBeCloseTo(0.5 * 0.002 * 100, 9);
    // and the maker arm (its limit is the price it pays) loses the decision's spread term the same way
    const mM = computeFillEconomics({ ...base, arm: 'maker', levelGeometry: 'mid' });
    const mS = computeFillEconomics({ ...base, arm: 'maker', levelGeometry: 'sided' });
    expect(Number.isFinite(mS.netEvAtFill) && Number.isFinite(mM.netEvAtFill)).toBe(true);
  });
  it('every site reads the geometry through the one reader (S2-S7)', () => {
    const R = src('server/core/rtb/ready_to_buy_service.ts');
    const X = src('server/core/calculations/expectancy.ts');
    const F = src('server/core/trading/fill-economics.ts');
    expect(O).toContain('levelGeometryOf(rawSignal.metadata), // row `8c` P4 (S2)');
    expect(O).toMatch(/const frictionPct = levelGeometryOf\(signal\.metadata\) === 'sided'\n\s+\? composeSidedFriction/); // S3
    expect(R).toContain('computeNetGeometry(entryPrice, stopPrice, targetPrice, costMetrics, levelGeometryOf(signal.metadata));'); // S4
    expect(R).toContain('levelGeometry: _mtGeom,'); // S4 re-decision
    expect(R).not.toMatch(/levelGeometry: 'mid' as const/);
    expect(R).toContain('levelGeometry: levelGeometryOf(meta), // row `8c` P4 (S5)');
    expect(E).toContain('levelGeometry: levelGeometryOf(signal.metadata), // row `8c` P4 (S6)');
    expect(E).toContain('levelGeometry: levelGeometryOf(signal.metadata), // row `8c` P4 (S7)');
    expect(F).toContain('levelGeometry: i.levelGeometry,');
    expect(F).not.toMatch(/levelGeometry: 'mid',/);
    expect(F).toContain("? composeAskEntrySidedExitFriction(i.costs.fee, i.costs.slippage)");
    expect(X).toMatch(/const frictionPct = tradeMeta\.levelGeometry === 'sided'/);
  });
});

describe('8c amendment 5 (iv)+(v) — the stamp survives every hop, and its absence at the open is a refusal', () => {
  it('orchestrator → RTB: the allow-listed RTB metadata carries the level stamps', () => {
    const at = uniq(O, '...pickLevelStamps(rawSignal.metadata),');
    expect(at).toBeGreaterThan(uniq(O, 'gridAtBirth: rawSignal.metadata?.gridAtBirth,'));
    expect(at).toBeLessThan(uniq(O, 'readyToBuyService.queueSQESignal(sqeSignalInput)'));
  });
  it('RTB keeps every metadata key it is given, and its refresh writes the row metadata back whole', () => {
    const R = src('server/core/rtb/ready_to_buy_service.ts');
    expect(R).toContain('...(input.metadata || {}),');
    expect(R).toMatch(/metadata: \{\n\s+\.\.\.metadata,/);
  });
  it('the open refuses a crypto signal without the sided stamp, BEFORE the open-gate EV prices it', () => {
    expect(E).toContain("const _cbOpenClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');");
    const refuse = uniq(E, "if (_cbOpenClass === 'crypto_spot' && levelGeometryStampOf(signal.metadata) === null) {");
    expect(refuse).toBeGreaterThan(uniq(E, "return { opened: false, stage: 'GUARDRAIL_BLOCK', reason: riskCheck.reason || riskCheck.code || 'guardrail_block' };"));
    expect(refuse).toBeLessThan(uniq(E, 'const expectancyResult = evaluateTradeExpectancy(signal.symbol, {'));
    expect(E).toContain("return { opened: false, stage: 'LEVEL_GEOMETRY_ABSENT', reason: 'level_geometry_absent' };");
  });
});

describe('8c Step-4 r1 (Langston) — the hop fence, one hop further: hybrid rebuild → RTB persist/reload (jsonb) → open', () => {
  it('a sized stamp survives the hybrid pick, a JSON round trip (the jsonb column) and still reads sided, with its maker bid', async () => {
    const { baseCryptoLevelsAtBirth, levelGeometryOf } = await import('../../core/trading/crypto-birth-levels.js');
    const born = baseCryptoLevelsAtBirth({
      planEntry: 100, planStop: 98, planTarget: 104,
      metadata: { levelSpec: { stop: { form: 'distance' }, target: { form: 'distance' } } },
      quote: { bid: 99.9, ask: 100.1, basis: 'ticker_bbo', producer: 'rest_poller', ageMs: 5_000, capturedAtMs: 1_000_000 },
      knobs: { maxAgeMs: 60_000, driftRef60s: 0.00429 },
    });
    if (!born.ok) throw new Error(born.reason);
    const sizedMeta = { levelSpec: { stop: { form: 'distance' }, target: { form: 'distance' } }, ...born.stamp, unrelated: 1 };
    // the hybrid's fresh metadata literal + pickLevelStamps (the same three keys)
    const picked: Record<string, unknown> = {};
    for (const k of ['levelSpec', 'levelGeometry', 'levelBasisAtBirth']) picked[k] = (sizedMeta as Record<string, unknown>)[k];
    const hybridMeta = { signalType: 'HYBRID', ...picked };
    // the RTB write (`...(input.metadata || {})`) → jsonb → the promotion's `...signal.metadata`
    const reloaded = { ...(JSON.parse(JSON.stringify(hybridMeta)) as Record<string, unknown>), assetClass: 'crypto_spot' };
    expect(levelGeometryOf(reloaded)).toBe('sided');
    expect(makerEntryOf(reloaded)).toBe(99.9);
    // and the hybrid's re-size is a no-op on prices (idempotent on the sided stamp)
    const again = baseCryptoLevelsAtBirth({
      planEntry: born.entryPrice, planStop: born.stopPrice, planTarget: born.targetPrice, metadata: reloaded,
      quote: null, knobs: { maxAgeMs: 60_000, driftRef60s: 0.00429 },
    });
    if (!again.ok) throw new Error(again.reason);
    expect([again.alreadySided, again.entryPrice, again.stopPrice, again.targetPrice]).toEqual([true, born.entryPrice, born.stopPrice, born.targetPrice]);
  });
  it('the promotion carries the RTB row metadata whole (no field-list rebuild between the queue and the open)', () => {
    const at = E.indexOf('metadata: {\n          ...((signal.metadata as any) ?? {}),');
    expect(at).toBeGreaterThan(-1);
  });
  it('the hybrid cap bit stays consistent with the name fallback: the carried stamp IS the quant strategy\'s (C-2 rounding)', () => {
    expect(O).toContain("const _isCap = _stampSpec !== undefined ? _stampSpec.targetIsCap === true : strategyId === ('volatility_edge' as StrategyType);");
    // only volatility_edge stamps the cap bit, so stamp and name agree for every carried hybrid
    const caps = ['server/strategies/volatility-edge.ts'].map(src).filter((s) => s.includes('targetIsCap: true'));
    expect(caps).toHaveLength(1);
  });
});

describe('8c amendment 6 — the sided floor sits after the arm is chosen and BEFORE the queue write', () => {
  it('placement and refusal', () => {
    const fl = uniq(O, "if (sizingContext.assetClass === 'crypto_spot' && _mtGeometry === 'sided') {");
    expect(fl).toBeGreaterThan(uniq(O, 'const _mtPolicyDecision = applyMakerTakerFillPolicy(_mtDecision, _entryFillPolicy, 0);'));
    expect(fl).toBeLessThan(uniq(O, 'readyToBuyService.queueSQESignal(sqeSignalInput)'));
    const body = O.slice(fl, O.indexOf('console.log(', fl));
    expect(body).toContain("const _flArm = _mtPolicyDecision.chosenMode === 'maker' ? 'maker' : 'taker';");
    expect(body).toContain('sidedRewardToRisk(rawSignal.metadata, rawSignal.stopPrice, rawSignal.targetPrice, _flArm)');
    expect(body).toContain("!(_flRr.rr >= _flMin) ? 'level_rr_below_min_sided'");
    expect(body).toContain('return null;');
  });
});
