# B-OHLC-FRAME-GUARD — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (`#1028`) · r4

> **Owner:** CC-C · **Plan row:** `PHASE_19_PLAN` `3b.h-6` · **Scope:** `B_OHLC_FRAME_GUARD_SCOPE.md` — Step 1 ✅ APPROVED at r2 (conditions in its §14); **r5 amends it: OBJ-7 (`#1029`) folded in and §14 O3 corrected; OBJ-8 (`#1030`) and OBJ-9 (`#1031`) MOVED OUT at the review cap — `#1030` → `3b.h-7`, `#1031` → `F-G-1` OBJ-9 ②.**
> **ONE document, ONE sign-off. THE AUDIT COMES FIRST; THE PLAN FALLS OUT OF IT.** Every plan item back-references the audit finding it comes from. Anything with no audit treatment is flagged **`UNAUDITED`** in place.
> **Code citations read at `origin/migration/aws-supabase` `13bb7e817`, re-read by object readers at `c0b102ebf` and `960174839`; no code file changed between them, and r4 changes no code.** Reviewer record and the cap statement: §8.

---

## 0. ⛔ PREVIOUSLY STATED → NOW — every number and claim that moved since the scope was first written

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| **1** | validator = each price field parses to a **finite** number (scope r1) | **admit iff STORABLE and AGGREGATABLE**, across all eight fields; **`±Infinity` rejected regardless of today's sink** | the database ACCEPTS `NaN` (verified, PG 17.6); Langston repaired his contract |
| **2** | partition range: an open design question (scope r2 §11) | **OUT of the guard** — `Invalid Date` only | Langston ruling, option (c) |
| **3** | crypto has "no counter to sit beside" (ruled, adopted in scope r2) | crypto **counts at the caller** (`crypto-spot-archiver.ts:158-159`) | re-derived at the ref |
| **4** | `b48a743f` "deliberately not acked, or it swallows the next failure" | **resolved** — ACTIVE swallowed the next failure just the same | `system-alerts.ts:503-509` suppresses on any non-resolved state |
| **5** | OBJ-4: `ticker-batch-writer.ts:154` **and** the `ohlc-batch-writer.ts` rationale are false | **only `:154` is false**; `ohlc-batch-writer.ts:66-68` is correctly scoped | read at the object |
| **6** | "six B74 archive tables" (Langston ruling) | **eight** | `server/startup/passive-archive-bootstrap.ts:42` `ARCHIVE_TABLES` |
| **7** | a counted-but-skipped crypto bar would **inflate** the panel's store ratio (scope §14 O3, r1 A4) | it would **DEFLATE** it — the counter is the ratio's **denominator**: `ohlcStoreFraction = min(1, ohlcCount / cumulativeOhlcRows)` (`drift-dashboard-aggregator.ts:943-945`), labelled *"scanned (since PID)"* on the panel (`client/src/pages/analytics.tsx:1955`) | read the consumer, not the producer's field name |
| **8** | O3: crypto's caller bumps "the stored counter", which must follow the return value | it bumps **two**. **`rowsPersistedLastMinute` (`:158`) must follow the return value. `cumulativeOhlcRows` (`:159`) must NOT** — it is the panel's *scanned*: the commit that created it says the counters *"increment on every WS message received OR REST candle parsed"* and records the choice *"Q2 counter placement → KEEP pre-write increment (correct drift semantic: scanned = received from source, stored = persisted to DB; gap reveals …"* (`b8eba807e`). ⇒ **J8 — it disagrees with the O3 Langston approved at Step 1 (scope r2's wording; r3 rewrote O3) and with his point 1** | provenance read of the counters, §A4 |
| **9** | the miscount appears once the guard adds a skip | **live today, in both directions:** crypto counts bars its parser discards as *persisted*; xStock and futures leave items their parsers discard out of *scanned* ⇒ **`#1029`** | Langston (the crypto half, re-derived); census of all three producers × both channels (the rest) |
| **10** | "no existing helper escalates on a sustained rate" (r1 A7) | **no general helper; in-file patterns exist** — nearest `active-execution-engine.ts:377-406` (per-position streak → one alert), `rtb-metrics-service.ts:355-380` (consecutive count → one alert → reset on success), `regime-inputs.ts:206-268` (windowed count → alert with cooldown) | independent readers' hits, re-derived at the ref |
| **11** | "exactly one call path per producer" | **per producer of venue frames.** One non-venue write route exists: the hand-run seed script `server/scripts/perpfeed-gate-test.ts:76-80` | independent reader's hit, re-derived |
| **12** | futures "counts after buffering, so a skip is skipped naturally" | true of `cumulativeOhlcRows` (`kraken-futures-archiver.ts:100`) — but a `null` candle throws at `candle.time` (`:85`) into the catch at `:105-107`, which returns 0: candles already buffered drop out of the per-minute count (`:119`), **and the mark (`:103`) never moves, so while the `null` stays in the 2,000-candle window every poll re-buffers and re-counts the candles before it and never reaches those after it.** A non-object that is not `null` (a number) does not throw — it is buffered with an Invalid Date | independent readers' hits, re-derived |
| **13** | futures is the one leg whose OHLC is REST-replayable (scope §7, `#1028`, `#705` amendment) | **only across a restart.** The poller never re-reads a minute it has seen and the venue returns the minute in progress ⇒ a stored futures bar is the minute as it stood when first polled. **Measured: stored volume short of the venue's final bar in 2–24 of 116 minutes on three crypto perps, 1 of 116 on three xStock perps ⇒ `#1030`.** Reproduced by an independent reader over a later window (06:23→08:20Z): 22 / 24 / 2 and 0 / 1 / 0, `open` 116/116 | new measurement with a control, §A15 |
| **14** | P5 alert category: lean `health_check` | lean **`breakage`** | the protocol's action for `breakage` is *reproduce → fix* (`ALERT_HANDLING_PROTOCOL.md:57`); per-key precedents use it (`active-execution-engine.ts:396`, `rtb-metrics-service.ts:367`) — §3 J1 |
| **15** | (r2) a failed flush's rows are re-added at the front, so the fresher row always wins (`ohlc-batch-writer.ts:333-338`); §4 A3: overlapping polls are "absorbed by in-buffer de-duplication" · (r3) this fails when "two flushes of one class overlap and **both** fail" | **one transient failure is enough:** an older flush still inside its insert when a newer flush of that class starts and succeeds, then fails and re-adds at the front (`:340`) — the next flush upserts the older bar over the newer one ⇒ **`#1031`** | round-2 and round-3 object readers, re-derived at the ref — §A17 |
| **16** | (r3) P10: the futures mark is clamped at now + 60 s | **WITHDRAWN.** now + 60 s always lies past the next minute boundary, so a future-stamped candle still skips a real minute and leaves the current one partial — and a persistent one does it every poll and survives a restart | round-3 object reader; the arithmetic re-derived |
| **17** | (r3) P10: skip only a finite time strictly below the mark; mark and count committed in a `finally` | **moves with `#1030`.** This batch keeps today's `<=` skip and today's mark, and never moves the mark for a rejected candle — which closes the `null`-candle throw without a `finally` (P2) | round-3 object reader: a `finally` after a throw can commit a mark above unbuffered candles if the response is not in time order |
| **18** | A5: the explicitly typed interface drops an undeclared field | the field-by-field row literal omits it (`:968-982`) and TypeScript rejects an undeclared key there. **And the client's copy of the type is stale:** its `universe` is `equity_spot \| equity_perp \| crypto_spot` (`analytics.tsx:1849`) while the server sends `xstock_spot \| xstock_perp \| crypto_spot \| crypto_perp` (`drift-dashboard-aggregator.ts:676`), so `universeLabel` (`analytics.tsx:1884-1889`) prints three rows as raw internal names | object reader, re-derived |
| **19** | (r3) `#1030` folded as OBJ-8 (P10); `#1031` folded as OBJ-9 (P11) | **BOTH RE-HOMED.** `#1030` → its own batch `B-FUTURES-BAR-FINAL`, `PHASE_19_PLAN` `3b.h-7`, after `F-G-1`'s OBJ-9 ② fix. `#1031` → `F-G-1` OBJ-9, whose approved criterion ② it breaks: *"the dedupe switches to MAX-BY-ARRIVAL; do not rely on preserving order, which is the fragile half"* (`B_EXIT_GRID_REPRESENTABILITY_SCOPE.md:176`) | round 3 was the cap and neither design closed; each defect goes to the batch its criterion belongs to — §3 J7, J9 |
| **20** | (r3) A17: the ticker writer shares the OHLC writer's timer and is unaffected | it has **its own** identical timer and front re-add (`ticker-batch-writer.ts:169`, `:186-199`); it cannot overwrite (plain insert, `:138`) — **but a transient failure on a later chunk re-adds the whole batch, so chunks already committed (`:136-139`) are inserted twice** | round-3 object reader, re-derived — carried to `#1031` |

---

# PART I — THE AUDIT

## 1. THE SIX SOURCES — which were read

| # | source | read? | for what |
|---|---|---|---|
| 1 | **The code**, at `origin/migration/aws-supabase` | ✅ | all three producers, both writers, the alert service, the aggregator, the panel, the `#594` fence tests, three alert precedents; for the re-homed defects, the shutdown path (`server/index.ts`, `server/core/boot_orchestrator.ts`), `server/db.ts` and `ecosystem.config.cjs` |
| 2 | **Runtime + database + venue** | ✅ | `error.log`/`out.log`; the sink on PG 17.6; partition catalog; `NaN` scan; **the futures charts endpoint (read-only GET) against `crypto_perp_ohlc_1m` / `xstock_perp_ohlc_1m` (§A15)** |
| 3 | **`SYSTEM_IMPACT_MAP`** | ✅ | §B74 — stale on the load-bearing point (A13) |
| 4 | **`SYSTEM_MANUAL`** | ✅ (grep) | silent on the 1-minute table's role as a signal input — a governance gap, OBJ-6 |
| 5 | **Batch reports + ledger** | ✅ | `#594` (`RUNNING_ISSUES:20`), `#635`, `#704`, `#705` + amendment, `#950`, **`#958` (`RUNNING_ISSUES:1344`)**, `#1028`; `F-G-1` scope OBJ-9 criterion (`B_EXIT_GRID_REPRESENTABILITY_SCOPE.md:176`), pre-audit R12 and progress report; `BUG-2026-04-30-G`; `BATCH_74_SCOPE`; `ALERT_HANDLING_PROTOCOL`; commits `b8eba807e`, `4c473ff33`, `98640f00a`, `06560c299` |
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
| futures | `pollAllOhlc` → `pollOhlcOnce(sym)` (`kraken-futures-archiver.ts:114`) → per-candle `bufferOhlcBar` (`:86`). **One class, two instances** (scope §7): `xstock_perp` runs a static 10-symbol universe (`equity-perp-archiver.ts:14`); `crypto_perp` defaults OFF (`server/startup/passive-archive-bootstrap.ts:189`) and is running on staging (A15's rows) | `setInterval` (`:213-215`) **and** an immediate poll (`:216`) |

✅ **Exactly one call path per producer of venue frames** — `bufferOhlcBar` has three non-test callers (`crypto-spot-archiver.ts:107`, `equity-spot-archiver.ts:87`, `kraken-futures-archiver.ts:86`).
⚠️ **One non-venue write route, out of the guard's population:** `server/scripts/perpfeed-gate-test.ts:73-80`, run by hand with `--seed`, creates a synthetic `2025-01-15` partition and inserts two literal rows (`1, 1, 1, 1, 0`) into `xstock_perp_ohlc_1m`. A reader's census found it the only INSERT into an `*_ohlc_1m` table among the 35 non-test files that name one, and nothing automatic invokes it. §4.
⚠️ **Test-only export** `_handleMessageForTests` (`equity-spot-archiver.ts:480`) — its only importer is `p19-b4a-c3-gate-watchdog.test.ts:65`.
⚠️ **The poll scheduler has no in-flight guard, and the fetch at `:77` sets no timeout**, so a cycle can overlap the next. Today the duplicates are absorbed by in-buffer de-duplication (`ohlc-batch-writer.ts:251-258`) and upsert — **except when an older flush fails after a newer one has written** (A17, `#1031`).

### A4 — ⛔ THE COUNTERS: WHAT EACH WAS BUILT TO COUNT, AND WHAT EACH PRODUCER ACTUALLY COUNTS *(§9.5(a-ii) state-write census + provenance)*

**Intent, quoted:**
- **`cumulativeOhlcRows` / `cumulativeTickerSnaps`** were added to both spot archivers **by one commit**, `b8eba807e` (2026-05-01, *"B74.1: Equity perp OHLC REST polling + xStocks expansion + Passive Archive monitor panel"*): *"cumulativeOhlcRows + cumulativeTickerSnaps counters increment on every WS message received OR REST candle parsed"* — and the same message records the design choice: *"Q2 counter placement → KEEP pre-write increment (correct drift semantic: scanned = received from source, stored = persisted to DB; gap reveals …"*, with *"Store-fraction = stored/scanned for drift detection on insert errors, …"*. At that commit the REST branch (then `equity-perp-archiver.ts`) counted after its skip, so *"REST candle parsed"* meant new candles.
- The panel labels them **"scanned (since PID)"** (`client/src/pages/analytics.tsx:1955`, `:1958`; note at `:1935`); the interface groups them under *"Scanned (in-process counters; reset on PM2 restart)"* (`drift-dashboard-aggregator.ts:683`).
- **`rowsPersistedLastMinute`** is the 60 s health line's `rows_persisted_60s` (`BATCH_74_SCOPE.md:109`).

**Actual placement — all three producers × both channels:**
| producer · channel | parser's early return | *scanned* bump | vs intent | *persisted* (per-minute) bump | vs intent |
|---|---|---|---|---|---|
| crypto spot · OHLC | `:106` | caller, every item (`crypto-spot-archiver.ts:159`) | ✅ | caller, every item (`:158`) | ⛔ **counts bars discarded at `:106`** |
| crypto spot · ticker | `:123` | caller, every item (`:164`) | ✅ | — | — |
| xStock spot · OHLC | `:85` | after guard **and** buffer (`equity-spot-archiver.ts:101`) | ⛔ **misses bars discarded at `:85`** | after buffer (`:100`) | ✅ |
| xStock spot · ticker | `:144` | after guard **and** buffer (`:205`) | ⛔ **misses snaps discarded at `:144`** | — | — |
| futures · OHLC | none today | per new candle, after buffer (`kraken-futures-archiver.ts:100`) | ✅ today — nothing is discarded; ⛔ **once the guard rejects**; ⛔ re-counts after a mid-loop throw (§0 row 12) | return value (`:104` → `:119`) | ✅ except §0 row 12 |
| futures · ticker | `:126` | after guard **and** buffer (`:148`) | ⛔ **misses snaps discarded at `:126`** | — | — |

⚠️ *Langston cited crypto's ticker as `:122`/`:163`: those are the function's first line and the call; the return is `:123`, the bump `:164`.*
★ **The inconsistency is original:** `b8eba807e`'s own diff puts crypto's bumps in `handleMessage` after each call and xStock's inside `parseOhlcBar`/`parseTickerSnap` after the buffer — **same commit, two placements, and only crypto's matches its message.**
⚠️ **Every ticker *scanned* count includes snaps the capture throttle drops:** all three parsers discard `bufferTickerSnap`'s boolean, which is `false` on a throttled snap (`ticker-batch-writer.ts:114-115`). That is consistent with *received*, and it is already on the ledger — `#958` (`RUNNING_ISSUES:1344`): *"counts FRAMES PARSED, never ROWS WRITTEN"*.

**Readers, and the direction each errs:**
- ***persisted* → the health line** (`crypto-spot-archiver.ts:224`, `equity-spot-archiver.ts:351`, `kraken-futures-archiver.ts:226`). Crypto's count **reads healthier than the feed.** `#594` ruled this counter must not carry a stall threshold (`RUNNING_ISSUES:20`), and `BUG-2026-04-30-G` records it reading non-zero while zero rows landed (`CHANGES_AND_FIXES.md:1631`).
- ***scanned* → the store ratio's denominator** (`drift-dashboard-aggregator.ts:943-947`, rendered `:974-975` → `analytics.tsx:1971-1972`). A producer that leaves discarded items out **overstates** its ratio and cannot show the drops; one that counts them lowers the ratio, **which is what the ratio is for.** ⚠️ *The interface comment heading that field — "Drift indicator: scanned-but-not-stored fraction" (`:688`) — names the complement of the value it heads (`:689`, stored / scanned).*

⚠️ **Magnitude: not measurable before the fix.** No instrument counts a discarded item, and the ratio cannot isolate one: its denominator counts frames since the process started while its numerator counts de-duplicated rows in a time window (`ohlc-batch-writer.ts:242-258`, `drift-dashboard-aggregator.ts:923-928`); it is `null` when *scanned* is 0, clamped at 1, and its numerator falls to 0 on a query timeout (`:893-900`). **Declined as a pre-deploy baseline** (Langston offered one): it could not come out differently whether the miscount is zero or large. ⇒ **the guard's skip counter is the first instrument that sees these bars.**
⚠️ **And *persisted* counts BUFFERED bars, not persisted rows** — `bufferOhlcBar` is an in-memory push (`ohlc-batch-writer.ts:232-234`); rows persist later, in `flushAssetClass`. §4 R5.
⇒ **`#1029`. Plan: P2, P3 — and J8, where this disagrees with the O3 approved at Step 1.**

### A5 — The dashboard chain *(corrected twice)*
`PassiveArchiveUniverseStats` (`drift-dashboard-aggregator.ts:673-696`) is explicitly typed; each row is built field by field in `universes.push({…})` at `:968-982`, so **a field not listed there never reaches the client** (and TypeScript rejects an undeclared key in that literal). Universe list `:864-869`. Client: the mirror type spans `analytics.tsx:1848-1862`; `PassiveArchiveSection` `:1874`; the OHLC header group is `colSpan={3}` at `:1945`; cells `:1971-1972`.
⛔ **The client's mirror is already stale:** `universe: 'equity_spot' | 'equity_perp' | 'crypto_spot'` (`:1849`), while the server's interface was realigned to `xstock_spot | xstock_perp | crypto_spot | crypto_perp` (`drift-dashboard-aggregator.ts:674-676`, P19-B-PERPFEED OBJ-5). `universeLabel` (`:1884-1889`) maps only the old names and returns anything else raw ⇒ **three of the four rows print internal names.** Folded into P3 — it is the type P3 edits.
**Adding a counter touches: getter → interface → `universes.push` → client type → header span and a cell.**

### A6 — The alert mechanism to reuse *(for C1; precedents)*
- **Raise mechanics:** `alertPermanentWriteFailure` (`ohlc-batch-writer.ts:139-183`) — latch **claimed synchronously before the first `await`** (`:150`), JSONL `addAlert` (`:161-162`), `dedupe_key`, latch **released if the raise fails** (`:183`). ⚠️ *The two counting precedents below do NOT release theirs on a failed raise (`rtb-metrics-service.ts:374`, `regime-inputs.ts:238`); P5 copies the release.*
- ⭐ **Closest precedent to P5's per-key shape:** `_recordPriceSkip` (`active-execution-engine.ts:377-406`) — a per-position streak map; one alert at `streak === threshold`; threshold from `exit_integrity.max_consecutive_price_skips` (seeded 40); `category: 'breakage'`, `severity: 'warning'` (`:396-397`); `dedupe_key price-skip-<mode>-<symbol>` (`:400`). Its hard default of 40 when the knob cannot be read (`:380`) is the Langston-approved design in `06560c299` (P19-B8.5 rev2) — so the alert still fires cold — and is cited as a precedent, not a finding.
- **Consecutive-count precedent:** `rtb-metrics-service.ts:355-380` — `++` per failure, one alert at **10** (`:357`), latch set synchronously (`:362`), counter and latch reset on success (`:378-380`), `breakage`/`warning` (`:367-368`).
- **Windowed-count precedent:** `regime-inputs.ts:206-268` — 5-minute window, threshold 20, 30-minute cooldown, `health_check`/`warning`.
- **Categories:** closed set `system-alerts.ts:69-77`, enforced at creation; `health_check`'s comment — *"disk / archival-cron-silence / freshness system health"* (`:76`). **Handling:** `breakage` → *"Reproduce → fix or escalate the broken path"*; `health_check` → *"Confirm healthy (resolve) or escalate if degraded"* (`ALERT_HANDLING_PROTOCOL.md:57-58`).
- Dedupe `system-alerts.ts:503-509` suppresses on **any non-resolved** same-key alert.

### A7 — ⛔ ABSENCE CLAIMS *(rewritten)*
- **No GENERAL alert-on-count helper exists; in-file patterns do** — the three in A6, plus `amr-input-health.ts:104-128` and the standalone `staging-liveness-watchdog.mjs:182-183`. Count-without-alert: `circuit-breaker.ts:25` (exported class, no alert call), `resilience.ts:222-231`, `external-macro-feed.ts:455-473`. ⚠️ **My r1 search was too narrow**; independent readers' wider searches found these and each was re-derived. ⇒ **P5 copies `_recordPriceSkip`'s per-key shape rather than inventing one.**
- **No logger prints how many lines it suppressed.** My search at the ref and a reader's wider one — with a positive control that does return "… and N more" lines — found none. Nearest: `symbol-normalize.ts:134` (*"further unknown-form warnings suppressed"*, no number), `friction-divergence-evaluator.ts:182-185`, `feed-integrity-auto-check.ts:182`, `unknown-strategy-counter.ts:33-41` (throttled, prints cumulative hits, not suppressed lines). ⇒ P4 needs a small helper. **Reach:** `logger.*` calls were covered only by the `suppress` search.

### A8 — Partitions *(option (c))*
`checkPartitionHeadroom` (`server/startup/passive-archive-bootstrap.ts:65`) self-heals **today's** partition at boot only. Failing-open history: `BUG-2026-04-30-G` (`CHANGES_AND_FIXES:1627`) and `P19-B-PERPFEED` BLOCKER-2. ✅ **Measured, clean:** all 8 archive parents cover now and tomorrow, **0** `DEFAULT` partitions.

### A9 — Tests
Vitest; `vi.mock('../../db.js', …)`. Test-hook convention in the equity archiver: `_logDiagNonDataMessageForTests` (`:259`), `_setArchiverStateForTest` (`:467`), `_handleMessageForTests` (`:480`), `_getArchiverClocksForTest` (`:481`). ⭐ **The `#594` stamp-site fence** (`server/tests/unit/p19-b4a-c3-gate-watchdog.test.ts:294-355`) drives real frames through `_handleMessageForTests`: a well-formed OHLC case (`:331-339`), a malformed **ticker** case (`:341-347`), **no malformed-OHLC case.** ⚠️ **Its OHLC frame (`:334`) carries no `volume`, `vwap` or `trades` — it stays well-formed under P1 only because the `volume ?? '0'` default runs before the validator (J6).** No test imports the crypto or futures archiver; crypto exports no test hook (`:52`, `:230`, `:260` only), and its `handleMessage(shard, raw)` (`:147`) needs a `Shard`. `KrakenFuturesArchiver` is an exported class (`kraken-futures-archiver.ts:49`) with a private `pollOhlcOnce`. No mutation-testing framework.

### A10 — Comments *(OBJ-4)*
`ticker-batch-writer.ts:154` — *"OHLC bars are REST-replayable"* — false for both spot classes, and (A15) true of futures only across a restart. `ohlc-batch-writer.ts:66-68` is correctly scoped.

### A11 — The alert body *(OBJ-5)*
`ohlc-batch-writer.ts:167` — *"every further flush for this class will fail the same way until it is fixed"* — **refuted:** 3,632 and 3,297 bars landed in the next two hours.

### A12 — Provenance *(scope §4)*
B74, `ce4a7e408`: *"NO consumers in v1 — pure passive accumulation."* The table is now a signal input. **Rule 24 outcome (2).**

### A13 — Documentation gap *(OBJ-6)*
`SYSTEM_IMPACT_MAP` §B74: *"NO signal-pipeline integration"* — stale; writer line refs stale. `SYSTEM_MANUAL` silent on the 1-minute table feeding 15-minute signal bars.

### A14 — THE xSTOCK DATA-LIVENESS STAMP SITS AFTER THE GUARD, BY RULE
`equity-spot-archiver.ts:86` stamps `lastDataMsgAt` right after the `:85` guard — *"same rule as parseTickerSnap"* — whose comment states the rule: *"AFTER the malformed-payload guard (a junk snap must not count as proof of life)"* (`:145-146`). `#594`'s resolution: stamped *"each AFTER its malformed-payload guard"* (`RUNNING_ISSUES:20`). The stall watchdog thresholds that clock (`:428`).
⇒ **the validator REPLACES the `:85` guard and runs BEFORE the `:86` stamp** — a rejected bar moves the connection clock only, as the malformed-ticker fence asserts for snaps (`p19-b4a-c3-gate-watchdog.test.ts:341-347`).
**Consequence, bounded:** a rejected bar withholds only its own stamp. The clock is universe-wide, stamped by both parsers on every frame that passes its guard (`:86`, `:153`) — *"once per symbol-tick across ~485 symbols … ~900K-996K ticks/hr"* (`:421-423`) — so it goes stale only if no frame on either channel passes its guard for the watchdog's threshold, which is the stall the watchdog exists to catch. §3 J5.

### A15 — THE FUTURES POLLER STORES EACH MINUTE AS IT STOOD WHEN FIRST POLLED *(`#1030` — re-homed, §P10)*
**Mechanism, cited:** `pollOhlcOnce` skips any candle at or before a per-symbol high-water mark — `if (candle.time <= lastSeen) continue` (`kraken-futures-archiver.ts:85`) — and advances the mark to the newest candle it buffered (`:101`, `:103`). **The venue returns the minute still in progress:** `GET https://futures.kraken.com/api/charts/v1/trade/PF_XBTUSD/1m` at `07:44:55Z` returned `07:44:00` as the newest of 2,000 candles; a reader's two GETs twenty seconds apart saw the `08:17:00` candle's volume move 0.7203 → 0.7531 as the `08:18:00` candle appeared. ⇒ the minute is buffered part-way through and skipped on every later poll.

**Measured, with a positive control** — `scripts/analysis/b_ohlc_frame_guard_futures_partial_bar_check.py`, staging: stored row vs the venue's final candle for the same minute, over minutes after the process start (`2026-09-09T08:46:40Z`), so no boot re-fetch touched them.

| window | table | symbol | ✅ control: `open` matches | stored `volume` short of venue | stored `high` short | stored `low` above |
|---|---|---|---|---|---|---|
| `05:47`→`07:44Z` (mine) | `crypto_perp_ohlc_1m` | `PF_TRXUSD` | 116/116 | **14** | 7 | 5 |
| | | `PF_ONDOUSD` | 116/116 | **24** | 13 | 10 |
| | | `PF_FLOKIUSD` | 116/116 | **2** | 1 | 1 |
| | `xstock_perp_ohlc_1m` | `PF_HOODXUSD` · `PF_TSLAXUSD` · `PF_SPYXUSD` | 116/116 each | **1** each | 1 each | 0 each |
| `06:23`→`08:20Z` (independent reader) | `crypto_perp_ohlc_1m` | TRX · ONDO · FLOKI | 116/116 each | **22 · 24 · 2** | 9 · 13 · 1 | 11 · 11 · 1 |
| | `xstock_perp_ohlc_1m` | HOOD · TSLA · SPY | 116/116 each | **0 · 1 · 0** | 0 · 0 · 0 | 0 · 0 · 0 |

**Every volume mismatch is in the partial direction** (matches + shortfalls = 116 on all six, both windows), and `open` — fixed by a minute's first trade — matches everywhere ⇒ **a truncated minute, not a mis-join.**
⚠️ **Population:** three symbols per table chosen by row count, **all tied at 116 — not the most active.** ⚠️ **Not excluded by this instrument:** a minute the venue revises after serving the next one.
**Self-heal, by mechanism:** the mark is in memory (`:56`); a restart empties it, the first poll re-buffers the whole window (`lastSeen ?? 0`, `:81`), and the upsert rewrites the seven value columns and `captured_at` (`ohlc-batch-writer.ts:300-309`). ⇒ **corrected at the next restart if still inside the 2,000-candle window; partial for good otherwise.**
⚠️ **The mark also trusts the venue's time, today:** a candle with a finite time ahead of the real minute lifts it, and every real minute after is skipped uncounted until a restart.
**Provenance, quoted:** `b8eba807e` (2026-05-01, B74.1) — *"Per-symbol last-seen interval_begin dedup map; only inserts new bars."* **At that commit the writer INSERTED** (`await db.insert(table as any).values(rows as any)`, `ohlc-batch-writer.ts:105`, unchanged by that commit), so re-reading a minute would have written a duplicate row — **the dedupe was right.** **`4c473ff33` (2026-05-19, `B-NEW-35`) made the writer UPSERT on `(symbol, interval_begin)`**, removing the dedupe's reason and leaving its side effect. ⇒ **rule 24 outcome (3): legacy that no longer fits.**
**Prior records, searched first (§9.5(b-ii)):** `F-G-1` pre-audit R12 (`B_GRID_REPRESENTABILITY_PRE_AUDIT.md:109`) — the same mark leaves **failed-flush** bars never re-polled; `RUNNING_ISSUES:5338` — a restart clears it. **Neither records the in-progress minute.** ⇒ **`#1030`**.
**Consumers:** no signal path reads either perp OHLC table — readers are retention (`b75-retention-sweep.ts:86`, `:88`), partitioning, `perpfeed-daily-probe.ts:63` and the dashboard counts (`drift-dashboard-aggregator.ts:866`, `:868`). ⇒ **capture-archive data quality; no trading impact.**
⇒ **Re-homed to its own batch, `3b.h-7` (P10, J7).**

### A16 — ABSENCE DEFAULTS ON THE VALUE PATH
All three producers default an absent volume to zero before buffering — `String(data.volume ?? '0')` (`equity-spot-archiver.ts:96`, `crypto-spot-archiver.ts:116`) and `candle.volume ?? '0'` (`kraken-futures-archiver.ts:95`). `vwap` and `trades` map absent to `null` (nullable columns). A defaulted zero is **storable and aggregatable**, so the invariant admits it — and it is indistinguishable from a real zero-volume minute, which also makes its reach unmeasurable from stored rows. The existing `#594` OHLC fence frame depends on it (A9). §3 J6.

### A17 — THE OHLC WRITER'S RETRY CAN WRITE AN OLDER BAR OVER A NEWER ONE *(`#1031` — re-homed, §P11)*
**Mechanism, re-derived at the ref:** `startBatchWriter` flushes every class on a 5 s `setInterval` with no in-flight guard (`ohlc-batch-writer.ts:367-369`), through two slots (`:32`). A flush empties the buffer first (`:240`); a slot wait rejects after `POOL_SLOT_TIMEOUT_MS = 5_000` (`:31`, `:207-211`) and is classed transient (`:98`), as are connection resets (`:99-101`). A transient failure re-adds its rows at the FRONT (`:340`); the next flush keeps the LAST row per `(symbol, interval_begin)` (`:251-258`) and upserts it (`:297-309`).
**The sequence — one failure is enough (r3 said "both fail"; corrected):** flush A (older rows) is still inside its insert when the timer drains newer rows into flush B on the free slot. **B succeeds and writes the newer bar.** A then fails transiently and re-adds its rows at the front; the next flush upserts A's older bar over the stored newer one.
**Why the code believed otherwise:** the front re-add came with `98640f00a` (2026-08-28, *"F-G-1 OBJ-9: the writer retries the transient, drops the permanent LOUDLY, and bounds itself"*), to keep B-NEW-35's rule that the last write is the latest update (`:333-338`). ⛔ **`F-G-1` OBJ-9's approved criterion ② had already said not to:** *"A retried batch appended after fresh rows makes the STALE row win and overwrite a good bar. ⇒ the dedupe switches to MAX-BY-ARRIVAL; do not rely on preserving order, which is the fragile half."* (`B_EXIT_GRID_REPRESENTABILITY_SCOPE.md:176`). ⚠️ **And ② as written would not cover this sequence either:** max-by-arrival inside one flush cannot protect a newer bar that an earlier flush has already written.
**Reach:** the spot legs re-send an open minute on every trade, so a stale overwrite heals on the next update — unless it lands after the minute's last. Futures buffers each minute once today. Slot timeouts do occur (the F-G-1 audit counted 7, `B_GRID_REPRESENTABILITY_PRE_AUDIT.md:111`); nothing records an older flush failing after a newer one wrote, so **no frequency is claimed.**
➕ **The ticker writer** has its own identical timer and front re-add (`ticker-batch-writer.ts:169`, `:186-199`). It cannot overwrite (plain insert, `:138`), **but a transient failure on a later chunk re-adds the whole batch, so chunks already committed (`:136-139`) are inserted twice.**
➕ **What any fix must also hold, found in round 3 and re-derived:** the database checkout has no timeout (`server/db.ts:68-76` — `query_timeout: 30_000`, no checkout limit); the buffer cap is enforced only in the transient catch (`ohlc-batch-writer.ts:346-353`), not while a flush is in flight; the shutdown drain (`:374-410`, called from `server/core/boot_orchestrator.ts:56-58`) has no timeout of its own and races a second SIGTERM handler that ends in `process.exit(0)` (`server/index.ts:1615-1660`, exit at `:1652`) and PM2's `kill_timeout: 10000` (`ecosystem.config.cjs:36`); a transient re-add during the drain is never flushed again.
**Rule 24: outcome (1), real defect — in my own `F-G-1` change, against its own approved criterion.** ⇒ **Re-homed to `F-G-1` OBJ-9 ② (P11, J9).**

---

# PART II — THE PLAN (every item → its findings)

### P1 — The validator · → **A1, A2, A7, A16**
New module `server/services/passive-archive/ohlc-frame-validator.ts`, exporting `validateOhlcFrame(input)` → `{ ok: true, row } | { ok: false, field, reason }`, pure and non-throwing.
**`input` is the raw values as each producer sources them, AFTER its existing absence defaults** (J6): `symbol · intervalBegin · open · high · low · close · volume · vwap · trades`.
Per field, in order: **(0) `symbol`** — a non-empty string; **absorbs the existing key check, so today's silent early return becomes a counted skip (A4)** · **(1) type-gate** — a `number`, or a non-empty trimmed `string`; everything else rejected, so `""`, `null`, `" "`, `[]`, `false` never coerce to `0` · **(2) parse** · **(3) `Number.isFinite`** — rejects `NaN`, `±Infinity` · **(4) column bound** — prices `|v| < 10^12`, volume `|v| < 10^20` · **(5) `trades`** — `null` passes, else `Number.isInteger` inside `int4` · **(6) `intervalBegin`** — parses to a finite time. **No time-plausibility rule** — option (c).
**Zero and negatives are admitted.** ⭐ **Valid values stay byte-identical:** `String(original)`, never `String(Number(v))`.
**Reasons are a closed set** — `absent · not_number_or_string · empty · not_finite · out_of_range · not_integer · invalid_time` — shared by the log line and the tests.

### P2 — Wire it into all three producers · → **A3, A4, A14**
- **xStock spot:** *scanned* (`:101`) moves **above** the validator; the validator **replaces** the `:85` guard and runs **before** the `:86` data-clock stamp (A14); reject → skip counter, throttled log, streak, return; accept → stamp, buffer, *persisted* (`:100`, unchanged), streak reset. Ticker: *scanned* (`:205`) moves above the `:144` guard — nothing else in `parseTickerSnap` changes.
- **crypto spot:** ⛔ **`parseOhlcBar` returns `boolean`.** The caller keeps *scanned* (`:159`) unconditional, moves *persisted* (`:158`) behind `true`, and bumps the skip counter on `false`. **Ticker unchanged** — its caller bump (`:164`) already counts every snap received.
- **futures — the skip and the mark are TODAY'S (r4):** the skip reads `candle?.time`, so a `null` element cannot throw; a candle whose `time` is a number at or below the mark is skipped as today (`:85`, `<=`). Every other candle is **evaluated**: *scanned* `++`; validate; reject → skip counter, log, streak, `continue` — **the mark does not move for it**; accept → buffer, `newCount++`, and the mark advances from buffered candles exactly as today (`:101`, `:103`). With the validator pure and first, nothing left in the loop can throw, so the catch at `:105-107` and §0 row 12's gap become unreachable. Ticker: *scanned* (`:148`) moves above the `:126` guard.
  ⚠️ **Bounded, stated:** a rejected newest candle stays above the mark and is re-evaluated — and counted again — every poll until a newer candle is accepted. If every candle is rejected (a renamed field), every candle above the mark is re-evaluated each poll, up to the venue's 2,000 per symbol, so *scanned* and *skipped* climb loudly; P4 throttles the log and P5's streak counts distinct bars, so it alerts once. **This batch changes neither the mark nor the re-read — that is `#1030` (P10).**
⇒ **For OHLC, in every producer: *scanned* = *persisted-eligible* + *skipped*.** *(J8.)*

### P3 — The counters and the panel, end to end · → **A4, A5, C2**
**Skip counter:** xStock `state.ohlcFramesSkipped`; crypto per-shard `shard.ohlcFramesSkipped`, summed in `getCryptoSpotStats` (`:60-67`); ⛔ **futures an INSTANCE field** (two instances). Carried: getter return types → `PassiveArchiveUniverseStats` (`:673-696`, `ohlcFramesSkipped: number`) → `universes.push` (`:968-982`) → client type (`analytics.tsx:1848-1862`) → a header (the OHLC group's `colSpan` at `:1945` becomes 4) and a cell.
⛔ **C2: the counter is NEVER rate-limited.**
➕ **The client type's `universe` is aligned to the server's four values and `universeLabel` (`:1884-1889`) maps all four** — so no row prints a raw internal name (A5).
**One comment at each declaration of each counter, saying what it counts:** *scanned* = every item the parser receives (the panel's *"scanned (since PID)"*); *persisted* = bars **buffered**, not rows persisted (R5).

### P4 — The throttled skip log · → **A7, C2**
At most **one** `console.warn` line per `(producer, assetClass)` per **60 s**, naming **symbol, field and reason**, ending **`(+K suppressed since last line)`**. A small helper in the validator module, catching its own errors.
**Value chosen, not measured:** 60 s, the cadence of the existing health line (`crypto-spot-archiver.ts:224`, `equity-spot-archiver.ts:351`, `kraken-futures-archiver.ts:226`), so the log and the health line share a clock.

### P5 — The sustained-skip escalation · → **A6, A7, C1**
**Shape from `_recordPriceSkip` (`active-execution-engine.ts:377-406`); raise mechanics from `alertPermanentWriteFailure`:**
- Per `(assetClass, symbol)`: count **consecutive DISTINCT bars rejected** — a bar is `(symbol, intervalBegin)` — with no accepted bar for that symbol in between. **Bars, not frames:** the spot legs re-send the same minute on every trade and a rejected futures candle is re-evaluated every poll (P2), so counting frames would let one bad minute alert.
- An accepted bar resets that symbol's streak and deletes its entry (the map is bounded by the universe).
- At **10**: one alert per class — latch claimed synchronously, JSONL `addAlert`, `dedupe_key` **`ohlc-frame-skip-sustained-<assetClass>`**, `severity: 'warning'`, category per J1, **latch released if the raise fails** (unlike the two counting precedents), re-armed after `ALERT_RE_ARM_MS`. Fire-and-forget: nothing it does can throw into a parser or the poll loop. Body names the symbols over threshold with their last field and reason.
- A bar whose `intervalBegin` is itself invalid has no identity and counts as distinct each time. ⚠️ **Bounded, stated:** futures re-evaluates such a candle every poll while it stays above the mark, so one persistent bad-time candle on a symbol with no good candle in between alerts after 10 polls. A malformed timestamp that persists for ten minutes is itself worth an alert.
- ⚠️ **`UNAUDITED` — the value 10.** Anchored on the precedent (`rtb-metrics-service.ts:357`) and today's baseline — 0 `NaN` in 357,849 one-minute rows over 24h (A2) and one permanent-write alert since that alerting began on 2026-08-28 (scope §3) — under which ten consecutive bad bars on one symbol does not occur in normal operation. **No skip rate can be measured until the guard exists.**

### P6 — Correct the comments · → **A10**
Fix `ticker-batch-writer.ts:154`: replayable means the futures legs, and only across a restart (`#1030`); both spot classes are WebSocket-only. Keep `ohlc-batch-writer.ts:66-68` and make *"that leg"* explicit.

### P7 — Correct the alert body · → **A11**
Assert only what one failed flush supports: rows dropped in **this** flush, discarded before retry so the next flush can succeed, re-raised after re-arm if the fault persists.

### P8 — Tests · → **A9, A14, A4**
`server/tests/unit/b-ohlc-frame-guard.test.ts`, plus **one case in the existing `#594` fence**:
- **Validator:** every A2 row; `symbol` absent; absent volume after the `'0'` default accepted; the existing fence frame at `p19-b4a-c3-gate-watchdog.test.ts:334` still accepted.
- ⭐ **Mutation-proof, by hand:** each rejection clause isolated by a test; **verified by deleting each clause in turn and observing a failure** — recorded in the change list.
- ⭐ **`#594` fence** (describe at `:294`): *"a validator-rejected OHLC frame advances the CONNECTION clock but NOT the DATA clock"* — the twin of `:341-347`.
- ⭐ **Counters, per producer (`#1029`):** a rejected bar → *scanned* +1, *skipped* +1, *persisted* 0; an accepted bar → *scanned* +1, *persisted* +1; a symbol-less ticker snap → *scanned* +1. Crypto needs a `handleMessage` test hook that constructs a `Shard` (A9).
- ⭐ **Futures (mocked `fetch`):** a `null` candle among good ones — no throw, good candles counted once in both counters, the mark advanced as today; a rejected newest candle leaves the mark unchanged and is re-evaluated next poll; a response in which every candle fails the same field alerts once; two instances, no cross-talk.
- **C2:** the throttle reports its suppressed count; the counter is unaffected. **C1:** the streak counts distinct bars; a re-sent bad minute does not advance it; reset on accept; latch raises once, releases on a failed raise, re-arms.
- **Panel:** all four universe rows render with labels — verified in the staging UI at Step 7.

### P9 — Governance at Step 10 · → **A12, A13, C3**
**Required:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY`. **Judged yes:** `SYSTEM_IMPACT_MAP` §B74 (signal-input role, the guard, the counters' meanings, stale line refs) · `SYSTEM_MANUAL` · `CHANGES_AND_FIXES` · `RUNNING_ISSUES` (`#1028`, **`#1029`**; `#1030` and `#1031` re-homed, recorded on each; R1 → `#705`; R3 → `#950`) · `PHASE_19_PLAN` (`3b.h-6`, `3b.h-7`, and `F-G-1`'s row).

### P10 — ⛔ MOVED (r4): `#1030` → `B-FUTURES-BAR-FINAL`, `PHASE_19_PLAN` `3b.h-7` · → **A15**
Owner CC-C, **after `3b.h-6` and after `F-G-1`'s OBJ-9 ② fix** (a re-read would expose the futures leg to `#1031`). **Instrument ready:** the check script above.
**Design inputs carried from this batch's review — none of them decided here:**
- **A clock clamp does not work:** now + 60 s always lies past the next minute boundary, so a future-stamped candle still skips one real minute and leaves the current one partial; a persistent one does it every poll and survives a restart (`lastSeen ?? 0`, `:81`).
- **Decide a minute's completeness against the fetch's start time,** not processing time — a slower overlapping poll otherwise judges old data complete.
- **Keep the mark monotonic and read it after the fetch** (`:81`, as today); a mark lowered by a clock step or a stale cycle re-buffers older copies.
- **Overlapping polls buffer an older copy after a newer one** once a minute is re-read; the de-duplication then keeps the older row.
- **A `finally` after a throw** can commit a mark above unbuffered candles when the response is not in time order.
- **Host–venue clock skew** in either direction; **a candle with no partition** re-fails its whole chunk every poll if it is re-read.

### P11 — ⛔ MOVED (r4): `#1031` → `F-G-1` OBJ-9 ② · → **A17**
**`F-G-1` reopens at Step 3 for OBJ-9 ②; its owed conversion grades ② FAIL with `#1031` as the evidence** (`F_G_1_PROGRESS_REPORT.md` §7).
**Design inputs carried — none of them decided here:**
- **The ordering guard must hold across flushes,** not only inside one: a newer bar may already be written when an older batch is retried. Max-by-arrival within a flush (② as written) does not cover that.
- **If exclusion is used, it needs a settle handle, not a boolean,** covering the whole flush including the empty-buffer return (`:239`) and the de-duplication (`:251-258`, where `toISOString()` throws on an Invalid Date); the drain awaits it.
- **The buffer cap must hold while a flush is in flight** — today it is enforced only in the transient catch (`:346-353`).
- **The database checkout has no timeout** (`server/db.ts:68-76`), so an in-flight flush can wait without bound.
- **The shutdown drain races `process.exit(0)`** (`server/index.ts:1652`) and PM2's 10 s kill (`ecosystem.config.cjs:36`), has no timeout of its own (`server/core/boot_orchestrator.ts:56-58`), and a transient re-add during it is never flushed.
- **The ticker writer re-inserts committed chunks** on a later-chunk transient failure (`ticker-batch-writer.ts:136-139`, `:169`) — ② ⑤ already requires naming what happens to that writer.

---

## 3. ⛔ JUDGEMENT CALLS — ATTACK THESE
1. **P5 category — `breakage`** *(was `health_check`)*. For: the protocol's `breakage` action is *reproduce → fix* (`ALERT_HANDLING_PROTOCOL.md:57`), which is what a skip streak needs; both per-key precedents use it (`active-execution-engine.ts:396`, `rtb-metrics-service.ts:367`). Against: `health_check`'s comment names *archival-cron-silence* (`system-alerts.ts:76`), and the windowed precedent uses it. ⚠️ `breakage`'s default owner is CC-B (`:57`); Langston's domain read routes it.
2. **P5 threshold as a constant**, value 10 `UNAUDITED`. For: it tunes an alert, not trading behaviour. **Against, and it is the stronger precedent:** `_recordPriceSkip` put its threshold in `module_constants` with a cold-knob default (`active-execution-engine.ts:380-385`). Rule 15 flagged, not waived.
3. **Crypto's boolean return** rather than moving its counters into `parseOhlcBar` — the parser holds no shard reference.
4. **`String(original)`** for valid values — byte-identity over normalisation.
5. **A14 — the validator before the data-clock stamp.** By `#594`'s own rule and fence. Attack it if a venue-sent bar with a bad value should still count as proof of life.
6. **A16 — keep `volume ?? '0'`.** The validator sees the defaulted value, so no bar that stores and aggregates today is newly dropped — and the existing fence frame depends on it. Rejecting absent volume would be more honest about missing data, but changes stored-data semantics outside this batch's invariant and could drop futures candles if the endpoint ever omits volume (the live sample carries it on all 2,000). Scope R6.
7. ⭐ **`#1030` SPLIT OUT to `3b.h-7`** *(r3 folded it)*. For splitting: round 3 showed the mark design is not one plan item — a clock clamp fails at the minute boundary, completeness must be judged against the fetch, overlapping polls and future stamps both bite — and a re-read would expose futures to `#1031` until `F-G-1`'s fix lands. Capture-only tables, no trading impact. Against: the instrument is ready now. **I split.**
8. ⭐⭐ **THE COUNTERS SPLIT BY WHAT EACH WAS BUILT TO COUNT — DISAGREEING WITH THE O3 APPROVED AT STEP 1 AND WITH LANGSTON'S POINT 1.** He asked that **both** crypto bumps key off the return value. **For *persisted* (`:158`) I agree** — its name and `BATCH_74_SCOPE.md:109` say persisted. **For *scanned* (`:159`) I do not:** `b8eba807e` built it to count *"every WS message received OR REST candle parsed"* and recorded the choice in so many words — *"scanned = received from source, stored = persisted to DB"* — and the panel calls it *"scanned (since PID)"*. Keying it off the return value would hide from that ratio exactly the bars the guard drops. **Crypto's placement is the correct one; xStock's and the futures ticker's move.** ⇒ **Attack it if *scanned* should now mean *buffered*** — the skip column would then carry what the ratio loses.
9. ⭐ **`#1031` RE-HOMED to `F-G-1` OBJ-9 ②** *(r3 folded it as P11)*. For: ② is the approved criterion for exactly this property and it is not met — the shipped fix relies on order, which ② said not to do; `F-G-1`'s conversion is still owed, so the batch is open; and the fix is larger than a flag (P11's inputs). Against: `F-G-1` reopens at Step 3 after its observation window closed. **I re-home.** ⚠️ **If ruled otherwise, it becomes its own batch placed before `3b.h-7`.**

## 4. RESIDUALS — each with a disposition
| # | item | disposition |
|---|---|---|
| A3 | overlapping futures polls — the interval can also overlap itself (no in-flight guard, `kraken-futures-archiver.ts:213-216`) | **(5) no work in this batch** — de-duplication and upsert absorb the duplicates today; the failure case is `#1031` (`F-G-1` OBJ-9) and the re-read case is `#1030` (`3b.h-7`) |
| A3 | `perpfeed-gate-test.ts:73-80` writes an OHLC table without the guard | **(5) no work** — a hand-run seed of two literal rows into a synthetic 2025 partition, not a venue frame |
| A6 | `_recordPriceSkip`'s hard default of 40 (`active-execution-engine.ts:380`), flagged by a reader | **(5) withdrawn** — the Langston-approved design in `06560c299`, so the alert still fires when the knob cannot be read |
| A8 | the headroom gauge runs at boot only | **(5) no work in this batch** — forward coverage is the partition creators' job |
| P2 | a renamed field makes every futures candle above the mark re-evaluated each poll | **(5) stated, not designed away** — loud rather than silent; P4 throttles the log, P5 alerts once |
| R1 | the writer drops a whole chunk for any rejected row | on `#705`, as scoped |
| R5 | *persisted* counts **buffered** bars; `BUG-2026-04-30-G` shows the health line reading non-zero while zero rows landed | **(1) folded as a comment at each declaration (P3). The log token `rows_persisted_60s` is NOT renamed** — `#594`'s record, `BUG-2026-04-30-G` and `BATCH_74_SCOPE.md:109` all quote it as the health line's fixed form |
| R6 | an absent volume is stored as zero (A16) | **kept, pending Langston at J6** |

## 5–7. *(reserved)*

## 8. REVIEWER RECORD — AND THE CAP
**Round 1 — four fresh readers, CLAIM ONLY (Mode B):**
- `REVIEWER r1: claim-only · crypto counts at the caller and would overcount skipped bars · HIT: caller increments unconditionally and already counts the :106 early return; futures' catch drops buffered candles from :119 · re-derived y`
- `REVIEWER r1: claim-only · exactly one call path per OHLC producer · HIT (narrowing): perpfeed-gate-test.ts:77 inserts directly; _handleMessageForTests test-only · re-derived y`
- `REVIEWER r1: claim-only · no helper escalates on a sustained rate · HIT: in-file patterns, nearest regime-inputs.ts:206-268 and rtb-metrics-service.ts:355-380 · re-derived y`
- `REVIEWER r1: claim-only · no throttled logger reports how many lines it suppressed · no counting logger found · clean — NOT cited`

**Langston, not a gate (2026-09-11 `07:32Z`):** three points O3 did not cover — two counters, live today, the ticker twin. Re-derived at the object; narrowed by the provenance read (§0 rows 8–9, J8).

**Round 2 — three fresh readers, OBJECT at `c0b102ebf`:**
- `REVIEWER r2: object · the counters and J8's premise (C1-C6) · all hold; qualifiers: ticker scanned includes throttled snaps, row 8 dropped "OR REST candle parsed", the :688 comment names the complement, the ratio's confounds, futures re-counts after a throw · re-derived y → §0 rows 8 and 12, A4`
- `REVIEWER r2: object · the futures poller and the planned change (D1-D7) · D1-D4 and D6 hold; the set clause is value columns plus captured_at; D5 found a minute left partial on an older flush failing after a newer, on a permanent drop or shed, and on a rejected final read, and a finite future time lifting the mark; a bare < skips null uncounted; D7 re-measured 22/24/2 and 0/1/0 with open 116/116 · re-derived y → §0 rows 13 and 15, A15, A17`
- `REVIEWER r2: object · the remaining citations (E1-E8) · hold, with: the row literal (not the interface) omits fields; the client type is stale; the :421-423 rate is universe-wide, not ticker-only; row 12 omitted the unmoved mark; OBJ-7's futures wording contradicted P2; A6's release is at :183; more in-file alert patterns · re-derived y → §0 row 18, A5, A6, A7, A14, P3`

**Round 3 — one fresh reader, OBJECT at `960174839`, on r3's new design (P2's futures bullet, P10, P11, A17, J9, J10):**
- `REVIEWER r3: object · r3's futures mark and flush-lock designs · A17's citations hold with two corrections (one transient failure is enough; the ticker writer has its own timer and re-inserts committed chunks); P10's clamp fails at the next minute boundary and under a persistent future stamp; the mark must be monotonic, judged against the fetch, and read after it; overlapping polls buffer older copies under a re-read; a finally can commit a mark above unbuffered candles; P11 needs a settle handle over the whole flush, a cap while in flight, a bounded checkout and a drain that survives process.exit; F-G-1's OBJ-9 criterion ② is the property #1031 breaks · re-derived y (the clamp arithmetic; ticker-batch-writer.ts:136-139, :169; ohlc-batch-writer.ts:374-410; boot_orchestrator.ts:55-69; index.ts:1615-1660; db.ts:68-76; ecosystem.config.cjs:36; B_EXIT_GRID_REPRESENTABILITY_SCOPE.md:176) → §0 rows 15-17 and 19-20, A15, A17, P2, P10, P11, J7, J9`

⛔⛔ **THE LOOP IS AT ITS CAP.** Three rounds, and round 3 did not close the futures-mark or the flush-lock design. **Instead of patching a fourth time, both defects went to the batches their criteria belong to (J7, J9), and this batch went back to OBJ-1–OBJ-7.** ⚠️ **The r4 text — P2's futures bullet, §0 rows 15–20, A17's corrections and the two MOVED sections — was written after the cap and has had no fresh reader. You are that reader.**

---

## PLAIN-LANGUAGE SUMMARY
**What the audit found:** each of the three bar producers has one way in, so one check covers them all. The database will quietly store "not a number", so the check must be stricter than the database. The archive panel's counters were built to mean "everything received", but the producers count them differently, so the panel's "how much got stored" figure isn't comparable across them — and three of its rows show internal names instead of labels. Two bigger problems turned up underneath: the futures bar collector saves each minute while it is still in progress and never goes back for the finished version, and the bar writer's retry can put an older copy of a minute over a newer one.

**What the plan does:** one shared check stops bad bars before they're saved; every rejected bar is counted and shown on the panel, and a symbol that keeps sending bad bars raises a real alert. All three producers count the same way, and the panel shows proper labels. Two misleading comments and one misleading alert message get corrected. The two bigger problems are not fixed here — the review showed each needs a careful design of its own — so the futures fix becomes its own batch, and the writer fix goes back to the batch whose own rules already required it.
