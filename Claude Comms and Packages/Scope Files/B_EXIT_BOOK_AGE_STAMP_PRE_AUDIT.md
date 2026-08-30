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

| ⭐ **P11** *(added audit r3)* | ⛔ **THE SIX NEW MEMBERS GO IN `toCachedProducer`'s PASSTHROUGH ARM, AND A TEST ASSERTS EACH RETURNS NON-NULL.** **The `never` arm forces a DECISION, not a CORRECT one: a member placed in the `null` arm suppresses the cache write, which ends in `last_known_good` → a failed venue gate → `_recordPriceSkip` — a SKIPPED POSITION, with a green build.** ⭐ **The type system enforces that every member is HANDLED and says NOTHING about WHERE — that is the gap.** ⚠️ **HONEST REACH (audit r4): behaviourally load-bearing for `kraken_ws_ticker` ONLY; the other two enter via `updateCache(producer: CachedProducer)` and never touch the switch.** | A-CORRECTION 1, 5, 6 |
| ⭐ **P12** *(added audit r3)* | **Correct the stale count in `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md:645`** — *"15-member"* → **16**, counted at the ref. *(Mine, 4 days old, cited by this batch.)* | audit r3 |

| ⭐ **P13** *(added audit r4)* | **Correct all SIX stale `file:line` anchors inside the `PriceProducer` union comment** (`:56-60`, `:101-102`). ⛔ **Two carry an explicit *"ref corrected 2026-08-26"* annotation and are wrong anyway — a correction that went stale reads as freshly checked, which is worse than no anchor.** | audit r4 |

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

---

# ⛔ AUDIT r2 — FRESH READER ON FINDING-E/F. **FINDING-E's MECHANISM WAS WRONG IN TWO WAYS AND THE CONCLUSION GOT BIGGER. ONE WRONG-OBJECT EDIT CAUGHT BEFORE IT SHIPPED.**

> **REVIEWER r1 (E/F):** `claim-only` · *"the two book-age columns are a false pair; the ticker comment is stale"* · **HIT** · re-derived **y**
> ⚠️ **METHODOLOGICAL LIMIT THE READER RAISED ITSELF, AND IT IS FAIR: `B_EXIT_BOOK_AGE_STAMP_PRE_AUDIT.md` was committed at the ref it finished on, so it found my own claim near-verbatim in the repo. The independence is therefore WEAKER than a clean claim-only run.** ✅ **What redeems it: it returned findings that CONTRADICT my version. An echo does not contradict.**

## ⛔ E-CORRECTION 1 — **THE EXIT AGE IS CAPTURED *EARLIER* THAN I SAID: BEFORE THE EXIT IS EVEN EVALUATED**
I wrote *"at the moment the exit decision was taken."* **Re-derived: `_exitProvenanceBase` is built at `active-execution-engine.ts:1384`; `checkExitConditions` runs at `:1456`** — 72 lines and an `await` later — and the base is spread unchanged into both close sites (`:1525`, `:1603`), neither of which overrides `bookAgeMs`.
⇒ ⛔ **It is captured for EVERY position on EVERY tick, whether or not an exit occurs. Not "at the decision" — BEFORE it.** ✅ **Conclusion unchanged and strengthened; the stated mechanism was wrong.**

## ⛔⛔ E-CORRECTION 2 — **THE BIGGER ONE: THE TWO COLUMNS DIFFER IN *FEED AND ASSET-CLASS SEMANTICS*, NOT ONLY IN INSTANT**
**Re-derived at `depth-source.ts:47-70`: on xStock, `getDepthSnapshot` returns `ageMs` = `EXTRACT(EPOCH FROM (NOW() - captured_at)) * 1000` from `xstock_spot_ticker_snap`, with `source: 'xstock_ticker_snap'`.**
⇒ ⛔ **THAT IS A DATABASE ROW AGE, NOT AN ORDER-BOOK AGE** — while `exit_book_age_ms` is **null by construction on xStock** (`:1381-1383`).
⇒ ⛔⛔ **SO AN xSTOCK ROW CARRIES A TICKER-SNAP ROW AGE IN `entry_book_age_ms` BESIDE A STRUCTURAL NULL IN `exit_book_age_ms`, AND THE TWO ARE NOT THE SAME KIND OF QUANTITY AT ALL.** **A comparison of these columns can be wrong for this reason with the instant question set entirely aside.**
✅ **P8 must therefore bound BOTH columns by FEED and CLASS, not only by instant.**

## ✅ E-CORRECTION 3 — **WRITER CENSUS: FOUR AND TWO, NOT ONE EACH**
| column | writers |
|---|---|
| `exit_book_age_ms` | `:1392` *(the base)* · `:848` *(force-close, explicit null)* · `active-portfolio-manager.ts:671` *(explicit null)* · `:2278` *(`?? null` default — any caller passing no provenance)* |
| `entry_book_age_ms` | `:3677` · `:1055` *(maker fill, explicit null)* |
⚠️ **Consequence for any population claim: two of four exit writers hardcode `null`, so a "these two disagree" observation is consistent with a WRITER-MIX effect rather than a timing effect.** ⛔ **Do not attribute a null-rate difference to instant without partitioning by writer.**

## ✅ FINDING-F — **NOW VERIFIED AGAINST THE LIVE DATABASE, WHICH IS NOT WHAT I ORIGINALLY CHECKED**
⚠️ **I asserted *"the live database asserts an absence"* having read only the MIGRATION FILE. The reader was right to separate those, and supplied the query.** ✅ **Run against staging via `col_description('closed_trades'::regclass, …)`, the APPLIED comment returns:**
> *"NOT YET INSTRUMENTED - NULL on every branch at the deploy ref, both classes …"*
**against a measured 18 non-null `exit_ticker_bid` rows of 662 closes.** ⇒ ✅ **FINDING-F STANDS, now on the object it names.**
★ **And it settles the reader's open alternatives: the comment IS applied, and it is stale — not absent, not hand-corrected.** *(The reader could not distinguish these; it correctly said so rather than guessing.)*

## ⛔⛔ P8 CORRECTION — **A WRONG-OBJECT EDIT CAUGHT BEFORE IT SHIPPED**
⛔ **`active-execution-engine.ts:1393`'s *"NULL ON EVERY BRANCH TODAY"* IS NARROWLY TRUE AND MUST NOT BE "CORRECTED."** It describes the **`_exitProvenanceBase.tickerBid` PAYLOAD FIELD**, which is still literally `tickerBid: null as number | null` at `:1402`. **The COLUMN is filled from `_witness` (`:2026`), bypassing the payload entirely.**
⇒ ★ **Two write sources with different statuses and no single comment describing both.** **P8 edits the DB comment and leaves `:1393` alone** — editing it would have replaced a true statement about one object with a false one about another, inside the pass built to stop exactly that.

## ⚠️ STRUCTURAL FACT WORTH RECORDING — **`shared/schema.ts` COMMENTS ARE NEVER EMITTED TO THE DATABASE**
They are TypeScript; only `COMMENT ON COLUMN` in a migration reaches Postgres. ⇒ **schema-vs-database comment divergence is the STEADY STATE of this codebase, not a missed step** — so the same divergence may exist on columns nobody has looked at. **P8 must edit BOTH homes or it fixes only the one an analyst does not read.**

## 🟨 LEAD — NOT ESTABLISHED, NOT A FINDING
**Symbol-keying asymmetry:** `:1383` calls `getBookForFill(normalizeToInternalSymbol(position.symbol))`; `depth-source.ts:43` calls `getBookForFill(symbol)` with whatever the caller passed. **If the two forms diverge for any symbol, one side reads a book and the other reads nothing — a null-rate difference with no instant component.** ⛔ **I have NOT established that they diverge.**
**DISPOSITION: §9.4 (4) — a scheduled review, placed with `#957` at `B-DECIDED-INTENT-INDEX` 3b.g**, which already owns "three definitions of the price from one venue frame." **Not folded in: it needs a symbol-form census this batch has no reason to run.**

## ⚠️ E-CORRECTION 4 — **THE HARM IS PROSPECTIVE, NOT ACTUAL. SAYING OTHERWISE WOULD BE OVER-CLAIMING.**
**Superset grep (all directories, `.ts`/`.js`/`.mjs`/`.sql`) on both column names returns ONLY: two `ADD COLUMN`, two `COMMENT ON COLUMN`, four writers, one fence assertion, two declarations.**
⇒ ⛔ **NO READER EXISTS. Nothing in `client/`, no aggregator, no analytics path reads either column by name.**
✅ **So "anyone comparing the two is comparing different instants" is a claim about a FUTURE or AD-HOC consumer — not about a code path that is wrong today.** ★ **The finding survives and its shape changes: this is a trap being laid for the reader this batch is about to create, which is a reason to fix it NOW and not a reason to call it live damage.**

## ⭐⭐ E-CORRECTION 5 — **HOW THE MISMATCH SURVIVED: THE COLUMN NAME IS THE WRONG SEARCH KEY**
**`:848` and `:1392` write the PAYLOAD field `bookAgeMs`, not the column identifier `exitBookAgeMs`.**
⇒ ⛔ **A grep on the COLUMN NAME finds FOUR of the SIX things that determine what lands in `exit_book_age_ms`, and MISSES THE TWO THAT DECIDE WHETHER A REAL VALUE IS EVER BUILT.** **An auditor searching by column name sees the persist at `:2278` and never the capture at `:1383-1392`.**
★ **THIS IS THE `wrong-object` PATTERN AS A SEARCH-SURFACE PROPERTY, and it is the mechanism by which the instant mismatch stayed invisible.** ⇒ **RULE FOR P8 AND FOR ANY FUTURE AUDIT OF THESE COLUMNS: search the PAYLOAD FIELD NAME AND the COLUMN NAME. One is not a superset of the other.**

---

# ⛔⛔ AUDIT r3 — FRESH READER ON FINDING-A. **MY HEADLINE WAS FALSE AS WRITTEN. THE SAFETY SURVIVES, NARROWER, AND IT NOW HAS A TEST.**

> **REVIEWER r2 (A):** `claim-only` · *"nothing reads a producer value, so splitting a member cannot change behaviour"* · **HIT** · re-derived **y**
> ⚠️ **Same independence caveat, and the reader raised it itself: my pre-audit was in its working tree (untracked at its ref). It nonetheless CONTRADICTED me, which an echo does not.**

## ⛔⛔ A-CORRECTION 1 — **THERE *IS* A PRODUCER-VALUE-DEPENDENT BRANCH, AND IT CAN END IN A SKIPPED POSITION**

I wrote: *"A producer member cannot gate, reject, skip or re-price anything."* ⛔ **That is false as stated.**
**Re-derived: `toCachedProducer` is NOT a pure passthrough. It has TWO behaviour classes — 16 members, 16 arms, of which `no_price_produced` and `position_entry_price_reused` return `null` (`:118-121`) and fourteen return `p`.**
**And that null gates a CACHE WRITE at two sites:** `:428-429` (`if (_cachedProducer !== null) this.priceCache.set(...)`) and `:1200-1201` (`if (_p !== null) livePricingAdapter.updateCache(...)`).
⇒ ⛔ **THE STRUCTURAL CHAIN THE READER TRACED, AND IT IS REAL:** producer maps to `null` → **no cache write** → `getPriceWithFallback` falls through to `source:'last_known_good'` (`:1090-1097`) → **fails `isKrakenVenueSource` at `active-execution-engine.ts:1269`** → direct REST → **on REST failure `_recordPriceSkip(...); continue;` — a SKIPPED POSITION.**

✅ **WHAT SURVIVES, AND IT IS WHAT THE BATCH ACTUALLY NEEDS:**
1. ⭐ **NO CODE *COMPARES* A PRODUCER VALUE.** The census + positive control stand: `producer ===/==/!==/!=` → **zero**; `source ===` → **20** (reader's superset: **116**). **The single producer-dependent branch is `toCachedProducer`, and it is a membership test, not a value comparison.**
2. ⭐⭐ **ALL THREE MEMBERS BEING SPLIT SIT IN THE PASSTHROUGH ARM TODAY** — `:125`, `:128`, `:129`. ⇒ **PROVIDED the six new members land in the SAME ARM, the change is behaviour-identical.**
⛔⛔ **AND THE `never` ARM FORCES A *DECISION*, NOT A *CORRECT* ONE — the reader's sharpest point.** A future member placed in the `null` arm, or an `Exclude` widened at `:107`, reproduces the skip chain **with no other code change and a green build.**
✅ ⇒ **NEW PLAN ITEM `P11`: the six new members go in the PASSTHROUGH arm, and a test asserts `toCachedProducer` returns each of them NON-NULL.** ★ **The compile-time guard cannot express this; a test can. Without it the batch's safety rests on the implementer picking the right arm.**

## ⛔ A-CORRECTION 2 — **MY "THE TRIPWIRE RUNS IN CI TODAY" WAS TOO STRONG**
`b-exit-provenance-fence.test.ts:209-211` **regex-scopes to the BODY of `isKrakenVenueSource` only.** ⇒ **a producer read introduced in ANY OTHER FUNCTION leaves it green.** ✅ **It fences the one function that matters most; it does not fence condition 4.**
⛔ **AND THE TYPE OFFERS NO BACKUP: `isKrakenVenueSource(source: string)` (`:180`) takes a BARE `string`, not the source union** — so TypeScript would **not** catch a future caller passing a `producer` where a `source` belongs. **Three members (`kraken_equities_ws`, `mock`, `entry_seed`) are in BOTH unions, so such a call would even look plausible.** **Behavioural today, not type-enforced.**

## ⚠️ A-CORRECTION 3 — **CLOSED AT COMPILE TIME, OPEN AT EVERY RUNTIME BOUNDARY**
`toCachedProducer`'s `default` arm **returns `p`** (`:139`). ⇒ **a string arriving from the database or an untyped boundary passes through NON-NULL and is cached.** *(And `active-portfolio-manager.ts:675` writes the payload `as any`.)* **Compile-time exhaustiveness is not runtime rejection** — worth stating because the union's own comment invites the stronger reading.

## ⛔⛔ TOOLING FACT THAT PRODUCES SILENT FALSE ABSENCES IN THIS REPO — **RECORD IT, IT WILL BITE AGAIN**
**`.gitignore:47` is `*.sql`, and the migrations are FORCE-ADDED.** ⇒ ⛔ **any search tool that honours `.gitignore` scans ZERO migration files and reports a clean absence.** The reader hit this and re-ran its corpus off `git ls-files`.
★ **This is `#546`'s shape in the toolchain: the instrument returns silence and the silence looks like evidence.** ⇒ **ANY absence claim over this repo must state whether its instrument saw the 271 force-added `.sql` files.** *(My own FINDING-A census was `--include=*.ts` and therefore never looked at SQL at all — the conclusion is unchanged, because the reader checked and found only the migration, but my stated reach was narrower than my claim.)*

## ✅ CORRECTED IN MY OWN GOVERNANCE DOC — **A STALE COUNT**
`1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md:645` calls it a **"closed 15-member `PriceProducer` union."** **Counted at the ref: 16 members, 16 case arms.** ⛔ **Mine, four days old, in a document this batch cites.** **Corrected in the same commit.**

## ✅ AND A REJECTION MODE NEITHER OF US HAD NAMED
`exit_price_producer` / `entry_price_producer` are `VARCHAR(40)` with **no CHECK constraint and no enum type** (`migration:26,35`). ⇒ **a member over 40 characters is a WRITE REJECTION with nothing to do with any gate.** ✅ **Longest new name is 32 (FINDING-D) — but the rule for future splits is: check the width, because the type system will not.**

---

# ✅ AUDIT r4 — ROUND 2, OBJECT ROUND. **THE LOOP CLOSES HERE.** Design (B) survives; **I over-claimed the danger in r3 and under-claimed the protection.**

> **REVIEWER r3 (A, round 2):** `object + claim` · the corrected FINDING-A and `P11` · **HIT** · re-derived **y**
> ⭐ **Round count: 2 on FINDING-A, 1 on FINDING-E/F. Termination is legitimate — the final round READ THE OBJECTS at the ref** *(and reported HEAD `4f005b461`, matching origin).*
> ⛔ **Strike every mention of this loop and the plan still stands on its own citations. That is the test, and it passes.**

## ⛔ A-CORRECTION 4 — **I OVERSTATED THE DANGER TWICE. NEITHER NULL ARM IS REACHABLE, AND THE CHAIN DOES NOT END IN A SKIP.**
1. ⛔ **THE NULL-ARM MEMBERS CANNOT REACH EITHER GATE TODAY.** `'no_price_produced'` is emitted only at `live-pricing-adapter.ts:487`, `:537`, `:569`, **each paired with `price: null` and `source: 'no_reliable_price'` — both excluded by the guard at `:426`, which runs BEFORE `toCachedProducer` at `:428`.** `'position_entry_price_reused'` is produced only at `active-portfolio-manager.ts:628` and never enters either site. **And `PriceTickEvent.source` is narrowed to the single literal `'kraken_ws'` (`kraken-websocket-adapter.ts:95`); its three emitters stamp `:700`/`:945`/`:1081`, none a null-arm member.** ★ **The code says so itself at `:1196-1199`.**
2. ⛔ **AND THE CHAIN DOES NOT END IN A SKIP.** A cache miss fails the venue gate at `:1268` **into the direct Kraken REST leg (`:1288-1332`), which ON SUCCESS stamps `kraken_rest_engine_fallback` and the position is NOT skipped.** **A skip requires REST to ALSO fail** (`:1298` `rest_no_data`, `:1337` `rest_failed`). ⇒ **r3's *"= A SKIPPED POSITION"* was too strong.**
✅ **WHAT SURVIVES, AND IT IS STILL THE REASON `P11` EXISTS: the branch is real and STRUCTURALLY reachable for a FUTURE member. `#546`'s whole lesson is that "unreachable today" is a property of today's call sites, not of the type.**

## ⛔⛔ A-CORRECTION 5 — **`toCachedProducer` IS NOT ON THE PATH FOR TWO OF THE THREE MEMBERS. `P11`'s REACH IS ONE, NOT THREE.**
**`kraken_equities_ws` and `kraken_rest_engine_fallback` enter the cache through the DIRECT call `updateCache(..., producer)` at `active-execution-engine.ts:1244` and `:1332`, whose 4th parameter is typed `producer: CachedProducer` (`live-pricing-adapter.ts:851`) and which NEVER calls the switch.**
⇒ ⭐ **ONLY `kraken_ws_ticker` actually flows through `toCachedProducer`, via the priceTick listener at `:1201`.**
✅ **`P11` STAYS — but its honest reach is stated: behaviourally load-bearing for ONE member; for the other two the arm placement is a statement about the TYPE, not about any path a value takes.** ⚠️ **An unstated reach is how a test reads as covering three things while covering one.**

## ✅ A-CORRECTION 6 — **I UNDER-CLAIMED THE PROTECTION. MEMBER *EXISTENCE* IS COMPILE-ENFORCED; ARM *PLACEMENT* IS NOT.**
**The reader built a minimal replica under `--strict` and MEASURED it: removing a literal from the union makes the `as PriceTickEvent` casts at `:700`/`:945`/`:1081` raise `TS2352` — the negative control compiled clean.** ⇒ **the `as` does NOT defeat the check, contrary to what the cast's neighbourhood implies.** **And `updateCache`'s `producer: CachedProducer` protects `:1244`/`:1332`.**
⇒ ✅ **The gap `P11` fills is NARROWER and REALER than r3 said: not "the type system does not protect this" but "the type system enforces that every member is HANDLED and says nothing about WHERE."** *(`CachedProducer = Exclude<…>` removes exactly two hardcoded names, so a new member in the `null` arm still belongs to `CachedProducer` and returning `null` for it compiles.)*

## ⛔⛔ CORRECTION TO **SCOPE r5** — **"MAKING A PARAMETER REQUIRED SURFACES TWO TEST CALL SITES" IS FALSE. TESTS ARE OUTSIDE `tsc`.**
**`tsconfig.json:3` excludes `**/*.test.ts`.** ⭐ **PRESENT-TENSE PROOF, not inference: `server/tests/unit/p19-b8-9-venue-only-source.test.ts:75` calls `livePricingAdapter.updateCache('AAPL/USD', 214.25, 'kraken_equities_ws')` — THREE arguments to a function whose 4th (`producer`) is REQUIRED with no default — AND CI IS GREEN.**
⇒ ⛔ **A stale producer literal in ANY `*.test.ts` is invisible to the TypeScript Check. It is caught only if the assertion EXECUTES and the runtime behaviour changes.** ⇒ **scope r5's "known touch, in the change set, not a surprise" is withdrawn: those two sites will not fail the build.**

## ✅ WHAT CI *DOES* GATE, STATED PRECISELY
**`.github/workflows/ci.yml` — "TypeScript Check (baseline gate)" runs `scripts/check-tsc-baseline.mjs` against `.tsc-baseline.json`. It is NOT a clean build** *(the baseline exists because `continue-on-error: true` once swallowed ~700 errors)*. **It compares per-file, per-code AND per-message, and fails on any new pair.**
✅ ⇒ **None of `live-pricing-adapter.ts`, `active-execution-engine.ts`, `kraken-websocket-adapter.ts`, `active-portfolio-manager.ts` or `shared/schema.ts` carries a baselined entry — so ANY new type error in the five files this batch touches is a new pair and FAILS.** **That is the real protection, and it is stronger than "tsc passes."**

## ⛔ NEW — **EVERY `file:line` ANCHOR INSIDE THE UNION COMMENT IS ALREADY STALE, INCLUDING TWO THAT SAY "REF CORRECTED"**
| comment says | actual |
|---|---|
| `kraken-websocket-adapter.ts:692` | ⛔ **`:700`** *(`:692` is `firstTickReceived.add`)* |
| `:916` | ⛔ **`:945`** |
| `:1049` | ⛔ **`:1081`** |
| `active-execution-engine.ts:1140` *("ref corrected 2026-08-26 — was :1145")* | ⛔ **`:1236`** |
| `:1201` *(same annotation)* | ⛔ **`:1309`** |
| the null-price arms `:355 / :399 / :427` | ⛔ **`:487 / :537 / :569`** |
⇒ ⛔ **TWO CARRY AN EXPLICIT "ref corrected" ANNOTATION AND ARE WRONG ANYWAY — a correction that itself went stale, which is worse than no anchor because it reads as freshly checked.** **A split DOUBLES these anchors and nothing in the repo checks them.**
✅ **NEW PLAN ITEM `P13`: correct all six anchors in the same pass — the comment block is already being edited.**

## ⚠️ LATENT HAZARD, NAMED NOT FIXED — **A SUBSTRING PREDICATE OVER A BARE `string`**
`live-pricing-adapter.ts:208-211`: `REST_FALLBACK_SOURCES = ['rest_fallback','kraken_rest','last_known_good']`, and **`isRestFallbackSource(source: string)` uses `.some(s => source.includes(s))` — a SUBSTRING test, not equality.**
⛔ **`'kraken_rest_engine_fallback'` CONTAINS BOTH `'kraken_rest'` AND `'rest_fallback'`.** ✅ **Every caller today passes `.source`, so it is correct now — but the parameter is a BARE `string`, so nothing stops a future caller passing a producer, and it would match.**
**DISPOSITION: §9.4 (4) — a scheduled review with the symbol-keying lead at `B-DECIDED-INTENT-INDEX` 3b.g. NOT folded in: narrowing that signature is a behaviour-adjacent change and OBJ-3 forbids it here.**

## ✅ P9 WIDENS — **THE MEMBER NAMES ARE ENUMERATED IN SEVEN GOVERNANCE SURFACES**
`SYSTEM_MANUAL.md` (2 lines) · `SYSTEM_IMPACT_MAP.md` (1) · `ACTIVE_PATH_FLOW.md` (2) · `PHASE_19_PLAN.md` (2) · `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md` (6) · `RUNNING_ISSUES.md` · scope/completion docs. **P9 records the split epoch AND updates the enumerations that would otherwise read as complete.**
