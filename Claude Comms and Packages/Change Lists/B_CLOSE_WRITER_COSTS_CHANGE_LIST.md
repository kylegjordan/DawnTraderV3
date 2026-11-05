# B-CLOSE-WRITER-COSTS — change list (Step 4)

## DISPATCH HEADER
| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `architecture` (scope header, `Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md:3`) |
| ii | DOC SET (architecture), row by row | SCOPE — present (`Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md`) · PRE_AUDIT — present (`Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md`, r2-r7 + PROCEED/C-15 `2040097ea`) · COMPLETION_REPORT — absent (Step 11) · BATCH_CATALOG — absent (Step 10) · PHASE_HISTORY — absent (Step 10) · SYSTEM_MANUAL — absent (Step 10; the close-record rule + the outcome seam are §-content) · SYSTEM_IMPACT_MAP — absent (Step 10; `closePosition` row + the storage lookup) · CHANGES_AND_FIXES — judged, at Step 10 · RUNNING_ISSUES — judged, at Step 10 · POST_AUDIT_ROADMAP — judged N/A (no roadmap item moves) · DELETED_COMPONENTS_LOG — **present, increment 1 entry** · ADJUSTMENT_FRAMEWORK — judged at Step 10 (the `asOf` read bound, increment 3) · SPRINT_TO_LIVE_PLAN row — at Step 10 · memory files + task list — at Step 10 |
| iii | STEP-2 REFERENCE | `Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md` (approved: Langston PROCEED on r7, condition C-15) |

The batch ships in three increments (pre-audit plan P-1..P-18). **This dispatch is INCREMENT 1 ONLY: P-1..P-4.** Increments 2-3 (`TradeCloseReason`, `closeOutcomeClass`, the `countedTrades` seam, the derived NON_OUTCOME list at the 10 SQL sites, the manual-close route, `asOf`, C-15) follow as their own dispatches.

## INCREMENT 1 — P-1..P-4 (the close finds its one record, or refuses)

### P-1 — `server/storage.ts`: `findOpenTradeRecord` replaces `getClosedTradesBySymbol`
- NEW `OpenTradeRecordLookup = { status:'one', record } | { status:'none' } | { status:'many', ids, more }` *(`more` added by C-2)*.
- NEW `findOpenTradeRecord(mode, symbol, assetClass)`: `mode = ? AND symbol = ? AND asset_class = ? AND closed_at IS NULL`, `LIMIT 4` *(was 3; C-2: four fetched ⇒ "more than 3", the first 3 named)*. The `never_filled` arm is dropped per amended P-1 (condition (a)): `_dropUnfilledMaker` writes `closed_at` and `close_reason` in one update, so under `closed_at IS NULL` it cannot discriminate.
- DELETED `getClosedTradesBySymbol` (global — it never filtered `mode` despite its comment) and its `IStorage` entry. One caller, replaced.

### P-2 — `server/services/active-execution-engine.ts` `closePosition`: lookup + refusal BEFORE `_closeRefusalStreak.delete`
```ts
const _recClass = asValidAssetClass((position as any).assetClass);
const _rec = _recClass ? await storage.findOpenTradeRecord(this.mode, position.symbol, _recClass) : null;
if (!_rec || _rec.status !== 'one') {
  // log [B-CLOSE-WRITER-COSTS][CLOSE_RECORD_UNRESOLVED:<mode>] … position KEPT
  // addAlert critical, dedupe `close-record-unresolved-<mode>-<symbol>`, body ends `DISPOSITION: RESOLVE, do not ACK.`
  return;
}
const trade = _rec.record;
this._closeRefusalStreak.delete(positionId);
```
Unresolvable class ⇒ refused WITHOUT a lookup (a missing class never widens the match). The `flatten` exemption does not apply (tested).

### P-3 — deletions (OBJ-2b)
- the old lookup (`trades.find(t => t.openedAt && !t.closedAt)`);
- `if (trade) {` → a bare block `{ // B-CLOSE-WRITER-COSTS P-3: was \`if (trade)\` …` (tautological now);
- the `LADDER_NO_TRADE_ROW` arm inside the `finally` (eviction kept);
- the whole `if (!trade)` close-anyway block (`CLOSE_NO_TRADE_ROW` log + `close-no-trade-row-*` warning alert);
- comments narrowed: `#620` (`_persistedNetPnl`), the `_lsAcc` hoist, both `finally` eviction comments.
**State-write census:** the removed block wrote one alert key; `close-no-trade-row` has 0 code readers and 0 alert rows (Langston's read, pre-audit P-2 amended). Logged in `DELETED_COMPONENTS_LOG.md`.

### P-4 — tests
- `b-feed-mismatch-fix.test.ts` and `b-class-leg-fill-mode-engine.test.ts` re-pointed to `findOpenTradeRecord`.
- NEW in `b-feed-mismatch-fix.test.ts`, `B-CLOSE-WRITER-COSTS — the close refuses when its trade record does not resolve`: **R-none, R-many** (position kept, `updateClosedTrade` and `deleteActiveOpenPosition` not called, ONE critical alert under the key, `many` names both ids), **R-flatten**, **R-class** (no lookup), **R-one** (called with `('paper','WLD/USD','crypto_spot')`, no refusal alert).
- **Mutation-proved:** commenting out the refusal's `return` fails R-none, R-many and R-class (the write block dereferences a missing record, so `resolves` fails); passing `''` as the class fails R-one.

### ⚠ FOUND AT STEP 3, NOT IN THE PLAN — a third test reader
`b-price-side-8a-p1-exit-fence.test.ts` asserted `LADDER_NO_TRADE_ROW` PRESENT (test 7, twice) and anchored `ifTradeBlock` on `'    if (trade) {'`. The deletion census found it; the plan's P-4 named only two test files. **Re-pointed, not loosened:** the extraction anchors on the bare block's marker (`PERSIST_BLOCK_ANCHOR`), the finally's identity marker is `this._riMissAcc.get(position.id)` (code in the same `finally` — `code()` strips comments, so a comment marker cannot serve), and the arm's ABSENCE is now asserted. Controls 7c/7d unchanged in substance and passing.

### Verification (local)
- `tsc` baseline: 329 = 329.
- The three test files: 55/55.
- Full unit suite: 4,597 passed, 8 failed in 4 files — all local-environment: `b-disk-file-tiering-amendment1` and `b-staging-liveness-watch` load a CRLF `.mjs` with a shebang (`SyntaxError`, Windows checkout only); `b63-item12`, `b63-item16` need a local Postgres (`ECONNREFUSED :5432`). None reads the changed code. CI is the authority.
- `server/storage.ts` is stored with MIXED line endings (4,339 CRLF of 4,663 lines); the commit preserves them so the diff is the 32 changed lines only.

## Judgement calls to attack
1. **Placement after the fill.** P-2 sits after the fill contract's last refusal (as planned). In paper the fill is internal and nothing is booked before the lookup — but list anything between the fill and the lookup that MUTATES state, if you find one.
2. **Retry cadence.** A refused close returns; the monitor re-attempts every cycle, so the log line repeats each cycle while the alert dedupes. Acceptable, or should the refusal count into `_closeRefusalStreak`?
3. **`LIMIT 3`.** Enough to tell `many` and name ids; the alert names at most three.

---

## INCREMENT 2 — P-5..P-8 + OBJ-8's second half (open positions carry their mode)
Same header as increment 1 (class `architecture`; Step 2 = the pre-audit, P-5 (e) + riders (i)-(iii), P-7 rewritten per A-9, P-8 (d)). Doc-set change in this increment: **SYSTEM_MANUAL present** (`:5863`, the key sentence corrected in this deploy as P-5 requires); DELETED_COMPONENTS_LOG second entry.

### P-5 — migration `drizzle/migrations/2026-11-05-b-close-writer-costs-open-positions-mode.sql` (+ rollback, + MANIFEST)
One transaction, `SET LOCAL lock_timeout = '5s'` (rider (i)). Guard: refuses unless the non-primary unique set is exactly `{unique_symbol_side}` AND its definition is `UNIQUE (symbol, side)`. Then `ADD COLUMN mode trading_mode NOT NULL DEFAULT 'paper'` (the window bridge, (e)); `DROP CONSTRAINT unique_symbol_side` (no `IF EXISTS`); `ADD CONSTRAINT unique_symbol_mode UNIQUE (symbol, mode)`; post-check the set is exactly `{unique_symbol_mode}`; `RAISE NOTICE` the backfilled row count (a presence figure, rider (ii)).
Rollback (not in MANIFEST): CODE FIRST (rider (iii)); refuses if any non-paper row exists; swaps the rule back, drops the column, deletes its `_migrations` row.
**Guard pre-checked READ-ONLY on staging (2026-11-05 ~20:45Z):** unique set `{unique_symbol_side}`, def `UNIQUE (symbol, side)`, 20 rows / 20 distinct symbols / side `buy` only, no `mode` column yet; control: the same query on `closed_trades` returns `{paper_sim_trades_pkey}`. CI: the only unique rule any migration creates on this table is the initial schema's `unique_symbol_side` (`2026-04-22-initial-schema.sql:12447-12451`; census of every migration naming both the table and `unique` — one other hit, `2026-07-05-p19-b8-2-balance-policy.sql`, whose unique index is on `portfolio_anchor_events`).
**Migration 2 (drop the default) is the NEXT deploy's** — not in this commit.

### P-6 — storage + schema + the open insert
- `shared/schema.ts`: `mode: tradingModeEnum("mode").notNull().default("paper")` (default marked as the one-deploy bridge); the declared `active_open_positions_symbol_idx` (symbol alone — never in the database, `#1006`) replaced by `unique("unique_symbol_mode").on(table.symbol, table.mode)`.
- `createActiveOpenPosition(mode, …)`: inserts `{ …position, symbol, mode }` — the METHOD's mode wins over any caller field; the dedup-return reads the winner by `(symbol, mode)`; the 23505 message match names `unique_symbol_mode`.
- `getActiveOpenPositions(mode)`: `WHERE mode = $1`. `deleteActiveOpenPosition(mode, id)`: `WHERE id = $1 AND mode = $2`.
- Engine open insert (`createActiveOpenPosition(this.mode, {…})`): `mode: this.mode` named explicitly (rider (ii)); `side: 'buy'` commented as pinned (P-8 (d)).

### P-7 — readers keep a mode-scoped read, intent stated (A-9)
**12 sites, not the plan's 11:** the diagnostics pairs with `getActiveTrades('live')` are **9** in `routes.ts` today (8 in `Promise.all`, 1 sequential `activeEnginePositions`/`liveTrades`), plus `index.ts` boot audit, the tick-health provider (`active-engine-service.ts`), and the I8C provider (engine). Each carries a `B-CLOSE-WRITER-COSTS P-7 (A-9)` comment with its intent; the I8C one names the single-slot defect and its placed home (row 179's co-run gate, KD-37). No all-modes method.

### P-8 + OBJ-8 — tests, deletion
NEW `server/tests/unit/b-close-writer-costs-open-mode.test.ts` (8): **M-1..M-4 run the REAL storage methods against a recording database stand-in and render each WHERE with drizzle's `PgDialect`** — M-1 `"active_open_positions"."mode" = $1` with `['live']`; M-2 id AND mode; M-3 the method's mode overrides a caller's `mode: 'paper'`; M-4 23505 → winner read by symbol AND mode, `created:false` (#508). M-5 schema: exactly one `unique(`/`uniqueIndex(` in the table block, on (symbol, mode). M-6 migration shape + MANIFEST has forward not rollback. M-7 the open insert names `mode: this.mode` and `side: 'buy'`. M-8 every `getActiveOpenPositions(` arg in the six production files is a `TradingMode` form; `getActiveOpenPositionBySymbol` absent.
**Mutation-proved:** removing the mode predicate from `getActiveOpenPositions` fails M-1; reading the dedup winner by symbol alone fails M-4; declaring the rule on `(symbol)` alone fails M-5.
`getActiveOpenPositionBySymbol` + interface entry DELETED (OBJ-8; 0 callers; the plan carried only OBJ-8's other half — folded here). Logged.

### Left for their own placed homes (not this batch)
- `deleteAllActiveOpenPositions(mode)` still deletes every mode's rows — that is **roadmap 21-3d `B-MODE-DELETE-SCOPE`** (Kyle 2026-08-21, "must land before live"); this column is the discriminator it needs.
- `getActiveOpenPosition(mode, id)` / `updateActiveOpenPosition(mode, id)` still key by id alone (ids are UUIDs, so they cannot cross modes in practice). **Question for you:** fold a mode predicate in here for symmetry with delete, or leave it?
- `trailing-exit-controller.ts:~661` symbol match — P-9, recorded not fixed (needs live rows).

### Also in this commit
`server/routes.ts` `/diagnostics/aj19b/open-positions`: `createdAt: p.createdAt` → `p.openedAt`. A PRE-EXISTING tsc error (the table never had `createdAt`; the field was always undefined) whose message text changed when the row type gained `mode`, so the baseline read it as new. Fixed at source rather than re-baselined; tsc now 328 < 329.

### Verification (local)
tsc 328 (baseline 329; the one drop is the line above). Full unit suite: 4,606 passed, the same 8 local-environment failures in the same 4 files as increment 1. Increment 1's three files + the race-fix + audit tests green.

---

## INCREMENT 1 — Step-4 conditions (Langston PROCEED, Discord 2026-11-05T20:10:44Z)
- **C-1:** `this._closeRefusalStreak.delete(positionId)` moved back ABOVE the record lookup — the fill contract passed, so the streak clears exactly where it did before; the record refusal is a separate rail, not counted into the streak. Test **R-streak** (streak 2 → cleared on a record refusal); mutation-proved (moving the clear below the refusal fails it).
- **C-2:** `findOpenTradeRecord` fetches 4; `many` carries `more`; the alert reads "more than 3 open trade records match (first 3: …)" at the cap. Tests **R-cap** (engine) and **M-4b** (storage, rendered params).
- **C-3:** the alert body no longer points at the unbuilt restore route: it says how to find the record, what to do for several vs none, and that the restore action is P-12 (bring it to OLD Claude).
- **R-1:** `ifTradeBlock` anchors on CODE (`const _lsAcc = …` → its `try {` → the next `{`); the seeded control rebuilt to that shape. **R-2:** the test-2 comment corrected (`mockReset` restores the default `one`). **Record (i):** the feed test header now calls the lookup a passed-the-fill-contract marker. **(ii):** the seven `trade?.id || …` fallbacks → `trade.id` (unreachable arms). **(iii):** the LIVE-SWAP OBLIGATION note names the record refusal too. **(iv):** the `#1093` docblock moved onto `getLastClosedAtForSymbol`.
- Local: the four suites 67/67; tsc 328 = 328.

---

## INCREMENT 2 — Step-4 conditions (Langston PROCEED, Discord 2026-11-05T20:31:22Z)
**PREVIOUSLY STATED → NOW (corrections to the increment-2 section above):**
- **PREVIOUSLY:** CI's fresh database gets `unique_symbol_side` from `2026-04-22-initial-schema.sql:12447-12451`, by a census of "every migration naming both the table and `unique`". **NOW:** that line adds the constraint to `paper_sim_open_positions`; the table becomes `active_open_positions` at `2026-07-03-p19-b-rename-w3-b2-open-positions.sql:8`, and PostgreSQL keeps the constraint's name across the rename (line 9 renames a symbol index only `IF EXISTS` — it never existed, `#1006`). **REASON:** my census searched the new table name, which cannot match the pre-rename lines — a pattern-false-zero over exactly the era the constraint comes from (Langston). The conclusion stands; the citation was wrong.
- **PREVIOUSLY:** "12 reader sites". **NOW:** 28 literal-argument production sites across 7 files; 11 carried the intent comment, and three more paper/live PAIRS (both halves reading this table, not the old `trades` table) are commented now: `index.ts:1079/1080` (the startup log no longer prints a false `live: N`), `kraken-websocket-adapter.ts:3226/3227` (no change in effect), `trailing-exit-controller.ts:665/674` — **a declared write change:** before, the same row was found in both reads and updated twice per mode sync (as paper and as live); now once. **REASON:** Langston C-2.
**C-1:** M-8 now DERIVES its population (every non-test `.ts` under `server/` containing the call; 17 files at this commit, 70 call occurrences), with a positive control (the walk must find the engine and the routes). The derived walk found two forms my typed list never saw — `input.mode` (`core/rtb/ready_to_buy_service.ts`, typed `TradingMode`) and `sizingContext.mode` (`signal-orchestrator.ts`, `SizingContext.mode: 'live' | 'paper'` at `:299`) — both accepted with their type cited.
**Ruling (2):** `get`/`updateActiveOpenPosition` stay keyed by id here; all three writers (update, delete-all, and a row-affected check on delete) go together to **roadmap 21-3d `B-MODE-DELETE-SCOPE`** (`POST_AUDIT_ROADMAP.md:694`) with one "a row was affected, or raise" contract.
**Record items:** the migration's `RAISE NOTICE` is marked as NOT delivered by `db-migrate` (no notice listener); the rollback gains the `_migrations` post-check its siblings carry (and checks the column is gone); `deleteActiveOpenPosition` is a silent no-op on a mode mismatch — all callers are mode-consistent today, and the manual-close route's version of that risk goes with P-10 (it is deleted there).
Local: open-mode 9/9; tsc 328 = 328.


---

## INCREMENT 3 — P-10, P-11, P-12, P-13, P-15, P-16, P-17, P-18 (P-14 follows as its own piece)
**Where it lives:** review branch `review/b-close-writer-costs-inc3`, on top of the shared head — NOT on `migration/aws-supabase`, so it cannot ride the joint deploy unreviewed. Merged after Langston's PROCEED and the joint deploy. Header as increment 1 (class `architecture`; Step 2 = the pre-audit r2-r7 + PROCEED/C-15; Langston's P-10 ruling 2026-11-05T20:38Z). Doc-set rows changed here: DELETED_COMPONENTS_LOG (P-18 + the two operator writers), the scope's §5 stranded-clear line corrected.
**Dispatched as three single-question parts:** A = P-15 (+ P-13); B = P-10 + P-12; C = P-11 + P-16 + P-17 + P-18.

### Part A — P-15: one "is this a trade outcome" rule (+ P-13: the hard reset is a named non-outcome)
- NEW `server/services/trade-close-reason.ts` (a leaf — storage binds its lists as values, and the engine imports storage, so the engine cannot host them): `EXIT_CONDITION_TYPES` (the engine's `ExitCondition.type` is now `ExitConditionType` from here), `TradeCloseReason` = exit conditions + `never_filled` + `hard_reset` + `engine_stop_cleanup`, `TRADE_CLOSE_REASON_CLASS: Record<TradeCloseReason, 'booked'|'non_outcome'>`, derived `NON_OUTCOME_CLOSE_REASONS` (`never_filled`, `hard_reset`) and `BOOKED_CLOSE_REASONS`, reason-pure `closeOutcomeClass` (null/blank/unknown ⇒ `unknown`; an own-property check, so `'toString'` is unknown).
- `dashboard-metrics.ts` `countedTrades(rows)`: legs closed → class → exit price > 0, in that order (C-9), returning `counted`, `notClosed`, `nonOutcome`, `unknownReason`, `bookedWithoutExitPrice`, `unknownReasons`. NEW `outcome-seam-alerts.ts` raises `close-reason-unknown-<mode>-<reason>` / `booked-close-without-exit-price-<mode>` (resolve-only).
- The two money routes: fetch with `includeNeverFilled: true` (the fetch stops being an outcome rule), the seam ONCE, the route's window after it; analytics keeps `closedOnly` off (C-12 — `notClosed` is real there); `earnings`/`lifetime` read the seam output unwindowed (C-5). Both return `outcomeExclusions`. **`asOf`** (r6 BLOCKER-2): absent ⇒ unchanged; present ⇒ rows bounded `closed_at < asOf`, `now = asOf`, and balance-curve's anchors bounded too (a later re-anchor would move frozen curve points); invalid ⇒ 400.
- `storage.ts`: **10 sites** bind the derived NON_OUTCOME list through `notNonOutcomeReason()` — `(close_reason IS NULL OR close_reason NOT IN (…))`, the `IS DISTINCT FROM` semantics; the scoreboard binds the BOOKED allowlist + `exit_price > 0`; the two Kyle-decided arms (`getLastClosedAtForSymbol`, `getClosedTradesPaginated`) byte-unchanged; seven docstrings updated (record item 2). Writers typed: `createClosedTrade`/`updateClosedTrade` take `closeReason?: TradeCloseReason | null` (callers that cast `as any` are outside the guarantee — said in the signature comment).
- Typed vocabularies (C-2): engine `closeReasonMap: Record<ExitConditionType, AJ19BCloseBucket>`, `|| 'UNKNOWN'` removed — **declared change: `manual_stop` is now labelled MANUAL (was UNKNOWN; 1 row)**; `aj19b` exports `AJ19BCloseBucket`; `i1`'s `CloseReason = TradeCloseReason` (its unused `stop_loss` / `unknown` members dropped).
- Tests `b-close-writer-costs-outcome-rule.test.ts` (23): V-1..3 the vocabulary; S-1..5 the leg order; **F-1..3 the fence PARSES every `sql` template in storage.ts, nested ones included** (instrument proved: every occurrence parsed, 38 at this commit), `--` comments stripped, and finds only the two named arms; Q-1..12 each query rendered by drizzle's PgDialect against a recording db (hard_reset bound at the ten; the scoreboard allowlist; the two arms still include never_filled). **Mutation-proved:** hard_reset booked (13 fail); a literal at a converted site, top-level AND nested inside another template (F-2 + Q-8); legs 2/3 swapped (S-2, S-3).
- P-13: nothing to code beyond the class — `hard_reset` is `non_outcome`, so every money reader excludes it by name.

### Part B — P-10 + P-12: the operator closes, and their remedy
- `ActivePortfolioManager.closeOnePositionByOperator(positionId, 'manual_close'|'stranded_clear')` → `_flattenOne(position, tag, 'manual_stop')` (the one chain; a pending maker is CANCELLED as never filled, not sold). `_flattenOne`'s left-open reason now names both refusals (fill contract or trade record).
- `POST /active-engine/close-trade/:id` and `POST /active-engine/force-clear-stranded`: no record writer, no P&L arithmetic, no entry-price fallback; engine not running ⇒ **400, the same as close-all** (your one status code), text "start the engine, then close/clear from Active Trades" (C-2); a refused close ⇒ 409 naming the reason; the broadcasts keep their old types (`active_trade_closed`, `stranded_trades_cleared`). The request body's `reason` is no longer read.
- **P-12** `server/services/trade-record-restore.ts` + `POST /active-engine/positions/:id/restore-record` (authenticateToken; mode chosen at the boundary): refuses when an open record exists (one or several), when the position's own `tradeId` names an existing record, or when the position has no entry fee/slippage; otherwise inserts the open-time record from the position (both `fees` and `entry_fee` = the position's entry fee), stamped `record_restored_from_position`, `restored_at`, `restored_by_claimed`, and points the position's `metadata.tradeId` at it. Migration `2026-11-05-b-close-writer-costs-restore-columns.sql` (+ a rollback that refuses if any restored row exists; MANIFEST).
- `getEngineByMode`'s legacy fallback: per your C-1, recorded as a DEAD branch (nothing assigns `global.globalPaperEngine`) and homed on `#578` / row 79 — not touched here.

### Part C — the stop and drop paths
- **P-11:** `referenceFillPrice` + `closeFillCosts` in `core/math/trade-pnl.ts`. The paper placer's cold-reference arm now calls them (bit-identical, test C-1), and the engine-stop cleanup (`engine_stop_cleanup`) books the penalty fill, the taker exit fee on it, the record's entry fee and net P&L through them + `computeRealizedPnl`; not priceable (no class, no depth config, no entry fee) ⇒ LEFT OPEN + alert. ⚠️ **Found while building:** an open record's entry fee is in `fees`, not `entry_fee` — the open path writes `fees: entryFee` and never `entry_fee`, whose DEFAULT is '0'. Measured on staging (read-only, ~20:55Z): 20 open records, `fees` non-zero 20/20, `entry_fee` non-zero 0/20, `fees` = the position's entry fee 20/20; control: 941 closed `stop_hit` rows carry a non-zero `entry_fee`. Reading `entry_fee` would have booked a zero entry fee on every cleanup close; the cleanup reads `fees`.
- **P-16:** `_dropUnfilledMaker` without a `tradeId` resolves the record by the close key; none/many ⇒ the position is kept and the refusal alert raised. The resolve and the refusal are two shared engine helpers (`_resolveOpenTradeRecord`, `_refuseUnresolvedRecord`), used by `closePosition` too.
- **P-17:** the stop flow's orphan step resolves the record (`tradeId`, else the key) and finishes it through the cleanup's per-record close (extracted as `closeStaleRecordAtReference`) BEFORE deleting; unresolved or unpriceable ⇒ kept, `orphansKept` on the stop report, and `paper-reset-3000.ts` refuses on it. Tests O-1/O-2 pin the order (mutation-proved).
- **P-18:** the debug force-clear route deleted (logged).

### Verification (local, this branch)
tsc 325 (baseline synced from 328: the three errors were inside the two deleted writers). The batch's suites pass; five source checks re-pointed to the new code (balance-session-pairing P1, cost-accounting site 2 ×2, price-staleness P4, inc2d legacy sweep). Full unit suite: only the known local-environment files fail, plus timing flakes that pass when rerun alone.
**P-14 (dropping the fee/P&L defaults) is NOT in this increment** — it follows as its own piece, because it changes what an INSERT means and needs its own window analysis.

### Part A — Langston's CHANGES (Discord 2026-11-05T22:21:58Z), applied
- **C-1:** the `storage.ts` predicate-parity doctrine block rewritten (the dangling "IS" gone); `getLifetimeScoreboard` carved out BY NAME as the one method that differs by more than its question (BOOKED allowlist + `exit_price > 0` + the epoch floor).
- **C-2 (folded, both together):** `exploration-lane.ts` (the anneal's live count) and `b75-retention-sweep.ts` (its archived tally) now bind the shared NON_OUTCOME list as one array parameter — `(close_reason IS NULL OR close_reason <> ALL(<list>::text[]))` — instead of the hand-written `never_filled` literal; a `hard_reset` close can no longer count as an informative close and tighten the monotone EV-floor ratchet. `b-trade-tier-register.test.ts` test 1 re-pointed: both files carry the same predicate line, both bind `[...NON_OUTCOME_CLOSE_REASONS]` from the leaf, and neither carries the old literal. The scope claim "excluded everywhere at once" now covers these two as well; `reserve-row-tripwire.ts:49` is a different question (operator vs engine) and is not a copy (Langston).
- **C-3:** `getLifetimeScoreboard(mode, asOf?)` adds `AND closed_at < asOf` when the routes pass one; both money routes pass it. New test Q-10b (bounded with `asOf`, unbounded without).
- **Record (i):** the fence's scope statement now says a literal inside `sql.raw("…")` is not seen. **(ii):** the writer-typing comment states the magnitude — one of four reason-writing paths is inside the type; the real guarantee is the leaf's `Record`.
- Local: outcome-rule 24/24, tier-register 5/5, tsc 325 = 325.
