# B-UNIVERSE-REFRESH-ACTS — SCOPE (r2)

**change-class**: architecture

**Batch:** `B-UNIVERSE-REFRESH-ACTS` · **Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §4 row 18 (KD-26, Kyle 2026-11-04) · **Issue:** `#1018` (+ proposed: `#1072`, see §6) · **Then:** row 19 `B-SYMBOL-CLASS-IDENTITY`
**Written at ref:** `cc93948b3` (r1); r2 re-read at `3a39d9b50` — every `path:line` below holds at both.
**Step-2 corrections (2026-11-22, no objective changed):** `cron_runs` → `scheduled_job_occurrences` (§3(a), OBJ-6), "Murmur3" → FNV-1a (§3(b)), System Manual `:13607` → `:13620` (§4, §9). J3/J5/J6 are decided in the pre-audit, not here.
**r2 (2026-11-22):** folds Langston's Step-1 verdict (PROCEED to Step 2, Discord `1574101555827970152`): F1 J6 seed + the 2026-10-30 empty run, F2 gate baseline, F3 `forceReconnect` cost, F4 no per-symbol warm rule, F5 the deploy-window and exception rows, F6 a System Manual correction, F7 provenance sharpened, F8 the unread volume-floor setting. His rulings on J1/J2/J4/J7 are recorded in §7.

---

## 1. WHAT THIS BATCH IS FOR (plain)

Once a day a job re-checks which coins clear the crypto recorder's volume floor. It works, but **nothing listens to its answer**: the running recorder keeps the list it was born with until the app next restarts. Today that gap is hidden only because we deploy often. This batch makes the daily answer change what the recorder actually listens to, without a restart, without ever dropping a coin we hold, and without ever shrinking the list on a bad fetch.

## 2. THE DEFECT, AT THE OBJECT

- **The refresh is a separate process** — root crontab on staging, read 2026-11-22:
  `0 3 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-refresh-universe.ts" >> /var/log/dawntrader/b74-refresh.log 2>&1`
  Latest run in that log: `universe: 461 pairs (added=35, dropped=60, kept=426) … cache written to /tmp/b74-crypto-universe-cache.json`. *(Langston cannot read root's crontab — his read of this line is `RULED ON REPORTED FACT`; the log is root-owned, written 03:00 daily, 206 consecutive days, which he did read. Step 2 commits the crontab read as an artifact.)*
- **Its own docstring says it does not act**, `server/scripts/b74-refresh-universe.ts:10-13`, verbatim: *"Does NOT modify the running archiver subscriptions (those happen at next full PM2 restart, which is rare). The daily refresh is informational — confirms that the dynamic filter is stable and surfaces churn in the long-tail crypto universe for monitoring."*
- **It structurally cannot act:** it is a separate OS process; the recorder's membership lives in the app process (`crypto-spot-archiver.ts:71` `symbolShard` Map). Its only output is `/tmp/b74-crypto-universe-cache.json` (`:29`, `:57`), and the only reader of that file is the script itself (`b74-crypto-universe-cache` has exactly one non-md mention tree-wide, the writer's own constant at `:29`; positive control — the same instrument returns 26 hits for `loadCryptoSpotUniverse`).
- **The recorder loads its list once:** `startCryptoSpotArchiver` (`crypto-spot-archiver.ts:335-369`) calls `loadCryptoSpotUniverse()` once, assigns shards, fills `symbolShard`, connects each shard. The membership-mutator census is `startCryptoSpotArchiver` (`:356-357`), `stopCryptoSpotArchiver` (`:378`) and three test-only exports (`:383`, `:392`, `:399`) — no production re-read path. `recorder-connection.ts` (523 lines) has zero occurrences of `unsubscribe` and no incremental subscribe; its only re-subscribe path is a full reconnect (`forceReconnect`, `:282`) that replays `onOpen: (ws) => subscribe(shard, ws)` over the shard's fixed `shard.symbols` (`crypto-spot-archiver.ts:303-317`).
- **Measured on 2026-09-07 (`#1018`):** computed universe 443; distinct symbols written in 1 h 428, in 24 h 464; the universe ranged 388-469 over ten runs with no configuration change.

## 3. PROVENANCE (MANDATORY 1.b)

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the B74 scope and pre-audit, `git log` of `ce4a7e408`, `PRICING_DATA_ARCHITECTURE.md` §5b.1, System Impact Map rows 3/6a/7/13, System Manual §§ at `:702`, `:7908-7917`, `:13541-13607`, and `bridge/canonical/` (only incidental "universe" hits; no refresh intent recorded there — the B74 documents are the Tier-1 provenance).

### Tier 1 — behaviour this batch changes

**(a) `server/scripts/b74-refresh-universe.ts` + its crontab line.** Introduced by `ce4a7e408` (2026-05-01), subject *"B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)"*. The commit body, verbatim:
> `Bootstrap + cron:` … `- server/scripts/b74-refresh-universe.ts (new)` … `DESIGN DECISIONS (Langston-approved):` `- Static equity universes; dynamic crypto with daily refresh cron`

**The intent was a refresh that ACTS.** `BATCH_74_SCOPE.md:58`: *"Universe selection (computed at startup, refreshed daily via cron)"*; `:186`: *"selector criteria, applied at startup AND refreshed daily via cron."* `BATCH_74_PRE_AUDIT.md:147` (risk table): *"Cron is read-only on Kraken AssetPairs API; only writes to `crypto-universe-filter.json`. Archiver re-reads config on next subscription cycle. No race."* and `:158`: *"the universe-refresh cron will drop the pair the next day. Acceptable."*
⇒ **The shipped script never wrote the filter file and the archiver never re-read anything** — the docstring downgraded the design to "informational". The pre-audit's "no race" and "drops the pair next day" both assumed the acting refresh that was never built.
⇒ **(r2, F7) And the designed mechanism could not have carried the answer either:** `server/config/crypto-universe-filter.json` holds **criteria only** — no symbol list — and `loadCryptoSpotUniverse` reads it once per call (`universe-loader.ts:189-190`, `server/services/passive-archive/`). A cron "writing" that file and an archiver "re-reading config" would still have re-derived membership only on the next full load. The drift is not just "built inert"; the design named a file that cannot carry a membership list.

**Why a system crontab, and why that reason no longer holds.** `BATCH_74_SCOPE.md` ruling 5 (`~:283`), verbatim: *"System crontab, NOT internal setInterval. Consistent with existing cron pattern (replay-ablation runs at 04:00 UTC). Standalone script invoked via `npm run b74:refresh-universe` is more observable, more killable, and survives PM2 restarts better. Schedule at 03:00 UTC…"*
- Its three reasons were about an *internal `setInterval`*. Since then the app has a governed cron lane: the B-NEW-49 registry (`server/services/cron-registry.ts`) and B-CRON-MISSED-CATCHUP's durable occurrence identity, missed-run recovery and per-job lane (`cron-occurrence-runner.ts`; shared consensus truth in `MEMORY.md`). That lane is observable (a `scheduled_job_occurrences` row per occurrence — corrected at Step 2; `cron_runs` exists in no server, shared or drizzle file), recoverable across restarts (catch-up), and per-job.
- The npm script it names does not exist (no `b74:refresh-universe` in `package.json` at the ref; the crontab calls `npx tsx` directly).
- **And a separate process cannot change the in-process recorder at all**, which is the one thing the B74 scope and pre-audit said the refresh would do.

**Disposition: (2) relevant, needs updating to today's intent** — the refresh is wanted (and was always meant to act); its process boundary is what makes it inert.

**(b) `crypto-spot-archiver.ts` start/membership.** Built in the same commit (`ce4a7e408`: *"crypto_spot — USD/USDT/USDC pairs ≥ $10k 24h volume (~400-600) via wss://ws.kraken.com/v2 with hash-mod sharding @ 300"*). Since then: the shard hash is FNV-1a hash-mod (`assignToShard`, `crypto-spot-archiver.ts:180-187`; r2 said "Murmur3", corrected at Step 2), `B-CRYPTO-FEED-WATCHDOG` (`#1232`, `b8685a453`) made each shard a watched `RecorderConnection` and added the per-symbol update clock the feed alarm reads. **Disposition: (2)** — membership must become mutable; everything else stays.

**(c) `universe-loader.ts` `loadCryptoSpotUniverse` (`:184`).** Same commit; returns whatever the ticker batches yielded — a per-batch catch (`:236-239`) warns and continues, so a failed batch silently omits its pairs. Harmless once at boot; **harmful once the result can SHRINK a running set.** **Disposition: (2)** — the refresh path must know whether the result is complete.
- **(r2, F1) This has already happened once.** On **2026-10-30T03:00:01.982Z** the computed universe was **0 pairs** (`candidates=712, dead=0, wrongQuote=632, offline=120, noTicker=712`): every ticker batch returned nothing, the catch warned and continued, and the loader returned an empty list with no error. 205 of 206 runs carry `noTicker=0`; that one carries 712 (Langston's measurement over the whole log, 2026-05-01 → 2026-11-22; Step 2 re-derives it). Under an acting refresh with no completeness gate, that morning would have unsubscribed all 428 symbols.
- **(r2, F7) The discriminator exists but is a MIXTURE:** `filterReasons.noTicker` (`:181/:201/:246/:267`) counts both a pair the venue has no ticker for and a pair whose batch failed. "Every ticker batch succeeded" therefore needs a **batch-level success count** returned alongside the result, not `noTicker == 0`.

### Tier 2 — read or called, unchanged in intent

- `recorder-connection.ts` — the one watched connection (`#1232`); reconnect and subscribe-reply accounting (`expectedSubscribeReplies: () => shard.symbols.length * 2`, `crypto-spot-archiver.ts:303-317`). Called, possibly extended (judgement call J3).
- `active-execution-engine.ts:4719-4720` — the exit witness vouches a close only if `isInCryptoRecorderUniverse` (`crypto-spot-archiver.ts:140`, `= symbolShard.has(symbol)`) and `isCryptoRecorderSymbolConnectionLive` (`:146`). **This is why KD-26 sequenced row 18 after row 72: a membership change touches the close path.** Read only; protected by OBJ-2.
- `feed-integrity-monitor.ts:387-407` — the warm gate (`isCryptoRecorderWarm`) and the live-share denominator (symbol ages per shard, System Manual `:7917`: *"the denominator is the universe, never the symbols that happened to tick"*). Read only; protected by OBJ-5.
- `drift-dashboard-aggregator.ts:1078/1093` (`getCryptoSpotStats`) — reporting read; must not break, no change intended.
- `universe-loader.ts` `recomputeCryptoPerpUniverse` (`:482`, calls the spot loader at `:495`; also `:621` and `scripts/perpfeed-monthly-recompute.ts:48/56`) — **untouched**; the perp recompute keeps its own cadence.

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED (§9.5(b-ii))

- **The acting-refresh capability does not exist anywhere in the crypto path** (above). **The in-app scheduling capability DOES exist** — `cron-registry.ts` + `cron-occurrence-runner.ts`, with `xstock-universe-cron.ts` (06:00 UTC: the callback is `await cronOccurrenceRunner.runNatural(JOB_NAME, context.date)`; `runDiscovery` is the registry's recovery `run`, with `execution:missed` → `dispatchMissed` and `prepareJob`) as the precedent. This batch reuses it rather than building a scheduler.
- **(r2, F6) The System Manual mis-states that precedent:** `SYSTEM_MANUAL.md:13620` (at `e3a96a812`; r2 cited `:13607` at `3a39d9b50`) still says `xstock-universe-cron.ts` *"registers node-cron `0 6 * * *` UTC, wrapping `runDiscovery('cron_daily')` in try/catch"* — at the ref there is no try/catch and the callback is the occurrence runner. **Disposition (1): folded into this batch's System Manual update** (it is the failure semantics of the shape this batch adopts). `SIM:1751` is not stale — it sits under the per-batch archive at `:1493`.
- **The xStock sibling is already homed, not mine:** `equity-spot-archiver.ts:616` also loads its list once at start (`state.symbols = await loadEquitySpotUniverse()`), placed at **row 31 `B-XSTOCK-LIVE-FEED` (CC-C)**, moved into the sprint by Kyle 2026-10-07. **No new finding; I will build the membership change as a per-archiver seam so row 31 can reuse it** (J7).
- **(r2, F8) A tunable that nothing reads, inside this batch's object.** `module_constants` row `passive_archive|*|*|*|*|b74_crypto_min_volume_24h_usd = 10000` exists (seeded 2026-05-01, never updated), and the config file's own note says the floor *"comes from module_constants … at runtime"* — but **no production path reads it.** All three production call sites pass no options (`b74-refresh-universe.ts:42`, `crypto-spot-archiver.ts:336`, `universe-loader.ts:495`; `opts.minVolumeFloorUsd` is test-only) and `universe-loader.ts:192` takes `cfg.filter.minVolume24hUsd` from the JSON. The two values are equal, so nothing is wrong today. Bug-taxonomy outcome **(2) working-as-designed-but-unaddressed** — the decision is which one source holds the floor. **Disposition (1): folded into this batch as OBJ-8** — OBJ-6 moves the computation in-app where `getCachedNumberRequired` is already the pattern (`recorder-connection.ts:353-359`), and the same file's quote-set note gives the reason: *"an editable config field nobody reads looks tunable and is not."* Folding into agreed work needs no slot from Kyle.
- **Ledger read:** `#1018` (this), `#1072` (§6), `#937` (B-NONFIAT-QUOTE-DENOMINATION, Infra — the quote set the loader admits; not changed here), `#741` (the one-gate dispatch rule), `#1054` (the retired alert-invokes log), `#596` (archive representativeness). No Kyle-approved decision says the refresh should stay informational — the "informational" wording is the script's own docstring, not a ruling.

## 5. OBJECTIVES — each with its verification and PROOF line

**OBJ-1 — The daily refresh changes what the running recorder listens to, without a restart.** Added pairs are subscribed and dropped pairs unsubscribed in the running process.
*PROOF:* after the first natural daily run post-deploy, a status read of the recorder's membership compared to that run's computed universe. **PASS:** set-equal except pinned symbols (OBJ-2), every difference explained by a logged pin or refusal. **FAIL:** any computed symbol absent from the running membership one cycle after the run, or any dropped symbol still subscribed without a pin.

**OBJ-2 — A coin we hold is never dropped.** A symbol with an open position in any mode stays subscribed until that position closes, then leaves at the next refresh; the exit witness keeps vouching.
*PROOF:* unit test (drop of a held symbol → kept + pinned line); live: every `pinned` line names a symbol with an open position at that moment (one `dt-sql` read). **PASS:** zero held symbols ever absent from membership. **FAIL:** any close graded unvouched because its symbol left the universe.

**OBJ-3 — A partial or failed fetch never shrinks the running list.** If any ticker batch fails (batch-level success count, §3(c)), or the result's drop against the **running** membership exceeds the DB-governed share (J6), the refresh REFUSES to apply and says so (#1072 leg b). **The baseline is the running set (OBJ-7's record), never a cache** (F2).
*PROOF:* unit tests: (i) one injected failed batch → refuse; (ii) **the 2026-10-30 run as the named fixture** (`noTicker=712`, 0 pairs) → refuse; (iii) a legitimate 23.45 % drop (110 of 469, the largest in the log) → apply. Membership unchanged on refusal, one refusal line + one alert. **PASS:** refusal fires on (i) and (ii) and on nothing else in tests. **FAIL:** an injected partial or empty result changes membership.

**OBJ-4 — An empty universe at startup does not leave the recorder off for the life of the process.** Today `crypto-spot-archiver.ts:338-339` returns ("universe is empty; archiver not started") and nothing retries; the refresh must start it (#1072 leg a).
*PROOF:* unit test: start with an empty loader → not started; next refresh with a non-empty, complete result → shards connect. **PASS/FAIL:** as stated.

**OBJ-5 — The feed alarm stays honest across a membership change.** A just-added coin does not read as a missing feed before it has had a chance to tick; a dropped coin leaves the alarm's denominator and the age maps.
*Arithmetic first (F4):* there is no per-symbol warm rule to reuse — `isCryptoRecorderWarm` (`crypto-spot-archiver.ts:135-137`) is one process-wide clock, and `getCryptoRecorderSymbolAges` (`:117-128`) reports `ageMs: null` for a symbol that never updated. Today's largest add, 35 of 461, is 7.6 % of the universe against floor 0.60 and a live share Langston measured at 93.0-100.0 % (median 98.6 %) over `#1232`'s first 48 h. Step 2 states whether a single run's adds can breach and builds a warm rule only if they can.
*PROOF:* unit tests on the denominator across an add and a drop (and the warm rule if built); live: no `recorder` feed-whole page within the hour after the first natural refresh. **FAIL:** a page caused by an added symbol before its first tick, or a dropped symbol still counted.

**OBJ-6 — The refresh runs where it can act: in the app, on the governed cron lane.** One registered job, one occurrence per day, catch-up per the lane's policy; the standalone script, its crontab line and the `/tmp` cache are retired under rule 18 (archived as `.removed`, `DELETED_COMPONENTS_LOG.md`).
*PROOF:* a `scheduled_job_occurrences` row per day with its occurrence id (corrected at Step 2); `crontab -l` on staging no longer holds the line; the script archived. **FAIL:** two refreshers running, or a day with no occurrence row and no recorded miss.

**OBJ-7 — Every membership change leaves a durable record** — added / dropped / kept / pinned / refused per run, enough to answer "which coins were we recording on day D" for `#596` reads later, and the baseline OBJ-3 compares against.
*PROOF:* one record per run, read back for the first natural run. **FAIL:** a run whose membership change cannot be reconstructed.

**OBJ-8 (r2, F8) — The volume floor has one source, and it is the one that says it is tunable.** The production path reads `b74_crypto_min_volume_24h_usd` from `module_constants` with no hard-coded fallback (fails loud if absent), and the JSON's `minVolume24hUsd` field and its "override comes from" note are removed so no editable field is left that nothing reads.
*PROOF:* unit test: change the row → the computed floor changes; row absent → the refresh refuses. Grep at the ref: no production read of `cfg.filter.minVolume24hUsd`. **FAIL:** a floor still taken from the file.

## 6. `#1072` — PROPOSAL (Langston supports; Kyle's list via PM)

`#1072` (CC-C, plan row 118) is the same defect seen from the recorder side — *"the price-history recorder's frozen symbol set"* — plus two siblings: (a) an empty universe at startup means the recorder never starts; (b) the per-batch ticker catch silently omits pairs. **This scope covers all three legs as OBJ-1, OBJ-4 and OBJ-3.** ⇒ **Proposal:** row 118 is marked *covered by row 18* and `#1072` closes with this batch.
**State (r2):** Langston supports it (three legs, one object; splitting leaves two sessions editing the archiver's membership). CC-C has no objection (Discord `1574099964664090715`). **PM Claude carries it to Kyle; nothing moves until he agrees.** If Kyle keeps row 118, OBJ-3/OBJ-4 stay here anyway — OBJ-1 cannot ship safely without them — and row 118 shrinks to whatever remains.

## 7. JUDGEMENT CALLS — STATE AFTER LANGSTON'S STEP-1 READ

- **J1 — In-app cron lane.** ✓ Langston: a crontab signalling the trading process is a new inbound control path for no gain. Settled.
- **J2 — Pin held symbols by reading open positions across both modes at refresh time.** ✓ Langston: a registry is shared state with its own staleness. Settled.
- **J3 — How membership changes on the wire: (i) per-shard forced reconnect vs (ii) incremental subscribe/unsubscribe. OPEN — Step 2 decides.** (r2, F3) (i)'s cost was understated: `forceReconnect` (`recorder-connection.ts:282-301`) is the watchdog's alarm instrument. It unconditionally (a) logs the "forcing reconnect" line the System Manual names as the only carrier of a healing reconnect; (b) increments `consecutiveForced` and pushes `forcedAtMs`, the inputs to `decideRecorderAlert` (`:101-107`); (c) zeroes `liveSinceMs`, the clock `decideRecorderAlertClear` reads (`:111-118`), so a refresh during an open `passive-archive-silent:<conn>` alarm pushes its clear back by 600,000 ms. (i) therefore needs a distinct membership-change path that touches none of the three, which narrows its advantage over (ii).
- **J4 — Pruning dropped symbols from `symbolShard` and `lastTickerUpdateAt`** (`:71`, `:74`). ✓ Langston: required, not optional — the age map is the alarm's denominator.
- **J5 — Warm handling for added symbols.** OPEN, and possibly unnecessary — see OBJ-5's arithmetic. Both options (a per-symbol warm clock, or a grace from subscribe time) are new mechanism.
- **J6 — Completeness gate.** (r2, F1/F2) "Every ticker batch succeeded" (batch-level count) **plus** a drop-share ceiling against the running set, a DB-governed setting with no fallback. **Seed 0.30**, from the whole log (206 runs): median drop share 11.9 %, p90 17.6 %, largest legitimate 23.45 %; the 10-30 run is 100 %. Any value in (0.2345, 1.0) refuses that run and nothing else; 0.30 has margin both ways. *(r1's "largest observed: 60 of 486" was the log's tail, not its population.)* **Step 2 also states the first-refresh-after-a-long-uptime diff as a separate quantity**, because the running set dates from the last process start, not from yesterday.
- **J7 — Per-archiver seam** so row 31 (xStock, CC-C) can reuse it. ✓ Langston. Row 31 stays CC-C's.

## 8. OUT OF SCOPE

The perp recompute and its dependency on the spot loader (unchanged) · the xStock recorder (row 31) · the archive writer's lifecycle (row 119) · a shared ticker as two instruments and the duplicate-guard move (row 19, next) · the quote-currency set (`#937`) · the main Dashboard and AI pages (off-limits).

## 9. DOCUMENTS THIS CLASS OWES (architecture)

Scope (this) · pre-audit (Step 2) · completion report · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `SYSTEM_MANUAL.md` (the recorder's membership rule, the volume floor's source, **and the `:13620` correction** (cited `:13607` in r2)) · `SYSTEM_IMPACT_MAP.md` (rows 3, 7, 13; the cron registry gains a job and a standalone script leaves it) · `DELETED_COMPONENTS_LOG.md` (script + crontab + cache + the JSON floor field) · `SPRINT_TO_LIVE_PLAN.md` row 18 · `RUNNING_ISSUES.md` `#1018` (+ `#1072`) · `PRICING_DATA_ARCHITECTURE.md` §5b.1 (judged) · my task list · memory files.
**(r2, F5) Two observation obligations, landed in the Step-2 commit:** (a) KD-56 — this batch's `open` row in `DEPLOY_WINDOWS.jsonl`, or `dt-deploy` refuses; (b) every PROOF waits on the first natural run, so if the batch sits in observation on a progress report it owes a declared-`open` row in `GOVERNANCE_EXCEPTIONS.md` (the checker's completion-report glob matches `/COMPLETION|COMPLETE/i` only, `checker.mjs:171-177`).

## 10. DEPLOY NOTE

A deploy restarts live trading; no deploy 14:30-21:00Z, avoid 05:25-05:45Z, and respect open `DEPLOY_WINDOWS` rows. The first natural refresh after deploy is the verification event, so the deploy is timed to precede a 03:00Z run (or the lane's catch-up) by enough to read it the same day.
