import { KrakenDataDocumenter } from './server/services/kraken-data-documenter.js';
import { writeFileSync } from 'fs';

async function main() {
  console.log('Generating Kraken API documentation...');
  
  const documenter = new KrakenDataDocumenter();
  const report = await documenter.generateReport();
  
  // Write to a markdown file
  const timestamp = new Date().toISOString();
  const content = `# Kraken API & Filter Documentation\n*Generated: ${timestamp}*\n\n${report}`;
  
  writeFileSync('KRAKEN-API-DOCUMENTATION.md', content);
  
  console.log('✅ Documentation saved to: KRAKEN-API-DOCUMENTATION.md');
  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
