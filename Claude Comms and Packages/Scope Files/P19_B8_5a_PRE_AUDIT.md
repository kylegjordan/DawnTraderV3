# P19-B8.5a — Step-2 Pre-Audit (switch-on prep: scoring de-contamination + gate restructure)

change-class: architecture · Owner: NEW Claude (CC-B) · 2026-07-13
**Method:** every touchpoint below READ FIRST-HAND this session at the working tree (== origin); SIM consulted (gate-topology entries + SQE/orchestrator components + the carry-the-stamp invariant); the P25 prestudy (`7eae8716d`+) is the evidence base. SIM + SYSTEM_MANUAL content updates OWED at close (the SIM's documented gate topology — "[11.8B] is the sole active taker-EV gate" — changes with OBJ-3).

## OBJ-3 — net-EV to SQE admission (THE load-bearing dig)

### Design lineage (must be on the record)
Kyle's P19-B7.2b directive (2026-07-01, recorded at `signal-orchestrator.ts:712-724` + SIM P19-B7.2b entry): **the SQE stays calculation-FREE**; `decideMakerTaker` runs standalone BEFORE the SQE. Kyle's 2026-07-13 directive: the net-EV **gate** belongs inside the SQE. **Resolution — no conflict:** the COMPUTATION stays in `decideMakerTaker` (unchanged, still pre-SQE); only the pass/fail **sign check** moves into the SQE, which is exactly how the SQE already gates on pre-computed `finalScore`/`regimeWeight`. Gate-inside, calculation-outside. Calc-free preserved.

### Precedence spec (Langston's ratify item — the wiring, not the forecast)
- **SQE net-EV admission = the AUTHORITY.** Gen-time fail → signal never queued (rides the existing SQE-reject path `signal-orchestrator.ts:793-809` incl. the funnel tally + eval-archive capture). Refresh-time fail → row deleted (existing SQE-fail path `ready_to_buy_service.ts:924-931`).
- **11.8B open-gate (`active-execution-engine.ts:2233`) = STILL-BLOCKS drift backstop (Kyle default, no loosening elected).** Unchanged blocking behavior; a promoted signal whose netEV goes non-positive between final refresh and open is still BLOCKED. ADD: a backstop-reject counter surfaced as telemetry — a non-zero rate is a GATES-DRIFTED investigation signal (expected ~0: both gates read the same `chosen_net_ev` lineage; the only divergence window is post-refresh drift, which is what the backstop is FOR). No two gates can silently disagree: same number, one authority, one backstop with an alarm.
- **Fail-open-if-absent (my recommendation, Langston to ratify):** `chosenNetEv` ABSENT on the SQEInput (legacy queued rows at deploy moment; a caller that cannot supply it) → the SQE net-EV check SKIPS and the 11.8B backstop covers. Rationale: fail-closed would mass-delete every pre-B8.5a row still in the queue at deploy; after one full queue turnover every row carries the snapshot. Alternative (fail-closed) is one line if Langston prefers.

### SQEInput enumeration (the CHECKED list — 3 live call sites + 1 sync variant)
**What the dormant ROI gate (`signal_quality_evaluator.ts:327-350`) reads:** `entryPrice`, `targetPrice`, `regime` (guard), + `assetClass`/`strategy`/`signalType` (predictiveConf lookup + logging). **All three guard fields are absent at ALL call sites** → it stays dormant. **OBJ-3 does NOT activate it** — it is a %-ROI floor redundant with netEV admission; disposition: leave dormant; Phase-25 (25-4) rules retire-vs-keep.

| Call site | Provides | Omits (relevant) |
|---|---|---|
| gen `signal-orchestrator.ts:772-785` | signalId, symbol, strategy, mode, assetClass, confidence, finalScore, regimeWeight, trendStrength(**hardcoded 0.5**), volatility, regimeStability, sourcePool | entry/target/regime (ROI dormant) |
| refresh `ready_to_buy_service.ts:909-920` | …same core… trendStrength(metadata??0.5), volatility | **regimeStability** (→ confidence floor `:355` AND governance gate `:392` silently SKIP at refresh), **sourcePool** (→ pattern elevated floor not applied at refresh; AMR runs pool-blind `:376`), entry/target/regime |
| **batch-refresh `ready_to_buy_service.ts:1163-1176`** — ★NEW, not in the consensus enumeration | (same shape as refresh — verify at implementation) | same omissions expected — MUST be fed `chosenNetEv` too or batch-refreshed rows skip the new gate |
| `evaluateSignalQualitySync` `:451` | tests only (`sqe-config-dynamic.test.ts`); `evaluateSignalBatch` `:536` has ZERO external callers | n/a |

**NEW input:** `chosenNetEv?: number` (+ `chosenEntryMode?` for the log line). Feed: gen = `_mtDecision.chosenNetEV` (`:730-751`, computed pre-SQE); refresh = `_b72bRefreshedMT?.chosenNetEV ?? Number(signal.chosenNetEv)` (the re-decide at `:859-887` sits directly above the re-SQE — adjacent wiring); batch-refresh = same pattern at `:1163`.

**FIX-6 disposition (the refresh-omission findings above):** B8.5a does NOT change the regimeStability/sourcePool omissions (scope discipline; OBJ-5 retiring the finalScore gate moots the pattern-floor delta for finalScore). The explicit intentional-vs-gap ruling is HOMED at Phase-25 25-4 (SQE threshold re-derivation) and the current behavior gets DOCUMENTED in the SysManual update at close — no silent skip left undocumented. `trendStrength` hardcoded 0.5: no consumer in the async gate path — dead-input candidate flagged for Phase-25, untouched here.

## OBJ-1 — ranker de-contamination (FIX-1)
Three sites replace `signalStrength: finalScore`: gen `signal-orchestrator.ts:748`, refresh `ready_to_buy_service.ts:870`, VTS `vts-runner.ts:1702` (path symmetry). **DB knob:** `module_constants` (module `scoring_base`, key `flat_pwin_base`, per-class), read via the existing `getCachedNumberRequired` fail-hard pattern — ZERO new hardcoded constants. **THE PIN (re-derivable):** OLD Claude's probe, commit `8c5383018`, doc §4 at `7eae8716d`+ — n=**12,140** closed post-B62 VTS trades (JSON store, 99.3% field coverage), overall realized WR **0.307** net-of-friction; seed the knob with the MEASURED 0.307 (not a remembered 0.30); per-class seeds from the probe's assetClass segmentation where powered, same-value+flag where thin. OLD Claude to attach the probe script path/query to the pin.
**Behavior-change honesty (Step-4 + Step-7 item):** `signalStrength` drives the adverse-selection slope + hard taker floor inside `decideMakerTaker` — replacing a 0..1 quality score with a flat ~0.307 WILL shift some maker/taker picks. Expected, intended (removes the anti-predictive tint); watch the maker-pick-rate monitor (`getMakerPickProof`) at Step-7.

## OBJ-4 — B1 sever (confidence→sizing)
Chain read first-hand: `computeGlobalStability(driftScore||0.5, volZ||0, regimeConfidence || signal.confidence || 0.5)` at `active-execution-engine.ts:3117-3121` → `resolveStrategyMode` `:3134` → modeOverlay → sizing multiplier 0.25-1.0× (`:3233/:3287`, crew-verified) + stop/target scaling. **Surgical sever: drop the `signal.confidence` fallback leg at `:3120`** (`regimeConfidence || 0.5`). The mode chain itself stays (AMR-active already replaces it per class — the severance precedent at `:3143-3152`); base sizer verified clean (FIX-8). Covers the hybrid propagation automatically (`signal-orchestrator.ts:2299` writes hybridScore into confidence — after the sever, confidence is not read in this chain).

## OBJ-2 — VTS capture (FIX-2)
Persist real DI + netEv + predicted pWin on VTS opens. Real DI from the FX5 pool where the symbol is present (`getFX5DataForSymbol`), **honest NULL where absent — never fabricate** (the reorg-B3 NULL-over-coerce precedent; kills the `:1657` proxy + `:2043` hardcoded-50 for the NEW columns; existing columns untouched for data-contract safety). Additive columns + migration; zero behavior change.

## OBJ-5 — finalScore gate retire + shadow-log
Remove the `finalScore < effectiveMinFinalScore` failure push (`signal_quality_evaluator.ts:312-318`, quant 0.35 / pattern 0.45). ADD a shadow line (would-have-rejected verdict + both thresholds) — LOG-ONLY through paper; finalScore stays COMPUTED upstream (unchanged; needed for the shadow verdict + the Phase-25 formal kill ruling). Surviving floors: regimeWeight (`:321`), confidence floor (`:355`, where inputs present), AMR (`:370`), governance (`:392`), class/hours/whitelist (`:232-287`), + the NEW net-EV admission. `finalScoreMin` config becomes a shadow-only knob (documented, not deleted).

## Blast radius
- SQE type + gate change: 3 live call sites (enumerated), sync variant test-only, batch-evaluate caller-free. VTS unaffected (no SQE — its own Net-EV gate already gates on chosenNetEV per SIM P19-B7.2b).
- `decideMakerTaker` semantics shift via signalStrength (all 4 consumers of its output enumerated in SIM P19-B7.2: open-gate, ranker, refresh, VTS gate — all read `chosen_net_ev`, all get the de-tinted number).
- Sizing chain: one fallback-leg deletion; AMR posture path unchanged.
- Docs: SIM gate-topology entries (P19-B7.2 + B7.2b) + SQE component entry + SysManual SQE/pipeline chapters — content updates owed at close.

## Test plan (per Langston's Step-4 legibility watch-item — each OBJ discretely verifiable)
OBJ-1: unit — decideMakerTaker called with DB-resolved base rate (mock getCachedNumberRequired), no finalScore in the input chain; knob-absent → fail-hard. OBJ-2: VTS open row carries real-or-NULL DI (never 50-fabricated) + netEv + pWin. OBJ-3: netEV≤0 → SQE fail (gen + refresh + batch-refresh); netEV>0 + sub-0.35-finalScore → PASS (proves OBJ-5 interplay); chosenNetEv absent → skip + 11.8B backstop blocks (the drift test); backstop-reject telemetry increments. OBJ-4: same signal, confidence 0.1 vs 0.9, AMR off → identical size/stop/target. OBJ-5: shadow log carries the would-have-rejected verdict at both thresholds.

## Step-2 asks (Langston)
1. Ratify the precedence spec incl. **fail-open-if-absent** (vs fail-closed) for a missing chosenNetEv.
2. Ratify the FIX-6 disposition (omissions documented + homed at 25-4, not changed here).
3. Your (b)/(c) ref-verify: the FIX-1 pin (probe commit `8c5383018`, n=12,140, WR 0.307) + this SQEInput enumeration.
4. Note the ★NEW batch-refresh third call site (`:1163-1176`) — the consensus enumeration said two.
