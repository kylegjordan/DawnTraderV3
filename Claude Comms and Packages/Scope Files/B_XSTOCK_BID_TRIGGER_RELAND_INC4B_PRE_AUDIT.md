# B-XSTOCK-BID-TRIGGER-RELAND increment (4b) — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

> **r2 (2026-10-21) folds Langston's Step-2 CHANGES NEEDED (BLOCKER-1-3, conditions A-C, one record item):** A9-A11 and P9-P10 are new; P1, P4, P7, A4 (ii), A7 are amended in place.
> **r3 (2026-10-21) folds his r2 CHANGES NEEDED (BLOCKER-4, condition D, three records):** A12 and the per-site input table in P1 are new; P1's input becomes a per-CLASS shape; P4 (d) and P7 are amended; A5's citations and A6's count are corrected; §2 is in order.

> **Batch:** sprint plan row 2 `B-XSTOCK-BID-TRIGGER-RELAND` (CC-C) · **increment (4b) = objective 8's remaining half** (`Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md:166`): ONE shared exit-trigger rule for the engine and `vts-runner.ts`, with a call-site-count fence. Increment B shipped objective 8's size test (`93dce9cb9`, 2026-10-17).
> **change-class (this increment): `non_architecture`** — Langston 2026-10-21 condition (e), **conditional on BLOCKER-1, which r2 fixes (P1's per-lane other-class policy, A9)**. Nothing it changes alters a decision: it extracts the last step of trigger selection into one pure function, adds fences, and corrects design text. The batch scope stays `architecture`. ⚠️ The diff touches `active-execution-engine.ts` and `vts-runner.ts`, so the checker's core-path cross-check may flag a possible under-declaration. That is expected, and this line is the answer to it.
> **Sources read (all six):**
> (1) code at `origin/migration/aws-supabase` `821915dc3` — `active-execution-engine.ts:2155-2320`, `:3095-3142`, `:3169-3179`, `:3746-3755`, `:759-771`; `vts-runner.ts:3942-3966`, `:4736-4762`, `:3746`, `:4722`; `vts-xs-select.ts`; `core/calculations/touch-price.ts`; `core/trading/crypto-touch.ts`.
> (2) staging: the deployed build `d307debe5` (2026-10-20 23:13:17Z, CC-A); `error.log` retention (14 days, `xstock-exit-frame-log.ts:21`).
> (3) SYSTEM_IMPACT_MAP: the `transactable-sides.ts` entry and the `8a-P3/P4` line.
> (4) SYSTEM_MANUAL §3.5.1b and §18.0.1.
> (5) the design record `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_overnight-exit-design_r1.md` r2-r6; `INCB_PRE_AUDIT.md` P3; `INCC_PRE_AUDIT.md` C-P5; RUNNING_ISSUES `#1065`, `#1199`.
> (6) provenance: `8a-P4c` P2 (the one-module precedent), `8a-P4b` C1 (why the trigger left the bid).
> **Langston's rulings this rests on (2026-10-21, re-derived by him at `bf490577d` and `2260268401c`):** (a) selector-only scope APPROVED, conditions 1-3; (b) floor WITHDRAWN on three citations; (c) latch: first "in, narrowed", then on the two facts below **NO LATCH**.

## 0. PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (design r6 (c)1, `:133`): one shared module for "the bid trigger, the floor and the latch". **NOW:** the bid trigger only. **REASON:** the floor was withdrawn and the latch dissolved — A3 and A4.
- **PREVIOUSLY STATED** (scope `:165`, `:89`; design r6 (b) `:131`): the pause "keeps the latch, so events inside it evaluate at resume". **NOW:** no latch exists or will exist. A level crossed during the pause is decided at the first tick after it, on the book as it is then (`aee:3098-3099`). **REASON:** A4; the `:131` promise pointed at a latch that was never built, so it is vacuous today, not false (Langston).
- **PREVIOUSLY STATED** (scope `:165`): the pause retires once "a handoff window passes with zero implausible-book fills". **NOW:** C-P5's two-week inside-vs-outside rate governs, the Langston-approved Step-2 text. **REASON:** A5. The two retirement texts disagree, and the later, reviewed one wins.

## 1. AUDIT

### A1 — Every exit-trigger DECISION site (census, tests excluded; Langston condition 2: count decision sites, not importers)
**Exactly three production sites hand `triggerPrice` to the shared evaluator (`tec-evaluator.ts`, which decides on it; `null` ⇒ branch 2b, no decision):**

| # | site | how the price is chosen today | refusal it carries |
|---|---|---|---|
| T1 | paper, `active-execution-engine.ts:3752` | crypto: `triggerBid` (`_lsSel` ← `selectTouchPrice`, `:2966`). xStock: `xsBidArmed ? triggerBid : currentPrice` (armed = the guard ran AND `spread_blown` on, `:2319`). Other classes: the mark. | `armOff: 'guard_off' \| 'spread_blown_off'` on the frame line; the crypto touch refusal on `recordTouchSelection` |
| T2 | VTS real, `vts-runner.ts:3982` (`_vtsTriggerPrice`, set `:3955` / `:3964`) | xStock: `selectVtsXstockExitBid(...).bid` (ungated by design, its own stateless guard). Crypto: `transactableSide(selectCryptoTouch(...).selection, 'sell')`. | `_vtsExitRefusal` — an `XsLiveReason` or a ticker refusal or `no_bid_side` |
| T3 | VTS shadow, `vts-runner.ts:4762` (`_sExitBid`, set `:4742` for xStock and `:4730` for crypto) | the same selectors as T2 | **none carried** |

**Exactly one evaluator** consumes all three: `evaluateTECExit(` has three production calls (`aee:3726`, `vts-runner.ts:3971`, `:4753`), and `triggerPrice:` appears at exactly those three plus the type declaration (`tec-evaluator.ts:140`). Searched across `server/` with tests excluded.

**Test-site census (Langston BLOCKER-3), tests included — the assertions that pin today's literal expressions and go red under P3:**
- `b-price-side-8a-p1-exit-fence.test.ts:100`, `:107`, `:139`, `:202` (they parse the paper `triggerPrice` expression), plus `:166` and `:168` (`triggerPrice:\s*_vtsTriggerPrice,` / `_sExitBid,`);
- `8a-p3-crypto-finish.test.ts:157`, `:160`;
- `8a-p4b-paper-xstock.test.ts:107` (the whole paper expression), `:115`;
- `8a-p4c-instrument.test.ts:208` (`count(/triggerPrice: _sExitBid,/g) === 1`);
- `b-vts-no-decision-valve.test.ts:64-65` (`let _vtsTriggerPrice: number | null = null;`, never `= currentPrice`).

**Their SUBJECTS survive:** the trigger is the transactable side; the shadow passes its own bid; VTS starts NULL, never the mark. They are RE-POINTED at `selectExitTrigger(…)`, never deleted (P9). Not affected: `xsBidArmed` in the `endedBy=` fences (`…-frame.test.ts:111`, `…-incb.test.ts:134`), because the variable stays.

### A2 — The refusal vocabulary is three populations today (Langston condition 2)
- **Paper xStock unarmed:** `guard_off | spread_blown_off`.
- **VTS:** `XsLiveReason` (`ok | no_row | age_unknown | too_old | side_unusable | too_wide | knobs_unavailable`, `vts-xs-instrument.ts:22-25`), the crypto `TickerRefusal`/`LevelBasisRefusal` (`touch-price.ts`), or `no_bid_side`.
- **Shadow:** no reason at all.

A fence counting three sites while the reasons stay three shapes would certify sameness that does not exist.

### A3 — The FLOOR: withdrawn (§9.4 disposition 5), on Langston's three citations, not on Kyle's r5 answer 1
Kyle's r5 answer 1 (`:111`) struck r3 item 4's terminal-path loss bound (`:89`), which is a different object from the item 3 collar (`:88`). The floor is dissolved by three other facts:
- **r3 Q2 (`:83`):** the collar sizing was already withdrawn on measurement. k = 0.30% refuses 22 of 82 stop closes, including healthy-book gap-throughs.
- **r3 item 2 (`:87`):** plausibility is the gate. Objective 6 (`spread_blown`, live 2026-10-16) is what catches the catastrophe case.
- **Kyle's fidelity test:** a price-distance refusal makes paper HOLD a position live would have closed. That is r3 item 5's silent direction (`:90`).

My earlier citation (`:113`) was wrong: answer 1 is `:111`; `:113` is answer 3.

### A4 — The LATCH: none, on both readings
- **(i) Pause latch.** The pause already RECORDS a breach: `[VENUE_PAUSE] … wouldFire=<mark> bidWouldFire=<bid>`, a re-log on the first fire, and `VENUE_PAUSE_RESUMED` (`aee:3103-3142`; counters `:761-764`, `_venuePausePending` `:771`). What it drops is the DECISION, and its own comment states that as the design (`:3098-3099`).
  - **Langston's verdict, no latch:** the pause exists because quotes inside it are untrustworthy. Fills ≥ 3% below the stop ran 38.9% inside vs 2.0% outside (the 116-close control in the `market-hours.ts` header). A pause latch would source its trigger from that population and re-admit the artifact on a delay.
  - It is also blocked twice over. Kyle 2026-09-03: same exit standard round the clock, *"we just hold"*. And r3 item 4: a latched-but-refused exit needs a loss bound Kyle has not set.
  - ⇒ **`bidWouldFire` inside the pause measures the ARTIFACT RATE, not missed exits** — C-P5 reads it that way (A5).
- **(ii) Design r2's exit-intent latch (`:51`).** That latch is *"a valid bid stop event latches an exit intent; a later recovery above the stop does not erase it"*. It is **NOT BUILT**: Langston's census found no exit-intent latch on any exit path, and the only `latch` there is TEC's `latchTriggerPrice`, the moonbag target latch. **Disposition: §9.4 disposition 5, dissolved by construction — it is not owed.**
  - L5's latch existed to carry an exit intent across OUR refusal: a fill-or-kill sell below a floor (r2 `:51-52`). Each of our refusals is now gone:
    - the floor is withdrawn (A3);
    - size never blocks an exit — increment B P3 (`INCB_PRE_AUDIT.md:105`; `aee:3176`, "LOG + COUNT ONLY");
    - the pause is ruled no-latch (A4 (i)).
  - The one remaining refusal of an exit is the book-state guard's, on a quote it did not admit. Per Langston (c), an unadmitted quote arms nothing; arming on it rebuilds the MDB false stop (`#1065`).
  - **Corrected r2 (Langston condition A — the earlier sentence said nothing of ours stands between an admitted bid and the exit, which is false):** three refusals of ours are live — the venue pause (`aee:3098-3099`; A4 (i) rules it *not bridged*, which is not *gone*), the staleness ceiling (`aee:2254-2269`), and the hollow-skip withholding, which is time-bounded and yields at `hollow_skip_cap`. **The disposition rests on this instead: every surviving refusal is one Kyle or Langston has already ruled resolves to a HOLD** (Kyle 2026-09-03 *"we just hold"*; r5 answer 1 `:111`; A4 (i)), **so none is a latch candidate.**
  - **r3 item 4's loss bound goes with it, and is NOT Kyle-facing anew:** Kyle struck it himself (r5 answer 1, `:111`), recorded in r6 (a) `:125`.
  - ⚠️ **This is a claim about the CURRENT design.** If a future change refuses an admitted exit for a reason of ours (a floor, a size block, a venue rule), the latch question reopens with it.

### A5 — The pause's retirement read (C-P5) and its carrier (Langston condition (c), (d))
- **C-P5 (`INCC_PRE_AUDIT.md:84`) is a RATE over two weeks:** for each `bidWouldFire` event, the bid at suppression vs the bid 15-25 min later, inside vs outside the windows (the outside share from `XS_FRAME`).
- **Carrier:**
  - `VENUE_PAUSE`/`RESUMED` and `XS_FRAME` are both `console.warn` ⇒ `error.log`, which keeps 14 days (`xstock-exit-frame-log.ts:21`). A two-week read fits only if it is taken promptly.
  - The four since-start counters print on `console.log` (`aee:3411`) ⇒ `out.log`, which is SIZE-rotated at ~1 GB a file (four files from 10-20 alone), not a fixed time window, so the 10-20 and 10-21 counters are already unrecoverable; they reset every restart. `_venuePausePending` is deleted at close (`:4921`). No row persists any of it.
  - **The daily `error__` files are named by their ROTATION day:** `error__2026-10-20` holds 2026-10-19 00:00:01 → 2026-10-20 00:00:01 (measured, first and last lines). `error__2026-10-19` holds Sunday 10-18 (venue shut): 0 `VENUE_PAUSE` lines. Monday 10-19 (the file dated 10-20) has 65. Retention is 14 daily files.
- **Positive control:** `venuePauseExitTicksSinceStart > 0` in the same window before any would-fire zero is read. A zero `bidWouldFire` and "no position held through a pause" print identically (`#661` leg 3).

### A6 — Stale text the sweep found (Langston condition (b): the class, not one instance)
(r3: the r1 count is dropped — it was a borrowed figure, "times" is not matching lines, and this document's own `latch` lines move it with every revision; P6 enumerates instead.) The copies that make this increment's false promise:
- scope `:89`, `:165`;
- design `:51`, `:89`, `:131`, `:133`;
- `INCC_PRE_AUDIT.md` (C-P2, C-P5);
- the INCC change list's `VENUE_PAUSE` lines.

In code, `aee:3746-3748` still reads *"xSTOCK: THE MARK … the explicit arm stays so the re-land (row `3n.q7`) is a one-token change"*, which has been stale since increment B.

### A7 — The fence gap increment B left
The mark fallback is fence-verified for `reason=spread_blown_off` only — the assertion `basis=mark reason=spread_blown_off` at `b-xstock-bid-trigger-reland-inc2-chain.test.ts:478` (r1 cited `:468`, the test's opening line). **`reason=guard_off` has no fence:** zero `guard_off` hits under `server/tests`, against a positive control of one `spread_blown_off` hit from the same search (Langston, re-derived).

### A9 — The OTHER-CLASS arm differs by lane, deliberately, under two rulings (Langston BLOCKER-1)
- **Paper → the MARK** (`aee:3749-3751`): `8a-P4b` r1 BLOCKER-1. The paper exit loop is class-total over a four-class registry (`shared/asset-classes.ts`: four `active: true`), and an else-arm of `xsBid` would hand such a row `null` forever.
- **VTS → NO DECISION:** `vts-runner.ts:3939-3942`, *"starts NULL, never the mark — each traded class assigns its own bid below, so a class with no branch makes NO level decision"* (`3n.q3` Step-4 condition 2), because a mark there reaches a clamp arm. The shadow lane has the same shape (`_sExitBid` starts `null`, `:4728`).
- ⇒ **r1's single "any other class → mark" row would have made the paper rule permanent for the VTS — a decision change, and `architecture`.** P1 now takes the policy as a parameter.
- **Reachability, re-measured 2026-10-21 (not carried from the `3n.q3` ruling):** zero rows outside `crypto_spot`/`xstock_spot` in every population read — `vts_open_trades` (all rows: 191,903 crypto, 53,573 xStock), `active_open_positions` (1 crypto, 18 xStock), open `rtb_shadow_pairings` (71 / 148), and `closed_trades` opened in the last 30 days (116 / 304). Control: the same query returns both traded classes. **A fence, not a live defect.**

### A10 — `armOff` when unarmed: the `?? 'unset'` label is DEAD, by census (Langston BLOCKER-2)
- **Live logs cannot settle it.** `reason=unset` and the control `reason=spread_blown_off` are BOTH zero in `error.log`, `out.log` and `error__2026-10-17…21` on staging: the mark arm has not run since increment B went live, so the control cannot fire. The instrument has no reach — the same uncontrolled zero as F7.
- **Code census (`aee:2155-2320`, every path for an xStock position).** The book-state block at `:2282-2283` is unconditional, inside the xStock branch. Every earlier exit from it `continue`s: no tick, cold mark, stale mark. `assessBookStateNow` has three outcomes:
  - `knobs_missing` ⇒ `continue` (`:2287-2291`), so the evaluator is never reached;
  - any other `!ok` (`disabled`, `no_tick`) ⇒ `xsBidTriggerOff = 'guard_off'` (`:2300`);
  - `ok` ⇒ `armed = spreadBlownEnabled`, else `xsBidTriggerOff = 'spread_blown_off'` (`:2319-2320`).
- ⇒ **An xStock position that reaches the evaluator unarmed ALWAYS carries an off-reason. `?? 'unset'` at `aee:3802` is dead and is deleted in this diff** (P10).
- **P1 stays strict, with its blast radius stated.** An unarmed xStock input without `armOff` THROWS (a caller bug). The throw is contained by the per-position `try` at `aee:2109`, so its failure mode is **a silently skipped exit evaluation on that one position — a HOLD**, logged by the existing `Error checking position` line. That is the direction Kyle's fidelity test cares about, which is why P4 fences the census itself (every unarmed assignment sets an off-reason).

### A11 — The fences' reach (Langston condition B)
- A decision-site count of `evaluateTECExit` callers catches a fourth TEC caller or an inline price. **It does NOT catch a new exit path that bypasses TEC entirely** — that limit goes in the fence's own docstring.
- r1's P4 (d) "before equals after" cannot be a test: the "before" expression is deleted by the diff.

### A12 — The ARM is an xStock concept, and the live paper expression hands CRYPTO `armed: false` (Langston BLOCKER-4)
- The paper call site's arm is `_posClass === 'xstock_spot' && xsBidTriggerArmed` (`aee:3179`), which is **false on every crypto position**. r1/r2's table said crypto is "(always true)", which describes no expression in the code.
- **The trap:** wire that expression into an `armed`-discriminated input and crypto arrives `{ armed: false }` with no `armOff` to give. The straight-line patch, `armOff: xsBidTriggerOff ?? 'guard_off'`, rebuilds on the crypto lane the silent default P10 deletes. And a selector that tests `armed` before `assetClass` sends **every crypto exit to the mark** — a decision change on a live lane, which would void `non_architecture`.
- **Root cause, the same shape as BLOCKER-1:** a per-class policy collapsed into one field. ⇒ the selector's input is discriminated by CLASS first (P1), so a crypto input cannot carry an arm at all.
- **The paper refusal for xStock is a fourth population:** `xsFrameReason` (`aee:2148`, typed `string | null`) — `unguarded_crossed`, `unguarded_not_two_sided` and the guarded crossed/non-finite labels. P2 narrows it to a literal union by census of its assignments and adds it to `ExitTriggerReason`.
- **The paper crypto refusal is not passed to the evaluator call today:** `checkExitConditions` (one production caller, `aee:3147`, Langston) receives only `triggerBid`. P1's paper input is therefore built in the loop (where `_lsSel`, `xsBid`, `xsFrameReason` and the arm live) and passed into `checkExitConditions` in place of `triggerBid` + `xsBidArmed`.

### A8 — SIM / System Manual
- **SIM:** no entry for an exit-trigger selector (it does not exist yet). The `transactable-sides.ts` entry (added 2026-10-20) names T1-T3's side sources but not the selection step.
- **System Manual:** §3.5.1b states the paper arm and §18.0.1 the per-lane table. Neither names one rule for the three sites. That silence is the gap this increment closes.

## 2. PLAN (each item cites its finding)

| # | item | from | what |
|---|---|---|---|
| **P1** | **`selectExitTrigger` — one pure function** | A1, A2; Langston (a) conditions 1-3 | New `server/core/trading/exit-trigger.ts`. **Input, discriminated by CLASS first (r3, A12):** `{ cls: 'crypto_spot'; bid; bidRefusal }` · `{ cls: 'xstock_spot'; arm: { armed: true } \| { armed: false; armOff: 'guard_off' \| 'spread_blown_off' }; bid; bidRefusal; mark }` · `{ cls: 'other'; otherClass: 'mark' \| 'none'; mark }`. **A crypto input has no arm field, so it cannot be sent to the mark by one; the class is the outer test by construction.** `otherClass` is the lane's policy (A9). The verbatim per-site inputs are the second table below. Output: `{ price: number \| null, basis: 'bid' \| 'mark' \| 'none', reason: ExitTriggerReason }`. The rule is the code's rule today, stated once (sketch below). **The arm is a PARAMETER (condition 1):** paper passes `xsBidTriggerArmed`; VTS real and shadow pass `true` (their guard is upstream). The module never reads `spread_blown`. **No `latch` token anywhere (condition 3).** |
| **P2** | **One refusal vocabulary** | A2 | `ExitTriggerReason = 'ok' \| 'guard_off' \| 'spread_blown_off' \| 'class_mark' \| 'class_unbranched' \| 'no_bid_side' \| XsLiveReason \| TickerRefusal`, exported from P1's module. T1's frame line, T2's `_vtsExitRefusal` and T3 (newly) all carry it. T3 gains a reason it never had; it is counted beside the shadow exit looks, log only. |
| **P3** | **The three sites call P1, and nothing else picks a trigger** | A1 | T1 `aee:3752`, T2 `vts-runner.ts:3982`, T3 `:4762` each pass `selectExitTrigger(...).price`. Behaviour-preserving: the evaluator's input is identical to today's, value for value. |
| **P4** | **Fences** | A1, A7, A9-A11 | (a) A **decision-site** fence: every production `evaluateTECExit(` call's `triggerPrice` is a `selectExitTrigger(…).price`, and the count is exactly 3 (a count over `server/` excluding tests — a fourth TEC caller or an inline price goes red). **Its docstring states its reach: a new exit path that bypasses TEC is NOT caught (A11).** (b) P1's unit table, every row, with **in-test fixture controls in this repo's idiom** (the `8a-P1` X3 pattern, `B_PRICE_SIDE_BY_JOB_8A_P1_AUDIT_AND_PLAN.md:51`), not source substitution. The mutations — the ungated bid, a mark fallback when armed, an inverted arm, paper's other-class rule given to the VTS — are each **RUN** and recorded red, not predicted. (c) **The `reason=guard_off` fence B left (A7):** the inc2-chain harness with the guard knob off asserts ` on=mark` and `basis=mark reason=guard_off`. (d) **A frozen expected-value fixture** — a table of inputs and the exact trigger each lane must hand the evaluator, written from today's behaviour BEFORE the diff — so equality is a standing fence, not a one-shot comparison. **It carries a `crypto_spot` row deliberately given `arm: { armed: false }` (cast past the type), asserting `price = bid, basis = bid, reason = ok`; "class check after arm check" is a RUN mutation against it, recorded red (BLOCKER-4).** (e) **The A10 census as a fence:** every assignment of `xsBidTriggerArmed = false`-equivalent sets an off-reason, and `?? 'unset'` is absent. |
| **P5** | **Correct the stale comment** | A6 | `aee:3746-3748` is rewritten to the bid-armed rule and points at P1. |
| **P6** | **Correct the design text — bodies, not stacked notes (condition (a))** | A3, A4, A6 | **Scope:** `:165` → "suppresses the decision; a level crossed inside it is decided at the first tick after, on the book as it is then — no latch (Langston 2026-10-21); retirement per `INCC_PRE_AUDIT` C-P5"; `:89` the same. **Design:** `:131` → states the decide-at-resume design; `:133` (r6 (c)1) → "one shared trigger rule (`selectExitTrigger`); floor withdrawn (A3); no latch (A4)"; `:51` and `:89` each carry their disposition inline (dissolved / struck by r5 answer 1). **INCC_PRE_AUDIT** C-P2/C-P5 and the INCC change list lines are corrected to match. **The error record goes to RUNNING_ISSUES** (a new entry: the design text promised a latch the code never built, and one retirement text contradicted the other) **and the commit message.** |
| **P7** | **C-P5's carrier — stated, then made to hold** | A5 | C-P5 is the two-week RATE. **Window (r3, condition D):** content 2026-10-19 00:00Z → 2026-11-02 00:00Z = the daily files `error__2026-10-20` … `error__2026-11-02` (named by rotation day, A5). The first day with pause lines is Monday 10-19 (65); Sunday 10-18 has none (venue shut). **Carrier — ALREADY INSTALLED, the first implementation act, 2026-10-21 01:31Z:** a self-ending staging harvest (`/home/deploy/harvest/ccc_cp5.sh`, exits 2026-11-04 02:00Z) that writes each daily file's `VENUE_PAUSE`/`VENUE_PAUSE_RESUMED`/`XS_FRAME` lines, gzipped, to `/home/deploy/harvest/cp5/`. Backfilled at once: `error__2026-10-20` 563,889 lines (65 pause) and `error__2026-10-21` 555,118 (83 pause), ~3.4 MB each. Retention floor measured: 14 daily files, so a day is lost 14 days after rotation; the harvest takes each file within an hour of rotation. **Positive control moved off out.log (condition D iii):** the per-day `VENUE_PAUSE` line count in the harvested `error.log` lines proves a pause tick with a position held, in the 14-day carrier; `venuePauseExitTicksSinceStart` exists (`aee:3411`), but its out.log carrier cannot be read back. **No new table:** the read is pre-registered once, and the harvested lines are its record. If C-P5 is later run continuously, it needs a row; that is not this increment. **Closing instrument (Langston condition C):** a scheduled system alert, owner CC-C, firing **2026-11-02T02:00:00Z** (after the harvest has taken `error__2026-11-02`), whose body carries the read, its population and the upper bound **2026-11-02T00:00:00Z**. **Counter convention:** the `[EVAL_EXIT]` pause counters are SINCE-START and reset on every restart (CC-A's deploy 2026-10-20 23:13:17Z already fell inside the window), and they are not the read's carrier. If quoted at all, they are read per restart segment as each segment's last value, never summed or differenced across a restart. **Positive control per sub-window:** each day a would-fire zero is read carries that same day's `VENUE_PAUSE` line count, which must be > 0. |
| **P8** | **Docs at Step 10** | A8 | SIM: a `exit-trigger.ts` entry (three callers, the vocabulary, the fence). System Manual §3.5.1b and §18.0.1: one rule, three sites, named. SM's pause section: decide-at-resume, no latch, and `bidWouldFire` read as the artifact rate. |
| **P9** | **Re-point the pinned test assertions — never delete them** | A1 test-site census; Langston BLOCKER-3 | Each assertion listed in A1 is rewritten to pin the same SUBJECT against `selectExitTrigger(…)`: the paper call passes `otherClass: 'mark'` and the gated arm; the VTS real and shadow calls pass `otherClass: 'none'` and the class bid; VTS starts NULL (the valve test's subject, `b-vts-no-decision-valve.test.ts:64-65`, re-pointed to the `'none'` policy). Each re-pointed assertion keeps its original intent in its title. A changed assertion that no longer fails under its old mutation is a defect. |
| **P10** | **Delete the dead `?? 'unset'`** | A10 | `aee:3802`'s `` `mark reason=${xsFrame.armOff ?? 'unset'}` `` becomes the selector's reason, with no default label (§15, the census in A10). |

**P1's rule (sketch):**

| class | armed | bid | price | basis | reason |
|---|---|---|---|---|---|
| `crypto_spot` | (no arm field — A12) | present | bid | `bid` | `ok` |
| `crypto_spot` | (no arm field) | null | null | `none` | `bidRefusal ?? 'no_bid_side'` |
| `xstock_spot` | true | present | bid | `bid` | `ok` |
| `xstock_spot` | true | null | null | `none` | `bidRefusal ?? 'no_bid_side'` |
| `xstock_spot` | false | — | mark | `mark` | `armOff` (required by the type; a missing one throws — contained by `aee:2109`'s per-position `try`, so it fails as a HOLD; A10) |
| any other class, `otherClass: 'mark'` (paper) | — | — | mark | `mark` | `class_mark` (`8a-P4b` r1 BLOCKER-1, `aee:3749-3751`) |
| any other class, `otherClass: 'none'` (VTS real, shadow) | — | — | null | `none` | `class_unbranched` (`3n.q3` Step-4 condition 2, `vts-runner.ts:3939-3942`) |

**P1's per-site inputs, verbatim (r3, Langston BLOCKER-4):**

| site | class | input passed |
|---|---|---|
| T1 paper (built in the loop at today's `aee:3169` argument slot; passed into `checkExitConditions` in place of `triggerBid` + `xsBidArmed`) | crypto | `{ cls: 'crypto_spot', bid: _lsSel.ok ? _lsSel.quote.bid : null, bidRefusal: _lsSel.ok ? (_lsSel.quote.bid === null ? 'no_bid_side' : null) : _lsSel.tickerRefusal }` |
| T1 paper | xStock | `{ cls: 'xstock_spot', arm: xsBidTriggerArmed ? { armed: true } : { armed: false, armOff: xsBidTriggerOff }, bid: xsBid, bidRefusal: xsBid === null ? (xsFrameReason ?? 'no_bid_side') : null, mark: currentPrice }`. `xsBidTriggerOff` is non-null whenever unarmed (A10's census); a null there makes P1 throw (A10's blast radius: a hold). |
| T1 paper | other | `{ cls: 'other', otherClass: 'mark', mark: currentPrice }` |
| T2 VTS real (`vts-runner.ts:3942-3966`) | crypto | `{ cls: 'crypto_spot', bid: _vtsExitBid, bidRefusal: _vtsExitRefusal }` (today's `:3963-3965`) |
| T2 VTS real | xStock | `{ cls: 'xstock_spot', arm: { armed: true }, bid: _xsExit.bid, bidRefusal: _xsExit.bid === null ? _xsExit.reason : null, mark: currentPrice }` — ungated by design: VTS's guard is the stateless selector upstream (Langston (a) condition 1) |
| T2 VTS real | other | `{ cls: 'other', otherClass: 'none', mark: currentPrice }` |
| T3 VTS shadow (`:4728-4742`) | crypto / xStock / other | as T2, from the shadow's own selections (`:4730`, `:4742`); its refusals are new (P2) |

**UNAUDITED:** none. Every plan item cites its finding.

**Step 7 (pre-registered here):** behaviour-preserving, so the read is that nothing moved. Over the first full regular session after deploy:
- every xStock `EXIT_TRIGGER` still reads `basis=bid` while armed;
- the T2/T3 refusal counts keep their pre-deploy shape;
- the decision counts per lane are within that session's normal range (a count comparison, not a rate).

The shadow lane's new reason count is the only new number.

## 3. Plain-language summary
The audit found that three places decide when a stop or target has been hit, one for paper and two for the VTS. Each picks its trigger price in its own words, and the shadow VTS lane does not say why it skipped. The plan gives all three one rule, written once, with a test that fails if a fourth place appears or one of them drifts. It changes no decision.

It also corrects the plan's own text:
- The "price floor" is gone, and the documents now give the right reasons.
- The "latch" that was meant to remember a stop through the after-hours pause is not being built. The pause's quotes are the very ones we don't trust, and you have said a position simply holds overnight.
- The pause's retirement test now has its data kept long enough to read it.
