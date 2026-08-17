# P19-B-PERPFEED — Crypto-Perpetuals FEED Ingest (data capture ONLY)

change-class: architecture

**Author:** CC-C (Claude Analyst), 2026-08-17. **Status:** r2 — Langston Step-1 CHANGES NEEDED (08:08Z) incorporated; awaiting his r2 pass.
**Kyle authorization:** 2026-08-17 directive — during the P19-B-FEEVIABILITY quiet window, "research and activate the feed for the crypto perpetuals."

> **r2 changes (all from Langston's Step-1 review, his own live measurements):** §4 restated as a HARD PRECONDITION (live disk 77.3%, not the stale 67.8% alert snapshot); §3 collision set enumerated (14 truncation victims), PF_XBTUSD example corrected (exists, mis-parses LOUDLY), PI_ inverse perps explicitly OUT; membership design upgraded to positive-both-sides + UNCLASSIFIED refuse-and-log (no default-else); OBJ-1 eviction-logging/daily-refresh/constant-cap conditions; OBJ-3 behaviour-preservation proof strengthened; §5 deploy NEVER rides mark-2 (own labelled deploy). Stale equity-universe finding filed as #687.

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

**OBJ-1 — Universe selection (Langston Step-1: AGREED with conditions).** **Dynamic** loader leg querying `https://futures.kraken.com/derivatives/api/v3/instruments` (Langston's live probe 2026-08-17: **276 tradeable `PF_` perps, all USD-quoted** — EUR/GBP quote handling is out of the design), filtered to `tradeable=true` crypto perpetuals whose BASE asset is present in the current **crypto_spot dynamic universe**, with a hard cap ranked by open interest. **Langston's three binding conditions on the cap being a MOVING ranking:** (a) **eviction is LOGGED with a last-captured timestamp** — a later reader must be able to distinguish "no activity" from "not captured"; (b) refresh on the **daily cadence only**, never per-cycle; (c) the cap is a **`module_constants` key, not a literal**. Field shapes + the authoritative class-discriminator field verified by live probe in pre-audit.

**OBJ-2 — Tables + partitions.** `crypto_perp_ohlc_1m` + `crypto_perp_ticker_snap`, monthly-partitioned, same shape as the `xstock_perp_*` twins. Migration (gitignored `*.sql` → `git add -f` + MANIFEST.txt registration) pre-creates partitions INCLUDING the deploy month (the B74 v1 off-by-one — inserts failed until UTC midnight — is documented in the bootstrap's self-heal comment; do not repeat it). `SIX_TABLES` → eight, in both the bootstrap headroom check and the partition cron.

**OBJ-3 — The archiver leg (Langston Step-1: generalize AGREED, rule 15; proof strengthened per his ruling).** **Generalize** `equity-perp-archiver.ts` into one parameterized Kraken-Futures archiver (params: universe loader, asset-class stamp, table pair) instantiated twice. **Behaviour-preservation proof — the strengthened form, not a level check:** (a) baseline measured **BEFORE the change** over a stated window, object + population named (rule 29a); (b) **matched-window rows-per-unit-time comparison** post-deploy; (c) a **byte-level assertion** that the current static equity set round-trips through the new code path to IDENTICAL canonical output; (d) the equity leg's existing kill-switch key (`b74_perp_capture_enabled`) is asserted **UNCHANGED** — a renamed constant silently disarms a live capture leg and nothing would tell you. New crypto-perp leg gets its OWN module-constants kill-switch key in the `passive_archive` family. This objective is **disk-neutral** (no new writer starts) and proceeds regardless of the §4 precondition.

**OBJ-4 — Canonicalizer crypto-perp mapping (Langston Step-1 design amendment folded in).** See §3 THE TRAP. **The mandated design: positive membership on BOTH sides plus an explicit UNCLASSIFIED bucket that REFUSES and LOGS — no default-to-crypto `else` branch** (an unknown must not wear a plausible answer's clothes, #546 applied to classification). The naive "crypto = all `PF_` minus equity-membership" is REJECTED because the equity authority (`equity-perp-universe.json`, `_lastUpdated: 2026-04-30`, 10 symbols) is **6 symbols stale against Kraken's live 16** (`AMZNX, ANTHROPICX, COINX, METAX, OPENAIX, SPCXX` missing) — subtraction would misclassify six real equity perps as crypto. Filed as **RUNNING_ISSUES #687**, homed to this objective. Pre-audit identifies the instruments payload's authoritative class-discriminator field (live probe); failing that, curated membership lists maintained under the daily refresh. **Classification membership is a SEPARATE concern from the capture universe** — whether the equity CAPTURE leg also expands 10 → 16 is decided inside this objective but gated by the same §4 disk precondition (it adds writers). Tests: pin all 14 truncation victims (§3) + a negative control asserting the 16 equity names still map unchanged. Any probing dead-ends land in `KNOWN_NONEXISTENT_NAMES` (rule 14). This objective's mapping code is **disk-neutral** and proceeds regardless of §4.

**OBJ-5 — Monitor visibility.** The drift-dashboard monitor panel gains the crypto-perp leg's stats (connected / symbols / cumulative rows), same shape as `getEquityPerpStats`. §9.3 UI verification: the panel renders the new leg on staging.

**OBJ-6 — Governance.** SIM (component table + new tables), System Manual (passive-archive chapter), `STORAGE_POLICY.md` (retention rows for both new tables, mirroring xstock_perp's windows unless sizing forces tighter), `MULTI_ASSET_VTS_EXPANSION_PLAN.md` (note: feed-only leg carved out and executed; B80/Phase-26 wire-in untouched), `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (§3.3 learning capture if one genuinely surfaces), BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN + RUNNING_ISSUES + completion report + Langston MEMORY sync.

---

## 3. THE TRAP — crypto perp symbols that end in X (found in this scope's provenance read; ENUMERATED LIVE by Langston at Step-1, 2026-08-17)

The live perp regex `^PF_([A-Z]+)X(USD|EUR|GBP)$` treats the trailing `X` of the ticker as a separator. Kraken Futures CRYPTO perps use `PF_<BASE><QUOTE>` with NO separator. **Langston's live probe of `/derivatives/api/v3/instruments`: 276 tradeable `PF_` perps, all USD-quoted; 30 hit the equity regex — 16 are genuine xStock perps, 14 are crypto bases getting the last letter eaten:**

`AVAX→AVA, CFX→CF, CVX→CV, DYDX→DYD, FLUX→FLU, GMX→GM, ICX→IC, IMX→IM, IOTX→IOT, SNX→SN, SPX→SP, STX→ST, TRX→TR, ZRX→ZR`

Two failure classes, corrected per Langston (r1's `PF_XBTUSD` example was wrong — that symbol EXISTS and mis-parses **loudly** to `PF_XBT/USD`, not silently):
- **The loud class:** most crypto perps miss the equity regex and fall through to looser patterns → visible mis-parse.
- **The silent class — the one that matters:** the 14 X-ending bases above match the equity shape and produce a *plausible wrong* canonical pair. Same failure family as the 17 spot collision tickers: a matching shape is not a matching thing.

**Tests required (Langston):** pin all 14 in a test, PLUS a negative control asserting the 16 equity names still map unchanged.

**`PI_` inverse perps — explicitly OUT for v1 (Langston recommendation, adopted):** Kraken lists 4 tradeable coin-margined inverse perps (`PI_XBTUSD`, `PI_ETHUSD`, `PI_LTCUSD`, `PI_XRPUSD`) with inverted PnL math. Excluded from capture AND from the canonicalizer mapping, with this exclusion written down here and in the universe loader — because an inverse contract silently entering a Phase-26 consumer is a worse failure than a missing one.

**Required design:** membership-driven disambiguation per OBJ-4 (positive membership both sides + UNCLASSIFIED refuse-and-log). The equity regex stays for equity perps.

---

## 4. ⛔ HARD PRECONDITION — no new continuous writer until the disk retention/tiering decision lands (Langston Step-1 gate, 2026-08-17)

**r1 quoted 67.8% — that was alert `03fad8a4`'s MINT-TIME SNAPSHOT (2026-08-08), not the gauge.** The rule-29 lesson applies to this scope's own text: read the instrument, never a stored figure. **Live `[DatabaseMonitor]` on staging (Langston's own measurement): 77.3% = 154.6 GB of the 200 GB cap at 2026-08-17T00:15Z**, ramping **+1.23 pp/day ≈ 2.5 GB/day** (69.3% on 08-10 → 77.3% on 08-16), straight-line to the cap around **2026-09-04**. The nightly sweep has freed **0 bytes for 16 consecutive nights** (retention windows never sized against current write rates) while archival-health greens on job *age*, not bytes freed.

**THE GATE:** the crypto-perp capture leg (a new continuous writer) does **NOT deploy/switch on** until the retention/tiering decision lands. **Named owners (§9.4):** the lever decision — shorten retention vs. raise the disk cap — is **Kyle's**, put to him by Langston on alert `03fad8a4` (2026-08-17 08:01Z triage); the implementing retention batch is **CC-B-owned** per that triage. Neither is this batch's work.

**What proceeds regardless:** OBJ-3 (archiver generalization — no new writer starts) and OBJ-4 (canonicalizer mapping) are **disk-neutral**; scope/pre-audit/implementation/review all proceed. Only the switch-on waits.

**What pre-audit still produces:** measured xstock_perp table actuals after ~3.5 months live → projected GB/month per symbol → the OBJ-1 cap value proposed against POST-DECISION headroom, plus the STORAGE_POLICY retention rows for both new tables sized against the write rate from day one — this leg must never join the "windows never sized against write rates" failure class it is being gated behind.

---

## 5. Deploy sequencing (the marked window binds this — Langston Step-1 ruling REPLACES r1's recommendation)

P19-B-FEEVIABILITY's marked window is live; mark-2 deploys after the 2026-08-18T23:45Z mark verification. **This batch does NOT deploy before mark-2, and does NOT ride the mark-2 deploy either (Langston's ruling, adopted):** the archiver shares B74's counting semaphore, and the disk is at 77.3% — the value of a marked window is a clean attribution surface, and introducing a new continuous writer inside it buys one saved restart at the cost of a confounder we don't have to accept. **This batch takes its OWN labelled deploy after mark-2**, recorded in the FEEVIABILITY study log at deploy time (window labelled at mint) — and only once the §4 precondition has cleared.

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
