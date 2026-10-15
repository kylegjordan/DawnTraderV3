# B-PRICE-FEED-TRUTH increment I2 — CHANGE LIST (Step 4)

| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (batch scope header) |
| ii | **DOC SET FOR `architecture`** | SCOPE — present, `Claude Comms and Packages/Scope Files/B_PRICE_FEED_TRUTH_SCOPE.md` · PRE_AUDIT — present, `…/B_PRICE_FEED_TRUTH_PRE_AUDIT.md` (I2 r1 + r2 + the 13:42Z folds) · COMPLETION_REPORT — absent (batch close) · BATCH_CATALOG, PHASE_HISTORY — absent (Step 10) · SYSTEM_MANUAL — absent (Step 10: `:12385` collision count 9 → 16; the price-cache chapter `:5607` on venue-list filing and REST eligibility) · SYSTEM_IMPACT_MAP — absent (Step 10: `UnifiedPriceCache` → `krakenAssetPairsService` dependency; the RTB refresh's class split; the deleted `getPrice`) · DELETED_COMPONENTS_LOG — present (this commit) · RUNNING_ISSUES — `#1173`, `#1175` filed; `#1076`, `#1146`, `#1173` close at Step 10 · SPRINT_TO_LIVE_PLAN — Stage 1 / row 14a plan lines at close · CHANGES_AND_FIXES, ADJUSTMENT_FRAMEWORK, POST_AUDIT_ROADMAP — judged N/A (no tunable, no roadmap change) |
| iii | **STEP-2 REFERENCE** | `…/B_PRICE_FEED_TRUTH_PRE_AUDIT.md`, sections "INCREMENT I2", "I2 r2", "I2 Step 2 — r2 PROCEEDS" (Langston 13:42Z at `6619dcba2`) |

## The change, by plan item
**P1 — `#1076` headers (5 files):** `kraken.ts`, `kraken-symbol-resolver.ts`, `central-clock.ts`, `price-cache.ts`, `rtb-refresh-service.ts`:
```
- * 🔒 LOCKED MODULE — DO NOT MODIFY
- * Summary: This module is production-locked. Changes require a formal directive.
+ * 🔒 LOCKED MODULE — HANDLE WITH CARE
+ * Summary: This module is production-locked. Changes go through the eleven-step workflow, and the Step-4
+ *          change list names this header (`#1076`, Langston ruling (b) 2026-09-26).
```
⇒ **this change list names the header for `price-cache.ts`, `rtb-refresh-service.ts` (code changed) and the other three (header only).**

**P2 — `rtb-refresh-service.ts` (`#1173`):** `cryptoKeysAtIndex` collected from `signalBuckets.get('crypto_spot')` in the existing per-class loop; `cryptoSymbols` built by filtering `bucketSignals` against it (C3, never by splitting a key); ONLY those are `subscribe`d; `getBatch('readyToBuy', symbols, { restEligible: cryptoSymbols })` — the read list stays all-class.

**P2b — `price-cache.ts` `getBatch(bucketType, symbols, opts: { restEligible })`, REQUIRED:**
```ts
      if (isFresh) {
        result.set(symbol, cached);
      } else if (opts.restEligible.has(symbol)) {   // NEW: only an eligible stale symbol is fetched and re-injected
        missingSymbols.push(symbol);
        if (bucket && !bucket.symbols.has(symbol)) bucket.symbols.add(symbol);
      } else {
        ineligible++;                               // NEW: counted on the ledger, never fetched
      }
```
VTS callers: `vts-runner.ts:3556`, `:4469` pass their already-crypto list; `:5292`'s list is the FX5 scan batch, crypto by ingestion path (`fx5-scanner.ts:658`, *"FX5 is the crypto scanner; assetClass is explicit"*) — I first wrote `p.assetClass === 'crypto_spot'` there and tsc refused it (the pairs carry no class field), which is why the comment cites the ingestion path instead.

**P2c — `getPrice` deleted** (rule 18; `DELETED_COMPONENTS_LOG` entry + `_archive/deleted-code/price-cache.getPrice.ts.removed`), with `rest_fetch`, `writeKeyAcc.getPrice`, `RestWriteSite 'getPrice'`.

**P3 / P4 — request and response through the venue list:**
```ts
  private planRestRequest(symbols) {                 // P3: the venue's REST pair, or NOT SENT (counted `unlisted`)
    for (const s of symbols) { const rest = this.venue.toKrakenRest(s); if (rest) sent.set(rest.toUpperCase(), s); else unlisted.push(s); }
  }
  private fileRestResponse(data, sent, writer, now, writes, onRow?) {   // P4: file by the venue key, or NOT FILED (counted `unresolved`)
    const entry = this.venue.resolveByKrakenKey(pair);
    if (!entry) { unresolved++; continue; }           // never a fall-back to normalizeInternal (the phantom path)
    ...
  }
```
`venue` is a field typed `Pick<typeof krakenAssetPairsService, 'isReady'|'toKrakenRest'|'resolveByKrakenKey'>`, defaulting to the service (tests stand in a fake). `toKrakenSymbol` and `symbolsMatch` are deleted (no remaining caller); `normalizeKrakenPair` stays only in `instrumentOf` (the liveness counters).
**P3a:** `ASSET_NORMALIZATION` gains `'XXDG': 'DOGE'`.

**P5 — refuse until ready:** `venueReady()`; `refreshBucket` returns before sending and does not advance `lastRefresh`; `getBatch` sends nothing (eligible symbols show as missing). One line at the transition: `[I2][PriceCache][VENUE_READY] … waitedMs=<ms since initialize> skippedPasses=<n>`.

**Ledger (C1):** `WriteKeyLedger` gains `unlisted[]`, `ineligible`, `unresolved` (`buildWriteKeyLedger`'s optional 5th arg; old callers unchanged). `requested` is the eligible set, so `requested = written ∪ missing` stays exact; `unlisted ⊆ missing`. Line suffix: `unlisted=N[…] ineligible=N unresolved=N` (the accumulator prints `unlistedDistinct`).

## Tests
- NEW `b-price-feed-truth-i2-rest-batch.test.ts` (8): unlisted not sent / all listed written (1) with a control that the old shape voids (2); ineligible not fetched, not re-injected, counted (3); a fresh feed-written ineligible row still returned (4); the collision `CAT/USD` never sent though the venue lists it (5); venue-key filing, no phantom, unresolved counted (6); refuse-until-ready + one transition line (7); `XXDG` → `DOGE` (8).
- NEW `b-price-feed-truth-i2-rtb-class.test.ts` (2): only the crypto member subscribed / eligible; the read list keeps both and a fresh xStock row alone runs `refreshAndRank`.
- UPDATED `b-rest-sides-to-cache-inc1` (tests 6, 7, 9, 10: venue fake; `getPrice` parts removed), `inc2` (16, 10: venue fake; the dual-key write still exercised), `b-price-side-p7k-cache-mark-kind` (4: the source fence now pins `fileRestResponse`).
- **Mutations, all caught:** send the unlisted symbol (1 fails) · drop the eligibility check (2) · resolver fall-back on an unresolved key (1) · skip readiness (1) · drop `XXDG` (1) · subscribe every RTB member (1).
- **Local:** 45 test files touching the changed modules, 547 passed. Two files excluded locally and NOT by me: `b-root-duplicate-scanner-retire` reads a stray `.claude/worktrees/agent-…` folder in this clone (git-excluded, absent in CI); `b-tsc-baseline-fix` fails to parse locally (encoding), untouched, green in CI. tsc 337 = baseline.

## Judgement calls to attack
1. **`requested` = eligible, and `unlisted` inside `missing`** rather than its own disjoint bucket — keeps the 3n.l identity untouched at the cost of P7 reading `missing == unlisted` instead of `missing == 0`.
2. **`refreshBucket` does not advance `lastRefresh` while waiting** — so it retries every second until ready (one `isReady()` call per second per bucket, no network).
3. **The dual-key write survives** in `fileRestResponse` (requested spelling ≠ the venue's internal symbol). Under the venue list it can arise only when the venue maps a requesting alias to the same REST pair; kept rather than deleted because `inc2` test 10 still guards its own-push-time rule.
4. **`:454`'s `safeResolveAssetClass` stays** (the shadow side-age probe's class label). The rtb test's log shows it resolving the xStock `CAT/USD` as `crypto_spot` — record-only, folded into `#1175` as a note rather than changed here.

## Step 7 evidence and criterion-disposition ask (2026-10-15)

### What the original criterion required

Pre-audit P7 requires a weekday window publishing the REST write identity (`written = requested − unlisted`, `missing = unlisted`, `phantom = 0`, plus `unresolved`), zero `[readyToBuy] Batch fetch error` lines with at least one `[readyToBuy] refreshed` positive control, and the RTB skip rate split by bucket composition (zero-crypto passes versus passes with crypto) against the pre-fix baseline.

### Measured current window

Fixed weekday window `2026-10-15T05:32:11Z` through `05:47:00Z`, after the exact deployed restart:

- **14** one-minute `getBatch` accumulator lines; **14/14** satisfy `written = requested − unlisted`, `missing = unlisted`, `phantomDistinct = 0`, and `unresolved = 0`; **10/14** contain at least one requested REST member.
- **14/14** accumulator lines have `ineligible > 0`. This is a reach control for the mixed RTB caller: the three production VTS call sites pass their whole crypto list as `restEligible`, while the RTB call is the sole production caller whose read list can exceed its eligible set.
- **56** `[PriceCache][readyToBuy] refreshed` lines and **0** `[PriceCache][readyToBuy] Batch fetch error` lines.
- **56** paper RTB refresh passes: **54** with `priced > 0`, **2** with `priced = 0`.

The `getBatch` ledger is deliberately accumulated across all four production callers between health lines, so it proves the shared write identity and the RTB mixed-list reach through `ineligible`, but it does not label an individual line `readyToBuy`.

### Why the bucket-composition skip-rate is now obsolete

The accepted P7 criterion predates `B-RTB-REFRESH-LIVE-PRICE`. That later, separately reviewed batch changed the RTB switch at `40306a0a08`: before, `refreshAndRank` ran only when the mark cache produced at least one `validPrices` member; after, it runs whenever the bucket has signals so every queued signal gets its live-price retirement check. Its pre-audit item 2 and Langston condition C9 explicitly name the switch and the resulting series break; its completion report closes the batch at `bb9ea7fc7`.

Therefore today's RTB "skip rate" is zero by the later design even if I2 were broken. It cannot distinguish whether an xStock feed-written row preserved a refresh, and restoring the old gate merely to retain the measurement would undo the newer approved behavior. The surviving `cyclesRun` gate retains the old `validPrices > 0` condition for the Paper/Live display, but neither it nor the current RTB line records crypto-versus-zero-crypto bucket composition.

### Reviewer ruling requested

**Recommendation:** retire only the obsolete bucket-composition skip-rate clause and grade I2 on the direct weekday evidence above: every observed write interval satisfies the I2 identity with zero phantom/unresolved rows; the RTB mixed-list path is exercised (`ineligible > 0` in all 14 intervals); the readyToBuy refresher succeeds 56 times with zero batch failures. Do not invent a new rate or infer class composition the surviving instruments do not record.

**Question for Coltrane:** does that direct evidence discharge I2 Step 7, or does I2 require a new per-bucket ledger field before it can pass? Please rule on the criterion, not on I3's already measured first-pass count.

`REVIEWER: claim-only plus the cited scope/change/completion objects; independent ruling pending.`
