# B-REST-SIDES-TO-CACHE — SCOPE (`#1056`, `PHASE_19_PLAN` row `3n.l`)

**change-class: non_architecture**
**Owner:** CC-C · **Read at ref:** `origin/migration/aws-supabase` · **Written:** 2026-09-13
**Placed:** after row `8c`, **before row `8a`** — Langston's ordering, because `8a` wires the exit trigger and would inherit this floor silently.

> **THE ONE-LINE STATEMENT:** the REST write path parses the bid and the ask, logs them, and then stores only the midpoint — so a symbol priced by that path has no transactable sides in the cache, and every consumer that needs a side sees a fabricated one or nothing.

---

## 0. WHY THE CHANGE-CLASS IS `non_architecture`, stated because it is arguable

This adds **no component, no state, no cross-cutting behaviour**. It brings one writer's signature into line with its sibling's — **a signature that already exists, is already reviewed, and already handles the exact hazards involved** (§2, A3). ⇒ the strictest doc-set is not warranted.
⚠️ **BUT IT WRITES INTO A SHARED CACHE READ BY THE EXIT PATH AND THE UI**, so the blast radius section (§4) is treated at architecture depth even though the class is not. **If Langston reads that as under-declared, re-declare — `CLAUDE.md` §3.0 makes under-declaration his call, not mine.**

---

## 1. THE PROVENANCE READ (MANDATORY 1.b) — **TIER 1**, and it changes the framing

**CORPORA SEARCHED, named as the evidence standard requires:** `RUNNING_ISSUES.md` and `BATCH_CATALOG.md` by SYMBOL (`updateFromRest`); `git log -S "updateFromRest" --reverse`, **not path-limited**; the introducing commit and **its attached Replit-era spec**; `SYSTEM_IMPACT_MAP.md`; `SYSTEM_MANUAL.md`.

**THE INTRODUCING COMMIT — `abe074015`, 2025-12-09 21:00:31 +0000, quoted verbatim, not summarised:**
> *"Add a centralized price cache for active trades to improve data accuracy*
> *Introduces a new `price-cache.ts` module for managing real-time price data, integrates with Kraken WebSocket and REST adapters, and updates diagnostic reports and memory snapshots to reflect cache utilization and performance metrics."*

**ITS ATTACHED SPEC — `attached_assets/Pasted-Phase-8-8-4-IA-PRICE-CACHE-Centralized-Price-Cache-for-_1765313894696.txt`, §1 "Scope & Non-Goals (Very Important)", verbatim:**
> *"A centralized price cache used by: Active Trades UI / Exit evaluation / SL/TP logic / Any backend logic that needs **current price** for open positions*
> *Cache is fed exclusively by: Kraken WebSocket ticks (primary) / Existing REST fallback path (secondary), **without adding extra REST calls***
> *Do NOT change in this phase: … 🟡 SignalOrchestrator behavior"*

⛔⛔ **AND THE DECISIVE MEASUREMENT: THE SPEC NEVER MENTIONS SIDES AT ALL.** Counted over that file — **`bid` 0 · `ask` 0 · `spread` 0 · `side` 0 · `mid` 0**, against a control on the same file of **`price` 91 · `cache` 61 · `REST` 26 · `WebSocket` 8**. ⇒ **the zero is real, not a silent instrument.**

★ **SO `updateFromRest` STORING ONLY A MARK IS NOT A DEFECT AGAINST ITS ORIGINAL INTENT — IT *IS* ITS ORIGINAL INTENT.** The cache was specified as a **current-price** store for **open positions and exit evaluation**, fed by a REST leg that was explicitly the *secondary fallback*. **Sides were never in its contract, and the spec explicitly fenced off the signal orchestrator — which is now one of the two consumers reading sides out of it.**

✅ **DISPOSITION: (2) — RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** Not (1): nothing here was built wrong. **What changed is the demand.** `B-PRICE-SIDE-BY-JOB` asks this cache to be the transactable-side source for **level construction** — a job its own spec assigned to nobody and fenced away from the orchestrator. ⇒ **this batch widens a contract; it does not repair a break.**

⚠️ **WHY THAT FRAMING IS LOAD-BEARING AND NOT A NICETY:** filed as a defect, the fix is "make `updateFromRest` behave"; read correctly, the question is *"may this cache be asked for sides at all, and by whom?"* — which is what §4's blast radius is actually about.

---

## 2. THE ARCHITECTURAL READ (MANDATORY 1.a) — **three corrections to what the documents say**

### A1 — ⛔ `SYSTEM_MANUAL.md:663` IS STALE, AND TRUSTING IT WOULD HAVE DOUBLED THIS SCOPE
It states: *"`price-cache.ts:402` declares `(symbol: string, price: number)` — the store HAS `bid`/`ask` columns but its **high-frequency writer has NO PARAMETER for them**, so they keep whatever the slower REST poll last set."*
**AT THE OBJECT, `price-cache.ts:657-667`, `updateFromWebSocket` takes `symbol, price, bid, ask, sidesCapturedAtMs, venueObservedAtMs, markKind, lastTradePrice`.** ⇒ **the WS writer HAS the side parameters and the manual's claim no longer holds.**
★ **CONSEQUENCE: THIS BATCH IS HALF THE SIZE THE MANUAL IMPLIES.** Had I scoped from the document I would have proposed fixing a writer that was already fixed. ⇒ **A2 fix is in scope (OBJ-4).**

### A2 — ★ THE PATTERN THIS BATCH NEEDS ALREADY EXISTS, REVIEWED, ONE FUNCTION AWAY
`updateFromWebSocket` already solves every hazard involved, and its own comments state them:
- *"A STATED side wins; an unstated one keeps what was there; and ONLY when neither exists does the legacy mark-substitution apply"* — the fabricated book is confined to cold start.
- `sidesCapturedAtMs` is **advanced only when a side was actually supplied** — *"re-stamping on a tick that did not refresh the sides is the W-3 defect itself."*
- `venueObservedAtMs` *"MOVES ONLY WITH THE SIDES IT DATES."*
⇒ ⛔ **THIS BATCH INVENTS NOTHING. It gives `updateFromRest` the signature and the semantics its sibling already has** — which is the `CONDUCT.md` *use-what-exists* rule discharged at the strongest possible level: not a similar capability, **the same capability in the same file**.

### A3 — `price-cache.ts` IS MARKED **🔒 LOCKED**, AND **THE LABEL HAS NO DEFINITION**
`SYSTEM_MANUAL.md:5908` lists it `🔒 LOCKED`. **Searched for the RULE, not the word: `LOCKED` occurs 56 times in the manual and ZERO of those carry a definition, legend or obligation for it.** `:38` merely lists it among status labels *("ACTIVE, LEGACY, CANONICAL CANDIDATE, DEPRECATED, LOCKED, etc.")*; the only stated meaning anywhere attaches to a **different** entry (`:212`, the FinalScore formula: *"Object.freeze, DO NOT MODIFY without review"*).
⇒ ⚠️ **THIS IS THE `hotfix` SHAPE EXACTLY — a term in constant use that is not governed, and the step-1 rule says a search returning only usages IS a finding.**
✅ **HOW THIS BATCH TREATS IT:** the only meaning the corpus ever assigns is *"do not modify without review"*, and the eleven-step workflow **is** that review. ⇒ **proceed through the normal gates, and file the undefined label rather than quietly stepping over it** (OBJ-5).

### A4 — SIM, on the shape this batch removes
`SYSTEM_IMPACT_MAP.md:352`: *"⛔ NEVER RE-DERIVE THE KIND DOWNSTREAM. `price-cache.ts:402-416` sets `ask: existing?.ask ?? price` and `bid: existing?.bid ?? price`, so on a cold entry `bid === ask === price`."* ⇒ **the synthetic two-sided book is already documented; this batch removes its REST cause, not its documentation.**

---

## 3. NUMBERED OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | **`updateFromRest` accepts `bid`, `ask`, `sidesCapturedAtMs`, `venueObservedAtMs`** with **exactly `updateFromWebSocket`'s semantics**: a stated side wins; an unstated side keeps what was there; the mark-substitution survives ONLY when neither exists; and **the stamps advance only when a side was actually supplied.** | a fixture per arm, including **the arm that must NOT move**: an update with no sides supplied leaves `sidesCapturedAtMs` untouched. A mutation that re-stamps unconditionally fails it. |
| **OBJ-2** | **`live-pricing-adapter.ts:896` passes the `bid`/`ask` it already parsed at `:876-877`.** ⛔ **No new REST call** — the spec's *"without adding extra REST calls"* still binds, and the values are already in hand one line above. | the call site passes the parsed values; a fixture asserts a REST write now yields `bid < ask` rather than `bid === ask` for a cold symbol. |
| **OBJ-3** | **The `venueObservedAtMs: null` statement is preserved, not invented around.** The REST response carries no venue stamp we parse; it must stay null rather than borrow the receipt clock. | a fixture asserts `venueObservedAtMs` stays null on a REST write and the leg therefore reports `clockBasis: 'receipt'`. |
| **OBJ-4** | **`SYSTEM_MANUAL.md:663` corrected** — the WS writer's signature claim is stale (A1). | the corrected line names the live signature; the correction states what it previously asserted. |
| **OBJ-5** | **The undefined `🔒 LOCKED` label is filed** with its measurement (56 usages, 0 definitions) and a disposition. | a `RUNNING_ISSUES` entry with a `HOME:` line. |

⛔ **EXPLICIT NON-GOALS:**
- **No change to `updateFromWebSocket`** — it is already correct (A2) and touching it would put a reviewed, live, high-frequency writer at risk for no gain.
- **No new REST calls, no new poll, no cadence change.**
- **This does NOT switch anything on.** Row `8c` stays a shadow; `8a` stays unbuilt.

---

## 4. BLAST RADIUS — treated at architecture depth despite the class

**The cache is read by the exit path, the UI and both level-construction shadows.** This batch makes `bid`/`ask` **more often real and less often equal to the mark** for REST-priced symbols.
⇒ **The consumer that changes behaviour is anything branching on `bid === ask`.** `buildLevelBasis` refuses that shape as `locked_or_synthetic_book`; with real sides it will **accept more often** — which is the intended effect and is confined to a SHADOW today.
⛔ **A FULL READER CENSUS OF `bid`/`ask` ON `CachedPrice` IS OWED AT STEP 2 AND IS NOT DONE HERE** — §9.5(a): who READS these fields, and does any of them depend on the fabricated equality? **Stated as owed rather than asserted absent.**

---

## 5. THE DEPLOY RELATIONSHIP WITH ROW `8c`'s WINDOW — and it is not a scheduling note

⛔⛔ **THIS BATCH CHANGES THE QUANTITY `8c`'s WINDOW IS MEASURING.** That window asks *"how often can a transactable basis be named?"*; this batch makes sides available for symbols that had none. ⇒ **deploying it mid-window would not merely VOID the window (restart), it would change the MEASURAND.**
✅ **THEREFORE: BUILD NOW, DEPLOY AFTER.** The `8c` window either reaches its floor or is deliberately voided **before** this deploys, and the two readings are reported as **two different systems, never pooled** — the same rule the funnel's rung key enforces one level down.
★ **AND THE `8c` RESULT IS STILL WORTH HAVING: it measures TODAY's system, which is what a switch-on decision would be taken against.** This batch raises the ceiling afterwards.

---

## 6. WHAT I WANT ATTACKED

1. **The change-class.** `non_architecture` on a file the manual calls LOCKED and that the exit path reads. I argue the signature already exists next door; **call it under-declared if you disagree.**
2. **OBJ-2's no-new-REST-calls claim.** I assert the values are already parsed one line above the write. **Check `:876-877` against `:896` yourself.**
3. **Whether `updateFromRest` should instead be DELETED in favour of the WS writer's path** — i.e. disposition (4)/(5) rather than (2). I say no: REST is the fallback for ~500 symbols the socket does not carry, so it is load-bearing. **But I have not enumerated its callers, and that is §9.5(a) work owed at Step 2.**
