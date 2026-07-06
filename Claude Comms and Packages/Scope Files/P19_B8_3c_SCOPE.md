# P19-B8.3c — Scope (tiny Kyle-directed follow-up; combined Step-1/Step-4)

change-class: non_architecture

**Batch:** P19-B8.3c — restore the open/closed trade COUNT atop the trade tabs. Kyle-directed via OLD Claude (who root-traced it + owns the Kyle follow-through). CC-B implements; Langston gates. Trivial visual batch → combined Step-1 (scope) + Step-4 (diff) in one dispatch.

**Root cause (OLD Claude's trace):** the counts that used to sit atop each trade tab were dropped in the B8.1 client restructure (C1 extract of the VTS Open/Closed tables out of machine-learning + C3 three-mode-page split). The old machine-learning page showed them; the extracted/split components didn't.

## Objective — surface the trade count in each tab header (the count of what's rendered)

| Surface | Component | Change |
|---|---|---|
| VTS Open | `VtsOpenTradesTab` (`vts-tabs.tsx`) | "Open Simulated Trades **(N)**" — `data.trades.length`, guarded on `!isError && data?.trades`. |
| VTS Closed | `VtsClosedTradesTab` (`vts-tabs.tsx`) | "Closed Simulated Trades (Last 7 Days) **(N)**" — same guard. |
| Paper/Live Open | `ActiveTradesV2` (`active-trades-v2.tsx`, shared, mode-keyed) | "Active Trades **(N)**" — `positions.length` (already mode-scoped → reflects the active mode). |
| Paper/Live Closed | `TradeHistoryTab` | **NO CHANGE — already compliant.** ★ Finding: the header ALREADY shows "{totalCount} total trades" (`:686`, from the paginated query's real `totalCount`). OLD Claude's trace said all four dropped; TradeHistoryTab was NOT among them. Stated honestly rather than adding a redundant second count. |

So the diff touches **3 components / 2 files** (`vts-tabs.tsx` + `active-trades-v2.tsx`), not four.

## Verification criteria
- §9.3 Chrome walk: each of the four surfaces shows a trade count in its header (three newly-added + TradeHistoryTab's pre-existing one), on Paper/Live/VTS as applicable; the count matches the rows in the table.
- Bench green (tsc baseline); CI 4-green; deployed; **Kyle visual verify** (it's a visual change — Kyle wants to SEE the counts back); Langston Step-4 + Step-8.
- Data-testids for the walk: `vts-open-count`, `vts-closed-count`, `active-trades-count` (+ TradeHistoryTab's existing "{totalCount} total trades").

## Notes
- Counts reflect the RENDERED rows (`.length`) — honest, matches the table; the "Max: 300" note on VTS Open already explains any cap.
- No endpoint change, no migration, no engine behavior change. Governance at close: BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN §1/§5 + this scope + completion report (SIM/SysManual N/A — pure display-count restore, no component/state/architecture change).
