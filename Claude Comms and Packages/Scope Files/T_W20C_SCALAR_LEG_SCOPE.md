# T-W20C-SCALAR-LEG — SCOPE (CC-B, r1, 2026-09-13)

**change-class: non_architecture**

> **The declaration, with its test stated rather than asserted.** The diff is confined to
> `scripts/b5-w20c-provenance-replay.ts` — a measurement harness. It adds no engine behaviour, no
> route, no schema, no constant, and touches no core engine path. ⚠️ **It is declared at Step 1 so
> Langston grades it before code exists, and I flag the one argument AGAINST:** the harness's output
> gates roadmap item **25-12**, so a wrong number here mis-routes a phase. **If Langston judges that
> decision-weight warrants `architecture`, I take the stricter class — I will not defend the lighter
> doc-set.** *(Standing note to myself: never declare a LOWER class at close than the header he graded.)*

**Plan row:** `PHASE_19_PLAN` 2.4-FEE-c · **issue/alert:** `a3610acf-69fc-4c5b-8eb6-4eb28e19c366`
(stays ACTIVE and owned — it is this leg's own gate) · **roadmap:** 25-12 · **owner:** CC-B

---

## 1. WHAT THIS IS FOR, IN ONE BREATH

The harness replays recorded signal evaluations through today's detect path and compares the
fire/no-fire decision against what actually happened. **Tier-1 parity must reach ≥99 % before any
swept calibration number from 25-12 is trusted.** It has never cleared: **70.73 %** (2026-07-06) →
**84.07 %** (2026-08-06, interim).

**This leg adds the two legs the 08-06 run proved were missing:** (a) a **hash-verify** leg
recomputing `swh1:` over the snapshot bars and comparing, and (b) a **fed-scalars** leg pushing the
persisted `ind_*` values into the detect path instead of recomputing them from bars — separating
*drifted-window* rows from *recompute-divergence* rows.

---

## 2. ⛔ MANDATORY 1.b — PROVENANCE READ

**Corpora searched:** `RUNNING_ISSUES.md` (`#206`, `#500`, `#498`, `#502`), `SYSTEM_IMPACT_MAP.md`
(component 6, line ~2071), `SYSTEM_MANUAL.md` (Ch 11 §1.5, line 10807; table line 11858),
`BATCH_CATALOG.md`, and `git log -S` **not path-limited** (survives renames).

**TIER 1 — the harness itself.** Introduced `1284db5dcd6c93d84abf621b566bf4b41aa78a42` (2026-07-06).
Quoted verbatim, not summarised:

> *"Replay-parity study: provenance-fed W2.0c harness + post-accrual findings — coverage 100.00 % of
> 1.648M decisions, Tier-1 70.73 % (gate not cleared), root cause = the settled-bar REFERENCE leg
> (snapshot table vs engine in-memory series; RI-a checksum 33 % exact / 64 % within 0.1 %); … defined
> exit = micro-batch after the switch-on adds a settled-window integrity leg (hash or the 5
> decision-time indicators) + re-accrual alert"*

⇒ ⭐ **THIS LEG IS THE INTRODUCING COMMIT'S OWN PRE-DEFINED EXIT.** Its two legs are precisely the
"hash **or** the 5 decision-time indicators" that commit named — and `P19-B8.5b` (2026-07-13) shipped
**both** sides of that either/or into the table. The harness was never updated to consume them.

**TIER 1 — `signal_eval_provenance`.** Introduced `eab5cc37a` (2026-06-07, B-NEW-53, roadmap 19-20).
Built as the forward fix for the backward-replay wall that **three** studies hit (W2.0a Mode-A, RI-a,
W2.0b). SIM records the writer design explicitly: *"the 4 xStock hooks are in
`xstock_spot/eval-cycle.ts` … crypto hooks are the 3 in `vts-runner.ts`."*

⭐ **THAT CORROBORATES TODAY'S LANE FINDING RATHER THAN CONTRADICTING IT.** Both named writers are
**VTS-lane** producers (`eval-cycle.ts` labels its own rows `source='vts-runner'`), and the
paper/active sites were never in the design. ⇒ the VTS-only `admitted` stratum is **outcome (2),
working as designed** — the gap is that no artifact said *partial coverage* means *the trading lane
is invisible*.

**DISPOSITION (of the five): (2) — relevant, needs updating to today's intent.** The harness is
correct for what it was built to do and is one revision behind the table it reads.

## 3. ⛔ MANDATORY 1.a — ARCHITECTURAL READ

- **SIM** component 6 (signal eval archiver) carries the full provenance component set and the
  standing consumer rule: **"coverage % is reported SEPARATELY from parity %"** (Langston C1 —
  independent drop-oldest buffers can desync). **This leg keeps them separate.**
- **System Manual** Ch 11 §1.5 + the `signal_eval_archive` table row, which states the governing
  discipline for exactly this work: *"report parity before any swept number; if it can't clear the
  bar, declare INCONCLUSIVE rather than tune on a low-fidelity reconstruction."*
- **Ledger (§9.5(b-ii)):** `#206` already owns this thread end-to-end. **Nothing here is filed as a
  new finding; today's three narrowings are recorded ON `#206`'s thread and in the leg's own record.**
- **Governance gap found, and flagged as one:** neither document says the provenance instrument is
  **VTS-lane only**. `SYSTEM_MANUAL:11858` says *"Today VTS path captures admitted + sqe + tcl +
  strategy_internal"* — true, and silent on the paper path's absence. **That silence is the gap.**

## 4. THE MEASURED CONSTRAINTS THIS SCOPE INHERITS (all settled 2026-09-13, all at a ref)

| # | constraint | evidence |
|---|---|---|
| C1 | **Window pinned:** `2026-08-01T00:00:00Z` → `2026-09-11T20:09:47Z` exclusive. First xStock row falls **08-03** — the Monday; all twelve Sat/Sun in the window are absent or near-zero (0/5/21/36) vs weekday 24,492–104,478. Rule 17. | histogram artifact |
| C2 | **`reject_stage` has ZERO NULLs** on both partitions ⇒ `<> 'strategy_internal'` excludes nothing silently. | archive census |
| C3 | **The replay surface is 163 commits / 25 days / 73 of 254 closure files**, not 3 days. `73/254` is an **UPPER BOUND** (compile-time reach ≠ executed lines). | `bed70e7e8` |
| C4 | **The old sampler's no-fire arm is 100 % August / 0 % September, by construction** — stride uniform (0.1259 % vs 1/797 = 0.1255 %), cap 1,500, August stride pool 2,032, `Append` scans August first. | `7612ffa64` |
| C5 | **The `admitted` stratum is 100 % VTS / 0 % paper**, 566 / 541+66, zero overlap, distinct-key confirmed (2,129,591 rows = 2,129,591 keys). | `38982b31f`, `4d702fb8a` |
| C6 | **66 deploy events inside the pin**, from the snapshotted reflog; one **9.4-day** no-deploy gap (08-07→08-16). | `be70ba2b8` |

---

## 5. NUMBERED OBJECTIVES, each with its verification criterion

### ⛔ OBJ-0 — FIX THE SAMPLER FIRST. Everything else is unidentified until this lands.
Replace both arms with: one dedup rule applied to **both** (`DISTINCT ON` leading its own `ORDER BY`),
ordering and striding **outside** the dedup on `(captured_at, archive_id)`, and a **rank-space stride
per (arm × era) cell** replacing the id-space modulo.
**VERIFY:** (a) the no-fire arm's day histogram is no longer confined to one month — September share
**> 0**; (b) realised sampling fraction published **per cell with its denominator**; (c) ⭐ **the
stride is MUTATION-PROVED** — neuter it to `WHERE true` and the per-day histogram **must move toward
the densest days**. *(Pre-registered with its expected direction before the run.)*
⚠️ **A global stride constant is refused by the data: 2,014,902 vs 114,689 = 17.6 : 1.**

### OBJ-1 — THE HASH-VERIFY LEG
Recompute `swh1:` over the snapshot settled bars and compare to the persisted `settled_window_hash`.
**VERIFY:** every sampled row lands in exactly one of {hash-match, hash-mismatch, hash-absent}, the
three sum to the denominator, and a **deliberately corrupted bar** flips a match to a mismatch
(positive control — the instrument is shown able to fail before its silence counts).

### OBJ-2 — THE FED-SCALARS LEG
Feed the persisted `ind_vwap/ind_atr/ind_sma/ind_high24h/ind_low24h/ind_current_volume` into the
detect path instead of recomputing from bars.
**VERIFY:** a presence-grep at the ref shows the six identifiers present in the harness (the 08-06
run's reach failure was exactly their **absence**); and parity is reported **split by hash-match
status**, which is the whole point — it separates drifted-window rows from recompute-divergence rows.

### OBJ-3 — THE GATE TEST, REPORTED HONESTLY
Re-run Tier-1 against ≥99 %.
**VERIFY:** ⛔ **the figure is published carrying its stratum IN THE SENTENCE, never a footnote:** on
the `admitted` stratum it describes **the `vts` lane only** and says nothing about paper-mode signal
quality. Coverage % reported **separately** from parity % (SIM C1). **A result below 99 % is declared
INCONCLUSIVE, not tuned on** (System Manual's own discipline for this work).

### ⛔ OBJ-4 — THE TRIPWIRE, APPLIED TO THIS LEG'S OWN OUTPUT
Per `MISTAKE_PATTERNS.md` `population-narrowed-by-construction`: **before the run, state each
stratum's denominator AND what it excludes.** Known exclusions to carry: the paper lane (C5), any
month the sampler still cannot reach (C4), and the lane mix of the other three stages, which is
**UNMEASURED — neither known-`vts` nor known-mixed.**

---

## 6. EXPLICITLY OUT OF SCOPE

- ⛔ **The era axis.** Langston's ordering ruling: with the sample August-only, era strata *are* the
  sampling defect relabelled, and **a stratifier collinear with the confound absorbs nothing.**
  Re-ask **after** OBJ-0 re-draws. When it returns it uses **deploy time from the reflog** (66 events),
  not commit time, and cuts boundaries on the `#1016` runtime predicate rather than a raw commit count.
- ⛔ **Supplying provenance at the three paper-lane sites** — that is `B-PAPER-LANE-PROVENANCE`
  (`#1059`), placed at 2.4-FEE-c-ii. **Rider: the three sites are necessary, NOT sufficient —
  `provenanceCaptureEnabled(assetClass)` gates the write too, and that failure is silent.**
- ⛔ **`scripts/**` type-check coverage** — `B-SCRIPTS-TSC-COVERAGE`, placed at 2.4-FEE-e.
- ⛔ **Clearing the ≥99 % gate on a `vts`-only result.** Langston: the answer is **no**, and whether
  it is ever offered is **Kyle's call**, not settled here.
