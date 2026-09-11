# B-XSTOCK-FEE-CONTRACT — CHANGE LIST (Step 3 → Step 4)

**Batch:** `B-XSTOCK-FEE-CONTRACT` (`#1010`, plan row 2.4-FEE) · **change-class: architecture** · **Owner:** CC-B
**Plan:** `Claude Comms and Packages/Scope Files/B_XSTOCK_FEE_CONTRACT_PRE_AUDIT.md` r5 (Step 2 approved by Langston 2026-09-11 16:14Z at `8ae6e98b0`)
**Graded ref:** the commit carrying this file. Every `path:line` below is at that ref.

---

## 0. DEVIATIONS FROM THE APPROVED PLAN — each stated, none silent

| # | plan said | code does | why |
|---|---|---|---|
| D-1 | P2: rail constants and checks inside `b72-warmup.ts` | the rail is a **pure module**, `server/startup/fee-model-rail.ts`, called from the warmup loop | `b72-warmup.ts` imports the DB-backed prefetch at load, so its rail could not be unit-tested; the pure functions are tested directly (`b-xstock-fee-contract-rail.test.ts`) and a fence proves the warmup calls them |
| D-2 | P6: `INSERT … live/xstock_spot = '3'::jsonb` | inserts **`live/* + 1`**, computed in SQL | the literal is right on staging (`live/*` = 2 → 3) but wrong on a fresh CI database, where `live/*` may differ; the computed form lands 3 on staging and the correct boundary elsewhere. The post-condition asserts `live/* + 1` |
| D-3 | P4: rollback "steps the two bumped xStock epochs back and deletes the `xstock_spot/live` row" | rollback **bumps the xStock `vts`, `paper_sim` and `live` epochs FORWARD by +1 when it changes the fee pair**, and **refuses to run over a later fee change** | restoring the old fees is itself a fee change, so it is an epoch boundary. Stepping an epoch back would silently re-join pre-change and post-change learning; leaving it in place (r1, r2 of this list) blended the new-fee and restored-fee windows under one epoch — reviewer r2, re-derived at the `calibration-epoch.ts` header. A run that changes no fee moves no epoch (reviewer r3 NF1: a mismatch resets the Welford stream, `outcome-feedback-store.ts:358`, so a bump with nothing behind it throws samples away). It refuses unless xStock is on this batch's pair or already on the restored pair (reviewer r3 NF2: otherwise it would silently overwrite a later xStock fee batch). **Epochs only ever step forward, and only on a fee change.** Stated in both files' headers |
| D-4 | P7: "re-point the five PROBE files to named per-class constants" | the PROBE files seed from **one shared fixture**, `server/tests/helpers/fee-model-fixture.ts`, and SUBJECT assertions use its named constants | eight suites carried their own `0.008 / 0.004` copy for BOTH classes — the defect reproduced in tests. One fixture means the next schedule change edits one file |
| D-5 | A10 classified `b5-amr-body.test.ts` as PROBE | **one of its assertions was SUBJECT**: `:238 expect(c.fee).toBe(0.008)` on an xStock symbol | caught by the test run, not the census (the census matched the seed literals, not the assertion). Corrected to `XSTOCK_SPOT_TAKER_FEE`. **PREVIOUSLY STATED (A10): five PROBE files. NOW: four pure PROBE files plus one mixed file with one corrected SUBJECT assertion.** |
| D-6 | (not in plan) | **a redeploy after the operator rollback re-applies the fix, and is a NEW epoch boundary** — the rollback deletes the forward migration's `_migrations` row; each file bumps exactly when that run changes the xStock fee pair | reviewer r1, re-derived: `db-migrate.ts:155` skips any name already in `_migrations` (column `name`, `:66`), so the r1 rollback, which left the row, would have made a redeploy SKIP the fix and boot xStock on 0.008 / 0.004 — values the signed rail accepts. **Three designs, each reviewed:** r2 skipped the bump for a row this migration had already written — reviewer r2 showed the redeploy then silently shares an epoch with the restored-fee window. r3 bumped on every run — reviewer r3 showed a second rollback or a hand re-run resets every xStock aggregate with no fee change. **Final: a fee-changed flag computed from the pre-image decides the bump; no marker, no `updated_by` guard.** Crypto is checked against its own pre-image, and the fee pre-image and counts cover only the two spot fee constants, so a later crypto fee change or a new fee constant cannot block a redeploy (reviewers r2 and r3, N3). **Simulated on staging** (§2.1, §2.1a) |
| D-7 | (not in plan) | `2026-05-21-b79-0n-universe-discovery-rollback.sql:22` — `DELETE FROM _migrations WHERE filename = …` → `WHERE name = …` | found in passing by the same reviewer: the one older rollback that clears its ledger row names a column that does not exist, so it fails. One word, fixed on find (rule 23); the new fence F-2 now forbids `filename` in any rollback file |

---

## 1. PRODUCTION CODE

### 1.1 `server/startup/fee-model-rail.ts` — NEW (P2, D-1)
Pure functions. `FEE_RAIL_MAX = 0.05`, `MAKER_REBATE_FLOOR = -0.001`.
- `feeRailViolation(assetClass, constant, v)`: non-finite → refuse; taker must be in `(0, 0.05]`; maker must be in `[-0.001, 0.05]`.
- `makerAboveTakerViolation(assetClass, maker, taker)`: refuse when `maker > taker`.

### 1.2 `server/startup/b72-warmup.ts` (P2, P4)
**BEFORE (`:236-244` at `18a8b29b6`):**
```ts
        // Sanity rails: a fee outside (0, 5%] is a fat-fingered DB value, not a tier.
        if (!(v > 0 && v <= 0.05)) {
          throw new Error(`[B45][warmup] fee_model.${constant} for '${assetClass}' = ${v} is outside the sane (0, 0.05] decimal range — refusing to start.`);
        }
        fees[`${assetClass}.${constant}`] = v;
      }
    }
```
**AFTER:**
```ts
        const railViolation = feeRailViolation(assetClass, constant, v);
        if (railViolation) throw new Error(railViolation);
        fees[`${assetClass}.${constant}`] = v;
      }
      const makerAboveTaker = makerAboveTakerViolation(
        assetClass, fees[`${assetClass}.spot_maker_fee`], fees[`${assetClass}.spot_taker_fee`],
      );
      if (makerAboveTaker) throw new Error(makerAboveTaker);
    }
```
The per-constant rail branches on the loop variable; `maker ≤ taker` runs per class once both rates are in the `fees` map (Langston ruling 1). **`'cost_model'` removed from `PREFETCH_MODULES`**, with a comment naming `#133`/`#134` and the migration.

### 1.3 `server/services/slippage-fee-model.ts` (P3; Langston Step-2 ruling 1 + rider)
**Deleted:**
- `resolveFee` (the second `fee_model` reader)
- `getConfig`, `modelTradeRealism`, `getAggregateStats`, `updatePriceHistory`
- `priceHistory`, `VOLATILITY_WINDOW`, `TradeRealism`
- `calculateFees`' never-passed `makerFeeRate` / `takerFeeRate`
- the unused `symbol` parameter of `estimateVolatility` and `modelSlippage`

**`calculateFees` BEFORE:**
```ts
    const makerFee = makerFeeRate ?? this.resolveFee(assetClass, 'spot_maker_fee');
    const takerFee = takerFeeRate ?? this.resolveFee(assetClass, 'spot_taker_fee');
    const feeRate = isMaker ? makerFee : takerFee;
```
**AFTER:**
```ts
    const friction = getFrictionForAssetClass(assetClass);
    const feeRate = isMaker ? friction.feeRateMaker : friction.feeRateTaker;
```
**Rider classification (Langston 16:25Z): outcome (3), legacy.**
- `estimateVolatility` never read `symbol`, from its first commit `8f1911909`.
- `priceHistory` was write-only from birth. Its sole writer, `realtime-paper-executor.ts:46`, was deleted in `977f3be08`.
- Per-symbol slippage on the active path is `execution/depth-walk.ts`; this file serves only the dormant validator (`#300`(b)).
- Caller census, stated in its order (Langston's correction): before the deletion `modelSlippage` had **two** callers — the validator and the internal `:225` inside `modelTradeRealism` — and the set closes because `modelTradeRealism` is deleted too.
- ⚠️ Name collision: `quality_index.ts:207` exports a live, unrelated `estimateVolatility`, and it is untouched. Recorded in `DELETED_COMPONENTS_LOG.md`.

**Import cycle check:** `cost-model.ts` does not import `slippage-fee-model.ts`, directly or transitively through its imports (`module-constants-service`, `cost-cache`, the friction modules, `friction-sample-store`).

### 1.4 `server/services/pre-execution-validator.ts:136-140`
The `modelSlippage` call loses its first argument (`request.signal.symbol`).

### 1.5 `server/routes.ts:69` — dead import deleted (F-2).

### 1.6 `server/core/math/cost-model.ts:106-114` — comment only
The false *"maker … has zero live consumers today"* is replaced with: the merge site is the only `fee_model` reader; both rates are live; maker may be negative.

### 1.7 `server/core/math/trade-pnl.ts:73` — docstring only
*"Structurally cannot be negative"* becomes *"SIGNED: negative when both legs are maker fills"* (reviewer lead, A4).

---

## 2. MIGRATIONS

### 2.1 `drizzle/migrations/2026-09-11-b-xstock-fee-contract.sql` — NEW, in `MANIFEST.txt` (P1, P4, P6)
One `BEGIN … COMMIT`:
- **P1:** two **unconditional** `UPDATE`s — xStock taker `'0.0010'`, maker `'-0.0002'`. No `WHERE value = …`.
- **P4:** `DELETE FROM module_constants WHERE module_name = 'cost_model'`, plus two `calibration_ledger` corrections (`'0.10%'`, `'-0.02%'`).
- **P6:** xStock `vts`, `paper_sim` and `live` epochs bumped `+1` **exactly when this run changes the xStock fee pair** (D-6); `live/xstock_spot` inserted as `live/* + 1` when it does not exist yet and the fees change (D-2). Three temp tables are captured before any write: epoch rows, the two spot classes' two spot fee constants, and the fee-changed flag computed from them.
- **Post-condition `DO $$` block:**
  - exactly 4 `spot_taker_fee` / `spot_maker_fee` rows **for the two spot classes** (scoped by class AND constant name, so neither a perp row nor a new fee constant can block it); xStock exactly `0.0010 / -0.0002`; the crypto pair **equal to its own pre-image**, never a literal (so a later crypto fee change cannot block a redeploy);
  - 0 `cost_model` rows;
  - 2 corrected ledger rows;
  - every epoch row compared with its pre-image — only the xStock `vts`, `paper_sim` and (when it already existed) `live` rows may move, each by exactly `d` (`1` when the fee pair changed, `0` when it did not);
  - when no live xStock row existed before: the new row equals `live/* + 1` if the fees changed, and no row exists if they did not.

**Staging DRY RUN of the r1 file, 2026-09-11 ~16:40Z** — superseded for the final file by run 1 of the simulation below, on the same rows (the r1 file verbatim, with its final `COMMIT` replaced by `ROLLBACK`, run with `ON_ERROR_STOP=1`):
- Statement results, all eight: `SELECT 6` (the epoch pre-image temp table), `UPDATE 1`, `UPDATE 1`, `DELETE 5`, `UPDATE 1`, `UPDATE 1`, `UPDATE 2`, `INSERT 0 1`. *(r1 of this list omitted the `SELECT 6`.)*
- `DO` completed — every post-condition held on the real rows — then `ROLLBACK`; psql exit 0.
- After the rollback: fee rows `0.008 / 0.004` on both classes, 5 `cost_model` rows, epoch rows unchanged, ledger `0.26% / 0.16%`. Nothing was kept.

**The production runner path, on a fresh database — CI run `34623482499` at `aee2bc191`, job "Test Suite", step "Apply database migrations":** `[db-migrate] Applying: 2026-09-11-b-xstock-fee-contract.sql` → `[db-migrate] ✓`. That is `db-migrate.ts:192`, the whole file as ONE query, against a database built from `MANIFEST.txt` order. The psql dry run above is statement-by-statement; this closes that gap. The later revisions went through the same runner: CI run `34625393686` at `64f5e3517` and CI run `34627129368` at `74be7e7a0` (4/4 green; 283 files / 3,192 tests passing). ⚠️ **A commit cannot cite its own CI run:** the final revision's run is cited in the Step-4 dispatch, which is sent only after it is green.

**SCENARIOS AND NEGATIVE CONTROLS on staging, final (r3) files, 2026-09-11 — one script, built from the repo files: §2.1a.**

### 2.1a SCENARIOS AND NEGATIVE CONTROLS — staging, final (r3) files, 2026-09-11
⚠️ **How this departs from running the files verbatim, stated completely:**
- **Transactions:** every block strips each file's own top-level `BEGIN;` and final `COMMIT;` lines, so that a sequence sits inside one transaction ending in `ROLLBACK`. This applies to the negative controls as well.
- **Ledger row:** after the first forward run, the `_migrations` row is inserted exactly as `db-migrate.ts` records an applied file, so the rollback's `DELETE` runs for real.
- **Statement-by-statement:** statements go through psql one at a time. **The single-query runner path is CI's `db:migrate`, not this.**
- **Error handling:** the script runs with `ON_ERROR_STOP` **OFF**, so every block reports. The operator command in the rollback header is `-v ON_ERROR_STOP=1`.

psql exit 0. **Exactly four originating `ERROR`s**, from S4, M1, M2 and M3. The further `ERROR` lines inside S4 are psql's "current transaction is aborted" for the statements after the refusal, not separate failures.

| block | sequence | result |
|---|---|---|
| before | — | xStock epochs vts 6, paper_sim 3, no live row; xStock fees 0.008 / 0.004 |
| **S1** | forward → record ledger row → rollback → forward | epochs **7 / 4 / 3** → **8 / 5 / 4** → **9 / 6 / 5**; fees new → old → new; no error |
| **S2** | forward → record → rollback → rollback | the second rollback changes nothing: epochs stay **8 / 5 / 4**, fees 0.008 / 0.004; no error (reviewer r3 NF1) |
| **S3** | forward → forward (ledger row deleted by hand, no rollback) | the second forward changes nothing: epochs stay **7 / 4 / 3**; no error (NF1) |
| **S4** | forward → a later batch sets xStock taker `0.0008` → rollback | `ERROR: [b-xstock-fee-contract rollback] xStock fees are 0.0008 / -0.0002, neither this batch's 0.0010 / -0.0002 nor the restored 0.008 / 0.004; a later fee change would be overwritten, refusing` (NF2) |
| **M1** | forward with its epoch-bump `UPDATE` removed | `ERROR: [b-xstock-fee-contract] epoch paper_sim/xstock_spot moved 3 -> 3 (expected +1)` |
| **M2** | forward plus a write of `0.0079` to `crypto_spot.spot_taker_fee` | `ERROR: [b-xstock-fee-contract] crypto_spot.spot_taker_fee moved 0.008 -> 0.0079 (this migration must not touch crypto)` |
| **M3** | forward, then the rollback with its epoch-bump `UPDATE` removed | `ERROR: [b-xstock-fee-contract rollback] epoch live/xstock_spot moved 3 -> 3 (expected +1)` |
| after all | — | identical to `before` |

**What the controls prove:** the epoch-delta check (both files), the crypto pre-image check and the rollback's refusal guard each fail when the thing they guard is missing. **What they do not prove:** they cover those checks only, not every assertion in the post-condition blocks.

### 2.2 `drizzle/migrations/2026-09-11-b-xstock-fee-contract-rollback.sql` — NEW, NOT in the manifest (P4, D-3)
Operator-only; runs before any pre-batch `dt-deploy`. Restores:
- the five `cost_model` rows, with the literal values measured on staging,
- the xStock fee pair `0.008 / 0.004`,
- the two ledger rows.

Its header gives the exact operator command, `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f`; without that flag a failed check still exits 0 (reviewer r3 NF4). **It opens with a guard block that refuses** unless xStock is on this batch's pair or already on the restored one (NF2). It **bumps the xStock `vts`, `paper_sim` and `live` epochs forward by +1 when it changes the fee pair** (D-3), and **deletes the forward migration's `_migrations` row by `name`** (D-6). Its own post-condition check confirms: 5 `cost_model` rows; the fee pair restored; both ledger rows restored; the ledger row gone; and exactly those three epoch rows moved by `d`.

### 2.3 `drizzle/migrations/2026-06-11-b45-fee-model-tier1.sql` — comment banner only (P1)
Names the three false premises and points at the correcting migration. The file never re-runs: `_migrations` is keyed by name, and its checksum column is never compared.

### 2.4 `drizzle/migrations/MANIFEST.txt` — one line added, after `2026-09-11-b-ohlc-frame-guard.sql`.

---

## 3. TESTS

| file | kind | what |
|---|---|---|
| `server/tests/helpers/fee-model-fixture.ts` | NEW fixture | named per-class constants and `seedFeeModelForTests(overrides?)` (D-4) |
| `server/tests/unit/b-xstock-fee-contract-rail.test.ts` | NEW | accepts both production schedules; the retired rail refusing −0.0002 as CONTROL; maker floor/cap boundaries accepted with values just beyond refused; taker 0 and negative refused; NaN / ±Infinity refused on both constants; maker > taker refused, equal allowed |
| `server/tests/unit/b-xstock-fee-contract-signed-fees.test.ts` | NEW | per-class merge-site values; `calculateFees` charges a **diverged** seeded xStock taker (proves it reads the merge site); a maker rebate gives negative fees and net > gross; a rebate raises realized net P&L; both legs maker gives **negative totalCost**; signed `composeBookedFriction`; the validator resolver passes a negative through; the maker/taker decision shifts **taker +0.014·E, maker-adjusted +0.0056·E, margin −0.0084·E** (the A8 arithmetic, executed) |
| `server/tests/unit/b-xstock-fee-contract-resolver.test.ts` | NEW — **mutation-proven** | stubs `getFrictionForAssetClass` with sentinel rates and seeds NO `fee_model` cache, then asserts `calculateFees` charges exactly the sentinels. The pre-batch code read the cache directly and throws on a cold cache, so this test FAILS on the parent and passes only through the merge site. *(The signed-fees "diverged row" test passes on the parent too — both paths read the same cache entry — so it is a value lock, not proof of the resolver move. The r1 change list over-claimed it.)* |
| `server/tests/unit/b-xstock-fee-contract-fence.test.ts` | NEW | F-1: fee UPDATEs carry no value predicate, set the right values and touch no crypto fee row; the post-condition block names the two xStock literals, checks crypto against its pre-image and carries NO crypto literal, and holds the `cost_model` check and the `pre + d` epoch assertion; the bump fires only through the fee-changed flag, with no marker guard · F-2: manifest lists the migration once and never the rollback; the rollback restores all five `cost_model` rows refuses to overwrite a later xStock fee change (a guard block before any write; the header tells the operator `-v ON_ERROR_STOP=1`), bumps the xStock epochs forward through its own fee-changed flag with a `pre + d` check, and deletes its ledger row by `name`; and no rollback file anywhere uses `_migrations.filename` · F-3: the warmup calls both rail functions, has no positive-only check and no `'cost_model'` prefetch · F-4: `slippage-fee-model.ts` reads no `fee_model` and no module constants. Every prohibition sits beside a positive CONTROL |
| `b45-fee-model.test.ts` | SUBJECT, corrected | asserts each class's own schedule by name; a new lock that the two classes do NOT share a schedule; xStock round trip **0.42 %** (was 1.82 %) |
| `cost_cache.test.ts` | SUBJECT seed → fixture | every fee it asserts is crypto, and those stay as they were |
| `b79-0n-mce-costmodel-perp-failhard`, `b79-0n-mce-required-assetclass`, `…-getcachedcostmetrics`, `directive-11.4C-R2` | PROBE → fixture | seed only |
| `b5-amr-body.test.ts` | PROBE seed + one SUBJECT assertion (D-5) | fixture; `:238` corrected |

**What these tests prove, stated plainly (fresh-reviewer point, accepted):** the rail, resolver and fence suites fail if the change is reverted. The signed-fees and `b45-fee-model` suites are LOCKS on arithmetic and fixture values — they pin behaviour this batch relies on, not the change itself. The production values are checked by the migration's own post-condition block, which CI's fresh-database `db:migrate` executes (§2.1).

**Kept as-is, per A10:** `p19-b7-2a-fee-consolidation.test.ts` (its deliberately diverged probe — it keeps its OWN fee seed on purpose, so D-4's "one fixture" means one fixture for the suites that had copied the defect, not every fee literal in the test tree), `fg2-obj5-vts-cost-truth.test.ts`, `b79-0n-execution-audit.test.ts`.

---

## 4. EVIDENCE

- **tsc message-baseline gate** (`node scripts/check-tsc-baseline.mjs`): **377 errors, baseline 377 — no regression, no message text shifted**, so no `--sync` is needed.
- **Touched and new suites** (11 files): 115 tests. First run, 113 pass and 2 fail — a missing import in the new suite, and D-5. Both fixed; the re-run of the two failing files gives **46 / 46**.
- **Full vitest suite, local, at `aee2bc191`:** 3,141 tests — **2,998 pass, 0 fail**, 143 skipped. 10 files cannot load locally: 8 need Postgres (ECONNREFUSED :5432), and 2 (`b-staging-liveness-watch`, `b-tsc-baseline-fix`) hit a Windows-only syntax error at load in files this diff does not touch.
- **CI at `aee2bc191`: 4 / 4 green** — Build, Test Suite (which runs `db:migrate` on a fresh Postgres, then the full suite), TypeScript Check (baseline gate), Docker Build.
- **After review round 1:** the fence, resolver, signed-fees and depth-walk suites pass 38 / 38; tsc baseline 377 / 377. **CI at `64f5e3517`: 4 / 4 green**, run `34625393686` (its Test Suite runs the full suite).
- **After review round 2:** fence 16, resolver 1, signed-fees 9, rail 7 = 33 / 33. **CI at `74be7e7a0`: 4 / 4 green**, run `34627129368`, 283 files / 3,192 tests passing.
- **After review round 3:** fence 17, resolver 1, signed-fees 9, rail 7, depth-walk 14 = 48 / 48. The final commit's CI run is cited in the Step-4 dispatch (a commit cannot cite its own run).
- **Reference census on the working tree** (excluding the archive and the deletion log): no remaining code reference to `modelTradeRealism`, `getAggregateStats`, `updatePriceHistory`, `slippageFeeModel.getConfig`, `TradeRealism` or `resolveFee(`. Remaining hits are historical documents and the governance lines Step 10 rewrites (`SYSTEM_IMPACT_MAP.md:3504`).
- **Migration dry run on staging:** §2.1.

## 5. GOVERNANCE IN THIS COMMIT
- `DELETED_COMPONENTS_LOG.md`: new top entry.
- Archive: `1-system-manual/_archive/deleted-code/slippage-fee-model.pre-b-xstock-fee-contract.ts.removed`, the whole pre-batch file written from the ref (blob `b60c3a02e`).

Every other Tier-1/Tier-2 edit named in the plan's P10 lands at Step 10.

## 6. P8 — RULED (not code)
**Langston ruled 16:39Z; folded into the plan as r6.** Per-pick classification is the gate: PASS = zero class-(iii) mechanism bypasses AND xStock maker share ≤ 1.0 % at n ≥ 300. `p₀` is frozen at the deploy instant. ~21 days to n = 300.

## 7. REVIEWER RECORD

`REVIEWER s3-r1: object · the pushed Step-3 diff aee2bc191 + this change list · 9 findings: (1) rollback leaves the _migrations row → a redeploy skips the fix, and a forced re-run fails on the epoch post-condition; (2) the signed-fees "diverged row" test passes on the parent — not proof of the resolver move; (3) the fence accepts any RAISE before COMMIT; (4) the change list cited a full-suite result that was not recorded; (5) the dry run used psql, not the single-query runner, and the tally omitted SELECT 6; (6) p19-b7-2a keeps its own xStock seed, against D-4's wording; (7) wildcard live bumps will no longer reach live/xstock_spot (already the P6 ADJUSTMENT_FRAMEWORK item); (8) fee-row count unscoped; (9) two stale line citations · re-derived y: db-migrate.ts:66/:155, the b79 rollback :22, ci.yml:98 + the CI log apply line, p19-b7-2a :23-42, depth-walk citations · changed: D-6 and D-7; rollback clears its ledger row; migration re-runnable and simulated on staging; resolver test added (mutation-proven); fence strengthened; fee-row count scoped; citations fixed; §2.1, §3 and §4 corrected. Point 7 is carried to Step 10 (ADJUSTMENT_FRAMEWORK) as planned.`

`REVIEWER s3-r2: object · 64f5e3517 (the round-1 fixes) · items 1, 2, 6, 8, 9 and D-7 SATISFIED; 3, 4, 5 PARTIAL; NEW N1 (silent): the round-1 fix made a redeploy after rollback share an epoch with the restored-fee window; N2: §2.1 still described the old epoch rule; N3 (loud): hard-coded crypto literals, and a live row written by anyone else, would block a redeploy after a later batch · re-derived y: the calibration-epoch.ts header, both SQL files at 64f5e3517 · changed: every fee change bumps (forward on every run, rollback too), the updated_by marker guard removed, crypto checked against its pre-image, §0 D-3/D-6 and §2 rewritten, CI at 64f5e3517 cited, the simulation now records the _migrations row and states the BEGIN/COMMIT strip, negative controls added (§2.1a). Accepted as limits, not changed: item 3 (the fence is a source-level substring check) and D-7 (it catches only the exact form); the behaviour proof is the staging simulation, the negative controls and CI's db:migrate, not the fence.`

`REVIEWER s3-r3: object · 74be7e7a0 (the round-2 fixes) · N1, N2 SATISFIED; N3, items 3 and 5 PARTIAL; item 4 NOT SATISFIED (the final CI run was deferred to the dispatch); NEW NF1 (silent over-split): bump-on-every-run resets xStock aggregates with no fee change (a second rollback, a hand re-run); NF2 (silent): the rollback overwrites a later xStock fee batch; NF3 (silent, another batch's file): b-xstock-feed-sanity's rollback deletes 0 rows once this migration rewrites updated_by; NF4 (loud): the rollback header did not require ON_ERROR_STOP · re-derived y: outcome-feedback-store.ts:358 (Welford reset on mismatch), the feed-sanity rollback :14-16 and its forward :58, both SQL files at 74be7e7a0 · changed: a fee-changed flag decides each file's bump; rollback guard block; fee pre-image and counts scoped to the two spot fee constants; ON_ERROR_STOP in the operator command; rollback checks the ledger rows; §0 D-3/D-6, §2.1, §2.1a, §2.2, §3, §4 rewritten; staging scenarios S1-S4 plus M1-M3 · NOT changed and put to Langston: NF3 (another batch's file) · accepted as limits: item 3 (a source-level fence); an xStock epoch row for a NEW learning source would not be bumped (sources are a fixed type today); fee_model and calibration_epoch refresh separately, so between the migration commit and pm2 restart running code could briefly pair new fees with the old epoch (window not measured); the bump is a direct SQL write, not the canonical module_constants write path the calibration-epoch.ts header names (precedent: fg2-obj5c).`

**⚠️ ROUND CAP REACHED.** Three fresh object-round reviewers read this diff. Round 3's corrections (the fee-changed flag, the rollback guard, the scoping, `ON_ERROR_STOP`) **have had no fresh reviewer**, by the workflow's three-round cap; Langston is their first reader. The full round record is above.

**NF3 — FINDING IN ANOTHER BATCH'S FILE (not edited here).** `2026-09-03-b-xstock-feed-sanity-rollback.sql:14-16` deletes the xStock `paper_sim` epoch row only where `updated_by = 'b-xstock-feed-sanity'`. Its forward migration inserted that row (`:58`). Once this migration bumps the row and rewrites `updated_by`, that rollback silently deletes nothing, and it has no post-check. Deleting the row would in any case step xStock `paper_sim` BACK to the wildcard epoch, the blend the epoch exists to prevent. **Recommendation:** that rollback should not delete an epoch row at all. Owner: CC-C. **DISPOSITION: put to Langston at Step 4** — fold a one-line removal and comment into this batch, or route it to CC-C.

## 8. STEP 4 — LANGSTON'S VERDICT AND WHERE EACH CONDITION WENT

`LANGSTON Step 4: APPROVED 2026-09-11 17:50Z at eb5b7831d, with three conditions and one instrument gap · re-derived by him: the staging pre-image (15 rows; S1's 6/3/none real), D-6 at db-migrate.ts:65-66 and :187-194 (the file runs before the ledger INSERT, so a RAISE leaves no row), cost_model's zero readers, the signed-fee consumer claim (142 Math.max(0, sites in server/, none bearing on a fee), all six forward/rollback states (round 3's fee-changed flag also makes a crash-window re-run inert) · judgement 1: keep · judgement 2: refuse-only, no override · judgement 3: preserves the gate, given its wording → condition A · NF3: route to CC-C, fold nothing.`

| item | disposition |
|---|---|
| **A** — a booked `entry_fee_rate` discharges a class-(iii) row only when it reads the new rate; the discharge is its own labelled line with its n; three buckets | **folded** — pre-audit r7, P8 |
| **B** — an admission arm at the xStock EV gate, split at the deploy | **folded** — pre-audit r7, P8 Arm B: a VTS rate from `signal_eval_archive` (112 / 54,442 = 0.21 % over the trailing 7 days) and a paper count (121; no paper denominator exists in that archive, stated). Baselines frozen in the Step-6 deploy note |
| **C** — the xStock learning reset and the looser gate coincide; say so plainly | **carried** to the completion report (pre-audit r7 carry block) |
| note — the rollback's `cost_model` literals are a 2026-09-11 snapshot | **carried** to the completion report |
| note — why the taker rail is `> 0` | **done** — comment in `server/startup/fee-model-rail.ts` |
| **NF3** — the feed-sanity rollback, and the `updated_by`-as-owner class | **routed** to CC-C as `#1045`, with the instance, the class and the item4 header (`2026-06-10-item4-step2-calibration-epoch.sql:12`). Census re-derived at the ref: 2 of 89 rollback files touch `calibration_epoch`; only feed-sanity's deletes an epoch row. Not folded |
| **`#1043`** — raw GitHub reads can serve the wrong file | **no raw read is cited on this batch**; every read here is `git show` / `git grep` at the ref, or staging `psql` |

### 8a. Step-6 sequencing — Langston's ruling

> ⚠️ **SUPERSEDED — read §9.** This records the 18:17Z SEQUENCE ruling, which Langston DISCHARGED at 19:48Z: its premise, the unmeasured shared REST budget, is now measured. Commit `31bb708ca`'s subject calls it "(a)". **Cite these rulings in words, not letters.**

`LANGSTON deploy sequencing 2026-09-11 18:17Z: (a) SEQUENCE — CC-C's B-PRICE-SIDE-BY-JOB OBJ-7 (P-7a..P-7j, interleaved on the branch, at its own Step 4) deploys first at its own Step 6; this batch follows as a separate boundary. Do not combine; do not amend the P8 VOID clause. · re-derived by him: the compare census a5273ad6d...3127b5cd8 (62 commits, 105 files, a complete census below the API truncation points) — ready_to_buy_service.ts and eval-cycle.ts absent, signal-orchestrator.ts one hunk at :2414 (P-7j), so both P8 decision sites stay levelGeometry 'mid' · P-7h: not a confound AT THE SITE (the token gate is on the crypto direct-REST branch; xStock exits mark off getLatestEquityTick), but UNMEASURED as a shared resource (the exit engine becomes a new consumer of the REST bucket, and takeToken() has no refund on throw) — a site census cannot clear a shared-resource coupling, so (b) is refused; narrowing a pre-registered clause after seeing which commits landed is a specification change made with the answer in view · CC-C agreed (a) at 18:06Z and posts the OBJ-7 deploy sha · his P-7h / F-G-2 A4 finding is a condition on OBJ-7, not on this batch.`

**Consequence for this batch:** Step 6 waits for OBJ-7's Step 6. The deploy-note baselines (`scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql`, committed `4c082a831`, trial-run twice on staging) run immediately before this batch's `dt-deploy`, with `obj7_at` = OBJ-7's recorded deploy time, so section (1b) shows whether OBJ-7 moved the baseline.

## 9. STEP 6 DEPLOY NOTE — ONE RESTART, TWO NAMED BOUNDARIES (Langston's final ruling, 2026-09-11 19:48Z)

> **The rulings, in words** (the letters collided; these are his own statuses at 19:48Z):
> - **18:17Z SEQUENCE — DISCHARGED.** Its premise, *"UNMEASURED as a shared resource"*, is now measured from both directions.
> - **19:28Z migration HOLD, and its four conditions — VACATED.** The hold was prepared locally and never committed; it is stood down in these words (condition 5).
> - **19:30Z — SATISFIED** by CC-C's runtime measurement, which returned a named exception rather than a null.
> - **19:39Z ONE RESTART — STANDS**, with conditions 1-5 and now 6-7.
>
> **OBJ-7's half:** `Change Lists/B_PRICE_SIDE_BY_JOB_OBJ7_CHANGE_LIST.md`, section "STEP 6 — DEPLOY NOTE (one restart, two batches)" (CC-C). The two halves are linked, and CC-C posts the deploy sha into both.
> **Deploy sha:** `<40-char sha — at CC-C's notice>` · **run by:** `cc-c` · **restart instant:** `<deployed_at — from the deploy record>`

### 9.1 Why one restart is admissible — the shared REST budget
- **By structure** (Langston, re-derived at `b597f1bf2`):
  - the xStock class gate at `live-pricing-adapter.ts:628` returns on both arms (`:632-643`, `:644-653`) above `:659`;
  - `:659` is the only call to `fetchFromKrakenRest` (`:759`), which holds the only adapter `check()` (`:762`);
  - the engine's `takeToken()` (`active-execution-engine.ts:1611`) sits on the crypto branch;
  - both draw on one bucket (`rest-rate-limiter.ts:54` / `:92`).
- **The census — THREE production sites** (condition 4):
  - `check()`, crypto only by the gate above;
  - `takeToken()`, crypto only;
  - `routes.ts:10961` `getStats()` and `:10980-10982` `reset()` — an admin route, loosening-only, class-agnostic, not an xStock consumer.
  - ⚠️ *This one symbol was counted three different ways in one hour — "exactly two", "one production caller", three. That is `enumerator-blind-spot`; three is correct.*
- **By runtime** (CC-C, 19:35Z; all 15 staging `out` files, 2026-09-10 03:28Z → 09-11 19:32Z):
  - the limiter symbols and the xStock gate symbols do not intersect, across 206,623 and 64,826 lines;
  - the one exception is `DASH/USD`.
- **The finding, widened by Langston's static census:** a runtime window bounds the sample, not the population. The whole alias set is 17 symbols (§9.3).

### 9.2 The boundary this batch puts at that sha
- **Class:** `xstock_spot` only.
- **Fees:** 0.008 → 0.0010 taker, and 0.004 → −0.0002 maker.
- **`cost_model`:** deleted (zero readers).
- **Epochs:** `vts/xstock_spot` and `paper_sim/xstock_spot` +1, and `live/xstock_spot` created at `live/* + 1`.
- **Not touched:** crypto fees (checked against their pre-image) and every crypto and wildcard epoch row.
- ⚠️ **The xStock epoch bump cuts xStock learning history:** any xStock aggregate spanning this sha is two populations.

### 9.3 Windows that START or SPLIT at this sha, and the alias exclusion (conditions 2, 6, 7)
| window | what happens at this sha |
|---|---|
| **P8** (pre-audit r8) | **starts** here. The VOID clause applies as written: at one sha its left arm is empty, so this is an application, not an amendment. |
| **Arm B** (pre-audit r8) | **starts** here |
| **`#951`'s xStock arm** | **splits** here |
| **F-G-2 A4's crypto window** | **splits** here — OBJ-7's half, named so this record is complete |
| **every xStock learning aggregate** | **resets** (condition C → the completion report) |

- ⛔ **Condition 6 — the 17 alias symbols** are excluded from P8's and Arm B's verdict counts until `#1024` lands, published separately, with their row count beside every verdict: `A` · `ADI` · `CAT` · `CVX` · `DASH` · `EDU` · `ES` · `IR` · `MET` · `OPEN` · `PEP` · `STRK` · `STX` · `SUI` · `T` · `WELL` · `WEN` (all `/USD`).
  - **How the set was found:** Kraken `AssetPairs` ∩ `xstock_spot_universe`, on the exact cache key (Langston, 19:48Z).
  - **Residual:** the venue's live catalog was read, the 23 delisted rows were not filtered, and over-inclusion is the safe direction. Re-run the census if `#1024` slips past the window.
  - **Condition 6 (Langston 19:51Z, blocking) — re-run against the FULL xStock universe, not the 147 traded symbols: DONE twice, independently, before the window opened, and both runs found the same 17.** CC-C ran it at 19:54:58Z. CC-B ran it at ~19:57Z: Kraken public `AssetPairs` on staging (1,449 pairs, 666 distinct `<BASE>/USD` wsnames) ∩ `xstock_spot_universe` (498 rows, 498 distinct symbols; delisted rows included, which over-includes). The intersection is n = 17, identical to the list above. CONTROL: `DASH/USD` appears in both rosters.
  - **The exclusion is keyed on the reader's identity (Langston 19:51Z):** rows keyed `(symbol, xstock_spot)` for the 17. Crypto-class rows for the same keys stay in. **The count convention is stated:** "3 of 274" counts xStock-class closes only; `PHASE_19_PLAN` 3b.h-4's "4 closes" for `DASH/USD` counts both classes.
- ⛔ **Condition 7:** the excluded set's historical share is **3 of 274 xStock closes = 1.09 % — above P8's 1.0 % PASS line.** If restoring the excluded rows would change either arm's verdict, that arm is **INCONCLUSIVE-EXTEND, never PASS on the remainder.**
- **The cost accepted, named:** one boundary buys no post-hoc attribution between the fee change and OBJ-7. The pre-registered criteria are insulated, but **anything UNEXPECTED in the window is unattributable** — neither "it was OBJ-7" nor "it was the fee" is available.

### 9.4 Frozen baselines — output of `scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql`, run immediately before the restart with `deploy_at` = `obj7_at` = that instant
Sections (1c) and (4b) carry the alias split.
**Run at `2026-09-11T20:01:34Z` on staging** (`deploy_at` = `obj7_at` = that instant; staging then ran `a5273ad6d`; psql exit 0). Frozen before any post-deploy row exists:
```
CREATE TABLE
INSERT 0 17
=== (1) P8 p0: xStock maker share among maker_taker decisions since f8870022f, up to the deploy instant ===
  n  | maker | maker_pct | null_mode |         first_row          |          last_row          
-----+-------+-----------+-----------+----------------------------+----------------------------
 114 |    25 |      21.9 |         0 | 2026-09-08 02:00:41.354+00 | 2026-09-11 19:57:53.951+00
(1 row)

=== (1b) the same p0, split at the OBJ-7 deploy (a shift here means OBJ-7 moved the baseline) ===
     side     |  n  | maker | maker_pct 
--------------+-----+-------+-----------
 before OBJ-7 | 114 |    25 |      21.9
(1 row)

=== (1c) P8 p0 WITHOUT the 17 alias symbols (the verdict population), and the excluded rows beside it ===
               part               |  n  | maker | maker_pct 
----------------------------------+-----+-------+-----------
 verdict population (17 excluded) | 112 |    23 |      20.5
 the 17 alias symbols             |   2 |     2 |     100.0
(2 rows)

(CONTROL for the symbol format: count of any-mode xStock evidence rows ever carrying DASH/USD)
 dash_usd_rows_any_time 
------------------------
                    619
(1 row)

=== (2) Arm B trading days: the 5 most recent complete UTC days before the deploy day with xStock EV-gate rows ===
SELECT 5
 trading_day 
-------------
 2026-09-04
 2026-09-07
 2026-09-08
 2026-09-09
 2026-09-10
(5 rows)

=== (3) Arm B1, VTS: xStock EV-gate admission RATE per trading day, and pooled ===
    day     | admitted | at_gate | admit_pct 
------------+----------+---------+-----------
 2026-09-04 |       25 |   16731 |     0.149
 2026-09-07 |        0 |    1748 |     0.000
 2026-09-08 |       39 |   13797 |     0.283
 2026-09-09 |       21 |   10639 |     0.197
 2026-09-10 |       15 |   11221 |     0.134
            |      100 |   54136 |     0.185
(6 rows)

=== (4) Arm B2, paper mode: xStock admitted COUNT per trading day (a volume; no paper denominator exists in this archive) ===
    day     | paper_admitted | paper_non_admitted_rows 
------------+----------------+-------------------------
 2026-09-04 |             23 |                       0
 2026-09-08 |             41 |                       0
 2026-09-09 |             24 |                       1
 2026-09-10 |             17 |                       0
            |            105 |                       1
(5 rows)

(a trading day missing from (4) had zero xStock paper rows; (2) lists all five days)
=== (4b) Arm B pooled over the same days, split into the verdict population and the 17 alias symbols ===
               part               | b1_admitted | b1_at_gate | b1_admit_pct | b2_paper_admitted 
----------------------------------+-------------+------------+--------------+-------------------
 verdict population (17 excluded) |          98 |      50633 |        0.194 |               103
 the 17 alias symbols             |           2 |       3503 |        0.057 |                 2
(2 rows)

=== (5) state at the deploy instant: xStock fee rows, xStock epochs, and the last maker_taker write (P8 VOID watch) ===
    module_name    | asset_class | constant_name  | value |          updated_by          |          updated_at           
-------------------+-------------+----------------+-------+------------------------------+-------------------------------
 calibration_epoch | *           | live           | 2     | b45-fee-epoch-bump           | 2026-06-09 22:30:02.969554+00
 calibration_epoch | *           | paper_sim      | 2     | b45-fee-epoch-bump           | 2026-06-09 22:30:02.969554+00
 calibration_epoch | *           | vts            | 3     | b47-chunkA-regime-epoch-bump | 2026-06-09 22:30:02.969554+00
 calibration_epoch | xstock_spot | paper_sim      | 3     | b-xstock-feed-sanity         | 2026-09-03 18:17:59.922739+00
 calibration_epoch | xstock_spot | vts            | 6     | fg2-obj5c-vts-cost-truth     | 2026-06-11 14:16:02.229386+00
 fee_model         | crypto_spot | spot_maker_fee | 0.004 | b45-tier1-seed               | 2026-06-10 21:50:44.215225+00
 fee_model         | crypto_spot | spot_taker_fee | 0.008 | b45-tier1-seed               | 2026-06-10 21:50:44.215225+00
 fee_model         | xstock_spot | spot_maker_fee | 0.004 | b45-tier1-seed               | 2026-06-10 21:50:44.215225+00
 fee_model         | xstock_spot | spot_taker_fee | 0.008 | b45-tier1-seed               | 2026-06-10 21:50:44.215225+00
(9 rows)

 xstock_maker_taker_rows |          last_write           
-------------------------+-------------------------------
                      12 | 2026-07-15 21:39:56.502756+00
(1 row)

PSQL_EXIT=0
```

### 9.5 Rollback cost (condition 3)
- **No sha rolls OBJ-7 back and keeps the fee contract in its reviewed state:** `aee2bc191` is an ancestor of all of OBJ-7.
- **Dropping the fee code needs the hand-run rollback first:** `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/migrations/2026-09-11-b-xstock-fee-contract-rollback.sql` (as deploy, env sourced), and **then** `dt-deploy` of the older sha.
- **That rollback is itself a fee change and bumps the xStock epochs again.** An OBJ-7 rollback after this deploy therefore costs a manual DB step and two extra xStock epoch boundaries.
- **The rollback refuses** unless xStock is on this batch's pair or the restored pair.

### 9.6 After the restart (Step 7)
- **The data check:** `scripts/analysis/b_xstock_fee_contract_verify.sql`, with `deploy_at` = the recorded restart.
- **To PASS:** an xStock maker fill booked with a negative entry fee, and xStock taker fills at 0.0010. **A window with zero xStock fills is not a pass.**
- **Then the UI in Claude-in-Chrome:** the RTB table and the VTS and paper open/closed trades tabs.
