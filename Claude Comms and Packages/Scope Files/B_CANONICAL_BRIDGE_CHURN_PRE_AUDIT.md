# B-CANONICAL-BRIDGE-CHURN — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-CANONICAL-BRIDGE-CHURN` · **owner:** CC-A · **issue:** `#402` · **plan row:** `PHASE_19_PLAN` 4.56a · **change-class:** `non_architecture`
**Step 1 APPROVED** by Langston at `4755548db` with BLOCKER-1; folded at `b5dad2e67`.
**Ref for every citation:** `origin/migration/aws-supabase` at `b5dad2e67`.

---

## 0. ⛔ PREVIOUSLY STATED / NOW / REASON

| | |
|---|---|
| **PREVIOUSLY STATED** | *(scope r1)* Keep the sync time in an **untracked** sidecar. |
| **NOW** | **No sidecar at all.** Skip-on-unchanged; the surviving stamp becomes "when content changed"; liveness goes to the already-ignored `logs/` stream. |
| **REASON** | `dt-deploy.sh:194` is a **bare** `git status --porcelain`, which lists untracked files as `??` — an untracked sidecar would have caused the very refusal this batch fixes. **I had established that property myself hours earlier in `B-DRIFT-RUNTIME-PREDICATE`.** |

| | |
|---|---|
| **PREVIOUSLY STATED** | *(scope r1, §4)* The fresh timestamp is *"the closest thing we have to RISK-017's missing staleness check."* |
| **NOW** | **It carries no staleness information at all** — it advances every run regardless of content. It is a scheduler-liveness proxy. |
| **REASON** | Langston F-6. And RISK-017's own proposed fix (a) is *"a hash/version comparison check"* — **which is what OBJ-1 builds** ⇒ this batch makes RISK-017 **stronger**, not weaker. |

| | |
|---|---|
| **PREVIOUSLY STATED** | *(Langston, Step 1)* The sibling's blanket filter is safe there *"because its payload has no `_schema`."* |
| **NOW** | **It has one, and the filter is at TWO sites** — `recalibrate-predictive-weights.ts:251` (change test) and `:274` (post-write verify). **He struck his own reason.** |
| **REASON** | The asymmetry is in the **CONSUMERS**, not the payload shape. Ours is read at boot by a validator that **errors** (`schema-validator.ts:49-53`) and rendered as a badge; the sibling's has **no consumer**. |

---

# PART A — THE AUDIT

## A1. THE WRITER, AND ITS TWO TRIGGERS
`syncCanonicalBridge` (`sync-canonical-bridge.ts:241`) `atomicWrite`s three tracked files (`:252`, `:259`, `:265`). **Only the JSON churns** — `generateBridgeJSON` stamps `updatedAt`/`generatedAt` fresh at `:136-137`, while the two `.md` generators interpolate the **constant** `CANONICAL_SCHEMA_METADATA.updatedAt` = `'2026-04-12T00:00:00Z'` (`canonical-regime-strategy-map.ts:40`; used `:160`, `:208`).
**TRIGGERS — two, not one:** `autonomy-scheduler.ts:608` (`canonical_bridge_sync`, **daily**, started `:1056`) **and** `routes.ts:2102-2103` (`POST /api/system/force-sync-canonical`, a **UI button**).

## A2. §9.5(a) — THE READER CENSUS, CORRECTED TO FOUR
| # | site | mechanism | consequence of a stale/absent file |
|---|---|---|---|
| 1 | `server/core/strategy-mapper.ts:22` | **static `import … with { type: 'json' }`** — bundled at BUILD | ⛔ absent ⇒ **build fails**, not a read failure. **This is why untrack-and-ignore is off the table.** |
| 2 | `server/utils/validate-canonical.ts:18` | same | same |
| 3 | `server/routes.ts:2083` | **disk read**, serves `GET /api/system/canonical-map` | feeds the UI |
| 4 | `server/bootstrap/schema-validator.ts:37` | **disk read AT BOOT** | ⛔ `_schema` mismatch ⇒ **`errors.push`** (`:49-53`) |

**And the UI consumer, traced end to end:** `analytics.tsx:2799` queries the endpoint → `:2848` reads `_metadata.updatedAt` → **`:2844` renders `Schema:` and `Last Sync:` on the SAME LINE.**

## A3. ⛔ BLOCKER-1's KEY SET — WHY THE BORROWED FILTER IS WRONG HERE
Top-level keys: **`_metadata`, `_schema`, `byAssetClass`.** `!k.startsWith("_")` ⇒ the checksum covers **`byAssetClass` alone**, leaving `_schema` outside change detection — and `_metadata` also carries `_changelog`, `_fields`, `canonical`, `generator`, `includesDriftScore`, `source`, **all content**.
✅ **EXCLUSION SET IS EXACTLY TWO: `_metadata.updatedAt`, `_metadata.generatedAt`.**

## A4. ⭐ THE TEST GAP — RE-DERIVED, AND IT IS EXACTLY ONE ASSERTION WIDE
**The two halves exist in different files and are never joined:**
- `server/tests/unit/sync-canonical-bridge.test.ts` — calls `generateBridgeJSON()` (`:47, :58, :66, :82, :88, :104`) and **never touches disk** (no `readFile`/`import … .json` anywhere in it).
- `server/tests/system/mapping_drift_integrity.test.ts` — **reads the committed file** (`:147, :162, :179, :275`) and **never calls `generateBridgeJSON`**.

⇒ ⛔ **NOTHING COMPARES GENERATOR OUTPUT TO COMMITTED BYTES.** A change to the TS map that adds or drops a `favoredStrategies` member leaves **every test green while the committed JSON disagrees** — the exact RISK-017 condition, undetected since April.
⚠️ **One cite of his I could not confirm and am not repeating as fact:** he places the `_schema` assertion at `mapping_drift_integrity.test.ts:200`; `:200` is `aggregateDriftStats computes correctly`. **The gap claim does not rest on it**, and I did not chase the true line.

## A5. PROVENANCE — TIER 1
**`dbd8b3fcb` (2026-04-12, B59 Phase 15a)**, verbatim: *"**Mapping Drift sync fix** — hard-coded updatedAt timestamp now overridden with fresh date on every sync. […] **Added daily canonical_bridge_sync scheduler task.**"* · *"Langston review: approved."*
**DISPOSITION (2) — relevant, needs updating to today's intent.** ⚠️ **`RULED ON REPORTED FACT` by Langston** — he did not re-read the commit and says it is not load-bearing. **I did read it; the quote above is from the object.**

---

# PART B — THE IMPLEMENTATION PLAN
> Every item names the audit finding it falls out of.

| # | item | falls out of |
|---|---|---|
| **P-1** | In `syncCanonicalBridge`, skip the JSON write when a checksum over the payload **excluding exactly `_metadata.updatedAt` and `_metadata.generatedAt`** matches the file on disk. **Reuse the sibling's MECHANISM, not its key set.** | **A3**, BLOCKER-1 |
| **P-2** | Stamp `updatedAt`/`generatedAt` only on a genuine change, and **correct the committed `2026-06-11T01:17:10.255Z` pair in the same commit** — it is a churn artifact, not a content date. | **A1**, F-3 |
| **P-3** | `analytics.tsx:2844`: **`Last Sync:` → `Map Updated:`**. The string is named here, not at implementation. | OBJ-2, Langston's condition |
| **P-4** | Record "the sync ran" in the existing ignored `logs/` stream (`sync-canonical-bridge.ts:62`). **No tracked field, no new file.** | OBJ-3, F-1 |
| **P-5** | ⭐ **THE CI ASSERTION — `generateBridgeJSON()`'s `byAssetClass` vs the committed `byAssetClass`, same two-entry exclusion.** Placed in `sync-canonical-bridge.test.ts`, which already imports the generator. **FOLDED AS AN OBJECTIVE, per Langston's "fold it if it is the one assertion I think it is" — A4 confirms it is.** | **A4** |
| **P-6** | The same-commit obligation goes at the **head of `canonical-regime-strategy-map.ts`** — ⛔ **NOT the sync script.** *(Langston: that would be `fix-follows-pointer` — the obligation fires when someone edits the TS map, and a note in the sync script is read by whoever edits the sync script.)* Plus the SIM entry as the durable record. | Langston, this round |
| **P-7** | `#402` closed; **the sibling's disposition filed with owner + plan row, carrying its inherited `_schema` defect at `:251` AND `:274`.** No code. | OBJ-5 |

⛔ **NOT IN THE PLAN:** untrack-and-ignore (**A2 row 1** — build-time import); any change to `dt-deploy`'s refusal; the sibling's own untrack work.

## ⭐ WHY P-5 IS THE ITEM THAT OUTLIVES THE BATCH
Once P-1 lands, **a dirty tree on this file stops being noise and becomes the signal** — it will mean the committed JSON disagrees with the TS map, which is RISK-017's undetected condition. **`dt-deploy`'s `exit 3` becomes RISK-017's detector instead of its victim.**
⚠️ **And the residual that creates is a new obligation on OTHER PEOPLE'S batches** — regenerate and commit the JSON in the same commit as any TS-map change. **P-5 is what makes that fire on the breaching commit rather than depending on someone having read P-6's note.** A prose obligation nobody meets is how `#402` stayed open for ten weeks.

## PLAIN-LANGUAGE SUMMARY
The audit changed the plan three times, and every change came from someone else reading it.

**The fix I first proposed would have caused the exact problem it was meant to cure** — I wanted to park a timestamp in a file outside version control, but the deploy tool objects to *any* unexpected file, a fact I had worked out myself that morning. **The fix I then proposed to copy from a neighbouring job would have introduced a new bug**, because that job's version ignores every field starting with an underscore, and here that quietly includes the schema version — so changing it would have been silently refused, breaking a startup check and a badge on screen.

**And the most useful thing came last.** There are two test files: one checks what the generator produces, the other checks the stored file. Neither compares them. So if someone edits the source and forgets to regenerate, every test passes while the two disagree — which is a risk we have had written down and undetected since April. **One assertion joins them, and it reuses the comparison this batch is already building.**

That turns the whole thing around: after this, a "dirty file" on the server stops being noise and becomes the alarm for a problem we previously had no way to detect.
