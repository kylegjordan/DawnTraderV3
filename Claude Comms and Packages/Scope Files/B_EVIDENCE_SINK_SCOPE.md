# B-EVIDENCE-SINK — durable switch-on behavioral-evidence sink (Step-1 Scope)

**change-class: architecture** (adds a write path + a persisted store on the active decision path)
**Owner:** CC-A (Claude Old). **Reviewer:** Langston. **Consumer:** CC-B's B8.5 switch-on batch points its three §9.1 proofs here.
**Standing precondition:** must EXIST + be VERIFIED capturing BEFORE the B8.5 switch-on (New Claude: folding it into the evidence-generating batch recreates the bootstrap problem). The FLIP itself still HOLDS for Kyle's explicit go.

## Why (the gap it closes)
The B8.5a-ratified design shadow-logs three switch-on behavioral proofs to **stdout** (console.log): (1) **FINALSCORE_SHADOW** — per admission, would the RETIRED finalScore gate have rejected (finalScore + threshold), the evidence for the formal post-paper field-kill; (2) **EV_REJECT** — the 11.8B open-stage net-EV gate's rejects (the "gates drifted" alarm, expected ~0); (3) **maker/taker pick** — the chosen mode + signalStrength (the de-tint monitor). Stdout now ROTATES (B-OPS-PM2-LOG #499: max_size 1G / retain 14 / discard oldest) — at switch-on log rates that window holds ~2 days, but the paper-validation window is WEEKS. So the evidence would be rotated away before it's analysed. Per STORAGE_POLICY §5.5: valuable structured signals inside the rotated firehose must be EXTRACTED to a retained store.

## §13 homing (Langston Step-2 housekeeping) — this batch is the SINGLE home for all three switch-on proofs
Before B-EVIDENCE-SINK, the three switch-on behavioral proofs had NO durable capture: (i) the **FINALSCORE_SHADOW shadow-write** (would-have-rejected-but-admitted on the retired gate) and (ii) the **EV_REJECT rate-numerator** were un-homed (console.log → rotated stdout only); (iii) the **maker/taker pick** persisted only transiently on `rtb_signals` (expired/cleared) without the decision-time haircut snapshot. **This batch homes all three** as OBJ-2 — none float as separate future items. Their console.log dual-write is retired by the post-paper FinalScore field-kill batch (Flag B).

## Objectives
- **OBJ-1 — a durable, GOVERNED store.** A **DB table** (subject to STORAGE_POLICY tiering — hot→warm→cold, never-drop), NOT a flat file (a file needs its own rotation + isn't queryable for the post-paper analysis). Structured one-row-per-decision.
- **OBJ-2 — capture the three proofs** at their decision points: FINALSCORE_SHADOW (SQE admission, signal_quality_evaluator.ts), EV_REJECT (active-execution-engine 11.8B open-stage), maker/taker pick (decideMakerTaker). Each row carries the decision context (symbol, strategy, assetClass, regime, sourcePool, the relevant scores/thresholds, timestamp, mode paper/live).
- **OBJ-3 — the write path is ADDITIVE + honest.** Emit the structured row IN ADDITION TO (not silently replacing) the existing shadow console.log during the validation window; NULL-honest where an input is absent (no fabrication). Active-path only; VTS/passive unaffected.
- **OBJ-4 — verified WORKING pre-flip.** Since the real evidence only flows once active trading is ON, "verified" = an integration test proving the write path round-trips a synthetic emission into the table (plumbing proven), so real rows land durably from switch-on minute 1. State clearly (§9.1): this batch makes the SINK ready; it does NOT itself produce switch-on evidence (that needs the flip).
- **OBJ-5 — register retention** in STORAGE_POLICY §3 (`data_lifecycle`) — hot window + tiering, never-drop (it's analysis evidence). Table + policy row together.

## Open design questions for Langston (Step-1)
1. **New dedicated table vs EXTEND `signal_eval_provenance`** (the 19-20 / B-NEW-53 decision-provenance capture already writes rich per-decision rows). Reuse = fewer moving parts + one write; dedicated = clean separation of switch-on-proof from general provenance + independent retention. **My lean: a dedicated table** (`switch_on_shadow_evidence`) — the three proofs are switch-on-window-specific, want their own retention + are queried as one cohort for the post-paper rulings; but open to riding provenance if the write-site overlap is high. Step-2 pre-audit settles it against the SIM.
2. **One table with a `proof_type` discriminator** (finalscore_shadow | ev_reject | maker_taker_pick) **vs three columns on one row per decision.** Lean: discriminated rows (the three fire at different pipeline stages, so one-row-per-decision would force cross-stage joins).
3. **Retention window** — hot how long before warm? The post-paper analysis runs weeks after the flip, so hot ≥ the paper-validation window (~30-45d) before it tiers.

## Workflow
Step-2 pre-audit (SIM + System Manual read of the SQE / exec-engine / provenance write paths + the three emission sites + blast radius) → Step-3 implement (migration for the table + the additive write path at the three sites + integration test) → Step-4 Langston diff review → CI 4-green → deploy → Step-7/8 verify (integration test proves round-trip; table + policy row present) → governance (STORAGE_POLICY + SIM + System Manual + BATCH_CATALOG + completion report). Then it sits READY; CC-B's B8.5 points at it; the flip waits for Kyle.
