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
- **Two runtime consumers, different mechanisms:** `strategy-mapper.ts:22` and `validate-canonical.ts:18` take a **static JSON import** (bundled at build), while `routes.ts:2083` reads the **file from disk**. **This batch changes neither.**

## 5. OBJECTIVES

### OBJ-1 — STOP THE TRACKED FILE CHURNING *(the whole point)*
`syncCanonicalBridge` must not rewrite `bridge/canonical/mapping-regime-strategy.json` when **only** the timestamps would differ.
**VERIFY:** run the sync twice against unchanged source ⇒ `git status --porcelain` stays **empty**; run it once against genuinely changed source ⇒ the file **is** rewritten. **Both run against the real script, with the before-state captured, and the second case is the control that proves the first is not just a disabled writer.**

### OBJ-2 — ⛔ PRESERVE *"LAST SYNCED"* AS A DISTINCT, TRUE FACT
The Mapping Drift tab must keep showing when the sync last **ran**, not silently start showing when content last **changed**.
**VERIFY:** with content unchanged across a sync, the tab's value still advances **or** its label changes to match its new meaning — **one of the two, decided deliberately and stated in the completion report. Not left ambiguous.**

### OBJ-3 — THE PRODUCER-CONSUMER INVARIANT SURVIVES
**VERIFY:** `sync-canonical-bridge.test.ts` (9 tests) green in CI, and `getClassMap` satisfied for **both** `crypto_spot` and `xstock_spot`.

### OBJ-4 — THE STALENESS SIGNAL IS NOT SILENTLY WEAKENED
RISK-017 has no automated check; today's fresh stamp is a weak proxy for one.
**VERIFY:** state explicitly in the completion report whether this batch leaves RISK-017 **unchanged, weaker, or stronger** — and if weaker, say so plainly rather than closing over it.

## 6. ⛔ THE DESIGN CHOICE I WANT RULED ON, NOT ASSUMED

| | approach | cost |
|---|---|---|
| **A** | **content-hash compare, and CHANGE THE UI LABEL** to *"Last changed"* | smallest diff; but a reviewed B59 decision is partly undone, and RISK-017's proxy weakens |
| **B** | **content-hash compare on the tracked file + write the sync time to an UNTRACKED sidecar**, merged in by `routes.ts:2083` | preserves both meanings and keeps the tracked file stable; more moving parts, and a new file to reason about |
| **C** | gitignore the JSON | ⛔ **OFF THE TABLE, and now for a firmer reason than `#402` had:** `strategy-mapper.ts:22` takes a **static import bundled at build time**, so a clone without the file fails the build, not merely a read |

★ **MY RECOMMENDATION: B.** It is the only one that leaves **no user-visible meaning changed and no tracked file churning**, and the extra moving part is one untracked file. **A is defensible and smaller** — I would not argue hard against it, provided the label changes in the same commit. ⛔ **What I will not do is ship A with the label untouched, which is what `#402`'s one-line disposition would produce if taken literally.**

## 7. OUT OF SCOPE
- **The two `.md` siblings** — measured non-churning: their generators interpolate the constant `CANONICAL_SCHEMA_METADATA.updatedAt` (`:160`, `:208`), and their mtimes survived five `git reset --hard` runs unchanged.
- **RISK-017's own fix** (a startup hash check, or importing the TS map directly) — a real item, **not this batch**; OBJ-4 only requires that we say which way we moved it.
- **`dt-deploy`'s refusal behaviour** — correct as designed; it protects uncommitted work and must not be softened to accommodate this.

## 8. PLAIN-LANGUAGE SUMMARY
Once a day the system regenerates a stored file and stamps the current time into it. That makes the server's copy differ from the official one, and our deploy tool then refuses to run — deliberately, so it never destroys someone's work. It refused a real deploy in August, and it is refusing them right now.

**The obvious fix is "don't rewrite the file when nothing actually changed."** But the history says that timestamp was added on purpose, in a reviewed change, to fix a screen that shows *when the mapping was last synced* — and that screen still reads it today. So the obvious fix would quietly turn "last synced" into "last changed" without changing the words on screen. **That is the kind of thing we keep getting caught by, so I would rather decide it deliberately than discover it later.**

**I am recommending we keep both facts true — stop the stored file changing, and record the sync time somewhere that is not stored in the repository.** The alternative is simpler and I would accept it, provided we change the label on screen at the same time.
