# B-CLASS-LEG-FILL-MODE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-CLASS-LEG-FILL-MODE` · pre-sprint P1c · issue `#1170`

**Owner:** ANALYST Codex / CC-C

**Audit ref:** `origin/migration/aws-supabase` = `e6bc1c505e37e6c5ea89b494b8c9cdd5c5b0ec06`

**Change class:** architecture; high-risk execution and persistence seams

**Scope authority:** `B_CLASS_LEG_FILL_MODE_SCOPE.md`, approved by Coltrane at `357b6da43f061b338b0d7251a3b08772912fe79a`

## 0. PREVIOUSLY STATED → NOW

| item | previously stated | now, after audit | reason |
|---|---|---|---|
| realised entry population | `#1170` reported **63 maker of 264 closed entries** from 2026-09-07 through its 2026-10-07 point-in-time read; all **33** after the 2026-10-06 reset were taker | At 2026-10-15 14:29:58Z, the expanding population opened from 2026-09-07 through the sample is **65 maker / 389 taker / 454 total**, split crypto **60/145/205** and xStock **5/244/249** | The original figure remains the correct historical point-in-time measurement. The new figure uses a later cutoff and is not presented as a like-for-like performance delta. |
| current pending-entry population | Step 1 left the exact live census to this audit | At 2026-10-15 14:29:39Z there were **7 pending entries**: paper xStock **1**, VTS crypto **1**, VTS xStock **5**. Each had a deadline, and none can carry an exact placement instant because that field does not yet exist. | The implementation needs an explicit legacy-row rule; guessing placement from another timestamp would manufacture provenance. |
| current paper target-rest population | Step 1 left the exact live census to this audit | The same snapshot contained **1 xStock paper target rest** and **0 crypto target rests**. It has the old placement/deadline fields but no policy snapshot. | A mid-rest policy reinterpretation is unsafe. The live legacy target rest must be cleared without closing the position before new policy semantics apply. |
| policy configuration | `#1170` reported no switch and only existing maker/taker inputs | Live readback found **24** `maker_taker` rows and **0** fill-policy rows. | Four exact policy rows are required: two supported classes × entry/target-exit. Startup must prove all four, not merely that the module is non-empty. |
| “later quote” | B8.6 described target fills as requiring a later venue tick; B7.2c required an honest later trade-through by lifecycle ordering | The shared evaluator has **3 production callers** and receives price, limit, current time and deadline, but no placement or quote-arrival time. It therefore cannot distinguish a cached pre-placement quote from a quote received while the rest was live. | The historical rule is an intention enforced only by another loop pass. P1c makes the interval structural. |
| observation/deployment consequence | Early discussion treated the October 25 bar read as though it could hold deployments | **No P1c observation hold is created.** The October 19 watchdog reads continue unchanged; the October 16–25 xStock bar window accepts normal reviewed builds through its durable build handoff; the November xStock reads continue; Stage 5 has not started. | P1c changes trade execution populations, not price-feed or archive truth. Any trade analysis crossing deployment is split by durable policy stamps rather than freezing the system. |

No earlier number is silently carried forward. Every count below names its object, population and sample time.

## 1. AUDIT QUESTION AND ANSWER

**Question.** Can the system enforce a per-class/per-leg maker policy and prove that every resting fill came from a quote received while the order was live, without changing the two-arm Net Expectancy math, inventing a new clock, or blocking other reviewed deployments?

**Answer: yes, but not with a live config lookup at fill time and not with the current pending-maker evaluator.** The decision has to be split into two explicit stages: the existing function prices both arms unchanged, then a pure policy overlay selects an independently admissible arm or rejects. The effective policy and arm must be snapshotted with the decision, because a later knob change must not reinterpret a queued signal or an existing rest.

Every resting fill also needs two durable/local-receipt facts that the current entry lifecycle lacks: the rest-placement instant and the deciding quote's actual local arrival instant. The strict rule is `placement < arrival < deadline`; a quote received before the deadline may still prove a fill when evaluated after the deadline, while equality, missing evidence, pre-placement arrival and at/after-deadline arrival cannot fill. Existing freshness clocks remain untouched: venue time or receipt time continues to answer freshness, while local receipt time alone answers ordering.

## 2. SIX-SOURCE AUDIT

### 2.1 Actual code at the shared ref

#### Entry points first

| entry point / boundary | production population | result |
|---|---:|---|
| `decideMakerTaker(` | **4 callers + 1 definition**: signal birth (`signal-orchestrator.ts:1060`), RTB refresh (`ready_to_buy_service.ts:800`), crypto VTS (`vts-runner.ts:2125`), xStock VTS (`xstock_spot/eval-cycle.ts:817`), definition (`maker-taker-decision.ts:205`) | These are all arm-pricing entry points. Policy must be applied after each call or through one shared wrapper used by all four. |
| `evaluatePendingMaker(` | **3 callers + 1 definition**: paper entry (`active-execution-engine.ts:1805`), paper target (`:3085`), VTS entry (`vts-runner.ts:3739`), definition (`pending-maker-logic.ts:47`) | One shared pure state machine controls every existing rest. It has no placement/arrival inputs today. |
| `planTwin(` | **1 caller + 1 definition**: VTS (`vts-runner.ts:5128`), definition (`pending-maker-logic.ts:128`) | VTS's alternate-arm learning path is a separate creator and must not create an arm forbidden by policy. |
| paper pending-entry creator | **1 writer**: `active-execution-engine.ts:6089-6091` | It writes pending state, limit and deadline, but not placement. Deadline is minted from a separate `Date.now()` rather than a named shared instant. |
| VTS pending-entry creators | Crypto direct writer (`vts-runner.ts:2487-2489`) plus the shared register/twin shapes (`:4972-4974`, `:5128`) | All persistence paths need the same placement and policy contract. |
| paper target-rest creator | **1 writer**: `active-execution-engine.ts:3144-3146` | It already captures one `_placedAt` and derives the deadline from it. It needs only the policy snapshot and strict quote-arrival check. |
| RTB refresh scheduler | **1 central-clock subscription** (`rtb-refresh-service.ts:220`) | It re-prices queued signals and atomically updates the effective decision. Policy belongs in the same update. |
| paper pending/exit scheduler | **1 monitoring interval** (`active-execution-engine.ts:1369`) reaching `checkOpenPositions` (`:1700`, definition `:1925`) | One scheduler owns both paper entry and target-rest evaluation; no duplicate rest evaluator was found. |
| VTS pending/exit scheduler | **1 autonomous interval** (`vts-runner.ts:6110`) reaching `resolveOpenVirtualTrades` through the simulation cycle (`:5230`, definition `:3558`) | One scheduler owns VTS pending-entry resolution. |
| xStock VTS entry scheduler | **1 central-clock subscription** (`xstock_spot/scanner.ts:246`) reaching `evaluateXstockPairForVTS` (`:939`; definition `eval-cycle.ts:305`) | Separate from the VTS autonomous exit/pending loop; it creates xStock VTS entries but does not resolve existing rests. |
| VTS boot rehydrate | **1 call** from `vts-runner.ts:1213` to `vts-trade-persistence.ts:314`, started from `server/index.ts:908-941` | Placement and policy must survive restart through both live and shadow map splits. |

The positive control for each count is the named production hit. Searches excluded tests; no failed read or denied path is treated as a zero.

#### Writer / reader / mutator / deleter / scheduler census

| object | writers / creators | readers / consumers | mutators / deleters | scheduler / lifetime |
|---|---|---|---|---|
| maker/taker arm decision | Four creators listed above | signal admission/ranking, RTB refresh and placement, VTS registration/twinning | RTB refresh is the only later active-signal rewriter; VTS decisions are created per trade | Signal-birth callbacks, RTB central clock, crypto VTS cycle, xStock scanner |
| RTB effective entry decision | Signal birth insert; RTB refresh atomic update | ranking and active promotion | refresh rewrites chosen mode/EV and supporting arm values | RTB central-clock subscription; birth is event-driven |
| paper pending entry | One active-engine creator | paper monitoring evaluator; open-position capacity; later close/analytics transfer | evaluator fills or deletes through existing never-filled close path; service orphan cleanup and reset are additional deleters | One active-engine monitor interval |
| VTS pending entry | Four `insertOpenTrade` production paths: shadow (`vts-runner.ts:1138`), primary (`:2622`), register helper (`:5049`), twin (`:5184`); bootstrap persistence reuses the writer (`vts-trade-persistence.ts:422`) | live/shadow rehydrate split (`vts-runner.ts:1213-1234`); pending evaluator; persistence/analytics | `markPendingMakerFilled` has **1 production caller** (`vts-runner.ts:3747`); never-filled/close paths soft-close rows | One VTS autonomous interval plus one boot rehydrate |
| paper target rest | One creator (`active-execution-engine.ts:3144-3146`) | paper monitoring evaluator | fill/convert/stop paths clear the three rest fields; active-row deletion at ordinary close | Same one paper monitor interval |
| policy configuration | One migration seeds four rows; constants service cache creates the in-process resolved view | Four decision paths and paper target placement | DB operator update; cache refresh only | Existing module prefetch/startup and cache lifetime; no new scheduler |
| quote-arrival evidence | Crypto mini-book writer stamps `bookUpdatedAt` at frame processing (`kraken-websocket-adapter.ts:1185`); ticker cache carries `sidesCapturedAtMs`; xStock scanner rows carry `atMs` (`scanner.ts:669`) | crypto touch selector, active xStock quote guard, VTS xStock selector | Producers replace the latest accepted frame; no consumer mutation | Existing feed/scanner lifecycles only |
| durable policy/placement provenance | New writes on RTB, paper open/closed and VTS open/closed records | placement, pending evaluators, restart rehydrate, analysis/export | Ordinary trade lifecycle only; no retroactive backfill | Bound to existing row lifetimes |

**Mutual exclusion.** Paper rests have one evaluator scheduler; VTS rests have one evaluator scheduler. The xStock scanner creates VTS entries but does not resolve them. Stops remain outside the target-rest policy resolver and pre-empt a live target rest before the target branch.

#### Exact current mechanisms and gaps

1. `decideMakerTaker` returns both conservative arm values, a chosen mode/value and the hard-floor result. Its mathematics is already shared and must remain unchanged. The current best-of-both choice is not itself the new policy.
2. Paper SQE's exploratory lane can override a Net-Expectancy-only failure, and RTB refresh preserves that stamp. A policy refusal therefore cannot be represented as an ordinary negative-EV choice; it needs a structural rejected result that exploration cannot reopen.
3. The shared pending evaluator tests side-aware price-through before `now >= deadline`, so fill wins a same-evaluation deadline tie. It cannot tell whether the price came from before placement or after cancellation because it receives neither timestamp.
4. `TouchQuote` carries price, age and freshness clock basis, but no arrival. Crypto book selection currently reconstructs a freshness stamp as `now - age`; the underlying adapter has exact `bookUpdatedAt`. Ticker freshness may deliberately use `venueObservedAtMs`; the actual local arrival is `sidesCapturedAtMs`. These facts must remain separate.
5. Active xStock already has the selected frame's `EquityTickRaw.atMs`, and VTS xStock rows already have `XsQuoteRow.atMs`; current selection return shapes discard those stamps before the pending evaluator.
6. Entry rests have no `makerPlacedAt` field anywhere in production schema or migrations. Positive control: `makerDeadline` is present in both paper and VTS persistence. `openedAt` is a trade-lifecycle timestamp, not exact rest-placement evidence.
7. Paper target rests already have durable `exitRestPlacedAt`. The missing fact is a target policy snapshot; a live config lookup at expiry would reinterpret an order under a rule that did not place it.
8. The active entry deadline column is timestamp-without-time-zone. The new placement field should be timezone-aware and round-trip by exact epoch. Converting the old deadline column is unnecessary scope; both values are still derived from one captured JavaScript instant.
9. Defensive non-spot fallbacks use a mark and have no same-object side-quote arrival contract. The resolver therefore supports only `crypto_spot` and `xstock_spot` and fails hard for another class instead of inventing evidence.
10. VTS has no target-rest lifecycle. Adding policy there would silently build deferred issue `#513`, so target policy applies to paper only.

### 2.2 Runtime logs and live database

The repeatable-read live snapshot at **2026-10-15 14:29:39Z** measured:

- active paper: crypto open **5** (one retained entry deadline), xStock open **14** (one target rest), xStock pending **1** (one entry deadline);
- VTS: crypto open **52** / pending **1**, xStock open **124** / pending **5**; **61** shadow rows among the open rows and no shadow pending row;
- current pending denominator: **7 rows**, all with a deadline;
- `maker_taker` config: **24 total rows, 0 fill-policy rows**.

The one active xStock target rest makes legacy handling an exercised deployment concern, not a hypothetical. Existing rows cannot be assigned a policy after the fact without rewriting history.

Current PM2 logs were readable from `/var/log/dawntrader/out.log`; the process is online. The current out log contained positive-control maker/taker activity and rest/fill markers, while the error log contained none of those markers. Those events prove that the paths are live, but they do not prove quote arrival relative to placement because the event format carries no deciding arrival stamp.

### 2.3 System Impact Map

The SIM's B7.2/B7.2c/B7.2d entries define one shared two-arm decision, the pending-maker lifecycle, VTS parity and twin exclusions. B8.6 defines paper target rest/fill/convert with stop precedence and explicitly defers VTS target rests. Price-side entries `8a-P3`/`8a-P4b` define the accepted crypto and xStock side sources and their intentional freshness clocks.

**Audit disposition:** preserve the shared math, side rules, freshness ceilings, clock-basis semantics, slot accounting, limit-price fills, maker-fee booking and twin aggregate exclusions. Step 10 must add the policy overlay, durable policy/placement state and the separate receipt-ordering clock. The SIM is silent on how an existing rest behaves when policy changes and does not make “later” structural; both are governance gaps.

### 2.4 System Manual

The System Manual documents the B7.2 conservative maker/taker calculation, B7.2c pending-entry lifecycle and B8.6 paper target-rest lifecycle, including fill-first deadline evaluation and stop precedence. It also documents the class-specific accepted price sides. It does not define per-class/per-leg fill policy, durable entry placement, a quote-arrival interval, legacy cut behavior or policy snapshot semantics.

**Audit disposition:** the scope does not contradict the Manual; it tightens an unproved “later quote” statement and adds the missing policy layer. Step 10 must make the two clocks and the strict inequalities explicit so freshness and arrival are not later collapsed.

### 2.5 Ledgers, plans and completion records

- `RUNNING_ISSUES #1170` is the authoritative directive and original measured population.
- `PRE_SPRINT_SIMULATION_TRUTH_PLAN` P1c and `SPRINT_TO_LIVE_PLAN` P1c place this batch before the Stage 5 reset.
- B7.2 completion records establish same-kernel two-arm pricing and one downstream chosen value.
- B7.2c establishes pending state, honest side-aware trade-through, limit fill and hard timeout/drop.
- B7.2d extends that lifecycle to xStock VTS and preserves twin exclusion.
- B8.6 establishes the paper target rest, maker fee, stop precedence and current expiry-to-taker conversion; it defers VTS target rests to `#513`.
- `#1073` retains the separate question of when a refused-price cycle physically evaluates/deletes an expired row. P1c settles only the quote-first-received-at/after-deadline case.

No prior batch implements a policy switch or structural placement/arrival test. This is not a duplicate of the existing maker/taker configuration inputs.

### 2.6 Canonical corpus and git archaeology

A bounded search of `bridge/canonical/` and `bridge/decisions/` for maker-only/preferred, maker/taker, pending maker, target rest, later quote and maker deadlines returned no coverage. The same population positively returned historical Net Expectancy and regime material. The canonical corpus predates these components, so it supplies no maker-rest policy intent and is not used as current-state evidence.

Git archaeology provides the relevant intent:

1. `c595d987e` introduced B7.2: both arms use the same Net Expectancy kernel, conservative maker adjustments, and one snapshotted downstream decision.
2. `b48aef51f` introduced B7.2c: maker-chosen entries rest, fill only on honest side-aware trade-through, and drop at the hard deadline.
3. `127c6d845` extended the same entry decision/rest lifecycle to xStock VTS.
4. `06560c299` introduced B8.6: paper target rests require a later evaluation, stop always wins, and deadline currently converts to taker.
5. `16ab0293b`, `8ebd26994` and `82b7ddb50` established transactable-side selection for crypto, paper xStock and VTS xStock respectively.

**Provenance result: Rule-24 outcome (2).** The existing economics, side selection and lifecycle remain intentional, but the approved policy now constrains which priced arm may be used and [C3] turns “later” from loop ordering into a provable interval. Nothing in provenance supports a guessed timestamp, raw-fee shortcut or deployment freeze.

## 3. AUDIT FINDINGS

### A1 — Policy is absent, and partial warmup would look healthy

There are zero live policy rows, while module-level warmup already succeeds on 24 unrelated maker/taker rows. The batch needs four exact required-row reads and an allowed-value check; module non-emptiness is not proof.

### A2 — Policy must overlay, not replace, the shared math

The four decision entry points already calculate both conservative arms. A separate pure result must carry either `admitted` with effective mode/EV/policy or `rejected` with a stable reason. This preserves the single-consistent-number invariant and keeps structural policy refusal outside exploratory Net-Expectancy overrides.

### A3 — Admission floors differ by lane

Active trading requires positive Net Expectancy; VTS deliberately admits down to its existing `-0.01` learning floor. `maker_only` is stricter: maker must be positive and the hard taker floor must not have fired, even in VTS. `maker_preferred` may use the lane's existing floor: choose maker first when maker is admissible, otherwise taker only when taker independently passes that lane's floor.

### A4 — The policy is decision provenance, not a live fill-time preference

Signal birth and RTB refresh must atomically snapshot policy with the effective arm/EV. Placement consumes that snapshot and never rereads the knob. VTS stamps policy at its direct decision. Paper target rests stamp policy when placed. Closed records retain both entry and target-exit policy so a row that opens before deployment and closes after deployment is not classified by wall time alone.

### A5 — The evaluator lacks both sides of the live interval

The shared evaluator cannot establish [C3]. It needs explicit `restPlacedAtMs` and `quoteArrivedAtMs`, must evaluate quote eligibility against the live interval before fill, and must continue to let a valid pre-deadline trade-through fill even if the monitor processes it after the deadline.

### A6 — Arrival is available at producers but dropped by carriers

Crypto book `bookUpdatedAt`, crypto ticker `sidesCapturedAtMs`, active xStock `raw.atMs` and VTS xStock row `atMs` are local receipt facts. The selected price and arrival must travel in the same returned object. Freshness stamp/clock basis stays unchanged and cannot substitute for arrival.

### A7 — Entry placement must be durable across restart

Paper and VTS pending entries require timezone-aware `makerPlacedAt`, captured once and used to derive the deadline. VTS needs the field through its type, all creators, insert/update/select mapping, bootstrap and live/shadow rehydrate. Exact epoch round-trip is required.

### A8 — Legacy pending entries must fail closed without fake provenance

At the sample there were seven pending rows. On first ordinary evaluation after deployment, any pending row missing placement or policy is retired through the existing never-filled path with an explicit `legacy_missing_fill_provenance` reason. It must never fill, wait for a guessed timestamp, or be assigned the current knob retroactively.

### A9 — Legacy target rests must be cleared, not converted or filled

One live xStock target rest lacked a policy snapshot. On first ordinary evaluation, a target rest missing target policy is cleared without closing the position. A stop still pre-empts and takes. A later target observation may place a new rest under the new policy.

### A10 — Target expiry depends on the placement snapshot

For `maker_only`, expiry clears the rest and leaves the position open. For `maker_preferred`, expiry retains today's taker conversion. The policy cannot be reread at expiry. VTS target exits remain outside the batch.

### A11 — Twins may not violate policy

`maker_only` suppresses the alternate taker twin. Under `maker_preferred`, an alternate twin is created only when that alternate arm is independently admissible under the existing VTS floor and the policy permits it. Twin tagging and aggregate exclusions remain unchanged.

### A12 — Supported-class boundary is explicit

Only `crypto_spot` and `xstock_spot` have seeded policy and an accepted side quote with local arrival. Unsupported classes fail hard before a maker rest; stops remain outside the resolver.

### A13 — No observation window or deployment hold is created

P1c is accepted by deterministic state-machine/clock mutations, persistence/config readback, all four CI jobs and bounded staging verification. A natural fill is follow-up evidence, not a release gate. The existing price/watchdog/bar windows keep their own populations and reviewed-build handoffs.

### A14 — Documentation is missing the new contract

The Manual and SIM need the policy truth table, policy vintage, strict interval, intentional clock separation, legacy cut and VTS exclusions. The issue/plans need closure without implying that P1c starts a calendar hold.

## 4. DESIGN DECISIONS

### D1 — Pure policy overlay with one effective decision (from A2-A3)

Add a shared resolver over the unchanged two-arm result:

- `maker_only`: admit maker only when the hard taker floor did not fire and adjusted maker EV is strictly positive; otherwise reject;
- `maker_preferred`: admit maker first when adjusted maker EV is above the caller's existing lane floor and no hard floor fired; otherwise admit taker only when taker EV is above that floor; otherwise reject.

The result carries policy, effective mode, effective conservative EV and stable reason. Downstream gates/rankers see only that effective EV. No path reads raw maker fees as profitability.

### D2 — Snapshot policy at the decision/rest boundary (from A4)

Add entry policy to RTB, active-open/closed and VTS open/closed provenance. Signal birth and refresh write policy atomically with the mode/value. Paper promotion consumes it. Paper target placement resolves and stamps a separate target-exit policy. Null means honestly pre-cutover; it never means a default.

### D3 — One captured placement instant (from A7-A8)

At every new entry rest, capture one `placedAtMs`, persist it as timezone-aware `maker_placed_at`, and derive `maker_deadline` from that exact value. Rehydrate exact milliseconds. Legacy pending entries missing either placement or policy retire immediately through the existing never-filled bookkeeping path.

### D4 — Strict quote interval before fill (from A5-A6)

Extend the shared evaluator with placement and arrival. A fill is eligible only for finite evidence satisfying `placement < arrival` and, where a deadline exists, `arrival < deadline`. Price-through is then tested. If the quote was received before the deadline, fill continues to win even when evaluated later; otherwise the ordinary deadline outcome applies. Missing/equal/pre-placement/at-or-after-deadline evidence never fills.

Crypto selection returns exact `bookUpdatedAt` or `sidesCapturedAtMs` beside the already-selected side without changing freshness `stampMs`/`clockBasis`. Active and VTS xStock selection return the accepted row's `atMs`. A post-placement replay counts as an arrival if the existing xStock structural/freshness guard accepts it; this batch does not invent venue change-kind provenance.

### D5 — Policy-safe target and legacy behavior (from A9-A10)

At target placement, snapshot the class's target-exit policy. A legacy rest with no policy is cleared and stays open. A new maker-only rest clears on expiry and stays open; a later target may place again. A maker-preferred rest preserves conversion. Stop checks remain ahead of and outside this branch.

### D6 — Policy-safe VTS twins (from A11)

Suppress twins that would instantiate a forbidden or independently inadmissible arm. This reduces paired-learning opportunities but keeps every created trade truthful to the policy stamped on it. Existing twin/shadow exclusion rules do not change.

### D7 — Four exact config rows and supported-class fail-hard (from A1, A12)

Seed entry and target-exit policy for crypto and xStock with scope-approved defaults. Reuse the existing required-string reader with the closed allowed set. Startup asserts all four exact rows. An unsupported class or missing/invalid/unwarmed value refuses before any rest or taker action.

### D8 — Population cut, not a system freeze (from A13)

No new observation clock starts. Any trade-outcome report spanning deployment splits by the row's policy stamp; pre-cutover nulls remain a separate cohort. The xStock bar-availability handoff adds the reviewed deployed ref to its build set and continues to October 25. The October 19 watchdog and November xStock reads continue unchanged. Stage 5 begins only after P1c closes, so no active Stage-5 trade population is reset.

## 5. IMPLEMENTATION PLAN — EACH ITEM BACK-REFERENCES THE AUDIT

### P1 — Policy types, config and pure resolver (from A1-A3, D1, D7)

- Add the two-value policy type and pure overlay beside the shared maker/taker decision.
- Reuse required string resolution; seed four exact DB rows and startup assertions.
- Preserve `decideMakerTaker` unchanged and test both active/VTS floors, hard-floor behavior, raw-fee non-use and structural rejection.

### P2 — Active signal birth/refresh and paper entry placement (from A2-A4, D1-D3)

- Apply the overlay at signal birth and RTB refresh; atomically persist policy with effective mode/EV.
- Ensure the paper exploratory lane cannot reopen a policy rejection.
- Consume the snapshot at promotion; capture one placement instant for maker rests and derive the deadline from it.
- Carry entry policy/placement to active and closed provenance without backfill.

### P3 — VTS decisions, persistence, rehydrate and twins (from A3-A4, A7-A8, A11, D2-D3, D6)

- Apply the overlay to crypto and xStock VTS decisions using the existing VTS floor, with maker-only's positive-maker rule.
- Carry policy and placement through every VTS creator, database writer, select/map, bootstrap and live/shadow rehydrate.
- Retire legacy pending rows through the existing never-filled path.
- Suppress forbidden/inadmissible alternate twins while preserving twin/shadow tags and aggregate exclusions.

### P4 — Quote-arrival carriers and shared pending evaluator (from A5-A7, D3-D4)

- Add exact local arrival to the accepted crypto/xStock quote result without changing freshness calculations or clock basis.
- Require explicit placement/arrival at all three pending-evaluator callers.
- Enforce strict boundaries and pre-deadline-fill-after-deadline semantics.
- Add exact rehydrate and same-object price/arrival tests.

### P5 — Paper target policy and legacy cut (from A9-A10, D2, D5)

- Snapshot target-exit policy at rest placement and carry it to the closed trade.
- Clear legacy no-policy rests without closing; keep stop precedence.
- Implement maker-only clear-and-remain-open and maker-preferred conversion; allow a later target to place a fresh rest.
- Keep VTS target exits unchanged and fence that exclusion.

### P6 — Schema, migration, export and source fences (from A1, A4, A7-A12, D2-D7)

- Add nullable, no-default provenance fields and forward/rollback migrations; register only the forward migration.
- Do not backfill historical policy or placement.
- Extend raw export surfaces for the new primitive facts.
- Fence exactly four pricing callers, three pending callers, one twin caller, four VTS persistence writers, one VTS fill mutator, and the supported-class boundary.

### P7 — Deterministic verification and bounded staging proof (from A13, D8)

1. Policy matrix across both classes, both legs, both policy values, active/VTS floors and hard-floor states.
2. Mutation: raw maker EV or fee substituted for adjusted maker EV must fail.
3. Strict time matrix: equality, pre-placement and at/after-deadline refuse; live-interval trade-through fills; pre-deadline arrival evaluated late fills; missing/non-finite evidence refuses.
4. Restart round-trip preserves placement and policy exactly; legacy pending and target-rest cuts are mutation-proved.
5. Stop pre-emption, maker-only target re-rest and maker-preferred conversion are covered.
6. Config/migration readback proves exactly four valid rows; invalid/missing/unwarmed and unsupported class fail hard.
7. All four CI jobs pass. Step 7 deploys the reviewed ref, verifies startup/health/config/schema, safely exercises deterministic seams, and records any natural live opportunity only as additional evidence. UI remains “not yet checked” unless Kyle performs it.

### P8 — Observation handoffs and governance (from A13-A14, D8)

- Add the deployed ref to the xStock bar-availability reviewed-build handoff without restarting its window.
- Keep October 19 and November reads on their existing anchors.
- Split any trade analysis at policy provenance, not merely deployment time.
- At Step 10 update the System Manual, SIM, issue, both plans, catalog/history and config inventory; state that no calendar hold was created.

No implementation item is unaudited.

## 6. PLANNED FILE SET FOR STEP 3

| area | planned files / change |
|---|---|
| shared policy/math | `server/core/math/maker-taker-decision.ts` or a colocated policy module; focused resolver tests |
| configuration | `server/services/maker-taker-config.ts`, startup warmup/assertion seam, forward/rollback migration, migration manifest |
| RTB/signal provenance | `server/services/signal-orchestrator.ts`, `server/core/rtb/ready_to_buy_service.ts`, RTB schema/storage and focused tests |
| paper entry/target | `server/services/active-execution-engine.ts`, active/closed schema/storage and focused engine tests |
| shared rest state machine | `server/core/trading/pending-maker-logic.ts` and its unit tests |
| crypto arrival | `server/exchanges/kraken/kraken-websocket-adapter.ts`, `server/core/trading/crypto-touch.ts`, touch reader types/tests |
| xStock arrival | active xStock selection carrier and `server/asset_classes/xstock_spot/vts-xs-instrument.ts`/guard/selectors/tests |
| VTS lifecycle | `server/services/vts-runner.ts`, `server/services/vts-trade-persistence.ts`, persistence/rehydrate/twin tests |
| schema/export | `shared/schema.ts`, raw export query if the existing export census reads the affected rows |
| source fences | focused audit/fence tests pinning caller/writer counts and exclusions |

The exact file list may narrow during compile-driven implementation; any added behavior outside these audited areas is `UNAUDITED` and requires Step 2 correction before it is built.

## 7. RISKS, FAILURE DIRECTIONS AND EXCLUSIONS

| risk | control / failure direction |
|---|---|
| policy lookup changes while a signal/rest waits | consume the durable snapshot; never reinterpret with a live reread |
| exploratory lane bypasses maker-only | structural rejected result, not a Net-Expectancy-only failure |
| guessed placement makes a stale quote look later | no backfill; legacy pending rows retire unfilled |
| legacy target converts under a policy it never had | clear the rest and retain the position |
| venue timestamp used for local ordering | separate arrival field; preserve freshness clock basis independently |
| price and timestamp come from different frames | one accepted quote object carries both; same-object tests |
| deadline processed late | arrival-time interval determines fill eligibility, monitor time determines only when outcome is applied |
| VTS learning semantics accidentally become active-trading semantics | caller-supplied existing floor; maker-only remains strictly positive |
| forbidden twin pollutes paired learning | create only policy-permitted, independently admissible alternate arm |
| unsupported class falls through to mark-only path | fail hard before maker-rest policy |
| observation concern freezes deployments | explicit reviewed-build handoffs and per-row cohort stamps; no P1c waiting quota |

Explicit exclusions: no VTS target-rest lifecycle (`#513`); no real-exchange post-only order lifecycle; no freshness-limit, side-selection or clock-basis changes; no resolution of `#1073`'s refused-cycle deletion timing; no historical policy/placement backfill; no claim that a replayed xStock frame proves the venue price itself changed after placement.

## 8. OPEN OBSERVATION WINDOWS AND CUT RULES

| work | current anchor / read | P1c effect and disposition |
|---|---|---|
| `B-PRICE-STALENESS-BOUND` | Sunday reopen, 2026-10-19 00:00–00:47Z | Price/watchdog population is unchanged. Continue; no reset. |
| `B-PRICE-FEED-TRUTH` I1 | same October 19 watchdog event | Feed evidence is unchanged. Continue; no reset. |
| `B-XSTOCK-BAR-AVAILABILITY` | window begins 2026-10-16 00:05Z; final read 2026-10-25 00:15Z before the 02:15 sweep | Normal reviewed deploys are allowed. Add P1c's deployed ref to the durable reviewed-build handoff; archive population and window continue. |
| `B-XSTOCK-BID-TRIGGER-RELAND` | EST anchor reads 2026-11-01/02/03 and 11-27 | Feed-session evidence continues. Any trade-outcome slice crossing P1c is split by policy stamp. |
| `B-PRICE-SIDE-BY-JOB` | prior crypto maker observation ended 2026-09-30 | No open crypto fill observation exists to reset. The batch's remaining work is separate. |
| Stage 5 paper reset | not started | P1c is a prerequisite and deploys before the reset; there is no running Stage-5 population to lose. |

## 9. ACCEPTANCE BAR FOR STEP 2

- All six required sources are named and the current code/runtime paths are reconciled with provenance.
- Every production decision/evaluator/twin/persistence entry point and scheduler is enumerated before tracing.
- The plan preserves same-kernel economics, single-number downstream use, side selection, freshness clocks and stop precedence.
- Policy and temporal provenance survive restart and cannot be guessed for legacy rows.
- The legacy pending and target-rest populations have safe, explicit cuts.
- Deterministic/mutation evidence plus bounded staging verification closes the batch; no natural-fill or calendar hold is required.
- Every plan item back-references an audit finding.

## 10. FRESH-CONTEXT REVIEWER RECORD

`REVIEWER: claim-only · “name the objects that would settle the per-class/per-leg policy and strict later-quote mechanism/absence, then name other states consistent with them” · HIT — ten material seams: missing temporal inputs, dropped producer receipt stamps, absent entry placement persistence, multi-seam VTS rehydrate, unsafe legacy backfill, timezone distinction, unsupported mark-only fallback, and preserved VTS target exclusion · re-derived yes at e6bc1c505 with production caller controls, schema/migration positive controls, live repeatable-read census and provenance commits; folded into §§0–8.`

## 11. PLAIN-LANGUAGE SUMMARY

The current maker/taker math is not the problem; it already prices both choices conservatively. What is missing is an enforceable class/leg rule, a saved record of which rule made each decision, and proof that a resting fill used a quote received after placement but before cancellation.

The implementation will add those facts without changing freshness clocks or stopping other deployments. Old pending entries will retire unfilled rather than receive invented timestamps, the one current old target rest will be cleared while its position stays open, and every future decision/rest will carry enough policy and timing provenance to survive restart and keep later analysis honest.
