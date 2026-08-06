# B-TRADE-TIER-REGISTER — PRE-AUDIT (Step-2)

**Against scope r3 (@ `ad7460a1c`, Step-1 PROCEED).** CC-A · 2026-08-06.

## 1. SIM CONSULTATION
The B75 sweep + tier machinery: SIM's storage entries (Wave A/C rows — cold rotator, manifest, the B70 inventory extension) + `STORAGE_POLICY.md` (the policy SSOT this batch serves). `vts_open_trades` + `closed_trades` currently have no SIM component entries of their own — flagged: the batch's governance adds them (per §9 rule 1, silence on a touched component is itself a gap).

## 2. DELETER CENSUS (repo-wide grep, tests excluded; FULL lists)
- **`vts_open_trades` — exactly ONE age-deleter:** `sweepClosedOpenTrades` (`vts-trade-persistence.ts:479`, raw `DELETE … WHERE closed = true AND closed_at < NOW() - retention`). Other table references (routes, replay services, session-lifecycle, asset-name-resolver) are reads/updates — zero further delete sites (asserted with the call-site grep enumerated, not from the filename list).
- **`closed_trades` — THREE delete sites, NONE age-based** (matches Langston's Step-1 enumeration): `storage.ts:3445` `deleteAllClosedTrades` (hard-reset; mode-scoped wipe), `:3458` (reset-family), `:3468` `deleteClosedTrade` (#508 orphan compensation — its `closedAt IS NULL` predicate is CONTRACT, making misuse as a general delete impossible). **Confirmed: `closed_trades` is UNARCHIVED, not at-risk.**
- **Mutual exclusion:** resolved by DESIGN, not by a lock — the boot deleter is REMOVED (scope disposition 4), leaving the cron lane as the SOLE deleter over both tables. After this batch: one deleter, archive-gated.

## 3. STATE-WRITE CENSUS ON THE REMOVAL (§9.5(a-ii))
`sweepClosedOpenTrades` writes: (a) the DB deletes themselves; (b) two console lines (`[B79.0g-tx][GC_SWEEP]` / error); (c) a `{swept}` return — **DISCARDED by its only production caller** (`server/index.ts:857`, bare await). No instance fields, no counters, no persisted state. **Zero readers survive the writer's removal.** Callers: the boot site (removed with it) + the unit suite `b79-0g-vts-trade-persistence.test.ts:128-156` — **SUBJECT tests of the removed function → die as units per the B-ARM SUBJECT-vs-PROBE rule** (they test the function itself, not a surviving invariant).

## 4. SCHEMAS (pasted, not paraphrased — B79.0g-tx rule)
`vts_open_trades`: `closed boolean NOT NULL DEFAULT false` · `closed_at timestamptz NULL` · `state varchar(32)` (entry-mode axis — NOT the aging predicate, per Step-1 finding 5) · the r3 keys (`chosen_entry_mode`/`entry_fee_rate`/`maker_limit_price`/`maker_deadline`). Indexes: pkey + the B79.0g-tx partial `WHERE closed=false` — **the archive predicate's mirror-complement index `(closed_at) WHERE closed=true` does NOT exist → the scope's item (i) stands.**
`closed_trades`: `opened_at NOT NULL`, `closed_at NULL` — **and `closed_trades_closed_at_idx` btree(closed_at) ALREADY EXISTS** → the scope's "499 rows needs none" is superseded by better news: the index is already there; no new index needed on either count. NULL `closed_at`: 3/499 (the B7.2c never-filled maker pendings) — excluded from aging + logged, per scope (iii).

## 5. BLAST RADIUS
Files: `b75-retention-sweep.ts` (the `PlainRetentionTableSpec` + `sweepPlainTables` gain the archive mode + `extraPredicate`) · `vts-trade-persistence.ts` (function removal) · `server/index.ts` (call removal) · one migration (2 `data_lifecycle` seeds + 1 partial index) · `STORAGE_POLICY.md` (+ the probe-history exemption line) · SIM/BATCH docs · the dead unit-suite removal. Consumers of archived-then-deleted rows: the VTS learning paths read RECENT rows (well inside 365d) and `exit_decision_archive` carries the per-close outcomes independently (already tiered) — no reader depends on >365d-old `vts_open_trades` rows (asserted from the readers enumerated in §2; the replay services read explicit date ranges and will hit the warm archive for pre-window ranges, which is exactly what the manifest read-back path provides).

## 6. RISK
Medium-low: the delete arm is gated on verified manifest rows (the `:698-701` pattern by reference); the removal's state-write census is clean; nothing races (first GC bite 2027-05-11); rollback = revert + the archived `.removed` function restorable from git.
