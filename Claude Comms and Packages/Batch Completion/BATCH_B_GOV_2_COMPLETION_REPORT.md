# B-GOV-2 — Governance-Checker Activation — Completion Report

**Batch:** B-GOV-2 (CC-A / Claude Old; Langston-reviewed)
**Change-class:** non_architecture (process tooling — checker scripts + systemd units + CLAUDE.md convention; touches no trading code)
**Status:** code SHIPPED + CI green + checker INSTALLED and proven on staging — but **paused after first tick** pending a clean re-activation (see §4). NOT yet live-paging.

---

## 🚨 §9.1 SCAFFOLDING DISCLAIMER
**THIS BATCH DOES NOT YET MAKE THE GOVERNANCE CHECKER ENFORCE. The checker is installed and proven to detect gaps, but its timers are currently DISABLED and it pages no one. It will remain non-enforcing until the calibration in §4 is done (seed closed-batch exceptions + fix shadow-mode surfacing) and `GOV_SHADOW=0` is flipped after a verified-clean tick.**

---

## 1. Objective
Turn the inert B-GOV governance checker (RUNNING_ISSUES #324) into a live, correct watcher: change-class declaration, path-heuristic under-declaration guard, dead-man heartbeat, long-autonomous-batch OPEN handling, graceful git-fetch degradation, and a shadow calibration window — then activate on staging.

## 2. Objectives checklist
| # | Objective | Result | Evidence |
|---|---|---|---|
| OBJ-1 | Change-class declaration (scope-header) | ✅ | `readDeclaredClass()`; fail-closed to architecture + flag; unit-tested |
| OBJ-2 | Path-heuristic under-declaration guard | ✅ | `diffTouchesCoreEngine()` vs grep-verified CORE_ENGINE_PATHS; tested |
| OBJ-3 | Dead-man heartbeat | ✅ | `heartbeat-check.mjs` + heartbeat service/timer; live `[gov-heartbeat] silent=false` |
| OBJ-4 | Long-batch OPEN + malformed-open guard | ✅ | tested (no false deadline on MEMORY-backup sequence; gov-malformed-open) |
| OBJ-5 | ACTIVATE on staging | ◐ PARTIAL | installed + proven (tick ran, real gaps flagged) but **paused** — see §4 |
| OBJ-5b | Activation-day backfill exceptions | ❌ NOT DONE | the miss that caused §4 — seed GOVERNANCE_EXCEPTIONS.md before re-enabling |
| OBJ-6 | CLAUDE.md change-class-in-scope-header convention | ✅ | committed |
| OBJ-7 | Tests + governance | ✅ tests (35 pass) / governance this report |

## 3. Evidence (code)
- **Commit** `ec37b2990` (11 files, +376/-28). **CI** all-4 green (run 27819179036). Tests: 35 pass (`node --test`).
- Installed on staging: dedicated clone `/opt/governance-checker/DawnTraderV3` (HEAD ec37b2990), state dir `/var/lib/governance-checker`, 4 systemd units. Manual tick ran clean (node v20.20): `tick: opened=88 resolved=182`, wrote state.json. Heartbeat verified.
- **Self-validation:** the checker correctly flagged the real `gov-deadline:B-XSTOCK` gap (the missing xStock governance) and its own `gov-classundeclared:B-GOV-2`.

## 4. ★ Activation incident + the two calibration follow-ups (honest record)
**What happened:** I enabled the timer BEFORE seeding the OBJ-5b closed-batch exceptions. The first tick flagged every historical batch (88 entries). They wrote as `state=active, severity=info` — and the §10.5 read protocol surfaces ALL active entries regardless of severity, so they briefly flooded the shared alert queue. Caught via my own per-turn alerts check.
**Mitigation (done):** disabled both timers; resolved all 88 via the system-alerts CLI; queue verified clean (0 active). No lasting harm.
**Two follow-ups required before re-enabling (both §13-homed in RUNNING_ISSUES):**
1. **OBJ-5b exception seeding** — `GOVERNANCE_EXCEPTIONS.md`: declare class + OPEN/CLOSED for every pre-rule / already-closed batch so the first live tick flags only genuine gaps. (Claude New offered a grandfather-vs-backfill read — take it.)
2. **Shadow-surfacing fix** — OBJ-5d assumed shadow=info=non-paging, but §10.5 surfaces info. Reconcile: shadow entries must be genuinely non-surfacing (write acknowledged/non-active, OR §10.5 read skips governance-info while shadow). Then a verified-clean tick → `GOV_SHADOW=0`.

## 5. Governance files changed
- `Claude Comms and Packages/Batch Completion/BATCH_B_GOV_2_COMPLETION_REPORT.md` (this) + `Scope Files/BATCH_B_GOV_2_SCOPE.md` (carries `change-class: non_architecture` — added so the checker stops flagging it)
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `RUNNING_ISSUES.md` (#324 → activated-in-shadow + the two §4 follow-ups homed), `SYSTEM_IMPACT_MAP.md` (checker inert→active component flip)
- `.claude/memory/MEMORY.md` + user-cache + Langston MEMORY (10.b)
- System Manual: N/A (process tooling — Langston-blessed at Step-1).

## 6. Acceptance
Code + tests + install: ✅. Live-enforcing: ❌ pending §4 calibration. RUNNING_ISSUES #324: moved from inert→activated-in-shadow (NOT fully closed until live). Langston Step-8 to confirm the staged state + sign off the calibration plan.
