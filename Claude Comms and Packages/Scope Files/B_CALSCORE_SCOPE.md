# B-CALSCORE — CALIBRATION SCOREBOARD TAB — SCOPE v1

**Status:** DRAFT v1 — pending Langston Step-1 ACK.
**From:** CC  **To:** Langston (Step-1 reviewer)  **Date:** 2026-06-02
**Position:** Follow-on to B.0 (the numbers-first baseline report, Langston-reviewed). Kyle directive 2026-06-02: build the side-by-side comparison TAB as its own batch ("numbers first, tab next"). Read-only display surface for the whole Phase-24 calibration arc. Kyle: **keep it as simple as possible** (no multi-sub-batch / hotfix churn). Active trading OFF throughout.

---

## §1. What it is
A new **Analytics-page tab "Calibration Scoreboard"** showing, one row per calibrated setting: the setting, its scope, its **current value + current result (% WITH raw counts)**, the **planned value + planned result (% WITH raw counts)**, and a status. Backed by a new `calibration_ledger` table seeded with the B.0 baseline (current side filled; planned side empty until each calibration sub-batch fills it). **No win/loss columns** (P&L = Phase 25). NO time-window selector, NO regime selector — it's a static ledger, not a time series (simplicity).

## §2. Surfaces (additive only — no existing panel/endpoint/table modified)
- **DB (new):** `calibration_ledger` (shared/schema.ts + migration `2026-06-02-b-calscore-ledger.sql` + rollback + MANIFEST). Columns: `id` uuid pk · `sub_batch` · `asset_class` (default xstock_spot) · `setting_key` · `scope` · `metric_label` · `current_value` text · `current_result_pct` numeric(6,2) · `current_result_num` bigint · `current_result_den` bigint · `planned_value` text (nullable) · `planned_result_pct` numeric (nullable) · `planned_result_num`/`_den` bigint (nullable) · `status` (baseline|proposed|applied|provisional) · `decision_grade` bool · `notes` · `updated_at` · `created_at`. Unique idx `(sub_batch, asset_class, setting_key, scope)`; idx `(asset_class)`.
- **Endpoint (new):** `GET /api/analytics/calibration-scoreboard?asset_class=xstock_spot` → `{ ok, data: { rows: [...] } }`, ordered `sub_batch, setting_key, scope`. `authenticateToken`; `db.execute(sql...)` direct read (mirrors `/api/xstocks/exit-strategy-ablation`). No write path (rows are seeded/updated by per-batch migrations).
- **Frontend (new):** `CalibrationScoreboardSection` in `client/src/pages/analytics.tsx` (mirrors `ExitStrategyAblationSection`); react-query `useQuery` + `apiFetch`; plain `<table>` with `overflow-x-auto`. New `<TabsTrigger value="calscore">` + `<TabsContent>` in the Analytics Tabs block. Columns: Sub-batch · Setting · Scope · Current value · **Current result** (`69.70% (338/485)` format) · Planned value · **Planned result** · Status. Planned cells show `—` when null. Empty-state message.

## §3. Seed (B.0 baseline → ledger rows; current side only, planned NULL)
`lq_min` (family trend/reversal/breakout/oscillator, val 43) reject **69.70% (338/485 RTH, ask-depth<~$19,950)** — decision_grade=true (FINDING; target NOT yet, note "off 1 day, thicken-forward"); `lq_min` (strong_trend, 30/35) reject ~2-4%; `min_depth_usd` (quant/pattern vts 2000) reject **3.9% (19/485)**; (active 5000) reject **13.4% (65/485)**; `max_bid_ask_spread` (most, 1.0%) reject **1.0% (5/485)**; (quant/pattern 3.0%) reject **0.4% (2/485)**; `corr_max` (IMF, 0.92) reject **0.00% (0/283,625)** — note "non-functional, no benchmark; REMOVE from IMF at end of calibrations"; `vn_max` (vts 0.95) reject **0.92% (2,603/283,625 live)**; `di_max` (reversal 40) reject **31.9% live**; (oscillator 35) reject **35.4% live**; regime `RANGE_BOUND_STABLE` share **0.14% (8,437/5,970,917 3wk)** — note "near-never; B.1". (~11 rows.)

## §4. Tests
Unit (vitest, in C:\dev): (a) endpoint read returns seeded rows shape; (b) empty-state when no rows for an asset_class; (c) the `% (num/den)` formatter renders raw counts beside the rate. No behavior-path tests (read-only display).

## §5. Verification (Kyle directive — VERIFY ON STAGING UI, §9.3)
Claude-in-Chrome: navigate staging `/analytics`, open the **Calibration Scoreboard** tab, confirm the seeded rows render with current value + current result `% (raw)` + planned `—` + status; screenshot. NOT curl-only.

## §6. Guardrails
Additive-only; no change to existing panels/endpoints/tables; read-only (no write API); xStock-seeded but schema is asset-class-general; NO win/loss; simplicity over features (no selectors). NO PATCHES — proper table + endpoint + component, not a hardcoded page.

## §7. Langston Step-1 asks
- **C1.** Schema columns + the `(sub_batch, asset_class, setting_key, scope)` unique key — right grain? Anything to add/drop (you flagged in B.0 that current-vs-planned needs raw counts on BOTH sides — done; status enum OK)?
- **C2.** Endpoint path `/api/analytics/calibration-scoreboard` + Analytics-page placement (vs a Diagnostics page) — agree it belongs beside the existing Factor-Calibration / Exit-Ablation comparison panels?
- **C3.** Seed-row set (§3) — correct subset to show now? Include the regime/strategy rows or keep to threshold/gate rows only?
- **C4.** Consumer-enumeration (B.0 lesson): adding a `<TabsTrigger>`/`<TabsContent>` to the shared Analytics Tabs — any blast-radius concern, or is it cleanly additive (grid-cols count is the only shared edit)?
- **C5.** Anything else before Step-2 pre-audit / implementation.

## §8. Langston Step-1 ACK — changes absorbed (v2, 2026-06-02)
ACK with required changes; CC concurs on all (tighten grain, no scope growth).
- **C1.1** ADD `planned_sub_batch` (nullable) = which batch PROPOSED the planned value; `sub_batch` = the batch that ESTABLISHED the current/baseline value.
- **C1.2** `scope` = free-text WITH naming convention (NOT enum). Seed scopes: `family_imf` (trend/reversal/breakout/oscillator share lq_min=43) · `family_strong_trend_vts` · `quant_pattern_vts` · `quant_pattern_active` · `global_most` · `global_quant_pattern` · `imf_all` · `imf_vts` · `family_reversal` · `family_oscillator`. Disambiguates the unique key.
- **C1.3** num/den = SSOT; **DROP the `*_result_pct` columns** — pct DERIVED in endpoint/formatter from num/den (no hand-typed pct → no drift).
- **C1.4** planned-side fill: each per-batch migration sets `updated_at` explicitly (no trigger).
- **C2** Top-level Analytics tab, label **"Calibration"** (short, grid-cols-9), positioned AFTER "Drift Dashboard". (Crypto Factor-Cal/Exit-Ablation panels are nested in Drift Dashboard; xStock versions live on the ML page — the scoreboard is a broader cross-arc summary, correctly its own top-level tab.)
- **C3** Seed = **10 tunable threshold/gate rows ONLY**; EXCLUDE the RANGE_BOUND regime observation from v1. strong_trend lq_min seeded with REAL num/den. Every current_result carries real num/den. The 10 rows (RTH unless noted; reject = num/den):
  1. `lq_min` / `family_imf` / **43** / 338/485 / note "#1 finding; TARGET not yet — off ~1 day, thicken-forward" / decision_grade=true
  2. `lq_min` / `family_strong_trend_vts` / **30** / 9/485 / note "active=35 → 19/485 (3.9%); barely filters"
  3. `min_depth_usd` / `quant_pattern_vts` / **2000** / 19/485 / min(ask,bid)
  4. `min_depth_usd` / `quant_pattern_active` / **5000** / 65/485 / min(ask,bid)
  5. `max_bid_ask_spread` / `global_most` / **1.0** / 5/485
  6. `max_bid_ask_spread` / `global_quant_pattern` / **3.0** / 2/485
  7. `corr_max` / `imf_all` / **0.92** / 0/283625 (rolling-24h IMF) / note "NON-FUNCTIONAL (no benchmark→0.5); REMOVE from IMF at end of calibrations"
  8. `vn_max` / `imf_vts` / **0.95** / 2603/283625 (rolling-24h IMF)
  9. `di_max` / `family_reversal` / **40** / 18103/56725 (rolling-24h)
  10. `di_max` / `family_oscillator` / **35** / 20069/56725 (rolling-24h)
- **C4** Confirmed cleanly additive (Langston code-grounded): `activeTab` = local useState, nothing consumes the tab id; only shared edit = `grid-cols-8`→`grid-cols-9` (analytics.tsx:3217). Step-4 invariant: TabsTrigger/TabsContent `value="calscore"` must match EXACTLY (Radix renders blank silently on mismatch).
- **C5** seed `ON CONFLICT (...) DO NOTHING` (idempotent); formatter **`Number()`-coerces num/den** (pg returns numeric/bigint as strings) before computing pct; ADD 4th unit test (unique-constraint rejects duplicate grain).
- **Pre-audit (lightweight, additive):** SIM impact = NEW `calibration_ledger` table + NEW `/api/analytics/calibration-scoreboard` endpoint + NEW Analytics tab; NO existing component/endpoint/table modified except the grid-cols count. Blast radius additive (C4). → proceed to implementation.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive mount. File staged to `/home/langston/inbox/b-calscore/` via SCP. Use `ssh staging` for repo-side inspection.
