# B-STORAGE-HARDEN — Wave A Completion Report (OBJ-1 + OBJ-5)

**Batch:** B-STORAGE-HARDEN (Wave A) · **change-class:** architecture · **Owner:** CC-A (OLD Claude) · **Reviewer:** Langston
**Date:** 2026-07-08 · **Commits:** `aa85e743c` (Wave A) + `dc92c2f93` (dormant-path bug fix) · **CI:** 4-green `28904038380` + `28904376564` · **Deploy:** staging restart, HTTP 200
**Kyle authorization:** autonomous iteration to verified completion (2026-07-08)
**Scope:** `Scope Files/B_STORAGE_HARDEN_SCOPE.md` · **Pre-audit:** `Scope Files/B_STORAGE_HARDEN_PRE_AUDIT.md` · **Review packet:** `Langston Design Asks/B-STORAGE-HARDEN_WaveA_review_r1.md`

> **This report covers Wave A only** (OBJ-1 cold activation + OBJ-5 archival-health). Waves C (OBJ-2 — extend tiering to the B70 analytics tables, the never-drop directive fix) and D (OBJ-4 capture reduction → OBJ-3 daily partitioning) remain OPEN. **The batch is NOT fully closed** — the B70 DROP cron stays PAUSED until OBJ-2 lands.

---

## Objective checklist

| Obj | Status | Evidence |
|---|---|---|
| **OBJ-1 — activate the COLD tier** | ✅ **YES** | `cold_rotator_dry_run` flipped false (jsonb, 1 row). Bounded real rotation of `context_bridge_log/2026-01` (13.9 MB): `DONE candidates=1 rotated=1 failed=0`; manifest after = cold row `state=active` + warm row `state=migrated` (tier_changed_at set); **rehydrate-verify** downloaded the object back from B2, SHA-256 `5a394606…` == manifest checksum → MATCH. Cron `0 3 1 * *` installed. Liveness canary one-shot OK (round-trip 2.4 s). |
| **OBJ-5 — archival-health alert** | ✅ **YES** | `database-monitor.ts` wires warning/critical → `addAlert` (§10.5, deduped per level; logical ~59% today so it won't fire yet — gap closed for when it does). `b-storage-archival-health.ts` daily `0 5 * * *` — forced synthetic `failed=1` fired `severity=warning category=health_check dedupe=archival-health-b75-cold-rotator-failed` (temp SYSTEM_ALERTS_FILE, real queue untouched). |
| OBJ-2 (Wave C) | ⬜ OPEN | B70 analytics tables → warm/cold move-not-delete. B70 DROP cron PAUSED until then. |
| OBJ-3 / OBJ-4 (Wave D) | ⬜ OPEN | capture reduction (consumer audit first) → daily partitioning. |

## The headline: the OBJ-1 proof caught TWO dormant-path bugs
The B75 cold rotator's **scheduled Phase-2 rotation had never run against a real candidate** before Wave A (a `2025-12` cold row existed from the 2026-05-06 B75 seed, but the automated rotation path itself never fired). Two latent defects, both surfaced by the bounded proof:
- **(r3) INSERT param bug:** the cold-manifest `INSERT…SELECT` referenced `$1`/`$3` but passed 3 params `[c.id, null, coldUri]` — a stray unreferenced `null` at `$2` → Postgres *"could not determine data type of parameter $2,"* aborting every real rotation. Fixed `$3`→`$2`, dropped the null.
- **(r4) `verified_at` never stamped (Langston independent Step-8 DB check):** the cold row was inserted `state='active'` with `verified_at=NULL` — the only active row across all tiers without it — even though the rotator verifies the B2 round-trip at Step 2 (`downloadCold` + checksum match). Since `verified_at` is the only DB proof a cold copy landed intact, this was a split-brain risk on the AUTOMATED path. Fixed: the INSERT (+ ON CONFLICT UPDATE) now stamps `verified_at=NOW()`.

This is exactly why we run a real bounded rotation instead of trusting dry-run + a code read. Crash-safety held on r3 (warm stayed `state=active`, no data loss). **r4 proven both ways:** (proof 1) a real B2 verify of the existing `2026-01` (object exists + checksum `5a394606…` match) then guarded `verified_at` backfill (`23:14:47Z`); (proof 2) a fresh rotation of `2026-02` (2.8 MB) via the fixed code landed its cold row `state=active` with `verified_at=23:15:16Z` **auto-stamped at creation**. Every cold row now carries `verified_at`. Langston Step-4 r1→r4 + Step-8: APPROVED with independent live DB evidence.

**Activation levers (reconciled with Langston on data, 2026-07-08):** Wave A applied BOTH (1) flipping `cold_rotator_dry_run` **true→false** (it was `true` on arrival — captured before/after; the row's `updated_at=2026-05-18` is the B75 seed timestamp, NOT maintained on value changes, so it is not evidence the value was false since May), and (2) installing the previously-unscheduled monthly cron. B2 creds were already present since the May setup (not a Wave-A lever). Langston initially read `updated_at` as value-history and credited the flip to creds; conceded both on the before/after + `.env`-untouched evidence.

## Change set
- **NEW** `server/scripts/b75-cold-liveness.ts` — weekly cold round-trip canary.
- **NEW** `server/scripts/b-storage-archival-health.ts` — daily cron-silence + failed>0 watchdog.
- **MOD** `server/scripts/b75-cold-rotator.ts` — `--limit`/`--warm-retention-days` flags; terminal DONE on every exit path (r2); INSERT `$2` param fix (r3).
- **MOD** `server/services/database-monitor.ts` — warning/critical → §10.5 (deduped per level).
- **Ops (staging):** dry-run flag flipped; 3 crons installed (root crontab; backup `/root/crontab-backup-pre-waveA-20260707.txt`); one bounded real rotation executed.

## Verification (all Step-7 criteria met)
1. Cold rotation lands `tier=cold state=active` + download-verified restore ✅
2. dry-run flag false ✅ · both OBJ-1 crons scheduled ✅ · liveness canary exit 0 ✅
3. Watchdog fires §10.5 on synthetic failure ✅ · DatabaseMonitor wire-in code-verified ✅
4. Bench green (tsc baseline no-regression; system-alerts + storage unit tests pass) · CI 4-green both commits ✅

## Langston review trail
Step-2 pre-audit + Step-4 diff: r1 RESOLVE-READY (2 Step-7 conditions) → r2 CHANGES-NEEDED (empty-path DONE blocker — the double-verdict #401 hazard; stricter verdict taken + fixed) → r2 RESOLVE-READY → r3 (dormant-path bug fix) RESOLVE-READY → **Step-8 APPROVED with live staging evidence.**

## Governance files updated
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — B75 cron table + component inventory (cold ACTIVE, canary, watchdog, DatabaseMonitor→§10.5)
- `1-system-manual/CHANGES_AND_FIXES.md` — FIX-2026-07-08-A
- `1-system-manual/RUNNING_ISSUES.md` — #430 (V2 resolved, V1 → OBJ-2) + #431/#432/#433 (OBJ-2 follow-ups)
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` (§1 + §5)
- `Scope Files/B_STORAGE_HARDEN_PRE_AUDIT.md`, this report
- MEMORY_CC_A + repo mirror + Langston MEMORY

## Follow-ups homed (OBJ-2 / Wave C)
#431 canary `deleteCold` best-effort accumulation · #432 rotator `bytes_moved` string-concat cosmetic · #433 duplicate `b_new_53_provenance_capture_enabled` module_constants rows. Plus the core OBJ-2 work (B70 tiering) + `pair_scan_archive` KEEP→cold confirmation to Kyle at close.
