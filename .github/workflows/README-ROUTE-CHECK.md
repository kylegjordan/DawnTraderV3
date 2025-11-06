# Route ID Check Workflow

**File:** `.github/workflows/check-route-ids.yml`  
**Purpose:** Prevent accidental introduction of `:userId` routes in operational code  
**Trigger:** Every push and pull request

---

## What It Does

This GitHub Actions workflow automatically scans the codebase for new `:userId` route parameters and **fails the CI build** if any are found outside the approved admin endpoints.

### Approved Routes (Allowed)
```
✅ /api/admin/users/:userId
✅ /api/admin/users/:userId/reset-password
```

### Blocked Patterns (Will Fail CI)
```
❌ /api/portfolio/:userId
❌ /api/trades/:userId/*
❌ /api/strategies/:userId
❌ Any operational route with :userId parameter
```

---

## Why This Exists

**Context:** DawnTrader migrated to single-tenant architecture (ADR-001)
- All operational data is partitioned by `mode: paper | live`
- User-specific routing was removed in Phase 2C
- Only admin user management routes retain `:userId` parameters

**Risk:** Developers might accidentally reintroduce user-based routing patterns

**Solution:** Automated CI guard prevents regression

---

## How It Works

### Scan Process
```bash
1. Checkout code
2. Use ripgrep (rg) to find all "/:userId" patterns
3. Filter out approved admin routes (/admin/users/)
4. If any non-admin :userId routes found → CI FAILS ❌
5. Otherwise → CI PASSES ✅
```

### Example Output

**Pass (No violations):**
```
Scanning for :userId mounts outside admin endpoints...
✅ No new :userId mounts detected (admin-only references allowed).
```

**Fail (Violation found):**
```
Scanning for :userId mounts outside admin endpoints...
❌ New :userId routes found outside admin scope:
server/routes/portfolio.ts:42:  app.get('/api/portfolio/:userId', async (req, res) => {
```

---

## Bypass Instructions

If you **must** add a `:userId` route for legitimate admin purposes:

1. **Ensure route path includes `/admin/users/`** - The filter will allow it
2. **Protect with admin middleware** - Use `requireAdmin` guard
3. **Document in ADR-001** - Update architecture decision record

### Example (Allowed)
```typescript
// ✅ This will pass CI (contains /admin/users/)
app.patch('/api/admin/users/:userId/permissions', 
  authenticateToken, 
  requireAdmin, 
  async (req, res) => { /* ... */ }
);
```

### Example (Blocked)
```typescript
// ❌ This will FAIL CI (operational route with :userId)
app.get('/api/portfolio/:userId', async (req, res) => {
  // WRONG: Use mode-based isolation instead
});

// ✅ Correct single-tenant pattern
app.get('/api/portfolio/overview', async (req, res) => {
  const mode = req.query.mode; // 'paper' or 'live'
  // Query: WHERE mode = ?
});
```

---

## Testing Locally

Run the same check before pushing:

```bash
# Test the workflow logic
rg -n "/:userId" server client shared --ignore-case \
  | grep -v "/admin/users/" > route_hits.txt || true

if [ -s route_hits.txt ]; then
  echo "❌ Would fail CI:" && cat route_hits.txt
else
  echo "✅ Would pass CI"
fi
```

---

## Related Documentation

- **Architecture:** `migrations/2025-11-06_single_tenant.sql` (Phase 2C migration)
- **Routing Policy:** `audit/admin-userid-routes.md` (Admin route exceptions)
- **Runtime Guards:** `server/middleware/singleTenantGuard.ts`
- **CI Guardrails:** `.github/workflows/single-tenant-guardrails.yml`

---

## Troubleshooting

### False Positive: Comment or String Contains "/:userId"

**Problem:** Workflow fails due to commented code or documentation strings

**Solution:** Add exception patterns to the grep filter:
```yaml
| grep -v "/admin/users/" \
| grep -v "^[[:space:]]*#" \  # Exclude comments
| grep -v "^[[:space:]]*//" \ # Exclude JS comments
> route_hits.txt || true
```

### Need to Temporarily Disable Check

**Not Recommended**, but if absolutely necessary:
```yaml
# In .github/workflows/check-route-ids.yml
# Comment out the exit 1 line for testing only
if [ -s route_hits.txt ]; then
  echo "❌ New :userId routes found:" && cat route_hits.txt
  # exit 1  # Temporarily disabled
```

**Better:** Fix the code to use mode-based isolation instead

---

**Created:** 2025-11-06 (Phase 2F)  
**Maintainer:** DevOps Team  
**Status:** Active
