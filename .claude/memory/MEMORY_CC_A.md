# MEMORY — CC-A ("Claude Old" / OLD Claude)

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-old` (NOT the retired Google Drive folder).** New §7.1 (landed `e54c5ff7b`): GitHub is source of truth; each session its own clone on `migration/aws-supabase`; `git fetch` → pull → push; **a rejected push = the system working (pull, then push)**. On local NTFS the **Tier-1 path-limited commit works** (`git commit -F <msg> -- <paths>` — no attestation token; #542 segfault does NOT reproduce on NTFS). The `guard-bare-commit` hook blocks a bare commit — use Tier-1. Rules-freshness hook re-stages `CLAUDE.md`/`.claude/*`/`load-own-memory.mjs` into my index/tree — `git checkout -- CLAUDE.md .claude/settings.local.json` + `git reset` them out before committing MY paths only.

---

## ▶ ACTIVE BATCH — B-RETIRED-SCORE-REMOVAL (#558). A0 ✅ + A1 ✅ SHIPPED+SIGNED-OFF+**DEPLOYED+VERIFIED**. **NEXT: CUT A2 (xStock) — awaiting Kyle's go (asked 2026-07-27).**

### A1 ✅ DEPLOYED + §9.3-VERIFIED on staging (2026-07-27, both CC-B+CC-C cleared the deploy; Kyle-approved)
- Deploy sequence: pull → **`npm run db:migrate` FIRST** (migration NOT in `build`/`start` — it's a separate step; nullable-before-no-writer order) → build → `pm2 restart`. Migration applied clean (1 pending = mine). DB verified: `final_score` is_nullable=YES, active_ranker rows=0. App online, HTTP 200, no NOT-NULL/final_score/schema errors (only pre-existing Kraken unknown-pair + EACCES health-log noise).
- **§9.3 UI (Kyle's Chrome, already authed — no creds entered):** Dashboard + Analytics&Diagnostics render clean; Ready-to-Buy widget shows R-Multiple, no finalScore artifacts, honest em-dashes. **HONEST LIMIT: RTB pool EMPTY (crypto weather STORMY, `ev_gap_warming n=0/100` — EV/fee gate correctly refusing; NOT my change) → verified ranking CODE+DISPLAY, did NOT observe a live signal rank via r_multiple (none passing the gate).**

### A1 ✅ SHIPPED + SIGNED-OFF (2026-07-25, head `8939105f8`, commit `7512ddf19`; CI `30135581915` green)
- 6 files (+192/-86): `ready_to_buy_service.ts` (nullable-col writers removed, tiebreaker→r_multiple via new shared `rMultipleCore`, ranker collapse to sole `r_multiple` arm, getQueuedSignals→queuedAt), `schema.ts` (final_score `.notNull()` dropped), migration `2026-07-25-b-retired-score-removal-final-score-nullable.sql`(+rollback out-of-MANIFEST), test, MANIFEST.
- **Langston Step-4: SIGN-OFF, no code changes.** Verified extraction behavior-equivalent line-by-line; slice boundary correct (defer nothing else); queuedAt+migration ordering approved. **Both §9.4 conditions met:** (1) telemetry-reader slice homed = **#582** (`B-FINALSCORE-TELEMETRY-RETIRE`, Phase-B prerequisite); (2) census doc records the avgFinalScore trace (decision-grade paths source emit-time/per-trade, NOT the nulling column → no calibration shift) + ON CONFLICT cite. Governance commit `92f70d64b`.
- **DEPLOY = OUTWARD (restarts paper engine + runs migration) → confirmed with Kyle before advancing.** Migration ordering: nullable-migration BEFORE/with the no-writer code (opposite of a DROP).

**Kyle's decision: REMOVE EVERYTHING** (finalScore + hybridScore + control arms). Docs: `Claude Comms and Packages/Scope Files/B_RETIRED_SCORE_REMOVAL_{SCOPE,PRE_AUDIT,568_CENSUS}.md`. The census + pre-audit are the authoritative plan; Langston re-derives every diff at Step-4.

### PHASE ORDER (REFRAMED 2026-07-27): A0 ✅ → A1 ✅deployed → **A2 = SYSTEM-WIDE PERSISTENCE (in progress)** → **A3 (new)** → B (drop columns)
- **A0 ✅** (`5c388acbd`) VTS convergence — one-liner; detail in repo reports + #580.
- **★ A2 REFRAMED (Langston-concurred `da9ccfdc`, scope doc §"REFRAME v2"): NOT xStock-only — finalScore GATES NOTHING now (:778/vts:1741; A1→r_multiple; SQE gate retired #525), it is PERSISTED VTS/ML-feed DATA on BOTH lanes.** xStock-only removal splits ML training data per-lane (Langston caught this + that my "1-line" + "crypto keeps it via :2195/2227" citations were WRONG — :2195/2227 are crypto INLINE openVirtualTrades.set, NOT registerOpenVtsTrade whose sole caller is eval-cycle:1124).
- **★ A2 ✅ DONE — SHIPPED + LANGSTON STEP-4 CLOSED + DEPLOYED + §9.3-VERIFIED (2026-07-27, head `08afc1fcb`). Deploy: pull→db:migrate(none)→build→restart; HTTP 200, engine online, `[EVAL_EXIT] positionsEvaluated=11` (exit-monitor live = trading healthy — CC-B's reliable check), 0 errors, dashboard renders clean. ⚠️ `sessionInfo:null` = pre-existing #585 (CC-B's malformed-session row; do NOT block on it, do NOT run mode:new — mode:continue doesn't fix it either). A2-effect (finalScore-free vts_open_trades context) shows on NEW VTS opens.**
- **★ #558 IS ARCHITECTURE-CLASS AT THE BATCH LEVEL (Langston 2026-07-27, alert `cfde64bb`) — BECAUSE A3.** A2's telemetry-only leg was correctly non_architecture, but removing computeFinalScore + re-sourcing expectedEdge(:2040)/rankingScore(:5648) in A3 changes the scoring-and-ranking PIPELINE → **SYSTEM_MANUAL + SIM CONTENT updates MUST land at A3/Phase-B close (not deferred); A3 scope-header class = architecture.** Langston records the alert judgment; the class-header + doc updates are MINE at close.
- **(prior state, now DONE)** Method = A1-mirror (types optional + writers omit + readers `?? 0`). ALL vts_open_trades writers omit finalScore: eval-cycle:1000 + crypto :2037/:2195/:2227/:4995 + shadow :890 + register :4059. KEPT: computeFinalScore (A3), :668/:2598/:4885 archiveCommon (#582), :942 rtb_shadow_pairings (separate substrate, fenced). Scope docs: `B_RETIRED_SCORE_REMOVAL_A2_{SCOPE,PRE_AUDIT}.md`. §13 sibling-cluster homed = #584. **★ LESSON (3 surviving-writers Langston/I caught, ALL tsc-invisible): a COALESCED WRITE (`finalScore: x ?? 0` INTO a persisted record) is NOT a reader — my `grep -v '?? 0'` enumeration wrongly excluded them; AND a field that looks like a passthrough (`finalScore: input.finalScore` in registerOpenVtsTrade) STILL persists via insertOpenTrade→splitTradeForPersist→context jsonb (finalScore not in the core allow-list → lands in context). Enforce stop-persist at the shared REGISTER, not per-caller. Full-grep every writer; classify write-vs-read correctly; tsc does NOT catch a surviving optional-field write (#568 inverted).**
- **A2 (revised, DONE) = removed PERSISTED finalScore field BOTH lanes:** xStock `eval-cycle.ts` (:656 compute/:668/:1000/import — DONE, held uncommitted) + crypto `vts-runner.ts` inline :2195/:2227 (⚠️B79.0m.b HOT-PATH-LOCK — both-branches/twin-lock discipline like B7.2d) + type `OpenVirtualTrade.finalScore:628` + `RegisterOpenVtsTradeInput:3913` + builder :4050 + readers :3808/:5023/:3191/:3231/:3288/:3407/:5649/:5658 (TRACE each — removable vs coalesce) + archiver would_admit/final_score (#582 FOLDS IN — both lanes stop feeding it). **★ computeFinalScore STAYS (derives crypto expectedEdge :2040 — that's A3). NO column drop (Phase B, zero-reader bake).** Zero decision/admission/ranking/sizing change (VTS telemetry, gate dead).
- **A3 (new) = computeFinalScore removal + RE-SOURCE crypto expectedEdge (:2040, mechanical). RETIRING expectedEdge (incoherent cross-lane) = SEPARATE §13-homed item (Langston).**
- **Pre-Phase-B: verify ML trainer (scripts/hce/ML ingest) reads vts_open_trades.finalScore → sets drop urgency. Kyle given §9.2 scope-expansion NOTICE 2026-07-27 (not a decision — VTS telemetry).**
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
- **#558** — A1 DEPLOYED+§9.3-VERIFIED on staging 2026-07-27 (above). NEXT = **A2 (xStock eval-cycle.ts), awaiting Kyle's go** (asked 2026-07-27; did NOT start unilaterally). Open row confirmed (langston, fa959de63); gov-staleopen `f4ffaf53` ACKED-and-left (do not resolve — see lesson). Board [34] held (still my file for A2? re-pin at ref). A2 recon: finalScore cluster at `eval-cycle.ts:656` computeFinalScore + `:668/:1000` + pattern-filter/pattern-pool-filters.
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
