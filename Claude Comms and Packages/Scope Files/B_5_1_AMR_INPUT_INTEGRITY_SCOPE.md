# B-5.1 Scope — AMR input-integrity fixes (#222, #223, #224)

**Date:** 2026-06-12 · **Trigger:** Kyle directive — the three B-5-audit/Step-8 findings get FIXED before B-4.6-B, not registered for later. The weather system is in its shadow evidence week; letting it learn from contaminated inputs defeats the purpose of having built it.
**Standing lesson (Kyle, recorded):** findings that affect a new system's data quality are fixed before moving on. "Logged in the issues tracker" is not a commitment.

## Objective 1 — #222: crypto DBS store equity contamination (ROOT CAUSE FOUND)

**Root cause (code-traced):** `market-context-engine.ts:1395` — `computeContext` feeds `directionalBiasStore.updatePair(symbol, score, sentinelZero, volume24h)` UNCONDITIONALLY. The line dates to B63 (single-class era). When xstock pairs began flowing through `computeContext` (B79.0m.b, ~2026-05-21 — "synthesized neutral propagatedDbs for non-crypto"), every xstock context computation ALSO deposited that pair's DBS into the CRYPTO store, carrying the xstock enrichment volume (consolidated equity tape — SPY at 6.38e10). The B79.0n.MCE per-class refactor (05-25) class-keyed the CACHE but missed the store write — a classic missed thread. Measured impact (Langston Step-8, 2026-06-12): 24 equity symbols at 52.6% of crypto aggregation weight; weighted median 0.2662 with vs 0.2272 without.

**Fix:** class-gate the write — only `assetClass === 'crypto_spot'` feeds the crypto store (xstock pairs feed `xstockDirectionalBiasStore` via their B-PHASE-A2 scanner path, which is correct and untouched). NO data migration: `PAIR_HARD_EXPIRY_MS` = 5 min — contaminated entries expire out within 5 minutes of deploy. Regression lock: unit test seeding a non-crypto context compute and asserting the crypto store never receives it.

**Design question for Langston (D1 — materiality):** crypto VTS rows have carried the contaminated `globalDirectionalBias[Score]` stamp for ~3 weeks. Skew is direction-preserving and modest (0.266 vs 0.227 today); the crypto vts epoch was bumped to 4 YESTERDAY (Finding-A2), so the current clean lineage is <1 day old and pre-bump lineage is already partitioned. CC position: NO additional epoch bump — the contamination is a feature-stamp skew, not a label/outcome corruption, and the lineage that matters is already day-old. Confirm or veto.

**Secondary (D2):** `GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0` (cap disabled). With the contamination removed, the cap question is separable. CC position: leave at 1.0 in this batch (changing aggregate behavior mid-shadow-week muddies the AMR evidence); revisit with shadow-week data. Confirm or veto.

## Objective 2 — #223: negative-spread writer guard

**Root cause (B-5 audit side-probe a):** `market-scanner.ts:724` computes `((ask − bid)/bid)×100` straight from the ticker; momentarily crossed/stale books (ask < bid) produce negative spreads, written unguarded; `setCostMetrics` (cost-cache.ts:85) clamps only the UPPER bound. Observed pre-B-5: avgSpread −0.11% across 673 entries.

**Fix (single chokepoint):** `setCostMetrics` rejects negative spread input — keeps the prior/default value and logs once per symbol per interval (a crossed book is NOT a measurement; clamping to 0 would fabricate a zero-spread reading). Covers BOTH writers (market-scanner + fx5-scanner pass-through). The B-5 read-side guard stays (defense-in-depth). Unit test: negative write → prior value retained.

## Objective 3 — #224: restart-transient CALM → IDLE-hold during friction warm-up

**Behavior (ledger-evidenced):** on every restart xstock classifies CALM for ~90s (friction input absent-warming; score renormalizes over the remaining inputs) then flips STORMY when measured spreads arrive. Shadow-inert today; under ACTIVE every restart would open a brief full-size posture window during genuinely hostile overnight conditions.

**Fix (design — Langston D3):** friction becomes a REQUIRED input for a LIVE classification: while the class's friction reads null with reason WARMING or NO_SOURCE, classify IDLE (no posture decision, honest "warming" on panel/ledger) instead of computing a thin-input score. Consistencies: (a) MARKET_CLOSED weekends already produce IDLE via the vote path; (b) the B5 post-IDLE rule (min(firstRead, NORMAL)) already guarantees a safe re-entry after warm-up — this extends the same honesty to the warm-up itself; (c) M2 contract preserved — IDLE remains the no-decision state, not a score bucket; the completeness-cap philosophy (favorable must be earned) extends to "any LIVE read requires the hostile-detector present". Crypto warms <1 min (cost-cache fills on first scan), xstock ~90s — both honestly IDLE for that window. Tests: warm-up fixture (friction WARMING → IDLE → first LIVE read ≤ NORMAL), plus the existing 28-test suite updated where it seeds friction-absent snapshots.

## Verification criteria

1. Post-deploy: crypto audit-dump contains ZERO equity symbols after 5 min (re-run `scripts/b5-amr-correctness-audit.ts` — DBS leg still PASS; new equity-absence assertion added to the script).
2. Crypto global DBS shifts to the uncontaminated value (~0.227-region vs 0.266 at last read) — visible in the [B62] log line + endpoint.
3. No negative spreads writable: synthetic crossed-quote test + live check `min(spread) >= 0` across the cost-cache sample in the audit dump.
4. Restart staging → xstock ledger rows show IDLE (not CALM) during friction warm-up, then first LIVE read ≤ NORMAL; panel shows the warming state honestly.
5. CI all-4-green; tsc baseline; b5-amr-body suite green (updated); Langston Step-4 diff review BEFORE push; Step-8 second pass on live behavior.

## Blast radius (pre-audit focus)

- O1: market-context-engine (writer), directional-bias-store consumers (crypto global DBS readers: market-indicators, MCE computeGlobalBias → B62 confidence modifier, VTS stamps, AMR dbs input). Behavior change = crypto aggregate reflects crypto only (the CORRECT value; consumers unchanged).
- O2: cost-cache writers (market-scanner, fx5-scanner) + every cost-cache reader (they see fewer sentinel values — strictly cleaner).
- O3: amr-weather-report classification path + panel copy (IDLE during warm-up) + ledger consumers + the b5 test suite. SIM/Manual Ch12 updates at governance.
