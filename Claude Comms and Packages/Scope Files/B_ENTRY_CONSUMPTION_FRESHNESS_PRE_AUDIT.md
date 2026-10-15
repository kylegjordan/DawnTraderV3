# B-ENTRY-CONSUMPTION-FRESHNESS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-ENTRY-CONSUMPTION-FRESHNESS` · pre-sprint P1b · sprint row 40 entry half
**Owner:** ANALYST Codex / CC-C
**Audit ref:** `origin/migration/aws-supabase` = `159d16134a805eb9c9840bc1b4d199b88fb43f00`
**Change class:** sub-batch; high-risk execution seam, narrow surface
**Scope authority:** `B_ENTRY_CONSUMPTION_FRESHNESS_SCOPE.md` r2, Step 1 approved by Coltrane at `ff5e4a928bea39cee1f1557e77410c6d2b7a77ff`

## 0. PREVIOUSLY STATED → NOW

| item | previously stated | now, after audit | reason |
|---|---|---|---|
| post-capture waits | the provenance comment says “three awaits” | **Three conditional awaits can follow xStock snapshot acquisition before paper consumption:** the spread yardstick inside the still-running gate at `active-execution-engine.ts:661`, xStock liveness at `:5508`, then paper VOG at `:5617`. Crypto skips the first two but VOG can wait up to four seconds. | Fresh review found the internal post-warmth yardstick read; the historical “three awaits” is accurate for the full xStock paper path. |
| final order boundary | `OrderPlacer.openOrder` described as side-effecting | There is **one production immediate-open call** (`active-execution-engine.ts:5659`). The current paper implementation is locally side-effect-free, but the typed port is the live-swap boundary and may place a real order; therefore the guard must dominate the call. | `SYSTEM_IMPACT_MAP.md:989-997` explicitly records this live-swap obligation. |
| seven-day entry population | 118 taker rows, average gate age 4,170 ms, maximum 14,462 ms | **118/118** seven-day `closed_trades` rows whose realised `chosen_entry_mode='taker'` carried `entry_book_age_ms`: crypto **28**, average **489 ms**, maximum **3,144 ms**, zero at/above 4,000 ms; xStock **90**, average **5,315 ms**, maximum **14,461.869 ms**, one at/above 13,000 ms. | Class separation shows where ordinary remaining headroom exists; these are gate-time ages, not consumption ages. |
| `#684` | “~60% at any moment” over 15 seconds | That headline was withdrawn. The same 480-symbol population was 59.6% only across the opening transition and 4.8% in homogeneous RTH. The 15,000 ms standard remains unchanged. | `RUNNING_ISSUES.md:3835-3895`; a mixed regime window cannot calibrate this batch. |
| runtime evidence | gate-time age is available | The live schema has `entry_book_age_ms`; a positively controlled column check found no `entry_book_consumption_age_ms`. Current logs have no consumption-age fact, so natural expiry rate is not measurable before instrumentation. | Schema readback used existing `entry_book_age_ms` as the positive control; source census confirms the only durable writer records `_gate.snapshot.ageMs`. |

No earlier number is silently carried forward. All counts below name their object and population.

The shared branch advanced from `8dcc36006` to `159d16134` during this audit. The two intervening `B-CREW-ACCESS-HARDEN` commits changed only the SSH-keyholder tooling and its change list; a path-level diff found no execution, schema, migration, manual, ledger or export input used below.

## 1. AUDIT QUESTION AND ANSWER

**Question.** Can the exact depth snapshot that passed the class-specific warmth/sufficiency gate become older than its governed limit while the engine performs later checks, and still reach the immediate fill?

**Answer: yes.** `_evaluateOpenDepthGate` obtains a snapshot whose `ageMs` is fixed at its source read (`active-execution-engine.ts:560-586`; `execution/depth-source.ts:29-114`). After the first warmth pass, the gate itself may await the xStock spread yardstick (`active-execution-engine.ts:657-667`); the engine then may await xStock price-discovery liveness and paper venue validation before passing that same snapshot’s asks to the sole production `orderPlacer.openOrder` call (`active-execution-engine.ts:5490-5662`). Nothing advances or rechecks the age at the call boundary.

The repair is not a new threshold and not a new snapshot. It is a conservative monotonic age calculation on the already-certified snapshot, checked immediately before the call. It preserves the DB-resolved **5,000 ms crypto / 15,000 ms xStock** limits and refuses before any order-side effect when the same evidence has expired.

## 2. SIX-SOURCE AUDIT

### 2.1 Actual code at the shared ref

#### Entry points first

| entry point / boundary | production population | result |
|---|---:|---|
| `orderPlacer.openOrder(` | **1 call** under `server/`, excluding tests: `active-execution-engine.ts:5659` | Sole immediate active-open fill-computation boundary. It receives `_gate.snapshot.asks`; the current `PaperOrderPlacer` is pure, while the interface is the future live-placement seam. |
| `_evaluateOpenDepthGate(` | **1 caller + 1 definition**: `active-execution-engine.ts:5490`, `:560` | One open gate supplies the later fill snapshot. |
| `getDepthSnapshot(` | **3 callers + 1 definition**: portfolio-manager flatten `active-portfolio-manager.ts:305`; engine open `active-execution-engine.ts:577`; engine close `:3988`; definition `depth-source.ts:59` | The snapshot type is shared. Only the open caller gets the new consumption check; close and operator-flatten behavior is unchanged. |
| `resolveFillDepthGateConfig(` | **2 callers + 1 definition**: open `active-execution-engine.ts:565`; close `:3976`; definition `depth-gate-config.ts:59` | Open already has the authoritative limit. The pass result should carry that attempt’s limit to the final check rather than perform a second policy read. |
| `validatePaperOrderWithVenue(` | **1 caller + 1 definition**: `active-execution-engine.ts:5617`; `venue-validate.ts:122` | Shared paper call; network validation is bounded by `VALIDATE_TIMEOUT_MS=4000`, while unmapped pairs visibly skip. |

The positive control for these counts is the named production hit in each set. Searches were limited to real `server/` source and excluded tests; no denied path or failed read is treated as a zero.

#### Writer / reader / mutator / deleter / scheduler census

| object | writers / creators | readers / consumers | mutators / deleters | schedulers / lifetime |
|---|---|---|---|---|
| `DepthSnapshot` | One factory, `getDepthSnapshot`; crypto returns the in-process WS book, xStock returns the newest ticker row, and operator-flatten may request the last fully two-sided row. | Open gate, normal close, operator flatten. Warmth/sufficiency helpers read fields; immediate open later reads `asks`. | No post-return production mutator or deleter found. The arrays are passed by reference into the placer, so identity must be fenced rather than silently replaced. | Request-local only; no scheduler and no persistence. |
| `fill_depth_gate` config | Migration-seeded DB rows; `depth-gate-config.ts` builds cached typed config. | Open and close gates. | Module-local cache refreshes on TTL; no caller mutation found. | 60-second hit cache / 5-second fail-closed null cache. |
| depth-block telemetry `_gateBlocks` | `recordDepthGateBlock` has two current callers: depth refusal and xStock liveness refusal. | diagnostics/tests via `getDepthGateBlockStats`. | Module-local increments/reset-for-test. | Process lifetime; no external scheduler. |
| RTB `openFailedByStage` | `recordOpenFailed`; current call sites include depth, liveness, venue and fill failures. | RTB diagnostics. | Lazy increment makes a newly typed stage safe even if not pre-seeded, but the stage initializer should be updated for complete zero-valued output. | Process lifetime singleton; no durable refusal row. |
| `closed_trades.entry_book_age_ms` | Immediate taker write at `active-execution-engine.ts:5938`; pending-maker later-fill write at `:1851`. | Export and analysis; no runtime decision reader found in the bounded production census. | Append/write with trade lifecycle; no retroactive mutation planned. | Durable DB record. |

**Mutual exclusion.** A non-marketable maker takes `_b72cPendingMaker=true` at `active-execution-engine.ts:5545-5553`, enters the maker branch at `:5647`, and does not call `openOrder`. A marketable maker with positive stored taker EV flips `_b72cEffectiveMode='taker'` at `:5533-5539` and reaches the same sole call as a direct taker. There is no second immediate-fill scheduler or alternate production `openOrder` call.

#### Exact defect mechanism

- Crypto `DepthSnapshot.ageMs` is computed as application `Date.now() - updatedAt` by the live WS adapter (`kraken-websocket-adapter.ts:3605-3619`). xStock computes database `NOW() - captured_at` inside the query and currently clamps a negative result to zero (`depth-source.ts:77-96`); the writer stamps `captured_at` with application `new Date()` (`equity-spot-archiver.ts:323-328`). Both returned values are fixed numbers afterward.
- The current warmth assessor compares only that fixed number to `config.warmthMaxAgeMs` (`depth-source.ts:206-218`).
- The xStock spread yardstick awaits a database read after the first warmth/sufficiency checks. XStock liveness can then consume up to its DB-governed 2,000 ms query timeout. Crypto paper VOG can consume up to 4,000 ms. All of that elapsed time is absent from the fixed age.
- The existing `entry_book_age_ms` comment and write correctly admit it is gate-time, not fill-time (`shared/schema.ts:1910-1926`; `active-execution-engine.ts:5929-5944`). Reusing that column for a later age would rewrite its meaning.

### 2.2 Runtime logs and live database

- Live `module_constants` readback: `fill_depth_gate/crypto_spot/warmth_max_age_ms=5000`; `fill_depth_gate/xstock_spot/warmth_max_age_ms=15000`. No threshold change is proposed.
- Live xStock liveness readback: `query_timeout_ms=2000`, `window_ms=2700000`, `min_moves=1`, `min_snaps=5`, `enabled=true`.
- Live schema positive control: `closed_trades.entry_book_age_ms` exists. The proposed `entry_book_consumption_age_ms` does not yet exist.
- Seven-day realised-taker population: **118 rows** total and **118 non-null gate ages**. By class: crypto 28 / xStock 90, with the class-specific age distributions reported in §0.
- Recent PM2 logs were readable and showed normal runtime activity. They cannot answer “how old was the snapshot at consumption?” because the current code emits and persists no such fact. This is an instrument limitation, not evidence that expiry never occurs.

### 2.3 System Impact Map

`SYSTEM_IMPACT_MAP.md:77` inventories the shared book-update clock, depth-block map and config cache. §9.14 (`:989-998`) defines `OrderPlacer` as the typed paper/live swap boundary and records the general rule that a guard must precede a future live placer rather than inspect its result afterward. The map has no consumption-age contract today. It is also stale in saying every order passes through the port and paper always returns `filled`: pending-maker placement bypasses it, and current paper open can return `partial`/`rejected`.

**Audit disposition:** update §9.14 and the state registry at Step 10. The original “LOW” blast radius describes the earlier behavior-identical port extraction; this batch changes admission on a high-risk open seam and is **high-risk/narrow**, not LOW.

### 2.4 System Manual

`SYSTEM_MANUAL.md:848-850` documents the 5-second / 15-second depth gate and the xStock liveness gate immediately after it. The manual also records paper spot as venue-vetted internal filling through the OrderPlacer port (`:4529`, `:4564`). It does not claim or describe a second freshness check at consumption.

**Audit disposition:** preserve all current policies and add the final consumption check, its reason taxonomy, and the two distinct age fields at Step 10.

### 2.5 Ledgers and completion records

- `BATCH_CATALOG.md:368` records B4b.1’s one-fetch/same-book depth walk and DB-resolved 5s/15s warmth gate.
- `P19_B4b_1_COMPLETION_REPORT.md` records the deliberate single-fetch identity and depth-walked fill.
- `P19_B6_6_COMPLETION_REPORT.md:15-38` records depth-first xStock liveness and its 2-second fail-closed read.
- `B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md` and commit `279f4c2c...` record that `entry_book_age_ms` is the gate-time reading, not the later fill instant.
- `RUNNING_ISSUES #684` keeps the threshold decision open as a risk-envelope question, withdraws the mixed-window “60% at any moment” claim, and ratifies the guard as working as designed.
- `PRE_SPRINT_SIMULATION_TRUTH_PLAN.md:38` and `SPRINT_TO_LIVE_PLAN.md:209` place this exact class-agnostic consumption repair in P1b with thresholds unchanged.

No ledger contains an already-built final consumption guard. This is not a duplicate threshold-calibration batch.

### 2.6 Canonical corpus and git archaeology

The canonical architecture’s positive control is `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:650-682`, which describes the historical paper sequence as safety checks, fixed slippage and record creation. A bounded search of the canonical bridge finds no `DepthSnapshot`, `OrderPlacer`, `fill_depth_gate`, `entry_book_age_ms`, or consumption-freshness contract. Those components postdate the canonical corpus; the corpus is historical context, not present-tense authority for this seam.

Git intent is explicit:

1. `b74526dc...` deliberately introduced the one-fetch/same-book depth gate and walk.
2. `2398702e...` deliberately inserted xStock liveness after depth.
3. `adf06d028...` deliberately inserted paper VPG/VOG before internal fill.
4. `279f4c2c...` corrected the provenance description: entry age is gate-time, earlier than consumption.
5. `b48aef51...` split pending makers from immediate fills.

**Provenance result: Rule-24 outcome (3), narrowly.** The original same-snapshot identity remains intentional. Later approved waits made the original gate-time freshness proof incomplete. The correct update extends age over elapsed local time; it does not fetch an uncertified replacement or relax the limit.

## 3. DESIGN DECISIONS

### D1 — Conservative monotonic anchor, captured before the source read

Add required `ageReadStartedMonoMs` to `DepthSnapshot`, set from `performance.now()` at the start of `getDepthSnapshot`, before either the crypto accessor or xStock SQL query.

At consumption:

`consumptionAgeMs = snapshot.ageMs + (performance.now() - snapshot.ageReadStartedMonoMs)`

The helper fails closed if the gate age, anchor, limit, current monotonic reading, elapsed value, or sum is non-finite; if the gate age or limit is negative; or if elapsed time is negative. It passes at `age <= limit` and refuses at `age > limit`, matching the current warmth boundary.

**Why before the read:** xStock’s `ageMs` is evaluated by database `NOW()` during the query. An anchor taken after the promise resolves would omit database-to-process return latency. A pre-read monotonic anchor includes the whole query/return interval and may double-count the small request-to-DB-evaluation prefix. That overstatement is conservative; an understatement at an order boundary is not. Crypto receives the same class-agnostic rule and a similarly tiny conservative prefix.

**Why monotonic, and its exact reach:** `Date.now()` can move backward under wall-clock adjustment. `performance.now()` is already used throughout this Node runtime for elapsed durations and is process-local. It prevents the **post-anchor elapsed component** from shrinking and the helper rejects an overtly negative base age, but it cannot detect a positive undercount already embedded by producer/application/database clock skew or a rollback before the base-age sample. The snapshot never crosses a process boundary, so no cross-process epoch is needed or claimed; this batch does not claim to repair upstream clock synchronisation.

### D2 — Carry the attempt’s resolved limit forward

On a passing `_evaluateOpenDepthGate`, return the exact `warmthMaxAgeMs` used for that attempt beside the snapshot. Do not re-query configuration after the waits: a TTL rollover must not make one attempt use two policies, and a second DB/config read would add latency at the boundary it is trying to protect.

### D3 — One final guard immediately before the sole call

In the non-pending branch, after the internal yardstick, liveness, VPG/VOG and pre-fill synchronous work, call a pure `assessConsumptionFreshness` immediately before `orderPlacer.openOrder`. No awaited work may sit between the check and the call. At today’s ref this bounds the paper VWAP computation: `PaperOrderPlacer.openOrder` only walks the supplied asks and returns a result (`order-placer.ts:63-90`). At live cut-over the same dominance is mandatory at the real venue-submission boundary; the live adapter must not insert unbounded work between guard and send.

On refusal:

- do not call `openOrder`;
- return typed stage `CONSUMPTION_FRESHNESS`;
- increment `recordOpenFailed` exactly once;
- call `recordDepthGateBlock` exactly once with a distinct bucket such as `stale_at_consumption` or `consumption_clock_invalid`;
- emit one structured `[B-ENTRY-CONSUMPTION-FRESHNESS][CONSUMPTION_BLOCK]` line naming symbol, class, realised arm, gate age, elapsed age, current age and limit.

On pass, emit the corresponding structured `CONSUMPTION_PASS` line. The realised arm is `direct_taker` or `maker_to_taker`, not merely the stored chosen mode.

### D4 — Separate durable fact; no history rewrite

Add nullable `closed_trades.entry_book_consumption_age_ms` / `entryBookConsumptionAgeMs` with no default and no backfill. It records the final conservative age only for an admitted immediate depth-walk. It remains NULL for pre-cutover rows and pending-maker fills. Preserve `entry_book_age_ms` unchanged as the source/gate-time fact.

Add the new primitive to `scripts/codex-export/export-data.sql`; no analytics or decision reader is added in this batch.

### D5 — No waiting window

Functional proof comes from deterministic clock/delay injection and a side-effecting fake placer that must remain uncalled on refusal. Step 7 then reads the first bounded post-deploy seam population by class and realised arm. A zero natural-expiry count is interpretable only beside positive `CONSUMPTION_PASS` opportunity counts. This creates no five-session/eight-day hold and blocks no unrelated reviewed deploy.

The bound is intentionally the instant the selected book is consumed for paper VWAP (and, by contract, immediately before future live venue submission), not the later durable trade/position writes. Those writes include further reads after the price has already been computed; re-age-checking there would not undo the consumed fill.

## 4. IMPLEMENTATION PLAN — EACH ITEM BACK-REFERENCES THE AUDIT

### P1 — Snapshot clock and pure assessor (from §2.1, D1)

- Extend `DepthSnapshot` with required `ageReadStartedMonoMs`.
- Capture it once at the top of `getDepthSnapshot`; thread the same value through every crypto/xStock return, including operator-flatten fallback.
- Add `assessConsumptionFreshness(snapshot, limit, nowMonoMs=performance.now())` as a pure discriminated result carrying `fresh`, `ageMs|null`, stable reason kind and detail.
- Do not alter `assessWarmth`, source timestamps, book levels or source identities.

### P2 — Carry policy and dominate the order call (from §2.1, D2-D3)

- Extend the passing open-gate result with the resolved `warmthMaxAgeMs`.
- Add the check in the non-pending arm immediately before the sole `openOrder` call.
- Add `CONSUMPTION_FRESHNESS` to `OpenFailStage` and its initialized stage list.
- Emit one pass/block event per immediate attempt with class and realised arm; reuse existing counters without adding a scheduler or singleton.

### P3 — Durable admitted provenance (from §2.1/2.2, D4)

- Add nullable schema field and one forward migration plus registered MANIFEST entry; no default/backfill.
- Carry the passing result into the immediate trade create and persist it beside `entryBookAgeMs`.
- Keep pending-maker writes NULL by omission and document the cohort split in schema/code comments.
- Update the raw-primitives export column list.

### P4 — Tests and mutation fences (from §1, §2.1, D1-D5)

1. Pure helper matrix: exact boundary pass; +1 ms block; elapsed addition; xStock query-prefix conservation; wall-clock changes after the base-age sample cannot reduce elapsed age; negative base age and backward/non-finite monotonic states fail closed; positive upstream clock skew remains an explicitly unclaimed case.
2. Source returns: crypto, newest xStock, and last-two-sided flatten all carry one pre-read anchor.
3. Immediate arms: direct taker and maker→taker call the final guard; pending maker does not claim consumption.
4. Delay mutations: injected 2-second xStock liveness delay and 4-second crypto VOG delay expire a near-limit snapshot; `openOrder` fake call count stays zero.
5. Identity: a newer available book after the first gate is not silently substituted; the certified asks are the walked asks.
6. Source fence: exactly one production `orderPlacer.openOrder` call, immediately dominated by `assessConsumptionFreshness`, with no await between them.
7. Configuration fence: no new `5000`/`15000` freshness literal; existing migration/live config remains the authority.
8. Schema/migration/export fence: nullable column, no default/backfill, registered manifest, export includes the field.

### P5 — Documentation and verification (from §2.3-2.5, D5)

- Step 10 updates SIM §9.14/state registry, System Manual fill-safety section, catalog/plan/history, `#684` cross-reference and completion report.
- Step 7 verifies migration/readback, HTTP/boot health, structured pass/block events and admitted DB stamps over a bounded reached-seam population.
- Verification reports attempts by class and realised arm, every refusal reason, and the detector’s deterministic positive control. It does not wait for a calendar quota.

## 5. FILE SET PLANNED FOR STEP 3

| file | planned change |
|---|---|
| `server/services/execution/depth-source.ts` | monotonic anchor + pure consumption assessor |
| `server/services/active-execution-engine.ts` | carry limit; final pre-call guard; telemetry; persist final age |
| `server/services/rtb-metrics-service.ts` | new typed stage + initialized zero bucket |
| `shared/schema.ts` | nullable consumption-age field and exact semantics |
| `drizzle/migrations/2026-10-15-b-entry-consumption-freshness.sql` | nullable column, comment, no backfill/default |
| `drizzle/migrations/2026-10-15-b-entry-consumption-freshness-rollback.sql` | rollback companion |
| `drizzle/migrations/MANIFEST.txt` | register forward migration |
| `scripts/codex-export/export-data.sql` | export new primitive |
| focused unit/fence test files | helper, paths, identity, side-effect and migration coverage |

Governance documents land at their workflow steps, not prematurely in Step 3.

## 6. RISKS, FAILURE DIRECTIONS, AND EXCLUSIONS

| risk | control / failure direction |
|---|---|
| anchor taken too late undercounts xStock query return latency | capture before read; conservative overcount |
| wall clock moves after the base-age sample | elapsed time uses monotonic clock; invalid/backward monotonic elapsed fails closed |
| wall-clock skew/rollback already embedded in a non-negative base age | not detectable from this snapshot contract; explicitly unclaimed and not laundered into a stronger clock-synchronisation guarantee |
| config changes during an attempt | carry the threshold used by the original pass |
| guard after a future live side effect | structural fence requires guard immediately before sole port call |
| new read changes book identity | no refetch; same asks object reaches the placer |
| pending maker falsely stamped as consumed | branch exclusion and NULL contract |
| pending-maker marketability uses the placement snapshot before the immediate/pending split | Explicitly out of this immediate-consumption sub-batch; carry the fresh reviewer’s lead into P1c’s maker-entry audit. If the immediate arm is selected, this batch’s final check still refuses any expired snapshot before consumption. |
| refusal double-counts I3 | one `recordOpenFailed`, one depth-reason increment, one return |
| logs rotate before analysis | admitted fact is durable; refusal durability remains explicitly deferred to Stage-4 `#1083` |
| unrelated policies drift | config/source fences; no change to liveness, VPG/VOG, sufficiency, dispatch, exits or P1c |

## 7. ACCEPTANCE BAR FOR STEP 2

- Audit covers all six required sources and the complete component census.
- The final plan preserves same-snapshot identity and the current DB thresholds.
- xStock database-query latency and wall-clock rollback have explicit, testable treatment.
- All immediate arms are covered and the pending-maker exclusion is precise.
- Verification is deterministic plus bounded post-deploy evidence; no calendar observation hold.
- A fresh-context reviewer has challenged the load-bearing claim; its hit is re-derived and recorded below before dispatch.

## 8. FRESH-CONTEXT REVIEWER

`REVIEWER: HIT — the one-pass fresh reader found the post-warmth xStock yardstick await, proved current PaperOrderPlacer is pure rather than presently side-effecting, and limited monotonic protection to elapsed time after the anchor; all three were re-derived at active-execution-engine.ts:657-667/5659-5662, order-placer.ts:63-90, kraken-websocket-adapter.ts:3605-3619 and depth-source.ts:77-96, then folded into §§0, 1, 2.1, D1, D3 and §6.`
