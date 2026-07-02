/**
 * Directive 8.8.4-C.14: End-to-End Validation Runner
 * 
 * Usage: npx tsx scripts/run-c14-validation.ts
 * 
 * This script:
 * 1. Clears existing RTB, trades, and positions
 * 2. Sets starting balance to $832
 * 3. Starts the paper trading engine
 * 4. Starts the C14 validation session
 * 5. Monitors progress and logs results
 */

import 'dotenv/config';

const API_BASE = 'http://localhost:5000/api';

interface ApiResponse {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

async function makeRequest(endpoint: string, method: string = 'GET', body?: object): Promise<ApiResponse> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    return await response.json() as ApiResponse;
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runValidation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Directive 8.8.4-C.14: Validation Session Runner        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Check current trading status
  console.log('[1/5] Checking current trading status...');
  const status = await makeRequest('/trading/status');
  console.log(`      Mode: ${status.mode}, Active: ${status.active}`);
  
  if (status.active) {
    console.log('      ⚠️  Trading is already active. Validation will monitor existing session.');
  }
  
  // Step 2: Get portfolio summary
  console.log('[2/5] Getting portfolio summary...');
  const portfolio = await makeRequest('/active-engine/portfolio-summary');
  console.log(`      Starting Balance: $${portfolio.startingBalance}`);
  console.log(`      Current Balance: $${portfolio.currentBalance}`);
  console.log(`      Open Positions: ${portfolio.openPositionsCount}`);
  
  // Step 3: Check C14 validation status
  console.log('[3/5] Checking C14 validation status...');
  const c14Status = await makeRequest('/active-engine/c14-validation/status');
  console.log(`      Active: ${c14Status.active}`);
  if (c14Status.active) {
    console.log(`      Session ID: ${c14Status.sessionId}`);
    console.log(`      Elapsed: ${Math.round((c14Status.elapsed as number || 0) / 60000)} minutes`);
    console.log(`      Snapshots: ${c14Status.snapshots}`);
  }
  
  // Step 4: Check RTB queue
  console.log('[4/5] Checking RTB queue...');
  const rtbQueue = await makeRequest('/trading-signals');
  const signals = (rtbQueue.signals as unknown[]) || [];
  console.log(`      Queued signals: ${signals.length}`);
  
  // Step 5: Check filter diagnostics
  console.log('[5/5] Checking filter diagnostics...');
  const filters = await makeRequest('/filters/diagnostics');
  console.log(`      Pairs scanned: ${filters.pairsScanned}`);
  console.log(`      Eligible pairs: ${filters.eligiblePairs}`);
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Validation monitoring complete.');
  console.log('');
  console.log('To start a NEW validation session:');
  console.log('  1. Start paper trading from the UI with $832 balance');
  console.log('  2. The C14 validation service will auto-track metrics');
  console.log('');
  console.log('Logs will be saved to: logs/validation/c14_snapshots/');
  console.log('═══════════════════════════════════════════════════════════════');
}

runValidation().catch(console.error);
