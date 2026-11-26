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

## Independent OBJ-2/P6 increment: P7a price-side baseline

**Scope and Step 2:** B-CREDENTIALS-PRIVATE-REPO, non_architecture. The same Scope, Pre-audit, Batch Catalog and Phase History rows above apply. The completion report is due at parent close. The Step 2 reference for this increment is the approved pre-audit section 2.3 item 3 and Group E/E5, which names the P7a helper.

### P7a implementation

The original helper performed one login using a retired pair, then read the loopback metrics snapshot five times. The route is registered at `server/routes.ts:511` and mounted at `server/index.ts:477-480`. Its existing observation logger uses the same GET without supplying authorization (`server/scripts/phase7-observation-logger.ts:8-9,29-33`). The P7a helper now uses that loopback GET directly. The route and its middleware are unchanged. The Group E reader listed dt-api or required environment input for authenticated reads. At this route, the narrower loopback GET avoids an unnecessary login entirely. Step 4 is asked to rule on that choice.

**MODIFIED `scripts/analysis/b_price_side_p7a_baseline.sh`:** The explicit login and caller-held token are gone. The existing log reads, lag output and five samples spaced ten seconds apart are preserved. A failed request exits before parsing or labelling a sample. Malformed JSON or a response missing the requested lag exits without echoing the body or printing a sample marker.

```bash
for i in 1 2 3 4 5; do
  snapshot=$(curl --fail --silent --show-error --noproxy localhost http://localhost:5000/api/metrics/snapshot) || exit $?
  printf '%s' "$snapshot" | python3 -c '
  # The existing lag formatter consumes the JSON from stdin.
```

Git Bash syntax passed. The isolated shell run replaced the log file path and stubbed curl and sleep. Success produced five exact GETs, five timestamped samples and both expected lag fields per sample. Injected HTTP failure, malformed JSON, and a valid response missing the lag field each stopped on the first request with no sample. A planted login call was caught before it could reach a server. The historical-value check found one match in the baseline helper and none in the candidate helper without printing the value. This is source verification with no staging run, app deploy or restart.

`REVIEWER: claim-only | Can the existing endpoint and supported caller preserve genuine samples without a login? | Found that an empty JSON object could look like a completed sample if counted by timestamp alone | re-derived y`. The amended fixture requires the existing route's eventLoopLag field and verifies actual lag values as well as markers.

### P7a Step 4 correction: bypass proxy for loopback

Coltrane accepted the credential-free GET and sent back `cd3fe914576a85ab12a96da3e05c54875fc737a2` at 2026-11-26 12:31:10 UTC. curl can send a localhost URL through an inherited HTTP proxy. The sampler now explicitly bypasses proxies for localhost.

Real curl against two isolated loopback listeners: without a proxy, the prior script made 5 direct requests and measured lag 19. With the fixture proxy enabled, the prior script made 0 direct and 5 proxy requests and measured the proxy's lag 57. The corrected script made 5 direct and 0 proxy requests and measured lag 19 with the proxy enabled and with it absent. The fixture substituted only the local port and log path and skipped sleep. Neither server received an Authorization header. The HTTP, malformed JSON, missing lag and planted-login controls were also rerun.

### P7a Step 4 approval

Coltrane approved `71671b3952ea762e55f16ad9f322529130e63458` on base `879108a572cf622bb9acb09d91f61d8e02703882` for shared placement only at 2026-11-26 12:36:13 UTC. His independent local two-listener control reproduced the proxy diversion at the prior ref and five correct loopback samples at the candidate with either proxy setting. HTTP 503, malformed JSON and missing lag each ended after one read with no sample. Step 5 will verify the shared branch run. Seeder Step 6, staging and installation stay held.

### P7a placement confirmation

At 2026-11-26 12:52:30 UTC COLTRANE confirmed exact rebased candidate `ac8afdd5a20f69fa7d2b1c97f134ba6540af8572` on `28036b4f997cc371fc25f5a7b5155a103aec2c53`, subject to four green jobs on that base. NEW's intervening commit changed only its own memory and silent-strategy progress report. The three changed paths, modes and before/after blobs match the approval at `71671b3952ea762e55f16ad9f322529130e63458`.

An equally bounded documentation-only advance may carry the same approval following current ancestry and overlap checks, complete exact diff equality, and four green shared-base jobs before a fast-forward push. Any changed code, overlapping path, changed evidence or non-green result returns to Coltrane. Step 5 grades the resulting shared SHA per job.

### P7a Step 5 shared CI

The exact confirmed P7a placement `ac8afdd5a20f69fa7d2b1c97f134ba6540af8572` landed from base `28036b4f997cc371fc25f5a7b5155a103aec2c53` after base run `45823250551` passed all four jobs and the complete placement diff matched the approved paths, modes and blobs. [Shared CI run 45825696290](https://github.com/kylegjordan/DawnTraderV3/actions/runs/45825696290) then passed TypeScript Check, Test Suite, Build and Docker Build at the exact placement. Return to the held P6 Step 6 staging boundary at clearance. The two November 27 Token Watch reads remain scheduled.

## Independent OBJ-2/P6 increment - Phase 3C API benchmark

**Scope and Step 2.** B-CREDENTIALS-PRIVATE-REPO, non_architecture. The same Scope, Pre-audit, Batch Catalog and Phase History rows above apply. The completion report is due at parent close. The approved Pre-audit section 2.3 item 3 and Appendix A Group E/E5 name this benchmark in the live credential cleanup. The preceding AMR audit is already governed by the B-DB-HELPER-RETIRE change at `40d06d366`.

**Implementation.** The benchmark keeps its existing `USERNAME` and `PASSWORD` inputs and requires both before any HTTP request. Its sign-in route accepts a username or email. The benchmark accepts both existing token response fields and preserves their original preference. The trading-status and portfolio-overview reads use authenticated handlers. The benchmark keeps the same ten requests, order, CSV columns and 120 ms average threshold. Authentication failures leave any previous CSV intact and print a short error. The sign-in JSON and authorization header go to curl on stdin. The benchmark discards response bodies because its output uses only timing and status.

Before, with the two historical fallback values omitted from the review record:

```bash
BASE_URL="${BASE_URL:-http://localhost:5000}"
USERNAME="${USERNAME:-[omitted]}"
PASSWORD="${PASSWORD:-[omitted]}"
OUTPUT_FILE="logs/phase3c-api-latency.csv"

# Clear previous results
> "$OUTPUT_FILE"
echo "endpoint,time_total_ms,http_code" >> "$OUTPUT_FILE"
```

After:

```bash
set -e -o pipefail

: "${USERNAME:?Set USERNAME for the benchmark account}"
: "${PASSWORD:?Set PASSWORD for the benchmark account}"

# ...

if ! TOKEN=$(
  jq -cn '{username: env.USERNAME, password: env.PASSWORD}' |
    curl -fsS --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/auth/login" |
    jq -ers 'select(length == 1) | .[0] | (.accessToken // .token) | strings |
             select(length > 0 and (test("[\r\n]") | not))' 2>/dev/null
); then
  echo "❌ Authentication failed" >&2
  exit 1
fi
```

**Local verification.** Bash syntax passed. A local HTTP fixture drove the script with real curl and jq and a synthetic password containing quotes, a backslash and a line break. Each of the three success cases received the exact sign-in JSON and all ten benchmark requests in order, each with the correct authorization header. The cases were token only, accessToken only and both fields with distinct values. All ten CSV rows per case retained their HTTP status and timing, including the planted HTTP 503 on the last read. Both missing-setting cases made zero requests and preserved the previous CSV. All nine rejected sign-in cases stopped after one attempt and preserved the previous CSV. The controls were HTTP 401, HTTP 503 with an otherwise valid token, invalid JSON, missing token, null token, empty token, numeric token, a line break in the token and duplicate JSON responses. The curl-argument guard and captured output kept the synthetic sign-in values and response body out of both surfaces. The baseline fallbacks are absent from the candidate script.

REVIEWER: claim-only · supplied caller sign-in and benchmark contract · HIT — the initial candidate lost the accessToken-only response · re-derived y, both previous names and their priority preserved.

**Step 4 question.** Check the caller contract, the sign-in boundary and the unchanged benchmark result contract at the exact ref. The review scope is the Phase 3C source and its record. P6/P7a Step 6 waits for staging clearance. Both November 27 Token Watch reads stay armed.

### Phase 3C Step 4 corrections

Coltrane returned CHANGES NEEDED at 2026-11-26 14:11:50 UTC on `59a284498fc461b570febdec7098160f86de783e`. The first candidate accepted an HTTP 302 with a token, a token string equal to `null` and a NUL-only token. It also let curl read a local config that could turn on request tracing.

The corrected login requires a 2xx status, one JSON body and a nonempty token without control characters or the old `null` sentinel. The two existing token field names and their preference still apply. Both curl commands put `-q` first to skip curl configuration files. The benchmark disables shell tracing before reading credential settings.

```bash
# Keep credentials out of shell traces.
set +x
set -e -o pipefail

# ...

jq -cn '{username: env.USERNAME, password: env.PASSWORD}' |
  curl -q -fsS --header 'Content-Type: application/json' --data-binary @- \
    --write-out '\n%{http_code}' "$BASE_URL/api/auth/login" |
  jq -eRrs '
    select(.[-4:-3] == "\n" and (.[-3:] | test("^2[0-9]{2}$")))
    | .[:-4] | fromjson | (.accessToken // .token) | strings
    | select(length > 0 and . != "null" and (test("[[:cntrl:]]") | not))
  ' 2>/dev/null
```

A local fixture with real curl and jq reproduced all three bad acceptances on the first candidate. A planted curl config produced a trace on that candidate, and Bash tracing displayed synthetic credential and token values. On the correction, four successful login field cases each produced ten authenticated reads and ten ordered CSV rows. A separate login round-tripped a synthetic credential with quotes, a backslash and a line break. Four missing or empty setting cases made zero requests. Twelve rejected responses made only the sign-in attempt. All sixteen refusal cases preserved the prior CSV. The corrected runs created no curl trace and exposed no fixture values in the shell trace, normal output or curl arguments. Bash syntax passed.

Re-review is for exact source placement. P6/P7a Step 6 and the two November 27 Token Watch reads remain recorded.
