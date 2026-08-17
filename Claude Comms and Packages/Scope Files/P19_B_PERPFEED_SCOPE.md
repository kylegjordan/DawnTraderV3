# P19-B-PERPFEED — Crypto-Perpetuals FEED Ingest (data capture ONLY)

change-class: architecture

**Author:** CC-C (Claude Analyst), 2026-08-17. **Status:** DRAFT r1 — awaiting Langston Step-1 review.
**Kyle authorization:** 2026-08-17 directive — during the P19-B-FEEVIABILITY quiet window, "research and activate the feed for the crypto perpetuals."

---

## 0. What this batch IS and IS NOT (the boundary is a standing Kyle ruling)

**IS:** passive data CAPTURE of Kraken Futures crypto perpetual contracts — OHLC bars + ticker snapshots (including funding rate + open interest) — into the existing B74 passive-archive family. Telemetry-only writes. Nothing reads the data yet.

**IS NOT:** perp TRADING, perp VTS emission, perp SQE/RTB participation, perp friction config, or population of the `server/asset_classes/crypto_perp/` module. All of that is **Phase 26, post-launch** (Kyle decision 2026-05-27, `POST_AUDIT_ROADMAP:299` + `:1000`; reaffirmed 2026-08-11 — *"no perp trading until after go-live... The deferral is the decision, and it is his,"* `PHASE_25_5_PARTIAL_DECISIONS_2026-08.md` item 2). This batch executes only the data-capture prerequisite that Phase 26 will later consume, per `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (feed ingest precedes onboarding).

**Re-homing note (§9.4):** the perp feed-ingest item was homed to batch two (`P19-B-DROUGHT-2`) in `PHASE_25_5_PARTIAL_DECISIONS_2026-08.md` item 2. Kyle's 2026-08-17 directive pulls it forward as this standalone batch. At close, the OBJ-0 doc's pointer and any RUNNING_ISSUES reference update to name P19-B-PERPFEED as the executed home.

---

## 1. Provenance read (§2 1.b — Tier 1 for everything whose behaviour changes)

**Corpora searched:** `BATCH_CATALOG.md` (B74 entry), `SYSTEM_IMPACT_MAP.md` (passive-archive component table, `:2004-2013`), `POST_AUDIT_ROADMAP.md` (Phase 21.5/26 sections, decision log), `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (§7 B80 design), `PHASE_25_5_PARTIAL_DECISIONS_2026-08.md`, `KNOWN_NONEXISTENT_NAMES` registry, the live source files (all seven passive-archive modules + bootstrap + canonicalizer + universe configs).

**Tier-1 provenance (behaviour changes):**

- **`equity-perp-archiver.ts`** — B74 (2026-04-30/05-01). Original intent, quoted from its own header: *"Captures from Kraken Futures via TWO paths: 1. WebSocket (`wss://futures.kraken.com/ws/v1`) — TICKER ONLY... 2. REST polling (`.../api/charts/v1/trade/<sym>/1m`) every 60s"* — because *"Kraken Futures WebSocket v1 has NO candle/kline subscription feed (verified 2026-04-30... Per Langston cc-inbox #873 resolution + RUNNING_ISSUES #41 closure)."* The dead feed name `candles_trade_1m` is in `KNOWN_NONEXISTENT_NAMES` (rule 14) — this batch must NOT re-attempt it. Disposition: **(2) relevant, needs update to today's intent** — the venue/protocol handling is exactly what crypto perps need; only the universe and asset-class stamp differ. See OBJ-3 for the generalize-vs-sibling decision.
- **`symbol-canonicalizer.ts` perp mapping (`:127-142`)** — B74. Intent quoted: *"Format: PF_<TICKER>X<QUOTE>... PF_AAPLXUSD → AAPL/USD:PERP"* with regex `^PF_([A-Z]+)X(USD|EUR|GBP)$`. The `X` is the xStock ticker suffix (AAPLx), treated as a separator. Disposition: **(2) relevant, needs update** — see §3 THE TRAP.
- **`passive-archive-bootstrap.ts`** — B74. Intent: spawn archivers LAST in startup, fire-and-forget, per-archiver kill-switches, `SIX_TABLES` partition self-heal + headroom check. Disposition: **(2)** — gains a fourth leg + two tables in the self-heal list.
- **`scripts/b74-create-monthly-partitions.ts` (partition cron)** — must learn the two new tables or their partitions stop being created after the migration's pre-created window. Disposition: **(2)**.

**Tier-2 intent notes (read/called only):** `universe-loader.ts` (static-equity/dynamic-crypto split per Langston cc-inbox #867 Q3 + #869 Q3 — *"crypto is dynamic because the long tail of pairs comes and goes daily"*); `ohlc-batch-writer.ts` + `ticker-batch-writer.ts` (shared, keyed by table name — no change expected); `reconnect-policy.ts` (shared); `drift-dashboard-aggregator.ts:849` (monitor panel — gains the new leg's stats); `server/asset_classes/crypto_perp/` (B78 scaffold, placeholder-only, verbatim: *"populated in B80"* → relabeled Phase 26 — NOT touched by this batch, and its non-population is deliberate, not a gap).

---

## 2. Objectives

**OBJ-1 — Universe selection (design decision for Step-1 review).** Recommend: **dynamic** loader leg querying `https://futures.kraken.com/derivatives/api/v3/instruments` (the endpoint B74 used to verify the equity-perp universe), filtered to `tradeable=true` crypto perpetuals whose BASE asset is present in the current **crypto_spot dynamic universe** (maximizes join value with our spot data — basis/funding vs. our own traded pairs), refreshed at startup + daily alongside the crypto-spot refresh. **Sizing cap mandatory** (see §4 disk pressure): propose a hard cap (e.g. top ~40 by open interest) so the universe cannot silently balloon. Alternative if Langston prefers B74's equity precedent: a static seed JSON of majors. Exact instrument count + field shapes verified by live probe in pre-audit (Step 2), not assumed.

**OBJ-2 — Tables + partitions.** `crypto_perp_ohlc_1m` + `crypto_perp_ticker_snap`, monthly-partitioned, same shape as the `xstock_perp_*` twins. Migration (gitignored `*.sql` → `git add -f` + MANIFEST.txt registration) pre-creates partitions INCLUDING the deploy month (the B74 v1 off-by-one — inserts failed until UTC midnight — is documented in the bootstrap's self-heal comment; do not repeat it). `SIX_TABLES` → eight, in both the bootstrap headroom check and the partition cron.

**OBJ-3 — The archiver leg.** Recommend: **generalize** `equity-perp-archiver.ts` into one parameterized Kraken-Futures archiver (params: universe loader, asset-class stamp, table pair) instantiated twice — venue, protocol, dual-path capture, backoff, and stats shape are byte-identical needs; a copied sibling is the duct-tape rule 15 forbids. The generalization is behaviour-preserving for the running xstock_perp leg (verification: xstock_perp rows keep landing post-deploy at the same cadence). Kill-switch: new module-constants key in the existing `passive_archive` family so the crypto-perp leg can be disabled independently. If Langston judges the refactor risk to the running leg unwarranted, the fallback is a sibling file — but the recommendation is generalize.

**OBJ-4 — Canonicalizer crypto-perp mapping.** See §3 THE TRAP. Mapping must be membership-driven or shape-disambiguated, never the bare X-separator regex. Any probing dead-ends land in `KNOWN_NONEXISTENT_NAMES` (rule 14).

**OBJ-5 — Monitor visibility.** The drift-dashboard monitor panel gains the crypto-perp leg's stats (connected / symbols / cumulative rows), same shape as `getEquityPerpStats`. §9.3 UI verification: the panel renders the new leg on staging.

**OBJ-6 — Governance.** SIM (component table + new tables), System Manual (passive-archive chapter), `STORAGE_POLICY.md` (retention rows for both new tables, mirroring xstock_perp's windows unless sizing forces tighter), `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (note: feed-only leg carved out and executed; B80/Phase-26 wire-in untouched), `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (§3.3 learning capture if one genuinely surfaces), BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN + RUNNING_ISSUES + completion report + Langston MEMORY sync.

---

## 3. THE TRAP — crypto perp symbols that end in X (found in this scope's provenance read)

The live perp regex `^PF_([A-Z]+)X(USD|EUR|GBP)$` treats the trailing `X` of the ticker as a separator. Kraken Futures CRYPTO perps use `PF_<BASE><QUOTE>` with NO separator (`PF_XBTUSD`, `PF_SOLUSD`). Consequences if crypto perps were fed through the existing mapping unchanged:

- **Most crypto perps don't match at all** (`PF_XBTUSD`: char before `USD` is `T`) → fall through to looser crypto patterns → mis-parse hazard.
- **Worse — the silent-wrong-answer class:** any crypto base ENDING in X matches the equity shape and gets its last letter eaten: `PF_TRXUSD` → `TR/USD:PERP`, `PF_AVAXUSD` → `AVA/USD:PERP`, `PF_STXUSD` → `ST/USD:PERP`, `PF_DYDXUSD` → `DYD/USD:PERP`. Same failure family as the 17 collision tickers on the spot side: a matching shape is not a matching thing.

**Required design:** disambiguate by UNIVERSE MEMBERSHIP (the loader knows which PF_ names are crypto perps vs xStock perps), not by regex shape. The equity regex stays for equity perps; crypto perps map via an explicit membership set or an equivalent structural discriminator agreed at review. Pre-audit enumerates the actual X-ending bases in the live instruments list so the collision set is named, not estimated.

---

## 4. Sizing + disk pressure (must be settled at review, not discovered in production)

Staging DB is at **67.8% of 200GB** (03fad8a4 alert, 2026-08-17). The xstock_perp leg is only 10 symbols; Kraken Futures lists a much larger crypto-perp set (exact count from the pre-audit probe). Per-symbol steady-state: 1,440 OHLC rows/day + ticker snaps at the 1s throttle (the dominant term). The universe cap (OBJ-1) is therefore a DISK decision, not just a relevance decision. Pre-audit must produce: measured xstock_perp table sizes after ~3.5 months live → projected GB/month per symbol → the cap that keeps the leg within an agreed budget, plus the STORAGE_POLICY retention window that bounds it long-term.

---

## 5. Deploy sequencing (the marked window binds this)

P19-B-FEEVIABILITY's marked window is live; mark-2 deploys after the 2026-08-18T23:45Z mark verification. **This batch does NOT deploy before mark-2.** Recommendation: if Langston's code review completes in time, ride the mark-2 deploy (one restart, and a passive-archive leg cannot touch admission-conditioned metrics — it is outside the trading path); otherwise its own deploy immediately after, labelled in the study record either way. Either path is recorded in the FEEVIABILITY study log at deploy time (window labelled at mint).

---

## 6. Verification criteria (outcomes, not steps)

1. Both new tables receiving rows on staging (psql counts, object+population named per rule 29).
2. WS ticker connected + REST 1m poller cycling for the crypto-perp leg (PM2 logs) — AND the xstock_perp leg's cadence unchanged post-deploy (the generalization's behaviour-preservation proof; baseline cadence measured in pre-audit BEFORE the change).
3. Funding-rate + open-interest fields non-null on crypto-perp ticker rows (positive control: a known-listed major, e.g. the XBT perp).
4. Canonicalizer: every universe symbol round-trips to a correct `<BASE>/<QUOTE>:PERP` — including the X-ending collision set enumerated in pre-audit.
5. Partition self-heal + headroom check green for all eight tables.
6. Monitor panel renders the new leg (Claude-in-Chrome, §9.3).
7. Kill-switch proven: constant off → leg does not start (staging log line).
8. CI green on head; deploy via dt-deploy at the full 40-char sha.
