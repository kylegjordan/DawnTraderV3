/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Bridge Auto-Sync Utility
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Regenerates Markdown and JSON bridge files from the canonical TypeScript map.
 * Uses atomic writes (temp file → rename) to prevent partial writes.
 * 
 * Usage:
 *   npx ts-node server/scripts/sync-canonical-bridge.ts
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_SCHEMA_METADATA,
  REGIMES,
  type CanonicalRegimeType
} from '../config/canonical-regime-strategy-map';

const BRIDGE_DIR = join(process.cwd(), 'bridge/canonical');
const LOG_PATH = join(process.cwd(), 'logs/system_events.log');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sortObjectKeys(obj: Record<string, any>): Record<string, any> {
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      sorted[key] = sortObjectKeys(val);
    } else {
      sorted[key] = val;
    }
  }
  return sorted;
}

function atomicWrite(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  writeFileSync(tempPath, content, 'utf8');
  renameSync(tempPath, filePath);
}

function logEvent(message: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [11.7F][Sync] ${message}\n`;
  
  ensureDir(dirname(LOG_PATH));
  appendFileSync(LOG_PATH, logEntry);
  console.log(logEntry.trim());
}

function generateBridgeJSON(): string {
  const bridge: Record<string, any> = {
    _schema: CANONICAL_SCHEMA_VERSION,
    _metadata: {
      ...CANONICAL_SCHEMA_METADATA,
      updatedAt: new Date().toISOString(),  // B59: Override hard-coded updatedAt with fresh timestamp
      generatedAt: new Date().toISOString(),
      generator: 'sync-canonical-bridge.ts'
    }
  };
  
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    bridge[regime] = {
      favoredStrategies: mapping.strategies.map(s => s.strategyKey),
      favoredSignalTypes: [...new Set(mapping.strategies.map(s => s.signalType))],
      riskMultiplier: mapping.riskMultiplier,
      minConfidence: mapping.minConfidence
    };
  }
  
  return JSON.stringify(sortObjectKeys(bridge), null, 2);
}

function generateRegimeStrategyMarkdown(): string {
  const lines: string[] = [
    '# DawnTrader Regime–Strategy Mapping',
    '',
    `> **Schema Version**: ${CANONICAL_SCHEMA_VERSION}`,
    `> **Last Updated**: ${CANONICAL_SCHEMA_METADATA.updatedAt}`,
    `> **Source**: Canonical TypeScript (auto-generated)`,
    '',
    '## DriftScore Integration',
    '',
    'DriftScore quantifies the statistical distance between a strategy\'s operating environment',
    'and its canonical regime\'s ideal volatility/trend profile. See `drift-definitions.ts` for',
    'ideal Z-score targets and weights per regime.',
    '',
    '---',
    ''
  ];
  
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    lines.push(`## ${regime}`);
    lines.push('');
    lines.push(`**Metrics**: ${mapping.metrics.description}`);
    lines.push('');
    lines.push('| Strategy | Signal Type | Pattern | Secondary Metrics |');
    lines.push('|----------|-------------|---------|-------------------|');
    
    for (const strategy of mapping.strategies) {
      lines.push(
        `| ${strategy.strategy} | ${strategy.signalType} | ${strategy.patternType ?? '—'} | ${strategy.secondaryMetrics} |`
      );
    }
    
    lines.push('');
    lines.push(`- **Risk Multiplier**: ${mapping.riskMultiplier}`);
    lines.push(`- **Min Confidence**: ${mapping.minConfidence}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

function generateSignalPatternMarkdown(): string {
  const lines: string[] = [
    '# DawnTrader Signal → Strategy → Pattern Mapping',
    '',
    `> **Schema Version**: ${CANONICAL_SCHEMA_VERSION}`,
    `> **Last Updated**: ${CANONICAL_SCHEMA_METADATA.updatedAt}`,
    '',
    '## Strategy Registry',
    '',
    '| Strategy Key | Display Name | Signal Type | Pattern Type | Primary Regime |',
    '|--------------|--------------|-------------|--------------|----------------|'
  ];
  
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const strategy of mapping.strategies) {
      lines.push(
        `| ${strategy.strategyKey} | ${strategy.strategy} | ${strategy.signalType} | ${strategy.patternType ?? '—'} | ${regime} |`
      );
    }
  }
  
  lines.push('');
  lines.push('## Changes in v1.4b');
  lines.push('');
  lines.push('- **SMA Trend Ride**: Realigned from BULL_STABLE → HIGH_VOL_IMPULSE');
  lines.push('- **Range Trade**: Confirmed in LOW_VOL_CHOP with updated metrics (Bandwidth < 0.14, RSI 45–55)');
  lines.push('');
  
  return lines.join('\n');
}

export async function syncCanonicalBridge(): Promise<{
  success: boolean;
  filesUpdated: string[];
  errors: string[];
}> {
  const filesUpdated: string[] = [];
  const errors: string[] = [];
  
  try {
    ensureDir(BRIDGE_DIR);
    
    const jsonPath = join(BRIDGE_DIR, 'mapping-regime-strategy.json');
    const jsonContent = generateBridgeJSON();
    atomicWrite(jsonPath, jsonContent);
    filesUpdated.push(jsonPath);
    logEvent(`Updated ${jsonPath}`);
    
    const regimeMdPath = join(BRIDGE_DIR, 'DawnTrader_Regime_Strategy_Mapping.md');
    const regimeMdContent = generateRegimeStrategyMarkdown();
    atomicWrite(regimeMdPath, regimeMdContent);
    filesUpdated.push(regimeMdPath);
    logEvent(`Updated ${regimeMdPath}`);
    
    const signalMdPath = join(BRIDGE_DIR, 'DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md');
    const signalMdContent = generateSignalPatternMarkdown();
    atomicWrite(signalMdPath, signalMdContent);
    filesUpdated.push(signalMdPath);
    logEvent(`Updated ${signalMdPath}`);
    
    logEvent(`Sync complete: ${filesUpdated.length} files updated`);
    
    return { success: true, filesUpdated, errors };
    
  } catch (err: any) {
    const errorMsg = `Sync failed: ${err.message}`;
    errors.push(errorMsg);
    logEvent(errorMsg);
    return { success: false, filesUpdated, errors };
  }
}

// B59: Guard CLI entry point for ESM compatibility (require.main/module don't exist in esbuild ESM bundles)
try {
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    syncCanonicalBridge()
      .then(result => {
        if (result.success) {
          console.log('✅ Canonical bridge sync complete');
          console.log('Files updated:', result.filesUpdated);
        } else {
          console.error('❌ Sync failed:', result.errors);
          process.exit(1);
        }
      })
      .catch(err => {
        console.error('❌ Fatal error:', err);
        process.exit(1);
      });
  }
} catch { /* ESM environment — CLI entry point not applicable */ }
