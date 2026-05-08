# BATCH 79.TEC.b — Wildcard `break_even_enabled` Row Removal: 48h Verification Gate

**Created:** 2026-05-08 (B79.TEC Step 11 artifact per scope §7).
**Companion script:** `scripts/b79-tec-remove-wildcard-be-row.sql`.
**Trigger:** at least 48 hours after B79.TEC Step 6 deploy timestamp on staging.

---

## Why this gate exists

B79.TEC Step 6 deployed per-asset-class `break_even_enabled = false` rows (Migration 1) for the 4 active asset classes — but left the original wildcard `(*, *, *, *) break_even_enabled = true` row in place as a safety net during the transition. Per scope §1c (two-step gate):

- The per-class rows take precedence via the most-specific-wins resolution in `getModuleConstants` — for ANY active class, lookups resolve to the explicit `false` row, NOT the wildcard.
- B79.TEC's `[TEC_FIRST_WILDCARD_HIT]` and `[TEC_RESOLVE_AGGR]` instrumentation lets us OBSERVE whether any resolution path actually fell through to the wildcard during 48h of live operation.
- If the 48h log shows ZERO wildcard hits → the wildcard is provably unused → safe to delete.
- If the 48h log shows ANY wildcard hits → diagnose missing per-class row, fix, do NOT delete the wildcard.

---

## Preconditions to verify (before executing the script)

| # | Check | Method |
|---|---|---|
| 1 | ≥ 48h elapsed since Step 6 deploy timestamp | `date -u -d "$(grep '\[TEC_PRIME\] bootstrap complete' /var/log/pm2/dawntrader-out-0.log \| head -1)" "+%s"` vs `date -u "+%s"` |
| 2 | `/api/diagnostics/tec-bootstrap` returns `ready=true` AND `perClassStatus.<class>.ready=true` AND `refreshFailCount=0` for ALL 4 active classes | `curl -s http://188.245.193.8/api/diagnostics/tec-bootstrap \| jq '{ready, perClassStatus}'` |
| 3 | Fresh `hasExplicitAssetClassRow` probe returns true for `(trailing_exit, crypto_spot, break_even_enabled)`, same for crypto_perp / xstock_spot / xstock_perp | psql `SELECT COUNT(*)=1 FROM module_constants WHERE module_name='trailing_exit' AND asset_class IN ('crypto_spot','crypto_perp','xstock_spot','xstock_perp') AND constant_name='break_even_enabled' GROUP BY asset_class;` (must return 4 rows of `t`) |
| 4 | `[TEC_RESOLVE_AGGR]` traffic floor: each active asset class shows `resolves:N` with N>0 in at least one per-minute dump in the last 60min (proves traffic IS flowing through the per-class cache, not silently bypassed) | `pm2 logs dawntrader --lines 100000 --nostream \| grep TEC_RESOLVE_AGGR \| tail -60 \| grep -E 'crypto_spot=resolves:[1-9]'` (similar checks for other classes) |
| 5 | No-touch fence: factor cadence on crypto_spot still ±10% of pre-B79.TEC baseline | psql on `regime_factor_alternates` (same pattern as B78/B79 forward-watch) |
| 6 | No new `[TEC_BOOTSTRAP_FAIL]` AND no `[TEC_STALE_FAIL_CLOSED]` AND no `[TEC_REFRESH_FAIL]` log lines since Step 6 deploy | `pm2 logs dawntrader --lines 100000 --nostream \| grep -E 'TEC_BOOTSTRAP_FAIL\|TEC_STALE_FAIL_CLOSED\|TEC_REFRESH_FAIL'` (must return 0 lines) |
| 7 | TS Check + Test Suite + Build + Docker CI checks GREEN on `migration/aws-supabase` HEAD | gh pr checks / gh run list |

**Note (Langston Finding 1 fix, 2026-05-08):** earlier draft of this checklist depended on `[TEC_FIRST_WILDCARD_HIT]` and `wildcard:N` counters. Those signals were dead code — `getModuleConstants` doesn't surface origin metadata, and `hasExplicitAssetClassRow` aborts boot when explicit per-class rows are missing, so a wildcard fallback can never be observed at runtime. Tying the gate to never-firing signals was a false-confidence trap. Replaced with live signals: ready+refreshFailCount from the diagnostic endpoint, fresh `hasExplicitAssetClassRow` probe at decision time, and `[TEC_RESOLVE_AGGR]` traffic floor.

If ANY precondition fails → STOP. Investigate root cause. Do NOT proceed to script execution.

---

## Execution procedure

1. **Capture rollback snapshot** (manual, before BEGIN):
   ```sql
   SELECT * FROM module_constants
    WHERE module_name='trailing_exit'
      AND asset_class='*'
      AND constant_name='break_even_enabled';
   ```
   Copy the result row to a file. Keep it in `Claude Comms and Packages/Reports/B79_TEC_b_rollback_snapshot.txt` until B79.TEC.b is fully verified post-deploy.

2. **Edit the script** to fill `<STEP1_DEPLOY_TIMESTAMP>` placeholder with the actual UTC timestamp of B79.TEC Step 6 deploy. Format: `'2026-05-08 21:30:00+00'::timestamptz`.

3. **Apply the migration** via psql (NOT via PM2 restart — this is a DB-only change; no code redeploy needed):
   ```bash
   psql "$DATABASE_URL" -f scripts/b79-tec-remove-wildcard-be-row.sql
   ```

4. **Post-execution verification:**
   - psql `SELECT COUNT(*) FROM module_constants WHERE module_name='trailing_exit' AND asset_class='*' AND constant_name='break_even_enabled';` returns 0.
   - Trigger a fresh refresh: any subsequent `resolveTECConfig` cycle within the 60s TTL window will refetch from DB; verify `[TEC_PRIME]` cadence still healthy via PM2 logs.
   - Confirm no new `[TEC_BOOTSTRAP_FAIL]` errors.
   - Verify `/api/diagnostics/tec-bootstrap` still returns `ready=true`.

5. **Record outcome** in `RUNNING_ISSUES.md` #79 (or open a new issue if a problem surfaces).

---

## Rollback procedure

If anything breaks AFTER the DELETE:

```sql
BEGIN;
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('trailing_exit', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
   'break_even_enabled', '<captured value>'::jsonb, 'B79.TEC.b_rollback');
COMMIT;
```

Then `pm2 restart dawntrader` (the cache TTL is 60s so the restart isn't strictly required but is safest).

---

## Sign-off

| Role | Name | Date | Notes |
|---|---|---|---|
| CC | (auto) | | Verified preconditions 1-7 GREEN |
| Langston | | | Independent second-pass on preconditions + post-execution state |
| Kyle | | | Final acknowledgment |

When all three sign off, this checklist is the closing artifact for B79.TEC.b. File the completed copy at `Claude Comms and Packages/Batch Completion/BATCH_79_TEC_b_COMPLETION_NOTE.md`.
