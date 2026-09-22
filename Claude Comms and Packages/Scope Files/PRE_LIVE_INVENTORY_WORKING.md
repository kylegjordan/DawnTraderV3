# PRE-LIVE INVENTORY — WORKING FILE (raw, mechanically deduped, NOT yet categorised)

**Kyle, 2026-09-23:** *"generate a complete list of what needs to be done in Phase 19 (what is left) and what is planned for phase 25, 16, and 20 … and 21 … going through every session's task list, the phase 19 plan, the roadmap, and Langston's archives … fully understand every planned and discussed (slotted and not slotted) batch, sub-batch, hot fix, investigation … and dedupe that list. Once we have the full list, each item is to be categorized … must be done before live, would be extremely helpful to do before going live, and wait until after we have gone live."*

## ⛔ WHAT THIS FILE IS, AND WHAT IT IS NOT
- **It IS a mechanical extraction** from `PHASE_19_PLAN.md`, `POST_AUDIT_ROADMAP.md` (tables AND section headings — phases 16/20/21 are written as headings), the four session task lists, and every `RUNNING_ISSUES` entry marked OPEN / DEFERRED / BLOCKED. **985 raw rows → 616 candidate items.**
- **Dedupe rule, deliberately conservative:** rows naming the same batch identifier are one item; an OPEN issue joins the plan row that cites it FIRST. **Nothing else merges** — an incidental citation of an issue number never joins two items, because over-merging HIDES work and under-merging only costs a second pass.
- ⛔ **It is NOT yet complete.** Two sources are not in it: **Langston's archive** (only he can mine it — discussed-but-never-slotted items live there) and **each session's knowledge of items discussed and never written down.**
- ⛔ **`status` is a HEURISTIC read of the row's own wording, not a verdict.** `done?` means the row LOOKS finished and must be confirmed by its owner before it leaves the list; `unclear` means the wording did not say.
- ⛔ **The two bottom sections are where the real dedupe work is:** items that exist ONLY in a task list, and OPEN issues with no plan row at all. Many will be resolved-but-unmarked or already folded into a batch under another name; some will be genuinely unhomed work.

| group | items |
|---|---:|
| Phase 19 — plan rows (and anything clustered with them) | 236 |
| Phase 25 — Calibration With Evidence | 29 |
| Phase 16 — Database & Remaining Legacy Cleanup | 10 |
| Phase 20 — Production Hardening | 7 |
| Phase 21 — Live Mode Activation (incl. the post-live 21.4 / 21.5 / 21.6 sections) | 11 |
| Phase 22 — Publication (post-live) | 2 |
| Phase 17 / 17.5 — ML design, smart thermostat (post-live) | 10 |
| Phase 18 — ML implementation (post-live) | 5 |
| In a session task list but on NO plan row or roadmap section | 82 |
| An OPEN issue with NO plan row and NO task-list line | 216 |
| Other | 8 |

## Phase 19 — plan rows (and anything clustered with them) — 236

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 1 |  |  | done? | Test suite green (no stale-failure noise floor) | PHASE_19_PLAN.md:480 |
| 2 |  | 1 | #739 | Langston | in-flight | B-RULES-1e — mechanisms for three rules followed zero times (#739, #740, #741-CC-A) | PHASE_19_PLAN.md:544; RUNNING_ISSUES.md:4377 |
| 3 | B-EXIT-PROVENANCE | 1, 4, 6 | #742 #743 | CC-C | open | B-EXIT-PROVENANCE | PHASE_19_PLAN.md:33; PHASE_19_PLAN.md:126; PHASE_19_PLAN.md:131 |
| 4 |  | 10 |  | Langston | unclear | Crypto active-pipeline resurrection (P19-B6.5 = B6.5a + B6.5b + B6.5c + B6.5e + B6.5g) GREEN — B6.5a : per-asset-class active gate present + tested + the xStock | PHASE_19_PLAN.md:489 |
| 5 | B-ALERT-LIFECYCLE | 10 | #912 | CC-C | open | B-ALERT-LIFECYCLE (#912 + #443 + #508 RIDER-2) | PHASE_19_PLAN.md:135; RUNNING_ISSUES.md:5198 |
| 6 |  | 11 |  |  | done? | Price-discovery-liveness fill gate (P19-B6.6) GREEN — closes the holiday/half-day hole in the clock-only liquid-fill-window (a fresh-captured_at-but-stale-last | PHASE_19_PLAN.md:490 |
| 7 |  | 12 |  | Langston | unclear | strategy_gates NON-EMPTY for any class being switched on — the default-open active strategy gate (P19-B4a C5) must not silently run the FULL strategy set on a t | PHASE_19_PLAN.md:491 |
| 8 |  | 13 |  | Langston | done? | Per-class FILL-QUALITY GATE present + wired for any class being switched on (P19-B4b.1 / #295 / Langston Step-2 C-Q3 + Step-4): active trading BLOCKS if, for a | PHASE_19_PLAN.md:492 |
| 9 |  | 14 |  | Kyle | unclear | Paper-mode FULL guardrail set present + working (P19-B6.8) — every user-settable guardrail separated per-mode with paper's set complete + functional; live struc | PHASE_19_PLAN.md:493 |
| 10 |  | 19-1 |  |  | open | B79.0n.WIRE-IN (umbrella v4 #14) | POST_AUDIT_ROADMAP.md:89 |
| 11 |  | 19-10 |  |  | unclear | #139 vts-runner throwing resolveAssetClass call sites | POST_AUDIT_ROADMAP.md:98 |
| 12 |  | 19-11 |  |  | observation | §19.1 Paper Trading Run | POST_AUDIT_ROADMAP.md:99 |
| 13 |  | 19-12 |  |  | unclear | §19.2 Audit & Debug | POST_AUDIT_ROADMAP.md:100 |
| 14 |  | 19-13 |  |  | unclear | §19.3 Performance Validation | POST_AUDIT_ROADMAP.md:101 |
| 15 |  | 19-14 |  |  | unclear | §19.3.5 Trailing-exit live verification (B65.3 folded in) | POST_AUDIT_ROADMAP.md:102 |
| 16 |  | 19-15 |  |  | unclear | #97 xStock asset-specific characteristics inventory | POST_AUDIT_ROADMAP.md:103 |
| 17 |  | 19-16 |  |  | unclear | B79.6 sector-aware portfolio-cluster prevention | POST_AUDIT_ROADMAP.md:104 |
| 18 |  | 19-17 |  | Kyle | unclear | NEW — Active Trading Simulations (Kyle directive 2026-05-27) | POST_AUDIT_ROADMAP.md:105 |
| 19 |  | 19-17b |  | Langston | unclear | ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live MUST set live_engine_enabled to numeric 1 | POST_AUDIT_ROADMAP.md:106 |
| 20 |  | 19-18 |  | Kyle | unclear | NEW — Live mode active-trading build approach (Kyle directive 2026-05-27) | POST_AUDIT_ROADMAP.md:107 |
| 21 |  | 19-19 |  | Langston | observation | NEW — AMR body pre-Phase-19 (CC + Langston consensus 2026-05-28; sequencing reconciled 2026-06-08) | POST_AUDIT_ROADMAP.md:108 |
| 22 |  | 19-2 |  |  | unclear | B79.0n.OBSERVABILITY T2 + active-trading flip (umbrella v4 #16) | POST_AUDIT_ROADMAP.md:90 |
| 23 |  | 19-20 | #206 | Langston | open | DONE 2026-06-08 — Decision-provenance capture (RUNNING_ISSUES #206; Kyle directive 2026-06-07 — built pre-Phase-19, decoupled from the study) | POST_AUDIT_ROADMAP.md:109; RUNNING_ISSUES.md:2309 |
| 24 |  | 19-3 |  |  | unclear | §19.0.5 Full data-capture coverage for paper-active path | POST_AUDIT_ROADMAP.md:91 |
| 25 |  | 19-5 |  |  | unclear | §19.x Boot Readiness Coordinator | POST_AUDIT_ROADMAP.md:93 |
| 26 |  | 19-6 |  |  | unclear | #137 active-trading-path restoration intake list | POST_AUDIT_ROADMAP.md:94 |
| 27 |  | 19-7 |  |  | unclear | #92 wire xstockSpotScanner through signal-orchestration | POST_AUDIT_ROADMAP.md:95 |
| 28 |  | 19-8 |  |  | unclear | B79.5 xStock real-time WebSocket pricing adapter | POST_AUDIT_ROADMAP.md:96 |
| 29 |  | 19-9 |  |  | unclear | B79.x failure-mode taxonomy — entry-side gap | POST_AUDIT_ROADMAP.md:97 |
| 30 |  | 19.0.3 |  | Kyle | unclear | — TFS sustainability gate value-scope decision (NEW 2026-05-17, Kyle directive) | POST_AUDIT_ROADMAP.md:363 |
| 31 |  | 19.0.5 |  | Kyle | unclear | — Full data-capture coverage for paper-active path (HARD requirement, Kyle directive 2026-05-05) | POST_AUDIT_ROADMAP.md:135 |
| 32 |  | 19.0.A |  | Kyle | unclear | — Regime classifier confidence-chain calibration (MOVED HERE 2026-05-21, Kyle directive) | POST_AUDIT_ROADMAP.md:345 |
| 33 |  | 19.0.B |  |  | done? | — Daily loss-budget service + kill-switch auto-trip ( SHIPPED 2026-06-17 as P19-B6 — a RESTORE of the deleted Phase-8 auto-trip) | POST_AUDIT_ROADMAP.md:121 |
| 34 |  | 19.0.C |  | Kyle | unclear | — Tiered fee-model accuracy fix (NEW 2026-06-08, Kyle directive — between-Phase-24-and-19 prerequisite) | POST_AUDIT_ROADMAP.md:57 |
| 35 |  | 19.1 |  |  | unclear | Paper Trading Run | POST_AUDIT_ROADMAP.md:155 |
| 36 |  | 19.2 |  |  | unclear | Audit & Debug | POST_AUDIT_ROADMAP.md:165 |
| 37 |  | 19.3 |  |  | unclear | Performance Validation | POST_AUDIT_ROADMAP.md:174 |
| 38 |  | 19.3.5 |  |  | unclear | Trailing-exit live verification (folded-in B65.3, 2026-04-25) | POST_AUDIT_ROADMAP.md:180 |
| 39 |  | 19.4 |  |  | unclear | SQE Recalibration (B66, conditional) | POST_AUDIT_ROADMAP.md:380 |
| 40 |  | 19.4.5 |  | Kyle | observation | Observational Decision Gate — pre-launch reordering (NEW 2026-04-26, Kyle directive) | POST_AUDIT_ROADMAP.md:409 |
| 41 |  | 19.5 |  |  | unclear | — anchor stub (superseded section) | POST_AUDIT_ROADMAP.md:452 |
| 42 |  | 19.6 |  | Kyle | unclear | External Source Connection & Capacity Diagnostics Dashboard (NEW 2026-06-02, Kyle directive) | POST_AUDIT_ROADMAP.md:194 |
| 43 |  | 19.6.1 |  |  | unclear | External-Source Connection Dashboard | POST_AUDIT_ROADMAP.md:200 |
| 44 |  | 19.6.2 |  |  | unclear | CPU / Process Capacity Dashboard | POST_AUDIT_ROADMAP.md:220 |
| 45 |  | 19.6.3 |  |  | unclear | Alert integration | POST_AUDIT_ROADMAP.md:235 |
| 46 |  | 19.6.4 |  |  | unclear | Forward role — ML / AI conversational layer API | POST_AUDIT_ROADMAP.md:239 |
| 47 |  | 19.6.5 |  |  | unclear | Scope shape & sequencing | POST_AUDIT_ROADMAP.md:243 |
| 48 |  | 19.6.6 |  | Kyle | unclear | Internal subsystem health + EARLY-FAILURE detection (NEW 2026-06-12, Kyle directive — "find failures in progress before they become failures we react to") | POST_AUDIT_ROADMAP.md:248 |
| 49 |  | 2 | #153 |  | open | #153 xstock pattern-pool-cap validated | PHASE_19_PLAN.md:481; RUNNING_ISSUES.md:2119 |
| 50 | B-CROSS-SESSION-BLEED | 2 | #753 | Kyle | open | B-CROSS-SESSION-BLEED (#753) — another session’s uncommitted work materialising in a session’s own checkout | PHASE_19_PLAN.md:545; RUNNING_ISSUES.md:4061 |
| 51 | B-EXIT-PROVENANCE-TICKER-RETENTION | 2 | #911 | Langston | open | B-EXIT-PROVENANCE-TICKER-RETENTION (#911) | PHASE_19_PLAN.md:34; RUNNING_ISSUES.md:5323 |
| 52 | B-ALERT-ACTOR-ALLOWLIST | 2.4 |  | Kyle | done? | B-ALERT-ACTOR-ALLOWLIST (#987) — the alert owner record is free text and CLAUDE.md §10.5 mandates cc-session-<date>, a name bound to nobody: 23 distinct strings | PHASE_19_PLAN.md:546; CC_B_SESSION_TASK_LIST.md:73 |
| 53 | B-ROLLBACK-EPOCH-FORWARD | 2.4-FEE, 3b.b-c, P19-B12 | #1041 #1042 #1045 | CC-B | observation | B-ROLLBACK-EPOCH-FORWARD (#1045) — Owner CC-C (placed 2026-09-11; routed by Langston from CC-B's B-XSTOCK-FEE-CONTRACT Step 4) | PHASE_19_PLAN.md:38; PHASE_19_PLAN.md:237; PHASE_19_PLAN.md:548 |
| 54 | B-KRAKEN-FEE-WATCH | 2.4-FEE-b | #1011 | CC-B | open | B-KRAKEN-FEE-WATCH (#1011) — Owner CC-B. The venue revised its schedule 2026-07-09; we found out 2026-09-06 because Kyle looked at the page. The pages are PUBLI | PHASE_19_PLAN.md:549; CC_B_SESSION_TASK_LIST.md:36; CC_B_SESSION_TASK_LIST.md:77 |
| 55 | T-W20C-SCALAR-LEG | 2.4-FEE-c |  | CC-B | open | T-W20C-SCALAR-LEG (B-NEW-53 parity, roadmap 25-12; alert a3610acf, successor to 7c4a873f) — Owner CC-B. No longer data-blocked: signal_eval_provenance held 15,2 | PHASE_19_PLAN.md:550; CC_B_SESSION_TASK_LIST.md:11; CC_B_SESSION_TASK_LIST.md:33 |
| 56 | B-PAPER-LANE-PROVENANCE | 2.4-FEE-c-ii |  | Langston | open | B-PAPER-LANE-PROVENANCE (#1059) — Owner CC-B.  THE PAPER LANE IS UNREPLAYABLE: signal_eval_provenance IS WRITTEN BY THE VTS LANE ONLY. MEASURED 2026-09-13 on xs | PHASE_19_PLAN.md:551 |
| 57 | B-FILTER-DIAG-XSTOCK | 2.4-FEE-d | #682 | CC-B | open | B-FILTER-DIAG-XSTOCK (#682) — Owner CC-B. change-class architecture (Langston-ruled at filing: new active-path emission). Wire the per-strategy decline taxonomy | PHASE_19_PLAN.md:552; CC_B_SESSION_TASK_LIST.md:92; RUNNING_ISSUES.md:3559 |
| 58 | B-SCRIPTS-TSC-COVERAGE | 2.4-FEE-e |  | Langston | open | B-SCRIPTS-TSC-COVERAGE (#1058) — Owner CC-B.  scripts/ SITS IN NO COMPILATION GRAPH, so the tsc baseline gate has NEVER graded it. MEASURED 2026-09-13 by enumer | PHASE_19_PLAN.md:553 |
| 59 | B-DEPLOY-ACTOR-ALLOWLIST | 2.4a |  | CC-B | unclear | CLOSED 2026-09-04 — deployed a4bcbe3c1, Langston Step-4 APPROVED + Step-8 CONFIRMED at the box; #656 residual closed, #1000 found-and-fixed in flight, #1004 ope | PHASE_19_PLAN.md:547; CC_B_SESSION_TASK_LIST.md:67; CC_B_SESSION_TASK_LIST.md:75 |
| 60 | B-ALERT-QUEUE-INTEGRITY | 2.4b |  | Langston | unclear | B-ALERT-QUEUE-INTEGRITY ➕ FOLDED 2026-09-03 (Langston §13, not its own batch): a NEGATIVE-PATTERN EXEMPTION in .gitignore for the INSTRUMENT CLASS — !scripts//. | PHASE_19_PLAN.md:554; CC_B_SESSION_TASK_LIST.md:78 |
| 61 | B-RTB-SIGNAL-IDENTITY | 2.4c | #1006 | CC-B | open | B-RTB-SIGNAL-IDENTITY (#1006) — the RTB signal queue's database identity does not match its own schema, and neither includes the asset class. Live, rtb_signals | PHASE_19_PLAN.md:555; CC_B_SESSION_TASK_LIST.md:79; RUNNING_ISSUES.md:7700 |
| 62 | B-WRITER-ACTOR-ALLOWLIST | 2.4d, 2.4e | #1046 #1048 #1055 | Langston | open | B-WRITER-ACTOR-ALLOWLIST (#1046) — langston-memory-write records --by as free text into a permanent append-only index, a week after #987 and B-DEPLOY-ACTOR-ALLO | PHASE_19_PLAN.md:556; PHASE_19_PLAN.md:557; CC_INFRA_SESSION_TASK_LIST.md:14 |
| 63 | B-ARCHIVE-RETENTION-SIZING | 2.4f |  | Langston | open | B-ARCHIVE-RETENTION-SIZING (#592, alert 74424570) — the database disk alert is a SCOPE DECISION, not a broken sweep. Langston's triage of this class, re-stated | PHASE_19_PLAN.md:559; CC_B_SESSION_TASK_LIST.md:12 |
| 64 | B-WAKE-SOURCE-TRUTH | 2.4g | #1054 | Langston | open | B-WAKE-SOURCE-TRUTH (#1054) — the wake-source docs name /var/log/langston-alert-invokes.log as a live source for Langston's alert completions, but it is 0 bytes | PHASE_19_PLAN.md:558; RUNNING_ISSUES.md:8852 |
| 65 |  | 3 |  |  | open | RTB asset_class SET NOT NULL Phase-4 flip | PHASE_19_PLAN.md:482 |
| 66 | F-G-1 | 3 |  | Langston | observation | F-G-1 — B-GRID-REPRESENTABILITY  THE SPLIT, Langston-ruled 2026-08-27 | PHASE_19_PLAN.md:35; CC_C_SESSION_TASK_LIST.md:19 |
| 67 | B-ASSET-CAPS-REMOVAL | 3b | #917 | Langston | open | B-ASSET-CAPS-REMOVAL (#917) | PHASE_19_PLAN.md:36; RUNNING_ISSUES.md:5389 |
| 68 | B-XSTOCK-FEED-SANITY | 3b.b, 3b.f-c-a | #992 | Kyle | open | CLOSED 2026-09-11 — window INCONCLUSIVE, stopped (Langston 17:23Z); the acceptance does not pass and re-arms on the post-OBJ-7 instrument; record B_XSTOCK_FEED_ | PHASE_19_PLAN.md:37; PHASE_19_PLAN.md:50; RUNNING_ISSUES.md:7469 |
| 69 | B-XSTOCK-ENTRY-COMPARATOR | 3b.b-b | #996 | CC-C | open | B-XSTOCK-ENTRY-COMPARATOR (#996) — Owner CC-C | PHASE_19_PLAN.md:49; CC_C_SESSION_TASK_LIST.md:48; RUNNING_ISSUES.md:7548 |
| 70 | B-EXIT-TRIGGER-FILL-PARITY | 3b.c | #959 | CC-C | open | B-EXIT-TRIGGER-FILL-PARITY (#959) — CRITICAL. Reuses the slot vacated by the WITHDRAWN B-BOOK-BBO-DIVERGENCE. | PHASE_19_PLAN.md:40; CC_C_SESSION_TASK_LIST.md:105; RUNNING_ISSUES.md:1279 |
| 71 | B-XSTOCK-BOOK-LADDER | 3b.d | #949 | CC-C | open | B-XSTOCK-BOOK-LADDER (#949) — PREREQUISITE of F-G-2, same standing as 3b.b | PHASE_19_PLAN.md:41; CC_C_SESSION_TASK_LIST.md:43; RUNNING_ISSUES.md:1657 |
| 72 | B-XSTOCK-LIVE-FEED | 3b.e | #950 | CC-C | open | B-XSTOCK-LIVE-FEED (#950) | PHASE_19_PLAN.md:42; CC_C_SESSION_TASK_LIST.md:44; RUNNING_ISSUES.md:1642 |
| 73 | B-PRICE-AGE-TRUTH | 3b.f | #994 | Langston | observation | B-PRICE-AGE-TRUTH (#951) | PHASE_19_PLAN.md:43; RUNNING_ISSUES.md:7149 |
| 74 | B-OPENTRADE-REFRESH-LANE | 3b.f-a |  | Langston | open | B-OPENTRADE-REFRESH-LANE (#977) — Owner CC-C. PLACED BEFORE 3b.f-b BY KYLE, 2026-08-31, and the ordering is the point. | PHASE_19_PLAN.md:44; CC_C_SESSION_TASK_LIST.md:45 |
| 75 | B-PRICE-AGE-REFUSAL | 3b.f-b |  | Langston | observation | B-PRICE-AGE-REFUSAL — Owner CC-C, GATED on #971 | PHASE_19_PLAN.md:45; CC_C_SESSION_TASK_LIST.md:46 |
| 76 | B-XSTOCK-SESSION-FRESHNESS | 3b.f-c |  | Langston | open | B-XSTOCK-SESSION-FRESHNESS — ➕ ENTRY-SIDE ITEM FOLDED IN 2026-09-04 (Langston routed, alert 16500abc): xStock active fill blocked, ASTS/USD price 19,251 ms agai | PHASE_19_PLAN.md:46; CC_C_SESSION_TASK_LIST.md:25 |
| 77 | B-OBS-WINDOW-EVIDENCE-CAPTURE | 3b.f-d | #1044 | CC-C | observation | B-OBS-WINDOW-EVIDENCE-CAPTURE (#1044) — Owner CC-C (placed 2026-09-11 on Langston's #943 closing read, §13) | PHASE_19_PLAN.md:47; CC_C_SESSION_TASK_LIST.md:47; RUNNING_ISSUES.md:8793 |
| 78 | B-VENUE-QUIET-ALERTING | 3b.f-d |  | Kyle | open | B-VENUE-QUIET-ALERTING (#526, + Kyle's #994 FOLDED IN on Langston's ruling 2026-09-03) — Owner CC-B. Langston gates the design. | PHASE_19_PLAN.md:51; CC_B_SESSION_TASK_LIST.md:74 |
| 79 | B-EQUITY-RECONNECT-STALL-TIMER | 3b.f-e |  | Langston | unclear | B-EQUITY-RECONNECT-STALL-TIMER — Owner CC-C.  r1 OF THIS CELL READ "ROUTING TO LANGSTON" AND THAT WAS A RULE I HOLD AND BROKE: LANGSTON REVIEWS AND NEVER PUSHES | PHASE_19_PLAN.md:48 |
| 80 | B-DECIDED-INTENT-INDEX | 3b.g | #956 | CC-C | open | B-DECIDED-INTENT-INDEX (#956) — PRECEDES THE EXIT-PATH REDESIGN. Langston-directed 2026-08-30; he rules on the placement. | PHASE_19_PLAN.md:52; CC_C_SESSION_TASK_LIST.md:49; RUNNING_ISSUES.md:1462 |
| 81 | B-EXIT-BOOK-AGE-STAMP | 3b.h | #961 | CC-C | open | B-EXIT-BOOK-AGE-STAMP (#961 + #962) — PHASE A of XSTOCK_PRICING_PLAN.md. Owner CC-C. | PHASE_19_PLAN.md:53; CC_C_SESSION_TASK_LIST.md:104; RUNNING_ISSUES.md:1240 |
| 82 | B-TICKER-BBO-TRIGGER | 3b.h-1 |  | Langston | open | B-TICKER-BBO-TRIGGER — owner CC-C, Langston-placed 2026-09-07. | PHASE_19_PLAN.md:54; CC_C_SESSION_TASK_LIST.md:50 |
| 83 | B-UNIVERSE-REFRESH-ACTS | 3b.h-2 |  | CC-C | unclear | B-UNIVERSE-REFRESH-ACTS — owner CC-C. | PHASE_19_PLAN.md:55; CC_C_SESSION_TASK_LIST.md:51 |
| 84 | B-TSC-GUARD-DETERMINISM | 3b.h-3 | #1019 | CC-A | open | B-TSC-GUARD-DETERMINISM (#1019) — owner CC-A, Kyle-assigned 2026-09-07. | PHASE_19_PLAN.md:56; CC_A_SESSION_TASK_LIST.md:34; RUNNING_ISSUES.md:8287 |
| 85 | B-SYMBOL-CLASS-IDENTITY | 3b.h-4 | #1024 | CC-C | open | B-SYMBOL-CLASS-IDENTITY (#1024) — owner CC-C, KYLE-RULED 2026-09-09. | PHASE_19_PLAN.md:58; CC_C_SESSION_TASK_LIST.md:53; RUNNING_ISSUES.md:8397 |
| 86 | B-OHLC-FRAME-GUARD | 3b.h-6, 3b.h-7, 3b.h-8 | #1028 #1030 #1031 #1032 | CC-C | observation | B-OHLC-FRAME-GUARD (#1028) — owner CC-C, opened 2026-09-11 from critical alert b48a743f. (Position  confirmed by Langston.) | PHASE_19_PLAN.md:61; PHASE_19_PLAN.md:62; PHASE_19_PLAN.md:63 |
| 87 | B-DISPATCH-STAGING-VERIFY | 3b.i | #964 | CC-C | open | B-DISPATCH-STAGING-VERIFY (#964) — Owner CC-C | PHASE_19_PLAN.md:64; CC_C_SESSION_TASK_LIST.md:56; RUNNING_ISSUES.md:1177 |
| 88 | B-SCANNER-DEDUPE-DEAD-TABLE | 3b.j |  | Langston | unclear | B-SCANNER-DEDUPE-DEAD-TABLE (#965) — Owner CC-C | PHASE_19_PLAN.md:65; CC_C_SESSION_TASK_LIST.md:57 |
| 89 | B-CHANGE-CLASS-PARSER | 3b.k |  | CC-C | unclear | B-CHANGE-CLASS-PARSER (#968) — Owner CC-C | PHASE_19_PLAN.md:66; CC_C_SESSION_TASK_LIST.md:58 |
| 90 | B-CHECKER-CORE-PATHS | 3b.k-a | #993 | Langston | open | B-CHECKER-CORE-PATHS (#993) — Owner CC-A (proposed — the governance checker's owner; to accept or re-home) | PHASE_19_PLAN.md:67; RUNNING_ISSUES.md:7473 |
| 91 | B-TWO-CACHE-INTENT | 3b.l |  | Kyle | unclear | B-TWO-CACHE-INTENT (#971) — Owner CC-C | PHASE_19_PLAN.md:68; CC_C_SESSION_TASK_LIST.md:59 |
| 92 | B-PROVENANCE-LOSS-CENSUS | 3b.m |  | CC-C | unclear | B-PROVENANCE-LOSS-CENSUS (#976) — Owner CC-C | PHASE_19_PLAN.md:69; CC_C_SESSION_TASK_LIST.md:60 |
| 93 | F-G-2 | 3c |  | Kyle | observation | F-G-2 — B-EXIT-TRANSACTABLE-SIDE — the ORIGINAL batch | PHASE_19_PLAN.md:70; CC_C_SESSION_TASK_LIST.md:20 |
| 94 | B-DEPLOY-REF-DECLARATION | 3c.a | #988 | CC-C | open | B-DEPLOY-REF-DECLARATION (#988) | PHASE_19_PLAN.md:71; CC_C_SESSION_TASK_LIST.md:61; RUNNING_ISSUES.md:7452 |
| 95 | B-MIN-STOP-DISTANCE | 3d |  | Langston | unclear | B-MIN-STOP-DISTANCE | PHASE_19_PLAN.md:72; CC_C_SESSION_TASK_LIST.md:62 |
| 96 | B-GUARD-COVERAGE-AUDIT | 3e | #919 | CC-C | open | B-GUARD-COVERAGE-AUDIT (#919) | PHASE_19_PLAN.md:73; CC_C_SESSION_TASK_LIST.md:63; RUNNING_ISSUES.md:5417 |
| 97 | B-VALIDATE-OBSERVABILITY | 3f | #922 | CC-C | open | B-VALIDATE-OBSERVABILITY (#922) | PHASE_19_PLAN.md:74; CC_C_SESSION_TASK_LIST.md:64; RUNNING_ISSUES.md:5517 |
| 98 | B-POST-GRID-MUTATION-CENSUS | 3f.b | #923 | Kyle | open | B-POST-GRID-MUTATION-CENSUS (#923, INVESTIGATION ONLY — NO CODE) | PHASE_19_PLAN.md:75; RUNNING_ISSUES.md:5533 |
| 99 | B-GRID-LIVE-PATH-PARITY | 3g | #939 | CC-C | open | B-GRID-LIVE-PATH-PARITY (#939) | PHASE_19_PLAN.md:76; CC_C_SESSION_TASK_LIST.md:65; RUNNING_ISSUES.md:5877 |
| 100 | B-INTENT-ENTRY-PARITY | 3h | #928 | CC-C | open | B-INTENT-ENTRY-PARITY (#928 + #929) | PHASE_19_PLAN.md:77; CC_C_SESSION_TASK_LIST.md:66; RUNNING_ISSUES.md:6149 |
| 101 |  | 3h.b |  | CC-C | open | DEAD EXIT LIMB — trading-engine + strategy-engine (F-G-2 Step-2 FINDING A1; Langston-ruled 2026-08-29 as a NAMED item, not implied by 3h's adjacency) | PHASE_19_PLAN.md:78 |
| 102 | B-TARGET-FABRICATION | 3i | #927 | CC-C | open | B-TARGET-FABRICATION (#927) | PHASE_19_PLAN.md:79; CC_C_SESSION_TASK_LIST.md:67; RUNNING_ISSUES.md:6123 |
| 103 | B-STRING-TRUTHINESS-GUARDS | 3i.b | #930 | CC-C | open | B-STRING-TRUTHINESS-GUARDS (#930) | PHASE_19_PLAN.md:80; CC_C_SESSION_TASK_LIST.md:68; RUNNING_ISSUES.md:6112 |
| 104 | B-CANONICAL-FREEZE | 3i.c | #948 | CC-C | open | B-CANONICAL-FREEZE (#948) — governance hygiene, NOT on the trading path | PHASE_19_PLAN.md:81; CC_C_SESSION_TASK_LIST.md:69; RUNNING_ISSUES.md:1677 |
| 105 | B-FUNNEL-PERP-CLASSES | 3j | #925 | CC-C | open | B-FUNNEL-PERP-CLASSES (#925, amended) | PHASE_19_PLAN.md:82; CC_C_SESSION_TASK_LIST.md:70; RUNNING_ISSUES.md:6231 |
| 106 | B-VENUE-PAIRS-REINIT | 3k | #933 | CC-C | open | B-VENUE-PAIRS-REINIT (#933) | PHASE_19_PLAN.md:83; CC_C_SESSION_TASK_LIST.md:71; RUNNING_ISSUES.md:6101 |
| 107 | B-VPG-ROW-ALIGN | 3l | #934 | CC-C | open | B-VPG-ROW-ALIGN (#934) | PHASE_19_PLAN.md:84; CC_C_SESSION_TASK_LIST.md:72; RUNNING_ISSUES.md:6087 |
| 108 | B-RATE-LIMITER-RESET-DISPOSITION | 3m | #936 | CC-C | open | B-RATE-LIMITER-RESET-DISPOSITION (#936) | PHASE_19_PLAN.md:85; CC_C_SESSION_TASK_LIST.md:73; RUNNING_ISSUES.md:6069 |
| 109 | B-PATTERN-ENUM-DRIFT | 3m-ENUM |  | CC-C | unclear | RULED AN ITEM, NOT A BATCH (Langston 2026-09-13) — reachable, so not latent: pattern-recognizer.ts:461 emits ABCD, volatility_edge consumes it, both sinks rejec | PHASE_19_PLAN.md:86 |
| 110 | B-PRICE-SIDE-BY-JOB | 3n, 3n.q2 | #1047 #1074 | CC-C | observation | B-PRICE-SIDE-BY-JOB — Owner CC-C. KYLE DELEGATED THE DECISION TO CC-C + LANGSTON, 2026-09-03, and his reasoning is the binding constraint: "I want to see the tr | PHASE_19_PLAN.md:87; PHASE_19_PLAN.md:103; CC_B_SESSION_TASK_LIST.md:62 |
| 111 | B-VTS-MARK-SIDE | 3n.0 |  | Langston | observation | B-VTS-MARK-SIDE — owner CC-C, Langston-ruled 2026-09-07 (§9.4 disposition 3). | PHASE_19_PLAN.md:57; CC_C_SESSION_TASK_LIST.md:52 |
| 112 | B-ORPHAN-ROOT-SCANNER | 3n.a |  | CC-C | unclear | B-ORPHAN-ROOT-SCANNER — Owner CC-C. Surfaced by Langston while verifying B-PRICE-SIDE-BY-JOB's entry-point census; disposition (5) on inspection, CONFIRMED at t | PHASE_19_PLAN.md:88; CC_C_SESSION_TASK_LIST.md:74 |
| 113 |  | 3n.b |  | CC-C | unclear | B-ORPHAN-LEVEL-TABLES — Owner CC-C. Surfaced by the P3 level census, 2026-09-04; disposition (5) with evidence, not inferred from the names. | PHASE_19_PLAN.md:89 |
| 114 |  | 3n.c |  | CC-C | unclear | B-TRAILING-STATE-DURABILITY — Owner CC-C. Surfaced by the P3 in-memory pass, 2026-09-04. NOT folded into 3n — it is a DURABILITY question, not a price-basis one | PHASE_19_PLAN.md:90 |
| 115 | B-GRID-REFUSAL-RATE | 3n.d |  | CC-C | unclear | B-GRID-REFUSAL-RATE — Owner CC-C. Surfaced by F-G-1's §3a co-denominator at the close read, 2026-09-04. SYMPTOM, NOT CAUSE. | PHASE_19_PLAN.md:91; CC_C_SESSION_TASK_LIST.md:77 |
| 116 | B-CANONICAL-CORPUS-ACCURACY | 3n.e | #733 | CC-C | open | B-CANONICAL-CORPUS-ACCURACY — Owner CC-C. #733, open since 2026-08-21; PLACED HERE 2026-09-06 because its entry carried a DUE DATE (2026-09-04) instead of a pos | PHASE_19_PLAN.md:92; CC_C_SESSION_TASK_LIST.md:78; RUNNING_ISSUES.md:4575 |
| 117 | B-DIAG-READ-INTEGRITY | 3n.f |  | CC-C | unclear | B-DIAG-READ-INTEGRITY (#1014) — Owner CC-C. Surfaced 2026-09-06 by rate-limiting my own measurement of 3n, then reading the status code instead of the body. | PHASE_19_PLAN.md:93; CC_C_SESSION_TASK_LIST.md:79 |
| 118 | B-QUOTE-PEG-DEVIATION-WATCH | 3n.g |  | CC-C | open | B-QUOTE-PEG-DEVIATION-WATCH — Owner CC-C. Placed as Langston’s blocking condition 4 on row 8f’s predicate, 2026-09-12. | PHASE_19_PLAN.md:94; CC_C_SESSION_TASK_LIST.md:80 |
| 119 | B-QUOTE-LEG-INTEGRITY | 3n.h |  | CC-C | unclear | B-QUOTE-LEG-INTEGRITY (#1050) — Owner CC-C. Placed 2026-09-12 as Langston's sibling to 3n.g, after he BOUNCED my framing of it as an 8f implementation detail. | PHASE_19_PLAN.md:95; CC_C_SESSION_TASK_LIST.md:81 |
| 120 | B-QUOTE-ADMISSION-LEGACY-SWEEP | 3n.i | #937 | CC-C | open | B-QUOTE-ADMISSION-LEGACY-SWEEP (#937) — Owner CC-C. Placed 2026-09-12: Langston's precondition that 8f may not ship an admission gate without stating which of t | PHASE_19_PLAN.md:96; CC_C_SESSION_TASK_LIST.md:82; RUNNING_ISSUES.md:5968 |
| 121 | B-HORIZON-GRID-COMPARABILITY | 3n.j |  | Langston | done? | B-HORIZON-GRID-COMPARABILITY — Owner CC-B (the only non-CC-C member of this cluster). Placed 2026-09-12 as Langston's disposition on a defect I found in the hor | PHASE_19_PLAN.md:97 |
| 122 | B-FAMILY-POOL-REACHABILITY | 3n.k | #1052 | CC-C | open | B-FAMILY-POOL-REACHABILITY (#1052) — Owner CC-C. Placed 2026-09-12 from Langston BLOCKER-2 at OBJ-8 Step 4. | PHASE_19_PLAN.md:98; CC_C_SESSION_TASK_LIST.md:83; RUNNING_ISSUES.md:9548 |
| 123 | B-REST-SIDES-TO-CACHE | 3n.l |  | CC-C | observation | B-REST-SIDES-TO-CACHE (#1056) — Owner CC-C. PLACED BY LANGSTON, Step-4 rider 2 on row 8c P1, 2026-09-13.  THE REST ADAPTER PARSES THE BID AND ASK, LOGS THEM, AN | PHASE_19_PLAN.md:99; CC_C_SESSION_TASK_LIST.md:23; CC_C_SESSION_TASK_LIST.md:84 |
| 124 | B-BOOK-SUBSCRIPTION-REACH | 3n.m |  | Langston | unclear | B-BOOK-SUBSCRIPTION-REACH (#1060) — Owner CC-C. KYLE DIRECTIVE 2026-09-13, after he challenged the premise of row 8c.  THE ORDER BOOK IS THE PREFERRED PRICE SOU | PHASE_19_PLAN.md:100; CC_C_SESSION_TASK_LIST.md:85 |
| 125 | B-DECISION-INSTANT-QUOTE | 3n.n |  | CC-C | open | B-DECISION-INSTANT-QUOTE (#1060 am. 8) — Owner CC-C.  THE SIDE-VS-FRESHNESS RANKING IS UNMEASURABLE FROM THE EXIT-PROVENANCE COLUMNS AT ANY THRESHOLD — NOT "HEL | PHASE_19_PLAN.md:101; CC_C_SESSION_TASK_LIST.md:86 |
| 126 | B-CRYPTO-MARK-AGE-GATE | 3n.o |  | CC-C | open | B-CRYPTO-MARK-AGE-GATE — Owner CC-C.  PREMISE REWRITTEN 2026-09-14 (Langston BLOCKER on 8a r3, re-derived by me at 6b9155e9e) — THE ROW SURVIVES, ITS ORIGINAL P | PHASE_19_PLAN.md:124; CC_C_SESSION_TASK_LIST.md:95 |
| 127 | B-EXIT-TICKER-LEG-ADAPTER-SIDES | 3n.p |  | CC-C | open | B-EXIT-TICKER-LEG-ADAPTER-SIDES — Owner CC-C. PLACED 2026-09-13 AS LANGSTON'S CONDITION 5 ON THE 8a-P1 TICKER-LEG RULING: he struck my "it is a P2 question" as | PHASE_19_PLAN.md:125; CC_C_SESSION_TASK_LIST.md:96 |
| 128 | B-MAKER-FILL-TRANSACTABLE-SIDE | 3n.q |  | CC-C | observation | B-MAKER-FILL-TRANSACTABLE-SIDE — Owner CC-C. ➕ STATUS 2026-09-22: BUILT as 8a-P3 (crypto, both lanes, deployed 2026-09-15) and 8a-P4b X1/X2 (paper xStock, deplo | PHASE_19_PLAN.md:102 |
| 129 | B-VTS-NO-DECISION-VALVE | 3n.q3 |  | CC-C | unclear | B-VTS-NO-DECISION-VALVE — Owner CC-C. Langston, 8a-P3 Step 8 C2, 2026-09-18: a refused VTS exit has no time bound, and the trade ages toward the 7-day max-hold, | PHASE_19_PLAN.md:104; CC_C_SESSION_TASK_LIST.md:88 |
| 130 | B-EXIT-LINE-IDENTITY | 3n.q4 |  | CC-C | unclear | B-EXIT-LINE-IDENTITY — Owner CC-C. The trade id and asset class on the [11.6][Exit] line (the only close-reason carrier) and on the VTS no-decision streak line | PHASE_19_PLAN.md:105; CC_C_SESSION_TASK_LIST.md:89 |
| 131 | B-BOOK-STATE-RING-INDEPENDENT-BOUND | 3n.q5 |  | CC-C | unclear | B-BOOK-STATE-RING-INDEPENDENT-BOUND — Owner CC-C. Candidate C of 8a-P4a: a release bound for a seed-implausible book-state chain that does NOT depend on the ret | PHASE_19_PLAN.md:106; CC_C_SESSION_TASK_LIST.md:90 |
| 132 | B-EXIT-DECISION-RUNG-STAMP | 3n.q6 | #1064 | CC-C | open | B-EXIT-DECISION-RUNG-STAMP (#1064) — Owner CC-C. Placed under 3n, runs AFTER 8a-P4c (inside 3n.q2), so one fix serves both classes. Langston, 8a-P4b Step 4 COND | PHASE_19_PLAN.md:107; CC_C_SESSION_TASK_LIST.md:91; RUNNING_ISSUES.md:9586 |
| 133 | B-XSTOCK-BID-TRIGGER-RELAND | 3n.q7 | #1065 | CC-C | open | B-XSTOCK-BID-TRIGGER-RELAND — Owner CC-C. The xStock stop/target TRIGGER back on the transactable bid, after 8a-P4b Step 9 C1 took it off (a symmetric post-clos | PHASE_19_PLAN.md:109; CC_C_SESSION_TASK_LIST.md:93; RUNNING_ISSUES.md:9593 |
| 134 | B-BOOK-STATE-RESTART-DURABLE | 3n.q8 | #1066 | CC-C | open | B-BOOK-STATE-RESTART-DURABLE (#1066) — Owner CC-C. The xStock book-state guard's outside datum — the retained spread ring (SIM S25b _retainedSpreads) — survives | PHASE_19_PLAN.md:108; CC_C_SESSION_TASK_LIST.md:92; RUNNING_ISSUES.md:9601 |
| 135 | B-TSC-COVERS-TESTS | 3n.r |  | Langston | unclear | B-TSC-COVERS-TESTS — Owner CC-C.  A REQUIRED FIELD DOES NOT COMPILE-FORCE A TEST FIXTURE, BECAUSE tsconfig EXCLUDES TEST FILES — AND IT FIRED TWICE IN ONE BATCH | PHASE_19_PLAN.md:123; CC_C_SESSION_TASK_LIST.md:94 |
| 136 | B-PRICE-DOC-CONSOLIDATE | 3n.s |  | Kyle | unclear | B-PRICE-DOC-CONSOLIDATE — Owner CC-B. Combine PRICE_FEED_MAP.md with PRICING_DATA_ARCHITECTURE.md into ONE canonical price-feed governance document (Kyle 2026-0 | PHASE_19_PLAN.md:110; CC_B_SESSION_TASK_LIST.md:21 |
| 137 | B-FEED-BY-SITUATION-AUDIT | 3n.t |  | CC-B | unclear | B-FEED-BY-SITUATION-AUDIT — Owner CC-B. Kyle 2026-09-15: for EVERY situation — path (paper mode · VTS · live mode) × asset class (crypto · xStock) × the job the | PHASE_19_PLAN.md:111; CC_B_SESSION_TASK_LIST.md:17 |
| 138 | B-FEED-MISMATCH-FIX | 3n.u, 3n.u4 | #1067 | CC-B | observation | B-FEED-MISMATCH-FIX — the fix batch for every mismatch 3n.t finds.  Overlaps 3n (B-PRICE-SIDE-BY-JOB, CC-C + Langston own the side decision) — so ownership and | PHASE_19_PLAN.md:112; PHASE_19_PLAN.md:115; CC_B_SESSION_TASK_LIST.md:22 |
| 139 | B-ENTRY-LEVEL-RECHECK | 3n.u2 |  | Langston | unclear | B-ENTRY-LEVEL-RECHECK — Owner CC-B. Langston Q4 ruling on B-FEED-MISMATCH-FIX Step 2, 2026-09-18: split out as its own subject.  NOTHING RE-CHECKS A SIGNAL'S LE | PHASE_19_PLAN.md:113; CC_B_SESSION_TASK_LIST.md:23 |
| 140 | B-CLOSE-WRITER-COSTS | 3n.u3 |  | CC-B | unclear | B-CLOSE-WRITER-COSTS — Owner CC-B. Langston Step-4 findings on B-FEED-MISMATCH-FIX, 2026-09-18, homed not folded: (1) closePosition still DELETES a position who | PHASE_19_PLAN.md:114; CC_B_SESSION_TASK_LIST.md:24 |
| 141 | B-REACH-BASELINE-ADJUST | 3n.v, 3n.v2, 3n.v3, 3n.v4 | #1068 #1069 #1070 #1071 | CC-B | observation | B-REACH-BASELINE-ADJUST — Owner CC-B.  KYLE RULED 2026-09-15: the one-way lock at ADJUSTMENT_FRAMEWORK.md:18 ("no per-strategy row looser than its class default | PHASE_19_PLAN.md:116; PHASE_19_PLAN.md:117; PHASE_19_PLAN.md:118 |
| 142 | B-EXIT-MAKER-VS-TAKER-REVIEW | 3n.w |  | CC-B | observation | B-EXIT-MAKER-VS-TAKER-REVIEW — Owner CC-B. Kyle's observation 2026-09-15: in paper mode many maker exits are profitable and taker target exits all look negative | PHASE_19_PLAN.md:121; CC_B_SESSION_TASK_LIST.md:18 |
| 143 |  | 3n.x |  | Kyle | unclear | REVIEW — NECESSARY VS NICE-TO-HAVE FOR LIVE MODE — Kyle 2026-09-15: list what is left in Phase 19 and Phase 25, split into what is NECESSARY to judge whether pa | PHASE_19_PLAN.md:122 |
| 144 | B-TOTAL-DRAWDOWN-WARNING | 3z |  | CC-C | open | B-TOTAL-DRAWDOWN-WARNING — owner CC-C, KYLE-RULED 2026-09-09, placed at the END of Phase 19. | PHASE_19_PLAN.md:59; CC_C_SESSION_TASK_LIST.md:101 |
| 145 |  | 4 |  |  | unclear | xStock pricing latency + staleness/reconnect fitness verified for execution | PHASE_19_PLAN.md:483 |
| 146 | B-KILLSWITCH-DENOMINATOR | 4.b | #618 | CC-C | open | B-KILLSWITCH-DENOMINATOR (#618 remaining legs) — Owner CC-C | PHASE_19_PLAN.md:127; CC_C_SESSION_TASK_LIST.md:98; RUNNING_ISSUES.md:2566 |
| 147 |  | 5 |  |  | unclear | Kraken validate=true round-trip smoke passed (Kraken has NO spot paper-order system — P19-B2 / rule-20 correction; validate-only is the real-venue contact) | PHASE_19_PLAN.md:484 |
| 148 | B-SCANNER-EGRESS-NORMALISE | 5 |  | Langston | done? | B-SCANNER-EGRESS-NORMALISE | PHASE_19_PLAN.md:128 |
| 149 | B-NONFIAT-QUOTE-DENOMINATION | 5.a |  | Kyle | unclear | B-NONFIAT-QUOTE-DENOMINATION (#966) — Owner CC-C | PHASE_19_PLAN.md:129; CC_C_SESSION_TASK_LIST.md:99 |
| 150 | B-PRICE-FLOOR-REVIEW | 5.b |  | Kyle | unclear | B-PRICE-FLOOR-REVIEW (#967) — Owner CC-C, DECISION IS KYLE'S | PHASE_19_PLAN.md:130; CC_C_SESSION_TASK_LIST.md:100 |
| 151 |  | 6 |  |  | unclear | All §19.0.5 capture hooks live (pre-filter, RTB TTL, TCL, paper admit) | PHASE_19_PLAN.md:485 |
| 152 |  | 7 |  |  | open | F-D — VTS accessor + isolation | PHASE_19_PLAN.md:132 |
| 153 |  | 7 |  |  | done? | Loss-budget auto-trip armed AND force-trip-tested (trip + recovery path proven) | PHASE_19_PLAN.md:486 |
| 154 |  | 8 |  |  | open | F-E — fill-integrity detector + disposition | PHASE_19_PLAN.md:133 |
| 155 |  | 8 |  |  | done? | #213 legacy /live-trading routes confirmed inert (gate-bypassing legacy route + false "live-ON" broadcast are worse latents once execution machinery is hot) | PHASE_19_PLAN.md:487 |
| 156 |  | 9 |  |  | open | F-F(b) — THE RESET GATE | PHASE_19_PLAN.md:134 |
| 157 |  | 9 |  |  | unclear | Paper monitoring screens (both classes) merged + reviewed against fixture data | PHASE_19_PLAN.md:488 |
| 158 |  | B-BURN-THRESHOLD-BASIS |  | CC-INFRA | unclear | The credit-burn alarm's thresholds are fractions of the monthly cap, while the budget is designed to consume 99.3% of that cap — so a month spending exactly its | PHASE_19_PLAN.md:258 |
| 159 |  | B-DIAG-387 |  | Langston | done? | xStock filter-diagnostics Net-EV-floor reject counter fix (#387) — the "Net EV Below Floor" dashboard tile read 0 forever (the #386-misleading bug); pulled in b | PHASE_19_PLAN.md:217 |
| 160 |  | B-FILTER-DIAG-STANDARDIZE |  | Langston | unclear | All six Filter-Diagnostics tabs standardized (VTS / paper / live x crypto / xStock) - Kyle-directed after he rejected B-FILTER-DIAG-PAPER's central objective. S | PHASE_19_PLAN.md:242 |
| 161 | B-TOKEN-WATCH | B-HELSINKI-MOUNT-WATCH, B-REVIEWER-LOOP-AVAILABILITY, B-TOKENWATCH-OBSERVED-AT, B-TOKENWATCH-PAIR-SELECT | #921 #924 #926 | CC-INFRA | observation | The timestamp every observation is indexed by is a CALLER'S CLOCK, not the moment of the reading. A caller reads the clock once and stamps it on every row it wr | PHASE_19_PLAN.md:248; PHASE_19_PLAN.md:249; PHASE_19_PLAN.md:250 |
| 162 |  | B-SSH-KEY-CENSUS (investigation only) |  | Kyle | unclear | Two ungoverned keys can log in as the account that owns the trading application, and the System Impact Map cites a mitigation that covers only a third one. Meas | PHASE_19_PLAN.md:252 |
| 163 |  | B-TEC-REGIME-PARAM-REMOVAL |  | Langston | done? | Dead regime read removed from the active exit path (evaluateTECExit context). Homed by #602 as "one dead cast"; the required census found THREE dead reads, and | PHASE_19_PLAN.md:230 |
| 164 |  | B-TEC-SELFHEAL (re-scoped from ~~B-XSTOCK-TEC-WARMUP~~) |  | Langston | unclear | #349 — TEC config staleness fence self-heal (refresh-before-throw) + VTS exit-loop per-trade isolation. The reopen-warm framing was DROPPED at the deeper diagno | PHASE_19_PLAN.md:218 |
| 165 | P19-B15 | B-TEC-STATE-DURABILITY | #678 | Kyle | open | Engine trailing-state durability — the silent-zero-states defect (#678) and the rehydrate seed gap (#677). On restart the engine reads every open position's lad | PHASE_19_PLAN.md:244; RUNNING_ISSUES.md:3260 |
| 166 |  | B-TOKEN-WATCH |  | Langston | observation | Capture-only observation feed over new Solana token launches — births recorded at creation, then observed on a fixed grid, so that at 90 days we hold the surviv | PHASE_19_PLAN.md:246 |
| 167 | B-SSH-KEY-CENSUS | B-TSC-GUARD-CWD |  | CC-B | unclear | The push guard runs from the shell's working directory, so pushing from a subdirectory fakes the broken-parse alarm and refuses the push. Measured same-commit/s | PHASE_19_PLAN.md:254 |
| 168 | B-REGIME-INPUTS-LIVE | B-VOLATILITY-CACHE-RETIRE |  | Langston | open | Retire the dead volatility cache + 0.015 fallback the regime-gate fix left behind — B-REGIME-INPUTS-LIVE's OBJ-4, never done (#543 residual; rule 18). | PHASE_19_PLAN.md:231; CC_B_SESSION_TASK_LIST.md:130 |
| 169 | B-CATALOG-1 | GOV-ARC (#668) | #672 | CC-A | open | The governance-standardization arc — THE TRACKED HOME (Kyle-directed 2026-08-07 after it drifted unnoticed). Five pieces, CC-A: rules-file slimming (1a+1b CLOSE | PHASE_19_PLAN.md:229; CC_A_SESSION_TASK_LIST.md:60; CC_A_SESSION_TASK_LIST.md:143 |
| 170 |  | P19-B1 |  | Langston | done? | Test-suite cleanup | PHASE_19_PLAN.md:190 |
| 171 |  | P19-B10 |  |  | open | Performance + exit verification | PHASE_19_PLAN.md:235 |
| 172 |  | P19-B11 |  |  | open | xStock safety additions | PHASE_19_PLAN.md:236 |
| 173 |  | P19-B13 |  |  | open | Stock-characteristics data feeds | PHASE_19_PLAN.md:238 |
| 174 |  | P19-B14 |  |  | unclear | Boot Readiness Coordinator | PHASE_19_PLAN.md:239 |
| 175 |  | P19-B15 |  | Langston | open | Test-in-paper / bypass-in-live capability gating (Kyle directive 2026-06-17, #322) | PHASE_19_PLAN.md:240 |
| 176 |  | P19-B2 |  | Langston | done? | Live-mode build-approach decision | PHASE_19_PLAN.md:191 |
| 177 |  | P19-B3 |  | Langston | unclear | Known-broken active-path repairs | PHASE_19_PLAN.md:192 |
| 178 |  | P19-B4 |  | Langston | unclear | xStock wire-in (merged) | PHASE_19_PLAN.md:193 |
| 179 |  | P19-B4b (D5) |  |  | done? | Paper/live split-brain isolation | PHASE_19_PLAN.md:194 |
| 180 |  | P19-B4b.1 |  | Langston | done? | Paper fill fidelity (depth-walked fill + partials + #295 gate) | PHASE_19_PLAN.md:195 |
| 181 |  | P19-B4b.2 |  | Langston | done? | Dead paper-fill machinery sweep (#300) | PHASE_19_PLAN.md:196 |
| 182 |  | P19-B5a |  | Langston | unclear | Data-capture completion — reject/admit hooks (§19.0.5; the HARD 19-3 precondition) | PHASE_19_PLAN.md:197 |
| 183 |  | P19-B5b |  | Langston | unclear | Data-capture completion — #94 xStock macro snapshot + #86 home decision | PHASE_19_PLAN.md:198 |
| 184 |  | P19-B5c |  | Langston | unclear | Continuous Q-D probe (#86) — xstock_qd_probe_history | PHASE_19_PLAN.md:199 |
| 185 |  | P19-B6 |  | Langston | unclear | Daily loss-budget kill switch | PHASE_19_PLAN.md:200 |
| 186 |  | P19-B6.10 |  | Langston | unclear | Retire legacy guardrails-v1 (old guardrails table + PUT /api/guardrails + upsertGuardrails throw-stub) — §15 cleanup + caller migration | PHASE_19_PLAN.md:227 |
| 187 |  | P19-B6.5 |  | Langston | unclear | Crypto active-pipeline RESURRECTION (Kyle 2026-06-15, #235) | PHASE_19_PLAN.md:201 |
| 188 |  | P19-B6.5a |  | Langston | unclear | Per-asset-class active gate (the Option-C infra) | PHASE_19_PLAN.md:202 |
| 189 |  | P19-B6.5b |  | Langston | unclear | Crypto audit + dry-run + fill-parity (proof) | PHASE_19_PLAN.md:203 |
| 190 |  | P19-B6.5c |  | Langston | open | Crypto signal→ready-to-buy repair (the 2 B6.5b-dry-run breaks) | PHASE_19_PLAN.md:204 |
| 191 |  | P19-B6.5d |  | Langston | unclear | Asset-class stamp integrity (carry-the-stamp across all 35 resolve sites; clears the live A/EUR classify alert) | PHASE_19_PLAN.md:205 |
| 192 | P19-B7 | P19-B6.5e |  | Langston | unclear | TCL→paper-execution-engine open-path silent-failure repair + gate-10 closed-lifecycle owner (#325) | PHASE_19_PLAN.md:206 |
| 193 |  | P19-B6.5f |  | Langston | unclear | Canonicalizer quote-currency completeness (B6.5e dry-run finding) | PHASE_19_PLAN.md:207 |
| 194 |  | P19-B6.5g |  |  | unclear | EV-input integrity + gate-10 lifecycle proof (B6.5e diagnosis successor; OWNS gate-10) | PHASE_19_PLAN.md:222 |
| 195 |  | P19-B6.6 |  | Langston | unclear | Price-discovery-liveness fill gate (P19-B4a C3 / #236) | PHASE_19_PLAN.md:223 |
| 196 |  | P19-B6.7 |  | Langston | unclear | Vestigial 2nd-WS market-data subsystem cleanup (#301) | PHASE_19_PLAN.md:224 |
| 197 |  | P19-B6.8 |  | Kyle | unclear | Per-mode guardrail completeness — paper-specific guardrail set (Kyle directive 2026-06-16) | PHASE_19_PLAN.md:226 |
| 198 |  | P19-B6.9 |  | Langston | unclear | Scanner short-universe fix (#396) + parity-gate uptime-trap fix (#398) — pre-Phase-21 go-live-path hardening | PHASE_19_PLAN.md:225 |
| 199 |  | P19-B7 |  | Langston | unclear | Ranking fix + maker/taker shared service + crypto lifecycle proof (the opener/engine work) | PHASE_19_PLAN.md:228 |
| 200 |  | P19-B8 |  | Kyle | unclear | Paper monitoring screens (BOTH classes) + THE SWITCH-ON + the acceptance proofs P19-B8-AC1 (crypto) / P19-B8-AC2 (xStock; was "gate-10"/"gate-10x") | PHASE_19_PLAN.md:232 |
| 201 |  | P19-B9 |  | Langston | open | Paper trading run + audit | PHASE_19_PLAN.md:234 |
| 202 |  | reorg-B2 |  | Langston | unclear | Rung-1 — per-class target-floor + universal RR gate + reachability gate, BOTH classes (the plumbing for crypto opening; reorg build-board B2) | PHASE_19_PLAN.md:208 |
| 203 |  | reorg-B2.1 |  | Langston | observation | Gates → strategies' shared guard; DROP the floor-lift; ONE per-class RR SSOT + per-class reachability (Kyle 2026-06-21 placement question — "set targets right i | PHASE_19_PLAN.md:209 |
| 204 |  | reorg-B2.2 |  | Langston | done? | Tracker PERSISTENCE (unfreeze/crash-proof) + VTS-tab RR-gate VISIBILITY + normalizer-RETIRE (the window-gated reorg-B2.1 OBJ-5/6 split out; #374) | PHASE_19_PLAN.md:210 |
| 205 |  | reorg-B2.3 |  | Kyle | done? | Per-strategy × per-class minRR BASELINE — set from each class's OWN per-class data, NOT inherited (Kyle directive 2026-06-23) | PHASE_19_PLAN.md:211 |
| 206 |  | reorg-B3 |  | Langston | observation | #233 EV-input thread — DI + dbsScore to the open-gate kernel (the reorg-board form of B6.5g's #233 core; audit-reshaped: accuracy + strong-trend parity, NOT a c | PHASE_19_PLAN.md:212 |
| 207 |  | reorg-B3.1 |  | Langston | observation | #378 di_at_open reads carried at-queue DI + #379 rtb-metrics verbatim-minus-redaction (the two small reorg-B3 §13 follow-ups) | PHASE_19_PLAN.md:213 |
| 208 |  | reorg-B3.2 |  | Langston | observation | VTS gate = TAG-DON'T-DROP for quality gates (un-strangle the VTS learning engine) (Kyle 2026-06-24 — VTS opens collapsed 95-97% from the reorg-B2 gate) | PHASE_19_PLAN.md:214 |
| 209 |  | reorg-B3.3 |  | Langston | unclear | Strategy-level VTS tag-don't-drop — the CORRECTED un-strangle (reorg-B3.2 was inert: the 18 strategies hard-drop at signal-gen, upstream of the vts-runner norma | PHASE_19_PLAN.md:215 |
| 210 |  | reorg-B3.3x |  | Langston | observation | xStock VTS un-strangle — UNIFY onto the shared normalizer (Langston Option B) (#382) | PHASE_19_PLAN.md:216 |
| 211 |  | reorg-B3.3y |  | Langston | observation | Symmetric invalid_geometry — drop target<=entry / reward<=0 longs (validity, not quality) — the validity gap reorg-B3.3 EXPOSED (RUNNING_ISSUES #383) | PHASE_19_PLAN.md:219 |
| 212 |  | reorg-B4 |  | Langston | done? | Shadow-trade telemetry layer — selection-quality data engine (feeds reorg-B5) — open a counterfactual shadow trade for EVERY RTB-pool member each promotion cycl | PHASE_19_PLAN.md:220 |
| 213 |  | reorg-B4.1 |  | Langston | done? | Shadow-trading VISIBILITY tab + per-cycle pool-membership record — the tab to see shadow results (trading page, after Trade History) + the per-cycle-capture fix | PHASE_19_PLAN.md:221 |
| 214 |  |  | #92 |  | unclear | Wire xstockSpotScanner through signal-orchestration | PHASE_19_PLAN.md:502 |
| 215 |  |  | #137 |  | unclear | Active-trading-path restoration intake (54 files / 231 errors + routes/storage share; baseline tags still TBD) | PHASE_19_PLAN.md:503 |
| 216 |  |  | #139 |  | unclear | vts-runner 9 remaining throwing resolveAssetClass sites | PHASE_19_PLAN.md:504 |
| 217 |  |  | #153 |  | unclear | xstock 0.50 pattern-pool-cap placeholder validation | PHASE_19_PLAN.md:505 |
| 218 |  |  | #138 |  | unclear | Hybrid first-confluence label verification (fires on first confluence under active trading) | PHASE_19_PLAN.md:506 |
| 219 |  |  | #95 |  | done? | xStock real-time WS pricing adapter | PHASE_19_PLAN.md:507 |
| 220 |  |  | #96 |  | unclear | Sector-aware portfolio-cluster prevention | PHASE_19_PLAN.md:508 |
| 221 |  |  | #97 |  | unclear | xStock characteristics inventory (earnings/market-cap/P/E/IV) | PHASE_19_PLAN.md:509 |
| 222 |  |  | #83 |  | unclear | Boot Readiness Coordinator (boot-ordering half) | PHASE_19_PLAN.md:510 |
| 223 |  |  | #236 |  | unclear | xStock liquid-fill-window holiday/half-day hole → price-discovery-liveness gate | PHASE_19_PLAN.md:511 |
| 224 |  |  | #237 |  | open | RTB asset_class SET NOT NULL deferred (vacuous soak while dormant) | PHASE_19_PLAN.md:512 |
| 225 |  |  | #238 |  | unclear | C5 default-open: strategy_gates seed + B7b non-empty assertion | PHASE_19_PLAN.md:513 |
| 226 |  |  | #153 |  | unclear | xstock pattern-pool-cap | PHASE_19_PLAN.md:514 |
| 227 |  |  | #221 |  | unclear | getTopSignal cross-class sort on clamped finalScore (return-ceiling) | PHASE_19_PLAN.md:515 |
| 228 |  |  | #231 |  | unclear | orchestrator active-signal ablation integer-signalId gap | PHASE_19_PLAN.md:516 |
| 229 |  |  | #56 residue |  | unclear | §19.0.5 promoted capture hooks (FX5 pre-filter + active-path SQE/RTB) | PHASE_19_PLAN.md:517 |
| 230 |  |  | #86 |  | unclear | Continuous Q-D friction probe + dedicated history table (gates xstock friction extraction) | PHASE_19_PLAN.md:518 |
| 231 |  |  | #94 |  | done? | xstock macro confidence modifiers (currently deliberate NO-OP = 1.0; issue argues no-macro-awareness shouldn't ship into active trading) | PHASE_19_PLAN.md:519 |
| 232 |  |  | #80 |  | done? | Extend B73 exit-strategy ablation to xstock_spot (drives per-class TEC config) | PHASE_19_PLAN.md:520 |
| 233 | B-EXIT-LABEL-TRUTH |  | #732 | Kyle | done? | A plain TARGET hit is labelled trailing_stop_hit — and two of the seven exited ABOVE their own target. Trailing is OFF and genuinely never runs; targetLatched i | PHASE_19_PLAN.md:501 |
| 234 | B-BOOK-BBO-DIVERGENCE | ~~3b.c~~ |  | CC-C | unclear | B-BOOK-BBO-DIVERGENCE — WITHDRAWN 2026-08-29, SAME DAY, BY ITS AUTHOR. The 0.48% was a TIMING ARTIFACT: a continuous instrument (n=492, 4 symbols, no exits) put | PHASE_19_PLAN.md:39 |
| 235 | B-TSC-GUARD-NONCODE-EXEMPT | ~~3b.h-5~~ |  | CC-A | done? | B-TSC-GUARD-NONCODE-EXEMPT (#1025) — STRUCK 2026-09-10, NOTHING TO BUILD. | PHASE_19_PLAN.md:60 |
| 236 |  | ~~P19-B8 (orig)~~ |  | Kyle | done? | ~~Shadow-trade layer~~ →  SHIPPED EARLY as reorg-B4 | PHASE_19_PLAN.md:233 |

## Phase 25 — Calibration With Evidence — 29

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 25-1 |  |  | unclear | B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) | POST_AUDIT_ROADMAP.md:306 |
| 2 |  | 25-10 |  | Kyle | unclear | Crypto confidence-modifier calibration | POST_AUDIT_ROADMAP.md:315 |
| 3 |  | 25-11 |  | Langston | open | Order-book / liquidity-aware position sizing + thin-market exit — BOTH asset classes (Kyle directive 2026-05-29) | POST_AUDIT_ROADMAP.md:316 |
| 4 |  | 25-12 |  | Langston | unclear | PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Entry-trigger sweep (B.5 W2.0b) — we tried this; it's rescheduled here | POST_AUDIT_ROADMAP.md:321 |
| 5 |  | 25-13 |  |  | unclear | PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Faithful geometry reconstruction (W2.0a Mode-A) + RI-a stop-anchor forensic replay — we tried this; | POST_AUDIT_ROADMAP.md:322 |
| 6 |  | 25-14 |  |  | open | PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — Per-strategy entry re-fit (W2.2) + ORB entry-edge validation (W3) + vwap_bounce forward power test — | POST_AUDIT_ROADMAP.md:323 |
| 7 |  | 25-15 | #205 | Kyle | open | DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-arm causal test (RUNNING_ISSUES #205) — tried, blocked on data; rescheduled here | POST_AUDIT_ROADMAP.md:324; RUNNING_ISSUES.md:2306 |
| 8 |  | 25-16 |  | Kyle | open | Trade-size / concurrency / win-rate dynamic + starting-balance sensitivity study (Kyle directive 2026-06-18) — paired here with 25-11 as the position-sizing / p | POST_AUDIT_ROADMAP.md:320 |
| 9 |  | 25-17 |  | Kyle | unclear | TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, BOTH ASSET CLASSES (Kyle directive 2026-08-08) — no existing Phase-25 item covers this; 25-12/13/14 a | POST_AUDIT_ROADMAP.md:317 |
| 10 |  | 25-17 |  |  | unclear | xStock per-class target-floor + reach_atr_max recalibration (reorg-B2 placeholder; RUNNING_ISSUES #336) | POST_AUDIT_ROADMAP.md:326 |
| 11 |  | 25-17b |  | Kyle | open | CRYPTO reach_atr_max DECISION — the reachability-ceiling question, filed 2026-08-17 (P19-B-FEEVIABILITY OBJ-3 held-out successor; Langston ruled it a NEW item, | POST_AUDIT_ROADMAP.md:327 |
| 12 |  | 25-18 |  | Langston | unclear | friction_safety_buffer per-class evaluation (reorg-B2 deliberate-global; RUNNING_ISSUES #337) | POST_AUDIT_ROADMAP.md:328 |
| 13 |  | 25-19 |  | Kyle | unclear | Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-06-21; RUNNING_ISSUES #370) | POST_AUDIT_ROADMAP.md:329 |
| 14 |  | 25-2 |  |  | unclear | §19.0.A Regime classifier confidence-chain calibration | POST_AUDIT_ROADMAP.md:307 |
| 15 |  | 25-20 |  | Kyle | unclear | Per-strategy × per-class minRR (reward-vs-risk floor) RECALIBRATION from win-rates (Kyle directive 2026-06-23; RUNNING_ISSUES #372) | POST_AUDIT_ROADMAP.md:330 |
| 16 |  | 25-21 |  | Kyle | unclear | (folded into 25-19 — Kyle 2026-06-23 "bundle, don't tack on") | POST_AUDIT_ROADMAP.md:331 |
| 17 |  | 25-22 |  |  | unclear | Edge-decay monitor — selection-IC + per-strategy calibration drift detection (RenTech "edges are perishable / capacity-decay"; research idea 2026-07-10) | POST_AUDIT_ROADMAP.md:335 |
| 18 |  | 25-23 |  |  | unclear | Probabilistic hidden-state (HMM-style) regime inference → regime-conditioned EV (RenTech HMM lineage — Baum-Welch roots; research idea 2026-07-10) | POST_AUDIT_ROADMAP.md:336 |
| 19 |  | 25-24 |  | CC-A | open | Orthogonal weak-feature enrichment of the per-cycle selection ranking, incl. microstructure-as-signal (RenTech "combine many weak signals"; research idea 2026-0 | POST_AUDIT_ROADMAP.md:337 |
| 20 |  | 25-25 |  |  | unclear | Cross-instrument / relative-value (statistical-arbitrage) signals (RenTech's stat-arb DNA; research idea 2026-07-10) | POST_AUDIT_ROADMAP.md:338 |
| 21 |  | 25-26 |  | Kyle | unclear | Trade HOLD-TIME / timeframe study — do slower (multi-day) trades clear the fee wall more reliably? (Kyle directive 2026-07-14) | POST_AUDIT_ROADMAP.md:340 |
| 22 |  | 25-27 |  | Kyle | unclear | Profitable-signal PROFILE → reverse-engineer a scanner PRE-SCREEN for early admission (Kyle directive 2026-07-14) | POST_AUDIT_ROADMAP.md:341 |
| 23 |  | 25-3 |  |  | unclear | §19.0.3 TFS sustainability gate value-scope decision | POST_AUDIT_ROADMAP.md:308 |
| 24 |  | 25-4 |  | CC-A | open | §19.4 SQE Recalibration (B66 conditional) | POST_AUDIT_ROADMAP.md:309 |
| 25 |  | 25-5 |  |  | observation | §19.4.5 Observational Decision Gate | POST_AUDIT_ROADMAP.md:310 |
| 26 |  | 25-6 |  | Langston | unclear | AMR posture-model M2 calibration (post-launch — Phase 17/18 ML buildout) | POST_AUDIT_ROADMAP.md:311 |
| 27 |  | 25-7 |  | Kyle | unclear | #94 B79.3 xStock equity-equivalent macro confidence modifiers | POST_AUDIT_ROADMAP.md:312 |
| 28 |  | 25-8 |  |  | unclear | #153 xStock pattern_max_position_pct 0.50 placeholder validation | POST_AUDIT_ROADMAP.md:313 |
| 29 |  | 25-9 |  |  | unclear | xStock pair_correlation per-pair WR data accumulation (B68.3 calibration) | POST_AUDIT_ROADMAP.md:314 |

## Phase 16 — Database & Remaining Legacy Cleanup — 10

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 16.1 |  |  | done? | Wave 6: L-Series Cluster Removal —  DONE (Phase 13, Batch 14) | POST_AUDIT_ROADMAP.md:468 |
| 2 |  | 16.2 |  |  | unclear | Database Phase A-B: Isolation & Modularization | POST_AUDIT_ROADMAP.md:471 |
| 3 |  | 16.3 |  |  | unclear | Database Phase C: Schema Simplification | POST_AUDIT_ROADMAP.md:476 |
| 4 |  | 16.4 |  |  | unclear | Wave 7: Post-L-Series Cleanup | POST_AUDIT_ROADMAP.md:483 |
| 5 |  | 16.5 |  |  | unclear | LSP Error Resolution | POST_AUDIT_ROADMAP.md:487 |
| 6 |  | 16.6 |  | Kyle | unclear | Trailing-Percent Code Purge (added 2026-04-25, Kyle directive) | POST_AUDIT_ROADMAP.md:496 |
| 7 |  | 16.7 |  |  | unclear | Test Suite Recovery (added 2026-05-13) | POST_AUDIT_ROADMAP.md:517 |
| 8 | B-RETIRED-SCORE-REMOVAL | 16.7 |  | CC-B | unclear | Retired-Score Removal — B-RETIRED-SCORE-REMOVAL (#558) — MOVED FROM PHASE 19 2026-09-02, Kyle directive; owner CC-B | POST_AUDIT_ROADMAP.md:492 |
| 9 |  | 16.8 |  | Kyle | unclear | Predictive-Learning / ML-Era Teardown REMAINDER (added 2026-07-28, Kyle decision: REMOVE) | POST_AUDIT_ROADMAP.md:538 |
| 10 |  | 16.9 |  | Kyle | unclear | resetRateLimiter() — INERT ON THE ONLY ENVIRONMENT WE RUN (added 2026-08-28, Kyle decision: REMOVE IN PHASE 16) | POST_AUDIT_ROADMAP.md:552 |

## Phase 20 — Production Hardening — 7

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 20.1 |  |  | unclear | Database Phase D: Migration Rebaseline | POST_AUDIT_ROADMAP.md:570 |
| 2 |  | 20.2 |  |  | unclear | Database Phase E: Index & Retention Hygiene | POST_AUDIT_ROADMAP.md:575 |
| 3 |  | 20.3 |  |  | unclear | Test Infrastructure | POST_AUDIT_ROADMAP.md:581 |
| 4 |  | 20.4 |  |  | unclear | Security Finalization | POST_AUDIT_ROADMAP.md:589 |
| 5 |  | 20.4.5 |  |  | unclear | Observability hardening (NEW 2026-06-12 — §19.6.6 long-tail) | POST_AUDIT_ROADMAP.md:595 |
| 6 |  | 20.4.6 |  |  | unclear | TRADEABLE-UNIVERSE BOUNDARY — fiat-vs-fiat currency pairs are inside the crypto universe (NEW 2026-08-28, RUNNING_ISSUES #937) | POST_AUDIT_ROADMAP.md:598 |
| 7 |  | 20.5 |  |  | unclear | Architecture Cleanup | POST_AUDIT_ROADMAP.md:615 |

## Phase 21 — Live Mode Activation (incl. the post-live 21.4 / 21.5 / 21.6 sections) — 11

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 21.1 |  |  | unclear | Live Mode Engine | POST_AUDIT_ROADMAP.md:631 |
| 2 | B-LEGACY-LIVE-EXIT-PATH | 21.1.a | #953 | CC-C | open | B-LEGACY-LIVE-EXIT-PATH (#953) — HARD GO-LIVE BLOCKER. NO REAL CAPITAL TRADES UNTIL THIS IS CLOSED. | POST_AUDIT_ROADMAP.md:638; RUNNING_ISSUES.md:1520 |
| 3 |  | 21.2 |  |  | unclear | Paper-to-Live Transition Testing | POST_AUDIT_ROADMAP.md:651 |
| 4 |  | 21.3 |  |  | unclear | Live Mode Guardrails | POST_AUDIT_ROADMAP.md:689 |
| 5 |  | 21.4 |  |  | unclear | POST-LAUNCH REVISIT — the strong-trend lane's absent volume floor, and the unread half of the order book | POST_AUDIT_ROADMAP.md:657 |
| 6 |  | 21.4.1 |  |  | unclear | 8-module extraction | POST_AUDIT_ROADMAP.md:961 |
| 7 |  | 21.4.2 |  |  | done? | Comprehensive lever-to-module_constants migration — MOVED TO B72 (pre-launch) —  SHIPPED 2026-05-05 | POST_AUDIT_ROADMAP.md:974 |
| 8 |  | 21.4.3 |  |  | unclear | storage.ts modularization (folded in from Phase 16.2) | POST_AUDIT_ROADMAP.md:978 |
| 9 |  | 21.5.1 |  |  | done? | Kraken XStocks Integration —  COMPLETE PRE-LAUNCH (Phase 24, 2026-05-10) | POST_AUDIT_ROADMAP.md:1017 |
| 10 |  | 21.5.2 |  |  | unclear | Perpetual Futures Integration | POST_AUDIT_ROADMAP.md:1021 |
| 11 |  | 21.5.3 |  |  | unclear | Cross-Asset Infrastructure | POST_AUDIT_ROADMAP.md:1028 |

## Phase 22 — Publication (post-live) — 2

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 22.1 |  |  | unclear | Build & Deploy Pipeline | POST_AUDIT_ROADMAP.md:724 |
| 2 |  | 22.2 |  |  | unclear | Monitoring & Observability | POST_AUDIT_ROADMAP.md:729 |

## Phase 17 / 17.5 — ML design, smart thermostat (post-live) — 10

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 17.1 |  |  | unclear | Scope & Grounding (Week 23) | POST_AUDIT_ROADMAP.md:746 |
| 2 |  | 17.2 |  |  | unclear | ML Touchpoint & Influence Mapping (Weeks 24-25) | POST_AUDIT_ROADMAP.md:752 |
| 3 |  | 17.3 |  |  | unclear | Infrastructure Design (Weeks 25-26) | POST_AUDIT_ROADMAP.md:775 |
| 4 |  | 17.4 |  |  | unclear | Research & Feature Engineering (Weeks 26-27) | POST_AUDIT_ROADMAP.md:786 |
| 5 |  | 17.5 |  |  | unclear | Blueprint Assembly (Weeks 27-28) | POST_AUDIT_ROADMAP.md:795 |
| 6 |  | 17.5.1 |  |  | unclear | Rules-Based Policy Engine | POST_AUDIT_ROADMAP.md:919 |
| 7 |  | 17.5.2 |  |  | unclear | Predictive Adjustment Execution | POST_AUDIT_ROADMAP.md:925 |
| 8 |  | 17.5.3 |  |  | unclear | Calibration Execution | POST_AUDIT_ROADMAP.md:930 |
| 9 |  | 17.5.4 |  |  | unclear | Regime-Aware Adaptation | POST_AUDIT_ROADMAP.md:935 |
| 10 |  | 17.6 |  | Kyle | unclear | Trend Mining Engine — design consideration (Kyle directive 2026-05-04) | POST_AUDIT_ROADMAP.md:808 |

## Phase 18 — ML implementation (post-live) — 5

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  | 18.1 |  |  | unclear | Crawl: Feature Store & Data Pipeline | POST_AUDIT_ROADMAP.md:835 |
| 2 |  | 18.2 |  |  | unclear | Walk: Model Training & Validation | POST_AUDIT_ROADMAP.md:841 |
| 3 |  | 18.3 |  |  | unclear | Run: Integration & Parallel Execution | POST_AUDIT_ROADMAP.md:847 |
| 4 |  | 18.4 |  |  | unclear | Fly: ML as Primary Intelligence | POST_AUDIT_ROADMAP.md:853 |
| 5 |  | 18.5 |  |  | unclear | Trend Mining Engine — parallel architecture (per Phase 17.6 design) | POST_AUDIT_ROADMAP.md:859 |

## In a session task list but on NO plan row or roadmap section — 82

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  |  |  | CC-A | unclear | / 12.1 / rulings-durability fix (#671) / sub-item / FIRST BREAK — exempt from the sequencing / | CC_A_SESSION_TASK_LIST.md:43 |
| 2 |  |  |  | CC-A | unclear | / 12.2 / lookalike register (#672) / sub-item / FIRST BREAK / | CC_A_SESSION_TASK_LIST.md:44 |
| 3 |  |  |  | CC-A | unclear | -  OWED TO LANGSTON: the alert-verb design (#982) — two questions put to him and unanswered: must a hold leave the back-off untouched, and must it require an ex | CC_A_SESSION_TASK_LIST.md:66 |
| 4 |  |  |  | CC-A | unclear | - #761 — the comms outage; evidence kept at /root/evidence/761/, cause still unknown. | CC_A_SESSION_TASK_LIST.md:67 |
| 5 |  |  |  | CC-A | unclear | - Event-wait alerts I own (23f004a4, f6ae5419, c5cf4a87, 2b0a4688, 27860643) — acked = silenced (#982); Kyle 2026-09-02: nothing urgent, slot them. | CC_A_SESSION_TASK_LIST.md:69 |
| 6 |  |  |  | CC-A | unclear | - #1001 — raised by me, owned by CC-C: staging's deploy gap. Re-measured 2026-09-05 (see below); not mine to close. | CC_A_SESSION_TASK_LIST.md:70 |
| 7 |  |  |  | CC-A | unclear | / #761 / the 30 August comms outage — cause unknown; evidence kept on the Helsinki box / folded into row 5 / | CC_A_SESSION_TASK_LIST.md:121 |
| 8 |  |  |  | CC-A | unclear | / the five event-wait alerts CC-A owns / acknowledged = silenced (#982); restored when the undo command exists / nothing urgent (Kyle 09-02) / | CC_A_SESSION_TASK_LIST.md:126 |
| 9 |  |  |  | CC-A | unclear | / #990 (was #986) / GitHub began refusing anonymous downloads from both Hetzner servers; fixed 09-02 with two read-only deploy keys Kyle registered; left for Ky | CC_A_SESSION_TASK_LIST.md:127 |
| 10 |  |  |  | CC-A | open | / the lookalike register (part of #672) / one page of the pairs that have already caused wrong calls — a working table next to its archive copy, a shadow table | CC_A_SESSION_TASK_LIST.md:144 |
| 11 |  |  |  | CC-A | open | / the rulings-durability fix (separable half of #671) / Langston's ~3,000 Discord rulings sit in ONE 19 MB file on ONE server outside git. Copy it to a read-onl | CC_A_SESSION_TASK_LIST.md:146 |
| 12 |  |  |  | CC-A | unclear | / the governance tier list refresh (rode B-RULES-1d) / make the tier lists match what the checker actually enforces; includes a CONTENT refresh of STORAGE_POLIC | CC_A_SESSION_TASK_LIST.md:149 |
| 13 |  |  |  | CC-B | open | / #972 — xStock volatility (ATR) empty on both sides of every trade / 2/2 live xStock opens and 61/61 closes carry no ATR; crypto carries 107 distinct values in | CC_B_SESSION_TASK_LIST.md:91 |
| 14 |  |  |  | CC-B | unclear | / #675 / Paper xStock per-strategy decline table empty while crypto's fills; two dispositions, evidence cannot yet separate them. / closes with #682 / | CC_B_SESSION_TASK_LIST.md:93 |
| 15 |  |  |  | CC-B | open | / #684 / xStock fill-freshness limit blocks ~60% of the book at any moment; the guard is right, the 15,000 ms threshold was never calibrated. / unplaced / | CC_B_SESSION_TASK_LIST.md:94 |
| 16 |  |  |  | CC-B | open | / #634 / Daily-loss evaluator's failure counter has zero readers (Langston-assigned). / unplaced / | CC_B_SESSION_TASK_LIST.md:95 |
| 17 |  |  |  | CC-B | open | / #635 / #636 / xStock stall watchdog catches a TOTAL stall only; snap-arrival ≠ mark-freshness. / unplaced / | CC_B_SESSION_TASK_LIST.md:96 |
| 18 |  |  |  | CC-B | open | / #639 / #640 / Stop-loss in force at close not persisted; two persisted columns never populated on any row. / unplaced / | CC_B_SESSION_TASK_LIST.md:97 |
| 19 |  |  |  | CC-B | open | / #625 / decideOrp… — split out of #605 at Langston's instruction. / unplaced / | CC_B_SESSION_TASK_LIST.md:99 |
| 20 |  |  |  | CC-B | open | / #592 — database growth / Kyle assigned this to CC-B in conversation (2026-08-31); the ledger still reads OWNER UNASSIGNED — to be recorded. Storage picture ha | CC_B_SESSION_TASK_LIST.md:100 |
| 21 |  |  |  | CC-B | unclear | / Alert-system defects / #638 (exit-skip class has no clear path), #642 (minted twice — collision to untangle), #646, #679 (persistent threshold re-fires on res | CC_B_SESSION_TASK_LIST.md:107 |
| 22 |  |  |  | CC-B | unclear | / Doc divergence / #641 (latchTriggerPrice, 13+ sites) / | CC_B_SESSION_TASK_LIST.md:109 |
| 23 |  |  |  | CC-B | unclear | / Close-only / #669 — diagnosed, stale test retired, CI 4/4 green; needs its CLOSE written / | CC_B_SESSION_TASK_LIST.md:110 |
| 24 |  |  |  | CC-B | done? | / 2b0a4688 — #605 pin proof / CC-B / verify the hasGovernance pin on a naturally aged-out batch / CLOSED 2026-09-02 — PASS, resolved by cc-b with the two-check | CC_B_SESSION_TASK_LIST.md:118 |
| 25 |  |  |  | CC-B | unclear | / f6ae5419 · c5cf4a87 · 23f004a4 / CC-A (body) / VC-2 decision point · vts GC knob revisit · #602 first learning write / cleared from the due list 2026-09-01 ~0 | CC_B_SESSION_TASK_LIST.md:121 |
| 26 |  |  |  | CC-B | unclear | - Board card "July storage migration (run manually, end of August)" → move to Complete: the 2026-09-01 02:15Z nightly did it (xstock_spot_ticker_snap/2026-07, 3 | CC_B_SESSION_TASK_LIST.md:127 |
| 27 |  |  |  | CC-B | unclear | - Record #592 owner = CC-B. Write #669's close. | CC_B_SESSION_TASK_LIST.md:133 |
| 28 |  |  |  | CC-B | unclear | - B-FILTER-DIAG-STANDARDIZE's governance close was NOT still owed — BATCH_CATALOG, PHASE_HISTORY and the completion report all carry it. Only #675 survives as a | CC_B_SESSION_TASK_LIST.md:139 |
| 29 |  |  |  | CC-B | unclear | - "B-ATR-RESTORE is the next batch" was wrong — B8.5k was rolled back and B8.5l fixed the shared-volatility root cause in July. The live volatility item is #972 | CC_B_SESSION_TASK_LIST.md:140 |
| 30 |  |  |  | CC-B | unclear | - #669's "CI 4/4 is unsatisfiable" was three weeks stale; already corrected 2026-08-31. | CC_B_SESSION_TASK_LIST.md:141 |
| 31 |  |  |  | CC-INFRA | unclear | / ⏸ #670 crew-status cold hand-off / open / me / warm tier grows unbounded; a policy item, not a capacity one / | CC_INFRA_SESSION_TASK_LIST.md:18 |
| 32 |  |  |  | CC-INFRA | unclear | / #924 / Two access keys reach the staging deploy account that nobody governs or rotates — security housekeeping; remediation belongs with the security-hardenin | CC_INFRA_SESSION_TASK_LIST.md:48 |
| 33 |  |  |  | CC-INFRA | unclear | / #973 / In the token study, part of how a launch is judged "interesting" is structurally dead — the limb can never be true, so it silently contributes nothing. | CC_INFRA_SESSION_TASK_LIST.md:49 |
| 34 |  |  |  | CC-INFRA | unclear | / #989 / A token can lose 99.8% of its liquidity and the study still counts it alive, because "alive" never had a liquidity figure to look at. / | CC_INFRA_SESSION_TASK_LIST.md:50 |
| 35 | B-ACTIVE-NULL-TAXONOMY |  |  | CC-B | unclear | / Governance checker / #637 (dead-man switch OFF), #643, #660 (projected cap breach), #662 (B-ACTIVE-NULL-TAXONOMY), #663 (KYLE DECISION OWED), #664 / | CC_B_SESSION_TASK_LIST.md:108 |
| 36 | B-ALERT-WINDOW-EXPIRY |  |  | CC-A | unclear | / 8.7 / B-ALERT-WINDOW-EXPIRY / batch / Langston §13 home / | CC_A_SESSION_TASK_LIST.md:53 |
| 37 | B-CATALOG-2 |  |  | CC-A | unclear | / 12.5 / B-CATALOG-2 / batch / after 12.4 / | CC_A_SESSION_TASK_LIST.md:61; CC_A_SESSION_TASK_LIST.md:156 |
| 38 | B-CHANGE-CLASS-DOCSET-FIT |  |  | CC-B | unclear | / 2.7 / B-CHANGE-CLASS-DOCSET-FIT / Langston's §13 from the close of A: the change-class matrix welds SYSTEM_MANUAL to SIM, but their triggers differ, so infras | CC_B_SESSION_TASK_LIST.md:83 |
| 39 | B-CHUNK-ADDRESSING |  |  | CC-A | open | / 5 / B-CHUNK-ADDRESSING (#749/#761) / batch / placed 2026-08-29 / | CC_A_SESSION_TASK_LIST.md:49; CC_A_SESSION_TASK_LIST.md:92 |
| 40 | B-CLAIM-REDERIVE |  |  | CC-A | open | / 6.6 / B-CLAIM-REDERIVE / batch / placed 2026-09-02 / | CC_A_SESSION_TASK_LIST.md:51; CC_A_SESSION_TASK_LIST.md:95 |
| 41 | B-CONSTANTS-UPDATED-AT |  |  | CC-B | open | / NEW — 2.4d / B-CONSTANTS-UPDATED-AT (Langston §13, 2026-09-05) / module_constants.updated_at is NOT refreshed on at least one UPDATE path — a live row reads a | CC_B_SESSION_TASK_LIST.md:80 |
| 42 | B-CREW-BOARD-REMOVAL |  |  | CC-A | unclear | / 11 / B-CREW-BOARD-REMOVAL / batch /  GATED ON KYLE (Infra Claude's onboarding is his call) / | CC_A_SESSION_TASK_LIST.md:56; CC_A_SESSION_TASK_LIST.md:100 |
| 43 | B-CREW-STATUS-2 |  |  | CC-INFRA | observation | / ⏸ B-CREW-STATUS-2 remainder / parked / Kyle (parked 2026-08-26) /  the costly unbuilt piece: persist derived facts at observation time / | CC_INFRA_SESSION_TASK_LIST.md:19 |
| 44 | B-DECISION-RECORDS |  |  | CC-A | open | / 12.3 / B-DECISION-RECORDS / batch / after the rules arc's substantive legs / | CC_A_SESSION_TASK_LIST.md:59; CC_A_SESSION_TASK_LIST.md:145; CC_A_SESSION_TASK_LIST.md:164 |
| 45 | B-DRIFT-RUNTIME-PREDICATE |  |  | CC-A | done? | / 4.56 /  CLOSED 2026-09-08 — B-DRIFT-RUNTIME-PREDICATE (#1016) / batch / Langston's Step-8 finding. The drift gate calls server/ client/ shared/ "runtime" — a | CC_A_SESSION_TASK_LIST.md:36 |
| 46 | B-EOL-NORMALISE |  |  | CC-A | open | / 9 / B-EOL-NORMALISE (#751) / batch / queued / | CC_A_SESSION_TASK_LIST.md:54; CC_A_SESSION_TASK_LIST.md:98 |
| 47 | B-EXCURSION-RECORD |  |  | CC-B | unclear | 3. B-EXCURSION-RECORD (row 2.4g-3) — carries the five non-shipping ceilings, vwap_pullback, the ratchet constraint, and the weekend_suspended non-terminal xStoc | CC_B_SESSION_TASK_LIST.md:34 |
| 48 | B-EXIT-LATCH-INVESTIGATION |  |  | CC-A | open | / 7 / B-EXIT-LATCH-INVESTIGATION (#732) / investigation / placed by Kyle, after B-MEASURE-GATE / | CC_A_SESSION_TASK_LIST.md:52; CC_A_SESSION_TASK_LIST.md:96 |
| 49 | B-FINALSCORE-TELEMETRY-RETIRE |  |  | CC-A | open | / 11.6 / B-FINALSCORE-TELEMETRY-RETIRE (#582) / batch / Langston Step-4 deferral from #558 / | CC_A_SESSION_TASK_LIST.md:58; CC_A_SESSION_TASK_LIST.md:124 |
| 50 | B-FRESHNESS-LOG-READER |  |  | CC-B | unclear | / 2.5 / B-FRESHNESS-LOG-READER / Nothing reads the run record the rules-refresher writes every session start. Build the reader: freeze detector, per-path stalen | CC_B_SESSION_TASK_LIST.md:81 |
| 51 | B-GATE-GUARD |  |  | CC-A | open | / 10 / B-GATE-GUARD (#744) + B-ISSUE-BLOCK-GUARD (#745) / batch / queued —  now also carries #754's three unbuilt checker legs, returned to priority by the #100 | CC_A_SESSION_TASK_LIST.md:55; CC_A_SESSION_TASK_LIST.md:99 |
| 52 | B-GDRIVE-UNMOUNT |  |  | CC-INFRA | open | / 4 / 3 / B-GDRIVE-UNMOUNT (#757) + #759 / placed 2026-08-28 —  re-derive its state from the box before starting; the mount's disposition was ruled 2026-08-28 ( | CC_INFRA_SESSION_TASK_LIST.md:30 |
| 53 | B-GEOMETRY-REACH-BASELINE |  |  | CC-B | unclear | / ~~B-GEOMETRY-REACH-BASELINE~~ (#1052, row 2.4g-2) / CLOSED 2026-09-13 / nothing — Step 11 CONFIRMED by Langston; this row was STALE in the list for ten days / | CC_B_SESSION_TASK_LIST.md:9; CC_B_SESSION_TASK_LIST.md:32 |
| 54 | B-HEARTBEAT-RESCOPE |  |  | CC-A | unclear | / 4.7 / B-HEARTBEAT-RESCOPE (#999) / batch / Langston's condition from #995 / | CC_A_SESSION_TASK_LIST.md:45 |
| 55 | B-INSTRUMENTS-OVER-RULES |  |  | CC-A | in-flight | /  B-INSTRUMENTS-OVER-RULES (row 3.5) / OBJ-1 REOPENED 2026-09-11 (#1038); the tool LOADS since 14:12Z / the in-session demo + a 14-day usage measure / it had n | CC_A_SESSION_TASK_LIST.md:25; CC_A_SESSION_TASK_LIST.md:47; CC_A_SESSION_TASK_LIST.md:89 |
| 56 | B-JULY-RETENTION-SWEEP |  |  | CC-A | unclear | / B-JULY-RETENTION-SWEEP (plan row 6.9) / Kyle's directive 09-01. Reviewed 09-02: nothing to sweep — the overnight archive job finished July by itself on its se | CC_A_SESSION_TASK_LIST.md:119 |
| 57 | B-LANGSTON-FILE-FLOOR |  |  | CC-INFRA | open | / 5 / 2.8a / B-LANGSTON-FILE-FLOOR (with Langston) / placed 2026-09-05 / | CC_INFRA_SESSION_TASK_LIST.md:31 |
| 58 | B-LANGSTON-LEDGER-SPLIT |  |  | CC-B | open | - Langston's MEMORY.md: his REVIEWER LEDGER alone is 34,605 B; his call, homed at B-LANGSTON-LEDGER-SPLIT (Langston + Infra). | CC_B_SESSION_TASK_LIST.md:135; CC_INFRA_SESSION_TASK_LIST.md:32 |
| 59 | B-LANGSTON-LOAD-RATCHET |  |  | CC-INFRA | in-flight | / 2 / 2.8b / B-LANGSTON-LOAD-RATCHET, in flight as B-LANGSTON-CONTEXT P-5 / see 0a / | CC_INFRA_SESSION_TASK_LIST.md:28 |
| 60 | B-LEDGER-HEADLINE-INJECT |  |  | CC-INFRA | open | / 7 / 2.8c / B-LEDGER-HEADLINE-INJECT / placed 2026-09-09 — must land before 2.8 can ship / | CC_INFRA_SESSION_TASK_LIST.md:33 |
| 61 | B-MEASURE-GATE |  |  | CC-A | in-flight | / ⏳ B-MEASURE-GATE beyond leg 2 (row 6) / Step 2 / me / Step 1 approved 2026-08-31. Leg 2 CLOSED 2026-09-02 — the rest is not / | CC_A_SESSION_TASK_LIST.md:24; CC_A_SESSION_TASK_LIST.md:41; CC_A_SESSION_TASK_LIST.md:93 |
| 62 | B-ORPHAN-LEVEL-TABLES |  |  | CC-C | unclear | / 3n.b / B-ORPHAN-LEVEL-TABLES / | CC_C_SESSION_TASK_LIST.md:75 |
| 63 | B-PAPER-LEGACY-TABLE-REWIRE |  |  | CC-B | unclear | / #573 — B-PAPER-LEGACY-TABLE-REWIRE / Paper "Active Trades" card reads the retired paper_trades table; prerequisite of dropping it. Full reader census first. / | CC_B_SESSION_TASK_LIST.md:98 |
| 64 | B-READ-MODEL-BLOB-VERIFY |  |  | CC-INFRA | open | / 3 / 4.51a / B-READ-MODEL-BLOB-VERIFY (#1043) — Langston's read of a pinned file served the wrong content twice; verify blob hashes in dt-review show / placed | CC_INFRA_SESSION_TASK_LIST.md:29 |
| 65 | B-REVIEWER-LOOP |  |  | CC-A | open | / 4 / B-REVIEWER-LOOP (#758) / batch / placed 2026-08-28 / | CC_A_SESSION_TASK_LIST.md:48; CC_A_SESSION_TASK_LIST.md:91 |
| 66 | B-REVIEWER-LOOP-AVAILABILITY |  |  | CC-INFRA | unclear | / #931 B-REVIEWER-LOOP-AVAILABILITY / Four workflow steps require a fresh reader to check first — and in the session those steps govern, it could not fire. A ru | CC_INFRA_SESSION_TASK_LIST.md:47 |
| 67 | B-RULES-1E-LANGSTON-SLIM |  |  | CC-INFRA | open | / ⏸ #651 B-RULES-1E-LANGSTON-SLIM / not started / Kyle — no go given / transferred from CC-A / | CC_INFRA_SESSION_TASK_LIST.md:17 |
| 68 | B-RULES-LAYER |  |  | CC-A | unclear | / 4.6 / B-RULES-LAYER (#998) / batch /  SUPERSEDED ORDER: Kyle directed this to follow B-WAKE-QUIET, then on 2026-09-05 put B-TASK-LIST-SLOT ahead of it. Still | CC_A_SESSION_TASK_LIST.md:39 |
| 69 | B-SCHEDULER-FIRST-TICK |  |  | CC-A | open | /  B-SCHEDULER-FIRST-TICK (row 4.58, #1039) / not started — found 2026-09-11 / nothing — NEXT UP (4.57 closed 2026-09-18) / every scheduler task runs twice at i | CC_A_SESSION_TASK_LIST.md:22; CC_A_SESSION_TASK_LIST.md:38; CC_A_SESSION_TASK_LIST.md:68 |
| 70 | B-SHARED-TMP-ISOLATION |  |  | CC-B | unclear | / 2.6 / B-SHARED-TMP-ISOLATION (#979) / All four sessions share /tmp. Sweep every writer to the shared namespace (not just commit -F; includes the Helsinki scp | CC_B_SESSION_TASK_LIST.md:82 |
| 71 | B-SLOT-PLACEMENT-CHECK |  |  | CC-A | unclear | / 4.8 / B-SLOT-PLACEMENT-CHECK (#1009 P2) / batch / the slot-time half, split out of 4.57 at Step 2 / | CC_A_SESSION_TASK_LIST.md:46 |
| 72 | B-STATE-ASSERTION-LINT |  |  | CC-A | open | / 6.5 / B-STATE-ASSERTION-LINT / batch / placed 2026-08-31 / | CC_A_SESSION_TASK_LIST.md:50; CC_A_SESSION_TASK_LIST.md:94 |
| 73 | B-STORAGE-CATALOG |  |  | CC-A | open | / B-STORAGE-CATALOG (Kyle, 28 July: "catalog everything that we're storing and where it can be found… a canonical document referenced in our system manual") / ( | CC_A_SESSION_TASK_LIST.md:147; CC_A_SESSION_TASK_LIST.md:148 |
| 74 | B-TARGET-MULTIPLE-VS-HORIZON |  |  | CC-B | open | 6. Not mine but placed by me: B-TARGET-MULTIPLE-VS-HORIZON (row 2.4g-5) — Kyle decides, gated on 2.4g-3. | CC_B_SESSION_TASK_LIST.md:37 |
| 75 | B-TASK-LIST-SLOT |  |  | CC-A | open | / 4.57 / B-TASK-LIST-SLOT (#1009) / batch /  CLOSED 2026-09-18 — P5 passed, Langston confirmed. Kyle fixed this position 2026-09-05 / | CC_A_SESSION_TASK_LIST.md:37; CC_A_SESSION_TASK_LIST.md:73; CC_C_SESSION_TASK_LIST.md:113 |
| 76 | B-TEC-REGIME-PARAM-REMOVAL |  |  | CC-B | unclear | / §1 board, after B-TEC-REGIME-PARAM-REMOVAL / B-VOLATILITY-CACHE-RETIRE / B-REGIME-INPUTS-LIVE's undone OBJ-4: retire the orphan volatility cache + 0.015 fallb | CC_B_SESSION_TASK_LIST.md:85 |
| 77 | B-TRADE-RECORD-JOINABILITY |  |  | CC-B | unclear | 4. B-TRADE-RECORD-JOINABILITY (row 2.4g-4) — id-space split, archive stage split, realDiAtOpen NULL on 3,685, and the xStock-shadow atrAtOpen = 0 on 1,029 of 1, | CC_B_SESSION_TASK_LIST.md:35 |
| 78 | B-TRADING-ENGINE-REMOVAL |  |  | CC-A | open | / 11.5 / B-TRADING-ENGINE-REMOVAL (#578) / batch / held behind the retired-score work / | CC_A_SESSION_TASK_LIST.md:57; CC_A_SESSION_TASK_LIST.md:123 |
| 79 | B-TRAILING-STATE-DURABILITY |  |  | CC-C | unclear | / 3n.c / B-TRAILING-STATE-DURABILITY / | CC_C_SESSION_TASK_LIST.md:76 |
| 80 | B-UMBRELLA-OPEN-STATE |  |  | CC-B | unclear | / 2.9 / B-UMBRELLA-OPEN-STATE / The checker has no state for a batch legitimately open until a phase closes; build the designed umbrella-namespace row type. / a | CC_B_SESSION_TASK_LIST.md:84 |
| 81 | B-WS-SUBSCRIBE-BOUNDARY-CLASS |  |  | CC-A | unclear | / #571 B-WS-SUBSCRIBE-BOUNDARY-CLASS / the venue price-feed subscribe boundary; obligations #44 #45 #46 (09-02: a 13.8-minute post-restart gap with no alert) / | CC_A_SESSION_TASK_LIST.md:122 |
| 82 | P19-B8.5 |  |  | CC-B | unclear | - P19-B8.5 umbrella: Kyle ruled 2026-09-02 it stays open until Phase 19 closes; stale-open alert resolved against GOVERNANCE_EXCEPTIONS:82; mechanism gap → B-UM | CC_B_SESSION_TASK_LIST.md:129 |

## An OPEN issue with NO plan row and NO task-list line — 216

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 |  |  | #979 | CC-B | open | 2026-08-31 (CC-B; found by reading my own commit subject after the commit) —  A REAL CROSS-SESSION WRITE THAT IS NOT IN GIT: ALL FOUR SESSIONS SHARE /tmp, AND A | RUNNING_ISSUES.md:990 |
| 2 |  |  | #978 | CC-A | open | 2026-08-31 (CC-A; Langston named the class, a fresh reader caught that I had NAMED it without PLACING it) —  A SENTENCE THAT WAS TRUE WHEN WRITTEN AND IS WRONG | RUNNING_ISSUES.md:1032 |
| 3 |  |  | #975 | CC-A | open | 2026-08-31 (CC-A; Kyle-directed ledger pass) —  ONE MISTAKE PATTERN IS 48% OF EVERY MISTAKE WE HAVE RECORDED — AND IT IS THE MOST HEAVILY RULED ONE WE OWN | RUNNING_ISSUES.md:1072 |
| 4 |  |  | #973 | CC-INFRA | open | 2026-08-31 (CC-INFRA, found 10 minutes into B-TOKEN-WATCH's live collection) — THE TRAIT DEFINITION'S SOCIALS LIMB IS STRUCTURALLY DEAD: THIS PROVIDER'S CREATIO | RUNNING_ISSUES.md:1090 |
| 5 |  |  | #972 | Langston | open | 2026-08-30 (Langston MEASURED it while re-deriving my #602 alert sweep; CC-A filing at his direction, OWNER CC-B) —  xSTOCK ATR READS EMPTY ON BOTH SIDES OF THE | RUNNING_ISSUES.md:1118 |
| 6 |  |  | #970 | CC-A | open | 2026-08-30 (CC-A; measured on Langston’s own gate, and it corrected my first reading of it) —  OUR RECORDS DISAGREE WITH THEMSELVES: 27% OF IDENTIFIED DECISIONS | RUNNING_ISSUES.md:1131 |
| 7 |  |  | #954 | CC-C | open | 2026-08-30 (CC-C; measured at the B-EXIT-PROVENANCE close) —  THE CRYPTO TICKER ARCHIVE HOLDS NO /EUR PAIRS AT ALL, SO EVERY /EUR CLOSE IS WITNESS-BLIND — AND T | RUNNING_ISSUES.md:1153 |
| 8 |  |  | #962 | CC-C | open | 2026-08-30 (CC-C; round-2 reader, re-derived by me at the ref) —  A RESTING MAKER SELL IS DECLARED FILLED WHEN THE MIDPOINT REACHES THE LIMIT, THEN BOOKED AT TH | RUNNING_ISSUES.md:1218 |
| 9 |  |  | #960 | CC-C | open | 2026-08-30 (CC-C; a reader's LEAD whose stated mechanism I REFUTED, and the conclusion then survived on a different one) —  THE xSTOCK FEED'S SUBSCRIPTION LIST | RUNNING_ISSUES.md:1261 |
| 10 |  |  | #958 | CC-C | open | 2026-08-30 (CC-C; Kyle-directed after he rejected #955 as too tame for the phenomenon; parser/throttle half CONFIRMED by Langston at ad7a3960c) —  THE 00:15 UTC | RUNNING_ISSUES.md:1362 |
| 11 |  |  | #957 | CC-C | open | 2026-08-30 (CC-C; surfaced by the price-flow trace, ACTIVE_PATH_FLOW.md §6) —  xSTOCK PRODUCES THREE DIFFERENT DEFINITIONS OF "THE PRICE" FROM ONE VENUE FRAME, | RUNNING_ISSUES.md:1441 |
| 12 |  |  | #955 | CC-C | open | 2026-08-30 (CC-C; Kyle-directed — the question this audit failed to answer three times) —  ANSWERED: THE xSTOCK "LOW BID" IS A REAL, SYMMETRIC, TWO-SIDED WIDENI | RUNNING_ISSUES.md:1489 |
| 13 |  |  | #952 | CC-C | open | 2026-08-30 (CC-C, surfaced by an independent fresh reader on the machinery audit; re-derived at the ref) —  THE "CLEAN TICKER PRINT" DOES NOT EXIST — THE v1 c F | RUNNING_ISSUES.md:1564 |
| 14 |  |  | #947 | CC-INFRA | open | 2026-08-29 (CC-INFRA, found when Kyle asked why B-TOKEN-WATCH's change-class was undecided) — THIRTEEN SCOPE FILES DECLARE A CHANGE-CLASS THE CHECKER CANNOT REA | RUNNING_ISSUES.md:1693 |
| 15 |  |  | #946 | CC-A | open | 2026-08-29 (CC-A) —  LANGSTON’S MEMORY.md IS 2× ITS CAP, AND THE PARTS THAT LOOK LOAD-BEARING ALREADY EXCEED IT ON THEIR OWN | RUNNING_ISSUES.md:1711 |
| 16 |  |  | #635 | CC-B | open | 2026-07-31 (CC-B; Langston Step-4 required home, #594) —  THE xSTOCK STALL WATCHDOG DETECTS A TOTAL FEED STALL ONLY, AND ITS THRESHOLDS ARE UNCALIBRATED FOR THE | RUNNING_ISSUES.md:1756 |
| 17 |  |  | #636 | CC-B | open | 2026-07-31 (CC-B; Langston Step-4 required home, #594) — SNAP-ARRIVAL ≠ MARK-FRESHNESS: lastDataMsgAt CAN READ FRESH WHILE latestEquityTick AGES | RUNNING_ISSUES.md:1783 |
| 18 |  |  | #660 | Kyle | open | 2026-08-07 (Kyle challenge on the B-TRADE-TIER-REGISTER summary; CC-A) — THE TRADE TABLES’ 365d HOT WINDOW WAS INHERITED FROM A DELETE-ERA DECISION AND WAS NEVE | RUNNING_ISSUES.md:1802 |
| 19 |  |  | #661 | Kyle | open | 2026-08-07 (Kyle challenge; CC-A) —  LEGACY-LEARNING CENSUS: AT LEAST THREE OTHER LEARNING-ISH SYSTEMS ARE STILL WIRED, DISPOSITION UNKNOWN | RUNNING_ISSUES.md:1808 |
| 20 |  |  | #658 | CC-C | open | 2026-08-06 (CC-C, surfaced by the B-SIZING-DEC-RESTORE provenance read) —  OPEN QUESTION, SYMPTOM ONLY: the VTS appears to be applying posture multipliers that | RUNNING_ISSUES.md:1822 |
| 21 |  |  | #650 | CC-C | open | 2026-08-05 (CC-C, Kyle-directed sizing + crypto-EV investigation) —  TWO MEASURED ANSWERS: (1) EVERY TRADE FOR ≥5 DAYS HAS SIZED IN DEFENSIVE MODE (×0.6) — the | RUNNING_ISSUES.md:1842 |
| 22 |  |  | #648 | CC-C | open | 2026-08-01 (CC-C, Kyle-directed) —  RTB SIGNALS ARE NOT STUCK — THEY ARE PROMOTED EVERY 30s AND THE TRADE FAILS TO OPEN. ~2,300 SILENT EXECUTION FAILURES IN ONE | RUNNING_ISSUES.md:1860 |
| 23 |  |  | #647 | CC-C | open | 2026-08-01 (CC-C, endorsed independently by CC-A and CC-B) —  THE ALERT QUEUE IS A SHARED MUTABLE RESOURCE WITH NO CLAIM MECHANISM, AND TWO SESSIONS' ACTIONS ON | RUNNING_ISSUES.md:1886 |
| 24 |  |  | #646 | CC-C | open | 2026-08-01 (CC-C; CC-A explicitly handed it over — "yours to file, you found it and you named it") —  resolved_by DOES NOT POPULATE ON THE MANUAL RESOLVE PATH — | RUNNING_ISSUES.md:1920 |
| 25 |  |  | #645 | CC-C | open | 2026-08-01 (CC-C, Kyle-hypothesised and CONFIRMED) —  THE NET-EV FLOOR IS ONE HARDCODED CONSTANT CALIBRATED IN THE CRYPTO ERA AND LATER EXPORTED TO xSTOCK RATHE | RUNNING_ISSUES.md:1935 |
| 26 |  |  | #644 | CC-C | open | 2026-07-31 (CC-C, Kyle-prompted — ANALYST FINDING, not a defect) —  ~98% OF THE ALL-TIME PAPER LOSS IS THE DELIBERATE EXPLORATION SUBSIDY. THE ORGANIC BOOK IS F | RUNNING_ISSUES.md:1946 |
| 27 |  |  | #634 | CC-C | open | 2026-07-31 (filed by CC-C · OWNER: CC-B, Langston-assigned) —  THE DAILY-LOSS EVALUATOR'S FAILURE COUNTER HAS ZERO READERS: when the kill-switch evaluation thro | RUNNING_ISSUES.md:1965 |
| 28 |  |  | #633 | CC-C | open | 2026-07-31 (CC-C) —  THE TARGET-GOAL SAFETY CHECK CANNOT FAIL: it reads TWO guardrail fields that DO NOT EXIST on the response, falls back to fabricated values, | RUNNING_ISSUES.md:1981 |
| 29 |  |  | #632 | CC-C | open | 2026-07-31 (CC-C) —  NOT A DEFECT. A QUESTION ABOUT A KYLE DECISION WHOSE CONDITIONS HAVE CHANGED: the daily-loss window RE-ANCHORS ON EVERY PROCESS RESTART, an | RUNNING_ISSUES.md:1997 |
| 30 |  |  | #631 | CC-A | open | 2026-07-31 (CC-A, Langston-measured) — EXIT-DECISION ARCHIVE PARITY GAP: the ACTIVE-PATH call site carries none of the four entry-mode keys the VTS site now arc | RUNNING_ISSUES.md:2018 |
| 31 |  |  | #630 | CC-A | open | 2026-07-31 (CC-A, Langston-measured) — makerDeadline IS UNTESTED, NOT "working" AND NOT "a gap" — the maker population in the proof window is EMPTY | RUNNING_ISSUES.md:2024 |
| 32 |  |  | #629 | Langston | open | 2026-07-31 (Langston-found, filed by CC-A at his instruction) —  A RE-SURFACING ALERT RE-EMITS ITS FIRST-FIRE MEASUREMENT INSTEAD OF RE-MEASURING — A STALE GAUG | RUNNING_ISSUES.md:2037 |
| 33 |  |  | #628 | CC-C | open | 2026-07-31 (CC-C, scratch-list A9; provenance read per rule 24.0 changed the disposition from "delete six" to "two different answers") —  // 50000 DEFEATS A FAI | RUNNING_ISSUES.md:2048 |
| 34 |  |  | #143 |  | deferred | 2026-05-26 — R-5 SQE_EVAL runtime observation | RUNNING_ISSUES.md:2083 |
| 35 |  |  | #144 | Langston | open | 2026-05-26 — Perp-activation pre-flight checklist (Langston C-1) | RUNNING_ISSUES.md:2086 |
| 36 |  |  | #146 |  | open | 2026-05-26 — Deploy-SHA verification routinization | RUNNING_ISSUES.md:2092 |
| 37 |  |  | #147 |  | deferred | 2026-05-26 — B79.0n.TELEMETRY.b per-class disk persistence | RUNNING_ISSUES.md:2097 |
| 38 |  |  | #148 |  | open | 2026-05-26 — Pre-existing MarketDataHealthCheck EACCES on /home/runner path | RUNNING_ISSUES.md:2100 |
| 39 |  |  | #149 |  | deferred | 2026-05-27 — B79.0n.RTB.b per-class cadence calibration (NO SLA — gates on xstock active-trading evidence window) | RUNNING_ISSUES.md:2105 |
| 40 |  |  | #150 |  | deferred | 2026-05-27 — B79.0n.RTB Phase 4 SET NOT NULL contingent on 48h zero-null gate | RUNNING_ISSUES.md:2108 |
| 41 |  |  | #151 |  | open | 2026-05-27 — Per-class cadence promotion EXISTS-gate pattern (Phase 16 register entry) | RUNNING_ISSUES.md:2111 |
| 42 |  |  | #152 |  | open | 2026-05-27 — LOCKED-module override scope boundary documentation | RUNNING_ISSUES.md:2114 |
| 43 |  |  | #154 |  | open | 2026-05-27 — ARM constructor optional telemetry arg light dead code | RUNNING_ISSUES.md:2122 |
| 44 |  |  | #155 |  | open | 2026-05-27 — perp reason field truncation in orchestrator diagnostic endpoint | RUNNING_ISSUES.md:2125 |
| 45 |  |  | #156 |  | open | 2026-05-27 — Per-class consumer-site swap pattern audit candidate | RUNNING_ISSUES.md:2128 |
| 46 |  |  | #157 |  | open | 2026-05-27 — _meta.knownGaps line-number drift in diagnostic endpoint payload | RUNNING_ISSUES.md:2131 |
| 47 |  |  | #158 |  | open | 2026-05-27 — getPaperSimTrades JS-filter on 24h cutoff inefficient at WIRE-IN volume | RUNNING_ISSUES.md:2134 |
| 48 |  |  | #159 |  | open | 2026-05-27 — [B79.0n.EXECUTION][EMIT_TRADE_CLOSED] canary log volume gating | RUNNING_ISSUES.md:2137 |
| 49 |  |  | #160 |  | open | 2026-05-28 — TFS confidence-formula momentumFactor saturates above 1% xStock momentum (Phase 25 calibration input) | RUNNING_ISSUES.md:2140 |
| 50 |  |  | #166 |  | open | 2026-05-31 — TEC stale-cache fence still firing post-B-NEW-40 (3,716 events in 14-day soak) | RUNNING_ISSUES.md:2194 |
| 51 |  |  | #168 | Langston | open | 2026-06-01 (Langston B-NEW-50 Step-8 flag) — CI cannot catch production-bundle boot crashes (ESM/CJS-interop gap) | RUNNING_ISSUES.md:2224 |
| 52 |  |  | #169 |  | open | 2026-06-01 (B-NEW-47) — context-bridge-log-ttl.ts buffered warm upload latent OOM (deferred) | RUNNING_ISSUES.md:2235 |
| 53 |  |  | #170 |  | open | 2026-06-01 (B-NEW-47) — day-grain is the floor: a single day-slice > 5 GB compressed would permanently stall its partition | RUNNING_ISSUES.md:2238 |
| 54 |  |  | #171 |  | open | 2026-06-01 (B-NEW-47) — corrupt month+day manifest coexistence = MANUAL intervention (runbook, not auto-retry) | RUNNING_ISSUES.md:2241 |
| 55 |  |  | #172 |  | open | 2026-06-01 (B-NEW-47) — stale equity_ duplicate retention keys in data_lifecycle (cleanup; Phase-16 legacy register) | RUNNING_ISSUES.md:2244 |
| 56 |  |  | #173 | Langston | open | 2026-06-01 (F-NOW, Langston A3-2) — consider a RECURRING zero-NULL forward-path guard once Phase-25 consumes the calibration_state dataset | RUNNING_ISSUES.md:2247 |
| 57 |  |  | #174 |  | open | 2026-06-08 (B-NEW-54) — Phase-16 register: predictive-learning teardown REMAINDER (after the ML microservice was retired) | RUNNING_ISSUES.md:2250 |
| 58 |  |  | #198 | Langston | open | 2026-06-02 (B-NEW-51, Langston Step-4) — cron-fire-evidence verifier no_fires_ever edge for a newly-registered cron whose first occurrence is already past | RUNNING_ISSUES.md:2279 |
| 59 |  |  | #199 |  | open | 2026-06-03 (B3.1b) — no honest xStock token-volume feed; volume-confirmation REMOVED on the xStock strategy path | RUNNING_ISSUES.md:2282 |
| 60 |  |  | #200 |  | open | 2026-06-04 (B.4 foundation) — crypto DBS config still reads DEFAULT_DBS_CONFIG; migration to per-class module_constants DEFERRED | RUNNING_ISSUES.md:2285 |
| 61 |  |  | #201 | Langston | open | 2026-06-04 (B.4 foundation, Langston-surfaced) — RE-CHARACTERIZED 2026-06-05: range_trade is starved at the decision substrate (selection effect, NOT a forming- | RUNNING_ISSUES.md:2288 |
| 62 |  |  | #202 |  | open | 2026-06-04 (B.4 foundation) — deploy-hygiene: on-staging study scripts leave git-tree artifacts that block the next git pull; runtime-generated files are git-tr | RUNNING_ISSUES.md:2297 |
| 63 |  |  | #203 |  | open | 2026-06-04 (B.4 foundation) — ORB is plumbing-ready at 15m but enable=FALSE pending its own strategy-fit validation | RUNNING_ISSUES.md:2300 |
| 64 |  |  | #204 | Langston | open | 2026-06-05 (HCE study, Langston-surfaced) — xStock corrupt-stop-price (units/scale) incidence ~45x higher than crypto | RUNNING_ISSUES.md:2303 |
| 65 |  |  | #610 | Langston | open | 2026-07-30 (Langston §13 objection to CC-A's deferral; filed by CC-A) — AMR EV-GAP RING NEEDS A STALENESS BOUND, NOT JUST PERSISTENCE | RUNNING_ISSUES.md:2312 |
| 66 |  |  | #611 | Langston | open | 2026-07-30 (Langston-measured; filed by CC-A) —  THE AMR COMPOSITE AVERAGES FIVE TERMS AS IF COMMENSURABLE: FOUR ARE DEVIATION-FROM-NEUTRAL, ONE IS ABSOLUTE COS | RUNNING_ISSUES.md:2317 |
| 67 |  |  | #612 | Langston | open | 2026-07-30 (Langston §13; filed by CC-A) — THE AMR CONSUMER CANNOT DISTINGUISH 0.699-BECAUSE-CLAMPED FROM 0.699-BECAUSE-CONDITIONS | RUNNING_ISSUES.md:2325 |
| 68 |  |  | #615 | Langston | open | 2026-07-30 (Langston §13 disposition of a flag CC-A raised but declined to scope; filed by CC-A) —  THE REVIEWER'S READ-ONLY VERIFICATION IDENTITY IS THE APPLIC | RUNNING_ISSUES.md:2331 |
| 69 |  |  | #613 | Langston | open | 2026-07-30 (Langston self-corrected; filed by CC-A) —  NO SANCTIONED READ-ONLY DIAGNOSTICS CREDENTIAL EXISTS, SO THE REVIEWER CANNOT VERIFY LIVE STATE WITHOUT F | RUNNING_ISSUES.md:2338 |
| 70 |  |  | #617 | CC-A | open | 2026-07-30 (CC-A, surfaced during B-TRADE-RECORD-RETENTION Step-2; §13 home ruled by Langston) —  THE exit_strategy_alternates → vts_open_trades LINKING ID IS R | RUNNING_ISSUES.md:2348 |
| 71 |  |  | #619 | Langston | open | 2026-07-30 (Langston-surfaced at B-TRADE-RECORD-RETENTION leg-1 Step-4; filed by CC-A) —  THE 2026-05-23 BULK SKIP-MARKER SWEEP ASSUMED A SCHEMA DUMP CAPTURES S | RUNNING_ISSUES.md:2359 |
| 72 |  |  | #627 | CC-C | open | 2026-07-31 (CC-C places the general form at NEW Claude's hand-off — "the general form is yours to place" — with instances from two sessions; PROPOSED AMENDMENT | RUNNING_ISSUES.md:2368 |
| 73 |  |  | #626 | CC-C | open | 2026-07-31 (CC-C; Langston's CONDITION on closing B-COST-MATH-CONSOLIDATION — I shipped a user-facing string containing an open question and gave it no home, wh | RUNNING_ISSUES.md:2400 |
| 74 |  |  | #625 | CC-B | open | 2026-07-30 (CC-B; split OUT of #605 at Langston's instruction — filed at the moment of agreement per §9.4) —  decideOrphanSweep HAS NO BRANCH FOR gov-deadline: | RUNNING_ISSUES.md:2409 |
| 75 |  |  | #624 | CC-C | open | 2026-07-30 (CC-C) —  OPEN QUESTION, NOT A CLAIMED DEFECT: the globalRegime at-open stamp is ABSENT on ~1 IN 3 CRYPTO POSITIONS AND ~1 IN 4 xSTOCK — is that rate | RUNNING_ISSUES.md:2452 |
| 76 |  |  | #623 | CC-A | open | 2026-07-30 (CC-A, Kyle-directed, Langston-ruled) —  B-MEASURE-GATE LEGS 2 + 3: CONVERT MEASUREMENT/PROCESS RULES INTO MECHANISMS (leg 1 = CLAUDE.md rule 29, SHI | RUNNING_ISSUES.md:2463 |
| 77 |  |  | #622 | CC-C | open | 2026-07-29 (CC-C; named at Langston's insistence rather than left as "out of scope for B-MEASURE-GATE" — §13 requires a home AT THE MOMENT OF AGREEMENT, and "no | RUNNING_ISSUES.md:2530 |
| 78 |  |  | #621 | CC-C | open | 2026-07-30 (surfaced by CC-C mid-batch, sharpened by CC-B, filed by CC-A — all three sessions agree it is real) —  THE CODE-REVIEW GATE IS BYPASSED BY MECHANISM | RUNNING_ISSUES.md:2541 |
| 79 |  |  | #620 | CC-C | open | 2026-07-29 (CC-C, opened at Langston's Step-4 insistence — the follow-up B-COST-MATH-CONSOLIDATION named in code but gave NO home, which is the vague deferral § | RUNNING_ISSUES.md:2561 |
| 80 |  |  | #616 | CC-C | open | 2026-07-30 (CC-C — the §13 friction-producer read Langston assigned; this is the item that gates every AMR weight/threshold change) —  THE AMR's FRICTION INPUT | RUNNING_ISSUES.md:2678 |
| 81 |  |  | #614 | CC-C | open | 2026-07-30 (CC-C, found during B-COST-MATH-CONSOLIDATION Step-1; Langston's re-scoped census is what exposed it) —  THE BALANCE SELF-CHECK READS A COLUMN THAT D | RUNNING_ISSUES.md:2704 |
| 82 |  |  | #608 | Langston | open | 2026-07-30 (Langston-measured; filed by CC-A at CC-B's agreement — governance-filing lane) —  THE AMR's friction_choppy PREDICATE IS TRUE ON EFFECTIVELY EVERY C | RUNNING_ISSUES.md:2711 |
| 83 |  |  | #609 | Langston | open | 2026-07-30 (Langston-surfaced; filed by CC-A at CC-B's agreement) — 4,408 CRYPTO AMR LEDGER ROWS CARRY A NULL SCORE AND NULL INPUTS — 3.2% OF THE POPULATION, WH | RUNNING_ISSUES.md:2719 |
| 84 |  |  | #601 | CC-A | open | 2026-07-28 (CC-A, Langston-required §13 home) — THE APP-LOCAL FILE-STORE CLASS IS UNMANAGED, AND A GOVERNANCE DOC ALREADY LEANS ON IT AS "THE DURABLE LONG RECOR | RUNNING_ISSUES.md:2753 |
| 85 |  |  | #209 | Langston | open | 2026-06-08 (B-NEW-53.1 Step-4, Langston condition) — ratchet .tsc-baseline.json down to lock the #207 regression guard | RUNNING_ISSUES.md:2774 |
| 86 |  |  | #211 | Langston | open | 2026-06-09 (item 4 blend-debate finding, Langston code-verified) — TWO drifted finalScore implementations (orchestrator vs vts-runner) | RUNNING_ISSUES.md:2780 |
| 87 |  |  | #212 |  | open | 2026-06-09 (item 4 blend-debate finding) — paper orchestrator persists NO pre-gate rejects (admit-only capture) | RUNNING_ISSUES.md:2783 |
| 88 |  |  | #214 | Langston | open | 2026-06-10 (item 4 step-6 throughput study, CC find + Langston code-confirm) — health_engine broadcast ENGINE block reads the legacy global.tradingEngines regis | RUNNING_ISSUES.md:2790 |
| 89 |  |  | #637 | Langston | open | 2026-07-31 (Langston FOUND IT while verifying a CC-B claim; CC-B filing) —  THE GOVERNANCE CHECKER'S DEAD-MAN SWITCH IS TURNED OFF WHILE THE ENFORCER IT WATCHES | RUNNING_ISSUES.md:2926 |
| 90 |  |  | #638 | CC-B | open | 2026-07-31 (CC-B; Langston-ruled the mechanism) — THE EXIT-SKIP ALERT CLASS HAS NO CLEAR PATH: THE CONDITION CLEARS IN THE ENGINE AND THE ALERT NEVER LEARNS | RUNNING_ISSUES.md:2966 |
| 91 |  |  | #639 | CC-B | open | 2026-07-31 (CC-B + Langston, INDEPENDENTLY from opposite directions) —  THE STOP-LOSS IN FORCE AT CLOSE IS NOT PERSISTED ANYWHERE, SO "DID THE EXIT ACTUALLY REA | RUNNING_ISSUES.md:2996 |
| 92 |  |  | #640 | CC-B | open | 2026-07-31 (CC-B, surfaced by the #639 positive control) — TWO PERSISTED COLUMNS ARE WRITTEN-BUT-NEVER-POPULATED ACROSS EVERY ROW IN THE TABLE | RUNNING_ISSUES.md:3023 |
| 93 |  |  | #642 | CC-A | open | 2026-07-31 (CC-A + CC-B, both instances measured) —  A DISCREDITED NUMBER THAT LIVES IN A SCHEDULED GATE IS SELF-EXECUTING MISINFORMATION: IT FIRES UNATTENDED A | RUNNING_ISSUES.md:3045 |
| 94 |  |  | #641 | Langston | open | 2026-07-31 (Langston enumerated the sites; CC-B filing) —  THE latchTriggerPrice DOC DIVERGENCE: THIRTEEN-PLUS SITES ALL ONE BRANCH TOO WIDE, ALL COPIED FROM ON | RUNNING_ISSUES.md:3060 |
| 95 |  |  | #642 | CC-B | open | 2026-07-31 (CC-B measured, Langston cited the code) — acknowledged_by IS TREATED AS AN OWNERSHIP REGISTER BY TWO CONSUMERS, AND THE LIBRARY GIVES IT NO TRANSFER | RUNNING_ISSUES.md:3074 |
| 96 |  |  | #643 | CC-B | open | 2026-07-31 (CC-B; surfaced building a gate for #592) — A soak_verification GATE CANNOT PUSH, SO A VERIFICATION THAT FINDS A FAILURE IS SILENT BY CONSTRUCTION | RUNNING_ISSUES.md:3094 |
| 97 |  |  | #646 | Langston | open | 2026-07-31 (Langston found it against his OWN mandated behaviour; CC-B filing + owner) —  §10.5's WRITTEN INSTRUCTION MANUFACTURES THE BLIND SPOT IT EXISTS TO P | RUNNING_ISSUES.md:3102 |
| 98 |  |  | #649 | Kyle | open | 2026-08-03 (Kyle-directed; CC-B filing + owner) —  TWO SESSIONS CAN DEPLOY OVER EACH OTHER, AND NOTHING PREVENTS IT — A STAGING DEPLOY LOCK | RUNNING_ISSUES.md:3114 |
| 99 |  |  | #652 | Langston | open | 2026-08-05 (Langston, at B-DEPLOY-LOCK Step-2; CC-B filing) (RENUMBERED from #650 2026-08-06 — CC-B minted into a slot CC-C had taken 28 minutes earlier; newer | RUNNING_ISSUES.md:3126 |
| 100 |  |  | #653 | Langston | open | 2026-08-06 (Langston, at B-DEPLOY-LOCK Step-8; CC-B filing) (RENUMBERED from #651 2026-08-06 — CC-B minted into a slot CC-A had taken 19 hours earlier; same col | RUNNING_ISSUES.md:3130 |
| 101 |  |  | #655 | CC-A | open | 2026-08-06 (CC-A filing; Langston co-authored the control) —  STATELESS PARALLEL RULINGS ARE A SPLIT-BRAIN CLASS: TWO INVOKES OF THE REVIEWER, SAME QUESTION, OP | RUNNING_ISSUES.md:3134 |
| 102 |  |  | #654 | CC-B | open | 2026-08-06 (CC-B; surfaced by alert a1dc9d48 re-firing 32 min after its resolve) — THE CHECKER AGES open DECLARATIONS FOREVER: open-retired DISCHARGES SUPPRESSI | RUNNING_ISSUES.md:3144 |
| 103 |  |  | #660 | CC-B | open | 2026-08-07 (CC-B; from the a45683dc disk alert routed by Langston + flagged unowned by Analyst/Infra) —  PROJECTED CAP BREACH ~2026-09-19 AT THE MEASURED SLOPE: | RUNNING_ISSUES.md:3167 |
| 104 |  |  | #662 | CC-B | open | 2026-08-07 (CC-B; Langston Step-1 rider 1 on B-FILTER-DIAG-STANDARDIZE — homed the same day per §13) — B-ACTIVE-NULL-TAXONOMY: THE ACTIVE PATH EMITS NO PER-STRA | RUNNING_ISSUES.md:3186 |
| 105 |  |  | #663 | CC-B | open | 2026-08-07 (CC-B; Langston Step-1 rider 2 on #660 — assumption (3) needs a home, not a standing caveat) — KYLE DECISION OWED BEFORE END OF AUGUST: DOES THE JULY | RUNNING_ISSUES.md:3190 |
| 106 |  |  | #664 | CC-B | open | 2026-08-07 (CC-B; surfaced by Langston's correction of a false measurement in the B-FILTER-DIAG-STANDARDIZE pre-audit) — aj18-rtb-diagnostic COMPUTES strategies | RUNNING_ISSUES.md:3194 |
| 107 |  |  | #665 | CC-C | open | 2026-08-07 (CC-C; found while digging out the Phase-19 slot/size intent at Kyle's direction) — THE PAPER PER-TRADE ALLOCATION IS 20%, BUT THE GOVERNED DECISION | RUNNING_ISSUES.md:3213 |
| 108 |  |  | #668 | Kyle | open | 2026-08-07 (Kyle-directed; CC-A owns) —  THE GOVERNANCE-STANDARDIZATION ARC HAS NO SINGLE TRACKED HOME, WHICH IS WHY IT KEEPS DRIFTING UNNOTICED | RUNNING_ISSUES.md:3228 |
| 109 |  |  | #683 | CC-A | open | 2026-08-07 (CC-A; §13 home required by Langston at B-TEC Step-4 — an OBSERVATION needs a home or an explicit not-actionable declaration, NOT silence) — THE LOCA | RUNNING_ISSUES.md:3247 |
| 110 |  |  | #677 | CC-A | open | 2026-08-07 (CC-A surfaced + Langston-ruled rule-24 outcome (1) REAL DEFECT;  OWNER = KYLE’S SCOPE CALL — §13 home required at B-TEC Step-1) —  THE B80 OPTION C+ | RUNNING_ISSUES.md:3282 |
| 111 |  |  | #676 | CC-A | open | 2026-08-07 (CC-A; Langston §13 condition on B-TEC-REGIME-PARAM-REMOVAL Step-1 — an OUT-of-scope item needs a named home BEFORE Step-3) —  checkExitConditions(po | RUNNING_ISSUES.md:3313 |
| 112 |  |  | #671 | Kyle | open | 2026-08-07 (Kyle-directed via #668; CC-A owns) —  DECISION RECORDS: THE ARC PIECE WITH A CARD BUT NO ISSUE ENTRY AND NO ROADMAP PLACEMENT — AND ITS DURABILITY R | RUNNING_ISSUES.md:3347 |
| 113 |  |  | #669 | CC-B | open | 2026-08-07 (CC-B; Langston Step-4 finding (B)) (RENUMBERED TWICE — minted #666, collided with CC-C; renumbered #667, collided with CC-C AGAIN within minutes.  T | RUNNING_ISSUES.md:3366 |
| 114 |  |  | #666 | CC-C | open | 2026-08-07 (CC-C, filed at Langston's direction; the forensics in #665 are the argument for it) — guardrails_v2 HAS NO WRITE AUDIT TRAIL, AND ITS last_updated_b | RUNNING_ISSUES.md:3375 |
| 115 |  |  | #667 | CC-C | open | 2026-08-07 (CC-C; Kyle raised it from a staging screenshot, and the code confirms his recollection verbatim) — LIVE MODE HAS REAL GUARDRAIL VALUES IN THE DB THA | RUNNING_ISSUES.md:3391 |
| 116 |  |  | #670 | Infra Claude | open | 2026-08-07 (Infra Claude; homed at Langston's insistence — a "named follow-up" without a numbered home is the open loop §13 exists to close) — CREW-STATUS SNAPS | RUNNING_ISSUES.md:3400 |
| 117 |  |  | #668 | CC-C | open | 2026-08-07 (CC-C; Kyle-directed plumbing audit of live-vs-paper guardrails — "does it match and work the way paper does?") —  IT DOES NOT: LIVE'S BALANCE READER | RUNNING_ISSUES.md:3416 |
| 118 |  |  | #673 | CC-A | open | 2026-08-07 (finding is CC-A's, filed by Infra Claude at Langston's direction — see attribution note) — THE DESKTOP SESSIONS AND THE claude ON PATH ARE DIFFERENT | RUNNING_ISSUES.md:3431 |
| 119 |  |  | #674 | Infra Claude | open | 2026-08-07 (Infra Claude filing at Langston's direction; OWNER: CC-A — governance machinery is his lane) — THREE SESSIONS COLLIDED ON DUPLICATE ISSUE NUMBERS IN | RUNNING_ISSUES.md:3458 |
| 120 |  |  | #675 | CC-B | open | 2026-08-07 (CC-B, B-FILTER-DIAG-STANDARDIZE residual) — the paper xStock per-strategy decline table is EMPTY while crypto's populated immediately; TWO dispositi | RUNNING_ISSUES.md:3488 |
| 121 |  |  | #679 | CC-B | open | 2026-08-07 (CC-B, surfaced handling the re-fire) — resolving a PERSISTENT threshold alert frees its dedupe key, so it re-fires forever; neither terminal state f | RUNNING_ISSUES.md:3573 |
| 122 |  |  | #681 | CC-B | open | 2026-08-07 (CC-B; Langston §13 — the root cause the push gate does NOT address) — a deploy can outrun CI: dt-deploy accepts a sha whose CI has not completed gre | RUNNING_ISSUES.md:3604 |
| 123 |  |  | #684 | CC-B | open | 2026-08-07 (CC-B, from alert def7108b; corroborated by CC-C's 58582bef) — the xStock active-fill freshness limit blocks ~60% of the book at any moment: the guar | RUNNING_ISSUES.md:3622 |
| 124 |  |  | #705 | CC-C | open | 2026-08-20 (CC-C, filed at Langston's Step-4 condition (b) on #704 — he corrected my measurement: I sized the risk on the OHLC writer, where it is recoverable, | RUNNING_ISSUES.md:3689 |
| 125 |  |  | #703 | Kyle | open | 2026-08-20 (Kyle GO, same-day reversal of the wait verdict after the corrected book-depth measurement;  RENUMBERED FROM #700 2026-08-20 — collided with CC-A's c | RUNNING_ISSUES.md:3709 |
| 126 |  |  | #699 | CC-C | open | 2026-08-20 (CC-C — closing a §9.4 gap: the FEEVIABILITY scope's §5 Q5 said "its own issue" and none was ever filed) — RTB POOL: DOES PROMOTION EVICT, OR IS THE | RUNNING_ISSUES.md:3713 |
| 127 |  |  | #698 | Kyle | open | 2026-08-19 (Kyle directive, verbatim intent captured; owner CC-C to scope, Langston to review — a sizing/slots design batch) —  PAPER MODE MUST TRADE LIVE-REALI | RUNNING_ISSUES.md:3717 |
| 128 |  |  | #697 | Kyle | open | 2026-08-19 (Kyle directive — a standing product surface; owner CC-C) —  THE STORAGE OVERVIEW TABLE BECOMES A PERMANENT UI PAGE: per data type — hot window, hot | RUNNING_ISSUES.md:3721 |
| 129 |  |  | #696 | CC-C | open | 2026-08-19 (CC-C; Langston's ruling at the FEEVIABILITY mark-verify revisit — the two volatility-matched discriminators, owner ANALYST, due 2026-08-20) —  DID T | RUNNING_ISSUES.md:3725 |
| 130 |  |  | #693 | CC-C | open | 2026-08-18 (CC-C; the second half of Kyle's trade-volume question, measured same-day) —  THE NET-EXPECTANCY DROUGHT: RTB ADMISSIONS COLLAPSED BECAUSE THE MARKET | RUNNING_ISSUES.md:3729 |
| 131 |  |  | #692 | CC-C | open | 2026-08-18 (CC-C; Kyle's trade-volume sanity check — his observation confirmed and root-caused same-turn) —  THE 08-12 BALANCE RE-ANCHOR FROZE ALL OPENS FOR 4+ | RUNNING_ISSUES.md:3735 |
| 132 |  |  | #691 | CC-C | open | 2026-08-18 (CC-C; the scheduler-miss pattern, stack-narrowed by measurement) —  TWO node-cron DAILY TASKS SILENTLY STOPPED FIRING (03:00 formula audit + 06:00 x | RUNNING_ISSUES.md:3739 |
| 133 |  |  | #689 | CC-C | open | 2026-08-17 (CC-C; Langston's condition (iii) at the OHLC retention ruling — filed same-day per §13, NOT pre-labeled a defect) —  ohlcStoreFraction DIVIDES A WIN | RUNNING_ISSUES.md:3751 |
| 134 |  |  | #688 | CC-C | open | 2026-08-17 (CC-C; Langston's structural finding at the P19-B-PERPFEED OBJ-9 design pass) —  FOUR B70 TABLES STILL CARRY THE MONTHLY-GRANULARITY SWEEP TRAP — IDL | RUNNING_ISSUES.md:3757 |
| 135 |  |  | #687 | CC-C | open | 2026-08-17 (CC-C; surfaced by Langston's live probe at P19-B-PERPFEED Step-1 review) —  equity-perp-universe.json IS 6 SYMBOLS STALE AGAINST KRAKEN'S LIVE LIST | RUNNING_ISSUES.md:3761 |
| 136 |  |  | #686 | CC-C | open | 2026-08-17 (CC-C; Langston-directed OWN item; body REWRITTEN 2026-08-17 r2 — CC-C's original "archival reader consumes stale weights" mechanism was WRONG (leg-3 | RUNNING_ISSUES.md:3765 |
| 137 |  |  | #741 | CC-C | open | 2026-08-23 (CC-C; Kyle-directed investigation — I filed the symptom as a 🟨 finding and he told me to investigate it properly: "This goes towards the credibility | RUNNING_ISSUES.md:3795 |
| 138 |  |  | #741 | CC-A | open | 2026-08-23 (CC-A; found by diagnosing my own 47-minute silence from Langston rather than re-poking a third time) —  A REVIEW DISPATCH THAT EXCEEDS LANGSTON’S 90 | RUNNING_ISSUES.md:3822 |
| 139 |  |  | #761 | CC-A | open | 2026-08-29 (CC-A; I caused a live outage attempting #749 and could not diagnose it) —  THE CONTINUATION-CHUNK FIX TOOK CC↔CC AND CC↔LANGSTON SENDING DOWN FOR ~4 | RUNNING_ISSUES.md:3856 |
| 140 |  |  | #759 | CC-A | open | 2026-08-28 (CC-A; found while running the check itself, and it was about to report a false clean) —  THE MANDATED PER-TURN ALERT CHECK READS tail -50 AND CANNOT | RUNNING_ISSUES.md:3890 |
| 141 |  |  | #758 | CC-A | open | 2026-08-28 (CC-A, at Kyle’s direction after Infra Claude reported non-convergence; Langston re-framed two of my three findings) —  THE REVIEWER LOOP ASKS "IS TH | RUNNING_ISSUES.md:3907 |
| 142 |  |  | #757 | Langston | open | 2026-08-28 (Langston ruling on #756; the replacement for a control that could not work) —  REMOVE THE HAZARD INSTEAD OF MATCHING COMMANDS AGAINST IT. /mnt/gdriv | RUNNING_ISSUES.md:3929 |
| 143 |  |  | #756 | CC-A | open | 2026-08-28 (CC-A, from a fresh-reviewer pass Kyle ordered on everything Langston had not seen) —  TWO OF THE THREE THINGS I REPORTED TODAY WERE WRONG, AND ONE W | RUNNING_ISSUES.md:3944 |
| 144 |  |  | #754 | Infra Claude | open | 2026-08-28 (Infra Claude, diagnosed after Kyle caught the skip; six checkable claims re-derived at the ref by CC-A before adoption — all six hold) —  A SESSION | RUNNING_ISSUES.md:4002 |
| 145 |  |  | #751 | Langston | open | 2026-08-27 (Langston, from a bounce of MY correction — which was itself wrong) —  THE CONDUCT.md CAP IS ENFORCED PER CHECKOUT, NOT PER ARTIFACT. THE SAME FILE I | RUNNING_ISSUES.md:4137 |
| 146 |  |  | #750 | CC-A | open | 2026-08-27 (CC-A; found answering Kyle’s question "are there skills we planned and never created?") —  AN ALWAYS-LOADED RULE TELLS EVERY SESSION TO LOAD A SKILL | RUNNING_ISSUES.md:4161 |
| 147 |  |  | #749 | CC-A | open | 2026-08-27 (CC-A; CC-INFRA reported the symptom to Kyle, Kyle asked for a RULE, and the measurement says a rule would fix ONE POST IN FOUR HUNDRED) —  UNADDRESS | RUNNING_ISSUES.md:4185 |
| 148 |  |  | #748 | CC-A | open | 2026-08-27 (CC-A; CC-C observed the symptom, I found the mechanism, and the mechanism is MY code) —  load-conduct.mjs HAS A SILENT FAIL PATH — AN OUTER catch {} | RUNNING_ISSUES.md:4217 |
| 149 |  |  | #747 | CC-A | open | 2026-08-26 (CC-A, self-filed — Kyle asked "so are we doing a hotfix for that? what are we doing here?" and the honest answer was that I had done neither) —  A G | RUNNING_ISSUES.md:4249 |
| 150 |  |  | #746 | CC-A | open | 2026-08-25 (CC-A; found while measuring how many documents name Langston's model — not by looking for it) —  langston-call — ONE OF LANGSTON'S TWO LIVE MODEL SI | RUNNING_ISSUES.md:4276 |
| 151 |  |  | #740 | CC-A | open | 2026-08-23 (CC-A; Langston directed the filing after re-deriving the frontmatter himself at d0fc181c7 — 12/12 descriptions present, 0 colon-space) —  A ": " IN | RUNNING_ISSUES.md:4361 |
| 152 |  |  | #738 | CC-C | open | 2026-08-22 (CC-C; Kyle-directed investigation — he asked what the exploration lane was FOR and whether its output was ever used, and told me I had glossed it. H | RUNNING_ISSUES.md:4429 |
| 153 |  |  | #737 | CC-C | open | 2026-08-21 (CC-C; Langston found it re-deriving my basis fence — bucket 2, filed not fixed) — 4 CLOSED-TRADE ROWS ARE pnl = NULL AGAINST net_pnl = '0.00000000', | RUNNING_ISSUES.md:4455 |
| 154 |  |  | #736 | CC-C | open | 2026-08-21 (CC-C; Langston-directed at the Step-F review, homed NOW rather than "Phase 21" at his insistence) — THREE RAW-SQL READERS QUERY closed_trades DIRECT | RUNNING_ISSUES.md:4469 |
| 155 |  |  | #734 | CC-C | open | 2026-08-21 (CC-C; found reading the 1,000-row caps for B-BALANCE-TRUTH Step E) —  THE PORTFOLIO-HEALTH DRAWDOWN GATE HAS READ critical SINCE THE 08-12 RE-ANCHOR | RUNNING_ISSUES.md:4532 |
| 156 |  |  | #732 | CC-A | open | 2026-08-20 (CC-A; KYLE spotted a TRAIL STOP badge on the Paper Trading screen and asked how it is possible when trailing/BE/moonbag were turned OFF) —  targetLa | RUNNING_ISSUES.md:4605 |
| 157 |  |  | #702 | CC-A | open | 2026-08-20 (CC-A; raised by Langston at the B-CONDUCT-FILE Step-2 gate, after my own #699/#697 collided with CC-C's) — ISSUE-NUMBER MINTING HAS NO RESERVATION S | RUNNING_ISSUES.md:4781 |
| 158 |  |  | #700 | CC-A | open | 2026-08-20 (CC-A; surfaced in the B-CONDUCT-FILE Step-2 pre-audit —  RENUMBERED FROM #699 at mint+1h: CC-C had taken 699 concurrently. the durable fix + the mea | RUNNING_ISSUES.md:4798 |
| 159 |  |  | #701 | CC-A | open | 2026-08-19 (CC-A; found chasing a review that never came back —  RENUMBERED FROM #697: doubled with CC-C’s storage-report entry) —  A SECOND, DISTINCT CAUSE OF | RUNNING_ISSUES.md:4812 |
| 160 |  |  | #694 | CC-A | open | 2026-08-18 (KYLE-DIRECTED, top priority; CC-A owns) —  THE COORDINATION MACHINERY IS PRODUCING MORE NOISE THAN SIGNAL, AND IT HAS MADE KYLE UNABLE TO USE HIS OW | RUNNING_ISSUES.md:4854 |
| 161 |  |  | #685 | CC-C | open | 2026-08-08 (CC-C; found doing B-CRYPTO-UNBLOCK obj-5, the storage prerequisite Langston bounced as "the thin one") —  crypto_spot_ohlc_1m CANNOT BE TIERED: THE | RUNNING_ISSUES.md:4875 |
| 162 |  |  | #901 | CC-C | open | 2026-08-24 (CC-C; Langston Step-4 condition 2, measured by him at the ref) —  THE EPOCH VALUE STILL HAS TWO HOMES EVEN THOUGH THE RULE NOW HAS ONE | RUNNING_ISSUES.md:4900 |
| 163 |  |  | #902 | CC-C | open | 2026-08-24 (CC-C; Langston Step-4 boundary tightening) — THE LAST TWO UNSCOPED EPOCH READERS, ON THE MAIN DASHBOARD TAB | RUNNING_ISSUES.md:4914 |
| 164 |  |  | #903 | CC-C | open | 2026-08-24 (CC-C) — /api/portfolio/overview 401s ON PAGE LOAD: THE FIRST AUTHENTICATED REQUEST LOSES A RACE, AND THE PORTFOLIO CARD NEVER RECOVERS | RUNNING_ISSUES.md:4919 |
| 165 |  |  | #906 | CC-C | open | 2026-08-25 (CC-C; found because Kyle challenged a claim I made without research — he was right and the research found something bigger) —  THE LIQUIDITY FILTER | RUNNING_ISSUES.md:4942 |
| 166 |  |  | #907 | CC-C | open | 2026-08-26 (CC-C; found in the Kyle-directed benchmark provenance dig) —  volumeUSD IS NOT IN USD. THE VARIABLE NAME IS WHY THE UNIT ERROR SURVIVED, AND IT POIS | RUNNING_ISSUES.md:5007 |
| 167 |  |  | #908 | CC-C | open | 2026-08-26 (CC-C; same dig) — trades24h IS DECLARED, NEVER ASSIGNED, AND DEFAULTS TO A HARDCODED 100 | RUNNING_ISSUES.md:5027 |
| 168 |  |  | #909 | CC-C | open | 2026-08-26 (CC-C; PROVEN, and it replaces #906/#907) —  BITCOIN IS EXCLUDED BY A SYMBOL-FORM MISMATCH IN ONE API CALL, AND EVERY INSTRUMENT THAT COULD HAVE SHOW | RUNNING_ISSUES.md:5058 |
| 169 |  |  | #913 | CC-C | open | 2026-08-26 (CC-C; the home asserted in B_EXIT_PROVENANCE_SCOPE.md R6-4 never existed in this ledger) —  A LOG LINE CALLS THE INTER-TICK CADENCE ageMs=, AND THAT | RUNNING_ISSUES.md:5219 |
| 170 |  |  | #915 | CC-C | open | 2026-08-27 (CC-C; surfaced chasing the stop-distance question, and it is NOT what I was looking for) —  SIX LONG POSITIONS CLOSED stop_hit WITH THEIR STOP RECOR | RUNNING_ISSUES.md:5229 |
| 171 |  |  | #914 | CC-C | open | 2026-08-27 (CC-C; Kyle refused the first version of this entry and was right to) —  VTS EXITS HAVE ZERO SLIPPAGE BY CONSTRUCTION. PAPER EXITS DO NOT. THE TWO PO | RUNNING_ISSUES.md:5292 |
| 172 |  |  | #910 | CC-C | open | 2026-08-26 (CC-C; Langston's condition on the balance-curve hotfix) —  THE EPOCH-READER CENSUS, RUN — AND IT IS NOT "SCOPE EVERYTHING" | RUNNING_ISSUES.md:5345 |
| 173 |  |  | #916 | CC-C | open | 2026-08-27 (CC-C / Claude Analyst) —  OUR STOP AND TARGET PRICES ARE NOT PRICES THE VENUE ACCEPTS | RUNNING_ISSUES.md:5373 |
| 174 |  |  | #918 | CC-C | open | 2026-08-28 (CC-C, surfaced by an independent reader during F-G-1 Step 2) —  EVERY RESTART AND EVERY DEPLOY SILENTLY DISCARDS THE LAST FLUSH WINDOW OF ARCHIVED B | RUNNING_ISSUES.md:5401 |
| 175 |  |  | #920 | Langston | open | 2026-08-28 (Langston found it; Infra Claude filing at his direction — he holds the reproduction, it corrupted HIS review) —  dt-review grep SILENTLY RETURNS ZER | RUNNING_ISSUES.md:5456 |
| 176 |  |  | #921 | CC-C | open | 2026-08-28 (CC-C, found chasing Kyle's requirement that grid refusals get their OWN Filter Diagnostics category) —  THE ENTIRE PRE-SQE REJECT STAGE IS COLLECTED | RUNNING_ISSUES.md:5470 |
| 177 |  |  | #945 | CC-C | open | 2026-08-29 (CC-C; Langston directed the filing when I proposed recording it and NOT promoting it) -  THE BOOK MAY LAG THE TICKER UNDER A FAST MOVE - n=5, A LEAD | RUNNING_ISSUES.md:5548 |
| 178 |  |  | #942 | CC-C | open | 2026-08-29 (CC-C; found running the mandatory per-turn alert check, after an hourly heartbeat contradicted my own read) —  THE "NO SILENT DROP" CLOSURE GUARANTE | RUNNING_ISSUES.md:5784 |
| 179 |  |  | #935 | CC-C | open | 2026-08-28 (CC-C — HOTFIX; surfaced by locking KYLE out of his own system) — THE LOGIN RATE LIMIT IS GLOBAL, NOT PER-CLIENT, SO ANY FIVE ATTEMPTS LOCK OUT EVERY | RUNNING_ISSUES.md:5922 |
| 180 |  |  | #938 | CC-C | open | 2026-08-28 (CC-C, from Langston's discriminating question on #937) — THE xSTOCK TAB'S THREE N/A GATES RENDER AS 0 INSTEAD OF N/A. THE BACKEND HALF SHIPPED; THE | RUNNING_ISSUES.md:5945 |
| 181 |  |  | #932 | CC-INFRA | open | 2026-08-28 (CC-INFRA; found by Langston at the Step-4 r3 approval, re-derived by me before filing) — THE BURN THRESHOLDS ARE FRACTIONS OF THE CAP WHILE THE BUDG | RUNNING_ISSUES.md:6173 |
| 182 |  |  | #931 | CC-INFRA | open | 2026-08-28 (CC-INFRA; Langston required it be filed rather than left as a flag in a change list) — THE FRESH-CONTEXT REVIEWER LOOP IS MANDATED IN FOUR SKILLS AN | RUNNING_ISSUES.md:6205 |
| 183 |  |  | #929 | CC-C | open | 2026-08-28 (CC-C, same reader) — POSITION SIZING HAS TWO ENTRY POINTS AND THE VPG GUARDS ONE | RUNNING_ISSUES.md:6225 |
| 184 |  |  | #980 | CC-A | open | 2026-09-01 (CC-A; Langston named it, and named a home that has since closed) —  THE PER-TURN MANDATED READS ARE SPECIFIED THREE TIMES AND THE THREE DO NOT AGREE | RUNNING_ISSUES.md:7015 |
| 185 |  |  | #981 | CC-A | open | 2026-09-02 (CC-A; Langston refused both OBJ-6d shapes on principle and named the one he would accept) —  RESULT-INSPECTION CANNOT REACH wrong-object'S MOTIVATIN | RUNNING_ISSUES.md:7093 |
| 186 |  |  | #982 | CC-A | open | 2026-09-02 (CC-A; Langston caught it mechanically, re-reading addAlert at 67a2673d9) —  ACK SILENCES AN EVENT-WAIT ALERT, AND THE CLI HAS NO WAY BACK | RUNNING_ISSUES.md:7103 |
| 187 |  |  | #984 | CC-A | open | 2026-09-02 (CC-A; RENUMBERED from #983 — CC-INFRA minted #983 ten minutes earlier at 2a8e6cf00, the newer entry renumbers; a fresh reader found it at Step 7, La | RUNNING_ISSUES.md:7116 |
| 188 |  |  | #989 | CC-INFRA | open | 2026-09-02 (CC-INFRA, B-TOKEN-WATCH; found answering Kyle's question — "how do we know it's working, and can that be taken as had the rope pulled or is still al | RUNNING_ISSUES.md:7346 |
| 189 |  |  | #986 | CC-INFRA | open | 2026-09-02 (CC-INFRA, B-TOKEN-WATCH; CAUSE DIAGNOSED BY LANGSTON at b25ec3006, who re-derived it at the ref in three minutes after I had shipped a fix without i | RUNNING_ISSUES.md:7379 |
| 190 |  |  | #983 | CC-INFRA | open | 2026-09-02 (CC-INFRA, B-TOKEN-WATCH; found while validating the corrected liquidity read) —  THE AGGREGATOR'S PAIR IS CHOSEN BY 24-HOUR VOLUME, SO A FRESHLY-GRA | RUNNING_ISSUES.md:7401 |
| 191 |  |  | #997 | CC-A | open | 2026-09-03 (KYLE-DIRECTED, CC-A investigating; the affected session is CC-C) —  ANALYST CLAUDE HAS BEEN UNABLE TO COMPLETE A SINGLE REQUEST SINCE 13:24Z WHILE T | RUNNING_ISSUES.md:7554 |
| 192 |  |  | #998 | CC-A | open | 2026-09-04 (KYLE-DIRECTED — "log this finding and these recommendations as a next batch"; CC-A) —  OUR RULES ARE IN THE WRONG LAYER, AND THE SIZE OF THE FILE IS | RUNNING_ISSUES.md:7574 |
| 193 |  |  | #999 | CC-A | open | 2026-09-04 (CC-A; Langston Step-4 FINDING-4 on #995, and his CONDITION for clearing that batch) —  THE HOURLY HEARTBEAT TASK STILL DECLARES THE WAKE ITS PRIMARY | RUNNING_ISSUES.md:7606 |
| 194 |  |  | #1002 | CC-A | open | 2026-09-04 (CC-A; the second-order half of #1001, and Kyle pressed the right question — "Are you saying you are going to do this? If not, please slot it") —  EV | RUNNING_ISSUES.md:7645 |
| 195 |  |  | #1004 | CC-B | open | 2026-09-04 (CC-B; Langston's Step-8 ruling that this is its OWN class, not an amendment to #649) —  THE SANCTIONED DEPLOY PATH'S OWN EXECUTABLE IS NOT DERIVED F | RUNNING_ISSUES.md:7656 |
| 196 |  |  | #1017 | CC-C | open | 2026-09-07 (CC-C; Langston verified at the object, third independent witness) —  WE ASK KRAKEN FOR THE PRICE ONLY WHEN SOMEBODY TRADES. ON A QUIET PAIR THAT IS | RUNNING_ISSUES.md:8173 |
| 197 |  |  | #1018 | CC-C | open | 2026-09-07 (CC-C) —  THE DAILY CRYPTO-UNIVERSE RE-CHECK RECOMPUTES AND LOGS, BUT DOES NOT ACT | RUNNING_ISSUES.md:8200 |
| 198 |  |  | #1021 | CC-A | open | 2026-09-09 (CC-A) —  THE DRIFT MONITOR CLEARS ITS OWN ROWS FROM ONLY ONE OF FOUR EXITS, SO A DEPLOY THAT FIXED THE DRIFT LEAVES EVERY RUNG OPEN | RUNNING_ISSUES.md:8226 |
| 199 |  |  | #1020 | CC-A | open | 2026-09-08 (CC-A) —  THE PUSH GUARD'S TSC MEASUREMENT INHERITS THE PREVIOUS TOOL CALL'S WORKING DIRECTORY, AND REFUSES ON A FALSE ZERO | RUNNING_ISSUES.md:8261 |
| 200 |  |  | #1022 | CC-INFRA | open | 2026-09-09 (CC-INFRA) —  BEING LOGGED IN IS NOT BEING AUTHORIZED: 157 OF 216 MUTATING ROUTES CARRY NO AUTHORIZATION GUARD, AND THE viewer ROLE DOES NOT MAKE AN | RUNNING_ISSUES.md:8314 |
| 201 |  |  | #1023 | CC-INFRA | open | 2026-09-09 (CC-INFRA) — 🟥 THE LIVE STAGING PASSWORD IS IN 348 FILES OF A PUBLIC GITHUB REPOSITORY, AND #1022 IS WHAT MAKES THAT MATTER | RUNNING_ISSUES.md:8363 |
| 202 |  |  | #1026 | CC-C | open | 2026-09-10 (CC-C; hit it, did not go looking for it) —  A CHUNKED LANGSTON DISPATCH LEAKS ITS NON-LEADING PARTS INTO THE CHANNEL, AND ANOTHER AGENT'S BOT CAN AN | RUNNING_ISSUES.md:8443 |
| 203 |  |  | #1027 | CC-C | open | 2026-09-10 (CC-C; surfaced by Coltrane's own refusal, then confirmed on the box) —  COLTRANE CANNOT READ THE REPOSITORY: HIS MIRROR REFRESH IS BLOCKED BY GIT'S | RUNNING_ISSUES.md:8484 |
| 204 |  |  | #1029 | CC-C | open | 2026-09-11 (CC-C; Langston found the crypto half re-deriving scope §14 O3 at 9536a3800; the intent and the other producers found by CC-C at the object) —  THE P | RUNNING_ISSUES.md:8555 |
| 205 |  |  | #1035 | CC-C | open | 2026-09-11 (CC-C; Langston flagged the gap while routing alert e3e00f35, the object found by CC-C) —  LANGSTON'S ALERT PROMPT STILL OFFERS ONLY owner=<CC-A/CC-B | RUNNING_ISSUES.md:8644 |
| 206 |  |  | #1038 | CC-A | open | 2026-09-11 (CC-A; found answering Kyle's question "how is the code search tool working?") —  THE CODE SEARCH TOOL HAS NEVER REACHED A SESSION: typescript-lsp IS | RUNNING_ISSUES.md:8666 |
| 207 |  |  | #1057 | Langston | open | 2026-09-13 (out-of-band edit to Langston's live MEMORY.md; NEW Claude reported at Step-10, Langston authorised the merge, reconciled + read-back-verified by CC- | RUNNING_ISSUES.md:9272 |
| 208 |  |  | #1063 | CC-B | open | 2026-09-13 (CC-B traced it; symptom logged by CC-C 2026-08-01 on #648; Langston re-derived the drift and ruled the routing) —  THE CODE DECLARES ENUM VALUES THE | RUNNING_ISSUES.md:9464 |
| 209 |  |  | #1072 | CC-C | open | 2026-09-22 (CC-C; raised by Langston's KII triage; mechanism CORRECTED by Langston at 56e3d0cbd) —  THE CRYPTO SNAPSHOT ARCHIVER'S SYMBOL SET IS ONE INSTANTANEO | RUNNING_ISSUES.md:9655 |
| 210 |  |  | #1073 | CC-C | open | 2026-09-22 (CC-C; found by a second reader at 8a-P3/8a-P4 Step 10, re-derived at the code) —  A PRICE REFUSAL ALSO SUSPENDS THE RESTING ORDER'S DEADLINE — BOTH | RUNNING_ISSUES.md:9665 |
| 211 |  |  | #1075 | CC-C | open | 2026-09-22 (CC-C; found while enumerating 3n.q3's valve set; a second reader, claim-only, found the collision rule and the stamp-at-source precedent) —  THE VTS | RUNNING_ISSUES.md:9677 |
| 212 | B-CONDUCT-DELIVERY-HOTFIX |  | #744 #745 | CC-A | open | 2026-08-25 (CC-A; Langston declined to rule at the B-CONDUCT-DELIVERY-HOTFIX gate and named it a mechanism question) —  THE #702 ISSUE-NUMBER BLOCKS DO NOT HOLD | RUNNING_ISSUES.md:4304; RUNNING_ISSUES.md:4343 |
| 213 | B-DISAGREEMENT-FINDER |  | #974 | CC-A | open | 2026-08-31 (CC-A, from the B-DISAGREEMENT-FINDER census; Langston ruled it SUBSTANTIVE and disposition (3)) —  OPEN WORK LIVING UNDER A CLOSED HEADING IS INVISI | RUNNING_ISSUES.md:1062 |
| 214 | B-EPOCH-KEYING-PARITY |  | #900 | CC-C | open | 2026-08-24 (CC-C; Langston Step-4 condition 1, B-EPOCH-KEYING-PARITY) —  THE EPOCH RULE NOW HAS ONE HOME; THE PARITY FENCE ONLY PROVES TS↔TS, AND THE READER THA | RUNNING_ISSUES.md:4891 |
| 215 | B-EXIT-POLICY-EVALUATOR |  | #1051 | CC-B | open | 2026-09-12 (CC-B, surfaced settling Langston's blocker on the B-EXIT-POLICY-EVALUATOR geometry leg) —  THE PATTERN POOL SHIPS ITS OWN HARDCODED TRADE GEOMETRY, | RUNNING_ISSUES.md:9346 |
| 216 | B-OBSERVATION-EPOCH |  | #904 | CC-C | open | 2026-08-24 (CC-C, found while discharging the checker's own alerts for B-OBSERVATION-EPOCH) —  THE GOVERNANCE CHECKER'S kind: 'entry' TEST IS SATISFIED BY ANOTH | RUNNING_ISSUES.md:4926 |

## Other — 8

| # | name | plan / roadmap id | issues | owner | status | gist | sources |
|---:|---|---|---|---|---|---|---|
| 1 | B-CANONICAL-BRIDGE-CHURN |  | #1039 | CC-A | open | / 4.56a /  CLOSED 2026-09-11 — B-CANONICAL-BRIDGE-CHURN (#402) / batch / U-1 met; five residuals at P19-B12 / | CC_A_SESSION_TASK_LIST.md:35; CC_A_SESSION_TASK_LIST.md:75; RUNNING_ISSUES.md:8696 |
| 2 | B-CLAUDEMD-SLIM |  | #762 | CC-A | open | / GOV-ARC #668 — the arc's status home / the one place that says where the whole programme stands / last updated 7 August — stale by four closes (1c, 1d, leg 2, | CC_A_SESSION_TASK_LIST.md:150; RUNNING_ISSUES.md:3844 |
| 3 | B-DEPLOY-DRIFT-LINE |  | #1008 | CC-A | open | / 4.55 /  CLOSED 2026-09-09 — B-DEPLOY-DRIFT-LINE (#1002) / batch / all four criteria met / | CC_A_SESSION_TASK_LIST.md:33; CC_A_SESSION_TASK_LIST.md:74; RUNNING_ISSUES.md:7842 |
| 4 | B-GOV-REPORTING |  | #752 | CC-A | open | /  B-GOV-REPORTING (row 8) / pushed to the branch — the review gate NEVER RAN / me / Scope exists; no pre-audit, no completion report. These reporting + ledger- | CC_A_SESSION_TASK_LIST.md:21; CC_A_SESSION_TASK_LIST.md:42; CC_A_SESSION_TASK_LIST.md:65 |
| 5 | B-SIZING-DEC-RESTORE |  | #659 | CC-C | open | / RUN ORDER banner / B-SIZING-DEC-RESTORE / obj-1, obj-10, obj-11 LIVE at 213e162dc (it sizes every trade); obj-2..5 and Steps 4-11 not built; declared in GOVER | CC_C_SESSION_TASK_LIST.md:24; RUNNING_ISSUES.md:1816 |
| 6 | B-TSC-PUSH-GATE |  | #680 | CC-B | open | / Deploy safety / #649 (partly addressed by dt-deploy), #652 (pm2 save), #653, #681 (a deploy can outrun CI), #680 (B-TSC-PUSH-GATE, Langston PROCEED) / | CC_B_SESSION_TASK_LIST.md:106; RUNNING_ISSUES.md:3586 |
| 7 | B-WAKE-LEAD-NAME |  | #1043 | CC-INFRA | open | / ⏳ B-WAKE-LEAD-NAME (row 4.51, #1040) / Step 10 — Step 8 confirmed; FINDING-A approved; the FINDING-D hunk is with Langston / Langston's okay on 0df01c687 / th | CC_INFRA_SESSION_TASK_LIST.md:15; CC_INFRA_SESSION_TASK_LIST.md:27; RUNNING_ISSUES.md:8770 |
| 8 | B-WAKE-QUIET |  | #1001 #1005 | CC-A | open | - B-WAKE-QUIET (#995, row 4.5) — CLOSED 2026-09-05. Langston confirmed. Spawned rows 4.55, 4.6, 4.7 and #1005 (this batch skipped its own Step 2). | CC_A_SESSION_TASK_LIST.md:76; RUNNING_ISSUES.md:7627; RUNNING_ISSUES.md:7685 |

