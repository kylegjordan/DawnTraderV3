# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · **Issue:** `#1220` · **Scope:** r6 `14bce26b5`, APPROVED (Langston) · **Owner:** CC-B
*Read at `origin/migration/aws-supabase` `14bce26b5` by two fresh readers plus CC-B's own re-reads (★).*
*Langston's approval carried two items:*
- *(1) the crossed-book detector sits below the checksum `continue`;*
- *(2) `:3082` has two external callers.*

*Both are folded below.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope §0 and obj 5):** the 10-13 cause was either a formatter fault (Arm A) or a mirror rebuilt from deltas after rejected unsubscribes (Arm B). **NOW:** the cause reads as a second, orphaned WebSocket.
  - **REASON:** the 10-13 log has two phases.
    - **P1 (14:31:37-14:37:35).** It holds every subscribe response of the day. 291 lines show `theirs` equal to an `ours` logged 1-10 lines earlier, which is two copies of one stream at different lags (INFERRED).
    - **P2/P3 (14:37:36-17:14:48).** 684,110 mismatches arrive with **zero** subscribe responses, while frames kept coming in at 1-3k/min/pair after `Max reconnect attempts reached`. `reconnectAttempts` resets only in `handleOpen` (`:605`), so no socket of ours opened in that span.
    - **The code (★ re-read).** `connect()` (`:571-584`) builds a new socket without closing, terminating or detaching the old one. `cleanup()` (`:559-569`) clears timers only. Nothing in the adapter calls `removeAllListeners` or `terminate`.
  - **Arm A:** refuted for S/USD. 52,225 of 52,225 prices and quantities format identically at REST precision 4/5. OOB/CAP are undecidable (no frames retained).
- **PREVIOUSLY STATED (scope §0):** "six `getBookForFill` call sites". **NOW:** five production call lines. `:2882` serves both the age stamp and the inline selection (`:2966-2984`), so the scope counted it twice. The eight consumer lanes are unchanged.
- **PREVIOUSLY STATED (scope G-2):** `:3082` fires "on trade creation". **NOW:** it has two external callers: every paper open (`active-execution-engine.ts:6618`, `'new_trade'`) and every crypto RTB queue insert not already subscribed (`ready_to_buy_service.ts:2384`, `'rtb_queued'`). The queue door is the wider one (`#506`).
  - `MISTAKE: wrong-object` — the second published-false caller census on this identifier (`MISTAKE_PATTERNS.md:166`).

## A. AUDIT

**A1 — the six sources.**
1. **Code:** read at the ref (A2-A6).
2. **Runtime:**
   - the 10-13 error log, phase by phase (above);
   - live `book-integrity` since 10-18: 17,787,704 attempts = matches, 0 mismatches, 53 symbols, S/USD 54,597/54,597.
3. **System Impact Map:** §2.1 (`:317-326`) has no book, checksum or trust content (a gap). The cross-cutting registry entry `:77` holds `bookUpdatedAt`. The integrity-monitor entry `:371-383` cites `triggerSoftResubscribe` as retained-uncalled (`:379`). The price-cache entry `:401-409` predates `sidesWriter`.
4. **System Manual:** §8 is stale on three points.
   - `:8726` names the removed `market-data-ws.ts`.
   - `:8804` still calls CRC validation "UNBUILT".
   - `:8806` says the reconnect resubscribes "all pairs", but it resubscribes open positions only.
   - The book provenance rows are at `:678` and `:695-704`; §18.0.1 is at `:5746`.
5. **Ledger:** `#507` (`:375`), `#1220` (`:11300`), BATCH_CATALOG B-BOOK-TRUNCATE-HOTFIX (`:666-674`).
6. **`bridge/canonical/`:** no coverage of book integrity or resubscribe-on-mismatch. The nearest intent is §13.2, *"Automatic reconnection · 5-second subscription audit · Rate-limit compliance"* (`DawnTrader_System_Architecture_Execution_Flow.md:852-855`), plus invariant A7 (`DawnTrader_System_Invariants_Design_Guarantees.md:221-231`).

**A2 — entry points that can request a book, enumerated first (repo-wide, tests excluded).**
- `subscribeToSymbols` (`:1527`) sends ticker, book (`:1616`) and instrument (`:1618`) on every call. Its callers:

| site | trigger | under a trust filter |
|---|---|---|
| `:619` | `handleOpen`, pending set, every open | ticker only for untrusted |
| `:636` | `handleOpen` from `start()` | ticker only |
| `:2442` | `autoSubscribeMissingSymbols` (`POST /trading/start`, `routes.ts:3554`; `/diagnostics/i7-ws-f/auto-subscribe`, `routes.ts:9696`) | ticker only |
| `:2824` | `triggerCorrectiveAction`, tick-frequency monitor every 5 s, ≤3/60 s | ticker only |
| `:2885` | `scheduleBookChannelRevert`, 120 s after a `prefer_book` recovery | ticker only |
| `:3067` | `i8cSubscribeAllOpenPositions`, engine start | ticker only |
| `:3082` | `i8cSubscribeNewTrade`: paper open `aee:6618`; RTB queue insert `rtb:2384` (dedupes on `getSubscribedSymbols`, `:2383`) | ticker only; the dedupe still holds (the ticker keeps the symbol in `subscribedSymbols`) |
| `:3105` | reconnect (`:630`), open positions only | ticker only |
| `:3191` | I8C audit every 5 s (`:350`) | ticker only (see A4) |
| `:3434` | inside `refreshChannel`, unreachable | deleted |
| `:3767` | `softResubscribe`, once per mismatching delta, no dedupe | replaced by the breaker's single resync |
| `:3865` | `softResubscribeAll`, after a 60 s message gap | ticker only |
| `routes.ts:9848` | `POST /diagnostics/i8c/force-audit` | ticker only |

- **Outside `subscribeToSymbols`, a seventh door the scope did not list:** `switchToBookChannel` (`:2831-2867`, reached from `:2820`) sends a raw `book` subscribe through `ws.send` (`:2862`). The filter cannot see it, so it needs its own gate.
- **Sockets.** `connect()` (`:571`), reached from:
  - `start()`;
  - `scheduleReconnect` (`:1505`, at most 10 attempts, `:424`);
  - `reconnectWithBackoff` (`:3339`, on a 45 s silence, `:419`);
  - `softResubscribeAll` (`:3859`, after 3 s).

  `handleClose` (`:1457`) calls `scheduleReconnect` on any code other than 1000, including the 4001 and 4090 closes we send ourselves (`:3352`, `softResubscribeAll`). **Two schedulers can therefore run `connect()` for the same drop.** Nothing closes the previous socket or detaches it, so any socket still delivering messages feeds `handleMessage`.

**A3 — state-write census (§9.5(a-ii)).**
- **Writers:**
  - `orderBooks`: `:1114`, in place `:1128-1129`, `:3696-3703`; deleted `:3745`; cleared `:3838`.
  - `bookRaw`: `:1115`, deleted `:3746`.
  - `bookUpdatedAt`: `:1193` only, never deleted.
  - `symbolPrecision`: `:1037` only.
  - `bookDepth`: `:808`.
- **Readers:**
  - `getBookForFill` (`:3609-3630`) at five call lines: `depth-source.ts:78`, `aee:2882`, `crypto-touch-readers.ts:18`, `signal-orchestrator.ts:2642`, `vts-runner.ts:1787`. It serves any non-empty book regardless of trust.
  - The drift probe (`:948-949`).
  - **`getLatestPriceData` (`:3582`)**, read by the integrity monitor at `:154`. Logs only; a reader the scope did not list.
- **Price cache:** `emitPriceTick` (`:1235-1243`) writes `kraken_ws_book_mid` → `'ws_book'` (`live-pricing-adapter.ts:247-248`) → leg `producer` (`touch-price.ts:200`).
- **Order inside the handler:**
  1. checksum `continue` (`:1163-1180`);
  2. **crossed-book detector (`:1186-1189`)**;
  3. stamp (`:1193`);
  4. one-sided `continue` (`:1201`);
  5. `lastUpdate` (`:1219`);
  6. emit (`:1235`).

  The checksum `continue` skips the crossed detector, so "0 crossed" on a mismatching symbol is unreadable (Langston's carry 1).
- **Removals this batch makes:**
  - **Watchdog cluster:** `resetChannelWatchdog` (zero callers), `startChannelWatchdog` (`:3407`, `:3435`), `handleChannelTimeout` (`:3384`), `refreshChannel` (`:3419`).
    - Also dead with them, missed by the scope: `stopChannelWatchdog` (`:3393`, sole caller `:3376`), the `channelWatchdogTimers` field (`:397`), the `sentinelResets` metric (incremented only at `:3416`; served by `routes.ts:10616`, `:10716`), and `channelWatchdogs` (`:3563`).
    - The `volumeClassifier` / `TIER_THRESHOLDS` / `VolumeTier` import (`:24`) is used only by the cluster.
    - Tests that reference them: p7b `:6`, `:29`, `:75`, `:81`, `:83`.
  - **`triggerSoftResubscribe`** (`mini-book-integrity-monitor.ts:268-277`): referenced only by its docblock and a comment at `:206`; no test.
  - **Each removal needs zero callers AND no surviving reader of what it wrote.** For `sentinelResets` the two routes still read it, so the field is removed from both responses in the same commit, or kept and stated as a frozen zero.

**A4 — the subscription bookkeeping.**
- `subscribedSymbols` gains a symbol on any successful subscribe ack, whatever the channel (`:810`; v1 `:741`). `sendBookUnsubscribe` (`:1701-1714`) and the unsubscribe-ack branch (`:820-832`) never remove it. **So a ticker-only symbol stays "subscribed", and the `:3191` audit cannot loop on `missing_subscription`** (Langston's note, confirmed).
- `softResubscribe`'s `unsubscribeFromSymbols` **does** remove it (`:1675`). The 5 s audit can then stack a second subscribe within 500 ms of its own, which draws `Already subscribed`. So the breaker's resync must not go through `unsubscribeFromSymbols`.
- **A refused subscribe carries no symbol** (`:817-818`), and subscribes carry no `req_id`. The `subscribeRejected` counter needs a subscribe-side `trackUnsubscribe` equivalent (`:1717`).
- `symbolStats.lastUpdate` has three writers: `:876`, `:1219`, `:1331`. `I8C_STALE_THRESHOLD_MS` = 30,000 (`:354`).

**A5 — provenance** (`git log -S`, no path limit; all Replit-era except the last):
- `softResubscribe`: `92e9c15fc` (2025-12-30), *"Add Mini-Book Integrity Monitor … triggers a soft resync via Sentinel for auto-recovery."*
- `softResubscribeAll` and `start90HeartbeatMonitor`: `b4bc599e2` (2025-12-31), *"Implement a safe heartbeat monitor for WebSocket connections…"*.
- Reconnect re-subscribing open positions only: `828c676bc` (2025-12-09), *"automatic resubscription for open positions and new trades."*
- The `rtb_queued` caller: `0c45403fb` (2026-07-15), *"queue-time WS book warm in queueSQESignal — the #295 depth gate demanded a live book BEFORE an open"*.
- **None of them was designed for repeated, automatic use per message.** The socket handling predates any book that needed integrity. **Disposition (2), relevant but needs updating**, for the resync, the reconnect and the socket lifecycle alike.

**A6 — confirmation thresholds, derived and not guessed.**
- Since 10-18 there have been 17,787,704 checks and 0 mismatches. A genuine transient desync is rare enough that one resync is the right first response.
- The fresh snapshot carries its own checksum and is verified in the same block (`:685`, `:1111`). **A mismatch on the snapshot is conclusive by itself.**
- **A second desync within 60 s of a resync that did match is also confirmation**, because a feed that desyncs twice in a minute is not transient. Sixty seconds is about 1-3k book frames per minute per pair on these symbols.

## B. PLAN (each item cites the audit finding it falls out of)
1. **(A2 sockets, PREVIOUSLY/NOW 1) One socket at a time — the root cause.**
   - `connect()` terminates and detaches the previous socket (`removeAllListeners` then `terminate()`) before building a new one.
   - Each handler binds to the socket it was built with and returns early unless that socket is the current `this.ws`. A late `close` from an old socket schedules nothing.
   - `connect()` refuses a second concurrent attempt even when two schedulers fire.
2. **(A6, A4) The breaker.**
   - **States per symbol:** a trust record `trusted → suspect → untrusted`, held in its own map that no reset path clears.
   - **First mismatch:**
     - The symbol moves to `suspect`.
     - The book is ignored until a fresh snapshot arrives.
     - **One** resync goes out: book channel only, through `sendBookUnsubscribe` and then a book-only subscribe, never through `unsubscribeFromSymbols`.
     - It is guarded by an in-flight entry, so a burst of mismatches sends exactly one.
   - **Confirmation** (snapshot mismatch, or a second desync within 60 s) → `untrusted`.
     - Book channel cancelled.
     - No further book or resync request.
     - Ticker untouched.
     - The emit to the price cache stops.
   - **Snapshot match → `trusted`.**
3. **(A2, A3) The filter and the doors.**
   - `subscribeToSymbols` sends the book only for trusted symbols. The breaker's own resync and the operator re-check pass through explicitly.
   - The raw book subscribe in `switchToBookChannel` is gated the same way.
   - `getBookForFill` returns null for a non-trusted book. All four hardcoded `bookEligible:true` are replaced with the trust state and its reason. The ticker rung refuses `producer === 'ws_book'` on non-trusted symbols.
   - `getLatestPriceData` reports trust.
4. **(scope obj 3/4) Alert and recovery.**
   - **Alert:** one per symbol per episode, `breakage`, `warning`. It carries both CRCs, the precision, the count, the venue replies and the state. Resolved by hand.
   - **Recovery route:** `POST /api/active-engine/book-recheck/:symbol`, authenticated. It re-reads `AssetPairs` precision for the pair, then sends one book subscribe. A snapshot match restores trust. One request per call.
5. **(A3 carry 1) The crossed-book detector moves above the checksum block.** This is byte-identical for a matching book, and the crossed rate on a suspect or untrusted book becomes readable.
6. **(scope obj 5 rider) Bound the precision** in `handleInstrumentMessage` to 0-18 for both price and qty. Out of range: refuse and count it.
7. **(scope obj 6, A1, A3) Counters and text.**
   - **Counters**, per symbol:
     - `resyncsSent`, `confirmed`, `trust`, `subscribeRejected` (with a subscribe-side tracker), `bookUnsubRejected`;
     - the existing skip count, added to the `syms` union.
   - **Text corrections**, every stale statement the batch falsifies:
     - `routes.ts:13258-13261`;
     - adapter `:3641-3649` and the `:3685` note;
     - `level-basis.ts:400-401`;
     - `price-cache.ts:115`;
     - the two "eligible by construction" comments;
     - System Manual `:8726`, `:8804`, `:8806`;
     - the System Impact Map `:379` line;
     - p7b test `:6`.
8. **(A3 removals) Rule 18.**
   - The watchdog cluster (five symbols, the field, the metric and the import) and `triggerSoftResubscribe` are deleted. Each gets a caller-and-reader census in `DELETED_COMPONENTS_LOG` and an archive copy.
   - `sentinelResets` is dropped from both route responses.
   - p7b test 3's invariant is re-pointed onto the breaker's resync.
9. **(A2) The `instrument` subscribe** leaves the per-symbol path (`:1618`). It is sent once per socket open.
10. **Tests.** Every negative ships with its twin; the existing tests named in the readers' census (b507, p7b, p7a, p7d, obj8c, 8a-p3, rtb-retirement-ask, p7i, the 8a-p1 fences, p19-b4b1) are re-run or re-pointed.
    - **One socket:**
      - a second `connect()` closes and detaches the first;
      - a message from a stale socket is ignored;
      - a late `close` from a stale socket schedules nothing.
    - **The breaker:** the burst/one-resync case, the snapshot confirm/restore pair, the 60 s second-desync case, the filter at each door including `switchToBookChannel`.
    - **Readers:** the reader-side refusals, the `ws_book` literal.
    - **Bounds and re-check:** the precision bound, and the re-check route.
11. **Governance:** SIM §2.1 plus a cross-cutting registry row; System Manual §8 and §18.0.1; `#1220`; BATCH_CATALOG; PHASE_HISTORY; `DELETED_COMPONENTS_LOG`; the plan line; the task list; memory.

No `UNAUDITED` items. **Blast radius:** the Kraken spot WS adapter's socket lifecycle and book path, and five book readers. The ticker path is unchanged, except that the cache no longer takes a non-trusted book's prices.
