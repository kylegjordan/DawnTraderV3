/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.EXECUTION — Audit + Regression-Lock Tests (CHUNK E)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that CHUNKS A/B/C from B79.0n.EXECUTION land correctly:
 *   - CHUNK A: TradeClosedEvent gains optional assetClass field; emit site
 *     populates it from position.assetClass (canonical SSOT read, not
 *     re-resolved). Canary log present.
 *   - CHUNK B: outcomeFeedback hook (paper-execution-engine.ts:L1376) reads
 *     position.assetClass first, falls back to safeResolveAssetClass as
 *     belt-and-suspenders (not load-bearing — L922 NO_FALLBACK hard-fails
 *     before flow reaches L1376 if assetClass missing).
 *   - CHUNK C: /api/diagnostics/orchestrator-per-class-state returns nested
 *     payload with `orchestrator`, `execution`, and `_meta` top-level keys.
 *     URL retained per Langston Step 1 Q3 ACK.
 *
 * Tests 8-10 (end-to-end integration) are flagged for future work and live
 * in the cascade integration test file.
 *
 * Langston Step 2 B3 add: test #5 explicitly asserts no-throw + clean-skip
 * on null-class semantics (defensive fallback never throws).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAPER_EXEC_SRC = readFileSync(
  join(process.cwd(), 'server/services/paper-execution-engine.ts'),
  'utf-8',
);
const EVENT_BUS_SRC = readFileSync(
  join(process.cwd(), 'server/lib/event-bus.ts'),
  'utf-8',
);
const ROUTES_SRC = readFileSync(
  join(process.cwd(), 'server/routes.ts'),
  'utf-8',
);

describe('B79.0n.EXECUTION — audit + regression-lock tests', () => {

  describe('CHUNK A — TradeClosedEvent additive assetClass field', () => {

    it('Test 1 — TradeClosedEvent interface includes optional assetClass field', () => {
      // Compile-time contract verified by tsc; source-file inspection
      // confirms field declaration with optional marker.
      expect(EVENT_BUS_SRC).toMatch(/export interface TradeClosedEvent \{[\s\S]*?assetClass\?: string;[\s\S]*?\}/);
    });

    it('Test 2 — TradeClosedEvent comment documents C-7 additive doctrine', () => {
      // Doctrine documentation prevents future drift to required-field.
      expect(EVENT_BUS_SRC).toMatch(/B79\.0n\.EXECUTION[\s\S]*?CHUNK A[\s\S]*?additive field is safe/);
      expect(EVENT_BUS_SRC).toMatch(/c13-validation-service[\s\S]*?L103-107 collection only/);
    });

    it('Test 3 — emit site at paper-execution-engine populates assetClass from position record', () => {
      // CHUNK A emit-site change: read from position.assetClass (canonical SSOT
      // write at L2147 createPaperSimOpenPosition), NOT re-resolve from symbol.
      expect(PAPER_EXEC_SRC).toMatch(/_tcAssetClass\s*=\s*\(position as any\)\.assetClass/);
      expect(PAPER_EXEC_SRC).toMatch(/eventBus\.emitTradeClosed\(\{[\s\S]*?assetClass:\s*_tcAssetClass[\s\S]*?\}\)/);
    });

    it('Test 4 — canary log present at emit site (Langston Step 2 B2 mitigation)', () => {
      expect(PAPER_EXEC_SRC).toMatch(/\[B79\.0n\.EXECUTION\]\[EMIT_TRADE_CLOSED\][\s\S]*?mode=[\s\S]*?class=[\s\S]*?symbol=/);
    });
  });

  describe('CHUNK B — Position-record SSOT cleanup at outcomeFeedback hook', () => {

    it('Test 5 — outcomeFeedback hook reads position.assetClass first with safeResolveAssetClass fallback (no-throw on null skip)', () => {
      // CHUNK B: switched from `safeResolveAssetClass(position.symbol, 'kraken')`
      // re-resolve to `position.assetClass ?? safeResolveAssetClass(...)` read-from-record
      // with belt-and-suspenders fallback. The if (_assetClass !== null) guard
      // ensures no-throw clean-skip when fallback also returns null.
      expect(PAPER_EXEC_SRC).toMatch(
        /_assetClass\s*=\s*\(position as any\)\.assetClass\s*\?\?\s*safeResolveAssetClass\(position\.symbol,\s*['"]kraken['"]\)/,
      );
      // No-throw skip semantics: if _assetClass null, the updateEma is skipped
      // (entire block wrapped in `if (_assetClass !== null)`).
      expect(PAPER_EXEC_SRC).toMatch(/if \(_assetClass !== null\) \{[\s\S]*?outcomeFeedbackStore\.updateEma\(\s*_assetClass/);
      // Comment annotates belt-and-suspenders doctrine per Langston Step 2 B2 reframe.
      expect(PAPER_EXEC_SRC).toMatch(/BELT-AND-SUSPENDERS, NOT load-bearing/);
      expect(PAPER_EXEC_SRC).toMatch(/L922 B79\.TEC NO_FALLBACK hard-fails/);
    });
  });

  describe('CHUNK C — Diagnostic endpoint payload restructure', () => {

    it('Test 6 — endpoint URL retained per Langston Q3 ACK (no rename)', () => {
      expect(ROUTES_SRC).toMatch(/apiRouter\.get\(['"]\/diagnostics\/orchestrator-per-class-state['"]/);
    });

    it('Test 7 — payload nested-by-layer with orchestrator + execution + _meta top-level keys', () => {
      // Response shape: { ts, batch, orchestrator: {...}, execution: {...}, _meta: {...} }
      expect(ROUTES_SRC).toMatch(/res\.json\(\{[\s\S]*?orchestrator:\s*orchestratorPerClass[\s\S]*?execution:\s*executionPerClass[\s\S]*?_meta:\s*\{/);
    });

    it('Test 8 — _meta surfaces schemaVersion + coverage + lastReviewed + knownGaps', () => {
      expect(ROUTES_SRC).toMatch(/schemaVersion:\s*2/);
      expect(ROUTES_SRC).toMatch(/coverage:\s*\[\s*['"]orchestrator['"]\s*,\s*['"]execution['"]\s*\]/);
      expect(ROUTES_SRC).toMatch(/lastReviewed:\s*['"]2026-05-27['"]/);
      expect(ROUTES_SRC).toMatch(/knownGaps:\s*\[/);
    });

    it('Test 9 — _meta.knownGaps includes fee/slippage + sizing-core + narrative-feed deferrals', () => {
      expect(ROUTES_SRC).toMatch(/fee\/slippage dispatch is class-member wildcard/);
      expect(ROUTES_SRC).toMatch(/sizing-core risk-pct\/max-position-pct mode-keyed/);
      expect(ROUTES_SRC).toMatch(/narrative-feed TRADE_OPENED\/TRADE_CLOSED payload lacks assetClass/);
    });

    it('Test 10 — execution-layer block surfaces feePercent + slippagePercent fields per active class', () => {
      // The endpoint code constructs { openPositions, recentCloses24h, feePercent, slippagePercent }
      // for each non-perp active class (crypto_spot + xstock_spot).
      expect(ROUTES_SRC).toMatch(/feePercent:\s*wildcardFee/);
      expect(ROUTES_SRC).toMatch(/slippagePercent:\s*wildcardSlip/);
      expect(ROUTES_SRC).toMatch(/openPositions:\s*open/);
      expect(ROUTES_SRC).toMatch(/recentCloses24h:\s*closed/);
    });

    it('Test 11 — perp variants surface CLASS_NOT_WIRED status (not silently dropped)', () => {
      // Both crypto_perp and xstock_perp must surface CLASS_NOT_WIRED in
      // the execution block — guard against accidentally dropping the
      // not-wired variants in the payload restructure.
      expect(ROUTES_SRC).toMatch(/if \(cls === ['"]crypto_perp['"] \|\| cls === ['"]xstock_perp['"]\) \{[\s\S]*?status:\s*['"]CLASS_NOT_WIRED['"]/);
    });

    it('Test 12 — endpoint imports DEFAULT_TAKER_FEE + DEFAULT_SLIPPAGE from exchange-defaults', () => {
      // Confirms feePercent/slippagePercent surfaces are the current wildcard values
      // sourced from the same module the engine uses (paper-execution-engine.ts:91).
      expect(ROUTES_SRC).toMatch(/from\s+['"]\.\/config\/exchange-defaults\.js['"]/);
      expect(ROUTES_SRC).toMatch(/DEFAULT_TAKER_FEE/);
      expect(ROUTES_SRC).toMatch(/DEFAULT_SLIPPAGE/);
    });
  });
});
