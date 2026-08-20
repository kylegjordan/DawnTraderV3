# B-MISTAKES-FILE — COMPLETION REPORT

**Owner:** CC-A · **Closed:** 2026-08-20 · **change-class:** `non_architecture` · **Home:** #694 pieces (4) + (5) · **Issue:** #731
**Reviewed ref:** `7fe30b683` (build `490ca7a66` + Langston's four displacement conditions)
**CI 4/4 GREEN, verified PER-JOB** — run `32376805264`: TypeScript Check / Test Suite / Build / Docker Build
**Langston:** Step-1+2 merged doc r1 → r2 (2 blockers, 3 riders) → r3 (2 changes) → r4 (4 threshold conditions) · Step-4 dispatched

---

## WHAT KYLE ASKED FOR, AND WHAT HE GOT INSTEAD

**He asked for an append-only mistakes log** with a weekly pass distilling the common causes, startup reading only the short list, and the rules file referencing it.
⛔ **THE AUDIT SAID DON'T BUILD IT — IT ALREADY EXISTS.** **MEASURED, object `28c007163..216d57f8b`, population 200 commits, instrument controlled (negative → 0, positive → 1): 72 (36%) already carry a genuine self-correction record, and ONLY ONE escapes the four-word marker vocabulary ⇒ RECALL 98.6%.** Rule 28.a already forces the reasoning into the commit. **A second store would duplicate a record with nothing keeping the two honest — the #641 shape.**
⇒ **What was missing was not the log. It was (a) a consistent MARKER — four wordings, none mandated — and (b) the PATTERN layer above the instances.**

## SCOPE OBJECTIVES — CHECKLIST

| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | Instances become greppable | **YES** | trailer `MISTAKE: <slug> [<batch-id>] — <line>`; grep returns the seeded commit, negative control 0 |
| 2 | A PATTERN index, not an incident log | **YES** | `1-system-manual/MISTAKE_PATTERNS.md` — instances reachable by grep, never copied in |
| 3 | Short distilled list auto-loads at startup | **YES** | `CONDUCT.md` §13, 3-5 slots, one qualifying pattern at ship |
| 4 | Each entry names its preventing MECHANISM; retires when it ships | **YES** | lifecycle instance → pattern → RULE → MECHANISM → RETIRED |
| 5 | Weekly pass owned, fired, and writing back | **YES** | alert `8a07c40b`, 2026-08-27T09:00Z, `dedupe_key` null |
| 6 | **Piece (5): pre-audit + plan = ONE document** | **YES — ADOPTED by Langston** | this batch's scope doc IS the demonstration |
| 7 | Retirement path exercised for real | **YES** | `bare-commit` promoted `a69c480ca` → retired `490ca7a66` |

## ★★ THE GATE REFUSED ITS OWN AUTHOR'S FAVOURITE EXAMPLE

Langston's condition 4 was **no grandfathering** — *"a gate whose initial population bypassed it is a gate on paper."*
⇒ **`silence-not-evidence` — the pattern this whole week produced, and the one I was most confident about — has 3 attributed instances and ALL THREE SIT IN `B-CONDUCT-FILE`.** The 2+-distinct-batches leg fails. **It does NOT enter §13.** It is held in the index flagged `LIVE — NOT IN §13`, because an absence from §13 must never read as a retirement.
**Only `wrong-object` qualified:** 5 attributed instances across 2 batches.

## ⛔ THE DEFECT KYLE FOUND BEFORE THE FIRST PASS RAN

His question: *if a rule on the board has been PREVENTING the mistake, and it is pushed out, the mistake logically resumes.*
★★ **He was right, and the loop is worse than that: a rule that WORKS produces FEWER instances → its most-recent date recedes → most-recent-first ordering sinks it → DISPLACED → the mistake resumes → re-promoted.** **It would oscillate, paying real mistakes each lap, and punish precisely the rules doing their job.**
⇒ **ROOT: you cannot distinguish "quiet because SOLVED" from "quiet because the rule is HOLDING IT DOWN."** `silence-not-evidence`, built into the instrument designed to catch it.
✅ **REPLACEMENT RULE: CAP PRESSURE BUILDS A MECHANISM, IT DOES NOT DROP PROTECTION.** A live rule leaves §13 only when a mechanism covers its **class** — never by newness. **Cost stated, not buried: mechanism-building becomes MANDATORY, a real throughput constraint.**

## LANGSTON'S FOUR CONDITIONS ON THE THRESHOLD (3+ instances / 2+ batches, as a FLOOR)
1. **PREDICATE, NOT JUDGMENT** — the batch id in the trailer makes it one grep. *"An eyeballed 'distinct batches' is a habit."*
2. **A FLOOR, NOT A MEASURE** — the grep is **commits-only**; the never-committed retraction is *"most of my own ledger."* Cited non-commit instances count **with a resolvable ref, never on recollection.**
3. **THE SLOTS ARE THE BINDING CONSTRAINT** — ordering most-recent-first; a displaced live pattern stays flagged `LIVE — NOT IN §13`.
4. **DOGFOOD IT** — see above. **Plus: NO SEVERITY OVERRIDE.** A single severe mistake gets a **mechanism**, not a rule slot.

## ⚠️ ONE-IN-ONE-OUT FIRED FOR REAL, AND THE STALL ARRIVED THE SAME HOUR
§13 pushed `CONDUCT.md` **101 B over** the 16,384 cap and the loader's warning fired. ⛔ **I did NOT shave prose to fit — that is how the 200-line MEMORY cap died, by being met in form.** Three bullets left §11 (*no-patches, never-leave-legacy, named-home*) because each is **already** a `CLAUDE.md` rule (r15, r18, §9.4) and each fires at a **known trigger**, making them procedure not conduct.
Then the file ran out of genuine cuts — every remaining section is the authoritative home for a rule pointing at it. ⇒ **KYLE'S DECISION: raise the cap 4,096 → 6,144 tokens and revisit the whole four-file allocation once `CLAUDE.md` is slimmed.** The hook comment states plainly that **6,144 is a deferral of a trade-off, not a new budget.**

## VERIFICATION — ALL FIVE RUN, CONTROLS FIRST
**(a)** trailer greppable — **positive control first** (returns the seeded commit, slug+batch extracted mechanically), negative control on a fake slug → 0 · **(b)** **BOTH byte objects stated:** `CONDUCT.md` FILE bytes (what `statSync` checks) vs loader **EMITTED** bytes (what context pays) · **(c)** **retirement exercised for real**, two auditable commits, removed from §13 **and** the index in ONE commit · **(d)** `CLAUDE.md` r28.a references the index and the reference **RESOLVES** — checked, not assumed · **(e)** CI 4/4 per-job.

## GOVERNANCE FILES CHANGED
`1-system-manual/MISTAKE_PATTERNS.md` **(new)** · `CONDUCT.md` (§13 + §7 trailer pointer + §11 one-in-one-out) · `CLAUDE.md` (r28.a) · `.claude/hooks/load-conduct.mjs` (cap 4,096 → 6,144) · `1-system-manual/RUNNING_ISSUES.md` (#731, #732) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `MEMORY_CC_A.md` (truth + mirror) · Langston's `MEMORY.md` (§10.b) · the merged scope+pre-audit doc · this report.
**SIM: NOT APPLICABLE, judged explicitly** — §2.4 made SIM applicability conditional on a **new hook shipping**, and §3.3 recommended against one. No new component exists; the existing Layer-9 entry covers the loader unchanged. *(Stated rather than skipped, per the §9 anti-pattern.)*
**System Manual: NOT APPLICABLE** — no architecture, strategy, regime, filter, signal-pipeline or math change.
**Deploy + §9.3 UI verification: N/A** — every changed file is laptop-side or governance; the staging app reads none of them; no UI surface. CI still gated per rule 19.

## SPAWNED / TOUCHED
**#732** `trailing_stop_hit` on a plain target hit — **filed, then its mechanism RETRACTED the same day** (the stop arithmetic refutes it; the decisive `EXIT_TRIGGER` record spans only ~2h and cannot reach the event). **Severity measured: 7 of 569 rows, 7/7 winners, 7/7 at-or-above target, +$94.21, paper.** ⇒ **DEPRIORITISED by Kyle's instruction, with a tripwire riding the weekly pass** (any losing or below-target row flips it back). · **#499** (log routing/retention) referenced, not re-filed.

## HONEST RESIDUAL
**The weekly pass has never run** — its first firing is 2026-08-27, and until a dated row exists in the run log its liveness is unproven. **That is the batch's own standard applied to itself: the alert's existence is not the liveness signal; the row is.** · **`wrong-object` sits in §13 with NO mechanism** — its named home, B-MEASURE-GATE, is *approved-and-unbuilt*, which the index itself calls the state §13 exists to forbid. **The first real test of the new rule is whether that gets built or quietly queues.** · **CC-B and INFRA still do not hold `CONDUCT.md` at all** (131 and 53 commits behind) — deliberate, Kyle bringing them up within days.
