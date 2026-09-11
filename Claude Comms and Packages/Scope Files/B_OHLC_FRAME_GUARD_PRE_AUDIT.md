# B-OHLC-FRAME-GUARD — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (`#1028`) · r1

> **Owner:** CC-C · **Plan row:** `PHASE_19_PLAN` `3b.h-6` · **Scope:** `B_OHLC_FRAME_GUARD_SCOPE.md` (Step 1 ✅ APPROVED at r2; conditions in its §14)
> **ONE document, ONE sign-off. THE AUDIT COMES FIRST; THE PLAN FALLS OUT OF IT.** Every plan item back-references the audit finding it comes from. Anything with no audit treatment is flagged **`UNAUDITED`** in place.
> **Reviewer loop:** ⏳ pending — record at §8 before dispatch.

---

## 0. ⛔ PREVIOUSLY STATED → NOW — every number and claim that moved since the scope was first written

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| **1** | validator = each price field parses to a **finite** number (scope r1) | **admit iff STORABLE and AGGREGATABLE**, across all eight fields; **`±Infinity` rejected regardless of today's sink** | the database ACCEPTS `NaN` (verified, PG 17.6); Langston withdrew his "sink set" contract and repaired it |
| **2** | partition range: an open design question (r2 §11) | **OUT of the guard** — `Invalid Date` only | Langston ruling, option (c): partition absence has its own detector, and a guard skipping those rows would mask it |
| **3** | crypto has "no counter to sit beside" (ruled, adopted in r2) | crypto **counts at the caller** (`crypto-spot-archiver.ts:158-159`) — **and would overcount skipped frames** | re-derived at the ref |
| **4** | `b48a743f` "deliberately not acked, or it swallows the next failure" | **resolved** — leaving it ACTIVE swallowed the next failure just the same | `system-alerts.ts:503-508` suppresses on any non-resolved state |
| **5** | OBJ-4: `ticker-batch-writer.ts:154` **and** the `ohlc-batch-writer.ts` rationale are false | **only `:154` is false**; `ohlc-batch-writer.ts:66-67` is correctly scoped, but was misread by the reviewer | read at the object |
| **6** | "six B74 archive tables" (Langston ruling) | **eight** | the `crypto_perp` pair was added later (`passive-archive-bootstrap.ts` `ARCHIVE_TABLES`) |

---

# PART I — THE AUDIT

## 1. THE SIX SOURCES — which were read

| # | source | read? | for what |
|---|---|---|---|
| 1 | **The code**, at `origin/migration/aws-supabase` | ✅ | all three producers, the writer, the alert service, the aggregator, the panel |
| 2 | **Runtime logs + database** | ✅ | `error.log` / `out.log` failure and flush lines; the sink tested read-only on PG 17.6; partition catalog; `NaN` scan |
| 3 | **`SYSTEM_IMPACT_MAP`** | ✅ | §B74 — stale on the load-bearing point (A13) |
| 4 | **`SYSTEM_MANUAL`** | ✅ (grep) | passive-archive feeds and ticker tables; **silent on the 1-minute table's role as a signal input** — a governance gap, OBJ-6 |
| 5 | **Batch reports + ledger** | ✅ | `#704`, `#705`, `#950`, `#1028`; `CHANGES_AND_FIXES` `BUG-2026-04-30-G` |
| 6 | **`bridge/canonical/`** | ⛔ not applicable | B74 (2026-05-01) post-dates the 2026-01/02 governance change; provenance is the introducing commit, quoted in scope §4 |

---

## 2. AUDIT FINDINGS

### A1 — The mechanism *(re-confirmed; scope §2)*
`equity-spot-archiver.ts:92-95` and `crypto-spot-archiver.ts:112-115` build `open`/`high`/`low`/`close` with `String(data.X)` and no guard. The only entry check (`:85` / `:106`) tests that `symbol` and `interval_begin` are **truthy** — never a value, and never that the timestamp **parses** (`:91` `new Date(data.interval_begin)` yields `Invalid Date`). `volume`/`vwap`/`tradeCount` (`:96-98`) are guarded against **absence only**: a present `NaN` passes through.

### A2 — The sink's accept / reject set *(verified read-only on PG 17.6; scope §8)*
| column | REJECTS — drops the whole chunk | ACCEPTS, and a reader cannot aggregate |
|---|---|---|
| `open/high/low/close` `numeric(20,8)` NOT NULL | absent · `""` · `"undefined"` · `"null"` · `±Infinity` · `\|v\| ≥ 10^12` | **`NaN`** |
| `volume` `numeric(28,8)` NOT NULL | absent · `±Infinity` · `\|v\| ≥ 10^20` | **`NaN`** |
| `vwap` `numeric(20,8)` nullable | `±Infinity` · `\|v\| ≥ 10^12` | **`NaN`** |
| `trade_count` `integer` nullable | `NaN` · fractions · outside `int4` | — |
| `interval_begin` `timestamptz` NOT NULL, RANGE-partitioned | `Invalid Date` · no covering partition | — |

`max(1, NaN, 5)` returns **`NaN`**. **Unconstrained `numeric` ACCEPTS `Infinity`** (Langston) — only the typmod rejects it today.
**Zero `NaN` stored today**, positive control first: 0 in 199,965 xStock and 157,884 crypto one-minute rows (24h); 0 in all 1,695,013 rows of `xstock_spot_ohlc_15m_snapshot`.

### A3 — ⛔ ENTRY POINTS, ENUMERATED FIRST, REPO-WIDE *(§9.5(a-ii))*
| producer | the ONE call path into its buffering function | scheduler |
|---|---|---|
| xStock spot | `handleMessage` → `if (msg.channel === 'ohlc' && Array.isArray(msg.data))` → `for (const bar of msg.data) parseOhlcBar(bar)` (`equity-spot-archiver.ts:270`) | WebSocket event |
| crypto spot | `handleMessage` → `if (msg.channel === 'ohlc' && …)` (`crypto-spot-archiver.ts:155`) → `parseOhlcBar(bar)` (`:157`) | WebSocket event |
| futures (both perp legs) | `pollAllOhlc` → `pollOhlcOnce(sym)` (`kraken-futures-archiver.ts:114`) → per-candle `bufferOhlcBar` (`:86`) | **two**: the 60 s interval (`:214`) and the initial poll (`:216`) |

✅ **Exactly one call path per producer; a validator inside each parser/loop covers every entry.**
⚠️ **Two schedulers over `pollAllOhlc` — mutual exclusion checked:** overlapping polls could both read `lastOhlcInterval` before either updates it and buffer a candle twice. **Absorbed downstream:** the writer de-duplicates in-buffer by `(symbol, interval_begin)` and then upserts. **Not a hazard for the guard; pre-existing; out of scope.**

### A4 — ⛔ STATE-WRITE CENSUS: THE COUNTERS, AND WHO READS THEM *(§9.5(a-ii))*
| producer | where the "stored" counter is bumped | effect of an early return from the guard |
|---|---|---|
| xStock spot | **inside** `parseOhlcBar`, **after** `bufferOhlcBar` (`state.rowsPersistedLastMinute++`, `state.cumulativeOhlcRows++`) | ✅ skipped naturally |
| futures | **inside** the candle loop, **after** `bufferOhlcBar` (`this.cumulativeOhlcRows++`) | ✅ skipped naturally |
| crypto spot | ⛔ **at the CALLER**, unconditionally: `crypto-spot-archiver.ts:157` `parseOhlcBar(bar)` then `:158-159` `shard.rowsPersistedLastMinute++; shard.cumulativeOhlcRows++` | ⛔ **a skipped frame would still be counted as stored** |

**Readers:** `get*Stats()` → `computePassiveArchiveStatus` (`drift-dashboard-aggregator.ts`) → `ohlcStoreFraction` = stored ÷ scanned, and the universe `status` → `PassiveArchiveSection`. ⇒ **crypto overcounting would silently inflate the panel's store ratio.**

### A5 — The dashboard chain *(for OBJ-3)*
`PassiveArchiveUniverseStats` (`drift-dashboard-aggregator.ts:673`) is **explicitly typed** — a field not declared there is **dropped**. The aggregator builds each row field by field in `universes.push({…})` inside `computePassiveArchiveStatus`. The client mirrors the shape in a local type (`client/src/pages/analytics.tsx:1854-1855`) and renders it in `PassiveArchiveSection` (`:1874`; cells at `:1971`, `:1974`). **Adding one counter touches four places: getter → interface → mapping → client type + column.**

### A6 — The alert mechanism to reuse *(for C1)*
`alertPermanentWriteFailure` (`ohlc-batch-writer.ts:139`): an in-memory latch **claimed synchronously before the first `await`** (closes a two-flush race), JSONL `addAlert` — **not** the Postgres `system_alerts` table, which no per-turn check reads — with a `dedupe_key`, and the latch **released if the raise fails**.
`ALERT_CATEGORIES` (`system-alerts.ts:69-77`) is a closed set: `governance · breakage · soak_verification · one_off · verification · reminder · health_check`. **A new category needs Langston's decision.**
Dedupe (`system-alerts.ts:503-508`) suppresses on **any non-resolved** same-key alert.

### A7 — ⛔ ABSENCE CLAIMS *(grep-based; reach stated; Mode-B reviewer required — §8)*
- **No existing helper escalates on a SUSTAINED rate.** Searched `server/` (tests excluded) for `sustained|consecutive…alert|rate…threshold|perMinute|windowCount`; every hit is unrelated.
- **No existing throttled logger reports HOW MANY lines it suppressed.** `friction-divergence.ts` carries a boolean `suppressedByCooldown`; `feed-integrity-auto-check.ts` logs "Alert suppressed (cooldown or duplicate)" with no count.
⇒ **C1 and C2 each need a small helper.** ⚠️ *These are absences; they stand only if the reviewer's independent search agrees.*

### A8 — Partitions *(option (c))*
`checkPartitionHeadroom` (`passive-archive-bootstrap.ts`) self-heals **today's** partition and warns on short lookahead — **at boot only**. Its failing-open history: `BUG-2026-04-30-G` (`CHANGES_AND_FIXES:1627`) and `P19-B-PERPFEED` BLOCKER-2.
✅ **Measured now, clean:** all 8 archive parents have a partition covering **now and tomorrow**, **0** `DEFAULT` partitions. Forward coverage beyond boot belongs to the monthly and daily partition creators — **not this batch's work.**

### A9 — Tests *(for OBJ-1/2/3)*
Vitest; `vi.mock('../../db.js', …)`; in-memory logic tested, DB path verified on staging (`server/tests/unit/b70-archive-batch-writer.test.ts`). **The archivers already use a `…ForTests` export convention** (`equity-spot-archiver.ts` exports `_logDiagNonDataMessageForTests`, `_resetDiagNonDataState`). **No mutation-testing framework exists** — adding one would be scope creep.

### A10 — Comments *(OBJ-4)*
`ticker-batch-writer.ts:154` says, unscoped, *"OHLC bars are REST-replayable"* — **false for both spot classes.** `ohlc-batch-writer.ts:66-67` is correctly scoped to *"that leg"* — **and was misread by the reviewer as covering spot.**

### A11 — The alert body *(OBJ-5)*
`ohlc-batch-writer.ts:167` asserts *"every further flush for this class will fail the same way until it is fixed."* **Refuted:** the batch is spliced out before the insert, so the next flush succeeds — 3,632 and 3,297 bars landed in the next two hours.

### A12 — Provenance *(scope §4)*
B74, `ce4a7e408`: *"NO consumers in v1 — pure passive accumulation."* The table is now a signal input. **Rule 24 outcome (2).**

### A13 — Documentation gap *(OBJ-6)*
`SYSTEM_IMPACT_MAP` §B74: *"NO signal-pipeline integration"* — stale. Its writer line refs are stale too. `SYSTEM_MANUAL` is silent on the 1-minute table feeding 15-minute signal bars.

---

# PART II — THE PLAN (every item → its findings)

### P1 — The validator · → **A1, A2, A7**
New module `server/services/passive-archive/ohlc-frame-validator.ts`, exporting `validateOhlcFrame(frame)` → `{ ok: true, row } | { ok: false, field, reason }`.
Per field, in order: **(1) type-gate** — a `number`, or a non-empty trimmed `string`; everything else rejected, so `""`, `null`, `" "`, `[]` and `false` can never coerce to `0` *(Langston's pre-registered trap)* · **(2) parse** · **(3) `Number.isFinite`** — rejects `NaN` and `±Infinity` · **(4) column bound** — prices `|v| < 10^12`, volume `|v| < 10^20` · **(5) `trade_count`** — `null` passes, else `Number.isInteger` and inside `int4` · **(6) `interval_begin`** — `Date.getTime()` finite.
**Zero and negatives are admitted.**
⭐ **Valid frames stay byte-identical:** the row carries `String(original value)`, **never** `String(Number(v))` — which would rewrite `"125.40"` as `"125.4"` and `"1e2"` as `"100"`.

### P2 — Wire it into all three producers · → **A3, A4**
- **xStock spot:** `parseOhlcBar` validates first and returns before `bufferOhlcBar`; its counters already sit after buffering.
- **crypto spot:** ⛔ **`parseOhlcBar` returns `boolean`** (buffered or not). The caller at `:157-159` bumps the stored counters on `true` and the skip counter on `false`. *(O3.)*
- **futures:** the candle loop `continue`s on a failed frame; its counter already sits after buffering.

### P3 — The skip counter, end to end · → **A4, A5, C2**
xStock: `state.ohlcFramesSkipped`. Crypto: per-shard `shard.ohlcFramesSkipped`, summed in `getCryptoSpotStats`. ⛔ **Futures: an INSTANCE field `this.ohlcFramesSkipped`** — two instances serve the two perp legs.
Carried through **getter return types → `PassiveArchiveUniverseStats` (`ohlcFramesSkipped: number`) → the aggregator's `universes.push` → the client type → a `PassiveArchiveSection` column.**
⛔ **C2: the counter is NEVER rate-limited.**

### P4 — The throttled skip log · → **A7, C2**
At most one stderr line per `(producer, assetClass)` per interval, naming the **symbol, field and reason**, and appending **`(+K suppressed since last line)`**. A small local helper in the validator module.
⚠️ **`UNAUDITED` — the interval value.** There is no measured skip rate to anchor it on; the guard does not exist yet.

### P5 — The sustained-skip escalation · → **A6, A7, C1**
Reuse A6's pattern verbatim: a synchronously claimed latch, JSONL `addAlert`, `dedupe_key` `ohlc-frame-skip-sustained-<assetClass>`, released on a failed raise. Severity `warning`.
**The trigger targets Langston's own attack scenario — Kraken renames a field and every frame for a symbol fails forever: a persistent per-symbol skip streak, not a global rate.**
⚠️ **`UNAUDITED` — the threshold value.** No measured skip baseline exists.

### P6 — Correct the comments · → **A10**
Fix `ticker-batch-writer.ts:154`. Make `ohlc-batch-writer.ts:66-67` unambiguous: *replayable means the futures legs; both spot classes are WebSocket-only.*

### P7 — Correct the alert body · → **A11**
Assert only what one failed flush supports: rows dropped in **this** flush, discarded before retry so the next flush can succeed, re-raised after re-arm if the fault persists.

### P8 — Tests · → **A9**
`server/tests/unit/b-ohlc-frame-guard.test.ts`:
- **Validator:** one case for **every** accept and reject row in A2.
- ⭐ **Mutation-proof, by hand (no framework, A9):** each rejection clause has a test that isolates it. **Verified by deleting each clause in turn and observing a failure — recorded in the change list.**
- **Wiring:** `vi.mock` of `bufferOhlcBar` asserts exactly the good frames are buffered, unchanged, via `…ForTests` exports.
- **Crypto O3:** a skipped frame is **not** counted as stored.
- **Futures:** two instances, **no counter cross-talk.**
- **C2:** the throttle reports its suppressed count; the counter is unaffected by it.
- **C1:** the escalation latch raises once and re-arms.

### P9 — Governance at Step 10 · → **A12, A13, C3**
**Required:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY`. **Judged yes:** `SYSTEM_IMPACT_MAP` §B74 (signal-input role, the guard, the stale line refs) · `SYSTEM_MANUAL` · `CHANGES_AND_FIXES` · `RUNNING_ISSUES` (`#1028`; R1 → `#705`; R3 → `#950`) · `PHASE_19_PLAN` (`3b.h-6`).

---

## 3. ⛔ JUDGEMENT CALLS — ATTACK THESE
1. **Category for P5:** `health_check` (its stated scope is *"archival-cron-silence / freshness system health"*) or `breakage` (what the existing write-failure alert uses)? **I lean `health_check`** — a degrading feed, not an outage.
2. **P5's threshold:** a constant beside `ALERT_RE_ARM_MS` (the local precedent for alerting parameters), or `module_constants` per asset class (rule 15)? **I lean constant** — it tunes an alert, not trading behaviour. **Rule 15 is flagged, not waived.**
3. **Crypto's boolean return (P2)** rather than moving its counters into `parseOhlcBar`: the parser holds no shard reference, so moving them would restructure per-shard counting. **The boolean is the smaller change.**
4. **`String(original)`** for valid values (P1): byte-identity over normalisation.

## 4. RESIDUALS — each with a disposition
| # | item | disposition |
|---|---|---|
| A3 | overlapping futures polls can buffer a candle twice | **(5) no work** — absorbed by the writer's de-duplication and upsert |
| A8 | the headroom gauge runs at boot only | **(5) no work in this batch** — forward coverage is the partition creators' job |
| R1 | the writer drops a whole chunk for any rejected row | on `#705`, as scoped |

## 5–7. *(reserved)*

## 8. REVIEWER RECORD
⏳ **Pending.** Mandatory before dispatch: Mode B on A7's two absence claims and on P1/P2's mechanism claims; the final round reads the object.

---

## PLAIN-LANGUAGE SUMMARY
**What the audit found:** there's exactly one way into each of the three bar producers, so a single check covers everything. The database will happily store "not a number", which would quietly corrupt signal bars — so the check has to be stricter than the database. And one producer, crypto, counts bars in a spot where the new check would make it overcount.

**What the plan does:** one shared check stops malformed bars before they're saved. Every rejected bar gets counted and shown on the dashboard, and a sustained run of rejections for one symbol raises a real alert, so a quiet failure can't hide. Two misleading comments and one misleading alert message get corrected. Two numbers — how often to log, and when to alert — have no data to set them from yet, and they're marked that way rather than guessed.
