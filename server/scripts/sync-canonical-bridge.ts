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

import { writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  getFavoredListExcludes,
  ASSET_CLASSES,
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_SCHEMA_METADATA,
  REGIMES,
  type AssetClassKey,
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

// ──────────────────────────────────────────────────────────────────────────────
// B-CANONICAL-BRIDGE-CHURN (#402, 2026-09-08): CONTENT KEY FOR SKIP-ON-UNCHANGED
// ──────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: generateBridgeJSON() stamps _metadata.updatedAt and .generatedAt
// with new Date() on every call, so an unchanged map still produced different bytes.
// This file is TRACKED, so every daily sync dirtied the staging worktree — and
// dt-deploy.sh:194-199 REFUSES a dirty worktree (exit 3). It refused a real deploy on
// 2026-08-17 (#402), and again on 2026-09-08.
//
// ⛔ THE EXCLUSION SET IS EXACTLY TWO KEYS, AND THAT IS DELIBERATE (Langston BLOCKER-1).
// The obvious move is to copy recalibrate-predictive-weights.ts:251, which filters
// `!k.startsWith("_")`. DO NOT. Top-level keys here are _metadata, _schema and
// byAssetClass, so that filter would reduce the comparison to byAssetClass ALONE and
// leave _schema OUTSIDE change detection. Consequence: bump CANONICAL_SCHEMA_VERSION
// without touching byAssetClass and the sync would SILENTLY REFUSE TO WRITE IT —
// schema-validator.ts:49-53 then errors at boot, analytics.tsx renders a stale Schema
// badge, and the Force Sync button appears to do nothing. _metadata also carries
// _changelog, _fields, canonical, generator, includesDriftScore and source: all CONTENT.
// ⇒ exclude the two STAMPS, nothing else.
function contentKey(jsonText: string): string | null {
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === 'object' && parsed._metadata) {
      delete parsed._metadata.updatedAt;
      delete parsed._metadata.generatedAt;
    }
    return createHash('sha256')
      .update(JSON.stringify(sortObjectKeys(parsed)))
      .digest('hex');
  } catch {
    // ⛔ UNPARSEABLE ON DISK MUST NOT READ AS "UNCHANGED". Returning null makes the
    //    caller's equality test false, so a corrupt file is REWRITTEN rather than
    //    silently preserved — absent/broken is never treated as agreement (#546).
    return null;
  }
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

// B-4.7 (#163): ASSET_CLASS_OVERRIDES + the local subtree derivation moved
// INTO server/config/canonical-regime-strategy-map.ts — the bridge now reads
// the per-class MATERIALIZED trees (single derivation, single home). The
// emitted JSON is byte-identical to the pre-B-4.7 derivation (locked by
// sync-canonical-bridge.test.ts + the B-4.7 baseline diff).
function deriveClassSubtree(assetClass: AssetClassKey): Record<string, any> {
  const classTree = CANONICAL_REGIME_STRATEGY_MAP[assetClass];
  const subtree: Record<string, any> = {};
  for (const [regime, mapping] of Object.entries(classTree)) {
    // B-4.7 diff-B R1/R2: the tree is the EVAL universe; the favored list
    // additionally subtracts favored-list-only excludes (strong_bull_trend —
    // lane-routed, not a favored pick). Keeps the JSON byte-identical to the
    // pre-B-4.7 derivation while the eval tree regains the lane strategy.
    const favoredExcl = getFavoredListExcludes(assetClass, regime as CanonicalRegimeType);
    const favored = mapping.strategies.filter(s => !favoredExcl.has(s.strategyKey));
    const favoredStrategies = favored.map(s => s.strategyKey);
    const favoredSignalTypes = [...new Set(favored.map(s => s.signalType))];
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
  const byAssetClass: Record<string, Record<string, any>> = {};
  for (const assetClass of ASSET_CLASSES) {
    byAssetClass[assetClass] = deriveClassSubtree(assetClass);
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
  
  // B-4.7 (#163): the map is per-class — document each class's tree.
  for (const assetClass of ASSET_CLASSES) {
    lines.push(`# Asset class: ${assetClass}`);
    lines.push('');
    for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP[assetClass])) {
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
  
  // B-4.7 (#163): identity registry — union across class trees, first-seen
  // (regime column = first regime the key appears under, matching old output).
  const seenKeys = new Set<string>();
  for (const assetClass of ASSET_CLASSES) {
    for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP[assetClass])) {
      for (const strategy of mapping.strategies) {
        if (seenKeys.has(strategy.strategyKey)) continue;
        seenKeys.add(strategy.strategyKey);
        lines.push(
          `| ${strategy.strategyKey} | ${strategy.strategy} | ${strategy.signalType} | ${strategy.patternType ?? '—'} | ${regime} |`
        );
      }
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
  filesUnchanged: string[];
  errors: string[];
}> {
  const filesUpdated: string[] = [];
  // ⛔ B-CANONICAL-BRIDGE-CHURN, Langston BLOCKER-GRADE CONDITION B: a skipped write
  //    must NOT be reported as an update. routes.ts feeds filesUpdated straight back to
  //    the Force Sync button, so without this a skipped run would tell the operator who
  //    just clicked it that the file was written. "We are building an instrument this
  //    batch; it may not ship reporting work it did not do."
  const filesUnchanged: string[] = [];
  const errors: string[] = [];

  try {
    ensureDir(BRIDGE_DIR);

    const jsonPath = join(BRIDGE_DIR, 'mapping-regime-strategy.json');
    const jsonContent = generateBridgeJSON();
    // Skip the write when only the two stamps would differ. An absent or unparseable
    // file yields null from contentKey() ⇒ never equal ⇒ always rewritten.
    const existingKey = existsSync(jsonPath) ? contentKey(readFileSync(jsonPath, 'utf8')) : null;
    const candidateKey = contentKey(jsonContent);
    if (existingKey !== null && candidateKey !== null && existingKey === candidateKey) {
      filesUnchanged.push(jsonPath);
      logEvent(`Unchanged (content identical, stamps not rewritten) ${jsonPath}`);
    } else {
      atomicWrite(jsonPath, jsonContent);
      filesUpdated.push(jsonPath);
      logEvent(`Updated ${jsonPath}`);
    }

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
    
    // P-4: the sync ALWAYS records that it ran, in the already-gitignored logs/ stream —
    // so scheduler liveness survives without a tracked field advancing.
    logEvent(`Sync complete: ${filesUpdated.length} updated, ${filesUnchanged.length} unchanged`);

    return { success: true, filesUpdated, filesUnchanged, errors };
    
  } catch (err: any) {
    const errorMsg = `Sync failed: ${err.message}`;
    errors.push(errorMsg);
    logEvent(errorMsg);
    return { success: false, filesUpdated, filesUnchanged, errors };
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
          console.log('Files unchanged:', result.filesUnchanged);
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
