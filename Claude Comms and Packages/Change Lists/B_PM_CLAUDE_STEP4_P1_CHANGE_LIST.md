# B-PM-CLAUDE — Step 4 change list, increment P1 (the wake filter)

**Graded ref:** `5f467af476f3e107729aeca8083ef981641c7ed0` on `migration/aws-supabase` (commit `B-PM-CLAUDE Step-3 P1`).

| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (scope header; re-declared by Langston at Step 2, 20:17:07Z) |
| ii | **doc set for that class** | scope — **present** `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_SCOPE.md` (r3) · pre_audit — **present** `…/B_PM_CLAUDE_PRE_AUDIT.md` (r3, Step 2 PROCEED 20:51:50Z) · completion_report — **absent, owed at close** (`open` row filed, `GOVERNANCE_EXCEPTIONS.md`, `3ce8fecb7`) · batch_catalog — **absent, owed at Step 10** · phase_history — **absent, owed at Step 10** · conditional: system_manual — **N/A** (`na-skip` row, confirmed by you) · sim — **owed at Step 10** (your Step-2 condition) · running_issues — present (`#1237`, `#1238`) · changes_and_fixes, roadmap, deleted_log, adjustment_framework, phase_19_plan — **N/A** (no trading change, no deletion, not a P19 batch) |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_PRE_AUDIT.md` §5, row P1 |

## The change set (2 files; `git status --porcelain` showed no untracked files)

### MODIFIED `comms-infra/laptop/cc-wake-filter.py` (`:54-65` at the ref)
```diff
     "CC-INFRA": [r"infra[\s_-]*claude", r"claude[\s_-]*infra", r"cc[\s_-]*infra"],
+    # CC-PM (PM Claude, Kyle 2026-11-04, B-PM-CLAUDE P1). NO BARE "pm" ANYWHERE (Langston C4) ...
+    "CC-PM": [r"(?-i:PM)[\s_-]*claude", r"claude[\s_-]*(?-i:PM)", r"cc[\s_-]*pm"],
 }
 ALIAS_NAME = {"CC-A": "OLD Claude", "CC-B": "NEW Claude", "CC-C": "ANALYST Claude",
-              "CC-INFRA": "Infra Claude"}
+              "CC-INFRA": "Infra Claude",
+              "CC-PM": "PM Claude"}
```
`NAMES` feeds `MY_RE` (`:154`), `OTHERS_RE` (`:160`, every other session's patterns) and `OPEN_RE` (`:210`). `ALERT_OWNERS` (`:187`) is unchanged: PM owns no alerts, so an `owner=CC-PM` marker is refused on stderr, which is correct.

### MODIFIED `scripts/analysis/test-wake-filter-cuts.py` — 11 cases, each run AS a given session (`run_as`)
PM wakes on its own name (session post and Kyle) · a PM-only message no longer wakes OLD or NEW (**the deliberate change for the four**) · an OLD-only post does not wake PM · PM's own post never wakes PM (self-wake control) · Kyle naming OLD and PM wakes both · **C4 negatives:** `"4 PM ET, then pm2"` and your compound `"at 3 pm Claude will post"` stay broadcasts, reaching both OLD/NEW and PM.

## Evidence
- **New filter (repo copy):** `ALL PASS`; 18 of 35 original cases wake (the instrument speaks) and all 11 PM cases pass.
- **Discrimination:** run against the currently installed filter (`~/.claude/cc-wake-filter.py`, sha256 `7c8ed302…` = the pre-change blob) the suite **FAILS exactly the three cases the change is meant to flip**, and passes the rest.
- **Other suites, unchanged and green:** `test-heartbeat-control.py` 44/44 · `test-wake-lease.py` ALL PASS · `test-wake-lease-verdict.py` 29/29 · `test-wake-follow.py` ALL PASS · `test-wake-state-unsaved.py` 12/12.

## Judgement calls to attack
1. **Case-sensitive "PM" via `(?-i:PM)`.** It makes `"pm claude"` (lowercase) NOT name PM, so a lowercase message from Kyle broadcasts to everyone, PM included. I took that over matching lowercase, because a lowercase match is exactly your compound-collision risk. Is a missed **named** wake for lowercase acceptable, given that the broadcast still reaches PM?
2. **`r"claude[\s_-]*(?-i:PM)"`** (the "Claude PM" form). Keep it, or drop it as a form nobody uses?
3. **A plan change: the hourly heartbeat moved out of P1 (UNAUDITED in the pre-audit's sense).** Adding `CC-PM` to `control_state.py` `ALIASES` turned 13 of 44 heartbeat tests red. Missing liveness reads `UNDETERMINED` → `CHECK FAILED` → `NOTIFY yes`, so installing the script ahead of the skill's `--liveness` list would page Kyle. It is now **P1b**: after PM's watcher is armed and proven, with the tests and the skill's alias lists changed in the same commit. Until then the heartbeat post names the other four only, so PM's filter suppresses it.

## After your PROCEED (Step 6 here = install + re-arm, in order)
Install the blob to `~/.claude/cc-wake-filter.py` (sha256 checked against the ref) → PM arms → OLD, NEW, ANALYST and Infra each re-arm and reply with the sha256 of their installed copy → the four live probes (scope OBJ-2), each recorded with its inbox id and the installed sha it ran on.
