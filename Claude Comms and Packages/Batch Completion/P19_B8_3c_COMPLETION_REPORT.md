# P19-B8.3c — Completion Report

**Batch:** P19-B8.3c — restore the open/closed trade COUNT atop the trade tabs
**Change-class:** non_architecture (pure presentational; no endpoint / migration / behavior change)
**Date closed:** 2026-07-07
**Head:** `315e9b680`, CI 4-green (`28830514722`), deployed staging restart, HTTP 200, NO migration.
**Origin:** Kyle-directed via OLD Claude (CC-A), who root-traced the cause and owns the Kyle visual-verify follow-through.
**Reviews:** Langston combined Step-1/Step-4 PROCEED (count-matches-rows verified against live source ×2) · §9.3 (Paper "Active Trades (0)" LIVE-confirmed via Claude-in-Chrome; VTS Open/Closed counts source-verified — see the honest partial below) · Step-8.

## Root cause
The trade counts that used to sit atop each trade tab were dropped in the **B8.1** client restructure (C1 — extracting the VTS Open/Closed tables out of the machine-learning page; C3 — the three-mode-page split). The old machine-learning page showed them; the extracted/split components didn't carry them over.

## Objective — outcome

| Surface | Component | Change |
|---|---|---|
| VTS Open | `VtsOpenTradesTab` (`vts-tabs.tsx`) | **DONE** — "Open Simulated Trades **(N)**", `data.trades.length`, guarded `!isError && data?.trades` (no "(0)"-flash during load/error). |
| VTS Closed | `VtsClosedTradesTab` (`vts-tabs.tsx`) | **DONE** — "Closed Simulated Trades (Last 7 Days) **(N)**", same guard. |
| Paper/Live Open | `ActiveTradesV2` (shared, mode-keyed) | **DONE** — "Active Trades **(N)**" = `positions.length` (the mode-scoped array already driving the table → count and rows can't disagree, reflects the active mode). |
| Paper/Live Closed | `TradeHistoryTab` | **NO CHANGE — already compliant.** ★ Finding: the header ALREADY shows "{totalCount} total trades" (`:686`, the paginated query's real `totalCount`). OLD Claude's trace assumed all four dropped; TradeHistoryTab was not among them. Left unchanged rather than adding a redundant second count (which could contradict its real paginated total). |

**Net: 3 components / 2 files** (`vts-tabs.tsx` + `active-trades-v2.tsx`), not four. Counts reflect the RENDERED rows (`.length`) — header and table read the same `data.trades` / `positions` array, so they cannot disagree (Langston's count-matches-rows verification).

## §9.3 verification — honest status
- **Paper Open Trades: LIVE-CONFIRMED** via Claude-in-Chrome — the header renders **"Active Trades (0)"** (`data-testid="active-trades-count"`; 0 correct = no active trades with active trading off). Since `ActiveTradesV2` is the shared component Paper AND Live both mount, this proves the open-count on both mode pages.
- **VTS Open/Closed counts: SOURCE-VERIFIED (Langston Step-4), UI-nav BLOCKED by a Claude-in-Chrome limitation.** The VTS-page tabs would not switch under Claude-in-Chrome (coordinate AND ref clicks) — a Radix-tab tooling limitation reproduced repeatedly this session (NOT a code issue; the Paper page tabs switched fine and the identical `ActiveTradesV2` count rendered). The VTS counts rest on Langston's independent source verification: both tables render `trades={data?.trades ?? []}` (`vts-tabs.tsx:92/:140`), so `data.trades.length` === the rendered row count exactly, and the count-vs-rows "Last 7 Days" eyeball is satisfied by construction (header and table read the same array). Data-testids `vts-open-count` / `vts-closed-count` present.

## Governance files changed
`BATCH_CATALOG.md` (B8.3c row) · `PHASE_HISTORY.md` (B8.3c paragraph) · `PHASE_19_PLAN.md` (§1 board + §5 log) · `P19_B8_3c_SCOPE.md` · `MEMORY_CC_B.md` (+ mirror) · this report. **SIM / System Manual: N/A** (Langston §16/§17 call — pure display-count restore, nothing architectural/component-state to document). Bench: tsc baseline OK.

**Status: batch complete pending Kyle acknowledgment (OLD Claude owns the Kyle visual-verify prompt).**
