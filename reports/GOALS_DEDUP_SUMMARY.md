# Goals Canonicalization & Deduplication Summary

**Date**: 2025-10-19T21:25:38.645Z  
**Migration**: Phase 27.F - Goals Engine Stabilization

---

## Overview

This migration canonicalized metric names and deduplicated goals records to ensure data consistency.

### Canonicalization Function

```typescript
function canonicalizeMetricName(metricName: string): string {
  return metricName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove spaces, special chars
    .trim();
}
```

**Examples**:
- `"Earnings per Day"` → `"earningsperday"`
- `"EarningsPerDay"` → `"earningsperday"`
- `"Average Return"` → `"averagereturn"`

---

## Paper Mode Goals (`user_goals_paper`)

### Statistics

| Metric | Count |
|--------|-------|
| **Total records (before)** | 16 |
| **Unique metric keys** | 6 |
| **Duplicate groups found** | 1 |
| **Duplicate records removed** | 1 |
| **Total records (after)** | 15 |

### Deduplication Details


**Metric**: `earningsperday`  
- User ID: `ce50e56b-0208-4fca-9c14-2777db4104b7`
- Original names: `"Earnings per Day"`, `"EarningsPerDay"`
- Duplicates found: 2
- Kept ID: `b97581cd-20e4-4b84-b918-ed4c6271b66b` (newest)
- Removed IDs: `7d05598a-8d28-4e09-94a7-d08edf81ab49`


---

## Live Mode Goals (`user_goals_live`)

### Statistics

| Metric | Count |
|--------|-------|
| **Total records (before)** | 12 |
| **Unique metric keys** | 6 |
| **Duplicate groups found** | 0 |
| **Duplicate records removed** | 0 |
| **Total records (after)** | 12 |

### Deduplication Details

_No duplicates found_

---

## Database Changes

### Schema Updates

1. **Added column**: `metric_key VARCHAR(100) NOT NULL`
   - Canonical normalized version of metric name
   - Used for all lookups and upserts

2. **Added constraint**: `NOT NULL` on `metric_key`
   - Ensures all records have a canonical key

3. **Added unique index**: `(user_id, metric_key)`
   - Prevents duplicate goals per user per metric
   - Enforces data integrity

### Migration Steps Executed

1. ✅ Added `metric_key` column (nullable)
2. ✅ Backfilled `metric_key` for all existing records
3. ✅ Identified duplicate groups
4. ✅ Removed duplicates (kept newest record per group)
5. ✅ Added `NOT NULL` constraint
6. ✅ Created unique index on `(user_id, metric_key)`

---

## Verification

### Database Integrity

```sql
-- Verify no duplicates remain
SELECT user_id, metric_key, COUNT(*) as count
FROM user_goals_paper
GROUP BY user_id, metric_key
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Verify all records have metric_key
SELECT COUNT(*) FROM user_goals_paper WHERE metric_key IS NULL;
-- Should return 0

-- Verify unique index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'user_goals_paper' 
  AND indexname LIKE '%metric_key%';
-- Should show index
```

---

## Impact

✅ **Goals persistence fixed**: Saves now upsert by canonical metric_key  
✅ **No more duplicates**: Unique constraint prevents duplicate creation  
✅ **Data integrity**: All goals have canonical keys  
✅ **Consistent lookups**: Frontend and backend use same normalization  

---

**Migration Status**: ✅ COMPLETE
