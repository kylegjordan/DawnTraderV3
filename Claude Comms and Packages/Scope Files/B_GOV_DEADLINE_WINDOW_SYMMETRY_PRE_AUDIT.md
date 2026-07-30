# B-GOV-DEADLINE-WINDOW-SYMMETRY — Pre-Implementation Audit (#605)

**Owner:** CC-B · **change-class:** `non_architecture`
**Scope:** `B_GOV_DEADLINE_WINDOW_SYMMETRY_SCOPE.md`

---

## 0. ⚠️ PROCESS DEFECT DECLARED UP FRONT: THIS AUDIT WAS WRITTEN **AFTER** THE IMPLEMENTATION, NOT BEFORE IT

**§2 Step 2 places the pre-implementation audit between scope (Step 1) and implementation (Step 3). I went scope → implementation and skipped it.** This document is written at close, and **it is dated honestly rather than presented as though it preceded the code.**

★ **THIS IS NOT A PAPERWORK POINT — THE SKIPPED STEP IS EXACTLY WHERE THE BATCH'S ONE NEAR-MISS WOULD HAVE BEEN CAUGHT.** The audit's mandatory content is per-component **blast radius**. The defect that nearly shipped was a blast-radius miss: pinning `hasGovernance` **after** the child→parent propagation pass silently unsatisfies every parent whose closed sub-batch has aged out — reviving the P19-B8.4 false-overdue that #508 was built to kill. **It throws nothing and no existing test catches it.** It was caught by **Langston at Step-4 review**, i.e. by the *next* gate, after the code was written.
⇒ **The gate that exists to prevent it was skipped; the gate after it happened to hold.** Recorded because "review caught it" is not a substitute for "the audit would have caught it earlier and cheaper."

---

## 1. Components touched

| component | role in this batch |
|---|---|
| `scripts/governance-checker/poller.mjs` · `anchorClosedBatches` | **modified** — now also pins `hasGovernance`; re-propagates after the pin |
| `scripts/governance-checker/poller.mjs` · propagation loop | **extracted** to `propagateGovernanceToParents` (behaviour-preserving) so it can run twice |
| `scripts/governance-checker/poller.test.mjs` | **modified** — three new fences |

**Not touched:** the trading engine, any server path, any DB schema. **The checker is a governance-tooling service; it has no trading-path surface.**

## 2. Upstream / downstream / shared state

- **UPSTREAM of the change:** `computeBatchStates` (window-scoped `hasGovernance` write; the inline propagation now delegated), and the enrichment loop that sets `completionAddTime` / `scopeAddTime` before the anchor runs. **Order verified: enrichment → anchor.**
- **DOWNSTREAM (the census, run as OBJ-1):** `hasGovernance` has **exactly one production consumer — the deadline gate in `decideAlerts` block (1)** — plus the propagation guard itself. **Everything else in the tree is test fixtures; zero occurrences under `server/`.** The code asserts this itself: *"hasGovernance's sole consumer is the deadline check."*
- ⇒ **BLAST RADIUS: bounded to the deadline alert.** The docgap path keys on a **separate** sentinel (`hasCompletionReport`), so a closed batch with missing docs still alerts — **no cry-silence via that route.**
- ★ **THE ORDERING HAZARD — the thing this audit existed to find:** propagation runs **inside** `computeBatchStates`; `anchorClosedBatches` runs **later in the same tick**. Any write to `hasGovernance` in the anchor is therefore **after** propagation and must re-run it. **Mitigation shipped: the re-propagation lives INSIDE `anchorClosedBatches`, so a future second caller cannot forget it.**

## 3. Background execution

`governance-checker.timer` fires every **30 min**; `governance-checker.service` runs `ExecStartPre` `git fetch` + `merge --ff-only origin/migration/aws-supabase` then the poller. ⇒ **there is no manual deploy step — the fix goes live on the first tick after push.** ⚠️ **That property is also an unreviewed-code exposure and is filed as a leg on #621 (owner CC-A).**

## 4. Risk enumeration + disposition

| risk | disposition |
|---|---|
| Pin masks a genuine post-close **doc deletion** | **REFUTED at the ref (Langston).** `closed` derives from `git ls-tree GOV_REF` — presence **at the ref**, not history. Delete the report ⇒ `closed` false ⇒ **pin self-revokes**, window behaviour returns. A *hollowed* doc is caught by the docgap path's every-tick "absent or hollow" re-grade. |
| Pin silences a **never-governed** batch | **Impossible by construction** — the pin sits under `closed && !reopened`, and a never-closed batch has no completion report ⇒ never pinned. Fenced with the live case, `B-REGIME-INPUTS-LIVE`. |
| Pin silences a **re-opened** batch | **Fenced** (Langston Step-4 ②) — the pre-existing re-open test asserted only `lastCode` and never set this flag. Mutation-proved. |
| **#508 parent-satisfaction regression** | **The near-miss.** Fenced and mutation-proved: removing *only* the re-propagation fails exactly the two parent fences. |

## 5. SIM / System Manual

**SIM:** applicable — the checker's state derivation changes; judged at close. **System Manual:** **not** applicable — no trading architecture, strategy, regime, filter, pipeline or math change.

## 6. Verification posture

⚠️ **Green tests + green CI + code approval are NECESSARY AND NOT SUFFICIENT here, and this batch demonstrated why.** The first live falsifier was aimed at a batch **outside the checker's 300-commit window**, where the alert cannot clear *regardless of any fix* — a true observation that proves nothing, and one step from withdrawing a correct fix. **Any deadline-path verification must first assert its subject is in-window and that the alert is checker-minted** (the resolve only fires for keys the checker holds). Recorded on **#625**.
