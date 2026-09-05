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

## 3e. ⛔⛔⛔ THE IN-MEMORY PASS FOUND A **FOURTH SINK CLASS** — AND IT IS ONE NO DATABASE CONSTRAINT CAN REACH

**Langston named the in-memory class as the first thing to look for. It was worse than in-memory: it PERSISTS, to a place the census never contemplated.**

**THE TRAILING STOP IS A LEVEL THAT GATES A REAL EXIT.** `trailing-exit-controller.ts:885` `const trailingStates = new Map<string, TrailingState>()` — a module singleton; `:1292` `state.currentStopPrice = newStopPrice` mutates the level; **`:1581` `return currentPrice <= state.currentStopPrice`** — **the in-memory level IS the exit trigger.**

⇒ ⛔⛔ **AND IT PERSISTS TO THE FILESYSTEM, NOT THE DATABASE.** `trade-safety.ts:896` `persistTrailingStates()` → `fs.writeFileSync(TRAILING_STATE_FILE, …)`, with `loadTrailingStates()` reading it back at startup. **`trade-safety.ts:891`: `const TRAILING_STATE_FILE = '/tmp/trailing-states.json';`**
**MEASURED LIVE ON STAGING 2026-09-04T12:0xZ:** the file is **526,769 bytes**, owner `deploy`, **rewritten every ~60 s** — `[9.2][PERSIST] Saved 862 trailing states to file` at 12:04:47, **863** at 12:05:47.

⇒ ★★ **A FOURTH SINK CLASS: THE FILESYSTEM.** The census enumerated **database** sinks — and never said so. ⛔ **Consequences, each fatal to a claim made earlier in this document:**
1. **It is not in `information_schema`** ⇒ invisible to the corrected sink set, which I called "closed against the authoritative object."
2. **It is written by none of the five writer files.**
3. ⛔⛔ **A DATABASE `CHECK` CONSTRAINT — the enforcement I proposed in §3d(a) as unbypassable — CANNOT REACH IT.** *"Cannot be bypassed by any verb, any writer, any language"* was **true of database rows and false of the system**, because I had silently scoped "sink" to mean "table."
4. ✅ **THE ONE MECHANISM THAT DOES REACH IT IS THE TYPE-LEVEL STAMP.** `TrailingState` is a TypeScript type; a required basis field on it fails `tsc` exactly as on every other path. ⇒ **that is now the argument for putting the stamp in the type rather than only in the database — it is the only one of the three mechanisms that covers all four sink classes.**

### ⚠️ AND A SEPARATE OPERATIONAL FINDING, SURFACED HERE BUT NOT THIS BATCH'S TO FIX

**863 live trailing-stop levels — the state that gates real exits — are kept in `/tmp`.** **MEASURED:** `/tmp` on staging is **disk-backed** (`/dev/sda1`), **not** tmpfs, so it survives a reboot as a filesystem; and a systemd rule `D /tmp 1777 root root 30d` governs its contents.
⛔ **STATED AS SYMPTOM, NOT CAUSE (`CONDUCT` §8): I have NOT established that anything actually deletes this file.** The file's mtime refreshes every 60 s, so an age-based sweep would not reach it while the app runs. **What IS established: state whose contract is *must survive* lives in a directory whose contract is *disposable*.**
⇒ **`HOME: B-TRAILING-STATE-DURABILITY, owner CC-C, placed in `PHASE_19_PLAN` after `3n.b`.** Not folded into this batch — it is a durability question, not a price-basis one.

### ⛔ AND THE SIM IS STALE ON THIS EXACT MECHANISM — THREE WAYS

`SYSTEM_IMPACT_MAP.md:1633` states: *"**Stop writeback:** `paper_sim_open_positions.stop_loss` now updated on every engine ratchet (debounced 5s via `trade-safety.ts::persistTrailingStates`)."* **Every load-bearing part of that sentence is false:**
| the claim | measured |
|---|---|
| target `paper_sim_open_positions` | ⛔ **THAT TABLE DOES NOT EXIST.** `information_schema` returns only `paper_sim_open_positions_user_archive` (0 rows, 0 refs, already dispositioned dead at `3n.b`) |
| a **stop writeback** to a DB column | ⛔ **`persistTrailingStates` writes a FILE** (`fs.writeFileSync`), not a table |
| via `persistTrailingStates` | ⚠️ the function name is right; **its behaviour is not what the sentence describes** |

⚠️ **AND `:1673` SHOWS THIS IS A REPEAT:** *"STATE PERSISTENCE — ADDED 2026-08-07 … THIS WAS A REAL SIM GAP AND IT COST TWO WRONG PUBLIC CLAIMS."* **The gap was closed once and the entry has drifted again.** ⇒ **corrected as part of this batch's governance step, with the measurement beside it.**

## 3d. ⛔⛔ WHAT THIS CENSUS DOES **NOT** CLOSE — REQUIRED READING BEFORE ANYTHING CITES IT (Langston's three conditions, all re-derived by me at the object)

### (a) ⛔⛔ IT CLOSES **SINKS**, NOT **VERBS** — AND THE FIX FOR THAT IS STRONGER THAN THE ONE I PROPOSED

**MEASURED: `vts-trade-persistence.ts` holds FOUR `UPDATE vts_open_trades` sites — `:192`, `:203`, `:238`, `:281` — beside the single `INSERT` at `:141`.** A read-back fence at the insert **does not bind an UPDATE that clears a basis and leaves the level standing.** ⇒ **the fifth blind spot would have been a VERB.**
⛔ **AND THE DELETE HOP IS REAL TOO** (§9.5(a): deletes are the highest-yield hop): `server/scripts/b75-retention-sweep.ts:151` carries `{ table: 'vts_open_trades', timestampColumn: 'closed_at', retentionConstantName: … }` — a **retention GC** that mutates the table. ⇒ **STATED EXPLICITLY: in §3 and §3a, "writer" means INSERT and UPDATE. DELETE is enumerated here and is NOT part of that count.**

⇒ ★★ **SO `basis NULL iff level NULL` MUST BE A **TABLE INVARIANT**, NOT AN INSERT-TIME ONE — AND THAT IS AVAILABLE AS A DATABASE `CHECK` CONSTRAINT.** ⛔ **A `CHECK` cannot be bypassed by ANY verb, ANY writer, ANY language, or any future code nobody has written yet.** ★ **This is the project's *prefer IMPOSSIBLE over INTERCEPTED* rule in its strongest available form, and it is strictly better than the read-back fence I proposed** — a fence catches what it is pointed at; a constraint catches what nobody thought to point at. **Read-back fences remain useful as a DEPLOY-TIME proof that the constraint is installed and armed — not as the enforcement.**

### (b) ⚠️ "27 PHYSICAL" IS A COUNT AT TIME T, NOT A SET
`exit_decision_archive` is **monthly-partitioned** (`scripts/b70-create-monthly-partitions.ts`). **Next month's partition is a physical sink that does not exist in the 27 and will appear without anyone acting.** ⇒ ⛔ **THE CLOSED OBJECT IS THE 14 LOGICAL TABLES. The 27 is an observation, and partitions are GENERATED — cite 14, never 27, or the number goes stale on a calendar.**

### (c) ⚠️ THE CORPUS I SEARCHED, NAMED — SO THE NEXT READER KNOWS WHETHER `scripts/` WAS COVERED OR MERELY EMPTY
**The ORM walk and both raw-SQL walks searched `server/` ONLY.** `scripts/` was **outside the searched corpus and is inside the blast radius**: **MEASURED — 10 files under `scripts/` reference `vts_open_trades`** (Langston's own grep returned eight `scripts/analysis/*.sql` plus `scripts/b-new-33-factor-backtest.ts`). **Reads today, as far as either of us has checked — but "reads today" is a claim about what was read, not about the corpus.** ⇒ **`scripts/` is UNSEARCHED for writers, stated as unsearched.**

### (d) ⛔⛔ THE STRUCTURAL RESIDUE — MY NEW INSTRUMENT CANNOT REACH THE THING THAT CAUGHT THE LAST ONE
★ **`information_schema` + chase-the-writerless-table is an ORPHAN-*TABLE* DETECTOR: it finds tables with ZERO known writers.** ⛔ **IT IS BLIND BY CONSTRUCTION TO A *SECOND* WRITER ON A TABLE THAT ALREADY HAS ONE.** ⇒ **`vts_open_trades` is the proof: it HAD a writer, so the database chase would never have surfaced it — a REVIEWER did.**
⇒ ⛔⛔ **AFTER r3 THE **SINK** SET IS CLOSED AGAINST `information_schema`; THE **WRITER** SET IS STILL ENUMERATED BY GREP — the instrument that has now failed FOUR times.** **"Closed against `information_schema`" must NOT migrate into "the writer walk is closed."**

### (e) ★ AND THE FOURTH FAILURE WAS LANGSTON'S OWN, ON HIS OWN INSTRUMENT, WHILE VERIFYING THIS CENSUS — CARRIED BECAUSE IT IS THE SAME SHAPE
His first `dt-review grep 'vts_open_trades'` returned **30 lines, ZERO in code** — *"I nearly wrote back that your writer did not exist."* The identical command re-run returned **729 lines including `:141`**. **CAUSE: the output truncates at ~47 KB, and `1-system-manual/` + `Claude Comms/` sort BEFORE `server/`, so long documentation lines ate the entire budget and starved out exactly the class being searched for.**
⇒ ★★ **THE TRUNCATED ARTIFACT READS AS A COMPLETE RESULT — THE CAP IS ON THE ENVELOPE, NOT IN THE FILE.** Instrument correct, blind to one member class, **blindness invisible in its own output** — the same shape as all three of mine. ⇒ ⛔ **NEVER ASSERT AN ABSENCE FROM A `dt-review grep` WITHOUT ASSERTING THE HIT COUNT IS BELOW THE CAP.**

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

---

## 6. ⭐⭐ ALL FOUR LANES TRACED — AND THE BATCH'S OPENING PREMISE IS **FALSE FOR LEVEL-SETTING**

**The scope opens: *"A PRICE DOES FOUR JOBS AND WE USE THE MIDPOINT FOR ALL FOUR."* For the LEVEL-SETTING job that is now traced end to end, and it is true of ONE lane out of three.**

| lane | level basis, traced to its origin | a midpoint? |
|---|---|---|
| **crypto — QUANT** (the 19-strategy dispatch) | `getSmoothedPrice` → `signal-orchestrator.ts:2425` → `computeContext :2450` → `mce:1434` → `:2515` | ⛔ **YES — a KALMAN-SMOOTHED MIDPOINT** (median gain 0.0952) |
| **crypto — PATTERN** (Phase 14.5) | `:2207 parseFloat(ohlcData[last].close)` ← `:2378 ohlcCache.getOHLCData(symbol, 60)` ← **`ohlc-cache.ts:91/:103 krakenService.getOHLCData(...)`**, header `:6` *"Caches Kraken OHLC candle data"* | ✅ **NO — a VENUE-PUBLISHED 60-MIN CANDLE CLOSE** |
| **xStock — ACTIVE + VTS** *(ONE lane, not two)* | `scanner.ts:910 latestBar.close` ← `:597 xstockOhlcCache.getOHLCDataBatch(symbolList, 15)` ← `ohlc-aggregator.ts:277 FROM xstock_spot_ohlc_1m` ← `equity-spot-archiver.ts:270 for (const bar of msg.data) parseOhlcBar(bar)` → `:84 bufferOhlcBar` → **`passive-archive/ohlc-batch-writer.ts`, table resolved from `tableForAssetClass` (`:44`) — `xstock_spot → xstockSpotOhlc1m`** — fed by **Kraken's own WS OHLC frames** | ✅ **NO — VENUE-PUBLISHED 1-MIN CLOSES, AGGREGATED TO 15 MIN** |

### ✅ THREE THINGS THIS SETTLES, EACH MEASURED

**(1) xSTOCK ACTIVE AND VTS ARE ONE LANE, NOT TWO.** `evaluateXstockPairForVTS` has **exactly ONE call site repo-wide** — `scanner.ts:934`, mode `'paper'` — and **exactly ONE assignment to its price argument**: `scanner.ts:910 const price = latestBar.close`. ⇒ **the Step-2 audit's "three untraced lanes" is really TWO, and both are now traced.**

**(2) THE IDENTIFIER DIFFERS BY LANE, WHICH IS WHY THE EARLIER DISCRIMINATOR DID NOT TRANSFER.** The crypto file's basis identifier is `currentPrice` (**exactly two assignments**, `:2207` and `:2425`). **The xStock lane's is `price`, and its parameter is named `lastPrice`** (`eval-cycle.ts:304`). ⇒ ⛔ **"census the assignments to the consumed identifier" is correct, but the IDENTIFIER IS PER-LANE — a single name searched repo-wide would have found one lane and silently missed the other.**

**(3) A "BAR CLOSE" HERE IS A VENUE PRINT, NOT A DISGUISED MID.** `#952` establishes that the crypto v1 `c` FIELD is overwritten with a midpoint — **so the obvious worry was that the bar closes inherit it.** ⛔ **THEY DO NOT: both bar paths come from Kraken's OWN OHLC** (REST candles for crypto, WS OHLC frames for xStock), **not from our tick cache.** ⇒ **the `#952` contamination reaches the TICK path, and the BAR path is independent of it.** ★ **Checked rather than assumed, because assuming it would have produced exactly the wrong batch.**

### ⛔ AND VERIFYING THAT CHAIN EXPOSED A **FOURTH** BLIND-SPOT VARIANT — RECORDED BESIDE THE THREE IN §3a

⚠️ **I FIRST ASSERTED THE BAR CHAIN ONE LINK SHORT.** §6 as first written cited `parseOhlcBar` as the writer. **It is not — it buffers.** A repo-wide search for `INSERT INTO xstock_spot_ohlc_1m` across every file type returns **NOTHING**, while the table itself holds **17,179,154 rows, last written the same minute I looked.** ⇒ **the write exists and no name-based search can see it.**
✅ **FOUND BY FOLLOWING THE BUFFER RATHER THAN SEARCHING FOR THE TABLE:** `bufferOhlcBar` → `ohlc-batch-writer.ts`, where the target is **resolved from a MAP** — `tableForAssetClass` (`:44`), `xstock_spot → xstockSpotOhlc1m`.
⇒ ★★ **VARIANT 4: A TABLE RESOLVED FROM A MAP LOOKUP IS INVISIBLE TO *BOTH* A LITERAL-NAME SEARCH *AND* A KNOWN-OBJECT SEARCH** — the literal never appears, and the object's identifier is only reachable if you already know which key the map is indexed by. **§3a's variants were: ORM-only pattern · schema-derived sink set · name-in-a-constant. This is a fourth, and it was found by TRACING A DATA PATH rather than by searching for a name.**
★ **The correction also matters for the finding itself: the SOURCE claim (Kraken's own bars, not our mid ticks) was right, but I had published it with an unverified link in the middle. It is now verified end to end.**

### ⇒ WHAT THIS DOES TO THE BATCH

⭐ **THE LEVEL-BASIS PROBLEM IS ONE LANE WIDE, NOT FOUR.** Only the crypto QUANT lane sets levels from a midpoint — and there the midpoint is additionally **damped to under a tenth of each tick** (audit A-4). ⇒ **P4's rule still stands, but its BLAST RADIUS collapses: the severance (level constructors stop reading the smoothed value) touches the crypto quant lane ALONE.**
⚠️ **AND THE OTHER TWO LANES ARE NOT THEREBY "CORRECT" — THEY ARE A DIFFERENT QUESTION.** A venue-published bar close is a **real print**, but it is a **historical** one: the last completed bar, up to 15 minutes old on the xStock lane. ⇒ **it is not a midpoint problem; it is a STALENESS question, and it belongs to the freshness work at `3b.f-c`, not here.** ⛔ **Stated so this batch does not silently annex it.**

⚠️ **UNCHANGED BY THIS SECTION: jobs 3 and 4 (triggering and booking) are `F-G-2`'s, and the exit path's midpoint is not in question here.** This section is about **where a LEVEL comes from**, nothing else.

---

## 7. ⛔⛔ P4 — THE RULE, TESTED AGAINST THE LANES. **IT FAILED ITS OWN FALSIFICATION CLAUSE, AND THE CORRECTION IS THE DELIVERABLE**

**OBJ-2 pre-registered its own kill switch: *"A site the rule cannot classify FALSIFIES the rule."* Run against the three traced lanes, the rule as drafted CANNOT CLASSIFY TWO OF THEM.**

### THE RULE AS DRAFTED (scope §2, r1 → r4)
> *"A price that ESTIMATES VALUE stays the mid. A price that BECOMES A LEVEL, FIRES AN ACTION, or IS RECORDED must be **the side we could transact at**."*

| lane | its basis | does the rule classify it? |
|---|---|---|
| crypto **QUANT** | a Kalman-smoothed midpoint | ✅ **YES — fails the rule. Change required.** |
| crypto **PATTERN** | a Kraken 60-min candle close | ⛔ **NO. A venue candle close is NOT "the side we could transact at" — and it is NOT a midpoint either.** |
| **xStock** | a Kraken 1-min close, 15-min aggregated | ⛔ **NO. Same.** |

⇒ ⛔⛔ **THE RULE IS FALSIFIED ON ITS OWN TERMS BY TWO OF THREE LANES.** It offers two categories — *mid* and *transactable side* — and **a venue-published bar close is neither.** ★ **Under the drafted rule I would have had to call two lanes "wrong" and changed them, when what they use is a REAL TRADED PRICE. That is the batch this rule would have produced, and it would have been the wrong one.**

### ✅ THE CORRECTED RULE — IT CLASSIFIES ALL THREE, AND IT SAYS WHY

> ⭐ **A LEVEL'S BASIS MUST BE A PRICE THE MARKET EITHER *ACTUALLY PRINTED* — CARRYING ITS AGE, STATED AT THE SITE — OR ONE WE COULD *ACTUALLY TRANSACT AT*. AN UNBOUNDED-AGE PRINT IS NOT AN ANCHOR, IT IS A MEMORY. A MIDPOINT IS NEITHER — no transaction ever occurred there, and no counterparty ever offered it. A SMOOTHED midpoint is neither, and is additionally lagged.**

| lane | basis | printed? | transactable? | verdict |
|---|---|---|---|---|
| crypto **QUANT** | smoothed mid | ❌ | ❌ | ⛔ **FAILS — the batch's whole subject** |
| crypto **PATTERN** | venue 60-min candle close | ✅ | ❌ (historical) | ✅ **PASSES the basis test** |
| **xStock** | venue 1-min close, 15-min agg | ✅ | ❌ (historical) | ✅ **PASSES the basis test** |

★★ **WHY "PRINTED **OR** TRANSACTABLE" RATHER THAN "TRANSACTABLE" ALONE — AND THIS IS THE SUBSTANCE, NOT A WORDING TWEAK.** A stop is not a price we are transacting at *now*; it is **an anchor for a price we intend to transact at LATER**. Anchoring *"3% below where it last traded"* to a real print is coherent. Anchoring it to a number **no counterparty ever offered** is not — **there is nothing 3% below, because the thing you measured from never existed.** ⇒ **The defect is not "we used the wrong side"; it is "we used a price that was never a price."**

### ⚠️ WHAT THE CORRECTED RULE DELIBERATELY DOES **NOT** SETTLE

⛔ **THE BAR LANES PASS THE *BASIS* TEST AND RAISE A *DIFFERENT* ONE: A VENUE BAR CLOSE IS A REAL PRICE BUT A HISTORICAL ONE — up to 15 minutes old on the xStock lane.** ⇒ **that is STALENESS, it is `3b.f-c`'s subject, and this batch does NOT annex it.** ★ **Naming it here is what stops the next reader reading "PASSES the basis test" as "is fine."**
⛔ **AND IT SAYS NOTHING ABOUT THE TRIGGER.** Which price is compared *against* a level is `F-G-2`'s (jobs 3 and 4). **The joint — level-basis ↔ trigger-basis coherence — is OBJ-3b, whose FORM is chosen at deploy from `F-G-2`'s recorded disposition.**

### ⇒ THE CHANGE THIS BATCH MAKES, IN ONE SENTENCE

**The crypto quant lane's level constructors stop reading the smoothed midpoint and read a price that was actually printed or is actually transactable — and nothing else in the system changes.** ⇒ **The filter keeps its estimator job (ATR, VWAP, SMA, regime, noise) untouched; the two bar lanes are untouched; jobs 3 and 4 remain `F-G-2`'s.**

⚠️ **STATED AS THE OPEN DESIGN QUESTION, NOT PRE-DECIDED: WHICH replacement — the live transactable side (ask for entry, bid for stop/target, per-leg) or the venue's own last print (matching what the other two lanes already do) — IS P4's remaining choice.** ★ **The second has a strong argument I did not expect to be making at the start of this batch: it would make all three lanes consistent, and consistency across lanes is itself fidelity.** ⛔ **Not decided here; it is the one thing left for Langston's design gate.**
✅ **RULED — see §8: (a), the live transactable side. This paragraph is left standing as the record of what was OPEN at dispatch; it is not live.**

---

## 8. ⭐⭐ P4 IS RULED — **(a), THE LIVE TRANSACTABLE SIDE, PER LEG.** AND RE-DERIVING HIS SECOND REASON AT THE CODE **OVERTURNED IT** — WHICH MAKES THE RULING STRONGER, NOT WEAKER

**Langston ruled at `43e3bb95b` on 2026-09-04T19:02:35Z: *"the rule: ACCEPTED with one amendment. The choice: (a), and it isn't close once you look at what (b) actually is on this lane."*** ⛔ **His hits are LEADS. All three reasons re-derived below at the object; two hold, ONE DOES NOT.**

### ✅ AMENDMENT 1 — APPLIED, AND APPLIED *INSIDE THE RULE* RATHER THAN BESIDE IT (§7 above)
> *"…a price the market either ACTUALLY PRINTED **— carrying its AGE, stated at the site —** or one we could ACTUALLY TRANSACT AT. An unbounded-age print is not an anchor, it is a memory."*
★ **His reason, and it is the one I would have had to learn the expensive way: without the clause the rule licenses exactly the `#951`-class staleness §7 explicitly declined to annex.** ⇒ **`3b.f-c` now inherits a WRITTEN obligation instead of an unwritten one.** ⛔ **The clause imposes a STATING duty, not a threshold — no number is pre-registered here, and none should be until `3b.f-c` measures one.**

### ⛔⛔ REASON 2 IS **WRONG AT THE OBJECT** — AND IT IS A WRONG-OBJECT, THE PATTERN THAT COSTS ME MOST
**He argued (b) cannot be chosen because it does not exist:** *"the crypto WS adapter emits a BBO midpoint with **no last-trade arm at all**"*, citing `B_EXIT_BOOK_AGE_STAMP_SCOPE.md:319` — ⇒ *"(b) is either building a trades feed we don't have, or falling back on the pattern lane's 60-minute candle close."*

✅ **HIS CITATION IS ACCURATE AND I VERIFIED IT VERBATIM AT `:319`.** ⛔ **IT IS ABOUT THE *BOOK* PRODUCER.** `kraken-websocket-adapter.ts:908-943` → `producer:'kraken_ws_book_mid'` genuinely has no last-trade arm. **But that is not the producer (b) would draw on.**

⛔ **THE *TICKER* LANE CARRIES THE VENUE'S OWN LAST-TRADE PRICE ON EVERY TICK, AND WE THROW IT AWAY ON PURPOSE:**
- `kraken-websocket-adapter.ts:639` — the v2 ticker payload is `{symbol, bid, ask, **last**, …}`.
- `kraken-v2-translator.ts:64` — `const last = Number(update.last ?? update.close ?? update.c?.[0] ?? 0);` **The venue's print is parsed on every tick.**
- `:71-73` — `const markKind = markKindOf(bid, ask); const markPrice = markKind === 'mid' ? (bid + ask) / 2 : last;` ⇒ **`last` is used ONLY as the empty-book fallback.**

⇒ ⛔ **(b) IS NOT "A FEED WE DO NOT HAVE." IT IS A FEED WE RECEIVE AND DISCARD.** The cost of (b) is therefore not construction — **it is reversing a policy**, which is a completely different argument and would have been decided on a false premise.

### ⭐⭐ AND THE PROVENANCE READ LANDS EXACTLY ON THAT POLICY — IT IS WRITTEN IN THE CODE, AT THE DECISION
`kraken-v2-translator.ts:66-68`, verbatim:
> *"We prioritize Midpoint because 'Last' is often **stale on low-volume pairs**. We only use 'Last' if the order book is empty (bid or ask is 0)."*

★★ **SO (b) WAS ALREADY CONSIDERED AND ALREADY REJECTED, DELIBERATELY, FOR A STATED REASON — AND THAT REASON IS *LANGSTON'S OWN AMENDMENT 1*, EIGHT MONTHS EARLY.**
**PROVENANCE READ, DATED RATHER THAN ASSERTED (§9.5(b); `git log -S "prioritize Midpoint" --reverse`, NOT path-limited):** introduced at **`b4c0d2d67`, 2025-12-30 17:27:49 +0000**, subject *"Improve price calculation for low-volume trading pairs"*, body verbatim: *"Update Kraken WebSocket adapters to v2 and implement midpoint pricing for improved accuracy on low-volume pairs."* ⚠️ **A Replit-era agent commit (`Replit-Commit-Author: Agent`) — so the INTENT is recoverable from the message and the comment, and there is no attached human directive. Marked `INFERRED-FROM-COMMIT-MESSAGE`, not established from a decision record.**
⛔ **AND THE INTENT IS ONLY HALF-RIGHT, WHICH IS THE FIFTH DISPOSITION, NOT THE FIRST:** the commit's own words are *"for improved **accuracy**"* — ★ **it treats the midpoint as the more ACCURATE ESTIMATE OF VALUE, and on a thin book against a stale print it genuinely is.** ⇒ ✅ **That reasoning is CORRECT for the estimator job and WRONG for the level job**, which is this batch's entire thesis: **accuracy of an estimate and transactability of a level are different requirements, and the 2025-12-30 decision never distinguished them because nothing then asked it to.** ⇒ **Disposition (2): relevant but needs updating to today's intent — the midpoint KEEPS the estimator job it was built for and LOSES the level job it was never scoped for.** A last print on a thin crypto pair is an **unbounded-age print**, which the amended rule now calls *a memory, not an anchor*.
⇒ ✅ **(b) FAILS THE AMENDED RULE ON ITS OWN TERMS.** ⛔ **REASON 2 IS REPLACED, NOT REPAIRED:** the disqualifier is **not** that the arm is absent — it is that the arm is present, was deprioritised for staleness by an explicit policy, and would now fail the age clause added in the same ruling. ★ **Same verdict, checkable reason, and it survives someone later discovering the field.**
⚠️ **STATED AS UNMEASURED, BECAUSE IT IS A PRECONDITION OF (b) AND NOBODY HAS RUN IT: I have NOT measured how often `update.last` is populated, nor its age distribution.** The schema admits it (`last?: number`, `:19`) and the code parses it; **that is a code claim, not a runtime one.** ⇒ **One more reason (b) is not free: choosing it would oblige that measurement first.**

### ✅ REASON 1 HOLDS, WITH HIS OWN CAVEAT KEPT ATTACHED
`B_EXIT_TRANSACTABLE_SIDE_SCOPE.md:156` reads, verbatim at the ref: *"**Kyle's correction, taken (r2):** anything that becomes a price we **TRANSACT** at — signal-time entry, stop, target, trigger — needs the transactable side."* ⇒ **That names this exact list, so (b) would re-open a taken decision.**
⚠️ **HIS CAVEAT IS KEPT AND NOT QUIETLY DROPPED: *"it's your record of his words, not his words"*** — a transcription, so if the record is wrong it goes to Kyle and **is not settleable between Langston and me.** ✅ **I do not think it is wrong** — Kyle's test has been fidelity to live trading throughout, and on 2026-09-04 he closed the smoothed-price question with *"Understood on continuing to use the machinery for functions that we actually needed for, but not this pricing."*

### ⭐ REASON 3 IS THE ONE THAT DECIDES IT, AND IT IS THE BEST ARGUMENT IN THE RULING
> **The consistency that carries fidelity is between the LEVEL and its COMPARATOR — not across lanes.** A stop built on basis X and compared against a mark read on basis Y differs from its stated distance by (X−Y), **which is the spread — so the error VARIES WITH LIQUIDITY AND WIDENS EXACTLY WHEN IT HURTS.**
✅ **`F-G-2` is already shadow-measuring the bid as the exit mark ⇒ a bid-basis level against a bid mark is like-for-like; a last-print level against a bid mark is not, and the residual is unbounded in a thin book.**
★ **This overturns the argument I put to him — *"consistency across lanes is itself fidelity"* — and it overturns it correctly. Cross-lane sameness is COSMETIC. Basis-to-comparator sameness is what Kyle's test is actually about.**

---

### ⛔⛔ BLOCKER-1 — **CONFIRMED AT THE OBJECT.** THE SIDE IS PER-LEG **AND PER EXECUTION INTENT**
**His claim: *"ask for entry" is not a complete rule, because the entry arm is not always a taker.* RE-DERIVED, and it holds** — `active-execution-engine.ts:3820-3841`:
- `:3822` `const _b72cLimit = signal.entryPrice;` — **the maker limit IS the level.**
- `:3824-3826` maker chosen ⇒ if `isMarketableAtPlacement('buy', bestAsk, limit)` the post-only would reject ⇒ taker fallback (`MARKETABLE_TAKER_FALLBACK`) or `MAKER_MARKETABLE_DROPPED`.
- `:3839` otherwise `_b72cPendingMaker = true` — **it RESTS at the limit as a `state='pending'` position until the market trades through it.**
⇒ ⛔ **A RESTING BUY LIMIT *IS A BID*. It is filled by a seller crossing INTO it; it never lifts an ask.** ⇒ **anchoring it on the ask would overstate the entry by a full spread on the one arm that pays no spread at all.**
✅ **THE RULE, CORRECTED AND STATED WITH ITS LINES:** **taker entry → ASK** (`:3830`, the marketable-fallback arm and the normal immediate fill) · **resting maker entry → BID** (`:3839`) · **stop and target → BID** (both are SELLS for a long). ⛔ **Three sides, not two — and the constructor must be TOLD the execution intent, never infer it.**

### ⛔⛔ BLOCKER-2 — ACCEPTED IN FULL, AND IT IS THE `#546` SHAPE
**If the book is absent or one-sided at construction time the constructor REFUSES. It does NOT `?? mid`.** ★ **His reason is the one that makes it non-negotiable: a `?? mid` fallback is an absent basis wearing a plausible number's clothes — and WORSE than today, because today's midpoint is at least UNIFORM while a silent fallback would be intermittent and invisible.**
✅ **AND THE REFUSAL SHIPS AS A COUNTER, NOT A LOG LINE — a funnel counter matched to the log line, to `F-G-1`'s 3/3 standard.** ⚠️ **`B-XSTOCK-FEED-SANITY` measured hollow books LAST WEEK; this is not hypothetical.**
★ **MACHINERY THAT ALREADY EXISTS AND SHOULD BE USED RATHER THAN REBUILT: `markKindOf` is the ONE home of the mid-or-last predicate (`B-EXIT-BOOK-AGE-STAMP` P1), and `markKind` is already stamped per tick** ⇒ **the constructor can read what it was handed instead of re-deciding it.**

### ✅ HIS BLOCKER 5 — THE F-G-2 WINDOW — WAS **ALREADY DISCHARGED**, AND THE STANDING RULE IS **STRICTER THAN EITHER OPTION HE OFFERED**
**He wrote: *"A level-construction change is not among [A4's three contaminants] … Either sequence this after F-G-2's window closes, or amend A4 to name it and split at the deploy."*** ⛔ **He is STATELESS per-invoke and read at `43e3bb95b`; the amendment landed 2026-09-03.**
✅ **`F_G_2_PROGRESS_REPORT.md` §4a already carries it, pre-registered BEFORE either batch deployed and written on his OWN earlier BLOCKER-4:** the level basis *"moves the target of the comparison itself, so a split may not be sufficient and the run may be **VOID-grade**."*
⇒ ⛔ **THE BINDING RULE, ALREADY IN FORCE:** *"no `B-PRICE-SIDE-BY-JOB` change that moves the crypto level basis may DEPLOY inside this window … If a deploy becomes unavoidable, this window is declared **VOID and re-opened — not split**."*
★ **So his option (ii) — amend and SPLIT — is the one thing the standing rule forbids, and the reason is his own: a split assumes the two halves are comparable, and they are not when the comparison's target moves.**
✅ **AND IT ALREADY HAS THE DETECTOR HE WOULD ASK FOR, because he asked for it once already: the window's close enumerates every deploy record inside it and checks each sha against this batch's commit set BY ANCESTRY — non-empty intersection is `VOID`, not a judgement call — and it ships with a positive control.**
⇒ ⛔ **CONSEQUENCE, STATED PLAINLY: this batch BUILDS and is REVIEWED now, and DEPLOYS after `F-G-2`'s window closes (opened 2026-09-04T16:08:02Z, 14 days).** ★ **That is not a delay this blocker imposed — §7 already made OBJ-3b's FORM depend on `F-G-2`'s recorded disposition, so the deploy was always downstream of it.**

---

### ⇒ WHAT IS NOW SETTLED, AND WHAT IS STILL OPEN
| | |
|---|---|
| ✅ **the rule** | accepted, with the age clause folded INTO it |
| ✅ **P4's choice** | **(a) the live transactable side**, on reason 3; reason 2 replaced at the object |
| ✅ **the side, per leg AND per intent** | taker entry ASK · resting maker entry BID · stop BID · target BID |
| ✅ **absent/one-sided book** | **REFUSE**, with a funnel counter — never `?? mid` |
| ⛔ **still open** | OBJ-3b's FORM, which reads `F-G-2`'s disposition at deploy — **and deploy is after 2026-09-18** |

---

## 9. ⛔⛔ THE WIRING CENSUS (Step 3) — **FOUR FINDINGS, AND TWO OF THEM CHANGE THE IMPLEMENTATION RATHER THAN CONFIRM IT**

**§8 settled WHICH SIDE each level sits on. This section is what happened when I went to WIRE it, and it did not go the way the plan assumed.** ⛔ **Every item re-derived at the object; nothing here is inferred from the plan.**

### W-1 ⭐ FOUR CONSUMERS OF `indicators.currentPrice`, NOT ONE — AND **TWO** ARE LEVEL-SETTING
The scope traced the crypto QUANT lane through `signal-orchestrator.ts:2515` and I expected the severance to be one line. **Repo-wide, tests excluded:**
| site | what it does | is it a level? |
|---|---|---|
| `signal-orchestrator.ts:2515` | hand-off into the 19-strategy dispatch | ⛔ **LEVEL** |
| `vts-runner.ts:1520` | the VTS lane's identical hand-off | ⛔ **LEVEL** |
| `strategy-engine.ts:718` | `atr / indicators.currentPrice` — a dimensionless ratio | ✅ estimator, correct as-is |
| `strategy-engine.ts:1573` | a `console.log` | ✅ neither |
| `orb.ts:244` | breakout detection, then geometry | ⚠️ **level, but xStock-only AND gated off** (`strategy_gates.enabled=false`, B-NEW-34) |
⇒ ⛔ **CHANGING ONLY THE ORCHESTRATOR WOULD LEAVE THE VTS LANE — THE LEARNING POPULATION — STILL SETTING LEVELS FROM THE SMOOTHED MID, WHILE EVERY ACTIVE-PATH CHECK READ AS FIXED.** ★ **That is `fix-follows-pointer` exactly: the fix reaches the sites the plan named and stops one line short.**
⚠️ **AND MY FIRST GREP FOR `decideMakerTaker` MISSED ITS CALL SITE ENTIRELY** — a `head -10` truncated before `signal-orchestrator.ts:1052`, and I nearly built the design on "the orchestrator does not decide maker/taker." **A truncated search is not a census, in the section whose whole subject is incomplete enumeration.**

### W-2 ⛔⛔ THE SEVERANCE **CANNOT** BE A RE-EXPRESSION AT THE SIZED-SIGNAL CHOKEPOINT — AND THAT WAS MY PLAN
**The attractive design was one insertion at `buildSizedSignalForStrategy`, beside F-G-1's grid: take the incoming triple and re-express each leg on its own side. ONE site, before rounding, no strategy edits.** ⛔ **IT IS WRONG AND IT WOULD HAVE SHIPPED SILENTLY.**
**A strategy does not express geometry as offsets from one anchor.** Stops come from support levels, ATR bands, measured moves, prior-bar extremes — **each with its own construction.** ⇒ **A generic "shift entry to the ask, shift the stop to the bid" transform would CHANGE EVERY STRATEGY'S RISK GEOMETRY in ways that strategy never intended, and nothing downstream would notice** — the triple stays well-ordered, the grid rounds it, the SQE scores it.
⇒ ✅ **THE CORRECT SHAPE IS TWO FIELDS AT THE ANCHOR, WHICH IS THE SEVERANCE STATED LITERALLY:** `currentPrice` **stays the smoothed value for DETECTION** (*"is price above the VWAP?"* — an estimator question, untouched, zero risk) and a **`levelBasis` is added for GEOMETRY**. Each strategy's geometry lines then read `priceForLevelRole(basis, role)`. **More edits, mechanical ones, and the detection logic is never touched — which is where the risk would have been.**

### W-3 ⛔⛔ THE PRICE CACHE **CANNOT SOURCE A LEVEL BASIS**, AND THE REASON IS AN AGE THAT DATES THE WRONG THING
`CachedPrice` (`price-cache.ts:41-51`) carries `bid`, `ask` and `lastUpdatedAt`, so it looks like the obvious source. **It is not:**
1. ⛔ **THE HIGH-FREQUENCY PATH REFRESHES THE MARK AND ITS TIMESTAMP WITHOUT TOUCHING THE SIDES.** `updateFromWebSocket` / `updateFromRest` (`:402-430`) write `ask: existing?.ask ?? price, bid: existing?.bid ?? price` and stamp `lastUpdatedAt: now`. **Callers: `kraken-websocket-adapter.ts:1096` (every WS tick), `live-pricing-adapter.ts:817` and `:1038`.** Only the full-ticker REST refresh (`:176-184`, `:280`, `:355`) sets the sides from `ticker.a` / `ticker.b`.
⇒ ★★ **`lastUpdatedAt` IS THE AGE OF THE MARK, NOT THE AGE OF THE SIDES** — refreshed by a path that provably does not refresh them. **Feeding it to the age clause would produce a basis that states an age which is TRUE for a field we do not use and FALSE for the two we do.** ⛔ **That is `wrong-object` INSIDE the clause written to prevent staleness, and it would have read as compliant.**
2. ⛔ **AND ON A FIRST WRITE FOR A SYMBOL, `?? price` MAKES BOTH SIDES EQUAL THE MARK** — the cache reports a two-sided book **that does not exist.**
✅ **THE MODULE ALREADY REFUSES BOTH** (a synthetic book has `bid === ask`) — **but it was reporting `crossed_book`, and that reason name sends a reader to the VENUE when the fault is OURS.** ⇒ **SPLIT this turn into `locked_or_synthetic_book`, with its own test and its own funnel counter.** ★ **The refusal was already right; the DIAGNOSIS it handed the next reader was not.**

### ⛔⛔⛔ **W-4 IS WITHDRAWN — IT WAS FALSE, AND IT IS THE WORST KIND OF FALSE: I DECLARED MISSING A THING I SHIPPED MYSELF SIX DAYS AGO**

**W-4 (below, struck) claimed the mini-book carries no capture time and therefore *"Langston's amendment 1 is not satisfiable from any existing source"*, making a book-stamping change REQUIRED WORK for this batch.** ⛔ **ALL OF THAT IS WRONG.**

**MEASURED AT THE OBJECT, 2026-09-05:**
- `kraken-websocket-adapter.ts:170` — `private bookUpdatedAt = new Map<string, number>();`
- `:918` — `this.bookUpdatedAt.set(internalSymbol, Date.now());` — stamped on **every applied delta**, and sited with care: **AFTER the checksum arm**, so a desynced book that resubscribes is never dated, and **BEFORE the BBO-validity `continue`**, so *"a transiently one-sided book still records its age"* (the comment says so).
- `:3245-3265` — **`getBookForFill(symbol)` RETURNS `{ asks, bids, ageMs }`**: both sides, sorted, zero-filtered, **with the age**, and **fail-closed** — `null` when there is no stamp or no two-sided book.
- ✅ **AND IT IS ALREADY IN USE:** `active-execution-engine.ts:1619` `bookAgeMs: _bookX ? _bookX.ageMs : null`.

⇒ ★★ **THE AGE CLAUSE'S SOURCE IS `getBookForFill`, IT IS EXACTLY THE SHAPE `buildLevelBasis` NEEDS, AND IT WAS SHIPPED BY `B-EXIT-BOOK-AGE-STAMP` — MY OWN BATCH, DEPLOYED `104fa755b` ON 2026-08-30.**

### ⛔ HOW I GOT IT WRONG, BECAUSE THE MECHANISM IS THE REUSABLE PART
**I read the `orderBooks` Map's VALUE TYPE — `Map<string, { bids; asks }>` — saw no time field, and concluded the capability was absent.** ⛔ **The stamp lives in a SIBLING MAP keyed by the same symbol.** ★ **A container's shape is not an inventory of what the class knows.** ⇒ **`wrong-object`: I inspected the wrong noun and generalised from it — the same pattern that already costs me most, arriving through a new door.**
⚠️ **AND THE SEARCH THAT WOULD HAVE CAUGHT IT WAS ONE I DID NOT RUN: I grepped for `timestamp` inside the adapter and for the type declaration. I never grepped for the CAPABILITY** — *"what in this file records when a book changed"* — which is exactly `workflow-01`'s *"grep the repo for the CAPABILITY, not just for the name you would give it."*

### ⛔⛔ AND THE CONSEQUENCE IS NOT COSMETIC — IT PROPAGATED INTO A REVIEWER'S RULING
**Langston tagged W-3 and W-4 `RULED ON REPORTED FACT`: he did NOT re-derive them.** ⇒ **My false claim entered the record UNCHALLENGED, and he built an ordering on it** — *"W-4's ordering follows: the stamp lands FIRST, and its positive control is a non-zero `accepted` count … until then the module refuses 100% of crypto."*
⇒ ✅ **THAT DEPENDENCY DOES NOT EXIST. There is no stamp to land. The level basis can be wired NOW.** ★ **This is precisely why `RULED ON REPORTED FACT` is disqualifying for a PROCEED on the leg it covers — the tag did its job by marking the leg he could not stand behind, and the leg was the one that was wrong.**

⚠️ **W-3 IS *NOT* WITHDRAWN AND IS UNAFFECTED.** It is about `CachedPrice` — a different object — and I read `price-cache.ts:402-430` directly and quoted it. Its conclusion (*the price cache cannot source a level basis*) still holds; it simply no longer matters, because `getBookForFill` is the better source and always was.

⛔ **THE ORIGINAL W-4 IS PRESERVED BELOW RATHER THAN DELETED, because a withdrawn claim that vanishes teaches nobody, and Langston's ruling cites it by name.**

---

### ~~W-4~~ ⛔ **WITHDRAWN — SEE ABOVE. PRESERVED AS WRITTEN:** ~~**THE AGE CLAUSE HAS NO SOURCE TODAY.** THE MINI-BOOK IS NOT TIMESTAMPED **AT ALL**~~
`kraken-websocket-adapter.ts:138` — `private orderBooks = new Map<string, { bids: Map<number, number>; asks: Map<number, number> }>()`. **No capture time, no field for one.** And the live accessor `getLatestPriceData` (`:3218-3235`) returns `{ bid, ask, mid }` — **a correct book top with no way to say how old it is.**
⇒ ⛔ **SO LANGSTON'S AMENDMENT 1 IS NOT SATISFIABLE FROM ANY EXISTING SOURCE.** ★ **The clause did exactly what a good clause does — it named a property, and the property turned out to be missing.** ⇒ **Stamping the mini-book at update is REQUIRED WORK for this batch, not an optional nicety**, and it is why `age_unknown` exists as a refusal: **until that stamp lands, this module fails closed on every crypto symbol rather than inventing an age.**
⚠️ **NOT YET MEASURED, AND NAMED SO IT IS NOT ASSUMED: how STALE the sides actually get.** The structural fact — that `lastUpdatedAt` dates the mark — is established at the code; **the size of the gap is not, and it needs the stamp from W-4 before it can be measured at all.**

### ⇒ WHAT THIS LEAVES OPEN — **ONE DESIGN FORK, AND IT IS LANGSTON'S GATE**
⛔ **THE ENTRY LEG'S SIDE DEPENDS ON EXECUTION INTENT (§8 BLOCKER-1) — AND THE INTENT IS DECIDED *AFTER* THE GEOMETRY IS BUILT.** Order, at the code: the strategy sets the triple → `buildSizedSignalForStrategy` rounds it to the venue grid → **`decideMakerTaker` at `signal-orchestrator.ts:1052`** → SQE → RTB → promotion, where `active-execution-engine.ts:3824` reads the book AGAIN and rests or crosses.
⇒ **At geometry time the constructor cannot know whether the entry will rest or cross — and BLOCKER-1 forbids it from GUESSING.**
★ **AND IT IS NOT CIRCULAR, WHICH IS THE PART THAT MAKES A CLEAN ANSWER POSSIBLE: `decideMakerTaker` needs BOTH sides to make its comparison** — cross now and pay the ask, or rest and pay the bid but risk no fill. **So carrying the basis to that decision feeds it something it wants anyway.**
**MY LEAN, STATED SO IT CAN BE ATTACKED RATHER THAN RATIFIED: the stop and target resolve to the bid AT GEOMETRY TIME (both are sells for a long — their side is known and cannot change), and the ENTRY leg resolves at `:1052`, where the intent becomes known.** ⛔ **The alternative — set entry on the ask at geometry time and correct it later on the maker arm — is inferring the intent and then patching it, which is the thing BLOCKER-1 names.**

---

## 10. ⛔⛔ THE SPREAD IS ALREADY IN THE MODEL — **AS FRICTION.** LANGSTON'S BLOCKER, RE-DERIVED AND **CONFIRMED**, AND HIS PRESCRIBED FIX NEEDS ONE REFINEMENT

**Langston, 2026-09-04T20:44Z: the fork in §9 is FALSE, and the reason is a double-count nobody had named.** ⛔ **Re-derived by me at the object before accepting a word of it — his hits are leads.**

### ✅ CONFIRMED, AND THE CODE'S OWN COMMENT SAYS IT
`cost-model.ts:163-164`:
```
export function computeTotalRoundTripCost(fee: number, slippage: number, spread: number): number {
  return (fee * 2) + (slippage * 2) + spread;
}
```
**Spread charged ONCE — and that once IS the mid-to-mid correction.** Buy at the ask (`mid + ½ spread`), sell at the bid (`mid − ½ spread`) ⇒ the round trip loses **one full spread** against a mid-to-mid accounting. ⇒ ★★ **THE FRICTION MODEL'S PREMISE IS THAT EVERY LEG IS MID-PRICED.** `maker-taker-decision.ts:217` states it outright: *"Round-trip cost = 2·fee + 2·slip + spread (spread applied once, at entry)."*

⇒ ⛔ **SO SIDING THE LEVELS WITHOUT TOUCHING FRICTION CHARGES THE SPREAD TWICE ON THE TAKER ARM** — once in the geometry, once at `:216-220`.
⇒ ⛔ **AND THE MAKER ARM GETS A BONUS IT NO LONGER EARNS.** `:236-238`: `makerEntryAdvantagePct = (feeRateTaker − feeRateMaker) + costs.spread + costs.slippage`. **Under sided levels the maker arm is bid-to-bid — zero spread BY CONSTRUCTION — and is credited `costs.spread` anyway.**
⇒ ⭐ **NET SWING IN THE COMPARISON ≈ 2× SPREAD, ALL OF IT TOWARD MAKER**, against a crypto fee delta of 40 bps. **Decision-flipping, and invisible: the triple stays well-ordered, the grid rounds it, the SQE scores it, and no test downstream sees a thing.**

### ⛔⛔ HIS PRESCRIBED FIX — *"`costs.spread` LEAVES THE FRICTION MODEL"* — IS RIGHT IN DIRECTION AND **CANNOT BE APPLIED TO THE SHARED FUNCTION.** MEASURED
`computeTotalRoundTripCost` is **the canonical friction formula for the whole system**, not the maker/taker decision's private helper. **Census, repo-wide:**
| | |
|---|---|
| **production files importing it** | **11** |
| **production call sites** | **24** |
| **test files referencing it** | **27** |
**The consumers include** `expectancy.ts:635` (Net Expectancy itself), `ready_to_buy_service.ts`, `signal-orchestrator.ts:1921` and `:3115`, `vts-service.ts:349`, `cost-telemetry.ts:84`, `cost-drift-monitor.ts:60`/`:103`, and the `tec-costs` diagnostics API.
⇒ ⛔ **DELETING `spread` FROM IT WOULD UNDER-CHARGE EVERY LANE WHOSE LEVELS ARE STILL MID-PRICED — which is BOTH BAR LANES AND ALL OF xSTOCK — and would silently move every cost telemetry and drift-monitor series at the same time.** ★ **This batch sides ONE lane (§6: crypto QUANT). A global formula edit would apply the correction to three lanes that never received the geometry it corrects for.**

### ✅ THE REFINEMENT — **THE SPREAD'S HOME IS DECIDED PER SIGNAL, BY A STAMP, NOT GLOBALLY BY AN EDIT**
⭐ **`computeTotalRoundTripCost` STAYS EXACTLY AS IT IS.** It is the CORRECT formula for a mid-priced triple, and after this batch three of four lanes still have one. **Nothing about it is wrong; what was wrong is applying it to geometry it does not describe.**
⇒ ✅ **A signal whose levels came from a `LevelBasis` carries that fact as a birth stamp** — the same shape as F-G-1's `gridAtBirth`, and exactly the *stamp-at-construction, enforce-at-persistence* conclusion §3b reached. **`decideMakerTaker` reads the stamp and prices accordingly:**
| | mid-priced triple (unchanged) | **sided triple (this batch's lane)** |
|---|---|---|
| taker friction | `2·fee + 2·slip + spread` | ⭐ **`2·fee + 2·slip`** — the spread is in the geometry |
| maker advantage | `Δfee + spread + slip` | ⭐ **`Δfee + slip`** — bid-to-bid earns no spread saving |
| entry price | one value, both arms | ⭐ **TWO: `entryTaker = basis.ask`, `entryMaker = basis.bid`** |
★★ **AND THE TWO-ENTRY CHANGE IS NOT A CONCESSION — IT IS WHAT KILLS THE §9 FORK.** I asked *where does the entry leg resolve, given intent is known only later.* **The answer is that it does not need to resolve to ONE price at all: the comparison prices EACH ARM ON ITS OWN SIDE, which is what the comparison is FOR.** ⇒ **My §9 lean survives on stop and target and was the wrong question for entry.**
⚠️ **AND THE ARMS' R:R NOW DIFFER, WHICH IS CORRECT AND MUST NOT BE "FIXED":** a taker entry sits a full spread above a maker entry against the same bid-side stop, so **risk and reward move in OPPOSITE directions between the arms.** That is the real economics the mid was concealing.

### ⛔ SECOND BLOCKER — **pFill's REFERENT MOVES AND THE CONSTANT DOES NOT.** CONFIRMED AT `:255`
`const pFill = clamp01(haircut.makerFillProbability);` — **a flat DB constant (crypto 0.50).**
**Today's maker limit is a smoothed MID: inside the spread, and therefore aggressive — it is likely to fill.** ⛔ **Bid-anchored, it joins the BACK OF THE QUEUE: the true fill probability FALLS and the assumed 0.50 does not move.**
⇒ ⛔ **THAT COMPOUNDS WITH THE DOUBLE-COUNT, IN THE SAME DIRECTION:** the maker arm gets a better entry, an unearned spread credit, AND an unchanged optimistic fill assumption. **The trade we would actually be making — fewer `MAKER_MARKETABLE_DROPPED` (§8's `:3830` point, correct) in exchange for more deadline-drops — is one the model cannot see.**
✅ **NAMED AS REQUIRED WORK, NOT LEFT TO RIDE:** pFill re-basing ships with the sided levels, or is an **explicit deferral with the maker pick-rate and drop-rate as its named instrument.** ⛔ **Silence on it is not an option — an unmoved constant beside a moved referent is `#546`'s shape in a coefficient.**

### ⇒ WHAT IS NOW SETTLED AND WHAT IS STILL OPEN
| | |
|---|---|
| ✅ **the double-count** | **CONFIRMED at `cost-model.ts:164` + `maker-taker-decision.ts:216-238`** |
| ✅ **the §9 fork** | **DISSOLVED — two entries, one per arm; stop/target still resolve at geometry time** |
| ⛔ **the fix's SHAPE** | **stamp-driven per signal, NOT a global formula edit — 11 files / 24 sites / 27 test files say so** |
| ⛔ **pFill** | **re-base with the change, or defer explicitly with the pick-rate instrument named** |
| ✅ **F-G-2 interaction** | **already handled — he raised it statelessly 19 minutes after ratifying the VOID himself; the window is not open** |

---

## 11. ⭐⭐ THE SHADOW ARM IS LIVE AND IT EARNED ITS KEEP ON DAY ONE — **THE LEVEL BASIS CAN BE BUILT FOR ~0.5% OF CRYPTO EVALUATIONS**

**Deployed `4dc231e5714f34405b958975d92c3983e04bfcfc` at 2026-09-05T08:12:21Z.** ✅ **Langston's positive control is SATISFIED — `accepted` is NON-ZERO on both lanes, so the mechanism runs end to end on live data.** ⛔ **And the rate is the finding.**

| lane | attempted | accepted | refused | every refusal reason |
|---|---|---|---|---|
| `active:crypto_spot` | 218 | ⛔ **1** | 217 | **`no_book` 217** — every other reason ZERO |
| `vts:crypto_spot` | 166 | ⛔ **1** | 165 | **`no_book` 165** — every other reason ZERO |

### ⭐ THE CAUSE IS **COVERAGE, NOT QUALITY** — AND THAT IS READABLE STRAIGHT OFF THE FUNNEL
**Every single refusal is `no_book`. `one_sided_book`, `crossed_book`, `locked_or_synthetic_book`, `non_finite_side`, `age_unknown` and `implausible_spread` are ALL ZERO.** ⇒ ★ **The books we DO have are fine. We simply do not have them.** ⛔ **That is the opposite of the failure this batch was braced for — I built five quality refusals and the one that fires is the one that says the input never arrived.**
**MEASURED, WITH ITS CONTROL:** in the same window the scanner evaluated **132 distinct crypto symbols** (24,887 `[Phase13][MCE]` lines) while `WS_BOOK_TICK FIRST` fired for **2**.

### ⭐⭐ AND THE CAUSE IS NOW MEASURED, NOT GUESSED — **IT IS NOT A BOOK-SUBSCRIPTION GAP AT ALL**
⚠️ **r1 OF THIS SECTION SAID *"plausibly open positions and RTB candidates"*. THAT WAS A GUESS WITH A HEDGE ON IT. Traced:**
1. ⛔ **BOOKS AND TICKERS ARE SUBSCRIBED TOGETHER, FROM ONE LIST.** `kraken-websocket-adapter.ts:1280` (ticker) and `:1296` (book) both take `krakenSymbols` — the same array, in the same `subscribeToSymbols()` call. ⇒ **there is no book-specific shortfall to find. Book coverage EQUALS ticker coverage by construction.**
2. ✅ **CONFIRMED LIVE:** `Subscribing to 2 symbols (ticker+book)`; `WS_TICK_V2 FIRST` = **2**; `WS_BOOK_TICK FIRST` = **2**. **Identical.**
3. ⭐ **SO THE REAL NUMBER IS THE SUBSCRIBED SET, AND IT TIES OUT EXACTLY: `active_open_positions` holds 2 open `crypto_spot` rows, and the subscribed set is 2** (`TRIA/USD`, `XPL/USD`).
⇒ ★★ **THE LIVE ORDER BOOK IS MAINTAINED FOR SYMBOLS WE ALREADY HOLD — NOT FOR THE SYMBOLS WE ARE CHOOSING BETWEEN.**

### ⛔⛔ THERE ARE **TWO SEPARATE PRICE PATHS**, AND THE SCANNER IS ON THE ONE WITHOUT A BOOK
| path | fed by | covers | has a real order book? |
|---|---|---|---|
| **WebSocket** → mini-book | ~10 event-driven `subscribeToSymbols` call sites, mostly `[symbol]` singular — opens, promotions, audits | **the hot set: what we HOLD** | ✅ **yes** |
| **REST polling** → `priceCache` | four buckets: `openTrade` 2 s · `readyToBuy` 15 s · **`fx5Snapshot` 30 s** · `vtsSimulation` 60 s | **the 132-symbol sweep** | ⛔ **NO — a 30-second REST snapshot, whose `bid`/`ask` additionally go stale independently of its timestamp (W-3)** |
⇒ ⛔⛔ **THIS IS EXACTLY BACKWARDS FOR THIS BATCH: WE NEED THE BOOK AT SIGNAL BIRTH, TO SET THE LEVELS — AND WE ONLY HAVE IT AFTER WE HAVE ALREADY BOUGHT.**
★ **The 0.5% is therefore NOT a statistical rate awaiting more samples. It is `hot set ÷ evaluated set`, and both terms are known.** ⇒ **more shadow time cannot move it; only a design decision can.**

### ⛔ THE LIMIT ON THAT NUMBER, STATED BEFORE ANYONE ACTS ON IT
⚠️ **THE PROCESS WAS ~10 MINUTES OLD.** `WS_BOOK_TICK FIRST` fires once per symbol per process, and the app restarted at 08:12:21Z. ⇒ **`2` is a COLD-START reading and I am NOT claiming it as steady state.** **The 218-attempt funnel is from that same warm-up window, so the two are consistent with each other and neither is yet a rate.**
⇒ ✅ **RE-READ REQUIRED AFTER A FULL SESSION BEFORE THIS NUMBER DECIDES ANYTHING. That re-read IS the shadow arm's job, and it is why the arm ships before the geometry.**

### ⛔⛔ THE DESIGN QUESTION IT RAISES, AND IT IS LOAD-BEARING FOR THE WHOLE BATCH
**If book coverage stays anywhere near this low, `buildLevelBasis` cannot be the SOLE source of crypto level construction — it would refuse nearly every signal, and a batch that refuses to price 99% of signals has not improved fidelity, it has stopped trading.**
⇒ **Three shapes, none chosen here:** (a) **subscribe books for the evaluated universe** — a real feed-load question, not a free one; (b) **build levels only where a book exists and leave the rest on today's basis** — honest but splits the population, which is its own measurement problem; (c) **accept a narrower scope for this batch** — side the levels only for symbols we already hold a book for, which is the promotion path and may be most of what matters.
★ **This is exactly what a shadow arm is FOR: the question arrived as a measured rate on day one instead of as a surprise at the switch.** ⛔ **Langston's gate, once the steady-state rate is in.**

### ⚠️ AND A DISCOVERABILITY WART IN MY OWN INSTRUMENT, RECORDED RATHER THAN LEFT
**The funnel is exposed at `/api/xstocks/filter-diagnostics` (`routes.ts:8175`) — and it carries CRYPTO counters.** ⛔ **I read `/api/vts/filter-diagnostics` first, found nothing, and briefly took a working reader for a broken one.** ★ **The control that caught it: its neighbour `gridAbsentSymbols` was ALSO absent from that payload while `gridTags` appeared twice — so the block I edited was not the block that endpoint serves.**
⇒ **DISPOSITION (§9.4 #2): move it to a crypto-appropriate surface, added to this batch's remaining work.** ⚠️ **Not urgent — it is reachable and now documented — but a crypto counter reachable only from the xStock diagnostics page is a trap for the next reader, and this batch's whole subject is instruments that mislead.**
