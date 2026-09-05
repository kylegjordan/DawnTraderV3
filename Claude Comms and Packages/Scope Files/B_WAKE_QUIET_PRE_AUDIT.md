# B-WAKE-QUIET — PRE-IMPLEMENTATION AUDIT

> ⛔⛔ **WRITTEN RETROSPECTIVELY AT STEP 10 ON 2026-09-05. IT DID NOT GATE THE IMPLEMENTATION, AND NOTHING HERE MAY BE CITED AS THOUGH IT DID.**
> **THE BATCH RAN STEP 1 → STEP 3 WITH STEP 2 ABSENT.** The scope's §2 (mandatory 1.a architectural read), §3 (provenance read) and §4 (does-it-already-exist) are **Step-1** obligations and are not a pre-audit; no `PRE_AUDIT` document existed until this one. `PRE_AUDIT` is **REQUIRED** for `non_architecture` in the governance checker (`scripts/governance-checker/config.mjs`, `CLASS_DOCSET.non_architecture.required`).
> ⚠️ **This is exactly the `#754` shape the rules file warns about — `1 → 3` with 2 silently absent — and the batch's own memory position block never carried a `STEP: 2` line to make the skip visible.** Filed as `#1005`.
> ✅ **WHAT THIS DOCUMENT IS FOR:** to state honestly what a Step-2 audit *would* have examined, and to record which of those things the batch got right anyway and which it paid for.

**change-class: non_architecture** — declared in `B_WAKE_QUIET_SCOPE.md` and unchanged. **Evidence: the batch's own 26 files touch nothing under `server/`, `client/` or `shared/`.**

---

## 1. BLAST RADIUS — the objects this batch changes, and who else reads them

| object | who else depends on it | what could break |
|---|---|---|
| `comms-infra/laptop/cc-wake-filter.py` | **every desktop session's wake path** — CC-A, CC-B, CC-C, Infra | a suppression that is too wide silently drops a real summons; ⛔ **a running Monitor holds the code it armed with**, so a change is inert until each session re-arms |
| `comms-infra/discord/dt-push-notice.sh` | Helsinki cron `*/2`, posts to `#general` | a syntax error runs every two minutes; a wrong drift predicate cries wolf at that cadence |
| `comms-infra/discord/deploy.sh` | the installer for the Helsinki comms estate | an unlisted file is not installed, and nothing says so |
| `.claude/hooks/fresh-rules.mjs` | every session start, writes the worktree **and the index** | a wrong path refreshes or preserves the wrong content |
| `scripts/analysis/wake_narration.py` | this batch's own evidence | an instrument that mis-measures produces a confident wrong headline |

## 2. SHARED STATE AND CROSS-CUTTING CONCERNS
- **The wake filter is the ONE component all four sessions run and none of them owns.** A change lands per-session at re-arm time, so the estate is **heterogeneous by construction** — CC-B and CC-C ran the pre-cut filter for the whole batch.
- **The `dt-push-notice` escalation list and `fresh-rules.mjs`'s watched list are two lists of the same governed paths in two places.** They were already divergent (`CONDUCT.md` on neither). ⚠️ **Nothing reconciles them; this batch did not add a reconciler.**
- **The hourly heartbeat is delivered THROUGH the watcher it reports on** — so it cannot detect a dead one. Recorded in the scope; it is why OBJ-6 was struck rather than built.

## 3. WHAT A STEP-2 AUDIT WOULD HAVE CAUGHT, MEASURED AGAINST WHAT ACTUALLY HAPPENED
✅ **Caught anyway, by the Step-1 fresh-reader rounds:** OBJ-4's premise (silence *is* reachable), OBJ-6's premise (the heartbeat cannot see its own delivery path), and OBJ-8's byte-bounded window.
⛔ **NOT caught, and it cost real time — each of these is a Step-2-shaped question:**
1. **`dt-push-notice.sh` was not in the repo at all.** A blast-radius pass names its objects; this one was found only when Langston could not review it (became OBJ-9).
2. **The drift check went through three versions** because its question was never stated before it was written — "does live match the mirror" is a race against a `*/15` puller, not a provenance test. **A pre-audit's job is to state the predicate before the code exists.**
3. **A syntax error reached a live 2-minute cron** because the change was installed rather than staged-and-checked. A pre-audit that names "runs every two minutes on a live box" as the blast radius forces the patch-candidate-then-`sh -n` method up front.
4. **The alert-marker measurement was a tautology** — OBJ-11 deleted the print the instrument classified on. **A pre-audit that lists the instrument alongside the change would have put those two facts on one page.** Langston caught it at Step 8.

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED — §9.5(b-ii)
Searched `RUNNING_ISSUES`, `BATCH_CATALOG`, the completion reports and the plan for prior rulings on wake volume and on the notice body. **Found and honoured:** `#694` (the routine push notice already suppressed, content-keyed, fail-safe), `#753` (the bare-checkout recipe the freshness hook was hardened against), `#745` (`B-ISSUE-BLOCK-GUARD`, which Langston made a standing condition of the ledger removal). **Nothing found that already decided the two cuts.**

## 5. RESIDUAL RISK ACCEPTED AT IMPLEMENTATION
- **The suppressions are content-keyed and fail SAFE** — anything not matching the routine sentence is delivered. A reworded future heartbeat wakes everyone; that is deliberate.
- **`_HEARTBEAT_BAD` is a hand-written word list**, and every live delivery came through its `STALE` arm, six of them matching the word inside a negation. ⛔ **Not fixed here** — homed at plan row 4.7 `B-HEARTBEAT-RESCOPE` (`#999`).
- **The estate stays heterogeneous** until each session re-arms; `B-HOOK-ESTATE-VERSION` (CC-C) owns that class.
