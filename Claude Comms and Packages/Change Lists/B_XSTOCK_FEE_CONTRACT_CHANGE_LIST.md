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
| D-3 | P4: rollback "steps the two bumped xStock epochs back and deletes the `xstock_spot/live` row" | rollback **leaves the epoch bump in place** | stepping an epoch back silently re-joins pre-change and post-change learning — the mixing the epoch exists to prevent. A fresh boundary is never harmful. Stated in the rollback file's header |
| D-4 | P7: "re-point the five PROBE files to named per-class constants" | the PROBE files seed from **one shared fixture**, `server/tests/helpers/fee-model-fixture.ts`, and SUBJECT assertions use its named constants | eight suites carried their own `0.008 / 0.004` copy for BOTH classes — the defect reproduced in tests. One fixture means the next schedule change edits one file |
| D-5 | A10 classified `b5-amr-body.test.ts` as PROBE | **one of its assertions was SUBJECT**: `:238 expect(c.fee).toBe(0.008)` on an xStock symbol | caught by the test run, not the census (the census matched the seed literals, not the assertion). Corrected to `XSTOCK_SPOT_TAKER_FEE`. **PREVIOUSLY STATED (A10): five PROBE files. NOW: four pure PROBE files plus one mixed file with one corrected SUBJECT assertion.** |
| D-6 | (not in plan) | **the forward migration is safe to run AGAIN after the operator rollback**, and the rollback deletes the forward migration's `_migrations` row | fresh reviewer, re-derived: `db-migrate.ts:155` skips any name already in `_migrations` (column `name`, `:66`). The r1 rollback left the row, so a redeploy after a rollback would have SKIPPED the fix, and xStock would have booted on 0.008 / 0.004 — values the signed rail accepts, so nothing would refuse. Forcing a re-run would then have failed on the epoch post-condition. Fixed on both sides: the rollback deletes the row; the migration captures who last wrote each epoch row and accepts a row an earlier run already bumped (never bumping twice). The guard is NULL-safe (`IS DISTINCT FROM`): `module_constants.updated_by` is nullable (staging `information_schema`), and `<>` would silently skip a row whose `updated_by` is NULL — staging holds 0 such epoch rows of 6, and the fence now forbids `updated_by <>`. **Simulated on staging** (§2.1); the final file was dry-run again with `ROLLBACK` and passed with the same eight results |
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
- **P6:** `vts` and `paper_sim` xStock epochs bumped `+1`, guarded by `updated_by`; `live/xstock_spot` inserted as `live/* + 1` (D-2).
- **Post-condition `DO $$` block:**
  - exactly 4 fee rows **for the two spot classes** (scoped so a future perp fee row cannot block it), with the four exact values;
  - 0 `cost_model` rows;
  - 2 corrected ledger rows;
  - every epoch row compared with a pre-image captured in a temp table — only the xStock `vts` and `paper_sim` rows may move, each by exactly `+1`;
  - the live xStock row equals `live/* + 1` and was created by this migration.

**Staging DRY RUN, 2026-09-11 ~16:40Z** (the file verbatim, with its final `COMMIT` replaced by `ROLLBACK`, run with `ON_ERROR_STOP=1`):
- Statement results, all eight: `SELECT 6` (the epoch pre-image temp table), `UPDATE 1`, `UPDATE 1`, `DELETE 5`, `UPDATE 1`, `UPDATE 1`, `UPDATE 2`, `INSERT 0 1`. *(r1 of this list omitted the `SELECT 6`.)*
- `DO` completed — every post-condition held on the real rows — then `ROLLBACK`; psql exit 0.
- After the rollback: fee rows `0.008 / 0.004` on both classes, 5 `cost_model` rows, epoch rows unchanged, ledger `0.26% / 0.16%`. Nothing was kept.

**The production runner path, on a fresh database — CI run `34623482499` at `aee2bc191`, job "Test Suite", step "Apply database migrations":** `[db-migrate] Applying: 2026-09-11-b-xstock-fee-contract.sql` → `[db-migrate] ✓`. That is `db-migrate.ts:192`, the whole file as ONE query, against a database built from `MANIFEST.txt` order. The psql dry run above is statement-by-statement; this closes that gap.

**Rollback-then-redeploy SIMULATION on staging** (post-fix files; forward body, rollback body, then forward body again, inside one outer transaction, then `ROLLBACK`; `ON_ERROR_STOP=1`, exit 0):
- **Run 1:** `SELECT 6 · UPDATE 1 · UPDATE 1 · DELETE 5 · UPDATE 1 · UPDATE 1 · UPDATE 2 · INSERT 0 1`, then `DO` passed. xStock epochs: vts 7, paper_sim 4, live 3.
- **Rollback file:** `INSERT 0 5 · UPDATE 1 ×4 · DELETE 0`, then `DO` passed. xStock fees are back to 0.008 / 0.004. (`DELETE 0` because inside the simulation the forward run was never recorded in `_migrations`.)
- **Run 2** (the redeploy): `SELECT 7 · UPDATE 1 · UPDATE 1 · DELETE 5 · UPDATE 1 · UPDATE 1 · UPDATE 0 · INSERT 0 0`, then `DO` passed. The epochs were **not bumped twice** (still 7 / 4 / 3), and the fees are correct again at 0.0010 / −0.0002.
- **After the outer ROLLBACK:** every row reads as before the simulation.

### 2.2 `drizzle/migrations/2026-09-11-b-xstock-fee-contract-rollback.sql` — NEW, NOT in the manifest (P4, D-3)
Operator-only; runs before any pre-batch `dt-deploy`. Restores:
- the five `cost_model` rows, with the literal values measured on staging,
- the xStock fee pair `0.008 / 0.004`,
- the two ledger rows.

It **deletes the forward migration's `_migrations` row by `name`** (D-6), carries its own post-condition check (including that the ledger row is gone), and deliberately leaves the epochs bumped.

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
| `server/tests/unit/b-xstock-fee-contract-fence.test.ts` | NEW | F-1: fee UPDATEs carry no value predicate, set the right values and touch no crypto fee row; the post-condition block names all four expected fee literals, `IS DISTINCT FROM`, the `cost_model` check and the `pre + 1` epoch assertion; and the migration is re-runnable after the rollback · F-2: manifest lists the migration once and never the rollback; the rollback restores all five `cost_model` rows and deletes its ledger row by `name`; and no rollback file anywhere uses `_migrations.filename` · F-3: the warmup calls both rail functions, has no positive-only check and no `'cost_model'` prefetch · F-4: `slippage-fee-model.ts` reads no `fee_model` and no module constants. Every prohibition sits beside a positive CONTROL |
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
- **After the review fixes:** the fence, resolver, signed-fees and depth-walk suites pass 38 / 38; tsc baseline 377 / 377.
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
