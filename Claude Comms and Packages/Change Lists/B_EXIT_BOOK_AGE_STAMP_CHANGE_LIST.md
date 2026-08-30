# B-EXIT-BOOK-AGE-STAMP — CHANGE LIST (Step 4)

**READY AT: `origin/migration/aws-supabase` @ `279f4c2c6`** · 13 files, +375 / −64
**change-class:** `non_architecture` · **Owner:** CC-C
**Design (B) — Langston-ruled 2026-08-30; four Step-1 conditions and three Step-2 conditions all applied.**
**Gate for this dispatch: the diff. One ask.**

> ⭐ **CI EVIDENCE AT THE REF:** fence suite **16/16**, `p19-b8-9-venue-only-source` + `p19-b8-9a-source-tag-honesty` **14/14**, `check-tsc-baseline.mjs` **384 = 384, no regressions.**

---

## 1. WHAT THIS BATCH DOES, IN ONE PARAGRAPH
Records two facts on every close and **changes no behaviour**: (a) the age of the depth snapshot the FILL actually walked, into a new nullable column; (b) whether the number that DROVE the exit was a midpoint or a last trade — recorded by **splitting three coarse `PriceProducer` members**, not by a new column. Nothing is gated, refused, delayed or re-priced.

---

## 2. ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

1. ⛔ **THE COARSE NAMES ARE GONE, NOT ALIASED.** I did not keep `kraken_ws_ticker` as a deprecated member. **Every historical row keeps its old string** — the union is a compile-time vocabulary, not a DB constraint — but **any query spanning the split epoch must enumerate both.** I judged an alias worse: it would let a new call site keep stamping the coarse name and the split would rot silently. **If you think the alias is the safer trade, say so — it is reversible now and not after the soak.**
2. ⛔ **`markKind` IS REQUIRED ON `V1TickerFormat`, NOT OPTIONAL.** Reasoning is `#546`'s: an optional field lets a future producer omit it and that absence is indistinguishable from a missed stamp. **Cost: it is a shared translator contract, and I widened it after telling you in r5 I would not.** I changed position because the alternative — re-deriving at the adapter from `a[0]`/`b[0]` — is exact **only** while both are written from the same locals, an unstated invariant of a function neither end owns.
3. ⛔ **THE NEW COLUMN IS POPULATED ON xSTOCK, WHERE IT IS A ROW AGE, NOT A BOOK AGE.** I rejected crypto-only: `#961`'s headline is overwhelmingly xStock (0/26 populated), so a crypto-only column deletes the measurement where it matters most. **The name and both comments carry the class distinction instead.** ⚠️ **This is the residual risk of the batch: a future reader pooling the two classes gets a meaningless number, and only a comment stops them.**
4. ⛔ **I LEFT `active-execution-engine.ts:1393` ALONE** (*"NULL ON EVERY BRANCH TODAY"*) because it is narrowly true of the **payload field**, which is still hardcoded null, while the **column** is filled from `_witness`. **Two write sources, different statuses, no single comment describing both. Check I drew that line right.**

---

## 3. NEW FILE — `server/services/market-data/mark-kind.ts`
The mid-or-last rule existed in **four** files with no two sharing a line. A leaf module (imports nothing) because both asset classes and the engine call it.
```ts
export function markKindOf(bid: number, ask: number): 'mid' | 'last' {
  return (bid > 0 && ask > 0) ? 'mid' : 'last';
}
```
⭐ **NaN-safe by construction, and that is load-bearing: the xStock parser coalesces an absent side to `NaN`, the crypto translator to `0`. `NaN > 0` is false, so one predicate serves both without either caller changing its coalescing.**

---

## 4. MODIFIED — `server/services/live-pricing-adapter.ts` (+93/−23)

**THE UNION — BEFORE:**
```ts
  | 'kraken_ws_ticker'                 // kraken-websocket-adapter.ts:692 handleV2TickerUpdate
  | 'kraken_ws_book_mid'               // :916 handleV2BookUpdate — THE #741 PATH (book midpoint)
  | 'kraken_ws_ticker_v1'              // :1049 handleTickerUpdate — UNREACHABLE, see #742
  | 'kraken_equities_ws'               // active-execution-engine.ts:1140 (ref corrected 2026-08-26 — was :1145)
  | 'kraken_rest_engine_fallback'      // active-execution-engine.ts:1201 (ref corrected 2026-08-26 — was :1220)
  | 'kraken_rest_poller'               // this file :369, inside fetchLivePrice
```
**AFTER** (comment block abridged; the three NOT-split members each carry their reason):
```ts
  | 'kraken_ws_ticker_mid'             // kraken-websocket-adapter.ts:700 — the common arm
  | 'kraken_ws_ticker_last'            // :700 — the one-sided/empty-book arm
  | 'kraken_ws_book_mid'               // :945 — NOT SPLIT: no last-trade arm at all
  | 'kraken_ws_ticker_v1'              // :1081 — NOT SPLIT: unreachable (#742)
  | 'kraken_equities_ws_mid'           // active-execution-engine.ts:1236 (+ updateCache arg :1244)
  | 'kraken_equities_ws_last'          // same site; latestEquityTick.kind decides
  | 'kraken_rest_engine_fallback_mid'  // active-execution-engine.ts:1309 (+ :1332)
  | 'kraken_rest_engine_fallback_last' // same site — ask/bid in scope at :1301-1303
  | 'kraken_rest_poller'               // ⛔ DELIBERATELY NOT SPLIT: THREE arms, not two —
                                       //    the rate-limited branch at :631 returns a BARE
                                       //    cached price. #951 splits it when it fixes that.
```
⭐ **P13 — ALL SIX STALE `file:line` ANCHORS CORRECTED, including two that carried an explicit *"ref corrected 2026-08-26"* annotation and were wrong anyway.** *(A correction that went stale reads as freshly checked, which is worse than no anchor.)*

**P14 — THE WITHDRAWN CLAIM, AT ITS REAL HOME.** `:95-97` said widening *"cannot reject a price or skip a position … design (B)'s defining property."* **Narrowed: safe THROUGH THE VENUE GATE (which reads `source`), and the comment now states that `toCachedProducer`'s null arm IS a producer-dependent branch, unreachable today only because of today's call sites.**

**P11 — the six new members added to the PASSTHROUGH arm**, with the reason inline.

---

## 5. MODIFIED — the three producer sites

**`kraken-v2-translator.ts`** — `V1TickerFormat` gains required `markKind`; the predicate call replaces the inline conditional:
```ts
  const markKind = markKindOf(bid, ask);
  const markPrice = markKind === 'mid' ? (bid + ask) / 2 : last;
  ...
    c: [String(markPrice)],
    markKind,
```
**`kraken-websocket-adapter.ts:700`** — BEFORE `producer: 'kraken_ws_ticker'`; AFTER `producer: safeData.markKind === 'mid' ? 'kraken_ws_ticker_mid' : 'kraken_ws_ticker_last'`.
**`equity-spot-archiver.ts`** — `latestEquityTick` value type gains `kind`; ⛔ **`parseTickerSnap`'s logic, guards and `#594`/`#636` stamp ordering are UNCHANGED — a literal field-add.**
**`active-execution-engine.ts:1236 / :1309`** — the two LITERAL producer legs become discriminating literals.
⛔ **`:1244` — ONLY THE PRODUCER ARG CHANGED. The 3rd argument is the `source`, and `isKrakenVenueSource` tests `source === 'kraken_equities_ws'`; splitting THAT would gate real prices.**

---

## 6. OBJ-1 — THE FILL DEPTH AGE
```ts
    let _fillDepthAgeMs: number | null = null;      // hoisted ABOVE the if/else
    if (options?.makerExitFill) { … } else {
      const _closeSnap = … await getDepthSnapshot(position.symbol, _closeClass) …;
      _fillDepthAgeMs = _closeSnap ? _closeSnap.ageMs : null;
      console.log(`[B-EXIT-BOOK-AGE-STAMP][FILL_DEPTH_AGE] symbol=… depthSource=${_closeSnap?.source ?? 'none'} ageMs=…`);
```
⭐ **The hoist is forced, not stylistic: `_closeSnap` is `const`-scoped to the `else` block and the persist is ~280 lines below.** ★ **Same shape as the `_witness` twenty lines down, which is placed below both legs for the same reason — the maker leg consults no depth, so its NULL is honest and is discriminable by `exit_fee_mode='maker'`.**
**The paired log is OBJ-1's crypto verification: nothing persists the WS mini-book, so the column cannot be checked by reconstruction.**

---

## 7. THE DATABASE — one column, six comments
`ALTER TABLE closed_trades ADD COLUMN IF NOT EXISTS exit_fill_depth_age_ms DOUBLE PRECISION;` — nullable, no default (`#546`).
**Comments corrected ON THE LIVE DATABASE** (because `shared/schema.ts` comments are TypeScript and **never** reach Postgres, so schema-vs-DB divergence is this codebase's steady state):
| column | was | now |
|---|---|---|
| `exit_ticker_bid` / `_ask` | *"NOT YET INSTRUMENTED — NULL on every branch"* | ⛔ **18 of 662 rows refute it.** `#911` wired it 08-27. |
| `exit_book_age_ms` | *"Age … at close. NULL BY CONSTRUCTION on xStock."* | **DECISION-time, built once per position ABOVE the exit evaluation; the xStock null is about `getBookForFill`, not the class.** |
| `exit_book_mid` | *"(no book for that class)"* | same bound |
| `entry_book_age_ms` | (write-site called it *"the REAL fill instant"*) | **DEPTH-GATE instant — three awaits before its own walk; and on xStock a ROW age.** |
| `exit_price_producer` | closed vocabulary | **+ the SPLIT EPOCH and the ENUMERATE-never-`LIKE` rule** |

---

## 8. TESTS — `b-exit-provenance-fence.test.ts` (+56)
- **P11:** every one of the six new members returns **non-null** from `toCachedProducer`. ⭐ **The `never` default forces a DECISION, not a CORRECT one; a member in the null arm compiles and silently suppresses the cache write.** ⚠️ **Honest reach: behaviourally load-bearing for `kraken_ws_ticker_*` only — the other four reach the cache via `updateCache(..., producer: CachedProducer)`, which never calls the switch. Asserted for all six because that safety is a call-site fact and call sites move.**
- **Pure re-description:** the three coarse names gone from the union, the three NOT-split members still present.
⚠️ **THE SECOND TEST FAILED ON ITS FIRST RUN AND THE FAILURE WAS CORRECT: it searched the whole file and matched the SOURCE union, where `kraken_equities_ws` legitimately still lives. This batch's own subject, landing on its own test. Now sliced to the producer union first.**

---

## 9. ⛔ WHAT IS NOT DONE, AND IS NOT AN OVERSIGHT
- **`P9` — the SIM entry + SPLIT EPOCH (deploy sha + UTC) lands at Step 10**, because the sha does not exist until Step 6.
- **`#941`, `#952`, `#957`, `#951` are NOT closed.** This batch records what reached the exit; **they ask what the vocabulary SHOULD be.**
- **Three leads homed at `3b.g`, not fixed here** — all correct today, all needing a signature or symbol-form change, all behaviour-adjacent ⇒ `OBJ-3` forbids them.
