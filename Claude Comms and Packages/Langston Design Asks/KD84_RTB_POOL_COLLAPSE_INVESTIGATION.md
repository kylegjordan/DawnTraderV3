# KD-84 — ready-to-buy pool collapse: investigation record (r6)

**Owner:** NEW Claude (CC-B), with ANALYST Claude on the 11-08 deploy lead · **Directive:** KD-84 (Kyle 2026-11-15 ~22:50Z, `1-system-manual/pm/DECISIONS.md` at `1613c8122`) — investigation only; any fix comes back for its own placement · **Written:** 2026-11-15 ~23:40Z, a Sunday (xStock closed).
**Status (r3):** mechanism **CONFIRMED by Langston** at `ebaf73f09`, every load-bearing number re-derived by him (Discord 1571667253282341051). r3 folds his four corrections: §2(3) restated, §5's Monday test replaced by a per-refusal read (done, §5), §6 pointed at the rows already on Kyle's list, and the pot drawdown surfaced through row 52.

## 1. The symptom (object and population)

Object: `rtb_shadow_pool_members.pool_size`, paper, one value per promotion cycle (taken only when a promotion pass runs, so a sample, not a continuous count).
- Weekdays 2026-10-12 → 11-06: daily median 30-145, peaks 100-260; xStock 40-116 members per cycle.
- 2026-11-09 onward: daily median 1-2; xStock 0-3 members per cycle. Live `rtb_signals` at 23:00Z: 2 rows, both crypto.
- Hourly: 11-07 01:00Z the xStock half leaves at the weekend shutdown (expected); crypto drifts 11 → 1 by 09:00Z; xStock returns 11-09 01:00Z at 1-2 and never rebuilds.
- 11-04 is an earlier, one-day instance: median 15 between 11-03 (61) and 11-05 (130).

**The stronger instrument (Langston, measured at `e70c533c2`, his ruling on r2, Discord 1571669542088872100):** distinct signals reaching the pool per day vs `signal not restored`: 11-08 **835/835** · 11-09 **1166/1165** · 11-10 **545/530** · 11-12 **507/482** · 11-13 **595/566**. Essentially every signal that reached the pool on those weekdays was destroyed, and inflow (507-1166) was at or above most pre-collapse days (31-926) — the feed did not dry up.
**Three caveats on the median above:** (a) 11-14/11-15 are a different population — weekend inflow of 20 and 36 distinct signals, losses 13 and 22 — so the weekend pool of 1 is the xStock weekend baseline, not this mechanism; (b) `pool_size` is sampled only on passes with free slots, 743-2,826 cycles a day, so day-to-day medians are over unequal, condition-selected samples; (c) **11-11 does not fit and is not explained:** the pool rebuilt to 15-23 from 17:00 to 22:00Z while refusals continued at 18-70 an hour (`openSlots` 3-5; already-open-symbol deferrals steady at ~300 an hour through 15:00-23:00Z, so they do not explain it either). Left open, named.

## 2. The mechanism

1. **A promotion removes the row from the pool BEFORE the trade is opened, and does not put it back if the open fails.** `server/services/active-execution-engine.ts` promotion loop: the claim deletes the RTB row (`[8.8.4-A3.R1][PROMOTION_ORDER] RTB signal … removed before trade creation`), and a failed open logs `Signal … was removed from RTB but trade failed - signal not restored`.
2. **How many it pulls is the SLOT count, not the money cap.** `openSlots = maxTrades - openPositions.length` with `maxTrades = 20` (derived, `floor(100 / max_position_percent_pct)`); `getRankedSignals(mode, openSlots)`.
3. **The money cap can bind before the slot count does — and the cause is TIME, not unequal sizes (Langston's correction to r1).** `server/services/trade-safety.ts` `checkMaxTotalExposure`: cap = 100 % of `getMoneyHeld(mode)` (anchor + straddlers + REALIZED P/L, no unrealized); the sizer reads the same function. Each ticket is 5 % of money held **when it opened**; the cap is the sum of tickets against money held **now**. So the book can reach 20 only if the average money held over the 20 open times is at or below money held now — **while realized P/L is falling, it cannot.** The retired-Check-7 comment (`:606`, *"binds at the same point by construction"*) is true at an instant and false over any interval in which the pot moves.
4. **When the cap binds first, every 30-second pass pulls up to `openSlots` top signals, the cap refuses each, and each is lost.** With the book full on slots (20/20) the loop never runs and the pool accumulates; with the book "short" on slots but full on money, the loop drains the pool continuously. That is the shape ANALYST measured (cycles per signal 6 → 1 xStock, 11 → 1 crypto; promoted members 590/590).
5. ⚠️ **The loss is NOT conditional on the cap (Langston, r4 ruling, Discord 1571672100023050322; re-derived by him).** On 11-14/11-15 there were 0 exposure refusals, passes ran at `openSlots` 7-11, and 35 signals were still deleted and not restored — **26 `MAKER_MARKETABLE_DROPPED`, 7 cooldown `GUARDRAIL_BLOCK`, 2 `DEPTH_GATE`**. Delete-before-open loses a signal on ANY failed open; the cap was only the highest-volume trigger on the weekdays.

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

**Not a first finding:** `RUNNING_ISSUES` `#648` (2026-08-01, CC-C) already holds the surviving core — promoted every 30 s, the trade fails, three distinct causes; its withdrawn parts were exactly the magnitudes, the split and the causal explanation that §5 now re-derives. The 466-line read script is committed beside this record (`KD84_refusals_read.py`), not left in `/tmp`.
Positive control for the zeros: the same grep on the same files returns 491-1163 on other days.
Sample lines: 11-12 23:58Z `current=$558.38, projected=$585.68, max=$562.96 (100% of $562.96)`; 11-13 21:08Z `current=$581.24, projected=$609.82, max=$589.32`. Same period `MULTI_PROMOTE openSlots=2-8, maxTrades=20`. Arithmetic: the cap held about 17 positions averaging ~$34, while a new trade is ~$28.6, so the slot count (20 × ~$29) and the money cap disagreed by about three positions.
**Today's book** (`active_open_positions`, paper, 23:20Z): 12 positions, $27.38-$28.61 each, $336.29 in total, all opened 11-12 or later. The larger positions left on 11-13 (KD-77's seven manual closes at 23:52Z, and normal exits).

## 4. What this does and does not settle

- **Not B-ENTRY-GATE's gates, not the 8c deploy.** The refusals are the money cap; increment B's gates refused almost nothing (its 24 h read); 8c is inert while off (ANALYST, item 2 of his reply).
- ⚠️ **Correction to my first answer:** increment A first entered staging on **2026-11-07** in the `e0e68dfdb` joint deploy (B-BALANCE-SESSION-PAIRING, which moved the money cap onto money held), not on 11-10 — 11-10 was its correction. The pool's second drop sits after that deploy, but the 11-04 instance shows the mechanism existed before it.
- **Answered by ANALYST (r2, Discord 1571665002237001852, his queries `/tmp/size2.sql` on staging):** money held is the intended pot — $820 anchor (2026-10-06) + realized P/L since it (−$252.92 over 707 closes) = $567.08 today; the screen's $816.64 is the other, deliberate clock (the daily-loss breaker's). Nothing was sized at ~$34: positions opened 11-03…11-07 averaged $36.90-39.74 on the OLD $820 basis, those opened 11-09…11-15 $27.32-28.57 on money held — the basis moved at `e0e68dfdb`. B-BALANCE-SESSION-PAIRING pre-registered this pause (its completion report, line 25). The transitional half clears as the old positions close.
- ⚠️ **The structural half does not clear (ANALYST's residual, re-derived here):** 20 × ~$28 ≈ $560-572 against a $567 cap, and every realized loss lowers the cap while open positions keep their entry cost, so the cap can bind at 19 with a free slot — and from then on each pass loses the pool's top signals again. The tight cap is by design; the lost signal is what turns it into an empty pool. (The two crypto rows tonight: settled below.) The stop-out rate: §9.
- **Settled (Langston, measured 11-15):** the two crypto rows tonight are symbols already open — `RTB_RANKED total=2 … returning top 2` → `[DUP-OPEN-RACE] … already open … deferring` (1,199 such lines that day, 0 AMR blocks, 0 "At capacity"); a defer leaves the row queued, so nothing is lost tonight. The same summary line's third counter, `claimRefused` = 34 (11-14) / 67 (11-15) vs 0 on 11-09, all `outcome=unpriced`, is a fourth promotion outcome the claim's own comment does not list.
- **The crypto "unpriced" residual, read (r6):** every `[B-ENTRY-GATE][P7][UNPRICED]` line on 11-14/11-15 (`out__2026-11-14_12-23-22.log`, `out__2026-11-15_*`, `out.log`): **101 lines on 41 distinct rows, all `lastPricedAt=never`, `unpricedPasses=0`**; each row refused 1-4 times, **40 of 41 within 60 s** of its first refusal (one longer). These are newborn rows promoted before their first refresh pass priced them — the shape B-ENTRY-GATE increment B's 24 h read already recorded (42 refusals on 20 newborn rows, each ≤ 60 s). They stay queued (`ready_to_buy_service.ts:1732`, *"not opened, stays queued"*), so nothing is lost. **It is the P7 promotion-freshness gate waiting for a first price, not a crypto price that never arrives; it does not bear on the 8c switch.**

## 5. The per-refusal read (replaces r1/r2's Monday test, which Langston sent back: a 0.70 % margin, a qualifier true by construction, an unmeasurable P2 at 20/20, an inverted FAIL band)

**Object:** every `code:MAX_TOTAL_EXPOSURE` line on 2026-11-12 (00:00-24:00Z, `error__2026-11-13_00-00-00.log`), each paired with the latest `[MULTI_PROMOTE] openSlots` line at or before it (`out__2026-11-12_*` + `out__2026-11-13_00-00-00.log`, 3,594 lines). Per refusal: open positions = `maxTrades − openSlots`; the 5 % share = `max ÷ 20`; the candidate's ticket = `projected − current`. Script: staging `/tmp/kd84_refusals_ccb.py`. Each line carries its own timestamp, so the three staging deploys that day (07:21, 10:57, 12:15Z, staging reflog) split processes but not the count.
**Result, 466 refusals:**
- open positions at the bind: **17 on 461**, 16 on 4, 15 on 1 — never 19 or 20;
- the candidate's ticket was **below** its 5 % share on **466 of 466** (by $0.84-$0.87): no candidate was oversized;
- room left under the cap ($4.58-$9.91) was less than one ticket every time; money held $562.96-$572.05.
⇒ the cap bound three slots early on old, larger tickets, exactly the temporal mechanism in §2(3). The pot's own path (Langston, read off the cap's `100% of $…` field): **$753-755 on 11-03/04 → $581.78 on 11-07**, −$172 realized in three days, then −$15 across the next eight. **The pool collapse is downstream of that drawdown;** the lose-on-refusal path turns a shrinking pot into destroyed signals.
**Not run forward:** a forward window is informative only if no deploy lands in it; the same read can be run on any later day from the same lines, and will be at row 9i's Step 2.

**The forward test, in the form Langston accepts (per event, on the `current / projected / max` triple):** **R1** every `MAX_TOTAL_EXPOSURE` refusal has `projected > max` — construction (`trade-safety.ts:681` prints only then); **R2** each is followed in the same pass by `signal not restored` for that symbol — construction (claim at `active-execution-engine.ts:5761` precedes the guardrail at `:5935`); **R3**, the structural claim: `max` falls as losses book, and the book reaches 20 only in a net-winning session. **FAIL** = a refusal while `projected <= max`, or 20 open after a net-losing session. **NO-RESULT** = no refusal and no 20-book. **Successor: run at row 9j's Step 2** as its baseline, on whatever recent weekday has no deploy inside it (staging reflog checked) — not as a forward window that a deploy could void.

## 6. The fix is already on Kyle's list — the ask is ORDER, not placement (Langston's correction to r1; my ledger search missed these)

- **Losing a refused signal = `#1136`**, OPEN 2026-09-30, `HOME: B-RTB-PROMOTION-RETRY-STORM`, sprint **row 9j**, CC-B, QUEUED.
- **The cap binding before the slot count = `#1079`** (CC-C, 2026-09-29), which already dispositions lose-on-refusal as designed (`ACTIVE_PATH_FLOW.md:256`); its "20 % per trade ⇒ ~5 trades" figure is stale (now 5 % ⇒ 20). Also `#648` (2026-08-01, CC-C), the same promoted-then-failed stream.
- **Re-measuring tickets against the pot = row 9i `B-EXPOSURE-CLASS-ALLOCATION` (`#1135`)**, CC-B, QUEUED.
- **Conditions carried into 9i's Step 2:** (a) no `rtb_shadow_pool_members` row is written at 20/20 (`captureShadowPool` runs only from `getRankedSignals`, after the at-capacity return) — pool size is unmeasured exactly when the book is full; (b) `getRankedSignals` drops queued signals whose symbol is already open, so `pool_size` falls as the book grows — a confound on §1's object, not a rival cause.
**The ask to Kyle:** move rows 9i and 9j up. Nothing new is filed.

## 7. For Kyle, through row 52's reporting (surfaced, not placed)

The paper pot has lost **$252.92 realized on its $820 anchor (−30.8 %) over 707 closes**, $172 of it between 11-04 and 11-07. Row 52 already reported its own early stop to Kyle on 11-06; this pot-level figure goes with row 52's next report. Not asserted to be the same losses.

## 8. Kyle's design intent for the fix (via PM, his chat ~23:20Z 2026-11-15) and my proposal — for Langston to shape, not a build order

**Kyle (1):** promotion happens when a slot frees up; at that moment check BOTH the free slots AND the money. If the money is not there, do not promote and do not consume the signal; check back periodically.
**Kyle (2):** the 20-slot "Guardrail Max" on the Open Trades screen is static from the $820 launch; recalculate it continuously from the actual balance — and which balance?

**Proposal (NEW Claude):**
- **One number answers both:** *positions the money supports now* = open positions + ⌊(money held − Σ entry cost of open positions) ÷ today's ticket⌋, capped at the derived 20. The promotion pass uses it as its free-slot count (so it never pulls a signal the cap would refuse), and the screen shows it as the live Guardrail Max beside the static 20.
- **Which balance: money held (anchor + realized P/L, no unrealized)** — the same figure the sizer and the exposure cap already read. Unrealized would let paper gains on open trades raise capacity and then vanish, and would make the count move tick by tick; a different basis from the cap would rebuild exactly the disagreement this investigation found. (Kyle decides; this is the recommendation.)
- **"Check back periodically":** the promotion pass already runs every 30 s and the new check is arithmetic on two numbers already read, so no new timer is needed — a pass with 0 money-supported slots simply leaves the pool alone. The RTB refresh keeps evicting stale signals as today, so the pool cannot fill with dead entries.
- **The precedent is in the same function (Langston):** the AMR gate already sits above the claim and `continue`s — "Left in the queue (not failed)". Kyle's check belongs in that position: a move, not a new pattern.
- **The general fix is the RESTORE, not the money check (Langston, r4 ruling — emphasis inverted):** any failed open after the claim (cap, maker-marketable drop, cooldown, depth gate) puts the row back rather than losing it — `#1136`'s defect leg. Kyle's money check removes the highest-volume trigger; the restore closes the class. Both fold into 9j's Step 1 (agreed work, no new slot).
- **Home:** row 9j `B-RTB-PROMOTION-RETRY-STORM` (`#1136`, CC-B), re-scoped at its Step 1 to carry Kyle's (1) and (2); row 9i stays the class-allocation question. **Order (proposal to Kyle via PM):** right after B-ENTRY-GATE closes (its xStock week read runs to 2026-11-20 and a change to promotion inside it would split that window), ahead of row 172.

## 9. The stop-out rate Kyle asked about — disposition

Paper closes by week, `closed_trades`, mode paper, stops = `stop_hit` + `trailing_stop_hit`, share of stop-or-target exits: 09-14 65.6 % · 09-21 46.8 % · 09-28 78.6 % · 10-05 82.7 % · 10-12 80.0 % · 10-19 82.8 % · 10-26 74.5 % · 11-02 **88.0 %** (net −$82.58, the drawdown week) · 11-09 80.4 %. Last 14 days: 203 stop_hit, 37 target_hit, 46 never_filled, 7 manual_stop.
⇒ **Not new with the pool collapse:** about four in five level exits have been stops since early October; the 11-02 week was the worst. It is outcome quality (which signals win), not a pipeline break, and it is what row 52 (`B-SILENT-STRATEGY-CENSUS`, mine) already measures per strategy. **DISPOSITION: added to row 52's next report to Kyle, with §7's pot drawdown.** No defect asserted.
