# B-RTB-PROMOTION-RETRY-STORM — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r1)

change-class: architecture

**Batch:** `B-RTB-PROMOTION-RETRY-STORM` · row 9j · CC-B list 2a · `#1136` + the KD-84 pool fix · **Owner:** NEW Claude (CC-B) · **Written:** 2026-11-16, Step 2.
**Scope:** `B_RTB_PROMOTION_RETRY_STORM_SCOPE.md` (r1 `322c8d348`). The binding conditions are in its §8: Langston's Step-1 PROCEED, C1-C7 (Discord 1571855803785281608).
**Ref read:** `origin/migration/aws-supabase` at `6c89aa87a`; quoted lines are from that ref.
**No code lands before B-ENTRY-GATE closes** (KD-87).
**Split agreed with ANALYST, Langston CONFIRMED with corrections (Discord 1571856577038655540 / 1571856655015223389 / 1571856723105550377; Langston 1571859426703441994):**
- **The anchor** is `lifetime.pmUptime` (in `level-basis-funnel.jsonl`) of the first process generation whose `lifetime.buildSha` carries this batch's code, identified by `(buildSha, min pmRestartCount)`. The sha alone is not an identity: generations 707 and 708 both carry `8fac86e5e`.
- **Why not the other stamps (his corrections):**
  - `restart_time` is a pm2 counter, not an instant (C-1).
  - `deployed_at` is written after the post-condition poll, about 10 s late, so it lands on the wrong side (C-2).
  - `processStartedAt` jitters by 1 ms between snapshots (C-3).
- **Declared fallback (his C-4):** if the first 9j generation lives less than the funnel's 15-minute cadence, it writes no snapshot. The anchor is then pm2's `pm_uptime` for that generation, and the read says which instrument it used.
- ⚠️ **Correction (mine, caught by Langston):** I wrote that "no 9j restart before 11-19T09:45Z holds by construction". It does not. `dt-deploy` lets a deploy land inside an open window if `--in-window` names it. What holds is that a 9j deploy inside 8c's week cannot happen **unnamed**. The ≥3-day segment A is ANALYST's condition. KD-87's placement (after B-ENTRY-GATE's 11-20 read) gives it more than 4 days.

MISTAKE: wrong-object [B-RTB-PROMOTION-RETRY-STORM] — "by construction" claimed for a deploy rule that only requires naming the window.

---

## 0. PREVIOUSLY STATED vs NOW

- **PREVIOUSLY STATED:** `OpenFailStage` has 23 members (scope OBJ-1). **NOW:** 22 (`server/services/rtb-metrics-service.ts:47-68`). **REASON:** Langston C5; recounted.
- **PREVIOUSLY STATED:** "33 single-line sites" (scope) / "34 `opened: false` sites" (Langston C5). **NOW:** 34 lines contain `opened: false`. One is the type declaration (`:320`); **33 are `return { opened: false … }` sites, all single-line.** The multi-line forms I allowed for in the scope do not exist (`grep -nE "^\s*opened\s*:"` returns nothing). **REASON:** both figures were right about different objects.
- **PREVIOUSLY STATED:** scope OBJ-2 verification, "a smaller later candidate that fits after a larger one does not". **NOW:** the walk follows F1, *"stop before the one that would exceed"*, for the SHARED room. A per-row refusal (the position-size cap) defers only that row and the walk continues (§4 A-5, Q-A). **REASON:** the scope line contradicted Langston's F1. Skipping on shared room would let a lower-ranked signal jump the queue.
- **PREVIOUSLY STATED:** record §8, *"Check-back: no new timer — a close emits SlotOpened → promote (`event-bus.ts:198`) plus the 30 s poll."* **NOW:** `emitSlotOpened` has **zero callers** at the ref (`git grep` over `server/`, tests excluded: definition `event-bus.ts:197`, one log-only listener `server/startup/trading-bootstrap.ts:46`). The real check-back is:
  - the `TRADE_CLOSED` handler (`active-execution-engine.ts:1194` → `checkRtbPromotion` at `:1210`);
  - `TCL_ACTIVATED` (`:1187` → `:1190`);
  - the interval (`:1231` → `:1261`);
  - the coalesced re-run (`:5694`).

  **REASON:** census (§2). The conclusion "no new timer" stands; the mechanism named was wrong.
- **PREVIOUSLY STATED (Langston Q2, ruled on a measured ordering):** *"`EV_REJECT` writes a DB row every refusal … one stuck row is 2,880 `active_trade_logs` inserts/day."* **NOW:**
  - **That holds in live mode only.** In paper, `resolveEvBlockDisposition('paper')` returns `'SHADOW'` (`server/services/ev-block-disposition.ts`), and a non-positive EV sets `_b72IsTradeable = true` after `emitEvReject` and `recordEvRejectShadow` (`active-execution-engine.ts` ~`:6078-6101`). So `EV_REJECT` never returns in paper, and the `createActiveTradeLog` at `:6117` is live-only.
  - **The paper cost of a non-positive-EV row is different: one `emitEvReject` write to the switch-on evidence sink per open attempt, and the open then proceeds.**

  **REASON:** read at the ref. His C1 (a bounded budget) stands unchanged; this corrects the object the cost was measured on.
- **NEW NUMBER, measured:** failed promotions by stage, `Failed to execute promoted signal: <stage>` in `error__2026-11-11…11-16` + `error.log` (rotated `error__D` holds day D−1, so the window is **2026-11-10 → 11-16 ~12:00Z**). Total **2,528**:

  | stage | count |
  |---|---:|
  | GUARDRAIL_BLOCK | 2,401 |
  | MAKER_MARKETABLE_DROPPED | 91 |
  | DEPTH_GATE | 31 |
  | VALIDATE_REJECTED | 2 |
  | STOP_DISTANCE_AT_FILL | 1 |
  | FILL_ECONOMICS | 1 |
  | ENTRY_WINDOW | 1 |

  Guardrail codes, `GUARDRAIL_FIRE] guardrail=` in `out__2026-11-11…11-15*` + `out.log` (a different file set and window; not added to the above): MAX_TOTAL_EXPOSURE 2,249, COOLDOWN 21, and no other code. Positive control: two codes do appear, so the instrument can see codes.

## 1. Sources read

| # | source | what was read |
|---|---|---|
| 1 | Code at the ref | the promotion loop, `executePromotedSignal`, `processSignal`, `executeSimulatedTrade`'s exits; `trade-safety.ts` checks 1-8 + `checkGuardrailRisk`; `ready_to_buy_service.ts` `promoteSignal` / `getRankedSignals` / refresh state; `storage.ts` `upsertRtbSignal`; `schema.ts` `rtbSignals`; `routes.ts` integrity / portfolio blocks; `ev-block-disposition.ts`; `obs-windows.py` |
| 2 | Runtime logs | the stage and code counts in §0; staging reflog 11-10..11-16 (deploys listed in §6) |
| 3 | `SYSTEM_IMPACT_MAP.md` | §4.3 RTB Service (status contract `#1204`; refresh service; P6/P7), §4.4 TCL Watchdog |
| 4 | `SYSTEM_MANUAL.md` | §19.0-19.3. **Contradiction flagged:** §19.2's diagram *"Check FinalScore >= 0.35 (MIN_FINAL_SCORE)"*: that check was REMOVED in the loop (`active-execution-engine.ts` *"Phase 14.1 HF8 (B1): Duplicate FinalScore check REMOVED"*), so the diagram is stale. Folded into OBJ-7. **Silence flagged:** neither map documents that a refresh pass and a promotion can contend for one row (the `isSignalRefreshing` latch). The SIM's §4.3 status contract does not mention it; folded into OBJ-7. |
| 5 | Ledger + reports | `#1136`, `#648` (withdrawn conclusions; core kept), `#1079`, `#1189`, `#508`, `#1204`, `#1063`, `#1081`; `ACTIVE_PATH_FLOW.md` promotion hop; the B-ENTRY-GATE scope's own `missed_refreshes` promise (A-9) |
| 6 | `bridge/canonical/` | **read for the RTB queue lifecycle — see A-10.** |

## 2. Census (§9.5(a)) — entry points first, then the table

**Entry points into promotion — 4 callers of `checkRtbPromotion`, and exactly one caller each of `promoteSignal` and `getRankedSignals`:**
- the `TCL_ACTIVATED` handler (`:1187`/`:1190`; bound at `:1213`, unbound at `:1284`);
- the `TRADE_CLOSED` handler (`:1194`/`:1210`; `:1214` / `:1288`);
- the interval (`:1231`/`:1261`; cleared at `:1273`);
- the coalesced re-run (`:5694`, guarded by `isRunning`).
- `promoteSignal`'s only caller is `active-execution-engine.ts:5630`; `getRankedSignals`'s only caller is `:5527` (`git grep "promoteSignal\(|getRankedSignals\("` over `server/`, tests excluded).
- The second `openSlots` at `:1248` is the interval's own pre-check. It reads `getPoolSize` and calls `checkRtbPromotion`; it **neither claims nor opens** (`:1226-1266`).
- **Mutual exclusion:** the `#508` single-flight latch (`promotionInProgress`, `:5493-5497`) serializes all four triggers. Nothing else claims.

**`rtb_signals` — who does what:**
- **Writes / creates — exactly one production path.** `queueSQESignal` (`ready_to_buy_service.ts:2517`) → `upsertRtbSignal` (`storage.ts:4490`) ← `signal-orchestrator.ts:1713`. Established by: `upsertRtbSignal` has one caller; `insertRtbSignal` was removed (`storage.ts:677`).
- **Mutates — two production paths:**
  - the refresh batch update (`ready_to_buy_service.ts:1283` → `updateRtbSignalsBatch`);
  - the upsert's conflict SET (`storage.ts:4496`).
- **Deletes — 9 distinct entry points:**
  - refresh dedup `:883`;
  - refresh bulk delete `:1266` (fill-policy rejection, unclassifiable, live-ask retirement, SQE revalidation failure, a thrown error);
  - `expireSignal` `:1638`, via `reEvaluateQueue`, from a diagnostics route;
  - `promoteSignal` stale_plan `:1700`;
  - **the claim `:1739`**;
  - `clearQueue` `:2201` (from two diagnostics routes, `clearReadyToBuy` on stop / reset / start-new, and the C14 sanitize);
  - `routes.ts:11436` `/active-engine/clear-data` (direct storage, bypassing the service).

  ⚠️ **Only three of them also clear the in-memory refresh state** (`:1274`, `:1701`, `:1745`). The other six leave a stale `signalRefreshStates` entry: a pre-existing memory leak, bounded by distinct signal ids (A-8).
- **Schedulers against it — 7:**
  - the Central Clock refresh (`rtb-refresh-service.ts:220`, every 15 ticks);
  - the TCL watchdog clock (`tcl_watchdog.ts:126`);
  - `checkSignalThresholdLive` after each refresh and each upsert;
  - the promotion interval;
  - `TCL_ACTIVATED`;
  - `TRADE_CLOSED`;
  - the C13/C14 validation intervals (reads only).
- **In-memory per-row state:** `signalRefreshStates` (`ready_to_buy_service.ts:497`, key `${mode}:${signalId}`). Written only by the refresh (`:940-941`), read by `promoteSignal` (`:1672`) and `getRankedSignals` (`:1967`).

`REVIEWER:` none spawned for §2. Both censuses came from helper sweeps at the ref (object-handed, not fresh-claim readers), and I re-derived the four load-bearing members myself:
- the single caller of `promoteSignal` and of `getRankedSignals`;
- `emitSlotOpened`'s zero callers;
- the `:1248` site;
- the refresh latch site at `:940`.

**NOT RE-READ:** the full nine-member delete list beyond `:883`, `:1266`, `:1700`, `:1739` and `clearQueue`.

## 3. Audit findings

**A-1 — The claim deletes the row, and the refresh latch is its only guard.** `promoteSignal` deletes at `:1739` after the P11 (`:1680-1705`) and P7 (`:1707-1733`) checks, and clears refresh state at `:1745`. Under Q1 (a) the claim no longer deletes. The refresh, the ranker and the claim then need one shared "claimed" marker, set and checked **with no `await` between check and set** (Node runs one turn at a time, so check-then-set inside one synchronous block is atomic).
- The refresh's latch site at `:940` is exactly where the claimed check belongs: *"`refreshAndRank` is the ONLY path that REFRESHES a signal — sole caller of `acquireRefreshedInputs` and sole writer of `lastRefreshedAt`"* (`:933-938`).
- `stale_plan` keeps its delete. It is a by-design retirement (record §4, F-1).

**A-2 — `executePromotedSignal` throws away the stage (C2).**
- `:5785` returns `` `${outcome.stage}: ${outcome.reason}` `` as a string.
- `:5711` (`invalid_target`) and `:5787` (the catch-all) return no stage at all.
- The restore decision needs the typed `OpenOutcome`.

**A-3 — Every failure exit, classified (C1, C2, C5; Q2's cost axis).** The full exit table, with side effects per exit, is §5. The classes are:
- **DISCARD** — the cause is in the row and recurs identically on every retry. The row is deleted with its stage, and the in-memory state is cleared.
- **PRE-CLAIM** — the check moves above the claim (C3/Q4). A deferral there costs no claim and no write; it is **not an attempt** (`recordAttempt` stays inside `checkGuardrailRisk`). A pre-claim refusal whose cause is in the row (no stop, stop above entry) DISCARDS rather than defers, or it would sit at the top of the ranking forever.
- **RESTORE-GLOBAL** — the cause is the whole engine, not the signal: engine not running or stopping, no system context, a guardrail read failure, money held unavailable, unresolved fill-economics settings, the dry-run toggle. The row is restored **and charges no budget**. Charging it would exhaust every row in the pool during one engine stop or one bad settings row, which is the KD-84 loss rebuilt from the other side.
- **RESTORE-CHEAP** — a state that can clear, refused **before** the Kraken `validate=true` call (`:6331`), so a retry makes no outbound call. Restored; **charges the budget**.
- **RESTORE-COSTLY** — a state that can clear, refused **at or after** the validate call. Each retry is one outbound venue call in paper (crypto only: xStock has no pair mapping and skips before calling). Restored; **charges the budget at a higher rate** (C1, Q-B).
- **DISCARD-PARTIAL** — `TRADE_INSERT_ERROR` (`:7231`). The try at `:6678-7223` can throw AFTER `createClosedTrade` (`:6783`), `createActiveOpenPosition` (`:6906`) or `recordOpen` (`:7158`), so a retry could open a second time on half-written state. Always discarded. **This is `#1063`'s ABCD case, the second driver `#1136` recorded.**

**A-4 — The attempt budget (C1, not waivable), a persisted counter.**
- **The column:** `rtb_signals.promotion_attempts integer NOT NULL DEFAULT 0`. It is written ONLY by the restore path, and it is **left out of `upsertRtbSignal`'s conflict SET** so that it survives a re-issue. The precedent is `consecutive_unpriced_passes` (B-ENTRY-GATE inc B, `schema.ts:2221`) and the documented keep-list at `storage.ts:4504-4507`. The structural test `b-rtb-admission-newest-wins.test.ts`, which holds the SET and insert lists equal, gets the new column on its "kept on purpose" side.
- **Why it must survive a re-issue:** the orchestrator re-issues the same setup into the same row (§19.0, one row per `(mode, symbol, strategy)`). A counter that a re-issue reset would never reach its cap, and that is the `#1136` re-mint loop in a new place.
- **The cap:** `module_constants` `rtb_promotion.max_promotion_attempts`, keyed by asset class, fail-closed. A missing or invalid row means a cap of 0: the first charged failure discards, which is today's behaviour, logged once per class per process (the P11 / P7 off-log pattern).
- **Pre-registered values (Q-B):** see §6.
- **At the cap:** DISCARD with `promotion_attempts_exhausted:<last stage>`, logged.
- **The residual, named, not hidden:** a discarded setup can be re-issued by the orchestrator as a NEW row with a counter of 0. The re-mint rate is then bounded by the generation cadence × the cap, not by the 30-second pass. OBJ-5 counts per signal id, which makes it visible.

**A-5 — The pre-claim predicates (C3, Q3, Q4).**
- **How:** the predicate is lifted out of each check, and the orchestrator `checkGuardrailRisk` stays put with every counter.
- **What is hoisted:**
  - kill switch (`trade-safety.ts:133`);
  - stop-loss required (`:149`), which discards;
  - max per asset (`:171`);
  - cooldown (`:207`), whose predicate needs `getLastClosedAtForSymbol`: one DB read per candidate per pass, with at most `openSlots` candidates;
  - position-size cap (`:335`), per row;
  - total exposure (`:614`), the shared room.
- **Not hoisted:**
  - LPCP (`:500`) is dormant and returns `{ ok: true }` unconditionally (`:509`). There is nothing to hoist; its re-enable-or-delete home is `#518`.
  - Correlation (`:837-850`) depends on `riskConcentrationAnalyzer` weights that the orchestrator itself refreshes at `:840`. It fired 0 times in the §0 window (0 `CORRELATION_EXPOSURE` among the codes). It stays post-claim as RESTORE-CHEAP.
- **The walk:**
  - a per-row refusal (position-size cap, cooldown, per-asset) DEFERS that row and the walk continues;
  - a stop-loss refusal DISCARDS that row and the walk continues;
  - shared-room exhaustion STOPS the walk (F1).
- **The pre-check's state** (positions, settings, money held, the guardrails_v2 cooldown minutes) is read ONCE per pass. A read failure means room = 0 and the pass defers everything, loudly (F6).

**A-6 — The I3 counting invariant is already broken in four places at the ref.**
- **openFailed with no attempt:** STAMP_MISSING (`:7423`) and SIZING_INVALID (`:7544`) call `recordOpenFailed` BEFORE `checkGuardrailRisk`'s `recordAttempt`. This contradicts the comment at `:7313-7314`, *"…happen BEFORE checkGuardrailRisk's recordAttempt, so they DON'T touch the I3 invariant"*.
- **An attempt with no third term:** the DUP_POSITION race at `:7022` has no `recordOpenFailed`. Neither does any throw that escapes `executeSimulatedTrade` after `recordAttempt` and returns as OTHER (`:7585`).
- **An attempt counted twice:** a throw after `recordOpen` (`:7158`) and before `:7223` records `recordOpenFailed('TRADE_INSERT_ERROR')` too.
- **Label only, count intact:** a throw from `createActiveTradeLog` at `:5918` on the block path returns OTHER where GUARDRAIL_BLOCK was meant.

**Disposition — folded into OBJ-5 (§9.4 #1).** OBJ-5's per-signal counts and C3's "counters in one place" both rest on I3 reconciling. Leaving it broken would make this batch's own measurement unreadable.

**A-7 — The C4 diagnostic is computed only when aj19 is active.** `portfolioMismatchDetected` is computed inside `if (aj19Diagnostic.isActive())` (`trade-safety.ts:425`, `:437-438`). The plan moves the computation out of the gate (Langston's first option) rather than depend on a toggle.

**A-8 — The refresh-state leak at six delete sites.** Pre-existing and bounded. **Folded into OBJ-1:** one service helper deletes a row and its in-memory refresh and claim state together. The in-service sites (`:883`, `:1638`, `:2201`) call it. `routes.ts:11436` deletes through storage directly; it is re-pointed at the service helper, and its comment is updated.

**A-9 — `missed_refreshes` is a dead column, and my own promise to place its removal was never kept.**
- B-ENTRY-GATE's scope (`Scope Files/B_ENTRY_GATE_SCOPE.md:85`) recorded it as disposition (5), *"The old column's removal is placed at Step 2 under rule 18, or kept with a stated reason"*. No placement or reason exists in that batch's pre-audit, `RUNNING_ISSUES` or `DELETED_COMPONENTS_LOG` (`git grep -i "missed.?refresh"` at the ref).
- Writers: **zero.** Its only code mentions are the schema (`schema.ts:2222`) and the upsert's keep-list comment (`storage.ts:4506`). Readers: zero in `server/` and `client/`.
- **Disposition — folded into this batch (§9.4 #1, rule 18):** dropped in the same migration that adds `promotion_attempts`, logged in `DELETED_COMPONENTS_LOG.md`.
- The §9.5(a-ii) state-write census runs at Step 3, from `docs/schema_reference_v1_5_1.md:51`, the snapshot JSON, and any SQL reading the column by name.

**A-10 — `bridge/canonical/` on the RTB queue lifecycle: consulted.**
- 60 lines match `rtb|ready.to.buy|promot` across the corpus.
- The RTB coverage is `DawnTrader_System_Architecture_Execution_Flow.md` §9 (`:597-641`): the service, the 15 s bucket refresh, and the flow *"Signal Orchestrator → SQE (FinalScore filter) → RTB Queue → TCL promotion"*.
- **No coverage of the claim ordering, of a failed open, of restore or of double-activation:** `git grep -i -E "restor|double.activ|not restored"` over `bridge/canonical` returns only the November-2025 "V1 Restoration"/REB history lines.
- ⇒ The only statement of intent is A3.R1's attached directive (scope §3). The not-restored outcome was never a canonical design statement; it first appears as a recorded trade-off in `ACTIVE_PATH_FLOW.md` / System Manual §19.3.

**A-11 — `emitSlotOpened` is a dead event** (zero emitters; one log-only listener, `trading-bootstrap.ts:46`). It is legacy that no longer fits (rule 24 outcome 3). **Disposition — folded into OBJ-7 (rule 18):** remove the emitter, the listener and the event type, and log them in `DELETED_COMPONENTS_LOG`. The §9.5(a-ii) census at Step 3 confirms that nothing reads the event.

**A-12 — The screen.**
- `routes.ts:11868-12175` (integrity block; `maxOpenTrades` `:11873`, `slotsAvailable` `:12093`) feeds `paper-open-trades-tab.tsx:122-125` ("Guardrail Max").
- `routes.ts:12482-12505` feeds `portfolio-metrics-strip.tsx:122` (paper and live trading pages).
- `maxOpenTrades` is also read by `mode-dashboard-tab.tsx:154`, the main Dashboard, which is off-limits. **It is not repointed** (F5).

## 4. The plan (each item → its finding)

| # | item | from |
|---|---|---|
| P1 | **Claim without delete.** `promoteSignal` becomes `claimSignal`: the P11 / P7 gates are unchanged; it returns `'claimed'` in place of `'deleted'`, marking the row in an in-memory claim set and deleting nothing (except the `stale_plan` retirement); refresh state is untouched. New `finalizePromotion(id, outcome)`: OPENED → delete the row and its state; RESTORE-* → unclaim (+ budget per P4); DISCARD-* → delete the row and its state, with the stage. `getRankedSignals` filters claimed rows beside `isSignalRefreshing`. The refresh at `:940` skips a claimed row, checked and set synchronously. The engine's loop always finalizes, in a `finally` per candidate. | A-1, Q1 (a), Langston riders 1-2 |
| P2 | **Typed outcome.** `executePromotedSignal` returns `OpenOutcome`. `invalid_target` becomes a new union member `INVALID_TARGET` (the union goes to 23, and the C5 fixture pins it). The catch-all at `:5787` returns OTHER `promoted_signal_exception`, verdict **RESTORE-CHEAP, charged** (no trade row can exist before `processSignal`'s writes, and the budget bounds a persistent fault). | A-2, C2 |
| P3 | **The classification table** as code: `promotion-outcome-class.ts`, a total map over `OpenFailStage` (and the `GUARDRAIL_BLOCK` / `OTHER` / `LEVEL_REBASE_INVALID` reasons beneath). It is pinned by a test that fails when a union member is unclassified. The verdicts are §5's. | A-3, C1, C5, Q2 |
| P4 | **The budget.** Migration: add `promotion_attempts` and drop `missed_refreshes`, with the MANIFEST entry and the rollback file in git. The storage method `incrementPromotionAttempts(id, weight)` returns the new count. The cap is read per class from `module_constants` (fail-closed = 0), with cheap weight 1 and costly weight W (pre-registered §6). The upsert keep-list and the structural test are updated. | A-4, A-9, C1 |
| P5 | **The room helper.** `exposureRoom(moneyHeld, maxTotalExposurePct, positions)` in `trade-safety.ts`, carrying the cap's own fail-closed arms (`:658-663`, money-held refusal). `checkMaxTotalExposure` calls it, and its decision is unchanged, proven by test. The per-check predicates are extracted the same way (kill switch, stop-loss, per-asset, cooldown, position-size cap). `checkGuardrailRisk` keeps every counter. | A-5, C3, F2, F-3 (1)(2) |
| P6 | **The pre-claim gate in the loop,** placed after the AMR gate and before `rankAtPromote`/claim. State is read once per pass. The candidate's own `notional` is compared against a running remainder; per-row predicate refusals defer, a stop-loss refusal discards, and room exhaustion stops. It is not an attempt and not a failure; it is counted in new `PROMOTION_SUMMARY` fields. The money-bound pass still reaches `getRankedSignals`, so the shadow pool keeps being written. | A-5, F1, F3, F6, F-3 (3), Q4 |
| P7 | **Counters and I3.** `PROMOTION_SUMMARY` gains `deferredPreClaim{by reason}`, `restored{by class}`, `discarded{by stage}` and `budgetExhausted`, plus the C4 mismatch count; a per-signal-id line is printed for restores and discards. The four I3 breaks of A-6 are fixed so that `attempts = opened + blocked + openFailed` reconciles on the promotion path. | A-6, A-7, OBJ-5, C4 |
| P8 | **C4:** `portfolioMismatchDetected` is computed outside the aj19 gate and returned to the caller for P7. | A-7 |
| P9 | **The screen:** a new `affordableNow` field at both route sites. It is computed as `floor(exposureRoom ÷ today's ticket)` plus the open count, labelled as a forecast. `MoneyHeldUnavailable` → `null` → "unavailable". The Open Trades card shows "Guardrail Max 20 by design · about N affordable now"; the strip shows N beside the slot count. `maxOpenTrades` and the main Dashboard are untouched. | A-12, F4, F5, KD-86 |
| P10 | **The OBJ-7 sweep:** `SYSTEM_MANUAL` §19.2/§19.3 (and the stale FinalScore line); `ACTIVE_PATH_FLOW` promotion hop; `SYSTEM_IMPACT_MAP` §4.3 (claim marker, budget column, the refresh/promotion contention); the trade-safety Check-7 comment `:602-607` and the `* 0.97` diagnostic literal `:420` (C6); `promoteSignal`'s "known hazard" header line; `emitSlotOpened` removal (A-11); the `active-funnel-tracker.ts:119-125` exit list, whose stale line numbers and count of six (now nine) the census found; `#1136`, `#648` and `#1079` annotated; the B-DB-SIZE-RELIEF cross-batch note to OLD Claude. | A-1, A-8, A-11, C6, OBJ-7 |
| P11 | **Tests:** unit tests for P1-P9. A source fence pins that the claim deletes nothing except on `stale_plan`. The fixture is parameterised on the resolved buffer factor (C6), never the literal 3.1 %. | all |
| P12 | **The DEPLOY_WINDOWS row,** pre-registered here (§6) and filed in the commit that lands the deploy. | OBJ-6, KD-56 — **deviation flagged in §6** |
| P13 | **In the deploy turn (ANALYST's ask, Discord 1571861388995985530):** append an `amend` on the `B-PRICE-SIDE-BY-JOB` window. It records:
- the anchor: the first `pm2.log` "App [dawntrader:0] online" line at or after `BUILD_SHA` becomes this batch's sha, identified by position;
- the sha;
- the pm2 restart counter;
- an assertion, with the evidence, that no restart fell between the build write and that start.

The `lifetime.pmUptime` of that generation (Langston C-3) is recorded beside it. If the two disagree, that disagreement is reported, not resolved silently.

**Langston's two conditions (Discord 1571862636457627740):**
- **(i)** "carries 9j's code" is an **ancestry test**: `git merge-base --is-ancestor <9j's landed sha> <BUILD_SHA>`, never sha equality.
- **(ii)** each stamp names its read-site:
  - `pm2.log` line and position for the online line;
  - `level-basis-funnel.jsonl` row for `lifetime.pmUptime` / `processStartedAt`;
  - `pm2 jlist` for `pm_uptime` and the restart counter.

**The deploy names every open window by batch token** (seven at `f77ea08df`, 8c's being `B-PRICE-SIDE-BY-JOB`). | 8c split; ANALYST (1)-(5); Langston 1571859426703441994, 1571862636457627740 |

## 5. The failure-exit table with verdicts

All line references are `active-execution-engine.ts` unless marked `ts:` (`trade-safety.ts`). "V" means the Kraken `validate=true` call at `:6331` (paper, crypto only).

| exit | stage / reason | cause in row or state | vs V | verdict |
|---|---|---|---|---|
| `:5711` | `invalid_target` → `INVALID_TARGET` | row | before | DISCARD |
| `:7319` | OTHER engine not running | global | before | RESTORE-GLOBAL |
| `:7359` | OTHER no system context | global | before | RESTORE-GLOBAL |
| `:7366` | OTHER kill switch | global | before | PRE-CLAIM (defer); backstop RESTORE-GLOBAL |
| `:7424` | STAMP_MISSING | row | before | DISCARD |
| `:7467` | OTHER AMR execution-entry gate | state | before | RESTORE-CHEAP |
| `:7558` | SIZING_INVALID unsized | row | before | DISCARD |
| `:7585` | OTHER processSignal error | fault | either | RESTORE-CHEAP (charged) |
| `:5787` | catch-all | fault | before | RESTORE-CHEAP (charged), C2's written verdict |
| `:5848` | DRY_RUN | global toggle | before | RESTORE-GLOBAL |
| ts:740 | ENGINE_STOPPING | global | before | RESTORE-GLOBAL |
| ts:138 | KILL_SWITCH | global | before | PRE-CLAIM; backstop RESTORE-GLOBAL |
| ts:153 / ts:161 | NO_STOP_LOSS / INVALID_STOP_LOSS | row (the stop can be scaled by the AMR overlay `:7509-7511`; still row-derived) | before | PRE-CLAIM DISCARD; backstop DISCARD |
| ts:191 | POSITION_LIMIT | state | before | PRE-CLAIM; backstop RESTORE-CHEAP |
| ts:289 | COOLDOWN | time | before | PRE-CLAIM; backstop RESTORE-CHEAP |
| ts:314…698 | GUARDRAIL_READ_FAIL | config | before | RESTORE-GLOBAL (loud) |
| ts:350 / ts:629 | MONEY_HELD_UNAVAILABLE | global | before | PRE-CLAIM (room 0); backstop RESTORE-GLOBAL |
| ts:475 | MAX_POSITION | row notional vs today's pot | before | PRE-CLAIM per row; backstop RESTORE-CHEAP |
| ts:685 | MAX_TOTAL_EXPOSURE | state | before | PRE-CLAIM (shared room); backstop RESTORE-CHEAP (a race only) |
| ts:845 | CORRELATION_EXPOSURE | state | before | RESTORE-CHEAP (not hoisted, A-5) |
| `:5962` | LEVEL_GEOMETRY_ABSENT | row | before | DISCARD |
| `:6050` | POLICY_SNAPSHOT_MISSING | row | before | DISCARD |
| `:6133` | EV_REJECT (live only) | row snapshot; the refresh re-prices | before | RESTORE-CHEAP |
| `:6176` | SIZING_INVALID after the overlay | global posture (multiplier 0) | before | RESTORE-GLOBAL |
| `:6188`, `:6732` | UNCLASSIFIABLE | unreachable when promoted (stamp validated at `:7421`) | — | DISCARD |
| `:6203` | DEPTH_GATE | market | before | RESTORE-CHEAP |
| `:6220` | LIVENESS_GATE | market / time | before | RESTORE-CHEAP |
| `:6257` | MAKER_MARKETABLE_DROPPED | market through the limit; the refresh re-prices the snapshot (P6) | before | RESTORE-CHEAP |
| `:6321` | VALIDATE_REJECTED, VPG below venue minimum | row (given venue metadata) | before | DISCARD |
| `:6340` | VALIDATE_REJECTED, venue said no | definitive venue rejection | at | DISCARD (a retry repeats the call and the refusal) |
| `:6388` | FILL_ECONOMICS settings unresolved | config | after | RESTORE-GLOBAL (loud) |
| `:6401` | ENTRY_GEOMETRY, maker limit vs its own stop/target | row | after | DISCARD |
| `:6408` → `:2141` | FILL_ECONOMICS, maker | row + cost cache | after | RESTORE-COSTLY |
| `:6433` | CONSUMPTION_FRESHNESS | time | after | RESTORE-COSTLY |
| `:6451` | FILL_REJECTED, no book | market | after | RESTORE-COSTLY |
| `:6457`, `:6471` | FILL_REJECTED, other | unreachable in paper | after | RESTORE-COSTLY |
| `:6570` | ENTRY_GEOMETRY, taker fill | market | after | RESTORE-COSTLY |
| `:6590` | ENTRY_WINDOW | market | after | RESTORE-COSTLY |
| `:6599` → `:2123` | LEVEL_REBASE_INVALID `plan_not_long` / `invalid_inputs` | row | after | DISCARD |
| `:6599` → `:2123` | LEVEL_REBASE_INVALID other / STOP_DISTANCE_AT_FILL | fill | after | RESTORE-COSTLY |
| `:6603` → `:2141` | FILL_ECONOMICS, taker | market | after | RESTORE-COSTLY |
| `:6671` | DUP_POSITION | state (the 19F filter in `getRankedSignals` hides it until close) | after | RESTORE-CHEAP |
| `:7022` | DUP_POSITION, lost race | state | after | RESTORE-CHEAP |
| `:7231` | TRADE_INSERT_ERROR | partial writes possible | after | **DISCARD-PARTIAL** |

`REVIEWER: object handed (the engine at the ref) · "enumerate every failure exit with its side effects and vs-validate order" · 37-row table returned · re-derived y (EV disposition in paper, the STAMP_MISSING I3 break, the 33 / 34 count)`.
**NOT RE-READ:** each row's side-effect list beyond those three.

## 6. Pre-registrations

- **Q-B — the budget values, before any data:**
  - cap `rtb_promotion.max_promotion_attempts` = **20** per class;
  - charge weights: cheap = **1**, costly = **4**.
  - **Reasoning:** at one charged retry per 30 s pass, a cheap state gets ~10 minutes to clear. A costly one gets 5 retries, i.e. 5 outbound validate calls, and ~2.5 minutes.
  - **FAIL arm, read at Step 7:** more than 120 charged restores per hour across all rows in any hour of the observation window.
- **R3 (OBJ-6), rewritten as Langston's F-2 asks — and my own catch first:**
  - ⚠️ Deriving "money held at the open times" from each position's entry cost (`ticket ÷ (share × buffer)`) is **circular**. With the share and buffer fixed, any exposure refusal at fewer than 20 positions implies that average exceeds money held now (`(1 − 0.0485)/19 > 0.0485`). That is the "qualifier true by construction" he sent back at r5.
  - ⇒ **The instrument must be independent of the tickets:** money held as a time series, reconstructed from the paper anchor plus cumulative realized P/L at each close (close lines in `out__*`), evaluated at each open position's open timestamp (`Simulated trade opened` lines).
  - **Object:** every `MAX_TOTAL_EXPOSURE` refusal with `openSlots > 0` on **2026-11-13 00:00-21:00Z**. That window has no deploy (reflog: `cd2b794de` 11-12 12:15Z, then `77f6fd598` 11-13 21:03Z) and is **before** the 8c flip at 11-16 09:45:01Z (C7).
  - **Prediction:** at every such refusal, the reconstructed average money held over the current book's open times is greater than money held now.
  - **FAIL:** any refusal where it is not.
  - **NO-RESULT:** the close lines cannot reconstruct money held to within $1 of the cap's own `100% of $X` printout at a control instant. That control is the positive control; a failed control voids the read.
  - **Run:** before Step 3 (code cannot start before 11-20), logs only (KD-93 interim rule: no hand-built database login).
- **The DEPLOY_WINDOWS row — DEVIATION FLAGGED.** The step-2 skill says to file the `open` row in the Step-2 commit. `obs-windows.py` has no deferred-open field: a filed window is open at once (`opened_at` is parsed, not compared). Filed today, it would force every crew deploy for the ~5 days before this batch deploys to name a window that has not started. The row's content is therefore fixed here and filed **in the same commit as the landing that dt-deploy deploys**:

  `{"type":"open","batch":"B-RTB-PROMOTION-RETRY-STORM","owner":"cc-b","opened_at":"<the anchor pmUptime>","until_event":"one full weekday crypto + xStock session after the restart with no other deploy, read against OBJ-1/2/5 and the Q-B FAIL arm","expected_by":"<anchor + 48h>","review_by":"<anchor + 72h>","disturbs":"any restart re-reads the queue (claim set is in memory and empties; rows stay) and splits the churn count; any deploy touching promotion, trade-safety or the RTB service","detail":"Langston C1/C7; 8c's first-week read (ANALYST) is split at this anchor"}`

  **Langston: accept the deviation, or tell me to file a row now with `opened_at` = today and the 5-day block.**

## 7. Questions for Langston at Step 2

- **Q-A — the walk.** Per-row refusals defer and continue; shared room stops (F1). Is that the split you meant, or should a position-size-cap misfit also stop the walk?
- **Q-B — the budget values above:** 20 attempts, weights 1 / 4, FAIL arm 120 an hour.
- **Q-C — RESTORE-GLOBAL charges nothing.** Is that agreed? It is the line between a signal's own repeat failures and an engine-wide stop.
- **Q-D — folding the four I3 breaks (A-6), `missed_refreshes` (A-9) and `emitSlotOpened` (A-11) into this batch.** Agreed, or placed elsewhere?
- **Q-E — the DEPLOY_WINDOWS deviation** (§6).

