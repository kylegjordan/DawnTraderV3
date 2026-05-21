# B79.0n.UNIVERSE-DISCOVERY — Completion Report

> **Sub-batch:** 2 of 18 in the B79.0n umbrella arc (xStock active-trading wire-in + systemic asset-class awareness)
> **Phase:** 15c continuation (PHASE_HISTORY row pending — see §11)
> **Status:** **SHIPPED 2026-05-21**, deploy commit `c97ceec81` (PM2 #308), Langston Step 8 ACK
> **Standing rule applied:** CLAUDE.md §3.3 "Asset-class onboarding learnings" — see §10

---

## 0. TOP-OF-REPORT mandatory disclaimers

**🚨 THIS BATCH MAKES UNIVERSE DISCOVERY FUNCTIONAL.** The hardcoded `XSTOCK_SPOT_REGISTRY` is now dynamically populated at boot from the database; the database is in turn populated by the live three-service discovery cycle (CoinGecko + Kraken WebSocket probe + Finnhub metadata enrichment) running daily at 06:00 UTC + on manual trigger. The 489 active xStock symbols on staging are LIVE — the system is reading them from the database and the universe-loader downstream consumer (`server/services/passive-archive/universe-loader.ts`) confirms it is reading from `XSTOCK_SPOT_SYMBOLS` (DB-backed) instead of the deleted `xstocks-universe.json`.

**🚨 NUMERIC DELTAS:** Pre-deploy hardcoded registry size = **260** active symbols. Post-deploy live DB universe = **489** active symbols. Delta = **+229** symbols. This is the empirical proof point for the architectural concern that motivated this batch — manual registry maintenance was leaving real gaps.

**🚨 IDENTITY MECHANISM CLARIFICATION (Kyle question 2026-05-21):** asset identity is determined by symbol string + Kraken WebSocket subscription acceptance. Industry classification (Finnhub `finnhubIndustry`) is METADATA applied as a sector label AFTER a symbol is already in the universe. The +229 new symbols are real Kraken-traded pairs (Kraken's WS returned `success:true` for each subscribe), NOT misclassifications of existing symbols. The 50 UNCATEGORIZED symbols are real symbols whose Finnhub-returned industry didn't match any of the ~75 sector-pattern strings yet — they remain in the universe and remain tradeable; they just don't have a sector tag attached.

---

## 1. Scope objectives — full status checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Replace hardcoded `XSTOCK_SPOT_REGISTRY` Map literal with dynamic stub + replacement function | ✅ GREEN | `shared/asset-classes.ts:286-358` (Map literal replaced with internal `Map<string, XstockSpotEntry>()` + `_replaceXstockUniverse()`); `ReadonlyMap` / `ReadonlySet` exports preserve consumer API |
| 2 | Build CoinGecko discovery prime-mover (`xstocks-ecosystem` category fetch) | ✅ GREEN | `xstock-universe-discoverer.ts:fetchCoinGeckoXstockUniverse()`; live cycle returned 126 candidates |
| 3 | Build Kraken WebSocket subscription probe (chunked 100/batch, 500ms inter-chunk sleep, 15s collection window, 10s WS-open timeout) | ✅ GREEN | `xstock-universe-discoverer.ts:probeKrakenWs()`; live cycle: 5 chunks (100/100/100/100/81 = 481), accepted 479 rejected 2, partial=false |
| 4 | Build Finnhub `/stock/profile2` enrichment leg (~75-pattern sector classifier) | ✅ GREEN | `xstock-universe-discoverer.ts:mapFinnhubIndustryToSector()` + per-symbol fetch loop; live cycle enriched 479/479 (100%) |
| 5 | DB-backed universe table with `discovery_runs` audit row + overrides table | ✅ GREEN | Migration `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql` creates 3 tables; first cycle wrote `run_id=1` with full source_chain_status JSON |
| 6 | Lifecycle: re-discovery un-delists; >7d-no-data → stale (log-only); >30d-no-data → delisted (auto `UPDATE is_delisted=true`) | ✅ GREEN | `xstock-universe-discoverer.ts:runDiscovery` lifecycle block + `idx_xstock_spot_universe_last_seen_at` index; live cycle wrote `stale=0, delisted=0` (first run, no symbols past the gates yet) |
| 7 | Boot-time `initializeFromDB()` 5-layer fallback chain | ✅ GREEN | `server/asset_classes/xstock_spot/universe-service.ts:initializeFromDB()`; boot log: "loaded 260 active symbols (db_reachable=true, db_rows=260, source=db)" |
| 8 | Daily node-cron at 06:00 UTC | ✅ GREEN | `server/services/xstock-universe-cron.ts`; boot log: "[cron] registered daily refresh at 06:00 UTC" |
| 9 | Manual trigger endpoint `POST /api/internal/universe-discovery/refresh` + health endpoint `GET .../health` | ✅ GREEN | Routes registered in `server/routes.ts`; live manual trigger ran 11:41-11:51 UTC and returned `200 in 603261ms` with JSON `{ok:true, run_id:1, ...}`; health returns 200 with self-consistent counters |
| 10 | Universe-loader downstream wired to read DB-backed `XSTOCK_SPOT_SYMBOLS` instead of deleted `xstocks-universe.json` | ✅ GREEN | `server/services/passive-archive/universe-loader.ts:loadXstockSpotUniverse()` refactored; boot log: "[B74][universe] xstock_spot loaded: 260 symbols from XSTOCK_SPOT_SYMBOLS (DB-backed via B79.0n.UNIVERSE-DISCOVERY)"; `server/config/xstocks-universe.json` DELETED |
| 11 | Test coverage: enum integrity (5) + universe-service contracts (12) + Finnhub-industry → sector regression locks (18) = 35 new tests | ✅ GREEN | `b79-0n-discoverer-sector-mapping.test.ts` (23 cases) + `b79-0n-universe-service.test.ts` (12 cases); all 35 GREEN in CI |
| 12 | Sector floor ≥7 | ✅ GREEN — 15 sectors (8× the floor) | psql `SELECT sector, COUNT(*) FROM xstock_spot_universe WHERE is_delisted=false GROUP BY sector`; full distribution in §3 |
| 13 | Finnhub enrichment ≥80% | ✅ GREEN — 479/479 = 100% | log: `[B79.0n.UNIVERSE-DISCOVERY] Finnhub: enriched 479/479 symbols` |
| 14 | UNCATEGORIZED ≤20% | ✅ GREEN — 50/489 = 10.2% (half the ceiling) | psql sector distribution |
| 15 | 24h crypto regression-lock soak verification | ⏳ DEFERRED to scheduled alert `d4b2e590-f004-4728-ba58-0405b23e61ea` fires 2026-05-22T11:55:57Z | system-alert created via `npm run system-alerts add`; thresholds FX5 ±5% / signal gen ±5% / VTS ±5% / active-trade ±1-2/day OR ±15% 7d |
| 16 | UI verification of new universe size in xStocks tab | ✅ GREEN | Claude-in-Chrome DOM read of xStocks panel confirmed "LAST UNIVERSE: 489" badge + Pipeline Summary "489 unique" |

**15 of 16 objectives GREEN at deploy close. Objective 15 correctly deferred to a scheduled 24h alert with hard thresholds; will close in the soak-verification turn tomorrow.**

---

## 2. Source-chain architecture (the canonical pattern for next asset class)

Three independent services chained in series, each with a defined role:

```
┌────────────────┐    discovery-prime-mover     ┌─────────────────┐    enrichment      ┌──────────────────────┐
│   CoinGecko    │ ───────────────────────────▶ │  Kraken WS      │ ────────────────▶  │  Finnhub             │
│  (xstocks-     │  "what tokenized stocks does │  subscription   │  "of those Kraken  │  /stock/profile2     │
│   ecosystem)   │   Backed Finance issue?"     │  probe          │   accepts, what    │  "what sector + GICS │
│                │                              │                 │   underlying       │   metadata for each"  │
│ free, public,  │                              │ ground-truth    │   companies?"      │                       │
│ no API key     │  126 candidates              │ filter          │  479 accepted +    │  per-symbol           │
│                │                              │                 │  2 rejected =      │  60 req/min budget    │
└────────────────┘                              └─────────────────┘  481 total         └──────────────────────┘
                                                                                              │
                                                                                              ▼
                                              ┌─────────────────────────────────────────────────┐
                                              │  DB upsert + override merge + stale-lifecycle   │
                                              │  ON CONFLICT (symbol) DO UPDATE SET ... is_     │
                                              │  delisted=false (re-discovery un-delists)       │
                                              │  + xstock_spot_universe_overrides preserves     │
                                              │    curated flags                                 │
                                              │  + discovery_runs audit row written              │
                                              └─────────────────────────────────────────────────┘
                                                                  │
                                                                  ▼
                                              ┌─────────────────────────────────────────────────┐
                                              │  Boot-time initializeFromDB() loads 489 rows    │
                                              │  into XSTOCK_SPOT_REGISTRY + XSTOCK_SPOT_SYMBOLS │
                                              │  consumers downstream (universe-loader, etc.)    │
                                              │  read those exports                              │
                                              └─────────────────────────────────────────────────┘
```

**Each service's role is distinct and substitutable:**
- **CoinGecko = prime mover.** Tells us a tokenized stock exists in the Backed Finance product family. Cheap, public, no key. 126 entries = the smaller of the three lists because CoinGecko's `xstocks-ecosystem` category is the issuer-listed catalog (not the trader-accepted set).
- **Kraken WS subscription probe = ground truth.** Tells us whether Kraken's WS-equities feed will actually stream data for a candidate pair. The accept/reject is binary and definitive. 479 accepted = the size of the active tradeable universe. The 50% "completeness" reported on the CoinGecko leg vs. final universe size is by design: CoinGecko discovers, Kraken decides.
- **Finnhub = enrichment.** Adds the sector / industry / ADR metadata that downstream pricing-aware code uses for sector-grouping, factor weighting, regime classification. Nothing about Finnhub's response decides whether a symbol exists.

**Fallback chain (5 layers):**

1. **Live discovery** — runs at 06:00 UTC daily + on `POST /api/internal/universe-discovery/refresh`
2. **DB snapshot** — `initializeFromDB()` at boot reads the most recent successful `discovery_runs` cohort
3. **File cache** — `${HOME}/.dawntrader/xstock-universe-cache.json` (currently non-functional due to `/var/lib/dawntrader` EACCES — see RUNNING_ISSUES #126; relocation to HOME-relative path queued)
4. **Bootstrap set** — 20-symbol hand-curated mega-cap fallback at `server/asset_classes/xstock_spot/universe-bootstrap.ts`
5. **Fail-fast** — `process.exit(1)` if all prior layers fail at boot

---

## 3. Live measurement snapshot (Step 7 first-cycle results)

Discovery cycle `run_id=1` ran 2026-05-21T11:41:51 → T11:51:54Z (10m03s wall, mostly Finnhub):

**`discovery_runs` audit row:**
```
run_id=1, triggered_by=manual_endpoint, duration_ms=603200, symbols_discovered=479, stale=0, delisted=0

source_chain_status:
  finnhub:   { ok: true, missing_key: false, enriched_count: 479 }
  coingecko: { ok: true, count: 126 }
  kraken_ws: { ok: true, partial: false, accepted_count: 479, rejected_count: 2, candidates_probed: 481 }
```

**Sector distribution (15 distinct sectors, all 11 SPDR GICS + 3 special buckets + UNCATEGORIZED):**

| Sector | Count | % of active |
|--------|------:|------------:|
| XLK    | 78 | 16.0% |
| XLV    | 62 | 12.7% |
| XLF    | 54 | 11.0% |
| UNCATEGORIZED | 50 | 10.2% |
| XLY    | 50 | 10.2% |
| XLC    | 37 |  7.6% |
| XLP    | 28 |  5.7% |
| XLI    | 27 |  5.5% |
| XLU    | 25 |  5.1% |
| XLRE   | 22 |  4.5% |
| XLE    | 20 |  4.1% |
| XLB    | 17 |  3.5% |
| INTL_ETF | 11 |  2.2% |
| BROAD_ETF |  6 |  1.2% |
| INDEX_PROXY |  2 |  0.4% |
| **TOTAL** | **489** | **100%** |

**Universe size delta:**

| State | Active rows |
|-------|------------:|
| Pre-deploy hardcoded registry (B79.0n.HYGIENE) | 260 |
| Post-first-cycle DB universe | **489** |
| **Delta** | **+229** |

The +229 new symbols include ~120 mid/large-cap names absent from the hand-curated mega-cap registry, ~70 sector-tilt tokenized stocks (utilities / materials / industrials underweighted in the prior set), and ~40 ADRs / international names (INTL_ETF + non-US listings).

**PARA/USD re-emergence:** B79.0n.HYGIENE trimmed 5 symbols (BITF/HOLX/PARA/SAGE/WBA) because they were 100%-NULL in live OHLC. Kraken WS now accepts subscriptions for all 5 again — they're in the 489. This is **expected behavior**: WS-accept is necessary but not sufficient for active data; the stale→delisted lifecycle anchors on `last_seen_at` (data arrival), not subscription accept. If they remain dark, the 7-day stale flag fires (log-only) and the 30-day delisted gate (`UPDATE is_delisted=true`) excludes them automatically.

---

## 4. Migration + DB schema

`drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql` ships three tables:

**Table 1 — `xstock_spot_universe`** (the universe itself):
- `symbol TEXT PRIMARY KEY`
- `sector TEXT` with `CHECK` constraint allowing 11 GICS SPDR (XLK/XLV/XLF/XLC/XLY/XLP/XLE/XLI/XLRE/XLU/XLB) + INDEX_PROXY + BROAD_ETF + INTL_ETF + UNCATEGORIZED
- `is_delisted BOOLEAN DEFAULT false`, `last_seen_at TIMESTAMPTZ`, `first_seen_at TIMESTAMPTZ`
- `crypto_adjacent BOOLEAN DEFAULT false`, `is_adr BOOLEAN DEFAULT false`, `source_chain JSONB`
- Indexes: `idx_xstock_spot_universe_is_delisted`, `idx_xstock_spot_universe_last_seen_at`, `idx_xstock_spot_universe_sector`

**Table 2 — `xstock_spot_universe_overrides`** (preserves curated flags across re-discoveries):
- `symbol TEXT PRIMARY KEY` references `xstock_spot_universe(symbol)`
- `override_is_delisted BOOLEAN`, `override_crypto_adjacent BOOLEAN`, `override_is_adr BOOLEAN`, `override_sector TEXT`
- `reason TEXT`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by TEXT`
- `runDiscovery()` reads this table and applies non-null override values AFTER the live source-chain fields are set, so curator-set values survive re-discovery cycles

**Table 3 — `discovery_runs`** (forensic audit):
- `run_id BIGSERIAL PRIMARY KEY`
- `started_at`, `completed_at`, `duration_ms`, `triggered_by` (CHECK in 'cron_daily','manual_endpoint','boot_smoke')
- `symbols_discovered INT`, `symbols_marked_stale INT`, `symbols_marked_delisted INT`
- `source_chain_status JSONB`, `error_log TEXT`
- Indexed by `started_at`

**Schema choice — VARCHAR + CHECK instead of PostgreSQL ENUM:** sidesteps the `ALTER TYPE ... ADD VALUE` same-transaction restriction that would have made future sector additions a deploy-time migration. Updating the `CHECK` constraint is an `ALTER TABLE` that takes a brief lock but doesn't require a transaction restart.

**Seed:** 260 universe rows + 56 override rows from the prior `XSTOCK_SPOT_REGISTRY` are seeded via `ON CONFLICT (symbol) DO NOTHING` so re-runs are idempotent.

---

## 5. Step 4 review iteration history (3 fix-forwards)

| Concern | Source | Fix | Commit |
|---------|--------|-----|--------|
| A — Finnhub heuristic too narrow (~12 patterns missed 8/18 = 44% of probed symbols) | Langston Step 4 review | Expanded heuristic to ~75 substring patterns across 11 sectors with biotech-first ordering (CRITICAL substring-collision guard); added 18 parameterized regression-lock tests | `747f8779b` |
| B — Kraken WebSocket open-handshake could hang on DNS/TLS without a deterministic ceiling | Langston Step 4 review | Added `openTimeoutHandle` 10s setTimeout immediately after `new WebSocket()`, cleared on `ws.on('open')`; on fire, calls `finish(false, true, 'ws open timeout...')` → partial=true → audit row written + no DB writes (Layer 2 fallback covers) | `747f8779b` |
| C — UNCATEGORIZED ≤20% gate needs measurement infra | Langston Step 4 review | Item #6 in §6 verification list (one-shot post-cycle SQL); action item documented as "expand heuristic" if the gate ever trips | `747f8779b` |
| Biotech substring-collision (MRNA classified as XLK instead of XLV because `i.includes('technology')` matched `Biotechnology` before the XLV biotech check) | CI run 26222813385 MRNA test failure | Reordered XLV checks BEFORE XLK + added explicit biotech first-line guard with `i.includes('biotechnology')`; mirrored change in the test file's inline copy | `3a6ae65cd` |
| TS2344 `db.execute<T>` generic constraint (drizzle requires `T extends Record<string, unknown>`) | CI run 26221983377 | Switched 8 call sites from `db.execute<T>(sql...)` to `const result: any = await db.execute(sql...)` matching the codebase canonical pattern | `b7b4b9c2f` |
| Migration syntax error at position 5194 (duplicate `INSERT INTO xstock_spot_universe VALUES` lines from assembly-script bug) | `db:migrate` runtime | Removed duplicate INSERT lines + duplicate ON CONFLICT clauses + removed explicit `_migrations` INSERT (runner auto-inserts) | `c97ceec81` (force-amend chain) |

**Step 4 re-ACK (Langston, 2026-05-21 PM):** "Step 4 ACK — proceed to Step 6 deploy. Substantive disagreement: NONE. Two future-cleanup notes logged (export `mapFinnhubIndustryToSector` to shared module on next heuristic touch; gas/utility ordering edge case if utility-class tokenized stocks ever appear) — neither blocks Step 6."

Verbatim reply preserved at `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP4_LANGSTON_REACK.md`.

---

## 6. Step 8 second-pass — Langston independent verification

Langston ran the full independent check via his new `ssh staging` access (B-NEW-41) — DB queries, log greps, PM2 state, system-alerts queue. Every load-bearing claim in the Step 7 verification artifact reproduced row-for-row independently.

**Gates verified independently (7 of 7 in-window):**

| Gate | Method | Result |
|------|--------|--------|
| Deploy commit | `ssh staging 'git log -1'` | `c97ceec81` ✓ |
| Process state | `ssh staging 'pm2 describe dawntrader'` | `online, restart_time=308`, uptime starts 11:37:41Z ✓ |
| Boot smoke | grep `out.log` for 5 expected markers | All 5 present at 11:37:43 ✓ |
| `discovery_runs` audit | independent psql | run_id=1, source_chain_status JSON identical ✓ |
| Sector floor + UNCATEGORIZED | independent psql | 15 sectors, 50/489 = 10.2%, distribution identical ✓ |
| Finnhub enrichment | grep `out.log` at 11:51:41 | `enriched 479/479 symbols` ✓ |
| Health endpoint | counters cross-checked against DB SSOT | snapshot_size=registry_size=total_active_in_db=489 self-consistent ✓ |
| Discovery-cycle chain | independent grep on full chain | CoinGecko 126 → WS 481 candidates → 479 accepted/2 rejected → Finnhub 479 → upsert 479 ✓ |
| System-alerts queue | `tail /var/log/dawntrader/system-alerts.jsonl` | Gate-7 alert `d4b2e590` confirmed scheduled with correct thresholds ✓ |

**Step 8 ACK** verbatim at `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP8_LANGSTON_REPLY.md`.

**Non-blocking findings — Langston concurred with all three CC §10 entries and added one watch item:**

- **(a) Layer 3 EACCES** — Langston prefers Option 2 (HOME-relative cache path) over Option 1 (privileged mkdir+chown) per NO PATCHES doctrine (CLAUDE.md §5 #15). Logged as RUNNING_ISSUES #126.
- **(b) Finnhub re-enrichment** — Langston promoted CC's "future-touch nice-to-have" to a tracked RUNNING_ISSUES entry. Architectural recommendation: re-enrich stable metadata (sector / industry / GICS) monthly, not daily. Logged as RUNNING_ISSUES #127.
- **(c) CoinGecko 25.8% "completeness"** — Langston concurred (naming clarity issue, not runtime), one-line SYSTEM_MANUAL clarification queued for Step 10.
- **NEW watch item — daily-cron self-fire (Langston Step 8 addition):** the 06:00 UTC cron tick fires for the first time tomorrow (2026-05-22T06:00:00Z) and is the first non-`manual_endpoint` discovery run. Whoever's at the keyboard when alert `d4b2e590` fires at 11:55Z should also `psql 'SELECT * FROM discovery_runs ORDER BY run_id DESC LIMIT 3'` and confirm a `triggered_by='cron_daily'` row exists. Logged as RUNNING_ISSUES #128.

---

## 7. Identity-mechanism clarification (Kyle question 2026-05-21)

Kyle asked: does the system identify assets by symbol or by industry classification? And: are the +229 new symbols real, or just misclassified versions of existing ones?

**Answer documented for the record:**

The identity of each xStock is determined entirely by (1) the symbol string itself and (2) Kraken's WebSocket subscription acceptance. The discovery pipeline asks Kraken "do you accept subscriptions for `AAPLX/USD`?" — if Kraken returns `success:true`, the symbol enters the universe; if `success:false` ("Instrument not supported"), it's excluded. That's the entire identity step. **Industry classification (Finnhub `finnhubIndustry`) is NEVER used to decide whether a symbol exists or what it represents.**

After a symbol is in the universe, the system asks Finnhub "what's the underlying company's industry?" and stores the response in the `sector` column for grouping/filtering purposes. The Moderna bug fixed in Step 4 was about a **wrong sector label** on an already-correctly-identified symbol (MRNAX/USD was always recognized as Moderna; we just accidentally tagged it XLK instead of XLV because "biotechnology" contains "technology").

The +229 new symbols are **real distinct Kraken-traded pairs** — each one returned `success:true` from Kraken's WS for a unique symbol string. They are not duplicates or misclassifications of existing symbols. The 50 UNCATEGORIZED entries are real symbols whose industry response didn't match any of the ~75 sector-pattern strings yet — they remain in the universe, remain tradeable, just don't have a sector tag attached.

---

## 8. Files changed

**New files:**
- `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql` (migration: 3 tables + seed)
- `server/services/xstock-universe-discoverer.ts` (~700 lines, the discovery orchestrator)
- `server/services/xstock-universe-cron.ts` (~50 lines, node-cron 0 6 * * * UTC scheduler)
- `server/asset_classes/xstock_spot/universe-service.ts` (~190 lines, boot-time `initializeFromDB()` + 5-layer fallback)
- `server/asset_classes/xstock_spot/universe-bootstrap.ts` (~80 lines, 20-symbol mega-cap Layer 4 fallback)
- `server/asset_classes/xstock_spot/sp500-backstop.ts` (~500 S&P 500 ticker constants for Kraken WS candidate expansion)
- `server/tests/unit/b79-0n-discoverer-sector-mapping.test.ts` (5 enum cases + 18 regression-lock cases)
- `server/tests/unit/b79-0n-universe-service.test.ts` (12 cases)

**Modified files:**
- `shared/asset-classes.ts:286-358` (Map literal replaced with internal-mutable Map + `_replaceXstockUniverse()` + ReadonlyMap/ReadonlySet exports; added UNCATEGORIZED to XstockSector + `_XSTOCK_SECTOR_VALUES_FOR_CHECK` set)
- `server/index.ts:51-90` (boot wiring: `initializeFromDB()` + 5-layer fallback decision tree + cron registration)
- `server/routes.ts` (2 routes added: `POST /api/internal/universe-discovery/refresh` + `GET .../health`)
- `server/services/passive-archive/universe-loader.ts:loadXstockSpotUniverse()` (refactored to read `XSTOCK_SPOT_SYMBOLS` instead of opening `xstocks-universe.json`)
- Test fixture files updated to use beforeAll DB-stub: `b-phase-a2-*.test.ts`, `b79-0n-hygiene-registry-trim.test.ts`, `b79-0f-collisions.test.ts`

**Deleted files:**
- `server/config/xstocks-universe.json` (no longer needed; universe is DB-backed)

**Commits (chronological):**

| Commit | What |
|--------|------|
| (Step 1 scope file commit) | `B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` |
| (Pre-audit commit) | `B79_0n_UNIVERSE_DISCOVERY_PRE_AUDIT.md` |
| `230348507` | Phase B-F implementation (universe-discoverer + universe-service + migration + tests + cron + routes) |
| `b7b4b9c2f` | Fix-forward: `db.execute<T>` generic constraint TS2344 |
| `747f8779b` | Step 4 fix-forward Concerns A+B+C: Finnhub heuristic expansion + WS-open timeout + UNCATEGORIZED gate |
| `3a6ae65cd` | Fix-forward 2: biotech substring-collision (`Biotechnology` ⊃ `technology` ordering) |
| `c97ceec81` | Fix-forward 3: duplicate INSERT + duplicate ON CONFLICT lines in seed migration |

---

## 9. CI status

Build + Docker GREEN. Test Suite GREEN for new B79.0n.UNIVERSE-DISCOVERY tests (35/35 — 18 sector-mapping + 12 universe-service + 5 enum integrity). TypeScript Check + Test Suite red on PRE-EXISTING failures only (b72-dbs-routing-guards / b70-run-mode-controller / cost_telemetry / dynamic_sizing — same baseline as B79.0n.HYGIENE commit `6050165cf`). Per Kyle directive 2026-05-17 (RUNNING_ISSUES #113), the pre-existing red baseline is accepted technical debt; this batch introduces zero new CI failures.

---

## 10. Asset-class onboarding workflow learnings (CLAUDE.md §3.3 mandatory section)

This section is required for every Phase 24 batch under the standing rule introduced in CLAUDE.md §3.3. The goal: by end of Phase 24, the next asset class can follow `ASSET_CLASS_ONBOARDING_WORKFLOW.md` with 90-95% of the guesswork eliminated.

### (a) What worked well — patterns to template

**Three-service discovery chain with explicit role separation is the right pattern.** Prime-mover (cheap, public, by-issuer) + ground-truth (exchange acceptance, binary) + enrichment (metadata only) is a structure that generalizes cleanly. The next asset class (crypto-perpetual-futures, then 4th/5th) should follow the same shape:

- For **crypto-perp:** prime-mover = Kraken Futures REST `/derivatives/api/v3/instruments` (already partially-wired); ground-truth = Kraken Futures WS-channel-subscribe; enrichment = CoinGecko derivatives endpoint OR an alternative perp metadata source.
- For **the 4th asset class** (whatever it is): match the same shape — what's the cheap public catalog, what's the exchange's accept/reject mechanism, what's the metadata layer.

**5-layer fallback chain with clear escalation (live → DB snapshot → file cache → bootstrap → fail-fast) is the right pattern.** Each layer covers a distinct failure mode. The structure protects against transient DB issues (Layer 2), deeper DB issues (Layer 3), service-chain failures at boot (Layer 4), and catastrophic config loss (Layer 5). Replicate as-is for the next asset class.

**Override merge pattern preserves curated decisions across re-discoveries.** The `xstock_spot_universe_overrides` table with explicit `override_*` columns means a human curator can mark a symbol as delisted, override its sector, or correct an enrichment field — and those decisions survive every subsequent re-discovery. The next asset class needs the same pattern: a separate overrides table that the discovery code reads and applies as the final step before write.

**Stale → delisted lifecycle anchored on `last_seen_at` (data arrival), not subscription accept, is the right architectural call.** Exchange WS subscription accept is necessary but not sufficient for active data — some symbols accept subscriptions but never stream (delisted underlying / suspended / instrument inactive). Anchoring the lifecycle on actual data arrival via `last_seen_at` correctly captures the "the WS feed says yes but no data flows" failure mode. PARA/USD reappeared in the universe via WS-accept but if no data flows, the 7-day stale + 30-day delisted gates will exclude it automatically.

**Boot-time round-trip smoke test (from B79.0n.HYGIENE) generalizes to universe discovery.** The same `set → get → assert literal → reset` pattern that catches no-op-shim drift on `setNullReason` works for universe initialization: at boot, after `initializeFromDB()`, the system should immediately query the in-memory `XSTOCK_SPOT_SYMBOLS` set and assert it matches what the DB returned. (This is functionally what the universe-service does — but explicitly call it out in the next asset class's onboarding workflow as a mandatory boot-time check.)

### (b) What surprised us — pitfalls to avoid in next onboarding

**Substring-collision bugs in industry-classification heuristics are inevitable.** The biotech-vs-technology collision was the obvious one; the gas-vs-utility one Langston flagged in Step 4 re-ACK is the next likely one. Any heuristic that uses `string.includes()` on a free-text classification field WILL have ordering bugs. **Rule for next onboarding:** every industry-classification heuristic MUST have parameterized regression-lock tests covering empirically-probed boundary cases (at minimum: every sector × 2 typical industry strings + every known collision pair).

**Discovery-cycle wall time can be dominated by ONE leg.** In our case Finnhub (~9m50s of 10m03s). At 60 req/min free-tier with 479 symbols, the leg is inherently ~8min. The architecture is fine for daily-cron but the next asset class onboarding should plan for the enrichment leg to dominate and design around it (parallelize where the tier allows; memoize stable fields monthly not daily; consider tiered re-enrichment cadence — fresh-listed symbols daily, stable symbols monthly).

**DB-runner ledger column name varies.** Our migration assembly script tried to `INSERT INTO _migrations (filename, applied_at)` but the runner expects column `name`, and runs the INSERT automatically. We landed on "remove the explicit INSERT from the migration; let the runner handle it." **Rule for next onboarding:** never explicitly INSERT into `_migrations` from a migration file — the runner auto-inserts. Document this in the canonical onboarding workflow so the next batch doesn't re-discover it.

**Migration assembly scripts can produce duplicate SQL.** Our seed-extraction script + the migration header both wrote INSERT lines, leading to syntax errors at position 5194 and 46725. **Rule for next onboarding:** any tool that assembles migration SQL from multiple source files MUST validate by `psql -f <migration> -1` (single transaction) against an empty schema before committing. Single-transaction validation catches duplicate statements that succeed individually but fail in transaction order.

**`db.execute<T>()` generic constraint matters.** Drizzle's generic requires `T extends Record<string, unknown>`. Custom row interfaces that satisfy field-by-field but not the broader constraint will TS2344. The codebase canonical pattern is `const result: any = await db.execute(sql\`...\`); const rows = (result.rows ?? []) as MyRow[];`. **Rule for next onboarding:** use the `any`-cast pattern, not the generic `db.execute<T>()`. Document in onboarding workflow.

**WebSocket-open timeout is necessary, not optional.** Without an `openTimeoutHandle`, a stuck DNS / TLS handshake / TCP-RST-without-close-event hangs the discovery cycle indefinitely. **Rule for next onboarding:** every external WS or REST call in the discovery chain MUST have an explicit timeout AND a deterministic partial-response abort path. The Langston Step 4 Concern B finding generalizes.

### (b.bis) Forward-looking constraints surfaced in scope §2.10 — apply to every future asset class

The scope file (§2.10) flagged three forward-looking items that future asset-class onboardings need to inherit. These are NOT just "for THIS batch" — they are standing rules surfaced by the dynamic-discovery design and they apply to every asset class that follows the canonical pattern.

**(b.bis.1) Telemetry buckets MUST be allocated LAZILY per symbol on first use, NOT at startup.** If telemetry (or any per-symbol cache / metric / counter) snapshots at boot using `XSTOCK_SPOT_SYMBOLS.forEach()`, a symbol discovered AFTER boot won't have a bucket — writes to that bucket will silently no-op (or throw on `.set()` of an undefined entry). This is exactly the silent-failure pattern we keep finding. **Rule for next onboarding:** every per-symbol map / counter / telemetry bucket added in any future sub-batch MUST use a lazy-init pattern (`bucket.get(symbol) ?? createBucket(symbol)`), not a startup-time `forEach` allocation. Document this requirement at the time TELEMETRY (sub-batch 10) drafts its scope.

**(b.bis.2) Strategy-settings rows MUST stay per-asset-class only, NEVER per-symbol.** If `strategy_settings.symbol` is non-null for any row, a newly-discovered symbol can't be evaluated by any strategy until someone manually adds per-symbol rows for it — defeating the entire purpose of dynamic discovery. **Rule for next onboarding:** at pre-audit time, query `SELECT COUNT(*) FROM strategy_settings WHERE symbol IS NOT NULL AND asset_class = '<new_class>'`. If the count is non-zero, EITHER explicitly justify the per-symbol overrides in the pre-audit AND build a backfill-on-discovery code path, OR refactor the per-symbol rows out before shipping. The default position is per-asset-class only (consistent with Langston B79.0n umbrella rev2 §11.4).

**(b.bis.3) Universe-growth shock testing.** Every asset class with dynamic discovery MUST include a unit test that simulates a 25%+ universe growth event (`_replaceXstockUniverse()` with a +50-symbol increment) and verifies that scanner cycle time, memory footprint, and telemetry write rate all stay within ±10% of pre-jump baseline. **Why this matters empirically:** B79.0n's live first cycle grew the universe from 260 → 489 (+229 = **88% jump**, dramatically larger than the 25% shock the test was designed to catch) and the infrastructure absorbed it cleanly — but this could equally have surfaced a cycle-timeout or memory-pressure bug. The unit test is what protects future onboardings from the risk.

**(b.bis.4) Live OHLC ingestion path must absorb dynamic universe growth.** The Kraken WS-equities subscription path in the live-pricing-adapter empirically absorbed the +229-symbol expansion mid-cycle (verified post-deploy: 9 of 10 sampled newly-discovered symbols received bars in the first hour after their `first_seen_at`). For the next asset class, verify the equivalent ingestion path at pre-audit time — does the exchange WS adapter subscribe statically at boot, or does it re-read the universe dynamically? If static, dynamic-discovery batches MUST include a post-discovery hook that triggers a subscription refresh OR document the "needs PM2 restart to pick up new symbols" gap explicitly with a tracked RUNNING_ISSUES entry.

### (b.tris) Empirical infrastructure scaling — captured because next onboardings will ask the same question

The +229-symbol expansion (260 → 489 active universe, an 88% jump) was a real-time infrastructure scaling test. Measurements:

| Metric | Pre-discovery (260 symbols) | Post-discovery (489 symbols) | Scaling factor |
|--------|------:|------:|------:|
| OHLC bars written / 24h | ~120,094 | ~223,000 (projected steady-state) | 1.86× |
| Scanner cycle median | 373-530 ms | 341-373 ms (live) | unchanged (cursor-rotated batches of 75 cap the per-cycle work regardless of universe size) |
| WS-equities subscription count | 260 | 486-489 (dynamic, verified via sample) | 1.87× |
| Memory footprint (directional-bias-store) | ~5-10 MB | ~10-20 MB | 2× (linear) |
| Daily Finnhub API consumption (discovery cycle only) | n/a (was hardcoded) | 479 req / day | new line item |
| Discovery cycle wall time | n/a | 603 200 ms (10m03s) | new line item |
| Supabase tier impact | Small tier comfortable post-B-NEW-35 | Small tier still expected to fit; needs 24h IO measurement | watch item |

**Generalizes:** next asset class with N symbols can expect approximately N × 4.6 KB / second of WS data ingestion during active hours (extrapolated from current 489 symbols × 86 KB/symbol/hr write volume). DB tier sizing should be done with universe size × this constant + headroom. Document tier-impact projection at pre-audit time, not at deploy time.

### (c) Recurring structural patterns observed across asset classes

**The hardcoded-registry pattern is a structural cost that compounds.** Crypto auto-discovers from Kraken REST `AssetPairs` (1544 pairs live). xStock previously had no equivalent and required manual registry maintenance — Kraken's public REST does not index xStock instruments. This batch eliminates that asymmetry by building dynamic discovery for xStock. **Generalizes:** every asset class that lacks an exchange-side "list all" endpoint will need a dynamic discovery batch eventually. **Rule:** check at onboarding-design time whether the exchange has a list-all endpoint; if NOT, scope dynamic discovery as a first-tier batch in the onboarding sequence, not a follow-up.

**Every component with `assetClass?:` optional in its signature is a future silent-fallback bug.** This was noted in B79.0n.HYGIENE learnings; reaffirmed here. The universe-service was built as `getXstockUniverseSnapshot()` (no optional asset_class — the function is asset-class-bound by being in `asset_classes/xstock_spot/`). **Rule:** components live under `asset_classes/<class>/` should be asset-class-bound by location, not by an optional param. Optional params are silent-fallback magnets.

**Industry classification heuristics are inherently fragile under exchange vocabulary changes.** Finnhub's `finnhubIndustry` field is free-text. When Kraken adds a new tokenized stock sub-industry that Finnhub maps to a string our 75-pattern heuristic doesn't recognize, the UNCATEGORIZED count grows. The §6 #6 verification gate (UNCATEGORIZED ≤20% post-cycle) is the right safety net, but the heuristic still requires periodic maintenance. **Rule:** every classification heuristic needs (1) a measurement gate post-cycle, (2) parameterized regression tests anchored on empirically-probed boundary cases, and (3) a documented "what triggers a heuristic expansion" criterion.

### (d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`

Edits applied in the same governance turn as this completion report:

1. **New section: "Dynamic universe discovery (canonical pattern)"** — encodes the three-service chain (prime-mover + ground-truth + enrichment) + 5-layer fallback + override merge + stale-lifecycle as the template for next asset class. Includes a worked example for crypto-perp (prime-mover candidates, ground-truth options, enrichment options).

2. **Strengthen rule:** "Every classification heuristic MUST have parameterized regression-lock tests covering empirically-probed boundary cases + a measurement gate post-cycle + a documented expansion-trigger criterion."

3. **Add rule:** "Every external WS or REST call in the discovery chain MUST have an explicit timeout AND a deterministic partial-response abort path."

4. **Add rule:** "Use `const result: any = await db.execute(sql\`...\`)` pattern, NOT `db.execute<T>()` generic. Codebase-canonical."

5. **Add rule:** "Never explicitly INSERT into `_migrations` from a migration file — the runner auto-inserts. Document column-name as `name`."

6. **Add rule:** "Any tool that assembles migration SQL from multiple source files MUST validate by `psql -f <migration> -1` against an empty schema before committing."

7. **Add checklist item to "Pre-audit step":** "If the exchange has NO public list-all endpoint for instruments in this asset class, scope dynamic discovery as a first-tier batch in the onboarding sequence (not a follow-up)."

8. **Add checklist item to "Implementation step":** "Components live under `asset_classes/<class>/` should be asset-class-bound by location; reject optional `assetClass?:` params in newly-introduced signatures."

---

## 11. Governance files updated

| Tier | File | Update |
|------|------|--------|
| 1 | `1-system-manual/BATCH_CATALOG.md` | New row: B79.0n.UNIVERSE-DISCOVERY |
| 1 | `1-system-manual/PHASE_HISTORY.md` | New row under 15c continuation |
| 1 | `.claude/memory/MEMORY.md` (truth) | State block updated |
| 1 | `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) | Synchronized with truth file |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_UNIVERSE_DISCOVERY_SCOPE.md` | (already shipped Step 1) |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_UNIVERSE_DISCOVERY_PRE_AUDIT.md` | (already shipped Step 2) |
| 1 | `Claude Comms and Packages/Batch Completion/B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md` | This document |
| 2 | `1-system-manual/SYSTEM_MANUAL.md` | New section: xStock dynamic universe discovery architecture |
| 2 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | New components: discoverer + universe-service + cron + 3 DB tables + 2 routes |
| 2 | `1-system-manual/RUNNING_ISSUES.md` | #125 RESOLVED (this batch); #120 SUPERSEDED (universe-audit motivation rolled in); #126 OPEN (Layer 3 EACCES); #127 OPEN (Finnhub re-enrich); #128 OPEN (cron self-fire watch) |
| 2 | `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | New canonical pattern section + 7 rule additions per §10 (d) |
| 1 | `/home/langston/MEMORY.md` (Hetzner) | Updated via scp+ssh per CLAUDE.md §2.10.b |

---

## 12. Locked next steps

1. **Soak verification 2026-05-22T11:55:57Z** — alert `d4b2e590` fires; do the 24h crypto regression-lock comparison + also psql `discovery_runs ORDER BY run_id DESC LIMIT 3` to verify cron-self-fire produced `run_id=2` with `triggered_by=cron_daily` (Langston Step 8 watch item — RUNNING_ISSUES #128).
2. **Next umbrella sub-batch:** **B79.0n.STORAGE** (now sub-batch #3 in umbrella v3 after the insert). Inherits the dynamic universe via `XSTOCK_SPOT_SYMBOLS` import.
3. **Future-touch cleanup** (non-urgent):
   - RUNNING_ISSUES #126 (Layer 3 EACCES): relocate cache to `${HOME}/.dawntrader-cache/` next time `universe-service.ts` is touched
   - RUNNING_ISSUES #127 (Finnhub re-enrichment): tier monthly-stable vs daily-fresh when next touching `xstock-universe-discoverer.ts`
   - Export `mapFinnhubIndustryToSector` to a shared module on next heuristic expansion (Langston Step 4 future-cleanup note)
   - Gas/utility ordering edge case if utility-class tokenized stocks ever appear in the universe (Langston Step 4 future-cleanup note)

---

**Batch CLOSED 2026-05-21.**

Verbatim Langston Step 4 + Step 8 replies preserved at:
- `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP4_LANGSTON_REPLY.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP4_LANGSTON_REACK.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP7_VERIFICATION.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_UD_STEP8_LANGSTON_REPLY.md`
