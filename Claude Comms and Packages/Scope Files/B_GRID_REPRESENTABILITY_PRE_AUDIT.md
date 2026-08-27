# F-G-1 — B-GRID-REPRESENTABILITY — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

> **Step 2. ONE document. The AUDIT comes first; the PLAN falls out of it.** Every plan item back-references the audit finding it derives from; anything with no audit treatment is flagged `UNAUDITED`.
> **Scope:** `B_EXIT_GRID_REPRESENTABILITY_SCOPE.md` (r4, Step 1 complete — Langston cleared it at `c75ccc4c7` with both closing conditions in).

---

## 0. SOURCES READ — NAMED, PER THE SIX

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | **CODE at `origin/migration/aws-supabase`** | ✅ | `ohlc-batch-writer.ts` flush path in full; `signal-orchestrator.ts` seam + gate ordering; `strategy-engine.ts` geometry sites; the ten `server/strategies/*` files; `venue-validate.ts`; `strategy-helpers.ts` |
| 2 | **RUNTIME LOGS + DATABASE** | ✅ | full retained error logs 08-14→08-27 (5,897 failed flushes / 962,386 rows); `closed_trades` n=646; `crypto_spot_ticker_snap`; live Kraken `AssetPairs` (1,437 pairs) |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | ✅ | per component — see §1 |
| 4 | **`SYSTEM_MANUAL.md`** | ✅ | see §1 — **it is SILENT on this batch's subject, which is itself a finding** |
| 5 | **LEDGER — `RUNNING_ISSUES` + `BATCH_CATALOG` + completion reports** | ✅ | `#705`, `#916`, `#917`, `#915`, `#120`, B-NEW-35, P19-B8.5, Batch 18J |
| 6 | **`bridge/canonical/`** | ✅ | **NO COVERAGE of price representability or the batch writer — recorded as a finding, per the recording rule** |

⛔ **WHAT I DID NOT DO, STATED RATHER THAN OMITTED: no fresh-context reviewer was spawned for the mechanism claims below.** This step's skill makes that mandatory for a mechanism claim (Mode B) under a standing approval — **but this session carries an explicit instruction not to spawn subagents, and a rule recorded in a repo file does not override the session's own instruction.** ⇒ **every mechanism claim here rests on MY OWN re-derivation at the ref and nothing else.** `REVIEWER: not spawned · session-level instruction · no verdict · n/a`

---

## 1. GOVERNANCE GAPS FOUND IN THE MAPS THEMSELVES

**A1 — ⛔ `venue-validate.ts` HAS ZERO ENTRIES IN THE SIM.** Measured: `grep -ic "venue-validate"` = **0** across `SYSTEM_IMPACT_MAP.md`. It shipped in **P19-B8.5 (OBJ-8)**, it is the **only component in the system that talks to the live venue on the paper path**, and the impact map does not know it exists. **That silence is a governance gap under §9 rule 1, and F-G-1 touches this component** (§4 of the scope — the rounding currently lives there). **Plan item P6.**

**A2 — ⛔ `SYSTEM_MANUAL.md` IS SILENT ON PRICE REPRESENTABILITY.** Measured: `rounding` = **1 hit**, and that hit is `:10809`, about `doublePrecision` vs `decimal` column types — **unrelated**. `tick` = 125 hits, all clock/candle ticks, none about venue price increments. ⇒ **the manual documents the maths of what our prices MEAN and is silent on whether they can EXIST.** Under §9 rule 3 this batch changes signal-pipeline maths, so the manual gets a content update. **Plan item P7.**

**A3 — `bridge/canonical/` HAS NO COVERAGE.** Consulted per §9.5(b). The pre-governance corpus documents the intended architecture but contains nothing on venue price grids, tick size, or the batch writer. **Recorded as required — an absence of provenance is a finding, not a blank.** ⇒ **no original-intent constraint binds the rounding design; we are not overturning a prior decision.**

---

## 2. AUDIT — OBJ-9 (THE BAR WRITER), AND IT OVERTURNS THE FIX THE SCOPE PROPOSED

### A4 — ⛔⛔ THE SCOPE'S FIX IS WRONG. `splice`-AFTER-SUCCESS WOULD INTRODUCE A RACE THE CURRENT DESIGN DOES NOT HAVE.

**Read at the ref, `ohlc-batch-writer.ts`:** `const rawRows = batch.splice(0, batch.length); // drain atomically` at **`:108`**, `try` at **`:126`**, catch at **`:184`**.

★ **THE SPLICE-FIRST ORDERING IS LOad-BEARING AND I READ IT AS THE DEFECT.** The census (A5) finds **TWO schedulers** over one buffer. **Because the splice is synchronous and drains the whole buffer, a second concurrent flush of the same class finds an EMPTY buffer and returns at `:107`.** ⇒ **splice-first is precisely what makes concurrent flushes safe today.**

⛔ **Move the splice after a successful write, as the scope proposed, and two concurrent flushes of the same class BOTH read the same rows and BOTH insert them.** The insert is idempotent (`ON CONFLICT DO UPDATE`) so nothing corrupts — **but it doubles the write and, worse, both paths then attempt to clear a buffer that has since taken new rows.** **The scope's fix trades a known data-loss bug for a new concurrency bug.**

✅ **THE CORRECT FIX, and it changes nothing about the drain: KEEP the splice where it is, and on FAILURE PREPEND the rows back.**

### A5 — CENSUS AT THE HOP (§9.5(a)), re-derived at the ref

| question | answer |
|---|---|
| **writes/creates** | **exactly THREE** — `crypto-spot-archiver.ts`, `equity-spot-archiver.ts`, `kraken-futures-archiver.ts`, all via `bufferOhlcBar` |
| **reads** | **exactly ONE** — `flushAssetClass:106` |
| **mutates** | **exactly ONE** — `bufferOhlcBar:101` (`push`) |
| ★ **DELETES** | **exactly ONE** — `batch.splice(0, batch.length)` at `:108` |
| **schedules/starts** | ⛔ **TWO** — the interval timer at `:197-198` and `stopBatchWriter:209`, both fanning out over `ALL_ARCHIVE_CLASSES` |

⛔ **TWO SCHEDULERS ⇒ MUTUAL-EXCLUSION CHECK REQUIRED, and the result is the finding in A4.** `stopBatchWriter` calls `clearInterval` **before** draining, but **`clearInterval` does not cancel an already-executing callback** — so a narrow overlap window exists. **Today the splice-first drain makes that window harmless. Any fix must preserve that property.** The `acquireSlot()` semaphore bounds *concurrent inserts*; it does **not** prevent two flushes of the same class from both having read the buffer.

### A6 — PROVENANCE OF THE DEDUP (§9.5(b-ii)), and it decides the fix

**The in-buffer dedup at `:118-126` is NOT incidental code.** SIM `:1301` records it as **B-NEW-35 Layer 3, shipped hotfix `f001002d9` (2026-05-20)**, with UNIQUE constraints as Layer 1 and the UPSERT as Layer 2. **The code comment states its own invariant:** *"keep only the LAST row per (symbol, interval_begin) — the last write IS the latest WS update IS the correct cumulative OHLCV for that minute. Map insertion-order semantics give last wins naturally."*

⛔ **That invariant is TEMPORAL, and a retry breaks it: retried rows are OLDER but would arrive LATER.** This is Langston's finding E and it is correct.

✅ **PREPEND SATISFIES IT WITHOUT TOUCHING THE DEDUP AT ALL.** Prepended older rows enter the Map first; any fresher row for the same `(symbol, minute)` is inserted after and wins — **which is exactly what B-NEW-35 specifies.** ⇒ **no new field, no change to a shipped hotfix's logic, and the stated invariant is preserved rather than replaced.**
⚠️ **Langston proposed max-by-arrival. I am proposing prepend instead, and the difference is not cosmetic: max-by-arrival requires an arrival timestamp on every buffered row and REPLACES B-NEW-35's rule; prepend PRESERVES it. This is a deliberate divergence from his suggestion and he should rule on it.**

### A7 — WHAT THE FIX DOES **NOT** COVER, measured
**5,897 failed flushes / 962,386 rows, 08-14→08-27. By class: `crypto_perp` 5,889 · `crypto_spot` 6 · `xstock_spot` 2.** ⇒ **99.9% of the loss is on a class we do not trade.** The two traded classes lost **8 batches in two weeks**. ⛔ **This fix does not explain, and must not be reported as explaining, the missing exit minutes.** ⚠️ **Qualified per Langston Q7: negligible by COUNT is not negligible by CONCENTRATION — `deadlock` is load-correlated, load correlates with volatility, and volatility is when stops and targets are touched.**

---

## 3. AUDIT — OBJ-7 / OBJ-7b (THE ROUNDING SEAM)

### A8 — THE SEAM, read at the ref
`signal-orchestrator.ts` takes `rawSignal: StrategySignal` at **`:481`** and **`:499`**. Sizing logs at **`:610`**; the target gate at **`:1674-1676`**; net geometry at **`:1696`**; the sized signal at **`:1722`**. ⇒ **rounding at the `:481`/`:499` entry sits ahead of sizing and every downstream gate.** **One seam, all strategies, both classes.**

### A9 — ⛔ THE GUARDS THAT VALIDATED THE GEOMETRY RUN **UPSTREAM** OF THAT SEAM
`applyGlobalGuards` is called **inside each strategy** — `adaptive-flow:181`, `defensive-hedge:242`, `volatility-edge:193`, and the rest — i.e. **before the signal ever reaches the orchestrator.** ⇒ **the geometry that was validated is not the geometry that ships.** ★ **This is Kyle's re-check, and it is a correctness requirement rather than a precaution.** `validateStopDistance` and `validateRR` re-run post-rounding.

### A10 — THE FLOOR ALREADY EXISTS (§9.5(b-ii) — this would have been filed as a defect without the ledger search)
`strategy-helpers.ts:25` **`MIN_STOP_DISTANCE_BPS: 30`** — 0.3%, **GUARD-1, Batch 18J**, raised 20→30 on 4-LLM consensus; enforced at `validateStopDistance:352-355`. ⇒ **a minimum stop distance is not a new mechanism and must not be proposed as one.** **Away-rounding can only widen, so it can never breach this floor.**

### A11 — BASIS: `tick_size`, NOT `pairDecimals`
All 1,437 pairs reconciled: `10^-pair_decimals == tick_size` for **1,433**; **4 disagree** (`CELRUSD`, `REQUSD`, `VTHOUSD`, `WINUSD`) where the decimals permit one digit finer than the tick. **None traded ⇒ latent.** ⇒ **the existing `venue-validate.ts:94` decimals basis must not be carried upstream.**

---

## 4. IMPLEMENTATION PLAN — every item back-references its finding

| # | item | from | notes |
|---|---|---|---|
| **P1** | **Round at the orchestrator seam (`:481`/`:499`), basis `tick_size`, direction by price role** — entry nearest, stop and target away from entry; short branch **refuses and raises**; missing-leg triple **refused**, never defaulted to long | **A8, A11**, scope §5 | side derived from ordering; no new field on `StrategySignal` |
| **P2** | **Re-run `validateStopDistance` + `validateRR` AFTER rounding** | **A9** | Kyle's re-check, restored as correctness |
| **P3** | **`volatility-edge` target rounds TOWARD entry** (it is a `Math.min` ceiling) — one bit at one site | scope §5 (Langston) | the single cap; all others are floors |
| **P4** | **Rounding-rejection taxonomy into `signal_eval_archive.reject_stage`**, two kinds recorded separately, rate against admits, **no threshold** | scope OBJ-7b | live table verified: `reject_stage` + `gate_decision` jsonb, ~7.0M rows/3d |
| **P5** | ⛔ **OHLC writer: KEEP the splice at `:108`; on failure PREPEND the rows back.** Bounded retry + bounded buffer, degrade loudly. All classes | **A4, A5, A6** | ⚠️ **diverges from Langston's max-by-arrival — he rules** |
| **P6** | **Add `venue-validate` to the SIM** | **A1** | governance gap, not optional |
| **P7** | **System Manual content update: venue price representability** | **A2** | §9 rule 3 |
| **P8** | **Per-strategy cost split**, away-rounding, `volatility_edge` separate, reported per side | Langston's outstanding ask | owed before implementation closes |

⛔ **`UNAUDITED`: none.** Every item above traces to a finding in §1–§3.

---

## 5. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The fix this batch had written down for the data-loss bug **was wrong, and the audit caught it before any code was written.** The writer empties its queue *before* trying to save, and I had read that as the bug. It is actually what keeps two simultaneous saves from colliding — **so the fix as scoped would have traded a known bug for a new one.** The correct change is to leave the emptying alone and simply **put failed rows back at the front of the queue**, which also preserves a rule shipped in an earlier hotfix rather than replacing it.

**Two things the governance documents do not know.** The component that talks to the live exchange **is not in the System Impact Map at all**, and the System Manual **says nothing about whether our prices can exist on the exchange** — it documents what they mean, not whether they are real. Both get fixed in this batch.

**And a check that saved a false alarm:** the minimum stop distance I nearly proposed **already exists** and has since Batch 18J.

**The plan** is eight items, each traceable to something the audit found: round at one place, re-check the geometry afterwards, one special case for the one strategy whose target is a ceiling, record the rejections, fix the writer correctly, and update the two governance documents.

**One honest limit:** this step is supposed to have a second reader look at the mechanism claims independently. **That was not done** — this session is instructed not to spawn one — so everything here rests on my own re-derivation at the reference commit.
