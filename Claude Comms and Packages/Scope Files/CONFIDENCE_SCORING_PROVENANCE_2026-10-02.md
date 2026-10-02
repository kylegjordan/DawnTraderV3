# Confidence and predictive scoring — full provenance (2026-10-02)

**Asked by Kyle (2026-10-02 ~21:45Z):** *"the confidence scoring in our system has been a known issue. It seems to be inverted … dig through and better understand the issue and what our plans are for the fix"* → *"Run a full provenance investigation."*
**Owner:** CC-C (ANALYST Claude). **Read at:** `origin/migration/aws-supabase` (code `e95ac81e8`/`5cd41c5d9`; deployed staging `ea456ad40`), staging DB and logs 2026-10-02 21:00-22:20Z.
**Method:** three read-only researchers in parallel — code history (`git log -S`, not path-limited), the decision record (RUNNING_ISSUES, BATCH_CATALOG, roadmap, plans, scope/completion files), and the original intent (`bridge/canonical/`, `directives-archive/`, `attached_assets/` specs) — plus my own staging reads. Their reports are summarised here with their citations; load-bearing reachability claims were re-derived by me at the code and on staging (marked ✔).

---

## 1. What it was built to do (original intent)

| piece | intent, as specified | source |
|---|---|---|
| **Predictive confidence** | `confidence = sigmoid((winRate − 0.5) × 6)` from the VTS win rate per regime × strategy; 0.5 when no data. *"Confidence drives ROI scaling globally (VTS + SQE)."* Defined as *"ML-derived probability of success"*. | Directive 11.7C Task 4 (`attached_assets/…11-7C…1769163519640.txt:88-98`); `bridge/canonical/DawnTrader_Mathematical_Architecture_v1.5.0.md:385` |
| **The win-rate store it reads** | Built from `/logs/virtual_trades/` — *executed* VTS trades only, 7-day window, a win = `netProfitPercent > 0`; skipped signals kept separate *"without biasing win rates"*. **Twin copies and never-filled orders were not anticipated** (they did not exist until P19-B7.2c, 2026-07-02). | Directive 11.7B (`…1769106991913.txt:21,58,69,195`) |
| **Deterministic confidence** | `0.6·strategyConf + 0.2·(1−vol) + 0.2·(1−risk)` — explicitly a **placeholder** *"until MCE provides PredictiveConfidence"*. | `directives-archive/12.3.3/DIRECTIVE_12.3.3.md:35,55` |
| **FinalScore** | `0.4·hybrid + 0.3·predictiveConfidence + 0.2·regimeWeight − 0.1·decay`; the SQE *"uses FinalScore and RegimeWeight exclusively"*; the RTB ranked *"purely by FinalScore"*. (The canonical docs also carry a second, contradictory FinalScore formula — §5 item 13.) | Directive 10.9 (`…1767686762563.txt:35-38`); Directive 11.0B; `Mathematical_Architecture_v1.5.0.md:238,322` |
| **The regime-aware ROI gate** | `dynamicROI = base × (1 − (conf − 0.5) × 0.6)` — higher confidence lowers the return a signal must promise. | Directive 11.7C (`:46`) |
| **Was high confidence expected to predict better outcomes?** | **Assumed, never tested.** The only checks specified were stability (drift ≤ ±0.05) and the gate's own wiring (confidence vs ROI threshold correlates negatively); the one calibration target was reported met on **0 matched pairs**. | 11.7B `:184,:206`; 11.7C `:163-179`; `bridge/canonical/Phase_8_Implementation_History.md:664,683` |

## 2. How it was built and changed (code history)
- `getPredictiveConfidence` — introduced `31d365a4b` (2026-01-23, *"Integrate predictive confidence into trading signal profitability calculations"*); per-class cache key added `a177508f2` (2026-05-26, B79.0n.SCORING) whose message claims *"cross-class telemetry contamination eliminated"* — **false: the underlying read `getRegimePerformance(regime, strategy)` still has no class** (`score-calculator.ts:205`).
- The win-rate store — introduced `5c95f5612` (2026-01-22); field-name fix `dbd8b3fcb` (B59, 2026-04-12); **the 6-hourly job only began running at `39895f796` (2026-04-12)** (*"registered … but never started"*). The "never count" flags arrived later (`b48aef51f`, P19-B7.2c, 2026-07-02) and **the store was never taught to read them**.
- Deterministic confidence — `bd5079a63` (2025-12-14, as NGC) → renamed `f52c87e17` (B55).
- FinalScore weights unchanged since `94bb2bc26` (2026-01-06); FinalScore taken off persistence and out of the ranker 2026-07-27/28 (`254c00d8d`, `08afc1fcb`, `90f6a3f72`).
- HF8 confidence floor — added `1b256d6b9`, shadow-only `573b38f83` (2026-07-16), **deleted** `22e133a5c`/`59939a0bd` (2026-08-07).

## 3. What it does TODAY — where the score reaches a decision ✔
| reader | reached? | effect today |
|---|---|---|
| **SQE regime-aware ROI gate** (`signal_quality_evaluator.ts:373-375`) | **DORMANT** ✔ — neither live caller passes `entryPrice`/`targetPrice`/`regime` (`signal-orchestrator.ts:1132-1150`, `ready_to_buy_service.ts:1090-1123`); same at four sampled revisions back to `31d365a4b`; the orchestrator's own comment says so (`:1046-1049`) | none |
| **xStock active path** — `eval-cycle.ts:671` → `active-dispatch.ts:205` `confidence: predictiveConfidence` → deterministic confidence at 0.6 → `sqeInput.confidence` ✔ | yes (when the engine and the xStock class flag are on) | reaches **only the AMR confidence gate, which is in SHADOW for both classes** ✔ (`module_constants amr_runtime.mode = "shadow"`, crypto and xStock, since 2026-06-11) — logs, never blocks; 0 SQE AMR blocks in ~8 h of logs |
| **FinalScore** (`vts-runner.ts:2036`, `eval-cycle.ts:678`) | yes | archive-only (#582); the ranker is `r_multiple` since 2026-07-28 |
| **VTS ROI check** (`vts-runner.ts:2148-2151`) | yes | log-only bypass |
| `getAdjustedMinROI` / `getAdaptiveExpectancy` | **no callers** | dead code |
⇒ **Today the predictive confidence score changes no live paper-trading admission, size or rank.** Its inversion is real but currently inert; it becomes live again the day any of these gates is switched on or the score is reused.

## 4. What has been measured, and what was decided
**Measured (the inversion):** FinalScore anti-predictive r = −0.140 on 740 post-B62 trades (2026-04-26, `SF/REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md:291`); confidence inversely related to win rate on 8,926 rows (B-NEW-36, 2026-05-15, `CHANGES_AND_FIXES.md:903-915`); **predictive confidence rank-correlation with winning ρ = −0.045 on 12,058 VTS trades, t ≈ −4.97** (CC-A, 2026-07-13, `SF/P25_SCORING_STACK_PRESTUDY.md:75`); not evaluable in active paper (n = 15, `PHASE_25_5_PARTIAL_DECISIONS_2026-08.md:42`). **My 2026-10-01 measurement (`#1141`):** the "never count" records and class pooling move the score by ≤ 0.036 in every cell with n ≥ 60 — real, but small beside the inversion.
**Decided:**
- **Kyle, 2026-07-13 — ratified the Phase-25 scoring blueprint** (*"going with what you guys recommend"*, `P25_SCORING_STACK_PRESTUDY.md:151`): **FinalScore RETIRE; predictiveConfidence REBUILD "as THE calibrated pWin … This IS #399a"** (`:126-131`).
- **Kyle, 2026-08-11 — the framing:** *"HIGHER-confidence signals LOSE MORE OFTEN (an empirical calibration problem, NOT an inverted score)"* (`PHASE_25_5_PARTIAL_DECISIONS_2026-08.md:44`).
- Kyle 2026-05-21: do not calibrate the confidence chain against VTS outcomes (`POST_AUDIT_ROADMAP.md:347`). Kyle 2026-07-17/22: retired scores are deleted completely, VTS included (#525, #558). Langston 2026-07-28: a quality term returns to the ranking only after a live quality signal is proven predictive (#588).

## 5. The plan as it stands — and the gap
**Placed:** row 148 `B-RETIRED-SCORE-REMOVAL` (CC-A, FinalScore deletion, #525/#558) · row 58 "verify every score calculates correctly" (CC-B) · rows 145/146/147 confidence-chain calibrations 25-2/25-10/25-7 (CC-A, after row 125) · row 150 SQE recalibration 25-4 (CC-A) · row 135 the ranking (#221, CC-B) · row 149 a validated quality term (#588) · row 4a my `#1141`.
**⛔ THE GAP — the fix Kyle ratified has no row.** The predictiveConfidence **rebuild as a calibrated pWin (`#399a`)** is homed to *"POST_AUDIT_ROADMAP §3.5 calibration-study set 25-12/13/14/15"* (`RUNNING_ISSUES` ~:2966) — but §3.5 is Phase 21 and 25-12…25-15 are the xStock calibration block and the HCE study (`POST_AUDIT_ROADMAP.md:321-324, :623`). **No sprint row carries it.** Also unplaced: `#399` (d) selection-IC go/no-go and (e) the per-class haircut; roadmap 25-1 (ML calibration of the confidence chain) and 25-5 (the decision gate whose item 3 re-checks the inversion); `P19-B-DROUGHT-2` (where Kyle's 08-11 correction is homed) has no sprint row.
**Contradictions between records (to correct, owners in brackets):** (1) row 148's owner and timing — CC-B "after Phase 25" in the roadmap vs CC-A row 148 in the sprint [CC-A]; (2) A2 listed as remaining though `254c00d8d` shipped it [CC-A]; (3) the #582 slice's home and block state [CC-A]; (4) SYSTEM_MANUAL:252 describes a retired `active_ranker` [CC-B]; (5) SYSTEM_MANUAL:2882 gives a pool formula A2 zeroed [CC-B]; (6) SYSTEM_MANUAL:13412 says predictive confidence is per class — the store is pooled [CC-C, this record]; (7) row 58 verifies scores #558 is deleting [CC-B]; (8) rows 145-147 use "ACTIVE + VTS" against Kyle's 05-21 VTS exclusion [CC-A]; (9) `#399`'s home is invalid [placement, Langston]; (10) which pWin is live is stated three ways [CC-A, PRESTUDY]; (11) "inverted" vs Kyle's "calibration problem, NOT an inverted score" [all — use Kyle's framing]; (12) RUNNING_ISSUES:691 labels the fee ladder "25-10" [CC-C]; (13) the canonical corpus carries two FinalScore formulas [historical, no action]; **(14) `B_RETIRED_SCORE_REMOVAL_PRE_AUDIT.md:62-72` calls the SQE ROI gate "a live admission gate" — it is dormant (§3)** [CC-A].

## 6. Disposition (rule 24 — the three outcomes, per piece)
- **The inversion itself:** outcome (2), *working as built, unaddressed* — the formula does what 11.7C specified; what is missing is the calibration Kyle ratified on 07-13. **Not a quick fix.**
- **`#1141` (the store counts "never count" records and pools classes):** outcome (1), a real defect — but on an input that is currently decision-inert (§3) and slated for rebuild. Fixing it alone buys almost nothing now (≤ 0.036). ⇒ **It belongs inside the rebuild, not ahead of it.**
- **The dormant SQE ROI gate and the dead `getAdjustedMinROI`/`getAdaptiveExpectancy`:** outcome (3), legacy that no longer fits — its future is a rebuild-time decision (reconnect to the calibrated pWin, or delete under rule 18).

## 7. Proposal (for Langston to place; Kyle owns any change to the ratified blueprint)
1. **Give the ratified rebuild a real row — PLACED 2026-10-02 (Langston 22:12Z + 22:24Z):** `B-PWIN-CALIBRATION` at sprint row 148a, owner CC-A — (a) + (e) plus the MODEL layer it calibrates (§8: one deliverable), cell = asset class with EB-shrunk refinements, population ACTIVE, owns pWin only (pFill is row 154a). (d) selection-IC at row 148b (CC-A), (b) fractional Kelly at row 148c (CC-C), (c) the xStock DBS-score gap at row 144a (CC-A, before the live switch).
2. **`#1141` — PLACED (Langston 22:04Z, 22:29Z):** the never-count + class-pooling item, with this record's measurement and a pWin-corpus fence test, is row 148a's input hygiene (22:04Z had put it on row 58; 22:29Z moved it and marked row 58 subsumed); row 4a was struck-not-deleted and narrowed to the `SKIPPED` fallback (`:283`), stale-cell overwrite (`:218-219`) and the regime-level skipped denominator (`:212-213`) — defects true whether or not the scale is calibrated — plus the two rule-18 deletions and one comment record-fix.
3. **Correct the 14 contradictions** through their owners; correct the dormant-gate claim in row 148's pre-audit now (it misstates what row 148 leaves behind).

REVIEWER: claim-only (the SQE-reach claim) · "what other states are consistent?" · found the xStock route and the AMR gate · re-derived y (code + staging `amr_runtime.mode`)

## 8. Kyle's calibration-set check (2026-10-02 ~22:20Z) — which deferred calibration items have NO sprint row
**Kyle:** *"dig in through the batch history … going back to May to make sure those items are included in our calibration set of tasks within this sprint"* — the now-vs-later investigation (many items waited for paper mode, which simulates live more closely than the VTS), and the news component for confidence/ranking.
**Read at `ad661db58`; searches named so the absences can be checked:** `SPRINT_TO_LIVE_PLAN.md` and `Scope Files/PRE_LIVE_SPRINT.md` (the after-live list), case-insensitive, for `news|sentiment|on-chain|alt-data|STRATEGIC|LLM|earnings`, `25-5|19\.4\.5|observational|ladder|DROUGHT-2`, `edge.scan|HCE`, `#399|pWin|kelly|selection-IC` (the last set positive-controlled: it returns rows 4a/58/145/146 before this record's placements).
**The now-vs-later list itself:** Kyle's 2026-05-27 split (commit `7ab09cac3`) — "now" became Phase 19, "later" (needs paper-active wins/losses) became Phase 25 items 25-1 … 25-10 (`POST_AUDIT_ROADMAP.md:306-315`). Coverage today:

| item | sprint row today |
|---|---|
| 25-2 regime confidence chain · 25-3 sustainability gate · 25-4 SQE recalibration · 25-7 xStock macro modifiers · 25-9 pair correlation · 25-10 crypto modifiers | rows 145 · 151 · 150 · 147 · 105 · 146 |
| 25-8 xStock pattern size cap | closed 2026-09-30 (cap removed, row 138a) |
| **25-1 ML calibration tier 2** — *"confidence-chain calibration against active-paper outcomes"* | **none in the sprint; on the after-live list (`PRE_LIVE_SPRINT.md:56`, "needs live evidence")** — its own text names ACTIVE-PAPER outcomes |
| **25-5 the observational decision gate (§19.4.5)** — *"pre-launch reordering decision based on 1-2 weeks of clean active-paper outcomes"*; 9 items, 2 run partially (`PHASE_25_5_PARTIAL_DECISIONS_2026-08.md`), **the SEVEN untriggered remain** (`PHASE_19_PLAN.md:23`, scratch checklist D9) | **NONE in either list** — a PRE-launch gate with a STAY verdict (`POST_AUDIT_ROADMAP.md:1129`) and no row |
| 25-6 AMR learned model | after-live list `:63` |

**The news item (`STRATEGIC_DIRECTIONS_AND_AI_EDGE.md` item E, 2026-06-05):** AI scoring of xStock news/earnings and crypto on-chain flows *"feeding … signal confidence/ranking"*, xStock first, homed *"Phase 25+ data layer"*; today only in the roadmap's post-live backlog (`POST_AUDIT_ROADMAP.md:1063`). **No row in either list.** Its sibling F (the scheduled ML edge-scan) is likewise backlog-only.
**Fit with the ratified blueprint:** §8's MODEL layer admits any feature that earns its seat with measured IC > 0 — a news score is a candidate feature of row 148a's ensemble, which is how it would reach confidence and ranking without a hand-weighted bolt-on.
