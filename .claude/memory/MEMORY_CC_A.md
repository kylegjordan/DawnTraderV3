# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-old` (NOT the retired Google Drive folder).** New §7.1 (landed `e54c5ff7b`): GitHub is source of truth; each session its own clone on `migration/aws-supabase`; `git fetch` → pull → push; **a rejected push = the system working (pull, then push)**. On local NTFS the **Tier-1 path-limited commit works** (`git commit -F <msg> -- <paths>` — no attestation token; #542 segfault does NOT reproduce on NTFS). The `guard-bare-commit` hook blocks a bare commit — use Tier-1. Rules-freshness hook re-stages `CLAUDE.md`/`.claude/*`/`load-own-memory.mjs` into my index/tree — `git checkout -- CLAUDE.md .claude/settings.local.json` + `git reset` them out before committing MY paths only.

---

## ▶ ACTIVE BATCH — B-RETIRED-SCORE-REMOVAL (#558). A0 DONE + APPROVED. **A1 UNBLOCKED — next action is to CUT A1 (the core removal).**

**Kyle's decision: REMOVE EVERYTHING** (finalScore + hybridScore + control arms). Docs: `Claude Comms and Packages/Scope Files/B_RETIRED_SCORE_REMOVAL_{SCOPE,PRE_AUDIT,568_CENSUS}.md`. The census + pre-audit are the authoritative plan; Langston re-derives every diff at Step-4.

### PHASE ORDER (correctness-forced): A0 ✅ → **A1 (next)** → A2 (xStock) → B (drop column)
- **A0 ✅ SHIPPED + APPROVED + CI-GREEN (`5c388acbd`).** VTS hybrid-confluence convergence in `vts-runner.ts`: `hybridConfidence` first term `finalScore`→**`signal.predictiveConfidence`** (:4986); buffer strength `hybridScore`→**`signal.patternStrength`** (:4958). **★ LESSON: my first A0 (`6142d6993`) read PHANTOM fields off `tradeRecord` (Phase10TradeRecord has no `confidence`/`patternStrength` — they're on the sibling `signal`/VirtualSignal); both constant-folded. Langston caught it. Fixed to source off `signal`.** Q6 data-lineage note recorded (`PRE_AUDIT §10.06`, #580): staging n=28,328, active `confidence` mean 0.73 vs OLD `finalScore` mean 0.60 → swap moves VTS term UP toward active range (intended). `predictiveConfidence` itself has NO populated sink (measured 0 rows) — documented seam, superseded-by-A1-removal.
- **★ LANGSTON'S A1 ORDERING CONSTRAINT:** retire `hybridConfidence`'s VTS consumers (`vts-runner.ts:4976` `finalScore` / `:4994` `totalFinalScore`) **before or with** the scalar swap, so the +0.05 never lands in a still-read field.

### A1 = THE CORE REMOVAL in `ready_to_buy_service.ts` (sites PINNED at ref, board CLAIMED [34]). Start with nullable-column+writers migration + ranker collapse (Langston's steer).
- **NOT-NULL column** `rtb_signals.final_score` (`schema.ts:1943`): make **NULLABLE + remove writers in the SAME migration** (§8.1 — split either way breaks prod). Writers: `ready_to_buy_service.ts:1094` + **`:1151`** (`finalScore: refreshedFinalScore.toString()`), and the queue-insert writer in `insertData` (re-pin — grep for it). Migration = gitignored `*.sql` → `git add -f` + register in `drizzle/migrations/MANIFEST.txt` (rollback file stays OUT).
- **★ TIEBREAKER (Kyle-ruled, the headline): `queueSQESignal` duplicate resolution `:2105-2113`** — `existingScore >= newScore` on `finalScore` → **REPLACE with the live rank key `r_multiple`** (`signalRMultiple`/`computeRankKey`), NOT a delete. **HARD:** kill the `parseFloat(x||'0')` coerce; `chosenNetEv`-absent on either side → **explicit COUNTED keep-first branch** (that's where #574's fabricated-input path bites). Both sides computable (entryPrice/stopPrice required).
- **RANKER COLLAPSE:** `computeRankKey:1705` control arms (`:1706` confidence→finalScore, `:1707` ranking_score); `RANKER_STRATEGIES:256`; `getActiveRanker:260`; retire the `active_ranker` DB row. Collapse to single-arm `signalRMultiple`. `rankArm` is rendered NOWHERE client-side (safe).
- **getQueuedSignals ordering** `:1400/:1408/:1416` (`orderBy:'finalScore'`) → re-point to the live rank key (don't drop — display consumers get nondeterministic order).
- **`calculateFinalScore` import `:35`** is a SHARED destructure — **drop the SYMBOL only, KEEP `calculateRegimeWeight`** (live 0.30 gate). Delete `calculateFinalScore` in `score-calculator.ts:44` + its 2 callers (SQE `:524`, quality_index `:319`) + the inline `refreshedFinalScore` block (`:806`) + the SQE shadow-gate block (`signal_quality_evaluator.ts:338-347`, CITE-AND-CLOSE the B8.5a governed plan) + orphan cluster (criteria-limiter module / applyGovernance / computePerformanceScore — all 0 live callers) + `trading-engine.ts:241` (metadata-only, no reader; keep goalAlignmentScore).
- **⚠️ CC-B is editing `signal-orchestrator.ts` (board [33], #556/B8.5k, tiny atr line ~:1100).** My A1 finalScore reads in that file collide → **defer signal-orchestrator/SQE-orchestrator slices until CC-B lands; do the ready_to_buy_service.ts-only slice FIRST.** Pull before cutting.
- **BUCKET-B LANDMINE (Phase B, NOT A1): `telemetry_history` `finalScore/hybridScore/regimeWeight/predictiveConfidence` columns hold COST DATA** (`cost-telemetry.ts:109`) — HARD EXCLUSION from the drop set.

### VERIFY DISCIPLINE (today's hard-won lessons — apply on A1):
- **tsc: read the FULL untruncated `npx tsc --noEmit 2>&1 | grep '<file>'`; confirm EDITED line numbers appear in ZERO errors. NEVER `head`-limit** (that hid the A0 phantom errors). **Green CI is NOT proof** — `check-tsc-baseline` dedups new TS2339s into a file's existing baselined ones (#579, CC-B owns).
- Explicit-paths commit; `git diff --cached --name-only` = only my paths; pull before push; CI green before advancing.

---

## ⚑ STANDING LESSONS (earned; do not re-learn)
- **VERIFY THE OBJECT/CALL-PATH, not the plausible one.** A0 phantom read; the `calculateFinalScore` false-equivalence; reasoning from dead `executeRefreshCycle`. Grep callers + check the actual type BEFORE concluding.
- **A removed WRITER with a surviving READER is invisible** to caller-tracing/tsc/CI (#568). Run the state-write census at deletion.
- **What woke me / a truncated read / a head-N slice is NOT the population** (rule 13). "3 instances" was 29; the `head-20` tsc check hid real errors; the D-5 ref check certified an empty repo. Measure the population.
- **Never attribute a measurement from a wake FRAGMENT** — it's truncated/quoting; read the full message or ask. (3 attribution slips today.)
- **Announce SYMPTOMS freely, CAUSES only after testing reach** (24.a). Provenance-read old architecture before calling it wrong (24).
- **Langston is STATELESS per-invoke** — carry his prior ruling into the next prompt. **Use his ACTUAL NAME to Kyle, never "the reviewer."** Quote `path:line` from `origin/…`, never the working tree.
- Rule 27: me + Langston, ship it — don't convene panels. Rule 28: don't narrate other sessions' work to Kyle.

---

## 📌 OPEN THREADS
- **#558 A1** — the active work (above). Board [34] held.
- **#578** — legacy `TradingEngine` (runs in neither mode; paper never `.start()`ed, live Phase-21-gated-refuses; `active-execution-engine` is the real paper+live pipeline). Kyle-ruled legacy → its own removal batch `B-TRADING-ENGINE-REMOVAL`, owner CC-A. Not #558.
- **#580** — A0 predictiveConfidence-not-persisted seam; superseded-by-A1-removal; owner CC-A.
- **#570** — RTB bucket-2 refresh gap → **HANDED to CC-C/Analyst** (rides their item 1). Not mine anymore.
- **#579** — CI `check-tsc-baseline` dedup hole → **CC-B owns** (after B8.5k).
- **#571** `B-WS-SUBSCRIBE-BOUNDARY-CLASS` (mine, Phase 19). Obligations **#44** (2026-08-01, alert `74a661e5`), **#45** (2026-08-30, alert `27860643`).
- Kyle: crypto uses VOLUME not order-book — confirm Phase 25, don't act. Consolidate freshness work (#441/#526/#531/#548/#559) — unstarted.
- **xStock exit-check-skip staleness family** (PGR/GM/TER/QCOM/BX/BAX…) = #566, CC-B's line. Ack instances, don't chase; don't re-triage.

---

## ✅ CLOSED — ONE LINE (repo is authoritative)
- **A0** (2026-07-25, `5c388acbd`) — VTS convergence, approved, CI-green.
- **#441 rescue** (`c65813bcd`+`5e2e27449`) — freshness-monitor script committed to save it; SUPERSEDED header; can't run (no migration for its table); OPEN in GOVERNANCE_EXCEPTIONS.
- **B-RTB-REFRESH-CONSOLIDATE OBJ-1** · **#559 OBJ-2** · **B-REGIME-REFRESH-PIPE** · **#555** — all shipped/verified; see repo reports.
