# B-BALANCE-SESSION-PAIRING — change list for the Step-4 diff review

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header).
- **(ii) Doc set for that class:** scope `Scope Files/B_BALANCE_SESSION_PAIRING_SCOPE.md` r3 — present (Langston PROCEED); pre-audit `Scope Files/B_BALANCE_SESSION_PAIRING_PRE_AUDIT.md` r3 — present (Langston PROCEED, stamped `549a1cd66`); completion report — absent (batch at Step 4); `BATCH_CATALOG` / `PHASE_HISTORY` / System Manual / System Impact Map — owed at Step 10 (pre-audit P9); `DELETED_COMPONENTS_LOG` — landed in this commit (P6).
- **(iii) Step 2:** the pre-audit above.

**r2 (2026-11-05 ~14:00Z):** the blocker fix landed at `e3bcb0364` (migration, schema sync, drift fence; CI `42030571303` 4/4 at `be7f85d0c`) and the two comment fixes after it; **Step-4 r2 is on the head that carries both**, named in the dispatch. The rows marked r2 below are those. 

**r3 (2026-11-05 ~17:00Z, after Langston's Step-4 PROCEED on `d4de1d733`):** condition (b) folded — `readClosedTradesHotRetentionDays` reads up to two rows and refuses when more than one matches (`MoneyHeldUnavailable`), with a test (mutation: the guard disabled fails it). (c) the `as any` cast on `blockReason` is DECLINED for this batch: removing it moves drift detection to tsc, which is worth having but touches a line B-ENTRY-GATE also edits inside the joint deploy; offered to `#618` as a follow-up. (a), (d), (e) are on the record as stated; (f) is owed at Step 7 (a `MONEY_HELD` figure, a stored `MONEY_HELD_UNAVAILABLE` audit row after `db:migrate`, and what pages if the refusal persists).

**Ref:** code `4b54a052bda5095c8d1a2dcfbc22d20e56540c7c` (one commit, `e05ce6666` before rebase). Line numbers below are at it. **Built off the branch head, not `0abfd710`** (your Step-2 note).

| file | change |
|---|---|
| `server/services/guardrail-settings.ts` | NEW `MoneyHeldUnavailable` (`:149`), `readClosedTradesHotRetentionDays` (`:158`), `getMoneyHeld` (`:184`; the formula at `:207`); the builder's `portfolioValue` from it, null on a refusal (`:265`, `:287`) |
| `server/services/portfolio-anchor-service.ts` | NEW `getAnchorEventByVersion` (`:131`) |
| `server/storage.ts` | NEW `getStraddleEntryCostAt` (`:3318`) + interface line |
| `server/asset_classes/xstock_spot/active-dispatch.ts` | read hoisted above the literal, refuses by name (`:226`) |
| `server/services/signal-orchestrator.ts` | money held, refusal caught by name; the `<= 0` test replaced (`:2111-2115`) |
| `server/services/active-execution-engine.ts` | OPENED audit read with its own catch + null-safe write (`:6768`, `:6784`); dry-run diagnostic keeps null absent (`:5588`) |
| `server/services/trade-safety.ts` | position-size cap refuses instead of skipping (`:347`); exposure cap reads money held (`:625`); unreadable position refuses (`:662`); unsized candidate sized by the fixed-notional rule (`:677`); `MONEY_HELD_UNAVAILABLE` code |
| `server/services/rtb-metrics-service.ts` | `MONEY_HELD_UNAVAILABLE` in the reason union and both lists |
| `server/services/pre-execution-validator.ts` | passes its own estimate as the notional (`:135`) |
| `server/scripts/b8-5-measurement-override.ts`, `b8-5-tune3-anchor.ts` | DELETED (P6); archived; logged |
| `drizzle/migrations/2026-11-05-b-balance-session-pairing-block-reasons.sql` (+ `…-rollback.sql`, `MANIFEST.txt` +1 line) | **r2 (your Step-4 blocker):** `ALTER TYPE execution_block_reason ADD VALUE IF NOT EXISTS` for `ENGINE_STOPPING`, `CORRELATION_EXPOSURE`, `GUARDRAIL_READ_FAIL`, `MONEY_HELD_UNAVAILABLE` (precedent `b-pattern-enum-drift`). Rollback clears the ledger row only (Postgres cannot drop enum values). Dry-run on staging inside `BEGIN … ROLLBACK`: 14 values → 18 → back to 14. **The highest-blast-radius artifact in this diff: DDL on `execution_attempt_audit.block_reason`, additive, no row rewritten.** |
| `shared/schema.ts` | **r2:** `executionBlockReasonEnum` synced — `MAX_TOTAL_EXPOSURE` added (live and the initial `CREATE TYPE` hold it; the declaration had drifted), plus the four |
| `server/tests/unit/b-balance-session-pairing-block-reason-enum.test.ts` | **r2, NEW drift fence:** every `TradeSafetyResultCode` is declared; every declared value is storable (initial `CREATE TYPE`, or an `ADD VALUE` in a REGISTERED migration); the migration is registered and its rollback is not; exactly one writer passes `riskCheck.code`. Mutation: one value dropped from the migration fails it. **Limit, stated (your note): leg 2 proves the values are storable PER THE MIGRATION FILES — nothing in it proves the migration RAN on the target database; the deploy's `db:migrate` and the Step-7 positive control (`SELECT 'MONEY_HELD_UNAVAILABLE'::execution_block_reason`) are what show that.** |
| `server/services/trade-safety.ts:325-326`, `server/services/pre-execution-validator.ts:133-135` | **r2:** two stale comments rewritten to the shipped behaviour (the J7 skip is gone; the unsized candidate is sized, not refused) |
| tests | NEW `b-balance-session-pairing.test.ts` (28); `b-guardrail-fail-closed.test.ts` re-pointed + 3 behavioural cases; 8 more files' mocks re-pointed (P10) |

## P1 — `getMoneyHeld` (`guardrail-settings.ts:184-217`)
```ts
if (mode !== 'paper') throw new MoneyHeldUnavailable(`… live money held is the exchange balance (Phase 21) …`);
const state = await getAnchorState(mode);                                  // portfolio_state (balance, anchor_version)
const ev = await getAnchorEventByVersion(mode, state.anchorVersion);       // the ledger row that WROTE it
if (Math.abs(ev.newBalance - state.balance) > 0.005) throw …               // broken pair
const retentionDays = await readClosedTradesHotRetentionDays();            // data_lifecycle, no fallback
if (ageDays >= retentionDays) throw …
const straddle = await storage.getStraddleEntryCostAt(mode, ev.occurredAt);
if (straddle.invalidCount > 0 || !Number.isFinite(straddle.entryCost)) throw …
const { realizedPnl } = await storage.getRealizedPnlSince(mode, ev.occurredAt);
const moneyHeld = state.balance + straddle.entryCost + realizedPnl;        // :207
if (!Number.isFinite(moneyHeld) || moneyHeld <= 0) throw …
// any other throw is wrapped as MoneyHeldUnavailable(`read failed: …`)
```
`getStraddleEntryCostAt` (`storage.ts:3318`): `SUM(quantity * entry_price)`, `COUNT(*)`, and `COUNT(*) FILTER (WHERE quantity <= 0 OR entry_price <= 0)` over `closed_trades` where `mode = $mode`, `opened_at < $at`, `(closed_at IS NULL OR closed_at > $at)`, `close_reason IS DISTINCT FROM 'never_filled'`.

## P3 / C-1 — the audit row (`active-execution-engine.ts:6768-6784`)
BEFORE `const portfolioValue = await getPortfolioBalanceV2(this.mode);` … `portfolioValue: portfolioValue.toString(),`
AFTER
```ts
let portfolioValue: number | null;
try {
  portfolioValue = await getMoneyHeld(this.mode);
} catch (e) {
  if (!(e instanceof MoneyHeldUnavailable)) throw e;
  console.warn(`[B-BALANCE-SESSION-PAIRING][AUDIT_MONEY_HELD_NULL] ${signal.symbol}: ${e.reason}`);
  portfolioValue = null;
}
…
portfolioValue: portfolioValue === null ? null : portfolioValue.toString(),
```

## P3 / A2 — the position-size cap (`trade-safety.ts:343-352`)
BEFORE `if (!Number.isFinite(rawPortfolioValue) || rawPortfolioValue <= 0) { console.log('[J7][GUARDRAIL_SKIP] …'); return { ok: true }; }` with `parseFloat(settings.portfolioValue?.toString() || '0')`
AFTER: `null` stays NaN (no `|| '0'`), and the same test returns `{ ok: false, code: 'MONEY_HELD_UNAVAILABLE' }`.

## P4 — the exposure check (`trade-safety.ts:652-678`) — ⚠️ one deliberate deviation from the plan, for your ruling
- A position with an unreadable quantity or price now REFUSES (`GUARDRAIL_READ_FAIL`), as planned.
- **An unsized candidate is NOT refused (the plan said refuse).** At Step 3 I found the position-size cap above already handles an unsized candidate by sizing it with `bufferedTradeNotional` — **B-SIZING-DEC-RESTORE increment 2c's decided rule** (`trade-safety.ts:383-399`: *"an unsized candidate is checked at the size the sizer WOULD give it"*). A refusal in the exposure check would have contradicted that decision (§9.5(b-ii)) and made the two checks disagree about one candidate's size. So the exposure check now uses the same formula (`:677`); an unreadable `maxPositionPercent` refuses. I first built it as a refusal and reverted.
- Reachability, measured: the paper entry path always passes `preComputedNotional` (`active-execution-engine.ts`, the candidate before `checkGuardrailRisk`); an unsized candidate arrives only from the manual `/trading/validate` route (no UI or code caller; now passes its own estimate) and the legacy `TradingEngine` (live only, Phase-21-gated, the paper instance never started).

## Tests and mutation checks
- `b-balance-session-pairing.test.ts` (28): the formula ($820.00 − $211.49 = $608.51 today), realized and straddle both from the anchor event, the synthetic anchor/session split (OBJ-2's discriminator, plus a check that `getMoneyHeld` never reads the engine session), the v3/v4 shape, a straddler counted once; every refusal (live, no state, no ledger row, broken pair, retention age, missing/zero retention constant, invalid straddler, non-positive result, wrapped read error); the source fences P2, P3/C-1, P4, P5, P11, P12, and the straddle query's predicates.
- `b-guardrail-fail-closed.test.ts`: the balance fault moved onto `getMoneyHeld` (a raw error still gives `CHECK_THREW`); a named refusal gives `MONEY_HELD_UNAVAILABLE`; the code count 16 → 17; behavioural cases — the position-size cap refuses on a null money-held value, the exposure check refuses an open position with no price, and a control passes.
- **Mutations (each turns a test red, each restored byte-for-byte):** the J7 skip put back · the zero-price default put back · the straddle term dropped from the formula.
- Unit suite locally: 4,525 of 4,560 pass; 6 fail — 4 whole-tree walks that time out under the parallel run (all pass alone) and the scanner census reading a git-excluded local agent worktree.

## P11 — the census by value, as built
A per-file count of the whole-word token `portfolioValue` in non-test `server/` (17 files, 127 tokens; your 105 was counted differently), each classified with a reason; **a new occurrence changes its file's count and fails until classified.** Per-file rather than per-line so a line move does not churn the fence; a count change is exactly a new or removed site.

## Outside this batch — found at Step 3, for #734 (no change here)
`getActiveOpenPositions` ignores its `mode`, and three callers ask for `'live'` beside `'paper'`, so they read the same paper rows twice: `kraken-websocket-adapter.ts:3227` and `index.ts:1078` union symbol sets (harmless); `trailing-exit-controller.ts:674` re-writes the same row's `tradeMode` under a "live" log line. Nothing here touches paper or the VTS today; it matters at Phase 21. P5's fence pins the three. **Proposed disposition: an item on `#734` (live-mode go-live), not a new batch** (Kyle 2026-10-19).

## Judgement calls to attack
1. P4's deviation above (unsized candidate sized, not refused).
2. `getMoneyHeld` wraps every read error as a refusal: a transient DB error blocks sizing for that cycle. Fail-closed by design; is that the right trade?
3. The retention refusal compares calendar age with the constant; it fires ~335 days from now on today's anchor.
4. P11 by file and count rather than by line.

## Step 4 — the condition-(b) fold: PROCEED on `05cee280b` (Langston, Discord `1568243383816691775`, 2026-11-06)
He re-read `server/services/guardrail-settings.ts` at `05cee280b` and at the stamped head (byte-identical) and confirmed the test discriminates: the fixture's `limit(n)` honours `n`, so at the pre-fold `.limit(1)` the two-row case would fail.
- **Step 7 owes, beside condition (f):** the guard is FENCE-ONLY on today's data. Staging `module_constants` holds exactly ONE `data_lifecycle / closed_trades.hot_retention_days` row (365, set 2026-08-06), so `rows.length > 1` cannot be reached at deploy; **no live silence may be cited as proof it fires** (#661 leg 3). (The hazard is ordinary: 236 of that table's name pairs already have more than one row.)
- **Finding, not in this deploy:** the reader hand-rolls a two-column query instead of the canonical `getConstant()` (`module-constants-service.ts:179`, most-specific-wins, cached; `GLOBAL_KEY` exists for single global rows). Behaviour does not diverge today; the risk is two read paths for one constant. **Disposition: an item on `#618`, owner CC-C** (no new slot).
- **CI bar:** 4/4 per job at the sha that deploys, read before the deploy — a green at a descendant is not it.

## Step 7 — staging verification (2026-11-07 13:20:49Z through 2026-11-10 17:20:22Z)

**Object and boundary.** Joint deploy `e0e68dfdbd497033c8c6b22222949b13c9c3c4b1` restarted the app at `2026-11-07T13:20:49Z`. CI run `42376198522` is green at that exact SHA, per job: TypeScript Check, Test Suite, Build, Docker Build. The four pre-registered reads below use that restart as their lower bound. The database snapshot was taken at `2026-11-10T17:19:14Z`; the error-stream census reaches `17:20:22Z`.

### 1. The money-held figure — PASS

- The first post-deploy `MONEY_HELD` line was at `2026-11-07T13:21:54Z`: **$583.08 = $820.00 anchor + $0.00 across 0 straddlers - $236.92 realized across 591 qualifying closes**. The same-minute independent database read matched all four terms exactly. Open exposure was then $773.67, so the expected pause was real rather than inferred. This was captured contemporaneously in the CC-C transcript and the committed position record; it is not reconstructed from today's larger close population.
- Current positive re-read at `2026-11-10T17:19:14Z`: v5 still pairs `portfolio_state.balance = $820.00` to the `measurement_override` ledger event at `2026-10-06T15:52:57.373475Z`; 0 qualifying straddlers (0 invalid) add $0.00; 612 qualifying closes sum to -$244.95211415; therefore money held is **$575.04788585**. The process logged the rounded same result at `17:20:31Z`: anchor $820.00, 0 straddlers, 612 closes, realized -$244.95, money held $575.05.

### 2. The exposure pause and resumption — PASS

- The durable `execution_attempt_audit` population from the restart through the database snapshot contains **2,413 BLOCKED rows, all 2,413 named `MAX_TOTAL_EXPOSURE`, and 17 OPENED rows; no other decision/reason group exists in this population**. Blocks run from `2026-11-07T16:08:53.287076Z` through `2026-11-10T17:16:32.922449Z`; opens resume at `2026-11-09T15:06:16.597438Z` and continue through `2026-11-10T16:22:32.595499Z`.
- For each of the 17 resumed opens, exposure immediately before the open was below that row's money-held value, and exposure immediately after remained below it. The first was TSLA/USD: $542.69504497 before, $570.95145304 after, against $582.61 held. Across all 17, the smallest post-open headroom was $5.70404205 (TGT/USD); none crossed the cap. Current positive read: 16 open qualifying rows total $556.06348301 against $575.04788585 held.
- `BOOK_FULL` was an earlier independent gate, so the cap itself could not be observed until a count slot freed. Once candidates reached the cap, the durable audit population above shows the registered pause and the later resumption; the unanticipated count gate did not change the cap result.

### 3. First new entries' size ratio — PASS, with the estimate updated by the losses that accrued while waiting

- Live paper guardrails are `max_position_percent_pct = 5.00` and `max_total_exposure_pct = 100.00`; the sizing formula applies the 0.97 buffer. A pre-deploy $820 basis therefore represented $39.77 per normal entry.
- The 17 first post-pause opens carry money-held stamps from $575.05 to $583.98. Their opened notionals range **$27.79433032-$28.32317965** (mean $28.04888772), or **0.69887680-0.71217449 of the $39.77 pre-deploy basis** — approximately 1/1.43 to 1/1.40. The first row, TSLA/USD, is $28.25640807 against $582.61 held: ratio 0.71049555 versus the balance ratio 0.71050000.
- The pre-registration's “about 1/1.34” used the then-current approximately $608 money-held estimate. By the time a count slot freed, further realized losses had moved the actual basis to approximately $583, so the observed approximately 1/1.41 ratio is the same mechanism on the later truthful balance, not a contradictory sizing result. The quantity is sized at signal birth, while the OPENED audit's `portfolio_value` is a later post-insert re-read; therefore those two fields are not a registered cent-exact equality. This cell's discriminator is the ratio shift.

### 4. `MoneyHeldUnavailable` carriers — live zero established; refusal behaviour remains FENCE-ONLY

- **Database carrier:** 0 `execution_attempt_audit` rows with `block_reason = 'MONEY_HELD_UNAVAILABLE'` among the 2,430 post-restart audit rows (positive population: 2,413 named exposure blocks + 17 opens). The migration did run: `SELECT 'MONEY_HELD_UNAVAILABLE'::execution_block_reason` casts successfully on staging.
- **Error-stream carrier:** 0 `[GUARDRAIL_BLOCK] code:MONEY_HELD_UNAVAILABLE`, 0 `XSTOCK_DISPATCH_REFUSED`, 0 `SETTINGS_MONEY_HELD_NULL`, 0 `AUDIT_MONEY_HELD_NULL`, and 0 `[B6][SIZING_ERROR] money held unavailable` matches among **2,345,889 timestamped error-stream lines** from the restart through `2026-11-10T17:20:22Z`. As positive controls, the same four exact files contain **2,413** `[GUARDRAIL_BLOCK]` lines over that full fixed window and **671,869** `[3n.q7][XS_FRAME]` lines from `2026-11-09T01:35:01Z` through the cut. File reach was read from contents, not filenames: `error__2026-11-08` begins 2026-11-07, `error__2026-11-09` begins 2026-11-08, `error__2026-11-10` begins 2026-11-09, and `error.log` begins 2026-11-10.
- **RTB carrier:** the process-session API snapshot (`sessionStart = 2026-11-10T07:47:55.626Z`) has `MONEY_HELD_UNAVAILABLE = 0`, with `MAX_TOTAL_EXPOSURE = 192` as its same-session positive control; 206 attempts reconcile to 12 opened + 192 blocked + 2 open-stage failures.
- **Fence/build proof, not live reach:** the deployed bundle contains the exact `MONEY_HELD_UNAVAILABLE` constructor string. The three focused files pass **61/61 tests**, including typed throws, both blocking checks, the named RTB bucket, migration/enum storability, every producer's pre-context refusal, and the duplicate-retention-row case. Staging has exactly 1 matching retention row (`365`, updated 2026-08-06), while 239 other `(module_name, constant_name)` pairs currently have multiple rows; therefore that duplicate-row refusal cannot fire on today's target row and its test is the only honest behavioural proof. **The live zero is never cited as proof that the refusal arm works.**

### Step-4 condition (f): storage and paging answer

- Langston's condition asked for a stored `MONEY_HELD_UNAVAILABLE` audit row, while the pre-registered live criterion requires zero natural refusals. No natural row exists and no durable synthetic row was created. Coltrane's stricter verification pass required a bounded storage proof. At `2026-11-10T17:45:51Z`, a single staging transaction first confirmed 0 non-internal triggers, inserted probe id `b-balance-session-pairing-step8-probe-20261110` with `decision = BLOCKED` and `block_reason = MONEY_HELD_UNAVAILABLE`, returned that typed row, and counted 1 matching row inside the transaction. `ROLLBACK` then completed and a new statement counted 0 rows by either the probe id or its unique detail. This proves the live table stores the enum member without manufacturing durable production evidence.
- **What pages if it persists:** no dedicated system alert in tracked application code. The existing `sizing-guardrail-read-fail` page covers unreadable `maxPositionPercentPct` / `maxTotalExposurePct` only; both production sizing producers catch `MoneyHeldUnavailable` before that sizer, so this condition cannot trip that rail. Depending on timing, visibility is: always the refusal log; and, only if the producer read succeeds but a later guardrail read fails, the durable execution audit and active-trade log, in-memory RTB/B4/I1 counters, and the live pipeline broadcast. A continuously broken producer can leave every one of those downstream carriers empty. External log/starvation monitoring was not proved absent by this repo read. **Coltrane independently confirmed this reach analysis. Disposition: record the missing dedicated persistent-refusal rail on existing issue `#618`, owner Analyst; no new batch slot.**
- `REVIEWER: claim-only · what pages and where MONEY_HELD_UNAVAILABLE remains visible · HIT: no dedicated page, but “only three carriers” was too narrow and audit/RTB are not universal because both production producers can return earlier · re-derived yes`.

### UI verification

This batch has no dedicated configuration panel; its only staging-visible consequence is smaller notionals in Open/Closed Trades. Coltrane used the authenticated staging UI and confirmed that Open Trades rendered CDNS/USD and CRWD/USD normally and Closed Trades rendered SPG/USD and TGT/USD with `$28.30` and `$28.32` values. His two screenshots are retained on the review host as `b-balance-session-pairing-open-trades-2026-11-10.png` (SHA-256 `8ed792eeceb6cba3a76cc3eb6fdaa4eb0a667f5659b2502a3887a495f3d02ee5`) and `b-balance-session-pairing-closed-trades-2026-11-10.png` (SHA-256 `902b28d4a33a927a5b4c8c0e06de830dd3603f1ad0369079c6d4abe6c3c24739`). ANALYST Codex independently fetched and opened both exact files before recording this result.

### Step-8 reproduction map

Run SQL through staging's server-held `DATABASE_URL`, read-only, with the fixed restart lower bound `2026-11-07T13:20:49Z` and snapshot upper bound `2026-11-10T17:19:14.217935Z`:

```sql
-- First-log reconstruction: change the upper bound to 2026-11-07T13:21:54Z.
WITH p AS (
  SELECT pae.occurred_at anchor_at, ps.balance::numeric anchor
  FROM portfolio_state ps JOIN portfolio_anchor_events pae
    ON pae.mode=ps.mode AND pae.anchor_version=ps.anchor_version
  WHERE ps.mode='paper' AND ps.global_context_id='default'
), s AS (
  SELECT count(*) n, count(*) FILTER (WHERE ct.quantity<=0 OR ct.entry_price<=0) invalid,
         coalesce(sum(ct.quantity*ct.entry_price),0) cost
  FROM closed_trades ct,p WHERE ct.mode='paper' AND ct.opened_at<p.anchor_at
    AND (ct.closed_at IS NULL OR ct.closed_at>p.anchor_at)
    AND (ct.close_reason IS NULL OR ct.close_reason NOT IN ('never_filled','hard_reset'))
), r AS (
  SELECT count(*) n, coalesce(sum(coalesce(ct.reconstructed_net_pnl,ct.pnl)),0) pnl
  FROM closed_trades ct,p WHERE ct.mode='paper' AND ct.closed_at IS NOT NULL
    AND ct.closed_at>=p.anchor_at AND ct.closed_at<='2026-11-10T17:19:14.217935Z'
    AND (ct.close_reason IS NULL OR ct.close_reason NOT IN ('never_filled','hard_reset'))
)
SELECT p.anchor,s.n,s.invalid,s.cost,r.n,r.pnl,p.anchor+s.cost+r.pnl FROM p,s,r;

SELECT decision,coalesce(block_reason::text,'NULL'),count(*),min(created_at),max(created_at)
FROM execution_attempt_audit
WHERE created_at BETWEEN '2026-11-07T13:20:49Z' AND '2026-11-10T17:19:14.217935Z'
GROUP BY decision,block_reason ORDER BY decision,block_reason;

WITH o AS (
  SELECT a.created_at,a.symbol,a.trade_id,a.portfolio_value::numeric pv,
         ct.quantity::numeric*ct.entry_price::numeric actual
  FROM execution_attempt_audit a JOIN closed_trades ct ON ct.id=a.trade_id
  WHERE a.created_at BETWEEN '2026-11-07T13:20:49Z' AND '2026-11-10T17:19:14.217935Z'
    AND a.decision='OPENED'
)
SELECT count(*),min(created_at),max(created_at),min(actual),max(actual),avg(actual),
       min(actual/(820*0.0485)),max(actual/(820*0.0485)),min(pv/820),max(pv/820)
FROM o;

SELECT 'MONEY_HELD_UNAVAILABLE'::execution_block_reason;
SELECT count(*) FROM execution_attempt_audit
WHERE created_at BETWEEN '2026-11-07T13:20:49Z' AND '2026-11-10T17:19:14.217935Z'
  AND block_reason='MONEY_HELD_UNAVAILABLE';
SELECT count(*),string_agg(value::text,',' ORDER BY updated_at)
FROM module_constants
WHERE module_name='data_lifecycle' AND constant_name='closed_trades.hot_retention_days';
SELECT count(*) FROM (
  SELECT module_name,constant_name FROM module_constants
  GROUP BY module_name,constant_name HAVING count(*)>1
) duplicate_pairs;
```

For each resumed open, reconstruct exposure by treating `closed_trades` as an interval: sum `quantity * entry_price` for qualifying paper rows with `opened_at < audit.created_at` and `(closed_at IS NULL OR closed_at > audit.created_at)`; exclude the candidate for the pre-open value and include it for the post-open value. The document's 17-row claim is the minimum post-open `moneyHeld - exposure`, grouped by the OPENED audit row.

For the error-stream census, stream exactly `/var/log/dawntrader/error__2026-11-08_00-00-00.log`, `error__2026-11-09_00-00-00.log`, `error__2026-11-10_00-00-00.log`, and `error.log`; retain timestamp prefixes from `2026-11-07 13:20:49` through `2026-11-10 17:20:22`. Count the five literal needles named in §4 and `[3n.q7][XS_FRAME]` as the positive control. Read each file's first and last timestamp as the reach check.

Other commands:

```bash
sudo -n -u dtapi /usr/local/bin/dt-api GET /api/diagnostics/rtb-metrics
grep -R -n -m 1 -F '[B-BALANCE-SESSION-PAIRING][MONEY_HELD_UNAVAILABLE]' /home/deploy/dawntrader/dist /home/deploy/dawntrader/server
npx vitest run server/tests/unit/b-balance-session-pairing.test.ts server/tests/unit/b-balance-session-pairing-block-reason-enum.test.ts server/tests/unit/b-guardrail-fail-closed.test.ts
gh run view 42376198522 --json jobs,headSha,conclusion
```

The RTB counter is process-local and continues moving; its Step-8 discriminator is a current named `MONEY_HELD_UNAVAILABLE` zero with a current non-zero block reason in the same response, not byte-for-byte reproduction of the 17:19 snapshot.

### Step-8 independent verification — correction round

Coltrane read exact ref `709a713df7626543d716c3216ea48e017c5fdfb1` and independently reproduced the money-held formula, both fixed-cut close populations, all 2,413 exposure blocks, all 17 resumed opens and their exposure headroom, the sizing-ratio shift, the live enum cast, the 0/2,430 database refusal population, a current RTB zero with a non-zero control, the deployed refusal string, and the 61/61 focused tests. He confirmed the paging/carrier ruling and completed the UI check. His verification passes returned **CHANGES** for two evidence requirements: the error-stream row had named the broad `GUARDRAIL_BLOCK` needle instead of the target-specific combined needle and its two inclusive counts were short by two; and his stricter storage ruling required the transactionally rolled-back insert above. This revision discharges both without changing the fixed bounds or leaving a probe row.

### Step-8 final confirmation

Coltrane returned **CONFIRMED** at exact corrected ref `368b60401b5cb96a538e00de9a1ddd8142d502e6`. He independently repeated both corrected legs: the immutable four-file census reproduced all five target zeros and both positive controls, and a fresh uniquely identified storage row existed as `BLOCKED / MONEY_HELD_UNAVAILABLE` only inside his transaction, with 0 rows across both probe identities after rollback from a separate connection. Step 8 is clear; the deployed code and fixed evidence bounds did not change during the correction rounds.
