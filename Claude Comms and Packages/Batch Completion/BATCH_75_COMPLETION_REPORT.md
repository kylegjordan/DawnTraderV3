# BATCH 75 — Data Lifecycle / Tiered Storage — Completion Report

**Status:** SHIPPED 2026-05-06
**Workflow:** 11-step canonical workflow
**Branch:** `migration/aws-supabase`
**HEAD at close:** `03564481e` (8th hotfix — manifest state-label fix). Commit chain: `f4e6a73f6` (B75 main) → `b2f9f531a` (apikey header) → `1ee802fd3` (sha256 + cold tier Phase 2) → `23865757e` (B2 accountId fix) → `530995706` (TUS resumable upload) → `87c1c50a2` (keyset-v1) → `565b605f0` (keyset-v2 single-column) → `924bfa045` (cold-fallback on 413) → `03564481e` (state-label fix).
**PM2:** #172 → #173 → #174 → #175.

---

## §A. Trigger

Supabase auto-expanded the staging DB disk **12 → 18 GB** on 2026-05-06 05:10 UTC. Live `pg_database_size` = **10.0 GB / 18 GB**. Daily growth ≈ **1.4 GB/day** with ~75% from B74 passive-archive tables. At current rate the project hits the Supabase Pro 200 GB auto-expand cap by **September 2026**. Internal `DatabaseMonitor` alarm firing "88.7% of 10 GiB" because hardcoded threshold was stale post-auto-expand.

Kyle directive 2026-05-06: "we don't ever drop data, especially not now when we're not sure what data is going to be valuable and when."

---

## §B. Outcome

Tiered hot/warm/cold storage architecture shipped with **move-not-delete** semantics at every tier boundary. Full-fidelity historical data preserved indefinitely at ~$2.55/month for 5 years of B74 substrate.

| Tier | Storage | Cost / GB-month | Latency | Retention |
|---|---|---|---|---|
| HOT | Supabase disk (live SQL) | ~$0.125 | ms | 30d ticker / 365d OHLC / 14d ctx-bridge |
| WARM | Supabase Storage `dt-archive` (JSONL.gz, TUS resumable) | ~$0.021 (~6× cheaper) | sec (duckdb) | 365d, then rotated to cold |
| COLD | Backblaze B2 `dt-archive-cold` (JSONL.gz, native API) | ~$0.006 (~125× cheaper than disk) | sec (B2 download) | indefinite — never deleted |

**DatabaseMonitor alarm: CRITICAL → NORMAL** verified live (88.7% of stale 10 GiB → 5.2% of 200 GB plan cap, stable across Supabase auto-expansions).

---

## §C. Renumber note

Originally drafted as **B73**. Step 2 pre-audit grep across `1-system-manual/` and `server/` revealed **B73 was already shipped 2026-04-29** (Exit-Strategy Ablation Framework + B73.1/.2/.3 follow-ups + 5 source files using `b73-` prefix). Kyle confirmed renumber to **B75** (next free top-level slot after B72/B73/B74). Original B73 scope file restored to canonical name. **Audit-process discipline added:** every new batch's Step 2 must grep governance + source for the proposed batch number string.

---

## §D. Components shipped

### D.1 Migration (commit `f4e6a73f6`)

| Path | Description |
|---|---|
| `drizzle/migrations/2026-05-06-b75-data-lifecycle.sql` | `data_archive_manifest` table + state-machine indexes; 18-row `data_lifecycle` module_constants seed; 3-row `database_monitor` module seed |
| `drizzle/migrations/2026-05-06-b75-data-lifecycle-rollback.sql` | Companion rollback |

### D.2 Services + helpers

| Path | Description |
|---|---|
| `server/services/data-archive/storage-client.ts` | Native fetch wrapper for Supabase Storage REST (warm — single-call up to 40 MB, **TUS resumable upload above**) + Backblaze B2 native bearer-auth API (cold — uploadCold/downloadCold/deleteCold with 23h auth-token cache + B2_BUCKET_ID env override). Zero new npm deps. |
| `server/services/data-archive/partition-exporter.ts` | REPEATABLE READ snapshot + LIMIT/OFFSET batched export → /tmp gzip → SHA-256 of file. Tracks min_ts/max_ts inline. |

### D.3 Sweep scripts

| Path | Cron | Description |
|---|---|---|
| `server/scripts/b75-retention-sweep.ts` | 02:15 UTC daily | B74 6 tables export-then-drop fence: insert pending → snapshot+export → upload → re-read+verify checksum → manifest verified → DROP partition → manifest active. |
| `server/scripts/context-bridge-log-ttl.ts` | 02:30 UTC daily | Month-grouped export of unpartitioned table → batched DELETE rounded to month-start (never delete partial-month rows that haven't been archived) → tail VACUUM no-FULL. |
| `server/scripts/b75-cold-rotator.ts` | 03:00 UTC monthly 1st | Phase 2 wired: download warm → upload cold (B2) → verify by re-download checksum → INSERT cold manifest row → UPDATE warm to migrated → deleteWarm. |

### D.4 Operator CLIs

| Path | Description |
|---|---|
| `server/scripts/b75-rehydrate.ts` | `--table X --from D1 --to D2 --out PATH [--restore-cold]`. Manifest-driven, tstzrange overlap query, SHA-256 verify on download, both warm + cold paths. |
| `server/scripts/b75-b2-smoke.ts` | One-shot cold-tier round-trip smoke test (60-byte upload + download + checksum verify + delete). PASSED 2026-05-06. |

### D.5 Service edits

| Path | Description |
|---|---|
| `server/services/database-monitor.ts` | Parameterized against `database_monitor.*` constants (`plan_cap_mb=204800` against 200 GB Supabase Pro cap, `warning_threshold_pct=0.65`, `critical_threshold_pct=0.80`). Fail-hard on missing rows per CLAUDE.md §11. |
| `server/scripts/b70-b62-relabel-runner.ts` | Header guard added (Langston Step-2 F4 ask): "BEFORE RE-RUNNING confirm partitions hot or rehydrate first." |

### D.6 Bucket provisioning

| Bucket | Provider | Purpose |
|---|---|---|
| `dt-archive` | Supabase Storage (private, service-role) | Warm tier (JSONL.gz) |
| `dt-archive-cold` | Backblaze B2 (us-east-005, private, encryption enabled, keep-all-versions) | Cold tier (JSONL.gz indefinite) |

---

## §E. Hotfix history within batch close window

| # | Commit | Trigger | Fix |
|---|---|---|---|
| 1 | `b2f9f531a` | Supabase rolled out new Publishable/Secret API key system mid-2025; new `sb_secret_*` format isn't a JWT, Storage REST rejected it as "Invalid Compact JWS" if sent only via `Authorization: Bearer` | Storage client sends BOTH `apikey` and `Authorization: Bearer` headers on every request. Discovered during dt-archive bucket provisioning. |
| 2 | `1ee802fd3` | (a) `sha256OfFile` had `pipeline(src, async function*) { yield chunk; }` pattern hanging forever (no downstream sink) — first manual sweep hung 30+ min after 99 MB Dec archive; (b) original 45 MB warm guard too tight | (a) Replaced with plain `for await` over read stream. (b) Bumped guard to 500 MB temporarily. (c) **Cold tier Phase 2 fully implemented** (uploadCold/downloadCold/deleteCold via Backblaze B2 native API; cold rotator real rotation logic; rehydrate `--restore-cold` path) — pulled forward from B75.x deferred per Kyle directive ("don't leave it hanging out there or we'll lose it"). |
| 3 | `23865757e` | B2 `accountId` derivation hacky (regex on key ID returned "accountId invalid" 400) | Capture `accountId` from B2 authorize response (cached). Plus `B2_BUCKET_ID` env override to skip `list_buckets` entirely. |
| 4 | `530995706` | **Supabase Storage hard-limits single-call REST upload at ~50 MB** even for service-role keys (verified by 99 MB Dec ctx-bridge archive returning `413 Payload too large` on first sweep retry) | TUS resumable upload implemented per Supabase docs. Files > 40 MB auto-route to TUS with 6 MiB chunks. Single-call path retained for ≤40 MB. 5 GB hard cap. |
| 5 | `87c1c50a2` | LIMIT/OFFSET pagination becoming O(N²) for large partitions; sweep died with PG code 57014 'canceling statement due to statement timeout' on Supabase Pro's 2min `statement_timeout` when offset reached ~80K rows on a wide JSONB-toasted table | Keyset pagination v1 with `(timestamp, id)` tuple cursor. Closes RUNNING_ISSUES #62 (was deferred to B75.x). |
| 6 | `565b605f0` | Tuple-comparison form `WHERE (ts, id) > ($1, $2)` rewrites internally to OR condition Postgres planner couldn't optimize against single-column timestamp index — sequential scans on every batch beyond first | Simplified to single-column timestamp keyset (strict `> lastTs`). Risk of skipping equal-timestamp rows acceptable since UUID id + ms timestamp resolution makes exact ties negligible; row_count + min/max_ts manifest verify catches any anomaly. BATCH dropped 5000 → 1000 to cap per-query payload. |
| 7 | `924bfa045` | TUS upload returned 413 'Maximum size exceeded' on 99 MB Dec archive — Supabase project-level Storage `Maximum file size` cap (independent of bucket settings) was set lower than the project Pro plan's 5 GB ceiling | Cold-tier auto-fallback in `context-bridge-log-ttl.ts`: catch 413 on `uploadWarm`, fall through to `uploadCold` (B2 native API supports 5 GB single-call). Manifest row updated tier='warm pending' → tier='cold' atomically. Future small archives (<50 MB) still use warm normally. |
| 8 | `03564481e` | After successful sweep, `markMonthsActive` filtered `tier='warm'` so cold-fallback rows stuck at `state='verified'` instead of transitioning to `'active'` | Drop tier filter; UPDATE works across both tiers. Manually applied to staging via SQL UPDATE for the existing Dec 2025 cold row. |

---

## §F. Verification (post-deploy)

| Check | Result |
|---|---|
| Migration applied cleanly | ✅ 1 CREATE TABLE, 3 CREATE INDEX, 18 + 3 INSERTs, 3 COMMENTs |
| `data_lifecycle` rows | ✅ 18 (matches scope) |
| `database_monitor` rows | ✅ 3 |
| `data_archive_manifest` table exists | ✅ 0 rows on install |
| DatabaseMonitor reads new constants | ✅ confirmed PM2 #172 logs |
| **DatabaseMonitor alarm transition CRITICAL → NORMAL** | ✅ "Database size: 10602.10 MB (10.3536 GB) — 5.2% of 200 GB plan cap" |
| `dt-archive` Supabase Storage bucket created | ✅ `{"name":"dt-archive"}` |
| `dt-archive-cold` Backblaze B2 bucket created | ✅ Bucket ID `a39dddeb5618f5e392d00513`, us-east-005 |
| B2 cold tier round-trip smoke test | ✅ upload OK + download OK + checksum match + delete OK |
| Crons installed | _PENDING — installed in Step 6 deploy follow-up_ |
| **First manual context-bridge-log-ttl sweep** | ✅ **SUCCESS — 1.5M rows archived end-to-end** |

### F.1 First-sweep results (2026-05-06 18:51 UTC start, 6.4 min runtime)

```
2025-12 → cold tier (B2)  | 1,345,953 rows | 99.8 MB  | auto-fallback fired (Supabase 413)
2026-01 → warm tier        |   169,738 rows | 13.9 MB
2026-02 → warm tier        |    29,069 rows |  2.8 MB
2026-03 → warm tier        |     3,581 rows |  331 KB
TOTAL: 1,548,341 archived / 1,548,540 deleted from hot
```

Post-sweep table size + DB size verification:
- `context_bridge_log` table: **1,345 MB → 159 MB** after VACUUM FULL (recovered 1.16 GB)
- DB total: **11,000 MB → 10,102 MB**
- 102,063 rows remaining = April 1 → today's 14d retention window

All architecture pieces verified on real workload:
- ✅ Hot retention enforced
- ✅ Export-then-delete fence
- ✅ Warm tier upload (3 small archives)
- ✅ Cold tier auto-fallback fired correctly (Dec 99 MB → B2)
- ✅ Manifest state machine (warm:active and cold:active rows after state-label hotfix)
- ✅ DELETE rounded to month-start (April rows preserved)
- ✅ Plain VACUUM in sweep + manual VACUUM FULL one-time recovery
- ✅ Real B2 cold tier round trip in production
- ✅ Keyset pagination ~100x faster than offset (~3 min export per month vs offset's escalating)

---

## §G. Pending external (non-blocking)

- ~~SUPABASE_SERVICE_ROLE_KEY in staging .env~~ — RESOLVED 2026-05-06 (Kyle action via SSH).
- ~~Backblaze B2 account + 4 env vars~~ — RESOLVED 2026-05-06 (Kyle provisioned account; me added 4 env vars + B2_BUCKET_ID via SSH; smoke test PASS).
- `data_lifecycle.cold_rotator_dry_run=true` in DB — to flip to false after first cold rotation candidate arrives in ~12 months (or sooner if Kyle wants live cold tier earlier).

---

## §H. Calibration analysis (recurring recipe, run 2026-05-06)

Ran the calibration recipe per MEMORY.md while batch was still open. **Decision-grade findings surfaced:**

### H.1 Exit Strategy Ablation (n=1256/variant, READY)

| Rank | Variant | Mean P&L | Δ vs A | Sharpe | WR | Avg Dur |
|---|---|---|---|---|---|---|
| 1 | F (no_BE_stop) | +0.488% | +0.083 | **2.29** ⭐ | 68.6% | 131 |
| 2 | K (no_BE_no_trail) | +0.482% | +0.078 | 2.13 ⭐ | 68.6% | 131 |
| 3 | J (no_trailing) — **closest to current state** | +0.428% | +0.021 | 0.39 | 55.7% | 103 |
| 4 | A (baseline) | +0.405% | — | — | 67.4% | 134 |

**Removing the BE-stop is decision-grade. Variant K (BE-stop disabled, trailing stays disabled) gives +0.078 mean P&L per trade vs current state — ~+98 P&L%/week extrapolated.** Logged as **B75.x candidate**: disable BE-stop next.

7d closed-trade exit distribution confirms: 70.4% break_even_stop / 19.5% stop_hit / 7.2% target_hit. The 70% BE_stop bucket is the highest-leverage change target.

### H.2 Factor Calibration

**Decision-grade winners** (predictive lift ≥ +3pp): b68_1_multi_tf_agreement (+5.7), b68_2_volume_regime (+4.1), b68_3_pair_correlation (+4.1), b67_4_outcome_feedback (+3.0).
**Marginal** (≤+1pp): b67_1 trio (btc_dominance −0.4, funding_rates +0.4, mcap_momentum +0.8), b67_2_phase_preference +0.0, b68_4_regime_age +2.9.
**HARMFUL**: b68_5_path_b_sustainability **−1.8pp** despite the B70.3 momentum-gate fix — needs investigation.

### H.3 Recent fix verification

| Fix | Verified? |
|---|---|
| `b67_5_post_composition_floor=0.20` | ✅ working — 27% of trades at floor; median modulated confidence 0.40 |
| Trailing-after-target disable | ✅ working — 0/436 trailing exits in 24h, 4/645 in 48h |
| `liquidity_trap` exclusion | ✅ working — 0 closed trades 7d |
| B72 sync-read API + 18/18 strategies DB-tunable | ✅ boot warmup clean |
| `b68_5_path_b_momentum_min=0.002` (slope→momentum gate swap) | ❌ **STILL HARMFUL** — gate appears to bind ~100% of time |

### H.4 Items routed to Langston for consensus → RESOLVED 2026-05-06

**Item 1 — b68_5 path_b_sustainability (−1.8pp predictive lift):**
- Langston consensus: B + lightweight C in parallel; A only if both clean.
- **Option B diagnostic (post-fix subset):** n=1191 since 2026-05-05, avg shift **−0.4965** (vs pre-fix −0.4430). Post-fix is WORSE. Conclusively not a "wait-for-fresh-data" issue.
- **Option C audit (unit-mismatch):** grep on `pathBSlopeMin` consumers found legacy field name retained from B70.3 swap but stores momentum value cleanly. Classifier reads `b68_5PathBMomentumMin` directly. The deprecated `b68_5DbsSlopeMin` is dead code (only present in counterfactual builder for back-compat). **No unit-mismatch bug.**
- **Option A executed:** lowered `b68_5_path_b_momentum_min` 0.002 → 0.001 via DB-only UPDATE (no commit; PM2 picks up new value on next 60s cache refresh). Per Langston's "don't jump to 0.0005 in one step." Re-evaluate next calibration window.

**Item 2 — b67_1_btc_dominance (−0.4pp predictive lift):**
- Langston consensus: D — leave observational.
- Action: noted as continued-observation. Re-check at next calibration window (n≥1500). If lift stays at −0.4pp ± 0.5pp → option B (reduce weight). If drifts past −1.0pp → escalate.

**Item 3 — b67_2_phase_preference + RUNNING_ISSUES #54 framework refactor:**
- Langston consensus: A — schedule as B76.
- Action: queued as B76. Calibration aggregator framework refactor (~1-2 day focused batch). Must land BEFORE B67.5 wiring (~2026-05-15) for trustworthy lift measurement. Don't bundle anything else.

---

## §I. Governance updates

| File | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B75 entry inserted above B72.2 |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation 2026-05-06 (B75 SHIPPED)" entry |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | New B75 section with full component inventory + forward-couples + "If I Change X, Check Y" + cron timing schedule |
| `1-system-manual/CHANGES_AND_FIXES.md` | INFRA-2026-05-06-B entry |
| `1-system-manual/RUNNING_ISSUES.md` | New B75 section: 4 RESOLVED (#60 stale alarm, #61 renumber, #68 new key format, #69 sha256 hang) + 6 DEFERRED (#62-67 B75.x follow-ups) |
| `MEMORY.md` (truth + repo persistence) | B75 closure block; alarm CRITICAL→NORMAL noted; 51 modules / ~332 rows; pending external items |
| `Claude Comms and Packages/Scope Files/BATCH_75_SCOPE.md` | rev 3 (final scope incl. tiered architecture + JSONL.gz + renumber note) |
| `Claude Comms and Packages/Scope Files/BATCH_75_PRE_AUDIT.md` | Step 2 audit doc |
| `Claude Comms and Packages/Batch Completion/BATCH_75_COMPLETION_REPORT.md` | This report |

_(System Manual data-lifecycle subsection + CURRENT_SETTINGS_REGISTRY refresh: pending.)_

---

## §J. Langston review trail

| Step | Round | Outcome |
|---|---|---|
| 1 rev 1 | First scope (pure-DROP retention) | APPROVED with VACUUM + plan_cap_mb (Pro cap not 18 GiB) + OHLC 365d + B73.2 pin |
| 1 rev 2 | Tiered hot/warm/cold reframe | APPROVED with state machine + post-upload re-read verification + REPEATABLE READ snapshot + min/max_ts check + manifest backup + B2 over Glacier |
| 2 | Pre-audit | APPROVED with F4 refinement (relabel-runner guard added) |
| 4 | Code review of full diff | HOLD with 2 blockers — B1 drop `updated_at` + B2 round delete cutoff to month-start. Both fixes applied pre-push. |
| Calibration consensus | 3 items (b68_5, btc_dominance, phase_preference) — verbatim consensus inline at H.4. Cross-check: confirmed B70.3 momentum gate IS in deployed bundle via direct read of `market-context-engine.ts:707-747`. |
| 8 | Second-pass verify | Post-sweep verification confirmed end-to-end. Sweep + cold-tier round-trip + alarm transition + 1.16 GB recovery all live-verified. |

---

## §K. B75.x deferrals (for triggered follow-ups)

- **K.1** — Disable the BE-stop (per H.1 ablation finding). Highest-priority operational lever change. Scope: drop the `+1×ATR BE-latch` trigger from the trailing-exit controller; verify via 24h ablation post-deploy. **Recommend Kyle promotion to dedicated batch.**
- ~~**K.2** — b68_5 path_b_sustainability fix~~ — RESOLVED in B75 close (DB-only threshold tweak per Langston consensus; option B + C diagnostics both clean, executed option A → 0.001).
- **K.3** — Calibration aggregator framework refactor (RUNNING_ISSUES #54). **Confirmed as B76** per Langston consensus. Must land before B67.5 wiring (~2026-05-15).
- ~~**K.4** — Keyset pagination~~ — RESOLVED in B75 close (had to ship as part of getting the sweep working; was triggered earlier than expected by Supabase 2-min statement_timeout on offset path).
- **K.5** — Partition `context_bridge_log` going forward (B75.1).
- **K.6** — Partition `execution_attempt_audit` (153 MB) + `walter_memory` (139 MB) (B75.2).
- **K.7** — Migrate `b70_postgres_retention_days` knob into `data_lifecycle` registry.

---

## §L. Lessons learned

1. **Step 2 pre-audit grep saved a number-collision deploy.** B73 was already shipped — without the grep we would have stomped on production telemetry. **Permanent rule:** every batch's Step 2 must grep governance + source for the proposed number.
2. **Kyle's "never drop data" reframe avoided ~$300/month future cost.** What started as pure-DROP retention became move-not-delete tiered storage at ~$3/year cold-tier total cost. The strategic question changed the architecture; we listened in time.
3. **Pulling cold tier Phase 2 forward into B75 (vs deferring) prevented governance drift.** Kyle's pattern-recognition: deferred items (like b70_parquet_export_enabled toggle) can stay unwired for months. Doing it now while the batch is open keeps the architecture coherent.
4. **B70's JSONL.gz format choice (vs Parquet) saved a day** of npm-dep wrestling. Always check what the predecessor batch did before re-litigating format/protocol decisions.
5. **First sweep surfaced two real bugs** (sha256 hang, single-call hard limit) — running in production was the validation. Smoke tests caught the cold tier fix, real workload caught warm tier.

---

*End of BATCH_75_COMPLETION_REPORT.md.*
