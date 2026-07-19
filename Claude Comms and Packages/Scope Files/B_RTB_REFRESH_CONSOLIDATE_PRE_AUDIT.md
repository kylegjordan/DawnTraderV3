# B-RTB-REFRESH-CONSOLIDATE — Step-2 Pre-Audit (CC-A, 2026-07-19)

**Langston Step-1: all five questions ruled.** Q1 survivor ENDORSED (condition: this table is the transplant design spec, authored before code). Q2 ratify-as-shadow. Q3 no-expiry HOLDS conditional on OBJ-3. Q4 #535 folded into his Step-2 pass. Q5 staging agreed with a caveat (CC-A has proposed INVERTING the order — see §5, ruling pending).

**Langston's scope reframe, accepted:** *"B currently reads everything off the frozen snapshot, so this is a REWIRE of every input builder in `refreshAndRank`'s path, not a graft."* Scoped as a rewire.

---

## 1. §9.5(a) COMPONENT CENSUS — the RTB queue (`rtb_signals`)

Not a path trace. Every actor that touches the queue, repo-wide, tests excluded.

| Census question | Actors found |
|---|---|
| **Writes/creates** | `queueSQESignal` (`ready_to_buy_service.ts:2241`) — sole admission, post-SQE |
| **Reads** | `getQueuedSignals`, `getRankedSignals` (`:1976`, promotion), the 4 display routes, the shadow capture (`:2054`) |
| **Mutates** | Mech A `updateRtbSignal` (`:966`); Mech B `updateRtbSignalsBatch` (bulkUpdates `:1243`) |
| **★ DELETES** | **(1)** Mech A SQE-fail `:959` · **(2)** Mech A unclassifiable `:904` · **(3)** Mech B SQE-fail bulkDelete `:1235` · **(4)** Mech B unclassifiable `:1183` · **(5)** Mech B catch-block `:1267` · **(6)** `expireSignal` hard-delete (`:1635`) · **(7)** promotion removal (`active-execution-engine.ts:2207`) · **(8)** `cleanupExpiredSignals` legacy sweep (`:1737`) |
| **Schedules against it** | Mech A: `active-execution-engine.ts:482` + `trading-bootstrap.ts:65` → Central Clock 30s · Mech B: `index.ts:348` → 15s/8-bucket · `executeRefreshCycle` (`:1011`) — **no external callers, verify-dead** |

**The census earns its place immediately:** the deleter question returns **eight** sites. The June audit and CC-A's first pass each found *one* refresh because a path trace only needs one. Of the eight, only (1) and (3) increment a funnel counter — **six silent deletes** (OBJ-4).

---

## 2. ★ THE OBJ-2 CONTRACT TABLE — the transplant design spec

Extends the existing enumeration in `P19_B8_5a_PRE_AUDIT.md:21` (not duplicated). "Honest source" = what the input would be if the refresh met its contract.

| SQE input | Consuming gate | Gate live? | Honest source | Generation | Mech A | Mech B (survivor) | **Rewire disposition** |
|---|---|---|---|---|---|---|---|
| `signalId`/`symbol`/`strategy`/`mode`/`assetClass` | routing | — | the row | fed | fed | fed | **identity — no refresh** |
| `chosenNetEv` | **NetEV** | ★ **BLOCKS** | maker/taker re-decide on current geometry | live | re-decided *or* stored | **STORED** | ★★ **REWIRE — highest priority** |
| `regimeWeight` | **RegimeWeight** | ★ **BLOCKS** | `calculateRegimeWeight` on current regime | live | **STORED** | **STORED** | ★★ **REWIRE — neither mechanism refreshes an input to a live blocking gate** |
| `volatility` | scoring inputs | indirect | current realised vol | live | **live (`currentVol`)** | `metadata ?? 0.3` | **REWIRE** (port A's read) |
| `confidence` | Confidence floor | shadowed | signal metrics | live | STORED | STORED | REWIRE (cheap, same read as regimeWeight) |
| `trendStrength` | feeds `regimeWeight` | via above | real trend calc | **hardcoded `0.5`** | `metadata ?? 0.5` | `metadata ?? 0.5` | **OBJ-2b — fabricated AT SOURCE**; honest-source or loud refusal |
| `regimeStability` | Confidence + Governance | **shadowed** | real drift/volZ | **fabricated** (`computeGlobalStability(0.5,0,confidence)`) | **NOT FED** | **NOT FED** | **#514 coupling — Langston Q2 ambiguity, ruling pending (§4)** |
| `sourcePool` | pattern floor + AMR | live | queue-time value | fed | frozen at-queue | frozen at-queue | **KEEP FROZEN — governed exception.** Queue-time IS correct: the lane a signal was admitted under is a historical fact, not current state |
| `finalScore` | — | **RETIRED** | n/a | computed | recomputed w/ decay | recomputed w/ decay | **no refresh value** — compute/store purge is #525 / `B-FINALSCORE-PURGE` (CC-B) |
| `entryPrice`/`targetPrice`/`regime` | ROI | **DORMANT** | n/a | absent | absent | absent | **ALREADY DISPOSITIONED — not a finding.** `P19_B8_5a_PRE_AUDIT.md:17`: absent at all sites by design, redundant with netEV; Phase-25 (25-4) rules retire-vs-keep. Ledger-checked per §9.5(b-ii) before recording |

### The headline the table produces

**⚠️ PRECISION CORRECTION (2026-07-19, Kyle asked "where is this happening — the SQE?"). CC-A's "only two gates block" was IMPRECISE.** FIVE things can block in the SQE: (1) xStock market-closed early-return `:272`; (2) strategy-disabled-for-class early-return `:295`; (3) **AMR** `:415-437` (pushes failures when `!amr.allowed`; blocks only in `active` mode — `disabled` no-ops, `shadow` dry-runs); (4) NetEV `:362`; (5) RegimeWeight `:367`. Non-blocking: FinalScore (retired, shadow-log), ROI (dormant), Confidence + Governance (`gateShadowMode`).

**Where each thing lives — the answer to Kyle's question:** the GATES are in the SQE; that is where accept/reject happens. The STALENESS originates in the REFRESH, which assembles the SQEInput and hands it over. The SQE evaluates faithfully and cannot detect that a supplied value is stale. **The SQE is not at fault; the refresh is.**

**The corrected — and sharper — claim: of the five blocking gates, only TWO reach their verdict using market data the refresh is responsible for keeping current — NetEV and RegimeWeight — and the survivor feeds both of them stale values.** (1) and (2) are eligibility checks independent of refreshed data. (3) AMR is **structurally immune** — and the reason is the most telling artifact in this audit:

> `signal_quality_evaluator.ts:415-421` — *"per-class AMR admission gates — UNCONDITIONAL (no skip option) and **SELF-SOURCING (the gate resolves flag/mode itself; the RTB refresh path re-runs SQE with partial inputs, so caller-injected context would silently skip gating there)**."*

**The AMR author KNEW the refresh hands the SQE partial inputs, and hardened one gate against it — the systemic cause was never addressed.** A component-level defence around a system-level defect, documented in-line and left standing. This is corroborating evidence for the batch, and it belongs in the completion report as the precedent for why OBJ-2's contract must be enforced at the refresh rather than defended gate-by-gate.

So: **NetEV and RegimeWeight are the entire data-driven admission decision on the active path, and both run on stale inputs under the survivor.** NetEV is the more serious: it is the *binding* admission gate (per #501, the fee wall makes it the constraint), and Mechanism B replays a queue-time snapshot of it. A signal whose net expectancy went negative after queueing is reconfirmed by B on the old number.

That single row is the batch's justification. Everything else is hygiene by comparison.

### ★ Step-3 finding: the frozen-snapshot loop is SELF-PERPETUATING (verified 2026-07-19)

Mechanism B's `bulkUpdates` metadata write (`:1243-1262`) contains **none** of the freshness fields: no `volatility`, no `spread`, no `lastCostRefresh`, no `netExpectedEdge`, no `chosenNetEv`/`chosenEntryMode`. Mechanism A writes all of them (`:966-1000`).

So B does not merely *read* stale values — **it leaves them stale.** Every field the refresh contract cares about is written by A alone. Two consequences:

1. **The transplant is not optional for correctness of the survivor.** Disabling A without it (Langston's original staging step-1) would freeze those fields permanently — this is the precise mechanism behind the "worse than status quo" window he flagged, and it confirms the inversion (§5) on evidence rather than intuition.
2. **`shouldRecalculateGeometry` is throttled on `metadata.lastCostRefresh`** (`:311-338`; also volatility-shift and spread-shift thresholds — a legitimate efficiency guard, NOT a defect). Under a B-only world that timestamp would never advance, so the age branch would always fire. Moot only because B does no geometry refresh at all.

**Design consequence adopted:** the transplant is implemented as an **EXTRACT-THEN-SHARE**, not a copy — A's live-data acquisition becomes one private method that BOTH mechanisms call. After extraction both paths execute identical code, which makes staging step 1 provably behaviour-preserving for A while making B honest. A's deletion then removes a caller, not logic.

---

## 3. OBJ-3 targets (fail-loud), with Langston's Q3 guardrail

Q3 ruled no-expiry HOLDS **conditional on** un-refreshable signals being ejected, not left to sit. Targets:
1. `chosenNetEv != null` fail-open skip (`signal_quality_evaluator.ts:362`) — **shares the #535 seam; Langston rules in his Step-2 pass (Q4). Design once.** Note the B8.5a rationale for fail-open was legacy-row mass-deletion at deploy; after queue turnover that rationale has expired.
2. Unclassifiable asset class — census deleters (2) + (4). A queued row was stamped at write; unresolvable at refresh means upstream breakage → **alarm, not silent drop**.
3. Refresh catch-block — census deleter (5), zero telemetry (#419).

**Verification criterion (Langston verbatim):** *an un-refreshable signal is EJECTED, not aged out.*

---

## 4. ⚠️ OPEN — the `regimeStability` conflict (blocks Step-3)

Langston Q2 says document it as a **named governed frozen-exception** ("fed when they go blocking"), yet the same paragraph calls feeding it "OBJ-2 work". **CC-B accepted the #514 hand-off on the basis that THIS batch wires the honest inputs**, and Kyle was told that is what un-parks the bury-or-resurrect decision. Both cannot hold.

Asymmetry that makes it urgent: while the input stays fabricated, the shadow gates keep writing would-have-blocked notes computed from a made-up number — **#514's evidence is accruing worthless, and that day is unrecoverable.**

Ruling requested (dispatched): **(a)** wire honest inputs, gates stay shadowed regardless (wiring ≠ un-shadowing) — discharges #514, preserves the admission freeze; or **(b)** freeze as written — CC-A then withdraws the discharge to Kyle + CC-B and #514 stays parked on knowingly-worthless collection. Table row above stays UNRESOLVED until ruled.

---

## 5. Staging — CC-A proposes INVERTING Langston's agreed order

Langston agreed with the original (disable A → run B alone → transplant) but flagged: in that window **nothing re-reads live state — arguably worse than status quo**. Rather than accept a knowingly-worse window on a live paper soak, invert:

1. **Transplant first** — rewire B's input builders. Both mechanisms run briefly (double-processing persists) but **both are now honest**, which is strictly better than one mechanism on frozen data.
2. **Then disable A's starters** — trivial rollback; by then the survivor is proven refreshing.

**Every intermediate state is at least as good as today, never worse.** Cost: the risky rewire lands while A is live — but A running *is* the safety net during exactly that step. Langston's call; if he holds his order, the window stays hours and monitored per his caveat.

---

## 6. Blast radius (unchanged from scope) + rollback

Per scope §4. **Rollback:** re-enable Mechanism A's two starters (one line each) — restores today's behaviour exactly. Under the inverted order, rollback of step 1 is a revert of the input builders with A still live.

## 7. Verification criteria (additions to scope §5)

- Census re-run post-change: schedulers = 1; deleters all counted (8 → 8 with telemetry).
- **Un-refreshable signal ejected + alarmed, not aged out** (Langston Q3).
- A live row's stored `chosen_net_ev` + `regime_weight` observably CHANGE across refresh cycles (proves the rewire, not just the wiring).
- Double-processing test: symbols in two mechanisms = 0 (was 13/13).


---

# STEP-1 (TRANSPLANT) — DEPLOYED + VERIFIED, 2026-07-19

**Commit `534d9471a`** · Langston Step-4 **APPROVED** (independently re-read the diff; lifted his REPORTED-FACT qualifier on all three STORED-vs-live claims) · CI 4-green run `29667343987` · deployed, HTTP 200, staging at ref with 4 `acquireRefreshedInputs` occurrences · bench tsc baseline OK, vitest 0 failed / 2332 passed, new suite 11/11.

## The end-to-end proof (better than the planned criterion)

The refresh log **distinguishes the two mechanisms by wording**:
- `NetEV-only **refresh** failure` → Mechanism A (per-signal)
- `NetEV-only **batch-refresh** failure` → **Mechanism B, the survivor**

**For the survivor to FAIL a NetEV check, the SQE must have been handed a real re-decided netEV** — precisely what it never received before this change (it replayed the stored snapshot). Those batch-refresh lines are the transplant working end-to-end: B → shared acquisition → maker/taker re-decide on current geometry → live `chosenNetEv` → SQE NetEV gate.

Corroborating: `GEOMETRY_REFRESH` + `RTB_REFRESH][MAKER_TAKER` re-decides now fire where the survivor previously did **neither**. `XRP/USDT` re-decided **twice within one second** = both mechanisms on the shared method — the benign overlap Langston predicted, converging on identical values.

## Zero evictions — CORRECT, not a dead gate
Every queued signal shows NEGATIVE netEV yet `SQE_REVALIDATION_FAIL = 0`. Cause: **28 `EXPLORATION_REFRESH_PASS` events** — exploration-lane admits whose stamp deliberately overrides NetEV (Kyle-GO 28/day budget). Working as designed. Recorded because it looks alarming and is not.

## Boot-window condition observed — PRE-EXISTING, not this batch
`TEC_CACHE_MISS_FATAL` (crypto_spot) fires for a few seconds after every restart, breaking exit-checks during the window, then self-clears. **Verified pre-existing: 20 occurrences in the 9h PRE-deploy capture**; zero in the current steady state. Not caused by this change; references its own `BATCH_79_TEC_SCOPE.md §1 #8`. Ledger-check + disposition owed before this batch closes (§9.5(b-ii)) — NOT filed as a finding here.

## ⚠️ Step-2 gate: HALF satisfied — NOT clearance
Langston's condition was `chosen_net_ev` **AND** `regime_weight` observably moving before A retires.
- `chosen_net_ev` — **OBSERVED moving** (re-decide log lines with computed values). ✓
- `regime_weight` — **NOT moving, and cannot be**: its recompute is step-2 work; both paths still read it stored. ✗

**CC-A is NOT treating this as clearance.** Revised step-2 order (dispatched to Langston): land the remaining input work FIRST (regimeWeight recompute, regimeStability honest wiring per ruling (a), trendStrength/OBJ-2b, OBJ-3, OBJ-4) → THEN the observe criterion can be met on BOTH fields → THEN retire A last. Keeps the gate intact rather than reinterpreting it.

## Remaining for step 2
regimeWeight recompute · regimeStability honest wiring (#514 discharge) · trendStrength (OBJ-2b) · OBJ-3 fail-loud (awaits Langston's #535 netEV ruling so the skip is designed once) · OBJ-4 exit counters (the six silent deleters) · the §6 telemetry anomaly · A's retirement (rule 18) · SIM + System Manual (OBJ-6).


---

# STEP-2 DESIGN FINDINGS (CC-A, 2026-07-19) — honest-source investigation

Establishes, per input, whether OBJ-2b resolves to **wire it** or **loud refusal** (OBJ-3). Both findings below are material and change how OBJ-2b must be written.

## ★ FINDING 1 — `regimeWeight` is 70% a FABRICATED CONSTANT

`calculateRegimeWeight` (`server/core/utils/score-calculator.ts:71`) is:

```
regimeWeight = (trendScore × 0.70) + ((1 − normalizedVolatility) × 0.30)
```

Its only two inputs are `trendStrength` and `volatility`. And `trendStrength` is **hardcoded `0.5` at generation** (`signal-orchestrator.ts`, confirmed in the contract table above; also flagged by the June audit at `:177`).

**Therefore: `regimeWeight` — an input to one of the only two data-driven BLOCKING gates — is 70% determined by a hardcoded constant.** Substituting: `regimeWeight = 0.35 + 0.30 × (1 − volatility)`. The entire live range of that gate's input is the 0.30 volatility term; the dominant 0.70 term never moves.

**Consequence for OBJ-2b:** recomputing `regimeWeight` at refresh (now possible — the transplant already fetches live volatility) makes the 30% term honest and is a genuine improvement, **but it does NOT fix the gate** — the dominant term stays fabricated until `trendStrength` has a real source. **Recomputing alone would be a cosmetic fix that LOOKS like a repair.** This must be stated plainly in the completion report and must not be presented as "regimeWeight is now honest."

**Disposition (proposed, Langston to rule):** recompute at refresh with live volatility (partial honesty, no downside) **AND** file the `trendStrength` fabrication as its own named item — it is not fixable inside a refresh batch because the honest source does not exist anywhere; a real trend-strength computation is new work. Do NOT let the recompute silently discharge the placeholder violation.

## ★ FINDING 2 — an HONEST `regimeStability` source EXISTS and is exported

The active path fabricates it via `computeGlobalStability(0.5, 0, confidence)`. But the real producer is live:
- `governance-engine.ts:83` — `computeGlobalStability(driftScore, volZ, regimeConfidence)` with **real** drift/volZ from `GovernanceContext`.
- **`getStabilityState()` is EXPORTED** (`regime-stability.ts:170`), returning `{ stability: RegimeStability | null, metrics, reason, flipRate, lastComputed }` — the cached, honestly-computed classification.

**So #514's precondition ("real active-path drift/volZ stability wiring") may be dischargeable by CONSUMING an existing producer rather than building one.** Proposed wiring: call `getStabilityState()` at refresh → non-null `stability` → feed it (honest); null → **loud refusal per OBJ-3**, never fabricate.

**⚠️ OPEN — the crux, must be verified before committing to this:** does `applyGovernance` (the thing that populates the cache) actually RUN on the ACTIVE path, or only on VTS? If it never runs on active, `getStabilityState()` returns null there and the disposition collapses to loud-refusal-only — which still satisfies OBJ-3 but does **NOT** discharge #514 (the evidence would stay unavailable rather than fabricated). **This single question decides whether #514's discharge is real.** Next action for step 2.

## Sequencing consequence
OBJ-2b splits into three distinct dispositions, not one:
1. `volatility` — **DONE** (step 1 transplant).
2. `regimeStability` — **wire-or-refuse**, pending the `applyGovernance`-on-active question above.
3. `trendStrength` — **NOT fixable here**; needs its own named item for a real trend-strength source. The `regimeWeight` recompute rides on this and must not be claimed as a fix.


## ★ CRUX RESOLVED — Finding 2 COLLAPSES; the #514 discharge is WITHDRAWN (2026-07-19)

**`applyGovernance` has ZERO callers repo-wide** (tests excluded; live log shows zero stability/drift/volZ activity). The honest producer — `computeGlobalStability(driftScore, volZ, …)` at `governance-engine.ts:83` — lives *inside* that dead function. So the stability cache is never populated on ANY path, `getStabilityState()` would always return `stability: null`, and its only consumer (`governance-engine.ts:187`) is itself unreachable.

**Finding 2's optimistic reading is wrong: there is no consumable honest source. The producer exists as code and is never invoked.**

**§9.5(b-ii) ledger search — BOTH halves already filed; NOTHING new to file (5th catch):**
- **#219 OPEN** (B-4.7, Langston pre-audit item d, 2026-06-11) — *"`applyGovernance` (regime-stability path) has zero production callers — the flip-rate governance input is dead config. Phase 16 review."*
- **#233 OPEN** (P19-B3b, 2026-06-14) — the `computeGlobalStability` driftScore/volZ **fabricated-defaults** concern, explicitly flagged as distinct and still open.

### Consequence 1 — the #514 hand-off is WITHDRAWN (CC-A error, owned)
CC-B accepted the hand-off on the basis that **this batch wires honest drift/volZ**. It cannot. Doing so requires resolving **#219** (call the producer at all) and **#233** (give it real inputs) — Phase-16 / separate work, not refresh work. Withdrawn promptly rather than carried as a promise this batch can't keep. #514 stays parked on its original precondition.

### Consequence 2 — a precision error in CC-A's own coupling claim
The fabrication that poisons #514's shadow evidence happens at the **GENERATION** site (`computeGlobalStability(0.5, 0, confidence)` in `signal-orchestrator`), which is where the shadow gates actually evaluate. **This batch touches the REFRESH.** At refresh, `regimeStability` is simply *not fed* — so the gates skip rather than evaluate garbage.

**Therefore the refresh was never the right vehicle for the #514 evidence-quality problem, and CC-A's coupling argument was wrong in that specific respect.** The correct home is the generation site + #219/#233, not here.

### Revised OBJ-2b disposition (Langston to ratify)
| Input | Disposition |
|---|---|
| `volatility` | ✅ DONE — live at refresh (step-1 transplant) |
| `regimeStability` | **NO CHANGE in this batch.** Not fed at refresh today (gates skip, nothing fabricated *here*). Wiring blocked on #219+#233. Documented as a **named governed frozen-exception** — which lands exactly where Langston's original Q2 phrasing pointed, before CC-A argued him off it. He was right first. |
| `trendStrength` | **NOT fixable here** — hardcoded `0.5` at generation, no honest source exists anywhere. Needs its own named item. |
| `regimeWeight` | Recompute at refresh with live volatility = 30% honest, 70% still the fabricated `trendStrength` term. **Do NOT claim this as a repair** (see Finding 1). |

**Net:** OBJ-2b's *substantive* content in this batch is what step 1 already delivered. The remainder is blocked on pre-existing filed issues and must be stated as such in the completion report rather than quietly dropped.


---

# §6 TELEMETRY ANOMALY — the lead (CC-A, 2026-07-19). NOT yet a finding.

The audit flagged that the numbers don't reconcile and that **no funnel figure is trustworthy until they do**. Partial progress; recording the lead with its evidence so it is resumable, explicitly NOT asserted as a conclusion.

## The arithmetic that cracks the first half
9h staging window: **7** `[A3.R9.3][RTB_REFRESH][TICK]` lines and **105** `REFRESH_COMPLETE`. **105 ÷ 7 = 15** — almost exactly the queued-signal count. So the outcomes are consistent with the ticks: each tick processes the whole queue. **The outcome volume was never the anomaly. The TICK COUNT is.**

Mechanism A fires on `tick.tickNumber % RTB_REFRESH_INTERVAL_SECONDS === 0` with the interval at **30** and the Central Clock at **1s** — so ~**1,080** ticks expected in 9h. Observed: **7**, i.e. one per ~77 minutes. That is not a 30-second cadence at all.

## Candidate mechanism — PLAUSIBLE, NOT PROVEN
`startRefreshCycle` (`:602`) returns early if `this.clockTickHandlers.has(mode)` — it does **not** re-subscribe. `centralClock.start()` (`central-clock.ts:55`) resets `tickNumber = 0` and is a no-op when `intervalId` already exists; `centralClock.stop()` is called at `index.ts:1549`.

**Hypothesis:** if the clock is ever stopped/restarted (or its subscriber set cleared) while `clockTickHandlers` still holds the mode key, `startRefreshCycle` believes the cycle is running and never re-subscribes — leaving Mechanism A **permanently unsubscribed but believed-live**. Symptom would be exactly what is observed: occasional ticks (from whatever re-subscription does occur, e.g. a full process restart) rather than a steady 30s cadence.

**NOT verified:** whether `stop()` clears subscribers, whether the clock is ever stopped without a full process restart, and whether the handler map is cleared on `stopRefreshCycle`. Those three reads decide it. **Do not report this as the cause until they are done** — the audit already contains one collapsed hypothesis (§5.0-CORRECTION) and one withdrawn discharge; the standard is presence-evidence, not a plausible story.

## Why it matters to the batch — and it strengthens the case
If confirmed, Mechanism A — **the only mechanism that re-read market state** — was running at roughly **0.6%** of its designed cadence. Nearly all real refresh traffic went through the frozen-snapshot mechanism. That makes the staleness materially **worse** than the audit characterised, not better, and it further justifies consolidating onto one scheduler whose liveness is observable rather than assumed.

**It also changes the retirement calculus:** Langston's observe-gate assumes Mechanism A is a live safety net during the overlap window. If it barely ticks, it is a *weaker* net than either of us assumed — worth knowing before the gate is cleared.

**HOME:** OBJ-4's telemetry-anomaly leg, this batch. Next action = the three unverified reads above.
