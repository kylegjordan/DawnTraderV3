# KD-84 — ready-to-buy pool collapse: investigation record (r2)

**Owner:** NEW Claude (CC-B), with ANALYST Claude on the 11-08 deploy lead · **Directive:** KD-84 (Kyle 2026-11-15 ~22:50Z, `1-system-manual/pm/DECISIONS.md` at `1613c8122`) — investigation only; any fix comes back for its own placement · **Written:** 2026-11-15 ~23:40Z, a Sunday (xStock closed).
**Status:** a mechanism with code lines and log counts behind it. **NOT RE-READ** by a fresh reader; the review is Langston's. One prediction is pre-registered below for Monday.

## 1. The symptom (object and population)

Object: `rtb_shadow_pool_members.pool_size`, paper, one value per promotion cycle (taken only when a promotion pass runs, so a sample, not a continuous count).
- Weekdays 2026-10-12 → 11-06: daily median 30-145, peaks 100-260; xStock 40-116 members per cycle.
- 2026-11-09 onward: daily median 1-2; xStock 0-3 members per cycle. Live `rtb_signals` at 23:00Z: 2 rows, both crypto.
- Hourly: 11-07 01:00Z the xStock half leaves at the weekend shutdown (expected); crypto drifts 11 → 1 by 09:00Z; xStock returns 11-09 01:00Z at 1-2 and never rebuilds.
- 11-04 is an earlier, one-day instance: median 15 between 11-03 (61) and 11-05 (130).

## 2. The mechanism

1. **A promotion removes the row from the pool BEFORE the trade is opened, and does not put it back if the open fails.** `server/services/active-execution-engine.ts` promotion loop: the claim deletes the RTB row (`[8.8.4-A3.R1][PROMOTION_ORDER] RTB signal … removed before trade creation`), and a failed open logs `Signal … was removed from RTB but trade failed - signal not restored`.
2. **How many it pulls is the SLOT count, not the money cap.** `openSlots = maxTrades - openPositions.length` with `maxTrades = 20` (derived, `floor(100 / max_position_percent_pct)`); `getRankedSignals(mode, openSlots)`.
3. **The money cap can bind before the slot count does.** `server/services/trade-safety.ts` `checkMaxTotalExposure`: cap = `maxTotalExposurePct` (100) % of `getMoneyHeld(mode)`; current exposure = Σ quantity × entry price of open positions. Its own header comment says it *"binds at the same point by construction"* as the slot count — true only when every open position is the same size.
4. **When the cap binds first, every 30-second pass pulls up to `openSlots` top signals, the cap refuses each, and each is lost.** With the book full on slots (20/20) the loop never runs and the pool accumulates; with the book "short" on slots but full on money, the loop drains the pool continuously. That is the shape ANALYST measured (cycles per signal 6 → 1 xStock, 11 → 1 crypto; promoted members 590/590).

## 3. The evidence

Lines per day in `/var/log/dawntrader/error__<D+1>.log` (that file holds day D; `console.warn` lines land in the error stream):

| day (UTC) | `code:MAX_TOTAL_EXPOSURE` | `signal not restored` | pool median that day |
|---|---:|---:|---:|
| 11-04 | 491 | 515 | 15 |
| 11-05 | 0 | 158 | 130 |
| 11-06 | 0 | 18 | 102 |
| 11-07 | 149 | 184 | 7 |
| 11-08 | 835 | 835 | 1 |
| 11-09 | 1163 | 1165 | 1 |
| 11-10 | 528 | 530 | 1 |
| 11-11 | 864 | 913 | 2 |
| 11-12 | 466 | 482 | 2 |
| 11-13 | 518 | 566 | 1 |
| 11-14 | 0 | 13 | 1 |
| 11-15 (to 23:10Z) | 0 | 22 | 1 |

Positive control for the zeros: the same grep on the same files returns 491-1163 on other days.
Sample lines: 11-12 23:58Z `current=$558.38, projected=$585.68, max=$562.96 (100% of $562.96)`; 11-13 21:08Z `current=$581.24, projected=$609.82, max=$589.32`. Same period `MULTI_PROMOTE openSlots=2-8, maxTrades=20`. Arithmetic: the cap held about 17 positions averaging ~$34, while a new trade is ~$28.6, so the slot count (20 × ~$29) and the money cap disagreed by about three positions.
**Today's book** (`active_open_positions`, paper, 23:20Z): 12 positions, $27.38-$28.61 each, $336.29 in total, all opened 11-12 or later. The larger positions left on 11-13 (KD-77's seven manual closes at 23:52Z, and normal exits).

## 4. What this does and does not settle

- **Not B-ENTRY-GATE's gates, not the 8c deploy.** The refusals are the money cap; increment B's gates refused almost nothing (its 24 h read); 8c is inert while off (ANALYST, item 2 of his reply).
- ⚠️ **Correction to my first answer:** increment A first entered staging on **2026-11-07** in the `e0e68dfdb` joint deploy (B-BALANCE-SESSION-PAIRING, which moved the money cap onto money held), not on 11-10 — 11-10 was its correction. The pool's second drop sits after that deploy, but the 11-04 instance shows the mechanism existed before it.
- **Answered by ANALYST (r2, Discord 1571665002237001852, his queries `/tmp/size2.sql` on staging):** money held is the intended pot — $820 anchor (2026-10-06) + realized P/L since it (−$252.92 over 707 closes) = $567.08 today; the screen's $816.64 is the other, deliberate clock (the daily-loss breaker's). Nothing was sized at ~$34: positions opened 11-03…11-07 averaged $36.90-39.74 on the OLD $820 basis, those opened 11-09…11-15 $27.32-28.57 on money held — the basis moved at `e0e68dfdb`. B-BALANCE-SESSION-PAIRING pre-registered this pause (its completion report, line 25). The transitional half clears as the old positions close.
- ⚠️ **The structural half does not clear (ANALYST's residual, re-derived here):** 20 × ~$28 ≈ $560-572 against a $567 cap, and every realized loss lowers the cap while open positions keep their entry cost, so the cap can bind at 19 with a free slot — and from then on each pass loses the pool's top signals again. The tight cap is by design; the lost signal is what turns it into an empty pool. Why the two crypto rows in the pool tonight are not ranked with 8 slots free (`PROMOTION_SUMMARY promoted=0 failed=0`). The stop-out rate Kyle asked about — not investigated.

## 5. Pre-registered for Monday (written before the data; AMENDED r2 before any Monday data, because r1's P1 assumed 20 positions always fit — $567 cap ÷ ~$28.4 per trade ≈ 19.97, so it may not)

Window: the first weekday session, 2026-11-16 14:30-21:00Z. Objects: `error.log` (`code:MAX_TOTAL_EXPOSURE`, `signal not restored`), `out.log` (`MULTI_PROMOTE openSlots`), `active_open_positions` (paper), `rtb_shadow_pool_members.pool_size`.
- **P1:** no `MAX_TOTAL_EXPOSURE` refusal occurs with fewer than 19 positions open.
- **P2:** if the book reaches 20, the pool's median `pool_size` per cycle rises above 10 within the session.
- **P3:** if the cap binds at 19 (refusals with `openSlots = 1`), every refusal is followed by `signal not restored` and the pool median stays at or below 2 while it lasts — the drain is structural, not transitional.
**FAIL (mechanism wrong):** refusals with fewer than 19 open, or a pool still at or below 2 while the book sits at 20 with `openSlots = 0`.

## 6. What a fix would be (for placement; nothing is started)

Two separable questions, both decisions rather than defects until placed:
1. A guardrail refusal should probably leave the signal in the pool (or not pull it), rather than lose it — today a refused promotion destroys a ranked, SQE-passed signal.
2. The slot count and the money cap should not be able to disagree — either derive the free slots from the money left, or stop at the first refusal in a pass.
