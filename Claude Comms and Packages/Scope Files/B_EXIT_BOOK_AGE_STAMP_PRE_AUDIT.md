# B-EXIT-BOOK-AGE-STAMP — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2)

**Batch:** `B-EXIT-BOOK-AGE-STAMP` · **change-class:** `non_architecture` *(conditional — see FINDING-G)* · **Owner:** CC-C · **Phase:** 19
**Audited at:** `origin/migration/aws-supabase` @ `b49730763` · **Scope:** `B_EXIT_BOOK_AGE_STAMP_SCOPE.md` r7
**Design:** ⭐ **(B) — split the coarse members of the existing closed `PriceProducer` union.** Langston's ruling 2026-08-30T10:16Z, four conditions, all carried into scope r7.

> ⛔ **THE AUDIT IS FIRST AND THE PLAN FALLS OUT OF IT. Every plan item back-references its finding; anything without one is flagged `UNAUDITED`.**

---

## §0 — PREVIOUSLY STATED / NOW / REASON

| | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| **the design** | a new `exit_mark_kind` column (scope r2→r5) | ⭐ **no new kind column; split three producer members** | GAP-3's premise was false — the lines cited as forbidding a wider vocabulary are the WS broadcast payload. Langston ruled (B). |
| **members to split** | four | ⭐ **three** | `kraken_rest_poller` has **three** arms, not two (condition 2). |
| **predicate sites** | 2 (r3) → 3 (r5) | ⭐ **4** | a fresh reader found `live-pricing-adapter.ts:645`; a fifth producer (`kraken_ws_book_mid`) already determines its own kind. |
| **`exit_fee_mode` non-stamping close paths** | 3 | ⭐ **6** | `storage.ts:4508`, `routes.ts:12941`, `routes.ts:13052`. |
| **"old rows stay coarse, not wrong"** | asserted | ⛔ **true for a reader, FALSE for a query** | `F-G-2` 3c partitions by exit provenance and would read one cohort as two. Split epoch now recorded. |
| **`#962`'s "0 in 373,450"** | cited generally | ⛔ **xStock ticker-snap population only; the crypto arm is UNMEASURED** | restated from r3's own limit. |

---

## §1 — THE AUDIT

### SOURCES ACTUALLY READ *(all six; named per the step rule)*
1. **CODE at the ref** — `live-pricing-adapter.ts`, `kraken-websocket-adapter.ts`, `kraken-v2-translator.ts`, `active-execution-engine.ts`, `active-portfolio-manager.ts`, `equity-spot-archiver.ts`, `depth-source.ts`, `storage.ts`, `routes.ts`, `price-cache.ts`, `shared/schema.ts`, `drizzle/migrations/2026-08-26-b-exit-provenance.sql`.
2. **DATABASE (live, staging)** — `closed_trades` population counts, quoted inline below.
3. **`SYSTEM_IMPACT_MAP.md`** — `:317-320`, the `B-EXIT-PROVENANCE` component entry.
4. **`SYSTEM_MANUAL.md`** — `:8393-8395`, the `translateV2ToV1` node. ✅ **No contradiction: it already records that `c` is documented as "last trade closed" and that the translator substitutes.**
5. **THE LEDGER** — `#941` (PARTLY-FIXED), `#952`, `#957`, `#951`, `#961`, `#962`, `#546`, `#743`, `#911`. **Result in FINDING-H.**
6. **`bridge/canonical/`** — ⛔ **consulted; NO coverage of the producer vocabulary or the mark predicate. That corpus predates both.** *(Stated because an unstated absence reads as unchecked — §9.5(b).)*

---

### ⭐⭐ FINDING-A — **NOTHING IN NON-TEST CODE READS A PRODUCER VALUE AS A CONDITION. THIS IS WHAT MAKES DESIGN (B) SAFE, AND IT IS MEASURED, NOT ASSERTED.**

**The whole risk of (B) is that splitting a member silently breaks a branch that tested for the old one.** Census, repo-wide, tests excluded:

| probe | result |
|---|---|
| ⭐ **POSITIVE CONTROL — `source ===`** | **20 hits** ⇒ **the instrument DOES see this shape** |
| **`producer ===` / `==` / `!==` / `!=`** | ⛔ **ZERO** |
| **`switch` on a producer variable** | **ONE** — `live-pricing-adapter.ts:117` `toCachedProducer`, a pure narrowing passthrough (every member returns `p` or `null`) |
| **readers of `exit_price_producer` in code** | ⛔ **ZERO** — it is written and read only by analysis queries |

⇒ ✅ **A producer member cannot gate, reject, skip or re-price anything. The property `SYSTEM_IMPACT_MAP.md:320` claims is real and I re-derived it structurally** — `isKrakenVenueSource` (`live-pricing-adapter.ts:181`) tests `source`, and `toCachedProducer` closes on `const _exhaustive: never = p` (`:137-140`), so **a new member is a BUILD FAILURE, not a silent absence.**
⚠️ **AND THE GUARD IS ALREADY AUTOMATED:** `b-exit-provenance-fence.test.ts:211` asserts `expect(gate).not.toContain('producer')`. **Condition 4's tripwire exists and runs in CI today.**

### ✅ FINDING-B — **EACH MEMBER HAS EXACTLY ONE WRITE SITE. FULL ENUMERATION, NOT A SAMPLE.**
| member | union decl | narrowing case | ⭐ WRITE SITE(S) |
|---|---|---|---|
| `kraken_ws_ticker` | `:56` | `:125` | `kraken-websocket-adapter.ts:700` |
| `kraken_equities_ws` | `:59` | `:128` | `active-execution-engine.ts:1236` + `:1244` *(the `updateCache` producer arg)* |
| `kraken_rest_engine_fallback` | `:60` | `:129` | `active-execution-engine.ts:1309` + `:1332` |

⛔ **THE TRAP, NAMED: `kraken_equities_ws` is ALSO a `source` VALUE** (`:1231`, and in the source unions at `:151`, `:167`, `:181`, `:847`, `:1129`). **ONLY THE PRODUCER SPLITS.** `isKrakenVenueSource` tests `source === 'kraken_equities_ws'`; touching that would gate real prices.

### ✅ FINDING-C — **THE SECOND `exit_price_producer` WRITER IS CARRY-ONLY AND NEEDS NO CHANGE**
`active-portfolio-manager.ts:664` writes `exitPriceProducer: priceProducer`, and `:636` sets `priceProducer = liveQuote.producer` — *"A real quote object with a real provenance field — CARRIED, never re-derived."*
⇒ ✅ **The fifth close path inherits the split automatically. Zero edits.** *(Named because r3's census of close paths missed writers; this one is real and is already correct.)*

### ✅ FINDING-D — **THE COLUMN WIDTH HOLDS**
`shared/schema.ts:1794` `exit_price_producer varchar(40)`. **Longest new name: `kraken_rest_engine_fallback_last` = 32 chars.** Longest existing: `last_known_good_all_apis_failed` = 31. ✅ **No overflow.** *(Postgres errors on overflow rather than truncating, so this would fail loudly — but it is cheap to check and expensive to discover at deploy.)*

### ⛔⛔ FINDING-E — **THE ENTRY SIDE ALREADY IMPLEMENTS OBJ-1, AND THE TWO COLUMNS ARE A *FALSE PAIR***
`active-execution-engine.ts:3677` `entryBookAgeMs: _gate.snapshot.ageMs` — with the comment *"★ A REAL book age at the REAL fill instant — the value `entry_book_age_ms` was created for."*
⇒ ⭐ **OBJ-1 is not novel work: it is the entry pattern applied to the exit, and `DepthSnapshot.ageMs` (`depth-source.ts:30`) already exists on both classes.**
⛔⛔ **BUT THE NAMES LIE ABOUT THE INSTANT:**
| column | instant | source |
|---|---|---|
| `entry_book_age_ms` | ⭐ **FILL-time** | `_gate.snapshot.ageMs` at the walk |
| `exit_book_age_ms` | ⛔ **DECISION-time** | `_bookX.ageMs` from `getBookForFill` at `:1382`, before the close is decided |

**And the live DB comments do not distinguish them:** `exit_book_age_ms` reads *"Age of the order-book snapshot at close"* — **no instant qualifier** — while `entry_book_age_ms` is precise about its own carve-out.
⇒ ⛔ **ANYONE COMPARING ENTRY BOOK AGE TO EXIT BOOK AGE TODAY IS COMPARING TWO DIFFERENT INSTANTS, AND NOTHING SAYS SO.** **Measured: 662 closes, `entry_book_age_ms` on 17, `exit_book_age_ms` on 16** — small, post-deploy, and about to grow. **This is exactly the wrong-object class the batch exists to end, already live in the schema.**

### ⭐⭐ FINDING-E2 — **THERE ARE *THREE* INSTANTS, NOT TWO, AND THE ENTRY COLUMN'S OWN COMMENT OVERSTATES ITS PRECISION**

**Re-derived: on the ENTRY the snapshot is fetched at `active-execution-engine.ts:3288` (`_evaluateOpenDepthGate`) and the WALK consumes it at `:3438` (`bookAsks: _gate.snapshot.asks`) — with THREE `await`s in between, including `validatePaperOrderWithVenue` (a venue round-trip) and `evaluateXstockPriceLiveness`.**
⇒ ⛔ **So `entry_book_age_ms` is the age at the DEPTH-GATE evaluation, not at the fill — and its own comment at `:3675-3676` calls it *"★ A REAL book age at the REAL fill instant."* That is not literally true.**

| column | instant | gap to the walk |
|---|---|---|
| `exit_book_age_ms` | **exit DECISION-time** (`:1382`) | the whole exit evaluation |
| `entry_book_age_ms` | **entry GATE-time** (`:3288`) | ⚠ **3 awaits, incl. a venue call** |
| ⭐ *(new)* `exit_fill_book_age_ms` | **FILL-time** | ⭐ **snapshot `:1997`, walk `:1999` — two lines, NO await between** |

⭐ **THE NEW COLUMN WOULD BE THE TIGHTEST OF THE THREE.** ⚠ **And that is the point: a reader comparing any two of these today gets no warning that they are different instants, and one of the three actively claims to be an instant it is not.**
**§9.4 DISPOSITION: (2) ADDED TO THIS BATCH, folded into P8.** P8 already corrects instant-precision on the exit columns; **leaving the entry comment overstating its own would leave the pair misleading in the opposite direction, which defeats the item.** ⛔ **A COMMENT EDIT ONLY — no entry-side behaviour, and the fence's `entryPriceProducer:` count assertion (`:166`) is untouched.**

### ⛔ FINDING-F — **THE LIVE DATABASE ASSERTS AN ABSENCE THAT 18 ROWS REFUTE**
The `2026-08-26` migration's `COMMENT ON COLUMN closed_trades.exit_ticker_bid` reads: *"**NOT YET INSTRUMENTED** - NULL on every branch at the deploy ref, both classes … OBJ-3 OPEN."*
⛔ **`#911` wired the witness on 2026-08-27** (`active-execution-engine.ts:2015-2019`). **MEASURED NOW: `exit_ticker_bid` is NON-NULL on 18 of 662 closes.**
⇒ **The comment was true at its ref and is false today, and `dt-deploy` applied it to the live database — so it is what an analyst reads from `\d+ closed_trades`.** **Same class as GAP-4, in the same comment block this batch already opens.**
**§9.4 DISPOSITION: (1) FOLD INTO THE WORK IN HAND** — the pass is already touching these comments; leaving one known-false beside them would be a deliberate omission.

### ✅ FINDING-G — **THE OBJ-5 FENCE IS COMPATIBLE, AND IT DOES NOT ENUMERATE THE MEMBERS BEING SPLIT**
`b-exit-provenance-fence.test.ts` is a **source-text assertion suite**, not a runtime gate. It names only `kraken_ws_book_mid`, `position_entry_price_reused` and `no_price_produced` — **all three unsplit.** ✅
⚠️ **ONE COUNT ASSERTION TO RESPECT:** `:166` `expect((src.match(/entryPriceProducer:/g) ?? []).length).toBe(2)`. **The entry side is not touched, so it holds — but any drift into entry breaks it, which is a useful tripwire and should stay.**
⇒ **Change-class stays `non_architecture` while FINDING-A holds. If any gate comes to read `producer`, `:211` fails in CI and the class RE-DECLARES to `architecture`.**

### ⛔ FINDING-H — **THE LEDGER SEARCH: THREE OPEN ENTRIES COVER THIS GROUND AND NONE IS CLOSED BY THIS BATCH**
- **`#941` PARTLY-FIXED** — *"Both crypto producers emit a midpoint; they differ by FEED, not by kind."* ✅ **The SIM and System Manual legs are done; the CODE-COMMENT leg is `#952`.**
- **`#952` OPEN** — fix shape explicitly **not pre-judged**, citing rule 15. ⇒ **design (B) is a third option it did not list; Langston ruled it is not a pre-emption PROVIDED the change is pure re-description.**
- **`#957` OPEN** — the xStock mark is *"untagged"*; disposition **§9.4 (4), a scheduled review at `B-DECIDED-INTENT-INDEX` 3b.g.**
⇒ ⛔ **`#952`'s axis is WHICH BBO, and BOTH crypto legs come out `_mid` under this split. The union comment must say so, or the split reads as having settled a question it does not touch.**
- **`#951`** — owns the `kraken_rest_poller` third arm (condition 2).
- **`#961`/`#962`** — the two findings OBJ-1/OBJ-2 make readable rather than reconstructed.

### ⛔ FINDING-I — **`kraken_rest_poller` HAS THREE ARMS AND MUST NOT SPLIT** *(condition 2, re-derived)*
`fetchFromKrakenRest`'s rate-limited branch (`live-pricing-adapter.ts:583-587`) returns **`cached?.price ?? null` — a bare number with no provenance**, alongside the mid arm (`:645`) and the last arm. **A two-way tag would stamp a laundered cached value with a confident kind: `#951` wearing a new label, and `#546` exactly.**

### ⛔ FINDING-J — **THE KIND MAY NEVER BE RE-DERIVED DOWNSTREAM**
`price-cache.ts:402-416` `updateFromWebSocket` sets `ask: existing?.ask ?? price`, `bid: existing?.bid ?? price`. ⇒ **on a cold entry `bid === ask === price > 0`, so the predicate returns `mid` for a value that may have been a last trade.** And `kraken-websocket-adapter.ts:700` **drops bid/ask at the emit.**
⭐ **Measured refinement, and I am declining it:** the adapter's `parseFloat(safeData.b[0]/.a[0])` (`:682-683`) round-trips **exactly** from the translator's own locals (`:64-65` writes `String(bid)`/`String(ask)`). **Correct today — but it is an unstated invariant of a function neither end owns, so it is a patch (rule 15). The field-add is the structural answer.**

---

## §2 — THE IMPLEMENTATION PLAN *(every item cites its finding)*

| # | item | from |
|---|---|---|
| **P1** | **Export ONE predicate — `markKindOf(bid, ask): 'mid' \| 'last'`** — and call it from the sites that decide. ⛔ **A DEDUPLICATION, not a bug fix: the four statements are convergent, not copied, and two differ in their output guards.** | §0, FINDING-J |
| **P2** | **Split `kraken_ws_ticker` → `_mid`/`_last`.** `V1TickerFormat` gains a kind field set in `translateV2ToV1`; the adapter stamps the split member at `:700`. ⛔ **NOT re-derived from `safeData.a/b`.** | FINDING-B, FINDING-J |
| **P3** | **Split `kraken_equities_ws` → `_mid`/`_last`.** `latestEquityTick` (`equity-spot-archiver.ts:112`) gains `kind`, set at `:137` — **a LITERAL field-add; `parseTickerSnap`'s logic UNCHANGED per `#594`.** Engine `:1236` and the `updateCache` arg at `:1244` stamp the split member. ⛔ **`source` at `:1231` is UNTOUCHED.** | FINDING-B |
| **P4** | **Split `kraken_rest_engine_fallback` → `_mid`/`_last`** at `active-execution-engine.ts:1309` + `:1332`. ⭐ **Zero plumbing — `ask`/`bid` are in scope at `:1301-1303`.** | FINDING-B |
| **P5** | **`kraken_rest_poller` DOES NOT SPLIT.** Record the reason **in the union comment**, naming `#951` and the three arms. | FINDING-I, condition 2 |
| **P6** | **Union comment carries the two things a later reader will otherwise get wrong:** (a) `_mid` records the **KIND** and says **NOTHING** about which BBO — `#952`'s axis is untouched; (b) `kraken_ws_ticker` is a **PREFIX of `kraken_ws_ticker_v1`** ⇒ ⛔ **cohort queries ENUMERATE, never `LIKE`.** | FINDING-H, condition 3 |
| **P7** | **OBJ-1 — the fill book age.** `let _fillBookAgeMs: number \| null = null` **above** the `if` at `:1982`, assigned from `_closeSnap.ageMs` in the taker branch, read at the persist. ⭐ **The `_witness` at `:2015-2019` is the precedent: placed below both legs deliberately, because the maker leg consults no book.** New column **`exit_fill_book_age_ms`**. | FINDING-E |
| **P8** | **COMMENT PASS — four sites plus THREE corrections (E2 added).** ⭐ **`entry_book_age_ms`'s *"at the REAL fill instant"* is corrected to GATE-time (FINDING-E2).** `active-execution-engine.ts:1389`, `:1923-1925`, `shared/schema.ts:1807-1810`, the SQL `COMMENT ON COLUMN` statements. ⛔ **`exit_book_age_ms` gains its INSTANT qualifier (decision-time, vs `entry_book_age_ms`'s fill-time).** ⛔ **`exit_ticker_bid`/`_ask` lose "NOT YET INSTRUMENTED" — 18 rows refute it.** ⚠️ **The "no book for that class" line is TRUE of `exit_book_mid`/`exit_book_age_ms` and only MISLEADING as a class-level claim — it gains a BOUND, not a correction.** | FINDING-E, FINDING-E2, FINDING-F |
| **P9** | **GOVERNANCE — record the SPLIT EPOCH (deploy sha + UTC) in `SYSTEM_IMPACT_MAP.md` `:317-320`**, and state that a cohort query spanning it must enumerate both old and new members. | condition 3 |
| **P10** | **VERIFICATION.** OBJ-2: a post-deploy close carries a split member; a forced one-sided book yields `_last`. OBJ-1: coverage **bounded on `closed_at >= 2026-07-15T21:43:55Z`** and excluding **all SIX** non-stamping close paths; **crypto verified by a paired log line at the fill site**, never by reconstruction. | FINDING-H, r6, r3 MATERIAL-D |

⛔ **NOTHING IN THIS PLAN IS `UNAUDITED`.**

---

## §3 — WHAT THIS DELIBERATELY DOES NOT DO
1. ⛔ **No behaviour change** — no new emission site, no gate reading `producer`, no price changed. *(FINDING-A + `fence:211` are the tripwires.)*
2. ⛔ **No member merged, deleted, or repurposed** — condition 1. **Any of those makes it `#952`'s decision and it returns to Langston.**
3. ⛔ **No gating on the age recorded** — Phase B, and a risk call for Kyle.
4. ⛔ **Does not close `#941`, `#952`, `#957` or `#951`.**

---

## §4 — PLAIN LANGUAGE

**What the audit turned up.** The one thing that could have made this change dangerous — some piece of code quietly checking *which* price source a number came from, which would break the moment we made those labels more precise — does not exist. I checked with a test that would have found it (the same search on the neighbouring field returns twenty hits), and there are none. Better, if someone adds a new price source later and forgets to label it, the build fails rather than the data going quietly wrong, and there is already an automated check in place that fails if anyone starts making decisions based on that label.

Two things turned up that were not on anyone's list. The entry side of a trade already records exactly what we are adding to the exit side — so this is a proven pattern, not new invention. But the two columns are named as if they were a matching pair and they are not: the entry one records the moment the trade actually filled, and the exit one records a moment earlier, when the decision was taken. Nothing anywhere says so, so anyone comparing them is comparing two different things. And the database itself still carries a note saying one of our newer columns is "not yet instrumented" — it was true when written three days ago and eighteen rows now disprove it. Both are being fixed in the same pass, because it is already open.

**The plan** is ten items: make the mid-or-last decision in one place instead of four, make three of our price-source labels precise enough to answer the question, deliberately leave a fourth alone because it has a third behaviour that would make any two-way label a lie, record the book age at the exit fill the way we already do at the entry, correct the misleading notes, and record the exact moment the labels changed so later analysis does not read one group as two.
