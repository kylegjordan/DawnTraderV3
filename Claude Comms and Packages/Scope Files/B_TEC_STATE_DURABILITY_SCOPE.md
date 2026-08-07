# B-TEC-STATE-DURABILITY — SCOPE r1

change-class: non_architecture
**Owner:** CC-A · 2026-08-07 · **Due: this week** (Langston: *"currently belongs to nobody ends this week"*) · Home: **#678** · Width: **RIDE — all three files, one batch** (Langston ruling, 2026-08-07)

> ⛔⛔ **THE HEADLINE IS NOT THE `/tmp` MOVE. Langston's review found a LIVE, UNCONDITIONAL DATA-LOSS PATH in `loadTrailingStates()` that exists TODAY and would survive the relocation untouched — see §2. I verified it at source and it is worse than the thing #678 was filed for.**

---

## 1. THE THREE FILES, AND WHY IT IS THREE
| file | constant | loss semantics — ⛔ **DO NOT FLATTEN THESE INTO ONE SEVERITY** (Langston condition 5) |
|---|---|---|
| `trade-safety.ts:891` | `TRAILING_STATE_FILE` | ⛔ **SILENT.** 279–283 states; positions lose ladder progress + stop provenance and **nothing announces it** |
| `amr-equity-feed.ts:53` | `STATE_FILE` | has a **SECOND READER OUTSIDE THE MODULE** — see §3(a) |
| `external-macro-feed.ts:58` | `FEED_PERSIST_FILE` | **SELF-ANNOUNCING**: its own comment states the cost — *"modifier=1.0 + fallbackActive=true for ~48 minutes of every restart"* — and it raises `fallbackActive` |

★ **`external-macro-feed` IS NOT A NEIGHBOUR, IT IS A CHILD OF #678.** `external-macro-feed.ts:56-57`, verbatim: *"Writing JSON to /tmp matches the trailing-state pattern from `server/services/trade-safety.ts`."* **It copied the defect from the file #678 names.** ⇒ **fixing the parent and leaving the documented copy is §15 verbatim; that one was never a judgment call.**
✅ **BOTH RIDE-CANDIDATES ARE LIVE — reachability CHECKED, not assumed** (the B-5 Obj-10 lesson: a symbol existing is not the path being reached): `autonomy-scheduler.ts:51` starts amr-equity-feed, `:19` inits external-macro-feed; readers at `macro-snapshot.ts:13`, `amr-input-health.ts:38`, `amr-weather-report.ts:49-50`, `market-context-engine.ts:81`, `market-snapshot.ts:13`. **No §15 legacy disposition is available for either — outcome (1), same as #678.**

## 2. ⛔⛔ THE LIVE DEFECT THE RELOCATION WOULD HAVE STEPPED PAST
**`trade-safety.ts:909-922`, verified at source:**
```ts
try {
  if (fs.existsSync(TRAILING_STATE_FILE)) {
    const states = JSON.parse(data);   // ← inside the try
    importStates(states);              // ← inside the try
    …
} catch (error) {
  console.error(`[9.2][PERSIST] Failed to load trailing states:`, error);
}                                      // ← NO RETHROW
```
⇒ **A CORRUPT FILE MEANS `importStates()` NEVER RUNS. The engine boots with ZERO trailing states. 279 positions lose ladder progress and stop provenance, and THE SYSTEM REPORTS HEALTHY.**
⛔ **The only trace is ONE `console.error` line — on stderr, into a multi-hundred-MB log.** ⇒ **this is the absent-as-valid hazard in its purest form, and it is LIVE TODAY, independent of `/tmp`.**
⭐ **Fixing it is the PRECEDENT APPLIED FAITHFULLY RATHER THAN PARTIALLY, not scope creep** — `outcome-feedback-store.ts` already carries the rule in its own comment (Langston's Step-2 clarification there): *"the constructor does NOT silently fall back to legacy when the new path is corrupt. Throws with a clear error message — operator investigates."*

## 3. ★ THE TWO THINGS MY PRE-SCOPE MISSED (Langston; both IN scope, neither a new item)
**(a) A SURVIVING READER OUTSIDE THE MODULE — the §9.5(a-ii) shape, and it is invisible to every automated check.** `scripts/b5-amr-correctness-audit.ts:216` **independently hardcodes** `const statePath = '/tmp/amr-equity-feed-state.json'` — **a string literal in a second file**: `tsc` cannot see it, CI cannot see it, caller-tracing cannot see it. ⇒ **migrate the writer and that audit silently reads a path that no longer exists — and AN AUDIT THAT FINDS NOTHING LOOKS EXACTLY LIKE AN AUDIT THAT PASSES.**
✅ **FIX: export the constant from `amr-equity-feed.ts` and have the audit IMPORT it, so the next move cannot split them again.** ⚠️ **Reader census run on the other two: `trailing-states.json` and `external-macro-feed-state.json` have exactly ONE site each. Only AMR has the second reader — which is the file I was most hesitant to include.**
**(b)** = §2 above.

## 4. THE FIVE CONDITIONS ON THE RIDE (Langston, binding)
1. **THREE manifest rows, not one** (`STORAGE_POLICY.md` §9E). #678's own class argument is *no manifest row, no tier, no backup ⇒ not a durable home* — **that argument binds all three or it binds none.**
2. **Hard-fail-on-corrupt per file.** Legacy fallback fires **ONCE, on ABSENCE ONLY** — never on corruption.
3. **Export the path constant wherever a second reader exists** (AMR today).
4. **CC-B gets a channel notice on `amr-equity-feed` before I edit — a NOTICE, NOT A GATE.** The change is a path constant + a loader shape; it touches **no AMR math, no threshold, no snapshot contract.** *(Langston: gating it on CC-B's arc would repeat the exact coupling error he avoided on #677.)*
5. **Do NOT flatten the three severities** — §1's table states them separately.

## 5. ⛔ EXAMINED AND EXCLUDED — NAMED per §15, so a later grep is not read as a missed sweep
**~14 other `/tmp` users are logs, locks, caches and export scratch — separated by ROLE, not by matching the string.** Two get an explicit line so nobody "fixes" them later:
- `b74-refresh-universe.ts:29` — the only record of yesterday's universe, **but its loss is SELF-ANNOUNCING** (*"no previous cache; treating as initial run"*) and costs a churn diff, **not engine state**. **OUT.**
- `b75-retention-sweep.ts:969` `SWEEP_LOCK_FILE` — ⭐ **CORRECT BY DESIGN IN `/tmp`: a lock SHOULD die on reboot.** **OUT, and deliberately so.**

## 6. VERIFICATION
Per file: **(a)** new path written + read back after a real restart · **(b)** ⛔ **corruption HARD-FAILS — proven by INJECTING a corrupt file and observing the throw, not by reading the code** (a `catch` that looks right is what we have today) · **(c)** legacy fallback fires **once on absence** and not on corruption · **(d)** three manifest rows present · **(e)** the AMR audit imports the exported constant and **still finds its state** — ⚠️ **with a POSITIVE CONTROL, because an audit finding nothing is this batch's own named failure mode** · **(f)** `tsc` + FULL suite + CI 4/4 per-job.

## 7. OUT OF SCOPE
#677's seed reconnect (Kyle-pending) · the `/tmp` log/lock/cache class (§5) · AMR math, thresholds, snapshot contracts.
