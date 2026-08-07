# LEARNING-SYSTEM + STORAGE AUDIT (2026-08-07) — Kyle-directed

> **Why this exists (Kyle, 2026-08-07):** *"You cannot say you have the data running into the right learning system until you know the history and intent of all of the learning systems and… which did we decide were retired… you might be feeding the learning into a factor that is no longer a factor. You have to determine this in your audit."* Sources actually consulted, named per rule 29: live Postgres (staging), `module_constants`, the live confidence-chain code, `pm2` runtime logs (2,000-line window, positive-controlled), `STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`, `SYSTEM_MANUAL.md`, `POST_AUDIT_ROADMAP.md`, `market-regime.ts`, the B75 manifest.

## PART 1 — STORAGE: WHAT ACTUALLY OCCUPIES HOT (measured, whole-table populations)
| object | size | tiered? |
|---|---|---|
| `signal_eval_archive` 2026_05..08 | **~57 GB across 4 partitions** (Jul 29 GB, Jun 14 GB, Aug 7.6 GB, May 6.6 GB) | yes, 90d hot |
| `xstock_spot_ticker_snap_2026_07` | **26 GB** | yes, 30d hot |
| `pair_scan_archive` 05..07 | ~12 GB | yes, 90d |
| `signal_eval_provenance` 06..07 | ~8 GB | yes, 90d |
| OHLC bar tables | ~7 GB | yes, 365d |
| **`vts_open_trades`** | **61 MB** | NOW (this batch) |
| **`closed_trades`** | **1 MB** | NOW (this batch) |

★★ **THE DECISIVE RATIO: the trade tables are ~62 MB against a ~142 GB database — 0.04%. The retention window on trades is NOT a storage-pressure question and never was.** Storage pressure is `signal_eval_archive` (~1.5 GB/day, #592, CC-B).

## PART 2 — WHAT THE JUNE MIGRATION ACTUALLY MOVED (correcting a recollection)
Kyle's recollection was *"I think they were VTS trade results."* **Measured at `data_archive_manifest`: NO.** What has ever been archived: `xstock_spot_ticker_snap` **60 objects / 16 GB compressed (warm/active)** · `xstock_perp_ticker_snap` 61 objects · `crypto_spot_ticker_snap` 3 · `context_bridge_log` (warm+cold) · **`exit_decision_archive` exactly ONE partition (2026-05, warm `migrated` + cold `active`)**.
⇒ **The ~50 GB June/July move was PRICE-SNAPSHOT market data (xStock ticker snaps), not trade results.** The only trade-*outcome* data ever tiered is that single `exit_decision_archive` partition. **What B-TRADE-TIER-REGISTER just fixed is the genuinely different thing:** the TRADE RECORDS themselves (`closed_trades` = the active path's paper+live closes; `vts_open_trades` = the simulator's), which had no archive path at all.

## PART 3 — THE CONFIDENCE CHAIN: WHAT IS ACTUALLY MULTIPLIED (code, not docs)
`signal-orchestrator.ts` — SIX live multiplication sites: macro+phase (b67_1/b67_2, `:1279`) · freshness b68_4 (`:1303`) · **outcome feedback b67_4 (`:1324`)** · volume regime b68_2 (`:1349`) · pair correlation b68_3 (`:1396`) · multi-TF b68_1 (`:1447`).
- ✅ **B67.4 — the store this batch wired — IS live in the decision path.** Not legacy. The test used was the decision path, not presence-in-codebase.
- ⚠️ **`b68_5` "Path-B sustainability" is NOT a confidence modulator anymore.** B70.3 (2026-05-05) repurposed the name into a **regime-classification momentum gate** (`market-regime.ts:87/:308`). Any doc implying an 8-factor chain including it is stale.
- ⚠️⚠️ **TWO modulators are INERT FOR xSTOCK, by DB flag:** `b67_1_asset_class_no_op_active=true` (macro no-op) and `b68_3_compute_correlation_enabled=false` (pair correlation off) for `xstock_spot`. **So xStock signals run ~4 effective modulators, not 7** — deliberate per-class design, but the "seven-modulator chain" framing is misleading per class and should be stated per class wherever it appears.

## PART 4 — THE LEARNING SYSTEMS (census + disposition)
| system | provenance | live? | disposition |
|---|---|---|---|
| **B67.4 outcome-feedback store** | B67.4 2026-05-01 | **YES** — multiplied at `:1324`; per-mode partitions (vts/paper_sim/live) | **(1) relevant + correct.** This batch made its ACTIVE writer work for the first time. |
| **`adaptive-learning-repository`** (Directive 11.1B, Replit era) | pre-governance | **NO (measured):** `adaptive_learning` table exists with **0 rows, all time**; its only consumer `dynamic-sizing-engine.ts` is **NOT imported by the live sizer** (`active-position-sizing.ts` is, per #650) | **STRONG (5)/(4) candidate — dead weights feeding a dead engine.** Needs the §9.5(a-ii) census before removal. |
| **`ml-calibration-scheduler`** (Directive 11.7I-04) | pre-governance; 8-hourly, gated on ≥10 closed VTS trades | started at boot (`server/index.ts`); **zero log evidence in a 2,000-line window** ⚠️ instrument reach: that window may be < 8h, so silence is NOT proof of death | **UNRESOLVED — measure over a ≥24h window before dispositioning.** Phase-25 is the calibration phase, so its *subject* is current even if this implementation is not. |
| **`awareness-core`** (Phase 8.94) | pre-governance | `awareness_state_log` table exists; no log evidence in-window | **UNRESOLVED — same measurement needed.** |

## PART 5 — THE STATED INTENT FOR LEARNING (the document Kyle remembered)
**`STRATEGIC_DIRECTIONS_AND_AI_EDGE.md` (2026-06-05, Kyle directive)** — the HCE study capture. Load-bearing content for this audit:
- **The anchor finding:** mining ~22,810 VTS trades found **NO hidden contextual edge** inside the trades we already take — the gates already homogenized survivors. **Leverage = selectivity + sizing + discipline + NEW data/structure.**
- **Selectivity works on xStock** (top-decile ranking turns the book net-positive, monotone) **and INVERTS on crypto** (top 1% −4.4%) ⇒ *crypto edge-scoring is mis-calibrated/anti-predictive at the top* — **a named Phase-25 fix.**
- **AMR placement is RESOLVED:** the AMR **BODY** is pre-Phase-19 (roadmap 19-19); **Phase-25's "AMR build/skip" is only the BRAIN — the M2 ML model replacing hand-set thresholds.**
- **ML sequencing:** model work = post-launch Phase 17/18; **Phase 25** = adaptive trend-following ↔ AMR + crypto edge-scoring fix + **confidence/SQE calibration**; **Phase 25+ data layer** = alt-data ranking + the **scheduled ML edge-scan** (the HCE engine re-run as a recurring job).
⇒ **Consequence for the outcome-feedback store: it is squarely inside the "confidence/SQE calibration" lane the intent doc assigns to Phase 25** — i.e. the data this batch just started capturing is the input that phase needs. Feeding it is aligned with the last stated intent; the AMR question is whether its BRAIN (Phase 25) should consume these same per-(source,class,regime,strategy) outcomes rather than a separate store — **an open design question, now named.**

## PART 6 — WHAT THIS AUDIT DID NOT ESTABLISH (honest boundaries)
Runtime evidence for the calibration scheduler + awareness core (window too short) · the full §9.5(a) census for the three legacy candidates · whether `exit_decision_archive`'s single migrated partition means the tiering ran once and stalled or simply that only one partition has aged · the AMR-brain input question.
