# B-GOV-4 — Governance-checker parser & race repair (scope)

change-class: non_architecture

**Owner:** OLD Claude (CC-A). **Drafted:** 2026-06-26. **Phase-19-adjacent governance-tooling batch** (the next in the B-GOV → B-GOV-2 → B-GOV-3 → B-GOV-4 family). **Touches ONLY `scripts/governance-checker/*`** (parser + decision logic + tests) — zero engine/strategy/regime/signal-pipeline code, hence `non_architecture`. **Scope-seed:** RUNNING_ISSUES #350 (this batch's tracked home) + #397 (absorbed — see OBJ-4, pending CC-B hand-off confirmation).

---

## 0. Why this batch — the cry-wolf problem (Kyle 2026-06-26)

The governance-checker is firing **false alert bursts** that erode trust in the §10.5 queue (Kyle's explicit concern: if it cries wolf on non-issues, everyone learns to ignore it, and we lose the signal). A live audit on 2026-06-26 found that **~22 of ~30 recent governance alerts were false**, from THREE mechanisms — and one of them already caused a bad downstream triage (Langston read the false P19-B6.6 burst as real skipped-docs and nearly re-tasked CC-B to re-write docs that already existed). The three mechanisms:

1. **#350a — mid-subject match.** `extractBatchId(commit.subject)` matches a batch-id ANYWHERE in the subject, not just the leading token. A commit that merely *references* a batch-id for context (`…concretize #350 B-GOV-4 home`) makes the checker grade that batch as if it were freshly closed. Live cost: **8 false alerts** on B-GOV-4 (a batch that had not even started).
2. **#350b — multi-hyphen-name truncation.** The `B-<NAME>` regex stops at the first segment, so `B-TEC-SELFHEAL` is graded as the phantom `B-TEC`. Live cost: **7 false alerts** on a phantom id whose "docs" don't exist (while the real B-TEC-SELFHEAL was fully closed).
3. **#397 — close-before-docset race.** The doc-set gap check fires the instant a batch has ANY governance-bearing commit (`s.hasGovernance`), which can precede the rest of the doc-set landing; the resulting alerts don't reliably auto-clear and get hand-resolved. Live cost: **6 false alerts** on P19-B6.6 (all docs were present at origin within the same window). Signature seen 3×.

---

## 1. Pre-audit findings (grounding — direct reads, §1.a)

Files read: `scripts/governance-checker/{config.mjs, checker.mjs, poller.mjs, poller.test.mjs, backtest.mjs}`.

- **Parser:** `config.mjs` → `BATCH_ID_PATTERNS` (4 ordered regexes) + `extractBatchId(subject)` returns the FIRST match anywhere in the subject. Pattern 4 `/\bB-[A-Z][A-Z0-9]+(?:-\d+)?(?:\.\d+)?\b/` captures `B-GOV` / `B-GOV-2` but NOT `B-TEC-SELFHEAL` (stops after `B-TEC`).
- **Grading entry:** `poller.mjs` → `computeBatchStates(commits)` calls `extractBatchId(c.subject)` per commit and sets `firstCode/lastCode` from ANY commit carrying that id. A later commit that re-mentions a CLOSED batch-id refreshes its `lastCode`, which (via `applyCutoff` keyed on `lastCode`) un-grandfathers it and re-grades it.
- **Doc-set trigger (#397 root):** `poller.mjs` → `decideAlerts`, block (3): the doc-set gap check runs `if (s.hasGovernance)` — i.e. as soon as ANY governance-prefixed file (`1-system-manual/` or `Batch Completion/`) appears in a batch's commits. The completion report (the canonical close marker, conventionally pushed LAST at Step-11) is NOT the trigger — so grading can start before the rest of the doc-set lands.
- **Resolve path (partial #397 cause):** block (3) already RE-RESOLVES a doc-gap when the doc later appears (it iterates the full required set) — BUT only for batches still present in the current `enforceable` set. A batch that drops out of the git-log window or the grandfather filter has its open alerts **orphaned** (never added to `toResolveKeys`), so they re-surface forever until hand-resolved.
- **Tests:** `poller.test.mjs` = pure decision-logic tests (stubbed `docsetCheck`), the right home for new unit tests. `backtest.mjs` = historical-fixture gate (must stay green).

---

## 2. Objectives (numbered, with verification criteria)

**OBJ-1 (#350a) — grade only a LEADING-token batch-id.** A batch-id that appears only mid-subject (a contextual reference) must NOT establish or refresh a gradable batch. Introduce a leading-anchored extractor used by the grading path (`computeBatchStates`), leaving the non-grading callers (e.g. `recentBatchIds` for the backtest display) on the permissive extractor if appropriate.
- **Verify:** unit test — a commit `…references B-GOV-4 mid-subject` yields NO `B-GOV-4` batch state; a commit `B-GOV-4 Step-3: code` DOES.

**OBJ-2 (#350b) — capture the FULL hyphenated name.** Fix pattern 4 so multi-segment `B-<NAME>` ids (`B-TEC-SELFHEAL`, `B-LANGSTON-QUEUE`) are captured whole, with the existing exact-boundary guards preserved (must not regress the `B-GOV` vs `B-GOV-2`, `B-NAMES` vs `B-NAMES.1`, `P19-B6` vs `P19-B6.5a`, `P19-B3` vs `P19-B3b` distinctions already tested).
- **Verify:** unit test — `extractBatchId('B-TEC-SELFHEAL Step-3: …')` === `'B-TEC-SELFHEAL'` (not `'B-TEC'`); all existing `batchIdToFileRegex` boundary tests still pass.

**OBJ-3 (#350c) — don't grade a phantom or a closed-no-reopen id.** A batch-id is gradable only if it is genuinely being worked: it has a **scope file** (the Step-1 artifact proving it's a real batch) and either has **no completion report yet** (in-progress) OR carries an explicit **re-open signal** (a scope file newer than its completion report). A batch-id with a completion report and no re-open signal is treated as CLOSED — graded once for doc-completeness as it closes, but **not re-graded / not un-grandfathered** by a later commit that merely leads with its id. A batch-id with no scope file at all (a phantom / pre-start reference) is not graded.
- **Verify:** unit tests — (a) a closed batch-id (completion report present) re-led in a follow-up commit is NOT re-graded; (b) a phantom id with no scope file is NOT graded; (c) a genuinely new batch (scope present, no completion yet) IS graded against the deadline.

**OBJ-4 (#397 — ABSORBED, CC-B confirmed 2026-06-26) — grade the doc-set on a completion SENTINEL, not on first-governance-commit; resolve orphaned alerts.** (a) Change the doc-set-gap trigger from `s.hasGovernance` to a **completion-sentinel** that by construction cannot exist before the doc-set does — the presence of the batch's completion report (the Step-11 close marker). Until the sentinel is present, the batch is in-progress: the deadline/class/under-declaration checks still run, but the full doc-set gap does NOT fire (no close-before-docset race). (b) Resolve **orphaned** doc-gap alerts: when a batch leaves the enforceable window with open alerts in `state.openAlerts`, sweep-resolve them rather than leaving them to re-surface forever.
- **Verify:** unit tests — (a) a batch with governance commits but NO completion report does NOT raise doc-gap alerts; once the completion sentinel is present and a doc is genuinely missing, it DOES; (b) an orphaned open-alert key for a batch no longer in the window is added to `toResolveKeys`.
- **Boundary:** #397 is CC-B-homed (their #370–399 range). This objective is included ONLY if CC-B confirms the hand-off (proposed 2026-06-26). If CC-B keeps #397, this batch ships OBJ-1–3 and we sequence the shared-file edits.

**OBJ-5 — tests + backtest gate green.** All new behaviors unit-tested in `poller.test.mjs`; `backtest.mjs` OBJ-11 gate stays PASS; `check-tsc-baseline` + `vitest` green on the C:\dev bench; CI 4-green.

**OBJ-6 — verified-correct on real data.** After deploy, re-run the checker core against origin and confirm the previously-false bursts (B-GOV-4 phantom, B-TEC truncation, a simulated close-before-docset) no longer fire, while a genuinely-missing doc on a genuinely-closed batch still does. Retire the now-stale GOVERNANCE_EXCEPTIONS suppression rows (B-GOV-4 open, B-TEC phantom) that this fix makes unnecessary.

---

## 3. Non-objectives / guardrails

- **No change to what the doc-set REQUIRES** per class (the CLASS_DOCSET stays as-is) — only WHEN/WHETHER a batch is graded.
- **No widening of the deadline/grace timer** as the #397 fix (Langston: that only relocates the race — the sentinel is the durable fix).
- **No engine/governance-doc content change** beyond `scripts/governance-checker/*` + the standard B-GOV-4 governance doc-set + retiring the stale exception rows.
- Preserve every existing `poller.test.mjs` + `batchIdToFileRegex` assertion (regression guard).

---

## 4. Governance plan (change-class non_architecture)

Required doc-set: scope (this) + pre_audit + completion_report + BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN (P19-adjacent) + RUNNING_ISSUES (#350 RESOLVED, #397 RESOLVED-or-handed-back) + GOVERNANCE_EXCEPTIONS (retire the now-stale B-GOV-4 open + B-TEC phantom rows). SYSTEM_MANUAL/SIM: **N/A** (governance-tooling, no architecture/component change — to be Langston-confirmed in the completion report).

## 5. Workflow

Step-1 scope (this) → Langston review → Step-2 pre-audit (deeper trace of the eligibility-state machine + orphan-resolution) → Langston → implement → Langston Step-4 diff review → bench green → CI → deploy the checker to its staging clone → Step-7 verify (re-run vs origin + simulate the three false-burst cases) → Langston Step-8 → governance → completion report → Kyle ack.
