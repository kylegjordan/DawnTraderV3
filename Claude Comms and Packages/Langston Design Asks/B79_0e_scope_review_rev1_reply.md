# B79.0e review

## Q1-Q5 calls
Q1 (migration timing — anytime sub-second vs maintenance window): **anytime, prefer post-ARCA-close if already scheduled** — sub-second metadata-only rename is fine in flight, but pick the quiet window for free if convenient.
Q2 (aliased view bridge — keep or skip): **skip** — fail-loud beats silent legacy persistence; aligns with §8 #10 (no silent fallbacks) and §8 #11 (no patches).
Q3 (legacy migrations: leave-as-is vs update): **leave as-is** — historical migrations are immutable contracts; add one-line note in the new migration header pointing at B69 + B79.0e for the rename trail.
Q4 (deploy ordering: same-batch vs migration-first vs code-first): **same-batch, migration-then-pm2-restart in one deploy script** — sub-second mismatch window acceptable; document exact sequence in completion report.
Q5 (table-comment cleanup): **confirmed no-op** — B69 retag covered the column-default surface.

## Concerns / Additions
- **Confirm 13-file list is exhaustive at Step 2.** Pre-impl audit must run `grep -rE "equity_(spot|perp)_(ohlc_1m|ticker_snap)" server/ scripts/ shared/ drizzle/` excluding historical migrations and reconcile against §3. A miss fails loud post-deploy by design, but catching it pre-deploy is cheaper.
- **Drizzle TS const renames not explicitly enumerated.** §3 lists table-string renames; confirm const exports (e.g. `equitySpotOhlc1m` → `xstockSpotOhlc1m`) are renamed at every import site. TS compiler flags misses only if the const is fully renamed.
- **Rollback script parity.** Confirm rollback `.sql` reverses all 4 index renames, not just the 4 tables. §1 line 16 lists 4 index renames — rollback must mirror.
- **Live archiver buffer claim.** §4 risk row 2 says "live archiver buffers absorb the gap" during ALTER TABLE lock. Verify in pre-impl audit — if writes are synchronous with no buffer, sub-second blocking surfaces as errors upstream. One-line confirmation suffices.
- **No-touch fence specifics.** Objective 8 says "post-deploy SQL" without specifics. Add explicit post-deploy check: `crypto_spot_*` row counts unchanged within tolerance.
- **Sequencing dependency.** §1 status header says "AFTER B79.0g lands." Step 2 audit must verify B79.0g is in fact merged before B79.0e implementation begins; migration filename ordering (2026-05-10 prefix) is fine relative to B79.0g.

## Verdict
approved-with-revisions

## Ship recommendation
ship after Step 2 pre-impl audit confirms (1) exhaustive grep matches §3 file list, (2) rollback reverses all 4 indexes, (3) live archiver buffering behavior during sub-second lock, (4) B79.0g landed first.

ACK approved-with-revisions
