# B-KRAKEN-PRIMARY-KEY-RESOLUTION — row 14a Step 4

CHANGE-CLASS: non_architecture

| Document | Step 4 status |
|---|---|
| Scope | Present in `Scope Files/B_KRAKEN_PRIMARY_KEY_RESOLUTION_SCOPE.md`. Step 1 PROCEED at `e814538d423570b36f42df366726c294b96ff458`. |
| Pre-audit | Present in `Scope Files/B_KRAKEN_PRIMARY_KEY_RESOLUTION_PRE_AUDIT.md`. Step 2 PROCEED at 22:44:27Z on 2026-11-25, exact `c0e7c06d1de23b0c702c750d400fd26ddcaaec6e`. |
| Change List | Present here. |
| Completion report | Absent. Prepared after verification and governance. |
| Batch Catalog | Batch entry due in Step 10. |
| Phase History | Batch entry due in Step 10. |
| System Manual | Applicable. Document the diagnostic read and limits without changing trading rules. |
| System Impact Map | Applicable. Update the S27 producer and reader census and record the new diagnostics. |
| Changes and Fixes | Applicable. Record #1146 follow-up and the V6 instrument. |
| Running Issues | Applicable. Record what #1146 and #1076 evidence can discharge after verification. |
| Post-Audit Roadmap | N/A. This increment occupies existing Sprint to Live Plan row 14a. |
| Deleted Components Log | N/A. No component deletion in this increment. |
| Adjustment Framework | N/A. No threshold or governed setting change. |
| Phase 19 Plan | N/A. Row 14a is carried by the Sprint to Live Plan. |
| Sprint to Live Plan | Existing approved row 14a. Update after verification. |
| Shared, Analyst and reviewer memory | Analyst Step 4 position recorded in `9d3881e37`. Shared and reviewer governance entries are due at close. |
| Session task lists | Existing CC-C row 14a. Other sessions' lists are N/A. |
| Observation | N/A. Step 2 approved the point-in-time staging verification in Pre-Audit P3. |

**Step 2 reference** — `Claude Comms and Packages/Scope Files/B_KRAKEN_PRIMARY_KEY_RESOLUTION_PRE_AUDIT.md` at `c0e7c06d1de23b0c702c750d400fd26ddcaaec6e`. Compare the scoped patch from shared base `e62c8788f2ec4295dff30e26de5efdd15b6950f9`. Implementation Step 3 was pushed at `9f03895422387e3e0e73e05a42695535ae62b394`.

**#1076 locked modules** — `server/services/price-cache.ts` directive 8.8.4-A4.R10R-4 and `server/services/vts-runner.ts` directive 11.0E.1. These edits attach measurements to existing paths. Price, size, routing, writes and selection keep their existing policies.

## Load-bearing changes

**MODIFIED — actual cache keys and local receipt order.** The old REST-response loop built a row for each key, set that exact row and returned it to its caller:

```ts
for (const key of keys) {
  const row = this.restTickerRow(key, internal, ticker, writer, now);
  this.cache.set(key, row);
  onRow?.(key, row);
}
```

The two REST setters now feed the committed assignment and the same key's incumbent to `storeRow`. Carries contribute neither a new assignment nor an overwrite. Receipt order counts include pre-readiness qualifying REST-over-WS assignments. The per-symbol coverage is separately bounded by Kraken mapping readiness.

```ts
const incumbent = assignment === 'stated' && row.lastSource === 'kraken_rest' ? this.cache.get(key) : undefined;
if (assignment !== 'none') krakenPriceSourceDiagnostics.startIfReady();
this.cache.set(key, row);
if (assignment === 'none') return;
krakenPriceSourceDiagnostics.recordAssignment(key, row, assignment === 'stated', canonicalHint);
if (assignment === 'malformed') return;
const previousStamp = incumbent?.sidesCapturedAtMs;
const currentStamp = row.sidesCapturedAtMs;
if (!row.sidesWriter?.startsWith('rest_') ||
    (incumbent?.sidesWriter !== 'ws_ticker' && incumbent?.sidesWriter !== 'ws_book') ||
    previousStamp == null || currentStamp == null ||
    !Number.isFinite(previousStamp) || !Number.isFinite(currentStamp)) return;
```

**NEW — covered provenance.** The covered boundary copies the aggregate baseline and classifies the actual cache keys against Kraken's exact maps. The evidence keeps separate counts for inherited and newly stated sides. A new venue map publication checks the frozen keys even when no quote is touched. An attributable identity change or lost assignment excludes the affected symbol. An unattributable gap invalidates a cohort grade. Cache clear preserves these records for the lifetime. The scope is writers of stated sides to the shared cache. A direct adapter assignment also needs its actual response key tied to the current and frozen pair. The existing response parsing, price write and selection are preserved. An inherited adapter pair has no retained response key and leaves a coverage gap.

**MODIFIED — paired quote outcomes.** The existing recorder previously wrote its two outcomes directly to the old aggregate. It now holds those same two outcomes and adds the actual lookup key at each of the seven production hooks. When the shared selector returns a normalized key, the proof uses that key.

```ts
const bookOutcome: FunnelOutcome = sel.ok && sel.bookRefusal === null
  ? { ok: true, acceptedSource: `${sel.quote.basis}:${sel.quote.producer}`, ..._age }
  : { ok: false, reason: sel.bookRefusal ?? 'no_book' };
recordLevelBasisOutcome({ ...base, rung: 'book' }, bookOutcome);
// Existing ladder outcome derivation.
recordLevelBasisOutcome({ ...base, rung: 'ladder' }, ladderOutcome);
krakenPriceSourceDiagnostics.recordWalkOutcomes(base, symbol, bookOutcome, ladderOutcome);
```

**MODIFIED — one synchronous diagnostic capture.** The old response property was `levelBasisFunnel: getLevelBasisFunnel()`. The same authenticated Filter Diagnostics handler captures the aggregate and optional evidence at that property, before any remaining await:

```ts
...captureLevelBasisDiagnostics(_req.query.includePriceSourceBySymbol === '1'
  ? priceCache.getRestReceiptOrdering()
  : undefined),
```

The old aggregate and periodic JSONL keep their shapes. A grade needs the same process identity, complete coverage, reconciliation by rung and source, and a positive count of ladder attempts on symbols with positive `rest_adapter` assignments and no competing inherited or new writer. Missing or incomplete evidence yields no grade.

## Local controls and staging order

- The focused controls cover both write paths, the seven production identity call sites, a two-symbol paired-rung fixture, an inherited WS alias through a mark-only carry and later REST acceptance, attributed and unattributed losses, source-label imbalance with attempts unchanged, capture across an await, and legacy serializer parity. The production-hook check is a source fence. Each synthetic outcome is exercised through the same recorder.
- The first isolated CI run 45717130164 found one failed test among 6,223 Test Suite cases. P-7k's source fence still named the old five-argument REST builder call. The fence now requires the one six-argument call and its original print and mark assertions are intact.
- A temporary `<` to `<=` mutation changed both equal-stamp setters from zero strict inversions to one. The fixture failed and the mutation was reverted. The TypeScript baseline gate matched all 314 existing error signatures.
- Staging remains off this branch. The protected 8c Phase A slot, OLD readback, permitted Phase B, dated xStock reads and approved KD-121 placement retain the recorded order. The Kraken staging verification is the approved point-in-time read.

REVIEWER: claim-only · Which read and writes prove adapter-only history on a stable Kraken symbol? · Unobserved map remap, raw rather than effective lookup keys in three paths, malformed REST assignment hidden at the cache boundary · re-derived y.

The local fixture uses an away-and-back real mapper refresh without intervening quote activity, an actual selector lookup of the unrelated suffix-derived key, and an invalid REST pair committed and replaced before the next read. The current instrument exposes permanent coverage gaps on each applicable surface.

## Step 4 revision 2

Coltrane sent back `6596b3139775c66d71496bf8c172ad9bf10d6207` at 23:09:32 UTC on November 25. His focused review passed 86 of 86 cases and reproduced legacy JSON and JSONL parity as well as the route-level interleaving control. The revision addresses his two blockers.

1. Mapping publication retains every declared or indexed claimant to an ambiguous name. It records a permanent gap for each attributable covered symbol, at startup and on a live refresh. In the real mapper fixture, BTC keeps primary key `XXBTZUSD` while ETH briefly claims the same name as its REST alias. There are no intervening quote actions. After the map returns to normal both symbols show the gap. Mutation retaining just the frozen claimant fails.
2. The unlisted-row evidence inspection catches a coercion failure so it can record a coverage gap and skip the offending row. A real `getBatch` fixture supplies a malformed unlisted row first and one valid ETH/USD quote second. The one listed row is returned and cached. Reverting to an unguarded inspection drops the valid sibling and fails the fixture.

## Step 4 revision 3

Coltrane sent back `02b5fe8831a65dc85ff57e97d5377b4338bad06e` at 23:19:38 UTC on November 25. He independently confirmed both revision 2 fixes, with their mutation controls, and raised two new publication cases. His review passed 97 of 99 focused cases on that ref.

1. The candidate names at startup and refresh include every key in the five real lookup indexes, in addition to the canonical declarations and any already frozen keys. A real metadata replay leaves one previously unknown spelling in the REST index for BTC and the WS index for ETH while the canonical entries declare other names. Detection covers both symbols when this happens during a refresh or at startup. An index-only key for an older raw pair cannot qualify an assignment to the current canonical pair.
2. A frozen key must still resolve in the actual indexes. A real metadata replay keeps `XBT/USD` on the BTC canonical declaration while the actual WS index loses it for one refresh. The identity gap persists after the lookup returns. An unchanged-map control starts with exactly two covered symbols and no gaps. On the reviewed revision before this fix, all three new publication tests failed.

## Step 4 revision 4

Coltrane sent back `f529fe34cbd2f3b0dc4c03bd63f2d7bcb7b1bba7` at 23:28:34 UTC on November 25 after all 111 focused checks passed. His direct REST adapter replay exposed a missing grade control: the actual response key could point at an older pair while the normalized cache symbol still identified the current pair.

The direct adapter now forwards the first response key to the diagnostic on a stated-sided write. The evidence credits the write only when the actual response key resolves to the same pair in both the frozen and current mappings. It records a gap otherwise, including when an inherited adapter pair lacks the response identity. This is a qualification of the approved cohort measurement. It does not reject or delay the existing price writes or selections.

The regression uses the real adapter, cache, Kraken mapping and ladder with two distinct BTC quotes. Both cache writes and both ladder accepts occur. Only the response for the current frozen pair earns assignment credit. The previous code credited both writes and produced no gap. The inherited-pair control records missing provenance without adding credit. Seven focused test files passed 85 of 85 cases.

**Question for Coltrane** — does the direct adapter response identity now qualify the cohort evidence without changing the quote writes, selection or default output?

## Step 4 ruling

Coltrane ruled PROCEED to Step 5 at exact `fa48f737b7ffd50ed99b27decddad898fe109e3f` on November 25 at 23:37:40 UTC. The real adapter wrote both BTC quotes, and the ladder accepted both. Only the current pair earned assignment credit. Removing that qualification credited both. A separate replay moved an already frozen alias to the older pair and failed when only the current-map check was removed. The inherited adapter row without response identity recorded a gap. His review passed all 114 focused checks, including default JSON and JSONL parity and the capture across the handler await. The TypeScript gate matched the 314 baseline signatures.

The delivery card is CI + Deploy with External as the blocker. The review write was rejected with HTTP 404 from Coltrane's GitHub session. His exact ruling above is the review record. The approved code advances through shared CI while staging remains behind 8c Phase A, OLD's readback and Phase B.

## Shared change-class ruling

On November 26 at 00:15:50 UTC, Coltrane confirmed `non_architecture` at shared `2dbc2b568f5747dd347155f8bfbc844b72ed9af5` for alert `359913cf-4d47-40cf-b59a-42efad21f5e6`. The checker matched the signal orchestrator, one of 16 paths touched by that commit. Its two changes pass existing symbols to the recorder after selection. The active-execution and VTS changes do the same. The cache commits before assignment credit, and the new readout is opt-in. The class ruling is filed in `GOVERNANCE_EXCEPTIONS.md`.

Step 10 will update the System Manual with the local receipt-clock and same-process limits and the System Impact Map with the diagnostic state and S27 producer and reader census. Carry all other applicable rows into the close ledger, including the Observation N/A above. The governing staging order remains Phase A, OLD readback, then Phase B before Kraken.
