# Design ask — proper execution order of phases AFTER Phase 19 (Kyle directive 2026-06-08)

**For Langston. CC's analysis + recommendation; want your independent ordering + rationale + anything CC missed.**

## The problem Kyle raised

The roadmap's phase NUMBERS do not equal execution order. If anyone reads it as "16 → 17 → 18 → 19 → 20 → 21 → … → 25," it's wrong. Two phases specifically need correct slotting: **Phase 16** (Database & Legacy Cleanup) and **Phase 25** (Calibration with Evidence). Kyle's mental model: **Phase 25 is the natural next thing after Phase 19, because Phase 25 was originally PART of Phase 19 — we split it off only because 19 was getting too big.** He wants CC + Langston to agree on the proper post-19 order, then bring it to him to decide.

## What's already locked (do not re-litigate, just place correctly)

- **The 19/25 split (Kyle 2026-05-27):** Phase 19 = "pre-launch readiness" = anything verifiable WITHOUT paper-active wins/losses. Phase 25 = "calibration with evidence" = anything that NEEDS paper-active outcomes (confidence modifiers, SQE thresholds, sustainability-gate value-scope, ladder net contribution, AMR build/skip = the M2 brain, the xStock entry-trigger sweep 25-12, geometry reconstruction 25-13, crypto strategy-signal re-validation, factor calibrations). So Phase 25 STRUCTURALLY depends on Phase 19 producing the paper-active data + on the decision-provenance rows accruing (the 2026-07-05 proof-of-capture gate).
- **"Phase 25" number repurposed:** the old "Phase 25 = crypto_perp" label is retired; crypto_perp (B80) is now post-launch / Phase-26 placeholder, no SLA.
- **AMR body = pre-Phase-19** (between-plan item 5); AMR brain (M2) = Phase 25.
- **Current state:** executing the between-Phase-24→19 plan (items 1+2 done; on item 3). Phase 19 kicks off after items 1–5.

## The phases in play after Phase 19, and their dependencies (CC's read)

| Phase | What it is | Hard dependencies |
|---|---|---|
| **19 — Paper Mode Audit & Debug** | Turn the full paper-active pipeline on; debug end-to-end; start accruing paper-active outcomes + decision-provenance. Includes 19.0.A confidence-chain calibration + 19.4 SQE recalibration (both = calibrate-against-paper-active). | The between-plan (items 1–5). |
| **25 — Calibration with Evidence** | Consume the paper-active + provenance data: entry-trigger sweep, per-strategy re-fit, crypto edge-scoring fix, crypto strategy-signal re-validation, AMR M2 brain, factor calibrations. | **Phase 19 must be running + producing data.** The xStock entry-trigger sweep also needs the 2026-07-05 provenance accrual gate. |
| **16 — Database & Legacy Cleanup** | Drop legacy tables (Walter/L-Series/paper-dup/V1-guardrails), remove ~40 legacy enums + dead schema, split storage.ts into modules, purge trailing-percent residue, LSP cleanup, test-suite recovery. The "Phase-16 register" (RUNNING_ISSUES #136) is where legacy components get parked. | Mostly independent of trading data. BUT must precede Phase 20's DB rebaseline (which regenerates the baseline on the cleaned schema). |
| **20 — Production Hardening** | Security (RBAC, API versioning, JWT→cookies), test infra, DB rebaseline + hot/warm/cold retention + index hygiene, decompose monolith pages/routes. | **DB rebaseline depends on Phase 16** (legacy tables dropped first). The retention-tiering overlaps the between-plan item-4 storage design — keep consistent. |
| **21 — Live Mode Activation** | Build/validate the Kraken live-mode engine; paper-to-live parallel testing at small size. **Actual trades.** | Production-hardened system (Phase 20). Open question: does it require Phase 25 calibration COMPLETE, or can it launch on the Phase-19-validated system with calibration iterating? |

## CC's recommended order (for your review)

**19 → 25 (heavily overlapping 19) → 16 → 20 → 21**, with 16 able to overlap 25.

Rationale:
1. **19 and 25 are one continuous workstream**, split only for size. 19 = "get it running, debug, start accruing data"; 25 = "calibrate against the accrued data." They interleave — some Phase-19 sub-items (19.0.A, 19.4) ARE calibration-against-paper-active and blur the boundary. So 25 is adjacent to / overlapping 19, NOT after 20/21. (This matches Kyle's mental model.)
2. **16 (legacy cleanup) comes after the paper-active pipeline is debugged-stable** (don't change the schema while debugging the trading path — two-variables problem) and **before 20** (clean schema for the rebaseline). It can run in parallel with 25 (cleanup is independent of calibration data).
3. **20 (hardening) is the last pre-live gate**; **21 (live) is last.**

## Questions for you (Langston)

1. Do you agree 25 is adjacent-to/overlapping-19, not a post-21 tail? Any reason to push 25 later?
2. **The big one:** does Phase 21 (live) require Phase 25 calibration to be COMPLETE, or can live launch on the Phase-19-validated baseline with calibration continuing iteratively (calibration improves edge but isn't a safety gate)? This decides whether 25 is "before 21" or "spans across 21."
3. Where does 16 best sit — overlapping 25, or a dedicated block right before 20? Any risk in doing the DB cleanup before vs. after live?
4. Anything CC missed: dependencies, a phase that's mis-placed, or an item that should move between 19 and 25.
5. Is the cleanest expression of this a **track model** (Track A = trade-quality: 19→25; Track B = productionize-and-launch: 16→20→21, with B gated on A reaching a "good-enough-to-harden" bar) rather than a strict linear order?

CC will fold your answer into a recommended ordering for Kyle's decision, then reconcile the roadmap. Active trading is OFF throughout; this is planning only.
