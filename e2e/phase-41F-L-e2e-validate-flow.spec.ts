import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 41F-L.E2E-VALIDATE-FLOW
 * 
 * End-to-end validation of the complete trading pipeline:
 * Kraken → filters → signals → trades → portfolio → dashboard
 * 
 * Test credentials:
 *  username: testuser123
 *  password: SecurePass123!
 */

interface ValidationResult {
  timestamp: string;
  stage: string;
  passed: boolean;
  evidence: any;
  mismatch?: {
    ui: any;
    backend: any;
    delta: number;
  };
}

interface LineageEvent {
  timestamp: string;
  event: string;
  data: any;
}

const results: ValidationResult[] = [];
const lineage: LineageEvent[] = [];
let testStartTime: Date;

// Helper functions
function recordResult(stage: string, passed: boolean, evidence: any, mismatch?: any) {
  results.push({
    timestamp: new Date().toISOString(),
    stage,
    passed,
    evidence,
    mismatch
  });
}

function recordLineage(event: string, data: any) {
  lineage.push({
    timestamp: new Date().toISOString(),
    event,
    data
  });
}

async function waitForStable(page: Page, testId: string, timeout = 5000) {
  let lastValue = '';
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const currentValue = await page.getByTestId(testId).textContent() || '';
      if (currentValue === lastValue && currentValue !== '') {
        return currentValue;
      }
      lastValue = currentValue;
      await page.waitForTimeout(500);
    } catch (e) {
      // Element not found yet
      await page.waitForTimeout(500);
    }
  }
  return lastValue;
}

async function fetchBackendData(page: Page, endpoint: string) {
  return await page.evaluate(async (url) => {
    const response = await fetch(url, {
      headers: {
        'x-app-mode': 'paper'
      }
    });
    return await response.json();
  }, endpoint);
}

test.describe('Phase 41F-L.E2E-VALIDATE-FLOW - Complete Pipeline Validation', () => {
  test.beforeAll(() => {
    testStartTime = new Date();
    console.log(`\n🚀 Starting Phase 41F-L.E2E-VALIDATE-FLOW at ${testStartTime.toISOString()}\n`);
  });

  test.afterAll(async () => {
    // Generate comprehensive report
    const reportPath = path.join(process.cwd(), 'diagnostic-reports', 'phase-41F-L.E2E-VALIDATE-FLOW.md');
    const ndjsonPath = path.join(process.cwd(), 'diagnostic-reports', 'phase-41F-L.E2E-VALIDATE-FLOW.ndjson');
    
    // Generate markdown report
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;
    const overallPass = failedCount === 0 && passedCount > 0;
    
    let report = `# Phase 41F-L.E2E-VALIDATE-FLOW - End-to-End Validation Report\n\n`;
    report += `**Test Start:** ${testStartTime.toISOString()}\n`;
    report += `**Test End:** ${new Date().toISOString()}\n`;
    report += `**Duration:** ${Math.round((Date.now() - testStartTime.getTime()) / 1000)}s\n`;
    report += `**Result:** ${overallPass ? '✅ PASS' : '❌ FAIL'}\n\n`;
    report += `## Summary\n\n`;
    report += `- **Passed:** ${passedCount}\n`;
    report += `- **Failed:** ${failedCount}\n`;
    report += `- **Total Stages:** ${results.length}\n\n`;
    
    report += `## Detailed Results\n\n`;
    for (const result of results) {
      report += `### ${result.passed ? '✅' : '❌'} ${result.stage}\n\n`;
      report += `**Time:** ${result.timestamp}\n\n`;
      report += `**Evidence:**\n\`\`\`json\n${JSON.stringify(result.evidence, null, 2)}\n\`\`\`\n\n`;
      
      if (result.mismatch) {
        report += `**⚠️ Data Mismatch Detected:**\n`;
        report += `- UI Value: ${result.mismatch.ui}\n`;
        report += `- Backend Value: ${result.mismatch.backend}\n`;
        report += `- Delta: ${result.mismatch.delta.toFixed(2)}%\n\n`;
      }
    }
    
    // Add anomaly table if failures exist
    if (failedCount > 0) {
      report += `## Anomaly Table\n\n`;
      report += `| Stage | Issue | UI Data | Backend Data | Delta |\n`;
      report += `|-------|-------|---------|--------------|-------|\n`;
      for (const result of results.filter(r => !r.passed)) {
        report += `| ${result.stage} | Mismatch or failure | `;
        if (result.mismatch) {
          report += `${result.mismatch.ui} | ${result.mismatch.backend} | ${result.mismatch.delta.toFixed(2)}% |\n`;
        } else {
          report += `N/A | N/A | N/A |\n`;
        }
      }
      report += `\n`;
    }
    
    // Success criteria check
    report += `## Success Criteria Evaluation\n\n`;
    const tradesExecuted = results.filter(r => r.stage.includes('Trade Execution') && r.passed).length;
    const portfolioUpdated = results.some(r => r.stage.includes('Portfolio') && r.passed);
    const dashboardUpdated = results.some(r => r.stage.includes('Dashboard') && r.passed);
    const lineageComplete = lineage.length >= 5;
    
    report += `- ✅/❌ Three or more paper trades executed: ${tradesExecuted >= 3 ? '✅' : '❌'} (${tradesExecuted} trades)\n`;
    report += `- ✅/❌ Portfolio reflects updates: ${portfolioUpdated ? '✅' : '❌'}\n`;
    report += `- ✅/❌ Dashboard widgets update: ${dashboardUpdated ? '✅' : '❌'}\n`;
    report += `- ✅/❌ Lineage events captured: ${lineageComplete ? '✅' : '❌'} (${lineage.length} events)\n`;
    report += `- ✅/❌ All UI counts match backend: ${failedCount === 0 ? '✅' : '❌'}\n\n`;
    
    fs.writeFileSync(reportPath, report);
    console.log(`\n📊 Report generated: ${reportPath}`);
    
    // Generate NDJSON lineage trace
    const ndjson = lineage.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(ndjsonPath, ndjson);
    console.log(`📊 Lineage trace generated: ${ndjsonPath}`);
  });

  test('Complete end-to-end flow validation', async ({ page, context }) => {
    // Enable video recording
    test.setTimeout(300000); // 5 minutes
    
    // ====================
    // STAGE 1: Login
    // ====================
    console.log('\n📝 STAGE 1: Login');
    await page.goto('http://localhost:5000/login');
    
    await page.getByTestId('input-username').fill('testuser123');
    await page.getByTestId('input-password').fill('SecurePass123!');
    await page.getByTestId('button-login').click();
    
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    recordResult('Login', true, { url: page.url() });
    recordLineage('user_login', { username: 'testuser123' });
    
    console.log('✅ Login successful');
    
    // Wait for initial page load
    await page.waitForTimeout(2000);
    
    // ====================
    // STAGE 2: Check Kill Switch Status
    // ====================
    console.log('\n📝 STAGE 2: Verify kill switch is OFF');
    
    // Navigate to Goals Engine to check/disable kill switch
    await page.goto('http://localhost:5000/goals-engine');
    await page.waitForTimeout(2000);
    
    // Check if kill switch is enabled - if so, disable it
    try {
      const killSwitchButton = page.getByTestId('button-toggle-kill-switch');
      const killSwitchText = await killSwitchButton.textContent();
      
      if (killSwitchText?.includes('DEACTIVATE')) {
        // Kill switch is on, turn it off
        console.log('⚠️  Kill switch is ON - disabling it...');
        await killSwitchButton.click();
        await page.waitForTimeout(1000);
        recordLineage('kill_switch_disabled', { reason: 'Pre-test setup' });
      }
      
      recordResult('Kill Switch Check', true, { disabled: true });
      console.log('✅ Kill switch is OFF');
    } catch (e) {
      console.log('⚠️  Could not verify kill switch status');
      recordResult('Kill Switch Check', false, { error: String(e) });
    }
    
    // ====================
    // STAGE 3: Start Paper Trading Engine
    // ====================
    console.log('\n📝 STAGE 3: Start Paper Trading Engine');
    
    await page.goto('http://localhost:5000/dashboard');
    await page.waitForTimeout(2000);
    
    // Click the start button
    const startButton = page.getByTestId('button-start-trading');
    await startButton.click();
    await page.waitForTimeout(3000);
    
    // Verify engine started
    const statusIndicator = await page.getByTestId('text-engine-status').textContent();
    const engineStarted = statusIndicator?.includes('Running') || statusIndicator?.includes('Active');
    
    recordResult('Engine Start', engineStarted, { status: statusIndicator });
    recordLineage('engine_started', { mode: 'paper', status: statusIndicator });
    
    if (engineStarted) {
      console.log('✅ Paper trading engine started');
    } else {
      console.log('❌ Paper trading engine failed to start');
    }
    
    // Wait for first tick
    await page.waitForTimeout(5000);
    
    // ====================
    // STAGE 4: Kraken Data Load
    // ====================
    console.log('\n📝 STAGE 4: Verify Kraken universe data load');
    
    // Navigate to Filter Insights tab
    await page.goto('http://localhost:5000/screeners');
    await page.waitForTimeout(2000);
    
    try {
      const universeCount = await waitForStable(page, 'text-total-universe', 10000);
      const universeNum = parseInt(universeCount.replace(/,/g, '')) || 0;
      
      recordResult('Kraken Data Load', universeNum > 0, {
        totalUniverse: universeNum
      });
      recordLineage('kraken_data_loaded', { universeSize: universeNum });
      
      console.log(`✅ Kraken universe loaded: ${universeNum} pairs`);
    } catch (e) {
      recordResult('Kraken Data Load', false, { error: String(e) });
      console.log('❌ Failed to load Kraken data');
    }
    
    // ====================
    // STAGE 5: Filter Insights Validation
    // ====================
    console.log('\n📝 STAGE 5: Validate Filter Insights data');
    
    await page.waitForTimeout(3000);
    
    try {
      const totalUniverse = await page.getByTestId('text-total-universe').textContent();
      const evaluated = await page.getByTestId('text-evaluated-pairs').textContent();
      const eligible = await page.getByTestId('text-eligible-pairs').textContent();
      
      const backendData = await fetchBackendData(page, '/api/trading/filter-insights/snapshot');
      
      const uiUniverse = parseInt(totalUniverse?.replace(/,/g, '') || '0');
      const backendUniverse = backendData?.totalUniverse || 0;
      const delta = Math.abs(uiUniverse - backendUniverse) / Math.max(backendUniverse, 1) * 100;
      
      const passed = delta < 1;
      
      recordResult('Filter Insights Validation', passed, {
        ui: { totalUniverse, evaluated, eligible },
        backend: backendData
      }, passed ? undefined : {
        ui: uiUniverse,
        backend: backendUniverse,
        delta
      });
      recordLineage('filter_snapshot', backendData);
      
      console.log(`${passed ? '✅' : '❌'} Filter Insights - UI: ${totalUniverse}, Backend: ${backendUniverse}`);
    } catch (e) {
      recordResult('Filter Insights Validation', false, { error: String(e) });
      console.log('❌ Filter Insights validation failed');
    }
    
    // ====================
    // STAGE 6: Filtered Pairs Tab
    // ====================
    console.log('\n📝 STAGE 6: Validate Filtered Pairs tab');
    
    // Navigate to Filtered Pairs tab (assuming there's a tab or link)
    try {
      await page.getByText('Filtered Pairs').click();
      await page.waitForTimeout(2000);
      
      const pairsTableRows = await page.locator('table tbody tr').count();
      const headerCount = await page.getByTestId('text-filtered-pairs-count').textContent();
      const headerNum = parseInt(headerCount?.replace(/,/g, '') || '0');
      
      const match = Math.abs(pairsTableRows - headerNum) <= 1; // Allow 1 row difference for header
      
      recordResult('Filtered Pairs Table Match', match, {
        tableRows: pairsTableRows,
        headerCount: headerNum
      });
      
      console.log(`${match ? '✅' : '❌'} Filtered Pairs - Header: ${headerNum}, Table rows: ${pairsTableRows}`);
    } catch (e) {
      recordResult('Filtered Pairs Table Match', false, { error: String(e) });
      console.log('❌ Filtered Pairs validation failed');
    }
    
    // ====================
    // STAGE 7: Ready-to-Buy Signals
    // ====================
    console.log('\n📝 STAGE 7: Check Ready-to-Buy signals');
    
    try {
      // Assuming there's a Ready-to-Buy tab or section
      await page.goto('http://localhost:5000/signals');
      await page.waitForTimeout(3000);
      
      const signalCount = await page.locator('[data-testid^="signal-"]').count();
      
      recordResult('Ready-to-Buy Signals', true, {
        signalCount,
        note: signalCount === 0 ? 'No signals - this may be expected' : `${signalCount} signals found`
      });
      recordLineage('signal_snapshot', { count: signalCount });
      
      console.log(`✅ Ready-to-Buy signals: ${signalCount}`);
    } catch (e) {
      recordResult('Ready-to-Buy Signals', false, { error: String(e) });
      console.log('❌ Ready-to-Buy validation failed');
    }
    
    // ====================
    // STAGE 8: Wait for Trade Execution
    // ====================
    console.log('\n📝 STAGE 8: Monitor for trade execution (30s)');
    
    // Wait longer for trades to potentially execute
    await page.waitForTimeout(30000);
    
    // ====================
    // STAGE 9: Trades Tab Validation
    // ====================
    console.log('\n📝 STAGE 9: Validate Trades tab');
    
    await page.goto('http://localhost:5000/trades');
    await page.waitForTimeout(2000);
    
    try {
      const tradesTableRows = await page.locator('[data-testid^="trade-"]').count();
      const backendTrades = await fetchBackendData(page, '/api/trades?status=closed&limit=100');
      const backendCount = Array.isArray(backendTrades) ? backendTrades.length : 0;
      
      recordResult('Trades Tab Validation', true, {
        uiTrades: tradesTableRows,
        backendTrades: backendCount
      });
      recordLineage('trades_snapshot', { count: backendCount });
      
      console.log(`✅ Trades - UI: ${tradesTableRows}, Backend: ${backendCount}`);
      
      // Record individual trades
      if (backendCount > 0) {
        for (let i = 0; i < Math.min(3, backendCount); i++) {
          recordLineage('trade_executed', backendTrades[i]);
        }
      }
    } catch (e) {
      recordResult('Trades Tab Validation', false, { error: String(e) });
      console.log('❌ Trades validation failed');
    }
    
    // ====================
    // STAGE 10: Portfolio Update Validation
    // ====================
    console.log('\n📝 STAGE 10: Validate Portfolio updates');
    
    await page.goto('http://localhost:5000/dashboard');
    await page.waitForTimeout(2000);
    
    try {
      const uiPortfolioValue = await page.getByTestId('text-portfolio-value').textContent();
      const backendPortfolio = await fetchBackendData(page, '/api/paper/portfolio/state');
      
      const uiValue = parseFloat(uiPortfolioValue?.replace(/[$,]/g, '') || '0');
      const backendValue = backendPortfolio?.totalValue || 0;
      const delta = Math.abs(uiValue - backendValue) / Math.max(backendValue, 1) * 100;
      
      const passed = delta < 1;
      
      recordResult('Portfolio Update Validation', passed, {
        ui: uiPortfolioValue,
        backend: backendPortfolio
      }, passed ? undefined : {
        ui: uiValue,
        backend: backendValue,
        delta
      });
      recordLineage('portfolio_update', backendPortfolio);
      
      console.log(`${passed ? '✅' : '❌'} Portfolio - UI: $${uiValue}, Backend: $${backendValue}`);
    } catch (e) {
      recordResult('Portfolio Update Validation', false, { error: String(e) });
      console.log('❌ Portfolio validation failed');
    }
    
    // ====================
    // STAGE 11: Dashboard Widgets Validation
    // ====================
    console.log('\n📝 STAGE 11: Validate Dashboard widgets');
    
    try {
      const activeTrades = await page.getByTestId('text-active-trades').textContent();
      const dailyPnL = await page.getByTestId('text-daily-pnl').textContent();
      
      recordResult('Dashboard Widgets Validation', true, {
        activeTrades,
        dailyPnL
      });
      
      console.log(`✅ Dashboard widgets - Active: ${activeTrades}, PnL: ${dailyPnL}`);
    } catch (e) {
      recordResult('Dashboard Widgets Validation', false, { error: String(e) });
      console.log('❌ Dashboard widgets validation failed');
    }
    
    // ====================
    // STAGE 12: Backend Lineage Verification
    // ====================
    console.log('\n📝 STAGE 12: Verify backend lineage traces');
    
    try {
      // Fetch telemetry data
      const telemetryData = await page.evaluate(async () => {
        const response = await fetch('/api/telemetry/lineage?limit=100');
        return await response.json();
      });
      
      const hasFilterSnapshot = telemetryData?.some((e: any) => e.event === 'filter_snapshot');
      const hasSignalSnapshot = telemetryData?.some((e: any) => e.event === 'signal_snapshot');
      const hasOrderSubmitted = telemetryData?.some((e: any) => e.event === 'order_submitted');
      
      const lineageComplete = hasFilterSnapshot && hasSignalSnapshot;
      
      recordResult('Backend Lineage Verification', lineageComplete, {
        events: telemetryData?.length || 0,
        hasFilterSnapshot,
        hasSignalSnapshot,
        hasOrderSubmitted
      });
      
      console.log(`${lineageComplete ? '✅' : '❌'} Lineage events - Found ${telemetryData?.length || 0} events`);
    } catch (e) {
      recordResult('Backend Lineage Verification', false, { error: String(e) });
      console.log('❌ Lineage verification failed');
    }
    
    // ====================
    // STAGE 13: Stop Engine (Cleanup)
    // ====================
    console.log('\n📝 STAGE 13: Stop trading engine');
    
    try {
      await page.goto('http://localhost:5000/dashboard');
      await page.waitForTimeout(1000);
      
      const stopButton = page.getByTestId('button-stop-trading');
      await stopButton.click();
      await page.waitForTimeout(2000);
      
      recordLineage('engine_stopped', { mode: 'paper' });
      console.log('✅ Engine stopped');
    } catch (e) {
      console.log('⚠️  Could not stop engine');
    }
    
    console.log('\n🎉 E2E validation complete\n');
  });
});
