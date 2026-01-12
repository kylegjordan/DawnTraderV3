/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1B — Canonical Source Lock Test
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Ensure no service reverts to the old regime-strategy-map.ts file.
 * All imports must reference canonical-regime-strategy-map.ts exclusively.
 * 
 * This test will FAIL if any file in /server imports from the legacy file,
 * forcing developers to use the single source of truth.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_ROOT = path.resolve(__dirname, '../../');

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  function scan(directory: string) {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.startsWith('.')) {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  scan(dir);
  return files;
}

describe('Directive 11.4F.1B — Canonical Source Lock', () => {
  
  test('All imports reference canonical-regime-strategy-map.ts only (no legacy references)', () => {
    const files = getAllTsFiles(SERVER_ROOT);
    const violations: string[] = [];
    
    for (const file of files) {
      // Skip the test file itself
      if (file.includes('canonical_source_lock.test.ts')) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for direct imports from legacy file (not the canonical file)
        // Match patterns like: from '../config/regime-strategy-map' or from './config/regime-strategy-map.js'
        const legacyImportPattern = /from\s+['"][^'"]*\/regime-strategy-map(?:\.js)?['"]/g;
        const matches = content.match(legacyImportPattern);
        
        if (matches) {
          // Filter out references to canonical file
          const nonCanonicalMatches = matches.filter(m => !m.includes('canonical-regime-strategy-map'));
          if (nonCanonicalMatches.length > 0) {
            const relativePath = path.relative(SERVER_ROOT, file);
            violations.push(`${relativePath}: ${nonCanonicalMatches.join(', ')}`);
          }
        }
      } catch (e) {
        // Skip files we can't read
      }
    }
    
    expect(violations).toEqual([]);
  });
  
  test('Legacy regime-strategy-map.ts file does not exist', () => {
    const legacyPath = path.join(SERVER_ROOT, 'config', 'regime-strategy-map.ts');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });
  
  test('Canonical regime-strategy-map.ts file exists', () => {
    const canonicalPath = path.join(SERVER_ROOT, 'config', 'canonical-regime-strategy-map.ts');
    expect(fs.existsSync(canonicalPath)).toBe(true);
  });
  
  test('Canonical file exports all required types and functions', () => {
    const canonicalPath = path.join(SERVER_ROOT, 'config', 'canonical-regime-strategy-map.ts');
    const content = fs.readFileSync(canonicalPath, 'utf8');
    
    const requiredExports = [
      'CANONICAL_REGIME_STRATEGY_MAP',
      'CANONICAL_REGIMES',
      'STRATEGY_DISPLAY_NAMES',
      'LEGACY_TO_CANONICAL',
      'GHOST_REGIME_NORMALIZATION',
      'normalizeRegime',
      'normalizeStrategy',
      'getTypeForStrategy',
      'getPatternForStrategy',
      'selectRandomStrategy',
      'selectPrimaryStrategy',
      'getStrategiesForRegime',
      'getRegimeRiskMultiplier',
      'CanonicalRegimeType',
      'CanonicalSignalType',
      'CanonicalPatternType',
    ];
    
    for (const exportName of requiredExports) {
      expect(content).toContain(exportName);
    }
  });
});
