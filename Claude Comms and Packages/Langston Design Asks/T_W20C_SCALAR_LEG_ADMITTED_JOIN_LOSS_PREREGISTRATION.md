# T-W20C-SCALAR-LEG — `admitted` JOIN-LOSS: PRE-REGISTRATION (CC-B, 2026-09-13)

⛔ **WRITTEN AND COMMITTED BEFORE THE DAY HISTOGRAM IS READ.** The query has completed; its output
file has not been opened. Langston's tightening 3: *"Pre-register what each shape means, in the file,
before you see it. A criterion written after the data is not a criterion."* The commit boundary is
what makes that checkable.

---

## 0. THE MEASUREMENT THAT PROMPTED IT

Archive side cut at the same pin end; join is **INNER**.

| stage | archive | join | lost | loss |
|---|---|---|---|---|
| `strategy_internal` | 2,014,978 | 2,014,902 | 76 | 0.004 % |
| `sqe` | 90,231 | 90,226 | 5 | 0.006 % |
| `tcl` | 23,897 | 23,897 | 0 | 0.000 % |
| **`admitted`** | **1,173** | **566** | **607** | **51.748 %** |

## 1. LANGSTON'S TIGHTENING 1, ANSWERED AGAINST MY OWN INTEREST

**566 is join OUTPUT rows** — `count(*)` over the joined relation grouped by `reject_stage`, not
distinct archive rows matched. ⇒ **if `signal_eval_provenance` holds more than one row per
`(archive_id, captured_at)`, the matched side is INFLATED and the true loss is WORSE than 51.748 %.**
That `566 + 607 = 1,173` is *consistent* with one-row-per-key but does not establish it — a
coincidence of that shape is possible when duplicates and misses offset. **Owed and pre-registered as
owed: the distinct-key recount.**

## 2. HYPOTHESIS 3 IS NOW STRUCTURALLY SUPPORTED — AT THE CODE, BEFORE THE DATA

Langston: *"A key-format or clock-skew defect in a shared writer cannot produce four orders of
magnitude — it would smear across every stage written at that site. Hypothesis 3: `admitted`
provenance is written at a different site."*

**Censused at `origin/migration/aws-supabase`.** `archiveSignalEval` writes a provenance sibling only
when the CALLER supplies one — `signal-eval-archiver.ts:~324`:
`wantProvenance = input.provenance !== undefined && provenanceCaptureEnabled(input.assetClass)`.
Coverage is therefore **per-call-site by construction**, and the archiver's own comment already
concedes `coverage < 100%, allowed by C1`.

| call site | calls | supplies `provenance:` | stages written |
|---|---|---|---|
| `xstock_spot/eval-cycle.ts` | 6 | **6** | `strategy_internal` `:613` · `sqe` `:752/:872` · `tcl` `:928/:979` · **`admitted` `:1105`** |
| `vts-runner.ts` | 3 | **3** | — |
| `active-execution-engine.ts` | 2 | **2** | `tcl` `:4230` · **`admitted` `:4611`** |
| ⛔ `signal-orchestrator.ts` | 2 | **0** | `sqe` `:1216` · **`admitted` `:1868`** |
| ⛔ `ready_to_buy_service.ts` | 2 | **0** | `rtb` `:1664` · `sqe` `:2150` |

⇒ **`admitted` is written at THREE sites, one of which supplies no provenance at all.** Every other
stage in this slice is dominated by `eval-cycle.ts`, which supplies it 6 of 6. That is a mechanism
that produces a stage-specific loss of exactly this shape, and it predicts the asymmetry rather than
being fitted to it.

⚠️ **NOT ESTABLISHED: that the orchestrator site actually fires for `xstock_spot`.** It is the active
crypto path. **The discriminator is the archive's own `source` column**, which is written at every
site — not the histogram.

## 3. WHAT EACH SHAPE MEANS — FIXED NOW, BEFORE LOOKING

**Day axis is the STAGE side** (`signal_eval_archive.captured_at`): an unmatched row has no
provenance side to bucket by. **Every bucket prints its denominator** (admitted that day) beside the
unmatched count — 607 unmatched on a day holding 620 and 607 spread over five days are different
findings.

| shape | reading, fixed in advance |
|---|---|
| **FLAT** (unmatched share roughly constant across days) | ⇒ **two-writer mixture** (§2). Both producers run continuously, so a steady share is what a per-site coverage gap looks like. ⛔ **Flat does NOT mean "systematic key mismatch"** — §2's asymmetry already refutes a shared-writer key defect. |
| **CLUSTERED / step edge at a date** | ⇒ **writer-era boundary**: a site added, removed, or its provenance argument changed. Next action is `git log -S` at that date against the five sites above, not more querying. |
| **BIMODAL** (two plateaus) | ⇒ a site **toggled twice**, or `provenanceCaptureEnabled(assetClass)` flipped. Check `archive-config` history and the asset-class gate. |
| **RAMP** (share trending) | ⇒ traffic shifting between two sites over time rather than a config change. |
| **ALL-OR-NOTHING per day** (days at 0 % or 100 %) | ⇒ the two writers are **not concurrent** — they alternate by cycle or mode, which would make the missing half a systematically different population, not a random half. ⛔ **This is the worst case for the leg** and would mean the fired arm is biased in composition, not merely thinned. |

**FALSIFIER for the two-writer hypothesis, stated now:** if the unmatched rows carry the **same
`source` value** as the matched ones, §2 is wrong and I withdraw it rather than reinterpreting it.

## 4. WHAT THIS DOES NOT TOUCH

⛔ The two-writer mechanism, if confirmed, is **outcome (2) of the bug taxonomy** — a documented,
designed partial coverage (`coverage < 100%, allowed by C1`), not a defect. The decision it forces is
whether a **51.7 % gap on the admitted stratum** is acceptable for a replay leg that reasons about
admitted signals. **That is a scope call, not a code fix**, and it is not mine to make unilaterally.
