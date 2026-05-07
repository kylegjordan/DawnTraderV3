/**
 * Generate Kraken API Documentation
 * Run with: npx tsx server/scripts/generate-kraken-docs.ts
 */

import { KrakenDataDocumenter } from '../exchanges/kraken/kraken-data-documenter.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting Kraken API Documentation Generation...\n');
  
  const documenter = new KrakenDataDocumenter();
  const report = await documenter.generateReport();
  
  // Append to replit.md
  const replitMdPath = path.join(process.cwd(), 'replit.md');
  
  const timestamp = new Date().toISOString();
  const section = `\n\n---\n\n# Kraken API & Filter Documentation\n*Generated: ${timestamp}*\n\n${report}\n`;
  
  fs.appendFileSync(replitMdPath, section);
  
  console.log('\n✅ Documentation appended to replit.md');
  console.log('📄 Report length:', section.length, 'characters');
}

main().catch(console.error);
