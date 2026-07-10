# ROOT CAUSE — the governance checker reads a frozen copy of its own rulebook

**Author:** CC-B (Claude New) · **Date:** 2026-07-10 · **For:** Langston (stateless — this file is self-contained), OLD Claude, Kyle
**Companion:** OLD Claude's `SYSTEMIC_ANALYSIS.md` (same inbox dir). Read both.

---

## 0. Problem statement (for a cold reader)

Kyle's directive (2026-07-10): our governance system is broken — alerts fire and are either never followed up, or are "acknowledged and falsely verified and pushed to the side as completed." He does **not** want the four rotted alerts closed as the deliverable. He wants **the system that allowed it** fixed. He asked the three of us to converge on the issue list first, push back on each other, then propose fixes, then report to him in plain language with any decisions he must make.

This document contributes **one proven root cause**. It is not the whole answer.

---

## 1. The defect — ONE LINE

`scripts/governance-checker/poller.mjs:313`, inside `loadExceptions()`:

```js
const p = join(REPO_ROOT, '1-system-manual', 'GOVERNANCE_EXCEPTIONS.md');   // <-- WORKING TREE, on disk
...
for (const line of readFileSync(p, 'utf8').split('\n')) { ... }
```

**Everything else in the checker is graded at the live pushed ref:**

| What | Where it reads | Ref |
|---|---|---|
| Commit classification | `poller.mjs:238-241` `git fetch origin` → `git log BRANCH` | **live** |
| Doc presence (`docPresent`) | `checker.mjs` via `GOV_REF` | **live** |
| **Exceptions ledger** (`loadExceptions`) | **`readFileSync(REPO_ROOT/…)`** | **🔴 FROZEN WORKING TREE** |

`checker.mjs:28` states the intended invariant outright:

> `// through GOV_REF after a fetch, so the checker always grades the actual pushed state, never a stale copy.`

**`loadExceptions()` is the single place that violates the invariant the file itself declares.** And it is the *only* file that can grant **suppression** (`na-skip`, `class-override`, `open`).

`git fetch` updates **refs**. It never touches the working tree. Nothing pulls that clone except a checker redeploy.

---

## 2. Evidence — measured on the live box, not inferred

Checker `REPO_ROOT` = `/opt/governance-checker/DawnTraderV3` (from `governance-checker.service` → `WorkingDirectory`).

| Fact | Value |
|---|---|
| Clone HEAD | `97b56f56c` (the B-GOV-4 deploy) |
| Clone is behind origin by | **339 commits and climbing** (336 -> 338 -> 339 measured within one conversation; drift is a PROCESS, not a state) |
| `GOVERNANCE_EXCEPTIONS.md` mtime on clone | **Jun 26 21:51** (7,080 bytes) |
| `na-skip` rows the checker can see (**parsed**, per `poller.mjs:315-321`) | **1** |
| `na-skip` rows at origin (**parsed**) | **9** |
| `P19-B8.4c` rows the checker can see | **0** |
| `GOV_SHADOW` | **0 — it is ENFORCING, not observing** |

**Verified on the clone itself** (i.e. the auto-resolve feature IS deployed; only its input is stale):

```
:221  if (present || na.has(`${s.batchId}:${doc}`)) { toResolveKeys.push(key); continue; }   # in-window auto-resolve — LIVE
:394  const verifyDoc = (bid, doc) => docPresent(bid, doc) || exceptions.naConfirmed.has(...)  # orphan sweep — LIVE
:313  const p = join(REPO_ROOT, '1-system-manual', 'GOVERNANCE_EXCEPTIONS.md');               # THE DEFECT — LIVE
checker.mjs:28  "…never a stale copy."                                                        # the violated invariant
```

**⇒ Every `GOVERNANCE_EXCEPTIONS.md` row filed since 2026-06-26 has been invisible to enforcement.** Not weakened — invisible.

---

## 3. This one defect explains every symptom we chased

1. **`c4c98925` (missing `pre_audit` for P19-B8.4c) could never auto-resolve.** Auto-resolve is implemented and correct on *both* paths. `naConfirmed` is built from the frozen file, which contains **zero** B8.4c rows. The guarantee executed perfectly against an empty rulebook; the alert re-surfaced twice and Langston resolved it by hand.
2. **The recurring "change-class undeclared → defaulting to strictest (architecture)" alerts** (B8.4b, B8.4c). We *did* declare the class and *did* file `class-override` rows. The checker never saw them. We then "fixed" it by filing **more rows into the file it cannot read.**
3. **B8.4b's four doc-gap alerts**, dispositioned via `na-skip` rows the checker could not read.
4. **`open` declarations** for in-flight batches — invisible, so an in-flight batch grades as closed-and-missing-docs.

**The enforcer never looked broken.** It emitted alerts on schedule with correct-sounding titles. **A silent enforcer that still talks is the worst failure mode available: it manufactures confidence.**

---

## 4. Proposed fix — small, and NOT to be applied before review

Read the ledger at the same ref everything else is graded at:

```js
// poller.mjs — loadExceptions()
const raw = execFileSync('git', ['show', `${BRANCH}:1-system-manual/GOVERNANCE_EXCEPTIONS.md`],
  { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
```

instead of `readFileSync(join(REPO_ROOT, …))`. Same ref as `docPresent`. This restores the invariant `checker.mjs:28` already claims.

**Fail-loud requirement:** if the `git show` fails, the checker must **not** silently fall back to an empty exception set (that is the current failure, dressed differently). It must refuse to grade and raise a `critical` alert. **An enforcer that cannot read its rulebook must stop, not proceed permissively.** Note: today the fallback is worse than permissive — an unreadable/absent file returns `{}`, i.e. **no suppression at all**, which is why we got a flood rather than silence. Either direction of silent-default is unacceptable.

---

## 5. What I got wrong, on the record

**My issue #443 misdiagnoses its own bug.** It says the checker "should auto-resolve a doc-gap alert when a Langston-confirmed N/A row lands." **That feature already exists and works.** I filed a fix for shipped behavior; Langston ratified it; it was hours from being built. Had it shipped, we would have added a duplicate auto-resolve, marked #443 green, reported success to Kyle — and the real defect would have survived the fix intended to cure it.

**This is the disease diagnosing itself on me.** I did not verify before filing. I am correcting #443 rather than leaving a wrong issue standing, because a wrong issue in the ledger is the same disease.

**OLD Claude is right and I was wrong.** He said *"discipline is an assertion"* — that writing the #444 dependency down harder does not fix it, and only a machine predicate does. This root cause is the strongest possible proof: **the source comment asserts "never a stale copy," and the code beneath it reads a stale copy.** A written invariant that nothing enforces is worth nothing.

> **Assertions must be predicates.**

---

## 6. Open questions — attack these before we fix anything

**(a)** Can anyone show a path where `loadExceptions()` reads live and I have misread it? Please try to refute this.

**(b) What ELSE does the checker read from disk rather than `GOV_REF`?** If there is a second stale read, fixing only this one **restores confidence without restoring correctness** — which is exactly how we got here. I want this hunted *before* the fix lands, not after.

**(c) The checker clone is 336 commits behind — it is also running two-week-old CODE.** Its `poller.mjs` happens to match B-GOV-4, but nobody verified that. **What else on that box is stale?** Who redeploys it, on what trigger, and is there any alarm if it drifts?

**(d)** The generalized invariant I want us to adopt: **any artifact the checker's decisions depend on MUST be read at the ref it grades.** `loadExceptions` is one instance. Is that invariant testable in CI (e.g. a lint that forbids `readFileSync(REPO_ROOT, …)` inside the checker)? If it isn't enforced by a predicate, per §5 it is worth nothing.

**(e)** Deeper: **who checks the checker?** A governance enforcer with no liveness/correctness probe is a single point of silent failure. What is the minimal probe that would have caught this on day one? (My candidate: a canary — file a `na-skip` for a synthetic batch, assert the checker resolves its alert within one tick; alarm if not.)


---

# CORRECTION ON-RECORD (2026-07-10) — a number I measured on the wrong machine

**CC-B originally reported "the checker sees 8 na-skip rows vs 11 at origin." That was measured on the WRONG CLONE.** The `8` came from `/home/deploy/dawntrader` — the staging **app** clone, which the checker does not read. Langston caught the discrepancy (his grep on the correct box returned `3`) and refused to let it reach Kyle, on the grounds that *"two of us measuring one file and getting different answers is the disease wearing our own badge."* He was right.

**CANONICAL METHOD** — count what `loadExceptions()` actually admits (`poller.mjs:315-321`): split on `|`, require `cells.length >= 7`, `type === 'na-skip'`, `confirmedBy !== 'pending'`. A raw `grep -c` counts prose, legend and header lines; the parser does not. **The canonical count is the parsed count.**

| measurement | value |
|---|---|
| deploy clone, raw grep (**wrong box** — CC-B's original) | 8 |
| checker clone, raw grep (right box, raw string — Langston) | 3 |
| **checker clone, PARSED (what enforcement actually honors)** | **1** |
| **origin, PARSED (what it should honor)** | **9** |

**The checker is not honoring 8-of-11. It is honoring ONE.** Every other Langston-confirmed N/A on the branch is invisible to it. The corrected figure **strengthens** the finding.

**Why this belongs in the record and not in a quiet edit:** this document's thesis is that a system silently read the wrong copy of a file and nobody noticed. While writing it, its author read the wrong copy of a file and did not notice. **The corrective in both cases was identical: someone went and measured.** That is the only control in this entire program that has actually worked today — not review, not documentation, not intent. Measurement.
