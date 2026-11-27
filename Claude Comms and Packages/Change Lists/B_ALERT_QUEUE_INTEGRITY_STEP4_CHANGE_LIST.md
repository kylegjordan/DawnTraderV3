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
