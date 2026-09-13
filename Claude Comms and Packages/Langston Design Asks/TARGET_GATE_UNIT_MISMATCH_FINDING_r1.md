# FINDING — THE TARGET GATE'S FLOOR AND CEILING ARE IN DIFFERENT UNITS, AND THE WINDOW CAN BE EMPTY

**CC-B, 2026-09-13 · `#1061` · Kyle-prompted** ("if we have a ceiling, we may have a floor also … if it
works in one direction, then we're being restricted; it works in the opposite way as well")

⛔ **This is arithmetic over two constants and one function, both read at
`origin/migration/aws-supabase`. It is not a measurement and does not depend on any query.**

---

## 1. THE TWO GATES, AS WRITTEN

`server/core/calculations/signal-target-normalizer.ts:104-121`, in order:

```ts
const risk   = entryPrice - stopPrice;
const reward = targetPrice - entryPrice;
const rr           = reward / risk;
const atrsToTarget = atr > 0 ? reward / atr : Number.POSITIVE_INFINITY;

if (rr < minRR)                   return { ok:false, reason:'rr_below_min' };
if (atrsToTarget > reachAtrMax)   return { ok:false, reason:'unreachable'  };
```

- **`min_rr` is a FLOOR on `reward / risk`** — denominated in **RISK**.
- **`reach_atr_max` is a CEILING on `reward / ATR`** — denominated in **ATR**.

⇒ both hold only if **`minRR × risk ≤ reward ≤ reachAtrMax × ATR`**, which requires

> ### ⛔ `risk / ATR  ≤  reachAtrMax / minRR`
>
> **A property of the STOP, which neither constant mentions.** If a strategy's stop is wider than that
> bound, **no target price exists that clears both gates** — the strategy is off by arithmetic, not by
> calibration.

## 2. THE BOUND, PER CRYPTO STRATEGY (ceiling 4.0 for every row — `reach_atr_max` has no per-strategy value)

| strategy | `min_rr` | widest stop that can EVER pass |
|---|---|---|
| `support_bounce` | 1.00 | 4.00 ATR |
| `volatility_edge` | 1.00 | 4.00 ATR |
| `morning_star` | 1.39 | 2.88 ATR |
| `range_trade` | 1.71 | 2.34 ATR |
| **`strong_bull_trend`** | **1.95** | **2.05 ATR** |
| *(class default `*`)* | 2.00 | 2.00 ATR |
| `reverse_impulse` | 2.40 | 1.67 ATR |
| **`vwap_pullback`** | **2.44** | **1.64 ATR** |
| **`mean_reversion`** | **2.88** | **1.39 ATR** |

**Worked case — `strong_bull_trend`.** `target_exit_atr_multiplier = 6.0` and its stop sits near 3 ATR
(consistent with the observed `rr` of **exactly 2.000** on all 4,732 VTS trades: 6 ATR ÷ 3 ATR).
The floor demands `reward ≥ 1.95 × 3 = 5.85 ATR`; the ceiling refuses `reward > 4.0 ATR`.
⇒ **`5.85 > 4.0` — the window is EMPTY**, which is why **0 of 298,731** evaluations passed.

⭐ **AND THE TIGHTENING RUNS THE WRONG WAY ROUND.** A *better* reward-to-risk demand (a higher
`min_rr`) makes a strategy *more* likely to be refused as unreachable. The two most demanding
strategies on quality — `mean_reversion` and `vwap_pullback` — have the narrowest feasible stops.

## 3. ⛔ THE OTHER FLOOR IS DEAD CODE, AND IT STILL HAS A LIVE-LOOKING VALUE

`target_floor_pct` = **0.040** for both `crypto_spot` and `xstock_spot`, `updated_at` 2026-06-20.
It does nothing (`signal-target-normalizer.ts:95-103`):

```ts
// reorg-B2.1 OBJ-1 (2026-06-21): the floor-LIFT is REMOVED — never mutate a strategy's target.
const lifted = false;
const targetPrice = nativeTarget;
```

The removal is deliberate and well-reasoned — lifting a target to clear the RR gate fabricates reward.
⚠️ **The defect is that the constant was left in the database carrying a plausible value**, and
`getPerClassTargetGate` still resolves it and still `REQUIRED`s it, so a reader sees a populated,
recently-updated knob that cannot affect anything. **Same class as `population-narrowed-by-construction`:
the artifact reads as live and is not.**

## 4. ⛔ MY OWN BATCH MADE THE PINCER TIGHTEST FOR DRIFTED TOKENS — STATED BECAUSE IT IS MINE

`B-GEOMETRY-REACH-BASELINE` shipped `reach_atr_max_unknown_floor = 4.0` today, alongside the existing
`min_rr_unknown_floor = 2.88`. ⇒ an **unrecognised strategy token** gets `4.0 / 2.88 = 1.39 ATR` — the
**narrowest window on the board.**

Failing closed is correct and I do not propose changing it. **What was never recorded is that failing
closed HERE means a near-unsatisfiable window**, so a drifted token does not degrade to "stricter" — it
degrades to "almost certainly cannot trade." That belongs in the batch record and is not there.

## 5. WHAT I AM **NOT** CLAIMING

- ⛔ **Not** that the gates are wrong to exist, nor that `min_rr` should be lowered. A strategy refused
  here may be correctly refused; §6's evidence is about `strong_bull_trend` only.
- ⛔ **Not** that every strategy in §2 is actually blocked — the bound says what is POSSIBLE, not what
  is OBSERVED. Observed stop/ATR per strategy is **UNMEASURED** as of this writing; two queries are
  running. **The arithmetic is sound whatever they return; the magnitudes are not yet mine to state.**
- ⛔ **Not** a code fix. This is bug-taxonomy **outcome (2)** — each gate does what it was built to do;
  what is missing is a DECISION about how they compose. That is a scope call.

## 6. THE ONE PLACE EVIDENCE ALREADY EXISTS

Retrospective excursion for `strong_bull_trend`, crypto, from raw 1m bars (**no provenance needed**),
1,288 trades 2026-08-01 → 09-11, maker-only, trailing confirmed OFF
(`trailing_enabled_active` / `trailing_enabled_vts` both `false` since 2026-07-23):

| target | net expectancy per trade (maker) |
|---|---|
| 2R *(current)* | **−0.059 R** |
| 3R | −0.004 R |
| **4R** | **+0.052 R** |
| **6R** | **+0.108 R** |

⇒ **the profitable setting for this strategy is the one the ceiling refuses**, and the strategy's own
`target_exit_atr_multiplier` of 6.0 already asks for it.
⚠️ **Caveats, stated:** the 48-hour horizon is a chosen parameter and is not tuned; a 1m bar containing
BOTH target and stop is scored as a win, which flatters the result and is **unquantified**; and maker
fills are assumed, which they will not always be.

## 7. DISPOSITION

> `HOME: B-TARGET-GATE-COMPOSITION, owner CC-B, PHASE_19_PLAN, placed immediately after 2.4-FEE-c-ii`

Scope it to answer one question: **given a strategy's realised stop width and its realised excursion,
what (target, ceiling, min_rr) triple maximises net-of-fees expectancy under maker-only execution** —
per strategy, per class. Not a ceiling in isolation; the triple.
