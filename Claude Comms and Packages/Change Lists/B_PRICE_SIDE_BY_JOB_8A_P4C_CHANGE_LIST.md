# B-PRICE-SIDE-BY-JOB row `8a-P4c` — CHANGE LIST (increment 1: the VTS xStock decision-quote instrument)

**GRADED REF:** `origin/migration/aws-supabase` **`6ddc55290`** (code commit `da65fda23`; `6ddc55290` adds governance only). **CI:** run `35739891082` on the temporary branch `migration/ci-cc-c-8a-p4c-inc1` at `6ddc55290`.

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `architecture` (scope header `B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md:3`; the plan's own header line 3) |
| **ii** | **THE CLASS'S DOC SET** | **scope** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md` (approved r2 `e9a6b7f68`) · **pre-audit** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` (r3 `9c64e9a2d`) · **completion report** — the batch is OPEN, so the progress report `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` holds the record; converts at close · **BATCH_CATALOG / PHASE_HISTORY / SYSTEM_MANUAL / SIM** — present and current to `8a-P4b` (Step 10 `d929c42b7`); **this increment's own entries are owed at its Step 10** (the SIM gains the instrument as a component; the System Manual is judged — telemetry, no decision) |
| **iii** | **STEP 2** | `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` — approved for increment 1 by Langston 2026-09-22T14:03:44Z, conditions folded at r3 `9c64e9a2d` before any code; Step-3 rider (day-1 reachability) folded at `da65fda23` |

## WHAT CHANGED — and what did NOT
⛔ **No decision moves.** Every xStock VTS decision, real lane and shadow lane, still reads `last`; the P5 fence pins it. No epoch change. No migration. No DB write.

| file | change |
|---|---|
| `server/asset_classes/xstock_spot/transactable-sides.ts` | **NEW** — `xstockTransactableSides`, moved verbatim from the paper engine (P2). |
| `server/services/active-execution-engine.ts` | the definition removed; imported from the shared module. The two call sites (`_offSides`, `_gSides`) unchanged. |
| `server/asset_classes/xstock_spot/time-of-day.ts` | `getXstockSession` — the four New York sessions (P3). |
| `server/asset_classes/xstock_spot/vts-xs-instrument.ts` | **NEW** — the pure look classifier and the per-lane aggregator (P3, P4). |
| `server/services/vts-runner.ts` | both xStock queries carry `bid, ask, captured_at` undefaulted; a look recorded per xStock trade per pass in both lanes, pending rests separately; per-pass and hourly lines; the stale shadow comment (P1, P4, P4b, P4c). |
| `server/tests/unit/b-price-side-8a-p4b-paper-xstock.test.ts` | the P2 fence **re-pointed** (CONDITION-3). |
| `server/tests/unit/b-price-side-8a-p4c-instrument.test.ts` | **NEW** — 18 tests. |

### The shared predicate (P2) — MOVED, not changed
```ts
// transactable-sides.ts (NEW) — identical body to the one removed from active-execution-engine.ts
export function xstockTransactableSides(
  raw: { bid: number | null; ask: number | null } | null | undefined,
): { bid: number; ask: number } | null {
  if (!raw || raw.bid === null || raw.ask === null) return null;
  if (!(raw.bid > 0) || !(raw.ask >= raw.bid)) return null; // also rejects NaN
  return { bid: raw.bid, ask: raw.ask };
}
```
**The fence, re-pointed — its subject kept ("paper calls the ONE shared predicate at exactly these two sites"):**
```ts
// BEFORE
expect(count(/xstockTransactableSides\(/g)).toBe(3); // the definition + the two sites, nothing else
// AFTER
expect(count(/xstockTransactableSides\(/g)).toBe(2); // the two sites, nothing else — no second definition in the engine
expect(count(/function xstockTransactableSides/g)).toBe(0);
expect(count(/import \{ xstockTransactableSides \} from '\.\.\/asset_classes\/xstock_spot\/transactable-sides\.js';/g)).toBe(1);
expect((SIDES.match(/export function xstockTransactableSides\(/g) ?? []).length).toBe(1);
```

### The classifier (P3) — the union binds, strict "older than" and "wider than"
```ts
const ageMs = row.atMs !== null && Number.isFinite(row.atMs) ? Math.max(0, nowMs - row.atMs) : null;
const ageUnknown = ageMs === null;
const sides = xstockTransactableSides({ bid: row.bid, ask: row.ask });
const sideUnusable = sides === null;
const spread = sides !== null ? (sides.ask - sides.bid) / ((sides.ask + sides.bid) / 2) : null; // same form as crypto, level-basis.ts:237
const wide = spread !== null && spread > XS_VTS_SPREAD_CEILING;           // 0.01115 — 2 × D_p10 0.507% × 1.1
const ageOver = XS_VTS_AGE_CANDIDATES_MS.map((c) => ageUnknown || (ageMs as number) > c); // {15,30,60,120,300} s
const refusedAt = ageOver.map((over) => over || sideUnusable || wide);    // CONDITION-2: the UNION
const bidFiresStop = sides !== null && stop !== null && Number.isFinite(stop) && sides.bid <= stop && row.last > stop;
const lastFiresTarget = sides !== null && target !== null && Number.isFinite(target) && row.last >= target && sides.bid < target;
```
`row === null` (no row within the lane's 5-minute window) ⇒ `noRow`, refused and over at every candidate.

### The pass session — with a `weekend` label
```ts
beginPass(nowMs: number): void {
  const h = Math.floor(nowMs / HOUR_MS);
  if (this.hour !== null && h !== this.hour) this.flushSymbols();   // hourly (session, symbol) roll-up
  this.hour = h;
  this.pass = emptyPass();
  this.passSession = isInXstockWeekendClose(new Date(nowMs)) ? 'weekend' : getXstockSession(nowMs);
}
```

### The runner (P1, P4, P4b) — columns and counting only
```ts
// real lane query (vts-runner.ts ~3140): + `(EXTRACT(EPOCH FROM captured_at) * 1000)::text AS at_ms`
rawQuote: { last: price, bid: parseQuoteNumber(r.bid), ask: parseQuoteNumber(r.ask), atMs: parseQuoteNumber(r.at_ms) },
// …the zero-defaulted `bid: parseFloat(r.bid) || 0` beside it is UNCHANGED (no xStock decision reads it; increment 2 replaces it)

// before the X7 block (real lane)
if (trade.assetClass === 'xstock_spot') {
  _xsVtsInstrument.recordLook(trade.symbol, xstockPriceMap.get(trade.symbol)?.rawQuote ?? null, Date.now(),
    trade.stopLoss ?? null, trade.takeProfit ?? null);
}
// pending pre-pass (real lane)
if (trade.assetClass === 'xstock_spot') {
  _xsVtsInstrument.recordPendingLook(xstockPriceMap.get(trade.symbol)?.rawQuote ?? null, _pLimit);
}
// shadow lane: the same columns, the same classifier under lane=shadow; beginPass/endPass bracket each lane's pass
```
**Line shapes:** `[8a-P4c][VTS_XS_TOUCH] lane= session= looks= noRow= ageUnknown= sideUnusable= wide= age=[7] spread=[6] ageOver=[5] refused=[5] bidFiresStop= lastFiresTarget= pending…` per pass; `[8a-P4c][VTS_XS_SYM] lane= hour= session= symbol= looks= noRow= ageUnknown= sideUnusable= wide= ageOver=[5] refused=[5]` per (session, symbol) per hour. Both on `console.warn`.

## TESTS AND CHECKS
- **18 new tests** (`b-price-side-8a-p4c-instrument.test.ts`): the four sessions across EDT and EST boundaries; every classifier arm (no row, fresh-tight, age strictness at exactly 30 s, age unknown, five side-unusable shapes, the 1.1% / 1.2% ceiling edge and a fresh-but-wide row refused, both divergence arms and their negatives, `parseQuoteNumber`); the aggregator's per-pass line, no line on an empty pass, the hourly roll-up keyed by session, the weekend label (Saturday 10:00 EDT, Friday 20:30 EDT, and Sunday 20:00 EDT reopening as `overnight`); the `console.warn` sink; **the P5 fence** (the three real-lane seams and the shadow trigger still read `last`; the instrument is only ever written — its verbs are exactly `beginPass`, `recordLook`, `recordPendingLook`, `endPass`; `rawQuote` is read in exactly three places, all instrument calls).
- **Mutations killed:** `> c` → `>= c` on the age ceiling (1 test red); dropping `wide` from the union (2 tests red).
- **tsc:** `scripts/check-tsc-baseline.mjs` — 377 = baseline 377.
- **Full local suite:** 10 failing files, which **also fail on the base with my changes stashed** (10 failed / 2 passed of the same 12, run in isolation) — local environment; plus two (`b79-0n-storage-sqe-asset-class-routing`, `sync-canonical-bridge`) that failed only under full-suite load and **pass alone with my changes** (35/35). CI is the gate.

## JUDGEMENT CALLS TO ATTACK
1. **The `weekend` label was added at implementation, not pre-registered.** It only EXCLUDES looks (the pre-registration's window is weekday sessions), but it is a change to how looks are bucketed after the rule was written. Is it within the pre-registration or does it need a §B4 line?
2. **Divergence counters use the STATIC stop/target** (`trade.stopLoss`, `trade.takeProfit`); a trailing or break-even ratchet is not modelled — the same stated limit as paper's X3 divergence log. Descriptive only (rule D).
3. **`ageUnknown` counts as over every ceiling (refused).** `captured_at` is NOT NULL in the table, so this should be zero; a non-zero reading would be an instrument fault, not a quote property.
4. **Two fields for one thing, for one increment:** the real lane's zero-defaulted `bid`/`ask` stay beside `rawQuote` until increment 2 (X0) replaces them — no decision reads either for xStock.
5. **The hourly roll-up is in memory:** a restart loses the partial hour (stated in the plan); per-pass lines are unaffected.
