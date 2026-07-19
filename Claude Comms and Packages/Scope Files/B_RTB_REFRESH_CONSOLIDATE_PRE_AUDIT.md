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
