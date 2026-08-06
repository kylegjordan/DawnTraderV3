# B-HOTFIX-DEPLOY-BY — Completion Report (#656)

**Owner:** CC-B · **change-class:** `hotfix` · **Date:** 2026-08-06 · **Directive:** Kyle: *"Please fix the deployment owner gap as a hotfix as your next task."*
**Code:** `7db707fd1` (fix + sweep) → `d0e4a65f1` (Langston Step-4 four fixes) · **CI:** 4/4 green on both commits (runs 31102885457, 31104054900). **Langston:** CHANGES-NEEDED at `7db707fd1` (4 items, all real) → **APPROVED at `d0e4a65f1`** (re-read all four himself at the ref); board Review = Approved (set by him).

## Objectives (scope: `B_HOTFIX_DEPLOY_BY_SCOPE.md`)
1. `--by <session>` REQUIRED, refuse-not-guess, charset-validated — ✅; **Step-4 hardened:** a `-*` value is a swallowed flag (refuses, both arms — the unset-`$SESSION` collapse can no longer silently skip `--pre-restart`), duplicate flags refuse. Verified by execution against the reviewer's exact cases.
2. Record: `deployed_by` → `deployed_by_claimed` + `deployed_via` — ✅. Outright replacement Langston-verified safe: record truncated every run, zero readers of the old field.
3. Lock holder names the session — ✅ (concurrency refusals now attribute).
4. Sweep: 7 prescriptive sites → `--by` form; #649 completion report annotated, not rewritten — ✅ (Langston verified all sites independently at the ref).
5. Install from blob + sha256 verify + provoked refusals — ✅ `/usr/local/bin/dt-deploy` == blob at `d0e4a65f1` (sha256 `ef2bd59f…` both sides); four live refusals (no `--by` · bad charset · `-*` swallowed-flag · duplicate) all rc=1 with the right message, all pre-lock (LOCK-ABSENT after).

## Review ledger
Step-4 catches: `--by` swallowed the next flag as its value (reachable via unset variable in the documented full form — severity: silently skipped pre-restart step); duplicate flag silently last-wins; hotfix class's required `CHANGES_AND_FIXES` entry missing (→ FIX-2026-08-06-A); the daily observation procedure still described the gap as open (truth file + mirror fixed); SIM record enumeration incomplete on the added fields (→ #649 row updated — applicability, not class).

## Governance files changed
This report · `B_HOTFIX_DEPLOY_BY_SCOPE.md` · `RUNNING_ISSUES.md` #656 · `CHANGES_AND_FIXES.md` FIX-2026-08-06-A · `SYSTEM_IMPACT_MAP.md` (dt-deploy record fields) · `BUILD_METHOD_PLAYBOOK.md` rules 15+16 (Kyle-directed: playbook brought current — deploy lock + attribution lesson, delivery board) · `MEMORY_CC_B.md` (observation procedure) · 7 swept sites · `#649` completion report annotation. BATCH_CATALOG: entry added at close. Board card: Type Hotfix, Owner Claude New.

## §4c Reconciliation (owner-confirmed at close)
**(1)** Every open Phase-19 batch has a card — unchanged since the #649 close reconciliation yesterday; this hotfix's card was added at Step-3 (Type Hotfix, Owner Claude New). **(2)** Every non-Complete card maps to plan/roadmap/issue work — this card traces to #656 (Kyle's directive). **(3)** This card's column matches reality — Implementation during the work, Complete on this close; the completion report exists at the ref before the card reads Complete. Reconciled by CC-B, 2026-08-06.

