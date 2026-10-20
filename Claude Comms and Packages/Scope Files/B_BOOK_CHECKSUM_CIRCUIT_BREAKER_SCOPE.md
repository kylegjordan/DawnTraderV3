# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — SCOPE (Step 1, r2 — Langston's C-1…C-7 folded)

change-class: architecture

**Issue:** `#1220` · **Plan:** `SPRINT_TO_LIVE_PLAN` §0a, CC-B pre-sprint item 1 (Kyle-assigned 2026-10-20) · **Owner:** CC-B (NEW Claude) · **Board:** `PVTI_lAHODmulEM4BfQP4zhCKK0I`
*r1 committed `c20dca449`; Langston graded it at `e9dc07f2e` and sent it back with C-1…C-7, folded below.* Class `architecture` because the batch adds per-symbol cross-cutting state (a book's trust) that five consumer lanes read.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (r1 §0):** a book that keeps mismatching freezes its own age and *reads as a quiet book* to every freshness consumer. **NOW:** the frozen stamp makes the book read *increasingly stale* (`ageMs = Date.now() − updatedAt`, `:3629`), so the warmth gate refuses it, which is fail-safe. What is actually blind is the one instrument built to detect book-maintenance drift: the book-vs-ticker probe (`:949-960`) returns `unaligned` once the book's receipt is more than 250 ms old (`book-ticker-disagreement.ts:29/:76`). **REASON:** Langston C-4, re-derived at the ref.
- **PREVIOUSLY STATED (r1 obj 2):** untrusted reads are refused by `getBookForFill`, described as "the fill path". **NOW:** there are four call sites and five consumer lanes, and a global null would silently demote three of them to the ticker. **REASON:** Langston C-1.

## 0. What is there, and what happened
- **The check.** Every Kraken WS book delta carries a CRC32 checksum. `kraken-websocket-adapter.ts:1163-1178` recomputes it over our mirrored book at the pair's precision. The precision comes from the v2 `instrument` channel: one writer at `:1037`, one reader at `:1164`, and no delete anywhere in the file.
- **On a mismatch** it logs `[#507][BOOK_CHECKSUM_MISMATCH]` (`:1175`), calls `void this.softResubscribe(symbol)` (`:1176`) and `continue`s (`:1177`). An unmapped symbol skips verification (fail-open, `:1163-1166`).
- **The checksum** is computed by `computeBookChecksumFromRaw` (`:3705`, static, `:3710-3729`). It formats each level with `Number(v).toFixed(dp)` at the declared precision, then strips the decimal point and leading zeros. That is a rounding operation through a double.
- **`softResubscribe` (`:3737-3769`)** clears the per-symbol state maps (`:3745-3753`), including `pendingSubscriptions` (`:3748`) and `subscriptionAcks` (`:3749`). It does **not** clear `symbolPrecision`. It sends an unsubscribe, waits 500 ms inside the call, and subscribes again.
  - `subscribeToSymbols` (`:1527-1569`) does not dedupe on `pendingSubscriptions`, which is only the queue used while disconnected.
  - So there is no in-flight guard. Each mismatching delta starts another resync, fire-and-forget.
- **2026-10-13** (re-derived in `error__2026-10-14_00-00-00.log`):
  - 715,683 mismatch lines on three pairs: OOB/USD 269,272, S/USD 253,896, CAP/USD 192,515.
  - Then 78,824 `Exceeded msg rate` rejections from 14:31:38Z.
  - Then 10 HTTP 429 handshake refusals, and `[KrakenWS] Max reconnect attempts reached` at 14:40:37Z and again at 17:14:48Z.
  - How long the trading feed stayed down is unreadable, because the stdout logs have rotated away.
- **The check works today.** Live `GET /api/active-engine/book-integrity`, since 2026-10-18 05:33Z: 17,732,681 attempts, 17,732,681 matches, 0 mismatches, 0 crossed, 53 symbols. The 10-13 episode is the only one in the retained error logs (2026-10-06 → now).
- **The five lanes that read the book through `getBookForFill`.** Langston's census, four call sites:
  - `depth-source.ts:78` → `_evaluateOpenDepthGate`. Fail-closed: a null blocks OPENS.
  - `active-execution-engine.ts:2882` → exit book-age stamp. Null-tolerant (`:2888`).
  - `crypto-touch-readers.ts:18` `CRYPTO_TOUCH_READERS.getBook` → three consumers:
    - the live exit stop/target touch (`active-execution-engine.ts:374`)
    - the VTS (`vts-runner.ts:198`)
    - RTB retirement (`rtb-retirement-ask.ts:30`)
  - On this third lane a null book does **not** refuse. `selectCryptoTouch` (`crypto-touch.ts:228-243`) hardcodes `bookEligible: true` at `:242` and falls to the ticker rung. The file's own warning at `:13-14` calls this invisible demotion.
- **The entry fallback when no book is served is already decided:** `SYSTEM_IMPACT_MAP.md:378`, `BATCH_CATALOG.md:666`, `#507`'s 2026-08-24 rider, `B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md:252`. Disposition (1); not re-opened here.
- **Stale comment on the trading path.** `routes.ts:13261` still says verification is "OBSERVE-ONLY and never resubscribes". Both halves stopped being true at `3bd9f4022`.

## 1. Provenance (Tier 1) and disposition
- **Corpora searched:** `RUNNING_ISSUES` (`#507`, `#1220`), `BATCH_CATALOG` (B-BOOK-TRUNCATE-HOTFIX), `git log -S "softResubscribe" --reverse`, `git log -S "BOOK_CHECKSUM_MISMATCH"`, and the System Impact Map / System Manual book entries. The pre-audit cites their lines. `bridge/canonical/` is read at Step 2.
- **Introducing commit, quoted** (`3bd9f4022`, 2026-08-23):
  > "With precision known, a mismatch logs loudly and triggers softResubscribe for a fresh snapshot, which is the desync recovery #507 named as unbuilt on 2026-07-15."
  >
  > "FAILS OPEN, per Langston's condition … an unmapped symbol SKIPS verification … it never resubscribes."

  It was proven then on 34,549 of 34,549 checksums matched on the live venue. The same commit measured the instrument feed as one snapshot and zero updates in 60 s (`:672-675`). Updates are routed through the same handler (`:676-679`); whether Kraken ever sends one is unestablished.
- **`softResubscribe`** predates the checksum (`[8.9.5]`, Replit era). It was a one-off manual resync. Its provenance is quoted at Step 2.
- **Disposition (2): relevant but needs updating.** Resyncing on a genuine desync is right. Doing it per message, unbounded and unconfirmed, is the defect. Langston recorded his own 2026-08-24 fail-open condition as having closed only the unknown-precision entrance (LEDGER, retraction 126).

## 2. Objectives
Kyle, 2026-10-20: *"a better detection system … when we can properly and reliably check and confirm that, then we can stop the requests for that symbol straight away"*.

1. **Confirm before acting, then stop at once.**
   - A first mismatch triggers **one** resync. It is guarded by a new per-symbol in-flight record that `softResubscribe` does not clear (C-5: neither existing map can serve). A burst of mismatching deltas therefore starts one resync, never N.
   - **Confirmed** means the mismatch persists on the authoritative fresh snapshot or its first deltas. A dropped message cannot explain that; our computation of that pair can.
   - On confirmation, resync requests for that symbol **stop immediately**. Nothing more is sent for it.
   - The resync either re-learns the pair's precision from the `instrument` channel or states why it doesn't. A wrong cached precision is the leading candidate, and the cache is never cleared.
   - Thresholds and their reasoning are stated in the pre-audit, not guessed.
2. **A confirmed book is UNTRUSTED, and each lane knows why** (C-1).
   - The untrusted state is carried into `selectCryptoTouch` as `bookEligible: false`. The exit touch, the VTS and RTB retirement then record *why* they demoted to the ticker; they no longer reach it silently.
   - The ticker rung's own age and spread ceilings then decide. If the ticker is also unusable, the selection refuses and we hold. That is the standing posture, and it is a risk-moving consequence stated here.
   - `depth-source.ts` blocks opens on an untrusted book, as it does on a null today.
   - The exit book-age stamp records "untrusted", never a frozen age.
3. **One alert per episode** (C-6).
   - It names the symbol, both CRCs, the precision used, the count before confirmation, and the terminal state.
   - The dedupe key is per symbol **per episode**, so an earlier episode can never suppress a new one. Under the leading cause, this alert may be the only instrument that ever reports the terminal state.
   - Resolved by hand, never acked (`#982`).
4. **The terminal state, and recovery only where recovery can work** (C-3).
   - **Terminal:** a confirmed symbol stays untrusted and silent (no requests) until an operator re-check, or until a precision re-learn changes its formatting inputs.
   - **A time-based retry is not built.** If the cause is a wrong precision, no resync and no re-check can ever match, so a retry would be dead by construction.
   - The operator re-check is one fresh snapshot, made only after a precision re-read, and a match restores trust. It is capped at one per call and never loops.
5. **The 10-13 cause, by offline reproduction** (C-3).
   - Feed the static `computeBookChecksumFromRaw` the venue's own strings for OOB/USD, S/USD and CAP/USD. Sources: Kraken's current `instrument` precision for each, and book frames captured now or recovered from `[I7-WS-RAW]` logs where retained. Compare to Kraken's CRC.
   - Fix the cause found. If it isn't found, state what the reproduction ruled out.
   - **Riders:**
     - `handleInstrumentMessage` admits any integer precision (`Number.isInteger` only). A negative value or one above 100 would throw a RangeError from `toFixed` inside the book handler, so bound it.
     - "Instrument updates are not applied" is struck as a candidate: they are routed (`:676-679`).
6. **Counters and the drift instrument** (C-4).
   - Correct `routes.ts:13261`.
   - Add per-symbol `resyncsSent`, `confirmed` and `untrusted` to `getBookIntegrityCounters`, so the next episode is countable live.
   - Make the book-vs-ticker drift probe report an **untrusted** book as its own outcome. Today it reads such a book as `unaligned` and so cannot see the one symbol whose maintenance is failing.
7. **Tests** (each negative assertion ships with its positive twin):
   - A burst of N mismatching deltas sends exactly one resync; a single clean delta sends none.
   - A mismatch on the fresh snapshot confirms and sends **zero** further requests; a match on it restores and sends none.
   - Untrusted reaches `selectCryptoTouch` as `bookEligible: false` with its reason; a trusted book still selects the book rung.
   - `depth-source` blocks an open on an untrusted book.
   - The operator re-check restores only on a match.
   - Out-of-range precision is refused at the instrument handler.
   - The existing fail-open (unknown precision skips, never resyncs) is unchanged.
   - Plus the offline reproduction's cases.
8. **Step 7.** On staging the healthy-case counters hold: matches equal attempts; 0 confirmed, 0 untrusted, 0 resyncs. **That supports exactly two claims:** the counters are wired, and the breaker is not misfiring in the healthy case. It says nothing about the confirm path, which only the suite carries (C-7). No live silence is cited for it, and the first real episode is a forward read on `#1220`.

**Not in this batch:** widening the live feed and the shared definition of "fresh" (item 2, `B-PRICE-FEED-COVERAGE`, `#1222`). That batch consumes this batch's trust state.
**Item 2 carries a related finding from the steadiness audit:** the reconnect re-subscribes held positions only (`:626-630`), so an RTB-queued symbol is silently dropped after a reconnect. Measured: AVA's 70-minute outage on 2026-10-19.

**Docset (architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (the new per-symbol trust state and its five lanes), `SYSTEM_MANUAL` (book integrity in the market-data chapter), `RUNNING_ISSUES` `#1220`, the plan line, the task list, and the memory files.
