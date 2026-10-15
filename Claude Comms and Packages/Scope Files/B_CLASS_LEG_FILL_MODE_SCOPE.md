# B-CLASS-LEG-FILL-MODE — per-class/per-leg execution policy + later-quote safeguard

change-class: architecture

**Owner:** ANALYST Codex (actor `codex-c`; standing in for CC-C)

**Reviewer:** Coltrane for the Codex shift

**Plan home:** `PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` P1c / `SPRINT_TO_LIVE_PLAN.md` P1c

**Issue:** `#1170`

## 1. Directive and outcome

Implement Kyle's DB-governed fill-mode switch separately for each asset class and each applicable leg:

- crypto entries and paper target exits default to `maker_only`;
- xStock entries and paper target exits default to `maker_preferred`, with a taker fallback allowed;
- stops remain immediate taker exits and are not governed by this switch;
- P1c lands together with its strict [C3] prerequisite: a resting maker order may fill only from a quote that arrived after that rest was placed.

This is one architecture batch, not a new observation period. Deterministic tests, mutation controls, migration/config read-back, bounded staging exercise, and the normal eleven-step review/deploy path are its release evidence. A naturally occurring first fill can add follow-up evidence, but it does not block unrelated deployments or this batch's deployment after the deterministic and staging checks pass.

## 2. Existing architecture and blast radius

The direct architectural reads were `SYSTEM_MANUAL.md` §§2.5/3.5.1b/18.0–18.0.1 and `SYSTEM_IMPACT_MAP.md`'s B7.2/B7.2c/B8.6 and `8a-P3`/`8a-P4b` entries. The current system has four relevant pieces:

1. `decideMakerTaker` computes taker EV and fill-probability/adverse-selection/non-fill-adjusted maker EV through the same net-expectancy kernel. The chosen EV is snapshotted once and consumed by admission/ranking; this is the single-consistent-number invariant.
2. `pending-maker-logic.ts` is the shared pure entry-rest state machine for paper and VTS. It tests a buy against the ask, fills at the limit, lets fill win a same-evaluation deadline tie, and otherwise drops at the deadline. Paper and both VTS classes call it.
3. `active-execution-engine.ts` owns the paper target-exit rest. A target touch places a maker sell, a later evaluation fills against the bid, the deadline currently converts to the normal taker target exit, and a stop always pre-empts the rest and exits taker.
4. Price selection already carries an explicit freshness clock basis. Crypto `selectCryptoTouch` currently reconstructs the book's freshness stamp from its age and may prefer the ticker's venue stamp for freshness; neither is an acceptable substitute for the producer's actual local receipt instant. xStock's active `EquityTickRaw.atMs` and VTS `XsQuoteRow.atMs` are local frame/capture receipt times. Those clocks are intentionally not pooled.

The behavior-changing surface is therefore: the maker/taker decision policy and its config resolver; paper entry placement; VTS entry placement/twins; the shared pending-entry evaluator; paper target-rest placement/deadline behavior; the accepted crypto/xStock quote carriers; persisted rest-placement instants; migrations and tests. VTS target exits remain immediate and have no target-rest lifecycle, so they are not silently added here.

## 3. Provenance — what these components were built to do

### 3.1 Corpora searched

Searched by current and former component/symbol names in `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the B7.2/B7.2b/B7.2c/B7.2d/B8.6 completion reports and scopes, `SYSTEM_MANUAL.md`, and `SYSTEM_IMPACT_MAP.md`. The symbol search included `decideMakerTaker`, `resolveMakerTakerHaircut`, `pending-maker-logic`, `evaluatePendingMaker`, `isMarketableAtPlacement`, `selectTouchPrice`, `selectCryptoTouch`, `selectVtsXstockSide`, `getLatestEquityTick`, and `parseTickerSnap`, plus former `paper-execution-engine` terminology. Git archaeology used repository-wide, non-path-limited `git log -S <symbol> --reverse`, then read the introducing commit messages.

### 3.2 Tier-1 intent and dispositions

| Component / behavior | Original intent evidence | Disposition |
|---|---|---|
| Best-of-both entry economics | `c595d987ef529aa6ee67baaf9ccbfd1adcce0836`: **“Per-signal maker-vs-taker ENTRY decision computed once at the shared build convergence … snapshotted onto the RTB row … A taker-unprofitable / maker-profitable signal now survives…”** The B7.2 catalog row says the same kernel prices both arms and the same chosen EV reaches the gate and ranker. | **(2) Relevant but needs updating to today's intent.** Keep the kernel, conservative maker EV, snapshot, and single-number invariant; add the DB policy as an overlay. Do not replace the math with a lower raw maker fee. |
| Pending maker entry lifecycle | `b48aef51ff36085af438acf56d847efe1d6c654f`: **“maker-chosen promotion -> PENDING open trade holding a slot; fills ONLY on honest side-aware trade-through; hard timeout … = DROPPED, period”**. | **(2) Relevant but needs updating to today's intent.** Keep side-aware trade-through, limit fill, slot and hard-drop semantics; require arrival evidence strictly after placement and make marketable-placement fallback obey the class policy. |
| Paper target-exit rest | `06560c299ad6c8f65fe87aa5f7367004e63df7c3`: **“place at target-touch (D1: fill requires a LATER venue tick at/through the limit), evaluatePendingMaker sell-side rest/fill/convert, absolute stop precedence”**. The implementation enforced “later” only by control flow, not by quote identity/time. | **(2) Relevant but needs updating to today's intent.** Make the later-quote claim structural; retain stop precedence; let policy decide whether an expired target rest may convert to taker. |
| Transactable-side fill price | `16ab0293b5d0e96f7d68ae6e579b0c639b5dec28`: **“every crypto maker fill, placement check and VTS exit on the transactable side”**; `8ebd26994df8cb8464da881d2a27cd8e4a4c4680` extended guarded sides to paper xStock. | **(1) Still relevant and correct.** Buy rests still evaluate on ask, sell rests on bid, and a missing/refused side means no fill. |
| Mixed freshness clocks | `cf7394996cefac735c8cc2bf4b971a38d318c939`: **“every quote carries clockBasis ('venue' | 'receipt') beside ageMs … the module never infers a clock from a number.”** It also states that a venue stamp ahead of our clock refuses rather than inventing skew tolerance. | **(1) Still relevant and correct.** Preserve the chosen freshness stamp and `clockBasis`. Arrival ordering is a separate receipt-clock fact; it must not reinterpret a venue freshness timestamp as local arrival time. |
| xStock local frame time | `ce4a7e408436229d05e9edd48329383edabdd1b9` introduced the passive ticker pipeline; `184c418818715b7fa0459510fd7ae8f4dea75c58` introduced the in-memory xStock tick path. Current `parseTickerSnap` stamps `EquityTickRaw.atMs` as **“Our receipt time for THIS frame”** before the conditional mark update. | **(1) Still relevant and correct.** Use `raw.atMs`, not the mark's older `tsMs`, for later-than-placement. VTS uses the captured row's `at_ms` for the same purpose. |
| VTS entry parity | B7.2d's catalog record says xStock entries use the same shared decision and pending lifecycle, while twins are tagged and excluded from aggregates. | **(2) Relevant but needs updating to today's intent.** Both VTS classes get the entry policy and shared later-quote rule; twin exclusions remain intact. |
| VTS target exits | B8.6 explicitly deferred VTS maker target exits to `#513` / P19-B8.6v. | **(5) Disconnected and should stay disconnected here.** This batch does not invent a VTS target-rest lifecycle. |
| Price-refusal/deadline interaction `#1073` | `RUNNING_ISSUES.md #1073` classifies the current paper behavior provisionally as outcome (2) and places its entry-leg measurement/policy in `B-VTS-NO-DECISION-VALVE` (`3n.q3`). | **(2), with a bounded overlap.** C3 necessarily prevents a quote first received after deadline from filling; `3n.q3` retains the separate timer-evaluation/deletion policy during refused-price cycles. Step 2 must name the shared seam and keep the remaining home intact. |

### 3.3 Tier-2 intent notes

- `module-constants-service.getCachedStringRequired` is the existing fail-hard typed string reader; the policy should reuse it rather than create a config path.
- `TouchQuote`, `CryptoBookTop`, `EquityTickRaw`, and `XsQuoteRow` are structural quote carriers. They are extended only enough to carry the accepted quote's actual receipt instant to the fill decision; deriving it as `now - age` is forbidden.
- `openedAt` currently approximates placement time for pending entries and `exitRestPlacedAt` is the explicit paper exit placement time. Because `openedAt` and `makerDeadline` are minted separately and the meaning is otherwise generic, entry rests gain an explicit durable `makerPlacedAt` captured from the same instant used to derive their deadline, in paper and VTS persistence/rehydration.

## 4. Policy contract

The per-class DB rows expose one policy for `entry` and one for `target_exit`. The allowed values are:

- `maker_only`: an admissible maker may rest; no taker fallback or target-deadline conversion is allowed.
- `maker_preferred`: use the conservative maker arm when it is admissible; otherwise a separately admissible taker arm may execute.

The defaults are crypto=`maker_only` for both legs and xStock=`maker_preferred` for both legs. Missing, invalid, or unwarmed policy is fail-hard before a decision, not silently defaulted. Stops are structurally outside this resolver and always take.

For entries, `decideMakerTaker` continues to calculate both arms unchanged. The policy selects among those already-priced arms:

- it never substitutes the raw maker fee for the fill-probability-adjusted maker EV;
- it never admits on a value greater than today's best-of-both chosen EV;
- `maker_only` rejects rather than taking when the hard taker floor fires or the adjusted maker arm is not admissible;
- `maker_preferred` may fall back to taker only when the taker arm is independently admissible;
- the effective arm's conservative EV is the one snapshotted into every downstream gate and ranker.

For target exits, `maker_only` removes the current deadline conversion: the expired rest is cleared, the position remains open, and a later eligible target observation may place a new rest; a stop may always cancel/pre-empt and take. `maker_preferred` retains the current maker-rest-then-taker-convert behavior.

## 5. Later-quote contract ([C3])

A resting entry or target exit can fill only when the accepted quote that supplies the deciding ask/bid has a finite local `quoteArrivedAtMs` received while the rest was live:

`restPlacedAtMs < quoteArrivedAtMs < deadlineMs` when a deadline exists, otherwise `restPlacedAtMs < quoteArrivedAtMs`.

The comparisons are strict. Equality, missing evidence, a non-finite stamp, a quote received before placement, or a quote first received at/after cancellation time can never fill. A pre-deadline quote that proves trade-through may still fill when evaluated after the deadline because it proves the order crossed while live; otherwise the existing deadline outcome applies. Monitor-loop time is not quote time. The fill evaluator receives arrival, placement, and deadline explicitly so a caller cannot satisfy the rule with `Date.now()`.

For crypto, quote selection must return the producer's actual local receipt instant for the accepted book (`bookUpdatedAt`) or ticker (`sidesCapturedAtMs`) while preserving its existing freshness `stampMs`/`clockBasis`; it must never reconstruct arrival as `now - age` or use `venueObservedAtMs` for ordering. For active xStock, use the selected `EquityTickRaw.atMs`; for VTS xStock, use the selected row's `atMs`. The chosen price and arrival stamp must come from the same accepted quote object. A post-placement xStock snapshot/replay counts as a later **arrival** if it passes the existing structural/freshness guard; P1c does not invent a stronger “venue price changed after placement” contract, because the approved directive says arrived and the frame currently retains no change-kind provenance beside `raw`. This preserves the intentional mixed-clock freshness design: venue time answers freshness where available; local receipt time answers ordering.

## 6. Numbered objectives and verification criteria

### OBJ-1 — DB-governed per-class/per-leg policy

Add the two typed policy rows for both supported classes, seed the required defaults, warm them at startup, and resolve them through the existing constants service.

**Verify:** migration forward/rollback checks; four-row exact DB read-back; invalid/missing/unwarmed values fail hard; policy values are not inferred from symbol or fee rate; stops have no policy read.

### OBJ-2 — conservative entry-policy overlay

Apply policy after the existing two-arm maker/taker calculation and before the one value is snapshotted for downstream consumers.

**Verify:** named identity tests show gate and ranker receive the selected conservative arm; maker-only cannot increase admission EV over pre-batch best-of-both; hard-floor and maker-negative cases reject under maker-only; maker-preferred takes only when taker EV independently passes; mutation replacing adjusted maker EV with raw maker EV is caught.

### OBJ-3 — policy-correct entry placement in paper and VTS

Make paper, crypto VTS, xStock VTS, and twins honor the selected policy at marketable placement, ordinary rest, and deadline/drop seams.

**Verify:** crypto defaults never take at placement; xStock defaults retain an admissible taker fallback; pending entries keep existing slot, fill-at-limit, never-filled, persistence, rehydrate, and twin aggregate-exclusion rules; per-lane tests cover both policy values and missing config.

### OBJ-4 — policy-correct paper target exits

Keep target-rest placement, maker fee booking, and absolute stop precedence, but make target-deadline behavior policy-controlled.

**Verify:** maker-only expiry clears the rest without closing the position; a later target may rest again; a stop still exits immediately as taker; maker-preferred expiry follows the existing taker close path and stamps convert provenance; knob failure cannot strand or silently convert under the wrong policy.

### OBJ-5 — structurally later quote for every resting fill

Thread the selected quote's actual local arrival instant and the explicit persisted rest-placement instant into the shared evaluator. Add durable `makerPlacedAt` for paper/VTS entry rests, stamped from the same captured instant as `makerDeadline`; retain `exitRestPlacedAt` for paper target rests. Apply the contract to paper/VTS pending entries and paper target exits.

**Verify:** same/pre-placement quote cannot fill; a strictly later pre-deadline eligible quote can fill; a quote first received at/after deadline cannot fill; a pre-deadline cross evaluated after deadline still fills; price and arrival are from the same selected leg; book/ticker fallback tests cover both clocks; venue-time skew cannot alter ordering; missing arrival evidence rests/drops only under the ordinary deadline rule; mutation deleting/reversing either strict boundary fails. Rehydrate tests prove the explicit placement instant survives restart exactly, and millisecond-equal arrivals conservatively do not fill.

### OBJ-6 — population boundary without a deployment hold

At Step 2 enumerate every open crypto observation window whose population changes when taker entries or taker target conversions disappear, and state its deterministic cut/reset rule before Stage 5. Do not create a new waiting window.

**Verify:** the pre-audit names each affected window and anchor; deployment tooling continues to permit normal reviewed deployments; existing October 19/25 reads continue under their already-approved rules; post-deploy records carry enough policy/mode provenance to separate populations.

### OBJ-7 — documentation and bounded live proof

Update the System Manual, SIM, adjustment/config inventory, issue/plan/catalog/history records, and completion report. Verify configuration, startup warmup, runtime policy logging/counters, and a safe staging exercise through the API/log/database route.

**Verify:** TypeScript baseline, focused unit/integration suites, mutation controls, all four CI jobs, migration/read-back, restart/warmup, API/log/DB evidence, and UI explicitly marked “not yet checked” unless Kyle performs it. No naturally occurring fill is required to release the batch.

## 7. Explicit exclusions and sequencing

- No VTS target-exit rest lifecycle (`#513`).
- No real-exchange post-only order lifecycle; that remains Phase 21.
- No change to freshness ceilings, quote-side rules, or the intentional venue/receipt `clockBasis` choice.
- C3 settles one `#1073` edge by construction: a quote first received after the deadline cannot fill. The separate question—when a refused-price cycle physically evaluates/deletes an expired row—stays in `B-VTS-NO-DECISION-VALVE`; Step 2 records the exact overlap rather than silently absorbing that batch.
- No calibration claim from paper maker fills; their data fence remains.
- No new observation freeze. This batch proceeds while the October 19 and October 25 monitors continue independently.

## 8. Step-2 audit questions

1. Enumerate every paper/VTS entry-rest persistence and rehydrate seam for the required explicit `makerPlacedAt`, plus every existing paper `exitRestPlacedAt` seam; prove placement and deadline derive from one captured instant.
2. Enumerate every decision, placement, persistence, rehydrate, twin, and target-conversion caller through compile-driven probes.
3. Prove the actual receipt instant for the exact accepted crypto book/ticker and xStock active/VTS quote; reject `now-age`, venue-time ordering, or any carrier that can mix price from one frame with time from another. Confirm snapshot/replay acceptance remains governed by the existing quote guard, not a newly invented change-only rule.
4. Trace the selected EV through all admission/ranking consumers and prove the overlay cannot loosen admission.
5. Name every open observation window affected by the changed closed-trade population and record its cut/reset disposition without delaying deployment.
