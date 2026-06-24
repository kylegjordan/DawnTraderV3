# B-LANGSTON-QUEUE-345 — Completion Report

**Owner:** OLD Claude (CC-A). **Closed:** 2026-06-24. **change-class:** non_architecture (comms-infra — the Langston Discord review-queue engine + bridge wiring; no trading-engine/strategy/regime/math → System Manual N/A, SIM applies). **Reviewer:** Langston (Step-1 + Step-4). **Source:** RUNNING_ISSUES #345. **Deployed:** `907cd93db` (Helsinki `/opt/discord-bridges/`).

---

## Outcome: ✅ CLOSED + LIVE — self-advance re-enabled and verified quiet

The self-advance loop was re-feeding Langston already-settled conversational topics indefinitely under sustained crew chatter (it had disabled the feature on 2026-06-24 as a stopgap). #345 is the permanent fix; `LANGSTON_SELF_ADVANCE=1` is back on and live-shakeout-verified.

## Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| C1 | Enqueue gate requires a review-REQUEST verb, not a bare mention | ✅ | `_REQUEST_VERB_RE` replaces the loose `_REVIEW_INTENT_RE` (which matched the bare token `verif`). Bare pointer alone does NOT enqueue (R3). Live: a "verified" conversational probe → 0 ready. |
| OBJ-B | Capture a pointer at enqueue | ✅ | `extract_pointer` (inbox path / repo file / sha; sha requires digit+letter so words aren't mistaken); wired into `new_item(pointer=…)`. Decoupled from the gate. |
| OBJ-A | Auto-settle on first pass — no degraded re-pass | ✅ | New `noop` terminal status; the bridge settles an enqueued item to `done` (if Langston's marker reviewed it) or `noop` (if not), on ANY reply. Robust to the model forgetting the marker (R1) without masking a real miss. |
| C2 | Same-id halt survives `CapTracker.reset()` on inbound | ✅ | Per-ITEM `self_advance_refires` counter, **persisted across save/load**, parks the item at `SAME_ID_CAP`; cleared on terminal settle (R4). |

## Workflow (the honest record)
Scope → **Langston Step-1 APPROVE** (3 refinements folded: R1 auto-settle-but-don't-false-`done` → the `noop` reconciliation; R3 pointer-is-booster-only; R4 clear-counter-on-terminal) → implement → **Langston Step-4 CHANGES-NEEDED** (caught a real blocking bug: the C2 counter was incremented in-memory but `_self_advance` ran *after* `save_queue` and never wrote it back → the halt could never trip; the unit cases masked it by not round-tripping through the file) → fix (persist after the bump + an integration test that round-trips `save_queue`/`load_queue`) → **Langston Step-4 RE-APPROVED for push** → push (`907cd93db`, CI 4-green run 28089660924) → deploy (scp to Helsinki + bridge restart, 79/79 tests on the box) → **live shakeout PASSED** → re-enable `LANGSTON_SELF_ADVANCE=1` → governance.

## Verification
- **Unit:** `langston_queue_test.py` 79/79 (was 56) — incl. the C2 round-trip integration test that catches the persist bug, plus C1 discussion-vs-request cases, OBJ-B pointer/sha, OBJ-A `noop` settle + counter-clear.
- **Live shakeout (Helsinki bridge, self-advance re-enabled):** a conversational probe containing "verified" did NOT enqueue (review-queue ready = 0); zero self-advance re-invokes since re-enable (last churn entry was pre-fix, the night before); single healthy bridge daemon.

## Known residual (non-blocking, honest)
- C1 can still over-enqueue on rare phrasings (e.g. "Step-4 done, I read your notes") — but OBJ-A `noop`-settles any over-enqueue within one pass, so it never loops. Do not read C1 as zero-false-positive (Langston's Step-4 note).
- C2 is a deep backstop that rarely fires now (OBJ-A + the FINDING-2 park settle/park an item within one pass) — kept as defense-in-depth; the persist fix matters precisely because it would otherwise sit dormant until a tight re-ready loop.
- Operational: Langston twice ran a whole-filesystem `find /` to locate the deployed bridge files, hanging his worker ~30 min each (looked idle to Kyle). Killed both; told him the `/opt/discord-bridges/` path. Worth a firmer guard if it recurs.

## Governance files changed
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (Langston self-advance entry → re-enabled + the 3 fixes + `noop`)
- `1-system-manual/RUNNING_ISSUES.md` (#345 RESOLVED)
- `1-system-manual/BATCH_CATALOG.md` (this batch row + the B-LANGSTON-QUEUE disabled→re-enabled note)
- code: `comms-infra/discord/langston_queue.py`, `discord-langston-bridge.py`, `langston_queue_test.py` (in `907cd93db`)

## Rollback
Disable without code rollback: `rm /etc/systemd/system/discord-langston-bridge.service.d/self-advance.conf` + `daemon-reload` + restart → `LANGSTON_SELF_ADVANCE` OFF (Langston still answers direct messages; only the auto-pickup pauses).
