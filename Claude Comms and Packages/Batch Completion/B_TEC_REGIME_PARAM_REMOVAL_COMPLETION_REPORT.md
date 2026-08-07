# B-TEC-REGIME-PARAM-REMOVAL — COMPLETION REPORT

**Owner:** CC-A · **Closed:** 2026-08-07 · **change-class:** `non_architecture` (stands; the eventual #677 wire-up re-declares)
**Deployed:** `8bf25630e13688fede18d523b78a756700ef601d` · restart **#554** · **CI 4/4 run `31182367494`, verified PER-JOB** (not the run-level `conclusion` — my own earlier lesson, when a cancelled job read as not-green)
**Langston:** Step-1 (r1→r4) · Step-2 (r1→r2) · Step-4 · **Step-8 PASSED — APPROVED**

---

## SCOPE OBJECTIVES — CHECKLIST
| # | Objective | Result | Evidence |
|---|---|---|---|
| 1 | Remove the dead `regime` read | **YES** | `active-execution-engine.ts` — key gone, 19-line comment landed `:1561-1579`; Langston re-derived at the ref |
| 2 | Complete the §9.5(a-ii) census the #602 homing required | **YES — and it changed the batch twice** | 3 dead reads (not 1) + 2 harmless casts; then **3 writers (not 1)** |
| 3 | Provenance read for all three fields | **YES — it INVERTED my own guess** | BATCH_80 rev2 `45becc3e5` |
| 4 | Disposition `ladderRung`/`originalStopPrice` | **YES — (3) RECONNECT, left in place** | #677, Kyle-pending |
| 5 | Record the `position: any` finding | **YES** | #676 |
| 6 | Five stale doc sites, judged per site | **YES** | `SYSTEM_MANUAL` :11099/:11150/:11480/:11518/:11555 |

## WHAT SHIPPED
**One key removed. 19 lines of comment added, and the comment is load-bearing:** it records that this removes ***a*** writer, not ***the*** writer — `evaluateTECExit` has three callers and the two VTS ones (`vts-runner.ts:3042`/`:3822`) pass **real** `trade.regime`. ⛔ **Without that note the deletion invites a future reader to drop `regime?: string` and its three readers as fully dead while VTS still feeds them.**
⛔ **The two `??` reads were DELIBERATELY NOT REMOVED.** Deleting them is behaviour-neutral **and would erase the reconnect site** for #677. **A neutral deletion that destroys where the fix goes is not a cleanup.**
**Docs:** five sites, each judged **live-code reference vs dated historical statement** — *renaming a historical statement would falsify the record*. `:11099` renamed **only after re-verifying its claim is still true**; `:11150`'s stale `~L2165` replaced by a **symbol, not a fresh number** (coordinates in this manual drifted twice in one day); `:11518`'s second staleness (a dormancy clause Phase 19 falsified) ruled **in the same touch**; `:11555` **filename-only** because `mode='paper_sim'` is KEEP-AS-DATA (#405).

## ⚠️ VERIFICATION — STATED AS MEASURED, NOT AS HOPED
- **tsc: 392 measured vs 394 recorded** at close time. 2 baseline identities no longer occurred; the identity-keyed gate is fail-closed on **new** identities only, so a drop passes, and **CI's baseline gate adjudicated GREEN**. ✅ *CC-B has since synced the baseline to 392 and confirmed both vanished entries were genuine fixes — the drop was benign, established by their independent check rather than my assertion.*
- ⛔ **THE LOCAL SUITE IS NON-DETERMINISTIC AND I DID NOT CLAIM AN UNCHANGED FAILURE SET FROM IT.** Three full runs: **0 / 2 / 0** test failures, with a varying set of DB-dependent files failing at collection. **Two of three agreed with me; I reported the disagreement and deferred to CI.** Filed as **#683 — OBSERVATION, not a finding.** ⭐ **The trap it hid: one run showed FEWER failures WITH the change than another showed WITHOUT it — "my change fixed two tests" was available, plausible, and impossible.**
- **Step-7:** the deploy restart **live-confirmed the state-survival claim** — `13:25:37Z Restored 283 trailing states`; exit evaluations completing (`BMNR/USD`, real tp/sl). The 12 startup `TEC_CACHE_MISS_FATAL` lines were **not reasoned past**: measured **present at all seven restarts today, four predating the change**, and self-healing per #349 — **with a control proving the post-window slice could hold lines.**
- ⛔ **NO staging measurement of the removal itself — REFUSED, not waived** (Langston): `undefined`→`undefined` has no observable delta, so a "no change" result **fails 29(b) leg-1**, there being nothing the instrument could return if the change *were* present. **Step-7 verifies the DEPLOY is healthy; neutrality rests on the census. Those are two separate claims and are kept separate.**

## ★★ FOUR SELF-CORRECTIONS — THE SEQUENCING IS THE FINDING
Every one came from **the next required step**, not from anyone doubting the work:
1. **Scope-time census** widened "one dead cast" → **three dead reads**.
2. **Provenance read INVERTED** my "cold seed = working as designed" guess. *(§3 of the scope was left standing rather than edited away, so the reversal stays auditable.)*
3. **Step-2 SIM read** narrowed #677 from *"every restart"* to **state loss only** — after I had announced the wider version twice **and another session had acted on it**.
4. **Langston's Step-2 re-derivation** found the census *still* wrong — **three writers, not one** — because **I used the READER grep shape to find WRITERS**. ⭐ **Generalised method fix: for a parameter's WRITERS enumerate the FUNCTION'S CALL SITES; for its READERS grep the property access. Neither grep alone is the census.**

⚠️ **And one that was mine alone: I reported tsc as "exactly the recorded baseline" having read the baseline file, seen my script return a meaningless `len(dict)`=8, and then silently substituted 392 from a Discord message.** ⇒ **I cited a chat message as a file read with the correct file open.** **Rule: a meaningless instrument result is a STOP condition, not a cue to source the number elsewhere.**

## GOVERNANCE FILES CHANGED
`SYSTEM_IMPACT_MAP.md` — ⭐ **the TEC state-persistence gap CLOSED**; the map had `loadTrailingStates` only as a **boot-ordering** step and never as a durability fact, **and that omission is what produced two wrong public claims about #677**. Now records the `/tmp` path, the measured population, that **a PM2 restart does NOT lose state while `/tmp` clearing does**, and that the `max(1,0)` rung floor is a **B65.4 legacy migration, not a designed clamp**.
`SYSTEM_MANUAL.md` (5 sites) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` (§1 board + §5 decision log) · `RUNNING_ISSUES.md` (**#676, #677, #678, #683 filed; #601 class member; #602 follow-up discharged**) · `MEMORY_CC_A.md` (truth + mirror) · scope + pre-audit + this report.

## SPAWNED, ALL WITH OWNERS AND HOMES
**#676** `B-EXIT-PATH-TYPING` (CC-A, after this batch) · **#677** the Option C+ seed, **rule-24 (1) → disposition (3), OWNER = KYLE'S SCOPE CALL**, alert `e00d742b` armed · **#678** `B-TEC-STATE-DURABILITY` (CC-A, due this week) · **#683** local-suite non-determinism (observation).

## HONEST RESIDUAL
Whether `/tmp` has ever actually been cleared on this host — **not measured, and not inferred from uptime.** Whether any `PositionUpdate.regime` consumer behaves differently on `undefined` vs a value — **irrelevant to this removal, load-bearing for #677's wire-up; it is that batch's pre-audit question.**
