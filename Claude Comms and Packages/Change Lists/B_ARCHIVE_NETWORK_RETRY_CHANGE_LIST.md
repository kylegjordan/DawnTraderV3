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
- **Honest bound (Langston):** the drain has no deadline (`#1034` leg 3), so under a slow drain inside PM2's 10 s `kill_timeout` the page can still be killed; it has never fired, so no silence from it is evidence yet. For `xstock_spot` the count is raw buffer rows, which can exceed distinct minutes lost.

## Not yet done (later steps)
CI (Step 5) · deploy (Step 6, after 21:00Z or next window) · Step 7: deployed classifier over the A3 population; flushes on all eight pairs in a window where each normally flushes (#661 leg 2) · Step 10: the runtime-state registry entry for both latches, BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES, the J3 proposal to PM.
