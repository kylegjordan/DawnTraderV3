# B-GEOMETRY-REACH-BASELINE — SCOPE **r6**, RE-SCOPED ON THE VTS CORPUS

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r7, 2026-09-13**

> ⛔⛔ **KYLE RE-SCOPED THIS AND HE WAS RIGHT ON ALL SIX COUNTS. r1–r5 WERE BUILT ON 29 SEPTEMBER PAPER TRADES WHILE 78,304 VTS TRADES SAT UNUSED SINCE 10 MAY.** His words: *"Using paper mode data limits us tremendously."* **I used roughly 0.04 % of the available trade record.**
> ⛔⛔ **r7 — THE REVERSAL IS RELABELLED A *HYPOTHESIS*, NOT A FINDING (Langston BLOCKER-2, and he is right).** r6 claimed the VTS data shows the ceiling is nearly right and the strategy's target wrong. **It does not show that, because I measured the wrong quantity: `closed_at − opened_at` is time-to-ANY-exit, and the ceiling encodes time-to-TARGET.** `strong_bull_trend`'s 1,652 trades were **all tagged `unreachable`**, so their 15.44 h is the median time to stop-out-or-timeout of trades that mostly never reached 6 ATR. ⇒ **“6 ATR implies 36 h; it resolves in 15.44 h” compares a MODELLED time-to-reach against an OBSERVED time-to-exit-by-other-means. Two different objects.**
> ⭐ **THE HYPOTHESIS IS STILL WORTH CARRYING and r1–r5's opposite framing stays struck — but neither is established, and r7 says so rather than choosing the one that flatters the re-scope.** ⚠️ **This is the seventh instance today of the same class: the shape of the measurement decided the answer.**

---

## 0. WHAT THE RE-SCOPE CHANGED — PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED (r1–r5) | NOW (r6, on VTS) | EVIDENCE |
|---|---|---|---|
| 1 | *(r6)* **REVERSED — the ceiling is ~correct, the TARGET is wrong.** | ⚠️ **r7: HYPOTHESIS, NOT ESTABLISHED.** Both r1–r5's framing and r6's reversal are unproven; r7 asserts neither. | ⛔ **The estimand was wrong.** `closed_at − opened_at` is time-to-any-exit; the gate encodes time-to-target, and §1d proves exit reason cannot be joined. The 15.44 h is time-to-stop-or-timeout for trades that mostly never reached 6 ATR. **Settling it needs realised excursion — see §1f.** |
| 2 | The ceiling is *"an untraced value"*, tone: arbitrary. | ⚠️ **Untraced as to how 4.0 was picked — but it lands within 2 % of what the data implies for the strategy it blocks.** Per-CLASS is the defect, not the value. | §1a below |
| 3 | OBJ-2: change live paper behaviour to observe the blocked strategy. | ⛔⛔ **WITHDRAWN AS A DATA-GATHERING STEP — THE EXPERIMENT HAS ALREADY RUN 4,675 TIMES.** | `strong_bull_trend`: **4,717 VTS trades, 4,675 closed, 2026-05-10 → 09-12, at avg target 6.000 / stop 3.000 ATR.** 1,652 closed since 01-08, **every one tagged `unreachable`.** |
| 4 | Maker share 50 %, from 58 paper trades. | **VTS crypto 18.2 %** (716 maker / 3,938 stamped); **xStock 0.92 %** (19 / 2,072). | `vts_open_trades.chosen_entry_mode` |
| 5 | OBJ-1: establish the fee basis and read the account rung. | ⚠️ **SHRUNK. The schedule is already documented and the split was already observed.** The xStock 0.92 % appears to satisfy an existing ≤1.0 % observation criterion at n≥300 — **an observation window CC-B already owns and had not read.** | `KRAKEN_FEE_SCHEDULE_REFERENCE` §1–§6; the P8 criterion |
| 6 | `B-EV-TARGET-PROBABILITY` as a new batch. | ⚠️ **LIKELY DUPLICATES PLANNED WORK — verify before adding.** The scoring rebuild is already the ratified Phase-25 blueprint (`P25_SCORING_STACK_PRESTUDY` PART II: `finalScore` RETIRE, `hybridScore` two-layer model + Platt). | Kyle: *"we have plans to change it in an upcoming batch"* |

---

## 1. THE PROBLEM, RESTATED ON FOUR MONTHS OF DATA

### 1a. ⭐⭐ THE CEILING IS A PER-STRATEGY QUANTITY STORED PER CLASS — and that, not its value, is the defect

The ceiling is `c·√H`. **`H` is now MEASURED per strategy** — `closed_at − opened_at`, VTS crypto, closed, `opened_at ≥ 2026-08-01`, **n = 28,020**:

| strategy | n | median hold | **ceiling its own hold implies (√H)** | vs the live 4.0 |
|---|---|---|---|---|
| `reverse_impulse` | 560 | 1.77 h | **1.33** | 3.0× too generous |
| `sma_trend_ride` | 1,369 | 3.89 h | **1.97** | 2.0× too generous |
| `range_trade` | 156 | 5.22 h | **2.28** | 1.8× |
| `inside_bar_reversal` | 524 | 5.55 h | **2.36** | 1.7× |
| `volatility_edge` | 19,133 | 6.01 h | **2.45** | 1.6× |
| `morning_star` | 3,390 | 6.02 h | **2.45** | 1.6× |
| `pivot_shift` | 436 | 7.40 h | **2.72** | 1.5× |
| `support_bounce` | 142 | 13.27 h | **3.64** | ~right |
| ⭐ **`strong_bull_trend`** | **1,652** | **15.44 h** | **3.93** | ⭐ **~RIGHT, within 2 %** |
| ⚠️ **`vwap_pullback`** | **580** | **40.97 h** | **6.40** | ⛔ **60 % TOO TIGHT** |

⇒ ⭐⭐ **ONE NUMBER IS SERVING TEN DIFFERENT HORIZONS.** It is **1.6–3.0× too generous** for seven strategies, **about right** for two, and **60 % too tight** for `vwap_pullback` — the only strategy with a genuine case for a wider ceiling, and **it is not the one r1–r5 spent the batch on.**
⇒ ⛔ **AND `strong_bull_trend`'s 6-ATR TARGET IS NOT JUSTIFIED BY ITS OWN HOLD.** 6 ATR implies **36 h**; it resolves in **15.44 h**. **The ceiling is not blocking a good trade — it is correctly refusing a target the strategy's own horizon cannot reach.**

### 1b. ✅ THE GATE IS DOING ITS JOB — measured, not argued

| verdict | n | median hold | p90 hold |
|---|---|---|---|
| `passed` | 438 | **4.42 h** | 25.30 h |
| `unreachable` | 1,857 | **16.60 h** | 89.84 h |
| `rr_below_min` | 133 | 22.44 h | 168.01 h |

⇒ ⭐ **The trades the ceiling refuses take ~3.8× longer to resolve than the ones it passes.** **It is separating fast from slow, which is exactly what a horizon gate is for.** ⛔ **r1–r5's framing — a movement estimate enforced as a prohibition, refusing good trades — is not supported.**

### 1c. ⛔ THE COST PROBLEM IS UNCHANGED AND STILL REAL

Friction is **44 % of the risk unit**; fees are proportional so size cannot help; only rate, round-trip count and reward per round trip can. **⇒ fewer, larger-expected-move trades.** Unchanged from r2 §1d and unaffected by the re-scope.

### 1d. ⛔⛔ AND A STRUCTURAL FINDING THAT BOUNDS WHAT VTS CAN ANSWER — MEASURED, WITH CONTROLS

**The two VTS corpora cannot be joined, and never could.**
- `vts_open_trades` — **78,304 rows**, carries **geometry + gate verdict + strategy + entry mode + open-state context (all 52 keys enumerated)**. ⛔ **NO OUTCOME FIELD OF ANY KIND.** Every key is at-open (`atrAtOpen`, `diAtOpen`, `netEvAtOpen`, `predictedPwinAtOpen`). Only `closed` (bool) and `closed_at`.
- `exit_strategy_alternates` — **174,144 rows / 14,510 trades**, carries **outcomes** (`baseline_pnl_pct`, `virtual_exit_reason`). ⛔ **NO GATE VERDICT.**
- ⛔ **AND THE ID SPACES ARE DISJOINT: 0 of 200 sampled alternate `trade_id`s match `vts_open_trades.id` — CONTROL: the same probe also matched 0 in `closed_trades`, and the formats explain it.** `vts_open_trades` is `shadow_*` (64,203) or `vts_SYM_STRATEGY_ts` (7,133); the alternates are **100 % `vts_SYM_ts`** (14,510) across the whole 2026-05-01 → 09-12 span. **Zero rows on either side share the other's format in any era.**

⇒ ⛔ **SO "DO REFUSED TRADES MAKE LESS MONEY?" IS UNANSWERABLE FROM VTS AS STORED.** ✅ **BUT "DO THEY TAKE LONGER?" IS ANSWERABLE, AND IT IS THE QUESTION THE CEILING ACTUALLY ENCODES** — §1b answers it on 2,428 verdict-bearing closed trades without needing a single P&L figure.
⭐ **THIS IS THE SAME DEFECT AS THE ARCHIVE'S** (probability at `pre_filter`, geometry at `sqe`, joint empty). **Two instances, one class: our records are captured per stage and never keyed to each other.** ⇒ `HOME: B-TRADE-RECORD-JOINABILITY, owner CC-B, PHASE_19_PLAN, placed after 2.4g-2` — **name it now, because every future measurement hits it.**

---

### 1e. ⭐⭐ THE TWO ITEMS r6 LEFT OPEN, NOW CLOSED — AND ONE OF THEM BOUNDS THIS RE-SCOPE

**(i) `B-EV-TARGET-PROBABILITY` IS A CONFIRMED DUPLICATE. WITHDRAWN, NOT DEFERRED.** Kyle said the probability-score rebuild is already planned; it is, and it has been since **2026-07-13**. `P25_SCORING_STACK_PRESTUDY.md` **FIX-3**, verbatim: *"pWin is a placeholder AND its calibration data is thinner than assumed (verified). `pWin = clamp(0.40 + DI/200, 0.40..0.60)` (strong-trend `0.40+|dbs|/2`) — **never validated.**"* ⇒ ⛔ **the batch I proposed re-derives a finding that has been on the books for two months, inside a document I have in my own memory as the ratified Phase-25 blueprint.** ✅ **The §1c EV-bias identity still stands and is still worth carrying — it is the MECHANISM behind FIX-3's "never validated", stated as an identity rather than an observation. It belongs as evidence ON FIX-3, not as a new batch.**

**(ii) ⚠️ AND THE SAME DOCUMENT'S FIX-2 BOUNDS WHAT VTS MAY BE USED FOR — I MEASURED IT RATHER THAN INHERITING IT.** FIX-2 (2026-07-13, marked verified) says the VTS kernel is fed a **fake DI** — `predictiveConfidence × 100` at `vts-runner.ts:1657`, with `diAtOpen` **hardcoded 50** at `:2043` — concluding *"VTS calibration data ≠ active behavior."*
**MEASURED TODAY, `vts_open_trades`, `opened_at ≥ 2026-08-01`, n = 32,084 rows carrying `diAtOpen`:**

| finding | value |
|---|---|
| `diAtOpen` **exactly 50** | **4,733 (14.8 %)** |
| distinct values | **3,095** |
| median | **28.32** |
| `realDiAtOpen` — key present | 3,685 |
| ⛔ **`realDiAtOpen` — value NON-NULL** | ⛔ **0 of 3,685** |

⇒ ⚠️ **FIX-2's "hardcoded 50 on EVERY VTS trade" no longer holds universally — it holds on 14.8 %.** Either it was partly repaired since July or the 50 is a fallback that fires one row in seven. **Whichever it is, VTS's directional input is real on ~85 % of rows and a SENTINEL on ~15 %.**
⇒ ⛔⛔ **SO VTS MAY NOT CARRY ANY DI-, PROBABILITY- OR SELECTION-BASED CLAIM WITHOUT EXCLUDING THE SENTINEL ROWS — and the field built to hold the real value, `realDiAtOpen`, IS STAMPED ON 3,685 ROWS AND NULL ON ALL 3,685.** ⇒ **there is no clean alternative column. That is a writer defect.** `HOME: folded into B-TRADE-RECORD-JOINABILITY (OBJ-D) as its second item — same class, same tables, a field written but never populated.`
✅ **WHAT THIS DOES *NOT* TOUCH, AND IT IS WHY §1a AND §1b SURVIVE INTACT: the hold measurements do not read DI at all.** `closed_at − opened_at` has **3,933 distinct values across 28,020 trades** — measured, as a control against the reading being degenerate. ⇒ ⛔ **VTS is a HORIZON instrument. It is not a probability instrument, and after (ii) it is not a selection instrument either.** **Every number in §1a/§1b is a duration; none is a DI, a pWin or a P&L.**

---

### 1f. ⛔⛔ THE FOUR BLOCKERS, ANSWERED — ALL FOUR CONFIRMED AT THE OBJECT BY ME

**BLOCKER-1 — OBJ-A AS r6 WROTE IT SHIPS A NO-OP, AND MY MECHANISM CLAIM WAS FALSE.** r6 said *"the resolver already supports the strategy dimension (`min_rr` uses it)."* **The generic resolver does; the `reach_atr_max` READ SITE does not.** Verified at the ref — `expectancy.ts:205` comment: *"reorg-B2.3: floorPct + reachAtrMax stay PER-CLASS (strategy:'\*'); only min_rr goes per-(strategy×class)"*, and `:206` hardcodes `_classKey = { exchange:'*', assetClass, strategy:'*', regime:'*' }`, which `:211` then uses. ⇒ ⛔ **Seed ten `(strategy, reach_atr_max)` rows today and NOTHING READS THEM.**
✅ **SO OBJ-A IS A CODE CHANGE TO `expectancy.ts`, AND THE SCOPE NOW SAYS SO.** ⛔ **And it inherits `min_rr`'s fail-closed obligation, which r6 did not carry:** `_resolvePerStrategyMinRR` canonicalizes the token and fails **closed** to `min_rr_unknown_floor`. **Reach has no analogue** — an uncanonicalized token would fall to the permissive class `4.0`, which is the §8 #10 silent-fallback trap. ⇒ **OBJ-A must also add `reach_atr_max_unknown_floor` = the MINIMUM across strategies, as a seeded DB row, plus the `recordUnknownStrategyAtGate` tripwire.**

**BLOCKER-2 — THE ESTIMAND WAS WRONG, AND THE INSTRUMENT THAT WOULD SETTLE IT EXISTS BUT HAS NEVER BEEN WRITTEN.** See the banner. ✅ **MEASURED ABSENCE, WITH A POSITIVE CONTROL, because Langston asked for exactly that:** the excursion columns **DO exist** — `shared/schema.ts:734-735` and `:1237-1238`, `mfe` *"Maximum Favorable Excursion (max profit while open)"* and `mae` *"Maximum Adverse Excursion"* — on the tables **`paper_trades`** and **`trades`**. ⛔ **BOTH TABLES HOLD ZERO ROWS.** **CONTROL: the same query returns 0 for `symbol` on both tables, so the zero is an empty table and not a failed read** — and `paper_trades` is the table already recorded as RETIRED (`#573`).
⇒ ⛔ **THE EXCURSION INSTRUMENT EXISTS IN SCHEMA AND HAS NEVER BEEN POPULATED.** ⚠️ **That corrects TWO earlier claims, one of them mine and one Langston's:** my r2 OBJ-4 said *"no MFE column exists"* — **it does**; and his OBJ-4 amendment proposed building one — **it needs WIRING, not designing.** ✅ **So the honest disposition is the one he pre-authorised: the reversal is a HYPOTHESIS, and OBJ-B becomes the wiring of an existing column rather than an analysis.**

**BLOCKER-3 — §1b IS STRUCK. It was one strategy, and circular before it was confounded.** My own numbers convict it: `unreachable` n=1,857, of which `strong_bull_trend` is **1,652 = 88.9 %**. So *"refused trades take 3.8× longer"* is *"`strong_bull_trend` takes longer"* with 205 others along for the ride. ⛔ **And it is tautological: the `passed` bucket passed BECAUSE its targets are nearer, and nearer targets are hit sooner by definition — controlled for `atrsToTarget` the effect has nowhere to come from.** ⇒ **“The gate is doing its job — measured, not argued” is WITHDRAWN.** It may be re-run stratified by strategy AND target distance; until then it supports nothing.

**BLOCKER-4 — `c` IS UNDEFINED, THE ATR BAR IS NOT THE SAME LENGTH IN BOTH CLASSES, AND §1a HAS NO xSTOCK ROWS.** `signal-target-normalizer.ts:26` documents the bound as *"the √H-scaled reachable bound, c·√H"*. §1a computed `√(hold in HOURS)` and compared it to 4.0 — i.e. **`c = 1` with a ONE-HOUR ATR bar.** ⛔ **Crypto is 60-minute bars; xStock is 15-minute** (`market-context-engine.ts:461-463` vs `:683-684`). **The same price move is ~2× more ATRs on a 15-minute bar, so `c` is CLASS-DEPENDENT and `√H_hours` is off by ~2× for xStock** — while OBJ-A ships per-(strategy × **class**) and §1a contains **zero xStock rows.** ⇒ **half the shipped keyspace was underived and dimensionally wrong.**
⭐ **AND THE PART THAT CUTS AGAINST THE REVERSAL, flagged MECHANISM-HYPOTHESIS (29(c)) — the citation is the ABSENCE of a drift term in the documented form, not a measurement: `c·√H` is an ENDPOINT displacement bound with no drift term. A running maximum exceeds it, and a trend strategy has drift by construction.** ⇒ **the only strategy the gate blocks is the one whose premise is drift.**

### 1g. ⚠️ THE FINDINGS, TAKEN NOT DEFERRED

- ⛔ **OBJ-C WAS READING THE WRONG ERA, and this is the reproduction I was trying to avoid.** The **0.92 %** xStock maker share was measured under the **crypto** fee schedule. `B-XSTOCK-FEE-CONTRACT` deployed **2026-09-11** and xStock maker is now **−0.0002 — a REBATE, the first negative fee in the system's history.** **A maker share observed when maker paid nothing extra cannot satisfy a criterion whose window OPENED at that deploy** (P8/Arm B are three-week windows; 17 alias symbols excluded until `#1024`). ⇒ **the era is now cited, and the 0.92 % is labelled pre-rebate.**
- ⚠️ **POPULATION RECONCILIATION OWED: §1a's ten rows sum to 27,942 against a stated n = 28,020 — 78 trades unenumerated.** And §1b's verdict-bearing set is **2,428 = 8.7 %** of §1a. ⛔ **Why do 91 % carry no verdict, and is the 8.7 % representative? That is `#596` class and it sits under OBJ-A's entire basis.** **To be answered before any value ships.**
- ⚠️ **TEN ROWS, NINETEEN STRATEGIES (`#648` — six have never traded).** Strategies absent from the table fall to **the class default this scope argues is wrong for everything.** OBJ-A must say what happens to them; silence is the permissive branch again.
- ⚠️ **NO CONFIDENCE INTERVALS.** `range_trade` n=156 and `support_bounce` n=142, with p90s near 90 h, are **not point estimates to ship as config.** Bootstrap them.
- ⚠️ **THE CORPUS STRADDLES DEPLOY BOUNDARIES.** F-G-2's crypto deploy `2cc4a03ec` (2026-09-02) **changed VTS exit booking** — the very quantity measured — with `f8870022f` (09-04) and the 3n OBJ-7 deploy (09-11) after it. **§1a's 08-01→09-12 window pools pre- and post-F-G-2 populations.** ⇒ **filter at the boundaries and show the split, or the pooled medians are two populations wearing one number.**
- ✅ **OBJ-D RE-LABELLED:** the id-space split and the archive stage split are **joinability**; `realDiAtOpen` written-never-populated is a **WRITER** defect. Same batch, **two classes**, stated as two.
- ⚠️ **AND THE SIGNED BIAS ON EVERY SHIPPED VALUE, not a genre caveat:** VTS books exits at the cache **mid**; a live sell fills on the **bid**, which reaches any level **later**. ⇒ **VTS holds are systematically SHORTER than live ⇒ every `√H` is biased LOW ⇒ OBJ-A would ship ceilings systematically TOO TIGHT**, over-correcting the seven generous rows and under-correcting `vwap_pullback`. ⭐ **And the magnitude is somebody's live deliverable: F-G-2's observation window is measuring exactly this mid-vs-bid gap now.**

### 1h. ✅ THE THREE ANSWERS I ASKED FOR, TAKEN AS RULED

1. **Median vs percentile — NEITHER, and the question is downstream of BLOCKER-2.** Once the estimand is right, the sample is **right-censored**: a trade closed by stop or timeout is *unobserved past that point*, not *"didn't reach"* — so **a raw quantile of closed holds is biased LOW whichever quantile is chosen.** Use a survival estimate. ⛔ **And the quantile is a LOSS-FUNCTION choice: refusing a reachable trade costs forgone EV, admitting an unreachable one costs friction, and §1d says VTS can price NEITHER side.** ⇒ **there is no data-derived quantile available today. Pick it as a STATED POLICY, publish the implied refusal rate per strategy beside every shipped value, and label it a policy choice — never a derivation.** ✅ **I will not quietly move to p75 and call it derived.**
2. **`vwap_pullback` — DISQUALIFIED BY DIRECTION, NOT BY n.** Every other row moves the ceiling **DOWN**; this is the only row that moves it **UP** (4.0 → 6.40), and **a loosening admits trades the system refuses today.** ⇒ **tightening on a mis-derived number costs opportunity; loosening on one costs money.** **It does NOT ship in OBJ-A. It stays at the class default** until a realised-excursion measurement shows those trades actually traversing 5–6 ATRs. ⭐ **And its 41-hour median hold on a PULLBACK strategy is itself the anomaly — that reads as trades held to a timeout, which is evidence FOR the censoring problem, not for a wider ceiling. Explain it before building on it.**
3. **Mark-booked exits — a signed bias ON THE SHIPPED VALUES.** See §1g's last bullet. **Signed, with its direction stated and its magnitude assigned to an existing observation window.**

---

## 2. THE PLAN — FOUR OBJECTIVES, ORDER BINDING

### OBJ-A — Derive the ceiling per strategy from realised hold, and ship it
**From §1a.** Replace the single per-class `reach_atr_max = 4.0` with a **per-(strategy × class)** value derived as `c·√H` from each strategy's own measured median hold — the resolver **already supports the strategy dimension** (`min_rr` uses it; most-specific-wins, `b72-warmup` fail-closed).
**This is the fix Kyle's first question asked for: not an exemption for one strategy, but a ceiling that is right for all of them.** ⛔ **No exemptions. No patches.**
**VERIFICATION:** every seeded value re-derived from the query in §1a with n and denominator printed per strategy; a **negative control** — a strategy with n<50 gets **no row** and falls to the class default, asserted rather than assumed; and the by-reason drop counts move in the predicted direction per strategy after deploy.

### OBJ-B — Re-derive `strong_bull_trend`'s target against its own horizon
**From §1a.** Its 6-ATR target implies 36 h; it resolves in 15.44 h. **Either the target comes down to what its horizon can reach (~3.9 ATR) or the strategy is explicitly declared a long-horizon exception with its own ceiling.** ⛔ **r1–r5 proposed exempting it from the gate; that was backwards — the gate was right.**
**VERIFICATION:** the chosen target is justified from the strategy's own hold distribution, not from consensus; and its post-change reachability verdict is `passed` rather than exempted.

### OBJ-C — Read the fee work we already have, and stop re-deriving it
**From §0 rows 4–5.** The schedule is documented; the maker/taker split is observed (**crypto 18.2 %, xStock 0.92 %** on 3,938 / 2,072 stamped VTS rows). **Read the existing observation windows and the 2026-09-06 account capture BEFORE any new measurement.** ⛔ **Only if the account rung is genuinely absent from the record does the authenticated read happen — and then as a sourced rate with a refresh path, never a hardcoded number.**
**VERIFICATION:** the batch cites the existing findings rather than reproducing them; any gap is named as a gap.

### OBJ-D — Name the joinability defect; do not fix it here
**From §1d and §1e(ii).** File `B-TRADE-RECORD-JOINABILITY` with **three** instances: the VTS id-space split, the archive's stage split, and **`realDiAtOpen` stamped on 3,685 rows and NULL on every one of them** — a field written and never populated, which is the same class one layer down. ⛔ **Out of scope to fix — it is a schema-and-writer change across four tables.** ✅ **In scope to NAME, because every measurement in this batch and the next hits it.**

⛔ **WITHDRAWN FROM r1–r5:** the paper-only reachability release (§0 row 3 — already run 4,675 times in VTS); the per-strategy exemption (OBJ-A supersedes it); and `B-EV-TARGET-PROBABILITY` **pending a duplication check against the ratified Phase-25 scoring blueprint** (§0 row 6).

---

## 3. WHAT THIS BATCH NOW CHANGES, IN ORDER

1. **Ten reachability ceilings replace one** — derived, per strategy, from four months of realised holds.
2. **One strategy's target is re-based** to a distance its own horizon reaches.
3. **Two existing findings get used instead of re-measured.**
4. **One structural defect gets named** so the next measurement does not rediscover it.

✅ **It changes live configuration on the first objective.** ⛔ **It does NOT change live admission behaviour to gather data that already exists — which is the error Kyle caught.**

⚠️ **THE LIMITS, STATED:** all hold figures are **VTS**, which books exits at the mark and has no maker fill-probability model, so it is a **horizon** instrument and not a P&L one. `vwap_pullback`'s 40.97 h median rests on **n=580** and is the one row most likely to move. And the paper corpus remains **n=29–58** — it is not the basis for anything here.
