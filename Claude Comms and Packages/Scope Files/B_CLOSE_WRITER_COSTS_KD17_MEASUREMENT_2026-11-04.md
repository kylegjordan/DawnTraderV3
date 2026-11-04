# B-CLOSE-WRITER-COSTS — Kyle KD-17 measurement (CC-A, 2026-11-04 ~21:50Z, read-only, staging)

Kyle (KD-17, via PM Claude): *"when the system closes a trade, writing the record should not fail, and we should always know the real fee."* He asked for two counts before any design. Sent to PM Claude 2026-11-04 (Discord message `1567651644152488007`). This file is the input to the batch's Step 1.

## (1) A close that deleted the position and wrote no trade record
| population | count | object, and the instrument's reach |
|---|---|---|
| paper, both classes, 2026-09-19 → 2026-11-04 | **0** | alerts with dedupe key `close-no-trade-row-*` in the whole `system-alerts.jsonl` (2026-05-17 → now); the key is raised at `active-execution-engine.ts:5061-5075` since `51e35b195` (2026-09-19). Control: the sibling key `close-refused-*` is found (1). |
| paper, both classes, 2026-10-22 → 2026-11-04 | **0** | `[CLOSE_NO_TRADE_ROW]` lines in `error.log` + 14 rotated `error__*.log`. Control: `B-XSTOCK-BAR-AVAILABILITY` lines found (43). |
| paper, before 2026-09-19 | **not countable** | the close-all path deleted silently; a deleted position leaves no row. Langston's 2026-09-18 read (0 damaged rows, 07-15 → 09-18) cannot see a row that was never written. |
| VTS, both classes | **not measured** | `logs/virtual_trades/*.json` hold only closed records (33,562, all `status: closed`, 2026-03-31 → 2026-11-04), so a failed VTS close leaves nothing there. Needs a read of the VTS close path (Step 1/2). |

## (2) A trade booked with a zero or unknown fee
| population | count | detail |
|---|---|---|
| paper `closed_trades`, closed rows | 1,540 (crypto 692, 07-15 → 11-04; xStock 848, 07-16 → 11-04) | — |
| ...with a zero entry, exit or total fee | **178, all `close_reason = never_filled`** (crypto 102, xStock 76) | a resting maker order that never filled: no trade, no fee owed (`active-execution-engine.ts:1977-1991`). **0 filled closes** with a zero or null fee; **0** null `total_fee`. |
| VTS closed records | 33,562 | — |
| ...with `fees == 0` | **0** | — |
| ...with no `fees` field | **3,931, all maker/taker twin records** (`mtTwin` true 3,205, false 726; all `countsInAggregates: false`) | P19-B7.2c paired learning (`vts-runner.ts:809-817`): the non-chosen leg, excluded from every result. 1,095 never filled, 2,836 filled. They carry no P&L either. |

## The structural point
`shared/schema.ts` `closed_trades`: `fees`, `slippage`, `entry_fee`, `exit_fee`, `total_fee`, `total_cost`, `gross_pnl`, `net_pnl` all `.default("0")`. **A close that never wrote its fee reads exactly like a real zero.** Today the only zeros are never-filled orders, but the table cannot tell them apart; that default is a fallback in Kyle's sense.

## Added ~22:40 local: how a close finds its record
`active-execution-engine.ts:4678-4679` looks the record up by SYMBOL (first row with `openedAt` and no `closedAt`); `active_open_positions` stores no trade-row id. Paper trades open at the same time on the same symbol: **0 pairs** across all records, never_filled included (control: the same query finds **16,323** overlapping pairs on different symbols). Safe today only because one position per symbol holds elsewhere.

## Langston on the (a)/(b)/(c) shape, 2026-11-04 ~22:35Z (Discord 1567666376896684093) — for the batch's Step 1
- **(a) approved on shape, written as a FENCE, not a repair:** the no-trade-row close has **never been observed** (0 alerts all-history, 0 log lines in 14 days; the log zero has no denominator). I was wrong to call it "the measured failure". Rule 24 outcome **(2), working-as-designed-but-unaddressed** — a structural guard against a path measured at zero.
- **Why it is a correctness property:** the lookup (`storage.ts:3581-3591`) filters by symbol and `close_reason <> never_filled` only; it accepts `mode` and never uses it, and has no asset-class filter. Cross-class names exist today (`DASH/USD`, `#1093`; 33 in the `3n.q3` collision set); cross-mode arrives with live. An id closes all three.
- **§15:** `active-execution-engine.ts:4678` is the only production caller of `getClosedTradesBySymbol`; once (a) ships it has none — dispose in the same batch. The unused `mode` parameter: folded.
- **(b)** add: the fee-NULL reader census covers SQL and view readers (`SUM(fees)` in a route query or a view), not only TS call sites.
- **(c)** agreed: code read.

## FINAL SCOPE RULING — Langston 2026-11-05 at `93cead7f2` (Discord 1567679032332521534), matches KD-17/KD-24; PM Claude: settled, nothing back to Kyle
- **One key, three places, moved together:** the close lookup (`storage.ts:3581` `getClosedTradesBySymbol`, which ignores `mode`), the open-side duplicate guard (`active-execution-engine.ts:6222`, via `getActiveOpenPositions`, `storage.ts:3847`, no WHERE at all), and the **database unique index `active_open_positions_symbol_idx` on `symbol` alone** (`shared/schema.ts:2064`). That index — not cooldowns or caps — is why the same-symbol overlap count is 0. Without changing it, a per-mode guard fails: `createActiveOpenPosition` dedup-returns the incumbent and `active-execution-engine.ts:6592-6600` deletes the trade record it just wrote (`DUP_POSITION`).
- **This batch:** lookup = symbol + asset class + mode; index -> `UNIQUE(symbol, mode)` (KD-24); guard per mode. **Row 19** (`B-SYMBOL-CLASS-IDENTITY`) then only moves the index to `UNIQUE(symbol, asset_class, mode)` (KD-25). No position-id column, provided the lookup key equals the index key in the same deploy.
- **Same increment:** a close that finds no trade row stops DELETING the position (today `active-execution-engine.ts:5058-5077` logs, alerts and deletes, losing that P&L). A narrower key can only miss, so this is its safety net. `closed_trades.asset_class` defaults to `crypto_spot` and pre-2026-07-15 rows sit at that default (`#505`): the filter is written for the honest forward population, pinned by a test.
- **Fees required with honest readers**, the SQL/view reader census included. **VTS review dropped** (the guard reads `active_open_positions` only).
- **Order (KD-27):** after `#527` and roadmap 25-9.

## Langston 2026-11-05 at `f1f3139b8` (Discord 1567682186407186594): the pinning test pins THREE things (BLOCKER for Step 1)
- **Approved:** (symbol, asset_class, mode), no new column. Copy `getLastClosedAtForSymbol` (`storage.ts:3632-3650`, `#1093`: exact symbol + mode + optional exact class, with the DASH/USD reason in its header) — do not mint a second idiom.
- **Measured by him tonight:** 1,564 `closed_trades` rows, all `mode=paper`; `DASH/USD` is the one cross-class symbol (crypto_spot 3 rows 09-06 to 10-30, xstock_spot 2 rows 07-21 to 08-18), so asset_class is load-bearing today. 19 unclosed rows against 19 open positions, 1:1, class matches on all 19, no symbol with more than one unclosed row (control: 1,545 closed rows).
- **BLOCKER — the test must pin all three gates:** the guard matches on symbol (per mode once changed); the unique index column list is exactly what the batch sets it to; and `#508`'s compensation delete (`storage.ts:3873`) still evicts the losing open row — `closed_trades` has no uniqueness constraint, so an orphan open row is exactly what `.find` would pick up and stamp exit price, fees and P&L onto.
- **Phase-21 note re-located:** `active_open_positions` has NO mode column (41 columns enumerated) and the index is symbol-only, so a shared paper/live table makes the second position a 23505 at the database whatever the guard does — a MIGRATION item (folded into this batch by his final ruling as `UNIQUE(symbol, mode)`, which needs the mode column added).
