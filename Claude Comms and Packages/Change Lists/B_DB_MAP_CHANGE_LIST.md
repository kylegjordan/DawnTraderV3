# B-DB-MAP — STEP 4 CODE-REVIEW CHANGE LIST

**DECLARED CHANGE-CLASS:** `non_architecture`

**Step-2 reference:** `Claude Comms and Packages/Scope Files/B_DB_MAP_PRE_AUDIT.md` at approved exact ref `93248a802efb6bda0b6559867d73c2c04446d934`.

**Step-9 corrected implementation source ref R:** `13154e33eb6db72fdfd7100646e4a72b77a09152`

**Step-9 corrected immutable artifact commit C:** `6d1b733291482abb538cc9caba049a482527d012`

**Previously reviewed Step-4 R/C:** `d57690b116b8fea701424ff80e9ebe09579f547d` / `b5631e83473c4e91ed1cf4ca99f74d5833e8d47c`

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

---

## 9. Step-7 first-pass staging verification

### 9.1 Surface judgement and installed identity

This batch has no UI surface: it installs server-side database-map generation, receipts, schedules and alerts only. It adds no route, page, dashboard field or browser-visible control, so Step 7 deliberately did not use the stale landing dashboard. `/usr/local/sbin/dt-install-drift` returned PASS for the complete installed database-map set, including the exact reviewed installer ref `4b7d06970c39a40d87710bdfc660e7d528dd72ba`, pinned `tbls` 1.97.0, Node v20.20.0, TypeScript 5.6.3, both entry points, runner, policy, six unit/timer/drop-in files, and installed-state marker. Both timers were enabled and active.

### 9.2 Live catalog equality and one-session boundary

An independent one-statement catalog query through `dt-sql` returned `current_user=dt_reader` and compared identities, not counts alone. Its live set equalled the checked-in catalog exactly: 697 live versus 697 baseline relations, with zero additions or omissions; 11,511 live versus 11,511 baseline `(schema, relation, ordinal, column)` identities, with zero additions or omissions. Both compared sets were non-empty positive controls.

Four complete generation windows between 07:19:56Z and 07:26:00Z produced exactly four `dt-sql-login --csv` journal records, one per generation. A separately journal-stamped held-lock control at 07:32:20Z produced `20261124T073220332Z-skipped.json`, result `lock-held-skip`, success false, and zero catalog-login records in that exact window; the journal instrument's positive-control window at 07:30Z contained three independent catalog calls. Final `dt-sql --status` was `OK — not locked`.

### 9.3 Real weekly success, statistics-only movement, failure and drift

- Natural installed service success: `20261124T071956077Z-match.json`, source `660d37d1059374a54533f6e43faf9d458dbd8801`, baseline artifact `b5631e83473c4e91ed1cf4ca99f74d5833e8d47c`, baseline source `d57690b116b8fea701424ff80e9ebe09579f547d`, candidate/baseline structural SHA `482de5ed345df991a760426752928f0312bd34700f49393e1c28fc29d3fde0d0`, generation/alert/total success all true.
- Statistics-only no-drift control: the first two clean receipts held the same structural SHA while known physical bytes moved from 113,454,219,264 to 113,460,936,704. The second receipt remained `match`; volatile catalog statistics did not occupy the drift key.
- Generator-failure control: installed entry point with an intentionally absent immutable ref exited 1 before generation, wrote `20261124T072232618Z-failure.json`, and fired routed alert `bedd21fd-c137-4bac-ad4a-a9a9d2aafbe9`. The alert remained active until the next clean match resolved it at 07:23:18Z with `match:660d37d1059374a54533f6e43faf9d458dbd8801`.
- Structural-drift control: a private exact-ref repository added one real scanner-visible usage edge at `47ea87ea6d22ca919ffde7d63b010200b4aef321`, leaving the reviewed baseline unchanged. Both candidate and baseline verified; candidate structural SHA `a86e4cdaaf3c1f3955d8504871f931c683e0d78d4e4a79189a5f3e1483295337` differed from baseline `482de5ed…`; `20261124T072423239Z-drift.json` recorded successful generation and alert delivery. Routed alert `bbc21bf6-2701-48e6-9121-a9dace8c4958` remained active until the next clean match resolved it at 07:25:59Z with `match:660d37d1059374a54533f6e43faf9d458dbd8801`.

### 9.4 Staleness, alert routing and cleanup

- The natural no-receipt daily run fired `a88136b8-a86d-413a-8354-663c3e19ac15` (`db-map:run-stale`); the first clean weekly receipt resolved it with `match:660d37d…`.
- A private receipt population whose newest success was 10 days old fired `2576b573-fa62-4cf1-85af-c68d2bffec20` (`db-map:run-stale`); the live fresh receipt resolved it with `fresh-receipt:660d37d…`.
- A private fetched ref `1a0d1afe0bc72ec7c8a0d766c0b6cdc26df533d9` carrying a 54-day-old baseline extraction fired `bc328478-3a4f-4ed2-b9e6-b59e2176df9f` (`db-map:baseline-stale`); the live reviewed baseline resolved it with `fresh-baseline:d57690b…`.
- Each alert carried metadata `owner=CC-INFRA`, `source=dt-db-map`, was promoted to active, posted to Discord, and ended resolved rather than left acknowledged. The checked 8-day and 35-day exact-boundary/plus-one controls remain in the 19-check schedule suite.
- The final live receipt population was seven JSON files, below the retained maximum of eight. A seeded live `run-step7-positive-control` directory proved the cleanup search could detect a `run-*` directory; after its removal the live count was zero. All three private control roots were removed by validated same-command traps.

### 9.5 Trading-app isolation

The app remained at deployed ref `e3a96a8126f0280a9568bb1823b9210783f0afe0`; its tracked worktree was clean, deploy record unchanged, process PID 2822823 retained start time 2026-11-24 00:02:57Z, status online, restarts 715 and unstable restarts 0. The effective weekly/stale units run as `deploy`, use private temporary namespaces and strict filesystem protection, and grant writes only to database-map state, the guarded database-read state, alert log, lock path and governance-repository Git metadata; neither unit has an application restart or signal path.

`REVIEWER: claim-only · The installed Step-7 mechanisms distinguish match, statistics-only movement, held-lock skip, failure, structural drift and both staleness classes; alerts route/resolve correctly; no private runs remain; the app is untouched — name the settling objects and other states consistent with them · HIT: receipts alone could be copied or use alternate roots; final alert rows could hide manual resolution or failed routing; empty run listings could mean no run/manual cleanup/wrong root; unchanged restart counters alone could miss runtime disturbance · re-derived y`

The owner re-derived those leads against the installed hashes and effective units, exact unit/journal windows, receipt objects, complete per-ID alert transitions plus Discord delivery, a seeded cleanup positive control, live app ref/worktree/process start and deploy record. The reviewer was not used as evidence.

### 9.6 First-pass result

OBJ-1 through OBJ-7 are green. OBJ-8 is red: `helpers.json` contains 85 helper rows across 79 files, but only 83 rows carry operation evidence and/or an unresolved reason. The `node-postgres Client` row for `scripts/analysis/b_xstock_bar_availability_c6_timing_read.ts` and the `node-postgres Pool` row for `server/db.ts` carry neither; this fails the registered requirement that every direct-login census member be mapped or explicitly unresolved with a reason. Step 8 must independently verify the live result and this known gap; Step 9 must make both dispositions explicit and regenerate the reviewed artifact.

---

## 10. Step-8 independent verification

Coltrane returned an initial **NOT VERIFIED** at 2026-11-24T08:01:51Z after trying the browser-session refresher and a bare SSH command that did not select his staging key. The documented dedicated-key route was then re-proved as the `coltrane` account with the complete `reviewer-staging-access` verifier: the expected raw key and source-restricted authorization were accepted, logs and the database read were available, `current_user` was `dt_reader`, a write was refused by the database read-only transaction, and a fresh wrong key was denied. The unchanged exact-ref gate was redispatched with that explicit route.

At 2026-11-24T08:09:24Z Coltrane ruled **PROCEED** on Step 8 at exact ref `0d0e25c776b170523e6ea7295aca4aabbf73b508`, carrying the known OBJ-8 correction into Step 9 and authorizing no close. His independent re-derivation found:

- exact live equality as `dt_reader`: 697/697 relation identities and 11,511/11,511 positive-ordinal column identities, zero additions or omissions;
- all seven receipts and their journal correlations: three matches, two held-lock skips, one missing-ref failure and one structural drift; exactly one catalog login in each of four complete-generation windows, zero in the two skips and pre-generation failure, with a separate three-call positive-control window;
- the same structural hash across the statistics-only byte movement, the distinct drift hash and subsequent restoration;
- all five alerts routed to `CC-INFRA` from `dt-db-map`, fired and resolved on the named clean conditions;
- complete install drift PASS, both timers enabled/active, clean `dt-sql`, seven retained receipts and zero live `run-*` directories;
- unchanged app deploy ref/worktree/process start, 715 restarts and zero unstable restarts.

For the required challenge leg he changed one baseline relation's `relkind` from `r` to `v` without changing the 697-row count. The comparator went red with one baseline-only and one live-only identity, proving that a same-cardinality type substitution is detected.

OBJ-8 was the only red objective. His independent enumeration matched the owner result exactly: 85 helper rows across 79 files, 83 covered, and only `scripts/analysis/b_xstock_bar_availability_c6_timing_read.ts` and `server/db.ts` with empty dispositions. Step 9 must give both explicit dispositions and regenerate the reviewed artifact.

---

## 11. Step-9 OBJ-8 correction

The scanner is now version 3. For every direct-login helper row, it continues to attach resolved relation operations and file-local unresolved evidence. If both sets are empty, it emits an explicit `helper_usage` disposition naming the helper kind and stating that constructor-only or delegated use requires hand resolution. The same exact disposition object is present in the helper row and the top-level unresolved inventory. A file containing more than one helper kind gets a distinct reason for each kind rather than reusing the first helper's reason.

The original Step-7 measurement was rerun against the whole five-pattern helper population. The corrected source at R has 85 helper rows across 79 files: 9 Pool, 48 Client, 19 psql-process, 9 dt-sql-login and 0 Python-client rows. There are zero missing or extra helper identities, zero empty dispositions, and exactly two synthesized reasons:

- `scripts/analysis/b_xstock_bar_availability_c6_timing_read.ts` — `node-postgres Client`, operator evidence;
- `server/db.ts` — `node-postgres Pool`, runtime evidence.

The focused core suite passed 45/45 checks. The Linux CI mutation suite killed 39/39 mutants; the local Windows run killed 38 because the executable-mode mutant is explicitly Linux-only (`process.platform !== 'win32'`). The constructor-only fixture contains both Client and Pool in the same file and requires two distinct reasons whose `helper_kind` equals the corresponding helper row; both exact objects must also exist in top-level `unresolved`. A fresh reader reran the production census, the original empty-disposition measurement, both suites and a repeated two-helper probe, then returned CLEAN on the current correction.

The source-only R push correctly made the old scanner-version-2 artifact fail its version fence; CI run `45355392017` is red at the database-map integrity step and is not review authority. The artifact was then regenerated on staging from exact R through the governed `dt_reader` catalog path and pinned Node, TypeScript and `tbls` runtimes. The private candidate verified before transfer, contained 2,118 manifested artifacts plus `manifest.json`, and was archived as SHA-256 `cef2533cb2a42503e545846e4915262ceb5ac6eae5c7c938a3f5a162b578afe1`. C records scanner version 3, source R, structural SHA-256 `b577920d50dd1f3c8d62bffd4ea1c5a653071c2669994b889de3e7e1f38053df`, 85 helper rows across 79 files, zero empty dispositions and both fallback objects identically in `unresolved.json`.

### 11.1 Requested Step-9 ruling

Coltrane: inspect exact R/C above, re-run the 85-row helper census and original empty-disposition measurement, and challenge the multi-helper-file association. Rule **PROCEED** or **SEND BACK** on this Step-9 correction. A PROCEED authorizes installing only the reviewed scanner/config/test increment and replacing the reviewed baseline with C, followed by the real weekly entry point and exact-set verification; it does not authorize batch close.

At 2026-11-24T08:50:27Z Coltrane returned **SEND BACK** on READY ref `54c3e9cda80c7ea8b4bc0bedc878cfc3c2d2e36c` for the incorrect 38/38 review-record count only. His independent census, exact R/C verification, two-helper challenge and missing-association mutant all passed; he measured the exact Linux suite at 39 killed mutants. CI run `45356143871` independently records `db-map core: 45 checks passed` and `db-map mutations: 39 mutants killed`. The record and OBJ-8 row are corrected to 39/39; R and C remain byte-for-byte unchanged.
