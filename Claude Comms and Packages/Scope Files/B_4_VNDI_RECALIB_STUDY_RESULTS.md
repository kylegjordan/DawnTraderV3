# B.4 foundation — 15-Minute VN/DI (IMF SCREEN) Recalibration STUDY RESULTS (Phase-II)

> Read-only replay study (engine `scripts/b4-vndi-recalib-study.ts`, committed 5baa15bef). Parallel to the regime-threshold recalibration study; same percentile-preserving method, same clean-1m-rebuild substrate. Produces the numbers to re-center the xStock IMF screen edges (`screener_filters.vn_max` / `di_min` / `di_max`, `asset_class='xstock_spot'`) for 15-minute bars. Decision-grade (rolling/full distributions, rule #13; rates WITH raw counts). Candidates are percentile-preserving CANDIDATES — finals set with Langston + CALIBRATION-LENS judgment, then seeded. Active trading OFF; xStock-scoped; crypto untouched.

## §0 — Scale + method
- 3.73M 1m rows, 485 symbols, ~34 days (2026-04-30 → 2026-06-04). **60m: 104,309 full 60-bar windows** (484 sym); **15m: 307,923 full 240-bar windows** (477 sym). Bars rebuilt UNCAPPED from `xstock_spot_ohlc_1m` (direct epoch-bucket SQL); each measured window is a FULL trailing window matching the live IMF cache cap EXACTLY (60 @ 60m = MAX_BARS_60M, 240 @ 15m = MAX_BARS_15M) — the load-bearing parity input because VN and DI are FULL-ARRAY statistics. Production fns reused verbatim: VN via `calculateVolNoise` (imf-metrics), DI via `computeDirectionalIntegrity` (xstock_spot/imf-evaluator, exported for this study; single `export` keyword, no behavior change). 72 live threshold edges enumerated from the LIVE `screener_filters` (DB is SSOT) across 24 xstock_spot family rows (24 vn_max + 48 di band edges).

## §1 — Headline: HOW the inputs scale 60m→15m (DIFFERENT from the regime inputs)
- **VN (vol-noise) is NEARLY BAR-INVARIANT.** Median 0.7252 (60m) → 0.7200 (15m), ratio 0.993. VN = MAD/median of |log-returns| — a NORMALIZED (dimensionless) noise ratio, so bar-size largely cancels (unlike raw volatility, which halved in the regime study). Per-edge admit drift is only 1.25–3.4pp.
- **DI (directional-integrity) CONTRACTS toward 50 at 15m.** Median ≈50 at both (50.33 → 50.36), but the BODY tightens hard: p1 28.70→39.58, p25 43.89→47.15, p75 56.79→53.49, p99 73.42→62.55. Per-percentile ratio: p1 1.379, p25 1.074, p50 1.001, p75 0.942, p99 0.852. The 240-bar (15m) window averages out net directional drift (random-walk cancellation over a longer array → DI pulled toward neutral 50). So a FIXED di_max cuts a SMALLER fraction at 15m — the band silently tightens.

## §2 — Percentile tables (both substrates)
| metric | substrate | p1 | p5 | p25 | p50 | p75 | p95 | p99 |
|---|---|---|---|---|---|---|---|---|
| VN | 60m | 0.4934 | 0.5447 | 0.6538 | 0.7252 | 0.8014 | 0.9269 | 1.0000 |
| VN | 15m | 0.5190 | 0.6064 | 0.6688 | 0.7200 | 0.7779 | 0.9503 | 1.0000 |
| DI | 60m | 28.70 | 34.98 | 43.89 | 50.33 | 56.79 | 66.58 | 73.42 |
| DI | 15m | 39.58 | 42.79 | 47.15 | 50.36 | 53.49 | 58.51 | 62.55 |

## §3 — The recalibration: which edges drift, which are inert
Each edge's 60m admit% vs what the SAME edge would admit on 15m BEFORE recalibration ("15m-curr") = the silent shift. The percentile-preserving candidate restores the 60m admit% by construction.

**ACTIVE + BAR-SENSITIVE — the substantive recalibration (di_max, finite values):**
| edge | current | 60m admit% | 15m-curr admit% | candidate(15m) | families affected |
|---|---|---|---|---|---|
| di_max | 30 | 1.42% | **0.00%** | **40.29** | active_oscillator (live+paper) |
| di_max | 35 | 5.02% | **0.13%** | **42.80** | active_reversal, vts_oscillator (live+paper) |
| di_max | 40 | 13.89% | **1.21%** | **45.22** | vts_reversal (live+paper) |

→ Without correction these families silently tighten ~10× at 15m (admit ~1.4/5/14% → ~0/0.1/1.2%) = the EV-relevant silent collapse the recalibration must prevent. The candidates restore the exact 60m selectivity.

**vn_max — VN nearly bar-invariant, only ONE edge drifts looser:**
| edge | current | 60m admit% | 15m-curr admit% | drift | candidate | call |
|---|---|---|---|---|---|---|
| vn_max | 0.85 | 85.81% | 89.24% | **+3.4pp LOOSER** | 0.826 | RESTORE (lens: never silently loosen) |
| vn_max | 0.95 | 96.22% | 94.97% | −1.25pp tighter | 0.980 | LEAVE (conservative; candidate pushes toward 1.0 clamp) |
| vn_max | 0.98 | 97.45% | 96.20% | −1.25pp tighter | 0.998 | LEAVE (conservative; near-inert already) |

**INERT at BOTH bar sizes (no behavioral change available → leave):**
- All `di_min` (current 0/3/5/10/15) sit BELOW the DI floor (60m min 15.8, 15m min 29.4) → admit 100% at both substrates. Mechanical candidate 29.37 still admits 100%. Newly activating di_min would be a strategy-fit change, OUT of B.4 foundation scope.
- All `di_max=100` sit ABOVE the DI ceiling (15m max 71.3) → admit 100% at both. Leave.

## §4 — CC RECOMMENDED FINALIZATION (lens-aligned)
1. **di_max 30→40.3, 35→42.8, 40→45.2** (lens-rounded percentile-preserving candidates). APPLY — corrects the silent ~10× tightening; restores 60m admit fractions; monotonic order preserved.
2. **vn_max 0.85→0.826** APPLY — the only vn_max edge that drifts LOOSER (+3.4pp); the lens forbids silent loosening.
3. **vn_max 0.95, 0.98 — LEAVE.** They drift slightly TIGHTER (−1.25pp); tighter is lens-conservative, and the percentile-preserving candidates (0.980/0.998) would LOOSEN them toward the 1.0 clamp (wrong direction; over-fits marginal noise on already-near-inert screens).
4. **All di_min, all di_max=100 — LEAVE** (inert at both bar sizes).

## §5 — THE FORK for Langston (genuine method call)
**Q1.** vn_max 0.95/0.98: LEAVE (CC rec — lens-conservative, they tightened) vs RESTORE-ALL (method-consistency with the percentile-preserving approach used for regime + di_max). CC leans LEAVE because the candidates loosen toward the clamp; but if method-uniformity is preferred, restore is defensible. **Langston's call.**
**Q2.** di_min: confirm LEAVE-inert (CC rec) vs set mechanical candidate 29.37 (no behavioral change either way; CC prefers no spurious churn). **Confirm.**
**Q3.** di_max/di_min band: §4 preserves each EDGE's percentile independently (the di_max recalibration). The alternative "preserve band WIDTH" policy is moot here because di_min is inert — only the di_max edge moves. **Confirm the per-edge approach is fine given di_min inert.**

## §6 — Next
1. Langston: confirm §4 + the §5 fork.
2. Seed migration: `screener_filters` xstock_spot updates per the finalized values (per-mode: live + paper rows identical; di_max 30/35/40 families + vn_max=0.85 families).
3. Fold into the Step-4 bundle (tsc/vitest in C:\dev) → push → CI.

*Engine `scripts/b4-vndi-recalib-study.ts`. Full output staging `/tmp/b4_vndi_recalib.txt`. Active trading OFF — forward proxy; Phase-19 paper-active is the final arbiter.*
