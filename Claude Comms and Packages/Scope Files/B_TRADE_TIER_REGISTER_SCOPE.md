# B-TRADE-TIER-REGISTER — SCOPE (#599's named home): the trade tables enter the move-not-delete path

change-class: architecture
**Owner:** CC-A · 2026-08-06 · **Kyle-elevated today** ("let's make sure that's happening" — his tiering question confirmed the gap) · #599's stated deadline: **before the retention GC's first bite, ~2026-08-09.**

## 1. THE GAP (measured at the live DB + config this hour, not assumed)
`data_lifecycle` (the B75 tier inventory) covers the market-data tables + the five B70 analytics tables + `context_bridge_log`. **`closed_trades` and `vts_open_trades` are NOT in it.** Both retain under the B-TRADE-RECORD-RETENTION 365-day window and would then DELETE, violating `STORAGE_POLICY.md`'s move-not-delete rule — the exact violation Wave C fixed for the B70 tables.

## 2. THE LOAD-BEARING DESIGN FACT (measured): BOTH TABLES ARE UNPARTITIONED
`pg_class.relkind='r'`, zero `pg_inherits` children, both. **The B75 sweep's move path operates on MONTHLY PARTITIONS** (detach → export → warm-verify → drop). It structurally cannot move these tables as-is. Sizes today: `closed_trades` 1,008 kB / 498 rows; `vts_open_trades` 61 MB / 50,008 rows (population: whole tables).

## 3. PROPOSED DESIGN (the decision this Step-1 asks for)
**Option A — RECOMMENDED: a row-range export leg on the existing sweep.** Extend `b75-retention-sweep` with an unpartitioned-table mode: rows older than the hot window are exported (same JSONL.gz + warm TUS upload + checksum-verify machinery, same manifest rows) in dated ranges, then deleted ONLY after warm verification — move-not-delete without touching table DDL. Small blast radius; the export machinery is proven (Wave C end-to-end proof).
**Option B — partition the tables first.** Structurally cleaner long-term, but: live tables under an active engine (open-position deletes, close-writes), DDL migration risk on the hot path, and 61 MB does not justify it today. **Rejected for this batch; revisit if either table's growth changes the calculus.**
**Retention windows proposed:** `closed_trades.hot_retention_days=365` (the Kyle-set window becomes the hot window; nothing deletes, it MOVES at 365) · `vts_open_trades` (closed-in-place rows only — `state` filter; OPEN rows never move) `hot_retention_days=365` same shape. Both new `data_lifecycle` keys, seeded by migration, fail-hard if absent (rule 15).

## 4. §9.5 PRE-AUDIT OBLIGATIONS (named now)
Census both tables: who writes/reads/mutates/DELETES/schedules (the VTS GC + the retention sweep are the known deleters — mutual-exclusion check required); the state-write census for the export-then-delete leg (a reader of deleted rows surviving = the invisible break); SIM entries for both tables + the sweep.

## 5. VERIFICATION
Wave-C-pattern end-to-end proof on ONE real range: export → manifest row → warm download + checksum match → delete → the range readable from warm. Plus: the sweep's next scheduled run processes both tables without touching rows inside the hot window (count-before/count-after inside the window identical). §13: if the GC would bite before this ships, the GC's trade-table leg is PAUSED (the #430 precedent — reversible, Kyle-authorized pattern) rather than racing the deadline.

## 6. OUT OF SCOPE
The outcome-feedback EMA store file (live working state, deliberately not a tiered dataset — stated to Kyle today); partitioning (Option B); any retention-window change beyond registering the existing 365.
