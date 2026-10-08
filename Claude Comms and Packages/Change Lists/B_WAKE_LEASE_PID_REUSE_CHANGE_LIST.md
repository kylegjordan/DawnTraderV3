# B-WAKE-LEASE-PID-REUSE (#1179, row 1w) — CHANGE LIST (Step 4, r1)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) THAT CLASS'S DOC SET** | SCOPE — **present**, `Claude Comms and Packages/Scope Files/B_WAKE_LEASE_PID_REUSE_SCOPE.md` (`c31d13ed9`, approved with C1-C6) · PRE_AUDIT — **present**, `…/B_WAKE_LEASE_PID_REUSE_PRE_AUDIT.md` (`ab4bbaa45`, approved with six in-commit conditions) · COMPLETION_REPORT — **absent**, Step 11 · BATCH_CATALOG, PHASE_HISTORY — **absent**, Step 10 · SYSTEM_MANUAL — **judged N/A**: nothing under server/, client/ or shared/ · SYSTEM_IMPACT_MAP — **owed at Step 10**: the wake block (the lease's holder decision) · CHANGES_AND_FIXES — **judged N/A**: crew tooling, no trading-system bug · RUNNING_ISSUES — **present** (`#1179`) · POST_AUDIT_ROADMAP, DELETED_COMPONENTS_LOG, ADJUSTMENT_FRAMEWORK — **judged N/A**: no roadmap item, nothing removed, no parameter · SPRINT_TO_LIVE_PLAN row 1w — **present** · memory + task list — Step 10 · runbook — Step 10 |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_WAKE_LEASE_PID_REUSE_PRE_AUDIT.md` at `ab4bbaa45` (APPROVED 2026-10-08) |

**Code:** review branch `migration/b-wake-lease-pid-reuse` at `2bfe98d4d` — NOT on `migration/aws-supabase`. 4 files, +177/−14: `comms-infra/laptop/cc-wake-filter.py`, `scripts/analysis/test-wake-lease-verdict.py` (new), `scripts/analysis/test-wake-lease.py`, `.github/workflows/ci.yml`.

## Your six Step-2 conditions, where each landed
| C | what | where |
|---|---|---|
| C1 | `denied` keys on error **5 exactly**; every other non-87 error stays alive-not-denied | `_proc`: `return (False, None, False) if err == 87 else (True, None, err == 5)` |
| C2 | the lease suite asserts the OBSERVED code on pid 4 | `test-wake-lease.py`: `#1179 C2 the probe on pid 4 is refused with error 5 (handle=False, error=5)` — PASS |
| C3 | `_proc`'s docstring no longer says every non-87 failure reads alive without qualification | rewritten in the same commit: denied is 5 only; what it MEANS for a holder is `holder_verdict`'s |
| C4 | P4 grades the REPO copy; green CI is not the laptop | the test header and the CI step comment both say so; P6's sha256 equality is the binding (`#1004`) |
| C5 | the control's disagreeing rows are stated BEFORE the run and must match exactly | `PRESTATED = {(alive, none, recorded, denied), (alive, equal, recorded, denied)}`; `disagree == PRESTATED and len > 0` |
| C6 | a lease with no creation time announces itself | `_lease_create`: `WARNING: could not read loop N's creation time — this lease cannot detect pid reuse; … see the runbook` (runbook at Step 10) |

## The decision, pure — `holder_verdict(alive, created, loop_created, denied)`
1 not alive → dead · **2 denied AND `loop_created` recorded → dead (#1179)** · 3 `created` unknown → alive (fail-safe; covers C1's producer B, an open that succeeded with `GetProcessTimes` failing) · 4 `loop_created` unknown → alive (OBJ-6, ruled) · 5 equal → alive, else dead (reuse). `_holder_state(lease)` = `_proc` + this, returning `(alive, identity confirmed)`; `_holder_alive` = its first half (callers `:474`→ now the gate, `:528` `_lease_ours` unchanged in behaviour).

## STUCK — branched (C2 of Step 1)
Confirmed identity (creation time matches the lease) → today's text, *"stop that task or process N"* (the `#1140` case). Unconfirmed → *"a lease names loop N … its identity is NOT confirmed — check that process N is this session's bash arm loop (tasklist) before stopping anything; if it is not, move <lease> aside and re-arm"*. **STAND-DOWN keeps one wording** for both — it directs no action on the pid (a decision, stated in a code comment).

## Tests
- **`test-wake-lease-verdict.py` (new; CI step "Wake lease verdict tests (pid reuse)")** — `holder_verdict` read out of the repo copy with `ast` (no import of the script). 24 rows (IMPOSSIBLE ones labelled) + 4 named cases: **29 passed, 0 failed**. Control: the transcribed pre-fix rule disagrees on exactly the 2 pre-stated rows. Mutation (drop rule 2): 4 fail — the 2 table rows, the named #1179 case, the control (`got []`).
- **`test-wake-lease.py` (Windows; reported fact to you)** — new: C2 error-5 assertion; #1179 OBJ-1 (lease `{loop: 4, loop_created: 134359110427768539}` → taken over, rc 0); OBJ-3 unconfirmed STUCK wording; OBJ-3 control (a confirmed holder still says "stop"). **ALL PASS. Against the installed pre-fix filter: the two #1179 cases FAIL, the control and the C2 assertion pass.**
- `test-wake-filter-cuts.py`, `test-wake-state-unsaved.py`, `test-wake-follow.py`: ALL PASS.
- **CI on the review branch:** run `37740328699` at `2bfe98d4d` — TypeScript Check ✅ · Test Suite ✅ (step "Wake lease verdict tests (pid reuse)": 29 passed, 0 failed) · Build ✅ · Docker Build ✅.

## INSTALL (Step 6)
By hand: `~/.claude/cc-wake-filter.py` = the blob at the landed sha (sha256), CC-A re-armed on it; the other three sessions told once — they pick it up at their next re-arm.

## JUDGEMENT CALLS TO ATTACK
1. `_holder_state` returns identity-confirmed only when `created == loop_created` — a holder alive by rule 3 or 4 is "alive, unconfirmed", so STUCK there names the check rather than "stop".
2. The OBJ-3 control uses a live python dummy as the confirmed holder (its creation time recorded at take) — not a bash loop; identity is what is tested, not the process name.
