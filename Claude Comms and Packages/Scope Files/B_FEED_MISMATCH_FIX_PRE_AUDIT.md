# B-FEED-MISMATCH-FIX — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r3)

change-class: architecture · plan row `3n.u` · owner CC-B · **STEP: 2 of 11 · NEXT STEP: 3 of 11**
Read at `origin/migration/aws-supabase` `d19949e70`/`6236d37a6`; DB measured on staging 2026-09-18/19. Langston Step-1 PROCEED (21:29Z) with BLOCKER-1, Q1/Q2 rulings, the slippage-sign nit and the OBJ-3 inheritance — all addressed below.

> **r3 — Langston r2 (22:05Z): one blocker, P1's predicate only — re-specified SIGNED below; everything else cleared.**
> **r2 — Langston Step-2 CHANGES-NEEDED (21:43Z) folded:** BLOCKER-1 (A-4 compared a bid WALK against a MID; harm does not order by age — re-derived by me, table below), BLOCKER-2 (NEM is decision-side, `3b.f-c`), Q3 ruling (divergence predicate), Q4 ruling (P4 in, P5 out → `B-ENTRY-LEVEL-RECHECK`), FINDINGS 1-5, row-count nit.

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED: FIVE close paths write `closed_trades` (SIM "Exit provenance"). NOW: SIX.** REASON: `reconcileIncompleteTrades` (`active-engine-service.ts:290-384`) runs inside every engine stop and books any trade left without a position at the mark or ENTRY price, no fee, no walk, no provenance, `close_reason = 'engine_stop_cleanup'` (A-3).
- **PREVIOUSLY STATED (scope OBJ-2a): slippage "equals gross P&L". NOW: gross P&L SIGN-INVERTED** (Langston nit): `slippageQuote = (requested − fill)·qty` with requested = entry ⇒ `(entry − exit)·qty`.
- **PREVIOUSLY STATED (r1 A-4): 8 of 49 xStock taker closes harmed, harm growing with book age. NOW: 3 of the 8 over-warmth rows book above the live bid, and the harm does NOT order by age** (19.7 s and 20.7 s are the 2nd and 3rd worst; 90 s and 213 s sit at the bid). REASON: r1 compared the walked fill to the decision MID; the fill-harm comparator is the decision-instant `exit_ticker_bid` (Langston BLOCKER-1).
- **PREVIOUSLY STATED (r1 A-2): "773 paper rows". NOW: 816 rows `mode='paper'` (9 open, 92 `never_filled`) at 2026-09-19.** REASON: 773 was the table total at my 2026-09-15 read; same predicate, the table grew.
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
- **Flatten / close-all / reconcile closes: ZERO** (predicate: every `closed_trades` row, `mode='paper'`; 773 at the 09-15 read, 816 at 09-19). No row carries `close_reason` `manual_stop`, `engine_stop_cleanup`, `portfolio_reset`, or source `entry_price_fallback` / `last_known_good`. Positive control: the same query returns `kraken_ws` / `kraken_equities_ws` sources and `stop_hit` / `max_holding_period` reasons, so the columns are populated. ⚠️ `exit_price_source` is NULL on every row before 2026-08-27 (provenance shipped `68930cd35`), so pre-08-27 flattens would be visible only by `close_reason` — also zero.
- ⇒ **These paths guard a rare event. The fix is about correctness when it fires (kill switch), not about observed harm.**

## A-3 · THE STOP FLOW (`active-engine-service.ts:761-880`) — WHY BLOCKER-1 IS RIGHT AND WORSE THAN STATED
Order: flag stop → **stop the execution engine** (no more exit cycles) → `forceCloseAllOpenPositionsOnStop` → **"DB verification": any position still open is DELETED** (`deleteActiveOpenPosition`, the orphan cleanup) → `reconcileIncompleteTrades` closes every trade row whose position is gone at `getPrice` or ENTRY.
⇒ **"Leave it open" is impossible today by construction** — a failed flatten is deleted two lines later and then booked at mark/entry by a sixth, unstamped close path. Any option (b) must change the orphan cleanup AND the reconciler, not just the flatten.

## A-4 · CLOSE-FILL BOOK AGE — measured since the age column went live (crypto 2026-08-30 23:29Z, xStock 08-31 00:15Z)
| class | taker closes | cold (no book) | over warmth (5 s / 15 s) |
|---|---|---|---|
| crypto | 46 | 0 | **0** (max fill age 234 ms) |
| xStock | 49 | 0 | **8** |

**The 8, against the decision-instant LIVE BID (`exit_ticker_bid`) — re-derived by me on staging after Langston's BLOCKER-1:**
| symbol | fill age | fill | live bid | fill vs bid | `exit_book_state` |
|---|---|---|---|---|---|
| BABA | 48 h | 118.40 | 112.00 | **+5.71 %** | NULL |
| SPGI | 20.7 s | 439.00 | 417.51 | **+5.15 %** | NULL |
| CTVA | 19.7 s | 89.59 | 81.26 | **+10.25 %** | NULL |
| PNC | 18.9 s | 238.02 | 238.02 | 0.00 % | NULL |
| SYY | 213.3 s | 76.48 | 76.48 | 0.00 % | two_sided |
| NEM | 90.2 s | 121.20 | 121.20 | 0.00 % | **hollow** |
| SNAP | 40.2 s | 5.80 | 5.80 | 0.00 % | two_sided |
| CPB | 48.9 s | 21.31 | 21.31 | 0.00 % | two_sided |

⇒ **FILL HARM = 3 OF 8, AND IT DOES NOT ORDER BY AGE.** The three harmful rows are exactly three of the four pre-`B-XSTOCK-FEED-SANITY` rows (NULL `exit_book_state`, before 2026-09-04), all ~00:15Z. **The measurement straddles that deploy: after it, 0 of 4 over-warmth rows show fill harm (n=4 — a bound, not a rate).**
⛔ **NEM is decision-side, not fill-side** (Langston BLOCKER-2): `hollow`, decision mid 86.945 against a live bid of 121.20 with the stop at 122.18 — the stop fired on a hollow mid; the fill then booked honestly at the bid. → `3b.f-c`/`#943`, CC-C. **Not absorbed here.**
⚠️ **Limit:** `exit_ticker_bid` is stamped at the DECISION instant, so this is cross-instant, n=8. It refutes the age ordering; it does not establish a replacement mechanism.
⚠️ Cold arm: **never fired** on either class since the column went live (0 of 95).

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

**P1 — close fill grades its book (OBJ-1; A-4, Q3 ruling, FINDINGS 1-2).** At `aee:3301-3312` call `assessWarmth(_closeSnap, 'bids', _closeCfg)` and persist it in a new nullable column **`exit_fill_book_warmth`** (`warm | stale_book | thin_book | no_book`; NULL on maker fills — no book consulted). ⚠️ **FINDING-2: the schema comment states the orthogonality — `exit_book_state_at_fill` (`aee:3676`) answers HOLLOWNESS (`two_sided|hollow|unknown`); this column answers WARMTH (age/levels). Different axes, both kept.** `exit_fill_depth_age_ms` keeps carrying the age as a recorded fact, not a gate.
- **warm** → walk, unchanged.
- **not warm** → **the refusal predicate is SIGNED DIVERGENCE (r3 — Langston r2 BLOCKER: an unsigned predicate refuses a correct walk).** A close is a SELL and walks the BID side, so a legitimate fill sits AT OR BELOW the contemporaneous best bid by the depth it ate — **it can never fill ABOVE it.** ⇒ **refuse (→ COLD) iff `walkedFill > referenceBid × (1 + up_tol)`**; the downward side is the depth walk and is **not bounded by this knob**. `referenceBid` = the decision-instant bid the loop already holds (the value persisted as `exit_ticker_bid`).
  - **Measured, re-derived by me on staging (all taker closes since the age column went live):** crypto n=46, 41 with a reference, divergence **−3.79 % … +0.47 %**, 0 above +1 %; xStock n=49, all with a reference, 46 at exactly 0.00 %, **the only three above +1 % are the three harmful rows (+5.15, +5.71, +10.25)**.
  - **`up_tol` = 1.0 %, one value, per-class `module_constants` rows, fail-closed, unknown-token arm named and fail-closed.** ⛔ **This is a CHOICE INSIDE AN EMPTY INTERVAL, NOT A DERIVATION, and the migration comment says so:** healthy max +0.47 % (KTA, crypto — cross-instant noise between the decision-instant reference and the fill-instant book), lowest harm +5.15 % (xStock), nothing observed between; **crypto has n=0 over-warmth rows, so its row is a choice with no population behind it.** (#546: a constant must not wear measured clothes.)
  - **The predicate runs ONLY on the not-warm arm.** A warm book walks unchanged whatever its divergence.
  - **NO-REFERENCE ARM, named (Langston rider 1):** a not-warm book with `referenceBid = NULL` → **walk + stamp `no_reference`, NOT cold.** Measured: every NULL reference is a EUR-quoted crypto pair (LINK/EUR, NEAR/EUR, WLD/EUR, ZEC/EUR — 5 of 46), all on WARM books, so they never reach the predicate; sending them to COLD would make FINDING-1's cap fire routinely on a non-defect. Touches `#966` (row 5.a) — the missing EUR reference is that row's subject, not this batch's.
  - ⛔ **WHAT P1 DOES NOT CATCH (Langston rider 2), stated so nobody describes it otherwise:** the reference bid has no freshness bound of its own, so when BOTH the book and the reference went stale together the divergence is 0.00 % and the close passes — SYY (213 s, 15 % spread) and NEM (hollow, 90 s) both score 0.00 %. **That class is decision-side and stays with `3b.f-c`/`#943` (CC-C).**
- **cold, running monitor (`:2656`, `:2571`):** non-filled ⇒ C3 leaves the position OPEN and the next cycle retries (Q1, as ruled). **FINDING-1 — bounded:** consecutive cold refusals are counted per position; at the cap → **YIELD** (walk the book anyway, stamp the warmth verdict + a yield flag) and raise an alert naming the symbol. The `hollow_skip_cap` pattern (`book-state.ts:31`, `book-state-config.ts:39`), not a new mechanism. Cap = per-class constant, same fail-closed rule.
- `order-placer.ts:103-115`: the cold and no-config arms stop booking `requestedPrice`; no-config becomes non-filled (LATENT — `beyond_depth_penalty_bps` = 50 seeded both classes).
- **cold, stopped engine (`:1381` via the flatten):** → P2.

**P2 — one flatten price resolver (OBJ-2; A-2, A-3).** A single function used by `forceCloseAllOpenPositionsOnStop`, `closeAllPositions` and `reconcileIncompleteTrades`:
1. **observed bid** from `getDepthSnapshot` (any age, age carried);
2. else a cached quote **with its age** — `last_known_good` is admitted ONLY here and ONLY labelled with its age (Langston's (b): test AGE, not provenance, at `apm:311/:343/:632`);
3. **never the entry price.**
Every resolver close is stamped `exit_price_source = 'synthetic_flatten'` (+ producer + observed age) and **fenced out of learning corpora** (the `calibration_epoch` / learning-capture readers — census at Step 3). ⭐ **RECOMMENDATION on BLOCKER-1: option (a), "book with age, labelled synthetic".** Reason: A-2 says it has never fired; A-3 says option (b) would also require rewriting the orphan cleanup and the reconciler, widening the batch into the stop flow for an event with zero occurrences; and "stop means flat" stays the operator contract (Langston: (b) would be an operator-contract change for Kyle). **Residual: no observed price at all (rungs 1-2 empty)** → there is no price to book, so **(b) applies to that sub-case only**: leave it open, raise a breakage alert naming the symbol, report it in `failedCount`/`details`, and **exempt it from the orphan cleanup** (one predicate at `active-engine-service.ts:~835`). ⚠️ **FINDING-4: the exemption is CARRIED EXPLICITLY into the reconciler** — the flatten already returns `details` with `positionId`; the reconciler skips exactly the trades of those positions, and **the symbol-keyed `openPositionSymbols.has(trade.symbol)` test (`aes.ts:319`) is replaced by that id-keyed set.** The position↔trade join column is named at Step 3 by a census of `active_open_positions`; if none exists, the flatten carries the trade id beside the position id. → FYI to Kyle with the frequency (0).
Slippage on a synthetic close is measured against the resolved observed price, or NULL — never entry (fixes A-0 sign-inverted P&L).

**P3 — close-all routes through the canonical close (OBJ-3; A-1, Langston inheritance).** `closeAllPositions` calls `forceClosePosition` per position with P2's price; the direct `updateClosedTrade` + unconditional `deleteActiveOpenPosition` (`apm:639-710`) go. **The silent deletion dies because the only delete is inside `closePosition`.** Inherits P2's residual (no price → stays open + alert). `resetPortfolio` (`apm:719`): census at the ref across `server client shared`, tests excluded — **its definition is its only occurrence; ZERO callers** (tests excluded). ⚠️ **FINDING-5: at WHOLE-TREE there is one more occurrence — `docs/current_state/screeners_export/backend/routes.ts:5941`, a docs export, not a live caller.** ⇒ rule-18 disposition (5) stands: delete in this batch; `DELETED_COMPONENTS_LOG` names the docs-export occurrence so a later grep is not read as a missed sweep.

**P4 — `reconcileIncompleteTrades` (A-0, A-3; Langston Q4: IN).** Route its price through P2's resolver and stamp provenance; it stays as the stop-flow bookkeeper. **FINDING-3 (fold):** its population is `getClosedTrades(mode, {limit: 1000})` ordered `desc(openedAt)` (`aes.ts:302`, `storage.ts:3216`) ⇒ past 1,000 rows (816 today) an older incomplete trade drops out silently. **Bound chosen: the typed `'all'` option on that signature** — the reconciler runs only inside an engine stop, and `logUnboundedRead` already records the size; a numeric cap would re-create the same silent drop later. Revisit only if the stop-time read is measured slow.

**P5 — MOVED OUT (Langston Q4).** A-5's level re-check at fill is its own subject, region and knob set and has had no scope round. **`HOME: B-ENTRY-LEVEL-RECHECK, owner CC-B, placed in PHASE_19_PLAN at row 3n.u2, immediately after 3n.u`** (written in this commit). A-5 stays here as its evidence.

## TESTS (Step 3)
Coltrane's fixture (stop 100, first usable bid 95 ⇒ never an execution-realistic 100) + a fresh book that closes; one per P1 arm; P2 each rung + the empty residual (no orphan delete); P3 no-trade-row case (no deletion without a close row); P1 signed-divergence arm: A-4's three harmful rows (refuse), the five harmless (walk), a deep crypto walk at −3.79 % (walk — the r2 blocker's case), a not-warm book with NULL reference (walk + `no_reference`); cold-cap YIELD; P4 population past 1,000 rows; the unknown-token fail-close on every new constant. Amend `order-placer.test.ts` cold/no-config cases deliberately.

## RULINGS RECORDED (Langston, 2026-09-18 21:43Z)
- Q3: divergence predicate; age recorded, not gated. · Q4: P4 in, P5 out.
- BLOCKER-1 (stopped engine): option (a) as recommended; the no-price residual (b) goes to Kyle as an FYI with the frequency (0).

## PLAIN LANGUAGE
The audit found that emergency closes have never actually fired in paper mode, but when they do (the kill switch), they can record a made-up price. It also found a sixth close path nobody had mapped, and that 3 recent xStock stop exits (all before the September 4 book-state fix) booked a sale well above what buyers were actually paying. The plan: every close checks how old its prices are. Emergency closes use the last real price with its age, clearly labelled and kept out of learning. The Close All button uses the normal close. Checking entries against the current price before they fill becomes its own batch, right after this one.
