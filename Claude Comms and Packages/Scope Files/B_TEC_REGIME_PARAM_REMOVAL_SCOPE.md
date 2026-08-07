# B-TEC-REGIME-PARAM-REMOVAL — SCOPE r1

change-class: non_architecture
**Owner:** CC-A · 2026-08-07 · **Homed by B-OUTCOME-FEEDBACK-WIRE (#602) Step-4**: *"exactly ONE survivor remains in the file — `:1561`, ruled disposition **(4) REMOVE**, owner CC-A with the §9.5(a-ii) state-write census."*

> ⛔⛔ **THE SCOPE-STAGE READ CHANGED THE BATCH: IT IS NOT ONE DEAD READ, IT IS THREE — AT THE SAME CALL SITE.** The #602 homing counted `as any` **casts to a field the schema lacks**; it did not enumerate the other reads in the same object literal. **Nothing was wrong in #602 — its fence pinned what it measured. This is what the census it required actually returns.**

---

## 1. THE SITE (read at `origin/migration/aws-supabase`, not the worktree)
`server/services/active-execution-engine.ts`, inside `checkExitConditions` → the `evaluateTECExit({...})` call (`:1545`+):
- `:1561` — `regime: (position as any).regime` → into `context.regime`, **NO fallback**
- `:1540` — `ladderRung: (position as any).ladderRungsHit ?? 0`
- `:1541-42` — `originalStopPrice: (position as any).originalStopPrice ?? (stopLoss ?? undefined)`
*(`tradeMode` and `sourcePool` are also cast but are **REAL COLUMNS** — see §2; they are redundant casts, **not** dead reads, and are OUT of scope.)*

## 2. ⛔ THE MEASUREMENT — WHY ALL THREE CANNOT ARRIVE (chain closed, control stated)
1. **Column enumeration of `activeOpenPositions` (`shared/schema.ts`), whole block, WITH A CONTROL:** the same extraction returns **39 columns** including `symbol`/`assetClass`/`tradeMode`/`sourcePool` — **so the instrument demonstrably works.** `regime`, `ladderRungsHit`, `originalStopPrice` are **absent**; `sourcePool` IS present (`:70`, `varchar("source_pool")`).
2. **`storage.getActiveOpenPositions(mode): Promise<ActiveOpenPosition[]>`** (`server/storage.ts:3423`) — returns the **row type**.
3. **`ActiveOpenPosition = typeof activeOpenPositions.$inferSelect`** (`shared/schema.ts:2855`, established by #602) ⇒ **the runtime object IS the row.**
4. **No augmentation between fetch and use:** `:1021` fetch → `:1054` `for (const position of openPositions)` → `:1307` call. The only `.map` in that block builds a **symbol list** (`.map(p => p.symbol)`), it does not rewrite positions. *(Contrast `:758-761`, a DIFFERENT path that DOES augment — which is exactly why this had to be traced per-path rather than assumed.)*
⇒ **all three reads resolve to `undefined` on every active exit check.**

⚠️ **AND NOTHING COULD EVER HAVE CAUGHT IT: the parameter is declared `position: any` (`:1474`+).** So TypeScript provides **zero** protection at this entire call site, and the `as any` casts are casts **on an already-`any` value** — cosmetically redundant *and* silencing nothing. **This is why "zero callers" / green `tsc` / green CI all pass over it** (§9.5(a-ii)'s exact point, one layer out: not a removed writer with a surviving reader, but a **reader with a writer that never existed**).

## 3. ⛔ RULE 24 — I AM **NOT** DECLARING THESE DEFECTS. THE DISPOSITIONS DIFFER PER FIELD, AND TWO ARE GENUINELY OPEN.
- **`regime` → disposition (4) REMOVE, already ruled by Langston at #602 Step-4.** No fallback ⇒ `context.regime` is `undefined` today and would remain `undefined` after removal ⇒ **byte-identical behaviour. This is the safe leg.**
- **`ladderRung` and `originalStopPrice` → NOT YET DISPOSITIONED, and they are the interesting half.** Both take a **`??` fallback**, so today they are *always* the default (`0`, and `stopLoss`). **Removing the dead read changes NOTHING at runtime; but the question rule 24 demands is whether the DEFAULT is the intended behaviour or a silent degradation.** ★ **CONTEXT THAT CUTS TOWARD "INTENDED": the whole `tecSeedPE` object is built ONLY when `getTrailingState(position.id)` returns nothing — i.e. a COLD-START SEED on the first cycle after a restart.** A cold seed legitimately has no ladder history. **⇒ plausible outcome (2) working-as-designed, but I have NOT established it and will not assert it.**
- ⛔ **THE PROVENANCE READ (§2 1.b / rule 24.0) IS OWED FOR ALL THREE AND IS NOT DONE YET** — Tier 1, because this batch changes their behaviour (even if only by deletion). **Where the seed's fields were *meant* to come from decides whether removing the read is a cleanup or the amputation of an unfinished wire.** *(The B80 "Option C+ seed" comment at `:1570` names its own provenance — §9.5(b-ii): FOLLOW IT before ruling.)*

## 3.5 ✅ PROVENANCE READ DONE — IT INVERTED §3's TENTATIVE READING (and §3 is left standing as written, so the reversal is visible)

**BATCH_80 scope rev2 (`45becc3e5`, 2026-05-13, "Langston review incorporated"), VERBATIM:** *"§4.4 Migration: Option C → Option C+ (extend `initializeTrailingState` with **optional seed param for tradeMode/ladderRung/originalStopPrice preservation on rehydrate**; **protects in-flight moonbag trades at deploy time**)."*
⇒ ⛔ **THE SEED'S ENTIRE PURPOSE IS TO CARRY REAL VALUES ACROSS A RESTART. A cold seed is not its design — it is its FAILURE MODE.** §3 guessed "cuts toward intended"; **the provenance says the opposite, and that is exactly why the read is mandatory before disposition.**

**CENSUS (repo-wide, tests excluded):** `ladderRungsHit`/`originalStopPrice` **are real columns — on `closed_trades`** (`schema.ts:1747/:1754`, table at `:1689`), **NOT on `active_open_positions`**; **nothing writes them back** onto an active row (11 `updateActiveOpenPosition` sites, none carrying either). ★ **THE VTS PATH WORKS AND ITS DIFFERENCE IS THE PROOF:** `vts-runner.ts:3010-11` seeds identically, but its trade object is **in-memory and written back every cycle** (`:3118-24`). **Same seed shape, opposite outcome, because the CARRIER differs.**

★★ **ANALYST CLAUDE STRENGTHENED IT TO *A FORTIORI* (population, all 9 open rows, not a window): the fields are not in `metadata` either — `metadata->>'originalStopPrice'` and `metadata->>'ladderRung'` are NULL on ALL 9.** ⇒ **the `??` defaults are not "usually" firing, they are THE ONLY POSSIBLE OUTCOME: this is not a seed that rehydrates badly, it is a seed with NOTHING TO REHYDRATE FROM.** ✅ **That RETIRES my window-bound stop-axis leg — the substitution is UNCONDITIONAL; ratchet history only decides whether the substituted value is HARMLESS, never whether the substitution OCCURS.**

⚠️ **AND IT CORRECTS MY OWN URGENCY FRAMING (adopted): I told him to treat this as a STANDING COST like #624/#632. THE EXPOSURE IS NOT CONSTANT — IT GROWS WITH TIME-IN-TRADE.** It is harmless-by-luck today only because no position has ratcheted (paper moonbag concurrency = 0 at both of today's restores; every rung emission `rung=0`, 565 lines, against a 1,608-line TEC control). **A restart TODAY costs little; a restart AFTER THE FIRST RATCHET costs real stop provenance.** ⇒ **"standing cost" UNDERSTATES it, and that bears on whether an alert is armed now.**

## 4. WHAT THIS BATCH WILL AND WILL NOT DO
✅ **WILL:** remove the `regime` dead read (the ruled leg) · complete the **§9.5(a-ii) state-write census** the homing required · **complete the provenance read for all three** · disposition `ladderRung`/`originalStopPrice` explicitly against rule 24's three outcomes · record the `position: any` finding.
⛔ **WILL NOT:** change TEC exit behaviour · touch the redundant-but-live `tradeMode`/`sourcePool` casts · "fix" the two fallbacks unilaterally — **if the provenance read says the seed should be carrying real values, that is a SCOPE CALL to Kyle (options paper), not a quiet wire-up.** ★ **Wiring a cold-start seed to real ladder state would change exit behaviour on every post-restart position — that is emphatically not a `non_architecture` edit and would re-declare.**

## 5. VERIFICATION
**(a)** `tsc` + full suite green (**the FULL suite, not just the touched file** — my own #599 lesson) · **(b)** the removed read is provably behaviour-neutral: `context.regime` is `undefined` before and after — assert it, do not assume · **(c)** §9.5(a-ii) census stated in full, each list with its members or an explicit "exactly one, here it is" · **(d)** the provenance findings recorded per field with the five dispositions · **(e)** §9.3 UI check **N/A justified** (no user-facing surface) — stated, not skipped by default.

## 6. OUT OF SCOPE
The `position: any` signature itself (typing it properly is a real improvement and a **separate** batch — it would surface every other silent read at this site and is not a one-line change) · the two live redundant casts · anything in `evaluateTECExit`.
