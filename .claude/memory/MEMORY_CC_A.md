# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols live in `MEMORY.md`; stable governance in `CLAUDE.md`.
> **Cap: 200 lines / ~24KB — watch BYTES.** §3.1 discipline: the moment a batch CLOSES, collapse its blow-by-blow to ONE line pointing at the repo record. The completion report + scope files are authoritative; memory only needs a pointer.
> **PRUNED 2026-07-23** from **257 lines / 86.8KB — 3.6× over the byte cap**, the violation Kyle surfaced by asking. Closed batches below are one-liners BY DESIGN; do not re-expand them. Pre-prune backup is in this session's scratchpad.

---

## ▶ ACTIVE BATCH — B-RETIRED-SCORE-REMOVAL (#558). Step-2 audit, Langston APPROVED-TO-CONTINUE. **NO CODE CUT YET.**

**Kyle's decision: REMOVE EVERYTHING NOW**, control arms included. *"Even if the old system performed better than this system, the old system was not good. So we would have to start looking at what is a better way of ranking and scoring."* A new ranking/scoring design is a SEPARATE future effort, not #558.

**Kyle's mandate:** the batch's success rides on the DEPTH of the pre-implementation audit — the code end-to-end PLUS all historical sources (`bridge/canonical/`, the pre-governance batch reports, the completion reports, SIM, the Phase-19 active-trading-path audit, the original new-governance-era audit). Understand how it all flows together BEFORE proposing a deletion.

**Docs:** `Claude Comms and Packages/Scope Files/B_RETIRED_SCORE_REMOVAL_{SCOPE,PRE_AUDIT}.md` · audit commits `8a237a0f4` → `1c5cb3f5a`.

### THE SETTLED PHASE PLAN (Langston-ruled — the ORDER IS A CORRECTNESS CONSTRAINT, not a preference)
- **A0 — VTS convergence (PREREQUISITE GATE).** `vts-runner.ts:4947` → use `confidence` in place of `finalScore`, mirroring the active path's proven shape at `signal-orchestrator.ts:1798`; resolve the `:4929` `strength` input. **The removal CANNOT safely land while those still read the scores.**
- **A1 — core/crypto.** Make `final_score` **NULLABLE** *and* remove its writers (`ready_to_buy_service.ts:1151` reconfirm, `:2234` queue-insert) **IN THE SAME MIGRATION.** Plus `calculateFinalScore` + its 2 callers, the inline site, the shadow-gate block, the ranker collapse, the orphan cluster.
- **A2 — xStock** (`eval-cycle.ts:656` + `vts-real-score.ts:43/:209`) as its own slice.
- **B — DROP the column** (+ remaining bucket-B contracts).

### THE FINDINGS THAT CHANGED THE PLAN (all citations at origin)
1. **FIVE computation sites** (six counting a dead one), not one — incl. an **INLINED copy** at `ready_to_buy_service.ts:805-810` that no symbol search finds, xStock's own `computeFinalScore`, `calculateAdaptiveFinalScore`, and `computeRankingScore` consuming it.
2. **`score-calculator.ts` is MIXED** — `calculateFinalScore:44` retired, but `calculateRegimeWeight:146` (**LIVE 0.30 admission gate**) + `getPredictiveConfidence:191` live beside it. A region cut = the B8.10 over-scoop repeat. **Name collision:** a *different* `calculateRegimeWeight(candles)` at `multi-timeframe-scanner.ts:172`.
3. **★ `predictiveConfidence` SURVIVES** — `SQE:375` → `isSignalProfitable:378` + `getDynamicROIThreshold:380` → **real rejections**. Removing finalScore does NOT remove the inverted confidence input. **The inversion stays a Phase-25 item; the completion report must NOT claim #558 fixes it.**
4. **`ready_to_buy_service.ts:35` is a SHARED destructure, NOT a "dead import"** (Langston caught my loose label) — its other symbol is the live gate at `:868`. **Drop the SYMBOL, never the line.** `signal-orchestrator.ts:149` genuinely IS fully dead — do not treat them alike.
5. **★ VTS gate-4: "stores-not-ranks" HOLDS but is NOT the whole truth.** No gate/filter/sort on either score, BUT `vts-runner:4929` writes `hybridScore` as confluence `strength` and `:4947` **DERIVES** `hybridConfidence` from `finalScore`. Delete the writers → both keep being read with inputs gone, green CI: **#568 class.** Analyst adds `?? 0.5` makes it **absent-as-valid** (unobservable). Found by the state-write census, NOT caller-tracing.
6. **Three orphans, zero live callers:** `criteria-limiter.ts` (whole module), `applyGovernance`, `computePerformanceScore`. **★ The criteria-limiter one is a finding in itself:** it declares *"ranking is exclusively by FinalScore"* and promotes from a finalScore-ordered limit — **the scope's central premise was quoting DEAD CODE as live architecture.**
7. **Provenance (§9.5(b-ii)):** `SQE:338-347` records B8.5a retired the gate on Kyle-ratified consensus (`r=−0.140`, anti-predictive) and **deliberately kept computing + shadow-logging to a durable sink because the field-kill ruling was to come post-paper.** Kyle's decision is that ruling **ARRIVING EARLY**. **The completion report must CITE AND CLOSE that governed plan explicitly — not silently delete the block.**
8. **Client is already half-retired** — `paper-trade-adapter.ts:224-229/:312` fences deliberately omit both scores (#525); `vts-shared.tsx:381` records the B8.7 removal. **#558 finishes a retirement already in progress.**
9. **Q1 ranker COLLAPSE is safe** (Langston's condition, closed and independently re-read by him): `rankArm` is declared at `ready-to-buy-table.tsx:28` and **rendered nowhere**; `rankScore` is load-bearing and survives unchanged.

10. **★★★★ THE CENSUS FOUND A LIVE finalScore DECISION — MY SCOPE'S CENTRAL PREMISE IS FALSE.** `ready_to_buy_service.ts:2103-2114`, inside **`queueSQESignal`** (`:2071`): when a new SQE signal arrives for a symbol+strategy already queued, **finalScore is the TIEBREAKER** — `existing >= new` discards the NEW; else the EXISTING is `expireSignal(…'Replaced by higher-FinalScore SQE signal')`. **LIVE** — caller `signal-orchestrator.ts:1118`, and **it does NOT set `skipSelfCheck`** (Langston's lynchpin, which I missed), so the branch genuinely runs on first admission; the file calls it *"the SINGLE live RTB admission chokepoint"* (`:2132`). **Why everything missed it: a tiebreaker is a decision NOT shaped like a conditional-against-a-floor**, so my decision-shape sweep across 7 modules structurally could not match a signal-vs-signal compare. **⇒ NEW SWEEP PATTERN (Langston): "compared against another signal, not a threshold."** **⇒ A1 must REPLACE here, not delete.** **The trap:** `parseFloat(finalScore || '0')` on a removed column ⇒ **0** ⇒ every arrival beats every incumbent ⇒ the queue churns its whole contents on every duplicate, green CI, no error.
11. **★ Q7 SETTLED — replacement = `r_multiple` (option 1).** Verified computable on BOTH sides: `SQESignalInput.entryPrice`/`.stopPrice` are **REQUIRED numbers** and not-null on the stored row; target/di/dbs are optional and already kernel-tolerated; `assetClass` throws if absent. **No new absent-as-valid surface.** Needs a **shape adapter** (`signalRMultiple` takes the stored `RtbSignal` shape, the incoming side is `SQESignalInput`). `-Infinity` is the built-in explicit unpriceable sentinel (satisfies Langston's kill-the-`|| '0'`-coerce rule **by construction**) — but must NOT silently mean "new always loses": **explicit keep-first branch + counter.**
12. **★★ BUCKET-B LANDMINE — `telemetry_history` scoring columns store COST DATA.** `cost-telemetry.ts:109-113` writes `finalScore=totalCost`, `hybridScore=avgFee`, `regimeWeight=avgSlippage`, `predictiveConfidence=avgSpread`; reads back `:184-213`. **⇒ HARD RULE: `telemetry_history` scoring columns are NOT in the drop set** — keep-as-data with a live second tenant. Dropping them as "unused scoring" silently destroys cost telemetry. *(Whether the overload is itself a defect = §13, NOT #558.)*
13. **Third name collision:** `unified-core.ts:443/458/475/499` computes `finalScore` from awareness/autonomy/oversight/ethical-compliance — **AI self-assessment, EXCLUDE.** ⇒ the symbol sweep must be reviewed BY HAND.
14. **⚠️ A SEVENTH formula, NOT orphaned — OPEN:** `trading-engine.ts:241` `signal.finalScore = confidence×0.7 + goalAlignment×0.3`, and `TradingEngine` **IS imported by 6 live sites** (`routes.ts:10/:14704`, `command-router:3`, `intent-executor:243/:482`, `config-change-handler:53`, `pre-execution-validator:3`). **Import-reachability ≠ execution-reachability.** MUST be settled before A1 touches it — do not guess in either direction.

### MY OWN ERROR, CORRECTED FIRST
Scope claimed `rtb_signals.final_score` was dropped at #555. **FALSE** — #555 dropped `regime_weight`/`hybrid_score`/`decay_penalty`; `final_score` survives and is **`.notNull()`** (`schema.ts:1943-45`). Would have hidden the largest data contract and mis-planned a NOT-NULL drop as a no-op.

### ★ AND THE SELF-CONTRADICTION LANGSTON CAUGHT
My bucket-B note said *"every writer must go in the same migration"* — then my phase split put the writers in A and the column drop in B. **Writing a correct principle and then contradicting it in the plan; the phase diagram hid it.**

### NEXT ACTION (Langston HOLDS THE DIFF GATE until this lands AS A UNIT)
Close **Section 10**: item 5's remaining consumer files · the **`bridge/canonical/` provenance read for finalScore's ORIGIN intent** · then the **full #568 state-write census as a unit**. Q5 ruled (order `getQueuedSignals` by the LIVE RANK KEY — dropping the ordering hands display consumers nondeterministic order, a data-quality regression dressed as a cleanup). Q6 sub-question to name in A0: **did `hybridScore→strength` carry learning signal that `confidence` doesn't?** — a measured VTS-data-quality decision. **NO DIFF OPENS BEFORE THE CLOSED SECTION 10 IS WITH LANGSTON.**

---

## ⚑ STANDING LESSONS (earned; do not re-learn)
- **CHECK REACHABILITY BEFORE BUILDING ANY STRUCTURAL CONCLUSION.** I once reasoned from `executeRefreshCycle`, which has never executed, and talked myself out of a correct framing. This session I nearly filed `criteria-limiter` as falsifying the scope's premise — **grep the callers FIRST.**
- **A removed WRITER with a surviving READER is invisible** to caller-tracing, `tsc`, and green CI (#568). It shipped the OBJ-1 latch regression. Run the state-write census AT deletion time.
- **Verify the CALL PATH, not the function that looks right.** I claimed equivalence via `calculateFinalScore` when the RTB inlines its own copy.
- **Rule 24.a — announce SYMPTOMS freely, CAUSES only after testing their reach.** Check the arithmetic against the symptom's cadence first.
- **Provenance before judging old architecture** (Kyle, on the 30s→120s refresh): an old decision CAN be revisited, but read its history and intent FIRST. The bucketed refresh was chosen 2025-12 *because* the single 30s path was under strain; the longer gap was weighed and accepted then.
- **Langston is STATELESS per-invoke** — carry his prior ruling INTO the next prompt. That is my job, not his.
- **Quote `path:line` from `origin/migration/aws-supabase`, never the working tree** (#545 rule 2).
- **Rule 27: me + Langston, ship it.** Don't convene panels. Offer a correction once; don't turn it into a lap.
- **§9.3 UI verification is DEFAULT now**, not on request. Entering passwords is outside what I do — flag the gap, never launder it ("a flagged gap beats a laundered one" — Langston).
- **Check `resolved_by` before claiming a resolve.** I told Langston two alerts were "resolved by me"; one was CC-B's. Read the field you are actually citing.
- **The governed-read guard scans heredoc bodies too** — quoting the forbidden shape gets blocked. It also caught me doing the real thing the same day. **Mechanisms over disciplines.**

---

## 📌 OPEN THREADS (mine, not dropped)
- **#570** — bucket-2 refresh gap: 12/100 signals frozen, all hash to bucket 2; the bucket fires but its members' timestamps never advance. Homed #532/OBJ-4. Lead: key-format mismatch `bucketKeysAtIndex`→`refreshAndRank` filter. Pre-existing; causally exonerated of my restore.
- **#532** stays OPEN for OBJ-2b/3/4/5/6 — **the batch is NOT closed.** OBJ-4 must land before the 120s-cadence question can reopen: `promoted_at`/`promoted_trade_id` are never populated (0/101 all-time), so dwell-to-promotion is UNMEASURABLE. **It reopens on an instrument, not an adjective.**
- **★ #574 (mine, NEW 2026-07-23, its OWN batch — NOT folded into #558 A1)** — the **live `r_multiple` ranker's expectancy kernel runs on a FABRICATED `VolNoise=0.3`**: `signalRMultiple` passes `meta.VolNoise`/`meta.prices` into `evaluateTradeExpectancy` (which runs **unconditionally** — the `chosenNetEv/distStop` override only discards its `r`), the admission metadata carries **neither** (same curated rebuild that dropped `maxHoldingMs`, #550), `expectancy.ts:616` substitutes `?? 0.3`, and the only log printing it is gated `if (!quiet)` while `signalRMultiple` passes **`quiet=true`** ⇒ **absence actively suppressed on the path that needs it.** Affects `pwinFloored` (→ calibration sink, which Analyst ACTIVELY uses for ranker-quality analysis) + `r` wherever `chosenNetEv` is absent. **NOT filed as a defect (rule 24)** — 3 questions open incl. the provenance read. **⬛ MY `DI=50` CLAIM WAS WRONG and is struck** — CC-B measured the FULL retained table: `di_at_queue`/`dbs_score_at_queue` **100% populated every day**, `VolNoise` **0 every day**; Analyst corroborated (live pWin ≈0.46 only statable *because* DI varies). **Langston ruled DI/DBS HANDS-OFF, working-as-designed** — my draft would have sent someone at correct code. **Scope = VolNoise + prices ONLY.**
- **★ #575 (mine, NEW)** — did the shadow-pairing **calibration sink** retain rows whose `pwinFloored` came from the fabricated VolNoise? **MEASURE THE SINK DIRECTLY — the queue census CANNOT answer it** (separate store, own retention, every retained rtb row post-dates reorg-B3 typed columns); inferring clean from the queue = the wrong-baseline error. Both outcomes legitimate (dissolves on evidence / its own finding). Homed as an explicit measurement objective inside #574's batch.
- **#571** — `B-WS-SUBSCRIBE-BOUNDARY-CLASS`: thread authoritative class through the `subscribeToSymbols` boundary (~14 callers). Phase 19, mine.
- **Obligations:** #44 (due 2026-08-01, alert `74a661e5`) · #45 (due 2026-08-30, alert `27860643`).
- **Kyle 2026-07-22:** crypto deliberately uses VOLUME not order-book — **confirm in Phase 25, don't act now.** Order-book thresholds probably too low → Phase 25, with the stuck-trades question (#561).
- **Consolidate the freshness work** (#441/#526/#531/#548/B8.5e/#559) into ONE coherent rule set — Kyle's ask, unstarted.
- **§10.b Langston MEMORY sync** — owed, deferred with his approval; discharge next governance turn.

---

## ✅ CLOSED — ONE LINE EACH (the repo record is authoritative; do NOT re-expand)
- **B-RTB-REFRESH-CONSOLIDATE OBJ-1** (2026-07-22; `d2306518e`+`373d73612`+`40004ddb3`, latch restore `4760b1077`) — the duplicate RTB scheduler is GONE; proof = 0 Mechanism-A ticks post-restart while buckets keep rotating. → `Batch Completion/B_RTB_REFRESH_CONSOLIDATE_OBJ1_COMPLETION_REPORT.md`
- **B-WS-SUBSCRIBE-CLASS-FILTER #559 OBJ-2** (2026-07-23; `71ec83f36`+`3f85a607b`) — killed the ~133k/day futile subscribe storm at its one source; live-verified ZERO skips, crypto unaffected. → its completion report + pre-audit
- **B-REGIME-REFRESH-PIPE** (2026-07-21) — regime data live on both classes, 0 rejects.
- **B-RANKING-COMPONENT-CAPTURE #555** (2026-07-22) — deployed, migration applied, acceptance observed (184/184 non-null vs 0/14,232 before).
