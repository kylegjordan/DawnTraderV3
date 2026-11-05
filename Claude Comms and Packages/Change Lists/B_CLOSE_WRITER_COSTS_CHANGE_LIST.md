# B-CLOSE-WRITER-COSTS — change list (Step 4)

## DISPATCH HEADER
| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `architecture` (scope header, `Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md:3`) |
| ii | DOC SET (architecture), row by row | SCOPE — present (`Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md`) · PRE_AUDIT — present (`Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md`, r2-r7 + PROCEED/C-15 `2040097ea`) · COMPLETION_REPORT — absent (Step 11) · BATCH_CATALOG — absent (Step 10) · PHASE_HISTORY — absent (Step 10) · SYSTEM_MANUAL — absent (Step 10; the close-record rule + the outcome seam are §-content) · SYSTEM_IMPACT_MAP — absent (Step 10; `closePosition` row + the storage lookup) · CHANGES_AND_FIXES — judged, at Step 10 · RUNNING_ISSUES — judged, at Step 10 · POST_AUDIT_ROADMAP — judged N/A (no roadmap item moves) · DELETED_COMPONENTS_LOG — **present, increment 1 entry** · ADJUSTMENT_FRAMEWORK — judged at Step 10 (the `asOf` read bound, increment 3) · SPRINT_TO_LIVE_PLAN row — at Step 10 · memory files + task list — at Step 10 |
| iii | STEP-2 REFERENCE | `Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md` (approved: Langston PROCEED on r7, condition C-15) |

The batch ships in three increments (pre-audit plan P-1..P-18). **This dispatch is INCREMENT 1 ONLY: P-1..P-4.** Increments 2-3 (`TradeCloseReason`, `closeOutcomeClass`, the `countedTrades` seam, the derived NON_OUTCOME list at the 10 SQL sites, the manual-close route, `asOf`, C-15) follow as their own dispatches.

## INCREMENT 1 — P-1..P-4 (the close finds its one record, or refuses)

### P-1 — `server/storage.ts`: `findOpenTradeRecord` replaces `getClosedTradesBySymbol`
- NEW `OpenTradeRecordLookup = { status:'one', record } | { status:'none' } | { status:'many', ids }`.
- NEW `findOpenTradeRecord(mode, symbol, assetClass)`: `mode = ? AND symbol = ? AND asset_class = ? AND closed_at IS NULL`, `LIMIT 3`. The `never_filled` arm is dropped per amended P-1 (condition (a)): `_dropUnfilledMaker` writes `closed_at` and `close_reason` in one update, so under `closed_at IS NULL` it cannot discriminate.
- DELETED `getClosedTradesBySymbol` (global — it never filtered `mode` despite its comment) and its `IStorage` entry. One caller, replaced.

### P-2 — `server/services/active-execution-engine.ts` `closePosition`: lookup + refusal BEFORE `_closeRefusalStreak.delete`
```ts
const _recClass = asValidAssetClass((position as any).assetClass);
const _rec = _recClass ? await storage.findOpenTradeRecord(this.mode, position.symbol, _recClass) : null;
if (!_rec || _rec.status !== 'one') {
  // log [B-CLOSE-WRITER-COSTS][CLOSE_RECORD_UNRESOLVED:<mode>] … position KEPT
  // addAlert critical, dedupe `close-record-unresolved-<mode>-<symbol>`, body ends `DISPOSITION: RESOLVE, do not ACK.`
  return;
}
const trade = _rec.record;
this._closeRefusalStreak.delete(positionId);
```
Unresolvable class ⇒ refused WITHOUT a lookup (a missing class never widens the match). The `flatten` exemption does not apply (tested).

### P-3 — deletions (OBJ-2b)
- the old lookup (`trades.find(t => t.openedAt && !t.closedAt)`);
- `if (trade) {` → a bare block `{ // B-CLOSE-WRITER-COSTS P-3: was \`if (trade)\` …` (tautological now);
- the `LADDER_NO_TRADE_ROW` arm inside the `finally` (eviction kept);
- the whole `if (!trade)` close-anyway block (`CLOSE_NO_TRADE_ROW` log + `close-no-trade-row-*` warning alert);
- comments narrowed: `#620` (`_persistedNetPnl`), the `_lsAcc` hoist, both `finally` eviction comments.
**State-write census:** the removed block wrote one alert key; `close-no-trade-row` has 0 code readers and 0 alert rows (Langston's read, pre-audit P-2 amended). Logged in `DELETED_COMPONENTS_LOG.md`.

### P-4 — tests
- `b-feed-mismatch-fix.test.ts` and `b-class-leg-fill-mode-engine.test.ts` re-pointed to `findOpenTradeRecord`.
- NEW in `b-feed-mismatch-fix.test.ts`, `B-CLOSE-WRITER-COSTS — the close refuses when its trade record does not resolve`: **R-none, R-many** (position kept, `updateClosedTrade` and `deleteActiveOpenPosition` not called, ONE critical alert under the key, `many` names both ids), **R-flatten**, **R-class** (no lookup), **R-one** (called with `('paper','WLD/USD','crypto_spot')`, no refusal alert).
- **Mutation-proved:** commenting out the refusal's `return` fails R-none, R-many and R-class (the write block dereferences a missing record, so `resolves` fails); passing `''` as the class fails R-one.

### ⚠ FOUND AT STEP 3, NOT IN THE PLAN — a third test reader
`b-price-side-8a-p1-exit-fence.test.ts` asserted `LADDER_NO_TRADE_ROW` PRESENT (test 7, twice) and anchored `ifTradeBlock` on `'    if (trade) {'`. The deletion census found it; the plan's P-4 named only two test files. **Re-pointed, not loosened:** the extraction anchors on the bare block's marker (`PERSIST_BLOCK_ANCHOR`), the finally's identity marker is `this._riMissAcc.get(position.id)` (code in the same `finally` — `code()` strips comments, so a comment marker cannot serve), and the arm's ABSENCE is now asserted. Controls 7c/7d unchanged in substance and passing.

### Verification (local)
- `tsc` baseline: 329 = 329.
- The three test files: 55/55.
- Full unit suite: 4,597 passed, 8 failed in 4 files — all local-environment: `b-disk-file-tiering-amendment1` and `b-staging-liveness-watch` load a CRLF `.mjs` with a shebang (`SyntaxError`, Windows checkout only); `b63-item12`, `b63-item16` need a local Postgres (`ECONNREFUSED :5432`). None reads the changed code. CI is the authority.
- `server/storage.ts` is stored with MIXED line endings (4,339 CRLF of 4,663 lines); the commit preserves them so the diff is the 32 changed lines only.

## Judgement calls to attack
1. **Placement after the fill.** P-2 sits after the fill contract's last refusal (as planned). In paper the fill is internal and nothing is booked before the lookup — but list anything between the fill and the lookup that MUTATES state, if you find one.
2. **Retry cadence.** A refused close returns; the monitor re-attempts every cycle, so the log line repeats each cycle while the alert dedupes. Acceptable, or should the refusal count into `_closeRefusalStreak`?
3. **`LIMIT 3`.** Enough to tell `many` and name ids; the alert names at most three.
