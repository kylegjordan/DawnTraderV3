# B-CREDENTIALS-PRIVATE-REPO — deployer source reconciliation

**Owner:** INFRA Codex (`codex-infra`) · **Parent:** `#1023` · **Alert:** `7953f97f-976d-49d9-a05e-9e37e594535a` · **Declared change class:** `non_architecture`.

**Step 2 reference:** `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md`, the installed-source drift contract. The exact deployer gate was separately reviewed with `3282a856fe3cb8356702e5e00c8713139173429c`. The installation receipt is `4adf16fdb46f447af8fbcaa6a59a5ecd6c976414`. This increment reviews source placement of those identical, already installed bytes.

| Document | State for this increment |
| --- | --- |
| Scope | Present in `B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` |
| Pre-audit | Present in `B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` |
| Change list | Present in this file |
| Completion report | Pending parent Step 11. `B_CREDENTIALS_PRIVATE_REPO_PROGRESS_REPORT.md` is present |
| `BATCH_CATALOG.md` and `PHASE_HISTORY.md` | Parent entries due at close |
| `PHASE_19_PLAN.md` | Parent ledger judgement due at Step 10 |
| Shared and own memory | Present. Record the disposition in the own POSITION block at the step boundary |
| Four session task lists | Pending parent close |
| Langston memory | Present for parent OBJ-4a. No update for this staging source placement |
| Observation | N/A to this increment. Read the checker on its normal path after the pin update |
| `SYSTEM_IMPACT_MAP.md` | Parent tooling entry present. Reconcile its source reference at verification if applicable |
| `SYSTEM_MANUAL.md` and `CHANGES_AND_FIXES.md` | N/A. Trading rules and behavior are outside this increment |
| `RUNNING_ISSUES.md` and `SPRINT_TO_LIVE_PLAN.md` | Parent `#1023` and placement present |
| `MISTAKE_PATTERNS.md` and `DELETED_COMPONENTS_LOG.md` | N/A to this increment |
| `LANGSTON_ARCHITECTURE.md` | Parent read-path documentation present. The staging checker source contract is unchanged |
| `CLAUDE.md` and workflow files | N/A. Existing shared-source and deployment rules govern |

## Evidence and diff

At 05:16:59 UTC on November 26 the staging checker reported one problem, a deployer mismatch. Its effective per-file pin is `7429799c94ff34e1afac6269659331771ee6606e`, which supplies blob `b97f968549cd5b8de353bf9a3e8d0bd1ba3a02cf`. The root-owned installed file is mode `0755`, 29,505 bytes, and matches reviewed blob `9c4a1e191654045ed6a0771ca3d9670ee57e9f18` with SHA-256 `8835871626b97951292081ff2b249a91f217a80886c678e3d029ae74221ecad6`. The checker requires its source commit to be on the shared branch. Phase B itself is fenced and stays outside this change.

**`scripts/dt-deploy.sh` — MODIFIED.** Previously the ordinary deploy path ran after the dirty-check. The already-installed version adds this guarded branch before checkout or restart. The remaining cases handle already applied and inconsistent migration evidence. The code in this commit is byte-identical to `3282a856f:scripts/dt-deploy.sh`.

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

The diagnostic `8f97c294ed705fab920245762183632eec7bad71` and literal Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016` have no Phase B forward migration at the exact path. `3282a856f` contains it as a positive control. The original Linux sandbox from that reviewed ref passed 32/32 against the lifted script's SHA-256, using separate mock checkout, npm, process manager and database reader. The staging application's readback remained literal Phase A on restart 716, PID 235604.

**`scripts/db-helper-retire/surface-baseline.json` and `scripts/db-helper-retire/typed-exclusions.json` — MODIFIED.** Carry the two exact deployer rows already reviewed at `3282a856f`: one `dt_sql` marker and a `governed_dt_sql_consumer` classification. The connection-surface validator rejected the script-only candidate on the unclassified new path. It passed with these rows, classifying all 99 current marker paths. These rows describe the deployed read-only dependency and do not add executable code.

REVIEWER: claim-only · does the exact deployer source alone reconcile without rollout or Phase B placement? · HIT: the database-helper surface gate also requires the two existing reviewed deployer rows · re-derived y with the failed script-only validator.

### Step 4 SEND BACK carry, 2026-11-26 06:29:19 UTC

The candidate now descends from shared `a69222dc9d79dbd62d5abb07b88b559a4e3ff087`, which preserves the intervening KD-34 return and recovery record. The installed deployer blob is unchanged.

**`scripts/test-dt-deploy-windows.py` — MODIFIED.** The existing sandbox replaces the entire constants block and asserts that it replaced every constant. Extend the fixture mapping to cover the two constants the reviewed deployer added:

```diff
 consts = {"APP_DIR": app, "LOCK_DIR": T + "/lock", "RECORD": T + "/record", "BRANCH": "origin/migration/aws-supabase",
           "REGISTER_PATH": "1-system-manual/DEPLOY_WINDOWS.jsonl", "OBS_WINDOWS": obs, "NOTICE": T + "/notice",
-          "MINT_TIMEOUT_S": "1"}
+          "MINT_TIMEOUT_S": "1", "STAGING_DB_READER": fake + "/reader", "B8C_PHASE_A": BASE}
 shipped = [ln.split("=", 1)[0] for ln in src[a:b].splitlines() if "=" in ln and not ln.startswith("#")]
 check("the harness sets exactly the shipped constants", set(shipped) == set(consts), shipped)
```

The reader path stays within the fixture and fails closed if the ordinary-path suite tries to use it. With the same reviewed deployer bytes, the Linux scratch run reproduced 26/27 on the original shared harness and passed 27/27 with the two constants mapped. The exact Phase B sandbox's 32/32 also covers the extra Phase B fixture cases.

## Review and verification

Review whether putting the exact deployer blob, its two classification rows and its sandbox compatibility update on the shared branch gives the manifest a valid source while preserving the diagnostic and the literal Phase A return arrangement. Verify that the review commit adds neither the migration, its SQL and verifier, nor an ancestry link to the Phase B commit. The deploy script is the only production executable change in the increment.

After approval and green exact CI, land the script source separately. Read the installed digest, owner and mode and the checker's shared ancestor and blob before updating the per-file pin. Record the previous manifest and preserve its other entries. Read back a fresh successful checker run that names the exact file and pin, then resolve the alert with evidence. Verify staging still serves the recorded same process. This lane carries no authority to deploy the application, restart it, change the rollout or return, or release Phase B, Entry Gate D or Universe Refresh P10.
