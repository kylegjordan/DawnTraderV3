# B-PRICE-FEED-TRUTH — COMPLETION REPORT

**Batch:** `B-PRICE-FEED-TRUTH` · owner CC-C · pre-sprint Stage 1 ("feed truth under the exits") · issues `#1047`, `#1076`, `#1146`, `#1173` · **change-class `architecture`** (scope header).
**State:** Steps 1-10 done; closes on Langston's Step-11 confirmation. Written 2026-11-06, three weeks after its last verification — the batch was finished on 2026-10-15 and never written up (PM Claude's open-work list, 2026-11-06).

## OPEN ITEMS AND LIMITS — STATED FIRST
1. **Two of the four planned increments were NOT built here, by decision, not by omission:** **I1** (an age bound on re-served prices) was taken over and shipped by `B-PRICE-STALENESS-BOUND` (sprint row 33, ✅ CLOSED 2026-10-20 on its pre-registered Sunday-reopen read); **I4** (the xStock recorder following the daily list) was moved out by Kyle on 2026-10-07 to sprint row 31 (`B-XSTOCK-LIVE-FEED`). Neither is graded here.
2. **`#1146` is half discharged.** Its gap (1) — prices filed under a key the venue does not use ("phantoms") — is fixed by I2 (phantom count 0 on 14 of 14 one-minute readings). Its gap (2) — no millisecond stamp on a REST response, so how often a REST write replaces a newer WebSocket price cannot be bounded — is untouched and stays at sprint row 14a `B-KRAKEN-PRIMARY-KEY-RESOLUTION`. It is the same missing instrument as `B-REST-SIDES-TO-CACHE`'s V4/V9, which is at its Step 8 with Langston.
3. **I2's original Step-7 criterion had a third clause that was retired, not met:** the readyToBuy skip rate split by bucket composition. Coltrane ruled it obsolete because the later `B-RTB-REFRESH-LIVE-PRICE` switch made it unable to discriminate; no substitute rate was inferred.

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED
Prices reaching the engine should be real and current. Two of its fixes shipped:
- **I3 (`#1047`) — the Kraken WebSocket adapter stopped throwing away whole messages.** The venue's subscribe acknowledgement for the `instrument` channel carries no symbol; the adapter tried to upper-case the missing symbol and the parse error discarded the message (about eleven a day). It now handles a symbol-less acknowledgement first, refuses a missing or non-text pair before the resolver (counted by kind), counts a book update with no symbol, and logs the first 300 characters of any message that still throws. Code `d77474310`, Step-4 condition `f4512ad0d` (`server/exchanges/kraken/kraken-websocket-adapter.ts`).
- **I2 (`#1076`, `#1146` gap 1, `#1173`) — every REST price is asked for and filed by Kraken's own pair list.** The price cache now asks only for pairs the venue lists (others are not sent, counted `unlisted`) and files each answer by the venue's own key, never by a guessed normalisation (an answer it cannot place is not filed, counted `unresolved`). The readyToBuy refresh sends only crypto symbols to Kraken REST (`restEligible`), because one xStock symbol in a REST ticker batch voided the whole batch (`#1173`). Nothing is sent until the venue's pair list has loaded. The five "LOCKED MODULE — DO NOT MODIFY" headers now say changes go through the workflow (`#1076`). `getPrice` (single-symbol REST read) was deleted (rule 18, `DELETED_COMPONENTS_LOG` 2026-10-07). Code `40da5121b`, Step-4 conditions `2063f0d4f`.

## 2. EVERY STEP, WITH ITS EVIDENCE
- **Step 1:** scope r2 — Langston 2026-10-07 12:10Z (`0e1defc95`): I2, I3, I4 proceed; I1 sent back and re-scoped (r2 confirmed 12:24Z, `09de55b70`). Kyle moved I4 out the same day (`ad0561d09`).
- **Step 2:** pre-audit and plan, one document per increment (`Scope Files/B_PRICE_FEED_TRUTH_PRE_AUDIT.md`): I3 approved 12:29Z; I2 r1 sent back 13:30Z, r2 PROCEED 13:42Z (`6619dcba2`, `d781c5e6e`).
- **Step 3:** I3 `d77474310`; I2 `40da5121b`.
- **Step 4:** I3 APPROVED by Langston 12:45Z at `d77474310`, condition C1 folded at `f4512ad0d`; I2 APPROVED 22:20Z at `40da5121b`, conditions folded at `2063f0d4f`. Change lists `Change Lists/B_PRICE_FEED_TRUTH_I3_CHANGE_LIST.md`, `…_I2_CHANGE_LIST.md`.
- **Steps 5-6:** both shipped in CC-C's 2026-10-10 release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (live 2026-10-10T11:59:29Z; CI `38049753797`, all four jobs green); both commits are ancestors of it (checked 2026-11-06) and of today's staging head `0f4835b5a`.
- **Step 7 (CC-C, 2026-10-15):**
  - **I3 PASS:** window 2026-10-14T03:58:39Z → 2026-10-15T05:32:10Z, wholly after the deploy and inside the retained logs — 21 `Sub OK: instrument (all pairs)` acknowledgements and 0 `[KrakenWS] Error parsing message`; positive control: the same search finds 6 failures before the deploy (2026-10-10 01:11-10:33Z).
  - **I2 PASS:** window 2026-10-15T05:32:11Z → 05:47:00Z — 14 of 14 one-minute ledger lines satisfy `written = requested − unlisted`, `missing = unlisted`, phantoms 0, unresolved 0 (10 of 14 with a REST member); 14 of 14 show `ineligible > 0` (the mixed RTB caller reached); 56 readyToBuy refreshes and 0 batch errors; 54 of 56 paper RTB passes priced.
- **Step 8 (second pass): Coltrane** independently reproduced both at exact ref `24f24f3f2` and APPROVED, 2026-10-15T05:59:12Z (`7aed44147`; KD-34 places the second reviewer's reproduction here). For I2 he also ruled the bucket-composition clause obsolete (item 3 above).
- **Step 9:** none needed.
- **Step 10:** this turn (ledger below).

## 3. OBJECTIVES
| increment | result | evidence |
|---|---|---|
| **I1** a bound on how old a re-served price may be | **NOT IN THIS BATCH — delivered by `B-PRICE-STALENESS-BOUND`** | sprint row 33, CLOSED 2026-10-20 (`Batch Completion/B_PRICE_STALENESS_BOUND_COMPLETION_REPORT.md`) |
| **I2** every price-cache key is the Kraken primary key | **YES** (with `#1146` gap 2 outstanding, item 2) | Step 7 above; Coltrane APPROVED |
| **I3** the WS adapter stops dropping whole messages | **YES** | Step 7 above (21 / 0, control 6); Coltrane APPROVED |
| **I4** the xStock recorder follows the daily list | **MOVED OUT** (Kyle 2026-10-07) | sprint row 31 `B-XSTOCK-LIVE-FEED` |

## 4. NEW FINDINGS
None owed by this batch. A stale figure was swept: the xStock/crypto ticker collision set holds 16 USD and 16 EUR pairs since the 2026-10-01 re-audit (`3n.q3` P9; `XSTOCK_SPOT_KRAKEN_COLLISIONS`), but the System Impact Map and System Manual still said 17 (9 + 8) or named 5. My first Step 10 corrected one line; Langston's Step-11 send-back found nine more, and a re-search by content found two more (SIM, the xStock bar-cache entry and the P19-B4a line). All twelve now read the current count, plus one stale list in `RUNNING_ISSUES` annotated. The drift itself came from `3n.q3` P9, which re-audited the set without sweeping the documents.

## 5. GOVERNANCE — THE STEP-10 LEDGER
CHANGE-CLASS: architecture

| tier | document | verdict | line |
|---|---|---|---|
| R | scope | ✅ | `Scope Files/B_PRICE_FEED_TRUTH_SCOPE.md` r2 (Step 1) |
| R | pre-audit | ✅ | `Scope Files/B_PRICE_FEED_TRUTH_PRE_AUDIT.md` (I3, I2, I4 groundwork) |
| R | completion report | ✅ | this file |
| R | `BATCH_CATALOG.md` | ✅ | new entry |
| R | `PHASE_HISTORY.md` | ✅ | new entry |
| R | `SYSTEM_MANUAL.md` | ✅ | §16 Unified Price Cache: `getPrice` gone, `getBatch` takes `restEligible`, filing by the venue's pair list, refuse-until-ready; the collision count corrected at all five live-state lines (§4) |
| R | `SYSTEM_IMPACT_MAP.md` | ✅ | §2.1 the adapter's symbol-less acknowledgement and bad-pair counting; §2.2 the price cache's dependency on the venue pair list, the RTB refresh's class split, the new ledger counters; the collision count corrected at all seven live-state lines (§4) |
| judged | `RUNNING_ISSUES.md` | ✅ | `#1047` and `#1076` closed; `#1146` gap 1 discharged, gap 2 stays at row 14a; `#1173` already closed (2026-11-04) |
| judged | `DELETED_COMPONENTS_LOG.md` | ✅ | `getPrice` entry written at I2 (2026-10-07), archive `_archive/deleted-code/price-cache.getPrice.ts.removed` |
| judged | `CHANGES_AND_FIXES.md` | N/A | not a hotfix |
| judged | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item moves |
| judged | `ADJUSTMENT_FRAMEWORK.md` | N/A | no tunable, no epoch |
| judged | `PHASE_19_PLAN.md` | N/A — no row there | a sprint-era batch |
| plan | `SPRINT_TO_LIVE_PLAN.md` | ✅ | Stage-1 line 3 (`#1047`) closed; row 14a's status states what I2 delivered and what is left |
| — | shared `MEMORY.md` | N/A | no new consensus truth |
| — | `MEMORY_CC_C.md` | ✅ | position |
| — | Langston's `MEMORY.md` | N/A | it holds no line on this batch (checked 2026-11-06) |
| T1 | session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA`) | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` |
