# B-CALSCORE.b — CHANGE LIST (comprehensive re-seed + UI; Step-4 review)

**Why:** Kyle 2026-06-02 — the v1 board showed only the 10 headline "definitely off" findings, misrepresenting the scope. Re-seed with the FULL Phase-24 xStock calibration surface, grouped, organized by category. Plus 3 display fixes. Local: `tsc --noEmit` = **493 = baseline (0 net new)** (the analytics.tsx grouping + endpoint + 2 tab renames add zero; the machine-learning.tsx errors at 2766-2796 are pre-existing baseline, not my line-3534 rename); `vitest run b-calscore` = **4/4**.

INFRASTRUCTURE NOTE: review from these snippets; do NOT cd the gdrive mount. Use `ssh staging` for repo-side checks.

## NEW migration `2026-06-02b-calscore-comprehensive.sql` (+ rollback, + MANIFEST)
- `ALTER TABLE calibration_ledger ADD COLUMN IF NOT EXISTS category TEXT; ADD COLUMN display_order INT;` (rollback drops both)
- `DELETE FROM calibration_ledger WHERE asset_class='xstock_spot';` then comprehensive `INSERT ... ON CONFLICT (sub_batch,asset_class,setting_key,scope) DO NOTHING`.
- **`category` = owning step + group label** (e.g. `B.1 · Regime classification`, `B.2 · IMF filters`, `B.2 · Global gates`, `B.3 · Strategy gates`, `B.4/5 · Friction & cost`, `B.6 · TEC stops (priors)`, `B.7 · Sector concentration`, `C · Macro modifier`). `display_order` orders the board.
- **~60 rows, grouped by distinct value** (filter paths sharing a value collapse to one row with a path count in `scope`):
  - **B.1 Regime (5):** one row per regime; current_value = the thresholds; result = regime share (RANGE_BOUND 8437/5970917, etc.).
  - **B.2 IMF (15):** lq_min 43 (34285/56725) / 30 (0/56725) / 35 (—); vn_max 0.95 (2603/283625) / 0.85 (—) / 0.98 (—); di_max 40 (18103/56725) / 35 (20069/56725) / 30 (—) / 100 (0); di_min 10 (0) / 0 (0) / 15 (—) / 3 (—); corr_max 0.92 (0/283625, note REMOVE-at-end-of-Phase-24).
  - **B.2 Global gates (14):** min_depth 2000 (19/485) / 5000 (65/485); spread 1.0 (5/485)/3.0 (2/485)/0.5/1.5; min_volume 0 (inert); min_price (2342/60469); max_price (no cap); final_score_min/confidence_threshold/min_ohlc_history/SQE di floors (— results).
  - **B.3 Strategy gates (19):** value=enabled/disabled, result=VTS firing rate /1879 (vwap_pullback 941, morning_star 554, … breakout 0, inside_bar 0, strong_bull_trend 21=GATE-BYPASS, rest disabled 0).
  - **B.4/5 Friction (5):** fee taker 0.26% / maker 0.16% / spread 0.12% / slippage 0.05% / maxCost 0.50% (— results, calibrated vs observed).
  - **B.6 TEC priors (4):** trail 0.8×ATR, BE 1.0R, target 1.5R, moonbag disabled (— = posteriors are Phase-25).
  - **B.7 Sector (1):** "(not built)" — B.7 adds the gate.
  - **C Macro (1):** macro_modifier 1.0 no-op.
- **Phase-25 EXCLUDED** (correlation benchmark setup, TEC posteriors, win/loss).

## MODIFIED endpoint `server/routes.ts`
`SELECT ... , category, display_order, ...` + `ORDER BY display_order NULLS LAST, setting_key, scope`.

## MODIFIED `client/src/pages/analytics.tsx`
- Tab label `Calibration` → **`xStock Calibration`**.
- TabsList `grid w-full grid-cols-9 max-w-6xl` → **`flex flex-wrap h-auto w-full gap-1 max-w-6xl`** (wraps on narrow width; affects the 9 Analytics tabs — verify they still render + the tab body switches).
- Interface +`category`. Table body now `rows.reduce(...)` emitting a **category sub-header row** (`<td colSpan={8}>`) whenever `category` changes, then the data row. fmtCalibrationResult unchanged.

## MODIFIED `client/src/pages/machine-learning.tsx`
- ML tab label `xStocks` → **`xStocks Filter Diagnostics`** (line 3534). ML TabsList already `flex-wrap h-auto` — no wrap change needed.

## Review asks
- R1: migration DELETE+reseed idempotency + the category/display_order columns + does the ~60-row grouped set fairly map the Phase-24 surface (Phase-25 excluded)?
- R2: the `flex flex-wrap h-auto` TabsList — sound for wrapping without breaking the existing 8 Analytics tabs / tab-switching? (tailwind-merge should let `h-auto` override base `h-10`.)
- R3: the category-grouped `tbody` reduce (colSpan=8 subheader; keys `cat-${category}` / `r.id`) — OK?
- R4: anything before push → CI → deploy → staging-UI verify → your Step-8.
