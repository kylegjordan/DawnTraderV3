# Phase 3 Migration Plan
## Gemini Refactor and Repository Hygiene

**Date:** 2025-11-06  
**Phase:** 3 (Post-2F Cleanup & Optimization)  
**Status:** 🚧 **IN PROGRESS**

---

## Executive Summary

Phase 3 implements Gemini's recommendations to:
1. Remove remaining non-auth userId references from operational services
2. Simplify CI guardrails to operational-only scanning
3. Add repository hygiene rules to prevent large file commits
4. Clean up historical backup blobs (requires manual git operations)

**Scope:** 3 service files + CI improvements + repo hygiene

---

## A) userId Removal Analysis

### Target Files (Non-Auth userId Usage)

#### 1. context-refresh-coordinator.ts
**Current State:** 39 userId references  
**Usage:** Parameter passing through refresh/fetch methods

**Occurrences:**
- Method signatures: `refresh(userId, mode)`, `fetchFreshData(userId, mode)`
- Storage calls: `storage.getUser(userId)`, `storage.getTradingSettings(userId)`
- Event emissions: `emit('contextRefreshed', { userId, ... })`
- Truth checks: `systemTruthDiagnostic.runTruthCheck(userId, mode)`

**Migration Strategy:**
```diff
- async refresh(userId: string, mode: 'live' | 'paper')
+ async refresh(mode: 'live' | 'paper')

- const user = await storage.getUser(userId)
+ const user = await storage.getCanonicalUser() // kylegjordan

- this.emit('contextRefreshed', { userId, mode, ... })
+ this.emit('contextRefreshed', { mode, ... })
```

**Impact:**
- Medium complexity - method signatures change
- Callers need updating (find all imports)
- WebSocket events simplified (no userId broadcast)

---

#### 2. value-alignment.ts
**Current State:** 14 userId references  
**Usage:** Database queries for user-specific alignment matrices

**Occurrences:**
- `initializeDefaultMatrix(userId)`
- `evaluateObjective(userId, objectiveName, ...)`
- `getOverallAlignment(userId)`
- `updateAlignment(userId, objectiveName, ...)`
- `getMatrix(userId)`
- SQL: `WHERE user_id = ${userId}`

**Migration Strategy:**
```diff
- async getMatrix(userId: string): Promise<AlignmentMatrix[]>
+ async getMatrix(mode: 'live' | 'paper'): Promise<AlignmentMatrix[]>

- SELECT * FROM value_alignment_matrix WHERE user_id = ${userId}
+ SELECT * FROM value_alignment_matrix WHERE mode = ${mode}
```

**Database Changes Required:**
```sql
-- Add mode column to value_alignment_matrix table
ALTER TABLE value_alignment_matrix 
  ADD COLUMN mode trading_mode DEFAULT 'paper';

-- Migrate existing data to paper mode
UPDATE value_alignment_matrix 
  SET mode = 'paper' 
  WHERE user_id IS NOT NULL;

-- Make mode NOT NULL after migration
ALTER TABLE value_alignment_matrix 
  ALTER COLUMN mode SET NOT NULL;

-- Drop user_id column
ALTER TABLE value_alignment_matrix 
  DROP COLUMN user_id;
```

**Impact:**
- High complexity - requires schema migration
- All alignment data becomes mode-scoped
- Interface changes affect calling code

---

#### 3. system-health-service.ts
**Current State:** 2 userId references  
**Usage:** Database connectivity test only

**Occurrences:**
- `async getHealthStatus(userId: string)`
- `await storage.getUser(userId)` // DB connectivity check

**Migration Strategy:**
```diff
- async getHealthStatus(userId: string): Promise<SystemHealthStatus>
+ async getHealthStatus(): Promise<SystemHealthStatus>

- await storage.getUser(userId); // DB test
+ await db.execute(sql`SELECT 1 AS health_check`); // Simple ping
```

**Impact:**
- Low complexity - simple parameter removal
- No schema changes needed
- Minimal caller updates

---

### Summary Table

| File | userId Count | Complexity | Schema Change? | Priority |
|------|--------------|------------|----------------|----------|
| context-refresh-coordinator.ts | 39 | Medium | No | High |
| value-alignment.ts | 14 | High | Yes | Medium |
| system-health-service.ts | 2 | Low | No | Low |

**Total userId references to remove:** 55

---

## B) CI Guardrails Simplification

### Current State

**File:** `.github/workflows/single-tenant-guardrails.yml`  
**Issues:**
- Scans all code (including legacy/non-operational)
- No auto-baseline mechanism
- Reports include false positives (comments, docs)

### Proposed Changes

#### 1. Operational-Only Scanning
```yaml
# Current: Scans everything
rg "userId" server client shared

# Proposed: Scan operational code only
rg "userId" \
  server/services \
  server/routes.ts \
  server/index.ts \
  --type-not test
```

#### 2. Auto-Baseline with Exemptions
```yaml
# Create baseline on first run
- name: Generate userId baseline
  run: |
    rg "userId" server/services --files-with-matches \
      > .baseline-userid-files.txt
    
- name: Check for new userId introductions
  run: |
    rg "userId" server/services --files-with-matches \
      > current-userid-files.txt
    
    # Compare with baseline
    comm -13 <(sort .baseline-userid-files.txt) \
             <(sort current-userid-files.txt) \
      > new-userid-files.txt
    
    if [ -s new-userid-files.txt ]; then
      echo "❌ New userId files detected:" && cat new-userid-files.txt
      exit 1
    fi
```

#### 3. Exclude Known Safe Patterns
```yaml
# Exclude auth-related files
--glob '!**/auth*.ts' \
--glob '!**/user*.ts' \
--glob '!**/session*.ts'
```

---

## C) Repository Hygiene Rules

### 1. Update .gitignore

**Add entries:**
```gitignore
# Database dumps and backups
*.sql.gz
*.sql.bz2
*.dump
*.backup
*.bak
*.old

# Large diagnostic files
*.log.gz
diagnostic-dumps/
backup-*.sql

# Compiled diagnostics (over 10MB)
dist/diagnostics/*.json

# Temporary SQL
temp-*.sql
migration-backup-*.sql
```

### 2. Pre-Commit Hook

**File:** `.git/hooks/pre-commit`

```bash
#!/bin/bash
# Prevent commits of large SQL/dump files

echo "🔍 Checking for large files..."

# Find files larger than 5MB
large_files=$(git diff --cached --name-only --diff-filter=ACM | \
  while read file; do
    if [ -f "$file" ]; then
      size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
      if [ $size -gt 5242880 ]; then  # 5MB in bytes
        echo "$file ($(numfmt --to=iec-i --suffix=B $size))"
      fi
    fi
  done)

# Block SQL dumps
sql_dumps=$(git diff --cached --name-only --diff-filter=ACM | \
  grep -E '\.(sql\.gz|dump|backup|\.bak)$')

if [ -n "$large_files" ] || [ -n "$sql_dumps" ]; then
  echo "❌ COMMIT BLOCKED - Large or prohibited files detected:"
  [ -n "$large_files" ] && echo "Large files:" && echo "$large_files"
  [ -n "$sql_dumps" ] && echo "SQL dumps:" && echo "$sql_dumps"
  echo ""
  echo "Solutions:"
  echo "  1. Add to .gitignore"
  echo "  2. Use git LFS for large files"
  echo "  3. Remove from commit: git reset HEAD <file>"
  exit 1
fi

echo "✅ No large files detected"
```

**Installation:**
```bash
chmod +x .git/hooks/pre-commit
```

---

## D) Git History Cleanup

### Rationale

**Problem:** Historical commits contain large backup blobs (SQL dumps, old migrations)  
**Impact:** Repository size bloat, slow clones  
**Solution:** Rebuild main branch history to exclude large files

### Steps (Manual - Git Expert Required)

⚠️ **DESTRUCTIVE OPERATION** - Requires backup and coordination

```bash
# 1. Backup current state
git branch backup-before-cleanup

# 2. Create list of large files to purge
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '$1 == "blob" && $3 > 5242880 {print $4}' > large-files.txt

# 3. Use BFG Repo-Cleaner (safer than filter-branch)
bfg --delete-files large-files.txt

# 4. Clean up refs and garbage collect
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force push (requires team coordination)
git push origin main --force

# 6. All team members must re-clone
git clone <repo-url> dawntrader-clean
```

**Excluded Files Pattern:**
```
*.sql.gz
*.dump
backup-*.sql
migration-backup-*
old-*.sql
```

**Estimated Size Reduction:** TBD (depends on blob audit)

---

## E) Implementation Plan

### Phase 3A: userId Removal (Day 1)

**Tasks:**
1. ✅ Analyze userId usage in target files
2. ⏳ Remove userId from system-health-service.ts (simplest)
3. ⏳ Remove userId from context-refresh-coordinator.ts
4. ⏳ Migrate value-alignment.ts schema + code
5. ⏳ Update all callers of modified services
6. ⏳ Run build + tests
7. ⏳ Verify no regressions

**Success Criteria:**
- ✅ 55 fewer userId references in operational code
- ✅ All services compile without errors
- ✅ Server starts successfully
- ✅ No runtime userId errors in logs

---

### Phase 3B: CI Simplification (Day 1)

**Tasks:**
1. ⏳ Update single-tenant-guardrails.yml
2. ⏳ Add operational-only scanning
3. ⏳ Implement auto-baseline mechanism
4. ⏳ Test CI workflow locally
5. ⏳ Commit and validate on push

**Success Criteria:**
- ✅ CI scans only operational code
- ✅ Baseline auto-generated on first run
- ✅ No false positives from comments/docs
- ✅ Faster CI execution (fewer files scanned)

---

### Phase 3C: Repo Hygiene (Day 1)

**Tasks:**
1. ⏳ Update .gitignore with SQL/dump exclusions
2. ⏳ Create pre-commit hook script
3. ⏳ Test pre-commit hook locally
4. ⏳ Document installation in README

**Success Criteria:**
- ✅ Large files blocked at commit time
- ✅ SQL dumps cannot be committed
- ✅ Pre-commit hook installed and working

---

### Phase 3D: Git History Cleanup (Day 2+ / Manual)

**Tasks:**
1. ⚠️ Audit large blobs in git history
2. ⚠️ Create backup branch
3. ⚠️ Run BFG Repo-Cleaner
4. ⚠️ Validate cleaned repository
5. ⚠️ Coordinate force-push with team
6. ⚠️ Team re-clones repository

**Success Criteria:**
- ⚠️ Repository size reduced by >50MB
- ⚠️ No large SQL dumps in history
- ⚠️ All team members on clean clone
- ⚠️ No lost commits/data

**Note:** Requires git expert + team coordination (not automated)

---

## F) Risk Assessment

### Low Risk ✅
- system-health-service.ts changes (simple parameter removal)
- .gitignore updates (additive only)
- Pre-commit hook (local enforcement)

### Medium Risk ⚠️
- context-refresh-coordinator.ts (many callers to update)
- CI workflow changes (could break builds temporarily)

### High Risk 🔴
- value-alignment.ts migration (schema changes + data migration)
- Git history rewrite (irreversible, requires force-push)

---

## G) Rollback Plan

### For Code Changes (Phase 3A/B/C)
```bash
# Revert to pre-Phase 3 state
git revert <phase3-commit-sha>
git push origin main
```

### For Schema Changes (value-alignment)
```sql
-- Restore user_id column if needed
ALTER TABLE value_alignment_matrix ADD COLUMN user_id varchar;

-- Copy mode data back to user_id (if backup exists)
UPDATE value_alignment_matrix 
  SET user_id = (SELECT id FROM users LIMIT 1)
  WHERE mode = 'paper';
```

### For Git History Cleanup (Phase 3D)
```bash
# Restore from backup branch
git reset --hard backup-before-cleanup
git push origin main --force
```

---

## H) Testing Strategy

### Unit Tests
- Test context-refresh-coordinator without userId
- Test value-alignment with mode parameter
- Test system-health-service health checks

### Integration Tests
- Verify WebSocket events emit correctly
- Confirm alignment matrix queries work
- Test health status endpoint

### Regression Tests
- Boot server and check for userId errors in logs
- Run full trade simulation (paper + live)
- Verify no userId leakage in API responses

### CI/CD Tests
- Trigger guardrails workflow manually
- Verify pre-commit hook blocks large files
- Test baseline generation mechanism

---

## I) Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| userId references (operational) | <100 | TBD | 🟡 In Progress |
| CI scan time | <30s | TBD | ⏳ Pending |
| False positive rate | 0% | TBD | ⏳ Pending |
| Large file commits blocked | 100% | TBD | ⏳ Pending |
| Repository size reduction | >50MB | TBD | ⏳ Pending (3D) |

---

## J) Documentation Updates

**Files to Update:**
- `README.md` - Add pre-commit hook installation
- `audit/phase3-completion-report.md` - Final audit report
- `.github/workflows/README-GUARDRAILS.md` - CI changes
- `migrations/README.md` - value-alignment schema change

---

## K) Timeline

**Phase 3A (userId Removal):** 4-6 hours  
**Phase 3B (CI Simplification):** 2-3 hours  
**Phase 3C (Repo Hygiene):** 1-2 hours  
**Phase 3D (Git Cleanup):** TBD (manual, requires coordination)

**Total Automated Work:** 7-11 hours  
**Manual Git Work:** External (git expert required)

---

## L) Dependencies

**Required:**
- Phase 2F completion (runtime proofs)
- Database backup before schema changes
- CI workflow write access

**Optional:**
- BFG Repo-Cleaner installation (for 3D)
- Team availability for git history rewrite
- LFS setup for future large files

---

## M) Approval Checklist

Before proceeding with Phase 3:

- [x] Phase 2F completed and verified
- [ ] Database backup created
- [ ] All tests passing on main branch
- [ ] Team notified of upcoming changes
- [ ] Rollback plan understood
- [ ] Schema migration SQL reviewed
- [ ] CI workflow changes tested locally

---

**Migration Plan Version:** 1.0  
**Created:** 2025-11-06  
**Status:** Draft - Awaiting Approval  
**Next Action:** Begin Phase 3A implementation
