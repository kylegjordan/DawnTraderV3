# B-GOV-HYGIENE-ANALYST-1 — SCOPE (Step 1)

change-class: non_architecture

**Phase:** 19
**Owner:** CC-B (NEW Claude)
**Ledger home:** RUNNING_ISSUES `#547` (landed `4b75323cf`)
**Origin:** four findings surfaced by ANALYST Claude across the 2026-07-19/20 soak analysis, all endorsed by Langston, all previously un-homed. Filed by CC-B because ANALYST's lane is read-only.
**Status:** Step-1, awaiting Langston review. No code written.

---

## 0. Why this batch exists at all — read this before the objectives

Every one of these four was found, discussed, and **agreed by all parties days before it was written down anywhere.** None was forgotten through carelessness; each was endorsed and then left in Discord. Kyle's audit question — *"I cannot tell if these findings have all been recorded and their decisions locked into specific batches"* — is what surfaced them.

So this batch has a second purpose beyond its four items: it is the concrete instance behind the standing rule proposed in `#545` addendum-1 — **a hand-off is not a home.** That framing belongs in the completion report, not just here.

---

## 1. Objectives

### OBJ-1 — CR-5: the admission-lane split becomes a METHOD RULE *(highest leverage; pull-forward candidate)*

**The finding.** Pooling EXPLORATION admits together with ORGANIC selections produces a false headline. The pooled view reads as *"the fee wall killed us."* The split view shows the deliberate learning spend lost **$133.41** while genuine selections finished **+$1.37**.

**Why it outranks the other three:** it does not fix a number — **it changes what the soak MEANS.** And it is live: data is being collected under this ambiguity right now, and the next reader to pool the lanes will reach the same wrong headline.

**Verification criteria.**
1. The rule sits where the next analyst hits it **BEFORE** drawing conclusions — not in a completion report they will not read. Step-3 names the exact surface and justifies why a reader encounters it first.
2. It states the split as mandatory for any P/L-shaped claim about the soak, naming both lanes explicitly.
3. It carries the worked example ($133.41 / +$1.37) — the numbers are what make it stick.
4. ⚠️ It must NOT read as "exploration is waste." Kyle's ruling of 2026-07-20 is explicit: *"If we're losing now in order to determine how to win as much as possible, then I am OK with that. Losing to learn without improving our P/L is not OK."* The rule exists to make the learning spend **legible and accountable against P/L**, not to discredit it.

**Sequencing note for Langston:** OBJ-1 is documentation-only and independently landable. Recommend pulling it forward ahead of OBJ-2/3 rather than holding it behind code review.

#### OBJ-1 RESOLUTION — Q1 answered, three-layer placement (CC-B + OLD Claude + ANALYST + Langston, 2026-07-20)

Q1 asked: fold into the single §9.5 edit, or land separately? **The dilemma dissolved — the premise was wrong.** Three placements at three different moments, which is layering, not redundancy:

| # | Placement | Moment it fires | Batch home |
|---|---|---|---|
| 1 | `MEMORY_CC_C.md` working memory | analyst session start | ✅ DONE (`c28525222`) |
| 2 | **Note on the `closed_trades` / analytics surface** | **query time — when the error actually happens** | **THIS BATCH, OBJ-1** |
| 3 | `CLAUDE.md` §9.5 prose | audit / review time | `B-VERIFY-DISCIPLINE` (#545, owner CC-A) — folds into the single §9.5 edit, no double-edit |

**Placement #2 is load-bearing, not optional (Langston: "if only one lands, it's that one").** ANALYST supplied the decisive evidence, being the person the rule exists to catch: **they made the pooling error in the first ten minutes, before reading any governance.** A control read at session start, divorced from the moment of use, does not fire.

**★ STRONGEST FORM, adopt if not expensive (Langston):** make the pooled number **hard to get without seeing the split** — have the analytics query/endpoint surface the `admissionBasis` breakdown **by default**, rather than a note sitting beside it. **Structure beats prose**, because a note is still the fast-wrong path sitting next to the slow-right one with nothing announcing the difference. Step-3 attempts the structural form first and falls back to the note only if the endpoint shape makes it costly — and says which it did, and why.

⚠️ **Confirming evidence from CC-B, 2026-07-20, minutes after this was agreed:** CC-B queried two active-trading endpoints that returned **HTTP 404**, and a local parser silently rendered both as **"0 open positions / 0 closed trades"** — a false absence that read as a clean finding. Caught only by re-reading the RAW response. **That is the same disease at a different layer and it is the argument for the structural form:** prose asking the reader to be careful would not have caught it; a surface that refuses to emit a bare number would have. Recorded here rather than as a new issue because #545's rules already cover it (`"the command failed" ⇒ the durable record`, and rule 22 asserted-absence-needs-presence-evidence) — this is a confirming instance, not a discovery.

### OBJ-2 — CR-2: fee-drag metric computed on inconsistent bases

**The finding.** Gross is measured at **intended** entry price by design (`server/services/active-execution-engine.ts:1605-1606`), while fees and net are **actual-fill**. Dividing one by the other mixes two bases and printed **154% / 421% on a Kyle-facing dashboard**.

**The fix (ANALYST's, endorsed):** divide total fees by gross profit on **winning trades only**, with that gross computed on the **same basis the net figure uses.**

**Two things Step-2 must establish before any code:**
- ⚠️ This is **NOT** blocked by, and must not be conflated with, the phantom-price defect — that was a different failure and is already fixed (`#509` / `2a3315db3`). CR-2 is a definitional correction in its own right.
- The intended-price gross is **correct by design** (it is the honest measure of selection quality, uncontaminated by fill luck). ⇒ The defect is the **ratio**, not the gross. Do not "fix" the gross. This is rule 24 outcome (1) applied narrowly: the defect is real, but it is smaller than it first appears, and mis-scoping it would damage a working measure.

**Verification criteria.** Both halves of the ratio provably read the same basis; a named test pins it; the Kyle-facing dashboard shows a value in a possible range; §9.3 UI verification on the affected tab.

### OBJ-3 — CR-3: orphaned `target_floor_pct = 0.040` — document then delete (rule 18)

**The finding.** Its consumer — the floor-LIFT — was deliberately deleted at reorg-B2.1. **The DB row survived and still reads like a live 4% rule.**

**The argument for removal over annotation:** it has **already cost review time once** — it misled ANALYST into filing a false defect. An annotated row that still reads live will mislead the next reader too. Rule 18: no lingering legacy, and the disposition is decided at the moment of surfacing.

**Verification criteria.** Blast-radius proof that no consumer reads it (repo-wide grep per §9.5(a) census — writers, readers, mutators, deleters, schedulers — with each list stated, and any single-member list stated explicitly per rule 22); entry in `DELETED_COMPONENTS_LOG.md`; migration + rollback registered in `MANIFEST.txt`.

### OBJ-4 — CR-1: decision-record retention asymmetry

**The finding.** We permanently keep the reasoning for every trade we **TOOK** and discard it for every signal we **REFUSED**. `rtb_signals` is transient (promoted rows deleted; the live queue held 12–21 rows spanning only 07-18..07-20 while trades span 07-15..07-19).

⚠️ **Direction correction, preserved because it was corrected mid-thread by ANALYST themselves and the original statement was inverted:** the row is transient for **BOTH** taken and refused. The durable survivor is the **taken** side via `closed_trades.metadata` — which is precisely why the refused side vanishes.

**Consequence, and why it matters beyond tidiness:** the REJECTED population is exactly the counterfactual Phase-25 calibration needs, and it is being destroyed continuously. A distribution measured from the live queue samples only *what the gate declined and has not yet expired* — **a biased survivor set, not the admission population.**

**Verification criteria.** Step-2 establishes retention cost before proposing a mechanism. ⚠️ OBJ-4 is scoped here as **decide-and-document only** — if the answer is a new durable sink, that is its own batch with its own storage-policy review (`STORAGE_POLICY.md`), not a rider on a hygiene batch. Say which it is at Step-2; do not build it here by default.

---

### OBJ-1-CENSUS — Step-2 census question: can a failed query be told apart from an empty result?

**Origin.** Langston, reading CC-B's 404 incident, inferred a specific testable code defect: *a parse path where a non-200 falls through to an empty-collection default.* He was right to demand the read.

**The read (CC-B, 2026-07-20) — HYPOTHESIS FALSIFIED on the shared path.** `client/src/lib/api.ts:103-107` throws on any non-200 (`throw new Error(\`HTTP ${res.status}: ${text}\`)`), and the surrounding `catch` at :111-113 **re-throws** rather than swallowing. The shared client fetch raises; it does not coerce. **The coercion existed only in CC-B's throwaway shell script, which is not shipped code** — rule 24 outcome (3), not (1). ⚠️ Langston was reasoning from a fact CC-B had stated loosely ("my parser", without saying it was a scratch script); the premise correction is recorded because the *shape* of that error is the same one this batch is about.

**What survives, explicitly labelled HYPOTHESIS, not finding.** The throw is correct, but a **component** could still swallow it and render a confident `0` instead of an error state. `data ?? []` is a normal react-query idiom that is only safe if the error state is separately surfaced; there are 31 error-handling occurrences across 12 client components. **Unproven in both directions** — and asserting it from a grep count would be the very "absence dressed as a measurement" this batch exists to stop.

**Step-2 census (§9.5(a) form).** Enumerate every tab that renders a count or a collection; for each, state whether a **failed** query is visually distinguishable from a **genuinely empty** result. If any tab fails, that becomes a real defect **with its own named batch at that moment** — not a rider here. If none fail, the census says so explicitly **with the list enumerated**, per rule 22.

**Why this matters beyond tidiness:** a tab that renders `0 open positions` when the query failed tells Kyle the system is idle when it may be mid-outage — the exact class of silent-zero the B8.5 soak cannot afford.

## 2. Explicitly OUT of scope

- Any change to the intended-price gross itself (OBJ-2 note).
- Building a durable rejected-signal sink (OBJ-4 — decide-and-document only here).
- Any recalibration of thresholds or scoring — Phase 25 owns that.

## 3. Governance to update at Step-10

Tier 1: `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` (§1 status board + §5 decision log), `RUNNING_ISSUES.md` (`#547` → resolved-per-objective), `MEMORY_CC_B.md`, completion report.
Tier 2 (applicability judged, not defaulted): `DELETED_COMPONENTS_LOG.md` (OBJ-3, required); `SYSTEM_IMPACT_MAP.md` (OBJ-2 if the metric's read surface changes); `STORAGE_POLICY.md` (OBJ-4 only if a retention decision lands). **SYSTEM_MANUAL.md is judged NOT applicable** — no architecture, strategy, regime, filter, signal-pipeline, or math change. Stated explicitly rather than skipped silently, per §9 anti-pattern.

## 4. Questions for Langston at Step-1

1. **OBJ-1 surface:** where does a method rule actually get read before analysis? My instinct is that a completion report is the wrong home and `CLAUDE.md` is the right one — but `#545`/`#339` sequence a single §9.5 edit, and I do not want to edit §9.5 twice. Should OBJ-1 fold into that same §9.5 edit, or land separately and sooner given it is time-sensitive?
2. **OBJ-4 boundary:** do you agree decide-and-document is the right scope here, or does the continuous destruction of the rejected population make it urgent enough to build now?
3. **OBJ-2 basis:** confirm you read the intended-price gross as correct-by-design, so the fix stays confined to the ratio.
