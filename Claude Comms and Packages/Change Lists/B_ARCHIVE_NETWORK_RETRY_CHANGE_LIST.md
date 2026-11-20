# B-ARCHIVE-NETWORK-RETRY — change list for Step 4 (Langston)

**Graded ref:** `7021fd944` on `origin/migration/aws-supabase` (code commit; the Step-2 fold is `4fc820dc1`).

## Dispatch header
- **(i) change-class:** `non_architecture` (scope header, verbatim).
- **(ii) the class's document set:** SCOPE present (`Scope Files/B_ARCHIVE_NETWORK_RETRY_SCOPE.md`, r2) · PRE_AUDIT present (`Scope Files/B_ARCHIVE_NETWORK_RETRY_PRE_AUDIT.md`, r2) · COMPLETION_REPORT, BATCH_CATALOG and PHASE_HISTORY at Step 10/11 (not yet) · SYSTEM_IMPACT_MAP: §2.6b written in THIS commit (the routing rule must precede the deploy, C-B); the runtime-state registry entry comes at Step 10 · SYSTEM_MANUAL judged N/A (A8) · CHANGES_AND_FIXES / RUNNING_ISSUES judged at Step 10 (`#705` already updated here).
- **(iii) Step 2:** `Scope Files/B_ARCHIVE_NETWORK_RETRY_PRE_AUDIT.md`, approved by Langston at `2cc29f8e6`.

## Files
| file | change |
|---|---|
| `server/services/passive-archive/ohlc-batch-writer.ts` | the classifier (P1), the shed alert (P3), the two wire-ups, docblocks (P5) |
| `server/services/passive-archive/ticker-batch-writer.ts` | imports + the two wire-ups |
| `server/tests/unit/b-archive-network-retry.test.ts` | NEW — 22 tests (P2, P4, and C-1's three) |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | §2.6b: three bullets (network family, the shed-alert ROUTING RULE, cover and memory) |
| `1-system-manual/RUNNING_ISSUES.md` | `#705`: the routing rule line (C-B) |
| `1-system-manual/SPRINT_TO_LIVE_PLAN.md` | §0a CC-A item 3 → Step 4 |

## The load-bearing hunks (at `7021fd944`)

**P1 — the classifier** (`ohlc-batch-writer.ts:119-162`):
```ts
export const TRANSIENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT',
]);
function errorCodes(err: unknown): string[] {   // err.code + each AggregateError.errors[].code
  ...
}
export function isTransientWriteError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (m.includes('statement timeout') || m.includes('canceling statement')) return false;   // unchanged, first
  if (errorCodes(err).some((c) => TRANSIENT_NETWORK_CODES.has(c))) return true;            // NEW (:146)
  return m.includes('deadlock')
    ...existing arms unchanged...
    || m.includes('econnrefused')    // NEW
    || m.includes('ehostunreach')    // NEW
    || m.includes('enetunreach')     // NEW
    || m.includes('eai_again');      // NEW (:162) — and no `getaddrinfo` arm
}
```
BEFORE: message-only; unknown → permanent; `econnrefused` absent. The docblock now carries the network family, `ENOTFOUND` kept permanent and why there is no `getaddrinfo` arm, the AggregateError reason (latent, C-A), and judgement call A's rider (`ECONNRESET`/`ETIMEDOUT` can be mid-statement; carrier `#1032`).

**P3 — the shed alert** (`ohlc-batch-writer.ts:389-438`), the shape of `alertPermanentWriteFailure`:
```ts
export const SHED_REFETCHABLE = { 'ohlc:crypto_perp': true, 'ohlc:xstock_perp': true, 'ohlc:crypto_spot': false,
  'ticker:crypto_spot': false, 'ticker:crypto_perp': false, 'ticker:xstock_spot': false, 'ticker:xstock_perp': false };
const _shedAlerted: Record<string, number> = {};
export function clearShedAlertLatch(writer, assetClass) { delete _shedAlerted[`${writer}:${assetClass}`]; }
export async function alertWriterShed(writer, assetClass, shed, bufferLen) {
  const _latchKey = `${writer}:${assetClass}`;
  const _last = _shedAlerted[_latchKey];
  if (_last != null && Date.now() - _last < ALERT_RE_ARM_MS) return;
  _shedAlerted[_latchKey] = Date.now();                    // claim before the raise
  ...addAlert({ category: 'breakage', severity: 'critical', title, body /* refetchable sentence, RESOLVE never acknowledge,
                points at the SIM writer entry for cover */, metadata: { assetClass, writer, shed, bufferLen, cap, refetchable, source, issue: '#705' },
                dedupe_key: `${writer}-writer-shed-${assetClass}` })
  // catch: delete _shedAlerted[_latchKey] (release) + stderr
}
```
**Wire-ups:**
- bar shed branch `ohlc-batch-writer.ts:832` → `void alertWriterShed('ohlc', assetClass, shed, buf.length);` (only reached by the three non-`xstock_spot` classes; `xstock_spot` keeps its fail-stop branch above it);
- bar success `:775` → `clearShedAlertLatch('ohlc', assetClass);` beside `clearPermanentAlertLatch`;
- ticker shed `ticker-batch-writer.ts:185` → `void alertWriterShed('ticker', …)`;
- ticker success `:150` → `clearShedAlertLatch('ticker', …)`.

## Tests and mutations
- `npx vitest run` on the new file + `f-g-1-writer-retry-fence.test.ts`: **36 / 36** (19 new + 17 existing).
- The new fixtures use the REAL shapes: the 2026-11-16 line `connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432`, the 2026-11-04 controls `canceling statement due to statement timeout` and `Query read timeout`, and Node's own AggregateError shape (empty message, `code`, two inner errors).
- **Mutations, run one at a time against the new file, restored after each — 11 of 11 KILLED:**

| # | mutation | killed by |
|---|---|---|
| M1 | `econnrefused` arm removed | the real-line test, both RETAIN tests, the bar shed test |
| M2 | `ehostunreach` arm removed | the per-code text test |
| M3 | the code test removed | aggregate, inner-errors, ECONNRESET/ETIMEDOUT aggregate, every-code tests |
| M4 | a `getaddrinfo` arm ADDED (C4) | ENOTFOUND stays PERMANENT |
| M5 | `ENOTFOUND` added to the code set | ENOTFOUND stays PERMANENT |
| M6 | shed latch check removed | a PERSISTING shed raises only once |
| M7 | ticker clear-on-success removed | the ticker clear test |
| M8 | bar clear-on-success removed | the bar clear test |
| M9 | release-on-failed-raise removed | a raise that FAILS releases the latch |
| M10 | bar shed call removed | the bar writer raises the shed alert |
| M11 | ticker shed call removed | the ticker writer raises the shed alert |
- **tsc:** `node scripts/check-tsc-baseline.mjs` → 324 = baseline, no regression.

## Judgement calls for you
- **J-1** The shed alert's latch is a SEPARATE map from `_permanentAlerted`, so a class can carry one permanent row and one shed row at once. Proposed: right — two different faults, two keys.
- **J-2** `refetchable` is a static map, not derived from the archiver set. A new shedding class therefore reads `false` (the safe side: "gone for good"), and the map test pins the seven. Proposed: fine.
- **J-3** The ticker writer still splices-then-unshifts (`#1032`); with refused connections now retained, a ban that begins mid-flush re-inserts committed chunks. Stated in the scope and the docblock, carried by `#1032`. Not changed here.

## C-1 — the shutdown residue page (Langston Step 4, Discord `1571896060148973739`; predicate re-gated `1571904974428831926`)
- **Why:** refused connections are now RETAINED, and retained rows die with the process, so a deploy or restart inside an outage lost them with only a stderr line.
- **Code:** `alertShutdownResidue(markMs, tickerResidue)` in `ohlc-batch-writer.ts`, AWAITED in `drainArchiveBuffersForShutdown` after both final flushes and BEFORE `recordXstockWriterHandoff`; key `archive-writer-shutdown-residue`, breakage/critical, resolve-only. `getTickerResidueBefore(markMs)` in the ticker writer.
- **The predicate (re-gate):** count only rows received AT OR BEFORE a mark taken just before the final flushes (bars `arrivedAt`, ticker `capturedAt`), with a ≤ 1 ms spin so a late row cannot share the mark's millisecond. The crypto and futures feeds keep running through the ~2 s drain, so "any non-empty buffer" would page every clean deploy with a false cause and then hide real residue under the one key. The late arrivals are a separate loss, recorded on `#705`.
- **Fence:** the outage drain with the xStock handoff mocked to throw pages `{ohlc:crypto_spot:2, ticker:crypto_perp:1}` the moment the drain settles; a slow (150 ms) fake alert store makes `await` vs `void` observable; a CONTROL pushes a bar and a ticker row from inside the final flush of a clean drain and asserts no page.
- **Mutations M12-M17, all KILLED:** call removed · `total === 0` early return removed · `await` → `void` (SURVIVED until the store was made slow) · the mark ignored for bars · for tickers · the spin removed.
- **Tests now:** this file 22, F-G-1 17 (its ticker mock gains `getTickerResidueBefore`); 39/39 over three runs; nine other writer files 143/143; tsc 324 = baseline.
- **Re-gate 2 (Langston, Discord `1571909717662507159`), folded:** (a) the ticker writer now TRACKS its flushes (`trackedTickerFlush`, a Set) and `stopTickerWriter` waits out any flush already running before its final flush — a flush awaiting the database at shutdown had its rows spliced out of every buffer, so the page could not see them, worst exactly when inserts are slow; concurrency is unchanged, no coalescing added. (b) The alert body now states what the code measures: rows held in the buffers after the final flushes and any running flush finished. (c) A deterministic fence on `<=` (a row stamped AT the mark counts, one at mark+1 does not, both writers, via `vi.setSystemTime`); the live-intake CONTROL's comment now says it kills 'spin removed' only probabilistically. Mutations M18 (in-flight wait removed), M19/M20 (`<=` → `<`, bars/tickers) KILLED; M12/M15 re-run KILLED. 41/41 over three runs; nine other writer files 143/143; tsc = baseline. Recorded, no work (Langston): `Date.now()` is not monotonic, so a backward clock step can end the spin early, and `<=` is the right trade; one global key means a second restart inside an unresolved window mints nothing and the row keeps the first restart's total.
- **Honest bound (Langston):** the drain has no deadline (`#1034` leg 3), so under a slow drain inside PM2's 10 s `kill_timeout` the page can still be killed; it has never fired, so no silence from it is evidence yet. For `xstock_spot` the count is raw buffer rows, which can exceed distinct minutes lost.

## Not yet done (later steps)
CI (Step 5) · deploy (Step 6, after 21:00Z or next window) · Step 7: deployed classifier over the A3 population; flushes on all eight pairs in a window where each normally flushes (#661 leg 2) · Step 10: the runtime-state registry entry for both latches, BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES, the J3 proposal to PM.

## Step 6 + Step 7 — deployed and verified (2026-11-20, CC-A)
- **Deploy:** `dt-deploy ecbdf882eec9ecf1e85904139b11b364eda230fa --by cc-a --in-window B-ENTRY-GATE,B-PRICE-SIDE-BY-JOB,B-XSTOCK-BID-TRIGGER-RELAND,B-PRICE-FEED-COVERAGE,B-RTB-PROMOTION-RETRY-STORM,B-TOKEN-WATCH-BIRTH-CAP,B-TOKEN-WATCH-FOLLOWUP-MEMORY` → `OK — live, engine resumed, identity asserted`, deployed_at 00:03:49Z, pid 3975655. Combined with B-DB-POOL-GUARD r4 T-P1 (one restart). Langston cleared the content at `529a2aeb1` (Discord `1573119929895620760`, three conditions): the deployed head adds nothing under `server/ drizzle/ scripts/ package*.json .github client/ shared/` against `529a2aeb1` (0 files); CI run `44640384871` 4/4 per job at `ecbdf882e` (three earlier heads' runs were cancelled by newer pushes, never counted); all seven open windows named; the restart hour (11-20 00Z) told to NEW Claude for B-ENTRY-GATE (Discord `1573126919355105351`).
- **OBJ-4 leg 1, the deployed build:** `dist/BUILD_SHA` = repo HEAD = `ecbdf882e`.
- **OBJ-4 leg 2, the classifier AT THE DEPLOYED SOURCE over the real population:** `isTransientWriteError` + `errorCodes` + `TRANSIENT_NETWORK_CODES` extracted from the deployed `ohlc-batch-writer.ts` (45 lines, file sha256 `aa09175de8b9e44c…`) and run with tsx over every `PERMANENT flush failure` line in the error stream on disk (`error__*` + `error.log`, content 2026-11-06 → 11-20): **3,036 lines = the A3 count; 864 bars + 2,172 ticker `connect ECONNREFUSED <addr>:5432`, every one TRANSIENT both as message text and with `code` set.** ⚠️ **The A3 7-line control set (11-04) has rotated out of the 14-file reach**, so the control was the same shapes as constructed errors: `canceling statement due to statement timeout`, `Query read timeout`, `getaddrinfo ENOTFOUND <host>` (code `ENOTFOUND`) and an unknown message → **all PERMANENT**. (Importing the writer module was avoided: it opens a database connection, which T-P1 would now page as `(unnamed)`.)
- **OBJ-4 leg 3, flushes resume on all eight pairs:** `out.log` from 00:03:49Z to 00:06:14Z (2.4 min, Friday 00Z, inside the xStock 24/5 window so every pair normally flushes): bars crypto_perp 13 · crypto_spot 29 · xstock_perp 3 · xstock_spot 29; ticker crypto_perp 27 · crypto_spot 29 · xstock_perp 29 · xstock_spot 29 — first flush 4 to 21 s after the restart. `PERMANENT flush failure` lines since the restart: **0** (instrument proved: the same pattern returns the 3,036 above). No writer shed or residue alert since the restart.
- **Unexercised, stated:** an actual outage (retain-then-recover) was not induced; that leg rests on the unit tests and mutations at Step 3/4. No UI surface (a shed alert renders on the System Alerts page only if one fires).

## Step 8 — Langston PROCEED (2026-11-20 00:20:57Z, Discord `1573130990572929165`)
- All three deploy conditions confirmed at the refs: no runtime path added or modified `529a2aeb1..ecbdf882e`; run `44640384871` 4/4 at the exact sha, every earlier head in the range `cancelled` not `failed`; seven open windows, recomputed from `DEPLOY_WINDOWS.jsonl`.
- OBJ-4 re-derived: `BUILD_SHA`; the 3,036 from his own grep, all `ECONNREFUSED`; the extracted unit self-contained at `ohlc-batch-writer.ts:125-168`; the four constructed controls hit all four PERMANENT exits (a pure function, so a constructed input is the same object as a logged one); flush counts to the digit.
- **Carried (non-blocking):** (1) the "9 rows since 00:03Z" count was an instant — 12 by his read (three later registrations, none a page); a near-total on a live table carries its read time. (2) **Retain-then-recover is UNEXERCISED, sized honestly:** the `PERMANENT flush failure` zero covers ~11 minutes of `error.log` after the 00:00Z rotation and reaches neither the retry buffer, `RETRY_BUFFER_MAX` nor the shed alert (`#661` leg 3). The first real refusal is where that proof appears; tonight may not be cited for it. (3) No restart between 14:45Z and 20:30Z on 2026-11-20 (B-PRICE-FEED-COVERAGE pair).
