# B-DB-HELPER-RETIRE — Step-4 change list (Coltrane code review)

**GRADED CODE REF:** `3dff20401ef8d6d2a52ec74ef26d9623cd6f2234` on `migration/b-db-helper-retire-step4` and `review/b-db-helper-retire-step4`.
**Range:** `1e42fccd0de007ee0477b12daf118996995aea33..3dff20401ef8d6d2a52ec74ef26d9623cd6f2234` — 3 commits, 110 files, +4,238 / -117.
**Owner:** INFRA Codex for CC-INFRA · **Date:** 2026-11-24 · **Live state:** no install, removal, deploy, restart or database write has occurred.

## Dispatch header — the three required workflow-04 fields

| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `non_architecture`, verbatim from `Claude Comms and Packages/Scope Files/B_DB_HELPER_RETIRE_SCOPE.md` |
| ii | DOC SET for `non_architecture` | **SCOPE present:** `Claude Comms and Packages/Scope Files/B_DB_HELPER_RETIRE_SCOPE.md` · **PRE_AUDIT present:** `Claude Comms and Packages/Scope Files/B_DB_HELPER_RETIRE_PRE_AUDIT.md` · **COMPLETION_REPORT absent:** Step 11 · **BATCH_CATALOG absent as this batch's own row:** Step 10 (existing mentions only place the dependency) · **PHASE_HISTORY absent as this batch's own entry:** Step 10 · **SYSTEM_MANUAL judged at Step 10:** the batch changes operator database access, not trading decisions, but the existing Crew Database Reads contract must be reconciled · **SYSTEM_IMPACT_MAP present as an upstream dependency only:** content update judged at Step 10 · **CHANGES_AND_FIXES absent:** judged at Step 10 · **RUNNING_ISSUES present as the parent #1259 history:** close/update at Step 10 · **POST_AUDIT_ROADMAP judged N/A:** no roadmap item · **DELETED_COMPONENTS_LOG present:** Step-3 retirement entry added · **ADJUSTMENT_FRAMEWORK judged N/A:** no measured trading adjustment · **PHASE_19_PLAN judged N/A:** not a `P19-*` batch |
| iii | STEP-2 REFERENCE | `Claude Comms and Packages/Scope Files/B_DB_HELPER_RETIRE_PRE_AUDIT.md` at `3261801a157a66e1fdf36eae69b66b86893786a8`; Coltrane PROCEED, with the row-92 correction separately PROCEEDED at `231a8c1948e1774817e93adde8204783f36a5139` |

## What changed

1. **Exact disposition and rollback record.** The ledger now has 92 checked-in connection surfaces and 53 live top-level helpers. Checked-in dispositions reconcile exactly to 33 `RETIRE`, 36 `RETAIN_GOVERNED_DIRECT`, 20 `RETAIN_TEST_LOCAL`, 2 `ROUTE_DT_SQL`, and 1 `OWNER_HOLD`.
2. **Checked-in retirement.** The 33 reviewed `RETIRE` sources and the sole-use P7h processor are absent from executable source paths. Each was moved byte-for-byte into a non-executable `.removed` archive. The phase-A2 package command and the W20c sole-input configuration were removed with their sources.
3. **Live rollback before action.** All 53 live helpers were copied into the repository as exact raw bytes with path, SHA-256, byte size, owner, group, mode and nanosecond mtime in one immutable manifest. The live files themselves are unchanged.
4. **Two retained reads routed.** The price-side alias census and the AMR correctness audit no longer load the application credential or create their own database client. Each invokes `/usr/local/bin/dt-sql` and refuses unless `current_user` is `dt_reader`.
5. **Default-deny source gate.** The validator compares the immutable 85-row B-DB-MAP hand-off plus seven supplemental rows with the exact ledger; proves source and live archive bytes; rejects a missing, duplicated, stale or unknown disposition/exclusion; and fails on any current recognized connection-marker source not in the exact typed set.
6. **Live removal is a separate later action.** The new remover defaults to verification. Its removal mode requires root plus an allowed actor, verifies all 53 paths before acting, refuses symlinks/drift/out-of-scope paths, rechecks inode identity immediately before removal, and never deploys or restarts the app. It has not been installed or run.

## Load-bearing hunks

### A. Read-only routing: direct application login removed

BEFORE, price-side alias census:
```sh
cd /home/deploy/dawntrader || exit 1
set -a; . ./.env; set +a
echo "universe columns: $(psql "$DATABASE_URL" -X -At -c "SELECT ...")"
psql "$DATABASE_URL" -X -At -c "SELECT symbol ..." > /tmp/cc_c_xuniverse.txt
```

AFTER:
```sh
DT_SQL=/usr/local/bin/dt-sql
role=$($DT_SQL -c 'SELECT current_user')
if [ "$role" != dt_reader ]; then
  echo "refusing census: dt-sql returned current_user=$role, wanted dt_reader" >&2
  exit 2
fi
columns=$($DT_SQL -c "SELECT column_name FROM information_schema.columns ...")
$DT_SQL -c 'SELECT symbol FROM xstock_spot_universe ORDER BY symbol' > "$WORK/xuniverse.txt"
```

BEFORE, AMR audit:
```ts
const pg = await import('pg');
const dburl = process.env.DATABASE_URL ?? readFromEnv();
const client = new pg.default.Client({ connectionString: dburl });
await client.connect();
const r = await client.query(`SELECT asset_class, constant_name ...`);
```

AFTER:
```ts
const rows = dtSqlRows(`
  SELECT current_user, ''::text AS asset_class, ''::text AS constant_name
  UNION ALL
  SELECT current_user, asset_class, constant_name
  FROM module_constants ...`);
const role = rows[0]?.[0];
if (role !== 'dt_reader') throw new Error(`dt-sql returned current_user=${role ?? 'missing'}`);
```

### B. Exact archive proof and default deny

```js
for (const row of ledger.checked_in.filter((entry) => entry.disposition === 'RETIRE')) {
  await assert.rejects(stat(resolve(REPO, row.path)), { code: 'ENOENT' });
  const archived = git(['show', `:${sourceArchiveGitPath(row.path)}`], { binary: true });
  const reviewed = git(['show', `${ledger.reviewed_ref}:${row.path}`], { binary: true });
  assert.equal(sha256(archived), sha256(reviewed));
}
const allowed = new Set([
  ...ledger.checked_in.filter((row) => row.disposition !== 'RETIRE').map((row) => row.path),
  ...exclusions.entries.map((row) => row.path),
]);
assertExactMarkerSet(await currentMarkerMap(), allowed);
```

### C. Live remover preflight and race fence

```py
verified = verify_all(manifest)  # bytes, size, mode, owner, group and mtime for all 53
parent_fd = os.open(TARGET_DIR, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
for row, _, before in verified:
    current = os.stat(os.path.basename(row["path"]), dir_fd=parent_fd, follow_symlinks=False)
    if (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino):
        raise Refusal("%s changed identity after verification" % row["path"])
for row, _, _ in verified:
    os.unlink(os.path.basename(row["path"]), dir_fd=parent_fd)
os.fsync(parent_fd)
```

### D. CI gate

```yaml
- node scripts/db-helper-retire/tests/validator.test.mjs
- node scripts/db-helper-retire/validate.mjs
- python3 comms-infra/staging/tests/db_helper_retire_tests.py
- bash -n comms-infra/staging/install-dt-db-helper-retire
```

## Verification at the graded code ref

| check | result |
|---|---|
| disposition/archive/default-deny validator | PASS: 92 checked-in dispositions, 53 live archives, 96 classified current marker paths |
| validator mutation suite | 24/24 PASS, including missing row, wrong count, hidden absolute-path marker, aliased node-postgres constructors, stale exclusion and archive mismatch arms |
| DB-map core suite | 48/48 PASS |
| focused retained/retired consumer suites | 85/85 PASS |
| Linux remover suite | 10/10 PASS |
| Linux live-path connection control | one-call control PASS; two-call mutant RED |
| TypeScript baseline | 314 current = 314 baseline |
| production build | PASS; only the two pre-existing warnings |
| shell syntax | both changed shell entry points PASS |

The database-map snapshot control was not locally runnable because this laptop has no database credential. It remains a CI-controlled check and is not claimed as a local pass.

## Judgement calls — attack these

1. **Removal all-or-nothing boundary.** All 53 paths are fully preflighted and identity-rechecked before the first unlink, but a filesystem error during the sequential unlink loop could leave a partial removal. Is the fail-closed preflight plus exact rollback archive sufficient, or must the remover stage an atomic rename boundary first?
2. **Archive form.** Checked-in retired sources remain exact Git bytes under a non-executable `.removed` archive rather than relying only on Git history. Does this satisfy the rule-18 rollback/evidence need without leaving a surviving executable path?
3. **Marker scanner boundary.** It strips comment-only markers, scans tracked plus untracked non-ignored source, requires exact typed exclusions, and recognizes bare/absolute `psql`, `DATABASE_URL`, `PGPASSWORD`, literal or locally-aliased node-postgres Client/Pool constructors, and `dt-sql`. Generated/ignored files and arbitrary dynamic alias chains remain outside this checked-in-source gate; live staging has its separate 53-path manifest. Is that an honest and sufficient boundary?
4. **The one hold.** `reviewer_staging_access.py` remains `OWNER_HOLD` under B-CREW-ACCESS-HARDEN; it is not weakened, rerouted or retired here. Is that the correct boundary until its owning increment lands?
5. **Step-2 versus implementation identity.** The live manifest and remover pin the Step-2 reviewed disposition ref `3261801a1`; source archive comparisons pin the correction ref `231a8c194`; this code review grades `220476bba`. Should the installed remover instead pin the Step-4 code ref, or is keeping provenance and implementation identities separate preferable?

## Fresh-reader record

The earlier Step-2 claim-only reader found the surviving phase-A2 package command and the W20c test/config consumers. Both were re-derived and removed or updated in this implementation.

`REVIEWER: claim-only · retirement entry-point/state-preservation claim · HIT — package.json exposed a RETIRE helper and W20c consumers survived · re-derived yes`

The Step-4 claim-only reader identified two limits: the exact-ref objects cannot alone prove that staging was untouched, and the scanner missed a locally-aliased node-postgres constructor. The alias counterexample was reproduced at the ref, the detector and mutation suite were extended for property, CommonJS and import aliases, and the broader dynamic-alias limit is now explicit above. The staging-unchanged claim remains **NOT RE-READ at the Git ref** and will be supported only by remote state evidence at the live-action gate.

`REVIEWER: claim-only · Step-4 completion/mechanism/absence claim · HIT — aliased node-postgres construction escaped and Git alone cannot prove live absence · re-derived yes (alias); live absence deferred to remote gate`
