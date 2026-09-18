# B-FEED-BY-SITUATION-AUDIT (plan row 3n.t) — FIRST PASS, 2026-09-15

> **STATUS: investigation record, NOT a ruling.** Kyle-directed 2026-09-15 as an investigation (batch work held). Read at `origin/migration/aws-supabase` `99c2c2728` by a fresh-context reader; CC-B re-derived four load-bearing cells at the ref (marked ✔). Every other cell is a **LEAD** until re-derived. Next: `3n.s` consolidation absorbs this grid; `3n.u` fixes from it.
>
> REVIEWER r1: claim-only (grid built from the code, not handed my map) · "what feed does each cell read" · 13 wrong/stale/fallback cells · re-derived 4 of 13 y.

**THE MAP IS STALE.** 23 commits since `PRICE_FEED_MAP.md`'s stamp `7f645a6f9` touch its trigger files (931 lines of `active-execution-engine.ts`). Biggest: `b434511cf` (8a-P2) — the paper crypto exit trigger now reads the BID, not the midpoint. The map's §1C/§3 Q1 still say midpoint.

**Rule used:** a price that VALUES may be a midpoint; a price that ACTS or is RECORDED must be the transactable side (buy = ask, sell = bid); birth levels from a printed price, fresh within a few ticks of the feed's cadence; a fallback on absence is wrong (hold).

Jobs: a birth levels · b RTB ranking · c entry marketability · d maker entry fill · e exit trigger · f maker exit fill · g booking · h marking / risk.

## PAPER · CRYPTO
| job | feed | site | verdict |
|---|---|---|---|
| a | quant: cache → smoother; pattern: 60-min bar close | SO:2407-2429; SO:2224 | quant WRONG KIND; pattern TOO STALE |
| b | cache batch | rtb:433 | RIGHT |
| c | depth snapshot `asks[0]`, age bounded by DB `warmthMaxAgeMs` | AEE:4616, :4659 | RIGHT (map's "≤~30 s" cites a comment about stored EV) |
| d | book midpoint via getPriceWithFallback | AEE:2040→1554 | WRONG KIND |
| e | bid selector, ≤2,000 ms, spread ≤2 %, no bid ⇒ no decision (8a-P2) | AEE:2293-2347 | RIGHT (map contradicts) |
| f | midpoint `currentPrice` into evaluatePendingMaker ✔ | AEE:2498 | WRONG KIND |
| g | taker walks the book; maker books the limit | AEE:4764, :3203, :3217 | RIGHT, except fallbacks below |
| h | unrealized at midpoint; daily-loss reads REALIZED only | AEE:2420; daily-loss-budget:131 | RIGHT; sizing balance UNTRACED |

## PAPER · xSTOCK
| job | feed | site | verdict |
|---|---|---|---|
| a | 15-min bar close | EC:1191 | TOO STALE |
| b | cache batch | rtb:433 | RIGHT |
| c | 1-level ticker ask | AEE:4659; depth-source:48 | RIGHT |
| d | equities mark (mid if two-sided else last) | archiver:208 → AEE:1554 | WRONG KIND |
| e | equities midpoint, book-state guarded | AEE:2782, :1745 | WRONG KIND |
| f | midpoint | AEE:2498 | WRONG KIND |
| g | 1-level walks; close reads snapshot with NO age check | AEE:3217 | right kind, freshness unbounded |
| h | midpoint | AEE:2420 | RIGHT |

## VTS · CRYPTO
| job | feed | site | verdict |
|---|---|---|---|
| a | raw cache price, no smoother | VR:4814, :1693 | WRONG KIND (unstated mix) |
| b | no pool stage found | VR:2211 | N/A (not exhaustive) |
| c | cache price | VR:2136, :4530 | WRONG KIND |
| d | cache price | VR:3140 → :3153 | WRONG KIND |
| e | `triggerPrice: currentPrice` (cache); out of 8a-P2 scope | VR:3254, :4059 | WRONG KIND |
| f | none (VTS has no resting exit) | — | N/A |
| g | entry = strategy level; exit = cache mark, no mark ⇒ stop/target level ✔ | VR:1693; vts-exit-booking:27-29 | WRONG + FALLBACK |
| h | updateMarketPrice | VR:4998 | RIGHT; risk gate UNTRACED |

## VTS · xSTOCK
| job | feed | site | verdict |
|---|---|---|---|
| a | 15-min bar close | scanner:597, :909 | TOO STALE |
| c | bar close | EC:956, :1234 | WRONG KIND |
| d | ticker LAST trade, ≤5 min | VR:3063-3095 | WRONG KIND + TOO STALE |
| e | same last trade, ≤5 min | VR:3254, :4012 | WRONG KIND + TOO STALE |
| g | entry = bar level; exit = exactly the stop/target level ✔ | EC:1009; vts-exit-booking:27 | WRONG |
| h | not found | — | UNTRACED |

## LIVE MODE
The active engine constructs `PaperOrderPlacer` unconditionally ✔ (AEE:884) ⇒ live inherits every paper cell and its fills would still be simulated. Differences: the resting maker exit is paper-only (AEE:2488, :2539) so a live target exit is taker; venue validate skipped (AEE:4687). A separate legacy `TradingEngine('live')` (routes.ts:109, manual trades :5056) sends real venue orders (trading-engine.ts:316-330, :519-560); its booking is UNTRACED. ⚠️ Rule-18 candidate — not dispositioned here.

## THE 13 WRONG / STALE / FALLBACK CELLS
1. Paper both classes (d): maker buy fills on the midpoint, not the ask.
2. Paper both classes (f): maker sell fills on the midpoint ✔ — although the crypto trigger now uses the bid. (= `3n.q`, CC-C)
3. Paper xStock (e): exit trigger is the equities midpoint. (= `3n` P2, CC-C)
4. Paper crypto quant birth: unlabelled mix, smoothed.
5. Bar-close births too old: crypto pattern 60 min; xStock paper + VTS 15 min.
6. Crypto close with no two-sided book: books the REQUESTED price minus a penalty (`CLOSE_COLD_BOOK`) — requested = `exitPrice`, the exit-DECISION price (AEE:3309), which on crypto is the BID since `8a-P2`, not a midpoint *(corrected 2026-09-18, Langston)*; with depth config missing, the requested price with zero slippage — LATENT: `beyond_depth_penalty_bps` = 50 is seeded both classes.
7. Portfolio-manager force-close with no price books the ENTRY price ✔ (APM:310-330).
8. Portfolio-manager close-all writes the midpoint as exit, accepts stale re-serves, and books entry price with no quote (APM:622-663).
9. Paper xStock close reads the snapshot with no age limit (AEE:3217).
10. VTS crypto (a, c, d, e): the cache mix for everything.
11. VTS crypto booking: exit at cache mark; no mark ⇒ level.
12. VTS xStock (c, d, e): bar close, then a last trade up to 5 min old.
13. VTS xStock booking: exit books exactly at the stop/target ✔.

## UNTRACED
Whether `getPortfolioBalanceV2` (sizing/exposure) includes unrealized P&L · any VTS risk gate and VTS xStock marking · legacy live `TradingEngine` booking · DB values of the xStock age ceiling and `warmthMaxAgeMs` · VTS having no ranking stage (absence not exhaustively proven).

## RELATED FIRST READ — `3n.w` maker vs taker exits (paper, 659 stamped closes, all `mode=paper`)
| | crypto | xStock |
|---|---|---|
| target exits, all maker fills | 171, 155 wins, +565.31 | 97, 96 wins, +922.61 |
| stops, taker | 196, 16 wins, −614.81 | 174, 5 wins, −1,288.49 |
| rested then converted to taker | 13 (+121.85, last 2026-08-22) | 3 stops (−18.06, July) |

Maker fills with a recorded witness bid: crypto 24 of 171, bid below fill on 24/24 (median 31.3 bps); xStock 11 of 97, 11/11 (median 985.2 bps). Witness lags (separate socket on crypto) and n is small ⇒ a LEAD that maker wins are overstated, consistent with cell 2.

---

# SECOND PASS — 2026-09-18, every cell re-checked at `b5036e606` WITH PROVENANCE (Kyle: "continue checking until all have been checked and confirmed"; "run provenance checks … determination with Langston and Coltrane")

> Three fresh readers, one cell group each, told to confirm/refute at the ref, quote the introducing commit, state the intent, and say whether CC-C already owns it. CC-B re-derived the load-bearing ones (marked ✔). REVIEWER r2: claim-only per group · confirm + provenance + coverage · 13 cells + 3 untraced · re-derived y (the ✔ cells).
> ⛔ **THE FIRST PASS WAS STALE FOR CRYPTO WITHIN HOURS OF BEING WRITTEN.** It read `99c2c2728`; CC-C's `8a-P3` (`16ab0293b`, deployed 2026-09-15, staging `91647c9b9`) moved seven crypto cells to the transactable side the same afternoon ✔. The map is updated (r8, `0b68d906c`).

## STATE OF EACH CELL NOW
| # | cell | now | intent (introducing commit) | owner |
|---|---|---|---|---|
| 1 | maker ENTRY fill | crypto **ASK** ✔ (AEE:1577-1598); xStock still the mark (AEE:1574-1576) | `b48aef51f` B7.2c "fills ONLY on honest side-aware trade-through" — the mid was never argued for | CC-C `8a-P4` (xStock) |
| 2 | maker EXIT fill | crypto **BID** ✔ (AEE:2564); xStock the mark | `06560c299` B8.6 "fill requires a LATER venue tick at/through the limit" | CC-C `8a-P4` |
| 3 | xStock exit trigger | equities midpoint (AEE:2866) | `184c41881` B8.5 — give xStock ANY mark (spot REST carries no equities); side never chosen | CC-C `8a-P4` |
| 4 | crypto quant birth | cache (now LABELLED mid/last) → smoother → level | `36c9d47bc` 2026-01-01 Kalman — built to "suppress false signals during chop", i.e. DETECTION not levels | CC-C row `8c` ("convert at the level site; smoothed series stays a detection feature") |
| 5 | bar-close births | crypto pattern 60-min close; xStock 15-min close; xStock age gate checks TICKER age, not bar age (active-dispatch:181) | `756b64e49` B-NEW-34 (Kyle) 60-min parity, "avoids ticker-vs-bar drift"; `ae2ddc845` B.4 15-min for REGIME calibration; crypto pattern INFERRED-FROM-CODE | ⚠️ CC-C `8c` DELIBERATELY keeps `venue_close` — **conflicts with the few-ticks freshness test → determination** |
| 6 | crypto cold-book close | requested price × (1 − penalty); config missing ⇒ requested price, zero slippage (order-placer:104-115) | `b74526dc3` "a market exit always gets out, never a phantom stuck position" | partial: CC-C `8e` labels it; `8a` (walk bids) NOT BUILT → **CC-B `3n.u`** |
| 7 | engine-stop / kill-switch flatten with no price | requested price = ENTRY (APM:311-331); bids still walked, booked only on a cold book; slippage measured vs entry | `306b5d69c` 2025-12-06 Replit "hard stop … live or fallback pricing" | **CC-B `3n.u`** |
| 8 | manual close-all | writes the mark as exit, accepts `last_known_good`, no walk, no fee, gross P&L; can delete a position with no close row (APM:620-703) | `306b5d69c` + `6ee84af0a` — operator panic button predating the order placer | **CC-B `3n.u`** (legacy — route or delete) |
| 9 | taker close book age | NO age bound on the book a close walks — xStock (depth-source:49-69) AND crypto | `b74526dc3` — closes ungated by design, "you must always be able to exit" | **CC-B `3n.u`** |
| 10 | VTS crypto | birth still cache; placement/fill/trigger/booking now ask/bid ✔ | `16ab0293b` | CC-C `8c` (birth) |
| 11 | VTS crypto booking | exit BID ✔; clamp when no mark OR no bid (counted); entry at signal level | `d3e643032` F-G-2 "learning system learns off REALISTIC exits" | CC-C `8a-P4` (entry, cell C8) |
| 12 | VTS xStock | bar close for placement; ticker LAST ≤5 min for fill + trigger (VR:3139-3160) | `B79.0m.b2` "else xstock trades never receive a non-null currentPrice" | CC-C `8a-P4` |
| 13 | VTS xStock booking | exit = exactly the stop/target (`clamp_class_seam`) | `PRICING_DECISIONS_2026-09-11.md` D5 — deliberate until `#943` passes; ⚠️ `#943` closed INCONCLUSIVE ⇒ no release | CC-C `8a-P4` |
| U1 | sizing balance | anchor + REALIZED P&L only — no marks | deliberate | — (open-mark risk homed `3z`, CC-C) |
| U2 | legacy `TradingEngine` | books last trade minus `Math.random()`; reachable via `POST /trades/:id/close` | Replit era | CC-A row 11.5 `B-TRADING-ENGINE-REMOVAL` (#578) |
| U3 | VTS ranking / risk | no RTB stage by design; xStock marked for UI only; no risk gate on marks | by design (learning system) | — |

⚠️ **PROCESS GAP (§9.4): `8a-P4` carries every xStock half above but has NO row in `PHASE_19_PLAN.md`** (0 hits vs 6 for `8a-P2`; it exists only in the `8a-P3` scope). CC-C's to place.

## MY FIX LIST (`3n.u`) — ONLY what CC-C is not set to fix, and NOT YET DECLARED WRONG
Each carries its intent above; each goes to Langston + Coltrane for a determination before it is called a defect:
- **D1 (cells 6, 9) — taker CLOSE pricing.** Keep "always exit". Question: should the requested/booked price anchor to the last OBSERVED BID under an age bound (both classes), instead of a mark or an unbounded-age book?
- **D2 (cell 7) — flatten with no price.** Keep "always exit" (kill switch). Question: bid instead of entry price as the request; slippage measured against a real reference.
- **D3 (cell 8) — manual close-all.** Legacy (C). Route through `forceClosePosition` or delete under rule 18.
- **D4 (cell 5) — bar-close LEVELS.** 15/60-min-old closes fail the few-ticks test, and the xStock age gate measures the ticker, not the bar. **Conflicts with CC-C's `8c` "keep venue_close"** — a four-party call (CC-C, Langston, Coltrane, Kyle), not mine to decide.
- **D5 (cell 13) — the VTS xStock clamp's exit condition is dead** (`#943` inconclusive). Flag to CC-C; not my fix.

---

# DETERMINATIONS — Langston (read at `e752dba24`, every load-bearing citation re-derived by him) + Coltrane (read at `b5036e606`, design view), 2026-09-18

| item | Langston | Coltrane | RESULT |
|---|---|---|---|
| **D1** close fill book age (cells 6, 9) | AGREE, amended: the age bound ALREADY EXISTS — `warmth_max_age_ms` 5,000 crypto / 15,000 xStock, `assessWarmth` (depth-source:148-163) — the close is the ONLY fill site that skips it. **Three arms:** warm → walk; stale-but-present → walk AND stamp over-ceiling; cold → last observed bid with its age + penalty, never `requestedPrice`. Zero-slippage arm LATENT. | Keep walking valid age-bounded bids; with insufficient evidence **keep the close pending** rather than invent a fill; label any synthetic liquidation and exclude it from learning. | ✅ **CONFIRMED DEFECT, mine.** ⚠️ Open design point for scope: cold arm — Langston "last bid + penalty" vs Coltrane "stay pending". |
| **D2** flatten with no price (cell 7) | AGREE. Lead with TELEMETRY: slippage = (entry − fill) ⇒ **slippage column equals gross P&L on every kill-switch flatten.** **PLUS:** `getPriceWithFallback` serves `last_known_good_reserve` with NO age bound (live-pricing-adapter:1394-1413); `APM:311`/`:632` test provenance, not age ⇒ a flatten can book an arbitrarily old price as live. | Keep the liquidation request, drop entry substitution; paper leaves the close unresolved when no fill can be substantiated. | ✅ **CONFIRMED DEFECT, mine** — D1+D2+D3 scoped as ONE item (Langston): *the close fill inherits no freshness contract, and the paths that bypass the decision gate inherit nothing.* |
| **D3** manual close-all (cell 8) | AMEND: **route through `forceClosePosition`, do NOT delete the button.** Understated: `:616` no matching trade ⇒ `:710` still deletes the position — **silent position deletion, no close row, no P&L.** Rule-24 outcome (3) legacy. | Keep the button; route through the canonical close; atomic + retry-safe; disable until repaired if it can't be. | ✅ **CONFIRMED, mine** — route, keep the button. |
| **D4** bar-close levels (cell 5) | AMEND — two questions welded. (i) a venue bar close IS a printed price; `venue_close` stays (CC-C `8c`; Kyle's B-NEW-34) — **not a defect.** (ii) **the validity gate measures the wrong object:** `active-dispatch:181-186` checks TICK age ≤ 15,000 ms while the levels come from a 15-MINUTE bar. Real, independent, mine; default = hold (matches D6). Measure first whether the entry is re-validated against the fill ask downstream. | Age alone doesn't make a level wrong; check the bar's actual close timestamp; keep the strategy's levels, validate current ask/setup/sizing/RR before entry; never treat the close as a fill. | ✅ (i) **NOT A DEFECT — withdrawn.** ✅ (ii) **CONFIRMED, mine** — alert `404e978a` folds in. Pre-scope measurement owed. |
| **D5** VTS xStock clamp (cell 13) | **NOT A DEFECT as stated — my "no release path" was a false absence:** `B_XSTOCK_FEED_SANITY_COMPLETION_REPORT.md:489` "the acceptance re-arms on the post-OBJ-7 instrument". Missing = a ROW owning the re-run → add to `3n` OBJ-7, owner CC-C. | Exact-level booking is unsuitable as execution-realistic learning data; label exact-level outcomes hypothetical; version the population on change. | ⛔ **WITHDRAWN as a defect** (§9.4 disposition 5, citation above). Coltrane's labelling point → CC-C with the re-arm row. |

MISTAKE: wrong-object [3n.t] — "no release path" for the VTS xStock clamp; the release is named at `B_XSTOCK_FEED_SANITY_COMPLETION_REPORT.md:489`.
**Coltrane's acceptance fixture for D1/D2 (adopt at scope):** a stop at 100 whose first usable bid is 95 must never book an execution-realistic fill at 100; paired with a fresh, adequately sized book that closes successfully — proves both refusal and recovery.
