# B-XSTOCK-BID-TRIGGER-RELAND increment (4a) — the no-decision rails clear themselves — STEP 4 CHANGE LIST (CC-C, 2026-10-16)

## DISPATCH HEADER (workflow-04)
| field | value |
|---|---|
| **i — declared change-class** | `architecture` (row 2 scope header, unchanged) |
| **ii — doc set for the class** | scope: PRESENT `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §INC-4A (objectives 10-13, scope :203 amended for P1b) · Step-2 audit + plan: PRESENT `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r1-r5a · change list: THIS FILE · migration + rollback + MANIFEST: N/A — no schema or `module_constants` change (alert-file rows only) · Step-10 docs: ABSENT, owed — `SYSTEM_IMPACT_MAP.md` (objective 13, P6: the two rails, the standing record, the sweep), `ADJUSTMENT_FRAMEWORK.md:606` (names the per-symbol key — Langston r4 condition 2), `RUNNING_ISSUES.md` `#1191`, `BATCH_CATALOG.md`; `SYSTEM_MANUAL.md` judged N/A (alert reporting, no trading/strategy/math change) · completion report: ABSENT — at row 2's close |
| **iii — Step-2 reference** | the pre-audit above — **Coltrane APPROVED r5 at `7977b2d0103b527cc7f2cd99452c8411ce76683b` (13:38Z)**; **Langston APPROVED r4 (13:27Z) with five in-commit conditions, folded in r5a (`18066f135`)** |

**Code commits:** `2075a8fc8` (rebased to `7977b2d01`) — the rails, P1b, tests · `18066f135` — r5a (Langston's r4 conditions 3-5) · the r5b commit — Langston's r5 conditions 1-2 (the empty-record re-read and post-resolve page; a null member write pages).

## THE CHANGE, BY PLAN ITEM
**New pure rules — `server/core/trading/vts-rail.ts`:** `vtsXstockJoinsStandingRecord(lastReason, verdict)` (P2: ONLY `too_wide`, and `too_old` on a `quiet`/`closed` cohort verdict, join; everything else pages) · `stepMemberClock(prev, nowMs, regular, etDate)` (P3: off-session clears; a stored start from another Eastern date restarts at zero) · `railRowClear(createdAt, decidedAtMs, tradeClosed)` (P1: `Date.parse(created_at)`, never a string compare) · `railKey(symbol, tradeId)` = `no-trigger-vts-<SYMBOL>-<tradeId>` (r4 per-trade key).

**New IO — `server/services/vts-rail-reporting.ts`:**
```ts
// P1: decision → durable mark; null return counted (r5a condition 3)
deps.mergeAlertMetadata(rowId, { decidedAtMs: nowMs })
  .then((row) => { if (row === null) railCounts.markMisses++; if (state.rowByTrade.get(tradeId) === rowId) state.rowByTrade.delete(tradeId); })
// at-mint index (r3) — in pageOwnKey, from the row addAlert returns
const mintedNow = Date.parse(row.created_at) >= nowMs;
if (mintedNow) railCounts.minted++; else railCounts.dedupeHits++;
if (row.metadata?.tradeId === c.tradeId && isOpen(row)) state.rowByTrade.set(c.tradeId, row.id);
// r5 (Coltrane BLOCKER): a re-join after a decision starts a FRESH member
const storedDecided = rec.metadata?.[decidedField(c.tradeId)];
const prev = stored && !(typeof storedDecided === 'number' && storedDecided > stored.joinedAtMs) ? stored : null;
```
Sweep (`runVtsRailSweep`, once a minute, `void`-called after `resolveOpenVirtualTrades`): resolves rail rows (DECIDED-AFTER-MINT / TRADE-CLOSED, actor `vts-exit-monitor`), steps member clocks, escalates a member at 30 min of session time on its own key, removes decided/closed members, resolves the empty record, raises/clears `vts-quiet-resolve-stuck` (10 failed sweeps, or a closed member surviving 3), rebuilds the index, logs `[VTS_RAIL][SWEEP] … crossings joins pagesAttempted minted dedupeHits escalations markMisses … alertFileBytes=`. `closedTradeIds` = `sql.join` IN list; a trade is closed only when its row is PRESENT with `closed`/`closed_at`.

**Runner hooks — `server/services/vts-runner.ts`:**
```ts
// before the first decision of the pass
{ const _rd = await vtsRailDeps(); if (_rd) ensureVtsRailIndex(_rd); }
// on a decision
if (_ntReason === undefined) { const _rd = await vtsRailDeps(); if (_rd) markDecided(tradeId, _ntNow, _rd); }
// the crossing: was addAlert({… dedupe_key: `no-trigger-vts-${trade.symbol}` })
await onCrossing({ tradeId, symbol: trade.symbol, assetClass: trade.assetClass, lastReason: _nt.lastReason, pageSinceMs: _nt.pageSinceMs ?? _ntNow, title, body }, _ntNow, _rd);
// P4: real-lane unpriced close (per-trade warning, names its session) and the shadow lane's merged count row
```

**Paper sibling (P1b) — `server/services/paper-no-trigger-clear.ts` + `server/services/active-execution-engine.ts` (CC-B's engine — please review this touch):**
```ts
// mint: the row carries the position id and is indexed at the mint
const _ntRow = await addAlert({ …, metadata: { positionId: position.id }, dedupe_key: `no-trigger-${this.mode}-${position.symbol}` });
void this._noTriggerRailCtx().then(({ rail }) => rail.noteMint(_ntPid, _ntRow as any))
// decision (beside `_noTriggerStreak.delete`): durable mark, fire-and-forget
void this._noTriggerRailCtx().then(({ rail, deps }) => rail.markDecided(_dPid, _dAt, deps))
// after the cycle, beside the venue-quiet sweep
void this._runNoTriggerRailSweep(); // row 2 (4a) P1b
```
Resolved by the EXISTING `active-exit-monitor` when the position decided after the mint, or a `position_closed` row in `active_trade_logs` names it. Key stays per symbol: unique index `active_open_positions_symbol_idx`.

**`server/services/system-alerts.ts`:** `ALERT_ACTORS` gains `vts-exit-monitor` (machine); `active-exit-monitor`'s description names its `no-trigger-<mode>` rows.

## TESTS
`server/tests/unit/b-xstock-bid-trigger-reland-inc4a.test.ts` 30/30, on an in-memory alert store with the production dedupe rule. **Named mutations, each red then restored:** (a) no durable row mark → 2 red · (b) no at-mint index write → 2 red · (c) no Eastern-date check (Thursday → Friday) → 1 red · (r5) no member-decision write → 4 red · re-join inherits the stored member → 1 red · (r5b) resolve on the snapshot → 1 red · no post-resolve check → 1 red · ignore a null member write → 1 red. Cold-window fence: `VTS_NO_TRIGGER_ALERT_AFTER_MS` (10 min) > `NOT_WARM_GRACE_MS`. `b-price-side-8a-p3-crypto-finish.test.ts:186` re-pointed to the per-trade route. `tsc` 335 = baseline. CI on `7977b2d01`: green.

## MEASURED RESIDUALS, STATED
1. Paper: 242 `position_closed` log rows vs 251 paper closes in 14 days — a close with no log row leaves its alert for a human (the safe direction).
2. Store: per-trade keys turn A3's suppressed pages into mints for the EXCEPTIONAL set; nothing prunes resolved rows (Langston: ~+0.7 MB/day estimate on a 4.26 MB file every writer rewrites). The sweep line now prints the size; the pre-registration fails above ~1 MB/day.
3. A row minted before this change with no `tradeId` in metadata is matched by its body (`open virtual trade <id> in`); one that matches nothing is left for a human.

## JUDGEMENT CALLS TO ATTACK
1. **The engine touch (CC-B):** three fire-and-forget calls on the exit path (`noteMint`, `markDecided`, the sweep). Each `markDecided` call is a resolved-promise hop per deciding position per tick, and writes only when that position holds an open rail row. Acceptable on the exit loop, or gate the call on a cheap in-memory "has a row" check?
2. **Closed = a `position_closed` trade-log row**, not absence from `active_open_positions`. Right call given the 9-of-251 gap, or should an absent open-position row ALSO count after N sweeps?
3. **A3's `suppressed` → `dedupeHits` + `joins`** in the pre-registration mapping. Is that the right comparison for the post-deploy read?

## STEP 4 r2 — COLTRANE'S SEND-BACK (14:10Z, at `d35353fb6`) FOLDED: three blockers
1. **The paper rail could record a decision that was not one.** Only `no_transactable_side` returns early; `no_usable_mark` reaches the decision site too. The mark now goes through `_noteNoTriggerRailDecision(positionId, decision.noDecisionReason)` (`server/services/active-execution-engine.ts`), which marks ONLY when the reason is `undefined`. Caller-level test on the REAL prototype method: `no_usable_mark` and `no_transactable_side` mark nothing, a real decision marks; plus a fence that the decision site passes the evaluator's reason. Mutation (guard off) → 1 red.
2. **P3's reason-transition rule was missing.** New `onMemberReason` (`server/services/vts-rail-reporting.ts`): on every refusing pass of a standing-record member inside the paging session (`vts-runner.ts`, guarded by `isStandingMember`), a reason that is NOT expected tombstones the membership and pages on the trade's own key at once (counted `reasonExits`). An exceptional crossing for a trade that is a member also tombstones the membership (`leaveStandingRecord`). Tests + mutations (never leave → 1 red; no tombstone on the crossing → 1 red).
3. **Objective 12's evidence.** Real lane: the warning carries the hold and the last refusal reason (`_vtsLastRefusal`, kept apart from the streak because the max-hold close is itself a decision that clears the streak); metadata `{symbol, hold, lastRefusal}`. Shadow lane: each entry in the count row's `lastTrades` carries `{symbol, hold, lastRefusal}` (`_vtsShadowLastRefusal`). Test + mutation (drop the reason → 1 red).
**Judgement calls (Coltrane):** fire-and-forget cost accepted; positive `position_closed` evidence accepted; `joins + dedupeHits` accepted as the post-deploy decomposition, not a renaming of A3's suppressed — the pre-registration reads it that way.
**Tests:** inc4a 37/37; 68 engine/runner/rail files 1112/1112 (one file fails to parse locally — `b-tsc-baseline-fix`, untouched, environmental). `tsc` = baseline.

## STEP 4 r3 — LANGSTON'S SEND-BACK (14:17Z) FOLDED
- **Paper key per POSITION** (`paperRailKey(mode, symbol, positionId)`; engine mint uses it). Succession test + mutation (per-symbol key → 1 red). Plan r5e.
- **The cited `active_open_positions_symbol_idx` does not exist in the database** (`#1113`); comment corrected — the live constraint is `UNIQUE (symbol, side)`.
- **Pre-registration reading replaced** (plan r5e): crossings conserved · joins the expected share · pagesAttempted falling · `dedupeHits == 0` a separate tripwire.
- Escalation clears `decided_` too. CI is cited at the graded ref from now on.
**Tests:** inc4a 38/38. `tsc` = baseline.
