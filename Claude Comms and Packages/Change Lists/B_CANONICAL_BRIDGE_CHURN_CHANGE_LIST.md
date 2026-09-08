# B-CANONICAL-BRIDGE-CHURN — CHANGE LIST (Step 4)

**READY AT `3ac3f1bf8`** · owner CC-A · `#402` · change-class `non_architecture` (Langston-CONFIRMED, override row landed) · plan row 4.56a
**CI:** run `34215001653`, **4/4 green verified per job** at `b6a5bc3a7` (the code head; `3ac3f1bf8` adds only governance text).

| file | change |
|---|---|
| `server/scripts/sync-canonical-bridge.ts` | skip-on-unchanged + `filesUnchanged` |
| `server/tests/unit/sync-canonical-bridge.test.ts` | the committed-matches-generator assertion, the skip test, and snapshot/restore |
| `server/config/canonical-regime-strategy-map.ts` | +17/-0, docblock only — the same-commit obligation |
| `server/routes.ts` | +1 — surfaces `filesUnchanged` |
| `client/src/pages/analytics.tsx` | `Last Sync:` → `Map Updated:` |
| `bridge/canonical/mapping-regime-strategy.json` | 2/2 — the derived stamp |

---

## 1. THE SKIP (P-1), AND WHY THE KEY SET IS NOT THE SIBLING'S

**BEFORE** — unconditional:
```ts
atomicWrite(jsonPath, jsonContent);
filesUpdated.push(jsonPath);
logEvent(`Updated ${jsonPath}`);
```
**AFTER:**
```ts
const existingKey = existsSync(jsonPath) ? contentKey(readFileSync(jsonPath, 'utf8')) : null;
const candidateKey = contentKey(jsonContent);
if (existingKey !== null && candidateKey !== null && existingKey === candidateKey) {
  filesUnchanged.push(jsonPath);
  logEvent(`Unchanged (content identical, stamps not rewritten) ${jsonPath}`);
} else {
  atomicWrite(jsonPath, jsonContent);
  filesUpdated.push(jsonPath);
  logEvent(`Updated ${jsonPath}`);
}
```
`contentKey()` deletes **exactly `_metadata.updatedAt` and `_metadata.generatedAt`**, sorts, sha256s. **Null on absent/unparseable ⇒ never equal ⇒ always rewritten** (broken never reads as agreement).
⛔ **BLOCKER-1 honoured:** the sibling's `!k.startsWith("_")` would have left `_schema` outside detection. The in-file comment carries the whole consequence chain so the next reader cannot "simplify" it back.

## 2. ⛔ CONDITION B — THE FUNCTION NO LONGER REPORTS WORK IT DID NOT DO
Return type gains `filesUnchanged: string[]`, on **both** paths including the catch. `routes.ts:2108` surfaces it in the force-sync response. Completion log reads `N updated, M unchanged`.
⚠️ **HONEST LIMIT, and it corrects my own Step-3 commit message:** `handleForceSync` (`analytics.tsx:2804-2814`) **awaits `apiFetch` and discards the body**, so the button still shows the operator nothing. The API is honest; the UI is not yet wired. **Nothing is misreported — but my sentence *"so the Force Sync button can tell the operator the truth"* was untrue and is withdrawn.**

## 3. ⭐ THE ASSERTION THAT OUTLIVES THE BATCH (P-5)
`generateBridgeJSON()`'s `byAssetClass` and `_schema` vs **the committed file** — the two halves that lived in different files and were never joined (this suite never touched disk; `mapping_drift_integrity.test.ts` never called the generator).
⛔ **`resolve(__dirname, ...)` not `process.cwd()`, and NO `existsSync` guard** — because `mapping_drift_integrity.test.ts:277-280` has one, so **an absent file passes THAT test silently.**

## 4. ⛔⛔ THE DEFECT A FRESH READER FOUND IN MY OWN TEST — AND IT IS THE BATCH'S SUBJECT AGAIN
The skip test calls the **real** function against the **real** `bridge/canonical/`. On a drifted tree that call takes the **write** branch. **Measured, expectation written first:** inject a missing `vwap_pullback` → **run 1 = 2 failed AND the file silently regenerated**, destroying the derived stamp P-2 had just installed → **run 2, no human action = 13 passed.**
⇒ ★ **Red became green on re-run, leaving a canonical file the developer never authored and the RISK-017 drift repaired instead of traced.**
**FIXED TWO WAYS:** `beforeAll`/`afterAll` snapshot-and-restore of all three bridge files **including on failure** — which is when it mattered — and the skip test now asserts the **file bytes are unchanged** across the call, which proves OBJ-1 itself rather than only the reporting half.
**RE-PROVEN:** inject drift → run 1 = 2 failed **and the derived stamp SURVIVES** → run 2 = **2 failed again**. Red stays red. Tree clean after.

## 5. THE DERIVED STAMP (P-2, CONDITION C)
`2026-06-11T01:17:10.255Z` → **`2026-05-24T00:30:18Z`**, derived by walking all **9** commits touching the file newest→oldest comparing **`byAssetClass` only**: **`af99bd5dd`**. **The old value overstated freshness by 18 days.** Cross-checked against `SIM:866`, which names the same sha independently.
⚠️ **My first attempt round-tripped through `json.dumps` and its default `ensure_ascii` re-escaped an em-dash — a 4-line diff instead of 2, cosmetic drift inside the batch about cosmetic drift.** Caught by checking the diff against the stated expectation; redone as a surgical replacement. **Now exactly 2/2, both stamps.**

## ⛔ THE JUDGEMENT CALLS I WANT ATTACKED
1. **The `.md` files have no committed-matches-generator assertion.** They are generated from fields the JSON does not carry (`metrics.description`, display names, `patternType`, `secondaryMetrics`) ⇒ editing one leaves the JSON unchanged, my assertion green, and `.md` drift shipping — **same incident, different file.** All three match today, so this is future exposure. **Carried to Step 10, not fixed here.** Tell me if it belongs in this batch.
2. **The UI wiring** (§2's limit). One line to display `filesUnchanged`; I left it out as scope creep. **Defensible either way.**
3. **The test writes to the real tree** by design, now snapshot-guarded. **A crash between `writeFileSync` and `renameSync` in `atomicWrite` would still strand an untracked `*.tmp.<ms>`** — pre-existing, and it would trip both `dt-deploy` and sync-gate check 4.
4. **`autonomy-scheduler.ts:623`** interpolates the array not its length (`— ${result.filesUpdated} files updated` prints joined paths) and never mentions `filesUnchanged`. **Pre-existing; not touched. Should it be?**

## EVIDENCE
`bash -n` / `tsc`: **141 `routes.ts` errors with my change stashed, 141 with it applied — I introduced none.** Suite: **13 passed**, tree clean after. Mutation-tested: drop a strategy → 1 failed; delete the file → 2 failed (ENOENT, proving the no-guard rule); strip the skip → caught; restore → green.
