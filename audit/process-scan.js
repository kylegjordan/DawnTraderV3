const fs = require('fs');

const scanLines = fs.readFileSync('/tmp/grep-scan.txt', 'utf8').split('\n');
const currentFields = [
  'portfolioRiskPerTradePct', 'dailyLossKillSwitchPct', 'symbolCooldownMinutes', 'maxOpenPositions',
  'minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'minMarketCap', 'maxBidAskSpread',
  'rsiMin', 'rsiMax', 'volatilityMin', 'volatilityMax', 'excludeStablecoins', 'allowRegulatedOnly',
  'universeSize', 'quoteCurrencies', 'activeTimeframes', 'confidenceThreshold',
  'targetDailyAvgEarningPct', 'tradesPerDayEst'
];

const legacyFields = [
  'maxDailyLoss', 'maxDrawdown', 'riskPerTrade', 'avgVolumeRatio', 'atrThreshold',
  'earningsBlackout', 'priceDeltaTrigger', 'dailyLossKillSwitch', 'risk_per_trade'
];

const results = {
  current: {},
  legacy: {},
  summary: { currentCount: 0, legacyCount: 0, totalFiles: new Set(), criticalFiles: [] }
};

// Process each line
scanLines.forEach(line => {
  if (!line.trim()) return;
  
  const parts = line.split(':');
  if (parts.length < 2) return;
  
  const file = parts[0];
  const lineNum = parts[1];
  const content = parts.slice(2).join(':');
  
  // Skip test files and training docs for conciseness
  if (file.includes('/test-') || file.includes('/docs/training/')) return;
  
  results.summary.totalFiles.add(file);
  
  // Check for current fields
  let isCurrent = false;
  currentFields.forEach(field => {
    if (content.toLowerCase().includes(field.toLowerCase())) {
      isCurrent = true;
      if (!results.current[field]) results.current[field] = [];
      results.current[field].push({ file, line: lineNum, snippet: content.substring(0, 120) });
      results.summary.currentCount++;
    }
  });
  
  // Check for legacy fields
  legacyFields.forEach(field => {
    if (content.toLowerCase().includes(field.toLowerCase())) {
      if (!results.legacy[field]) results.legacy[field] = [];
      results.legacy[field].push({ file, line: lineNum, snippet: content.substring(0, 120) });
      results.summary.legacyCount++;
      
      // Mark critical files (non-test files with legacy field usage)
      if (!file.includes('test') && !file.includes('docs/')) {
        results.summary.criticalFiles.push({ file, field, line: lineNum });
      }
    }
  });
});

fs.writeFileSync('audit/scan-results.json', JSON.stringify(results, null, 2));

// Generate markdown report
let md = `# Phase 27.G.Audit - Field Reference Scan Report

Generated: ${new Date().toISOString()}
Total files scanned: ${results.summary.totalFiles.size}
Current field references: ${results.summary.currentCount}
Legacy field references: ${results.summary.legacyCount}

## Critical Findings - Legacy Field Usage in Production Code

${results.summary.criticalFiles.length === 0 ? '✅ No critical legacy field usage found in production code!' : ''}

${results.summary.criticalFiles.slice(0, 20).map(item => 
  `- \`${item.file}:${item.line}\` - Legacy field: \`${item.field}\``
).join('\n')}

## Current Fields Usage Summary

${Object.entries(results.current).map(([field, refs]) => {
  const uniqueFiles = [...new Set(refs.map(r => r.file))];
  return `### ${field} (${refs.length} references in ${uniqueFiles.length} files)
${uniqueFiles.slice(0, 5).map(f => `- ${f}`).join('\n')}
${uniqueFiles.length > 5 ? `... and ${uniqueFiles.length - 5} more files` : ''}
`;
}).join('\n')}

## Legacy Fields Found

${Object.entries(results.legacy).map(([field, refs]) => {
  const uniqueFiles = [...new Set(refs.map(r => r.file))];
  return `### ${field} (${refs.length} references in ${uniqueFiles.length} files)
⚠️ DEPRECATED - Should be migrated or removed

${uniqueFiles.slice(0, 10).map(f => `- ${f}`).join('\n')}
`;
}).join('\n')}
`;

fs.writeFileSync('audit/scan.log', md);
console.log('✅ Scan processed successfully');
console.log(`Current fields: ${results.summary.currentCount} references`);
console.log(`Legacy fields: ${results.summary.legacyCount} references`);
console.log(`Critical legacy usage: ${results.summary.criticalFiles.length} occurrences`);
