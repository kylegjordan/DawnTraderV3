# ENTRY GATE — FEED, RATE-LIMIT AND SIGNAL-PROVENANCE AUDIT (Kyle-ordered, 2026-10-20)

**For:** Kyle, Langston, Coltrane · **By:** CC-B, from three fresh-reader audits at `082a92bb1` (code) and on staging (logs, DB, live counters; select-only) · **Companion:** `B_ENTRY_GATE_DESIGN_r1.md`
**Re-derived by CC-B (★):** the crypto signal-birth age histogram; the 78,824 `Exceeded msg rate` lines; the 10 `response: 429` handshakes; the forming-bar semantics (`ohlc-aggregator.ts:22-25`, `strategy-engine.ts:361-364`). Everything else is the readers' measurement, marked as they marked it.

## 1. Signal provenance — bars versus one price
- **Every strategy DETECTS from bars** (60-minute crypto bars, up to 720; 15-minute xStock bars, up to 240): VWAP, SMA20, ATR(14), ranges, swing/structure points, candle patterns, Donchian channels (`market-context-engine.ts:1256-1260, 1751-1805`; per strategy in `strategy-engine.ts` and `server/strategies/`).
- **The plan's levels:** 12 of 19 strategies anchor ENTRY on a single "now" price P (× ~1.001) and set stop/target a bar-derived distance away (ATR multiple, VWAP, support, pattern low). Four anchor entry on a bar-derived structure level (ABCD, breakout, inside_bar_reversal, volatility_edge). range_trading, strong_bull_trend and the crypto pattern path anchor on the forming bar's close.
- **P is:** crypto — the price-cache bid/ask midpoint through an adaptive smoother (`signal-orchestrator.ts:2443-2490`; Directive 9.3: "Suppress false signals during 'chop' regimes"); xStock — the close of the still-forming 15-minute bar ★ (`ohlc-aggregator.ts:22-25` "emits the in-progress bar"), i.e. the last trade, which on a thin xStock can be tens of minutes old.
- **Intent (original spec attached 2025-10-02):** analysis on bars, pricing from the live price ("Buy near VWAP after confirmation"; ABCD "Buy stop above C-range high"; canonical flow doc: "All pricing from unified Price Cache"). Never written down: that the plan levels rest on that one smoothed / forming price.
- **Findings needing Kyle's disposition:** (a) defensive_hedge is passed `undefined` BTC bars in the active crypto lane (`signal-orchestrator.ts:3142`), so it can never fire there (`defensive-hedge.ts:139-141`); (b) DHMA subtracts a fractional volatility from a price (`strategy-engine.ts:1547-1549, 1783-1794`; flagged by `Codex Audits/astra-independent/REPORT.md:118-120` and Batch 54, never homed); (c) "high24h/low24h" is the last 24 bars = 6 h on xStock; (d) a volume check compares 24 h ticker volume to a one-bar average (`:216-220`; whether enabled not read). Doc fixes: System Manual `:12672` and the canonical doc `:295` still say xStock is 60-minute; `xstock-scanner.ts:913-916` comment is false.

## 2. Feed coverage — % of what REACHES each checkpoint that a freshness limit would admit
Window Mon 2026-10-19 13:30Z → Tue 13:30Z; RTH = 13:30-20:00Z on 10-19. Base = evaluations (or symbols) that reached the checkpoint.

| checkpoint × class | ≤2 s | ≤5 s | ≤10 s | ≤15 s | ≤30 s | ≤60 s |
|---|---|---|---|---|---|---|
| **Crypto signal birth / SQE** ★ (313,868 evals since 10-18 05:33Z, not splittable) | 10.9 % | 18.3 % | 29.9 % | 42.2 % | 63.2 % | ~99.9 % |
| Crypto RTB refresh, RTH (945) / OFF (6,016) | 81 / 27 % | ≥54 % | ≥89 % | ≥99.9 % | ≥99.9 % | ≥99.9 % |
| Crypto resting maker (615 touches) | 99.8 % | 100 % | | | | |
| xStock SQE, RTH (127 evals) today → rewired to in-memory tick | ≤47 → 47-95 % | ≤88 → 88-99 % | ≤99 → 99-100 % | 100 % | | |
| xStock RTB refresh, RTH (8,217) / OFF (24,694) | 82 / 10 % | 96 / 13 % | 99.3 / 16 % | 99.5 / 17 % | 99.9 / 20 % | 99.9 / 22 % |
| xStock open, RTH (13 with age) today → rewired | 15 → 40-90 % | 46 → 85-95 % | 77 → 95 % | 92 → 95-100 % | 100 % | |

- **Crypto birth, split by source (Langston's condition; re-read by CC-B ★ at 2026-10-20 ~14:45Z, same counter, since 10-18 05:33Z, n = 316,167 = 17,697 pushed + 298,470 polled):** PUSHED (WS, venue-stamped) ≤1 s 84.5 %, ≤5 s 98.8 %, ≤15 s 100 %; POLLED (REST) ≤2 s 6.1 %, ≤5 s 13.6 %, ≤10 s 25.8 %, ≤15 s 38.9 %, ≤30 s 61.2 %, ≤60 s 99.9 %. WS-covered symbols per 60 s window: 1-42 of 18-249. **The live feed itself is sub-second; the gap is coverage — only 5.6 % of birth evaluations are pushed.**
- **Biggest gap: crypto signal birth.** 82.3 % of evaluations have no WS book; the price-cache lane feeding birth refreshes every 60 s (VTS lane) / 30 s (fx5, empty). No fresher in-process source exists for those symbols (the archiver's crypto WS fires on trades only and nothing in-process reads it). **A 5 s rule at crypto birth today would refuse ~82 % of evaluations on our own feed limits.**
- Where a WS book exists, 66 % have not changed in > 60 s — quiet pair or dead subscription; the instrument cannot tell. "Fresh" must be defined as subscribed + socket alive + book current, not "changed in the last N s", or quiet names are thrown out for being quiet (HYPOTHESIS).
- **Cheapest measured wins:** xStock open + dispatch → read the in-memory equity tick (`getLatestEquityTick`) that refresh, exits and resting makers already use (5 s: 46 % → 85-95 %); crypto birth names → the existing 15 s readyToBuy lane (≥99.9 % within 15 s, ≥54 % within 5 s at refresh).
- Off-hours unpriced shares are mostly quiet markets, not our feeds.

## 3. Kraken rate limits — the record
| date | exceeded | API | cause | in ledger? |
|---|---|---|---|---|
| 2025-10-12 | public REST per-IP (8 × `EGeneral:Too many requests`) | spot REST | Replit-era historic replay test | no decision recorded |
| 2026-07-22 (#559), 2026-08-30/31 (#977) | **nothing from Kraken** — #977: "we are throttling ourselves" (45,218 of 58,236 limiter blocks were our own 60 s cooldown) | spot REST | — | yes |
| **2026-10-13 14:31-14:37** ★ | **WS message rate — 78,824 `Exceeded msg rate` lines** (`error__2026-10-14_00-00-00.log`) | **spot trading WS** | the book-checksum check resubscribes on every mismatch with no throttle (`kraken-websocket-adapter.ts:1173-1177`, armed `3bd9f4022` 2026-08-23); 715,683 mismatches on OOB/USD, S/USD, CAP/USD | **NO — unrecorded, code unchanged** |
| **2026-10-13 14:37-14:40** ★ | **WS connection opens — 10 handshakes refused HTTP 429**, then `Max reconnect attempts reached` (14:40:37 and again 17:14:48) | spot trading WS | the reconnect storm after the drop | **NO** — how long the trading feed stayed down cannot be read: those stdout logs are rotated away |

- **REST, 14 days:** 0 `EAPI:Rate` / `EGeneral:Too many` / lockout lines; positive control `EQuery:Unknown asset pair` (same error path) appears daily. Current REST ≈ 1.2-1.3 req/s (INFERRED from log lines, 11:51-14:09Z today) vs 0.34/s in August; our own limiter's token-exhausted blocks rose to ~4,368 on 10-20 by 14:18Z.
- **Our limits' provenance:** `MAX_WEIGHT_PER_SECOND = 10` (`price-cache.ts:200`) came from a design chat ("Kraken doesn't document the exact formula"); the REST lanes were specified in A4.R10R "to maintain full Kraken API compliance (< 10 weighted req/s)" — design-time caution, not an incident. `SHARD_SIZE = 300` cites a "≤250 per connection" Kraken recommendation no Kraken page states.
- **Published:** REST counter is per API key (private calls); public REST is per IP (~1 call/s guidance, support article); order limits shared across REST/WS/FIX; WS connection opens ~150 / 10 min / IP (Cloudflare). **Unpublished:** the WS message-rate number, any per-connection symbol cap.
- **Reconciliation:** "limits were being exceeded" — false for REST on every record; earlier statements mixed up the public per-IP limit with the account counter. "WS doesn't use the REST counter" — true but incomplete: our price polling is PUBLIC REST and never used the API-key counter either; and **both WS risks happened for real on 2026-10-13, caused by our own unthrottled resubscribe loop.**

## 4. What this means for the design
1. No universal freshness rule can ship before crypto birth coverage is widened — it would discard most crypto candidates on our limits, not on viability. Until then: per-source admission with a stated coverage carve-out (Langston).
2. Widening WS coverage is the fix, but the 2026-10-13 incident shows our WS client can trip Kraken's message-rate and connection limits by itself; the resubscribe throttle comes first, then a staged widening with the message rate measured.
3. "Fresh" needs a definition that does not punish quiet markets.
4. xStock open/dispatch can be fixed now by changing the reader to the in-memory tick.
5. **Unresolved (Langston item 4):** whether the rewired xStock-open cells' modelled age excludes subscribe-replay `snapshot` frames (`observed === true`, `equity-spot-archiver.ts:201-206`); if not, those cells are inflated. The reviewed ladder at `rtb-retirement-ask.ts:58-80` is the template for the xStock reader change, not a bare reader swap.
6. **The 2026-10-13 storm (Langston item 3):** `softResubscribe` (`kraken-websocket-adapter.ts:3737-3769`) has no cooldown or in-flight guard and clears its own dedupe state; the mismatch `continue` (`:1177`) sits above the freshness stamp (`:1193`), so a desynced book reads as a quiet one. The fix is a circuit breaker (after K mismatches: stop resubscribing, mark the book untrusted, fall back to ticker, emit), and `fresh` must read a trust flag, not only an age. Proposed home `B-BOOK-CHECKSUM-CIRCUIT-BREAKER` ahead of any widening — awaiting Kyle's slot.
