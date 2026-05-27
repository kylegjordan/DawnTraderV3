# B79.0n.RTB Step 4 R1 re-ACK request — fix-up commit on top of `298cb2e`

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Step 4 code review R1 blocking revision landed; please re-ACK on new HEAD.

---

## What landed

**New HEAD SHA: `a4ac36c`** (rebased + pushed cleanly on top of `7650879` change-list commit, which was already in remote between your review dispatch and this fix-up).

Single fix-up commit: `a4ac36c B79.0n.RTB Step 4 R1 fix — package.json script + N1/N2 inline warns`.

3 files changed, +16/-2:
- `package.json` — added `"b79-0n-rtb-backfill": "tsx scripts/b79-0n-rtb-backfill-asset-class.ts"` to scripts block
- `server/core/rtb/ready_to_buy_service.ts` — N1 warn before `enrichedMetadata` build when `!input.assetClass`
- `server/services/rtb-refresh-service.ts` — N2 warn in `assignSignalsToBuckets` catch path

## Diff snippets (embedded per §6.5.0.a)

### R1 — package.json

```diff
     "b-phase-a2:backfill": "tsx scripts/b-phase-a2-backfill.ts",
-    "b-new-34b:prewarm": "tsx scripts/b-new-34b-prewarm-snapshot.ts"
+    "b-new-34b:prewarm": "tsx scripts/b-new-34b-prewarm-snapshot.ts",
+    "b79-0n-rtb-backfill": "tsx scripts/b79-0n-rtb-backfill-asset-class.ts"
```

Verify `npm run b79-0n-rtb-backfill` resolves on staging post-`git pull`. Hyphen-form (not colon) matches scope §6.4 + the script-path documentation block at the top of `scripts/b79-0n-rtb-backfill-asset-class.ts:29`.

### N1 — ready_to_buy_service.ts queueSQESignal silent fallback warn

```diff
+    // B79.0n.RTB N1 (Langston Step 4 non-blocking note): surface upstream gaps
+    // where SQEInput.assetClass is missing. Silent crypto_spot fallback hides
+    // bugs in caller threading (B79.0n.STORAGE was supposed to thread assetClass
+    // end-to-end; any unthreaded path triggers this warn).
+    if (!input.assetClass) {
+      console.warn(`[B79.0n.RTB][QUEUE_FALLBACK] queueSQESignal received missing assetClass; defaulting to crypto_spot. symbol=${normalizedSymbol} strategy=${input.strategy} signalId=${input.signalId}`);
+    }
+
     // Phase 14.5: Persist routing and ranking metadata for auditability
     const enrichedMetadata = {
       ...(input.metadata || {}),
       sourcePool: input.sourcePool || undefined,
       signalType: input.signalType || 'QUANT',
       assetClass: input.assetClass || 'crypto_spot',
       rankingScore: input.rankingScore ?? parseFloat(String(input.finalScore || '0')),
     };
```

Sits BEFORE the two `input.assetClass || 'crypto_spot'` assignments (enrichedMetadata + insertData) so the warn fires once per missing-assetClass call regardless of how many fallback sites use the value.

### N2 — rtb-refresh-service.ts assignSignalsToBuckets catch path warn

```diff
           let assetClass = signal.assetClass as AssetClass | null;
           if (!assetClass) {
             try {
               assetClass = resolveAssetClass(signal.symbol, 'kraken');
-            } catch {
+            } catch (err) {
+              // B79.0n.RTB N2 (Langston Step 4 non-blocking note): surface
+              // upstream gaps where neither signal.assetClass column nor
+              // resolveAssetClass could resolve. Defaulting to crypto_spot
+              // matches the non-active-class warn below.
+              console.warn(`[B79.0n.RTB][BUCKET_ASSIGN] resolveAssetClass threw for signalKey=${signalKey} symbol=${signal.symbol}; defaulting to crypto_spot. err=${(err as Error)?.message ?? String(err)}`);
               assetClass = 'crypto_spot';
             }
           }
```

Matches the `[B79.0n.RTB][BUCKET_ASSIGN]` prefix convention of the non-active-class warn immediately below (lines 343).

### N3 — MANIFEST hotfix disposition

Folded into the completion-report iteration narrative rather than the change list (which was already merged at `7650879`). The hotfix at `298cb2e` is in remote, both manifests entries (`2026-05-27-b79-0n-rtb-phase1.sql`, `2026-05-27-b79-0n-rtb-phase3.sql`) are present. No additional fix-up needed.

## Local verification on a4ac36c

- `npx tsc --noEmit`: 494 errors — `node scripts/check-tsc-baseline.mjs` reports `OK — no regressions above baseline` (baseline 494; current 494; exact match, no new (file,code) pairs introduced).
- Tests: 53 RTB tests still pass (no changes to test files; the warn statements don't alter control flow).
- `git push origin migration/aws-supabase`: succeeded after rebase pull (you had pushed the change-list commit `7650879` to remote between my Step 3 commit and this R1 fix).

CI run `26507336347` is `in_progress` on `a4ac36c` as of dispatch. I'll confirm green before Step 6 deploy.

## Ask

Per your prior message:
> "Once R1 lands and you confirm new HEAD SHA, I ACK and you proceed to Step 5 CI all-4-green → Step 6 staging deploy per §3 sequence → Step 7-8 verification → Step 10 governance (all 8 docs) → Step 11 completion report + 3-way memory sync."

**Re-ACK on `a4ac36c` so I can proceed to Step 5 once CI completes green.** No re-walk of the other 8 items needed. If you spot an issue with the R1/N1/N2 landings themselves, flag specifically and I'll iterate.
