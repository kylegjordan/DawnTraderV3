# ITEM 4 — Storage + Labeled Multi-Source Learning Design (Gate-2 deliverable)

> Item 4, Phase A. The two remaining Gate-2 design deliverables in one doc: **(A) storage for three concurrent producers** (O4) and **(B) the labeled multi-source learning substrate** (D9 reframed per Kyle 2026-06-09). Plus the settled shared-compute model (O5) for completeness. Architecture basis: `ITEM_4_ARCHITECTURE_INVESTIGATION.md` §0 + `ITEM_4_PHASE_A_PREAUDIT.md`. Kyle corrections recorded in `ITEM_4_SYSTEM_SEPARATION_SCOPE.md` §1.6.
>
> **Status:** CC first-cut for the CC↔Langston joint design (Kyle delegated the learning design to both). 2026-06-09. **Design only — no build; Gate 2 not passed.** Active trading OFF.

---

## 0. THE PRODUCER MODEL (corrected per Kyle 2026-06-09 — read first)
Three producers, but **only two are live producers before Phase 21:**
- **VTS** — the broad firehose. Always-on. Every strategy in the regime family fires; **no SQE selectivity**; calibration changes apply *up-stream* (early pipeline). Telemetry-only; never trades.
- **Paper** — the accurate real pipeline. SQE in; **one-best-signal-per-cycle**; calibration changes apply *down-stream* (full pipeline). Simulated fills via the Kraken paper system. This is the realistic picture of how the system actually filters→selects→trades.
- **Live** — **NOT a producer in item 4.** Live always places real orders (that is its only purpose); there is **no no-op live scaffold** (Kyle correction #1). Live gets an independent on/off switch (cleaved from paper) but stays un-run until Phase 21. **Consequence for storage + learning + throughput: design the substrate to ACCEPT a third producer cleanly (a `live` partition value reserved), but the only producers writing real data pre-Phase-21 are VTS + paper.** The third (`live`) partition lights up when live is built.

So everywhere below: the partition model reserves three values (`vts` / `paper` / `live`); the learning + throughput work is validated on **vts + paper** now; `live` is a clean future slot, not a stub.

---

## PART A — STORAGE FOR THREE CONCURRENT PRODUCERS (O4)

## A.1 The one partition rule (from §1.5 Q5/Q6 — settled)
Every datum the system writes is exactly one of:
- **Producer-agnostic (compute/store ONCE):** anything that is a pure function of `(symbol, cycle, market data)` — `pair_scan` rows, MCE context/indicators, raw pattern detections, raw OHLC. One physical write, no producer tag, shared by all. Per-producer copies here = pure triplication + a write-backpressure source, zero information gain.
- **Producer-scoped (per-producer, strictly partitioned):** anything that is a function of producer *policy or state* — signals, admission/selection decisions, positions, fills, outcomes, **learning**, telemetry. Each carries its producer label; never pooled across producers.

**Universe nuance (carried from Q5):** if producers ever scan different universes (live a tradeable subset, VTS the full ~300), it stays **one physical scan + per-producer filter masks/views**, never separate scans.

## A.2 D1 — the mode stamp (the producer label on every producer-scoped row)
B70 already carries a `mode` column (`vts` / `paper_sim` / `live`) + a per-hook `source`. The defect (D1): the value is currently derived from `run-mode-controller.getCurrentMode()` — **one global label** (precedence live>paper>vts) — so once two producers are on, a row gets stamped with the *globally-dominant* mode, not the mode of the producer that actually wrote it. **Fix:** the stamp becomes **producer-scoped at the write site** — each producer's archive/telemetry write passes its OWN mode explicitly (the producer knows what it is), never reading the global collapse. This is one specific case of the A1 scalar-mode-reader census disposition ("producer-scoped" class).

**Verify (O4):** with VTS + paper both simulated-on, a calibration-style query filtered to one mode returns exactly that producer's rows, zero cross-stamped rows.

## A.3 What each producer captures + redundancy decisions (Kyle: "we decide what we take in")
| Stream | VTS | Paper | Live (reserved) | Rule |
|---|---|---|---|---|
| `pair_scan` / raw detections / MCE context | — | — | — | **Producer-agnostic — written ONCE, shared** (A.1). No per-producer copy. |
| Signals generated | all candidates (firehose) | one-best/cycle (post-SQE) | post-SQE | Producer-scoped. VTS volume ≫ paper. |
| Admission/selection decision | computed, `enforce=false` (logged, not gating) | enforced | enforced | Producer-scoped. **VTS's would-admit verdict is captured** — load-bearing for learning (Part B). |
| Positions / fills / outcomes | virtual | paper-sim fill | real | Producer-scoped, strict partition. |
| Learning observations | yes (source=vts) | yes (source=paper) | yes (source=live) | **Part B** — labeled, partitioned. |
| Telemetry / counters | per-producer | per-producer | per-producer | Producer-scoped (no shared tripped/among-counters). |

**Redundancy decision:** the big saving is the producer-agnostic tier — scans/detections/context are NOT triplicated. The only high-volume producer-scoped stream is VTS's firehose signals (already today's volume); paper adds a *small* increment (one-best/cycle). So storage growth from turning paper on is modest; the throughput study (O6) measures the write-backpressure delta precisely.

## A.4 Tiering / retention (unchanged mechanism, extended to the partition)
B75 hot→warm→cold (move-not-delete; Supabase disk → Supabase Storage `dt-archive` 365d → Backblaze B2 indefinite), `data_archive_manifest` SSOT, `data_lifecycle` module_constants. **Extension:** retention policy may differ per producer (e.g., VTS firehose ages to cold faster than paper's realistic record, which we may want hot longer for calibration). Per-producer retention is a `data_lifecycle` row keyed by `mode` — a knob, decided at Gate 2 / Phase B, defaulting to today's uniform policy until there's reason to diverge.

---

## PART B — ★ THE LABELED MULTI-SOURCE LEARNING SUBSTRATE (D9 reframed)
**This is the piece Kyle delegated to CC + Langston.** Goal (his words): learn from BOTH VTS and paper, label each with context so the engine knows what it's learning from and how to use it, never blindly pool two different distributions — so the system gets better at filtering, generating profitable signals, and opening profitable trades.

## B.1 The contamination, at the source (code-confirmed)
The learning store is `outcomeFeedbackStore` (B67.4, `server/core/metrics/outcome-feedback-store.ts`):
- A per-`(assetClass, regime, strategy)` EMA (running average) of realized **net P&L %**, ~90 tuples per asset class.
- **Fed on EVERY trade close — "active or VTS" indiscriminately** (file header line 5-7; writers `vts-service.ts:945` + `paper-execution-engine.ts:1397`).
- Its output `computeOutcomeFeedbackFactor()` → a confidence **factor** that modulates regime confidence in the B67/B68 modulation chain → which feeds **admission/selection of future signals**. So it is a **closed loop**: outcomes → EMA → confidence factor → future selection.

**Today it's harmless** because active trading has been off since Phase 8 → only VTS writes. **The instant paper-active turns on (Phase 19), paper closes blend into the SAME EMA tuple as VTS closes** — two different distributions averaged together, steering future confidence off a muddle. That is D9, confirmed at the source. **Must be fixed before Phase 19.**

## B.2 Why the two distributions must not be pooled (the quant reason)
- **VTS = pre-selection sample.** Every candidate in the regime family, no SQE gate. Its outcome distribution is the **broad / unconditional** edge of a `(regime, strategy)` tuple across *all* candidates. Huge N. Good for: exploration, coverage, the **prior** on where edge exists.
- **Paper = post-selection sample.** Only SQE-admitted, one-best-per-cycle. Its outcome distribution is **conditional on passing our actual filter** — the realized performance of the **deployed policy**. Smaller N. Good for: validating that the real selection is producing profit, the **posterior under current gates**.
- Pooling them is a **selection-bias error**: VTS's volume (≫ paper) would dominate any blended average, drowning paper's realized-policy signal; and paper's conditional sample would bias VTS's broad prior. The blended EMA means *neither* question is answerable.

## B.3 The label schema (the "context" Kyle asked for)
Every learning observation carries three context labels beyond the existing `(assetClass, regime, strategy)`:
1. **`source`** — `vts` | `paper` | `live` (reserved). The primary partition. Who produced this outcome.
2. **`selection_stage`** — `pre_selection` (VTS firehose: every candidate) | `post_selection` (paper/live: SQE-admitted, one-best). Encodes the selection-bias context explicitly, so a consumer can compare like-with-like.
3. **`calibration_epoch`** — a monotonic stamp of the calibration lineage live when the outcome was produced. Captures Kyle's "up-stream vs down-stream calibration applies" distinction and prevents mixing pre- and post-calibration-change outcomes (the exact trap that data-blocked the W2.x studies). Lets the engine down-weight or exclude stale-calibration outcomes.

**The bridge between the two distributions (key design point):** VTS already **computes the SQE/admission verdict in `enforce=false` mode** (compute + log, not gate — the B3.1a gate-placement decision). So a VTS observation can be tagged with *would-it-have-been-admitted*. That means the firehose can be **re-sliced to its `would_admit=true` subset** — a *pseudo-post-selection* sample directly comparable to paper's actual post-selection sample. This is what lets us learn the broad prior from all of VTS **and** validate/tune the SQE filter by comparing VTS-would-admit vs paper-actually-admitted vs paper-realized-outcomes. Capture `would_admit` (+ the SQE score) on VTS observations.

## B.4 Store shape — single physical store, partitioned key (NOT separate stores)
- Key becomes **`(source, assetClass, regime, strategy)`** (+ `selection_stage` is a function of source for vts/paper, carried for clarity; `calibration_epoch` + `would_admit` as entry fields). Tuple count goes ~90 → ~90×(producers) ≈ 180–270 per asset class — still trivial.
- **ONE physical substrate, every row labeled** — *not* a separate store per producer. Separate stores would make cross-source comparison (the B.3 bridge) impossible. One store, partition-aware reads.
- **Writers stamp their own labels** (the D1 principle applied to learning): vts-runner/vts-service writes `source=vts`; paper-execution-engine writes `source=paper`. **No writer can write another's partition** (the single-writer-PER-PARTITION guarantee — this is what "single writer" should have meant, not one-source-only).

## B.5 Read model — purpose → partition (the engine "knows what to do with it")
The consumer (the confidence modulator, and any future calibration consumer) **never does a blind union**. Each read declares a purpose:
| Purpose | Reads | Why |
|---|---|---|
| **Broad prior / exploration** (does this tuple have edge at all?) | VTS (`source=vts`, all) | Largest N, unconditional, pre-selection. |
| **Realized-policy validation** (is our real selection making money?) | Paper (`source=paper`, post-selection) | The accurate deployed-policy distribution. |
| **Selection-quality / SQE tuning** (is the filter admitting the right ones?) | VTS `would_admit=true` slice vs paper-admitted vs VTS-all | The B.3 bridge — apples-to-apples across the gate. |
| **Modulating live signal confidence** (the closed loop today) | **the Gate-2 decision — see B.6** | — |

## B.6 ★ THE GATE-2 DECISION FOR KYLE (D9, plain-language at §5)
The one genuine choice: **when the learning loop modulates the confidence of a NEW signal, whose realized outcomes should steer it?** Three shapes:
- **(a) Source-matched (conservative default).** A paper-pipeline signal is modulated by the **paper** EMA; a VTS signal by the **VTS** EMA. Zero cross-contamination, trivially correct. Cost: paper starts cold (factor = neutral 1.0) and barely benefits from learning until it accrues enough closes; VTS's huge knowledge doesn't help the real pipeline.
- **(b) Labeled combination (recommended).** The modulator reads BOTH, combining via a **documented, governed weighting that respects selection-stage + sample size** — VTS supplies the broad **prior** (large N, exploration); paper supplies the realized-evidence **update** (smaller N, accurate). A shrinkage estimate: start from the VTS prior, shift toward paper as paper's N grows (a hierarchical/empirical-Bayes shrinkage, *not* a raw count-pool). Preserves both signals; never silently pools; paper benefits from VTS's coverage early, then earns autonomy as it accrues. **This is the truest reading of "learn from both with labels."**
- **(c) VTS-only (the old single-writer lean).** Rejected by Kyle 2026-06-09 — discards paper's realized-policy signal.

**CC recommendation:** build the **labeled, partitioned substrate (B.3/B.4/B.5) regardless** — it's a prerequisite for ALL three and is the actual separation fix. Default the live-confidence read to **(a) source-matched** for the initial cleave (simplest, provably non-contaminating, unblocks Phase 19), with **(b) the governed shrinkage blend as a fast-follow enhancement** once paper has a calibration baseline. Surface (a)-vs-(b)-now to Kyle at Gate 2; the substrate doesn't change either way, only the read policy does.

---

## PART C — SHARED-COMPUTE FAN-OUT (O5, settled — brief)
MCE / pattern / strategy / TEC computed **once per (symbol, cycle)**, published **read-only** to all producers (R-I exactly-once invariant; R-J `Object.freeze` the published context + indicators — **freeze, don't copy**). Per-producer state = positions, selection policy, learning partition, telemetry. The producer-agnostic tier of Part A *is* this fan-out's storage face. **Verify (O5):** exactly one MCE compute per symbol per cycle under concurrency — the cycle counter / telemetry must not multiply (also an O6 hard gate).

---

## §5 — OPEN DECISIONS FOR KYLE (Gate 2, plain language)
1. **What the system learns from when it sizes up a new trade's confidence.** Everything gets captured and labeled either way — simulator results tagged "broad exploration," paper results tagged "real selective trading." The choice is narrow: at the moment the system rates a fresh signal, does it lean only on results from that same world (simplest, cleanest), or does it blend the broad simulator history (lots of data) with the smaller but more-realistic paper history (weighted so the realistic data earns more say as it piles up)? Recommendation: start with the clean same-world version to get the separation shipped and Phase 19 unblocked, then add the smart blend as a fast follow. Nothing about the data we keep changes — only how the system reads it.
2. **Per-producer retention** (optional, low stakes): keep the realistic paper record "hot" longer than the high-volume simulator firehose? Default keeps today's uniform policy unless we see a reason to diverge.

---

## §6 — LANGSTON JOINT-DESIGN REVIEW ASKS (the Kyle-delegated half)
1. **Partition key shape** — is `(source, assetClass, regime, strategy)` the right grain, or do we also need `selection_stage` physically in the key (vs. derived from source)? Any consumer of `outcomeFeedbackStore.peek()` that would break on a source-qualified key — enumerate the readers (signal-orchestrator, MCE refresh, regime-phase, factor-ablation-builders all touch it) and confirm the read-model migration surface.
2. **The B.3 "would_admit" bridge** — is the VTS `enforce=false` SQE verdict actually persisted today (or only logged)? If only logged, capturing it is part of Phase B. Confirm feasibility on staging.
3. **The B.6 combination model** — is empirical-Bayes shrinkage (VTS prior → paper update) the right frame, or overkill for a ~90-tuple EMA? Propose the concrete estimator (or argue for source-matched-only as the durable answer, not just the interim).
4. **Calibration-epoch stamp** — where does the calibration lineage version come from (is there an existing calibration_ledger / version we stamp, or must we mint one)? This is the anti-mixing guarantee; it must be real.
5. **Any shared-state contamination beyond `outcomeFeedbackStore`** — are there OTHER cross-producer learning/feedback stores (cost-model priors, friction priors, SQE confidence-chain memory, pattern-pool stats) that blend VTS + active today and would contaminate once paper turns on? The census of "things that learn" — name any you find on staging.
