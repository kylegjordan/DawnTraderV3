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

---

## Step 4 → 7 record for P1 (2026-11-04)

- **Step 4:** Langston PROCEED 21:34:20Z with three in-commit conditions (clock-time guard, `Claude PM` form dropped, uppercase cases pinned), folded at `efc6c3b5c`; suite ALL PASS, 15 of 15 PM cases.
- **Step 5:** CI run `41918893184` on `e2a3e47b8`, per job: TypeScript Check success · Test Suite success · Build success · Docker Build success.
- **Step 6 (install, the deploy for a laptop file):** 21:47Z UTC (laptop clock 22:47). `~/.claude/cc-wake-filter.py` sha256 `9cdd99d48dc23f408b6fa421f89cb173a56b3ff3d09d47d163f35fd04f1a573c` = the blob at `e2a3e47b8`; previous file kept as `cc-wake-filter.py.pre-b-pm-claude-p1` (sha256 `7c8ed302…`). Suite re-run against the INSTALLED copy: ALL PASS.
- **Ordered re-arm, sha receipts (Langston C3), all = `9cdd99d4…`:** OLD 21:48:35Z · NEW 21:48:35Z · Infra 21:48:20Z (task `bmm9nl4h8`) · ANALYST 21:48:56Z · PM armed first (lease 21:49:30Z UTC).
- **Step 7, live:** each of the four receipts was itself a session post naming only PM Claude, and each woke PM through its own watcher (wakes `1567656852580475014`, `…6888970117223`, `…6922717495328`, `…6937418530867`).
- **Step 7, replay of the real inbox rows through the installed filter, run as each alias** (the instrument is the installed file; the watchers run the same file at the same sha):

| probe | row | CC-A | CC-B | CC-C | CC-INFRA | CC-PM |
|---|---|---|---|---|---|---|
| 1 · a session post naming only PM | OLD's receipt `1567656852580475014` | 0 | 0 | 0 | 0 | **1** |
| 2 · a Langston reply to OLD only | `langston_outbound` 21:07:05Z | **1** | — | — | — | 0 |
| 3 · PM's own post naming only PM (self-wake control) | `1567657090925731954` | 0 | 0 | 0 | 0 | 0 |
| 4 · a Langston reply led "PM Claude" | `langston_outbound` 21:34:20Z | 0 | 0 | 0 | 0 | **1** |

Positive controls are rows 1, 2 and 4: the same replay emits a wake where one is owed, so its zeros are evidence. Kyle-authored probes were not run (they need Kyle to post); the filter treats Kyle's posts by the same name rule, covered by the suite's Kyle cases.

---

## P1b record — PM Claude in the hourly heartbeat (2026-11-04)

- **Step 4:** Langston PROCEED (reply `1567669347781058611`) with three conditions, all in `5b221836a`: C2 PM Claude registered in `.claude/cc-session-roster.json` (alias CC-PM, session `994e6488-…`, plus PM Codex as a planned non-session participant); C3 the skill's "ALL THREE" wording fixed to five; the wake suite's heartbeat literals now carry the five-name prefix the task emits. Suites: wake ALL PASS, heartbeat 44/44.
- **Step 5:** CI run `41927726582` on `b1a555649` (contains `5b221836a`), per job: Build, Test Suite, TypeScript Check, Docker Build all success. *(The earlier run `41927396062` on `5b221836a` itself had two jobs cancelled by a later push and is not counted.)*
- **Condition 1, checked before install:** the three files `decide()` reads for CC-PM exist: `CC-PM.json` with `pos["/var/log/cc-wake.log"] = [1255, 106157]`, `CC-PM.lease` (taken 22:46:06Z), `CC-PM.json.alive`.
- **Step 6 (install):** both files copied together from `b1a555649` to `~/.claude/scheduled-tasks/wake-watcher-heartbeat/`; sha256 installed = blob for both (`control_state.py` `2e5f7c4c…`, `SKILL.md` `a66805d0…`); previous files kept as `*.pre-b-pm-claude-p1b`.
- **Step 7 (owed):** the next hourly heartbeat post names all five sessions and lists CC-PM in its watcher and control fields without a CHECK FAILED page.
