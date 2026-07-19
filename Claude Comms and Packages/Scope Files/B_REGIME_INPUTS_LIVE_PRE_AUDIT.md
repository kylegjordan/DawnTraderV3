# B-REGIME-INPUTS-LIVE — PRE-AUDIT (Step 2)

**change-class: architecture** · Owner CC-A · 2026-07-19
**Step-1 APPROVED** by Langston with four rulings (Q1–Q4) + two implementation flags, both incorporated below.

---

## 0. CORRECTION TO MY OWN SCOPE (Langston Step-1 flag 1) — VERIFIED, HE IS RIGHT

The scope said the live MCE values are *"already retrieved and sitting in a variable in the same function."* **That is LOOSE and the second half is FALSE.** Verified in code:

```
:601   try {
:611     const mceCtx = mce.getCachedContext(rawSignal.symbol, sizingContext.assetClass);
:613   } catch { /* MCE not ready */ }
```

`mceCtx` is **block-scoped inside a 3-line `try`** and appears **nowhere** between `:700–:1000` — i.e. it is **not in lexical scope at any SQEInput build site**. What survives of the claim: the context is **cached**, so a fresh `getCachedContext` call at each site is cheap (map lookup, no recompute, no I/O). **The diff MUST call `getCachedContext` fresh at each site and MUST NOT reference the `:611` local.** Recorded as a correction rather than quietly fixed, because the scope is the reviewed artifact.

## 0.1 ★ NEW FINDING FROM THAT SAME BLOCK — the silent swallow

`} catch { /* MCE not ready */ }` at `:613` **discards the failure silently**. This is the *same disease* as the `0.015` fallback, at the very site we are about to route through: when the MCE is not ready, nothing is logged, nothing alarms, and the code proceeds on whatever default follows. **OBJ-3 (fail loud) applies directly here** — the new reads must not inherit this catch shape. Flagged now so it is designed for, not discovered at Step-4.

---

## 1. SIM CONSULTATION (§9 mandatory) — per affected component

| Component | SIM refs | Upstream | Downstream | Verdict |
|---|---|---|---|---|
| **MCE** (`market-context-engine.ts`) | §5.2.5 + `:949` | OHLC, price, volume, DBS, regime config (hard-fail on missing keys, `:1759`) | **Signal Orchestrator (active trading + pattern pool)**, VTS Runner, `calculatePairRegime`, market-indicators, ranking bonus | **Already an active-path dependency — this batch adds NO new coupling**, it consumes an edge the SIM already documents |
| **Signal Orchestrator** | 33 | MCE, strategies, metrics | SQE, RTB | 3 of the 5 edit sites |
| **RTB Service** | 6 | orchestrator, market data | SQE, ranker, TEC | 2 of the 5 edit sites; both refresh mechanisms share `acquireRefreshedInputs`, so `:799` is ONE edit covering both |
| **SQE** (`signal_quality_evaluator.ts`) | 2 | orchestrator + RTB inputs | admission decision | **Not edited** — it already reads what it is given. Only its *inputs* change |
| **market-metrics.ts** | — | — | sole consumer is `ready_to_buy_service.ts:74` | Retired at OBJ-4 |

**★ GOVERNANCE GAP FOUND (fix in OBJ-5):** the **MCE per-symbol context cache is NOT in the SIM's "Cross-Cutting Runtime State, Singletons & Liveness Registry."** It is shared in-memory state — `this.cache`, keyed **`${symbol}:${assetClass}`**, TTL-expiring (`:1373-1375`) — and §9 requires that registry be read before any change touching shared in-memory state. It could not be read for this batch because it is not there. **Register it (with its key shape + TTL + mode-agnosticism) as part of this batch.**

**SHARED-STATE ANALYSIS (the reason the gap matters):** the cache key is `symbol:assetClass` — **NOT mode-keyed**. Paper and live therefore read the SAME entries. For *market* data that is CORRECT (market conditions are mode-independent, and duplicating them per mode would be waste and drift), so this is **SHARED-BENIGN, not a defect** — but it must be *recorded* as a deliberate decision, because an unregistered shared map is exactly how a future mode-isolation bug gets argued about. Contrast the RTB maps, which ARE `Map<mode,…>` because they hold per-mode *trade* state.

**BACKGROUND EXECUTION:** the MCE refreshes on a timer (`:312`, `cacheTTLMs`) and retries on failure (`:360`). ⇒ **a cache MISS is a normal, expected transient**, not an exceptional condition — which is precisely why OBJ-3's fail-loud disposition must distinguish *one cold symbol* from *the MCE is down* (Langston Q4).

---

## 2. THE FIVE EDIT SITES (Langston flag 2 — a single miss = OBJ-0 violation on that path)

| # | Path | Site | Today | After |
|---|---|---|---|---|
| 1 | `signal-orchestrator.ts` | `:587` | `trendStrength: 0.5 // Default for legacy signals` | MCE-derived |
| 2 | `signal-orchestrator.ts` | `:790` | `trendStrength: 0.5` + `volatility: extendedMetrics.volatility ?? 0.3` | MCE-derived (both) |
| 3 | `signal-orchestrator.ts` | `:974` | `trendStrength: 0.5` | MCE-derived |
| 4 | `ready_to_buy_service.ts` | `:799` | `getVolatility(normalizedSymbol)` → orphan → `0.015` | MCE volatility |
| 5 | `ready_to_buy_service.ts` | `:901` | `metadata.trendStrength ?? 0.5` | MCE-derived |

★★ **CORRECTION 2026-07-19 (CC-A, post-approval — THE TABLE ABOVE IS INCOMPLETE AND LANGSTON APPROVED IT ON MY BAD COUNT).** I re-ran the enumeration across ALL of `server/` instead of trusting my own five-site table, and there are **ELEVEN** sites, not five. **Missed in the two caller files:** `ready_to_buy_service.ts:318` (`metadata.volatility ?? 0.3`), `:885`, `:949`, `:1250` (`metadata.trendStrength ?? 0.5`), `:901`, `:1191` (`metadata.regimeWeight ?? 0.5`). **★ AND THREE MISSED ENTIRELY because the table only examined the two CALLER files, never the shared math they call into:** `score-calculator.ts:72` — `const trendStrength = metrics.trendStrength ?? 0.5;` · `quality_index.ts:300` — `trendStrength: signal.trendStrength ?? 0.5,` · `signal_quality_evaluator.ts:532` — `trendStrength: (input as any).trendStrength ?? 0.5,`. **WHY THE THIRD GROUP CHANGES THE JOB:** `score-calculator.ts:72` is INSIDE `calculateRegimeWeight` — the very function whose pinned output IS the defect — and it carries its OWN defensive `?? 0.5`. So with every caller fixed, anything arriving undefined is SILENTLY re-substituted and the gate returns to 0.6455 with nothing logged. **A defensive default inside the function whose constant output is the defect is not a safety net; it is the defect's last line of retreat.** ⇒ **OBJ-0 IS BIGGER THAN SCOPED:** fixing both inputs is necessary but NOT sufficient — the shared-math fallbacks must also be closed or the fix is one `undefined` away from silently reverting, having passed review. ⚠️ **NOT ACTIONED PENDING LANGSTON:** those three are shared with the VTS path, which is HEALTHY TODAY (9,041 distinct values), so a naive removal risks breaking something that works. Likely right shape = make the parameter REQUIRED and fail loud at the boundary, so VTS keeps passing its real value and the active path can no longer pass nothing — but that widens blast radius beyond the approved scope, so it is his ruling, not my unilateral widening. **Implementation PAUSED at the root site + circuit breaker rather than proceed on a plan known to be wrong.**

**Note the TWO DIFFERENT fallbacks** — `?? 0.3` at genesis (site 2) and `0.015` at refresh (site 4). Neither is a chosen default; both are silent substitutions. A fix that removes one and leaves the other still ships a pinned route.

---

## 3. RULINGS ADOPTED (Langston Step-1)

- **Q1 — `trendStrength = min(1, adx/50)` as a STATED INTERIM.** Linear, monotonic, bounded; anchored so the conventional ADX-25 trending threshold → 0.5 and ADX-50 (strong trend) → 1.0. **Documented as PROVISIONAL in scope + SIM; curve calibration homed to Phase-25** beside the 0.30 floor, same first-time-on-evidence treatment (measure the real ADX distribution first). This is not an unexplained curve: it is anchored, disclosed, and scheduled.
- **Q2 — STANDS ALONE** as a numbered Phase-19 item. Cross-reference B-RTB-REFRESH-CONSOLIDATE's fail-loud objective; do not merge.
- **Q3 — CONFIRMED PREREQUISITE.** Mechanism-A retirement stays blocked until **VC-1 (distribution spread) AND VC-2 (one observed rejection)** both pass post-deploy. This batch makes that gate *meetable*; it does not lower it.
- **Q4 — REJECT the signal on a missing input, PLUS a system-level miss-rate circuit-breaker.** Per-signal: reject, never substitute. System-level: fire a `system-alerts` entry when the MCE-miss rate crosses a threshold **or** the RTB pool drains below N in a cycle. Distinguishes *one cold symbol* from *the MCE is down*. **Not** admit-and-alarm.

---

## 4. BLAST RADIUS (deltas from the scope)

| Surface | Effect |
|---|---|
| RegimeWeight gate | starts rejecting — **intended** |
| Trade volume | falls (Kyle briefed + accepted); VC-5 guards the pathological → ~zero case |
| Active-path sizing | **none** — verified `regimeWeight` absent from `active-position-sizing.ts` / `active-execution-engine.ts` |
| VTS | **none** — already correct; not touched |
| MCE | **read-only consumer added**; no new computation (cached), no new I/O, no new singleton |
| `signal_eval_archive` / funnel telemetry | rejection counts become non-zero — **expected**, and partially explains the audit's `RTB Rejected in Refresh = 0` symptom alongside the frozen-snapshot cause already fixed |
| Pre-fix soak data | **provisional** — gathered while one of two gates was inert |

---

## 5. RISKS

1. **MCE cache-miss storm** → pool drains. Mitigated by Q4's circuit-breaker; VC-5 is the observable.
2. **Interim curve is wrong** → gate rejects at the wrong rate. Bounded: disclosed as provisional, floor untouched, calibration homed Phase-25, distribution measured before anyone tunes.
3. **A missed edit site** → that route stays pinned and the gate looks alive. Mitigated by the §2 five-site table; **Langston checks every one at Step-4**.
4. **Inheriting the `:613` silent-catch shape** into the new reads → re-creates the disease. Mitigated by §0.1 being designed for, not discovered.

---

## 6. VERIFICATION (unchanged from scope; restated as the close conditions)

**VC-1** distribution spreads like VTS (16,183 trades / 9,041 distinct / 41.11% below floor) — **a single pinned value = FAILED regardless of the diff**. **VC-2** observe a real rejection. **VC-3** fail-loud proven with MCE absent. **VC-4** UI-verified on staging (§9.3). **VC-5** volume falls but does not collapse to ~zero.
