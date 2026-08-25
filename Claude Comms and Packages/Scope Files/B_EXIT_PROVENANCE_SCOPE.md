# B-EXIT-PROVENANCE — SCOPE

change-class: architecture

> **Batch id:** `B-EXIT-PROVENANCE` · **Owner:** Claude Analyst (CC-C) · **Opened:** 2026-08-23 · **Due:** 2026-08-27
> **Ledger home:** `SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` Part F, piece **F3**
> **Why first:** Langston moved it ahead of the remediation batches — *"1+2 is backward-looking on a closed population whose urgency is not growing; 3 is the only piece where every close between now and landing is another row we do forensics on."*

**Change-class reasoning, stated because the checker will cross-check it.** The diff touches
`active-execution-engine.ts`, a core engine path, which normally invites an `architecture`
declaration. It is `non_architecture` because **no decision changes and no behaviour changes**: this
adds nullable KEEP-AS-DATA columns and writes facts the close path already holds. It is the same
shape as P19-B8.6's *"7 nullable KEEP-AS-DATA columns"*. If Langston reads the engine-path touch as
requiring the stricter set, I take the stricter set — flagging it rather than letting the checker
find it.

---

## 1. THE ONE-SENTENCE CASE

**The exit price source is already known, already correct, already computed at exactly the right
moment — and thrown into a rotating log file.** `active-execution-engine.ts:1758` assigns
`exitPriceSource: priceSource ?? 'unknown'` into the `[B8.PNL][CLOSE_ATTEMPT]` **console.log payload
and nowhere else.** `exitPriceSource` appears **exactly once in the entire tree** — a use with no
persistence behind it, which is the *"a search returning only usages IS a finding"* shape.

Last night's investigation into `#741` took hours of forensic archaeology across four instruments to
reconstruct facts the process had in hand at close time and discarded. **With this batch it is one
query.**

## 2. OBJECTIVES

| # | Objective | Verified when |
|---|---|---|
| **OBJ-1** | Persist the exit price **source** already computed at close | every new closed row carries a non-null `exit_price_source`; a fence asserts 100% coverage on rows written after the deploy |
| **OBJ-2** | Persist the **decision price** — the value that drove the exit, which is NOT always the recorded exit price | maker fills show `exit_decision_price ≠ exit_price`; taker fills show them equal. **This is the single fact whose absence made `#741` hard**: a maker exit records its limit, so the contaminated number that actually caused the close left no trace |
| **OBJ-3** | Persist the **independent cross-check at close** — book mid + book age (crypto), ticker bid/ask (both classes) | a new row can be adjudicated against an independent feed **without leaving the row** |
| **OBJ-4** | Both asset classes, one code path | crypto and xStock rows both populate; xStock carries a null book mid **by construction, not by omission**, and the column comment says so |
| **OBJ-5** | The stamp cannot silently stop | a fence fails if any post-deploy close has a null `exit_price_source`; **null must be impossible, not merely unusual** |

## 3. MANDATORY 1.b — PROVENANCE READ

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the completion reports,
`SYSTEM_IMPACT_MAP.md`, and `git log -S` unrestricted by path (so it survives the 2026-07-03
`paper-*` → `active-*` rename). Searched by **symbol** (`closePosition`, `exitRest`,
`exitPriceSource`) as well as by symptom.

**TIER 1 — `closePosition`'s stamp mechanism, whose behaviour this batch extends.**
Introduced at **`06560c299`, 2026-07-15T23:39:42+02:00**. Quoted verbatim, not summarised:

> *"maker fill=limit + per-class maker rate + zero slippage through the ONE close path,
> deadline-convert books taker friction via the existing path; **rest-cohort stamps travel EXPLICITLY
> via closePosition options (fill/drop/stop-during-rest all symmetric — Langston (1))**; schema+migration
> **7 nullable KEEP-AS-DATA columns**"*

The SIM records the same rule from the other side: `options.exitRest` is *"the EXPLICIT stamp payload
— stamps `exit_fee_mode`/`exit_rest_outcome`/`exit_rested_at_price`/`exit_rest_duration_ms`"*, and
Langston's original condition was that **stamps must never depend on which fields happen to survive
in the DB row at close time, because `closePosition` re-fetches that row.**

**DISPOSITION: (2) — relevant, and needs updating to today's intent.** The mechanism is correct and
working; it simply carries only *rest* provenance. This batch extends the same payload to carry
*price* provenance. ⇒ **This batch invents no pattern. It follows an existing, Langston-authored one,
and its central design constraint is his: stamps travel explicitly, never re-derived.**

**TIER 2 — one-line intent notes.** `livePricingAdapter.getPriceWithFallback` — serves a cached
venue price with a staleness window; the `source` field exists precisely so callers can judge
provenance (P19-B8.9a made that tag honest after four measured mislabels). `pending-maker-logic` —
pure fill decision, deliberately has no I/O; **this batch does not touch it.**

## 4. DOES IT ALREADY EXIST?

- **`decision-provenance.ts` (B-NEW-53) — CHECKED, and it is a different object.** It fingerprints
  the `module_constants` a strategy's `detect()` used, plus a provenance row for the forming bar and
  stop/target levels. That is **signal-time** provenance. Nothing in it records how an **exit** was
  priced. Not a duplicate — but the right precedent for shape, and the reason this batch does **not**
  invent a new provenance concept.
- **Ledger search: no prior scope, batch or Kyle/Langston decision on exit provenance.** Recorded
  explicitly, per §9.5(b-ii) — a search returning nothing is stated rather than assumed.

## 5. DESIGN

Extend the existing options payload rather than adding a parallel mechanism:

```
closePosition(positionId, exitPrice, exitCondition, priceSource, options?: {
  makerExitFill?: …,   exitRest?: …,          // existing
  exitProvenance?: {                          // NEW — same explicit-stamp rule
    decisionPrice: number;                    // the value that actually drove the exit
    priceSource: string; priceAgeMs: number | null;
    bookMid: number | null; bookAgeMs: number | null;   // crypto only; null BY CONSTRUCTION on xStock
    tickerBid: number | null; tickerAsk: number | null;
  }
})
```

Columns land nullable KEEP-AS-DATA, mirroring B8.6. **The one non-null guarantee is
`exit_price_source`**, because OBJ-5's fence needs a value whose absence is distinguishable from
"batch not deployed yet" — the `#546` distinction, and the same reason Langston required a third
stored value rather than a null in F1+F2.

## 6. BLAST RADIUS

| | |
|---|---|
| **Decision paths** | **none touched.** No gate, no fill rule, no price selection changes. Purely additive capture. |
| **Write path** | one payload extension on the single close path; the values are already in scope at the call sites (`priceSource` at `:1758`, `currentPrice` at `:1172`/`:1201`) |
| **Both classes** | shared close path ⇒ automatic; the xStock null-book-mid is expected and documented |
| **Rollback** | drop the columns; nothing reads them yet |
| **Storage** | six nullable columns on a table taking ~500 rows/6 weeks — negligible against the 66.5% disk warning, but stated rather than assumed |

## 7. OUT OF SCOPE, each with its home

- **Correcting historical rows** → F1+F2, due 2026-09-03. This batch is forward-only **and cannot fix
  a single existing trade** — Kyle has been told that explicitly and it must not be blurred here.
- **The mid-vs-ticker divergence detector** → F4. This batch *records* the inputs; it raises no alarm.
- **Per-strategy reach structure** → F5.
- **The reset** → F6, gated on this batch plus F1+F2 plus a stated post-fix clean window.

---

# REV 2 — 2026-08-23, after Langston's Step-1 bounce (`95bb77f09`)

His verdict: *"SENT BACK FOR ONE REVISION (r2), then proceed to Step 2… The bounce is a design defect I found, not a completeness failure."*

## R2-1 — C1 ACCEPTED. THE FIELD I PROPOSED TO PERSIST CANNOT DISCRIMINATE THE CASE THAT MOTIVATES THE BATCH

His finding, and it is correct: `handleV2BookUpdate` emits a book **midpoint** stamped `source:'kraken_ws'` (`:916`), and the ticker handler emits a **last-trade** stamped `source:'kraken_ws'` (`:692`). Both write the same cache key, last-writer-wins. **So a ghost-contaminated book-mid and a clean ticker print arrive at `:1758` carrying the IDENTICAL string.** Persisting it as-is stores a label already measured unable to separate the defect from the clean case — and worse, a later reader takes `kraken_ws` as evidence of a ticker print. ⇒ **discrimination must happen AT THE PRODUCER**, with a closed enumerated vocabulary and a fence rejecting any value outside it.

## ★ R2-2 — AND THAT REQUIREMENT HAS A BLAST RADIUS HIS RULING DID NOT NAME, WHICH I FOUND BY READING THE GATE

⛔ **`isKrakenVenueSource` (`live-pricing-adapter.ts:67`) IS A HARD GATE ON THE LIVE TRADING PATH, AND IT WHITELISTS THE SOURCE STRING BY VALUE:** `source === 'kraken_ws' || 'kraken_equities_ws' || 'kraken_rest'`. **Four consumers:** the engine's ACTIONABLE-PRICE GATE (`active-execution-engine.ts:1170`), its non-venue warn (`:1176`), the venue-quiet predicate (`:81`), and the cache freshness read (`:865`).

⇒ **if the vocabulary is widened at the producer and a new value is not added to this predicate, the actionable gate REJECTS the price → `_recordPriceSkip` → the position is SKIPPED that tick → the consecutive-skip escalation rail fires.** A batch scoped as forward-only telemetry would stop evaluating open positions. **That is the single largest risk in this batch and it did not exist in r1.**

## R2-3 — TWO DESIGNS. I RECOMMEND (B) AND THE REASON IS GATE SAFETY

**(A) WIDEN THE EXISTING `source` VOCABULARY** — `kraken_ws` splits into `kraken_ws_book` / `kraken_ws_ticker`. Satisfies C1 directly. **Cost: the type union at `:51`/`:58`/`:699`, the predicate at `:67`, and every literal comparison must widen together, and a miss is a trading outage rather than a wrong label.**

**(B) LEAVE `source` UNTOUCHED; ADD A SEPARATE `producer` FIELD ON THE TICK** — carried from the emitting handler, persisted at close, fenced against a closed vocabulary. **The gate's input does not change, so the gate CANNOT break.** This is the *impossible-rather-than-caught* preference Langston himself states in rule 29 — the failure mode is made unreachable instead of guarded.

**Pre-empting his #641 objection (two fields that can disagree), because it is the right objection and I do not think it lands here:** these are not the same fact stored twice. **`source` answers a POLICY question — *may I act on this price?* `producer` answers a PROVENANCE question — *which handler produced this number?*** Merging them is what created the defect in the first place: a policy label was read as provenance evidence. Keeping them separate means a future policy change cannot silently rewrite the historical provenance vocabulary. **If he still rules (A), I will take it — but then the predicate widening is a NAMED objective with its own fence, not an implementation detail.**

## R2-4 — CORRECTIONS ACCEPTED WITHOUT ARGUMENT

- **change-class `non_architecture` → `architecture`.** He pre-registered the criterion before the diff existed: the moment this widens the `priceTick` / live-pricing-adapter payload — cross-cutting, read by **entry as well as exit** — it is architecture. Both designs above do. **SIM §17 cross-cutting registry gets a content update.**
- **OBJ-1's population was wrong.** `closed_trades` rows are CREATED AT OPEN with `closed_at` NULL and UPDATED at close, so *"every new closed row"* would fail the fence on every open position. Correct population: **`closed_at IS NOT NULL AND closed_at > <deploy ts>`.**
- **OBJ-5 stays fenced, not schema-enforced — and his reason is stronger than mine.** I argued a NOT NULL could strand a position. He added the decisive one: **rows are INSERTed at open, so NOT NULL is unsatisfiable without a DEFAULT, and a DEFAULT reintroduces exactly the indistinguishability OBJ-5 exists to kill.**
- **Q3 sentinel, no boolean.** "No book exists for this class" folds into the single enumerated vocabulary. A `book_available` flag is a second field that can disagree with the first.
- **`priceAgeMs` renamed.** `diffMs` (`:1244`) is **tick-to-tick cadence for that symbol**, NOT the age of the price acted on. It ships as `tickCadenceMs`, or it is misread by the first person to use it.
- **The `exitPriceSource` population, named properly:** ONE occurrence in `server/`; it also appears in `attached_assets/` and two `bridge/reference/` archives. Does not move the finding — but an unstated population is the rule-29(a) failure I have already been bounced on tonight.
- **bid/ask/bookMid are NOT in scope at any call site** — they are block-locals in the REST leg (`:1198-1200`) and otherwise live only inside the adapter. So r1's *"facts already in hand"* was true of `priceSource` and **false of these three**. They must be **carried on the tick from the producer**. ⛔ **Do NOT re-read the book at close time — that measures a different instant than the decision and manufactures a new defect.**

## R2-5 — WHY F3 STILL GOES FIRST, with the argument I failed to make

Langston's, and it is decisive: **the post-fix era holds ZERO maker closes.** If the instrument is not in before the next maker close, **the clean-era measurement is lost the same way the dirty-era one was** — and that is unrecoverable, exactly like the 127 unassessable rows. Kyle waits longer for his dashboard correction and gets a number that can be audited afterwards instead of re-litigated.

---

# REV 3 — 2026-08-24: WIDENED TO **BOTH LEGS**, per Kyle's Part F restructure

> **change-class: architecture** (unchanged from REV 2 — Langston's pre-registered criterion: the moment this widens the `priceTick` / live-pricing-adapter surface it is architecture).
> **Batch id:** `B-EXIT-PROVENANCE` · **Owner:** CC-C · **Part F piece F3 / F-B**

## R3-0 — WHY THIS REVISION EXISTS, AND IT IS A GAP I WOULD HAVE SHIPPED

Kyle restructured Part F on 2026-08-23: *"when we finish with this set of batches we wanna be confident
that the prices that we ENTER and exit at are reliable and are correct."* **His word "enter" widened
F3 — and REV 2's five objectives are ALL exit-only.** OBJ-1 through OBJ-5 name `exit_price_source`,
`exit_decision_price`, `exit_price_*`. **Nothing in this scope stamps an entry.**

- **Shipping REV 2 as written would have satisfied the scope and missed half the batch** — and the reset
gate has already been tightened to **"zero contaminated on BOTH legs"**, so a half-stamped record could
never satisfy it. **MEASURED, and the entry side is not the smaller half:**

| class | trades | assessable | **entry below the venue's printed low** | recorded P&L on those | median |
|---|---:|---:|---:|---:|---:|
| crypto | 309 | 232 | **22** | **+$211.47** | **216 bps** |
| xStock | 225 | 219 | 23 | -$72.22 | 9.8 bps |

**Crypto entries sit ~2.2% below anything the venue actually traded — the same magnitude class as the
exit contamination (289.7 bps median), and carrying MORE recorded profit than the exit side.**

## R3-1 MANDATORY 1.a — ARCHITECTURAL READ. **THE ENTRY PROVENANCE IS ALREADY COMPUTED AND THROWN AWAY.**

Read: `SYSTEM_IMPACT_MAP.md` (the P19-B4b.1 fill-fidelity state block at `:77`, and the
`execution/types.ts` + `order-placer.ts` component entry at `:896-903`), plus the sources.

**THE CHAIN, verified at source rather than from the map alone:**

| site | what it holds |
|---|---|
| `kraken-websocket-adapter.ts:170` | `bookUpdatedAt: Map<symbol, ms>` — per-symbol book-update stamp |
| `:3225-3245` `getBookForFill` | returns `{ asks, bids, ageMs }`, null on an empty/one-sided book |
| `execution/depth-source.ts:43` | wraps it into **`DepthSnapshot { asks, bids, ageMs, source }`** — `source: 'crypto_ws_book'`; the xStock branch returns `source: 'xstock_ticker_snap'` with `ageMs` from `captured_at` |
| `active-execution-engine.ts:241` `_evaluateOpenDepthGate` | returns **`{ pass, reason, snapshot: DepthSnapshot or null }`** |
| `:3051` the open seam | holds **`_gate.snapshot`** in a local, guards on it at `:3052`, then **passes only `asks` to the fill and DISCARDS the rest** |

**=> `ageMs` AND `source` ARE IN SCOPE, IN A LOCAL VARIABLE, AT THE EXACT MOMENT OF THE ENTRY FILL —
FOR BOTH ASSET CLASSES — AND ARE DROPPED.** The entry leg of this batch is therefore a **PERSISTENCE
change, not a computation change.** Same shape as F-A being a switch-on rather than a build, and the same
shape as `#550`/`#549`: *a value computed upstream and dropped in transit before it reaches the
persisted record.*

- **The placer cannot be the stamp point.** `PaperOrderPlacer.openOrder(req)` receives `req.bookAsks` and
is **stateless** (SIM: *"the placer is stateless"*) — it never sees the age or the source. **The stamp
belongs at the open seam, where the snapshot lives.**

## R3-2 MANDATORY 1.b — PROVENANCE READ. **DISPOSITION (2): RELEVANT, NEEDS UPDATING TO TODAY'S INTENT.**

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, completion reports, and
`git log -S` (not path-limited, so it survives the 2026-07-03 `active-*` rename).

**TIER 1 — behaviour this batch changes.** `getBookForFill` + `bookUpdatedAt` + `DepthSnapshot` all
enter at ONE commit, **`b74526dc3`, 2026-06-16**. Quoted verbatim, not summarised:

> *"P19-B4b.1 Step-3: depth-walked paper fill + partial-open + #295 24/5 book-depth-sufficiency gate
> (DORMANT til B7b)"* ... *"depth-source.ts (per-class fill-time depth: crypto WS book / xStock ticker
> top-of-book + warmth/sufficiency assessors + observable block counter)"* ... *"kraken-websocket-adapter:
> getBookForFill accessor + book-update freshness stamp."*

=> **ORIGINAL INTENT: the freshness stamp was built to DECIDE — to gate a fill on book warmth.** It was
never intended as a record of what a fill was priced against. **DISPOSITION (2), explicitly: still
relevant and correct for its own purpose, and needing extension to a second consumer.** It is not
disconnected (3), not to be removed (4/5), and not merely unchanged (1), because this batch adds a
reader to a value that has only ever had one.

**TIER 2 — read or called, one line each.** `order-placer.ts` / `depth-walk.ts`: same commit; pure,
RNG-free book-walk replacing a flat 0.05% slippage constant. `depth-gate-config.ts`: same commit,
fail-closed per-class config. **None have their behaviour changed here.**

## R3-3 DOES IT ALREADY EXIST — AND HAS IT ALREADY BEEN DECIDED? **TWO LEDGER HITS THAT CHANGE THE DESIGN.**

**(a) `#536` — RESOLVED 2026-07-19, and it is PRECEDENT, not duplication.** It proved the open path can
carry metadata onto a persisted position **end-to-end**, verified by a Supabase row read AND a §9.3
screenshot, with Langston independently pulling both rows from the live ref. **It covers signal-context
fields (regime, pattern, friction, DBS, entry liquidity, Promote R) — NOT price provenance.** => adjacent,
not overlapping; and it establishes the transit mechanism this batch reuses. Not re-scoped as new.

**(b) `#550` / `#549` — THE CONSTRAINT THAT DECIDES WHERE THE STAMP GOES.** `signal-orchestrator.ts:1059-1077`
**rebuilds the sized signal's `metadata` as a FRESH object from an explicit field list**, and
`_displayContext` is the **only** spread — `rawSignal.metadata` is never spread. => **anything stamped
onto the signal's metadata upstream is SILENTLY DROPPED before the open path.** That is the measured
root cause of `maxHoldingMs` being live-0/15 and `atr` being '0' on 15/15.
=> **DESIGN CONSEQUENCE, load-bearing: the provenance stamp MUST be written at the FILL SEAM onto the
persisted row, NEVER onto signal metadata.** A scope that stamped the signal would have passed review,
compiled, tested green, and produced null columns in production.

## R3-4 THE CONSUMER CENSUS — RUN *BEFORE* WRITING THE FIRST FIELD (the lesson that cost two batches)

**`B-OBSERVATION-EPOCH` introduced a shared value without censusing its consumers, shipped the rule into
one reader of four, and cost a whole follow-on batch.** This scope will not repeat it. **Who will READ
these fields?**

| consumer | reads what | obligation on this batch |
|---|---|---|
| **F1+F2 / F-E detector** | both legs' source + age + the venue print | the field names and semantics are its input contract — fix them here |
| **F3.5 / F-C staleness bound** | the age distribution at fill | **the threshold is DERIVED from this data**, so the age must be the age *at fill*, not at snapshot-read |
| **the reset gate (F6)** | *"stamp present on 100% of closes"* | => **null must be impossible, not merely unusual** (already OBJ-5; now binds both legs) |
| **the dashboard / Closed Trades tab** | may surface a provenance badge | out of scope here, named so it is not discovered later |
| **`honestNetPnl` / `HONEST_PNL`** | **the SQL and the TS copy** | **if any reader of these fields is implemented twice, it gets a ROW-LEVEL PARITY FENCE IN THIS BATCH, not a follow-on** — `#900` is the standing debt from getting this wrong once |

## R3-5 — OBJECTIVES ADDED FOR THE ENTRY LEG (REV 2's OBJ-1...5 stand, exit-side)

| # | Objective | Verified when |
|---|---|---|
| **OBJ-6** | Persist the **entry price source** and the **book age at fill** | every new open row carries non-null `entry_price_source` + `entry_book_age_ms`; a fence asserts 100% coverage post-deploy |
| **OBJ-7** | Persist the **entry decision price** vs the **achieved fill price** | `entry_decision_price` (the signal's intended price) and the walked `fillPrice` are both retained, so slippage is reconstructable from the row alone |
| **OBJ-8** | **Both classes, one code path** | crypto carries `crypto_ws_book`, xStock `xstock_ticker_snap` — **the class difference is in the VALUE, not in a second code path** |
| **OBJ-9** | The entry stamp **cannot silently stop** | a fence fails if any post-deploy open has a null `entry_price_source`; **absence must be impossible, not merely unusual** (`#546`) |
| **OBJ-10** | **The stamp survives the metadata rebuild** | a fence proves the value is written at the **fill seam**, not carried on signal metadata — the `#550` drop is structurally impossible for these fields |

## R3-6 — OUT OF SCOPE, each with a home

- **Back-filling provenance onto historical rows** — impossible by construction (the book snapshot is
  gone). The history is tiered instead, by **F-E**, from the venue print.
- **Acting on the stamp** (blocking a stale fill) — that is **F-C `#743`**, whose threshold this batch's
  data supplies. **Deliberately not folded in:** a behaviour change inside a batch whose safety case is
  *"records only, decides nothing"* would forfeit that safety case.
- **A UI surface for provenance** — after F-E, when there is something to display.

---

# REV 4 — 2026-08-25, after Langston's r3 bounce. **BOTH BLOCKERS ACCEPTED.**

## R4-1 BLOCKER-1 ACCEPTED — **THE MAKER ENTRY NEVER TOUCHES A BOOK AT FILL. VERIFIED AT SOURCE.**

| site | what it does |
|---|---|
| `active-execution-engine.ts:3147-3151` | `if (_b72cPendingMaker) { actualEntryPrice = _b72cLimit; ... }` — **the placer call and `_gate.snapshot.asks` are in the `else`.** The book is never consulted. |
| `_processPendingMaker:985` | the fill decision is `evaluatePendingMaker({ side, currentPrice, limit, nowMs, deadlineMs })` — **`currentPrice`, not a book.** No source, no age. |
| `:990-994` | writes `state:'open'` — this is the actual fill instant |

★ **AND THE CODEBASE ALREADY KNEW.** `:986-989`, verbatim: *"NOTE: openedAt stays stamped at PLACEMENT, not at this fill — resting time is included in any holding-duration analytic ... A true in-market duration needs a `filledAt` stamp."* ⇒ **placement is not fill, it is a DOCUMENTED property of this path, and my scope would have stamped a placement-time book age as `entry_book_age_ms` anyway.** `#546` in its worst form: a wrong-instant value in the fill's clothes, passing OBJ-9's non-null fence green.

### ★ THE MEASUREMENT YOU REQUIRED — AND IT CUTS BOTH WAYS

**OBJECT:** `closed_trades`, `mode='paper'`, `asset_class='crypto_spot'`, `never_filled` EXCLUDED, entry price below the lowest price the venue **PRINTED** in a plus/minus 10 min window around `opened_at` (`crypto_spot_ohlc_1m.low`, keyed on `interval_begin`).

| entry mode | trades | assessable | **below printed low** | P&L on those | median |
|---|---:|---:|---:|---:|---:|
| **taker** | 58 | 51 | **19** | **+$204.43** | **294.5 bps** |
| **maker** | 263 | 189 | **5** | +$17.40 | **51.2 bps** |

**=> ANSWER TO YOUR QUESTION: THE DEPTH SNAPSHOT IS THE RIGHT INSTRUMENT FOR THE CONTAMINATED COHORT.** 19 of 24 contaminations (79%) and **$204.43 of $221.83 (92%) are TAKER** — the cohort that does walk the book — at a median **294.5 bps**, 5.75x the maker median.

⛔ **BUT THAT DOES NOT RESCUE THE STAMP, AND YOUR BLOCKER STANDS IN FULL.** Makers are **263 of 321 fills (82%) by count.** Stamping placement-time book age on them would put a wrong-instant value on the **majority of all entry rows**, to serve a cohort that is 2.6% contaminated. **The measurement vindicates the INSTRUMENT CHOICE and refutes the STAMP DESIGN — those were two claims and I had merged them.**

### R4-1a THE DESIGN, per your ruling: **TWO FILLS, TWO STAMP POINTS, ONE VOCABULARY**

- **Taker fill — the open seam** (`:3153-3156`), stamping `_gate.snapshot.source` + `ageMs`. Your stronger reason adopted: the value is *already structurally coupled* to the fill, so a future edit that drops `_gate.snapshot` breaks loudly at the placer call rather than silently nulling a column.
- **Maker fill — `_processPendingMaker:990`**, at the `state:'open'` write. **The decision instrument there is the price tick, so the stamp names the tick, not a book** — and `entry_book_age_ms` is **NULL BY CONSTRUCTION on a maker row, with a column comment saying so**, exactly as OBJ-8 already does for xStock's null book mid.
- ⛔ **NO SECOND COLUMN FAMILY** (your constraint): the **`entry_price_producer` enum absorbs the cohort**, the same way it absorbs the class. A maker row carries a tick-producer value; a taker row carries a book-producer value; one column, one vocabulary, one fence.

⚠️ **AND YOU ARE RIGHT THAT THE MAKER LEG DRAGS THE r2 C1 AMBIGUITY ONTO THE ENTRY SIDE** — the tick's `source` cannot discriminate book-mid from ticker-last. **That is exactly what `producer` exists for, and R4-4 records that it already shipped.**

## R4-2 BLOCKER-2 ACCEPTED — THE FENCE POPULATION IS WRONG ON BOTH LEGS

`_processPendingMaker:1004-1009` writes `closedAt` + `closeReason:'never_filled'` on a dropped rest — **a row that never opened and never exited: no entry fill, no exit price, no source, by construction.** A `closed_at IS NOT NULL AND closed_at > <deploy ts>` population admits every one of them, so **OBJ-1/OBJ-5 would fail on rows that are CORRECT.**

**FIX — a named clause carrying its reason, never a silent filter:** the fence adds `AND close_reason IS DISTINCT FROM 'never_filled'`, commented *"a dropped maker rest never opened and never exited; it has no fill to have provenance FOR — excluding it is a statement about the population, not a convenience."*

**AND OBJ-9 GETS ITS OWN POPULATION:** *"post-deploy OPEN"* is not *"post-deploy INSERT"* once resting orders exist — a maker row is **INSERTED at placement and OPENS later**, so the entry fence keys on the **`state:'open'` transition**, not on row creation.

## R4-3 OBJ-10 RESTATED — **you are right that it could not be proven as written**

**OBJ-10 (was):** *a fence proves the value is written at the fill seam and NOT carried on signal metadata.* ⛔ Unbounded over every future field list — unprovable, and it would have read stronger than it was.

**OBJ-10 (now) — THE DISCRIMINATION PAIR:** place a **decoy** provenance value on `rawSignal.metadata`, run the rebuild, and assert **the decoy is ABSENT from the sized signal WHILE the seam stamp is PRESENT on the persisted row.** Fails if anyone adds a spread; fails if the seam stamp stops.
⚠️ **STATED LIMIT, inside the objective itself:** this fences **the one measured drop site**, not *"all metadata paths"*. An unmeasured future path is not covered, and the objective says so rather than implying otherwise.

## R4-4 THE R2-3 DISPOSITION YOU ASKED FOR — **RECOVERED FROM THE CODE, WHICH BEATS A CHAT LOG**

You are right that REV 3 never recorded it, and right that your `langston-recall` miss is **not** an absence. **REV 2 records only my recommendation** — *"I RECOMMEND (B) ... If he still rules (A), I will take it."* **Your ruling was never written into the scope. That is my miss.**

**But the disposition is recoverable from the artifact rather than from either of our memories: (B) SHIPPED, and is deployed.** At `34d5f89a9`, `live-pricing-adapter.ts`:

- `:122` — **`source` is the UNTOUCHED original vocabulary:** `'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price'`. **`kraken_ws` was NOT split** — that is design (B)'s defining claim, and (A)'s defining change is absent.
- `:151` — **`isKrakenVenueSource(source: string)` is unchanged**, so the gate's input never widened. Your *impossible-rather-than-caught* preference held.
- `:124` — `producer: PriceProducer`, **required**, on a closed union whose docblock states the (B) argument verbatim: *"`source` answers a POLICY question (may the engine act on this?); `producer` answers a PROVENANCE question."*

⇒ **BOTH the exit leg and the new maker entry leg hang off `producer`, and it exists.**

## R4-5 REF CORRECTIONS ACCEPTED — **AND ONE IS A LEDGER DEFECT, NOT ONLY MINE**

**The metadata rebuild is `signal-orchestrator.ts:1190-1212`, NOT `:1059-1077`.** Verified: my cited lines are B67.3 cap-check and RTB pool queueing — unrelated code. The real site rebuilds `metadata:` field-by-field with `_displayContext` the only spread, and **its own comment at `:1204-1211` already documents this drop** and records that `active-execution-engine.ts:3143` spreads `...signal.metadata` onto the position row — the transit this batch reuses.

⚠️ **I DID NOT INVENT `:1059-1077` — I TOOK IT FROM `#550`'s ADDENDUM-2, WHICH STILL CARRIES IT.** The file has moved since that entry was written. ⇒ **the ledger will send the next reader to the wrong lines**, which is the `wrong-object` class with a governance-document blast radius. **Corrected in `#550` in this same commit, not only in my scope** — a stale ref in the ledger is worse than one in a scope, because the ledger is what the next session greps.
**My own failure stands regardless: I cited a ledger entry instead of verifying at the ref.**
