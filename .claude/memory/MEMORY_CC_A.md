# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-old` (NOT the retired Google Drive folder).** New §7.1 (landed `e54c5ff7b`): GitHub is source of truth; each session its own clone on `migration/aws-supabase`; `git fetch` → pull → push; **a rejected push = the system working (pull, then push)**. On local NTFS the **Tier-1 path-limited commit works** (`git commit -F <msg> -- <paths>` — no attestation token; #542 segfault does NOT reproduce on NTFS). The `guard-bare-commit` hook blocks a bare commit — use Tier-1. Rules-freshness hook re-stages `CLAUDE.md`/`.claude/*`/`load-own-memory.mjs` into my index/tree — `git checkout -- CLAUDE.md .claude/settings.local.json` + `git reset` them out before committing MY paths only.

---

## ▶ ACTIVE BATCH — B-RETIRED-SCORE-REMOVAL (#558). A0 ✅ + A1 ✅ SHIPPED + LANGSTON STEP-4 SIGN-OFF. **NEXT: DEPLOY A1 to staging + verify (UI §9.3), then CUT A2 (xStock).**

### A1 ✅ SHIPPED + SIGNED-OFF (2026-07-25, head `8939105f8`, commit `7512ddf19`; CI `30135581915` green)
- 6 files (+192/-86): `ready_to_buy_service.ts` (nullable-col writers removed, tiebreaker→r_multiple via new shared `rMultipleCore`, ranker collapse to sole `r_multiple` arm, getQueuedSignals→queuedAt), `schema.ts` (final_score `.notNull()` dropped), migration `2026-07-25-b-retired-score-removal-final-score-nullable.sql`(+rollback out-of-MANIFEST), test, MANIFEST.
- **Langston Step-4: SIGN-OFF, no code changes.** Verified extraction behavior-equivalent line-by-line; slice boundary correct (defer nothing else); queuedAt+migration ordering approved. **Both §9.4 conditions met:** (1) telemetry-reader slice homed = **#582** (`B-FINALSCORE-TELEMETRY-RETIRE`, Phase-B prerequisite); (2) census doc records the avgFinalScore trace (decision-grade paths source emit-time/per-trade, NOT the nulling column → no calibration shift) + ON CONFLICT cite. Governance commit `92f70d64b`.
- **DEPLOY = OUTWARD (restarts paper engine + runs migration) → confirmed with Kyle before advancing.** Migration ordering: nullable-migration BEFORE/with the no-writer code (opposite of a DROP).

**Kyle's decision: REMOVE EVERYTHING** (finalScore + hybridScore + control arms). Docs: `Claude Comms and Packages/Scope Files/B_RETIRED_SCORE_REMOVAL_{SCOPE,PRE_AUDIT,568_CENSUS}.md`. The census + pre-audit are the authoritative plan; Langston re-derives every diff at Step-4.

### PHASE ORDER (correctness-forced): A0 ✅ → A1 ✅ → **A2 (xStock, next)** → B (drop column)
- **A0 ✅** (`5c388acbd`) VTS convergence — one-liner; detail in repo reports + #580.
- **A2 = xStock slice (NEXT after A1 deploy):** the `eval-cycle.ts` finalScore cluster (xStock path). Pull + re-pin at ref before cutting; same nullable-already-done column (A2 is code readers on the xStock side, not another migration).
- **DEFERRED slices (Langston-APPROVED A1 boundary — do NOT fold into A1):** SQEInput.finalScore `:1094` (crosses into `signal_quality_evaluator.ts` = SQE-contract slice) · avgFinalScore telemetry readers = **#582** (`B-FINALSCORE-TELEMETRY-RETIRE`, Phase-B prereq) · metadata.finalScore/originalFinalScore bookkeeping · `score-calculator.calculateFinalScore` def + non-RTB callers (SQE `:524`, quality_index `:319`) · `trading-engine.ts:241` = **#578** module removal · orphan cluster (criteria-limiter/applyGovernance/computePerformanceScore, 0 live callers).
- **BUCKET-B LANDMINE (Phase B, NOT before): `telemetry_history` `finalScore/hybridScore/regimeWeight/predictiveConfidence` columns hold COST DATA** (`cost-telemetry.ts:109`) — HARD EXCLUSION from the drop set.

### VERIFY DISCIPLINE (hard-won — apply on A2):
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
- **PERSISTENT-CONDITION GOV ALERT (gov-staleopen, "open >48h"): ACK, do NOT resolve.** poller.mjs:238-244 — the confirmed open row suspends the DEADLINE but the 48h backstop deliberately re-pings (config.mjs:201 "OPEN must never be a silent bypass"). RESOLVING frees the dedupe key → checker spawns a fresh twin next cycle (hit this 2026-07-27). Correct: ack-and-leave (dedupe suppresses twins; drops from unacked list); resolve ONLY when the batch actually closes. Contrast the gov-deadline alert, which the confirmed open row DOES suppress.

---

## 📌 OPEN THREADS
- **#558** — A1 shipped+signed-off (above); **BLOCKED on Kyle's deploy-vs-fold decision since 2026-07-25 (~2 days, Kyle away)** — did NOT unilaterally start A2 (respecting his decision point). Open row confirmed (langston, fa959de63); gov-staleopen `f4ffaf53` ACKED-and-left (do not resolve — see lesson). Board [34] held. On Kyle's go: pull → deploy A1 (migration runs pre-restart) → §9.3 UI-verify RTB queue/ranking → then A2.
- **#582** — finalScore telemetry-reader retirement (`B-FINALSCORE-TELEMETRY-RETIRE`, Phase-B prereq). Owner CC-A. Langston Step-4 condition, homed.
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
- **A1** (2026-07-25, `7512ddf19`→`8939105f8`) — core finalScore removal in ready_to_buy_service; Langston Step-4 SIGN-OFF; gov `92f70d64b`; #582 homed. Awaiting deploy.
- **#441 rescue** (`c65813bcd`+`5e2e27449`) — freshness-monitor script committed to save it; SUPERSEDED header; can't run (no migration for its table); OPEN in GOVERNANCE_EXCEPTIONS.
- **B-RTB-REFRESH-CONSOLIDATE OBJ-1** · **#559 OBJ-2** · **B-REGIME-REFRESH-PIPE** · **#555** — all shipped/verified; see repo reports.
