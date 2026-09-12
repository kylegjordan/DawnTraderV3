# REWARD-TO-RISK AND HOLDING HORIZON — THE RECOVERED EVIDENCE

> **Kyle-directed 2026-09-12: the three of us — CC-B, Langston, Coltrane — decide whether there is a PRACTICAL BASELINE we can set NOW, without calibration, that is better reasoned than the constants currently in place, and that lets us observe real trades. Phase 25 refines it later.**
> ⛔ **THIS DOCUMENT EXISTS BECAUSE THE FINDING DID NOT.** Every number below was produced on 2026-09-07 and lived **only in four Discord messages**, never in a repo artefact. My own search for it returned nothing and I wrote it up as an unlocated derivation. **That was a search-terms failure, not an absence** — Langston holds it and supplied exact provenance. A load-bearing conclusion that exists only in chat is one bad week from being lost; this is the fix.

---

## 1. THE MECHANISM (Langston, 2026-09-07T07:33:40Z, verified by him at `0a7e206fb`)

**`R = TARGET_ATR_MULT / STOP_ATR_MULT`** — `LEVER_INVENTORY.md:221` (`strategy_geometry`); per-strategy values at `authority-baseline-v1.json:162-299` (MS 2.5, IB 2.0, SB 2.0, PS 3.0/1.5, AF 3.0/1.5, DH 1.8, VE 2.5).

⇒ **ATR cancels, so R is a per-strategy CONSTANT BY CONSTRUCTION, and there is no cost term anywhere in the expression.**

⛔ **THERE IS ALREADY AN R LEVER AND IT IS A FLOOR, NOT A SETTER** — the resolved `minRR` guard (`strong-bull-trend.ts:176-180`, `pre-execution-validator.ts:338-347`). **Scope against it. Do not add a parallel one.**

---

## 2. THE DISTRIBUTION (CC-C, 07:31:56Z — produced because Langston forced per-trade computation)

| | R=1.11 | R=1.67 | R=1.33 | R=2.0 | rest |
|---|---|---|---|---|---|
| **crypto** n=442 | **61.5 %** | 14.7 % | 4.8 % | 1.1 % | 17.9 % |
| **xStock** n=264 | — | — | **70.8 %** | **23.1 %** | 6.1 % |

★ **The ratio-of-medians (204/166 = 1.23) HID a spike at 1.11 carrying 272 trades.** That is why Langston's correction mattered: *"compute R per trade, then summarise — the median-of-ratios and the ratio-of-medians are not the same number and only one of them is a trade."*

**The arithmetic:** target **+204 bps**, stop **−184 bps**, round trip **161 bps** ⇒ net win **+43** against a **−184** loss ⇒ **break-even needs an 81 % win rate** (60 % at maker/maker, 80 bps). **Observed 43 %** (254 `target_hit` vs 339 `stop_hit`).

⚠️ **Langston's population correction, which binds any restatement:** the 43 % must be computed on the SAME population as the R distribution, **named**. 254/593 barrier-terminal = 43 %; 254/706 = 36 %.

---

## 3. THE HORIZON GRID (CC-C, 08:44:43Z — produced because Langston flagged the 4 h window as an artefact)

Stop fixed at **184 bps** (the measured median). Continuity rule stated: ≥60 % of minutes present, last bar inside the final 10 %, missing minutes **UNOBSERVED, not flat**.

| horizon | best target | P(target) | P(stop) | P(still open) | E net, maker/maker |
|---|---|---|---|---|---|
| 4 h | 200 | 22.9 % | 19.4 % | **57.7 %** | −70 |
| 12 h | 400 | 21.7 % | 37.1 % | 41.2 % | −62 |
| 24 h | 400 | 34.5 % | 47.7 % | 17.7 % | −30 |
| **48 h** | **600** | 34.4 % | 58.7 % | 6.9 % | **+18** ✅ |
| **72 h** | **600** | 45.1 % | 50.5 % | 4.4 % | **+98** ✅ |

★ **INTERIOR OPTIMUM, not a straight line:** at 72 h, 600 beats 400 (+42), beats 800 (+36), beats 1200 (−1) — **≈3.3× the stop distance.** Taker/taker also crosses positive (+17 at 72 h / 600).
⛔ **EVERY CELL of the 120-cell grid is negative at 4 h. That is the NO-SKILL RANDOM-ENTRY FLOOR** — the hole a strategy must climb out of. **It is not evidence that no strategy clears it.**
⚠️ **Why the 4 h reading was wrong:** `max_hold` enforcement has been **off on both active lanes since 2026-07-24**, so *"still open"* at 4 h was a horizon artefact, not a property of the trades. At 4 h 57.7 % unresolved; at 72 h 4.4 %.

---

## 4. ⛔ THE TRAP LANGSTON NAMED BEFORE ANYONE BUILDS ON THIS

Solving the break-even identity for T at the observed p gives **T > 618 bps ⇒ R > 3.36** — suspiciously close to the grid's 3.3×. ⛔ **DO NOT PRESENT THAT AS CORROBORATION.**
**The 43 % was measured AT R = 1.11, and P(target) FALLS as the target widens — the grid says so itself** (34.5 % at 400/24 h vs 22.9 % at 200/4 h). **Holding p fixed while moving T is the same wrong-object shape as the 4 h artefact.** ★ **The grid is the right instrument precisely because it re-measures P(target) in every cell. Two routes agreeing while making incompatible assumptions about p is a coincidence until one is re-derived.**

---

## 5. WHAT I CONFIRMED AT THE DATABASE TODAY (CC-B, 2026-09-12)

- ✅ **The 1.11 REPRODUCES: median crypto R = 1.111** across 479 closed crypto trades; xStock **1.469**. Median crypto hold **3.78 h** (mean 8.14); xStock **8.92 h** (mean 22.07).
- ⛔ **AND I MUST CORRECT MYSELF: I TOLD KYLE AND LANGSTON THE DATABASE HOLDS NO PROFIT FIGURES. THAT IS FALSE.** `closed_trades` carries `net_pnl`, `gross_pnl`, `net_pnl_percent`, `pnl_percent`, `entry_fee`, `exit_fee`, `total_cost`, `exit_price`, `target_exit_price` — **755 rows, every one with net AND gross P&L**, 2026-07-15 → today. I read a true claim about `vts_open_trades` and reported it as a claim about the database.
- ⭐ **AND THE COUNTERFACTUAL CORPUS I SAID DID NOT EXIST DOES: `exit_strategy_alternates`, 173,952 rows** since 2026-05-01, carrying `variant_name`, `virtual_pnl_pct`, `virtual_duration_min`, `virtual_exit_reason` against `baseline_pnl_pct`.
- ⭐ **IT ALREADY ANSWERS AN ADJACENT QUESTION, WITH ITS OWN POSITIVE CONTROL.** `current_BE_stop_baseline` reproduces the actual outcome to **0.0000** in both periods, so the simulator is calibrated. Split at the 2026-07-23 trailing switch-off, crypto:

| period | actual baseline | re-enabling trailing | control |
|---|---|---|---|
| before 07-23 (trailing ON) | **−0.3988 %** | −0.3713 % | 0.0000 ✅ |
| from 07-23 (trailing OFF) | **+0.3522 %** | −0.3478 % (**−0.70 pp**) | 0.0000 ✅ |

⚠️ **CORRELATION, NOT ESTABLISHED CAUSE** — other things changed across that date, and I have not isolated it.
⛔ **AND ONE NUMBER FROM THAT TABLE IS AN ARTEFACT, STATED SO NOBODY REPEATS IT:** xStock `no_BE_stop` shows a mean of **+131 %**, which is **two corrupt rows** (max **448,211 %**, only 2 above 100 %, **median −1.12 %**). ⇒ **the mean of `virtual_pnl_pct` is unusable without trimming, and the writer needs a bound.**

---

## 6. THE PROPOSED BASELINE (Langston's, offered as INPUT, not a decree)

- **R set FROM COST, per asset class** — crypto **near 3× the stop**; **xStock left alone at 1.33**, because its hurdle is 20 bps and the same constant is survivable there. ★ *The same number is fatal on one class and fine on the other, and nothing in the system currently knows the difference.*
- **A DECLARED horizon** — because `max_hold` off since 2026-07-24 means **we have no horizon at all, which is a decision made by default.** **Nothing shorter than 24 h is defensible on this evidence, even before skill.**
- **Both ship with per-trade R and realised hold RECORDED**, so Phase 25 inherits a corpus rather than another argument.

⚠️ **TWO STANDING LIMITS, to be said out loud in any scope:** the 43 % rests on a population whose representativeness is unresolved (`#596`); and the grid is **one regime over seven days**, with overlapping windows and 2,596 origins at 72 h across 17 symbols, so **effective n ≪ nominal n**. Maker fill is unmodelled.

---

## 7. THE ASK

**Is there a defensible baseline we can set now, without calibration?** Specifically: (a) is "R from cost, per class" the right form, or does the existing `minRR` FLOOR do this job if simply re-based; (b) what horizon, given we currently have none; (c) what must be recorded per trade so Phase 25 inherits evidence; and (d) what would falsify the grid's interior optimum before we lean on it.

⛔ **NOT WANTED: a corpus programme, an evaluator build, or a re-litigation of whether the problem is a defect.** Kyle's instruction is a practical baseline that lets us observe real trades.
