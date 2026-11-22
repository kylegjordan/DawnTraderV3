# B-PRICE-FEED-COVERAGE (#1222) — OBJ-5 (reconnect keeps the subscription intent) — STEP 4 CHANGE LIST (for Langston)

**Change-class:** `architecture` (scope `Scope Files/B_PRICE_FEED_COVERAGE_SCOPE.md` line 3, unchanged).
**Step-2 plan it implements:** `Scope Files/B_PRICE_FEED_COVERAGE_PRE_AUDIT.md` PART 1, OBJ-5 P5-1..P5-4 (your acceptance 2026-11-13 19:51Z, `0b62a3720`).
**Graded ref:** `b9205dcbb74859fbe1c872de0729f354d4e1c31f` on **`migration/aws-supabase`** (one commit on `19cbbb7ab`; 5 files, +443 / −13 — `git diff --stat 19cbbb7ab b9205dcbb`). **NOT deployed.** ⚠️ Unlike inc 0 this landed on the migration head, not a review branch — see decision 9: it must not ride any deploy until your PROCEED.
**Doc set for the class (row by row):** SCOPE ✅ present · PRE_AUDIT ✅ present (PART 1) · COMPLETION_REPORT, BATCH_CATALOG (`:1743` row exists for the parent), PHASE_HISTORY (`:1576`), SYSTEM_MANUAL, SYSTEM_IMPACT_MAP — owed at Step 10/11. SIM `:335` currently reads *"the reconnect re-subscribes open positions only — `#1222`"*; that known-gap line is rewritten at Step 10.

## The defect (F-3, pre-audit PART 1)
The crypto adapter's reconnect branch re-subscribed open positions only, so a symbol the RTB had queued and Kraken had ACKed was dropped on every reconnect; `softResubscribeAll` snapshotted the ACKed set only and cleared `pendingSubscriptions`, so a symbol still awaiting its ACK was dropped there. Nothing retried it until the symbol happened to be re-requested. Measured drop rate in the pre-audit: ~11/day.

## The change
| file | what |
|---|---|
| `server/exchanges/kraken/kraken-websocket-adapter.ts` (+166) | **P5-1** `subscriptionIntent: Map<internalSymbol, Set<reason>>`, reasons `open` and `rtb:<mode>`; API `addIntentReason` / `releaseIntentReason` (→ true when empty) / `replaceIntentReasonSet` / `getIntentReasons` / `getSubscriptionIntent` (`:3466-3514`). Cleared only by `stop()` (`:689`) and `clearAllSubscriptions()` (`:2494`). **P5-2** `restoreIntent(trigger)` (`:3532`) sends `intent − acked − pending − in-flight-on-this-socket`, recomputed per chunk (`restoreCandidates`, `:3516`). Called: reconnect branch after the open-position resubscribe (`:806`), fresh open (`:816`), end of `softResubscribeAll` (`:4448`), every 5 s audit tick (`:3403`). `handleOpen` stamps `socketGeneration++` / `socketOpenedAt` (`:765`). The open-position subscribe/resubscribe helpers ADD `open` (`:3321`, `:3361`); `i8cSubscribeNewTrade` takes an optional `intentReason` (`:3338`). **P5-3** the audit body moved to `i8cRunOpenPositionAudit()`; `i8cRunSubscriptionAudit` awaits it and THEN restores, so the provider/no-positions early returns no longer end the tick before the restore. Lines `[OBJ-5][RESUB] restored=<n> reasons=<prefixes> trigger=<t>` and `[OBJ-5][RESUB_DEFERRED] reason=not_connected` (once per socket generation for the audit). **P5-4** chunks of 25, 1 s apart, abort `[OBJ-5][RESUB_ABORTED] reason=socket_changed` on a generation change; in-flight grace 10 s. |
| `server/services/active-execution-engine.ts` (+17/−?) | never_filled (`:2291`): `releaseIntentReason(symbol,'open')`, no unsubscribe (as before). **Close path (`:5337`): unsubscribes only when the release reports nothing else wants the symbol; otherwise `[OBJ-5][WS_UNSUB_KEPT] closedSymbol=… still_wanted_by=…` — BEHAVIOUR CHANGE (decision 2).** New trade (`:7091`): passes `'open'` for `crypto_spot` only. |
| `server/core/rtb/ready_to_buy_service.ts` (+2) | crypto_spot branch at queue time (`:2536`): `addIntentReason(normalizedSymbol, 'rtb:'+mode)` — recorded even when already subscribed. |
| `server/services/rtb-refresh-service.ts` (+17/−1) | each refresh, per mode, after `getQueuedSignals` (`:334`): `syncRtbSubscriptionIntent` → `replaceIntentReasonSet('rtb:'+mode, <crypto symbols in the queue>)`; class from `asValidAssetClass(s.assetClass) ?? safeResolveAssetClass(s.symbol,'kraken')`; dynamic import of the adapter; try/catch → `[OBJ-5][RTB_INTENT_SYNC_FAILED]`, never throws into the refresh. |
| `server/tests/unit/b-price-feed-coverage-obj5-reconnect.test.ts` (new, 14) | T1-T4 from the plan, **each with its twin** (the pre-fix behaviour shown to lose the symbol), T4b union/release semantics, in-flight grace, replaced-socket, 25+5 pacing, abort, `stop()` clears. |

### Load-bearing snippets (at the ref)
```ts
// restoreCandidates — :3516
if (this.subscribedSymbols.has(key) || pending.has(key)) continue;      // pending compared normalized
const req = this.subscriptionRequests.get(key);
if (req && req.timestamp >= this.socketOpenedAt && now - req.timestamp < this.RESTORE_INFLIGHT_GRACE_MS) continue;
out.push(key);
```
```ts
// restoreIntent — the paced loop
this.subscribeToSymbols(chunk); restored += chunk.length;
if (chunk.length < this.RESTORE_CHUNK_SIZE) break;
await new Promise(resolve => setTimeout(resolve, this.RESTORE_CHUNK_GAP_MS));
if (!this.isConnected || this.socketGeneration !== generation) { console.log(`[OBJ-5][RESUB_ABORTED] …`); break; }
chunk = this.restoreCandidates().slice(0, this.RESTORE_CHUNK_SIZE);
```
```ts
// engine close path — :5337 (BEFORE: unconditional unsubscribeFromSymbols([position.symbol]))
if (krakenWebSocketAdapter.releaseIntentReason(position.symbol, 'open')) {
  krakenWebSocketAdapter.unsubscribeFromSymbols([position.symbol]); /* + the two existing log lines */
} else {
  console.log(`[OBJ-5][WS_UNSUB_KEPT] closedSymbol=${position.symbol} | still_wanted_by=${…getIntentReasons(…).join(',')}`);
}
```
```ts
// handleOpen reconnect branch — :806 (BEFORE: void this.i8cResubscribeAllOpenPositions();)
void this.i8cResubscribeAllOpenPositions().then(() => this.restoreIntent('reconnect'));
```

## Decisions taken at Step 3 (for your ruling)
1. **"In flight" is keyed to the socket, not just the clock.** A request counts as in flight only if stamped at or after `socketOpenedAt` and under 10 s old. A request sent 5 ms before a reconnect went out on a dead socket and is re-sent at once (test "replaced socket"; M4 kills it).
2. **Close-path behaviour change.** Before: a closing position always unsubscribed its symbol, even if the RTB had it queued — which then waited for the next RTB touch to come back. Now: unsubscribe only when nothing else wants it; `WS_UNSUB_KEPT` names who still does. This is the union semantics P5-1 implies, but it changes a live code path, so I name it.
3. **Callers that subscribe WITHOUT declaring intent are left as they were:** the manual route (`routes.ts:9821`), `ensureCoverageForOpenPositions`, `autoSubscribeMissingSymbols`. A symbol only they subscribed is still lost on reconnect, exactly as today. Rationale: none of them is an RTB or open-position owner, and the open-position ones are already covered by the provider restore. If you want them to declare, it is one line each — say which.
4. **A refused ticker is retried roughly every 10-15 s** (10 s grace aged out, then the next 5 s audit tick). Kraken never ACKs a refused symbol, so its request stamp is never cleared. One subscribe frame per refused symbol per ~10-15 s is the cost; I judged that acceptable against "never retried" and did not add a back-off. Say if you want one.
5. **The `open` reason can outlive the paper position.** The open-position provider slot is shared by the paper and live engines (the last `setI8COpenPositionsProvider` wins), so the helpers ADD `open` and never replace it. A symbol whose position closed by a path that does not call `releaseIntentReason` keeps `open` until `stop()`. Both close paths I found (normal close, never_filled) release it; I did not find a third, but I have NOT run an exhaustive census of close entry points for this — `NOT RE-READ`.
6. **The new-trade intent is crypto_spot only.** An xStock symbol has no Kraken feed; an intent for it would be re-sent by every audit tick forever.
7. **`softResubscribeAll` keeps its ACKed-set snapshot**, and the intent restore runs after it, so anything pending (or never in the snapshot) comes back from the intent. I did not remove the snapshot — it covers subscribers that never declared intent (decision 3).
8. **Dynamic import in `rtb-refresh-service`** for the adapter, to avoid a new static edge from the RTB layer into the exchange adapter. Failure is logged and swallowed; the next refresh retries. **When `getQueuedSignals` returns null the sync is skipped** (the existing `continue`), so the previous `rtb:<mode>` set stands until a refresh that returns a list — I judged "keep" safer than "clear on a failed read".
9. **Landed on `migration/aws-supabase`, not a review branch.** That was a process slip on my part relative to inc 0's pattern. Consequence: this runtime commit is at the head and **no deploy at or after `b9205dcbb` may happen until your PROCEED** — I am posting that caution to the crew. If you would rather grade it on a review branch, I will revert on migration and re-land it there byte-identical.
10. **Untested caller sites.** Only the adapter is unit-tested. The engine close-path KEPT branch, the RTB refresh sync and the queue-time add have no unit test; they are covered only by Step 7's log reading. Say if any of them needs a seam test before PROCEED.

## Verification at the ref (CC-B, local)
- `node scripts/check-tsc-baseline.mjs`: 324 / 324, no regression.
- vitest: `b-price-feed-coverage-obj5-reconnect` 14/14; the adapter-related suites, 8 files / 115 tests, pass.
- **Mutations — RUN against the adapter, each restored after (script output, not predicted; all exit=1):**

| # | mutation | killed by |
|---|---|---|
| M1 | reconnect branch: no restore | T1 (1 failed) |
| M2 | `softResubscribeAll`: no restore | T2 (1 failed) |
| M3 | restore moved behind the provider early return | T3 (1 failed) |
| M4 | in-flight check ignores which socket | replaced-socket (1 failed) |
| M5 | no in-flight grace | 4 failed (pacing, grace, T1, T1-twin) |
| M6 | paced restore does not abort on socket change | abort (1 failed) |
| M7 | no chunking | 2 failed (pacing, abort) |
| M8 | `replaceIntentReasonSet` keeps stale members | T4, T4b (2 failed) |
| M9 | `stop()` does not clear the intent | stop (1 failed) |
| M10 | `releaseIntentReason` always reports empty | T4b (1 failed) |

- CI on `b9205dcbb`: run `45037717104` in progress at writing; result goes in r2.

## Step 7 (pre-registered here, before deploy)
(a) **Every reconnect after the deploy writes one `[OBJ-5][RESUB] … trigger=reconnect` line**, with `restored` > 0 whenever an RTB-queued crypto symbol was ACKed before it. (b) **The OBJ-5 drop rate, measured the same way as the pre-audit's ~11/day, goes to ~0** over the first full session after the deploy; a non-zero count is read symbol by symbol against the restore lines. (c) `WS_UNSUB_KEPT` lines are read against the queue at that moment (each must name a symbol the RTB had queued). (d) `RESUB_DEFERRED` appears at most once per outage. Failure = (a) missing on a reconnect, or (b) not lower than the pre-audit rate.
