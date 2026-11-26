# B-XSTOCK-BID-TRIGGER-RELAND #961 — Step 4 change list

**Declared change-class:** `architecture`, as declared in `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`.

| Architecture document | Status at review |
|---|---|
| `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` | Present. Row 2, objective 5. |
| `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_EXIT_FILL_PRE_AUDIT.md` | Present. Step 2 r6 at `0ade6d3154e0c356f7db8f21880c8d72060204c3`. Coltrane PROCEED, 2026-11-26 12:03:06 UTC, Discord `1575481344556011571`. |
| `Claude Comms and Packages/Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md` | Present. §5 records #961 implementation and its evidence limits. |
| `1-system-manual/BATCH_CATALOG.md` | Present. Row 2, #961 remains open. Step 10 owes the accepted result and exact boundary. |
| `1-system-manual/PHASE_HISTORY.md` | Present. Earlier row 2 phases are recorded. Step 10 owes the accepted result. |
| `1-system-manual/SYSTEM_MANUAL.md` | Present. Step 10 owes pricing and writer semantics for the accepted scope. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Present. Step 10 owes the true receipt, close-writer and paper reset dependencies. |
| `1-system-manual/RUNNING_ISSUES.md` and `1-system-manual/CHANGES_AND_FIXES.md` | Present and applicable. Keep #961 open until its evidence is reviewed. Legacy Clear Data and Clear Trades and the C14 residual have their separate home at #1174. |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md`, `1-system-manual/PHASE_19_PLAN.md` and `1-system-manual/CC_C_SESSION_TASK_LIST.md` | Present. Maintain row 2 and its in-flight 3n.q7 history. Apply the independent evidence/dependency rulings for #962 and #1087 at their recorded boundaries. |
| `1-system-manual/ADJUSTMENT_FRAMEWORK.md` | Judged N/A for this offline replay and writer review. Applicable if a later decision enables price or hold enforcement and advances the paper xStock measurement epoch. |
| `1-system-manual/POST_AUDIT_ROADMAP.md` and `1-system-manual/DELETED_COMPONENTS_LOG.md` | Judged N/A for the current diff. No roadmap change or whole component removed. |
| `B_XSTOCK_BID_TRIGGER_RELAND_COMPLETION_REPORT.md` | Absent. Owed at Step 11 after row 2's remaining work clears. The current progress report includes the known limits. |

**Step 2 reference:** `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_EXIT_FILL_PRE_AUDIT.md` at `0ade6d3154e0c356f7db8f21880c8d72060204c3`.

## Implementation and graded object

The code in this review ref includes the earlier green publication drain at `98db4a2512d31332bdf38a75d6a22401d1909ccd`. Review the whole #961 implementation against Step 2 source `e65b98ee3f96e9d0f99012f3ea0f1aa5beb616b2`, filtering concurrent work on the shared branch. The candidate diff against `98db4a251` covers the exact paper xStock transition, producer lineage, replay and reset permit. The common paper publication and reset protections are in the normal call paths. The new price gate is exercised only with an explicitly supplied offline policy. Staging promotion, forward sampling and price-policy enforcement require their own gates.

### Modified — xStock receipt and exact simulated fill

Before, a socket message callback used the shared parser without a connection identity. The normal taker close later read the newest archived depth and passed its bids to Paper Order Placer. The booking had only that separate depth evidence.

```ts
// Before — receipt and taker close excerpts
ws.on('message', handleMessage);
const _closeSnap = _closeClass
  ? await getDepthSnapshot(position.symbol, _closeClass, { allowLastTwoSided: _isFlatten }) : null;
// orderPlacer.closeOrder payload:
bookBids: _closeSnap?.bids,
```

```ts
// After — receipt, live connection identity and immediately before the simulated fill
ws.on('message', (raw) => {
  if (isCurrent()) handleMessage(raw, generation);
});
const grade = gradePaperXstockExitQuote(
  options.paperXstockExitQuote, position, policy.maxAgeMs, nowMonoMs, isCurrentEquityTickerFrame,
);
// Only the accepted frame's single bid enters the replay walker.
bookBids: rawExitFill ? [{ price: rawExitFill.bid, qty: rawExitFill.displayedBidQty }] : _closeSnap?.bids,
```

The replay requires the actual price cause, captured frame, position identity and strict full size before the synchronous paper walk. The parser records whether the bid, ask and bid quantity arrived as finite numbers before existing normalization. The replay rejects coerced lookalikes. It checks fill price at storage precision, full walked quantity and zero extrapolation before allowing persistence. An independent mark-triggered decision can still be recorded alongside a different qualified bid. The archive witness remains diagnostic for the replay. Existing maker and elapsed-only routes retain their pricing. The replay log runs on the first refusal and once at the comparison count, with no forced close or alert added.

### Modified — exact linked close and pending maker transitions

The old update and corresponding position deletion were separate. The guarded methods take the same trade lock first, require the exact position key and expected state, and make the two changes transactional. Normal, maker/resting, operator and stop paths flag which action committed. An attempted orphan close also requires positive durable fill evidence, no linked or same-symbol paper position and quiescence at the transaction boundary.

```ts
// After — exact still-open trade lock, linked position delete and winner
const [current] = await tx.select().from(closedTradesTable).where(key).for('update');
if (!current || current.closedAt) return { committed: false, trade: current };
// Predicate includes exact paper xStock id, symbol, quantity, tradeId and filled state.
// After the matched delete, the close update is part of this same transaction.
// The caller then gates its post-commit effects on the actual return:
const result = await storage.closePaperXstockTrade(trade, position, close);
if (!result.committed) return;
committedGuardedClose = true;
```

### Modified — entry admission and Reset / Start New

Previously the stop and reset could act while an entry was between saving the trade and saving its linked position. Now each paper writer is registered on its exact admitting run. Stop closes admission and waits up to 5 seconds for registered writes before the flatten and reconciliation. Both destructive routes return the incomplete operation as a refusal before their destructive work. The paper-only permit carries through the Start New mirror and reanchor and is released in `finally`. Continue requires the writer to be ready and reuses the stored balance.

```ts
// After — reset service acquires exclusive quiescence before cleanup
if (mode === 'paper') {
  if (!await paperEntryPublication.drain(PAPER_ENTRY_DRAIN_BUDGET_MS)) throw new PaperEntryDrainIncomplete();
  permit = paperEntryPublication.acquireResetPermit();
  if (!permit) throw new PaperEntryDrainIncomplete();
}
// Storage checks the same permit and restricts the paper reset to paper rows.
const dbResult = await storage.hardResetActiveEngineTables(mode, permit);
```

## Evidence and open questions

- Local targeted tests passed 231/231 across 13 suites. The six signed route fixtures exercised both destructive requests with a held crypto or xStock write, manager removal, competing Continue, a successful retry, live controls, stored balance and a failed mirror. The route fixture allows 30 seconds for the concurrent cold router import. Earlier candidate CI `45824352463` ran and passed all eight isolated Postgres fixture cases. That run itself was red because four legacy assertions still exercised the former writer. Candidate `19274197d` had its own CI `45826689508`. The wire correction and final review ref require exact CI again.
- Three source mutations each failed the intended assertion. Replacing the accepted ladder with archive depth tripped the archive-read assertion. Removing the post-await freshness check removed the expected stale refusal. Admitting a sub-epsilon shortage removed the expected size refusal. With the sources restored byte-for-byte, the complete quote and maker-policy test file passed 21/21.
- REVIEWER: claim-only · same judged genuine bid supplies all units · HIT: Boolean `bid_qty:true` was normalized to a bookable quantity of 1 · re-derived y at `19274197d` with the real socket parser and grade, numeric 1 as the positive control. The candidate now rejects Boolean, string and array sizes and a string price, even where legacy readers still see the normalized value. A restarted replay refuses an earlier connection and holds only a new episode. Two controls distinguish a price trailing stop from a moonbag timeout at the actual caller boundary, with the full TEC path verified in its separate suite. See Progress Report §5d.
- Historical candidate interval `[2026-11-21T01:00:00Z, 2026-11-26T02:32:06.222Z)`. The 65 stored taker stop closes with archive-depth evidence are a positive control for old depth. The actual price-triggered attempt and eligible-frame populations are unknown. The archive cannot establish frame type, delivering connection, monotonic age at consumption or hold duration. No retrospective policy acceptance rate is claimed. The age and count of 15,000 ms and 60 are offline comparison inputs only.
- Attack the same-frame contract, the storage transition and winner guarantees across the two operator routes and both stop routes, and exclusive quiescence over Reset and Start New. Confirm the candidate remains offline for quote enforcement and name any load-bearing missing controls before Step 5. Preserve the existing Phase A restart fence and Phase B dependency. The writer's full multi-route exclusivity and legacy repair behavior are **NOT RE-READ** by the one-pass helper, whose scope was exact quote lineage and size.
