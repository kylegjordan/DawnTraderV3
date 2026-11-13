# B-CLOSE-WRITER-COSTS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2 r1, 2026-11-05)

change-class: architecture · Scope r3 + amendment at `e83fad625` (Langston PROCEED, Discord `1567810312579842129`). Read at the working tree after `9e5c40a7d`; staging runs `c0214c973`. Board card `PVTI_lAHODmulEM4BfQP4zhGKiI4`. **Line numbers below are at that tree and drift; implementation locates by content** (Langston record item 1).

## PREVIOUSLY STATED vs NOW (read this first)
- **PREVIOUSLY STATED (scope §1, OBJ-2):** a trade record is finished by `closePosition`, and the batch's refusal lives there. **NOW: SIX code paths finish a trade record** — one of them legitimately fee-free (a maker order that never filled) — and three others write no fee: the engine-stop cleanup, the hard reset, and two operator routes that write their own record. **REASON:** the OBJ-6 reader census found closed rows that hold no fee by construction, and the OBJ-7 writer census found two more inserts (A-3).
- **PREVIOUSLY STATED (scope §1):** `getActiveOpenPositions` is called on 68 production lines in 16 files. **NOW: confirmed 68 / 16** (three counting methods), **57 want only their own mode's rows and 11 want every mode's** (A-4).
- **PREVIOUSLY STATED (scope OBJ-7):** the `crypto_spot` default on `asset_class` — writer census, then drop or justify. **NOW: every writer sets the class explicitly** (2 inserts, 4 callers), so the default goes (A-6).

## A. AUDIT
**Sources read:** (1) code — `active-execution-engine.ts` (`closePosition`, `executeSimulatedTrade`, the dup guard), `storage.ts` (the close lookup, `createClosedTrade`, `createActiveOpenPosition`, `getActiveOpenPositions`, `closeOpenTradesForHardReset`, `deleteClosedTrade`), `active-engine-service.ts` (`reconcileIncompleteTrades`, stop flow), `active-portfolio-manager.ts` (`_flattenOne`, close-all), `routes.ts` (manual close, force-clear-stranded), `shared/schema.ts`; (2) staging database (constraint set, row counts by close reason, unclosed records vs open positions); (3) System Impact Map (`:342` exit-decision archive targets `closed_trades` only; `active_open_positions` deleted from seven sites); (4) System Manual §19.1 (`:5863` open-path atomicity — the sentence OBJ-3 corrects); (5) ledger — `RUNNING_ISSUES` `#508`, `#618`, `#1006`, `#1093`, `#1154`, `B-FEED-MISMATCH-FIX` and `B-PROMOTION-RACE-FIX` completion reports; (6) provenance below. Three wide censuses (A-4, A-5, A-6) were run by a helper reading the tree and spot-checked by me against the code (three sites each for A-4 and A-6; the two most consequential A-5 writers re-read).

**A-1 — The lookup and its refusal (OBJ-1, OBJ-2, OBJ-2b) are as the scope states.** Lookup by symbol only (`getClosedTradesBySymbol`), `trades.find(t => t.openedAt && !t.closedAt)`; `closed_trades.opened_at` is `notNull()` so the predicate is `closed_at IS NULL` (Langston, settled). The fill contract's last refusal is followed by `this._closeRefusalStreak.delete(positionId)`, then the side effects (learning aggregate, B70 archive, outcome-feedback update), then the lookup, then the `finally` with the ladder census, the trailing clear, the no-record block and the delete.

**A-2 — Today's population is clean** (staging, ~03:55Z and ~08:30Z): 20 open positions, all `buy`, 3 crypto / 17 xStock, 20 distinct symbols; 20 unclosed records 1:1 with matching class; 0 duplicate (symbol, opened_at) record pairs; all `closed_trades` rows `mode=paper`; live constraint set `paper_sim_open_positions_pkey` + `unique_symbol_side UNIQUE (symbol, side)` only.

**A-3 — Six paths finish a trade record (KD-17 binds all six).**
| # | path | what it writes | rows in history (since 2026-07-15) | origin |
|---|---|---|---|---|
| 0 | the pending-maker expiry (`active-execution-engine.ts:~1977-1991`) | `close_reason='never_filled'`: a resting maker order that never filled — no trade, no fee owed; deletes the pending position | 182 | P19-B7.2c |
| 1 | `closePosition` (engine), incl. the stop flow's flatten (`close_reason` `reset` / `manual_stop` via `forceClosePosition`) | the full close: exit price, fees, slippage, P&L, provenance — UPDATE of the open-time record | 1,370 (stop 908, target 433, trailing 15, max-hold 4, reset 9, manual_stop 1) | the canonical close |
| 2 | `reconcileIncompleteTrades` → `engine_stop_cleanup` (`active-engine-service.ts:~480`) | UPDATE with exit price + **gross `pnl` only — no fee, no net**, arm `synthetic_reference` | 0 | `0dcc22b2e` (2025-12-07): *"Improve trade status consistency and metrics accuracy after engine stop"* |
| 3 | `closeOpenTradesForHardReset` (`storage.ts:~704`) | `closed_at` + `close_reason='hard_reset'` only, **no economics** | 0 (the 9 `reset` rows are path 1 — the stop flow's flatten — not this function) | `4355d3cfc` (2025-12-06) *"a comprehensive hard reset for paper trading sessions"*; mode fence `#1154` |
| 4 | POST `/active-engine/close-trade/:id` (`routes.ts:~12540-12700`) | **INSERTS A NEW record** with computed fees, then deletes the position — **the open-time record is left unclosed (an orphan)** | 0 | `511cb1974` (2025-12-10) |
| 5 | POST `/active-engine/force-clear-stranded` (`routes.ts:~12738-12800`) | **INSERTS A NEW record with `fees: '0'`, `slippage: '0'`** | 0 | `9bc5bcb3f` (2025-12-04) *"Adds a new endpoint for clearing stranded trades"* |
Total 1,552 closed rows = 182 + 1,370 + 0 + 0 + 0 + 0 (measured ~08:30Z). ⇒ Paths 2, 4 and 5 break KD-17 as written (no fee / an invented zero fee / a dropped record). None has fired in the retained history, so these are fences, not repairs.

**A-4 — `getActiveOpenPositions` readers (OBJ-4): 68 / 16 files, 57 mode-scoped, 11 want every mode.** The 11: the I8C open-positions provider for the shared Kraken WS adapter (`active-execution-engine.ts:~1330`; one callback slot, the last engine to start overwrites it), the tick-health symbol provider (`active-engine-service.ts:~772`, a `'paper'` literal on a shared object), the boot symbol-map audit (`index.ts:~566`), and eight diagnostics routes that join `getActiveOpenPositions('paper')` with `getActiveTrades('live')` — the live half still reads the OLD `trades` table. Three mode-scoped sites DELETE or BOOK rows and today act on every mode because the argument is ignored: force-clear (`routes.ts:~3294`), the stop flow's orphan delete (`active-engine-service.ts:~1041`), force-clear-stranded. `deleteActiveOpenPosition` (`storage.ts:~3854`) also ignores its mode. Separate: `trailing-exit-controller.ts:~661` finds rows by symbol and would update a paper and a live row on the same symbol.

**A-5 — Readers of the fee / cost / P&L columns (OBJ-6): 36** (21 server, 7 in `scripts/analysis/b_xstock_fee_contract_verify.sql`, 8 in the client adapter). Money-bearing: `getLifetimeScoreboard` (`net_pnl` → `pnl`, SUM skips NULL), `honestNetPnl` (reconstructed → net → pnl → 0), `computeFeeDrag` (`totalFee` → `fees` → 0; **`grossPnl` NULL → 0 silently**), `computeByAssetClass`. All of these read only rows with `closed_at` set — but per A-3, "closed" does not mean "written". Readers that can see OPEN rows: two log-only diagnostics, the analysis script, `getClosedTradesPaginated` sort keys if `closedOnly` is omitted, and the legacy `/active-engine/trades` route (no caller). The client renders a NULL net/gross as "—".

**A-6 — `asset_class` writers (OBJ-7): 2 physical inserts, 4 callers, all explicit** (the engine's open: `_tradeClass`, refused `UNCLASSIFIABLE` if it cannot resolve; both operator routes: `position.assetClass`). No migration inserts, no UPDATE sets the class. Dropping `DEFAULT 'crypto_spot'` on both tables changes no behaviour and makes the insert type require the class.

**A-7 — Governance and ledger.** System Manual `:5863` names `UNIQUE (symbol)` and calls `unique_symbol_side` the paper table's — wrong against the database (OBJ-3 corrects it in its deploy). `#1006`: the checked-in schema can describe objects the database lacks; there is no `drizzle/meta` snapshot in the repo, so the sweep is the declared index in `shared/schema.ts`. `#508`'s compensation delete is pinned by OBJ-5. `bridge/canonical/`: no coverage of the close writers.

## B. PLAN (each item points at its finding)
**Increment 1 — the key and its net (OBJ-1, OBJ-2, OBJ-2b, OBJ-8 for the lookup).**
| # | item | from |
|---|---|---|
| P-1 | New storage method: exact symbol, mode and NON-nullable class, `closed_at IS NULL`, `close_reason IS DISTINCT FROM 'never_filled'`; returns `{ status: 'one', record } | { status: 'none' } | { status: 'many', ids }`. `getClosedTradesBySymbol` deleted (rule 18). | A-1 |
| P-2 | `closePosition`: the lookup + refusal sit directly after the fill contract's last refusal, before `_closeRefusalStreak.delete`. `none`/`many`/unresolvable class ⇒ critical alert (dedupe per mode+symbol), position kept, return. The `flatten` exemption does not apply. | A-1 |
| P-3 | OBJ-2b deletions (the `LADDER_NO_TRADE_ROW` arm, the `if (!trade)` block, the `if (trade)` wrapper; the `#620` comment clause narrowed; the `_lsAcc` hoist comment rewritten), with the state-write census. | A-1 |
| P-4 | Re-point `b-feed-mismatch-fix.test.ts` and `b-class-leg-fill-mode-engine.test.ts` to the new method with a positive control. | A-1 |

**Increment 2 — mode on open positions (OBJ-3, OBJ-4, OBJ-5).**
| # | item | from |
|---|---|---|
| P-5 | Migration, ONE transaction: read the unique set, refuse unless exactly `unique_symbol_side (symbol, side)`; `ADD COLUMN mode` nullable → backfill `paper` → `SET NOT NULL`; `DROP CONSTRAINT unique_symbol_side` (no `IF EXISTS`); `ADD CONSTRAINT unique_symbol_mode UNIQUE (symbol, mode)`. Rollback in git. Declared schema: the symbol-only index replaced by the `(symbol, mode)` unique (`#1006` sweep). System Manual `:5863` corrected in this deploy. | A-2, A-7 |
| P-6 | `createActiveOpenPosition` stamps `mode`; its dedup-return reads the winner by `(symbol, mode)`. `getActiveOpenPositions(mode)` and `deleteActiveOpenPosition(mode, id)` filter on mode. | A-4 |
| P-7 | The 11 every-mode readers get an explicit all-modes read (`getActiveOpenPositionsAllModes()`), so they keep today's behaviour and say so; the 57 keep `getActiveOpenPositions(mode)`. The eight diagnostics routes' `getActiveTrades('live')` half (old `trades` table) is left as is and noted — not this batch. | A-4 |
| P-8 | OBJ-5 pinning test (guard per mode; the unique set is exactly one rule on `(symbol, mode)`; `#508` eviction) with its three mutations. | scope |
| P-9 | `trailing-exit-controller.ts:~661` symbol match: **recorded, not fixed here** — it needs live rows in this table to bite; proposed to Kyle via PM Claude as an item for row 19 or the live-mode work. | A-4 |

**Increment 3 — every close writes its record and its real fee (OBJ-6, OBJ-7, the A-3 writers).**
| # | item | from |
|---|---|---|
| P-10 | **The two operator routes stop writing their own record.** Manual close → `closePosition` (the canonical close books real exit fees through the fill contract and finishes the open-time record — no orphan). Force-clear-stranded → for a position whose record EXISTS, `closePosition`; for one whose record is MISSING, the restore remedy (P-12) first, then `closePosition`. Their own row writers deleted. | A-3 |
| P-11 | **`engine_stop_cleanup` books real costs.** The record's own entry fee + the exit fee and slippage from the SAME cost model `closePosition` uses at that price, net P&L, `exitFillArm='synthetic_reference'` kept (it is learning-fenced already). One shared function computes the close economics for both paths, so they cannot drift. | A-3 |
| P-12 | **The operator remedy for a refused close (scope §5's owed item).** A guarded admin action, per position: if no record exists, insert the OPEN-time record from the position's own open-time fields (symbol, class, mode, side, quantity, entry price, entry fee and slippage, strategy, opened_at — all present on the position), stamped `record_restored_from_position=true`. Nothing about the exit is written; the next close books the real exit. Refuses if a record exists. | A-3, scope §5 |
| P-13 | **Hard reset stays an economics-free close, as a named population.** A reset abandons positions; it is not a trade outcome (`#1154`). `close_reason='hard_reset'` joins `never_filled` as an explicit "not a trade outcome" population: the money readers exclude it by name, not by an incidental `exitPrice > 0` filter. **Question for Langston (§C).** | A-3, A-5 |
| P-14 | Drop `DEFAULT 0` on the eleven fee/cost/P&L columns; `never_filled` writes an explicit 0; the open-time insert writes the entry values; a filled close with a NULL fee is refused with an alert. Drop `DEFAULT 'crypto_spot'` on both tables. | A-5, A-6 |
| P-15 | Readers: every money reader that coerces NULL to 0 (`computeFeeDrag` `grossPnl`, `honestNetPnl`'s last fallback, `getLifetimeScoreboard`) instead excludes the row and counts it in a log line; the two log-only diagnostics and the analysis script read closed rows only; the legacy `/active-engine/trades` route (no caller) is deleted with the log. | A-5 |

**Step-7 verification (pre-registered):** OBJ-1 — over 24 h, N closes and N records stamped by the new method, 0 refusals, N stated (0 ⇒ unread). OBJ-3 — the unique set is exactly `(symbol, mode)`. OBJ-6 — every newly closed filled record has non-NULL `entry_fee`, `exit_fee`, `total_fee`, `net_pnl`. UI — Active Trades and Trade History render the same as before the deploy (Claude-in-Chrome).

## C. Questions for Langston
1. **P-13 hard reset:** keep it economics-free as a named non-outcome population (my recommendation — a reset is an erase, not a trade), or make it book the abandoned positions at a reference price like `engine_stop_cleanup`?
2. **P-10 manual close via `closePosition`:** the manual close today books at the live quote with a fallback to the entry price; through `closePosition` it takes the fill contract (it can be REFUSED on a cold book, like every other close). I recommend accepting that — a manual close that cannot be filled honestly should not be booked.
3. **P-12 restore remedy:** an admin route, or a script run by hand? I recommend a route behind the existing admin guard, since the stranded-clear button already lives there.

## D. Plain-language summary
The plan was built around one place that finishes a trade's record. The audit found six; one is the harmless "order never filled" case. Three others can book a trade without its fees, and one can leave the original record orphaned. None has happened yet. The plan sends the two admin buttons through the normal close, makes the engine-stop cleanup book real costs, keeps the account reset as a deliberate "not a trade" case, and adds an admin repair that restores a missing opening record without inventing any exit values.

---

## r2 AMENDMENT (2026-11-05, CC-A) — Langston's Step-2 CHANGES on r1 (Discord `1567834671784402955`) folded

Read at `736388ce2` (staging runs `0abfd7102`). Line numbers drift; implementation locates by content.

**PREVIOUSLY STATED → NOW:**
- **PREVIOUSLY STATED (A-3):** six paths finish a record, and that is the census. **NOW: six code sites END a position** (`deleteActiveOpenPosition`), and three of them can end one without finishing its record (A-8). **REASON:** Langston BLOCKER-1.
- **PREVIOUSLY STATED (A-4, P-7):** 11 readers want every mode; they get an all-modes read. **NOW: none of the 11 wants every mode by intent**, so there is no all-modes method (A-9). **REASON:** BLOCKER-2 — "keeps today's behaviour" is equally true of all 68 while the argument is ignored.
- **PREVIOUSLY STATED (P-13, P-15):** the money readers exclude `never_filled` and `hard_reset` by name. **NOW: an allowlist of booked reasons, one seam per route; unknown reasons are excluded and alerted** (A-10). **REASON:** BLOCKER-3, BLOCKER-4.
- **PREVIOUSLY STATED (A-7):** "no views exist" (scope OBJ-6). **NOW:** repo — six view definitions, none reads `closed_trades`; live catalog — 2 public views, none reads `closed_trades`, 0 materialized views (control: the same `ilike` finds `v_goals_learning_summary` on `%goals%`). **REASON:** condition (h).

### A-8 — what ENDS a position (BLOCKER-1)
`git grep -n deleteActiveOpenPosition` at `736388ce2`, tests excluded: **six production call sites** (the System Impact Map says seven — corrected at Step 10).

| site | finishes the record? | disposition |
|---|---|---|
| `active-execution-engine.ts:5084` (`closePosition`) | yes — path 1 | kept; P-2's refusal sits before it |
| `routes.ts:12701` (manual close) | writes its OWN new record, orphans the open one (path 4) | P-10 — through `closePosition` |
| `routes.ts:12825` (force-clear-stranded) | writes its OWN record with zero fees (path 5) | P-10 — through `closePosition`, after P-12 if the record is missing |
| `active-execution-engine.ts:1997` (`_dropUnfilledMaker`) | only `if (tradeId)` — no `else`; a position without `metadata.tradeId` is deleted and its record left `closed_at IS NULL` for ever (`:1998` logs it) | **P-16 (new)** |
| `active-engine-service.ts:1060` (stop flow's orphan delete) | writes nothing; relies on the reconciler (path 2) running later; nothing enforces it | **P-17 (new)** |
| `routes.ts:3299` (`POST /diagnostics/aj19b/force-clear-positions`) | deletes every open position of a mode, writes NOTHING to `closed_trades` — drops the trades by design | **P-18 (new)** |

Populations today: 0 of 19 open positions lack a `tradeId` (Langston, `88c35cab9`); `[AJ19B][FORCE_DELETE]` lines in the current `out.log`: 0. So P-16..P-18 are fences, not repairs. P-18's route: introduced `53a5cbce9` (2025-12-03, *"Add comprehensive diagnostics for trade lifecycle and guardrail integrity"*, Replit), labelled in code *"DANGEROUS - for debugging only"*; callers in `client/`, `scripts/`, `server/` outside its own definition: none (`git grep` for `force-clear-positions` and `aj19b/force-clear`).

### A-9 — intent of the 11 (BLOCKER-2)
| site(s) | intent | disposition |
|---|---|---|
| the eight diagnostics routes (each pairs `getActiveOpenPositions('paper')` with `getActiveTrades('live')`, whose live half reads the OLD `trades` table) | the active table — `'paper'` is a no-op argument today | keep `'paper'`; after P-5 it returns the identical set (all rows backfill to paper) and stays correct forward. An all-modes read would double-count the first live row (the live half already comes from `trades`). |
| `active-execution-engine.ts:~1330` (I8C open-positions provider for the shared Kraken WS adapter) | this engine's positions | keep `this.mode`. ⚠️ **The adapter has ONE provider slot and the last engine to start overwrites it** — with paper and live both running, the adapter would see only one mode's symbols. That is a pre-existing live-mode defect, not this batch's; **proposed to Kyle via PM Claude** (no row placed by me). |
| `active-engine-service.ts:~772` (tick-health symbol provider, `'paper'` literal) | the paper engine's tick health | keep `'paper'` |
| `index.ts:~566` (boot symbol-map audit: `'paper'` + `getActiveTrades('live')`) | as the diagnostics | keep `'paper'` |

⇒ **No `getActiveOpenPositionsAllModes()`.** P-7 becomes: all 68 sites keep a mode-scoped read, the eleven with the intent recorded above; the unit test asserts no call site passes anything but a `TradingMode`.

### A-10 — the non-outcome rule (BLOCKER-3, BLOCKER-4)
- **Close reasons in the data** (`closed_trades`, all rows, 2026-11-05): `stop_hit`, `target_hit`, `trailing_stop_hit`, `max_holding_period`, `reset`, `manual_stop`, `never_filled` — 7 values. **Written by the code:** `closePosition` takes `exitCondition.type` (`ExitCondition`, `active-execution-engine.ts:4200`); `forceClosePosition` (`:1611`) passes the condition with `reset` / `manual_stop`; `_dropUnfilledMaker` writes `never_filled`; `reconcileIncompleteTrades` `engine_stop_cleanup`; the hard reset `hard_reset`; the two operator routes their own (`stranded_clear`, a computed manual reason).
- **The two money routes and the scoreboard:** `GET /active-engine/balance-curve` (`routes.ts:12280`; filter `t.closeReason !== 'never_filled'` at `:12312`) and `GET /active-engine/trades/analytics` (`routes.ts:12853`; `never_filled` excluded at `:12921`, rows without an exit price excluded at `:12922`), plus `storage.getLifetimeScoreboard` (`storage.ts:3419`, SQL). `honestNetPnl` is a predicate (`:13025-13026`), a reducer (`:13030`, `:13044`, `:13097`) and a curve map (`:12317`); `computeFeeDrag` / `computeByAssetClass` read the same `trades` array (`:13146`, `:13161`).
- ⚠️ **Kyle's 2026-10-19 rule puts the main Dashboard off-limits; both routes feed `mode-dashboard-tab.tsx:110-121`.** This change is inside it only as KD-17's fence (OBJ-6, Kyle-agreed): **on today's data it must change no number** — the only non-booked rows today are the 182 `never_filled`, which both routes already drop. That is pre-registered as a Step-7 equality check, and a difference is a stop, not a finding.

### PLAN — changes to r1
| # | item | from |
|---|---|---|
| **P-1** (amended, condition (a)) | the `close_reason IS DISTINCT FROM 'never_filled'` arm is **dropped**: `_dropUnfilledMaker` writes `closed_at` and `close_reason` in one update (`active-execution-engine.ts:~1982-1990`), so under `closed_at IS NULL` it can never discriminate. | A-1 |
| **P-2** (amended, condition (f)) | the refusal mints under its own key, body ending `DISPOSITION: RESOLVE, do not ACK`. The old `close-no-trade-row-*` emit site goes with P-3: **0 rows** on that key across the alert queue (Langston's read, 2,816 rows / 960 keys, control 16 active rows on other keys) — nothing orphaned. | A-1 |
| **P-5** (amended, condition (e)) | **the deploy window, made empty:** `dt-deploy` runs `db:migrate` BEFORE `pm2 restart`, so between them the OLD process still inserts without `mode`. Migration 1 therefore adds `mode` as `NOT NULL DEFAULT 'paper'` (only the paper engine runs — the default is correct for every insert the old process can make) together with the backfill check and the constraint swap, in ONE transaction; the code writes `mode` explicitly from the same deploy; **migration 2, in the NEXT deploy, drops the default** after a read that every row inserted in between carries `mode='paper'` and the new code's inserts name it. The default lives one deploy and is stated as such — it is a window bridge, not a fallback (KD-17). | A-2 |
| **P-7** (rewritten) | per A-9: no all-modes method; the eleven keep a mode-scoped read with their intent stated in the diff; the I8C single-slot race recorded and proposed to Kyle. | A-9 |
| **P-8** (amended, condition (d)) | the pinning test also pins `side: 'buy'` at the engine's open insert (`active-execution-engine.ts:~6493`): side has left the key, so a sell-side position would collide on `(symbol, mode)` and take the `#508` dedup-return. The key itself is Kyle's (KD-24/25), unchanged. | scope |
| **P-12** (amended, condition (c); Q3) | the restore stamps `restored_at` and `restored_by_claimed` (the authenticated caller, recorded as a CLAIM per `#447`), beside `record_restored_from_position=true`. An admin route behind the guard the stranded-clear button uses; idempotent; refuses when a record exists. | A-3 |
| **P-13** (Q1) | the hard reset stays economics-free — a named non-outcome under A-10's rule. | A-3 |
| **P-14** (amended, condition (b)) | also drops `DEFAULT '0'` on `active_open_positions.entry_fee` / `entry_slippage` (`shared/schema.ts:~2005`, `:~2045`): the one writer sets both (`active-execution-engine.ts:~6490`), and P-12 restores the open record FROM the position, so a defaulted zero there would become a booked zero entry fee. | A-6 |
| **P-15** (rewritten) | **one classifier, `closeOutcomeClass(t)` → `'booked' \| 'non_outcome' \| 'unknown'`**, beside `honestNetPnl` in `dashboard-metrics.ts`, from two typed lists: BOOKED = every `ExitCondition['type']` + `reset`, `manual_stop`, `engine_stop_cleanup` and whatever reasons P-10's operator closes pass; NON_OUTCOME = `never_filled`, `hard_reset`. A compile-time exhaustiveness check over the union makes a new reason a type error until it is classed. **Each route filters ONCE**, on its fetched set, and every metric in that route — win rate, profit factor, net, by-strategy, fee drag, by-class, the curve — reads that one filtered set; the counts excluded per class are returned. The scoreboard SQL takes the same BOOKED list as a parameter. **`unknown` ⇒ excluded and alerted** (`close-reason-unknown-<reason>`, resolve-only). The old per-route `never_filled` filters are replaced, not added to. | A-10 |
| **P-16** (new) | `_dropUnfilledMaker` without a `tradeId`: resolve the record by P-1's key (symbol, mode, class); exactly one ⇒ close it `never_filled` as today; none or many ⇒ keep the position and raise P-2's refusal alert. Never delete a position whose record is unresolved. | A-8 |
| **P-17** (new) | the stop flow's orphan delete finishes the record FIRST, through P-11's shared engine-stop close (the record's own entry costs + the exit cost model at the reference price), resolved by `tradeId` else P-1's key; unresolved ⇒ keep the position, alert, do not delete. The "reconciler later" dependency goes. | A-8 |
| **P-18** (new) | `POST /diagnostics/aj19b/force-clear-positions` is **deleted** (rule 18): a debug route that drops trades, no caller; the sanctioned erase is the hard reset. `DELETED_COMPONENTS_LOG.md` entry with the census. | A-8 |

**Step-7 additions (pre-registered):** (g) the new refusal and P-16/P-17's unresolved arms **cannot fire** in a 24 h window — paths 2-5 have 0 rows in all retained history — so they are **fence-verified only** (their tests and mutations), and no live silence is cited for them (#661 leg 3). **P-15 equality:** for one fixed window, `/active-engine/trades/analytics` and `/active-engine/balance-curve` return identical win rate, profit factor, net P&L, fee drag, by-class and curve points before and after the deploy; any difference stops the batch. P-5: after migration 1, every row inserted until migration 2 has `mode='paper'`.

**Langston's three answers, recorded:** (1) hard reset economics-free — P-13. (2) manual close through `closePosition`, refusable — P-10; ⚠️ **consequence surfaced to Kyle (via PM Claude, 2026-11-05):** with the entry-price fallback gone, a position on a cold book has NO operator close (the flatten is price-gated too) — his to accept or fund; no row placed by me. (3) admin route — P-12.

**In plain language:** Langston found that the plan counted the places that finish a trade's record but not the places that delete a position. Three of those six can delete one and leave its record hanging. The revision makes each finish the record first, or keep the position and raise an alert, and deletes an old debugging button that throws trades away. The "which closes count as real trades" rule becomes one shared list: anything unrecognised is left out and flagged. And the database change is ordered so that no trade can fail to save while the new code is starting up.

---

## r3 AMENDMENT (2026-11-05, CC-A) — Langston's CHANGES on r2, scoped to P-15 (Discord `1567869171407257653`) + his riders

A-8, A-9 and conditions (a)-(d), (f)-(h) stand as ruled. Read at `e43cae96e`.

**PREVIOUSLY STATED → NOW:**
- **PREVIOUSLY STATED (A-10):** the money routes filter `never_filled` and the classifier replaces that. **NOW: each route has MORE predicates than A-10 listed** — the full sets below — and the classifier is reason-pure, with a separately named data-validity predicate. **REASON:** Langston P-15 items 1-2.
- **PREVIOUSLY STATED (P-15):** a compile-time exhaustiveness check over `ExitCondition['type']`. **NOW: over ONE exported `CloseReason` union typed at the record writers.** **REASON:** P-15 item 3 — all seven `ExitCondition` members are booked, so a check over that union could never catch a new NON-outcome reason.

### A-11 — the predicate census of the two money routes, at `e43cae96e`
| route | predicate | kind |
|---|---|---|
| `GET /active-engine/balance-curve` (`routes.ts:12280`) | `getClosedTrades(mode, { closedOnly: true })` | fetch |
| | `t.closedAt && t.closeReason !== 'never_filled'` (`:12312`) | outcome (by name) |
| | `isInObservationEpoch(t, _curveEpoch)` (`:12317`, `dashboard-metrics.ts:115`; both legs keyed to the epoch, `#741`) | **window** |
| `GET /active-engine/trades/analytics` (`routes.ts:12853`) | `getClosedTrades(mode, { limit: 'all' })` | fetch |
| | `closeReason === 'never_filled'` excluded (`:12921`) | outcome (by name) |
| | `hasExitPrice` — `exitPrice > 0` (`:12922`) | **data validity** |
| | `hasCloseReason` — non-blank (`:12923`) | outcome (blank) |
| | the `startTime` window by OPEN time (`1h` … `all`, default 24 h; engine stopped ⇒ an unreachable floor) | **window** |

**Measured distribution (staging, `closed_trades`, all rows, 2026-11-05 ~12:00Z)** — every predicate applied, per reason:

| reason | rows | closed | closed, exit price > 0 | closed, no exit price |
|---|---|---|---|---|
| `stop_hit` | 909 | 909 | 909 | 0 |
| `target_hit` | 434 | 434 | 434 | 0 |
| `never_filled` | 182 | 182 | 0 | 182 |
| `trailing_stop_hit` | 15 | 15 | 15 | 0 |
| `reset` | 9 | 9 | 9 | 0 |
| `max_holding_period` | 4 | 4 | 4 | 0 |
| `manual_stop` | 1 | 1 | 1 | 0 |
| **blank** | **20** | **0** | 0 | 0 |

All rows `mode='paper'`; 1,574 total, 20 open (the 20 blank-reason rows ARE the 20 open records — a record's reason is written at close). ⇒ **On closed rows today, `hasExitPrice` and `hasCloseReason` exclude exactly the 182 `never_filled` rows and nothing else**, so moving them into a shared seam changes no counted set on either route.

### P-15 (r3)
- **The classifier is reason-pure:** `closeOutcomeClass(reason: string | null)` → `'booked' | 'non_outcome' | 'unknown'`. Blank or null ⇒ `unknown`.
- **The ONE shared seam, named:** `countedTrades(rows)` keeps a row iff (1) `closedAt` set, (2) `closeOutcomeClass === 'booked'`, (3) **`exitPrice > 0` — a data-validity predicate, named as such, not an outcome rule**. It returns the counted set and THREE separate exclusion counts: `nonOutcome`, `unknownReason`, `bookedWithoutExitPrice`. The last two alert (`close-reason-unknown-<reason>`; `booked-close-without-exit-price`, both resolve-only): under KD-17 a booked close with no exit price is a writer defect, not a row to drop quietly.
- **Window predicates stay route-specific and are applied AFTER the seam, by name:** balance-curve keeps `isInObservationEpoch`; analytics keeps its `startTime` window. They are not outcome rules and the seam does not absorb them.
- ⇒ **Effect per route, stated:** analytics: its three outcome/validity predicates become the seam — same counted set today. Balance-curve: GAINS the blank-reason and exit-price predicates through the seam — same counted set today (0 such closed rows). The scoreboard SQL takes the BOOKED list and `exit_price > 0`.
- **Exhaustiveness — one `CloseReason` union, typed at the writers** (the `#448` single-source shape): `CloseReason = ExitCondition['type']` (the seven: `target_hit`, `stop_hit`, `trailing_stop_hit`, `max_holding_period`, `guardrail`, `manual_stop`, `reset`) `| 'never_filled' | 'hard_reset' | 'engine_stop_cleanup'` plus whatever P-10's operator closes pass (fixed in the diff). `createClosedTrade` / `updateClosedTrade` take `closeReason: CloseReason`; the classes are a `Record<CloseReason, 'booked' | 'non_outcome'>`, so a new reason anywhere is a compile error until it is classed. The runtime `unknown` arm remains for legacy and blank values. `guardrail`: 0 rows, auto-classed booked — correct, noted.
- **Re-registered Step-7 equality (replacing r2's):** for one fixed window per route, the counted set (row ids), win rate, profit factor, net P&L, fee drag, by-class and curve points are identical before and after the deploy; `nonOutcome` = the window's `never_filled` count; `unknownReason` = 0; `bookedWithoutExitPrice` = 0. Any difference stops the batch.

### P-5 riders (Langston (i)-(iii))
- **(i)** the migration sets `lock_timeout` (5 s) before its ACCESS EXCLUSIVE work, so a wedged migration fails the deploy instead of stalling opens; `dt-deploy` then refuses to restart (migrate precedes restart at the installed `/usr/local/bin/dt-deploy` `:242`/`:253`), so the old code keeps running on the old schema.
- **(ii)** r2's "read that every interim row is `'paper'`" is **dropped as a claim** — positions are deleted at close, so the interim set is likely empty and an empty read is indistinguishable from a clean one. Migration 2 is discharged instead by the CODE: a unit test that the open insert names `mode` explicitly, and migration 2 prints the row count it saw (a presence figure, not a proof).
- **(iii)** rollback order: CODE first, then schema — reversed, every new insert fails NOT NULL.

### P-18 rider
`docs/audits/aj19-metrics-and-trade-closure-analysis.md:206` tells an operator to call the deleted route — rewritten in the same deploy to point at the hard reset and the stranded-clear path. `B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md:723` enumerates the route in a past batch's record — left as history, listed as left-intentionally in the deletion-log entry.

**`RULED ON REPORTED FACT` items Langston bound in:** the close-reason distribution is re-derived above with the predicates applied (it replaces A-3's headline count for P-15's purpose: 1,574 rows = 1,372 booked closed + 182 never-filled + 20 open). A-5's 36 readers and A-9's intent table are re-checked at implementation against the diff.

**In plain language:** Langston found that the two dashboard number routes already filter trades slightly differently, and that my list missed a date-window filter on one of them. The revision lists every filter on both routes. It keeps "is this a real trade" separate from "does this trade have a price" and from each route's own date window. It checks the trade data to show that none of today's numbers will change. And it makes forgetting to classify a new kind of close a build error.

---

## r4 AMENDMENT (2026-11-05, CC-A) — Langston's CHANGES on r3 P-15 (Discord `1567896988127862805`), C-1..C-6 folded

A-8, A-9, (a)-(d), (f)-(h), the P-5 riders and P-18 stand as accepted. P-15 below **replaces** r3's P-15.

**PREVIOUSLY STATED → NOW:**
- **PREVIOUSLY STATED (r3 A-11):** both routes drop `never_filled` themselves, and the seam's `nonOutcome` = the window's `never_filled` count. **NOW: the FETCH already drops it** — `getClosedTrades` adds `close_reason IS DISTINCT FROM 'never_filled'` in SQL unless `includeNeverFilled` is passed (`storage.ts`), and neither route passes it, so both route-level `never_filled` filters are dead and r3's `nonOutcome` leg was 0 by construction. **REASON:** Langston C-1 (his B-PRICE-STALENESS-BOUND ruling).
- **PREVIOUSLY STATED (r3 A-11):** analytics' window is by OPEN time; only balance-curve applies an epoch. **NOW:** analytics also applies `isInObservationEpoch` (`routes.ts:12946`) with an epoch-clamped floor (`clampWindowToEpoch`, `:12938`), and its window is by OPEN time only for `range='session'` and by CLOSE time for every other range (`:12949-12951`); balance-curve's fetch is `{ limit: 'all', closedOnly: true }`. **REASON:** C-6 — rows corrected, not adjusted.
- **PREVIOUSLY STATED (r3):** a new exported `CloseReason`. **NOW:** a `CloseReason` type already exists (`i1-trade-lifecycle-diagnostics.ts:23`, different members) and a third vocabulary at `aj19b-lifecycle-diagnostic.ts:63`. **REASON:** C-2.

### P-15 (r4)
1. **The fetch stops being an outcome rule (C-1).** Both money routes call `getClosedTrades(..., { includeNeverFilled: true })`; the seam `countedTrades()` is then the ONE outcome rule. The counted set is unchanged by construction; `nonOutcome` becomes a real, falsifiable number (the 183 `never_filled` rows all carry `closed_at` and `opened_at`, 2026-07-15 → today, so they are window-reachable). `getClosedTrades`' SQL default stays for its other callers — their list is enumerated in the diff, each named as wanting it or not.
2. **One reason vocabulary, one name (C-2):** the single source is `TradeCloseReason` (a new name, so it collides with nothing), defined once beside `ExitCondition`. The two diagnostic vocabularies are NOT parallel copies after this: `i1-trade-lifecycle-diagnostics.ts`'s `CloseReason` and `aj19b-lifecycle-diagnostic.ts:63` each become a `Record<TradeCloseReason, <their bucket>>` derived from the source, so a new reason is a compile error in both. `closeReasonMap` (`active-execution-engine.ts:5205`, today `Record<string, …>` with `|| 'UNKNOWN'`) becomes `Record<ExitCondition['type'], …>` with the fallback removed. The claim "a new reason anywhere is a compile error" is made only for these typed sites, which the diff lists.
3. **P-10 and P-15 ship in ONE increment and one deploy (C-3).** The writer census at the ref has two reasons outside the union: `routes.ts:12663` `reason || 'manual_close'` (free text from `req.body`) and `routes.ts:12798` `'stranded_clear'` — both writers are deleted by P-10. **The free-text `reason` body field is GONE** (the route no longer reads it), not retyped; a typed parameter satisfied by a cast of request text would buy nothing (`#448`).
4. **The SQL copies (C-4):** the outcome rule also lives in `getClosedTrades`' default and in TWO `getLifetimeScoreboard` CTEs (`storage.ts` ~`:3465`, ~`:3518`). Both CTEs take the BOOKED list as a bound parameter **derived from the TS constant**, plus `exit_price > 0` (a new predicate there; 0 rows affected today, Langston measured), and a fence test asserts the scoreboard SQL contains no literal reason list.
5. **One seam output per route, windows where they belong (C-5):** each route computes `countedTrades()` ONCE; windowed metrics apply that route's window to the seam output; analytics' `earnings` (`computeRollingEarnings`, pre-window) and `lifetime` (window-independent) read the seam output UNWINDOWED, exactly as today — implementing "every metric reads one filtered set" literally would re-break B-DASHBOARD-STATS-BLANK and the `#415` scoping.
6. **Census rows, corrected (C-6):**

| route | predicates, in order |
|---|---|
| balance-curve (`routes.ts:12280`) | fetch `{ limit: 'all', closedOnly: true }` (+ `includeNeverFilled: true` after this batch) → seam → `isInObservationEpoch` (`:12317`) |
| analytics (`routes.ts:12853`) | fetch `{ limit: 'all' }` (+ `includeNeverFilled: true`) → seam (replaces `never_filled` `:12921`, `hasExitPrice` `:12922`, `hasCloseReason` `:12923`) → `isInObservationEpoch` (`:12946`) with the floor epoch-clamped (`clampWindowToEpoch`, `:12938`) → the window: by OPEN time for `range='session'`, by CLOSE time for every other range (`:12949-12951`); `earnings` and `lifetime` unwindowed (item 5) |

### Step-7 equality (re-registered, replacing r3's)
- **Windows named:** analytics at `range='all'` (epoch-clamped) and at `range='24h'`; balance-curve over its full (epoch-bounded) series. **Never `range='session'` with the engine stopped** — its floor is unreachable, so that window is empty by construction.
- **Per route and window, stated with n:** the counted set (row ids), win rate, profit factor, net P&L, fee drag, by-class and curve points identical before and after the deploy; `nonOutcome` = the window's `never_filled` count, **which must be ≥ 1** in the `all` window (else the window cannot discriminate and is replaced); ≥ 1 booked row in every window; `unknownReason` = 0; `bookedWithoutExitPrice` = 0. Any difference stops the batch.

**In plain language:** Langston found that the database query feeding both dashboard routes already throws away the "never filled" trades before my new filter sees them. So one of my checks could never have failed. The revision lets those trades through, so the one shared rule does the filtering and its count means something. It also gives the different lists of close reasons one source the build can check, and ships the admin-button changes with it. Today's dashboard numbers still don't change, and the check that proves that now uses windows that actually contain trades.

---

## r5 AMENDMENT (2026-11-05, CC-A) — Langston's CHANGES on r4 P-15 (Discord `1567925117634216007`): C-7..C-11 folded

C-1..C-6 stand as he confirmed them. Citations below carry the line TEXT beside the number (C-11).

**PREVIOUSLY STATED → NOW:**
- **PREVIOUSLY (r4 Step 7):** counted sets "identical before and after" at `range='all'` / `24h`. **NOW:** every figure is bounded `closed_at < T0`, the pre-deploy read instant, and "24 h" is the FIXED window `[T0 − 24 h, T0)` on both reads. **REASON:** C-7 — 41 booked closes in 24 h (Langston, 15:32Z); a rolling window differs by arrival, not by the fix.
- **PREVIOUSLY (r4):** `nonOutcome` = "the window's `never_filled` count". **NOW:** `nonOutcome` is a count over the FETCHED set (pre-epoch, pre-window) and is compared against SQL carrying only the fetch predicates; the seam runs ONCE. **REASON:** C-8 — 183 fetched vs 86 inside analytics' epoch-clamped `all` window (epoch `2026-10-06T15:52:57.213Z`), two populations.
- **PREVIOUSLY:** `getLifetimeScoreboard` has two CTEs. **NOW:** it has ONE exclusion (`:3465`); the other (`:3514`) is in `getPortfolioMetricComponents` (`:3507`), and there are **13 hardcoded `never_filled` SQL sites in 12 methods**. **REASON:** C-10.
- `never_filled` row counts: **182 at CC-A's read ~12:00Z; 183 at Langston's 15:32Z** (the 183rd closed 12:48:45Z) — both right, time-stamped (C-11).

### The seam, its leg order stated (C-9)
`countedTrades(rows)`, legs in this order, each row leaving at the first leg it fails:
1. **closed** — `closedAt` set; else `notClosed` (a fourth count, never alerted — an open trade is not an anomaly);
2. **outcome class** — `closeOutcomeClass(reason)`: `non_outcome` → `nonOutcome`; `unknown` → `unknownReason` (alert);
3. **exit price** — `exitPrice > 0`; else `bookedWithoutExitPrice` (alert).
Leg 1 before leg 2 keeps the 20 open, blank-reason rows out of `unknownReason`; leg 2 before leg 3 keeps the 183 `never_filled` out of `bookedWithoutExitPrice`. **And analytics' fetch also takes `closedOnly: true`** (`allTrades` has one consumer, `validTrades`), so `notClosed` is 0 on both routes and leg 1 stands as a guard. Analytics' own `!trade.closedAt` check (`routes.ts:12920`, `if (!trade.closedAt) return false;`) is replaced by leg 1.

### The SQL copies — every site, a disposition each (C-10)
**Rule:** every `storage.ts` SQL site that excludes non-outcomes stops carrying the literal `'never_filled'` and takes the NON_OUTCOME list as a bound parameter **derived from the TS constant** — so P-13's `hard_reset` (and any later non-outcome) is excluded everywhere at once, not only in the TS seam. A fence test asserts no literal reason string remains in `storage.ts` SQL.

| site (line at `8f07c5361`) | method | disposition |
|---|---|---|
| `:3223-3224` | `getClosedTrades` default | derived list; both money routes pass `includeNeverFilled: true` (r4 item 1) |
| `:3302` | `getRealizedPnlSince` | derived list (money) |
| `:3329` | `getStraddleEntryCostAt` | derived list |
| `:3382` | `getClosedTradesCount` | derived list (count) |
| `:3465` | `getLifetimeScoreboard` | derived BOOKED list + `exit_price > 0` (r4 item 4) |
| `:3514` | `getPortfolioMetricComponents` (`:3507`) | derived list (money) |
| `:3551` | `getRealizedPnlTotal` | derived list (money) |
| `:3583` | `getDailyRealizedPnlSince` | derived list (money) |
| `:3602` | `getRecentClosedPnls` | derived list (money) |
| `:3617` | `getClosedTradesBySymbol` | **deleted** by P-1 (rule 18) |
| `:3668` | `getLastClosedAtForSymbol` | derived list (a time read; same rule, no reason literal) |
| `:3716` | `getClosedTradesPaginated` | derived list (the history list's existing exclusion, same rule) |
| `:3797` | `getClosedTradesGlobal` | derived list |
**Consequence named:** after P-13, a `hard_reset` row is excluded by all of these; today there are 0 `hard_reset` rows, so no figure moves (Step-7 equality covers the two money routes; the others are covered by the fence + a unit test per method that a `hard_reset` row is excluded).

### Citations corrected, with the line text (C-11)
- `closeReasonMap` — `server/services/active-execution-engine.ts:5212` (`const closeReasonMap: Record<string, 'SL' | 'TP' | … | 'UNKNOWN'> = {`); fallback `:5230` (`closeReason: closeReasonMap[exitCondition.type] || 'UNKNOWN',`). (`:5205` was a `console.error` on a delete failure.)
- `clampWindowToEpoch` — `routes.ts:12939` (`const windowFloor = clampWindowToEpoch(startTime, _epoch);`); `isInObservationEpoch` (balance-curve) — `routes.ts:12316` (`.filter(t => isInObservationEpoch(t as any, _curveEpoch))`).
- ⚠️ **Langston's find under it:** the map covers 6 of the 7 `ExitCondition` members — **`manual_stop` is absent** (`:5212-5222`), so the `UNKNOWN` fallback is LIVE (1 `manual_stop` row exists). Keying the map to `ExitCondition['type']` forces `'manual_stop': 'MANUAL'`: **a declared change** — that close's AJ19-B lifecycle label goes `UNKNOWN` → `MANUAL`. No money reader reads it; it is outside "no number moves", stated here.

### Step-7 equality (r5, replacing r4's)
`T0` = the pre-deploy read instant, recorded. Per route: analytics at `range='all'` (epoch-clamped) and the FIXED `[T0 − 24 h, T0)`; balance-curve over its series; **every figure bounded `closed_at < T0`**, read before the deploy and again after it with the same `T0`. Identical: counted row ids, win rate, profit factor, net P&L, fee drag, by-class, curve points. `nonOutcome` (fetched set) equals the SQL count over the fetch predicates alone (`mode`, `closed_at < T0`) of the non-outcome reasons, and is ≥ 1; ≥ 1 booked row in every window; `unknownReason` = 0, `bookedWithoutExitPrice` = 0, `notClosed` = 0. Any difference stops the batch.

**In plain language:** Langston found that the before/after check had to freeze the clock, because new trades arrive all day. Two counts I had treated as the same are different numbers, and the still-open trades would have tripped the new alert. The revision freezes the comparison at one moment and spells out the order the filter's steps run in. It also brings the database's ten other copies of the "never filled" rule under one shared list, so a future reset is never counted as a real trade anywhere.

---

## r6 AMENDMENT (2026-11-05, CC-A) — Langston's CHANGES on r5 P-15 (Discord `1567939575660286008`): BLOCKER-1, BLOCKER-2 and three nits folded

**BLOCKER-1 — two of the 13 SQL sites INCLUDE `never_filled`, by Kyle's decisions; they stay byte-unchanged.**
- `storage.ts:3667-3674` `getLastClosedAtForSymbol`: `close_reason = 'never_filled' OR (exit_price > 0 AND close_reason non-blank)` — an INCLUSION: *"A never-filled maker STARTS the cooldown — DECIDED (Kyle 2026-09-30, B-SIZING-DEC-RESTORE 2e Pe3); pinned by integration/b-sizing-inc2b-cooldown-db.test.ts. Do not narrow this arm without a new decision."*
- `storage.ts:3715-3722` `getClosedTradesPaginated`: the same shape — never-filled rows passed EXPLICITLY so they are VISIBLE in the closed list (Kyle; "visible ≠ counted").
- ⇒ **Both arms are left byte-unchanged.** r5's dispositions for them ("derived list") are WITHDRAWN: applied, the rule would have inverted the cooldown arm (an entry-path change over 185 live `never_filled` rows) or silently extended it to `hard_reset` — a scope decision, not a constant swap. **11 of 13 sites** take the derived NON_OUTCOME list. The fence ("no literal reason string in `storage.ts` SQL") carries these two NAMED, each with its reason and its Kyle decision; a third literal anywhere fails it. **Per-site tests, stated per site:** at the 11, a `hard_reset` row is EXCLUDED; at `getLastClosedAtForSymbol`, a `never_filled` row still STARTS the cooldown (the existing pin) and a `hard_reset` row's effect is unchanged from today; at `getClosedTradesPaginated`, a `never_filled` row is still VISIBLE. Whether `hard_reset` should start a cooldown or be visible is NOT decided here (0 rows today) — recorded as an open question, not changed.

**BLOCKER-2 — T0 gets an instrument: an additive `asOf` bound on both money routes.**
- Analytics reads only `range` and `mode` (`routes.ts:12856`, `:12859`); its windows are computed off `now` (`:12887-12896`) and its membership tests are `>= windowFloor` with no upper bound (`:12945-12953`); balance-curve has only the epoch. So r5's `[T0 − 24 h, T0)` could not be requested and `closed_at < T0` could not be imposed on the post-deploy read.
- **The carrier:** an optional `asOf` query parameter on both routes — absent ⇒ today's behaviour, byte-for-byte; present ⇒ every row is bounded `closed_at < asOf` and every window ends at `asOf` (`range=24h` ⇒ `[asOf − 24 h, asOf)`). Used only by the Step-7 read. **Declared** as a change, like the `manual_stop` label; the page never sends it.
- **Arrival rule:** both reads pass the same `asOf = T0`. Before comparing, a SQL check confirms the `closed_at < T0` population is identical on the two reads (same row-id set). **An arrival or a changed row invalidates the read and it is RETAKEN;** only a difference with the population verified identical stops the batch. (Measured by Langston 16:29:40Z: 44 booked + 9 `never_filled` closes in the trailing 24 h ≈ 2.2/h; `never_filled` 182 (~12:00Z) → 183 (15:32Z) → 185 (16:29Z).)

**Nits:** the SQL sites span **13 methods, not 12**; analytics' window cite is `:12948-12952` (the close-time return is `:12952`); C-8's comparator is the SQL over `closedOnly` + `mode` + `closed_at < T0`.

**Deploy-drift note (Langston's alert routing `e4b0d52a`):** staging's drift today is the agreed joint hold (CC-C's B-BALANCE-SESSION-PAIRING, CC-A's B-DISK-FILE-TIERING increment 6, CC-B's B-ENTRY-GATE increment A; one deploy of the head after 2026-11-07T13:03:42Z). This batch's Step-7 pre-deploy read is taken only at the runtime that batch ships onto, recorded with its sha.

**In plain language:** two of the database queries include never-filled orders on purpose, because you decided so. One lets a never-filled order start the cooling-off timer; the other shows those orders in the trade history. Both stay exactly as they are; the other eleven queries share the one list. The before/after check on your dashboard numbers gets a fixed "as of" time on both routes, so trades closing during the day can no longer cause a false fail. If a trade does arrive between readings, the check is simply re-run.

---

## r7 AMENDMENT (2026-11-05, CC-A) — Langston's CHANGES on r6 (Discord `1567946743960567900`): C-12..C-14 folded; BLOCKER-1 discharged and the `asOf` carrier accepted

- **C-12 — `notClosed` restated per route; analytics' fetch is NOT changed.** r5 §C-9's "analytics' fetch also takes `closedOnly: true` … so `notClosed` is 0 on both routes" is **withdrawn**: today `routes.ts:12910` is `getClosedTrades(mode, { limit: 'all' })` (`storage.ts:3207` `const closedOnly = filters.closedOnly ?? false;`), and keeping it so keeps leg 1's subject. Langston measured the open population: `getClosedTradesPaginated('paper')` 1,602 with the arm off vs 1,582 with it on ⇒ **20** open rows, matching the 20 open blank-reason rows. **Per route:** balance-curve (`closedOnly: true`, `:12306`) — `notClosed = 0`; analytics — `notClosed` = the SQL count of paper rows with `closed_at IS NULL`, compared as a **row-id set** under the arrival rule (an open or close between the reads invalidates and the read is retaken), never as a scalar — `asOf` bounds `closed_at`, so it cannot freeze the open population. The C-8 comparator is the SQL over `mode` + `closed_at < T0` (no `closedOnly` for analytics).
- **C-13 — 10 of 13, not 11:** `getClosedTradesBySymbol` (`:3617`) is deleted by P-1; 13 − 2 byte-unchanged − 1 deleted = **10** sites take the derived NON_OUTCOME list. **Test census: 12** — a `hard_reset` row excluded at each of the 10, plus the two named arms (cooldown start; history visibility).
- **C-14 — the fence's scope, declared:** it covers `close_reason` **read/filter predicates** in `storage.ts` SQL only. Excluded by construction and NAMED in the test: the write at `storage.ts:709` (`closeOpenTradesForHardReset`, `.set({ closedAt: new Date(), closeReason: 'hard_reset' })` — the minting site of the population P-13 names) and the filter sentinel at `:3732` (`filters.closeReason !== 'all'` — not a reason). Complete reason-literal set at the ref: 15 lines = 13 read predicates + `:709` + `:3732`. The two byte-unchanged arms are the fence's only named read-predicate exceptions.

**In plain language:** the dashboard's "trades still open" check can't be frozen at a fixed time, so it is compared as the actual list of open trades, and a trade opening or closing between readings means the check is re-run. The count of database queries switched to the shared list is 10, not 11, because one is deleted outright. And the new safety test checks only the queries that read trades, not the one line that writes a reset record, so it can't fail on day one.

## Step 2 — PROCEED (Langston, r7, Discord `1567950260574093333`), with one in-commit condition, folded here
- **C-15 — the arrival rule binds PER LEG:** measured 17:13:40Z, 49 opens and 49 closes in the trailing 24 h (~9.7 mutation events/h, mean gap ~6.2 min), so no read-deploy-read will bracket an unchanged open set. ⇒ `notClosed` differences are **RECONCILED** — each differing row id accounted for as an open or a close inside the gap — and never invalidate or stop the read; only a difference on an `asOf`-frozen leg (the counted set, `nonOutcome`, the money figures) invalidates (retake) or, over a verified-identical population, stops the batch.
- **Record item 1 — the fence is comment-aware:** `storage.ts` carries 11 comment lines with `never_filled`/`hard_reset` (`:3218 :3259 :3313 :3354 :3376 :3404 :3612 :3709 :3795 :4622 :4645`; `:3354` reproduces a full `DISTINCT FROM 'never_filled'` fragment in a docstring). The fence discriminates by parsing the SQL template literals passed to `sql`/`db.execute` (and drizzle `sql\`…\`` tags) — not a text grep of the file — so a comment can neither trip it nor be the reason it is weakened.
- **Record item 2 — the docstrings move with the code:** the seven docstrings asserting "never_filled excluded" at sites that take the derived NON_OUTCOME list are updated in the same commit.
- **Re-derived by Langston at the ref, 17:13:24Z:** 20 open rows, all blank-reason; 1,602 total; `never_filled` 185; `hard_reset` 0. **Next: Step 3, in its agreed order (KD-27: after `25-9` and the items ahead of it on CC-A's list).**

## AMENDMENT — P-14b, the default-drop commit (OLD Claude, 2026-11-13; design only, one Langston gate before code)
**Why now:** P-14's code (every writer sets its values explicitly) has been live since `d01da3d86` (2026-11-07T16:23:40Z); the change list says the migration that drops the defaults must reach the branch only after that code is deployed, because `dt-deploy` applies every migration in the tree. That condition is met.

**The drop list, read from the live database 2026-11-13 (`information_schema.columns`, 32 defaults on the two tables, these 16 targeted):**
- `closed_trades` — the eleven money defaults: `fees`, `slippage` (`'0'::numeric`), `entry_fee`, `exit_fee`, `total_fee`, `entry_slippage`, `exit_slippage`, `total_cost`, `gross_pnl`, `net_pnl`, `net_pnl_percent` (`0`); and `asset_class` (`'crypto_spot'::text`, NOT NULL).
- `active_open_positions` — `entry_fee`, `entry_slippage` (`0`); `asset_class` (`'crypto_spot'::text`, NOT NULL); `mode` (`'paper'::trading_mode`, NOT NULL — the P-5 one-deploy bridge, "migration 2").
- **Kept, named so a later read is not a missed sweep:** `id`, `opened_at`, `last_updated`, `signal_type`, `exchange`, `trade_mode`, `ladder_rungs_hit`, `calibration_state`, `state`, `phantom_fill_suspect`, `record_restored_from_position` — none is a money value or a class/mode a writer must choose.

**Writer census (every physical INSERT, at `5ca6181dd`):** production — `storage.ts:3168` `createClosedTrade` (one caller, `active-execution-engine.ts:6845`), `storage.ts:3688` `insertOpenTradeRecordIfNoneOpen` (one caller, `trade-record-restore.ts:108`), `storage.ts:3937` `createActiveOpenPosition` (one caller, `active-execution-engine.ts:6968`). All three name `assetClass`, and the entry costs (`fees`/`slippage`/`entryFee`/`entrySlippage`; the position's `entryFee`/`entrySlippage`); `mode` is stamped from the method argument at both storage sites. The open path refuses an unclassifiable symbol BEFORE any write (`active-execution-engine.ts:6790-6795`, `_tradeClass === null` returns `UNCLASSIFIABLE`), so `asset_class` is never absent at an insert. No raw-SQL or supabase-js insert into either table exists outside tests (searched both spellings; the Drizzle search found all three known writers, the control). **Tests that insert:** `b-killswitch-window`, `b-loss-window-operator-closes-db`, `b-balance-truth-mode-partition-fence`, `b-sizing-inc2b-cooldown-db` (integration, CI-only) — each must still pass; one that omits `asset_class` would now fail loudly, which is the point.

**What changes for a reader — the intended effect:** an OPEN record (written at the fill, `closed_at IS NULL`) holds NULL, not an invented 0, in `exit_fee`, `total_fee`, `exit_slippage`, `total_cost`, `gross_pnl`, `net_pnl`, `net_pnl_percent` (the entry costs are written, so they are real). Closed and never-filled rows are unaffected: every one of the 90 paper closes since `d01da3d86` carries all its money columns (Step-7 arm coverage, `1e9e9e300`), and never-filled rows get explicit zeros (P-14).
**Reader census — every reader that can see an open record:**
- `getClosedTrades` callers WITHOUT `closedOnly` (9): `routes.ts:11817` (legacy branch keeps only `status === 'open'` rows, a field this table lacks; the page uses the paginated branch, which excludes open records — measured: page "1,717 total" vs 1,734 rows = the 17 open positions); `routes.ts:12636` (`countedTrades` drops `!closedAt` first, `dashboard-metrics.ts:153`); `active-engine-service.ts:554` (open records only, no money arithmetic); `c13-validation-service.ts:138`/`:230` and `c14-validation-service.ts:201`/`:360` (filter `closeReason !== null`, then `t.netPnl || t.pnl || 0`); `c5-financial-diagnostics.ts:118`/`:190` (`trade.netPnl ? parseFloat(...) : ... : 0` — NULL and `'0'` both give 0). **None turns a NULL into NaN or a wrong sum.**
- Runtime raw SQL on the money columns: `storage.ts:3504-3515` and `:3561-3573` both bound `closed_at IS NOT NULL`. `routes.ts:13248` counts closes in a `closed_at` window. Analysis scripts under `scripts/` are by-hand reads, not runtime.
- **Bound, stated:** the census is by caller of the storage readers and by `FROM closed_trades` text; a reader reaching the table through another storage method that returns open records would be outside it — `getClosedTradesPaginated` was checked by its page count, not its code.

**The migration** (`drizzle/migrations/<date>-b-close-writer-costs-drop-defaults.sql`, MANIFEST entry): one transaction, `SET LOCAL lock_timeout = '5s'`; a guard that refuses unless the 16 defaults exist exactly as listed (column, table, default text) — so a re-run or a drifted database stops loudly; `ALTER TABLE … ALTER COLUMN … DROP DEFAULT` ×16; a postcondition that the 16 now have none and the 16 kept ones are untouched; `RAISE NOTICE` with the open-record count it saw (a presence figure only). **Rollback** (by hand, not in MANIFEST): `SET DEFAULT` ×16 back to the measured values; code-first order stated in its header.
**`shared/schema.ts`** in the same commit: the matching `.default(...)` calls removed (11 + 4 + `mode`'s bridge), so schema and database never disagree; **no `migrations/meta/*_snapshot.json` regeneration** (`#1006`, Langston's carried condition).
**Tests:** a fence that `schema.ts` carries no `.default` on the 16 and still carries it on the kept ones; a fence that the migration drops exactly the 16 and guards first; the four integration inserts kept passing in CI.
**Deploy:** not before NEW Claude's window ends (21:00Z today), and only at a place in the deploy queue agreed with PM Claude — the range will carry other sessions' commits (today ANALYST Claude's `1251fb8e4`), so whose reviewed code rides along is settled before `dt-deploy`, not after.

### P-14b r2 — Langston's Step-2 CHANGES folded (Discord `1570828682627645491`): BLOCKER-1 cleared, C-1..C-5
**BLOCKER-1 — the drop list, reconciled per (table, column).** The live read (2026-11-13, `information_schema.columns`, `table_schema = 'public'`, the two tables) holds **32** defaults: `active_open_positions` 12, `closed_trades` 20. `shared/schema.ts` declares **30** (`closed_trades` 19, `active_open_positions` 11 — Langston's count). **The two extra are `closed_trades.calibration_state` and `active_open_positions.calibration_state`** (`TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05'`): `schema.ts` declares no `calibration_state` on either table — but the column is **IN-BAND, not drift** (corrected by Langston, Discord `1570832186997997601`): `2026-06-14-p19-b4a-c6-paper-sim-calibration-state.sql:27-29` and `:38-40` add it, `TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05'`, to `paper_sim_trades` and `paper_sim_open_positions` (P19-B4a, `BATCH_CATALOG.md:364`, with a rollback sibling), and it reached today's names through `2026-07-03-p19-b-rename-w3-b1-closed-trades.sql:9` / `-w3-b2-open-positions.sql:8`. **My search used today's table names only — the former-names miss.** What is missing is a one-line declaration in `schema.ts`; `#959`'s "written and read by nothing" stands (its premise is corrected the same way).
- **Reconciliation:** 32 = **16 dropped** + **14 kept and declared** (`closed_trades`: `id`, `exchange`, `phantom_fill_suspect`, `record_restored_from_position`, `signal_type`, `trade_mode`, `ladder_rungs_hit`; `active_open_positions`: `id`, `exchange`, `opened_at`, `last_updated`, `state`, `trade_mode`, `signal_type`) + **2 kept and undeclared** (`calibration_state` on both). My r1 kept list named `calibration_state` as if declared — wrong; withdrawn.
- **Disposition of the 2 undeclared: KEEP, and they MUST stay.** The column is `is_nullable = NO` on both tables and, **by this batch's writer census** (the three typed storage writers; no raw-SQL insert into these tables outside tests), no writer names it — so its DEFAULT is the only thing filling it, and **dropping that default would make every insert into both tables fail a not-null violation.** (A raw-SQL writer *could* name it — `exit-strategy-replay-service.ts:308` does for this column family elsewhere — so the claim rests on the census, not on impossibility.) Not this batch's to repair (`#959`'s home).
- **The guard and the postcondition key on (table, column) pairs, never names:** the guard refuses unless the 16 drop targets have exactly the measured defaults AND the 16 kept pairs exist with theirs (32 in total on the two tables); the postcondition checks the 16 have none, the 16 kept are byte-identical, and the total is 16.

**C-1 — the legacy branch KEEPS open records; corrected.** `routes.ts:11817`: an open record has no `status`, so the filter falls through to its final `return true`. The conclusion holds on other evidence: the only shipped caller asks for `paginated=true` and `closedOnly=true` (`trade-history-tab.tsx:104`/`:109`) — `closedOnly` is a query parameter (`routes.ts:11761`), so the page excludes open records BECAUSE THE CLIENT ASKS — and the client's `num()` (`paper-trade-adapter.ts`) returns null for null, rendering an em-dash, never coercing to 0. My page count (1,717 vs 1,734) measured today's client, not `getClosedTradesPaginated`.
**C-2 — the instrument's reach, and its complement.** A `FROM closed_trades` text search is blind to Drizzle-interpolated SQL. Complement (Langston): `closedTradesTable.<money column>` across `server/` outside tests returns 3 hits, all the `sortColumn` map; 0 for `netPnl` / `grossPnl` / `totalCost` / `entryFee` / `exitFee`. The text search's three further production sites — `ready_to_buy_service.ts:2229` (`closed_at` only), `exploration-lane.ts:93`/`:131`, `reserve-row-tripwire.ts:135` — touch no money column. **`getClosedTradesGlobal`** (`storage.ts:3895`, interface `:594`): `closedOnly` defaults false, **0 production callers**, one test case (`b-close-writer-costs-outcome-rule.test.ts:189`, Q-9). **Disposition 1, rule 18: deleted in the P-14b commit** with its interface line and the Q-9 case, logged in `DELETED_COMPONENTS_LOG.md`.
**C-3 — the effect on `active_open_positions`, stated as intended.** With its defaults gone, a position written with no `entry_fee` / `entry_slippage` holds NULL, and **that position CANNOT CLOSE**: the close refuses, keeps the position and raises the critical alert (`active-execution-engine.ts:4857-4863`, `_refuseMissingEntryCost` `:2239`), and the restore refuses (`trade-record-restore.ts:96`). That is the right trade (refuse rather than invent, KD-17). Today all three writers name both values, so it is reachable only by a future writer that omits them. **Rider, same commit:** the alert body's single cause (*"the open itself computed a non-finite value"*) gains the second — *"or the column was omitted at the write"*.
**C-4 — the reverse order.** Forward: code first (live since `d01da3d86`), then this migration. **Backward it inverts:** `asset_class` and `mode` are NOT NULL, so the rollback script (`SET DEFAULT` ×16) runs BEFORE any app rollback — and after this migration the app cannot go back past `d01da3d86` until it has. Stated in the migration header, the rollback header and the deploy note.
**C-5 — the compile fence, positive-controlled at Step 3.** The NOT-NULL protection is `createInsertSchema` making `asset_class` / `mode` required once `.default()` leaves `schema.ts`. It reaches the two typed writers. It does NOT reach `storage.ts:3689` (`.values({ ...(record as object), … } as any)`), which is safe only because it merges `assetClass` and `mode` explicitly. **Pre-registered proof:** with the schema change in place, delete one writer's `assetClass` on a scratch copy and show `tsc` failing; then restore. Recorded in the change list with the error line.
**Attacks (Langston):** both tables together (a surviving `'crypto_spot'` on `active_open_positions` is the more dangerous half — the restore reads its class there, `trade-record-restore.ts:78`); `mode` rides with the rest.
**Deploy:** staging is 26 h behind the review branch (drift rung 3, alert `f6de7237`, routed to me) — the deploy that carries P-14b is settled with PM Claude first, after 21:00Z.
