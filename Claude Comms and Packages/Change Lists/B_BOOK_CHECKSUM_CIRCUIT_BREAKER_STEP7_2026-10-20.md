# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — STEP 7 FIRST-PASS VERIFICATION (`#1220`)

**Deployed:** `725a7f3f53bbc1758dfbf73090d2e6681147c015` by `dt-deploy --by cc-b`, 2026-10-20T21:50:37Z — "live, engine resumed, identity asserted"; `dist/BUILD_SHA` on the box reads the same sha. Previous good sha (rollback target): `7501f4f55f95c2c386be0784ec39f01dbf4c8ac7` (deployed 2026-10-18T05:33:52Z).
**CI:** run `39503085325` on `725a7f3f5`, per job — TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success.
**App code in the deployed range** `7501f4f55..725a7f3f5`: only this batch's 20 files (`git diff --name-only` over `server client shared drizzle package*.json`); everything else in the range is governance.

## What was read, with object and population

| # | check | instrument | result |
|---|---|---|---|
| 1 | the precision feed still arrives, once per open | `out.log` after 21:50:2x | `[8.9.0-B][WS] Sub OK: instrument (all pairs)` then `[#507][INSTRUMENT] absorbed precision for 1461 pairs` at 21:50:33 |
| 2 | the checksum still matches on every live book (non-regression) | `GET /api/active-engine/book-integrity` at uptime 120 s | attempts 1,080 = matches 1,080 · mismatches 0 · crossed 0 · skippedNoPrecision 0 · trust `{trusted: 3, suspect: 0, untrusted: 0}` · resyncsSent / confirmedUntrusted / framesIgnoredUntrusted / subscribeRejected / bookUnsubRejected / precisionRefused / precisionTransportFailures all 0. **Positive control:** matches = attempts on all 3 symbols, so the branch ran and the zeros are readable |
| 3 | no book is withheld from a symbol that should have one | the same log window | book subscribes 3 = ticker subscribes 3 (GLMR/USD req_id 1 at 21:50:36; BEAM/USD and CVX/USD req_id 2-3 at 21:51:33); `[#1220][BOOK_SUB_WITHHELD]` 0. The 3-symbol population is the normal post-restart set (open position + promotions so far), the same count as the ticker |
| 4 | the new refusal value is wired into the funnel and reads zero | `GET /api/xstocks/filter-diagnostics` | `book_untrusted` and `ticker_from_untrusted_book` present in every `levelBasisFunnel` cell, all 0 |
| 5 | the open crypto trade still prices from the live book | `GET /api/active-engine/active-trades` + **Claude-in-Chrome, Paper Trading → Open Trades** | GLMR/USD `priceSource kraken_ws`, `sourceLabel WS`, age 334 ms; the rendered row shows **WS** in the Source column (screenshot captured 21:53Z) |
| 6 | the Crypto Filter Diagnostics tab renders after the deploy | Claude-in-Chrome | scanner, pipeline summary, RR gate, SQE and RTB tables all render with values |
| 7 | the judgement-6 key check ran | `out.log` + the counters | `[#1220][SYMBOL_KEY_AGREEMENT] pairs=1366 disagree=39` at 21:50:33 — see below |
| 8 | new errors from this batch | `error.log` | no `[#1220]` error and no new TypeError after 21:50 (the recurring `federated_ethics_sync` TypeError predates the deploy, every 2 h since at least 15:33Z) |

## The 39 key disagreements — read in full, none is a traded pair
Reproduced locally against live `AssetPairs` (the same check, every mapped pair): **39 = 31 BTC-quoted pairs** (`AAVE/XBT` handler vs `AAVE/BTC` reader, …) **+ 6 DOGE pairs quoted in AUD/CAD/EUR/GBP/USDC/USDT** (`XDG/…` vs `DOGE/…`) **+ 2 Swiss-franc pairs** (`ZCHF/CHF`, `ZCHF/USD`). `BTC/USD` and `DOGE/USD` agree. None of the 39 is in the live book population (counter symbols: none spelled `XBT`, `XDG` or `ZCHF`).
⚠️ **The check feeds REST's `wsname` (v1 spelling, e.g. `XDG/USDT`) into the handler's mapper**; the v2 socket sends v2 names (`DOGE/…`, `BTC/…`). So these 39 may be partly an artifact of the check's input rather than a live namespace split. Recorded for Step 8, not a defect claim.

## Not verifiable at Step 7, by construction (FINDING-2, recorded on `#1220`)
The breaker's acting half (suspect → resync → untrusted, the re-check) has never fired live — Langston's read before this deploy: 19,507,455 checks, 0 mismatches, 71 symbols. No silence may be cited for it; it is fence-verified only. Plan 1 (one socket) shows only on a reconnect: no `CONNECT_REFUSED` line is expected until one happens.

## Warm state the restart wiped
The book-integrity counters restarted at 21:50:27Z (population 3, growing as symbols are subscribed); the in-memory rolling windows (AMR EV-gap, 24 h scan aggregates) restarted cold. The paper page's realized balance read $820.00 after the restart against $818.96 before — the known restart snap-back owned by CC-C's `B-BALANCE-SESSION-PAIRING`, which Kyle queued behind this list; this batch does not touch it.
