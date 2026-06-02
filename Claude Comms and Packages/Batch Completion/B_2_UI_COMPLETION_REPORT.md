# B.2.UI — Completion Report

**Batch:** B.2.UI (Phase 24, B-XSTOCK-CALIB umbrella — B.2 support). **Closed:** 2026-06-02.
**Deploy:** commit `ae29735ec`; CI run `26826979214` all-4-green (TypeScript Check baseline gate, Test Suite, Build, Docker Build); staging HTTP 200; PM2 dawntrader restarted (#343).
**Mode:** active trading OFF / VTS-passive throughout. Additive, display-only — no calibration/threshold/gate change.

---

## What shipped

A NEW **"Volume / Order Book"** column on BOTH the Open and Closed **Simulated Trades** tables (Machine Learning page), inserted immediately after the **TEC State** column, plus the order-book-depth gate (**`failed_min_depth`**, labeled **"Min Depth"**) surfaced in the **xStocks Filter Diagnostics** tab (last-scan + 24h sections).

- **Cell is asset-aware:** xStock → `$<depth> · OB` (ask-side order-book depth USD); crypto → `<vol> QTY` (native 24h coin-unit volume, no USD conversion — per Kyle's 2026-06-02 design refinement, which removed the crypto-USD units risk).
- **Field contract:** `entryLiquidityValue` (number) + `entryLiquidityKind` (`'depth_usd' | 'volume_qty'`), captured at trade-OPEN, propagated open → close → JSONL → both ML feeds.
- **Scope boundary:** ONLY the VTS simulated-trade tables (ML page) + the xStocks Filter Diagnostics tab. NOT the active-trading / RTB / live-history tables (those are Phase 19 / 25).

---

## Scope objectives checklist

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | "Volume / Order Book" column after TEC State on the **Open** Simulated Trades table | ✅ YES | §9.3 Claude-in-Chrome: header renders on staging (exact tooltip matched). |
| 2 | Same column on the **Closed** Simulated Trades table | ✅ YES | §9.3 Claude-in-Chrome: header renders after switching to Closed Trades (7d) tab. |
| 3 | Capture entry-liquidity per VTS trade at trade-open (xStock depth; crypto coin-volume) | ✅ YES | Live open feed: fresh post-deploy opens carry values — crypto BIO/EUR `2,445,622.39 volume_qty`; xStocks PGR `$19,389`, NTAP `$36,806`, MU `$82,872.8`, TT `$18,224` (all `depth_usd`). Kind discrimination correct per class. |
| 4 | Surface `failed_min_depth` ("Min Depth") in xStocks Filter Diagnostics, last-scan + 24h | ✅ YES | §9.3 Claude-in-Chrome: "Min Depth" label present in BOTH the last-scan filter-breakdown table and the 24h rolling-aggregates table. |
| 5 | Additive only — no calibration / threshold / crypto-path regression | ✅ YES | tsc whole-project 493 == 493 (zero net new); vitest failing-set identical before/after (11 DB-backed integration files that need a DB the bench lacks — CI runs them green). |

**Verification split (§9.3):** CC ran the Claude-in-Chrome UI pass (objectives 1, 2, 4 — column headers + Min Depth rows). Langston independently verified the data layer via staging SSH (objective 3 + the null-boundary + closed-side write). Together = full coverage.

**Langston:** Step-4 code review **approved as-is** (Q1 ask-only depth signed off; Q2 no-new-unit-test accepted; Q3 data-confirmation folded into §9.3). Step-8 **PASS** on the data confirmation — independently confirmed 5 populated / 234 null at the exact pre/post-deploy boundary, correct kind discrimination, closed-side write present.

---

## Caveats (§9.1-style)

- **Existing trades show "—".** Capture is at trade-OPEN; the ~235 open + ~1,700 closed trades that pre-date this deploy carry no entry-liquidity and render "—". No backfill (per-trade entry depth isn't reconstructable for past trades). Only trades opened AFTER deploy populate the column.
- **Closed-side non-null populates as fresh opens close.** The close-path writes the field into the JSONL now (confirmed on disk), but every trade closing immediately post-deploy was *opened* pre-deploy → writes `null` (the documented dash). The first non-null closed value appears once a post-deploy-opened trade cycles to close. Code path verified end-to-end (vts-service writes `?? null`; export-csv whitelist reads with `typeof` guards).
- **xStock guard is `>= 0` (not `> 0`).** Matches the scanner's `-1` unavailable-sentinel convention; a genuine zero-depth xStock would render `$0 · OB`, but the LQ gate floors depth above zero before a trade opens, so it won't occur in practice. Langston flagged as a non-blocking nit; kept for sentinel-convention consistency.

---

## Code changes (6 files, +115/-3)

| File | Change |
|---|---|
| `server/asset_classes/xstock_spot/eval-cycle.ts` | Capture xStock ask-depth at trade-open (`entryLiquidityValue`/`entryLiquidityKind='depth_usd'`). |
| `server/services/vts-runner.ts` | `OpenVirtualTrade` + `RegisterOpenVtsTradeInput` interfaces; crypto inline-builder capture (`volume24h`/`volume_qty`, class-guarded); open mapping; open-feed type + push; close-copy. |
| `server/services/vts-service.ts` | `persistRealPriceTrade` param type + persisted-record write into the JSONL (the load-bearing close-write link). |
| `server/utils/export-csv.ts` | `getClosedVTSTradesFromLogs` return-type + whitelist passthrough (closed feed). |
| `server/routes.ts` | `failed_min_depth` in 4 diagnostics builders (empty + passthrough, global + pattern). |
| `client/src/pages/machine-learning.tsx` | `OpenTrade`/`ClosedTrade` interfaces; `formatEntryLiquidity` helper; "Volume / Order Book" column + cell on both tables; colSpan bumps; `failed_min_depth → 'Min Depth'` label. |

No DB migration (fields ride the `context` JSONB on `vts_open_trades` via `splitTradeForPersist`).

---

## Governance files changed

- `1-system-manual/BATCH_CATALOG.md` — B.2.UI umbrella row.
- `1-system-manual/PHASE_HISTORY.md` — Phase 24 progress note.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — entry-liquidity capture field + diagnostics surface note.
- `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — observability-field plumbing checklist + scoreboard-all-settings note (see below).
- `.claude/memory/MEMORY.md` (truth + in-repo persistence copy) + Langston `/home/langston/MEMORY.md`.
- `Claude Comms and Packages/Scope Files/B_2_UI_SCOPE.md` (scope) + `Langston Design Asks/B_2_UI_step4_review_v1.md` (embedded-diff review).
- This report.

System Manual not updated: no architecture / strategy / regime / filter-design / quantitative-math change (display-only additive observability field).

---

## Asset-class onboarding workflow learnings (§3.3 — mandatory for Phase 24)

**(a) What worked well.** Capturing the entry-liquidity at the trade-open site is cheap and clean — the value (ask-depth for xStock, 24h coin-volume for crypto) is already in scope at the open call, so capture is a constant-time object-set with no new query. Riding the `context` JSONB meant zero schema migration and zero rehydration-mapping change.

**(b) What surprised us.** The closed-trade record is built by **explicit field-mapping, not a spread** (`vts-service.ts`), and `logTrade()` writes that exact object to the JSONL. So adding an observability field that must survive to the Closed table needs a SECOND, easily-missed write site beyond the open-capture — without it the closed-feed whitelist reads nothing. Caught locally via a scoped before/after tsc diff that isolated exactly one new error (the close-copy object literal), which pointed straight at the missing param-type + persisted-record edits.

**(c) Recurring structural pattern.** An observability field on a VTS trade has a **5-site plumbing chain**: (1) capture at open, (2) open read-feed (`getOpenVirtualTradesForML` type + push), (3) close-copy (vts-runner → persist), (4) persist-write into the JSONL record (vts-service explicit map), (5) closed read-feed whitelist (export-csv type + map). Missing any one silently degrades to "—" with NO tsc error (the persisted record is cast `as any`). This is the same "buried read-path whitelist" theme seen in F-NOW.

**(d) Concrete edits applied to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`.** Added a "VTS observability-field plumbing" checklist enumerating the 5 sites + the `as any` blind-spot warning (verify via live feed, not just tsc). Also recorded Kyle's 2026-06-02 directive that the **Calibration Scoreboard now covers ALL calibrated settings, not only the ones flagged insufficient** (expanded in B-CALSCORE.b to 64 rows / 8 categories) — so future onboarding treats the scoreboard as the full before/after surface for an asset class, not a partial one.
