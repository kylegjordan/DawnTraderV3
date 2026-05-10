# BATCH 79.0f — Asset-class resolver disambiguation (SCOPE rev 2)

**Status:** rev 2 2026-05-10 after Langston pre-impl review (verdict: approved-with-revisions). Reply at `Langston Design Asks/B79_0f_scope_review_rev1_reply.md`. 5 revisions applied — see §7. Persistence-as-real-fix split into separate **B79.0g** (Q4 lock) — see §8.

Live bug surfaced by Kyle 2026-05-10 ~14:14 UTC via Machine Learning UI — SUI/USD crypto trade displaying as "xStock Spot." Root cause: ticker collisions between Kraken's xStocks universe (Sun Communities = SUI equity) and Kraken's crypto universe (Sui Network).
**Phase:** 24 (Multi-Asset VTS Onboarding) — sub-batch 6 (after B79.0c + B79.0d).
**Branch:** `migration/aws-supabase`.
**Workflow:** 11-step canonical (full).
**Severity:** HIGH — currently affects 1 confirmed open trade (SUI/USD) with display + downstream-resolution risk; potentially affects up to **9 USD-quote and 8 EUR-quote ticker pairs** that exist in BOTH Kraken's crypto universe AND XSTOCK_SPOT_SYMBOLS.

---

## §0 — Confirmed collision set (live Kraken `/0/public/AssetPairs` query 2026-05-10)

**USD-quote (9 pairs):** BDX, CVX, DASH, EDU, MET, OPEN, PEP, SUI, T
**EUR-quote (8 pairs):** CVX, DASH, EDU, MET, OPEN, PEP, SUI, T (BDX absent)

These tickers exist as both:
- Kraken xStock equity (`<TICKER>xUSD` / `<TICKER>xEUR` raw form on Kraken Pro xStocks)
- Kraken crypto pair (`<TICKER>USD` / `<TICKER>EUR` raw form on Kraken spot)

EUR-side observation: even though our `XSTOCK_SPOT_SYMBOLS` set is /USD-only, EUR-quote crypto for these tickers is currently safe — but only by accident (membership-set lookup misses on /EUR). If a future commit adds /EUR variants to XSTOCK_SPOT_SYMBOLS, all 8 EUR pairs would also be miscategorized.

---

## §1 — Bug evidence

**Kyle's screenshot (2026-05-10):** Open trades panel shows:
- Row 1: `SUI/USD` with green "xStock Spot" tag, regime TFS, strategy `strong_bull_trend`, source pool `QUANT-STRONG_TREND`, P/L +4.66%
- Row 2: `SUI/EUR` with "Crypto Spot" tag, same regime + strategy + pool

API verification (`/api/vts/open-trades`) shows `asset_class: None` on the row — meaning the underlying VTS trade record doesn't persist asset_class; UI re-resolves at display time and hits the resolver bug.

**Why the trade entered through the crypto path correctly:**
- `strong_bull_trend` is NOT in `XSTOCK_SPOT_ENABLED_STRATEGIES` whitelist (B79).
- If SUI/USD were classified as xstock_spot at SQE time, the signal would be rejected with `asset_class_disabled`.
- Trade is in TFS regime — `strong_bull_trend` registered in IE only — so signal source must be the strong-trend lane (DBS-routed), which is crypto-only.
- Conclusion: trade entered as crypto (correct), display layer mis-resolves on render.

**Bug location:** `shared/asset-classes.ts:315`
```ts
if (XSTOCK_SPOT_SYMBOLS.has(symbol)) return ASSET_CLASSES.XSTOCK_SPOT;
```
The comment at line 313-314 claims this "cannot accidentally re-tag any crypto pair." That assumption is wrong for the 9 USD collision tickers.

---

## §2 — Numbered objectives

| # | Objective | Verification |
|---|---|---|
| 1 | Resolver `resolveAssetClass(symbol, exchange)` distinguishes xStock vs crypto for collision tickers via the **disambiguating form** (lowercase `x` suffix). | Unit tests pin: `resolveAssetClass('SUI/USD', 'kraken') === 'crypto_spot'`, `resolveAssetClass('SUIx/USD', 'kraken') === 'xstock_spot'`, `resolveAssetClass('SUIxUSD', 'kraken') === 'xstock_spot'` (raw Kraken-pair form), `resolveAssetClass('SUIUSD', 'kraken') === 'crypto_spot'` |
| 2 | Resolver fail-loud (throws) when an ambiguous symbol arrives without disambiguating form AND the symbol is in the collision set. | Unit test: `resolveAssetClass('SUI/USD', 'kraken')` returns `crypto_spot` (preferring crypto on collision) OR throws (Kyle decides — see Q1 below). Whichever path picked, behavior is deterministic + doesn't silently mislabel. |
| 3 | Drop the unconditional `XSTOCK_SPOT_SYMBOLS.has(symbol)` membership-set fallback at line 315 for collision tickers. Non-collision tickers (e.g. AAPL, TSLA, NVDA) can keep the membership fast-path because there's no ambiguity for them. | Code change: build `XSTOCK_SPOT_KRAKEN_COLLISIONS` constant (the 9 USD collisions); resolver checks collision membership first and forces explicit-form requirement; non-collision membership lookup unchanged. |
| 4 | UI display layer: instead of re-resolving asset_class from symbol on render, surface the asset_class field FROM the trade record. If the field is null (legacy rows), display "—" or "unknown" rather than guess via re-resolve. | Confirm via inspection of the open-trades API response: `asset_class` field populated; UI renders from that field. |
| 5 | VTS trade record persistence: every newly-opened VTS trade writes `asset_class` to its row (resolved AT TRADE-OPEN time when raw symbol form is still available). Backfill optional (low-priority). | DB schema: identify which table backs `/api/vts/open-trades` and add asset_class persistence path if missing. |
| 6 | Sweep historical DB rows for any `asset_class='xstock_spot'` that should be `crypto_spot` (the 9 collision tickers). Generate audit report. Flip if found. | SQL audit query + remediation script if rows found. |
| 7 | Add 9 unit tests pinning the collision behavior — one per USD collision ticker. Plus 8 EUR collision tickers (regression-lock for future XSTOCK_SPOT_SYMBOLS extension to /EUR). | `b79-0f-asset-class-collisions.test.ts` |
| 8 | No-touch fence on crypto_spot regime cadence holds | Post-deploy SQL |
| 9 | CI 4 checks gate | Build + Docker green; legacy baseline preserved |

---

## §3 — Open questions for Langston

**Q1 — Collision behavior: throw vs prefer-crypto vs prefer-xstock.** When an ambiguous form arrives (e.g. `SUI/USD` with `exchange='kraken'`):
- **(A) Throw** — strict; force callers to pass disambiguating form. Strongest invariant but high refactor cost (any caller passing canonical form must be tracked down + fixed).
- **(B) Prefer crypto for collision tickers** — if ticker is in `XSTOCK_SPOT_KRAKEN_COLLISIONS` AND no `x` suffix present, return `crypto_spot`. Behavior matches reality: the ambiguous form arises when symbol was canonicalized post-ingestion from a crypto pair (if from xStock pair the `x` would've been preserved at ingestion).
- **(C) Prefer xstock for collision tickers** — opposite of B. Would silently mis-tag any crypto pair that lost its raw form. Worst option.

**My call: (B) — prefer crypto for collision tickers.** Reasoning: collisions arise when canonicalization stripped the `x`. xStock symbols originate from `kraken-equities` exchange or carry the `x` suffix in display form; if neither marker survives, the symbol came from crypto. (B) preserves the no-silent-mislabeling property while not forcing a refactor of every callsite.

**Q2 — XSTOCK_SPOT_SYMBOLS set hygiene.** Should the 9 collision USD tickers be REMOVED from `XSTOCK_SPOT_SYMBOLS`? If yes, the explicit `x`-suffix form (`SUIx/USD`) becomes the only path. If no, we keep them and rely on the collision-set check to gate them.

**My call: keep them in the set, gate via collision-set check.** Remove-from-set option breaks the "complete xStock catalog" reading of XSTOCK_SPOT_SYMBOLS (loses utility for code that wants to enumerate all xStocks). Collision-set check is surgical.

**Q3 — Backfill historical mis-tagged rows.** SQL audit: `SELECT symbol, asset_class, COUNT(*) FROM <every table with asset_class column> WHERE symbol IN (collision tickers) GROUP BY symbol, asset_class`. If any rows show `asset_class='xstock_spot'` for a collision ticker on regular `kraken` exchange, those are mis-tagged. Backfill or leave?

**My call: audit first, backfill if any production data is affected.** B73 ablation, regime_factor_alternates, and signal_eval_archive could all carry mis-tagged rows that affect downstream calibration. Backfill is a separate one-line UPDATE per table. Low-effort + correctness-preserving.

**Q4 — Display-layer fix scope.** Objective 4 says "surface asset_class from trade record." But the open-trades API returned `asset_class: None` — suggesting the record doesn't carry it. Two paths:
- **(A)** Fix the persistence: write asset_class on trade open + read from row on render. Higher-effort but architecturally correct.
- **(B)** UI resolver fix only: ensure the UI's `resolveAssetClass` call uses the post-fix resolver from objective 1-3, which preferring-crypto on collision will at least display correctly.

**My call: (B) for ship + file follow-up RUNNING_ISSUE for (A).** (A) requires schema/persistence change which is bigger blast radius.

**Q5 — Resolver throws on unknown patterns. Does this batch widen that?** Currently `resolveAssetClass` throws on unknown patterns. If we add fail-loud on collision-without-disambiguator (Q1 option A), should we audit `safeResolveAssetClass` callsites to ensure the null-return path is handled?

**My call: only relevant if we pick Q1=(A). For Q1=(B), no widening needed.**

---

## §4 — Files affected

### Modified
- `shared/asset-classes.ts` — add `XSTOCK_SPOT_KRAKEN_COLLISIONS` set; modify `resolveAssetClass` to gate the membership-set fast-path on collision-set non-membership; preserve all other behavior

### Added
- `server/tests/unit/b79-0f-asset-class-collisions.test.ts` — 9 USD + 8 EUR collision regression-lock tests; 4 disambiguating-form tests; audit-pinning test (`XSTOCK_SPOT_KRAKEN_COLLISIONS.size === 9` enforced)

### Audit
- SQL one-shot: `scripts/b79-0f-collision-audit.sql` — every table with asset_class column queried for collision-ticker rows; reports counts; OPTIONAL remediation UPDATE statements (commented out, run manually after audit review)

### Docs
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md` — append §10c.X note on collision-set discovery + standing rule (canonicalization must NOT strip the `x` suffix when the ticker is in collision set)
- `RUNNING_ISSUES.md` — #91 if Q4 picks (B): persistence-on-trade-open follow-up for asset_class column on VTS trade record

---

## §5 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| Resolver Q1=(B) silently mis-classifies an xStock signal that was canonicalized en-route | xStock ingestion ALWAYS uses `exchange='kraken-equities'` per B74 archiver — no xStock signal flows through `exchange='kraken'` path. The crypto-preference rule only applies to the regular kraken path. |
| Backfill touches production data | Backfill is OPTIONAL per Q3 my-call; audit first, decide on remediation per-table |
| Hidden callsites using `safeResolveAssetClass` mask the bug | safeResolveAssetClass returns null on throw — current bug is membership-set returning xstock_spot, not throwing. Q1=(B) keeps non-throwing behavior. |
| Crypto_spot no-touch fence | Resolver change shouldn't affect crypto path semantically — the 9 collision tickers were being classified as xstock_spot pre-fix; post-fix they classify as crypto_spot (correct). Pipelines that already handled crypto_spot keep working. |
| New collision when Kraken adds a crypto ticker matching an existing xStock | Standing rule + B79.x periodic re-audit |

---

## §6 — Out of scope

- Persistence of `asset_class` on VTS trade record (objective 4 (B) for now; (A) deferred)
- B73 ablation re-run on backfilled rows (separate batch if backfill happens)
- Renaming XSTOCK_SPOT_SYMBOLS (deferred — utility preserved per Q2)
- New asset class additions beyond xstock_spot/crypto_spot

---

---

## §7 — rev 2 revisions (Langston review 2026-05-10, verdict: approved-with-revisions)

1. **Q1 observability:** add WARN log when collision ticker hits `kraken` path without `x` suffix. `[B79.0f][COLLISION_RESOLVE]` prefix. Future drift in B74 invariant detectable.
2. **Q4 split:** UI re-resolve fix here (B79.0f); persistence-at-open committed as **B79.0g** (numbered sub-batch, NOT RUNNING_ISSUES backlog) per Langston "NO PATCHES" framing. See §8.
3. **Provenance comment:** `XSTOCK_SPOT_KRAKEN_COLLISIONS` constant carries comment block citing Kraken `/0/public/AssetPairs` source + last-verified date (2026-05-10).
4. **Audit SQL read-only by default:** `scripts/b79-0f-collision-audit.sql` SELECT-only; UPDATE remediation statements commented out + require manual uncomment after Kyle reviews counts.
5. **Backfill governance:** if audit finds rows, per-table row-count one-liner in `CHANGES_AND_FIXES.md` for paper trail.

Plan-doc addendum: standing **quarterly re-audit cadence** of `XSTOCK_SPOT_KRAKEN_COLLISIONS` against Kraken `/0/public/AssetPairs` — calendar trigger added to `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.X.

---

## §8 — B79.0g preview (committed sequencing per Q4 Langston lock)

After B79.0f ships, **B79.0g** addresses the architectural root cause:
- Persist `asset_class` on every VTS trade row at open time (where exchange context is known).
- Display + downstream consumers READ from row, never re-resolve.
- Eliminates display-layer re-resolution path entirely (the violation that exposed the collision bug).

B79.0g scope drafted as separate batch immediately following B79.0f close.

*End BATCH_79_0f_SCOPE.md rev 2.*
