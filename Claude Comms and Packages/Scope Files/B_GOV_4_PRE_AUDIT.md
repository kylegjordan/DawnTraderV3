# B-GOV-4 — Pre-implementation audit

change-class: non_architecture

**Owner:** OLD Claude (CC-A). **Drafted:** 2026-06-26. Companion to `B_GOV_4_SCOPE.md`. Deeper trace of the exact code mechanics behind the three false-burst mechanisms, the eligibility-state-machine to introduce, and the blast-radius (all inside `scripts/governance-checker/`).

---

## 1. Blast radius (SIM consult)

The governance-checker is a **standalone tool subsystem** (`scripts/governance-checker/`), run by its own systemd timer on the staging clone, talking to the §10.5 alert queue via the `system-alerts` CLI. It has **no upstream from / downstream to the trading engine** — it reads git history + repo doc files and writes governance-category alerts. SIM scope: it is a tool, not a runtime component; the SIM "Discord Comms Fabric" / alert-queue entries are the nearest neighbors and are unaffected (this batch changes only WHICH batches get graded + WHEN, not the alert transport). **SYSTEM_MANUAL: N/A** (no architecture/strategy/regime/filter/signal-pipeline/math). **SIM: N/A** (no component added/removed/re-keyed; the checker's existence is already mapped). Both N/A to be Langston-confirmed at close (§9 applicability judgment, stated not skipped).

Files in play (all `scripts/governance-checker/`):
- `config.mjs` — `BATCH_ID_PATTERNS`, `extractBatchId`, `batchIdToFileRegex`, doc registry, class doc-sets.
- `checker.mjs` — `docPresent` / `findGlobDoc` / `findEntryDoc`, `checkBatchDocset`, `readDeclaredClass`, `recentBatchIds`.
- `poller.mjs` — `computeBatchStates`, `applyCutoff`, `decideAlerts` (the decision core), `tick` (the live IO wrapper).
- `poller.test.mjs` — pure decision-logic unit tests (the home for new tests).
- `backtest.mjs` — historical-fixture gate (must stay PASS).

---

## 2. Exact mechanics of each defect (traced)

### 2.1 #350a — mid-subject match
`config.mjs:extractBatchId(subject)` loops `BATCH_ID_PATTERNS` and returns `subject.match(re)[0]` — the FIRST match **anywhere** in the string (the patterns use `\b…\b`, not `^…`). `poller.mjs:computeBatchStates` calls it per commit and keys batch state on the result. So a commit whose subject merely *contains* a batch-id (a contextual reference) creates/refreshes that batch's state. Live: `…concretize #350 B-GOV-4 home` → batch `B-GOV-4` materialized with that commit's date as `lastCode`.

### 2.2 #350b — multi-hyphen truncation
`BATCH_ID_PATTERNS[3]` = `/\bB-[A-Z][A-Z0-9]+(?:-\d+)?(?:\.\d+)?\b/`. The optional tail only matches `-<digits>` (`B-GOV-2`) or `.<digits>` (`B-NAMES.1`) — NOT a second ALPHA segment. So `B-TEC-SELFHEAL` matches up to `B-TEC` and stops (`\b` falls between `C` and `-`). `extractBatchId('B-TEC-SELFHEAL …')` → `'B-TEC'`, a phantom.

### 2.3 #350a/b interaction with the grandfather cutoff
`poller.mjs:applyCutoff` keeps a batch iff `lastCode >= ENFORCEMENT_CUTOFF_MS`. Because `computeBatchStates` refreshes `lastCode` from ANY commit carrying the id (including a mid-subject reference or a truncated phantom), a long-CLOSED batch re-mentioned in a recent commit gets a fresh `lastCode` → passes the cutoff → is re-graded as if just closed. This is the mechanism that un-grandfathers B-NEW-40 (led its soak-follow-up subject) and resurrects phantoms.

### 2.4 #397 — close-before-docset race
`poller.mjs:decideAlerts` block (3) runs the doc-set gap check `if (s.hasGovernance)`. `classifyCommit` sets `governance=true` if ANY file is under `1-system-manual/` or `Batch Completion/`. So the FIRST governance-bearing commit (e.g. a `BATCH_CATALOG.md` touch) flips `hasGovernance` and triggers the FULL required-doc-set check — even though the completion report / SIM / System-Manual updates may land in later commits seconds-to-minutes after. Result: a transient "missing doc" burst that is true only inside the close window.

### 2.5 #397 — orphan (the reason the burst doesn't auto-clear)
Block (3) DOES resolve a doc-gap when the doc later appears — BUT only for batches present in the current `enforceable` list. `tick` resolves keys via `state.openAlerts[k]` only for keys emitted in `toResolveKeys` THIS tick. If a batch leaves the window (its commits age past the `-n300` git-log slice, or its refreshed `lastCode` later ages below the cutoff again, or all its commits scroll out), `decideAlerts` never iterates it → its still-open `state.openAlerts` keys are never added to `toResolveKeys` → the alerts are **orphaned**: they sit in the §10.5 queue acked-but-unresolved and re-surface on the dispatcher's back-off forever, until hand-resolved. This is why the P19-B6.6 set re-surfaced at 12:24Z despite the docs being present since ~02:37Z.

---

## 3. Design to implement (recommended — Langston Step-1 to confirm/refine)

### OBJ-1 (#350a) — leading-token extraction for the GRADING path
Add `extractLeadingBatchId(subject)` to `config.mjs`: anchor each pattern at `^\s*` so only a batch-id at the START of the subject is returned (the declared own-batch position). `computeBatchStates` uses `extractLeadingBatchId`. Non-grading callers that want any-position matching (`checker.mjs:recentBatchIds`, used only for the backtest display table) stay on `extractBatchId`. This makes a mid-subject reference a no-op for grading.

### OBJ-2 (#350b) — full-name capture
Change `BATCH_ID_PATTERNS[3]` to allow repeated alpha/alnum segments: `/\bB-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*(?:\.\d+)?\b/`. Verify it still:
- captures `B-TEC-SELFHEAL`, `B-LANGSTON-QUEUE` whole;
- captures `B-GOV-2` whole (the `-2` matches the alnum segment);
- does NOT over-capture across a space (the run is hyphen-joined, `\b` stops at whitespace);
- leaves patterns [0]–[2] (P-form, B-NEW, B79.x) untouched.
`batchIdToFileRegex` is unchanged — its job is the filename match given an id, and the existing boundary tests (C8) must all stay green.

### OBJ-3 (#350c) — pin a closed batch's enforcement time to its close event (NOT a scope-required gate)
**Revised after the §5 empirical check (Langston's flagged cry-silence risk is REAL).** Many genuinely-closed batches have a completion report but NO in-repo scope file (B_DISCORD_CUTOVER_333, B_XSTOCK_GLOBALS, B-NEW-34, BATCH_24, …). So a "scope-file-required" eligibility gate would wrongly un-grade legitimately-closed batches → cry-silence (worse than cry-wolf, Langston). **Dropped.** Instead, fix the actual mechanism that caused the B-NEW-40 false re-grade:

The observed bug (§2.3): a later commit leading with a CLOSED batch-id refreshes that batch's `lastCode` to "now" → `applyCutoff` un-grandfathers it → re-graded. **Fix: a closed batch's enforcement timestamp is ANCHORED at its completion-report commit time and is immune to later re-mentions.** Concretely, in `computeBatchStates`/the decision layer:
- Compute, once, a shared **closed-detection primitive** `completionReportCommitTime(id)` — the git **first-ADD commit time**: the commit that CREATED the batch's completion report (`git log --reverse --diff-filter=A --format=%cI -- <path> | head -1`), NOT its latest touch. **(Langston Step-2 #1 — must-fix.)** Using `-1` (most-recent touch) would re-introduce the un-grandfather bug through a different door: a later "Governance backfill" / doc-reorg commit that edits an already-closed batch's report would bump the close timestamp forward and, if that edit lands ≥ cutoff while the real close was < cutoff, re-grade the batch. The first-ADD is immutable regardless of later edits. Deterministic git time, NOT filesystem mtime (gdrive FUSE lag, §18). Resolved via the id↔filename mapping in `checker.mjs` — the SAME underscore/hyphen transform `batchIdToFileRegex` applies (reused, not re-rolled), so OBJ-3/4 detection and OBJ-2's capture cannot disagree on an id. (Note: OBJ-2 broadens only the id-CAPTURE pattern `BATCH_ID_PATTERNS[3]`; it does NOT modify `batchIdToFileRegex`.) Null if no completion report exists.
- A batch is **closed-quiescent** iff `completionReportCommitTime(id)` is non-null AND there is no scope file with a LATER commit time (a later scope = explicit re-open → re-anchors to the new work).
- For a closed-quiescent batch, its effective `lastCode` for the grandfather cutoff is **pinned to the completion-report commit time** (the real close event), so a recent re-mention cannot push it past the cutoff. A batch that closed recently (completion time ≥ cutoff) is still graded once at close; a batch that closed long ago stays grandfathered; a re-opened batch re-enrolls. This is the B-NEW-40 fix with zero cry-silence.

**One `isGradable(id, commits)` predicate (Langston (a)):** OBJ-1's leading-anchor + OBJ-3's closed-quiescent/anchor logic live in ONE predicate consumed by the decision layer — never two independent filters that can disagree. **No scope-required gate.** A residual: a LEADING typo'd batch-id (e.g. `B-FOO-BR Step-1 …`) with code would fire a deadline alert (cry-wolf) — accepted, because it is rare, self-evident (a malformed/typo'd close surfaces itself), and the alternative (scope-required) trades it for the far worse cry-silence on real closed batches.

### OBJ-3/4 shared primitive (Langston (a), both verdicts)
`completionReportCommitTime(id)` is the SINGLE "is it closed" detection primitive. OBJ-3 (closed-quiescent anchor) and OBJ-4 (doc-set sentinel) BOTH consume it — no split-brain on what "closed" means. Defined once in `checker.mjs` (it already owns `findGlobDoc`/the id↔filename mapping); git commit time via `git log -1 --format=%cI -- <path>` at GOV_REF.

### OBJ-4 (#397) — completion-sentinel trigger + order-independent auto-resolve + orphan sweep
- **Sentinel (semantics, not push-order — Langston (b) both verdicts):** change block (3)'s trigger from `s.hasGovernance` to `completionReportCommitTime(s.batchId) !== null` — the completion report is the Step-11 close ARTIFACT (mandatory by §4: no report → batch rejected), so it is the right sentinel because of what it MEANS, not because it happens to be pushed last. **No explicit implementer-emitted close-marker** (Langston, both verdicts): a new manual emission step is itself forgettable (cry-silence) and a second close-state that can disagree with the report = the split-brain we're killing. Reuse the report (already required, already exists).
- **Durability = order-independent AUTO-RESOLVE, not convention (Langston (b)):** the safety of report-as-sentinel does NOT rest on "report pushed last." If the report lands one commit BEFORE a trailing doc, the doc-set gap fires — and MUST auto-clear when the trailing doc appears moments later. Block (3) already re-resolves for in-window batches (it iterates the full required set every tick); OBJ-4b extends that to orphans. **Order-independence is the contract** — the thing to hammer at Step-4. NOT solved with a grace timer (that only moves the race).
- **Deadline stays independent of the sentinel (Langston, both verdicts — the no-report-goes-dark hole):** a batch that NEVER writes a completion report would never get doc-set-graded under the sentinel. The backstop is the DEADLINE alert (block 1), which fires on code-without-governance and is INDEPENDENT of the sentinel — confirmed: block (1) keys on `s.hasGovernance` + `lastCode`, not on the completion report. So a no-report/abandoned batch still surfaces via the deadline; it does not go dark. (Class 0a + under-declaration 0b also still run pre-sentinel.)
- **Orphan sweep — RE-VERIFY, never blind-resolve (Langston Step-2 Finding 2 — binding):** in `tick`, for any `state.openAlerts` key whose batch-id is no longer in this tick's `enforceable` set, **re-check the underlying condition at GOV_REF before resolving** — "absent from this tick's `-n300` window" ≠ "gap fixed." A genuinely-missing doc on a closed batch that simply aged out of the window must NOT be blind-swept (that would be cry-silence on a real gap). Mechanism: for an orphaned `gov-docgap:<bid>:<doc>`, re-run `docPresent(bid, doc)` (+ N/A check) at GOV_REF — which reads the whole tree, not the commit window — and resolve ONLY if now present/N/A; if still missing, KEEP it surfaced. (`checkBatchDocset`/`docPresent` already work outside the window since they `git show`/`ls-tree` at the ref.) Same re-verify discipline for `gov-deadline:*` (resolve iff governance now present) / `gov-classundeclared:*` (resolve iff class now declared). Log each sweep decision (resolved-verified vs kept-still-missing). This is what makes the P19-B6.6 orphan clear (docs ARE present → resolved) without silencing a real aged-out gap.
- **New test (Langston (b)):** *report pushed BEFORE a trailing doc-set file → gap fires then self-resolves within the window* — DISTINCT from *report present + doc genuinely never lands → stays open*. This proves the sentinel is safe under a convention violation.

---

## 5. Empirical findings (verified against origin, 2026-06-26 — Langston's required pre-code checks)

- **Commit-subject convention (the OBJ-1 cry-silence risk): ZERO conventional-commit prefixes** (`feat:`/`fix:`/`chore(x):`) in the last 400 origin subjects. Real convention: batch commits LEAD with the bare batch-id (`P19-B6.6 Step-1:`, `B-TEC-SELFHEAL Step-3:`, `B-DIAG-387 (#387):`); non-batch commits lead with a plain descriptor (`MEMORY_CC_B:`, `Governance backfill:`, `RUNNING_ISSUES #397:`). ⇒ **A pure leading-anchor is SAFE** — no `type(scope):` prefix to skip. (Langston's biggest hold-risk is retired by data.) The anchor must still allow a batch-id followed immediately by non-alnum context (`B-DIAG-387 (#387):` → leads with `B-DIAG-387`).
- **Sub-batches DO carry their own scope files:** `P19_B6_5c_SCOPE.md`, `P19_B6_5e_SCOPE.md`, `P19_REORG_B2_1_SCOPE.md`, `REORG_B3.3X_SCOPE.md`, etc. all exist — so the sub-batch-inheritance worry does not bite (moot now anyway, since OBJ-3 no longer requires a scope file).
- **Many CLOSED batches have NO in-repo scope file** (B_DISCORD_CUTOVER_333, B_XSTOCK_GLOBALS, B-NEW-34, BATCH_24, B_NAMES_1, …). ⇒ **scope-required eligibility is UNSAFE** (cry-silence) — the reason OBJ-3 was redesigned to pin-on-completion-time instead.
- **Observed adjacent coverage gap (proactive surface, §9 — NOT in B-GOV-4 scope):** the `reorg-B<n>` lowercase batch-ids (`reorg-B4`, `reorg-B3.3x`) match NONE of the `BATCH_ID_PATTERNS` (all require uppercase `B`/`P`), so the checker never grades reorg-* batches at all — a pre-existing cry-SILENCE/coverage gap, orthogonal to the #350/#397 false-positives. **Homed:** flag to CC-B + a RUNNING_ISSUES entry as a separate checker-coverage follow-up (§9.4); do NOT expand B-GOV-4 to chase it (scope creep + the exact cry-silence-risk class Langston warned about — needs its own deliberate handling).

---

## 6. Edge-case dispositions (Langston (c), both verdicts)

| Edge case | Disposition |
|---|---|
| **Conventional-commit prefix** (`fix: B-GOV-4 …`) inverting OBJ-1 → cry-silence | **N/A by data** — zero such prefixes in 400 commits (§5). Leading-anchor safe. Documented intentional. |
| **Merge/revert subject** (`Merge B-GOV-4 into…`) → "Merge" leads → not graded | **Intentional** — a merge/revert is not a batch close; not grading it is correct. Stated so it reads deliberate, not a gap. |
| **Re-open timestamp basis** (scope newer than completion) | **git first-ADD commit time** for BOTH (`git log --reverse --diff-filter=A --format=%cI`), never filesystem mtime (gdrive FUSE lag, §18) and never `-1`/latest-touch (Langston Step-2 #1 — a later edit must not move either anchor). Re-open = scope's add-commit STRICTLY after the report's add-commit. |
| **Scope + completion in the SAME commit** | Deterministic tie-break: same commit time ⇒ NOT a re-open (re-open requires scope STRICTLY newer than completion). A close that ships scope+completion together is just a close. |
| **Sub-batch id leading a parent's commit** (`P19-B6.5a` vs `P19-B6`) | OBJ-2 full-name capture + the existing `batchIdToFileRegex` boundary guards keep them distinct. Explicit test added (already covered by the C8 boundary block; add a capture test for the leading-extract path). |
| **Closed batch whose scope file is out of the git-log window** (squashed/old) | **No longer relevant** — OBJ-3 dropped the scope-required gate; closed-detection is via the completion report (an `entry`/`file-glob` lookup over the whole tree at GOV_REF, not the `-n` commit window). Test: a closed batch with no in-window scope is still correctly treated as closed (not re-graded, not falsely flagged). |
| **Abandoned batch** (scope, code, no completion, work dropped) | Grades against the **deadline** forever (correct — it IS an unmet obligation). Disposition (§13): it is a real nudge, not a false positive — close it or declare it OPEN/abandoned in `GOVERNANCE_EXCEPTIONS.md`. Named here so it is not an open loop; no code change (the deadline alert is the intended behavior). |
| **Leading typo'd batch-id** (`B-FOO-BR Step-1 …`) | Accepted residual cry-wolf (rare, self-evident). Chosen over scope-required (which would cause cry-silence on real closed batches). |
| **Scope-file detection mapping** | Reuse `batchIdToFileRegex` (the OBJ-2-fixed id↔filename transform) — one mapping, so OBJ-2 and OBJ-3/4 cannot disagree on the same id. |

---

## 7. Implementation surface (files + functions to touch)
- `config.mjs`: broaden `BATCH_ID_PATTERNS[3]` (OBJ-2); add `extractLeadingBatchId(subject)` (OBJ-1).
- `checker.mjs`: add `completionReportCommitTime(id)` + `scopeCommitTime(id)` (shared closed-detection primitive, git commit time, reuse `findGlobDoc` mapping).
- `poller.mjs`: `computeBatchStates` uses `extractLeadingBatchId`; introduce `isGradable(...)` / closed-anchor logic feeding `applyCutoff`; `decideAlerts` block (3) triggers on the sentinel not `hasGovernance`; `tick` orphan-sweep.
- `poller.test.mjs`: all new unit tests; preserve every existing assertion.
- `backtest.mjs`: unchanged; must stay PASS.

No engine/governance-doc content change beyond the tool + the standard B-GOV-4 doc-set + retiring the stale exception rows.

### OBJ-5/6 — tests + verify
- `poller.test.mjs` (inject close-detection results the same way existing tests inject `docsetCheck`, so the decision logic is git-free):
  - **leading-token:** mid-subject ref → no batch state; bare-leading id → state.
  - **multi-hyphen:** `extractBatchId('B-TEC-SELFHEAL Step-3 …')` === `'B-TEC-SELFHEAL'`; preserve `B-GOV-2`, `P19-B6.5a`, `B-NAMES.1`, `P19-B3b` distinctions (existing C8 block stays green).
  - **closed-no-reopen (pin-on-ADD-commit):** a batch whose completion-report ADD-commit is < cutoff, re-mentioned (leading) in a recent commit → enforcement stays anchored at the ADD-commit → NOT re-graded/un-grandfathered. AND: a later EDIT to that report does not move the anchor.
  - **re-open:** a scope ADD-commit strictly after the report's ADD-commit → re-enrolled; a mere later TOUCH of an existing scope is NOT a re-open.
  - **new-batch-still-graded:** no completion report → not closed-quiescent → graded against the deadline (no scope-file requirement).
  - **sentinel:** governance commit present but no completion report → NO doc-gap; completion report present + a doc genuinely missing → doc-gap fires.
  - **order-independent auto-resolve (Finding-from-(b)):** report pushed BEFORE a trailing doc → gap fires, then self-resolves when the trailing doc appears — DISTINCT from report present + doc never lands → stays open.
  - **orphan re-verify (Step-2 Finding 2):** (a) orphaned `gov-docgap` for a batch now out-of-window whose doc IS present at GOV_REF → resolved; (b) orphaned `gov-docgap` for a batch out-of-window whose doc is STILL missing → NOT resolved (stays surfaced — no cry-silence on a real aged-out gap).
  - Preserve ALL existing assertions.
- `backtest.mjs`: stays PASS. After deploy: re-run checker core vs origin — confirm B-GOV-4 (mid-subject) / B-TEC (truncation) / a simulated close-before-docset no longer fire, a real missing doc on a real closed batch still does; retire the now-stale `GOVERNANCE_EXCEPTIONS` rows (B-GOV-4 `open`, `B-TEC` phantom).
- `backtest.mjs`: stays PASS (known-good P19-B6 clean, P19-B3b gap caught, hollow detector).
- After deploy: re-run the checker core vs origin; confirm B-GOV-4 phantom / B-TEC truncation / a simulated close-before-docset no longer fire, and a real missing doc on a real closed batch still does. Retire the now-stale `GOVERNANCE_EXCEPTIONS` rows (B-GOV-4 `open`, `B-TEC` phantom-suppression) the fix makes unnecessary.

---

## 4. Risks / guardrails
- **Regression risk on the regex** — the boundary guards are subtle (C8). Mitigation: keep `batchIdToFileRegex` untouched; only broaden `BATCH_ID_PATTERNS[3]`; run the full existing `poller.test.mjs` boundary block.
- **Eligibility gate over-suppressing a real new batch** — a genuinely new batch must still be graded. Mitigation (NEW design, post scope-required drop — Langston Step-2 #2): a new batch has NO completion report → `completionReportCommitTime(id)` is null → it is NOT closed-quiescent → it grades normally (deadline block 1 + class + under-declaration pre-sentinel; doc-set once its own completion report lands). Nothing requires a scope file. Unit-test the new-batch-still-graded case explicitly.
- **Sentinel masking a stuck batch** — if grading the doc-set waits for the completion report, a batch that pushes code + partial governance but never a completion report would not get doc-gap alerts. BUT the DEADLINE alert (block 1, unchanged) still fires for code-without-governance, and the class/under-declaration guards still run — so a stuck batch is still surfaced, just via the deadline not the doc-gap. Confirm this is the intended division (Langston).
- **No deploy of engine code** — this batch touches only the tool; staging "deploy" = update the checker's local clone + its systemd timer picks up the new code. No `pm2 restart dawntrader` needed for the engine.
