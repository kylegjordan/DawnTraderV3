# B-XSTOCK-BID-TRIGGER-RELAND (row 2) — C-P5 RETIREMENT — STEP 4 CHANGE LIST

**GRADED REF:** `origin/migration/aws-supabase` @ `f61207159` (code commit). Plan r2 `1e5aba6e1` (was `134bcfa42` before rebase).

## Dispatch header
| # | field | value |
|---|---|---|
| i | **declared change-class** | `sub_batch` (row 2's own C-P5 outcome; parent scope `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`) |
| ii | **doc set** | `SCOPE`: present (parent) · `PRE_AUDIT`: **present** `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_CP5_RETIREMENT_PRE_AUDIT.md` r2 · `COMPLETION_REPORT`: absent — row 2's progress report `Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md` converts at row 2's Step 11 · `BATCH_CATALOG`, `PHASE_HISTORY`: Step 10 · `SYSTEM_MANUAL` (§3.5.1 + pause bullet `:5027`): Step 10 · `SYSTEM_IMPACT_MAP` (`market-hours.ts` entry `:2923`, condition 6): Step 10 · `CHANGES_AND_FIXES`: Step 10 · `RUNNING_ISSUES` (`#943` forward dependency): Step 10 · `DELETED_COMPONENTS_LOG`: **present in this commit** · `ADJUSTMENT_FRAMEWORK` (A7 named-impact line): Step 10 · `PHASE_19_PLAN`: N/A — no row there · `SPRINT_TO_LIVE_PLAN` row 2: Step 10 · memory files + task list: Step 10 |
| iii | **Step-2 reference** | the pre-audit above, r2 at `1e5aba6e1`; Langston PROCEED Discord `1571717549157130291` |

## What changed (8 files, +109 / −132)
**DELETED — `server/services/active-execution-engine.ts`:**
- the C-P2 block (was `:3405-3452` at `b1634120e`): `if (_posClass === 'xstock_spot') { const _vp = isXstockVenueTransitionPause(…); … if (_vp.paused) { … continue; } if (_pend) { … VENUE_PAUSE_RESUMED … } }` — archived at `1-system-manual/_archive/deleted-code/active-execution-engine.venue-pause-exit-block.20261116-B-XSTOCK-BID-TRIGGER-RELAND.ts.removed`;
- fields `_venuePauseExitTicks`, `_venuePauseWouldFire`, `_venuePauseBidWouldFire`, `_venuePausePending` (+ its doc block);
- `[EVAL_EXIT]` fields `venuePauseExitTicksSinceStart`, `venuePauseWouldFireSinceStart`, `venuePauseBidWouldFireSinceStart`, `venuePausedPositionsNow`;
- close cleanup `this._venuePausePending.delete(position.id); // row 2 increment C`.

**KEPT (A1):** `_venuePauseEntriesRefused` + `venuePauseEntriesRefusedSinceStart` (C-P3's writer at `aee:608`); the predicate; VTS lane; archiver `sun_reopen`.

**MODIFIED — comments only:**
- `aee` hollow-arm header (`~:2580`): "The venue-transition pause below relies on this" → "Since the exit pause's retirement (C-P5, 2026-11-16) this hold is the ONLY upstream protection against a blown handoff book … see the forward dependency at `ri_abs_spread_ceiling_pct`."
- the field-block header → names C-P3 and the retirement.
- `book-state.ts` seed, above `ri_abs_spread_ceiling_pct: 1.0`: ⛔ FORWARD DEPENDENCY — raising the ceiling, switching `spread_blown` off, or adding a yield path that releases `spread_blown` re-opens the venue-pause question.
- `book-state-config.ts` bounds check: one line pointing at the seed.

**TESTS:**
- `inc2-chain`: the C-P2 describe (2 its) → **new fence**: at 16:20 ET (inside 16:15), a 0.2%-wide book with the bid 399.4 through the 399.5 stop (mark 399.8 not) ⇒ no `[VENUE_PAUSE…]` line, evaluated on the bid, one close, no price skip; plus its outside-window control. **Mutation proof:** re-inserting `if (_posClass === 'xstock_spot' && isXstockVenueTransitionPause(new Date()).paused) continue;` before `// Check for exit conditions` fails the in-window test only (1 failed / 10 passed). (Against the whole old engine both fail, but that run is not a discriminator: the trimmed fixtures lack `_venuePausePending`.)
- `incc`: C-P2 describe → **re-pointed** (condition 3): anchors `checkExitConditions(`, `advanceBookStateComparator(\n`, the yield-refused arm (`_recordPriceSkip(position, 'book_state_yield_refused');\n … continue;`) and the hollow-skip arm (`_recordBookStateEvent(position, { kind: 'skip', …`); asserts all three precede the exit decision, the hollow arm's slice to its `continue` holds no `checkExitConditions(`, and the exit loop holds no `[VENUE_PAUSE]` / `_venuePausePending`.
- fixtures: four exit fields removed from `inc2-chain:212-216` and `b-class-leg:180-184`; `_venuePauseEntriesRefused` kept.
- Local: the three files 30/30 pass. `tsc --noEmit` 324 errors at both HEAD and the change (the 3 in `aee` are pre-existing, `:5575/:5614/:5666` `assetClass`).

## Judgement calls to attack
1. **The re-pointed fence's anchors are source strings.** A refactor that renames `_recordBookStateEvent` breaks the CONTROL, which is the intended loud failure, but a reorder that moves the hollow arm after `checkExitConditions` is what it catches. Is string order the right probe, or should it be a driven test (a blown book at 16:20 ET ⇒ held, no decision)?
2. **No driven `sun_reopen` test.** The predicate's `sun_reopen` window is still unit-tested in `incc`; the exit path has no window-specific code left to test.
3. **Archive holds the block only**, not the deleted fields (git has them).

## Deploy
`dt-deploy <full sha> --by cc-c --in-window B-PRICE-SIDE-BY-JOB,B-XSTOCK-BID-TRIGGER-RELAND` (plus whatever else the register shows open at deploy time). Exit side only; perturbs neither xStock-opens read (P7).
