# B-OPEN-TRADES-DISPLAY — SCOPE

**change-class: non_architecture** (additive metadata + a display-adapter mapping + a client filter check; no logic, no schema migration, no trading-decision path touched)
**Owner:** Claude Analyst (CC-C) · Kyle-directed (running-issues board items 5 + 3, autonomous)

## Objective 1 (item 5) — the Open Trades regime column shows all three parts

**Problem (verified):** the shared `OpenTradesTable` (`vts-open-trades-table.tsx:247-260`) already renders the three-part regime cell (label + confidence + EARLY/PRIME/LATE phase), each conditional on the data being present. The closed-trades side has it (7 stored columns on `closed_trades`); the **open** side does not — `active_open_positions` has only `confidence`, and its metadata carried none of the regime detail. So the open table showed only the regime **label**. The engine already computes the values (`active-execution-engine.ts:3229-3234`, the `createClosedTrade` write at open uses `_b67_2_1_*`), so this is a plumbing gap, **not** a rendering bug.

**Fix (no migration):**
1. `active-execution-engine.ts` — the `createActiveOpenPosition` write (~:3336 metadata spread) now stamps the same six at-entry regime values into the open-position **metadata** (`regimeConfidenceModulated/Raw`, `macroModifierValue`, `phase`, `phaseAgeSeconds`, `strategyPhaseWeight`) — the identical `_b67_2_1_*` values the closed-trade write uses two blocks above. Honest-absent (null when the MCE context was unavailable at open).
2. `paper-trade-adapter.ts` — `adaptPaperOpenTrade` now maps those six from metadata onto the `OpenTrade` fields the shared table reads (parity with the closed adapter, which reads them off columns). `metaNum(...) ?? null` — never fabricated.
3. Test fences added (`paper-trade-adapter.test.ts`): present→mapped, absent→null.

**Verification:** tsc baseline clean (no new errors); `paper-trade-adapter.test.ts` 15/15. §9.3 UI check pending on a **newly-opened** position post-deploy (existing open rows predate the stamp and stay honestly em-dashed).

## Objective 2 (item 3) — closed-trades "write at open" + orphans: FINDING, no code fix

**Investigated; the display premise does NOT reproduce in current code (rule 24 — do not fix what works):**
- The `createClosedTrade` record is written **at open** (`active-execution-engine.ts:3203`) and updated at close — an intentional trade-lifecycle record, long-standing (predates the P19-B-RENAME).
- **Every closed-trades display/analytics path already excludes not-yet-closed rows:** `trade-history-tab.tsx` passes `closedOnly=true` (since 2025-12-11, `2b89f9385`); `getClosedTradesPaginated` honors it (`storage.ts:26-33` → `closedAt IS NOT NULL` + valid-exit conditions); the analytics path (`routes.ts:12886`) filters ghost rows post-query. So **open positions do not show in the closed-trades table.** (§9.3 UI confirmation pending.)
- **Orphans: 2 rows only** (`MET/USD` 07-15, one 07-18), NULL `closed_at` + no matching open position — a **one-off, none since 07-18**, not an ongoing bug. They are harmless: hidden by the display filter AND excluded from learning (no exit price/reason = ghost). **Disposition:** documented; NOT auto-deleting (a production data edit on 2 hidden rows is not worth the risk without Kyle's green-light). Flagged for an optional cleanup.

**No code change for Objective 2** — the correction of the premise + the orphan documentation is the deliverable.

## Blast radius
- The engine change is purely additive to one write's metadata object; it cannot alter admission, ranking, sizing, or exit (metadata regime detail is display-only telemetry). Runs on the live active-trading open path — additive-only, honest-absent.
- The adapter + test are client/test only.
