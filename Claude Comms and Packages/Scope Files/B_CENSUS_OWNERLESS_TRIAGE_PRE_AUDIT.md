# B-CENSUS-OWNERLESS-TRIAGE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r2)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1n · **Issue:** `#1139` · **Scope:** r2 at `169a2cf5d`, **APPROVED by Langston 2026-10-07 ~01:30Z with two conditions** (folded below: C1 → §2 + §4 item 1; C2 → §3).

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED: the census skips 9 plan rows (r1 §5, measured at `a6ff8f316`). NOW: 12 at `b3d650521` (10 at the scope ref `169a2cf5d`). REASON:** rows `2a0h`, `2a0i`, `2a0e` were added after my count; Langston measured 10 and 12 by enumeration, and I re-derived both: `2a0`, `2a0b`, `2a0c`, `2a0d`, `2a0e`, `2a0h`, `2a0i`, `2a1`, `2a1a`, `2a2`, `3a1` (CC-B), `4a2` (CC-C).
- **PREVIOUSLY STATED (r1): 24 CLOSED / 4 WITHDRAWN / 32 PLACED. NOW: the same 24 / 4 / 32.** No outcome moved; every citation was rewritten into a token a script resolves (§3).
- **PREVIOUSLY STATED (r1 §2b): code citations `active-execution-engine.ts:3774/:4094/:4350` (#418), `server/index.ts:298` (#228), `routes.ts:8888-8895` (#381). NOW: `:3791`/`:4111`, `:301`, `:8858`. REASON:** the branch moved; the old numbers were from an earlier read. Every line is now checked by the resolver at a pinned ref, and re-checked at the close sha.

## 1. AUDIT

### 1.1 Sources read (the six, named)
| # | source | read? | for what |
|---|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | yes | every code citation (resolver, §3); `census.mjs` / `checker.mjs` row parsing |
| 2 | runtime logs + database | yes | `#439` (staging DB, 30 h of 1-minute bars), `#225` (`out.log` stall rate), `#409` (pm2 log dir), `#299` (server path), alert file (`#228`) |
| 3 | `SYSTEM_IMPACT_MAP.md` | per issue naming a component | whether the component still exists |
| 4 | `SYSTEM_MANUAL.md` | not applicable | no architecture changes |
| 5 | ledger + reports | yes | each entry in full, `git log -S "#<n>"`, the completion reports cited |
| 6 | `bridge/canonical/` | not needed | no disputed or pre-governance behaviour |

### 1.2 The grader is blind to 12 plan rows — measured, with a positive control (Langston C1)
`census.mjs:310` keeps a §4 row only if `/^\d+[a-z]?$/` matches its id; `checker.mjs:336` (`PLAN_ROW_NO`, the live plan-state check) uses the same pattern, and `census.mjs:408` (`AFTER_ROW`) the same shape. At `b3d650521`: **283** §4 rows by line scan, **271** parsed.
**Positive control (working copy, reverted):** with `+ #214` written on row `2a0b`, the census at head reads `#214` **U1 (unplaced)**; with the one-line widening to `\d+[a-z0-9]*`, it parses **283** rows and reads `#214` **placed by number**. Negative control in the same runs: `#404`, not written on the row, stays **U6** both times.
⇒ **disposition 1, folded into this batch** (Step 3 item P1). Two of the 55 (`#214`, `#404`, both on row `2a0b`) depend on it; none of the five uses a deep row. **No placement is moved to a regex-visible row to make OBJ-2 read clean** (Langston C1).
⚠️ Once deployed, the live plan-state check grades 12 more rows and may raise alerts it could not raise before — expected.

### 1.3 Owner rule (scope C1) applied
Of the 8 entries that name a session the census cannot see: `#174` (CC-A), `#238` (CC-B), `#1047` (CC-C) are placed with the session they name; `#345`, `#536`, `#754`, `#997` are CLOSED; **`#523` departs** (names CC-B; placed CC-A, reason in its row). No Kyle-directed item is WITHDRAWN (`#174` PLACED, `#327` and `#997` CLOSED).

### 1.4 Measurements behind the live items
- **`#439`:** `xstock_spot_ohlc_1m`, the 30 h to 2026-10-06 21:56Z: every whole hour has bars in all 60 minutes (31 hourly buckets; edges partial). Control: `crypto_spot_ohlc_1m` populated over the last 3 h. Each bar lands ~15 min after its minute — already recorded (`#994`).
- **`#225`:** `/var/log/dawntrader/out.log` 17:31:56Z-21:57Z: 39 `[4.6B][STALL]`, 8.8/h, p50 193 ms, max 318 ms, 9 at ≥250 ms (pinned ceiling ≈8/h, p50 191, max 554).
- **`#409`:** `~deploy/.pm2/logs` 2026-10-06: the 1.5 GB `dawntrader-out.log` absent; a 0-byte `dawntrader-error.log` remains.

## 2. THE 60 (generated from the same data the Step-3 script writes)

### CLOSED (24)

| # | why | CITE |
|---|---|---|
| #146 | dt-deploy fails a deploy whose built sha is not the requested one — the automated check this entry asked for (B-DEPLOY-LOCK). | file scripts/dt-deploy.sh:219 "BUILD_SHA" · report B_DEPLOY_LOCK_COMPLETION_REPORT.md |
| #212 | the reject hooks landed in P19-B5a. | commit 1e119531a · report P19_B5a_COMPLETION_REPORT.md |
| #228 | the fallthrough hook is registered and has been quiet since 2026-06-18. | file server/index.ts:301 "setClassifyFallthroughHook(" · measured "alert file 2026-10-06: 6 fallthrough alerts, all 2026-06-17/18, none since (1,238 rows read)" |
| #230 | same hook and evidence as #228. | file server/index.ts:301 "setClassifyFallthroughHook(" |
| #232 | the floor's value and its intent are written at the constant (Batch 52 Fix 19); active trading uses strict netEV > 0. | file server/services/vts-runner.ts:555 "VTS_NET_EV_FLOOR = -0.01" |
| #236 | its own text: RESOLVED by the B6.6 price-liveness gate with the B4b.1 depth gate. | commit 2398702e8 · report P19_B6_6_COMPLETION_REPORT.md |
| #295 | its own text: RESOLVED by the B4b.1 depth-sufficiency gate. | commit b74526dc3 · report P19_B4b_1_COMPLETION_REPORT.md |
| #299 | its own text: fixed on the server 2026-06-15 during B-NAMES.1; the re-provisioning note above still applies. | measured "staging 2026-10-07: /var/lib/dawntrader is deploy:deploy and holds xstock-universe-cache.json" · report B_NAMES_1_COMPLETION_REPORT.md |
| #300 | its own text: RESOLVED (dispositions (a)-(c)); its new finding went to #301. | commit 977f3be08 · report P19_B4b_2_COMPLETION_REPORT.md |
| #301 | its own text: RESOLVED in P19-B6.7 (the second Kraken feed removed). | report P19_B6_7_COMPLETION_REPORT.md |
| #320 | the defense-in-depth reject at the queueSQESignal chokepoint shipped in B6.5b. | report P19_B6_5b_5c_COMPLETION_REPORT.md |
| #325 | its own text: RESOLVED (gate-10 moved to B6.5g). | commit dbd0a2283 · report P19_B6_5e_COMPLETION_REPORT.md |
| #326 | its own text: RESOLVED, Langston Step-8 confirmed. | commit 3bd3deedc · report P19_B6_5D_COMPLETION_REPORT.md |
| #327 | the dead import was removed in P19-B6.5e (the commit subject names #327). | commit 0dd25ff4c · report P19_B6_5e_COMPLETION_REPORT.md |
| #328 | the criteria-limiter was deleted. | commit e41359ee8 |
| #329 | getTopSignal and checkForPromotion were deleted in P19-B8.10. | commit 8b13fe0b8 · report P19_B8_10_COMPLETION_REPORT.md |
| #342 | the queue accepts status=ready. | file comms-infra/discord/langston_queue.py:277 "st != \"ready\"" |
| #343 | the queue accepts the unquoted want form. | file comms-infra/discord/langston_queue.py:52 "want=" |
| #345 | its own text: RESOLVED (79/79 tests, live shakeout passed, self-advance back on). | commit 907cd93db · report B_LANGSTON_QUEUE_345_COMPLETION_REPORT.md |
| #347 | the committed default governs. | file scripts/governance-checker/config.mjs:276 "process.env.GOV_CUTOFF \|\|" · measured "Helsinki 2026-10-06: GOV_CUTOFF is not set in the checker unit, so the committed default governs" |
| #418 | the closer computes net P&L and writes it to the closed-trade row. | file server/services/active-execution-engine.ts:3791 "computeRealizedPnl" · file server/services/active-execution-engine.ts:4111 "netPnl: netPnl.toString()" |
| #536 | its own text: RESOLVED, both legs (Langston pulled both rows from the live database 2026-07-19). | report P19_B8_10_COMPLETION_REPORT.md |
| #754 | the STEP: N of 11 format shipped (Kyle scoped it down to that); the recurrence tripwire is in the weekly mistake pass. | commit b97cb49d0 · file CLAUDE.md:25 "STEP: N of 11" |
| #997 | the cause was external and the session recovered; the transcript trim it also asked for rides Infra Claude's B-TRANSCRIPT-ARCHIVE. | measured "the cause was the status.claude.com incident of 2026-09-03 13:26Z; ANALYST Claude has posted normally since (e.g. its W41 handover reply 2026-10-06 21:09Z)" · inflight B-TRANSCRIPT-ARCHIVE |

### WITHDRAWN (§9.4 disposition 5) (4)

| # | why | CITE |
|---|---|---|
| #170 | a documented limit, not a defect: not reachable at current volume, accepted at Langston's Step-2 fold-in #3; this entry stays as its record. | report B_NEW_47_COMPLETION_REPORT.md |
| #227 | an inquiry, never a gate: the decided paper-fill design proceeds regardless; re-opens only if Kraken offers a hosted-fill path. | report P19_B2_COMPLETION_REPORT.md |
| #346 | a one-time event that has happened (the first activation, 2026-06-23); the back-off prevents a recurrence. | report B_ALERT_PROTOCOL_COMPLETION_REPORT.md |
| #381 | a convention, written at its only site. | file server/routes.ts:8858 "VERBATIM-minus-redaction" |

### PLACED (27 + #410 second entry)

| # | owner | HOME | why | CITE |
|---|---|---|---|---|
| #160 | CC-A | row 151 (TFS sustainability gate, Phase 25) | an input to the same TFS calibration decision. | row 151 |
| #174 | CC-A | the after-live line 16.8 (ML-era teardown remainder) | its decided home (Kyle: REMOVE, Phase 16); the entry names CC-A. | after "16.8 Predictive-Learning / ML-Era Teardown REMAINDER" |
| #200 | CC-A | row 144a (xStock DBS gap) | the crypto half of the same DBS-config symmetry; the in-code default is still read. | row 144a · file server/core/metrics/directional-bias.ts:59 "DEFAULT_DBS_CONFIG" |
| #211 | CC-A | row 148 (B-RETIRED-SCORE-REMOVAL) | a retired-score remnant. | row 148 |
| #303 | CC-A | row 169 (B-KILLSWITCH-DENOMINATOR) | kill-switch. | row 169 |
| #321 | CC-A | row 197 (21.2 paper-to-live parallel run) | the paper-plus-live co-run is that row's content. | row 197 |
| #323 | CC-A | row 170 (B-TOTAL-DRAWDOWN-WARNING) | risk control. | row 170 |
| #331 | CC-A | row 157 (B-LEGACY-LIVE-EXIT-PATH) | an exit-path decision needed before live: a three-way 'not wanted, because' or a build item. | row 157 |
| #384 | CC-A | row 148a (calibrated win probability) | the missing VTS gate-verdict column is an input to that rebuild. | row 148a |
| #390 | CC-A | row 1e (trade-record retention close-out) | the shadow pool members table has no retention. | row 1e |
| #406 | CC-A | row 1e (trade-record retention close-out) | the VTS persistence header still describes a closed_trades migration that has no writer; correct it to the in-place close. | row 1e · file server/services/vts-trade-persistence.ts:31 "INSERT-into-closed_trades" · file server/services/active-execution-engine.ts:5486 "storage.createClosedTrade" |
| #410 | CC-A | row 191 (B-VENUE-RESTING-EXITS) | the real post-only resting-order lifecycle; the haircut calibration stays Phase 25. | row 191 |
| #431 | CC-A | the after-live line B-STORAGE-CATALOG | storage hygiene; re-homed twice in July to a batch that was never named. | after "B-STORAGE-CATALOG (CC-A)" |
| #435 | CC-A | row 181 (21-3d balance truth) | live buying-power valuation. | row 181 |
| #440 | CC-A | row 142 (xStock calibration block, data-capture gap) | xStock cadence tuning. | row 142 |
| #442 | CC-A | row 142 (xStock calibration block, data-capture gap) | venue-timestamp capture is that row's data-capture gap; B-XSTOCK-VENUE-TS was never placed. | row 142 |
| #523 | CC-A | row 101 (#522) | DEPARTS from the named session (CC-B, the gates sweep's filer) for a stated reason: the paper leg is done and what remains is Kyle's ratification at the #522 pre-live gate, which is row 101, a gates item in CC-A's §6 group. | row 101 |
| #214 | CC-B | row 2a0b (B-ENGINE-HEARTBEAT-DEAD-PATHS) | the health monitor reads the global engine map that row's batch settles. | row 2a0b · file server/services/health-monitor.ts:444 "tradingEngines" |
| #225 | CC-B | the after-live line B-EVENT-LOOP-RESIDUAL | measured at the pinned ceiling; most attributed stalls follow the FX5 scanner's cycle tail. | after "B-EVENT-LOOP-RESIDUAL" · measured "staging out.log 17:31:56Z-21:57Z 2026-10-06: 39 stalls, 8.8/h, p50 193 ms, max 318 ms" |
| #238 | CC-B | row 52 (B-SILENT-STRATEGY-CENSUS) | strategy evaluation coverage; the entry names CC-B. | row 52 |
| #388 | CC-B | row 134a (shadow-sink outcomes) | shadow rehydration fail-direction. | row 134a |
| #389 | CC-B | row 134a (shadow-sink outcomes) | the shadow capture flag. | row 134a |
| #404 | CC-B | row 2a0b (B-ENGINE-HEARTBEAT-DEAD-PATHS) | the heartbeat's dead session check is what that row removes. | row 2a0b |
| #411 | CC-B | row 52 (B-SILENT-STRATEGY-CENSUS) | measure pattern-path signal volume under the NetEV gate. | row 52 |
| #1047 | CC-C | row 17 (B-PRICE-SIDE-BY-JOB) | price side; the entry names CC-C. | row 17 |
| #403 | Infra Claude | the after-live line B-CI-TEST-HYGIENE | CI flake; the test has no raised timeout. | after "B-CI-TEST-HYGIENE" |
| #409 | Infra Claude | row 158 (B-SEC-HARDEN) | one 0-byte dead log file remains — a one-command removal. | row 158 · measured "staging 2026-10-06: the 1.5 GB dawntrader-out.log is gone; a 0-byte dawntrader-error.log remains in ~deploy/.pm2/logs" |
| #410 (2nd entry) | PLACED | row 158 (B-SEC-HARDEN) | route-family symmetry; that batch already walks every route. | row 158 |

### CC-A's four and #532 (graded by OBJ-4 / OBJ-5; owners PENDING their agreement at OBJ-3)

| # | owner | HOME | why | CITE |
|---|---|---|---|---|
| #439 | CC-B | row 3a (B-FEED-HEALTH-GRADE-ARM) | the stall did not reproduce; the detector's blind spot for an OHLC-only stall is that row's feed-level liveness. | row 3a · measured "staging DB 2026-10-06 to 21:56Z: xstock_spot_ohlc_1m has bars in all 60 minutes of every whole hour for 30 h; crypto control populated" |
| #575 | CC-B | row 54 (#574) | a measurement objective inside #574's batch (Langston's ruling), and that row is CC-B's. | row 54 |
| #596 | CC-B | row 122 (#590) | its own home is 'alongside #590', CC-B's row. | row 122 |
| #613 | Infra Claude | B-CREDENTIALS-PRIVATE-REPO OBJ-1 (in flight, sprint plan §0) | OBJ-1 of that batch is a crew login usable by all six with an empty write allowlist — the durable read-only credential this asks for; it closes when that batch closes, once Langston's own call is shown to work. | inflight B-CREDENTIALS-PRIVATE-REPO |
| #532 | CC-B | row 55 (B-RTB-REFRESH-CONSOLIDATE) | row 55 already carries 'OBJ-2b-6 (#532) open' under CC-B; the head is rewritten so OPEN leads (OBJ-5). | row 55 |


## 3. HOW OBJ-1 IS GRADED (Langston C2: the parser is stated)
`resolve1n.py` — its **own** line scan of the plan (§4 rows of 7 cells with ids `\d+[a-z0-9]*`; §0 in-flight lines; the after-live list), **never `census.parsePlan`**. Each triage line carries `CITE:` tokens: `commit` (exists and is an ancestor of the ref), `report` (exists under Batch Completion), `file path:line "needle"` (the line exists and contains the needle), `row` (exists and its status cell does not open closed), `after`, `inflight`; `measured` tokens are live-system readings, counted apart and not claimed as resolved.
**At `b3d650521`:** 61 cited items, **75 tokens resolve, 7 measured, 2 unresolved** — the two after-live lines Step 3 writes (`B-EVENT-LOOP-RESIDUAL`, `B-CI-TEST-HYGIENE`). **Control:** five deliberately bad tokens (a missing commit, report, needle, row and after-live line) are all reported UNRESOLVED.

## 4. IMPLEMENTATION PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| P1 | widen the row-id pattern at `census.mjs:310`, `census.mjs:408` and `checker.mjs:336` to `\d+[a-z0-9]*`; tests: a `2a0b` row parses, places an issue by number, counts in the recount, resolves `after row 2a0b`, and `planRowsByBatch` keeps it | §1.2 |
| P2 | edit the 60 entries in place: head status word (CLOSED / WITHDRAWN), one `W41 TRIAGE` line per entry with outcome, owner, HOME and `CITE:` tokens; never stacked (`#753`); `#532`'s head rewritten so OPEN leads | §2 |
| P3 | plan: `+ #N` on each named row's note cell; after-live: two new lines and `#431`, `#174` added to their lines | §2 |
| P4 | §6 recounted in the close commit with `recountS6` (after P1 it counts the 12 deep rows) | scope OBJ-7 |
| P5 | hand-over posts by number (CC-B 11, Infra 4, CC-C 1); the five pending owners recorded with who agreed | scope OBJ-3/OBJ-4 |
| P6 | OBJ-1 `resolve1n.py --from-ledger` at the close sha: 0 unresolved; OBJ-2 census dry run: 0 of the 55; OBJ-5 `#532` off the self-contradiction list; OBJ-6 the full outcome table handed to Langston to pick 10 | scope §3 |

## 5. JUDGEMENT CALLS TO ATTACK
1. **9 CLOSED on their own RESOLVED text** now each cite the commit and/or report the text names (resolved by script). Is a commit + report enough, or do you want your OBJ-6 sample weighted onto these?
2. **`#331` on row 157** — an exit-path row for what is first a decision.
3. **`#613`'s home is an in-flight §0 batch, not a §4 row** — `B-CREDENTIALS-PRIVATE-REPO` has no §4 row. The resolver accepts `inflight`; the census does not grade it (it is one of the five, graded by OBJ-4).
4. **P1 lives in this batch** — a code leg in a ledger-triage batch, because OBJ-2 depends on it.

**NOT RE-READ** (no fresh reader routed, per the one-pass rule): the 32 placements' choice of row; the `#523` departure reason.
