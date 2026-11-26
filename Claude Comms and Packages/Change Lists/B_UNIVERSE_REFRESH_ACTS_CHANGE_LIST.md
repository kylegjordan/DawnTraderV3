# B-UNIVERSE-REFRESH-ACTS — STEP 4 CHANGE LIST (plan row 18, #1018, KD-26)

**Owner:** CC-A (OLD Claude / OLD Codex on the Codex shift) · **Reviewer:** Langston, then Coltrane · **Date:** 2026-11-22 to 2026-11-24

## DISPATCH HEADER (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header, verbatim) |
| ii | **DOC SET FOR `architecture`** | `SCOPE` **present** — `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md` · `PRE_AUDIT` **present** — `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md` · `COMPLETION_REPORT` **absent, due Step 11** · `BATCH_CATALOG.md` **absent, due Step 10** · `PHASE_HISTORY.md` **absent, due Step 10** · `SYSTEM_MANUAL.md` **absent, due Step 10** · `SYSTEM_IMPACT_MAP.md` **absent, due Step 10** · `DELETED_COMPONENTS_LOG.md` **present** (two entries, rode 40b52d8f2 + 3a85372e5) |
| iii | **STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`, PROCEED on r3 with C1-C3 (Discord 1574123287120846969), folded at 257124874 |

## Step 7 correction — OBJ-1 diagnostic code review

**Base:** the literal Phase A staging build `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`. Coltrane approved the design for implementation at 03:47:56Z under `e1f465169504b61a0c7af7690dd17e6889c52d61`. The serving evidence, completed OBJ-5 reads and the alert disposition are in the shared Change List at `cddc0e7751d797485cb11e484102cc263982775c`. This candidate requires exact code review. Any restart still needs separate substitution authority, reviewed shared placement, green CI, renewed window and same-day B75 `DONE` checks, NEW/INFRA's slot agreement, and ANALYST's reviewed return to the literal Phase A build. The original OBJ-1 gate remains open.

**R2 folded the 04:37:14Z SEND BACK on `afb61b056fada039a391adcdaf12b9155ffa0e16`.** Coltrane injected the dropped symbol into only the replacement OHLC frame and supplied the corresponding success. The old collector inferred omission from the shard's local list. R2 read the exact serialized strings supplied to both `ws.send` calls and reported inclusion separately for each channel. Both single-channel resend controls were falsely complete on R1 and incomplete on R2, with correct settled membership and add receipts throughout.

**R3 folds the 04:49:55Z SEND BACK on `98ccb72cd710d0206219fec78f281a38e645431f`.** After the original shard retired, a surviving shard's reconnect sent a valid ticker subscription for the removed symbol in the send normally used for OHLC. R2 discarded that valid request due to its call position and reported a false completion. R3 classifies every actual outgoing frame by its encoded channel and accumulates all observed changed symbols on that channel. Any recognized frame naming a dropped symbol records its socket as a carrier, regardless of shard or call order. Omission requires both valid channels. Any unreadable outgoing subscription marks the observation incomplete across the entire recorder. Requestless add receipts still require one valid requestless frame per channel, both containing the symbol. The retired-shard tests hold the settled list and new symbol receipts fixed, and vary normal omission, a normal-position ticker resend, a ticker resend in the usual OHLC send, and an unrecognized outgoing channel.

```ts
ws.send(ohlc);
const ticker = JSON.stringify({
  method: 'subscribe',
  params: { channel: 'ticker', symbol: shard.symbols },
});
ws.send(ticker);
refreshProof?.noteOpen(shard.id, ws, [ohlc, ticker]);
```

**MODIFIED — natural refresh.** Before: the run passed only the selected adds, drops and occurrence ID into the recorder. After:

```ts
const r = await archiver.applyCryptoUniverseChange({
  add: decision.add, drop: decision.drop, occurrenceId,
  ...(triggerSource === 'cron' && decision.add.length > 0 && decision.drop.length > 0
    ? { proof: { computed, pins, bounded: outcome === 'applied_confirmed' } }
    : {}),
});
```

**MODIFIED — crypto recorder only.** Before: channel identity was discarded before the connection counted successful replies. After: record raw method, symbol, channel and request ID against the socket accepting the frame before forwarding into the unchanged receipt handlers. Capture the actual sent incremental IDs and the requestless two-channel open frames, including overflow and reconnect. A stale socket's callback is already rejected by the connection. The collector can sample once per process, on the first eligible natural apply. It emits one structured `[B-UNIVERSE-REFRESH-ACTS][OBJ-1]` line in the app log. The timer uses the existing handshake allowance plus the recorder's resolved reply window and does not hold the occurrence open.

```ts
if (refreshProof && shard.conn?.ws && (msg.method === 'subscribe' || msg.method === 'unsubscribe')) {
  const success = msg.success === true;
  const symbol = success ? msg.result?.symbol : replySymbol(msg);
  if (typeof symbol === 'string' && (msg.req_id === undefined || Number.isSafeInteger(msg.req_id))) {
    refreshProof.noteReply(shard.conn.ws, msg.method, symbol, msg.req_id ?? null, msg.result?.channel, success);
  }
}
```

**NEW — readback proof.** Snapshot before and settled membership, computed symbols, retained pins, and retained symbols outside the bounded drop. Report both set differences and actual changes. An add needs distinct receipts on the current open socket. For a drop, every observed former carrier needs both unsubscribe receipts, or actual closure plus retired-shard or replacement-omission evidence. Log timestamps, process-start identity, and the build read at module load. The log's `complete` field covers observed set and wire evidence. Join it by occurrence ID to a successful natural occurrence and terminal apply row before using it to support any release.

```ts
const request = requests.get(symbol);
if (!request || request.id !== id || performance.now() > request.deadline) return;
if (!success) {
  this.rejected.add(symbol);
} else if (channel === 'ticker' || channel === 'ohlc') {
  request.acceptedAt[channel] ??= Date.now();
}
```

**Verification controls.** Exercise a complete apply with pins and a bounded retained symbol, equal-count substitution, missing/duplicate/delayed and wrong-request replies, explicit rejection, old-socket closure with a connecting replacement, matching requestless reconnect and overflow replies, single-channel resubscribe on each replacement channel, retired-shard resend through either call and unknown frames, stale generation, and interleaved apply. The refresh tests also check that missed catch-up has the same apply outcome without arming the diagnostic. R3 passed 178/178 across seven focused suites, covering refresh orchestration, recorder, loaders, cron catch-up and Feed Health.

REVIEWER: claim-only · could another state give a falsely complete readback? · HIT: the initial wall-clock deadline let a backward clock step accept a late receipt · re-derived y with a 15,001 ms elapsed fake-socket test and a rolled-back wall clock. Deadline now uses monotonic elapsed time. Wall-clock timestamps are for the evidence record.

**Attack point for code review:** Can this observer emit `complete` with a wrong same-count set, a stale socket, or only one distinct channel? In particular, check Crypto Spot's requestless replay and the current-versus-retired shard branch for drops. The collector does not drive business decisions or modify the existing subscription behavior.

## THE CHANGE SET — FOUR COMMITS, ALL MINE

⚠️ `257124874..HEAD` also holds other sessions' commits. **Review these four only:**

| commit | plan items | what |
|---|---|---|
| `40b52d8f2` | P1, P2 | per-fetch records + DB-only volume floor in `universe-loader.ts`; JSON `minVolume24hUsd` removed |
| `a232b7132` | P3, P4, P5 | `applyCryptoUniverseChange` seam; incremental subscribe/unsubscribe in `recorder-connection.ts`; new-symbol grace in the feed alarm; `stopCryptoSpotArchiver` deleted (J8) |
| `3a85372e5` | P6-P12 | `crypto-universe-refresh.ts`, its cron file, the pins reader, table + migration + rollback, actor, owner-table row, `b74-refresh-universe.ts` archived |
| `d4b2383fd` | CI fix | the two knobs read async (see "CI fix" below) |

`git status --porcelain` at push: only `?? .claude/launch.json` (local, never committed). No untracked batch file.

## LOAD-BEARING HUNKS

### 1. The gate order — `server/services/crypto-universe-refresh.ts` (NEW)
```ts
  if (!isUniverseFetchComplete(universe.batches)) {
    outcome = 'refused'; refusalReason = 'incomplete_fetch';           // arm (a)
  } else {
    let degenerate = computed.length === 0;                            // C1: caught, recorded
    if (!degenerate) { try { assertClassifiedPlausible(countBefore, computed.length); } catch { degenerate = true; } }
    if (degenerate) {
      outcome = 'refused'; refusalReason = 'degenerate';
      refusalMessage = `crypto spot universe refresh: computed ${computed.length} symbols against ${countBefore} running ` +
        `(floor ${Math.ceil(countBefore / 2)}); refusing as degenerate`;          // C2: our message
    } else {
      pins = await readCryptoUniversePins();                           // a throw propagates
      decision = decideRefresh({ running, computed, pins, volumeUsdBySymbol: universe.volumeUsdBySymbol,
        maxDropShare, confirmMaxDiffShare, baselineComputed: baselineFrom(lastConfirmable ?? null) });
      outcome = decision.outcome; refusalReason = decision.refusalReason; confirmable = true;
    }
  }
```

### 2. Arm (b) and the confirmed bounded step — `decideRefresh` (pure)
```ts
  const add = sorted([...computed].filter(s => !running.has(s)));
  const dropped = sorted([...running].filter(s => !computed.has(s) && !pins.has(s)));
  const dropShare = running.size === 0 ? 0 : dropped.length / running.size;
  if (dropShare <= input.maxDropShare) { /* applied | noop */ }
  if (input.baselineComputed === null) return refuse(null);
  const confirmDiffShare = symmetricDiffShare(input.computed, input.baselineComputed);
  if (confirmDiffShare > input.confirmMaxDiffShare) return refuse(confirmDiffShare);
  const confirmedSet = [...running].filter(s => !computed.has(s) && !baseline.has(s) && !pins.has(s));
  const cap = Math.floor(input.maxDropShare * running.size);
  // lowest 24h USD volume first; no ticker today = lowest of all; ties by symbol
```

### 3. The apply seam — `crypto-spot-archiver.ts:516` `applyCryptoUniverseChange` (NEW, a232b7132)
Drops first, per shard: `forgetSymbol` (age maps + denominator), then `sendUnsubscribe`; an emptied shard runs `stopAndResolve` (its own alerts resolved before the socket closes, §2.9), and its id is never reused. Adds: least-full shard under `passive_archive.b74_crypto_ws_shard_size`, `subscribedAtMs = null` (graced until confirmed), `sendAdd` with its own `req_id`; overflow opens new shards whose grace clock starts at apply time. The run row's `added` list means **placed in recorder state**, not confirmed subscribed. New-shard overflow additions use the open-time subscription path and are not in `pendingAdds`; the run row therefore persists their exact symbols in `untracked_overflow_adds`, so zero `rejected_adds` / `unconfirmed_adds` is never misread as proof that those overflow additions were accepted. "Start if not running" covers OBJ-4.

### 4. Reply routing — `recorder-connection.ts:301` (MODIFIED)
A reply carrying `req_id` answers an incremental add and is never counted in the open-time tally; a rejected or timed-out add is withdrawn from the shard and age maps and handed back through `takeCryptoAddFailures`, never `forceReconnect`. An unsubscribe reply has its own branch and counters.

### 5. The CI fix — `d4b2383fd`
BEFORE:
```ts
  const { prefetchModule, getCachedNumberRequired, GLOBAL_KEY } = await import('./module-constants-service.js');
  await prefetchModule(MODULE);
  const maxDropShare = getCachedNumberRequired(MODULE, MAX_DROP_SHARE_KEY, GLOBAL_KEY);
```
AFTER:
```ts
  const { getConstant, GLOBAL_KEY } = await import('./module-constants-service.js');
  const requiredNumber = async (name: string): Promise<number> => {
    const v = await getConstant<unknown>(MODULE, name, GLOBAL_KEY);
    if (typeof v !== 'number') throw new Error(`module_constants: required number missing for ${MODULE}.${name} (got ...)`);
    return v;
  };
```
CI 45071468824 failed the 8a-P4c inc 3 sweep (`b-price-side-8a-p4c-inc3-guard`): sync readers are reserved for modules the boot warmup prefetches, and `crypto_spot` is not one. A once-a-day job needs no warm cache, so the sweep is not widened and no exception registered. New test: a knob stored as a string throws.

### 6. Bootstrap placement — `passive-archive-bootstrap.ts` (MODIFIED) — DEPARTURE from P6
```ts
      startCryptoSpotArchiver()
        .catch(err => { console.error('[B74][bootstrap] crypto-spot archiver failed to start:', ...); })
        .then(() => registerCryptoUniverseRefreshCron())
        .catch(err => { console.error('[B-UNIVERSE-REFRESH-ACTS][bootstrap] ... failed to register:', ...); })
```
P6 said "wired at `server/index.ts` after `:97`". Armed there, a boot catch-up could apply a change to shards the archiver's start then clears, and with capture disabled an apply would start the recorder against the operator's setting.

## P12 — WIRE CHECK (Kraken v2 public ticker, read-only, 2026-11-22 21:03Z)
Subscribe `[BTC/USD, ETH/USD, NOTAREAL/USD]` with `req_id 4101`, then unsubscribe with `4102`, then subscribe with no `req_id`. Replies, verbatim fields:
- `{"method":"subscribe","req_id":4101,"success":false,"symbol":"NOTAREAL/USD","error":"Currency pair not supported NOTAREAL/USD"}`
- `{"method":"subscribe","req_id":4101,"success":true,"result":{"channel":"ticker","symbol":"BTC/USD",...}}` (and ETH/USD)
- `{"method":"unsubscribe","req_id":4102,"success":true,"result":{"channel":"ticker","symbol":"BTC/USD",...}}` (and ETH/USD)
- the no-`req_id` subscribe reply carries no `req_id`.
⇒ one reply per symbol; both methods echo `req_id`; a rejection carries `req_id` + `symbol` + `error`. The §2.4 fallback is not needed. Script and capture are throwaway (scratchpad), not committed.

## VERIFICATION
- tsc 314 = baseline (`node scripts/check-tsc-baseline.mjs`).
- Batch suites: loader + recorder + refresh + the cron fence 123/123 at 3a85372e5; refresh + sweep guard 65/65 at d4b2383fd.
- CI: 45071468824 on 3a85372e5 failed the sweep only (fixed by d4b2383fd); run 45074378106 on d4b2383fd: TypeScript Check, Test Suite, Build, Docker Build all `success` (per-job conclusion read).

## JUDGEMENT CALLS — PLEASE ATTACK THESE
1. **Episode-scoped baseline.** The confirming baseline is the latest confirmable row only while it is `refused` or `applied_confirmed`; an `applied`/`noop` ends the episode, so a later large drop must be confirmed afresh.
2. **`trigger_source` column** (`cron` | `missed_catchup`), not in P8.
3. **CHECK constraints**: outcome set; `(outcome='refused') = (refusal_reason IS NOT NULL)`; trigger_source set.
4. **A throw in apply, row write or alert write propagates** to the occurrence runner (occurrence failed). A refusal never throws.
5. **A partial apply leaves no run row.** The next run reads the recorder's live set, so it starts from the truth.
6. **Bootstrap placement** (hunk 6).
7. **Owner-table JSON row hand-inserted** to match what `build-alert-owner-table.py` emits (builder also updated).
8. **30 s timeout on the dormant-schedule fence** in `b-cron-missed-catchup.test.ts` (whole-tree parse measured 10.5 s locally vs vitest's 5 s default); the fence now expects SEVEN schedules.
9. **The seventh dormant node-cron schedule** (`0 3 * * *`, `POLICY_MAX_LAG_MS` 4 h).
10. **Bare `catch {}` around `assertClassifiedPlausible`** — any throw from it reads as degenerate.
11. **Add rejections are recorded on the NEXT run's row** (`rejected_adds` / `unconfirmed_adds`): they only settle after the reply timeout, and are logged at the next run's start so a later throw cannot lose them.
12. **Running-set age resets at process start** (`max(last clean finish, process start)`) — a restart re-subscribes from a fresh compute.
13. **Rung-3 dedupe**: rung-3 does not re-mint daily while its row is open; all rungs resolve by prefix on the next `applied`/`noop`.
14. **P10 host removals at the Step-6 deploy**: the crontab line and `/tmp/b74-crypto-universe-cache.json` are removed after the in-app refresh's first run is confirmed, recorded in the deploy record.
15. **Knobs read async with a local fail-hard check** instead of `getCachedNumberRequired` (hunk 5).

## DEPLOY NOTE
Agreed with NEW Claude (1574117688643428434): earliest 11-25 02:30Z, folded into that deploy only if Step-4 PROCEED and 4/4 CI land before 11-23 21:00Z.

That fold cutoff was missed. No deploy is authorized here; the existing deploy hold at and after `a2f5cbc6d` remains in force.

## CODEX STEP-4 GATE RECORD

The inherited Step-4 review was split into three one-gate reads. The review refs remain the exact pushed objects even though the working commits were later rebased onto the current shared head.

| gate | exact reviewed/ref-to-review | result / object |
|---|---|---|
| A | `fecc618de9bdfa616a3984935767b4cec4437c7c` | **Coltrane PROCEED** 2026-11-23 22:30:31Z; Langston C4 folded by naming both awaits before `decideRefresh` |
| B | `bd4b0fa164a660da12707254db64f0191dd80ebb` | **Coltrane PROCEED** 2026-11-23 22:46:46Z; retirement fence, reopen replay, dead enabled flag, accepted-vs-placed wording and overflow evidence discharged; 75/75 independent focused tests |
| C | exact ref in the Gate C Discord dispatch | repeated-add page + clear rule + CC-A owner mapping; shared occurrence-runner single-flight location with the lock-session limit stated; boot-time crypto capture-switch ownership |

Gate C detail and the exact prior-verdict carry are in `Claude Comms and Packages/Langston Design Asks/B_UNIVERSE_REFRESH_ACTS_GATE_C_CODEX_HANDOVER.md`.
