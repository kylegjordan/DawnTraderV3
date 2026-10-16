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
  4. **r2 (Kyle, 2026-10-16: "handle it all in one operation"): read each boundary tie group whole.** When a page is full, hold back that page's rows at its last timestamp, read the whole group with `ts = lastTs` (the timestamp index serves the equality), write it, then continue with `ts > lastTs`. A page made entirely of one timestamp is handled the same way. **Every partition now copies completely on the same run and drops the same night.** The count gate stays as the proof and refuses anything else.
- **State written / read:** no new state. `ExportResult.sourceRowCount` is now always a number. Its readers are `exact-archive-evidence.ts`, which already accepts a number, and the sweep, which passes it through. The archived row shape is unchanged (the cursor column is deleted before `JSON.stringify`).
- **Larger design fault?** The page rule was the fault, and r2 fixes it for the legacy lane. What stays in `B-B75-EXPORT-COMPLETENESS`:
  - the audit of objects already dropped since `565b605f0` (2026-05-06), including what Supabase backups or exchange history can recover;
  - a per-table key/index census;
  - the exact-mode consolidation.
- **Memory bound, stated:** one tie group is held in memory. The largest group measured is about 184 rows/minute for `crypto_perp_ohlc_1m` (264,960 rows / 1,440 timestamps); the largest group on `xstock_bar_revision_event` is 150 (`#1195`).

## 3. CONSEQUENCES, STATED

- Drops proceed the same night with complete copies, so there is no pile-up. A refusal now means a genuinely unexpected shortfall, and that partition stays in place and alerts.
- One extra indexed equality query per full page (about 2,300 for `signal_eval_archive`). See the proof timings in §4.
- Partitions already dropped are not recovered; that stays in the parent batch.
- The database is at 65.4% of its 200 GB cap (alert `545762f9`), which is why a hold-everything outcome was not acceptable.

## 4. TESTS

- `server/tests/unit/b-b75-count-gate.test.ts`, using a fake client that evaluates the legacy page, equality and count queries as PostgreSQL would:
  - a 999 + 3-tie boundary is exported whole (1,002 unique rows);
  - a 2,500-row single-timestamp group larger than a page is exported whole;
  - a source/export count difference is refused (`source=1201 exported=1200`), leaves no file, and rolls back;
  - a 1,500-row export uses a string cursor and writes no cursor column.
- **Mutation proofs:** with the throw disabled, the refusal test fails. With the tie read disabled, both tie tests fail.
- The existing exact-mode tests and the B75 sweep helper / streaming / count tests all pass.
- **REAL-DATA PROOF, read-only, on tonight's 2026-09-16 children.** The changed exporter ran on staging inside its own REPEATABLE READ READ ONLY transaction, writing only a local file that was counted and deleted; nothing was uploaded or dropped:
  - `crypto_perp_ohlc_1m` source 264,960 / exported 264,960 / file lines 264,960 (23 s), against 240,000 under the old rule;
  - `crypto_perp_ticker_snap` 1,475,260 / 1,475,260 / 1,475,260 (149 s);
  - `xstock_spot_ticker_snap` 2,912,818 / 2,912,818 / 2,912,818 (294 s);
  - `signal_eval_archive` 2,284,067 / 2,284,067 / 2,284,067 (223 s), against 2,235,422 under the old rule.
  - Export time only, at gzip level 1 with no upload or readback, so not comparable to the sweep log durations. Temporary directory removed and confirmed absent.
