# B-NEW-50 SCOPE — node-cron next-fire readout fix (RUNNING_ISSUES #165)

**Batch ID:** B-NEW-50
**RI:** #165 (node-cron 4.2.1 `getNextRun()` wrong next-date for day-of-week schedules)
**Author:** Claude Code · 2026-05-31
**Active trading:** OFF throughout (Phase 19 unchanged; zero capital risk)
**Mirror:** all code edits in `C:\dev\DawnTraderV3` only; governance authored in GDrive clone.

---

## 0. PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

- **PREVIOUSLY STATED:** #165 is a "node-cron 4.2.1 **Friday-NY-tz** `getNextRun()` bug" with an **open question** whether actual firing also breaks.
- **NOW:** The bug is **broader** — it affects **every day-of-week schedule whose next occurrence is ≥ ~2 days out, in BOTH `America/New_York` AND `UTC`** (not Friday-specific, not tz-specific). AND the critical unknown is **RESOLVED**: the bug is **introspection-only** — the actual cron **firing is proven correct and self-correcting**. REASON: isolated repro + node-cron source read + live fire test (evidence in §2–§3).

---

## 1. Root cause (empirically proven)

node-cron 4.2.1 computes the next run via `TimeMatcher.getNextMatch()` → `MatcherWalker.matchNext()` (`node_modules/node-cron/dist/cjs/time/matcher-walker.js`). After `findNextDateIgnoringWeekday()` picks a candidate slot, the weekday-reconciliation loop (lines 84–89) advances by a **whole YEAR per iteration** (`date.set('year', year + 1)`) until that calendar slot lands on the target weekday — instead of advancing by a day. So any day-of-week schedule whose next hit is ≥ ~2 days out skips every valid near date and explodes to the next **January-1st that falls on that weekday** (Fri→2027-01-01, Sat→2028-01-01, Tue→2030-01-01, …).

**Day-of-week sweep (isolated repro, base = Sun 2026-05-31 18:47 ET):**

| dow | NY tz next_fire | UTC tz next_fire | correct? |
|---|---|---|---|
| 0 Sun | 2026-06-01 ✅ (imminent) | 2034-01-01 ❌ | mixed |
| 1 Mon | 2026-06-02 ✅ (imminent) | 2026-06-01 ✅ | ok |
| 2 Tue | **2030-01-02** ❌ | **2030-01-01** ❌ | broken |
| 3 Wed | **2031-01-02** ❌ | **2031-01-01** ❌ | broken |
| 4 Thu | **2032-01-02** ❌ | **2032-01-01** ❌ | broken |
| 5 Fri | **2027-01-02** ❌ | **2027-01-01** ❌ | broken |
| 6 Sat | **2028-01-02** ❌ | **2028-01-01** ❌ | broken |

The smoke test only flagged `weekend_shutdown` (Fri) and not `weekend_restart` (Sun) because **today is Sunday** — the Sunday timer's next fire is imminent (within ~1 day), which the walker happens to compute correctly.

---

## 2. Critical-unknown resolution — FIRING IS SAFE

The fire path and the next-fire-readout path are **independent code**:

- **Fire trigger** = `Runner.heartBeat()` → `checkAndRun()` → fires **only if `TimeMatcher.match(now) === true`** (`runner.js:92`). `match()` (`time-matcher.js:23-33`) is a pure "do *now*'s localized parts match the expression sets?" predicate — it **never touches** the buggy walker.
- **Next-fire readout** (`getNextRun()`/`getNextMatch()`) is used ONLY to size the heartbeat delay, and `getDelay()` **hard-caps that delay at 24h** (`runner.js:178`). So a garbage 2027 value just means "re-check in ≤24h"; as the real fire-time enters the ~24h window the computation self-corrects and the heartbeat locks onto the exact minute.

**Empirical proof (`scratch/ri165-confirm.cjs`):**
- `match(Fri 8PM ET) = true`; `match(Thu 8PM ET) = false`; `match(Fri 7PM ET) = false` → fire predicate correct.
- `getNextMatch(from Wed) = 2027-01-02` → readout broken (same TimeMatcher instance).
- **LIVE**: a 6-field day-of-week-constrained schedule (`18 51 18 * * 0`, Sun, NY tz) **fired at exactly the scheduled second**.

This is why both weekend timers fired historically (audit rows `weekend_shutdown` 2026-05-23, `weekend_restart` 2026-05-25), and confirms the **Fri 2026-05-29 non-fire was the 30-hour staging outage** (process down → no heartbeat), NOT this bug.

---

## 3. Blast radius (the ONLY consumers of the broken readout)

Two production call sites, both `job.task.getNextRun()`:
1. `server/services/cron-arm-logger.ts:40` — emits `[CRON-REGISTRATION] … next_fire=…` log.
2. `server/services/cron-arm-smoke-test.ts:68` — Mode-A arming check; classifies `TOO_FAR_FUTURE` → writes false `breakage` system-alerts.

NOT affected: `cron-fire-evidence-verifier.ts` (Mode-B) reads DB audit rows + `intervalSeconds`, never `getNextRun()`. `session-lifecycle-controller.ts` only calls `logCronArm()` (fixed centrally). Grep confirms **no other production `getNextRun()` caller**.

Functional impact of the bug today: **zero** on trading/weekend behavior; the only effect is **false TOO_FAR_FUTURE alerts** from the B-NEW-49 smoke test on day-of-week schedules (currently the 2 weekend timers).

---

## 4. Remediation decision — SHIM (not pin, not replace)

Use **`cron-parser`** (already in `node_modules` @ 4.9.0; **promote to a direct dependency**) to compute the next fire for the two readout sites. Leave node-cron doing the actual scheduling/firing (empirically correct). `cron-parser` validated correct + timezone-aware for all our schedules (`scratch/ri165-cronparser.cjs`): Fri→2026-06-06, Sun→2026-06-01, Tue→2026-06-03, Thu→2026-06-05.

**Alternatives considered + rejected:**
- **Pin/downgrade node-cron** — node-cron's next-date math is historically fragile (gh issues #40, #433, …); no confirmed fixed version; 3.x lacks the `getNextRun` API entirely. Rejected.
- **Replace node-cron** — huge blast radius (8 schedule sites) for an introspection-only bug while firing works. Violates surgical/NO-PATCHES proportionality. Rejected.

**Why shim is NO-PATCHES-compliant (CLAUDE.md §5 #15):** it is the structural root-cause fix for *our* problem — our observability layer was trusting a known-broken upstream readout. We stop trusting it and compute correctly. We don't paper over it (we document the upstream bug + lock it with a regression test) and we don't rip out a working scheduler. Sustainable + scalable for all future day-of-week schedules.

---

## 5. Numbered objectives + verification criteria

1. **New helper `server/services/cron-next-fire.ts`** — `computeNextFire(expression, timezone, from?) : Date | null`, backed by `cron-parser`; failure-safe (returns null + logs on parse error). **Verify:** unit tests green.
2. **Promote `cron-parser` to a direct dependency** in `package.json` (pinned to the installed 4.9.0 line) + confirm types resolve under `tsc`. **Verify:** `npx tsc --noEmit` clean; `npm ls cron-parser` shows direct.
3. **`cron-arm-logger.ts`** — replace `job.task.getNextRun()` with `computeNextFire(job.expression, job.timezone)`. (OPEN Q-1 below re: also logging node-cron's raw value.) **Verify:** `[CRON-REGISTRATION]` log shows correct Friday/Sunday next_fire on staging boot.
4. **`cron-arm-smoke-test.ts`** — base classification + alert on `computeNextFire(...)`. **Verify:** boot + boot+5min smoke runs report `status=OK` for both weekend timers; **zero** new TOO_FAR_FUTURE alerts.
5. **Regression-lock test** — assert `computeNextFire('0 20 * * 5','America/New_York', <a Wednesday>)` returns the imminent Friday (year 2026), NOT 2027; cover Tue/Thu and UTC too. **Verify:** test green; would fail against the old `getNextRun()`.
6. **Clear the stale false alerts** — ack the 4 active `weekend_shutdown` TOO_FAR_FUTURE alerts (`44a7fc65`, `0f366c74`, `bcd99bb0`, `8dae4c1f`) post-deploy with reason citing B-NEW-50. **Verify:** §10.5 check shows them acknowledged; no new ones generated.
7. **CI all-4-green** on head commit; **staging deploy**; **governance** (BATCH_CATALOG, PHASE_HISTORY, SIM §9.10.c update, CHANGES_AND_FIXES, RUNNING_ISSUES #165 CLOSED, ASSET_CLASS_ONBOARDING_WORKFLOW learning, MEMORY 3-way) + completion report.

---

## 6. OPEN QUESTIONS FOR LANGSTON (Step-1 ACK)

- **Q-1:** In the `[CRON-REGISTRATION]` log line + smoke-test diagnostics, should we ALSO log node-cron's raw `task.getNextRun()` value tagged `raw_nodecron_next=… [UNTRUSTED]` (cheap drift-detector for if/when upstream fixes it), while basing ALL classification/alerts purely on `cron-parser`? **CC lean: YES** — keep the raw value in the log only, never alert on it.
- **Q-2:** Any objection to the shim-over-pin/replace decision in §4? (CC lean: shim is the proportionate root-cause fix.)
- **Q-3:** Deploy gating — CC is holding deploy until the Sun 2026-06-01 00:00 UTC weekend resume is verified clean. Concur?

---

## 7. Deploy gate

Implementation may proceed in parallel; **staging deploy is GATED** on confirming the Sunday resume (244 `weekend_suspended` xStock trades → open) at/after 2026-06-01 00:00 UTC. Resume is triple-protected (weekend_restart cron + B-NEW-36 poll-reconcile + boot-reconcile) and independent of this fix.
