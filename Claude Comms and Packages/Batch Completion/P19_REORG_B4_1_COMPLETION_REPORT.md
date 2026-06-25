# P19 reorg-B4.1 — Completion Report

**Batch:** reorg-B4.1 — shadow-trading visibility tab + per-cycle pool-membership record
**change-class:** architecture · Owner CC-B · reviewer Langston
**Date closed:** 2026-06-26
**Deploy:** staging `153cc4235` restart#419 · CI 4-green run `28204773605` · migration `2026-06-26-p19-reorg-b4-1-shadow-pool-members.sql` applied
**Origin:** Kyle directive 2026-06-26 — "build a tab to see the shadow-trading results (trading page, after Trade History); take it to verified completion incl. a look on the staging UI."

---

> 🚨 **THE TAB RENDERS EMPTY UNTIL PAPER-MODE ACTIVE TRADING IS TURNED ON (~B9).** rtb_total=0 today → no promotion cycles → no shadow rows. The tab + endpoint are WIRED, deployed, and UI-verified (empty-state + a seed-then-clean populated proof), but show live rows only after paper-active turn-on. §9.1 forward-instrumentation.

## What it is

reorg-B4 built the shadow-trade engine but no visibility. This batch adds the **"Shadows" tab** on the trading page (after Trade History) showing, per promotion cycle, the ranked ready-to-buy pool with the promoted pick marked and each candidate's realized outcome beside it — the "did the ranker pick the best of the field?" view — plus the shadows currently in flight and a selection-quality summary. It also closes the per-cycle-capture gap Kyle's mechanics question exposed.

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Per-cycle pool-membership capture (additive two-table) | ✅ YES | NEW `rtb_shadow_pool_members` (event grain, one row/cycle×signal) FK'd to `rtb_shadow_pairings` (entity grain). `captureShadowPool` writes a member row every cycle; `registerOpenShadowTrade` dedupe-return widened null→existing-id. |
| OBJ-2 | Read endpoint | ✅ YES | `GET /api/shadow-trades/by-cycle` (read-only): CTE cycles→members→LEFT JOIN outcomes + open-shadows + a selection-quality summary aggregate. Live on staging (serves the dormant state cleanly). |
| OBJ-3 | UI tab | ✅ YES | "Shadows" tab (`active-trades.tsx` grid 5→6 + `shadow-trades-tab.tsx`): per-cycle pool table (rank, Promoted badge, FinalScore, outcome, Net%, R, hold, best-trophy), summary cards, open-shadows, honest dormant empty-state. |
| OBJ-4 | Staging UI verification (§9.3, Claude-in-Chrome) | ✅ YES | Navigated the live staging UI: empty-state clean → seeded 2 demo cycles → screenshot populated → DELETED seed → back to dormant. See below. |
| OBJ-5 | Isolation preserved | ✅ YES | The member-write is sink-pure (`insertShadowPoolMember` writes ONLY `rtb_shadow_pool_members`); endpoint read-only; reorg-B4 isolation (separate Map / allowlist close / `VTS_OPEN_TRADES_EXCLUDE_SHADOW` / rehydration split) unchanged. Tests pin it. |

## The grain fix (OBJ-1, the design)

reorg-B4 stamped rank/`promoted` only at a signal's FIRST appearance, so a signal that lingered (rank drifting) or was promoted on a LATER cycle couldn't be reconstructed. Additive two-table (Langston Step-1 approved; the single-table-UPDATE and full-rename alternatives rejected):
- `rtb_shadow_pairings` STAYS the resolving shadow TRADE + outcome (deduped one-per-signal — outcome never duplicates).
- NEW `rtb_shadow_pool_members` = EVENT grain, one row per (cycle × signal), written every cycle, FK `shadow_trade_id` → `rtb_shadow_pairings.id`.
- **Transactional boundary (Langston Step-2):** resolve the trade id FIRST → only write the member row when non-null (dangling FK impossible by construction) → member-write failure logged + tolerated. **The FK is LOGICAL** (`NOT NULL`, no DB `REFERENCES`/CASCADE — Step-4 F3): integrity is the resolve-first ordering, chosen so a fire-and-forget member-write can't fail on a hard constraint.
- **`pool_size` is stamped** at capture from the ranked-signal count; readers use it for "N candidates", NEVER `COUNT(*)` (a tolerated member-write skip can leave fewer rows — Langston Step-2 watch item, tested).

## Langston Step-4 — CHANGES-NEEDED, fixed this batch

Step-4 was an approve-with-changes: **F1 (must fix)** — the selection-quality summary scored a cycle before all its members had closed, so the headline "promoted = best %" could credit the ranker prematurely and silently flip on a later recompute (the §11 self-correcting-wrong pattern on the headline metric). **F2 (should-fix)** — the summary was page-scoped but read as lifetime stats. Both collapsed into one fix: the per-page JS loop was replaced with a **single SQL aggregate over all fully-closed cycles** — `bool_and(p.closed)` gates each cycle on the whole field resolving, `percentile_cont(0.5)` is the real median, and it's independent of `LIMIT/OFFSET` so the cards are stable lifetime stats. **F3** (logical-FK wording) folded into the SIM. A new test pins `bool_and(p.closed)` + that the old JS loop is gone.

## OBJ-4 — staging UI verification (Claude-in-Chrome, §9.3)

1. **Empty-state:** navigated `/active-trades` → "Shadows" tab (correctly placed after Trade History) → renders clean: header + explainer, 4 summary cards (Cycles Captured 0 / Promoted=Best — / Promoted≥Median — / Open Shadows 0), the honest dormant message. No undefined / `--` / layout break.
2. **Populated (seed-then-clean):** seeded 2 demo cycles (5 pairings + 5 members). Cycle-1 (3 candidates, fully closed) deliberately had the promoted BTC (+1.80%) NOT be best — ETH at rank 2 finished +3.10%. The tab showed exactly that: summary **Cycles Captured 2, Promoted=Best 0% (0/1), Promoted≥Median 100% (1/1)** — proving the `bool_and` all-closed gate (only cycle-1 scored; cycle-2 had an open member → "resolving…" + excluded) and the percentile median. Per-cycle table rendered rank, Promoted badge, FinalScore, outcome badges (target_hit green / stop_hit red / Open), Net P/L %, R, hold, and the best-outcome trophy on ETH. The open ADA shadow showed in "Open Shadows (1)". **net_pnl is a fraction** — +1.80% rendered from 0.018 (Langston's 100× check passes).
3. **Cleanup:** DELETED the 5+5 seed rows (cycle_key prefix `paper|all|SEEDB41`) → re-refreshed → tab back to clean dormant empty-state; both tables confirmed total = 0.

## Bench / CI / deploy
- tsc baseline OK no-regressions (client + server). reorg-b4-1 **9/9**; reorg-b4 isolation 20/20 + table 2/2 unaffected; full unit suite **1873 pass** (3 ECONNREFUSED-no-Postgres env files).
- CI run `28204773605` = **4-green**. Deploy: restart#419, `db:migrate` applied the migration; psql confirms `rtb_shadow_pool_members` + 3 indexes + pkey; HTTP 200; endpoint returns the dormant state cleanly.

## Files changed
`shared/schema.ts` (rtbShadowPoolMembers + types), migration + MANIFEST, `server/services/rtb-shadow-store.ts` (insertShadowPoolMember), `server/services/vts-runner.ts` (dedupe null→id), `server/core/rtb/ready_to_buy_service.ts` (captureShadowPool member-write + pool_size stamp), `server/routes.ts` (GET /api/shadow-trades/by-cycle + the F1/F2 aggregate), `client/src/pages/active-trades.tsx` (Shadows tab), NEW `client/src/components/trading/shadow-trades-tab.tsx`, NEW `server/tests/unit/reorg-b4-1-shadow-pool-members.test.ts`, `server/tests/unit/reorg-b4-shadow-isolation.test.ts` (1-line refactor sync).

## Governance files changed
RUNNING_ISSUES.md (#390 retention → B9, in words), SYSTEM_IMPACT_MAP.md (reorg-B4.1 fold into the reorg-B4 callout + logical-FK wording), SYSTEM_MANUAL.md (§19.8 extension), BATCH_CATALOG.md, PHASE_HISTORY.md, PHASE_19_PLAN.md (§1 + §5), this report, MEMORY_CC_B mirror, Langston `/home/langston/MEMORY.md` (10.b).

## Open follow-up
- **#390 (B9):** `rtb_shadow_pool_members` retention sweep (un-deduped member rows grow once paper-active is on) — a plain-table age-delete pass, to land before the table fills.

**Status: CLOSED pending Kyle's acknowledgment.**
