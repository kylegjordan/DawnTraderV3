# B-NEW-51 — Completion Report

**Batch:** B-NEW-51 — cron-fire-evidence verifier: cadence-aware staleness + root-level alert dedup. **Closed:** 2026-06-02.
**Deploy:** commit `c7529f146`; CI run `26830180190` all-4-green (TypeScript Check baseline gate, Test Suite, Build, Docker Build); staging HTTP 200; PM2 dawntrader restarted (#344).
**Mode:** active trading OFF throughout. No DB migration. No trading-path code.

> Bundled in the same deploy: **B.2.UI cosmetic follow-up** (commit `39c5e578c`) — whole-number crypto quantities in the "Volume / Order Book" column (no decimals), per Kyle directive 2026-06-02. CI green; rides the same staging deploy. (Separate concern, listed here for the governance trail per Langston Step-4.)

---

## Problem

The B-NEW-49 cron-fire-evidence verifier emitted a `weekend_shutdown … stale_fire_evidence` alert **every ~15 minutes** (16+ in one afternoon), each auto-routed to Langston via the B-NEW-46 relay. Kyle: this desensitizes us to alerts. Two independent root causes:

1. **Calendar-blind staleness.** `expected_by = lastFire + intervalSeconds × 1.5`. For `weekend_shutdown` (`0 20 * * 5` ET, weekly) that's `2026-05-23 + 10.5 days = 2026-06-02T12:00Z` — it expected the **weekend** timer to have fired by **Tuesday**. The interval model is right for fixed-interval jobs, wrong for any calendar schedule.
2. **No dedup.** `addAlert()` always created a new UUID — no suppression — so the every-15-min re-check re-created the same alert + re-invoked Langston each cycle.

(The 2026-05-29/30 occurrence WAS genuinely missed — but pre-dating the B-NEW-36/49/50 fixes, with no weekend since, so it can't self-clear until the next fire. The spam, not the single miss, was the problem.)

## Fix (structural — NO PATCHES)

1. **Cadence-aware staleness** — NEW `computePrevFire(expression, timezone, from)` in `cron-next-fire.ts` (cron-parser `.prev()`, the trusted introspection path from B-NEW-50). The verifier now computes the schedule's actual most-recent calendar occurrence and flags stale only if `lastFire < prevOccurrence − FIRE_LATENCY_GRACE` (10-min). Process-level boot-grace (5-min). Belt-and-suspenders interval×1.5 fallback retained for any unparseable expression.
2. **Root-level alert dedup** — optional `dedupe_key` on `addAlert`: suppress a new alert if a NON-terminal (scheduled/active/acknowledged) alert with the same key exists; `resolved` does NOT block (condition can recur). Backward-compatible — callers without a key are unchanged. Verifier passes `cron_stale:<job>:<prevOccurrence ISO>` → one alert per genuinely-missed occurrence, auto-clears on next successful fire.
3. **Legacy cleanup** — resolved the 13 non-resolved legacy `weekend_shutdown` stale alerts post-deploy so the surface starts clean.

## Verification

| Item | Result | Evidence |
|---|---|---|
| Local tsc | ✅ 493 == baseline (0 net new) | C:\dev bench |
| Targeted tests | ✅ 28/28 green | cron-next-fire (prev cases), verifier (cadence/grace/boot-grace/interval-fallback/dedup-key), system-alerts dedup (5) |
| CI all-4-green | ✅ run `26830180190` | TS / Test / Build / Docker all success |
| Staging deploy | ✅ `c7529f146`, HTTP 200, PM2 #344 | — |
| Legacy alerts cleared | ✅ 13 resolved | `system-alerts resolve … --by cc-session-2026-06-02` |
| Live one-then-zero | ⏳ confirming on next verifier cycle (~15-min timer) | Per Langston §42: expect EXACTLY ONE new keyed alert (the genuine 05-30 miss) then ZERO subsequent (dedup). Background poller verifying; this report updated/closed on confirmation. |

**Langston:** Step-1 approach confirmed (walked weekend / healthy-weekly / stuck-interval cases). Step-4 **approved — push**; both grace constants (10-min fire-latency, 5-min boot) + the dedup contract confirmed.

## Documented contracts / known edges (Langston Step-4 notes)
- **Resolve-while-broken re-surfaces (intentional).** Because dedup ignores `resolved`, manually resolving a still-broken cron's keyed alert will re-surface it on the next cycle. This is correct — resolving without fixing *should* re-alert — not a leak.
- **Newly-registered-cron `no_fires_ever` edge (RUNNING_ISSUES).** A cron added mid-cycle whose first scheduled occurrence has technically already passed flags stale ONCE (auto-clears on first real fire via dedup). Blast radius tiny; all current registered jobs have fire history so it can't trigger today. A `registered_at` floor guard would close it — logged to RUNNING_ISSUES, not built (no current trigger; NO-PATCHES-spirit improvement for later).

## Files changed
- `server/services/cron-next-fire.ts` — NEW `computePrevFire`.
- `server/services/cron-fire-evidence-verifier.ts` — cadence-aware staleness + dedupe_key + test hooks (`_setProcessStartForTest`, `runVerification(nowMs)`).
- `server/services/system-alerts.ts` — `dedupe_key` field + dedup in `addAlert`; `ALERTS_FILE` env-overridable (test seam; staging path unchanged).
- Tests: `cron-next-fire.test.ts` (+5 prev cases), `cron-fire-evidence-verifier.test.ts` (rewritten cadence-aware, 10 cases), `system-alerts-dedup.test.ts` (NEW, 5 cases).

## Governance files changed
BATCH_CATALOG, PHASE_HISTORY, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES, RUNNING_ISSUES, MEMORY (truth + in-repo + Langston), this report, scope (`B_NEW_51_SCOPE.md`), Step-4 review (`B_NEW_51_step4_review.md`).

## Out of scope
- The genuine weekend_shutdown firing confirmation → the June 5-6 weekend test (poll-reconcile B-NEW-36 protects the outcome regardless; active trading OFF).
- node-cron getNextRun bug → already B-NEW-50.
