# B-STORAGE-HARDEN — Wave A review packet (Step-2 pre-audit + Step-4 diff) — r1

**From:** CC-A (OLD Claude) · **To:** Langston · **Date:** 2026-07-08
**Mode:** Kyle authorized autonomous iteration to verified completion. This is a combined Step-2 (pre-audit) + Step-4 (diff-before-push) review — bench is green (tsc baseline no-regression; system-alerts + storage unit tests pass; the only vitest fails are the DB-integration tests that need a live DB, CI-only). Nothing is pushed yet. Please review, answer Q1–Q4, flag anything, and ACK resolve-ready.

Full context files (committed, in the repo): `Scope Files/B_STORAGE_HARDEN_SCOPE.md` (you Step-1-approved it) + `Scope Files/B_STORAGE_HARDEN_PRE_AUDIT.md`. This packet is self-contained so you don't need to navigate.

---

## What Wave A does
- **OBJ-1 — turn the COLD tier (Backblaze B2) on.** It's been dry-run since B75; creds present + live-verified 2026-07-08. Flip the flag, schedule the monthly rotator cron, add a recurring cold-path liveness canary, and prove the full rotator path with one bounded real rotation.
- **OBJ-5 — make archival-failure impossible to miss.** Two gaps: (a) DatabaseMonitor computes warning/critical but only `console.warn`s — never hits §10.5; (b) nothing detects a sweep that silently never RUNS (the sweep's own alerting can't fire if the script never starts).

## The one design wrinkle (please weigh in — Q1/Q2)
Cold rotator has **0 eligible warm candidates for ~10 months**: warm retention = 365d and the oldest warm object is ~2 months old (created 2026-05-06). So flipping the flag + cron rotates nothing now — I can't prove "a real object lands in cold" via the natural path. My resolution:
1. **Recurring cold-path liveness canary** (`b75-cold-liveness.ts`) — upload→download→verify→delete a tiny object weekly; §10.5-alert on failure. This is the standing dead-key detector the scope OBJ-1 already asked for, and proves B2 upload/download/checksum on the production `storage-client` code.
2. **One-time bounded real rotation** of the single oldest tiny object (`context_bridge_log/2026-01`, 13.9 MB dev telemetry) via new `--limit 1 --warm-retention-days 30` flags → exercises the rotator's full path (downloadWarm → uploadCold → verify → manifest cold-INSERT + warm→migrated → deleteWarm). That object belongs in cold eventually and is rehydrate-able; moving it early is harmless.

## Open questions
1. Bounded real rotation of `context_bridge_log/2026-01` as the OBJ-1 real-path proof — agree, or prefer canary-only (move no real object yet)?
2. `--limit` / `--warm-retention-days` rotator flags as the safe controlled-rotation mechanism vs. temporarily lowering the global `default_warm_retention_days` (which would make all 67 warm objects eligible at once)?
3. Cadences: liveness canary weekly (Mon 04:00 UTC), archival-health daily (05:00 UTC after the 02:xx sweeps) — right?
4. Reuse the existing DatabaseMonitor's warning/critical by wiring it into `addAlert` (vs. a second disk check in the watchdog)?

## Change set (all additive; no hot-path touched)
- `server/scripts/b75-cold-rotator.ts` — +41 lines: two optional CLI flags (`--limit`, `--warm-retention-days`), default behavior unchanged when absent.
- `server/services/database-monitor.ts` — +47 lines: wire warning/critical → `addAlert` (dedupe `disk-utilization-<level>`).
- NEW `server/scripts/b75-cold-liveness.ts` — cold round-trip canary.
- NEW `server/scripts/b-storage-archival-health.ts` — cron-silence + failed>0 watchdog (b70 intentionally skipped while paused; re-added at OBJ-2).
- Cron adds (root crontab, staging): `0 3 1 * *` cold-rotator · `0 4 * * 1` cold-liveness · `0 5 * * *` archival-health.

## DIFF — edited files

```diff
[b75-cold-rotator.ts — +CLI flags]
+  const argv = process.argv.slice(2);
+  const limitOverride = parseIntFlag(argv, '--limit');
+  const warmRetentionOverride = parseIntFlag(argv, '--warm-retention-days');
+  if (warmRetentionOverride !== null) { cfg.warmRetentionDays = warmRetentionOverride; ... }
   const storage = getStorageClient();
   ...
+  if (limitOverride !== null && candidates.length > limitOverride) {
+    candidates = candidates.slice(0, limitOverride);   // oldest-first (listCandidates ORDER BY created_at ASC)
+  }
+
+function parseIntFlag(argv, name) { // returns null if absent; process.exit(1) on present-but-invalid (positive ints only) }
```

```diff
[database-monitor.ts — wire warning/critical → §10.5]
+import { addAlert } from "./system-alerts";
   ... (after alertLevel computed) ...
+  if (alertLevel !== 'normal') { await this.emitDiskAlert(alertLevel, sizeGb, utilization, planCapGb); }
+
+  private async emitDiskAlert(level, sizeGb, utilization, planCapGb) {
+    try { await addAlert({ triggers_at: new Date(), category: 'health_check', severity: level,
+        title: `Database disk ${LEVEL}: X% of N GB plan cap`, body: '...', metadata: {...},
+        dedupe_key: `disk-utilization-${level}` }); }
+    catch (err) { console.error('[DatabaseMonitor] failed to emit §10.5 disk alert:', err); }
+  }
```

## NEW FILE 1 — b75-cold-liveness.ts (core)
- `isColdConfigured()` false → critical §10.5 alert + exit 1 (creds missing = restore-day risk).
- reads `data_lifecycle.cold_bucket` (no hard-coded fallback, §11).
- upload `_liveness/canary-<ISO>.txt` → `downloadCold` → SHA-256 compare against `sha256Hex(payload)` → `deleteCold` (best-effort; a failed delete self-reveals as a stale `_liveness` object).
- any failure → critical §10.5 alert (dedupe `cold-path-liveness`) + exit 1; success → log OK + exit 0. Recovery is manual `resolve` (same fire-and-forget model as the b75 sweep breakage alerts).

## NEW FILE 2 — b-storage-archival-health.ts (core)
- Per archival cron: STALE (log mtime older than cadence+grace, or no completion line in tail 60 → crash/hang) OR FAILED (last completion line `failed>0`) → §10.5 warning (dedupe `archival-health-<name>-<reason>`).
- Checks: `b75-retention` (grace 26h, parse `failed` + `plain_failed`), `b75-cold-rotator` (grace 33d, parse `failed`, onMissing=skip), `b75-cold-liveness` (grace 8d, staleness-only since the canary self-alerts, onMissing=skip).
- **b70-retention deliberately absent while paused** (comment says re-add at OBJ-2 — not a silent omission).
- Disk thresholds NOT re-checked here — DatabaseMonitor owns that now (wired above). Exits 0 always (alerts are the signal).

## Verification plan (Step-7, staging)
OBJ-1: run `b75-cold-rotator.ts --limit 1 --warm-retention-days 30` → `tier=cold state=active` manifest row for `context_bridge_log/2026-01` + download-verify; dry-run flag false; both crons installed; liveness canary exits 0. OBJ-5: force stale-log + synthetic `failed>0` → watchdog fires §10.5; assert DatabaseMonitor emit path. CI 4-green; governance (SIM B75, CHANGES, RUNNING_ISSUES #430, catalog/history/plan, completion, both MEMORYs).
