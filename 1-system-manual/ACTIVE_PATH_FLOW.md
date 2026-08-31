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

### HOP B→D — FILTERED-SURVIVOR POOL → SIGNAL GENERATION (strategy selection + sizing → SQE input). *Spans the generation stage that bridges the survivor pool (B) and the generation SQE (D→E). Crypto and xStock DIVERGE here — the sharpest per-class split in the doc so far. Code-traced 2026-07-25; generation-side counts shared with the item-1 funnel.*

**Driver — TWO, one per class, converging on ONE shared builder.** Crypto: `signal-orchestrator.ts:342` `setInterval(evaluateMarket, …)` (per-instance tick) → `:1626 evaluateMarket` → `:2001 evaluateSymbol` per survivor. xStock: a SEPARATE scanner/cycle builds its own `StrategySignal` upstream and enters through the PUBLIC seam `:449 dispatchExternalSignal` (Langston-approved, `P19_B4a_C2_DISPATCH_DESIGN_rev1.md`). **Both converge on `buildSizedSignalForStrategy` (`:458`)** — the single shared build→size→decide→SQE→enqueue chokepoint. ⇒ **the divergence is entirely UPSTREAM of the builder:** crypto runs regime + family + the strategy dispatch to PRODUCE candidates; xStock runs its OWN parallel generation of the same kind (MCE + regime + strategy selection) in `xstock_spot/eval-cycle.ts`, differing only in that it has no family-filter sub-stage (`:2121`) — see the ⚠️-corrected xStock block below.

**Census — readers of the survivor pool (B):** `getActivePool` (`:1661`), `getPatternPool` (`:1667`), `getFamilyPool` per family (`:1675`), plus the per-symbol `find` for the DBS snapshot (`:2071`) and `getFX5DataForSymbol` for the at-queue DI/DBS (`:746`). **Writers of a candidate INTO the SQE (rule 22):** the per-regime strategy detectors (`strategyEngine.detectX`, dispatched `:2175+`) for crypto + the external xStock builder — both funnel through `buildSizedSignalForStrategy`, which is the SOLE constructor of an `SQEInput` (`:841`). No other path builds a candidate; stated as a single-member producer per rule 22.

**What is handed over — the survivor becomes AT MOST N sized candidates, selected by regime THEN family.** Per crypto survivor: MCE computes the regime (`:2084`) → `regime.allowedStrategies` is the per-symbol selector (`:2093`; the hardcoded allowlist was disposed P19-B4a-C5) → the family filter keeps only strategies whose family the pair actually survived (`:2100-2135`) → each surviving strategy's detector runs; one that FIRES yields a raw signal → sized (`buildSizedSignalForStrategy`) → the maker/taker decision (`decideMakerTaker`, `:776`) computes the `chosenNetEV` that D→E's gate consumes → an `SQEInput`. **A single survivor can thus produce zero, one, or several candidates** — one per firing strategy.

**▸ xStock DIVERGENCE (GATE-3 per-class delta) — ⚠️ CORRECTED 2026-07-27 (Kyle flagged the first version as wrong; re-traced to `xstock_spot/eval-cycle.ts`).** ~~The first version claimed xStock "skips the whole regime/strategy-selection machinery and arrives with its signal already built."~~ **That was WRONG** — it read `active-dispatch.ts` at the point the signal is already formed and never traced the PRODUCER backward (the §9.5(a) first-sufficient-explanation trap; rule 24.a — a first impression published as fact). **What actually happens:** xStock runs its OWN full generation stage in `xstock_spot/eval-cycle.ts` (the VTS-shaped cycle, xStock's analog of crypto's `evaluateSymbol`/`vts-runner`) — it computes the regime through the SAME MCE (`eval-cycle.ts:365 mce.computeContext(...)` → `:374`), does regime-based strategy selection (`:454 getStrategiesForRegime(ASSET_CLASS, regime)`, per-class membership B-4.7/#163), runs the selected strategies' detectors (`:471+`), and produces `finalScore`/`predictiveConfidence`/`regimeWeight` (`:646-656`). It does NOT skip MCE or strategy selection — it runs a PARALLEL implementation. The SAME module serves BOTH the VTS/passive path (`registerOpenVtsTrade`, no SQE — `:28-29`) and the active path; **for the active path** it hands the MCE-generated, strategy-selected signal to `dispatchXstockActiveSignal` (`:71`) → the orchestrator's `dispatchExternalSignal` (`signal-orchestrator.ts:449`) → the SHARED sizing → maker/taker → SQE → RTB-enqueue tail. **So the two classes CONVERGE at that shared tail and DIVERGE only in the generation FRONT-END: crypto's `evaluateSymbol` (regime `allowedStrategies` + family-filter dispatch) vs xStock's `eval-cycle.ts` (`getStrategiesForRegime` membership, no family-filter stage).** The genuinely xStock-ONLY additions, all before dispatch and all fail-CLOSED + observable-counted: (1) an authoritative-active DORMANCY gate on `isEngineActive` (`active-dispatch.ts` `_dormantSkips`/`_classDormantSkips`); (2) a **fill-safety pre-gate** — DB config (`_configClosedSkips`) + **tick FRESHNESS within `activeFillMaxAgeMs`** (`active-dispatch.ts:175-180`); a stale tick → `_staleSkips` + a stale-fill alert (**the weekend/off-hours xStock-staleness surface** — RTH clock retired #295 for a 24/5 book-depth gate at the open seam); (3) fail-LOUD confidence-∈[0,1] (`:183`) + strategy-∈-SSOT (`:188`) asserts. ⇒ **xStock does NOT bypass regime/strategy generation; it runs a parallel copy. The divergence is "separate front-end, shared tail," NOT "skips the machinery."**

> **★ "ONE best signal per cycle" is a SIMPLIFICATION — do NOT file this loop as a discrepancy (§9.5(b-ii)).** The orchestrator emits ALL SQE-passing candidates; the winnow to one happens at PROMOTION, per free slot (HOP E→F), NOT here. Already reconciled + governed — `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md:313`: *"orchestrator emits all passing; TCL winnows to one … CLAUDE.md rule-20 'one best signal per cycle' is a simplification; the winnow is at TCL, not emission."* Recorded so the next reader who greps rule-20 against this loop lands on the reconciliation, not a false finding.

**★ WHAT GATES / DROPS THE PAYLOAD HERE — all loud, and in PAPER the operative gate is INSIDE the builder, not the outer loop:**
- EXTREME_NOISE VN veto (`:2060`) → per-symbol skip, logged.
- No regime-allowed strategy (`:2137`) → `SKIP: No enabled strategies for regime`, logged.
- Family-filter attrition (`:2129`) → `recordActiveStrategyAttrition`, the dedicated `strategyAttrition` funnel bucket (kept OUT of `preSqeRejects` so the pre-SQE stage can't exceed its denominator — B8.4b).
- Detector returns null (no pattern present) → no candidate — **the dominant, entirely-honest "drop": most strategies simply don't fire most cycles.**
- Sizing returns null (`:2180 if (sizedSignal)`) → no candidate pushed.
- **★ THE PLACEMENT THAT MATTERS:** in PAPER the RTB enqueue is TERMINAL inside `buildSizedSignalForStrategy` (`:1126 queueSQESignal`), so the **SQE at `:864` is the operative admission gate** (→ HOP D→E). The outer `evaluateMarket` validate-and-forward loop (`:1768-1797`) feeds `onSignalCallback`, which is a **no-op in paper** (`:443`) — so its `Dropped malformed StrategySignal` warn (`:1771`) does NOT gate admission; the candidate was already enqueued (or SQE-rejected) inside the builder. **What looks like the gate isn't; the gate is upstream of the return.**

**Dormant-by-decision or dormant-by-defect (§4e):**
- The SQE **governance gate (HF9) + confidence floor (HF8) run in SHADOW** at generation (`gateShadowMode:true`, `:864`) — evaluate + log, **never block**. Dormant **by DECISION** (P19-B8.5 OBJ-6, Langston-approved, #514).
- The active-path funnel recorders (`recordActiveStrategyAttrition`, `recordActiveSqeEvaluation` `:868`) were "dormant until paper-active" (`:2122`) — **now LIVE** since the paper-active switch-on. A dormancy that RESOLVED with the switch, not a config knob.

**Absence behaviour (§4d) — this hop substitutes in three documented places; none is the silent `??` class:**
- No price / <20 OHLC bars / VN-veto → **honest-empty** (`return signals`, `:2032`/`:2022`/`:2062`) — no fabricated candidate.
- Absent pair DBS (survivor carries no `dbsScore`) → `orchestratorDbs=undefined` → MCE consumes undefined under the B63 hard contract (MCE no longer computes DBS locally). Cross-ref the `di`/`dbs` const fallback homed at #378 (noted at HOP A→B) — **not re-filed.**
- Absent at-queue DI/DBS for the maker/taker decision → `fx5Data?.di ?? undefined` → **kernel DOCUMENTED defaults** (`:786`), the same treatment the open-gate gives a null `di_at_queue` (declared substitution, single-basis F2).
- Regime-stability drift/volZ are unavailable in orchestrator scope → **explicit cold-start defaults** `0.5`/`0` passed by name (`:724-728`) — the P19-B3b fix that REPLACED a silent `undefined` masked by `||`. The honest form of the absent-as-valid class; homed to the VTS/regime-stability wiring follow-up.

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

### HOP E→E — RTB QUEUE REFRESH & RE-RANK (self-loop). *⏳ STUB — this edge is UNDER ACTIVE RECONSTRUCTION as of 2026-07-25; full census deliberately DEFERRED. Both classes.*

**Why a STUB and not a map — the doc's own freshness rule applied to itself.** This is THE edge the document's method exists to catch: the ~7-month **dual-mechanism** refresh (`RTB_REFRESH_AUDIT_2026-07-18.md`, CC-A, Kyle-directed — two independent schedulers over one queue, no mutual exclusion, **13/13 runtime overlap**). Mapping it today would document a moving target — the consolidation is landing AS THIS IS WRITTEN, and a full census would be stale within days (the exact failure §2's freshness principle warns against). Verified against current code, not the 7-day-old audit:
- **Mechanism A ("the rich refresh," per-signal Central-Clock 30s) was RETIRED 2026-07-22** — `d2306518e` "B-RTB-REFRESH-CONSOLIDATE OBJ-1: retire Mechanism A" (#532); retirement visible in-code at `ready_to_buy_service.ts:1591`, and its `isRefreshing` latch was restored onto the survivor 2026-07-23 (`4760b1077`).
- **The survivor is Mechanism B** — the bucketed standalone service `rtb-refresh-service.ts` (still `index.ts:348 rtbRefreshService.start()`) → `refreshAndRank` (`ready_to_buy_service.ts:892`), which the canonical corpus always documented as THE refresh architecture (audit §5.0-CORRECTION). Its former FROZEN-snapshot weakness is being fixed in-place — volatility now reads LIVE (`:1100`, comment "was `metadata ?? 0.3`", OBJ-2), the §2 defect the audit named.
- **The same file is ALSO being rewritten by a concurrent batch TODAY** — `8939105f8` (2026-07-25) `B-RETIRED-SCORE-REMOVAL #558`, collapsing the finalScore ranker (the audit's §4 "finalScore gate retired" becoming full removal, #525-family).

**Deferred, with a named revisit (§9.4).** The full census (writers / readers / **deleters** / schedulers of `rtb_signals` at this self-loop), the `??` substitution class (§4d, which concentrates here and is being actively un-frozen), and the §4e dormancy answers are all booked for **once #532 and #558 have settled**. Mapping before then earns immediate staleness. The audit remains the finding-of-record for WHY two mechanisms existed; it is being superseded, in the code, by #532 — the flow doc records the current single-mechanism direction, not the retired collision.

**What stays OPEN regardless of consolidation (mapped, NOT adjudicated here):** the **#535 backstop re-examination** — the #523 `[11.8B]` open-gate BLOCK→SHADOW ruling rested on eviction proof that cited **Mechanism A only**; with A now retired, Langston must re-confirm the SURVIVING mechanism evicts negative-net-EV signals before the #522 pre-live gate. This hop records the coupling; the ruling is Langston's, not this document's.

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

---

### HOP F→(closed) — OPEN POSITION → CLOSED-TRADE FINALIZATION. *Both classes; the create-at-open / update-at-close lifecycle. Mapped 2026-07-25 from the item-3 investigation.*

**Driver:** the monitoring loop (`active-execution-engine.ts:545`) runs `checkExitConditions` (`:1293`) per open position each cycle; a non-null `ExitCondition` (stop / target / trailing / max-hold / guardrail) → `closePosition` (`:1695`, invoked at `:811`). **Census — the `closed_trades` row is written TWICE, at DIFFERENT times:** CREATE at OPEN (`createClosedTrade`, `:3203` — item-3's finding; the row exists from the moment the position opens, `closed_at` NULL), then UPDATE at CLOSE here (`updateClosedTrade`, `:1956` inside `closePosition` — sets `closedAt`/`exitPrice`/`closeReason`/realized P&L). The `active_open_positions` row is removed in the same close. **Readers of the FINALIZED row:** the Closed Trades display (`trade-history-tab`, `closedOnly=true` → `closed_at IS NOT NULL`), analytics (ghost-filtered), and the learning / exploration-anneal counters.

**What is handed over — and why a row can sit NULL-closed legitimately.** The create-at-open / update-at-close split is deliberate: the `closed_trades` row is the trade's full-lifecycle record. **Between open and close it carries NULL `closed_at`** — and every display / analytics / learning reader filters those out (§item-3), so a not-yet-closed row is invisible and learning-excluded by construction. Working-as-designed, not a leak.

**★ WHAT SILENTLY DROPS THE PAYLOAD HERE — the ONE real gap (item-3 orphans).** If an open position is removed WITHOUT going through `closePosition` — a stranded-clear or a session reset (the paper Open-Trades `Clear Stranded` / `Clear & Reset All` affordances) — the `closed_trades` row created at open is **never updated**, and stays permanently NULL-closed: an **orphan**. **Measured: only 2 such rows** (07-15, 07-18, none since) — one-off, harmless (filtered from every reader, ghost-excluded from learning), documented-not-deleted (B-OPEN-TRADES-DISPLAY item 3). ⇒ **a real-but-rare edge, not an ongoing defect.**

**Dormant-by-decision or dormant-by-defect (§4e):** live and firing (44 closes on 2026-07-24; reason mix stop / target / never_filled / max_holding_period). ⚠️ **The `max_holding_period` sub-driver is currently PAUSED** (paper + live, `max_hold_switch` seeded false 2026-07-24, Kyle) — a dormant-by-DECISION exit; see the max-hold policy thread + the weekend slot-jam (HOP D→E).
**Absence behaviour (§4d):** a position removed outside `closePosition` leaves an honest NULL-closed row (no fabricated close) — which is why the orphans surface as visible data-integrity blemishes rather than silent corruption; the readers' `closed_at IS NOT NULL` filter is the backstop.

---

# 6. ⭐⭐ THE PRICE FLOW — WHERE IT ENTERS, WHAT HAPPENS TO IT, WHO READS IT, WHAT IT DECIDES

> **ADDED 2026-08-30, Kyle-directed, and it is the question this document did not answer:** *"Why can't we trace how the data is flowing? Where it comes in from, what it goes into, what happens to it, what reads it, what decisions are made based on those readings, and are those decisions correct?"*
> **§1-§5 trace the SIGNAL flow — a candidate becoming a trade. This traces the PRICE flow — a number arriving from a venue and ending up in a decision.** They are different paths and only the first was mapped.
>
> ⛔⛔ **EVERY ROW IS SPLIT INTO TWO COLUMNS, AND THE SPLIT IS LOAD-BEARING (Langston ruling, 2026-08-30):**
> - **WHAT IT IS** — descriptive. What the code does, what the table holds, what a counter reads. ✅ **Certified: this class never depended on the intent corpus.**
> - **IS THE DECISION CORRECT?** — dispositional. ⛔ **UNCERTIFIED until `B-DECIDED-INTENT-INDEX` (`#956`, plan row 3b.g) exists**, because *"was this decided, and where"* is not currently answerable by any single search. **A cell reading `DECISION PENDING` means nobody has ruled — NOT that it is broken.**
> ★ **That is the discipline this document previously lacked and it is why the audit wavered: the trace and the verdict were written in the same sentence.**

---

## 6.1 ⛔ CRYPTO — TWO SOCKETS, TWO PRODUCERS, **ONE CACHE SLOT**

| # | hop | WHAT IT IS *(descriptive — certified)* | IS THE DECISION CORRECT? |
|---|---|---|---|
| **1** | **ENTRY — trading adapter** | `wss://ws.kraken.com/v2`. Subscribes **`ticker` + `book` (depth 10) + `instrument`** (`kraken-websocket-adapter.ts:1265-1289`). | ✅ Right venue: we fill here. |
| **2** | **ENTRY — archiver (a SECOND socket)** | Same venue, separate connection, `ohlc(1)` + `ticker` → `crypto_spot_ticker_snap`. | ✅ **Deliberate and load-bearing** — its independence is what makes the exit witness meaningful (`depth-source.ts:86-87`). |
| **3** | **BECOMES — the book mid** | The book ladder is held in memory, **truncated to the granted depth and CRC-verified, resubscribing on mismatch** (`:833-889`). Top-of-book → **`(bestBid+bestAsk)/2`** (`:906`). Emitted `source:'kraken_ws'`, `producer:'kraken_ws_book_mid'`. | ⛔ **DECISION PENDING** — that a **midpoint** is the right thing to compare a stop against. See `#955`/§14 of the audit: in a wide book the mid is a value estimate, not a transactable price. |
| **4** | **BECOMES — the ticker "last"** | `translateV2ToV1` **overwrites the v1 `c` field — nominally *last trade closed* — with `(bid+ask)/2`** (`kraken-v2-translator.ts:52-58`), falling back to `last` only if a side is zero. Emitted `source:'kraken_ws'`, `producer:'kraken_ws_ticker'`. | ⚠️ **The PRODUCER is honest** — its own header says *"Uses Midpoint … instead of Last Trade price."* ⛔ **Two CONSUMING comments call it *"a clean ticker PRINT"* (`#952`).** ⇒ **the two crypto producers differ by WHICH BBO, not by kind.** |
| **5** | ⛔ **HELD — ONE cache slot, last-writer-wins** | Both producers write the same key (`live-pricing-adapter.ts:860`) under **the same `source`**. `producer` distinguishes them; **the actionability gate reads `source` and never `producer` — and that is a documented, deliberate safety property** (`:92-97`). | ⛔ **DECISION PENDING.** The gate is right as designed. **What nobody has ruled on is whether two producers should share one slot at all.** *(Audit rule 1b was WITHDRAWN for aiming at the gate; the write side is the open question.)* |
| **6** | **HELD — the REST leg** | The poller writes the same slot with `source:'kraken_rest'`. ⛔ **When the per-symbol cooldown BLOCKS, `fetchFromKrakenRest` returns a CACHED price as a bare number (`:627-631`) and the caller stamps `observedAt: Date.now()` and `cachedAt: Date.now()` (`:540-549`, `:470-486`).** | ⛔ **NOT A PENDING DECISION — A DEFECT (`#951`, plan 3b.f).** An arbitrarily old price is re-served with both clocks reset, and `kraken_rest` passes the venue gate while `last_known_good` would not. **The rate limiter is deciding actionability.** |
| **7** | **READ — the exit monitor** | `getPriceWithFallback(symbol, 2000)` (`active-execution-engine.ts:1257`) → gates on `age = now − cachedAt ≤ 2000ms` **AND** `isKrakenVenueSource(source)` (`:1277`, `:1289`). Non-venue → discarded, one REST retry, then the position is **skipped** with a named reason. | ✅ **The refusal behaviour is right and better than the audit first described.** ⛔ The 2000 ms window is defeated by hop 6. |
| **8** | **DECIDES — stop / target** | `evaluateTECExit`, three non-test callers, **shared by both lanes.** Compares the hop-7 price against stop and target. **Measured: 23 of 23 stamped closes read a midpoint; zero from any last-trade producer.** | ⛔ **DECISION PENDING** — the audit's central open question, and `OBJ-0` is the instrument. |
| **9** | **FILLS — depth-walked** | The active path walks `getBookForFill` — a real 10-level ladder — for a size-aware VWAP. **VTS books the LEVEL instead.** | ⚠️ **BOTH ARE DECIDED, and differently, ON PURPOSE** — `BATCH_65_COMPLETION_REPORT` objective 7 preserved both conventions deliberately. ⛔ **What is NOT decided: that the row does not record WHICH fill model priced it.** |

---

## 6.2 ⛔ xSTOCK — **ONE SOCKET, NO BOOK CHANNEL, AND THREE DIFFERENT "PRICES" FROM ONE FRAME**

| # | hop | WHAT IT IS *(descriptive — certified)* | IS THE DECISION CORRECT? |
|---|---|---|---|
| **1** | **ENTRY** | `wss://ws-equities.kraken.com`, **ONE connection**, subscribing **`ohlc(1)` + `ticker` and nothing else** (`equity-spot-archiver.ts:237-247`). ⛔ **No `book` subscription exists anywhere in the repo** *(control: the same search finds `book` 4× in the crypto adapter).* | ⛔ **HALF A DECIDED THING.** `B_2_LQ_SWEEP_RESULTS.md:57` (Kyle-pointed, Langston-resolved) ratifies depth as the permanent screen **and names *"`bid_qty`/`ask_qty` + the book ladder"*** as the binding constraint. **We built the first half.** `#949`, plan 3b.d. |
| **2** | ⛔ **NOT A REST ALTERNATIVE** | Kraken publishes **no REST for xStocks** — empirically closed twice. | ✅ **Not a choice. There is one source.** |
| **3** | **BECOMES (a) — the in-memory mark** | `parseTickerSnap` computes **`(bid+ask)/2`, or `last` if a side is zero**, and stores `{price, tsMs}` in a module-private map (`:131-139`). ⛔ **No source tag, so a reader cannot tell a mid from a `last` fallback.** `tsMs` is **receipt time**, not venue time. | ⛔ **DECISION PENDING on the mid** (as crypto hop 3). ⛔ **The untagged fallback is a real gap — a reader cannot know which of two different quantities it holds.** |
| **4** | **BECOMES (b) — the archived row** | The same parsed object, **throttled to ≤1 row per symbol per 4 s**, batch-flushed every 5 s, into `xstock_spot_ticker_snap`. ⚠️ **The row and the hop-3 mark are SIBLINGS from one parse — not independent witnesses.** | ✅ **Correct as an archive.** ⛔ **`#950`: it was built as an archive explicitly forbidden to share state with trading, and then became the trading feed. That inversion was never decided.** |
| **5** | ⭐ **WHAT THE ROW ACTUALLY IS** | ⭐ **`bid`/`ask`/`bid_qty`/`ask_qty` are KRAKEN'S REAL EXECUTABLE TOP-OF-BOOK** — ratified, verbatim. **The other ticker fields (`volume`, `vwap`, `high`, `low`) are UNDERLYING-EQUITY referenced and are NOT the token's.** | ✅ **Decided and correct.** ⚠️ **The audit called this row "synthesised" and "a fake level" — that was WRONG and is corrected.** |
| **6** | **READ (a) — the exit monitor** | `getLatestEquityTick` → the hop-3 **midpoint** (`active-execution-engine.ts:1163`, `:1230-1231`). ⛔ **Staleness is BLOCKING here** — a tick older than the class ceiling yields **no price**, with named skip reasons and a streak alert. ⛔ **No REST fallback exists for this class.** | ✅ **The refusal is right.** ⛔ **DECISION PENDING on the mid — and `#955` makes this the sharpest case: extended-hours spreads average 13.8%, so the mid is 7% from either side.** |
| **7** | **READ (b) — the entry fill** | `depth-source.ts:49-70` reads **one row** and wraps it as a **one-level** ladder. The depth gate's `min_levels` is seeded at **1** for xStock (3 for crypto) and `warmth_max_age_ms` at **15,000** (5,000) against a **4 s** cadence. | ⚠️ **`min_levels=1` is a DOCUMENTED ACCOMMODATION** — the seed comment says *"xStock has only top-of-book."* ⛔ **`warmth_max_age_ms` and `sufficiency_multiple` are NOT accommodations and can discriminate.** ⛔ **And this is an ENTRY gate — it does not gate exits.** |
| **8** | **READ (c) — the scanner** | Reads **`last`** from the same table (`scanner.ts:640`), plus a **20-minute median** of `ask × ask_qty` for the liquidity screen (`:686-693`) — deliberately smoothed *"so the depth gate doesn't flip on a single jittery tick."* | ✅ **The smoothing is a stated, sound decision.** ⚠️ **It is also why a live ladder is not a drop-in replacement.** |
| **9** | ⛔⛔ **THE CONSEQUENCE OF 3 + 7 + 8** | ⭐ **THREE DIFFERENT DEFINITIONS OF "THE xSTOCK PRICE", FROM ONE VENUE FRAME, AT THREE CADENCES: the exit reads an unthrottled in-memory MID; the entry fill walks a ≤4 s-old ASK from the database; the scanner reads LAST.** | ⛔ **DECISION PENDING — and it is the single most important open question in this document.** **Nothing states that these should differ, and nothing states that they should agree.** |
| **10** | **THE WITNESS** | The exit-provenance cross-check reads `xstock_spot_ticker_snap`. ⛔ **On xStock that is THE SAME TABLE the fill's depth-walk reads** (`depth-source.ts:89-93`) ⇒ **a CONSISTENCY record, not corroboration.** On crypto it is a genuinely separate socket. | ✅ **Stated in code and in the schema, deliberately.** ⭐ **It is the reason `F-G-2`'s xStock legs are held.** |

---

## 6.3 ✅ WHAT THIS TRACE SETTLES, AND WHAT IT LEAVES OPEN

**SETTLED — measured, controlled, and not dependent on anyone's intent:**
1. ✅ **There is exactly ONE source per asset class**, and for xStock there is no alternative in existence. **The source was never the open question.**
2. ✅ **The xStock quote we store is Kraken's real executable top-of-book.** Not inferred, not fabricated.
3. ✅ **The wide xStock bids are a genuine symmetric two-sided widening** — `#955`: mean position of the last trade in the spread is 0.45-0.55 in every band, against 0.49 across 5.28 M tight quotes.
4. ✅ **Every exit decision, both classes, both lanes, reads a computed midpoint** — 23 of 23 stamped closes.
5. ✅ **What is missing on xStock is the LADDER, not the quote** — and the ladder was already named as needed by a ratified decision.

**OPEN, AND EACH HAS A HOME:**
| open question | home |
|---|---|
| Should a stop trigger on a midpoint? | `F-G-2` (3c), instrument `OBJ-0` |
| Three xStock price definitions from one frame — intended? | ✅ **`#957` — a SCHEDULED REVIEW (§9.4 disposition 4), placed as the FIRST QUESTION of `B-DECIDED-INTENT-INDEX` (3b.g).** ★ *Filed as a review and not a defect on purpose: calling it a defect would commit the exact error `#956` records — asserting behaviour is unintended from a corpus that cannot answer it.* |
| Should two crypto producers share one cache slot? | write-side reformulation of rule 1b — **unowned** |
| The ladder half of the ratified depth decision | `B-XSTOCK-BOOK-LADDER` (3b.d) |
| An old price re-served with both clocks reset | `B-PRICE-AGE-TRUTH` (3b.f) — **a defect, not a pending decision** |
| A live route pricing a real sell with `Math.random()` | `B-LEGACY-LIVE-EXIT-PATH`, **Phase 21.1.a, hard go-live blocker** |
| *"Was this decided, and where?"* is unanswerable | `B-DECIDED-INTENT-INDEX` (3b.g) — **precedes the redesign** |

⛔⛔ **AND THE HONEST LIMIT ON THIS WHOLE SECTION: every "IS THE DECISION CORRECT?" cell reading `DECISION PENDING` is exactly that — PENDING. It is NOT a finding of breakage, and it may not be cited as one until `#956` lands.** ★ **That is the discipline the audit lacked: the trace is certified, the verdicts on it are not.**


> ⚠️ **STALE LINE CITATIONS CORRECTED 2026-08-31 (`B-PRICE-AGE-TRUTH` Step 2, BLOCKER-3).** The adapter gained ~45 lines and the engine ~8, so every absolute citation to them written before 2026-08-30 resolves to unrelated code. Mapping applied: `:582-586`→`:627-631` · `:496-505`→`:540-549` · `:425-441`→`:470-486` · `lpa:1013`→`:1058` · `aee:1249`→`:1257` · `aee:1020`/`:1025`→`:1277`/`:1289` · `fetchLivePrice:460`→`:504` · `fetchPrice:412`/`:419`→`:456`/`:463`. ⛔ **A reader resolving the OLD numbers at HEAD lands on unrelated code and could conclude either "already fixed" or "never existed."** ★ **This is the FIFTH drift instance in two days, and the class was fixed one document at a time until a reviewer made me grep it — `fix-follows-pointer`.**
