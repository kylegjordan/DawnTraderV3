# B-DISAGREEMENT-FINDER r4 — THE LIVE CENSUS (9 pairs) + THE FALSE-NEGATIVE SURFACE

**Pinned ref `e4425782`. Langston's three r3 rulings applied.**

## ARM 3 — DISCRIMINATION RUN

`#211` homes under the predicate: **1**. Transport-counter lines in the one file that holds them: **17**, of which **0** match any home form. File genre: **FROZEN**.

⇒ **The PREDICATE alone excludes them — FIX 3 bounds extraction and never touched which lines are homes, so the two closers are genuinely independent.** This is the measurement he asked for in place of my argument.

---

## THE LIVE CENSUS — every pair, both texts in full, `git log` beside each home

### #165

**A — `1-system-manual/CHANGES_AND_FIXES.md`** *(LIVE · 2026-08-29|0ab291d99 · 142 commits)*

```
- **#165 root cause (proven):** node-cron 4.2.1 `MatcherWalker.matchNext()` (matcher-walker.js:84-89) advances the weekday-reconcile loop by a whole YEAR per iteration → any day-of-week schedule whose next hit is ≥~2 days out returns the next Jan-1st landing on that weekday (Fri→2027, Tue→2030…), in BOTH NY and UTC. Broader than the original "Friday-NY" framing. **Introspection-only** — firing uses `TimeMatcher.match(now)` + a 24h heartbeat-delay cap (runner.js:178) and is correct + self-correcting (live dow-fire test + the Sun 00:00 UTC `weekend_restart` firing via cron both confirm). The May 29 non-fire was the 30h outage, not this bug.
- **Fix = cron-parser shim:** new `server/services/cron-next-fire.ts` `computeNextFire()` (failure-safe, single-entry-point) backed by `cron-parser` (promoted to direct dep @4.9.0). `cron-arm-logger.ts` + `cron-arm-smoke-test.ts` classify/log off it; node-cron's raw `getNextRun()` retained ONLY as a labelled `raw_nodecron_next=… [UNTRUSTED ncv=4.2.1]` diagnostic (drift detector). node-cron scheduling/firing untouched. 8 regression-lock tests (5+6-field, NY+UTC, tz-fallback, bad-expr) + arm-logger/smoke-test updated. tsc 493 baseline; 31/31 cron + 19/19 lifecycle tests green.

- **BUG-2026-06-01-A — ESM-bundle named-import crash (deploy hotfix):** the first deploy (`6372a2d`) crash-looped staging at boot: `SyntaxError: Named export 'parseExpression' not found` — `import { parseExpression } from 'cron-parser'` (a CommonJS-only package) is unresolvable as a named ESM import in the production `esbuild --format=esm --packages=external` bundle (Node's ESM loader can't statically detect CJS named exports). It passed tsc + vitest + CI Build + Docker Build (none execute the bundle). Hotfix `63bc69d`: `import cronParser from 'cron-parser'; const { parseExpression } = cronParser;` — validated against Node's ESM loader directly (`scratch/cronparser-esm-test.mjs`). ~3-min staging outage; NO trades affected (Sunday resume had already fired at 00:00 UTC under the prior working code). Structural pipeline gap logged as RUNNING_ISSUES #168 + verification-gap learning in ASSET_CLASS_ONBOARDING_WORKFLOW.
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
### #165 CLOSED 2026-06-01 (B-NEW-50) — node-cron 4.2.1 `getNextRun()` wrong for day-of-week schedules ≥~2 days out (introspection-only; firing safe)
Surfaced by B-NEW-49 boot smoke test on first deploy. `weekend_shutdown` schedule (cron expression `0 20 * * 5`, timezone `America/New_York`) calls `task.getNextRun()` and receives `2027-01-02T00:00:00.000Z` instead of the expected `2026-06-06T00:00:00.000Z` (next Friday 8 PM ET = Sat June 6 00:00 UTC). Off by ~215 days. `weekend_restart` (`0 20 * * 0` same timezone) returns correct date — so the bug is specific to Friday day-of-week (5) interaction with `America/New_York` timezone, not a general timezone issue.

**★ 2026-06-10 root-cause candidate (B-4.6-B pre-audit, Langston-confirmed):** the 2026-06-09 cron misses (13:00 hourly + 18:00 reflection, same PID, self-cleared) carry the **scan-loop microtask-starvation signature** — warm-cache awaits yield only microtasks, so an unbroken warm sweep starves the timer queue and the cron slot ticks past (`B_4_6B_PRE_AUDIT.md` §1). **B-4.6-B chunk B is the durable-fix candidate**; its post-deploy soak checks cron-miss counts as a secondary acceptance signal.

**★ 2026-06-12 ATTRIBUTION SHARPENED (B-4.6-B chunk B shipped — FIX-2026-06-12-C):** the dominant starvation source was NOT the scan compute but the Batch-44 `persistDiagnostics` 20-30MB sync disk write every 30s sweep (DELETED per Kyle's legacy ruling); the scan loops' contiguous compute was the secondary contributor (fixed by boundary yields). Once-per-sweep stall ELIMINATED (~120 stalls/hour → ~8/hour scattered singles; corrected full-window figures in FIX-2026-06-12-C item 5). Zero actual cron misses in the post-fix window (verifier no-ops only — Langston Step-8 verified). Cron-miss disappearance over the formal 24h gate window (re-issued alert; fires 2026-06-13T15:00Z) is the confirming evidence for this family.

**Important uncertainty:** unknown whether (a) ONLY the `getNextRun()` introspection API is buggy while actual firing happens at the correct time, OR (b) actual firing is ALSO wrong and Fri timer will never fire correctly until node-cron is fixed/replaced. The B-NEW-36 weekend-shutdown miss on Fri 29 May is consistent with hypothesis (b) but not definitive — the May 29 miss could also have been from the BUG-2026-05-31-B silent-failure pattern.

**Investigation plan:**
1. Reproduce in isolation: write a 10-line test script that registers `cron.schedule('0 20 * * 5', cb, { timezone: 'America/New_York' })` and logs `getNextRun()` immediately. Confirm bug reproduces independent of our codebase.
2. Test other day-of-week values + other timezones to characterize: does `0 20 * * 1-4` (Mon-Thu) also return wrong dates? Does `0 20 * * 5` in UTC return correct dates?
3. Check node-cron 4.2.1 issue tracker for similar reports; if reproducer holds, file upstream.
4. Decide: pin known-good version, replace library, OR add timezone-aware getNextRun() shim.

**Why not blocker for B-NEW-49 ship:** the smoke test wrote an alert as designed; this IS exactly what the batch was built to catch. The B-NEW-36 weekend boundary is robust to node-cron failures regardless (poll-reconcile on independent centralClock). Sunday-resume tonight (Mon 1 Jun 00:00 UTC) uses the correctly-armed weekend_restart timer (returned correct date). Friday-shutdown next week (Sat 6 Jun 00:00 UTC) has poll-reconcile as the safety net.

**RESOLUTION (B-NEW-50, commit `6372a2d` + hotfix `63bc69d`, deployed + staging-verified 2026-06-01):**
- **Root cause (proven via isolated repro `scratch/ri165-repro.cjs` + node-cron source read):** `MatcherWalker.matchNext()` (matcher-walker.js:84-89) advances the weekday-reconcile loop by a whole YEAR per iteration instead of a day → ANY day-of-week schedule whose next hit is ≥~2 days out returns the next Jan-1st landing on that weekday (Fri→2027, Tue→2030, Sat→2028…), in BOTH NY and UTC. **Broader than originally framed** (not Friday/NY-specific; the smoke test only flagged Friday because Sunday's next fire was imminent and computed correctly).
- **Uncertainty RESOLVED = hypothesis (a): introspection-only.** Firing uses a SEPARATE path — `TimeMatcher.match(now)` predicate + a 24h heartbeat-delay cap (runner.js:178) — which self-corrects as the real fire-time enters the ~24h window. Proven empirically: `match(Fri 8PM ET)=true`, `getNextMatch(from Wed)=2027` (same TimeMatcher); a LIVE day-of-week-constrained schedule fired at the exact scheduled second (`ri165-confirm.cjs`). **The May 29 Friday non-fire was the 30-hour staging outage (process down), NOT this bug.** Live confirmation: the Sun 2026-06-01 00:00 UTC `weekend_restart` fired correctly via cron (`src=cron`), resuming 244 trades.
- **Fix = SHIM (Langston Step-1 + Step-4 ACK):** new `server/services/cron-next-fire.ts` `computeNextFire()` backed by `cron-parser` (promoted to direct dep @4.9.0); arm-logger + smoke-test classify on it; node-cron's raw `getNextRun()` kept only as labelled `[UNTRUSTED ncv=4.2.1]` diagnostic. node-cron scheduling/firing untouched. Verified on staging: smoke test reports weekend_shutdown next_fire=2026-06-06, weekend_restart=2026-06-08, aggregate OK 7/7; 4 stale TOO_FAR_FUTURE alerts acknowledged.
- **Deploy lesson (→ BUG-2026-06-01-A):** `import { parseExpression } from 'cron-parser'` (named) passes tsc+vitest+CI-build but CRASHES the production esbuild `--format=esm` bundle (CJS named-export not statically detectable). Fixed via default-import. Generalizable verification-gap learning logged in ASSET_CLASS_ONBOARDING_WORKFLOW.

**Sequence:** CLOSED. (Originally slated post-B-NEW-47; pulled forward to FIRST per Kyle 2026-05-31.)
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #301

**A — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
**#301 OPEN 2026-06-16 (P19-B4b.2 blast-radius finding — §9.4 concrete home) — the `MarketDataCoordinator` + `MarketDataWebSocket` subsystem (a SECOND Kraken WS) appears VESTIGIAL: zero `subscribeToPair` production callers → it connects but subscribes to no pairs; needs a liveness-then-remove audit + the deferred Q2 "is the health `execution` block itself dead?" question.** During B4b.2 I traced that `coordinator.subscribeToPair` has NO production caller (only the coordinator's own delegation `:143/145` + the WS reconnect re-subscribe loop `market-data-ws.ts:80`), so the 2nd Kraken WS (`market-data-ws` via `market-data-coordinator`) connects but subscribes to ZERO pairs — its ticker AND book streams are dead in production, superseded by `kraken-websocket-adapter` (the real live WS that B4b.1's `getBookForFill` reads). Its consumers — `feed-integrity-monitor`, `health-monitor.checkMarketDataHealth`, `parity-gate` (ws-uptime check), **plus `system-health-monitor.getExecutionMetrics` (rerouted onto it in B4b.2 — Langston Step-4 reminder to carry this into the caller trace)** — observe an idle connection. Removing it is a SEPARATE audit (must trace each of the 4 consumers' real liveness first), NOT folded into B4b.2 (scope creep + certainty-before-cutting per rule-18). **ALSO HOMED HERE (Langston Q2 follow-up):** whether the `system-health-monitor` health-snapshot `execution` block is itself fully dead (now that B4b.2 rerouted it onto this vestigial coordinator). **HOME (CONCRETE — set 2026-06-16 after Kyle flagged "decide at next touch" as too vague; Kyle: "go off your recommendation, just get it done, before is fine"): NUMBERED batch `P19-B6.7` — a small dedicated cleanup batch sequenced AFTER B6.6 and BEFORE B7a/B7b (pre-switch-on), NOT Phase-20.** Rationale for pre-turn-on rather than post: two of its 4 live readers are health/safety monitors (`feed-integrity-monitor` + `parity-gate`), so if they're watching the idle 2nd-WS connection they may be giving a false all-clear — worth confirming BEFORE paper trading is switched on, not after. It does NOT itself hard-gate B7b (no live impact); it runs in the pre-turn-on sequence. Revisit trigger = that batch, OR any earlier edit to `market-data-coordinator` / `market-data-ws` / `feed-integrity-monitor` / `parity-gate`. Surfaced + homed by CC + Langston (Step-2 Q3 concur) 2026-06-16. **★ RESOLVED 2026-06-26 (P19-B6.7, deployed restart#421, CI `28266067266` all-4-green, Langston Step-1/2/4/8 APPROVED).** Confirmed vestigial via runtime probe (`MD-WS_TICK`=0 / `Sub OK`=0 across ALL logged history since April) + the blast-radius trace (4 status-only consumers, ZERO tick-output consumers, ZERO `subscribeToPair` callers). DELETED both `market-data-ws.ts` + `market-data-coordinator.ts` (§15: archived `_archive/deleted-code/*.20260626-P19B6.7.removed`, DELETED_COMPONENTS_LOG, tsc-zero-dangling proven). Re-pointed all 4 consumers at the PRIMARY `krakenWebSocketAdapter` via the new pure `market-data/feed-health-aggregate.ts` (27 tests) — the Q2 `execution` block is NOT dead, it's live exec telemetry re-sourced onto the primary adapter. The dead feed had been a Phase-19 landmine (feed-integrity would false-CRITICAL once dormant-suppression lifts) + a Phase-21 parity-gate false-PASS — both removed. 30s `[MD-WS] Data stale` spam structurally GONE (Langston-verified). `OrderBookSnapshot` re-homed inline. | RESOLVED (P19-B6.7)
```

**B — `1-system-manual/SYSTEM_MANUAL.md`** *(LIVE · 2026-08-30|fc0043739 · 168 commits)*

```
### P19-B6.7 (#301) — re-pointed onto the PRIMARY feed, per-class freshest-age alarm
The monitor previously graded a **vestigial 2nd WebSocket** (`market-data-ws.ts`/`market-data-coordinator.ts`) that had delivered **0 ticks / 0 successful subscriptions since April** while a TCP connection stayed open — so every consumer mis-read it as "connected/healthy" and the alarm would have raised false CRITICALs the moment Phase-19 lifts dormant suppression. P19-B6.7 **deleted that subsystem (§15)** and re-pointed the alarm onto the PRIMARY `krakenWebSocketAdapter`'s real per-symbol tick-age (`getI8EWsHealth()`).

**The alarm aggregate is FEED-LEVEL aliveness, PER ASSET CLASS — the OPPOSITE of the go-live gate's aggregate, by design:**
- **Alarm (this monitor):** the **freshest** subscribed symbol's age per class (`gradePerClassFeedLiveness`). "The feed is alive if ANY symbol ticked; critical only when NONE within the critical threshold." Worst-case-per-symbol would false-CRITICAL on one legitimately-quiet illiquid pair — the inverse of the bug B6.7 removes.
- **Crypto (24/7):** always graded; threshold absorbs weekend thin-book.
- **xStock (24/5):** graded only over symbols `isXstockMarketOpenUTC` reports OPEN (per-symbol — half-days/holidays fall out); the class is suppressed when ALL xStock symbols are closed, AND for a **post-open warmup grace** (`feed_health.warmup_grace_ms`) after the closed→open edge so the stale-at-close age doesn't false-fire at the bell (deterministic warmup, §8#11).
- **Overall status** = worse of (per-class liveness) and the orthogonal connection-quality grade (reconnects / uptime / latency — `categorizeHealthBySpec` with the tick-age term zeroed, since liveness owns staleness). Latency = the primary adapter's averaged inter-heartbeat-interval proxy (`getHealthMetrics().avgHeartbeatLatency`; NOT true RTT — Kraken v2 heartbeats are server-pushed).
- The companion **go-live GATE** (`parity-gate`, `assessWsReadiness`) uses the conservative complement: connected + uptime AND a proportion-of-symbols-fresh floor (kills the dead-feed false-PASS).
  - **P19-B6.9 (#398) — the uptime axis is a ROLLING 1h window, not cumulative-since-boot.** Originally `assessWsReadiness` derived WS uptime from the adapter's CUMULATIVE lifetime `reconnectAttempts` over a fixed-120 denominator — so a healthy long-lived process accreted lifetime reconnects and drifted below the 99% floor, spuriously failing the Phase-21 go-live gate. It now consumes `feedIntegrityMonitor.getRollingWindowReadiness()` → the pure `computeRollingWindowReadiness(reconnectsPerInterval[], minSamples)`: uptime `= (1 − Σ per-interval reconnects in the ring / snapshots PRESENT) × 100`, denominator = ring length (capped at `MAX_HISTORY=12` ≈ 1h) — so a bad hour ages out as snapshots roll off (self-healing; the property the cumulative metric lacked). Per-interval reconnects = the ring's `reconnectsSinceLastCheck` delta (`= max(0, cumulative − prior-snapshot-cumulative)`, a true within-interval count). **Warm-up (fail-closed):** below `MIN_READINESS_SAMPLES = 6` (30 min) it returns `uptimePercent: null` → the gate reports "warming up / not ready" rather than a misleading % — a go-live decision must rest on ≥30 min of recent intervals, and the gate never clears on an unknown feed. `calculateTimeBasedUptime()` (the monitor's own cumulative-since-boot health metric) is a separate concern, untouched. **Known Phase-21 calibration:** with a 12-snapshot/1h window the 99% floor means even 1 reconnect/hr → 91.7% → fails — a go-live THRESHOLD-calibration decision homed at POST_AUDIT_ROADMAP §3.5 item 21-3b, deliberately NOT re-tuned in B6.9 (gate dormant until Phase-21).
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #432

**A — `1-system-manual/CHANGES_AND_FIXES.md`** *(LIVE · 2026-08-29|0ab291d99 · 142 commits)*

```
- **#432 folded:** `bytesMoved += Number(c.bytes_compressed)` in the cold rotator (BIGINT→string concat fix) — confirmed live (`bytes_moved=930029` summed).

**Proven end-to-end** on `exit_decision_archive/2026-05` (bounded, via a retention override + a manifest-created_at backdate to simulate 365d aging): hot→warm (8.18 MB → 930 KB, 8.79×, download-verified, dropped-after-verify) → warm→cold rotate (cold `state=active`, `verified_at` auto-stamped by the Wave-A r4 fix) → rehydrate from B2 (checksum match). Q3 §13 alert scheduled (`27860643`, triggers 2026-08-30) to verify the first NATURAL `signal_eval_archive` tiering's peak-RSS on real JSONB-wide volume (the tiny-table proof couldn't exercise that). Governance: SYSTEM_MANUAL (retention chapter + cron table) + SIM (B70 inventory) content updates, RUNNING_ISSUES #430 fully resolved + #432 resolved + #437 (db:migrate ledger drift found at deploy), DELETED_COMPONENTS_LOG, this entry. Kyle confirms `pair_scan_archive` KEEP→cold at close.
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
- **#432 — [B-STORAGE-HARDEN Wave A, CC-A find 2026-07-08] Cosmetic string-concat in the cold rotator's DONE summary: `bytes_moved=013901237`.** `let bytesMoved = 0; bytesMoved += c.bytes_compressed` — `pg` returns the numeric `bytes_compressed` as a STRING, so `0 + "13901237"` concatenates to `"013901237"` instead of summing. Display-only (the rotation itself is correct; the watchdog's `failed` regex is unaffected). **FIX: coerce `Number(c.bytes_compressed)` at the accumulator. HOME: B-STORAGE-HARDEN OBJ-2 (Wave C) — trivial, fold in.** **★ RESOLVED 2026-07-08 by Wave C (`0c22d0293`): `bytesMoved += Number(c.bytes_compressed)` — confirmed live in the exit_decision proof rotation (`bytes_moved=930029`, summed not concatenated). Listed in CHANGES FIX-2026-07-08-B.** **RESOLVED.**
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #489

**A — `1-system-manual/CHANGES_AND_FIXES.md`** *(LIVE · 2026-08-29|0ab291d99 · 142 commits)*

```
- **#489 (DATA-LOSS)** save_queue MOVE-NOT-DELETE: terminal items beyond keep_done are appended to an append-only archive + fsync'd BEFORE the live file is replaced, every eviction logged; the docstring "oldest" lie corrected. Same discipline B-STORAGE-HARDEN imposes on the DB, applied to the reviewer's verdict file.
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
- **#489 ★ ADDENDUM — NO LONGER A READING OF THE CODE. IT EXECUTED, IN FRONT OF ME, AND IT ATE THE MESSAGE THAT ANNOUNCED THE BUG (CC-A, 2026-07-10, while discharging the Kyle blocker).** **I predicted the hazard, archived against it, and triggered it anyway.** Before mutating the queue I noted `done` stood at **exactly `keep_done=20`** — saturated — took an immutable `chmod 444` pre-image (`/home/langston/.langston-review-queue.ARCHIVE-2026-07-10-preCCA-discharge.json`, sha256 verified against the live bytes), and wrote **without** calling `save_queue`, precisely so nothing would be pruned. **My own write conserved all 34 items. Then the bridge saved, and `save_queue` destroyed one.** **MEASURED (`langston_queue.py:334-339`, read AFTER the fact):** `terminal.sort(key=last_touched_ts, reverse=True)` then `live + terminal[:keep_done]`. **⇒ It does not prune the OLDEST. Its docstring says *"prune oldest done/error"* and that is WRONG — it prunes the LEAST-RECENTLY-TOUCHED, and a `done` item's `last_touched_ts` is bumped by ANY later edit. By stamping `last_touched_ts` on my two discharges I promoted them above the cap and evicted a third item I never touched.** The evicted id was **not** the oldest by `added_ts` (`1523294426326106215` survives). **★★ AND THE ITEM IT DESTROYED, recovered verbatim from the archive — `1525099586660733028`, requester `NEW Claude`, state `done`, `unmarked_park=True`:** *"Langston, OLD Claude — **STOP. The twelfth error is live, it is happening RIGHT NOW, and it is the purest instance of the disease we have produced all…"*** **The queue deleted the record of an error to make room. The sentence it deleted was the one identifying the error. There is no sharper statement of Kyle's complaint than a governance system silently destroying the evidence of its own failure while two engineers watch — and the ONLY reason it is quoted above is that I took a pre-image sixty seconds earlier, for an unrelated reason.** **⇒ THE DEFECT IS NOT "the gauge saturates." A saturated GAUGE is a display bug. This is a DESTRUCTIVE, SILENT, UNBOUNDED-LOSS WRITE PATH: `keep_done` is not a display cap, it is a DELETE. Nothing logs the eviction. Nothing archives it. `save_queue` returns `None` and no caller checks anything.** **`#489` is upgraded from *telemetry-wrong* to *data-loss*, and it is `#482` one layer down: there a verdict is never read; here a verdict is deleted.** **FIX (binds `B-LANGSTON-QUEUE-2` OBJ-3, and is now its acceptance test):** (a) **`save_queue` MUST NOT DELETE** — terminal items beyond `keep_done` are APPENDED to an append-only archive and fsync'd BEFORE the live file is replaced; **move-not-delete, the exact discipline `B-STORAGE-HARDEN` already imposes on the database, applied to the one file holding the reviewer's verdicts.** (b) every eviction emits a line naming the id. (c) the docstring's *"oldest"* is corrected to *"least-recently-touched"* — **a comment that misdescribes a destructive operation is how an engineer who READ the code still gets surprised by it, and I am that engineer.** (d) `total_completed` becomes a monotone counter independent of the retained window. **ACCEPTANCE: re-run today's exact sequence — saturate `done`, discharge two items, force a bridge save — and prove `1525099586660733028` is still readable. It is currently readable ONLY from a `chmod 444` file I made by hand, that no process knows about.** **★ THE CONSERVATION CHECK IS THE ONLY REASON THIS IS KNOWN: `len(current) == len(pre-image)` failed by one. The write succeeded, the exit code was `0`, both intended mutations were correct and verified — and a third item was gone. `exit 0` is not evidence. A diff of the SET is.** ↔ #482, #484, #447, #451, #493; `F12`-`F15`. **HOME: `B-LANGSTON-QUEUE-2` (CC-A, due 2026-07-13), OBJ-3 restated as *move-not-delete + eviction log*, with the above as its acceptance test.** **OPEN (homed).**
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #637

**A — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
### #637 OPEN 2026-07-31 (Langston FOUND IT while verifying a CC-B claim; CC-B filing) — ★ THE GOVERNANCE CHECKER'S DEAD-MAN SWITCH IS TURNED OFF WHILE THE ENFORCER IT WATCHES RUNS LIVE — **AND THE TIMER IS THE FINDING, NOT THE FLAG**

**TWO FAULTS, AND THE ORDER MATTERS BECAUSE FIXING THEM BACKWARDS MAKES IT WORSE.**

**(1) LIVE — the dead-man is OFF.** `governance-checker-heartbeat.timer` is **`disabled`**; `governance-checker.timer` is **`enabled`** and last ran **09:09:50Z 2026-07-31** (Langston, checked on staging). ⇒ **if the checker dies, nothing tells us — and we would read its silence as "no governance gaps."** ★ **Same absent-as-valid family as #546/#568/#594: an instrument's silence taken for a clean result.** The checker is the thing that catches missing completion reports, undeclared change-classes and overdue batches — **a quiet failure there is invisible by construction, because its output IS silence when all is well.**

**(2) LATENT — the heartbeat's resolve can never succeed, and it destroys its own handle.** `scripts/governance-checker/heartbeat-check.mjs:39` invokes `resolve <id> --by …` with **NO `--evidence`**; `scripts/system-alerts.ts:293` `requireFlag(args,'evidence')` made that flag MANDATORY at **B-GOV-INTEGRITY-1 (2026-07-10)** ⇒ exit 1. The wrapper's `catch { /* terminal = fine */ }` swallows it, and **`hb.alertId = null` runs on the same line, UNGUARDED** ⇒ **the alert never resolves AND the id is discarded, so nothing can ever close it.**

⛔ **THE ORDERING TRAP, STATED SO NOBODY WALKS INTO IT: enabling the timer while (2) is broken yields a dead-man that RAISES and can NEVER CLEAR — permanent un-clearable noise, strictly worse than off. FIX THE FLAG FIRST, THEN ENABLE.**

★ **BUCKET 1 (real defect), and a FOURTH failure shape — not the computed-but-unconnected family (#605/#594/the price-skip clear path).** Here **a later batch made an argument mandatory, that broke a caller, and the caller's own error handling hid the break.** ⇒ **an unowned seam between a CLI contract and its programmatic callers.** ⚠️ **Census obligation before fixing: `requireFlag(args,'evidence')` landed at B-GOV-INTEGRITY-1 — enumerate EVERY programmatic caller of the alerts CLI, not just this one.** A second silent victim is likelier than not, and the same swallow-and-null pattern would hide it identically.

★ **THE FAILING BRANCH IS OBSERVED AT RUNTIME, NOT INFERRED FROM A CODE READ — three independent times.** CC-A hit the enforcing rejection **twice** resolving alert `3b9ec8ea` last night, and **CC-B hit it a third time at 09:27Z 2026-07-31** passing a prose evidence string: verbatim *"resolution_evidence rejected — must be a reference token (path:line | sha | uuid | §/#ref) or a sanctioned sentinel."* ⇒ **the gate is live and enforcing; only the heartbeat's swallowed exit-1 hides it.**

⚠️ **FIX CONSTRAINT (CC-A, and it is right — do not skip it): THE `catch` IS LOAD-BEARING IN THE GOOD CASE.** A genuinely already-terminal alert *should not* blow up the heartbeat run. ⇒ **the fix is to DISTINGUISH "already terminal" (benign, keep swallowing) from "rejected/failed" (must not null the id, must surface) — NOT to remove the catch.** ★ **Removing it would trade a silent failure for a fragile enforcer, which on a dead-man switch is the worse of the two.** And whatever the branch does, **`hb.alertId = null` must move behind a success check** — discarding the handle is what makes the state unrecoverable.

★★ **HOW LONG IT HAS BEEN OFF — MEASURED 2026-07-31 (CC-B), because Langston correctly declined to name it unmeasured: `/var/lib/governance-checker/heartbeat-state.json` last written `Jun 19 10:41` ⇒ ~6 WEEKS.** **Object + why it's the right one (29a):** `checkHeartbeat()` ends in an **UNCONDITIONAL** `writeFileSync(HB_STATE, …)` on every invocation ⇒ **a run that happened MUST have touched that file**, so a frozen mtime is POSITIVE evidence of not-running, not absent evidence. **Positive control, same directory, same instrument:** the poller's `state.json` reads `Jul 31 09:09` — current ⇒ the instrument works and the directory is live; only the heartbeat's file is frozen. ⚠️ **HONEST LIMIT: mtime is last WRITE, not last successful run — this BOUNDS the outage at ≥6 weeks, it does not fix the stop date. A bound, not a point.** Langston additionally found the unit does not appear in `list-timers --all` at all ⇒ **unscheduled, not merely flag-off** (unit file exists; `is-enabled` returned `disabled`, not `not-found`).

⚠️ **WHY THE INTEGRITY-1 SWEEP MISSED IT (Langston, whole-tree census): there are EXACTLY TWO code call sites of the CLI resolve — `poller.mjs:386` (✅ passes `--evidence`) and `heartbeat-check.mjs:39` (❌). The sweep fixed the sibling in the SAME DIRECTORY and missed this one**, because `SYSTEM_IMPACT_MAP.md:835` documents the seam at **FILE** grain (naming `poller.mjs`) while `README.md:32` says the heartbeat *"is a separate process with its own unit."* ⇒ **the note telling us to treat it separately is why it fell out of the sweep. Seam documented per-FILE, defect lives per-PROCESS.** ★ **Ledger fix owed (CC-A): re-state that seam at PROCESS grain, or the next required-arg change misses the same unit again.**

⛔ **FIX BLOCKER FOUND WHILE IMPLEMENTING — Langston's "just use `checkerResolveEvidence()`" does not work as written, and the reason is instructive.** That helper is **module-private to `poller.mjs`** and closes over **`gradedRefSha`**, set once per tick **after that process's own fetch**. The heartbeat is a **separate process with no fetch** ⇒ **importing it returns the `NO-EVIDENCE-GIVEN` sentinel every time** — it would PASS the gate while carrying no information, which is the failure this issue is about wearing a different hat. And the poller's `state.json` **does not persist the sha** (`saveState` writes `openAlerts` + `lastTick` only). ⇒ **OPTIONS: (a) persist `gradedRefSha` into `state.json` per tick and have the heartbeat read it — the resumed poller's own graded sha, genuinely re-derivable, ~2 lines; (b) resolve with the sanctioned sentinel — honest but evidence-free on a dead-man clear. CC-B leans (a); with Langston 2026-07-31.**

⚠️ **A NEAR-MISS RECORDED SO NOBODY RE-RAISES IT: `systemctl cat governance-checker.service` shows `Environment=GOV_SHADOW=1`, and `config.mjs:207` is `SHADOW_MODE = process.env.GOV_SHADOW !== '0'` — which reads as "THE ENFORCER IS IN SHADOW MODE," a genuinely alarming claim. IT IS FALSE.** `systemctl show -p Environment` returns the RESOLVED value **`GOV_SHADOW=0`** ⇒ **the checker is live and enforcing**, consistent with #605 clearing for real on 07-30. ★ **`cat` prints unit-file TEXT including overridden lines; `show` prints what the process actually GETS. For any systemd claim, read `show`, not `cat` — a matching-name-not-matching-thing instance (25.c) in the config layer.**

★★ **LANGSTON RULED 2026-07-31 — OPTION (a), and he CORRECTED CC-B's severity read: THIS IS BROKEN TODAY, NOT LATENT.** *(He re-derived every citation himself at `6dbe3f55b`; not on report.)*
⛔ **THE LIVE CONSEQUENCE CC-B UNDERSTATED:** `scripts/system-alerts.ts:294` `requireFlag(args,'evidence')` → `:286-287` usage + `process.exit(1)` ⇒ **`heartbeat-check.mjs:39` ALREADY exits non-zero today**, `execFileSync` throws, and the `catch { /* terminal = fine */ }` **swallows a VALIDATION failure using a handler written to absorb a TERMINAL-STATE failure.** Then `:57` sets `hb.alertId = null` **unconditionally** ⇒ ★ **the FIRST time the checker goes silent and recovers, `governance-checker-silent` stays `active`+unacked in the §10.5 queue FOREVER, and the heartbeat has discarded the only id that could retry it.** **A permanent orphan surfacing on EVERY per-turn read — the exact class B-GOV-ORPHAN was built to kill.** ⇒ **a fix, not a nicety.**
★ **NOT MERELY USELESS TO IMPORT — NOT IMPORTABLE:** `checkerResolveEvidence()` (`poller.mjs:366-369`) **has no `export`** (poller's exports are `:43,85,99,144,162,192,200,503`). State is `{openAlerts, lastTick}` + `fetchFailStreak`/`fetchFailSev` only (`:343/344`); sha set from `rev-parse` at `:541-542`, `null` on throw. **The sha never crosses the process boundary.**
★★ **THE CORRECTION TO (a) — CC-B's version would have got this WRONG, and the reason is a path, not a race:** the staleness objection does NOT bite the resolve path (`:56` fires only when `!silent`, so `lastTick` is inside the dead-man window and the same `saveState` wrote both). ⛔ **BUT `:532` DOES: the fetch-fail early-return updates `lastTick` and RETURNS BEFORE `:541`** ⇒ **a run of fetch-fail ticks keeps `lastTick` fresh while the persisted sha AGES SILENTLY, and the heartbeat would resolve carrying a sha the checker NEVER GRADED AT.** ⇒ **PERSIST `gradedRefSha: null` ON THAT PATH EXPLICITLY — never let the last good sha survive a tick that graded nothing.** *(Same absent-as-valid family as the rest of #637: a stale-but-plausible token is worse than an honest sentinel.)*
★ **SHAPE TEST GOES IN `config.mjs`, NOT DUPLICATED:** heartbeat already imports it (`:16`); poller keeps its module-scope var and calls the shared pure helper; heartbeat reads `state.gradedRefSha` and calls the same one, falling to `NO-EVIDENCE-GIVEN` on null — **`isValidResolutionEvidence`-sanctioned (`system-alerts.ts:169`)**. **One SSOT for the token shape, zero cross-process memory.**
⚠️ **WHY IT WAS NOT IMPLEMENTED THE TURN IT WAS RULED (CC-B, stated rather than left as a gap): the ruling landed at the end of a long session in which CC-B produced FIVE adjacent-object errors, and this fix deploys to a LIVE ENFORCER and then enables a dead-man. A rushed fix here is worse than one more session of a 6-week-old outage. The ruling is recorded VERBATIM and is actionable as written.** **Sequencing unchanged and HARD: flag + catch fix → deploy → THEN `systemctl enable --now`. CC-B has root on staging for the enable.**

✅✅ **RESOLVED 2026-08-01 (CC-B, `B-GOV-HEARTBEAT-REPAIR`, code `49a41aee4` → `28b029528`, Langston Step-4 APPROVED at the ref, CI 4/4 verified job-by-job).** Fix: `--evidence` supplied from a shared `resolveEvidenceOrSentinel()` SSOT in `config.mjs`; the poller PUBLISHES `gradedRefSha` into its state file (and writes it **NULL explicitly on the fetch-fail early return**, which updates `lastTick` before the sha is set — Langston's correction, otherwise the heartbeat cites a ref the tick never graded at); `hb.alertId` nulled ONLY on a confirmed clear.
★ **VERIFIED PROVOKED, END-TO-END ON LIVE INFRA — a clean run proves nothing here (no alert held ⇒ neither branch executes; the #594 lesson).** Synthetic alert `af614cbf…` seeded → repaired heartbeat run → **at the row: `resolved` by `governance-checker-heartbeat` via `cli`, `resolution_evidence=b3d1856ffb2ca…` — a REAL graded sha, not the sentinel.** Poller half independently live at the 07:41 tick before any manual action.
⛔ **LANGSTON'S STEP-4 BLOCKER WOULD HAVE RECREATED THIS ISSUE:** the benign-error test was a bare `not found` substring, which **also matches `bash: npm: command not found`** — the classic non-login-PATH failure under a systemd timer ⇒ would have returned true, nulled the handle, reintroduced #637. Anchored to `/Alert \S+ not found/i`, discrimination verified. (`already resolved`/`terminal` removed as DEAD — no terminal-state guard exists; re-resolving succeeds and re-stamps.)
★★ **AND THE FIX'S OWN FENCE CAUGHT A FABRICATED-PROVENANCE BUG: `1785485897377` is 13 chars, ALL hex, so the sha regex accepted it. CC-B first glossed this as "would fail validation one layer deeper" — WRONG: `isValidResolutionEvidence:172` is UNANCHORED and it PASSES ⇒ a timestamp would have been persisted AS A GIT SHA. #447 class. The all-decimal guard is the only thing preventing it.**
⚠️ **THE TIMER: `enable --now` WAS NOT ENOUGH and nearly closed this batch on a meaningless green — it read `enabled`+`active` with an EMPTY `NEXT` and `LAST`=2026-06-19, because the triggers are purely MONOTONIC (`OnBootSec`/`OnUnitActiveSec`) and `Persistent=true` only rescues CALENDAR timers. No anchor existed. One `systemctl start` established it.** ✅ **Self-sustaining confirmed: unattended firings 09:20:40 · 09:35:40 · 09:50:43, next 10:05:42.** ★ **"Enabled" is not "scheduled" — this batch's own failure mode, reproduced while fixing it.**
**Outage measured at ~6 weeks. #642 (ownership register) carried, NOT solved here. RESOLVED.**

**HOME:** `B-GOV-HEARTBEAT-REPAIR` (Phase 19, small, near-term — it protects the enforcer, so it should not queue behind feature work). **Owner: TBD at the Langston reply — governance-tooling lane (CC-A) vs CC-B who filed it; asked in-channel 2026-07-31.** Related: #605, #621, B-GOV-INTEGRITY-1, `ALERT_HANDLING_PROTOCOL.md`. **OPEN (homed, owner pending).**
```

**B — `1-system-manual/SYSTEM_IMPACT_MAP.md`** *(LIVE · 2026-08-31|e44257822 · 258 commits)*

```
### #637 — the governance-checker's CROSS-PROCESS state contract (B-GOV-HEARTBEAT-REPAIR, 2026-08-01)

**COMPONENT:** `scripts/governance-checker/` — **TWO SEPARATE PROCESSES, two systemd units, one shared state file.** `governance-checker.service` (poller, every 30 min) and `governance-checker-heartbeat.service` (dead-man, every 15 min). This entry exists because the seam between them was previously documented **per-FILE**, and the defect lived **per-PROCESS** — which is precisely why the B-GOV-INTEGRITY-1 sweep fixed `poller.mjs` and missed `heartbeat-check.mjs` sitting in the same directory.

**UPSTREAM → the contract:** `poller.mjs` now writes **`gradedRefSha`** into `/var/lib/governance-checker/state.json` alongside `lastTick` and `openAlerts`. ⚠️ **It is written NULL on the fetch-fail early return**, which updates `lastTick` and returns **before** the sha is computed — so a run of fetch-fail ticks would otherwise leave a fresh timestamp beside a silently ageing sha.
**DOWNSTREAM → the only consumer:** `heartbeat-check.mjs` reads `state.gradedRefSha` to satisfy the alerts CLI's **mandatory** `--evidence`. It cannot import the poller's in-memory helper — separate process, and `checkerResolveEvidence()` is module-private and unexported. **The state file IS the boundary.**
**SHARED:** `config.mjs` `resolveEvidenceOrSentinel()` — one SSOT for the token shape, since both processes issue resolves and must agree. ⚠️ **It rejects all-decimal strings**: a `lastTick` is 13 chars of accidental hex, and the server-side validator (`system-alerts.ts:172`) is **unanchored**, so without this guard a timestamp would be persisted **as a git sha** — a fabricated provenance record (#447 class).

**BLAST RADIUS: LOW, bounded to the checker family.** Zero occurrences under `server/`; no trading-path surface; no DB schema. ⚠️ **Lookalike cleared and recorded: `server/core/governance/governance-persistence.ts:14` defines a constant with the IDENTICAL NAME `GOV_STATE_FILE` pointing at a DIFFERENT file (`governance_state.json`). Matching name, not a matching thing — verified by reading the path.**
⚠️ **OPERATIONAL PROPERTY worth knowing before touching either unit: the heartbeat timer's triggers are purely MONOTONIC (`OnBootSec`/`OnUnitActiveSec`) and `Persistent=true` does NOT apply to them.** ⇒ **`systemctl enable --now` yields `enabled` + `active` with NO next elapse if the service has never run.** It requires one `systemctl start` to anchor the chain. **"Enabled" is not "scheduled."**
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #649

**A — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
### #649 OPEN 2026-08-03 (Kyle-directed; CC-B filing + owner) — ★ TWO SESSIONS CAN DEPLOY OVER EACH OTHER, AND NOTHING PREVENTS IT — A STAGING DEPLOY LOCK

**KYLE'S ASK, and the honest answer that produced this issue:** he hoped the new delivery board would stop sessions overwriting each other's deployment pushes. ⛔ **IT CANNOT, AND MUST NOT BE BELIEVED TO.** ★ **We already have this lesson in writing — rule 25.b: the crew board "REPORTS, it does not BLOCK. A green board is not a guarantee."** And it is not theory: on 2026-07-31/08-01 three sessions collided on the SAME alert rows FOUR times in one evening **with a claim convention already in place**, and two of those collisions **silently destroyed each other's writes** (#647, the lost-update finding). **An advisory mechanism does not stop a concurrent actor; it only tells you afterwards.**

**WHAT ALREADY PROTECTS US, so this is scoped to the real remaining gap:** separate clones killed the shared-index race **structurally** (#557); git's push rejection is **harder than any advisory lock**; `main` is force-push protected. ⇒ **THE UNCOVERED CASE IS STAGING DEPLOY:** `git reset --hard <sha> && npm run build && pm2 restart` run by two sessions close together — the second **silently replaces the first's deployed code, mid-verification.** ⚠️ **Every §9.3 verification and every live-evidence claim made in that window is then about code that is no longer running, and NOTHING SAYS SO.** That is the same class as the lost update: the loser is not told they lost.

★ **THE FIX SHAPE — "prefer IMPOSSIBLE over INTERCEPTED" (Langston's rule, and §7.1's disabled-backup-URL precedent: *"a push from it fails at git, not at somebody's memory"*): a LOCK ON STAGING THAT THE DEPLOY PATH ITSELF CHECKS, so a second deploy is REFUSED rather than warned.** Sketch, not a design: an atomically-created lock file naming holder + sha + timestamp; deploy refuses while held; released on completion; **a stale lock is broken only on the #540 tier-3 protocol (no live process across several samples + mtime frozen), never blindly**; and the holder is visible so nobody has to ask who is deploying.
⚠️ **MUST NOT BE:** a check anybody can forget to run, or a board anybody can forget to read. **If it is not in the deploy path, it does not exist.**

✅✅ **RESOLVED 2026-08-06 (CC-B, `B-DEPLOY-LOCK`, final `280768887`; Langston Steps 1/2/4/8 ALL APPROVED at refs, 11 substantive review catches).** `dt-deploy` is the only documented staging deploy path: locks (refuse-not-queue, holder named, tier-3 in the refusal), dirty-refusal (protected 10 real items live), reviewed-refs only, conditional `npm ci`, **migrate in-chain (closes #140)**, post-conditions at the objects (identity + ENGINE RESUMED), record only after they pass incl. durable `migrate_ran_at/migrate_ms`. **Two real self-deploys: windows 15s and 11s — 20×+ inside the watchdog's 300s never-fires bound.** Six prescriptive sites + two Step-8 survivors swept; wide-grep clean at the ref; dormant CI deployer DELETED (OBJ-8). Record: `B_DEPLOY_LOCK_COMPLETION_REPORT.md`. **RESOLVED.**
**HOME: `B-DEPLOY-LOCK`, owner CC-B. Kyle-directed queue position: NEAR THE TOP of the backlog** — ahead of the queued cleanup work, because it protects the correctness of every verification claim we make. Related: #647, #557, rule 25.a/25.b, §7.1, §9.3. **OPEN (homed, queued high).**
```

**B — `1-system-manual/SYSTEM_IMPACT_MAP.md`** *(LIVE · 2026-08-31|e44257822 · 258 commits)*

```
### #649 — `dt-deploy`: the staging deploy path + lock (B-DEPLOY-LOCK, 2026-08-06)

**COMPONENT:** `scripts/dt-deploy.sh` (repo) → installed `/usr/local/bin/dt-deploy` on staging **from the git blob at the deployed sha** (⚠️ an installed copy outside the repo is the #641 shape — the drift check `installed sha256 == blob` is a carried item, folded into P19-B12 with #652).
**UPSTREAM:** invoked manually by the batch-owning session (§7.1 — deploys stay deliberate). Reads `origin/migration/aws-supabase` only (ancestor-gated). **DOWNSTREAM:** the app clone `/home/deploy/dawntrader` (reset, build, migrate, restart) · `dist/BUILD_SHA` (written by the BUILD script — identity is the artifact's property) · `/api/health/liveness.buildSha` (the assertion surface) · `/home/deploy/dawntrader-deploy.record` (sha · restart_time · window · migrate_ran_at/ms · **#656: deployed_by_claimed** (the REQUIRED `--by <session>`, a claim labelled a claim) **+ deployed_via** (observed unix identity, space-bearing — record is split-on-first-`=`, never sourced) — **Step-7/8 verification MUST compare recorded-vs-live on the three-branch read: sha drift = overwrite · counter higher = crash · counter lower = boot-resurrect**).
**SHARED STATE:** the lock `/home/deploy/dawntrader-deploy.lock` — OUTSIDE the repo so no reset touches it; broken only per #540 tier-3, stated in the refusal. **INTERACTIONS:** the census + intent table for every governance system lives in `B_DEPLOY_LOCK_PRE_AUDIT.md` §1-2 (checker/heartbeat/alert-protocol/crew/board/guards/§7.1/watchdog — the watchdog's real bands are <5min never · 5-10 intermittent · ≥10 always, and both measured windows were ≤15s). **BLAST RADIUS: LOW** — no trading-path surface; the one server-code change is the `buildSha` field on the liveness response.
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #651

**A — `.claude/memory/MEMORY_CC_INFRA.md`** *(LIVE · 2026-08-29|021831a98 · 13 commits)*

```
- **#651 B-RULES-1E-LANGSTON-SLIM** — Langston's instruction-file restructure (lean core + on-demand modules + ledger split). Transferred to me by CC-A. **NOT STARTED**; Kyle has not given the go.
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
### #651 CLOSED-AS-BUILT 2026-08-05 (CC-A, B-RULES-1a OBJ-2; Langston ruled per-item, applied same day) — ★★ THE REVIEWER'S MEMORY FILE NEVER LOADED, AND HIS ALWAYS-LOADED FILE CARRIED SIX FALSE/STALE STATEMENTS — ALL FIXED, LOAD PROVEN AT BOTH INVOCATION PATHS

**THE HEADLINE DEFECT (measured 2026-07-31, fixed 2026-08-05):** `/home/langston/MEMORY.md` — the file §2 step-10.b has had every session syncing every batch — **had NEVER loaded at invoke.** His §10/§12 claimed it auto-loads; `/context` showed it absent. **Fix: an `@MEMORY.md` import in `/home/langston/CLAUDE.md`, labelled to disambiguate it from the harness auto-memory index.** ★ **LOAD PROVEN, not asserted — Langston's own three conditions:** sentinel existing in MEMORY.md and NOWHERE else, returned verbatim with correct file attribution from BOTH real invocation paths (`langston-call` alert/queue invoke AND a Discord-bridge invoke — two independently-configured sites, same census lesson as the model switch). Sentinel removed after verification.

**THE SIX FIXES (design ask `B_RULES_1A_OBJ2_LANGSTON_FILE_FIXES_r1.md` @ `c3e93c1c1`; Langston PROCEED per-item, B5 via r2→r3):** (A2) the import · (B1) §4 step-4 "review BEFORE push" → graded-ref wording WITH the corrective parenthetical (his amendment: swap the words without it and the list order still asserts the wrong sequence) · (B2) trading-mode block: "active trading dormant" + "Kraken's paper order system" both replaced with the corrected rule-20 text; Trap paragraph verified intact · (B3, his amendment caught MORE than the ask: not just "18"→SSOT — both stored enumerations OMITTED `orb` (true split 10 file-based + 9 in-class) and the SSOT line refs had drifted `:365`→`:511` ⇒ count AND lists AND line refs all dropped for a pointer-to-the-SSOT) · (B4) retired `/mnt/gdrive` repo path struck from §9; §18 what-to-do re-pointed at the graded-ref read model · (B5) §10.5 step 3 REPLACED — the old text was inverted on mechanism.

★★ **B5'S TWO MECHANISM CORRECTIONS ARE LANGSTON'S, RE-DERIVED AT THE REF, AND WORTH KEEPING VISIBLE:** (1) **an ack SILENCES, not merely claims** — `acknowledged` is non-terminal, so a same-`dedupe_key` acked row blocks every FUTURE occurrence (`server/services/system-alerts.ts:388-389`); only `resolve` frees the key. **His positive control, end-to-end on the live store:** alert `7527e9d6` (key `price-skip-paper-DD/USD`) resolved 13:05:00Z → NEW row `58abccd2`, same key, minted 13:08:39Z. **Had he acked instead, that recurrence would never have been written anywhere.** (2) the short-id no-op is LOUD (`Alert <id> not found`, exit 1, `scripts/system-alerts.ts:276-279/:303-306`) — the observed silence came from callers muting stderr; and `resolve --evidence` is hard-required (`scripts/system-alerts.ts:294` — his rule-29(c) correction of my `:293`, a comment line, "a comment is the claim, not the mechanism").

⚠️ **DOC-GAP CROSS-REF (flagged, deliberately NOT fixed here — who-holds-the-wrench):** `ALERT_HANDLING_PROTOCOL.md:40` covers only same-row staleness re-surfacing; it NEVER states the dedupe-key blocking mechanism — which Langston ruled the MORE dangerous of the two ("staleness re-surfacing loses promptness on a row that still exists; dedupe blocking loses THE EVENT ITSELF"). **HOME: CC-B's `B-ALERT-DEDUPE-REASON-DRIFT` board card; if that card's scope turns out not to cover the doc fix, THIS entry is the §13 fallback home.**

★ **B6 — THE SLIMMING LEG, NAMED HOME (Langston's §13 condition):** the import adds ~24 KB to an always-loaded file now at 63,750 B — right trade (a memory file that never loads is worse than a large one that does), but it raises the slimming priority. **HOME TRANSFERRED 2026-08-05: `B-RULES-1E-LANGSTON-SLIM` → **INFRA Claude’s lane** (Kyle-directed Langston-infrastructure session; their Langston-reviewed lean-core + `/home/langston/rules/` module restructure IS this work). CC-A’s 1e leg covers the CC-side ordering only. ⚠ Coupling flagged at hand-off: the `langston-log-loaded` instrument stats a HARDCODED candidate set — a restructure that moves content into modules must extend the instrument in the same change, or the slimming baseline silently under-reads. And the §2 step-10.b per-batch MEMORY.md sync path must move WITH any memory re-homing.**

**★ STEP-4 APPROVED (Langston, at the ref, 2026-08-05) — TWO CARRIES HOMED AT B-RULES-1b, required before anything builds on the baseline:** (1) `log-instructions-loaded.mjs` must stamp a top-level `degraded: true` when any candidate is missing AND derive the memory dir the way its sibling `load-own-memory.mjs` does (`CLAUDE_PROJECT_DIR` + transcript-path, refuse-to-guess) — the current basename reconstruction is a second, weaker derivation whose failure silently shrinks `context_bytes_total`, absent-as-valid INSIDE the instrument built to catch that class; (2) the CC-side JSONL gets logrotate parity (fat census row per startup|resume|COMPACT, no rotation today). **And a Step-4 finding on the DISPATCH, owned:** the full sha I sent him did not exist (`…573edebe4b09440e` was the real tail) — retyped, not captured; the B-ARM retype class on the one field a graded-ref review turns on. Fresh rule: shas in dispatches are pasted from command output inside the compose file, never typed. **Backups:** `/root/backups/langston-{CLAUDE,MEMORY}.md.pre-obj2-20260805-131246. Before-states quoted in LANGSTON_ARCHITECTURE.md §10 per its own record-what-it-was rule. | CLOSED-AS-BUILT (governance this commit)
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #669

**A — `.claude/memory/MEMORY_CC_B.md`** *(LIVE · 2026-08-16|0da05354f · 303 commits)*

```
- **#669 — `p19-b8-5-obj6-gate-shadow.test.ts` 2 assertions red, PRE-EXISTING, the only red on the branch.** Consequence: **rule 19's "CI 4/4" is unsatisfiable by ANY batch** while it is open — cite per-job state and name #669 instead of claiming 4/4. Owner CC-B, own micro-batch.
- **★ ARMED ALERTS (verified present, not recalled):** `63d41a75` Aug-29 06:00Z — the Aug 29-31 retention sweeps must actually free ~42GB (gauge reaches ~96% first). `65bb4388` daily dt-deploy observation. `7c4a873f` T-W20C-SCALAR-LEG (Aug 13).
- **★ STORAGE — settled, and one retraction of mine stands:** DB = **133 GB** (`pg_database_size`; my earlier **173.6 GB was a `relkind r,i,t` sum double-counting indexes+TOAST — withdrawn**). July is the last full-month partition; daily rolling-30 partitioning from 08-01 cuts the accrual rate; July is sweep-eligible 08-31 and `b75-retention-sweep` is cron-driven and auto-slices oversized monthlies (June choked because it was NOT sliced). **I retracted my own claim that a manual late-August run was needed.**
- **★ INSTRUMENT TRAP, committed to the board protocol at `d695fb7f2`:** `gh project item-list --format json` reported a field as `None` that the API showed correctly set. **The write was fine, the read-back was wrong** — a false negative on the very check the protocol mandates. Verify card fields against the item's `fieldValues`, never `item-list`.
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
**#669 UPDATE 2026-08-07 — DIAGNOSED. RULE-24 OUTCOME (3): the TEST is stale, the CODE is correct. NOT a defect.**

**CAUSE:** `59939a0bd` (2026-08-07 **04:54:25 UTC**, *B-SIZING-DEC-RESTORE Step-3 (4/n)*, **owner CC-C**) deleted the **11.7S confidence floor** from `signal_quality_evaluator.ts`. The deletion is **deliberate, Kyle-directed, and justified in an in-place comment**: the floor derived from the deleted class-less stability→posture overlay, and it was **already non-blocking** — VTS bypassed it via `skipConfidenceFloor`, the live path ran it in `gateShadowMode` — so *"removing it changes NO admission decision today."*

**ESTABLISHED ON THREE LEGS, not clock-order:** (1) the deleting commit read at the site; (2) **ancestry** — `git merge-base --is-ancestor 59939a0bd a3510b9e3` ⇒ true, so the deletion is genuinely in the tree of the first-observed red (06:17 UTC); (3) **content control on both sides of the boundary** — the deletion marker is absent in the parent `2f0ebfdbb` (0 matches) and present in `59939a0bd` (1).

**WHY EXACTLY TWO OF FOUR ASSERTIONS FAIL — the two whose premise needs a LIVE `Confidence ` failure to exist:**
- `:72` asserts the live path produces a `Confidence ` failure. No confidence gate exists on that path now ⇒ `expected false to be true`.
- `:95` asserts `live.failures.length > 1` (Confidence **plus** NetEV). With the floor gone the live path yields exactly one failure, NetEV ⇒ `expected 1 to be greater than 1`.

★ **The second failure is the OPPOSITE of a bug.** That assertion existed to prove `gateShadowMode` rescued the exploration lane from a **structural zero** (a live Confidence failure made `isNetEvOnlyFailure` false, so exploration could never admit — P19-B8.5 OBJ-6, `573b38f83`, Langston-approved, #514). **With the floor deleted, that structural zero is gone on the LIVE path too** — the condition the test was written to demonstrate a workaround for no longer exists. The live-vs-shadow distinction collapsed because the gate distinguishing them was removed. **The other two assertions (shadow suppresses both gates; a negative netEV still rejects) correctly still PASS** — which is itself the control showing the file is not broadly broken.

**FIX:** retire/rewrite the two assertions **with the reason recorded at the site**, so a later reader does not "restore" a floor that was deliberately cut. ⚠️ **NOT a code change — reinstating a class-less floor here would rebuild exactly what obj-10 deleted** (the deletion comment says so explicitly).

**OWNERSHIP — RAISED, NOT UNILATERALLY TAKEN:** #669 is homed to CC-B, but the cause is **CC-C's in-flight batch**, and a batch that deletes a gate while leaving the test asserting it is incomplete by our own CI rule. Options put to Langston + CC-C: **(a)** CC-C folds the test update into B-SIZING-DEC-RESTORE, where the deletion and its justification already live (CC-B's preference); or **(b)** CC-B takes it as the #669 micro-batch citing obj-10 as provenance. **CC-B will not start either without a call** — editing tests inside another session's live batch is the §28 collision. **STATUS: OPEN, diagnosed, awaiting an ownership call.**
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

### #732

**A — `1-system-manual/MISTAKE_PATTERNS.md`** *(LIVE · 2026-08-30|755832d42 · 31 commits)*

```
**#732 was DEPRIORITISED on a measured 7-for-7 record: all seven `trailing_stop_hit` rows are winners that exited at or above target.** The deferral rests entirely on that pattern holding. **So the pass checks it, because a deferral with no tripwire is an intention:**
```sql
select symbol, net_pnl, exit_price, take_profit, closed_at from closed_trades
 where close_reason = 'trailing_stop_hit' and (net_pnl < 0 or exit_price < take_profit);
```
**ANY row ⇒ #732 returns to priority and is reported to Kyle that week.** **Zero rows ⇒ record "tripwire clear" in the run-log row.** *It rides this pass deliberately — no second scheduled job and no additional token cost.*
```

**B — `1-system-manual/RUNNING_ISSUES.md`** *(LIVE · 2026-08-31|7b13a0eeb · 953 commits)*

```
### #732 OPEN 2026-08-20 (CC-A; KYLE spotted a `TRAIL STOP` badge on the Paper Trading screen and asked how it is possible when trailing/BE/moonbag were turned OFF) — ★★ `targetLatched` IS SET **OUTSIDE** THE MOONBAG GATE, SO A PLAIN TARGET HIT IS LABELLED `trailing_stop_hit` WITH TRAILING FULLY OFF

⛔ **KYLE WAS RIGHT THAT IT SHOULD BE OFF, AND IT IS OFF. THE TRAILING LADDER NEVER RUNS. THE LABEL IS WRONG.**

**THE SWITCHES — ALL EIGHT FALSE, measured in `module_constants` at the live DB:** `trailing_enabled_active` **false** × 4 asset classes and `trailing_enabled_vts` **false** × 4, all `updated_by p19-b8.5i`, `2026-07-23 00:52:56Z` · `break_even_enabled` **false** × 4 (B79.TEC; xstock_spot by `kyle-directive-2026-05-21-disable-xstock-be`) · `moonbag_qualifying_strategies` **`[]`** × 4.
✅ **AND THE MASTER SWITCH IS CORRECTLY WIRED** — `trailing-exit-controller.ts:516-517`: `isMoonbagQualifier` resolves the per-path flag and `return false` when it is off, at *"the single chokepoint all three consumers route through"* ⇒ **the `TRAILING_TAKE` ladder is genuinely unreachable.** The P19-B8.5i build is not the defect.

⛔⛔ **THE DEFECT IS ONE LINE'S PLACEMENT — `trailing-exit-controller.ts:1198`:**
```js
if (!state.targetLatched && !targetLockDiscontinuity.active) {
  if (isTargetLockTriggered(update.currentPrice, state.targetPrice)) {
    state.targetLatched = true;              // ← SET UNCONDITIONALLY, BEFORE THE GATE
    if (moonbagQualified && moonbagAllowed) { // ← the gate the switch controls
```
⇒ **`targetLatched` records "price reached target", NOT "the moonbag ladder was entered".** The switch correctly blocks the ladder underneath it and **does not, and cannot, block the latch.**
**Then the consumer branches on the LATCH, not on the ladder** — `tec-evaluator.ts:405-407`: `if (update.targetLatched) { exitReason = 'trailing_stop_hit'; }`. ⇒ **a trade that merely touched its target is closed and labelled a trailing-stop exit.**

**MEASURED CONSEQUENCE — object `closed_trades`, whole table:**
| close_reason | n | trade_mode | ladder_rungs_hit>0 | window |
|---|---|---|---|---|
| `trailing_stop_hit` | **7** | **TARGET ×7** | **0 ×7** | 2026-07-29 → 2026-08-19 |
⇒ ★ **ALL SEVEN POST-DATE the 2026-07-23 switch-off**, and **every one is in `TARGET` mode with zero rungs and `original_stop_price == stop_loss` (the stop never ratcheted)** — the exact signature of "latched, never laddered."
**Two most recent, both exiting ABOVE their own target:** `VVV/USD` tp `14.64157143`, exit **`14.79200000`**, opened 08-18 22:05Z closed 08-19 21:06Z · `CRV/USD` tp `0.27197786`, exit **`0.27254000`**.

**⚠️ TWO CONSEQUENCES, AND THEY ARE NOT THE SAME SEVERITY — do not collapse them:**
1. ✅ **RECORD CORRUPTION — ESTABLISHED.** Seven target hits are recorded as trailing-stop exits. **`vts-service.ts:982` maps `trailing_stop_hit` → `take_profit`, and `vts-runner.ts:3635` counts it as a winner**, so downstream analytics inherit the mislabel. **Any study of "how well does trailing perform" reads these seven as trailing outcomes when trailing never ran.**
2. ⚠️ **POST-TARGET EXPOSURE — A QUESTION, NOT A CLAIM, AND IT IS THE ONE THAT MATTERS.** The exit price is `currentPrice` at the moment `tecShouldClose` fires, **not** the target — so the position is evidently held *past* target. **Both observed cases closed ABOVE target (favourable). Whether a reversal after latch can give back the gain is NOT established here** — it requires reading what stop `tecShouldClose` checks once latched with no ladder and no ratchet. **I have not traced that and am not asserting it.**

**§9.5(b-ii) — SEARCHED BEFORE FILING, and this is NOT #640.** #640 (WITHDRAWN 2026-07-31, not-a-defect) asked *why the ladder COLUMNS are empty on these rows* and correctly answered that a trailing exit does not require a prior latch-capture. ⇒ **it never asked why the rows EXIST AT ALL with the master switch off** — and at the time it ran the switch had already been false for 8 days. **Different question, opposite direction.** Related but distinct: **#562** (Kyle's on/off-switch directive — the switch it asked for WAS built and works) · **#640** · **#556**.

⛔⛔ **PRE-WORK 2026-08-28 — TWO ROUNDS OF THE REVIEWER LOOP, AND MY CLAIM WAS WITHDRAWN TWICE. THIS IS THE INVESTIGATION’S STARTING POINT, NOT ITS ANSWER.** *(Recorded here because `B-EXIT-LATCH-INVESTIGATION` is scheduled AFTER `B-MEASURE-GATE` and must not be worked out of order.)*

**`REVIEWER r1: claim-only · "what objects would settle 21-trades-above-target?" · HIT · re-derived y`** — named `ladder_rungs_hit`, `trade_mode`, `phantom_fill_suspect`, `mode`, the missing denominator, and that **`take_profit` is frozen at entry and never re-stamped on ratchet**. ⇒ re-measured with all of them: **all paper, all long, `phantom_fill_suspect=false` on all 21, 91 NULL rows excluded, denominators stated.**
**`REVIEWER r2: object · "is 14-of-14 a defect or a definition?" · HIT · re-derived y`** — ⛔ **IT IS A DEFINITION, AND MY CROSS-BUCKET COMPARISON MEASURED A CLAMP.** On latch the stop floor becomes **target + cost buffer** and is monotonic (`trailing-exit-controller.ts:1117/1205/1208`), and the close fires only at `currentPrice <= currentStopPrice` (`:1581`) ⇒ **a `trailing_stop_hit` is above target BY CONSTRUCTION.** Worse: **`target_hit` clamps its exit to the target (`tec-evaluator.ts:382`) and `stop_hit` clamps to the stop (`:409-411`)** — **two of the four buckets CANNOT exceed take-profit, so my contrast measured the clamp, not behaviour.** ★ **Also: `moonbag_timeout` is written into the SAME `trailing_stop_hit` bucket (`active-execution-engine.ts:1836-1841`) — the 14 are two causes, unsplit.**

⛔⛔ **AND IT INVALIDATED MY EVIDENCE, NOT ONLY MY CONCLUSION — THE PART THAT MATTERS MOST.** I reported to Langston that his ledger claim (*ladder config-gated off, 0 rungs all-time*) **HELD**, citing `ladder_rungs_hit=0` on 653/653 and `trade_mode='TARGET'` on 653/653. ⚠️ **BOTH ARE COLUMN DEFAULTS WITH EXPLICIT BACKFILLS** (`2026-04-25-b65-4-add-ladder-rungs.sql:29` `NOT NULL DEFAULT 0`; `2026-04-23-b65-2-….sql:72,77-78` `DEFAULT 'TARGET'` + backfill). ★ **I READ A COLUMN DEFAULT AS A MEASUREMENT, and 653/653 was itself the tell that the stamp does not discriminate on this population.** ⇒ **my confirmation of his claim was worthless; the claim needed different evidence.**

✅ **THE EVIDENCE THAT ACTUALLY DISCRIMINATES, and it does hold his conclusion up:** `latch_trigger_price` is NULL on **0 of 653** ⇒ **never stamped anywhere, unusable either way** (control caught it). `rung_target_history` is non-null on 138 rows — **and its value is `[]` on all 138**, so "non-null" was also not the measurement. ★★ **THE ONE THAT WORKS: `original_stop_price <> stop_loss` on ZERO of 653 rows ⇒ THE STOP NEVER RATCHETED, ON ANY TRADE, EVER.** Two independently-written columns; their equality is a fact, not a default.

⛔⛔ **WHICH RE-OPENS IT, AND THIS IS WHAT THE INVESTIGATION INHERITS: THE TAUTOLOGY EXPLANATION REQUIRES A RATCHETED STOP, AND THERE ISN’T ONE.** Sample rows: `tp 1.53142429, exit 1.55397000, original_stop = stop_loss = 1.37124143`. **The exit price sits far ABOVE the only stop the row ever recorded.** ⇒ **`currentPrice <= currentStopPrice` cannot be what fired on the persisted numbers.** Either the ladder ratcheted **in memory and was never written back** (`active-execution-engine.ts:1753-1757` writes on `newStop > stopLoss`), or something else closed these. ⚠️ **UNRESOLVED AND DELIBERATELY LEFT SO.**
★ **Timing, stated because it cuts against the standing belief: all 14 closed 2026-07-29 → 2026-08-22, i.e. AFTER the 2026-07-23 config epoch that trailing is believed disabled by.**
⚠️ **The 2 `target_hit` rows both closed 2026-07-15, a different era — one is 0.036% over (tick-scale, expected), one is ONDO at 4.5% over an exit that is supposed to be CLAMPED to the target. That single row is the sharpest object in the set.**

★★ **SPLIT 2026-08-27 (KYLE) — THE INVESTIGATION IS NOW ITS OWN SCHEDULED ITEM, AHEAD OF THE FIX, AND THE FIX’S TIMING IS DECIDED BY WHAT IT FINDS.**
⛔ **Kyle: *"I just wanna make sure it’s not a symptom of a much bigger and uglier problem before I just write it off as absolutely nothing."*** ⇒ **`B-EXIT-LATCH-INVESTIGATION`, owner CC-A, placed at `PHASE_19_PLAN.md` §governance queue position 4, after `B-MEASURE-GATE`** (§9.4 disposition 4). The fix `B-EXIT-LABEL-TRUTH` stays at the back of Phase 19 and is **re-timed on the investigation’s answer — Kyle decides, once an answer exists.**

⛔⛔ **THE QUESTION IS NOT THE LABEL, AND THIS IS WHY THE DEFERRAL SHOULD NOT HAVE BEEN TAKEN AS SETTLED. A WRONG LABEL EXPLAINS A WRONG *NAME*. IT DOES NOT EXPLAIN WHY A TRADE HELD PAST ITS OWN TARGET AND EXITED ABOVE IT.** Two of the seven did: `VVV/USD` tp `14.64157143` → exit **`14.79200000`** (held ≈23h), `CRV/USD` tp `0.27197786` → exit **`0.27254000`**. ★ **Consequence 2 was recorded as *"must be resolved BEFORE the label fix"* and then nothing resolved it — the severity measurement scored the LABEL and the deferral inherited that score.**

⚠️ **AND MY OWN TRIPWIRE CANNOT SEE THE BIGGER VERSION — STATED BECAUSE I BUILT IT AND IT READS AS COVERAGE.** It queries `where close_reason = 'trailing_stop_hit'`. **Its population IS the mislabelled rows.** ⇒ **if the underlying cause is an exit-EVALUATION defect, it would express on trades closing under OTHER reasons, and the tripwire would return CLEAR every week while the problem widened.** *(It has: 14 rows, 0 breaches, 2026-08-27 — a true statement about a population that excludes the failure mode being feared.)*

★ **HYPOTHESIS FOR THE INVESTIGATION TO TEST OR KILL — LABELLED A HYPOTHESIS, NOT A FINDING (rule 24.a: cause claims need tested reach).** The live `§10.5` alert class **"Exit checks SKIPPED — mark older than ceiling"** (`4da8950d` MOH/USD, `29c6ada8` TGT/USD, emitter `active-execution-engine.ts:176`, measured intermittent at 25-65% of cycles) describes **exit checks not running on a cycle.** ⇒ **an exit check that does not run cannot notice a target being reached, and the price keeps moving — which is the shape of "held past target, exited above it."** ⛔ **NOT ASSERTED: the skips are measured on quiet off-hours xStock names and both hold-past-target rows are CRYPTO, so the populations do not obviously overlap. That mismatch is the FIRST thing to test, not a reason to drop the link.** ⚠️ **The alert rows themselves are CC-C’s by Langston’s markers — this investigation tests the MECHANISM link, it does not take their items.**

**WHAT THE INVESTIGATION MUST DELIVER:** (a) for each of the seven, **whether the exit was evaluated late or evaluated on time and acted on wrongly** — the two have different fixes; (b) a **§9.5(a) census on the exit-evaluation path** — who reads the mark, who decides an exit, who writes the close reason, **and who else can close a trade** (the DELETE-equivalent question); (c) the same query run **without the `close_reason` filter**, so the population is trades-that-exited-past-target rather than trades-labelled-trailing; (d) an explicit **outcome (1)/(2)/(3)** per rule 24.

**DISPOSITION (rule 24): outcome (1) on the LABEL — a real defect with a one-line-placement root cause.** The fix is to branch the exit reason on **ladder entry** (`tradeMode === 'TRAILING_TAKE'` / `ladderRung > 0`) rather than on `targetLatched`, so the label reports what actually happened. ⚠️ **Consequence 2 must be resolved BEFORE the label fix, not after** — if the hold-past-target is unintended, relabelling would hide the symptom that surfaced it.
```

**VERDICT (Langston):** ` ` — SUBSTANTIVE / TRIVIAL / DETECTOR ERROR

---

## THE 168 LIVE-vs-FROZEN PAIRS — BY FILE-PAIR

⛔ **His asymmetry: a wrongly-LIVING pair enters the census and he kills it at verdict time. A wrongly-FROZEN pair leaves SILENTLY and he never sees it. This list is the only place a false negative can hide.**

| id | A | B | frozen side |
|---|---|---|---|
| #10 | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` | `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` |
| #10 | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` | `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md` | `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` |
| #10 | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` | `Claude Comms and Packages/Scope Files/BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` | `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` |
| #10 | `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md` | `BATCH_78_SCOPE.md` |
| #10 | `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | `Claude Comms and Packages/Scope Files/BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` | `BATCH_78_SCOPE.md` |
| #10 | `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` | `BATCH_79_0i_PRE_AUDIT.md` |
| #12 | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` | `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` |
| #12 | `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` | `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md` | `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` |
| #12 | `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md` | `BATCH_78_SCOPE.md` |
| #92 | `Claude Comms and Packages/Batch Completion/BATCH_79_0L_COMPLETION_REPORT.md` | `Claude Comms and Packages/Batch Completion/BATCH_79_0j_COMPLETION_REPORT.md` | `BATCH_79_0L_COMPLETION_REPORT.md` |
| #92 | `Claude Comms and Packages/Batch Completion/BATCH_79_0L_COMPLETION_REPORT.md` | `Claude Comms and Packages/Langston Design Asks/B79_0m_scanner_orchestration_wire_design_ask_rev1.md` | `BATCH_79_0L_COMPLETION_REPORT.md` |
| #92 | `Claude Comms and Packages/Batch Completion/BATCH_79_0j_COMPLETION_REPORT.md` | `Claude Comms and Packages/Langston Design Asks/B79_0m_scanner_orchestration_wire_design_ask_rev1.md` | `BATCH_79_0j_COMPLETION_REPORT.md` |
| #137 | `Claude Comms and Packages/Scope Files/P19_B3_SCOPE.md` | `Claude Comms and Packages/Scope Files/P19_B3b_TRIAGE.md` | `P19_B3_SCOPE.md` |
| #139 | `Claude Comms and Packages/Batch Completion/P19_B3a_COMPLETION_REPORT.md` | `Claude Comms and Packages/Change Lists/P19_B3a_CHANGE_LIST.md` | `P19_B3a_COMPLETION_REPORT.md` |
| #139 | `Claude Comms and Packages/Batch Completion/P19_B3a_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B3_PRE_AUDIT.md` | `P19_B3a_COMPLETION_REPORT.md` |
| #139 | `Claude Comms and Packages/Batch Completion/P19_B3a_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B3_SCOPE.md` | `P19_B3a_COMPLETION_REPORT.md` |
| #139 | `Claude Comms and Packages/Change Lists/P19_B3a_CHANGE_LIST.md` | `Claude Comms and Packages/Scope Files/P19_B3_PRE_AUDIT.md` | `P19_B3a_CHANGE_LIST.md` |
| #139 | `Claude Comms and Packages/Change Lists/P19_B3a_CHANGE_LIST.md` | `Claude Comms and Packages/Scope Files/P19_B3_SCOPE.md` | `P19_B3a_CHANGE_LIST.md` |
| #139 | `Claude Comms and Packages/Scope Files/P19_B3_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B3_SCOPE.md` | `P19_B3_PRE_AUDIT.md` |
| #163 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_4_7_PRE_AUDIT.md` | `B_4_7_PRE_AUDIT.md` |
| #202 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_NEW_52_COMPLETION_REPORT.md` | `B_NEW_52_COMPLETION_REPORT.md` |
| #206 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_5b_COMPLETION_REPORT.md` | `P19_B8_5b_COMPLETION_REPORT.md` |
| #207 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_NEW_53_1_SCOPE.md` | `B_NEW_53_1_SCOPE.md` |
| #208 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/BATCH_B_NEW_53_1_COMPLETION_REPORT.md` | `BATCH_B_NEW_53_1_COMPLETION_REPORT.md` |
| #209 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/BATCH_B_NEW_53_1_COMPLETION_REPORT.md` | `BATCH_B_NEW_53_1_COMPLETION_REPORT.md` |
| #219 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RTB_REFRESH_CONSOLIDATE_PRE_AUDIT.md` | `B_RTB_REFRESH_CONSOLIDATE_PRE_AUDIT.md` |
| #221 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B4a_PRE_AUDIT.md` | `P19_B4a_PRE_AUDIT.md` |
| #222 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #222 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` |
| #222 | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #223 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #223 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` |
| #223 | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #224 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #224 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` |
| #224 | `Claude Comms and Packages/Langston Design Asks/B_5_1_STEP8_EVIDENCE_rev1.md` | `Claude Comms and Packages/Scope Files/B_5_1_AMR_INPUT_INTEGRITY_SCOPE.md` | `B_5_1_STEP8_EVIDENCE_rev1.md` |
| #228 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B4_SCOPE.md` | `P19_B4_SCOPE.md` |
| #231 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B4_SCOPE.md` | `P19_B4_SCOPE.md` |
| #233 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RTB_REFRESH_CONSOLIDATE_PRE_AUDIT.md` | `B_RTB_REFRESH_CONSOLIDATE_PRE_AUDIT.md` |
| #236 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B4a_COMPLETION_REPORT.md` | `P19_B4a_COMPLETION_REPORT.md` |
| #295 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B4b_1_COMPLETION_REPORT.md` | `P19_B4b_1_COMPLETION_REPORT.md` |
| #295 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/P19_B4b_1_CHANGE_LIST.md` | `P19_B4b_1_CHANGE_LIST.md` |
| #295 | `Claude Comms and Packages/Batch Completion/P19_B4b_1_COMPLETION_REPORT.md` | `Claude Comms and Packages/Change Lists/P19_B4b_1_CHANGE_LIST.md` | `P19_B4b_1_COMPLETION_REPORT.md` |
| #296 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B4b_2_COMPLETION_REPORT.md` | `P19_B4b_2_COMPLETION_REPORT.md` |
| #297 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_5e_COMPLETION_REPORT.md` | `P19_B6_5e_COMPLETION_REPORT.md` |
| #297 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/P19_B4b_D5_CHANGE_LIST.md` | `P19_B4b_D5_CHANGE_LIST.md` |
| #297 | `Claude Comms and Packages/Batch Completion/P19_B6_5e_COMPLETION_REPORT.md` | `Claude Comms and Packages/Change Lists/P19_B4b_D5_CHANGE_LIST.md` | `P19_B6_5e_COMPLETION_REPORT.md` |
| #298 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_NAMES_1_COMPLETION_REPORT.md` | `B_NAMES_1_COMPLETION_REPORT.md` |
| #300 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B4b_2_COMPLETION_REPORT.md` | `P19_B4b_2_COMPLETION_REPORT.md` |
| #301 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B4b_2_COMPLETION_REPORT.md` | `P19_B4b_2_COMPLETION_REPORT.md` |
| #301 | `1-system-manual/SYSTEM_MANUAL.md` | `Claude Comms and Packages/Batch Completion/P19_B4b_2_COMPLETION_REPORT.md` | `P19_B4b_2_COMPLETION_REPORT.md` |
| #320 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_5a_COMPLETION_REPORT.md` | `P19_B6_5a_COMPLETION_REPORT.md` |
| #320 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/P19_B6_5b_STEP4_CHANGE_LIST.md` | `P19_B6_5b_STEP4_CHANGE_LIST.md` |
| #320 | `Claude Comms and Packages/Batch Completion/P19_B6_5a_COMPLETION_REPORT.md` | `Claude Comms and Packages/Change Lists/P19_B6_5b_STEP4_CHANGE_LIST.md` | `P19_B6_5a_COMPLETION_REPORT.md` |
| #321 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_5a_COMPLETION_REPORT.md` | `P19_B6_5a_COMPLETION_REPORT.md` |
| #323 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_8_SCOPE.md` | `P19_B6_8_SCOPE.md` |
| #324 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/BATCH_B_GOV_COMPLETION_REPORT.md` | `BATCH_B_GOV_COMPLETION_REPORT.md` |
| #325 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_5e_COMPLETION_REPORT.md` | `P19_B6_5e_COMPLETION_REPORT.md` |
| #326 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_5e_SCOPE.md` | `P19_B6_5e_SCOPE.md` |
| #327 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/P19_B6_5e_PHASE_A_STEP4_CHANGE_LIST.md` | `P19_B6_5e_PHASE_A_STEP4_CHANGE_LIST.md` |
| #330 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B7_2a_COMPLETION_REPORT.md` | `P19_B7_2a_COMPLETION_REPORT.md` |
| #332 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_DISCORD_COMPLETION_REPORT.md` | `B_DISCORD_COMPLETION_REPORT.md` |
| #333 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_DISCORD_COMPLETION_REPORT.md` | `B_DISCORD_COMPLETION_REPORT.md` |
| #339 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_CLAUDEMD_SLIM_PRE_AUDIT.md` | `B_CLAUDEMD_SLIM_PRE_AUDIT.md` |
| #346 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_ALERT_PROTOCOL_COMPLETION_REPORT.md` | `B_ALERT_PROTOCOL_COMPLETION_REPORT.md` |
| #376 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_REORG_B2_2_COMPLETION_REPORT.md` | `P19_REORG_B2_2_COMPLETION_REPORT.md` |
| #380 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/reorg-B3.1-B3.2-catalog-issues-FOR-CC-A.md` | `reorg-B3.1-B3.2-catalog-issues-FOR-CC-A.md` |
| #381 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/reorg-B3.1-B3.2-catalog-issues-FOR-CC-A.md` | `reorg-B3.1-B3.2-catalog-issues-FOR-CC-A.md` |
| #388 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_REORG_B4_COMPLETION_REPORT.md` | `P19_REORG_B4_COMPLETION_REPORT.md` |
| #389 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_REORG_B4_COMPLETION_REPORT.md` | `P19_REORG_B4_COMPLETION_REPORT.md` |
| #390 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_REORG_B4_1_COMPLETION_REPORT.md` | `P19_REORG_B4_1_COMPLETION_REPORT.md` |
| #391 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_6_COMPLETION_REPORT.md` | `P19_B6_6_COMPLETION_REPORT.md` |
| #391 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_6_PRE_AUDIT.md` | `P19_B6_6_PRE_AUDIT.md` |
| #391 | `Claude Comms and Packages/Batch Completion/P19_B6_6_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_6_PRE_AUDIT.md` | `P19_B6_6_COMPLETION_REPORT.md` |
| #392 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_6_COMPLETION_REPORT.md` | `P19_B6_6_COMPLETION_REPORT.md` |
| #392 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_6_PRE_AUDIT.md` | `P19_B6_6_PRE_AUDIT.md` |
| #392 | `Claude Comms and Packages/Batch Completion/P19_B6_6_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_6_PRE_AUDIT.md` | `P19_B6_6_COMPLETION_REPORT.md` |
| #396 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #396 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_7_PRE_AUDIT.md` | `P19_B6_7_PRE_AUDIT.md` |
| #396 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `P19_B6_9_PRE_AUDIT.md` |
| #396 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_SCOPE.md` |
| #396 | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_7_PRE_AUDIT.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #396 | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #396 | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #396 | `Claude Comms and Packages/Scope Files/P19_B6_7_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `P19_B6_7_PRE_AUDIT.md` |
| #396 | `Claude Comms and Packages/Scope Files/P19_B6_7_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_7_PRE_AUDIT.md` |
| #396 | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_PRE_AUDIT.md` |
| #397 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_GOV_4_PRE_AUDIT.md` | `B_GOV_4_PRE_AUDIT.md` |
| #398 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #398 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `P19_B6_9_PRE_AUDIT.md` |
| #398 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_SCOPE.md` |
| #398 | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #398 | `Claude Comms and Packages/Batch Completion/P19_B6_9_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_COMPLETION_REPORT.md` |
| #398 | `Claude Comms and Packages/Scope Files/P19_B6_9_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B6_9_SCOPE.md` | `P19_B6_9_PRE_AUDIT.md` |
| #404 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_1_PRE_AUDIT.md` | `P19_B8_1_PRE_AUDIT.md` |
| #410 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_2_PRE_AUDIT.md` | `P19_B8_2_PRE_AUDIT.md` |
| #410 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_2_SCOPE.md` | `P19_B8_2_SCOPE.md` |
| #410 | `Claude Comms and Packages/Scope Files/P19_B8_2_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/P19_B8_2_SCOPE.md` | `P19_B8_2_PRE_AUDIT.md` |
| #412 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B7_2c_COMPLETION_REPORT.md` | `P19_B7_2c_COMPLETION_REPORT.md` |
| #413 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B_RENAME_INVENTORY_CCA.md` | `P19_B_RENAME_INVENTORY_CCA.md` |
| #413 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B_RENAME_INVENTORY_MERGED.md` | `P19_B_RENAME_INVENTORY_MERGED.md` |
| #413 | `Claude Comms and Packages/Scope Files/P19_B_RENAME_INVENTORY_CCA.md` | `Claude Comms and Packages/Scope Files/P19_B_RENAME_INVENTORY_MERGED.md` | `P19_B_RENAME_INVENTORY_CCA.md` |
| #414 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B7_2c_COMPLETION_REPORT.md` | `P19_B7_2c_COMPLETION_REPORT.md` |
| #415 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_3b_COMPLETION_REPORT.md` | `P19_B8_3b_COMPLETION_REPORT.md` |
| #415 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_3b_PRE_AUDIT.md` | `P19_B8_3b_PRE_AUDIT.md` |
| #415 | `Claude Comms and Packages/Batch Completion/P19_B8_3b_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/P19_B8_3b_PRE_AUDIT.md` | `P19_B8_3b_COMPLETION_REPORT.md` |
| #416 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_3b_PRE_AUDIT.md` | `P19_B8_3b_PRE_AUDIT.md` |
| #417 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B8_3b_PRE_AUDIT.md` | `P19_B8_3b_PRE_AUDIT.md` |
| #418 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_3b_COMPLETION_REPORT.md` | `P19_B8_3b_COMPLETION_REPORT.md` |
| #421 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_4c_COMPLETION_REPORT.md` | `P19_B8_4c_COMPLETION_REPORT.md` |
| #422 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_4c_COMPLETION_REPORT.md` | `P19_B8_4c_COMPLETION_REPORT.md` |
| #433 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B7_2c_COMPLETION_REPORT.md` | `P19_B7_2c_COMPLETION_REPORT.md` |
| #438 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_STORAGE_HARDEN_WAVE_D_COMPLETION_REPORT.md` | `B_STORAGE_HARDEN_WAVE_D_COMPLETION_REPORT.md` |
| #439 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_XSTOCK_FRESHNESS_MONITOR_PRE_AUDIT.md` | `B_XSTOCK_FRESHNESS_MONITOR_PRE_AUDIT.md` |
| #447 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_GOV_INTEGRITY_0_PRE_AUDIT.md` | `B_GOV_INTEGRITY_0_PRE_AUDIT.md` |
| #449 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_GOV_INTEGRITY_0_PRE_AUDIT.md` | `B_GOV_INTEGRITY_0_PRE_AUDIT.md` |
| #490 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_GOV_INTEGRITY_0_PRE_AUDIT.md` | `B_GOV_INTEGRITY_0_PRE_AUDIT.md` |
| #497 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_GOV_ORPHAN_CLASS_SCOPE.md` | `B_GOV_ORPHAN_CLASS_SCOPE.md` |
| #500 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B8_5b_COMPLETION_REPORT.md` | `P19_B8_5b_COMPLETION_REPORT.md` |
| #501 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/P19_B8_5b_STEP4_PACKET.md` | `P19_B8_5b_STEP4_PACKET.md` |
| #512 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_STAGING_LIVENESS_WATCH_SCOPE.md` | `B_STAGING_LIVENESS_WATCH_SCOPE.md` |
| #520 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_STAGING_LIVENESS_WATCH_SCOPE.md` | `B_STAGING_LIVENESS_WATCH_SCOPE.md` |
| #524 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` | `P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` |
| #525 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` | `P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` |
| #526 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` | `P19_B8_7_STEP9_DEFINITIVE_PUSH_SET.md` |
| #527 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Langston Design Asks/P19_B8_7_STEP9_STEP4_SUPPLEMENT.md` | `P19_B8_7_STEP9_STEP4_SUPPLEMENT.md` |
| #532 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/CURRENT_RUNNING_ISSUES.md` | `CURRENT_RUNNING_ISSUES.md` |
| #534 | `1-system-manual/RUNNING_ISSUES.md` | `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` | `CLAUDE_MD_RULE_HISTORY.md` |
| #542 | `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` | `1-system-manual/RUNNING_ISSUES.md` | `CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` |
| #542 | `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` | `Claude Comms and Packages/Scope Files/B_SPIKE_PER_SESSION_INDEX_REPORT.md` | `CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` |
| #542 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_SPIKE_PER_SESSION_INDEX_REPORT.md` | `B_SPIKE_PER_SESSION_INDEX_REPORT.md` |
| #548 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md` | `ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md` |
| #550 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md` | `ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md` |
| #559 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_XSTOCK_FEED_SANITY_SCOPE.md` | `B_XSTOCK_FEED_SANITY_SCOPE.md` |
| #564 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RULES_1A_PRE_AUDIT.md` | `B_RULES_1A_PRE_AUDIT.md` |
| #579 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_TSC_BASELINE_FIX_COMPLETION_REPORT.md` | `B_TSC_BASELINE_FIX_COMPLETION_REPORT.md` |
| #594 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_ARM_REMOVAL_COMPLETION_REPORT.md` | `B_ARM_REMOVAL_COMPLETION_REPORT.md` |
| #594 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_XSTOCK_FEED_SANITY_SCOPE.md` | `B_XSTOCK_FEED_SANITY_SCOPE.md` |
| #594 | `Claude Comms and Packages/Batch Completion/B_ARM_REMOVAL_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/B_XSTOCK_FEED_SANITY_SCOPE.md` | `B_ARM_REMOVAL_COMPLETION_REPORT.md` |
| #618 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_COST_MATH_CONSOLIDATION_COMPLETION_REPORT.md` | `B_COST_MATH_CONSOLIDATION_COMPLETION_REPORT.md` |
| #625 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_GOV_DEADLINE_WINDOW_SYMMETRY_COMPLETION_REPORT.md` | `B_GOV_DEADLINE_WINDOW_SYMMETRY_COMPLETION_REPORT.md` |
| #636 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_XSTOCK_FEED_SANITY_SCOPE.md` | `B_XSTOCK_FEED_SANITY_SCOPE.md` |
| #642 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_GOV_HEARTBEAT_REPAIR_COMPLETION_REPORT.md` | `B_GOV_HEARTBEAT_REPAIR_COMPLETION_REPORT.md` |
| #659 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md` | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` |
| #669 | `.claude/memory/MEMORY_CC_B.md` | `Claude Comms and Packages/Batch Completion/B_FILTER_DIAG_STANDARDIZE_COMPLETION_REPORT.md` | `B_FILTER_DIAG_STANDARDIZE_COMPLETION_REPORT.md` |
| #669 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_FILTER_DIAG_STANDARDIZE_COMPLETION_REPORT.md` | `B_FILTER_DIAG_STANDARDIZE_COMPLETION_REPORT.md` |
| #676 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_TEC_REGIME_PARAM_REMOVAL_COMPLETION_REPORT.md` | `B_TEC_REGIME_PARAM_REMOVAL_COMPLETION_REPORT.md` |
| #685 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/P19_B_PERPFEED_PRE_AUDIT.md` | `P19_B_PERPFEED_PRE_AUDIT.md` |
| #690 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B_PERPFEED_COMPLETION_REPORT.md` | `P19_B_PERPFEED_COMPLETION_REPORT.md` |
| #691 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B_PERPFEED_COMPLETION_REPORT.md` | `P19_B_PERPFEED_COMPLETION_REPORT.md` |
| #700 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_CONDUCT_FILE_COMPLETION_REPORT.md` | `B_CONDUCT_FILE_COMPLETION_REPORT.md` |
| #704 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/P19_B_PERPFEED_COMPLETION_REPORT.md` | `P19_B_PERPFEED_COMPLETION_REPORT.md` |
| #732 | `1-system-manual/MISTAKE_PATTERNS.md` | `Claude Comms and Packages/Batch Completion/B_MISTAKES_FILE_COMPLETION_REPORT.md` | `B_MISTAKES_FILE_COMPLETION_REPORT.md` |
| #732 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_MISTAKES_FILE_COMPLETION_REPORT.md` | `B_MISTAKES_FILE_COMPLETION_REPORT.md` |
| #739 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_RULES_1C_1D_COMPLETION_REPORT.md` | `B_RULES_1C_1D_COMPLETION_REPORT.md` |
| #739 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1E_SCOPE.md` |
| #739 | `Claude Comms and Packages/Batch Completion/B_RULES_1C_1D_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1C_1D_COMPLETION_REPORT.md` |
| #740 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_PRE_AUDIT.md` | `B_RULES_1E_PRE_AUDIT.md` |
| #740 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1E_SCOPE.md` |
| #740 | `Claude Comms and Packages/Scope Files/B_RULES_1E_PRE_AUDIT.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1E_PRE_AUDIT.md` |
| #741 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Batch Completion/B_RULES_1C_1D_COMPLETION_REPORT.md` | `B_RULES_1C_1D_COMPLETION_REPORT.md` |
| #741 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1E_SCOPE.md` |
| #741 | `Claude Comms and Packages/Batch Completion/B_RULES_1C_1D_COMPLETION_REPORT.md` | `Claude Comms and Packages/Scope Files/B_RULES_1E_SCOPE.md` | `B_RULES_1C_1D_COMPLETION_REPORT.md` |
| #753 | `1-system-manual/RUNNING_ISSUES.md` | `1-system-manual/_evidence/753_provenance_capture_2026-08-28.md` | `753_provenance_capture_2026-08-28.md` |
| #906 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_SCANNER_EGRESS_NORMALISE_SCOPE.md` | `B_SCANNER_EGRESS_NORMALISE_SCOPE.md` |
| #914 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_EXIT_TRANSACTABLE_SIDE_2_SCOPE.md` | `B_EXIT_TRANSACTABLE_SIDE_2_SCOPE.md` |
| #921 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_PRE_AUDIT.md` | `B_TOKEN_WATCH_PRE_AUDIT.md` |
| #966 | `1-system-manual/RUNNING_ISSUES.md` | `Claude Comms and Packages/Change Lists/B_SCANNER_EGRESS_NORMALISE_CHANGE_LIST.md` | `B_SCANNER_EGRESS_NORMALISE_CHANGE_LIST.md` |
