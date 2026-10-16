# B-XSTOCK-BID-TRIGGER-RELAND objective 6 — `spread_blown` ON — STEP 4 CHANGE LIST (CC-C, 2026-10-16)

## DISPATCH HEADER (workflow-04)
| field | value |
|---|---|
| **i — declared change-class** | `architecture` (row 2 scope header, unchanged) |
| **ii — doc set for the class** | scope: PRESENT `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` (objective 6; §MERGED objective-6 notes; "THE DECIDER CHANGED") · Step-2 plan: PRESENT `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_spread-blown-arming_r1.md` r2 + r2a (S1-S6; Coltrane: S2/S5 approved, S6 corrected) · change list: THIS FILE · migration + rollback + MANIFEST: PRESENT · Step-10 docs (SYSTEM_MANUAL §3.5.1, SIM book-state section, RUNNING_ISSUES, BATCH_CATALOG): ABSENT — owed at Step 10 · completion report: ABSENT — at row 2's close |
| **iii — Step-2 reference** | the plan r2 in the design doc above (the switch is an objective of the already-audited row 2; its implementation plan was reviewed as Step 2 by Coltrane 12:38Z) |
**Direction:** Kyle 2026-10-16 — *"Turn it on and then review and observe"* (r1b). **Ref:** `75f6fcc22ac157c495ce7f9e917dbf32de791d53`.

## THE CHANGE, BY PLAN ITEM (load-bearing hunks inline)
**S1 — the arm is ABSOLUTE and runs before the comparator** (`server/asset_classes/xstock_spot/book-state.ts`)
```ts
// AFTER the absent_bid / absent_ask arms, BEFORE `no_comparator`:
if (cfg.spreadBlownEnabled && spreadFrac !== null && spreadFrac > cfg.riAbsSpreadCeilingPct / 100) {
  reasons.push('spread_blown');
  return { state: 'hollow', reasons, inputs };
}
```
DELETED: the `3n.q7` increment-2 arm after the relative arms (`spreadFrac > threshold`, the chain's trailing threshold). **Consequence, tested:** after a YIELD clears the comparator, a still-wide frame reads `spread_blown`, NOT `no_comparator`, so it never seeds on the blown book; the chain re-seeds only on the first tight frame.

**S2 — one ceiling:** reads `ri_abs_spread_ceiling_pct` (1.0), unchanged name (Coltrane approved).

**S3 — the 14th knob, ON:** `BOOK_STATE_KNOBS` + `BOOK_STATE_SEED.spread_blown_enabled: 1` (`book-state.ts`); resolver `spreadBlownEnabled: r.spread_blown_enabled === 1` and boot assertion 13 → 14 with `∈ {0,1}` (`book-state-config.ts`); warm-up line (`b72-warmup.ts`, now prints `spread_blown=` and `ceiling=`); `scripts/xstock-hollow-recut.ts` reads the seed; migration `drizzle/migrations/2026-10-16-b-xstock-bid-trigger-reland-obj6.sql` (`updated_by 'b-xstock-bid-trigger-reland-obj6'`) + rollback + MANIFEST. **OFF switch without a revert:** `UPDATE … value = 0`.

**S4 — entry whitelist** (`active-execution-engine.ts`, the `_noUsableRef` seam)
```ts
-  (!_noUsableRef || bs.result.reasons.some((r) => r === 'absent_bid' || r === 'absent_ask'))
+  (!_noUsableRef || bs.result.reasons.some((r) => !BOOK_STATE_REFERENCE_RELATIVE_REASONS.has(r)))
```
`BOOK_STATE_REFERENCE_RELATIVE_REASONS = {bid_collapsed, ask_spiked, mark_deviation}` (`book-state.ts`). Fence: every hollow reason the predicate emits is either whitelisted or named reference-free (`absent_bid, absent_ask, feed_burst, spread_blown`).

**S5 — no page for an exact `['spread_blown']` yield** (`active-execution-engine.ts`, the yield branch)
```ts
const _expectedWideHold = _r.reasons.length === 1 && _r.reasons[0] === 'spread_blown';
if (!_expectedWideHold) try { … addAlert(book-state-hollow-<mode>-<SYMBOL>) … }
```
Log, `_recordBookStateEvent`, the refusal tally and `_recordPriceSkip` unchanged (Coltrane's condition).

**S6 — the stop-hold tripwire** (`exit-refusal-tally.ts`): `spreadBlownTicks`; `spreadBlownFirstStopRefusedBid` = the bid at the FIRST `spread_blown` refused tick with `bid <= stop`; `spreadBlownStopHeldMs` from that tick to the release (`noteRelease(…, nowMs)`) or the close (`snapshotExitRefusal(t, nowMs)`). The engine passes `_r.inputs.bid` and the position's stop.

## TESTS
`b-xstock-feed-sanity-book-state` 60/60 (new describe: MDB, PCAR re-seeded-inside-the-blowout, no-comparator, ceiling-is-the-knob, 14 knobs; whitelist fence) · `b-xstock-bid-trigger-reland-inc2-chain` 10/10 (rewritten: SKIP, SKIP, YIELD with no page → still-wide frames hold and never seed → re-seed on the first tight frame → stop on the recovered mark; negative: never recovers ⇒ no close, comparator never seeded, no page) · `b-xstock-feed-sanity-fence` (14 names across the three migrations) · `b-xstock-bid-trigger-reland-inca` 26/26 (S6 discriminator, open-at-close, negative; entry fence). **Mutations, each red then restored:** arm disabled → 6 red; `_expectedWideHold = false` → 2 red; first-WIDE-tick capture → 2 red. `tsc` 335 = baseline.
**Full-suite note, stated:** locally 2 further files fail (`b-root-duplicate-scanner-retire`, `b79-0n-storage-sqe-asset-class-routing`) — the scanner test walks a stale agent worktree under `.claude/worktrees/` in this clone, and the SQE test is environmental; neither touches these files. CI on this ref is the arbiter.

## BLAST RADIUS
Paper xStock only (VTS has its own `too_wide` guard; crypto never reads `book-state.ts`). 3 of 467 xStocks have a regular-session median spread above 1% (VIDA 7.23%, PARA 4.18%, AMBR 3.23%; Langston adds VIA/USD 5.978-11.256% over in-session) — none held among 17 open positions; S4 refuses new entries there. Off-session, many names sit over 1% for 30-100% of the time: those positions now HOLD until the book is plausible — the intended behaviour (Kyle `#994` am.2, his 2026-10-16 direction).

## JUDGEMENT CALLS TO ATTACK
1. **The re-seed path changed** — a wide book no longer seeds an implausible chain, so increment A's `SEED_IMPLAUSIBLE` / ring-independent escape is now reached only via the OTHER hollow reasons. Is anything lost?
2. **Log volume** — every held position logs a `SKIP hollow` line per exit tick while the book is wide (as any hollow hold already does). Acceptable, or rate-limit the spread_blown SKIP line?
3. **In-session holds on VIA/VIDA-type names** page through CC-B's price-skip rail after its streak (S5 leaves that rail alone) — is that the right signal, given those names now cannot be entered?
