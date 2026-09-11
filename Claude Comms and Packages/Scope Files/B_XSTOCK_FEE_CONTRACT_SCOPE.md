# B-XSTOCK-FEE-CONTRACT — SCOPE (r1)

change-class: architecture

| | |
|---|---|
| **Batch** | `B-XSTOCK-FEE-CONTRACT` · `RUNNING_ISSUES #1010` (+ amendment) · `PHASE_19_PLAN` row **2.4-FEE** |
| **Owner** | CC-B (Claude New) |
| **Directive** | Kyle, 2026-09-11: *"pivot to fixing the fees for xStocks … what the fix is and what the fees should be … get a fix for."* Plan placement ruled by Langston 2026-09-06 (architecture; batch not hotfix; tier resolution OUT). |
| **Read at** | `origin/migration/aws-supabase` @ `2fc13111d`+223 (fetched 2026-09-11); live DB read on staging the same session |
| **Card** | `PVTI_lAHODmulEM4BfQP4zg6h554` — Scope |

---

## 0. THE DEFECT, IN ONE TABLE

| `fee_model` row (staging, measured 2026-09-11, 25-row unbounded fee sweep) | stored | Kraken Pro, **account-confirmed** 2026-09-06 | error |
|---|---|---|---|
| `*` / `xstock_spot` / `spot_taker_fee` | `0.008` | **`0.0010`** | 8× too high |
| `*` / `xstock_spot` / `spot_maker_fee` | `0.004` | **`−0.0002`** | wrong sign — a rebate booked as a cost |
| `*` / `crypto_spot` / both | `0.008 / 0.004` | `0.008 / 0.004` (spot rung 1) | none — **untouched by this batch** |

All four rows: `updated_at 2026-06-10 21:50:44.215225+00`, `updated_by b45-tier1-seed`. No commit has touched a fee site since 2026-09-07 (`git log --since` on the five fee files, empty). `system_context.maker_fee_pct / taker_fee_pct` are **NULL on both rows** (measured) — so the operator override does not mask this, and a corrected `fee_model` reaches the validator.

**The contract:** `1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md` §0.b–§0.c and §2. Pro xStocks qualifies on **spot volume alone**; rung 2 is $100,000,001; maker −0.02 % at both rungs. ⇒ **for this account the xStock rate is a constant, not a ladder.**

---

## 1. OBJECTIVES AND VERIFICATION

### OBJ-1 — Correct the two xStock rows
`spot_taker_fee` → `0.0010`; `spot_maker_fee` → `−0.0002`. Migration through the `module_constants` write path, new `updated_by` tag, idempotent. **Crypto rows byte-identical before and after.**
**Verify:** psql of every `fee_model` row before/after (crypto unchanged, xStock corrected); staging boot log `[B45][warmup] fee_model verified: … xstock taker=0.001 maker=-0.0002`.

### OBJ-2 — The boot rail accepts a rebate and still refuses nonsense
`server/startup/b72-warmup.ts:237` refuses anything outside `(0, 0.05]` — **a −0.0002 maker stops the server booting.** Proposed rail, one rule for both products:
- taker **∈ (0, 0.05]** — no schedule we hold pays a taker;
- maker **∈ [−0.01, 0.05]** — rebates exist on two products (xStock every rung; futures from rung 11, −0.006 %); a −1 % floor catches a decimal or sign slip (`−0.02` typed for −0.02 %);
- **maker ≤ taker** — a maker fee above the taker fee is always a transcription error;
- finite.
**Verify:** unit cases — maker −0.0002 boots; maker −0.02 refuses; taker 0 and negative refuse; maker > taker refuses; NaN refuses; crypto 0.008/0.004 boots; staging restart clean.
⚠️ **Question for review:** I treat −0.01 as a sanity rail of the same class as the existing 0.05 ceiling (refuses boot, decides no trade), so it stays in code. If you read it as a decision constant, it moves to `module_constants`.

### OBJ-3 — A fresh database cannot re-create the defect
`drizzle/migrations/2026-06-11-b45-fee-model-tier1.sql:39-42` seeds `xstock_spot` from the crypto literal (`ON CONFLICT DO NOTHING`). Recommended mechanic: **leave the applied file's VALUES as the historical record, add a supersession banner to its comment naming the new migration, and make the new migration an `UPDATE`** — so staging (already seeded) and an empty CI database both end on the correct rates, and the file on disk still matches what ran. Alternative (edit the old VALUES) is weaker: it makes the file disagree with every database it already ran against.
**Verify:** CI `db:migrate` against an empty database + a lock reading the resolved xStock pair; old file carries the banner.

### OBJ-4 — One resolver for fee rates (Langston's binding condition, 2026-09-06)
Two direct `fee_model` readers exist in production code: `cost-model.ts:114-120` `resolveFeeRates` (the merge site) and **`slippage-fee-model.ts:39-43` `resolveFee`** (sole production caller `pre-execution-validator.ts:174`, taker leg). Route the second through the first. **No import cycle:** `slippage-fee-model.ts` imports only `module-constants-service`; `cost-model.ts` does not import `slippage-fee-model`. ⇒ `B-FEE-TIER-RESOLUTION` later changes **one function body**, not a call graph. No literal rate appears at any read site.
Also correct `cost-model.ts:110-111` — *"it has zero live consumers today"* — false since P19-B7.2 (OBJ-5 census).
**Verify:** census `getCached*('fee_model'` in production code = the resolver + the `b72-warmup` assertion only.

### OBJ-5 — Every maker-rate consumer handles a negative value, proven per site
**Population (census at the ref, tests excluded):** `maker-taker-decision.ts:215/294-295` · `active-execution-engine.ts:2419` (maker exit fee), `:3935` (pending-maker entry fee), `:4121` (recorded entry rate) · `xstock_spot/eval-cycle.ts:819/1015/1026/1232` · `vts-runner.ts:1933/1953/2205/2220/2386/4496` · `ready_to_buy_service.ts:826/844` · `pending-maker-logic.ts:140/145` · `signal-orchestrator.ts:1058/1074` · `slippage-fee-model.ts:194-203/321` · `pre-execution-validator.ts:189/198/405`.
**Already correct by reading:** `maker-taker-decision.ts:294` `(feeRateTaker − feeRateMaker)` grows under a rebate; `slippage-fee-model.ts:199` `netAmount = grossAmount − totalFees` rises; `active-execution-engine.ts:2424/3935` `fee = notional × rate` goes negative.
**No fee clamp exists:** `cost-cache.ts:109-113` bounds slippage and spread only — the fee never passes `MAX_COST_BOUND` (SIM §2.5, confirmed at the object).
**The one explicit positivity test in production:** `parity-gate.ts:117` `feesModeled = avgFeesPerTrade > 0`. Low reach today (a taker exit keeps a per-trade total positive) but it encodes "fees are a cost"; disposition at Step 2.
**To read at Step 2:** how a negative `entryFee` / `exitFee` flows into `net_pnl` / `total_cost` on every close-booking path, and every aggregate or display that may assume fees ≥ 0.
**Verify:** a lock per booking path with maker −0.0002 — fee negative, net = gross − fee; parity-gate disposition recorded.

### OBJ-6 — Stamp the boundary: calibration epochs, xStock only
`ADJUSTMENT_FRAMEWORK` CALIBRATION EPOCHS rule 1: a shared-substrate change bumps **all** sources. `fee_model` feeds vts, paper_sim and live for `xstock_spot`, so all three bump **for xStock only** (crypto untouched). Live, measured: `xstock_spot/vts = 6`, `xstock_spot/paper_sim = 3`, and **no `xstock_spot/live` row** — live resolves the wildcard `*/live = 2`.
Proposed: `xstock_spot/vts 6→7`, `xstock_spot/paper_sim 3→4`, **insert `xstock_spot/live = 3`**. Same form as `2026-09-02-fg2-obj5c-vts-epoch-bump.sql`.
⚠️ **Judgement call for review:** inserting a class-scoped live row where none exists. Bumping the wildcard instead would also move crypto. Precedent: B-4.5 bumped all three sources.
**Verify:** psql epochs before/after; boot assertion passes; completion report carries old→new per `ADJUSTMENT_FRAMEWORK` rule 2.

### OBJ-7 — The other stored copies, each dispositioned
| copy | measured | disposition |
|---|---|---|
| `calibration_ledger` `xstock_spot` `feeRateTaker` / `feeRateMaker` | `current_value` **0.26 % / 0.16 %**, `status baseline`, **`decision_grade = true`**, 2026-06-02 — served by `/api/analytics/calibration-scoreboard` (`routes.ts:8382`) | (2) correct to 0.10 % / −0.02 %: a decision-grade row showing a wrong value |
| `cost_model` / `kraken` / `default_taker_fee` | `0.0026` (pre-July rate), 2026-05-05 | (5) **delete** — zero code readers: `getCached*('cost_model'` returns nothing; the same grep form returns the 4 known `fee_model` reads. Module still in `b72-warmup.ts:46` PREFETCH — keep or drop at Step 2 after listing the module's remaining rows |
| `system_context.maker_fee_pct / taker_fee_pct` | NULL on both rows | (1) no change — stays operator-override-only |
| prose: seed-file comment, `exchange-defaults.ts:16-19`, `xstock_spot/friction.ts:1-11`, SIM B-4.5 section (*"identical by construction: account-wide tier"*) | all assert xStock == crypto | (2) corrected in this batch |

### OBJ-8 — Tests: subject vs probe, never blind-swapped
**Population:** 15 test files carry a fee literal (`0.008`/`0.004`) **and** a fee identifier (census at the ref; control: `xstock_spot` found in 103 test files): `cost_cache`, `cost_telemetry`, `net_expectancy` (integration) · `b45-fee-model`, `b45-sysctx-fee-override`, `b5-amr-body`, `b79-0n-mce-costmodel-perp-failhard`, `b79-0n-mce-required-assetclass-getcachedcostmetrics`, `b79-0n-mce-required-assetclass`, `directive-11.4C-R2`, `fg2-obj5-vts-cost-truth`, `p19-b7-2-maker-taker`, `p19-b7-2a-fee-consolidation`, `p19-b7-2d-xstock-lane`, `p19-b8-5c-kernel-friction-units` (unit).
Where the xStock rate **is the subject**, correct it. Where a value stands in for "some fee" to test a resolver or merge invariant, **re-point or leave** — per-file classification at Step 2.
**New locks:** xStock resolves 0.001 / −0.0002; crypto still 0.008 / 0.004; the OBJ-2 rail cases; the OBJ-5 booking cases — **each shown failing against the old values before it is trusted.**
**Verify:** CI 4/4 green.

### OBJ-9 — Measure what the wrong fee did to xStock ranking (read-only)
Kyle was told on 2026-09-06 this would be scoped inside the batch. **Measurement, not a code change.** Admission and mode choice cannot be repaired — a refused candidate was never simulated. **The shadow pool can:** its non-promoted candidates were simulated and keep their primitives. Re-price its xStock rows at the corrected rates, re-rank each cycle, report how often rank 0 would have changed. Population, cycle count and era stated; no outcome claim.
⚠️ **Placement question for review:** this may belong in its own measurement item after deploy rather than inside an architecture batch. I included it to keep what Kyle was told; say if you want it split.

---

## 2. WHAT CHANGES FOR TRADING, STATED BEFORE IT HAPPENS

- **xStock EV gate:** taker/taker round trip **1.60 % → 0.20 %.** Expect materially more xStock candidates to clear the net-EV sign check (`signal_quality_evaluator.ts:363/572`) and the VTS floor.
- **Maker vs taker on xStock — not the obvious direction.** The maker fee advantage `taker − maker` falls from **0.40 % to 0.12 %** because the taker rate falls further than the maker rate. With the non-fill haircut unchanged, the best-of-both decision **may choose taker more often**, not less. To be measured after deploy, not assumed.
- **Crypto:** no rate changes. Shared code does change (rail, resolver) → crypto regression locks in OBJ-8.
- **Risk envelope unchanged.** Concurrency caps, sizing and the daily-loss budget are untouched; more admitted xStock candidates compete for the same slots.

---

## 3. ARCHITECTURAL READ (1.a)

- **SIM §1.3 Cost Model** — blast radius **HIGH** (*"affects EV calculations and filter thresholds"*). ⚠️ Stale: names `server/core/cost-model.ts` (now `server/core/math/`) and a *"Paper Execution Engine"* consumer (renamed P19-B-RENAME). Fixed at Step 10.
- **SIM B-4.5 section (`SYSTEM_IMPACT_MAP.md:3486`)** — records the single merge site, the NaN tombstones, the boot assertion, and *"identical by construction: account-wide tier"* — **the premise this batch overturns.** Also lists `slippage-fee-model` as a consumer "reading the resolved value" — it resolves independently (OBJ-4).
- **SIM §2.5 Cost Cache** — P19-B7.2a: *"the governed fee is un-clampable by construction (MAX_COST_BOUND bounds measurements only), has no TTL (a `fee_model` change is live on the next read)"* — confirmed at `cost-cache.ts:109-113`. ⇒ OBJ-1 is live on the next read after the migration; the restart matters only for the boot rail.
- **SYSTEM_MANUAL §5 (`:476`)** — carries the 2026-09-06 supersession banner; Step 10 folds it into the chapter body.
- **`ADJUSTMENT_FRAMEWORK` CALIBRATION EPOCHS** — rules 1-3 govern OBJ-6.

---

## 4. PROVENANCE (1.b)

**Corpora searched:** `BATCH_CATALOG.md` (B-4.5 `:323`, P19-B7.2a `:458`) · `Batch Completion/B_4_5_COMPLETION_REPORT.md` · `RUNNING_ISSUES.md` (`#1010`, amendment, `#1011`) · `SYSTEM_IMPACT_MAP.md` (§1.3, §2.5, `:3486`) · `SYSTEM_MANUAL.md` §5 · `ADJUSTMENT_FRAMEWORK.md` · `git log -S "spot_maker_fee" --reverse` (not path-limited). **`bridge/canonical/` not consulted:** the fee model was built 2026-06-10, after the 2026-01/02 governance change, so it has no pre-governance intent to recover.

### TIER 1 — behaviour changes

**`fee_model` rows + seed migration.** Introduced `dc93d9a6c` (2026-06-10), verbatim subject: *"B-4.5 scope v1 — Kraken tiered fee-model fix (DB-governed per-class fees, Tier-1 seed, epoch bump all-3, tier automation deferred to Phase-21 prep)"*. The seed file's comment, verbatim:
> *"Per-class rows deliberately carry IDENTICAL spot values: the cross-platform tier is ACCOUNT-WIDE, so crypto_spot == xstock_spot is structurally correct. The asset_class dimension exists because future \*_perp classes have genuinely different (futures) fee columns."*

> *"Seeded NOW (pre-July-9) per Langston scope-ACK Q1: over-estimating fees only rejects marginal trades (asymmetric failure mode)"*

> *"Maker rate stored for completeness + the future Phase-19 maker-entry flip … it has ZERO live consumers today — the engine takes liquidity"*

**Disposition (2) — relevant, needs updating to today's intent.** Three premises, each measured false now:
1. *Account-wide tier* — false for xStocks: the in-account dialog shows one qualifying column (spot volume), no futures or AoP route, its own two-rung schedule. **The per-class dimension was built so classes could differ; this batch uses it as designed.**
2. *Over-estimation only rejects marginal trades* — the reasoning was sound for a small over-estimate. **An 8× taker error is not marginal** (1.60 % vs 0.20 % refuses the bulk of candidates, not the edge), and **a sign inversion is not an over-estimate at all** — it changes which execution mode is chosen. ⇒ The conservative intent is kept by using the account-confirmed rate, not by keeping another product's schedule.
3. *Zero live maker consumers* — false since P19-B7.2 activated maker entry; OBJ-5 lists the sites.

**This overturns a reviewed decision on new evidence** (Langston scope-ACK Q1, B-4.5). Stated here, not glossed.

**`b72-warmup.ts:237` boot rail.** Same batch; completion report objective 1: *"(0,0.05] sanity rails"*. Intent: refuse a fat-fingered DB value. **Disposition (2):** the intent stands; the premise that every fee is a cost does not.

**`slippage-fee-model.ts:39` `resolveFee`.** B-4.5 made its methods take a required `assetClass`. P19-B7.2a (`#330`) consolidated fee resolution onto one merge site and `SYSTEM_MANUAL` records that as *"literally true across the codebase"*. Whether `#330` left this reader deliberately is **`INFERRED-FROM-CODE` until the P19-B7.2a report is read at Step 2.** Proposed disposition (2).

**`calibration_ledger` xStock fee rows.** `2026-06-02b-calscore-comprehensive.sql` (B-CALSCORE) — predates B-4.5, carries the old Tier-6 figures. **Disposition (2).**

**`cost_model` / `default_taker_fee`.** `2026-05-05-b72-lever-sweep.sql` (`b72-step3-commit-b`). Intent **`INFERRED-FROM-CODE`**: a B72 lever for the pre-B-4.5 `DEFAULT_TAKER_FEE`, most likely orphaned when B-4.5 retired that constant. **Disposition (5)** on zero readers; introducing commit read at Step 2.

### TIER 2 — read or called
- `maker-taker-decision.ts` — P19-B7.2 best-of-both entry decision; consumes the fee delta. (1)
- `active-execution-engine.ts` booking — P19-B7.2c pending maker / P19-B8.6 maker exit fills. (1)
- `vts-runner.ts` — F-G-2 OBJ-5 maker entry fee on three write paths. (1)
- `calibration-epoch.ts` — ITEM-4 step 2 lineage resets. (1)

---

## 5. ALREADY EXISTS / ALREADY DECIDED

- **Per-class fee dimension exists and is honoured** (`cost-model.ts:114-119`, primary-key `asset_class`). ⇒ no schema change.
- **Tier automation deliberately deferred to Phase 21** (B-4.5 objective 4). Unchanged → `B-FEE-TIER-RESOLUTION`, POST_AUDIT_ROADMAP Phase 21, ahead of live-mode enablement (Langston 2026-09-06).
- **Fee watcher** → `B-KRAKEN-FEE-WATCH`, row 2.4-FEE-b, immediately after this batch.
- **Reward-to-risk from cost** → `B-R-FROM-COST`, CC-C, after row 3n.

---

## 6. NOT IN THIS BATCH

- Any crypto rate change, any tier ladder, any AoP-based rate.
- Repairing historical admission or mode decisions — not recoverable (§OBJ-9).
- `pre-execution-validator.ts:198` pricing both legs at one mode (`feeRate × 2`) — pre-existing simplification; `default_fee_mode = taker` on both live rows, so it prices taker/taker correctly today. Recorded at Step 2 if it bears on OBJ-5.

---

## 7. GOVERNANCE SET (architecture class)

Completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1010` closed) · `PHASE_19_PLAN` row 2.4-FEE · `SYSTEM_MANUAL` §5 (banner folded into the body) · `SYSTEM_IMPACT_MAP` §1.3 + B-4.5 section · `CHANGES_AND_FIXES` · `ADJUSTMENT_FRAMEWORK` epoch record · `KRAKEN_FEE_SCHEDULE_REFERENCE.md` (§2 "we do not implement it" → implemented) · `drizzle/migrations/MANIFEST.txt` · `MEMORY.md` (the FEE REALITY consensus line) · `MEMORY_CC_B.md` · `CLAUDE_NEW_PHASE_19_TASK_LIST.md`.
