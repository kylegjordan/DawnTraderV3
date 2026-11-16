# B-RTB-PROMOTION-RETRY-STORM — SCOPE (r1)

change-class: architecture

**Batch:** `B-RTB-PROMOTION-RETRY-STORM` · **Issue:** `#1136` (and the KD-84 pool collapse it now carries) · **Owner:** NEW Claude (CC-B) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 9j, CC-B pre-sprint item 2a · **Written:** 2026-11-16, Step 1.
**Placement:** Kyle KD-87 (row 9j, re-scoped, right after B-ENTRY-GATE closes, ahead of row 172) · **Balance:** Kyle KD-86 (money held) · **Start:** PM asked 2026-11-16 that Step 1 be written now, while B-ENTRY-GATE waits on its 11-20 xStock week read (KD-75). **No code before B-ENTRY-GATE closes**; Step 2 may start once Langston rules on this scope.
**Design source:** `Claude Comms and Packages/Langston Design Asks/KD84_RTB_POOL_COLLAPSE_INVESTIGATION.md` §8 (r8). That section is Langston's shaped design (his r5 changes F1-F7 and his r6 conditions F-3 1-3). This scope turns it into objectives. **Where this scope and his ruling differ, his ruling stands, and the difference is a question for him (§6), not a change.**

**Why the change-class is architecture.** It changes the RTB queue's lifecycle (a row may now leave and come back, or not leave at all), it reverses a recorded design trade-off (System Manual §19.3, `ACTIVE_PATH_FLOW.md` "Failed promotion … recorded as edge semantics, NOT filed as a defect"), and it adds a decision gate to the promotion loop.

---

## 1. What Kyle asked for, verbatim

- **KD-87** (2026-11-16 ~00:35Z, Desktop): *"I'm also okay with news proposal for folding the ready to buy pool fix into a pool fix item."* The ledger row records his design intent: **check free slots AND money at promotion; never consume a signal when the money is short; recheck periodically.**
- **KD-86** (same message): *"I'm fine with news recommendation on the money we actually hold, which is the $567. That makes sense."* ⇒ the Guardrail Max is recalculated from **money held** (`getMoneyHeld`: the anchor plus closed-trade P/L, no open-trade swings), the same figure that sizing and the money cap already use.
- **His own words relayed by PM (§8 of the record, ~23:20Z 2026-11-15):** (1) promotion happens when a slot frees up; at that moment check BOTH the free slots AND the money; if the money is not there, do not promote and do not consume the signal; check back periodically. (2) The 20-slot Guardrail Max on the Open Trades screen is static from the $820 launch; recalculate it continuously from the actual balance.

## 2. The problem, in one paragraph (evidence: the record §1-§5, Langston-confirmed)

A promotion deletes the signal's row from the ready-to-buy queue **before** the trade is opened, and does not put it back if the open fails (`server/services/active-execution-engine.ts:5630-5636` the claim; `:5670-5675` the failed branch logs *"signal not restored"*). The loop pulls as many signals as there are free **slots** (`:5517`, `:5527`). The money cap (`server/services/trade-safety.ts:615-702`, `checkMaxTotalExposure`) can bind before the slots do, because each open position keeps the size it was given when it opened, and the cap is measured against money held now. While closed-trade losses push money held down, the book fills on money a few slots short of 20. From then on, every 30-second pass deletes the pool's best signals and the cap refuses each one. Langston's count over 11-08 to 11-13 was 507-1,166 signals destroyed per weekday, essentially every signal that reached the pool. **The loss is not only on the money cap:** on 11-14/15, with zero money refusals, 35 signals were still lost (26 `MAKER_MARKETABLE_DROPPED`, 7 cooldown, 2 `DEPTH_GATE`). Deleting before opening loses a signal on ANY failed open.

## 3. Provenance (Step 1.b)

**Corpora searched:**
- `RUNNING_ISSUES.md` (`#1136`, `#648`, `#1079`, `#1189`, `#508`);
- `1-system-manual/ACTIVE_PATH_FLOW.md` (the promotion hop, ~`:250-260`);
- `SYSTEM_MANUAL.md` §19.1-19.3;
- `SYSTEM_IMPACT_MAP.md` §4.3;
- `pm/DECISIONS.md` KD-84 to KD-87;
- the KD-84 record;
- `git log -S` (not path-limited) on `8.8.4-A3.R1`, `MULTI_PROMOTE` and `Phase 8.8.3-B3: Ensures total exposure`.

`bridge/canonical/` was not read for this scope. Every component below has a git-recoverable introducing commit or directive, and the one pre-governance directive is quoted from the commit that attached it. **Step 2 reads `bridge/canonical/` for the RTB queue lifecycle and records what it finds, including "no coverage".**

### Tier 1: behaviour this batch changes

| component | what it was built to do (quoted) | disposition |
|---|---|---|
| **The promotion claim**, delete before open. `checkRtbPromotion` `active-execution-engine.ts:5626-5676` + `ReadyToBuyService.promoteSignal` `server/core/rtb/ready_to_buy_service.ts:1663-1745` | Introduced `e2d9a255c` (2025-12-17, Replit), attached directive *"Directive 8.8.4-A3.R1 – Verification & Hardening of Pair-Key SQE Integration"*, item 5: *"When a pair is promoted to an active trade, it must be removed from RTB before the trade record is created to prevent double-activation."* Its acceptance line: *"Promotion order — RTB removal precedes trade creation."* The directive says nothing about a FAILED open. The not-restored outcome was later recorded as a deliberate trade-off: `ACTIVE_PATH_FLOW.md` (*"an explicit trade-off preferring a lost signal over a double-activation. Recorded as edge semantics, NOT filed as a defect"*) and `SYSTEM_MANUAL.md` §19.3. `promoteSignal`'s own header (`B-RTB-REFRESH-LIVE-PRICE`, `#1189`) says *"A FAILED open still leaves the signal removed and not restored — a known hazard, unchanged."* | **(2) relevant, needs updating to today's intent.** The intent (no double activation) stands. The loss on a failed open was a cost accepted when the pool was never short. **Kyle's KD-86/87 reverses that acceptance:** *never consume a signal when the money is short.* This is a recorded design decision changed by Kyle, not a defect found in it (rule 24 outcome 2, decided). |
| **The multi-signal promotion loop.** `active-execution-engine.ts:5490-5700` (`[8.8.4-C.14.B][MULTI_PROMOTE]`) | Introduced `0b45da2f4` (2025-12-16, Replit, *"Update trading platform to enhance signal promotion and data handling"*); promotes up to `openSlots` ranked signals per pass. The slot count became derived (`floor(100 / max_position_percent_pct)`) under B-SIZING-DEC-RESTORE obj-4. | **(2).** It counts slots and never money. |
| **`checkMaxTotalExposure`** `trade-safety.ts:615-702` | Introduced `321a4fd45` (2025-12-04, *"Add new guardrail for maximum portfolio exposure and filter ghost trades"*); moved onto money held by B-BALANCE-SESSION-PAIRING (`e0e68dfdb`, 2026-11-07); made fail-closed by B-GUARDRAIL-FAIL-CLOSED (`#1081`). | **(1) correct as a check.** This batch extracts its room computation into a shared helper (F2) **without changing what it decides**. The retired-Check-7 comment at `:602-607` (*"binds at the same point by construction"*) is true at one instant and false over any period in which the pot moves (record §2(3)). It gets corrected. |
| **`checkPositionSizeCap`** `trade-safety.ts:332-470` | AJ10.1 *"TRUST PRE-SIZED SIGNALS … prevents MAX_POSITION blocks on properly-sized trades due to price drift between sizing and execution."* It compares the notional sized at birth with money held now (F7), so it blocks once the pot has fallen about 3.1 % since birth, and it does so after the claim. | **(1) as a check.** It joins the pre-claim set or the restore set. Which one is a Step-2 decision (§6 Q3). |
| **The Open Trades "Guardrail Max" display.** `server/routes.ts:11868-12175` (integrity block, `maxOpenTrades` and `slotsAvailable` at `:12093`), `:12482-12505` (portfolio strip); `client/src/components/trading/paper-open-trades-tab.tsx:122-125`, `portfolio-metrics-strip.tsx:122` | Shows the derived slot count, *"the SAME value the promotion loop gates on"* (`routes.ts:11868`). | **(2).** Kyle's KD-86: show what money held supports. Per F5, **add** a field and do not repoint `maxOpenTrades`. `maxOpenTrades` is also read by `mode-dashboard-tab.tsx:154`, the main Dashboard, which is off-limits (Kyle 2026-10-19). |

### Tier 2: read or called, one line each
- `getMoneyHeld` / `MoneyHeldUnavailable` (`server/services/guardrail-settings.ts:150, :191`): the KD-86 balance, unchanged, read by the new helper.
- `getRankedSignals` / `captureShadowPool` (`ready_to_buy_service.ts:1954, :2054`): unchanged. F3 requires that a money-bound pass still reach it, so `rtb_shadow_pool_members` keeps measuring.
- `evaluateAmrGates` above the claim (`active-execution-engine.ts:5566-5595`): the precedent for a `continue`-and-stays-queued gate above the claim. Unchanged.
- `eventBus.emitSlotOpened` (`server/lib/event-bus.ts:197`) and the 30 s poll: the "check back periodically". **No new timer.**
- `active-position-sizing.ts:92-104`: the 0.97 buffer whose stated job is the total-exposure check. Read, unchanged. It is the ~3 % tolerance the drawdown exceeded about 8×.

## 4. Objectives and how each is verified

**OBJ-1 — A signal is not lost because its open failed for a reason that can pass.**
After the claim, a failed open whose cause can clear on a later pass (a guardrail refusal, depth, liveness, consumption freshness, a refused fill, a dropped marketable maker, a duplicate position, the engine stopping) leaves the signal in the queue. A failure caused by the row itself (no valid target, missing level geometry or decision snapshot, unsized, unclassifiable, missing stamp, a trade-insert error such as `#1063`'s ABCD case, and `stale_plan`, which deletes by design) still removes it, logged with its stage.
- **Step 2 classifies every failure exit.** The `OpenFailStage` union (`server/services/rtb-metrics-service.ts:46-69`) has 23 members. Two of them aggregate distinct causes, so the class keys on the code beneath them:
  - `GUARDRAIL_BLOCK` covers kill switch, stop-loss, per-asset, cooldown, position-size cap, low-price, total exposure and correlation;
  - `OTHER` covers engine not running, no system context, kill switch tripped, the AMR execution-entry gate and a `processSignal` throw.
- `executePromotedSignal`'s `invalid_target` sits outside the union.
- Every `return { opened: false … }` site in `active-execution-engine.ts` at the ref (33 single-line sites, plus the multi-line ones) gets a restore-or-discard verdict and a reason. The list is enumerated, not sampled.
- **The mechanism is a Step-2 decision (§6 Q1).**
- **Verified by:**
  - unit tests per class (restore vs discard), with the classification table pinned to the `OpenFailStage` union so that a new stage fails the test until it is classified;
  - on staging, zero `signal not restored` lines for a restore-class stage after deploy, with a positive control (a restore-class refusal logged as restored);
  - a pass-cadence restore of one row shows that row's id surviving across passes.

**OBJ-2 — Money is checked BEFORE a signal leaves the queue (Kyle's intent; Langston F1-F3, F6, F-3 conditions 1-3).**
- **The gate:** one helper computes room as `moneyHeld × maxTotalExposurePct/100 − currentExposure`, called by both `checkMaxTotalExposure` and the new pre-check (F2).
- **Its inputs:** the cap's own `currentExposure` with its fail-closed arms (F-3 (2)), and each candidate's **own** sizer notional (`preComputedNotional`, the number the cap sees; F-3 (1), F1).
- **Where it runs:** walked in rank order against a running remainder across the pass. It sits **above the claim**, beside the AMR gate (F-3 (3), F3).
- **On refusal:** a candidate that does not fit is `continue`d. It stays queued, is not counted as failed, and `openSlots` is not decremented. An unreadable input, or `MONEY_HELD_UNAVAILABLE`, means room = 0, loudly (F6, `#1081`).
- **What does not change:** the money-bound pass still reaches `getRankedSignals` (F3), and `checkMaxTotalExposure` still runs after the claim as the backstop.
- **Verified by:**
  - unit tests: the helper's result equals the cap's decision on identical inputs;
  - rank-order walk with mixed notionals, including a smaller later candidate that fits after a larger one does not;
  - fail-closed arms;
  - the money-bound pass still writing `rtb_shadow_pool_members`;
  - on staging, `MAX_TOTAL_EXPOSURE` refusals after the claim drop to about zero (only races remain), and the pool's median member count rebuilds on weekdays, measured with the record §1's object.

**OBJ-3 — The position-size cap cannot destroy a signal either (F7).**
Either the pre-check also covers `checkPositionSizeCap`, or OBJ-1 restores its refusal. Step 2 chooses, with the retry-storm consequence of each stated (§6 Q3). Langston's diagnostic: lift `aj19Diagnostic`'s dark `portfolioMismatchDetected` count (`trade-safety.ts:437-438`) into `PROMOTION_SUMMARY`.
- **Verified by:** a unit test of a birth-sized notional more than 3.1 % above the current cap share, which is not lost; and the mismatch count present in the staging summary line.

**OBJ-4 — The Open Trades screen shows what money held supports (KD-86; F4, F5).**
- **The new field:** "about N affordable now" at today's size (labelled as a forecast), beside the unchanged design slot count of 20. It is added to the two route sites (`routes.ts` integrity block at `:12093`, portfolio strip at `:12487`). It is computed from the OBJ-2 helper (F4: one helper, two expressions).
- **Failure display:** `MoneyHeldUnavailable` renders "unavailable", never 20 and never 0.
- **What it does not touch:** `maxOpenTrades` is not repointed, and the main Dashboard is not touched.
- **Verified by:** Claude-in-Chrome on the staging Open Trades page, read against the same instant's money held (the cap's `100% of $…` field, or `getMoneyHeld`).

**OBJ-5 — `#1136`'s own question is answered, and the loop is countable once per signal.**
- **The counts:** `PROMOTION_SUMMARY` gains deferred-for-money, restored, and discarded-by-stage, keyed by signal id so that a signal retried on many passes counts once per pass and is distinguishable from many signals.
- **The disposition:** `#1136` closes on rule 24 outcome 2, decided. The re-mint loop was the queue re-admitting a signal it had just destroyed. With the restore, the row persists, and with the pre-check, a money refusal never claims it.
- **What stays open:** any refusal that still claims and restores every pass gets a stated churn rate (writes per hour) in the Step-7 read, so that a write storm cannot replace the log storm unseen.
- **Verified by:** the summary line on staging, and one weekday's churn count.

**OBJ-6 — The before and after are measured on a pre-registered object.**
- **At Step 2:** the record §5's R3 is written as this batch's pre-registered baseline. Per refusal with `openSlots > 0`, it records the open count, Σ entry cost, money held, the sizer's ticket, and the average money held at the open times of the current book. The prediction is that this average exceeds money held now at every such refusal.
- **The data:** run on a recent weekday with no deploy inside it (staging reflog checked).
- **The window:** if Step 7 reads a post-deploy window, its `open` row goes in `DEPLOY_WINDOWS.jsonl` in the Step-2 commit (KD-56).
- **Verified by:** the baseline committed before code exists, and the Step-7 read set against it.

**OBJ-7 — The documents say what the system now does.**
- `SYSTEM_MANUAL.md` §19.2 and §19.3 are rewritten (§19.3's "not restored" trade-off becomes the restore and the money gate).
- The `ACTIVE_PATH_FLOW.md` promotion hop is updated, as are `SYSTEM_IMPACT_MAP.md` §4.3 and the trade-safety Check-7 comment.
- `promoteSignal`'s header *"known hazard, unchanged"* line goes.
- `#1136`, `#648` and `#1079` are annotated.
- **Cross-batch input (no row):** restoring the pool restores the shadow-pool write rate inside B-DB-SIZE-RELIEF's observation window (to 2027-02-02). That is named to OLD Claude beside row 119's price-liveness input, as the record §8 says.

## 5. Out of scope (stated so it is not assumed)

- **Changing any cap, share, buffer or slot count.** Capacity stays about 17 while the pot is down; the fix makes the same slots get the pool's best signals (Langston, record §8 "What it buys").
- **The pot drawdown itself and the stop-out rate.** Those are row 52's next report (record §7, §9).
- **Row 9i (`B-EXPOSURE-CLASS-ALLOCATION`, `#1135`)** and its conditions (record §6). It is a separate row.
- **`stale_plan`.** It is a by-design deletion and is excluded from the restore (record §4, Langston F-1).
- **The main Dashboard's `maxOpenTrades` reader.** Off-limits.
- **Live mode.** The same code path runs for live when live starts. Nothing here is live-specific, and nothing live-specific is claimed.

## 6. Questions for Langston at Step 1 (my recommendation first)

- **Q1 — the restore mechanism.**
  - **(a) Recommended: do not delete at the claim.** Mark the row claimed in memory, beside the existing `isSignalRefreshing` set, so that the refresh and `getRankedSignals` skip it. Delete it on a successful open, and release it on a restore-class failure.
  - **(b) Delete, then re-insert on failure.**
  - **(a) keeps A3.R1's intent** (a claimed row cannot be promoted twice, and the single-flight latch from `#508` already serializes passes). It writes nothing on a refusal, keeps the row's id, `queued_at` and refresh state, and has no window in which the row does not exist.
  - **(b) re-creates a row,** which must keep `signal_id`, `queued_at` and the refresh state to avoid looking newborn to P7 (`[P7][UNPRICED]` refuses a row with no priced pass).
  - **(a)'s risk:** a process crash mid-open leaves the row queued after restart. The open path's `unique (symbol, mode)` rule plus the duplicate guard (§19.1) already answer a second open of a symbol that did open.
  - **(a) also keeps the status contract (`#1204`: `active` | `reconfirmed`) untouched,** because no new status is written.
- **Q2 — the classification boundary.** Is "the failure is a property of the row" the right test for discard? In particular, `EV_REJECT` (computed from the at-queue snapshot, so it repeats until a refresh re-prices the row) and `ENTRY_WINDOW` / `FILL_ECONOMICS` (price moved). I lean restore for those, because the refresh is the component that re-prices or retires a row, and the promotion loop should not pre-empt it. Discard is reserved for rows that can never open.
- **Q3 — F7.** Should the position-size cap join the pre-check, or be restored? The pre-check is cleaner, because otherwise a row sized at birth while the pot was higher is claimed, refused and restored every pass until it is re-sized or retired. I recommend the pre-check covers BOTH money checks, from one helper that also carries the per-position cap.
- **Q4 — cooldown and other cheap guardrails.** Should the per-symbol cooldown also go above the claim? The 11-14/15 losses included 7 cooldown refusals. My lean: no. Restore covers it, and OBJ-5's churn count tells us if it matters. Moving every guardrail above the claim would duplicate `checkGuardrailRisk`.

## 7. Workflow

- **Step 1:** this document → Langston.
- **Step 2:** the pre-audit and plan, after his ruling. It contains:
  - the full `OpenFailStage` classification;
  - the R3 baseline;
  - the SIM census of every reader of the queue row (who reads, writes, deletes and schedules against `rtb_signals`, per §9.5(a));
  - `bridge/canonical/` for the queue lifecycle;
  - the DEPLOY_WINDOWS row.
- **Steps 3-11:** follow, and **no code lands before B-ENTRY-GATE closes** (KD-87).
- **Board card:** created at `Scope`, Blocked on = Langston.
