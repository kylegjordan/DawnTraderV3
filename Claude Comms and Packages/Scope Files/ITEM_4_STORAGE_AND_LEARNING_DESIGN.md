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
B70 already carries a `mode` column (`vts` / `paper_sim` / `live`) + a per-hook `source`. The defect (D1): the value is currently derived from `run-mode-controller.getCurrentMode()` — **one global label** (precedence live>paper>vts) — so once two producers are on, a row gets stamped with the *globally-dominant* mode, not the mode of the producer that actually wrote it. **Fix (per Kyle's stamp-at-entry / propagate-on-payload principle, 2026-06-09):** the mode is **stamped onto the pair at pipeline entry** (the fan-out where shared scan/compute is copied into a producer path) and **carried on the payload through every stage**. The storage write then simply **persists the mode the pair has carried since entry** — never a write-site `getCurrentMode()` lookup. So D1's "producer-scoped stamp" is not a special write-site rule; it's the natural endpoint of the carried tag. **Discovery + threading method = the end-to-end pair-trace per pipeline (pre-audit A1.★), threaded like the proven `asset_class` dimension.**

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
| **Broad signal performance** (how do ALL signals in a regime family trade?) | VTS (`source=vts`, all) | Largest N, unconditional, pre-selection — every candidate fires. |
| **★ Regime-classification correctness** (are we putting pairs in the *right* regime?) | VTS (`source=vts`, across regime families) | The firehose runs every signal in every regime family, so it is the natural data to validate the regime label + pair→regime assignment. **Ties directly to item 4.7 (per-asset-class regime).** |
| **Realized-policy validation** (once pairs + signals are filtered, how well does the system actually perform on wins/losses?) | Paper (`source=paper`, post-selection) | The accurate deployed-policy distribution — "the part trying to perform at its best." |
| **Selection-quality / SQE tuning** (is the filter admitting the right ones?) | VTS `would_admit=true` slice vs paper-admitted vs VTS-all | The B.3 bridge — apples-to-apples across the gate. |
| **★ Filter looseness counterfactual (Kyle 2026-06-09: "what gets through when the filters are looser vs more stringent — and how those trades work out at each setting")** | VTS firehose sliced at ANY candidate threshold (signals + scores + their VIRTUAL outcomes all captured); paper validates realized outcomes at the OPERATING point | Because VTS computes the gates `enforce=false` and trades everything virtually, looser/tighter is a pure REPLAY question — no re-run needed. Slice the firehose at threshold X vs Y → admitted-set delta + virtual-outcome quality per slice (the HCE selectivity method, formalized). Honest bound: outcomes for never-admitted signals are virtual (simulator) outcomes; paper supplies realized ground truth only at the setting actually run. |
| **Modulating live signal confidence** (the closed loop today) | **the Gate-2 decision — see B.6** | — |

**★ Kyle's learning-purpose framing (2026-06-09) — authoritative, drives the table above:** *VTS learning = "how do all signals from a regime family trade, and are we selecting/classifying pairs into the right regime?"* (broad signal behavior + regime-classification correctness). *Paper learning = "once we've filtered the pairs and evaluated/filtered the signals, how well is all that being done, judged on wins and losses — the part where the system is trying to perform at its best."* This is exactly the pre-selection (VTS) vs post-selection (paper) split the substrate partitions on; the regime-classification-correctness purpose is the one this framing adds explicitly.

## B.6 ★ THE GATE-2 DECISION FOR KYLE (D9, plain-language at §5)
The one genuine choice: **when the learning loop modulates the confidence of a NEW signal, whose realized outcomes should steer it?** Three shapes:
- **(a) Source-matched (conservative default).** A paper-pipeline signal is modulated by the **paper** EMA; a VTS signal by the **VTS** EMA. Zero cross-contamination, trivially correct. Cost: paper starts cold (factor = neutral 1.0) and barely benefits from learning until it accrues enough closes; VTS's huge knowledge doesn't help the real pipeline.
- **(b) Labeled combination (recommended).** The modulator reads BOTH, combining via a **documented, governed weighting that respects selection-stage + sample size** — VTS supplies the broad **prior** (large N, exploration); paper supplies the realized-evidence **update** (smaller N, accurate). A shrinkage estimate: start from the VTS prior, shift toward paper as paper's N grows (a hierarchical/empirical-Bayes shrinkage, *not* a raw count-pool). Preserves both signals; never silently pools; paper benefits from VTS's coverage early, then earns autonomy as it accrues. **This is the truest reading of "learn from both with labels."**
- **(c) VTS-only (the old single-writer lean).** Rejected by Kyle 2026-06-09 — discards paper's realized-policy signal.

**CC recommendation:** build the **labeled, partitioned substrate (B.3/B.4/B.5) regardless** — it's a prerequisite for ALL three and is the actual separation fix. Default the live-confidence read to **(a) source-matched** for the initial cleave (simplest, provably non-contaminating, unblocks Phase 19), with **(b) the governed shrinkage blend as a fast-follow enhancement** once paper has a calibration baseline. Surface (a)-vs-(b)-now to Kyle at Gate 2; the substrate doesn't change either way, only the read policy does.

## B.7 — ★ JOINT-DESIGN CONVERGENCE (CC + Langston, 2026-06-09) — these decisions SUPERSEDE the first-cut B.3/B.4/B.6 where they differ
Langston peer-reviewed the first-cut and converged on the substrate (B.4: one physical store, source-labeled, purpose→partition reads — build as specified) but corrected the modeling layer on four points. Final converged design:

1. **Read policy = source-matched is the DURABLE answer, NOT an interim.** The shrinkage-blend (B.6(b)) is **downgraded from "scheduled fast-follow" to a CONDITIONAL RESEARCH ITEM** — it is not buildable in a correct form today and may never be worth it. Three decisive reasons:
   - **Wrong prior / selection bias.** Shrinking a paper tuple toward the **VTS-all** mean is backwards: VTS-all is *unconditional* and paper is *conditional on passing SQE*, so (if SQE has any edge) paper's true mean is structurally higher than VTS-all's → the blend would systematically **penalize the real pipeline**. The only valid prior is the **VTS `would_admit=true` slice** (same selection condition) — which is not persisted today.
   - **Ill-posed on an EMA.** Empirical-Bayes shrinkage needs a per-group estimate whose variance shrinks with N; a fixed-α EMA's variance *plateaus* at ~1/α. "Weight paper more as N grows" has no statistical engine under the current store.
   - **Not worth it.** The factor is clamped **[0.85, 1.05]** (±5–15% on confidence) — the only thing the blend buys is faster paper warm-up out of the neutral-1.0 cold state; importing selection bias to accelerate a tiny knob fails Net Expectancy.
   - **Gating rule for (b) ever:** only if (i) the `would_admit` bridge exists AND (ii) we have *measured* that the VTS-would-admit and paper-admitted distributions agree per tuple (a KS / mean-delta test). Estimator on record (Morris normal-normal, one global τ from ~90 tuples) — premature, not scheduled.

2. **★ Store the Welford triplet `(count, mean, M2)` per partition NOW** (alongside/replacing the scalar EMA). ~24 B/tuple. Reasons: (a) makes the cold-start gate + any future estimator well-posed; (b) gives **clean honest resets at `calibration_epoch` boundaries** (an EMA never truly resets — it only decays the old epoch's influence); (c) the fixed-α exponential forget is itself questionable for a ~90-tuple, low-frequency, epoch-segmented store — an honest epoch-scoped mean is the better primitive; (d) keeps (b) buildable later without a second substrate migration. **★ Surfaced behavior change (§9.2): replacing the EMA with an epoch-scoped running mean changes how the B67.4 confidence factor responds (equal-weight within epoch vs recency-weighted). This is a deliberate primitive change, flagged — not a silent calibration swap. Decide the exact primitive (Welford-only vs Welford+retain-EMA) in a Phase-B substrate mini-design.**

3. **`would_admit` correction (B.3 was half-true).** VTS persists `finalScore` + components (the score SQE would threshold), but **NOT a discrete `would_admit` verdict** — VTS does not run the SQE pass/fail. So capturing `would_admit` is **Phase-B build work** (replay the same threshold SQE uses against the already-persisted `finalScore`, store the boolean), feasible, but the design must not lean on it as already-present. Its priority **rises**: it is the precondition for (b) ever, not just SQE-tuning nice-to-have.

4. **`calibration_epoch` correction (B.3) — there is NO existing ledger; MINT one, and it is the load-bearing part.** No first-class monotonic calibration lineage exists on staging (predictive-weights `_metadata.version` is VTS-scoped + weights-specific; ml-calibration-scheduler stamps ISO timestamps, no version). Cautions: it must bump on **actual calibration-affecting changes** (module_constants knobs — *currently unversioned, real plumbing*; predictive-weights version; regime/strategy-map edits), not a wall clock; and it likely must be **per-source** (VTS up-stream vs paper down-stream can sit on different lineages at the same instant). The anti-mixing guarantee + the W2.x un-blocking are only as real as this epoch → **its own Phase-B mini-design**, not a hand-waved int.

5. **Key-shape (ask 1) — confirmed + refined.** Physical key `(source, assetClass, regime, strategy)`. **`selection_stage` is DERIVED from source (vts→pre, paper/live→post) — NOT a physical key column** (keying it = two columns that must agree, a consistency hazard for zero gain). **`would_admit` is an entry FIELD on VTS rows + a read-time filter, NOT a key dimension** (keying it doubles the VTS partition for nothing). **`source` is a REQUIRED param — no default** (a defaulted source is exactly how a pooled read sneaks back; force the compiler to flag every call). Migration surface is small + compiler-enforced: two decision sites (`signal-orchestrator.ts:809`, `vts-runner.ts:1726`) + the ablation builder; `market-context-engine.ts:741` is `evictExpired` (key-agnostic, no change).

## B.8 — ★ CENSUS of "things that learn" (Langston ask 5) + the HOUSE RULE
A full sweep of disk-persisting / prior / EMA / recalibration stores, read-side traced to see if the loop actually closes:
- **One live contaminator: `outcomeFeedbackStore`** — confirmed (writers `vts-service.ts:945` + `paper-execution-engine.ts:1397`, no source label; loop-closing readers `signal-orchestrator.ts:809-810`, `vts-runner.ts:1726-1727`, `factor-ablation-builders.ts:160`). The only store meeting all three criteria. **This is the whole D9 fix surface.**
- **NOT live cross-producer learners (safe):** cost-metrics/friction (the realized-cost-feedback chain was **deleted as dead code in B79.0n.MCE** — no friction prior exists to contaminate); SQE confidence-chain (DB-config thresholds, no outcome memory); pattern-pool stats (static config/DB getters); regime-phase / directional-bias (market-state metrics, already per-class).
- **★ Clean-slate gap to PROTECT:** when paper turns on with simulated Kraken fills, you will have realized slippage/friction data feeding **nothing**. If a friction/cost prior is ever added, it must be **born source-partitioned** — flag now so it is not built naively pooled.
- **★ Latent vector 1 — predictive-weights blind-spot:** `recalibrate-predictive-weights.ts` is source-stamped `"VTS"` and **refuses** to recalibrate if a non-VTS canonical is detected (L223-235) → **safe from blending, but VTS-LOCKED by construction.** Once paper is live, paper's realized outcomes will **never** inform the predictive weights that feed `finalScore` — a **blind spot** (the same source-matched-vs-blend question, one level up at the scoring-weights layer). **Surface as a Phase-19+ decision — do not let it ride silently.**
- **★ Latent vector 2 — dormant trap:** `adaptive-manager` / `persistAdaptiveLearning` — dead code, zero callers, DB-loaded at boot only. Safe today, but a **reserved learner**: reactivating it post-Phase-19 without source-awareness = an **instant second D9**. Add a guard/comment so it cannot be turned on naively.
- **★ HOUSE RULE (adopt):** **source-label discipline is mandatory for ANY future outcome-fed store**, not a one-off patch for `outcomeFeedbackStore`. This becomes a standing invariant (governance: ADJUSTMENT_FRAMEWORK / the learning design).

---

## PART C — SHARED-COMPUTE FAN-OUT (O5, settled — brief)
MCE / pattern / strategy / TEC computed **once per (symbol, cycle)**, published **read-only** to all producers (R-I exactly-once invariant; R-J `Object.freeze` the published context + indicators — **freeze, don't copy**). Per-producer state = positions, selection policy, learning partition, telemetry. The producer-agnostic tier of Part A *is* this fan-out's storage face. **Verify (O5):** exactly one MCE compute per symbol per cycle under concurrency — the cycle counter / telemetry must not multiply (also an O6 hard gate).

---

## §5 — OPEN DECISIONS FOR KYLE (Gate 2, plain language)
1. **What the system learns from when it sizes up a new trade's confidence — REFRAMED after the joint review (CC + Langston converged).** Everything gets captured and labeled either way (simulator results tagged "broad exploration," paper results tagged "real selective trading"). The narrow choice was: at the moment the system rates a fresh signal, lean only on results from that same world, or blend the broad simulator history with the smaller-but-more-realistic paper history. **We now jointly recommend the clean same-world version as the actual answer, not just a starting point** — because blending toward the broad simulator average would quietly *penalize* the real pipeline (the simulator's average is worse, since it includes every trade the real filter would have rejected), and the smarter blend can't even be done correctly until two things are built and a test is passed. So: **same-world learning is the design, the blend becomes a "maybe later, only if it proves out" research item, not a scheduled step.** This is simpler and safer than the first draft. *(One small build note carried with it: we'll store a slightly richer record of each strategy's results now, so we never have to migrate later and so learning resets cleanly when calibration changes — this very mildly changes how the existing confidence nudge reacts; flagged, not silent.)*
2. **Per-producer retention** (optional, low stakes): keep the realistic paper record "hot" longer than the high-volume simulator firehose? Default keeps today's uniform policy unless we see a reason to diverge.
3. **(FYI, surfaced not decided now)** the same simulator-vs-paper learning question exists **one level up** in the scoring-weights layer (predictive weights are simulator-locked today; paper outcomes would never reach them). Not a contamination, a blind spot — a Phase-19+ decision we're flagging so it doesn't ride silently.

---

## §6 — LANGSTON JOINT-DESIGN REVIEW ASKS (the Kyle-delegated half)
1. **Partition key shape** — is `(source, assetClass, regime, strategy)` the right grain, or do we also need `selection_stage` physically in the key (vs. derived from source)? Any consumer of `outcomeFeedbackStore.peek()` that would break on a source-qualified key — enumerate the readers (signal-orchestrator, MCE refresh, regime-phase, factor-ablation-builders all touch it) and confirm the read-model migration surface.
2. **The B.3 "would_admit" bridge** — is the VTS `enforce=false` SQE verdict actually persisted today (or only logged)? If only logged, capturing it is part of Phase B. Confirm feasibility on staging.
3. **The B.6 combination model** — is empirical-Bayes shrinkage (VTS prior → paper update) the right frame, or overkill for a ~90-tuple EMA? Propose the concrete estimator (or argue for source-matched-only as the durable answer, not just the interim).
4. **Calibration-epoch stamp** — where does the calibration lineage version come from (is there an existing calibration_ledger / version we stamp, or must we mint one)? This is the anti-mixing guarantee; it must be real.
5. **Any shared-state contamination beyond `outcomeFeedbackStore`** — are there OTHER cross-producer learning/feedback stores (cost-model priors, friction priors, SQE confidence-chain memory, pattern-pool stats) that blend VTS + active today and would contaminate once paper turns on? The census of "things that learn" — name any you find on staging.
