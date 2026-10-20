# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — SCOPE (Step 1, r3 — Langston's D-1…D-8 folded)

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

  Both record-only sites carry the comment *"eligible by construction … never fires on this leg"*. This batch falsifies it. The signal-birth funnel is item 3's measurement surface.
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
   - **Confirmed** = the mismatch persists on the fresh snapshot or its first deltas. On confirmation, every request for that symbol **stops immediately**.
   - Thresholds and their reasoning go in the pre-audit.
2. **A confirmed book is UNTRUSTED, in every lane that reads it (D-1, D-2).**
   - The untrusted state replaces all four hardcoded `bookEligible:true`: `crypto-touch.ts:242`, the inline exit trigger `active-execution-engine.ts:2984`, `signal-orchestrator.ts:2712` and `vts-runner.ts:1804`. Each lane records *why* it left the book rung.
   - For the decision lanes (exit trigger, entry fill, RTB retirement, VTS), the ticker rung's own age and spread ceilings then decide. If those fail too, the selection refuses and we hold. That is the standing posture, and it is stated as a risk-moving consequence.
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
5. **The 10-13 cause — two arms, because one test cannot tell them apart (D-4, D-5).**
   - **Arm A, the formatter.** Feed the static `computeBookChecksumFromRaw` the venue's strings for OOB/USD, S/USD and CAP/USD. Use today's `instrument` / `AssetPairs` precision and any 10-13 book frames recovered from `[I7-WS-RAW]` where retained.
     - **Stated limit:** today's precision cannot test a precision the venue may have declared differently on 10-13. S/USD matching 54,597 times since 10-18 counts against a formatter fault that persists today.
   - **Arm B, the subscription state.** The venue-reply census above shows local state wiped 715,683 times while the venue-side subscription was refused or never re-established. Test whether a mirror rebuilt from deltas alone, with no fresh snapshot, can ever re-converge. Do this from the logged message sequence.
   - Langston's lead is **recorded and not built on**: `theirs[i] == ours[i−1]` on 105 of 715,683 lines.
   - Fix what either arm establishes. Otherwise state what each ruled out.
   - **Rider:** bound `handleInstrumentMessage`'s precision to a valid range. Today it checks `Number.isInteger` only, so an out-of-range value throws inside the book handler.
6. **Counters and text (D-6, D-7, D-8).**
   - `getBookIntegrityCounters` gains, per symbol: `resyncsSent`, `confirmed`, `untrusted`, `subscribeRejected`, and the existing `bookChecksumSkippedNoPrecision`.
   - Correct all three false clauses at `routes.ts:13258-13261`, the adapter docblock at `:3644-3649`, and both "eligible by construction" comments.
   - The drift probe reports an untrusted book as its own outcome. It stays record-only (`BOOK_TICKER_ALERT_ARMED = false`), so no read cites it as detection.
7. **Tests (each negative with its positive twin):**
   - A burst of N mismatching deltas sends exactly one resync, and no instrument resubscribe. A single clean delta sends none.
   - A mismatch on the fresh snapshot confirms and sends zero further requests. A match restores and sends none.
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
