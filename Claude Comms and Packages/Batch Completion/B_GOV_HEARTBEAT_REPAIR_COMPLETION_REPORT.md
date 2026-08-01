# B-GOV-HEARTBEAT-REPAIR — Completion Report (#637)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-08-01
**Scope:** `Scope Files/B_GOV_HEARTBEAT_REPAIR_SCOPE.md` · **Pre-audit:** `Scope Files/B_GOV_HEARTBEAT_REPAIR_PRE_AUDIT.md`
**Code:** `49a41aee4` (implementation) → `28b029528` (Langston Step-4 corrections)
**CI:** 4/4 green **verified job-by-job on `28b029528`** — Build · Test Suite · TypeScript Check · Docker Build.
**Suite:** 92 → **95 passed / 0 failed.**

---

## 0. What was broken

The governance checker's **dead-man switch** — the only thing that would tell us the checker itself had died. The checker's healthy output is *silence*, so a dead checker and a clean repo are indistinguishable without it.

**It could not clear its own alarm.** `heartbeat-check.mjs:39` called the alerts CLI without `--evidence`, which **B-GOV-INTEGRITY-1 (2026-07-10) made mandatory** — so the call exited non-zero on every invocation, the `catch` swallowed it, and `hb.alertId = null` ran **unconditionally on the same line**. ⇒ the alert stayed open **and** the only handle that could retry it was discarded.

⚠️ **Severity was initially understated by CC-B as "latent."** It is not latent — it fails on first use. It had simply never been used, because the timer was off.

★ **AND THE TIMER HAD BEEN OFF FOR SIX WEEKS** — measured from `heartbeat-state.json` mtime (`2026-06-19 10:41`), with the poller's own `state.json` at that moment reading current as the positive control.

## 1. Objectives vs outcome

| # | objective | outcome |
|---|---|---|
| OBJ-1 | Supply `--evidence` with a token that carries information | **YES** — the poller now publishes its graded sha into the state file; the heartbeat reads it across the process boundary. |
| OBJ-2 | Stop discarding the alert id on failure | **YES** — `hb.alertId = null` runs only on a confirmed clear. |
| OBJ-3 | Keep the `catch` for the benign case; make real failures loud | **YES**, and corrected at review (see §3). |
| OBJ-4 | One SSOT for the token shape | **YES** — `resolveEvidenceOrSentinel()` in `config.mjs`; both processes delegate. |
| OBJ-5 | Fences that fail before they pass | **YES** — and one caught a live bug in the fix itself (§2). |
| OBJ-6 | Deploy, verify, **then** enable | **YES**, in that order (§4). |

## 2. ★ The fence caught a defect in the fix — and its severity was worse than stated

The first implementation accepted **`1785485897377`** as a commit reference. It is 13 characters, **every one of which is a valid hex digit**, so `/^[0-9a-f]{7,40}$/i` matches it.

⛔ **CC-B's first gloss — "it would fail the CLI's validation one layer deeper" — WAS WRONG, and wrong in the dangerous direction (Langston, re-read at the ref).** `isValidResolutionEvidence` (`server/services/system-alerts.ts:172`) tests `/\b[0-9a-f]{7,40}\b/i` — **unanchored** — so it **passes**. ⇒ **the timestamp would have been written into `resolution_evidence` as if it were a git sha: a silent fabricated provenance record, the #447 class the sentinel exists to prevent.** The all-decimal guard is the only thing standing there.

## 3. Langston Step-4 — one blocker, and it would have recreated the bug

**BLOCKER:** the benign-error test was a bare `not found` substring. **That also matches `bash: npm: command not found` and `sh: 1: node: not found` — the classic non-login-PATH failure under a systemd timer.** ⇒ it would have returned `true`, nulled the handle, and **reintroduced #637 exactly**. Anchored to `/Alert \S+ not found/i`; **verified discriminating: CLI-miss → true, both PATH shapes → false.**
★ **`already resolved` / `terminal` were DEAD alternatives and were removed** — `system-alerts.ts:461-498` has **no terminal-state guard**, so re-resolving a resolved alert succeeds and re-stamps rather than erroring.

## 4. Verification — provoked, not assumed

⚠️ **A clean heartbeat run proves nothing.** With no alert held, neither branch executes. **This is the #594 lesson**: absence of failure is not evidence when the instrument never ran.
✅ **PROVOKED, END-TO-END ON LIVE INFRASTRUCTURE:** synthetic alert `af614cbf…` created → its id seeded into the heartbeat state → the repaired heartbeat run → **at the row: `state=resolved`, `resolved_by_claimed=governance-checker-heartbeat`, `resolved_by_transport=cli`, `resolution_evidence=b3d1856ffb2ca9457de0c524c7e38f3b6a7c30f4`** — a **real sha the checker actually graded at**, not the sentinel.
✅ **Poller half independently confirmed live**: `state.json` carried `gradedRefSha` at the 07:41 tick, before any manual action.

★★ **AND ENABLING THE TIMER WAS NOT SUFFICIENT — the batch nearly closed on a green that meant nothing.** After `systemctl enable --now`, the timer read **`enabled` + `active` with an EMPTY `NEXT` and `LAST` = 2026-06-19.** **Its triggers are purely monotonic (`OnBootSec=8min`, `OnUnitActiveSec=15min`) and `Persistent=true` only rescues CALENDAR timers** — with boot long past and the service not active since June, there was **no anchor to count from**. One manual `systemctl start` established it.
✅ **SELF-SUSTAINING, CONFIRMED: three unattended firings at 09:20:40, 09:35:40, 09:50:43, next scheduled 10:05:42** — the chain continues without the manual trigger. Each run reports `silent=false` and the sha it reads advances as the checker ticks.
⚠️ **Recorded because it is this batch's own failure mode reproduced in the act of fixing it: "enabled" is not "scheduled," and stopping at the word would have shipped a safety net that could never fire.**

## 5. Governance files changed
`RUNNING_ISSUES.md` (#637 resolved) · `SYSTEM_IMPACT_MAP.md` (cross-process state contract) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · this report · the scope · the pre-audit · `config.mjs` · `poller.mjs` · `heartbeat-check.mjs` · `poller.test.mjs`.
**System Manual: NOT applicable** — judged explicitly per §9; governance tooling, no trading architecture/strategy/regime/filter/pipeline/math change.

## 6. Carried, not closed
**#642** — `acknowledged_by` is treated as an ownership register with no transfer path. **Deliberately NOT solved here**: adding a `--by` reassign would be one more unauthenticated free-text field (#447's trap). Kyle's call between rename-to-first-acker and a transport-stamped transfer.
