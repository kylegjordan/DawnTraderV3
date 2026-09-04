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

> ⭐ **A LEVEL'S BASIS MUST BE A PRICE THE MARKET EITHER *ACTUALLY PRINTED* OR ONE WE COULD *ACTUALLY TRANSACT AT*. A MIDPOINT IS NEITHER — no transaction ever occurred there, and no counterparty ever offered it. A SMOOTHED midpoint is neither, and is additionally lagged.**

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

