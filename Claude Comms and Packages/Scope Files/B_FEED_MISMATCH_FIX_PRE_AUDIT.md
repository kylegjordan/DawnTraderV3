# B-FEED-MISMATCH-FIX — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r1)

change-class: architecture · plan row `3n.u` · owner CC-B · **STEP: 2 of 11 · NEXT STEP: 3 of 11**
Read at `origin/migration/aws-supabase` `d19949e70`/`6236d37a6`; DB measured on staging 2026-09-18/19. Langston Step-1 PROCEED (21:29Z) with BLOCKER-1, Q1/Q2 rulings, the slippage-sign nit and the OBJ-3 inheritance — all addressed below.

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED: FIVE close paths write `closed_trades` (SIM "Exit provenance"). NOW: SIX.** REASON: `reconcileIncompleteTrades` (`active-engine-service.ts:290-384`) runs inside every engine stop and books any trade left without a position at the mark or ENTRY price, no fee, no walk, no provenance, `close_reason = 'engine_stop_cleanup'` (A-3).
- **PREVIOUSLY STATED (scope OBJ-2a): slippage "equals gross P&L". NOW: gross P&L SIGN-INVERTED** (Langston nit): `slippageQuote = (requested − fill)·qty` with requested = entry ⇒ `(entry − exit)·qty`.
- **PREVIOUSLY STATED (scope OBJ-4): the levels are unchecked on xStock. NOW: unchecked on BOTH classes, and a signal can wait in the pool with NO age bound** (A-5). REASON: fresh-reader trace.
- **PREVIOUSLY STATED (scope OBJ-4): alert `404e978a` folds into OBJ-4. NOW: it does NOT** — it is the flat tick-age gate, which is CC-C's `3b.f-c` criterion (i) (`RUNNING_ISSUES` ~:7298). OBJ-4 is the LEVEL check beside it and must not touch that knob.

---

# PART A — THE AUDIT

**Sources read:** (1) code at the ref — `order-placer.ts:93-122`, `active-execution-engine.ts:1349-1400, 3268-3322`, `depth-source.ts:36-80, 140-163`, `active-portfolio-manager.ts:265-365, 600-730`, `live-pricing-adapter.ts:1318-1413`, `active-engine-service.ts:290-384, 761-880`, `active-dispatch.ts:60-215`; (2) DB `closed_trades` (paper, 773 rows 2026-07-15 → 09-18) + `module_constants`; (3) SIM "Exit provenance" `:325-354`, "OrderPlacer" `:950-957`; (4) System Manual §fill model `:815-819`, "Force Close on Stop" `:4142-4147`; (5) `RUNNING_ISSUES` / `BATCH_CATALOG` / `PHASE_19_PLAN` grep for every symbol touched — **only hit: `activeFillMaxAgeMs` → `3b.f-c` (CC-C) and `#1051` (withdrawn claim (iii), see A-6)**; (6) `bridge/canonical/` — no coverage of any close path (Langston's grep and the provenance reader's).

## A-1 · ENTRY-POINT CENSUS (§9.5(a-ii)) — tests excluded
| entry | callers |
|---|---|
| `orderPlacer.closeOrder` | **exactly ONE**: `aee:3308` |
| `closePosition` | three: `aee:1381` (forceClose) · `:2571` (maker rest fill) · `:2656` (exit monitor) |
| `forceClosePosition` | two: `apm:320` (no-price arm) · `apm:345` (live arm) |
| `forceCloseAllOpenPositionsOnStop` | one: `active-engine-service.ts:819`, inside `stopActiveEngine` |
| `stopActiveEngine` | **eight**: `routes.ts:4125, 4223, 11506, 11665` · `guardrail-policy.ts:530` (**kill switch / daily-loss**) · `m5e-validation-service.ts:343` · `auto_test_harness.ts:172` · (def `:761`) |
| `closeAllPositions` | `routes.ts:13626` (`POST /active-engine/close-all`) · `apm:728` inside `resetPortfolio` |
| `reconcileIncompleteTrades` | one: `active-engine-service.ts:867`, inside `stopActiveEngine` |

## A-2 · FREQUENCY (Langston's pre-condition for BLOCKER-1) — `closed_trades`, paper, all 773 rows
- **Flatten / close-all / reconcile closes: ZERO.** No row carries `close_reason` `manual_stop`, `engine_stop_cleanup`, `portfolio_reset`, or source `entry_price_fallback` / `last_known_good`. Positive control: the same query returns `kraken_ws` / `kraken_equities_ws` sources and `stop_hit` / `max_holding_period` reasons, so the columns are populated. ⚠️ `exit_price_source` is NULL on every row before 2026-08-27 (provenance shipped `68930cd35`), so pre-08-27 flattens would be visible only by `close_reason` — also zero.
- ⇒ **These paths guard a rare event. The fix is about correctness when it fires (kill switch), not about observed harm.**

## A-3 · THE STOP FLOW (`active-engine-service.ts:761-880`) — WHY BLOCKER-1 IS RIGHT AND WORSE THAN STATED
Order: flag stop → **stop the execution engine** (no more exit cycles) → `forceCloseAllOpenPositionsOnStop` → **"DB verification": any position still open is DELETED** (`deleteActiveOpenPosition`, the orphan cleanup) → `reconcileIncompleteTrades` closes every trade row whose position is gone at `getPrice` or ENTRY.
⇒ **"Leave it open" is impossible today by construction** — a failed flatten is deleted two lines later and then booked at mark/entry by a sixth, unstamped close path. Any option (b) must change the orphan cleanup AND the reconciler, not just the flatten.

## A-4 · CLOSE-FILL BOOK AGE — measured since the age column went live (crypto 2026-08-30 23:29Z, xStock 08-31 00:15Z)
| class | taker closes | cold (no book) | over warmth (5 s / 15 s) |
|---|---|---|---|
| crypto | 46 | 0 | **0** |
| xStock | 49 | 0 | **8 (16 %)** |
The 8 xStock rows, all `stop_hit`, age 19 s → **172,801 s (48 h, BABA)**; **booked fill vs exit-decision price: BABA 118.40 vs 112.75 · NEM 121.20 vs 86.95 · CTVA 89.59 vs 77.38 · SPGI 439.00 vs 412.39 · PNC 238.02 vs 223.68** — five at ~00:15Z session handoffs, **each booking a sale well ABOVE the price that triggered it.** ⛔ **So Langston's arm-2 premise ("a 30-second-old real ladder is strictly better evidence") holds at 20-50 s but NOT at 213 s or 48 h: an old pre-collapse bid books an optimistic exit.** → Q3.
⚠️ Cold arm: **never fired** on either class since the column went live (0 of 95). Crypto structurally rarely reaches it — the exit trigger already refuses without a fresh bid (`8a-P2`).

## A-5 · LEVEL VALIDITY AT FILL (fresh-reader trace, re-derived below) — NOTHING RE-CHECKS THE LEVELS, EITHER CLASS
Path: `active-dispatch.ts:137` → `signal-orchestrator.ts:533 dispatchExternalSignal` → VPG `:585` → sizing `:808` → SQE → RTB `queueSQESignal :1486` → target gate `normalizeAndGateTarget :1909` → RTB refresh (~120 s) → promotion `aee:4027` / 30 s loop `:951` → `executePromotedSignal :4229` → `executeSimulatedTrade :4317` → depth gate `:626` → xStock liveness `:4718` → maker-marketable `:4741-4745` → `openOrder :4854`.
- **(a) entry overshoot: none.** `isMarketableAtPlacement` (`:4745`) only flips maker→taker; the fill takes the walked ask with no tolerance (`order-placer.ts:63-91`).
- **(b) RR at the fill: none.** The ONE min-RR check is `normalizeAndGateTarget` at birth, thresholds from `getPerClassTargetGate` (`expectancy.ts`, the `B-GEOMETRY-REACH-BASELINE` canonical resolver). Zero RR references in `active-execution-engine.ts`.
- **(c) signal / bar age: not carried.** `XstockActiveDispatchInput` (`active-dispatch.ts:108-131`) has no timestamp (the C3 design ask said so: *"The dispatch input carries **no timestamp**"*). Time-based RTB expiry was REMOVED (R9.3-C, `server/core/rtb/ready_to_buy_service.ts:216-217`: *"TTL removed - lifecycle governed by SQE results only"*); `queuedAt` feeds only a capped decay penalty. **A signal can wait in the pool unbounded.**
- **(d) stop already breached at open: none** — caught only by the exit monitor after the open.
- ⚠️ `eval-cycle.ts:579` calls the xStock bar the **"forming (in-progress) bar"** — so an xStock level may come from an UNCLOSED bar. Recorded, not pursued here (it is the level BASIS, `8c`/CC-C).
REVIEWER r1: claim-only · "is the signal re-validated against the current price before the fill, either class?" · none found on (a)-(d), searches shown · re-derived y: `aee` grep `minRR|min_rr|normalizeAndGateTarget|getPerClassTargetGate` = 0 hits (positive control: `closePosition` in the same file = 15 lines); `queueSQESignal :1486` before `normalizeAndGateTarget :1909` confirmed at the ref.

## A-6 · LEDGER CROSS-REFERENCES (§9.5(b-ii)) — NOT NEW FINDINGS
- The trace flagged "RTB enqueue at :1486 precedes the gate at :1909". **That is `#1051` claim (iii), WITHDRAWN 2026-09-12 — the runtime test came back against it.** Not re-opened.
- The flat tick gate at `active-dispatch.ts:180-186` is `3b.f-c` criterion (i), CC-C — **untouched by this batch.**

## A-7 · DOC GAPS (Step 10)
- SIM "five close paths" → six; `closeAllPositions` and `reconcileIncompleteTrades` both bypass `closePosition`.
- System Manual "Force Close on Stop" says *"5s staleness guard"* — false for the last-resort re-serve (`live-pricing-adapter.ts:1394-1413` serves `last_known_good` with no age bound; the 5,000 ms decides whether to REFRESH).
- System Manual §fill model: "a market exit always gets out" must be restated with the stopped-engine exception chosen below.

---

# PART B — THE PLAN (each item → its finding)

**P1 — close fill grades its book (OBJ-1; A-4).** At `aee:3301-3312` call `assessWarmth(_closeSnap, 'bids', _closeCfg)`; persist the verdict in a new nullable column `closed_trades.exit_fill_book_state` (`warm | stale_book | thin_book | no_book`; NULL on maker fills — no book consulted). Arms:
- warm → unchanged.
- stale-but-present, age ≤ **the exit lane's own ceiling** → walk + stamp. *(Q3 — ceiling choice.)*
- stale beyond it, or `no_book` → treated as COLD.
- **cold, running monitor (callers `:2656`, `:2571`):** return **non-filled** ⇒ the existing C3 rule leaves the position OPEN and the next cycle retries (Langston Q1, approved as written). `order-placer.ts:103-115` cold/no-config arms stop booking `requestedPrice`; the no-config arm becomes non-filled too (it is LATENT — `beyond_depth_penalty_bps` = 50 seeded both classes).
- **cold, stopped engine (caller `:1381` via flatten):** → P2's resolver.

**P2 — one flatten price resolver (OBJ-2; A-2, A-3).** A single function used by `forceCloseAllOpenPositionsOnStop`, `closeAllPositions` and `reconcileIncompleteTrades`:
1. **observed bid** from `getDepthSnapshot` (any age, age carried);
2. else a cached quote **with its age** — `last_known_good` is admitted ONLY here and ONLY labelled with its age (Langston's (b): test AGE, not provenance, at `apm:311/:343/:632`);
3. **never the entry price.**
Every resolver close is stamped `exit_price_source = 'synthetic_flatten'` (+ producer + observed age) and **fenced out of learning corpora** (the `calibration_epoch` / learning-capture readers — census at Step 3). ⭐ **RECOMMENDATION on BLOCKER-1: option (a), "book with age, labelled synthetic".** Reason: A-2 says it has never fired; A-3 says option (b) would also require rewriting the orphan cleanup and the reconciler, widening the batch into the stop flow for an event with zero occurrences; and "stop means flat" stays the operator contract (Langston: (b) would be an operator-contract change for Kyle). **Residual: no observed price at all (rungs 1-2 empty)** → there is no price to book, so **(b) applies to that sub-case only**: leave it open, raise a breakage alert naming the symbol, report it in `failedCount`/`details`, and **exempt it from the orphan cleanup** (one predicate at `active-engine-service.ts:~835`). → FYI to Kyle with the frequency (0).
Slippage on a synthetic close is measured against the resolved observed price, or NULL — never entry (fixes A-0 sign-inverted P&L).

**P3 — close-all routes through the canonical close (OBJ-3; A-1, Langston inheritance).** `closeAllPositions` calls `forceClosePosition` per position with P2's price; the direct `updateClosedTrade` + unconditional `deleteActiveOpenPosition` (`apm:639-710`) go. **The silent deletion dies because the only delete is inside `closePosition`.** Inherits P2's residual (no price → stays open + alert). `resetPortfolio` (`apm:719`): census at the ref across `server client shared`, tests excluded — **its definition is its only occurrence; ZERO callers** ⇒ rule-18 disposition (5): delete in this batch, `DELETED_COMPONENTS_LOG` + `_archive`.

**P4 — `reconcileIncompleteTrades` (A-0, A-3).** Route its price through P2's resolver and stamp provenance; it stays as the stop-flow bookkeeper. ⚠️ **New to the scope — Langston to confirm it belongs here** (it is the same defect in a sixth place).

**P5 — level validity at the fill, BOTH classes (OBJ-4; A-5).** ⚠️ **Scope widening flagged for Langston:** the finding is not xStock-specific. Proposal — one check in `executeSimulatedTrade` just before `openOrder`, using the ask the depth gate already holds:
- entry overshoot: `ask > entry × (1 + tol)` → hold;
- stop already breached (`ask ≤ stop` for a long) → drop;
- **RR at the ask through the EXISTING `getPerClassTargetGate`** (Q2 carve-out: no second resolver) → below floor → hold;
- new per-class `module_constants` for `tol` only, fail-closed, **unknown-token arm named and fail-closed** (the `reach_atr_max_unknown_floor` lesson).
Bar-age term (scope OBJ-4 (i)) **dropped**: A-5(c) shows no timestamp is carried and the xStock bar may be the forming one, so a bar-age check would be measuring a value we do not have; the ask check covers what bar age was a proxy for. Counted skips by reason, visible in Filter Diagnostics.

## TESTS (Step 3)
Coltrane's fixture (stop 100, first usable bid 95 ⇒ never an execution-realistic 100) + a fresh book that closes; one per P1 arm; P2 each rung + the empty residual (no orphan delete); P3 no-trade-row case (no deletion without a close row); P5 each arm, both classes, and the unknown-token fail-close. Amend `order-placer.test.ts` cold/no-config cases deliberately.

## QUESTIONS FOR LANGSTON
- **Q3 —** the stale-arm ceiling for P1: the exit lane's own freshness ceiling (crypto `EXIT_TRIGGER_MAX_AGE_MS` 2,000; xStock `mark_staleness` cap 300 s), or a multiple of `warmth_max_age_ms`? A-4 says the ceiling matters: the harmful rows are 213 s and 48 h, the benign ones 19-49 s.
- **Q4 —** P4 and P5's widening (both classes): in this batch, or split?

## PLAIN LANGUAGE
The audit found that emergency closes have never actually fired in paper mode, but when they do (the kill switch), they can record a made-up price. It also found a sixth close path nobody had mapped, and that 8 of 49 recent xStock stop exits used an order-book snapshot old enough to book a sale well above the real market. The plan: every close checks how old its prices are. Emergency closes use the last real price with its age, clearly labelled and kept out of learning. The Close All button uses the normal close. And before any entry fills, it is checked against the current price for both asset classes.
