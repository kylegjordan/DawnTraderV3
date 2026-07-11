# B-GOV-INTEGRITY-0 — Pre-Implementation Audit (governance-checker repair)

**change-class:** non_architecture · **Owner:** NEW Claude (CC-B) · **Authored:** 2026-07-11 (consolidating the pre-implementation analysis performed during the 2026-07-10 Kyle-directed root-cause investigation — the audit substance below was done *before* the F0/F9/Layer-B edits; this document records it honestly at close, it is not a backdated artifact).

> Honesty note (§9 / Kyle NO-forgery rule): the checker repair was emergency-directed by Kyle on 2026-07-10. The root-cause analysis, SIM read, blast-radius trace, and risk enumeration below were genuinely performed inline during that investigation (recorded live in `RUNNING_ISSUES.md` #449/#490/#447 and `Langston Design Asks/GOVERNANCE_CHECKER_STALE_LEDGER_ROOT_CAUSE.md`). This file consolidates that pre-implementation work into the required Step-2 document; the dates on the analysis are 2026-07-10, the authoring of this consolidated file is 2026-07-11.

---

## 1. Component under change
`scripts/governance-checker/poller.mjs` — the governance checker's tick logic. NO trading-path code (no strategy / regime / signal-pipeline / SQE / TEC / EV-math / execution) — hence `non_architecture`.

## 2. SIM consultation (§2 mandatory)
Read `SYSTEM_IMPACT_MAP.md` governance-checker entries (the "B-GOV UPDATE 2026-06-17" + "B-GOV-2 UPDATE 2026-06-19" blocks). Established facts that shaped the design:
- The checker runs as a **systemd timer on STAGING** (`188.245.193.8`), NOT inside the app node process (isolated to avoid the event-loop stall), from a **dedicated local clone** `/opt/governance-checker/DawnTraderV3` (deploy user; NOT the gdrive FUSE mount, NOT the live app checkout).
- It reads git history + governance docs and writes/resolves `governance`-category alerts via the LOCAL `system-alerts` CLI (`add`/`resolve`), reusing `addAlert`/`resolveAlert` + the §10.5 per-turn surfacing + Discord delivery — it does NOT build a parallel alert path.
- It dedupes via its OWN state file (logical-key → alert-id) and carries the logical key in `--metadata`.
- The 4 self-declared inputs (batch-id, change-class, open-state, umbrella-namespace) fail-closed to the strict default and are audited in `GOVERNANCE_EXCEPTIONS.md`.

## 3. Per-component dependency trace
- **Upstream (inputs):** the origin git ref (`origin/migration/aws-supabase`, moved by `git fetch` each tick); `GOVERNANCE_EXCEPTIONS.md` (the exceptions rulebook); the batch commits in the log window.
- **Downstream (consumers):** `system-alerts.jsonl` store on staging → §10.5 per-turn surfacing → Discord delivery → CC/Langston/Kyle. A wrong grade => a false alarm (alert fatigue) or a missed real gap.
- **Shared state:** the checker's `GOV_STATE_FILE` (openAlerts logical-key→id map); the alert store.
- **Background execution:** 30-min systemd oneshot timer (`governance-checker.service` + `.timer`), `GOV_SHADOW=0` (enforcing), `User=deploy`.
- **Blast radius:** grading correctness is the whole function. The three defects and their fixes:

## 4. Root cause & the three fixes (the pre-implementation finding)
- **#449 (F0) — the checker was BLIND.** `loadExceptions()` read `GOVERNANCE_EXCEPTIONS.md` via `readFileSync` from the FROZEN local clone worktree (~388 commits stale, ledger mtime weeks old) while commits + `docPresent` graded at the live ref. ⇒ every exceptions row added since the last manual box-deploy was INVISIBLE → false doc-gap alarms + a real risk of silencing genuine gaps. Also: an unreadable ledger returned `{}` (no suppression) instead of failing loud. **Fix:** read at the graded ref (`git show ${BRANCH}:<path>`) + THROW on empty/unreadable (critical alert + refuse to grade).
- **#490 (F9) — silent recurrence.** The same clone had been patched once by hand (B-GOV-4, Jun-19) and drifted again in two weeks, because nothing keeps the box current (measured: no `ExecStartPre`, no pull, no cron). ⇒ a fix can land at origin, green + reviewed, while the box runs old logic indefinitely. **Fix:** a drift canary grading the checker's OWN code subtree (`HEAD:scripts/governance-checker` vs `${BRANCH}:…`) → visible `gov-code-drift` warning on divergence. (Scoped to the checker's code, NOT the repo, so doc pushes — thousands — never trip it: the #492 directory-vs-commit trap.)
- **#447 (OBJ-1 / Layer-B) — resolves had no basis.** A resolve recorded no author/time/evidence, so a wrongly-cleared alert was undetectable forever. **Fix (seam with OLD Claude's Layer-A):** the checker stamps every resolve with the re-derivable graded-ref sha as `--evidence` (the SAME ref it reads docs at, so `git show <sha>:<doc>` re-confirms what it saw), else the sanctioned `NO-EVIDENCE-GIVEN` sentinel — never fabricated.

## 5. Risks considered before implementing
1. **Reading at the ref needs `git fetch` each tick** (network dependency) → the fetch is already guarded; a failed fetch flags + exits WITHOUT grading off stale state (no false alarms on a blind tick), escalating info→warning after 3 consecutive.
2. **Fail-loud must not itself become a false-alarm source** → it fires ONLY on a genuinely empty/unreadable rulebook, auto-resolving on a clean read.
3. **Layer-B must not break the ~140 resolves/tick** → the evidence flag is co-sequenced behind OLD Claude's Layer-A hard-gate; deploy order Layer-B→box FIRST (old CLI tolerates the extra flag — probe-confirmed), then Layer-A→staging. Fallback to `NO-EVIDENCE-GIVEN` if the sha can't be computed — never a fabricated ref.
4. **Drift canary scope** → the checker's OWN code subtree hash, not the repo commit count (docs push constantly; checker code changes ~5×/quarter).
5. **Shared-HEAD hazard** (two CC sessions edit one GDrive working tree) → surfaced during this arc (#460); mitigation adopted (pre-push `git log origin..HEAD` enumeration).

## 6. Verification plan (what "proven" requires)
- `node --check` + `poller.test.mjs` green; tsc baseline no regressions; CI all-4 green per push.
- Langston Step-4 on every diff (read at the ref, not the packet gloss).
- F0: negative test (stale worktree vs origin) suppresses exactly the false alarms, 0 regression; live enforcing tick exit 0, false alarms absent from the store, real out-of-window gaps kept-not-silenced.
- F9: drift canary fires on forced older `GOV_BRANCH`, silent on a current box.
- Layer-B: seam observed end-to-end — a resolve carrying the graded-ref sha stored as `resolution_evidence`, re-derivable via `git show <sha>:<doc>`; reject leg (no-evidence / theater) proven.

## 7. Governance touched (planned)
BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#449/#490/#447), SIM (checker read-path), MEMORY_CC_B, scope, this pre-audit, completion report. SYSTEM_MANUAL judged N/A (checker infra = SIM-scope, not strategy/regime/signal-pipeline/math).
