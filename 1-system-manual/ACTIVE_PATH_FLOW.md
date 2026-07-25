# ACTIVE TRADING PATH — FLOW DOCUMENT

> **Status: IN CONSTRUCTION (started 2026-07-22).** Owner: Claude Analyst (CC-C), Kyle standing assignment 2026-07-21. Shape ruled by Langston 2026-07-22 (GATE-1/2/3 — see `Claude Comms and Packages/Langston Design Asks/ACTIVE_PATH_FLOW_DOC_GATE1_BOUNDARY.md`, commit `7c12a4887`).
>
> ## ⚠️ WHAT THIS DOCUMENT GUARANTEES — read before trusting it
> The freshness gate (§2, when built) guarantees this doc is **RE-VISITED when the code it depends on moves.** It does **NOT** guarantee the doc is **CORRECT.** *It forces attention, not truth* (Langston, 2026-07-22). Do not read a passing freshness check as a correctness certificate — that would make this the next false comfort, which is the failure it exists to prevent.

---

## 0. WHY THIS EXISTS — the measured gap

Kyle, 2026-07-21: *"we should be creating an architectural document for the flow of our active trading path. So everything that we change, rebuild, add in, remove, all of that is documented in our flow."*

| Fact | Evidence |
|---|---|
| Prior artifact: `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, 361 lines, stages A→H | file at `1-system-manual/` |
| **64 batch completion reports landed AFTER that audit** (vs 135 before) | `git log --diff-filter=A` over `Claude Comms and Packages/Batch Completion/`, first-add date per file, split at 2026-06-18 |
| Those 64 include the whole B7.x ranking+fee arc, the whole B8.x switch-on arc, and **P19-B-RENAME** — which renamed the engine and its tables out from under the audit's vocabulary | the enumerated list |
| **That audit is CRYPTO-ONLY** — its own title is "ACTIVE TRADING PIPELINE AUDIT — **CRYPTO**" | line 1 |

**Two distinct problems.** (a) 64 batches of staleness. (b) **xStock has never had a documented active-path flow at all** — a coverage hole, not staleness; refreshing the crypto audit cannot fix it.

**And the reason a refresh is not enough:** we ran that audit at the start of Phase 19 and *keep finding things it missed* — the dual RTB refresh (two independent mechanisms over one queue, ~7 months, **missed by two separate audits**) is the canonical case. A one-shot refresh reproduces the failure. This has to be a thing that stays true.

---

## 1. SHAPE — what this doc is, and what it refuses to be

**A TRAVERSAL, not a chapter** (Langston GATE-1). The division of labour:
- `SYSTEM_MANUAL.md` owns **what a component IS** and why.
- `SYSTEM_IMPACT_MAP.md` owns **what connects to what.**
- **This doc owns the EDGES**: what A hands B, in what shape, under what precondition, and **what can silently drop it.** Nothing else owns that third thing — which is its whole reason to exist.

**The boundary test that keeps it holdable** (Langston's axis): *you may **NAME** a node's field/state as the subject of a handoff; you may **not EXPLAIN** it — the explanation links to the Manual.* Catching yourself explaining a node's internal logic to make an edge legible is the tell that you have crossed into Chapter territory. **Link out instead.**

**★ THE SPINE IS THE DROP/DIVERGENCE CENSUS, NOT THE HAPPY-PATH HANDOFF** (Langston, load-bearing). The clean handoff is close to what the SIM already implies, and re-stating it is exactly where a third document starts drifting from the other two. **The edges that can silently drop the payload are the content nobody else owns.**

**Both asset classes, as SPINE + PER-HOP DELTAS** (GATE-3) — one crypto spine, xStock divergence marked at the hops where it actually diverges. Crypto-first is disqualified on its own terms: it reproduces precisely the artifact we are complaining about. **If xStock turns out to diverge at nearly every hop, THAT IS ITSELF THE FINDING** — it would mean reorg-D1's "both in code, one live at a time" is more unified on paper than in the code, and a crypto-first pass would never have surfaced it. An unwired xStock hop is recorded as a stub edge (`NOT YET WIRED`) — a documented hole is a valid entry.

---

## 2. FRESHNESS GATE — design (NOT YET BUILT)

A committed manifest of the symbols/anchors this doc depends on + a check that reads at the graded ref (`origin/migration/aws-supabase`) and **fails loudly when a manifest entry moves without this doc moving.** Same principle as the governance-checker, the #554 pinned test, and the B-COMMS-CHUNK-FIX Finding-B decision: **the guarantee must come from something that fails on its own when it drifts, never from someone remembering.**

Two conditions, per Langston, so it stays honest rather than becoming ceremony:
1. **Pin SYMBOLS/ANCHORS, not whole files, wherever feasible.** A file-level hash fires on every comment touch, which trains everyone to rubber-stamp the doc-bump — **and a rubber-stamped gate is a dead gate.** Where coarse pinning is unavoidable, the check `log()`s that it is coarse.
2. **The check output must NAME THE IMPLICATED HOP**, so the owner can cheaply confirm "no edge change here" instead of re-reading the whole document.

---

## 3. METHOD — §9.5 applied literally

**NOT a path trace.** §9.5(a) is explicit about why, and the evidence is ours: path-tracing is satisfied by the **first sufficient explanation** at each hop, so it structurally *cannot* discover a second mechanism. The June audit was explicitly instructed to trace a pair end-to-end and still missed the dual RTB refresh — because once it found *a* refresh, the story was coherent and it moved on. **A complete narrative is not an exhaustive inventory.**

So at **every** hop, a census — not a path step:

| Census question | Why |
|---|---|
| Who **writes/creates** here? | multiple producers |
| Who **reads** here? | hidden consumers |
| Who **mutates** state here? | competing updaters |
| **Who DELETES here?** | ★ co-highest-yield — both RTB refresh mechanisms deleted queued signals |
| **Who SCHEDULES / RE-ENTERS against it?** | ★ co-highest-yield (Langston's addition) — **a duplicate mechanism shows up as a second TIMER before it shows up as a second WRITER**, which is exactly what the dual RTB was |

Single-member lists are stated **explicitly as such** — an asserted absence needs presence-evidence (rule 22). Two or more schedulers over one component require a **mutual-exclusion check**: does mechanism 2 respect mechanism 1's in-flight guard?

**Provenance read** (§9.5(b)) for any hop whose behaviour is disputed or predates the governance change: `bridge/canonical/` + the introducing commit — **recording explicitly where the canonical corpus has NO coverage**, since that absence was itself a finding on the RTB audit.

**Verified against RUNNING CODE.** The 64 completion reports are the index of where to look, **not the source of truth**. Where a report and the code disagree, the code wins and the disagreement is recorded as a finding.

---

## 4. ENTRY-POINT / SCHEDULER CENSUS — FIRST PASS (2026-07-22)

> **⚠️ THIS IS A CANDIDATE LIST, NOT A FINDING.** It is the output of a repo-wide grep for scheduling primitives (`setInterval`, `cron.schedule`, `new CronJob`, `scheduleJob`) in `server/`, tests excluded, filtered to files that also mention an active-path identifier. **A file appearing here has NOT been shown to drive the active path** — e.g. `kraken-websocket-adapter.ts` holds 9 timers that are almost certainly connection/heartbeat concerns, not trading drivers. Per-file classification is the next step and is where the real work is. Recording the raw surface first so the narrowing is auditable rather than asserted.

- **113** scheduling sites total in `server/` (tests excluded).
- **34** files survive the active-path-identifier filter. Counts are scheduling primitives per file:

| n | file |
|---|---|
| 9 | `server/exchanges/kraken/kraken-websocket-adapter.ts` |
| 3 | `server/services/price-cache.ts` |
| 2 | `server/services/signal-orchestrator.ts` · `server/services/active-execution-engine.ts` · `server/services/scan-stall-instrument.ts` · `server/services/validation-session-service.ts` · `server/services/telemetry-compression.ts` · `server/services/passive-archive/equity-spot-archiver.ts` |
| 1 | `vts-runner.ts` · `trailing-exit-controller.ts` · `rtb-metrics-service.ts` · `market-context-engine.ts` · `micro-execution-service.ts` · `active-engine-heartbeat.ts` · `autonomy-scheduler.ts` · `central-clock.ts` · `cluster-registry.ts` · `context-bridge.ts` · `live-pricing-adapter.ts` · `health-monitor.ts` · `module-constants-service.ts` · `guard-eval-tracker.ts` · `lazy-loader.ts` · `event-bus.ts` · `index.ts` · `active-funnel-tracker.ts` · `strategy-modes.ts` · `trace_service.ts` · `performance_monitor.ts` · `m5e-validation-service.ts` · `c13-validation-service.ts` · `c14-validation-service.ts` · `aj17-diagnostic-runner.ts` · `aj18-diagnostic-runner.ts` · `ohlc-batch-writer.ts` |

**Next step:** classify each as DRIVES / OBSERVES / UNRELATED-to the active path, and for every component with ≥2 drivers, run the mutual-exclusion check.

---

## 4b. FIRST CLASSIFICATION PASS — and a NEAR-MISS worth recording

**Drivers identified (scheduling primitives that plausibly move the active path):** `signal-orchestrator.ts:342` (evaluation loop) + `:347` (weights refresh) · `active-execution-engine.ts:344` (**continuous promotion**) + `:545` (monitoring) · `trailing-exit-controller.ts:207` · `micro-execution-service.ts:97` · `central-clock.ts:69` (the tick everything else rides). **Observers (not drivers):** `rtb-metrics-service.ts:645` (invariant check) · `active-engine-heartbeat.ts:37`.

**Central-clock subscribers — the enumeration a forward trace cannot produce:** `ready_to_buy_service.ts:674` (`RTB_${mode}`) · `rtb-refresh-service.ts:214` (`RTBRefreshService`) · `tcl_watchdog.ts:126` · `trading_scheduler.ts:66` · `fx5-scanner.ts:611` · `xstock_spot/scanner.ts:251` · `market-events.ts:411`.

### ★ NEAR-MISS — two clock subscribers over the RTB queue is NOT a finding. Cross-reference only.

Seeing `ready_to_buy_service` **and** `rtb-refresh-service` both subscribed to the clock over the same queue is the dual-mechanism shape, and the reflex is to file it. **§9.5(b-ii) says search the ledger first — and the code names its own provenance.** `active-funnel-tracker.ts:76` carries a comment citing **"B-RTB-REFRESH-CONSOLIDATE OBJ-4 (2026-07-19, CORRECTED after Langston CHANGES-NEEDED)"** and **"the §9.5(a) census's eight deleters."** So the census exists, the consolidation is governed and in flight (CC-A), and filing this as a discovery would have been the exact error §9.5(b-ii) exists to prevent — *a deliberate, Kyle-approved, Langston-reviewed decision reported as a defect is worse than no finding.* **Disposition: cross-reference to the in-flight consolidation, not a new issue.**

### ★ THE REAL CONTENT THAT NEAR-MISS EXPOSED — and it validates the spine choice

The same comment documents a trap that is **exactly** what this doc is supposed to own, and that neither the Manual nor the SIM does: **queue-LIFECYCLE exits and refresh-PASS outcomes are DIFFERENT SETS, and summing them produces an identity that can never hold.**
- `promoted` fires in `active-execution-engine.ts:2223` — **a different service**, not a pass outcome.
- The unclassifiable drop **returns before `refreshedAttempted` increments** — it never enters the denominator.
- Expiry lives in `cleanupExpiredSignals`, **outside `refreshAndRank` entirely.**

⇒ **Eight distinct ways a row can leave `rtb_signals`**, only some of which are refresh-pass outcomes. That is an edge-semantics fact about a handoff — precisely the "what silently drops the payload" content Langston ruled should be the spine. It is recorded here as the model for how each hop gets written.

**Method note, generalisable:** the deleter/scheduler census is what surfaced this in one pass. A forward trace would have found *a* refresh, produced a coherent story, and moved on — which is how this class survived two audits.

## 4c. GATE-3 ANSWERED — xStock divergence is CONCENTRATED, not universal

Langston's GATE-3 set a condition: *if xStock diverges at nearly every hop, that is itself the finding* (it would mean reorg-D1's "both in code" is more unified on paper than in code). **Measured — it does not.** Asset-class branch references per active-path file:

| branch-refs | file lines | file |
|---|---|---|
| 18 | 2668 | `signal-orchestrator.ts` |
| 15 | 3778 | `active-execution-engine.ts` |
| 15 | 1691 | `trailing-exit-controller.ts` |
| 7 | 2687 | `ready_to_buy_service.ts` |
| 4 | 495 | `rtb-refresh-service.ts` |
| **0** | 321 | **`tcl_watchdog.ts`** |

⇒ **Spine + N deltas is the cheap shape, as Langston predicted — not 2×.** Divergence clusters at signal generation, execution and exits; the queue and its refresh are nearly class-agnostic.

> ⚠️ **METHOD CAVEAT, stated so the number is not over-read:** a branch-reference count is a **proxy for divergence, not proof of it.** A low count does NOT establish class-blindness in effect — the class may be resolved upstream and carried on the row, so the component behaves per-class without ever naming a class. These counts say *where to look*, not *what is true*. Each hop's actual divergence gets established when that hop is written.

### ⭕ OPEN QUESTION (rule 24 — NOT filed as a defect) — `tcl_watchdog.ts` names no asset class at all

Zero asset-class references in 321 lines, in the component that watches TCL promotion. **Three possible dispositions and I am not assuming which:** (1) correct-by-design — promotion genuinely needs no class distinction because everything class-dependent was resolved upstream and rides the row; (2) working-as-designed-but-**UNADDRESSED** — a scope call about whether xStock promotion *should* differ (equity-session boundaries, the 24/5 window), which would be Kyle's decision, not a code fix; (3) a real gap. **Per rule 24 this gets resolved by reading the code and the intent, not by first impression** — and the honest default given the caveat above is (1). Recorded here so it is answered when the TCL hop is written, rather than lost.

## 4d. TRACKED EDGE-CLASS — SILENT SUBSTITUTION (`?? fallback`) is a flow-doc concern by definition

**Not my item and not filed by me** — CC-A/CC-B/Langston have the `hybridScore ?? confidence` family in flight, and CC-A's recommendation is to carve it out as its own named item because removing those fallbacks changes **admission-path behaviour**. Correct call; I am not joining that review (rule 27).

**But the CLASS belongs in this document's spine.** A `??` fallback is the purest form of the edge this doc exists to record: *A hands B something, B finds it absent, and B silently substitutes a different quantity — so downstream reads a plausible value that did not come from where it claims.* Nothing throws. This is the same failure shape as #546 (absence collapsing into a valid-looking value) and the same shape as the mid-token `path:line` cut in B-COMMS-CHUNK-FIX: **a wrong answer that looks exactly like a right one.**

⇒ **Every hop written in §5 must state, explicitly: what happens when the payload is ABSENT at this edge.** Three honest answers — it throws · it propagates the absence · **it substitutes** — and if it substitutes, *what with, and does the consumer know*. A hop that does not answer this is not finished. Cross-reference the in-flight item rather than duplicating it.

## 4e. TRACKED EDGE-CLASS — **DORMANT-BY-DEFECT vs DORMANT-BY-DECISION** (CC-B's class, adopted; twice-evidenced 2026-07-22)

**The class:** a behaviour reads as OFF. Everyone assumes someone decided that. **Nobody did — it is off because an upstream defect starves its input.** The trap: *repairing the bug IS the behaviour change*, and nobody reading the fix would expect that. **A bug was doing the job of a config setting.**

**Two instances in one day** (CC-B surfaced both; the second is where I was wrong and he corrected me):
1. **RISK-035** — a risk scored LOW *because a code path was dormant*, and the dormancy was itself caused by a defect.
2. ❌ **The trailing ladder — I OFFERED THIS AS INSTANCE 2 AND IT IS RETRACTED.** The TEC protective family is dormant **by DECISION** (B73 ablation / variant K; Kyle directive), documented in the same file I was reading. **The CLASS remains real — RISK-035 stands — but this is not an example of it, and citing it as one was a first impression published as fact.**
   > ★ **AND THE CONTRAST THAT MAKES THE CLASS PRECISE** — the *break-even* latch at `:1078` gates on `cfg.breakEvenEnabled && … && state.ATR > 0`: a **real** operator flag, verified `false` for all four asset classes in live `module_constants`, xstock_spot set false **2026-05-21 by `kyle-directive-2026-05-21-disable-xstock-be`**. So break-even IS dormant-by-decision and repairing ATR does *not* wake it. **Same file, same input, two different answers — which is exactly why this must be asked PER EDGE and cannot be answered per component.**
   > ⚠️ **Stale self-description found in passing:** the code comment block at `:117` still records `xstock_spot → true (BE-protect enabled)`. The live DB says `false` since Kyle's directive ten days later. **The code's description of itself is stale; the DB is the truth.** Recorded, not fixed by me (not my file).

⇒ **EVERY HOP MUST ANSWER: is this edge's behaviour OFF by decision, or OFF by defect?** and name the evidence — a config key with its live value, or the starved input. **"It doesn't currently fire" is not an answer.** A hop that cannot distinguish these two has not been audited; it has been glanced at.

**Why this belongs in a flow doc rather than only in the issue ledger:** dormancy is a property of an EDGE (what arrives, and whether it is sufficient to trigger the next thing) — not a property of a component. Neither the Manual nor the SIM has a natural place to record "this behaviour is only quiet because its input never arrives."

## 5. THE HOPS

### HOP A→B — SCANNER → FILTERED-SURVIVOR POOL. *Both classes (separate class scanners); the filter funnel + IMF gate. Mapped 2026-07-25 — live-data grounded (item-1 filter-diagnostics, 2026-07-24).*

**Driver:** `fx5-scanner.ts:611` (`centralClock.subscribe('FX5Scanner', …)`) for crypto; `xstock_spot/scanner.ts:251` for xStock — two class-specific scanners, both central-clock-driven. **Census — writers of the survivor pool** (`active-filter-pool.ts` `ActiveFilterPoolService`, via `addSurvivors`): the scanners are the writers; the pool holds per-mode Maps — the main FX5 pool + family-routed sub-pools (pattern / trend / reversal). **Readers (the next hop):** `signal-orchestrator.ts:1661` `getActivePool(mode)` + `:1667` `getPatternPool(mode)` + `:746` `getFX5DataForSymbol` (reads the per-pair `di`/`dbsScore` the reorg-B3 thread carries as typed columns).

**What is handed over — the survivor set, through a two-stage gate.** Stage 1 quantitative filters, then Stage 2 the IMF gate (LQ liquidity / VN volume-noise / DI directional-integrity). **Measured live (one crypto cycle, 2026-07-24):** 325 scanned → **253 failed min-volume (78% — by far the dominant gate)** · 8 stablecoin · 7 min-price · 8 history · 31 already-active → **15 passed all filters** → IMF → **8 quant survivors**; the pattern path ran in parallel to **29 survivors** (37 passed → 29 IMF-passed). So the scanner is HEALTHY and productive — the funnel narrows on real quality gates, min-volume doing most of the work. `benchmarkBypassed` lets designated benchmark symbols skip a gate (a deliberate carve-out, not a leak).

**★ WHAT GATES / DROPS THE PAYLOAD HERE:** the filters + the IMF gate — every count exposed in the `filter-diagnostics` funnel (`fx5-scanner.ts:178-213`), none silent. A pair failing any stage simply never enters `addSurvivors`. **The survivor pool is a live working set** (Maps cleared + rewritten each scan cycle) — no history retained; a pair present one cycle and gone the next left by failing a gate, not a silent drop.

**Dormant-by-decision or dormant-by-defect (§4e):** live and firing (325 scanned/cycle against a 1518-pair Kraken universe; 300/cycle target — the universe rotates).
**Absence behaviour (§4d):** honest-empty for a pair that fails — no fabricated survivor. ⭕ **Cross-reference (not a new finding):** the `di`/`dbsScore` on `ActiveFilteredPair` is the reorg-B3 typed-column thread (SIM reorg-B3); the downstream `di_at_open` const-50 fallback is homed at #378.

---

### HOP D→E — GENERATION SQE → RTB QUEUE (admission). *Both classes; the fee wall + the exploration lane live here. Mapped 2026-07-25 from the item-1 investigation — live-data grounded, not reasoned.*

**Driver:** `signal-orchestrator.ts:342` (evaluation loop). The orchestrator emits **ONE best signal per cycle** (not one per strategy in a regime family); each candidate is scored by the **generation SQE** (`signal-orchestrator.ts:906` → `[11.0E][SQE_REJECT]`) and, on pass, admitted to `rtb_signals` via **`queueSQESignal`** — the single admission chokepoint. **Census — writers of `rtb_signals` (rule 22):** `queueSQESignal` is the sole write path (organic + exploration admits both land through it); `recordQueueFailure`/`getQueueFailureStats` (`ready_to_buy_service.ts:495`) is the observable DROP counter — a fire-and-forget `.catch` in the orchestrator increments it + logs `[RTB_QUEUE_DROP][CRITICAL]` (the P19-B3b silent-drop landmine surface).

**What is handed over — the binding gate is Net Expectancy (NetEV) after friction.** The SQE's binding admission gate is `NetEV > 0` (#501 fee wall). **Measured (2026-07-24, 120s funnel delta): 75 generated / 76 SQE-evaluated / 0 passed** — every reject `NetEV <= 0 (chosen maker mode — non-positive net expectancy after friction)`, values clustered just below zero (`-0.0005` … `-16`): the fingerprint of marginal signals tipped under by Kraken's 0.40%/0.80% fees. So **organic admission ≈ 0 under the current fee wall** — working-as-designed (correctly refusing money-losing trades), NOT a defect: the admission code + NetEV math are git- and config-unchanged since before the pool held ~100 on 07-22, so the changed input is the market, not the code.

**The second admission lane — exploration (paper-only, `exploration-lane.ts:129`).** A signal that fails the SQE **on NetEV ONLY** (`isNetEvOnlyFailure`, `:178`) can be admitted below the profit floor for learning, gated by three live knobs: `enabled=true`, `daily_budget=50/class`, and an **ANNEALING floor** `min(0, -0.02 + 0.005·floor(closed/60))` (`:152-154`) that tightens toward 0 as informative (non-`never_filled`) exploration closes accrue — **currently -1.0% at 161 closes; shuts entirely at 240.** Budget = a per-UTC-day conservation count (rtb + open-today + closed-today; `:80-98`), spent gradually (~2/hr).

**★ WHAT GATES / DROPS THE PAYLOAD HERE — all loud, none silent:**
- Organic: `NetEV<=0` → `[SQE_REJECT]` + funnel (`uncategorized` bucket = the NetEV rejects).
- Exploration: below-floor → `EXPLORATION_DECLINE below floor`; budget spent → `EXPLORATION_DECLINE daily budget exhausted (50/50)`; lane error → **fail-CLOSED** to normal reject (`:901`).
- **★ The pool cannot fill from a full slot table.** Promotion (HOP E→F) removes from the pool only when a slot frees; with slots jammed (the 2026-07-18→22 weekend xStock slot-jam — Friday xStocks suspended over the weekend + a then-broken time-exit) admits **back up** in `rtb_signals`. ⇒ **the ~100 pool of 07-22 was a slot-full BACKLOG, not healthy inflow; pool size is governed by slot availability DOWNSTREAM, not by admission rate.**

**Dormant-by-decision or dormant-by-defect (§4e):** the exploration lane is **dormant-by-design-winding-down** — the anneal is a deliberate subsidy that expires as edge-evidence accrues. ⚠️ **FORWARD RISK (Kyle scope call, #583):** if the anneal shuts (240 closes) while the fee wall holds organic at 0, the pool → **permanent zero** — the subsidy expiring into the wall it was meant to hand off to.
**Absence behaviour (§4d):** the RTB refresh (`refreshAndRank`) re-decides NetEV on live data and **reconfirms ~everything** (210,271 of 210,289 over 10d; only 18 rejected). A regime-input MISS **leaves the signal queued** (`ready_to_buy_service.ts:1049-1055`, NOT deleted); only an SQE-revalidation FAIL or an unclassifiable asset class deletes. ⇒ **the refresh is NOT a pool drainer** — a common misread (both Kyle and I first suspected it), falsified against the funnel counters.

---

### HOP E→F — RTB QUEUE → OPEN POSITION (promotion). *Both classes; no divergence found at this edge.*

**Driver:** `active-execution-engine.ts:344` `continuousPromotionInterval`. **Census — writers of `active_open_positions`: EXACTLY ONE** — `storage.ts:3324` (`db.insert(activeOpenPositions)`). Stated explicitly as a single-member list per rule 22; the create-path is not duplicated.

**What is handed over, and in what order — the ordering is the load-bearing part.** Per Directive 8.8.4-A3.R1 the removal from the queue **deliberately precedes** trade creation, to prevent double-activation:

| Step | Site | Action |
|---|---|---|
| 1 | `:2197` | `promoteSignal(signal.id, 'pending')` — **removes from the RTB queue FIRST**, with a sentinel where the trade id will go |
| 2 | `:2200` | `executePromotedSignal(signal)` — creates the trade |
| 3 | `:2205` | `promoteSignal(signal.id, tradeResult.tradeId)` — writes the REAL id, **only** `if (tradeResult.success && tradeResult.tradeId)` |

> **`'pending'` is a deliberate ordering sentinel, NOT a placeholder defect.** Checked before characterising it (rule 24). The two-call shape exists so the queue-removal cannot lose a race with trade creation.

**★ WHAT CAN SILENTLY DROP THE PAYLOAD HERE — and the honest answer is: nothing silently, but a signal CAN be lost.**
If step 2 fails, the signal has **already left the queue** and is **deliberately not restored**. The code says so in its own words at `:2228`: *"Signal … was removed from RTB but trade failed - signal not restored."* Two `console.warn`s fire and `failedCount` increments, with a `PROMOTION_SUMMARY` line carrying `promoted=` / `failed=`. **This is fail-loud and working-as-designed** — an explicit trade-off preferring a lost signal over a double-activation. **Recorded as edge semantics, NOT filed as a defect.**

**⭕ OPEN QUESTION for this hop (cross-reference, not a new finding).** The success branch calls `recordActiveRtbRefresh(mode, class, { promoted: 1 })` (`:2233`); **the failure branch calls no funnel recorder at all.** So a signal leaving the queue via a *failed* promotion is visible in logs but may not appear in the funnel counters — and it is neither a "promoted" nor a refresh-pass outcome. **That lands exactly on the counter-semantics distinction already documented in `active-funnel-tracker.ts:76`** (queue-LIFECYCLE exits ≠ refresh-PASS outcomes, the eight deleters). ⇒ Cross-reference to that existing, governed work; **do not file separately** (§9.5(b-ii)). Confirm when the counter set is next touched.

**Dormant-by-decision or dormant-by-defect (§4e):** neither — this edge is live and firing.
**Absence behaviour (§4d):** on absence of a trade id, it **propagates the failure** (logs + counts) rather than substituting — correct, and the opposite of the `??` class.

---

### HOP G — OPEN POSITION → TEC EXIT MANAGEMENT. *★ The §4e class lives here, and the answer DIFFERS PER SUB-EDGE.*

**Driver:** `trailing-exit-controller.ts:207` `resolveAggrTimer`. The payload that matters at this edge is **ATR (the volatility figure)**, carried on the position state (`state.ATR`, set at `:1048`).

**★ THE HEADLINE FOR THIS HOP: `state.ATR` IS ZERO ON EVERY OPEN POSITION** (measured by CC-B against the live DB — 15/15 open trades), because it is dropped upstream in a curated rebuild. **Three sub-edges consume it, and they answer §4e differently — which is exactly why this must be asked per-edge, not per-component.**

| Sub-edge | Gate | Dormant by… | Does repairing ATR wake it? |
|---|---|---|---|
| **Break-even latch** `:1078` | `cfg.breakEvenEnabled && !state.breakEvenLatched && state.ATR > 0` | **DECISION** — `break_even_enabled` is `false` for **all four** asset classes in live `module_constants`; `xstock_spot` set false **2026-05-21** by `kyle-directive-2026-05-21-disable-xstock-be` | **NO.** The flag is the binding gate. |
| **Trailing ladder (target-latched)** `:1216` | `state.targetLatched && state.ATR > 0` | ❌ **I CLAIMED "DEFECT" — RETRACTED, see the hop-G retraction.** The TEC protective family is off by DECISION (B73 ablation, variant K; the calibration found it closed trades before we could learn from them). | **UNKNOWN — do not act on my earlier "YES."** |
| **Trailing (break-even-latched)** `:1232` | `state.breakEvenLatched && !state.targetLatched && state.ATR > 0` | **DECISION (transitively)** — `breakEvenLatched` can only be set at `:1078`, which the flag gates | **NO** — unreachable while the flag is off. |

⇒ **Repairing the ATR transit drop is NOT a plumbing fix.** For the target-latched ladder it *is* a behaviour change — an exit mechanism that has never run against a live position begins running the moment the input arrives. **This is a SCOPE CALL for Kyle (rule 24 outcome 2), not a defect to fix**, and it has been routed to him as such. Credit: CC-B surfaced the class; my first framing ("fix the plumbing, decide the behaviour separately") was **wrong for the ladder** and I withdrew it after reading the gates and the live DB.

> ## ❌ RETRACTED 2026-07-22 — I FILED TWO FALSE FINDINGS AT THIS HOP. Kyle corrected both. Left in place, struck, because a retraction is more useful to the next reader than a clean page.
> **FALSE FINDING 1 — "the code comment is stale."** I claimed `trailing-exit-controller.ts:117` records `xstock_spot → true` and contradicts the live DB. **It does not.** Lines `:116-121` are a DATED CHRONOLOGY of state changes, and four lines below the one I quoted it reads *"2026-05-21 Kyle directive: reverted to false (disable-xstock-be)"*, then *"2026-05-26: documentation re-synced to current live state."* **The comment is accurate and current.** I read one line of a history as a claim about the present. There is no documentation defect here.
> **FALSE FINDING 2 — "the trailing exits are dormant-by-DEFECT."** **They are dormant by DECISION, and the decision is documented in this same file.** `:93-108` records the fail-closed rationale (*accidentally-on costs real money on BE-stopped trades that exit before reaching target*) and `:108` marks `crypto_spot → break_even_enabled = false` as the **variant K winner of the B73 ablation** — an actual calibration, not a default. Kyle's account: the calibration found the trailing exits were closing trades **before we could learn from them**, so they were deliberately disabled, and they stay disabled until Phase 25 or later. **The whole TEC protective family — break-even AND the ratchet — is off on purpose.**
> **What I got wrong methodologically:** I grepped the gate at `:1216`, saw no flag on that specific line, and published "no operator flag exists on this path" as fact. I never read the 40-line rationale block at the top of the same file, never opened the ablation batch, and never asked what the design intends. That is a first impression presented as a verdict — exactly what rule 24 exists to prevent, and exactly the failure this document is supposed to catch.
> **Consequence to the earlier claim:** "repairing the ATR drop necessarily switches on an exit behaviour" is NOT established. It rested on the false premise. Whether the ratchet is reachable independently of `break_even_enabled` is an OPEN QUESTION requiring the ablation batch + the TEC design intent to be read properly — **not a finding, and not a scope call I should have routed to Kyle as though it were settled.**

**Absence behaviour (§4d):** ATR absent ⇒ **substitution-adjacent** — it arrives as `0` rather than as a null/failure, so every `state.ATR > 0` gate reads "not applicable" instead of "input missing." **A missing input and a genuinely-zero volatility are indistinguishable at this edge.** That is the #546 absent-as-valid class landing on an exit path.
