# B-EXIT-PROVENANCE — COMPLETION REPORT

**Batch:** `B-EXIT-PROVENANCE` (+ its close gate `B-EXIT-PROVENANCE-TICKER-RETENTION`, `#911`)
**change-class:** architecture
**Owner:** CC-C (Claude Analyst) · **Phase:** 19 · **Plan rows:** `PHASE_19_PLAN.md` 1 and 2
**Status:** ✅ **CLOSED 2026-08-30** — data in **and** the decision taken (the two-part close condition, `workflow-10-governance`).

---

## 0. ⛔⛔ WHY THIS REPORT IS LATE, STATED FIRST

**The governance for this batch was NOT landed when the code shipped, and the batch was surfaced by the automated governance checker, not by me.** Alert `2200283b` — *"Governance overdue: B-EXIT-PROVENANCE code pushed 66h ago, no governance push"* — fired 2026-08-30T03:55Z and is correct.

**MEASURED, WITH POSITIVE CONTROLS.** Before this commit:
| document | B-EXIT-PROVENANCE | ✅ control (`B-MBIM-SWITCH-ON` / `B-GRID-REPRESENTABILITY`) |
|---|---|---|
| `BATCH_CATALOG.md` | **0** | 1 / 1 |
| `PHASE_HISTORY.md` | **0** | 1 / 1 |
| completion report | **absent** | present |

⇒ **Three Tier-1 documents were missing for a batch that ran Steps 1-10 and deployed.** `ef1633cce` did land the Step-10 **SIM + System Manual** content — so the miss is not "governance was skipped", it is **"governance was landed for the code, and then the batch shipped more code (the `#911` close gate, `ed86a758e`) and never came back."**
★ **THE LESSON, and it is the one worth carrying: a batch held OPEN by a close gate has a governance obligation that fires TWICE — once when the body ships, once when the gate closes. Only the first fired.** ⚠️ **And the second was never going to fire on its own, because the batch had no PROGRESS REPORT** — the artifact whose entire job is to hold an open batch's state until its gate closes. **`workflow-10-governance` mandates one for exactly this shape and it was not written.**
**DISPOSITION (§9.4 #5 — no new work): the progress-report rule already exists and already covers this; what was missing was compliance, not a rule.** Recorded here so the next reader sees the mechanism rather than the excuse.

---

## 1. WHAT THE BATCH IS FOR

**Every fill records WHICH price source drove it, HOW STALE that price was, and an INDEPENDENT cross-check — so a trade proves its own prices instead of being reconstructed later.** 14 columns on `closed_trades`.

**Why it needed the `#911` gate (Langston's Step-4 ruling):** `#741` is an **order-book** defect. On crypto the fill walks the live WS mini-book — **the suspect**. A cross-check sourced from that same book *agrees with itself by construction and proves nothing.* So the witness had to come from a **separate socket**: the archiver's ticker snapshot. **Batch 1 could not close until that landed.**

---

## 2. OBJECTIVES

| # | objective | result | evidence |
|---|---|---|---|
| 1 | Every close records its price **source** | ✅ **19/19** | table in §3 |
| 2 | Every close records its price **producer** (finer than source) | ✅ **19/19** | table in §3 |
| 3 | Every close carries an **independent** ticker witness (`#911`) | ✅ **17/19; 17/17 where it CAN exist** | §3 + §4 |
| 4 | The witness must be genuinely independent, not the fill's own book | ✅ | `depth-source.ts:86-87` — *"written by the ARCHIVER off a SEPARATE socket … that independence is the entire value of the column"* |
| 5 | The two asset classes must not silently mean the same thing | ✅ | `depth-source.ts:89-93` states the xStock asymmetry **in code and in the schema comment** |

---

## 3. ⛔ THE DATA — the close condition's first half

**Population: every close with `closed_at IS NOT NULL` at or after `2026-08-27 10:00:00+00` (the `#911` deploy, `ed86a758e`). Read live 2026-08-30.**

| asset class | closes | has source | has producer | witness bid | witness ask | window |
|---|---|---|---|---|---|---|
| `crypto_spot` | **13** | **13** | **13** | 11 | 11 | 08-27 → 08-30 |
| `xstock_spot` | **6** | **6** | **6** | **6** | **6** | 08-27 → 08-29 |

✅ **THE EXIT STAMP IS PROVEN ON REAL DATA: 19 of 19, both asset classes, both close reasons (`stop_hit` and `target_hit`).** The plan row's gate — *"awaiting first post-deploy close to prove the exit stamp on real data"* — is satisfied **nineteen times over**, not once.

---

## 4. ⚠️ THE WITNESS GAP — NAMED, EXPLAINED, AND MEASURED RATHER THAN EXCUSED

**2 of 13 crypto closes carry no witness. BOTH ARE `TRUMP/EUR`** — every one of the 11 `/USD` closes has one.

**CAUSE, MEASURED WITH A POSITIVE CONTROL — it is the archive's UNIVERSE, not the witness wiring:**
| `crypto_spot_ticker_snap`, last 3 days | rows |
|---|---|
| `%/EUR` | **0** |
| ✅ **CONTROL** `%/USD` | **698,794** |

⇒ **The crypto ticker archive holds no `/EUR` pairs at all**, so on a `/EUR` close the witness has nothing to read. **The witness is fail-open by design** (`depth-source.ts` — *"returns `null` on any miss or throw… it must never be able to block or delay a close"*), so a null is **correct behaviour**, not a defect.
⇒ ✅ **ON THE POPULATION WHERE THE WITNESS CAN EXIST, COVERAGE IS 17/17 — 100%.**

⛔⛔ **AND THE GAP HAD NO LIVE HOME UNTIL NOW — `#954`.** It was recorded **inside plan row 3b.c**, which **I withdrew on 2026-08-29** when `#944` turned out to be a timing artifact. ★ **WITHDRAWING THE FINDING ORPHANED A SEPARATE, STILL-VALID OBSERVATION THAT HAD RIDDEN INSIDE IT.** *(Mechanism worth carrying: a withdrawal must be scoped to the CLAIM, not to everything written in the same row — §9.4 disposition 5 dissolves a finding, never the facts collected beside it.)*

---

## 5. THE DECISION — the close condition's second half

⛔ **A window that has merely elapsed does not close a batch.** The decision taken, by CC-C, 2026-08-30:

> ✅ **`B-EXIT-PROVENANCE` CLOSES.** The exit stamp is proven at 19/19 across both asset classes; the independent witness is proven at 17/17 on the population where it can exist. **The `/EUR` shortfall is an archive-universe gap, not a batch defect, and it is homed at `#954` rather than left inside this report.**

⚠️ **AND THE COLUMN IS ALREADY EARNING ITS KEEP, which is the strongest argument that the design decision was right:** the machinery audit's §9.1 read `exit_price_producer` across the stamped population and established — independently, by a reader who had never seen the batch — that **every exit decision reads a midpoint, 23 of 23, with zero from any last-trade producer.** **That finding is only expressible because this batch shipped.**

---

## 6. GOVERNANCE FILES CHANGED

- `1-system-manual/BATCH_CATALOG.md` — batch entry added (was absent)
- `1-system-manual/PHASE_HISTORY.md` — phase-19 status row added (was absent)
- `1-system-manual/PHASE_19_PLAN.md` — rows 1 and 2 moved to CLOSED with the data
- `1-system-manual/RUNNING_ISSUES.md` — `#911` closed; `#954` opened for the `/EUR` archive gap
- `Claude Comms and Packages/Batch Completion/B_EXIT_PROVENANCE_COMPLETION_REPORT.md` — this file
- *(Landed earlier at `ef1633cce`: `SYSTEM_IMPACT_MAP.md` + `SYSTEM_MANUAL.md` content.)*

---

## 7. ⚠️ KNOWN LIMITS — stated, not buried

1. **`/EUR` pairs have no witness and will not until the archive universe widens.** `#954`.
2. **The witness is a LAGGED observation, not a simultaneous one** — `depth-source.ts` returns `capturedAtMs` precisely so the lag is readable on the row rather than assumed to be zero. **Any analysis using it must read that column.**
3. ⛔ **THE WITNESS IS NOT INDEPENDENT ON xSTOCK, AND THE 6/6 COVERAGE ABOVE MUST NOT BE READ AS 6 CORROBORATIONS.** `depth-source.ts:89-93`: the xStock fill's own depth-walk reads **the same table** — *"the stamp is a CONSISTENCY record … it CANNOT corroborate the price against a second feed."* **Two different epistemic values behind one column name.** ★ *This is now the load-bearing reason `F-G-2`'s xStock legs are held (plan 3b.d).*
4. **Provenance is enforced by a source-text-matching unit test, not a database constraint** — the columns are plain `VARCHAR(40)`. A new producer value would be caught by the test suite, not by the schema.
