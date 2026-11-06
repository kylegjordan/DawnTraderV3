# B-REST-SIDES-TO-CACHE — COMPLETION REPORT

**Batch:** `B-REST-SIDES-TO-CACHE` · owner CC-C · sprint row 14 · Phase-19 row `3n.l` (a piece of `B-PRICE-SIDE-BY-JOB`) · issues `#1056`, `#1060`, `#1076` · **change-class `architecture`** (scope header, re-declared r4).
**State:** Steps 1-10 done; closes on Langston's Step-11 confirmation. Written 2026-11-06.

## OPEN ITEMS AND LIMITS — STATED FIRST
1. **V4 and V9 — how often a REST write replaces a newer WebSocket price — were NOT measured.** The millisecond stamps exist at both REST writers (`live-pricing-adapter.ts:961`, `price-cache.ts:428`) and `updateFromRest` holds both sides' stamps at the overwrite (`:847-860`); what is missing is a counter that emits the comparison. **Carried to sprint row 14a** (`#1146` gap 2), Langston-ruled at Step 8. ⚠️ V9 has a second, separate blocker the counter will not lift: 11 of its 12 both-writer symbols had no writes in the window.
2. **V6 is partly unformable.** The price-source funnel is not keyed by symbol, so the pre-registered cold-only duty cycles cannot be formed. The leg that mattered is discharged (item below). Keying the funnel is an item on row 14a. The entry-fill rung was NOT RUN — zero opportunity (no `active_entry_fill` row in that lifetime).
3. **V7 (WS outage behaviour) NOT RUN** — no outage occurred; the fixture is the test, as pre-registered.
4. **V1 cannot be re-run after 2026-10-10:** its positive control was the phantom rows, which `B-PRICE-FEED-TRUTH` I2 removed. A re-read now proves the counter, not the fix.
5. **FINDING-3, by design:** on symbols also written by the WebSocket, a REST write replaces the WS sides with receipt-stamped ones, so the ticker rung runs on our receipt clock after it — it can no longer age out during a venue silence (Step-4 condition C3). Named in the scope; this is the case row 14a's counter will size.

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED
REST prices — the poller's and the price adapter's — should carry the real bid and ask into the shared price cache, under the right key, and every cached row should say which feed wrote its sides.
- **Increment 1** (`c7f90c2fd`, conditions `ea31f25cd`): the static symbol map's REST keys for `GBP/USD` (`ZGBPZUSD`) and `ETC/USD` (`XETCZUSD`) corrected, so their REST sides are written under their own keys; six dead pairs removed (`DELETED_COMPONENTS_LOG` 2026-09-26); a `sidesWriter` field on every cached row, set at all five write sites; a write-key ledger at the three REST sites (`server/services/market-data/rest-write-keys.ts`).
- **Increment 2** (`69c9d8d1b`, conditions `77b171d90`): one pairwise rule for stated sides (`server/services/market-data/stated-sides.ts`: both sides finite and positive, or neither); the adapter's REST read passes its sides and `updateCache` routes REST to `updateFromRest`; `sidesWriter` names the channel (`rest_poller`, `rest_adapter`, `ws_ticker`, `ws_book`); the touch-price ladder and the F2 feed-agreement split read the writer, not `lastSource`; the liveness counters count instruments, not keys.
- **Step 5:** `f49a934bc` (Langston's nit fixed), CI `36278341585` at `77b171d90`, all four jobs success.

## 2. EVERY STEP, WITH ITS EVIDENCE
- **Step 1:** scope r5 approved with seven conditions (`de10d9030`); OBJ-9 split to `3n.l-a`.
- **Step 2:** `Scope Files/B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` — Part A approved with four conditions (`224c807fa`); Part B approved 2026-09-26 22:03Z with six conditions, P14 ruled 22:11Z (`536b1e8bd`).
- **Step 3:** increment 1 `c7f90c2fd`; increment 2 `69c9d8d1b`.
- **Step 4:** each increment APPROVED with four conditions, no blocker (`Change Lists/B_REST_SIDES_TO_CACHE_INC1_CHANGE_LIST.md`, `…_INC2_CHANGE_LIST.md`); conditions met at `ea31f25cd` and `77b171d90`, verified by Langston 23:07Z.
- **Steps 5-6:** CI above; shipped in release deploy A, `ea456ad40936b1fbde463e43e473d3ff11432ba0`, live 2026-10-02T20:38:00Z (`dt-deploy --by cc-b`); `f49a934bc` is its ancestor. ⚠️ The plan row said deploy B and "Step 7 owed" until 2026-11-06 — both wrong (`MISTAKE` recorded in `52f78cc66`).
- **Step 7 (CC-C, 2026-10-02 20:38-20:52Z, 480 `[3n.l][WRITE_KEYS]` lines):** V1, V2, V3, V8 PASS; V7 not run; V4, V6, V9 inconclusive — `Change Lists/RELEASE_DEPLOY_A_STEP7_CCC.md` row 11, extracts in `RELEASE_DEPLOY_A_STEP7_CCC/`.
- **Step 8: CONFIRMED by Langston 2026-11-06 (Discord `1568241002647658638`, read at `f47a07332`)**, re-deriving V1, V2, V3, V8 from the extracts. He made V1 stronger (14/14 conditional: the 14th vtsSimulation pass never asked for GBP/USD), placed V2's control in the vtsSimulation bucket only, granted V4/V9's carry with the reason corrected (item 1), refused V6's restatement onto fleet-wide shares, and discharged its exit-trigger leg himself: `ticker_bbo:rest_adapter` = 15 of 2,140 walks fleet-wide, so the cold-only count is ≤ 15 and the warned rise at the 2 s rung is **refuted**.
- **Step 9:** none.
- **Step 10:** this turn.

## 3. OBJECTIVES (verification items V1-V9, as pre-registered)
| item | result | evidence |
|---|---|---|
| V1 GBP/USD written under its own key, no phantom | **PASS** (14/14 conditional) | Step 7; Langston |
| V2 the writer census names the REST poller; WS writers labelled | **PASS** (control in vtsSimulation only) | Step 7; Langston |
| V3 no `8a-P2` escalation across a >2 s WS silence | **PASS** (4 silences, 0 escalations; the rail fired in 10 earlier logs, control) | Step 7 |
| V4 / V9 REST-over-newer-WS bound | **NOT FORMED** — carried to row 14a as a counter | item 1 |
| V5 fixtures, mutations, tsc baseline | **PASS** | Step 4/5 |
| V6 per-rung duty cycles on cold-only symbols | **PARTIAL** — exit-trigger concern refuted (≤ 15 / 2,140); duty-cycle legs not formable; entry fill not run | Step 8 |
| V7 WS outage behaviour | **NOT RUN** — no outage; the fixture is the test | Step 7 |
| V8 the per-lane split prints and reconciles | **PASS** (book absent 824/824 at active birth) | Step 7; Langston |

## 4. NEW FINDINGS
None owed. Langston noted at Step 8 a fourth write site in the extracts, `site=getBatch`, carrying `missingDistinct=2[BTC/CAD,ETH/CAD]` on 13 of 13 lines — the altname class that `B-PRICE-FEED-TRUTH` I2 fixed on 2026-10-10; no work.

## 5. GOVERNANCE — THE STEP-10 LEDGER
CHANGE-CLASS: architecture

| tier | document | verdict | line |
|---|---|---|---|
| R | scope | ✅ | `Scope Files/B_REST_SIDES_TO_CACHE_SCOPE.md` r5 |
| R | pre-audit | ✅ | `Scope Files/B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` (Parts A and B) |
| R | completion report | ✅ | this file |
| R | `BATCH_CATALOG.md` | ✅ | new entry |
| R | `PHASE_HISTORY.md` | ✅ | new entry |
| R | `SYSTEM_MANUAL.md` | ✅ | crypto chain steps 5-6 corrected at Step 3 (OBJ-4); now the symbol-resolution tier table: tier 0 "manually verified" qualified — it held two wrong REST keys and six dead pairs until this batch |
| R | `SYSTEM_IMPACT_MAP.md` | ✅ | §2.2 the price cache (writers by channel, the pairwise sides rule, the REST routing, instrument counters, the write-key ledger); §2.3 the static map (the two corrected keys, the six removed rows) |
| judged | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-11-06-D` (judged applicable at Step 4: the GBP/USD and ETC/USD keys were a defect) |
| judged | `RUNNING_ISSUES.md` | ✅ | `#1056`, `#1060`, `#1076` amended at Steps 3-4; `#1146` (gap 2 is this batch's V4/V9) corrected 2026-11-06 |
| judged | `DELETED_COMPONENTS_LOG.md` | ✅ | the six dead rows, 2026-09-26 entry |
| judged | `PHASE_19_PLAN.md` | ✅ | row `3n.l` closed |
| judged | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item moves |
| judged | `ADJUSTMENT_FRAMEWORK.md` | N/A | no constant, fee, epoch or booking rule changes |
| plan | `SPRINT_TO_LIVE_PLAN.md` | ✅ | row 14 closed, report linked; row 14a carries V4/V9's counter and V6's funnel keying |
| — | shared `MEMORY.md` | N/A | no new consensus truth |
| — | `MEMORY_CC_C.md` | ✅ | position |
| — | Langston's `MEMORY.md` | N/A | no line on this batch (checked 2026-11-06) |
| T1 | session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA`) | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` row 14 |
