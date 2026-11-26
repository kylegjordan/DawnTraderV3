# B-PRICE-SIDE-BY-JOB 8c-OFF-REMOVAL — Step 4 change list

**Declared change class:** `sub_batch`, as stated in the approved scope. The batch removes the dark-launch choice from an existing pricing path and deploys the row removal in a second, parent-ordered ref.

| Document | Status at the implementation refs |
| --- | --- |
| Scope | Present. `Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_SCOPE.md`. |
| Pre-audit and plan | Present. `Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_PRE_AUDIT.md`. |
| Completion report | Absent. Step 11 follows staging and governance. |
| Batch Catalog | 8c removal entry absent. Due at Step 10. |
| Phase History | 8c removal entry absent. Due at Step 10. |
| System Manual | Permanent active-crypto geometry change absent. Due at Step 10. |
| System Impact Map | Birth, open, P7 and row-set changes absent. Due at Step 10. |
| Changes and Fixes | N/A. This is the scoped follow-through to the reviewed 8c change and has its own change list and completion report. |
| Running Issues | Off-removal cross-reference absent. Check and update at Step 10. |
| Deleted Components Log | Present in A. Add the exact switch-row removal and staging evidence at Step 10. |
| Adjustment Framework | N/A. No strategy adjustment or threshold tuning. |
| Phase 19 Plan | N/A. Sprint-to-live row 17 carries this sub-batch. |

**Step 2:** `Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_PRE_AUDIT.md` at approved ref `7c65050f5ab377e21782cd96a9d3c1314fa82377`. Coltrane's 2026-11-25T09:49:44Z seed-replay amendment is recorded in P7 at B.

| Exact implementation ref | Deployment effect |
| --- | --- |
| A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` | Removes live reliance on the switch from the reader, active birth, boot and shared knob shape used by both shadow paths. The active crypto open requires exact `sided`. The switch row remains available during the Phase A cutover. |
| B `3282a856fe3cb8356702e5e00c8713139173429c` | Direct child of A. Checks the live process and switch under the deployment lock, deletes only the switch row, and enforces the exact three physical crypto rows at boot. |

The parent week remains **NO-RESULT, no stop trigger, operational hold discharged**, at `34fec1121b8127fc987ab85c837cf31e366169e7`. The retired DB name is `crypto_birth_sided_enabled`. The tracked-tree fence has positive controls for immutable historical occurrences and rejects an occurrence outside the frozen allowlist.

## A · Modified active birth and open

Before, the active birth's bypass could create a midpoint stamp in `server/services/signal-orchestrator.ts`.

```ts
if (!_cbKnobs.sidedEnabled) {
  if (levelGeometryStampOf(rawSignal.metadata) === null) {
    rawSignal = { ...rawSignal, metadata: { ...(rawSignal.metadata ?? {}), levelGeometry: 'mid' } };
  }
} else {
```

After, the existing quote-based build reaches the same rebase and persists its stamp. A refused build exits here, before grid or sizing.

```ts
if (!_cb.ok) return _cbRefuse(_cb.reason);
rawSignal = {
  ...rawSignal,
  entryPrice: _cb.entryPrice,
  stopPrice: _cb.stopPrice,
  targetPrice: _cb.targetPrice,
  metadata: { ...(rawSignal.metadata ?? {}), ..._cb.stamp },
};
```

The active open admission check in `server/services/active-execution-engine.ts` changes from `levelGeometryStampOf(signal.metadata) === null` to `!== 'sided'` for crypto. The diagnostic names the rejected value. Existing xStock, VTS and historical readers still decode midpoint geometry, and crypto P7 snapshots and birth-to-open stamp hops stay in place.

## B · New migration and modified boot

The transaction locks writes for the brief census, deletes the exact switch row and compares the complete retained rows before and after. The fresh-seed exception requires the original writer and the identical non-null seed timestamp across all four rows.

```sql
IF switch_row.value = '0'::jsonb AND (
  switch_row.updated_at IS NULL OR EXISTS (
    SELECT 1 FROM module_constants
     WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot'
       AND (updated_by IS DISTINCT FROM 'b-price-side-8c' OR updated_at IS DISTINCT FROM switch_row.updated_at)
  )
) THEN
  RAISE EXCEPTION '8c Phase B precondition: OFF row lacks matching original seed provenance';
END IF;
```

The boot verifier inspects raw rows after warmup. It counts rows even if the ordinary numeric resolver would hide them because they have other scopes or nonnumeric values.

```ts
const rows = getCachedModuleRowsForAssetClass(LEVEL_BASIS_MODULE, CRYPTO_KEY.assetClass);
if (rows.length !== REQUIRED_BOOT_ROWS.size) {
  throw new Error(`expected exactly ${REQUIRED_BOOT_ROWS.size} crypto_spot rows, found ${rows.length}`);
}
const remaining = new Map(REQUIRED_BOOT_ROWS);
for (const { constantName, value, exchange, strategy, regime } of rows) {
  if (!remaining.has(constantName) || value !== remaining.get(constantName)
    || exchange !== CRYPTO_KEY.exchange || strategy !== CRYPTO_KEY.strategy || regime !== CRYPTO_KEY.regime) {
    throw new Error(`unexpected name, dimensions or value for ${constantName}`);
  }
  remaining.delete(constantName);
}
```

## B revision 3 · Moved the staging prerequisite inside the deployment lock

Coltrane approved A and held B revision 2 (`87b780be815910c614907ba42f6587e84810c930`) in Discord `1575092604402409568`'s review thread. An external check could pass while a different governed deployment changes the process before this migration deletes the row. The old deployer proceeded from its dirty-worktree check directly to deployment notices and the checkout reset.

After that same dirty-worktree check, B revision 3 now reads the proposed target under the existing deploy lock. This excerpt shows the new decision point before any reset, build or migration.

```bash
B8C_TARGET=$(git ls-tree "$SHA" -- "drizzle/migrations/$B8C_MIGRATION") || fail "cannot inspect the target for the 8c migration"
if [ -n "$B8C_TARGET" ]; then
  B8C_SQL=$(git show "$SHA:$B8C_GATE_SQL") || fail "cannot read the target 8c deployment prerequisite"
  B8C_STATE=$(printf '%s\n' "$B8C_SQL" | "$STAGING_DB_READER") || fail "cannot read the 8c database prerequisite"
  case "$B8C_STATE" in
    PENDING_ON)
      [ "$(git rev-parse HEAD)" = "$B8C_PHASE_A" ] || fail "8c removal requires exact Phase A live before migration"
      node scripts/b8c-off-removal-verify-a.mjs "$B8C_PHASE_A" || fail "8c Phase A running-process proof failed"
      say "8c pending migration admitted: exact Phase A live and four-row switch ON gate passed"
      ;;
```

The SQL reads the row population and migration ledger in one statement through the installed, governed `dt-sql` reader. A pending migration requires zero ledger entries and the three exact retained rows plus the ON row. An already-applied migration requires one exact ledger entry and only the three retained rows. All remaining states, subprocess failures and missing evidence refuse. The already-applied branch allows normal later deploys, while earlier targets without the forward migration do not invoke this gate.

The root-owned `/usr/local/bin/dt-deploy` is installed separately from the checkout. Before shared promotion of B or any descendant, INFRA must install the reviewed bytes (`scripts/dt-deploy.sh` SHA-256 `8835871626b97951292081ff2b249a91f217a80886c678e3d029ae74221ecad6`) and verify the installed digest and rule-controlled ownership and mode. This is a prerequisite of this change. The A-phase deployment and a later retry both use the ordinary deployment and open-window checks.

## Proof and execution sequence

- Phase A focused tests passed 58/58 across five files. Phase B focused tests passed 111/111 across seven files, including the real birth and open entry points, exact boot population and existing hop checks. The TypeScript check found the same 314 known errors as the baseline, with no regression.
- Disposable PostgreSQL 15.20 passed 15/15 against the actual seed, forward, recovery and staging census files. The tests covered both allowed forward populations, state between the transaction and ledger write, recorded completion, invalid or mutated populations, drift during delete, restoration of the exact staging ON tuple and a duplicate ledger entry. The governed DB helper validator and all 30 of its mutation checks passed.
- The first B candidate `7f4ef0800` passed the complete empty-database replay of 227 manifest migrations in CI `45591698971`. The DB helper validator then rejected the fixture's independent connection. Revisions 2 and 3 reuse the approved pool and close each test session. Forward migration and rollback bytes are identical across the three candidates. Exact B revision 3 CI is `45595430916`.
- The Linux deployment sandbox passed 32/32 against the exact Git-index deployer bytes. Both the census and the verifier checked the actual deploy-lock SHA in the sandbox. Exact A and ON reached the migration command. An older running SHA with A on disk, OFF and a failed reader each retained the original HEAD and reached neither build nor migration. A recorded migration with the exact retained rows permitted a later deploy with a different running SHA.
- Phase A's process check compares git HEAD, built marker, deploy record and liveness to the same reviewed SHA. It also checks the running PM2 process and its timestamp relative to the bundle and deploy record. It rejects a wrong SHA and an older process serving the newer bundle file.
- Live B needs a positive Phase A process proof plus the exact four-row ON census, both under its own lock before reset. The governed staging reader returned `PENDING_ON` on 2026-11-25 before A was live. That is a positive control for the database half only.
- The preflight compared 227 recorded staging migration names with 226 forward filenames at A and 227 at B. The original 8c seed was present in both instruments. A had two pending migrations from other owners, for alert-orphan cleanup and universe refresh. B would add the 8c removal. Coordinate both pre-existing migrations and repeat the governed census immediately before any deploy.
- For recovery, return to exact A and prove it is live before reinserting the reviewed ON tuple. If the SQL and ledger are out of sync, settle the exact state under P7 before proceeding.

**REVIEWER: claim-only · identify the settling objects and other possible states for safe staging versus fresh replay · HIT: liveness rereads the bundle's disk stamp, the operator checks occur before the deploy lock, and the SQL transaction precedes the ledger write · re-derived y.** The staged old-reader positive control is the switch lookup at `e3a96a812:server/core/trading/level-build-config.ts:58`. Its pattern has no match in the three equivalent Phase A source files. The deployer's lock now spans the census, PM2 identity proof, build, migration and restart. The seed exception verifies row provenance. Because the runner records the ledger separately after the migration, a retry with three retained rows and no exact ledger entry stops for review.

**Review ask:** Regrade the exact B revision 3 against the Phase B blocker. Challenge whether any governed deploy can get from an older running SHA, OFF, failed proof or an inconsistent ledger to migration, and verify how the installed-deployer prerequisite closes the gate before shared promotion. A remains at the approved ref.

## Step 4 disposition

Coltrane: **PROCEED** on exact A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` at 10:19:14Z, and **BLOCKER-1 CLOSED / PROCEED** on exact B revision 3 `3282a856fe3cb8356702e5e00c8713139173429c` at 10:34:29Z (2026-11-25, dispatch `1575096609417592903`). He independently passed all 32 sandbox cases, verified B's direct A parent and reproduced the deployer digest. He requires all four jobs of exact B CI `45595430916` and verification of that digest with governed ownership and mode on staging before B is promoted to shared or deployed.

The producer-side mutation run independently rejected both suppressing the identity-verifier failure and sending the OFF result down the pending-ON branch. Staging still serves `e3a96a8126f0280a9568bb1823b9210783f0afe0`. The installed deployer at the preflight was root:root mode 0755 with SHA-256 `b60e42b1a93cf818e38af5cdc4eeee17ce27a209572a1c0458e34cd5e98928ec`, which differs from the required digest.

Staging coordination was dispatched to OLD, NEW and INFRA in Discord `1575096734860841062`. Another governed read reproduced both pending migrations at exact A. The same current register census found five open windows: B-RTB-PROMOTION-RETRY-STORM, B-TOKEN-WATCH-BIRTH-CAP, B-TOKEN-WATCH-FOLLOWUP-MEMORY, B-UNIVERSE-REFRESH-ACTS and B-XSTOCK-BAR-AVAILABILITY. Re-read the register and ledger immediately before both deployments and ask the owners about any impact. No staging deploy occurred during Step 4.

## Step 5 staging sequence

Exact B CI `45595430916` finished with TypeScript Check, Test Suite, Build and Docker Build all green. The Test Suite's fresh database migration, deploy sandbox and application tests passed. At the A-only integration candidate, the four affected local test files passed all 43 tests and the application and migration paths are byte-identical to exact A.

Integrate exact A as a parent of the shared branch first. A's application changes do not introduce the 8c migration. Keep B on its review refs until there is a permitted staging slot and exact A is live and proven. Publishing B earlier would cause ordinary deploy targets that inherit B to require exact A prematurely. Before publishing B check its four CI jobs, the installed deployer digest, the current staging identity, and the settled window and pending migration dispositions. B's locked gate still repeats its own checks at execution.

NEW confirmed the 2026-11-25T10:40:21Z HOLD on exact A while OLD's universe-refresh migration remains held. NEW can run its own reviewed rollback-row comparison and pre-counts immediately before a slot after 21:00 UTC, conditional on OLD clearing the hold and agreeing to fold in the alert-orphan migration. NEW owns the immediate orphan and total-count verification after that combined migration. Coordination is with PM (Discord `1575098895472795718`), OLD, NEW and INFRA.

INFRA installed the exact reviewed deployer on 2026-11-25 at 11:12:51Z (Discord `1575107040416899237`, evidence ref `4adf16fdb46f447af8fbcaa6a59a5ecd6c976414`). ANALYST read back root:root mode 0755 and the required SHA-256. The staging application HEAD, build marker and deploy record still identify `e3a96a8126f0280a9568bb1823b9210783f0afe0`, restart 715. The two app deployments remain separate from this completed installation. Recheck the installed digest immediately before publishing B.

The A-only shared integration `d3ec4a5d8d3da591dde466e68b1c6ed3a79e742a` passed all four jobs of CI `45605238768` as of 11:48:39 UTC on November 25. This completes Step 5 for Phase A. Phase B has its approved exact-ref CI and awaits shared integration after Phase A is proven on staging.

## Phase A staging slot

KD-120 discharged the inherited OLD migration hold. OLD, NEW, INFRA and ANALYST agreed to one Phase A deploy by ANALYST on 2026-11-26 from 02:30 to 02:55 UTC. The target is exact A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, with CI `45589022150` green per job. It is an ancestor of shared `d3ec4a5d8d3da591dde466e68b1c6ed3a79e742a` and a descendant of the serving ref. The A-only shared merge preserved the reviewed application and migration blobs. Use exact A because the Phase B lock verifies the running build against that exact SHA.

Read the current staging deploy record and B75 sweep for that date. Require its DONE line, the fresh pending census exactly matching the OLD universe-refresh and NEW alert-orphan migrations, and the current window census. Repeat NEW’s reviewed C-2 rollback comparison and orphan/total precount immediately before the deploy. The slot is usable only if the sweep, owner gates, preflight and restart fit. Name every open window returned by the immediate census. The planning census found B-RTB-PROMOTION-RETRY-STORM, B-TOKEN-WATCH-BIRTH-CAP, B-TOKEN-WATCH-FOLLOWUP-MEMORY, B-UNIVERSE-REFRESH-ACTS and B-XSTOCK-BAR-AVAILABILITY.

After the deploy, run the Phase A identity verifier and the reviewed four-row census, which must read `PENDING_ON`. Give INFRA the actual restart time for the Token Watch checks. NEW owns the immediate orphan and alert-total readback. OLD owns the first natural 03:00 UTC refresh and readback. Preserve the legacy B74 crontab entry and cache until OLD verifies the in-app run. Wait for OLD’s release before Phase B or another restart.

Coordination in Discord on November 25. OLD `1575113736723898369`, NEW `1575113776116662383`, ANALYST xStock window `1575114334424793119`, and INFRA `1575114755482583101`.

### Phase A Step 6 completed on November 26

- Today's B75 run `7e901415-112d-4a08-9a1a-064a1e65d18c` started at 02:15:02.502 UTC. Its matching DONE was visible before the 02:31:31 preflight. It examined and dropped five partitions with zero partition, plain-table or snapshot failures. The serving checkout, build, deploy record and liveness all identified `e3a96a812`, with one online process at restart 715 and the engine running. The checkout was clean and the installed deployer matched the reviewed digest and root:root 0755.
- The immediate shared register at `8fac59c95ae2453b6633a58693c5d9f7c212fa03`, blob `4f9a2091ac9a492bd47f63cc891ddd5dd0e7b3a5`, had exactly the five previously cleared windows above and no hold. The deploy named all five and recorded the window notice. Exact A CI was four of four green on run `45589022150`.
- The immediate read compared 226 reviewed Phase A forward files against 227 staging ledger entries. Only `2026-11-22-b-alert-orphan-rows.sql` and `2026-11-22-b-universe-refresh-acts.sql` were pending. Under NEW's read-only fallback `1575118494658461878`, C-2 compared the 12 returned rollback statements exactly after newline normalization, in order, against exact A's 12 tracked statements. Counts at 02:31:33.849 UTC were 5,936 alerts, 12 orphans and 3 users. NEW's expected immediate total is 5,924 with zero orphans.
- Governed deploy started at 02:31:43.859 UTC. It applied exactly the two pending migrations above in 951 ms. Actual process restart was **02:32:06.222 UTC**, PID 235604, restart 716. The successful deploy record at **02:32:16 UTC** names exact A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, actor claim `codex-c`, and engine resumed. The contiguous health-check failure window was 13 seconds.
- The committed identity verifier passed with exact A and refused the deliberately wrong e3 SHA. Staging checkout was clean. The reviewed B census returned `PENDING_ON`, proving the exact four crypto rows including the ON switch and zero Phase B migration ledger entries. This is the Phase A cutover proof.
- Sent the deploy, actual restart time and exact pre-counts to OLD, NEW, INFRA and PM via `1575338499127640085`. NEW owns its post-readback. OLD owns the natural 03:00 UTC refresh and the explicit release before any second restart. Phase B awaits that release and its separate staging and shared CI gates. The ongoing xStock incident remains an event wait. At 02:33:07 UTC the first sampled new-generation minute contained 469 snapshot frames and zero update frames, so Phase A supplies no evidence of exit-pricing recovery.

### Original NEW preflight capture and retention limit

Original stdout from the November 26 immediate preflight (execution chunk `1e1bfc`, exit 0):

```jsonl
{"phase": "immediate", "read_utc": "2026-11-26T02:31:30.293057+00:00", "manifest": 226, "ledger": 227, "pending": ["2026-11-22-b-alert-orphan-rows.sql", "2026-11-22-b-universe-refresh-acts.sql"]}
{"phase": "immediate", "c2_tracked": 12, "c2_live": 12, "c2_match": true}
{"phase": "immediate", "total": 5936, "orphans": 12, "users": 3, "post_expected_total": 5924, "at_utc": "2026-11-26T02:31:33.848808+00:00"}
```

On exact A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, C-2 read the generator from the header of `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql`, blob `eca6c17dec44a63df2687a57872971e9ef0dc5b3`. Through `dt-sql --csv` it checked the `format` header and one field per row, normalized CRLF to LF, and compared the ordered returned statements to the twelve checked-in inserts in that blob. The aggregate read checked the `total,orphans,users` CSV shape and required that the orphan count equal the tracked statement count, with linked alerts and users present.

The three lines are the complete retained output. The original SQL responses were consumed in the preflight process and discarded on exit. The tracked rollback blob supplies the expected generator and inserts for comparison. The original twelve live generator rows and the raw aggregate CSV are unavailable. This is the evidence supplied to NEW for Coltrane's 03:07:48 UTC Step 8 ruling.

At 03:11:33 UTC Coltrane retained the restart fence on the serving Phase A process, restart 716. OLD owns the remaining exact symbol-set and subscription transition proof, and must explicitly release the fence. Phase B still awaits that release.

### Conditional return to exact Phase A after the OLD diagnostic

Coltrane at 03:47:56 UTC on November 26 approved diagnostic implementation at `e1f465169504b61a0c7af7690dd17e6889c52d61` only. Step 7, restart 716, Phase B, Entry Gate D and P10 remain held. The following is the ANALYST return proposal for OLD and Coltrane to review before any restart.

1. Fix the exact diagnostic cutoff on literal A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`. Require an independently reviewed diagnostic-only diff, four green CI jobs at the exact cutoff, and a shared-reachable deploy target. Verify both forward manifests and every migration blob match A and that the diagnostic has no migration, 8c removal, or persistent application state change introduced by its instrumentation. Keep B and unrelated runtime changes off that target. Exact A is already shared-reachable and CI `45589022150` is green in all four jobs.
2. OLD owns the diagnostic rollout and natural readback. Before leaving 716, require a separate explicit ruling allowing the later natural occurrence to substitute for November 26 OBJ-1 evidence, and NEW and INFRA agreement on the diagnostic and exact-A return windows, including the failure-return trigger. At each restart re-read the current protected-window register, obtain the required owner clearances, wait for same-day B75 DONE, verify the installed reviewed deployer, and repeat the exact target migration census. Name all currently open windows through the governed deploy path. The current A read has 226 manifest entries, all present among 229 ledger entries, including one entry each for the orphan cleanup and universe refresh. A pending migration or ledger drift stops the return for review.
3. OLD records the diagnostic's governing SHA, process and occurrence, complete before and settled symbol sets, and per-channel evidence. Before a planned return, preserve and have OLD and Coltrane disposition the complete result while the diagnostic data still exists. The pass requires a terminal natural apply with actual adds and drops, both set differences empty against the expected symbols after pins and bounded drops, and the distinct ticker and OHLC receipts or valid drop-closure evidence specified by Coltrane. A no-op, timeout, rejection, missing channel or wrong-generation receipt keeps OBJ-1 open. A separately authorized recovery return can restore A while that gate stays open.
4. ANALYST performs the return by the ordinary governed deploy with the literal A SHA and `--by codex-c`. The deployer admits a reviewed target reachable from shared, including the previous A cutoff. The Phase B locked prerequisite is invoked only when the target contains its removal migration, which A lacks. On return verify a new deploy record, a clean checkout, exact SHA in build and liveness, resumed engine, and a new online process through `scripts/b8c-off-removal-verify-a.mjs`. Re-run the governed four-row census and require `PENDING_ON` and no migration-ledger change. Share the actual process and restart time with OLD, NEW, INFRA and PM. Phase A boot recomputes its universe and held-symbol pins, so check the returned recorder's boot and subscription health. The saved exact-set proof applies to the diagnostic occurrence and process.
5. Leave Phase B gated until OLD explicitly releases after the reviewed readback and the exact-A return proof. Only then recheck B's own exact CI, installed deployer, current window dispositions, pending ledger and permitted slot. A failed A identity or four-row check, or missing OLD release, leaves B on its review ref.

**Coltrane APPROVED the return plan only, 04:21:07 UTC, November 26.** Exact reviewed plan `9f2f7e88ef89e138ed7c24b7133d5f58c73792c8`, read with OLD's `e1f465169504b61a0c7af7690dd17e6889c52d61`. He reproduced the deployer digest and passed 33/33 sandbox cases, including return to an older shared ancestor. The approval carries these execution requirements:

- Compare exact manifest and governed ledger by name immediately before both legs. Keep migration and ledger changes out of each agreed slot through deploy completion, retain the deployer's zero-pending output and compare the ledger afterward. The review's equal-count mutation replaced either of the two newly applied names while retaining 229 ledger rows and caused a migration to run.
- Export the raw before, settled and expected sets, pins and bounded drops, and distinct ticker/OHLC receipts and drop-closure records to an independently readable durable ref. Stamp SHA, PID, process start, read times and occurrence identity. OLD and Coltrane must read back and disposition the artifact before the planned return while that process is still live.
- Agree the timeout or failure trigger and its authorizer before leaving 716. A separately authorized recovery return can restore literal A with OBJ-1 open. Preserve available evidence and record gaps before the restart. Reapply the same gates and verify exact A, the new process, `PENDING_ON`, and recorder boot and subscription health after either return. The eventual B target must exclude the temporary diagnostic and pass its own exact CI and slot checks. It still requires reviewed OBJ-1 proof and OLD's explicit release.

The diagnostic cutoff and later occurrence substitution require separate approval. Restart 716, Step 7, Phase B, Entry Gate D and P10 remain held.
