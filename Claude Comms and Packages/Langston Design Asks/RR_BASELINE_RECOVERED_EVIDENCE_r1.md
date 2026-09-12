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

**The arithmetic:** target **+204 bps**, stop **−184 bps**, round trip **161 bps** ⇒ net win **+43** against a **−184** loss ⇒ **break-even needs an 88.9 % win rate** (68.0 % at maker/maker, 80 bps) ⛔ **CORRECTED 2026-09-12 by Coltrane, re-derived by CC-B: the earlier 81 % / 60 % were UNDERSTATED because they charged the round-trip cost to the WINNER ONLY. The loser pays it too: net win +43, net loss −345, so pBE = (184+161)/(204+184) = 88.92 %; at 80 bps, +124 / −264 = 68.04 %.** ⭐ **This makes the 1.11 ratio WORSE than first reported, not better — the correction strengthens the finding.**. **Observed 43 %** (254 `target_hit` vs 339 `stop_hit`).

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
- ⛔⛔ **AND THE EXIT-TABLE CLAIM I PUT HERE IN r1 IS WITHDRAWN. IT REVERSED IN DIRECTION.** Langston ran it before Coltrane could lean on it; **all three of his measurements reproduce exactly on my own query.**

**THE POPULATION, WHICH MY r1 HEADING FAILED TO NAME: `trade_source = 'vts'` ON 100 % OF 173,952 ROWS — ZERO ACTIVE-PATH TRADES, BOTH CLASSES.** ⇒ every figure below describes **the VTS lane**, which books exits at the cache mid behind the clamp. **It is NOT the lane the R distribution and the 43 % came from** (§2), which makes any cross-reading of the two an `#596` problem, sharper.

**THE WRITER IS UNBOUNDED ON BOTH CLASSES, not two rows on one class as r1 said.** MEASURED: `crypto_spot` n=100,212 — **21 rows above |100 %| and 1,887 above |20 %|** (1.9 % of rows), max |220.98|; `xstock_spot` n=70,524 — 2 and 8, max **448,211.38**.

**AND THE HEADLINE FLIPS UNDER ANY TRIM** (post-2026-07-23, crypto):

| variant | mean (r1 used this) | mean, trimmed ≤ 20 % | median |
|---|---|---|---|
| `current_BE_stop_baseline` | **+0.3522** | **−0.3265** | **−2.3784** |
| `current_trailing_baseline` | −0.3478 | **−0.2085** | **+0.2783** |

⇒ **untrimmed, re-enabling trailing COSTS 0.70 pp; trimmed it GAINS 0.12 pp; on medians it GAINS 2.66 pp.** ⛔ **r1's number was the UNTRIMMED MEAN of a corpus r1 ITSELF had just shown has no writer bound, in the same section.** That is the error, and it is mine.

⛔ **AND THE `0.0000` CONTROL I CITED DOES NOT REACH THE CLAIM (`#661` leg 1).** It proves the replay's **identity arm** reproduces the actual outcome. It says nothing about the **counterfactual arms**, and nothing about whether the right tail is real or garbage. **A control with zero opportunity to fail on the proposition it is offered for is not a control.**

⚠️ **THE 07-23 SPLIT IS UNRESOLVED AND MUST NOT BE READ AS A RESULT.** `trailing_enabled_active` is an **ACTIVE-lane** knob and this corpus is VTS-only, so splitting here is the adjacent-object shape. **Langston's ledger prior: `#677` measured 0 ratchets across 11,760 VTS closes since 2026-05-05 — two months before my boundary.** ⇒ **whether the 07-23 flip reaches VTS at all is a HYPOTHESIS until someone cites the line.** Until then the pre/post difference may be measuring something else entirely.

✅ **WHAT SURVIVES, AND IT IS WORTH KEEPING:** the corpus is real, large and lane-labelled, it carries `virtual_duration_min` and `virtual_exit_reason` per counterfactual, and the identity arm does reproduce the actual. **It is a usable instrument for the VTS lane once bounded and read on medians. It is not evidence about the active lane, and it was never evidence for the sentence r1 built on it.**

⛔ **GATE: `B-VPNL-WRITER-BOUND` (PHASE_19_PLAN row 2.4i) must land before any row cites this corpus** — and its first item is the **taxonomy read** on the extreme rows (a real defect versus a legitimate simulator output on a degenerate price is NOT settled), **not a trim patch.**

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
