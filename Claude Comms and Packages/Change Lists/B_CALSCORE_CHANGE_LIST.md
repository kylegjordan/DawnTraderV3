# B-CALSCORE — CHANGE LIST (Step 4 code review, embedded diffs)

**Local verification BEFORE push (C:\dev bench):** `npx tsc --noEmit` = **493 total = baseline → 0 net new** (the only routes.ts errors are pre-existing at lines 714–5207, none at the new endpoint ~7876; analytics.tsx / calscore-format / b-calscore = 0). `npx vitest run b-calscore` = **4/4 pass**. Additive only; read-only.

INFRASTRUCTURE NOTE: review from the embedded snippets below. DO NOT cd to /mnt/gdrive or run git on the gdrive mount. Files staged to `/home/langston/inbox/b-calscore/`. Use `ssh staging` for repo-side inspection.

---

## NEW · drizzle/migrations/2026-06-02-b-calscore-ledger.sql (+ -rollback.sql, + MANIFEST append)
Schema (num/den = SSOT, NO `*_pct` columns per C1.3; `planned_sub_batch` per C1.1; grain unique idx per C1.2):
```sql
CREATE TABLE IF NOT EXISTS calibration_ledger (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sub_batch TEXT NOT NULL,            -- established the current/baseline value
  planned_sub_batch TEXT,             -- proposed the planned value (C1.1)
  asset_class TEXT NOT NULL DEFAULT 'xstock_spot',
  setting_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '*',    -- free-text convention (C1.2)
  metric_label TEXT NOT NULL,
  current_value TEXT,
  current_result_num BIGINT, current_result_den BIGINT,
  planned_value TEXT,
  planned_result_num BIGINT, planned_result_den BIGINT,
  status TEXT NOT NULL DEFAULT 'baseline',
  decision_grade BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- per-batch migration sets explicitly on planned-fill (C1.4)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS calibration_ledger_grain_idx ON calibration_ledger (sub_batch, asset_class, setting_key, scope);
CREATE INDEX IF NOT EXISTS calibration_ledger_asset_class_idx ON calibration_ledger (asset_class);
```
Seed = 10 tunable rows (current side only), idempotent (C5). Distinct `scope` disambiguates the two min_depth_usd + two max_bid_ask_spread pairs:
```sql
INSERT INTO calibration_ledger (sub_batch, asset_class, setting_key, scope, metric_label, current_value, current_result_num, current_result_den, status, decision_grade, notes) VALUES
  ('B.0','xstock_spot','lq_min','family_imf','LQ reject (RTH; ask-depth < ~$19,950)','43',338,485,'baseline',TRUE,'#1 finding ... TARGET not yet (off ~1 day) — thicken forward. B.2.'),
  ('B.0','xstock_spot','min_depth_usd','quant_pattern_vts','min(ask,bid) reject (RTH)','2000',19,485,'baseline',TRUE,'...'),
  ('B.0','xstock_spot','min_depth_usd','quant_pattern_active','min(ask,bid) reject (RTH)','5000',65,485,'baseline',TRUE,'...'),
  ('B.0','xstock_spot','corr_max','imf_all','Correlation reject (rolling-24h IMF)','0.92',0,283625,'baseline',TRUE,'NON-FUNCTIONAL ... REMOVE from IMF at end of calibrations.'),
  ... (10 rows total: lq_min ×2, min_depth_usd ×2, max_bid_ask_spread ×2, corr_max, vn_max, di_max ×2)
ON CONFLICT (sub_batch, asset_class, setting_key, scope) DO NOTHING;
```
Rollback: `DROP TABLE IF EXISTS calibration_ledger;`. MANIFEST: appended `2026-06-02-b-calscore-ledger.sql` after the f-now line.

## NEW · shared/calscore-format.ts — pct DERIVED from num/den, Number()-coerced (C5)
```ts
export function fmtCalibrationResult(num, den): string {
  const n = num === null || num === undefined || num === '' ? NaN : Number(num);
  const d = den === null || den === undefined || den === '' ? NaN : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return '—';
  return `${((n / d) * 100).toFixed(2)}% (${n.toLocaleString('en-US')}/${d.toLocaleString('en-US')})`;
}
```
(Pure module so the test imports it without React. A real 0 numerator → "0.00% (...)", NOT em-dash; missing/zero den → "—".)

## NEW · server/tests/unit/b-calscore.test.ts — 4 cases
clean-math · STRING-coercion (C5: `'0'/'283625'` → `0.00% (0/283,625)`, not concat) · 0-numerator-is-0.00%-not-dash · em-dash for missing/zero den. DB-dependent asserts (seeded rows, empty-state, idempotent re-seed) verified on STAGING (psql + UI), noted in the test header.

## MODIFIED · server/routes.ts (+1 endpoint, ~line 7876, after exit-strategy-ablation)
```ts
apiRouter.get('/analytics/calibration-scoreboard', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const assetClass = (req.query.asset_class as string) || 'xstock_spot';
    const result: any = await db.execute(sql`
      SELECT id, sub_batch, planned_sub_batch, asset_class, setting_key, scope, metric_label,
             current_value, current_result_num, current_result_den,
             planned_value, planned_result_num, planned_result_den,
             status, decision_grade, notes, updated_at
      FROM calibration_ledger WHERE asset_class = ${assetClass}
      ORDER BY sub_batch, setting_key, scope`);
    const rows = result.rows ?? result;
    res.json({ ok: true, data: { rows, count: rows.length, assetClass } });
  } catch (error: any) { console.error('[B-CALSCORE]...', error); res.status(500).json({ ok: false, error: error.message }); }
});
```

## MODIFIED · client/src/pages/analytics.tsx (component + 3 tab edits)
- Import `{ fmtCalibrationResult } from "@shared/calscore-format"`.
- NEW exported `CalibrationScoreboardSection` (mirrors ExitStrategyAblationSection; useQuery+apiFetch; plain table; columns Setting/Scope/Metric/Current value/Current result/Planned value/Planned result/Status; current+planned result cells = `fmtCalibrationResult(num,den)`; empty-state). NO selectors (static ledger).
- **Tab wiring (C4 invariant — value strings MUST match):**
```tsx
<TabsList className="grid w-full grid-cols-9 max-w-6xl">   // was grid-cols-8
  ... <TabsTrigger value="calscore" ...><Gauge .../>Calibration</TabsTrigger>   // after Drift Dashboard
<TabsContent value="calscore" className="mt-6"><CalibrationScoreboardSection assetClass="xstock_spot" /></TabsContent>  // after drift content
```

## Code-review asks
- R1: migration grain + ON CONFLICT DO NOTHING idempotency + the scope-naming disambiguation (min_depth_usd / max_bid_ask_spread pairs) — sound?
- R2: endpoint passthrough (raw num/den, pct derived client-side) + the `result.rows ?? result` shape guard — OK?
- R3: C4 — the three `value="calscore"` strings match exactly (grid-cols-9). Confirm no blank-tab risk.
- R4: anything before push? (then CI all-4-green → deploy → staging-UI verify per §9.3 → your Step-8.)
