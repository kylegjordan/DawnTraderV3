# B-GOV-HEARTBEAT-REPAIR — Step-1 scope (#637)

**change-class: `non_architecture`**
**Owner:** CC-B · **Date:** 2026-08-01
**Sequence:** Kyle-directed 2026-08-01 ("move on to the governance watchdog repair"). Design was ruled by Langston 2026-07-31 **before** this scope existed — recorded verbatim on #637 — so Step-1 here is the provenance read and the scope statement, not a fresh design.

---

## 1. ★ PROVENANCE READ (§2 1.b + rule 24.0) — TIER 1, because this batch changes the behaviour

**Corpora searched, named:** `RUNNING_ISSUES.md` (#637, #642, #447, #448), `BATCH_CATALOG.md`, the `scripts/governance-checker/` tree, and `scripts/system-alerts.ts`. **`bridge/canonical/` NOT applicable and that is recorded** — the governance checker postdates the 2026-01/02 governance change by months (origin `3d3dce073`, B-GOV, 2026-06-17).

**ORIGINAL INTENT of the heartbeat:** it is a **dead-man switch** on the governance checker — the checker's own output is *silence* when everything is fine, so a dead checker and a clean repo are indistinguishable without it. `checkHeartbeat()` raises `governance-checker-silent` when no tick has been written inside `TICK_MINUTES × HEARTBEAT_MISS_LIMIT`, and clears it when ticks resume.

**WHAT CHANGED UNDERNEATH THAT INTENT:** **B-GOV-INTEGRITY-1 (2026-07-10)** made `--evidence` **mandatory** on the alerts CLI (`scripts/system-alerts.ts:294`, `requireFlag(args,'evidence')` → usage + `process.exit(1)`). That was a correct, deliberate hardening — an evidence-less resolve is exactly the provenance-shaped theater #447 exists to prevent. **But it broke a caller that the sweep did not update.**

★ **DISPOSITION — rule 24 outcome (1), a REAL DEFECT, and specifically an UNOWNED SEAM:** a later batch made an argument mandatory, that broke a programmatic caller, and **the caller's own error handling hid the break**. Not "computed-but-unconnected" (the #605/#594/#638 family) — a different shape, recorded as such.
⚠️ **WHY THE INTEGRITY-1 SWEEP MISSED IT (Langston, whole-tree census): there are EXACTLY TWO code call sites of the CLI resolve — `poller.mjs:386` (✅ passes `--evidence`) and `heartbeat-check.mjs:39` (❌). The sweep fixed the sibling IN THE SAME DIRECTORY.** The reason it missed this one is documented: `SYSTEM_IMPACT_MAP.md:835` describes the seam at **FILE** grain (naming `poller.mjs`) while `README.md:32` says the heartbeat *"is a separate process with its own unit."* ⇒ **the note telling us to treat it separately is why it fell out of the sweep. Seam documented per-FILE; defect lives per-PROCESS.**

## 2. Objectives

| # | objective |
|---|---|
| OBJ-1 | Supply the mandatory `--evidence` on the heartbeat's resolve, with a token that carries information rather than a sentinel-every-time |
| OBJ-2 | **Stop discarding the alert id on failure** — `hb.alertId = null` must run only on a confirmed clear |
| OBJ-3 | Preserve the `catch` for the benign already-terminal case; make every other failure loud (CC-A's constraint — the catch is load-bearing in the good case) |
| OBJ-4 | One SSOT for the evidence-token shape, since **two separate processes** now issue resolves and must agree |
| OBJ-5 | Fences that fail before they pass |
| OBJ-6 | **Deploy, verify, THEN enable the timer** — never the reverse |

## 3. ★ THE CONSTRAINT THAT DECIDES THE DESIGN (Langston, and CC-B would have got it wrong)

`checkerResolveEvidence()` is **module-private to `poller.mjs`** (`:366-369`) and closes over `gradedRefSha`, set from `rev-parse` **after that process's own fetch**. **The heartbeat is a separate process with no fetch and no export to import** — poller's exports are `:43,85,99,144,162,192,200,503`. ⇒ **importing it would return the sentinel every time: passing the gate while carrying nothing.** The sha must cross the process boundary via the state file.

⚠️ **AND THE PATH THAT MAKES THE OBVIOUS VERSION WRONG:** `poller.mjs:532`, the fetch-fail early return, **updates `lastTick` and returns BEFORE `:541` sets the sha.** A run of fetch-fail ticks would keep the timestamp fresh while the persisted sha aged silently, and the heartbeat would resolve citing **a ref the checker never graded at**. ⇒ **persist `gradedRefSha: null` explicitly on that path** — a stale-but-plausible token is worse than an honest sentinel, which is this issue's whole theme.

## 4. Out of scope, deliberately

- **Ownership transfer on `acknowledged_by`** (#642) — a real gap, a separate scope decision, and **not** to be solved by adding a `--by` reassign (that is one more unauthenticated free-text field, #447's trap).
- **Retry/resume on transient upload failure** — different subsystem (#592 family).
- **The dedupe/ack blind-spot class** (#638/#646) — the interim resolve-never-ack rule stands; the code fix is its own batch.

## 5. Verification posture

⚠️ **The unit suite CANNOT reach the defect.** `heartbeat-check.mjs` shells out via `execFileSync` with no injection seam, so the resolve branch is not unit-testable; the fences cover the **pure shared helper** only. **Stated plainly because #594's lesson was a suite that fenced the READER while the defect lived in the WRITER — the same trap, and here it is structural rather than an oversight.** ⇒ **the live staging run is the evidence for the branch**, and the honest sequence is: deploy → run `heartbeat-check.mjs` by hand → confirm a real resolve succeeds → only then enable the timer.
