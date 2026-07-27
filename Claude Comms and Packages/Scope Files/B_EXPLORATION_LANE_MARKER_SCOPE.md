# B-EXPLORATION-LANE-MARKER — SCOPE + PRE-AUDIT

change-class: non_architecture

**Owner:** Claude Analyst (CC-C) · Kyle-directed (2026-07-27, scratch list item A2). Crew board: claim id 43. **Client-only, display-only.**

## OBJECTIVE
Add a **"Lane"** marker column to the paper **Open Trades** and **Closed Trades** tables showing which trades were admitted via the **exploration lane** (learning-data budget) vs the normal net-EV lane. The data (`metadata.admissionBasis === 'exploration'`) is ALREADY stored on every trade; this only surfaces it. Removable when exploration mode ends.

## PRE-AUDIT — root cause (traced in code)
- `admissionBasis` is stamped into trade metadata server-side (`signal-orchestrator.ts`, `active-execution-engine.ts:2770`, `ready_to_buy_service.ts:1128`) and queried by `exploration-lane.ts` (`metadata->>'admissionBasis' = 'exploration'`). It is NOT carried to the client — the adapter (`paper-trade-adapter.ts`) never mapped it, so the tables can't show it.
- The paper Open/Closed tabs mount the SHARED VTS-mirror tables (`vts-open-trades-table.tsx`, `vts-closed-trades-table.tsx`) through the pure adapter. Both shared tables expose a **paper-only appended-column mechanism** (`extraHeaders` + `renderExtraCells`, default OFF → VTS tabs untouched). No shared-table internals change.

## CHANGE (additive; tsc-clean; adapter tests 15/15 green)
1. `paper-trade-adapter.ts` — add `admissionBasis?: string | null` to `AdaptedOpenTrade` + `AdaptedClosedTrade`; map `admissionBasis: metaStr(meta, "admissionBasis") ?? null` in both `adaptPaperOpenTrade` + `adaptPaperClosedTrade` (honest-absence: null when absent, never fabricated).
2. `paper-open-trades-tab.tsx` — add a "Lane" `<th>` to `extraHeaders` (before Source) + a cell to `renderExtraCells`: an `EXPL` badge when `admissionBasis === 'exploration'`, else `—`.
3. `trade-history-tab.tsx` (paper Closed tab) — add `extraHeaders` + `renderExtraCells` to the `ClosedTradesTable` mount with the same Lane column; import `type AdaptedClosedTrade` for the cast.

## VERIFICATION
- tsc: no new errors in the 3 files ✅; `paper-trade-adapter.test.ts` 15/15 ✅.
- **§9.3 (staging UI):** navigate the paper Open + Closed tabs; confirm the "Lane" column renders, exploration-admitted trades show the `EXPL` badge, others show `—`. Cross-check against the DB (`metadata->>'admissionBasis'`). No new xStock open needed — the marker reflects existing stored data on all rows.

## GOVERNANCE
Tier-1 at close: BATCH_CATALOG, PHASE_HISTORY, completion report, PHASE_19_PLAN row. SIM: brief note (the adapter now carries `admissionBasis` to the client display shape). System Manual: N/A (display-plumbing only; no architecture/strategy/regime/math change). No RUNNING_ISSUES entry (scratch-list item, not a tracked issue).
