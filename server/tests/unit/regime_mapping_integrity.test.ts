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
 * HF9: DSS fully deleted. Extended regime types (EXTREME_NOISE, BULL_VOLATILE,
 * BEAR_STABLE) no longer exist. The following exclusions remain for files that
 * define MarketRegime type unions or have regime-related type mappings:
 * 
 *   - dynamic-sizing-engine.ts      → Has regime-related type references
 *   - market-indicators.ts          → Contains MarketRegime type definition
 *   - telemetry-repository.ts       → Has regime type normalization
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
    'dynamic-sizing-engine',      // Has regime-related type references
    'market-indicators',          // Contains MarketRegime type definition
    'telemetry-repository',       // Has regime type normalization
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

    // P19-B1 (2026-06-13): no `g` flag — a global regex carries lastIndex state
    // across .test() calls, which can silently SKIP violations on lines after a
    // match. Single-line membership test needs no global flag.
    const pattern = new RegExp(`['"]${regime}['"]`);

    for (const file of files) {
      // P19-B1 (2026-06-13): EXCLUDED_PATHS entries use '/' but path.join
      // builds '\\' paths on Windows, so the '/config/' and '/tests/'
      // exemptions never matched on a Windows bench and the canonical map
      // itself got flagged. Compare on a separator-normalized path.
      const normalizedPath = file.split(path.sep).join('/');
      if (EXCLUDED_PATHS.some(p => normalizedPath.includes(p))) continue;
      
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
