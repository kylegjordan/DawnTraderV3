# B-BOOK-CHECKSUM-CIRCUIT-BREAKER — COMPLETION REPORT (`#1220`)

**Owner:** CC-B (NEW Claude) · **CC-B pre-sprint item 1** (Kyle-assigned 2026-10-20, list locked `e400fed12`) · **change-class:** `architecture`
**Status:** ✅ **CLOSED 2026-10-20** — Step 8 CONFIRMED and Step 11 CONFIRMED by Langston (two documentary changes folded, no further round).
**Deployed:** `725a7f3f53bbc1758dfbf73090d2e6681147c015`, `dt-deploy --by cc-b`, 2026-10-20T21:50:37Z. Rollback target `7501f4f55`.
**CI:** run `39503085325` on `725a7f3f5` — TypeScript Check (baseline gate) ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅ (per job).
**Review:** Step 2 APPROVED at `11ac8817` (conditions applied `a70f8fb1e`); Step 4 APPROVED r3 at `5c5abef81` (r1 `cdf74ab5d` → BLOCKER-1 → r2 `2182b10fa` → condition → r3).

## ⚠️ Open at the top
- **The acting half has never fired live.** Before the deploy: 19,507,455 checksum checks, 0 mismatches, 71 symbols (Langston's read). Suspect → resync → untrusted and the re-check are **fence-verified only** (39 tests). No silence on staging is evidence for them (Step-4 FINDING-2, recorded on `#1220`). A live arm needs a deliberate, pre-registered forced desync on one symbol.
- **The fleet guard** (one aggregate alert, a cap on concurrent untrust episodes, a bulk re-check, and the snapshot-vs-call-time map residual) — `#1226` `B-BOOK-TRUST-FLEET-GUARD`, owner CC-B, CC-B pre-sprint item 5 (slotted on Kyle's delegation, `87c567ee9`).
- **The reconnect re-subscribes open positions only, not RTB-queued symbols** — `#1222` `B-PRICE-FEED-COVERAGE`, pre-sprint item 3.
- **Ref vs deploy:** the review branch is ahead of the deployed `725a7f3f5`; the only runtime file touched since is `kraken-websocket-adapter.ts` +2/−2 inside a docblock (the 68/71 comment). No undeployed behaviour.

## Objectives (scope §2)

| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | Confirm before acting, then stop at once | **YES** | one book-only resync per episode stage, de-duped by an in-flight entry; confirmation on the fresh snapshot after one precision re-read; on untrusted the book channel is cancelled, no further book request, ticker untouched, cache emit stopped, ticker rung refuses `ws_book` sides. Tests 1-9, 18-19, p7b 3/4/8 |
| 2 | Untrusted in every lane that reads it | **YES, with one change of form** | the four hardcodes pass the required `bookTrusted`; a non-trusted book refuses as `book_untrusted` — **a new value, not `book_not_eligible`** (Langston Step-2 C-5: the contract separates "did not use" from "was bad"); `depth-source` blocks the open through `getBookForFill` → null. **Change of form (Langston Step 11, disposition 5):** the exit book-age stamp records null rather than the word "untrusted" — `bookAgeMs` is a price-AGE field and "untrusted" is not an age, and the same payload records the trust 90 lines down (`bookTrusted: krakenWebSocketAdapter.isBookTrusted(_lsSym)`, `active-execution-engine.ts:2985`) |
| 3 | One alert per episode | **YES** | `book_untrusted:<symbol>:<episode ISO>`, breakage/warning, metadata with both CRCs, precision, counts, state; resolved by the re-check route on a restore, never acked. Test 5 asserts the key shape; test 15 the resolve |
| 4 | Terminal state; precision re-learned | **YES** | untrusted is left only by `POST /api/active-engine/book-recheck/:symbol` (AssetPairs re-read, one subscribe, restore on match); trust survives `stop`, `softResubscribeAll` and reconnect (test 17); a reconnect gives an untrusted symbol its ticker and not its book (test 10). The dormant cluster deleted (watchdog, `sentinelResets`, `softResubscribe`, `triggerSoftResubscribe`). **Changed in review:** the precision re-read is ONE shared all-pairs request with transport retries (Langston BLOCKER-1), not one call per pair |
| 5 | The 10-13 cause | **YES — superseded by a better-supported cause** | pre-audit: the cause reads as the self-sustaining wipe loop (volume and storm) carried by an orphaned socket; Arm A refuted for S/USD only (52,225/52,225), OOB/CAP undecidable; Arm B's predictions undecidable (stdout rotated); both orphaning accounts repaired identically by plan 1. Precision bound rider: shipped (test 13) |
| 6 | Counters and text | **YES** | the per-symbol counters and totals on `/api/active-engine/book-integrity`; every listed false statement corrected (routes docblock, `price-cache.ts` sidesWriter, the adapter docblock and `note`, `level-basis.ts:400-401`, both "eligible by construction" comments); the skip count in the `syms` union. ⚠️ The drift probe **skips** a non-trusted book (its guard, `kraken-websocket-adapter.ts:1122`), so "0 fires" and "excluded from the sample" print the same — record-only, no live harm, but the absent-as-valid class (`#546`). **HOME: a third item on `#1226` `B-BOOK-TRUST-FLEET-GUARD`, owner CC-B, CC-B pre-sprint item 5** — the probe records the skip as its own outcome |
| 7 | Tests, each negative with its twin | **YES** | `b-book-checksum-circuit-breaker.test.ts` 39 tests; the re-pointed p7b tests; b507; the fixtures declaring trust. Locally: all 30 affected files, 461 tests |
| 8 | Step 7 | **YES** | `updatesApplied` 1,080 = attempts 1,080 = matches 1,080 per symbol; `skippedNoPrecision` 0 reported; 0 confirmed, 0 untrusted, 0 resyncs. Record `Claude Comms and Packages/Change Lists/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_STEP7_2026-10-20.md` |
| — | Step 8 (Langston) | **CONFIRMED** | on the pre-registration (FINDING-2): re-derived at 7 symbols / 1,531 s — 57,867 attempts = 57,867 matches enumerated per symbol, 0 mismatches, 0 crossed, trust all `trusted`, every new counter 0; book and ticker subscribe SETS identical; plan 1 unexercised (no reconnect since the deploy), as pre-registered |

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (to Kyle, 2026-10-20 evening): 68 coins' books.** **NOW: 71** at Langston's later read (the live set grows as symbols are subscribed). **REASON:** the two reads were taken at different times on a growing population.

## New findings (settled)
- **The paper Open Trades "Source" column labels every xStock REST although each is priced from Kraken's xStock live feed** (`routes.ts` `sourceLabel` asks the crypto socket, which defaults to REST for a symbol it has never seen). Measured 2026-10-20 17:3xZ: 19 of 19 xStocks `priceSource kraken_equities_ws`, ages 0.03-1.5 s. **DISPOSITION: decision required — no work until Kyle slots it** (surfaced to him 2026-10-20; `#1230`).
- **39 Kraken pairs are filed under one name by the book handler and looked up under another** (31 BTC-quoted, 6 non-USD DOGE, 2 CHF), so their books could never be served. Langston traced the live path at Step 8: the check's input IS the live handler input, so the 39 are real; the cause is `REVERSE_ASSET_TRANSLATIONS` translating only `XBT → BTC` and only on the base. Fail-safe and dormant (none subscribed; the failure is a missing book, never a wrong price). Bug taxonomy outcome (2). **DISPOSITION: decision required — no work until Kyle slots it** (`#1229`, Langston's proposed `B-SYMBOL-KEY-QUOTE-TRANSLATION`).
- The Source-column finding above is **`#1230`**, widened by Langston: it also labels a `kraken_rest` crypto price **WS** (GLMR/USD, 22:16Z). Langston's proposed home: an item on `B-PRICE-SIDE-BY-JOB` (CC-C). Kyle's slot.

## Governance files (copied from the Step-10 ledger)
CHANGE-CLASS: architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry written at deploy (`ab5d9d191`), set to CLOSED at Step 11 |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-20 entry (`ab5d9d191`), set to CLOSED at Step 11 |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ | §0a CC-B row: list locked (`e400fed12`), item 5 slotted (`87c567ee9`), item 1 marked CLOSED with this report |
| T1 | PHASE_19_PLAN.md | N/A | a sprint pre-sprint item; PHASE_19_PLAN takes no new rows |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | own position block updated; no project-consensus truth changed |
| T1 | the batch SCOPE | ✅ | r6, approved |
| T1 | the batch PRE_AUDIT | ✅ | r6 at `a70f8fb1e`, approved |
| T1 | COMPLETION_REPORT | ✅ | this report |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: the locked list, item 5, status board moved to OLD Claude; CC-A, CC-C, CC-INFRA not mine |
| T1 | Langston's MEMORY.md | ✅ | written by Langston at Step 11: `937e6f96bba0 → 1df5d7de4eaf`, 75,061 → 75,059 B (net −2 B, paid for by three closed-batch collapses). ⚠️ My earlier "blocked by the breach" was wrong: the write gate is a NON-INCREASE gate (`langston-memory-write:552-561`, `if delta <= 0`), not an absolute ceiling — a write that does not grow the file always passes |
| T2 | SYSTEM_MANUAL.md | ✅ | §8 items 3-4 (book integrity as built; one socket); §18.0.1 note (every job refuses a non-trusted crypto book) |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | §2.1 breaker entry (entry points, state, refusing readers, `getLatestPriceData` reports rather than refuses); registry row S29; the monitor's `triggerSoftResubscribe` line |
| T2 | RUNNING_ISSUES.md | ✅ | `#1220` deploy note, FINDING-2 and the Step-11 line; `#1221`-`#1224` re-homed; `#1226` filed and slotted (with Langston's r3 residual); `#1229` and `#1230` SURFACED for Kyle |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-20-A |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | the breaker's windows (30 s resync, 60 s re-desync, 2/8 s retries) are liveness constants, not tunables |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule |
| T2 | STORAGE_POLICY.md | N/A | no table or retention change |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | the VTS's book read changed only through the shared accessor |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | the method did not change |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | the reviewer's build did not change |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | 2026-10-20 entry + three verbatim archives |
| T2 | MISTAKE_PATTERNS.md | N/A | trailers in the batch's commits are the record |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | the new key follows the protocol (resolve-only, never ack) |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board unchanged; the item-5 card was created in Backlog |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check did not run in this batch |

## Forward reads (named, falsifiable)
- **The first real episode** — the acting half has never fired; its first live suspect/untrusted event is read against this report's tests.
- **GLMR repeat subscribes (Langston, disposition 1):** before the deploy GLMR/USD took 36 book re-subscribes at ~5 s intervals (21:28:33 → 21:49:29); after it, one subscribe per symbol, zero repeats. **If GLMR-shaped repeats reappear, plan 1 did not hold.** Window so far: 25 minutes.

## Honest residual
- The confirm path, the re-check and the one-socket guard are proven by tests and code review, not by a live event.
- The 30 s resync timeout, the 60 s re-desync window and the 2/8 s retry delays are judgements with no measured distribution behind them (n = 1 episode).
- The drift probe skips a held book silently until `#1226`'s third item lands (above).
