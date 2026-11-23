# B-UNIVERSE-REFRESH-ACTS — GATE B CODEX HANDOVER

**One gate only:** review the Gate B correction after Langston's SEND BACK at `9ea4c201c`. Do not review Gate C in this invocation.

## Dispatch header

- **DECLARED CHANGE-CLASS:** `architecture`
- **DOC SET FOR `architecture`, row by row:**
  - `SCOPE` — present: `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md`
  - `PRE_AUDIT` — present: `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`
  - `COMPLETION_REPORT` — absent, due Step 11
  - `BATCH_CATALOG.md` — absent, due Step 10
  - `PHASE_HISTORY.md` — absent, due Step 10
  - `SYSTEM_MANUAL.md` — absent, due Step 10
  - `SYSTEM_IMPACT_MAP.md` — absent, due Step 10
  - `DELETED_COMPONENTS_LOG.md` — present; two entries rode the Step-3 commits
- **STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`, PROCEED on r3 with C1-C3 (Discord `1574123287120846969`), folded at `257124874`.

## Inherited ruling

Langston ruled SEND BACK on Gate B at `9ea4c201c` (Discord `1574196864100864091`). The seam was sound; three corrections and two accuracy conditions were owed here. The re-add flap, single-flight location and capture-switch proof remain Gate C and are deliberately outside this ask.

## Correction 1 — retirement is a fence

File: `server/services/passive-archive/recorder-connection.ts`

BEFORE:

```ts
async watchTick(nowMs: number): Promise<WatchDecision> {
  if (!this.opts.isEnabled()) return 'skip';
  // ...
}

private async raiseSilentAlert(cfg: RecorderWatchConfig, nowMs: number): Promise<void> {
  this.alertRaised = true;
  // ...
  await deps.addAlert({ /* ... */ });
}

async stopAndResolve(evidence: string): Promise<boolean> {
  let ok = true;
  await deps.resolveByKey(/* ... */);
```

AFTER:

```ts
private retired = false;

async watchTick(nowMs: number): Promise<WatchDecision> {
  if (this.retired || !this.opts.isEnabled()) return 'skip';
  // the adoption await
  if (this.retired) return 'skip';
  // ...
}

private async raiseSilentAlert(cfg: RecorderWatchConfig, nowMs: number): Promise<void> {
  if (this.retired) return;
  this.alertRaised = true;
  const deps = await _alertDeps();
  if (this.retired) { this.alertRaised = false; return; }
  await deps.addAlert({ /* ... */ });
  if (this.retired) {
    await deps.resolveByKey(/* final post-write resolve */);
    this.alertRaised = false;
  }
}

async stopAndResolve(evidence: string): Promise<boolean> {
  this.retired = true; // synchronous, before every await
  let ok = true;
  await deps.resolveByKey(/* ... */);
```

The test holds the alert append in flight, retires the connection, then releases the append. It observes the retirement resolve followed by the required post-write resolve, and the next watch tick returns `skip`.

## Correction 2 — reopen-replay add path is executed

File: `server/tests/unit/b-universe-refresh-acts-recorder.test.ts`

The new test boots and opens a shard, closes its socket through the fake socket's `_close`, places an add while the socket is down, advances the reconnect timer, then answers the reopened socket's no-`req_id` subscription frames. It proves there are two replay frames carrying the added symbol, the symbol remains in the running set, no add failure is recorded, and the reopened socket is not terminated by the open-time reply fence.

## Correction 3 — dead `state.enabled` residual is deleted

File: `server/services/passive-archive/crypto-spot-archiver.ts`

The module-local flag had no false writer after `stopCryptoSpotArchiver` was deleted, so it is removed rather than retained as an unreachable guard. Crypto capture is gated at bootstrap: when disabled, neither the archiver nor the refresh cron is started. A constructed shard therefore supplies `isEnabled: () => true` until its universe retires it through `stopAndResolve`. Gate C still owes the bootstrap/capture-switch review; this disposition does not ask Coltrane to rule on Gate C now.

## Accuracy conditions folded

- The change list now says the run row's `added` list means **placed in recorder state**, not confirmed subscribed.
- New-shard overflow additions use the open-time subscription path and are not tracked in `pendingAdds`; if `shardsOpened` is non-empty, zero `rejected_adds` / `unconfirmed_adds` is explicitly not evidence that every overflow addition was accepted.
- The new-shard grace clock starts at apply time, matching the implementation, not at socket open.

## Checks

- `server/tests/unit/b-universe-refresh-acts-recorder.test.ts` and `server/tests/unit/b-crypto-feed-watchdog.test.ts`: 47 of 47 tests passed.
- TypeScript baseline: current 314 errors, baseline 314 errors; no regression.

## Fresh-reader record

`REVIEWER: claim-only · after the Gate B correction, can retirement leave a newly active silent-connection row when the alert append was already in flight? · HIT: the post-write resolve evidence was rejected by the production evidence gate although the unit double accepted it; a storage failure or process exit can still interrupt the non-atomic cleanup · re-derived y`

The evidence string now carries `B-UNIVERSE-REFRESH-ACTS #1018`, which the production validator accepts through its `§/#ref` arm. The concurrency test imports that production validator and rejects any post-write resolve evidence the real store would reject. The narrower guarantee is explicit: with successful alert-store operations, retirement resolves a row whose append finishes after the first retirement resolve. A storage failure or process exit can still interrupt the second resolve; that pre-existing failure class remains logged for hand resolution and is not claimed away.

## Review ask

At the exact pushed ref named in the Discord dispatch, rule on Gate B only: are all three SEND BACK changes and the two accuracy conditions discharged without creating a new retirement, replay or capture-switch failure? PROCEED or SEND BACK with exact evidence. Gate C follows separately.
