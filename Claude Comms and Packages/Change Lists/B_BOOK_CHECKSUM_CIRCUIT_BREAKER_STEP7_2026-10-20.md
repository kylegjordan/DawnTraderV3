# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — STEP 7 FIRST-PASS VERIFICATION (`#1220`)

**Deployed:** `725a7f3f53bbc1758dfbf73090d2e6681147c015` by `dt-deploy --by cc-b`, 2026-10-20T21:50:37Z — "live, engine resumed, identity asserted"; `dist/BUILD_SHA` on the box reads the same sha. Previous good sha (rollback target): `7501f4f55f95c2c386be0784ec39f01dbf4c8ac7` (deployed 2026-10-18T05:33:52Z).
**CI:** run `39503085325` on `725a7f3f5`, per job — TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success.
**App code in the deployed range** `7501f4f55..725a7f3f5`: only this batch's 20 files (`git diff --name-only` over `server client shared drizzle package*.json`); everything else in the range is governance.

## What was read, with object and population

| # | check | instrument | result |
|---|---|---|---|
| 1 | the precision feed still arrives, once per open | `out.log` after 21:50:2x | `[8.9.0-B][WS] Sub OK: instrument (all pairs)` then `[#507][INSTRUMENT] absorbed precision for 1461 pairs` at 21:50:33 |
| 2 | the checksum still matches on every live book (non-regression) | `GET /api/active-engine/book-integrity` at uptime 120 s | attempts 1,080 = matches 1,080 · mismatches 0 · crossed 0 · skippedNoPrecision 0 · trust `{trusted: 3, suspect: 0, untrusted: 0}` · resyncsSent / confirmedUntrusted / framesIgnoredUntrusted / subscribeRejected / bookUnsubRejected / precisionRefused / precisionTransportFailures all 0. **Positive control:** matches = attempts on all 3 symbols, so the branch ran and the zeros are readable |
| 3 | no book is withheld from a symbol that should have one | `out.log` for the subscribe payloads; **`error.log` for `[#1220][BOOK_SUB_WITHHELD]`** (it is `console.warn`, so stderr — corrected at Step 8: my first read of it was off `out.log`, which cannot carry the line; Langston's positive control: `error.log` carries a `#1220` warn) | book subscribes 3 = ticker subscribes 3 (GLMR/USD req_id 1 at 21:50:36; BEAM/USD and CVX/USD req_id 2-3 at 21:51:33); `BOOK_SUB_WITHHELD` 0 in `error.log`. At Langston's later read the book and ticker SETS were identical, 7 symbols, one subscribe each |
| 4 | the new refusal value is wired into the funnel and reads zero | `GET /api/xstocks/filter-diagnostics` | `book_untrusted` present in the 5 `book` rungs and `ticker_from_untrusted_book` in the 5 `ladder` rungs — each where it is meaningful — all 0 |
| 5 | the open crypto trade still prices from the live book | `GET /api/active-engine/active-trades` + **Claude-in-Chrome, Paper Trading → Open Trades** | GLMR/USD `priceSource kraken_ws`, `sourceLabel WS`, age 334 ms; the rendered row shows **WS** in the Source column (screenshot captured 21:53Z) |
| 6 | the Crypto Filter Diagnostics tab renders after the deploy | Claude-in-Chrome | scanner, pipeline summary, RR gate, SQE and RTB tables all render with values |
| 7 | the judgement-6 key check ran | **`error.log`** (with `disagree > 0` the line is `console.warn`) + the counters | `[#1220][SYMBOL_KEY_AGREEMENT] pairs=1366 disagree=39` at 21:50:33 — see below |
| 8 | new errors from this batch | `error.log` | no `[#1220]` error and no new TypeError after 21:50 (the recurring `federated_ethics_sync` TypeError predates the deploy, every 2 h since at least 15:33Z) |

## The 39 key disagreements — read in full, none is a traded pair
Reproduced locally against live `AssetPairs` (the same check, every mapped pair): **39 = 31 BTC-quoted pairs** (`AAVE/XBT` handler vs `AAVE/BTC` reader, …) **+ 6 DOGE pairs quoted in AUD/CAD/EUR/GBP/USDC/USDT** (`XDG/…` vs `DOGE/…`) **+ 2 Swiss-franc pairs** (`ZCHF/CHF`, `ZCHF/USD`). `BTC/USD` and `DOGE/USD` agree. None of the 39 is in the live book population (counter symbols: none spelled `XBT`, `XDG` or `ZCHF`).
**The 39 are REAL (Langston, Step 8, traced).** The live subscribe sends `krakenWsPair` (`normalToKrakenSymbol` → `toKrakenWS`), Kraken echoes that spelling, and the frame path maps it with `mapKrakenPairToInternalSymbol` — so the check's input IS the live handler input. `REVERSE_ASSET_TRANSLATIONS` holds only `XBT → BTC`, applied to the BASE only, so BTC-quoted pairs keep `XBT` as the quote; `XDG` and `ZCHF` are not in the table. Fail-safe today: none is subscribed, and the failure mode is a MISSING book (the reader falls to the ticker rung), never a wrong price. ~~My suggestion that the check might be measuring its own input~~ was wrong. Surfaced to Kyle as `#1229`.

## Not verifiable at Step 7, by construction (FINDING-2, recorded on `#1220`)
The breaker's acting half (suspect → resync → untrusted, the re-check) has never fired live — Langston's read before this deploy: 19,507,455 checks, 0 mismatches, 71 symbols. No silence may be cited for it; it is fence-verified only. Plan 1 (one socket) shows only on a reconnect: no `CONNECT_REFUSED` line is expected until one happens.

## Warm state the restart wiped
The book-integrity counters restarted at 21:50:27Z (population 3, growing as symbols are subscribed); the in-memory rolling windows (AMR EV-gap, 24 h scan aggregates) restarted cold. The paper page's realized balance read $820.00 after the restart against $818.96 before — the known restart snap-back owned by CC-C's `B-BALANCE-SESSION-PAIRING`, which Kyle queued behind this list; this batch does not touch it.

## Step 8 — Langston CONFIRMED on the pre-registration (2026-10-20, ~22:20Z)
Re-derived by him at a 53.6× larger population (uptime 1,531 s, 7 symbols): 57,867 attempts = 57,867 matches, enumerated per symbol; mismatches 0, crossed 0, skippedNoPrecision 0, trust `{trusted 7}`, every new counter 0; book and ticker subscribe SETS identical; plan 1 unexercised (one `WebSocket connected` since the deploy, no reconnect), as pre-registered. The acting half stays fence-verified only.
**Named prediction (disposition 1, Langston):** before the deploy GLMR/USD took 36 book re-subscribes at ~5 s intervals (21:28:33 → 21:49:29); after it, one subscribe per symbol with zero repeats. **If GLMR-shaped repeats reappear, plan 1 did not hold.** A forward read, not a claimed fix — the window was 25 minutes.
