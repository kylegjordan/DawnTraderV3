# Pricing machinery and mode isolation — FINDINGS for Kyle (2026-11-05, CC-A)

> Kyle's ask (via PM Claude, 2026-11-05 ~11:25Z): the intended design is ONE pricing machinery that each mode (VTS, paper, live) calls separately. Before anything is placed, a provenance investigation of the two suspected cross-mode items (the single watch-list slot; the symbol-only trailing lookup). **Findings, not a fix.** Code read at `origin/migration/aws-supabase` (`11a5f1fe0`).
> `REVIEWER: object handed (a read-only helper agent, fresh context) · "do A and B cross modes, and does the code match the design" · two hits + one new hit · re-derived y (B and the new hit by me at the lines, with log and database controls; A's lines spot-checked)`

## Short answer
**Market data is shared correctly; four pieces of SHARED MUTABLE state are not keyed by mode.** None can cross paper↔live today, because only ONE trading engine ever runs (paper: `active-engine-service.ts` `const mode = 'paper'` at every construction site; live would go through the switched-off `TradingEngine`, `#578`, sprint row 79). One of them **can cross VTS → paper today** in code, and has never actually fired.

## (A) The watch-list slot for open positions
- **Code:** the Kraken websocket adapter holds ONE provider slot (`kraken-websocket-adapter.ts:464`); `setI8COpenPositionsProvider` (`:3252-3253`) overwrites it — last caller wins. It drives the startup subscribe, the reconnect resubscribe (after `subscribedSymbols.clear()`, `:775-776`), the 5-second audit and a health diagnostic. One setter: `active-execution-engine.ts:1329`, returning only that engine's mode's crypto positions.
- **Also unkeyed:** closing a position unsubscribes its symbol for EVERY consumer (`active-execution-engine.ts:5091`), and `livePricingAdapter.setTradingMode(this.mode)` (`:1308`) is one slot (a label on price broadcasts).
- **Provenance:** `828c676bc` (2025-12-09, Replit, "Improve WebSocket subscription reliability") — no mode intent. The design rule it misses is written in the System Impact Map (`:73`): paper and live run at the same time in Phase 21, so shared mutable state must be market data or keyed by mode. No registry row covers this slot.
- **Verdict:** crosses modes **once a live engine runs** (second start overwrites; after a reconnect only one mode's symbols come back; a paper close can cut a live feed). Not today.

## (B) The trailing-exit database sync
- **Code:** the trailing DECISION is per trade (`trailingStates` keyed by `tradeId`, `trailing-exit-controller.ts:1298`, B80). Only the database sync matches by symbol: `syncTradeModeToStorage(symbol, …)` (`:661-679`) stamps `tradeMode` on the FIRST paper row with that symbol and the first "live" row (today the same table, mode ignored). It runs when a trade's mode changes (`:1309`).
- **Callers of the trailing controller include the VTS** (`vts-runner.ts:4010`, `:4805`, `callerMode: 'vts'`, `useTrailing: true`) as well as the paper engine (`active-execution-engine.ts:3794`).
- **Provenance:** `37041af27` (2026-01-01, "adaptive trailing exit strategy with persistence"), before the B80 per-trade re-key, which left the sync matching by symbol.
- **Verdict, two halves:**
  1. **Paper ↔ live:** crosses **once a live engine runs**.
  2. ⚠️ **VTS → paper: possible TODAY in code.** A VTS trade entering moonbag (trailing take) on a symbol where a paper position is open would stamp that PAPER position `TRAILING_TAKE`; the paper engine reads it back on its target-exit fill path (`active-execution-engine.ts:3331`, `:3350`, `:3377-3380`: a maker-only target exit refused, a maker-preferred one taking the taker path) and on restart rehydrate (`:3725`).
- **Has it ever fired? No — measured (CC-A):** across every retained app log (15 files, 2026-11-04 03:31Z → now), `[9.2][MODE]` appears 207 times (control: the trailing controller logs) and `[9.2][MODE_SYNC]` **0** times; the sampled `[9.2][MODE]` lines are all `moonbag denied: strategy-not-qualified`, so no trade entered moonbag. In the database, **all 19 open positions and all 1,573 closed paper trades carry `trade_mode='TARGET'`** — no paper row has ever been stamped by any trailing sync. ⇒ **a real defect, dormant: it fires the first time a strategy qualifies for moonbag while paper holds the same symbol.**

## Does the code match "one pricing machinery, called separately per mode"?
Partly. The market data (books, trust maps, prices) is shared and mode-free as intended (System Impact Map `:77`, row S29); VTS and paper trailing state is per trade. Mode is NOT part of the key in four places: the watch-list provider slot, the broadcast mode label, the unsubscribe on close, and the trailing database sync. The pricing data architecture document already records that live has no price path of its own (`PRICING_DATA_ARCHITECTURE.md:263-267`) — which is why these slots have never had a second consumer to fail against.

## Not established
- Whether any strategy is configured to qualify for moonbag in the near term (today: none observed qualifying).
- How VTS crypto prices are restored after a websocket reconnect (no `vts-runner` subscribe caller found; if VTS relies on symbols the RTB queue subscribed, a reconnect restores only the provider's set) — HYPOTHESIS, cross-lane rather than cross-mode.
- Whether the Phase-21 live build reuses this engine.

## Proposed homes (Kyle to accept or slot — nothing placed)
- **(A), the unsubscribe-on-close, the mode-label slot, and (B)'s paper↔live half:** one item in the Phase-21 live-mode work.
- **(B)'s VTS → paper write:** proposed to FOLD into `B-CLOSE-WRITER-COSTS` (already agreed; its KD-24 is "a position in one mode has no effect on another"): the sync keyed by `tradeId` and restricted to the caller's own position (a VTS trade never writes a paper row). Small, and it closes the only path that can bite before live.
