# T-W20C-SCALAR-LEG — `admitted` JOIN-LOSS: RESULT (CC-B, 2026-09-13)

Reads against `T_W20C_SCALAR_LEG_ADMITTED_JOIN_LOSS_PREREGISTRATION.md`, committed at **`63dc5927c`**
before the output file was opened. ⛔ **The pre-registration is NOT edited** — its one factual error is
corrected here, in §4, rather than tidied away in place.

---

## 1. THE COMPOSITE KEY IS EXONERATED

| | |
|---|---|
| admitted rows (pin window) | **1,173** |
| matched on `(archive_id, captured_at)` | **566** |
| matched on `archive_id` **regardless of timestamp** | **566** |
| **id matches but timestamp differs** | **0** |
| **no provenance row at all** | **607** |

⇒ **Not a key-format or clock-skew defect.** The provenance rows do not exist. One of the two
hypotheses I set out is dead on the first line, which is what the two-column split was for.

## 2. THE HISTOGRAM CAME BACK **FLAT** — the pre-registered reading is *two-writer mixture*

29 days present. Unmatched share: **min 43.5 % · max 58.1 % · mean 51.7 % · spread 14.6 pp.** No step
edge, no plateau pair, no ramp, and no all-or-nothing day. Per the pre-registered table, **FLAT ⇒
two-writer mixture**, and explicitly **not** "systematic key mismatch".

⚠️ **AND A READING I FORMED AFTER SEEING IT, WHICH THE NEXT TEST KILLED — recorded because it was
wrong.** The per-day matched/unmatched difference sits in −3..+7 around zero, and I read that as
*one decision producing two archive rows*. **The pairing test refutes it outright:** every
`(symbol, captured_at)` key holds **exactly one** row — 607 keys with one unmatched row, 566 with one
matched row, and **no key holding both.** There is no double-write. The near-1:1 ratio is a volume
coincidence between two lanes, nothing more.

## 3. THE PRE-REGISTERED DISCRIMINATOR — `source` — AND IT IS CLEAN

| `source` | `mode` | matched | n |
|---|---|---|---|
| `vts-runner` | **`vts`** | ✅ **t** | **566** |
| `signal-orchestrator` | **`paper_sim`** | ⛔ f | **541** |
| `active-execution-engine` | **`paper_sim`** | ⛔ f | **66** |

**The falsifier did not trigger.** Sources do not overlap at all: every matched row is
`vts-runner`/`vts`, every unmatched row is `paper_sim`. The two-writer hypothesis stands.

⛔⛔ **AND THE SPLIT IS NOT A COVERAGE ACCIDENT — IT IS THE LANE.**

> **The harness's `admitted` stratum is 100 % VTS and 0 % paper trading, by construction.**

`CONDUCT.md` §4 is explicit that **VTS is not the trading pipeline and did not replace paper
trading** — it is a separate system that deliberately generates many virtual trades for learning.
⇒ a replay leg reasoning about admitted signals is, on that stratum, reasoning about the **learning
lane only**, and cannot see a single paper-mode admission.

**The mechanism, at the code** (`archiveSignalEval` writes a provenance sibling only when the CALLER
supplies one — `signal-eval-archiver.ts:~324`):

| call site | stage | `source` | supplies `provenance:` |
|---|---|---|---|
| `xstock_spot/eval-cycle.ts:605/:749/:869/:925/:976/:1102` | `strategy_internal`·`sqe`·`tcl`·**`admitted`** | `vts-runner` | ✅ **YES** (6 of 6) |
| `vts-runner.ts:2821/:5123/:5214` | **`admitted`**·`sqe` | `vts-runner` | ✅ **YES** (3 of 3) |
| ⛔ `signal-orchestrator.ts:1209/:1858` | `sqe`·**`admitted`** | `signal-orchestrator` | **no** |
| ⛔ `active-execution-engine.ts:4223/:4604` | `tcl`·**`admitted`** | `active-execution-engine` | **no** |
| ⛔ `ready_to_buy_service.ts:1657/:2143` | `rtb`·`sqe` | `ready-to-buy` / `signal-orchestrator` | **no** |

**Every provenance-supplying site is on the VTS lane. Every paper-mode site supplies none.** That is
why three stages lose 0.004 % and `admitted` loses 51.7 %: the other stages are dominated by the
VTS-lane writer, and `admitted` is the stage where the paper lane writes in volume.

## 4. ⛔ CORRECTION TO THE PRE-REGISTRATION — `substring-not-thing`, mine

The pre-registration's table records `active-execution-engine.ts` as supplying provenance (2 of 2).
**That is false.** Its two `provenance:` lines are at `:973` and `:1161` and are **price-producer
parameters** (`{ producer: PriceProducer; source: string; observedAtMs }`) — nothing to do with
`archiveSignalEval`. I counted a matching STRING file-wide and called it a matching THING.

Re-censused properly by walking each `archiveSignalEval(` call body to its matching paren and testing
for a `provenance:` key **inside that body** — the table in §3 is that census.

⚠️ **The error ran AGAINST the conclusion, not for it** — correcting it makes the lane split cleaner,
since `active-execution-engine` moves from "supplies provenance yet unmatched" (an anomaly needing an
extra mechanism) to "supplies none, unmatched" (the same mechanism as the other two). **Being lucky in
the direction of the error is not a defence of the method.**

## 4b. ✅ THE BINDING RECOUNT — DISCHARGED, AND 566 IS A DISTINCT COUNT

Langston, binding: *"566 does not appear in any published artifact until the recount lands, or it
appears as the DISTINCT-derived figure with that provenance stated."* Measured:

| | |
|---|---|
| join OUTPUT rows | **566** |
| distinct `archive_id` matched | **566** |
| distinct `(archive_id, captured_at)` keys matched | **566** |

All three agree, so the matched side was never inflated. And on the whole provenance slice for this
pin: **2,129,591 rows, 2,129,591 distinct `(archive_id, captured_at)` keys, duplicate excess 0** — the
sibling really is 1:1, tree-wide for this population, not merely on the admitted subset.

✅ **⇒ the 51.748 % loss stands exactly as stated, and 566 may now be published as a distinct count.**
⭐ **Internal consistency worth stating: 2,129,591 provenance rows equals the join total across all
four stages (2,014,902 + 90,226 + 23,897 + 566), so every provenance row in the slice joins to an
archive row. The loss is entirely one-directional — archive rows without a sibling, never the reverse.**

## 4c. ⛔ THE LEG'S CLAIM IS NARROWED TO THE `vts` LANE, IN THE RECORD, NOW

Langston's ruling: the fork is **not** either/or, it is **both, sequenced** — narrowing alone leaves a
≥99 % parity gate reading as a pipeline claim while measuring the learning lane; supplying provenance
alone leaves today's artifacts overstated.

> ⛔⛔ **ANY PARITY FIGURE THIS LEG PRODUCES ON THE `admitted` STRATUM DESCRIBES THE `vts` LANE ONLY.
> IT SAYS NOTHING ABOUT PAPER-MODE SIGNAL QUALITY.** The stratum label travels **with the figure**, in
> the sentence that states it — **never in a footnote.**

The sequenced second half is placed: `HOME: B-PAPER-LANE-PROVENANCE, owner CC-B, PHASE_19_PLAN row
2.4-FEE-c-ii, immediately after 2.4-FEE-c`.
⛔ **Its rider, binding and easy to lose: the three sites are NECESSARY, NOT SUFFICIENT —
`provenanceCaptureEnabled(assetClass)` gates the write too, so supplying the object without the class
flag reproduces the SAME ZERO on a NEW mechanism, and that failure is SILENT.**

### ⛔ SCOPE OF THE `vts`-ONLY LABEL — ADMITTED STRATUM ONLY (Langston, binding)

⚠️ **THE LANE CENSUS WAS RUN ON THE `admitted` STRATUM ALONE** — 566 + 541 + 66 = 1,173. The
whole-slice figure (2,129,591 rows = 2,129,591 distinct keys = the four-stage join total) establishes
**uniqueness and one-directionality. It does NOT establish LANE COMPOSITION.**

⇒ **The lane mix of `strategy_internal`, `sqe` and `tcl` is UNMEASURED — not known-`vts`, not
known-mixed.** A later session may neither
- generalise upward — *"the whole slice is `vts`"* — nor
- invert it — *"the other stages are mixed, therefore representative."*

⛔ **Either reading would be a FRESH by-construction narrowing wearing today's correction as cover**,
which is precisely the pattern filed as `population-narrowed-by-construction`. **Measure the lane mix
per stratum before any claim that rests on it.**

## 5. DISPOSITION

Bug-taxonomy **outcome (2) — working as designed, and UNADDRESSED.** The archiver's own comment
concedes `coverage < 100%, allowed by C1`; nothing here is broken code. What is unaddressed is that
**the design makes the paper lane unreplayable**, and no artifact said so.

⛔ **This is a SCOPE CALL, not a code fix, and it is not mine to make unilaterally.** The question for
the leg: a replay that can only see VTS admissions cannot speak about paper-mode signal quality —
so either the leg's claim is narrowed to the VTS lane explicitly, or provenance has to be supplied at
the three paper-lane sites before the leg can mean what it was scoped to mean.

**Third "by construction" defect found on this leg today**, after the closure census and the
August-only sampler. All three narrowed what the replay can see; none was recorded anywhere.
