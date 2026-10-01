# B-VTS-NO-DECISION-VALVE (row `3n.q3`, sprint plan row 4) — SCOPE (r2)

change-class: architecture

**Owner:** CC-C (with Langston — the price-side rule is CC-C + Langston's, Kyle-delegated 2026-09-03, row `3n`). **Parent:** `3n` `B-PRICE-SIDE-BY-JOB`. **Directive:** Kyle 2026-10-01, *"start the next pricing piece, the VTS no-decision valve"*; the sprint plan row's objective, verbatim: *"midpoint off, before the sprint: a VTS trade with no usable sell price no longer books its timeout at the midpoint."*

**Why architecture:** OBJ-1 changes what a VTS close records — on BOTH VTS lanes — and every outcome-sourced reader of either corpus consumes it.

> **r2 (Langston SENT BACK r1 at 2026-10-01T20:36Z):** BLOCKER-1 the shadow pass is a second valve site → now in §0 with its population and a tier-1 disposition; BLOCKER-2 the population → re-measured on both sinks with sink, filter and read time (and one correction to the blocker's premise, below); FINDING-1 the census now covers ARM readers as well as price/P&L readers; FINDING-2 the `rMultiple` NaN is an OBJ-1 item; the framing of (a) corrected to his; the max-hold gate's read site named; OBJ-4's emitter given a tier-1 entry; the stale 6 h comments named.

> ✅ **STEP 1 APPROVED (Langston r2, 2026-10-01T20:47Z), three conditions, all folded into Step 2 (disposition 1):** **C1 (OBJ-3)** the counters are keyed PER ASSET CLASS on both lanes — `_vtsShadowTouch` counts only `crypto_spot` (`vts-runner.ts:4428-4429`), so as written it would read 0 for the 217 shadow xStock Class B rows, and the real lane's `exitLooks` is crypto-gated (`:3484`) while `bookedNoBidClamp` is not; **C2 (OBJ-1)** a THIRD unguarded outcome computation and a THIRD sink: `closedTradeRecord` → `phase10SessionTrades` (`:3816`) → the `vts_trades_*.json` closed payload and the VTS closed-trades UI, carrying `exit: exitPrice` and `profit: dollarPnl` (`:3791-3792`) — Step 2 greps the CLASS of outcome computations over a closed VTS trade, not just the three named; **C3 (§5)** the no-migration claim restated against the columns that exist: `exit_decision_archive` carries `exit_price`, `pnl_pct`, `r_multiple` (all nullable; NO `gross_pnl`/`net_pnl`/`pnl` — those are `closed_trades`, which has no VTS writer, `#406`), and `pnl_pct` is the column OBJ-1 must leave empty; `exit_reason` is `text NOT NULL` with no check constraint, so `timeout_unpriced` needs no migration but DOES need the `normalizedReason` union (`:3651`) and `exitReasonMap` (`:3945-3952`) extended, or it funnels to `'other'`. He accepted the r2 correction to his BLOCKER-2 premise.

## 0. The problem, as it stands at the ref
- **The valve exists at TWO sites, both through the same evaluator and the same booking resolver:**
  - **Real lane:** `tec-evaluator.ts` step 2 with the 7-day `maxHoldMs`; the booking resolver `resolveVtsBookedExitPrice` (`vts-exit-booking.ts`).
  - **Shadow lane:** `vts-runner.ts:4405` passes `SHADOW_MAX_HOLD_MS` = **48 h** (`:874`) into the same `evaluateTECExit`, and `:4434` calls the same resolver — so the same two classes exist there, reached 3.5× sooner by hold time.
  - Both are gated by `isVtsMaxHoldEnabled()` (`vts-runner.ts:1283`, reads `module_constants` `max_hold_switch`/`enabled_vts`, **true since 2026-07-24**; it catches to `false` on a cold module, so the policy's gate is named here rather than assumed).
- **The two classes** (`ADJUSTMENT_FRAMEWORK` rule 8): **Class A** — step 2 returns BEFORE the no-transactable-side refusal with `exitPrice` = the mark; the resolver has no bid and books that mark (arm `clamp_no_bid`). **Class B** — no live mark: step 1 (`stale_timeout`) closes at the ENTRY price, booked by the resolver (arm `clamp_no_mark`).
- **POPULATIONS, measured 2026-10-01T20:37-20:38Z on staging, window from the epoch-6 boundary 2026-09-15T11:59:22Z:**

  | lane | sink | filter | forced-exit closes | booked at entry (Class B signature) |
  |---|---|---|---|---|
  | real, crypto | `exit_decision_archive` | `mode='vts'`, `exit_reason='time_stop'`, `trade_id NOT LIKE 'vts_xstock%'` | **55** | **1** (EGLD/USD 2026-09-26) |
  | real, xStock | same | same, `trade_id LIKE 'vts_xstock%'` | **62** | **0** |
  | shadow, crypto | `rtb_shadow_pairings` | `closed`, `closed_at` ≥ boundary, `asset_class='crypto_spot'` | `timeout` **12,938** | **19** (`shadow_max_hold` 0) |
  | shadow, xStock | same, `asset_class='xstock_spot'` | `shadow_max_hold` **217** · `timeout` **146** | **217 of 217** `shadow_max_hold`; 0 of 146 `timeout` |

  ⚠️ **Class A cannot be counted on either sink today**: the arm is not on the real-lane archive row until `8a-P4c` increment 3 deploys, and `rtb_shadow_pairings` has **no arm column at all**. Class B is countable by its signature (exit price = entry price). ⇒ **the shadow lane is where this matters at volume** — 217 xStock forced exits there were booked at their entry price (no live mark, i.e. xStock quiet hours), inside the sink the ranking work (`#221`, sprint row 135) is judged on.
  - **One correction to r1's BLOCKER-2 premise, at the code:** on the REAL lane `stale_timeout` is normalised to `timeout` BEFORE the archive's reason map (`vts-runner.ts:3652-3664`), so Class B archives as `time_stop` there — EGLD did. The premise holds for the shadow lane only, where `stale_timeout` becomes `shadow_max_hold` (`:4432`) and reaches `rtb_shadow_pairings`, not the archive.
- **Kyle's rule for the price side:** BUY on the ask, SELL on the bid; **a missing side ⇒ no decision.** The valve is the one place a VTS sell is forced without a side.

## 1. Objectives

**OBJ-1 — the policy: a forced VTS exit with no usable sell price books NO price — on BOTH lanes.** At max-hold (7 d real, 48 h shadow), if the exit has no usable bid (Class A) or no live mark (Class B), the trade's record is CLOSED with **no booked exit price**: a distinct close reason (proposed `timeout_unpriced`), its arm recorded, gross/net/R left empty, so every outcome reader excludes it **by construction**, and rule 8's register closes to new A/B members. **The framing, corrected (Langston r1):** VTS carries no exposure, so the valve bounds the OBSERVATION, not risk; and a live position with no bid would not close — it would stay open and keep trying. ⇒ **we close the record because we will not carry an unbounded observation, and we book no price because we never saw one.**
**Why (a) close-unpriced, not (b) a grace clock (Langston's argument, adopted):** (b) is (a) plus a second clock, so (a) is its strict precondition — and (a) builds the instrument (a distinct reason + the OBJ-3 counters) that would show whether a grace clock earns itself. (a) is complete on its own; (b) is revisited only on measured yield. **Step-2 condition (his): measure how long the no-side state PERSISTS past max-hold on the known instances** — hours ⇒ (a) discards nothing; seconds ⇒ (b) has a case.
**Includes:** the `rMultiple` NaN at the archive writer (`vts-runner.ts:3958-3961` guards `entryPrice` and `stopLoss`, not `exitPrice` — `#546` absent-as-valid) and the shadow outcome math (`computeShadowOutcomeMath`), which must produce empty outcomes, not NaN, for an unpriced close; and a home for the arm on the shadow sink (`rtb_shadow_pairings` has none — Step 2 chooses a column or the reason string).
*Verify:* per lane, a fixture where max-hold arrives with (i) no bid, (ii) no mark, (iii) a usable bid — (i) and (ii) close unpriced with their arm and empty outcomes (no NaN anywhere), (iii) books the bid exactly as today; the Step-2 reader census shows no reader takes a price, P&L or a friction charge from an unpriced row.

**OBJ-2 — the arm is on every closed row, real lane AND shadow lane.** Real lane: `8a-P4c` increment 3 carries `exitBookingArm` into the record — verified after that release (deploy B). Shadow lane: per OBJ-1's home.
*Verify:* closed rows written after the deploy carry the arm on both sinks.

**OBJ-3 — the `clamp_no_mark` arm is counted** (Langston rider, 2026-09-26): `bookedNoMarkClamp` beside `bookedNoBidClamp` on `[8a-P3][VTS_TOUCH]`, and the shadow touch line gains both counters.
*Verify:* a unit test drives each arm on each lane and reads the counters.

**OBJ-4 — the refusal alert carries the real refusal reason** (Langston triage of `d007059a`, 2026-09-24): the `no-trigger-vts-<symbol>` alert body (`vts-runner.ts:3545-3561`) names the level-basis reason (`crossed_book`, stale age, spread over ceiling) instead of pointing only at the two ceilings, which cannot reach a crossed book; and its sentence *"if it reaches the max-hold valve it books a timeout at the mark"* is rewritten to the OBJ-1 behaviour.
*Verify:* fixtures for each reason produce a body naming it.

**OBJ-5 — the VTS close writes the CARRIED asset class, not one re-derived from the ticker** (`#1075`): write the carried class; fix the `pairFriction` fallback; census the same-class sites named at `#1075`; re-run the collision intersection.
*Verify:* an xStock close on a shared ticker archives as `xstock_spot`; the census list is in the Step-2 record with each site's disposition.

## 2. Items on the row NOT in this scope, each with its home
- **Should a SELL exit refuse on the ASK side's state at all?** (the crossed-book design question, 2026-09-24): a shape change at the `level-basis` layer. Its own increment of this row after OBJ-1-5, scoped once OBJ-1 has fixed what "no usable sell price" means.
- **The paper lane's equivalent (`#1073`):** measure first at Step 2 (0 of 320 exit rests past the deadline so far; entry leg unmeasured); any change is its own increment.
- **Per-pass exit coverage** (Langston flag 2026-09-19): read the pass's selection path at Step 2 and record the answer.
- **The entry/exit spread asymmetry:** ONE home, row `3n.o`.
- **Stale comments, fixed in Step 3 of this batch:** the `isVtsMaxHoldEnabled` docblock (`vts-runner.ts:1277`, *"7-day / 6h shadow"*) and `:4296` (*"6h vs …"*) both say 6 h; the cap is 48 h (`:874`).

## 3. Architectural read (1.a) — completed at Step 2
`SYSTEM_IMPACT_MAP.md`: the VTS runner close path (both lanes), `exit_decision_archive`, `rtb_shadow_pairings` and their readers, the TEC evaluator. `SYSTEM_MANUAL.md`: the price side per job (§18.0.1) and the VTS lane. **The Step-2 census covers BOTH reader classes (Langston FINDING-1):** every consumer of a closed VTS row's **price / P&L / R**, AND every consumer of its **booking arm** — e.g. `vts-friction.ts:62` charges a half-spread exit to any arm that is not `bid`, so an unpriced arm would land in that bucket silently.

## 4. Provenance (1.b)
Corpora: `git log -S` (not path-limited); the row `3n.q3` text; `ADJUSTMENT_FRAMEWORK` rule 8; `RUNNING_ISSUES` `#1073`, `#1075`.
- **Tier 1 — the max-hold valve (`tec-evaluator.ts` steps 1-2).** Introduced `dd1f53726` (2026-04-23): *"B65.2: TEC exit-evaluator — centralize VTS + paper exit decisions"*. The paper lane passes `maxHoldMs: Infinity`, so the valve is VTS-only. **Disposition (2): relevant, needs updating.**
- **Tier 1 — the SHADOW valve site (`vts-runner.ts:4405`, `SHADOW_MAX_HOLD_MS` 48 h).** Same evaluator, same resolver; the shadow lane's outcome sink is `rtb_shadow_pairings` (`shadowClose`, `vts-runner.ts:4229`). **Disposition (2): relevant, needs updating — the same policy, the same counters; it carries the larger population (§0).**
- **Tier 1 — the booking resolver (`vts-exit-booking.ts`).** Introduced `d3e643032` (2026-09-02): *"F-G-2 Step 3: OBJ-0 shadow arm (crypto bid vs live mid), OBJ-5a/5b/5c — VTS books realistic exits and honest maker fees, one vts epoch bump"*. **(2).**
- **Tier 1 — the refusal alert emitter (`vts-runner.ts:3545-3561`, the per-trade no-decision rail).** Introduced `57d89095e` (2026-09-15): *"B-PRICE-SIDE-BY-JOB 8a-P3 Step 4 r2: per-trade VTS refusal rail, per-event maker-rest record, paper_sim epoch bump, Langston's six conditions"*. **(2):** right rail, wrong explanation for a crossed book, and a sentence OBJ-1 makes false.
- **Tier 1 — the VTS close records (`vts-runner.ts` close path, `vts-service.ts`, `shadowClose`).** **(2)** for the unpriced close, the arm and the carried class.
- **Tier 2 — the by-id register (`ADJUSTMENT_FRAMEWORK` rule 8):** closes to new Class A/B members once OBJ-1 lands; existing rows stay excluded. **(2).**
- `bridge/canonical/`: every component here post-dates the 2026-01/02 governance change; not consulted, stated.

## 5. Existence + ledger check
`RUNNING_ISSUES` (row text, `#1073`, `#1075`), `BATCH_CATALOG`, the `8a-P4c` records. No existing batch closes a VTS trade without a price, puts the arm on the shadow sink, or carries the class through; `8a-P4c` increment 3 already adds the arm to the real-lane record (OBJ-2 verifies, does not rebuild). **No migration is needed for the real lane** (Langston measured: `exit_price`, `gross_pnl`, `net_pnl`, `pnl` nullable on `exit_decision_archive` and `closed_trades`); the shadow sink's arm home is a Step-2 choice.
