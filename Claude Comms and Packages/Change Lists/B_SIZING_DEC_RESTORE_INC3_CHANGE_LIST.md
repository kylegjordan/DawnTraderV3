# B-SIZING-DEC-RESTORE — increment 3 change list (Step 4): the PAPER-RESET-3000 script (P1) and the paper size band (P4)

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (r8) · pre_audit — present (`B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §13.2 P1/P4, §16 design, **§16.4 your ruling**, **§16.5 as built, R1-R12 + the fresh-reader record**) · running_issues — present (**`#1100` new**, `#1043` evidence 3; `#1093`/`#1094`/`#1096` earlier) · deleted_log — N/A for inc 3 (nothing deleted; `_flattenOne`'s price code was EXTRACTED to `resolveFlattenPrice`, not removed) · completion_report — absent, Step 11 · batch_catalog / phase_history — absent, Step 10 · system_manual — absent, Step 10 (the band; the reset's run shape) · sim — absent, Step 10 (the new service, the new read-only route, the epoch writer, the close-seam hook) · phase_19_plan — unchanged |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §13.2 P1 + P4 (design), §16 (the run shape), §16.4 (your ruling at `66da5e666`) |

**Code commits:** `6f97cdc2c` (first cut) + the commit carrying this list (the fresh-reader round: `#1100`, the stop's flatten report, the script's gates) · CI stated in the dispatch · **tsc baseline:** 377 → 377 · **graded ref:** the commit carrying this list

## What increment 3 is
The two pieces Kyle's PAPER-RESET-3000 needs that 2a + 2b do not give: **P1**, the one-time reset (flatten every open paper position under a machine-readable label, re-anchor to $3,000, set the position % to 5, start the dashboard count at the reset, restart); and **P4**, the alert that keeps each trade near $140-150 as the balance moves. **Nothing trades differently until the window's deploy (≥ 2026-10-02T20:10Z, row 29); the reset runs once, after it, on Kyle's go.**

## P1 — the reset (your (a), (b) B1/B2, (d); A1)

### B1 — the label rides the STOP path (the close-all step is gone)
```ts
// routes.ts — POST /active-engine/stop
const reason = (req.body || {}).reason;
if (reason !== undefined && reason !== 'reset') return res.status(400).json({ error: 'reason must be "reset" or absent', received: reason });
const result = await stopActiveEngine(userId, reason === 'reset' ? 'reset' : 'manual_stop');   // was: stopActiveEngine(userId)

// active-engine-service.ts
export async function stopActiveEngine(userId: string, closeType: FlattenCloseType = 'manual_stop')
  ... await currentManager.forceCloseAllOpenPositionsOnStop(closeType);                    // was: ()

// active-portfolio-manager.ts
async forceCloseAllOpenPositionsOnStop(closeType: FlattenCloseType = 'manual_stop')
  ... const outcome = await this._flattenOne(position, closeType, closeType);               // was: (position, 'manual_stop')

// active-execution-engine.ts — forceClosePosition(..., provenance, closeType: FlattenCloseType)   ← REQUIRED, no default
const exitCondition: ExitCondition = {
  type: closeType,                                                                          // was: 'manual_stop'
  reason: closeType === 'reset' ? 'Paper reset (PAPER-RESET-3000): flattened by the engine stop' : 'Manual stop requested by user',
};
```
`closePosition` writes `closeReason: exitCondition.type` ⇒ **`close_reason = 'reset'`**. Registered where `manual_stop` is: the `ExitCondition` union, the i1 `CloseReason` union + `logForceClose(…, closeReason)`, the `ENGINE_STOP` map, `isForceClose` / `isManualClose`, `closedManually`, and a "Paper Reset" filter in Closed Trades. **Every other stop is byte-for-byte unchanged** (default `'manual_stop'`, same label `manual_stop_<source>`, same reason text — the control tests below pin all three).

### B2 — one price resolver; the pre-check is a separate READ-ONLY route
`resolveFlattenPrice(position)` is `_flattenOne`'s old inline resolution, extracted unchanged (quote of any source but `no_reliable_price` → best bid of the depth snapshot → `null`). `_flattenOne` calls it; so does `flattenPrecheck()`, served at **`GET /active-engine/flatten-precheck`** → `{ ok, positions:[{positionId, symbol, state, closable, hasObservedPrice, source}], allClosable, count }` (`hasObservedPrice` is `null` for a pending maker, which needs no price — `#1100` below). The route has no path to a close.

### The script — `server/scripts/paper-reset-3000.ts`
Order and gates (stops at the FIRST failure, no retry; **every refusal and every crash prints the step AND the state it leaves** — engine stopped? anchor written? % set? epoch set? restarted?):
| step | does | refuses when |
|---|---|---|
| 0 | preconditions: the window's three migrations in the `db:migrate` ledger (`_migrations`); 2b's floor CHECK reads `>= 1` and 3's band rows at the global key (three finite values, low < high) AT THE OBJECTS; the engine running | any absent; **A1: any paper anchor note carrying `PAPER-RESET-3000`**; any open `closed_trades` row with no position (the stop would book it) |
| 1 | `GET flatten-precheck` | any position not `closable` (an OPEN one with no observed price; a PENDING maker is closable — it is dropped) |
| 2 | `POST stop {reason:'reset'}` | the request fails in transit (outcome NOT assumed); the engine still reports running; **the stop's own flatten report is not clean** (no flatten ran, it threw, `failedCount` > 0, anything left open, anything deleted by the orphan cleanup); anything still open; any open `closed_trades` row left; **any close since the stop began whose reason is not `reset` / `never_filled` / a natural exit** (`manual_stop` = the label did not plumb; `engine_stop_cleanup` = the reconciler booked it) |
| 3 | `executeReanchor` 3,000, `measurement_override`, note citing PAPER-RESET-3000, the prior balance and version, the run id | the engine is running again (somebody started it); version ≠ before + 1 |
| 4 | `PUT guardrails-v2?mode=paper {maxPositionPercentPct: 5}` (policy + coherency) | non-200; **the APP reads back anything but 5** (your D) or derives anything but 20 slots |
| 5 | prints the prior epoch row, then `storage.setScoreboardEpoch(stopReturnedAt, runId)` — **the epoch is the moment the stop RETURNED** | read-back differs |
| 6 | `POST start {mode:'continue'}` (never `'new'`: it hard-resets the tables) | the engine is ALREADY running (a start somebody else made); non-success; not running after |
| 7 | read-back **from the app**: `GET portfolio-summary` (starting balance, `cashBalance`, `sessionStart`), plus the anchor, the `'reset'` closes, the pre-run rows, the band verdict at the app's balance | starting balance ≠ 3,000.00; **the app's session began before our start** (its balance would add pre-reset P&L); anchor moved; pre-run rows changed; `'reset'` count moved; band verdict ≠ `in` |

**Auth:** `DT_API_TOKEN` from the environment — the server-held crew login (`B-CREDENTIALS-PRIVATE-REPO` OBJ-1), never in the file, never printed. **The reset's guardrail write signs as the crew login's user, not Kyle's** (your D, stated in the header).

### `storage.setScoreboardEpoch(startedAt, updatedBy)` — the epoch's ONE named writer
```ts
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)
VALUES ('scoreboard','*','*','*','*','epoch_started_at', to_jsonb(${iso}::text), now(), ${updatedBy})
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
-- then SELECT (value #>> '{}')::timestamptz, updated_by … and return it; refuses an invalid date or a blank updatedBy
```

### `#1100` — the stop no longer sells a resting maker buy that never filled (found by a fresh reader; folded here, the reset is a stop)
```ts
// active-portfolio-manager.ts — _flattenOne, first thing
if (position.state === 'pending') {
  const dropped = await this.executionEngine.dropPendingMakerOnFlatten(position.id);
  if (!dropped.success) return { status: 'failed', reason: `pending maker not dropped: ${dropped.error}` };
  ... re-read: still there ⇒ 'failed'
  return { status: 'closed', reason: 'pending maker never filled — dropped as never_filled' };
}

// active-execution-engine.ts — the deadline drop's body, EXTRACTED unchanged into ONE method both paths call
private async _dropUnfilledMaker(position, why) { updateClosedTrade(tradeId, { closedAt, closeReason: 'never_filled' }); deleteActiveOpenPosition(id); log MAKER_NEVER_FILLED }
async dropPendingMakerOnFlatten(positionId) { re-read; state !== 'pending' ⇒ REFUSE (it filled — flatten it as a trade); else _dropUnfilledMaker(...) }
```
No xStock weekend wait on the stop's drop: that wait lets a shut book get its chance to fill before the DEADLINE drops the order; an order the operator cancels has no chance left to wait for. Reach: 0 pending of 7 open now; 97 `never_filled` all-time, 9 in 30 days.

### The stop now returns what its flatten did
`stopActiveEngine` builds a `StopFlattenReport` — `{ran, threw, closedCount, failedCount, skippedCount, leftOpen[], orphansDeleted[], reconcile}` — from the values it already logged, and `POST /active-engine/stop` returns it as `flatten` (plus `idempotent`). **Before this, a close that failed was deleted by the orphan cleanup, booked by the reconciler as `engine_stop_cleanup`, and the caller saw a plain success.** Additive: no existing caller reads the body beyond `success`/`message`.

## P4 — the band (your C1, C2)
`server/services/paper-size-band.ts`: `size = getPortfolioBalanceV2('paper') × e/100 × p/100 × buffer` (normal-posture, quant-pool, pre-covariance) against `paper_size_band` low 140 / high 150; outside ⇒ ONE `addAlert` (`reminder`, `warning`), **dedupe `paper-size-band:<anchorVersion>:<low|high>`**, naming `p* = target / (B·e/100·buffer) · 100`. `target` (145) feeds only `p*`. **Fail-hard at BOOT** (`server/index.ts`, after the RTB cadence check; the b72 warm-up — which runs first, `index.ts:282` — now includes `paper_size_band`, and already included `active_sizing`); **fire-and-forget** on the paper close seam (beside the daily-loss hook) and once at engine start. An unreadable input logs and raises nothing.
**Migration** `2026-09-29-b-sizing-inc3-paper-size-band.sql` (+ rollback in git, not in MANIFEST): the 3 rows, `ON CONFLICT DO NOTHING`, then a count check. ⚠️ **Rolling it back while inc 3's code is deployed makes the app refuse to boot — roll the code back first** (both headers say so).

## Evidence
- **Scratch DB on the staging cluster** (`module_constants` schema + the live scoreboard row): forward → 140/150/145 · forward again IDENTICAL · a hand-tuned row survives a re-run · **the count check FIRES on 2 rows** · rollback → 0, scoreboard untouched · forward again IDENTICAL · the epoch writer's SQL → 1 row, JSON string, read back exactly. Files run = blobs `7fcf14ea` / `ae8deea4` = the committed blobs.
- **Live DB, read-only:** `close_reason` `varchar(50)`, no CHECK (the only two CHECKs are `phase`, `trade_mode`); the scoreboard row keyed `'*'`×4; buffer 0.97; `getPortfolioBalanceV2` reads the DB each call (no cache) — so the separate process's re-anchor is what the app sizes from.
- **Tests:** `unit/b-sizing-inc3-reset-and-band` 23 (incl. §5: the `#1100` drop, with an OPEN-position control and the refuse-if-filled case; mutation-proved) (band verdict incl. tripwire A $39.97 and the typo $1,455; the alert's key per version and direction; fail-hard; the label through stop → flatten → exit condition with `manual_stop` CONTROLS; the pre-check vs the flatten on one resolver). **Mutation-proved:** routing the stop flatten back to `'manual_stop'` fails exactly the label test. `integration/b-sizing-inc3-db` 5 (the 3 rows after `db:migrate`; the writer in place; its refusals). 13 related files: 189 pass, 18 DB legs skipped locally (they run on CI Postgres).

## §16.5 — the corrections to the run shape you ruled on (one is to a number you cited), and the fresh-reader round
- **R1 — PREVIOUSLY STATED:** step 8 "`closed_trades` row count = before + N (nothing deleted)" — and your B1 cited "Step 8's `before + N`". **NOW:** the count of paper rows **opened before the run began** is the same at step 0 and step 7. **REASON:** a row is written at OPEN (`createClosedTrade`, `active-execution-engine.ts:5484`) and UPDATED at close (`updateClosedTrade`, `:3953`); a close adds none. **Your B1 does not rest on it** (the race argument is `ENGINE_STOPPING`).
- **R2** — the pre-check's N vs the number of `'reset'` closes is **reported, not refused**: the engine runs between step 1 and the stop.
- ~~**R3** — the balance is asserted while stopped~~ **WITHDRAWN by R8:** it could not fail — the script's process has no engine session, so the reader returned the anchor step 3 had just written. The balance is now read from the APP after the start.
- **R4** — the prior epoch row is printed before it is overwritten (its `updated_by` is the only DB record of why the last epoch began).
- **R5-R12** — the fresh-reader round, in the tables above: `#1100`; the stop's flatten report; stale-row and close-reason refusals; the app's balance, slots and band rows; the epoch at the stop's RETURN; the engine re-checked between steps; every exit names its state. Full text: PRE_AUDIT §16.5.
- **CI on `6f97cdc2c`: one red test, and it was right** — the batch's own legacy-deletion fence caught the script naming the retired open-slots column in its 2a precondition. 2a is now checked through the migration ledger; 2b and 3 still at their objects.

## Judgement calls — attack these
1. **`#1100` is folded here, not its own batch** (§9.4 disposition 1): it changes the stop path for EVERY stop, not only the reset. The alternative is a hotfix ahead of this window — but nothing deploys before 10-02 20:10Z anyway.
2. **The stop's drop skips the xStock weekend wait.** Right, or should a weekend stop leave a pending xStock maker for the deadline path (i.e. refuse the reset on a weekend)?
3. **A1 is a `LIKE '%PAPER-RESET-3000%'` on any paper anchor note**, not "the next version carries it" — broader. Right?
4. **Step 2's allowed close reasons** are the live population's natural exits plus `reset`/`never_filled`/`guardrail`. A natural exit in the instant before the stop takes hold is legitimate; anything else refuses and leaves the engine stopped. Too strict, or too loose?
5. **The script still reads the DB directly** for the preconditions, A1 and the counts, and calls `executeReanchor` / `setScoreboardEpoch` in-process (neither writer has a route; adding one is the affordance (a) rejected). Everything the APP computes (status, pre-check, flatten, p, slots, balance) is now read from the app.
6. **The corrected script has had no second fresh round** — the loop's cap outcome; you are the next reader. The round record is in PRE_AUDIT §16.5.
7. **The close-seam hook fires on EVERY paper close** (2 DB reads in band; +1 anchor read + 1 alert write out of band). Acceptable, or throttle?

## r3 — your Step-4 conditions (2026-09-29 16:00Z, graded `8aac2207e`) — each landed; full table PRE_AUDIT §16.6

**C1 — the band alert's p\* no longer freezes.** `paper-size-band.ts`:
```ts
// was: dedupe_key: `paper-size-band:${anchorVersion}:${r.status}`
dedupe_key: bandDedupeKey(anchorVersion, r.status, r.pStar, band),
export function bandDedupeKey(anchorVersion, status, pStar, band) {
  const ratio = band.high / band.low;                       // the band's own width (150/140 ≈ 1.071) — no new constant
  const bucket = Number.isFinite(pStar) && pStar > 0 && ratio > 1 ? Math.floor(Math.log(pStar) / Math.log(ratio)) : 'x';
  return `paper-size-band:${anchorVersion}:${status}:p${bucket}`;
}
// body now opens: `As at ${at.toISOString()}, balance $${balance.toFixed(2)}: …` + a line that a newer alert supersedes a stale one
```
Your example: $3,100 ⇒ p\* 4.82 (bucket 22), $4,000 ⇒ 3.74 (bucket 19) — a fresh alert; $3,093 ⇒ 4.83 stays in bucket 22 (no storm). ⚠️ An older bucket's row stays active until resolved; its body names its instant, so it reads as stale rather than current. Tests: the two balances key differently; the small move keys the same; a wider band gives coarser buckets; the body stamp.

**C2 — the kill switch.** Step 0 REFUSES if `killSwitchTripped` (read from the app, `GET /guardrails-v2`); step 7 asserts it clear; a `guardrail` close at step 2 stays allowed and is logged as a loud WARNING.

**Nit — taken.** Step 7 asserts the live band monitor's own `[PaperSizeBand][IN] trigger=engine_start` line, read from `out.log` + `error.log` from their byte offsets just before the start (PM2 sends the UNREADABLE line to `error.log`), waiting up to 60 s; the hand-assembled formula stays beside it as a cross-check. Pattern proved on sample lines (IN and UNREADABLE start lines match with the PM2 prefix; a `trigger=close` line does not). No line ⇒ a read-back mismatch (fails safe).

**Your 1 — blast radius stated** on `#1100`, PRE_AUDIT §16.6 and here: close-all and the kill-switch flatten take the same pending branch; a "close all" with a resting maker now drops it as `never_filled`. Carried to the completion report and the System Manual row.
**Your 2 — `#1103` `B-MAKER-CANCEL-ON-DROP`, owner CC-C, `SPRINT_TO_LIVE_PLAN` row 183a** (after row 183, with row 176 `#296`) — the active plan; `PHASE_19_PLAN` is history since 2026-09-28.
**Withdrawn 403 — the invariant stated:** every staging user is `owner` (your `owner | 3`), the crew login moves to `editor` — both pass `requireEditor`.
**CI identity — taken:** the covering green run is `36592873124` on `b48cffeed`; `8aac2207e...b48cffeed` touches no runtime path. This round's run is stated in the dispatch.
**Board:** card created — `PVTI_lAHODmulEM4BfQP4zg9eoOI`, Implementation · Analyst · Batch · Blocked on Nothing · Phase 19 · `#698 #1093 #1100 #1103`. `Review` is yours to set.

## r4 — your re-grade (16:28Z, APPROVED at `dd420ebe1`) — the condition before RUN, landed
The step-7 log read now lives in `server/scripts/lib/app-log-reader.ts`: it reads the TAIL when more than its 8 MiB cap was written (your 13.1-22.1 MB/min measurement), follows a copy-then-truncate rotation into the newest `out__<date>.log` from the old offset, and reports `bytesSinceOffset` / `capped` / `rotated` / `rotatedFrom` / `error` in the READ-BACK and in the miss message. Tests (unit §6, real temp files): small write; more than the cap with the line at the end; a rotation; an unreadable file — a head read fails exactly the cap test, dropping the sibling read fails exactly the rotation test. Your within-bucket residual (~7.14%, ≈ $135-155) is recorded in PRE_AUDIT §16.7.
