# B-GEOMETRY-REACH-BASELINE — SCOPE

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 (replacing the withdrawn content) · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r1**

> ⭐⭐ **KYLE-DIRECTED 2026-09-12, AND HE GAVE THE BALL ON THE *COMBINED* BATCH.** The reward-to-risk work and the reachability-ceiling work are **one batch**, because they are provably one dial. **CC-B owns it.** The reachability leg absorbs what was scoped for a separate CC-C batch.
> ⛔ **AND HIS BINDING OBJECTION TO WHAT CAME BEFORE THIS: a plan that is only measurement and changes nothing is not acceptable.** OBJ-2 and OBJ-3 change live paper behaviour and ship settings. **This is not an instrumentation batch.**

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | The reachability ceiling of 4.0 is **arbitrary**, with no derivation. | **It has a derivation, and 4.0 means "sixteen hours".** | `P19_REORG_B2_PRE_AUDIT.md:41-43`, read at the ref: *"For a driftless walk, expected favorable excursion over H bars scales with √H"*, rule `pass iff floor/(ATR/price) ≤ c·√H`, and *"For a 3.5 % floor, H≈16 (√H=4), c≈1"*. ⇒ **4.0 = √16 on hourly bars.** It is a horizon statement, not a magic number. |
| 2 | Fee split **0.43 % vs 1.69 %**, a 4× difference; break-even 42.2 % vs 54.7 %. | ⛔ **WRONG — those were DOLLARS. As shares of notional: 0.821 % vs 1.573 %.** Break-evens restated below. | `total_cost` is an absolute amount. Re-measured: taker/taker **$1.6882 on $107.01 = 1.5729 %**; maker/maker **$0.4304 on $52.42 = 0.8210 %**. Caught by Coltrane, verified by me. |
| 3 | The maker/taker P&L comparison is *"partly"* confounded. | ⛔ **COMPLETELY confounded, and the reason is structural.** | Measured: **exit maker → 18 target hits / 0 stops; exit taker → 0 targets / 34 stops.** A winner fills its resting target limit (maker); a loser is stopped at market (taker). ⇒ **exit fee mode is an OUTCOME, not a choice.** |
| 4 | Switching to maker fees is the single biggest lever. | ⚠️ **Only the ENTRY leg is choosable, worth ~0.39 pp — and it is NOT sufficient.** | With the pattern median stop 3.54 % and gross R 1.658: taker entry ⇒ break-even **54.3 %**; maker entry ⇒ **50.2 %**. **Observed win rate 41.4 %.** Cost reduction alone does not close the gap. |
| 5 | *"3 of 19 strategies"* (read as 3 quant / 16 pattern). | **QUANT 11 · PATTERN 3 · HYBRID 5.** | Canonical map, 19 distinct keys, none twice. *"3 of 19"* referred to how many strategies have an ATR term in their **stop** — a different axis entirely. |
| 6 | Geometry is DB-resolved, so *"changing R is changing rows"*. | **Each strategy computes its own stop and target in its own module, with its own formula.** The DB holds the **numbers** those formulas read. | Seventeen formulas read one at a time; see the `RR_AND_REACHABILITY_BASELINE_STUDY_r1.md` banner. **There is no single calculation.** |
| 7 | Langston's risk-distance-multiple target must be **built**. | ✅ **It already EXISTS and needs EXTENDING.** | `sma_trend_ride` → `break_target_r_multiple`; `vwap_bounce` → `target_r_multiple`; `abcd_long` → a two-R target. Three strategies already do it, multiple in the DB. |
| 8 | Records are missing: no hold duration, no original target. | ⚠️ **Less is missing than claimed.** | All 29 filled September pattern trades carry `takeProfit`, `originalStopPrice` and timestamps; **median hold 9.76 h** is already derivable. `take_profit` is populated from the signal target (`active-execution-engine.ts:4271`); `target_exit_price` is a **different** field and is not its substitute. |

---

## 1. THE PROBLEM — TWO, REAL, DOING DIFFERENT DAMAGE

### 1a. The ceiling and the holding horizon are ONE parameter, and ours are mutually inconsistent

The ceiling is `c·√H` — **it encodes how long we are willing to hold.** Run it both ways:

| ceiling | implied horizon |
|---|---|
| **3.12 ATR** | 9.76 h — **our measured median hold** |
| **4.00 ATR** | 16 h — **what we actually seeded** |
| **6.00 ATR** | 36 h — **what `strong_bull_trend` needs** |

⛔ **So we are running three different horizons at once:** a ceiling that says sixteen hours, trades that actually resolve in ten, one strategy that needs thirty-six — and **Kyle has declined a maximum hold at all**, which means we are not committing to sixteen hours in the first place. ⇒ **the inconsistency is the problem, not the number 4.0.**

⭐ **And the original document ANTICIPATED this:** *"Seed the per-class bound CONSERVATIVELY … and let the by-reason counts calibrate in Phase[-25]"*. **It was always a placeholder awaiting exactly this work.**

**MEASURED CONSEQUENCE:** `strong_bull_trend` (`strong-bull-trend.ts:152-153`, target `entry + 6.0×ATR`, stop `entry − 3.0×ATR`, **R = 2.00**) exceeds the 4.0 ceiling on every signal. **Every `unreachable` line in the live log is that one strategy**, tagged-and-simulated on the VTS lane and **dropped on the active lane.** Coltrane ran the function directly: a 4-ATR target passes, 6 fails. ⇒ **our best-ratio strategy cannot reach execution.**
⚠️ **AND THE CEILING IS A MOVEMENT ESTIMATE BEING ENFORCED AS AN ABSOLUTE PROHIBITION.** √H estimates *typical* favourable excursion; it never established that a farther target is impossible.

### 1b. Fees consumed a real gross profit

**Object: the 29 filled September crypto pattern-pool trades** (12 target hits, 17 stop hits), recovered independently by Coltrane from the paper-history API and reconciled row by row:

| | |
|---|---|
| gross profit | **+$9.50** |
| entry + exit fees | **$18.35** |
| **net** | **−$8.85** |

✅ **All 29 accounting identities reconcile, and the check is mutation-proved: adding $1 to any recorded net makes it fail.**
⇒ **The cohort made money before costs and lost it after. Fees were 1.93× the gross profit.**

⛔⛔ **WHAT NEITHER PROBLEM ESTABLISHES, AND THIS BOUNDS THE WHOLE BATCH: that these strategies can never be profitable.** A zero-drift two-barrier benchmark on the same geometry gives `P(target first) = stop/(target+stop) = 37.6 %`; we observe **41.4 % on n=29**. ⇒ **the demonstrated edge over a coin flip is ~4 pp on 29 trades — not distinguishable from noise.** **Fixing costs and unblocking a strategy makes the machine work as designed; it does not prove an edge exists.**

---

## 2. PROVENANCE (mandatory 1.b) — CORPORA NAMED, INTENT QUOTED

**Searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `SYSTEM_MANUAL.md` §reorg-B2/B2.1/B2.3, `SYSTEM_IMPACT_MAP.md` §4.1/§4.3, the reorg-B2 scope + pre-audit, and `git log -S` on the constants. **`bridge/canonical/` not consulted** — every site postdates the 2026-01/02 governance change; recorded rather than left silent.

| site | intent, VERBATIM | disposition |
|---|---|---|
| `reach_atr_max` = 4.0 | *"For a driftless walk, expected favorable excursion over H bars scales with √H … For a 3.5 % floor, H≈16 (√H=4), c≈1 → require ATR/price ≥ ~0.9 %. **Seed the per-class bound CONSERVATIVELY … and let the by-reason counts calibrate in Phase**"* | **(2) relevant but needs updating to today's intent.** The derivation is sound; its **horizon assumption is now inconsistent with our hold policy and our realised holds.** This batch supplies the calibration the author asked for. |
| `strong_bull_trend` 6.0 / 3.0 | `b72-step3-commit-b` seed; R = 2.00 by construction | **(1) still relevant and correct.** The geometry is good and matches outside practice. **What is wrong is that nothing can execute it.** |
| the RR floor (`min_rr`) | reorg-B2.3: per-(strategy × class), *"Each seeded floor is a notch below that strategy's OWN-class measured mean RR"* | **(1) correct, and NOT touched by this batch.** ⛔ No floor is moved here. |
| `patternToTradeSignal` 1.5 / 2.5 | *"ATR multipliers (1.5× stop / 2.5× target) stay hardcoded; per-class tuning deferred to Layer-3 (SIM §11263)"* | **(2) relevant, needs updating** — but **OUT OF SCOPE here** (§5). |

---

## 3. OBJECTIVES

> Each back-references the §1/§2 finding it falls out of. Anything unaudited is flagged `UNAUDITED`.

### OBJ-1 — Correct the fee basis before anything is decided on it
**From:** §0 rows 2–4, §1b.
**Change:** reconcile booked fees against **entry notional** so cost is expressed as a share, not an amount; then wire the fee model to the account's **applicable pair-specific maker/taker rates** (Kraken's `TradeVolume` account endpoint) instead of flat Tier-1 assumptions. **Model target exits, stop exits and unfilled orders separately** — they cost different amounts, and §0 row 3 shows exit mode is determined by outcome.
**VERIFICATION:** (a) every September crypto row's booked fee reproduces from rate × notional to the cent, denominator printed; (b) a **negative control** — feed a known-wrong rate and the reconciliation must FAIL; (c) the account's live rung is read and recorded, and **differs from or matches Tier-1 explicitly** rather than being assumed.

### OBJ-2 — Release the reachability conflict for `strong_bull_trend`, PAPER PATH ONLY
**From:** §1a.
**Change:** allow native `strong_bull_trend` signals past **only** the reachability rejection on the active **paper** path. **Keep its native 6-ATR target and 3-ATR stop. Retain the rejection LABEL** so the counterfactual stays measurable. **Every other admission and risk check is untouched.**
⛔ **TWO THINGS THIS DELIBERATELY DOES NOT DO, both of which would be wrong:**
- **Do NOT raise both class ceilings to 6.** The strategy builds geometry from **raw** ATR while the guard may use a **smaller clamped** ATR — Coltrane reproduced a nominal 6-ATR target still failing a ceiling of 6. Changing the number does not reliably change the outcome.
- **Do NOT reuse the existing broad tag-don't-drop mode** — it **also** relaxes the reward-to-risk rejection, which this batch is not touching.
**VERIFICATION:** (a) a test proving **only** `unreachable` changes disposition, with `rr_below_min`, `invalid_atr` and `invalid_geometry` still dropping — each exercised against its own negative control; (b) its **mutation twin**: revert the change and the test must FAIL; (c) live paper shows `strong_bull_trend` positions opening, with the rejection label still stamped; (d) **live mode is provably unaffected** — asserted, not assumed.

### OBJ-3 — Choose exits by net result on data we already hold
**From:** §1b, and Kyle's objection to a measure-only batch.
**Change:** compare current geometry against plausible nearer and farther targets **on the existing trade record and replay machinery**, accounting for execution, unresolved positions, overlapping trades and **capital occupancy**. **Select on a later, untouched period**, then ship the supported settings through the existing configuration system.
⛔ **The objective is NET ACCOUNT GROWTH OVER CALENDAR TIME within the existing risk limits — NOT a reward-to-risk floor.** Both advisors converge on this, and the reason is decisive: **a 1:1 system winning 60 % makes money; a 2:1 system winning 30 % loses it.** Moving a target also changes the chance of reaching it and how long capital is tied up; a ratio rule optimises one of those and silently damages the other two.
⚠️ **`UNAUDITED` — the two corpora that cannot carry this:** the 173,952-row counterfactual set is **VTS-only with unresolved extreme values** (`#1051` / `B-VPNL-WRITER-BOUND`), and the expectancy kernel's probability **does not respond to target distance** (`net-expectancy-kernel.ts:105`), so it cannot select a target by itself. **Both stated here rather than discovered at Step 8.**
**VERIFICATION:** the chosen setting beats the incumbent on the held-out period on net growth per unit time, with the denominator and the holding-period distribution published beside it.

### OBJ-4 — Add only the records genuinely missing
**From:** §0 row 8.
**Change:** the excursion record (how far a trade moved in our favour before turning) in ATR units, which is what makes a **derived** ceiling possible at all. ✅ **Hold duration and the signal's own target already exist — do not re-add them.**
**VERIFICATION:** the ceiling for at least one strategy is **derived from the recorded excursion distribution** rather than chosen, and the derivation is shown.

### OBJ-5 — Governance
**Tier-1 unconditional:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1052`) · `MEMORY_CC_B` · `PHASE_19_PLAN` row 2.4g-2 · the task-list row.
**Tier-2, judged explicitly:** **`SYSTEM_MANUAL`** — YES (the ceiling's derivation and the admission objective are architecture; §reorg-B2 documents both). **`SYSTEM_IMPACT_MAP`** — YES (§4.1 and §4.3 describe this seam).

---

## 4. THE ORDER IS BINDING

**OBJ-1 → OBJ-2 → OBJ-3, and OBJ-4 runs alongside.** OBJ-3 cannot select on costs that OBJ-1 has not corrected, and OBJ-2's window is worthless if the cost basis moves underneath it. ⛔ **Measurement-first does NOT mean measure-only: OBJ-2 changes live paper behaviour and OBJ-3 ships settings.**

---

## 5. OUT OF SCOPE — NAMED, NOT SILENT

| item | why out, and where it lives |
|---|---|
| **Moving any `min_rr` floor** | reorg-B2.3's floors are each calibrated to that strategy's own measured mean. **Nothing here justifies moving one.** |
| **The pattern pool's hardcoded 1.5/2.5** | Kyle's scope call (`#1051` item (i)). ⚠️ **It ships TWO ratios, not one:** the `atr > 0` false arm is 1 %/2 % of price ⇒ **R = 2.0**, so the pool's ratio depends on whether ATR was available. **Pick its value from its own excursion curve once OBJ-4 records it — never from outside consensus.** |
| **A maximum hold** | ✅ **Kyle's decision: none.** Both advisors agree and **Langston states plainly he does not have the 72-hour evidence.** ⚠️ **The tension, carried not buried: with no hold limit, the ceiling's `H` is a policy choice rather than an observation — OBJ-4 is what makes it well-formed.** |
| **Kelly / optimal-f sizing** | They size, they do not set geometry, and Kelly on an unreliable win-rate estimate overbets superlinearly. **Phase 25, and not before `#596` is settled.** |
| **The post-fill ratio degradation** (five September rows where the fill came in worse and nothing re-checked the ratio) | **Rule-24 outcome (2), working-as-designed-unaddressed.** Already homed by Langston against the open entry-slip item, owner CC-C. |
| **One crypto HYBRID row with a non-negative stop distance on a buy** | Langston's claim, **not yet diagnosed.** Diagnose before any measurement leans on that lane. |

---

## 6. EVIDENCE INDEX

| claim | object | read |
|---|---|---|
| ceiling = `c·√H`, 4.0 = √16, seeded conservatively pending calibration | `P19_REORG_B2_PRE_AUDIT.md:41-43` | at the ref |
| `strong_bull_trend` 6.0/3.0, R=2.00, exceeds 4.0 | `strong-bull-trend.ts:152-153` + 2 DB rows + live log | at the ref / 2026-09-12 |
| every `unreachable` line is `strong_bull_trend` at rr=2.00 | staging `out.log` | 2026-09-12 |
| 29 filled pattern trades: +$9.50 gross, $18.35 fees, −$8.85 net, all reconciling | paper-history API (Coltrane, independent population of 56 records incl. 4 unfilled) | 2026-09-12 |
| cost as a share: taker/taker 1.5729 %, maker/maker 0.8210 % | `closed_trades` vs `quantity×entry_price` | 2026-09-12 |
| exit mode is an outcome: maker→18/0, taker→0/34 | `closed_trades` by `close_reason` | 2026-09-12 |
| 19 strategies: QUANT 11 / PATTERN 3 / HYBRID 5 | `canonical-regime-strategy-map.ts` | at the ref |
| median hold 9.76 h; target + original stop already stored | the 29 filled rows | 2026-09-12 |

⚠️ **LIMITS BINDING THIS SCOPE:** the pattern cohort is **n=29** and is the only decision-grade lane; quant (n≈14) and hybrid (n≈9) are directional only. Staging `out.log` reaches **2026-09-10** and rotates 6–8×/day; `error.log` dailies reach **2026-08-30** — **September stderr must be captured this week or it is gone.** Coltrane's population is the API's 56 records, **not** the raw table's 58; the 29 filled pattern rows reconcile exactly between them.
