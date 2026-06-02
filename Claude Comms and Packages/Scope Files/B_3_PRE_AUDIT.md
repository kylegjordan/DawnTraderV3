# B.3 — Strategy Gates — Step 2 PRE-AUDIT (audit-methodology + data-availability)

> **Scope:** `B_3_SCOPE.md` v2 (Langston Step-1 ACK'd). **Foundation:** `B_3_STEP_1A_ARCHITECTURAL_READ.md`. This pre-audit resolves the §7 open questions, completes the A0 input-semantics provenance pass (Langston "run first"), validates the data foundation against staging, and locks the audit methodology BEFORE building. Active trading OFF. Read-only investigation.
>
> The umbrella audit (Group A) is read-only; the heavier per-component SIM pre-audits belong to B3.0 / B3.1 / B3.2 at their own Steps. This document pre-audits the AUDIT.

---

## §1 — A0 input-semantics provenance (code-verified; Langston-added, run first)

The most likely root cause is upstream of every threshold — a shared classifier input whose meaning/scale differs from what the cutoffs assume. Verified in code:

| Input | Code definition (file:line) | Shared crypto+xStock? | Verdict |
|---|---|---|---|
| **DX (trend strength)** | `computeADX` (`market-regime.ts:132-176`) returns **raw single-period Wilder DX** — `dx = \|+DI − −DI\| / (+DI + −DI) × 100` over a 14-bar window. NOT smoothed ADX. The `:273` comment states this explicitly ("DX not Wilder's smoothed ADX; crypto DX runs 35-90"). | YES (same fn both classes) | **Consistent but high-risk.** Devs knowingly used raw DX and set crypto cutoffs (45/55/60) against it; xStock cutoffs (35/40/45) are those pulled down ~10-15 pts. Raw single-period DX is **spiky/hot** — it swings far more than smoothed ADX. **Leading candidate** for why RANGE_BOUND (`dx<35`) is near-empty: raw DX may sit ≥35 most bars even when xStocks are quiet. If A2 confirms, the fix is upstream (smooth the DX) = **crypto-fence escalation** (touches crypto). |
| **DBS (directional bias)** | `computeDirectionalBias` (`directional-bias.ts:56-117`): slope + EMA components **ATR-normalized** (cross-pair comparable); return component fixed-scaled `rawReturn × 10` (10% move → 1.0), clamped; final score clamped **[-1, +1]**. `sentinelZero=true` when insufficient data or `atr<=0` → score 0. | YES (same fn both classes) | **Mostly scale-invariant, one caveat.** The [-1,1] clamp + ATR normalization make the slope/EMA parts comparable across classes, so the threshold-header "DBS scale-invariant" assumption is *largely* sound. CAVEAT: the **return sub-component's fixed 10%-move scaling is NOT asset-class-aware** → systematically smaller for low-vol xStocks (a 10% xStock move in-window is rare). Whether this materially shifts the `\|dbs\|` distribution is an A2/A3 empirical question — measure the per-class DBS-component distributions. |
| **Volatility** | `computeVolatility` (`market-regime.ts:88-106`): stddev of close-to-close simple returns over the full OHLC array. | YES (same fn both classes) | **Consistent definition.** xStock cutoffs (0.006/0.0075/0.010) are crypto's (0.012/0.015/0.020) halved. Whether realized xStock vol is actually ~half crypto's is an A2 empirical question. |

**A0 verdict:** No *hidden definitional* mismatch — all three inputs use the same computation for both classes, and the xStock thresholds are deliberate scaled-down heuristics. So B3.0 (if triggered) can adjust xStock thresholds **without** crypto-fence escalation IN GENERAL. **The one exception that WOULD force escalation:** if A2 shows raw DX runs hot for xStocks for reasons intrinsic to raw-vs-smoothed (not because xStocks genuinely trend), "fixing" it means smoothing the shared DX input → crypto blast radius → Kyle decision (per scope §2 B3.0 crypto-fence clause). This is now the single most important thing for A2 to resolve.

---

## §2 — Data-availability resolution (§7 Q1 + Q2), verified on staging 2026-06-02

**What the live archive carries** (`signal_eval_archive`, written by `signal-eval-archiver.ts`; live rows come from `source='vts-runner'` — the orchestrator hook is dormant):
- `regime_label` on **every** row (admitted + all reject stages) → the **live regime distribution is fully queryable**. ✓
- DBS (`pairDirectionalBiasScore`) + `atrAtOpen` + `regimeWeight` + `regimeConfidenceRaw` on **admitted rows only** (`vts-runner.ts:1926-1962`) — a biased subset (only opened trades).
- The raw **volatility / DX / momentum** that drove the branch decision: **NOT captured on any row.** Rejected rows carry only `sourcePool` + `detailReason` (`vts-runner.ts:3580`).

**Verified staging data foundation (psql, 2026-06-02):**
- `xstock_spot_ohlc_60m_snapshot`: **2026-05-06 → 2026-06-02 (today), 83,939 bars, 485 symbols** — a full, recent window.
- `signal_eval_archive` (xstock_spot): 2026-05-11 → today, **6,553,002 rows**.
- `xstock_dbs_backfill`: **2026-05-05 → 2026-05-15 only, 31,481 rows** — STALE (confirms the B.1 replay was pinned to a 9-day-old window).
- **TRUE live 7-day rolling regime distribution** (2.72M classified rows, all reject stages):

  | Regime | n | % |
  |---|---|---|
  | TREND_FRIENDLY_STABLE | 1,012,825 | 37.23 |
  | STRUCTURAL_TRANSITION | 956,565 | 35.17 |
  | HIGH_VOLATILITY_UNSTABLE | 562,089 | 20.66 |
  | IMPULSE_EXPANSION | 188,086 | 6.91 |
  | **RANGE_BOUND_STABLE** | **622** | **0.02** |

  RANGE_BOUND is effectively nonexistent live (622 of 2.72M) — even more extreme than the B.0 snapshot (0.14%). This is the headline the audit must explain.

**Resolution:** the audit does NOT depend on adding new archive columns first. The replay harness already recomputes the four inputs from OHLC by calling the production classifier; we extend it to **recompute DBS from OHLC the same way the live MCE path does** (`computeDirectionalBias(ohlc, atr)`) instead of joining the stale backfill. That (a) eliminates the stale-backfill artifact, (b) yields all four raw inputs + branch + near-miss per bar, and (c) can run on the full recent 84K-bar window. A small telemetry-only forward-instrumentation (add vol/dx/mom to the archive `features`) is a NICE-TO-HAVE for ongoing monitoring, NOT a blocker.

---

## §3 — Locked audit methodology (Group A)

1. **A0 (done — §1).** Provenance verified; raw-DX-spikiness flagged as the leading escalation candidate.
2. **A1/A2/A2-bis — extend `scripts/b-xstock-calib-b1a-replay.ts`:**
   - Recompute DBS per bar from OHLC via `computeDirectionalBias(window, atr)` (atr from the same OHLC), matching the live MCE methodology — NOT the stale `xstock_dbs_backfill` join.
   - Run over the full recent window (2026-05-06 → today, 485 symbols, 84K bars).
   - Emit per bar: the four raw inputs (vol, dx, mom, dbs) + `sentinelZero` flag + assigned branch + **for ST bars, the nearest explicit branch + which input(s) missed + miss-distance** (A2-bis).
   - Report per-branch input distributions overlaid with the active xStock cutoffs, as **rolling sub-windows + RTH-segmented** (rule #13), every rate WITH raw counts.
3. **A3 (reconciliation, artifact-first).** Cross-validate the recompute-replay regime distribution against the live `signal_eval_archive` 7-day distribution (§2). **If they match** (both show RANGE_BOUND ≈ 0%, TFS ≈ 37%, etc.) → the B.1 replay's 8.8% RANGE_BOUND was a **stale-backfill / sentinel-DBS artifact**, the replay is discarded, live is the truth, and **no `\|dbs\|` boundary moves on reconciliation grounds.** Also report the live sentinel-zero DBS fraction. Only if recompute-replay ≠ live → chase the residual.
4. **A4 (verdict, independent of A3).** Per regime, accept (with affirmative A2 evidence the boundary sits at a defensible live percentile + no tradeable near-miss mass) vs fix. Lens asymmetry: active OFF → lean fix-tight / tolerate-and-document-loose.
5. **A5 (strategy layer).** Lead with `breakout` + `inside_bar_reversal` enabled-but-0-fires (family-filter lane vs detect-gate root cause); confirm `strong_bull_trend` 21-trades is the VTS-fires-disabled-by-design artifact (`vts-runner.ts:1149-1157`); then per-strategy + per-regime breakdown.

**Deliverable:** `B_3_REGIME_AUDIT_REPORT.md` (numbers report; no live-code change beyond the read-only replay extension). The replay extension is an offline diagnostic script (like B.1a) — it does not run in production.

---

## §4 — Blast radius (audit = read-only)

- **Replay-harness extension:** offline `scripts/` tool, read-only against archive/OHLC tables; recomputes DBS in-process via the production fn. Zero production blast radius. No deploy.
- **Optional forward-instrumentation (deferred / nice-to-have):** adding `volatility/dx/momentum` to `archiveSignalEval` `features` is telemetry-only (the MCE context already holds them); would be a tiny separate change if we want ongoing live capture. Not required for the audit.
- **No threshold, formula, gate, or config change in Group A.** Changes (if any) happen in B3.0/B3.1/B3.2, each with its own pre-audit + Langston Step-4/8.
- **SIM/System Manual:** no architecture/math change in the audit → no SIM/Manual edit for Group A. (B3.0/B3.1/B3.2 will update SIM §5.1 / Manual as applicable.)

---

## §5 — Open items carried to the audit run

1. **Raw-DX spikiness (A0 escalation candidate):** A2 must determine whether xStock raw DX sits ≥35 because xStocks genuinely trend or because raw single-period DX is intrinsically hot. The A2-bis near-miss attribution on RANGE_BOUND (how many ST/other bars miss RANGE_BOUND *only* on dx while passing vol+dbs) is the decisive measurement. If it's the raw-DX artifact → crypto-fence escalation to Kyle.
2. **DBS return-component scaling caveat:** quantify the per-class DBS component distributions to confirm whether the fixed 10%-scaling materially under-weights xStock directionality.
3. **RTH-segmentation + holiday-awareness** (rules #13, #17) applied to all distributions.
4. **xStock OHLC retention** is ~4 weeks (verified) — sufficient for a representative rolling window; note it for reproducibility (the window will roll forward).

---

---

## §6 — DBS provenance: embedded code facts (no grep needed — INFRASTRUCTURE NOTE)

> **INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or run `git grep` / `git status` on the GDrive-mounted repo — it hangs for tens of minutes (FUSE). Read THIS file directly (it's on local disk). For any further repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. The facts you'd grep for are embedded below.

**Where DBS is computed in the live path (call sites of `computeDirectionalBias(ohlc, atr)`):**
- `server/asset_classes/xstock_spot/scanner.ts:727` (+ prior-bar at :733) — **the live xStock path.** DBS is computed in the SCANNER pre-filter, then PROPAGATED to MCE (MCE does not compute DBS; it receives the propagated value and threads it into `calculatePairRegime`).
- `server/services/fx5-scanner.ts:1110, 1220` (+ prior-bar :1117, :1227) — crypto/shared pre-filter DBS.
- `server/services/market-scanner.ts:679` (+ prior-bar :685).

**This is why the recompute-from-OHLC replay is faithful:** the replay calls the SAME `computeDirectionalBias(window, atr)` the live xStock scanner calls at `scanner.ts:727`. It is not a re-implementation — it is the production function over the same OHLC.

**`DEFAULT_DBS_CONFIG` (`server/types/directional-bias.types.ts:93-101`):**
- `lookbackPeriod: 48` candles → the recompute replay must fetch ≥48 bars of prefix per classified bar (the B.1a harness fetched a 60-bar prefix — sufficient; but its `OHLC_LOOKBACK_BARS=30` is the regime-momentum lookback, NOT the DBS lookback — the DBS recompute must use 48).
- `emaPeriods: { fast: 12, slow: 26 }`.
- `weights: { slope 0.40, return 0.35, ema 0.25 }` (`DEFAULT_DBS_WEIGHTS`).
- `thresholds: { upStrong 0.60, upModerate 0.30, upWeak 0.10 }` (symmetric down) (`DEFAULT_DBS_THRESHOLDS`).
- `sentinelZero=true` early-return when `ohlc.length < max(lookbackPeriod, emaSlow+1)` OR `atr<=0` → score 0 (this is the live sentinel path A3 must measure).

**Replay-fidelity requirements (for the build step):** (a) use `lookbackPeriod=48` for the DBS recompute; (b) supply ATR computed the same way the scanner supplies it (the scanner passes an ATR into `computeDirectionalBias`); (c) flag `sentinelZero` bars and report their fraction (A3); (d) the regime LABEL depends only on vol/dx/mom/dbs — macroModifier affects confidence only, and B70.3 removed dbsSlope from the label path — so a faithful label recompute needs only those four inputs.

---

---

## §7 — Langston Step-2 ACK + LOCKED guardrails (2026-06-02)

Langston endorsed the methodology to build, conditioned on two pre-build locks + four run-discipline guardrails. All accepted (consensus). Locks resolved here:

**LOCK 1 — ATR-source parity (RESOLVED, code-traced).** The live xStock scanner computes ATR as **`computeATRFromOHLC(ohlc, 14)`** (period 14, on the same OHLC window) at `scanner.ts:715` and passes it into `computeDirectionalBias(ohlc, atr)` at `:727`. The slope-prior uses `computeATRFromOHLC(ohlc.slice(0,-3), 14)` (`:731`). **Replay fidelity requirement:** for each classified bar i, window = bars up to i (≥48 prefix), `atr = computeATRFromOHLC(window, 14)`, `dbs = computeDirectionalBias(window, atr)` — importing the SAME `computeATRFromOHLC` the scanner uses (no re-implementation, no period drift). This eliminates the silent-rescale risk Langston flagged.

**LOCK 2 — Pre-registered A3 match tolerance (defined before the run).** The recompute-replay distribution "matches" live iff: **every regime share is within ±2 percentage points of the live `signal_eval_archive` 7-day share, AND RANGE_BOUND is < 0.5% in BOTH.** If matched → B.1 replay's 8.8% RANGE_BOUND is confirmed a stale-backfill artifact, replay discarded, live = truth, no `|dbs|` boundary moves on reconciliation grounds. Verdict is decided against this rule, not argued post-hoc.

**Run-discipline guardrails (locked):**
- **G1 — DX is the primary lane, not DBS.** RANGE_BOUND (0.02% live) is gated by `dx<35` — a DX story. The DBS recompute is necessary A3 hygiene, but the DECISIVE measurement is A2-bis on dx: of ST/other bars, how many miss RANGE_BOUND *only* on dx while already passing vol+dbs. Budget the raw-DX-vs-smoothed near-miss attribution as the primary analysis; do not let the DBS recompute crowd it out. This is what drives the crypto-fence escalation decision.
- **G2 — Sentinel-fraction asymmetry (state up front).** Live DBS is on admitted rows only (biased subset — we don't open trades on sentinel-zero pairs), so the live sentinel fraction can't be measured unbiasedly; the regime_label distribution CAN (it's on every row). The replay sentinel fraction is the better estimate but is itself a FLOOR (every replay bar has a clean 48-bar snapshot prefix; live hits sentinel more on real-time gaps/cold-starts). A3 reports both with this caveat; does not over-trust the live-admitted sentinel sample.
- **G3 — Holiday-awareness must be WIRED, not just noted.** The window 2026-05-06→06-02 straddles **Memorial Day 2026-05-25 (ARCA closed)**. Holiday/half-sessions are exactly where quiet low-vol/low-dx bars *should* surface — segment them explicitly (analyze separately, don't blend) so they neither hide nor fake a RANGE_BOUND signal. Confirm rule-#17 holiday segmentation is actually in the recompute pipeline.
- **G4 — Forward-instrumentation = tracked follow-up (not dropped).** Adding vol/dx/mom to the archive `features` has standalone value for ongoing RANGE_BOUND-collapse monitoring without re-running the replay. NOT a Group-A blocker; **filed as a tracked follow-up** (to RUNNING_ISSUES at B.3 audit close) per Langston Q2 ask.

**Status:** methodology ENDORSED to build. Both locks resolved. Cleared to build the replay extension (offline diagnostic script, read-only) → run → `B_3_REGIME_AUDIT_REPORT.md`.

---

*Pre-audit complete (with §6 embedded DBS facts + §7 locked guardrails). Next: build the replay extension (lock-1 ATR parity + lock-2 tolerance + G1-G4), local tsc/vitest, Langston Step-4 on the script diff, run on staging → `B_3_REGIME_AUDIT_REPORT.md`. Active trading OFF.*
