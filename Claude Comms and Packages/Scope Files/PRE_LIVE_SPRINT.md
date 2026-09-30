# THE SPRINT TO LIVE — the re-sorted list (Kyle's go-live rules, 2026-09-28)

**Kyle's rule:** everything needed to get paper to the point where the mechanics are sound and working as intended, the thresholds / gates / regimes / strategies / scores are tuned, the prices are right, paper tells the truth, we capture the data we mean to learn from, and paper trades profitably and consistently — plus the live-mode fixes, mixed into the same push. **Everything else goes after live.** No phase names: one list, prioritised next.

**In the sprint (snapshot 2026-09-28): 198** — the live order is the rows of `1-system-manual/SPRINT_TO_LIVE_PLAN.md` §4, the one working order · **After live: 212** (+6 moved to the sprint; the counting rule is under that heading) · **Running now (observation windows):** the plan's §5 · **Parked by Kyle: 7** · awaiting owner confirmation: see the draft's UNCONFIRMED section.

> ⚠️ **Category is not schedule (Langston S1):** the counts below say WHY an item was in the sprint; WHEN it runs is the sprint plan's §4 (`1-system-manual/SPRINT_TO_LIVE_PLAN.md`), the one working order. Plan from §4, not from these counts.

**SNAPSHOT, 2026-09-28 — NOT A LIVE COUNT (Langston, 2026-09-30).** Population: the 198 items of the working order `sort.py` generated that day (56 + 32 + 19 + 13 + 27 + 48 + 3 = 198). The per-item category tags it was counted from went with that working order, so it cannot be recounted; the instrument is archived at `1-system-manual/_archive/deleted-code/sort.py.20260930-B-PLAN-CURRENCY-CHECK.removed`. The sprint plan's §4 has no category column.

| category | items |
|---|---:|
| 1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close) | 56 |
| 2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores | 32 |
| 3. Prices — the feed is correct and paper uses the right price for each job | 19 |
| 4. Paper tells the truth — no mistake that makes results look better or worse than they are | 13 |
| 5. Learning data — capturing what we intend to learn from | 27 |
| 6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment | 48 |
| 7. The evidence — trading profitably and consistently in paper | 3 |

> ⛔ **HAND-MAINTAINED SINCE 2026-09-29 — EDIT THIS FILE DIRECTLY; DO NOT RE-RUN `scripts/inventory/`** (Langston ruling 2026-09-29). It was first BUILT from `PRE_LIVE_INVENTORY_DRAFT.md` (Langston-approved r8) by `scripts/inventory/sort.py`, with the working order from `order.py` and Kyle's decisions in `kyle_decisions.json`. `sort.py`, `order.py`, `plan_doc.py` and `push_keys.json` were DELETED by sprint row 1 `B-PLAN-CURRENCY-CHECK` (2026-09-30; `1-system-manual/DELETED_COMPONENTS_LOG.md`, the `B-PLAN-CURRENCY-CHECK` entry); a green `order.py` run was never evidence the plan is complete. The working plan is `1-system-manual/SPRINT_TO_LIVE_PLAN.md`, also hand-maintained. The scripts still in `scripts/inventory/` point into NEW Claude's clone: making every one of them take its repo root from the environment and fail closed when it is unset is sprint row 1c `B-INVENTORY-SCRIPT-ROOT-REDIRECT` (CC-A, `#1119`), which the deletion does not discharge (Langston, 2026-09-30).

## Where the sprint order lives

The sprint order is `1-system-manual/SPRINT_TO_LIVE_PLAN.md` §4, and the observation windows are its §5. This file carried a second, generated copy of both until `B-PLAN-CURRENCY-CHECK` removed it on 2026-09-30, after reconciling it against the plan (the plan's value stood on every divergence: `Claude Comms and Packages/Scope Files/B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md`, findings DL-A6 to DL-A9). The removed copy's Wave 0 GATE heading is not lost: its content lives on as the GATE sentence of the sprint plan's Wave 0 heading, `### Wave 0 — NOW — urgent, cheap, or already in flight`, in form (c) — no sha, no holder, no date — citing the current `deploy-hold` row(s) in `GOVERNANCE_EXCEPTIONS.md` by name, which carry the held commit, the window and its end (`1-system-manual/DELETED_COMPONENTS_LOG.md`, the `B-PLAN-CURRENCY-CHECK` entry).

## After live — 213 after live (+6 moved to the sprint, listed below)

> Counting rule: every `- ` line under this heading, less the lines marked ➡️ MOVED to the sprint (6) and the struck-through lines that record a withdrawal, supersession or closure (3). Recounted 2026-09-30: 221 − 6 − 3 = 212. The theme headings below use the same rule.

### AMR and machine learning — 25 (+6 moved to the sprint)

- #608 (CC-B) — ➡️ MOVED to the sprint, `SPRINT_TO_LIVE_PLAN` row 124a (Kyle 2026-09-30: fix the AMR's observation lens before live; switch-on stays after live)
- #609 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- #610 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30) — the AMR still stays watch-only until after live; only its observations are corrected
- #611 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- #612 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- B-AMR-CONTEXT-BONUS-REWIRE (CC-A) — Kyle 2026-09-28: all AMR work after live
- B-AMR-INPUT-INTEGRITY-ARC (CC-C) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30: fix the observation lens in the sprint; switch-on after live). Was: Kyle 2026-09-28: AMR fixes after live; stalled since 2026-07-30 with no plan row — place it in the post-live section · carries `#604` (leg A) and `#600` (a stale AMR comment blesses the wrong cap; land before any AMR flip) (2026-09-29)
- 17.1 Scope & Grounding (Week 23) — - Define full scope of ML inte (—) — already placed post-live in the roadmap
- 17.2 ML Touchpoint & Influence Mapping (Weeks 24-25) — #### Featu (—) — already placed post-live in the roadmap
- 17.3 Infrastructure Design (Weeks 25-26) — - In-process module vs (—) — already placed post-live in the roadmap
- 17.4 Research & Feature Engineering (Weeks 26-27) — - Evaluate ML (—) — already placed post-live in the roadmap
- 17.5 Blueprint Assembly (Weeks 27-28) — - Merge data flow, touchp (—) — already placed post-live in the roadmap
- 17.5.1 Rules-Based Policy Engine — - Implement the policy execution (—) — already placed post-live in the roadmap
- 17.5.2 Predictive Adjustment Execution — - Wire Predictive Adjustme (—) — already placed post-live in the roadmap
- 17.5.3 Calibration Execution — - Learning Calibration can now updat (—) — already placed post-live in the roadmap
- 17.5.4 Regime-Aware Adaptation — - Structural Regime (Global + Pair (—) — already placed post-live in the roadmap
- 17.6 Trend Mining Engine — design consideration (Kyle directive 2 (—) — already placed post-live in the roadmap
- 18.1 Crawl: Feature Store & Data Pipeline — - Build Feature Store (—) — already placed post-live in the roadmap
- 18.2 Walk: Model Training & Validation — - Train initial models o (—) — already placed post-live in the roadmap
- 18.3 Run: Integration & Parallel Execution — - Wire Inbound touch (—) — already placed post-live in the roadmap
- 18.4 Fly: ML as Primary Intelligence — - ML replaces rules-based (—) — already placed post-live in the roadmap
- 18.5 Trend Mining Engine — parallel architecture (per Phase 17.6 (—) — already placed post-live in the roadmap
- 19.6.4 Forward role — ML / AI conversational layer API — When the M (—) — forward role for the ML conversational layer — Phase 17/18
- 25-1 B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) Tier 2 ML calibra (—) — ML calibration tier 2 — its own row says it needs live evidence
- 25-11 Order-book / liquidity-aware position sizing + thin-market e (—) — SPLIT (Langston): the liquidity-aware sizing MODEL is Phase 25 calibration. The small fail-closed REFUSAL half is a separate MUST item (25-11a)
- 25-22 Edge-decay monitor — selection-IC + per-strategy calibration (—) — edge-decay monitor — research idea; most valuable once live
- 25-23 Probabilistic hidden-state (HMM-style) regime inference → re (—) — hidden-state regime inference — research idea
- 25-24 Orthogonal weak-feature enrichment of the per-cycle selectio (—) — weak-feature ranking enrichment — research idea
- 25-25 Cross-instrument / relative-value (statistical-arbitrage) si (—) — cross-instrument / relative-value signals — research idea
- 25-27 Profitable-signal PROFILE → reverse-engineer a scanner PRE-S (—) — profile of a profitable signal, reversed into a scanner pre-screen
- 25-6 AMR posture-model M2 calibration (post-launch — Phase 17/18 (—) — AMR posture model calibration — its own row says post-launch

### Break-even, trailing and moonbag exits — 6

- B-TEC-STATE-DURABILITY (?) — on restart the engine reads every open position's trailing progress from one /tmp file inside a catch-and-continue — a corrupt file boots with zero trailing pro
- Break-even stop + moonbag exits ((none)) — 
- Shadow break-even and moonbag calculations (paper now, live later) (?) — Kyle: launch with both off, but compute what break-even stops and moonbags WOULD have done on every paper trade (and live trades once live), so we can analyse w
- row:3n.c (CC-C) — trailing-exit state lost on restart — becomes MUST the moment trailing exits are switched on (see BE-MOONBAG)
- #639 (CC-B) — the stop in force at close is kept only on the open-position row and lost at close — a must once break-even or trailing is switched on; re-enters the sprint if row 69 finds a real exit defect (added 2026-09-29)
- #551 (CC-B) — re-judge an OPEN trade's stop and target against the current regime and volatility, not only trail on price — a new exit behaviour; cross-reference B-EXIT-POLICY-EVALUATOR (added 2026-09-29)

### Crew, reviewer, governance and alert tooling — 70 (+3 struck through)

- B-RULES-CHANGE-CLASS (CC-A) — the `rules_change` change-class: a five-field case file pushed alone and ruled on BEFORE a rules edit lands; its own definition is its first case (Langston 2026-08-26, restored 2026-09-29, #744). ⛔ BEFORE B-GATE-GUARD (its line, under Other, carries the dependency)
- 2.4b B-ALERT-QUEUE-INTEGRITY (CC-B) — #647 (no claim or lock discipline on the alert file; the watchdog appends outside the lock; rewrites drop malformed rows) + #1074 (open-batch backstop alerts have no resolve edge) + #654 (the checker ignores open-retired rows and treats any COMPLETION filename as a close) — alert tooling (added 2026-09-29)
- B-CREW-SENDER-IDENTITY (CC-B) — `cc-send --sender` is free text over one shared webhook, so a Discord display name is a claim, not an identity — crew tooling, same class as B-WRITER-ACTOR-ALLOWLIST (added 2026-09-29)
- #1026 (Infra Claude) — chunked Langston dispatch leaks parts into the channel — comms
- #1035 (Infra Claude) — Langston's alert prompt lists only three owners
- B-REVIEW-REF-READ (Infra Claude, #1131) — Langston's review tool can read only `migration/aws-supabase`, so a throwaway `migration/<name>` review branch has no supported read path (Langston, 2026-09-30)
- #1043 (CC-INFRA) — a pinned GitHub read served the wrong file — reviewer tooling
- #169 (—) — the context-bridge-log retention job: a latent out-of-memory and (per Langston's archive) never installed
- #219 (—) — dormant flip-rate governance input
- ~~#449 (CC-B) — governance checker read a frozen rulebook~~ — **CLOSED 2026-09-30 by its filer (CC-B): `B_GOV_INTEGRITY_0_COMPLETION_REPORT.md` line 55 records it fully resolved.**
- #655 (CC-A) — stateless parallel rulings — crew process
- #669 (CC-B) — Langston Step-4 finding (B) — contents need the owner's read
- #670 (—) — crew-status cold hand-off
- #679 (CC-B) — persistent threshold alerts re-fire forever once resolved
- #700 (CC-A) — crew process
- #701 (CC-A) — crew process
- #746 (CC-A) — Langston's second model site has no repo source
- #748 (CC-A) — the hook that loads CONDUCT.md has a silent fail path — cause not yet named
- #920 (—) — reviewer grep returns zero on a bad flag
- #942 (CC-C) — info alerts outside the no-silent-drop guarantee
- #982 alert hold verb (CC-A) — an ack silences an event-wait alert permanently and there is no un-ack; Kyle approved a third action subject to Langston's ruling; five alerts are acked-and-sil
- B-ALERT-ACK-PROCEDURE-DOCFIX (CC-B) — alert procedure doc
- B-ALERT-LIFECYCLE (CC-C) — alert-tooling quality of life; its own row says it does not block the trading sequence · owner from `RUNNING_ISSUES` `#912`'s HOME line, the only explicit owner statement (`#443`, the originating issue, names none): *"HOME: `B-ALERT-LIFECYCLE`, owner CC-C, slotted with the rest of that batch's checker-hardening scope."* (B-PLAN-CURRENCY-CHECK, Langston 2026-09-30; CC-C told — if CC-C declines, this cell records the disagreement and it returns to Langston) · `#1125`: `recurrence_interval_seconds` is written on every alert and read by nothing; wire native recurrence or delete it (`B-PLAN-CURRENCY-CHECK`, Langston 2026-09-30)
- B-ALERT-OWNERSHIP-REGISTER (CC-B) — alert ownership transfer
- B-ALERT-TAXONOMY (CC-A) — alert categories · `#38`'s original scope was absorbed by `B-GOV-INTEGRITY-1` (2026-07-10: one category constant, validated at `addAlert`) · this line now carries `#448`'s residual: the creatable vocabulary still offers `soak_verification`, `verification` and `reminder`, one family with three creatable members — a scope decision, not a defect (Langston 2026-09-30)
- B-ALERT-WINDOW-EXPIRY (CC-A) — no terminal alert state for 'can no longer be observed' — alert tooling
- B-CANONICAL-CORPUS-ACCURACY (CC-C) — accuracy of the pre-governance reference corpus
- B-CANONICAL-FREEZE (CC-C) — its own row says governance hygiene, not on the trading path
- B-CHANGE-CLASS-DOCSET-FIT (CC-B) — governance checker doc-set matrix — governance
- B-CHANGE-CLASS-PARSER (CC-C) — governance-checker parser
- B-CHECKER-CORE-PATHS (CC-A) — governance-checker core paths
- B-CHUNK-ADDRESSING (CC-A) — comms outage cause
- B-CLAIM-REDERIVE (CC-A) — re-derive a load-bearing number at the Stop boundary — crew tooling
- B-DECISION-RECORDS (CC-A) — decision-history durability and catalogues (CC-A governance lane)
- B-DISCORD-CONNECT-RESILIENCE (CC-A) — Discord library crash on outage
- B-FRESHNESS-LOG-READER (CC-B) — nothing reads the rules-freshness hook's log — crew tooling
- B-GOV-2 (—) — checker always-on gate
- B-GOV-4 (CC-C) — checker entry test
- B-GOV-INTEGRITY-0 (CC-A) — reviewer frozen rulebook · carries `#455`'s CC-A leg (its home points here; Langston R2-Q10 (0), 2026-09-30)
- B-GOV-LEDGER-GRADE (#1099, CC-A) — the checker grades the commit-message ledger's presence and completeness; `roadmap` probably belongs in `sub_batch`; a report that opens NOT CLOSED should not count as a close; and a conditional doc is never graded today. ✅ Here by Langston's ruling (2026-09-29, B-GOV-REPORTING G6): the GOV-ARC list he named on 2026-08-29 is in a history plan, and GOV-ARC itself (#668) is parked by Kyle, so it confers no position. · `#451` (B-GOV-5's F7 leg): the `steps-combined:` scope declaration as a DECLARED PREDICATE the checker reads, beside the conditional doc that is never graded — cross-reference `B-CHANGE-CLASS-PARSER` (Langston 2026-09-30) · three items added 2026-09-30 by `B-PLAN-CURRENCY-CHECK` (Langston §10i): a hollowed required doc passes live grading (presence only); a self-confirmed exceptions row is invisible; `B-RULES-1c`/`-1d` cannot find their combined report after the id-pattern fix. Detail on `#1099`
- B-HEARTBEAT-RESCOPE (CC-A) — hourly heartbeat task purpose — crew tooling
- B-HOOK-ESTATE-VERSION (CC-C) — clones run different versions of one hook — crew tooling
- B-LANGSTON-CONTEXT remaining pieces (Infra Claude) — the reviewer's memory composer: P-2 retrofit + #1055, P-1b, and the privacy-check positive control
- B-LANGSTON-FILE-FLOOR (Infra Claude) — reviewer's always-loaded file size — reviewer tooling
- B-LANGSTON-LEDGER-SPLIT (CC-B) — how the reviewer's loaded set stops growing; with 2.8a/2.8c (Infra)
- B-LANGSTON-LOAD-RATCHET (Infra Claude) — reviewer tooling
- B-LANGSTON-RECONCILE-VERB (Infra Claude) — reviewer tooling
- B-LEDGER-HEADLINE-INJECT (Infra Claude) — reviewer tooling
- B-MEASURE-GATE (CC-A) — re-surfacing alerts re-emit old measurements
- B-OPEN-OBLIGATION-SWEEP (CC-B) — process instrument for homed-but-unwatched items
- B-PYCACHE-PREFIX-INVOCATION (—) — reviewer-tooling hardening on the Helsinki box; not the trading path (a planted-cache execution vector — worth doing, not a live blocker)
- ~~B-READ-MODEL-BLOB-VERIFY (Infra Claude)~~ — **SUPERSEDED 2026-09-29 (§9.4 disposition 5): B-CREDENTIALS-PRIVATE-REPO OBJ-4a's `dt-review show <sha>` re-hashes commit, trees and blob (live on Helsinki, Langston Step 8); `#1043` closes at that batch's OBJ-6 flip.** Was: the reviewer's pinned reads served the wrong file twice — a reviewer reading the wrong object weakens every review before live (Infra)
- B-REVIEWER-LOOP (CC-A) — plan row 4, PLACED 2026-08-28, open (CC-A lane reply) — governance tooling
- B-RULES-LAYER (CC-A) — Kyle-directed: move behavioural rules to a stronger layer — crew process
- ~~B-DRIFT-UNCAPPED-DIFF (CC-A)~~ — **WITHDRAWN 2026-09-30 (§9.4 disposition 5): `#1117` is added to `B-CREDENTIALS-PRIVATE-REPO` (Infra Claude, running now), whose approved drift conversion already reads the uncapped local diff with `--no-renames` (`B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md:601`).** Was: the deploy-drift monitor's runtime-path gate goes UNDECIDABLE when staging is more than 300 files behind (the GitHub compare cap, `dt-deploy-drift.sh:265`).
- B-CHECKER-BLOCK-GATE (CC-A) — #1107: let the governance checker block a close, as Kyle approved 2026-07-10 for real issues only; ⛔ AFTER B-RULES-LAYER; gated on the measured checker-precision figure (the share of its alerts that were real), measured from the alert store, never from the tick summary (`#1107`, 2026-09-30)
- B-SCRIPTS-TSC-COVERAGE (CC-B) — type-checking coverage for the scripts folder — tooling
- B-SHARED-TMP-ISOLATION (CC-B) — sessions share /tmp so a commit message can be another session's — crew tooling
- B-STATE-ASSERTION-LINT (CC-A) — sentences true when written and wrong now — governance tooling
- #653 (CC-A proposed at filing; CC-B filed) — two System Manual lines still tell a session to git pull the retired clone, in a Replit-era section; documentation only, CLAUDE.md §7.1 binds (added 2026-09-29)
- #444 (CC-B) — nothing checks that an issue's named home batch is still open, so an issue homed to a closed batch looks homed and silently dies; if Langston rules it gates plan currency, it moves to sprint row 1 (added 2026-09-29)
- B-TOKENWATCH-OBSERVED-AT (CC-INFRA) — token watch tooling
- B-TOKENWATCH-PAIR-SELECT (CC-INFRA) — token watch tooling
- B-TSC-COVERS-TESTS (CC-C) — type-checking coverage for test files — tooling
- B-TSC-GUARD-DETERMINISM (CC-A) — CI type-check guard determinism — tooling
- B-UMBRELLA-OPEN-STATE (CC-B) — governance checker state for umbrella batches
- B-WAKE-SOURCE-TRUTH (CC-INFRA) — crew wake-source documentation
- B-WAKE-OUT-OF-BAND (CC-INFRA) — a way to wake a session whose wake watcher has died that does not travel through that watcher (the hourly heartbeat now posts to Discord, which a dead watcher cannot read; `#1054` amendment 2026-09-29). After B-WAKE-SOURCE-TRUTH, so it is specified against true docs. Intake test (§2): crew tooling, not in the §1 rule, so after live.
- B-WRITER-ACTOR-ALLOWLIST (CC-B) — Langston memory-tool actor names — reviewer tooling
- Stop appending closed-batch history to Langston's memory (Infra Claude) — every batch close appends to his memory and nothing evicts; keep current state and generalising rulings, evict by supersession
- 12.2 lookalike register (CC-A) — one page of the pairs that already caused wrong calls — FIRST BREAK by Langston's ruling
- 20.3 Test Infrastructure — - Add unified test runner scripts ( te (—) — test runner and frontend test tooling
- row:1 (CC-A) — crew-process rule mechanisms (B-RULES-1e) — governance tooling, no effect on trading

### Legacy and dead-code cleanup (the reachability census may pull some forward) — 20

- B-AI-CHAT-REMOVAL (CC-C) — Kyle 2026-09-30: the AI chat is dead code, remove it with finality. Its ACTION path (intent executor + the seven `/intent/*` routes + the approval components) goes NOW in `B-SIZING-DEC-RESTORE` 2e because it touches paper trading; THIS entry is the rest — conversation, saved chats, chat logs/costs routes, and the unmounted assistant/panel/container/sidebar/insights components (`ai-opportunities-tab` is mounted and stays). 0 calls in ~11 days of access logs. Pull forward if Kyle wants it before live.

- #1042 (CC-B) — `calibration_ledger.decision_grade` is a flag no code reads and no screen shows; it read true on wrong xStock fee rates (added 2026-09-29)
- #507 rider (CC-B) — `triggerSoftResubscribe` in the mini-book integrity monitor is kept and never called; #507's own checksum work is done (added 2026-09-29)
- #1055 (—) — delete a dead legacy write on Langston's box
- #154 (—) — dead optional constructor argument
- #518 (CC-B) — delete a dormant commented-out guardrail block (rule 18)
- #528 (CC-B) — delete an unused 1,376-line trades page (rule 18)
- #537 (CC-B) — untracked orphan script
- #625 (CC-B) — orphan sweep lacks a branch for deadline keys
- #686 (CC-C) — relocate a runtime file out of bridge/canonical; its reader's scheduler is dead — no live effect (CC-C)
- B-ASSET-CAPS-REMOVAL (—) — open: delete an orphaned pre-governance service (orphan premise confirmed by census) — the dead-code reachability census decides if it moves
- B-ORPHAN-ROOT-SCANNER (CC-C) — dead code (disposition 5) — legacy removal, no live effect
- B-SCANNER-DEDUPE-DEAD-TABLE (CC-C) — dead table cleanup
- 16.2 Database Phase A-B: Isolation & Modularization — - Confirm w (—) — database isolation and modularisation — no live-safety effect (a proposed deferral: the run order puts Phase 16 before live)
- 16.3 Database Phase C: Schema Simplification — - Drop Wave 3 tabl (—) — drop legacy tables and enums — proposed deferral
- 16.4 Wave 7: Post-L-Series Cleanup — - SafetyGuardrails service r (—) — remove the old SafetyGuardrails service — only matters if any live path still consults it
- 16.5 LSP Error Resolution — - Delete legacy files causing LSP err (—) — editor/type error cleanup
- 16.8 Predictive-Learning / ML-Era Teardown REMAINDER (added 2026- (—) — ML-era teardown remainder — Kyle decided REMOVE
- 16.9 resetRateLimiter() — INERT ON THE ONLY ENVIRONMENT WE RUN (a (—) — inert rate-limiter reset — Kyle slotted it in Phase 16
- row:3n.b (CC-C) — orphan level tables (disposition 5) — legacy removal

### Other (research, UI, refactors) — 75

- #1020 (CC-A) — push guard inherits the previous call's working directory and refuses on a false zero (hit again building this draft)
- #148 (—) — health check permission error on a Replit-era path
- #151 (—) — Phase 16 register entry
- #152 (—) — document the locked-module override boundary
- #156 (—) — audit candidate for per-class consumer swaps
- #157 (—) — line-number drift in a diagnostic payload
- #158 (—) — inefficient 24h filter at volume
- #159 (—) — log volume gating for a canary line
- #171 (—) — corrupt manifest needs a manual runbook
- #173 (—) — a recurring zero-null guard once Phase 25 reads the dataset
- #198 (—) — cron-evidence verifier edge case
- #202 (—) — study scripts leave files on staging that block the next pull
- #209 (—) — ratchet the type-check baseline down
- #217 (—) — RTB context bonus in shadow
- #229 (Kyle) — four symbol-format modules that accept different forms — consolidate
- #234 (—) — 390 non-active-path type errors, each homed
- #298 (Kyle) — ticker shown instead of company name
- #391 (CC-B) — monitor the xStock in-hours flat-price block rate
- #463 (—) — bridge code reviewed by documentation, not diff
- #606 (CC-B) — a method note filed as its own entry
- #621 (CC-C) — code-review gate grades a diff by mechanism
- #626 (CC-C) — an open question shipped in a user-facing string
- #642 (CC-A) — a discredited number inside a scheduled gate (CC-A copy of a doubled number)
- #646 (CC-C) — resolved_by not populated on manual resolve
- #660 (Kyle) — trade tables' 365-day hot window never re-asked
- #673 (CC-A) — desktop sessions and the CLI are different versions
- #680 (CC-B) — type-check gate at push time
- #683 (CC-A) — flaky test collection failures
- #740 (CC-A) — skill description colon trap
- #970 (CC-A) — its home B-DISAGREEMENT-FINDER closed on a negative result — needs a new home or a withdrawal (CC-A proposing)
- B-BURN-THRESHOLD-BASIS (CC-INFRA) — not withdrawn — token-watch alarm tuning (Infra)
- B-CATALOG-1 (Kyle) — table catalogue + lookalike register
- B-CATALOG-2 (CC-A) — its FIRST catalogue is the diagnostic-coverage map (Kyle: 'where we have diagnostics and where we don't') — how Kyle sees what live is and is not watched. The r
- B-CREW-BOARD-REMOVAL (CC-A) — retired board code — gated on Kyle
- System Manual row conflict (CC-B) — 
- B-DAILY-CUTOVER-SWEEP (CC-C) — four tables idle 29 nights then sweep everything at once
- B-DEPLOY-REF-DECLARATION (CC-C) — deploy-tool declaration
- B-DISPATCH-STAGING-VERIFY (CC-C) — its own row says it blocks nothing
- B-EOL-NORMALISE (CC-A) — line-ending normalisation
- B-EOL-POLICY (—) — line-ending policy
- B-EXIT-LINE-IDENTITY (CC-C) — trade id and class on the exit log line, so a close is read by identity
- B-EXIT-PATH-TYPING (CC-A) — the exit path is untyped
- B-EXIT-POLICY-EVALUATOR (CC-B) — our expectancy model cannot rank exit alternatives; needs B-OUTCOME-CORPUS-CAPTURE first (not a defect — a missing capability)
- B-GATE-GUARD (CC-A) — issue-number blocks; ⛔ AFTER B-RULES-CHANGE-CLASS lands (crew tooling; Langston 2026-08-26, restored 2026-09-29, recorded on #744), and it carries the `SCOPE:` trailer on governed-artifact pushes
- B-GATE-WILDCARD-REFUSE (CC-B) — code-side guard behind a migration invariant that already refuses the bad row
- B-GDRIVE-UNMOUNT (Infra Claude) — placed 2026-08-28, not parked; owner Infra Claude; absorbs #921
- B-GOV-INTEGRITY-3 (CC-A) — message id spans · carries `#452` `#453` `#492` `#493` `#494` (their homes point here; B-PLAN-CURRENCY-CHECK P15, 2026-09-30)
- B-HORIZON-GRID-COMPARABILITY (CC-B) — makes holding-horizon numbers comparable — precondition for the exit-policy evaluator
- B-LANGSTON-QUEUE-2 (CC-A) — review queue lock · the batch itself closed 2026-07-11; what remains here is `#484` (a Langston verdict does not record which invoke produced it or what it saw) and `#486` (a follow-up that does not name Langston is dropped silently) (2026-09-29) · and `#487` (a staged artifact reaches Langston with no provenance header or read-back; Langston R2-Q10 (0), 2026-09-30) · `#485`'s CC-A leg: the read-back rule only (its headline, the blocked set as an obligations register nothing reads, is CC-B's leg on the parked B-GOV-INTEGRITY-2 line; `B-OPEN-OBLIGATION-SWEEP` (CC-B) is the process instrument beside both) (Langston 2026-09-30)
- B-OBS-WINDOW-EVIDENCE-CAPTURE (CC-C) — capture observation-window evidence at the event — measurement quality
- B-PRICE-DOC-CONSOLIDATE (Kyle) — merge two price documents into one — Kyle wants it done, but it is documentation
- B-QUOTE-PEG-DEVIATION-WATCH (CC-C) — watch for quote-peg deviation; its row says it gates nothing
- B-SLOT-PLACEMENT-CHECK (CC-A) — Kyle's own ask: a newly slotted item reaches the plan and the owning task list at the moment it is slotted — the failure this inventory is repairing by hand ➕ **Also carries (Langston, `B-PLAN-CURRENCY-CHECK` Step-2 part 3, 2026-09-30): the session task lists are DERIVED views of the plan, and their refresh trigger is stated and homed here** — three ownership copies with two drifting (the reconcile found 18 CC-C and 2 CC-A task-list divergences) is how a fourth number appears. · **input:** `scripts/governance-checker/checker.mjs` `planRowsByBatch` (B-PLAN-CURRENCY-CHECK)
- B-STORAGE-CATALOG (CC-A) — unmanaged app-local file store
- B-TOKEN-WATCH Steps 7-11 (Infra Claude) — research feed paused at Step 7; no trading link
- B-TSC-BASELINE-TS2345-AUDIT (CC-B) — 32 suppressed type errors in the routes file, one tied to the balance
- B-TSC-GUARD-CWD (CC-B) — push guard working directory
- B-VERIFY-DISCIPLINE (CC-C) — absence-reads-as-pass defect class
- B-VOLATILITY-CACHE-RETIRE (CC-B) — 
- B-VPG-ROW-ALIGN (CC-C) — its own row says display-only
- The 11 GB old-conversation sweep for things discussed and never picked (Infra Claude) — Kyle asked for everything discussed and not gotten back to; this feeds the inventory itself
- 19-13 §19.3 Performance Validation Latency, throughput, queue dept (—) — latency / throughput / cadence under load — matters more as volume grows than on day one
- 19-15 #97 xStock asset-specific characteristics inventory Earnings (—) — xStock fundamentals enrichment (earnings, P/E, ratings) — plumbing, not a live-safety need
- 19-16 B79.6 sector-aware portfolio-cluster prevention Equities clu (—) — sector-cluster prevention — correlated xStock positions multiply risk; concurrency caps bound it today
- 19-17 NEW — Active Trading Simulations (Kyle directive 2026-05-27) (—) — active-trading simulations — more learning data per day for Phase 25; not a live-safety need
- 19-5 §19.x Boot Readiness Coordinator Unify the patchwork boot se (—) — boot readiness coordinator — conditional on boot cascades, which have not recurred
- 19.6 External Source Connection & Capacity Diagnostics Dashboard (—) — external-source and capacity diagnostics dashboard — visibility that catches a live problem fast
- 19.6.6 Internal subsystem health + EARLY-FAILURE detection (NEW 202 (—) — early-failure detection — catch failures in progress; high value once real capital is exposed
- 21.4 POST-LAUNCH REVISIT — the strong-trend lane's absent volume (—) — already placed post-live in the roadmap
- 21.4.1 8-module extraction — Per MODULARIZATION_SYNTHESIS_FROM_B63_ (—) — already placed post-live in the roadmap
- 21.4.3 storage.ts modularization (folded in from Phase 16.2) — Phas (—) — already placed post-live in the roadmap
- 21.5.2 Perpetual Futures Integration — - Add Kraken Futures API end (—) — already placed post-live in the roadmap
- 21.5.3 Cross-Asset Infrastructure — - Unified portfolio view across (—) — already placed post-live in the roadmap
- 22.1 Build & Deploy Pipeline — - Production build validation - En (—) — already placed post-live in the roadmap
- 22.2 Monitoring & Observability — - Production logging strategy ( (—) — already placed post-live in the roadmap

### Perpetual futures — 5

- #144 (—) — perpetual-futures activation checklist — perps come after live
- #155 (—) — perp reason truncated in a diagnostic endpoint
- #687 (CC-C) — equity-perp universe file stale — perps are after live (merges into P19-B-PERPFEED)
- B-FUNNEL-PERP-CLASSES (CC-C) — open: the funnel can only key the two spot classes; perps come after live (an interim alert shipped in F-G-1)
- B-FUTURES-BAR-FINAL (CC-C) — futures bar finality — perps are post-live, but check whether any live-class signal reads these bars

### Storage, database and production hardening — 12

- #147 (—) — per-class telemetry disk persistence
- #172 (—) — stale duplicate retention keys
- #685 (CC-C) — crypto 1-minute bars cannot be tiered to warm storage
- #689 (CC-C) — storage-fraction numerator/denominator mismatch
- #697 (Kyle) — storage overview UI page (Kyle directive)
- B-ARCHIVE-RETENTION-SIZING (Kyle) — Kyle decided 2026-09-23: no action, August tiers to warm in October; the uninstalled context_bridge_log TTL job is a separate small defect
- 12.6 decommission residue (CC-A) — per-table rule-18 census of 9 walter_* tables + backups — its bytes count toward the 72% disk sizing
- 20.1 Database Phase D: Migration Rebaseline — - Generate fresh ba (—) — migration rebaseline
- 20.2 Database Phase E: Index & Retention Hygiene — - Audit index (—) — index and retention hygiene — database at 72% of plan (Kyle: August moves to warm storage in October)
- 20.3.1 — Unit/integration test-tier separation (RUNNING_ISSUES #226 (—) — unit / integration test-tier separation
- 20.4.5 Observability hardening (NEW 2026-06-12 — §19.6.6 long-tail) (—) — observability hardening
- 20.5 Architecture Cleanup — - Decompose monolithic pages (enhance (—) — decompose large pages and route files

## Parked by Kyle — 7 (unchanged)

- B-ALERT-DEDUPE-REASON-DRIFT — parked by Kyle, deliberately undated
- B-GOV-INTEGRITY-2 — parked by Kyle, deliberately undated · carries `#481` (the general governed-read helper and lint; the dangerous shape is already blocked by a hook) · `#480` · `#485` (CC-B's leg) — added 2026-09-30 when their dated homes were placed here · **re-homed when Kyle unparks it, or on the first leg that blocks sprint work** (Langston 2026-09-30; the owner cell stays empty while parked)
- B-RULES-1E-LANGSTON-SLIM — parked by Kyle, deliberately undated
- #392 — parked by Kyle, deliberately undated
- #668 — the governance-standardisation arc — a DIFFERENT thing from B-SIZING-DEC-RESTORE, which only cites it
- #693 — parked by Kyle, deliberately undated
- #741 — parked by Kyle, deliberately undated

