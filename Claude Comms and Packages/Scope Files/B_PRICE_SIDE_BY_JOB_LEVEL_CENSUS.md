# B-PRICE-SIDE-BY-JOB — THE LEVEL CENSUS (P3 deliverable)

**Batch:** `B-PRICE-SIDE-BY-JOB` · **Owner:** CC-C · **Step 3** · **Built by SINK-INVERSION**, per Langston's Step-2 condition, **not** by grepping harder.

> ⛔ **WHY THIS IS BUILT BACKWARDS.** A forward census of "places that compute a level" is bounded by the pattern you happened to write — **it can never be proved complete.** A census that starts from **where levels are PERSISTED** and walks back is complete **over the sink**, because the sink set is closed and checkable. **Langston's condition, and it is the whole method:** *complete by construction over the sink is only as complete as the SINK ENUMERATION* ⇒ the sink set is named explicitly below, and the earlier 70-site grep is retained as its **POSITIVE CONTROL**.

---

## 1. THE SINK SET — 9 TABLES, 26 LEVEL COLUMNS

Enumerated from `shared/schema.ts` by walking every `pgTable` declaration and collecting level columns within it (not by grepping column names loose, which cannot attribute a column to a table).

| table | level columns |
|---|---|
| `active_open_positions` | `intendedEntryPrice`, `stopLoss`, `takeProfit` |
| `closed_trades` | `entryPrice`, `intendedEntryPrice`, `stopLoss`, `takeProfit` |
| `execution_attempt_audit` | `entryPrice`, `stopPrice`, `targetPrice` |
| `historic_signals` | `entryPrice` |
| `paper_trades` | `entryPrice`, `stopPrice`, `targetPrice` |
| `rtb_shadow_pairings` | `entryPrice`, `stopPrice`, `targetPrice` |
| `rtb_signals` | `entryPrice`, `stopPrice`, `targetPrice` |
| `trades` | `entryPrice`, `stopPrice`, `targetPrice` |
| `trading_signals` | `entryPrice`, `stopPrice`, `targetPrice` |

**9 tables · 26 column declarations.**

## 2. ⛔⛔ THE WALK FOUND A BLIND SPOT IN ITSELF — AND THE CONTROL IS WHAT CAUGHT IT

**v1 of the walk searched for the Drizzle form only — `.insert(<table>)` / `.update(<table>)`. It returned `rtb_shadow_pairings → ZERO WRITE SITES`.**
⛔ **I did not call that dead.** An asserted absence needs presence-evidence (rule 22), so I looked — and the table **is** written, by **RAW SQL**: `services/rtb-shadow-store.ts:114` `INSERT INTO rtb_shadow_pairings (…)` and `:177` `UPDATE rtb_shadow_pairings`. That file's own header states it: *"This module is the ONLY writer for `rtb_shadow_pairings`."*

⇒ ★★ **NEITHER INSTRUMENT WOULD HAVE FOUND IT ALONE, AND THAT IS THE METHODOLOGICAL RESULT WORTH KEEPING:**
- **the ORM walk** was blind to it because the write is raw SQL;
- **the 70-site grep control** was blind to it because `rtb-shadow-store.ts` **is not among its 19 files** — it *persists* levels, it does not *compute* them arithmetically.

⇒ **The union is the census. A single instrument, however carefully written, would have shipped a table with a silent hole in it** — which is exactly the failure Langston's control condition exists to prevent, arriving on the first run.

## 3. THE WRITER SET — COMPLETE, BOTH FORMS

| table | ORM writers | RAW-SQL writers | files |
|---|---|---|---|
| `active_open_positions` | 1 | 0 | `storage.ts` |
| `closed_trades` | 1 | 1 | `storage.ts` |
| `execution_attempt_audit` | 1 | 0 | `storage.ts` |
| `historic_signals` | 1 | 0 | `storage.ts` |
| `paper_trades` | 1 | 0 | `storage.ts` |
| `rtb_shadow_pairings` | **0** | **1** | `services/rtb-shadow-store.ts` |
| `rtb_signals` | 1 | 0 | `storage.ts` |
| `trades` | 1 | 0 | `storage.ts` |
| `trading_signals` | 2 | 0 | `services/trading-signals-cleanup.ts`, `storage.ts` |

⛔⛔ **SUPERSEDED BY §3a — THIS SAID *THREE* FILES AND THE TRUE ANSWER IS *FIVE*. The row below is the ORM-derived subset and is retained only so the correction is legible:**
**`server/storage.ts`** · **`server/services/rtb-shadow-store.ts`** · **`server/services/trading-signals-cleanup.ts`**

✅ **NO TABLE IN THE SINK SET HAS ZERO WRITERS.** Stated explicitly: the earlier zero was an instrument artefact, not an absence.

## 3a. ⛔⛔⛔ THE SINK SET IN §1 WAS **NOT** THE SINK SET — IT WAS THE ORM'S VIEW OF IT. THREE SEPARATE BLIND SPOTS, EACH FOUND ONLY BY A DIFFERENT INSTRUMENT

⚠️⚠️ **§1 CLAIMED "9 TABLES, 26 COLUMNS, CLOSED AND CHECKABLE". THAT WAS FALSE, AND THE WHOLE METHOD RESTS ON IT** — Langston's condition was *complete by construction over the sink is only as complete as the SINK ENUMERATION*, and mine was not complete. **RE-DERIVED FROM `information_schema` ON THE LIVE DATABASE — the authoritative object, not the ORM's description of it:**

### ★ THE TRUE SINK SET: **27 PHYSICAL TABLES / 14 LOGICAL** (13 of the 27 are `exit_decision_archive` monthly partitions)

| logical table | level columns | in §1? |
|---|---|---|
| `active_open_positions` · `closed_trades` · `execution_attempt_audit` · `historic_signals` · `paper_trades` · `rtb_shadow_pairings` · `rtb_signals` · `trades` · `trading_signals` | — | ✅ had |
| ⛔ **`vts_open_trades`** | `entry_price, stop_loss, take_profit` | **MISSED** |
| ⛔ **`exit_decision_archive`** (+13 partitions) | `entry_price` | **MISSED** |
| ⛔ **`paper_sim_ghost_trades`** | `entry_price, stop_loss, take_profit` | **MISSED** |
| ⛔ **`paper_sim_trades_user_archive`** | `entry_price, stop_loss, take_profit` | **MISSED** |
| ⛔ **`paper_sim_open_positions_user_archive`** | `stop_loss, take_profit` | **MISSED** |

⇒ **I HAD 9 OF 14. THE ENUMERATION MISSED FIVE.**

### ⛔⛔ THREE DISTINCT BLIND SPOTS — AND NO SINGLE INSTRUMENT WOULD HAVE FOUND ALL THREE

| # | the blind spot | what it hid | how it was found |
|---|---|---|---|
| **1** | the walk matched only the **ORM form** `.insert(<obj>)` | `rtb_shadow_pairings` — written by **raw SQL** | the 70-site grep **control** |
| **2** | the sink set was enumerated from **`shared/schema.ts`**, so a table with no `pgTable` declaration is invisible | ⛔ **`vts_open_trades` — WHICH DOES NOT APPEAR IN `shared/schema.ts` AT ALL** | **Langston**, grepping the CLASS after I graded the INSTANCE |
| **3** | the raw-SQL pattern matched a **literal table name**, so a name held in a variable is invisible | ⛔ **`exit_decision_archive` — `exit-decision-archiver.ts:20` is `const TABLE = 'exit_decision_archive'`, and the SQL is built from the constant** | re-deriving the sink set from `information_schema`, then chasing the one live table with no writer |

★★ **THAT IS THE RESULT WORTH KEEPING FROM THIS DOCUMENT: EACH INSTRUMENT WAS CORRECT AND EACH WAS BLIND TO A DIFFERENT MEMBER CLASS — the `enumerator-blind-spot` shape, three times, inside the census built to be complete.** ⇒ **"Complete by construction" is a claim about the ENUMERATION, never about the walk.** The only reason all three surfaced is that a *different* instrument was pointed at each: a control, a reviewer, and the database itself.

### ✅ THE CORRECTED WRITER SET — **FIVE FILES, NOT THREE**

`server/storage.ts` · `server/services/rtb-shadow-store.ts` *(raw)* · `server/services/trading-signals-cleanup.ts` · ⛔ **`server/services/vts-trade-persistence.ts`** *(raw — `insertOpenTrade`, `:141` `INSERT INTO vts_open_trades (… entry_price, stop_loss, take_profit …)`)* · ⛔ **`server/services/data-archive/exit-decision-archiver.ts`** *(raw, table name in a constant)*

### ★ AND THREE OF THE FIVE MISSED TABLES ARE DEAD — STATED WITH EVIDENCE, NOT INFERRED FROM THEIR NAMES

**MEASURED on the live database:** `paper_sim_ghost_trades` **0 rows**, `paper_sim_trades_user_archive` **0 rows**, `paper_sim_open_positions_user_archive` **0 rows** — **and ZERO production references each** across `server/` and `shared/`. ⇒ **level-carrying tables that nothing writes and nothing reads: §15 lingering legacy, disposition (5).** *(Control: `exit_decision_archive` in the same query returns **2,685 rows** and six production references, so the instrument distinguishes live from dead.)*
⇒ **`HOME: B-ORPHAN-LEVEL-TABLES, owner CC-C, placed in `PHASE_19_PLAN` after `3n.a` (`B-ORPHAN-ROOT-SCANNER`), same lingering-legacy class.**

⚠️ **CONSEQUENCE FOR THE FIX, STATED PLAINLY: the enforcement surface is FIVE writer files, and the two raw-SQL ones (`vts-trade-persistence`, `exit-decision-archiver`) plus `rtb-shadow-store` all bind columns by string literal — so all THREE need the read-back fence, not one.**

## 3b. ⛔⛔ THE "ONE ASSERTION AT THREE WRITERS" HEADLINE WAS WRONG — LANGSTON ATTACKED IT AND ALL FOUR POINTS LAND

**I proposed enforcing the rule at the three writers and asked him to attack it rather than agree. He did, and the answer was "neither of your two options".** Each point below was **re-derived by me at the object before being written in.**

**(1) SIDE IS UNDECIDABLE AT THE WRITER — IT IS A PROPERTY OF THE CONSTRUCTION, NOT OF THE NUMBER.** At `storage.ts` you hold a numeric string and a column name. **MEASURED: a tree-wide grep for ANY basis/provenance column — `priceBasis|price_basis|levelBasis|sideBasis|quoteSide|priceSide` — returns ZERO.** *(Control, same session: `exit_price_producer` returns 1, so the instrument reads the schema.)* ⇒ **"is this `takeProfit` the ask, the bid, or a mid?" cannot be answered from the object at the writer.** A check there can assert **shape** — finite, non-zero, on-grid — and never **side**. ★ **That is enforcement-looking and question-blind: the costume of rigor.**

**(2) "TOO LATE" IS NOT HYPOTHETICAL — IT SPLITS `#927` IN TWO, AND THE SPLIT IS ALREADY FILED.** `ready_to_buy_service.ts:1788`'s `entry * 1.02` sets **pool ORDER** and reaches **none of the 26 columns**; F-G-1's report already says of that leg *"UNREACHABLE BY THIS INSTRUMENT… a PASS says nothing about it."* The **same fabrication** at `active-execution-engine.ts:3315` (`signal.targetPrice ? parseFloat(…) : entryPrice * 1.02`, verified) **does** persist to `takeProfit`. ⇒ ⛔ **A writer fence catches one leg of `#927` and is STRUCTURALLY BLIND to the other. "One assertion every level must pass" is FALSE as written — it is every PERSISTED level**, and §5's in-memory caveat is not a caveat, it is a named open issue the claim silently excluded.

**(3) THE ANSWER IS NEITHER OF MINE: CONSTRUCTION *STAMPS*, PERSISTENCE *ENFORCES*.** The 70 sites each record the basis they read; the 3 writers refuse any level arriving with a null or mid basis. **Early AND single.** ★ **The decisive asymmetry: a MISSING stamp is mechanically catchable in a way a WRONG PRICE never is.** Same joint-read form as `B-PRICE-AGE-TRUTH` — `observedAtMs` is unreadable without `producer`; **a level is unreadable without its side.**

**(4) AND MY "THREE FILES" HEADLINE OVER-CLAIMED, WHICH I HAD SOFTENED IN §5 INSTEAD OF FIXING.** Per-**file** closure is not a choke point: one file with N level-writing functions is N places the check has to go. **ENUMERATED: `storage.ts` holds 79 async write-shaped methods, of which 20 write a level-carrying table** — `closeTrade`, `consumeSignalBySymbol`, `createActiveOpenPosition`, `createClosedTrade`, `createExecutionAttemptAudit`, `createHistoricSignal`, `createPaperTrade`, `createTrade`, `expireAllExpiredSignals`, `expireOldSignals`, `hardResetActiveEngineTables`, `saveTradingSignal`, `updateActiveOpenPosition`, `updateClosedTrade`, `updatePaperTrade`, `updateRtbSignal`, `updateRtbSignalsBatch`, `updateSignalStatus`, `updateTrade`, `upsertRtbSignal`. ⇒ **SAY "THREE FILES, TWENTY FUNCTIONS" — NEVER "ONE ASSERTION".**

## 3c. ⭐⭐ AND A SECOND INSTRUMENT ARTEFACT, CAUGHT BEFORE IT BECAME A CLAIM — IT TURNS (3) FROM RUNTIME INTO COMPILE-TIME

**A refinement pass tried to narrow those 20 to "functions that actually set a level column" and returned TWO — `closeTrade` and `upsertRtbSignal`.** ⛔ **That result was FALSE and I checked it because it was implausible, not because anything flagged it.** `createActiveOpenPosition` inserts into a table whose level columns are `notNull`, so it cannot fail to write levels — and `storage.ts:3723` shows why the pattern missed it: **`db.insert(activeOpenPositions).values(normalizedPosition)`** — a **SPREAD OF A TYPED OBJECT.** The column names never appear in the function body. ⇒ **my pattern measured "names a level column in its text", which is not "writes a level". `wrong-object`, mine, caught by disbelief rather than by an instrument.**

⇒ ★★ **BUT THE STRUCTURE IT REVEALED IS THE MOST USEFUL THING IN THIS DOCUMENT, AND IT STRENGTHENS LANGSTON'S (3) BEYOND WHAT HE PROPOSED: THE WRITERS TAKE A TYPED OBJECT.** ⇒ **add the basis to the TYPE, and the stamp stops being a runtime convention: every construction site must supply it or the code does not compile.** ⛔ **A MISSING STAMP BECOMES A COMPILE ERROR, NOT A MISSED CHECK** — which is the *"prefer IMPOSSIBLE over INTERCEPTED"* rule this project already holds, available here for free because the persistence layer is typed rather than positional.
⚠️ **It also confirms the change-class: a schema + type addition ⇒ `architecture`, which the scope already declares. No re-declaration needed.**

## 4. ⭐ WHAT THIS CHANGES ABOUT THE FIX — AND IT IS THE POINT OF DOING IT BACKWARDS

The Step-2 audit found **70 sites across 19 files that COMPUTE a level**. This census finds **3 files where every level LANDS**. **Those are different populations doing different jobs, and conflating them is what made the earlier plan look bigger and vaguer than it is:**

| | population | what it is for |
|---|---|---|
| **CONSTRUCTION** | 70 sites / 19 files | **where the change is made** — a level constructor must read a transactable price |
| **PERSISTENCE** | **5 files** (§3a; was mis-stated as 3) | ⭐ **where the change can be VERIFIED** — a narrow, closed choke point |

⇒ ⛔ **A FENCE AT THE CONSTRUCTION SITES CAN ONLY EVER BE 70 SEPARATE ASSERTIONS THAT DRIFT INDEPENDENTLY. A CHECK AT THE THREE WRITERS IS ONE ASSERTION THAT EVERY LEVEL, FROM ANY LANE AND ANY FUTURE STRATEGY, MUST PASS.** That is the difference between a rule enforced by whoever remembers it and a rule enforced by the structure — **the same lesson `B-XSTOCK-FEED-SANITY` learned the hard way when its invariant lived in the caller** (Langston's C1, 2026-09-03).

## 5. ⛔ WHAT THIS CENSUS DOES **NOT** YET ESTABLISH

1. **THE LANE COLUMN IS NOT COMPLETE.** The sink walk names *where levels land*; attributing each of the 70 construction sites to `crypto-quant` / `crypto-pattern` / `xStock-active` / `xStock-VTS` requires reading each site's own basis. **Three lanes remain untraced** (Step-2 audit). ⇒ **P4 cannot close on this document alone — my own falsification clause.**
2. **THE IN-MEMORY CLASS IS NOT COVERED, AND IT IS INVISIBLE TO THIS METHOD BY CONSTRUCTION** (Langston named it as the first thing to look for): **a level that gates a trigger in memory and is never written to any of the 26 columns** — trailing-stop and TEC recomputation. **A sink walk cannot see a value that has no sink.** ⇒ **it needs its own pass, and it is NOT closed by this census.**
3. **The write-site counts are per-file, not per-call-path.** `storage.ts` carries multiple level-writing functions; this document establishes the **file** set is closed, not that each function has been read.

---

**STATUS:** P3 structural half **DONE** — the sink set is named and the writer set is closed at three files. **Remaining on P3: the lane attribution (blocked on the three untraced lanes) and the in-memory pass (item 2).**
