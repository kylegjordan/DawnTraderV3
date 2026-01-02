const fs = require('fs');

// Load data
const slalData = JSON.parse(fs.readFileSync('logs/diagnostics/slal_dump.json', 'utf8'));
const activeTradesData = JSON.parse(fs.readFileSync('logs/diagnostics/active_trades.json', 'utf8'));
const tradeHistoryData = JSON.parse(fs.readFileSync('logs/diagnostics/trade_history.json', 'utf8'));

// Extract arrays from nested structure
const activeTrades = activeTradesData.positions || [];
const closedTrades = tradeHistoryData.trades || [];
const allTrades = [...activeTrades, ...closedTrades];

// Extract SLAL journeys
const slalJourneys = slalData.recentJourneys || [];

// Extract SLAL events from journeys
const allEvents = slalJourneys.flatMap(j => j.events || []);
const executionEvents = allEvents.filter(e => e.stage === 'EXECUTION' && e.success);
const completedEvents = allEvents.filter(e => e.stage === 'COMPLETED');

// Build correlation
const report = {
  sessionTimestamp: new Date().toISOString(),
  
  // SLAL Metrics Summary
  slalSummary: {
    totalJourneys: slalJourneys.length,
    completedJourneys: slalJourneys.filter(j => j.finalStage === 'COMPLETED').length,
    rejectedJourneys: slalJourneys.filter(j => !j.success).length,
    executionEvents: executionEvents.length,
    completedEvents: completedEvents.length,
  },
  
  // Trade Counts
  tradeCounts: {
    activeTrades: activeTrades.length,
    closedTrades: closedTrades.length,
    totalTrades: allTrades.length,
  },
  
  // SLAL Metrics from API
  slalMetrics: slalData.metrics,
  
  // Correlation Analysis
  correlation: {
    slalExecuted: slalData.metrics?.signalsExecuted || 0,
    slalCompleted: slalData.metrics?.signalsCompleted || 0,
    actualOpenTrades: activeTrades.length,
    actualClosedTrades: closedTrades.length,
    actualTotalTrades: allTrades.length,
    
    // Key correlation check
    executedVsCompleted: {
      match: (slalData.metrics?.signalsExecuted || 0) === (slalData.metrics?.signalsCompleted || 0),
      difference: (slalData.metrics?.signalsExecuted || 0) - (slalData.metrics?.signalsCompleted || 0),
    },
  },
  
  // Strategy Breakdown
  strategyBreakdown: slalData.metrics?.strategyBreakdown || {},
  
  // Rejection Analysis  
  rejectionsByReason: slalData.metrics?.rejectionsByReason || {},
  rejectionsByStage: slalData.metrics?.rejectionsByStage || {},
  
  // Active Trade Details
  activeTradeDetails: activeTrades.map(t => ({
    id: t.id,
    symbol: t.symbol,
    strategy: t.strategy,
    entryTime: t.entryTime,
    entryPrice: t.entryPrice,
  })),
  
  // Portfolio Summary
  portfolioSummary: activeTradesData.portfolio || {},
  
  // Sample Completed Journeys
  sampleCompletedJourneys: slalJourneys
    .filter(j => j.finalStage === 'COMPLETED')
    .slice(0, 10)
    .map(j => ({
      signalId: j.signalId,
      symbol: j.symbol,
      strategy: j.strategy,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      totalDurationMs: j.totalDurationMs,
    })),
};

// Write report
fs.writeFileSync('logs/diagnostics/slal_trade_correlation.json', JSON.stringify(report, null, 2));
console.log('Correlation report generated successfully!');
console.log('\n=== CORRELATION SUMMARY ===');
console.log(JSON.stringify(report.correlation, null, 2));
console.log('\n=== SLAL SUMMARY ===');
console.log(JSON.stringify(report.slalSummary, null, 2));
console.log('\n=== TRADE COUNTS ===');
console.log(JSON.stringify(report.tradeCounts, null, 2));
