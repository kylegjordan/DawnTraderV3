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
