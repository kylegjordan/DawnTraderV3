# B79.0n.UNIVERSE-DISCOVERY — Step 1 scope (sub-batch 2 of 18 in B79.0n umbrella arc)

> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` rev 3 (pending Langston concurrence with this scope as a combined dispatch).
> **Position:** sub-batch 2 of 18. Independent like HYGIENE — operates at a lower architectural layer than STORAGE. STORAGE (sub-batch 3) depends on UNIVERSE-DISCOVERY because the dynamic registry shape is the consumption target for STORAGE's silent-fallback audit.
> **Phase:** Phase 24 (multi-asset onboarding). CLAUDE.md §3.3 learning-capture rule applies.
> **Active trading status:** stays OFF (entire arc is end-to-end-ready architecture; live enablement is the Phase 19 gate).
> **Origin:** Kyle architectural directive 2026-05-21 PM mid-B79.0n.HYGIENE design conversation. Locked decision captured at HYGIENE completion report §5(c) #1 + §6 (umbrella v3 restructuring).

---

## §1 — Objective

**Replace the hardcoded `XSTOCK_SPOT_REGISTRY` Map literal in `shared/asset-classes.ts:271-540` (currently 260 entries) and the hardcoded `server/config/xstocks-universe.json` (currently 260 symbols, kept in sync manually) with a dynamically-populated universe sourced from external services.** When Kraken launches a new tokenized stock, the system should discover it automatically within 24 hours without anyone editing source files or shipping a code change.

**Why this exists architecturally.** The crypto-side path calls Kraken's REST `AssetPairs` endpoint live on every scanner cycle (`server/services/market-scanner.ts:551-554` via `krakenService.getTradablePairs()`) and adapts to whatever pairs Kraken currently reports — ~1,544 today, will be ~1,600 tomorrow if Kraken lists more, automatically. The xStock path has no equivalent endpoint: Kraken's public REST API does NOT index xStock instruments at all (confirmed empirically in B-NEW-36 sub-batch (c) Kraken `AssetPairs` probe — returns `EQuery:Unknown asset pair` for ALL xStock symbols including known-good AAPL/TSLA/AMZN). xStock instruments stream exclusively through `wss://ws-equities.kraken.com` and that WebSocket has no "list all symbols" message — you have to send subscribe requests for specific candidate symbols and observe which ones come back accepted. The current registry was built by a manual subscription probe in April 2026; it's been hand-maintained ever since. As Kraken keeps adding tokenized stocks (more Backed Finance issuance every month), manual maintenance scales poorly and Kyle has zero visibility into newly-supported names.

**The fix shape.** Build a three-service discovery chain that runs daily + on-demand. Cache results in a DB-backed snapshot table. The existing `XSTOCK_SPOT_REGISTRY` + `XSTOCK_SPOT_SYMBOLS` exports keep their interface (callers don't change) but become dynamically-populated at module-init time from the snapshot table. When the discovery chain unavailable, fall back through last-known-good snapshot → small hard-coded bootstrap set → fail-fast at boot. The hardcoded `xstocks-universe.json` becomes auto-derived from the snapshot table (eliminating the second sync point). Test asserts convert from exact-equality (`size === 260`) to range (`size >= 100 && size <= 2000`) so universe growth doesn't break tests.

---

## §2 — Pre-audit checklist (Step 2 — runs before any code edits)

### §2.1 — Standard 11-step disciplines (CLAUDE.md §2 + umbrella §2.1)

- [ ] Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every affected component: `shared/asset-classes.ts` (the registry source), `server/config/xstocks-universe.json` (the parallel sync target), `server/asset_classes/xstock_spot/scanner.ts` (consumer), `server/services/xstock-ohlc-cache.ts` (consumer), `server/services/price-discontinuity-detector.ts` (consumer), `server/routes.ts` (consumer via dynamic import), `scripts/b-new-34b-prewarm-snapshot.ts` (consumer), `scripts/b-phase-a2-backfill.ts` (consumer), `scripts/b79-0a-load-test.ts` (consumer), `server/services/external-macro-feed.ts` (CoinGecko integration we extend), `server/services/stocks.ts` (Finnhub integration we extend), plus the new `xstock_spot_universe` DB table that doesn't exist yet.
- [ ] Read `1-system-manual/SYSTEM_MANUAL.md` for canonical xStock-side scanner + universe architecture.
- [ ] Document analysis in `BATCH_B79_0n_UNIVERSE_DISCOVERY_PRE_AUDIT.md`.

### §2.2 — CoinGecko tokenized-stocks endpoint verification

The most critical pre-audit step. The whole architecture depends on CoinGecko actually exposing a tokenized-stocks catalog with sufficient coverage of Backed Finance issuance.

- [ ] **Step 2.2.a — endpoint discovery + Pro tier key verification on the SPECIFIC endpoint (Langston Q9 #1 add).** Probe CoinGecko Pro tier API for the right endpoint. Likely candidates: `/coins/categories` (returns all categories with their ids), `/coins/categories/<category_id>` (returns coins in a specific category). Find the category id that contains Backed Finance's xStock issuance. Common candidates: `tokenized-stocks`, `real-world-assets`, `tokenized-equities`, issuer-specific like `backed-finance`. Use the existing Pro tier auth: `https://pro-api.coingecko.com/api/v3/coins/categories` with `x-cg-pro-api-key` header. **Critical Pro-tier verification:** the existing `external-macro-feed.ts` integration is wired only for `/global`. Some CoinGecko category endpoints are Pro-only, some are free-tier-accessible. Pre-audit MUST verify `COINGECKO_API_KEY` authenticates against the SPECIFIC endpoint we'll consume (HTTP probe with the actual category endpoint, not just inheritance from `/global` success). If the endpoint we need is Pro-only and our key has the Pro tier, no change. If it returns 403 even with our key, escalate. **Multi-category union decision (Langston Q9 #5 add):** also enumerate the actual category structure — if CoinGecko has overlapping categories (e.g. an "RWA" category that includes tokenized-stocks + tokenized-real-estate), the right approach is **union of multiple categories filtered by issuer="Backed Finance" or equivalent attribute**, not single-category. Pre-audit explicitly decides single-vs-union before implementation.
- [ ] **Step 2.2.b — coverage diagnostic (Langston Q1 reframe accepted).** From whichever category id is the right one, fetch the full list and cross-reference against our current `XSTOCK_SPOT_REGISTRY` of 260 symbols. **This is a diagnostic, not a gate.** The Kraken WS subscription probe is the authoritative source of truth — Kraken either accepts the subscription or rejects it (binary). CoinGecko is just one of two inputs to the candidate set, with S&P 500 backstop as the other. **Concrete behavior:** if CoinGecko-vs-current-registry overlap drops below 50% on any discovery cycle, emit a `[B79.0n.UNIVERSE-DISCOVERY][LOW_COINGECKO_COVERAGE]` warning log AND continue the cycle. The S&P 500 backstop carries the load. Ops investigate at leisure; no escalation gate. Document the diff for diagnostic posterity: which current registry symbols don't appear in CoinGecko, which CoinGecko symbols don't appear in our current registry.
- [ ] **Step 2.2.c — symbol form mapping.** CoinGecko's coin entries return things like `id: "apple-tokenized-stock-defichain"`, `symbol: "aapl"`, `name: "Apple Tokenized Stock"`. Kraken's xStock product uses `AAPL/USD` form. Build the canonical mapping: CoinGecko `symbol` field uppercased + `/USD` suffix probably works for most cases. Document edge cases (Backed Finance "xAAPL" → "AAPL/USD" form mapping, etc.).
- [ ] **Step 2.2.d — API quota check.** CoinGecko Pro tier limits documented at https://docs.coingecko.com/. Pro plan is ~500 calls/min. Our daily refresh = 1 call/day. No quota concern for the daily run, but probe-mode that runs more frequently needs rate-limit awareness.

### §2.3 — Kraken WebSocket subscription probe design

The discovery layer that confirms CoinGecko-listed symbols actually trade on Kraken.

- [ ] **Step 2.3.a — probe protocol verification.** Connect to `wss://ws-equities.kraken.com`, send subscribe request for a single known-good symbol (e.g. `AAPL/USD`), confirm acceptance pattern. Send subscribe for a known-bad symbol (e.g. `NONEXISTENT/USD`), confirm rejection pattern. Document the message shapes for both.
- [ ] **Step 2.3.b — rate-limit calibration.** April 2026 probe (per `xstocks-universe.json` `_comment`) used 30ms/req throttling. Verify this still works without disconnects. Conservative target: 50ms/req (~20 req/sec) for the production probe; can be tuned in pre-audit if Kraken accepts higher rates.
- [ ] **Step 2.3.c — candidate set composition.** What symbols do we probe? Options: (a) CoinGecko's full tokenized-stocks category (probably 200-300 symbols), (b) CoinGecko + S&P 500 universe (~500 symbols — catches potential new tokenizations CoinGecko hasn't picked up yet), (c) CoinGecko + S&P 500 + Russell 2000 (~2,500 symbols — most comprehensive but takes ~2 min at 50ms/req). CC default: **(b)** — strikes balance between coverage and probe duration. Confirm with Langston.
- [ ] **Step 2.3.d — probe duration + scheduling.** At 50ms/req × 500 symbols = 25s probe time. Daily probe at 6 AM UTC (~3 hours before ARCA open) gives time to refresh the registry before the scanner starts active universe processing.
- [ ] **Step 2.3.e — subscription lifecycle.** Confirm probe-mode subscriptions can be cleanly unsubscribed (don't want the probe to leave 500 subscriptions open eating production WS quota). Test the WebSocket close → reopen pattern to validate the probe is fully ephemeral.

### §2.4 — Finnhub metadata lookup integration

Per-symbol sector / industry data for the metadata layer.

- [ ] **Step 2.4.a — API key provisioning check.** `server/services/stocks.ts:51` warns when `FINNHUB_API_KEY` is missing; staging BOOT log shows this warning is firing. Verify with Kyle whether the key is available and just not set on staging, or whether we need to provision a new one. Free tier allows 60 calls/min, sufficient for our daily ~500-symbol refresh (~10 min at one call/sec to stay well under quota).
- [ ] **Step 2.4.b — endpoint shape.** Finnhub `/stock/profile2?symbol=AAPL` returns `{ name, finnhubIndustry, sector, ipo, marketCapitalization, ... }`. Document the field mapping to our `XstockSpotEntry` shape (sector: 'XLV' / 'XLK' / etc.).
- [ ] **Step 2.4.c — GICS-to-internal-sector mapping.** Finnhub returns GICS sector strings (e.g. "Technology", "Healthcare", "Communication Services"). Our internal enum uses SPDR sector ETF tickers (XLK, XLV, XLC, XLP, XLU, XLE, XLF, XLI, XLY, XLB, XLRE). Build the mapping table. Edge cases: BROAD_ETF (GLD, IEMG, XBI), INDEX_PROXY (SPY, QQQ), INTL_ETF (EWA, EWC, etc.) — these don't have direct GICS equivalents; preserve our current classification via the curated-override layer (§2.6).
- [ ] **Step 2.4.d — fallback for missing metadata.** If Finnhub returns 404 or rate-limits, the symbol joins the registry with `sector: 'UNCATEGORIZED'` (new enum value) rather than blocking the whole refresh. The scanner processes uncategorized symbols normally; B-PHASE-A2 sector-coverage telemetry doesn't count them toward the 7-sector floor. Manual curation can promote them later.

### §2.5 — Curated-override layer design

Some per-symbol metadata cannot be auto-derived from external services.

- [ ] **Step 2.5.a — flags that need manual curation.** `cryptoAdjacent: true/false` (whether the underlying equity has high correlation with crypto markets — BITF, COIN, MSTR, HOOD, CIFR, CLSK, etc.). `adr: true/false` (American Depositary Receipt — BABA, ASML, NIO, etc.). Both are our trading-logic flags, not standard equity metadata; Finnhub doesn't have a "crypto-adjacent" field. Curate manually.
- [ ] **Step 2.5.b — override storage shape.** Options: (a) DB table `xstock_spot_universe_overrides` with `(symbol PK, sector TEXT NULL, cryptoAdjacent BOOLEAN NULL, adr BOOLEAN NULL, name_override TEXT NULL, notes TEXT, updated_at)`. (b) JSON file at `server/config/xstock-curated-overrides.json` checked into git. CC default: **(a) DB table** — same governance discipline as other DB-driven configs (module_constants pattern); easier to audit; survives code deploys; supports per-deploy-environment differences if needed later.
- [ ] **Step 2.5.c — seed migration.** The first migration seeds the override table with current per-symbol curation data extracted from `shared/asset-classes.ts:271-540` (the cryptoAdjacent + adr flags + any manual sector classifications that diverge from GICS). Preserves all institutional knowledge during the transition.

### §2.6 — Fallback chain design (Kyle directive)

Hard-pinned by Kyle in the architectural directive. Five-level fallback:

1. **Live discovery succeeds.** Use today's snapshot.
2. **Discovery service fails BUT DB snapshot table populated.** Use last-known-good DB snapshot. `[B79.0n.UNIVERSE-DISCOVERY][FALLBACK_DB_SNAPSHOT]` warn log.
3. **DB unavailable BUT local file cache present.** Use file cache at `/var/lib/dawntrader/xstock-universe-cache.json` written by the most recent successful discovery. `[FALLBACK_FILE_CACHE]` warn log.
4. **No file cache BUT hard-coded bootstrap set present.** Use a small in-source bootstrap of ~20 mega-caps with known sectors (AAPL, AMZN, GOOGL, MSFT, NVDA, TSLA, META, BRK.B, etc. — names that will exist on Kraken's xStock product for the foreseeable future). `[FALLBACK_BOOTSTRAP]` warn log.
5. **All five layers exhausted.** Fail-fast at boot via `process.exit(1)`. `[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] universe-discovery exhausted all fallbacks` log.

Boot-time smoke test extends to verify the universe-discovery chain is wired: `getActiveUniverse().size > 0` assertion in `server/index.ts` (alongside the existing null-reason-tracker smoke test from HYGIENE).

### §2.7 — Step 4.5 (writer/reader asset-class enumeration) — N/A for this batch

This batch is xstock_spot-only. No new storage API call sites added. Step 4.5 discipline does not apply here. STORAGE (sub-batch 3) will exercise it on the storage API surface.

### §2.8 — Step 4.6 (block-scope rename audit) — applies

`XSTOCK_SPOT_REGISTRY` and `XSTOCK_SPOT_SYMBOLS` stay as exported identifiers — their MEMBERSHIP becomes dynamic but the call sites don't change. Pre-audit explicitly verifies every consumer (enumerated in §5.2 of HYGIENE pre-audit at lines 161-178) is compatible with `Set`/`Map` whose contents change between module-init and runtime (none of them should be; they iterate or look up, no one caches `size` at module-init).

### §2.9 — Crypto-by-construction-NONE invariant (umbrella §2.3)

Pre-audit explicitly verifies: every code change is xstock_spot-side only. Crypto's `market-scanner.ts:551-554` REST `AssetPairs` discovery is untouched. Crypto's `fx5-scanner.ts` is untouched. No shared utility gets new asset-class-conditional branching in this batch.

### §2.10 — Phase 19 readiness pre-audit (NEW per Langston Q7 counter-propose)

CC's working assumption was that per-trade safety gates handle dynamic universe growth automatically. Langston counter-proposed that three specific places need explicit verification, not just suspicion. Add to Step 2 pre-audit:

- [ ] **Step 2.10.a — TELEMETRY lazy-allocate forward-flag.** When TELEMETRY (sub-batch 10) ships per-asset-class buckets, the design must allocate per-symbol buckets LAZILY on first use, not at startup. If TELEMETRY snapshots at startup, a symbol discovered later won't have a bucket and writes will silently no-op (silent-failure of telemetry on new symbols is exactly the bug class we keep finding). **This is a TELEMETRY scope concern.** UNIVERSE-DISCOVERY pre-audit doesn't fix it but MUST flag it forward into `B79_0n_TELEMETRY_SCOPE.md` (currently not yet drafted — add the requirement at the time STORAGE drafts TELEMETRY's scope, or earlier as a pinned note in the umbrella file). Documentation: this is the kind of cross-sub-batch awareness Phase 24 onboarding learnings §5(c) #1 / §5(d) #1 captured — UNIVERSE-DISCOVERY pre-audit is the first batch where the cross-batch-awareness rule is exercised.
- [ ] **Step 2.10.b — strategy-settings per-symbol audit.** Query staging DB: `SELECT COUNT(*) FROM strategy_settings WHERE symbol IS NOT NULL AND asset_class = 'xstock_spot'`. If non-zero, a newly-discovered symbol can't be evaluated by any strategy until someone adds per-symbol rows. **Verify zero per-symbol overrides exist, or document the gap explicitly with a backfill-on-discovery plan.** The `strategy_settings` table is supposed to be per-asset-class only (Langston rev2 §11.4); per-symbol rows would be a regression from that design.
- [ ] **Step 2.10.c — universe-growth shock test (added to §4 unit tests).** Simulate a single discovery cycle adding +50 symbols (25% jump). Verify scanner cycle time, memory footprint, telemetry write rate stay within ±10% of pre-jump baseline. **Real risk:** Backed Finance announces tokenization batch, our 06:00 UTC discovery cycle picks up 50 names at once, ARCA-open scanner at 13:30 UTC hits memory pressure or cycle-timeout from the universe expansion. Better to find that in a unit test than at ARCA-open on a quiet Monday.

---

## §3 — Code changes

### §3.1 — New DB table `xstock_spot_universe`

Migration file: `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql`

```sql
CREATE TABLE xstock_spot_universe (
  symbol TEXT PRIMARY KEY,                -- canonical 'BASE/USD' form
  name TEXT NOT NULL,                     -- display name from Finnhub or override
  sector TEXT NOT NULL,                   -- XLK/XLV/XLC/XLP/XLU/XLE/XLF/XLI/XLY/XLB/XLRE/BROAD_ETF/INDEX_PROXY/INTL_ETF/UNCATEGORIZED
  crypto_adjacent BOOLEAN NOT NULL DEFAULT false,
  adr BOOLEAN NOT NULL DEFAULT false,
  source_chain JSONB NOT NULL,            -- {coingecko: bool, kraken_ws_accept: bool, finnhub: bool, override_applied: bool}
  is_delisted BOOLEAN NOT NULL DEFAULT false,  -- NEW per Langston Q9 #3: >30 days last_seen_at = delisted; excluded from XSTOCK_SPOT_SYMBOLS but kept in DB for forensics
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_xstock_spot_universe_sector ON xstock_spot_universe(sector);
CREATE INDEX idx_xstock_spot_universe_last_seen ON xstock_spot_universe(last_seen_at);
CREATE INDEX idx_xstock_spot_universe_is_delisted ON xstock_spot_universe(is_delisted);

-- NEW per Langston Q9 #2: discovery_runs audit table — every discovery cycle
-- writes one row. Gives ops a rollback target + forensic history when discovery
-- starts misbehaving (without this, the only forensics is grep-logs, fragile).
CREATE TABLE discovery_runs (
  run_id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  source_chain_status JSONB NOT NULL,     -- {coingecko: {ok, count, error?}, kraken_ws: {ok, candidates_probed, accepted_count, rejected_count, error?}, finnhub: {ok, enriched_count, error?}}
  symbols_discovered INTEGER NOT NULL DEFAULT 0,
  symbols_marked_stale INTEGER NOT NULL DEFAULT 0,
  symbols_marked_delisted INTEGER NOT NULL DEFAULT 0,
  error_log TEXT NULL,
  triggered_by TEXT NOT NULL              -- 'cron_daily' | 'manual_endpoint' | 'boot_smoke'
);

CREATE INDEX idx_discovery_runs_started_at ON discovery_runs(started_at);

-- Companion override table (manual curation)
CREATE TABLE xstock_spot_universe_overrides (
  symbol TEXT PRIMARY KEY,
  sector_override TEXT NULL,              -- if NULL, use Finnhub-derived sector
  crypto_adjacent_override BOOLEAN NULL,  -- if NULL, default false
  adr_override BOOLEAN NULL,              -- if NULL, default false
  name_override TEXT NULL,                -- if NULL, use Finnhub-derived name
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed overrides from the current curated registry (extracted from shared/asset-classes.ts pre-deploy)
INSERT INTO xstock_spot_universe_overrides (symbol, crypto_adjacent_override, adr_override, sector_override)
VALUES
  ('BTBT/USD', true, false, 'XLK'),
  ('CIFR/USD', true, false, 'XLK'),
  ('CLSK/USD', true, false, 'XLK'),
  ('COIN/USD', true, false, 'XLF'),
  ('CRCL/USD', true, false, 'XLF'),
  ('DFDV/USD', true, false, 'XLF'),
  ('GLXY/USD', true, false, 'XLF'),
  ('HIVE/USD', true, false, 'XLK'),
  ('HUT/USD', true, false, 'XLK'),
  ('MSTR/USD', true, false, 'XLK'),
  ('BHC/USD', NULL, true, NULL),
  ('BIDU/USD', NULL, true, NULL),
  ('BILI/USD', NULL, true, NULL),
  -- ... full ADR list from current registry ...
  ('SPY/USD', NULL, false, 'INDEX_PROXY'),
  ('QQQ/USD', NULL, false, 'INDEX_PROXY'),
  ('GLD/USD', NULL, false, 'BROAD_ETF'),
  ('XBI/USD', NULL, false, 'BROAD_ETF'),
  ('TOTL/USD', NULL, false, 'BROAD_ETF'),
  ('IEMG/USD', NULL, false, 'BROAD_ETF'),
  ('EWA/USD', NULL, false, 'INTL_ETF'),
  -- ... full INTL_ETF list (11 entries) ...
  ON CONFLICT (symbol) DO NOTHING;

-- Seed the universe table from the current 260-symbol registry as the bootstrap
-- snapshot. First discovery run will refresh this with live data.
INSERT INTO xstock_spot_universe (symbol, name, sector, crypto_adjacent, adr, source_chain)
SELECT
  symbol,
  name,
  sector,
  crypto_adjacent,
  adr,
  '{"coingecko": false, "kraken_ws_accept": false, "finnhub": false, "override_applied": true, "seed": true}'::jsonb
FROM (VALUES
  ('AAPL/USD', 'Apple', 'XLK', false, false),
  -- ... full 260-row seed VALUES list extracted programmatically ...
) AS seed(symbol, name, sector, crypto_adjacent, adr)
ON CONFLICT (symbol) DO NOTHING;
```

Pre-deploy: a script extracts the current `shared/asset-classes.ts:271-540` literal Map content and generates the seed VALUES list. The seed step ensures the universe table is non-empty from day one, so the existing scanner has data even before the first live discovery cycle completes.

### §3.2 — NEW discovery service `server/services/xstock-universe-discoverer.ts`

```typescript
/**
 * B79.0n.UNIVERSE-DISCOVERY — dynamic xStock universe discoverer.
 * Three-source chain: CoinGecko tokenized-stocks → Kraken WS subscription
 * probe → Finnhub per-symbol metadata. Upserts into xstock_spot_universe
 * DB table. Daily refresh via node-cron + ad-hoc trigger endpoint.
 */
export class XstockUniverseDiscoverer {
  async runDiscovery(): Promise<DiscoveryResult> {
    // Step 1: CoinGecko fetch
    const coinGeckoSymbols = await this.fetchCoinGeckoTokenizedStocks();
    // Step 2: Kraken WS probe (CoinGecko candidates + S&P 500 backstop)
    const krakenAccepted = await this.probeKrakenWS([
      ...coinGeckoSymbols,
      ...SP500_BACKSTOP_SYMBOLS,
    ]);
    // Step 3: Finnhub metadata for each Kraken-accepted symbol
    const metadata = await this.fetchFinnhubMetadata(krakenAccepted);
    // Step 4: Apply curated overrides
    const enriched = await this.applyOverrides(metadata);
    // Step 5: Upsert into xstock_spot_universe (set last_seen_at = now())
    await this.upsertUniverse(enriched);
    // Step 6: Stale → delisted lifecycle (Langston Q9 #3 add):
    //   <7 days last_seen_at  = active (no action)
    //   7-30 days             = stale (warn log [STALE_FOUND], still in XSTOCK_SPOT_SYMBOLS — Kraken may have transient outage)
    //   >30 days              = delisted (UPDATE is_delisted=true; EXCLUDED from XSTOCK_SPOT_SYMBOLS; row kept in DB for forensics; [DELISTED_AUTO] notice log)
    await this.applyStaleAndDelistedLifecycle();
    // Step 7: Write one row to discovery_runs audit table with full source_chain_status JSONB
    await this.writeAuditRow();
    return { discovered: enriched.length, /*... */ };
  }
  // ... fetchCoinGeckoTokenizedStocks, probeKrakenWS, fetchFinnhubMetadata,
  //     applyOverrides, upsertUniverse, applyStaleAndDelistedLifecycle,
  //     writeAuditRow methods ...
}
```

Discovery runs daily at 06:00 UTC via node-cron (mirrors B-NEW-36 session-lifecycle controller pattern, `timezone: 'UTC'`). Manual trigger via `POST /api/internal/universe-discovery/refresh` endpoint (auth-protected admin-only).

**Stale → delisted lifecycle (Langston Q9 #3):** if Kraken silently drops xStock support for a symbol (the symbol stops getting accepted on WS subscription probe), the system auto-stops scanning it within 30 days without manual intervention. <7 days = active (no action). 7-30 days = stale (warn log on each cycle that the symbol is in the registry but hasn't been confirmed by recent probe). >30 days = `is_delisted=true` flag set; the universe-service's `getActiveUniverse()` excludes these rows from the returned Set; the row stays in the DB for forensics + potential resurrection if Kraken adds the symbol back.

### §3.3 — NEW accessor service `server/asset_classes/xstock_spot/universe-service.ts`

```typescript
/**
 * Single source-of-truth accessor for the dynamic xStock universe.
 * Reads from xstock_spot_universe DB table at module-init; caches in-process.
 * Refreshed by the universe-discoverer service via DB write; consumers refresh
 * their in-process cache via subscribeUniverseUpdates() callback or by calling
 * getActiveUniverse() which lazily re-reads from DB if cache is older than 1h.
 */
export class XstockUniverseService {
  private cache: Map<string, XstockUniverseEntry> = new Map();
  private cacheLoadedAt: number = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1h

  async getActiveUniverse(): Promise<ReadonlySet<string>> { /* ... */ }
  async getMetadata(symbol: string): Promise<XstockUniverseEntry | null> { /* ... */ }
  async refreshFromDB(): Promise<void> { /* ... */ }
  subscribeUniverseUpdates(callback: (universe: Set<string>) => void): () => void { /* ... */ }
}
```

### §3.4 — MODIFIED `shared/asset-classes.ts`

Replace the Map literal at line 271-540 with a stub that's populated by the universe-service at module-init:

```typescript
// B79.0n.UNIVERSE-DISCOVERY 2026-05-XX: registry now populated dynamically from
// xstock_spot_universe DB table at module-init. See server/asset_classes/
// xstock_spot/universe-service.ts. Manual additions to this file are NO LONGER
// the right pattern — overrides go in xstock_spot_universe_overrides table.
export const XSTOCK_SPOT_REGISTRY: Map<string, XstockSpotEntry> = new Map();
export const XSTOCK_SPOT_SYMBOLS: Set<string> = new Set();

// Populated at boot by universe-service.ts; consumers can call await
// xstockUniverseService.getActiveUniverse() for fresh data, or use the
// in-process cache via direct Map/Set access (synced on universe-service
// refresh events).
```

The synchronization between universe-service and the legacy `XSTOCK_SPOT_REGISTRY` export happens via universe-service emitting an update event that mutates the Map+Set in place. Existing consumers don't have to change — they keep importing the symbols/registry and iterating/looking up, but the contents update over time as the discovery service refreshes the DB.

**Important compat note:** `XSTOCK_SPOT_REGISTRY.size` reads can no longer be relied on at module-init time (the discovery service may not have populated the cache yet). All call sites that need to know "is this symbol currently in the universe?" use `XSTOCK_SPOT_SYMBOLS.has(symbol)` after the boot-time smoke test confirms the cache is populated. Pre-audit §2.8 enumerates every consumer and verifies none cache `size` at module-init.

### §3.5 — MODIFIED `server/config/xstocks-universe.json`

Replaced with a generated-not-hand-edited marker comment. Either: (a) delete entirely + update the one passive-archive subscriber (`b74-universe-loader.ts`) to read from `XSTOCK_SPOT_SYMBOLS` instead; or (b) keep as a generated artifact written by the universe-service on each successful discovery (mirror of the DB state for caller convenience). CC default: **(a) delete entirely** — eliminates the two-source sync invariant problem completely. The B74 passive archive subscriber gets refactored to consume the in-process `XSTOCK_SPOT_SYMBOLS` set instead.

### §3.6 — MODIFIED `server/index.ts`

Boot sequence extended (after the existing null-reason-tracker smoke test from HYGIENE):

```typescript
// B79.0n.UNIVERSE-DISCOVERY boot-time gate: refuse to start if the dynamic
// universe is empty. Fallback chain has 5 layers (live → DB → file cache →
// bootstrap → fail-fast); only the fail-fast layer triggers process.exit(1).
import { xstockUniverseService } from './asset_classes/xstock_spot/universe-service.js';

// Step 1: try DB. Per Langston Q4 diagnostic enhancement: distinguish
// "DB row count zero" (= DB connection failure if seed migration ran) from
// "discovery service never populated" (= different ops response).
const dbInitResult = await xstockUniverseService.initializeFromDB();
//   dbInitResult: { ok: bool, dbReachable: bool, rowCount: number, error?: string }
const universe = await xstockUniverseService.getActiveUniverse();

if (universe.size === 0) {
  if (dbInitResult.dbReachable && dbInitResult.rowCount === 0) {
    // DB reachable but xstock_spot_universe table is empty. Impossible if the
    // seed migration (2026-05-21-b79-0n-universe-discovery.sql) ran (the seed
    // populates 260 rows). This branch = seed never ran OR table was truncated.
    console.error('[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] DB reachable but xstock_spot_universe table empty — seed migration likely never ran. Run `npm run db:migrate` and re-deploy.');
  } else if (!dbInitResult.dbReachable) {
    console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] DB unreachable; attempting FILE_CACHE fallback (layer 3)');
  }
  // Try file-cache fallback (layer 3)
  const fileCacheLoaded = await xstockUniverseService.loadFromFileCache();
  if (!fileCacheLoaded) {
    // Try bootstrap (layer 4)
    const bootstrapLoaded = xstockUniverseService.loadBootstrap();
    if (!bootstrapLoaded) {
      console.error('[CRITICAL][B79.0n.UNIVERSE-DISCOVERY] all 5 fallback layers exhausted; refusing to boot');
      process.exit(1);
    }
    console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] using BOOTSTRAP fallback (layer 4) — discovery service is degraded');
  } else {
    console.warn('[BOOT][B79.0n.UNIVERSE-DISCOVERY] using FILE_CACHE fallback (layer 3)');
  }
}
console.log(`[BOOT][B79.0n.UNIVERSE-DISCOVERY] universe loaded: ${universe.size} symbols (db_reachable=${dbInitResult.dbReachable}, db_rows=${dbInitResult.rowCount})`);
```

### §3.7 — Cron schedule for daily refresh

Add to the same node-cron host as the B-NEW-36 session-lifecycle controller (Langston Q8 ACK — single-host shape is established and working). Schedule: `0 6 * * *` UTC (06:00 daily). Refresh writes to DB, emits universe-update event, all consumers re-cache from DB on next access.

**Grep-able cron log lines (Langston Q8 add — belt-and-suspenders to `scheduled_tasks_audit` recording):**

```
[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh started at <ISO_TS>
[CRON][B79.0n.UNIVERSE-DISCOVERY] daily refresh completed in <duration>ms; symbols=<count>; new=<n_new>; stale=<n_stale>; delisted=<n_delisted>
```

The "started" line + matching "completed" line per day is the silent-failure detector — absence of the pair on any day = cron didn't fire (or process crashed mid-refresh). Trivial to write a daily grep monitor that alerts on missing-pair.

### §3.8 — MODIFIED `server/services/utils/symbol-canonicalizer.ts`

The `KNOWN_NONEXISTENT_NAMES` registry stays (HYGIENE's entry remains valid). When the discovery service detects a symbol that was previously in `KNOWN_NONEXISTENT_NAMES` but now appears in Kraken WS as accepted, log a NOTICE and surface to ops (the symbol got re-tokenized or Kraken added it back). Don't auto-remove from `KNOWN_NONEXISTENT_NAMES` — that registry is documentation; manual cleanup if needed.

### §3.9 — Test infrastructure conversion: exact-equality → range asserts

Update existing tests that assert `size === N`:
- `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts:33` — currently `size === 260`, change to `size >= 100 && size <= 2000`. Comment: HYGIENE landed at 260; UNIVERSE-DISCOVERY makes the universe dynamic; range catches accidental wipe-out without breaking on legitimate growth.
- `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts` — three assertions on `=== 260` similarly converted.

### §3.10 — NEW health endpoint (Langston Q9 #4)

```typescript
// GET /api/internal/universe-discovery/health
// Lightweight diagnostic surface. Doesn't wire to Grafana now but the endpoint
// exists for future monitoring. Single LoC effort, big future-monitoring leverage.
{
  last_successful_run: '2026-05-22T06:00:14Z',     // most recent discovery_runs row with all source-chain ok
  last_attempted_run: '2026-05-22T06:00:00Z',      // most recent discovery_runs row regardless of success
  snapshot_size: 263,                              // XstockUniverseService.getActiveUniverse().size
  sectors_present: 12,                             // distinct non-UNCATEGORIZED sectors in current universe
  source_chain_completeness_pct: {                 // % of universe rows with each source confirmed
    coingecko: 96.5,
    kraken_ws_accept: 100.0,
    finnhub: 88.2,
  },
  is_delisted_count: 5,                            // delisted entries kept in DB but excluded from active universe
  stale_warn_count: 2,                             // 7-30 days last_seen_at
}
```

Auth-protected (internal admin endpoint). Wire to the same auth pattern as `POST /api/internal/universe-discovery/refresh`.

---

## §4 — Unit tests

### §4.1 — Discovery-service tests

- [ ] **`xstock-universe-discoverer.test.ts`** — mock CoinGecko + Kraken WS + Finnhub responses; assert correct upsert behavior; assert override-merge correctness; assert stale-entry flagging (>7 days `last_seen_at`).
- [ ] **Fallback chain tests** — simulate CoinGecko failure / Kraken WS timeout / Finnhub 404 individually + together; assert correct fallback layer activation; assert log messages emitted for each.
- [ ] **Curated-override application tests** — symbol with override: override wins. Symbol without override: Finnhub data wins. Symbol with partial override (only `cryptoAdjacent`): partial merge.

### §4.2 — Universe-service tests

- [ ] **`universe-service.test.ts`** — `initializeFromDB` populates Map+Set correctly; `getActiveUniverse()` returns frozen Set; cache TTL refreshes correctly; `subscribeUniverseUpdates` callback fires on universe-update event.
- [ ] **Boot-time smoke test integration** — universe size > 0 assertion at boot; `process.exit(1)` when all 5 layers exhausted (mock all sources unavailable).

### §4.3 — Backward-compat tests for existing consumers

- [ ] **Consumer compatibility tests** — for each of the 8 production consumers (scanner.ts, xstock-ohlc-cache.ts, price-discontinuity-detector.ts, routes.ts, scripts/b-new-34b-prewarm-snapshot.ts, scripts/b-phase-a2-backfill.ts, scripts/b79-0a-load-test.ts, directional-bias-store.ts) — verify it works with both an empty Map at module-init AND a populated Map after universe-service.initializeFromDB. Establishes that no consumer caches `size` at module-init in a way that breaks dynamic population.

### §4.4 — Range-assert conversions

- [ ] Updated `b-phase-a2-xstock-eval-cycle-dbs.test.ts` + `b79-0n-hygiene-registry-trim.test.ts` use range asserts.
- [ ] NEW assertion: `XSTOCK_SPOT_REGISTRY.size` between 100 and 2000 (sanity range for the live discovery output).

### §4.5 — Integration test (Step 7 verification)

- [ ] **Trigger the full discovery chain on staging post-deploy.** Verify (a) DB table populated, (b) `getActiveUniverse().size > 0`, (c) UI Pipeline Summary shows the new dynamic count, (d) all consumers see the same dynamic Set.

---

## §5 — Acceptance criteria

### §5.1 — Functional gates

1. **DB table created + seeded.** `xstock_spot_universe` table present; row count = 260 (the bootstrap seed from current registry); `xstock_spot_universe_overrides` table present with curation seed (the cryptoAdjacent / adr / sector-override rows).
2. **Universe-service operational.** `XstockUniverseService.initializeFromDB()` returns successfully; `getActiveUniverse().size === 260` immediately post-boot (from the seed).
3. **Discovery service runs successfully end-to-end at least once.** Manual trigger via the admin endpoint produces a `DiscoveryResult` with `coingecko_count > 0`, `kraken_ws_accepted_count > 0`, `finnhub_enriched_count > 0`. The `xstock_spot_universe` table's `source_chain` JSONB shows `{coingecko: true, kraken_ws_accept: true, finnhub: true}` for the majority of rows post-first-discovery.
4. **Daily cron registered + verified.** `scheduled_tasks_audit` table shows a `universe_refresh` task entry after the first daily fire (overnight observation).
5. **Boot-time smoke test passes.** New `[BOOT][B79.0n.UNIVERSE-DISCOVERY] universe loaded: N symbols` log line present in `/var/log/dawntrader/out.log` post-deploy.
6. **`xstocks-universe.json` deleted.** Single source of truth restored. Existing passive-archive consumer (`b74-universe-loader.ts`) refactored to read from `XSTOCK_SPOT_SYMBOLS`. **Pre-deletion verification (Langston Q5 add):** grep all external systems for any out-of-band consumer that reads `xstocks-universe.json` (PM2 ecosystem.config, deploy scripts under `Claude Comms and Packages/`, monitoring configs, anything that might `cat` the JSON outside `server/`). Pre-audit lists every hit + refactors each before the JSON is removed. Worry surface: Grafana datasource configs, cron audit scripts, anything that runs from `/etc/cron.d/` or similar paths.
7. **All eight production consumers continue to function.** Scanner cycles complete without errors; xStocks tab UI renders normally; ARCA-open scanner activity proceeds with the dynamic universe.

### §5.2 — Crypto regression-lock (umbrella §2.2 — per-metric thresholds)

- [ ] FX5 pool size 24h within ±5% (should be unaffected — only xstock_spot side changes)
- [ ] Signal generation rate 24h within ±5% (unaffected)
- [ ] VTS trade rate 24h within ±5% (unaffected)
- [ ] Active trade-open rate within ±1-2 trades/day OR ±15% 7d rolling (active trading still OFF; xstock-side only; should be no impact)

### §5.3 — UI verification (CLAUDE.md §9.3 STAGING-VERIFIED means UI-navigated)

- [ ] Navigate via Claude-in-Chrome to staging xStocks Diagnostics tab. Verify Pipeline Summary shows dynamic-count (still 260 post-deploy until first live discovery completes; 260+ post-first-discovery if Kraken added new tokenizations since the seed).
- [ ] No UI regression on other tabs.

### §5.4 — Discovery-quality gates

- [ ] **Coverage gate.** Post-first-discovery, the DB universe has ≥250 rows (i.e., we haven't lost more than ~10 symbols from the bootstrap seed of 260). Below 250 = discovery failure → rollback.
- [ ] **Sector-floor gate.** Post-first-discovery, ≥7 distinct sectors present (B-PHASE-A2 floor maintained).
- [ ] **Metadata completeness gate.** Post-first-discovery, ≥80% of rows have `finnhub_enriched: true` in source_chain. Lower = Finnhub key missing/quota-exceeded → flag for ops.

---

## §6 — Crypto-regression invariant (umbrella §2.3 — by-construction proof)

**By construction, no part of this batch alters crypto runtime behavior:**

1. **`market-scanner.ts:551-554` crypto-side REST `AssetPairs` call** is not touched. Crypto's auto-discovery from Kraken's live catalog continues unchanged.
2. **`fx5-scanner.ts` crypto-side filter pipeline** is not touched.
3. **No shared utility gets new asset-class-conditional branching.** The discovery service is in a new file under xstock_spot's namespace; the new DB tables are xstock_spot-prefixed; the boot-time smoke test only iterates the xstock_spot universe.
4. **`shared/asset-classes.ts` resolver functions** (`resolveAssetClass`, `safeResolveAssetClass`) keep their existing behavior. The data shape they consume changes (Map literal → DB-populated Map) but the public interface is identical.

§5.2 crypto regression-lock metric checks provide empirical confirmation.

---

## §7 — Deferred follow-ups

Filled in during pre-audit (Step 2). Placeholder structure:

- **Deferred (b):** items the pre-audit decides are not in-scope for this batch but worth tracking. Likely candidates:
  - Phase 25 (crypto_perp) replicates this dynamic-discovery pattern for Kraken Futures (their `derivatives/api/v3/instruments` endpoint is the equivalent of `AssetPairs` — REST list-all available).
  - Investigation: extend CoinGecko query to NON-tokenized-stocks categories for forward-discovery of new tokenization launches before Kraken adopts them.
  - PM2 error log rotation (RUNNING_ISSUES #124 — still open from HYGIENE).
- **Absorbed (c):** any obvious bug-found-in-passing absorbed into this batch with reasoning.
- **Sister-issue spawned:** any pattern surfaced that warrants its own follow-up batch.

---

## §8 — Asset-class onboarding workflow learnings (CLAUDE.md §3.3 — placeholder)

Filled during Step 11 completion report. Expected substantive captures:

- Dynamic universe discovery pattern: when the exchange has no list-all REST endpoint, the three-source chain (aggregator + exchange WS probe + metadata source) is the canonical workaround. Document this in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 0.5 (already proposed in HYGIENE §5(d) #1).
- Curated-override layer: separating "auto-discovered metadata" from "manual curation flags" is itself a reusable pattern. Trading-logic flags (cryptoAdjacent, adr) are inherently project-specific; never assume they're in any external data source. Document the override-table pattern.
- Fallback chain depth: five layers is operationally robust but adds boot-time complexity. The minimum acceptable for next asset class onboarding is 3 (live → DB → fail-fast). Anything between is project-specific.

---

## §9 — Open questions for Langston

### Q1 — CoinGecko category coverage gate

Pre-audit §2.2.b proposes ≥80% overlap between CoinGecko's tokenized-stocks category and our current 260-symbol registry as a gate-before-implementation. If overlap is lower (say 60%), what does that mean? Options: (a) CoinGecko is incomplete → use CoinGecko as one of multiple sources, supplement with S&P 500 backstop in the Kraken WS probe (CC default); (b) abandon CoinGecko entirely and probe Kraken's WS with the full S&P 500 + Russell universe (~2,500 symbols) without aggregator pre-filter; (c) escalate to Kyle for direction. CC default: (a) — CoinGecko is the cheapest source of "what tokenizations exist today" even if incomplete; the WS probe is the authoritative gate. Confirm.

### Q2 — Kraken WS probe candidate set

§2.3.c proposes CoinGecko output + S&P 500 backstop (~500 symbols, ~25s probe). Alternative: CoinGecko + S&P 500 + Russell 2000 (~2,500 symbols, ~2 min probe). The latter catches new tokenizations CoinGecko hasn't picked up yet but adds 95s to the daily run. Confirm S&P 500 is enough or push for broader.

### Q3 — Curated-override table vs JSON file

§2.5.b proposes DB table over JSON file for the override layer. Pros: governance discipline matches module_constants; survives code deploys; per-deploy-env support. Cons: requires a migration to seed; one more thing for new asset class onboarding to set up. JSON-in-git would be lower-friction but harder to audit. CC default: DB table. Confirm.

### Q4 — Boot-fail behavior on discovery exhaustion

§3.6 proposes `process.exit(1)` when all 5 fallback layers exhausted. Alternative: boot with empty universe + log critical error + run with xStock pipeline effectively dormant until discovery recovers. The former is fail-fast loud, the latter is fail-soft. For pre-Phase-19 (active trading OFF), fail-soft might be operationally preferable. For Phase-19+ live trading, fail-fast is safer. Decision: which behavior should we ship NOW, knowing Phase 19 will reconsider? CC default: fail-fast NOW so the operational pattern is established + Phase 19 doesn't have to change behavior under live-trading pressure. Confirm.

### Q5 — `xstocks-universe.json` delete vs keep-as-generated

§3.5 proposes delete entirely; refactor B74 passive-archive consumer to use `XSTOCK_SPOT_SYMBOLS`. Alternative: keep the JSON as a generated artifact written by the universe-service on each refresh — mirror of DB state for downstream consumers that don't want a DB read. CC default: delete entirely. Confirm.

### Q6 — Schema migration coordination with `_migrations` ledger

`_migrations` ledger was reconciled in B-NEW-36 sub-batch (a) (RUNNING_ISSUES #119 RESOLVED). The new `2026-05-21-b79-0n-universe-discovery.sql` migration runs cleanly through `npm run db:migrate`. Confirm CC's approach matches existing pattern: migration file + ledger entry inserted by db:migrate runner + verification in deploy chain.

### Q7 — Phase-19 readiness implication

Once universe-discovery ships, the registry is no longer a "frozen at deploy time" set — it can grow between deploys. Phase 19 live-trading testing will need to handle "new symbol discovered mid-test" gracefully. Does this require any Phase 19 prerequisite work CC should flag now? CC suspects the active-trading path's safety gates (size limits, per-symbol caps) already handle this since they're applied per-trade not per-universe, but want explicit Langston confirmation.

### Q8 — Discovery cron host

§3.7 proposes adding the daily-06:00-UTC cron to the same node-cron host as the B-NEW-36 session-lifecycle controller. Pros: single cron infrastructure surface. Cons: any failure in session-lifecycle controller could mask universe-discovery failure (or vice versa). Alternative: dedicated cron host for universe-discovery, separate failure surface. CC default: same host (single-cron-host shape is established and working). Confirm.

### Q9 — Anything CC missed?

Per umbrella §2.6 combine/split autonomy, Langston welcome to push for restructuring this scope: combining with HYGIENE (already closed; would re-open), splitting Q1+Q2+Q3 design into a separate pre-design sub-batch, or any other reshape.

---

**Reply gate:** **Step 1 ACK** / **specific scope additions/regroupings** / **substantive design disagreement**.

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §12 dispatch-anchoring: this scope file IS the inbox file. Do NOT `cd /mnt/gdrive`. For supplementary repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

— Claude Code, 2026-05-21 PM (B79.0n.UNIVERSE-DISCOVERY Step 1 v1)

---

## §10 — Langston Step 1 ACK + iteration outcomes (2026-05-21 PM)

**Status: Step 1 ACK** on both umbrella v3 restructuring AND UNIVERSE-DISCOVERY scope. Langston concurred on umbrella restructuring with three specific architectural reasons (position #2 over later; STORAGE dependency real; asymmetry with crypto resolved). Two substantive counter-proposes (Q1, Q7) + five scope additions (Q9) — all 11 accepted by CC.

| # | Langston ask | CC outcome | Section landing |
|---|---|---|---|
| Q1 | Drop ≥80% CoinGecko overlap gate; track as diagnostic, warn-at-<50% | ACCEPT | §2.2.b rewritten |
| Q2 | ACK CoinGecko + S&P 500 backstop (not Russell 2000) | ACCEPT | §2.3.c kept as-is |
| Q3 | ACK DB table for override storage | ACCEPT | §2.5.b kept as-is |
| Q4 | Fail-fast + add DB-empty vs discovery-empty distinction | ACCEPT | §3.6 boot sequence reshaped |
| Q5 | ACK delete; add grep-external-systems verification | ACCEPT | §5.1 #6 expanded |
| Q6 | ACK migration ledger pattern; commit extraction script + ON CONFLICT idempotency note | ACCEPT | §3.1 already has ON CONFLICT; extraction script committed alongside per pre-audit |
| Q7 | Add §2.10 Phase 19 readiness pre-audit (3 items) | ACCEPT | §2.10 NEW section added |
| Q8 | ACK same cron host; add grep-able log lines | ACCEPT | §3.7 expanded |
| Q9 #1 | CoinGecko Pro key verification on specific endpoint | ACCEPT | §2.2.a expanded |
| Q9 #2 | discovery_runs audit table | ACCEPT | §3.1 added |
| Q9 #3 | Stale → delisted lifecycle (7d/30d) + is_delisted column | ACCEPT | §3.1 + §3.2 added |
| Q9 #4 | Health endpoint | ACCEPT | §3.10 NEW section |
| Q9 #5 | CoinGecko multi-category union vs single-category decision | ACCEPT | §2.2.a expanded |

**Consensus achieved.** Scope ready for Step 2 pre-audit kickoff.

Verbatim Langston relay at Telegram topic 21 msgs 4050 / 4051 / 4052.

— Claude Code, 2026-05-21 PM (B79.0n.UNIVERSE-DISCOVERY Step 1 v1 + ACK iteration outcomes)
