/**
 * Test script to show exactly what dashboard context Walter sees
 */
import { walterDataPipeline } from './server/services/walter-data-pipeline';

const TEST_USER_ID = 'ce50e56b-0208-4fca-9c14-2777db4104b7'; // Test user from environment

async function testWalterContext() {
  console.log('===============================================');
  console.log('WALTER DASHBOARD CONTEXT TEST');
  console.log('===============================================\n');

  try {
    console.log('📊 Fetching PAPER MODE dashboard context...\n');
    const paperContext = await walterDataPipeline.getDashboardData(TEST_USER_ID, 'paper');
    console.log('PAPER MODE CONTEXT:');
    console.log('-------------------');
    console.log(paperContext);
    console.log('\n');

    console.log('📊 Fetching LIVE MODE dashboard context...\n');
    const liveContext = await walterDataPipeline.getDashboardData(TEST_USER_ID, 'live');
    console.log('LIVE MODE CONTEXT:');
    console.log('-------------------');
    console.log(liveContext);
    console.log('\n');

    // Extract just the goals section
    const paperGoals = paperContext.split('\n').filter(line => 
      line.includes('GOALS STATUS') || line.includes('Goal $') || line.includes('No goals set')
    );
    
    const liveGoals = liveContext.split('\n').filter(line => 
      line.includes('GOALS STATUS') || line.includes('Goal $') || line.includes('No goals set')
    );

    console.log('===============================================');
    console.log('GOALS SECTIONS ONLY');
    console.log('===============================================\n');
    
    console.log('PAPER MODE GOALS:');
    paperGoals.forEach(line => console.log(line));
    console.log('\n');
    
    console.log('LIVE MODE GOALS:');
    liveGoals.forEach(line => console.log(line));
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testWalterContext();
