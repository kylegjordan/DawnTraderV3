# B-ALERT-QUEUE-INTEGRITY — Step 4 code review

KD-123 · #647(i) · Sprint to Live 3c1 · CC-B. Declared change-class: `architecture`.

| Architecture document | Presence at the review ref |
|---|---|
| Scope | Present, `Scope Files/B_ALERT_QUEUE_INTEGRITY_SCOPE.md`, exact Step 1 text approved at `98393bec8`. |
| Pre-audit | Present, `Scope Files/B_ALERT_QUEUE_INTEGRITY_PRE_AUDIT.md`. |
| Completion report | Absent for this batch. Due at Step 11. |
| `1-system-manual/BATCH_CATALOG.md` | Present. Batch outcome due at Step 10. |
| `1-system-manual/PHASE_HISTORY.md` | Present. Batch outcome due at Step 10. |
| `1-system-manual/SYSTEM_MANUAL.md` | Present. Watchdog, receipt and cutover updates due at Step 10. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Present. Update the shared writer, watchdog and delivery boundaries at Step 10. |
| `1-system-manual/CHANGES_AND_FIXES.md` | Present. Record the loss mechanism and fix at Step 10. |
| `1-system-manual/RUNNING_ISSUES.md` | Present. Update #647(i) only when verified. |
| `1-system-manual/POST_AUDIT_ROADMAP.md` | N/A. KD-123 already places this work. No new roadmap action. |
| `1-system-manual/DELETED_COMPONENTS_LOG.md` | Present. Record retirement of the unlocked direct append and age-only lock takeover at Step 10. |
| `1-system-manual/ADJUSTMENT_FRAMEWORK.md` | N/A. The change introduces no trading parameter, threshold or schedule. |
| Phase 19 plan | Present. Update the #647(i) disposition in row 2.4b at Step 10. |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md` | Present, row 3c1 `QUEUED`. Later progression follows the governed window and proof. |
| Shared and CC-B memory, Coltrane memory, CC-B task list | Present in their governing locations. The batch ledger records the outcome at Step 10. |

**Step 2 reference:** `Claude Comms and Packages/Scope Files/B_ALERT_QUEUE_INTEGRITY_PRE_AUDIT.md` at `2a9e644cea3f038ff183045baaa68a12911b0bec`, approved by Coltrane at 04:13:06 UTC on Nov 27. The candidate carries the exact approved scope, audit and Step 2 change-list blobs. Runtime base `feddf5c73954b127329371fd4715cdae17c7788f`, implementation `bad218a64fdf2c23b72a532307bcb29318772186`, followed by test-only and review-record changes.

## Shared write boundary

**Deleted** from the plain-Node watchdog at the base, after the normal CLI throws:

```js
if (fileHasOpenDedupeKey(ALERTS_FILE, dedupeKey)) {
  log(`fallback: non-resolved ${dedupeKey} row already present — not appending`);
  return 'deduped';
}
const row = buildFallbackAlert({ title, body, dedupeKey, metadata, severity, category });
fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
fs.appendFileSync(ALERTS_FILE, JSON.stringify(row) + '\n');
```

**New** in `server/services/system-alert-file-lock.mjs`, acquired before the ledger snapshot and held through replacement:

```js
try {
  await link(unpublished, lockPath);
  acquired = true;
  break;
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
if (await readAgedDeadOwner(lockPath)) {
  await tryReap(lockPath, Math.ceil(deadline - performance.now()));
}
```

All seven existing canonical mutations use the same lock. A new owner publishes a complete unique token through an exclusive link. Linux records PID, PID namespace, boot and start ticks. Age alone supplies no death proof. The reaper holds the separate permanent kernel guard and compares the canonical token again immediately before unlink. Regular release compares its exact token. Timeouts preserve the queued work.

## Pending UUID, healthy reading and delivery

**New** in `server/services/watchdog-alert-store.mjs`. The queue shift and ledger write both occur under the ledger and per-key state locks in that order. Regular and fallback writers share an attempted UUID. The same-key match pins the exact unresolved row, a distinct terminal row is ineligible, and a delayed attempt cannot consume a successor. The heartbeat retains its UTC one-shot key.

```js
if (head?.row.id !== id) return exact?.dedupe_key === key ? exact : null;
let row = head.matchedId ? byId.get(head.matchedId)?.row : exact;
if (head.matchedId && (!row || row.dedupe_key !== key)) {
  throw new Error(`Durable watchdog match is absent from the ledger: ${head.matchedId}`);
}
if (!row) {
  const info = head.row.severity === 'info';
  row = [...byId.values()].find(({ row }) => row.dedupe_key === key && (info || row.state !== 'resolved'))?.row;
}
```

**Modified** in `scripts/system-alerts.ts`. Recovery requires a durable receipt for the exact matched row, an ordinary successful re-surface, or an already-terminal operator disposition. The first receipt marker follows webhook success. Ordinary promotion and retry timing retain their existing paths.

```ts
if (await pushToDiscord(alert) && isWatchdogReceiptAlert(alert)) {
  try {
    await mergeAlertMetadata(alert.id, {
      watchdog_first_receipt: { id: alert.id, delivered_at: new Date().toISOString() },
    }, true);
  } catch (error) {
    console.warn(`[fire-due] Watchdog receipt marker write failed for ${alert.id}:`, error);
  }
}
```

A healthy check persists the evidence beside the pending UUID even while the ledger is locked. It also persists a per-key recovery marker there. After a crash between that write and the debounce-state save, the next bad check invalidates the old streak. The next qualified relapse keeps its own UUID in the queue before the ledger is available.

## Evidence and limits

- The legacy unlocked watchdog loses its newly appended UUID when the paused canonical writer replaces the earlier snapshot. The fixture first observes the appended UUID, then its absence, with the preexisting and independent canonical IDs present after replacement.
- The local Windows isolated run passed 28 cases in three focused test files. Four actual-process cases cross both forced writer orderings with the ordinary and #1191 dispatchers. Each correlates the same pending UUID, the healthy check, HTTP delivery, dispatch output, durable metadata, terminal state and independent re-arm. The fixture substitutes executable shims for PM2 and the Windows npm launcher, and runs the actual alert CLI entry. The pinned #1191 dispatcher exercises the installed source at `423616c38605afa70e282572a432cd32dcabf290` reconstituted with candidate writer and receipt changes. Its 450-ID manifest is read by the fixture via the private path, SHA-256 `37dc0d1d99c37a49a614f24a136434a04ad5263be80fe19e20ee0906e24f9816`. An otherwise due warning from the manifest stays held while the unrelated watchdog alert delivers. Four kernel-dependent cases are scored through Linux CI.
- The ordinary and pinned failure fixtures observe 503, then 503 at the due re-surface, then 204. Before success there is no advanced re-surface marker. A send that succeeds immediately before a crash or marker-write failure can still be reported as unreceipted by the ledger and retried by the ordinary rule. The proof concerns receipt in the exercised schedules, within a system without atomic remote delivery and local marker commit.
- The interrupted-healthy fixture compares the evidence and both UUIDs before release and after dispatch. Removing recovery persistence yields a null recovery in that fixture. Removing the restart marker retains the old count and incorrectly queues two UUIDs after the very first post-restart failure.
- Uncontended local Windows, exact service `addAlert`, one existing dedupe row. 384 warmed calls per version in alternating blocks. Old median/p95 0.843/1.039 ms at `feddf5c73`; candidate 2.008/2.178 ms at `bad218a64`. Both returned the same control UUID within each ledger. This is a lock-path cost check. Installed Linux throughput and drain cost remain Step 6/7 checks.

`REVIEWER: claim-only · which objects distinguish retained delivery and a genuinely re-armed occurrence through contention? · HIT: capture the successor before unlock, correlate HTTP/dispatch/marker/terminal state, exercise an interrupted healthy tick and both dispatchers; marker window can allow later re-delivery · re-derived y`

## Review question

Does the exact diff safely link each recorded watchdog occurrence, its notification and any recovery across the shared lock, pending store and installed delivery path, including timeout, process death and same-key traffic? The approved P5 writer census and bidirectional drain apply to the app, both dispatcher variants, the direct watchdog entries, all timer, cron and failure entrances and remote commands. Before staging, enumerate the current writers again, obtain a compatible slot and preserve the extant #1191, Phase B, Entry Gate D and Price Feed Coverage boundaries. Mixed versions on the same ledger remain unsafe. Code review carries no staging approval.

## Step 4 send-back correction

Coltrane reviewed `6eb3ac599f1d4c8c204930c60925bfa9fd4909e5` at 05:24:51 UTC on Nov 27. Architecture, scope and pre-audit stand. This revision addresses only the three returned findings.

1. **Delayed health sample.** Previously the writer selected `state.queue.at(-1)` after the health check. The watchdog now samples the currently observed UUID before each probe. Under the state lock, `if (observed.id !== latest.row.id || latest.recovery !== null) return;` rejects stale work. A ledger-only observation also carries the previously tracked UUID, so a new occurrence invalidates it even if that occurrence retires before the delayed write. Both disk checks capture their UUIDs before their shared `statfs` sample. The separate debounce file is updated atomically under its own short lock only if it still matches the bytes read at the start of the tick. The forced HTTP overlap holds one 200 response, completes a second healthy tick and two 503 ticks, then releases the first response. The persisted failure streak stays at two, and two ordinary dispatcher receipts close only the earlier row. The later UUID stays active. Removing the ID comparison makes the fixture attach the old reading to the successor. A second overlap raises a critical disk UUID between an older healthy sample and its critical check, then proves that UUID remains active after delivery and another failed disk check.
2. **Receipt eligibility.** Previously any distinct unresolved row could absorb a same-key warning or critical attempt. The store now requires `info || (row.state !== 'resolved' && isWatchdogReceiptAlert(row))` when looking for a distinct match. It checks the receipt rule again at recovery under the ledger lock. A `health_check` info row added through the ordinary CLI stays active and gets no delivery; two separate critical UUIDs reach Discord, the first closes on its recorded healthy evidence and the successor stays active. The existing distinct critical match and UTC heartbeat tests cover eligible deduplication and the info path. Removing the eligibility filter stops the positive match to the critical row.
3. **Installed reaper location.** The old spawn used `resolve('server/scripts/reap-system-alert-lock.mjs')` relative to the caller. The source path now starts at `import.meta.url`, the flattened ESM app looks beside its `dist` directory, and the standalone CJS artifact resolves from its own `__dirname`. Its compatible packaging carries `server/scripts/reap-system-alert-lock.mjs` and `server/services/system-alert-file-lock.mjs` beside the artifact. The installed #1191 containment remains in service under its own governing plan. Linux controls kill a real holder, age its token, and require recovery from a different working directory through the absolute plain-Node watchdog entry and isolated ESM/CJS build layouts.

`REVIEWER: claim-only · which schedules could still close a successor, lose an eligible warning or leave the reaper dependent on the caller location? · HIT: capture both disk IDs before the cached sample, prevent the slow tick overwriting a newer failure streak, and distinguish the proposed isolated CJS layout from installed containment · re-derived y`

The corrected focused Windows run passed 31 of 31 runnable cases across the three suites, including all three tests using the pinned private #1191 manifest. Six Linux-only cases require the exact candidate job. The approved Scope and Pre-Audit are unchanged, and the code review does not clear P5 or #994.

## Step 6 preparation — offline #1191 manifest replay, Nov 27

Coltrane's 06:04:32 UTC Step 4 approval at `70290ae750a15d3f20db79a18d85833b035e9d07` left the three private-input cases open for independent reproduction. The earlier reviewer run exercised a synthetic manifest. The approved topic and integrated candidate `cdf3356af276cc339f7553fba7ca2951e220ed88` match on the 16 reviewed blobs. All four shared jobs passed on run `45958596744`; those jobs cannot establish the private-input result.

NEW reran the three cases from a clean checkout of `cdf3356af276cc339f7553fba7ca2951e220ed88` on Windows with Node 22.18.0, Vitest 3.2.4 and esbuild 0.25.9. The existing private manifest measured 16,650 bytes and 450 distinct lines, SHA-256 `37dc0d1d99c37a49a614f24a136434a04ad5263be80fe19e20ee0906e24f9816`. This matches the original containment scope and the test's digest assertion. The dispatcher is built by applying the candidate's alert-writer and receipt changes to the pinned `423616c38605afa70e282572a432cd32dcabf290` source against base `feddf5c73`. The cases use a temporary ledger, a loopback webhook and the frozen Nov 27 06:00 UTC clock, inside the hold period.

| Selected fixture | NEW result at the integrated candidate |
|---|---|
| Canonical writer reaches its replacement boundary first | Passed. Both writers preserved their records. The original watchdog UUID obtained one receipt and resolved. A new failure produced a distinct scheduled UUID. The preexisting control and one held manifest row remained identical. |
| Watchdog writer reaches its replacement boundary first | Passed. The reverse contention order preserved the same receipt, resolution, re-arm and held-row outcomes. |
| Pinned warning held while watchdog gets its first receipt | Passed. The loopback delivered HTTP outcomes `204, 503, 503, 204` in order. Failed deliveries did not advance the successor's resurface marker. The successful retry advanced it once and allowed resolution. The held VTS row remained identical through the final check. |

Command, with `DT_WATCHDOG_1191_PROOF_MANIFEST` pointing to the existing restricted input: `node node_modules/vitest/vitest.mjs run server/tests/unit/watchdog-alert-queue.test.ts --testNamePattern '[(]#1191[)]|keeps the pinned #1191 warning held'`. Three selected passed; the other 15 cases in this file were outside the filter. Each fixture exercises one held member from the exact 450-ID manifest. The full manifest is pinned as input. The result grades the isolated scenarios at the test clock, not the installed dispatcher or current hold state.

**Independent check requested.** INFRA coordination receipt `1575960348878573641` supplies the exact code and manifest digest. Independent reproduction must name the same candidate, digest, case results and environment, or identify the access gap. Keep manifest contents and row IDs out of Git, public CI and chat. The exact staging target, preservation or governed restoration of the separate dispatcher, full writer census and drain for cutover and rollback, and an eligible window remain Step 6 prerequisites. #994 Step 3 follows verified #647(i).

**Independent check complete, Nov 27 19:56:27 UTC.** Coltrane accepted report `8c51bd0ae29e8d9c300c14ca37b0211a60737369` at 19:52:10 UTC and then independently reproduced **3/3** under receipt `1575960348878573641` at exact `cdf3356af276cc339f7553fba7ca2951e220ed88`. The clean Linux x86_64 run used Node 22.22.1, Vitest 3.2.4 and esbuild 0.25.9, with loopback only. He rebuilt the unchanged 450-line, 16,650-byte LF manifest from the already restricted #1191 reviewer packet using the frozen rows' alert IDs and verified SHA-256 `37dc0d1d99c37a49a614f24a136434a04ad5263be80fe19e20ee0906e24f9816`. Using trade IDs instead failed that checksum. The exact tests skipped all three cases without the manifest and rejected deliberately invalid bytes. No new transfer was needed, and private scratch was removed after the run.

Both writer orders preserved both records, delivered and resolved the original watchdog alert, and re-armed to a distinct alert. The third case kept the pinned warning held through `204, 503, 503, 204`; only the successful retry advanced the successor's resurface marker. The independent offline case list is complete. Step 6 remains at the staging prerequisites above.

## Step 6 preparation — P5 cutover and rollback checklist

The inventory below starts from the approved [Pre-Audit A1 and P5](../Scope%20Files/B_ALERT_QUEUE_INTEGRITY_PRE_AUDIT.md) at `2a9e644cea3f038ff183045baaa68a12911b0bec`. Its 03:36–04:12 UTC readings on Nov 27 are historical. The #1191 bundle and the ordinary npm dispatcher are separate writer variants. Coltrane's offline replay at `cdf3356af` covers both contention orders and receipt/retry with the pinned standalone source. OLD's exact-tree check (`1575756017898229854`) shows that neither the Nov 28 R3 target nor its literal Phase A return contains the safeguard. These records establish the checklist inputs. Every item marked **FRESH** needs its own receipt in the actual window, independently for cutover and rollback.

### Writer inventory to reconcile in each direction

| Historical writer or admission surface | **FRESH** evidence to record before switching |
|---|---|
| Staging app via PM2, automatic health/engine producers and System Alerts acknowledgement through the API/UI | Capture running build and process identity, effective ledger and mutation routes. Record how new mutations are fenced and how in-flight app work and any child writers finish. |
| Ordinary dispatcher timer/service and separate #1191 `fire-due` override | Read the effective unit, drop-ins, normal fallback, executable/checkout hashes, ledger, last completed tick and pending timer/service work. Record INFRA/ANALYST's governed containment or restoration disposition and prove the entering variant matches the selected writer protocol. An expired hold predicate does not identify the effective command or prove compatibility. |
| Regular watchdog, `--heartbeat`, `--self-fail`, the primary alert CLI and plain-Node fallback | Read actual units, timers and failure edges. Account for direct/manual starts, every already admitted plain-Node and CLI child, and any durable pending attempt. |
| Staging governance checker, heartbeat and heartbeat failure notify | Identify the separate governance checkout and the app-checkout CLI path. Record each admission, retry and descendant; include direct service starts. |
| Staging `dt-db-map-stale`, `dt-db-map-weekly`, `dt-install-drift` and generic `dt-unit-failure@` | Record each parent and its direct alert-add child even if the failure hook never runs. Enumerate all enabled `OnFailure` edges and retrying or queued instances, including the observed logrotate notify route. Fence both scheduled and manual starts for parents and for the independent notify template. |
| Staging root archive/retention crons | Enumerate archival health, cold rotator, cold liveness and cold audit. Include direct equivalents and already launched `su`/npm/Node children, plus any newly discovered writer. |
| Staging Token Watch | Enumerate the birthcap and feed-watch `--mint` legs, store-watch, manual mint calls and all eight failure routes: birthcap, cold-offbox, feed-watch, followup, receiver, store-watch, summary and tier. Include any helper children. Obtain INFRA's evidence that protected Token Watch runs remain eligible. |
| Helsinki and laptop SSH entrances | With OLD/INFRA, enumerate Helsinki drift cron, deploy-notice gate/timer, both size watchers, memory-fence and privacy services and manual equivalents. Include the laptop `DawnTrader-Transcript-Archive` nightly SSH writer. Identify already launched remote commands and their staging children on the receiving end. |
| Manual, deploy and maintenance commands | Include CLI add/ack/resolve/dispatch, direct library maintenance such as the provenance backfill and B-NEW-40 soak script, and release/deploy hooks with a ledger mutation path. During the switch account for the authorized deploy command and its own window notices. Read-only mirrors and queue reads can serve as controls for classification. |

### Drain and restore evidence

1. **FRESH — pin both directions before reserving the slot.** NEW records the actual serving checkout/build/PID/restart and rollback point, exact candidate and return SHAs, full serving-to-target change ranges, per-job CI and owner clearances. INFRA supplies execution and dispatcher receipts, OLD owns the Universe Refresh and pool gates, ANALYST owns #1191 and the Phase A/B handoff, and PM coordinates the window. Use the current window register, recorded affected-owner dispositions and the deploy skill. Phase B, Entry Gate D, both Nov 28 legs, the protected Token Watch runs and the PFC observations retain their existing gates. No target or slot is selected here.
2. **FRESH — capture and fence admissions.** For each effective command record leg, UTC, owner, host, unit/cron/manual entry, executable/ref or artifact hash, ledger destination, previous enablement and retry state, observed in-flight work, and the reversible fence. Unfold timer or cron, manual start, failure/retry and SSH paths separately. For each fence retain readback that the entry is disabled or refuses new starts. Exercise refusal only by a method agreed for the slot that cannot start a writer if the fence is absent. Use a known installed writer and a known active process as discovery controls. A failed read leaves the row open.
3. **FRESH — drain and take the boundary snapshot.** Wait for admitted work to finish or account for its approved termination with the owner. Re-enumerate queues, process descendants and SSH children after fencing and at the switch boundary. Record any due, suppressed or unfinished job and its disposition. Inspect the ledger lock's actual ownership and the reaper guard's holder, and inventory the durable per-key watchdog queue, recovery/relapse state and debounce state. A persistent `.reap` file alone does not prove a held guard. Stop for an unexplained writer, lock, receipt or window conflict. Preserve the state files and evidence together for both directions.
4. **FRESH — verify the entering version before reopening writers.** After the separately authorized transition, check deploy record, built and serving identity, installed CLI and watchdog, reaper/helper files and the effective dispatcher against the pinned composition. Restore recorded admissions only after compatibility is established and account for suppressed work with its owners. Match start/terminal receipts, retain identity and normal delivery evidence, and keep the immediate Step 7 readback in its registered slot. The offline passing cases supply their own isolated fault proof. Leave a live case pending if its required evidence is unavailable in the slot.
5. **FRESH — repeat on rollback.** Re-read the actual serving state and repeat the inventory, fence, descendant drain, lock/guard and receipt checks for candidate writers before the return. Keep pending UUIDs and recovery/relapse state through the switch. Record unresolved, matched and pending dispositions before admitting any older writer that lacks the new state protocol. Preserve unresolved work for replay through a proven compatible version. A restored target or dispatcher that cannot coexist with the retained state keeps the return or admission gated. Then verify the exact returning composition and reconcile restored admissions against their captured states.

**Current return.** The checklist is an offline artifact. Step 6 still awaits the reviewed target and dispatcher composition, an approved window, and fresh cutover/rollback evidence. #994 stays behind verified #647(i). Keep Nov 28 **02:00 and 05:50 UTC** paper reads and the Price Feed Coverage OBJ-5 **07:00 UTC** readiness check or after both protected legs are dispositioned, whichever is later.
