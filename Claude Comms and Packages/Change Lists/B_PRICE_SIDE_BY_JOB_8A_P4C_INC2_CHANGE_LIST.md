# B-PRICE-SIDE-BY-JOB row `8a-P4c` — CHANGE LIST (increment 2, X0: the zero-defaulted xStock sides deleted; the window extract committed)

**GRADED REF:** stated in the Step-4 dispatch (the commit carrying this file). **Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §C2 (audit + plan) and §C2.3 (Langston's Step-2 ruling and how each condition was built).

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `architecture` — the plan's line 3, the file's ONE graded marker (the mid-document `sub_batch` marker struck, Langston Step-2 C5) |
| **ii** | **THE CLASS'S DOC SET** | **scope** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md` (r2 `e9a6b7f68`) · **pre-audit** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §C2 + §C2.3 · **completion report** — batch OPEN; the progress report `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` holds the record, converts at close · **DELETED_COMPONENTS_LOG** — present, this increment's entry (NIT-6) · **BATCH_CATALOG / PHASE_HISTORY / SYSTEM_MANUAL / SIM** — owed at Step 10: SIM's price-map entry loses its sides; System Manual judged (a dead field, no decision) |
| **iii** | **STEP 2** | the plan above, §C2 — Langston PROCEED 2026-09-30T01:31:21Z at `7fc76ca43` with BLOCKER-1 + C2-C5 + NIT-6, all built before this dispatch (§C2.3) |

## WHAT CHANGED — and what did NOT
⛔ **No decision moves.** Every xStock and crypto VTS decision reads what it read before; the only reader of the lookup helper reads `.price`. No epoch change, no migration, no DB write.

| # | file | change | taxonomy |
|---|---|---|---|
| **1** | `server/services/vts-runner.ts` — the real lane's xStock price entry | `bid: parseFloat(r.bid) \|\| 0` / `ask: …` **deleted**, and the entry TYPE no longer carries a side. A missing side was fabricated as zero; nothing read it | **outcome 1 — a latent defect**: a fabricated value, one reader away from firing every stop |
| **2** | `server/services/vts-runner.ts` — the lookup helper's crypto half | returns `{ price }` only; the `bid`/`ask` projection **deleted** with the return type narrowed (C3/C4). The values were faithful but carried no stamp, against the file's own invariant (`:137-139`, `8a-P3` r3 FINDING-2) that crypto touch readers read fresh from the cache | **outcome 3 — legacy**: an affordance contradicting a stated invariant; now compile-enforced |
| 3 | `server/services/vts-runner.ts` — the stale comment | "increment 2 (X0) replaces them" → the deletion and why | — |
| 4 | `server/tests/unit/b-price-side-8a-p4c-x0-fence.test.ts` | **NEW** — 6 tests: a capability arm for every pattern (it matches the forbidden shape, and not the allowed ones), then the fence: no zero-defaulted side anywhere, the entry type side-free, the helper price-only, `rawQuote` still carried on both lanes | — |
| 5 | `scripts/analysis/p4c-window-extract.py` | **NEW, tracked** — the window extract, with the SYM cut on `hour=` and the four controls below | — |

### The code (after)
```ts
  const xstockPriceMap = new Map<string, { symbol: string; price: number; rawQuote: XsQuoteRow }>();
  …
            xstockPriceMap.set(r.symbol, {
              symbol: r.symbol,
              price,
              rawQuote: { last: price, bid: parseQuoteNumber(r.bid), ask: parseQuoteNumber(r.ask), atMs: parseQuoteNumber(r.at_ms) },
            });
  …
  const priceDataMap = {
    get(symbol: string, assetClass?: string): { price: number } | undefined {
      if (assetClass === 'xstock_spot') {
        const x = xstockPriceMap.get(symbol);
        return x ? { price: x.price } : undefined;
      }
      const p = cryptoPriceMap.get(symbol);
      return p ? { price: p.price } : undefined;
    },
  };
```
Before: the entry type was `{ symbol; price; bid: number; ask: number; rawQuote }`, the entry set `bid: parseFloat(r.bid) || 0, ask: parseFloat(r.ask) || 0`, and the helper returned `{ price: number; bid?: number; ask?: number }` — the xStock entry as-is, the crypto `{ price: p.price, bid: p.bid, ask: p.ask }`.
⚠️ **The xStock branch now builds `{ price }` rather than returning the entry**, so `rawQuote` is not reachable through the helper either — its three readers (`recordLook` ×2, `recordPendingLook`) read `xstockPriceMap` directly, unchanged, and the increment-1 P5 fence's `toBe(3)` on `?.rawQuote ?? null` still holds (not re-pointed, per your note).

### The fence is mutation-proved — each mutation run locally against the fence, file restored after each (`cmp` clean)
| mutation | red test |
|---|---|
| M1 re-add `bid: parseFloat(r.bid) \|\| 0,` to the real-lane entry | *no side is defaulted to zero anywhere in the runner* |
| M2 widen the helper to `{ price: number; bid?: number; ask?: number }` | *the lookup helper returns the price only, on BOTH classes* |
| M3 put `bid?: number` back on the entry type | *the real-lane xStock entry type carries no side* |
| M4 restore the crypto projection `{ price: p.price, bid: p.bid, ask: p.ask }` | *the lookup helper returns the price only, on BOTH classes* |
And the type is the first wall: with the entry type side-free, re-adding the `|| 0` assignment is an excess-property error at `tsc`. **tsc: 339 = baseline 339.**

## P6b — THE COMMITTED EXTRACT AND ITS CONTROLS (BLOCKER-1 + C2), run on staging against the closed window
| control | result |
|---|---|
| **(a) negative control** — `--sym-cut stamp` (the old cut) | after-session gap **vts 8,638 · shadow 6,825 — exactly** §9.8's figures ⇒ it reads the corpus the original read |
| the fix — `--sym-cut hour` | after-session gap **0 · 0** (SYM = TOUCH: vts 211,691 · shadow 163,326) |
| **(b) the rotations** | required set enumerated from the range: `error__2026-09-23 … 09-30` + live `error.log` (the final hour's flush); per-file lines printed (e.g. `09-23` 437,482 lines / 3,435 instrument); **a missing rotation is FATAL** — exit 2, nothing printed (shown: a 2026-08-01 start fails on `08-02`) |
| **(c) segment totals** | every session, both lanes, TOUCH and SYM published; all ten segments non-zero (`readable: true`) |
| **(d) per-hour equality over unrestarted hours (C2)** | TOUCH lines placed in an hour by STREAM ORDER (before the lane's flush of hour H ⇒ H), so a straddling pass counts where its looks were recorded. **vts 182 of 182 cells over 177 hours equal · shadow 179 of 179 over 174.** Restarts from PM2's own log: one, the deploy at the window's start (14:38:49Z, before any line; uptime since `2026-09-22T14:38:49.748Z`) ⇒ **0 hours excluded, 0 looks lost** |
| unchanged readings | c* vts 120 s / shadow 60 s · U 1.76% / 1.47% · K 0 · floor symbols 308 / 295 — as §9.6 |

## JUDGEMENT CALLS TO ATTACK
1. **Stream-order attribution for (d)** instead of the TOUCH line's own stamp — it relies on a lane's flush block being written synchronously inside `beginPass`, before that pass's first look (`vts-xs-instrument.ts:169-172`). If a same-lane TOUCH could land inside a flush block, the attribution would be wrong.
2. **The restart rule excludes the restart's hour AND the hour before it** (the flush due at the hour change is lost too). Over-exclusive by design; it excluded nothing here.
3. **Building `{ price }` in the xStock branch** rather than returning the entry: it narrows what the helper exposes to exactly its type, so a future caller cannot reach `rawQuote` through it by a cast.

## Step 4 — APPROVED (four conditions + one nit, no blocker); all built — plan §C2.4
- **FINDING-1:** correction 1's weight re-attributed to the negative control + construction; the per-hour equality is an identity, and the +5 cells-over-hours on both lanes (the five 09:30 ET opens) is the informative corroboration.
- **FINDING-2:** `scripts/analysis/p4c-window-extract-selftest.py` exercises the restart arm; expectation committed first (`a5efad289`), first run 10/10 PASS, including the negative control (restart handling off ⇒ hour 12 unequal).
- **FINDING-3:** the extract asserts the PM2 log reaches the window start and publishes its first stamp; re-run on staging unchanged.
- **FINDING-4:** S28's stale line refs — Step-10 debt, listed.
- **NIT-5:** the real lane's unread `symbol` dropped; both lanes declare `{ price; rawQuote }`.

## Row 8a #1250 — midnight report repair, Step 3

**Class:** architecture under the parent batch. **Step 2:** Coltrane PROCEED at 11:04:41 UTC on November 26 at `792a51f8743dd77dd95fa48f78010ad8ff520b71`. The approved draft is `B_PRICE_SIDE_BY_JOB_8A_P4C_MIDNIGHT_END_PRE_AUDIT.md`.

- `scripts/analysis/p4c-window-extract.py` preserves the existing in-window source range. A midnight end also reads the next-date archive when present, with the existing split and alias treatment and chronological order. The live file remains a single source before delayed rotation. A missing required in-window archive cannot be inferred from a later file.
- The reader checks exact lane and final-hour rollup coverage before producing JSON. A positive final-hour pass in a non-excluded lane requires that lane's rollup. A surviving date stamp, another lane's rollup or a later hour is insufficient. Restart exclusions, stream-order assignment at hour boundaries and the optional stamp cut retain their meaning.
- `scripts/analysis/p4c-window-extract-selftest.py` runs 12 added assertions. The two-hour 4/9-look corpus covers live, delayed and next-date gzip, aliases/split and missing in-window file, lost rollup despite alternate evidence, restarts, quiet and straddled passes, and the nine-look stamp-control gap. The exact pre-fix extractor failed the new discovery and coverage cases. The implementation passed 38/38 total checks locally. Removing next-date discovery failed 3 controls, removing the coverage refusal failed 2, admitting the next hour failed the wrong-rollup control, and the date-bound-only variant failed the valid live case.

**Judgment call for Step 4:** a lane with positive final-hour looks and no eligible rollup exits 2 before stdout. If some lines survive, existing per-cell equality still judges their count. Review the sibling/later-rollup interleaving and restart exclusion at the exact code ref. Run the controlled read before the next midnight-ended report. The #1250 issue amendment and plan row 17 carry close evidence at governance.

**REVIEWER:** claim-only · what other states fit a missing final-hour rollup? · a pass starting before midnight and finishing after it can leave nine looks outside the positive-TOUCH coverage check · re-derived at `46c4373c981fa3d576c0ff39b40b79bcffb671d4` with the late and in-window timestamp arms and restored rollup.

In the two-hour VTS fixture, a nine-look TOUCH at 00:00:02 UTC with the 23:00 rollup missing gave one graded cell, `holds=true` and zero window look gap. Moving that TOUCH to 23:59:59 made the same missing rollup exit 2 with empty stdout. Restoring the 23:00 rollup with the late TOUCH graded two cells and exposed a -9 gap between stamp-cut TOUCH and hour-cut SYM. A later 00:00 rollup with the same count also gives one graded in-window cell and zero window gap when the 23:00 rollup is absent. The writer assigns the rollup hour at `beginPass`; TOUCH is emitted at `endPass` and carries no pass-start hour. Timing alone cannot distinguish a quiet final hour followed by a new pass from a straddling pass with a missing rollup. Step 4 must rule on coverage for existing unstamped logs before a midnight grade uses this repair. No writer change is in this patch.

## Row 8a #1250 — Step 4 r5 review

**Declared change-class:** `architecture` (parent `B_PRICE_SIDE_BY_JOB_SCOPE.md`, row 8a).

| Architecture document | Status for this review |
|---|---|
| `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_SCOPE.md` | Present. Parent row 8a, report residual only. |
| `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_MIDNIGHT_END_PRE_AUDIT.md` | Present. The r5 Step 2 review object is `0e35edf8e01ca53d8194b4db4b82acad9d4c297c`, Coltrane PROCEED at 12:17:10 UTC, dispatch `1575485110134902886`. |
| `Claude Comms and Packages/Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` | Present. Update appends r5 evidence and the condition for the first controlled read. |
| `1-system-manual/BATCH_CATALOG.md` | Present. Parent remains open. Record this reader residual when independently verified. |
| `1-system-manual/PHASE_HISTORY.md` | Present. Record applicable reader history at Step 10. |
| `1-system-manual/SYSTEM_MANUAL.md` | Present. §18.0.1 carries VTS instrument semantics. Update the report's source coverage contract at Step 10. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Present. Review P9 rotation-to-reader dependency. Record the accepted edge at Step 10. |
| `1-system-manual/RUNNING_ISSUES.md` and `1-system-manual/CHANGES_AND_FIXES.md` | Present. #1250 stays open, parent entry outcome independent. Record the reader amendment at governance. |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md`, `1-system-manual/PHASE_19_PLAN.md` and `1-system-manual/CC_C_SESSION_TASK_LIST.md` | Present. Parent row 17 / 8a remains in its approved slot. |
| `1-system-manual/POST_AUDIT_ROADMAP.md`, `1-system-manual/DELETED_COMPONENTS_LOG.md`, `1-system-manual/ADJUSTMENT_FRAMEWORK.md` | Judged N/A for this reader correction. No roadmap, deletion or measurement-epoch change. |
| Parent completion report | Absent. Parent has additional open work. The existing 8a progress report carries independent reader evidence. |

**Step 2 reference:** `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_MIDNIGHT_END_PRE_AUDIT.md` r5 at `0e35edf8e01ca53d8194b4db4b82acad9d4c297c`.

Before the correction, selecting a candidate source by its day provided no independently completed range. The positive in-window eligibility quantity used only TOUCH lines stamped inside the report window. Example from the previous implementation:

```python
inside = START_S <= t < END
if MIDNIGHT_FINAL_HOUR is not None and inside and t >= MIDNIGHT_FINAL_HOUR and kv['looks'] > 0:
    final_hour_looks.add(lane)
# After scanning the older source set:
for lane in sorted(final_hour_looks - final_hour_rollups):
    if (lane, MIDNIGHT_FINAL_HOUR) not in excluded:
        # Missing final-hour rollup refuses here.
```

The real read now collects the first and last complete stamped lines from its exact boundary source files. One file must begin strictly before END and show a complete line at or after END+1h. The alternative requires the exact opening-hour rotation and ordered successor with a complete cutoff. At equal-second timestamps, the missing predecessor cannot pass as one spanning file. The old pre-END eligibility remains. Positive lane activity stamped in `[END,END+1h)` independently requires that lane's exact final-hour rollup.

```python
spans_boundary = any(h is not None and h < END and t >= cutoff
                     for h, t in midnight_source_bounds.values())
verified_pair = (END <= cut < cutoff and before_head is not None and before_head < END
                 and after_head is not None and cut <= after_head < cutoff
                 and before_tail <= after_head and after_tail >= cutoff)
# Coverage refusal precedes any JSON result or reliance on the restart exclusion.
for lane in sorted((final_hour_looks | late_hour_looks) - final_hour_rollups):
    if (lane, MIDNIGHT_FINAL_HOUR) not in excluded:
        # Unresolved lane activity refuses here.
```

All 51 synthetic selftest checks pass. Four independent mutations trip the intended controls. Admitting a later-only successor fails two assertions. Removing the complete-hour requirement fails two. Dropping after-END eligibility fails one. Accepting one source starting exactly at END fails two, including the multi-day case with its archive removed. That mutation recreates a partial one-cell grade with zero gap. Restoring the exact archive with the identical live successor yields 2/2 cells and a −9 stamp gap. Genuinely spanning one file produces the same result. The source range proves the expected rotation contract. The new check has no reach into internal file deletion or arbitrary manual rotation.

**Review question.** Verify the exact code and fixture across the multi-day stamped-equality, missing opening, completed-hour and late lane-attribution counterexamples. Then rule on the reader-only advancement to CI and a controlled read before the next midnight-ended report. The revised source predicate is **NOT RE-READ** by the earlier one-pass reader, which identified the unresolved late TOUCH in the prior candidate. No report grade or restart was performed for this review.

### #1250 Step 4 correction — damaged selected archive

Coltrane's 2026-11-26 13:41:11 UTC review of `3f8388121843fa26c6b7e7b68296f4db5f3f9417` reproduced the 51 prior controls, all four boundary mutations, and independent two-lane source/rollup controls. CHANGES NEEDED: a damaged selected gzip's DEFLATE layer raised `zlib.error`, exiting 1 with a traceback and no archive/window diagnostic.

The existing log reader now normalizes that exception into the same exit-2 unreadable-input path as filesystem and truncated archive failures. Boundary files identify their required UTC opening-hour interval; other required reads identify the report interval. The fixture retains the exact same valid gzip and changes only the first DEFLATE block type in the negative arm. Intact yields 2/2 VTS cells, equal counts. Corrupt, before the catch, yielded exit 1 and empty stdout. Corrupt, with the catch, yields exit 2, zero stdout bytes, and names `error__2026-01-07_00-00-03.log.gz` and `[2026-01-06T00:00:00+00:00, 2026-01-06T01:00:00+00:00)`. All 52 synthetic assertions pass. Original r5 source predicates, approval boundary, and controlled-read gate remain. No report grade, writer change or restart.
