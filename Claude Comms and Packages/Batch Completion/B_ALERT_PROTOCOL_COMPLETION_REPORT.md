# B-ALERT-PROTOCOL — Completion Report

**Owner:** OLD Claude (CC-A). **Closed:** 2026-06-23. **change-class:** non_architecture (observability/comms infra — the §10.5 alert lifecycle + dispatcher + Langston handler; no trading-engine/strategy/regime/math touch → System Manual N/A, SIM applies). **Reviewer:** Langston (Step-1 + Step-4 + Step-8). **Source issue:** RUNNING_ISSUES #340.

---

## Outcome: ✅ CLOSED + LIVE — and validated on real production data

The post-diagnosis alert-handling protocol is live: a diagnosed alert now gets an **owner** + is **tracked to closure**, and a diagnosed-but-unresolved alert **can no longer silently rot**. Scope: `Scope Files/B_ALERT_PROTOCOL_SCOPE.md` (§6 = Langston's build-locked answers).

**The validation was dramatic.** The Step-8 synthetic end-to-end test fired one test alert (owner-routing confirmed) and, on its very first dispatcher run, the new re-surface **caught a real backlog of 25 unresolved alerts** — many acknowledged weeks-to-months ago but never resolved (one open ~552h), i.e. the exact "nothing comes back" rot this batch exists to kill. Langston triaged + resolved them. The closure guarantee works on real data.

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Protocol doc, always findable | ✅ | `1-system-manual/ALERT_HANDLING_PROTOCOL.md` + CLAUDE.md §10.5 pointer; per-class table covers all 6 `AlertCategory`. |
| OBJ-2 | Langston's diagnosis assigns an owner | ✅ | Discord bridge `is_alert` prompt → marker. **E2E:** test alert produced `[[ALERT id=30e7d6f6… owner=CC-A action="…e2e test as passed…"]]`. |
| OBJ-3 | Owner recorded + owner-routed wake | ✅ | `cc-wake-filter.py` `ALERT_OWNER_RE`; owner via mandatory `ack --by`. **E2E:** the owner-tagged reply woke CC-A. |
| OBJ-4 | No-silent-drop re-surface (closure guarantee) | ✅ | `processResurface()` (delivery-gated back-off) + `computeResurfaceStale()` (two-tier TTL, ack-no-reset, capped widening). **E2E:** re-surfaced the 25-alert backlog. |
| OBJ-5 | Per-class default owner+action table | ✅ | In `ALERT_HANDLING_PROTOCOL.md`. |
| OBJ-6 | Discord-native | ✅ | Built on the Discord alerts path; rides the cutover. |

## Workflow (the honest record)
Scope → Langston Step-1 APPROVE (build-locked refinements) → implement → **Langston Step-4 CHANGES-NEEDED** (caught a real bug: the re-surface posted to one sink and advanced its own back-off even when delivery failed — the inverted-guarantee bug) → rework (delivery-gated `processResurface`, re-surface fires through the full path re-engaging Langston + re-waking the owner, resolve-race re-read guard, capped back-off, +3 dispatcher-level tests) → **Langston Step-4 RE-APPROVED** → push (the GCM-hang infra detour — bypassed via the gh token, made permanent with `gh auth setup-git`) → deploy (staging git pull; Helsinki bridge restart) → **Step-8 e2e PASSED** → governance.

## Verification
- **Unit:** `system-alerts-resurface.test.ts` 10/10 (two-tier TTL, ack-no-reset, widening+cap, escalate-on-2nd, info/scheduled/resolved skip, **delivery-gated back-off**, resolve-mid-pass skip, markResurfaced idempotency). tsc baseline clean. CI 4-green (run 28059760931).
- **Step-8 E2E (live, staging):** owner marker emitted + owner-routed ✅; re-surface caught the real 25-alert backlog ✅; test alert acked→resolved ✅.

## Governance files changed
- `1-system-manual/ALERT_HANDLING_PROTOCOL.md` (NEW — the protocol)
- `CLAUDE.md` §10.5 (pointer to the protocol)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (the alert dispatcher's new closure-guarantee component + owner-routing state — Langston's must-not-skip SIM update)
- `1-system-manual/RUNNING_ISSUES.md` (#340 RESOLVED; #346 first-run-ramp follow-up)
- `1-system-manual/BATCH_CATALOG.md` (batch entry)
- code: `server/services/system-alerts.ts`, `scripts/system-alerts.ts`, `server/tests/unit/system-alerts-resurface.test.ts`, `comms-infra/discord/discord-langston-bridge.py`, `comms-infra/telegram-reference/cc-wake-filter.py`

## Follow-ups (homed)
- **#346 — first-run thundering-herd ramp.** On first activation the re-surface surfaced the entire existing backlog (25 alerts) in one burst. The back-off prevents *recurrence*, but a gentle first-run ramp (or a one-time backlog triage before activation) would make a future activation less noisy. Non-blocking; homed.
- Real items the backlog surfaced (not this batch's work): the `weekend_shutdown` cron arming `TOO_FAR_FUTURE` year-rollover bug (RI #165 — CC-B lane) + the lq_min-38 xStock apply (CC-B lane) — both now owner-routed via the new protocol, which is the point.

## Rollback
Helsinki bridge backup `discord-langston-bridge.py.pre-alertproto-20260623`. The re-surface can be disabled by reverting `cmdFireDue`'s `processResurface` call (dispatcher); the protocol doc + owner-marker are additive.
