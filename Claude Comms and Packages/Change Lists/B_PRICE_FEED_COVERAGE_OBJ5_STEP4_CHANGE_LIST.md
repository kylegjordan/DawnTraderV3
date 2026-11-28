# B-PRICE-FEED-COVERAGE (#1222) — OBJ-5 (reconnect keeps the subscription intent) — STEP 4 CHANGE LIST (for Langston) — r2

**Change-class:** `architecture` (scope `Scope Files/B_PRICE_FEED_COVERAGE_SCOPE.md` line 3, unchanged).
**Step-2 plan it implements:** `Scope Files/B_PRICE_FEED_COVERAGE_PRE_AUDIT.md` PART 1, OBJ-5 P5-1..P5-4 (your acceptance 2026-11-13 19:51Z, `0b62a3720`).
**Graded ref:** `b9205dcbb74859fbe1c872de0729f354d4e1c31f` on **`migration/aws-supabase`** (one commit on `19cbbb7ab`; 5 files, +443 / −13 — `git diff --stat 19cbbb7ab b9205dcbb`). **NOT deployed.** ⚠️ Unlike inc 0 this landed on the migration head, not a review branch — see decision 9: it must not ride any deploy until your PROCEED.
**Doc set for the class (row by row):** SCOPE ✅ present · PRE_AUDIT ✅ present (PART 1) · COMPLETION_REPORT, BATCH_CATALOG (`:1743` row exists for the parent), PHASE_HISTORY (`:1576`), SYSTEM_MANUAL, SYSTEM_IMPACT_MAP — owed at Step 10/11. SIM `:335` currently reads *"the reconnect re-subscribes open positions only — `#1222`"*; that known-gap line is rewritten at Step 10.


## r2 — Step-4 AMEND (your verdict on `b9205dcbb`, Discord `1574086571139793078`)
**Graded ref for r2:** the commit that carries this r2 (parent `45a3710e5`), on `migration/aws-supabase`. 3 runtime/test files + this list + `RUNNING_ISSUES` + `DEPLOY_WINDOWS`. **Still NOT deployed; the crew fence (no deploy at or after `b9205dcbb`) stands until your PROCEED.**

### Your rulings, recorded
Decisions 1, 2, 6, 7, 8 — good as taken. Decision 9 — no revert; the fence held. Decision 10 — no seam tests needed once items 3 and 4 land (both landed, below).

### The six items and how each landed
| # | your item | landed |
|---|---|---|
| 1 | a green Test Suite on a sha that holds the change | CI on the r2 commit — run id + per-job result go in the dispatch post (this file is inside that commit, so it cannot carry its own run) |
| 2 | ONE line per restore run | `restoreIntent` (`kraken-websocket-adapter.ts:3543-3595`) counts `sent` through the loop and writes exactly one line after it: `[OBJ-5][RESUB] sent=<n> candidates=<n> reasons=<prefixes> trigger=<t>`, or `[OBJ-5][RESUB_ABORTED] reason=socket_changed sent=<n> candidates=<n> reasons=<prefixes> trigger=<t>` when the socket changed mid-run. No line inside the loop any more. A non-audit run with nothing to send still writes `sent=0 candidates=0` (`:3562`), so a healthy reconnect is visible; a non-audit run that finds a restore already in progress writes `sent=0 candidates=<n> … skipped=restore_in_progress` (`:3547`). The 5 s audit stays silent on zero and on in-progress (`quietWhenIdle`, `:3544`). `candidates` is the count at run start. |
| 3 | release `open` on the stop-flow orphan delete | `active-engine-service.ts:1193`: `releaseIntentReason(orphan.symbol, 'open')` right after `deleteActiveOpenPosition('paper', orphan.id)` (`:1189`). No unsubscribe added (the stop flow never unsubscribed). Harmless for an xStock symbol (no intent is ever held for one). |
| 4 | the audit declares intent | `i8cRunOpenPositionAudit` (`:3431`): every position the provider names gets `addIntentReason(…, 'open')`, healthy or not, before the health check. So after `clearAllSubscriptions()` empties the intent, the next tick puts `open` back on every still-open position. Additive, not `replaceIntentReasonSet('open', …)` — a replace would strip `open` from a symbol whose position the OTHER engine holds (the provider slot is last-writer-wins, decision 5). |
| 5 | remove the pending exclusion | `restoreCandidates` (`:3526`) no longer skips `pendingSubscriptions`. A pending symbol counts as in flight only through its request stamp (same socket, under 10 s). Consequence: a symbol Kraken refused after the open flush (pending forever, stamp aged out) is retried on the ~10-15 s cadence of decision 4; a pending symbol inside its grace is not doubled. |
| 6 | a `DEPLOY_WINDOWS` open row | `1-system-manual/DEPLOY_WINDOWS.jsonl` — `open` row for this window (until your PROCEED), in this commit. |

### Decisions changed or narrowed by the amend
- **Decision 3 — the benign callers named:** `triggerCorrectiveAction` (`:3069`) and the book-channel swap (`:3136`) re-subscribe symbols that already hold intent or are open positions; neither needs to declare.
- **Decision 4 — narrowed:** the refused-ticker retry now also covers a refused PENDING symbol (item 5); before r2 a pending refusal was never retried.
- **Decision 5 — the close-entry-point census, now run (`git grep` at HEAD `45a3710e5`, tests excluded):**
  - single deletes — `active-engine-service.ts:1189` (stop-flow orphan, **releases since r2**), `active-execution-engine.ts:2289` (never_filled, releases `:2291`), `:5329` (close, releases `:5337`): **all three release.**
  - bulk deletes — `routes.ts:11384` (reset soft-cleanup), `:11432`, `:11697`, `c14-validation-service.ts:163`: **none releases.** Only the engine reset (`active-execution-engine.ts:1738`) and the session reset (`active-session-reset.ts:221`, which also runs the `storage.ts:4694` bulk delete) are followed by `clearAllSubscriptions()`.
  - **audit/close race:** an audit that read the provider before a close can re-add `open` after the close released it.
  - **Residual, stated:** after a bulk delete or that race, `open` outlives the position until `stop()` / `clearAllSubscriptions()`. Cost: one kept subscription per such symbol (and a close-path `WS_UNSUB_KEPT` naming `open`). It is never a lost subscription. **Proposed class fix filed on `#1222`** (each engine replaces its OWN `open:<mode>` set from its own provider read), as a proposal for Kyle's list, not a slot.
- **New, named — the RTB-refresh first-call race:** on the FIRST `syncRtbSubscriptionIntent` call only, an `rtb:<mode>` reason added at queue time between `getQueuedSignals`, the `await import(...)` and `replaceIntentReasonSet` can be stripped by the replace. Later calls are not exposed (the module import is cached, so the replace follows the read with no await between). The next refresh restores it from the queue. Cost: one symbol possibly unrestored on a reconnect inside that one window. `NOT RE-READ` by a second reader.

### Verification at the r2 ref (CC-B, local)
- `node scripts/check-tsc-baseline.mjs`: 324 / 324, no regression.
- vitest: `b-price-feed-coverage-obj5-reconnect` **21/21** (14 → 21: item 2 ×3, item 5 ×2, item 4 ×2). Every unit suite that imports the adapter or `active-engine-service` (`git grep` at HEAD; one integration suite needing a database excluded): **31 files / 440 tests pass.**
- **Mutations — RUN against the adapter, each restored after, all exit=1 (script output, not predicted):**

| # | mutation | killed by |
|---|---|---|
| M1 | reconnect branch: no restore | T1 |
| M2 | `softResubscribeAll`: no restore | T2 |
| M3 | restore behind the provider early return | T3 |
| M4 | in-flight ignores which socket | replaced-socket |
| M5 | no in-flight grace | 7 failed (pacing, grace, item-2 in-progress, item-5 retry, …) |
| M6 | paced restore does not abort | abort |
| M7 | no chunking | 3 failed (pacing, abort, item-2 in-progress) |
| M8 | replace keeps stale members | T4, T4b |
| M9 | `stop()` keeps the intent | stop |
| M10 | release always reports empty | T4b |
| **M11** | **pending excluded again (pre-r2)** | item-5 refused-pending retry |
| **M12** | **non-audit zero line dropped** | item-2 zero line |
| **M13** | **audit loud on zero** | item-2 audit-silent, item-2 in-progress |
| **M14** | **in-progress skip line dropped** | item-2 in-progress |
| **M15** | **abort also writes the finished line** | abort (one line per run) |
| **M16** | **audit declares no `open`** | item-4 |
| **M17** | **audit declares `open` only for symbols it re-subscribes** | item-4 (healthy position) |

- The item-3 engine line has no unit test (your decision-10 ruling).

### Step 7 — (a) reworded for the new line; (b)-(d) unchanged
(a) **Every reconnect after the deploy writes exactly one `[OBJ-5][RESUB] … trigger=reconnect` (or `RESUB_ABORTED … trigger=reconnect`) line — including `sent=0 candidates=0` when nothing was lost** — with `sent` > 0 whenever an RTB-queued crypto symbol was ACKed before it. A reconnect with no line is a failure.


### Langston's verdict on r2 — PROCEED (Discord `1574095950950047877`, 2026-11-22)
PROCEED on `d0d64c380` (parent `45a3710e5`); he re-read items 1-6 and the decision-5 census at the ref (CI `45041163190` 4/4 pulled from the Actions API himself). The crew fence lifts. The `DEPLOY_WINDOWS` row closes on the deploy.

**Two Step-7 reading conditions, binding (no code change):**
1. **(a) above is narrowed — a reconnect has THREE admissible outcomes.** The `!isConnected` branch is gated on `wanted > 0`, so: `RESUB` / `RESUB_ABORTED` when the socket is up · `RESUB_DEFERRED` when it is not and intent is held · **silence is admissible only when intent is empty and the socket is not connected.** A reconnect with no line is a failure only when the socket was up.
2. **A `skipped=restore_in_progress` line is not evidence the intent was restored** — it must be paired with the in-progress run's own line, or that reconnect is unread. `candidates` is the start-of-run count while chunks are recomputed, so `sent/candidates` is not a ratio.

Carrier he named, no action: `clearFirstTickTracking()` (`:2590`) wipes `subscriptionRequests` while leaving intent, so after that diagnostic route an unACKed intent symbol loses its grace and is re-sent next tick (a duplicate subscribe at worst). His out-of-scope hypothesis (`deleteAllActiveOpenPositions(mode)` ignores `mode`, `storage.ts:3962-3963`) is with PM Claude for Kyle's list; it is residual (1)'s carrier.

## Step 6 — deployed 2026-11-24

**STEP: 6 of 11 COMPLETE · NEXT STEP: 7 of 11.** Exact candidate `e3a96a8126f0280a9568bb1823b9210783f0afe0` deployed under `codex-b` at `2026-11-24T00:03:08Z`, restart `715`, as the single reviewed backlog bundle from deployed base `c21c1502a215b428e2cba2a5214696cb9a1a5c74`. Component ref `d0d64c380` is an ancestor of the deployed SHA. The aggregate review record is `B_DEPLOY_BUNDLE_E3A96A812_STEP4.md` at exact off-branch ref `3087bb7c98727a82a48e89d32a2b268a90cb635e`; Coltrane ruled PROCEED at `2026-11-23T22:47:56Z`. Exact-target CI run `45047451029` was re-read before deploy: all four required jobs succeeded at the deployed SHA.

The first `dt-deploy` invocation was refused before mutation because the branch-head observation-window register had advanced. The authoritative eight-row census then passed with every row named; the corrected invocation completed and recorded restart `715`, a bounded 14-second check-failure interval, and exact build identity. Independent read-back found repository HEAD and `dist/BUILD_SHA` both exact, the app online with `unstable_restarts=0`, and live post-resume price/exit cycles. This process is the Step-7 anchor. The reconnect read must apply the three admissible-outcome rule and must pair any `skipped=restore_in_progress` line with the owning run's terminal line; immediate post-restart activity alone is not the full OBJ-5 verification.

The Delivery Board parent card was moved from `CI + Deploy` to `Verification`; authoritative `fieldValues` read-back returned Status `Verification`, Owner `Claude New`, Review `Approved`, and Blocked on `External` (the live reconnect evidence).

---

# r1 (graded at `b9205dcbb`, kept as written)

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

### Step 7 interim natural-reconnect read — 2026-11-24T04:58Z

The current `out.log` and `error.log` each began before the exact deploy anchor (`2026-11-24T00:03:08Z`) and extended through `04:58:03Z` / `04:58:02Z`, respectively. The surrounding known-present deployment controls were `[OBJ-5][RESUB] sent=0 candidates=0 trigger=open` at process start `00:03:02Z` and `sent=5 candidates=5 reasons=rtb trigger=audit` at `00:03:17Z`.

Two natural reconnect markers occurred, and both had one same-second terminal restore line:

| reconnect | terminal restore |
|---|---|
| `01:39:02Z` `[I8C-WS-RECONNECT] reconnect_detected` | `[OBJ-5][RESUB] sent=12 candidates=12 reasons=rtb trigger=reconnect` |
| `03:28:52Z` `[I8C-WS-RECONNECT] reconnect_detected` | `[OBJ-5][RESUB] sent=7 candidates=7 reasons=rtb trigger=reconnect` |

The same bounded pattern read found no `RESUB_ABORTED`, `RESUB_DEFERRED`, `skipped=restore_in_progress`, or `WS_UNSUB_KEPT` line. The process control remained online at restart count 715, unstable restarts 0, with the deploy record still naming exact build `e3a96a8126f0280a9568bb1823b9210783f0afe0`. This is positive interim evidence for criterion (a), not Step-7 completion: timestamp/trigger/order is the available pairing key, the logs cannot exclude an unlogged transport reconnect, the first-full-session drop-rate gate is not yet mature, and no close-path `WS_UNSUB_KEPT` carrier has appeared.

`REVIEWER: staging current out.log + error.log, bounded from 2026-11-24T00:03:08Z · what other states fit the OBJ-5 interim claim? · claim matches: two markers and two same-second reconnect terminals; no named negative states; no correlation id beyond timestamp/trigger/order and an unlogged transport reconnect remains compatible · re-derived y`

### Step 7 interim natural-reconnect extension — 2026-11-24T09:46Z

The complete overlapping post-deploy population was re-read across `out__2026-11-24_05-00-05.log` (`00:01:32–05:00:17Z`), current `out.log` (`05:00:18–09:46:04Z`), and current `error.log` (`00:01:16–09:46:04Z`); the predecessor archives ended before the `00:03:08Z` deploy boundary. The known-present control found six OBJ-5 lines in that population, five after the deploy boundary, including the independent `00:03:17Z` audit-trigger record.

Two later reconnect markers extend the interim carrier to four, each with exactly one same- or next-second terminal restore:

| reconnect | terminal restore |
|---|---|
| `07:37:46Z` `[I8C-WS-RECONNECT] reconnect_detected` | `07:37:47Z` `[OBJ-5][RESUB] sent=12 candidates=12 reasons=rtb trigger=reconnect` |
| `08:05:21Z` `[I8C-WS-RECONNECT] reconnect_detected` | `08:05:21Z` `[OBJ-5][RESUB] sent=12 candidates=12 reasons=rtb trigger=reconnect` |

Across the complete overlapping population the cumulative counts are four reconnect markers, four reconnect-trigger terminal restore lines, zero `RESUB_ABORTED`, zero `RESUB_DEFERRED`, zero `skipped=restore_in_progress`, and zero `WS_UNSUB_KEPT`. The app remained online on exact deployed Git HEAD and `dist/BUILD_SHA` `e3a96a8126f0280a9568bb1823b9210783f0afe0`, restart count 715, unstable restarts 0. This proves dispatch intent at the four observed reconnects; it does not prove exchange acceptance or later tick delivery, cannot distinguish a naturally caused reconnect from a manually induced socket reconnect, and still does not complete the first-full-session drop-rate or close-path-carrier gates.

`REVIEWER: claim-only · independently select objects and identify compatible alternate states · counts supported; natural cause and downstream acceptance remain unproven · re-derived y`

### Step 7 interim natural-reconnect extension — 2026-11-24T13:20Z

The complete overlapping post-deploy population was extended across `out__2026-11-24_05-00-05.log.gz` (`00:01:32–05:00:17Z`), `out__2026-11-24_10-00-49.log` (`05:00:18–10:01:06Z`), current `out.log` (`10:01:06–13:20:40Z`), and current `error.log` (`00:01:16–13:20:39Z`). The stdout and stderr predecessor archives end at `00:01:32Z` and `00:01:15Z`, respectively, before the `00:03:08Z` deploy boundary. The same search that found all eight OBJ-5 positive-control lines found one new outage sequence:

| time | record |
|---|---|
| `13:10:34Z` | `[OBJ-5][RESUB_DEFERRED] reason=not_connected intent=9 trigger=audit` |
| `13:10:35Z` | `[I8C-WS-RECONNECT] reconnect_detected` |
| `13:10:35Z` | `[OBJ-5][RESUB] sent=4 candidates=4 reasons=rtb trigger=reconnect` |

This is admissible under Langston's three-outcome rule: the disconnected audit held intent and emitted one deferred record for the outage, then the connected reconnect emitted its own terminal restore record. The deferred `intent=9` and reconnect `candidates=4` are different snapshots around the reconnect and are not a ratio or a five-member loss claim; the terminal line proves dispatch intent for the four candidates eligible when that restore run began, not exchange acceptance or later tick delivery.

Across the complete overlapping population through `13:20Z`, the cumulative counts are five reconnect markers, five reconnect-trigger terminal restore lines, zero `RESUB_ABORTED`, one `RESUB_DEFERRED`, zero `skipped=restore_in_progress`, zero `WS_UNSUB_KEPT`, and zero `RTB_INTENT_SYNC_FAILED`. The app remained online with repository HEAD and `dist/BUILD_SHA` exact `e3a96a8126f0280a9568bb1823b9210783f0afe0`, restart count 715, and unstable restarts 0. The first-full-session drop-rate gate remains immature until after `21:00Z`, and no close-path carrier has appeared.

`REVIEWER: staging rotating stdout/error population through 2026-11-24T13:20:40Z · independently select objects and test the deferred-plus-reconnect interpretation · counts, object reach, process controls and admissible interpretation reproduced; unlogged/manual reconnect, downstream acceptance and later ticks remain compatible · re-derived y`

### Step 7 full-session read — 2026-11-25

The post-deploy read covers 2026-11-24 00:03:08–21:00:00Z, including the full 14:30–21:00Z regular session. The overlapping stdout population is `out__2026-11-24_05-00-05.log.gz`, `out__2026-11-24_10-00-49.log.gz`, `out__2026-11-24_16-01-03.log.gz`, and `out__2026-11-24_23-00-09.log.gz`. Their consecutive timestamp spans were 00:01:32–05:00:17, 05:00:18–10:01:06, 10:01:06–16:01:19, and 16:01:19–23:00:25Z. Stderr `error__2026-11-25_00-01-44.log` spans Nov 24 00:01:16Z–Nov 25 00:01:46Z. The immediately preceding stdout and stderr objects both end before the deploy boundary. The recorded 00:03:02Z engine/restore markers and the 00:03:17Z audit restore are the controls. The PM2 lifecycle record returned the deploy's exit/start/online sequence just before the bound and no later dawntrader process lifecycle event in the bound.

- **Reconnect dispatch:** All five observed crypto reconnect markers retained their same- or next-second terminal restore (01:39:02, 03:28:52, 07:37:46, 08:05:21, 13:10:35Z; respectively 12, 7, 12, 12 and 4 reported candidates with matching sent counts). The one logged defer at 13:10:34Z paired to that outage; no additional marker appeared through 21:00Z. These are aggregate restore-attempt records. The sent counter records attempted chunk length after a call that can filter, queue, or fail a send, and the reasons field is a union across the population.
- **Drop-rate comparator withdrawn (Coltrane, 2026-11-25 09:59:51Z):** `[B74][equity-spot] disconnected` recorded four xStock archiver callbacks in 20 h 56 m 52 s (00:26:36, 08:01:03, 08:18:06, 20:00:02Z, all code 1006), with a code-1005 line at 00:02:55Z as a positive control. The historical 140 callbacks in 12.6 days (~11/day) measure that same xStock socket. They provide no crypto RTB loss denominator. This disposition supersedes the rate comparison in the original Step 7 plan above. It retains the original scope's intent-conservation criterion and the observed crypto reconnect/defer pairs.
- **Required crypto read:** During one controlled reconnect with a nonempty crypto RTB population, capture names, owners and counts of intended RTB/open symbols immediately before disconnect and distinguish ACKed from pending. Pair the reconnect with its terminal restore/defer line. For the new connection generation, confirm each retained symbol by a successful subscription ACK or a same-generation downstream ticker, and report restored, intentionally released and missing counts and symbols. The requirement is zero unexplained omissions. If no member was pending in staging, include the positive pending/slow-handshake test. Scope §2 OBJ-5 allows an agreed forced reconnect or a suitable natural reconnect.
- **Evidence source check, 2026-11-25:** at the serving ref, `ws-price-engine` exposes the crypto adapter's timestamped `lastUpdateBySymbol` beyond open positions, but the book handler also updates it. Its optional raw price records have receive timestamps and are written by the ticker handlers. For a future same-connection ticker leg, require a raw receipt strictly after the reconnect and before the next disconnect. Socket message callbacks reject the previous socket after replacement. The subscription-map per-symbol ACK and pending booleans are scoped to open positions and carry no generation. The complete ticker-send payload and successful per-symbol ACK log are separate carriers. In the Nov 24 `13:10:35Z` reconnect, four symbols had successful ACK lines, with two ACKs each. This controls per-symbol subscription success without identifying either channel. At `12:14:19Z` Nov 25, all 74 paper RTB rows were xStock across the two retained statuses, so the required crypto membership check remains unexercised.
- **Close path and downstream behavior:** The window did not exercise a `WS_UNSUB_KEPT` carrier. A separately agreed staging paper exercise is eligible: show one crypto symbol with both `open` and `rtb:<mode>` before the close, exactly one `WS_UNSUB_KEPT` naming the RTB owner at the paper close, and the retained reason and subscription afterwards. Record the exact symbol and reason sets. The changed subscription and close-path internals have no dedicated UI indicator.

**Step 7 remains open** for direct crypto set conservation and the paper close carrier. The full-session counts remain observations of reconnect and restore dispatch. This read made no change to the process.

`REVIEWER: claim-only · which object supplies the historical drop rate and what states fit the restore claim? · HIT: separate xStock socket baseline; attempted-chunk carrier can coexist with downstream omission, rejection or stale price · re-derived y`

### Step 7 local pending-subscription control — 2026-11-26

The existing T2 case marks the stub connected immediately, and T3's delayed connection starts with an RTB intent that was never in the pending set. The new case in `b-price-feed-coverage-obj5-reconnect.test.ts` exercises both conditions together. The original fake socket emits a ticker subscription for paper RTB-owned `SOL/USD`, which remains pending without an ACK. At 4.1 seconds of simulated time the actual safe-resubscribe path logs a defer, with zero ticker sends to the replacement socket. Opening that distinct socket through the adapter emits exactly one ticker subscribe for `SOL/USD` there. The original socket retains its one send.

Local Vitest on shared base `f50fbd358` passed all **22 cases in the reconnect suite**. The adapter, dependency lock and Vitest config are byte-identical to serving Phase A `5ecd7ee24`. As a negative control, a temporary local mutation discarded the previously pending intents only when the safe-resubscribe decision found the socket still disconnected. The replacement socket then received no `SOL/USD` ticker request and the new assertion failed while all 21 existing cases passed. The mutation was reverted and the suite passed again.

The fixture establishes request replay. The separate staging check still owes live symbol and owner conservation and the paper-close witness. For each retained symbol use a successful channel-bearing ticker ACK or a raw ticker receipt attributable to the replacement generation, with the observation ending before the next disconnect. `handleV2SystemMessage` at Phase A shares its per-symbol `Sub OK` log and ACK state across ticker and book. Use a book-only ACK, an adjacent-generation receipt or an equal-count symbol swap as a negative control when validating the live capture. Keep the reconnect and paper-close checks in their own agreed window.

`REVIEWER: claim-only · what live outcomes are compatible with the local slow-handshake control? · HIT: T2 and T3 separate pending and delay, and generic per-symbol success merges book and ticker; combined two-socket test and channel check added · re-derived y`

Coltrane issued **PROCEED** on this local control and its evidence at exact `e81db888d86b11ef38dfeef5dc15957afc83165d`, 2026-11-26 09:55:51 UTC. He reproduced 22/22 with the unchanged adapter and 21/22 with the targeted drop of pending intent. His ruling retains the live before/after and paper-close requirements.

### Step 7 archived ticker-delivery control — read 2026-11-26

`/var/log/dawntrader/out__2026-11-24_16-01-03.log.gz` records the crypto trading adapter closing at 13:10:33 UTC (Kraken code 1012), deferring at 13:10:34, and opening a replacement connection at 13:10:35 on `e3a96a812` (restart 715). The 13:10:35 ticker payloads list a five-symbol open-position batch, then `TREAD/USD`, `LINK/USDC`, `LINK/USD` and `JTO/USD` followed by `[OBJ-5][RESUB] sent=4 candidates=4 reasons=rtb trigger=reconnect`.

Read the 30-second slice through 13:11:05 UTC and take the first valid `[8.9.0-B][WS_TICK]` line **strictly after** 13:10:35 for each named symbol. Both LINK pairs and JTO appear at 13:10:36, and TREAD at 13:10:47. All five open-position names give separate positive ticker controls in the same slice. The bounded slice contains one reconnect and no subsequent crypto trading-adapter close, with the 13:10:33 close as a positive control for that marker. At the serving ref, the socket identity guard precedes message handling, and the v2 ticker branch emits this line after price parsing. The adapter blob matches literal Phase A `5ecd7ee24`. This verifies valid ticker receipts for the four **restore candidates**, including the possibility of subscription snapshots. The prior live count of intended members and the count of attempted restoration cannot settle each member's before/after ownership. The registered complete before set and separate paper-close witness remain owed.

`REVIEWER: claim-only · do the historical tick lines cover RTB conservation or the named restore request? · HIT: independent archived reads found ticker payloads after the replacement opened, with separate open-position controls; the named restore request cannot supply the complete before set · re-derived y`

### Step 7 live capture preparation — 2026-11-27 UTC

The Nov 24 first-session and four-symbol ticker receipt evidence above stands. The live return still owes reconnect conservation and one paper-close observation. The current Phase A adapter blob matches `e3a96a812`, the original OBJ-5 deployment. Pin the actual serving commit, PID, restart and adapter blob at each run. Changes in serving code or process require a fresh comparison before relying on this plan.

**Read-only readiness sample.** At 19:18:29Z, `dt-sql` found nine distinct paper crypto RTB symbols in nine retained rows, one `active` and eight `reconfirmed`. They were `SKY/USD`, `FET/USD`, `ICNT/USD`, `INJ/USD`, `JUP/USD`, `PIEVERSE/USD`, `SENT/USD`, `VELO/USD` and `ZEC/USD`. It also found 162 retained paper xStock rows on 142 symbols, a separate class control. None of the nine crypto RTB symbols overlapped the four open crypto paper symbols, `BABY/USD`, `KNTQ/USD`, `TREAD/USD` and `VVV/USD`. At 19:19:31Z, the authenticated `/api/diagnostics/i7-ws/subscription-map?mode=paper` read included all nine queue names in the adapter's global subscribed list (31 names), reported zero entries in the adapter's pending set, and showed all four crypto open positions subscribed and ACKed. The two timestamps are separate. This is a candidate-population and diagnostic control. The close eligibility intersection was empty, and the snapshot does not read actual reason ownership or establish a socket boundary.

**Missing capture.** The live accessor `getSubscriptionIntent()` (`kraken-websocket-adapter.ts:3474–3517` at `5ecd7ee24`) returns every actual owner set but has no running API call site. The existing subscription-map route (`routes.ts:9425–9477`) returns the global subscribed list but per-symbol pending and ACK detail only for open positions. Its per-position `subscription_status=pending` also includes request history. The global `wsStatus.pendingCount` counts the pending set, while the v2 subscribed list and ordinary ACK line merge book and ticker. The RTB queue and open positions describe expected owners. Queue insertion and periodic intent sync are separate, and ownership can be released without immediate unsubscribe (`ready_to_buy_service.ts:2532–2542`, `rtb-refresh-service.ts:322–391`, adapter `:3484–3507`). Passing these reads alone could miss a dropped or silently retained owner. Before reserving a live reconnect, NEW and INFRA will identify a supported same-process capture of per-symbol actual reasons, subscribed/ACK status, pending/request state and `socketGeneration`/`socketOpenedAt`, including RTB-only symbols. Coltrane adjudicates the proposed carrier against the registered proof. Any new instrumentation follows the normal review and deploy sequence.

| Observation | Owner and entry condition | Capture and verdict |
|---|---|---|
| Crypto reconnect | NEW captures and grades. INFRA coordinates the permitted method and window with OLD (pool / Universe Refresh Acts), ANALYST (VTS / venue observations) and PM (slot). Require the actual-owner carrier, nonempty crypto RTB, known previous connection and a healthy process. A natural reconnect is admissible with the same previous-generation capture. | Capture the complete `(symbol, reason)` set at the old socket boundary, individual ACKed, pending/requested and wanted-but-unsent status, and the same membership on the replacement. Pair the reconnect and terminal restore/defer, ticker requests and channel-bearing ACKs or valid ticker receipts strictly after the new open and before the next close, same process. Reconcile every prior owner to retained or intentional release, and report retained symbols delivered, intentionally released symbols and missing names. Match names and owners, then counts. Use the four archived ticker receipts, a book-only ACK, an adjacent-generation receipt and an equal-count symbol swap as controls. If the measured old socket has no pending members, carry the reviewed slow-handshake fixture. An incomplete boundary leaves the leg unexercised. A complete read with an unexplained omission fails. |
| Paper close | NEW owns evidence. PM and affected owners confirm a separate slot and, if using an operator close, the permitted exact paper position. Require a filled crypto paper position with both `open` and `rtb:paper` on the actual adapter, no other open owner of that symbol, and a working same-socket ticker before close. | Record the exact position, reason sets, active row and subscription before the close. A normal Active Trades close reaches `closePosition`. Pair the one `[AJ19-B][DELETE_SUCCESS]` for the same UUID with one `[OBJ-5][WS_UNSUB_KEPT]` naming `rtb:paper`, then require the reason, retained queue membership and same-socket ticker after close. Inspect the exact Paper Trading open/closed trade in signed-in Chrome. A refusal or pending-maker cancellation supplies no close witness. `WS_UNSUB_KEPT` proves the retained reason at the branch, and the separate ticker and reason captures test continued retention. There is no UI view of adapter ownership or socket generation. |

**Returns.** NEW carries the paper xStock warning/exposure read into the Nov 28 **02:00Z** owner preflight (decision cutoff **02:40Z**) and **05:50Z** conditional return recheck. The R3 diagnostic (**02:30–02:55Z**, natural read **03:00Z**) and conditional literal-Phase-A return (**06:10–06:35Z**) are separate. NEW checks OBJ-5 readiness again at **07:00Z**, or after disposition of those protected legs if later. This is a read-only checkpoint. Live times remain subject to approved evidence carrier, exact eligible symbol population, clear owner windows and the applicable staging gates. The watchdog safeguard `#647(i)` still precedes `#994` implementation.

**Paper warning cohort for both scheduled reads.** Start from the merged `price-skip-paper-*` rows created from Nov 27 18:15Z. Carry the seven positions in Discord `1575952813387808991` and add ACN and TJX from the same 18:43:01.359Z promotion. At the 19:18Z ledger cut ACN warning `c5a2e8fe-896f-46d2-8305-b9fdabb0012f`, position `d5183e91-6541-48f9-abeb-7db870fb0ca5`, was active/unacknowledged and stale-mark dominated. It had 36 earlier exact-position exit frames and zero after the mint through 19:20:27Z. TJX warning `feaaba0e-38eb-4bef-a818-6e54bc852a06`, position `620cd7cc-203a-4ea6-b206-278e6bc5bdbf`, resumed at 18:47:19Z and the writer cleared it at 18:47:34.283Z with same-position pricing evidence. TJX produced 983 post-mint exit frames in the same interval and serves as the latest positive control. At both checkpoints join any additional rows by warning UUID and position UUID, record the reason, current exposure, exact post-mint TEC evaluation or close and automatic resolution status. Keep VTS trade evidence separate and share genuine overlaps with ANALYST.

**Standing xStock info for the Nov 28 02:00 and 05:50 UTC paper reads.** Add `d18717d5-0e46-42f6-aec0-d5293c2e8734`, minted Nov 27 `21:24:34.893Z` and promoted `21:28:03.997Z`, active and unacknowledged at `21:43:22Z`. It is the `venue-quiet-paper-xstock_spot` informational record. The merged record lists four positions: XBI `6e2982b0-9c33-454e-a7e1-1167c29b18f6`, HPQ `63e1da6b-b56b-4407-8dfe-db93ae405dad`, PCG `6ec5d5d2-e159-4f61-be0e-e30fa2410a01` and TJX `620cd7cc-203a-4ea6-b206-278e6bc5bdbf`. Every member has a `quiet` verdict and `quiet_market` only, with 40 `equity_tick_stale_risk_to_stop` skips at its latest join. On Phase A `5ecd7ee24` restart 716, the app log in `[21:23,21:43)Z` matches six joins (XBI and HPQ twice), the first `21:24:34Z`, and paper sweep `21:37:12Z` with PCG held as `quiet_market`. The previous same-key row, minted `18:44:02.870Z` and resolved `21:14:59Z`, is a separate positive control. Classify this intake through the standing quiet-market path. Member recovery still requires position-specific evidence.

At both reads, refresh the exact standing row and member UUIDs, additions/rejoins, pricing or closure after each member's latest join, paper sweep/automatic resolution, and any separate duration warning with its session. At intake all four retained price times preceded their latest joins. Preserve the independent PCG validation warning `423fd66b-c5ee-436b-b0ac-40e4647de800` for the same position, resolved separately at `21:22:03.784Z`, and the earlier HPQ/TJX recovery records on their own evidence. Leave the standing row with the writer's normal resolution path.

`REVIEWER: claim-only · which objects distinguish the standing intake from a separate failure? · HIT: check the latest join per position; the same PCG UUID can have a resolved book-validation warning and later quiet-market membership · re-derived y in the merged ledger and bounded join log`

**Next standing-row intake.** Add informational row `d8ff15cc-82b7-4087-a5ef-597482ca1ee0` alongside `d18717d5-0e46-42f6-aec0-d5293c2e8734` for both Nov 28 **02:00 and 05:50 UTC** paper preflights. Check each exact row and its own members at those reads. The OBJ-5 readiness return is **07:00 UTC** or after both protected legs have a disposition, whichever is later.

`REVIEWER: claim-only · which exact served carriers prove complete pre-reconnect and close ownership? · HIT: global subscribed names are available, but full pending/request and owner state is not exposed, and the close keep line proves owner only at the close branch; source and two live read-only controls re-derived · re-derived y`

#### Nov 27 22:39 UTC due-queue intake

The merged staging ledger showed all ten rows active and unacknowledged at the 22:41 UTC read. All ten were promoted at `22:28:05.496Z`. The earlier standing rows above cleared automatically at `21:45:17.981Z` and `22:15:42.905Z`, respectively. The separate PCG book-validation warning cleared at `21:22:03.784Z`.

| Paper position | Exact row UUID | Exact position UUID | Nov 27 mint UTC | Forty-tick reason mix |
|---|---|---|---|---|
| TJX/USD | `063c2840-e7d3-4b43-bd2f-b9e5d4cc7c60` | `620cd7cc-203a-4ea6-b206-278e6bc5bdbf` | `22:15:50.038` | Info, 39 unvalidated book + 1 book-state yield |
| XLE/USD | `0c1057d5-2436-49f4-b8f3-37f1c23ed06d` | `f3bb5fae-db6a-44fd-81e3-6bef9b8dd1f4` | `22:19:49.711` | 40 stale mark |
| ACN/USD | `eeab49af-6778-448d-8e1e-94a7ebdbbaca` | `d5183e91-6541-48f9-abeb-7db870fb0ca5` | `22:20:16.752` | 27 stale mark + 13 book-state yield |
| XBI/USD | `c43681ef-1cdb-448d-9803-0abaf701ad33` | `6e2982b0-9c33-454e-a7e1-1167c29b18f6` | `22:20:54.368` | 37 stale mark + 3 book-state yield |
| WDC/USD | `ac0e0682-5c58-4483-b039-7d1a6f02795f` | `13260ed2-7e9d-4eb1-9f8d-f9734c297842` | `22:20:55.732` | 37 stale mark + 3 book-state yield |
| HPQ/USD | `071b96a4-f557-459d-9a69-6733b0451c6f` | `63e1da6b-b56b-4407-8dfe-db93ae405dad` | `22:20:58.935` | 40 stale mark |
| PCG/USD | `b384b7c6-0f17-4eb6-87a4-32d027179264` | `6ec5d5d2-e159-4f61-be0e-e30fa2410a01` | `22:20:59.062` | 40 stale mark |
| TGT/USD | `1137e04b-b9d2-45c5-8a46-5139f1a5c67c` | `1e97abe5-f5e1-408f-87b1-010a18fd33c2` | `22:21:15.428` | 37 stale mark + 3 book-state yield |
| NVO/USD | `a09e8ae2-b1bb-4c2f-868a-ab68d96d52ec` | `f0ed25da-6ea2-4d4f-806e-f4a25356f6c9` | `22:21:19.851` | 40 stale mark |
| NKE/USD | `b3d94e00-13fb-4ec1-b262-e68d820ce64b` | `2f674348-58a1-424b-90d2-a580548233fa` | `22:21:20.017` | 40 stale mark |

On serving Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, restart 716, PID 235604, `out.log` shows the TJX standing join and paper sweeps. The join was `not_quiet`, `T=469`, `book_state` only. TJX stayed held in the `22:41:57Z` sweep with `thin`, `T=0`. The last TJX exit frame was `22:12:42Z`. In `error.log`, each of the nine stale-mark warnings has a matching `PRICE_SKIP_ESCALATION` line, `thin`, `T=0`, and a mark 289–360 seconds old against its 230- or 300-second ceiling. Exact serving `server/services/venue-quiet-alerting.ts` classifies `thin` as a page-worthy state during the generic after-hours session. The TJX book-state row joined the separate standing path.

At `22:15:31Z` the Kraken equities adapter reported 1,393 genuine ticker updates across 469 symbols in the preceding minute. All 26 one-minute samples from `22:16:31Z` through `22:41:31Z` had zero genuine updates. Watchdog reconnects at `22:27:58Z` and `22:40:58Z` each returned 469 snapshots and zero genuine updates at the next sample. Heartbeats continued and the same app logs contained 18,526 crypto VVV/USD ticks over `[22:11,22:42)Z`. The two app streams contained zero exact-position TEC exit frames at or after the mint or join second for these ten positions through `22:42Z`. Positive controls were 2,132 earlier TEC frames across nine of the same positions in the bounded read, plus the earlier 36 exact-position frames for ACN recorded above. No row supplied affirmative closure or writer-clear evidence at intake.

**Disposition.** The nine warnings describe one loss of fresh underlying xStock marks after the Thanksgiving Friday shortened sessions. Nasdaq and the named NYSE late sessions closed at `22:00Z`; the last observed adapter data was around `22:15:19Z`. This supports a holiday-boundary explanation, with the exact Kraken equities feed cutoff and per-symbol eligibility still unverified. A distinct outage during eligible quote hours remains open until checked against genuine updates. The current generic Friday fence begins at `01:00Z`, and already queued `B-XSTOCK-HOLIDAY-CALENDAR` (`#392`, KD-122) owns the exchange and feed eligibility gap. [Nasdaq holiday notice](https://www.nasdaqtrader.com/TraderNews.aspx?id=ETA2026-69), [NYSE holiday hours](https://www.nyse.com/trade/hours-calendars), [Kraken xStock market hours](https://support.kraken.com/articles/market-hours-explained).

**TJX duration follow-up.** Carry warning `86e41383-0893-440a-a3a5-356233b63a5e` alongside the TJX standing informational row already listed above. Both were active and unacknowledged in the Nov 27 23:10 UTC merged ledger read, and both refer to the one exact TJX paper position in the table. The warning was minted at `22:45:59.047Z` and promoted at `22:58:06.035Z`. Its metadata records `duration`, `thin` and `book_state` only. The informational row records the earlier book-state join while marks were still updating. The warning records the prolonged hold in the same position during the later near-silent feed and sits outside the nine stale-mark mints.

At the Nov 28 **02:00Z** and **05:50Z** paper reads, recheck the above exact rows, live paper exposure, TEC evaluation or closure and automatic resolution. Read both TJX rows against the same position and record each row's own disposition. If the underlying venue is closed, carry unresolved recovery to the first proven eligible genuine-frame window. Treat a continuing stall during verified quote eligibility as a separate incident. The OBJ-5 readiness return stays **07:00Z or after both protected legs have a disposition, whichever is later**.

`REVIEWER: claim-only · which evidence separates the TJX book-state hold, nine freshness warnings and genuine recovery? · HIT: exact UUIDs, nine emitted thin branches and two snapshot-only reconnects, with same-position frames and the live producer baseline as controls · re-derived y`

#### Nov 28 02:00 UTC owner preflight

**Serving process and window.** At 02:00:47Z the staging checkout, build stamp and deployment record all read literal Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, deployed Nov 26 02:32:16Z. PID 235604 was online at restart 716 with zero unstable restarts. The open-window census at shared `f836b2495` included B-RTB-PROMOTION-RETRY-STORM. Its KD-87 anchor is pending. Exact R3 `8f97c294ed705fab920245762183632eec7bad71` differs from Phase A only in the crypto Universe Refresh implementation and its tests among runtime/schema paths. NEW cleared its own window for that exact target in 02:30–02:55Z, subject to OLD's gate checks and naming the #1136 window. The controlled OBJ-5 tests remain separately scheduled. Owner receipt `1576055559591956582`.

**Ledger and exposure.** A merged 4,645-row ledger capture at 02:00:15.479Z found all 22 named input rows and three further members of the scoped paper alert population minted since Nov 27 18:15Z. The 25 rows cover 16 exact paper xStock position UUIDs. Six earlier freshness warnings stayed active (PPL `c72570cf`, DUK `48e36953`, SLB `a8536d3c`, BAX `dc99123f`, EWL `68c119a7`, CME `2678dd2f`). All nine later stale-mark warnings in the existing table and TJX duration warning `86e41383` were active and unacknowledged. TJX info row `063c2840` was separately active and unacknowledged with one member, position `620cd7cc-203a-4ea6-b206-278e6bc5bdbf`, last joined at Nov 27 22:15:50.172Z. The 02:00:07Z paper sweep logged `verdict=closed T=0 held=1[TJX/USD:book_state]` with no resolution, sweep failure or duration mint on that pass. The 02:00:26.473Z read-only position snapshot matched all 16 xStock UUIDs and four separate crypto paper positions. The close-history query found zero committed paper xStock closes between Nov 27 18:15Z and Nov 28 02:00:27Z, with three matching earlier closes as a control (latest PL/USD 17:23:57.890Z). The one covered app position-delete marker was VVV/USD, a separate crypto position.

**Same-position controls.** Exact-position frames after the latest mint or join were absent for all 17 active rows across the two streams from Nov 27 18:15Z through Nov 28 02:00:15Z. There were 68,558 xStock exit frames across that observed interval, last at 22:20:19Z, and each scoped position had its own earlier frame control. SLB's last was 18:14:59Z in the same covering error archive. TJX's last frame was 22:12:42Z, before its book-state join and 22:45:59.047Z after-hours duration mint. The early TJX warning `feaaba0e` separately got a frame at 18:47:19Z and cleared 18:47:34.283Z. ACN `c5a2e8fe` likewise cleared at 21:59:28.590Z after its exact 21:59:21Z frame, independently of its still-active later warning. Exact pricing also cleared WDC `974a14ad-9040-42d8-8078-a875f318bb85`, HPQ `97a954da-9361-4b98-a1a9-8c90581d1412` and the distinct PCG book-validation row `423fd66b` at 18:27:18.593Z, 18:25:10.095Z and 21:22:03.784Z respectively. All three earlier standing rows `ba37cd05-5f3e-4cf6-85c5-a7a182cbe461`, `d18717d5` and `d8ff15cc` have exact member frames after each latest join and before their respective engine resolves at 21:14:59.000Z, 21:45:17.981Z and 22:15:42.905Z. The separate row outcomes do not certify recovery of later holds.

**Coverage and next read.** The stdout files were `out__2026-11-27_22-00-40.log.gz`, `out__2026-11-28_00-01-57.log` and `out.log`, with observed time bounds from 17:00:37Z Nov 27 through the cut. The stderr files were `error__2026-11-28_00-01-57.log` and `error.log`, with observed times from 00:00:58Z Nov 27 through the cut. The file set was stable during the read. Of 224 equity-feed heartbeat samples from 22:16Z to the cut, 12 had replay alone and two showed two updates on two symbols each, at 01:01:32Z and 01:18:32Z. The sample cannot assign those updates to paper positions. It does establish late activity on the feed, while the exact-position evidence establishes no resumed TEC evaluation in the active cohort. The paper sweep judged the generic application weekend fence `closed` on all 60 sampled passes from 01:00:25Z to 02:00:07Z. The holiday timing and public hours support keeping the overnight classification with #392, with exact eligibility and recovery still to prove on a genuine-frame return. Recheck exact rows and exposure at **05:50Z**, and preserve **07:00Z or later** OBJ-5 readiness after both protected legs have a disposition. [NYSE Nov 27 schedule](https://www.nyse.com/trade/hours-calendars) · [Kraken market hours](https://support.kraken.com/articles/market-hours-explained).

`REVIEWER: claim-only · what would distinguish current exposure, weekend closure, and recovery? · HIT: separate writer clears, exact open position, eligibility and genuine observed pricing; same-symbol clears may bind another UUID, and late producer updates need not be accepted by TEC · re-derived y for this preflight; per-symbol feed eligibility remains unproved`

#### Nov 28 05:50 UTC owner preflight for the conditional literal Phase A return

**Serving target and owner fence.** At `05:50:11.278Z`, staging HEAD, built SHA and completed deployment record matched R3 `8f97c294ed705fab920245762183632eec7bad71`, online PID `1778615`, restart `717`, boot `02:35:24.315Z`, zero unstable restarts. The candidate is exact literal A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, exact CI `45589022150` four jobs green. The complete comparison changes three crypto Universe Refresh production paths, two tests and the change list. The paper execution engine, venue-quiet writer and Kraken WebSocket adapter blobs match. At shared `998929f6b`, NEW's #1136 RTB window is open across `06:10–06:35Z` and its KD-87 activation anchor is still pending. Name the open window. The controlled OBJ-5 reconnect and paper close remain separate. OLD retains the exact-slot decision after the other owners and gates.

**Exact paper exposure.** The `05:50:11.277Z` capture joined the merged 4,658-ID alert ledger to the same 16 xStock position UUIDs still open in the `05:50:11.628Z` database read. The same 25 rows minted since Nov 27 `18:15Z` matched this cohort. The 15 stale-mark warnings and distinct TJX duration warning `86e41383-0893-440a-a3a5-356233b63a5e` were still active and unacknowledged. So was informational `063c2840-e7d3-4b43-bd2f-b9e5d4cc7c60`, now with all 16 exact position IDs as quiet-only members. That row held only TJX on the `02:00Z` cut. All 16 latest joins occurred after the R3 boot between `02:37:29.324Z` and `02:37:33.750Z`; the timing alone does not establish cause. TJX's standing membership is currently `quiet_market`; its older duration warning retains the separate `book_state` reason and its last exact exit frame was Nov 27 `22:12:42Z`. The newest sweep at `05:49:51Z` measured `closed`, `T=0`, `held=16`, zero resolves, failures and new escalations. The same row set had no new mint or terminal clear after the `02:00:15Z` cut.

**Positive controls and precise limit.** The stdout and stderr read spanned the earlier cut and the fresh cut with covering `out.log`, `error.log` and the Nov 28 `00-01-57` rotated pair. The same reader found pre-cut frames for every one of the 16 positions. It found zero post-cut xStock exit frames through `05:50:11.277Z` and no paper xStock close writes since `18:15Z` through the `05:50:11.732Z` database check. The close query returned three earlier paper xStock closes and three separate paper crypto closes in the target interval. All 227 post-cut paper sweep samples classified the application as `closed`. Of 229 equity heartbeat samples in the same interval, one had replay without a genuine update; at `05:18:25Z` another reported six genuine updates across six symbols. The heartbeat cannot bind those updates to a held position. Record the read as continued exposure during the app's weekend fence. Recovery remains due at the first proven eligible genuine-frame window with same-position TEC evidence.

**Disposition.** NEW gave exact-slot clearance for its own window only, in OLD/PM/ANALYST receipt `1576113638425493587`. Keep the other owner, B75, deployer, migration, pool and protected-window gates for OLD's decision. OBJ-5's next return is `07:00Z` or after both protected legs have a disposition, whichever is later.

`REVIEWER: claim-only · does the exact paper cohort show exposure, restart-time rejoin, or resumed evaluation? · HIT: the standing row, duration warning and earlier TJX priced/clear bind the same position at distinct times; an aggregate genuine update has no position join · re-derived y from the captured ledger, exact position/frame join, closed-trade controls and boot record. Capture SHA-256 e24c7c0d52b6fa9fb3cabb8054f58921534e0bdb623caef291dadf7d6c8d7885.`

#### Nov 28 07:00 UTC OBJ-5 readiness after the protected legs

**Window and serving process.** R3's natural refresh passed OBJ-7. OBJ-1 remains incomplete on membership and transport evidence (Coltrane, `03:28:12Z`, review `2145f8541`). OLD's Phase A return received NO-GO at `06:14:40Z` (`1576119114940813323`), after INFRA's hold at `06:13:34Z` (`1576118840658755645`). The storage warning hit its 128 MiB limit, the failure notice timed out on the alert ledger lock and the headroom read did not settle. The slot ended unused. A return requires a validated warning path or approved substitute and fresh owner checks. The `07:00:41.413Z` and `07:01:27.447Z` brackets both matched checkout, build and deployment record to `8f97c294ed705fab920245762183632eec7bad71`, PID `1778615` online, restart `717`, boot `02:35:24.315Z`, and zero unstable restarts. The shared deploy-window register at `f148e4536b6935253ff7ea46251c9a952efdafb9` has P10's protected window through `09:00Z`, plus the open RTB promotion, VTS REST and xStock bar availability rows.

**Read-only census.** The `07:00:55.200257Z` database read found seven reconfirmed crypto RTB rows in paper mode, one apiece for CSPR, INJ, JUP, PEAQ, PIEVERSE, XTZ and ZEC `/USD`. The same read found four filled open crypto positions in paper mode, BABY, KNTQ, SENT and TREAD `/USD`, with zero symbol overlap. At `07:01:10.407Z`, the paper subscription map showed all seven RTB names within the 14 global subscriptions and all four open names with a per-position ACK and first tick. The aggregate health check showed connected, healthy and zero pending. The synthetic selection control accepted a filled overlap with matching ownership and rejected a pending or competing live owner. The existing `e81db888d` fixture passed 22/22 with the negative mutation failing one of 22 as designed. The two observations have distinct timestamps inside the same verified process.

**Evidence still owed.** The paper subscription map builds details from open positions (`server/routes.ts:9425–9477`), and the adapter ACK view combines ticker and book (`server/services/kraken-websocket-adapter.ts:986–1002,2517–2559`). The RTB-only subscription names and aggregate counts cannot settle exact per-symbol reasons and requested/pending/acknowledged state for the same socket generation. The served `getSubscriptionIntent()` getter has no production caller, and the reached per-symbol reason reader is the `WS_UNSUB_KEPT` close branch (`server/services/active-execution-engine.ts:5342`). A ticker receipt can prove receipt when the log retains the matching process and socket chronology. The ticker path accepts snapshots and cannot establish a fresh venue update or ownership on its own. The served adapter, route and RTB service blobs match literal Phase A.

**Disposition.** The reconnect and paper-close checks remain unexercised. NEW and INFRA must identify an approved read-only capture of actual ownership and generation-specific request, pending and ACK state, then establish separate owner-approved slots. The paper close also needs an actual eligible filled position and current carrier/UI proof at the test. Keep the first genuine eligible xStock frame follow-up for the quiet-market cohort independent. Step 7 remains current and OBJ-4 follows its live evidence.

`REVIEWER: claim-only · can the live served carriers settle both registered cases? · HIT: the known subscription names and ticker receipt are positive controls; owner reasons, generation-specific state and a qualifying close are required separately · re-derived y at exact R3, bracketed read-only observations and the existing overlap control. Capture 16,055 bytes, SHA-256 6b618a54e73f9c63f23ee423727729a141ac738cd33297e313ef2037233b3b19.`

#### Nov 28 09:05 UTC owner preflight for UR-A-1128-0925

**Serving target and fences.** R3 `8f97c294ed705fab920245762183632eec7bad71` matched the clean checkout, build and completed deploy record at `09:05:13.873Z` and `09:05:15.650Z`. Both reads returned online PID `1778615`, restart `717`, boot `02:35:24.315Z` and zero unstable restarts. Literal Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` and r4 storage procedure `512cda268bbfe47e9dbb6c7ee9633945582843a7` each passed all four exact CI jobs (`45589022150` and `46122466073`). Shared `a6d32759535fbebd0d13b0ef34f83b10a95a6c74`, deployment-window blob `f78f08ef60b13e9102dab9ac9fe2f47eb68938a6`, keeps the RTB #1136 window open and the KD-87 anchor pending. The slot must name that window.

**Exact paper evidence.** The `09:05:15.020341Z` read returned the same 16 unique xStock paper position IDs, symbols and open states as the `05:50:11.627744Z` read. Four crypto positions controlled class selection. The bounded paper xStock close check since 05:50 found zero closures. The same table returned the known earlier PL/USD close `f95b1342-750d-43da-92a5-8811bbb80faa`. Changing one known position from open to pending made exactly one of the 16 keys fail to match. The preserved JSON capture is 11,361 bytes, SHA-256 `f1b1d53cd0c099de26c50c51af021907132573a3eeb1e9dc0fa4dd2aa7b05d49`.

| xStock paper symbol | Position ID at both reads |
| --- | --- |
| ACN/USD | `d5183e91-6541-48f9-abeb-7db870fb0ca5` |
| BAX/USD | `50b0f8be-c5b0-45c0-acc5-3900367092ee` |
| CME/USD | `a09e0fc4-66b5-4ab3-abc2-e7c403c7e725` |
| DUK/USD | `1cbcc5f7-7114-48a9-bf3c-c675221db525` |
| EWL/USD | `0ffec77f-065d-48ca-8414-03b4e532ed20` |
| HPQ/USD | `63e1da6b-b56b-4407-8dfe-db93ae405dad` |
| NKE/USD | `2f674348-58a1-424b-90d2-a580548233fa` |
| NVO/USD | `f0ed25da-6ea2-4d4f-806e-f4a25356f6c9` |
| PCG/USD | `6ec5d5d2-e159-4f61-be0e-e30fa2410a01` |
| PPL/USD | `a22fec59-2d46-4d6d-a890-2b20f2d60eee` |
| SLB/USD | `8cc6fde7-3040-4c1b-a5c1-6437c22e70a1` |
| TGT/USD | `1e97abe5-f5e1-408f-87b1-010a18fd33c2` |
| TJX/USD | `620cd7cc-203a-4ea6-b206-278e6bc5bdbf` |
| WDC/USD | `13260ed2-7e9d-4eb1-9f8d-f9734c297842` |
| XBI/USD | `6e2982b0-9c33-454e-a7e1-1167c29b18f6` |
| XLE/USD | `f3bb5fae-db6a-44fd-81e3-6bef9b8dd1f4` |

**Disposition.** NEW cleared its own protected windows for the exact slot and target in Discord `1576162454579449891`. INFRA's scope HOLD `1576162067306651791` still applied at that read. The direct paper exit and RTB paths match at the two targets. The crypto close witness reads recorder membership and connection state, which can change with a boot even when its code matches. After any authorized return, reconcile the same exact xStock IDs and states on the new process. The PFC controlled crypto reconnect, eligible paper-close check and xStock genuine-frame return retain their separate triggers.

**Slot closed unused at 09:16 UTC.** INFRA's final hold `1576164533381111879` cited the live natural P10 lock with its window still outstanding, and Birth Cap admitting 275 births during the OFF interval, 256 after the first 60 seconds. OLD independently checked the same R3 build, PID and restart at `09:15:53Z` and cancelled the `09:25–09:50Z` slot in `1576164766416773264`. Keep the 09:05 snapshot as preflight evidence. A later Phase A return requires a new reviewed slot and fresh position reconciliation.

`REVIEWER: claim-only · does the tree delta establish execution or live state invariance? · HIT: the unchanged crypto close branch reads recorder membership and health from the changed recorder component · re-derived y at active-execution-engine.ts:4715–4724 and exact R3 recorder diff.`

`REVIEWER: 05:50 and 09:05 saved captures · do the unique IDs, symbols and states match under an open-state mutation? · exact set equality and one-state mismatch control · re-derived y against the raw row objects and the 09:05 process brackets.`
