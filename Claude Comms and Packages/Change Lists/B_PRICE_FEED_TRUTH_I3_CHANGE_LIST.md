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

## Step 7 result — PASS (2026-10-15, CC-C first pass)

**Object and population.** Fixed window `2026-10-14T03:58:39Z` through `2026-10-15T05:32:10Z`, wholly after the I3 deploy (`2026-10-10T11:59:18Z`) and wholly inside the retained stdout span. Across every retained stdout file intersecting that window, the exact positive-control line `Sub OK: instrument (all pairs)` occurs **21 times**. Across every stderr archive intersecting the same window, `[KrakenWS] Error parsing message` occurs **0 times**.

**Positive control for the zero.** The identical stderr instrument finds **6** pre-deploy failures on 2026-10-10 (`01:11:06Z` through `10:33:16Z`), all the original `undefined.toUpperCase` failure. This proves the absence check is reading the stream and phrase that held the defect rather than a silent or wrong source.

**Verdict.** I3's P5/C2 threshold was at least 8 instrument acknowledgements in one window with zero parse failures; the measured population is 21/21 acknowledgements and 0 failures, so increment I3 passes Step 7. There is no UI surface: this increment changes Kraken WebSocket acknowledgement handling only. The parent `B-PRICE-FEED-TRUTH` batch remains at Step 7 because I1 has a separate pre-registered gate.

`REVIEWER: Coltrane independently reproduced exactly 21 post-deploy acknowledgements, zero matching post-deploy parse failures, and all six pre-deploy positive-control failures at exact ref 24f24f3f2d3601c1600b216fb7e921e615ffa354; APPROVED 2026-10-15T05:59:12Z.`
