# B-NEW-50 COMPLETION REPORT — node-cron next-fire readout fix (RUNNING_ISSUES #165)

**Batch ID:** B-NEW-50 · **CLOSED:** 2026-06-01 · **Active trading:** OFF throughout (zero capital risk).
**Commits:** `6372a2d` (fix) + `63bc69d` (ESM hotfix, BUG-2026-06-01-A) + governance commit (this turn).
**CI:** runs `26727251062` + `26728424647` — both all-4-green. **Langston:** Step-1 + Step-4 + Step-8 CONFIRMED.

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)
> **PREVIOUSLY:** RI #165 = "node-cron **Friday-NY-tz** `getNextRun()` bug," firing impact **unknown**.
> **NOW:** affects **every day-of-week schedule whose next hit is ≥~2 days out, in BOTH NY and UTC**; **introspection-only — firing proven correct + self-correcting**. REASON: isolated repro + node-cron source read + live fire test + live Sun-resume-via-cron.

## Root cause (proven)
`MatcherWalker.matchNext()` (matcher-walker.js:84-89) advances the weekday-reconcile loop by a whole YEAR per iteration instead of a day → day-of-week schedules ≥~2 days out return the next Jan-1st landing on that weekday. Firing is a separate path (`TimeMatcher.match(now)` + 24h heartbeat-delay cap, runner.js:178), correct + self-correcting. The Fri 2026-05-29 non-fire was the 30h staging outage, NOT this bug — **confirmed live** when the Sun 2026-06-01 00:00 UTC `weekend_restart` fired via cron (`src=cron`), resuming 244 trades.

## Fix (SHIM)
New `server/services/cron-next-fire.ts` `computeNextFire()` (failure-safe, single entry point) via `cron-parser` (promoted to direct dep @4.9.0, **default-imported** — see BUG-A). `cron-arm-logger.ts` + `cron-arm-smoke-test.ts` classify/log off it; node-cron raw `getNextRun()` kept only as labelled `[UNTRUSTED ncv=4.2.1]` diagnostic. node-cron scheduling/firing untouched.

## Scope objectives — ALL MET
| # | Objective | Result |
|---|---|---|
| 1 | `cron-next-fire.ts` helper, failure-safe | ✅ 8 unit tests |
| 2 | `cron-parser` direct dep | ✅ package.json + lock |
| 3 | arm-logger shim + raw `[UNTRUSTED]` | ✅ |
| 4 | smoke-test classifies on shim | ✅ weekend timers → OK on staging |
| 5 | regression-lock test (5+6-field, NY+UTC, tz-fallback) | ✅ 8/8 |
| 6 | clear 4 stale TOO_FAR_FUTURE alerts | ✅ all acknowledged 00:16Z |
| 7 | CI green + deploy + governance + completion | ✅ |

## Verification
- **Local:** tsc 493 baseline (zero in touched files); vitest 31/31 cron + 19/19 lifecycle green; + ESM-loader runtime test (`scratch/cronparser-esm-test.mjs`).
- **CI:** both runs all-4-green.
- **Sunday-resume gate:** ✅ `weekend_restart` fired 2026-06-01 00:00:00 UTC via cron (src=cron); 244 `weekend_suspended` → open (247 open).
- **Staging (§9.3 outcomes-based):** ✅ boot + boot+5min smoke `aggregate=OK 7/7`; `weekend_shutdown next_fire=2026-06-06`, `weekend_restart next_fire=2026-06-08`; zero new TOO_FAR_FUTURE alerts; app online HTTP 200.
- **Langston Step-8:** ✅ CONFIRMED independently via `ssh staging`.

## 🚨 BUG-2026-06-01-A — ESM-bundle deploy crash (caught + fixed)
First deploy (`6372a2d`) crash-looped staging at boot: `SyntaxError: Named export 'parseExpression' not found` — `import { parseExpression } from 'cron-parser'` (CJS package) is unresolvable as a named import in the production `esbuild --format=esm` bundle, despite passing tsc + vitest + CI Build + Docker Build. Hotfix `63bc69d`: default-import + destructure, validated against Node's ESM loader directly. **~3-min outage; NO trades affected** (resume already fired under prior code). Structural gap → RUNNING_ISSUES #168 + ASSET_CLASS_ONBOARDING §4.27.

## Governance files changed
RUNNING_ISSUES (#165 CLOSED + #168 OPEN), CHANGES_AND_FIXES (CLOSURE-2026-06-01 + BUG-2026-06-01-A), SYSTEM_IMPACT_MAP §9.10.c, BATCH_CATALOG (B-NEW-50 row), PHASE_HISTORY (B-NEW-50 entry), ASSET_CLASS_ONBOARDING_WORKFLOW §4.27, MEMORY (3-way), this report. Scope/Pre-Audit/Change-List in `Claude Comms and Packages/`.

## Asset-class onboarding learnings (§3.3)
The ESM-bundle verification gap (§4.27) — generalizable: default-import CJS deps + validate against Node's ESM loader before deploy; CI green ≠ artifact runs. (B-NEW-50 is infra, not a Phase-24 asset-class batch, but the learning is captured.)

## Follow-ups spawned
- **RUNNING_ISSUES #168** — CI production-bundle boot smoke (close the class of bug BUG-A represents). Do after B-NEW-47.
- Langston CLI→Opus-4.8-1M update (Kyle directive, after B-NEW-47).
