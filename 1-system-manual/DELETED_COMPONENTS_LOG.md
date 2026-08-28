# DELETED COMPONENTS LOG

> **Tier-2 governance (Kyle directive 2026-06-13).** When legacy code is removed, it is recorded here — never left stubbed/commented/deprecated/lingering in the live tree. Each entry: what was removed, why, the blast-radius verification that proved it safe, the archive copy path, and the removal commit. Archived copies live under `1-system-manual/_archive/deleted-code/` with a `.removed` suffix (non-compilable). The git history is the authoritative full archive; the `_archive` copy is for quick browsing.
>
> **Why this exists:** lingering legacy code creates confusion and the risk that dead paths accidentally re-enter the live system. See CLAUDE.md §5 rule 18 (legacy-removal policy, 2026-06-13 strengthening).

---

## `PAYLOAD_DIR` (token-watch) — DELETED 2026-08-28 (Kyle asked; it never had a writer)

**WHAT:** the storage constant `PAYLOAD_DIR = f"{ROOT}/payload"` (`token-watch/config.py`), its entry in `store.ensure_dirs()`, and its entry in `tier.TIERED_SOURCES`. `PAYLOAD_HOT_DAYS` was **renamed to `BULKY_HOT_DAYS`, not deleted** — it governs the tiering loop for every source, so a name tied to one store would have read as if the surviving store had no stated retention.

⛔ **WHY: IT HAD ZERO WRITERS IN ITS ENTIRE HISTORY.** It was an empty directory that `ensure_dirs()` created and the daily tiering job walked, finding nothing, every day.

★ **KYLE'S PREMISE WAS WRONG AND HIS CONCLUSION WAS RIGHT — recorded because the distinction is the useful part.** He asked whether it was *"a leftover of the build we were setting up outside the staging server."* It was not: `PAYLOAD_DIR` is host-independent and predates the Helsinki-vs-staging question entirely. **It was never a host artefact — it was a scope line that was never implemented.** `B_TOKEN_WATCH_SCOPE.md:61` declares *"birth payload + follow-up series (bulky) → 1 day → daily `.jsonl.gz` → warm → cold"*, and the store was created for that role and then never wired to anything.

⇒ **RULE 24 OUTCOME (3) — legacy that no longer fits intent.** Its declared role (bulky birth payload, 1-day retention) is now genuinely performed by `provenance/raw/` — built 2026-08-28 for a security reason, at the same 1-day retention. Two names for one job, one of them empty.

**BLAST-RADIUS VERIFICATION — before cutting:**
- **§9.5(a) census, every hop:** WRITERS **zero** · READERS **zero** · MUTATORS **zero** · DELETERS `tier.tier_payloads` (walked it) · SCHEDULERS the daily `token-watch-tier.timer` (walked it).
- ⛔ **PRESENCE-EVIDENCE FOR THE ABSENCE (rule 22), and my first instrument was DEAF:** a grep for write-shaped lines mentioning the constant returned **0 for `BIRTHS_DIR` and `OBSERVATIONS_DIR` too**, which are certainly written — writes go through `_append(birth_path(...))`, so the directory constant never appears on the write line. **The discriminating instrument is the path-builder census:** every written store has one (`birth_path`, `due_path`, `tombstone_path`, `observation_path`, `state_path`); **`payload_path` has never existed**, so nothing could construct a path into it.
- **`git log -S PAYLOAD_DIR -- token-watch/`:** 3 commits; the constant only ever appeared in config, `ensure_dirs`, tier and tests. **No writer was ever added and then removed.**
- **Fresh-context reviewer, claim-only mode**, asked *"what other states of the world are consistent with these objects?"* — enumerated and checked 13 routes a writer could take that a naive grep would miss (helper/path-builder, variable base, string literal, relative path + `WorkingDirectory`, env redirection, `subprocess`/shell redirect, dynamic access, test fixture in production, systemd unit, off-repo cron/tmpfiles/logrotate on the live box, deployed-vs-repo drift by `md5sum`, symlink/bind-mount, and a since-removed writer). No writer found by any route. ⚠️ **It also correctly refused to treat the empty directory on staging as evidence** — every other store is empty too, since nothing has been recorded yet, so that observation has no discriminating power. **The code analysis carries this; the directory listing does not.**
- **221 checks / 8 suites green after removal**, including a new block asserting the constant is gone and that nothing tiers a `payload` source.

⚠️ **WHAT WAS DELIBERATELY KEPT: the per-source cold-name PREFIX**, though only one source now remains. Stores name files by date, so a second source would collide and silently overwrite. Removing the prefix would make the NEXT addition unsafe by default, and this batch is itself the evidence that additions happen and get missed. `test_tiering` block 4 now asserts it against an **injected** second source, so the guarantee stays tested with one real store configured.

⛔ **LEFT INTENTIONALLY, AND IT IS AN OPEN SCOPE QUESTION, NOT AN OVERSIGHT — RULE 24 OUTCOME (2):** the scope line above also covers the **follow-up series**. `record_observation` persists **extracted fields only**; the raw provider responses from follow-up calls are parsed and discarded, and no store retains them. **That is unchanged by this deletion** — `PAYLOAD_DIR` never held them either. Whether they should be retained is a decision for Kyle (it trades ~3.4 GB over 90 days against the ability to rebuild observations if the parser proves wrong), and it is recorded as a question rather than answered here.

**ARCHIVE:** no file was removed — the deletion is four lines across three modules. Git history is the archive; `git log -S PAYLOAD_DIR -- token-watch/` reaches it.
**RESTORE PATH:** re-add the constant to `config.py` and the entry to `TIERED_SOURCES`. ⛔ **Do not, without also adding a writer** — restoring it as-is recreates an empty directory with a daily job walking it.

## `guard-whole-fs-scan.mjs` + its two test files — DELETED 2026-08-28 (Langston ruling; lived 4 hours)

**WHAT:** a PreToolUse hook meant to block whole-filesystem scans, because a wedged Google Drive mount on Helsinki makes them hang unkillably. Shipped 2026-08-28 under `#755`, rewritten three times, deleted the same day.

⛔⛔ **WHY IT WAS DELETED — Langston's three reasons, in his order of weight:**
1. **IT BOUND NO ACTOR AT THE HAZARD.** The mount is on Helsinki; a CC session reaches it only over ssh; **Langston, who runs ON that box, does not load this repo's settings.** ★ **The enforcement point and the blast radius do not intersect.** ⇒ *"That isn't partial coverage, it's ZERO COVERAGE WEARING A LABEL — and a label is worse than nothing, because it stops the next reader looking."*
2. ★★ **SHELL IS NOT A REGULAR LANGUAGE, SO THE INSTRUMENT CANNOT CONVERGE.** `$( )`, aliases, `bash -c`, `xargs`, heredocs, variable expansion. **Every tightening traded a false negative for a false positive.** ⇒ *"That's not three bugs, it's ONE PROPERTY OF THE INSTRUMENT, observed three times. v3→v4→v5 pulling against each other is the DIAGNOSIS, not a sign you were close."*
3. ⛔ **THE RESIDUAL WAS DISQUALIFYING ON ITS OWN.** It blocked prose describing itself — **proven live, when the command adding the comment documenting that limitation was refused by the running hook.** ⇒ *"A control that cannot be DESCRIBED IN THE PRESENCE OF ITSELF cannot be audited by anyone, including its author."*

**BLAST RADIUS:** zero. Three files removed (`→` git history), one `PreToolUse` entry unwired from `.claude/settings.local.json`; the other three guards untouched and verified still wired. **No state was written by it and no reader depended on it** — it only ever exited 0 or 2.
**THE RULE SURVIVES, HONESTLY LABELLED:** `CONDUCT.md` §11 now says *"THIS IS A RULE, NOT A GUARD — nothing checks this."*
**RESTORE PATH:** `git log --diff-filter=D -- .claude/hooks/guard-whole-fs-scan.mjs`. ⛔ **Do not restore it. The replacement is `B-GDRIVE-UNMOUNT` — removing the hazard, not matching commands against it.**

## 2026-08-21 — B-BALANCE-TRUTH Step E (#618): two orphaned metric helpers in `active-portfolio-manager.ts`

**What:** `private calculateSharpeRatio(trades)` and `private calculateProfitFactor(trades)` deleted from `server/services/active-portfolio-manager.ts`. Archived to `1-system-manual/_archive/deleted-code/active-portfolio-manager-metric-helpers-2026-08-21.ts.removed`.

**Why:** orphaned by this batch's own change, not by age. Their sole caller was `getPortfolioMetrics` at `:466`, which converted off the 1,000-row capped read onto `storage.getPortfolioMetricComponents()` — SQL sums the components, and **the helpers' branch logic was MOVED to that call site verbatim rather than dropped** (profit factor `Infinity` on gains-with-no-losses but `0` on neither; Sharpe `0` on zero dispersion). Rule 18(a): deleted on the spot rather than left stubbed, because a private method with no callers is precisely the dead path that accidentally re-enters later.

**BLAST-RADIUS VERIFICATION — before cutting:**
- **Zero `this.`-qualified callers remaining** in the class (`grep -c "this\.<name>("` → 0 for both). ★ **Searched `this.`-qualified explicitly**, which is the correction forced by Langston's #734 blocker the same day: a caller census that misses self-calls licenses a false absence.
- **Zero references anywhere** in `server/`, `client/`, `shared/`. **Zero test callers** (`server/tests/`, `server/__tests__/`).
- ⚠️ **`strategy-analytics.ts` carries methods of the SAME NAMES at `:140`/`:143` — a DIFFERENT class with its own implementations, untouched and unaffected.** Recorded because a future grep on either name will return them, and a matching name is not a matching thing.
- **`calculateMaxDrawdown` was NOT deleted** — it retains one caller at `:525`, inside `checkPortfolioHealth`, which Langston ruled HOLDS out of this batch (rides `#734`).
- **§9.5(a-ii) deletion-time state-write census: EMPTY BY CONSTRUCTION.** Both are pure functions taking an array and returning a number — they wrote no instance field, flag, cache, module-level var or DB column, so there is no surviving reader of state they used to write. **Stated explicitly rather than skipped: the census is the check that caller-tracing cannot substitute for, and "pure function" is the answer to it, not an excuse to omit it.**
- **tsc 384 = baseline exactly**, before and after.

**Left intentionally:** nothing. The three-helper set is now one helper with one live caller.

---

## 2026-07-23 — B-REPO-RELOCATE: the `C:\dev` test bench and the Google Drive working repo

**What:** two working copies retired together, both on Kyle's laptop.
1. **`C:\dev\DawnTraderV3`** — the throwaway test bench. Renamed to `C:\dev\RETIRED-DELETE-ME-DawnTraderV3` pending Kyle's own final delete (see the honest note below).
2. **`G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3`** — the former source-of-truth working repo. NOT deleted; **neutralized**: its `origin` push URL is set to `DISABLED://this-folder-is-RETIRED-see-CLAUDE.md-7.1`, and a `__RETIRED_DO_NOT_USE_THIS_FOLDER.md` marker sits at its root naming each session's replacement clone.

**Why:** superseded by one independent clone per session on local NTFS (`CLAUDE.md` §7.1, rewritten and landed at `e54c5ff7b`). The bench existed **solely** because `tsc`/`vitest` could not run on the Drive mount; every clone now runs them directly, so its only reason to exist is gone. The Drive repo is retired because **a git repository on a cloud-sync mount is unsafe by construction** — git's own FAQ, and measured here: a bare repo pushed to `G:` reported SUCCESS holding 2.7 MB with no pack file at all. Same root cause as #542 and #567.

**★ KYLE'S REASONING, and it is the point of the neutralization rather than mere deprecation (2026-07-23):** *"I'm worried that those will get utilized if they're left where they are... The second someone accidentally goes looking for it, they will realize that they can't write to either of those."* A folder that still works will be used by habit. So the control is that a push from either **fails at git**, not at somebody's memory.

**BLAST-RADIUS VERIFICATION — what was checked before anything was touched:**
- **Six stashes in the bench, 2026-06-06 → 2026-07-17**, largest ~1,900 insertions across 60 files. Policy says the bench only ever held *copies*, so these are almost certainly already-landed — **and "almost certainly" is not a basis for destroying data.** A blob comparison against today's origin is **not** a valid test either: those files have moved on in the months since, so "differs from origin" proves nothing either way. All six exported as patches (`git stash show -p --binary`, base commit in each header).
- **One never-committed file**, `server/scripts/b-xstock-freshness-monitor.ts` (~20 KB), present in the bench and the Drive repo and **absent at origin** — verified, not assumed. Archived alongside the stashes, then **claimed by CC-A and landed properly at `c65813bcd`** (#441).
- **Archive:** `root@204.168.141.77:/root/backups/dev-bench-stashes-2026-07-23/` — 7 files, **sha256 verified identical on both ends**.
- **The Drive repo's last local commit `57706ed60`** holds a blob byte-identical (`795fc1b06cd7`) to the one now at `origin/migration/aws-supabase`. **Nothing unique remains in it.**
- **Langston's file access was the ordering constraint and was fixed FIRST.** He had no clone and read the repo through `/mnt/gdrive`; retiring the Drive folder before building `/home/langston/DawnTraderV3` would have cut off his ability to review. Built, verified by him at the ref, and kept at the graded ref by a 5-minute cron.

**⚠️ HONEST NOTE — the bench is renamed, NOT yet deleted.** `rm -rf` was refused by Claude Code's own catastrophic-pattern guard, and I did not route around a safety block on a destructive action with a different tool. A first rename attempt **also** failed at the OS level (`Access denied`) while a control rename in the same parent succeeded — a live handle, released once the other two sessions moved to their own clones, at which point the rename succeeded. Final deletion is Kyle's click. Everything inside is archived and verified, so nothing is at risk either way.

**Left intentionally:** the Drive folder itself, until the sessions that still have it as their launch directory are restarted — a session's working directory is fixed at launch and cannot be changed mid-session.

---

## 2026-07-22 — B-RTB-REFRESH-CONSOLIDATE OBJ-1 (#532): Mechanism A, the duplicate RTB refresh scheduler

**What:** the per-signal, Central-Clock-driven RTB refresh path on `server/core/rtb/ready_to_buy_service.ts` —
`executePerSignalRefresh` · `refreshSingleSignal` · `startRefreshCycle` · `stopRefreshCycle` · the
`centralClock.subscribe('RTB_${mode}')` subscription · the `clockTickHandlers` and `refreshIntervals` fields ·
the `RTB_REFRESH_INTERVAL_SECONDS = 30` constant · the orphaned `executeRefreshCycle` (zero callers, swept per §15) ·
`isRefreshCycleRunning`. Starters removed at `active-execution-engine.ts` (start + both stop sites) and
`trading-bootstrap.ts`.

**Why:** two independent schedulers ran over ONE ready-to-buy queue for ~7 months, double-processing every queued
signal into the SQE (audit: `RTB_REFRESH_AUDIT_2026-07-18.md`). **PROVENANCE (CLAUDE.md rule 24.a — this is what
made it a removal rather than a redesign):** the bucketed `RTBRefreshService` was introduced at **`7a029f390`
(2025-12-23)** explicitly *"decoupling it from the FX5 scan loop"*, followed by `7b31e8665` (load balancing),
`5aee5c0f9` (adaptive pool sizing), `3ebb1f3e2` (bucket filtering). **The single-path ~30s refresh was under strain
and could not keep up; the longer refresh gap between cycles was WEIGHED AND ACCEPTED when the switch was made**
(Kyle, 2026-07-22). `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:125-127,195` documents
**ONE** RTB refresh — the bucketed one. **Mechanism A was never meant to coexist; it simply never got unplugged.**

**Blast-radius verification:** A's data semantics were extracted VERBATIM into the shared `acquireRefreshedInputs`
at `b514fbc73` BEFORE this cut, so the survivor already ran identical logic — nothing was lost but the duplicate
scheduler. Every cut boundary was asserted in-script before deletion. Internal chain closed (`:670 → :734 → :1018`);
`refreshSingleSignal` had exactly one caller. `tcl_watchdog.ts` has its OWN fully-wired `clockTickHandlers` map — a
different class, correctly untouched (noted so a future grep does not confuse them). Langston independently
re-derived all three asks at the ref and confirmed **zero live code references** to any removed symbol.
**Liveness proof:** `rtbRefreshService.start()` is called unconditionally at boot (`server/index.ts:348`), NOT via
the engine lifecycle that started A — so removing A's starters cannot stop refreshing.

**PRESERVED deliberately:** `reEvaluateQueue` — operator-triggered via `routes.ts`, never part of Mechanism A.

**Archive:** `1-system-manual/_archive/deleted-code/ready_to_buy_service.mechanism-a.ts.removed` (non-compilable;
git history is authoritative). **Commits:** `d2306518e` (the retirement) + `373d73612` (stale canonical-claim fix
at `server/index.ts:1436-1439`, caught by Langston at Step-4). CI 4-green; deployed 2026-07-22.

**Post-deploy proof:** ZERO `[A3.R9.3][RTB_REFRESH][TICK]` lines after the restart (timestamp-filtered count = 0),
while `[RTBRefresh][CYCLE_COMPLETE]` continues rotating buckets. Refresh staleness across all 101 queued signals
moved from **5–20s** (both mechanisms) to **min 11s / p50 73s / max 77s**, converging on the 120s macro design.

---

## 2026-07-18 — P19-B8.10 (OBJ-2): the Phase-8 Ready-tab metrics stack — `ExecutionMetricsPanel` + the SLAL audit layer (service + endpoints)

**Why:** Kyle 2026-07-18 — the tables below the Ready-to-Buy table ("RTB execution metrics", "Signal Lifecycle Audit") are Phase-8.8.3/8.8.4 relics from the November-2025 era, superseded by the Filter Diagnostics tabs; "those tables look to be useless to me now, so you can remove all of them." Rule-18 full purge: screen AND machinery — a write-only audit layer whose sole reader was the deleted panel is lingering legacy.

**What was removed:**
1. `client/src/components/trading/execution-metrics.tsx` (648 lines — `ExecutionMetricsPanel` + the never-mounted `ExecutionMetricsCompact`), unmounted from both `paper-trading.tsx` and `live-trading.tsx` Ready tabs.
2. `server/core/audit/signal_lifecycle_audit.ts` (603 lines — the Phase 8.8.4-A SLAL service) + its two routes endpoints (`GET /api/diagnostics/signal-lifecycle`, `POST /api/diagnostics/signal-lifecycle/reset`, tombstone comment left at the splice) + ~15 write-only `record*` telemetry call sites across signal-orchestrator (recordGeneration/recordSizing×2/recordRejection), ready_to_buy_service (recordQueued/recordPromoted), active-execution-engine (recordExecution×2), and trade-safety (recordValidation×2 + the `mapCodeToSLALReason` helper).

**Load-bearing exception (relocated, NOT deleted):** `generateSignalId` — it MINTS the active-path signalId (a stored-data format: rtb_signals.signal_id, position metadata `originalSignalId`, closed-trade joins). Moved VERBATIM to `server/utils/signal-id.ts` BEFORE the service delete, format pinned by `server/tests/unit/signal-id-format.test.ts`.

**Blast-radius verification (PROVEN safe):** repo-wide grep post-purge → zero `signalLifecycleAudit`/`signal_lifecycle_audit` references outside the archive + the relocation-note comment; panel importers were exactly the two mode pages (swapped in-batch); `/api/diagnostics/rtb-metrics` + rtb-metrics-service KEPT (reorg-B3 EV-reject telemetry, consumers independent of the panel); SLAL was memory-backed — no DB tables touched. `tsc`-baseline clean; vitest green (pre-existing env failures proven at clean HEAD).

**Archive:** `_archive/deleted-code/execution-metrics.P19-B8.10.tsx.removed` + `_archive/deleted-code/signal_lifecycle_audit.P19-B8.10.ts.removed`. Commit: (this batch's push).

---

## 2026-07-18 — P19-B8.10 (OBJ-5c): the dead legacy RTB ranker pair — `getTopSignal` + `checkForPromotion`

**Why:** the Directive-11.0E-era promotion ranker: `getTopSignal` ordered the queue by `metadata.rankingScore ?? finalScore` (the RETIRED metric as a silent fallback — the exact leak that made every open-position "Rank" cell show finalScore) + the `FINAL_SCORE_GAP_OVERRIDE` rule; `checkForPromotion` was its only caller and itself had ZERO callers repo-wide — the engine promotes exclusively via `getRankedSignals` (the B7.1 R-multiple ranker, `active-execution-engine.ts:2114`). **2026-06-18 dead-ranker coupling RESOLVED (Langston's June park, discharged not overridden):** getRankedSignals/R-multiple won; rankingScore-ordering was never adopted; the Phase-25 prestudy verdict was delete.

**Blast-radius verification (PROVEN safe):** repo-wide grep (non-test, non-archive) → `checkForPromotion` zero callers; `getTopSignal` exactly one caller = `checkForPromotion` (deleted as a unit — Langston Step-2 precision note). The `ranking-weights.js` import (`computeRankingScore`/`normalizeNetReturn`/`FINAL_SCORE_GAP_OVERRIDE`) went fully unreferenced in the service and was dropped. Companion fence fix: the queue-enrich `rankingScore: input.rankingScore ?? finalScore` fallback removed (only reader was the deleted `getTopSignal`; the RTB display attaches its rank key at READ time via `getDisplayRankKey` — verified unaffected; shadow-pool telemetry columns go honestly null, Langston-confirmed intended). `tsc`-baseline clean.

**Archive note (Langston Step-4 finding ① on record):** the FIRST cut of the archive file over-scooped five LIVE methods (a copy-the-region artifact); regenerated programmatically from git HEAD with a leaked-live-method assertion — the archive now contains EXACTLY `getTopSignal` + `checkForPromotion` + the two removed SLAL blocks.

**Archive:** `_archive/deleted-code/p19-b8-10-dead-ranker-pair.removed`. Commit: (this batch's push).

---

## 2026-07-17 — P19-B8.7 Step-9 (#528): `active-trades-v2.tsx` (1,362 lines) — the bespoke paper Open Trades tab, superseded by the shared VTS-mirror table + adapter

**Why:** Kyle's layout-identity directive + Langston's shared-component ruling (B): the paper Open Trades tab now mounts the SHARED `vts-open-trades-table.tsx` through the pure `paper-trade-adapter.ts`, with the paper shell (IntegrityBanner, count header, mutations, WS refresh) preserved verbatim in the NEW `paper-open-trades-tab.tsx`. The bespoke file is retired per rule 18. **The rule-23 FIX-ON-FIND on record (Langston-required verbatim quote):** this file's WS price-overlay recomputed P/L client-side on every tick using hardcoded constants — `const FEE_PERCENT = 0.0010; // 0.10%` and `const SLIPPAGE_PERCENT = 0.0015; // 0.15%` (`:1125-1126`, commented "same as backend", which they were NOT — fees are DB-governed per-mode/per-class) — so displayed net P/L between server refreshes was computed on fantasy friction. The recompute was DELETED (not constant-patched) in the rewire: server-authoritative numbers + 3s-throttled WS invalidation.

**Blast-radius verification (PROVEN safe):** both mount sites (`paper-trading.tsx`, `live-trading.tsx`) swapped to `PaperOpenTradesTab` in the same batch; repo-wide grep for `active-trades-v2|ActiveTradesV2` post-swap → ZERO importers. Nothing survives unaccounted: shell → `paper-open-trades-tab.tsx` (IntegrityBanner moved verbatim); table markup → the shared components (all columns preserved or Kyle-ruled removed); the B8.9 venue-quiet cell edits OLD Claude briefly carried here were reverted by him pre-push (b28cf7074) — the behavior lives in the shared table via the portable `venue-quiet-price-cell.tsx` + the server's `priceVenueQuiet` (the recorded carry obligation, discharged). `tsc`-baseline clean post-removal.

**Deletion sequencing note:** delete deliberately deferred ~½ day after the mounts were swapped — OLD Claude had in-flight B8.9 edits inside the file (wrench protocol); trigger = his b28cf7074 push (which reverted those edits), per the #528 rider.

**Archive:** `1-system-manual/_archive/deleted-code/active-trades-v2.P19-B8.7-Step9.tsx.removed`. Commit: (this batch's push).

---

## 2026-07-08 — B-STORAGE-HARDEN Wave C (OBJ-2): `b70-retention-sweep.ts` — the DROP-only B70 analytics retention sweep

**Why:** the B70 analytics tables (`signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance`) were DROP-only at 90 days via this standalone cron script — it deleted whole monthly partitions with NO warm/cold tiering, violating Kyle's 2026-05-06 "we don't ever drop data" directive (RUNNING_ISSUES #430 V1, an oversight — B70 shipped 2 days before the never-drop/tiered-storage system). Wave C routes these 5 tables through the SAME proven B75 export→warm→cold move-not-delete path (added to `b75-retention-sweep.ts`'s partitioned-archive inventory + per-table `data_lifecycle.<table>.hot_retention_days=90`). With tiering owning them, the DROP-only sweep is retired per rule 18 (a paused/commented DROP script is a re-entry hazard the next person greps and misreads).

**Blast-radius verification (PROVEN safe):** repo-wide grep for `b70-retention-sweep` → only doc files, ZERO in-app `import`/`require` (standalone cron script). ONE cron reference: the root-crontab line, already PAUSED/commented in Wave A — removed at deploy. No systemd timer unit. Its config constant `b70_postgres_retention_days` was read by this script AND `archive-config.ts:98` (→ `retentionDays`), which the Drift Dashboard aggregator (`drift-dashboard-aggregator.ts:836`) surfaces as a display value — so `archive-config.retentionDays` + the constant are KEPT (now INFORMATIONAL-only, drop-driver gone; comment added at the read site). `tsc`-baseline clean post-removal.

| Item | Location (pre-removal) | What it was / why removed |
|---|---|---|
| `b70-retention-sweep.ts` (whole file) | `server/scripts/b70-retention-sweep.ts` | DROP-only monthly-partition sweep for the 5 B70 analytics tables (`DROP TABLE IF EXISTS` per partition >90d, no archive). Superseded by the B75 move-not-delete tiering (b75-retention-sweep B70_TABLES inventory). Cron `#0 2 * * *` (paused Wave A) removed. |

**Left intentionally (survivors — DO NOT confuse):** `b70-create-monthly-partitions.ts` (create ≠ drop — the tables still need forward partitions; STAYS scheduled); `archive-config.retentionDays` + the `b70_postgres_retention_days` DB row (now display-only, live Drift Dashboard consumer — see the comment at `archive-config.ts` read site).

**Archive:** `1-system-manual/_archive/deleted-code/b70-retention-sweep.ts.removed`. Commit: (Wave C push).

---

## 2026-07-07 — P19-B8.3b: the mislabeled `scanDiag.destinationCount` + its dead `totalDestinationCount` rollup (a serialized-but-unrendered scan-diagnostic field)

**Why:** the per-cycle `destinationCount` on the fx5-scanner `ScanDiagnostics` object was set UNCONDITIONALLY to `taggedVtsSurvivors.length` even when `destination === 'active_pool'` — a MISLABEL. It was serialized to the crypto FD client (via `getLastScanDiagnostics()` in `/api/vts/filter-diagnostics`) and typed at `vts-shared.tsx:154`, but the panel NEVER read it (transported-but-unrendered — the displayed "VTS Destination" numbers come from other survivor fields). Its rolling-aggregate sibling `totalDestinationCount` had ZERO readers anywhere. Retired per rule 18 (no lingering mislabel that a future consumer-add could read against a gone field). **This is a RESPONSE-SHAPE narrowing** (safe — proven no reader) of the `/api/vts/filter-diagnostics` `lastScan`/`rolling24h` payloads. Commit `9e91245ab`.

| Item | Location (pre-removal) | What it was / why removed |
|---|---|---|
| `ScanDiagnostics.destinationCount` (per-cycle) | `fx5-scanner.ts` (type :217, init :1475, assign `= taggedVtsSurvivors.length` :1671, trace :1545) + client mirror `vts-shared.tsx:154` + trace `vts-runner.ts:4191` | Mislabeled (VTS survivor count even on active_pool); serialized-but-unrendered. Blast-radius PROVEN: two qualified greps (`scanDiag\.destinationCount`, `\btotalDestinationCount\b`) return ZERO code refs repo-wide; tsc-baseline OK (a surviving typed reader would fail). Trace logs kept, retired token dropped (`→ ${scanDiag.destination}`). |
| `totalDestinationCount` rollup (24h aggregate) | `fx5-scanner.ts` (type :333, init :362, accumulator `aggDestinationCount` :394/:447, return :469) | Dead rollup — ZERO readers anywhere (the client `rolling24h` type never even declared it). |

**Left intentionally (survivor — DO NOT confuse):** the FD-RESPONSE top-level `destinationCount` at `routes.ts:7809/:7853`, computed `(familyFanOutSum ?? 0) + (patternFanOut ?? 0)` — a DIFFERENT field (the displayed number), correctly untouched. Naming-collision flagged by Langston at Step-2 and carved out explicitly.

Archive: git history is authoritative (this is a field-retirement within live files, not a whole-file removal — no `.removed` archive needed; the diff at `9e91245ab` is the record).

---

## 2026-07-05 — P19-B8.2: balance-policy legacy set (ghost defaults' dead siblings + a dead parallel open path + a live-data ghost row + an orphaned schema-copy)

**Why:** the B8.2 balance-policy batch (rule 18 on-the-spot dispositions surfaced by the pre-audit + Langston Step-2 conditions). Every code deletion grep-proven zero-caller + tsc-clean; the two DATA deletions carry full pre-delete values for auditability. Archive copies: `1-system-manual/_archive/deleted-code/*.20260705-P19B8.2.removed`.

| Item | Location (pre-removal) | What it was / why removed |
|---|---|---|
| confirm-balance NO-OP endpoint | `server/routes.ts` (~:11227, "[41D]") | Disabled since Phase 41D — logged + returned success unconditionally regardless of the posted balance. Replaced by the read-only Kraken-mirror confirm (`GET /api/active-engine/mirror-balance` + the rebuilt SimulationStartupModal). Client callers (paper-trading-controls retry path, ConfirmBalanceModal) removed with it. |
| `ConfirmBalanceModal` | `client/src/components/trading/confirm-balance-modal.tsx` | Posted to the NO-OP endpoint above; zero users after the controls rebuild (grep-proven; a stale top-bar comment re-pointed). |
| `storage.getGuardrails` + `getGuardrailsLegacy` | `server/storage.ts` (:729/:737) + the `IStorage` lines | The legacy-guardrails READ accessors: `getGuardrails` was an unconditional-throw deprecation stub; `getGuardrailsLegacy` a debug read. BOTH grep-proven ZERO-caller (every apparent caller is a same-NAMED symbol that already reads guardrails_v2 — see "left intentionally"). Langston independently confirmed zero-caller pre-push. |
| `compare_guardrails` legacy read (RE-POINTED, not deleted) | `server/services/reasoning-orchestrator.ts:~500` | The reasoning-task diagnostic read of the legacy dollar `guardrails` table → re-pointed at `guardrailsV2` (keeps the diagnostic functional; unblocks B6.10's clean table drop). |
| `trade-executor.ts` (whole file, 313 lines) | `server/services/trade-executor.ts` | A DEAD parallel trade-open path writing closed_trades + active_open_positions — ZERO callers repo-wide (which is why B7.2b's fee-mode stamps and B8.2's ratio stamps never touched it; a silent divergence trap had anything ever revived it). Found during the ratio-stamp coverage sweep. |
| Ghost paper portfolio row (DATA) | `public.portfolio_state` | The $25,000 scenario leftover: id `ef9526aa-ef11-4e55-a995-fdd8011bf83c`, mode paper, global_context_id `b8c1599a-8917-4048-9898-84b96bf0cea1`, created 2025-12-05, last touched 2025-12-30. The wrong-row-pickup hazard beside Kyle's genuine $878 row. Deleted by the B8.2 migration with an explicit `WHERE mode+context_key+amount` predicate; full values preserved in the migration §4 comment for paper-reversibility. |
| Orphaned legacy schema-copy (DATA+DDL) | `dawntrader_v2.portfolio_state` (4 stale rows) | An abandoned schema-copy unreachable by the app (search_path = public). Repo-wide grep: ZERO code references (single hit = a chat-archive filename); no search_path overrides anywhere in `server/`. Dropped by the B8.2 migration §5. |
| Ghost balance defaults + literals | `shared/schema.ts` (:1170 `"1000.00"`, :1829 `"10000"`), `server/routes.ts` (:11293 `800`, :5408 `10000`, :12274 `'1000'`), client `800`s, `active-portfolio-manager.ts` (:536/:671 hardcoded `$10,000` DENOMINATORS) | The seven enumerated invented-balance literals PLUS two the sweeps missed: hardcoded $10k denominators in the exposure%/drawdown% health math (understated exposure ~11× at a real $878 balance against the heat ceilings). All replaced by the Kraken-mirror flow / real-balance reads / honest refusals — never a substituted default. |

**Left intentionally (so a later grep doesn't read as a missed sweep):** `storage.upsertGuardrails` (throwing stub) + its TWO live callers (`routes.ts:1440`, `intent-executor.ts:418`) — retire together with the legacy `guardrails` table in **B6.10** (RUNNING_ISSUES **#436**); the same-named NON-storage symbols `config-update-service.ts:176 getGuardrails` and `state-awareness.ts:253 getGuardrails` — both already read guardrails_v2 ([9.7] comments), NOT the deleted accessor; the legacy `guardrails` table itself + schema export (B6.10).

## 2026-07-03 — P19-B-RENAME Wave-1: dead paper-era components (Kyle rulings + Langston-reconciled M5 verdict)

**Why:** #413 — the paper→active naming cleanup's deletion wave (rule 18: nothing lingers). Every item verified dead by consumer-walk + tsc + grep-to-zero (only deliberate tombstone comments remain). Archive copies: `1-system-manual/_archive/deleted-code/*.removed` (git history is the authoritative archive).

| Item | Location (pre-removal) | What it was / why dead |
|---|---|---|
| M5 validation harness engine | `server/services/paper_validation_engine.ts` | The 8.8.4-M5 controlled-validation session engine. Imported ONLY by the two dead route files below; its latency recording fired only inside its own `startValidationSession` fetch loop, which nothing in production ever starts. Langston initially split (keep-engine vs full-set) — reconciled FULL SET on the trace: no live consumer exists. |
| M5 validation routes | `server/routes/paper_validation.ts` | `/api/validation/*` — zero consumers (client/scripts/tests). |
| M5 pricing routes | `server/routes/pricing.ts` | `/api/pricing/latency` + `/cache-info` + `/status` — zero consumers, and served CONSTANT-ZERO latency (no session ever recorded). The original OPEN-3 "extract the rolling-latency tracker" was REVERSED at implementation depth (§9.2 delta, Langston-concurred ×3): there was nothing live to extract. Real feed-latency telemetry, if wanted, gets built fed from the real price path. |
| Both M5 mounts | `server/routes.ts` (~:21866-21874) | The `/api/validation` + `/api/pricing` registrations. |
| Guard-blocked CLI chain | `server/paper-trading-start.ts`, `server/paper-trading-stop.ts`, `server/services/paper-48hr-simulation.ts`, `scripts/test-phase-6-5-setup.ts` | Pre-modern CLI trading start/stop + 48hr sim + its setup script; guard-blocked, only intra-chain importers. The 48hr file was the sole non-live importer of paper-portfolio-manager. |
| `PAPER_TRADING_USER_ID` env | read only by the CLI chain | userId-coupled legacy (rule-18 theme); dies with its readers. |
| Client scan diagnostic | `client/src/components/goals/paper-sim-diagnostic.tsx` | Zero importers incl. lazy/App.tsx (CC-A verified, CC-B conceded). The SERVER sibling stays (live; renames in Wave 2). |
| Root strays | `test-guardrails-paper.ts`, `after-click-paper.png` | Untethered root-level test file + screenshot. |
| Walter tables + methods + client legs | `paper_daily_briefs` + `paper_ai_reports` tables (DROP migration `2026-07-03-p19-b-rename-w1-drop-walter-tables.sql`); storage interface+impl methods (`createPaperDailyBrief`/`updatePaperDailyBrief`/`getPaperDailyBrief(s)`/`finalizePaperDailyBrief`/`createPaperAIReport`/`getPaperAIReports`); schema decls/relations/insert-schemas/types; routes `/api/paper/briefs(/today)`; client paper branches (DailyBriefCard, portfolio-overview, ai-insights) | **Kyle ruling 2026-07-03:** Walter-era (the early OpenAI-via-API embed that never worked). Both tables live-verified EMPTY; the create/update methods had ZERO callers — read-only routes served an empty table forever. Daily reports return later rebuilt on our own ML (POST_AUDIT_ROADMAP note). userId-coupled legacy. |
| `PaperExecutionServiceLegacy` tombstone | `server/services/mode-registry.ts:7-14` | Phase-8.8.3-B9 runtime guard against a legacy service that no longer exists anywhere (the global was never set by anything). |

**Left intentionally (so a later grep doesn't read as a missed sweep):** the tombstone comments at the former mount/route/method/query sites referencing the deleted names; `server/services/paper-metrics.ts` + `/api/paper/metrics*` (OPEN-2 — rides the `paper_trades` retirement follow-up batch, liveness proven).

## 2026-07-01 — In-queue maker "make-then-take" resting-order machinery (P19-B7.2b / wrong-stage)

**Removed:** the B7.2 OBJ-4 in-RTBQ maker-pending / convert-safety lifecycle — the code that tried to WORK a resting maker order while a signal sat in the ready-to-buy queue. **Wrong stage** (Kyle model clarification 2026-07-01): a queued signal carries a maker/taker **DECISION only** and works NO order; the maker order is placed only at **PROMOTION** (Kraken in live; simulated for paper+VTS), so its resting/fill/timeout/convert lifecycle belongs post-promotion, not in the queue.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `markMakerPending()` method | `server/core/rtb/ready_to_buy_service.ts` | Marked a queued signal maker-pending + stamped `maker_posted_at`/`maker_limit_price`/`maker_budget_expires_at` — as if a resting order existed in-queue. |
| `processMakerPending()` method | `server/core/rtb/ready_to_buy_service.ts` | The per-refresh in-queue maker-order lifecycle driver (budget-expiry → convert-to-taker-or-drop) — the "make-then-take" ladder, run at the wrong stage. |
| `refreshSingleSignal` maker-pending branch | `server/core/rtb/ready_to_buy_service.ts` | Top-of-refresh `if ((signal as any).makerPending === true) { … }` early-branch that ran the in-queue lifecycle instead of the normal reconfirm. |
| `getRankedSignals` mutual-exclusion filter | `server/core/rtb/ready_to_buy_service.ts` | The filter that excluded maker-pending rows from ranking — needed only because in-queue signals were (wrongly) holding orders. Removed: every queued signal now ranks on its `chosen_net_ev` decision, uniformly. |
| Promotion-loop maker-POST branch | `server/services/paper-execution-engine.ts` | The promotion path that called `markMakerPending` to post an in-queue maker order. Replaced by a comment noting the maker order is placed AT promotion (paper+VTS sim = B7.2c; live Kraken resting order = Phase-21). |
| 4 `rtb_signals` columns | `shared/schema.ts` + DROP migration `2026-07-01-p19-b7-2b-fee-mode-columns.sql` | `maker_pending`, `maker_posted_at`, `maker_limit_price`, `maker_budget_expires_at` — the in-queue lifecycle state. Never populated in prod (active trading OFF since Phase 8), so the DROP is clean. |

**Why removed:** CLAUDE.md §5 rule 18 (never leave lingering legacy) + the wrong-stage correction. Leaving the in-queue lifecycle stubbed would risk a dead path re-entering the live system when Phase-19 flips active trading ON, and would contradict the locked model (RTBQ = decision only). Delete-on-the-spot (§15(a)), full workflow.

**Blast-radius verification (certainty-before-cutting — Langston Step-4 gate #2):**
- **Zero remaining references to `processMakerPending` / `markMakerPending`** anywhere in `server/` + `client/` (repo-wide grep — only doc/comment mentions of the removal survive).
- **Zero remaining readers of the 4 columns:** no `select *` reader, no ORM field (the drizzle column definitions were removed from `schema.ts` — comment-only marker remains), no view/materialized read, no `makerPending`/`makerPostedAt`/`makerLimitPrice`/`makerBudgetExpiresAt` field access. "Never populated" justifies the drop; "never referenced" is what makes it safe.
- **`tsc --noEmit` clean** after the type-field removal + the mutual-exclusion branch came out of `getRankedSignals` (bench-verified).
- **Migration is forward-only** with an HONEST down-migration: the rollback `…-rollback.sql` re-adds the 4 columns as nullable/default (recreate-as-nullable) — the data was never populated so no value is lost either direction.
- **Left intentionally:** the maker/taker DECISION service (`decideMakerTaker`, `maker-taker-decision.ts`) and the `chosen_entry_mode`/`chosen_net_ev`/`taker_net_ev`/`maker_net_ev_adjusted` snapshot columns STAY — they are the correct in-queue artifact (decision only). Only the resting-order MACHINERY was wrong-stage.

**Interim-constraint note (Langston Step-4 intent gate):** with the in-queue maker machinery gone, a `decideMakerTaker`→**maker** verdict has its execution path built in the **very next sub-batch B7.2c** (the post-promotion pending maker-fill simulation for paper + VTS), which lands BEFORE active trading is switched ON (P19-B8). Live Kraken resting-order = Phase-21. So there is no window where active trading is ON with a maker verdict the executor cannot honor.

**Archive copy:** none as whole-file (the host files `ready_to_buy_service.ts` / `paper-execution-engine.ts` / `schema.ts` remain in the live tree); git history is the authoritative archive for the removed blocks.
**Removal commit:** _(recorded at P19-B7.2b close)_
**Reviewed by:** Langston Step-4 diff review — _pending_ (the delete-on-the-spot disposition was pre-agreed in the B7.2b design round, 2026-07-01).

## 2026-06-29 — Stranded legacy guardrails-tab UI (P19-B6.8 / #302)

**Removed:** the old pre-v2 guardrails tab component and its orphaned copy-to-live modal.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `guardrails-tab.tsx` (`GuardrailsTab`) | `client/src/components/goals/guardrails-tab.tsx` | The OLD guardrails UI (pre-`guardrails_v2` era). Read/wrote the DEPRECATED `/api/guardrails` (GET→v2 but **PUT→`upsertGuardrails` which THROWS** `[9.7] deprecated`) + the GLOBAL `/api/settings` (which now allow-lists ONLY `timezone`, rejecting risk fields). **Imported in `goals-engine.tsx` but NEVER RENDERED** — the live guardrails tab mounts only `<CoreFourGuardrails/>` (the v2 component). So every guardrail save it offered was a dead/throwing path with zero user impact. Stranded-dead, superseded by the landed v2 migration. |
| `copy-to-live-modal.tsx` (`CopyToLiveModal`) | `client/src/components/goals/copy-to-live-modal.tsx` | The paper→live guardrail-copy modal, imported ONLY by `guardrails-tab.tsx` (grep-confirmed sole importer) — orphaned the moment GuardrailsTab is removed. |

**Why removed:** CLAUDE.md §5 rule 18 (never leave lingering legacy). Surfaced during the P19-B6.8 verification that the live guardrails tab (`CoreFourGuardrails` → `/api/guardrails-v2`, per-mode) already works, making GuardrailsTab a confusing dead duplicate. **Blast-radius (certainty-before-cutting, Langston Step-1):** GuardrailsTab's only reference was the one `goals-engine.tsx:2` import (no conditional/feature-flag render swap); copy-to-live-modal's only importer was GuardrailsTab; tsc-trace after removal = zero dangling references (grep-confirmed across client/ + server/). Stranded-dead, NOT an unfinished intended-replacement (CoreFourGuardrails uses the newest [9.7] `/api/guardrails-v2` and IS the rendered forward UI).

**Archive copy:** `1-system-manual/_archive/deleted-code/guardrails-tab.tsx.removed` + `copy-to-live-modal.tsx.removed` (git history authoritative).
**Removal commit:** (this batch P19-B6.8).
**Reviewed by:** Langston Step-1 consensus (stranded-dead accepted) + Step-4 diff review (pending).
**NOTE — NOT removed here (separate dated home P19-B6.10):** the old `guardrails` TABLE + `PUT /api/guardrails` + `upsertGuardrails` throw-stub stay until their live server callers migrate to v2 (`reasoning-orchestrator.ts:500` reads the old table directly; `intent-executor.ts:418` calls the throwing upsert) — cross-blast-radius (§15(b)), scheduled P19-B6.10.

## 2026-06-26 — Vestigial secondary market-data WebSocket subsystem (P19-B6.7 / #301)

**Removed:** the "Directive 8.9.0-B Secondary WebSocket Adapter" and its coordinator wrapper.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `market-data-ws.ts` | `server/services/market-data-ws.ts` | A second Kraken WS adapter (`getMarketDataWS()` singleton), separate from the primary `kraken-websocket-adapter.ts`. Connected on construction but **never delivered a tick or completed a subscription in its entire logged history** (`MD-WS_TICK`=0, `Sub OK`=0 since Apr 3). Live-spammed `[MD-WS] Data stale` every 30s (30s heartbeat vs 2s stale threshold; tick-timestamp only bumped by pongs). |
| `market-data-coordinator.ts` | `server/services/market-data-coordinator.ts` | `getMarketDataCoordinator()` singleton wrapping the 2nd WS + a never-exercised REST-fallback bookkeeping (`usingFallback`/`dataSource`). Its `'tick'`/`cortex-update` outputs were dead-ended; only `getStatus()` was consumed. |

**Why removed:** a dead feed that every health/safety consumer mis-read as "connected/healthy" because the dead socket kept a TCP connection open. **Phase-19 landmine:** `feed-integrity-monitor` (boot-started, 5-min cron) graded this dead feed and would raise false CRITICAL `feed_health` alerts every 5 min once Phase-19 lifts dormant-mode suppression; `parity-gate` false-PASSED the Phase-21 go-live WS gate off it. CLAUDE.md §5 rule 18: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- **Tick-output consumers: ZERO** (`coordinator.on('tick')`/`getLatestTick`/`getDataSource`) — the only historical consumer (realtime-paper-executor) was already deleted in #300/B4b.2.
- **`subscribeToPair` callers: ZERO** — the current build never drove a subscription (so the historical "Sub Error" log volume was pre-#300 residue).
- **The 4 status-only consumers were re-pointed FIRST** at the primary `krakenWebSocketAdapter` (parity-gate, health-monitor, system-health-monitor, feed-integrity-monitor), then `tsc --noEmit` proved zero dangling references BEFORE deletion, then a repo-wide grep confirmed no remaining code reference.
- **Primary adapter ⟂ this subsystem: PROVEN** — `kraken-websocket-adapter.ts` had zero reference to it, and no price-cache / VTS / warmup / signal path touched it.
- `OrderBookSnapshot` (the one still-used export, type-only) re-homed inline into its sole consumer `slippage-fee-model.ts`.
- **Left intentionally:** nothing — the symbol-canonicalizer header comment listing `MarketDataCoordinator` was also removed.

**Archive copies:** `1-system-manual/_archive/deleted-code/market-data-ws.ts.20260626-P19B6.7.removed`, `…/market-data-coordinator.ts.20260626-P19B6.7.removed`
**Removal commit:** `d0a40fabc` (P19-B6.7 Step-3 5/N; deployed staging restart#421, CI `28266067266` all-4-green).

---

## 2026-06-13 — Legacy live-trading STUB cluster (P19-B2)

**Removed:** the pre-cleave `LiveTradingService` stub and its orphaned surface.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `live-trading-service.ts` | `server/services/live-trading-service.ts` | Phase 22.3 / Phase 41F stub. On "activate" it built a **fake placeholder object** `{ userId, mode:'live', isRunning:true }` — no Kraken, no TEC, no execution. Its own comments: *"Initialize trading engine (placeholder for now)… In production this would initialize the actual TradingEngine."* Also emitted a misleading "live trading active" broadcast off the do-nothing object (operator-integrity hazard). |
| 4 legacy routes | `server/routes.ts` `/live-trading/{start,stop,status,approve}` | Orphaned HTTP endpoints wiring to the stub. **No client/server caller** (verified). |
| Dead approval branch | `server/routes.ts` `if (approval.action === 'start_live_trading')` | Imported the stub's `activateLiveTrading`. The `start_live_trading` approval action is **never emitted anywhere** in the live tree (verified — appears only as a permission-type string and in an old context doc). |
| Test-harness scenario | `server/services/auto_test_harness.ts` | `createLiveTradingScenario()` + its registration + the `./live-trading-service` imports. Exercised the stub only. |

**Why removed:** legacy userId-coupled stub predating the June-10 three-way (VTS/paper/live) cleave; contradicts the mode-based architecture; carried an active false-"live-ON" broadcast bug. Kyle directive 2026-06-13: delete now, do not leave lingering.

**Blast-radius verification (certainty-before-cutting):**
- The **modern** live-start path (the Phase-21-gated engine start, `routes.ts` 409 `LIVE_ENGINE_PHASE21_GATED`) does **NOT** use this file — it is untouched.
- The client UI "Confirm & Start Live Trading" button (`top-bar.tsx` → `useTrading().startTrading({type:'live'})`) routes to the **modern gated path**, NOT the legacy `/live-trading/*` routes — UI unaffected.
- `start_live_trading` approval action has **no emitter** in the live tree — the approval branch was dead.
- `auto_test_harness` keeps its other scenarios (paper-sim start/stop, heartbeat); only the live-trading scenario was removed.
- **Left intentionally (forward-looking Phase-21 permission taxonomy — NOT dead executable code; do not mistake for a missed sweep when grepping `start_live_trading`):** `client/src/hooks/useUserRole.ts` permission-type strings (`start_live_trading`/`stop_live_trading`); `shared/schema.ts:181` (`"startLiveTrading": true` default-permission flag); `server/config/permissions.ts:202` (`'start_live_trading': 'trade_live'` permission→capability mapping — Langston Step-4 catch). All three are the permission MODEL Phase-21 live will use, independent of which file implements live.

**Archive copy:** `1-system-manual/_archive/deleted-code/live-trading-service.ts.20260613-P19B2.removed`
**Removal commit:** _(recorded at P19-B2 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## 2026-06-15 — Hardcoded `enabledStrategies` allowlist + orchestrator Set machinery (P19-B4a C5)

**Removed:** the hardcoded strategy allowlist and all of its now-orphaned in-class machinery, replaced by the DB-resolved per-asset-class gate.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Two 9-element inline literals | `server/services/trading-engine.ts:57-67` + `server/services/paper-portfolio-manager.ts:194-204` | The `enabledStrategies: ['vwap_pullback', … 'dhma']` config arrays passed into `new SignalOrchestrator({…})` at both live constructor sites. Hardcoded which strategies the orchestrator ran — static, not per-asset-class. |
| Config field | `server/services/signal-orchestrator.ts` `SignalOrchestratorConfig.enabledStrategies?: string[]` | Optional config knob the two literals fed. |
| The Set + 17-element default | `server/services/signal-orchestrator.ts` `private readonly enabledStrategies: Set<string>` field + its constructor construction (`new Set(config.enabledStrategies || [ …17 strategies… ])`) | The in-memory allowlist. The 17-element default (the "Directive 12.3.2 all canonical strategies" literal) is gone with it. |
| Dead public methods | `server/services/signal-orchestrator.ts` `isStrategyEnabled(strategyId)` + `getEnabledStrategies()` | Read-only accessors over the Set. **Zero external callers** (sweep-verified). |
| Log / stat sites | `server/services/signal-orchestrator.ts` `start()` banner + telemetry (`this.enabledStrategies.size`); `[8.8.3-B][SELECTION]` log (`Array.from(this.enabledStrategies)`); `strategiesRun += this.enabledStrategies.size`; Site E (`new Set([...this.enabledStrategies].filter(s => regimeStrategies.has(s)))`) | All consumers of the Set. Re-sourced: log/telemetry/stat counters → `Object.keys(STRATEGY_DISPLAY_NAMES)` (canonical universe); Site E → `new Set(regimeStrategies)` (the regime allowlist is the per-symbol selector; the DB gate is now the per-class authority). |

**Why removed:** the hardcoded allowlist was a static, asset-class-blind override that contradicted the per-asset-class-config default (CLAUDE.md §5 rule 15). It is replaced by `isStrategyEnabledForAssetClass` (`strategy_gates` DB) at the `buildSizedSignalForStrategy` chokepoint — the single per-class authority, reachable by BOTH pipes (crypto via `evaluateSymbol`, xStock via `dispatchExternalSignal`) because the stamped asset class lives there. Leaving the literals alongside the new gate would mean two competing authorities; leaving the orphaned Set/methods would be a lingering-legacy stub. Kyle directive 2026-06-13 (rule 18): delete now, do not leave lingering.

**Design decision (approved):** `isStrategyEnabledForAssetClass` stays DEFAULT-OPEN (returns `true` when no `strategy_gates` row matches). "Fail-hard" is satisfied by deleting the hardcoded list (the DB resolver becomes the sole authority and already throws on cold cache via `b72-warmup` prefetch). An explicit crypto allowlist seed is out of C5 scope (it would black out all crypto until a seed migration; crypto_spot has no rows today and stays default-open).

**Blast-radius verification (certainty-before-cutting):**
- **2 live constructor sites** (`trading-engine.ts` + `paper-portfolio-manager.ts`) — both edited; the field is optional, so removing it compiles.
- **0 external callers** of the removed public methods `isStrategyEnabled` / `getEnabledStrategies` (`server/`-wide sweep: only the orchestrator's own former definitions).
- The gate reads the 9-wide `StrategyType` (`'range_trading'`) but the DB rows + `STRATEGY_DISPLAY_NAMES` use the canonical `'range_trade'`; a one-entry reverse-alias (`range_trading → range_trade`) bridges this at the gate (mirror of the C2 forward-alias). `normalizeStrategy()` does NOT bridge it (silent default-open), hence the explicit alias.
- **⚠️ Left intentionally / FLAGGED (NOT a missed sweep):** the `/reb-2-12F/strategy-health` admin diagnostic (`server/routes.ts:10617-10630`) does NOT call the removed methods — it reads `signal-orchestrator.ts` **as source text** and regex-matches the `enabledStrategies = new Set([…])` literal and `this.enabledStrategies.has('dhma')` block. Removing that source machinery breaks the diagnostic's `orchestratorStrategies`/`dhmaWired` outputs (it will report empty + `dhmaWired=false`). This is a source-text coupling, outside the 4 files this chunk edits, and was surfaced to Langston for a follow-up home (re-point the diagnostic at `STRATEGY_DISPLAY_NAMES` / the regime map, or retire it). It does not affect the runtime signal pipeline.

**Archive copy:** none — this is inline literals + in-class machinery (not whole files), so there is no `.removed` archive file; git history is the authoritative archive (per this log's preamble).
**Removal commit:** _(recorded at C5 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## 2026-06-15 — Vestigial paper-sim busy-flag / operation-lock mechanism (P19-B4b D5)

**Removed:** the `globalPaperSimBusyFlag` + `globalPaperSimOperationLock` start/stop concurrency mechanism and all of its now-dead supporting code, surfaced while isolating the S1 portfolio-manager cluster per-mode.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Two `declare global` vars | `paper-sim-service.ts:248-249` | `var globalPaperSimOperationLock: Promise<void> \| null` + `var globalPaperSimBusyFlag: boolean`. |
| Two module timestamps | `paper-sim-service.ts:36-37` (+ 2 threshold consts `:38-39`) | `busyFlagSetAt` / `operationLockSetAt` (and `BUSY_FLAG_STALE_THRESHOLD_MS` / `OPERATION_LOCK_STALE_THRESHOLD_MS`) — only ever set to `null`. |
| `clearStaleBusyFlag` flag/lock branches | `paper-sim-service.ts:42-61` | The stale-flag and stale-lock auto-clear branches. The function's orphaned-manager cleanup (the part that does real work) was KEPT. |
| `resetPaperSimService` lock clear | `paper-sim-service.ts:1126-1129` | `if (global.globalPaperSimOperationLock) { … = null }`. |
| Route catch/finally clears | `routes.ts` paper-sim start (init-guard `:5745-5746`, catch `:11236`, finally busy-flag `:11238-11242`) + stop catch (`:11266`) | Five `(global as any).globalPaperSim{OperationLock,BusyFlag} = null/false` dead writes. |
| Reset-service clears | `paper-session-reset.ts:296-297` | `(global as any).globalPaperSimOperationLock = null; …BusyFlag = false`. |

**Why removed:** the entire mechanism is **vestigial** — superseded by `paperOperationQueue` (Phase 41F: "use operation queue instead of busy flag and operation lock"). It is provably dead, not just unused: `globalPaperSimBusyFlag` is **never set `true`** anywhere; `globalPaperSimOperationLock` is **never assigned a Promise** anywhere; `busyFlagSetAt`/`operationLockSetAt` are **only ever set to `null`** — so `clearStaleBusyFlag`'s guards (`if (flag && setAt)`) are unreachable. Leaving dead split-brain-shaped globals while the batch's whole purpose is to isolate per-mode state would be exactly the lingering-legacy hazard rule 18 forbids; mode-keying dead state would be a NO-PATCHES violation (maintaining dead code).

**Blast-radius verification (certainty-before-cutting, #297 discipline):**
- Repo-wide grep for `globalPaperSimBusyFlag` / `globalPaperSimOperationLock` / `busyFlagSetAt` / `operationLockSetAt` enumerated **every** reference — all are either the removed declarations or dead null/false clears; **zero truthy acquisition** anywhere.
- The live start/stop concurrency control is `paperOperationQueue.enqueue(...)` (`paper-sim-service.ts:439`) — untouched.
- tsc baseline gate after removal: **no regressions** (the typed `global.globalPaperSim*` references that would have errored on the removed `declare global` were all removed; the remaining `(global as any)` casts were also removed).
- vitest 1945/1945 after removal.

**Archive copy:** none — inline machinery (not a whole file); git history is the authoritative archive.
**Removal commit:** _(recorded at D5 close)_
**Reviewed by:** Langston (Step-4 diff review) — _pending_

---

## P19-B4b.1 (2026-06-16) — the RTH liquid-fill-window FILL gate + the flat paper slippage constant

**Batch:** P19-B4b.1 (paper fill fidelity). **Removal commit:** `b74526dc3`. **Reviewed by:** Langston Step-4 APPROVE.

| Removed | Location | What |
|---|---|---|
| RTH liquid-fill-window FILL gate block | `xstock_spot/active-dispatch.ts` (the `if (!isXstockLiquidFillWindowET(...))` skip + `_outOfSessionSkips` counter + the `getXstockActiveDispatchStats` field + the `isXstockLiquidFillWindowET` import) | The time-of-day proxy that gated active xStock fills to US RTH. Retired as a FILL gate (#295) — replaced by the 24/5 book-depth-sufficiency gate at the engine open seam. |
| Flat slippage on the active fill seam | `paper-execution-engine.ts` (the `SLIPPAGE_PERCENT` field + the `CANONICAL_SLIPPAGE` import) + `order-placer.ts` (the `slippagePercent` constructor arg + the flat `intendedPrice ± slippage%` math) | The flat 0.05% paper slippage. Replaced by the honest depth-walk (`execution/depth-walk.ts`). |

**Why removed:** #295 — the RTH clock was a proxy for "is the book deep enough", wrong in both directions (blocked fillable off-hours books, passed thin RTH books); B4b.1 measures depth directly. The flat slippage is superseded by the real book-walk (no magic % on the active seam — Langston Q-A / C-Q5).

**★ RETAINED (verify-before-cut correction — NOT removed):** `isXstockLiquidFillWindowET` (the predicate) + its two `module_constants xstock_fill_safety.liquid_fill_window_*` keys are KEPT — the grep sweep caught that `equity-spot-archiver.ts:316` (the silent-stall watchdog) still uses them to select its RTH-vs-off-RTH reconnect threshold (a feed-cadence use, NOT a fill-quality use). Deleting them would have regressed the watchdog. Only the FILL-gate use was removed. Confirmed in staging: 2 `liquid_fill_window_*` keys live in the DB post-deploy.

**★ LEFT INTENTIONALLY — scheduled for deletion with #300 / P19-B4b.2 (rule-18; do NOT read these as a missed sweep):**
- `slippage-fee-model.ts:91-125 calculatePriceImpact` — the proven book-walk math B4b.1 PORTED into the fresh deterministic `depth-walk.ts` helper; the original is now reachable only from dead-on-active-path code (it stays as the golden-test reference until #300 deletes its dead callers).
- `realtime-paper-executor.ts` — dead on the active path (referenced only by a diagnostic endpoint).
- `pre-execution-validator.ts` — dead on the active path; its removal coordinates with the #297 investigation (its only non-diagnostic caller is #297's `intent-executor`).
- the SECOND, dormant WS `book` connection `market-data-ws.ts` → `market-data-coordinator.getLatestOrderBook` — a duplicate of the active adapter's book, feeding only the dead executor + diagnostics.

**Blast-radius verification:** repo-wide grep (`server/` only) for the retired symbols → the only remaining `isXstockLiquidFillWindowET` consumer is the watchdog (`equity-spot-archiver.ts`) + tests; no remaining `SLIPPAGE_PERCENT`/`CANONICAL_SLIPPAGE` on the active fill seam (a separate legacy manual-close route in `routes.ts:12200` keeps its own flat slippage — out of B4b.1 scope, noted). tsc baseline no-regression (404<494); vitest 1979.

**Archive copy:** none — inline blocks; git history (`b74526dc3`) is the authoritative archive.

---

## P19-B4b.2 (2026-06-16) — dead paper-fill machinery sweep (#300)

**Batch:** P19-B4b.2. **Removal commit:** `977f3be08`. **CI:** `27598725568` all-4-green. **Deployed:** restart#394, root HTTP200, `/api/execution/metrics` → 404. **Reviewed by:** Langston Step-1/2/4 APPROVE; Step-8 _pending_.

| Removed | Location | What |
|---|---|---|
| `realtime-paper-executor.ts` (WHOLE FILE, −255) | `server/services/realtime-paper-executor.ts` | The Phase-8-era real-time paper executor. `executeTrade()` had **0 callers**; `recordPaperTrade()` was never finished (*"just log - will integrate with storage in next step"*). Only live surface was `getStatus()` — a pass-through wrapper over mdCoordinator/executionTiming/rateControl. |
| `GET /api/execution/metrics` | `server/routes.ts` | Dead diagnostic endpoint backed by the executor's `getStatus()`. **0 client consumers** (the UI's `ExecutionMetricsPanel` reads a different surface); already returned a stale `killSwitch: undefined`. The adjacent `/api/execution/timing/export` (reads `executionTiming` directly) was KEPT. |
| order-book read sub-path | `server/services/market-data-coordinator.ts` | `latestOrderBooks` map + the `wsClient.on('orderbook')` handler (its re-`emit('orderbook')` had **0 listeners**) + `getLatestOrderBook()` (its **only caller** was the deleted executor). |
| dead `'orderbook'` emission | `server/services/market-data-ws.ts` | the `snapshot` construction + `this.emit('orderbook', snapshot)` in the `book`-channel handler. |

**Consumer reroute (NOT a removal):** `system-health-monitor.getExecutionMetrics()` — swapped `realtimePaperExecutor.getStatus()` for direct reads of `getMarketDataCoordinator().getStatus()` + `rateControl.getStatus('private')` + `executionTiming.getMetrics(10)`. **Value-identical** (Langston-verified line-by-line): the executor's `getStatus()` was already a pass-through over exactly these three singletons; the `try/catch` + `'N/A'` defaults are untouched.

**Why removed:** rule-18 — never leave legacy lingering; a dead paper-fill path could accidentally re-enter the live system once paper trading turns on. #300 named home.

**Blast-radius verification (certainty-before-cutting):**
- `executeTrade()` 0 callers (the two `.executeTrade(` grep hits are `trading-engine`'s own method + a different `engine` object). **0 test imports** of the file/endpoint/accessor (`grep server/tests` + `**/*.test.ts` → 0 — Langston diff-guard #3).
- ⚠️ **Framing correction vs the original #300 plan:** the "dup 2nd WS book path" is NOT a clean module cut — `market-data-coordinator` + `market-data-ws` are LIVE shared infra (imported by `feed-integrity-monitor`, `health-monitor`, `parity-gate`). Only the order-book SUB-PATH was dead. The `book` SUBSCRIPTION + the midpoint-`'tick'` emission are LIVE (load-bearing for the live tick stream) and were KEPT (Langston diff-guard #1: `market-data-ws.ts` `lastTickTimestamp` line preserved between the two removal targets).
- tsc baseline no-regression; vitest 1979/1979.

**Left intentionally (NOT a missed sweep — do not re-grep as dead):**
- `slippage-fee-model.ts:91-125 calculatePriceImpact` — KEPT as the `depth-walk.ts` golden-test reference; its parent module is still imported by `pre-execution-validator` (#297) + `routes.ts`.
- `pre-execution-validator.ts` — LEFT pending the #297 investigation (its only non-diagnostic caller is #297's `intent-executor`).
- the whole `MarketDataCoordinator`/`MarketDataWebSocket` subsystem — likely vestigial (zero `subscribeToPair` callers) but its removal is a SEPARATE liveness-then-remove audit → homed **#301**.
- `OrderBookSnapshot` interface export (`market-data-ws`) — KEPT (`slippage-fee-model` type-imports it).

**Archive copy:** `1-system-manual/_archive/deleted-code/realtime-paper-executor.ts.removed`.
**Reviewed by:** Langston Step-1/2/4 APPROVE; Step-8 _pending_.

---

## P19-B6 (2026-06-16) — orphaned `paper-metrics.ts::calculate24hPL()` method

| Removed | File | Detail |
|---|---|---|
| `calculate24hPL()` method | `server/services/paper-metrics.ts` (was lines ~122-166) | A rolling-24h P/L calculator on `PaperMetricsService`. **ZERO live callers** (re-verified: `grep -rE "\.calculate24hPL\(" server/ client/ shared/` → 0; the only hits are old training-data backups under `.claude/worktrees/`). An orphaned remnant of the deleted Phase-8 `risk-manager.ts::calculate24hPL`. |

**Why removed:** rule-18 / §15 — never leave two sources of truth. P19-B6 RESTORES the authoritative rolling-24h loss evaluator at `server/services/daily-loss-budget.ts` (re-homing the deleted Phase-8 `risk-manager.ts::checkKillSwitch` + `calculate24hPL`); this orphan was a stale duplicate that would have been a second, divergent 24h-P&L computation. Deleted in the same batch that establishes the authoritative one.

**Blast-radius verification (certainty-before-cutting):** `.calculate24hPL(` call-site count across `server/`/`client/`/`shared/` = **0**. The method was self-contained (used `storage.getAllPaperTrades` + `this.getPortfolioMetrics`); no other method referenced it. tsc baseline no-regression (bench).

**Archive:** git history (single-method removal within a still-live file — no `.removed` file). Commit: P19-B6 Step-3 service chunk.
**Reviewed by:** Langston Step-4 _pending_.

---

## 2026-06-17 — Dead RTB capacity-block insertion path (P19-B6.5b)

**Removed:** the unused `queueSignal` RTB variant + its input type + the orphaned `storage.insertRtbSignal`.

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `queueSignal()` | `server/core/rtb/ready_to_buy_service.ts` (was ~line 1202, ~90 lines) | The "capacity-block" RTB insertion variant. Wrote via `storage.upsertRtbSignal`. **Distinct from the LIVE admission path** `queueSQESignal` (the only path the orchestrator calls). Also **class-blind** — built `InsertRtbSignal` with no `assetClass`, so reviving it would re-introduce the exact pre-stamp-at-source bug. |
| `RTBSignalInput` interface | `server/core/rtb/ready_to_buy_service.ts` (was ~line 71) | The input type used **only** by `queueSignal`. |
| `insertRtbSignal()` | `server/storage.ts` IStorage decl (~645) + impl (~4005) | Plain insert (no upsert). **Zero callers at all** — `queueSignal` itself used `upsertRtbSignal`, not this. |
| 2 test-mock stubs | `b79-0n-rtb-fsm-isolation.test.ts`, `b79-0n-rtb-isolation.test.ts` | `insertRtbSignal: vi.fn(...)` stubs that mocked the storage method but never called it. Removed with the impl (both test files still pass — 9 tests). |

**Why removed:** rule 18 (never leave legacy lingering) + Langston Q4 delete-on-the-spot ruling (P19-B6.5b Step-2). A class-blind RTB insertion variant lingering is precisely the accidental-re-entry risk rule 18 targets; B6.5b's #320 work hardens the per-class gate, so a parallel un-gated insertion path is exactly what must not survive.

**Blast-radius verification (certainty-before-cutting):** repo-wide grep `server/ client/ shared/ scripts/`: `queueSignal` (excluding the `queueSQESignal` substring) = **definition + 1 doc-comment only, ZERO callers**; `insertRtbSignal` = interface decl + impl + 2 test-mock stubs (no callers). tsc baseline = no regression (bench). Affected isolation tests re-run green (19 tests across the 2 isolation files + the 2 new B6.5b files). Langston Step-4 diff review pending.

**Left intentionally (NOT dead — do not read as a missed sweep):** `storage.upsertRtbSignal` (the LIVE admission writer — `queueSQESignal` uses it); `queueSQESignal` (the live SQE-qualified admission chokepoint, now carrying the B6.5b #320 defense-in-depth guard).

**Archive copy:** `1-system-manual/_archive/deleted-code/p19-b6-5b-rtb-deadcode.removed`
**Removal commit:** _(recorded at P19-B6.5b Step-4/push)_
**Reviewed by:** Langston Step-4 _pending_.

---

## 2026-06-17 — Redundant pattern double-emission loop + fabricated `pattern_*` strategy + leftover `cwqi` column (P19-B6.5c)

**Removed (three items, the two crypto signal→RTB breaks the B6.5b dry-run surfaced):**

| Item | Location (pre-removal) | What it was |
|---|---|---|
| Site-2 pattern emission loop | `server/services/signal-orchestrator.ts` (the `// Convert pattern signals to trade signals and add to queue` `for (const patternSig of patternSignals)` block in `evaluateMarket`, ~L2054-2088) | A second emitter that, for every detected BUY pattern, built a raw signal labeled with the invalid `pattern_*` strategy and **sized it under a hardcoded `'breakout'`** while the label said pattern. Redundant double-emission. |
| `strategy` field on `patternToTradeSignal` | `server/services/pattern-recognizer.ts` (`patternToTradeSignal` return type + `strategy: \`pattern_${pattern.pattern.toLowerCase()}\``) | The origin of the `pattern_abcd / pattern_pinbar / …` values — non-canonical strings outside the `strategy_type` enum. Patterns are TRIGGERS, not strategies, so the recognizer should never have asserted one. Function now returns geometry/confidence only. |
| `rtb_signals.cwqi` column (staging DB) | `rtb_signals` table on staging | A `numeric NOT NULL`-no-default column the code removed long ago (not in `shared/schema.ts`; documented removed in `server/legacy/metrics_archive.ts`). The Drizzle insert no longer sent it → NOT-NULL violation on every row (16,930 dry-run drops, ALL strategies). Dropped via migration `2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql`. |

**Why removed:** the two breaks blocked 100% of crypto signals from reaching the ready-to-buy queue (the B6.5b dry-run proved the front half healthy; ZERO reached RTB). The `pattern_*` value also poisoned `paper_sim_trades.strategy_name` + `trades.strategy` downstream — so the fix is at the source (the recognizer stops asserting a strategy; the orchestrator resolves the CANONICAL consuming strategy via `resolvePatternConsumingStrategy`, exact-match-or-drop). The site-2 loop was redundant: the `activeStrategies` dispatch above it already evaluates every pattern-consuming strategy (morning_star / inside_bar_reversal / support_bounce / pivot_shift / reverse_impulse / defensive_hedge / adaptive_flow / volatility_edge) via `detect*()` fed the matching pattern by `buildPatternInputForStrategy` (B57 routing); the pattern-pool path (site 1) now emits canonically. Canonicalizing the duplicate instead of removing it would double-count (Langston D4).

**Blast-radius verification (certainty-before-cutting):**
- **cwqi (DB-level dependency check, live staging):** no views, no CHECK/FK constraints, no triggers, no generated columns/defaults reference cwqi. The only dependent object — index `rtb_signals_cwqi_idx` — is auto-dropped with the column. Table had 0 rows. Code-side, cwqi appears only in `legacy/metrics_archive.ts` (archival) + tests asserting its removal. Migration uses `DROP COLUMN IF EXISTS` (idempotent); rollback re-adds nullable (documented asymmetry — the original NOT-NULL-no-default was itself the bug).
- **`patternToTradeSignal.strategy` consumers (repo-wide):** the two orchestrator sites (site 1 now uses the resolver; site 2 removed) + `b79-0n-pattern-detect-byte-identity.test.ts` (two `.strategy` assertions updated to geometry-only). VTS + xStock eval-cycle do NOT call `patternToTradeSignal` (they use `selectContextAwareStrategy` directly) — unaffected.
- **Site-2 loop removal:** the `activeStrategies` dispatch (same function, lines ~1689-2040) provides full coverage of pattern-consuming strategies. RTB dedup key is `(mode, symbol, strategy)` (`storage.ts` `upsertRtbSignal` on-conflict) so any pattern-path/quant-path overlap on the same canonical strategy collapses to one row — no double-count after removal.
- **`selectContextAwareStrategy` (shared with VTS/xStock):** UNTOUCHED — the exact-match logic is a strictly-additive sibling (`resolvePatternConsumingStrategy`), so the fallback contract VTS/xStock rely on is unchanged (locked by a regression test).

**Left intentionally (NOT dead):** `selectContextAwareStrategy` (shared fallback resolver, VTS/xStock); `scanPatterns` + the 6 detect functions (pattern DETECTION, unchanged); `patternToTradeSignal` itself (still the geometry converter, now strategy-free); `abcd_long` (a real QUANT strategy — distinct from the ABCD pattern that feeds `volatility_edge`).

**Archive copy:** none — inline orchestrator block + a return-field + a DB column (not whole files); git history is the authoritative archive (per this log's preamble). The cwqi migration + rollback SQL are versioned in `drizzle/migrations/`.
**Removal commit:** _(recorded at P19-B6.5c Step-4/push)_
**Reviewed by:** Langston Step-4 _pending_.

---

## P19 reorg-B2 (2026-06-20) — deprecated hardcoded ROI bounds (Kyle directive; never-leave-legacy rule 18)

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `ROI_MIN` (0.010), `ROI_MAX` (0.040), `ROI_FLEX_MULTIPLIER` (0.6), `FRICTION_SAFETY_BUFFER` (1.1), `ADAPTIVE_THRESHOLDS_CONFIG`, + the `[11.7C][Config]` boot log line | `server/config/adaptive-thresholds.ts` | The original hardcoded ROI-gate bounds + friction buffer. **DEPRECATED since B72 (2026-05-05)**, which migrated the LIVE ROI gate to `module_constants` (`expectancy_gates.roi_absolute_min/max/roi_flex_multiplier/friction_safety_buffer` + `roi_gating.min_roi`). The consts lingered as dead-but-loaded code (still logged at boot). |

**Why removed:** Kyle directive 2026-06-20 — the deprecated bounds must be completely deleted so they can never be accidentally re-wired, especially as reorg-B2 Piece B makes the bounds **per-class in the DB**. Lingering dead constants that shadow the live DB-governed values are exactly the §15 / rule-18 hazard.

**Blast-radius verification (certainty-before-cutting):** repo-wide grep — `server/config/adaptive-thresholds.ts` has **exactly ONE importer**, `server/core/calculations/expectancy.ts` (`:51-53`), importing ONLY `DEFAULT_SLIPPAGE` (kept). The deleted symbols have **ZERO importers** anywhere; their only remaining references are stale doc-comments in `expectancy.ts` (historically accurate). Confirmed by the tsc baseline gate staying GREEN after deletion (no new errors).

**Left intentionally (NOT dead):** `DEFAULT_SLIPPAGE` — still imported by `expectancy.ts`; kept as a re-export from the canonical `exchange-defaults` source.

**Archive copy:** none — a handful of const declarations (not a whole file); git history is the authoritative archive.
**Removal commit:** _(recorded at reorg-B2 Step-3/push)_
**Reviewed by:** Langston Step-4 _pending_ (Discord).

---

## B-DIAG-387 (2026-06-25) — dead xStock filter-diagnostics "reference shape" scaffolding (#387; never-leave-legacy rule 18)

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `byStrategy`, `totalEvaluated`, `totalNulls`, `totalSignals`, `totalRejected`, `totalTrades`, `byReason`, `byRegime` locals | `server/routes.ts` `/api/xstocks/filter-diagnostics` (~L7412-7417, the block self-labeled "declaration scaffolding for the existing reference shape") | Permanently-empty locals. They were only ever no-op fallbacks: `(lt?.X ?? 0) \|\| totalX`, `live[r] ?? byReason[r] ?? 0`, `lt?.map ?? byReason`. |
| `rejectedReasons: { netEvBelowFloor: byReason['net_ev_below_floor'] \|\| totalRejected }` read | same endpoint (~L7846) | **The #386 bug itself** — it read the empty `byReason` map → reported the xStock Net-EV-floor rejection count as `0` forever, which is what fooled CC-B into the retracted #386 "xStock clears EV" claim. |
| `signalRejections: { total: totalRejected, byReason, byRegime }` response field | same endpoint (~L7889) | An always-`{ total:0, byReason:{}, byRegime:{} }` field on the xStock payload. No client consumer. |
| `signalRejections` required-ness on `FilterDiagnosticsData` | `client/src/pages/machine-learning.tsx` (~L173) | Relaxed to optional (NOT deleted) — the **crypto** endpoint still emits a populated `signalRejections`; only xStock stopped. |

**Why removed:** the dead `byReason`/`totalRejected` scaffolding was the direct cause of #386 (a decision-grade dashboard counter reading 0 forever). Per rule 18 it can't be left as commented/orphaned fallbacks where it could mislead again. All consumption now sources from the live `lt`/`ec`/`live` accumulators (the real Net-EV-floor count comes from `nullReasonAggregate['net_ev_rejected']`, written at the single reject site `eval-cycle.ts:716`).

**Blast-radius verification (certainty-before-cutting):**
- **Client consumers (repo-wide grep of `client/src`):** ZERO readers of `.signalRejections` or `.byRegime` for the xStock tab (or any tab) — only the type declaration, now made optional. The real per-reason rejection data is surfaced via `vtsEvaluation` (`rejectedReasons` + `nullReasonDetail` + the per-lane detail maps), which the panel does read.
- **Crypto endpoint UNTOUCHED:** `server/routes/vts.ts` keeps its own populated `signalRejections` (from `getSkippedSignalsSummary`); this removal is scoped to the xStock endpoint only.
- **tsc baseline GREEN after removal** (no new errors above baseline) — confirms no dangling reference to the deleted locals.

**Left intentionally (NOT dead):** `signalRejections` on `FilterDiagnosticsData` (kept optional for the crypto payload shape); the crypto endpoint's `signalRejections` emission; all `lt`/`ec`/`live` accumulator fields (the live source of truth).

**Archive copy:** none — inline endpoint locals + one response field (not a whole file); git history is the authoritative archive.
**Removal commit:** `1c451f5b5`.
**Reviewed by:** Langston Step-4 APPROVED (Discord, 2026-06-25) — the dead-scaffold excision was condition (1) of his approval.

---

## 2026-07-02 — B-TELEGRAM-DECOMM (#348): the Telegram comms bridges (Helsinki)

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `langston-bridge.service` + `/usr/local/bin/langston-bridge.py` | Helsinki systemd + /usr/local/bin | Long-polled `@LangstonDTBot` getUpdates; invoked Langston's claude-cli on Telegram inbound; posted replies to Telegram; whisper voice leg. |
| `cc-comms-bridge.service` + `/usr/local/bin/cc-comms-bridge` | Helsinki systemd + /usr/local/bin | Long-polled `@CCDTCommsBot`; wrote Kyle's Telegram inbound to `/var/log/cc-bridge-inbox.jsonl`; provided CC's Telegram outbound CLI. |
| `cc-send` telegram routing leg | `/usr/local/bin/cc-send` (Helsinki) | The `COMMS_BACKEND=telegram` branch — replaced by a LOUD FATAL error naming this log (no silent dead branch). |
| Wake-watcher Telegram tail | both CC sessions' Monitor command | `cc-bridge-inbox.jsonl` dropped from the multi-tail (now 3 sources: Discord inbox, alert-invokes, wake file). |

**Why removed:** Discord has been the sole live backend since cutover #333 (2026-06-25); the bake check (#348, alert `e4bb6055`) passed 2026-07-02 with 1,492 messages / 0 errors / traffic every day / zero bridge-journal errors over the full window. Kyle green-lit the teardown the same day. Rule 18: running-but-unused services are lingering legacy (a re-enable-by-accident vector back into live comms — Langston's Step-1 call was REMOVE the unit files, not leave inert-in-place).

**Blast-radius verification:** both services `inactive` + unit files removed + `daemon-reload` + zero remaining bridge processes; Discord bridges untouched (`active`); live `cc-send` Discord post delivered + woke NEW Claude's watcher (receipt confirmed in-channel); deliberate `COMMS_BACKEND=telegram` test failed loudly then env restored. Dependencies swept: Langston persona CLAUDE.md/MEMORY (his own flag — rewritten to the Discord model), wake watchers (3-source), CLAUDE.md §6/§8, SIM Discord-fabric, shared MEMORY.

**Left intentionally (NOT dead):**
- Bot accounts + token env files (`/etc/langston/telegram-bot.env`, `/etc/langston/ccdt-bot.env`) — registered-but-unused; deleting the accounts is Kyle's call.
- `/var/log/cc-bridge-inbox.jsonl` + voice archive + `cc-voice-archive-prune.timer` — frozen history + self-emptying prune.
- The staging alert dispatcher's `pushToTelegram`/`langston-alert-handler` code + the `ALERT_DISCORD_ISOLATION=1` drop-in (which SUPPRESSES them and must stay until the code is deleted) — **#351 / B-TELEGRAM-DECOMM-2**.
- Repo `Telegram Discussion Archives/` + `_archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md` — the historical record + restore reference.

**Archive copies:** Helsinki `/root/telegram-bridges-archive-2026-07-02/` (scripts, unit files, state files, pre-decomm Langston CLAUDE.md/MEMORY) + repo `1-system-manual/_archive/deleted-code/{langston-bridge.py,cc-comms-bridge,langston-bridge.service,cc-comms-bridge.service}.removed`.
**Reviewed by:** Langston Step-1 PROCEED (Discord, 2026-07-02) with the remove-unit-files ruling + the persona-sweep and voice-disposition riders (all executed).


---

## 2026-07-02 — B-TELEGRAM-DECOMM-2 (#351 + #107): the alert dispatcher's Telegram legs

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `pushToTelegram` + `telegramSend` + `readTokenFile` + `formatAlertText` + `KYLE_DM_CHAT_ID`/`TELEGRAM_GROUP_CHAT_ID`/`TELEGRAM_BATCH_THREAD` | `scripts/system-alerts.ts` | The B-NEW-43 #135 Telegram alert push (critical→Kyle DM + topic 21; warning→topic 21). The hardcoded DM chat-id was open issue #107 — resolved by deletion. |
| `invokeLangstonForAlert` + `shellSingleQuote` | `scripts/system-alerts.ts` | The B-NEW-46 Telegram-era Langston SSH invoke (detached Helsinki wrapper + topic-21 relay). Replaced by the Discord alerts-webhook always-engage (#332). |
| `ALERT_DISCORD_ISOLATION` env gate + the staging systemd drop-in `system-alerts-dispatcher.service.d/discord-isolation.conf` | `scripts/system-alerts.ts` + staging systemd | The 2026-06-24 suppression flip that kept the Telegram legs dead-in-prod during the Discord bake — moot once the code is gone; drop-in removed AFTER the deploy (ordering: code first, so no dead-channel post window). |
| `/usr/local/bin/langston-alert-handler.sh` | Helsinki | The B-NEW-46 wrapper (claude invoke + Telegram relay) — orphaned by the invoke removal. |

**Why removed:** rule 18 — the legs had been suppressed-but-present since 06-24 (a re-enable vector); Discord + the §10.5 per-turn queue pull carry 100% of alert delivery + Langston engagement (his own Step-1 confirmation: no alert class reached him only via the SSH invoke).
**Blast-radius verification:** all deleted symbols single-file with sole-callers (pre-audit greps); Langston independently verified no stray refs on staging + the `false||dc||false` behavior-parity; bench tsc-baseline no regressions + vitest 2122 passed/0 failed; live post-deploy proof: test alert `72fafa61` → "Discord alert posted", zero Telegram attempts, Langston bridge engaged.
**Left intentionally:** `/var/log/langston-alert-invokes.log` + the watcher tails of it (frozen, harmless); token env files (Kyle's bot-account call); `LANGSTON_INVOKE` env references died with the invoke.
**Archive copies:** Helsinki `/root/telegram-bridges-archive-2026-07-02/langston-alert-handler.sh` + repo `_archive/deleted-code/langston-alert-handler.sh.removed`. The in-file deletions: git history (commit `21c080208`).
**Reviewed by:** Langston Step-1 PROCEED (2 riders: info-severity parity — verified no behavior change; sole-sink WARNING text — swept) + Step-4 APPROVE-to-push (Discord, 2026-07-02).

---

## 2026-07-02 — P19-B7.2a (#330): the cost-cache's second fee resolver

| Item | Location (pre-removal) | What it was |
|---|---|---|
| `resolveCryptoTakerFee()` | `server/core/cache/cost-cache.ts:35` | A SECOND `fee_model.spot_taker_fee` resolver (taker-only, crypto_spot-hardcoded) that existed solely so the per-symbol cost-cache could store a fee — the literal #330 "two code paths to one fact." With it went the cache's fee storage entirely: `CostMetrics.fee`, the `setCostMetrics` fee default/clamp leg, `getOrSetCostMetrics`' fee seed, `getCacheStats.avgFee` (+ the observability log's fee field). |

**Why:** the fee is a per-CLASS governed fact owned by the B-4.5 single merge site (`cost-model.getFrictionForAssetClass`), not a per-symbol measurement. Storing it in the cache duplicated the resolver, silently clamped a governed value to `MAX_COST_BOUND` (the exact anti-pattern B-4.5 killed on the write path via `updateCachedCostMetrics`), and served it up to 5 min stale per symbol. Every consumer now composes the fee at READ time from the merge site (class from each site's own context).
**Blast-radius verification:** both internal callers (the `setCostMetrics` default + the `getCacheStats` empty branch) rewired to the merge site; zero external callers — tsc-proven (the shape drop makes any residual reader a compile error; baseline green) + repo-wide grep clean. The fee-bearing stats shape the 4 production stat readers consume moved to `cost-model.getCostCacheStatsWithFee` (cost-cache cannot import cost-model — circular).
**Archive:** function-level deletion — git history (`4b9d62fc9^`) is the archive; no separate `.removed` copy (in-file function, not a component file).
**Reviewed by:** Langston Step-2 CHANGE-2 (named the disposition requirement) + Step-4 APPROVE-to-push (verified the deletion + both rewires + zero remaining callers in-file).

---

## 2026-07-04 — P19-B8.1: Trading-page dissolution deletions (three-mode-page reorg)

| Item | Where | What it was |
|---|---|---|
| `client/src/pages/active-trades.tsx` | repo | The single 6-tab Trading page — dissolved into the three mode pages (Live/Paper/VTS via the ModeTradingPage shell + manifests); `/active-trades` route now redirects to `/paper-trading`. |
| `client/src/components/trading/pattern-scanning.tsx` | repo | Pattern Scanning tab (Phase 14.5 B19C debugging window for the pattern-repair era). Kyle ruling 2026-07-03: the pattern lane reports via the per-mode Filter Diagnostics + Open Trades now. Also the source of the whole-page `.toFixed` crash. |
| `GET /api/pattern-pool` route block (`server/routes.ts`) | repo | The tab's display endpoint — sole consumer was the tab (full both-directions trace in `P19_B8_1_PRE_AUDIT.md` §1). |
| `client/src/pages/filter-insights.tsx` + `/insights` route | repo | Standalone Filter Insights page (surfaced by the Step-1 architectural read). Retired with the tab — replaced by per-mode Filter Diagnostics. |
| `client/src/components/trading/filter-insights.tsx` | repo | The Filter Insights component (active-scan view). Both consumers (the tab + the standalone page) deleted together. |
| `filter-insights.tsx.changes` + `.patch` | repo | Tracked patch-application artifacts for the deleted component (historical strays). |

**Why removed:** Kyle locked design 2026-07-03 (P19-B8 design intentions + consensus addendum) — one home per view; Filter Insights superseded by per-mode/per-class Filter Diagnostics.
**KEPT (corrected delete set — pre-audit §1):** `pattern-pool-dispatch.ts` + both per-class `pattern-pool-filters.ts` + their barrel exports — consumed by the SQE (`signal_quality_evaluator.ts:35`), `active-position-sizing.ts:33`, `active-filter-pool.ts:24` (types), and the per-class state diagnostic. The original "delete the dispatcher too" plan was WRONG and caught by the conditioned re-trace.
**Also moved-not-deleted:** VTS Open/Closed trade views + both FD panels → Virtual Simulations page (ML page keeps Predictive Adjustments / Regime Archive / DBS Pair Tracking); trading toggle + paper modals → `PaperTradingControls` on the Paper page; live confirm modals left unmounted for the Phase-21 live-controls build (left-intentionally, not lingering — named future home).
**Blast-radius verification:** bench tsc-baseline no regressions + vitest 2004 passed (parity with HEAD); consumer traces in `P19_B8_1_PRE_AUDIT.md` §1/§2.
**Archive copies:** `_archive/deleted-code/*.20260704-P19B8.1.removed` (6 files); route block in git history (commit `57617c3c9`).
**Reviewed by:** Langston Step-1 APPROVED ×2 + Step-2 APPROVED (certainty-before-cutting condition discharged); Step-4 diff review pending.

---

## P19-B8.4c REV-3 (2026-07-08) — ActiveDownstreamFunnel + ActivePipelineTail (client display components)

**What:** two React display components in `client/src/components/vts/vts-filter-diagnostics-panel.tsx` — `ActivePipelineTail` (the mode's pipeline-tail card, /api/active-engine/pipeline-tail) and `ActiveDownstreamFunnel` (the per-stage downstream funnel card, /api/active-engine/diagnostics/funnel). Plus the now-doubly-dead guard `{gateDisposition === 'enforce' && modeTail && <ActivePipelineTail/>}` in the tag-path (already unreachable — the enforce path early-returns above it).

**Why:** P19-B8.4c REV-3 OBJ-8 replaced the generic Paper/Live pipeline placeholders with `DormantPipelineTables` (the dormant 3-table mirror of the VTS layout). These two components were superseded, not paused — B8.5 (the switch-on) wires `DormantPipelineTables` to live per-mode counts, NOT these components. Carrying unreferenced defs forward would be lingering dead code (§15). Langston Step-4: delete confirmed (all review passes agreed they're superseded/not-reused).

**Blast-radius verification:** grep confirmed the only render calls were (a) the enforce-block calls removed by the OBJ-8 diff and (b) the already-unreachable tag-path guard. No tests reference them. The `ActiveFunnelEnvelope` import (their only consumer) was removed. tsc-baseline clean after deletion (no dangling reference). 

**Server side (NOT deleted — intentional):** the B8.4b active-funnel WRITERS + the `/api/active-engine/diagnostics/funnel` and `/pipeline-tail` endpoints PERSIST server-side. They are now client-UNCONSUMED until B8.5 wires the dormant tables to them — this is deliberate, not an orphan. Home: B8.5 (the switch-on).

**Archive:** `1-system-manual/_archive/deleted-code/P19-B8.4c_ActivePipelineTail_ActiveDownstreamFunnel.removed.tsx`. Git history is authoritative.

---

## 2026-07-10 — Langston's stale governed-artifact copies (#455, B-GOV-INTEGRITY-0)

**Removed by:** CC-A, during the governance-integrity investigation (Kyle directive 2026-07-10).
**Why:** we spent the day diagnosing an enforcer that grades fresh commits against a **frozen rulebook** (#449, `poller.mjs:313`). Nobody audited whether the **reviewer** had the identical defect. He did — at two layers.

### (1) `/home/langston/.claude/CLAUDE.md` — the substantive one, auto-loading
- 3,943 bytes, mtime **2026-05-14 11:50** · Telegram ×3, Discord ×**0**.
- Sat beside the live `/home/langston/CLAUDE.md` (45,795 bytes, mtime 2026-07-03, Discord ×14).
- `comms-infra/discord/discord-langston-bridge.py:57` → `WORK_DIR = "/home/langston"` = the `cwd` of every `claude -p` invoke.
- **Per this repo's own `CLAUDE.md` §4** (the rule Kyle wrote on 2026-06-15 after finding this exact duplicate here), Claude Code auto-loads **BOTH** `./CLAUDE.md` **AND** `./.claude/CLAUDE.md` and **CONCATENATES** them.
- ⇒ For ~2 months every Langston invoke loaded his current Discord-era persona concatenated with a 2026-05-14 context-loader asserting **Telegram is the comms channel** and that there is **ONE "main CC" running on Kyle's laptop** — predating the Discord cutover (#333), the CC-A/CC-B split (Kyle 2026-06-12), and the `na-skip` discipline.
- **Not claimed:** that this caused the day's contradictory verdicts. It is a mechanism *fully capable* of producing them, it was present throughout, and none of the three of us checked. (Per #453, an inference is not a measurement.)

### (2) `/home/langston/inbox/b-gov/checker/GOVERNANCE_EXCEPTIONS.md` — latent, not wired
- mtime **2026-06-17**, containing **zero** of the live `na-skip` rows (no `B-TELEGRAM-DECOMM`, no `B8.4b`, no `B8.4c`).
- **Langston's correction, accepted on-record:** nothing programmatic reads it, so "live landmine" (CC-A's word) **overstated it — the correct word is *latent***: a stale rulebook that answers a `grep` wrongly and confidently.
- Replaced in place with `GOVERNANCE_EXCEPTIONS.POINTER.md` naming the single source of truth (`git show origin/migration/aws-supabase:1-system-manual/GOVERNANCE_EXCEPTIONS.md`).

**Blast-radius verification (certainty before cutting):** live `claude -p` one-off invoke on Langston's box **after** removal returned `OK` (his runtime loads these paths, so this was tested, not assumed). `find /home/langston -maxdepth 2 -name CLAUDE.md` → exactly **one** file. Mount health re-verified (an earlier `timeout 8 ls /mnt/gdrive` false-negative was a cold rclone cache; 12s succeeds — CC-A's own near-miss, reported rather than buried, and caught by the #453 rule filed ninety minutes earlier).

**Archive:** `/root/langston-stale-artifacts-archive-2026-07-10/` on Helsinki (`*.removed`, sha256 recorded at copy time). Git history is not authoritative here — these files never lived in the repo.

**Left intentionally:** staged **context** files in `/home/langston/inbox/**` (scopes, diffs, design asks). Langston is stateless per-invoke; staging context is correct and necessary. **Staging a copy of the RULEBOOK, or of his PERSONA, is the bug.** The two look identical in an `ls`.

**Rule earned (→ #453, #455):** *no governed artifact may exist as a second, unmanaged copy anywhere an agent reads* — not an inbox, not a checker worktree, not a home directory. It is read from ONE place, the graded ref, or it is a hazard. This is the human-layer form of `B-GOV-INTEGRITY-0`'s `readGoverned` chokepoint: **one doorway, one ref, one truth.**

---

## 2026-07-13 — the `predictiveConfidence×100` DI proxy bridge, BOTH lanes (#500, P19-B8.5b)

**Removed by:** CC-B, P19-B8.5b OBJ-2/OBJ-3 (Kyle directive + crew-locked rule-18 disposition 2026-07-13: delete, not a fallback).
**What:** the two inline expressions substituting `Math.min(100, Math.max(0, predictiveConfidence * 100))` for the kernel's `DI` input — `server/services/vts-runner.ts:1673` (crypto VTS lane) + `server/asset_classes/xstock_spot/eval-cycle.ts:705` (xstock lane). Not a file — a code-path removal; exactly two sites repo-wide (Langston-verified at the ref pre-cut).
**Why:** the bridge predates xStock entirely (commit `e4ce3c55f`, 2026-02-03 — a kernel-unification carry-gap patch that fed a CONFIDENCE-scaled proxy where a price-path integrity measure belongs). It made every VTS kernel evaluation consume a fabricated DI, poisoning the netEV inputs the learning data records and blocking honest replay (#500).
**Replaced with:** the REAL lane-native DI, carried not recomputed — crypto: scanner `calculateDirectionalIntegrity` (`fx5-scanner.ts:1073/:1202`) carried via `ScanBatchPair.di` → `vts-runner` `propagatedDi` (the B63 dbsScore ride pattern); xstock: `imfResult.metrics.DI` hoisted (`eval-cycle.ts` `laneRealDi`). HONEST-ABSENT: when no real DI exists (IMF didn't run / scanner gap) the kernel input is `undefined` → the kernel's documented `DI = 50` default (`net-expectancy-kernel.ts:91`) — never a fabricated stand-in; capture records `realDiAtOpen: null` + `kernelDiInputAtOpen: 50` honestly.
**Blast-radius verification:** `predictiveConfidence` appears ONLY on removal lines in the diff (single-diff proof, Langston Step-4 per-point AGREE); bench tsc baseline OK; vitest 2244/0; CI 4-green run 29268986981; deployed commit `3aab09d99`.
**Known residual (flagged, NOT silently reconciled):** crypto DI and xstock DI are TWO DIFFERENT FORMULAS sharing one name (trend-straightness `|net|/path` vs signed direction `(net/abs)×50+50`) — divergence homed at #502 (Phase-25 calibration arc).
**Archive:** git history is the authoritative archive (inline expressions; no `.removed` file applicable).

## B-OPS-PM2-LOG (#499) — 3 stale log-file artifacts deleted 2026-07-13 (CC-A, Langston-approved)
- `/home/deploy/.pm2/logs/dawntrader-out.log` (1.5GB, frozen 2026-04-03) — abandoned old default location, orphaned when pm2 log paths moved to `/var/log/dawntrader/`; no open holder (verified). 
- `/home/deploy/.pm2/logs/ml-service-error.log` (288MB) + `ml-service-out.log` (9.8MB) — the ml predictive microservice was RETIRED in B-NEW-54; the pm2 God daemon still held write fds (fd24/fd3), so `rm` + `pm2 reloadLogs` were both required to release the inodes. 
- Blast-radius: none — pm2 configured paths point at `/var/log/dawntrader/{out,error}.log`; no live consumer. ~1.86GB reclaimed. git history is not the archive here (runtime log artifacts, not code).

---

## 2026-07-14 — the two standalone VTS `computeNetExpectancyKernel` calls (#503, P19-B8.5c)

**Removed by:** CC-B, P19-B8.5c (Langston Step-2 PROCEED — his design ruling: "deleting both standalone calls and re-pointing to `decision.taker.*` is structurally sound — the drift class dies because there's no second site left to keep in lockstep").
**What:** the lane-local kernel invocations at `server/services/vts-runner.ts` (~:1682, Directive 11.8B-A2 era) and `server/asset_classes/xstock_spot/eval-cycle.ts` (~:733, B79.0m.b2 era), plus their now-unused imports and the two false comments claiming `decision.takerNetEV == kernelResult.netEV`.
**Why:** both passed `totalFriction` as a round-trip FRACTION where the kernel contract requires PRICE-UNIT dollars (`netEV = pWin·distTarget − pLoss·distStop − totalFriction`, distances in dollars) — friction mis-scaled by ~entryPrice×, direction flipping at $1. The gates had already been silently corrected by the B7.2b/d switch to `chosenNetEV`; these calls survived only as contaminated telemetry/archive feeders (#503).
**Replaced with:** reads from the shared `decideMakerTaker` result — `taker: NetExpectancyKernelResult` carries the full decomposition (netEV/rawEV/netRewardToRisk/totalCost/pWin/distances); the crypto attached `signal.netEV` now carries `chosenNetEV` (the number the lane's floor actually gated — Langston-blessed, closes a latent taker-vs-chosen inconsistency). The fraction variables SURVIVE for their two legitimate RATE consumers (`checkPreOpenGates`, which multiplies by price itself, and the payload rate fields).
**Blast-radius verification:** grep-proven consumer enumeration (pre-audit §2, every `kernelResult` token dispositioned); zero external callers (lane-local consts); reject-on-throw parity preserved (the xstock decision call gained the deleted call's try/catch semantics); admit-rate invariance asserted at Step-7. Archive: git history authoritative (inline call sites).

---

## 2026-07-15 — the 8.9.4-Patch book "sequence validation" block + `lastSeq` field (#507 predecessor, P19-B8.5 mini-cycle 4)

**Removed by:** CC-B, P19-B8.5 switch-on mini-cycle 4 (Langston Step-4 APPROVED — his re-derivation: "validating against noise; `next <= prev` on a uniform 32-bit value fires ~half the time; no legitimate out-of-order protection is lost because none ever existed here").
**What:** the checksum-as-sequence block inside `handleV2BookUpdate` (`server/exchanges/kraken/kraken-websocket-adapter.ts`, 8.9.4-Patch era) + the `private lastSeq: Record<string, number>` field and its two cleanup references (softResubscribe delete, full reset) — all 5 `lastSeq` tokens in the file, independently enumerated by Langston at Step-4.
**Why:** Kraken v2's book `checksum` is a CRC32 of the top-10 book STATE — uniformly distributed per update, NOT a monotonic sequence (v2 deltas carry no sequence number; that was v1). The block deleted the ENTIRE per-symbol mini-book whenever the CRC failed to increase (~half of all updates; measured live 2026-07-15: 32,521 book deletions in one log window, TAO/USD wiped 13,839 of 23,939 updates = the coin-flip rate) and never resubscribed afterward, so books rebuilt from deltas alone and the #295 open-depth gate saw `no_book`/`thin_book` on nearly every promotion. Latent since 8.9.4 — nothing consumed `getBookForFill` until the depth gate went live at the B8.5 switch-on.
**Replaced with:** nothing (deletion, rule 18) — the mini-book is maintained purely by snapshot+delta, the pre-8.9.4 status quo. REAL book-integrity validation (CRC32 per Kraken's documented algorithm + resubscribe-on-mismatch) is a named future build: RUNNING_ISSUES #507, Phase-20 hardening.
**Blast-radius verification:** `lastSeq` had zero consumers outside the deleted block + two cleanup lines (grep-proven, Langston-verified independently); tsc baseline clean; full unit suite 2121 passed. Archive: git history authoritative (inline block).

---

## 2026-07-15 — the non-anchor portfolio_state.balance writers (single-writer cut, P19-B8.5)

**Removed by:** CC-B, P19-B8.5 fix-round (Kyle structural directive 2026-07-15 — "make the ledger use ONLY the correct numbers and feed"; Langston-endorsed same day).
**What:** (1) `confirmPortfolioBalance` (active-engine-service, Phase-27.F.14.D-POST era — zero callers since B8.2/41D retired the confirmation gate); (2) the REB 2.8.11 session-start balance WRITE + its previous-balance cache + write-failure rollback framework (became read-and-verify: the ANCHOR_ASSERT re-aligns the SESSION row from the ledger, never writes portfolio_state); (3) the reset route's portfolio_state upsert + its `newBalance` mint param (reset = cleanup only; the param now 400-refuses like the B8.2 start-new refusal); (4) the `PATCH /active-engine/config` starting_balance write leg (zero client callers; route stubbed 410 for external-caller honesty — Langston to rule stub-vs-full-delete at Step-4); (5) `storage.upsertPortfolioState` + `storage.updatePortfolioBalance` (methods + IStorage entries — zero callers after 1-4); (6) the initializer's raw genesis writes incl. the paper $1000 default (a silent mint of the $800-clobber class) — genesis now flows through `executeReanchor('launch_snap')` from the real Kraken balance, and refuses to invent a number when Kraken is unreachable.
**Why:** the $800-clobber incident proved the working balance could drift from the anchor ledger through any of these paths. Single-writer: `executeReanchor` (portfolio-anchor-service) is now the ONLY code that writes `portfolio_state.balance`; the morning's ANCHOR_GUARD override decayed into an assertion that cannot fire.
**Also fixed in the sweep (same wrong-shape class as the $800 bug, #510 scope):** the reset route's balance echo read `systemContext.id` as globalContextId (always missed the 'default' row) then `.cash` (a column P19-B3b established doesn't exist) — it echoed a hardcoded $10000 every time; now reads the real row/field or 409s.
**Blast-radius verification:** all 7 writer sites from the D audit enumerated + dispositioned; zero remaining references (grep + tsc clean at the bench); rollback = git history (inline deletions).

## 2026-07-16 — `server/services/dynamic-slots.ts` (P19-B8.7 OBJ-3)
- **What:** `getDynamicSlots(mode)` — computed a "slot count" as floor(maxTotalExposurePct ÷ maxPositionPercentPct) with hardcoded fallbacks (8/40/12) when guardrails were unreadable.
- **Why removed:** the number it produced was never the constraint the engine enforces (admission gates on `guardrails_v2.max_open_positions` via buildSettingsFromGuardrails — active-execution-engine.ts promotion sites); its only consumer was the active-trades API display, which rendered a phantom "of 5" cap + a false OVER LIMIT banner (Kyle 2026-07-16). Display re-keyed to the real constraint; the ratio has no remaining reader.
- **Blast radius verified:** repo-wide grep post-swap = zero callers (the only other hit, `m5e-validation-service.ts:114`, is that file's OWN private function of the same name — untouched, noted in RUNNING_ISSUES as carrying the same fallback pattern).
- **Archive:** `1-system-manual/_archive/deleted-code/dynamic-slots.ts.removed`; git history authoritative.

## 2026-07-16 — `AnalyticsPanel` ("Current Simulation Performance Analytics") in `trade-history-tab.tsx` (P19-B8.7 OBJ-6, Kyle-approved delete)
- **What:** the header analytics section on the Paper Closed Trades tab (component + its range selector + orphaned locals: `Analytics`/`AnalyticsResponse` interfaces, `EMPTY_ANALYTICS`, `MetricCard`, `ALL_STRATEGIES` — the last carried a stale 9-strategy list with a dead `range_trading` key).
- **Why removed:** every metric it displayed (win rate, TP/SL split, net P/L, averages, profit factor, by-strategy) exists on the per-mode Dashboard tab (B8.3), which is richer (Net R, fee drag, drawdown) and per-mode. Kyle confirmed delete 2026-07-16 ("as long as there's not something else I'm missing" — the something-missing check: the by-strategy mini-list is covered by the Dashboard's By-Strategy table).
- **Blast-radius verified:** the `/api/active-engine/trades/analytics` ENDPOINT is KEPT — second consumer traced (`mode-dashboard-tab.tsx:105`). Post-cut grep: zero references to the removed locals; tsc baseline OK.
- **Archive:** git history (commit carries the full component); removal note left at the render site.

## 2026-07-16 — the `initializeQueues` DB session sweep in `operation-queue.ts` (B-STAGING-LIVENESS-WATCH OBJ-2, #520)
- **What:** the "41F-B-5 orphaned session recovery" block (~:296-316): selected every `active_engine_sessions` row with `status='running'` at boot and unconditionally marked it stopped.
- **Why removed:** it predates the R9.3.HF-4.FIX auto-resume and its premise ("running rows should have been stopped on previous shutdown") became FALSE the day resume existed. Because `index.ts` runs `initializeQueues()` (:422) BEFORE `resumeActiveEngines()` (:437), the sweep deterministically destroyed the session the resume needed — every process restart silently halted paper-active trading (#520; observed live all day 2026-07-16, manual continue-start after each deploy). Boot session disposition now has ONE owner: `resumeActiveEngines` (resume, or refuse loudly via the B8.2 gate — refusal now also marks the row stopped).
- **Blast-radius verification:** sole caller of `initializeQueues` = `index.ts:422`; the deleted block's only effect was the row close (no consumed return value); the in-memory manager/global-engine cleanup below it is KEPT unchanged. tsc baseline clean.
- **Archive:** `1-system-manual/_archive/deleted-code/operation-queue-session-sweep.removed` (git history authoritative; pre-delete ref `d10a24487`).

## 2026-07-17 — third-party display price fetchers in `live-pricing-adapter.ts` (P19-B8.9 OBJ-1, venue-only at-source)
- **What:** `fetchFromBinance` + `fetchFromCoinGecko` (private fetchers) + the exported `binanceSymbolFor` routing guard (B8.5 soak fix C), plus the Binance-first + CoinGecko legs of `fetchLivePrice` (chain re-ordered to Kraken-REST-or-nothing), the `'binance' | 'coingecko'` source-union members, the `'binance_ws'` `updateCache` member + its two collapse-to-'binance' ternaries (cache write + frontend broadcast — the fifth mislabel of the B8.9a family), and the `binance_rest`/`coingecko` entries of five drifted inline `restFallbackSources` lists (4× routes.ts + active-portfolio-manager.ts, folded to the shared `isRestFallbackSource` predicate).
- **Why removed:** Kyle structural directive (venue-only): the actionable path went venue-only at 347e9534b; this is the at-source half — stop FETCHING backup prices at all. Third-party APIs were the PRIMARY display fallback (Binance tried first), so the UI could show a Binance number for a position the engine prices and exits via Kraken — the display/execution venue split-brain. The B8.5 ghost-market guard (`binanceSymbolFor`) died with the fetcher it guarded. Replaced by: honest venue-quiet display state (OBJ-5).
- **Test retired with its subject:** `server/tests/unit/p19-b8-5-exit-integrity.test.ts` — on-disk content was SOLELY the 11 `binanceSymbolFor` assertions (one describe, 34 lines; authorship-confirmed by CC-B on channel); skip-rail/exit-integrity coverage lives in `p19-b6-6-price-liveness.test.ts` + `p19-b8-9a-source-tag-honesty.test.ts` + the new `p19-b8-9-venue-only-source.test.ts`.
- **Left intentionally:** `server/market-data.ts:113` has its OWN separate `fetchFromCoinGecko` (different subsystem — Langston Step-4 Condition 2; untouched, its own future disposition); the adapter's `mock` guard (dormant, Phase-20 retirement item); `entry_seed`/`last_known_good` writers (KEEP verdicts, OBJ-3 table in the pre-audit).
- **Blast-radius verification:** zero remaining `fetchFromBinance|fetchFromCoinGecko|binanceSymbolFor|binance_ws` references in the adapter/callers (grep); tsc baseline + full vitest at the bench (see completion report).
- **Archive:** `1-system-manual/_archive/deleted-code/live-pricing-adapter.third-party-fetchers.P19-B8.9.ts.removed` + `p19-b8-5-exit-integrity.test.P19-B8.9.ts.removed`; git history authoritative.

## 2026-07-22 — three dead ranking-component columns on `rtb_signals` (B-RANKING-COMPONENT-CAPTURE, #555)
- **What:** `rtb_signals.regime_weight`, `.hybrid_score`, `.decay_penalty` (schema entries in `shared/schema.ts`, the matching `onConflictDoUpdate` mappings in `storage.ts`, and the columns themselves via `2026-07-22-b-ranking-component-capture-drop-dead-columns.sql`).
- **Why removed:** NULL on 100% of rows for their entire existence. The queue-insert builder (`ready_to_buy_service.ts` `insertData`) enumerates 26 fields and never included these three, so the storage upsert mapping was fed `undefined` on every write — writer-shaped code pointing at nothing. Their sole consumer (the shadow-pairing selection-quality capture) is re-pointed to `metadata`, the established SSOT for these derived components (the same builder already reads `meta.atr` / `meta.sourcePool` / `meta.rankingScore`). §15: removed rather than left lingering — a NULL column that looks wired actively misleads, and it had already nearly produced the wrong disposition once (a stale "DORMANT" comment on the consumer, corrected in the same batch).
- **Keep-as-data did NOT apply:** contrast the `paper_sim` discriminator precedent, which holds real stored data. These columns contained nothing to preserve, so the drop loses no history.
- **Blast-radius verification:** reader census independently re-derived by Langston at `58d8f8f94` (not taken on report) — `git grep -w "s\.(hybridScore|decayPenalty|regimeWeight)"` returns exactly three lines (`:2222/:2224/:2225`), all inside the single shadow-pairing capture block, zero other column reads; every other `regimeWeight`/`hybridScore` hit in the tree is a different receiver (SQE input objects, MCE output, score-calculator, config weights, a slippage alias in `cost-telemetry.ts`). No DB-side dependency: a live `pg_depend`/`pg_rewrite` query returned ZERO views or matviews referencing `rtb_signals`. **tsc baseline clean after the schema removal — the machine-checked version of the census: a missed reader would have failed loudly.**
- **Deploy ordering (load-bearing):** code deployed FIRST, migration applied second. The schema fields leave in the same commit so live code never SELECTs the dropped columns; running the migration against older code would have broken its SELECT.
- **Archive:** rollback migration `2026-07-22-b-ranking-component-capture-drop-dead-columns-rollback.sql` restores the columns as nullable `decimal(5,4)` (shape only — there was never any data to restore). Git history authoritative; pre-delete ref `fb16aec48`.

---

## `exit_integrity.max_equity_tick_age_ms` — the flat 90-second xStock mark-staleness ceiling (P19-B8.5e, 2026-07-22, `#548`)

- **What:** the single global DB constant that decided how old an xStock mark could be before the exit path refused to evaluate a position against it. Seeded 2026-07-16 (`2026-07-16-p19-b8-5-equity-tick-age.sql`), value `90000`.
- **Why removed:** REPLACED, not merely obsoleted. P19-B8.5e derives the ceiling per symbol and per position (`clamp(budget/σ_effective, floor_ms, cap_ms)`). Measured, the one number was simultaneously **too loose** on the fastest symbol (blind to ~4% of adverse movement) and **too tight** on the safest (49 refusals/24h on ordinary quiet trading) — symbols whose risk-per-second differs ~11× cannot share a constant.
- **Why DELETED rather than scheduled (§18):** leaving the row is exactly the "looks governed, is inert" state this batch's own migration argues against 20 lines earlier. Decided AT the find.
- **Blast-radius verification:** full-repo census on the RAW constant name (not just an ORM spelling — the lesson from the `xstockSpotTickerSnap` false-absence): **2 code references**, both rewritten by this batch, plus its own migration pair. **Zero** UI, API, or telemetry readers. Independently re-derived by Langston at the ref — the only surviving `.ts` hit is a `WAS:` comment.
- **Rollback:** the rollback migration **RESTORES** the row at its pre-B8.5e value `90000`. ⚠️ **Load-bearing:** reverting the code WITHOUT this restore leaves every xStock position fail-safe-skipping its exit evaluation — a worse state than either version.
- **⚠️ Deploy-ordering lesson (recorded, not buried):** the retiring DELETE was applied while the OLD code was still running, so for ~4s every xStock position logged `knob unavailable — fail-safe skip`. It failed SAFE (skip, never act on an unvalidated mark), but **a retirement DELETE should land WITH its code, not before it.**
- **Commit:** forward `e48a623da` (scoped by `asset_class` at Langston's nit so it is symmetric with its rollback), hotfix `1f0ade30e`.

---

## `AdaptiveRatioManager` + the telemetry pool-aggregate limb — the dynamic ideal/rotational scan split (B-ARM-REMOVAL, 2026-07-28)

- **What:** `server/services/adaptive-ratio-manager.ts` in full; the adaptive branch in `adaptive-scan-manager.ts` (`useAdaptiveRatio`, `ratioUsed`, `setAdaptiveRatioEnabled`, `getAdaptiveRatioState`); `getPerformanceByPool` + `getPoolComparison` (`telemetry-repository.ts`); and the whole pool-aggregate limb in `telemetry-aggregator.ts` — `poolAggregates`, `updatePoolAggregate` + its guarded call site, `getPoolPerformanceComparison`, `resetPoolAggregates` + its call inside `flushStaleTelemetry`, the exported `PoolPerformanceAggregate`, the persist key and the guarded restore block. **`PoolType` KEPT** — it still types `entry.pool`.
- **Kyle's authorisation (2026-07-28):** *"The ideal vs. rotational pool was a good idea in theory - best performing get scanned more often - but it doesn't sound like its been implemented in a way that is working effectively. If we can't improve upon it, we can do away with it."* **The improvement path was tested and failed on arithmetic (below), so the condition was met and measured, not assumed.**
- ★ **Why removed — THE KNOB NEVER REACHED ALLOCATION.** `actualIdealCount = min(ceil(300 × ratio), availableIdealCount)` (`adaptive-scan-manager.ts:212-217`). Measured on `/var/log/dawntrader/out.log` (control: 1,155 `[11.4B.2-R1]` lines present — an empty grep would have meant something): `Target: Ideal=151, Available=16, Actual=16+284=300`, `UNDERFLOW PROTECTION` firing, cycle composed **4%/78%**. `Available` over 200 consecutive cycles: 0 (52×), 1 (36×), never above **16** against a target of 151; today avg **5.6**. Pre-cut archive (control: 4,265 lines): avg 31.1, **max ever 60** — still far below target. ⇒ **the clamp bound on EVERY cycle in all observable history, so the dynamic ratio and a fixed one resolve to the SAME allocation. The removal is behaviour-neutral BY MEASUREMENT.**
- **Why the design could not be repaired:** (1) its SQL evidence source, `telemetry_history` per pool/regime over 24h, holds **ZERO rows and always has** — the writer is fenced by `shouldPersist()` = `(mode === 'live') || force`, and we have never run in live mode, so *learn during VTS, apply at launch* never had a data path; (2) its in-memory source is well-fed but its damper, `computeConfidence = min(1, totalSamples/100)`, is a **pure volume counter** that saturates at 100 samples and never returns — at the measured 28,238 samples it is, by design, incapable of restraining anything; (3) `computePoolScore = winRate*0.6 + avgEdge*0.4` where `avgEdge` traces to `avgFinalScore`, fed `finalScore ?? 0` since #558 A2; (4) **`MIN_SAMPLES: 3` is dead config** — assigned at `telemetry-aggregator.ts:141`, read by nothing.
- ★ **The decisive argument is the PURPOSE TEST, and it stands independently of every measurement above (Langston):** this knob allocated **scan attention**, while the binding constraint is the net-EV/fee **qualification** drought (#570). **The funnel is dry at the qualification stage, not the looking stage — tuning attention upstream of a dry gate buys nothing.**
- **Taxonomy — NOT a defect (rule 24, bucket 2/3):** nothing malfunctioned. **The design did not survive its own inputs.** Framing it as a bug invites *"then fix `computeConfidence`"* and relitigates a settled decision.
- **Why the aggregate limb went too, rather than being left write-only:** deleting only the getter would have left `updatePoolAggregate` writing state nothing could read, with the snapshot serialiser as its sole remaining consumer — the #568 class inverted, and precisely what a later maintainer deletes as obviously dead. Two affirmative reasons to cut it: its input has been a zero since #558 A2, so it would have persisted a **decaying** number to disk every 60s forever; and it measures **win rate**, the statistic §0 rejects and the reason this component died. **Preserving it would hand the wrong metric to whoever builds pool quality next.**
- **No migration:** the state file (`logs/telemetry_state/aggregator_state.json`) is module-local, written and read only by `persistTelemetryState`/`rehydrateTelemetryState`, and the restore was key-guarded — a leftover key in an existing on-disk file is ignored by `JSON.parse`. Nothing reads `version`.
- **Blast-radius verification:** whole-tree census independently re-derived by Langston; sole production caller of `getPoolPerformanceComparison` was `adaptive-ratio-manager.ts:104`. **tsc total 394 = unchanged baseline, zero errors referencing any deleted symbol.** Seven affected suites green, 56/56. ⚠️ **The test count was 7 files / 25 sites, not the 4 either census first named** — `b79-0n-orchestrator-consumer-swaps.test.ts:119-123` holds negative fences asserting the ARM is *not* constructed; they survive and now pass trivially.
- **Tests — the SUBJECT-vs-PROBE rule (Langston; worth reusing):** a test whose **subject** is the deleted component dies as a unit; a test whose subject is a **surviving invariant** that merely used a dying symbol as a **probe** is **re-pointed, never deleted**. `b79-0n-telemetry-isolation.test.ts` is the second kind — its subject is B79 per-class instance isolation — and was re-pointed to `getRecordCount`/`getPairCount`, keeping coverage that had nothing to do with this batch.
- ★ **LEFT INTENTIONALLY (so a later grep does not read as a missed sweep):** `PoolType`, `entry.pool`, `getTopPairs`/`getTopPairsWithPool` and the ideal/rotational pools themselves are UNTOUCHED. **The pools survive; only the dynamic split between them is gone.** Pool MEMBERSHIP remains outcome-blind — `getCompositeScore` blends four pre-trade estimates off a single `latest` observation — which is a **recorded, unfixed** defect (**#597**), not something this batch addressed.
- ★ **THE FUTURE PATH — the idea was sound, the implementation could not measure it.** Scanning better performers more often is right in principle. If a real per-pool evidence base ever exists, the principled version is **discounted Thompson Sampling on net log-growth** (Kelly = the rho=1 manipulation-proof measure; win rate is the most manipulable statistic available), over a window **far wider than 24h-per-regime**, and gated on **#596** (representativeness of the outcome corpus — a lane-selected sample is biased in a way no statistics repair). **Do not resurrect this component; rebuild from Net Expectancy.**
- **Archive:** `1-system-manual/_archive/deleted-code/b-arm-removal-adaptive-ratio-manager.ts.removed` — recorded by git as a **rename at 100% similarity**, so `git log --follow` traverses the file's full history. Git history authoritative.
- **Commit:** `e3a22c15a` (Step-3). Scope: `Claude Comms and Packages/Scope Files/B_ARM_REMOVAL_SCOPE.md`.

## 2026-08-04 — GitHub classic token `replit-dawntrader` DELETED (credential, not code)

**What:** Kyle's classic personal-access token `replit-dawntrader` — **`repo` scope (full code read/write), NO expiry**, created for the Replit-era GitHub integration. Deleted by Kyle in the GitHub UI 2026-08-04, on CC-B's recommendation, surfaced while provisioning Langston's board token.
**Why:** Replit is FROZEN (rule 2, since 2026-03-30). The token's "last used within the last 5 months" was consistent with nothing touching it since the freeze. A non-expiring, code-writing credential for a decommissioned integration is a standing risk with no owner.
**Blast-radius verification (measured before deletion, with a positive control):** all three infrastructure pulls from GitHub authenticate WITHOUT any embedded token — staging app clone + governance-checker clone + Helsinki backup mirror all use plain `https://github.com/kylegjordan/DawnTraderV3.git` remotes; no `.git-credentials`/`.netrc` on either box; the mirror's push URL remains the deliberate `DISABLED://` sentinel. The detection filter was control-tested against a synthetic embedded token and caught it. CC-B's own laptop access rides Kyle's keyring login, not this token.
**Effect:** frozen-Replit's last standing write path to the repository is severed BY CONSTRUCTION — rule 2 goes from a policy we obey to a fact the outside world enforces (the impossible-over-intercepted principle, same as the mirror's disabled push URL). Worst case: anything obscure still holding it now fails LOUDLY with an auth error naming its cause.
**Note for future greps:** Replit references in code/docs are historical; as of this date there is NO live credential by which Replit can reach the repository.

## 2026-08-05 — `.github/workflows/deploy-staging.yml` DELETED (B-DEPLOY-LOCK OBJ-8, #649)

**What:** a DORMANT GitHub Actions deployer — EC2-era TEMPLATE, triggered on a `staging` branch that has never existed, secrets unset, **zero runs ever (verified at the runs API, not the file header)**. Surfaced by the #649 pre-audit census as a fourth deployer nobody remembered; **decided DELETE at Step-2 (Langston re-derived it himself).**
**Why:** it prescribed a `git pull`-based deploy chain contradicting `dt-deploy`, and a future `staging` branch + secrets would have woken it SILENTLY — an automated deployer outside the lock. We are on Hetzner; the EC2 infrastructure it documents will never be provisioned.
**Blast radius:** zero callers, zero runs, zero secrets configured; referenced by name in `deploy/DEPLOYMENT.md:132-134`, which joins the OBJ-5 sweep. Archive copy: `_archive/deleted-code/deploy-staging.yml.removed` (git history is the authoritative archive). **CORRECTED IN BODY at Step-4 (Langston): the original claim "nothing references the workflow by name outside itself" was FALSE — `deploy/DEPLOYMENT.md:132` lists it as a deploy path and `:134` names its secrets. That doc is now the SIXTH OBJ-5 sweep site.**

## 2026-08-06 — B-TRADE-TIER-REGISTER (#599): two deleters removed (rule 18)

| What | Why | Blast-radius verification | Archive | 
|---|---|---|---|
| `sweepClosedOpenTrades` (fn, `vts-trade-persistence.ts`) + its boot call (`server/index.ts`) | Disposition (4): the per-boot GC raced the cron sweep’s new archive-before-delete lane on the same predicate and deleted WITHOUT archiving at nearly every restart | State-write census clean (console lines + a return DISCARDED by the only caller); zero surviving readers; subject unit-suite removed per SUBJECT-vs-PROBE; the `closed_gc_retention_days` constant STAYS (the cron lane’s hot window — the #1359 constant-starving trap cited in-scope) | `_archive/deleted-code/sweepClosedOpenTrades.ts.removed` |
| `cleanOldClosedTrades` (impl + interface line, `storage.ts`) | Disposition (5): dead (ZERO callers, Langston-enumerated) but live-callable AGE-based deleter on the exact table the batch archive-gates — the accidental-re-entry hazard §15 exists to kill; superseded by the archive lane | Caller census: interface + impl only; no state written beyond its deletes; tsc baseline unchanged (393) | `_archive/deleted-code/cleanOldClosedTrades.ts.removed` |

---

## 2026-08-07 — `adaptive-guardrails` (the legacy adaptive tuner) + its six endpoints — B-SIZING-DEC-RESTORE obj-11 (#659)

**WHAT:** `server/services/adaptive-guardrails.ts` (616 lines, `AdaptiveGuardrailsService`) and the SIX `/api/learning/*` routes that were its only live reachability — `GET /learning/telemetry/:mode`, `GET /learning/behavioral-log/:mode`, `GET /learning/history/:mode`, `POST /learning/snapshot/:mode`, `POST /learning/rollback/:mode`, `PUT /learning/mode/:tradingMode` (`routes.ts`, 128 lines removed).

**WHY:** disposition **(5) — dead code that should stay gone.** Kyle ruled it legacy 2026-08-06 and folded the deletion into this batch 2026-08-07 (*"delete the legacy tuner also"*). Its write path `applyAdaptiveAdjustments` had **zero callers**; the six endpoints had **zero client consumers**.

**★ WHY IT MATTERED MORE THAN "DORMANT CODE":** the write path set **`portfolioRiskPerTradePct` and `maxOpenPositions`** on `guardrails_v2` stamped `lastUpdatedBy: 'LATTI_ADAPTIVE'` — **the exact two fields this batch exists to fix.** Wired, it would have silently overwritten Kyle's guardrail values.
**DID IT EVER FIRE? NO — measured, with a positive control.** Object `guardrails_v2` (staging), population ALL rows (2): stamps `(null)`×1, `p19-b8-5-sizing-tune-2`×1, **zero `LATTI_ADAPTIVE`**. The control is that same query returning the `p19-b8-5` stamp, so the absence is evidence, not a broken read. Corroborated by `behavioral_log` = **0 rows**. **Loaded but never fired — no historical contamination.** (Langston re-derived this himself on the staging DB before approving.)

**BLAST-RADIUS VERIFICATION:**
- Reach census, both import syntaxes: after the cut, static `from '…adaptive-guardrails'` = 0, dynamic `import('…adaptive-guardrails')` = 0, any mention anywhere = 0.
- §9.5(a-ii) state-write census — three write targets: `behavioral_log` (no external readers, 0 rows) · `learning_history` (no external readers, 2 rows) · **`guardrails_v2` — LIVE readers at `reasoning-orchestrator.ts:500-502` and `state-awareness.ts:255-256`, so THE TABLE STAYS; only the tuner's write was removed.**
- CI's own gate run locally: 392 errors vs baseline 394 — **two errors fixed, zero regressions.**

**⚠️ SURGICAL, NOT A SWEEP:** the `/api/learning` **namespace survives** — ~30 other routes there have live client readers (`enhanced-system-monitoring.tsx`, `learning-network-tab.tsx`, `ai-transparency.tsx`). Only the six tuner routes were cut.

**ARCHIVE:** `1-system-manual/_archive/deleted-code/adaptive-guardrails.ts.removed` + `adaptive-guardrails-routes.ts.removed`.
**RE-ENTRY FENCE:** `server/tests/integration/b-sizing-legacy-deletion-fence.test.ts` — 6 tests, **mutation-proved three ways**: a re-introduced *dynamic* import fails it (the syntax a naive static-import fence misses — measured 0 static vs 6 dynamic before the cut); a re-introduced endpoint fails it; **and a simulated namespace sweep fails it**, so an over-broad "cleanup" breaks CI instead of the UI. Includes a positive control on the file walk so the fence cannot go vacuously green.

## 2026-08-18 — `FeatureEnrichmentService.saveEnrichedFeatures()` (dead method) — P19-B-PERPFEED fix-on-find (#690)

**WHAT:** the `saveEnrichedFeatures` method in `server/services/feature-enrichment.ts` (a `feature_snapshots` writer), removed during the #690 chronology fix. Method only — the file stays live (its enrichment path serves `/api/learning/features/:symbol` + the formula audit).
**WHY:** zero callers anywhere in the tree (repo-wide grep, both call syntaxes) — it could never execute.
**BLAST RADIUS:** §9.5(a-ii) state-write census: it wrote `feature_snapshots` via `storage.createFeatureSnapshot`; because the method was never called, the table already received nothing from this path, so no reader loses a live writer. `storage.getLatestFeatureSnapshot`/`createFeatureSnapshot` remain untouched. **CORRECTED 2026-08-18 (Langston, 37a294867 re-review): this entry originally added “(other users exist)” — true when written, made FALSE by the data-normalization deletion in the SAME commit (it was the other user). Census at 37a294867: createFeatureSnapshot / getLatestFeatureSnapshot / getFeatureSnapshots exist only at their storage.ts definitions — zero writers, zero readers tree-wide (positive control: the same instrument finds the live enrichFeatures caller at server/routes.ts:17114). `feature_snapshots` + its three storage methods are fully ORPHANED — bucket 3, HOMED in the P19-B-PERPFEED close-out sweep (owner CC-C) alongside the orphan equity_* constants; the table drop is migration-level, so it goes through the sweep's reviewed batch.** tsc after the cut = 391 errors = the frozen baseline, zero regressions.
**ARCHIVE:** git history at the removing commit (single-method cut; no `.removed` file — the file itself survives).

## 2026-08-18 — `data-normalization.ts` (dead Replit-era service, same defect class as #690) — P19-B-PERPFEED rule-18(a) deletion

**WHAT:** `server/services/data-normalization.ts` (`DataNormalizationService` — z-score/min-max normalization + volatility/liquidity scoring), whole file.
**WHY:** surfaced by Langston at the #690 Step-4 review — the defect class was "consumers of `getPriceData`," not "consumers of feature-enrichment," and this file carried the same head-slice defect (`slice(0, window)` on the ASC source, normalizing against the OLDEST window). It is DEAD: zero importers tree-wide (server/shared/client, both class and instance names — verified independently by BOTH Langston and CC-C). Rule-24 bucket 3 → rule-18(a) delete-on-the-spot.
**BLAST RADIUS:** §9.5(a-ii) state-write census: its `storage.createFeatureSnapshot` call sat in a never-imported file — wrote nothing at runtime, no reader loses a live writer; the storage methods survive. tsc after the cut = 391 = frozen baseline.
**RESIDUE:** zero surviving references outside the archive copy and the frozen backup zips/chat-archives (Langston-verified at 37a294867). *(An earlier draft of this line pointed at the frozen export's `enrichFeatures` reference — wrong symbol: that is a surviving live method of feature-enrichment.ts, not residue of this deletion; corrected 2026-08-18.)*
**ARCHIVE:** `1-system-manual/_archive/deleted-code/data-normalization.ts.removed` + git history at the removing commit.
**COMPANION HARDENING (same commit, Langston's non-blocking notes):** `getPriceData` now carries its ASC ordering contract AT THE SOURCE (`storage.ts`); the two rebuilt audit tests use hardcoded expected literals (0.043668 / 0.5) independent of the implementation's slices, and the SMA sample got margin (30 rows vs the 25 boundary).

## CREW COORDINATION BOARD — rules 25.a / 25.b retired from `CLAUDE.md` (2026-08-23, B-RULES-1c/1d)

**WHAT WAS REMOVED HERE:** the two always-loaded rules only (1,613 B). **THE CODE IS NOT YET REMOVED** — see the scheduled home below. Recording that split explicitly, because "retired" applied to a rule while the tool still runs is exactly the half-state rule 18 forbids leaving unnamed.

**WHY (Langston ruling 2026-08-23, delegated to CC-A + Langston by Kyle):** **three claims made, zero ever released**, aged 26d/26d/18d. A protocol nobody completes — so its empty state was never earned, and a *narrowed* board showing clear would be a stronger false all-clear than the broad one. Lifetime usage 2 commits / 3 Discord mentions across four sessions and two months. The race it was built for (#557, shared-index collision) became **structurally impossible** when each session got its own clone; the one real collision (`RUNNING_ISSUES.md`) was fixed **structurally** by the #702 per-session number blocks.

**BLAST-RADIUS AT THIS STEP:** rules-file text only. No code, no npm script, no service, no table touched. `crew board` still runs today.

**RESIDUAL, named per Langston condition 1 rather than conceded:** `CLAUDE.md`, `CONDUCT.md`, shared `MEMORY.md` — four sessions edit the same prose regions, number-blocks cannot apply, and a semantic collision merges cleanly. Detection-after-the-fact exists (`fresh-rules.mjs` + the Monday freshness review); prevention does not.

**SCHEDULED HOME FOR THE CODE REMOVAL — `B-CREW-BOARD-REMOVAL`, OWNER CC-A, DUE 2026-09-05:** `scripts/crew.ts` (10,850 B) · `comms-infra/discord/crew-status-post.py` (4,878 B) · `comms-infra/laptop/crew-status-audit.py` (16,141 B) · the `crew` script in `package.json:20` · any backing table, under a full §9.5(a-ii) state-write census.

**RESTORE PATH:** git history is authoritative — the rules text is recoverable at any commit before this one, and the tooling is untouched at `HEAD` today. **Nothing here is unrecoverable.**

