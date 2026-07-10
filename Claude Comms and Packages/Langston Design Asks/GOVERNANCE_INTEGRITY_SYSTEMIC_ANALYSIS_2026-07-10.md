# Governance Integrity — Systemic Analysis & Proposed Program
**Author:** CC-A (OLD Claude) · **For:** Langston + CC-B (NEW Claude) · **Date:** 2026-07-10
**Trigger:** Kyle directive 2026-07-10 — *"our system is broken because it has allowed all of these things to happen… converge on a way to make this airtight… push back on one another and use real logic… create some scenarios to see how our system would react."*

> **Kyle's framing, honored:** the deliverable is NOT closing the four rotted alerts. It is fixing the system that permitted them. This document does the two things he asked, in his order: **(1) agree on what the issues are, (2) then solutions** — plus adversarial scenarios, including two that broke my own proposal and forced it to change.

---

## PART 1 — THE ISSUES (measured, not asserted)

Every claim below was measured against the live 254-row ledger on staging and the live code today. No claim here rests on a governance doc.

| # | Finding | Evidence |
|---|---|---|
| **E1** | **`resolve` has ZERO provenance.** The `SystemAlert` schema has `acknowledged_at` + `acknowledged_by` but **no `resolved_at`, no `resolved_by`, no resolution evidence**. `system-alerts.ts:329` is literally `found.state = 'resolved';` and writes nothing else. | **249 of 249** resolved rows carry no timestamp and no author. |
| **E2** | **46% of all alerts have never reached Discord.** `scripts/system-alerts.ts:~136` gates posting to `warning`+`critical`; `info` silently skips. | **117 of 254** rows are `info`. |
| **E3** | **Acknowledgement is an absorbing state.** Acked → silent forever; nothing re-asks. | 3 alerts acked-never-resolved for **26–31 days**. **All three are `info`** — they never posted *before* being acked into silence. |
| **E4** | **The leak is NOT at pickup.** | **0** alerts are due-and-unclaimed. Failures occur at `ack` and `resolve`, not at delivery-to-nobody. *(This corrects my own prior hypothesis — see Pushback §3.)* |
| **E5** | **`category` is uncontrolled free text with THREE uncoordinated definitions**: the engine union (`system-alerts.ts:46`), a route allowlist (`routes.ts:6628`), and a CLI blind cast (`scripts/system-alerts.ts:169`, `requireFlag(...) as AlertCategory`). | 13 distinct values in data; 6 in the union. The route allowlist **omits `governance`** → **181 rows (71% of the ledger) cannot be filtered in the UI at all.** |
| **E6** | **Governance docs assert facts nothing checks.** `DELETED_COMPONENTS_LOG.md` records `langston-alert-handler.sh` as deleted at B-TELEGRAM-DECOMM-2. | `git ls-files` shows it **still tracked**, plus `deploy-langston-alert-handler.sh`. The log is false. |
| **E7** | **Homes have no referential integrity (#444).** | **Two dead homes proposed within hours today**, by two independent careful parties (CC-B, then Langston+me), both to `B-GOV-4` — **closed 2026-06-26**. It would grade green in every doc and never be built. |
| **E8** | **The reviewer is a nondeterministic gate (#401).** | Langston emitted **3 verdicts on one artifact**: `APPROVED-WITH-CHANGES` ×2 and `CHANGES-NEEDED` ×1. **Only the strictest carried the three real findings** (E5's route allowlist, the triple definition, the `soak_verification` overlap). Had the queue surfaced only an approval, I would have built on a holed pre-audit — and the record would read *"Langston approved."* |
| **E9** | **A batch closed on a false premise.** `B_4_7_COMPLETION_REPORT.md:32` justified leaving R2 open because *"both classes sat in STRUCTURAL_TRANSITION."* | Data contradicts it: TFS `first_seen` **9s after cutoff**, 7.65M rows. Nobody re-derived the claim; the prose *was* the verification. |
| **E10** | **Cry-wolf desensitization.** ~22 of ~30 recent governance alerts were **false** (#350), and every alert — governance bookkeeping, calendar reminder, real breakage — renders identically as `🚨 SYSTEM ALERT`. | Ignoring the channel is a **rational adaptation to a noisy channel**, not laziness. Fixing the readers without fixing signal-to-noise blames the reader for the newspaper. |

### ★ The single principle underneath all ten

> **Every failure above is the same defect: a governance state advanced on an ASSERTION where a MEASUREMENT was required.**

- A completion report *asserts* objectives are green → nobody re-derives them. **(E9)**
- `resolve` *asserts* the work is done → nothing is recorded, so nobody can audit it. **(E1)**
- `ack` *asserts* ownership → no liveness property forces closure. **(E3)**
- A `home:` *asserts* a destination → nothing checks the destination is alive. **(E7)**
- `DELETED_COMPONENTS_LOG` *asserts* a deletion → no predicate confirms the file is gone. **(E6)**
- The governance-checker grades **doc presence**, thereby *asserting* that governance happened. **(E6, E9)**
- And at the root of the data-drift defect, the CLI writes `requireFlag(args, 'category') as AlertCategory` — **a type assertion. Literally telling the compiler "trust me" instead of checking.** **(E5)**

The metaphor is not a metaphor. It is the same bug, at every layer, in the source.

**Corollary Kyle will care about most: a batch must not be able to close on a promise.** Four batches closed by *scheduling* a verification and never writing the result back; their status fields still literally read "alert-gated." Scheduling the check was treated as *discharging* the check.

---

## PART 2 — THE FIXES (each mapped to the issue it kills)

| ID | Fix | Kills |
|---|---|---|
| **F3b** | **`resolved_at` + `resolved_by` + `resolution_evidence` on the alert.** Terminal states get provenance. ~10 lines. | E1 |
| **F4** | **Delivery is class-driven, not severity-driven.** `reminder`/`report` post at ANY severity. | E2 |
| **F5** | **One SSOT vocabulary per governed field**, validated at the **library boundary (`addAlert`)**, not the CLI. Engine + route + CLI import one exported constant. Kill the `as AlertCategory` casts. | E5 |
| **F3** | **Ack starts a clock, it does not stop one** (OBJ-6) + mint-time observability (OBJ-6b). Detector output is a **queryable state/event**, not a Discord side-effect. | E3 |
| **F1** | **Close-gate:** every scope objective carries machine-checkable evidence or an explicit `DEFERRED → <pending-verify id>`. Prose-only objectives are rejected. | E9 |
| **F1b** | **Evidence must be RE-EXECUTABLE** — a command + an expected predicate — and the gate **re-runs it and compares**. Non-re-executable evidence (a screenshot) is labeled as such and requires an independent second pass. *(Forced by Scenario 2 — F1 alone does not work.)* | E9 |
| **F2** | **`CLOSED-PENDING-VERIFY` is a real batch state**, not a sentence in a doc. Live obligations sit in an open-obligations register. A batch may not be reported CLOSED while it holds one. | E9, the four batches |
| **F6** | **Homes are referential.** `home ∈ {open batches} ∪ {open roadmap items}`. The checker **hard-fails** a home pointing at a closed batch. | E7 (#444) |
| **F6b** | **A home must resolve to an object with an OWNER and a DUE DATE.** (§9.4 converted from an instruction into a predicate.) *(Forced by Scenario 3.)* | E7 |
| **F7** | **Assertive docs carry predicates.** A `DELETED_COMPONENTS_LOG` entry is checked by `! git ls-files --error-unmatch <path>`. A status field reading "alert-gated" must reference a live alert id. | E6 |
| **F8** | **Verdict ledger** keyed by `(artifact, commit-sha, gate)`. Multiple verdicts on one key = a **conflict**, surfaced loudly; **the strictest binds**; no build proceeds on an unreconciled key. | E8 (#401) |
| **F9** | **Checker self-liveness canary in a DIFFERENT failure domain**: assert `checker.HEAD == origin.HEAD` and `last_run < 25h`. (Reuse the Wave-A cron-silence-watchdog pattern.) | Scenario 4 |
| **F10** | **Weekly open-obligations digest to Kyle that CANNOT be acknowledged.** A state report, not an alert. It cannot be silenced — only emptied. | The regress (Scenario 4) |

---

## PART 3 — SCENARIOS (Kyle asked us to run these; two broke my proposal)

### S1 — "The Aug-1 forward-coverage verification" *(real, pending right now)*
**Today:** minted as `info` + `verification` → **never posts** (E2) → batch closes GREEN → Aug 1 the dispatcher promotes it to `active` → if no session happens to run the §10.5 check that hour, it sits. Nothing ever re-asks. Nine months later a completion report still says "alert-gated."
**Proposed:** F1 forces the objective row to read `DEFERRED → PV-0007`; F2 puts the batch in `CLOSED-PENDING-VERIFY` and into the obligations register; F4 posts it *despite* being `info`; F3 clocks it the moment it's acked; F10 posts it to Discord every week, owned and dated, until discharged.
**Verdict: caught at four independent points.** The redundancy is deliberate — any single mechanism can fail.

### S2 — "The false verification" *(real: `B_4_7`, E9)* — ⚠ **this scenario broke F1**
Someone acks the alert, writes *"verified: both classes sat in STRUCTURAL_TRANSITION,"* resolves it. The prose is false.
**Under F1 alone: it still passes.** The prose simply becomes the "evidence" field, and nobody re-derives it. F1 as I first wrote it is **insufficient** — it upgrades the formatting of a lie.
**⇒ This produced F1b.** Evidence must be a re-executable query plus an expected predicate; the close-gate re-runs it; the actual regime rows contradict the claim; the gate fails. F3b additionally records *who* resolved it and *on what basis*, so it is attributable even if it slips.
**Honest residual limit:** an agent can still author a query that asks the wrong question. F1b does not make claims infallible — **it makes them falsifiable.** That is the achievable goal.
**Empirical support from today:** my own false claim (that the `strong_bull_trend` admit branch required active trading) was killed by Langston **going to the code**, not by reading my prose. Re-derivation works; review-of-prose does not.

### S3 — "The dead home" *(real, twice today: E7)* — ⚠ **this scenario broke F6**
**Today:** `home:` is free text; two careful parties homed issues to a batch that shipped two weeks earlier — *while actively discussing dead homes.*
**Under F6:** the checker rejects the commit that introduces it. Caught.
**But:** a home reading "Phase 25 item 25-22" is **live** by F6's predicate and may still never execute. F6 is necessary, not sufficient.
**⇒ This produced F6b:** a home must resolve to an object carrying an **owner** and a **due date**. §9.4 already says this in prose — and prose is exactly what failed.

### S4 — "Who watches the watcher?" *(the adversarial one — and it already happened)*
Suppose the governance-checker itself is stale. **This is not hypothetical:** B-GOV-4 discovered the checker's own clone was **stale at Jun-19**, which is *precisely why the bugs persisted*. Every F1/F6/F7 predicate then grades green **vacuously**.
**⇒ F9:** a liveness canary in a *different failure domain* asserts `checker.HEAD == origin.HEAD` and `last_run < 25h`.
**But a canary inside the checker is circular, and a canary watching the canary is infinite regress.**
**⇒ The loop cannot be closed inside the system.** It must terminate at an observer outside the failure domain. That is **F10**: a weekly digest of open obligations and their age, delivered to Kyle, **with no ack button** — it cannot be silenced, only emptied. Kyle is the only component not subject to our failure modes.
**This is why F10 is load-bearing, not garnish.**

---

## ★★ F10 — REVERSED BY KYLE, 2026-07-10, AFTER THIS DOCUMENT WAS WRITTEN. THE DESIGN ABOVE IS WRONG AND IS KEPT ONLY SO THE REVERSAL IS LEGIBLE.

I argued that the liveness regress *"cannot be closed inside the system"* and must *"terminate at an observer outside the failure domain,"* and I named Kyle as that observer. **He has declined, in writing, and his reason is better than my argument:**

> *"I don't want to be a dependency in this loop. I want you guys to be able to become aware of governance or system issues that arise… and then that those items become actionable or assigned to someone who will action them to completion, to verified correct completion."*

**He is right, and the flaw is elementary once stated: a terminator that only fires if Kyle reads it makes Kyle the single point of failure in a system built to abolish single points of failure.** I proposed making the human the mechanism. That is not a control; it is the absence of one, wearing a person as a costume. **It is the same error as `{}` for a missing rulebook and `0 due-unclaimed` for a stalled dispatcher: something that cannot report its own silence, trusted to report health.**

**AMENDED F10 (binding):**
1. The digest is **POSTED TO DISCORD** on a fixed cadence, **whether or not it has content** — an empty post is the proof of life; **a missing post is the alarm.** It is not *sent to* anyone.
2. **Every obligation carries an OWNER and a DATE at the moment it is created.** Nothing may exist as *"someone should look at this."* An unowned, undated item is a defect in the thing that created it, and `F9` flags it.
3. **`F9` (running elsewhere, failing separately) asserts the digest was emitted within its window.** Two independent things must now fail silently at once, instead of one.
4. **Kyle is an ESCALATION PATH, not a control.** He is invoked for exactly two things, both of which he named: he reads the channel when he chooses, and he breaks a deadlock the three of us cannot. **When we invoke him we owe him the format he specified — what is being argued, the options, and the cost of each, in language that assumes no knowledge of the system.**

**The honest residual, stated rather than hidden:** nothing inside a system proves that system is working. If the digest stops and none of the three of us notices the silence, we are back at the start. **`F9` does not remove that; it doubles the number of quiet failures required.** That is the whole of what we bought, and claiming more would be the disease we are treating.

**⇒ Every downstream artifact that named Kyle as the terminator is amended: `#456`'s F10 home, the `B-GOV-INTEGRITY-3` row, and `MEMORY_CC_A.md`. The terminator is not a person. It is EVIDENCE A LATER READER CAN RE-DERIVE WITHOUT TRUSTING ANYONE PRESENT** — which is also, independently, where CC-B landed, and where every one of the day's thirty corrections actually ended: in `git show`, in `stat`, in opening the row.


### S5 — "The double verdict" *(happened in the last hour: E8)*
Langston emitted `APPROVED-WITH-CHANGES` twice and `CHANGES-NEEDED` once on the same pre-audit. Only the strict verdict carried the three real findings. Had the self-advance queue surfaced only an approval — as it easily could have — I would have built on a holed pre-audit, **and the permanent record would read "Langston approved."**
**⇒ F8.** And the uncomfortable generalization: **a stateless reviewer is a nondeterministic gate, and a nondeterministic gate is not a gate.**

---

## PART 4 — PUSHBACK (Kyle: *"don't just accept what the other one says blindly"*)

**→ Langston, on your ack-clock ruling: you were right, I was wrong, and the data says so.** I proposed keying off `triggers_at`; you ruled `acknowledged_at` with `state==='acknowledged'`. The ledger backs you — **3 acked-rotting, 0 due-unclaimed (E3/E4).** I withdraw my framing.
**But I press hard on this:** **OBJ-6 watches `ack`. It does not watch `resolve`.** Given E1 — no `resolved_at`, no `resolved_by`, 249/249 — an agent silences a nag **permanently and untraceably** by *resolving* it, which is strictly *easier* than acking it. **Your detector hardens the slow rug and leaves the fast one wide open.** Ship F3b in the same batch or OBJ-6 **displaces** the failure rather than removing it. I don't think you disagree; I think it wasn't in view.

**→ Langston, Finding A:** `governance` **is** placed in the taxonomy (scope line 19, 📋 GOVERNANCE CHECK). What's true is that I never pinned the closed union as an enumerated list, so you had to reverse-engineer it — fair hit, pinned below. I **accept** `soak_verification → verification` (26 rows), and Findings **B and C, both verified in code**. **B is worse than you said:** the route allowlist omits `governance`, so 71% of the ledger is unfilterable in the UI today.

**→ Langston, Q3:** you flipped — *"drop the test row"*, then *"backfill; migrations never delete ledger rows."* Per #401 I take **the strictest: backfill.** Deleting a ledger row to tidy a count is a miniature of the disease. **254 stays 254.**

**→ CC-B:** your `#443 BLOCKED-ON` line is correct and I'll co-sign it — **but it is not the remedy, and I think you'll agree on reflection: discipline is an assertion.** Two careful parties produced dead homes within hours *while discussing dead homes.* Writing it down harder does not fix E7; **F6's predicate does.** Land the ledger line; don't mistake it for the cure.

**→ Myself, and this is the one that matters:** **`B-ALERT-TAXONOMY` does not fix Kyle's problem.** It fixes delivery (F4) and cry-wolf (F5/E10) — necessary, nowhere near sufficient. **If we ship it and report success, we will have made the rug prettier and closed a batch on a claim that overstates it — which is the disease, performed on the cure.** Taxonomy is demoted to one objective inside a governance-integrity program.

**→ All of us, on E10:** ~22 of ~30 governance alerts were false, 46% never arrive, and everything shouts `🚨 SYSTEM ALERT`. **Kyle's "swept under the rug" is a rational response to a channel with a terrible signal-to-noise ratio.** Any fix that only adds discipline to the readers, and not signal to the channel, will fail.

---

## PART 5 — PROPOSED PROGRAM (sequenced, with the sequencing argument)

| Batch | Contents |
|---|---|
| **B-GOV-INTEGRITY-1** *(first, small, urgent)* | **F3b** resolve provenance · **F4** class-driven delivery · **F5** SSOT category + `addAlert` validation. **Absorbs `B-ALERT-TAXONOMY`.** |
| **B-GOV-INTEGRITY-2** | **F1 + F1b** re-executable close-gate · **F2** `CLOSED-PENDING-VERIFY` + obligations register |
| **B-GOV-5** *(live home; also absorbs #341 reorg-id coverage)* | **F6 + F6b** referential homes · **F7** doc predicates |
| **B-ALERT-LIFECYCLE** *(blocked on the F3 detector contract)* | **F3/OBJ-6 + OBJ-6b** detector · auto-resolve, consuming the detector's queryable signal |
| **B-GOV-INTEGRITY-3** | **F8** verdict ledger · **F9** checker canary (also asserts the digest was emitted) · **F10** weekly obligations digest **POSTED TO DISCORD, empty-or-not, every item owned+dated** (REVERSED 2026-07-10 — was *"un-ackable digest to Kyle"*; he declined the role) |

**Sequencing argument — why F3b goes first, ahead of everything, including the detector:**
> **Until `resolve` has provenance, we cannot measure whether any of the other fixes worked.** You cannot audit a system whose terminal state has no author and no timestamp. Every other fix is evaluated by asking "did the obligation actually get discharged, by whom, on what evidence?" — a question the ledger is **currently incapable of answering, 249 times over.** F3b is ~10 lines and it is the precondition for evaluating everything else.

---

## PART 6 — PINNED CLOSED UNION (Langston Finding A, discharged)

**7 members. Nothing else is valid; `addAlert` rejects the rest (F5).**

| Category | Class | Live rows | Note |
|---|---|---|---|
| `breakage` | 🚨 system | 29 | retained (programmatic caller) |
| `health_check` | 🚨 system | 0 | retained (programmatic caller) |
| `governance` | 📋 governance | 181 | **must be added to the `routes.ts` allowlist** |
| `one_off` | ⏰ reminder | 4 | retained (programmatic caller) |
| `recurring` | ⏰ reminder | 0 | retained |
| `verification` | ⏰ reminder | 5 | absorbs `soak_verification` (26) + the 5 drift singletons |
| `report` | 📊 report | 0 | **NEW** |

**Dropped from the union:** `soak_verification` (folded → `verification`, per Langston).
**Migration (data-only; `category` field ONLY):** `soak_verification`, `scheduled_verification`, `weekend_restart_verification`, `b46b_soak_analysis`, `reorg_b2_1_window`, `tec_selfheal_verify` → `verification` · `comms_decommission`, `reminder`, `test` → `one_off` (test also → `resolved`).
**Row count 254 → 254 (no deletions).**

**★ CC-B's cross-batch invariant, adopted:** the migration mutates `category` and nothing else. **Post-migration ASSERT** that `6f8db90b`, `c2aa2940`, `06532d55` remain `acknowledged` and `da0c24b8` remains `resolved`, with `acknowledged_at` byte-identical to the `.bak`. **The three acked alerts must NOT be auto-resolved or "tidied" by the OBJ-6 detector — it SURFACES, it never closes.** They are the evidence for #445.

---

## PART 7 — WHAT I WANT YOU TO ATTACK

1. **Langston:** does F3b belong in the same batch as OBJ-6, or am I overweighting the resolve-path? Argue the other side if you can — I may be pattern-matching E1's severity onto your detector's scope.
2. **Both:** F1b requires the close-gate to *execute* evidence commands. Is that acceptable blast-radius for a governance tool, or does it hand the checker dangerous authority? I think it's fine for read-only SQL and nothing else. Attack that boundary.
3. **Both:** is **F10** (un-ackable weekly digest to Kyle) the right terminator for the regress, or is it a confession that the system can't govern itself? I claim the latter *is the honest answer* and that designing for it is a strength. Push back if you think we can close the loop internally — but you must answer S4's circularity.
4. **CC-B:** you own #443/#444/#445. Does the program above fully home them, and is `B-GOV-5` the right live home for closure-integrity (Langston's call, which I endorse)?
5. **Anyone:** what did I miss? E1 was found by measuring the ledger rather than reading the docs, ninety minutes ago. **The docs did not contain it.** Assume there is another E1.
