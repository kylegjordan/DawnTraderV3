# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — SCOPE (Step 1, r4 — Langston's E-1, E-2 and folds 1-6 applied)

change-class: architecture

**Issue:** `#1220` · **Plan:** `SPRINT_TO_LIVE_PLAN` §0a, CC-B pre-sprint item 1 (Kyle-assigned 2026-10-20) · **Owner:** CC-B (NEW Claude) · **Board:** `PVTI_lAHODmulEM4BfQP4zhCKK0I`

*History:*
- r1 `c20dca449`, sent back with C-1…C-7.
- r2 `fb95d163e`, sent back with D-1…D-8.
- Settled, not re-litigated:
  - the class;
  - the entry fallback as disposition (1);
  - obj 3's per-symbol-per-episode key, resolve-never-ack;
  - obj 4's refusal of a time-based retry;
  - the instrument-updates candidate struck;
  - obj 7's positive twins.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (r1 §0):** a book that keeps mismatching *reads as quiet*. **NOW:** its stamp freezes, so it reads *increasingly stale* and the warmth gate refuses it, which is fail-safe. The instrument that is actually blind is the book-vs-ticker drift probe. **REASON:** Langston C-4.
- **PREVIOUSLY STATED (r2 §0):** four `getBookForFill` call sites, and the exit book read was a passive stamp. **NOW:** there are six call sites, and the exit read feeds the live stop/target trigger through its own inline selection. **REASON:** Langston D-1, D-2.
- **PREVIOUSLY STATED (r2 §0):** "the check works today" on 53 symbols. **NOW:** S/USD is in that set and has matched 54,597 of 54,597 since 10-18. OOB/USD and CAP/USD are absent from it entirely. **REASON:** Langston D-4. This weakens "wrong cached precision" as the leading candidate (see obj 5).

## 0. What is there, and what happened
- **The check (`kraken-websocket-adapter.ts:1163-1178`).**
  - CRC32 of our mirrored book, formatted at the pair's precision by the static `computeBookChecksumFromRaw` (`:3705`, `:3710-3729`). It uses `Number(v).toFixed(dp)`, then strips the result.
  - Precision comes from the v2 `instrument` channel. It has one writer (`:1037`), one reader (`:1164`), and is never deleted.
  - On a mismatch: warn (`:1175`), `void this.softResubscribe(symbol)` (`:1176`), `continue` (`:1177`). The `continue` sits above the freshness stamp (`:1193`).
  - An unmapped symbol skips verification (`:1166`) and is counted in `bookChecksumSkippedNoPrecision`, which nothing surfaces.
- **`softResubscribe` (`:3737-3769`).**
  - It clears `:3745-3753`, including `pendingSubscriptions` and `subscriptionAcks`, but not `symbolPrecision`. It then unsubscribes, waits 500 ms within the call, and resubscribes through `subscribeToSymbols` (`:1527-1634`).
  - That function does not dedupe in flight, so nothing stops concurrent resyncs.
  - It also sends `{channel:'instrument', snapshot:true}` (`:1618`) on every call. Every resync therefore re-requested the all-pairs instrument snapshot.
- **The six `getBookForFill` call sites (D-1, D-2).** Production consumer lines are cited; import lines are not.

| site | consumer | on a null today |
|---|---|---|
| `depth-source.ts:78` → `_evaluateOpenDepthGate` | open depth gate | fail-closed: blocks OPENS |
| `active-execution-engine.ts:2882` `_bookX` | exit book-age stamp, **and** an inline `selectTouchPrice` (`:2968-3005`) with its own hardcoded `bookEligible:true` (`:2984`). Per `8a-P2` (`:2993-3003`) this drives `stop_hit`/`target_hit`, the **live exit trigger** | ticker rung, unrecorded |
| `crypto-touch-readers.ts:18` → `selectCryptoTouch` (`crypto-touch.ts:228-243`, hardcoded `bookEligible:true` `:242`) | entry fill (`active-execution-engine.ts:1865`), RTB retirement (`rtb-retirement-ask.ts:48`), VTS (`vts-runner.ts:2440`, `:3801`, `:3958`, `:4729`) | ticker rung, silently (the file's own warning at `:13-14`) |
| `signal-orchestrator.ts:2642` | record-only signal-birth basis funnel (`recordTouchSelection` `:2730`), hardcoded `bookEligible:true` `:2712` | records a clean book-rung selection |
| `vts-runner.ts:1787` | record-only (`:1818`), hardcoded `bookEligible:true` `:1804` | same |

  The comment *"eligible by construction … never fires on this leg"* sits at **`active-execution-engine.ts:2982`, the live exit trigger**, and at `signal-orchestrator.ts:2710`; `vts-runner.ts:1804` carries none (r3 misattributed them — fold 1). This batch falsifies the comment. The signal-birth funnel is item 3's measurement surface.
- **The exit trigger's ticker fallback reads `priceCache.getCachedPrice(symbol)`** (`active-execution-engine.ts:2955`, via `tickerLegFromCachedQuote`, `touch-price.ts:179`). That cache is fed by the WS ticker (`bbo`), by the 2 s open-trade REST lane, **and by the WS book itself**, which writes its own top into the cache's `bid`/`ask` as `kraken_ws_book_mid` (`kraken-websocket-adapter.ts:1151-1153`).
- **`unsubscribeFromSymbols` cancels ticker AND book** (`:1657-1676`, comment `:1670-1673`). It is the only per-symbol cancel.
- **Two more resync paths exist besides `softResubscribe`:**
  - `softResubscribeAll` (`:3824`), armed by `start90HeartbeatMonitor` (`:615`). Every 15 s it checks for a 60 s heartbeat gap; on one it force-closes the socket, `orderBooks.clear()`s the fleet and reconnects, which delivers a fresh snapshot for every symbol.
  - The reconnect path's `i8cResubscribeAllOpenPositions` (`:627`).
  - Both ran during 10-13 (`Max reconnect attempts reached` twice).
- **The built funnel field (fold 3).** `bookEligible:false` flows through `touch-price.ts:113-114` to the book row's `byReason.book_not_eligible` and the ladder row's `tickerAcceptedByBookVerdict.book_not_eligible` (`touch-price.ts:248`). Both read zero everywhere and sit on `B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md:302`'s uncontrolled list, and this batch is their first positive control.
  - **A fence, not a defect, so do not "fix" it:** `LADDER_REASON_NAME` maps `book_not_eligible → 'no_ticker'` (`level-basis.ts:567`). That mapping is unreachable, because the ladder row records `sel.tickerRefusal` only (`:254`).
- **A dormant resync cluster (fold 4).**
  - `mini-book-integrity-monitor.ts:256-272` is kept, per its comment, because "#507 assigns resubscribe-on-mismatch to CC-B … That batch wants this method". This is that batch.
  - Langston measured at the ref:
    - `resetChannelWatchdog` (`:3404`) has no caller in `server/` or `client/`.
    - `startChannelWatchdog`'s only callers are `refreshChannel` (`:3435`) and `:3407`.
    - So `refreshChannel`, `handleChannelTimeout` and the channel watchdog are all unreachable.
  - Armed, they would be dangerous: the breaker silences an untrusted symbol's price ticks (the `continue` at `:1177` sits above `emitPriceTick` at `:1233`), and that silence is exactly what a channel watchdog detects. Arming them would let the breaker drive its own resubscribe loop.
  - They cannot fire today.
- **A refuted candidate (fold 5), recorded so nobody "fixes" it:** `softResubscribeAll` (`:3838-3844`) clears `orderBooks` but not `bookRaw`. That is not a stale-raw defect, because the `!orderBooks.has()` arm at `:1112` resets both.
- **2026-10-13** (Langston's venue-reply census, `error__2026-10-14_00-00-00.log`):
  - 715,683 mismatch lines: OOB/USD 269,272, S/USD 253,896, CAP/USD 192,515.
  - 78,824 `Exceeded msg rate` (44,175 of them on subscribe).
  - 34,649 `WS_UNSUB_REJECTED`.
  - 6,701 `Sub Error: Already subscribed`.
  - 4,946 `Subscription Not Found`.
  - 10 HTTP 429 handshakes.
  - `Max reconnect attempts reached` at 14:40:37Z and 17:14:48Z.
  - The duplicate instrument subscribe was refused, so precision was never re-learned during the episode.
- **The entry fallback** when no book is served is already decided (`SYSTEM_IMPACT_MAP.md:378`, `BATCH_CATALOG.md:666`, `#507`'s 2026-08-24 rider). Disposition (1).
- **Stale text on the trading path (D-6).**
  - `routes.ts:13258-13261` has three false clauses: "mismatches HIGH IS EXPECTED", the 3,000-line-window claim, and "never resubscribes".
  - The adapter docblock at `:3644-3649` says "The v2 instrument channel is NOT subscribed — ticker and book only". That is contradicted by `:1593-1618` and by its own `:3685`.
  - Two code comments say "eligible by construction" (above).
- **`BOOK_TICKER_ALERT_ARMED = false`.** The drift probe is record-only (D-8).

## 1. Provenance (Tier 1) and disposition
- **Corpora:** `RUNNING_ISSUES` (`#507`, `#1220`), `BATCH_CATALOG` (B-BOOK-TRUNCATE-HOTFIX), `git log -S "softResubscribe" --reverse`, `git log -S "BOOK_CHECKSUM_MISMATCH"`, the System Impact Map / System Manual book entries, and `bridge/canonical/` (cited at Step 2).
- **`3bd9f4022`, quoted:**
  > "With precision known, a mismatch logs loudly and triggers softResubscribe for a fresh snapshot, which is the desync recovery #507 named as unbuilt on 2026-07-15."
  >
  > "FAILS OPEN, per Langston's condition … an unmapped symbol SKIPS verification … it never resubscribes."

  It was proven on 34,549 of 34,549 live checksums at the time.
- **`softResubscribe`** predates it (`[8.9.5]`, Replit era): a one-off manual resync.
- **Disposition (2):** relevant but needs updating. Resyncing on a genuine desync is right. Doing it per message, unbounded and unconfirmed, is the defect.

## 2. Objectives
Kyle, 2026-10-20: *"a better detection system … when we can properly and reliably check and confirm that, then we can stop the requests for that symbol straight away"*.

1. **Confirm before acting, then stop at once.**
   - The first mismatch triggers **one** resync, guarded by a new per-symbol in-flight record that `softResubscribe` does not clear. A burst of mismatching deltas therefore starts exactly one resync.
   - A resync no longer re-requests the all-pairs instrument snapshot (`:1618` is moved out of the per-symbol path).
   - **Confirmed** means the mismatch persists on the fresh snapshot (whose own checksum is verified: the block sits inside the loop that handles `type === 'snapshot'`, `:685`, `:1111`) or on its first deltas.
   - **What stops on confirmation (E-1):** resync requests and book-snapshot requests for that symbol stop immediately, and its book channel is cancelled on its own.
   - **What stays live:** the ticker subscription. The per-symbol cancel that takes the ticker with the book (`unsubscribeFromSymbols`) is not used for this.
   - **No leak into the price cache:** an untrusted book also stops writing its top into the cache (`kraken_ws_book_mid`, `:1151-1153`).
   - Thresholds and their reasoning go in the pre-audit.
2. **A confirmed book is UNTRUSTED, in every lane that reads it (D-1, D-2).**
   - The untrusted state replaces all four hardcoded `bookEligible:true`: `crypto-touch.ts:242`, the inline exit trigger `active-execution-engine.ts:2984`, `signal-orchestrator.ts:2712` and `vts-runner.ts:1804`. Each lane records *why* it left the book rung.
   - **Risk-moving consequence, stated here (E-1):** for the decision lanes (exit trigger, entry fill, RTB retirement, VTS), the ticker rung's own age and spread ceilings decide.
     - That rung is fed by the live WS `bbo` ticker and, for a held position, the 2 s open-trade REST lane, never by the untrusted book.
     - If both fail their ceilings, the selection refuses and we hold, the standing posture.
     - A held position therefore keeps a live exit price through the ticker for as long as the ticker is alive.
   - The funnel's existing `book_not_eligible` fields are the record of each demotion. The new counters do not duplicate them (fold 3, `#641`).
   - `depth-source` blocks opens on an untrusted book. The exit book-age stamp records "untrusted", never an age.
   - The two record-only funnels record an untrusted book as its own outcome, never a clean book-rung selection.
3. **One alert per episode.**
   - It names the symbol, both CRCs, the precision used, the count before confirmation, the venue's replies to our requests, and the terminal state.
   - Dedupe key is per symbol per episode. Resolved by hand, never acked (`#982`).
4. **Terminal state, and how precision is re-learned (D-3).**
   - A confirmed symbol stays untrusted and silent.
   - Exit from that state is an operator re-check only. The re-check first re-reads that pair's precision through **REST `AssetPairs`** (`pair_decimals` / `lot_decimals`, per pair, public, one call per re-check). That re-read never touches the global `instrument` subscription.
   - Then one fresh snapshot; a match restores trust. Capped at one per call.
   - No time-based retry.
   - **Untrusted survives every other resync path (E-2).** The trust state lives in its own per-symbol record. `orderBooks.clear()`, `softResubscribeAll` and the reconnect's `i8cResubscribeAllOpenPositions` do not clear it.
     - On a reconnect, an untrusted symbol gets its ticker back and **not** its book.
     - A reconnect is therefore not a re-converge for an untrusted symbol. Only the operator re-check is.
     - **Why:** Kyle's "stop the requests for that symbol straight away" would otherwise be undone by the next heartbeat gap, which is how a time-based retry would enter by another door.
   - **Fold 4 — dispositions for the dormant cluster:**
     - `mini-book-integrity-monitor.ts`'s resubscribe method, kept for this batch: **(4) removed**, because the breaker owns the only resync path.
     - `resetChannelWatchdog`, `refreshChannel`, `handleChannelTimeout` and the channel watchdog, all unreachable: **(5) deleted** under rule 18, each with its caller census in `DELETED_COMPONENTS_LOG`.
     - Leaving any of them would leave three dormant doors into the path this batch gates.
5. **The 10-13 cause — two arms, because one test cannot tell them apart (D-4, D-5).**
   - **Arm A, the formatter.** Feed the static `computeBookChecksumFromRaw` the venue's strings for OOB/USD, S/USD and CAP/USD. Use today's `instrument` / `AssetPairs` precision and any 10-13 book frames recovered from `[I7-WS-RAW]` where retained.
     - **Stated limit:** today's precision cannot test a precision the venue may have declared differently on 10-13. S/USD matching 54,597 times since 10-18 counts against a formatter fault that persists today.
   - **Arm B, the subscription state, with its mechanism (fold 5).**
     - On `isSnapshot || !orderBooks.has(symbol)` the handler resets both `orderBooks` and `bookRaw` (`:1112`). A delta that arrives first after a teardown therefore becomes the authoritative base: a mirror holding only the levels that delta touched. Its CRC over the venue's top 10 cannot match until a snapshot lands.
     - Pair that with the census: 34,649 `WS_UNSUB_REJECTED` and 6,701 `Already subscribed` mean the unsubscribe failed and the resubscribe was refused as a duplicate. So no new snapshot arrived while deltas kept landing in a mirror that had just been emptied.
     - That produces a permanent mismatch with no formatter fault and no precision error. It would also explain why S/USD matches 54,597 of 54,597 today.
     - **Three predictions, checkable in the retained log:**
       - (a) no `book` snapshot message for the three symbols inside the episode;
       - (b) their unsubscribes rejected;
       - (c) the mismatch never self-clears.
     - **If all three hold, Arm A is ruled out** without needing the 10-13 precision.
   - Langston's lead is **recorded and not built on**: `theirs[i] == ours[i−1]` on 105 of 715,683 lines.
   - Fix what either arm establishes. Otherwise state what each ruled out.
   - **Rider:** bound `handleInstrumentMessage`'s precision to a valid range. Today it checks `Number.isInteger` only, so an out-of-range value throws inside the book handler.
6. **Counters and text (D-6, D-7, D-8).**
   - `getBookIntegrityCounters` gains, per symbol: `resyncsSent`, `confirmed`, `untrusted`, `subscribeRejected`, and the existing `bookChecksumSkippedNoPrecision`.
   - Correct every false statement this batch falsifies:
     - all three false clauses at `routes.ts:13258-13261`;
     - the adapter docblock at `:3644-3649`;
     - the `note:` string `getBookIntegrityCounters` serves over HTTP (`:3689`, "the mismatch arm resubscribes");
     - `level-basis.ts:400-401` ("every one passes `bookEligible: true`");
     - both "eligible by construction" comments (`active-execution-engine.ts:2982`, `signal-orchestrator.ts:2710`).
   - Add `bookChecksumSkippedNoPrecision.keys()` to the `syms` union at `:3661-3665`, so a skip-only symbol is listed for its own reason.
   - The drift probe reports an untrusted book as its own outcome. It stays record-only (`BOOK_TICKER_ALERT_ARMED = false`), so no read cites it as detection.
7. **Tests (each negative with its positive twin):**
   - A burst of N mismatching deltas sends exactly one resync, and no instrument resubscribe. A single clean delta sends none.
   - A mismatch on the fresh snapshot confirms and sends zero further book or resync requests. The ticker stays subscribed, and the untrusted book writes nothing to the price cache. A match restores and sends none.
   - Untrusted survives `orderBooks.clear()`, `softResubscribeAll` and a reconnect: the reconnect re-subscribes the ticker and not the book. A trusted symbol gets both.
   - Untrusted reaches each of the four former hardcodes as not-eligible, with its reason. A trusted book still selects the book rung.
   - `depth-source` blocks an open on an untrusted book.
   - The operator re-check reads `AssetPairs` precision before the snapshot, and restores only on a match.
   - Out-of-range precision is refused.
   - Unknown precision still skips verification and never resyncs.
   - Plus Arm A's cases.
8. **Step 7.**
   - On staging, per symbol: `updatesApplied == attempts == matches`; `bookChecksumSkippedNoPrecision` reported; 0 confirmed, 0 untrusted, 0 resyncs.
   - A precision-skipping symbol would pass a bare `matches == attempts` as `0 == 0`, which is why `updatesApplied` is included and the skip count is shown (D-7).
   - **This supports only two claims:** the counters are wired, and the breaker does not misfire in the healthy case. The confirm path is carried by the suite (C-7). The first real episode is a forward read on `#1220`.

**Not in this batch:** item 2 (`#1222`) — the shared "fresh" definition and widening the live feed. Langston endorses item 2's definition with a fourth term: *acknowledged* per subscribe attempt, with a rejected reply as its own state (this batch's `subscribeRejected` counter is the first instrument for it). Item 2 also fixes the reconnect, which re-subscribes held positions only (`:626-630`).

**Docset (architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (the trust state and its six sites), `SYSTEM_MANUAL` (book integrity), `RUNNING_ISSUES` `#1220`, the plan line, the task list, and the memory files.
