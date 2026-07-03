# P19-B-RENAME Wave-3 — TABLE RENAMES (per-table atomic bundles) + the Wave-2 residue sweep

**CC-B, 2026-07-03.** Langston conditions honored: per-table ATOMIC bundles (ALTER migration + drizzle schema + indexes + storage interface/impl methods + every raw-SQL string + callers = ONE commit per table); his sub-batch split decision at Step-4; regression gate = B7.2c pending/twin lifecycle + VTS close-migration function post-rename + UI tables render. Byte-mode edits only (the W2 EOL lesson — schema.ts is CRLF).

## Surveyed blast radius (git grep at head `11381597e`+)
| Table | Files w/ string refs | Drizzle/method symbol families |
|---|---|---|
| paper_sim_trades → **closed_trades** (Kyle-consensus; the BOTH-systems closed sink) | **17** | paperSimTrades (62), getPaperSimTrades (30) + Global/BySymbol/Paginated/single, create/update/deleteAll, cleanOldPaperSimTrades, PaperSimTrade/Insert types + zod schema, 4 idx names |
| paper_sim_open_positions → **active_open_positions** (neutral-name test PASSED — active-path-only) | 9 | getPaperSimOpenPositions (75!), get single/BySymbol, create/update/delete/deleteAll, PaperSimOpenPosition types, 2 idx names |
| paper_sim_sessions → **active_engine_sessions** | 5 | paperSimSessions (33), getActivePaperSimSession(s), get/create/update, BySessionId, types, 3 idx names |
| paper_sim_trade_logs → **active_trade_logs** (OPEN-6: rename ruled) | 2 | createPaperSimTradeLog, getPaperSimTradeLogs, deleteAllPaperSimTradeLogs, types, 3 idx names |

## Bundle order (risk-ascending; smallest first proves the pattern)
**B4-logs → B3-sessions → B2-positions → B1-closed_trades** (the 17-file sink LAST, once the pattern is proven three times). Each bundle: migration `ALTER TABLE x RENAME TO y` + `ALTER INDEX` renames + MANIFEST; drizzle pgTable/index/insert-schema/type lockstep; storage method renames; raw-SQL sweeps; bench (tsc-baseline + full vitest identical-count) — commit. **Deploy: ONE deploy after all four commits + the residue commit (my recommendation) OR per-bundle deploys — Langston's split call.** db:migrate applies all ALTERs in order; each ALTER is instantaneous (catalog-only, no rewrite).

## Method-name maps (per bundle)
- **B4:** createPaperSimTradeLog→createActiveTradeLog · getPaperSimTradeLogs→getActiveTradeLogs · deleteAllPaperSimTradeLogs→deleteAllActiveTradeLogs · PaperSimTradeLog/Insert→ActiveTradeLog/Insert · paperSimTradeLogs→activeTradeLogs.
- **B3:** paperSimSessions→activeEngineSessions · PaperSimSession/Insert→ActiveEngineSession/Insert · getPaperSimSession(s)/BySessionId→getActiveEngineSession(s)/BySessionId · create/updatePaperSimSession→create/updateActiveEngineSession · **getActivePaperSimSession(s)→getRunningEngineSession(s)** ("active"=currently-running collides with the active-path prefix — "running" disambiguates; alternative `getCurrentActiveEngineSession` if you prefer).
- **B2:** paperSimOpenPositions→activeOpenPositions · PaperSimOpenPosition/Insert→ActiveOpenPosition/Insert · getPaperSimOpenPosition(s)/BySymbol→getActiveOpenPosition(s)/BySymbol · create/update/delete/deleteAllPaperSimOpenPosition(s)→…ActiveOpenPosition(s).
- **B1:** paperSimTrades→closedTrades · PaperSimTrade/Insert→ClosedTrade/Insert · getPaperSimTrades/Global/BySymbol/Paginated→getClosedTrades/Global/BySymbol/Paginated · getPaperSimTrade→getClosedTrade · create/update/deleteAllPaperSimTrade(s)→…ClosedTrade(s) · cleanOldPaperSimTrades→cleanOldClosedTrades. `includeNeverFilled` opt-in semantics (B7.2c chokepoint guard) carried unchanged — regression-checked.

## NEW FIND — Wave-2 residue sweep (engine-side PaperSim* symbols, non-table; rides Wave 3 as its own commit)
The full-forms sweep surfaced the same half-rename class your W2 blocker was about, missed by both the inventory and W2's list: `resetPaperSim`, `hardResetPaperSim`, `isPaperSimRunning`, `isResettingPaperSim`, `globalPaperSimBusyFlag`, `globalPaperSimOperationLock`, `resetPaperSimService`, `resetPaperSimMutation` (client), `PaperSimReset`, `PaperSimService`, bare `PaperSim`, `PaperSimHeartbeat` (residual form), `createPaperSimStartStopScenario` (test harness), `getPaperSimStats` (classify at build: table-stats → B1, engine-stats → residue). Map: PaperSim→ActiveEngine forms (e.g. resetActiveEngine — note `hardResetActiveEngine` already exists from the W2 fix; dedupe/reconcile the reset family at build). Old forms grep-to-zero after the sweep; PaperSim as a token then survives ONLY in the keep-as-data `'paper_sim'` literal (fence-tested) and Wave-3 pre-rename history.

## Regression gates (per your Step-2/4 conditions)
1. Full vitest identical pass count per bundle (2151 baseline; delete/name-only).
2. B7.2c lifecycle post-rename: a pending row still fills/drops (staging soak markers keep flowing — the log tags are table-agnostic); the VTS close-migration INTO closed_trades still lands rows (open→close round-trip observed on staging).
3. UI: ML open/closed tables + paper trade-history render (§9.3 Chrome).
4. The B7.2c storage-chokepoint guard (`IS DISTINCT FROM 'never_filled'`) survives verbatim in the renamed methods.
5. Persisted-fence test still green (table renames touch `paper_sim_trades` STRINGS but never the bare `'paper_sim'` vocabulary — exact-string discipline as W2).

## Out of scope (unchanged)
paper_trades legacy (OPEN-2 follow-up batch) · paper-metrics.ts · mode axis · shipped migration filenames · the keep-as-data `'paper_sim'` discriminator (#RUNNING_ISSUES entry at close).
