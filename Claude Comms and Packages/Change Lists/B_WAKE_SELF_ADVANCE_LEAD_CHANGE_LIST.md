# B-WAKE-SELF-ADVANCE-LEAD (#1177, row 1v) — CHANGE LIST (Step 4, r1)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) THAT CLASS'S DOC SET** | SCOPE — **present**, `Claude Comms and Packages/Scope Files/B_WAKE_SELF_ADVANCE_LEAD_SCOPE.md` (r2 `68af4ccbf`) · PRE_AUDIT — **present**, `…/B_WAKE_SELF_ADVANCE_LEAD_PRE_AUDIT.md` (approved, conditions folded `103a99e24`) · COMPLETION_REPORT — **absent**, written at Step 11 · BATCH_CATALOG, PHASE_HISTORY — **absent**, Step 10 · SYSTEM_MANUAL — **judged N/A**: no trading component · SYSTEM_IMPACT_MAP — **judged, owed at Step 10**: the fabric bridge row (OBJ-5) · CHANGES_AND_FIXES — **judged N/A**: no trading-system bug · RUNNING_ISSUES — **present** (`#1177`) · POST_AUDIT_ROADMAP, DELETED_COMPONENTS_LOG, ADJUSTMENT_FRAMEWORK — **judged N/A**: no roadmap item, nothing removed, no parameter · SPRINT_TO_LIVE_PLAN row 1v — **present** · memory + task list — Step 10 |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_WAKE_SELF_ADVANCE_LEAD_PRE_AUDIT.md` at `103a99e24` (APPROVED 2026-10-08, PROCEED with conditions 1-2) |

**Code:** review branch `migration/b-wake-self-advance-lead` at `34e51a966` — NOT on `migration/aws-supabase`. One commit over `103a99e24`; 6 files, +93/−17. No untracked files in the change set.

## WHAT CHANGED, by plan item
**P1 — `langston_queue.recipient_name(task, kyle_id)` (NEW, pure).** The one resolution site: `addressee` when non-empty (a self-advance task) → `Kyle` when `kyle_id is not None and author_id == kyle_id` → `author_display or author_name`, stripped. ⚠️ **One behaviour change beyond the plan, stated:** the Kyle branch now requires `kyle_id` to be set. Before, `author_id == CFG.get("kyle_id")` read `None == None` as Kyle for any id-less task when the config lacked `kyle_id`; the only id-less tasks are self-advance ones, which now carry an addressee. Pinned by R7.
```python
# BEFORE  discord-langston-bridge.py:97-106
def resolve_recipient_name(task):
    if task.get("author_id") == CFG.get("kyle_id"):
        return "Kyle"
    return (task.get("author_display") or task.get("author_name") or "").strip()
# AFTER   the bridge binds the config; the rule is in langston_queue.py
def resolve_recipient_name(task):
    return lq.recipient_name(task, CFG.get("kyle_id"))
```
**P2 — enqueue stores the resolved name** (`discord-langston-bridge.py` `process_task`, was `:447`):
```python
-   items.append(lq.new_item(msg_id, task.get("author_display") or task.get("author_name", "?"),
+   items.append(lq.new_item(msg_id, resolve_recipient_name(task) or "?",
```
**P3 — the self-advance task carries its addressee** (`_self_advance`, was `:322-325`): `"addressee": nxt.get("requester")` added; `author_name/author_display: "self-advance"` kept (the breaker and the prompt key on the label).
**P4 — `langston_queue.lead_with_addressee(text, task, kyle_id)` (NEW, pure)** replaces the inline prefix (was `:554-557`). Same guard (no prefix when the text already opens with the name, case-insensitive). Adds `(self-advance) ` after the name **only when the task is self-advance AND has a real addressee**; with no requester it leads `self-advance — …` exactly as before.
**P5 — tests, `langston_queue_test.py`:** R1-R7 (`recipient_name`), L1-L4 (`lead_with_addressee`). **90 passed, 0 failed** on Linux (Helsinki, a temp dir, nothing installed). **Mutations:** M1 drop the addressee branch → R1, R4, L1, L2 fail (86/4); M2 drop the marker → L1 fails (89/1). **CI:** new Test Suite step "Langston queue tests (addressee, ordering, caps)" — the suite was in no workflow before, and cannot run on Windows (`fcntl`).
**P6 — `test-wake-filter-cuts.py`:** `LEAD_SELF_ADVANCE` (= L1's exact output) wakes CC-A; **control** `LEAD_SELF_ADVANCE_OLD` (the pre-batch `self-advance — **OLD Claude —** …`) wakes nobody; a queue reply led with NEW Claude stays silent. Suite: 44 PASS, 0 FAIL on this laptop; already in CI.
**P8 (code half) — `cc-wake-filter.py` comments `:185`, `:1085`:** the stale `discord-langston-bridge.py:530-535` pointers now name `langston_queue.py lead_with_addressee` and the self-advance case. Comment-only; the installed laptop filter is re-installed at Step 6 so it equals the blob (`#1004` class).

## INSTALL PLAN (Step 6 — unchanged from the pre-audit P7)
Two files to `/opt/discord-bridges/`: the bridge (closing the `B-CREDENTIALS-PRIVATE-REPO` OBJ-4a P4 gap, which changes your review read model — Infra Claude co-signs) and `langston_queue.py`. **Gate before restart:** the ssh `ls-remote` as `langston` returns a sha. Back up, restart only when idle, sha256 = blobs, a reply comes back, Infra Claude checks the `[REVIEW SOURCE …]` line. Then re-install the laptop filter (comment change) and verify its sha256.

## JUDGEMENT CALLS TO ATTACK
1. The `kyle_id is not None` guard (P1) — a correction beyond the plan; R7 pins it.
2. `lead_with_addressee` lives in the queue module (pure) rather than the bridge — it is what makes P6's string a tested bridge output rather than a hand-written one.
3. The marker is suppressed for the no-requester fallback, so that case is byte-identical to today.
