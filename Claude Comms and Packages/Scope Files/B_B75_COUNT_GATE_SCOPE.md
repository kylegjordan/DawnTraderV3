# B-B75-COUNT-GATE — HOTFIX SCOPE (2026-10-16)

change-class: hotfix

**Owner:** CC-A (OLD Claude) · **Directed by:** Kyle, 2026-10-16 ("can't we build in a check to see if rows are missing from the copied tables before they are deleted? I would assign that as a hotfix") · **Issue:** `#1195` · **Reviewer:** Langston (before staging) · **Parent batch:** `B-B75-EXPORT-COMPLETENESS` (the complete-export fix) stays open and placed where `#1195` put it.

## 1. QUALIFYING TEST

1. **Broken now.** The nightly B75 sweep drops source partitions whose archive copy is missing rows. The 2026-10-16 02:15Z run dropped four. A read-only replay of the page rule on the 2026-09-16 children due tonight:

   | table | source | exported | missed |
   |---|---|---|---|
   | `crypto_perp_ohlc_1m` | 264,960 | 240,000 | 24,960 (9.4%) |
   | `signal_eval_archive` | 2,284,067 | 2,235,422 | 48,645 (2.1%) |
   | `crypto_perp_ticker_snap` | 1,475,260 | 1,470,327 | 4,933 |
   | `xstock_spot_ticker_snap` | 2,912,818 | 2,910,576 | 2,242 |

   **Positive control:** the sweep log shows `rows=240000` for the 09-14 and 09-15 `crypto_perp_ohlc_1m` drops, which is exactly the replay's number.
2. **Waiting causes harm.** The next drop is 02:15Z tonight, and each night is irreversible. Kyle directed the hotfix, which satisfies the urgency test.
3. **Blast radius is small** — see §2.

## 2. AUDIT (PATH A: `#1195` is a completed Step-9 finding of `B-XSTOCK-BAR-AVAILABILITY`; the census below covers the fix)

- **Mechanism:** `partition-exporter.ts` legacy mode pages with `ts > lastTs ORDER BY ts LIMIT 1000`. When a page ends inside a group of rows sharing one timestamp, the rest of that group is never read. `sourceRowCount` was computed only in exact mode, so the legacy export carried no source count. The manifest `row_count` and min/max come from the same output, so they agree with themselves. The sweep's drop gate checks only manifest state.
- **Who deletes, based on this export** (census of `DROP TABLE` / `DELETE FROM` in `server/scripts`, `server/services/data-archive`, `scripts`):
  - `b75-retention-sweep.ts` partitioned lane (`dropAndMarkActive`), whole and sliced;
  - `b75-retention-sweep.ts` plain-archive lane (`vts_open_trades`, `closed_trades`), which deletes only after archive;
  - `context-bridge-log-ttl.ts` (monthly export, then delete).

  All three call `exportPartition`. The remaining matches are one-off SQL migrations (`scripts/*.sql`, `scripts/b4-dbs-15m-recompute.ts`) and are not archive deleters. The plain age-delete tables (`xstock_qd_probe_history`) delete without archiving **by design** and are out of scope.
- **The fix:**
  1. Count the source in BOTH modes, inside the same REPEATABLE READ snapshot.
  2. Throw `ExportRowCountMismatchError` before COMMIT when exported ≠ source. Every caller then fails before upload, verify or drop: the sweep records `failed`, raises its alert and does not drop; `context-bridge-log-ttl` does not delete.
  3. Carry the legacy cursor as database text (`ts::text`, stripped from the written row), not a millisecond-floored JS Date. **Why:** with a floored cursor a page can re-export rows, and a duplicate could cancel a skip in the count. With an exact text cursor and a strict `>`, no row can be read twice, so count equality proves the copy is complete.
- **State written / read:** no new state. `ExportResult.sourceRowCount` is now always a number. Its readers are `exact-archive-evidence.ts`, which already accepts a number, and the sweep, which passes it through. The archived row shape is unchanged (the cursor column is deleted before `JSON.stringify`).
- **Larger design fault?** Yes. The page rule itself is wrong, and that fix is `B-B75-EXPORT-COMPLETENESS`. This hotfix does not fix the page rule. **It makes the wrong page rule unable to delete anything.** Tie-heavy partitions will fail safely every night until the parent batch lands.

## 3. CONSEQUENCES, STATED

- Most daily drops for `crypto_perp_ohlc_1m`, `signal_eval_archive` and the ticker snapshot tables will FAIL safely each night. Hot storage grows about 3.1-3.2 GB/day (database 134 GB).
- Each night re-exports the accumulated failing partitions, so the sweep's runtime grows by about 9 minutes per day of backlog (the four exports took 534 s on 10-16).
- One warning alert per failing partition. The alert names the row-count mismatch and `#1195`, and does not call it transient.
- Partitions already dropped are not recovered. The historical-object audit stays in the parent batch.

## 4. TESTS

- `server/tests/unit/b-b75-count-gate.test.ts`:
  - a fake client that evaluates the legacy page queries as PostgreSQL would;
  - a 999 + 3-tie boundary case is refused with `source=1002 exported=1000`, leaves no file, and rolls back;
  - a 1,500-row complete export passes, uses a string cursor, and writes no cursor column.
- **Mutation proof:** with the throw disabled, the refusal test fails.
- The existing exact-mode tests and the B75 sweep helper / streaming / count tests all pass: 54 of 54 across 5 files.
