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

## 5. THE HOPS — *(not yet written; §4 classification precedes it)*
