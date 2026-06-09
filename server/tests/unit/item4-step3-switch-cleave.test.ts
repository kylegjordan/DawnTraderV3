/**
 * ITEM-4 Phase B step 3 — switch cleave locks.
 *
 * Source-scan regression locks (same pattern as b79-0n-execution-audit):
 *  1. LIVE GATE — the Phase-21 gate sits BEFORE any globalLiveEngine.start()
 *     reference in the live branch, fails CLOSED, and returns the
 *     machine-readable code LIVE_ENGINE_PHASE21_GATED with NO state flip.
 *  2. STOP-PER-MODE — the stop route validates mode and acts per-mode.
 *  3. VTS INDEPENDENCE — the VTS start/stop endpoints contain no coupling to
 *     the trading-engine flags (isEngineActive*) — VTS lifecycle is its own.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES_SRC = fs.readFileSync(path.resolve(__dirname, '../../routes.ts'), 'utf-8');
const VTS_ROUTES_SRC = fs.readFileSync(path.resolve(__dirname, '../../routes/vts.ts'), 'utf-8');

describe('ITEM-4 step 3 — live-engine Phase-21 gate', () => {
  it('1a. the gate code + 409 are present and machine-readable', () => {
    expect(ROUTES_SRC).toMatch(/LIVE_ENGINE_PHASE21_GATED/);
    expect(ROUTES_SRC).toMatch(/status\(409\)/);
  });

  it('1b. the gate sits BEFORE the live engine start in the live branch', () => {
    const gateIdx = ROUTES_SRC.indexOf('LIVE_ENGINE_PHASE21_GATED');
    const liveStartIdx = ROUTES_SRC.indexOf('await globalLiveEngine.start()');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(liveStartIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(liveStartIdx);
  });

  it('1c. fail-closed: the catch path forces disabled, never default-open', () => {
    expect(ROUTES_SRC).toMatch(/failing CLOSED/);
    // the catch sets the flag false explicitly
    expect(ROUTES_SRC).toMatch(/catch \(gateErr\) \{[\s\S]*?liveEngineEnabled = false;/);
  });

  it('1e. the gate read is STRICTLY numeric === 1 (the boolean-trap lock)', () => {
    // jsonb booleans are invisible to the numeric constants resolver; the
    // gate must compare strictly to 1. A truthy "simplification" silently
    // re-opens the invisible-boolean trap (Langston step-3 review R4/1e).
    expect(ROUTES_SRC).toMatch(/live_engine_enabled === 1/);
  });

  it('1d. refusal does NOT flip engine state (no setEngineActive in the gate block)', () => {
    const gateBlockStart = ROUTES_SRC.indexOf('THE LIVE-ENGINE PHASE-21 GATE');
    const gateBlockEnd = ROUTES_SRC.indexOf('await globalLiveEngine.start()', gateBlockStart);
    const gateBlock = ROUTES_SRC.slice(gateBlockStart, gateBlockEnd);
    expect(gateBlock).not.toMatch(/setEngineActive/);
  });
});

describe('ITEM-4 step 3 — stop-per-mode + VTS independence', () => {
  it('2. the stop route validates mode (paper|live) and is mode-scoped', () => {
    const stopIdx = ROUTES_SRC.indexOf("apiRouter.post('/trading/stop'");
    expect(stopIdx).toBeGreaterThan(-1);
    const stopBlock = ROUTES_SRC.slice(stopIdx, stopIdx + 2500);
    expect(stopBlock).toMatch(/mode !== 'live' && mode !== 'paper'/);
  });

  it('3. VTS start/stop HANDLERS carry no trading-engine flag coupling', () => {
    // VTS lifecycle = its own start/stop only (item-4 O1). Status endpoints
    // legitimately REPORT modeState.tradingActive (display); the START/STOP
    // handler blocks themselves must not read or write the trading flags.
    const startIdx = VTS_ROUTES_SRC.indexOf("'/run-passive'"); // the VTS start endpoint
    const stopIdx = VTS_ROUTES_SRC.indexOf("'/stop-passive'");
    expect(startIdx).toBeGreaterThan(-1);
    expect(stopIdx).toBeGreaterThan(-1);
    const startBlock = VTS_ROUTES_SRC.slice(startIdx, startIdx + 1800);
    const stopBlock = VTS_ROUTES_SRC.slice(stopIdx, stopIdx + 1800);
    expect(startBlock).not.toMatch(/isEngineActive|setEngineActive|config\.tradingActive/);
    expect(stopBlock).not.toMatch(/isEngineActive|setEngineActive|config\.tradingActive/);
    expect(VTS_ROUTES_SRC).toMatch(/stopAutonomousSimulation/);
    expect(VTS_ROUTES_SRC).toMatch(/startAutonomousSimulation/);
  });
});
