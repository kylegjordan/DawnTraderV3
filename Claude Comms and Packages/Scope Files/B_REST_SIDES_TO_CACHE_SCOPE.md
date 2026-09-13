# B-REST-SIDES-TO-CACHE — SCOPE (`#1056`, `PHASE_19_PLAN` row `3n.l`)

**change-class: non_architecture** — ⏳ **HELD OPEN r2, RE-DECLARED AT STEP 2 AGAINST A PRE-REGISTERED CRITERION (§6.1), NOT DEFENDED BY ARGUMENT.**
**Owner:** CC-C · **Read at ref:** `origin/migration/aws-supabase` · **Written:** 2026-09-13
**Placed:** after row `8c`, **before row `8a`** — Langston's ordering, because `8a` wires the exit trigger and would inherit this floor silently.

> **THE ONE-LINE STATEMENT:** the REST write path parses the bid and the ask, logs them, and then stores only the midpoint — so a symbol priced by that path has no transactable sides in the cache, and every consumer that needs a side sees a fabricated one or nothing.

---

## 0. THE CHANGE-CLASS IS NOT SETTLED, AND IS NOT MINE TO SETTLE BY ARGUMENT (r2)

⛔⛔ **r1 ARGUED `non_architecture` ON THE GROUND THAT THE SIBLING “already handles the exact hazards involved.” THAT GROUND IS STRUCK — see A2. The sibling is safe because of a PRODUCER-side guard the REST leg does not have.** With its premise gone, the r1 argument is withdrawn rather than re-stated more carefully.
⏳ **HELD OPEN, and Langston declined BOTH to ratify it on my reasoning AND to over-declare on a hunch.** It turns on the §4 census I marked owed.
✅ **THE PRE-REGISTERED CRITERION, written before the census runs (§6.1): if ANY reader of `CachedPrice.bid` / `.ask` sits on a path that can move money or a threshold TODAY — not behind a shadow — the class is `architecture`.** **Re-declared at Step 2 against that test, never at Step 4.**
⚠️ **It writes into a shared cache read by the exit path and the UI, so §4 is treated at architecture depth regardless of how the label lands.**

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

### A2 — ⛔⛔ **r2: MY "INVENTS NOTHING / THE SIBLING SOLVES EVERY HAZARD" ARGUMENT DOES NOT SURVIVE THE OBJECT. STRUCK.** (Langston BLOCKER-1, re-derived by me)

**THE SIBLING IS SAFE BECAUSE OF A GUARD AT THE *PRODUCER*, NOT BECAUSE OF THE WRITER'S SEMANTICS — and the REST leg has no equivalent.**
- `kraken-websocket-adapter.ts:1115-1118`: `if (bestBid <= 0 || bestAsk <= 0) { continue; }` ⇒ **a one-sided book never reaches `updateFromWebSocket` at all.** The v1 site passes `null, null` for sides.
- `mark-kind.ts:33`: `(bid > 0 && ask > 0) ? 'mid' : 'last'` ⇒ **whenever `_restKind === 'last'` at `live-pricing-adapter.ts:881`, at least one of the values parsed at `:876-877` is `0`** (they are `parseFloat(… || '0')`).

⛔ **SO OBJ-2 AS FIRST WRITTEN WOULD HAVE REBUILT W-3 IN THE ARM I CLAIMED WAS FENCED OUT OF IT.** In the writer, `const _bid = bid ?? existing?.bid ?? price` — **a stated `0` is not `null`, so it WINS** — and `sidesCapturedAtMs: (bid !== null || ask !== null) ? … Date.now()` **ADVANCES**: a *fresh stamp on a fabricated zero side*.
⛔⛔ **AND IT IS WORSE THAN THE MARK-SUBSTITUTION IT REPLACES: `bid = 0, ask = real` is NOT `bid === ask`, so it walks straight through `buildLevelBasis`'s `locked_or_synthetic_book` refusal** — the one guard that currently catches a fabricated book. ⇒ **I would have removed a detectable fabrication and shipped an undetectable one.**

★ **WHAT SURVIVES OF A2: the writer's contract — "a stated side wins, an unstated side keeps what was there" — is still right, and is precisely why the coalescing belongs at the CALL SITE and NOT inside the writer.** Putting it in the writer would make it re-interpret its own callers' statements.

### A2b — the pattern the batch copies, stated accurately (r2)
⛔ **NOT “it solves every hazard” — A2 struck that. What it solves is the WRITER-side half**, and its own comments state them:
- *"A STATED side wins; an unstated one keeps what was there; and ONLY when neither exists does the legacy mark-substitution apply"* — the fabricated book is confined to cold start.
- `sidesCapturedAtMs` is **advanced only when a side was actually supplied** — *"re-stamping on a tick that did not refresh the sides is the W-3 defect itself."*
- `venueObservedAtMs` *"MOVES ONLY WITH THE SIDES IT DATES."*
⇒ ✅ **SO THE WRITER-SIDE SEMANTICS ARE COPIED, NOT INVENTED** — the `CONDUCT.md` *use-what-exists* rule, discharged on the half it actually covers.
⛔⛔ **BUT THE PRODUCER-SIDE GUARD IS GENUINELY NEW WORK AND MUST BE BUILT, NOT ASSUMED (A2).** The WS leg gets its guard from `kraken-websocket-adapter.ts:1115-1118`; **the REST leg has no such line and this batch writes one.** ★ **That is the honest split: copied writer, NEW guard — and r1 claimed the whole thing was copied.**

### A3 — ⛔⛔ **r2: I CALLED `🔒 LOCKED` UNDEFINED. IT IS DEFINED — ON THE FILE I AM MODIFYING — AND IT IS STRICTER THAN I ASSUMED.** (Langston; re-derived by me)

**`price-cache.ts:1-5`, verbatim:**
> *"🔒 LOCKED MODULE — DO NOT MODIFY / Directive: 8.8.4-A4.R10R-4 (Core System Hardening) / Owner: Dawn Trader Core / Summary: **This module is production-locked. Changes require a formal directive.**"*

⛔ **WHAT I DID WRONG, AND IT IS MY OWN A1 SHAPE INVERTED.** A1 caught the manual asserting something the object refutes. **Here I searched the MANUAL, found 56 usages and no definition, and concluded the label was ungoverned — while the definition sat in the first five lines of the file I was scoping a change to.** My control proved only that my grep worked *on the manual*; it could not speak to a claim about **the corpus I had not searched**. **`MISTAKE: absence-measured-with-the-wrong-object`.**
★ **And the assumed discharge was the WRONG one in the lenient direction: I read it as "review" and it says "a formal directive."**

✅ **WHAT STANDS FROM THE ORIGINAL FINDING, narrowed to what the evidence supports: the label is undefined *in the manual* and defined *at the object*.** Those are different claims and only the second is load-bearing.
✅ **HOW THIS BATCH PROCEEDS (Langston, not blocking):** the file **has been modified repeatedly under the eleven-step workflow with his Step-4 approvals**, which is the successor gate in practice. ⇒ **normal gates, and OBJ-5 carries the CORRECTED measurement plus a proposal to either RETIRE the header or give it a governed meaning.** ⛔ **No second approval is manufactured for it; Kyle sees it through normal governance.**

### A4 — SIM, on the shape this batch removes
`SYSTEM_IMPACT_MAP.md:352`: *"⛔ NEVER RE-DERIVE THE KIND DOWNSTREAM. `price-cache.ts:402-416` sets `ask: existing?.ask ?? price` and `bid: existing?.bid ?? price`, so on a cold entry `bid === ask === price`."* ⇒ **the synthetic two-sided book is already documented; this batch removes its REST cause, not its documentation.**

---

## 3. NUMBERED OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | **`updateFromRest` accepts `bid`, `ask`, `sidesCapturedAtMs`, `venueObservedAtMs`** with **exactly `updateFromWebSocket`'s semantics**: a stated side wins; an unstated side keeps what was there; the mark-substitution survives ONLY when neither exists; and **the stamps advance only when a side was actually supplied.** | a fixture per arm, including **the arm that must NOT move**: an update with no sides supplied leaves `sidesCapturedAtMs` untouched. A mutation that re-stamps unconditionally fails it. |
| **OBJ-2** | **`live-pricing-adapter.ts` passes the `bid`/`ask` it already parsed at `:876-877` — ⛔ COALESCED TO `null` WHEN NON-FINITE OR NON-POSITIVE, AT THE CALL SITE.** (r2, BLOCKER-1.) Not inside the writer: the writer's contract is *stated vs unstated*, and a writer that re-interprets its callers' statements has no contract. ⛔ **No new REST call** — verified by Langston at the ref: `:876-877` parse, `:897` write, same function, no additional fetch. | ⭐ **THE ONE-SIDED ARM IS THE FIXTURE THAT MATTERS: a REST write with `bid = 0` must leave the prior sides AND `sidesCapturedAtMs` UNTOUCHED.** A mutation passing the raw parsed values through fails it. Plus: a two-sided write yields `bid < ask` for a cold symbol. |
| **OBJ-3** | ⛔ **DISAMBIGUATED (r2, FINDING-2 — the word "preserved" read as the opposite of the intent): when a side IS stated, `venueObservedAtMs` is set to the argument, i.e. `null` for REST — it is NOT carried forward.** A venue stamp surviving a side replacement **dates an observation it no longer describes.** When NO side is stated, the previous value is carried untouched. | **both arms fixtured**: side stated ⇒ `venueObservedAtMs` null and the leg reports `clockBasis: 'receipt'`; no side stated ⇒ the prior value survives unchanged. |
| **OBJ-4** | **`SYSTEM_MANUAL.md:663` corrected** — the WS writer's signature claim is stale (A1). | the corrected line names the live signature; the correction states what it previously asserted. |
| **OBJ-5** | ⛔ **CORRECTED r2. The `🔒 LOCKED` label is filed with the RIGHT measurement: undefined *in the manual* (56 usages, 0 definitions) but DEFINED *at the object* (`price-cache.ts:1-5`), naming a STRICTER discharge — *“changes require a formal directive”* — than the “review” I assumed.** The entry proposes ONE of: retire the header, or give it a governed meaning naming the eleven-step workflow as its discharge. | a `RUNNING_ISSUES` entry with a `HOME:` line, carrying BOTH measurements and stating which corpus each came from. |

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

## 6. THE THREE ATTACK POINTS — **ALL THREE RULED ON, r2**

1. ⏳ **CHANGE-CLASS — HELD OPEN WITH A PRE-REGISTERED CRITERION, and it is not mine to settle by argument.** Langston declined both to ratify `non_architecture` on my reasoning and to over-declare on a hunch. **It turns on the §4 census I marked owed.**
   ⇒ ⛔ **THE CRITERION, PRE-REGISTERED BEFORE THE CENSUS RUNS: if ANY reader of `CachedPrice.bid` / `.ask` sits on a path that can move money or a threshold TODAY — not behind a shadow — the class is `architecture`.** **Re-declared at Step 2 against that test, never at Step 4.**
2. ✅ **NO-NEW-REST-CALLS — VERIFIED BY HIM AT THE REF and the claim holds.** ⚠️ **Its corollary is BLOCKER-1: the values already in hand are SOMETIMES JUNK** (A2).
3. ✅ **DELETE-VS-EXTEND — SETTLED NOW, ON EVIDENCE, AND NOT CARRIED TO STEP 2. Deletion REFUSED.** `updateFromRest` has exactly **ONE caller tree-wide** (`live-pricing-adapter.ts:897`, `dt-review` census). **Routing it through `updateFromWebSocket` would set `lastSource: 'kraken_ws'` and advance `lastWsMessageAtMs` — the field whose own comment records that it exists BECAUSE REST writers masking a dead socket was the defect.** ⇒ the "merge the writers" idea **rebuilds a known defect**.
   ⚠️ **MY ~500-SYMBOL LOAD-BEARING CLAIM IS SEPARATE AND STILL UNMEASURED — it stays OWED, not folded into this ruling.**

---

## 7. r2 ADDITIONS

**FINDING-3 — THE DISPLACEMENT, NAMED (Langston).** For any symbol written by BOTH paths, **a REST write now overwrites WS sides** — and REST is the coarser, one-per-bucket cadence. ⛔ **No recency contest is proposed:** *"stated side wins"* is the reviewed rule, and the honest stamp lets each reader apply its own ceiling. **But it must be STATED, and Step 2 measures whether the both-paths population is non-empty** — if it is empty the displacement is theoretical; if not, it is a real change in which feed a level is built from.

**BOARD:** no card exists for this batch yet — **Langston censused 91 of 91 items, so that is an absence and not a truncation.** ⇒ **I create it (protocol §3b), entering at `Scope`.**
