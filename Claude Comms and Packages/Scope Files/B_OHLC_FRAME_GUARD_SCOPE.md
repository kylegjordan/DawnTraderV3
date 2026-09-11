# B-OHLC-FRAME-GUARD — SCOPE (`#1028`)

change-class: non_architecture

> **Owner:** CC-C · **Opened:** 2026-09-11 · **Status:** Step 1 — awaiting Langston · **Plan:** `PHASE_19_PLAN` row `3b.h-6` *(PROPOSED — Langston to confirm)*
> **Rule 23 fix-on-find.** Surfaced by critical alert `b48a743f` (`OHLC archive writer failing PERMANENTLY — xstock_spot`), fired `2026-09-11T05:33:02Z`.
> **NOT A HOTFIX, judged against `workflow-hotfix` §1:** test 1 (broken NOW) fails — one flush, then 615 successful xStock flushes; test 2 (waiting causes real harm) fails — one occurrence in ~14 days of instrumentation; and §2 item 5 (symptom of a larger design fault) is YES — `#950`. *"If in doubt, it is a batch."*

---

## 1. WHAT IS BROKEN — in plain terms
When Kraken's WebSocket sends a one-minute price bar that carries a symbol and a timestamp but **no price**, our archiver turns the missing price into the literal text `"undefined"`. The database rejects it, and the writer throws away **the whole batch** of bars it was about to save — including the good ones. **Those bars cannot be fetched again.**

## 2. THE MECHANISM — cited at `origin/migration/aws-supabase`
| site | code |
|---|---|
| `server/services/passive-archive/equity-spot-archiver.ts:85` | the only entry check: `if (!data?.symbol \|\| !data?.interval_begin) return;` — **it tests the KEYS, never the PRICES** |
| `equity-spot-archiver.ts:92-95` | `open: String(data.open)` · `high` · `low` · `close` — **no guard.** `String(undefined) === "undefined"` |
| `equity-spot-archiver.ts:96-98` | `volume: String(data.volume ?? '0')` · `vwap: data.vwap != null ? … : null` · `tradeCount: data.trades != null ? … : null` — **guarded.** ⇒ **three of seven numeric fields protected; the four price fields not** |
| `shared/schema.ts:4989-4993` | `open`/`high`/`low`/`close`/`volume` are **`.notNull()`**; `vwap` `:4994` and `tradeCount` `:4995` are nullable |
| `server/services/passive-archive/ohlc-batch-writer.ts:292-306` | one `db.insert(...).values(slice).onConflictDoUpdate(...)` per 1,000-row chunk — **a single bad row fails the whole chunk** |
| `ohlc-batch-writer.ts:326` | classified PERMANENT, `rows.length` dropped, NOT retried — **correct for the rows as written** |

⛔⛔ **WHY THE OBVIOUS FIX IS WRONG, AND THE SCHEMA FORCES IT:** mirroring the `vwap` guard — `data.open != null ? String(data.open) : null` — **does not fix this.** The price columns are `NOT NULL`, so a `null` is rejected exactly as `"undefined"` is. **The error message would change; the whole-flush drop would not.** ⇒ **the only correct fix is to reject the malformed frame at the producer, before it is ever buffered.**

## 3. MEASURED — object, population, reach
| measurement | result |
|---|---|
| `error.log`, reach `2026-09-11 00:00:01Z` → `~06:05Z` | **1** `xstock_spot PERMANENT flush failure` (`05:33:02Z`, 10 rows); **0** for `crypto_spot` |
| `out.log`, reach `05:13:50Z` → `06:05:09Z` | **615** successful `xstock_spot` flushes, **616** `crypto_spot` — writer healthy on both, still landing at `06:05:07Z` |
| `xstock_spot_ohlc_1m`, `interval_begin` last 6h | **18,664** rows, latest `05:49:00Z` |
| every permanent-writer alert ever raised, any class | **1** — this one. ⚠️ **The alerting only exists since `F-G-1` OBJ-9 (`98640f00a`, 2026-08-28), so first ALERT is not first OCCURRENCE.** |
| bars per minute `05:20`-`05:46Z` | `05:33` = **40**, inside a 36-55 band; **0** NULL numerics in 1,560 rows. ⛔ **NON-DISCRIMINATING: the band swings ±10, so a 10-bar loss is invisible at this resolution. Not cited as "no loss".** |

## 4. PROVENANCE (MANDATORY 1.b) — original intent, quoted verbatim
**Introducing commit, found by `git log -S "open: String(data.open)" --reverse` (not path-limited) and confirmed by `git blame -L 87,98`:** `ce4a7e408`, 2026-05-01, *"B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)"*:
> *"Continuous 1-min OHLC + ticker-snapshot capture across three asset universes, persisted to month-partitioned dump tables for B70 archival takeover later. **NO signal-pipeline impact, NO admission gates, NO consumers in v1 — pure passive accumulation.**"*

⇒ ✅ **THE UNGUARDED FIELDS WERE NOT CARELESS IN THEIR ORIGINAL CONTEXT.** In a dump nobody read, a lost bar cost nothing.
⛔ **THE COMPONENT CHANGED ROLE UNDERNEATH THE CODE.** `xstock_spot_ohlc_1m` is now read by the bar aggregator (`ohlc-aggregator.ts:277`, `DISTINCT ON` over open/high/low/close/volume) and the xStock bar cache (`xstock-ohlc-cache.ts`, which writes `xstock_spot_ohlc_15m_snapshot`), which the **scanner reads to generate signals** (`scanner.ts:593`). ⇒ **a lost 1-minute bar can mis-state the high, low, close or volume of a 15-minute signal bar.**
**This is `#950`'s exact fault** — *"the xStock feed was built as an archive that was to share no state with trading, and became the trading feed without a decision."* ⇒ **`#1028` is a symptom of `#950`.**

**CORPORA ACTUALLY SEARCHED:** `git log -S` + `git blame` (origin); `RUNNING_ISSUES` (`#704`, `#705`, `#950`); `SYSTEM_IMPACT_MAP` §B74; `SYSTEM_MANUAL` (grep); `PHASE_19_PLAN`; a repo-wide census of every writer and reader of the tables. **NOT searched: `bridge/canonical/`** — B74 is dated 2026-05-01, AFTER the 2026-01/02 governance change, so the canonical corpus does not cover it. **NOT searched: `BATCH_CATALOG`.**

**DISPOSITION (of the five):**
| component | disposition |
|---|---|
| the price-field handling in `parseOhlcBar` (both spot archivers) | **(2) relevant, but needs updating to today's intent** — a no-consumer dump became a signal input |
| the *"OHLC bars are REST-replayable"* comments | **(2)** — true of the futures legs, false of both spot classes |
| the batch writer's whole-chunk drop | **(1) still correct as a writer** — see residual R1 |

## 5. MANDATORY 1.a — ARCHITECTURAL READ, AND WHAT IT FOUND WRONG
⛔ **`SYSTEM_IMPACT_MAP` §B74 IS STALE ON THE LOAD-BEARING POINT.** It still reads *"NO signal-pipeline integration; substrate accumulation only."* **The 1-minute table now feeds the 15-minute signal bars.** ⇒ **governance objective OBJ-6.** ⚠️ **Its writer line refs are also stale** (`ohlc-batch-writer.ts:147-164`, `:105-114`) — the file was reworked by `F-G-1`.

## 6. EXISTENCE CHECK — does a frame guard already exist?
**No.** Repo-wide, tests excluded: the only entry check in either spot `parseOhlcBar` is `symbol` + `interval_begin` presence. **No validator of the price fields exists anywhere on the OHLC ingest path.** ⚠️ *(Checked deliberately, because `#1025` and `3b.f-c` §12 were both cases of proposing to build something already built.)*

## 7. §9.5(a) CENSUS AT `bufferOhlcBar`
| question | members |
|---|---|
| **who WRITES** | **3 callers:** `crypto-spot-archiver.ts:107` · `equity-spot-archiver.ts:87` · `kraken-futures-archiver.ts:86` |
| **which carry the `String(undefined)` defect** | ⛔ **2 of 3 — both spot archivers, byte-identical.** Crypto has **0** failures only because Kraken's spot feed has not sent a bad frame. |
| the third | `kraken-futures-archiver.ts:91-94` passes typed REST strings (`open: candle.open`) — **NOT this mechanism**, but an absent field would violate `NOT NULL` and drop the chunk the same way. **Covered by the same validator for free.** |
| **who READS** `xstock_spot_ohlc_1m` | aggregator, xStock bar cache → 15m snapshot → scanner, eval-cycle, `vts-runner`, `vts-service`, exit-strategy replay, freshness monitor, drift dashboard |
| **who DELETES** | `b75-retention-sweep.ts` (partition-level, retention) |
| **who SCHEDULES** | WS event-driven (both spot) · 60 s REST timer (futures) · 5 s flush timer (writer) |
| **re-fetch path** | ⛔ **exactly ONE — `pollOhlcOnce`, futures only.** Both spot classes are WebSocket-only ⇒ **a dropped spot bar is unrecoverable.** |

---

## 8. OBJECTIVES AND VERIFICATION CRITERIA

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | **ONE exported validator** — an OHLC frame is complete only if `open`, `high`, `low` and `close` are each present AND parse to a **finite** number. **One implementation, one module.** | Unit test: numeric string passes · number passes · `undefined` fails · `null` fails · `""` fails · `"NaN"` fails · non-numeric string fails · `"0.00000001"` passes |
| **OBJ-2** | **All THREE producers call it and SKIP an incomplete frame before `bufferOhlcBar`** — so a bad frame is never buffered and can never take good rows down with it. | Unit test: a mixed input of good and bad frames buffers exactly the good ones, unchanged. Code read: the validator is the only gate in all three. |
| **OBJ-3** | **A skipped frame is COUNTED and LOGGED — never silent** (`#704`/`#546`): a per-class counter, plus a rate-limited stderr line naming the symbol and WHICH field was absent. Counter exposed through the **existing** `get*Stats()` getters — no new endpoint. | Unit test: counter increments once per skipped frame. Staging: counter readable. |
| **OBJ-4** | **Correct the false "OHLC is REST-replayable" generalisation in code** — `ticker-batch-writer.ts:154` and the `ohlc-batch-writer.ts` rationale block. | Diff review. |
| **OBJ-5** | **Correct the alert's over-generalisation** — `ohlc-batch-writer.ts:167` says *"every further flush for this class will fail the same way"*; a malformed-ROW fault is per-batch, not per-class. | Diff review. |
| **OBJ-6** *(Step 10)* | **`SYSTEM_IMPACT_MAP` §B74 and `SYSTEM_MANUAL`** — record that the 1-minute table feeds the 15-minute signal bars, and the frame guard. Fix the stale writer line refs. | Content diff at the ref. |

**BEHAVIOUR:** a well-formed frame's path is **byte-identical**. The change can only OMIT a frame that would have failed anyway. ⇒ **readers gain the innocent rows that used to be dropped with it — strictly more correct data, never less.**

## 9. ⛔ JUDGEMENT CALLS I WANT ATTACKED
1. **"Finite number" is the right strictness, not "truthy".** A validator that rejects too much silently drops GOOD bars — the one way this fix could make things worse. Is there a legitimate Kraken frame with a zero or empty price field that should be kept?
2. **Counter exposure:** stats getter only, or also rendered in `PassiveArchiveSection`? Rendering it gives Step 7 a UI surface; it also widens the diff into the UI chain.
3. **Including the futures producer.** It is not the same mechanism. I include it because one validator closes the whole class at every producer — fixing two of three identical-shaped sites would make the third look investigated.
4. **Placement at `3b.h-6`, NOT folded into `#950`.** `#950` is xStock-only and waits on `#943`; **crypto carries the identical defect**, and the guard is correct however the feed is later rebuilt.

## 10. OUT OF SCOPE — EACH WITH A DISPOSITION (§9.4)
| # | item | disposition |
|---|---|---|
| **R1** | **The writer's whole-chunk drop** stays a latent amplifier for any OTHER malformed-row cause | **(2) add as an item to `#705`**, the writer-failure issue it belongs to |
| **R2** | **The 10 bars lost at `05:33:02Z`** | **(5) no work — unrecoverable:** no re-fetch path exists for spot, and the dropped rows were not logged, so they cannot even be identified |
| **R3** | **`#950`'s feed rebuild** | untouched — `#1028` is recorded there as a symptom |
| **R4** | **Critical alert `b48a743f`** | ⛔ **deliberately NOT acked** — its dedupe key `ohlc-writer-permanent-xstock_spot` would swallow the next genuine failure. **Resolved with evidence when the guard deploys.** |
