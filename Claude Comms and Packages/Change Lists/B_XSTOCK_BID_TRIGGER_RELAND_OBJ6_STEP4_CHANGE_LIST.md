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

**S6 — the stop-hold tripwire** (`server/services/exit-refusal-tally.ts`): `spreadBlownTicks`; `spreadBlownFirstStopRefusedBid` = the bid at the FIRST `spread_blown` refused tick with `bid <= stop`; `spreadBlownStopHeldMs` from that tick to the release (`noteRelease(…, nowMs)`) or the close (`snapshotExitRefusal(t, nowMs)`). The engine passes `_r.inputs.bid` and the position's stop.

## TESTS
`b-xstock-feed-sanity-book-state` 60/60 (new describe: MDB, PCAR re-seeded-inside-the-blowout, no-comparator, ceiling-is-the-knob, 14 knobs; whitelist fence) · `b-xstock-bid-trigger-reland-inc2-chain` 10/10 (rewritten: SKIP, SKIP, YIELD with no page → still-wide frames hold and never seed → re-seed on the first tight frame → stop on the recovered mark; negative: never recovers ⇒ no close, comparator never seeded, no page) · `b-xstock-feed-sanity-fence` (14 names across the three migrations) · `b-xstock-bid-trigger-reland-inca` 26/26 (S6 discriminator, open-at-close, negative; entry fence). **Mutations, each red then restored:** arm disabled → 6 red; `_expectedWideHold = false` → 2 red; first-WIDE-tick capture → 2 red. `tsc` 335 = baseline.
**Full-suite note, stated:** locally 2 further files fail (`b-root-duplicate-scanner-retire`, `b79-0n-storage-sqe-asset-class-routing`) — the scanner test walks a stale agent worktree under `.claude/worktrees/` in this clone, and the SQE test is environmental; neither touches these files. CI on this ref is the arbiter.

## BLAST RADIUS
Paper xStock only (VTS has its own `too_wide` guard; crypto never reads `book-state.ts`). 3 of 467 xStocks have a regular-session median spread above 1% (VIDA 7.23%, PARA 4.18%, AMBR 3.23%; Langston adds VIA/USD 5.978-11.256% over in-session) — none held among 17 open positions; S4 refuses new entries there. Off-session, many names sit over 1% for 30-100% of the time: those positions now HOLD until the book is plausible — the intended behaviour (Kyle `#994` am.2, his 2026-10-16 direction).

## JUDGEMENT CALLS TO ATTACK
1. **The re-seed path changed** — a wide book no longer seeds an implausible chain, so increment A's `SEED_IMPLAUSIBLE` / ring-independent escape is now reached only via the OTHER hollow reasons. Is anything lost?
2. **Log volume** — every held position logs a `SKIP hollow` line per exit tick while the book is wide (as any hollow hold already does). Acceptable, or rate-limit the spread_blown SKIP line?
3. **In-session holds on VIA/VIDA-type names** page through CC-B's price-skip rail after its streak (S5 leaves that rail alone) — is that the right signal, given those names now cannot be entered?

## STEP 4 r2 — THE TWO REVIEWS FOLDED (2026-10-16)
**Langston APPROVED at `83177ba6e` (13:19Z)** with three judgement-call rulings; **Coltrane SENT BACK (13:12Z)** for two corrections and three stale comments, everything else approved. All folded at this commit:
1. **S4 judged the wrong element (Coltrane 1).** The entry gate tested EVERY reason, but feed telemetry (`feed_read_unavailable`, `feed_read_inert`, `feed_quiet`) precedes a terminal `mark_deviation`, so `['feed_quiet','mark_deviation']` with no usable reference was refused. Now `hollowCauseIsReferenceRelative(reasons)` (`server/asset_classes/xstock_spot/book-state.ts`) judges the TERMINAL reason only; an empty list or an unknown terminal cause is false (fail-closed, refuses). Engine: `(!_noUsableRef || !hollowCauseIsReferenceRelative(bs.result.reasons))`. Discriminator test with the feed read ON: terminal `mark_deviation` after `feed_quiet` drops; terminal `spread_blown` refuses. Mutation (every-entry semantics) → 2 red.
2. **SKIP log volume (Coltrane 2, Langston JC2 — Langston's shape adopted).** A `spread_blown`-only SKIP prints the run's FIRST line; later ticks are COUNTED with their spread range and printed as ONE `SPREAD_BLOWN_SKIPS … suppressedTicks= suppressedMinSpread= suppressedMaxSpread=` line when the run ends — at the yield, a change of reason, a recovered book, or the close (the `RI_NEAR_MISS` pattern: nothing dropped, the long stable hold is the population that tunes the ceiling). `noteRefusal` and `_recordBookStateEvent` still run on every tick — pinned (`spreadBlownTicks` = 1, 2, 3 while only the first SKIP prints). At `hollow_skip_cap` = 60 that is ~2 lines per ~90 s per held position instead of ~60. Mutations: never suppress → 2 red; no flush at the yield → 2 red.
3. **Stale comments corrected (Coltrane):** `book-state.ts` header (a `spread_blown` hold is intentionally indefinite — a yield cannot release it), `riAbsSpreadCeilingPct` (now read by `assessBookState` too), `spreadBlownEnabled` (now the 14th knob, ON).
4. **JC1 (Langston): the release after a `spread_blown` hold is a fresh seed — two sub-ceiling frames, no movement test.** Not a regression (before, it released on the next frame at any spread). Filed `#1199`; `HOME: B-SPREAD-BLOWN-RELEASE-MOVEMENT, owner CC-C, placed in SPRINT_TO_LIVE_PLAN at row 2, after objective 6's observation read`. The completion report will state the release test as it is.
5. **JC3 (both): the price-skip rail stays armed** for an in-session hold; only the duplicate direct hollow page is suppressed. Forward-binding on row 3a1 (CC-B): its counts split at this deploy.
6. **Step 6/7 condition (Langston):** staging holds 13 `book_state` rows today and the code asserts exactly 14, so the migration must land before the restart (`dt-deploy` runs `db:migrate` before `pm2 restart`); **Step 7 reads the row back and asserts `spread_blown_enabled = 1`** — an exit-0 migration is not proof the arm is ON.
**Tests:** `b-xstock-feed-sanity-book-state` + `b-xstock-bid-trigger-reland-inc2-chain` 72/72; `b-xstock-bid-trigger-reland-inca` fence updated. `tsc` = baseline.
