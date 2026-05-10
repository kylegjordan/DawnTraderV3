# B79.0e Step 4 review

## Verdict
approved-with-revisions

## Findings
- F1 (P1, blocker): Rollback file is asymmetric to forward. Forward does 4 parents + 4 parent indexes + ~52 partition tables (DO block) + ~108 partition indexes (DO block) + 4 module_constants keys. Rollback (`2026-05-10-b79-0e-rename-equity-to-xstock-rollback.sql`) only reverses the 4 parents + 4 parent indexes. If we ever roll back: partition children/indexes stay `xstock_*` while parents revert to `equity_*` (partitions stay attached by OID but names go inconsistent), and module_constants stay `xstock_*` while reverted code keys off `equity_*.hot_retention_days` → b75-retention-sweep silently no-ops. Fix: add two symmetric DO blocks (sweep `xstock\_%` → `equity_*` for pg_tables + pg_indexes) and a reverse `UPDATE module_constants` to the rollback file before push. Step 4 doc's "Rollback parity: 4 parent + 4 index renames matches forward" understates the forward — please re-verify.
- F2 (P3, nit): `shared/schema.ts` retains type names `EquitySpot/PerpOhlc1m`, `InsertEquitySpot/PerpTickerSnap` etc. now pointing at the new `xstock*` consts. Inline comment correctly flags as deferred cosmetic. These are outside the Step 2 lowercase regex scope, so the "0 matches" claim is accurate for tables/lowercase consts but type names linger. Acceptable as documented; queue type-name modernization as follow-up.

## Specific checks
- Migration applied to staging (72 renames + module_constants): yes (per Step 4 doc verification queries; accepted on trust)
- Code-side completeness (0 matches outside historical migrations): yes (within documented regex; type names intentionally retained per F2)
- Rollback parity (parents+partitions+indexes+constants): no — see F1
- B79.0g landed first: yes (PM2 #205, fb42335f7)

## Ship recommendation
ship after F1 fix — amend rollback SQL to mirror forward (partition DO blocks + module_constants reverse-UPDATE), commit, then push. F2 is follow-up, not a blocker.

ACK approved-with-revisions
