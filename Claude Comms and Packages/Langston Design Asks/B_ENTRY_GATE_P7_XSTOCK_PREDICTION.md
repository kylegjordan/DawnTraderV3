# B-ENTRY-GATE (#1224) P7 — the xStock promotion price-age seed: a NAMED prediction, written BEFORE its week

> Langston, r12 Q-4 (msg 1567937981027852422): *"Pre-register the seed as a named prediction — before the week, say which symbols you expect the xStock ceiling to refuse and which it will not. Otherwise a week of data confirms whatever value you pick."* KD-34 makes the value our technical call, settled with Langston.
> **Written 2026-11-05 ~17:20Z, before increment B is deployed.** The week starts when increment B's `last_priced_at` / `consecutive_unpriced_passes` columns go live; until then xStock has NO `promotion_price_max_age_ms` row (the gate is off for xStock and says so).

## The object
A refresh pass is **priced** for a row when `readRetirementAsk` returns an admissible ask (the exit's own contract). Anything else is **unpriced** (`xstock_stale`, `xstock_implausible_spread`, `xstock_cold_mark`, `xstock_ask_qty_absent`, `ask_expired`, …). The row columns (`last_priced_at`, `consecutive_unpriced_passes`) hold only the latest state, so the week is read from the instrument built for it: one `[B-ENTRY-GATE][P7][PRICED_SHARE_HOUR]` line per class per UTC hour, listing `SYMBOL=priced/unpriced` for every queued row's passes in that hour (increment B, local commit "per-symbol priced share emitted hourly"). The seed decision reads, per symbol and per UTC hour, the share of passes that were priced. Residual: the hour in progress at a restart is not emitted.

## The baseline it is written against (class level only — the refresh logs no per-symbol price outcome today)
`[B-RTB-REFRESH-LIVE-PRICE][PASS] mode=paper` lines, summed. The eight largest buckets per file; smaller buckets were not summed, so each share is approximate to well under 1 %.

| window (UTC) | priced passes | unpriced passes | priced share |
|---|---|---|---|
| 2026-11-04 20:56 → 11-05 00:00 (US after-hours into night) | ~5,975 | ~11,294 (stale 8,053 · implausible spread 2,472 · cold mark 748 · ask expired 21) | **~35 %** |
| 2026-11-05 00:00 → 08:01 (night / Asia / pre-Europe) | ~4,961 | ~21,958 (stale 14,017 · implausible spread 4,849 · cold mark 2,968 · ask qty absent 100 · ask expired 24) | **~18 %** |
| 2026-11-05 15:59 → ~17:15 (US regular session) | ~2,898 | 3 (stale) | **~99.9 %** |

## The predictions (each one can fail)
1. **Hour shape.** During the US regular session (13:30–20:00Z, Mon–Fri, non-holiday) at least **95 %** of xStock passes are priced. Between 21:00Z and 08:00Z at most **40 %** are priced. **Fails if** either bound is missed on the week's own record.
2. **Symbols — the ones a 300 s ceiling will mostly let through overnight:** AMZN, MSFT, META, AVGO, NFLX, COST, PLTR, MSTR, COIN, MU. **Prediction:** each has **≥ 50 %** of its 21:00–08:00Z passes priced.
3. **Symbols — the ones it will mostly refuse overnight:** KMB, PPL, DUK, EXC, FE, ESS, CBOE, BALL, ROP, KDP, PPLT, EWQ, A, T. **Prediction:** each has **≤ 20 %** of its 21:00–08:00Z passes priced.
4. **Separation.** The median overnight priced share of group 2 exceeds group 3's by **at least 20 percentage points.** **If it does not, the symbol story is wrong**, and the seed is set from the class-level hour shape alone (one value for the class), not from any symbol list.
5. **Session.** In session, **no** symbol in either group falls below 90 % priced.
(Symbols with fewer than 20 overnight passes in the week are reported UNDERPOWERED, not scored.)

## What the outcome decides (the decision is taken AFTER the week, on these predictions)
- **1 and 5 hold:** seed `xstock_spot` at the crypto value, **300000 ms** (one 120 s macro cycle plus one missed pass and skew). The ceiling then works in session and effectively stops overnight promotion of thin names. That is the intended effect: no promotion on economics from a quote the exit itself would not act on.
- **2–4 also hold:** the overnight refusals land on thin names, and that is stated in the seed's record as the expected cost.
- **Any of 1–5 fails:** the seed goes back to Langston with the record before any row is written. No value is chosen to fit the week afterwards.

Owner CC-B. The read is by hand, from the week's `rtb_signals` record plus the P6/P7 log lines. Carrier: a dated alert minted at increment B's deploy for deploy + 7 days.
