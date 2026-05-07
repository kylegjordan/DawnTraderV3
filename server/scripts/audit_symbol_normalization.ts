/**
 * Directive 11.4H Task 1 — Symbol Normalization Audit Script
 * 
 * Iterates all active pairs and validates:
 * - Tier assignment (0-3)
 * - Canonical symbol resolution
 * - BTC/XBT and DOGE/XDG mapping correctness
 * - No Tier-3 (uncertain) symbols in active use
 * 
 * Output: /audit/reports/symbol_normalization_audit.json
 */

import { getSymbolMappingDetails, isMappable, getAllInternalSymbols } from '../markets/kraken-symbol-resolver.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import fs from 'fs/promises';
import path from 'path';

interface SymbolAuditEntry {
  symbol: string;
  internal: string;
  rest_pair: string | null;
  ws_pair: string | null;
  tier: number | null;
  tier_reason: string | null;
  mappable: boolean;
  in_static_map: boolean;
  in_auto_map: boolean;
  issues: string[];
}

interface AuditReport {
  timestamp: string;
  directive: string;
  summary: {
    total_pairs: number;
    tier_0_count: number;
    tier_1_count: number;
    tier_2_count: number;
    tier_3_count: number;
    unmappable_count: number;
    btc_xbt_correct: boolean;
    doge_xdg_correct: boolean;
    no_tier3_in_active: boolean;
  };
  btc_mapping_test: {
    input: string;
    expected_internal: string;
    actual_internal: string;
    expected_ws: string;
    actual_ws: string;
    pass: boolean;
  };
  doge_mapping_test: {
    input: string;
    expected_internal: string;
    actual_internal: string;
    expected_ws: string;
    actual_ws: string;
    pass: boolean;
  };
  tier_3_symbols: SymbolAuditEntry[];
  unmappable_symbols: SymbolAuditEntry[];
  all_pairs: SymbolAuditEntry[];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[11.4H.1] SYMBOL NORMALIZATION AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const kraken = new KrakenService();
  
  // Get all tradable pairs from Kraken
  console.log('\n--- FETCHING KRAKEN ASSET PAIRS ---');
  let allSymbols: string[] = [];
  try {
    const assetPairs = await kraken.getAssetPairs();
    allSymbols = Object.keys(assetPairs);
    console.log(`Fetched ${allSymbols.length} asset pairs from Kraken`);
  } catch (error) {
    console.warn('Failed to fetch Kraken pairs, using static map symbols');
    allSymbols = getAllInternalSymbols();
  }
  
  // Also include static map symbols
  const staticSymbols = getAllInternalSymbols();
  const combinedSymbols = [...new Set([...allSymbols, ...staticSymbols])];
  console.log(`Combined ${combinedSymbols.length} unique symbols for audit`);
  
  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4H Task 1',
    summary: {
      total_pairs: combinedSymbols.length,
      tier_0_count: 0,
      tier_1_count: 0,
      tier_2_count: 0,
      tier_3_count: 0,
      unmappable_count: 0,
      btc_xbt_correct: false,
      doge_xdg_correct: false,
      no_tier3_in_active: true,
    },
    btc_mapping_test: {
      input: 'XXBTZUSD',
      expected_internal: 'BTC/USD',
      actual_internal: '',
      expected_ws: 'XBT/USD',
      actual_ws: '',
      pass: false,
    },
    doge_mapping_test: {
      input: 'XDGUSD',
      expected_internal: 'DOGE/USD',
      actual_internal: '',
      expected_ws: 'XDG/USD',
      actual_ws: '',
      pass: false,
    },
    tier_3_symbols: [],
    unmappable_symbols: [],
    all_pairs: [],
  };
  
  // Test BTC/XBT mapping
  console.log('\n--- BTC/XBT MAPPING TEST ---');
  const btcDetails = getSymbolMappingDetails('XXBTZUSD');
  report.btc_mapping_test.actual_internal = btcDetails.internal;
  report.btc_mapping_test.actual_ws = btcDetails.ws_pair || '';
  report.btc_mapping_test.pass = 
    btcDetails.internal === 'BTC/USD' && 
    btcDetails.ws_pair === 'XBT/USD';
  report.summary.btc_xbt_correct = report.btc_mapping_test.pass;
  console.log(`  Input: ${report.btc_mapping_test.input}`);
  console.log(`  Internal: ${report.btc_mapping_test.actual_internal} (expected: ${report.btc_mapping_test.expected_internal})`);
  console.log(`  WS: ${report.btc_mapping_test.actual_ws} (expected: ${report.btc_mapping_test.expected_ws})`);
  console.log(`  Status: ${report.btc_mapping_test.pass ? '✓ PASS' : '✗ FAIL'}`);
  
  // Test DOGE/XDG mapping
  console.log('\n--- DOGE/XDG MAPPING TEST ---');
  const dogeDetails = getSymbolMappingDetails('XDGUSD');
  report.doge_mapping_test.actual_internal = dogeDetails.internal;
  report.doge_mapping_test.actual_ws = dogeDetails.ws_pair || '';
  report.doge_mapping_test.pass = 
    dogeDetails.internal === 'DOGE/USD' && 
    dogeDetails.ws_pair === 'XDG/USD';
  report.summary.doge_xdg_correct = report.doge_mapping_test.pass;
  console.log(`  Input: ${report.doge_mapping_test.input}`);
  console.log(`  Internal: ${report.doge_mapping_test.actual_internal} (expected: ${report.doge_mapping_test.expected_internal})`);
  console.log(`  WS: ${report.doge_mapping_test.actual_ws} (expected: ${report.doge_mapping_test.expected_ws})`);
  console.log(`  Status: ${report.doge_mapping_test.pass ? '✓ PASS' : '✗ FAIL'}`);
  
  // Audit all symbols
  console.log('\n--- AUDITING ALL SYMBOLS ---');
  for (const symbol of combinedSymbols) {
    const details = getSymbolMappingDetails(symbol);
    
    const entry: SymbolAuditEntry = {
      symbol,
      internal: details.internal,
      rest_pair: details.rest_pair,
      ws_pair: details.ws_pair,
      tier: details.tier,
      tier_reason: details.tier_reason,
      mappable: details.mappable,
      in_static_map: details.in_static_map,
      in_auto_map: details.in_auto_map,
      issues: [],
    };
    
    // Check for issues
    if (details.tier === 3) {
      entry.issues.push('Tier 3 (uncertain) - needs manual verification');
      report.tier_3_symbols.push(entry);
      report.summary.tier_3_count++;
      report.summary.no_tier3_in_active = false;
    } else if (details.tier === 2) {
      report.summary.tier_2_count++;
    } else if (details.tier === 1) {
      report.summary.tier_1_count++;
    } else if (details.tier === 0) {
      report.summary.tier_0_count++;
    }
    
    if (!details.mappable) {
      entry.issues.push(details.reason_if_unmappable || 'Unmappable');
      report.unmappable_symbols.push(entry);
      report.summary.unmappable_count++;
    }
    
    report.all_pairs.push(entry);
  }
  
  // Print summary
  console.log('\n--- AUDIT SUMMARY ---');
  console.log(`Total pairs: ${report.summary.total_pairs}`);
  console.log(`Tier 0 (static map): ${report.summary.tier_0_count}`);
  console.log(`Tier 1 (auto-verified): ${report.summary.tier_1_count}`);
  console.log(`Tier 2 (auto-derived): ${report.summary.tier_2_count}`);
  console.log(`Tier 3 (uncertain): ${report.summary.tier_3_count}`);
  console.log(`Unmappable: ${report.summary.unmappable_count}`);
  console.log(`BTC/XBT correct: ${report.summary.btc_xbt_correct ? '✓' : '✗'}`);
  console.log(`DOGE/XDG correct: ${report.summary.doge_xdg_correct ? '✓' : '✗'}`);
  console.log(`No Tier-3 in active: ${report.summary.no_tier3_in_active ? '✓' : '✗'}`);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'audit', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'symbol_normalization_audit.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4H.1] Report saved to ${reportPath}`);
  
  console.log('\n[11.4H.1] Symbol normalization audit complete.');
}

main().catch(console.error);
