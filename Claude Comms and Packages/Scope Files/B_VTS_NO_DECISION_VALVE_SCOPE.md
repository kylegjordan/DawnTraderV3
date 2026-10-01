# B-VTS-NO-DECISION-VALVE (row `3n.q3`, sprint plan row 4) — SCOPE

change-class: architecture

**Owner:** CC-C (with Langston — the price-side rule is CC-C + Langston's, Kyle-delegated 2026-09-03, row `3n`). **Parent:** `3n` `B-PRICE-SIDE-BY-JOB`. **Directive:** Kyle 2026-10-01, *"start the next pricing piece, the VTS no-decision valve"*; the sprint plan row's objective, verbatim: *"midpoint off, before the sprint: a VTS trade with no usable sell price no longer books its timeout at the midpoint."*

**Why architecture, not sub_batch:** OBJ-1 changes what a VTS close records (a close with no booked price), which every outcome-sourced reader of the VTS corpus consumes — a cross-cutting change to the learning record, not a contained sub-step.

## 0. The problem, as it stands at the ref
- **Two forced-exit shapes book a price the market never offered** (`ADJUSTMENT_FRAMEWORK` rule 8):
  - **Class A** — the 7-day max-hold valve (`tec-evaluator.ts` step 2) returns BEFORE the no-transactable-side refusal (step 2b), with `exitPrice` = the mark; the booking resolver (`vts-exit-booking.ts`, `resolveVtsBookedExitPrice`) has no bid and books that mark (arm `clamp_no_bid`).
  - **Class B** — a max-hold with NO live mark: step 1 (`stale_timeout`) closes at the trade's ENTRY price, and the resolver books it (arm `clamp_no_mark`).
- **Scale so far:** Class A, no confirmed member yet (candidates EGLD, FET, FOLD, ETH/GBP, KII, VVV/USD all settled non-member or undetermined); Class B, one member — EGLD/USD 2026-09-26, **1 of 25** post-epoch crypto VTS `time_stop` closes. Rare, but each is a fabricated outcome in the learning record, handled today by a by-id exclusion register that every reader must remember to apply.
- **Kyle's rule for the price side:** BUY on the ask, SELL on the bid; **a missing side ⇒ no decision.** The valve is the one place a VTS sell is forced without a side.

## 1. Objectives

**OBJ-1 — the policy: a forced VTS exit with no usable sell price books NO price.** At max-hold, if the exit has no usable bid (Class A) or no live mark (Class B), the trade is CLOSED (the valve still bounds exposure and frees the record) but with **no booked exit price**: a distinct close reason (proposed `timeout_unpriced`), its arm recorded, gross/net outcome left empty, so every outcome-sourced reader excludes it **by construction**, not by a register. ⭐ **The design choice to attack (Step 1):** (a) **close unpriced at max-hold** (recommended — simplest, honest: in live trading a position with no bid at its forced exit could not have been sold at any price we saw); vs (b) **a bounded grace past max-hold** waiting for a usable bid, then unpriced. (b) books more real prices but holds stale trades longer and adds a second clock.
*Verify:* on a fixture where max-hold arrives with (i) no bid, (ii) no mark, (iii) a usable bid — (i) and (ii) close unpriced with their arm, (iii) books the bid exactly as today; no outcome reader (census at Step 2) reads a price or P&L from an unpriced row; the by-id register's Class A/B are closed out (no new members can be minted).

**OBJ-2 — the arm is on every closed row.** Increment 3 of `8a-P4c` already carries `exitBookingArm` into the closed VTS record (`vts-service.ts`); this objective verifies it on staging after that release lands (deploy B) and adds whatever the census finds missing.
*Verify:* closed VTS rows written after the deploy carry the arm; a known `bid` close and (when one occurs) an unpriced close read back correctly.

**OBJ-3 — the `clamp_no_mark` arm is counted** (Langston rider, Class B ruling 2026-09-26): `bookedNoMarkClamp` beside `bookedNoBidClamp` on the `[8a-P3][VTS_TOUCH]` line.
*Verify:* a unit test drives each arm and reads both counters.

**OBJ-4 — the escalation alert carries the real refusal reason** (item added 2026-09-24, Langston triage of `d007059a`): the `no_transactable_side` alert body names the level-basis reason (e.g. `crossed_book`, stale age, spread over ceiling) instead of pointing at the two ceilings, which cannot reach a crossed book.
*Verify:* fixtures for each reason produce an alert body naming it.

**OBJ-5 — the VTS close writes the CARRIED asset class, not one re-derived from the ticker** (`#1075`): xStock closes on tickers that are also Kraken crypto pairs were archived as `crypto_spot` (20 rows since 09-01). Write the carried class; fix the `pairFriction` fallback; census the same-class sites named at `#1075`; re-run the collision intersection.
*Verify:* an xStock close on a shared ticker archives as `xstock_spot`; the census list is in the Step-2 record with each site's disposition.

## 2. Items on the row NOT in this scope, each with its home
- **Should a SELL exit refuse on the ASK side's state at all?** (the crossed-book design question, 2026-09-24): per-side staleness is not available at the `level-basis` layer — a shape change. Proposed: its own increment of this row after OBJ-1-5, scoped once OBJ-1's policy is settled (they must agree on what "no usable sell price" means).
- **The paper lane's equivalent (`#1073`):** measure first (0 of 320 exit rests past the deadline so far; entry leg unmeasured) — a Step-2 measurement here, any change its own increment.
- **Per-pass exit coverage** (Langston flag 2026-09-19): a scheduled review — read the pass's selection path at Step 2 and record whether every open VTS trade's stop/target is checked each pass.
- **The entry/exit spread asymmetry** (VTS entry legs carry no spread ceiling): ONE home, row `3n.o` — not re-scoped here.

## 3. Architectural read (1.a) — to be completed at Step 2
`SYSTEM_IMPACT_MAP.md`: the VTS runner close path, the closed-VTS archive and its readers (rankings, calibration, the export), the TEC evaluator. `SYSTEM_MANUAL.md`: the price side per job (§18.0.1) and the VTS lane. **Step 2 owes the full reader census for an unpriced close** — every consumer of a closed VTS row's price / P&L.

## 4. Provenance (1.b)
Corpora: `git log -S` (not path-limited); the row `3n.q3` text; `ADJUSTMENT_FRAMEWORK` rule 8; `RUNNING_ISSUES` `#1073`, `#1075`.
- **Tier 1 — the max-hold valve (`tec-evaluator.ts` steps 1-2).** Introduced `dd1f53726` (2026-04-23): *"B65.2: TEC exit-evaluator — centralize VTS + paper exit decisions"*. Its own comment calls step 2 *"Safety valve, not a normal exit."* The paper lane passes `maxHoldMs: Infinity`, so the valve is VTS-only. **Disposition (2): relevant, needs updating** — it bounds exposure correctly but books a price the price-side rule forbids.
- **Tier 1 — the booking resolver (`vts-exit-booking.ts`).** Introduced `d3e643032` (2026-09-02): *"F-G-2 Step 3: OBJ-0 shadow arm (crypto bid vs live mid), OBJ-5a/5b/5c — VTS books realistic exits and honest maker fees, one vts epoch bump"*. Its header already names `clamp_no_bid` *"the free-exit fiction this file exists to kill"*. **(2).**
- **Tier 1 — the VTS close record (`vts-runner.ts` close path, `vts-service.ts`).** **(2)** for the unpriced close and the carried class.
- **Tier 2 — the by-id register (`ADJUSTMENT_FRAMEWORK` rule 8):** becomes closed to new Class A/B members once OBJ-1 lands; its existing rows stay excluded. **(2).**
- `bridge/canonical/`: the valve predates nothing pre-governance (2026-04-23 is post-governance); not consulted, stated.

## 5. Existence + ledger check
`RUNNING_ISSUES` (row text, `#1073`, `#1075`), `BATCH_CATALOG`, the `8a-P4c` records. No existing batch closes a VTS trade without a price or carries the class through; `8a-P4c` increment 3 already adds the arm to the record (OBJ-2 verifies, does not rebuild).
