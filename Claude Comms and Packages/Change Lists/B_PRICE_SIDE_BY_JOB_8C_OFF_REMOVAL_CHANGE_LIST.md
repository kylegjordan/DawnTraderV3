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
| B `87b780be815910c614907ba42f6587e84810c930` | Direct child of A. Deletes only the switch row and enforces the exact three physical crypto rows at boot. Keeps all three original values and settings. |

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

## Proof and execution sequence

- Phase A focused tests passed 58/58 across five files. Phase B focused tests passed 111/111 across seven files, including the real birth and open entry points, exact boot population and existing hop checks. The TypeScript check found the same 314 known errors as the baseline, with no regression.
- Disposable PostgreSQL 15.20 passed 14/14 against the actual seed, forward, recovery and staging census files. The tests exercised both accepted row populations, rejected the fresh seed at the live gate, rejected invalid or mutated SQL populations, caught drift during delete and restored the exact staging ON tuple.
- The first B candidate `7f4ef0800` passed the complete empty-database replay of 227 manifest migrations in CI `45591698971`. The repository's DB helper validator rejected the test's own database connection. The revised B reuses the approved pool and closes each test session after use. Its only changed file versus that candidate is the integration test. All 14 PostgreSQL cases and the validator with its 30 checks passed locally after the change. Exact B CI is `45592810045`.
- Phase A's process check compares git HEAD, built marker, deploy record and liveness to the same reviewed SHA. It also checks the running PM2 process and its timestamp relative to the bundle and deploy record. It rejects a wrong SHA and an older process serving the newer bundle file.
- Live B needs a positive Phase A process proof plus the exact four-row ON census. The four-row staging result on 2026-11-25, recorded before A was live, is a positive control for the census.
- The preflight compared 227 recorded staging migration names with 226 forward filenames at A and 227 at B. The original 8c seed was present in both instruments. A had two pending migrations from other owners, for alert-orphan cleanup and universe refresh. B would add the 8c removal. Coordinate both pre-existing migrations and repeat the governed census immediately before any deploy.
- For recovery, return to exact A and prove it is live before reinserting the reviewed ON tuple. If the SQL and ledger are out of sync, settle the exact state under P7 before proceeding.

**REVIEWER: claim-only · identify the settling objects and other possible states for safe staging versus fresh replay · HIT: liveness rereads the bundle's disk stamp, the operator checks occur before the deploy lock, and the SQL transaction precedes the ledger write · re-derived y.** At B, `server/routes/health.ts:42-47` reads the disk marker, `scripts/dt-deploy.sh:195-196,351-363` acquires its own lock and migrates before restart, and `scripts/db-migrate.ts:192-195` writes the migration record separately. The staged old-reader positive control is the switch lookup at `e3a96a812:server/core/trading/level-build-config.ts:58`. Its pattern has no match in the three equivalent Phase A source files. The deploy proof requires both PM2 identity and the ON census, and an uninterrupted staging slot spanning those checks and B's deploy. Recheck both on any intervening deploy or restart. The seed exception verifies row provenance. The live gate relies on staging's separate ON census.

**Review ask:** Grade the two-ref code cutover at these exact SHAs. Challenge whether a live reader can still require the row, whether an invalid live or replay population can reach deletion, and whether any active crypto midpoint stamp can reach execution while the other lanes retain their semantics. Assess the operator handoff between the external verifier and the deployer's lock explicitly.
