# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — SCOPE (Step 1, r1)

change-class: architecture

**Issue:** `#1220` · **Plan:** `SPRINT_TO_LIVE_PLAN` §0a, CC-B pre-sprint item 1 (Kyle-assigned 2026-10-20) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` `326f5f70a`, 2026-10-20.* Class `architecture` because the batch adds per-symbol cross-cutting state (a book's trust) that the fill path reads.

## 0. What is there, and what happened
- **The check.** Every Kraken WS book delta carries a CRC32 checksum. `kraken-websocket-adapter.ts:1163-1178` recomputes it over our mirrored book at the pair's precision (from the v2 `instrument` channel) and, on a mismatch, logs `[#507][BOOK_CHECKSUM_MISMATCH]`, calls `void this.softResubscribe(symbol)` and `continue`s. An unmapped symbol skips verification (fail-open, `:1163-1166`).
- **`softResubscribe` (`:3737-3769`)** clears every per-symbol state map, including `pendingSubscriptions` and `subscriptionAcks` (`:3748-3749`), sends an unsubscribe, waits 500 ms and subscribes again. It has no cooldown and no in-flight guard. Each mismatching delta starts another one, fire-and-forget.
- **2026-10-13 (re-derived in `error__2026-10-14_00-00-00.log`):**
  - 715,683 mismatch lines on three pairs: OOB/USD 269,272, S/USD 253,896, CAP/USD 192,515.
  - Then 78,824 `Exceeded msg rate` rejections from 14:31:38Z.
  - Then 10 HTTP 429 handshake refusals and `[KrakenWS] Max reconnect attempts reached` at 14:40:37Z and 17:14:48Z.
  - How long the trading feed stayed down is unreadable: the stdout logs have rotated away.
- **The check works today.** Live `GET /api/active-engine/book-integrity`, since 2026-10-18 05:33Z: 17,732,681 attempts, 17,732,681 matches, 0 mismatches, 0 crossed, 53 symbols. The 10-13 episode is the only one in the retained error logs (2026-10-06 → now).
- **Second consequence (Langston, at `897504a57`).** The mismatch `continue` (`:1177`) sits above the freshness stamp `bookUpdatedAt.set` (`:1193`). A book that keeps mismatching therefore freezes its own age and reads as a quiet book to every freshness consumer.
- **Stale comment on the trading path.** `routes.ts` around `:13258-13262` still says mismatches are "EXPECTED" and that verification is "OBSERVE-ONLY and never resubscribes". Both stopped being true at `3bd9f4022`.

## 1. Provenance (Tier 1) and disposition
- **Corpora searched:** `RUNNING_ISSUES` (`#507`, `#1220`), `BATCH_CATALOG` (B-BOOK-TRUNCATE-HOTFIX), `git log -S "softResubscribe" --reverse`, `git log -S "BOOK_CHECKSUM_MISMATCH"`, and the System Impact Map / System Manual book entries (pre-audit will cite their lines). `bridge/canonical/`: to be read at Step 2.
- **Introducing commit, quoted** (`3bd9f4022`, 2026-08-23):
  > "With precision known, a mismatch logs loudly and triggers softResubscribe for a fresh snapshot, which is the desync recovery #507 named as unbuilt on 2026-07-15."
  >
  > "FAILS OPEN, per Langston's condition … an unmapped symbol SKIPS verification … it never resubscribes."

  Proven then: 34,549 of 34,549 checksums matched on the live venue.
- **`softResubscribe`** predates the checksum (`[8.9.5]`, Replit era). It was built as a one-off manual resync, not as something called per message. Provenance is to be quoted at Step 2.
- **Disposition (2):** relevant but needs updating to today's intent. Resync on a genuine desync is right. Doing it once per message, with no bound and no confirmation, is the defect. Langston has recorded his own 2026-08-24 gate condition as having closed only the unknown-precision entrance, not this one (his LEDGER, retraction 126).

## 2. Objectives (Kyle 2026-10-20: "a better detection system … when we can properly and reliably check and confirm that, then we can stop the requests for that symbol straight away")
1. **Confirm before acting, then stop at once.**
   - A first mismatch on a symbol triggers **one** resync (fresh snapshot). The resync is guarded: at most one in flight per symbol, so concurrent deltas do not start more.
   - **Confirmed** means a mismatch that persists on the authoritative fresh snapshot or its first deltas. That is evidence our computation of that pair is wrong (for example its precision), not a dropped message.
   - On confirmation, resync requests for that symbol **stop immediately**. No further subscribe or unsubscribe is sent for it.
   - The thresholds and their reasoning are stated in the pre-audit. Nothing is guessed.
2. **A confirmed book is UNTRUSTED, and every reader sees that.** It is no longer served as a book. The fill path (`getBookForFill`) and the freshness consumers read "untrusted", never a frozen age, so a broken book can never pass as a quiet one. What the fill path falls back to today when no book is served is documented. If that fallback is wrong, it is fixed here, never silently.
3. **One alert per episode.** It names the symbol, our CRC, Kraken's CRC, the precision used, and the count of mismatches before confirmation, plus the recovery state. It carries an owner and a dedupe key. It is resolved by hand on recovery, never acked (`#982`).
4. **Recovery is bounded and explicit.** It is either a single scheduled re-check (one fresh snapshot; a match restores trust and resolves nothing silently) or an operator re-check route. Which one is decided at Step 2, with the cap stated. It never becomes a loop.
5. **The cause of 10-13, found or bounded.** Why did exactly these three pairs mismatch persistently? Candidates to test: an instrument-precision change after our snapshot (we read one snapshot, and whether `instrument` updates are applied is to be read), the truncation depth, or a malformed level. Fix it if found. Otherwise, say what was ruled out.
6. **Correct the stale `routes.ts` comment** (`:13258-13262`) and keep `getBookIntegrityCounters` accurate. It adds per-symbol `confirmed` / `untrusted` / `resyncsSent` counts, so the next episode is countable live, not only from rotated logs.
7. **Tests.**
   - A burst of N mismatching deltas sends at most one resync.
   - A mismatch on the fresh snapshot confirms and sends **zero** further requests.
   - Untrusted reads are refused by `getBookForFill`.
   - Recovery restores trust only on a match.
   - The existing fail-open (unknown precision skips) is unchanged.
   - Every negative assertion ships with its positive twin.
8. **Step 7.** The counters on staging are unchanged in the healthy case: matches equal attempts, 0 confirmed, 0 untrusted, resyncs 0. The confirmed path cannot be produced live on demand, so it is carried by the suite. No live silence is cited as proof it fires. The first real episode is a forward read on `#1220`.

**Not in this batch:** widening the live feed and the shared definition of "fresh" (item 2, `B-PRICE-FEED-COVERAGE`, `#1222`). That batch consumes this batch's trust flag.
**Docset (architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (a new cross-cutting per-symbol state and its readers), `SYSTEM_MANUAL` (book integrity in the market-data chapter), `RUNNING_ISSUES` `#1220`, the plan line, the task list, and the memory files.
