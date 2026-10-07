# B-PRICE-FEED-TRUTH increment I3 (#1047) — change list (Step 4)

| # | field | value |
|---|---|---|
| i | change-class | `architecture` (the batch; scope r2 header) |
| ii | doc set | scope r2 present · pre-audit + plan present (`B_PRICE_FEED_TRUTH_PRE_AUDIT.md`, I3 section, Langston PROCEED 12:29Z) · running_issues present (`#1047`) · SIM `:321` content line and SYSTEM_MANUAL judged at Step 10 (architecture class: both required for the batch; I3's own content is the adapter's ACK handling) · completion report at batch close |
| iii | Step 2 | `B_PRICE_FEED_TRUTH_PRE_AUDIT.md` (I3) |

## The change — `server/exchanges/kraken/kraken-websocket-adapter.ts` (+31 −1)
- **P2:** `handleV2SystemMessage`'s subscribe branch handles a symbol-less ACK first: `instrument` → `Sub OK: instrument (all pairs)`, no per-symbol state; any other channel → one warning naming it. Returns before the lookup.
- **P1:** `mapKrakenPairToInternalSymbol` refuses a non-string or empty pair before the resolver; counted by kind in a new `badPairInputs` map; the first of each kind logged.
- **P3b:** the book path's null branch is counted in `unmappedTicks` under `book:<pair>`.
- **P3:** the catch logs `raw=` the first 300 characters of the message that threw.

## Tests — `server/tests/unit/b-price-feed-truth-i3-ws-ack.test.ts` (5)
1 the staging instrument ACK frame (2026-10-07T09:30:33Z) produces no parse error and no per-symbol state · 2 control: a ticker ACK with a symbol records its ack · 3 another symbol-less ACK is named by channel · 4 the wrapper returns null for undefined / '' / 123, counts by kind, logs once per kind · 5 a book update with no symbol is counted as `book:undefined`.
**Mutation (run):** with the old adapter restored, tests 1, 3, 4, 5 fail and the control passes. All 14 test files touching the adapter: 147 / 147. `tsc` 337 = 337.

## Step 7 reading (P5)
`[KrakenWS] Error parsing message` = 0 in `error.log` over a window containing ≥ 1 `Sub OK: instrument (all pairs)` in `out.log`, the window inside `out.log`'s retained span.
