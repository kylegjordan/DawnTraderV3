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
- Caller census: `modelSlippage` has one caller.

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
  - exactly 4 fee rows, with the four exact values;
  - 0 `cost_model` rows;
  - 2 corrected ledger rows;
  - every epoch row compared with a pre-image captured in a temp table — only the xStock `vts` and `paper_sim` rows may move, each by exactly `+1`;
  - the live xStock row equals `live/* + 1` and was created by this migration.

**Staging DRY RUN, 2026-09-11 ~16:40Z** (the file verbatim, with its final `COMMIT` replaced by `ROLLBACK`, run with `ON_ERROR_STOP=1`):
- Statement results: `UPDATE 1`, `UPDATE 1`, `DELETE 5`, `UPDATE 1`, `UPDATE 1`, `UPDATE 2`, `INSERT 0 1`.
- `DO` completed — every post-condition held on the real rows — then `ROLLBACK`; psql exit 0.
- After the rollback: fee rows `0.008 / 0.004` on both classes, 5 `cost_model` rows, epoch rows unchanged, ledger `0.26% / 0.16%`. Nothing was kept.

### 2.2 `drizzle/migrations/2026-09-11-b-xstock-fee-contract-rollback.sql` — NEW, NOT in the manifest (P4, D-3)
Operator-only; runs before any pre-batch `dt-deploy`. Restores:
- the five `cost_model` rows, with the literal values measured on staging,
- the xStock fee pair `0.008 / 0.004`,
- the two ledger rows.

It carries its own post-condition check and deliberately leaves the epochs bumped.

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
| `server/tests/unit/b-xstock-fee-contract-fence.test.ts` | NEW | F-1: fee UPDATEs carry no value predicate, set the right values, touch no crypto fee row, and assert inside the transaction · F-2: manifest lists the migration once and never the rollback; the rollback restores all five `cost_model` rows · F-3: the warmup calls both rail functions, has no positive-only check and no `'cost_model'` prefetch · F-4: `slippage-fee-model.ts` reads no `fee_model` and no module constants. Every prohibition sits beside a positive CONTROL |
| `b45-fee-model.test.ts` | SUBJECT, corrected | asserts each class's own schedule by name; a new lock that the two classes do NOT share a schedule; xStock round trip **0.42 %** (was 1.82 %) |
| `cost_cache.test.ts` | SUBJECT seed → fixture | every fee it asserts is crypto, and those stay as they were |
| `b79-0n-mce-costmodel-perp-failhard`, `b79-0n-mce-required-assetclass`, `…-getcachedcostmetrics`, `directive-11.4C-R2` | PROBE → fixture | seed only |
| `b5-amr-body.test.ts` | PROBE seed + one SUBJECT assertion (D-5) | fixture; `:238` corrected |

**Kept as-is, per A10:** `p19-b7-2a-fee-consolidation.test.ts` (its deliberately diverged probe), `fg2-obj5-vts-cost-truth.test.ts`, `b79-0n-execution-audit.test.ts`.

---

## 4. EVIDENCE

- **tsc message-baseline gate** (`node scripts/check-tsc-baseline.mjs`): **377 errors, baseline 377 — no regression, no message text shifted**, so no `--sync` is needed.
- **Touched and new suites** (11 files): 115 tests. First run, 113 pass and 2 fail — a missing import in the new suite, and D-5. Both fixed; the re-run of the two failing files gives **46 / 46**.
- **Full vitest suite:** see the commit message for the run on this tree.
- **Reference census on the working tree** (excluding the archive and the deletion log): no remaining code reference to `modelTradeRealism`, `getAggregateStats`, `updatePriceHistory`, `slippageFeeModel.getConfig`, `TradeRealism` or `resolveFee(`. Remaining hits are historical documents and the governance lines Step 10 rewrites (`SYSTEM_IMPACT_MAP.md:3504`).
- **Migration dry run on staging:** §2.1.

## 5. GOVERNANCE IN THIS COMMIT
- `DELETED_COMPONENTS_LOG.md`: new top entry.
- Archive: `1-system-manual/_archive/deleted-code/slippage-fee-model.pre-b-xstock-fee-contract.ts.removed`, the whole pre-batch file written from the ref (blob `b60c3a02e`).

Every other Tier-1/Tier-2 edit named in the plan's P10 lands at Step 10.

## 6. STILL OPEN BEFORE DEPLOY (not code)
**P8's PASS line.** Langston's four conditions (16:25Z) are answered at 16:33Z with the pre/post-`f8870022f` split, the 300-row blocks, the sink's columns and join evidence, and a point-form proposal. The point form predicts a **~0 %** xStock maker share after the fix (344 / 344 joined maker picks flip). His ruling on the line is folded into the plan before Step 6.
