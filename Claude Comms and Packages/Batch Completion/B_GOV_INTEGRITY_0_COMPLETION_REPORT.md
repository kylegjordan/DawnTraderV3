# B-GOV-INTEGRITY-0 — Completion Report (governance-checker repair)

**Batch:** B-GOV-INTEGRITY-0 · **change-class:** non_architecture · **Owner:** NEW Claude (CC-B) · **Date:** 2026-07-10
**Paired with:** B-GOV-INTEGRITY-1 (OLD Claude — Layer-A evidence gate + provenance; deployed + verified + governance-closed same day). This report covers the **checker** half; the two were co-sequenced (Layer-B before Layer-A) and jointly prove the end-to-end evidence seam.
**Kyle directive (2026-07-10):** "finish fixing the governance system … until it is completed and proven and verified correct."

---

## Objectives checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| F0 | #449 root cause — checker reads the exceptions rulebook at the **graded ref**, not the stale working tree; **fail-loud** on an unreadable/empty rulebook (critical alert + refuse to grade) instead of silently returning `{}` | ✅ **DONE + DEPLOYED + PROVEN** | Commit `3745e48a3`. `readGovernedExceptions()` = `git show ${BRANCH}:GOVERNANCE_EXCEPTIONS.md`, throws on empty. Langston negative test: stale worktree (1 na-skip) vs origin (10) → 6 false alarms suppressed, 0 regression. Live enforcing tick exit 0, 0 false #449 alarms in the store, real gaps kept-not-silenced. `poller.test.mjs` 64/64. |
| F9 | #490 recurrence guard — a **drift canary** that grades the checker's OWN code subtree and raises a visible warning the moment the deployed box lags origin, so it can never again silently fall behind | ✅ **DONE + DEPLOYED + PROVEN both directions** | Commit `f17b5370c`. `checkerCodeDrift()` compares the LOADED-code files (poller.mjs|checker.mjs|config.mjs) at `HEAD` vs `${BRANCH}` — narrowed 2026-07-11 from the whole subtree (Langston Step-4, commit ff4062046) so a README/test/.service-only push can't false-trip a STALE warning while the running logic is byte-identical. Live: current box → 0 drift alerts; forced `GOV_BRANCH=<older-ref>` → 1 alert ("code is STALE vs origin"). Langston re-derived at ref: subtree byte-identical = correct even when the box *commit* lags origin tip (avoids the #492 directory-vs-commit trap). |
| OBJ-1 | Evidence seam (**Layer-B**) — the checker stamps every resolve with a **re-derivable graded-ref sha** as `--evidence`, so OLD Claude's Layer-A hard-gate has an honest token to validate instead of breaking the checker's ~140 resolves/tick | ✅ **DONE + DEPLOYED + PROVEN LIVE (observed)** | Commit `4b46bec57` (+20/−5). `checkerResolveEvidence()` returns the fetch-time `rev-parse ${BRANCH}` sha (`/^[0-9a-f]{7,40}$/i`), else the sanctioned `NO-EVIDENCE-GIVEN` sentinel — never fabricated (#447). CI 4-green; `poller.test.mjs` 64/64. **Langston Step-4 APPROVED** (re-derived both evidence paths at the ref; full CLI→gate chain in-tree; shell-safe). **OLD Claude ran his real `isValidResolutionEvidence()` against the emitted strings — all pass, theater rejected.** See end-to-end proof below. |

**Deploy order (Langston's directional ruling, empirically probe-confirmed):** Layer-B → checker box FIRST (the pre-Layer-A staging CLI harmlessly ignores the extra flag — probed on staging: `resolve <bogus-id> … --evidence <hex>` → "Alert not found", not "unknown option"), THEN Layer-A → staging. Layer-A must never lead (or the old checker's evidence-less resolves break the new hard gate). Order held.

## End-to-end seam proof (observed, not merely composed)
- **Checker EMITS `--evidence <graded-ref sha>`:** sighted tick on the box exit 0, `resolved=143`, each resolve carrying the flag.
- **Live deployed gate ACCEPTS + STORES it:** resolved throwaway alert `48166fa3` through Layer-A-live staging → `state=resolved`, `resolved_by_transport=cli`, `resolution_evidence=773c987dd4e87e805101226d37151e0fc089d1c4`, `resolved_at==acknowledged_at` (no fabricated time), `resolved_by_claimed=cc-b-seam-test`.
- **Stored sha is genuinely re-derivable:** `git show 773c987dd4…:1-system-manual/RUNNING_ISSUES.md` returns the real file — the sha is the SAME ref the checker reads docs at.
- **Reject leg** (no `--evidence`, and `--evidence "looks fine"`) proven live by OLD Claude (Layer-A).
- Independent cross-check: OLD Claude re-read the stored row himself; Langston re-derived the seam at the ref.

## Deploy state
- Checker box (staging `188.245.193.8`, `/opt/governance-checker/DawnTraderV3`): pulled to origin tip; checker subtree byte-matches origin; Layer-B live; drift canary clear.
- Staging app (`/home/deploy/dawntrader`): Layer-A live (`19f80d3b8`) — the checker resolves via this deployed CLI, which enforces + stores evidence.
- CI: all 4 jobs green on each push (Layer-B run on `4b46bec57`; Layer-A run `29112674183`).

## Governance files changed (this batch, CC-B side)
- `scripts/governance-checker/poller.mjs` — the fix (F0 + F9 + Layer-B).
- `Claude Comms and Packages/Scope Files/B_GOV_INTEGRITY_0_SCOPE.md` — scope + per-objective status.
- `Claude Comms and Packages/Langston Design Asks/` — F0, F9, Layer-B Step-4 review packets.
- `Claude Comms and Packages/Batch Completion/B_GOV_INTEGRITY_0_COMPLETION_REPORT.md` — this file.
- `.claude/memory/MEMORY_CC_B.md` (+ user-cache truth copy).
- **Tier-1 shared docs — SEQUENCED behind OLD Claude's B-GOV-INTEGRITY-1 close to avoid the shared-HEAD two-writer hazard:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `RUNNING_ISSUES.md` (#449 / #490 / #447 rows). Added on a clean origin after OLD Claude signals his -1 shared-doc edits are pushed.
- **SIM:** the governance-checker grading logic changed (read-at-ref + drift canary + evidence seam) — if `SYSTEM_IMPACT_MAP.md` documents the governance-checker component, note these; CC-B to take that edit (own code).

## OBJ-0 — auto-redeploy path — ✅ DONE + FULLY PROVEN (2026-07-11, Kyle "do it now" directive; Langston + OLD Claude Step-4 approved)
The checker box now self-updates its own code before each tick, so a pushed fix reaches the enforcer with no manual pull. Implemented as a **systemd drop-in** on the box (`/etc/systemd/system/governance-checker.service.d/20-auto-redeploy.conf`, alongside the existing `go-live.conf`; box-side config like go-live, recorded here + in SIM):
```ini
[Service]
ExecStartPre=-/usr/bin/git -C /opt/governance-checker/DawnTraderV3 fetch --quiet origin
ExecStartPre=-/usr/bin/git -C /opt/governance-checker/DawnTraderV3 merge --ff-only origin/migration/aws-supabase
```
**Design (Langston + OLD Claude approved):** `ff-only` so it can NEVER create a merge commit or diverge (a hand-commit in the clone fails loud instead of silently merging); leading **`-` = non-fatal** so a delivery failure NEVER aborts enforcement — the tick runs the prior code and F9's drift canary / gov-fetch-failed flag the lag. Runs as `deploy` (repo is deploy-owned; fetch verified). State survives (`/var/lib/governance-checker/state.json` is outside the repo). Plus Langston add #1: `poller.mjs` tick() now emits `[gov-checker] poller running at deployed HEAD <sha>` every tick (positive auditability, not only the canary's negative signal). Commit `5976a1e65`.

**Acceptance-tested live, all three legs + box left clean:**
- **Happy path (#454 proof):** box was `ba98f3e57`; one tick auto-advanced it to origin tip `5976a1e65` with NO manual pull; subtree == origin, F9 silent.
- **Fail-loud:** fault-injected a committed checker-subtree divergence (HEAD `d104236b2`, subtree `85e2ee4c` ≠ origin `d41c3a91`). Next tick: `merge --ff-only` REFUSED it (box not force-updated), `ExecMainStatus=0` (non-fatal — enforcement did not abort), and **F9 raised the drift alert `e0d387dd`** ("code is STALE vs origin"; lands `scheduled` → dispatcher promotes to `active`).
- **Auto-recovery:** clone force-reset to clean origin tip → next tick ff-succeeded → F9 auto-**resolved** `e0d387dd` with evidence `5976a1e65` (re-derivable; the seam working on F9's own alert). Box final: HEAD==origin, clean, healthy.
- **Invariant on record (Langston):** F9 watches committed HEAD, which equals the running working-tree file ONLY because the box tree is clean and ff-only never dirties it.

⇒ **#449 is now fully resolved** (F0 read-at-ref + F9 canary + Layer-B seam + OBJ-0 delivery path all done + proven); no residual open objective on B-GOV-INTEGRITY-0.

## Sign-offs
- Langston Step-4: **APPROVED** (Layer-B). Step-8 second-pass: pending (paired with B-GOV-INTEGRITY-1 Step-8).
- Kyle acknowledgment: pending.
