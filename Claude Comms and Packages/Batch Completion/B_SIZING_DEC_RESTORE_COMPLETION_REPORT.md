# B-SIZING-DEC-RESTORE — Completion Report

change-class: `architecture` · sprint plan row 9 · `#698` (with `#659`, `#569`) · owner CC-C (Analyst Claude) · ✅ **CLOSED 2026-10-09** (Step 11 CONFIRMED by Langston 2026-10-09 07:42Z)

## 0. Open beyond this batch (stated first, by rule)
- **obj-5 — the AMR posture size term is NOT applied, by design.** The seam is in place (`resolveEffectivePositionPct`), but the AMR is in shadow, so no posture is applied. **Condition C-5 binds whoever activates AMR sizing:** the term lands INSIDE that resolver, and the existing `TRUST_SIZED` application in `processSignal` (`active-execution-engine.ts`, `quantity × (modeOverlay?.positionSizeMultiplier ?? 1)`, re-read at the ref 2026-10-09) moves into it. **Home:** `#616` (AMR activation, CC-B), recorded in `CHANGES_AND_FIXES.md` FIX-2026-10-09-A. **Failure if skipped:** N slots sized at ×1.25 = 125% of the exposure budget.
- **The dashboard's Active Trades card reads 0** (seen during this batch's UI check, 2026-10-09) while 20 paper positions are open. **Not this batch:** it is `#573`, which reads the retired `paper_trades` table, and is placed at sprint row 97a (`B-PAPER-LEGACY-TABLE-REWIRE`, CC-B).

## 1. What it was for
Kyle (2026-08-05): *"Position sizes and trading slots are controlled by the portfolio balance, the exposure percentage of that balance, and the percentage of the balance allocated to any one trade … The old additional fields have been re-added and need to be removed and deleted."* Later directives added more: delete the Phase-11 (11.7S) posture damper and the legacy tuner (2026-08-06/07); one shared pot, an open-slots count that is derived, a non-destructive paper reset (2026-09-29); the pattern cap and the fallback sizer off, and the chat's trade-action path deleted (2026-09-30); $820 at 5% with 20 slots and a 15% kill switch (2026-10-05/06).

## 2. What shipped
| increment | what | ref |
|---|---|---|
| Step 3 (1-n) | obj-1 sizing = `balance × e × p × buffer`; obj-10 the class-less 11.7S overlay deleted; obj-11 the LATTI tuner + six endpoints deleted; reappearance fence | `0172e0376`, `22e133a5c`; live at `213e162dc` (2026-08-07) |
| 2a | slots derived (`deriveSlotCount`); `max_open_positions`, `checkMaxOpenTrades`, `max_open_trades_default` deleted | `3d008bd0e` |
| 2b | the symbol cooldown by exact symbol and class (`#1093`) | in deploy B |
| 2c | `portfolio_risk_per_trade_pct` and risk ÷ stop sizing deleted; one formula (`tradeNotional` / `bufferedTradeNotional`) | in deploy B |
| 2d | the legacy sweep (AJ18 diagnostics, the clamp-bind stream and others) | in deploy B |
| 2e | Kyle's 2026-09-30 directives: pattern-list cap and `correlationScale` off, the fallback sizer deleted (an unsized signal is refused), the AI chat's trade-action path deleted (`#928`/`#929` closed) | `06fa8ba04`, `7e689e1f3` |
| 3 r1-r8 | the non-destructive paper reset script (balance on the command line, writes no setting) | `436ff1ac8`, `7f7d50f9d`, `f8cfc60f2` |
| 3 r9 | the promotion loop logs a full book (`BOOK_FULL` / `BOOK_SLOT_FREE`, `#698` am.5) | `cfc1d9c67`, `9c162aabc` |
**Deployed:** deploy B `3576d39810fa7428501b68ce341ee46533c24935`, 2026-10-06T15:45:04Z (seven migrations); reset complete 15:53:00Z at $820. r9 in `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, 2026-10-07T15:56:00Z (`dt-deploy --by cc-b`). **CI** on `0c8ef5da2`: run `37566679783`, all four jobs `success` (per job, re-derived by Langston 2026-10-08).

## 3. Objectives
| # | objective | result | evidence |
|---|---|---|---|
| 1 | sizing = a share of the balance | **YES** | Step 8 row 1 (Langston, re-derived): 17 opens at $38.02-$39.81 against $39.77 = 820 × 1 × 0.05 × 0.97; all 40 opens since the reset carry `anchor_balance_at_open=820.00` |
| 2 | slots derived, the same share on both sides | **YES** | `deriveSlotCount(resolveEffectivePositionPct(p)) = floor(100/p)` = 20; the guardrails tab shows *"Open positions allowed: 20 slots — 5% per position (… worked out from this setting, not set separately)"* (Chrome, 2026-10-09 ~07:31Z); 20 of 20 full on 10-06 evening |
| 3 | `portfolioRiskPerTradePct` deleted | **YES** | schema comment and dropped column (2c); absent from the guardrails tab; fence |
| 4 | `maxOpenPositions` deleted | **YES** | 2a migration; `trade-safety.ts` check 7 retired; absent from the tab; fence |
| 5 | AMR posture dial preserved at ONE point | **PARTIAL — by design** | the seam exists and is the identity; the AMR is in shadow; C-5 binds activation (§0) |
| 6 | the other modulators dispositioned | **YES, as re-decided** | pattern cap and `correlationScale` REMOVED (Kyle 2e, superseding the ratified `min()`); buffer KEPT (see §5) |
| 7 | live wired identically | **YES (code)** | the same sizer and resolver on the live `guardrails_v2` row; no live activation (Phase 21) |
| 8 | loud, fenced deletions | **YES** | `b-sizing-legacy-deletion-fence.test.ts`; `DELETED_COMPONENTS_LOG.md` entries 2026-08-07 (tuner), 2026-08-07 (11.7S, backfilled at Step 10), 2026-09-29 ×3, 2026-09-30, 2026-10-06 |
| 9 | UI verification | **YES** | guardrails tab in Chrome, 2026-10-09: exposure 100%, kill switch 15%, max position 5%, 20 derived slots, buffer 97%; no Max Open Positions, no Portfolio Risk per Trade |
| 10 | 11.7S deleted | **YES** | `22e133a5c`; the module header and fence |
| 11 | tuner deleted | **YES** | `0172e0376`; `#659` closed |
| 12 | non-destructive reset | **YES** | 15:53:00Z 10-06; rows kept; open positions closed with the reset label (`d13f2683a`) |
| 13 | kill-switch level | **YES** | Kyle: 15% (`7580b89f0`); `daily_loss_kill_switch_pct=15.00`, not tripped (Langston, Step 8) |
| 14 | the size-monitoring alert | **WITHDRAWN by Kyle** | *"Please remove the trade size alert"*; removed in 3 r6 (`436ff1ac8`), logged 2026-10-06 |

## 4. Reviews and verification
Step 1 r1-r8 · Step 2 per increment (2e PROCEED 2026-09-30 00:23Z) · Step 4 per increment (r9 APPROVED `9c162aabc`) · Step 7 `Change Lists/RELEASE_DEPLOY_B_STEP7_CCC.md` · **Step 8 CONFIRMED by Langston:** row 1 sizing (2026-10-06 22:39Z, two record conditions folded), row 2 `#1081` (`CHECK_THREW` 0, `GUARDRAIL_BLOCK` 1), row 3 `3n.q8` restart + the HUT live refusal (2026-10-09 07:22Z, after r2/r3 folds).

## 5. Numeric corrections
- **PREVIOUSLY STATED (scope obj-6): the 0.97 buffer is REMOVED. NOW: kept. REASON:** 2e (Langston J1a) found its live job: it keeps a full book inside the exposure check through a small balance drawdown.
- **PREVIOUSLY STATED (scope r7): reset to $3,000, about $145 a trade. NOW: $820, $39.77 a trade, 20 slots. REASON:** Kyle 2026-10-05/06.
- **PREVIOUSLY STATED (3 r5): kill switch 8%. NOW: 15%. REASON:** Kyle's redirect before deploy B (`7580b89f0`).
- **PREVIOUSLY STATED (Step-8 row 3, Langston): the guard saved about $2.60 on HUT. NOW: $2.95. REASON:** 0.44420761 × (87.64 − 81.00); his own correction.

## 6. New findings / dispositions
- **The 11.7S deletion had no `DELETED_COMPONENTS_LOG` entry** (the module header cited one). Backfilled at Step 10. DISPOSITION: folded into this batch.
- The dashboard's Active Trades card at 0 is `#573`. DISPOSITION: no work, withdrawn, citing `#573` / sprint row 97a.

## 7. Governance ledger (copied from the Step-10 commit)
CHANGE-CLASS: `architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: the one rule, the deletions, the increments, the deploys |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 9) | ✅ | status STEP 11 with this report linked; superseded values noted |
| T1 | PHASE_19_PLAN.md | ✅ | the 09-12 placement bullet marked finished, pointing to row 9 |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | N/A shared / ✅ mine | no shared truth changed; position line updated |
| T1 | the batch SCOPE | ✅ | r1-r8 |
| T1 | the batch PRE_AUDIT | ✅ | §1-§20 (per increment) |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | N/A | the scope names no observation window; Step 8 read the result at deploy |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-C row 9 at Step 11 |
| T1 | Langston's MEMORY.md | ✅ | 4a2 line compacted + sizing status, net −179 B (load 200,941 → 200,762) |
| T2 | SYSTEM_MANUAL.md | ✅ | *Position sizing — THE ONE RULE* added; retired rows struck in §2/§5/§6; the tuner §10, the file table and the three 11.7S passages marked DELETED |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | §6.3 rewritten to the one rule, the seam and the new downstream consumers |
| T2 | RUNNING_ISSUES.md | ✅ | `#698`, `#659` closed; `#569` closed with it |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-09-A: the post-sizer posture multiplier (125% budget) and C-5 |
| T2 | POST_AUDIT_ROADMAP.md | ✅ | the 2a line updated from "pending the held deploy" to deployed |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | the 11.7S entry backfilled (the others landed per increment) |
| T2 | GOVERNANCE_EXCEPTIONS.md | ✅ | the re-justification row (2026-10-09) for alert `dff68e3b` |
| T2 | LEVER_INVENTORY.md · CURRENT_SETTINGS_REGISTRY.md | N/A this turn | updated in-batch at 2a (B72-EXEC-017 retired; the `max_open_trades_default` annotation) |
| T2 | ADJUSTMENT_FRAMEWORK.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | none mentions the retired settings or this batch (grep, 2026-10-09) |
| T2 | BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · rule history · ALERT_HANDLING_PROTOCOL.md · DELIVERY_BOARD_PROTOCOL.md · CLAUDE_CODE_FEATURE_WATCH.md | N/A | no method, reviewer, rule, alert-process, board or feature-watch change |
| T2 | MISTAKE_PATTERNS.md | N/A | no `MISTAKE:` trailer in this batch's Step 10 or 11 |

- **Langston's Step-11 finding:** the fence's obj-10/11/4 blocks walk only `server/` + `client/src`, while obj-3 and 2d were widened. The surviving `maxOpenPositions` on the legacy v1 `guardrails` table (`shared/schema.ts:290`) is NOT a defect: that table has zero queries (his positive-controlled census). DISPOSITION: the walk gap is its own batch — `HOME: B-SIZING-FENCE-WALK-WIDEN (#1182), owner CC-C, placed in SPRINT_TO_LIVE_PLAN at row 9b1, after row 9b`.

## 8. Honest residual
- The fence's obj-10 block carries two boundary-matched positive controls (the scan can see `strategy-modes.ts`; every masked survivor is really exported) on top of the walk's own control, so the vacuous-pass class is instrumented. **What is missing is a mutation proof of the block, not evidence that it can fire** (Langston, Step 11).
- Live mode uses the same code and has never sized a real order (Phase 21).
- The AMR posture term (§0) is the one way a size can still leave `B × e × p × buffer`, and only when the AMR activates.
