/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.2 — Regime & Strategy Mapping Audit Validation Script
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Scans all .ts files under /server for mapping definitions and
 * verifies no file defines its own conflicting local copy.
 * 
 * Patterns scanned:
 * - SignalType\.
 * - strategyMap
 * - regimeMap
 * - patternMap
 * - MarketRegimeType
 * - regimeStrategyMap
 * 
 * Usage: npx tsx scripts/test-regime-mapping-audit.ts
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';

interface ScanResult {
  file: string;
  matches: {
    pattern: string;
    count: number;
    lines: number[];
  }[];
  potentialConflicts: string[];
}

const PATTERNS = [
  { name: 'SignalType', regex: /SignalType\s*[=:]/g },
  { name: 'strategyMap', regex: /strategyMap\s*[=:]/g },
  { name: 'regimeMap', regex: /regimeMap\s*[=:]/g },
  { name: 'patternMap', regex: /patternMap\s*[=:]/g },
  { name: 'MarketRegimeType', regex: /MarketRegimeType\s*=/g },
  { name: 'regimeStrategyMap', regex: /regimeStrategyMap\s*[=:]/g },
  { name: 'PatternType', regex: /PatternType\s*=/g },
  { name: 'REGIME_WEIGHTS', regex: /REGIME_WEIGHTS\s*[=:]/g },
];

const CANONICAL_SOURCES: Record<string, string> = {
  'SignalType': 'server/types.ts',
  'PatternType': 'server/types.ts',
  'MarketRegimeType': 'server/types/market-regime.types.ts',
  'REGIME_WEIGHTS': 'server/types/market-regime.types.ts',
  'regimeStrategyMap': 'server/config/regime-strategy-map.ts',
};

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  function scan(directory: string) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.startsWith('.')) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return files;
}

function scanFile(filePath: string): ScanResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const result: ScanResult = {
    file: filePath,
    matches: [],
    potentialConflicts: [],
  };
  
  for (const pattern of PATTERNS) {
    const matchLines: number[] = [];
    
    lines.forEach((line, index) => {
      if (pattern.regex.test(line)) {
        matchLines.push(index + 1);
        pattern.regex.lastIndex = 0;
      }
    });
    
    if (matchLines.length > 0) {
      result.matches.push({
        pattern: pattern.name,
        count: matchLines.length,
        lines: matchLines,
      });
      
      const canonicalSource = CANONICAL_SOURCES[pattern.name];
      if (canonicalSource && !filePath.endsWith(canonicalSource) && !filePath.includes('.test.')) {
        const isImport = lines.some(l => l.includes('import') && l.includes(pattern.name));
        if (!isImport) {
          result.potentialConflicts.push(
            `${pattern.name} defined in ${filePath} but canonical source is ${canonicalSource}`
          );
        }
      }
    }
  }
  
  return result;
}

function runAudit() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  Directive 11.4C.2 — Regime & Strategy Mapping Audit');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  const serverDir = path.join(process.cwd(), 'server');
  const files = getAllTsFiles(serverDir);
  
  console.log(`📁 Scanning ${files.length} TypeScript files in /server...\n`);
  
  const results: ScanResult[] = [];
  const patternCounts: Record<string, number> = {};
  const conflictingFiles: string[] = [];
  
  for (const file of files) {
    const result = scanFile(file);
    if (result.matches.length > 0) {
      results.push(result);
      
      for (const match of result.matches) {
        patternCounts[match.pattern] = (patternCounts[match.pattern] || 0) + match.count;
      }
      
      if (result.potentialConflicts.length > 0) {
        conflictingFiles.push(file);
      }
    }
  }
  
  console.log('📊 Pattern Occurrence Summary:\n');
  console.log('Pattern               | Occurrences | Files');
  console.log('──────────────────────┼─────────────┼──────');
  
  for (const pattern of PATTERNS) {
    const count = patternCounts[pattern.name] || 0;
    const filesWithPattern = results.filter(r => r.matches.some(m => m.pattern === pattern.name)).length;
    console.log(`${pattern.name.padEnd(22)}| ${String(count).padStart(11)} | ${filesWithPattern}`);
  }
  
  console.log('\n📁 Files with Mapping Definitions:\n');
  
  for (const result of results.slice(0, 20)) {
    const relPath = result.file.replace(process.cwd() + '/', '');
    console.log(`  ${relPath}`);
    for (const match of result.matches) {
      console.log(`    └─ ${match.pattern}: ${match.count} occurrence(s) at lines ${match.lines.join(', ')}`);
    }
  }
  
  if (results.length > 20) {
    console.log(`  ... and ${results.length - 20} more files`);
  }
  
  console.log('\n⚠️  Potential Conflicts:\n');
  
  const allConflicts: string[] = [];
  for (const result of results) {
    allConflicts.push(...result.potentialConflicts);
  }
  
  if (allConflicts.length === 0) {
    console.log('  ✅ No conflicting local definitions found.');
  } else {
    for (const conflict of allConflicts) {
      console.log(`  ❌ ${conflict}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Total files scanned:        ${files.length}`);
  console.log(`  Files with mappings:        ${results.length}`);
  console.log(`  Total pattern occurrences:  ${Object.values(patternCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  Potential conflicts:        ${allConflicts.length}`);
  console.log(`  Conflicting files:          ${conflictingFiles.length}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  const auditOutput = {
    timestamp: new Date().toISOString(),
    filesScanned: files.length,
    filesWithMappings: results.length,
    patternCounts,
    conflicts: allConflicts,
    results: results.map(r => ({
      file: r.file.replace(process.cwd() + '/', ''),
      matches: r.matches,
      potentialConflicts: r.potentialConflicts,
    })),
  };
  
  const outputPath = path.join(process.cwd(), 'audit', 'reports', 'audit_scan_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(auditOutput, null, 2));
  console.log(`📄 Full results saved to: ${outputPath}\n`);
  
  return allConflicts.length === 0;
}

/**
 * Directive 11.4C.3-A: Pattern Integrity Verification
 * Verifies HYBRID trades have patterns attached
 */
async function verifyPatternIntegrity(): Promise<boolean> {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  Directive 11.4C.3-A — Pattern Integrity Verification');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  try {
    const telemetryPath = path.join(process.cwd(), 'server', 'services', 'telemetry-aggregator.ts');
    const vtsPath = path.join(process.cwd(), 'server', 'services', 'vts-runner.ts');
    
    const telemetryContent = fs.readFileSync(telemetryPath, 'utf-8');
    const vtsContent = fs.readFileSync(vtsPath, 'utf-8');
    
    const checks = [
      { 
        name: 'VTS HYBRID→QUANT downgrade logic', 
        file: vtsPath,
        pattern: /signalType\s*===\s*['"]HYBRID['"]\s*&&\s*!detectedPattern/,
        content: vtsContent
      },
      {
        name: 'VTS PATTERN discard on missing pattern',
        file: vtsPath,
        pattern: /signalType\s*===\s*['"]PATTERN['"]\s*&&\s*!detectedPattern/,
        content: vtsContent
      },
      {
        name: 'Telemetry QUANT pattern suppression',
        file: telemetryPath,
        pattern: /signalType\s*!==\s*['"]QUANT['"]/,
        content: telemetryContent
      }
    ];
    
    let allPassed = true;
    
    for (const check of checks) {
      const found = check.pattern.test(check.content);
      const relPath = check.file.replace(process.cwd() + '/', '');
      if (found) {
        console.log(`  ✅ ${check.name} found in ${relPath}`);
      } else {
        console.log(`  ❌ ${check.name} NOT found in ${relPath}`);
        allPassed = false;
      }
    }
    
    console.log('\n  Pattern Integrity Verdict: ' + (allPassed ? '✅ PASS' : '❌ FAIL'));
    return allPassed;
  } catch (error) {
    console.error('  ❌ Error during pattern integrity check:', error);
    return false;
  }
}

async function runDeepAudit() {
  const auditSuccess = runAudit();
  const patternSuccess = await verifyPatternIntegrity();
  
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  FINAL DEEP AUDIT RESULT');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  Mapping Audit:       ${auditSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Pattern Integrity:   ${patternSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Overall:             ${auditSuccess && patternSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  return auditSuccess && patternSuccess;
}

const isDeep = process.argv.includes('--deep');
if (isDeep) {
  runDeepAudit().then(success => process.exit(success ? 0 : 1));
} else {
  const success = runAudit();
  process.exit(success ? 0 : 1);
}
