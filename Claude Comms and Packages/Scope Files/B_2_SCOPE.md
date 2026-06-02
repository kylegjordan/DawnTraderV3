# B.2 — xStock Liquidity/Depth Gate Recalibration (lq_min ↔ min_depth coordination) + Volume-Gate Disposition

**Phase:** 24 (xStock calibration arc). **Sub-batch:** B.2 (lead of the remaining Phase-24 calibrations). **Mode:** active trading OFF — VTS/passive only; **archive-replay, NO trade outcomes**. **Asset class:** `xstock_spot` only (crypto untouched). **Predecessors:** B.0 baseline (numbers report) + B-CALSCORE/.b (live scoreboard, 64 rows). **Drafted:** 2026-06-02 (CC). **Step-1 reviewer:** Langston — **ACK to proceed to Step 2/3** (conditions A–E + Q-refinements absorbed below).

> 🚨 **B.2 CHANGES NOTHING LIVE (§9.1).** B.2 fills the calibration scoreboard's PLANNED side only (status `proposed`). NO live threshold edit ships. The liquidity-gate ↔ depth-floor disagreement PERSISTS in production until a later point-tighten APPLIES it. B.2 *documents + proposes*; the tighten *applies*. Acceptable because active trading is OFF.

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **Depth-history retention.** PREVIOUSLY STATED: "~1-day depth retention, forward-accumulating." NOW: exactly **2 distinct calendar days hot** (2026-06-01 00:15Z → 2026-06-02 09:19Z; 485 symbols; 8.73M two-sided rows). REASON: the retention POLICY is 30 days, but the **May partition (31 GB) was cold-evicted to Backblaze on 2026-06-01 by B-NEW-47**, so a live query sees June only — not a 1-day prune.
- **lq_min=43 reject rate.** PREVIOUSLY STATED: "rejects ~70% RTH." NOW: the comprehensive scoreboard row shows **~60.44% per family (34,285/56,725)**; the v1 board showed **~70% RTH (338/485)**. REASON: two valid measurements on different denominators (per-family eval count vs RTH symbol set). B.2 fixes the scoreboard's planned-side denominator to match the current-side metric label.

## Confirmed live surface (staging psql + code read, 2026-06-02 — decision-grade)
- **LQ (liquidity) gate** = `log10(askDepthUsd+1)×10`, clamped [0,100], **ASK-side depth only** (entry-side, long-only). lq_min = **43.00** on trend/reversal/breakout/oscillator + pattern (paper+live); **30** (vts_strong_trend) / **35** (active_strong_trend). 43 ≈ ~$19,950 ask-depth. Seeded as "Layer-1 starter cloned from crypto," **never recalibrated to the depth scale** → the B.2 target. Two comparison sites: family-IMF + pattern lane.
- **min_depth_usd hard gate** = **2000** (vts paths) / **5000** (active paths), comparing **MIN(ask,bid)** two-way raw USD. Global pre-filter (runs before IMF). Rejects ~3.9% / ~13.4% RTH.
- **min_volume gate** = **0 → INERT** (rejects 0%) on every path, by design (B.1.5). The field it compared is the **wrong instrument** (underlying-equity share volume, ~700× inflated); depth gate replaced it.
- **Correlation** is wrongly bundled into the xStock IMF loop but **non-functional** (no benchmark → constant 0.5 → 0 rejections). Canonical IMF = LQ/VN/DI only (crypto `fx5-scanner.ts:813`). **OUT of B.2** (removed at end of Phase-24; benchmark deferred to Phase 25).
- **Depth source** = rolling 20-min median (`percentile_cont(0.5)`) of `ask×ask_qty` / `bid×bid_qty` from `xstock_spot_ticker_snap` (rule #13, not a snapshot).

## Core problem (the #1 baseline finding, now verified at formula+threshold+input level)
The LQ gate and the min_depth gate read the **same** rolling-median depth data but reduce it **two different ways** — LQ on the **ask side only** (log scale), min_depth on the **two-way minimum** (raw USD). They are **non-monotonic**: a deep-ask/thin-bid name can pass LQ yet fail min_depth, and vice-versa. So **recalibrating lq_min alone will not coordinate them** — the statistic must be reconciled by an explicit, documented design decision first.

---

## Objectives (verifiable)
1. **Build a depth-LQ sensitivity sweep** (archive-replay; fork the B.1 harness pattern, NOT its DBS join): replay the production rolling-20-min median of `ask×ask_qty` from `xstock_spot_ticker_snap`, apply `LQ=log10(askDepth+1)×10`, compute **session-segmented (RTH vs off-hours)** pass-rate at each candidate lq_min (e.g. 30/35/38/40/43). **Model-validation gate:** the lq_min=43 row must reproduce the live ~60.44% per-family reject within tolerance before any other candidate is trusted.
2. **Decide + document the coordination rule** between lq_min (ask-only) and min_depth_usd (two-way min) **BEFORE any threshold edit** (NO PATCHES §5#15). Default recommendation: keep them **deliberately complementary** — LQ ask-only as the primary tunable entry-liquidity screen, min_depth two-way as a low thin-book exit-safety floor set as a documented sub-threshold of the recalibrated lq_min so the two can no longer silently disagree.
3. **Disposition the volume gate** (Kyle's explicit "liquidity AND volume"): record a **keep-inert** decision for min_volume (structurally broken — wrong instrument) and **log the two dead gate copies to the Phase-16 legacy-component register #136** (mark-don't-delete §5#18). **ORB volume recalibration (ORB_VOL_MULT_MIN) is OUT of B.2 → B.3/D-audit** (ORB disabled; needs per-strategy evidence it can't produce yet).
4. **Propose lq_min as a BOUNDED RANGE, not a point** (data-readiness forces it — see below); fill the **planned side** of the owned ledger rows (UPDATE, never re-INSERT) on the comprehensive scope strings, denominator matched to the current side, `planned_sub_batch='B.2'`, status `proposed`.
5. **Schedule the point-tighten** (a system alert / follow-on B.2-tighten) for after **≥5 forward RTH sessions** of depth accumulate (or a deliberate cold-rehydrate of May), at which point lq_min flips to a point value and status → `applied`.
6. **No crypto regression:** all edits confined to the xStock-forked modules + `xstock_spot` screener_filters rows; shared `imf-metrics.ts` volume-LQ and `fx5-scanner.ts` IMF byte-unchanged.

## Langston Step-1 review — ABSORBED (2026-06-02; ACK to proceed to Step 2/3)
- **A — Decision criterion = the CALIBRATION LENS, not an admit-rate target (Kyle directive 2026-06-02; ADJUSTMENT_FRAMEWORK §1.1 axiom 6).** The goal is the MAXIMUM number of **vetted, solid, cleanly-fillable opportunities**, NOT a target admit-rate. The recalibrated lq_min is the **depth level that separates a solidly-tradeable book (enough resting ask depth to absorb our position with acceptable slippage) from one too thin to be a good trade** — names below it aren't "good pairs," they're bad fills. The current ~60.44% per-family reject (34,285/56,725) is suspected to be **false-rejecting genuinely-tradeable names** because lq_min=43 is a crypto-VOLUME carryover (~$19,950) mis-applied to the xStock DEPTH scale — fixing that mis-scale lets good names back in, which IS the lens. We do NOT loosen past the solid-fill depth just to raise the count. The sweep produces the ask-depth distribution; the threshold is read off "where books stop being solidly fillable," and the resulting reject rate is an OUTPUT, reported but not chased. (Position-size/slippage sizing is Phase-25-deferred, so B.2 bounds the solid-fill depth with a defensible RANGE.)
- **B — Name a successor for a CORRECT volume gate (REQUIRED; Kyle's "liquidity AND volume").** Depth ≠ volume: a name can have deep books yet near-zero traded flow (stale quotes). Keep-inert for `min_volume` is correct (wrong instrument), but it is only complete WITH a named follow-on for a correct volume gate (right instrument = xStock-TOKEN traded volume). B.2 deliverable: (i) investigate whether the Kraken ws-equities feed exposes token-level traded volume; (ii) if yes → name a Phase-25/B.x follow-on to build a correct volume gate; (iii) if no → document that volume screening is structurally unavailable for xStock and depth is the permanent proxy. No "inert-forever with no successor."
- **C — Session-awareness decision (explicit).** xStock depth collapses outside US RTH (24/5 market, §5.17). Decide + record: a single 24h lq_min (owning the off-hours behavior) vs session-aware thresholds. The sweep segments RTH vs off-hours to expose the gap; the decision is stated in the completion report.
- **D — Model-validation tolerance = ±3pp, named up front.** lq_min=43 must reproduce the live ~60.44% per-family reject within **±3 percentage points**. The artifact discloses per-segment SAMPLE SIZE (off-hours may be too sparse to trust with only 2 hot sessions).
- **E — B.2 changes nothing live (see top banner, §9.1).** Planned-side `proposed` only; the LQ↔min_depth disagreement persists in production until the point-tighten applies it.
- **Q1 — derived-linkage invariant.** Keep LQ ask-only + min_depth two-way complementary, BUT write the min_depth floor as a DERIVED, quantified sub-threshold of the recalibrated lq_min (e.g. min_depth two-way ≈ 25% of the lq_min-implied ask-depth dollar value) — an invariant, not two independently-floating numbers.
- **Q2 — schedule the tighten on RTH-SESSION COUNT, not calendar days.** "≥5 forward RTH sessions" ≠ "3–5 days" (weekends have no RTH; from Mon 2026-06-02, five RTH sessions land ~2026-06-09). The point-tighten alert fires on accumulated RTH-session count (verified by distinct-trading-day count in the depth table at fire time), not a fixed calendar date.
- **Q4 — strong_trend ordering-invariant guard.** Leave lq_min 30/35 as-is, BUT if the proposed main lq_min lower bound ≤ 35, revisit 30/35 in the same breath so the deliberately-permissive lanes don't invert into stricter-than-standard.

## Data-readiness & the one decision (point-vs-range)
**Only 2 distinct sessions of depth data exist** (May cold-evicted). Setting a final lq_min point now would be a single-window decision violating rule #13's spirit. **Recommendation (proceed unless redirected):** ship B.2 with a **bounded lq_min range** now (objective 4) + the coordination rule + the volume disposition + the sweep harness, and **tighten to a point in ~3–5 days** as forward sessions accumulate (objective 5). **Forward-accumulate, do NOT rehydrate May from cold** (cold-rotator is dry-run; forward is cleaner). Alternative Kyle may choose: wait and run the full point-target recalibration in one shot once ≥5 sessions exist.

## Verification criteria (outcomes-based)
- Sweep artifact (CSV/printed quantile table) shows pass-rate at each candidate lq_min, RTH-vs-off-hours segmented, lq_min=43 reproducing live ~60.44% per-family within tolerance.
- Coordination rule written in code comments AND completion report (ask-only-vs-two-way decision explicit).
- Volume-gate disposition recorded (keep-inert + Phase-16 #136 entry); ORB deferral stated.
- **Scoreboard (§9.3, Claude-in-Chrome):** "xStock Calibration" tab shows the **planned side filled** for lq_min (display_order 20/21/22) + min_depth_usd (40/41) — planned value/range + derived planned % next to current %, status `proposed`.
- Crypto regression spot-check (filter-diagnostics) unaffected; all 4 CI jobs green; GDrive↔GitHub↔staging sync (rev-list HEAD..origin = 0); Langston Step-4 + Step-8 recorded.

## Ledger rows B.2 fills (exact comprehensive scopes — grain key (sub_batch='B.0', asset_class, setting_key, scope))
- `lq_min` / `imf · 22 paths` (do 20) — primary target
- `lq_min` / `imf · vts_strong_trend` (do 21); `lq_min` / `imf · active_strong_trend` (do 22)
- `min_depth_usd` / `global · quant/pattern vts` (do 40); `min_depth_usd` / `global · quant/pattern active` (do 41)
- (conditional) `min_volume` / `global · all paths` (do 46) — only if formally re-stated; else record decision in report, leave baseline-inert.

## Explicit exclusions
- **Correlation / corr_max** (do 34) — removed from IMF at END of Phase-24; benchmark Phase-25. Sits in the "B.2 · IMF" display category but is NOT a B.2 target.
- **max_bid_ask_spread** (do 42–45) — B.4/B.5 friction, not B.2.
- **ORB volume** — B.3/D-audit.
- No P&L / win-loss (Phase 25).

## Open questions — Q1–Q4 RESOLVED with Langston Step-1; A & B are the remaining Kyle calls
**Resolved with Langston (consensus):** Q1 keep complementary + derived-linkage invariant; Q2 range-now + forward-accumulate, schedule on RTH-session count; Q3 keep-inert + Phase-16 register + named successor; Q4 leave 30/35 with the ordering-invariant guard.

**For Kyle (domain calls — I will bring these WITH the sweep data so they're concrete picks, not abstract):**
- **(A) RESOLVED by the CALIBRATION LENS (Kyle 2026-06-02): admit the max number of VETTED, solid opportunities — not a count/admit-rate target.** No reject band to "pick." The lq_min target is the depth below which a book is too thin for a clean fill (= not a solid opportunity). Remaining concrete input (Phase-25-linked): the slippage / position-size anchor that defines "solidly fillable." B.2 bounds the solid-fill depth with a defensible range off the ask-depth distribution + typical xStock position size; I'll bring the distribution so the floor is concrete and you can sanity-check it.
- **(B) Volume-gate intent.** Do you want a CORRECT volume gate eventually (right instrument = token traded volume) once we confirm whether the feed exposes it — or is order-book depth the permanent liquidity screen for xStock? I'll report whether the feed carries token-level volume.
