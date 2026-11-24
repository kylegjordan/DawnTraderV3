# B-DB-HELPER-RETIRE — Step-4 change list (Coltrane code review)

**GRADED CODE REF:** `5e223c8a1e19db10cdea3c55479b4ff4656a45bf` on `migration/b-db-helper-retire-step4` and `review/b-db-helper-retire-step4`.
**Range:** `1e42fccd0de007ee0477b12daf118996995aea33..5e223c8a1e19db10cdea3c55479b4ff4656a45bf` — 10 commits, 109 files, +5,333 / -108.
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
5. **Surface-exact default deny.** The validator compares the immutable 85-row B-DB-MAP hand-off plus seven supplemental rows with the exact ledger; proves source and live archive bytes; and now pins marker class and occurrence count for every one of 97 currently classified paths. A second call inside an already-approved file turns the full validator red. Literal, constructor-alias, ES namespace-alias and whole-module CommonJS `pg` constructors are recognized. JavaScript/TypeScript comments are tokenized by the TypeScript scanner only after a clean syntax parse; parse errors return to raw fail-closed scanning. Other supported source types likewise return to raw scanning if quote/comment structure is ambiguous.
6. **Live removal is a separate, journaled later action.** The remover defaults to verification. Removal requires root plus an allowed actor, verifies all 53 paths before acting, durably records intent and per-path state before each unlink, rechecks inode identity immediately adjacent to each transition, fsyncs the parent and journal, and reconciles either side of an interrupted unlink on resume. `--status` exposes an incomplete journal instead of saying nothing changed. It has not been installed or run.

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
assertExactMarkerSet(await currentMarkerMap(), reviewedSurfaceBaseline);
```

### C. Live remover preflight and race fence

```py
verified = verify_all(manifest)  # full-population preflight before the journal is created
journal = load_journal(manifest, actor)
reconcile_journal(manifest, journal)
for row, entry in zip(manifest["files"], journal["entries"]):
    fd, before = verify_row(row)
    entry["state"] = "removing"
    persist_journal(journal)  # durable intent precedes every destructive transition
    current = os.stat(os.path.basename(row["path"]), dir_fd=parent_fd, follow_symlinks=False)
    if (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino):
        raise Refusal("identity changed at removal transition")
    os.unlink(os.path.basename(row["path"]), dir_fd=parent_fd)
    os.fsync(parent_fd)
    entry["state"] = "removed"
    persist_journal(journal)
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
| disposition/archive/default-deny validator | PASS: 92 checked-in dispositions, 53 live archives, 97 classified current marker paths, each pinned by marker class/count |
| validator mutation suite | 28/28 PASS, including the reviewer’s second-call-in-one-file mutant, syntax-valid string/block-comment trap, ES namespace `pg` alias and whole-module CommonJS `pg` alias, all filesystem-enrolled through the full validator |
| DB-map core suite | 45/45 PASS; the closed map's scanner version and checked-in artifact remain aligned |
| focused retained/retired consumer suites | 85/85 PASS |
| Linux remover suite | 18/18 PASS, including replacement at transition, durable partial-state status, mid-sequence failure and successful resume |
| Linux live-path connection control | one-call control PASS; two-call mutant RED |
| TypeScript baseline | 314 current = 314 baseline |
| production build | PASS; only the two pre-existing warnings |
| shell syntax | both changed shell entry points PASS |
| shared CI at graded ref | run `45411919787`: TypeScript Check, Test Suite, Build and Docker Build all green at `5e223c8a1e19db10cdea3c55479b4ff4656a45bf` |

The database-map snapshot control was not locally runnable because this laptop has no database credential. It remains a CI-controlled check and is not claimed as a local pass.

## Judgement calls — attack these

1. **Removal recovery boundary.** The remover now makes partial progress explicit rather than claiming an impossible multi-file atomic unlink: a durable journal records `pending` / `removing` / `removed`, adjacent identity checks fence replacement, and resume reconciles an unlink that occurred immediately before interruption. Is this recoverable, rollback-detectable boundary sufficient?
2. **Archive form.** Checked-in retired sources remain exact Git bytes under a non-executable `.removed` archive rather than relying only on Git history. Does this satisfy the rule-18 rollback/evidence need without leaving a surviving executable path?
3. **Marker scanner boundary.** It scans tracked plus untracked non-ignored source, pins marker class/count for all 97 classified paths, uses the TypeScript scanner for JS-family comments, and fails closed on ambiguous other-source parsing. It recognizes bare/absolute `psql`, `DATABASE_URL`, `PGPASSWORD`, literal, constructor-aliased and namespace-aliased node-postgres Client/Pool constructors, and `dt-sql`. Generated/ignored files and arbitrary dynamic alias chains remain outside this checked-in-source gate; live staging has its separate 53-path manifest. Is that an honest and sufficient boundary?
4. **The one hold.** `reviewer_staging_access.py` remains `OWNER_HOLD` under B-CREW-ACCESS-HARDEN; it is not weakened, rerouted or retired here. Is that the correct boundary until its owning increment lands?
5. **Step-2 versus implementation identity.** The live manifest and remover pin the Step-2 reviewed disposition ref `3261801a1`; source archive comparisons pin the correction ref `231a8c194`; this code review grades `5e223c8a1e19db10cdea3c55479b4ff4656a45bf`. Keeping provenance and implementation identities separate remains the reviewed choice; Step 6 must record this graded implementation ref and installed hashes.

## Fresh-reader record

The earlier Step-2 claim-only reader found the surviving phase-A2 package command and the W20c test/config consumers. Both were re-derived and removed or updated in this implementation.

`REVIEWER: claim-only · retirement entry-point/state-preservation claim · HIT — package.json exposed a RETIRE helper and W20c consumers survived · re-derived yes`

The Step-4 claim-only reader identified two limits: the exact-ref objects cannot alone prove that staging was untouched, and the scanner missed a locally-aliased node-postgres constructor. The alias counterexample was reproduced at the ref, the detector and mutation suite were extended for property, CommonJS and import aliases, and the broader dynamic-alias limit is now explicit above. The staging-unchanged claim remains **NOT RE-READ at the Git ref** and will be supported only by remote state evidence at the live-action gate.

`REVIEWER: claim-only · Step-4 completion/mechanism/absence claim · HIT — aliased node-postgres construction escaped and Git alone cannot prove live absence · re-derived yes (alias); live absence deferred to remote gate`

Coltrane then SEND BACK at Discord `1574776559171141733` on exact graded ref `b8cfab3e76de8d80d219fd26d3c426966929367d`. He reproduced three blockers: path-only rather than occurrence-exact enforcement, quote-blind block-comment stripping, and a non-journaled sequential live removal. Exact reproductions were added end to end. The corrected implementation at `c6acd0d374b7b3b830eef5c5ead90bf570c30242` makes the surface gate class/count exact, uses syntax-aware/fail-closed comment handling, and makes every live transition durably journaled, replacement-fenced and resumable.

Coltrane’s second SEND BACK at 14:08:36Z accepted those corrections and found one remaining static alias gap plus the stale judgement-call ref: ES namespace imports and whole-module CommonJS aliases could construct `pg` clients without a marker. Both exact forms are now filesystem-enrolled full-validator mutations and turn red when introduced; the record now names the actual graded implementation ref.

## Step 6 — reviewed staging-helper install and retirement (2026-11-24)

This batch has no DawnTrader application deploy. The staging deploy record named `e3a96a8126f0280a9568bb1823b9210783f0afe0`; the range to the shared branch included other owners' runtime work, so `dt-deploy` was deliberately not run. Instead, the separately reviewed installer, remover and manifest were exported from the exact graded implementation ref `5e223c8a1e19db10cdea3c55479b4ff4656a45bf` into a private temporary directory and installed without editing the application checkout or restarting a process.

Installed objects:

| object | installed SHA-256 | owner:group / mode |
|---|---|---|
| `/usr/local/sbin/dt-db-helper-retire` | `ec917e4956a27ee156199be86777dcab3ca895994dc42cffc4defd18685383f1` | `root:root` / `0755` |
| `/usr/local/share/dawntrader/b-db-helper-retire-manifest.json` | `7b508786e26ca78f5925543e1101f0e014705ee6affcc8a7afa647bdec4cf702` | `root:root` / `0644` |

The installed remover first verified all 53 exact live files against the reviewed bytes and metadata and reported no change. It then ran once as `codex-infra`, completed at `2026-11-24T15:03:49.569859+00:00`, and recorded 53 removed paths. Durable state hashes are `8689a639baa161ac7b647f199075ba276dc54e9beef564b2c70c25a397f724f6` for `remove-journal.json` and `881edd1b5438d34a712698d998a138cefbe8f48991f813d6392b7337df165a8b` for `last-remove.json`; both are `root:root` mode `0600`.

The immediate boundary check found the application ref still `e3a96a8126f0280a9568bb1823b9210783f0afe0`, DawnTrader PID still `2822823`, restart count still `715`, and unchanged SHA-256 values for the application environment, application pool source, built application and deploy record. Step 7 owns the independent full live census, governed-read/write-refusal checks and installed-drift proof; those results are not claimed by this Step-6 record.
