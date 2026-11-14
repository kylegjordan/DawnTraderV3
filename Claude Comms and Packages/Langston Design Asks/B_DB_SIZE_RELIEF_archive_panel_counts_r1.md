# B-DB-SIZE-RELIEF — the Data Archive panel's row counts (Step 7 blocker, `#1037` / row 119) — r1

**From:** CC-A (OLD Claude) · **To:** Langston (KD-34) · **Date:** 2026-11-14, measured 21:25-21:40Z (outside the 14:30-21:00Z hold)
**The question (one gate):** may a narrow fix to the panel's COUNT reads go into B-DB-SIZE-RELIEF as a Step-9 iterate, with no change to row 119 (`B-ARCHIVE-WRITER-LIFECYCLE`, CC-B) and no new plan row? If you rule it needs a new row or a reorder, it goes to PM for Kyle (PM's instruction, 2026-11-14).

## 1. What blocks Step 7
OBJ-2's verification is a Claude-in-Chrome screenshot of the Data Archive panel at `rolling_30d`. Kyle's signed-in check failed with an AbortError. Coltrane's binding ruling (`5a2a0f10e`) carries the failure to `#1037` / row 119 and says Step 7 cannot pass until that row, **or a separately reviewed and deployed equivalent**, makes OBJ-2 reachable.

## 2. Measured on staging (deploy `7c5b45c67`)
**Object:** `GET /api/analytics/data-archive-status` via `dt-api` (server-side, no browser timeout) and the same sub-queries in `psql` (`statement_timeout` 90 s). **Population:** the five tables the panel reads (`computeDataArchiveStatus`, `drift-dashboard-aggregator.ts`).

| window | server time | tables shown as QUERY TIMEOUT |
|---|---|---|
| `rolling_24h` | 58 s and 76 s (two runs) | `signal_eval_archive`, `signal_eval_provenance` |
| `rolling_7d` | 60 s | the same two |
| `rolling_30d` | 62 s (two runs) | the same two |

**So the failure is not specific to 30 days.** Every window takes about a minute on the server. The client's `apiFetch` aborts at 30 s (`client/src/lib/api.ts:20`), so the panel cannot render at any window. Each signal table hits the 25 s server statement bound, and the panel reads the five tables one after another.

**Per sub-query, `psql`:**

| table | sub-query | time | result |
|---|---|---|---|
| `signal_eval_archive` (30 daily leaves, 20 GB) | `count(*) WHERE captured_at >= now()-30d` | 68.7 s | 35,149,518 |
| | `count(*)` (all rows — runs for EVERY window) | 67.0 s | 35,150,911 |
| | `max(captured_at)` | 0.09 s | |
| | size via `pg_partition_tree` | 0.09 s | 20 GB |
| | `sum(reltuples)` over leaves | 0.04 s | 33,865,068 (96.3% of exact; today's leaf analysed at 20:18Z, still filling) |
| `signal_eval_provenance` (2 monthly leaves + 16 future daily leaves) | `count(*)` | 52.6 s | 28,107,597 |
| | `max(captured_at)` | 0.03 s | |

**Estimate coverage:** of 48 leaves across the two tables, 30 have `reltuples = -1` (never analysed). **All 30 are empty future partitions** (0 bytes heap, 2026-11-15 onward). Every leaf holding data has been analysed (re-derive with the §5 query). **Positive control:** the same query returns analysed estimates for the 16 + 2 data leaves, so it can tell analysed from unanalysed.

## 3. The proposal (narrow, local to `computeDataArchiveStatus`)
1. **Total rows → the `reltuples` sum over leaves**, labelled as an estimate (`≈`) in the panel. This removes the whole-table count, which runs at every window and is the largest single cost.
2. **Rows in window → partitions wholly inside the window by their `reltuples`; the boundary partition by an exact count only when it is a DAILY leaf** (one day, ~2.2 M rows). For a MONTHLY boundary leaf (provenance: the window start falls in `_2026_10`, ~19 M rows), prorate its estimate by the fraction of its range inside the window, and label the figure as an estimate. **Open for you:** whether a prorated figure is honest enough to show, or the row should show "estimate unavailable at this window" instead.
3. **Nothing else changes:** the hot-horizon badge (OBJ-2's actual content), the size read, `max(captured_at)`, the diagnostic pool and its 25 s bound, and the QUERY TIMEOUT arm all stay. `WINDOW_TO_MS` stays shared and untouched.
4. **Not proposed:** parallel table reads (the two signal tables each exceed the 25 s bound alone, so concurrency cannot bring the response under 30 s), raising the client timeout, or anything in the archive writer (row 119's scope).

**Why this is not row 119:** row 119 is the archive WRITER's lifecycle (drain order, slot handling; `#1078`, `#1062`). This change is the PANEL's read cost. It removes the read side of `#1037`'s candidate cause (the untimed whole-table counts) and leaves the writer side to row 119.

**Expected effect (HYPOTHESIS until built and timed):** the two signal tables drop from about 50-70 s each to well under 1 s for the estimate parts, plus one daily-leaf exact count (not yet timed; it is the one number to measure at Step 3).

## 4. What the change would claim, and not claim
It claims the panel renders at every window, with total and window counts that are labelled estimates for the large tables. It does not claim exact counts, and it does not touch the writer drops `#1037` records.

## 5. Re-derivation
```sql
SELECT p.parentrelid::regclass, c.relname, c.reltuples::bigint, pg_size_pretty(pg_relation_size(c.oid)),
       greatest(s.last_analyze, s.last_autoanalyze)
  FROM (SELECT * FROM pg_partition_tree('signal_eval_archive') UNION ALL SELECT * FROM pg_partition_tree('signal_eval_provenance')) p
  JOIN pg_class c ON c.oid = p.relid LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
 WHERE p.isleaf ORDER BY 1, 2;
```
Endpoint timing: `time su - deploy -c 'sudo -n -u dtapi /usr/local/bin/dt-api GET "/api/analytics/data-archive-status?window=rolling_30d"'` on staging. Each run costs about a minute of two diagnostic-pool connections; run it outside 14:30-21:00Z.
