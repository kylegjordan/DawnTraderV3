# B-XSTOCK-BID-TRIGGER-RELAND — PROGRESS REPORT

## OPEN — waiting on: the three folded issues not yet shown delivered (`#961`, `#962`, `#1087`, §5). The C-P5 retirement's narrowed `sun_reopen` leg is now complete: the first post-retirement Sunday reopen read passed 2026-11-23 (§3i; the retirement itself shipped `8fac86e5e`, Step 7 PASS, Step 8 CONFIRMED, Step 10 2026-11-20). *(Increment (4c)'s five-session read is also done: Step 7 PASS 2026-11-13, §3f.)*

change-class: `architecture` (scope header) · owner CC-C (Analyst Claude) · sprint plan row 2 · `#1191` (increment 4a), `#1199` (placed follow-up)

## 1. What the batch is for
Row 2 makes xStock trades open and close only where a real trade could (Kyle 2026-10-09): the broken-book guard at entry and exit with a duration report, the bid/ask trigger with a top-of-book size check, the Eastern-time venue-transition pause, and the VTS half. Scope: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`.

## 2. What has shipped (this report covers the two pieces deployed 2026-10-16; increments A and C are recorded in `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_WINDOW_READ.md`)
**Deployed `5cab7b820f18606d002f4cf12cd36af131ba32bb` 2026-10-16 15:10:55Z** (`dt-deploy --by cc-c`; CI run `38920504436` 4/4 per job at that sha; protected file `bridge/canonical/phase9_predictive-learning.json` checksum unchanged).

**Objective 6 — `spread_blown` ON (Kyle 2026-10-16: "turn it on and then review and observe").** An xStock book wider than the governed 1% ceiling (`ri_abs_spread_ceiling_pct`) is `hollow/spread_blown`, judged absolutely and before any comparator, so a re-seed can no longer release an exit on a blown book (PCAR/USD 2026-10-13). The hold is intentionally indefinite; entry is refused on a reference-free terminal cause; a spread_blown-only yield pages nobody; the SKIP log is summarised per run; a stop-hold tripwire (S6) measures the cost when a stop would have fired. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_OBJ6_STEP4_CHANGE_LIST.md`. Design: `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_spread-blown-arming_r1.md`.

**Increment (4a) — the VTS and paper no-decision rails clear themselves.** Per-trade VTS keys; expected wide/quiet books join one info record and page only after 30 min of session time; durable decision marks so rows clear across a restart; per-position paper keys; unpriced closes recorded with hold and last refusal. Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r1-r5f. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_STEP4_CHANGE_LIST.md`.

**Increment B — objectives 5 + 8's size test (deployed `93dce9cb9`, 2026-10-17 07:56:13Z; `dt-deploy --by cc-c`).** The paper xStock stop/target trigger reads the guard-judged BID while the book-state guard ran and `spread_blown` is on — otherwise the mark, with the reason printed; armed with no bid ⇒ no decision. `xstockSideSize` (`transactable-sides.ts`): resting fills and the taker entry refuse a side that cannot show our size, exits are only counted; a broken own-row quantity pages once per position; a crossed book refuses entry. Epoch `xstock_spot` `paper_sim` 6 → 7. Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` (r2, P1-P9); change list `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_INCB_STEP4_CHANGE_LIST.md`. ⚠️ **Objective 8 is PARTIAL:** B shipped its size test; the ONE shared trigger module for the engine and the VTS, with its call-site-count fence, is increment (4b) and is not built (the VTS trigger is still its own implementation, `vts-runner.ts` `_vtsTriggerPrice`).

## 3. Steps completed, with evidence
| piece | step | evidence |
|---|---|---|
| obj 6 | 2 | plan r2 + r2a; Coltrane approved S2/S5, S6 corrected (design doc above) |
| obj 6 | 4 | Langston APPROVED at `83177ba6e`; Coltrane SENT BACK (terminal-cause gate, SKIP log volume), folded, APPROVED at `f7413a96a` |
| (4a) | 2 | Coltrane APPROVED r5 at `7977b2d01`; Langston APPROVED r4 (five conditions) and r5 (two conditions), all folded |
| (4a) | 4 | Coltrane: three send-backs folded, APPROVED r4 at `49308fcf4`; Langston: per-position paper key, APPROVED r3 at `af1b3f5b6` with three document conditions, folded at `5cab7b820`; NEW Claude notified of the engine touch (watcher down at the time) |
| both | 5 | CI `38920504436` 4/4 per job at `5cab7b820` |
| both | 6 | deployed `5cab7b820` 15:10:55Z; `spread_blown_enabled = 1` read back (`updated_by b-xstock-bid-trigger-reland-obj6`, 15:10:43Z, before the restart) |
| (4a) | 7 (first read) | two-sided legacy-row read PASS: of 60 open rows (pre-deploy snapshot 15:09:56Z: 28 closed / 32 open trades) 28/28 `TRADE-CLOSED`, 32/32 `DECIDED-AFTER-MINT`, 0 open-trade rows `TRADE-CLOSED` (pre-audit "STEP 6 + FIRST STEP-7 READ") |
| obj 6 | 7 | first overnight 20:00Z→01:00Z: 16 held, 0 closes (control 31), 53 releases all above the stop (min +0.083%), 0 pages (change list "STEP 7 — FIRST OVERNIGHT READ") |
| obj 6 | 8 | Langston CONFIRMED 2026-10-17 01:25Z, all five legs re-derived by him; 15 legacy `book-state-hollow-paper-*` rows resolved citing the change list's line 72 |
| B | 2 | plan r2 (P1-P9), Langston PROCEED with forward-binding conditions (the seed-frame coupling, the `invalidQty` reading convention) |
| B | 4 | three gates, each Langston-approved; C1-C3 instrument folds rode CC-B's `162ae0537` |
| B | 5-6 | CI `39015290902` 4/4 per job; deployed `93dce9cb9` 2026-10-17 07:56:13Z; protected file unchanged. **Epoch, re-read 2026-10-20 22:00Z** (instrument: `module_constants`, `module_name='calibration_epoch'`, `asset_class='xstock_spot'`, read as deploy on staging — `ssh deploy@188.245.193.8 'cd dawntrader && set -a && . ./.env && psql "$DATABASE_URL" -Atc "select asset_class, constant_name, value, updated_at, updated_by from module_constants where module_name='\''calibration_epoch'\'' and asset_class='\''xstock_spot'\'' order by 2"'`): `paper_sim` **7** `2026-10-17 07:55:59.672005+00` `b-xstock-bid-trigger-reland-incb` · `vts` 9 `2026-10-06 15:44:53` `b-price-side-8a-p4c-inc3` (unmoved by B) · `live` 3 `2026-09-11` (unmoved). The boot `[ITEM4][warmup]` line reads the WILDCARD rows — an adjacent object, not this one. |
| B | 7 | first-pass read PASS on all six pre-registered legs (§3c), `9b6c0ce4f` |
| B | 8 | Langston CONFIRMED 2026-10-20 21:17Z, both instruments re-run by him; F1-F8 folded into §3c at `2f2210a50` |
| B | 10 | 2026-10-20, ledger §6b |

## 3c. Increment B (objectives 5 + 8) — Step 7 first-pass read, Step 8 confirmed, and objective 6's S6 first exercise (read 2026-10-20 by CC-C; Step 8 by Langston 2026-10-20 21:17Z)
**Build:** `93dce9cb9` deployed 2026-10-17 07:56:13Z; the Step-4 C1-C3 instrument folds rode CC-B's `162ae0537` (13:03:42Z); the window ran on `7501f4f55` (CC-B, restart 2026-10-18 05:33:29Z — no deploy between it and 10-20 20:00Z; Langston re-derived all three ancestries and the deploy reflog). Plan and pre-registration: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` §4, §0.r2c, §0.s4.
**Window (pre-registered):** the first two full US regular sessions after the deploy plus the overnight between — 2026-10-19 13:30Z → 2026-10-20 20:00Z (1,731,423 `error.log` lines, 84,254,830 `out.log` lines read, streamed; Langston re-ran both instruments and got the same figures). Scripts: `/home/langston/inbox/B-XSTOCK-BID-TRIGGER-RELAND/incb_read2.py` (legs), `incb_read4.py` (episodes, seeds), `incb_read5.py` (seed gaps).
**Stdout coverage — §4's retention constraint was breached:** at read time `out.log` coverage began 2026-10-19 03:52:14, so the 22.3 h of stdout after the restart (10-18 05:33:29Z →) had already rotated away (`out.log` rotates by size, 6-8 times a day). **Consequence measured at zero:** 0 exit-decided paper xStock closes in 10-18 05:33:29 → 10-19 03:52:14 (the same predicate returns 29 / 9 over the longer span; Saturday/Sunday, venue shut). Coverage has since moved on again (earliest retained 10-19 05:15:14 at 21:20Z). Forward, for (4a): its `[VTS_RAIL]` carriers are harvested before rotation — first harvest 2026-10-20 21:16Z, 1,533 `[VTS_RAIL][SWEEP]` lines (10-19 05:15:45 → 10-20 21:16:48) kept at staging `/home/deploy/harvest/incb4a-rail-2026-10-19_20.log`.
| pre-registered leg | measured | verdict |
|---|---|---|
| every armed xStock `EXIT_TRIGGER` shows `basis=bid`; a `basis=mark` line names its reason | 38 trigger lines in the window, all `basis=bid` (they count ticks, not decisions — see below); 0 `basis=mark` | PASS on the bid arm. **The `basis=mark` zero is UNCONTROLLED live** — no mark arm ran in the window. The mark fallback is fence-verified only: `server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` CONTROL *"the same frames with the arm OFF"* asserts `markExit=y`, ` on=mark` and `basis=mark reason=spread_blown_off`; `reason=guard_off` has no fence |
| a stop/target's trigger price is the bid at decision | 38 checked, trigger ≠ bid: 0 | PASS |
| zero xStock exits on a book wider than 1% | 38 exit frames (`XS_FRAME` `bidExit=y`), spread > 1%: 0. **Stronger than the leg as written: no `XS_FRAME` line over 1% exists at all** (10-19 file: 563,824 lines, max spread 0.998%) against pre-ceiling controls of max 31.6% (10-15), 15.7% (10-12), 13.8% (10-16) | PASS — **but it proves the 1% ceiling clamps the frames upstream of the exit evaluator, not the exit hold itself**; the blown books are the 5,205 `spread_blown` SKIP lines. `XS_FRAME` `on=bid` 833,054 / `on=mark` 0 — the `on=mark` zero is uncontrolled (`on=` did not exist before increment B: every 10-13/10-16/10-17 line reads `none`) |
| `[XS_SIZE]` printed on evaluated cycles; tripwire `verdict=clean` near the row rate | 68,991 `[XS_SIZE]` lines; 31 hourly windows, all `clean` (20,596-42,803 looks/h, `sizeUnknown=0`) | PASS (counts, not rates) |
| zero resting fills on a short/unknown side | paper rest-fill size refusals 0 · `x1/x2 Short/Unknown` 0 · `SIZE_INVALID` 0 | PASS — **zero, with the instrument shown live** (68,991 lines) and the regular-session null quantity measured 0 by Langston at Step 4 |
| zero closes refused on `crossed`; entry crossed refusals populated or provably zero | close crossed walks 0 · close side-verdict refusals 0 · entry `crossed=true` refusals 0 | PASS on the close leg; the entry leg is **UNEXERCISED** in this window (no crossed book met an entry attempt) |
| the VTS size counters (COUNTS) | `xsRestSize*` 0, `xsExitFiredSize*` 0, taker entry size refusals 0 | recorded as counts |
**Decisions, reconciled:** the `EXIT_TRIGGER` line repeats every tick while a resting target exit waits (SNPS/USD 2026-10-19 06:36:12 → 06:41:43: one `EXIT_REST_PLACED`, ~190 trigger lines on a quote frozen for 5½ min, filled at its limit on the first new arrival — D1 working), so trigger lines count ticks, not decisions. **In the window: 38 trigger lines → 31 decision episodes = the 31 exit-decided paper xStock closes in the window (24 `stop_hit`, 7 `target_hit`).** Over the longer span 10-19 03:52:14 → 10-20 20:00Z: 38 episodes (29 / 9) = **38 exit-decided closes of the 44 in that span** (6 xStock + 1 crypto `never_filled` excluded — no exit decision happens on an unfilled entry); 38 − 31 = 7 = the 5 stop + 2 target closes between 03:52 and 13:30Z. ⇒ **the TARGET leg of P1 is now exercised** (§4 of the pre-audit stated it had no measured case).
**Langston's seed-frame anchor (§0.s4) — CONFIRMED:** 0 decisions on a seed frame itself (a seeded chain refuses twice before it acts). **8 of the 35 measurable decisions came 3.0 s after their chain re-seeded, none at 0 s** — the minimum (seed → validate → act) — each on a frame IDENTICAL to the seed frame (same mid and spread): CRM, TTWO, PRU, PCAR, HSIC (10-19), GE, JD, LECO (10-20); all spreads < 1% (0.13-0.91%); all released with the bid already below the stop (`bidToStopPct` −0.02 to −0.76). The other 3 of the 38 seeded inside the lost stdout stretch, so their seed is unmeasurable. Five of the eight followed a `spread_blown` hold ending (`SPREAD_BLOWN_SKIPS at=book_not_hollow`: the far side came back inside the ceiling); three (PRU, PCAR, HSIC) followed a shorter non-blown refusal. CRM traced in full: bid 237.27 steady from ≥ 11:18Z while the ask sat at 240 (blown); the ask moved to 238.98 at 11:22:17Z, the chain re-seeded, and the stop (237.4383) fired on that same bid at 11:22:20Z — the mark (238.125) would not have fired. ⇒ **a real stop, released when the book became sane; not a false stop.** These are `#1199`'s population (release with no movement test); here the release followed genuine movement of the far side.
**Objective 6 — S6, FIRST EXERCISE (the pre-registered quantity window):** the measure lives on `closed_trades.metadata.exitRefusal`. **Population: 15 closed rows carry a non-null `spreadBlownFirstStopRefusedBid`** (151 rows carry `exitRefusal` all-time; 57 post-objective-6 rows carry the `spreadBlown*` keys). **The first exercise is SNPS/USD**, closed 2026-10-19 06:41:43Z: first refused bid **400** against a 447.78 stop, held 1.53 h, released 2.61% above the stop, closed `target_hit`. All 15 (closed, first refused bid / stop, hours held, release bid vs stop):
| symbol | closed (UTC) | reason | first refused bid / stop | held h | release |
|---|---|---|---|---|---|
| SNPS | 10-19 06:41 | target | 400 / 447.78 | 1.53 | +2.61% |
| MRNA | 10-19 08:46 | stop | 180 / 213.06 | 0.02 | +0.94% |
| CRM | 10-19 11:22 | stop | 208.01 / 237.44 | 0.24 | −0.07% |
| MCD | 10-19 11:22 | stop | 240.34 / 241.55 | 0.05 | +0.42% |
| TTWO | 10-19 12:18 | stop | 190 / 203.24 | 0.59 | −0.02% |
| TXN | 10-19 14:18 | stop | 245 / 274.81 | 0.25 | +1.99% |
| O | 10-19 16:17 | stop | 55.40 / 55.45 | 0.01 | +1.13% |
| EPAM | 10-19 18:19 | target | 110.04 / 119.10 | 13.60 | +2.57% |
| GE | 10-20 00:39 | stop | 304 / 309.63 | 0.27 | −0.21% |
| JD | 10-20 13:03 | stop | 26.50 / 26.51 | 0.27 | −0.04% |
| WDAY | 10-20 13:46 | target | 160 / 188.80 | 27.86 | +5.05% |
| BRK.B | 10-20 13:47 | target | 490 / 526.48 | 0.02 | +0.48% |
| NTAP | 10-20 13:49 | stop | 199.04 / 204.37 | 17.50 | +0.34% |
| MA | 10-20 13:56 | target | 594 / 609.24 | 5.58 | +1.20% |
| LECO | 10-20 14:00 | stop | 256.97 / 257.03 | 30.54 | −0.76% |
(`spreadBlownStopHeldMs` and `lastReleaseBidToStopPct`; the five seed-frame trades above — CRM, TTWO, GE, JD, LECO — are a subset of these 15, not the S6 population.) **S6 PASS** — both fields populated and the release records the bid against the stop. **What it shows:** the hold refused sales at stub bids as far as 15.5% below the stop (MRNA 180 vs 213.06; WDAY, CRM and TXN 10-15%) and, of the 10 stop-side rows, released 5 with the bid back above the stop, 4 within 0.21% below it, and LECO 0.76% below. **Its cost is a distribution, not one number:** stop-side holds run from seconds to 30.5 h; the two long ones split — **NTAP held 17.5 h and released 0.34% ABOVE its stop** (sold 205.07 against 204.37), **LECO held 30.5 h and released 0.76% below** (closed 255.61, the worst); on the target side WDAY held 27.9 h to a `target_hit`. (The indefinite hold is Kyle's 2026-10-16 decision; this is its first measured cost.)
**Step 8 (Langston, 2026-10-20 21:17Z): CONFIRM on all six legs and the seed-frame anchor; this section folds his F1-F8 corrections into the body.**

## 3d. The windows that ended during the 2026-10-22 → 11-04 pause — read 2026-11-04 by CC-C

**(4a), objective 11 — PASS against its registered baseline — LANGSTON RULED PASS 2026-11-04, re-derived on staging and at the ref (registered reading = INC4A pre-audit `:126`).** Criterion as written in §4, and the INC4A pre-audit's registration: *"P5's counts per day beside A3"* and Langston's reading *"crossings conserved against A3 · joins taking the too_wide/quiet share · pagesAttempted falling · dedupeHits == 0"*. Object: the `[VTS_RAIL][SWEEP]` lines harvested to `/home/deploy/harvest/incb4a-rail-window.log` (2,625 lines); counters are since-start, so each session is a delta, and the one counter reset (a restart at 10-20 21:49Z, after the close) is handled — no mid-session restart, so the restart filter removes nothing.

| session | crossings (A3) | joins | pagesAttempted (A3 attempted) | minted (A3) | dedupeHits (A3 suppressed) | escalations | reasonExits |
|---|---|---|---|---|---|---|---|
| 10-19 | 60 (92) | 50 | **12 (92)** | 12 (64) | 0 (28) | 0 | 2 |
| 10-20 | 83 (103) | 60 | **30 (103)** | 30 (33) | 0 (70) | 0 | 7 |
| 10-21 | 120 (77) | 97 | **39 (77)** | 39 (21) | 0 (56) | 0 | 16 |

- **PREVIOUSLY STATED (this section, `f66a71e2f`, and to Kyle via OLD Claude 11-04): FAIL — pagesAttempted 12 → 30 → 38. NOW: PASS. REASON: I read "falling" as a trend inside the window; the registration reads every count BESIDE A3, and against A3's 92/103/77 page attempts fell on every day (87%, 71%, 49%).** (10-21 was 119/38 before the restart reset was handled; 120/39 now.)
- Crossings stay the same order as A3 (262 vs 272 over three days). Joins are 83%, 72%, 81% of crossings against A3's `too_wide` share of 79%, 70%, 83%.
- **The partition closes exactly:** `crossings = joins + pagesAttempted − reasonExits` — 50+12−2=60, 60+30−7=83, 97+39−16=120. Net fresh pages 10/23/23; 14 of 10-21's members left on a reason change and paged, so that arm is live. `dedupeHits` 0 on 2,625 of 2,625 lines (A3 suppressed 28/70/56); `markMissedRowMarks` 0. **Resolve population (Langston's correction):** the window's 81 minted rows were all resolved by `engine` (81 = 81); 389 is the family minted 10-19 → 11-03. 453 `cli`-resolved rail rows were all created 09-16 → 10-15, and 449 engine-resolved rows 10-16 → 11-03: zero `cli` resolves of a row created after the deploy. `alertFileBytes` per session **51,224 / 97,230 / 187,862 B** — under the 1 MB/day line every day, but roughly doubling, and it is the whole alert file (every writer), so the trend is not attributable to the rail. *(This line read "about 90 KB a day", a three-day mean that hid the shape.)*
- **FAIL arm `no_usable_mark` joins: a FENCE, not a measurement** — structurally unreachable (`server/core/trading/vts-rail.ts:53-57`: `too_wide` → join, `too_old` → join only on a `quiet`/`closed` verdict, else page); the window measured nothing about it and may not be cited for it. **FAIL arm isolated staleness (`too_old` on a ticking or null verdict): an argued bound, NOT a measured zero.** It is reachable and depends on the runtime verdict; the only per-join reason carrier, the standing record's `member_<tradeId>` body, is nulled by the sweep when the member leaves (all 935 member values across 22 records are `null`), and the sweep line counts joins but not joins by reason. What holds: member keys reconcile exactly to joins (50 · 60 · 97), and the code fails toward paging on a null verdict. ⇒ **DISPOSITION: folded into this batch** — a joins-by-reason field on the sweep line goes into increment (4c) below.
- **r4's "joins ≈ attempted while minted stays near A3": NOT TRIGGERED (Langston).** The clause is not well-formed on `minted`: A3's minted is a post-dedupe residual (64=92−28, 33=103−70, 21=77−56), and under per-trade keys minted ≡ pagesAttempted. The comparable column is attempted, which falls every day. **Unexercised, carried to row 2's close (`#661` leg 3):** the 30-minute escalation (0, against a peak of 92 concurrent members at 10-21 13:42:12Z — members clear at the +15-minute flag flip, before the 30-minute clock can fire), `vts-quiet-resolve-stuck` (0 rows ever), and `dedupeHits` itself (never non-zero on this instrument: a tripwire with no positive control). The 10-29 record's `suppressedPages` 68 vs 67 keys is one re-join (no work).
- REVIEWER: object handed (the pre-audit at the ref + the counts) · what readings of the criterion are consistent with the text, and the verdict under each · HIT: "falling" against A3 = PASS, as a within-window trend = FAIL, and line 71's "beside A3" supports the first; `minted`/`escalations` were not given · re-derived y (both now in the table).

**What the remaining pages are — a finding, not the criterion.** 389 rail rows minted 10-19 → 11-03, every one resolved by the rail. **350 were minted 10-13 minutes after the US open** (204 at minute 10) and **297 of those cleared 15-20 minutes after the open**, 50 more by minute 30. Reasons: `too_old` 248 (133 of them members leaving the list), `no_usable_mark` 123, `too_wide` past 30 minutes 9, `implausible_spread` 9. ⇒ VTS trades waiting at the open cross the 10-minute page line at 09:40 ET; the venue's own regular-session flag flips at 09:45 ET (measured: 13:45Z on 10-29/30, 14:45Z on 11-02/03); the books turn usable and the pages clear themselves minutes later. **Mechanism cited, NOT RE-READ:** the paging clock starts at the engine's 09:30 regular session (`vts-runner.ts`, `_ntXsOffHours` / `getXstockSession`), 15 minutes before the venue's flag. My earlier "thin stocks judged against the class" hypothesis is withdrawn — the pattern is the opening bell. ⇒ **DISPOSITION: folded into this batch** — `HOME: B-XSTOCK-BID-TRIGGER-RELAND increment (4c), owner CC-C, placed in SPRINT_TO_LIVE_PLAN row 2 after increment (4b)'s Step 7 and before row 2.3 B-SPREAD-BLOWN-RELEASE-MOVEMENT`. (4c) carries two items: the open-bell phase (read first as a threshold/phase question against the venue's regular-session flag, not as a defect — Langston) and the joins-by-reason field above. Step 2 goes to Langston before any code.

**Increment C, the EST reads — PASS on all three legs.** Criterion as written (INCC pre-audit, pre-registered line): each spike at the ET-anchored time; a spike at the UTC-anchored time = FAIL. ⚠️ **Instrument changed, stated:** the named script reads `[XS_FRAME]` lines, and since objective 6 a book wider than 1% is held out of those frames, so it can no longer see a spike. The read used `xstock_spot_ticker_snap`, per minute, share of books wider than 1%.
- **(ii) weekday 16:15, 11-02:** 76.8% wide at 21:15Z against 0.1% at 20:15Z; the pause started 21:14:00Z. ET-anchored.
- **(iii) 20:15, Monday evening, 11-03:** 75.6% wide at 01:15Z against an 18.9% baseline at 00:15Z. ET-anchored.
- **(i) Sunday reopen, 11-01 (20:00 EST = 01:00Z 11-02):** pause START `window=sun_reopen` 01:00:37Z, END 01:35:37Z; the venue's burst came at 01:15Z (2,968 rows, 77% wide), inside the pause. ET-anchored. A one-minute blip at 00:14:47Z (467 symbols, one row each inside 60 ms, prices identical to Saturday's last quotes, e.g. AAPL 339.12/349.71) is the recorder re-sending on reconnect, not a venue event; the app was in its weekend close.

**Increment A — no EST read was ever pre-registered.** The header and §4 of this report said "increments A and C's EST reads"; only C's exists (INCC pre-audit). A's one clock-dependent input is the feed's `is_extended_hours` flag behind the entry yardstick, and it is the venue's flag, not our clock. **Informational only, not a criterion:** it moved with the clock — first regular-session row 13:45Z on 10-29 and 10-30, 14:45Z on 11-02 and 11-03; last 20:15Z (10-29) → 21:15Z (11-02, 11-03). 17 off-schedule `false` rows were seen (13 at 10-30 21:50Z, 4 on 11-04 morning around the restart), at most one row per symbol in the yardstick's window.

**Objective 6, the observation read (Kyle 2026-10-16: "turn it on and then review and observe") — what the stop-hold did.** Population: xStock closed trades since the 10-16 deploy whose `exitRefusal` carries `spreadBlownFirstStopRefusedBid` — **81 of 297** xStock closes, 76 symbols. `NOT RE-READ`.
- **How it ended:** 60 at the stop, **21 at the target** — the book came back far enough to reach the target after the stop had been crossed.
- **How long it held:** median 5.6 h; under 1 h: 31 · 1-6 h: 10 · 6-24 h: 17 · 1-3 days: 15 · over 3 days: 8. Longest: PPL 212 h (ended at the target), CARR 162 h (stop), INCY 149 h (target), PGR 138 h (target), COR 116 h (stop).
- **What it refused:** the first bid it would not sell at sat a median 2.5% below the stop (worst 99.6% — a near-zero stub bid).
- **What it released on:** 50 of 81 with the bid at or above the stop, 31 below it (worst −3.63%, CARR). Average exit 1.59% above the recorded stop.
- ⇒ This is the input `#1199` (`B-SPREAD-BLOWN-RELEASE-MOVEMENT`, sprint row 2.3) waits on: 31 releases below the stop are the cases a movement test would have held longer. **Recorded here; `#1199` may now be scoped when it is reached in the queue.** No time limit, by Kyle's 10-09 answer.

**C-P5, the pause-retirement read — EXTENDED.** Two-week window (out-of-hours log files 10-20 → 11-02): 7 distinct stop-side episodes (10 lines) and 2 target lines, under the 10 the rule needs ⇒ the pre-registered extension to four weeks (content to 11-16; the harvest cron covers through 11-17 and goes inert 11-18 02Z). Four-week rule unchanged: ≤4 → propose retirement, 5-9 → keep, ≥10 → rate. A13: blown books leave the path before the pause, so the population it would have caught moved upstream to objective 6.

## 3e. Increment (4b) — Step 7 first-pass read (2026-11-04 US regular session, read by CC-C)

**Criterion as written** (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4B_PRE_AUDIT.md`, "Step 7 (pre-registered here)"): *"behaviour-preserving, so the read is that nothing moved. Over the first full regular session after deploy: every xStock `EXIT_TRIGGER` still reads `basis=bid` while armed; the T2/T3 refusal counts keep their pre-deploy shape; the decision counts per lane are within that session's normal range (a count comparison, not a rate)."* Deployed `e1becf801` 2026-11-04 12:13Z; the session is 14:30-21:00Z. Baseline: the 2026-11-03 session, `/home/deploy/harvest/inc4b_baseline_1103_touch.log`.
**Population and instrument:** `[8a-P3][VTS_TOUCH]` (T2, VTS real) and `[VTS_SHADOW_TOUCH]` (T3, VTS shadow) lines from the size-rotated `out__2026-11-04_*.log` files plus `out.log`, filtered to 14:30-21:00Z, copied to `/tmp/ccc_touch_1104.log` on staging (375 lines per lane against 390 on 11-03; the 15 missing lines reconcile against FOUR in-window boots: 15:47:01Z, 18:16:29Z, 19:35:54Z and 20:46:58Z, per Langston; my first census named three). ⚠️ **These counters reset after every line** (`resetVtsExitCounters`, `vts-runner.ts:4228` and `:4832`), so a session total is the SUM of the lines, not a difference; my first pass treated them as since-start counters and was discarded. A restart only loses the cycles while the process is down. **Build set (Langston Step 8):** the window spans at least three builds of the exit lane. `208e824a6` (live at the 15:47:01Z boot) and `b8685a453` (B-CRYPTO-FEED-WATCHDOG, `#1232`) both modify `active-execution-engine.ts` inside the window. Their change is witness-vouch and `exitTickerCapturedAt`/`exitTickerAgeBasis` only: crypto-gated, downstream of the exit decision, and an unvouched arm lets the close proceed. So they cannot reach the three measured quantities. The later 19:36Z and 20:47Z builds change the xStock archive writer and the disk-tiering scripts, not the exit lane.

| check | 11-03 (baseline) | 11-04 (after (4b)) | verdict |
|---|---|---|---|
| xStock `EXIT_TRIGGER` lines in session, `basis=` | not harvested | **19 of 19 `basis=bid`**, 0 other | met (positive control: 19 lines exist) |
| T2 VTS real, xStock: exit looks / no transactable side | 86,572 / 1,800 (2.08%) | 92,754 / 2,163 (2.33%) | shape kept |
| T3 VTS shadow, xStock: exit looks / no transactable side | 46,384 / 931 (2.01%) | 53,634 / 987 (1.84%) | shape kept |
| closes in session — paper xStock | 21 | 18 | in range |
| closes in session — VTS xStock | 506 | 455 | in range |
| closes in session — VTS crypto | 121 | 131 | in range |

- **Crypto looks moved, and not because of (4b) — measured at the deploy boundary (Langston Step 8, replacing my timing argument).** On the OLD build, in the 53 lines from 11:20:50Z to 12:13:26Z, shadow crypto `exitNoTransactableSide` was 324 (6.1 per line) against 865 over 375 lines in session (2.3 per line), and shadow crypto looks were 380 per line before the deploy against 418 in session (+10%). The crypto quantities were already there before (4b) went live, so no shard attribution is needed. Hourly shadow crypto no-side (Langston): 11Z 216 · 12Z 360 · 13Z 36 · 14Z 72 · 15Z 36 · 16Z 1 · 17Z 144 · 18Z 73 · 19Z 211 · 20Z 400 · 21Z 115. **PREVIOUSLY STATED: "went from 0 to 865 and grew through the day". NOW: it was 324 in 53 lines before the deploy and does not rise steadily. REASON: I described a two-day total as a within-day trend.** `exitLooks` is an invocation count (positions × cadence), not a decision count; check 3's subject is the closes.
- **The shadow lane's new reason** is carried into `lastRefusal` and the unpriced-close path (`vts-runner.ts`, P2 of the plan), not into the touch line, so it is not a count in this table.
- **What check 1 reaches (Langston):** `EXIT_TRIGGER` is emitted only at five sites in `active-execution-engine.ts` (`:4042 :4049 :4068 :4075 :4082`), the paper lane T1; `vts-runner.ts` emits none. So 19/19 is sufficient for check 1 as written (a universal over the session, with 0 lines lacking `basis=`), but it says nothing about T2/T3: their basis is evidenced by inspection and the fence test only (recorded in §5). Every non-`bid` arm (`armOff→mark`, `class_mark`, `class_unbranched`) also never fired. 19 lines: stop_hit 11, target_hit 8, 14 symbols.
- ⇒ **(4b) Step 7: PASS on all three pre-registered checks. Step 8: Langston CONFIRMED 2026-11-04 ~22:07Z, re-deriving every number from the rotated `out__` logs himself.**
- **Added to increment (4c) (Langston, §13 disposition 2):** the `:4082` `moonbag_timeout` exit carries no `_xsTag`, so it prints no `basis=`; such an exit would read as "no exception" rather than "not observed". HOME: increment (4c), owner CC-C, with the opening-bell and joins-by-reason work, before row 2.3.

## 3f. Increment (4c) — the opening settle, the join split, the moonbag basis line (Steps 1-6, 2026-11-05)

- **Plan:** `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4C_PRE_AUDIT.md` r1 → r3; Langston CHANGES at r1 (the read could not fail as written; a second site of the session predicate) and r2 (`isRegularSession` has a third consumer, the unpriced-close label), PROCEED at r3 (`5117c73d6`).
- **Code:** `564ae590c` (Step 4 PROCEED, two in-commit conditions); reverted out at `044de7888` while unreviewed code of OLD Claude's shared the branch; re-landed as an exact revert-of-revert `da3415b3b` (six of seven blobs equal `564ae590c`; `vts-runner.ts` differs only by OLD Claude's later correlation commit) + the conditions `e29be33fe` (`joinsTooOld`, `joinsOther` held at 0 by a test). `#392` names `isXstockRailPagingTime` as the second read-site for the session bounds.
- **Deployed:** `0abfd710241aefde87725f02d99515747ec3efa9` 2026-11-05 09:17:49Z by CC-C (dt-deploy OK, restart 676; CI `42000659230` 4/4; rollback `c0214c973`). The built code contains the predicate, the new counters and the moonbag line; the first sweep line after the restart prints `joinsTooWide=0 joinsTooOld=0 joinsOther=0`.
- **Step 7:** the five complete US regular sessions from 2026-11-05, read against §3 r2 of the plan (crossing pages in [25,45) after the open: PASS ≤ 10 over five and ≤ 5 per session; FAIL ≥ 15 in a session or ≥ 40 over five; the doorbell family's own FAIL bar), cut at the deploy boundary — so the published 19 of 19 `basis=bid` (§3e) is a pre-deploy figure and the moonbag line joins the `mark=` population only from here (Langston's record item).

- **Step 7 RESULT (CC-C, read 2026-11-13 ~18:20Z, staging) — PASS on the pre-registered §3 r2 criteria.** Window: the five complete US regular sessions 2026-11-05, 11-06, 11-09, 11-10, 11-11 (deploy 11-05 09:17:49Z, before the 14:30Z open; every later build descends from `0abfd7102`). Object: `/var/log/dawntrader/system-alerts.jsonl`, the WHOLE file, rows merged by `id`, keys `no-trigger-vts-*` whose trade id carries `xstock` (positive control: 452 such rows all-time, the baseline's 374 among them), binned by minutes after 14:30Z (EST). **The unit is the alert ROW, as in the baseline: each page is two rows when the trade has a maker/taker twin** (e.g. 11-06 14:56:57Z, keys `…lhyuixj` and `…lhyuixj_twin`).

  | session | crossing rows [0,25) | crossing rows [25,45) | doorbell rows [0,15) / [15,45) | member-clock rows [30,45) / ≥45 |
  |---|---|---|---|---|
  | 11-05 | 0 | **2** (STRK + twin, min 36.9) | 0 / 0 | 0 / 0 |
  | 11-06 | 0 | **2** (STRK + twin, min 27.0) | 0 / 1 (VIA, min 37.0) | 0 / 0 |
  | 11-09 | 0 | 0 | 0 / 2 (STRK + twin, min 27.7) | 0 / 1 (VIA "30 min", min 45.7) |
  | 11-10 | 0 | 0 | 0 / 0 | 0 / 0 |
  | 11-11 | 0 | 0 | 0 / 0 | 0 / 0 |
  | **total** | **0** | **4** | **0 / 3** | **0 / 1** |

  - **Deployment check:** zero crossing rows in [0,25) and zero doorbell or member-clock rows in [0,15) — met; the earliest xStock page in the window is minute 27.0.
  - **PASS:** crossing rows in [25,45) = **4 over five (≤ 10) and at most 2 in any session (≤ 5)**; the one member-clock row landed at minute 45.7, none in [30,45). **FAIL not met** (≥ 15 in a session or ≥ 40 over five).
  - **Named prediction:** about 0.67 crossing pages per session at the open, on slow sessions. Observed in the [25,45) band: 2 page events (4 rows) over five sessions, both STRK, the trade already standing in the record — consistent with "pages only for trades still undecided 10 min after the venue's regular book opens".
  - **Doorbell family (FAIL only, ≥ 10 per session on average):** 3 rows over five = 0.6 per session — not met. Non-expected reasons still page (VIA `too_old` 11-06, STRK 11-09), so that family did not go silent; whether every reason class that paged in the baseline still pages is not separately tested — stated, not claimed.
  - **P2 join split (reported), from `[VTS_RAIL][SWEEP]` in `out__*`, first-to-last line inside 14:30–21:00Z:** 11-09 joins 5 = tooWide 5; 11-10 9 = 9; 11-12 7 = 7; 11-13 (to 18:05Z) 4 = 4; `joinsTooOld` 0, `joinsOther` 0 and `dedupeHits` 0 in every one. **11-05 and 11-06 are UNMEASURED** (their `out__` files have rotated away; the cp5 harvest keeps `VENUE_PAUSE`/`XS_FRAME` only); **11-11 is UNMEASURED** (the cumulative counters reset inside the session, a process restart).
  - **Moonbag basis line (reported):** `type=moonbag_timeout` lines = **0, NOT OBSERVED** over the retained `out__` files 11-09 → 11-13, against **185** `EXIT_TRIGGER` lines in the same files (71 `stop_hit`, 114 `target_hit`; positive control for the instrument). 11-05 → 11-08 unmeasured (rotated). P3's line format is therefore fence-verified only.
  - **Outside the binned bands (Langston, Step 8):** 11-10 carries a crossing pair at minute 49.98 (POOL/USD + twin, 15:19:59Z); the table's columns are correct, 11-10 is not an empty session.
  - **Family rule, corrected (Langston, Step 8):** (4c) rewrote the member-clock body to "30 minutes of US regular-session **paging** time (counted from 09:45 ET at the open, row 2 increment (4c))", so the body phrase "minutes of US regular-session time" matches only the baseline rows and returns a FALSE ZERO after the deploy. Classify member-clock rows by the title "30 min with no decision" or the new phrase.
  - ⭐ **Live proof the predicate runs in production (Langston, Step 8):** the 11-09 VIA member-clock row landed at minute **45.70**, where the 10 baseline member-clock rows sat at 30.2-31.4 — exactly 15 minutes later — and its body names the 09:45 ET start. The deployment check above is empty by construction; this row is not.
  - **Two controls Langston added, re-derived by him:** (1) population — xStock VTS trades open at 14:30Z were 486 / 388 / 323 / 581 / 689 in the window against 177-272 per baseline session, so the drop from ~29 opening crossing pages a session to 0.4 is not a thinner denominator; (2) 11-11's all-zero session is not blindness — its sweep line moves `crossings` 2 → 8 and `joinsTooWide` 0 → 6 between 14:44:08Z and 15:01:08Z, crossings that joined the standing record instead of paging (lane not separated by the sweep line, so "xStock" there is a hypothesis). Window integrity: 8 deploys 11-05 09:17Z → 11-11 close, all descend from `0abfd7102` and carry `isXstockRailPagingTime`; the one in-band redeploy (`0f4835b5a`, 11-05 14:39:36Z) precedes the 14:45 paging start.
  - **Carried unproven — nobody cites this window against them:** P3's moonbag format (fence only); the `joinsTooOld` and `joinsOther` arms of the P2 split (0 in every sweep read, unexercised live); the 11-05/11-06/11-11 join splits.
  - `NOT RE-READ` by a second reader before Langston. **Step 8 PROCEED (Langston, 2026-11-13, Discord `1570869935633080401`), every number re-derived by him.**
  - **(4c): STEP: 8 of 11 COMPLETE (PROCEED) · NEXT STEP: 10 of 11** — no objective failed, so Step 9 has nothing to iterate. The batch stays open on C-P5 (read 2026-11-16).

- **(4c) STEP 10 — governance ledger (CC-C, 2026-11-13; copied from the governance commit):**

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Row 2 status and OPEN ON: (4c) deployed, Step 7 PASS, Step 8 PROCEED, Step 10. |
| T1 | `PHASE_HISTORY.md` | ✅ | Dated 2026-11-13 line: the opening alerts wait until 09:45 ET; batch still open on C-P5. |
| T1 | `SPRINT_TO_LIVE_PLAN.md` (row 2) | ✅ | Both row-2 cells move (4c) from "Step 7 = five sessions" / "Step 2 r2" to done through Step 10. |
| T1 | `PHASE_19_PLAN.md` | N/A — no row there | Row 2 has no row of its own there. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ mine / N/A shared | Own file: (4c) at Step 10; no new consensus truth. |
| T1 | the batch `SCOPE` | N/A | No scope change; (4c) is placed in the existing row-2 scope. |
| T1 | the batch `PRE_AUDIT` | ✅ | `B_XSTOCK_BID_TRIGGER_RELAND_INC4C_PRE_AUDIT.md` r3 (Step 2); §3 r2 is the read's criterion. |
| T1 | `COMPLETION_REPORT` | ✅ | This progress report §3f: Step 7 result, Step 8 folds, this ledger; the batch converts at its close. |
| T1 | the `Observation` column | ✅ | The card stays in Observation, now blocked only on C-P5 (2026-11-16). |
| T1 | the four session task lists | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` row 2: (4c) done through Step 10; next C-P5. |
| T1 | Langston's `MEMORY.md` | ✅ | Row 2 line: (4c) added to his closed increments, a deploy sha dropped; his `MEMORY.md` 74,215 → 74,208 B, loaded set 143,753 B vs ceiling 143,856. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | The who-is-told section: the rail pages only from 09:45 ET, why, what stays labelled `regular`, and the measured effect. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | The rail entry: the new upstream `isXstockRailPagingTime`, its two readers, the join split, the moonbag line, the change-check. |
| T2 | `RUNNING_ISSUES.md` | N/A | No issue opened or closed; `#392` already names (4c)'s second read-site. |
| T2 | `CHANGES_AND_FIXES.md` | N/A | Alerting timing, not a bug or risk entry. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | Alerting only: no trade, price or decision changes, so no epoch boundary. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional rule touched. |
| T2 | `STORAGE_POLICY.md` | N/A | No table or retention change. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Working-list review note: no item A–F change, no epoch boundary. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No onboarding learning surfaced. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | The method did not change. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | The reviewer's build did not change. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No `CLAUDE.md` rule changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | Nothing removed. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No `MISTAKE:` trailer in (4c); the member-clock classifier slip Langston caught is recorded in §3f as a corrected family rule. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Row 2's declared-`open` row amended in place: (4c) struck from "still owed", state stays `open`. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | No new alert class or process. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Unchanged. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | Not this batch's. |

  **(4c): STEP 10 of 11 COMPLETE · NEXT: the batch's own Step 11 waits on C-P5 (2026-11-16); (4c) needs no separate close.**

## 3g. C-P5, the four-week pause-retirement read — read 2026-11-16 by CC-C (alert `f6131ab0`)

**Criterion as written** (INC4B pre-audit P7, r5/r6, Langston conditions G-J): *"The four-week read (content 2026-10-19 00:00Z → 2026-11-16 00:00Z exclusive = 20 weekdays …): ≥ 10 runs the rate; 5-9 keeps the pause … ≤ 4 proposes RETIREMENT on mechanism."* The rate (INCC pre-audit C-P5): *"for each `wouldFire` event compare the bid at suppression with the bid 15-25 min later. Retire the pause if the share of would-be fills below both the pre-window bid and the +25-min bid is no higher inside the windows than outside them (the outside share read the same way from `XS_FRAME`). Retirement is a reviewed commit."*

**Carrier and control.** `/home/deploy/harvest/cp5/error__2026-10-20 … error__2026-11-16` (file D holds UTC day D−1, checked: `error__2026-10-20` runs 10-19 00:00:45Z → 10-20 00:00:01Z). Ledger `cp5.log` has a line for every day; no anomalously low `file_lines` on a weekday. **Positive control, all 20 weekday files:** bracketed `][VENUE_PAUSE] ` lines 19-41 per weekday (never 0); 0 on every Saturday and Sunday file (venue shut). Method check: the same per-day count reproduces the two-week read exactly (10-20 → 11-02: 10 stop lines, 7 episodes).

**Numerator, by arm (episode = position + window + day):**
| arm | lines | episodes |
|---|---|---|
| **stop** (decides) | **19** | **14** |
| target (beside it) | 6 | 6 |
| all bracketed pause lines (the pause's own cost, condition J) | 548 | 514 |

⇒ **14 ≥ 10: the rate runs and decides** (19 lines, also ≥ 10 — the unit does not change the band).

**The rate.** Inside: each of the 14 episodes, bid at the first stop would-fire, against the bid at pause start (`bidAtStart` on the position's `[VENUE_PAUSE_RESUMED]` line; the bid snapshot at the same lead gives the same verdict on all 14, though the values differ on DELL, ARKK and LLY) and the median bid 15-25 min later (`xstock_spot_ticker_snap`). Outside: the first `exitReason=stop_hit` `XS_FRAME` with `bidExit=y` per position, outside every pause window ±5 min (windows from resumes of ≤ 40 min; 17 excluded as near a window), 297 positions; "pre" = the snapshot bid 361 s earlier (the upper of the inside episodes' two middle leads; the true median of the 14 is 357 s; range 42-1,030 s). 16 of the 297 outside rows have no pre snapshot and drop out; inside takes its pre from the log, so it never drops a row (5.4%, direction unknown).
| | n (both bids present) | would-be fill below both | share |
|---|---|---|---|
| **inside** | 14 | **5** | **35.7%** |
| **outside** | 280 | **127** | **45.4%** |
Using the single +25-min snapshot instead of the 15-25 median: inside 5/14, outside **122/278 (43.9%)** — 19 outside rows lack a +25 snapshot. *(This line first read 122/280 = 43.6%, reusing the median column's denominator — corrected on Langston's re-derivation.)*

⇒ **The inside share is NOT higher than the outside share. By the pre-registered rule, C-P5 says RETIRE the pause** — proposed to Langston as a reviewed commit, never a silent default.
**What the pause did to those 14 positions** (informational, not the criterion): the bid at resume against the bid at suppression moved **−0.58% on average**; 9 worse (CRWD −2.81%, SNAP −2.63%, ARM −1.74%), 4 better (best +0.41%), 1 flat. The pause delayed sales that then happened lower more often than it rescued them. **Its cost (condition J):** 514 episodes in 20 weekdays where a held position was denied any decision for ~21 min, and 6 target would-fires blocked — against 5 stop dips it plausibly protected.

**Forward dependency (condition I), carried into the retirement commit:** with the pause gone, objective 6's absolute `spread_blown` hold is the only upstream protection against blown-handoff stops. The retirement commit records this at `RUNNING_ISSUES` `#943` and the System Manual §3.5.1, so a later loosening of `ri_abs_spread_ceiling_pct` or a change to the yield arm re-opens the pause question.

**Records:** per-event rows `scripts/analysis/cp5_four_week_rows.csv` (311 rows, saved because the snapshot table keeps 30 days and 10-19 ages out ~11-18); query `scripts/analysis/cp5_four_week_read.sql`. `NOT RE-READ` — the rate and the outside population definition (lead 361 s, ±5 min exclusion) go to Langston as they stand.
**Langston's ruling (2026-11-16, Discord `1571711573180027016`): YES, the read as run says RETIRE — scoped.** He re-derived every number from the carrier and the rows (nothing ruled on reported fact) and attacked the outside definition four ways; it held: matched to the windows' own UTC hours 12/24 = 50.0%; matched to the inside symbols 8/19 = 42.1%; positions that appear in both groups removed 126/278 = 45.3%; lead length shows no monotone effect and pre source flips zero verdicts. The two populations are disjoint by construction: both of objective 6's hollow arms `continue` upstream of the pause block. **The rate is thin:** the flip point is 7/14, and P(X ≤ 5 | n = 14, p = .454) = 0.33. So the verdict stands on three legs (the rate, the mechanism, the cost), and the commit must not read as proving the pause never protected anything.
**Scope of the retirement (his change-needed):** C-P5 measured ONE of the five uses of the pause predicate. **Retire only the exit suppression (C-P2) at the 16:15 and 20:15 windows.** The entry refusal (C-P3), the VTS lane, the Sunday stall-watchdog suppression in the equity archiver, and the predicate itself all stay. Window census, episodes: 342 × 16:15, 144 × 20:15, 28 × `sun_reopen`; stop arm `sun_reopen` 0 of 14 — that window is in the ≤ 4 band, so it is a retirement on mechanism to be argued separately or left standing, not covered by this rate.
**Conditions on the removal commit:** (1) exit arm only at 16:15/20:15; the predicate survives. (2) Delete, don't stub: `DELETED_COMPONENTS_LOG` + `_archive`, and sweep the five `[EVAL_EXIT]` fields, the since-start counters, the cleanup site, and the source-string assertion in the increment-C test (the predicate's own unit tests stay). (3) Condition I's forward dependency also goes where `ri_abs_spread_ceiling_pct` is set, not only `#943` + SM §3.5.1. (4) Carrier: the derived extract of all 548 pause lines is committed (`scripts/analysis/cp5_four_week_pause_lines.csv`); the raw 28 files / 66 MB stay uncommitted and are sweepable.
**Record correction:** P7's note "10-20's 83 = 34 + 31 + 18" labels the wrong day (Langston).
DISPOSITION: folded into this batch — the scoped removal plan goes to Langston as its own dispatch, then the diff at Step 4, then row 2's Step 11.

## 3h. C-P5 retirement - Step 7 first-pass read (Mon 2026-11-16 US session; read 2026-11-20 by CC-C, delayed by the 11-16 -> 11-19 usage stop; alert `3c04dd63`)
**Population:** the one process that ran the whole session (pid 1153725, up since 2026-11-16T06:08:10.932Z, build `8fac86e5e`, deploy record `restart_time=708`; no deploy since). Logs: `out__2026-11-16_15-54-55`, `out__2026-11-17_00-00-00`, `out__2026-11-17_10-42-26`, `error__2026-11-17_00-00-00`, `error__2026-11-18_00-00-00`. Windows: 16:15 ET = 21:14-21:34Z 11-16 (W16); 20:15 ET = 01:14-01:34Z 11-17 (W20).
| criterion (alert `3c04dd63`, plan P7) | W16 | W20 | verdict |
|---|---|---|---|
| no `[VENUE_PAUSE]` lines | 0 | 0 | PASS. **Positive control:** the same search returns 3 lines on 11-16 before the 03:39Z retirement deploy (e.g. 01:17:17Z APP/USD, 01:32:03Z PANW/USD, `window=sun_reopen`), so the instrument can see the line. |
| `[XS_FRAME]` continues through the windows | 2,937 | 1,052 | PASS (224,692 over 14:00-20:59Z). |
| `[ENTRY_GATE] venue_transition_pause` still appears | 12 | 0 | PASS on W16: 12 `[ENTRY_GATE]` lines at 12 distinct times (21:16:02 -> 21:21:20). *(Corrected at Step 8: this cell first read 48, which is the same 12 refusals echoed at four sites - `[ENTRY_GATE]`, `[DEPTH_GATE_BLOCK:paper]`, `[RTB-Promotion:paper]`, `[OPEN_FAILED]`.)* W20's zero is no-opportunity: W20 holds 0 `RTB-Promotion`, 0 `DEPTH_GATE`, 0 `ENTRY_GATE` and 0 `OPEN_FAILED` lines over 335,841 lines in both streams, so no paper entry was attempted. *(Corrected at Step 8: the control first cited, "2 on 11-18", was one VTS refusal logged twice, not the paper entry arm.)* |
| `[VTS_VENUE_PAUSE]` still appears | 1 | 1 | PASS. |
**Exits decided inside a window (report any): one.** xStock paper closes 14:30Z 11-16 -> 02:00Z 11-17 = 32 (`dt-sql`, `closed_trades`, xstock_spot, paper); inside a window = 1: **GIS/USD, position `06b3d5aa-95c6-41d2-a318-244e9350bc16`, closed 21:16:01.385Z (W16), entry 35.65, exit 35.00, `stop_hit`, stop 35.2054.** Log sequence: to 21:15:01 the book was tight (bid 35.24 / ask 35.25, spread 0.028%, frame=ok, no fire); at 21:15:03 the handoff blew it (bid 34.32 / ask 36.00) and `spread_blown` held the exit (`SPREAD_BLOWN_SKIPS` 38 suppressed ticks, spread 2.26%-4.78%); at 21:16:01 the book was under the 1% ceiling (bid 35.00 / ask 35.24, spread 0.683%) and the stop released at the bid (`EXIT_RELEASED bidToStopPct=-0.583`). **This is the forward dependency named in the pre-audit (A6) doing exactly its job:** with the C-P2 pause gone, the blown book was held by `spread_blown` and the exit waited for a transactable book. **What the retired pause would have done (Langston, Step 8, read on staging):** GIS/USD bid was flat 35.00 from 21:16 to 21:29 and 35.02 from 21:30, but every ticker snapshot from 21:16:02 to 21:35 carries a spread of at least 1.656% (21:19-21:20 2.06-2.29%, 21:22-21:29 1.714%, 21:30+ 1.656%), above the 1% ceiling; the 21:16:00 minute is the only sub-1% moment in the half hour (min 0.686%). Released at 21:34Z, the exit would have gone straight to `spread_blown` and been held further. **The retirement closed the position at the single transactable instant in the window.** **Step 7: PASS on all four criteria; the one in-window exit is reported above.** `[8c]`/crypto are not in this population.
- **Criterion 1 is a deploy-identity check, not a behaviour measurement (Langston).** `][VENUE_PAUSE]` is absent from the non-test tree at `8fac86e5e`, so that zero cannot fail on this build; it shows the running process carries the removal, which the reflog proves more directly. The behavioural evidence is the GIS exit and the live predicate: `[VTS_VENUE_PAUSE] START window=16:15@2026-11-16T21` and `window=20:15@2026-11-17T01` show the predicate live under exactly the two retired window keys while the exit arm emitted nothing.
- **STEP 8: CONFIRMED** (Langston, Discord `1573141069716262923`, every cell re-derived on staging and at the ref). Population enumerated from the staging reflog: two HEAD movements 11-16 -> 11-20 (`8fac86e5e` 03:38:34Z, re-reset 06:07:56Z; `ecbdf882e` 11-20 00:03:21Z), `restart_time` 708 -> 709. `[VENUE_PAUSE]` is 0 across the whole 11-17, 11-18 and 11-19 day files. The four retained uses are present at `8fac86e5e` (`market-hours.ts:188/193/199`, `active-execution-engine.ts:608-610`, `vts-runner.ts:134/142/5161`, `equity-spot-archiver.ts:573`); the four removed `[EVAL_EXIT]` fields are gone. **One line RULED ON REPORTED FACT:** that the exit arm's `sun_reopen` case went with the 16:15/20:15 arms rests on `DELETED_COMPONENTS_LOG:1678` citing Langston `1571717549157130291`; `langston-recall` refused (degraded corpus), so he neither confirmed nor contested it. REVIEWER record: Langston, object handed, Step 8, CONFIRMED with two corrections, re-derived y.
- **The `sun_reopen` leg closes NARROWED, not PASSED (Langston, Discord `1573145946089455727`).** Step 7 read the 16:15 and 20:15 windows only; no Sunday reopen has occurred since the 03:39Z deploy (the next is 2026-11-23 ~01:00Z), and the claim that the exit arm's `sun_reopen` case was retired with the other two rests on `DELETED_COMPONENTS_LOG:1678` (RULED ON REPORTED FACT). What is established for it: the exit block is absent from the deployed tree for every window, including `sun_reopen`. What is not: any live `sun_reopen` exit decision since the retirement. **Owed:** read the first post-retirement Sunday reopen (2026-11-23, about 01:00-01:35Z) for no `[VENUE_PAUSE]` line and any exit decided inside it, before row 2's Step 11.

## 3i. C-P5 retirement — narrowed `sun_reopen` live read (Sun 2026-11-23 01:00-01:35Z; alert `a9351617`)

**Population and carriers:** the exact first post-retirement Sunday-reopen window, `[2026-11-23T01:00:00Z, 2026-11-23T01:35:00Z)`, on staging build `c21c1502a` (which contains the retirement `8fac86e5e`). Both process streams were read: the exit-path carriers are in `error.log`; the same window in stdout was also checked. The database close read used `closed_trades`, `asset_class='xstock_spot'`, `mode='paper'`, and the same half-open window.

| owed leg | measured | verdict |
|---|---|---|
| no paper-exit `[VENUE_PAUSE]` line | **0** across both streams | PASS. The deployed tree contains no such paper-exit carrier; this is the expected live identity of the retirement. |
| normal xStock decision frames continue | **186 `[XS_FRAME]` lines** | PASS. Positive live control: frames begin at 01:15:30Z and continue through the reopened venue. |
| retained VTS pause still works | **15 `[VTS_VENUE_PAUSE]` lines**, including `START window=sun_reopen` at 01:00:41Z and RBLX open refusals at 01:09:47Z / 01:13:16Z | PASS. The retirement stayed scoped to paper exits; the VTS consumer and predicate remain live. |
| report every paper xStock exit inside the window | **0** | PASS with a database control: **21** paper xStock closes on the same UTC day, so the close read can find rows; none landed inside the registered window. |

**Verdict:** PASS on the narrowed live leg. The paper exit suppression remained absent through the first Sunday reopen, the normal decision stream remained live, the separately retained VTS pause remained live, and there was no in-window paper exit to enumerate. This discharges the `sun_reopen` evidence gap before row 2 Step 11; it does not close row 2's three folded delivery items.

## 3j. Same-day xStock alert reconciliation (2026-11-23)

- **Stale active-fill row `322a736b`: working refusal during the Sunday-reopen transition, not a regular-session feed failure.** It minted at 01:09:47Z inside the registered `sun_reopen` window, when the retained VTS pause was live. The later regular-session control for RBLX/USD (14:45-21:00Z) holds **4,925 snapshots, 4.57 s average gap, 11.00 s maximum gap, and 0 gaps over the 15 s entry ceiling**; there were **0 active RBLX/USD positions** at the read. Disposition: resolve, never ack, to re-arm the class-wide key; the flat off-hours freshness question remains in `#994` / row 3b.f-c.
- **Equity-feed stall row `a446f715`: the forced reconnect worked.** There is **one** `[B74][equity-spot][STALL]` line on 2026-11-23, at 04:31:40Z, explicitly `inLiquid=false`; the socket reconnected one second later, and the next minute reported 857 persisted rows across 142 updated symbols. No later stall line exists that day; the 19:11Z regular-session control reported 5,189 persisted rows across 466 updated symbols with data age 1 ms. Disposition: resolve, never ack, to re-arm the class-wide watchdog key.
- **Shadow-lane unpriced-close row `9798d24f`: expected standing record, not a page.** Its metadata records exactly two xStock shadow trades, RKT/USD and VZ/USD, both closed `timeout_unpriced` at the max-hold valve. That is objective 12's intended operator-visible running count (`vts-shadow-unpriced-xstock_spot`), so the row remains active and unacknowledged for future metadata updates; the two archive rows remain the trade record.
- **Quiet/closed venue row `e67b2638`: event-driven clear.** It remains active and unacknowledged; its own writer resolves it when pricing resumes.

## 3k. Six paper exit freshness warnings and reconnect recurrence (2026-11-26)

Staging build `e3a96a812`, read at 01:46–01:47 UTC. The alert ledger returned all six warnings below, active and unacknowledged. The positions read returned all six exact IDs open in paper mode, all long. Each last stored monitor price preceded its warning. The exit monitor still refused the mark on all six at 01:46:57 UTC: age 1,917 seconds against the per-position ceilings below. The latest archived bid and ask were sampled at 01:43:40 UTC.

| xStock | Warning | Position | Ceiling (s) | Last stored monitor price vs stop | Archived bid vs stop | Archived bid/ask spread |
|---|---|---|---:|---:|---:|---:|
| NVO/USD | `fd9eef34-6005-4104-9c98-094c73b2d411` | `f0ed25da-6ea2-4d4f-806e-f4a25356f6c9` | 49 | +3.47% | −6.35% | 10.26% |
| NKE/USD | `53b38915-3add-4925-bfcd-d6a133a1f0fb` | `2f674348-58a1-424b-90d2-a580548233fa` | 56 | +6.53% | −7.23% | 17.14% |
| MGM/USD | `548f63ed-41f5-4ee5-af13-1c0a94411722` | `ab4d5642-fb4c-48a9-9ec5-0d1506e47a0c` | 113 | +4.20% | −16.10% | 37.78% |
| HPQ/USD | `56317268-34b5-4c15-9fac-7280a2d29e25` | `63e1da6b-b56b-4407-8dfe-db93ae405dad` | 263 | +8.57% | +0.40% | 9.57% |
| AMD/USD | `7b5cb035-ad05-4fc0-aa25-932a15a0c78d` | `ca3a395b-53e1-4ce0-9399-4d92b95b8643` | 300 | +0.80% | −35.14% | 55.32% |
| XBI/USD | `093a17ba-b8cf-4da5-b063-b1069d8da7b8` | `6e2982b0-9c33-454e-a7e1-1167c29b18f6` | 300 | +3.97% | −66.88% | 123.66% |

Distances use the position's own stop as denominator. Spread is the ask minus bid as a percentage of their midpoint. Archive receipt time alone cannot establish a usable exit price. At 01:44:05 UTC the archiver reported 469 snapshot frames and zero update frames in the prior minute, and the exit monitor's 01:46:50 UTC sweep still counted zero distinct xStocks with an actual update in its one-minute window. AMD had the least room on its last stored monitor price. The five bids below their stops were from the reconnect replay and do not establish a stop crossing on a usable quote.

**Disposition for all six:** leave active and unacknowledged. Keep the freshness ceiling in force. The exit monitor can clear the warning after accepted pricing or position closure, or hand the warning back to the regular-session rules at the transition. The standing venue-quiet record `e80d1129` was also active and unacknowledged.

**Related critical recurrence `186e8711-236c-4ba8-a782-788e893f9264`:** logs show two outside-liquid-window forced reconnects at 01:30:38 and 01:43:38 UTC after 753 and 778 seconds without data, respectively, against the 750-second limit. Both reconnected two seconds later. The second reconnect replayed the 469 snapshots above. Through 01:47:05 UTC the timed samples after that reconnect showed no symbol updates. Keep the critical alert active and unacknowledged until actual update flow and pricing recovery can be demonstrated. The previously resolved `a446f715` is the alert-ledger and recovery-procedure control (§3j). This read does not change the separate 8c Phase A Step 6 deploy gates.

### 02:11 UTC alert follow-up

All eleven exact duration escalation alerts were active and unacknowledged at 02:12:36 UTC. All eleven named positions were open in paper mode at 02:13:08 UTC. None of their stored monitor prices had advanced after the escalation. The 02:09:40 UTC reconnect snapshot supplies the archived bids. Those bids reflect the replay, while the stored monitor prices are the last values saved before the warnings. All distances are relative to each position's stop.

| xStock | Escalation alert | Last stored monitor price vs stop | Replay bid vs stop |
|---|---|---:|---:|
| PGR/USD | `9b9e0476-f65c-41e8-b463-bb44a3eb3e0b` | +0.40% | −9.57% |
| UL/USD | `6ae588cc-2fc1-459a-987c-472527857e21` | +1.43% | −3.66% |
| PPL/USD | `794bad84-72be-48e9-9d6e-151510767d47` | +0.62% | −14.64% |
| TGT/USD | `ec61fa86-a4eb-4e60-a24d-6bb2693e9d52` | +7.97% | −81.92% |
| EWL/USD | `381b6071-61b8-4df6-ae29-f50593a4f2da` | +1.60% | −4.00% |
| CME/USD | `af34467e-4a32-4eb8-b6f5-13ff17c71305` | +0.81% | −7.85% |
| PCG/USD | `772768f8-24ae-4160-ae3e-e41b7b7c0e64` | +1.54% | −8.21% |
| AZN/USD | `913cb05e-e546-41aa-942b-031729e073bc` | +1.33% | +0.18% |
| BAX/USD | `c812d749-719c-4c96-ac68-3c8e4f7f6413` | +2.86% | −49.74% |
| CARR/USD | `8e3779d3-b05f-4b57-9408-e14532d68474` | +5.07% | −5.50% |
| TJX/USD | `8e054af3-1803-4212-9b20-1e2c38a0e2e3` | +7.60% | +6.80% |

Four overnight forced reconnects occurred from 01:30:38 through 02:09:39 UTC. The 02:10:05 sample saw 469 snapshots and zero update frames in 60 seconds. The 02:12:05 sample also saw zero updates. Positive control on the same carrier: 467 distinct symbols with updates in 60 seconds at 20:01:04 UTC on Nov 25. Nine replay bids were below their stops, with no evidence of an accepted price or a position close. PGR, PPL and CME were the closest of the eleven on their last stored monitor price. On the Thanksgiving holiday the quiet feed is consistent with limited availability, but the exact venue closure boundary is unverified. [Kraken market hours](https://support.kraken.com/articles/market-hours-explained) · [NYSE holiday calendar](https://www.nyse.com/trade/hours-calendars?ecid=EMOWNSGCBUEN4K05)

**Disposition for all eleven:** leave active and unacknowledged under the existing writer rule. Leave the standing record and critical reconnect alert visible until their recovery evidence is present. The Phase A owner clearances and registered checks do not require fresh xStock quotes. The quiet feed limits what can be claimed about exit recovery across the restart. Preserve all Phase A timing and evidence gates.

**02:33 UTC check after the Phase A restart:** all eleven escalation IDs, reconnect `186e8711` and venue-quiet `e80d1129` were still active and unacknowledged. The last observed forced reconnect in the old process was at 02:22:39 UTC. The new process's 02:33:07 UTC sample recorded 469 snapshot frames and zero update frames in one minute. The event-wait disposition still applies.

### 03:41 UTC queue follow-up

The relay named fourteen in its summary and supplied fifteen distinct warning IDs. The exact alert-ledger read at 03:43:31 UTC found all fifteen active and unacknowledged, each fired at 03:12:11.486 UTC. The exact-position join at 03:43:47 UTC found all fifteen still open long in paper mode. Each last stored monitor price predates its warning. The distances below use each position's own stop as the denominator and refer to historical monitor prices.

| xStock | Current warning | Last stored monitor price vs stop |
|---|---|---:|
| PGR/USD | `ec23424d-aa0f-403e-88cf-d2918e13e414` | +0.40% |
| UL/USD | `486c8c63-a85d-4f09-8876-79cf0d00f20f` | +1.43% |
| PPL/USD | `149a79cc-ae05-4baf-b944-5d09e11cc638` | +0.62% |
| MGM/USD | `6ae46eeb-2d82-41e6-8337-f7043a13c1e5` | +4.20% |
| HPQ/USD | `56abe9db-7137-4cfb-a5c7-f17184ac8af6` | +8.57% |
| TGT/USD | `10f63ba7-ac48-42a0-ae7e-4627e7ef3348` | +7.97% |
| EWL/USD | `19cb1ad4-2a5c-4985-975f-f2aa867ac1ed` | +1.60% |
| CME/USD | `e6aff68c-d7bc-43e0-9c14-803a3c98de3d` | +0.81% |
| PCG/USD | `aeef117d-e114-4c42-95f0-78c23a5d9e0a` | +1.54% |
| AZN/USD | `1ccb364b-ea31-4150-8263-678ec1638020` | +1.33% |
| BAX/USD | `449be4e3-0b09-4d1f-b3dd-1ee1a9adb46a` | +2.86% |
| CARR/USD | `342c7eab-4725-4215-999b-577fadede52e` | +5.07% |
| NVO/USD | `a1f038be-0111-4604-aa94-9b6e34b94b86` | +3.47% |
| XBI/USD | `ad01c6db-7e73-4dec-93a7-07e0c6da5923` | +3.97% |
| TJX/USD | `ea444ec9-b43f-4d7f-ae03-c4978464d29c` | +7.60% |

The exit monitor resolved the earlier eleven warnings at 03:02:23–28 UTC as `SUPERSEDED-BY-DURATION-PAGE`. Each of those eleven position IDs also appears in this generation. The other four are MGM, HPQ, NVO and XBI. The supersession marker records replacement of the warning. The paper exit still awaits a usable price or closure for each named position.

The staging equity recorder saw a silent stall at 03:37:07 UTC, reconnected at 03:37:08, and replayed 469 snapshots with zero update frames in its 03:38:07 sample. At 03:43:07 it still counted zero symbols with updates in the prior 60 seconds, compared with 467 in the same feed counter at 20:01:04 UTC the prior day. Both the reconnect alert `186e8711` and the venue-quiet alert `e80d1129` remain active and unacknowledged. Keep all fifteen warnings visible for the exit monitor to clear and preserve the existing price-freshness rules. This read leaves the Phase B restart fence in effect. At the check the serving process still identified exact A, PID 235604 and restart 716.

## 4. PRE-REGISTERED close criteria (written before the data)
**(4a), objective 11 — WINDOW: the first three full weekday US regular sessions after the deploy (2026-10-19, 10-20, 10-21).** Quoted from the pre-audit (r5e, Langston's reading): *"crossings conserved against A3 · joins taking the too_wide/quiet share · pagesAttempted falling · `dedupeHits == 0` as a SEPARATE tripwire, never a term (non-zero = FAIL)."* Also PASS requires `markMissedRowMarks` near zero and zero `no-trigger-vts-*` rows resolved by `cli`. **FAIL:** any `no_usable_mark` or isolated-staleness crossing that joins instead of paging; minted down with `dedupeHits` up; or `alertFileBytes` growing faster than ~1 MB/day. Source: the `[VTS_RAIL][SWEEP]` lines (cumulative since start).
**Objective 6 — S6 (the stop-hold cost) — QUANTITY WINDOW: the first `spread_blown` refused tick with the bid at or below the stop.** PASS: `spreadBlownFirstStopRefusedBid` and `spreadBlownStopHeldMs` are populated for that position and its release or close records the bid against the stop. Until then S6 is **UNEXERCISED** and no silence may be cited as a pass (Langston, Step 8).
**Increment C** — its pre-registered EST reads (2026-11-01/02/03) are in the INCC pre-audit; read in §3d. *(This line read "increments A and C … in `WINDOW_READ.md`": A never registered one and `WINDOW_READ.md` holds neither — corrected 2026-11-04.)*

## 5. Unproven, stated
- **C-P5 `sun_reopen` leg:** discharged by the first post-retirement live reopen read (§3i): no retired paper-exit pause line, 186 normal xStock decision frames, retained VTS pause live, and 0 paper xStock exits inside the registered window (21 same-day close control).
- **Three folded issues not yet shown delivered — each checked at this batch's close, and any not delivered becomes a named remaining item (census W44/W45, 2026-11-04):** `#961` (the exit fill walks a book of unbounded age; xStock leg here since row 64 was deleted 2026-10-10), `#962` (a resting maker sell declared filled on the midpoint; xStock leg), `#1087` (the entry gate's dead one-sided arm and the quantity-zero side, folded with `#996` into objective 3; increment A's P3 did not touch it).
  - ➕ **2026-11-21 (CC-C): `#961`'s xStock leg is measured NOT delivered** — 15 of 15 active xStock taker stop closes (11-16..11-20) booked the bid of a snapshot row 2.9–17.0 s old; PDD 11-19 booked on a 16,955 ms `walk_stale` book, past the entry's 15 s ceiling (`RUNNING_ISSUES` `#961` ➕ 2026-11-21; instrument `scripts/analysis/b1250_exit_book_age.sql`). ⇒ **A named remaining item at this batch's Step 11** unless delivered first; objective 2's "from the same tick as the fill" is not met on the taker exit fill. NOT RE-READ.
- S6 has never fired (above).
- The release after a `spread_blown` hold is a fresh seed on two sub-ceiling frames with no movement test — `#1199`, placed after this objective's observation read (53 releases on 17 symbols in the first five hours show how often books oscillate around the ceiling).
- The paper rail clears on a `position_closed` row; 9 of 259 paper closes over 14 days wrote none (joined `active_trade_logs.trade_id = closed_trades.id`) — those rows stay for a human, blocking nothing.
- `serialPerKey` assumes one process writes the alert rows (PM2 one fork; Docker one process) — false the day a second writer lands.
- **Increment B:** the mark fallback (`basis=mark`) never ran live — it is fence-verified only (the inc2-chain arm-OFF control covers `reason=spread_blown_off`; `reason=guard_off` has NO fence ⇒ folded into (4b)'s fences, §9.4 disposition 2). The entry `crossed` refusal is unexercised (no crossed book met an entry attempt). Size refusals have never fired (0 over 68,991 lines in the window). The trigger's safety on seed frames rests on the coupling with the 1% `spread_blown` ceiling (System Manual §3.5.1b, forward-binding).
- **Retention:** `out.log` rotates by size 6-8 times a day, so stdout older than ~12-16 h is gone; the window reads depend on a daily harvest (§3c).

- **(4b) T2/T3 basis is evidenced by inspection and the fence test only** (Langston Step 8, 2026-11-04): the only per-decision `basis=` line (`EXIT_TRIGGER`) is on the paper lane, so 455+ VTS xStock closes went through the new selector with no per-decision basis record. Nobody cites 19/19 for T2/T3.

## 6d. Governance files changed — the C-P5 retirement (Step 10, 2026-11-20)
CHANGE-CLASS: sub_batch (row 2's C-P5 outcome; declared in the C-P5 pre-audit header)
| tier | document | verdict | what changed / why not |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Row 2 entry: a 2026-11-20 line, C-P5 done (retired, Step 7 PASS, Step 8 confirmed); row 2 stays open. |
| T1 | `PHASE_HISTORY.md` | ✅ | A 2026-11-20 plain-language line under row 2's entry. |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | Row 2 status leads with C-P5 done and the forward dependency. |
| T1 | `PHASE_19_PLAN.md` | N/A | Not a `P19-*` batch and row 2 has no in-flight row there. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ mine / N/A shared | Own file: row 2 C-P5 at Step 10; shared: no new consensus truth. |
| T1 | the batch `SCOPE` | ✅ (existing) | Parent scope `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`; unchanged. |
| T1 | the batch `PRE_AUDIT` | ✅ (existing) | `B_XSTOCK_BID_TRIGGER_RELAND_CP5_RETIREMENT_PRE_AUDIT.md` r2. |
| T1 | the `COMPLETION_REPORT` | N/A yet | Row 2 is open: this progress report carries C-P5 (section 3h) until row 2's Step 11 converts it. |
| T1 | the `Observation` column | ✅ | The C-P5 observation was declared and read: the DEPLOY_WINDOWS row was closed (completed) after Step 7. |
| T1 | `CC_C_SESSION_TASK_LIST.md` | ✅ | Row 2: C-P5 done, harvest cron already removed 11-16; row 17: 8c switched on with its week read. Other three lists: N/A, not mine. |
| T1 | Langston's `MEMORY.md` | ✅ | Row 2 line via `langston-memory-write` (part `00-legacy.md` `bf7a4bc142ba` -> `790a1e00b18e`); 73,875 -> 73,860 B, loaded set 143,829 B vs ceiling 143,856 B. |
| T2 | `SYSTEM_MANUAL.md` | ✅ (Step 3) | The pause bullet rewritten as RETIRED 2026-11-16 with what holds now and what stays (code commit `f61207159`). |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | `market-hours.ts` entry: the venue-transition predicate, its three remaining consumers with lines, the retired fourth, and the `spread_blown` forward dependency (pre-audit A8). |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#943`: the retirement and the forward dependency, since `#943` is the handoff bad-print case. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-11-16-A`: symptom, fix, verification. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level change. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | Rule 2's third form: a named-impact instance (no epoch bump; population, direction, size; a reading rule). |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional change. |
| T2 | `STORAGE_POLICY.md` | N/A | No tier or retention change. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | Not a B78-B81 item. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No onboarding learning. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | The method did not change. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | The reviewer's build did not change. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No `CLAUDE.md` rule changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ (Step 3) | 2026-11-16 entry with the archived `.removed` copy. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | `MISTAKE:` trailers were written on this work's commits (Step 7/8 counting and control-object slips); the weekly pass collects them from the trailers. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A now | Row 39 flips to open-retired at row 2's Step 11, not here. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Process unchanged. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Board unchanged. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | Not this session's run. |

## 6c. Governance files changed — increment (4b) (Step 10, 2026-11-04 → 11-05)

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | row 2 entry: status line current (A/C PASS, (4a) PASS, (4b) Step 7 PASS + Step 8 CONFIRMED, (4c) at Step 2); WHAT IT DOES gains (4b); OPEN ON rewritten ((4c), C-P5 to 11-16, `#961`/`#962`/`#1087`) |
| T1 | PHASE_HISTORY.md | ✅ | 2026-11-04 entry for increment (4b), batch OPEN |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2) | ✅ | both row-2 cells: (4b) Step 7 PASS, Step 8 CONFIRMED, Step 10; (4c) Step 2 r2 (status-board 47/47 and census 228/228 tests pass) |
| T1 | PHASE_19_PLAN.md | N/A — no row there | row 2 has no row of its own there |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | own: row 2 position; shared: no new consensus truth ((4b) is behaviour-preserving) |
| T1 | the batch SCOPE | N/A | no scope change |
| T1 | the batch PRE_AUDIT | ✅ | `INC4B_PRE_AUDIT` r4 (landed at Step 2); §3e reads against its Step-7 pre-registration |
| T1 | COMPLETION_REPORT | ✅ | this PROGRESS report — §3e Step 7 with Step 8's corrections, §5 (T2/T3 basis fence-only), this ledger |
| T1 | the Observation column | ✅ | card stays in Observation (blocked on (4c) and the C-P5 read) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC_C row 2: (4b) done through Step 10; next (4c), then C-P5 and the crontab removal |
| T1 | Langston's MEMORY.md | ✅ | row 2 line updated via `langston-memory-write` (part `00-legacy.md` `d8ec7b2a9e4f` → `c7312d6395c0`); 505 → 386 B, the sum goes down |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1b: one rule at three sites (`selectExitTrigger`), the venue-transition pause (decide at resume, no latch, `bidWouldFire` as an artifact rate); §18.0.1 VTS xStock column corrected (`cf9f6ddcd`) |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | NEW `exit-trigger.ts` entry (three callers, the vocabulary, the fence and its reach, the VTS basis caveat) (`cf9f6ddcd`) |
| T2 | RUNNING_ISSUES.md | N/A | no new issue: the `moonbag_timeout` basis gap was homed into increment (4c) (§3e), `#1231` closed at Step 2 |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-11-04-A |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | behaviour-preserving: no calibration epoch boundary (the read showed no change in what fires) |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention change |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ reviewed, N/A | working-list review: no item A–F change (the VTS lanes' trigger is unified, not changed) |
| T2 | ACTIVE_PATH_FLOW.md | ✅ | the midpoint question's answer row: paper and both VTS lanes on one shared rule since 2026-11-04 |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build unchanged |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | a stale comment and a dead `?? 'unset'` label removed — not components |
| T2 | MISTAKE_PATTERNS.md | N/A | the Step-7 slip (three boots named, four real) is in the Step-8 commit body for the weekly pass |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | row 2 re-justified 2026-11-05 (alert `e473d7da` came due again while this ledger was being written; first marked N/A, corrected) |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | no new alert class |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | not this batch's |

**Carried to the C-P5 four-week read (content to 2026-11-16), not done here, and why:** (1) the staging crontab entry `ccc_cp5_once.sh` is the read's carrier and comes off only after it (inert after 2026-11-18 02:00Z); (2) the pre-audit's condition I — a retirement records its forward dependency on objective 6 in `RUNNING_ISSUES` `#943` and the System Manual's `spread_blown` section — fires only if that read proposes retiring the pause.

## 6b. Governance files changed — increment B (Step 10, 2026-10-20)

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | row 2 entry: B shipped (trigger on the gated bid, size test, crossed refusal); open on (4a), A/C, and (4b) still to build |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-17 entry for increment B, batch OPEN |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2) | ✅ | status: B deployed, Step 8 confirmed, Step 10; S6 exercised; A/C read dates |
| T1 | PHASE_19_PLAN.md | N/A — no row there | `3n.q7` has no row of its own there |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | own: row 2 position (B at Step 10, (4a) harvest, (4b) next); shared: the "xStock holds on a book wider than 1%" truth still holds, no new shared truth |
| T1 | the batch SCOPE | N/A | no scope change; objective 8's split between B (size) and (4b) (shared module) is recorded here and in the catalog |
| T1 | the batch PRE_AUDIT | ✅ | INCB_PRE_AUDIT r2 (landed at Step 2) — its §4 pre-registration is what §3c reads against |
| T1 | COMPLETION_REPORT | ✅ | this PROGRESS report — §2 increment B, §3 steps, §3c read with Step 8's corrections, §5 unproven |
| T1 | the Observation column | ✅ | card stays in Observation (blocked on the (4a) window, A/C reads, (4b)) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC_C row 2: B deployed and confirmed, next the (4a) read then (4b) |
| T1 | Langston's MEMORY.md | ✅ | row 2 line updated (inc B confirmed, (4b) unbuilt); 421 → 362 B, the sum goes down |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1b rewritten: the gated bid trigger, the seed-frame coupling with the 1% ceiling (forward-binding), size and crossed rules, how to read the counters; §18.0.1 table cell, epoch boundaries, the crypto-ceiling note |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | NEW `transactable-sides.ts` entry (both functions, every production caller, upstream quantities, instruments, blast radius — a gap since `8a-P4c`); the `8a-P3/P4` summary line updated |
| T2 | RUNNING_ISSUES.md | ✅ | `#1191` update: the window's stdout carrier rotates faster than the window; harvest location |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-17-B (increment B; first written as `-A`, which is CC-A's `B-B75-EXPORT-COMPLETENESS` — renamed on Langston's Step-10 condition 1) |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | epoch register: third precedent (`xstock_spot/paper_sim` 6 → 7) and the unmarked objective-6 boundary inside epoch 6 |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention policy change; the log harvest is a read-time copy, not a policy |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ | working-list review: no item A–F change; the second paper xStock boundary, machine-visible this time |
| T2 | ACTIVE_PATH_FLOW.md | ✅ | the "still on the midpoint" line and the open-questions row: paper xStock re-landed on the bid |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build unchanged |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed; C1's log-only divergence lines were re-pointed, not deleted (X3 START on the mark arm only) |
| T2 | MISTAKE_PATTERNS.md | N/A | the Step-7 slips (`wrong-object`) are in commit bodies for the weekly pass |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | row 2 re-justified 2026-10-20 (alert `e473d7da`, Langston's Step-10 condition 2): B confirmed, open on (4a), A/C and (4b) |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | one new alert key (`xstock-invalid-quantity-<mode>-<id>`) follows the existing pattern |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | not this batch's |

## 6. Governance files changed so far (Step 10, 2026-10-17)
The Step-10 ledger, transcribed from the governance commit message:

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | new OPEN entry for row 2: what shipped (A, C, objective 6, (4a)) and what it is open on |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-16 entry, OPEN: blown books held not sold; VTS alerts clear themselves |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2) | ✅ | status: OPEN, `5cab7b820` deployed, objective 6 Step 8 confirmed, (4a) window, report linked |
| T1 | PHASE_19_PLAN.md | N/A — no row there | `3n.q7` has no row of its own; it is only named inside rows `3n.q2` and `3n.q8` |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ | shared: the "xStock paper holds on a book wider than 1%" truth (net shrink, 24,561 B); own: row 2 position |
| T1 | the batch SCOPE | ✅ | §INC-4A objectives 10-13 and objective 6's "DECIDER CHANGED" section (landed 10-16) |
| T1 | the batch PRE_AUDIT | ✅ | INC4A_PRE_AUDIT r1-r5f plus the Step 6/7 read |
| T1 | COMPLETION_REPORT | ✅ | parked batch: PROGRESS REPORT written (converts at close); criteria pre-registered in §4 |
| T1 | the Observation column | ✅ | card moved to Observation, blocked on External: (4a) window 10-19/20/21, A/C EST reads, S6's first stop-hold |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC_C row 2 updated (deployed pieces, windows, next B and (4b)); CC_A, CC_B, CC_INFRA not mine |
| T1 | Langston's MEMORY.md | ✅ | row 2 state block in, two F-G-1 mechanics lines out (heading repeat + evidence in its progress report); sum 162,267 → 162,233 B |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1: branch 2b `spread_blown` and the indefinite-hold exception to the yield |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | book-state entry (12 → 14 knobs, stale since inc-2; branch order) + objective 6 consumers/state + new rails entry |
| T2 | RUNNING_ISSUES.md | ✅ | `#1191` update (deployed, first read, window); `#684` updates and `#1199` filed 10-16 |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-16-B (objective 6) and -C ((4a)) |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change; row 2's place in the plan is unchanged |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | the rail key named in the valve register is now per-trade |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention change; the alert file's growth is a pre-registered FAIL line, not a policy |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ | working-list review: no item A–F change; one paper xStock outcome boundary at the 10-16 15:10:55Z deploy |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build, model and read path unchanged |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | no module, route or function removed; the inc-2 `spread_blown` branch was replaced in place in `book-state.ts` |
| T2 | MISTAKE_PATTERNS.md | N/A | this batch's trailers (`wrong-object` A5, `skipped-the-gate`) are in commit bodies, where the weekly pass reads them; no promotion is this batch's call |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | ack/resolve process unchanged; a new machine resolver (`vts-exit-monitor`) follows the existing pattern |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board columns and fields unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check is not this batch's |
