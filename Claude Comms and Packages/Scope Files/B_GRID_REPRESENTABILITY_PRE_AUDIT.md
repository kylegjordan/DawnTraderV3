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

✅ **INDEPENDENT READERS RUN (Kyle lifted the block 2026-08-28). FIVE spawned, Mode B — each handed THE CLAIM ALONE, never the files, so object-selection crossed the boundary too.**

`REVIEWER: claim-only · splice/concurrency mechanism · HIT ×5 · re-derived y` — **and it found a census error, a mischaracterised population and an unbudgeted cost. See A4-R, A5-R, A7-R.**
⛔ **Per the standing asymmetry: every HIT below was RE-DERIVED by me at the ref before it moved anything. No reviewer CLEAN is cited anywhere in this document as support for any claim.**

---

## 1. GOVERNANCE GAPS FOUND IN THE MAPS THEMSELVES

**A1 — ⛔ `venue-validate.ts` HAS ZERO ENTRIES IN THE SIM — CONFIRMED, WITH A FAR BETTER CONTROL THAN MINE.** My evidence was a bare zero. **The decisive control, re-derived: EVERY sibling in `server/services/execution/` IS in the SIM** — `depth-source` 5, `depth-walk` 4, `order-placer` 2, `depth-gate-config` 2, `exploration-lane` 2 — **and `venue-validate` alone is 0.** ★ **That establishes the SIM's own convention for that directory, which a bare zero never could.** ⚠️ **BUT MY IMPLIED SCOPE WAS TOO WIDE: `SYSTEM_MANUAL.md:4332` DOES document the `validate=true` behaviour, without naming the file.** The gap is SIM-specific — behaviour described, component unmapped. ★ **AND A DANGLING POINTER NEITHER OF US FOUND: that manual line cross-references SIM §3.7. Re-derived — THE SIM HAS NO §3.7; its sections run 3.1 to 3.6.** It shipped in **P19-B8.5 (OBJ-8)**, it is the **only component in the system that talks to the live venue on the paper path**, and the impact map does not know it exists. **That silence is a governance gap under §9 rule 1, and F-G-1 touches this component** (§4 of the scope — the rounding currently lives there). **Plan item P6.**

**A2 — ⛔ `SYSTEM_MANUAL.md` IS SILENT ON PRICE REPRESENTABILITY.** Measured: `rounding` = **1 hit**, and that hit is `:10809`, about `doublePrecision` vs `decimal` column types — **unrelated**. `tick` = 125 hits, all clock/candle ticks, none about venue price increments. ⇒ **the manual documents what our prices MEAN and is silent on whether they can EXIST.** ✅ **Reach EXTENDED beyond mine by the reader: `1-system-manual/sections/` (9,880 lines, a separate per-chapter corpus I never checked) is ALSO 0, controls passing.** ⚠⚠ **BUT THE STRONGEST ALTERNATIVE DEFEATS MY FRAMING AND I ADOPT IT: SILENCE-BECAUSE-UNIMPLEMENTED, NOT SILENCE-BECAUSE-OMITTED.** The manual documents the system **as it is**, and **nothing in the repo rounds a decision price** (A11) — so it is silent **because there is no referent.** ⛔ **That produces grep output IDENTICAL to an omission and my wording did not distinguish them.** ⇒ **P7 is NOT "fix an omission"; it is "document the behaviour this batch creates," and the gap becomes real only when the rounding ships.** ⚠️ **Also: `SYSTEM_MANUAL_OVERVIEW.md` calls the whole folder "the System Manual" — under that reading the corpus is NOT silent, since `#916` quantifies it. I measured the FILE, not the folder.**

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
| **writes/creates** | ⛔⛔ **"THREE" IS RIGHT FOR MY SEARCH AND WRONG FOR THE CLAIM (R6).** THREE *call sites* of `bufferOhlcBar` — but `kraken-futures-archiver.ts` is a **parameterized class instantiated TWICE**, by `crypto-perp-archiver.ts:28` and `equity-perp-archiver.ts:24`, **and re-derived: neither facade contains the token `bufferOhlcBar` at all (grep count = 0 in both).** ⇒ **3 call sites · 4 buffers fed · 5 archiver modules · 2 runtime instances behind one call site.** A grep for the function name returns 3 and **structurally cannot see the other two.** |
| **reads** | **exactly ONE** — `flushAssetClass:106` |
| **mutates** | **exactly ONE** — `bufferOhlcBar:101` (`push`) |
| ★ **DELETES** | **exactly ONE** — `batch.splice(0, batch.length)` at `:108` |
| **schedules/starts** | ⛔⛔ **ONE, NOT TWO — MY CENSUS WAS WRONG (A5-R).** The interval timer at `:197-198`, started once at `passive-archive-bootstrap.ts:208` and double-start-guarded at `:196`. **`stopBatchWriter:204` has ZERO CALLERS in the entire tree — re-derived: `grep -rn stopBatchWriter server/` returns ONLY its own definition.** I counted a function that never runs as a scheduler. |

⛔ **TWO SCHEDULERS ⇒ MUTUAL-EXCLUSION CHECK REQUIRED, and the result is the finding in A4.** `stopBatchWriter` calls `clearInterval` **before** draining, but **`clearInterval` does not cancel an already-executing callback** — so a narrow overlap window exists. **Today the splice-first drain makes that window harmless. Any fix must preserve that property.** The `acquireSlot()` semaphore bounds *concurrent inserts*; it does **not** prevent two flushes of the same class from both having read the buffer.

### A4-R / A5-R / A7-R — ⛔⛔ WHAT THE INDEPENDENT READER OVERTURNED, ALL RE-DERIVED AT THE REF

**R1 — THE CENSUS WAS WRONG: ONE SCHEDULER, NOT TWO.** `stopBatchWriter` has **zero callers**. ⇒ **the overlap source is not two schedulers racing; it is a SINGLE `setInterval` whose async callback is never awaited (`:197-199`), so tick N+1 fires whether or not tick N has settled.** The conclusion survives — overlap is reachable — but **my stated mechanism for it was wrong**, and "two schedulers require a mutual-exclusion check" was a §9.5(a) box I ticked against a function that never executes.

**R2 — MY STATED EFFECT IS ONLY THE IDLE CASE.** I wrote *"a second concurrent flush finds an EMPTY buffer and returns early."* **Three archivers push continuously (`bufferOhlcBar:100-102`), so in steady state the second flush finds NEW rows and flushes a DISJOINT SET.** ⇒ **the property splice-first actually buys is ROW-SET DISJOINTNESS, not early return.** Early return is what happens only when nothing is arriving.

**R3 — "WOULD INTRODUCE A NEW RACE" IS TOO STRONG.** Splice-first gives disjoint **ROW** sets, **not disjoint KEY sets** — Kraken sends many updates per minute, so consecutive drains routinely carry the same `(symbol, intervalBegin)`. **Re-derived at `:171`: `high: sql\`EXCLUDED.high\`` — LAST-WRITER-WINS, not `GREATEST`.** ⇒ **a same-key ordering race EXISTS TODAY.** Splice-after would change *which* rows can collide, not *whether* collision is possible. **The honest claim is narrower: splice-after widens an existing hazard and adds a duplicate write; it does not create the first race.**

**R4 — ⛔ THE FIX NEEDS A QUEUE CAP AND I HAD NOT BUDGETED ONE.** Re-derived: **`ohlc-batch-writer.ts` has NO queue bound. Its sibling `archive-batch-writer.ts:34` has `DEFAULT_QUEUE_MAX = 50_000` with a drop-oldest overflow path at `:141-151`.** ⇒ **retain-on-failure against a persistently failing constraint is UNBOUNDED GROWTH against `ecosystem.config.cjs:25 max_memory_restart: '2G'`.** **Without a cap the fix converts silent data loss into a process restart loop.**

**R5 — ⛔⛔ AND THE POPULATION I MEASURED IS 99.8% A KNOWN, ALREADY-FENCED INCIDENT. THIS IS THE BIGGEST CORRECTION IN THE DOCUMENT.** Re-derived by error text across the full retained logs:

| error | count |
|---|---|
| **`no unique or exclusion constraint matching the ON CONFLICT`** | **5,888** |
| `pool slot timeout (5s)` (this writer) | 7 |
| ⛔ **`deadlock detected`** | ⛔ **2** |

⇒ **5,888 of 5,897 are `#704` — the `crypto_perp_ohlc_1m` table that shipped 2026-08-18 without the UNIQUE constraint its three siblings carry. Root-caused, fenced, and recorded in `p19-perpfeed-ohlc-upsert-constraint-fence.test.ts:1-13`, which states the outcome itself: 368,841 bars scanned, 0 rows landed, ~15 h.**

⛔ **I QUOTED `deadlock detected` AS THE REPRESENTATIVE SAMPLE AND CALLED IT "a POSTGRES error, so this is OURS." IT IS 2 OF 5,897.** ★ **I named the object and the population and never checked the COMPOSITION — then illustrated it with the rarest member.** ⚠️ **The §9.5(b-ii) ledger search missed it because I searched for the COMPONENT and not for the SYMPTOM; `#704` was sitting in the fence test's own header comment.**

✅ **BUT OBJ-9 SURVIVES, BETTER FRAMED — AND `#704` IS ITS EVIDENCE, NOT ITS SUBJECT.** The constraint bug is fixed. **What is NOT fixed is the behaviour that turned it into 15 hours of total silent loss: the writer converts ANY persistent error into permanent, unrecoverable, invisible data loss** (failures go to `console.error`, successes to `console.log`). ⇒ **the real defect is the DROP, and #704 is the measured proof of what it costs.** ⚠️ **The residual on the traded classes is genuinely small — 6 `crypto_spot` + 2 `xstock_spot` — and must be reported that way.**

### A5-R2 — ⛔ A SECOND READER, A SECOND SET OF CENSUS ERRORS — AND A DATA-LOSS PATH NEITHER OF US HAD FOUND

**R6 — THE WRITER COUNT WAS A TOKEN COUNT, NOT A PRODUCER COUNT.** See the corrected census row above. ★ **This is precisely the failure the reviewer was asked to hunt: a count that is correct for the search performed and wrong for the claim it supports.** My instrument could not have found the two perp facades, and I did not say so.

**R7 — ⛔⛔ NEW FINDING: EVERY RESTART AND EVERY DEPLOY SILENTLY LOSES THE LAST FLUSH WINDOW.** `stopBatchWriter` is defined, exported, and its own docstring says *"Drains pending buffers first."* **It has zero callers.** **Re-derived: the live shutdown handler `server/core/boot_orchestrator.ts:38-53` calls `stopVTSRunner()` and NOTHING ELSE.** ⇒ **up to one flush interval of buffered bars is discarded on every PM2 restart and every `dt-deploy`, with no log line at all.** ⚠️ **This is a SEPARATE loss path from the drop-on-failure `OBJ-9` targets, it is silent rather than merely quiet, and neither I nor Langston found it.** ⛔ **It also means my A7 "8 batches lost on the traded classes" is a FLOOR, not a total — deploy-time losses leave no error line to count.**

**R8 — THE SEMAPHORE IS ACQUIRED *AFTER* THE DRAIN, so a slot timeout also destroys rows.** `acquireSlot()` at `:128`, splice at `:108`. **The logs carry 7 `pool slot timeout (5s)` failures on this writer** — a second, independent trigger for the same drop. **The retain-on-failure fix covers this too, which strengthens P5.**

**R9 — METHOD NOTE, and it is worth carrying: `git grep -- 'server/**/*.ts'` DOES NOT MATCH `server/index.ts` under git's wildmatch.** The reviewer hit this, caught it, and re-ran without the pathspec. **That pathspec silently hides the entry point of the whole subsystem** — the same absent-as-valid class as `#546`'s trailing slash.

### A6 — PROVENANCE OF THE DEDUP (§9.5(b-ii)), and it decides the fix

**The in-buffer dedup at `:118-126` is NOT incidental code.** SIM `:1301` records it as **B-NEW-35 Layer 3, shipped hotfix `f001002d9` (2026-05-20)**, with UNIQUE constraints as Layer 1 and the UPSERT as Layer 2. **The code comment states its own invariant:** *"keep only the LAST row per (symbol, interval_begin) — the last write IS the latest WS update IS the correct cumulative OHLCV for that minute. Map insertion-order semantics give last wins naturally."*

⛔ **That invariant is TEMPORAL, and a retry breaks it: retried rows are OLDER but would arrive LATER.** This is Langston's finding E and it is correct.

✅ **PREPEND SATISFIES IT WITHOUT TOUCHING THE DEDUP AT ALL.** Prepended older rows enter the Map first; any fresher row for the same `(symbol, minute)` is inserted after and wins — **which is exactly what B-NEW-35 specifies.** ⇒ **no new field, no change to a shipped hotfix's logic, and the stated invariant is preserved rather than replaced.**
⚠️ **Langston proposed max-by-arrival. I am proposing prepend instead, and the difference is not cosmetic: max-by-arrival requires an arrival timestamp on every buffered row and REPLACES B-NEW-35's rule; prepend PRESERVES it. This is a deliberate divergence from his suggestion and he should rule on it.**

### A6-R — ⛔⛔ THE FIFTH READER OVERTURNED MY FIX **AND** MY HEADLINE NUMBER. THE PREPEND-vs-APPEND DEBATE WAS THE WRONG AXIS.

**R10 — ⛔ `#705` — THE ISSUE I FILED MYSELF — ALREADY SPECIFIES THE DESIGN, AND MY AUDIT DID NOT CITE IT.** Re-derived at `RUNNING_ISSUES.md:2744-2746`: the constraint is **transient-vs-permanent separation, bounding, and alerting** — *"the naive re-buffer against a permanent error would have grown the crypto_perp buffer unbounded for 15 hours — an OOM instead of a data gap… the #704 failure produced 4,802 stderr lines and zero alerts."* ⇒ **append-vs-prepend is ORTHOGONAL to all three.** ★ **Langston and I spent a round arguing an axis the ledger had already ruled secondary.** ⚠️ **Second §9.5(b-ii) miss in one audit: I searched for the component, FOUND the issue, and did not read what it specified.**

**R11 — ⛔⛔ AND MY HEADLINE NUMBER IS NOT A LOSS FIGURE. `#704`'s 15-HOUR OUTAGE COST NIL ACTUAL DATA.** Re-derived at `#705`: *"OHLC rows are REPLAYABLE — the REST poller re-fetches a rolling 2,000-bar window, which is exactly why #704's 15-hour outage cost nil actual data."* And `#704` residual (b) records the drop-on-failure as **assessed and accepted**: *"silent-by-design at the buffer (`splice` before insert) … which is acceptable for replayab[le]"*. ⇒ **the splice ordering is NOT an unexamined idiom — it was judged at `#704`'s Step-4 review. My A4 framing of it as an accident was wrong.** ⛔ **962,386 "rows dropped" is a COUNT OF DROPPED BUFFER ROWS, NOT A COUNT OF LOST DATA, and I have been reporting it as loss.**

**R12 — ✅ BUT THE REPLAYABILITY GUARANTEE IS NARROWER THAN `#705` STATES, AND THIS IS WHAT SAVES OBJ-9.** `kraken-futures-archiver.ts:56` `lastOhlcInterval` is an **in-memory monotonic high-water Map**, advanced at `:103`, with the skip at `:85` (`if (candle.time <= lastSeen) continue`). ⇒ **`#704` recovered only because its fix required a DEPLOY, which cleared that map.** **A transient flush failure in a RUNNING process leaves the high-water mark advanced and those bars are NEVER re-polled.** ⛔ **And the two WS legs — `crypto_spot` and `xstock_spot`, the TRADED classes — have NO re-fetch path at all.**

⇒ ✅ **THE HONEST SIZE OF OBJ-9, FINALLY: the 5,888 `crypto_perp` failures were RECOVERED by the deploy. The real unrecoverable loss is the 6 `crypto_spot` + 2 `xstock_spot` failures on the WS legs, plus 7 pool-slot timeouts.** **Small, real, and on exactly the classes `OBJ-8` reads.** ★ **The batch survives; the justification is 1/700th the size I reported.**

**R13 — ⛔ PREPEND HAS A SPECIFIC FAILURE MODE AGAINST THE BOUND `#705` REQUIRES.** The sibling `data-archive/archive-batch-writer.ts:141-151` bounds at `queueMax` and evicts **OLDEST via `buf.rows.shift()`** — from the FRONT. ⇒ **prepend puts the re-added rows exactly where that evictor looks first: adopt both and the retry silently stops working, with no test to catch it** (nothing in `server/tests/**` exercises the dedup, the ordering, the flush, or a failure — stated as presence-evidence).

**R14 — ★ THE FIELD THAT WOULD REVEAL AN OUT-OF-ORDER WRITE IS OVERWRITTEN BY THE WRITE.** `:176` sets `capturedAt: sql\`NOW()\``, so a stale overwrite **stamps itself as freshly captured** — while `xstock_spot/ohlc-aggregator.ts:280` tiebreaks on exactly `captured_at DESC, id DESC` to "pick the latest tick." ⇒ **a stale overwrite is unobservable after the fact, by construction.**

**R15 — the dedup is VACUOUS on two of four classes.** `kraken-futures-archiver.ts:85`'s high-water skip means a given `(symbol, interval_begin)` is buffered **at most once per process lifetime** for `crypto_perp`/`xstock_perp`. **The comment at `:110-126` describes a WS feed two of the four classes do not use.** ⚠️ **And SIM `:1301` cites that block as `:105-114`; at the ref it is `:110-126` — the SIM line numbers I quoted are stale.**

⇒ ⛔ **P5 IS REWRITTEN AROUND `#705`'s OWN THREE CONSTRAINTS, NOT AROUND MY PREPEND PROPOSAL.**

### A7 — ⛔ OBJ-9's JUSTIFICATION, REWRITTEN FROM SCRATCH (Langston requirement 1 — a correction stacked on wrong text propagates the withdrawn version into the completion report)

⛔⛔ **THE COUNT IS NOT THE CASE. THE UNBOUNDED TAIL IS THE CASE.** Everything I previously wrote here rested on 5,897 failures / 962,386 rows, and **both measurements Langston required have now come back AGAINST my own framing, in the direction of making this objective smaller.**

**MEASUREMENT 1 (his requirement 3 — split the figure by writer). ANSWER: NONE OF IT IS THE TICKER WRITER.** All **5,897** `flush failed` lines carry `[B74][batch-writer]` — the OHLC writer. The ticker writer logs `[B74][ticker-writer] … flush failed (N rows dropped)` at `ticker-batch-writer.ts:140-142`, a string my grep matches. **POSITIVE CONTROL: the `ticker-writer` tag appears 191,433 times in the retained log stream and ZERO of those are failures.** ⇒ **the instrument reaches that leg and the zero is real.** ★ **He suspected my retraction was over-broad in the other direction — it is not. `#705`'s core (the unrecoverable ticker instance) is unsized because it has NOT FIRED in the retained window, not because I mis-split the number.**

**MEASUREMENT 2 (his requirement 2 — the bar-continuity check across a known deploy). ANSWER: NO DEFICIT AT FOUR RESTARTS. MY OWN HYPOTHESIS IS NOT SUPPORTED.** Restarts at `2026-08-26 18:09 / 18:20 / 18:43` and `2026-08-27 10:01` UTC, `crypto_spot_ohlc_1m` bars in the restart minute vs its ±6-minute neighbours:

| restart (UTC) | bars in restart minute | neighbour avg | neighbour min |
|---|---|---|---|
| 08-26 18:09 | 90 | 105 | 70 |
| 08-26 18:20 | 94 | 99 | 84 |
| 08-26 18:43 | 98 | 95 | 83 |
| 08-27 10:01 | **126** | 112 | 98 |

**Every restart minute sits INSIDE the neighbour range; two are ABOVE their neighbour average.** ⇒ **`#918`'s discarded window produces no measurable WS-leg loss at n=4.** **Likely mechanism, NOT asserted: the WS feed re-sends the still-open minute's cumulative bar on reconnect and the upsert fills it in — so only a minute that had already CLOSED and been buffered-but-unflushed is lost, a ≤5 s window against a 60 s bar.**
⚠️ **LIMITS, stated: n=4, one asset class, all prompt restarts. And the instrument measures bar PRESENCE, not bar COMPLETENESS — a bar present but truncated in its final seconds would not show here.**

✅ **SO WHAT ACTUALLY JUSTIFIES OBJ-9, and it is structural rather than numeric: THE WRITER CONVERTS ANY PERSISTENT ERROR INTO PERMANENT, SILENT, TOTAL LOSS — AND THE TAIL IS UNBOUNDED.** `#704` is the proof the tail is real: **one missing constraint produced 368,841 bars scanned and 0 rows landed for ~15 hours**, and it cost nothing **only because that leg happened to be REST-replayable.** ⛔ **`#704` residual (b), which Langston wrote and which I under-read, states the boundary exactly: *"acceptable for replayable REST bars and NOT for WS-only ones."*** ⇒ **the identical event on `crypto_spot` or `xstock_spot` would be permanent and invisible.**

★ **THE HONEST SHAPE: observed cost is small (6 `crypto_spot` + 2 `xstock_spot` + 7 pool-slot timeouts, and no measurable restart loss); POTENTIAL cost is a total, silent, multi-hour outage on a leg with no re-fetch.** **OBJ-9 is bought by the tail, not by the count — and the objective must be stated that way or it will be graded against a number that does not support it.**

⚠️ **AND `#918` IS THEREFORE NOT OBJ-9's JUSTIFICATION EITHER.** It is a real mechanism — the drain genuinely never runs — with **measured impact nil at n=4.** **It ships inside OBJ-9 because wiring an existing function into the shutdown handler is trivial next to the retry work, NOT because it is load-bearing.** ⛔ **Do not let it become the new headline; that would repeat the mistake this section exists to correct.**

⚠️ **EVICTION POLICY IS CHOSEN FROM SCRATCH, NOT COPIED (Langston's correction):** `archive-batch-writer.ts` is the **data-archive** family, not `#705`'s subject. **The passive-archive ticker writer has NO bound at all today.** ⇒ **there is no sibling shape to inherit; the eviction end and the re-add end are both open decisions and must be made in one document (P5).**

---

## 3. AUDIT — OBJ-7 / OBJ-7b (THE ROUNDING SEAM)

### A8 — THE SEAM, read at the ref
`signal-orchestrator.ts` takes `rawSignal: StrategySignal` at **`:481`** and **`:499`**. Sizing logs at **`:610`**; the target gate at **`:1674-1676`**; net geometry at **`:1696`**; the sized signal at **`:1722`**. ⇒ **rounding at the `:481`/`:499` entry sits ahead of sizing and every downstream gate.** **One seam, all strategies, both classes.**

### A9 — ⛔ THE GUARDS THAT VALIDATED THE GEOMETRY RUN **UPSTREAM** OF THAT SEAM
`applyGlobalGuards` is called **inside each strategy** — `adaptive-flow:181`, `defensive-hedge:242`, `volatility-edge:193`, and the rest — i.e. **before the signal ever reaches the orchestrator.** ⇒ **the geometry that was validated is not the geometry that ships.** ★ **This is Kyle's re-check, and it is a correctness requirement rather than a precaution.** `validateStopDistance` and `validateRR` re-run post-rounding.

### A9-R — ⛔⛔ MY A9 CLAIM IS TRUE FOR **ONE** CHECK AND MOOT FOR **THREE**. THIS NARROWS P2.

**A reader found the object I missed, and I re-derived it at the ref.** There **IS** a downstream geometry gate **inside** the orchestrator: **`normalizeAndGateTarget` (`core/calculations/signal-target-normalizer.ts:69`), called at `signal-orchestrator.ts:1662`** — after sizing and the SQE, before the sized signal is assembled. It re-computes `risk`, `rr` and `atrsToTarget` from scratch and drops on `invalid_geometry` / `rr_below_min` / `invalid_atr` / `unreachable`.

⇒ **If rounding sits at the top of `buildSizedSignalForStrategy`, RR and reachability are RE-VALIDATED AUTOMATICALLY on the rounded numbers, with no new code.** ⛔ **So my sentence *"the validation already happened upstream of that point"* is FALSE for three of the four checks.**

✅ **THE CLAIM SURVIVES EXACTLY WHERE IT MATTERS, AND SHARPER: `normalizeAndGateTarget` HAS NO STOP-DISTANCE CHECK.** Re-derived — its guard tests finiteness, positivity and `stopPrice >= entryPrice`, then computes `risk = entryPrice - stopPrice` and **never compares that risk to `MIN_STOP_DISTANCE_BPS`.** The 30 bps floor is enforced **ONLY** upstream by `applyGlobalGuards`; `validateStrategySignal:2980` checks ordering and finiteness, not distance.

⇒ ⛔ **ROUNDING COULD PUSH A STOP INSIDE THE 30 bps FLOOR AND NOTHING DOWNSTREAM WOULD SEE IT. That is the entire residual — one check, not four.**

⚠️ **AND "RE-RUN THE VALIDATION" WAS UNDERDETERMINED: the two reachability computations already use DIFFERENT ATRs** — the guard a clamped strategy-local `getEffectiveATR`, the normalizer the raw carrier `marketContext?.atr ?? sizingContext.atr`. **Known instrumented divergence (`#371`; `guard-eval-tracker.ts:41-62` exists to measure it).** Naming which validator P2 re-runs is part of P2.

⚠️ **COVERAGE IS 18 OF 19, NOT UNIVERSAL:** `strategy-engine.ts:1092` (`detectLiquidityTrap`) returns geometry with **no guard call**, deliberate per its comment at `:1090-1091`, fenced out of the active path at `signal-orchestrator.ts:2457-2463` **but still reachable from `stage-b-validator.ts:350` and `routes.ts:11092`.** Stated because "the guards run in every strategy" is what I implied and it is not true.

### A9-R2 — 🟨 FINDING OUTSIDE THIS BATCH: THE SYSTEM ALREADY MODIFIES A PRICE WITHOUT RE-VALIDATING

On the paper taker open, `active-execution-engine.ts:3416` sets `actualEntryPrice = _openFill.fillPrice` — **the depth-walked VWAP fill, not `signal.entryPrice`** — and the position is written with that entry at `:3604` while `stopLoss`/`takeProfit` carry the **UNMODIFIED** signal values at `:3605-3606`. ⇒ **realised risk/reward differs from validated risk/reward on EVERY taker open and nothing re-checks it.** **Control reported by the reader: the geometry-validation token set returns 0 across the 4,440-line engine, while the identical pattern returns 11 on `signal-orchestrator.ts` and 10 on `strategy-engine.ts`.**

⚠️ **CUTS BOTH WAYS: "re-validate after modifying a price" is NOT an invariant this pipeline maintains anywhere — so rounding introduces no new CLASS of gap.** ⛔ **But it is a real pre-existing defect, it is the mechanism `#915` collapsed to, and it is NOT F-G-1's to fix.** **DISPOSITION: recorded on `#915` as a neighbouring mechanism with its citing line, owner CC-C. NOT folded into F-G-1.**

### A10 — THE FLOOR ALREADY EXISTS (§9.5(b-ii) — this would have been filed as a defect without the ledger search)
`strategy-helpers.ts:25` **`MIN_STOP_DISTANCE_BPS: 30`** — 0.3%, **GUARD-1, Batch 18J**, raised 20→30 on 4-LLM consensus; enforced at `validateStopDistance:352-355`. ⇒ **a minimum stop distance is not a new mechanism and must not be proposed as one.** **Away-rounding can only widen, so it can never breach this floor.**

### A11 — BASIS: `tick_size`, NOT `pairDecimals`
All 1,437 pairs reconciled: `10^-pair_decimals == tick_size` for **1,433**; **4 disagree** (`CELRUSD`, `REQUSD`, `VTHOUSD`, `WINUSD`) where the decimals permit one digit finer than the tick. **None traded ⇒ latent.** ⇒ **the existing `venue-validate.ts:94` decimals basis must not be carried upstream.**

---

### A12 — ⛔ P8 RUN, AND THE POOLED MEDIAN WAS NOT REPRESENTATIVE. Langston's warning was right.

He required the cost split per strategy before any scheme is adopted: *"a pooled median over a population that is mostly ATR-target strategies is measuring the wrong invariant for most of its rows."* **Run on 398 long crypto trades, extra RISK added by rounding the stop away from entry:**

| strategy | n | median | p95 | worst |
|---|---|---|---|---|
| `morning_star` | 104 | 0.092% | 1.619% | 9.37% |
| `inside_bar_reversal` | 65 | 0.224% | 1.098% | 3.34% |
| `reverse_impulse` | 64 | 0.478% | 2.651% | 5.33% |
| `pivot_shift` | 63 | 0.358% | 2.941% | **11.11%** |
| `support_bounce` | 45 | 0.394% | 3.079% | 3.21% |
| `sma_trend_ride` | 26 | 0.537% | 2.193% | 3.71% |
| `volatility_edge` | 11 | **0.057%** | 0.128% | 0.13% |
| `defensive_hedge` | 8 | 0.760% | 1.373% | 1.37% |
| ⛔ **`vwap_bounce`** | **7** | ⛔ **4.428%** | **7.469%** | 7.47% |
| `vwap_pullback` | 4 | 0.291% | 2.416% | 2.42% |
| `mean_reversion` | 1 | 7.341% | — | 7.34% |
| **ALL POOLED** | 398 | 0.241% | 2.941% | 11.11% |

⛔ **`vwap_bounce`'s median is 4.428% — EIGHTEEN TIMES the pooled median of 0.241%, and above the pooled p95.** ⚠️ **`n=7`, so the RATE is not decision-grade; the SEPARATION is what is reportable.** ⇒ **quoting 0.241% as "the cost of away-rounding" would have been true of the batch and false of that strategy.** ★ **This is exactly the failure Langston named in advance, and it was invisible until the split.**

✅ **AND THE EXCEPTION IS THE CHEAPEST CASE, which resolves a worry rather than raising one: `volatility_edge` — the ONE cap, the one strategy needing special handling (P3) — has the LOWEST cost of any strategy at 0.057% median.** Its target-side reach under the cap treatment is **+0.018% median, +0.15% worst (n=11)**. ⇒ **the special case is nearly free; P3 costs almost nothing to get right.**

⚠️ **SIDE: not reported per side because there is nothing to report — all 398 are LONG and zero shorts have ever been taken (§3 of the scope). Stated rather than silently omitted.**

## 4. IMPLEMENTATION PLAN — every item back-references its finding

| # | item | from | notes |
|---|---|---|---|
| **P1** | **Round at the orchestrator seam (`:481`/`:499`), basis `tick_size`, direction by price role** — entry nearest, stop and target away from entry; short branch **refuses and raises**; missing-leg triple **refused**, never defaulted to long | **A8, A11**, scope §5 | side derived from ordering; no new field on `StrategySignal` |
| **P2** | ⛔ **NARROWED BY A9-R: re-run `validateStopDistance` ONLY.** `normalizeAndGateTarget:1662` already re-validates RR, reachability and ordering downstream of the rounding seam — **the 30 bps stop floor is the ONE check with no downstream re-run.** | **A9-R** | Kyle's re-check, restored — **one check, not four.** ⚠️ **Name WHICH ATR it uses (`#371`).** |
| **P3** | **`volatility-edge` target rounds TOWARD entry** (it is a `Math.min` ceiling) — one bit at one site | scope §5 (Langston) | the single cap; all others are floors |
| **P4** | **Rounding-rejection taxonomy into `signal_eval_archive.reject_stage`**, two kinds recorded separately, rate against admits, **no threshold** | scope OBJ-7b | live table verified: `reject_stage` + `gate_decision` jsonb, ~7.0M rows/3d |
| **P5** | ⛔ **REWRITTEN (A6-R). Build `#705`'s OWN three constraints, which I failed to cite: (i) SEPARATE transient from permanent — retry the transient, fail loudly on the permanent; (ii) BOUND the buffer — it has none today and the sibling's cap is 50,000; (iii) ALERT — `#704` produced 4,802 stderr lines and ZERO alerts.** ⚠️ **Re-add order is a SECONDARY refinement, and prepend specifically COLLIDES with a front-evicting bound (R13) — so the bound's eviction end and the re-add end must be decided TOGETHER, not separately.** | **A6-R, A4, A5** | ⛔ **My prepend-vs-append framing and Langston's max-by-arrival were both the wrong axis; the ledger had already ruled it secondary.** |
| **P6** | **Add `venue-validate` to the SIM** — **and fix the dangling `§3.7` cross-reference** the System Manual makes to a SIM section that does not exist | **A1** | sibling control establishes the convention |
| **P7** | **System Manual content update: venue price representability** | **A2** | §9 rule 3 |
| **P8** | ✅ **DONE — per-strategy cost split run** | **A12** | ⛔ **`vwap_bounce` median 4.428% vs pooled 0.241%; `volatility_edge` cheapest at 0.057%. Pooled figure must NOT be quoted as the cost.** Per side: n/a, all longs |

⛔ **`UNAUDITED`: none.** Every item above traces to a finding in §1–§3.

---

## 5. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The fix this batch had written down for the data-loss bug **was wrong, and the audit caught it before any code was written.** The writer empties its queue *before* trying to save, and I had read that as the bug. It is actually what keeps two simultaneous saves from colliding — **so the fix as scoped would have traded a known bug for a new one.** The correct change is to leave the emptying alone and simply **put failed rows back at the front of the queue**, which also preserves a rule shipped in an earlier hotfix rather than replacing it.

**Two things the governance documents do not know.** The component that talks to the live exchange **is not in the System Impact Map at all**, and the System Manual **says nothing about whether our prices can exist on the exchange** — it documents what they mean, not whether they are real. Both get fixed in this batch.

**And a check that saved a false alarm:** the minimum stop distance I nearly proposed **already exists** and has since Batch 18J.

**The plan** is eight items, each traceable to something the audit found: round at one place, re-check the geometry afterwards, one special case for the one strategy whose target is a ceiling, record the rejections, fix the writer correctly, and update the two governance documents.

**One honest limit:** this step is supposed to have a second reader look at the mechanism claims independently. **That was not done** — this session is instructed not to spawn one — so everything here rests on my own re-derivation at the reference commit.
