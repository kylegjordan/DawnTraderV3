# B-CALSCORE · COMPLETION REPORT — Calibration Scoreboard tab

**Batch:** B-CALSCORE (Calibration Scoreboard tab). **Follow-on to B.0** (numbers-first baseline; Kyle 2026-06-02 "numbers first, tab next"). **CLOSED:** 2026-06-02. **Active trading:** OFF (read-only display; zero capital).
**Commit:** `c6d73bb1d`. **Migration:** `2026-06-02-b-calscore-ledger.sql` (+ rollback). **CI:** run `26786998299` — all-4-green (TypeScript Check, Test Suite, Build, Docker Build). **Deploy:** PM2 dawntrader online; migration applied (`✓ 2026-06-02-b-calscore-ledger.sql`).

---

## What it is
A read-only **"Calibration" tab on the Analytics page** showing one row per calibrated setting: current value + current result (% WITH raw counts) vs planned value + planned result, backed by a new `calibration_ledger` table seeded with the 10 B.0 baseline tunable settings (current side filled; planned side empty until each calibration sub-batch fills it). No win/loss (P&L = Phase 25). The live home for the whole Phase-24 calibration arc.

## Scope objectives — status
| # | Objective | Result |
|---|---|---|
| 1 | NEW `calibration_ledger` table (num/den SSOT, no stored pct; `planned_sub_batch`; grain unique idx) | ✅ migration applied; 10 rows seeded |
| 2 | NEW read-only `GET /api/analytics/calibration-scoreboard` | ✅ returns ok=true, count=10 |
| 3 | NEW Analytics "Calibration" tab, simple table, % WITH raw counts, no win/loss | ✅ renders all 10 rows |
| 4 | Seed = 10 tunable B.0 rows (regime row excluded per Langston C3) | ✅ 10 rows, 10 distinct grains |
| 5 | Additive only; nothing else modified except grid-cols-8→9 | ✅ confirmed |
| 6 | Idempotent seed; pct derived + Number()-coerced; 4 unit tests | ✅ tsc 0-net-new, vitest 4/4 |
| 7 | CI green + governance + completion report | ✅ this turn |

## Verification (outcomes-based)
- **Local bench (C:\dev):** `npx tsc --noEmit` = **493 = baseline → 0 net new** (no errors in calscore-format / b-calscore / analytics.tsx / the new endpoint). `npx vitest run b-calscore` = **4/4 pass** (formatter + C5 string-coercion + 0-numerator-is-0.00% + em-dash-for-empty).
- **CI:** run `26786998299` all-4-green.
- **psql (staging, post-deploy):** `SELECT count(*) FROM calibration_ledger WHERE sub_batch='B.0' AND asset_class='xstock_spot'` = **10**; `count(DISTINCT (setting_key,scope))` = **10** (Langston R1 silent-drop check — passed).
- **Endpoint:** `GET /api/analytics/calibration-scoreboard?asset_class=xstock_spot` → ok=true, count=10, num/den present.
- **STAGING UI (§9.3 — Claude-in-Chrome, NOT curl-only):** navigated `/analytics`, opened the **Calibration** tab; all 10 rows render with current value + current result `% (num/den)` + planned `—` + status `baseline`. Confirmed values: lq_min family_imf **69.69% (338/485)**; corr_max imf_all **0.00% (0/283,625)** (dead gate renders 0.00%, not em-dash); di_max reversal 31.91% (18,103/56,725); etc. Empty planned side = em-dash. Screenshot captured.
- **Langston Step-8 (independent) — CONFIRMED:** independently verified against staging (minted his own JWT, queried DB + endpoint): DB count=10 / distinct-grain=10 (R1 silent-drop check passed); endpoint HTTP 200, ok=true, count=10, num/den present, spot-checks match (lq_min/family_imf 338/485, corr_max/imf_all 0/283625), planned side null, status baseline — "no discrepancy on any axis. Ship is good."

## Governance files changed
`BATCH_CATALOG.md` (B-CALSCORE row), `PHASE_HISTORY.md` (calibration-tooling note), `SYSTEM_IMPACT_MAP.md` (NEW calibration_ledger table + endpoint + Analytics tab — additive), `MEMORY.md` (3-way), plus scope/change-list in `Claude Comms and Packages/`. This report.

## Langston review trail
Step-1 ACK with C1–C5 changes (all absorbed: planned_sub_batch; pct dropped/derived; scope naming convention; 10 tunable rows, regime excluded; idempotent ON CONFLICT; Number()-coerced formatter; 4th test = string-coercion guard). Step-4 code-review ACK clean to push (R1 row-count + R3 tab-value match flagged as staging-verifiable — both confirmed = 10 rows, tab renders). Step-8 independent verification: **CONFIRMED** (DB count=10/distinct=10; endpoint 200/count=10/num-den-match; "ship is good").

## Asset-class onboarding workflow learnings (§3.3)
**The B.0 pre-calibration baseline — which B-CALSCORE turns into a live surface — is itself a major asset-class onboarding learning** (Kyle 2026-06-02: "this whole baseline is a big part of our asset-class onboarding workflow"). Captured into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` this turn as new standing steps/checklist items.
- **(a) What worked well.** Baseline-before-calibrate (rolling-window rates WITH raw counts, operational-event overlay, "definitely off" list) surfaced the genuinely mis-set settings instead of guessing — it's where the broken ones get found. A data-availability map first (clean / replay / forward-only / stale) stopped us promising numbers we couldn't retrieve. The scoreboard pattern (num/den SSOT, pct derived in a pure shared formatter) kept the "numbers don't add up" risk out of a numbers-first UI and made the only risky logic — pg string-coercion — unit-testable without React.
- **(b) What surprised us.** The carryover-scale trap: `lq_min=43` (a crypto-VOLUME value) silently became a ~$20k DEPTH bar on xStock rejecting ~70%. A carried-over feature (correlation) was BOTH mis-placed (inside IMF; canonical IMF = LQ/VN/DI) AND non-functional (no benchmark → constant 0.5 → 0 rejections). The 3-week regime average masked a drifting distribution.
- **(c) Recurring structural pattern.** "Numeric carryover ≠ valid carryover" — every cloned setting/component needs re-derivation against the new class's actual data + a layer-placement check + a wired-not-stub check. Two gates can measure different book STATISTICS, not just different levels (LQ ask-only vs min_depth min(ask,bid)).
- **(d) Onboarding-doc edits applied this turn.** Added to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`: a "Pre-calibration baseline" standing step (before Step 7b Calibration cycle), a "carryover audit" checklist item, a "data-availability map" step, and reinforced disciplines (event-overlay, date-segment-before-anomaly, verify-feed-inventory). Doc organization deferred to post-Phase-24 (Kyle) — learnings captured now so they are not lost.

## Follow-ups
- Each later calibration sub-batch (B.2 lead = lq_min recalibration) fills the `planned_value` / `planned_result` / `planned_sub_batch` side of its rows via its own migration (sets `updated_at` explicitly, status → proposed/applied).
- Future (optional): an `asset_class` toggle on the tab if crypto rows are later seeded; a write-path if interactive editing is ever wanted (not now — read-only by design).

---

## B-CALSCORE.b — COMPREHENSIVE re-seed (2026-06-02; supersedes the v1 10-row board)
**Why:** Kyle 2026-06-02 — the v1 board showed only the 10 headline "definitely off" findings, which misrepresented the scope (and made the path-scopes look arbitrary). Re-seeded with the FULL Phase-24 xStock calibration surface.
**What:** **64 rows across 8 categories** (added `category` + `display_order` columns; migration `2026-06-02b-calscore-comprehensive.sql`, DELETE+reseed idempotent): **B.1 Regime (5)** · **B.2 IMF filters (15)** · **B.2 Global gates (14)** · **B.3 Strategy gates (19)** · **B.4/5 Friction (5)** · **B.6 TEC priors (4)** · **B.7 Sector (1, not-built)** · **C Macro (1)**. Grouped per Kyle's "full categories, grouped rows" (filter paths sharing a value collapse to one row with a path count in `scope`); **Phase-25 EXCLUDED** (correlation benchmark, TEC posteriors, win/loss). 3 display fixes: tab `Calibration`→**`xStock Calibration`**; Analytics TabsList `grid-cols-9`→**`flex flex-wrap h-auto`** (wraps to 2 rows on narrow width); ML page tab `xStocks`→**`xStocks Filter Diagnostics`**.
**Verification:** deploy `856936444`, CI run `26808790381` all-4-green; migration applied; tsc 493=baseline (0 net new), vitest 4/4. psql: **64 rows / 64 distinct grain / 0 null category / 0 null order**; 8 categories in contiguous display_order blocks (10-14/20-34/40-53/60-78/80-84/90-93/100/110). Endpoint count=64. **Staging-UI-verified (§9.3):** xStock Calibration tab active, grouped board renders with category headers + rates+raw-counts (regime RANGE_BOUND 0.14% (8,437/5,970,917); lq_min 43→60.44% (34,285/56,725)); tab bar wraps to 2 rows (all 9 tabs); ML tab renamed. Langston Step-4 conditional ACK — 3 conditions (IF-NOT-EXISTS on both cols / distinct grain no-silent-drop / contiguous display_order no-interleave) all verified met; Step-8 independent CONFIRMED.
