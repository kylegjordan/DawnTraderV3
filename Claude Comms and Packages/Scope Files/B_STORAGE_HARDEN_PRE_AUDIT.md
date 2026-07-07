# B-STORAGE-HARDEN — Pre-Audit (Step 2), Wave A (OBJ-1 cold activation + OBJ-5 archival-health)

change-class: architecture
**Owner:** Claude Old (CC-A) · **Reviewer:** Langston · **Date:** 2026-07-08
**Covers:** Wave A only (OBJ-1 + OBJ-5). Waves C (OBJ-2) and D (OBJ-4→OBJ-3) get their own pre-audit sections when reached.

---

## 1. What Wave A actually does (recap for the reviewer)
- **OBJ-1** — turn the COLD tier (Backblaze B2) on. It has been dry-run since B75 shipped; creds are present + live-verified (2026-07-08). This wave: flip the dry-run flag off, schedule the monthly rotator cron, add a recurring cold-path liveness canary, and PROVE the full rotator path end-to-end with one bounded real rotation.
- **OBJ-5** — make archival-failure impossible to miss. Two gaps to close (see §3): (a) the disk-usage monitor computes warning/critical levels but never fires a §10.5 alert; (b) nothing detects a sweep that silently *never runs* (the internal sweep alerting can't fire if the script never starts).

## 2. SIM read (per CLAUDE.md §2 step 1.a + §9.1) — components touched
Read `SYSTEM_IMPACT_MAP.md` B70 (§1830) + B75 (§2036) sections + `SYSTEM_MANUAL` data-lifecycle. Findings:

| Component (SIM ref) | Role | Wave-A touch | Blast radius |
|---|---|---|---|
| `b75-cold-rotator.ts` (B75 #9) | warm→cold move-not-delete, monthly cron | ADD bounded CLI flags (`--limit`, `--warm-retention-days`); SCHEDULE cron; flip dry-run | Batch cron only. No hot-path. Flags default to current behavior (unbounded, config retention). |
| `storage-client.ts` (B75 #4) | warm+cold I/O | READ-ONLY (reuse `uploadCold`/`downloadCold`/`deleteCold`) | none — no edit |
| `data_lifecycle` module_constants (B75 #2) | tier config | flip `cold_rotator_dry_run` false | rotator reads it; sweep does not |
| `database-monitor.ts` (B75 #10) | daily logical-size vs plan-cap check | WIRE warning/critical `alertLevel` → `addAlert` (dedupe) | runs in app process via lazy-loader (deferred +4s, then 24h). addAlert is a file-lock write, once/24h — negligible. |
| `system-alerts.ts` (B-NEW-40) | §10.5 alert queue | READ-ONLY (reuse `addAlert` + `dedupe_key`) | none — no edit |
| NEW `b75-cold-liveness.ts` | cold round-trip canary | new file + weekly cron | isolated batch cron; writes one tiny `_liveness/` object, deletes it |
| NEW `b-storage-archival-health.ts` | cron-silence + failed>0 watchdog | new file + daily cron | isolated batch cron; reads `/var/log/dawntrader/*.log`, fires §10.5 on staleness/failure |

**No hot-path (scanner/regime/SQE/RTB/TEC/engine) code is touched.** All new execution is off-hours batch cron. The one in-process edit (database-monitor) is a once-per-24h additive alert emit.

## 3. Live-state findings that shaped the design (staging, 2026-07-08)
1. **Cold rotator has 0 eligible candidates for ~10 months.** Warm retention = 365 d; the oldest warm object was created 2026-05-06 (~2 months old). So flipping the flag + scheduling the cron rotates *nothing* now — we cannot prove "a real object lands in cold" by the natural path. **Resolution:** (a) a recurring **cold-path liveness canary** is the standing proof + dead-key detector the scope already asked for; (b) a **one-time bounded real rotation** of the single oldest tiny object (`context_bridge_log/2026-01`, 13.9 MB dev telemetry) via the new `--limit 1 --warm-retention-days 30` flags exercises the rotator's full path (downloadWarm → uploadCold → verify → manifest cold-INSERT + warm→migrated → deleteWarm). That object belongs in cold eventually and is rehydrate-able, so moving it early is harmless.
2. **DatabaseMonitor is live but silent.** It runs (lazy-loader, +4s then 24h) and correctly reads ~118 GB logical / 200 GB plan cap = ~59% — but at `alertLevel !== normal` it only `console.warn`s. Nothing reaches the §10.5 queue. Logical is below the 65% warning line today, so the wire-in won't fire immediately — it closes the gap for when it does.
3. **The "disk hit 202 GB" was PROVISIONED disk auto-expanding, not logical data at the cap.** Logical is 118 GB. The monitor's logical-vs-plan-cap signal is the correct one and reads 59%.
4. **B70 sweep is confirmed paused** (root crontab, commented). The archival-health watchdog therefore SKIPS b70 while paused and re-includes it at OBJ-2 re-enable (noted in the watchdog so it isn't a silent omission).
5. **Latent data-quality issue (out of scope, logged):** `module_constants.data_archive.b_new_53_provenance_capture_enabled` has THREE rows (false,true,true) — a duplicate-key. The b70 sweep doesn't read it; no Wave-A impact. → RUNNING_ISSUES as its own small cleanup.

## 4. Cron inventory (root crontab on staging — where all archive crons live)
Current: b70-retention (PAUSED), b70-create-monthly-partitions (`30 2 28 * *`), b75-retention-sweep (`15 2 * * *`).
Wave A ADDS: `0 3 1 * *` b75-cold-rotator · `0 4 * * 1` b75-cold-liveness (weekly Mon) · `0 5 * * *` b-storage-archival-health (daily, after the sweeps).

## 5. Risks + mitigations
- **R1 — a bounded manual rotation moves real warm data.** Mitigated: target is the single oldest 13.9 MB dev-telemetry object; verified end-to-end (download-verify) before warm delete; rehydrate-able from cold.
- **R2 — liveness canary leaves orphan `_liveness/` objects.** Mitigated: canary deletes its object each run; object key is timestamped so a failed delete is self-evident and swept next run.
- **R3 — archival-health false positives during known pauses (b70).** Mitigated: b70 explicitly skipped while paused; each check has a grace window matched to its cadence (b75 daily → 26 h; cold-rotator monthly → 33 d; liveness weekly → 8 d).
- **R4 — addAlert file-lock contention in the app process.** Negligible: once/24h, 5 s max lock, off the request path.

## 6. Verification plan (Step 7)
- OBJ-1: run the bounded rotation on staging → a `tier=cold state=active` manifest row for `context_bridge_log/2026-01` + download-verify restore; dry-run flag confirmed false; both crons in root crontab; liveness canary exits 0 with a verified round-trip.
- OBJ-5: force a stale-log condition + a synthetic sweep `failed>0` → the watchdog fires a §10.5 alert; confirm the DatabaseMonitor wire path by lowering the warning threshold on a throwaway check (or unit-assert the emit) → alert lands.
- CI 4-green; governance (SIM B75 section, CHANGES, RUNNING_ISSUES #430, BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, completion report, both MEMORYs).

## 7. Open questions for Langston (Step-2)
1. Bounded rotation of `context_bridge_log/2026-01` as the OBJ-1 real-path proof — agree, or prefer a pure synthetic canary only (no real object moved yet)?
2. `--limit` / `--warm-retention-days` rotator flags — agree these are the safe controlled-rotation mechanism vs. temporarily lowering the global `default_warm_retention_days` (which would make all 67 warm objects eligible)?
3. Liveness canary cadence weekly + archival-health daily — right cadences?
4. Wiring DatabaseMonitor's existing warning/critical into `addAlert` (vs. a separate disk check in the watchdog) — agree reuse the existing monitor?
