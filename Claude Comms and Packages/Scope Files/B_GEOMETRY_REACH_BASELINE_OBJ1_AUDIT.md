# B-GEOMETRY-REACH-BASELINE — OBJ-1 AUDIT RECORD (leg 1: the fee reconciliation)

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Owner:** CC-B · **Step 2 of 11** · **r2, 2026-09-12**

> ⭐ **THIS FILE EXISTS AS A DISCHARGE, NOT AS A REPORT.** Langston tagged the reconciliation figures `RULED ON REPORTED FACT` and ruled that *"your raw query and output going into the record is the right discharge"* — his standing rule makes that **disqualifying for a PROCEED on this leg** until he can re-derive it. **Every query is reproduced verbatim below with its raw output, so the leg closes on the object rather than on my word.**

---

## 1. THE HEADLINE, WRITTEN AS NARROWLY AS IT IS TRUE

✅ **Booked fees reproduce to the cent, and each leg is charged on the CORRECT notional.** Entry fee on **entry** notional; exit fee on **exit** notional. **52 of 52**, average error `0.000000` on both legs.
⛔ **AND THE EXIT LEG ON *ENTRY* NOTIONAL REPRODUCES ONLY 1 OF 52** — which is the measurement that locates the entry-basis convention on the **model** side rather than the booking side.

⛔⛔ **WHAT THIS DOES *NOT* VERIFY, AND IT IS THE MOST IMPORTANT LINE IN THE FILE (Langston's amendment 1, accepted verbatim):**
| leg | what the check actually establishes | what it CANNOT reach |
|---|---|---|
| **exit** | the **mode→rate BINDING**: a maker close was charged the maker row, a taker close the taker row. **Binding verified at n=18 maker / n=34 taker.** | **RATE TRUTH.** Both sides resolve the same `module_constants` `fee_model` rows. |
| **entry** | **internal consistency only** — `entry_fee` against the row's **own stored** `entry_fee_rate`. | **Both rate truth AND the mode→rate binding.** It uses the row's own rate as its reference, so it is **doubly blind**. |

⇒ ⛔ **WRITE IT AS "MAKER *BINDING* VERIFIED AT n=18", NEVER "MAKER VERIFIED AT n=18".** ★ **Langston's reason, and it is the whole point of this batch: the next reader otherwise inherits the exact `b45-tier1-seed` failure — a number nobody ever compared to the venue, wearing a verification.** **Rate truth needs an EXTERNAL reference — the published schedule or an actual Kraken fill — and NOTHING in this reconciliation reaches one.** That is leg 2's job.
⇒ ⛔ **AND THE RECONCILIATION COULD NEVER HAVE CAUGHT A WRONG RATE.** Per `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md:254`, the EV gate prices friction via `getCachedCostMetrics` and the fill/close via `getFrictionForAssetClass().feeRateTaker`, and **both resolve the same `fee_model` rows.** The `0.011` negative control below proves the check discriminates **ARITHMETIC**, not **RATE**.

---

## 2. THE ENTRY-BASIS CONVENTION — SIZED ON THE TAIL, NOT THE MEAN

**The model charges BOTH fee legs on ENTRY notional** (`expectancy.ts:635-636`: `frictionPct = computeTotalRoundTripCost(...)`, then `friction = frictionPct × tradeMeta.entryPrice`), while the booking charges the exit leg on **exit** notional.

⚠️ **r1 of this measurement reported a MEAN. Langston's amendment 2: *"can this flip a ranking" is a TAIL question* — and he is right.** Signed error as basis points of entry notional, n=52:

| statistic | value |
|---|---|
| mean, signed | **−0.58 bps** |
| mean, absolute | 2.51 bps |
| **p95, absolute** | **5.09 bps** |
| **max, absolute** | **5.94 bps** |
| range | −5.80 → +5.94 bps |

✅ **CONCLUSION ON MAGNITUDE, and it stands: 6 bps against a 114 bps total booked fee flips no ranking.**

⛔⛔ **BUT THE SIGNED MEAN IS A MIXTURE AVERAGE AND r1'S READING OF IT WAS WRONG (Langston's re-derivation, measured by me at the object).** The sign is `sign(entry − exit)` **by identity**, so the two outcomes are **disjoint and deterministically signed** — measured, with zero overlap:

| outcome | n | positive | negative | mean signed | range |
|---|---|---|---|---|---|
| `target_hit` | 18 | **18** | **0** | **+2.79 bps** | +1.81 → +5.94 |
| `stop_hit` | 34 | **0** | **34** | **−2.37 bps** | −5.80 → −0.14 |

⇒ ⛔ **SO *“pessimistic on average — the side to be wrong on”* IS AN ARTEFACT OF A 34.6 % WIN RATE, NOT A PROPERTY OF THE CONVENTION.** Solving the mixture for zero gives **a flip at a ~45.9 % win rate**; above it the mean turns optimistic. ⭐ **And the model is optimistic on EXACTLY the winners — the trades that carry the ranking.** **Published per outcome, never as one mean.**
⚠️ **SIGN CONVENTION, stated because nothing in r1 did and mine is INVERTED relative to the obvious one:** positive here means **booked-on-exit-notional EXCEEDS model-on-entry-notional**, i.e. the model **under**-charges. It is *not* model-minus-booked.
⛔ **DISPOSITION: rule-24 outcome (2), working-as-designed-but-unaddressed. RECORDED, NOT ACTED.** ⛔⛔ **AND THE STRUCTURAL ARGUMENT I ATTACHED TO THIS IS WITHDRAWN — IT WAS WRONG, AND WRONG IN THE DIRECTION THAT SUITED ME.** I argued that leaving the entry basis alone is *structurally* right because it is what makes `∂friction/∂distTarget = 0` and therefore what makes §1c's identity unconditional — so a more accurate cost model would weaken our own headline. ✅ **The premise holds** (`expectancy.ts:636-637` does make that derivative zero). ⛔ **The conclusion does not.** Langston's derivation, re-checked by me at the object: correct the exit leg to exit notional and the expectation-correct friction term is `r_e + pWin·r_x(1+distTarget) + pLoss·r_x(1−distStop)`, giving **`∂netEV/∂distTarget = pWin(1 − r_x)` — still UNCONDITIONAL, merely scaled by 0.992.** Even the cruder deterministic-at-target form gives `pWin − r_x`, positive iff `pWin > 0.008` — and I read the clamp live: `expectancy_kernel.pwin_floor = 0.40`, `pwin_ceiling = 0.60` (`b72-step3-commit-b`). ⭐ **`pWin` is floor-clamped at FIFTY TIMES the taker rate by construction, so an accurate cost model costs §1c nothing.** ⇒ **the entry basis is NOT load-bearing for the identity, and *“a better cost model weakens our headline”* is FALSE.**
✅ **THE DISPOSITION SURVIVES ON THE HONEST REASON, which is the only one it ever needed: outcome (2), a scope call about which basis the model should carry, ≤6 bps, out of THIS batch.** ⛔ **Not because the inaccuracy protects anything.** ⚠️ **I flagged this argument for checking precisely because it favoured doing less work — which is the only reason it was caught before it became a precedent.**
⚠️ **AND THE ATTRIBUTION WAS MINE, NOT HIS — r1 of this file tagged the argument **(Langston)**. It was my reasoning and his name is STRUCK.** ⭐ **That is the `#452` shape exactly: a wrong argument one commit away from becoming the reviewer's precedent.** *(He ran recall and got zero hits, but his index is 306 Discord rows behind, so neither of us can prove he never endorsed it — withdrawn either way.)*
✅ **What is missing is a DECISION about which basis the model should carry — a scope call, ≤6 bps, out of this batch.**

### ⛔ FORWARD-BINDING CONDITION ON THE 6 bps BOUND — NOT A FOOTNOTE

**Two separate limits, and r1 stated neither:**
1. ⚠️ **POPULATION-LIMITED.** *"Our moves do not reach 10 %"* is a claim about the system. **What was measured is "no move in 52 closed trades reached it."**
2. ⛔⛔ **CONFIG-CONTINGENT, AND THIS IS THE ONE THAT CAN CHANGE WITHOUT ANYONE RE-RUNNING THE MEASUREMENT.** There is **no ratchet lane producing long runners right now** — verified by me at the DB, not taken on report: `trailing_exit.trailing_enabled_active` = **false on all four asset classes** (set 2026-07-23 by `p19-b8.5i`), `trailing_enabled_vts` = **false on all four**, and `moonbag_qualifying_strategies` = **`[]`** (empty, `B79.0n.TEC`). ⇒ **the 5.94 bps max is PARTLY AN ARTEFACT OF EXITS BEING CAPPED AT TARGET.**
⇒ ⛔ **IF EITHER KNOB FLIPS, THE TAIL EXTENDS AND THIS BOUND MUST BE RE-DERIVED.** The error is proportional to `(exit − entry)` notional, i.e. to the realised move, so a lane that produces long runners produces a longer tail **by construction.** *(Langston's arithmetic, unreached by our data but correct: a +10 % winner at taker mis-charges ~8 bps on that leg.)*

---

## 3. THE SIX EXCLUDED ROWS — NON-INFORMATIVE, NOT UNREPRESENTATIVE

⚠️ **I had conflated two different sets of six earlier in the day, so this was VERIFIED rather than assumed.** Measured: the `exit_fee_mode IS NULL` set and the `intended_entry_price IS NULL` set are **THE SAME SIX ROWS** — `n_both = 6`, and **both "only" counts are ZERO**.

| symbol | strategy | close_reason | entry_fee | exit_fee | total_cost | net_pnl_% | exit_price |
|---|---|---|---|---|---|---|---|
| CRV/USD | morning_star | `never_filled` | 0 | 0 | 0 | 0 | — |
| APR/USD | sma_trend_ride | `never_filled` | 0 | 0 | 0 | 0 | — |
| WLD/USD | morning_star | `never_filled` | 0 | 0 | 0 | 0 | — |
| RAY/USD | inside_bar_reversal | `never_filled` | 0 | 0 | 0 | 0 | — |
| SUI/USD | morning_star | *(none — opened today)* | 0 | 0 | 0 | 0 | — |
| AERO/USD | morning_star | *(none — opened today)* | 0 | 0 | 0 | 0 | — |

⇒ ✅ **THEY HAVE NO FEE TO RECONCILE.** Non-informative with respect to fee basis; **not** a representativeness gap.
⚠️ **AND COLTRANE'S 4-UNFILLED-IN-56 IS *CORROBORATION ON AN ADJACENT POPULATION, NOT INDEPENDENT CONFIRMATION* of these six (Langston's caution, accepted).** It is not load-bearing here and carries no weight in this record.

---

## 4. THE MAKER SPLIT — AND A STALE PRIOR CORRECTED

⭐ **`ACTIVE_TRADING_PIPELINE_AUDIT`'s *"maker is stored but never used"* on the crypto path DOES NOT HOLD at this population.** Measured, `crypto_spot`, `opened_at ≥ 2026-09-01`:

| leg | maker | taker | null |
|---|---|---|---|
| entry (`chosen_entry_mode`) | **29** | 29 | 0 |
| exit (`exit_fee_mode`) | **18** | 34 | 6 |

⇒ **Both rates are exercised on both legs**, so the maker row's **binding** is verified rather than untested. ⛔ **Its rate TRUTH is not** — §1.

⛔⛔ **AND THE SPLIT IS *PERFECTLY* CONFOUNDED — STATE THIS BESIDE THE n=18, ALWAYS (Langston; measured by me, zero off-diagonal cells).** `maker ≡ target_hit` (18) and `taker ≡ stop_hit` (34), with **no off-diagonal cell at all** — the only other rows are the 6 with no exit. ⇒ **at n=52, exit MODE, OUTCOME and `close_reason` are COLLINEAR.** ⚠️ **So the binding is verified, but it is NOT DISTINGUISHABLE from the alternative: a code path keying off `close_reason` instead of the resting outcome would produce this identical corpus.** **Separating them needs a maker exit that was not a target hit, and this population contains none.**

---

## 5. THE QUERIES AND THEIR RAW OUTPUT — THE DISCHARGE

**Object:** `closed_trades`. **Population:** `asset_class='crypto_spot' AND opened_at >= '2026-09-01'`, n=58, of which **52** carry a reconcilable fee pair (§3). **Rates:** `0.004` maker / `0.008` taker, from `module_constants` `fee_model` `crypto_spot`. **Read:** 2026-09-12, staging, via `psql` against `$DATABASE_URL`.

**RECONCILIATION + NEGATIVE CONTROL — raw output:**
```
 n  | entry_leg_reproduces_to_cent | exit_leg_matches_exit_notional | exit_leg_matches_entry_notional | avg_err_entry | avg_err_exit_on_exit | avg_err_exit_on_entry
 52 |                           52 |                             52 |                               1 |      0.000000 |             0.000000 |              0.021691

 n  | reproduces_correct_rate | reproduces_wrong_rate
 58 |                      52 |                     0
```
✅ **The control discriminates: the correct rate reproduces 52, a deliberately wrong rate (`0.008 → 0.011`) reproduces ZERO.** ⛔ **On ARITHMETIC only — §1.**

**THE TAIL — raw output:**
```
 n  | mean_signed_bps | mean_abs_bps | p95_abs_bps | max_abs_bps | most_negative_bps | most_positive_bps
 52 |           -0.58 |         2.51 |        5.09 |        5.94 |             -5.80 |              5.94
```

**THE SAME-SET CHECK ON THE SIX — raw output:**
```
 n_total | n_exit_mode_null | n_intended_null | n_both | n_exitnull_only | n_intendednull_only
      58 |                6 |               6 |      6 |               0 |                   0
```

**Full SQL** is in the session scratchpad (`obj1.sql`, `obj1b.sql`, `obj1c.sql`, `knobs.sql`); the predicates are stated above in full so the queries can be rebuilt from this file alone.

---

## 6. WHAT LEG 1 SETTLES, AND WHAT IT HANDS TO LEG 2

✅ **SETTLED:** the booking is correct on both legs and both bases; the model's entry-basis convention is real, sized at ≤6 bps under the current exit configuration, pessimistic on average, and **deliberate** — outcome (2), recorded not acted.
⛔ **NOT SETTLED, AND IT IS NOW THE WHOLE WEIGHT OF OBJ-1: whether the RATES are right.** We carry flat Tier-1 assumptions (crypto `0.80` taker / `0.40` maker) and **nothing reads the account's rung.** Kraken's schedule is tiered by 30-day volume and assets on platform. ⇒ **if the rung differs, every cost figure in this batch moves — including §1d's 44 %-of-risk-unit and the 54.3 %/50.2 % break-evens.**

**LEG 2, authorised by Langston on his own authority** (*"it places no order, changes no state… it moves neither risk nor authority"*), **under four conditions carried here verbatim in substance:**
1. **Read-only endpoint**, nothing order-placing in the same path.
2. **Capture the raw response + UTC stamp in the record** so it is re-derivable.
3. **Show the response actually carries OUR volume/tier** rather than a schedule default.
4. ⛔⛔ **IF THE RUNG DIFFERS FROM THE SEED, THE FIX IS A *SOURCED RATE WITH A REFRESH PATH* — NEVER A NEW HARDCODED NUMBER.** ★ **The rung is a 30-day ROLLING value, so a single read is a timestamped SNAPSHOT, not a constant. Hardcoding today's answer reproduces `b45-tier1-seed` exactly — which is the failure this batch exists to stop repeating.**
