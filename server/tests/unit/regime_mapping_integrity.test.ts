/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Regime Mapping Integrity Test
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Verifies that no hardcoded regime strings exist outside of /config and /tests
 * directories. All regime references should use REGIMES.* constants from
 * canonical-regime-strategy-map.ts.
 * 
 * This test scans the server directory for direct string usage of:
 * - BULL_STABLE
 * - BEAR_VOLATILE
 * - LOW_VOL_CHOP
 * - HIGH_VOL_IMPULSE
 * - TRANSITION
 * 
 * DSS (Dynamic Strategy Selector) Exclusions:
 * ────────────────────────────────────────────
 * The following files are EXCLUDED from this test because DSS uses an extended
 * regime type system with additional regimes (EXTREME_NOISE, BULL_VOLATILE,
 * BEAR_STABLE) beyond the 5 canonical regimes. These extended regimes are only
 * used within the DSS subsystem and do not propagate to core trading logic:
 * 
 *   - dynamic-strategy-selector.ts  → Core DSS logic with extended regime types
 *   - dynamic-sizing-engine.ts      → Uses DSS extended regime list
 *   - market-indicators.ts          → Contains DSS regime mappings
 *   - telemetry-repository.ts       → Normalizes canonical to DSS regimes
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Regime Mapping Integrity — No Hardcoded Regime Strings', () => {
  
  const REGIMES_TO_CHECK = [
    'TREND_FRIENDLY_STABLE',
    'HIGH_VOLATILITY_UNSTABLE',
    'RANGE_BOUND_STABLE',
    'IMPULSE_EXPANSION',
    'STRUCTURAL_TRANSITION'
  ];
  
  const EXCLUDED_PATHS = [
    '/config/',
    '/tests/',
    'node_modules',
    '.test.ts',
    'dynamic-strategy-selector',  // DSS has extended regime types
    'dynamic-sizing-engine',      // Uses DSS extended regimes
    'market-indicators',          // Uses DSS regime mappings
    'telemetry-repository',       // Has DSS regime normalization
  ];
  
  const ALLOWED_PATTERNS = [
    /\.includes\s*\(\s*['"]/, // .includes('STRUCTURAL_TRANSITION') pattern matching is OK
    /REGIMES\./,              // REGIMES.* usage is OK
    /type\s+\w+\s*=/,         // Type definitions are OK
    /^\s*\|/,                 // Type union members are OK
    /case\s+REGIMES\./,       // Switch cases with REGIMES.* are OK
    /MarketRegime\s*=/,       // MarketRegime type definition is OK
    /export\s+type/,          // Type exports are OK
    /:\s*MarketRegime/,       // Type annotations are OK
    /CANONICAL_REGIMES/,      // Canonical regime array references
  ];
  
  function getAllTsFiles(dir: string, files: string[] = []): string[] {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory() && !item.name.includes('node_modules')) {
          getAllTsFiles(fullPath, files);
        } else if (item.isFile() && item.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch (e) {}
    return files;
  }
  
  function findHardcodedRegimes(regime: string): string[] {
    const serverDir = path.resolve(__dirname, '../../');
    const files = getAllTsFiles(serverDir);
    const violations: string[] = [];
    
    const pattern = new RegExp(`['"]${regime}['"]`, 'g');
    
    for (const file of files) {
      if (EXCLUDED_PATHS.some(p => file.includes(p))) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (pattern.test(line)) {
            const isAllowed = ALLOWED_PATTERNS.some(p => p.test(line));
            if (!isAllowed) {
              violations.push(`${file}:${i + 1}: ${line.trim()}`);
            }
          }
        }
      } catch (e) {}
    }
    
    return violations;
  }
  
  for (const regime of REGIMES_TO_CHECK) {
    test(`No hardcoded '${regime}' strings outside config/tests`, () => {
      const violations = findHardcodedRegimes(regime);
      
      if (violations.length > 0) {
        console.log(`\nViolations for ${regime}:`);
        violations.forEach(v => console.log(`  ${v}`));
      }
      
      expect(violations, `Found hardcoded '${regime}' strings:\n${violations.join('\n')}`).toHaveLength(0);
    });
  }
  
  test('REGIMES constant is exported from canonical-regime-strategy-map', async () => {
    const { REGIMES } = await import('../../config/canonical-regime-strategy-map');
    
    expect(REGIMES).toBeDefined();
    expect(REGIMES.TREND_FRIENDLY_STABLE).toBe('TREND_FRIENDLY_STABLE');
    expect(REGIMES.HIGH_VOLATILITY_UNSTABLE).toBe('HIGH_VOLATILITY_UNSTABLE');
    expect(REGIMES.RANGE_BOUND_STABLE).toBe('RANGE_BOUND_STABLE');
    expect(REGIMES.IMPULSE_EXPANSION).toBe('IMPULSE_EXPANSION');
    expect(REGIMES.STRUCTURAL_TRANSITION).toBe('STRUCTURAL_TRANSITION');
  });
  
  test('STRATEGIES constant is exported from canonical-regime-strategy-map', async () => {
    const { STRATEGIES } = await import('../../config/canonical-regime-strategy-map');
    
    expect(STRATEGIES).toBeDefined();
    expect(STRATEGIES.SMA_TREND_RIDE).toBe('sma_trend_ride');
    expect(STRATEGIES.VWAP_PULLBACK).toBe('vwap_pullback');
    expect(STRATEGIES.MORNING_STAR).toBe('morning_star');
    expect(STRATEGIES.BREAKOUT).toBe('breakout');
    expect(STRATEGIES.DHMA).toBe('dhma');
  });
});
