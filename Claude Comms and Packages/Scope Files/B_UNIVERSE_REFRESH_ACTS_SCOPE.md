# B-UNIVERSE-REFRESH-ACTS — SCOPE (r1)

**change-class**: architecture

**Batch:** `B-UNIVERSE-REFRESH-ACTS` · **Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §4 row 18 (KD-26, Kyle 2026-11-04) · **Issue:** `#1018` (+ proposed: `#1072`, see §6) · **Then:** row 19 `B-SYMBOL-CLASS-IDENTITY`
**Written at ref:** `cc93948b3` (every `path:line` below is at that ref)

---

## 1. WHAT THIS BATCH IS FOR (plain)

Once a day a job re-checks which coins clear the crypto recorder's volume floor. It works, but **nothing listens to its answer**: the running recorder keeps the list it was born with until the app next restarts. Today that gap is hidden only because we deploy often. This batch makes the daily answer change what the recorder actually listens to, without a restart, without ever dropping a coin we hold, and without ever shrinking the list on a bad fetch.

## 2. THE DEFECT, AT THE OBJECT

- **The refresh is a separate process** — root crontab on staging, read 2026-11-22:
  `0 3 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-refresh-universe.ts" >> /var/log/dawntrader/b74-refresh.log 2>&1`
  Latest run in that log: `universe: 461 pairs (added=35, dropped=60, kept=426) … cache written to /tmp/b74-crypto-universe-cache.json`.
- **Its own docstring says it does not act**, `server/scripts/b74-refresh-universe.ts:10-13`, verbatim: *"Does NOT modify the running archiver subscriptions (those happen at next full PM2 restart, which is rare). The daily refresh is informational — confirms that the dynamic filter is stable and surfaces churn in the long-tail crypto universe for monitoring."*
- **It structurally cannot act:** it is a separate OS process; the recorder's membership lives in the app process (`crypto-spot-archiver.ts:71` `symbolShard` Map). Its only output is `/tmp/b74-crypto-universe-cache.json` (`:29`, `:57`), and the only reader of that file is the script itself (repo-wide `git grep b74-crypto-universe-cache` at the ref returns `:29` of the script only, non-md).
- **The recorder loads its list once:** `startCryptoSpotArchiver` (`crypto-spot-archiver.ts:335-369`) calls `loadCryptoSpotUniverse()` once, assigns shards, fills `symbolShard`, connects each shard. Nothing re-reads it. `recorder-connection.ts` (523 lines) has no unsubscribe and no incremental subscribe; its only re-subscribe path is a full reconnect (`forceReconnect`, `:282`) that replays `onOpen: (ws) => subscribe(shard, ws)` over the shard's fixed `shard.symbols` (`crypto-spot-archiver.ts:303-317`).
- **Measured on 2026-09-07 (`#1018`):** computed universe 443; distinct symbols written in 1 h 428, in 24 h 464; the universe ranged 388-469 over ten runs with no configuration change.

## 3. PROVENANCE (MANDATORY 1.b)

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the B74 scope and pre-audit, `git log` of `ce4a7e408`, `PRICING_DATA_ARCHITECTURE.md` §5b.1, System Impact Map rows 3/6a/7/13, System Manual §§ at `:702`, `:7908-7917`, `:13541-13607`, and `bridge/canonical/` (only incidental "universe" hits; no refresh intent recorded there — the B74 documents are the Tier-1 provenance).

### Tier 1 — behaviour this batch changes

**(a) `server/scripts/b74-refresh-universe.ts` + its crontab line.** Introduced by `ce4a7e408` (2026-05-01), subject *"B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)"*. The commit body, verbatim:
> `Bootstrap + cron:` … `- server/scripts/b74-refresh-universe.ts (new)` … `DESIGN DECISIONS (Langston-approved):` `- Static equity universes; dynamic crypto with daily refresh cron`

**The intent was a refresh that ACTS.** `BATCH_74_SCOPE.md:58`: *"Universe selection (computed at startup, refreshed daily via cron)"*; `:186`: *"selector criteria, applied at startup AND refreshed daily via cron."* `BATCH_74_PRE_AUDIT.md:147` (risk table): *"Cron is read-only on Kraken AssetPairs API; only writes to `crypto-universe-filter.json`. Archiver re-reads config on next subscription cycle. No race."* and `:158`: *"the universe-refresh cron will drop the pair the next day. Acceptable."*
⇒ **The shipped script never wrote the filter file and the archiver never re-read anything** — the docstring downgraded the design to "informational". The pre-audit's "no race" and "drops the pair next day" both assumed the acting refresh that was never built.

**Why a system crontab, and why that reason no longer holds.** `BATCH_74_SCOPE.md` ruling 5 (`~:283`), verbatim: *"System crontab, NOT internal setInterval. Consistent with existing cron pattern (replay-ablation runs at 04:00 UTC). Standalone script invoked via `npm run b74:refresh-universe` is more observable, more killable, and survives PM2 restarts better. Schedule at 03:00 UTC…"*
- Its three reasons were about an *internal `setInterval`*. Since then the app has a governed cron lane: the B-NEW-49 registry (`server/services/cron-registry.ts`) and B-CRON-MISSED-CATCHUP's durable occurrence identity, missed-run recovery and per-job lane (`cron-occurrence-runner.ts`; shared consensus truth in `MEMORY.md`). That lane is observable (a `cron_runs` row per occurrence), recoverable across restarts (catch-up), and per-job.
- The npm script it names does not exist (no `b74:refresh-universe` in `package.json` at the ref; the crontab calls `npx tsx` directly).
- **And a separate process cannot change the in-process recorder at all**, which is the one thing the B74 scope and pre-audit said the refresh would do.

**Disposition: (2) relevant, needs updating to today's intent** — the refresh is wanted (and was always meant to act); its process boundary is what makes it inert.

**(b) `crypto-spot-archiver.ts` start/membership.** Built in the same commit (`ce4a7e408`: *"crypto_spot — USD/USDT/USDC pairs ≥ $10k 24h volume (~400-600) via wss://ws.kraken.com/v2 with hash-mod sharding @ 300"*). Since then: Murmur3 sharding fix (SIM row 3), `B-CRYPTO-FEED-WATCHDOG` (`#1232`, `b8685a453`) made each shard a watched `RecorderConnection` and added the per-symbol update clock the feed alarm reads. **Disposition: (2)** — membership must become mutable; everything else stays.

**(c) `universe-loader.ts` `loadCryptoSpotUniverse` (`:184`).** Same commit; returns whatever the ticker batches yielded — a per-batch catch (`~:236`) warns and continues, so a failed batch silently omits its pairs (`noTicker`). Harmless once at boot; **harmful once the result can SHRINK a running set.** **Disposition: (2)** — the refresh path must know whether the result is complete.

### Tier 2 — read or called, unchanged in intent

- `recorder-connection.ts` — the one watched connection (`#1232`); reconnect and subscribe-reply accounting (`expectedSubscribeReplies: () => shard.symbols.length * 2`, `crypto-spot-archiver.ts:303-317`). Called, possibly extended (judgement call J3).
- `active-execution-engine.ts:4719-4720` — the exit witness vouches a close only if `isInCryptoRecorderUniverse` (`crypto-spot-archiver.ts:140`, `= symbolShard.has(symbol)`) and `isCryptoRecorderSymbolConnectionLive` (`:146`). **This is why KD-26 sequenced row 18 after row 72: a membership change touches the close path.** Read only; protected by OBJ-2.
- `feed-integrity-monitor.ts:388-400` — the warm gate (`isCryptoRecorderWarm`) and the live-share denominator (symbol ages per shard, System Manual `:7917`: *"the denominator is the universe, never the symbols that happened to tick"*). Read only; protected by OBJ-5.
- `drift-dashboard-aggregator.ts:1078/1093` (`getCryptoSpotStats`) — reporting read; must not break, no change intended.
- `universe-loader.ts` `recomputeCryptoPerpUniverse` (`:482`, calls the spot loader at `:495`; also `:621` and `scripts/perpfeed-monthly-recompute.ts:48/56`) — **untouched**; the perp recompute keeps its own cadence.

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED (§9.5(b-ii))

- **The acting-refresh capability does not exist anywhere in the crypto path** (above). **The in-app scheduling capability DOES exist** — `cron-registry.ts` + `cron-occurrence-runner.ts`, with `xstock-universe-cron.ts` (06:00 UTC, `runNatural` → `register({recovery:{policyKey, run}})` → `execution:missed` → `dispatchMissed`) as the precedent. This batch reuses it rather than building a scheduler.
- **The xStock sibling is already homed, not mine:** `equity-spot-archiver.ts:616` also loads its list once at start (`state.symbols = await loadEquitySpotUniverse()`), recorded at `RUNNING_ISSUES` (`loadEquitySpotUniverse` has exactly one call site, never reassigned) and placed at **row 31 `B-XSTOCK-LIVE-FEED` (CC-C)**, moved into the sprint by Kyle 2026-10-07. **No new finding; I will build the membership change as a per-archiver seam so row 31 can reuse it** (J7).
- **Ledger read:** `#1018` (this), `#1072` (§6), `#937` (B-NONFIAT-QUOTE-DENOMINATION, Infra — the quote set the loader admits; not changed here), `#741` (the one-gate dispatch rule), `#1054` (the retired alert-invokes log), `#596` (archive representativeness). No Kyle-approved decision says the refresh should stay informational — the "informational" wording is the script's own docstring, not a ruling.

## 5. OBJECTIVES — each with its verification and PROOF line

**OBJ-1 — The daily refresh changes what the running recorder listens to, without a restart.** Added pairs are subscribed and dropped pairs unsubscribed in the running process.
*PROOF:* after the first natural daily run post-deploy, a status read of the recorder's membership compared to that run's computed universe. **PASS:** set-equal except pinned symbols (OBJ-2), every difference explained by a logged pin or refusal. **FAIL:** any computed symbol absent from the running membership one cycle after the run, or any dropped symbol still subscribed without a pin.

**OBJ-2 — A coin we hold is never dropped.** A symbol with an open position in any mode stays subscribed until that position closes, then leaves at the next refresh; the exit witness keeps vouching.
*PROOF:* unit test (drop of a held symbol → kept + pinned line); live: every `pinned` line names a symbol with an open position at that moment (one `dt-sql` read). **PASS:** zero held symbols ever absent from membership. **FAIL:** any close graded unvouched because its symbol left the universe.

**OBJ-3 — A partial or failed fetch never shrinks the running list.** If any ticker batch fails, or the result fails a completeness test, the refresh REFUSES to apply and says so (#1072 leg b).
*PROOF:* unit test injecting one failed batch → refuse, membership unchanged, one refusal line + one alert. **PASS:** refusal fires on the injected failure and on nothing else in tests. **FAIL:** an injected partial result changes membership.

**OBJ-4 — An empty universe at startup does not leave the recorder off for the life of the process.** Today `crypto-spot-archiver.ts:338-339` returns ("universe is empty; archiver not started") and nothing retries; the refresh must start it (#1072 leg a).
*PROOF:* unit test: start with an empty loader → not started; next refresh with a non-empty result → shards connect. **PASS/FAIL:** as stated.

**OBJ-5 — The feed alarm stays honest across a membership change.** A just-added coin does not read as a missing feed before it has had a chance to tick; a dropped coin leaves the alarm's denominator and the age maps.
*PROOF:* unit tests on the warm gate and live-share denominator across an add and a drop; live: no `recorder` feed-whole page within the warm window after the first natural refresh. **FAIL:** a page caused by an added symbol inside its warm window, or a dropped symbol still counted.

**OBJ-6 — The refresh runs where it can act: in the app, on the governed cron lane.** One registered job, one occurrence per day, catch-up per the lane's policy; the standalone script, its crontab line and the `/tmp` cache are retired under rule 18 (archived as `.removed`, `DELETED_COMPONENTS_LOG.md`).
*PROOF:* a `cron_runs` row per day with its occurrence id; `crontab -l` on staging no longer holds the line; the script archived. **FAIL:** two refreshers running, or a day with no occurrence row and no recorded miss.

**OBJ-7 — Every membership change leaves a durable record** — added / dropped / kept / pinned / refused per run, enough to answer "which coins were we recording on day D" for `#596` reads later.
*PROOF:* one record per run, read back for the first natural run. **FAIL:** a run whose membership change cannot be reconstructed.

## 6. `#1072` — PROPOSAL (for Langston's view, then Kyle's list via PM)

`#1072` (CC-C, plan row 118) is the same defect seen from the recorder side — *"the price-history recorder's frozen symbol set"* — plus two siblings: (a) an empty universe at startup means the recorder never starts; (b) the per-batch ticker catch silently omits pairs. Its own disposition text reads *"ADDED AS AN ITEM to `3b.h-8` `B-ARCHIVE-WRITER-LIFECYCLE` (owner CC-C), all three legs. Fix shape not pre-judged."*; row 119 (that batch) is now CC-B's and carries writer-lifecycle edges, not `#1072`.
**This scope covers all three legs as OBJ-1, OBJ-4 and OBJ-3.** ⇒ **Proposal:** row 118 is marked *covered by row 18* and `#1072` closes with this batch. **This is a proposal, not a re-slot** (2026-10-19 rule): I will tell CC-C in the channel (wrench rule) and PM Claude carries it to Kyle. If Kyle keeps row 118, OBJ-3/OBJ-4 stay here anyway — OBJ-1 cannot ship safely without them — and row 118 shrinks to whatever remains.

## 7. JUDGEMENT CALLS — PLEASE ATTACK THESE

- **J1 — In-app cron lane (my recommendation) vs keep the crontab and signal the app.** In-app supersedes B74 ruling 5; the reasons are in §3(a). Signalling a running app from a crontab adds a new inbound control path to the trading process — I would rather not.
- **J2 — Pin held symbols** (OBJ-2) by reading open positions across both modes at refresh time, vs a pin registry the engine writes. I lean to the read: one source, no new shared state.
- **J3 — How membership changes on the wire:** (i) re-shard and force a reconnect only on the shards whose membership changed, vs (ii) teach `RecorderConnection` incremental subscribe/unsubscribe. (i) reuses the watched reconnect path and its reply accounting as-is but costs a short per-shard gap; (ii) is gap-free but changes the shared connection used by the futures legs too. I lean (i) for this batch, measured gap stated.
- **J4 — Pruning:** dropped symbols leave `symbolShard` and `lastTickerUpdateAt` (`crypto-spot-archiver.ts:71`, `:74`) — otherwise a stale age sits in the alarm's denominator forever.
- **J5 — Warm window for added symbols** (OBJ-5): reuse the alarm's existing warm rule per symbol, or a fixed grace from subscribe time.
- **J6 — Completeness test** (OBJ-3): "every ticker batch succeeded" is necessary; I also propose refusing a drop larger than a set share of the running list in one run, the number a DB-governed setting (no hard-coded fallback). Floor proposed at Step 2 from the run log's history (largest observed single-run drop: 60 of 486, 2026-11-22).
- **J7 — Seam:** the membership change built as a per-archiver function so row 31 (xStock, CC-C) can reuse it; row 31 stays separate.

## 8. OUT OF SCOPE

The perp recompute and its dependency on the spot loader (unchanged) · the xStock recorder (row 31) · the archive writer's lifecycle (row 119) · a shared ticker as two instruments and the duplicate-guard move (row 19, next) · the quote-currency set (`#937`) · the main Dashboard and AI pages (off-limits).

## 9. DOCUMENTS THIS CLASS OWES (architecture)

Scope (this) · pre-audit (Step 2) · completion report · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `SYSTEM_MANUAL.md` (the recorder's membership rule) · `SYSTEM_IMPACT_MAP.md` (rows 3, 7, 13; the cron registry) · `DELETED_COMPONENTS_LOG.md` (script + crontab + cache) · `SPRINT_TO_LIVE_PLAN.md` row 18 · `RUNNING_ISSUES.md` `#1018` (+ `#1072`) · `PRICING_DATA_ARCHITECTURE.md` §5b.1 (judged) · my task list · memory files.

## 10. DEPLOY NOTE

A deploy restarts live trading; no deploy 14:30-21:00Z, avoid 05:25-05:45Z, and respect open `DEPLOY_WINDOWS` rows. The first natural refresh after deploy is the verification event, so the deploy is timed to precede a 03:00Z run (or the lane's catch-up) by enough to read it the same day.
