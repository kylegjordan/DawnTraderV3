# B-PRICE-FEED-TRUTH — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN — increment I3 (`#1047`), r1

Batch scope r2 (Langston 12:10Z: I3 proceeds, first, with its own commit and fence). Code at `origin/migration/aws-supabase` `0e1defc95`; staging logs 2026-10-07. Later increments (I2, I1, I4) get their own sections here.

## Previously stated vs now
**PREVIOUSLY STATED (`#1047`, 2026-09-11): ~11 dropped messages a day; the throwing site was a candidate list. NOW: 2 on 10-06 and 4 on 10-07 (to 11:58Z), every one in `handleV2SystemMessage` — the subscribe ACK of the `instrument` channel, which carries no `symbol`. REASON: the stack traces in today's `error.log` name the frame; the count tracks WebSocket reconnects (4 `code=1006` closes in today's `out.log`), one throw per reconnect.**

## The audit
- **A1 — the throwing message, from the logs.** Each error's stack: `mapKrakenPairToInternal` (`kraken-symbol-resolver.ts:193`, `wsPair.toUpperCase()`) ← the adapter's `mapKrakenPairToInternalSymbol` (`kraken-websocket-adapter.ts:1778`) ← `handleV2SystemMessage` (`:774`) ← `handleMessage`. At 09:30:33Z the raw frame is `{"method":"subscribe","result":{"channel":"instrument","snapshot":true,"warnings":["tick_size is deprecated, use price_increment"]},"success":true,…}` — sent on reconnect alongside ticker/book (`:1566-1571`, *"one subscription, no symbol list, covers every pair"*). `:779-780` takes `result.symbol` (undefined) straight into the lookup.
- **A2 — what is lost: nothing priced.** The throw drops only that ACK (one message, caught at `:713-715`). The instrument SNAPSHOT is a separate frame and is absorbed (`[#507][INSTRUMENT] absorbed precision for 1458 pairs`, same second). The ticker and book acks carry a symbol each and are unaffected. So `#1047`'s open question — did dropped messages carry a price — is answered: no.
- **A3 — census of the lookup's call sites** (`kraken-websocket-adapter.ts`, tests excluded): `:729`, `:748` (legacy v1 `pair`), `:780` (subscribe ack), `:834` (ticker, behind `isValidV2TickerUpdate`), `:1013` (`pr?.symbol`, instrument data), `:1038` (book update, no validation guard), `:1271`. Every one passes through the single wrapper at `:1778`; the resolver's `mapKrakenPairToInternal` has other callers outside the adapter (I2's census).
- **A4 — the vendor note (no work).** Kraken's ACK warns *"tick_size is deprecated, use price_increment"* on the WS `instrument` channel. The VPG's tick basis is the REST `AssetPairs` `tick_size` (`kraken-asset-pairs-service.ts:396`, `venue-grid-resolver.ts`), and REST still serves `tick_size` with no `price_increment` (checked 2026-10-07 for XBTUSD / ETHUSD: `0.1` / `0.01`). Recorded on `#1047` as a watch item; the VPG refuses a crypto price with no tick, so a REST deprecation would surface as refusals, not silently.
- **A5 — provenance.** The instrument subscription is `#507`'s remainder (the precision absorber); the ACK branch at `:777-797` predates it (8.9.0-B) and was written for per-symbol acks only. Disposition (2): correct then, needs updating for a symbol-less ack.

## The plan
| # | item | from |
|---|---|---|
| P1 | The adapter's `mapKrakenPairToInternalSymbol` (`:1778`) returns `null` for a non-string or empty input instead of calling the resolver — one guard covering all seven call sites (they already handle `null`: `:782-797` logs "unmapped"). | A1, A3 |
| P2 | `handleV2SystemMessage`'s subscribe branch handles a symbol-less ACK by channel: `instrument` logs `Sub OK: instrument (all pairs)` and touches no per-symbol state; any other symbol-less ACK logs its channel once as a warning. | A1, A5 |
| P3 | The catch at `:713-715` logs the first 300 characters of the message that threw, so the next unknown shape names itself. | A1 |
| P4 | Tests: the instrument ACK frame from A1 no longer throws and adds nothing to `subscribedSymbols`; a ticker ACK with a symbol still records its ack (control); the wrapper returns `null` for `undefined`, `''`, `123`. Mutation: remove P1's guard → the instrument-ACK test throws. | A1, A3 |
| P5 | Step 7: `Error parsing message` reads 0 across a window that contains at least one reconnect (`WebSocket closed: code=1006` ≥ 1 — the positive control), and `Sub OK: instrument` appears once per reconnect. | A1 |

`#1047` closes with this increment. A4 is recorded on the issue, not built.
