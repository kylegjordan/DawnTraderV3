# B-OHLC-FRAME-GUARD — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (`#1028`) · r2

> **Owner:** CC-C · **Plan row:** `PHASE_19_PLAN` `3b.h-6` · **Scope:** `B_OHLC_FRAME_GUARD_SCOPE.md` — Step 1 ✅ APPROVED at r2 (conditions in its §14); **r3 amends it: two defects folded in as OBJ-7 (`#1029`) and OBJ-8 (`#1030`), and §14 O3 corrected.**
> **ONE document, ONE sign-off. THE AUDIT COMES FIRST; THE PLAN FALLS OUT OF IT.** Every plan item back-references the audit finding it comes from. Anything with no audit treatment is flagged **`UNAUDITED`** in place.
> **Code citations read at `origin/migration/aws-supabase` `13bb7e817`; the r2 commit changes no code.** Reviewer record: §8.

---

## 0. ⛔ PREVIOUSLY STATED → NOW — every number and claim that moved since the scope was first written

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| **1** | validator = each price field parses to a **finite** number (scope r1) | **admit iff STORABLE and AGGREGATABLE**, across all eight fields; **`±Infinity` rejected regardless of today's sink** | the database ACCEPTS `NaN` (verified, PG 17.6); Langston repaired his contract |
| **2** | partition range: an open design question (scope r2 §11) | **OUT of the guard** — `Invalid Date` only | Langston ruling, option (c) |
| **3** | crypto has "no counter to sit beside" (ruled, adopted in scope r2) | crypto **counts at the caller** (`crypto-spot-archiver.ts:158-159`) | re-derived at the ref |
| **4** | `b48a743f` "deliberately not acked, or it swallows the next failure" | **resolved** — ACTIVE swallowed the next failure just the same | `system-alerts.ts:503-508` suppresses on any non-resolved state |
| **5** | OBJ-4: `ticker-batch-writer.ts:154` **and** the `ohlc-batch-writer.ts` rationale are false | **only `:154` is false**; `ohlc-batch-writer.ts:66-68` is correctly scoped | read at the object |
| **6** | "six B74 archive tables" (Langston ruling) | **eight** | `server/startup/passive-archive-bootstrap.ts:42` `ARCHIVE_TABLES` |
| **7** | a counted-but-skipped crypto bar would **inflate** the panel's store ratio (scope §14 O3, r1 A4) | it would **DEFLATE** it — the counter is the ratio's **denominator**: `ohlcStoreFraction = min(1, ohlcCount / cumulativeOhlcRows)` (`drift-dashboard-aggregator.ts:943-944`), labelled *"scanned (since PID)"* on the panel (`client/src/pages/analytics.tsx:1955`) | read the consumer, not the producer's field name |
| **8** | O3: crypto's caller bumps "the stored counter", which must follow the return value | it bumps **two**. **`rowsPersistedLastMinute` (`:158`) must follow the return value. `cumulativeOhlcRows` (`:159`) must NOT** — it is the panel's *scanned*, and the commit that created it says it counts *"every WS message received"* (`b8eba807e`). ⇒ **J8, which disagrees with part of O3 and of Langston's point 1** | provenance read of the counters, §A4 |
| **9** | the miscount appears once the guard adds a skip | **live today, in both directions:** crypto counts bars its parser discards as *persisted*; xStock and futures leave items their parsers discard out of *scanned* ⇒ **`#1029`** | Langston (the crypto half, re-derived); census of all three producers × both channels (the rest) |
| **10** | "no existing helper escalates on a sustained rate" (r1 A7) | **no general helper; in-file patterns exist** — nearest `rtb-metrics-service.ts:355-380` (consecutive count → one alert → reset on success) and `regime-inputs.ts:206-268` (windowed count → alert with cooldown) | independent reader's hit, re-derived at the ref |
| **11** | "exactly one call path per producer" | **per producer of venue frames.** One non-venue write route exists: the hand-run seed script `server/scripts/perpfeed-gate-test.ts:76-80` | independent reader's hit, re-derived |
| **12** | futures "counts after buffering, so a skip is skipped naturally" | true of `cumulativeOhlcRows` (`kraken-futures-archiver.ts:100`) — but a `null` candle throws at `candle.time` (`:85`) into the catch at `:105-107`, which returns 0, so candles already buffered drop out of the per-minute count at `:119` | independent reader's hit, re-derived |
| **13** | futures is the one leg whose OHLC is REST-replayable (scope §7, `#1028`, `#705` amendment) | **only across a restart.** The poller never re-reads a minute it has seen and the venue returns the minute in progress ⇒ a stored futures bar is the minute as it stood when first polled. **Measured: stored volume short of the venue's final bar in 2–24 of 116 minutes on three crypto perps, 1 of 116 on three xStock perps ⇒ `#1030`** | new measurement with a control, §A15 |
| **14** | P5 alert category: lean `health_check` | lean **`breakage`** | the protocol's action for `breakage` is *reproduce → fix* (`ALERT_HANDLING_PROTOCOL.md:57`); consecutive-failure precedent `rtb-metrics-service.ts:367` — §3 J1 |

---

# PART I — THE AUDIT

## 1. THE SIX SOURCES — which were read

| # | source | read? | for what |
|---|---|---|---|
| 1 | **The code**, at `origin/migration/aws-supabase` | ✅ | all three producers, the writer, the alert service, the aggregator, the panel, the `#594` fence tests, two alert precedents |
| 2 | **Runtime + database + venue** | ✅ | `error.log`/`out.log`; the sink on PG 17.6; partition catalog; `NaN` scan; **the futures charts endpoint (read-only GET) against `crypto_perp_ohlc_1m` / `xstock_perp_ohlc_1m` (§A15)** |
| 3 | **`SYSTEM_IMPACT_MAP`** | ✅ | §B74 — stale on the load-bearing point (A13) |
| 4 | **`SYSTEM_MANUAL`** | ✅ (grep) | silent on the 1-minute table's role as a signal input — a governance gap, OBJ-6 |
| 5 | **Batch reports + ledger** | ✅ | `#594` (`RUNNING_ISSUES:20`), `#635`, `#704`, `#705` + amendment, `#950`, `#1028`; `F-G-1` pre-audit R12; `BUG-2026-04-30-G`; `BATCH_74_SCOPE`; `ALERT_HANDLING_PROTOCOL` |
| 6 | **`bridge/canonical/`** | ⛔ not applicable | B74 (2026-05-01) post-dates the 2026-01/02 governance change; provenance is the introducing commits, quoted |

---

## 2. AUDIT FINDINGS

### A1 — The mechanism *(unchanged; scope §2)*
`equity-spot-archiver.ts:92-95` and `crypto-spot-archiver.ts:112-115` build `open`/`high`/`low`/`close` with `String(data.X)` and no guard. The only entry check (`:85` / `:106`) tests that `symbol` and `interval_begin` are **truthy**. `volume`/`vwap`/`tradeCount` are guarded against **absence only**.

### A2 — The sink's accept / reject set *(unchanged; verified read-only on PG 17.6; scope §8)*
| column | REJECTS — drops the whole chunk | ACCEPTS, and a reader cannot aggregate |
|---|---|---|
| `open/high/low/close` `numeric(20,8)` NOT NULL | absent · `""` · `"undefined"` · `"null"` · `±Infinity` · `\|v\| ≥ 10^12` | **`NaN`** |
| `volume` `numeric(28,8)` NOT NULL | absent · `±Infinity` · `\|v\| ≥ 10^20` | **`NaN`** |
| `vwap` `numeric(20,8)` nullable | `±Infinity` · `\|v\| ≥ 10^12` | **`NaN`** |
| `trade_count` `integer` nullable | `NaN` · fractions · outside `int4` | — |
| `interval_begin` `timestamptz` NOT NULL, RANGE-partitioned | `Invalid Date` · no covering partition | — |

`max(1, NaN, 5)` returns **`NaN`**. **Zero `NaN` stored today**, positive control first: 0 in 199,965 xStock and 157,884 crypto one-minute rows (24h); 0 in all 1,695,013 rows of `xstock_spot_ohlc_15m_snapshot`.

### A3 — ⛔ ENTRY POINTS, ENUMERATED FIRST, REPO-WIDE *(§9.5(a-ii))*
| producer | the ONE call path into its buffering function | scheduler |
|---|---|---|
| xStock spot | `handleMessage` → `for (const bar of msg.data) parseOhlcBar(bar)` (`equity-spot-archiver.ts:270`) | WebSocket event |
| crypto spot | `handleMessage` (`crypto-spot-archiver.ts:155`) → `parseOhlcBar(bar)` (`:157`) | WebSocket event |
| futures | `pollAllOhlc` → `pollOhlcOnce(sym)` (`kraken-futures-archiver.ts:114`) → per-candle `bufferOhlcBar` (`:86`). **One class, two instances** (scope §7); the `crypto_perp` leg defaults OFF (`server/startup/passive-archive-bootstrap.ts:189`) and is running on staging (A15's rows) | `setInterval` (`:213-215`) **and** an immediate poll (`:216`) |

✅ **Exactly one call path per producer of venue frames.**
⚠️ **One non-venue write route, and it is out of the guard's population:** `server/scripts/perpfeed-gate-test.ts:73-80`, run by hand with `--seed`, creates a synthetic `2025-01-15` partition and inserts two literal rows (`1, 1, 1, 1, 0`) into `xstock_perp_ohlc_1m`. Not a venue frame. §4.
⚠️ **Test-only export** `_handleMessageForTests` (`equity-spot-archiver.ts:480`) — no non-test importer.
⚠️ **The poll scheduler has no in-flight guard**, so a cycle can overlap the initial poll or the next interval. Absorbed downstream: in-buffer de-duplication (`ohlc-batch-writer.ts:251-258`) and upsert (`:297-301`). Pre-existing; §4.

### A4 — ⛔ THE COUNTERS: WHAT EACH WAS BUILT TO COUNT, AND WHAT EACH PRODUCER ACTUALLY COUNTS *(§9.5(a-ii) state-write census + provenance)*

**Intent, quoted:**
- **`cumulativeOhlcRows` / `cumulativeTickerSnaps`** were added to both spot archivers **by one commit**, `b8eba807e` (2026-05-01, *"B74.1: Equity perp OHLC REST polling + xStocks expansion + Passive Archive monitor panel"*): *"cumulativeOhlcRows + cumulativeTickerSnaps counters increment on every WS message received OR REST candle parsed"*. The panel labels them **"scanned (since PID)"** (`client/src/pages/analytics.tsx:1955`, `:1958`); the interface groups them under *"Scanned (in-process counters; reset on PM2 restart)"* and calls the ratio a *"Drift indicator: scanned-but-not-stored fraction"* (`drift-dashboard-aggregator.ts:683`, `:688`).
- **`rowsPersistedLastMinute`** is the 60 s health line's `rows_persisted_60s` (`BATCH_74_SCOPE.md:109`).

**Actual placement — all three producers × both channels:**
| producer · channel | parser's early return | *scanned* bump | vs intent | *persisted* (per-minute) bump | vs intent |
|---|---|---|---|---|---|
| crypto spot · OHLC | `:106` | caller, every item (`crypto-spot-archiver.ts:159`) | ✅ | caller, every item (`:158`) | ⛔ **counts bars discarded at `:106`** |
| crypto spot · ticker | `:123` | caller, every item (`:164`) | ✅ | — | — |
| xStock spot · OHLC | `:85` | after guard **and** buffer (`equity-spot-archiver.ts:101`) | ⛔ **misses bars discarded at `:85`** | after buffer (`:100`) | ✅ |
| xStock spot · ticker | `:144` | after guard **and** buffer (`:205`) | ⛔ **misses snaps discarded at `:144`** | — | — |
| futures · OHLC | none today | per new candle, after buffer (`kraken-futures-archiver.ts:100`) | ✅ today — nothing is discarded; ⛔ **once the guard rejects** | return value (`:104` → `:119`) | ✅ except §0 row 12 |
| futures · ticker | `:126` | after guard **and** buffer (`:148`) | ⛔ **misses snaps discarded at `:126`** | — | — |

⚠️ *Langston cited crypto's ticker as `:122`/`:163`: those are the function's first line and the call; the return is `:123`, the bump `:164`.*
★ **The inconsistency is original:** `b8eba807e`'s own diff puts crypto's bumps in `handleMessage` after each call and xStock's inside `parseOhlcBar`/`parseTickerSnap` after the buffer — **same commit, two placements, and only crypto's matches its message.**

**Readers, and the direction each errs:**
- ***persisted* → the health line** (`crypto-spot-archiver.ts:224`, `equity-spot-archiver.ts:351`, `kraken-futures-archiver.ts:226`). Crypto's count **reads healthier than the feed.** `#594` already ruled this counter must not carry a stall threshold (`RUNNING_ISSUES:20`), and `BUG-2026-04-30-G` records it reading non-zero while zero rows landed (`CHANGES_AND_FIXES.md:1631`).
- ***scanned* → the store ratio's denominator** (`drift-dashboard-aggregator.ts:943-947`, rendered `:974-975` → `analytics.tsx:1971-1972`). A producer that leaves discarded items out **overstates** its ratio and cannot show the drops; one that counts them lowers the ratio, **which is what a drift indicator is for.**

⚠️ **Magnitude: not measurable before the fix.** No instrument counts a discarded item, and the ratio cannot isolate one — its denominator counts frames, its numerator de-duplicated rows (`ohlc-batch-writer.ts:242-258`), so it sits below 1 by construction. **Declined as a pre-deploy baseline** (Langston offered one): it could not come out differently whether the miscount is zero or large. ⇒ **the guard's skip counter is the first instrument that sees these bars.**
⚠️ **And *persisted* counts BUFFERED bars, not persisted rows** — `bufferOhlcBar` is an in-memory push (`ohlc-batch-writer.ts:232-234`); rows persist later, in `flushAssetClass`. §4 R5.
⇒ **`#1029`. Plan: P2, P3 — and J8, which is where this disagrees with the approved O3.**

### A5 — The dashboard chain *(citations corrected)*
`PassiveArchiveUniverseStats` (`drift-dashboard-aggregator.ts:673-696`) is **explicitly typed** — an undeclared field is dropped. Universe list `:864-869`; each row built field by field in `universes.push({…})` at `:968-982`. Client mirror type `analytics.tsx:1854-1857`; `PassiveArchiveSection` `:1874`; cells `:1971-1972`. ⚠️ *Scope OBJ-3 cited `:862-867` as the mapping — that is the universe list; corrected in scope r3.* **Adding a counter touches: getter → interface → `universes.push` → client type → header + cell.**

### A6 — The alert mechanism to reuse *(for C1; precedents added)*
- **Raise mechanics:** `alertPermanentWriteFailure` (`ohlc-batch-writer.ts:139-175`) — latch **claimed synchronously before the first `await`** (`:150`), JSONL `addAlert` (`:161-162`) — not the Postgres `system_alerts` table — with a `dedupe_key`, latch **released if the raise fails**.
- ⭐ **Consecutive-count precedent:** `rtb-metrics-service.ts:355-380` — `++` per failure, **one** alert at threshold **10** (`:357`), latch flag set synchronously (`:362`), counter **and** latch reset on success (`:378-380`), `category: 'breakage'`, `severity: 'warning'` (`:367-368`), `dedupe_key`.
- **Windowed-count precedent:** `regime-inputs.ts:206-268` — 5-minute ring, threshold 20, 30-minute cooldown, `health_check`/`warning`, `dedupe_key`.
- **Categories:** closed set `system-alerts.ts:69-77`; `health_check`'s own comment — *"disk / archival-cron-silence / freshness system health"* (`:76`). **Handling:** `breakage` → *"Reproduce → fix or escalate the broken path"*; `health_check` → *"Confirm healthy (resolve) or escalate if degraded"* (`ALERT_HANDLING_PROTOCOL.md:57-58`).
- Dedupe `system-alerts.ts:503-508` suppresses on **any non-resolved** same-key alert.

### A7 — ⛔ ABSENCE CLAIMS *(rewritten)*
- **No GENERAL sustained-rate alert helper exists; in-file patterns do (A6).** ⚠️ **My r1 search was too narrow** (`sustained|consecutive…alert|rate…threshold|perMinute|windowCount`) and missed them; an independent reader's wider search found them and each was re-derived at the ref. ⇒ **P5 copies `rtb-metrics-service.ts:355-380`'s shape rather than inventing one.**
- **No logger prints how many lines it suppressed.** My own search at the ref, tests excluded, for `suppressed` and `+${n} more|further|suppressed`: nearest are `symbol-normalize.ts:134` (*"further unknown-form warnings suppressed"* — no number), `friction-divergence-evaluator.ts:181-183` and `feed-integrity-auto-check.ts:182` (suppression logged, no count). ⇒ P4 needs a small helper. **Reach:** a logger that prints a count without the word *suppressed* would not match.

### A8 — Partitions *(option (c); citations corrected)*
`checkPartitionHeadroom` (`server/startup/passive-archive-bootstrap.ts:65`) self-heals **today's** partition at boot only. Failing-open history: `BUG-2026-04-30-G` (`CHANGES_AND_FIXES:1627`) and `P19-B-PERPFEED` BLOCKER-2. ✅ **Measured, clean:** all 8 archive parents cover now and tomorrow, **0** `DEFAULT` partitions.

### A9 — Tests
Vitest; `vi.mock('../../db.js', …)`. **`…ForTests` export convention** (`equity-spot-archiver.ts:259`, `:467`, `:480-481`). ⭐ **The `#594` stamp-site fence** (`server/tests/unit/p19-b4a-c3-gate-watchdog.test.ts:294-355`) drives real frames through `_handleMessageForTests` and asserts which clock moves: a well-formed OHLC case (`:331-339`), a malformed **ticker** case (`:341-347`), **no malformed-OHLC case.** `KrakenFuturesArchiver` is an exported class (`kraken-futures-archiver.ts:49`) with a private `pollOhlcOnce`. **`crypto-spot-archiver.ts` exports no test hook** (exports at `:52`, `:230`, `:260` only). No mutation-testing framework.

### A10 — Comments *(OBJ-4)*
`ticker-batch-writer.ts:154` — *"OHLC bars are REST-replayable"* — false for both spot classes, and (A15) true of futures only across a restart. `ohlc-batch-writer.ts:66-68` is correctly scoped.

### A11 — The alert body *(OBJ-5)*
`ohlc-batch-writer.ts:167` — *"every further flush for this class will fail the same way until it is fixed"* — **refuted:** 3,632 and 3,297 bars landed in the next two hours.

### A12 — Provenance *(scope §4)*
B74, `ce4a7e408`: *"NO consumers in v1 — pure passive accumulation."* The table is now a signal input. **Rule 24 outcome (2).**

### A13 — Documentation gap *(OBJ-6)*
`SYSTEM_IMPACT_MAP` §B74: *"NO signal-pipeline integration"* — stale; writer line refs stale. `SYSTEM_MANUAL` silent on the 1-minute table feeding 15-minute signal bars.

### A14 — ⭐ NEW — THE xSTOCK DATA-LIVENESS STAMP SITS AFTER THE GUARD, BY RULE
`equity-spot-archiver.ts:86` stamps `lastDataMsgAt` right after the `:85` guard — *"same rule as parseTickerSnap"* — whose comment states the rule: *"AFTER the malformed-payload guard (a junk snap must not count as proof of life)"* (`:145-146`). `#594`'s resolution: stamped *"each AFTER its malformed-payload guard"* (`RUNNING_ISSUES:20`). The stall watchdog thresholds that clock (`:428`).
⇒ **the validator REPLACES the `:85` guard and runs BEFORE the `:86` stamp** — a rejected bar moves the connection clock only, as the malformed-ticker fence asserts for snaps (`p19-b4a-c3-gate-watchdog.test.ts:341-347`).
**Consequence, bounded:** a bar carrying `NaN` no longer stamps the data clock. The ticker channel stamps the same clock on every snap (`:153`), universe-wide, at ~900K–996K per hour (`equity-spot-archiver.ts:421-423`) — so this alone cannot starve the watchdog unless both channels stop together, which is the stall it exists to catch. §3 J5.

### A15 — ⭐ NEW — THE FUTURES POLLER STORES EACH MINUTE AS IT STOOD WHEN FIRST POLLED
**Mechanism, cited:** `pollOhlcOnce` skips any candle at or before a per-symbol high-water mark — `if (candle.time <= lastSeen) continue` (`kraken-futures-archiver.ts:85`) — and advances the mark to the newest candle it buffered (`:101`, `:103`). **The venue returns the minute still in progress:** `GET https://futures.kraken.com/api/charts/v1/trade/PF_XBTUSD/1m` at `07:44:55Z` returned `07:44:00` as the newest of 2,000 candles. ⇒ the minute is buffered part-way through and skipped on every later poll.

**Measured, with a positive control** — `scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py`, staging, 2026-09-11 `05:47`→`07:44Z` (116 minutes, all after the process start `2026-09-09T08:46:40Z`, so no boot re-fetch touched them): stored row vs the venue's final candle for the same minute.

| table | symbol | minutes joined | ✅ control: `open` matches | stored `volume` short of venue | stored `high` short | stored `low` above |
|---|---|---|---|---|---|---|
| `crypto_perp_ohlc_1m` | `PF_TRXUSD` | 116 | 116 | **14** | 7 | 5 |
| | `PF_ONDOUSD` | 116 | 116 | **24** | 13 | 10 |
| | `PF_FLOKIUSD` | 116 | 116 | **2** | 1 | 1 |
| `xstock_perp_ohlc_1m` | `PF_HOODXUSD` | 116 | 116 | **1** | 1 | 0 |
| | `PF_TSLAXUSD` | 116 | 116 | **1** | 1 | 0 |
| | `PF_SPYXUSD` | 116 | 116 | **1** | 1 | 0 |

**Every volume mismatch is in the partial direction** (volume matches + shortfalls = 116 on all six), and `open` — fixed by a minute's first trade — matches everywhere ⇒ **a truncated minute, not a mis-join.**
⚠️ **Population:** three symbols per table chosen by row count, **all tied at 116 — not the most active.** The rate is a property of these six over these 116 minutes, not of the tables.
**Self-heal, by mechanism:** the mark is in memory (`:56`); a restart empties it, the first poll re-buffers the whole window (`lastSeen ?? 0`, `:81`), and the upsert rewrites every column (`ohlc-batch-writer.ts:297-301`, comment `:285-287`). ⇒ **corrected at the next restart if still inside the 2,000-candle window; partial for good otherwise.**
**Provenance, quoted:** `b8eba807e` (2026-05-01, B74.1) — *"Per-symbol last-seen interval_begin dedup map; only inserts new bars."* **At that commit the writer INSERTED** (`await db.insert(table as any).values(rows as any)`, `ohlc-batch-writer.ts:105`, unchanged by that commit), so re-reading a minute would have written a duplicate row — **the dedupe was right.** **`4c473ff33` (2026-05-19, `B-NEW-35`) made the writer UPSERT on `(symbol, interval_begin)`**, removing the dedupe's reason and leaving its side effect. ⇒ **rule 24 outcome (3): legacy that no longer fits.**
**Prior records, searched first (§9.5(b-ii)):** `F-G-1` pre-audit R12 (`B_GRID_REPRESENTABILITY_PRE_AUDIT.md:109`) — the same mark leaves **failed-flush** bars never re-polled; `RUNNING_ISSUES:5338` — a restart clears it. **Neither records the in-progress minute.** ⇒ new: **`#1030`**.
**Consumers:** no signal path reads either perp OHLC table — readers are retention (`b75-retention-sweep.ts:86`, `:88`), partitioning, `perpfeed-daily-probe.ts:63` and the dashboard counts (`drift-dashboard-aggregator.ts:866`, `:868`). ⇒ **capture-archive data quality; no trading impact.**

### A16 — ⭐ NEW — ABSENCE DEFAULTS ON THE VALUE PATH
All three producers default an absent volume to zero before buffering — `String(data.volume ?? '0')` (`equity-spot-archiver.ts:96`, `crypto-spot-archiver.ts:116`) and `candle.volume ?? '0'` (`kraken-futures-archiver.ts:95`). `vwap` and `trades` map absent to `null` (nullable columns). A defaulted zero is **storable and aggregatable**, so the invariant admits it — and it is indistinguishable from a real zero-volume minute, which also makes its reach unmeasurable from stored rows. §3 J6.

---

# PART II — THE PLAN (every item → its findings)

### P1 — The validator · → **A1, A2, A7, A16**
New module `server/services/passive-archive/ohlc-frame-validator.ts`, exporting `validateOhlcFrame(input)` → `{ ok: true, row } | { ok: false, field, reason }`.
**`input` is the raw values as each producer sources them, AFTER its existing absence defaults** (J6): `symbol · intervalBegin · open · high · low · close · volume · vwap · trades`.
Per field, in order: **(0) `symbol`** — a non-empty string; **this absorbs the existing key check, so today's silent early return becomes a counted skip (A4)** · **(1) type-gate** — a `number`, or a non-empty trimmed `string`; everything else rejected, so `""`, `null`, `" "`, `[]`, `false` never coerce to `0` · **(2) parse** · **(3) `Number.isFinite`** — rejects `NaN`, `±Infinity` · **(4) column bound** — prices `|v| < 10^12`, volume `|v| < 10^20` · **(5) `trades`** — `null` passes, else `Number.isInteger` inside `int4` · **(6) `intervalBegin`** — parses to a finite time.
**Zero and negatives are admitted.** ⭐ **Valid values stay byte-identical:** `String(original)`, never `String(Number(v))`.
**Reasons are a closed set** — `absent · not_number_or_string · empty · not_finite · out_of_range · not_integer · invalid_time` — shared by the log line and the tests.

### P2 — Wire it into all three producers · → **A3, A4, A14, A15**
- **xStock spot:** the *scanned* bump (`:101`) moves **above** the validator; the validator **replaces** the `:85` guard and runs **before** the `:86` data-clock stamp (A14); on reject → skip counter, throttled log, streak, return; on accept → stamp, buffer, *persisted* (`:100`, unchanged), streak reset. Ticker: *scanned* (`:205`) moves above the `:144` guard — nothing else in `parseTickerSnap` changes.
- **crypto spot:** ⛔ **`parseOhlcBar` returns `boolean`.** The caller keeps *scanned* (`:159`) unconditional, moves *persisted* (`:158`) behind `true`, and bumps the skip counter on `false`. **Ticker unchanged** — its caller bump (`:164`) already counts every snap received.
- **futures:** the loop's first read is `candle?.time`; a candle with a finite time strictly older than the mark is skipped uncounted (P10). Every other candle is **evaluated**: *scanned* `++`, validate, reject → skip counter (the mark still advances past it if its time is finite) · accept → buffer, `newCount++`. **A `null` candle is rejected instead of throwing into `:105-107`** (§0 row 12). Ticker: *scanned* (`:148`) moves above the `:126` guard.
⇒ **For OHLC, in every producer: *scanned* = *persisted-eligible* + *skipped*.** *(J8.)*

### P3 — The counters, end to end · → **A4, A5, C2**
**Skip counter:** xStock `state.ohlcFramesSkipped`; crypto per-shard `shard.ohlcFramesSkipped`, summed in `getCryptoSpotStats` (`:60-67`); ⛔ **futures an INSTANCE field** (two instances). Carried: getter return types → `PassiveArchiveUniverseStats` (`:673-696`, `ohlcFramesSkipped: number`) → `universes.push` (`:968-982`) → client type (`analytics.tsx:1854-1857`) → a header and a cell in `PassiveArchiveSection`.
⛔ **C2: the counter is NEVER rate-limited.**
**One comment at each declaration of each counter, saying what it counts:** *scanned* = every item the parser receives (the panel's *"scanned (since PID)"*); *persisted* = bars **buffered**, not rows persisted (R5).

### P4 — The throttled skip log · → **A7, C2**
At most **one** `console.warn` line per `(producer, assetClass)` per **60 s**, naming **symbol, field and reason**, ending **`(+K suppressed since last line)`**. A small helper in the validator module.
**Value chosen, not measured:** 60 s, the cadence of the existing health line (`crypto-spot-archiver.ts:224`, `equity-spot-archiver.ts:351`, `kraken-futures-archiver.ts:226`), so the log and the health line share a clock.

### P5 — The sustained-skip escalation · → **A6, A7, C1**
**Shape from `rtb-metrics-service.ts:355-380`; raise mechanics from `alertPermanentWriteFailure`:**
- Per `(assetClass, symbol)`: count **consecutive DISTINCT bars rejected** — a bar is `(symbol, intervalBegin)` — with no accepted bar for that symbol in between. **Bars, not frames:** the WS legs re-send the same minute on every trade and futures re-evaluates the newest minute (P10), so counting frames would let one bad minute alert.
- An accepted bar resets that symbol's streak and deletes its entry (map bounded by the universe).
- At **10**: one alert per class — latch claimed synchronously, JSONL `addAlert`, `dedupe_key` **`ohlc-frame-skip-sustained-<assetClass>`**, `severity: 'warning'`, category per J1, latch released if the raise fails, re-armed after `ALERT_RE_ARM_MS` like its sibling. Body names the symbols over threshold with their last field and reason.
- A bar whose `intervalBegin` is itself invalid has no identity and counts as distinct each time. ⚠️ **Bounded, stated:** futures re-reads such a candle every poll while it stays in the 2,000-candle window, so one persistent bad-time candle on a symbol with no good candle in between alerts after 10 polls. A malformed timestamp that persists for ten minutes is itself worth an alert.
- ⚠️ **`UNAUDITED` — the value 10.** Anchored on the precedent (`rtb-metrics-service.ts:357`) and today's baseline — 0 `NaN` in 357,849 one-minute rows over 24h (A2) and one permanent-write alert since that alerting began on 2026-08-28 (scope §3) — under which ten consecutive bad bars on one symbol does not occur in normal operation. **No skip rate can be measured until the guard exists.**

### P6 — Correct the comments · → **A10**
Fix `ticker-batch-writer.ts:154`: replayable means the futures legs, and only across a restart (`#1030`); both spot classes are WebSocket-only. Keep `ohlc-batch-writer.ts:66-68` and make *"that leg"* explicit.

### P7 — Correct the alert body · → **A11**
Assert only what one failed flush supports: rows dropped in **this** flush, discarded before retry so the next flush can succeed, re-raised after re-arm if the fault persists.

### P8 — Tests · → **A9, A14, A15, A4**
`server/tests/unit/b-ohlc-frame-guard.test.ts`, plus **one case in the existing `#594` fence**:
- **Validator:** every A2 row; `symbol` absent; absent volume after the `'0'` default is accepted.
- ⭐ **Mutation-proof, by hand:** each rejection clause isolated by a test; **verified by deleting each clause in turn and observing a failure** — recorded in the change list.
- ⭐ **`#594` fence** (`p19-b4a-c3-gate-watchdog.test.ts`, describe at `:294`): *"a validator-rejected OHLC frame advances the CONNECTION clock but NOT the DATA clock"* — the twin of `:341-347`.
- ⭐ **Counters, per producer (`#1029`):** a rejected bar → *scanned* +1, *skipped* +1, *persisted* 0; an accepted bar → *scanned* +1, *persisted* +1; a symbol-less ticker snap → *scanned* +1. Crypto needs a `handleMessage`/shard-stats `…ForTests` export (A9).
- ⭐ **Futures:** a `null` candle among good ones — no throw, good candles counted in both counters (mocked `fetch`); **`#1030`:** the minute last seen as newest is buffered again on the next poll with its later values, and a minute older than it is not; two instances, no cross-talk.
- **C2:** the throttle reports its suppressed count; the counter is unaffected.
- **C1:** the streak counts distinct bars; a re-sent bad minute does not advance it; reset on accept; latch raises once and re-arms.

### P9 — Governance at Step 10 · → **A12, A13, A15, C3**
**Required:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY`. **Judged yes:** `SYSTEM_IMPACT_MAP` §B74 (signal-input role, the guard, the counters' meanings, **the futures poller re-reading its newest minute**, stale line refs) · `SYSTEM_MANUAL` · `CHANGES_AND_FIXES` · `RUNNING_ISSUES` (`#1028`, **`#1029`**, **`#1030`**; R1 → `#705`; R3 → `#950`) · `PHASE_19_PLAN` (`3b.h-6`).

### P10 — ⭐ NEW — Futures re-reads the newest minute it has seen · → **A15, `#1030`**
`kraken-futures-archiver.ts:85`: skip only candles **strictly older** than the mark (`<`, not `<=`). The minute that was newest last poll is evaluated once more; by the poll in which a later minute appears it is final, and the upsert overwrites the partial row (`ohlc-batch-writer.ts:297-301`).
**What changes on the panel, stated so Step 7 does not read it as a regression:** each futures minute is now buffered about twice, so the perp legs' *scanned* and `rows_persisted_60s` roughly **double** and their store ratio roughly **halves**. Both counters count buffered bars (P3), and the WS legs already count every re-sent update.
**Verification (scope OBJ-8):** re-run the check script on staging over a window wholly after the deploy — **zero** stored volume shortfalls on minutes at least 3 minutes old, with `open` still matching as the control.
⚠️ **`UNAUDITED` — how long one poll cycle takes.** If a cycle runs past 60 s, a minute can need more than 3 minutes to be read final; the check would then show shortfalls on older minutes. §4 R8.

---

## 3. ⛔ JUDGEMENT CALLS — ATTACK THESE
1. **P5 category — `breakage`** *(was `health_check`)*. For: the protocol's `breakage` action is *reproduce → fix* (`ALERT_HANDLING_PROTOCOL.md:57`), which is what a skip streak needs; the consecutive-failure precedent uses it (`rtb-metrics-service.ts:367`). Against: `health_check`'s comment names *archival-cron-silence* (`system-alerts.ts:76`), and the windowed precedent uses it. ⚠️ `breakage`'s default owner is CC-B (`:57`); Langston's domain read routes it.
2. **P5 threshold as a constant**, value 10 `UNAUDITED`. Rule 15 is flagged, not waived: it tunes an alert, not trading behaviour.
3. **Crypto's boolean return** rather than moving its counters into `parseOhlcBar` — the parser holds no shard reference.
4. **`String(original)`** for valid values — byte-identity over normalisation.
5. ⭐ **A14 — the validator before the data-clock stamp.** By `#594`'s own rule and fence. Attack it if a venue-sent bar with a bad value should still count as proof of life.
6. ⭐ **A16 — keep `volume ?? '0'`.** The validator sees the defaulted value, so no bar that stores and aggregates today is newly dropped. Rejecting absent volume would be more honest about missing data, but changes stored-data semantics outside this batch's invariant and could drop futures candles if the endpoint ever omits volume (the live sample carries it on all 2,000). Recorded as R6 in scope r3.
7. ⭐ **`#1030` folded, not its own batch.** For: the same loop, the same dedupe the skip count must be defined against, and the instrument already exists. Against: capture-only tables, no trading impact, and it widens a frame-guard batch into a completeness fix. **I fold.**
8. ⭐⭐ **THE COUNTERS SPLIT BY WHAT EACH WAS BUILT TO COUNT — AND THIS DISAGREES WITH PART OF O3 AND OF LANGSTON'S POINT 1.** He asked that **both** crypto bumps key off the return value. **For *persisted* (`:158`) I agree** — its name and `BATCH_74_SCOPE.md:109` say persisted. **For *scanned* (`:159`) I do not:** `b8eba807e` built it to count *"every WS message received"*, the panel calls it *"scanned (since PID)"*, and the interface calls the ratio a *"Drift indicator: scanned-but-not-stored fraction"*. Keying it off the return value would make that indicator blind to exactly the bars the guard drops. **Crypto's placement is the correct one; xStock's and futures' ticker placements are the ones that move.** ⇒ **Attack it if *scanned* should now mean *buffered*** — the skip column would then carry what the ratio loses.

## 4. RESIDUALS — each with a disposition
| # | item | disposition |
|---|---|---|
| A3 | overlapping futures polls — the interval can also overlap itself (no in-flight guard, `kraken-futures-archiver.ts:213-216`) | **(5) no work** — absorbed by in-buffer de-duplication (`ohlc-batch-writer.ts:251-258`) and upsert |
| A3 | `perpfeed-gate-test.ts:73-80` writes an OHLC table without the guard | **(5) no work** — a hand-run seed of two literal rows into a synthetic 2025 partition, not a venue frame |
| A8 | the headroom gauge runs at boot only | **(5) no work in this batch** — forward coverage is the partition creators' job |
| R1 | the writer drops a whole chunk for any rejected row | on `#705`, as scoped |
| R5 | *persisted* counts **buffered** bars; `BUG-2026-04-30-G` shows the health line reading non-zero while zero rows landed | **(1) folded as a comment at each declaration (P3). The log token `rows_persisted_60s` is NOT renamed** — `#594`'s record, `BUG-2026-04-30-G` and `BATCH_74_SCOPE.md:109` all quote it as the health line's fixed form |
| R6 | an absent volume is stored as zero (A16) | **kept, pending Langston at J6** |
| R8 | whether one futures poll cycle can exceed 60 s | **(4) review at Step 7**, before P10's check is read: cycle timing from consecutive `[rest] polled` lines (`kraken-futures-archiver.ts:118`) per leg |

## 5–7. *(reserved)*

## 8. REVIEWER RECORD
**Round 1 — four fresh readers, CLAIM ONLY (Mode B), each handed one claim and asked what objects would settle it and what states of the world they allow:**
- `REVIEWER: claim-only · crypto counts at the caller and would overcount skipped bars · HIT: caller increments unconditionally (crypto-spot-archiver.ts:157-159) and already counts the :106 early return; futures' catch at :106 drops buffered candles from :119 · re-derived y`
- `REVIEWER: claim-only · exactly one call path per OHLC producer · HIT (narrowing): perpfeed-gate-test.ts:77 inserts directly; _handleMessageForTests test-only · re-derived y`
- `REVIEWER: claim-only · no helper escalates on a sustained rate · HIT: in-file windowed/consecutive alert patterns, nearest regime-inputs.ts:206-268 and rtb-metrics-service.ts:355-380 · re-derived y`
- `REVIEWER: claim-only · no throttled logger reports how many lines it suppressed · no counting logger found under its searches · clean — NOT cited; A7's second claim stands on my own search at the ref`

**Langston, not a gate (2026-09-11 `07:32Z`, re-derived at `9536a3800`):** three points O3 did not cover — two counters, live today, the ticker twin. **Re-derived at the object; the first two narrowed by the provenance read (§0 rows 8–9, J8); the third folded into `#1029`.**

**Round 2 — OBJECT round at the ref:** ⏳ before dispatch.

---

## PLAIN-LANGUAGE SUMMARY
**What the audit found:** each of the three bar producers has one way in, so one check covers them all. The database will quietly store "not a number", so the check must be stricter than the database. Two more things turned up while checking the reviewer's points. The archive panel's counters were built to mean "everything received", but one producer counts them one way and two count them another, so the panel's "how much got stored" figure isn't comparable across them. And the futures bar collector saves each minute while it is still in progress and never goes back for the finished version, so some stored futures bars are short, by up to about one minute in five on the crypto perps checked.

**What the plan does:** one shared check stops bad bars before they're saved. Every rejected bar is counted and shown on the panel, and a symbol that keeps sending bad bars raises a real alert. All three producers count the same way. The futures collector re-reads its newest minute once it has finished. Two misleading comments and one misleading alert message get corrected. Two values have no data to set them from yet — the alert threshold and how long a futures poll takes — and they're marked that way rather than guessed.
