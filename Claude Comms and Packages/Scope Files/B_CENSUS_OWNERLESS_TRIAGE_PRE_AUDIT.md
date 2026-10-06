# B-CENSUS-OWNERLESS-TRIAGE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1n · **Issue:** `#1139` · **Scope:** `B_CENSUS_OWNERLESS_TRIAGE_SCOPE.md` (`b71f5a499`)

Every citation below was read at `origin/migration/aws-supabase` (`cd311fcc5`) unless it names another ref. Measurements name their population and carry a control.

## 0. AUDIT FIRST — what the batch touches

| check | result |
|---|---|
| **SIM / System Manual** | No component changes. Read per issue only, to tell whether the thing an issue describes still exists. Neither doc changes in this batch. |
| **Files written** | (+ §5 if accepted: `scripts/governance-checker/census.mjs`, `census.test.mjs`) `1-system-manual/RUNNING_ISSUES.md` (60 entries, in place), `1-system-manual/SPRINT_TO_LIVE_PLAN.md` (items added to existing rows; no new row), `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md` (two after-live lines, §3 below), `1-system-manual/POST_AUDIT_ROADMAP.md` (none — `#174` is already on roadmap 16.8). |
| **The grader** | `scripts/governance-checker/census.mjs` — `ownerOfIssue` and `placement`, unchanged. OBJ-2 is graded by running them over the ledger and plan at the close commit. |
| **Ledger search (§9.5(b-ii))** | Done per issue: the entry's whole text, `git log -S "#<n>"`, and the batch records it names. The citations column is the result. |
| **Doc set for the declared class** (`config.mjs` `CLASS_DOCSET.non_architecture`) | scope ✅ present · pre-audit = this file · completion report, BATCH_CATALOG, PHASE_HISTORY at Step 10. |

## 1. WHAT THE READING FOUND

**Of the 60, 28 are already finished and their heads were never updated; 32 are live and get an owner and a place.** No issue turned out to be a live defect that needs urgent work.

- **24 CLOSED** — the work was done. 9 say so in their own text (a RESOLVED tail under an OPEN head), 1 more (`#997`) by its own recorded cause, and 14 are closed by code or a later batch, cited.
- **4 WITHDRAWN** (§9.4 disposition 5) — they dissolve: a documented limit, an inquiry that was never a gate, a one-time event that has happened, a convention already written at its only site.
- **32 PLACED** — CC-A 16 · CC-B 10 (plus `#439`'s detection half) · Infra Claude 3 (plus `#410`'s second entry) · CC-C 1. Every one goes on an **existing** row or after-live line; two after-live lines are added for items with no batch at all.

### `#439` — RE-MEASURED (OBJ-4), the stall does not reproduce
Staging DB, `xstock_spot_ohlc_1m`, the 30 hours to 2026-10-06 21:56Z, bucketed by hour: **every whole hour has bars in all 60 of its minutes** (31 buckets; the two edge hours partial by construction). Bar volume follows the US session (≈22-25k/h in session, 900-3,500/h off-hours, 169-467 symbols). **Control:** `crypto_spot_ohlc_1m` over the last 3 hours is populated (5,921-7,393/h). **Each bar lands ~15 minutes after its minute** (interval 21:40 arrived 21:55:59; the same at every minute read) — that lag is already recorded (`#994`, `B_XSTOCK_FEED_SANITY_SCOPE.md:430`), not new. ⇒ the July stall is not present now: **CLOSED (stall)**. The other half of the entry — *the feed-health detector cannot see an OHLC-only stall, because the socket keeps delivering ticker frames* — is still true and is **handed to CC-B's row 3a** (`B-FEED-HEALTH-GRADE-ARM`, feed-level liveness), if CC-B accepts.

### `#225` — the event-loop ceiling, measured now
`/var/log/dawntrader/out.log` from its first line (17:31:56Z) to 21:57Z, ≈4.4 h: **39 `[4.6B][STALL]` events ≈ 8.8/h, p50 193 ms, max 318 ms, 9 at ≥250 ms.** The pinned ceiling in the entry is ≈8/h, p50 191 ms, max 554 ms. Magnitude is under it; the rate is at it. Still live, low severity → after-live.

## 2. THE 60, ONE ROW EACH

Owner groups per scope §2: prices/exit price path → CC-C; signals, strategies, SQE, RTB, learning data → CC-B; identity, servers, deploys, security, diagnostic screens → Infra Claude; trade records, costs, scores, regimes, gates, risk controls, live engine → CC-A.

### 2a. CLOSED (24)

| # | citation |
|---|---|
| #146 | `scripts/dt-deploy.sh:218-219` fails the deploy when `dist/BUILD_SHA` ≠ the requested sha; `:203` records `DEPLOYED_SHA`. The automated check the entry asked for exists (B-DEPLOY-LOCK). |
| #212 | Reject hooks landed `1e119531a` (P19-B5a). |
| #228 | Fallthrough hook registered at `server/index.ts:298`. Alert history: 6 fallthrough alerts, all 2026-06-17/18; none since (control: the same file holds 1,238 rows of other kinds). |
| #230 | Same hook and same evidence as `#228`. |
| #232 | `server/services/vts-runner.ts:555` `VTS_NET_EV_FLOOR = -0.01`, with its intent written at the site (Batch 52 Fix 19: −2% let everything through, −1% keeps boundary-case learning; active trading uses strict netEV > 0). The value is the intended one. |
| #236 | Own tail: RESOLVED (B6.6 price-liveness gate + B4b.1 depth gate). |
| #295 | Own tail: RESOLVED (B4b.1 depth-sufficiency gate). |
| #299 | Own tail: RESOLVED (fixed 2026-06-15; re-provisioning note kept in the entry). |
| #300 | Own tail: RESOLVED (dispositions (a)-(c)); its new finding went to `#301`. |
| #301 | Own tail: RESOLVED (P19-B6.7). |
| #320 | `P19_B6_5b_5c_COMPLETION_REPORT.md:16` — defense-in-depth reject at the `queueSQESignal` chokepoint shipped in B6.5b. |
| #325 | Own tail: RESOLVED (gate-10 moved to B6.5g). |
| #326 | Own tail: RESOLVED (`3bd3deedc`, Langston Step-8 CONFIRMED-CLOSED). |
| #327 | Removed in `0dd25ff4c` (P19-B6.5e, subject names `#327`); `const { resolveAssetClass } = await import(` greps 0 in `signal-orchestrator.ts` (control: `resolveAssetClass` 7 lines in the same file). |
| #328 | criteria-limiter deleted `e41359ee8`. |
| #329 | `getTopSignal` / `checkForPromotion` deleted `8b13fe0b8` (P19-B8.10). |
| #342 | `langston_queue.py:277` accepts `status=ready`. |
| #343 | `langston_queue.py:52` accepts the unquoted form. |
| #345 | Own tail: RESOLVED (79/79 tests, live shakeout passed, self-advance back on). |
| #347 | `GOV_CUTOFF` is unset in the checker's systemd unit, so the committed default governs. |
| #418 | The closer writes the computed net P&L (`active-execution-engine.ts:3774`, `:4094`, `:4350`). |
| #536 | Own tail: RESOLVED (both legs; Langston pulled both rows from the live database 2026-07-19). |
| #754 | The `STEP: N of 11` format landed in `CLAUDE.md` §0.a; the recurrence tripwire is in the weekly mistake pass. |
| #997 | Own text: cause external — `status.claude.com` incident opened 2026-09-03 13:26Z; the session recovered when it closed. The transcript trim it also asked for rides Infra Claude's `B-TRANSCRIPT-ARCHIVE` (plan header line 36). |

### 2b. WITHDRAWN (4) — §9.4 disposition 5

| # | what dissolves it |
|---|---|
| #170 | A documented limit, not a defect: its own text says *not reachable at current volume* and was accepted at Langston's Step-2 fold-in #3. Nothing to build; the entry stays as the record of the limit. |
| #227 | Its own head: *NON-BLOCKING inquiry, NOT a gate*; the decided paper-fill design proceeds regardless (`P19_B2_COMPLETION_REPORT.md`). Re-opens only if Kraken offers a hosted-fill path. |
| #346 | A one-time event: the first activation of the alert re-surface guarantee happened 2026-06-23 (its own text). The back-off it names prevents recurrence, so there is no second first-run to ramp. |
| #381 | A convention, and it is written at its only site: `server/routes.ts:8888-8895` (the endpoint spreads `getSummary()` and count-gates heavy fields behind `?raw=1`). Nothing to build. |

### 2c. PLACED (32) — the `HOME:` line written into each entry

| # | owner | HOME | why this row |
|---|---|---|---|
| #160 | CC-A | row 151 (TFS sustainability gate, Phase 25) | TFS confidence formula input to the same calibration decision |
| #174 | CC-A | roadmap 16.8 | already its home; the HOME line is rewritten in the form the census reads |
| #200 | CC-A | row 144a (xStock DBS gap) | the crypto half of the same DBS-config symmetry; `DEFAULT_DBS_CONFIG` still read at `directional-bias.ts:59,140,263` |
| #211 | CC-A | row 148 (B-RETIRED-SCORE-REMOVAL) | retired-score remnant |
| #303 | CC-A | row 169 (B-KILLSWITCH-DENOMINATOR) | kill-switch |
| #321 | CC-A | row 197 (21.2 paper-to-live parallel run) | the co-run is that row's content |
| #323 | CC-A | row 170 (B-TOTAL-DRAWDOWN-WARNING) | risk control |
| #331 | CC-A | row 157 (B-LEGACY-LIVE-EXIT-PATH) | **judgement call** — a regime-flip exit is an exit-path decision; it needs a 3-way "not wanted, because" or a build item before live |
| #384 | CC-A | row 148a (calibrated win probability) | the missing VTS gate-verdict column is an input to that rebuild |
| #390 | CC-A | row 1e (trade-record retention close-out) | `rtb_shadow_pool_members` has no retention |
| #406 | CC-A | row 1e | `vts-trade-persistence.ts:12,22,30-31` still describes a VTS→`closed_trades` migration that has no writer (the only `createClosedTrade` callers are `routes.ts:12720,12808` and `active-execution-engine.ts:5469`); correct the header to the in-place close |
| #410 (1st entry) | CC-A | row 191 (B-VENUE-RESTING-EXITS) | the real post-only resting-order lifecycle; the haircut calibration it names stays Phase 25 |
| #431 | CC-A | after-live `B-STORAGE-CATALOG` | storage hygiene; re-homed twice in July to a batch that was never named |
| #435 | CC-A | row 181 (21-3d balance truth) | live buying-power valuation |
| #440 | CC-A | row 142 (xStock calibration block, data-capture gap) | xStock cadence tuning |
| #442 | CC-A | row 142 | venue-timestamp capture is the data-capture gap that row names; `B-XSTOCK-VENUE-TS` was never placed |
| #523 | CC-A | row 101 (`#522`) | its paper leg is done; live keeps the block pending Kyle's ratification at `#522` |
| #214 | CC-B | row 2a0b (B-ENGINE-HEARTBEAT-DEAD-PATHS) | `health-monitor` reads `global.tradingEngines` (:444) |
| #404 | CC-B | row 2a0b | heartbeat `session.userId` (:127, :246) — the dead session check that row removes |
| #238 | CC-B | row 52 (B-SILENT-STRATEGY-CENSUS) | strategy evaluation coverage |
| #411 | CC-B | row 52 | measure pattern-path signal volume under the NetEV gate; row 51 already found a pattern path silently dead |
| #388 | CC-B | row 134a (shadow-sink outcomes) | shadow rehydration fail-direction |
| #389 | CC-B | row 134a | shadow capture flag; `getRankedSignals` has one caller |
| #439 | CC-B | row 3a (B-FEED-HEALTH-GRADE-ARM) | the stall is CLOSED by re-measurement (§1); what stays live is the detector's blind spot for an OHLC-only stall — feed-level liveness is that row's job |
| #225 | CC-B | after-live, new line `B-EVENT-LOOP-RESIDUAL` | 15 of 29 attributed stalls follow the FX5 scanner's cycle tail; measured above |
| #532 | CC-B | row 55 (B-RTB-REFRESH-CONSOLIDATE) | row 55 already carries "OBJ-2b-6 (`#532`) open" under CC-B; the ledger still says CC-A — settle with CC-B (OBJ-4). Head rewritten so OPEN leads (OBJ-5) |
| #575 | CC-B | row 54 (`#574`) | Langston ruled it a measurement objective inside `#574`'s batch, which is CC-B's row — settle with CC-B (OBJ-4) |
| #596 | CC-B | row 122 (`#590`) | its own HOME is "alongside `#590`", CC-B's row — settle with CC-B (OBJ-4) |
| #1047 | CC-C | row 17 (B-PRICE-SIDE-BY-JOB) | price side |
| #613 | Infra Claude | `B-CREDENTIALS-PRIVATE-REPO` OBJ-1 (plan header line 33) | OBJ-1 is *a crew login usable by all six that no session needs to hold*, with an empty write allowlist — the durable read-only diagnostics credential the entry asks for. Closes when that batch closes. Owner moves from "proposed CC-A" (OBJ-4) |
| #409 | Infra Claude | row 158 (B-SEC-HARDEN) | the 1.5 GB dead `dawntrader-out.log` is already gone (absent from `~deploy/.pm2/logs/`, listed 21:5xZ); one 0-byte `dawntrader-error.log` remains — a one-command removal |
| #410 (2nd entry) | Infra Claude | row 158 | route-family symmetry; that batch already walks every route |
| #403 | Infra Claude | after-live, new line `B-CI-TEST-HYGIENE` | CI flake; the test still has no raised timeout |

### 2d. CC-A's four (OBJ-4)
- **#439** — re-measured, §1 above: stall CLOSED; detection gap → CC-B row 3a.
- **#575 / #596** — both ride CC-B rows (54, 122). I propose CC-B owns them there; agreement recorded in the entry before close.
- **#613** — owner becomes Infra Claude (2c).

## 3. IMPLEMENTATION PLAN (Step 3)
1. One script edits `RUNNING_ISSUES.md` in place (CRLF preserved, counted with `tr -cd '\r'`): each head's status word → CLOSED / WITHDRAWN / OPEN; one line `W41 TRIAGE (CC-A, <date>): <outcome> — <citation>; HOME: …` per entry; any replaced HOME line quoted. **Never stacked** (`#753`).
2. Plan: append `+ #N` to the item cell of each named row (the census's note form). After-live: two new lines (`B-EVENT-LOOP-RESIDUAL` CC-B, `B-CI-TEST-HYGIENE` Infra) and `#431` added to `B-STORAGE-CATALOG`.
3. **OBJ-1 check:** a script lists the 60 and finds the `W41 TRIAGE` line in each.
4. **OBJ-2 check:** `node scripts/governance-checker/census.mjs --ref <close sha> --dry-run` — 0 of the 60 unplaced or ownerless (control: the same run at `be41f8585` lists all 55 + `#439`/`#575`/`#596`/`#613`).
5. **OBJ-3:** one Discord post per session listing its numbers; a disagreement re-opens that item only.
6. **OBJ-5:** `#532` absent from the census self-contradiction list.

## 4. JUDGEMENT CALLS TO ATTACK
1. **Closing on an entry's own RESOLVED tail** (9 issues). I did not re-run each fix; the tails cite their commits and Langston confirmations. Is the entry's own record enough, or do you want a spot re-derivation?
2. **`#331` on row 157.** A regime-flip exit is a decision before it is a build. Is an exit-path row the right place, or does it belong with Kyle as a decision item?
3. **`#232` CLOSED on the site comment.** The value's intent is written at the constant; nobody re-confirmed it after active paper turned on.
4. **Items to other sessions' rows** (10 CC-B, 3 Infra, 1 CC-C) — handed over by number; each owner may refuse.

## 5. FOUND WHILE BUILDING THE STEP-3 CHECK — THE CENSUS CANNOT SEE 9 PLAN ROWS (§9.4 disposition 1 proposed)

**Symptom, measured.** `census.mjs` `parsePlan` takes a §4 line as a row only when its first cell matches `/^\d+[a-z]?$/`. At `a6ff8f316` the plan's §4 holds **278** row ids; `parsePlan` returns **269**. The 9 it drops are all valid 7-cell rows: `2a0`, `2a0b`, `2a0c`, `2a0d`, `2a1`, `2a1a`, `2a2`, `3a1` (CC-B) and `4a2` (CC-C). Control: `1e` and `144a` parse (`ids.has('1e') === true`).
**Reach.** Everything that reads `plan.s4`: placement (an issue on one of these rows reads as unplaced), the §6 recount (8 CC-B rows and 1 CC-C row uncounted), lists (d), (e), (f). `AFTER_ROW` has the same narrow shape (`after row 2a0b` would not resolve). The plan's own §6 rule says *"a table line of exactly 7 cells whose first cell is a row id"* — the code is narrower than the rule it implements.
**History.** The regex is from `fc2f88112` (B-PLAN-CURRENCY-CHECK, 2026-09-30, mine); the first row id it rejects (`2a0`) was added 2026-10-06 (`0c36dde0c`). So it has been wrong for one day, and only since the plan started using deeper ids.
**Why this batch depends on it.** `#214` and `#404` are placed on row `2a0b` (B-ENGINE-HEARTBEAT-DEAD-PATHS). OBJ-2 cannot pass for them while the grader cannot see that row.
**Proposed fold-in (one leg, code):** widen both patterns to `\d+[a-z0-9]*`; add tests to `census.test.mjs` (a `2a0b` row parses, places an issue by number, counts in the recount, resolves an `after row 2a0b`); recount §6 in the same commit (the recount moves CC-B +8, CC-C +1, so the table must move with it or the §6 alert fires). The class stays `non_architecture` (governance tooling, no engine path). The live checker picks it up at the next deploy — not this batch's deploy to make, and none is needed for OBJ-2, which is graded by a dry run at the close commit.
**If you would rather it be its own hotfix:** it then lands before this batch's Step 3, and `#214`/`#404` wait for it.
