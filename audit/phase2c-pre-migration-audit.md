# Phase 2C - Pre-Migration Audit
## Single-Tenant Consolidation - PostgreSQL

**Generated:** 2025-11-06 07:30 UTC  
**Database:** PostgreSQL (Neon) - 470.06 MB  
**Migration Type:** DESTRUCTIVE - Emergency Single-Tenant Conversion  
**Canonical Owner:** kylegjordan (14e0809e-3ca8-413d-878f-c55f9d837fae)

---

## 1. Current User State

### Users Table (5 total)
| ID | Username | Created | Has Operational Data |
|----|----------|---------|---------------------|
| 14e0809e-3ca8-413d-878f-c55f9d837fae | kylegjordan | 2025-10-06 | ❌ No |
| 6c591801-3072-431d-b192-30aaf426f15e | testuser123 | 2025-10-07 | ✅ Yes |
| ce50e56b-0208-4fca-9c14-2777db4104b7 | testuser | 2025-10-11 | ❌ No |
| 3ace5ebb-06f2-4116-8e60-f130425bab52 | test-user-guardrails | 2025-10-12 | ❌ No |
| 4aQaqzr5nold | test-user | 2025-10-29 | ❌ No |

**Key Finding:** Only 1 user (testuser123) has operational trading data. Canonical owner (kylegjordan) has no operational data.

---

## 2. Schema Analysis: user_id Columns

### Total Tables with user_id: 81 tables

### Critical Operational Tables (7 tables)
| Table | user_id Count | Has Mode Column | Data Status |
|-------|--------------|-----------------|-------------|
| portfolio_state | 2 rows | ✅ Yes | 1 user, 2 modes |
| strategy_settings | 16 rows | Unknown | Active |
| trading_settings_legacy | 3 rows | Unknown | Active |
| paper_sim_sessions | 131 rows | Unknown | Active |
| system_context | 1 row | Unknown | Active |
| signal_weights | 0 rows | Unknown | Empty |
| execution_config | 0 rows | Unknown | Empty |

### Portfolio State Detail
```
user_id: 6c591801-3072-431d-b192-30aaf426f15e (testuser123)
- mode: live  | balance: $834.11  | updated: 2025-10-16
- mode: paper | balance: $5000.00 | updated: 2025-11-03
```

### Non-Critical Tables (74 tables)
AI/Walter/Audit tables with user_id columns - not critical for trading operations:
- ai_* tables (13 tables)
- walter_* tables (11 tables)
- *_audit_log tables (12 tables)
- paper_sim_*_user_archive tables (3 tables)
- Other supporting tables (35 tables)

---

## 3. Migration Scope Decision

### Tables to Migrate (Remove user_id)
**Critical operational tables only:**
1. ✅ portfolio_state (2 rows → deduplicate by mode)
2. ✅ strategy_settings (16 rows → deduplicate by mode + strategy key)
3. ✅ trading_settings_legacy (3 rows → deduplicate by mode)
4. ✅ paper_sim_sessions (131 rows → keep all, remove user_id)
5. ✅ system_context (1 row → keep, remove user_id)
6. ⏭️ signal_weights (0 rows - empty)
7. ⏭️ execution_config (0 rows - empty)

### Tables to Preserve (Keep user_id)
**Auth & AI tables:**
- users (authentication required)
- user_sessions (session management)
- All ai_* tables (historical AI data, not critical for trading)
- All walter_* tables (AI assistant data, not critical for trading)
- All *_audit_log tables (audit history, preserve for compliance)

---

## 4. Data Deduplication Strategy

### portfolio_state
**Current:** 2 rows (1 user × 2 modes)
**Target:** 2 rows (0 user × 2 modes)
**Action:** Remove user_id column, keep both mode entries

### strategy_settings
**Current:** 16 rows
**Target:** TBD (depends on schema - need to check for duplicate strategies per mode)
**Action:** Group by (mode, strategy_id), keep most recent, remove user_id

### trading_settings_legacy
**Current:** 3 rows
**Target:** TBD
**Action:** Group by mode, keep most recent, remove user_id

### paper_sim_sessions
**Current:** 131 rows
**Target:** 131 rows (all unique sessions)
**Action:** Remove user_id column, preserve all session data

### system_context
**Current:** 1 row
**Target:** 1 row
**Action:** Remove user_id column

---

## 5. Index Rebuild Plan

After dropping user_id columns, rebuild indexes on:
1. **portfolio_state:** CREATE INDEX ON portfolio_state(mode)
2. **strategy_settings:** CREATE INDEX ON strategy_settings(mode, strategy_id)
3. **trading_settings_legacy:** CREATE INDEX ON trading_settings_legacy(mode)
4. **paper_sim_sessions:** CREATE INDEX ON paper_sim_sessions(start_time DESC)
5. **system_context:** CREATE INDEX ON system_context(updated_at DESC)

---

## 6. Backup Verification

❌ **No backup found in attached_assets/**

**CRITICAL:** User confirmed backup exists: `neon_backup_20251106_073341.sql`

**Action Required:** Verify backup file location before proceeding.

---

## 7. Pre-Migration Checklist

- [x] Database size documented: 470.06 MB
- [x] User count documented: 5 users
- [x] Operational tables identified: 7 tables (5 with data)
- [x] Data counts captured: 153 total rows affected
- [x] Canonical owner confirmed: kylegjordan
- [x] Mode isolation verified: paper/live modes exist
- [ ] Backup verified and accessible
- [ ] SINGLE_TENANT config ready
- [ ] Migration SQL scripts prepared

---

## 8. Risk Assessment

### High Risk
- ❌ **No rollback possible** - Dropping columns is destructive
- ❌ **Data loss if deduplication fails** - Multiple users' data merged
- ❌ **Breaking changes to codebase** - 3,125+ userId references to update

### Medium Risk
- ⚠️ **Session invalidation** - All users will need to re-login
- ⚠️ **AI data disconnected** - 74 tables with user_id preserved but data may be orphaned

### Low Risk
- ✅ **Small dataset** - Only 153 rows in critical tables
- ✅ **Single active user** - 4 out of 5 users have no operational data
- ✅ **Mode isolation intact** - paper/live separation preserved

---

## 9. Success Criteria

- ✅ All 7 operational tables have user_id removed
- ✅ Exactly 2 portfolio_state rows remain (1 per mode)
- ✅ Mode isolation preserved (paper != live)
- ✅ Both kylegjordan and testuser123 can log in
- ✅ Both users see identical trading data
- ✅ No [SingleTenantViolation] errors at runtime
- ✅ Source scan: 0 userId references outside /api/auth
- ✅ Schema scan: 0 user_id columns in operational tables

---

## 10. Next Steps

1. Verify backup exists and is accessible
2. Create migration SQL scripts for each table
3. Test migration on development database
4. Execute migration with transaction safety
5. Update Drizzle schema (shared/schema.ts)
6. Run db:push to sync schema
7. Update backend services to remove userId
8. Validate runtime behavior
9. Generate post-migration audit report

---

**Status:** ✅ Pre-Migration Audit Complete  
**Ready to Proceed:** ⏸️ Awaiting backup verification
