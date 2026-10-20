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

## r2 — Langston's attack on the cause, and the three tests
- **The orphan stands, on a structural argument rather than a race.**
  - `connect()` (`:572-584`) reassigns `this.ws` unconditionally. Nothing in the file calls `removeAllListeners` or `terminate`.
  - The ten 429 handshakes each reassigned `this.ws`, so from 14:40:37 `this.ws` was a never-opened object.
  - Frames handled after that point therefore came from a live socket that was not `this.ws`. Any socket that outlives its reassignment is an orphan, deterministically.
  - **No new socket of ours opened between 14:40:37 and 17:14:48, provable from code.**
    - `reconnectWithBackoff` stops the heartbeat monitor and health logger (`:3345-3346`), and they restart only in `handleOpen` (`:609-611`).
    - `scheduleReconnect` returns at the cap (`:1505-1508`).
    - `reconnectAttempts` resets only in `handleOpen:604` and `stop:548`.
  - **Withdrawn as evidence:**
    - The 291 "theirs = an earlier ours" lines. A mirror running behind truth gives the same signature.
    - "Zero subscribe responses". In P2/P3, `subscribeToSymbols` bailed at `:1563-1568` on `!isConnected` and sent nothing.
- **The primary mechanism is a self-sustaining wipe loop in the mismatch arm. It needs no second socket.**
  - The loop:
    1. A mismatch (`:1175`) calls `softResubscribe`.
    2. `softResubscribe` deletes `orderBooks` and `bookRaw` (`:3745-3746`), then unsubscribes and resubscribes. The resubscribe is swallowed or refused.
    3. The next delta hits `!this.orderBooks.has()` (`:1112`) and gets a fresh empty book.
    4. That book receives a partial apply, mismatches, and is wiped again.
  - This repeats once per frame: 684,110 in 2h37m.
  - In P1 the same loop sent 2 control messages per mismatch, about 5,800 per minute. That produced Kraken's rate limit, which produced the ten 429 handshakes, which killed the reconnect path.
  - **The orphan explains the carrier. The loop explains the volume and the storm.**
- **The three tests (CC-B, `error__2026-10-14_00-00-00.log`):**
  - **T1 (`WebSocket connected`) and T2 (`WebSocket closed: code=`) are undecidable.** Both lines are `console.log` (`:594`, `:1458`), so they went to stdout, which has rotated away for 10-13.
    - Positive control: the same `[KrakenWS] WebSocket connected` format appears in the retained stdout (2026-10-19 09:29:47, 13:59:34).
    - The swallowed-subscribe prediction (`:1564`, `:1566`) is undecidable for the same reason.
  - **T3 is confirmed.** There is a second `Max reconnect attempts reached` at 17:14:48 (`console.error`, `:1507`). That fits the hung original close completing late, running `handleClose`, then `scheduleReconnect`, then hitting the cap.
- **Arm A** is refuted for S/USD only (52,225 / 52,225). OOB/CAP remain undecidable and are not generalised from n = 1.

## r3 — Langston's Step-2 ruling (graded at `931c64e71`): BLOCKER-1…3, CONDITION-1/2 and the record items
**A7 — §9.5(a-ii) write census for the socket-lifecycle state that plan 1 mutates (BLOCKER-1; CC-B, at the ref):**
- **`this.ws`:** `:544` `stop()` sets it to null. `:578` `connect()` reassigns it with no teardown. Uses: `:540` close 1000, `:1493` close 4000 (heartbeat interval — **a third self-close the r1 enumeration missed**), `:1498` ping, `:1615-1618` / `:1668` / `:1712` / `:2862` / `:3329` send, `:3352` close 4001, `:3831` close 4090.
- **`isConnecting`:** `:574` true in `connect()`; false at `:548` `stop()`, `:588` (connect error), `:604` `handleOpen`, `:1460` `handleClose`, `:3359` `reconnectWithBackoff`, `:3849` `softResubscribeAll`.
  - Today's guard `if (this.isConnecting) return` (`:572`) only stops overlapping *handshakes*.
  - Three writers zero it so that their own `connect()` cannot be refused, and it is already false whenever a socket is live.
  - **It cannot be the refusal predicate.**
- **`isConnected`:** true at `:603` `handleOpen`; false at `:547`, `:1459`, `:3358`, `:3848`.
- **`reconnectAttempts`:** reset at `:551` and `:605`; incremented at `:1522`; capped at `:1506` (`scheduleReconnect`).
- **`i8cIsReconnecting`:** false at `:598`; true at `:1519`, `:3360`, `:3850`.
- **`reconnectRetries`:** incremented at `:3361` and **never reset** (record item: `reconnectWithBackoff`'s delay saturates at its cap after the first episode and stays there for the life of the process).
- **⇒ The refusal predicate is the socket itself:** `connect()` refuses while `this.ws?.readyState` ∈ {CONNECTING 0, OPEN 1}, and otherwise detaches and terminates the old socket before building the new one.

**BLOCKER-2 — the `sentinelResets` census, corrected.**
- PREVIOUSLY STATED: routes `:10616` / `:10716` read it. NOW: those are bare `getHealthMetrics()` calls; the field reaches them transitively.
- The removal is four adapter sites: `:3479` (health-report template), `:3542` (return type), `:3557` (object literal), `:3571` (`resetHealthMetrics`).
- **`server/services/verification-test-protocol.ts` has an independent counter of the same name** (pass/fail at `:351`), and it is **not touched**.
- REASON: Langston's controlled zero — 0 matches in `client`, `scripts`, `routes.ts` and `shared`, against 16 in `server` (6 in the adapter, 10 in `verification-test-protocol.ts`). Record item (c): r3 had "22 in server + shared", which was the all-paths total.
- `MISTAKE: wrong-object` (the second census error on this batch).

**BLOCKER-3 — a mismatch on the fresh snapshot proves that our computation disagrees with the venue, not that the venue's book is bad.**
- The checksum input has three variable parts: `symbolPrecision` (`:1037`, never invalidated), `bookDepth` (`:1119`, `?? 10`) and the formatter. Arm A is refuted for S/USD only.
- So before the suspect → untrusted transition, the breaker **automatically re-reads that pair's precision from REST `AssetPairs`, once per episode**, and verifies the next snapshot with it. Only a mismatch that survives the fresh precision confirms.
- Bounded at one call per episode, so it cannot rebuild the 10-13 storm.
- **PREVIOUSLY STATED (A6): a second desync within 60 s confirms, "because a feed that desyncs twice in a minute is not transient", argued from 0 mismatches in 17.8M checks. NOW:** the 60 s arm is a **judgement**, with no measured inter-arrival distribution behind it (n = 1 episode, frames gone). And 17.8M healthy checks is the wrong population: the one episode we have was not transient. **REASON:** Langston. The one-resync conclusion stands on its own: one resync is the least that can recover a dropped frame.

**CONDITION-1 — the generation guard is the first statement in every handler, above any state write.** Today `handleClose` writes `isConnected = false` and calls `cleanup()` (`:1459-1461`) before anything could return. If the guard came later, terminating the old socket would clear the **new** socket's timers.

**CONDITION-2 — the trust state travels into the price provenance, per reader.**
- `depth-source.ts:78-79`: fail-closed (`if (!book) return null`). A non-trusted book blocks the open.
- `crypto-touch-readers.ts:18`: touch selection **moves from the book rung to the `bbo` ticker rung** for a non-trusted symbol. That is a lane change under B-PRICE-SIDE-BY-JOB, stated here. The selection records `bookEligible:false` with its reason, and the row records **which rung priced it** (`acceptedSource`, `touch-price.ts:236` / `:253`). So an untrusted period's trades are distinguishable from book-priced ones at Step 8.
- Exit lane `aee:2882` / `:2966-2984`: the same ticker-rung move, recorded the same way.
- `signal-orchestrator.ts:2642` and `vts-runner.ts:1787`: record-only funnels. They record the non-trusted outcome as its own reason.

**Record items:**
- **`:1119` `?? 10`** is correct only because `:1603` requests `depth: 10`. A test pins the two together.
- **The alert.** `dedupe_key` is `book_untrusted:<symbol>:<episode start ISO>`, so a new episode always mints its own row.
  - The recovery route resolves the episode's row when it restores trust: by the route, with the snapshot match as evidence.
  - An ack would silence nothing future, because the key is per episode. The rule stays resolve-only (`#982`).
- **Refuted, not carried** (Langston): plan 9 is safe. The instrument subscribe covers every pair, and unknown precision fails open, so once-per-open cannot starve a late subscriber.

## r4 — Langston's review of r2: audit APPROVED; plan B1-B5 and the smaller items
- **B1 — the orphan's birth site, by presence, with a positive control.** `[8.8.5][RECONNECT]` is `console.warn`, so it goes to stderr and is retained. In `error__2026-10-14_00-00-00.log` it appears twice:
  - **14:31:33, "Reconnecting in 1000ms (attempt 1)"**, after `[8.8.5][HEARTBEAT] No messages in 45674ms`.
  - **17:15:30, "attempt 2"**, after a 45,837 ms silence. This is the orphan's own death showing up as silence; "attempt 2" also confirms that `reconnectRetries` is never reset.
  - There is none in between. **MEASURED:** `reconnectWithBackoff` ran exactly twice all day. So the `connect()` calls from 14:37:36, the ten 429 handshakes, came from `scheduleReconnect` via `handleClose`.
    - Langston's controlled zeros rule out the other reassignment paths in that file: `No pong received` 0, `[9.0][HEARTBEAT] Missed heartbeat` 0, `[9.0] Triggering Safe Resubscribe` 0, each against a positive control elsewhere. This removes `softResubscribeAll` and the `:1493` close(4000).
    - Positive control for `[8.8.5][RECONNECT]`: **n = 2 outside the subject** (2026-10-06 15:46:30, 2026-10-08 18:08:51, both "attempt 1").
  - **Two accounts of the orphaning fit, and plan 1 repairs both identically, so neither gates code (Langston CONDITION-A):**
    - (i) The 14:31:33 `close(4001)` hung, and the old socket survived its reassignment.
    - (ii) The socket created at 14:31:34 opened and subscribed through P1. The **first 429 handshake at 14:37:36** then reassigned `this.ws` away from it while it was OPEN. `connect()` closes nothing, so no close hung: the orphan simply died at 17:14:44.
    - **(ii) is the better-supported one.** A socket silent for 45.7 s was not "still delivering" at 14:31:33, so the earlier sub-claim is withdrawn. 14:37:36 is exactly the P1/P2 boundary.
    - Both remain INFERRED. What is MEASURED is the creation at 14:31:33 and the reconnect-path census above.
- **B2 — A2 corrected.**
  - PREVIOUSLY STATED: "nothing closes the previous socket". NOW: both reassign sites close it gracefully first (`:3352` `close(4001)`, `:3831` `close(4090)`). What is true is that **nothing detaches it and nothing forces it.** REASON: Langston.
  - Under account (i) the defect is a graceful close that hung, and T3 bounds the orphan window at about 2h43m (completing 17:14:44). That is **a candidate, not a finding** (CONDITION-A). Under account (ii) no close was involved.
  - **Plan 10 test added:** a stale socket whose close was requested but never completed is still ignored, and its eventual `close` schedules nothing.
- **B3 — why the readyState predicate (r3, A7) closes the window those sites open.**
  - `:3358-3359` and `:3848-3849` clear `isConnecting` before their delayed `connect()`, so today's guard is open across that delay and `scheduleReconnect`'s timer can land inside it.
  - Under r3 the predicate is `this.ws?.readyState ∈ {CONNECTING, OPEN}`:
    - The first delayed `connect()` sees the old socket at CLOSING, detaches it, terminates it, and builds a new one (CONNECTING).
    - Any second `connect()` from the other scheduler is then refused, because the new socket is CONNECTING.
  - The two sites' `isConnecting = false` writes become irrelevant to the guard and are removed.
- **B4 — "every reader already refuses a stale book" is false at today's code.**
  - `getBookForFill` (`:3609-3630`) applies no age ceiling and no trust test. Holding a suspect book instead of wiping it is safe **only because plan 3 lands in the same commit** (`getBookForFill` returns null for a non-trusted book). This is a stated dependency, not an existing property (#546).
  - **Age ceiling per caller, at the ref:**

| caller | ceiling on a trusted book |
|---|---|
| `depth-source.ts:78` (open depth gate) | `warmth_max_age_ms`, crypto 5,000 ms (`module_constants` `fill_depth_gate`) |
| `aee:2882` → inline exit `selectTouchPrice` | `EXIT_TRIGGER_MAX_AGE_MS` 2,000 ms (`crypto-touch.ts:147`); the book-age *stamp* use has none (record only) |
| `crypto-touch-readers.ts:18` → `selectCryptoTouch` | per caller: entry fill `ENTRY_FILL_TOUCH_MAX_AGE_MS` 8,000 (`:66`); RTB retirement 2,000 (`rtb-retirement-ask.ts:49`); VTS `VTS_EXIT_TOUCH_MAX_AGE_MS` **90,000** (`:88`). The four VTS sites' arguments are read one by one at Step 3 (INFERRED from the constant until then) |
| `signal-orchestrator.ts:2642` | record-only (level-basis observation ceiling); decides nothing |
| `vts-runner.ts:1787` | record-only |

  - Every decision reader applies some ceiling. **A trusted book that goes quiet is served up to 90 s by the VTS exit lane.** This is recorded for item 2 (`#1222`), which owns the shared freshness definition, and is not changed here.
  - The held book's `ageMs` keeps growing because the mismatch `continue` sits above the stamp (`:1193`), and that is what makes holding workable.
- **B5 — `softResubscribeAll` drops every subscription on a slow handshake.**
  1. It captures the set into a local at `:3853`, then clears `subscribedSymbols` (`:3854`) and `pendingSubscriptions` (`:3855`).
  2. After `await connect()` it sleeps 1,000 ms (`:3862`) and resubscribes only `if (this.isConnected …)` (`:3864`).
  3. If the handshake is slow, the whole set is dropped with no retry, and **the failure path emits nothing at all**: its only log line, `:3866`, sits inside the `if`.
  4. Neither `handleOpen` branch can rescue it. `pendingSubscriptions` is empty (`:617`), and `subscribedSymbols` was cleared at `:3854` and is cleared again at `:629`. The reconnect branch restores open positions only (`:626-630`), so RTB-queued books (`rtb:2384`, `#506`) are lost.
  - **Disposition 2 — added to item 2, `B-PRICE-FEED-COVERAGE` (`#1222`)**, which already owns "the reconnect must re-subscribe RTB-queued symbols". It is the same defect class on the same path, in a batch Kyle has already agreed.
- **Smaller items:**
  - **Alert key:** episode-scoped since r3 (`book_untrusted:<symbol>:<episode ISO>`). The re-check route's trust restore resolves it, with evidence.
  - **Counter reader:** all five new counters and the skip count are served by `getBookIntegrityCounters` → `GET /api/active-engine/book-integrity` (`routes.ts:13268`). That route, and the Step-7 read of it, are their reader.
  - **`sentinelResets` client reader:** none. That is Langston's controlled zero in `client`, `scripts` and `routes.ts`, reached only through `getHealthMetrics()`.
  - **Citations:** `reconnectAttempts = 0` sits at `:551` / `:605` (A7).
- **Log retention:** surfaced to Kyle, **SURFACED — awaiting Kyle's slot** (`RUNNING_ISSUES`, Langston's sixth state under Kyle's 2026-10-19 rule). Not placed by us.

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
  - **Each removal needs zero callers AND no surviving reader of what it wrote.** For `sentinelResets` see r3 BLOCKER-2: it is read only transitively through `getHealthMetrics()` (four adapter sites); the same-named counter in `verification-test-protocol.ts` is untouched.

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
- **One resync is the least that can recover a dropped frame.** That is the whole argument for it. The 17.8M healthy checks are the wrong population for any claim about a desync: the one episode we have was not transient (r3 BLOCKER-3).
- The fresh snapshot carries its own checksum and is verified in the same block (`:685`, `:1111`). A mismatch there proves **our computation disagrees with the venue**, not that the venue's book is bad. So it confirms only after the automatic once-per-episode `AssetPairs` precision re-read, if the next snapshot still mismatches at the re-read precision.
- **A second desync within 60 s of a restore** also confirms. **This is a judgement**, with no measured inter-arrival distribution behind it (n = 1 episode, frames gone).

## B. PLAN (each item cites the audit finding it falls out of)
1. **(A2 sockets, r2) One socket at a time — the carrier.**
   - `connect()` detaches, then terminates, the previous socket, **in that order** (`removeAllListeners()` before `terminate()`). Otherwise `terminate()` fires `close` (1006), which runs `handleClose`, which runs `cleanup()` and `scheduleReconnect` against the new socket: a competing reconnect, plus a cleared heartbeat timer.
   - **The identity guard lives in the closure** (`const sock = new WebSocket(...); sock.on('message', d => { if (this.ws !== sock) return; … })`), because today's handlers carry no sender identity (`:580-584`).
   - **The guard is the first statement in every handler, above any state write (C-3).** `handleMessage`'s own first two statements are the load-bearing ones:
     - `:650` writes `lastMessageTime`, which the global monitor's 45 s check reads (`:3285` / `:3291`).
     - `:653` writes `lastHeartbeat`, which the 90-monitor's 60 s check reads (`:3788` / `:3793`).
   - Why that matters: `reconnectWithBackoff`'s only caller (`:3293`) sits inside the monitor it then stops (`:3347`). That leaves the 90-monitor as the only surviving reconnect path, and on 10-13 the orphan's frames kept its clock fed. **That is why nothing recovered.**
   - So guarding above `:650` **re-arms recovery**, not only drops stale data. **Test twin:** an orphan's message moves neither clock.
   - **It guards all five handlers:**
     - `open`;
     - `message`;
     - `close` — an orphan's close would flip `isConnected` false and schedule a reconnect against the live socket;
     - `error`;
     - `pong` — an orphan's pong at `:1481` would refresh `lastPongTime` and hide a dead current socket from the `:1489` timeout.
   - **`connect()` refuses while `this.ws?.readyState` is CONNECTING or OPEN (A7)**, not on `isConnecting`, so two schedulers firing for one drop open one socket.
   - CLOSING (2) is deliberately outside the refusal set, so the graceful-close sites `:3352` / `:3831` still proceed. **Do not "simplify" the predicate to `!== CLOSED`.**
   - **CONNECTING is now a refusal state, so it is bounded** (record item (a)). `new WebSocket(url, { handshakeTimeout })`: a hung handshake errors and closes, which runs the guarded `handleClose`, which runs `scheduleReconnect`.
     - Today a hung first handshake has no monitor and no retry, because the 90-monitor starts only at `handleOpen:615`.
   - **`reconnectRetries` resets in `handleOpen` beside `:605`** (record item (e)). Today the backoff is pinned at 60 s from the 6th episode for the life of the process.
2. **(A6, A4, r2 wipe loop) The breaker, which closes the loop at its source.**
   - **Never clear the mirror unless a resubscribe can actually be sent.**
     - If the socket is not connected, or a resync for that symbol is already in flight, the mismatching book is held as `suspect` and nothing is cleared.
     - A wipe with no path to a snapshot is strictly worse than holding the book. **Holding is safe only because plan 3 makes `getBookForFill` return null for a non-trusted book in the same commit.** Today it serves any non-empty book with no age or trust test (B4, #546), so that is a stated dependency, not an existing property.
     - The per-symbol in-flight entry also de-dupes, so a mismatch at frame rate cannot become a resync at frame rate.
   - **States per symbol:** a trust record `trusted → suspect → untrusted`, held in its own map that no reset path clears.
   - **First mismatch:**
     - The symbol moves to `suspect`.
     - The book is ignored until a fresh snapshot arrives.
     - **One** resync goes out: book channel only, through `sendBookUnsubscribe` and then a book-only subscribe, never through `unsubscribeFromSymbols`.
     - It is guarded by an in-flight entry, so a burst of mismatches sends exactly one.
   - **Before confirming (BLOCKER-3):** one automatic `AssetPairs` precision re-read per episode, then verify against the next snapshot.
   - **Confirmation (the breaker's definition)** → `untrusted` when either holds:
     - the snapshot still mismatches at the re-read precision;
     - a second desync arrives within 60 s of a restore (a judgement, stated as one).
   - **Consequences of `untrusted`** (record item (f): these are not confirmation conditions):
     - the book channel is cancelled;
     - no further book or resync request is sent;
     - the ticker is untouched;
     - the emit to the price cache stops.
   - **Snapshot match → `trusted`.**
3. **(A2, A3) The filter and the doors.**
   - `subscribeToSymbols` sends the book only for trusted symbols. The breaker's own resync and the operator re-check pass through explicitly.
   - The raw book subscribe in `switchToBookChannel` is gated the same way.
   - `getBookForFill` returns null for a non-trusted book, the same commit as plan 2 (B4 dependency).
   - **The four `bookEligible:true` hardcodes become trust-aware.** They are all crypto-gated (`so:2641`, `vts:1781`), so the change cannot reach xStock.
     - **A non-trusted book gets its own refusal value, `book_untrusted`, and a fourth `TickerAcceptBookVerdict` member (C-5).** It is never `book_not_eligible`: the contract at `touch-price.ts:23-25` and `level-basis.ts:400-401` separates "we did not use the book" from "the book was bad".
     - `level-basis.ts:400-401` then describes the new value.
   - The ticker rung refuses `producer === 'ws_book'` on non-trusted symbols.
   - `getLatestPriceData` reports trust.
4. **(scope obj 3/4) Alert and recovery.**
   - **Alert:** one per symbol per episode, `breakage`, `warning`. It carries both CRCs, the precision, the count, the venue replies and the state. Key: `book_untrusted:<symbol>:<episode ISO>`. **The recovery route resolves it on restore, with the snapshot match as evidence** (`#982`; the resolve path requires evidence). Never acked.
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
   - `sentinelResets` is removed at **six** adapter sites (C-4): the declaration `:402`, the increment `:3416` (inside `handleChannelTimeout`), `:3479`, `:3542`, `:3557` and `:3571`. The same-named counter in `verification-test-protocol.ts` is untouched.
   - p7b test 3's invariant is re-pointed onto the breaker's resync.
9. **(A2) The `instrument` subscribe** leaves the per-symbol path (`:1618`). It is sent once per socket open.
10. **Tests.** Every negative ships with its twin; the existing tests named in the readers' census (b507, p7b, p7a, p7d, obj8c, 8a-p3, rtb-retirement-ask, p7i, the 8a-p1 fences, p19-b4b1) are re-run or re-pointed.
    - **The wipe loop:**
      - a mismatching stream with the socket disconnected clears nothing and sends nothing;
      - N mismatching frames with a resync in flight send no second resync and no second wipe.
    - **One socket:**
      - a second `connect()` detaches, then terminates, the first;
      - a stale socket whose close was requested but never completed is ignored, and its eventual `close` schedules nothing (B2);
      - two schedulers firing for one drop open exactly one socket (B3);
      - terminating the old socket schedules no reconnect;
      - an old socket's `pong` does not refresh `lastPongTime`;
      - a message from a stale socket is ignored;
      - a late `close` from a stale socket schedules nothing.
    - **The breaker:** the burst/one-resync case, the snapshot confirm/restore pair, the 60 s second-desync case, the filter at each door including `switchToBookChannel`.
    - **Readers:** the reader-side refusals, the `ws_book` literal.
    - **Bounds and re-check:** the precision bound, and the re-check route.
11. **Governance:** SIM §2.1 plus a cross-cutting registry row; System Manual §8 and §18.0.1; `#1220`; BATCH_CATALOG; PHASE_HISTORY; `DELETED_COMPONENTS_LOG`; the plan line; the task list; memory.

No `UNAUDITED` items. **Blast radius:** the Kraken spot WS adapter's socket lifecycle and book path, and five book readers. The ticker path is unchanged, except that the cache no longer takes a non-trusted book's prices.
