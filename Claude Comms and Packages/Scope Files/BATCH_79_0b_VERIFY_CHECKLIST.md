# BATCH 79.0b — SQE wildcard DELETE: 48h Verification Gate

**Created:** 2026-05-09 (B79.0b Step 11 artifact).
**Companion script:** `scripts/b79-0a-sqe-remove-wildcards.sql`.
**Trigger:** at least 48 hours after B79.0a Migration 2 applied (2026-05-08 21:38 UTC) → **earliest execution 2026-05-10 21:38 UTC**.

---

## Why this gate exists

B79.0a Migration 2 promoted 2 sqe_config wildcard rows to explicit per-class rows:
- `(sqe_config, *, *, *, *, min_final_score) = 0.35` → also explicit for crypto_spot + xstock_spot
- `(sqe_config, *, *, *, *, min_regime_weight) = 0.30` → also explicit for crypto_spot + xstock_spot

The wildcards REMAIN as a safety net during the 48h observation window so the `module_constants` resolution path can be observed flowing through the explicit per-class rows. Mirror of B79.TEC.b pattern.

---

## Preconditions to verify (before executing the script)

| # | Check | Method |
|---|---|---|
| 1 | ≥ 48h elapsed since B79.0a Migration 2 applied (2026-05-08 21:38 UTC) | `date -u "+%s"` >= 1778276280 + 172800 (i.e. >= 2026-05-10 21:38 UTC) |
| 2 | Both per-class rows present + value matches: crypto_spot + xstock_spot for both keys (4 rows total) | `psql ... "SELECT asset_class, constant_name, value FROM module_constants WHERE module_name='sqe_config' AND constant_name IN ('min_final_score','min_regime_weight') AND asset_class IN ('crypto_spot','xstock_spot') ORDER BY asset_class, constant_name;"` (must return 4 rows) |
| 3 | Wildcards still present (have not been deleted by an unrelated operation) | Same query with `asset_class='*'` (must return 2 rows) |
| 4 | TEC + xstock-scanner diagnostics still ready | `curl http://188.245.193.8/api/diagnostics/tec-bootstrap` AND `curl http://188.245.193.8/api/diagnostics/xstock-scanner` both return ready/isRunning:true |
| 5 | No-touch fence on crypto_spot factor cadence still ±10% of pre-deploy baseline | `psql ... "SELECT factor_name, COUNT(*) FROM regime_factor_alternates WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour' GROUP BY factor_name;"` |
| 6 | CI on `migration/aws-supabase` HEAD: Build + Docker + Test Suite green (TS Check legacy baseline tolerated per Kyle directive) | `gh run list --branch migration/aws-supabase --limit 1` |

If ANY precondition fails → STOP. Investigate. Do NOT execute the DELETE.

---

## Execution procedure

1. **Capture rollback snapshot** (manual, before BEGIN):
   ```sql
   SELECT * FROM module_constants
    WHERE module_name='sqe_config'
      AND asset_class='*'
      AND constant_name IN ('min_final_score','min_regime_weight')
    ORDER BY constant_name;
   ```
   Copy result to `Claude Comms and Packages/Reports/B79_0b_sqe_wildcard_rollback_snapshot.txt`.

2. **Edit the script** to fill `<STEP1_DEPLOY_TIMESTAMP>` placeholder with `'2026-05-08 21:38:00+00'::timestamptz`.

3. **Apply via psql** (DB-only change; no PM2 restart):
   ```bash
   ssh root@188.245.193.8 "su - deploy -c 'export DATABASE_URL=\$(grep ^DATABASE_URL .env | cut -d= -f2-) && psql \"\$DATABASE_URL\" -f /tmp/b79-0a-sqe-remove-wildcards.sql'"
   ```

4. **Post-execution verification:**
   - Count of `(sqe_config, *, *, *, *, min_final_score|min_regime_weight)` rows now = 0.
   - Per-class rows for crypto_spot + xstock_spot still present (4 rows total — unchanged).
   - Wait 60s for `module-constants-service` cache refresh; SQE eval still works (test by triggering a paper signal evaluation OR check PM2 logs for `[10.9C][FilterInsights]` or `[8.8.4-C.11][SQE_DISTRIBUTION]` continuing to fire normally).
   - No-touch fence on crypto_spot factor cadence holds.

5. **Record outcome** in this checklist (sign-off table below) + close RUNNING_ISSUES tracker.

---

## Rollback procedure

If anything breaks AFTER the DELETE:

```sql
BEGIN;
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('sqe_config', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
   'min_final_score', '<captured value>'::jsonb, 'B79.0b_rollback'),
  ('sqe_config', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
   'min_regime_weight', '<captured value>'::jsonb, 'B79.0b_rollback');
COMMIT;
```

Use the captured rows from step 1 above. Then `pm2 restart dawntrader` (60s cache TTL means it isn't strictly required but is safest).

---

## Sign-off

| Role | Name | Date/Time UTC | Notes |
|---|---|---|---|
| CC | (auto) | | Verified preconditions 1-6 GREEN |
| Langston | | | Independent second-pass on preconditions + post-DELETE state |
| Kyle | | | Final acknowledgment |

When all three sign off, this checklist is the closing artifact for the wildcard-DELETE step. File the completed copy at `Claude Comms and Packages/Batch Completion/BATCH_79_0a_SQE_WILDCARD_DELETE_NOTE.md`.
