# B-TEC-REGIME-PARAM-REMOVAL — STEP-2 PRE-AUDIT r2

> ⛔⛔ **r1→r2: LANGSTON FOUND A DEFECT IN THE CENSUS — THE ONE THING §4 DECLARES IS THE ENTIRE EVIDENCE BASE. THREE WRITERS, NOT ONE.**

**Owner:** CC-A · 2026-08-07 · Scope r4 @ `2c4ce640d` (Step-1 CLEARED). Read at `origin/migration/aws-supabase`, not the worktree.

> ⛔⛔ **THIS PRE-AUDIT CORRECTED A LIVE FINDING I HAD ALREADY ANNOUNCED TWICE AND THAT ANOTHER SESSION HAD ALREADY ACTED ON. It is not a formality — see §2.**

---

## 1. SIM CONSULTATION (§2 step 2, mandatory) — WHAT IT SAID AND WHAT IT LACKED
**Read:** `SYSTEM_IMPACT_MAP.md` B65.4 ladder-trailing entry (`:1531`) + the B79.TEC config-cache subsystem (`:1139`) + the `trailing-exit-controller` engagement note (`:1488`).
✅ **What it gave me that the scope did not have:**
- **`TrailingState` carries `ladderRung` / `currentRungTarget` / `currentRungFloor`**, and `updatePosition()` ratchets **BOTH** stop and target on each rung event.
- ⭐ **`importStates()` migrates pre-B65.4 states: `targetLatched=true` → `ladderRung=1`.** ⇒ **the `Math.max(1,0)` coercion that softens this defect is a BACKWARD-COMPATIBILITY MIGRATION for a different era, being exercised every time the seed fires.** *(It is not a safety clamp designed for this case; it just happens to catch it.)*
⚠️ **SIM GAP, flagged per §9 rule 1:** the SIM documents the TEC's state **shape** but **not its PERSISTENCE** — nothing in it says trailing state is written to a file and restored at boot. **That absence is why the scope missed it.** ⇒ **governance obligation for Step-10: the SIM gets the persistence + its `/tmp` location recorded** (currently discoverable only by reading `trade-safety.ts`).

## 2. ⛔⛔ THE FINDING THAT CHANGED #677 — TRIGGER IS **STATE LOSS**, NOT **RESTART**
**Chain:** `trade-safety.ts:891` `TRAILING_STATE_FILE = '/tmp/trailing-states.json'` → `loadTrailingStates()` → `importStates()` (`trailing-exit-controller.ts:1632`) at boot.
**MEASURED on staging (POPULATION, not sample): 279 persisted states; ALL 279 carry `tradeId` ⇒ ZERO dropped by the B80 legacy-drop path. By `callerMode`: vts 277, paper 2.** ⭐ **The file survived BOTH of today's restarts (279 restored at 11:47 and 11:52) ⇒ A PM2 RESTART DOES NOT LOSE STATE.**
⭐⭐ **AND THE FALLBACK IS CORRECT FOR A STATELESS POSITION — STRUCTURALLY, NOT BY LUCK: ratcheting REQUIRES trailing state ⇒ no state ⇒ no ratchet ⇒ `stopLoss` genuinely IS the original stop at that instant.** Verified on both paper states: `ladderRung 0`, `targetLatched false`, `originalStopPrice` matching live `stop_loss` **to the digit** (AVAX `6.3299`, ONDO `0.34405343`).
⇒ **#677's exposure requires: HAS state **AND** HAS ratcheted **AND THEN** loses state.**
⛔ **THE AMPLIFIER, arguably the higher-severity half and currently NOBODY'S: `/tmp` is EPHEMERAL.** A reboot / `tmpfiles` sweep drops **all 279 at once**, and the seed is the DESIGNED recovery for exactly that — **which cannot recover 2 of its 3 fields.** **Precedent: this codebase has already moved another persist path off `/tmp` for this reason** ⇒ known-bad pattern, not a novel observation.

## 3. §9.5(a) CENSUS AT THE HOP — `context.regime` INTO `evaluateTECExit`
| census question | answer (repo-wide, tests excluded, **table/type-scoped**) |
|---|---|
| who **writes** it | ⛔⛔ **THREE, NOT ONE (r1 SAID ONE — CORRECTED).** Enumerated from the FUNCTION’S CALL SITES (the only correct shape — see below): `evaluateTECExit(` has **exactly three callers repo-wide**: `active-execution-engine.ts:1545` (context writes `regime` at **`:1561`** — THE ONE THIS BATCH REMOVES) · `vts-runner.ts:3027` (writes at **`:3042`**) · `vts-runner.ts:3808` (writes at **`:3822`**). **The two VTS writers pass REAL values (`trade.regime`) and are UNTOUCHED by this batch.** |
| who **reads** it | **exactly THREE**, all in `tec-evaluator.ts`: `:314` (→ **`isMoonbagQualifier`**), `:321` (→ **`canEnterMoonbag`**, the slot/concurrency gate) — ⚠ *labels were TRANSPOSED in r1; members unchanged*, `:337` (→ `PositionUpdate.regime`) |
| who **mutates** | none — it is passed by value, never reassigned |
| who **DELETES** | none |
| who **schedules** against it | none — it is a per-call argument, not stored state |

⛔⛔ **WHY r1 MISSED THEM, AND IT IS A METHOD ERROR WORTH MORE THAN THE FIX: I USED THE *READER* GREP SHAPE TO FIND *WRITERS*.** A key inside an object literal (`regime: trade.regime`) **does not contain the string `context.regime`** — which is the same reason my own `:1561` does not either. ★★ **THE CORRECT SHAPES ARE DIFFERENT AND MUST BOTH BE RUN: for a parameter’s WRITERS, ENUMERATE THE CALL SITES OF THE FUNCTION; for its READERS, grep the property access.** *(A `regime: trade.regime` grep alone would ALSO have misled — it returns SEVEN hits in `vts-runner.ts`, of which only TWO are on this hop; the other five are unrelated literals. **Neither grep is the census. The call-site enumeration is.**)* ⚠ **The #602 homing pre-warned exactly this: *"crosses VTS callers — caller-tracing alone will not cover it."***

✅ **THE DIFF’S BEHAVIOUR-NEUTRALITY SURVIVES (Langston re-derived independently): removal touches ONLY the active-path literal; absent≡undefined holds; the VTS writers are untouched.**
⛔ **BUT THE RECORD DOES NOT, AND THAT IS THE REAL CORRECTION — THE BATCH IS REFRAMED: I AM REMOVING *A* DEAD WRITER, NOT *THE* WRITER.** *"Exactly one writer, removed"* would invite a future reader to delete `regime?: string` and the three reads as fully dead — **while VTS still passes real values into that void.** ⇒ **the §6(c) close-restatement inherits this wording: three writers; this batch removes one; two VTS writers remain, discarded at all landings per the #602 refutation.**

⭐ **THE DECIDING CHECK (absent-vs-undefined), because removing a KEY is not identical to leaving it `undefined` in general:** all three consumers use **plain property access**. **`grep` for `'regime' in`, `hasOwnProperty('regime')`, `in input.context` → ZERO hits.** ⇒ **no consumer discriminates an ABSENT key from an `undefined` value** ⇒ **removal is behaviour-identical at all three sites.**

## 4. ⚠️ HONEST CORRECTION TO A VERIFICATION CONDITION LANGSTON SET
He wrote: *"if `evaluateTECExit`'s context type REQUIRES `regime`, tsc fails closed, which is the correct direction."*
⛔ **IT DOES NOT REQUIRE IT — `tec-evaluator.ts:100` declares `regime?: string` (OPTIONAL).** ⇒ **`tsc` will stay GREEN through this removal. THERE IS NO COMPILE-TIME BACKSTOP HERE.**
⇒ **Stated plainly so his condition is not read as protection it does not provide: the entire evidence for behaviour-neutrality rests on §3's census, not on the compiler.** *(This is the batch's own §9.5(a-ii) lesson turned on itself — "green tsc" proves nothing about a read the type system was never asked to check.)*

## 5. BLAST RADIUS
**Code:** one key deleted from one object literal; three downstream reads that already receive `undefined`. **No schema, no migration, no route, no UI, no persisted contract.**
⛔ **NOT TOUCHED, DELIBERATELY: the two `??` reads (`ladderRungsHit`, `originalStopPrice`) STAY — disposition (3) RECONNECT-pending-Kyle.** Deleting them is behaviour-neutral **and would erase the reconnect site**.
**Docs:** the FIVE `paper-execution-engine` sites in `SYSTEM_MANUAL.md` (`:11099` `:11150` `:11480` `:11518` `:11555`), each with a **live-code-reference vs dated-historical-statement** judgement — **renaming a historical statement would falsify the record**. Riders: `:11518`'s second staleness (the dormancy clause) ruled in the same touch; `:11150`'s `~L2165` coordinate re-derived or dropped; `:11555`'s regex anchored to the FILENAME, never the `paper` prefix (`paper_sim` is KEEP-AS-DATA, #405).

## 6. VERIFICATION (carried from scope r4 §5, with §4's correction applied)
`tsc` + **FULL** suite green (green tsc is necessary, **not evidential**, per §4) · staging measurement **REFUSED, not waived** (`undefined`→`undefined` has no observable delta; a "no change" result would fail 29(b) leg-1) · the §3 census restated at close with each list's members · the five doc sites each with their recorded disposition · §9.3 UI check **N/A, justified** (no user-facing surface) · **SIM updated with the TEC state-persistence gap found in §1.**

## 7. WHAT THIS PRE-AUDIT DID NOT ESTABLISH
Whether `/tmp` has ever actually been cleared on this host (would bound #677's realised cost — **not measured, and I will not infer it from uptime**) · whether any consumer of `PositionUpdate.regime` behaves differently on `undefined` vs a value (**irrelevant to THIS removal** — it already receives `undefined` — but load-bearing for the #677 wire-up, so it is the wire's pre-audit question, not this one's).
