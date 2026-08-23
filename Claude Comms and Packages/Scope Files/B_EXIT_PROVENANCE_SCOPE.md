# B-EXIT-PROVENANCE — SCOPE

change-class: non_architecture

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
