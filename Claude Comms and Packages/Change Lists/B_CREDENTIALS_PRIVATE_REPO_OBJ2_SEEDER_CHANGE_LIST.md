# B-CREDENTIALS-PRIVATE-REPO OBJ-2 / P6 — startup seeder retirement

**Scope:** `#1023`, OBJ-2, approved pre-audit §2.3 items 3–4 and Group E/E8–E9. This increment retires the startup seeder and changes the backend validator and both active Playwright specs to use an existing configured test account. The other OBJ-2 live files, scan and legacy-script/archive decisions stay open.

**Declared change-class:** `non_architecture`.

| Required document | Status |
|---|---|
| Scope | Present at `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md`. |
| Pre-audit | Present at `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md`, §2.3 item 4 and Group E/E8. This is the Step 2 reference. |
| Completion report | Absent at Step 4. The active parent report is `Claude Comms and Packages/Batch Completion/B_CREDENTIALS_PRIVATE_REPO_PROGRESS_REPORT.md`. |
| Batch Catalog | Present at `1-system-manual/BATCH_CATALOG.md`. Parent row is due at close. |
| Phase History | Present at `1-system-manual/PHASE_HISTORY.md`. Parent entry is due at close. |

## Step 3 — Implementation

- Removed the non-production startup step that created a test account or reset its password from a built-in default. The code had one caller in `server/index.ts`. The startup steps on either side, including rate-limiter reset and permission-cache initialization, remain wired.
- The direct-reference search covered server, client, shared, scripts, e2e, tests, CI and skills. The parent has two matching files, the startup caller and the seeder. The candidate has no active source match.
- The standalone backend validator and the Config Snapshot browser test use the same environment settings the seeder previously used. They now require credentials for an existing test account before making an authentication attempt. Config Snapshot still requires admin access. Backend validation stops if authentication produces no token, before later validation can act on the app.
- The retired source is preserved in the Rule 18 archive with the historical password fallback redacted. The redaction check matched exactly once in the baseline blob and verified its absence from the archival copy. Git retains the pre-removal source for provenance.
- The removal leaves existing accounts and account data in place. It removes the automatic non-production password change on future starts.
- The production server bundle succeeded. Its list of 570 source inputs included the neighboring rate-limiter reset module and excluded the seeder.
- Four isolated backend validation checks passed: both values absent, each value absent separately, and a supplied synthetic pair refused at login. Missing input reached neither the network nor report creation. The refused pair reached only the login request and exited with failure.
- Four isolated Config Snapshot checks passed. Missing inputs stopped before browser navigation. A supplied synthetic pair reached the existing login fields and settings navigation.

`REVIEWER: claim-only · Could a supported caller depend on the startup seeder even without importing it? · Backend validator shares the environment-based account; explicit configuration previously could provision or synchronize it · re-derived y`. The shared inputs also appear in Config Snapshot. Both entry points now state and validate the existing-account requirement. Changing the environment password no longer rotates a test account on startup.

**MODIFIED `server/index.ts` — before**

```ts
  const { resetRateLimiter } = await import('./startup/rate-limiter-reset');
  await resetRateLimiter();

  // Seed test user for automated testing (non-production only)
  const { seedTestUser } = await import('./startup/test-user-seeder');
  await seedTestUser();

  // Phase 27.3: Initialize Permission Cache
  const { permissionCache } = await import('./services/permission-cache');
  await permissionCache.initialize();
```

**After**

```ts
  const { resetRateLimiter } = await import('./startup/rate-limiter-reset');
  await resetRateLimiter();

  // Phase 27.3: Initialize Permission Cache
  const { permissionCache } = await import('./services/permission-cache');
  await permissionCache.initialize();
```

**DELETED `server/startup/test-user-seeder.ts`** — the removed module either updated the matched test user or created one. The archived source preserves the old behavior apart from the redacted default.

**MODIFIED test entry points** — before, both tried a built-in fallback when their credentials were missing. The archived and removed credential values are deliberately omitted from this review record. The backend validator now validates its inputs outside the run, then checks the authentication outcome before any later test phase:

```ts
const login = {
  username: process.env.TEST_USER_EMAIL,
  password: process.env.TEST_USER_PASSWORD,
};

if (!login.username || !login.password) {
  throw new Error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD for an existing test account before running backend validation.');
}
```

The browser test applies the equivalent guard before navigation, with the existing admin requirement.

**Review focus:** inspect the source ancestry and sole-caller removal, compare the production bundle inputs against the neighboring startup positive control, and verify the redacted archival copy without printing the historical fallback. The wider OBJ-2 credential scan is a separate acceptance condition.

## Step 4 — Coltrane's send-back and the correction

Coltrane sent back `9169bcd1a84dcb2547ef6258616337504e099f49` at 2026-11-26 11:07:43 UTC. He independently confirmed the startup removal, archive redaction and eight isolated checks. His login comparison identified the Phase 41F-L browser spec as a remaining caller because it still sent the previous pair. The pre-audit Group E allows this spec to be made environment-required.

**MODIFIED `e2e/phase-41F-L-e2e-validate-flow.spec.ts`.** Replaced the fixed login pair with the existing-account requirement before browser navigation. The lineage label now uses the configured identity, and the stale credential comment was removed.

```ts
    const { TEST_USER_EMAIL: username, TEST_USER_PASSWORD: password } = process.env;
    if (!username || !password) {
      throw new Error('Set TEST_USER_EMAIL and TEST_USER_PASSWORD for an existing test account.');
    }
```

Four isolated Phase 41F-L cases passed. Each missing-input case stopped before navigation. The supplied synthetic pair reached the two login fields and submit action. The test harness stopped at the end of login, before the remaining stages. No browser or server was accessed. The full increment has 12 isolated cases across its three test entry points.

**Staging:** this increment is a source review only. Apply the existing staging windows and release gates when a later install is approved. System Manual references belong to the OBJ-2 governance step.
