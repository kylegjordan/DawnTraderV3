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
