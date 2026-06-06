# B.5 W2.0a — geometry-sweep results + a methodology pivot needing your sign-off

**For:** Langston. **2026-06-06.** Read-only diagnostic; nothing seeded/committed to production. Script: `scripts/b5-w2a-geometry-sweep.ts` (committed for review). **No gdrive: use `ssh staging` to re-run if you want — `su - deploy -c 'cd /home/deploy/dawntrader && set -a && source .env && set +a && npx tsx scripts/b5-w2a-geometry-sweep.ts'`.**

## First, the b73 confirm you asked for (W2.1 Step-8)
`b73_max_hold_ms` is intentional + out of W2.1 scope and NOT a defect: it's a SEPARATE B73-ablation-replay config consumed at `exit-strategy-replay-service.ts:104` (`maxHoldMs: toNum(rows.b73_max_hold_ms)`), already in milliseconds (already correct), unrelated to the per-strategy hold W2.1 unified. We're clean.

## The W2.0a structural finding (this is the headline, and it changes things)
Your hard parity gate (Mode A = reconstruct each strategy's baseline stop from OHLC at its current params, require ≥95% match to the recorded `originalStopPrice`) **FAILED for every strategy**: vwap_pullback 59.6%, vwap_bounce 30.2%, sma_trend_ride 48.8%, morning_star 81.6%, pivot_shift 74.5%, range_trade 61.5%. **The gate did its job — and the cause is structural, not a coding bug:** the anchors the engine used to place each stop (the live VWAP value, `detectRange` boundaries, the pattern-recognizer's parent-candle low, ATR-at-decision-minute) are **NOT persisted on the trade and cannot be re-derived from OHLC to 0.5%.** Related data facts I verified: `signal_eval_archive` stores **no geometry** (only scoring metadata); `paper_sim_trades` is **empty**; the realized trades + the HCE-reliable `originalStopPrice` live only in `logs/virtual_trades/*.json`.

**So OHLC-faithful geometry reconstruction is not feasible with today's data.** Two consequences:
1. **The W2.0a parity gate as specified blocks every sweep.** To get a trustworthy answer I pivoted to **Mode B**: anchor the sweep on the recorded `originalStopPrice` (which IS the engine's true baseline stop — HCE-verified, 3 corrupt of 22,810), and sweep stop distance + target as multiples of the *recorded* risk (entry − recordedStop). This has parity **by construction** (we use the engine's actual entry+stop, not an approximation) and still answers W2.0a's real question — "on the exact entries the strategy fired, would tighter/wider stops or a different target-R have done better?" — without needing the unreconstructable anchor. **This is a methodology change from what you ACK'd; I want your call on it (below).**
2. **New instrumentation item (durable fix):** persist the geometry anchors (vwap / range boundaries / structural low / ATR-at-decision) onto the VTS trade record going forward, so future calibration CAN do OHLC-faithful reconstruction. Candidate RUNNING_ISSUES entry + a small Phase-19 instrumentation batch.

## Mode-B results (gap-robust hit-ordering walk — thin xStock tokens have 1–5 bars/hr; a naive contiguous-minute walk gave spurious ~0 win-rates, fixed)
| strategy | N | baseline R | sweep verdict |
|---|---|---|---|
| **vwap_bounce** | 103 | **+0.117** | **the one bright spot — stop_risk_mult 0.75 → train R +0.190 / TEST R +0.125 (generalizes); modest N** |
| vwap_pullback | 591 | −0.147 | tighter stops lift win-rate but TEST R −0.27..−0.32 → no generalizing edge |
| sma_trend_ride | 251 | −0.235 | train improves at tight stops, TEST collapses −0.45..−0.66 → no |
| morning_star | 560 | −0.214 | negative across grid train+test → no |
| pivot_shift | 83 | −0.229 | noisy, train/test disagree → no |
| mean_reversion | 4 | — | INCONCLUSIVE (< 40-trade floor) |
| range_trade | 24 | — | INCONCLUSIVE (< 40-trade floor; expected per #201) |
| breakout, inside_bar_reversal | 0 | — | NEVER fired on xStock (all candidates rejected at strategy_internal) |

**Bottom line:** re-tuning post-entry geometry yields essentially nothing that generalizes, EXCEPT a modest vwap_bounce tighter-stop. This is exactly the HCE thesis at the geometry level — within already-admitted trades there's no free lunch from stop/target placement; the lever is selectivity/admission.

## My asks (your review of this analysis chunk)
1. **Mode B acceptable?** Is anchoring the sweep on the recorded reliable stop a valid substitute for the OHLC-reconstruction parity gate — or do you want the anchor-persistence instrumentation built FIRST and the geometry sweep re-run with true OHLC reconstruction before we trust any of this?
2. **vwap_bounce candidate:** N=103, generalizes on a 70/30 split. Pre-register it for a W2.2 forward look, or is it within multiple-comparisons noise (5 strategies × 2 knobs) and we hold?
3. **Does the W2.2 geometry pass collapse?** Given geometry re-tuning is ~null except vwap_bounce, does W2.2's geometry seeding become "keep baseline for all, INCONCLUSIVE-by-default, pre-register vwap_bounce only" — and do we re-weight the per-strategy effort toward the entry-trigger sweep (W2.0b) and away from geometry?
4. **breakout + inside_bar never firing on xStock** — surface as its own finding (these two enabled strategies produce zero xStock entries). Separate investigation, or expected and we note it?
