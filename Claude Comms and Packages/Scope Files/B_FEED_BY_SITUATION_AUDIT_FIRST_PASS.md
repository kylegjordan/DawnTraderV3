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
6. Crypto close with no bids: books midpoint minus a penalty (`CLOSE_COLD_BOOK`), or midpoint with zero slippage if depth config missing.
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
