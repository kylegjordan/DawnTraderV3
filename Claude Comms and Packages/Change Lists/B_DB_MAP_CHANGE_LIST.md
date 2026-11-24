# B-DB-MAP — STEP 4 CODE-REVIEW CHANGE LIST

**DECLARED CHANGE-CLASS:** `non_architecture`

**Step-2 reference:** `Claude Comms and Packages/Scope Files/B_DB_MAP_PRE_AUDIT.md` at approved exact ref `93248a802efb6bda0b6559867d73c2c04446d934`.

**Corrected implementation source ref R:** `d57690b116b8fea701424ff80e9ebe09579f547d`

**Corrected immutable artifact commit C:** `b5631e83473c4e91ed1cf4ca99f74d5833e8d47c`

**Implementation compare base:** `2e9ee4b0584d4701d101d8f595a27bd6fa6acce4` (the Step-2 boundary record immediately before implementation)

**READY-AT:** supplied in the Discord redispatch after this file is committed and pushed; the corrected implementation and baseline being graded remain the immutable R/C pair above.

**ONE GATE:** code-level review of the implementation plus the generated baseline. Rule `PROCEED` or `SEND BACK`; no install, staging write, deploy, or batch-close authority is requested here.

---

## 1. Step-4 document-set header

The declared class is `non_architecture`. Required documents are listed row by row; judged documents that the scope already found applicable are also exposed rather than silently deferred.

| document-set row | Step-4 state |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_DB_MAP_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_DB_MAP_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — correctly not written before implementation review; required at Step 11 |
| `BATCH_CATALOG.md` | **present** — two predecessor/placement mentions exist; the B-DB-MAP close entry is pending Step 10 |
| `PHASE_HISTORY.md` | **present** — B-DB-MAP content is absent and pending Step 10 |
| active plan | **present** — `SPRINT_TO_LIVE_PLAN.md` carries row 5a2 and the 5a1→5a2→5a3 order |
| shared + owner memory | **present** — shared `MEMORY.md` exists; `MEMORY_CC_INFRA.md` records Step 4 and the exact R/C pair |
| reviewer memory | **outside the graded ref** — the Step-10 reviewer-memory synchronization is not claimed here |
| owner task list | **present** — `CC_INFRA_SESSION_TASK_LIST.md` carries B-DB-MAP; its completion-state update is pending Step 10 |
| `SYSTEM_MANUAL.md` | **present, judged applicable** in the scope because this adds a governed scheduled database reader; content update pending Step 10 |
| `SYSTEM_IMPACT_MAP.md` | **present, judged applicable** in the scope for the new reader/schedule/alert path; content update pending Step 10 |

This is not a Step-10 ledger. It makes the required Step-4 presence/absence state visible and does not claim later governance work is already done.

---

## 2. Change inventory

### 2.1 Source implementation — 35 changed files

**Modified existing files (2):**

- `.github/workflows/ci.yml`
- `comms-infra/staging/dt-install-drift`

**Added, then corrected in the second source commit (1):**

- `scripts/db-map/catalog.sql` (the second source commit adds explicit markers so an empty catalog section is distinct from a missing section)

**Added staging runtime/install surfaces (12):**

- `comms-infra/staging/dt-db-map-policy.mjs`
- `comms-infra/staging/dt-db-map-runner.mjs`
- `comms-infra/staging/dt-db-map-stale`
- `comms-infra/staging/dt-db-map-weekly`
- `comms-infra/staging/install-dt-db-map`
- `comms-infra/staging/systemd/dt-db-map-stale.service`
- `comms-infra/staging/systemd/dt-db-map-stale.service.d/onfailure.conf`
- `comms-infra/staging/systemd/dt-db-map-stale.timer`
- `comms-infra/staging/systemd/dt-db-map-weekly.service`
- `comms-infra/staging/systemd/dt-db-map-weekly.service.d/onfailure.conf`
- `comms-infra/staging/systemd/dt-db-map-weekly.timer`
- `scripts/db-map/remote-baseline.sh`

**Added generator/scanner/verifier surfaces (12):**

- `scripts/db-map/OPERATIONS.md`
- `scripts/db-map/adapter.mjs`
- `scripts/db-map/catalog.mjs`
- `scripts/db-map/config.mjs`
- `scripts/db-map/generate.mjs`
- `scripts/db-map/manifest.schema.json`
- `scripts/db-map/population.mjs`
- `scripts/db-map/scanner.mjs`
- `scripts/db-map/util.mjs`
- `scripts/db-map/vendor/tbls-v1.97.0.LICENSE`
- `scripts/db-map/vendor/tbls-v1.97.0.schema.json`
- `scripts/db-map/verify.mjs`

**Added tests (8):**

- `scripts/db-map/tests/connection-control.mjs`
- `scripts/db-map/tests/core.test.mjs`
- `scripts/db-map/tests/drift-enrollment.test.py`
- `scripts/db-map/tests/fixture.mjs`
- `scripts/db-map/tests/mutations.test.mjs`
- `scripts/db-map/tests/render-control.mjs`
- `scripts/db-map/tests/schedule.test.mjs`
- `scripts/db-map/tests/snapshot-control.mjs`

The headings above group the 35-file batch source set; `catalog.sql` is counted once. The Step-4 corrections modify 21 paths already in that set, so they do not expand the declared source-path population.

### 2.2 Generated artifact — 2,119 files

- 9 top-level authorities: `catalog.json`, `helpers.json`, `index.md`, `manifest.json`, `population.json`, `structural.json`, `tbls-schema.json`, `unresolved.json`, `usage.json`.
- 697 DawnTrader enrichment pages under `docs/database-map/tables/`, one per live relation.
- 1,413 pinned `tbls` Markdown/SVG/schema/viewpoint artifacts under `docs/database-map/tbls/`.

The corrected artifact contains 2,119 files and 48,388,041 bytes. The manifest records 2,118 artifact hashes and explicitly excludes only `manifest.json` from self-hashing. The corrected R..C positive control found `docs/database-map/catalog.json`; the Git range contains 454 changed paths, all under `docs/database-map/`, because 1,665 generated paths are byte-identical to the preceding baseline. The exact-set verifier independently enumerates all 2,119 files and rejects undeclared additions and missing declared files.

---

## 3. What the implementation does

1. Peels an explicit source ref to immutable 40-hex and scans an archive of that ref, not the mutable working tree.
2. Sends one fixed catalog SQL file through one `dt-sql --csv` call. The catalog SQL is one statement whose CTE/`UNION ALL` stream emits every catalog section from one statement snapshot. The governed login wrapper separately prepends its TLS-check `DO` statement inside the same database session, so this is one catalog statement, not one SQL statement total.
3. Treats an explicitly empty section as empty and a missing section as failure; the live `policies` section is currently a valid explicit zero.
4. Re-enumerates the exact candidate population during verification and compares ordered `(path, mode, blob-id)` population hashes, inclusion/exclusion hashes, and counts.
5. Maps the captured catalog into the vendored official `tbls` v1.97.0 JSON schema, validates against that official schema, and invokes `tbls` only against `json://` offline input.
6. Keeps volatile row/byte/analyze timestamps in the fresh artifact but excludes them from the structural drift projection. Structure, code usage, unresolved evidence, and helper evidence remain in the drift projection.
7. Recursively enumerates the artifact root, requires exact set equality with the manifest, canonicalizes every declared path, hashes every non-manifest artifact, schema-validates the manifest, revalidates the official `tbls` schema, rejects likely credentials/DSNs, and applies the source-ref R / artifact-ref C allowlist fence.
8. Generates Sunday at 06:30 UTC with up to 10 minutes of random delay and a 30-minute service timeout. A separate daily 07:15 UTC check makes no database connection.
9. Separates failure, structural drift, missing-run staleness (>8 days), and baseline staleness (>35 days) into four alert keys routed to CC-INFRA. Only each named clean condition resolves its key.
10. Keeps eight bounded receipts, removes private candidate directories after each run, never commits/pushes/deploys/restarts the app, and enrolls installed files, modes, directories, units, timers, the pinned Node and TypeScript runtimes, and installed SHA in install drift. A weekly run is not marked successful until all required alert delivery completes.

---

## 4. Load-bearing diff snippets

### 4.1 NEW — one catalog statement with explicit empty-section markers

**BEFORE:** absent.

**AFTER (`scripts/db-map/catalog.sql`, excerpt):**

```sql
presence_rows(section, section_order, row_order, payload) AS (
  VALUES
    ('schemas'::text, 2::integer, 0::bigint, '{"_section_marker":true}'::jsonb),
    ('relations', 3, 0, '{"_section_marker":true}'::jsonb),
    ('columns', 4, 0, '{"_section_marker":true}'::jsonb),
    ('constraints', 5, 0, '{"_section_marker":true}'::jsonb),
    ('indexes', 6, 0, '{"_section_marker":true}'::jsonb),
    ('partition_edges', 7, 0, '{"_section_marker":true}'::jsonb),
    ('policies', 8, 0, '{"_section_marker":true}'::jsonb),
    ('enums', 9, 0, '{"_section_marker":true}'::jsonb)
),
```

```sql
stream AS (
  SELECT 'meta'::text AS section, 1::integer AS section_order, row_order, payload FROM meta_rows
  UNION ALL SELECT section, section_order, row_order, payload FROM presence_rows
  UNION ALL SELECT 'schemas', 2, row_order, payload FROM schema_rows
  UNION ALL SELECT 'relations', 3, row_order, payload FROM relation_rows
  UNION ALL SELECT 'columns', 4, row_order, payload FROM column_rows
  UNION ALL SELECT 'constraints', 5, row_order, payload FROM constraint_rows
  UNION ALL SELECT 'indexes', 6, row_order, payload FROM index_rows
  UNION ALL SELECT 'partition_edges', 7, row_order, payload FROM partition_rows
  UNION ALL SELECT 'policies', 8, row_order, payload FROM policy_rows
  UNION ALL SELECT 'enums', 9, row_order, payload FROM enum_rows
)
SELECT section, section_order, row_order, payload::text AS payload_json
FROM stream
ORDER BY section_order, row_order;
```

### 4.2 NEW — exactly one governed database call and one catalog statement

**BEFORE:** absent.

**AFTER (`scripts/db-map/generate.mjs`, excerpt):**

```js
export async function readCatalogCsv(path) {
  if (path) return readFile(path, 'utf8');
  const sql = await readFile(join(HERE, 'catalog.sql'), 'utf8');
  const tool = process.env.DT_DB_MAP_DT_SQL ?? '/usr/local/bin/dt-sql';
  const result = spawnSync(tool, ['--csv'], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `dt-sql catalog call failed with ${result.status}: ${(result.stderr ?? '').slice(-1000)}`);
  return result.stdout;
}
```

### 4.3 NEW — immutable R/C provenance fence

**BEFORE:** absent.

**AFTER (`scripts/db-map/verify.mjs`, excerpt):**

```js
export function verifyFence(repo, sourceRef, artifactRef) {
  const target = execFileSync('git', ['-C', repo, 'rev-parse', '--verify', `${artifactRef}^{commit}`], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', sourceRef, target]);
  const raw = execFileSync('git', ['-C', repo, 'diff', '--raw', '-z', sourceRef, target], { encoding: 'utf8' });
  const tokens = raw.split('\0').filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const header = tokens[i];
    if (!header.startsWith(':')) continue;
    const status = header.trim().split(/\s+/).at(-1);
    const path = tokens[++i];
    const secondPath = /^[RC]/.test(status) ? tokens[++i] : null;
```

```js
    for (const candidate of [path, secondPath].filter(Boolean)) {
      const allowed = candidate.startsWith('docs/database-map/') ||
        candidate.startsWith('Claude Comms and Packages/Change Lists/B_DB_MAP_') ||
        candidate === '.claude/memory/MEMORY_CC_INFRA.md';
      assert(allowed, `R..C fence rejects covered-source change: ${candidate}`);
    }
  }
  return target;
}
```

### 4.4 NEW — exact ref generation, offline verification, structural-only comparison

**BEFORE:** absent.

**AFTER (`comms-infra/staging/dt-db-map-runner.mjs`, excerpt):**

```js
run('/usr/bin/git', ['-C', REPO, 'fetch', '--no-tags', 'origin', 'migration/aws-supabase']);
const sourceRef = git(['rev-parse', '--verify', `${REF}^{commit}`]).trim();
if (!/^[0-9a-f]{40}$/.test(sourceRef)) throw new Error('remote branch did not peel to immutable 40-hex');
receipt.source_ref = sourceRef;
runRoot = await mkdtemp(join(STATE, 'run-'));
await chmod(runRoot, 0o700);
const archive = join(runRoot, 'source.tar');
run('/usr/bin/git', ['-C', REPO, 'archive', '--format=tar', `--output=${archive}`, sourceRef]);
const source = join(runRoot, 'source'); await mkdir(source, { mode: 0o700 });
run('/usr/bin/tar', ['-xf', archive, '-C', source]);
const candidate = join(runRoot, 'candidate');
```

```js
run(NODE, [join(source, 'scripts/db-map/generate.mjs'), '--repo', REPO, '--source-ref', sourceRef, '--output', candidate, '--tbls', TBLs], { env });
run(NODE, [join(source, 'scripts/db-map/verify.mjs'), '--repo', REPO, '--root', candidate], { env });
const candidateManifest = JSON.parse(await readFile(join(candidate, 'manifest.json'), 'utf8'));
const artifactRef = git(['log', '-1', '--format=%H', sourceRef, '--', 'docs/database-map/manifest.json']).trim();
if (!/^[0-9a-f]{40}$/.test(artifactRef)) throw new Error('checked-in database-map artifact ref is absent or unreadable');
const baselineArchive = join(runRoot, 'baseline.tar');
run('/usr/bin/git', ['-C', REPO, 'archive', '--format=tar', `--output=${baselineArchive}`, artifactRef, 'docs/database-map']);
const baselineTree = join(runRoot, 'baseline'); await mkdir(baselineTree, { mode: 0o700 });
run('/usr/bin/tar', ['-xf', baselineArchive, '-C', baselineTree]);
const baselineMap = join(baselineTree, 'docs/database-map');
run(NODE, [join(source, 'scripts/db-map/verify.mjs'), '--repo', REPO, '--root', baselineMap, '--artifact-ref', artifactRef], { env });
const baseline = JSON.parse(await readFile(join(baselineMap, 'manifest.json'), 'utf8'));
receipt.baseline_source_ref = baseline.source_ref;
receipt.baseline_artifact_ref = artifactRef;
receipt.baseline_structural_sha256 = baseline.structural_sha256;
receipt.candidate_structural_sha256 = candidateManifest.structural_sha256;
receipt.result = baseline.structural_sha256 === candidateManifest.structural_sha256 ? 'match' : 'drift';
```

### 4.5 NEW — non-conflicting weekly and independent daily schedules

**BEFORE:** absent.

**AFTER (timer excerpts):**

```ini
[Timer]
OnCalendar=Sun *-*-* 06:30:00 UTC
RandomizedDelaySec=600
Persistent=true
```

```ini
[Timer]
OnCalendar=*-*-* 07:15:00 UTC
Persistent=true
```

### 4.6 MODIFIED — CI proves the implementation, pinned tool, snapshot, and installed-script syntax

**BEFORE:** no database-map CI group.

**AFTER (`.github/workflows/ci.yml`, excerpt):**

```yaml
- name: Database-map integrity and snapshot tests
  run: |
    node scripts/db-map/tests/core.test.mjs
    node scripts/db-map/tests/mutations.test.mjs
    node scripts/db-map/tests/schedule.test.mjs
    python3 scripts/db-map/tests/drift-enrollment.test.py
    node scripts/db-map/tests/connection-control.mjs
    node scripts/db-map/tests/snapshot-control.mjs
    artifact_ref="$(git log -1 --format=%H HEAD -- docs/database-map/manifest.json)"
    test "${#artifact_ref}" = 40
    node scripts/db-map/verify.mjs --repo . --root docs/database-map --artifact-ref "$artifact_ref"
    curl --fail --location --silent --show-error --output /tmp/tbls.tar.gz https://github.com/k1LoW/tbls/releases/download/v1.97.0/tbls_v1.97.0_linux_amd64.tar.gz
```

```yaml
    test "$(wc -c < /tmp/tbls.tar.gz)" = 31694635
    echo '43c81f408495d9b626d0265a6ebb57c6d1c4a5e072d3eecc3e88825cc6c64e9a  /tmp/tbls.tar.gz' | sha256sum --check --status
    tar -xzf /tmp/tbls.tar.gz -C /tmp tbls
    test "$(sha256sum /tmp/tbls | cut -d ' ' -f 1)" = 44bf748bf0b8f4ed66c21173d19792714a61953b5dff21da8805cb7caa1f6258
    DT_DB_MAP_TBLS=/tmp/tbls node scripts/db-map/tests/render-control.mjs
    bash -n comms-infra/staging/install-dt-db-map
    bash -n comms-infra/staging/dt-db-map-weekly
    bash -n comms-infra/staging/dt-db-map-stale
```

---

## 5. Exact-ref evidence re-derived for this dispatch

### 5.1 Artifact and population

- Corrected artifact ref: `b5631e83473c4e91ed1cf4ca99f74d5833e8d47c`.
- Corrected manifest source ref: `d57690b116b8fea701424ff80e9ebe09579f547d`.
- Generated files: 2,119 totaling 48,388,041 bytes; manifest artifact hashes: 2,118; manifest self-hash: explicit `null`.
- Scanner population at R: 2,386 included and 103 excluded tracked code-bearing files.
- Scanner evidence at R: 3,589 resolved usage rows; 6,102 unresolved rows; 85 direct-login/helper records.
- Structural projection SHA-256: `482de5ed345df991a760426752928f0312bd34700f49393e1c28fc29d3fde0d0`.
- Runtime record: Node `v20.20.0` at SHA-256 `d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e`; ICU `77.1`; TypeScript `5.6.3` implementation SHA-256 `f316520790d4db220a10d890c5f85310e26a1bd3c104b8d3b5eb62ba0491651b`.
- R..C changed Git paths: 454/454 under `docs/database-map/`; positive control `docs/database-map/catalog.json`; outside paths: 0; R is an ancestor of C. Independent artifact-root enumeration matched the exact declared set: 2,118 hashed files plus `manifest.json`.

### 5.2 Live captured catalog

- Database reader recorded in manifest: `dt_reader`.
- 697 relations: 675 ordinary tables, 17 partitioned parents, 5 views.
- 11,511 columns; 2,199 indexes; 1,567 constraints.
- Constraint split: 688 primary, 222 unique, 597 check, 60 foreign-key.
- 419 partition edges/children; 16 logical parent roll-ups.
- 27 RLS-enabled relations; 0 policies visible to `dt_reader` in the explicit, present policies section.
- The successful baseline generation published no database write and left `dt-sql --status` at `OK — not locked` on the Step-4 re-check.

### 5.3 Pinned `tbls`

- Version `1.97.0`.
- Linux AMD64 archive size 31,694,635 bytes.
- Archive SHA-256 `43c81f408495d9b626d0265a6ebb57c6d1c4a5e072d3eecc3e88825cc6c64e9a`.
- Binary SHA-256 `44bf748bf0b8f4ed66c21173d19792714a61953b5dff21da8805cb7caa1f6258`.
- Vendored official schema SHA-256 `23661bddf4ec0ab475a5953c4f71201a849c7e3ee2510bbed150b8ee2e1eb049`.

### 5.4 Tests and CI

- Local at corrected R: 43 core checks passed; 38/38 mutants killed; 19 schedule checks passed; install-drift positive control passed and its binary, Node executable, and Node-version mutations went red.
- Linux-only one-connection/two-call control, disposable-PostgreSQL one-statement/split-statement snapshot control, and real pinned `tbls` twice-byte-identical render all passed in CI.
- Corrected READY-AT CI is reported in the Discord redispatch after all four jobs finish. The Test Suite now materializes and verifies the real checked-in baseline and its actual R/C fence within the same blocking database-map step as the focused controls.

---

## 6. Judgement calls to attack

1. Does the single `WITH ... SELECT ... UNION ALL` catalog statement, carried through one `dt-sql --csv` process, truly satisfy both one governed session and one snapshot without a hidden second login/query path?
2. Does accepting explicit empty section markers preserve fail-closed behavior while correctly representing the live zero-policy case?
3. Does the candidate-side re-enumeration plus ordered path/mode/blob tuple hashing close added, removed, renamed, mode-changed, root, suffix, shebang, and Dockerfile population drift?
4. Is the official-schema adapter faithful enough for defaults, identity/generated columns, compound primary/unique constraints, checks, foreign keys, indexes, partitions, and schema-qualified duplicate names?
5. Is the structural projection boundary correct: volatile statistics excluded, but structure, resolved use, unresolved use, and helpers included?
6. Is the R/C allowlist narrow enough, including its deliberate permission for this batch's change list and owner memory while rejecting covered source/config/query changes?
7. Do the four alert keys and their independent resolution conditions avoid conflating failed generation, real structural drift, stale runs, and stale reviewed baselines?
8. Is the 2,119-file / approximately 48 MB checked-in baseline an acceptable review/storage trade-off for complete relation pages, official `tbls` pages/diagrams, and machine-readable authorities?
9. Does the corrected exact-set verifier now close both artifact-set directions, including undeclared additions, missing declared files, non-canonical paths, and traversal/absolute-path forms?
10. Do the Node/TypeScript implementation hashes, recorded ICU version, bytewise JavaScript ordering, explicit database `C` collation, installed isolated TypeScript copy, and install-drift enrollment sufficiently close ambient-runtime and locale-dependent output?
11. Does setting generation success before alert delivery, but total success only after delivery returns, preserve truthful phase diagnostics while guaranteeing a delivery exception exits red?
12. Is reversible `%25`/`%2E` component escaping an unambiguous relation representation for dotted schema/table identifiers across catalog validation, adapters, scanner evidence, foreign keys, partitions, and pinned `tbls`/Graphviz rendering?
13. Is the programmatic `allowUnpinnedRuntime` exception sufficiently confined to the synthetic pinned-render fixture, given that neither generator nor verifier exposes it on the command line and the real checked-in baseline still passes the strict verifier first?
14. Does full canonical equality of each emitted index tuple, plus same-cardinality substitutions for its name, definition, table, columns, and optional comment, close index fidelity beyond a count-only check?

---

## 7. Fresh-reader and first-ruling record

`REVIEWER: claim-only · At C, does the implementation actually have one governed catalog session/statement, offline exact-ref generation, and an artifact-only R..C fence; what other states are consistent with the independently selected objects? · HIT: five caveats — replayed/edited CSV remains consistent with the manifest; the adjacent audit success has no SQL/output/artifact digest; ambient Node/TypeScript/ICU inputs are not fully pinned and localeCompare is runtime-sensitive; generated files plus a recomputed manifest are indistinguishable from generator output; and the governed session includes a TLS-check DO plus one catalog statement, not one SQL statement total · re-derived y`

The owner re-derived each hit at the original R/C objects. Positive controls found the fixture `--catalog-csv` path, ambient `require('typescript')`, `NODE_PATH=/home/deploy/dawntrader/node_modules`, `localeCompare` ordering, the manifest's per-artifact hashes, and the login wrapper's prepended TLS `DO`. The live `/var/lib/dt-sql/log.jsonl` then showed the successful 03:54:14Z query adjacent to the 03:54:13.210031Z extraction time but no SQL digest, output digest, process identifier, or artifact identifier. Those limits were exposed in the first review request rather than restated as cryptographic attestation.

Coltrane returned **SEND BACK** at 2026-11-24T05:02:46Z on the first READY-AT ref `0c4809fd5355ecaf6a7aa3754ef0a3284140c082`. The corrected R/C pair resolves all five required findings:

1. **Actual baseline and R/C fence:** CI uses full Git history, finds the commit that last changed the manifest, and verifies the real checked-in tree with that artifact ref. The weekly runner materializes the same checked-in tree at that ref and applies the identical verifier before comparing structural hashes.
2. **Two-way artifact-set proof:** the verifier recursively enumerates regular files and requires exact equality with the manifest plus `manifest.json`; add, remove, traversal, absolute, backslash, NUL, and non-canonical path mutants all fail.
3. **Pinned deterministic runtime:** the generator enforces and records exact Node and TypeScript implementation hashes plus ICU; the installer isolates the pinned TypeScript files; install drift checks both; every generator/scanner sort uses byte comparison instead of `localeCompare`.
4. **Alert-delivery failure remains red:** total success is marked only after alert application returns; a throwing delivery path is exercised and leaves the receipt unsuccessful.
5. **Dotted identifiers cannot collide:** relation identities now use reversible `%25`/`%2E` component escaping; `schema='a.b', relation='c'` differs from `schema='a', relation='b.c'` and from a literal `%2E`; catalog uniqueness uses JSON tuples; fixtures and mutants cover these forms. This representation also remains valid input to the pinned `tbls`/Graphviz renderer.

The first corrected CI attempt, run `45332251730`, was deliberately not dispatched because its Test Suite went red: SQL-style quoted dotted identifiers reached `tbls` but produced invalid Graphviz syntax. The renderer-safe escaping above was then proved with the exact pinned Linux `tbls` binary, the live baseline was regenerated from the new immutable R, and the failed run is retained here as defect evidence rather than presented as review authority.

The second corrected CI attempt, run `45333600235`, was also deliberately not dispatched. Its real checked-in baseline, exact R/C fence, focused controls, and pinned Linux `tbls` render all passed, but the synthetic render-control fixture was generated with its explicit programmatic Node-pin exception and then verified without the matching exception. GitHub's Node `v20.20.2` therefore failed the fixture manifest's production Node `v20.20.0` pin after rendering. The correction passes the exception only to that synthetic fixture's programmatic verifier call; neither CLI exposes the exception, the real baseline is still verified strictly before the fixture runs, and TypeScript remains pinned in every path. This second red run is likewise retained as defect evidence and is not review authority.

The complete corrected package at READY-AT `252eafe15c19a8045197a2c501e855d3c3bce0a4` passed all four CI jobs in run `45334610252`, but Coltrane returned **SEND BACK** at 2026-11-24T06:00:54Z with three remaining findings:

1. **Node install drift was incomplete:** the generator pinned Node at generation, but the installed Node executable and reported version were absent from weekly drift detection.
2. **Ordering was not completely explicit:** five production JavaScript ordering sites still used native sort instead of the declared byte comparator, and the control did not discriminate a non-ASCII substitution at those sites.
3. **Index fidelity was count-only:** equal index counts could conceal same-cardinality substitutions.

The new R/C pair above closes those findings. Install drift now pins the live Node executable checksum, ownership/mode, and exact reported version, with independent executable-byte and version mutations. Every production JavaScript string sort uses the UTF-8 byte comparator; the catalog query pins all nine string-order clauses to database `C` collation, the production reader refuses a changed 13-site ordering set, and non-ASCII controls exercise artifact paths, canonical JSON, enum groups, schema viewpoints, cross-schema tables, and logical roll-ups. Adapter fidelity now compares the complete emitted index tuple and same-cardinality mutants replace each of its five emitted fields.

`REVIEWER: claim-only · Does the current correction fully close the Node drift, all production ordering, and complete index-tuple findings; what objects would settle that and what other states remain consistent? · HIT: the catalog query still used database-default string collation and the comparator-only control did not exercise each production ordering site · re-derived y`

The owner re-derived that hit from the catalog query and generator path. The correction now pins the query collation, refuses a changed ordering-site set before the database call, and drives the non-ASCII pair through the individual JavaScript ordering sites; the fresh baseline was regenerated from the corrected immutable R rather than retaining the earlier candidate.

---

## 8. Requested ruling

Coltrane: review the complete implementation diff and immutable generated baseline at the READY-AT ref named in the dispatch, using R/C above as the provenance pair. Rule **PROCEED** or **SEND BACK** on this one Step-4 code-review gate. A PROCEED authorizes only Step 5 test-environment preparation; it does not authorize installation, staging mutation, deployment, or close.
