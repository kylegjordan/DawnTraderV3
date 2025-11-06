# Single-Tenant Guardrails - CI/CD Enforcement

**File:** `.github/workflows/single-tenant-guardrails.yml`  
**Purpose:** Prevent re-introduction of multi-user architecture patterns  
**Status:** ✅ Active as of Phase 2D (2025-11-06)

---

## How It Works

The guardrails workflow uses **baseline comparison** to allow documented legacy code while preventing new violations.

### Current Baselines (2025-11-06)

| Metric | Baseline | Description |
|--------|----------|-------------|
| userId refs | 3,137 | Legacy references in source code (technical debt) |
| Route refs | 2 | Acceptable req.user.id usages (auth checking, metrics) |
| Schema violations | 0 | No user_id columns in operational tables |

### Behavior

✅ **PASS** - If current count ≤ baseline (maintained or improved)  
❌ **FAIL** - If current count > baseline (new violations added)  
🎉 **CELEBRATE** - If current count < baseline (cleanup progress)

---

## Updating Baselines

When you clean up legacy userId references, update the baselines:

### Step 1: Run Scans Locally
```bash
# Scan source code
rg -n "(userId|user_id)" server client shared --ignore-case --glob '!**/auth*' | wc -l

# Scan routes
rg -n "req\\.user\\.id" server --glob '!**/routes/auth*' | wc -l
```

### Step 2: Update Workflow File
Edit `.github/workflows/single-tenant-guardrails.yml`:

```yaml
# Old baseline
BASELINE=3137

# New baseline (after cleanup)
BASELINE=2950  # Example: removed 187 refs
```

### Step 3: Document Changes
Add entry to `audit/phase2d-stabilize-and-guard.md`:

```markdown
### Baseline Updates
- 2025-11-06: Initial baseline 3,137 (legacy code)
- 2025-11-XX: Reduced to 2,950 (cleaned up server/routes.ts)
```

---

## Workflow Jobs

### 1. Ban userId Outside Auth
**Check:** Source code userId references  
**Baseline:** 3,137 refs  
**Fails If:** New refs added beyond baseline  
**Output:** Count comparison with improvement detection

### 2. Block Schema Reintroduction
**Check:** Migration files for ADD COLUMN user_id  
**Baseline:** N/A (absolute check)  
**Fails If:** ANY attempt to add user_id columns  
**Output:** Schema violation details

### 3. Route Contract Audit
**Check:** req.user.id usage in routes  
**Baseline:** 2 refs (acceptable)  
**Fails If:** New usages beyond baseline  
**Output:** Count comparison with improvement detection

### 4. Summary
**Check:** N/A  
**Output:** Overall status report

---

## Example CI Output

### ✅ Passing Run (Baseline Maintained)
```
📊 userId Reference Check:
  Baseline: 3137 (legacy code, documented)
  Current:  3137
✅ No new userId references (baseline maintained)

📊 Route Contract Check:
  Baseline: 2 (acceptable usages)
  Current:  2
✅ No new route violations (baseline maintained)

✅ No schema violations detected
```

### 🎉 Passing Run (Cleanup Progress)
```
📊 userId Reference Check:
  Baseline: 3137 (legacy code, documented)
  Current:  2950
✅ IMPROVEMENT: 187 userId reference(s) removed!
Consider updating baseline in workflow file.
```

### ❌ Failing Run (New Violations)
```
📊 userId Reference Check:
  Baseline: 3137 (legacy code, documented)
  Current:  3145
❌ FAILURE: 8 NEW userId reference(s) detected!
This violates single-tenant architecture.

New references (above baseline 3137):
server/routes.ts:9999: const userId = req.body.userId;
server/storage.ts:1234: WHERE user_id = ...
...
```

---

## Cleanup Roadmap

### Phase 1: Routes (659 refs)
**Priority:** High  
**Files:** `server/routes.ts`  
**Timeline:** 2-3 sprints  
**Baseline Update:** → ~2,478

### Phase 2: Storage (223 refs)
**Priority:** Medium  
**Files:** `server/storage.ts`  
**Timeline:** 1-2 sprints  
**Baseline Update:** → ~2,255

### Phase 3: Services (1,979 refs)
**Priority:** Low  
**Files:** `server/services/*`  
**Timeline:** 4-6 sprints  
**Baseline Update:** → ~276

### Phase 4: Remaining (276 refs)
**Priority:** Very Low  
**Files:** Various (AI, Walter, utilities)  
**Timeline:** 2-3 sprints  
**Baseline Update:** → 0 (ideal state)

---

## Troubleshooting

### CI Fails on Legitimate Cleanup
**Problem:** You removed userId refs but CI still fails  
**Solution:** Update baseline in workflow file (see above)

### CI Passes but Should Fail
**Problem:** New userId refs added but CI passes  
**Solution:** Check scan command excludes (remove overly broad globs)

### False Positives
**Problem:** CI detects non-userId patterns  
**Solution:** Refine regex pattern in workflow (currently case-insensitive)

---

## Related Files

- **Workflow:** `.github/workflows/single-tenant-guardrails.yml`
- **Migration:** `migrations/2025-11-06_single_tenant.sql`
- **Runtime Guards:** `server/startup/invariants.ts`, `server/middleware/singleTenantGuard.ts`
- **Audit Report:** `audit/phase2d-stabilize-and-guard.md`
- **Baseline Scans:** `diagnostics/userid_refs_source.txt`, `diagnostics/route_userid_refs.txt`

---

**Maintained By:** Phase 2D Single-Tenant Migration Team  
**Last Updated:** 2025-11-06  
**Document Version:** 1.0
