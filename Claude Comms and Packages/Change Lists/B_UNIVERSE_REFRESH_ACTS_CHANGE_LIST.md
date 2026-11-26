# B-UNIVERSE-REFRESH-ACTS — STEP 4 CHANGE LIST (plan row 18, #1018, KD-26)

**Owner:** CC-A (OLD Claude / OLD Codex on the Codex shift) · **Reviewer:** Langston, then Coltrane · **Date:** 2026-11-22 to 2026-11-24

## DISPATCH HEADER (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header, verbatim) |
| ii | **DOC SET FOR `architecture`** | `SCOPE` **present** — `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md` · `PRE_AUDIT` **present** — `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md` · `COMPLETION_REPORT` **absent, due Step 11** · `BATCH_CATALOG.md` **absent, due Step 10** · `PHASE_HISTORY.md` **absent, due Step 10** · `SYSTEM_MANUAL.md` **absent, due Step 10** · `SYSTEM_IMPACT_MAP.md` **absent, due Step 10** · `DELETED_COMPONENTS_LOG.md` **present** (two entries, rode 40b52d8f2 + 3a85372e5) |
| iii | **STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`, PROCEED on r3 with C1-C3 (Discord 1574123287120846969), folded at 257124874 |

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

The Nov 23 21:00Z cutoff was missed, so this batch missed that combined deploy. NEW deployed the agreed aggregate `e3a96a8126f0280a9568bb1823b9210783f0afe0` on Nov 24 without this batch. Any new aggregate needs its own agreement and preflight.

### KD-120 — inherited sequencing hold released, 2026-11-25

- **Origin.** `a2f5cbc6d5b46e741ae7e10651fbf29aa30be1b3` introduced the B-DB-SIZE-RELIEF retention and daily cutover migrations. The [Nov 9 handover](../../1-system-manual/pm/handovers/2026-11-09_claude-to-codex.md) barred deploying that commit or its descendants ahead of stage 00 slot 5c without OLD's agreement.
- **Exact prior release and outcome.** On Nov 10 OLD released only `957b13fde2fdb9b9c12791699b8fabeaa3a9afed` to NEW after verifying the queue predecessors and the completed B75 sweep (`9789b236a63dc8e306a1e303e17d5cfd2064a9d8`, Discord `1569618659427614724`). NEW's deploy-record readback fixes the actual deployment at **Nov 10 07:48:04Z**, restart 688 (Discord `1569619797262475376`), consistent with staging's Nov 10 reflog and the same-day browser attempt. The [progress report](../Batch%20Completion/B_DB_SIZE_RELIEF_PROGRESS_REPORT.md) dates the deploy to Nov 11, when the post-deploy sweep was independently verified. The amended browser leg passed Nov 15 and Langston confirmed Step 8 at 06:39Z. The Nov 25 governed staging read found both exact B-DB-SIZE-RELIEF filenames in the 227-row migration ledger.
- **Disposition.** Kyle released this specific Step 6 hold in PM Codex Desktop under KD-120, conditional on its original reason having cleared. The sequencing condition is discharged. The missed Nov 23 fold still requires a fresh aggregate decision.
- **Exact preflight candidate.** Use `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, Coltrane's approved 8c Phase A ref (CI `45589022150`: four jobs green), now an ancestor of shared. It descends from serving `e3a96a8126f0280a9568bb1823b9210783f0afe0` (restart 715) and OLD's Step 5 boundary. It carries universe refresh, NEW's orphan-alert migration, ANALYST's Phase A and INFRA's reviewed DB read-only-role and helper-retirement revisions. Phase B is absent. Initial proposal `d3ec4a5d8` had the same application and migration bytes, but the installed Phase B gate requires the literal Phase A SHA to be live (correction Discord `1575113322963927162`). The governed migration read shows neither pending forward migration applied, with the two B-DB-SIZE-RELIEF entries as controls. The installed deployer matches reviewed SHA-256 `8835871626b97951292081ff2b249a91f217a80886c678e3d029ae74221ecad6`, root:root 0755. NEW's preliminary rollback comparison matched all 12 expected orphan statements (`1575112749892239462`), and must be repeated at deploy time. ANALYST offered to be sole deployer for the exact Phase A at the proposed slot, subject to NEW and INFRA clearance (`1575113259558768732`).
- **Protected reads.** The register census at candidate `d3ec4a5d8` found five open windows: B-RTB-PROMOTION-RETRY-STORM, B-TOKEN-WATCH-BIRTH-CAP, B-TOKEN-WATCH-FOLLOWUP-MEMORY, B-UNIVERSE-REFRESH-ACTS and B-XSTOCK-BAR-AVAILABILITY. The approved plan (§2.2) puts this separate deploy in the 02:30–02:55Z slot before the natural refresh, subject to the B75 sweep reaching `DONE` and owner clearance. The next possible slot is Nov 26. Re-read the register and migration ledger immediately before deployment, and preserve the first post-deploy natural 03:00Z refresh through readback before another restart.
- **Owner handoff.** OLD approved the exact target, operator and conditional slot (`1575113736723898369`). NEW agreed (`1575113776116662383`), owns fresh C-2 and pre/post counts, and requires the B-RTB window to be named. ANALYST owns execution and the Phase A identity/ON checks, including the R2' window. INFRA cleared both token-watch windows and the two INFRA revisions for the exact target and slot (`1575114755482583101`), subject to same-day B75 `DONE` and normal immediate preflight. Preserve the token-watch controller, follow-up job and immutable review snapshot, and send INFRA the actual restart timestamp. Skip the slot if the preflight cannot fit. OLD owns the first natural refresh readback and will signal when another restart can be considered. P10 retirement follows that readback.

### Step 6 — staging deploy completed, 2026-11-26

The 02:15:02Z B75 run `7e901415-112d-4a08-9a1a-064a1e65d18c` reached `DONE` before the deploy, with five partitions examined, five dropped and zero failed. In the approved 02:30–02:55Z slot, `dt-deploy` recorded `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` at 02:32:16Z, restart 716, claimed by `codex-c`. OLD read back the matching staging HEAD, `dist/BUILD_SHA`, online PM2 process and registration of the 03:00Z refresh job from that process. The successful record names all five protected windows with `window_notice=alerted` and register ref `8fac59c95ae2453b6633a58693c5d9f7c212fa03`. Keep the first natural run and its readback intact before a second staging restart, Phase B or P10 retirement.

### Step 7 — first natural occurrence readback, 2026-11-26

- **OBJ-7 pass for this occurrence.** Governed `dt-sql` joined the scheduled 03:00:00Z occurrence `15980689-b795-4219-8103-4b98880efa1d` (source `natural`, `succeeded`, completed 03:00:01.303Z) to run `7422a829-4f3a-4e34-b5a8-dba2a720ab8e` (source `cron`, outcome `applied`, finished 03:00:01.158Z). The serving ref and online process remained `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, PID 235604, restart 716, through the 03:05:33Z read.
- **Recorded local apply.** All nine fetches succeeded (one pair list, eight ticker batches); the run computed 445 distinct symbols and recorded 444→445 local assignments, three local adds (`AEVO/USD`, `OPEN/USD`, `TRU/USD`), two local drops (`SOON/USD`, `VFY/USD`), and pin `BABY/USD`. The pin was also computed and visibly held in `active_open_positions` at the follow-up read. It had post-run ticker and OHLC receipts and was outside the drop list. This run did not exercise the exception where a held pin falls outside the computed set.
- **Independent receipt evidence.** In the completed ticker window 03:01:01.158Z–03:05:01.158Z, `OPEN/USD` and `TRU/USD` had receipts and `AEVO/USD` did not, two of the three placed adds. OPEN and TRU also recorded 03:01 OHLC bars. The two dropped symbols had ticker receipts after the 02:32:16Z boot and before 03:00Z, and neither appeared in the completed post-run window. BTC/USD and ETH/USD had receipts on both sides of the run as controls. Secondary query at 03:05Z found neither ticker nor OHLC for AEVO in its checked post-run slices. Archive receipts demonstrate data delivery where observed. Quiet symbols can produce no receipt.
- **OBJ-1 proof pending.** At the exact deployed ref, `server/services/crypto-universe-refresh.ts:324-354` persists only local cardinality, planned/placed deltas, computed symbols and pin input. `server/services/drift-dashboard-aggregator.ts:1279` exports only configured cardinality. `server/services/passive-archive/crypto-spot-archiver.ts:328-340` can persist a frame before its symbol-map guard and supplies no complete post-settlement symbol set. The full running set cannot be compared symbol for symbol from these instruments. The old root cron entry is still present and its now-archived target produced `ERR_MODULE_NOT_FOUND` on this read. P10 retirement follows the readback gate. The UI check remains pending under the standing #1037 Drift Dashboard restriction. OBJ-5's first-hour observation remains open.
- **Coltrane HOLD, 03:11:33Z.** OBJ-7 passed for occurrence `15980689`. OBJ-1 remains open: exchanging `AEVO/USD` for `SOON/USD` in the expected set preserves the row's count, and the five send records establish attempted actions. Keep Phase A on restart 716, the scheduled reminder open, and Phase B, Entry Gate D and P10 behind first readback. The exact evidence commit `af08db921dd1f8bc7375fce0cf34c8054457c5ce` is available at `review/b-universe-refresh-acts-step7-readback`, as requested (Discord `1575349325498949805`).
- **Exact record verified, 03:19:25Z.** Coltrane fetched `af08db921` and confirmed OBJ-7. In his isolated test at serving ref `5ecd7ee24`, one ticker receipt left an add pending. Two ticker receipts and the ticker-plus-OHLC control both completed it. The drop counters likewise could not distinguish those two-reply cases. The duplicate is synthetic. Direct source re-read at that ref confirms `crypto-spot-archiver.ts:306–317` discards channel identity before dispatch to `recorder-connection.ts:309–330`. All 18 tests in the existing recorder suite passed on byte-identical runtime and test files. The test titled “only by BOTH channel replies” calls the same channel-less helper twice for its success case.
- REVIEWER: claim-only · identify the objects that could establish exact running membership and other states that fit · HIT: immediate local cardinality and archive receipts cannot establish the settled full symbol set · re-derived y at the deployed ref and live readback.

#### OBJ-1 — minimum proof and conditional rerun proposal

1. Use a governed read-only observation from the actual serving restart 716 if one can return the recorder's full assigned set, with build SHA, PID, process start, read time and occurrence ID. Compare both set differences against the occurrence's computed symbols and eligible retained pins (445 total for `15980689`). Require distinct settled ticker and OHLC subscribe receipts for AEVO/USD, OPEN/USD and TRU/USD. Require both unsubscribe receipts for each of SOON/USD and VFY/USD, or verified closure of its old socket generation and proof that any replacement omitted it. The exact serving build exposes only cardinality in its governed status data. Coltrane found no approved direct reader at 03:20:05Z and asked INFRA to check independently.
2. If that observation is unavailable, review a diagnostic before implementation. It would capture the exact expected and recorder sets in the serving process after settlement and report receipts keyed to occurrence, method, channel, symbol, socket generation and request ID where present. Limit receipt capture to the occurrence and its changed symbols. A timeout, rejection, missing channel or receipt on the wrong socket generation leaves the gate open. Require the complete two-channel case as a control. Exercise an equal-count symbol substitution, a ticker-only or duplicate ticker receipt, a stale socket receipt, a timeout or rejection, matched drop receipts, and socket closure with and without the drop reflected on the replacement.
3. The 03:20:05Z ruling keeps the original readback open. Accepting a later natural occurrence to reconsider the fence needs a separate ruling. Require exact diagnostic code review, green CI, a NEW/INFRA slot agreement, renewed protected-window and same-day B75 `DONE` checks, and ANALYST's reviewed route back to literal `5ecd7ee24` serving before Phase B. Before choosing the slot, agree on a natural 03:00Z rerun with a terminal apply, actual adds and drops, and one process across the before and settled reads. Compare the set with the rerun's expected symbols and apply the same receipt controls. A no-op leaves the change paths unexercised. OLD owns explicit release.

**Coltrane PROCEED on implementation only, 03:47:56Z, exact proposal `e1f465169504b61a0c7af7690dd17e6889c52d61`.** Capture full before and settled sets in one process. Account for retained pins and explicitly logged bounded drops. Require distinct success on both channels for each actual change, scoped to method, symbol, request when present and socket generation. For a drop, observed closure and omission from both replacement subscription channels can substitute for the two unsubscribe receipts. Cover requestless overflow and reconnect subscribe, positive settlement, same-count mismatch, duplicate ticker, missing channel, stale generation, rejection and timeout. Step 7, restart 716, Phase B, Entry Gate D and P10 remain held pending all the preceding deployment and substitution gates. Reminder `7c082d80` remains active.

**Diagnostic candidate dispatched for exact code review.** `afb61b056fada039a391adcdaf12b9155ffa0e16` is available on `review/b-universe-refresh-obj1-diagnostic`, directly above literal `5ecd7ee24`. The candidate's Change List contains the inline diff and the fresh-reader finding with its backward-clock regression test. The five focused suites passed 170/170, and local TypeScript stayed within the 314-error baseline. Exact code review was requested in Discord `1575366287964635147`. Branch CI is `45754842914`. ANALYST, NEW and INFRA have the conditional return-path and slot-planning request (`1575366352158466159`). Code review, a separate later-occurrence substitution ruling and all deploy preflight conditions remain gates.

**Conditional return plan approved, 04:21:07Z.** Coltrane approved ANALYST's plan at `9f2f7e88ef89e138ed7c24b7133d5f58c73792c8`; its conditions are recorded in the 8c Change List at `24a1fd25bfe0802796b5dc52e7b28f89aba7c43a`. OLD owns the diagnostic and evidence export. Before a planned return, OLD and Coltrane must read and disposition the preserved raw sets, receipt and closure records, process identity and occurrence while the diagnostic is still serving. Fix the recovery trigger and authorizer before leaving 716. An independently authorized recovery can restore A with OBJ-1 open and must preserve the available evidence. ANALYST owns the governed return to literal `5ecd7ee24` and verifies fresh process identity, resumed engine, recorder boot and subscriptions, and `PENDING_ON`. Before both legs verify the exact migration names against the ledger, then prove it unchanged afterward. Each leg requires current window clearance and same-day B75 `DONE`. The eventual Phase B target excludes this diagnostic and still requires OLD's explicit release.

**Deployment placement remains open.** At shared `4d183ecbf`, the installed deployer's required shared-ancestry test rejects `afb61b056`; its parent literal A passes the same test. Retain the diagnostic-only target and the ordinary deployer gate. Any proposed shared placement needs its own review and must keep the eventual Phase B target free of the temporary diagnostic. INFRA has the mirror and review-queue check for the exact dispatch (Discord `1575368946348195861`).

**Code review R1 SEND BACK, 04:37:14Z.** At exact `afb61b056`, Coltrane reproduced a false drop pass by inserting the removed symbol into only the replacement OHLC payload with its matching reply. The old proof inferred both omissions from the shard's local list. Coltrane independently passed 191/191 across his seven focused suites, including the prior equal-count, stale-generation, missing-channel and elapsed-time controls.

**Exact R2 dispatched.** `98ccb72cd710d0206219fec78f281a38e645431f` at `review/b-universe-refresh-obj1-diagnostic-r2` is a direct child of literal Phase A. It inspects both exact serialized replacement requests and tracks any generation that sent a dropped symbol on either channel. Integrated replacements that sent the dropped symbol in only ticker or only OHLC, with a matching reply, each yielded an erroneous pass on R1 and an incomplete proof on R2. The normal reconnect control still passes when both payloads omit the symbol. R2 passed 174/174 locally across seven focused suites. Exact recheck requested in Discord `1575370876939931870` and all-four CI is tracked under run `45756780006`. No restart or later-occurrence authority has been granted.

#### OBJ-5 — first-hour grading coverage

The 03:20:28Z saved Feed Health report said `Info: crypto recorder live share NOT GRADED (warming)`. Staging `feed_health` still has `recorder_live_window_ms=7200000` and `recorder_live_share_floor=0.60`. The two-hour clock starts at the process's first ticker update (`crypto-spot-archiver.ts:171–175`), after the 02:32:06.222Z restart. The whole first post-refresh hour therefore falls before the earliest possible grade. Read the scheduled hour independently at 04:00Z and report observed alert counts with that coverage limit. Sample a further same-process cycle after warm-up to observe the recorder arm. Only the latest daily report is retained by this job, and its healthy state does not expose per-symbol membership or per-cycle share.

**First-hour read completed at 04:12:52Z.** All 12 scheduled Feed Health occurrences from 03:00Z through 03:55Z succeeded and all 12 logged evaluations in the first hour after the 03:00:01.303Z refresh were Grade A. There were zero new Feed Health alert rows in that hour in either mode. The same query retrieved two prior critical control rows per mode for the 02:25Z and 02:30Z checks. The 04:10:06Z saved report still explicitly said the crypto recorder was warming. The first-hour no-page observation is accounted for, and live recorder grading remains to be observed after warm-up. The serving ref and PID still matched Phase A on restart 716 at read time.

**Post-warm read completed at 04:35:36Z.** The 04:35Z natural Feed Health occurrence succeeded at 04:35:03.036Z. Its saved 04:35:02.986Z report was Grade A, healthy, with no issues. The 04:30:18.363Z report still emitted the recorder warming line. Both crypto recorder shards logged active connections, data and persisted rows on either side of the 04:35Z report, at 04:34:11Z and 04:35:11Z, in the same build and PID on restart 716. At exact A, `feed-integrity-monitor.ts:404–429,590–601` emits a distinct line for missing config, warming, shard grace or a below-floor share. The active recorder control and the two reports establish a healthy recorder grade on the post-warm cycle. Actual per-shard shares and the full assigned set are not emitted by this check. OBJ-5 is accounted for. OBJ-1 remains open.

#### Concurrent alert dispositions, 2026-11-26

- **Crypto-perp OHLC writer shed** `b42cd954-3f86-4ce1-aec3-8e3b26c359fa`: resolved at 03:15:34Z by `codex-a` after the same writer resumed successful upserts (`/var/log/dawntrader/out.log:3276401`, 03:12:43Z). The recovery query found 918 persisted bars across 184 symbols for interval starts in [03:08Z, 03:13Z), captured since the shed. It proves the writer recovered. Completeness of the previously shed rows remains unmeasured.
- **Nov 25 03:00Z refresh occurrence** `13a2720c-323e-48cc-bfb6-6eacb80ad680`: the Nov 26 occurrence is a positive control in the occurrence and audit ledgers, and neither contains the Nov 25 occurrence. At 03:00:02.008Z on Nov 25 the standalone runner computed 440 symbols and wrote its own cache (`/var/log/dawntrader/b74-refresh.log:1247–1252`). The prior staging build `e3a96a812` had no in-process job. The new schedule was registered on Nov 26 after 02:32Z, and the verifier's prior-date fallback surfaced a slot before activation (`server/services/cron-fire-evidence-verifier.ts:365-418`). The exact slot is beyond the job's 4-hour replay window. ANALYST resolved the specific false alarm at 03:46:19.877Z with evidence `cc468ee5ce43bce33ba29f76782959ac5e9b091f` (Discord `1575357140816887903`), and OLD read back that terminal state. Coltrane concurred at 03:50:01Z. The durable per-job activation boundary belongs to ANALYST as a scoped follow-up. The false alarm requires no replay.

## CODEX STEP-4 GATE RECORD

The inherited Step-4 review was split into three one-gate reads. The review refs remain the exact pushed objects even though the working commits were later rebased onto the current shared head.

| gate | exact reviewed/ref-to-review | result / object |
|---|---|---|
| A | `fecc618de9bdfa616a3984935767b4cec4437c7c` | **Coltrane PROCEED** 2026-11-23 22:30:31Z; Langston C4 folded by naming both awaits before `decideRefresh` |
| B | `bd4b0fa164a660da12707254db64f0191dd80ebb` | **Coltrane PROCEED** 2026-11-23 22:46:46Z; retirement fence, reopen replay, dead enabled flag, accepted-vs-placed wording and overflow evidence discharged; 75/75 independent focused tests |
| C | exact ref in the Gate C Discord dispatch | repeated-add page + clear rule + CC-A owner mapping; shared occurrence-runner single-flight location with the lock-session limit stated; boot-time crypto capture-switch ownership |

Gate C detail and the exact prior-verdict carry are in `Claude Comms and Packages/Langston Design Asks/B_UNIVERSE_REFRESH_ACTS_GATE_C_CODEX_HANDOVER.md`.
