/**
 * Phase 27.F.12.b - Symbol Canonicalization Migration
 * 
 * One-time migration to convert existing whitelist/blacklist arrays to BASE/QUOTE format
 */

import { storage } from '../storage.js';
import { normalizeSymbolArray } from '../services/utils/symbol-canonicalizer.js';

async function migrateSymbolCanonicalization() {
  console.log('\n========================================');
  console.log('Symbol Canonicalization Migration');
  console.log('========================================\n');

  try {
    // Get all trading settings
    const allSettings = await storage.db
      .select()
      .from(storage.schema.tradingSettings);

    console.log(`Found ${allSettings.length} trading settings records\n`);

    let updatedCount = 0;
    const auditLog: Array<{ userId: string; field: string; before: string[]; after: string[] }> = [];

    for (const settings of allSettings) {
      let needsUpdate = false;
      const updates: any = {};

      // Normalize whitelisted symbols
      if (settings.whitelistedSymbols && Array.isArray(settings.whitelistedSymbols)) {
        const before = settings.whitelistedSymbols as string[];
        const after = normalizeSymbolArray(before);
        
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          updates.whitelistedSymbols = after;
          needsUpdate = true;
          auditLog.push({
            userId: settings.userId || 'unknown',
            field: 'whitelistedSymbols',
            before,
            after
          });
        }
      }

      // Normalize blacklisted symbols
      if (settings.blacklistedSymbols && Array.isArray(settings.blacklistedSymbols)) {
        const before = settings.blacklistedSymbols as string[];
        const after = normalizeSymbolArray(before);
        
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          updates.blacklistedSymbols = after;
          needsUpdate = true;
          auditLog.push({
            userId: settings.userId || 'unknown',
            field: 'blacklistedSymbols',
            before,
            after
          });
        }
      }

      // Apply updates if needed
      if (needsUpdate && settings.userId) {
        await storage.db
          .update(storage.schema.tradingSettings)
          .set(updates)
          .where(storage.schema.eq(storage.schema.tradingSettings.userId, settings.userId));
        
        updatedCount++;
      }
    }

    // Log audit trail
    console.log(`\n📋 Migration Audit Log:\n`);
    if (auditLog.length > 0) {
      auditLog.forEach(entry => {
        console.log(`User: ${entry.userId}`);
        console.log(`Field: ${entry.field}`);
        console.log(`Before: ${JSON.stringify(entry.before)}`);
        console.log(`After:  ${JSON.stringify(entry.after)}`);
        console.log('---');
      });
    } else {
      console.log('No changes needed - all symbols already in canonical format');
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`Records updated: ${updatedCount}/${allSettings.length}`);
    console.log(`Total symbol normalizations: ${auditLog.length}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateSymbolCanonicalization()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateSymbolCanonicalization };
