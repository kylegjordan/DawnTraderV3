# B.3 — Strategy Gates (Phase 24, B-XSTOCK-CALIB umbrella) — SCOPE v2

> **Audit-first, both paths.** Calibrate the per-strategy entry gates — but FIRST verify the regime classifier is correctly partitioning live xStocks, because the gates sit downstream of regime labels. Then do BOTH the VTS path (calibrate now) and the active-trading path (set up/configure now, calibrate in Phase 25), per Kyle directive 2026-06-02. Read-only audit gates everything.
>
> **Active trading:** OFF (VTS passive learning only) throughout. **CALIBRATION LENS (ADJUSTMENT_FRAMEWORK axiom 6) applies to every threshold/gate touched.** Foundation: `B_3_STEP_1A_ARCHITECTURAL_READ.md` (Step 1.a, code-verified).
>
> **v2 status:** Langston ACK'd the umbrella at Step 1 (2026-06-02), conditioned on three added objectives (A0 provenance-first, crypto-fence escalation, A2-bis near-miss attribution) and two B3.2 verification conditions (output-equivalent seeding; governance-language fix). All absorbed below. §8 records the resolved Step-1 answers.

---

## §0 — Plain-language headline (for Kyle)

The strategy entry gates decide whether a given strategy actually produces a buy signal for a pair. They sit one step downstream of the regime label, so before tuning them we have to be sure the regime labels themselves are right. The deep read found that the xStock regime sorting rules were never tuned to xStock behavior — they're an admitted "baseline" made by halving the crypto rules — so this batch opens with a measurement pass. That pass first checks whether the basic ingredients the sorter uses even mean the same thing for xStocks as for crypto (Langston's catch: if one shared ingredient is mis-scaled, the fix is upstream, not an xStock tweak), then checks whether each regime cutoff sits in a sensible place against real xStock data. If a cutoff is mis-placed we fix it first; if a regime is genuinely just rare, we accept it. After that we tune the strategy gates for the learning system now, and we wire up and configure the active-trading strategy selection now too (even though it can't run yet), saving its number-tuning for Phase 25.

---

## §1 — PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)

| Item | Previously stated | Now | Reason |
|---|---|---|---|
| Regime classifier status | B.1 (2026-05-28): "validated, no change — distribution looks reasonable" | **NOT confirmed-correct for live xStocks** | B.1 validated EXISTING values against a 9-day REPLAY and compared to CRYPTO envelopes, not live xStock outcomes. Live baseline contradicts the replay (below). |
| RANGE_BOUND share | B.1 replay: 8.8% (233 of 2,658 bars) | B.0 live baseline: **0.14%** | ~60× gap, same classifier/thresholds — must be reconciled (artifact-first per A3) before any change. |
| TREND_FRIENDLY share | B.1 replay: 18.2% (485 bars) | B.0 live: **38.7%** | ~2× higher live. |
| HIGH_VOL share | B.1 replay: 25.0% (664 bars) | B.0 live: **12.4%** | ~2× lower live. |
| IMPULSE share | B.1 replay: 11.6% (307 bars) | B.0 live: **4.0%** | ~3× lower live. |
| STRUCTURAL_TRANSITION share | B.1 replay: 36.5% (969 bars) | B.0 live: **44.7%** | higher live — **NOT "RBS overflow"** (Langston correction): it's bars failing all four explicit branches (the dead-zone), since the cascade re-tests IE/TFS/HVU before the ST default. |
| B.3 shape | "strategy gates" (single) | **A0 provenance → audit (A1/A2/A2-bis/A3/A4/A5, read-only) → optional B3.0 classifier fix → B3.1 VTS gates → B3.2 active setup** | Kyle directive 2026-06-02 + Langston Step-1 conditions. |

---

## §2 — Numbered objectives + verification criteria

### Group A — Regime-correctness audit (read-only; the GATE; deliverable = numbers report)

**A0 — Input-semantics provenance (RUN BEFORE A1; Langston-added).** The most likely actual root cause is upstream of every threshold: a *shared* classifier input whose meaning/scale differs from what the cutoffs assume. Confirm in code, each with file:line:
1. **DX vs ADX:** is the classifier's `dx` raw Wilder DX or smoothed ADX? (`market-regime.ts:132-176` `computeADX` + the `:273` comment claim "DX not Wilder's smoothed ADX, runs 35-90"). Raw DX runs hotter/spikier than ADX; if the `<35 / >40 / >45 / >55 / >60` cutoffs were conceived against an ADX mental model but the code feeds raw DX, RBS's `dx<35` collapses for reasons with nothing to do with xStocks.
2. **DBS scale-invariance:** does `directional-bias.ts` emit asset-class-comparable DBS, or crypto-magnitude DBS? The xStock threshold header *assumes* "DBS scale-invariant" — verify it. If not, every `|dbs|` cutoff compares xStock DBS against crypto-scaled boundaries.
3. **Volatility definition:** is `computeVolatility` (`market-regime.ts:88-106`, stddev of close-to-close returns over the full array) the same definition the `0.006 / 0.0075 / 0.010` cutoffs were derived against?
- *Verify:* a three-row provenance table with the code-confirmed semantics + a verdict per input: "consistent" vs "shared-input mismatch." **If any is mismatched, the root cause is a shared input, not xStock threshold miscalibration — and the fix container changes (see B3.0 crypto-fence escalation clause).**

**A1.** Extend the existing archive-replay harness (`scripts/b-xstock-calib-b1a-replay.ts`) in ONE walk to record, for every classified bar, the four raw classifier inputs (volatility, DX, DBS, momentum) AND the branch taken. Use the LIVE classification path for the live distribution (`signal_eval_archive`, live-computed DBS), and the replay for the historical comparison — do NOT re-implement the classifier.
- *Verify:* a per-bar dataset across the live universe (~489 scanned), with the four inputs + assigned regime.

**A2.** Per regime branch, produce the distribution of its governing inputs with the active xStock threshold boundary overlaid. **Report as rolling sub-windows (rule #13) + RTH-segmented, NOT a single aggregate** (per Langston Q1 — a single number averages over regime non-stationarity).
- *Verify:* per-branch histograms/quartiles per sub-window, each cutoff marked + labeled "sensible / too-tight / too-loose vs the live distribution." Every rate WITH raw counts.

**A2-bis — Catch-all near-miss attribution (Langston-added; the most diagnostic addition).** For every bar landing in STRUCTURAL_TRANSITION, record in the same walk which explicit branch it came closest to passing, on which input(s), and the miss-distance.
- *Verify:* an ST-decomposition table — what fraction of ST is would-be-RBS (quiet), would-be-TFS (trending but just under mom/dx), would-be-IE/HVU, vs genuinely structureless. This is what tells us whether ANY single-boundary move actually drains ST.

**A3 — Replay-vs-live reconciliation, artifact-FIRST + time-boxed (Langston Q3).** Before any market-window decomposition:
1. **Provenance/coverage check.** The replay reads DBS from `xstock_dbs_backfill` and **skips bars with no matched DBS** (`b1a-replay.ts:184`) — a coverage/selection bias. The LIVE path uses live-computed DBS and **synthesizes neutral (sentinel-zero) when DBS is missing** (MCE non-crypto path). Report, on BOTH sides: the % of bars affected (replay-skipped; live-sentinel), and re-run the replay distribution excluding any sentinel/degenerate-DBS bars.
2. If that closes the ~60× RANGE_BOUND gap → **the driver is a harness/coverage artifact, the replay is discarded, and NO `|dbs|` boundary moves** (live-0.14% is simply the truth). A3 is allowed to close here without further decomposition.
3. Only if it does NOT close → proceed to market-window / symbol-set decomposition.
- *Verify:* the dominant driver identified + quantified (raw counts + %); explicit statement whether any `|dbs|`-gated boundary is implicated.

**A4 — Per-regime verdict (INDEPENDENT gate from A3; Langston Q5).** Discrediting the replay resolves A3 but does NOT validate the boundaries. For each of the five regimes decide **"accept"** vs **"fix upstream first"**, where **accept requires AFFIRMATIVE A2 evidence** that the boundary sits at a defensible percentile of the *live* distribution with no tradeable near-miss mass (A2-bis) on the wrong side. Lens asymmetry (active OFF): a too-tight boundary false-rejects tradeable bars into ST and **suppresses VTS learning data we can't recover**; a too-loose boundary only pollutes recoverable VTS telemetry → lean toward fixing tight boundaries, tolerate slightly-loose ones, but **document every loose one, never silently accept**. No threshold changed in the audit itself.
- *Verify:* five-row verdict table with per-row affirmative evidence + accept/fix call + lens note.

**A5 — Strategy-layer breakdown (SAME window; Langston reorder).** **Lead with the real puzzle: `breakout` + `inside_bar_reversal` ENABLED yet 0 fires** — determine whether the FX5 family-filter lane (`vts-runner.ts:3443-3489`) never passes them or their detect gates reject 100% (this directly feeds B3.1's calibration surface). Note that **`strong_bull_trend` disabled-but-21-trades is already explained** (§2.2: the enable/disable gate is removed from the VTS path — VTS fires disabled strategies by design) — confirm, but it is likely not a bug. Then per-strategy fire rate / signal count / gate-reject reasons (by-regime) / win-proxy, and per-regime which strategies run (resolve the vwap_pullback 50% + morning_star 29% ≈ 80% concentration).
- *Verify:* per-strategy + per-regime tables; the 0-fire pair root-caused to family-filter vs detect-gate.

**Deliverable:** `B_3_REGIME_AUDIT_REPORT.md` (numbers report, no live-code change), B.0 format (rolling windows, every rate with raw counts, event-overlay, extremes-first).

### Group B — B3.0 (CONTINGENT) classifier threshold fix

**B3.0.** ONLY if A4 finds a cutoff mis-placed AND A0 did NOT attribute the cause to a shared input. Adjust the offending `_XSTOCK` regime threshold constant(s) — and ONLY those — using the **three-part trigger (Langston Q2)**, every part required:
- (a) a contiguous near-miss mass just on the wrong side of *that one* boundary whose *other* inputs already satisfy the regime (e.g. bars failing RBS only on dx while passing `vol<0.006` AND `|dbs|<0.10`);
- (b) that mass is genuinely tradeable as that regime under the lens — verified by which strategies would fire + their net-EV proxy, not "there are bars there";
- (c) the **minimal** boundary move that admits it, justified per-constant.
- **HARD GUARD (state in every B3.0 artifact):** the regime proportion is an OUTPUT, never a target. No boundary moves to rebalance toward crypto-like proportions; ST being large is not by itself actionable.
- **CRYPTO-FENCE ESCALATION CLAUSE (Langston-added; §5 #15 NO-PATCHES):** if A0/A3 find the root cause is a *shared* input (DX semantics or DBS scaling), tuning xStock thresholds to compensate is a patch that masks a shared-input bug. In that case B3.0 does NOT silently compensate on the xStock side — it **escalates to Kyle as a scope decision** (fixing a shared input touches crypto classification = larger blast radius).
- *Verify:* changed constants enumerated with before/after + the A2/A2-bis row that justified each; post-change replay distribution; CALIBRATION-LENS + hard-guard statement; crypto-fence escalation honored.

### Group C — B3.1 VTS strategy gates (calibrate now)

**B3.1.** Calibrate the per-strategy detect gates (the tunable thresholds each strategy reads from the settings store per `_SE_KEY(strategy, assetClass)`, e.g. DBS floors, ADX/volume confirmations) for the VTS path, from archive-replay. Prioritize the A5 0-fire findings.
- *Verify:* each adjusted gate has before/after + replay evidence + CALIBRATION-LENS justification; scoreboard "planned" side filled for the affected strategy-gate rows; no regime-label changes (those are Group A/B).

### Group D — B3.2 active-path strategy selection/gates SETUP (configure now, calibrate Phase 25)

**B3.2.** Make the active-path strategy selection + gate config per-asset-class (DB-resolved with `asset_class` first-class; today the ranking/threshold reads use a class-invariant wildcard `_RTB_GK`, and the cross-family ranking weights are hardcoded in `ranking-weights.ts`). Seed sensible xStock values. Do NOT numerically tune (Phase 25). Two verification conditions (Langston Q4):
- **(a) Output-equivalent seeding (the real scaffolding guarantee).** Prove the seeded per-class rows are output-equivalent to today's wildcard-resolved values at seed time — seeding reproduces current effective config exactly, so "no behavior change while active off" is *verified*, not asserted. (Note §2.2: the xStock eval-cycle DOES apply the enable/disable gate and may run while active is off — so a non-equivalent seed could change effective behavior.)
- **(b) Governance-language fix.** The read (§3.2) shows the orchestrator forwards ALL SQE-passed signals fire-and-forget (`signal-orchestrator.ts:691`) and Ready-to-Buy does the ranking/promotion — i.e. "one best per cycle" is realized at the RTB promotion stage, not in the orchestrator. Correct **SYSTEM_MANUAL** to match code (CC-owned, same session per §8 #11). **FLAG to Kyle** the matching wording in **CLAUDE.md §5 #20** ("the signal orchestrator emits ONE best signal per cycle") — that is Kyle's governance doc (§3 Tier 2); propose the precise-mechanism wording but let Kyle approve the edit.
- *Verify:* per-class config rows exist + are read by the active path; output-equivalence proof; SYSTEM_MANUAL corrected + CLAUDE.md §5#20 wording flagged to Kyle; §9.1 scaffolding declaration present; no behavior change while active OFF.

---

## §3 — 🚨 SCAFFOLDING-VS-FUNCTIONAL declaration (per CLAUDE.md §9.1)

> 🚨 **B3.2 DOES NOT MAKE ACTIVE-TRADING STRATEGY SELECTION FUNCTIONAL. The active path stays INERT until Phase 19 turns active trading back on, and its strategy-selection numbers are not tuned until Phase 25.** B3.2 only puts the per-asset-class configuration structure + output-equivalent seed values in place so the path is correctly shaped when Phase 19 begins.

Group A (audit) and B3.1 DO affect live VTS behavior (VTS is running now). B3.0 (if triggered) changes live regime labels for both paths' classification, but with active trading off only VTS telemetry is affected in practice.

---

## §4 — Audit methodology (Group A detail)

- **Order:** A0 provenance FIRST (it can short-circuit the whole "fix vs accept" framing if a shared input is mismatched), then A1/A2/A2-bis on one walk, then A3 (artifact-first), then A4 verdict, then A5 strategy layer.
- **Data sources:** `signal_eval_archive` (live regime + inputs + downstream funnel, ~6M rows / 3wk) for the LIVE distribution; the extended replay harness for the historical comparison; live `/api/xstocks/filter-diagnostics` for current funnel. Cross-check the live MCE path, never a re-implementation.
- **DBS provenance is load-bearing:** replay DBS = `xstock_dbs_backfill` (stale, 05-05→15, skip-on-miss); live DBS = `directional-bias.ts` real-time (sentinel-zero-on-miss). A3 quantifies both sides.
- **Rolling windows, not snapshots** (rule #13). Every rate WITH raw counts (Kyle). RTH-segmented; US-holiday-aware (rule #17). Event-overlay (B.0 methodology). **No live-code change in the audit** — output is a written numbers report.

---

## §5 — Sequencing & sub-batch split

1. **A0 provenance** (read-only) → if shared-input mismatch found, escalate framing to Kyle before proceeding.
2. **Group A audit** (A1/A2/A2-bis/A3/A4/A5, read-only) → `B_3_REGIME_AUDIT_REPORT.md`. **Gates everything below.**
3. **B3.0** (only if A4 says fix AND not a shared-input cause) → minimal `_XSTOCK` constant move(s), re-verify; else escalate per crypto-fence clause.
4. **B3.1** → calibrate VTS per-strategy detect gates from replay.
5. **B3.2** → per-class active-path selection/gate config setup (output-equivalent seed; governance-language fix).

Pipeline-order upstream→downstream to minimize rework. Each sub-batch is its own 11-step batch with its own Langston Step-4/Step-8 review + completion report; this scope is the umbrella Langston ACK'd at Step 1.

---

## §6 — Blast radius / SIM components (Step-2 pre-audit will deepen)

- `calculatePairRegime` (`market-regime.ts`) + `_XSTOCK` thresholds (`xstock_spot/regime-thresholds.ts`) — read by MCE; consumed by BOTH VTS and (dormant) active paths. B3.0 touches thresholds only; crypto no-touch fence preserved UNLESS A0 finds a shared-input cause → then crypto-fence escalation (touching `computeADX`/`directional-bias.ts`/`computeVolatility` = crypto blast radius = Kyle decision).
- Shared inputs (A0 surface): `computeADX`, `computeVolatility` (`market-regime.ts`), `directional-bias.ts` (DBS).
- Per-strategy detect gates in `strategy-engine.ts` (read per `_SE_KEY(strategy, assetClass)`) — B3.1 surface.
- `signal-orchestrator.ts` + `ready_to_buy_service.ts` + `ranking-weights.ts` (class-invariant wildcard today) — B3.2 surface (config/plumbing only).
- Calibration Scoreboard (`calibration_ledger`) — B3.1 fills "planned" side of the 19 strategy-gate rows; Group A/B may touch the 5 regime rows.
- Legacy flag: `getNormalizedRegime` / `getNormalizedRegimeWithDetails` (Z-score, `market-regime.ts:481-559`) appear dead (MCE uses the cascade) — confirm + log to Phase-16 legacy register (§5 #18) during the audit; do NOT delete in-flight.

---

## §7 — Open questions remaining for Step-2 pre-audit

1. Does `signal_eval_archive` carry the four raw classifier inputs (vol/dx/dbs/mom) per bar, or only the regime label? If only the label, A2 needs a lightweight telemetry-only forward-instrumentation emit to capture live inputs (like B.1's sibling features) — pre-audit must confirm the archive schema.
2. Fresh-DBS availability: `xstock_dbs_backfill` is stale (05-05→15). Does the live `signal_eval_archive` give us a current-window live-DBS distribution to compare against, or do we need a short forward-capture? (Pre-audit Step 2.)

---

## §8 — Langston Step-1 ACK + resolved answers (2026-06-02)

- **Q1 (one pass):** AGREE — one walk, but output as rolling sub-windows + RTH-segmented, not one aggregate. → A1/A2.
- **Q2 (B3.0 trigger):** AGREE + tightened to the three-part test + hard guard (proportion = OUTPUT). → Group B.
- **Q3 (DBS divergence):** STRONG AGREE — but artifact-FIRST (sentinel/coverage check), time-boxed; close A3 if the artifact accounts for the 60×. → A3.
- **Q4 (B3.2 config-only):** AGREE + two conditions: output-equivalent seeding; governance-language fix (SYSTEM_MANUAL now, CLAUDE.md §5#20 flagged to Kyle). → Group D.
- **Q5 (live-trustworthy ⇒ still consider change?):** A3 and A4 are INDEPENDENT gates — discrediting the replay does not validate the boundaries; accept needs affirmative A2 evidence; lens asymmetry favors fixing tight boundaries. → A4.
- **Added objectives:** A0 (provenance, first), crypto-fence escalation clause, A2-bis (near-miss attribution). **Nothing cut**; A3 down-scoped to allow artifact-close.
- **ACK:** umbrella ACK'd at Step 1 conditioned on the above; each sub-batch returns to Langston at its own Step 4 / Step 8.

---

*Scope v2. Step-1.a foundation: `B_3_STEP_1A_ARCHITECTURAL_READ.md`. Next: Step-2 pre-audit (resolve §7 + deepen SIM). Active trading OFF throughout.*
