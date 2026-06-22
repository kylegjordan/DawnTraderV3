# B-LANGSTON-QUEUE — Completion Report

**Owner:** OLD Claude (CC-A). **Closed:** 2026-06-22. **change-class:** non_architecture (comms-infra — the Langston Discord bridge; no trading-engine/strategy/regime/math touch → System Manual N/A). **Comms:** Discord-only (per the isolation-test directive). **Reviewer:** Langston (multiple Step-4 passes, all APPROVED).

Scope: `Claude Comms and Packages/Scope Files/B_LANGSTON_QUEUE_SCOPE.md` (§6 = converged design).

---

## Outcome: ✅ LIVE

Langston's Discord review-queue now **self-advances**: he finishes one review item and the bridge immediately re-invokes him on the next ready one, looping until the queue is genuinely empty — ending the "sits idle until nudged" problem (Kyle 2026-06-22). `LANGSTON_SELF_ADVANCE=1` flipped ON at Kyle's go-ahead 2026-06-22 (systemd drop-in `/etc/systemd/system/discord-langston-bridge.service.d/self-advance.conf`).

**Why a bridge-tracked queue:** Langston is **stateless per invoke** on Discord (fresh `claude -p` per message, no cross-turn memory), so the queue MUST be external (`/home/langston/.langston-review-queue.json`) and fed to him each (re-)invoke.

---

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Explicit queue + enqueue (review requests only) | ✅ | `is_review_request()` gate; `#344` added `not marker_attempted()` so control messages don't enqueue |
| OBJ-2 | Self-advance loop WITH a hard cap | ✅ | `_self_advance()` + two-tier `CapTracker` (same-id halt@2 + 10 distinct, LOUD on trip); shakeout-1 back-to-back advance verified |
| OBJ-3 | Skip-and-circle (blocked items) | ✅ | park-on-blocked + `ready` un-park marker (`#342`); shakeout-2 un-park→re-pick→done with **zero false same-id HALT** |
| OBJ-4 | "Who holds the wrench" protocol | ✅ | documented in shared MEMORY.md (Langston reviews/never-pushes; implementer pushes; call shared pieces in-channel) |
| OBJ-5 | State-fed prompts (stateless-safe) | ✅ | each (re-)invoke carries the item's summary+pointer from the queue file |

**Added during build (Langston Step-4 refinements + shakeout findings):**
- `ready` first-class marker status → un-park; consumer = existing `pick_next_ready` (#342).
- Marker robustness: unquoted single-token OR quoted multi-word want/reason; **malformed-present split from absent** → distinct `park_kind` + LOUDER park (#343).
- Blocked-staleness TTL re-surface (`BLOCKED_TTL_SECONDS=6h`) so a parked item can't silently rot.
- #344: a marker-carrying CONTROL inbound no longer phantom-enqueues.

---

## Verification (two live shakeouts on the Helsinki bridge)

**Shakeout-1:** back-to-back auto-advance (done-markers advanced ~3s/turn) ✅; FINDING-2 missing-marker park (no marker → blocked + LOUD → loop continued) ✅; FINDING-1 (non-review trigger didn't enqueue) ✅.

**Shakeout-2:** un-park via inbound `[[QUEUE id=X status=ready]]` → re-pick → done with **ZERO false same-id HALT** ✅ (the cap resets on the inbound — Langston's key concern); blocked-staleness re-surface fired ✅; malformed-marker could not be induced live (Langston normalizes a broken marker to valid — reassuring) → stays unit-test-covered ✅; surfaced + fixed #344 ✅.

**Unit tests:** `langston_queue_test.py` 56/56 passing. Both files `py_compile` clean.

---

## Workflow

Scope (Langston-converged §6) → implementation → Langston Step-4 (initial 2 findings APPROVED, da02616d2) → shakeout-1 → completion increment (3 Langston refinements, Step-4 APPROVED, ab79514a0) → shakeout-2 → #344 fix (Langston-confirmed, 2af9e238b) → go-live flip. CI green throughout; pushed only on green; bench-tested before each push.

## Governance files changed

- `Claude Comms and Packages/Scope Files/B_LANGSTON_QUEUE_SCOPE.md` (§6 converged design — pre-existing)
- `1-system-manual/RUNNING_ISSUES.md` — #342/#343 (resolved-by-increment), #344 (resolved)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — Discord Comms Fabric: self-advance review-queue note
- `1-system-manual/BATCH_CATALOG.md` — batch entry
- `.claude/memory/MEMORY_CC_A.md` + truth file — state
- Langston `/home/langston/MEMORY.md` — §10.b sync (queue go-live + who-holds-the-wrench)
- `comms-infra/discord/`: `langston_queue.py` (engine), `langston_queue_test.py` (56 tests), `discord-langston-bridge.py` (wiring)

## Rollback

Bridge backups on box: `/opt/discord-bridges/discord-langston-bridge.py.pre-golive-20260622` (+ `.pre-step4fix-20260622`), `langston_queue.py.pre-golive-20260622`. To disable self-advance without rollback: remove the drop-in `self-advance.conf` + `daemon-reload` + restart.

## Open follow-ups (none blocking)

- `_resurface_stale_blocked` runs only in the depth=0 heartbeat (fine at Langston-queue traffic; depth hits 0 constantly). Noted by Langston.
- Inbound-marker apply accepts any status (not just `ready`) — fine for v1 (CC/Kyle re-marking). Noted by Langston.
- A valid-marker-for-wrong-id parks the advanced id as `no_marker` (wording slightly off; park is correct) — v1 accept.
