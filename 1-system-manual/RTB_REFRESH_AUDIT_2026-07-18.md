# RTB REFRESH AUDIT — 2026-07-18 (CC-A, Kyle-directed)

**Trigger:** Kyle challenged CC-A's shallow read of the RTB refresh (2026-07-18). This document replaces that read with a code-and-runtime-evidenced audit. Every claim below is cited at `path:line` or backed by a live staging log measurement over a 9-hour window (400,005 lines, 2026-07-18 11:52→20:52 UTC).

**Standing rule applied:** GOVERNED-READ (CLAUDE.md rule 22) — no assertion of absence without presence-evidence; every "not called" is a repo-wide grep with tests excluded.

---

## 0. Executive finding

**The active path runs TWO independent RTB refresh mechanisms concurrently over the same queue.** They were built two days apart in December 2025 by the same Replit agent session. Neither knows about the other. There is no mutual-exclusion guard. **Both feed the same SQE, and either can delete a queued signal.** They differ in what data they refresh: one genuinely re-reads market state, the other re-evaluates a frozen queue-time snapshot.

**PROVEN by runtime evidence, not inference:** in the 9-hour window, 13 distinct symbols were processed by Mechanism A and 13 by Mechanism B — a **13/13 overlap**, with the same signals passing through both within ~14 seconds of each other (e.g. `SOL/USD`, `TRX/EUR`, `BNB/USD`, `SOL/EUR` at 20:52:05 via A and 20:52:19 via B).

---

## 1. The two mechanisms — identity, wiring, cadence

### Mechanism A — per-signal, Central-Clock driven ("the rich refresh")
- **Entry:** `ready_to_buy_service.startRefreshCycle` (`:602`) subscribes a handler to the Central Clock; fires when `tick.tickNumber % RTB_REFRESH_INTERVAL_SECONDS === 0`, `RTB_REFRESH_INTERVAL_SECONDS = 30` (`:361`).
- **Chain:** tick → `executePerSignalRefresh` (`:689`) → per-signal loop (`:716-745`) → `refreshSingleSignal` (`:762`) → SQE at `:945`.
- **Started by:** `active-execution-engine.ts:482` (on engine start) and `startup/trading-bootstrap.ts:65`.
- **Concurrency control:** sets a per-signal `isRefreshing` flag (`:720`), cleared in `finally` (`:738`).

### Mechanism B — standalone bucketed service ("the snapshot refresh")
- **Entry:** `server/index.ts:348` → `rtbRefreshService.start()`.
- **Chain:** micro-cycle tick (`MICRO_CYCLE_INTERVAL = 15`s, `rtb-refresh-service.ts:177`) → bucket index over `TOTAL_BUCKETS = 8` (macro cycle 120s, `:178-179`) → `readyToBuyService.refreshAndRank(mode, bucketKeys)` (`:446`) → chunked batch loop → SQE at `ready_to_buy_service.ts:1219`.
- **Started by:** server boot, unconditionally.
- **Concurrency control:** none with respect to Mechanism A (see §3).

### Cadence consequence
A given queued signal is re-evaluated by **A every 30s** and by **B once per 120s macro cycle** — i.e. roughly **5 SQE evaluations per signal per 2 minutes**, from two mechanisms that disagree about what "refresh" means.

---

## 2. What each mechanism actually refreshes — the material difference

Both build an `SQEInput` and call the **same** evaluator (§4). They differ in the freshness of what they put in it.

| Input | Mechanism A (`refreshSingleSignal`) | Mechanism B (`refreshAndRank` batch) |
|---|---|---|
| `volatility` | `currentVol` — **re-read** | `metadata.volatility ?? 0.3` — **frozen** (`:1206`) |
| spread / geometry | current spread; geometry re-fetch w/ `geometryRefreshed` flag | **not refreshed** |
| maker/taker + `chosenNetEv` | **re-decided this tick** (`_b72bRefreshedMT`), else stored | stored row snapshot — comment: *"No re-decide runs on this path, so feed the stored row snapshot"* (`:1213-1214`) |
| `netExpectedEdge` | **recomputed**, written back to metadata | not recomputed |
| `regimeWeight` | `metadata.regimeWeight` (stored) | `metadata.regimeWeight ?? 0.5` (stored) |
| `trendStrength` | `metadata.trendStrength ?? 0.5` (stored) | same (stored) |
| `regimeStability` | **deliberately not fed** (`:924-930`) | **deliberately not fed** (`:1210`) |
| `finalScore` | recomputed with decay | recomputed with decay |

**Mechanism B's only moving part is the decay term on `finalScore`** — and the finalScore gate is retired (§4), so B's re-evaluation is, for admission purposes, **near-deterministically a no-op**: same inputs in, same verdict out. This — not "disabled gates" — is the arithmetic explanation for `RTB Rejected in Refresh = 0` on crypto.

---

## 3. Collision: no mutual exclusion

- Mechanism A sets/clears the per-signal `isRefreshing` flag (`:720`, `:738`); a reader exists at `:594`.
- `refreshAndRank` (`:1071-1334`) **never reads `isRefreshing`** and never consults `signalRefreshStates` (grep over the function body: zero hits).
- Both paths delete on SQE failure — A at `:959` (`deleteRtbSignals`), B via `bulkDeletes` at `:1235-1238`.

**Consequence:** the same signal can be in-flight in both mechanisms simultaneously, evaluated against different input freshness, with either permitted to evict it. Whichever runs last wins the stored state.

---

## 4. The SQE — one evaluator, confirmed (corrects an earlier CC-A error)

Repo-wide, tests excluded, there are exactly **three** live SQE call sites, all invoking the same function:
- `signal-orchestrator.ts:804` — generation
- `ready_to_buy_service.ts:945` — Mechanism A refresh
- `ready_to_buy_service.ts:1219` — Mechanism B refresh

All three go through `signalQualityEvaluator.evaluate()` (`signal_quality_evaluator.ts:701`) → `evaluateSignalQuality` (`:241`), the full-gate async evaluator. **Refreshed signals are NOT evaluated by a different SQE than new signals.**

**Dead code found:** `evaluateSignalQualitySync` (`:509`) implements a REDUCED gate set (no xstock-market-closed, no strategy-disabled, no Confidence floor, no AMR, no Governance) and has **zero live callers** (grep: no hits outside the file and tests). Same for `evaluateSignalBatch` (`:607`) / `evaluateBatch` (`:715`). These are rule-18 removal candidates and were the source of CC-A's incorrect "two SQEs" suspicion.

**FinalScore gate is genuinely retired — Kyle's recollection is correct.** At `:345-354` the comparison still runs but **nothing is pushed to `failures`**; it emits a shadow log + evidence-sink row only. The gate does not block. What remains live is the *computation and storage* of finalScore (both refresh mechanisms re-derive it) — already homed as **#525 / batch `B-FINALSCORE-PURGE`**, owner CC-B.

**Two gates never block anywhere — ⚠️ CORRECTED 2026-07-19: this is a GOVERNED DECISION, not an audit finding.** P19-B8.5 OBJ-6 (`573b38f83`, 2026-07-16), Kyle GO + Langston APPROVED twice, homed at #514, all three call sites enumerated by Langston (hence the generation site), rationale = both gates keyed off a `regimeStability` fabricated from cold-start defaults and xStock was a structural zero. CC-A's #534 WITHDRAWN as duplicate. The audit's contribution is the COUPLING only: #514's precondition (real drift/volZ wiring) is the same root as the OBJ-2b placeholder-input violation. Original audit text follows for the record:  Both refresh sites AND the generation site pass `{ gateShadowMode: true }`. Under that flag the **Confidence floor** (`:401-413`) and **Governance** (`:444-456`) gates log a would-reject and push nothing to `failures`. These two gates have therefore never rejected a signal at any point in the active path — not merely at refresh. (Prior CC-A statement that this was refresh-specific was wrong.)

---

## 5. Provenance — why this exists

| Date | Commit | Event |
|---|---|---|
| 2025-12-17 | `754b9779a`, `ed7d602eb` | `refreshAndRank` first appears in `ready_to_buy_service.ts` |
| 2025-12-21 | `e0317475b` | *"Refine trading logic by removing outdated TTL and simplifying refresh mechanisms"* — R9.3 Integrity Rebuild adds **per-signal refresh timers** (Mechanism A), removes TTL-based expiry, deletes `server/legacy/rtbQueueRefresher.legacy.ts` |
| 2025-12-23 | `7a029f390` | *"Introduce a separate service for refreshing and ranking trading signals… decoupling it from the FX5 scan loop"* — extracts the pre-existing `refreshAndRank` into the standalone 15s service (Mechanism B) |

Both commits carry the **same** `Replit-Commit-Session-Id: 4ce4eda7-…` — one continuous Replit-agent session. The Dec-21 commit's stated intent was to *simplify* refresh mechanisms; two days later the same session **promoted the older mechanism into its own service instead of retiring it**. Classic Replit-era accretion — precisely the multi-generation legacy overlay CLAUDE.md rule 23 (FIX-ON-FIND) was written for.

This is **not** a Phase-8-vs-Phase-19 split. Both predate the migration and both survived it untouched.

## 5.0 THE ORIGINATING DIRECTIVE — Mechanism A was built to REPLACE the batch-with-stagger model

> ⚠️ **The disposition stated at the end of this section is SUPERSEDED by §5.0-CORRECTION below.** The directive evidence here is accurate; CC-A's inference from it about which mechanism should survive was not.

Source: `attached_assets/Pasted--Directive-8-8-4-A3-R9-3-Integrity-Completion-Deprecati_1766328922627.txt`, added BY commit `e0317475b` (2025-12-21). Title: **"Directive 8.8.4-A3.R9.3 — Integrity Completion & Deprecation Sweep (Final)."**

This document resolves the provenance question definitively. The two mechanisms are NOT a coexistence-by-design; **Mechanism B is a resurrection of a model that had just been formally deprecated.**

**The batch model was listed as a DEFECT to remove — problem P1:**
> "Global refresh barrier blocks TCL — **Batch-with-stagger model** prevents trades during most of each cycle. Impact: TCL appears 'random' or 'stuck.'"

**Directive R9.3-A ordered its REPLACEMENT (not augmentation):**
> "**Replace batch-with-stagger refresh system** with independent timers per signal. Each signal refreshes itself every 30 s (synced to central clock). • Use `nextRefreshAt` timestamp per signal. • Hook to central clock tick. • **Remove `rtbRefreshComplete` barrier entirely.** • **Add `isRefreshing` flag per signal to prevent TCL promoting signals mid-refresh.**"

That is Mechanism A, verbatim — and it explains why the `isRefreshing` flag exists at all (`:720`/`:738`/`:594`): the directive created it as the replacement's concurrency primitive. Mechanism B never reads it because Mechanism B was supposed to be **gone**.

**The directive also forbade exactly what happened next — §7 Architectural Integrity Notes:**
> "**No new services or helpers introduced.** All logic confined to existing modules (`ready_to_buy_service`, `tcl_watchdog`, etc.). Central clock remains single source of timing truth."

**Two days later**, commit `7a029f390` (2025-12-23), **same Replit session**, created `server/services/rtb-refresh-service.ts` — a NEW SERVICE on its own 15s interval — reviving `refreshAndRank`, the batch path R9.3-A had just replaced. That single commit violated both halves of the directive it was two days downstream of: it introduced a new service, and it restored the deprecated batch model. Its stated motive ("decoupling refresh from the FX5 scan loop") was a legitimate problem solved with the mechanism that had just been retired, apparently without recognising it as such.

**Net:** the dual-mechanism state is an *un-completed deprecation*, reversed 48 hours after it landed, running unnoticed for ~7 months across the Replit→clone migration. This materially strengthens the §9 disposition: consolidation is not a design choice between two valid options — it is **finishing R9.3-A as originally directed**, with Mechanism A as the intended survivor (subject to §8's requirement that it re-read every SQE-consumed input).

**Corollary — the no-expiry behaviour is DELIBERATE, not an oversight.** R9.3-C ordered TTL removal outright: *"Eliminate time-to-live expiry for signals. Lifecycle now governed solely by SQE results… Delete TTL constants and `signal.expiresAt` assignments."* §5 of the directive confirms the intended end-state: *"Signals live indefinitely while passing SQE; they expire only when failing revalidation."* So the absence of a stale-drop category is a considered 2025 decision, not a forgotten one. Whether it remains correct under active trading is a live question for `B-RTB-REFRESH-CONSOLIDATE` — but it must be re-decided, not "fixed" as a bug.

**Also confirmed by the directive:** the `[A3.R9.3][REFRESH_COMPLETE]` marker this audit measured in §6 is the directive's own prescribed diagnostic (§5: *"Trace logs show `[A3.R9.3][REFRESH_COMPLETE] symbol=XYZ` per signal cycle"*), and its verification protocol expected one per signal **within 30 s** — which is the yardstick the §6 tick anomaly (7 ticks / 9 h) should be measured against.

## 5.0-CORRECTION ★ THE CANONICAL DOCS SAY THE OPPOSITE — disposition REVERSED (2026-07-19, Kyle-directed read of `bridge/canonical/`)

**CC-A's §5.0 disposition above ("Mechanism A is the intended survivor; consolidation = finishing R9.3-A") was ASSERTED TOO STRONGLY and is corrected here.** Kyle directed a read of the nine canonical reference documents in `bridge/canonical/`. They invert the conclusion.

**Mechanism B is THE documented RTB refresh architecture.** It is not an accidental survivor — it is the blessed, named, invested-in design:
- `DawnTrader_Current_State_Reference.md` — **an entire numbered section: "# 8. RTB Refresh System"**, `File: server/services/rtb-refresh-service.ts`, §8.1 Architecture (micro 15s / macro 120s / 8 buckets / adaptive 3-10 workers), §8.2 the **Adaptive Concurrency Tuner (ACT)** with explicit scale-up/scale-down/lag-protection rules.
- `DawnTrader_System_Architecture_Execution_Flow.md` (48KB, dated 2026-05-15 — i.e. still canonical POST-migration) — the top-level system diagram (`:125`) renders **"RTB Refresh (15s) / 8 buckets, ACT / Adaptive concur."** as a first-class pipeline component; the services table (`:195`) lists it; §9.1.2 + §9.2 "Refresh Architecture" specify it; the cadence table (`:806`) carries it.
- `DawnTrader_Complete_Project_History.md` — **Part 10, Phase 8.8.4 "Key Implementations" item 1: "RTB Refresh Service: Bucket-based signal refresh (15s/bucket)"**, item 2 "Adaptive Concurrency Tuner (ACT)".

**Mechanism A is ABSENT from the canonical corpus — entirely.** A grep across all nine documents for `executePerSignalRefresh`, `refreshSingleSignal`, `startRefreshCycle`, `isRefreshing`, and `R9.3` returns **zero hits**. The mechanism the R9.3 directive ordered built has never appeared in any canonical architecture document.

### What this means — the corrected reading

Both the directive and the service are **Phase 8.8.4 work** (the directive is literally numbered `8.8.4-A3.R9.3`). The honest sequence is:

1. `refreshAndRank` exists inside the scan loop (Dec 17).
2. R9.3-A (Dec 21) orders the **batch-with-stagger** model replaced by per-signal timers, citing defect P1 (the global refresh barrier blocking TCL). Mechanism A is built.
3. Dec 23 — same session — builds a **bucketed service with adaptive concurrency**. This is **NOT** simply a resurrection of the deprecated batch-with-stagger model, as §5.0 claimed: the 8-bucket rotation *structurally eliminates* P1's global barrier by design. It is a **third architecture** that solves the directive's stated problem by different means, reusing `refreshAndRank` as its worker.
4. That third architecture is then documented, given ACT, and carried forward as canonical through May 2026.
5. Mechanism A is never removed and never documented.

So this is **not** an un-completed deprecation with an obvious survivor. It is a **superseded directive** (R9.3-A's specific remedy was overtaken by a better one two days later) whose *implementation was never withdrawn*, leaving the losing mechanism running invisibly for ~7 months beside the winner.

### The sharp irony — and the actual decision

**The DOCUMENTED, blessed, ACT-instrumented mechanism (B) is the one that does NOT refresh data (§2). The UNDOCUMENTED mechanism (A) is the one that does what Kyle expects a refresh to do** — re-read volatility, spread, geometry, re-decide maker/taker, recompute net expected edge.

Therefore `B-RTB-REFRESH-CONSOLIDATE` is **a genuine design decision, not a cleanup**:
- **Keep B (documented, bucketed, ACT-tuned, load-managed) and port A's data-refresh behaviour into it** — the likely correct answer, since B's concurrency/backpressure engineering is real and A has none; or
- Keep A and re-document, discarding the ACT/bucket investment.

§8's refresh contract governs either way: whichever survives MUST re-read every SQE-consumed input and fail loud on missing inputs. **Recommendation: keep B's scheduling/concurrency skeleton, transplant A's refresh semantics into it, delete A.** Langston to rule.

**Governance note:** the canonical corpus documents only half of what runs. Any future audit that reads `bridge/canonical/` alone would never learn Mechanism A exists — the same blind spot that let the June 2026 pipeline audit (§5.1) miss it from the other direction. The consolidation batch must update the canonical docs, not just the code.

## 5.1 Why the June 2026 pipeline audit missed it

`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md` references `refreshAndRank` exactly once (`:192` — noting it recomputes finalScore but not rankingScore). It contains **no reference** to `executePerSignalRefresh`, `refreshSingleSignal`, the Central-Clock subscription, or the existence of a second mechanism. The audit traced the batch path and stopped. That audit also already flagged (`:177`) the placeholder inputs — `regimeStability` from hardcoded `computeGlobalStability(0.5, 0, confidence)`, `trendStrength` hardcoded `0.5`, `volatility` default `0.3` — which remain live.

---

## 6. Runtime measurement (9h window, staging, 2026-07-18 11:52→20:52 UTC)

| Marker | Count | Meaning |
|---|---|---|
| `[11.0E][REFRESH_COMPLETE]` | 105 | Mechanism A outcomes |
| `[11.0E][RECONFIRM_COMPLETE]` | 28 | Mechanism B outcomes |
| `[A3.R9.3][RTB_REFRESH][TICK]` | 7 | Mechanism A ticks — **anomalously low** vs ~1,080 expected at 30s |
| rtb-refresh-service markers | 1,036 | Mechanism B service activity |
| Symbols in A | 13 | — |
| Symbols in B | 13 | — |
| **Symbols in BOTH** | **13** | **100% overlap — double-processing confirmed** |

**Open thread (NOT resolved by this audit):** the tick count (7) is irreconcilable with a 30-second timer over 9 hours, and the observed outcome volume (133 in 9h) cannot produce the funnel's cumulative 25,917 reconfirmations since 2026-07-14. Either the counter counts something other than what its label implies, or the cadence changed materially. **This must be resolved before any funnel number is trusted.**

---

## 7. Safety-relevant consequence — the #523 backstop ruling

Issue **#523** (2026-07-16) converted the `[11.8B]` net-expectancy open-gate from **BLOCK → SHADOW**. Langston's hard GO/NO-GO condition was proof that the refresh evicts negative-net-EV signals. The proof recorded in #523 cites `ready_to_buy_service.ts:946` and `:959` — **both inside `refreshSingleSignal`, i.e. Mechanism A only.**

Mechanism B does **not** re-decide net expectancy; it replays the stored snapshot (§2). Since B also runs, and either mechanism can be the last writer of queue state, the redundancy argument that justified removing a live blocking backstop rests on **one of two mechanisms**, not on the system as it actually runs.

**This audit does not conclude the backstop removal was wrong.** It concludes the evidence base for that ruling was incomplete, and Langston — who issued it — must re-examine it with the two-mechanism picture in hand. Flagged as blocking on the pre-live gate (#522 family).

---

## 8. What the RTB refresh SHOULD do — proposed definition (for Kyle/Langston ratification)

Kyle's stated intent, to be adopted as the contract:

> The RTB refresh updates a queued signal to its **current form** — re-reading every input the SQE evaluates — and then re-evaluates it through the **same SQE a new signal would face**. A signal that can no longer supply an input the SQE needs is **rejected loudly**, not passed on stale or absent data.

Derived requirements:
1. **ONE refresh mechanism.** Parallelism = chunking within it, never a second scheduler.
2. **Every SQE-consumed input re-read at refresh** — volatility, spread, geometry, regime, regime stability, net expectancy, pool context. Anything deliberately frozen must be named and justified in governance.
3. **Fail-loud on missing inputs.** The current `chosenNetEv != null` fail-open (`signal_quality_evaluator.ts:362`) and the silent unclassifiable-asset-class drop (`:1183-1188`, `:904-910`) are the opposite of this.
4. **Every queue exit counted** — promoted, rejected-in-refresh, error, superseded, unclassifiable, dropped. No silent deletes.
5. **Shadow-mode gates are a decision, not a default.** Confidence + Governance being globally non-blocking must be an explicit ratified state or be un-shadowed.

---

## 9. Homed work (§9.4 — every item gets a named home)

| # | Item | Home |
|---|---|---|
| #532 | **RTB refresh dual-mechanism consolidation** (this audit's core) — reconcile to one mechanism against the §8 contract; resolve the §6 telemetry anomaly | **`B-RTB-REFRESH-CONSOLIDATE`** — new batch, pre-Phase-21, Langston-gated |
| #533 | **SQE dead-code purge** — `evaluateSignalQualitySync`, `evaluateSignalBatch`/`evaluateBatch`, stale TTL header comment (`:16-20`) | **`B-SQE-DEADCODE-PURGE`** — new batch (rule 18: no lingering legacy) |
| #534 | **Globally non-blocking Confidence + Governance gates** — ratify-or-unshadow | folds into `B-RTB-REFRESH-CONSOLIDATE` scope; Langston rules |
| #535 | **#523 backstop re-examination** with the two-mechanism picture | Langston, before the #522 pre-live gate |
| — | FinalScore compute/store purge | already homed: #525 / `B-FINALSCORE-PURGE` (CC-B) |
| — | Funnel exit-counter completeness | already homed: #419 (B8.5 observability) — **widen to cover the §6 anomaly** |

---

## 10. Method note

Claims in §§1-6 are from direct reads of `ready_to_buy_service.ts`, `signal_quality_evaluator.ts`, `rtb-refresh-service.ts`, `active-execution-engine.ts`, `index.ts`, git history, and the staging log. **Not yet verified and deliberately excluded:** the additional queue-exit paths (superseded-by-re-detection, duplicate purge, confidence sweep, failed-execution-after-removal) reported by an exploratory agent earlier and never independently confirmed by CC-A. They are candidates for the consolidation batch's own pre-audit, not findings of this document.
