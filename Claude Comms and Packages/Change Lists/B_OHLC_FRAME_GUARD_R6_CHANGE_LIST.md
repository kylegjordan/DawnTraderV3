# B-OHLC-FRAME-GUARD (`#1028`) r6 — CHANGE LIST (Step 4, the Step-7 fold of item 46)

## Dispatch header
| field | value |
|---|---|
| **(i) declared change-class** | `non_architecture` (scope header, unchanged at r6) |
| **(ii) doc set for the class** | scope — **present**, `Scope Files/B_OHLC_FRAME_GUARD_SCOPE.md` r6 · pre-audit — **present**, `Scope Files/B_OHLC_FRAME_GUARD_PRE_AUDIT.md` (r4; the r6 fold's audit is the r6 section of the scope: mechanism measured, census, prior instance, latency) · completion report — **absent**, owed at Step 11 · `BATCH_CATALOG` — **absent**, owed at Step 10 · `PHASE_HISTORY` — **absent**, owed at Step 10 · `SYSTEM_IMPACT_MAP` — **judged applicable** (the aggregator's changed contract), owed at Step 10 · `SYSTEM_MANUAL` — **judged applicable** for OBJ-6 (unchanged by r6), owed at Step 10 · `RUNNING_ISSUES` — **present**: item 46 corrected in its body, `#1037` am.1 · `PHASE_19_PLAN` — row `3b.h-6`, owed at Step 10 · `CHANGES_AND_FIXES` — owed at Step 10 |
| **(iii) Step-2 reference** | `B_OHLC_FRAME_GUARD_PRE_AUDIT.md` (Step 2 approved 2026-09-11). **The r6 fold has no separate pre-audit:** it is a Step-7 fold ruled by Langston 2026-09-28 19:29Z/19:33Z, and its audit content (mechanism, census, prior instance, conditions, measured latency) is the r6 section of the scope. |

## What changed and why
The Passive Archive panel could not load: the endpoint took 30.2 s against the client's 30 s abort. Its window counts had also read **0 / `OK`** for every universe since 2026-05-01. `safeCount` sent `BEGIN; SET LOCAL …; SELECT …; COMMIT;` as one string, node-postgres returned four Results, and the parse read BEGIN's. That was measured through the app's own driver on staging before any code was written (scope r6).

### MODIFIED `server/services/drift-dashboard-aggregator.ts`
**BEFORE** (`c28606e63` `:888-907`):
```ts
const wrapped = `BEGIN; SET LOCAL statement_timeout = ${PASSIVE_QUERY_TIMEOUT_MS}; ${sqlText}; COMMIT;`;
const rows = await db.execute(sql.raw(wrapped));
const result = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as Array<{ row_count: number; sym_count: number }>;
return { rowCount: result[0]?.row_count ?? 0, symCount: result[0]?.sym_count ?? 0, timedOut: false };
// catch: timeout OR error → { rowCount: 0, symCount: 0, timedOut: true }
```
**AFTER:**
```ts
const res = await db.transaction(async (tx) => {
  await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${PASSIVE_QUERY_TIMEOUT_MS}`));
  return tx.execute(sql.raw(sqlText));
});
const rows = (res as any)?.rows;
if (!Array.isArray(rows) || rows.length !== 1 || !isCount(rows[0]?.row_count) || !isCount(rows[0]?.sym_count)) {
  console.warn('[PassiveArchive] Aggregator count returned an unexpected shape — reported as unknown');
  return unknownCount('shape');
}
return { rowCount: rows[0].row_count, symCount: rows[0].sym_count, unknown: null };
// catch: timeout → unknownCount('timeout') (no log line) · anything else → warn + unknownCount('error')
```
- **Fan-out:** the eight counts are built as one list and drained by `PASSIVE_COUNT_CONCURRENCY = 3` workers, with results written by index.
- **Derived cells:** `activeSymbols` is `null` unless both symbol counts are known. Each store fraction is `null` when its stored count is unknown.
- **Status:** `DISCONNECTED`/`STARTING` first, then `COUNT_UNKNOWN` when either count is unknown, then the existing count-based statuses.
- **New field** `countUnknownReason`: the worst of the two, error > shape > timeout.
- **Types:** `CountUnknownReason` is exported. `activeSymbolsInWindow`, `ohlcRowsInWindow` and `tickerRowsInWindow` become `number | null`. `status` gains `COUNT_UNKNOWN`.

### MODIFIED `client/src/pages/analytics.tsx`
- The UI type mirrors the server: nullable counts, `COUNT_UNKNOWN`, `countUnknownReason`.
- `fmtN(null)` renders "—".
- `statusBadge(status, reason)` gains a `COUNT_UNKNOWN · <reason>` arm **and a `default` arm** (there was none, so an unmapped value rendered blank).
- The status legend explains COUNT UNKNOWN and its three reasons.

### NEW `server/tests/unit/b-ohlc-frame-guard-archive-counts.test.ts` (9 tests)
Readable count carried through · `SET LOCAL` inside the transaction before the SELECT, no `BEGIN`/`COMMIT` string · timeout → UNKNOWN in every derived cell with no log line · error → UNKNOWN, logged, reason `error` · mixed reasons → the fault wins · seven bad shapes, including the old four-Result array → UNKNOWN (`shape`) · a genuine zero stays 0 with `NO_OHLC_DATA` · `DISCONNECTED` outranks unknown · fan-out never exceeds 3, all eight run, and the order is fixed under uneven latency.
**Positive control:** all 9 fail against the pre-fix aggregator. **Mutations: 9 of 9 killed**:
- active symbols ignores an unknown side
- store % computed from an unknown count
- status computed from an unknown
- concurrency raised to 8
- shape guard dropped
- timeout reported as error
- reason precedence inverted
- `SET LOCAL` removed
- unknown read as 0

## Measured after (the fixed pattern on staging, 3 concurrent, 4 s limit, 2026-09-28 ~19:45Z)
| window | wall | counts read |
|---|---|---|
| `rolling_24h` | 8.4 s | 5 of 8 |
| `rolling_7d` | 12.3 s | 1 of 8 |
| `rolling_30d` | 12.3 s | 0 of 8 |

The worst case is three rounds of the 4 s limit, well inside the 30 s abort. **The residual** (7- and 30-day counts cannot finish in 4 s) needs a cheaper measure and is homed outside this batch (scope r6).

## Judgement calls to attack
1. **Concurrency 3 vs serial.** Serially, all eight 24 h counts finished (your run: 0.1–3.8 s each). At 3 concurrent, three ticker counts time out at 24 h. Serial trades completeness for an unbounded worst case (8 × 4 s > 30 s). I chose the bound.
2. **Precedence error > shape > timeout** for the single reason field, rather than two per-side reason fields.
3. **`COUNT_UNKNOWN` if EITHER side is unknown**, even when the other side alone would give `NO_TICKER_DATA`.
4. The Step-7 re-check: after `#1037` am.1, is watching `error.log` and stopping at the first drop line enough, or should the check wait for `#1037`'s mitigation?
