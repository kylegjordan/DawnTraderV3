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

This batch has no DawnTrader application deploy. The staging deploy record named `e3a96a8126f0280a9568bb1823b9210783f0afe0`; the range to the shared branch included other owners' runtime work, so `dt-deploy` was deliberately not run. Instead, the separately reviewed installer, remover and manifest were exported from the graded implementation ref `5e223c8a1e19db10cdea3c55479b4ff4656a45bf` into a private temporary directory and installed without editing the application checkout or restarting a process. Step 8 later found that the Windows-side manifest transfer changed LF to CRLF while preserving the canonical JSON; the raw graded-ref bytes were reinstalled before the Step-8 redispatch, as recorded below.

Installed objects:

| object | installed SHA-256 | owner:group / mode |
|---|---|---|
| `/usr/local/sbin/dt-db-helper-retire` | `ec917e4956a27ee156199be86777dcab3ca895994dc42cffc4defd18685383f1` | `root:root` / `0755` |
| `/usr/local/share/dawntrader/b-db-helper-retire-manifest.json` | initial CRLF transfer `7b508786e26ca78f5925543e1101f0e014705ee6affcc8a7afa647bdec4cf702`; corrected raw-ref bytes `1f4d690832a0953db0603cc3e4831618de45899ee0c4cc516c44bbdd680014ec` | `root:root` / `0644` |

The installed remover first verified all 53 exact live files against the reviewed bytes and metadata and reported no change. It then ran once as `codex-infra`, completed at `2026-11-24T15:03:49.569859+00:00`, and recorded 53 removed paths. Durable state hashes are `8689a639baa161ac7b647f199075ba276dc54e9beef564b2c70c25a397f724f6` for `remove-journal.json` and `881edd1b5438d34a712698d998a138cefbe8f48991f813d6392b7337df165a8b` for `last-remove.json`; both are `root:root` mode `0600`.

The immediate boundary check found the application ref still `e3a96a8126f0280a9568bb1823b9210783f0afe0`, DawnTrader PID still `2822823`, restart count still `715`, and unchanged SHA-256 values for the application environment, application pool source, built application and deploy record. Step 7 owns the independent full live census, governed-read/write-refusal checks and installed-drift proof; those results are not claimed by this Step-6 record.

## Step 7 — first-pass live verification (2026-11-24)

### Removal state and the live surface

An independent verifier reconciled the installed manifest, durable journal and receipt: all three have the same ordered 53-path set and reviewed disposition ref; the journal is `complete` with 53 `removed` entries; the receipt attributes 53 removals to `codex-infra`; and none of the 53 paths exists.

The live census first ran the same marker detector against the 53 exact archived helper bodies as a population-sized positive control: 53/53 produced a direct database marker with zero read errors. Against the original top-level script suffix population, 36 files remain (89 before minus the reviewed 53), all 36 reads succeeded, and zero contains `psql`, `DATABASE_URL`, `PGPASSWORD`, `dt-sql`, a node-postgres module marker or a Client/Pool constructor marker.

A claim-only fresh reader correctly challenged that suffix-bounded scan as insufficient for an unqualified top-level absence claim. The re-derived all-entry census inspected all 541 immediate `/home/deploy` entries: 500 regular files and 41 directories, with zero symlinks, zero other types, zero read errors and zero extensionless executable/shebang candidates. Three non-executable artifacts contain marker words: `c1.err` is a 112-byte `dt-sql` refusal output, `c2.err` is an 85-byte `psql` syntax-error output, and `c4.sql` is a 693-byte read-only SQL input file. None is an executable helper or contains a database login. The completion claim is therefore limited to the measured top-level entry population; it does not claim that no database-capable program exists elsewhere on the host.

### Governed read and write refusal

The installed `dt-sql` returned `current_user = dt_reader`. A named probe table was absent before the write attempt; `BEGIN; CREATE TABLE ...; ROLLBACK;` failed with `cannot execute CREATE TABLE in a read-only transaction` and exit 1; the same read afterward again returned `dt_reader` and confirmed the table absent. `dt-sql --status` remained `OK — not locked`.

The exact reviewed price-side alias census then completed live through `dt-sql`, printed `database role: dt_reader`, read 499 universe rows and reached its known `DASH/USD` positive control. The exact reviewed AMR correctness audit did not reach its database leg: its existing hard-coded test-account login returned HTTP 401 `Invalid credentials`, after which both diagnostic requests returned 401. This is not a removal or `dt-sql` failure, but it means the retained AMR helper is not currently runnable end to end; the defect is carried to Step 8 and, if confirmed, Step 9.

### Application and installed-boundary state

The application ref remained `e3a96a8126f0280a9568bb1823b9210783f0afe0`; PID remained `2822823`; restart count remained `715`; and the pre/post SHA-256 values remained identical for the application environment, `server/db.ts`, built application and deploy record. DawnTrader remained online. `dt-install-drift` passed every governed installed object and control. The newly installed remover and manifest still matched the installed hashes recorded at Step 6. Byte identity against the raw Git blobs was left to the independent Step-8 gate; that gate found and corrected the manifest line-ending conversion recorded below. All temporary verification artifacts were removed.

This batch has no UI surface: it changed only retired top-level server helpers, a root-only remover and repository-only diagnostics. No application route, response, page or browser asset changed, so there is no affected staging tab to navigate; UI verification is explicitly not claimed.

`REVIEWER: claim-only · B-DB-HELPER-RETIRE Step-7 completion/absence/mechanism claim · HIT — extension-selected census and endpoint-only state hashes left unmanifested-helper and database-history counterexamples · re-derived y (all top-level entries scanned; database claim narrowed to the reviewed retirement process and observed no-deploy/no-restart boundary)`

### Step-8 replay object

`Claude Comms and Packages/Change Lists/B_DB_HELPER_RETIRE_STEP7_VERIFY.py.txt` is the exact second-party-replayable derivation for the removal receipt, population-sized positive control, suffix census and all-top-level census. Run it on staging with these five arguments: a private extraction of `1-system-manual/_archive/deleted-code/live-staging/2026-11-24-b-db-helper-retire` from the pushed ref; `/home/deploy`; `/usr/local/share/dawntrader/b-db-helper-retire-manifest.json`; `/var/lib/dt-db-helper-retire/remove-journal.json`; and `/var/lib/dt-db-helper-retire/last-remove.json`. The script prints every counted population and every remaining marker-bearing top-level object, then fails on a control miss, read error, suffix hit, extensionless executable/shebang candidate, path-set mismatch, incomplete journal or reappeared reviewed path.

The governed-role check used `/usr/local/bin/dt-sql -f` with `SELECT current_user;` and `SELECT to_regclass('public.__dt_reader_write_probe_b_db_helper_retire') IS NULL;` before and after the probe. The persistent-write probe was `BEGIN; CREATE TABLE public.__dt_reader_write_probe_b_db_helper_retire(id integer); ROLLBACK;`; it must fail, and the after-read must still report `dt_reader` and `t`. Installed-object and application-boundary commands were `sha256sum` over the six exact paths recorded above, `git -C /home/deploy/dawntrader rev-parse HEAD`, the DawnTrader PM2 PID/restart/status read, `/usr/local/bin/dt-sql --status`, and `dt-install-drift`.

### Step-8 SEND BACK and exact-byte correction

Coltrane independently reproduced every removal, census, database and application-boundary leg at exact pushed ref `61595866cb5c20c4f13d178a98287d532364e713`, but SEND BACK at 2026-11-24 15:31:30Z because the installed manifest was not byte-identical to the graded artifact. The raw Git blob was 28,379 bytes with SHA-256 `1f4d690832a0953db0603cc3e4831618de45899ee0c4cc516c44bbdd680014ec` and LF endings; the installed file was 29,076 bytes with SHA-256 `7b508786e26ca78f5925543e1101f0e014705ee6affcc8a7afa647bdec4cf702` and CRLF endings. Canonicalized JSON matched, so the defect was transfer encoding, not semantic drift; the remover itself remained an exact match at `ec917e4956a27ee156199be86777dcab3ca895994dc42cffc4defd18685383f1`.

The manifest was then streamed from the raw blob at graded implementation ref `5e223c8a1e19db10cdea3c55479b4ff4656a45bf`, checked at 28,379 bytes and the raw-blob SHA before installation, and installed as `root:root` mode `0644`. The installed file now has the exact raw-ref SHA `1f4d690832a0953db0603cc3e4831618de45899ee0c4cc516c44bbdd680014ec`.

The committed replay verifier was rerun from a private exact-ref archive and passed unchanged: 53/53 controls, 36 suffix files with zero hits, 541 top-level entries (500 regular and 41 directories), zero symlinks/read errors/other types/extensionless candidates/recreated paths, and the same ordered 53 paths in the complete journal and receipt. The six-path boundary after correction is: remover `ec917e4956a27ee156199be86777dcab3ca895994dc42cffc4defd18685383f1`; manifest `1f4d690832a0953db0603cc3e4831618de45899ee0c4cc516c44bbdd680014ec`; application environment `d075b68192b52cb4a55e80fe8a794c96a9cd3d175504107d0af55c170deba429`; application pool source `bfb921efdec53a4649c06692d7755251ace4b766218dbf6756950bfaaab12b5c`; built application `67a830b70a406e074336184923a82c5448cac665e9e08108dde5514a0ece76be`; deploy record `156dbd8864f6984512a6a16f377add9c56ff94b6450397ce30d9a793295b7bb5`. The application remained ref `e3a96a8126f0280a9568bb1823b9210783f0afe0`, PID `2822823`, restart count `715`, status online. The private temporary extraction was removed automatically.
