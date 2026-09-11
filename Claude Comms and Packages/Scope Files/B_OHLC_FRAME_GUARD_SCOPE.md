# B-OHLC-FRAME-GUARD — SCOPE (`#1028`) · r3

change-class: non_architecture

> **Owner:** CC-C · **Opened:** 2026-09-11 · **Plan:** `PHASE_19_PLAN` row `3b.h-6` — ✅ **CONFIRMED by Langston**
> **Status:** ✅ **STEP 1 APPROVED at r2** (Langston, re-derived at `de642fee6` and against the sink on PG 17.6). **Step 2 underway — the conditions it must carry are in §14.** ➕ **r3 (Step 2): two defects folded in as OBJ-7 (`#1029`) and OBJ-8 (`#1030`), and §14 O3 corrected — ruled at the Step-2 gate; the evidence is in the pre-audit.**
> **Rule 23 fix-on-find.** Surfaced by critical alert `b48a743f` (`OHLC archive writer failing PERMANENTLY — xstock_spot`), `2026-09-11T05:33:02Z`.
> **NOT A HOTFIX** (`workflow-hotfix` §1): test 1 fails — nothing is broken now; test 2 fails — one occurrence in ~14 days of instrumentation; §2 item 5 is YES — a symptom of `#950`. **Re-confirmed after the `NaN` finding (§9): zero stored `NaN` anywhere it was checked, so that hazard is latent too.**

---

## r3 — WHAT CHANGED FROM r2, AND WHY *(Step 2 — the evidence for every row is in `B_OHLC_FRAME_GUARD_PRE_AUDIT.md` r2)*
| # | r2 said | r3 says | source |
|---|---|---|---|
| 1 | §14 O3: crypto counting at the caller is an overcount that would **inflate** the panel's store ratio | **crypto's *scanned* counter (`:159`) is where the commit that created it says it belongs** — *"every WS message received"* (`b8eba807e`); **its *persisted* counter (`:158`) is not**; and a counted-but-skipped bar **deflates** the ratio, whose denominator *scanned* is (`drift-dashboard-aggregator.ts:943-944`). ⇒ **OBJ-7**, `#1029` | provenance read + the consumer · pre-audit A4, J8 |
| 2 | O3 names one counter, OHLC only | two counters, both channels, all three producers — **xStock's and futures' *scanned* placements are the ones that deviate** | Langston (crypto `:158`, ticker `:164`), extended by census |
| 3 | §7: futures OHLC is REST-replayable | **only across a restart** — the poller stores each minute as it stood when first polled and never re-reads it ⇒ **OBJ-8**, `#1030` | measured with a control · pre-audit A15 |
| 4 | §2: crypto's block has "no counter bumps at all" | it counts at the caller | corrected in place |
| 5 | OBJ-3 cites `:862-867` as the aggregator's mapping | the mapping is `:968-982`; `:864-869` is the universe list | read at the ref |

## r2 — WHAT CHANGED FROM r1, AND WHY
| # | r1 said | r2 says | source |
|---|---|---|---|
| 1 | validator = "each price field parses to a **finite** number" | **accept exactly what is a real, finite number its column can hold — and reject `NaN` even where the column would store it** (§9) | Langston's contract, **corrected** by a verified sink test |
| 2 | the class is the **four** price fields | the class is **all eight** fields — seven numerics plus `interval_begin` | Langston attack 2 |
| 3 | counter in the stats getter **only** | counter **rendered end to end**, and an **instance** field in the futures archiver | Langston attack 3, re-derived |
| 4 | the two spot blocks are **"byte-identical"** | **the defect is identical; the blocks are not** | Langston correction 1, re-derived |
| 5 | the lost bars **"cannot even be identified"** — asserted | **not identifiable — now MEASURED, with a control that tests his counter-claim** (§11 R2) | Langston correction 2, **tested and not upheld** |
| 6 | — | **two rejection-set members the ruling did not list:** `trade_count` integer range, and partition range | re-derivation of the ruling's own contract |
| 7 | — | pre-registered implementation trap, **proven** | Langston, proven at the object |

---

## 1. WHAT IS BROKEN — in plain terms
When Kraken's WebSocket sends a one-minute price bar that carries a symbol and a timestamp but a **missing or malformed** value, one of two things happens:
- **The database rejects it**, and the writer throws away **the whole batch** of bars it arrived with — good bars included. Those bars cannot be fetched again. *(This is what happened at 05:33.)*
- **Or — worse, and found while re-deriving the ruling — the database ACCEPTS it.** A `NaN` price or volume is **stored**, raises no alert, and when the bar aggregator later takes the highest price in a 15-minute bucket, `NaN` beats every real price. **The signal bar's high becomes unreadable, silently.** *(Not happening today — §9 — but the path is open.)*

## 2. THE MECHANISM — cited at `origin/migration/aws-supabase`
| site | what it does |
|---|---|
| `server/services/passive-archive/equity-spot-archiver.ts:85` | the only entry check: `if (!data?.symbol \|\| !data?.interval_begin) return;` — **tests that the key fields are truthy; never tests a value, and never tests that the timestamp parses** |
| `equity-spot-archiver.ts:91` | `intervalBegin: new Date(data.interval_begin)` — an unparseable stamp becomes an `Invalid Date` |
| `equity-spot-archiver.ts:92-95` | `open: String(data.open)` · `high` · `low` · `close` — **no guard at all.** `String(undefined) === "undefined"` |
| `equity-spot-archiver.ts:96-98` | `volume: String(data.volume ?? '0')` · `vwap: data.vwap != null ? String(data.vwap) : null` · `tradeCount: data.trades != null ? Number(data.trades) : null` — ⛔ **guarded against ABSENCE only, never against MALFORMATION: a present `NaN` passes straight through** |
| `crypto-spot-archiver.ts:105-120` | ⛔ **the same defect** — `:112-115` unguarded identically. ⚠️ **But not the same block:** crypto's has no liveness stamp, and ~~no counter bumps at all~~ **counts at the CALLER — `:158-159` OHLC, `:164` ticker (r3)** |
| `kraken-futures-archiver.ts:86-98` | passes typed REST strings (`open: candle.open`) — not the `String(undefined)` mechanism, but an absent or malformed value sinks the chunk the same way |
| `server/services/passive-archive/ohlc-batch-writer.ts:292-306` | one `db.insert(...).values(slice).onConflictDoUpdate(...)` per 1,000-row chunk — **one rejected row fails the whole chunk** |
| `ohlc-batch-writer.ts:326` | classified PERMANENT, `rows.length` dropped, not retried |

## 3. MEASURED — object, population, reach
| measurement | result |
|---|---|
| `error.log`, reach `2026-09-11 00:00:01Z` → `~06:05Z` | **1** `xstock_spot PERMANENT flush failure` (`05:33:02Z`, 10 rows); **0** for `crypto_spot` |
| `out.log`, reach `05:13:50Z` → `06:05:09Z` | **615** successful `xstock_spot` flushes, **616** `crypto_spot` — writer healthy on both |
| `xstock_spot_ohlc_1m`, last 6h | **18,664** rows, latest `05:49:00Z` |
| every permanent-writer alert ever raised | **1** — this one. ⚠️ **The alerting only exists since `F-G-1` OBJ-9 (`98640f00a`, 2026-08-28), so first ALERT is not first OCCURRENCE.** |
| bars per minute `05:20`–`05:46Z` | `05:33` = **40**, inside a 36–55 band. ⛔ **Non-discriminating — a 10-bar loss is invisible at this resolution. Not cited as "no loss".** |

## 4. PROVENANCE (MANDATORY 1.b) — original intent, quoted verbatim
**Introducing commit, by `git log -S "open: String(data.open)" --reverse` (not path-limited), confirmed by `git blame -L 87,98`:** `ce4a7e408`, 2026-05-01, *"B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)"*:
> *"Continuous 1-min OHLC + ticker-snapshot capture across three asset universes, persisted to month-partitioned dump tables for B70 archival takeover later. **NO signal-pipeline impact, NO admission gates, NO consumers in v1 — pure passive accumulation.**"*

⇒ ✅ **Not careless in its original context:** in a dump nobody read, a lost or malformed bar cost nothing.
⛔ **The component changed role underneath the code.** `xstock_spot_ohlc_1m` now feeds the bar aggregator (`ohlc-aggregator.ts:277`) and the xStock bar cache, which writes `xstock_spot_ohlc_15m_snapshot` — **the table the scanner reads to generate signals** (`scanner.ts:593`). **This is `#950`'s exact fault; `#1028` is a symptom of it.**

**CORPORA ACTUALLY SEARCHED:** `git log -S` + `git blame`; `RUNNING_ISSUES` (`#704`, `#705`, `#950`); `SYSTEM_IMPACT_MAP` §B74; `SYSTEM_MANUAL` (grep); `PHASE_19_PLAN`; a repo-wide census of every writer and reader. **NOT searched: `bridge/canonical/`** (B74 post-dates the 2026-01/02 governance change) **and `BATCH_CATALOG`.**

| component | disposition (of the five) |
|---|---|
| value handling in `parseOhlcBar` (both spot) and `pollOhlcOnce` (futures) | **(2) relevant, needs updating to today's intent** — a no-consumer dump became a signal input |
| the *"OHLC bars are REST-replayable"* comments | **(2)** — true of the futures legs, false of both spot classes |
| the writer's whole-chunk drop | **(1) still correct as a writer** — residual R1 |

## 5. MANDATORY 1.a — ARCHITECTURAL READ, AND WHAT IT FOUND WRONG
⛔ **`SYSTEM_IMPACT_MAP` §B74 is stale on the load-bearing point:** *"NO signal-pipeline integration; substrate accumulation only."* The 1-minute table now feeds the 15-minute signal bars ⇒ **OBJ-6.** Its writer line refs are also stale (`:147-164`, `:105-114`).

## 6. EXISTENCE CHECK
**No value validator exists anywhere on the OHLC ingest path.** Repo-wide, tests excluded, the only check is key presence. *(Checked deliberately: `#1025` and `3b.f-c` §15 were both cases of proposing to build something already built.)*

## 7. §9.5(a) CENSUS AT `bufferOhlcBar`
| question | members |
|---|---|
| **who WRITES** | **3 callers:** `crypto-spot-archiver.ts:107` · `equity-spot-archiver.ts:87` · `kraken-futures-archiver.ts:86` |
| ⚠️ **the futures archiver is ONE class with TWO instances** | `crypto-perp-archiver.ts:27` and `equity-perp-archiver.ts:23`, each behind its own getter (`getCryptoPerpStats` `:33`, `getEquityPerpStats` `:29`) ⇒ **a module-level counter would merge the two legs** |
| **who READS** `xstock_spot_ohlc_1m` | aggregator, xStock bar cache → 15m snapshot → scanner, eval-cycle, `vts-runner`, `vts-service`, exit-strategy replay, freshness monitor, drift dashboard |
| **who DELETES** | `b75-retention-sweep.ts` (partition-level) |
| **who SCHEDULES** | WS event-driven (both spot) · 60 s REST timer (futures) · 5 s flush timer (writer) |
| **re-fetch path** | ⛔ **exactly ONE — `pollOhlcOnce`, futures only.** Both spot classes are WebSocket-only ⇒ **a dropped spot bar is unrecoverable** · ⚠️ **r3: and `pollOhlcOnce` re-reads a minute only across a restart — between restarts it stores each minute as it stood when first polled (`#1030`, OBJ-8)** |

## 8. ⭐⭐ THE SINK'S EXACT ACCEPT / REJECT SET — VERIFIED, NOT RECALLED
**Tested read-only on the staging database (`PostgreSQL 17.6`) with casts; nothing written. Types from `information_schema`; partitioning from `pg_partitioned_table` + `pg_inherits`.**

| column | type | ⛔ the database REJECTS — and drops the whole chunk | ⚠️ the database **ACCEPTS** — and a reader cannot use |
|---|---|---|---|
| `open` `high` `low` `close` | `numeric(20,8)` NOT NULL | absent · `""` · `"undefined"` · `"null"` · `±Infinity` · **\|v\| ≥ 10¹²** (incl. `"1e12"`) | ⛔ **`NaN`** |
| `volume` | `numeric(28,8)` NOT NULL | absent · `±Infinity` · **\|v\| ≥ 10²⁰** | ⛔ **`NaN`** |
| `vwap` | `numeric(20,8)` nullable | `±Infinity` · **\|v\| ≥ 10¹²** *(null is fine)* | ⛔ **`NaN`** |
| `trade_count` | `integer` nullable | **`NaN`** · **fractions (`"3.5"`)** · **outside [−2,147,483,648, 2,147,483,647]** *(null is fine)* | — |
| `interval_begin` | `timestamptz` NOT NULL, **RANGE-partitioned** | **`Invalid Date`** · ⛔ **any stamp with no partition: 17 monthly partitions, ZERO `DEFAULT`, currently `2026-04-01` → `2027-09-01`** | — |

**Zero and negative values are ACCEPTED** (`0.00000000`, `-5.00000000`).
⛔ **THE READER HAZARD, measured:** `SELECT max(x) FROM (1, NaN, 5)` returns **`NaN`**; `min` returns `1`. ⇒ **one stored `NaN` makes a 15-minute bar's high `NaN`.**

## 9. ⛔⛔ THE CONTRACT — LANGSTON'S, AND WHERE IT IS UNSAFE
**The ruling set it as:** *"reject exactly the set the sink rejects, no more."* **It is right on two counts and unsafe on one.**
- ✅ **Right:** zero and negatives must PASS — they are representable, and plausibility is the reader's job and `#950`'s.
- ✅ **Right:** "finite" alone is not enough — `1e12` is finite and overflows the price column.
- ⛔ **UNSAFE: the sink ACCEPTS `NaN`** in every price and volume column (§8). **"No more" would let `NaN` through into the archive, where it silently corrupts rollups.**

⇒ ✅ **THE INVARIANT — Langston's repaired form, APPROVED: ADMIT A VALUE IF AND ONLY IF IT IS BOTH *STORABLE* AND *AGGREGATABLE*.** `NaN` is storable and not aggregatable → rejected. Zero and negatives are both → admitted. `1e12` is neither → rejected. **Per column:** prices `|v| < 10^12` · volume `|v| < 10^20` · `trade_count` an integer inside `int4` · `interval_begin` a parseable timestamp. ⭐ **`±Infinity` is rejected regardless of today's sink:** unconstrained `numeric` ACCEPTS `Infinity` — only the `(20,8)`/`(28,8)` precision rejects it — so it is one column redeclaration from a `NaN`-class hazard. *(Replaces r2's "reject `NaN` even where the column would store it", which was exception-shaped — and an exception is a door.)*
★ **THE LINE BETWEEN THE GUARD'S JOB AND THE READER'S, stated so it can be attacked:** **VALIDITY** — *is this a number the column can hold and a reader can aggregate?* — is the guard's. **PLAUSIBILITY** — *is −5 a sane price?* — is the reader's. **`NaN` is not a number at all, so rejecting it is validity, not plausibility.**

⚠️ **AND IT CORRECTS THE RULING'S BLAST RADIUS FOR ATTACK 2:** a malformed `volume`/`vwap` does NOT have *"the same blast radius"* as a dropped chunk. **A present `NaN` there is STORED.** Only `trade_count` (an integer column) rejects `NaN` and drops the chunk. ⇒ **the silent path is the worse one — a drop at least raises an alert; a stored `NaN` raises nothing.**

✅ **IS IT HAPPENING NOW? NO — measured, with a positive control first** (`= 'NaN'` matches a real stored `NaN`, 1 of 3):
| object | rows scanned | stored `NaN`, any numeric column |
|---|---|---|
| `xstock_spot_ohlc_1m`, last 24h | 199,965 | **0** |
| `crypto_spot_ohlc_1m`, last 24h | 157,884 | **0** |
| **`xstock_spot_ohlc_15m_snapshot` — the table the scanner reads — every row held** | **1,695,013** | **0** |
⚠️ **Reach, stated:** the 1-minute tables were scanned for 24 hours, not all-time; the 15-minute table in full. ⇒ **latent, not live.**

---

## 10. OBJECTIVES AND VERIFICATION CRITERIA

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **ONE exported validator over all EIGHT fields, implementing §9's contract.** ⛔ **PRE-REGISTERED TRAP, PROVEN AT THE OBJECT:** `Number.isFinite(Number(v))` returns **true** for `""`, `null`, `" "`, `[]`, `false` (all coerce to `0`) **and for `"1e12"`** (which overflows). ⇒ **type-gate first** — a `number`, or a non-empty trimmed string — **then parse, then range-check.** | A unit table covering **every accept and reject row in §8**, including `NaN`, `±Infinity`, both magnitude edges, `"3.5"`, the `int4` edges and `Invalid Date`. ⭐ **Mutation-proven:** removing any single rejection clause must fail at least one test. |
| **OBJ-2** | **All three producers call it and skip a failing frame BEFORE `bufferOhlcBar`** — a bad frame is never buffered, so it can never take good rows down with it. | Unit test: mixed good and bad frames buffer exactly the good ones, unchanged. Code read: the validator is the only gate in all three. |
| **OBJ-3** | **A skipped frame is COUNTED and LOGGED — never silent** (`#704`/`#546`): a counter, plus a rate-limited stderr line naming the symbol, **which** field, and **why**. ⭐ **Carried end to end:** getter field → `PassiveArchiveUniverseStats` (`drift-dashboard-aggregator.ts:673`, an **explicitly typed** interface that **drops any field it does not declare**) → the aggregator's mapping (`:968-982`; r3 — r2 cited the universe list) → rendered in `PassiveArchiveSection`. ⛔ **In `KrakenFuturesArchiver` it is an INSTANCE field** (two instances, §7). **Crypto-spot counts at the CALLER (`crypto-spot-archiver.ts:158-159`, per shard), not inside `parseOhlcBar` — see §14 row O3.** | Unit test: increments once per skipped frame, per class, **without cross-talk between the two futures legs**. **Staging: the count is visible in the Passive Archive panel** — Step 7's UI surface. |
| **OBJ-4** | **Correct the false "OHLC is REST-replayable" generalisation in code** — `ticker-batch-writer.ts:154` and the `ohlc-batch-writer.ts` rationale block. | Diff review. |
| **OBJ-5** | **Correct the alert's over-generalisation** — `ohlc-batch-writer.ts:167` says *"every further flush for this class will fail the same way"*; a malformed-row fault is per-batch, not per-class. | Diff review. |
| **OBJ-6** *(Step 10)* | **`SYSTEM_IMPACT_MAP` §B74 and `SYSTEM_MANUAL`** — the 1-minute table feeds the 15-minute signal bars; the frame guard and its contract; the stale writer line refs. | Content diff at the ref. |
| **OBJ-7** *(r3 · `#1029`)* | **The panel's counters mean the same thing in every producer.** ***Scanned*** counts every bar or snapshot item a parser receives — what `b8eba807e` built it for and what the panel labels *"scanned (since PID)"*; ***persisted*** (per-minute) counts only bars buffered; ***skipped*** counts guard rejections. **Moves:** crypto `:158` behind the parser's return value · xStock `:101` and `:205` ahead of their guards · futures `:100` ahead of the validator (candles newer than the high-water mark only) and `:148` ahead of `:126`. **Live today in both directions** — pre-audit A4. ⚠️ **Disagrees with part of §14 O3 and of Langston's point 1 on *scanned* — pre-audit J8.** | Unit tests, per producer: a rejected bar → *scanned* +1, *skipped* +1, *persisted* 0; an accepted bar → *scanned* +1, *persisted* +1; a symbol-less ticker snap → *scanned* +1. Code read: every bump sits on the stated side of its guard. |
| **OBJ-8** *(r3 · `#1030`)* | **The futures poller stores each minute's final bar.** Skip only candles **strictly older** than the high-water mark (`kraken-futures-archiver.ts:85`, `<` not `<=`), so the minute last seen as newest is read again and upserted with its final values; the mark advances past every evaluated candle, accepted or rejected. | ⭐ **The instrument exists, with its control:** `scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py` on staging. **Baseline, 2026-09-11 `05:47`→`07:44Z`, 116 minutes:** stored volume short of the venue's final bar in **14 / 24 / 2** minutes on three crypto perps and **1 / 1 / 1** on three xStock perps; `open` matched **116/116** on all six. **PASS:** zero shortfalls on minutes at least 3 minutes old, over a window wholly after the deploy, with `open` still matching. Unit test: the newest-seen minute is buffered again on the next poll with its later values. |

**BEHAVIOUR:** a valid frame's path is **byte-identical**. ⚠️ *r3 — except futures, where OBJ-8 deliberately buffers the newest-seen minute a second time: the perp legs' scanned and per-minute counts roughly double and their store ratio roughly halves.* The change can only OMIT a frame that would have failed — **or that would have been stored as `NaN`.** ⇒ readers gain the innocent rows that used to be dropped with a bad one, and can never receive a `NaN`.

## 11. ✅ RULED BY LANGSTON AT STEP 1 — BOTH ITEMS CLOSED (carried in §14)
1. ✅ **RULED: option (c) — partition bounds stay OUT of the guard; it rejects `Invalid Date` only.** Not because it is plausibility: partition absence already has its own loud detector, and a guard that silently skipped out-of-partition stamps would mask it. See §14.
2. ✅ **RULED: the `NaN` line is right** — Langston re-ran it and withdrew his contract. See §9 and §14.

## 12. OUT OF SCOPE — EACH WITH A DISPOSITION (§9.4)
| # | item | disposition |
|---|---|---|
| **R1** | **The writer's whole-chunk drop** stays a latent amplifier for any other rejected-row cause | **(2) add as an item to `#705`** |
| **R2** | **The 10 bars lost at `05:33:02Z`** | **(5) no work — UNRECOVERABLE, and NOT IDENTIFIABLE.** ⭐ **The ruling said they are identifiable by set difference. TESTED, with a control:** `05:33` shows **9** symbols present at `05:32` and `05:34` but absent at `05:33` — **yet every minute from `05:22` to `05:40` shows 3–11 such gaps from ordinary no-trade minutes** (`6,5,6,3,6,4,9,5,4,6,8,`**`9`**`,10,10,5,8,11,5,7`). **`05:33` is not an outlier.** ⇒ the set difference returns candidates **indistinguishable from normal thin-trading gaps**; it cannot separate the loss. *(Two further blurs: a later update for the same minute self-heals some, and the `05:33:02Z` flush may carry late `05:32` updates.)* |
| **R3** | **`#950`'s feed rebuild** | untouched — `#1028` recorded there as a symptom |
| **R4** | **Critical alert `b48a743f`** | ✅ **RESOLVED 2026-09-11.** ⛔ **My earlier "not acked, or it swallows the next failure" was the WRONG MODEL:** `system-alerts.ts:503-508` suppresses a new alert while ANY same-key alert is non-resolved, so leaving it ACTIVE swallowed the next failure just as acking would. **Only RESOLVED keeps the detector live.** Event over, body refuted by hourly bars; the defect is tracked here. |
| **R5** *(r3)* | **The per-minute counter is named *persisted* and counts BUFFERED bars** — `bufferOhlcBar` is an in-memory push (`ohlc-batch-writer.ts:232-234`); `BUG-2026-04-30-G` records the health line reading non-zero while zero rows landed | **(1) folded as a comment at each declaration. The log token `rows_persisted_60s` is NOT renamed** — `#594`'s record, `BUG-2026-04-30-G` and `BATCH_74_SCOPE.md:109` quote it as the health line's fixed form |
| **R6** *(r3)* | **An absent volume is stored as zero** in all three producers (`?? '0'`) — storable and aggregatable, so the guard admits it, and indistinguishable from a real zero | **kept, pending Langston (pre-audit J6).** The guard sees the defaulted value, so no bar that stores today is newly dropped |

## 13. DOCUMENT SET — class `non_architecture`
**Required:** scope · pre-audit · completion report · `BATCH_CATALOG` · `PHASE_HISTORY`. **Conditional, discharged by OBJ-6 — `judged: yes`, never `N/A`:** `SYSTEM_MANUAL` · `SYSTEM_IMPACT_MAP`. **Also `judged: yes` and carried on the ledger (Langston C3, per the `d8d4999bb` rule):** `RUNNING_ISSUES` (`#1028`, `#1029`, `#1030`; R1 → `#705`; R3 → `#950`) · `PHASE_19_PLAN` (`3b.h-6`) · `CHANGES_AND_FIXES`.

---

## 14. ✅ STEP 1 APPROVED — WHAT STEP 2 MUST CARRY *(Langston, 2026-09-11, re-derived at `de642fee6` and on PG 17.6)*

| # | condition | where it came from |
|---|---|---|
| **I** | **Admit iff storable AND aggregatable**; `±Infinity` rejected regardless of today's sink (§9) | Langston repaired his own contract after re-running the `NaN` test |
| **P** | **Partition bounds OUT of the guard (option c).** Guard rejects `Invalid Date` only. | Partition absence has a dedicated detector — `checkPartitionHeadroom` (`passive-archive-bootstrap.ts`) — with a measured history of **failing open**: `BUG-2026-04-30-G` (`CHANGES_AND_FIXES:1627`) and `P19-B-PERPFEED` BLOCKER-2. A guard skipping those rows would hide its only loud symptom. |
| **P-check** | ✅ **RUN, CLEAN:** all **8** archive tables (the ruling said 6 — the `crypto_perp` pair was added later) have a partition covering **now and tomorrow**, **0** `DEFAULT` partitions | measured at `pg_inherits` |
| **C1** | **The skip path ESCALATES, not just counts** — a sustained skip rate crosses a threshold into `system-alerts`. Threshold designed in Step 2. | His attack on OBJ-3: the guard trades today's loud destructive failure for a quiet lossy one, and a persistent malformation would be strictly quieter than now |
| **C2** | **The counter is NEVER rate-limited; only the log line is, and the throttle reports how many lines it suppressed.** | Otherwise the panel and the log disagree and neither can be read |
| **C3** | **§13 carries every required AND judged ledger row** | the `d8d4999bb` ledger rule |
| **O3** | ⛔ **CRYPTO COUNTS AT THE CALLER, SO THE GUARD WOULD MAKE IT OVERCOUNT.** `crypto-spot-archiver.ts:157-159` calls `parseOhlcBar(bar)` and then bumps **two** counters unconditionally. ⛔ **r3 CORRECTION — r2 named one and said the panel's ratio would INFLATE.** *Persisted* (`:158`, the health line) must follow the return value. ***Scanned* (`:159`) is right where it is** — `b8eba807e` built it to count *"every WS message received"* and the panel labels it *"scanned (since PID)"* — and a counted-but-skipped bar **DEFLATES** the ratio (`drift-dashboard-aggregator.ts:943-944`), which for a *"drift indicator"* (`:688`) is the point. ⇒ **`parseOhlcBar` returns whether it buffered; the caller bumps *persisted* on `true`, *skipped* on `false`, *scanned* on both — OBJ-7, `#1029`.** ~~Equity and futures both bump after buffering, so an early return skips their count naturally.~~ ⛔ *r3: for scanned that is the deviation, not the safe case — xStock (`:101`, `:205`) and futures (`:148`) leave discarded items out.* | Re-derived at the ref — and it corrects "crypto has no counter to sit beside", which Langston ruled and I adopted: the counter exists, one frame up |
| **O4** | **OBJ-4 refined:** `ticker-batch-writer.ts:154` ("OHLC bars are REST-replayable") is the unscoped false claim; `ohlc-batch-writer.ts:66-67` is correctly scoped to "that leg" but was just **misread by the reviewer** — so fix `:154` and make `:66-67` unambiguous. | Langston called the 10 lost bars "REST-replayable" citing a comment; only the futures legs are |
