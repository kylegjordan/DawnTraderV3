# Migrations Chain Status

**Date:** 2025-11-06  
**Status:** Migration chain reset at Phase 2C

## Important Notice

The **live database is now the authoritative source of truth** for the schema. The previous Drizzle migration chain is no longer valid due to the Phase 2C emergency single-tenant conversion.

### Background

During Phase 2C (2025-11-06), we performed a destructive migration to convert DawnTrader from multi-user to single-tenant architecture. This migration:

- Dropped `user_id` columns from 5 operational tables
- Removed foreign key constraints and indexes
- Could not use `npm run db:push` (Drizzle Kit hangs on large databases)
- Was executed via direct SQL commands

### Current State

**Migration Files:**
- `migrations/2025-11-06_single_tenant.sql` - Manual migration recording the Phase 2C changes
- Previous Drizzle migrations - OUTDATED (do not apply to fresh databases)

**Schema Source:**
- `shared/schema.ts` - Reflects current database state (user_id columns removed)
- Live database - Authoritative schema structure

### For Future Developers

**Starting a New Database:**

Option 1: Restore from backup (Recommended)
```bash
psql $DATABASE_URL < backups/neon_backup_20251106_073341.sql
```

Option 2: Apply manual migration after Drizzle setup
```bash
# First run existing Drizzle migrations (will be outdated)
npm run db:push --force

# Then apply the single-tenant fix
psql $DATABASE_URL < migrations/2025-11-06_single_tenant.sql
```

Option 3: Use the live database
```bash
# Connect to existing production/development database
# No migration needed - already in correct state
```

**Creating New Migrations:**

⚠️ **DO NOT run `db:push` blindly!**

The migration chain is broken. New migrations should:
1. Start from the current live schema (post-2025-11-06)
2. Be created manually and tested thoroughly
3. Be idempotent (safe to run multiple times)

### Migration Chain Timeline

- **Pre-2025-11-06:** Drizzle auto-generated migrations (multi-user schema)
- **2025-11-06:** Phase 2C manual migration (single-tenant conversion)
- **Post-2025-11-06:** New chain starts here

---

**Last Updated:** 2025-11-06  
**Migration Lead:** Replit Agent  
**Status:** Documented
