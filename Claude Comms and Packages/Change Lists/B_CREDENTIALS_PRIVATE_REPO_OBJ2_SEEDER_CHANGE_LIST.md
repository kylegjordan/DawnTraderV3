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

### Step 4 follow-up — credential-bearing Playwright artifacts

At 11:15:07 UTC Coltrane confirmed the corrected login inputs and found that Playwright captures the configured password in traces. The shared config now uses the terminal list reporter, with traces, screenshots and video off. The generated Phase 41F-L trace was removed from the current tree and both Playwright output folders are ignored. The historical trace is retained by Git history. The historical value matches the September 28 rotation record in scope OBJ-0 and was rejected after rotation. The comparison used existing records and printed no credential value.

**MODIFIED Playwright recording policy**

```ts
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5000',
    // These tests submit configured account credentials.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
```

Playwright 1.56.1 ran the Config Snapshot Developer-tab check and the Phase 41F-L login against a loopback login fixture with a fresh synthetic password. The Phase 41F-L copy stopped after login, before later stages. The trace-and-HTML control authenticated both tests and found the password in four members of each trace attachment and in both tests' embedded HTML report data. The HTML-only control also authenticated both tests and reproduced both embedded report hits with zero trace ZIPs. The candidate authenticated both tests and scanned all three generated files, including the Phase 41F-L reports, with no password hits, trace, image, video or HTML report. Both intentional missing-login-field failures also kept the synthetic password out of terminal output and all five generated files. These runs used the repository config with the browser executable and temporary output location supplied by the local fixture.

### Step 4 follow-up — a disabled password input

Coltrane sent back `d294aa2684815772e09329ec7cab367a8337edc4` at 11:26:00 UTC. The prior artifact correction still printed the password in the list reporter when the field existed but was disabled. Both specs now replace an exception from that password-field action with a fixed-text failure.

```ts
    try {
      await page.getByTestId('input-password').fill(password);
    } catch {
      throw new Error('The login password field did not accept input.');
    }
```

The loopback control used both unchanged specs from `d294aa268` with a disabled input: two failed tests, two terminal password hits and no login submits. With the correction, both tests still failed, both printed the fixed message, and the terminal plus all five generated files had zero hits for the synthetic password. Both normal fixture logins also passed again, with zero hits across terminal output and all three generated files. The successful Phase 41F-L fixture stopped after login.

**Staging:** this increment is a source review only. Apply the existing staging windows and release gates when a later install is approved. System Manual references belong to the OBJ-2 governance step.

### Step 4 approval

At 2026-11-26 11:31:39 UTC, Coltrane approved `cdcac173f3366430c6f010e9c11159499e1506eb` for shared-branch placement only. His independent Playwright 1.56.1 loopback checks reproduced the synthetic password in two prior disabled-field runs. At the approved ref both disabled-field runs failed with the fixed message before any login submit. Neither terminal log nor any of the six generated files contained the synthetic password. His two successful fixture logins also produced no password hits in either terminal log or any of the four generated files. Phase 41F-L stopped after login. He also checked the seeder removal, archive redaction, tracked trace removal and Step 2 reference.

The approved source landed unchanged on `migration/aws-supabase`. The staging and installation holds still apply.

### Step 5 shared CI

Shared branch run [45811996599](https://github.com/kylegjordan/DawnTraderV3/actions/runs/45811996599) passed all four jobs at `cdcac173f3366430c6f010e9c11159499e1506eb`: TypeScript Check, Test Suite, Build and Docker Build. OBJ-2 remains open beyond this increment. Step 6 waits for staging clearance. The Token Watch observation times and Token Economy install gates remain in force.
