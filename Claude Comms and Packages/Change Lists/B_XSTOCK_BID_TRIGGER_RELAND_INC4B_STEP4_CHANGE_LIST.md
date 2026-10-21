# B-XSTOCK-BID-TRIGGER-RELAND increment (4b) — STEP 4 CHANGE LIST (graded ref: the commit `f7ac48c80` on `origin/migration/aws-supabase`)

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | **this increment: `non_architecture`** (Langston Step-2 condition (e); it rests on BLOCKER-1 and BLOCKER-4 being fixed, and both are fenced). The batch scope header stays `architecture`. ⚠️ The diff touches `active-execution-engine.ts` and `vts-runner.ts`, so the checker's core-path cross-check may flag possible under-declaration — the pre-audit header answers it. |
| ii | **that class's doc set** | SCOPE — present: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` (objective 8; objective 7's latch text corrected in this commit) · PRE_AUDIT — present: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4B_PRE_AUDIT.md` r4 · COMPLETION_REPORT — the batch's PROGRESS report, `Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md` (Step 10) · BATCH_CATALOG / PHASE_HISTORY — Step 10 · SYSTEM_MANUAL / SYSTEM_IMPACT_MAP — judged applicable; owed at Step 10 (P8: an `exit-trigger.ts` SIM entry; §3.5.1b and §18.0.1 name the one rule) · CHANGES_AND_FIXES — judged applicable, Step 10 · RUNNING_ISSUES — `#1231` in this commit |
| iii | **Step-2 reference** | `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4B_PRE_AUDIT.md` — Langston APPROVED r3 for P1-P6 and P8-P10 (2026-10-21 ~01:50Z). P7 (the pause's C-P5 carrier) is r4, in review; this diff does not depend on it. |

## What changed (P-items from the plan)
**NEW `server/core/trading/exit-trigger.ts` (P1/P2).** `selectExitTrigger(input)` is a pure function over an input **discriminated by class first**: `{cls:'crypto_spot',bid,bidRefusal}` · `{cls:'xstock_spot',arm,bid,bidRefusal,mark}` · `{cls:'other',otherClass,mark}`. It returns `{price, basis, reason}`, where `reason` is one `ExitTriggerReason` union (`ok | class_mark | class_unbranched | guard_off | spread_blown_off | no_bid_side | XsLiveReason | TickerRefusal | XsFrameRefusal`). An unarmed xStock without an off-reason throws.

**Paper (P3, `active-execution-engine.ts`).** The loop's old trigger slot and the `xsBidArmed` argument are replaced by one ingredients object. The rule runs inside `checkExitConditions` on the position's OWN `assetClass` — kept on that field, not the loop's `_posClass`, so the class decision did not move:
```ts
// loop (was: `_lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : (_posClass === 'xstock_spot' && xsBidTriggerArmed ? xsBid : null)`, … , `_posClass === 'xstock_spot' && xsBidTriggerArmed`)
{
  bid: _lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : (_posClass === 'xstock_spot' ? xsBid : null),
  bidRefusal: (_lsSel !== null
    ? (_lsSel.ok ? (_lsSel.quote.bid === null ? 'no_bid_side' : null) : _lsSel.tickerRefusal)
    : (_posClass === 'xstock_spot' && xsBid === null ? (xsFrameReason ?? 'no_bid_side') : null)),
  // (Step-4 condition, `xsFrameReason` is declared `XsFrameRefusal | null` at its source, so the inner cast was removed at `b93be7f76` and the redundant outer `as ExitTriggerRefusal | null` at the next code commit (Langston's record item 1) — tsc unchanged both times.)
  xsArm: _posClass === 'xstock_spot'
    ? (xsBidTriggerArmed ? { armed: true as const } : { armed: false as const, armOff: xsBidTriggerOff as XsArmOff })
    : null,
},
// checkExitConditions, right before evaluateTECExit
const _trigCls = exitTriggerClass(positionAssetClass);
const exitTrigger = selectExitTrigger(
  _trigCls === 'crypto_spot' ? { cls: 'crypto_spot', bid: exitTriggerParts.bid, bidRefusal: exitTriggerParts.bidRefusal }
  : _trigCls === 'xstock_spot' ? { cls: 'xstock_spot', arm: exitTriggerParts.xsArm!, bid: exitTriggerParts.bid, bidRefusal: exitTriggerParts.bidRefusal, mark: currentPrice }
  : { cls: 'other', otherClass: 'mark', mark: currentPrice },
);
const xsBidArmed = _trigCls === 'xstock_spot' && exitTrigger.basis !== 'mark';
// evaluator input: was the three-way ternary
triggerPrice: exitTrigger.price,
```
- The frame line prints `basis=${xsBidArmed ? 'bid' : `mark reason=${exitTrigger.reason}`}`. **The dead `?? 'unset'` is gone (P10), and so is the now-unread `xsFrame.armOff`.**
- The four `EXIT_TRIGGER` log lines print `trigger=${exitTrigger.price ?? currentPrice}`, a log-only coalesce exactly as before.

**VTS real (P3).** `let _vtsTriggerPrice = null` and its two assignments are replaced by `const _vtsTrigger = selectExitTrigger(…)`, where xStock passes `arm: { armed: true }` and the other-class policy is `'none'`; then `triggerPrice: _vtsTrigger.price`. `_vtsExitRefusal` becomes the rule's reason when the price is null (identical for crypto and xStock; `class_unbranched` for an unbranched class, which is unreachable — A9).

**VTS shadow (P3).** `const _sTrigger = selectExitTrigger(…)`, same policy; `triggerPrice: _sTrigger.price`. **New, log only:** the shadow now captures its own refusal (`_sExitRefusal`), and on a `no_transactable_side` decision `_vtsShadowLastRefusal` stores `no_transactable_side (<reason>)`. That reaches the unpriced-close record's `lastRefusal`, which read `null` on all 62 trades in alert `cb6a5aa1`.

**Fences (P4, P9).**
- **New `b-xstock-bid-trigger-reland-inc4b.test.ts`:**
  - the frozen fixture (11 rows, including a crypto row cast `armed:false`);
  - six in-test mutants, each RUN and failing it (class-after-arm, ungated, mark fallback, inverted, paper policy everywhere, default label);
  - the 3-site decision fence, whose docstring says it does not catch a path that bypasses `evaluateTECExit`;
  - a repo-wide scan for a fourth caller;
  - the per-lane policy fence;
  - the A10 census fence, each with a control.
- **The `guard_off` arm**, through the real exit loop: `inc2-chain` gains `h.guardEnabled` and a describe asserting ` on=mark` and `basis=mark reason=guard_off`, with no `reason=unset`.
- **Twelve pinned assertions re-pointed**, subjects kept: `8a-P1` 2b/2d/2f/2g; `8a-P3`; `8a-P4b` ×4 (slot, three-way, log-only, the trigger log); `8a-P4c` ×2; the valve's "starts NULL"; the frame wiring. One was outside my Step-2 census: `…-frame.test.ts` "the caller carries the basis and the reason into the frame". It pinned `armOff: xsBidTriggerOff,` inside the frame object; it now pins the rule's reason and the absent default.

**Source mutations RUN (Langston condition B), then restored:**
- **S1** (an unarmed xStock given its bid) → **5 red:** `8a-P1` 2d; `inc2-chain` CONTROL (spread_blown_off) and guard-off; `inc4b` fixture and mutants.
- **S2** (paper other-class `'none'`) → **3 red:** `8a-P1` 2d; `8a-P4b` X3 three-way; `inc4b` policy.

**Design text (P5, P6).**
- The stale `aee` comment ("xSTOCK: THE MARK … one-token re-land") is replaced.
- Corrected in their BODIES: scope objective 7 (the latch and the retirement wording) and the increment-3 line; design `:51` (dissolved), `:89` (struck by r5 answer 1), `:131` (decide at resume, no latch), `:133` (one rule; floor withdrawn; no latch).
- Error record `#1231`. The INCC pre-audit and change list were swept: they carry no latch promise.

**Checks:** tsc 329 = baseline 329. Unit suite: 4,315 passed. The only failures (5 files, 2 tests: `b-staging-liveness-watch`, `b-tsc-baseline-fix`, `b63-item12`, `b63-item16`, `b-root-duplicate-scanner-retire`) fail identically with this diff stashed — local, pre-existing.

## Judgement calls to attack
1. **The class decision stays on `positionAssetClass`** (the raw field, which throws if absent) rather than the loop's validated `_posClass`, so it cannot move. The `xsArm!` non-null assertion relies on "raw `xstock_spot` ⇒ validated `xstock_spot`" — is that tight?
2. **`usable(bid)` also rejects a non-finite bid.** Before, a NaN bid would have reached the evaluator. The ladder and the guarded selector never emit NaN (both test finiteness), so I count this as no behaviour change — say if you disagree.
3. **The shadow `lastRefusal` text change** is a visible field change on the unpriced-close record: log only, never a decision. Is that within `non_architecture`?
4. **The throw on a missing off-reason** (rather than returning a labelled mark). The census says it is unreachable, and its failure mode is a hold.
