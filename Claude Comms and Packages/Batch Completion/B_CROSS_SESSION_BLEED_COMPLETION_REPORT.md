# B-CROSS-SESSION-BLEED — COMPLETION REPORT

**Batch:** `B-CROSS-SESSION-BLEED` · **Issue:** `#753` · **Owner:** CC-B (transferred from CC-A 2026-08-31 at Kyle's direction) · **change-class:** `architecture` *(Langston overruled my declared `non_architecture`)* · **Queue:** `PHASE_19_PLAN` §governance position 2

---

## ✅ CLOSED 2026-09-01 — Langston Approved; awaiting Kyle's acknowledgement (Step 11's second half)

**THE ONE OPEN ITEM WAS RESOLVED BY LANGSTON VACATING HIS OWN OVERRULE.** Class is **`non_architecture`**. His words: *"I used the class as a LEVER to force one document. The change-class is a doc-set selector, not a severity rating."* He had graded on stakes, reached for `architecture` to make the SIM required, and dragged `SYSTEM_MANUAL` in because the matrix welds them. ★ **And he found he had done it before — `B-DIAG-387`, 2026-06-27, *"reclassified architecture so the checker requires the SIM doc"* — which is exactly the row I refused to cite. Two instances, one author; that row is now marked superseded/mis-tiered in place.**
**Correct precedent, his:** `B-COMMS-IMAGES-2` (`GOVERNANCE_EXCEPTIONS:32`) — laptop-side plumbing, `non_architecture`, System Manual `N/A` on a diff fact, cleared Langston-alone because the `N/A` AGREES with the config. **No new exceptions row is needed for this batch.** The withdrawn row stays withdrawn in place.
★ **The taxonomy gap he named is real and is placed:** `B-CHANGE-CLASS-DOCSET-FIT`, CC-B, plan row 2.7 (§7 item 6).

---

## 1. WHAT THE BATCH WAS FOR

`fresh-rules.mjs` runs at every session start in each clone and refreshes the governed rule files from `origin/migration/aws-supabase`, so no session works from stale instructions. **It had two defects, and the second was invisible for 28 days because the first misdescribed it.**

## 2. THE MECHANISM — ESTABLISHED, AND IT OVERTURNED THE ISSUE'S OWN TITLE

⛔ **`git checkout <ref> -- <path>` WRITES THE INDEX AS WELL AS THE WORKING TREE.** That is the whole of `#753`.
**All 22 artifacts across 5 clones are ORIGIN'S OWN BYTES**, delivered to each clone **by that clone's own hook**, and then **misdescribed by the hook's output as *"your uncommitted local edits."*** ★ **Rule 25.c fired correctly on a true signal — the content genuinely was not the session's — but the author was the local hook, not a peer session.**

⛔ **A14, THE FREEZE, which is worse than the staging.** Once refreshed, a path is dirty **against HEAD** ⇒ every later run hits `skippedDirty` ⇒ **it never refreshes again.** Measured: one clone held a **14-day-old** `RUNNING_ISSUES.md` while origin moved **755 commits**. ★ **And `git pull` ABORTS on a dirty worktree, so the freeze barricaded its own exit.** ⇒ **the hook that exists so nobody runs stale rules was itself making them permanently stale, while reporting the staleness as the session's own unpushed work.**

⚠️ **THE ISSUE'S CONCLUSION WAS AMENDED IN PLACE ON 2026-08-31 (`RUNNING_ISSUES.md:3838`), NOT STACKED.** It read *"nothing was ever written between sessions … there is no cross-session write, and no session ever touched another's clone"* — **two claims welded together. The second survives. The first is falsified by `#979`, found the same day.** The original is quoted inside the amendment. **A correction stacked under wrong text propagates the withdrawn version into every report written from it.**

## 3. OBJECTIVES — each with its evidence

| # | objective | verdict | evidence |
|---|---|---|---|
| **OBJ-1** | hook reports whether its own on-disk bytes are origin's at run time *(subsumes the retired OBJ-2(c) gate)* | ✅ **YES** | `self_at_origin` in the run record; loud block when `false`; **breaks the quiet exit**; asked of `import.meta.url`. **Three branches proven in the rig:** origin version → `true`/quiet/silent · origin advanced → `false`/speaks · origin holds no hook file → `null`, reported not guessed. ★ **It REPORTS, never REFUSES** — refusing would disarm it in exactly the clone that needs it |
| **OBJ-2(b)** | verify the index is clean after refresh | ✅ **YES** | `diff --cached --name-only` on the path after the reset; non-empty ⇒ `indexLeaks`. **Mutation-proved by Langston independently: drop the `reset` ⇒ `index_leaks` non-empty, printed, exit 0 preserved** |
| **OBJ-3** | no silent catch — a failed reset is reported, not swallowed | ✅ **YES** | `resetFailed` captured and reported. ★ **AND THE OBJECTIVE WAS UNDER-SPECIFIED: I found the last bare `catch { }` while re-verifying this one.** A failed **checkout** left the path merely absent from `changed`, so the record showed `behind > 0` with nothing refreshed and nothing skipped and the session was told **nothing at all** — A14 with a different cause, inside the fix for A14. Now `refreshFailed` |
| **OBJ-4** | record the occurrences and the tracing artefacts | ✅ **YES** | `#753` update at `:3838`+; pre-audit A1–A14; four refuted claims recorded so nobody re-runs them |
| **OBJ-5** | distinguish hook-residue from genuine local edits; fix the skip wording | ✅ **YES** | `isHookResidue` + `dirtyMembers`; wording states the **evidence** rather than asserting ownership. **Mutation-proved: remove the residue arm ⇒ the freeze RETURNS** |

**P-items:** P2/P3/P4/P5 ✅ · **P6** ✅ SIM · **P7** ✅ census · **P8** ✅ `#753` · **P9** ✅ *(Langston-authorised, census corrected)* · **P10** → homed on `B-FRESHNESS-LOG-READER` · **P11** ✅ dissolved — class vacated to `non_architecture`, System Manual judged `N/A` on a diff fact

## 4. CI — per-job, not the run-level conclusion

**Run `33428944960`, head `7ebb98666bd918a2cd7884be8e2e1bb5feadb2a0`:** TypeScript Check (baseline gate) `success` · Test Suite `success` · Build `success` · Docker Build `success`.
⚠️ **STATED PRECISELY: CI covers that head. The graded ref is ahead of it by markdown-only commits — zero code surface.** Langston enumerated the delta himself rather than accept the phrasing.
★ **AND A RETRACTION THIS REPORT DEPENDS ON: I had carried *"rule 19's CI 4/4 is UNSATISFIABLE while `#669` is open"* in an AUTO-LOADED file for ~3 weeks after it stopped being true.** `RUNNING_ISSUES:835` had already flagged it by name. `#669` was rule-24 outcome (3) — stale TEST, correct CODE — and the assertions were retired. **4/4 is genuinely satisfiable and was genuinely met.**

## 5. DEPLOY — NONE, and the branch was checked, not just the batch

Deployed sha `2af2e0bacc1430a6452559b83ba7d3be15adc7be` (`--by CC-C`). Diff to origin outside governance/comms/`.claude` = **16 files, all `scripts/measure-gate/*` and `token-watch/*`** — standalone Python, **zero under `server/`, `client/`, `shared/`.** **Nobody's runtime work was stranded behind this batch.** *(Independently re-derived by Langston: 40 commits / 39 files, minus 9 + 8 + 6 = exactly 16.)*

## 6. VERIFICATION

**Offline rig** (scratch bare origin + clone, real branch name, **real hook run from OUTSIDE the clone via `CLAUDE_PROJECT_DIR` so the instrument is not the thing under test**): clean first refresh → **creates** the residue · residue incl. a space-named member → **REFRESHED** · one genuine dirty member → **PRESERVED and NAMED** · edit removed → **RESUMES**, index clean · single-file entry preserved and **not self-named** · **mutation-proved on both fences.**
**Langston rebuilt the whole rig from scratch — 20 assertions, 20 pass** — including the `-unormal` mutant freezing `.claude/hooks/lib/` and `-uall` advancing it.
**Five-clone census:** dirty = **0** on every governed path, **instrument positive-controlled first** (untracked → 1, tracked-modified → 1, restored → 0). ⚠️ **Other clones READ, never written — their cached `origin/…` pointers are stale by construction and fetching in them would be writing to a clone that is not mine.**

⛔ **HONEST RESIDUAL — WHAT THIS BATCH DID NOT ESTABLISH:**
- **Nothing was frozen at verification time, so the census cannot demonstrate the fix clearing a LIVE freeze.** That is shown only on a constructed case.
- **The `refreshFailed` branch is MUTATION-proved (wired), NOT proved reachable by a real checkout failure.** I could not construct one — git replaced a directory with a file happily, and my Windows ACL attempt used cmd syntax inside bash and **silently did nothing.**
- **`#979`'s reach is UNMEASURED and deliberately not guessed at.**

## 7. NEW FINDINGS OUTSIDE SCOPE — each with its disposition

6. **The change-class taxonomy has no member for infrastructure batches** (Langston §13 at close): the matrix welds `SYSTEM_MANUAL` to `SIM` while their triggers differ, so hooks/bridges/alerting/governance tooling either under-declare or take a mis-tiered `N/A` — six such rows already. **DISPOSITION: own batch — `B-CHANGE-CLASS-DOCSET-FIT`, CC-B, `PHASE_19_PLAN` 2.7.** Outcome (2), a scope decision.
7. **Langston's REVIEWER LEDGER (34,605 B) alone exceeds his file's 24,576-B cap while claiming to survive every prune.** **DISPOSITION: own batch — `B-LANGSTON-LEDGER-SPLIT`, Langston + Infra, plan row 2.8.**
1. ⛔ **`#979` — ALL FOUR SESSIONS SHARE `/tmp`, AND A COMMIT MESSAGE IS CONTENT.** My commit emerged carrying another session's message (`a9366f5e4`; corrected at `0264f24f7`, **tree hash identical**, so only the message moved). **MEASURED:** `/tmp` → `C:/Users/kyleg/AppData/Local/Temp`, with a positive control. ★ **The measurement sharpened the fix: my scratchpad is UNDER THAT SAME ROOT — isolation is the session-UUID SEGMENT, so *"avoid the temp directory"* would not have helped and the guard must be an ALLOWLIST.** **It defeats all three existing guards by construction** (rule 25 protects the `--` side, the message arrives via `-F`; rule 25.c is silent on the MESSAGE; `guard-bare-commit` checks FORM). **DISPOSITION: own batch — `B-SHARED-TMP-ISOLATION`, CC-B, `PHASE_19_PLAN` 2.6.**
2. **An archive that normalises is not an archive.** `core.autocrlf` rewrote two CRLF-stored `.removed` files to LF on `git add`, collapsing them onto a third's blob — **destroying the exact distinction whose loss made the deletion census wrong one step earlier.** **DISPOSITION: folded — deliverable (d) of `B-SHARED-TMP-ISOLATION`** *(Langston's §13, folded at his invitation rather than given a second home)*.
3. **My own rig contaminated the run record** — 34 of 466 entries stamped `clone: "c1"`, concentrated in the freeze and residue classes the log exists to detect. **Not rewritten: an append-only record edited to tidy my own mess destroys the provenance.** **DISPOSITION: folded — allowlist requirement on `B-FRESHNESS-LOG-READER`.** ⚠️ **A BASENAME allowlist is insufficient — `DawnTraderV3` is `git clone`'s default name; and the forward control is `USERPROFILE`, not `HOME`, because node's `os.homedir()` ignores `HOME` on Windows.**
4. **SIM said `load-own-memory.mjs` carries a "three-entry" clone map; it has carried four since 2026-08-26.** **DISPOSITION: folded into this batch** — corrected, and stamped *read the map's length from the code, not from here*.
5. **`B-FRESHNESS-LOG-READER` was in NO plan file when I twice told Langston it was "already homed".** **DISPOSITION: folded — genuinely placed at 2.6's predecessor 2.5.** ★ **§9.4's own named failure — *naming is not placing* — committed by the session quoting the rule at the reviewer.**

## 8. THE TIER LEDGER — transcribed from the governance commit message `0d768bae1`, not from recollection

**CHANGE-CLASS: `non_architecture`** *(re-rendered 2026-09-01 after Langston vacated his `architecture` overrule; required set under this class = scope · pre-audit · completion report · `BATCH_CATALOG` · `PHASE_HISTORY`, all landed)*

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | OK | row added: mechanism, A14 freeze, the fix, the seven-instance finding, close-pending |
| T1 | PHASE_HISTORY.md | OK | Phase 19 governance entry; phase status explicitly unchanged, no engine surface touched |
| T1 | PHASE_19_PLAN.md | OK | B-FRESHNESS-LOG-READER placed at 2.5, B-SHARED-TMP-ISOLATION at 2.6 |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | OK | own file at STEP 10, #979 and the seven-instance pattern folded in; shared file untouched |
| T1 | batch SCOPE | OK | change-class corrected to architecture; OBJ-1 and P10 dispositions appended |
| T1 | batch PRE_AUDIT | OK | Step-7 rig-contamination finding appended; header class corrected |
| T1 | COMPLETION_REPORT | OK | written and pushed, filed OPEN on the System Manual row |
| T1 | Langston's /home/langston/MEMORY.md | OK | synced; five CLOSED batches collapsed per the lean rule (-13,088 B), 216 -> 170 lines |
| T2 | SYSTEM_MANUAL.md | N/A | zero changes under `server/`, `client/` or `shared/`; the diff is `.claude/hooks/fresh-rules.mjs` — judged under `non_architecture`, and the fact is checkable without me |
| T2 | SYSTEM_IMPACT_MAP.md | OK (judged, and DONE — a downgrade does not erase real work) | hook row rewritten, split table repaired, stale three-entry clone map corrected to four |
| T2 | RUNNING_ISSUES.md | OK | #753 updated and its conclusion amended in place; #979 filed |
| T2 | CHANGES_AND_FIXES.md | OK | FIX-2026-08-31-B: both halves of the defect, the fix, the live confirmation, the residual |
| T2 | MISTAKE_PATTERNS.md | OK | enumerator-blind-spot (n=7) and shared-tmp-message (n=1) filed; worktree-not-ref added under wrong-object |
| T2 | GOVERNANCE_EXCEPTIONS.md | OK | the malformed P11 row withdrawn in place; `B-DIAG-387` marked superseded/mis-tiered in place on Langston's ruling |
| T2 | DELETED_COMPONENTS_LOG.md | OK | three REPLIT_PUSH_SCRIPT.sh copies with the blob table and blast radius |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed; #979's rule-25.c amendment is a later batch's deliverable |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule added or materially changed |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change; both placements went to PHASE_19_PLAN.md |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter-adjustment governance touched |
| T2 | AUTHORITY_BASELINE.md | N/A | constitutional baseline untouched |
| T2 | STORAGE_POLICY.md | N/A | no retention tier or per-table policy changed |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no xStock/crypto expansion surface touched |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed; the fixes were to one hook |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his model, runtime, invocation, read path and auth unchanged |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | ack/resolve process unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | no column, field or ownership change; I only moved a card |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily model/feature check did not run in this batch |

⛔⛔ **THE LEDGER IS WHAT CAUGHT THE GAP, WHICH IS THE REASON IT IS POSTED WHOLE.** I reported Step 10 complete having updated the two most interesting documents. **Enumerating every row surfaced FOUR REQUIRED documents I had never touched** — `BATCH_CATALOG.md` and `PHASE_HISTORY.md` (mandatory in EVERY change class), Langston's `MEMORY.md`, and `CHANGES_AND_FIXES.md` / `MISTAKE_PATTERNS.md` by trigger.

⚠️ **EVERY ZERO WAS POSITIVE-CONTROLLED BEFORE IT BECAME AN ABSENCE CLAIM** — 79 / 60 / 17 `P19` matches in the first three files. ★ **`MISTAKE_PATTERNS.md`'s first control ALSO returned zero and was therefore uninformative**, so it was re-controlled on `wrong-object` (12 matches) before its absence counted for anything.

**DELETED:** `REPLIT_PUSH_SCRIPT.sh` (root) · `Claude Comms and Packages/REPLIT_PUSH_SCRIPT.sh` · `attached_assets/REPLIT_PUSH_SCRIPT_1772132688227.sh`

**Langston's `MEMORY.md`:** five CLOSED batches collapsed to their headings per the §3.2 lean rule — they already carry ref, CI run and ruling arc. **55,053 → 45,605 B; 216 → 170 lines.** Under the 200-line cap; **still 21,029 B over the 24,576-byte cap.** ⛔ **The remainder is his REVIEWER LEDGER, whose own header says it survives every prune, and his STANDING NOTES — his working rules, not mine to cut.** The residual is stated with its measurement rather than resolved unilaterally. Backup: `/home/langston/MEMORY.md.bak-20260901-ccb`.

## 9. THE PATTERN THIS BATCH PRODUCED SEVEN TIMES — the transferable part

**An enumerator or reader blind to a member class ⇒ the thing scores false ⇒ a whole entry freezes, or a sweep reads as complete.** **Four of the seven were mine, written while fixing the one before:**
`diff --name-only` blind to untracked · `-unormal` collapsing an untracked subdir to a directory pathspec · two spellings of one newline across two sites · porcelain **quoting** a spaced path · `run()` **trimming** the leading status space so `slice(3)` cut *into* the path · **hashing the WORKTREE not the ref**, where `core.autocrlf` made two distinct blobs look identical · the deletion **archive** normalising what it preserved.
⇒ **fixed ONCE at a shared enumerator, so a sixth blind spot has one place to be fixed rather than several to keep consistent.** ★ **Two of the seven surfaced ONLY because a value happened to be PRINTED or CHECKED. Silently, both are permanent.**

## 10. NOTES

**One merge commit** (`e5cfdf2b2`) — the CRLF-dirty scripts made a rebase abort repeatedly on files never touched, so **the defect being deleted was blocking its own deletion.** ⚠️ **I told Langston the branch was "otherwise fast-forward". IT IS NOT — 25 merges, back to 2026-03-30.** **CONFIRMED against the checker's real `extractBatchId` with a positive control: 25 merge subjects, 0 yield a batch-id ⇒ invisible to the checker ⇒ no false alert.**
**No scaffolding declaration is required — nothing here ships inert.**
