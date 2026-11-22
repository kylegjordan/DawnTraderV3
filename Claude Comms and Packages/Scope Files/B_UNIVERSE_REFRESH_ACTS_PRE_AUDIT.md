# B-UNIVERSE-REFRESH-ACTS — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**change-class**: architecture · **Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §4 row 18 (KD-26) · **Issue:** `#1018` (+ `#1072` proposed, scope §6)
**Scope:** `Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md` (r2 + Step-2 corrections) · Langston Step-1 PROCEED: Discord `1574101555827970152`
**Audited at ref:** `e3a96a812`. Re-checked at `d48afcc94` (origin at writing): `git diff --stat e3a96a812 d48afcc94` over every cited path is empty, so every `path:line` here holds at both.
**r2 (2026-11-22):** folds Langston's Step-2 AMEND (Discord `1574114943853142089`): the arm-(a) BLOCKER (§0 row 8, §2.2), C1 the refusal ratchet (§0 row 9, §2.2), C2 incremental-subscribe accounting (§0 row 10, §2.4), C3 small denominators (§2.3) and shard identity (§2.9), the DB-governed shard size (§2.10), §0 row 6, and the deploy order against the open windows (§2.2). Part C P1, P3-P5, P7-P9, P11, P12 amended to match. New citations re-read at `09cafecfa`.

---

## 0. PREVIOUSLY STATED / NOW / REASON

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | largest legitimate drop "60 of 486" (scope r1) | **110 of 469 = 23.45 %** | r1 read the log's tail; r2 and this audit read all 206 runs (§2.2) |
| 2 | seven objectives (r1) | **eight** (OBJ-8, the volume floor) | Langston F8, folded at r2 |
| 3 | J5 "possibly unnecessary": largest add 35 of 461 = 7.6 % | **J5 mandatory**: largest add **123 of 365 = 33.7 % of the running set** | the 7.6 % figure measured the add against the NEW computed size of one day; the alarm grades a shard's share of symbols that ticked, so the right ratio is adds over what the shard holds (§2.3) |
| 4 | "a `cron_runs` row per occurrence" | **`scheduled_job_occurrences`** | `cron_runs` appears in 0 files under `server/`, `shared/`, `drizzle/` at the ref |
| 5 | p90 drop share 17.6 % | **17.47 %** (nearest-rank, n = 203) | method now stated; r2 rounded an unstated method |
| 6 | "Murmur3 sharding fix" → (r1 of this audit) "FNV-1a hash-mod" | **FNV-1a plus a Murmur3 fmix32 finalizer** (`crypto-spot-archiver.ts:156-177`), added because bare FNV-1a split 364/16 | r1 of this audit over-corrected; Langston Step-2 AMEND. The header comment `:15-18` goes false at P3 and is rewritten there |
| 7 | System Manual `:13607` | **`:13620`** at `e3a96a812` | the file moved between refs |
| 8 | §2.2 arm (a) "any failed batch ⇒ refuse" would have refused 2026-10-30 | **it would NOT have.** `universe-loader.ts:230-239` never checks `resp.ok` and `result ?? {}` swallows a Kraken error envelope, so a non-2xx or an HTTP-200 `{"error":[…],"result":{}}` does not throw and counts OK on zero rows. Run 182 logged `dead=0, noTicker=712` and **0 of 206** runs carry a `ticker batch … failed` line (positive control: all 206 `crypto_spot loaded:` lines are in the same `2>&1` file) | Langston Step-2 BLOCKER, re-read by me at `09cafecfa`. Arm (a) now means "returned usable rows" (§2.2) |
| 9 | "the refusal leaves membership untouched" (complete as stated) | **a refusal ages the running set, so the next diff is a 2-day diff — a ratchet with no exit.** A k-day drop share is **not measurable** from the log (it prints the first 20 added/dropped plus `(+N)`) | Langston C1; recovery rule in §2.2 |
| 10 | "incremental `sendSubscribe` for adds" (P4) | **an add needs its own expected count, reply window and refusal record** — the open-time timer (`recorder-connection.ts:222`, `:407`) is armed only in `ws.on('open')`, so an incremental reply has no live reader | Langston C2; §2.4 |

---

# PART A — THE AUDIT

## A.1 Six sources read

| # | source | what was read |
|---|---|---|
| 1 | **Code at the ref** | `crypto-spot-archiver.ts` (whole), `recorder-connection.ts` (whole), `universe-loader.ts:98-270, 482-510, 615-640`, `feed-integrity-monitor.ts:380-410`, `cron-registry.ts:30-60`, `cron-occurrence-runner.ts:440-500`, `xstock-universe-cron.ts` (whole), `server/index.ts:90-100`, `server/scripts/b74-refresh-universe.ts` (whole), `server/scripts/perpfeed-monthly-recompute.ts:40-60`, `active-execution-engine.ts:361, 4715-4725`, `drift-dashboard-aggregator.ts:1075-1095`, `server/config/crypto-universe-filter.json`, `kraken-websocket-adapter.ts:1019-1040, 1840-1895` (unsubscribe precedent), the two tests that pass `minVolumeFloorUsd` |
| 2 | **Runtime: logs + DB + host** | `/var/log/dawntrader/b74-refresh.log` whole (206 runs, 2026-05-01 → 2026-11-22); staging root crontab (artifact A.9); `module_constants` row `passive_archive.b74_crypto_min_volume_24h_usd` (scope §4) |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | rows 3 (`:2422`), 6a (`:2426`), 13 (`:2433`); the cron registry block (`:1022`, `:1028` "exactly 6 production node-cron schedules"); `:343`, `:379`, `:501` (passive archive / feed integrity) |
| 4 | **`SYSTEM_MANUAL.md`** | `:7930` (the live-share denominator rule: "the denominator is the universe"), `:13620` (the stale xStock cron description), `:5971` (passive archive bootstrap) |
| 5 | **`BATCH_CATALOG` / `RUNNING_ISSUES` / completion reports** | via `history` (A.4) plus direct reads of `#1018`, `#1072`, `#937`, `#1232`, `#741`, `#1054`; the `B-CRYPTO-FEED-WATCHDOG` and `B-CRON-MISSED-CATCHUP` completion reports for the shape this batch extends |
| 6 | **`bridge/canonical/`** | searched for "universe", "refresh", "subscribe": incidental hits only; the Tier-1 provenance is `BATCH_74_SCOPE.md` / `BATCH_74_PRE_AUDIT.md` and `ce4a7e408` (scope §3) |

## A.2 Entry points — who can start, stop or change the crypto recorder's membership

Enumerated before the census (workflow-02, "enumerate the entry points first"):

| entry | how it reaches the recorder | today |
|---|---|---|
| **App boot** | `server/startup/passive-archive-bootstrap.ts:31` → `startCryptoSpotArchiver()` (`:335-369`) → `loadCryptoSpotUniverse()` once | the ONLY production writer of membership |
| **Root crontab 03:00Z** | `npx tsx server/scripts/b74-refresh-universe.ts` — a separate OS process | computes a list, writes `/tmp/b74-crypto-universe-cache.json`, **reaches nothing in the app** |
| **`stopCryptoSpotArchiver`** (`:371-379`) | exported | **zero callers** (A.3, re-derived) |
| **Test hooks** (`:383`, `:392`, `:399`) | `b-ohlc-frame-guard.test.ts:43` | test-only |
| **Perp monthly recompute** | `server/scripts/perpfeed-monthly-recompute.ts:48/56` → `recomputeCryptoPerpUniverse` → spot loader (`universe-loader.ts:495`) | reads `spot.symbols` only, refuses on empty (`:505-507`); never touches the spot recorder |
| **HTTP / manual** | none found: no route string names the archiver, the loader, or the refresh script | — |

## A.3 Census at every hop

**Hop 1 — the loader (`universe-loader.ts`).**
- `loadCryptoSpotUniverse(opts?)` `:184`, returns `CryptoUniverseResult { symbols; totalCandidates; filterReasons{dead,wrongQuote,offline,noTicker} }` (`~:178-182`).
- Floor: `:192` `floorUsd = opts?.minVolumeFloorUsd ?? cfg.filter.minVolume24hUsd` — the JSON, never `module_constants` (scope §4, F8).
- Ticker batches of 100 (`:224-239`); the per-batch `catch` warns and continues (`:236-239`); a pair with no ticker counts in `noTicker` whether the venue lacks one or its batch failed.
- Callers (complete, `census --symbol`): `crypto-spot-archiver.ts:336`, `universe-loader.ts:495` (perp), `b74-refresh-universe.ts:42`, two tests. The perp caller and the script read `.symbols` only, so **adding a field to the result changes no existing caller.**

**Hop 2 — the archiver's state (`crypto-spot-archiver.ts`).**
| state | line | written by | read by | keyed by |
|---|---|---|---|---|
| `state.shards[]` (each `{id, symbols[], conn}`) | ~`:60-70` | start `:340-366`, stop `:376` | ages `:117-128`, shard ids, health interval `:319` | — |
| `symbolShard` Map | `:71` | start `:356-357`, stop `:378` | `isInCryptoRecorderUniverse` `:140`, live check `:146` | symbol |
| `lastTickerUpdateAt` Map | `:74` | ticker handler `~:276-285` (update messages only) | ages `:117-128` | **symbol only** |
| `firstTickerUpdateAtMs` | `:76` | first ticker update | `isCryptoRecorderWarm` `:135-137` | process-wide |

- `assignToShard` FNV-1a hash-mod over `SHARD_SIZE=300` (`:43`, `:180-187`) — a symbol's shard depends on the shard COUNT, so a growing universe re-homes existing symbols if the hash is reused (J3 below).
- Subscribe: `onOpen: (ws) => subscribe(shard, ws)` (`:303-317`), replays `shard.symbols` for `ticker` and `ohlc`; `expectedSubscribeReplies: () => shard.symbols.length * 2`.
- `stopCryptoSpotArchiver` stops ALL shards and clears `symbolShard`, but **leaves `lastTickerUpdateAt` and `firstTickerUpdateAtMs`**.
- Importers (complete; no namespace import): `active-execution-engine.ts:361`, `drift-dashboard-aggregator.ts:1078` (dynamic), `feed-integrity-monitor.ts:17`, `passive-archive-bootstrap.ts:31`, `b-ohlc-frame-guard.test.ts:43`.

**Hop 3 — the connection (`recorder-connection.ts`).**
- `expectedSubscribeReplies` `:145`; `subscribeRejected` `:193/:219`; `noteSubscribeReply` `:257-261`; `armSubscribeTimer` `:406-424`; `forceReconnect` `:282-301`; `decideRecorderAlert` `:101-107`, clear `:111-118`; `getCachedNumberRequired` `:353-359`.
- **No unsubscribe anywhere** (0 occurrences). A reply the connection did not expect would be counted against the subscribe accounting — so an unsubscribe needs its own reply branch (J3).
- Kraken v2 unsubscribe precedent in-repo: `kraken-websocket-adapter.ts:1840-1895` (send) and `:1019-1040` (reply handling).

**Hop 4 — the readers.**
- **Exit witness** `active-execution-engine.ts:4719-4720`: vouches a crypto close only if `isInCryptoRecorderUniverse(symbol)` AND `isCryptoRecorderSymbolConnectionLive(symbol)`. ⇒ **dropping a held symbol would make its close unvouched** (OBJ-2).
- **Feed alarm** `feed-integrity-monitor.ts:387-405` `computeRecorderLiveness`: no shards → not graded (`no_recorder`); either of `recorder_live_window_ms` / `recorder_live_share_floor` null → `config_missing`; not warm → `warming`; else per shard `liveShare = proportionFresh(items, windowMs)`, **critical if `liveShare < floor`**. A symbol that never ticked has `ageMs: null` → not fresh. ⚠️ **An EMPTY items list gives `proportionFresh([]) = 0`, which grades critical** (A.7 lead, re-derived).
- **Drift dashboard** `drift-dashboard-aggregator.ts:1078/1093` `getCryptoSpotStats` — counts only; unaffected.

**Hop 5 — the scheduler (`cron-registry.ts`, `cron-occurrence-runner.ts`).**
- `CronRecoveryPolicyKey` union `cron-registry.ts:35-41` (6 keys); `POLICY_MAX_LAG_MS` `cron-occurrence-runner.ts:465-472` (`xstock_universe_discovery_cron: 4 * 60 * 60_000`); the test enumeration `b-cron-missed-catchup.test.ts:476, 506`. **Three lists that must agree** (blind-spot 1).
- Precedent `xstock-universe-cron.ts`: callback `await cronOccurrenceRunner.runNatural(JOB_NAME, context.date)`, recovery `run` registered with the registry, `execution: 'missed'` → `dispatchMissed`, `prepareJob`. Wired at `server/index.ts:95-97`.
- Durable identity `(job_name, scheduled_for)` in `scheduled_job_occurrences`.

## A.4 History aid (`history`) — and what it cannot see

8 commits across 5 batches touch the archiver: B-CRYPTO-FEED-WATCHDOG `dc8a5cf1c` / `bd3b5ff7d` / `208e824a6`; B-OHLC-FRAME-GUARD `12d1bd1cd`; B69 `18372159b`; B74.1 `b8eba807e`; B74 `778cd4ed1` / `ce4a7e408`. `RUNNING_ISSUES` cites: `#594` `:20`, `#741` `:4104`, `#937` `:6333`, `#1028` `:9022`, `#1029` `:9071`, `#1033` `:9150`, `#1054` `:9422`, `#1072` `:10292`, `#1232` `:11571`. 0 `DECISIONS` rows; 0 `DELETED_COMPONENTS_LOG` rows.
**Cannot see (quoted from the aid):** ids that appear only in commit bodies; prose names; basename collisions; multi-hop renames. ⇒ the B74 provenance (scope §3) was read from the documents and the commit body directly, not inferred from this list.

## A.5 Census aid (`census`) — and what it cannot see

`census --symbol loadCryptoSpotUniverse`: 13 uses in 5 files; reached from `passive-archive-bootstrap.ts:31` and `:29` (→ `equity-spot-archiver.ts:23`); **not reached:** `b74-refresh-universe.ts` and two tests; 0 entry points.
**Cannot see (quoted):** raw SQL; string-keyed access; computed imports; JS / shell / Python / systemd; TS outside the tsconfig includes (`scripts/` ~40 files, `docs/`, `e2e/`); HTTP-string routes; host cron; non-standard entry points.
`census --path` adds: PM2 dist mapping is by assumption.
⇒ **The host crontab is exactly the entry point this aid cannot see** — it was read on the host (A.9). **`scripts/` note:** the aid does not cover top-level `scripts/`; grepped by hand: `scripts/analysis/book-volume-probe.mjs:59` `FLOOR_USD = 10000` (a literal copy of the floor, OBJ-8) is the only hit for the loader, the floor, or the refresh script there. The perp monthly script lives at `server/scripts/` (inside the includes), not `scripts/`.

## A.6 Deletion-time state-write census (what this batch removes)

| removed | its writes | surviving readers |
|---|---|---|
| `server/scripts/b74-refresh-universe.ts` | `/tmp/b74-crypto-universe-cache.json`, `b74-refresh.log` (via crontab redirect) | the cache: the script itself only (one non-md mention tree-wide). The log: humans + this audit. **No code reader.** |
| the crontab line | runs the script | — |
| `/tmp/b74-crypto-universe-cache.json` | — | none |
| JSON `filter.minVolume24hUsd` + `_minVolumeNote` (`crypto-universe-filter.json:8-9`) | — | `universe-loader.ts:192` (moves to `module_constants`), tests at `b-feed-health-grade-arm.test.ts:217` and `b74-universe-loader.test.ts:100` pass `opts.minVolumeFloorUsd` and keep working; `book-volume-probe.mjs:59` comment cites the field (updated) |
| `stopCryptoSpotArchiver` (proposed, J8) | `state.enabled`, shards, `symbolShard` | **zero callers** — re-derived: the importer list in A.3 is complete and none imports it |

Comments that name the retired script and are updated: archiver `:11-12`, JSON `:2`, `b-disk-file-tiering.test.ts:113`, the `b74-refresh-universe.ts:19` docstring (archived with the file). Frozen Codex Audit artifacts (`CITATION_CHECK.json:441/461`, `FINAL_PROVENANCE.json:79`) are left as records.

## A.7 Second reader (one pass, two claims, both mode B)

- `REVIEWER: claim-only · what states are consistent with "an added symbol with no tick reads as not-fresh and can push a shard under the floor" · mechanism holds; the dip depends on how adds enter sh.symbols; lastTickerUpdateAt is keyed by symbol so a re-added symbol carries a stale age; warm-up is process-level · re-derived y`
  ⇒ two leads re-derived at the ref and folded: (a) J4 must also prune `lastTickerUpdateAt` and guard its write (`:74`, `~:276-285`); (b) an all-new shard has no gradable symbols and `proportionFresh([])` = 0 grades critical (`feed-integrity-monitor.ts:387-405`) — J5 must skip it.
- `REVIEWER: claim-only · what states are consistent with "stopCryptoSpotArchiver has no production caller" · only the definition in repo; indirect / namespace forms not searched by the reader · re-derived y (importer list complete, no namespace import)`

## A.8 Blind-spot lines

| # | blind spot | status |
|---|---|---|
| 1 | **Value lists that must agree** | COVERED: `CronRecoveryPolicyKey` (`cron-registry.ts:35-41`), `POLICY_MAX_LAG_MS` (`cron-occurrence-runner.ts:465-472`), the test enumeration (`b-cron-missed-catchup.test.ts:476, 506`) all gain `crypto_universe_refresh_cron`; SIM `:1028` "exactly 6" → 7 |
| 2 | **Literal copies** | COVERED: the floor `10000` lives in the JSON `:8`, `book-volume-probe.mjs:59`, two seed migrations (`2026-04-22b…:94`, `2026-05-01-b74…:243`) and one rollback (`:22`); the JSON copy is removed, the probe comment repointed, seeds left (they are the row's origin) |
| 3 | **Properties / fields** | COVERED: `CryptoUniverseResult` gains `batchesOk` / `batchesTotal`; every caller reads `.symbols` only (A.3 hop 1) |
| 4 | **Sibling producers** | COVERED: the xStock recorder also loads once (`equity-spot-archiver.ts:616`) — row 31, CC-C; J7 builds a reusable seam, xStock untouched here. The perp recompute is a sibling consumer, untouched |
| 5 | **Site meaning** | COVERED: `isInCryptoRecorderUniverse` today means "in the boot list"; after this batch it means "currently subscribed", which is what the exit witness always assumed. No reader relied on the frozen meaning (A.3 hop 4) |
| 6 | **Error paths** | COVERED: the per-batch catch (OBJ-3); a socket not OPEN at refresh (J3 mutates state first, the next `onOpen` replays it); unsubscribe rejection (own reply branch); the occurrence runner's failure recording (the callback throws on refusal-free failure, refusals are recorded outcomes, not throws) |
| 7 | **Library behaviour** | COVERED with one wire check owed: Kraken v2 `unsubscribe` reply shape is taken from the in-repo precedent (`kraken-websocket-adapter.ts:1019-1040`); **Step 3 confirms it offline against a live socket in a throwaway script before any deploy** (`#761`: never test in production) |
| 8 | **`scripts/`** | COVERED: A.5 note — one literal copy, repointed |

## A.9 Artifact — staging root crontab (read 2026-11-22 17:07:38Z, line 2)

```
0 3 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-refresh-universe.ts" >> /var/log/dawntrader/b74-refresh.log 2>&1
```
Committed here so Langston's read of it is not `RULED ON REPORTED FACT`.

---

# PART B — DECISIONS FROM THE AUDIT

## 2.1 Population for every number below
**Object:** `/var/log/dawntrader/b74-refresh.log` on staging. **Population:** every run in it, 2026-05-01 → 2026-11-22 = **206 runs** (3 skipped as non-comparable: the first run has no prior; run 182 is the empty run; run 183 rebuilt from the empty cache) ⇒ **n = 203 day-over-day diffs.** Quantiles are nearest-rank. Re-derivation: the `universe: N pairs (added=A, dropped=D, kept=K)` line per run.

## 2.2 J6 — the completeness gate (OBJ-3)
- **Run 182 (2026-10-30T03:00:01.982Z):** 0 pairs, `noTicker=712`; would have dropped all 428. Run 183 rebuilt 481 from the empty cache.
- **Drop share** (dropped ÷ prior size, n = 203): median **0.1190**, p90 **0.1747**, max **0.2345** (110 / 469). Sizes ranged 301-527.
- **Why arm (a) as first written was a false instrument (§0 row 8):** one silently-empty batch removes ≈ 59 of ~469 symbols ≈ **0.126** drop share, indistinguishable from a median day by arm (b) and invisible to a "did it throw" arm (a). That partial silent outage is the event the gate exists for.
- **Gate arm (a) — "returned usable rows":** the loader returns one record per batch `{ok, httpStatus, krakenError, rowsRequested, rowsReturned}`. A batch is OK only if `resp.ok` **and** Kraken's `error` array is empty **and** `rowsReturned > 0`. Any batch not OK ⇒ REFUSE (`refusal_reason = incomplete_fetch`).
- **Gate arm (b):** drop share against the **running** set > `crypto_spot.universe_refresh_max_drop_share` ⇒ REFUSE (`refusal_reason = drop_share`). Seed **0.30** = 1.28 × the worst observed one-day share and nothing more; DB-governed via `getCachedNumberRequired`, **no fallback** (absent ⇒ refuse).
- **The ratchet, and its exit (Langston C1).** A refusal leaves membership untouched, so the running set ages and the next measurement is a multi-day diff — more likely to breach, with no exit. **Rule: every run whose arm (a) passes stores its computed list (`computed_symbols`, P8), refused or not. A run refused only by arm (b) is APPLIED by the next run whose arm (a) passes and whose list is within the threshold of that stored list** — two consecutive complete answers that agree confirm a large change. ⇒ the gate's baseline is always the last complete computed answer, so a refusal costs at most one extra day and never compounds. A missed occurrence (J9, §2.8 — past 4 h it never runs) widens both baselines the same way and exits the same way.
- **Escalation:** each refusal raises one alert (one dedupe key) carrying `consecutive_refusals` and `running_set_age_hours`; **info at 1, warning at 2, critical at 3.** Two consecutive arm-(b) refusals mean two complete answers that disagree with each other, not a one-off.
- **Recovery is not "restart the app":** a restart reconnects every shard — the watchdog's own alarm instrument (scope F3) — and rebuilds from an ungated boot load. The confirmation rule above is the recovery; no operator step is needed.
- **The first refresh after a long uptime is not measurable in advance:** the running set dates from the last process start. ⇒ **the Step-6 deploy is timed just before a 03:00Z run**, so the first diff is one day's. **Order against the other open windows (Langston 2026-11-22, Discord 1574115300243279906 point 2):** B-ENTRY-GATE runs to 11-23T21:00Z; NEW Claude's post-window deploy (B-PRICE-FEED-COVERAGE OBJ-5 + B-AI-BRIEF-OFF) then needs 25 h of uptime, to ≈ 11-24T22:00Z. ⇒ **this batch's Step-6 deploy goes after that read, at the first 02:30-02:55Z slot after it (earliest 11-25), or folds into NEW Claude's sha if Steps 3-5 finish first — agreed with NEW Claude in `#general` before deploying.** Every other open DEPLOY_WINDOWS row is closed or named `--in-window` in the deploy turn.
- **The boot load stays ungated** (nothing to shrink from) but **unions the J2 pins** and logs the per-batch records. Stated residual: a boot whose fetch silently loses a batch starts ~59 symbols short; the first refresh adds them back (adds are ungated).

## 2.3 J5 — warm handling for added symbols: MANDATORY
- **Add share against the running set:** median 0.1211 (against the new size), p90 0.1614, max 0.2639; **against the prior running set the worst case is 123 / 365 = 0.337.**
- If every add lands in one shard and none has ticked, that shard's live share is at worst (300 − adds) × 0.93 / 300; with 183 adds into one 300-slot shard that is **0.567 < floor 0.60** ⇒ a false page is reachable. (0.93 = the lowest live share Langston measured over `#1232`'s first 48 h.)
- **Rule:** an added symbol is excluded from its shard's denominator until its first update **or** one `recorder_live_window_ms` after its subscribe confirmation, whichever is first. Uses the existing window constant; **no new constant.** The process-level warm clock is unchanged. (0.567 rests on Langston's carried 0.93 figure — PLAUSIBLE, not confirmed; J5 is mandatory on the 123 / 365 = 0.337 ratio alone.)
- **Small denominators (Langston C3 i).** The grace rule shrinks the gradable list, and it can get small: a brand-new shard starts with every symbol in grace, so "2 gradable, 1 quiet" would grade critical. n cannot be proven large, so: **a shard whose graced symbols outnumber its gradable symbols is not graded that tick** (this includes n = 0). The suppression is bounded: a graced symbol leaves grace at its first update or one window after confirmation, then counts with its real age (`null` if it never ticked). ⇒ a dead shard is still graded critical at most one `recorder_live_window_ms` later. A ratio of the shard's own counts, not a tunable.

## 2.4 J3 — how membership changes on the wire: incremental subscribe / unsubscribe
- **Never `forceReconnect`** — it is the watchdog's alarm instrument (scope J3, F3).
- **Order:** mutate `shard.symbols` and `symbolShard` FIRST, then send. If the socket is not OPEN, skip the send — the next `onOpen` replays the mutated `shard.symbols`.
- **Unsubscribe replies** get their own branch and counters, so they count neither against `expectedSubscribeReplies` nor as a `subscribeRejected`.
- **Shard stability (a stated departure from hash-mod):** existing symbols stay in their shard; an add goes to the least-full shard under the shard size; a new shard opens only when all are full; a shard emptied by drops is stopped. ⇒ no add ever re-homes an existing symbol. Langston C3: the add side self-levels; a third shard needs > 600 symbols against an observed max of 527.
- **Incremental subscribe accounting (Langston C2).** Today `subscribeOk` / `subscribeRejected` reset at open (`recorder-connection.ts:218-219`) and are read by the open-time reply timer (`:414-416`) and the `forceReconnect` log line (`:289`); that timer is armed only in `ws.on('open')` (`:222`) and captures `expectedSubscribeReplies()` once (`:407`). An incremental add arriving after it has fired would write into counters nobody reads again — the `#1232` failure re-opened on a new path. The feed alarm cannot cover it: after grace a dead add costs ≤ 1/300 = **0.0033** of a shard against a 0.40 margin. **Rule:** each incremental subscribe carries its own `req_id` (distinct from the open-time subscribe) and is tracked in a per-connection `pendingAdds` map (symbol → sentAtMs). Replies are routed by `req_id`, so they never touch the open-time accounting. On success the symbol leaves `pendingAdds` and its grace clock starts. **On rejection, or no reply within the existing `subscribeReplyTimeoutMs`, the symbol is removed from `shard.symbols`, `symbolShard` and the age maps** (never a permanent null) and recorded as `rejected_adds` / `unconfirmed_adds` in the run record with one log line. **No `forceReconnect`.** The next refresh re-adds it if it still qualifies. Whether Kraken v2 echoes `req_id` on subscribe and unsubscribe replies is owed to the P12 wire check; if it does not, routing falls back to `result.symbol` and a symbol-less reply while `pendingAdds` is non-empty is recorded as unattributable.

## 2.5 J4 — pruning a dropped symbol
Prune `shard.symbols`, `symbolShard` **and** `lastTickerUpdateAt` (keyed by symbol only — a re-added symbol would otherwise carry a stale age). Guard the ticker write with `symbolShard.has(symbol)` so a late message for a dropped symbol does not re-create its age.

## 2.6 J2 — pins
Read `active_open_positions` where asset class is crypto spot, **both modes**, at refresh time. A pinned symbol stays subscribed; it leaves at the first refresh after its position closes. Each pin is a line in the run record.

## 2.7 J8 (new, for Langston) — `stopCryptoSpotArchiver`
Zero callers; it stops ALL shards (so it is no model for a per-shard stop) and leaves the age maps stale. **Proposed: disposition 1 under rule 18 — delete in this batch**, recorded in `DELETED_COMPONENTS_LOG.md`, the refresh's own per-shard stop replacing it.

## 2.8 J9 (new, for Langston) — the lane's max lag
`crypto_universe_refresh_cron`, `0 3 * * *` UTC. **`POLICY_MAX_LAG_MS` 4 h** (Langston: YES), matching `xstock_universe_discovery_cron` — a missed 03:00Z run caught up by 07:00Z is still a same-day answer; later than that, it is never run and the next natural run is closer. Its effect on the gate is bounded by the §2.2 confirmation rule. **J8: Langston YES.**

## 2.9 Shard identity (Langston C3 ii)
`stop()` deletes the connection from the registry (`recorder-connection.ts:497-503`) and does **not** resolve `passive-archive-silent:<key>` (`:435`). ⇒ stopping an emptied shard could leave an active alert with no clearing instrument, and a reused shard id would dedupe-suppress the next shard's genuine page (the `hasOpen` adopt at `:376` saves that only partly). **Rule:** shard ids are monotonic within a process and never reused; before an emptied shard's `stop()`, its silent-alert key is resolved through the existing `resolveByKey` dep with evidence `shard emptied by crypto universe refresh, occurrence <id>`.

## 2.10 Shard size becomes DB-governed (Langston minor)
`SHARD_SIZE = 300` is hard-coded (`crypto-spot-archiver.ts:43`), while `:8` and `RUNNING_ISSUES:9450` name a constant `b74_crypto_ws_shard_size` that exists nowhere else in the tree. P3 makes it a load-bearing capacity rule, so **it becomes `passive_archive.b74_crypto_ws_shard_size`, read via `getCachedNumberRequired` (no fallback), seeded 300 in the P8 migration.** The header comment `:8`, `:12` and `:15-18` is rewritten at P3.

---

# PART C — THE IMPLEMENTATION PLAN (every item back-references its finding)

| # | item | finding |
|---|---|---|
| P1 | `loadCryptoSpotUniverse` returns one record per Ticker batch `{ok, httpStatus, krakenError, rowsRequested, rowsReturned}` — `ok` only if `resp.ok`, Kraken `error` empty and `rowsReturned > 0`; floor from `module_constants` `passive_archive.b74_crypto_min_volume_24h_usd` via `getCachedNumberRequired`, `opts.minVolumeFloorUsd` kept for tests; absent row ⇒ throw | A.3 hop 1, §0 row 8, §2.2, OBJ-8 |
| P2 | Remove JSON `:8-9`, update the JSON `:2` comment, loader `:98` / `:110` comments, `book-volume-probe.mjs:59` comment | A.6, A.8 #2, OBJ-8 |
| P3 | Archiver: `applyCryptoUniverseChange({add, drop})` — the J7 seam — doing the §2.4 order, shard placement (shard size from `passive_archive.b74_crypto_ws_shard_size`, §2.10), §2.5 pruning, monotonic never-reused shard ids, resolve-then-stop for an emptied shard (§2.9), and "start if not running"; rewrite the header comment `:1-20` | A.3 hop 2, §2.4, §2.5, §2.9, §2.10, OBJ-1, OBJ-4 |
| P4 | `recorder-connection.ts`: `sendUnsubscribe` + an unsubscribe-reply branch with its own counters; incremental `sendSubscribe(symbols, reqId)` with a per-connection `pendingAdds` map, replies routed by `req_id`, its own timer on `subscribeReplyTimeoutMs`; a rejected or unconfirmed add is withdrawn from the shard and the age maps and returned to the caller, never `forceReconnect` | A.3 hop 3, §0 row 10, §2.4 |
| P5 | Per-symbol `subscribedAtMs` map, set on subscribe confirmation; `getCryptoRecorderSymbolAges` marks a symbol not-yet-gradable per §2.3; `computeRecorderLiveness` excludes them and does not grade a shard whose graced symbols outnumber its gradable ones | A.3 hop 4, A.7, §2.3, OBJ-5 |
| P6 | New `crypto-universe-refresh-cron.ts` on the `xstock-universe-cron.ts` shape; wired at `server/index.ts` after `:97`; the key added to the union, `POLICY_MAX_LAG_MS` (4 h) and the test enumeration | A.3 hop 5, A.8 #1, §2.8, OBJ-6 |
| P7 | The refresh body: load → gate arm (a) → pins (§2.6) → gate arm (b) against the running set, with the §2.2 confirmation against the last stored complete list → apply (P3) → record (P8) → alert on refusal with the info / warning / critical escalation | §2.2, §2.6, OBJ-1/2/3 |
| P8 | Table `crypto_universe_refresh_runs`: occurrence_id, started_at, finished_at, outcome (`applied` / `applied_confirmed` / `refused` / `noop`), refusal_reason (`incomplete_fetch` / `drop_share`), count_before, count_after, computed_count, **computed_symbols** (jsonb, the full list — the confirmation baseline), added / dropped / pinned (jsonb), **rejected_adds / unconfirmed_adds** (jsonb), **batches** (jsonb, the P1 records), floor_usd, drop_share, max_drop_share, consecutive_refusals, **running_set_age_hours**. Migration `git add -f`, `MANIFEST.txt` entry, **rollback file tracked in git** | OBJ-7, §2.2, §2.4 |
| P9 | Seed `crypto_spot.universe_refresh_max_drop_share = 0.30` and `passive_archive.b74_crypto_ws_shard_size = 300` in the same migration | §2.2, §2.10 |
| P10 | Delete `stopCryptoSpotArchiver` (if J8 is ruled yes); archive `b74-refresh-universe.ts` as `.removed`; remove the crontab line at deploy; delete `/tmp/b74-crypto-universe-cache.json`; all in `DELETED_COMPONENTS_LOG.md`. Update archiver `:11-12` and `b-disk-file-tiering.test.ts:113` comments | A.6, §2.7, OBJ-6 |
| P11 | Tests: a throwing batch ⇒ refuse; **an HTTP-200 Kraken error envelope ⇒ refuse (the mirror of the 2026-10-30 run)**; a non-2xx ⇒ refuse; **one silently empty batch out of eight ⇒ refuse though its drop share is ≈ 0.126**; **the 2026-10-30 run as a named fixture, refused by arm (a) and not by arm (b)**; the 110 / 469 drop ⇒ apply; a share-only refusal then an agreeing complete run ⇒ `applied_confirmed`; two disagreeing refusals ⇒ warning, three ⇒ critical; held symbol ⇒ pinned; empty boot then complete refresh ⇒ started; denominator across an add and a drop; graced-outnumber-gradable shard not graded, and graded critical once the window passes; a rejected add and a timed-out add withdrawn, no reconnect; emptied shard's alert resolved before stop and its id never reused; floor and shard-size rows changed and absent; shard placement never re-homes; unsubscribe reply not counted as a rejection | OBJ-1…8, §2.2, §2.3, §2.4, §2.9 |
| P12 | Offline wire check against a live Kraken v2 socket, in a throwaway script, before Step 4: unsubscribe reply shape, **and whether subscribe and unsubscribe replies echo `req_id`** (§2.4 fallback otherwise) | A.8 #7, §2.4 |

**Nothing in the plan is `UNAUDITED`.**

**Governance owed at Step 10** (scope §9): System Manual (the membership rule, the J5 grading rule, the floor's source, the `:13620` correction), System Impact Map (rows 3 / 7 / 13; cron registry 6 → 7; the standalone script leaves), `DELETED_COMPONENTS_LOG`, `BATCH_CATALOG`, `PHASE_HISTORY`, plan row 18, `#1018` (+ `#1072`), `PRICING_DATA_ARCHITECTURE` §5b.1 judged, task list, memory files. **Landed in this Step-2 commit:** the `DEPLOY_WINDOWS.jsonl` open row (KD-56).

---

## PLAIN-LANGUAGE SUMMARY

Every day the system works out which coins are worth recording, and today nothing uses that answer. This plan makes the running recorder add and drop coins live, one at a time, without the full reconnect the feed watchdog treats as an alarm. It never drops a coin we hold. It refuses to apply a list that came back incomplete or shrank by more than 30 %. "Incomplete" now means any part of the price lookup that came back empty or with an error, not only one that crashed, because on October 30 the lookup failed quietly and nothing crashed. If a big drop is real, the next day's answer will agree with it and it is applied then, so a refusal costs at most one day instead of piling up. A coin the exchange refuses to send is simply dropped and retried the next day, without a reconnect. And it gives each newly added coin a short grace period before the feed alarm counts it, because on the worst day in the log enough coins were added at once to trip a false alarm. The job moves into the app's own scheduler, the old standalone script is retired, and every run leaves a record of what changed.
