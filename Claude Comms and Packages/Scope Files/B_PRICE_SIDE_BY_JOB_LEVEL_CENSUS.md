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

⇒ ★★ **EVERY PERSISTED LEVEL IN THE SYSTEM PASSES THROUGH EXACTLY THREE FILES:**
**`server/storage.ts`** · **`server/services/rtb-shadow-store.ts`** · **`server/services/trading-signals-cleanup.ts`**

✅ **NO TABLE IN THE SINK SET HAS ZERO WRITERS.** Stated explicitly: the earlier zero was an instrument artefact, not an absence.

## 4. ⭐ WHAT THIS CHANGES ABOUT THE FIX — AND IT IS THE POINT OF DOING IT BACKWARDS

The Step-2 audit found **70 sites across 19 files that COMPUTE a level**. This census finds **3 files where every level LANDS**. **Those are different populations doing different jobs, and conflating them is what made the earlier plan look bigger and vaguer than it is:**

| | population | what it is for |
|---|---|---|
| **CONSTRUCTION** | 70 sites / 19 files | **where the change is made** — a level constructor must read a transactable price |
| **PERSISTENCE** | **3 files** | ⭐ **where the change can be VERIFIED** — a narrow, closed choke point |

⇒ ⛔ **A FENCE AT THE CONSTRUCTION SITES CAN ONLY EVER BE 70 SEPARATE ASSERTIONS THAT DRIFT INDEPENDENTLY. A CHECK AT THE THREE WRITERS IS ONE ASSERTION THAT EVERY LEVEL, FROM ANY LANE AND ANY FUTURE STRATEGY, MUST PASS.** That is the difference between a rule enforced by whoever remembers it and a rule enforced by the structure — **the same lesson `B-XSTOCK-FEED-SANITY` learned the hard way when its invariant lived in the caller** (Langston's C1, 2026-09-03).

## 5. ⛔ WHAT THIS CENSUS DOES **NOT** YET ESTABLISH

1. **THE LANE COLUMN IS NOT COMPLETE.** The sink walk names *where levels land*; attributing each of the 70 construction sites to `crypto-quant` / `crypto-pattern` / `xStock-active` / `xStock-VTS` requires reading each site's own basis. **Three lanes remain untraced** (Step-2 audit). ⇒ **P4 cannot close on this document alone — my own falsification clause.**
2. **THE IN-MEMORY CLASS IS NOT COVERED, AND IT IS INVISIBLE TO THIS METHOD BY CONSTRUCTION** (Langston named it as the first thing to look for): **a level that gates a trigger in memory and is never written to any of the 26 columns** — trailing-stop and TEC recomputation. **A sink walk cannot see a value that has no sink.** ⇒ **it needs its own pass, and it is NOT closed by this census.**
3. **The write-site counts are per-file, not per-call-path.** `storage.ts` carries multiple level-writing functions; this document establishes the **file** set is closed, not that each function has been read.

---

**STATUS:** P3 structural half **DONE** — the sink set is named and the writer set is closed at three files. **Remaining on P3: the lane attribution (blocked on the three untraced lanes) and the in-memory pass (item 2).**
