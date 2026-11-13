# B-XSTOCK-BID-TRIGGER-RELAND — PROGRESS REPORT

## OPEN — waiting on: increment (4c)'s five-session Step 7 read (deployed `0abfd7102` 2026-11-05 09:17:49Z; criterion in `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4C_PRE_AUDIT.md` §3 r3, cut at the deploy) · C-P5's four-week read (content to 11-16) · the three folded issues not yet shown delivered (`#961`, `#962`, `#1087`, §5)

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
- **Step 7:** the five complete US regular sessions from 2026-11-05, read against §3 r3 of the plan (crossing pages in [25,45) after the open: PASS ≤ 10 over five and ≤ 5 per session; FAIL ≥ 15 in a session or ≥ 40 over five; the doorbell family's own FAIL bar), cut at the deploy boundary — so the published 19 of 19 `basis=bid` (§3e) is a pre-deploy figure and the moonbag line joins the `mark=` population only from here (Langston's record item).

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
  - **Named prediction:** about 0.67 crossing pages per session at the open, on slow sessions. Observed: 2 page events (4 rows) over five sessions, both STRK, the trade already standing in the record — consistent with "pages only for trades still undecided 10 min after the venue's regular book opens".
  - **Doorbell family (FAIL only, ≥ 10 per session on average):** 3 rows over five = 0.6 per session — not met. Non-expected reasons still page (VIA `too_old` 11-06, STRK 11-09), so that family did not go silent; whether every reason class that paged in the baseline still pages is not separately tested — stated, not claimed.
  - **P2 join split (reported), from `[VTS_RAIL][SWEEP]` in `out__*`, first-to-last line inside 14:30–21:00Z:** 11-09 joins 5 = tooWide 5; 11-10 9 = 9; 11-12 7 = 7; 11-13 (to 18:05Z) 4 = 4; `joinsTooOld` 0, `joinsOther` 0 and `dedupeHits` 0 in every one. **11-05 and 11-06 are UNMEASURED** (their `out__` files have rotated away; the cp5 harvest keeps `VENUE_PAUSE`/`XS_FRAME` only); **11-11 is UNMEASURED** (the cumulative counters reset inside the session, a process restart).
  - **Moonbag basis line (reported):** `type=moonbag_timeout` lines = **0, NOT OBSERVED** over the retained `out__` files 11-09 → 11-13, against **185** `EXIT_TRIGGER` lines in the same files (71 `stop_hit`, 114 `target_hit`; positive control for the instrument). 11-05 → 11-08 unmeasured (rotated). P3's line format is therefore fence-verified only.
  - `NOT RE-READ` by a second reader before Langston.
  - **STEP: 7 of 11 COMPLETE · NEXT STEP: 8 of 11** (Langston's second pass).

## 4. PRE-REGISTERED close criteria (written before the data)
**(4a), objective 11 — WINDOW: the first three full weekday US regular sessions after the deploy (2026-10-19, 10-20, 10-21).** Quoted from the pre-audit (r5e, Langston's reading): *"crossings conserved against A3 · joins taking the too_wide/quiet share · pagesAttempted falling · `dedupeHits == 0` as a SEPARATE tripwire, never a term (non-zero = FAIL)."* Also PASS requires `markMissedRowMarks` near zero and zero `no-trigger-vts-*` rows resolved by `cli`. **FAIL:** any `no_usable_mark` or isolated-staleness crossing that joins instead of paging; minted down with `dedupeHits` up; or `alertFileBytes` growing faster than ~1 MB/day. Source: the `[VTS_RAIL][SWEEP]` lines (cumulative since start).
**Objective 6 — S6 (the stop-hold cost) — QUANTITY WINDOW: the first `spread_blown` refused tick with the bid at or below the stop.** PASS: `spreadBlownFirstStopRefusedBid` and `spreadBlownStopHeldMs` are populated for that position and its release or close records the bid against the stop. Until then S6 is **UNEXERCISED** and no silence may be cited as a pass (Langston, Step 8).
**Increment C** — its pre-registered EST reads (2026-11-01/02/03) are in the INCC pre-audit; read in §3d. *(This line read "increments A and C … in `WINDOW_READ.md`": A never registered one and `WINDOW_READ.md` holds neither — corrected 2026-11-04.)*

## 5. Unproven, stated
- **Three folded issues not yet shown delivered — each checked at this batch's close, and any not delivered becomes a named remaining item (census W44/W45, 2026-11-04):** `#961` (the exit fill walks a book of unbounded age; xStock leg here since row 64 was deleted 2026-10-10), `#962` (a resting maker sell declared filled on the midpoint; xStock leg), `#1087` (the entry gate's dead one-sided arm and the quantity-zero side, folded with `#996` into objective 3; increment A's P3 did not touch it).
- S6 has never fired (above).
- The release after a `spread_blown` hold is a fresh seed on two sub-ceiling frames with no movement test — `#1199`, placed after this objective's observation read (53 releases on 17 symbols in the first five hours show how often books oscillate around the ceiling).
- The paper rail clears on a `position_closed` row; 9 of 259 paper closes over 14 days wrote none (joined `active_trade_logs.trade_id = closed_trades.id`) — those rows stay for a human, blocking nothing.
- `serialPerKey` assumes one process writes the alert rows (PM2 one fork; Docker one process) — false the day a second writer lands.
- **Increment B:** the mark fallback (`basis=mark`) never ran live — it is fence-verified only (the inc2-chain arm-OFF control covers `reason=spread_blown_off`; `reason=guard_off` has NO fence ⇒ folded into (4b)'s fences, §9.4 disposition 2). The entry `crossed` refusal is unexercised (no crossed book met an entry attempt). Size refusals have never fired (0 over 68,991 lines in the window). The trigger's safety on seed frames rests on the coupling with the 1% `spread_blown` ceiling (System Manual §3.5.1b, forward-binding).
- **Retention:** `out.log` rotates by size 6-8 times a day, so stdout older than ~12-16 h is gone; the window reads depend on a daily harvest (§3c).

- **(4b) T2/T3 basis is evidenced by inspection and the fence test only** (Langston Step 8, 2026-11-04): the only per-decision `basis=` line (`EXIT_TRIGGER`) is on the paper lane, so 455+ VTS xStock closes went through the new selector with no per-decision basis record. Nobody cites 19/19 for T2/T3.

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
