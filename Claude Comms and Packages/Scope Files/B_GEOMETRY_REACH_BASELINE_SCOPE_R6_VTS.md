# B-GEOMETRY-REACH-BASELINE — SCOPE **r6**, RE-SCOPED ON THE VTS CORPUS

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **2026-09-13**

> ⛔⛔ **KYLE RE-SCOPED THIS AND HE WAS RIGHT ON ALL SIX COUNTS. r1–r5 WERE BUILT ON 29 SEPTEMBER PAPER TRADES WHILE 78,304 VTS TRADES SAT UNUSED SINCE 10 MAY.** His words: *"Using paper mode data limits us tremendously."* **I used roughly 0.04 % of the available trade record.**
> ⭐⭐ **AND THE RE-SCOPE REVERSED THE HEADLINE FINDING. r1–r5 said the reachability ceiling is an untraced number blocking our best-ratio strategy. THE VTS DATA SAYS THE CEILING IS VERY NEARLY RIGHT AND THE STRATEGY'S TARGET IS WRONG.** That inversion is the whole value of the re-scope, and it came from his instruction rather than from our analysis.

---

## 0. WHAT THE RE-SCOPE CHANGED — PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED (r1–r5) | NOW (r6, on VTS) | EVIDENCE |
|---|---|---|---|
| 1 | ⭐⭐ **The ceiling blocks our best-ratio strategy from ever executing** — framed as the ceiling's fault. | ⛔ **REVERSED. The ceiling is ~correct for that strategy; its TARGET is set beyond its own realised horizon.** | `strong_bull_trend` median realised hold **15.44 h** ⇒ `√H = 3.93` against a ceiling of **4.0**. Its 6-ATR target implies **36 h**. **It resolves in 15.** |
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
**From §1d.** File `B-TRADE-RECORD-JOINABILITY` with both instances (the VTS id-space split and the archive's stage split). ⛔ **Out of scope to fix — it is a schema-and-writer change across four tables.** ✅ **In scope to NAME, because every measurement in this batch and the next hits it.**

⛔ **WITHDRAWN FROM r1–r5:** the paper-only reachability release (§0 row 3 — already run 4,675 times in VTS); the per-strategy exemption (OBJ-A supersedes it); and `B-EV-TARGET-PROBABILITY` **pending a duplication check against the ratified Phase-25 scoring blueprint** (§0 row 6).

---

## 3. WHAT THIS BATCH NOW CHANGES, IN ORDER

1. **Ten reachability ceilings replace one** — derived, per strategy, from four months of realised holds.
2. **One strategy's target is re-based** to a distance its own horizon reaches.
3. **Two existing findings get used instead of re-measured.**
4. **One structural defect gets named** so the next measurement does not rediscover it.

✅ **It changes live configuration on the first objective.** ⛔ **It does NOT change live admission behaviour to gather data that already exists — which is the error Kyle caught.**

⚠️ **THE LIMITS, STATED:** all hold figures are **VTS**, which books exits at the mark and has no maker fill-probability model, so it is a **horizon** instrument and not a P&L one. `vwap_pullback`'s 40.97 h median rests on **n=580** and is the one row most likely to move. And the paper corpus remains **n=29–58** — it is not the basis for anything here.
