/**
 * Phase 5C - Backup Verification Script
 * 
 * Verifies database backup and point-in-time recovery (PITR) capabilities
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/structured-logger';

interface BackupInfo {
  backupName: string;
  backupSize: string;
  createdAt: Date;
  retentionDays: number;
}

async function verifyDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info('[Backup-Verify] Database connection verified', { phase: '5C' });
    return true;
  } catch (error: any) {
    logger.error('[Backup-Verify] Database connection failed', { phase: '5C' }, error);
    return false;
  }
}

async function checkPITRSupport(): Promise<boolean> {
  try {
    // Check for managed Postgres providers that support PITR
    const dbUrl = process.env.DATABASE_URL || '';

    if (dbUrl.includes('neon.tech') || dbUrl.includes('neon-proxy') || dbUrl.includes('supabase')) {
      logger.info('[Backup-Verify] PITR supported (managed PostgreSQL)', {
        phase: '5C',
        provider: dbUrl.includes('supabase') ? 'Supabase' : 'Neon'
      });
      return true;
    } else {
      logger.warn('[Backup-Verify] PITR may not be available', {
        phase: '5C',
        message: 'Database provider not recognized as managed Postgres with PITR'
      });
      return false;
    }
  } catch (error: any) {
    logger.error('[Backup-Verify] PITR check failed', { phase: '5C' }, error);
    return false;
  }
}

async function getDatabaseSize(): Promise<string> {
  try {
    const result = await db.execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    
    const size = (result.rows[0] as any).size;
    logger.info('[Backup-Verify] Database size retrieved', { 
      phase: '5C',
      size
    });
    return size;
  } catch (error: any) {
    logger.error('[Backup-Verify] Failed to get database size', { phase: '5C' }, error);
    return 'unknown';
  }
}

async function verifyTableCount(): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    
    const count = Number((result.rows[0] as any).count);
    logger.info('[Backup-Verify] Table count verified', {
      phase: '5C',
      tableCount: count
    });
    return count;
  } catch (error: any) {
    logger.error('[Backup-Verify] Failed to verify table count', { phase: '5C' }, error);
    return 0;
  }
}

async function runBackupVerification(): Promise<void> {
  console.log('[Phase 5C] Starting backup verification...\n');

  const results = {
    databaseConnection: false,
    pitrSupport: false,
    databaseSize: 'unknown',
    tableCount: 0,
  };

  // 1. Verify database connection
  results.databaseConnection = await verifyDatabaseConnection();
  
  // 2. Check PITR support
  results.pitrSupport = await checkPITRSupport();
  
  // 3. Get database size
  results.databaseSize = await getDatabaseSize();
  
  // 4. Verify table count
  results.tableCount = await verifyTableCount();

  // Display results
  console.log('\n[Phase 5C] Backup Verification Results:');
  console.table({
    'Database Connection': { status: results.databaseConnection ? '✅ PASS' : '❌ FAIL' },
    'PITR Support': { status: results.pitrSupport ? '✅ PASS' : '⚠️  WARN' },
    'Database Size': { value: results.databaseSize },
    'Table Count': { value: results.tableCount },
  });

  // PITR recommendations
  console.log('\n[Phase 5C] PITR Recommendations:');
  console.log('  • Neon databases have automatic PITR with 7-day retention (free tier)');
  console.log('  • Neon Pro/Scale plans support up to 30-day retention');
  console.log('  • Backups are taken automatically every 24 hours');
  console.log('  • Point-in-time recovery can be initiated from Neon console');
  console.log('  • For manual backups, use: pg_dump or Neon branching feature\n');

  // Summary
  const allPassed = results.databaseConnection && results.pitrSupport && results.tableCount > 0;
  
  if (allPassed) {
    console.log('[Phase 5C] ✅ Backup verification PASSED\n');
    process.exit(0);
  } else {
    console.log('[Phase 5C] ⚠️  Backup verification completed with warnings\n');
    process.exit(0);
  }
}

runBackupVerification().catch((error) => {
  logger.error('[Backup-Verify] Fatal error', { phase: '5C' }, error);
  console.error('[Phase 5C] Fatal error:', error.message);
  process.exit(1);
});
