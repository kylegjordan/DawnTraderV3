# B-RTB-REFRESH-CONSOLIDATE — Scope (CC-A, 2026-07-19)

change-class: architecture

**Owner:** CC-A (Kyle directive 2026-07-19). **Sequenced BEFORE** the shadow-trade work (Kyle: *"our RTB refresh system is not working as it should be… a bigger problem than the shadow capture"*).
**Audit basis:** `1-system-manual/RTB_REFRESH_AUDIT_2026-07-18.md` (incl. §5.0-CORRECTION). **Issues:** #532 (core), #534 (shadow-mode gates, folded in). Adjacent: #535 (Langston, net-EV backstop), #533 (dead-code purge, sequenced AFTER this).

---

## 1. The defect, in one paragraph

Two independent mechanisms refresh the RTB queue concurrently. **Mechanism B** (`rtb-refresh-service.ts`, 15s micro / 120s macro / 8 buckets / adaptive concurrency) is the **documented** architecture — an entire section of the canonical Current-State Reference, with the Adaptive Concurrency Tuner built on it — and it hands the SQE a **frozen queue-time snapshot**. **Mechanism A** (Central-Clock per-signal, 30s, `executePerSignalRefresh` → `refreshSingleSignal`) is **absent from every canonical document** and is the only one that **actually re-reads market state** (volatility, spread, geometry, maker/taker re-decide, recomputed net expected edge). Both feed the same SQE; neither respects the other's in-flight guard; either can delete a queued signal. Proven on live rows: 13/13 symbol overlap, same signals ~14s apart.

**The system kept the wrong half of each.**

---

## 2. Objectives

**OBJ-1 — ONE refresh mechanism.** Keep Mechanism B's scheduling + concurrency skeleton (bucket rotation, ACT, backpressure — real engineering Mechanism A entirely lacks). **Transplant Mechanism A's data-refresh semantics into it.** Retire Mechanism A (rule 18: delete + archive + `DELETED_COMPONENTS_LOG`, not stub). Parallelism after this = chunking *within* the one mechanism; never a second scheduler.

**OBJ-2 — The refresh contract (Kyle's definition, 2026-07-19 — ratified here as the batch's governing purpose).**

> **The refresh exists to represent the signal AS IT CURRENTLY IS, as accurately as possible, so the SQE can make the best possible accept/reject decision.**

The survivor MUST update a queued signal to its current form — re-reading **every input the SQE evaluates** — then re-evaluate it through the **same SQE a new signal faces**. Deliverable: an explicit input-by-input table (SQE-consumed input → refreshed / deliberately frozen + written justification). Anything frozen is a named, governed exception, not a default.

**★ OBJ-2b — PLACEHOLDER INPUTS ARE A CONTRACT VIOLATION, not merely "unrefreshed" (derived from the OBJ-2 purpose).** The measure is **decision accuracy**, not field freshness for its own sake. An input that is *hardcoded or defaulted* actively CORRUPTS the SQE's decision — it is worse than a stale real value, because it is a fabricated one presented as fact. The June-2026 pipeline audit already flagged these on the active path (`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md:177`) and they are still live:
- `regimeStability` — built from hardcoded `computeGlobalStability(0.5, 0, confidence)` at generation, and **fed to neither refresh path** (which is *why* the Confidence + Governance gates cannot evaluate — see OBJ-5; the two objectives share this root).
- `trendStrength` — hardcoded `0.5`.
- `volatility` — default `0.3` on the batch path.

These feed `regimeWeight` → `finalScore` and the gates. **In scope for this batch:** for each, either source it honestly or make its absence an explicit, loud, governed refusal (OBJ-3) — a refresh that hands the SQE fabricated 0.5s is failing its stated purpose even if every other field is current. Where an honest source does not yet exist, the disposition is a named home, not a silent default.

**OBJ-3 — Fail LOUD on missing inputs (Kyle directive).** A signal that cannot supply an SQE-consumed input is **rejected loudly**, never passed on stale or absent data. Targets: the net-expectancy `chosenNetEv != null` fail-open skip; the silent unclassifiable-asset-class drops on both paths (a queued row was stamped at write — unresolvable at refresh means something upstream is broken and must alarm, not vanish); the refresh `catch` that bulk-deletes with no telemetry (#419).

**OBJ-4 — Every queue exit counted.** No silent deletes. Promoted / rejected-in-refresh / error / unclassifiable / superseded — each gets a counter feeding the funnel. Absorbs #419. **Includes resolving the §6 telemetry anomaly** (7 ticks in 9h against a 30s timer; 133 observed outcomes/9h cannot produce the funnel's cumulative 25,917) — **no funnel number is trustworthy until this reconciles**.

**OBJ-5 — Disposition the globally non-blocking gates (#534).** Confidence floor + Governance are `gateShadowMode` at **all three** SQE call sites incl. generation, and both additionally require a `regimeStability` input neither refresh path feeds. Decide per gate: ratify-as-shadow (with written justification) or un-shadow. **Langston rules**; CC-A implements. NOT silently un-shadowed as a drive-by — un-shadowing changes admission.

**OBJ-6 — Documentation truth.** Update SIM + System Manual to describe the single surviving mechanism. `bridge/canonical/` is **frozen history — not edited** (§9.5). The completion report records that the canonical corpus documented only one of the two mechanisms.

---

## 3. Entry-point enumeration (CLAUDE.md §9.5(a) — done at scope, not deferred)

Every invoker of RTB refresh, repo-wide, tests excluded:

| # | Entry | Chain | Status |
|---|---|---|---|
| 1 | `active-execution-engine.ts:482` → `startRefreshCycle` | Central Clock 30s → `executePerSignalRefresh` → `refreshSingleSignal` → SQE `:945` | Mechanism A — **RETIRE** |
| 2 | `startup/trading-bootstrap.ts:65` → `startRefreshCycle` | same as #1 | Mechanism A second starter — **RETIRE** |
| 3 | `index.ts:348` → `rtbRefreshService.start()` | 15s micro / 8 buckets → `refreshAndRank` → SQE `:1219` | Mechanism B — **SURVIVOR** |
| 4 | `ready_to_buy_service.ts:1032` → `refreshAndRank` (via `executeRefreshCycle`) | `executeRefreshCycle` has **no external callers** | **Verify dead → delete** |

Mutual-exclusion check: `refreshAndRank` never reads the per-signal `isRefreshing` flag (`:594`/`:720`/`:738`) — zero hits in its body. Confirmed absent.

---

## 4. Blast radius

`ready_to_buy_service.ts` (both refresh chains, the SQE input builders, exit counters) · `rtb-refresh-service.ts` (survivor's scheduling) · `active-execution-engine.ts:482` + `trading-bootstrap.ts:65` (starter removal) · `active-funnel-tracker.ts` (exit counters) · `signal_quality_evaluator.ts` (OBJ-5 gate flags only) · SIM + System Manual.
**NOT touched:** the SQE's gate LOGIC (only the shadow flags, and only per Langston's OBJ-5 ruling); signal generation; the ranker; sizing; execution; the shadow tables.

**Live-risk note:** paper active trading is ON. Consolidation changes how often and on what data queued signals are re-evaluated, and removing a duplicate evaluator changes eviction timing. Staged rollout + a defined rollback (re-enable Mechanism A's starters) is required. **Live mode is untouched throughout.**

---

## 5. Verification criteria

- Exactly ONE refresh entry point post-change (re-run §3 enumeration; prove #1/#2/#4 gone).
- Live log: zero `[11.0E][REFRESH_COMPLETE]` (Mechanism A marker) after deploy; `RECONFIRM_COMPLETE` continues.
- **Re-run the double-processing test:** symbols processed by two mechanisms = **0** (was 13/13).
- Input-by-input contract table (OBJ-2) demonstrated on a live row: a queued signal's stored volatility/spread/net-EV visibly change across refreshes.
- A signal with a missing SQE-consumed input is rejected + alarms (OBJ-3), demonstrated.
- Funnel exits balance: `refreshedAttempted == reconfirmed + rejectedInRefresh + error + other` (OBJ-4); the §6 tick/volume anomaly reconciled with a written explanation.
- §9.3 staging UI walk of the Filter Diagnostics tabs.

---

## 6. Open questions for Langston at Step-1

1. **Survivor choice** — endorse "keep B's skeleton, transplant A's semantics"? The alternative (keep A, re-document, discard ACT/bucket investment) is on the table but discards real backpressure engineering.
2. **OBJ-5 per-gate ruling** — Confidence floor and Governance: ratify-as-shadow or un-shadow? Note un-shadowing tightens admission on a live paper soak.
3. **The no-expiry lifecycle** — R9.3-C removed TTL *by directive* ("signals live indefinitely while passing SQE"). Under active trading with a genuinely-refreshing mechanism, does that still hold, or does a max queue age return? **Re-decide, don't patch.**
4. **#535 interaction** — your net-EV backstop re-examination shares this seam. Rule before or alongside this batch's Step-2?
5. **Staging strategy** — single cutover vs. run-B-only first (disable A's starters) to isolate behavior change before transplanting semantics? CC-A leans the latter: two smaller reversible steps on a live soak.
