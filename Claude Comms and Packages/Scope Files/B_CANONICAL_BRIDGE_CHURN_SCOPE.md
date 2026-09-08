# B-CANONICAL-BRIDGE-CHURN — SCOPE

**change-class: non_architecture**

**Batch:** `B-CANONICAL-BRIDGE-CHURN` · **owner:** CC-A · **issue:** existing **`#402`** (OPEN since 2026-06-30) · **plan row:** `PHASE_19_PLAN` 4.56a
**Placed by Langston 2026-09-08:** *"a daily task that can refuse deploys, has refused one, and sits under an issue open since June has outgrown a list."*
**Ref for every citation:** `origin/migration/aws-supabase` at `e3d85907c`.

---

## 1. THE PROBLEM, AND IT IS NO LONGER AN INFERENCE

`autonomy-scheduler.ts:608` registers **`canonical_bridge_sync`** and `:1056` starts it — **daily**. It calls `syncCanonicalBridge`, which `atomicWrite`s the **tracked** file `bridge/canonical/mapping-regime-strategy.json`. `sync-canonical-bridge.ts:136-137` stamps `updatedAt` and `generatedAt` with `new Date().toISOString()`, so **every run produces different bytes** ⇒ the staging worktree goes dirty ⇒ **`dt-deploy.sh:194-196` REFUSES the deploy, exit 3.**

⭐ **CONFIRMED BY PRE-REGISTERED PREDICTION, NOT BY INFERENCE.** Written before the event and amended before it could fail: *if no deploy or restart occurs before ~`2026-09-08T07:50:17Z`, `git status --porcelain` on staging will list **exactly one** file — this one — and NOT the two `.md` siblings.*
**Outcome at `07:53:50Z`: exactly that.** Fired `07:50:18` (one second off), diff = **2 insertions, 2 deletions**, `generatedAt`/`updatedAt` only. **The staging tree is dirty as I write this and the next deploy is refused.**
**And it has bitten before:** `#402`'s 2026-08-17 annotation records the `P19-B-FEEVIABILITY` deploy refused by the same symptom.

⚠️ **AND THE SCHEDULER IS NOT THE ONLY TRIGGER (F-2):** `routes.ts:2102-2103`, **`POST /api/system/force-sync-canonical`**, calls the same function from a **"Force Sync Canonical" button in the UI**. OBJ-1 covers it because it is the same writer — but §1 attributed the churn solely to the daily task, which was incomplete.

⚠️ **THE TIMER IS WHY IT LOOKS INTERMITTENT:** the task fires ~24 h after each app restart, and **every deploy restarts the app**, resetting the clock. **We have simply been deploying often enough to keep wiping it.**

## 2. ⛔⛔ MANDATORY 1.b — PROVENANCE, AND IT OVERTURNS THE FIX `#402` PROPOSES

**The churn is not an accident. It is a deliberate, Langston-approved fix.** Introducing commit **`dbd8b3fcb`, 2026-04-12**, quoted verbatim rather than summarised:

> **B59 Phase 15a: Predictive Learning UI Audit & Data Path Fixes**
> […]
> **2. Mapping Drift sync fix — hard-coded updatedAt timestamp now overridden with fresh date on every sync.** MIN_SAMPLES lowered 30→10 (pragmatic). **Added daily canonical_bridge_sync scheduler task.**
> […]
> **Langston review: approved** (double-scaling bug caught and fixed).

★ **BOTH HALVES — the fresh stamp AND the daily task — LANDED IN ONE REVIEWED COMMIT, as a fix to the Mapping Drift UI.** The in-code comments still say so: `sync-canonical-bridge.ts:136` *"B59: Override hard-coded updatedAt with fresh timestamp"*, and `canonical-regime-strategy-map.ts:40` *"B59: Updated from 2026-03-05. Sync script now uses fresh timestamps."*

**DISPOSITION: (2) — relevant, but needs updating to today's intent.** The intent (surface when the canonical map was last synced) is **still valid**; what has changed is that we now know it costs deploy refusals — a cost nobody weighed in April, because `dt-deploy`'s dirty-tree refusal did not exist yet.

## 3. ⛔ WHY `#402`'s OPTION (b) IS NOT THE FREE WIN IT LOOKS LIKE

`#402` says: *"verify whether any consumer reads this file from disk → if yes, (b) content-hash compare."* **`B-DRIFT-RUNTIME-PREDICATE`'s census answered the disk question — `routes.ts:2083-2085` does — and that closed the a/b choice as (b).** ⛔ **But the census did not ask what the timestamp is FOR, and it is user-visible:**

**THE FULL CHAIN, traced at the object:**
`GET /api/system/canonical-map` (`routes.ts:2079`, `authenticateToken`) → `fs.readFile(bridge/canonical/mapping-regime-strategy.json)` → returns the parsed bridge → **`client/src/pages/analytics.tsx:2848`**:
```ts
const lastUpdated = canonicalData?._metadata?.updatedAt || 'Unknown';
```
…rendered in the **Mapping Drift tab** — the very UI B59's commit was fixing.

⇒ ⛔ **OPTION (b), APPLIED NAIVELY, SILENTLY CHANGES WHAT A USER-VISIBLE FIELD MEANS** — from *"when the map was last synced"* to *"when its content last changed"*. **Those differ by months.** A field whose meaning changes while its label does not is this project's most repeated failure, and shipping it inside a batch about instruments that mislead would be the same joke twice.

## 4. MANDATORY 1.a — ARCHITECTURAL READ

- **`SYSTEM_IMPACT_MAP.md:865-870`** — names `sync-canonical-bridge.ts` + `autonomy-scheduler.ts` (daily task), records the B59 change, and states the downstream: *"consumer = `getClassMap` byAssetClass-nested read at boot, **Mapping Drift UI tab (reads bridge JSON metadata)**"*.
- ⛔ **`SIM:870` — THE INVARIANT THIS BATCH MUST NOT BREAK:** *"Producer-consumer contract (NEW invariant 2026-05-31): `generateBridgeJSON()` output MUST satisfy `getClassMap(assetClass)` for both `crypto_spot` AND `xstock_spot`. Asserted by `sync-canonical-bridge.test.ts` in CI."* **Nine tests. CI covers it, so a break is loud rather than silent.**
- **`SYSTEM_MANUAL.md:2377` — RISK-017, Bridge JSON Staleness Risk (MEDIUM), still open:** *"If the TS map is updated but the bridge sync script is not re-run, `strategy-mapper.ts` serves stale data at runtime. **No automated staleness check exists.**"* ⚠️ **The fresh timestamp is the closest thing we have to that missing check — which is a further argument against simply freezing it.**
- ⛔ **FOUR read sites, not two — my r1 census undercounted (F-5).** `server/core/strategy-mapper.ts:22` and `server/utils/validate-canonical.ts:18` take **static JSON imports** (bundled at build); `routes.ts:2083` reads the **file from disk**; and **`server/bootstrap/schema-validator.ts:37` ALSO reads it from disk AT BOOT** — the one I missed. *(It touches `_schema` only and treats absence as a warning, so it is harmless here — but §9.5(a) wants the hop enumerated, not the consequence pre-judged.)* **This batch changes none of them.**

## 5. ⭐ THE DESIGN, RESHAPED BY A FRESH READER — AND MY RECOMMENDATION WAS WRONG

⛔⛔ **F-1, AND IT IS MINE TO OWN: OPTION B AS I WROTE IT RE-CREATED THE EXACT FAILURE IT WAS FIXING.** I recommended a sidecar holding the sync time, described as *"untracked"*. **`dt-deploy.sh:194` is a BARE `git status --porcelain`, which lists untracked files as `??`** ⇒ **an untracked sidecar dirties the tree and produces the same `exit 3`.**
⚠️ **I discovered that exact property myself earlier the same day**, in `B-DRIFT-RUNTIME-PREDICATE`, and then wrote a recommendation that contradicted it. "Untracked" is not sufficient — **it must be GITIGNORED, or outside the repo tree.**
✅ **And once fixed it works, for two reasons the reader established: there is NO `git clean` anywhere in `dt-deploy.sh` (only `git reset --hard` at `:204`), so an IGNORED file survives every deploy — and `logs/` is already gitignored, with this very script already appending `logs/system_events.log` (`sync-canonical-bridge.ts:62`). A home exists that needs no `.gitignore` change.**

⭐⭐ **F-2 — THE FIX I PROPOSED ALREADY EXISTS, 40 LINES AWAY, IN THE SAME DIRECTORY.** `recalibrate-predictive-weights.ts:250-258` computes a checksum over the payload **with `_`-prefixed keys filtered out**, and skips the write when it matches:
```ts
const previousChecksum = prev ? computeChecksum(Object.fromEntries(
    Object.entries(prev).filter(([k]) => !k.startsWith("_")))) : null;
if (checksum === previousChecksum) { console.log("[11.7D] No significant change — skip overwrite."); return true; }
```
★ **The `_`-prefix filter is exactly right here, because this file's volatile fields live under `_metadata`.** ⇒ **REUSE THE IDIOM, DO NOT INVENT ONE** (`CONDUCT.md`: use what already exists before proposing new code).

⛔ **AND THAT SIBLING TASK IS A SECOND WRITER WITH THE SAME PROBLEM, WHICH THIS SCOPE HAD MISSED.** `autonomy-scheduler.ts:636` runs `predictive_weight_recalibration` **weekly**, writing the **tracked** `bridge/canonical/phase9_predictive-learning.json`. Its checksum guard means it does not churn on no-op runs — **but it still dirties the tree whenever weights genuinely change, and that has no home.** ⇒ **§9.4 disposition: ADDED TO THIS BATCH as OBJ-5**, since it is the same file class, the same directory and the same deploy consequence.

⚠️ **F-4 — THE REPO ALREADY HAS A KYLE-DIRECTED REMEDY FOR THIS CLASS, AND THE SCOPE MUST ENGAGE IT RATHER THAN LOOK PAST IT.** `.gitignore`'s tail block:
> *"Runtime-generated files that the server rewrites at runtime → they drift on staging and BLOCK every git pull (**Kyle directive 2026-06-24: permanently fix, stop stash-working-around it**)."*
…covering `diagnostics/phase2f_route_manifest.json`, `audit/phase30-fx4-6-report.md` and two governance-checker state files. **The established remedy is UNTRACK-AND-IGNORE.** ✅ **It is correctly excluded for THIS file — `strategy-mapper.ts:22` and `validate-canonical.ts:18` take STATIC imports bundled at BUILD time, so a clone without it fails the build, not a read — but the precedent must be named and excluded on the record, not silently skipped.**

### ⛔ F-3 + F-6 — THE TWO THINGS THAT DECIDE THE DISPLAY, AND F-6 REVERSES AN ARGUMENT OF MINE
- **The committed timestamp is ITSELF a churn artifact.** At the ref, `_metadata.updatedAt` is **`2026-06-11T01:17:10.255Z`** — the moment somebody happened to commit a churn diff, **not** a content change. ⇒ **skipping future writes without correcting it leaves the tab showing a meaningless date.** Renaming the label does not make the value true.
- ⚠️ **I ARGUED THE FRESH STAMP WAS "the closest thing we have to RISK-017's missing staleness check". THAT IS BACKWARDS.** It advances on **every** run **regardless of content**, so it carries **no staleness information at all** — it is a scheduler-liveness proxy. ★ **And RISK-017's own proposed fix (a) is *"a hash/version comparison check"* — which is precisely what OBJ-1 builds.** ⇒ **OBJ-4's honest answer is plausibly STRONGER, not weaker — and that removes most of the case for a sidecar.**

### ✅ THE DECISION I NOW RECOMMEND
**Skip-on-unchanged using the sibling's existing checksum idiom, make the surviving timestamp TRUE, and put scheduler-liveness where it already belongs — the ignored log, not a tracked field.**
⇒ **No sidecar, no new file, no `.gitignore` change.** ⛔ **This reverses my own §6 recommendation from r1; the sidecar's whole justification was preserving a "last synced" fact that F-6 shows the field never honestly carried.**

## 5b. ⛔⛔ BLOCKER-1 (LANGSTON, STEP 1) — THE BORROWED IDIOM'S KEY SET IS WRONG FOR THIS FILE

**Reusing `!k.startsWith("_")` verbatim would re-create the exact failure OBJ-2 exists to prevent.** Re-derived at the object:

**Top-level keys here are `_metadata`, `_schema`, `byAssetClass`** ⇒ that filter reduces the checksum to **`byAssetClass` ALONE**, leaving **`_schema` OUTSIDE change detection**. And `_metadata` itself holds `_changelog`, `_fields`, `canonical`, `generator`, `includesDriftScore`, `source` — **all content, not stamps.**

⇒ **THE FAILURE, concretely: bump `CANONICAL_SCHEMA_VERSION` without touching `byAssetClass` and the sync SILENTLY REFUSES TO WRITE IT.** Then `schema-validator.ts:49-53` reads `_schema` off disk at boot and pushes an **error** on mismatch; `analytics.tsx:2844` renders the stale value as the **`Schema:` badge — on the same line as the `Last Sync:` field this batch is relabelling**; and **"Force Sync Canonical" appears to do nothing.**

✅ **RESOLUTION — REUSE THE MECHANISM, NOT THE KEY SET. THE EXCLUSION LIST IS EXACTLY TWO ENTRIES: `_metadata.updatedAt` and `_metadata.generatedAt`. Nothing else.**

### ⚠️ AND HIS SUPPORTING REASON IS WRONG AT THE OBJECT — WHICH MAKES THE BLOCKER *STRONGER*, NOT WEAKER
He wrote that the sibling's blanket filter *"is safe **there** because its payload has no `_schema`"*. **It does.** `phase9_predictive-learning.json`'s top-level keys are `BULL_STABLE, TRANSITION, LOW_VOL_CHOP, BEAR_VOLATILE, HIGH_VOL_IMPULSE, _schema, _metadata` — **`_schema` is present**, and `recalibrate-predictive-weights.ts:248-253` applies the same filter, so **the sibling excludes its own `_schema` from change detection too.**

⇒ ★ **THE ASYMMETRY IS IN THE CONSUMERS, NOT THE PAYLOAD SHAPE — and that is the sharper statement of his own point.** This file's `_schema` is **read at boot by a validator that errors** and **rendered as a badge**. The sibling's `_schema` has **no consumer at all**: `git grep` over `server/` and `client/` returns only path constants and the writer itself. **So the idiom is latently wrong in BOTH places and only bites HERE.**
⛔ **The blocker stands exactly as issued; only its reason is corrected. The sibling's latent exposure is recorded in OBJ-5's disposition rather than left implicit.**

## 6. OBJECTIVES

### OBJ-1 — STOP THE CHURN, REUSING THE IN-REPO IDIOM
`syncCanonicalBridge` skips the write when a checksum over the payload **excluding `_`-prefixed keys** matches the existing file. **Reuse `recalibrate-predictive-weights.ts:250-258`'s pattern.**
**VERIFY:** run the sync twice against unchanged source ⇒ `git status --porcelain` **stays empty**; run once against genuinely changed source ⇒ the file **is** rewritten. ⛔ **The second case is the control — without it, a permanently disabled writer passes.**

### OBJ-2 — MAKE THE SURVIVING TIMESTAMP TRUE, AND THE LABEL MATCH IT
On a genuine content change the stamp advances; on a no-op it does not. **The committed `2026-06-11` artifact is corrected in the same commit.**
⭐ **THE REPLACEMENT STRING IS NAMED HERE, NOT AT IMPLEMENTATION TIME (Langston's condition): `analytics.tsx:2844` changes `Last Sync:` → `Map Updated:`.** ⛔ **His reason, and it is the whole point: after the fix the value LEGITIMATELY goes months stale, so the new label must not read as liveness.** *"Last Sync"* on a six-month-old date reads as a broken scheduler; *"Map Updated"* reads as a stable map.
**VERIFY:** read the rendered label and value in Claude-in-Chrome after a no-op sync and after a real one. ⛔ **A value whose meaning changed while its label did not is this project's most repeated failure; this objective exists to make that impossible to ship.**

### OBJ-3 — SCHEDULER LIVENESS KEEPS A HOME, AND IT IS NOT A TRACKED FILE
The fact *"the sync ran"* goes to the already-ignored `logs/` stream the script writes today (`sync-canonical-bridge.ts:62`), **not** to a tracked field.
**VERIFY:** a no-op sync leaves the tree clean **and** still records that it ran.

### OBJ-4 — THE PRODUCER-CONSUMER INVARIANT SURVIVES
**VERIFY:** `sync-canonical-bridge.test.ts` (9 tests) green in CI. ⚠️ **STATED LIMIT (F-5): all 9 operate on `generateBridgeJSON()`'s IN-MEMORY output and NONE reads disk ⇒ they stay green whether or not OBJ-1's write-skip works. They are the invariant control, NOT evidence for OBJ-1** — OBJ-1's `git status` check is its only instrument.

### OBJ-5 — THE SIBLING WEEKLY WRITER *(folded in per §9.4, F-2)*
⛔ **DISPOSITION ONLY — NO CODE IN THIS BATCH (Langston's ruling, and he is right).** Skip-on-unchanged **cannot help it**: its dirtiness comes from *genuine* change, not from a stamp. Its remedy is the F-4 untrack-and-ignore path, **which needs its own consumer census** — implementing it here would be an unscoped mechanism change.
★ **CARRY FORWARD INTO ITS HOME: it shares the `!k.startsWith("_")` defect BLOCKER-1 identifies** — its `_schema` is excluded from change detection too. **Latent there because that `_schema` has no consumer**, but it should not be inherited unexamined by whoever takes the untrack work.
**VERIFY:** a `RUNNING_ISSUES` entry exists with **owner and a named plan row**, and this batch's completion report names it. **Not left silent, and not silently fixed either.**

### OBJ-6 — STATE WHICH WAY RISK-017 MOVED
⭐⭐ **LANGSTON'S ADDITION, AND IT IS THE BEST IDEA IN THE BATCH: AFTER OBJ-1, A DIRTY TREE ON THIS FILE STOPS BEING NOISE AND BECOMES THE STALENESS ALARM.** A dirty `mapping-regime-strategy.json` will then mean **the committed JSON disagrees with the TS map** — which is precisely RISK-017's undetected condition. ⇒ **`dt-deploy`'s `exit 3` turns into RISK-017's DETECTOR instead of its VICTIM.**
⚠️ **AND THE RESIDUAL IT CREATES, STATED UP FRONT: any batch that changes the TS map must commit the regenerated JSON IN THE SAME COMMIT**, or staging dirties once and the next deploy is refused. **That is a new obligation on other people's batches and must be written where they will meet it, not only here.**
**VERIFY:** the completion report states **unchanged / weaker / stronger** with the mechanism above as the reason, **and** records the same-commit obligation.

## 7. OUT OF SCOPE
- **The two `.md` siblings** — non-churning, and the EVIDENCE is the code read, not the mtimes: their generators interpolate the CONSTANT `CANONICAL_SCHEMA_METADATA.updatedAt` = `'2026-04-12T00:00:00Z'` (`canonical-regime-strategy-map.ts:40`; used at `sync-canonical-bridge.ts:160`, `:208`). ⚠️ **I had cited their mtimes surviving five `git reset --hard` runs. That instrument cannot see git dirtiness — dirtiness is CONTENT-based — and in fact both files ARE `atomicWrite`n every sync, so their mtimes do change. The conclusion holds; the reason I gave for it did not.**
- **RISK-017's own fix** (a startup hash check, or importing the TS map directly) — a real item, **not this batch**; OBJ-4 only requires that we say which way we moved it.
- **`dt-deploy`'s refusal behaviour** — correct as designed; it protects uncommitted work and must not be softened to accommodate this.

## 8. PLAIN-LANGUAGE SUMMARY

Once a day the system regenerates a stored file and stamps the current time into it. That makes the server's copy differ from the official one, and our deploy tool then refuses to run — deliberately, so it never destroys someone's work. It refused a real deploy in August, and it is refusing them right now.

**The fix is to stop rewriting the file when nothing actually changed.** The history mattered here: that timestamp was added on purpose, in a reviewed change, to fix a screen showing when the mapping was last synced — and that screen still reads it today, under the label "Last Sync". So the fix has to deal with what the screen says, not just the file.

**Two things a second reader found that changed the plan, and both were mine.** I recommended keeping the sync time in a separate file "outside version control" — but the deploy tool refuses on *any* unexpected file, not just changed ones, so my fix would have caused the very failure it was meant to cure. **I had discovered that exact property myself earlier the same day and then recommended against it.** And the fix I was proposing to write **already exists forty lines away**, in the sibling task that regenerates the file next to this one; we should reuse it rather than invent a second version.

**The reader also reversed an argument I had leaned on.** I claimed the timestamp was our best signal that the mapping might be out of date. It isn't — it advances every single run whether anything changed or not, so it tells you the scheduler is alive and nothing more. Once you skip no-op writes, the timestamp starts carrying real information for the first time, which makes this a small improvement to a known risk rather than a cost.

**So the plan is now simpler than what I first proposed:** skip the write when nothing changed, correct the date currently stored in the file — which is itself a leftover from an accidental commit rather than a real change — relabel the screen so it says what it now means, and let the "the job ran" fact live in the log file the script already writes and which git already ignores. **No new files, no exceptions list, nothing extra to remember.**
