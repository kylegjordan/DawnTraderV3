# B-REST-SIDES-TO-CACHE — increment 1 — CHANGE LIST (Step 4)

**Graded ref:** `origin/migration/aws-supabase` @ `c7f90c2fd` (code), change list committed after it.

## DISPATCH HEADER

**(i) Declared change-class:** `architecture` (scope header, unchanged at r5).

**(ii) The architecture doc set, row by row** (`scripts/governance-checker/config.mjs` `CLASS_DOCSET.architecture`):
| doc | status |
|---|---|
| scope | **present:** `Claude Comms and Packages/Scope Files/B_REST_SIDES_TO_CACHE_SCOPE.md` (r4 + r5 §8, approved) |
| pre_audit | **present:** `Claude Comms and Packages/Scope Files/B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` (Step 2 approved, §6) |
| completion_report | **absent:** Step 11 (one report for both increments) |
| batch_catalog | **absent:** Step 10 |
| phase_history | **absent:** Step 10 |
| system_manual | **absent:** Step 10. Owed: §9's *"tier 0 … manually verified"* is false for the two rows fixed here |
| sim | **absent:** Step 10. Owed: the price-cache entry (`:388`, stale size, and the new `sidesWriter` field and write-key line), and a first entry for the static map + resolver |
| changes_and_fixes (conditional) | **applicable, absent:** Step 10 |
| running_issues (conditional) | **present:** `#1056` amendments 1-4 |
| roadmap (conditional) | **judged N/A:** no roadmap item moves; placement lives in `PHASE_19_PLAN` |
| deleted_log (conditional) | **present:** `DELETED_COMPONENTS_LOG.md`, entry 2026-09-26 (six dead rows) |
| phase_19_plan (conditional) | **present:** rows `3n.l`, `3n.l-a`, `3n.l-b` |
| adjustment_framework (conditional) | **judged N/A:** no constant, fee, epoch or booking rule changes. The one behaviour change (GBP/USD, and ETC/USD when polled, get fresh REST sides) is named in §3 and in the completion report |

**(iii) Step-2 reference:** `Claude Comms and Packages/Scope Files/B_REST_SIDES_TO_CACHE_PRE_AUDIT.md`, approved with four conditions (§6), all folded before the build.

---

## 1. FILES

| file | change |
|---|---|
| `server/markets/kraken-symbol-map.ts` | OBJ-8: `GBP/USD` → `ZGBPZUSD`, `ETC/USD` → `XETCZUSD`; the `krakenRestPair` docblock (C7); OBJ-11: six rows removed |
| `server/services/price-cache.ts` | OBJ-10: `sidesWriter` on `CachedPrice`, set at all five write sites; P3: the write-key ledger at the three REST sites |
| `server/services/market-data/rest-write-keys.ts` | **NEW**, pure: `buildWriteKeyLedger`, `formatWriteKeyLedger`, `WriteKeyAccumulator` |
| `server/tests/unit/b-rest-sides-to-cache-inc1.test.ts` | **NEW**, 9 tests |
| `1-system-manual/DELETED_COMPONENTS_LOG.md` + `_archive/deleted-code/kraken-symbol-map.dead-rows-2026-09-26.ts.removed` | OBJ-11 record |

## 2. THE LOAD-BEARING HUNKS

**The map row (OBJ-8):**
```ts
// BEFORE
  { internalSymbol: "GBP/USD", krakenRestPair: "GBPUSD", krakenWsPair: "GBP/USD", baseAsset: "GBP", quoteAsset: "USD" },
// AFTER
  { internalSymbol: "GBP/USD", krakenRestPair: "ZGBPZUSD", krakenWsPair: "GBP/USD", baseAsset: "GBP", quoteAsset: "USD" },
```
(ETC/USD: `ETCUSD` → `XETCZUSD`, same form.) `mapByCompact` keys on the internal symbol (`kraken-symbol-resolver.ts:34`), so `GBPUSD` still resolves; test 1 pins it.

**The writer name, WS (only with a stated side) and adapter REST (carried):**
```ts
      venueObservedAtMs: (bid !== null || ask !== null) ? venueObservedAtMs : (existing?.venueObservedAtMs ?? null),
      // `3n.l` OBJ-10: moves with the sides it names, never on a tick that stated none.
      sidesWriter: (bid !== null || ask !== null) ? 'ws' : (existing?.sidesWriter ?? null),
...
      venueObservedAtMs: existing?.venueObservedAtMs ?? null,
      // `3n.l` OBJ-10: this writer carries the sides forward, so it carries their writer forward too.
      sidesWriter: existing?.sidesWriter ?? null,
```
The three REST constructions add `sidesWriter: 'rest_poller' | 'rest_fetch' | 'rest_batch'` beside their existing `sidesCapturedAtMs: Date.now()`.

**The ledger at `refreshBucket` (one line per pass):**
```ts
            writes.push({ responseKey: pair, writtenKeys: requestedSymbol && requestedSymbol !== normalizedSymbol ? [normalizedSymbol, requestedSymbol] : [normalizedSymbol] });
...
    this.logWriteKeys(buildWriteKeyLedger('refreshBucket', symbols, writes, sym => this.toKrakenSymbol(sym)),
      `bucket=${bucket.type} sidesWriter=${this.sidesWriterCensus(symbols)}`);
```
`getPrice` and `getBatch` build the same ledger per call and add it to their own `WriteKeyAccumulator`; `logHealthLine` (60 s) prints one line per site and resets it.

**The ledger's rule (`rest-write-keys.ts`):** a written key that is requested is WRITTEN (and `viaPrimary` when its response key is not its own request form); any other written key is a PHANTOM; a requested symbol with no write under its own key is MISSING. Identity: requested = written ∪ missing, disjoint.

**Example line after the fix** (test 7's shape): `[3n.l][WRITE_KEYS] site=refreshBucket bucket=openTrade sidesWriter=ws:0,rest_poller:1,rest_fetch:0,rest_batch:0,none:1 requested=2 written=1 phantom=1[…] missing=1[BTC/CAD] viaPrimary=[GBP/USD<-ZGBPZUSD]`

## 3. BEHAVIOUR CHANGE, STATED

- **GBP/USD** (in `openTrade`, `readyToBuy`, `vtsSimulation` today) gets fresh REST sides on every pass of each bucket it is in. The paper exit trigger's ticker rung and the VTS exit trigger can now decide during a WS silence where they refused before. **FINDING-3 applies from this deploy:** a REST write replaces WS sides with a receipt-stamped snapshot (pre-audit §2.4, measured at V4).
- **ETC/USD:** the same, when polled (not polled today, pre-audit §2.1).
- ⛔ **THE FRESHNESS CLOCK FLIPS FOR GBP/USD (Step-4 condition C3, Langston).** `touch-price.ts:177` ages the ticker rung by `venueObservedAtMs ?? sidesCapturedAtMs`, and `:183` labels it `venue` or `receipt`. The poller writes `venueObservedAtMs: null` and re-stamps `sidesCapturedAtMs` on every pass. **So from this deploy GBP/USD's ticker rung runs on OUR receipt clock instead of the venue's, and it can no longer age out during a venue silence: the refusal that produced `5bfb2af5` will not recur for it.** Every other REST-polled symbol has always been on the receipt clock. ⛔ **FROM HERE ON, A SILENT EXIT-TRIGGER RAIL IS NOT EVIDENCE THAT EXIT PRICES ARE FRESH** (`#661` leg 3): for a polled symbol the 2,000 ms gate measures our polling, not the venue. The systemic question is homed on row `3n.p` (`#1056` amendment 5). Kyle's 2026-09-03 ruling (one freshness standard round the clock) is not violated by the diff, but what the standard measures for polled symbols is now written down.
- **The volume path: no change** (pre-audit §0 N-1b; C1 withdrawn).
- **The six dead pairs:** `toKrakenRest` returns `null` with its warn, instead of a pair Kraken rejects. No persisted rows exist (pre-audit §2.5).
- **Log volume:** one `[3n.l][WRITE_KEYS]` line per bucket pass (`openTrade` every ~2 s is ~43k lines a day in `out.log`), plus at most two site lines per minute.

## 4. EVIDENCE AT THE REF

- `b-rest-sides-to-cache-inc1.test.ts`: **9/9**.
- **Mutations, 9/9 killed:** M1 GBP row back to the altname (fails 3: the positive control) · M2 `refreshBucket` stops naming its writer · M3 the ledger never finds a phantom · M4 the WS writer names itself on a sideless tick · M5 the adapter REST writer drops the name · M6 the MATIC row restored · M7 the accumulator never resets · M8 `getBatch`'s ledger never recorded · M9 `viaPrimary` inverted.
- **18 related test files, 240 tests** (every unit test touching the price cache, symbol resolution, the volume cache, the live-pricing adapter, the crypto touch or touch-price): green.
- `node scripts/check-tsc-baseline.mjs`: **377 = 377**.
- CI: per job, on the pushed head (reported with the dispatch).

## 5. JUDGEMENT CALLS TO ATTACK

1. **The `refreshBucket` line every pass** (43k lines a day on the 2 s bucket). The alternative is to print only when phantom or missing is non-empty, but then V1's PRESENCE assertion (GBP/USD in WRITTEN) has no line to read on a clean pass. I kept every pass.
2. **`requested` for `refreshBucket` is the whole bucket.** A chunk whose fetch throws shows its symbols as MISSING, which is true (they got no write), but it mixes "Kraken omitted it" with "the request failed". The existing `Batch fetch error` warn names the second.
3. **`sidesWriter` is set on a phantom row too** (the three REST constructions stamp before the key is chosen). A phantom row then carries `rest_*`, which is accurate about who wrote it.

---

## 6. STEP-4 RULING (Langston, 2026-09-26 21:13Z): APPROVED WITH FOUR CONDITIONS — how each was met (code at the next commit)
| # | condition | done |
|---|---|---|
| **C1** | the ledger was lost on the error path at `getPrice` and `getBatch` | both `add` calls moved into `finally`; a failed fetch now shows its symbols as MISSING. Test 10; mutation M10 (getPrice) and M8 (getBatch) killed |
| **C2** | the accumulated line mixed per-call sums with interval sets | the set fields are renamed `phantomDistinct` / `missingDistinct`, and the class docblock states which fields are sums and which are sets. Mutation M11 killed |
| **C3** | the clockBasis flip was missing from §3 | stated in §3 above; the systemic half homed on `3n.p`; recorded in the completion report at Step 11 |
| **C4** | test 2's fence held 18 of 44 | the fixture is now ALL 44 pairs whose primary differs from the altname (Kraken `AssetPairs`, 2026-09-26) |
**Nits:** test 1's title now says the cache still requests by `toKrakenSymbol`; the pre-existing mis-indented lines in `getBatch`'s literal are re-indented; `sidesWriterCensus` is private.
**Evidence after the fixes:** 10/10 tests; **11/11 mutations killed**; 18 related files, 241 tests; `check-tsc-baseline` 377 = 377. CI: per job, on the pushed head.
**Judgement calls:** #1 approved and measured by Langston (out.log ~54.7 GB/day; the ledger adds ~0.02% of bytes); #2 accepted, with the correction that only `refreshBucket` behaves that way; #3 accepted.
