# P19-B8.7 — Step-2 pre-audit (rev1, 2026-07-16)

> SIM consulted for the touched surface: active-trades/trades routes (`server/routes.ts`
> Active Engine section), `dynamic-slots.ts`, `guardrail-settings.ts` (read-side only),
> the four client tables (`active-trades-v2.tsx`, `trade-history-tab.tsx`,
> `vts-open-trades-table.tsx`, `vts-closed-trades-table.tsx`). Display/data-quality
> batch → **SIM-scope only, System-Manual N/A** (Langston pin-down 4 CONFIRMED — the
> Manual gets nothing unless an OBJ-4 capture home lands architecture, which this batch
> does not build). All findings below are live-DB / live-API / code reads, cited.

## Pin-down 2 answered — the admission-time constraint, named
The engine's promotion loop gates open-count on
`buildSettingsFromGuardrails(mode).maxOpenTrades` at
`active-execution-engine.ts:348-349` (second site `:2035-2036`), and that maps from
**`guardrails_v2.max_open_positions`** (`guardrail-settings.ts:187`). The
exposure÷per-trade ratio (`dynamic-slots.ts`) does NOT gate count at admission — it
only feeds the DISPLAY (and sizing caps size, not count). **So the ONE authoritative
display number = `max_open_positions`, and the OVER LIMIT banner keys off exactly it.**
Tune-3's floor(100/6.67)=14 is therefore display-only trivia that disappears with the
ratio read.

**NEW defects found in this chain (folded into OBJ-3):** the fallback family —
`guardrail-settings.ts:187` `Number(guardrails.maxOpenPositions) || 5` (the UI "5"
ancestor pattern), engine `:349/:2036` `|| 15`, `guardrail-settings.ts:189`
`maxExposurePercent: '50.00'` hardcoded, `dynamic-slots.ts` 8/40/12. All are
no-hardcoded-fallbacks violations on DB-governed values → fail-loud. (The engine `||15`
is the scariest: a guardrails read glitch would silently set the CONCURRENCY CAP.)

## OBJ-1 (CLASS blank) — confirmed
`routes.ts:12227-12262` row assembly: no `assetClass` field (verified against the live
API: `assetClass` absent from active-trades rows; the closed-trades API DOES send it).
Fix: include `pos.assetClass` (the stamped column) in the row.

## OBJ-2 (Strategy blank on Closed) — REFINED: client-side, data proven present
Live DB: 37/37 closed rows (2 days) carry `strategy_name` (34 pattern-pool + 3).
Live API (`/api/active-engine/trades?paginated=true&closedOnly=true`): the row returns
`strategyName: 'pivot_shift'`. So DB ✓ API ✓ → the blank is in the CLIENT render path
(`trade-history-tab.tsx` — two render variants exist, paginated vs legacy; the exact
dead branch gets pinned at build with the fix). No server change expected.

## OBJ-6 (analytics section) — feed works server-side; redundancy is real
`/api/active-engine/trades/analytics?range=all` returns live data (31 opened, winRate
9.68, netPnl −44.95...). So "not populating" is a client feed/param issue — but the
metric set (win rate, TP/SL split, net P/L, averages) overlaps ~fully with the B8.3
paper Dashboard's Activity & Results + Averages & Edge cards, which are already
per-mode and richer (Net R, profit factor, fee drag). **Recommendation to Kyle:
DELETE the section** (rule 18: full removal + DELETED_COMPONENTS_LOG; the endpoint
stays if other consumers exist — enumerated at build, else it goes too).

## OBJ-4 data-availability map (provisional; finalized in the change list)
Available on active rows today (display-only wiring): B/S (`side`) · Signal/Pattern
(`patternType`) · Source Pool (metadata `sourcePool`) · TEC State (`tradeMode` +
latch fields) · Target/Stop + Result (`takeProfit`/`stopLoss`/`originalStopPrice`/
`closeReason`) · Entry Time (`openedAt`) · Edge (metadata `netExpectedEdge`) · Rank
(metadata `rankingScore`) · Regime Wt (metadata `regimeWeight`).
Likely CAPTURE GAPS (named homes if confirmed at build): Volume/Order Book
entry-liquidity capture (VTS-only capture path today) · Pair vs Glbl Friction split ·
Pair/Glbl DBS (VTS regime telemetry; the active path stamps `di_at_open` but not the
DBS pair/global pair). Gaps ship as em-dash + tooltip + a §13 home, never fabricated.

## Blast radius
Client tables + two API row assemblies + dynamic-slots/guardrail-settings READ-side.
No engine logic, no sizing values, no gates. The `||15` fail-loud change touches the
engine file but only the settings-read seam (Langston attention flagged for Step-4).
VTS tables untouched except any Kyle-ruled OBJ-5 additions (separate diff section).
