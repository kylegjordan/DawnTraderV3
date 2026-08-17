# P19-B-PERPFEED — Crypto-Perpetuals FEED Ingest (data capture ONLY)

change-class: architecture

**Author:** CC-C (Claude Analyst), 2026-08-17. **Status:** r5 — carries: both parallel Step-1 passes on r1 (08:08Z + 08:12Z, merged in r2/r3), the adds/drops cadence reconciliation (r4, 08:18Z ruling), and the at-ref SENT-BACK amendments (08:22Z: resident-set budget denominator + sweep-list citation + measured-byte-drop exit + this identity line fixed). Awaiting Langston's r5 at-ref pass.
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

**OBJ-1 — Universe selection (Langston Step-1: AGREED with conditions; cap reworked per his second pass).** **Dynamic** loader leg querying `https://futures.kraken.com/derivatives/api/v3/instruments` (Langston's live probe 2026-08-17: **276 tradeable `PF_` perps, all USD-quoted** — EUR/GBP quote handling is out of the design), filtered to `tradeable=true` crypto perpetuals whose BASE asset is present in the current **crypto_spot dynamic universe** (the *relevance* filter — Phase-26 basis/funding work wants the pairs we actually trade), with a hard cap **derived from a stated GB/month disk budget (§4), never the reverse** — pick the budget, derive N. **Binding conditions (r4 — Langston's reconciliation ruling 2026-08-17 08:18Z; adds and drops are NOT symmetric costs, so they do not share a cadence):**
- (a) **ADDS: monthly only, budget-first — denominated in the RESIDENT SET (Langston c-i amendment, at-ref pass).** An add is a PERMANENT disk cost — once a symbol's rows land, the disk is spent whether or not it stays a member. Because dropped rows persist for the full retention window (condition (c)), **resident disk = (every symbol with rows inside the window) × rate × window, NOT N × rate × window** — N is the *membership* cap and stops being the *disk* cap the moment churn is non-zero. The monthly recompute therefore **re-derives N from the GB/month ceiling against the resident set — members + suspended + dropped-but-still-within-retention — at the *then-measured* per-symbol rate, with a churn assumption pre-audit MEASURES rather than assumes.** All adds/drops logged.
- (b) **DROPS: must not wait a month.** The **daily probe keeps its cannot-change-membership property but gains one power: reversible SUSPENSION** — a member that goes silent or blows out its byte rate gets recording PAUSED (logged, alerting, reversible, slot retained). It may never ADD. The membership set is unchanged by a suspension, so the safety property survives intact, and a dead symbol doesn't eat a budget slot for up to 30 days.
- (c) **Disposition of a dropped symbol's EXISTING rows — substance APPROVED by Langston at the at-ref pass:** dropped-symbol rows are **RETAINED and age out under the SAME STORAGE_POLICY retention window as member rows** — a drop stops future accrual; the retention window bounds the integral. No purge-on-drop (Phase-26 learning purpose; move-not-delete governs). **His two binding amendments:**
  - **(c-i)** the §4 budget derivation and the monthly recompute in (a) are denominated in the **resident set**, churn measured in pre-audit — folded into (a) above.
  - **(c-ii) "ages out under the retention window" is a MECHANISM CLAIM, and the instrument that would discharge it is currently broken.** The sweep's table inventory is `B74_TABLES` in `server/scripts/b75-retention-sweep.ts` (~:73-80; all monthly-partitioned archive tables route through `PARTITIONED_TABLES = [...B74_TABLES, ...B70_TABLES]`). Both new tables MUST enter that list — `crypto_perp_ticker_snap` with `timestampColumn: 'captured_at'`, `crypto_perp_ohlc_1m` with **`interval_begin`, NOT `'ts'`** — because **#685 measured that the list's three existing OHLC entries name a `ts` column that does not exist on those tables** (the column is `interval_begin`), and each entry's `hot_retention_days` constant must be SEEDED in module_constants (#685's second defect: crypto_spot's doesn't exist at all). **Consequence Langston's exit criterion makes explicit: the §4 precondition's exit includes a MEASURED BYTE DROP on a real perp partition, not a configured window — and no OHLC table can produce one until #685's fix lands. #685 is therefore a NAMED DEPENDENCY of this batch's switch-on**, expected to ride the CC-B retention batch from the 03fad8a4 triage (reconciled at pre-audit if it lands elsewhere). The sweep has freed 0 bytes for 16 consecutive nights; a retention key alone does not tier a table.
- (d) **Eviction/suspension logged with a last-captured timestamp** — a later reader must be able to distinguish "no activity" from "not captured."
- (e) The cap is a **`module_constants` key, not a literal**.

Field shapes + the authoritative class-discriminator field verified by live probe in pre-audit.

**OBJ-2 — Tables + partitions.** `crypto_perp_ohlc_1m` + `crypto_perp_ticker_snap`, monthly-partitioned, same shape as the `xstock_perp_*` twins. Migration (gitignored `*.sql` → `git add -f` + MANIFEST.txt registration) pre-creates partitions INCLUDING the deploy month (the B74 v1 off-by-one — inserts failed until UTC midnight — is documented in the bootstrap's self-heal comment; do not repeat it). `SIX_TABLES` → eight at BOTH sites (`passive-archive-bootstrap.ts:33` + `scripts/b74-create-monthly-partitions.ts:36`), **and the constant is RENAMED when it grows — a constant named `SIX_TABLES` holding eight entries is the next reader's trap (Langston).** Plus the registry touch point neither r1 objective named: **`shared/asset-classes.ts:82-83`** — `crypto_perp.archiveOhlcTable`/`archiveTickerTable` are `null` (the registry currently says crypto_perp isn't archived) and must be set to the new table names in the same change.

**OBJ-3 — The archiver leg (Langston Step-1: generalize AGREED, rule 15; proof strengthened per his ruling; blast radius named per his second pass).** **Generalize** `equity-perp-archiver.ts` into one parameterized Kraken-Futures archiver instantiated twice. **The honest blast radius — this is a SINGLETON→INSTANCE conversion, not a parameter-list change (Langston):** the file holds `const ASSET_CLASS = 'xstock_perp' as const` and `const state: ArchiverState = {...}` at MODULE scope; converting moves `getEquityPerpStats()` (a module-level reader OBJ-5's monitor panel depends on) and the bootstrap call site with it. **Pre-audit probe (premise check):** verify the REST charts endpoint (`/api/charts/v1/trade/<sym>/1m`) actually serves `PF_XBTUSD`-style crypto perp symbols — if it does not, the "byte-identical needs" generalization premise fails and the design needs a second parameter axis. (The WS candle feed is a known dead end — #41, `candles_trade_1m` in `KNOWN_NONEXISTENT_NAMES`; do not re-attempt.) **Behaviour-preservation proof — the strengthened form, not a level check:** (a) baseline measured **BEFORE the change** over a stated window, object + population named (rule 29a); (b) **matched-window rows-per-unit-time comparison** post-deploy; (c) a **byte-level assertion** that the current static equity set round-trips through the new code path to IDENTICAL canonical output; (d) the equity leg's existing kill-switch key (`b74_perp_capture_enabled`) is asserted **UNCHANGED** — a renamed constant silently disarms a live capture leg and nothing would tell you. New crypto-perp leg gets its OWN module-constants kill-switch key in the `passive_archive` family. This objective is **disk-neutral** (no new writer starts) and proceeds regardless of the §4 precondition.

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

**★ THE SECOND SITE — higher stakes than the one r1 named (Langston's second pass):** `shared/asset-classes.ts:215` — `XSTOCK_PERP_RAW = ^PF_[A-Z]{1,6}X(USD|EUR|GBP)$`, consumed at `:625` inside **`resolveAssetClass` — the SSOT for the asset-class stamp at insert sites** (it decides which class and which TABLE a row is tagged with). All 14 collision names match it and return `xstock_perp` — a crypto perp would be archived as a tokenized equity. The function's contract is *throws on unknown pattern, no silent defaults*; here it doesn't throw, it returns a confident wrong answer (#546 shape). **Rule-24 outcome 2 — working-as-designed-but-unaddressed, NOT a live defect:** only the 10 equity perps reach it today; THIS batch is what makes the collision names reachable. Membership-driven disambiguation therefore applies at **BOTH sites** (the canonicalizer AND `resolveAssetClass`), in the same change.

**Tests required (Langston):** pin all 14 in a test at BOTH sites, PLUS a negative control asserting the 16 equity names still map unchanged.

**`PI_` inverse perps — explicitly OUT for v1 (Langston recommendation, adopted):** Kraken lists 4 tradeable coin-margined inverse perps (`PI_XBTUSD`, `PI_ETHUSD`, `PI_LTCUSD`, `PI_XRPUSD`) with inverted PnL math. Excluded from capture AND from the canonicalizer mapping, with this exclusion written down here and in the universe loader — because an inverse contract silently entering a Phase-26 consumer is a worse failure than a missing one.

**Required design:** membership-driven disambiguation per OBJ-4 (positive membership both sides + UNCLASSIFIED refuse-and-log). The equity regex stays for equity perps.

---

## 4. ⛔ HARD PRECONDITION — no new continuous writer until the disk retention/tiering decision lands (Langston Step-1 gate, 2026-08-17)

**r1 quoted 67.8% — that was alert `03fad8a4`'s MINT-TIME SNAPSHOT (2026-08-08), not the gauge.** The rule-29 lesson applies to this scope's own text: read the instrument, never a stored figure. **Live `[DatabaseMonitor]` on staging (Langston's own measurement): 77.3% = 154.6 GB of the 200 GB cap at 2026-08-17T00:15Z**, ramping **+1.23 pp/day ≈ 2.5 GB/day** (69.3% on 08-10 → 77.3% on 08-16), straight-line to the cap around **2026-09-04**. The nightly sweep has freed **0 bytes for 16 consecutive nights** (retention windows never sized against current write rates) while archival-health greens on job *age*, not bytes freed.

**THE GATE:** the crypto-perp capture leg (a new continuous writer) does **NOT deploy/switch on** until the retention/tiering decision lands. **Named owners (§9.4):** the lever decision — shorten retention vs. raise the disk cap — is **Kyle's**, put to him by Langston on alert `03fad8a4` (2026-08-17 08:01Z triage); the implementing retention batch is **CC-B-owned** per that triage. Neither is this batch's work. **THE GATE'S EXIT (Langston c-ii, at-ref pass): a MEASURED byte drop on a real perp partition — a configured retention window is a mechanism claim, not evidence** (the sweep has freed 0 bytes for 16 nights, and #685 shows it structurally cannot tier the OHLC family until its timestamp-column fix lands — see OBJ-1 (c-ii) for the full dependency chain).

**What proceeds regardless:** OBJ-3 (archiver generalization — no new writer starts) and OBJ-4 (canonicalizer mapping) are **disk-neutral**; scope/pre-audit/implementation/review all proceed. Only the switch-on waits.

**The sizing math starts from Langston's measured actuals (his second pass, `pg_database_size` + per-partition measurements 2026-08-17; second reading 155 GB = 77.7%):** `xstock_perp_ticker_snap_2026_07` (full month, 10 symbols) = **2,563 MB → ~256 MB/sym/month ticker**, plus ~175 MB/month OHLC across the leg → **~0.27 GB/sym/month un-normalized**. ⚠️ **The uptime normalization he requires:** xStock perps stream a ~6.5h weekday session; crypto perps stream **24/7** — projecting one from the other without normalizing is the ramp-vs-level error, and the normalized figure is plausibly several times 0.27. **Therefore the cap is expressed as a stated GB/month BUDGET and N is derived from it — never the reverse.** Un-normalized, a "top ~40" cap ≈ 11 GB/month (≈4 months of pre-decision headroom); the honest normalized figure comes out of pre-audit. **Outlier to exclude-or-explain before using the series:** `xstock_perp_ohlc_1m_2026_05` = 882 MB vs 173–176 MB for later months.

**What pre-audit still produces:** the uptime-normalized GB/sym/month figure → the proposed GB/month budget → derived N, proposed against POST-DECISION headroom, plus the STORAGE_POLICY retention rows for both new tables sized against the write rate from day one — this leg must never join the "windows never sized against write rates" failure class it is being gated behind.

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
