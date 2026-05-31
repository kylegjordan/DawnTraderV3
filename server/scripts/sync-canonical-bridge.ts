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

// B.1.5 redeploy unblocker (2026-05-31): byAssetClass overrides
// ──────────────────────────────────────────────────────────────────────────────
// Encodes the per-asset-class deltas vs. the flat in-source CANONICAL_REGIME_STRATEGY_MAP.
// Hand-authored into bridge/canonical/mapping-regime-strategy.json during B79.0n.STRATEGY
// (af99bd5, 2026-05-24); this script previously emitted the flat shape, silently
// drifting away from the consumer contract enforced by getClassMap
// (server/core/strategy-mapper.ts:43 → typedCanonicalMap.byAssetClass?.[assetClass]).
//
// Each per-class subtree is derived as:
//   subtreeStrategies(regime) = (source[regime].strategies - excludeStrategies[class][regime])
//                               + addStrategies[class][regime]
//
// Exclusion rationale:
//   • strong_bull_trend: globally excluded from canonical favored list — routed
//     via separate quant-strong-trend sourcePool (B63), not the canonical regime path.
//   • defensive_hedge: crypto-only (BTC-correlation hedging, not applicable to xStocks).
//   • orb: xstock-only (intraday opening-range breakout, equity-hours microstructure).
//
// Addition rationale:
//   • orb in xstock_spot TFS: hand-authored extension (B79.0n.STRATEGY) — ORB
//     fires on stable-trend breakouts not just impulse regimes for xStocks.
//
// favoredSignalTypes is derived from the resulting per-class strategy list
// (distinct set of signalType values, using STRATEGY_KEY_TO_SIGNAL_TYPE lookup
// for ADDED strategies whose source mapping is in a different regime).
//
// minConfidence + riskMultiplier are taken directly from the source regime mapping
// (same across asset classes per current hand-authored JSON).
//
// To change per-class strategy membership: edit ASSET_CLASS_OVERRIDES below,
// re-run `npx ts-node server/scripts/sync-canonical-bridge.ts`, then verify
// the JSON via the sync-canonical-bridge.test.ts unit test.
// ──────────────────────────────────────────────────────────────────────────────

const ASSET_CLASSES = ['crypto_spot', 'xstock_spot'] as const;
type AssetClassKey = typeof ASSET_CLASSES[number];

interface PerClassOverride {
  excludeStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
  addStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
}

const ASSET_CLASS_OVERRIDES: Record<AssetClassKey, PerClassOverride> = {
  crypto_spot: {
    excludeStrategies: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      HIGH_VOLATILITY_UNSTABLE: [],
      RANGE_BOUND_STABLE: [],
      IMPULSE_EXPANSION: ['strong_bull_trend', 'orb'],
      STRUCTURAL_TRANSITION: ['orb'],
    },
    addStrategies: {},
  },
  xstock_spot: {
    excludeStrategies: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      HIGH_VOLATILITY_UNSTABLE: ['defensive_hedge'],
      RANGE_BOUND_STABLE: [],
      IMPULSE_EXPANSION: ['strong_bull_trend'],
      STRUCTURAL_TRANSITION: ['orb'],
    },
    addStrategies: {
      TREND_FRIENDLY_STABLE: ['orb'],
    },
  },
};

/** Build strategyKey → signalType lookup once from the source map. */
function buildStrategyToSignalType(): Map<string, string> {
  const map = new Map<string, string>();
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const s of mapping.strategies) {
      map.set(s.strategyKey, s.signalType);
    }
  }
  return map;
}

function deriveClassSubtree(
  assetClass: AssetClassKey,
  strategyToSignalType: Map<string, string>
): Record<string, any> {
  const overrides = ASSET_CLASS_OVERRIDES[assetClass];
  const subtree: Record<string, any> = {};
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
    const regimeKey = regime as CanonicalRegimeType;
    const excludes = new Set(overrides.excludeStrategies[regimeKey] ?? []);
    const adds = overrides.addStrategies[regimeKey] ?? [];
    const sourceKeys = mapping.strategies
      .filter(s => !excludes.has(s.strategyKey))
      .map(s => s.strategyKey);
    const favoredStrategies = [...sourceKeys, ...adds.filter(k => !sourceKeys.includes(k))];
    const favoredSignalTypes = [
      ...new Set(
        favoredStrategies
          .map(k => strategyToSignalType.get(k))
          .filter((v): v is string => typeof v === 'string')
      ),
    ];
    subtree[regime] = {
      favoredStrategies,
      favoredSignalTypes,
      riskMultiplier: mapping.riskMultiplier,
      minConfidence: mapping.minConfidence,
    };
  }
  return subtree;
}

export function generateBridgeJSON(): string {
  const strategyToSignalType = buildStrategyToSignalType();
  const byAssetClass: Record<string, Record<string, any>> = {};
  for (const assetClass of ASSET_CLASSES) {
    byAssetClass[assetClass] = deriveClassSubtree(assetClass, strategyToSignalType);
  }
  const bridge: Record<string, any> = {
    _schema: CANONICAL_SCHEMA_VERSION,
    _metadata: {
      ...CANONICAL_SCHEMA_METADATA,
      updatedAt: new Date().toISOString(),  // B59: Override hard-coded updatedAt with fresh timestamp
      generatedAt: new Date().toISOString(),
      generator: 'sync-canonical-bridge.ts',
      _changelog: {
        'v3.0.0': 'B79.0n.STRATEGY 2026-05-24: per-asset-class shape via byAssetClass nesting. ' +
                  'Crypto subtree byte-identical to v2.0.0 flat shape values. xStock subtree = ' +
                  'crypto minus defensive_hedge (BTC-decorrelation only) + add orb to TFS+IE ' +
                  '(xStock-specific opening-range microstructure). ' +
                  'B.1.5 redeploy unblocker 2026-05-31: generateBridgeJSON now derives both ' +
                  'subtrees from ASSET_CLASS_OVERRIDES — output shape matches getClassMap ' +
                  '(server/core/strategy-mapper.ts:43) consumer contract.',
      },
    },
    byAssetClass,
  };

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
