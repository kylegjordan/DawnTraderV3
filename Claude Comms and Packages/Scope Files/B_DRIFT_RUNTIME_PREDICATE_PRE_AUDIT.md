# B-DRIFT-RUNTIME-PREDICATE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-DRIFT-RUNTIME-PREDICATE` · **owner:** CC-A · **issue:** `#1016` · **plan row:** `PHASE_19_PLAN` 4.56 · **change-class:** `non_architecture`
**Step 1 APPROVED** by Langston at `521e315eb` with four conditions; conditions 2-4 landed at `d5dd5d7c7`. **This document discharges condition 1.**
**Ref for every citation:** `origin/migration/aws-supabase` at `d5dd5d7c7`. **Staging readings taken 2026-09-08 ~03:30Z.**

---

## 0. ⛔ PREVIOUSLY STATED / NOW / REASON — READ FIRST

| | |
|---|---|
| **PREVIOUSLY STATED** | Sink 4 has **7** members, of which `replit.md` is one. |
| **NOW** | Sink 4 has **8 confirmed members**, `replit.md` is **not one of them**, and **one new member sits in a live service**. |
| **REASON** | Langston condition 3 moved `replit.md` to `P19-B12` (the app *writes* it — a deploy blocker, not a config it reads). The call-shape census below added `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` and `audit/reports/regime_entropy_monitor.json`. |

| | |
|---|---|
| **PREVIOUSLY STATED** | *(scope §4)* `server/config/crypto-universe-filter.json` and `server/config/equity-perp-universe.json` are sink-4 members already covered by the `server/` prefix. |
| **NOW** | **Confirmed, and a third file of that shape must be added to the same list: `server/legacy/data/legacy_metrics_snapshot.json`** (`server/legacy/metrics_archive.ts`). |
| **REASON** | Instrument 2 below reaches files by name rather than by call site, and returned one the scope's list had missed. **No path-set change** — the derivation changes. |

| | |
|---|---|
| **PREVIOUSLY STATED** | Nothing. *(A hazard I began to write up and did not send.)* |
| **NOW** | ⛔ **`server/version.json` is NOT a sink-4 member — it is a static `import` at `server/index.ts:16`, so esbuild BUNDLES it. Sink 1.** |
| **REASON** | It appeared in instrument 2's output and looks exactly like a sink-4 file. **The discriminator is the call shape, not the file's extension or location** — which is this batch's whole thesis, applied to itself. |

| | |
|---|---|
| **PREVIOUSLY STATED** | *(this document, r1)* Sink 4 has **8** confirmed members; **3** tracked files have runtime writers; `replit.md` is not sink-4 *"because the app writes it, not a config it reads"*. |
| **NOW** | Sink 4 has **7**; **7** tracked files have runtime writers; and `replit.md` **IS** read — it is struck on **reader reachability** instead. |
| **REASON** | A third reader, at `98c8a1f80`. `audit/reports/regime_entropy_monitor.json` is a **log the app appends to**, not a config — struck from sink 4, moved to the writer class. `server/legacy/data/legacy_metrics_snapshot.json` was **comment-only** — instrument 2's basename failure firing a second time, which I had just led §0 with as a *caught* error. Two cited readers were **wrong objects** (a declaration, and a function with zero callers). And the pattern table had **no row for static `import x from '*.json'`** — the very shape whose bundling I used by hand to exclude `version.json`. |

---

# PART A — THE AUDIT

## A1. ⛔ CONDITION 1 — THE SINK-4 CENSUS BY CALL SHAPE

### A1.1 THE POPULATION, NAMED
**586 tracked `.ts` files under `server/` and `shared/`**, excluding `/tests/`, `*.test.ts`, `*.spec.ts`, plus `scripts/db-migrate.ts`. ⛔ **`client/**` is EXCLUDED and the reason is not laziness: client code runs in a browser and has no filesystem** — it reaches data over HTTP, which is not a sink-4 shape.

### A1.2 THE PATTERN SET, AND EACH SHAPE COUNTED SEPARATELY
| call shape | sites |
|---|---|
| `readFileSync` | **60** |
| `fs.readFile(` — **the shape Langston's first census could not see** | **43** |
| `readdirSync` | **15** |
| `require(` | **15** |
| `createReadStream` | **3** |
| `existsSync` — reads no content but **gates behaviour** | **114** |
| `import(` (dynamic) | **377** — overwhelmingly TS modules, which esbuild bundles ⇒ **sink 1, not sink 4** |
| `fsp.readFile` · `promises.readFile` · `await readFile(` | **0 each** — spellings checked and absent, so their zero is a measurement, not an omission |
| ⭐ **STATIC `import x from '*.json'`** — ⛔ **THIS ROW WAS MISSING FROM THE PATTERN SET AND A THIRD READER ADDED IT** | **3 sites** — `strategy-mapper.ts:22`, `validate-canonical.ts:18`, `routes/status.ts:8` (+`index.ts:16`) |

⛔⛔ **AND THE MISSING ROW IS NOT A TYPO — IT IS THE CENSUS FAILING ITS OWN TEST.** A static JSON import **is bundled by esbuild**, so it is **sink 1, not sink 4** — and I used exactly that discriminator to EXCLUDE `server/version.json` while having no row that would find the shape systematically. **`version.json` was caught only by instrument 2's basename luck; `mapping-regime-strategy.json` was not caught at all.** ★ **A discriminator I applied by hand to one file, and did not encode as a pattern, is a discriminator that works once.**

### A1.3 ⛔⛔ TWO INSTRUMENTS, DELIBERATELY CHOSEN TO FAIL DIFFERENTLY — **AND THEY DISAGREED IN BOTH DIRECTIONS**
> ★ **This is the `B-RULES-1e` A3 lesson applied: two instruments AGREEING is not a control; a control is one that would FAIL DIFFERENTLY.** Langston's condition 1 exists precisely because his own single-shape census returned *nothing new* and was wrong.

**INSTRUMENT 1 — from the CALL SITE, anchored on `process.cwd()` / `__dirname`.**
**119 sites · 116 literal-path · 3 variable-path ⇒ 9 tracked non-source files.**
⛔ **ITS REACH LIMIT, DEMONSTRATED NOT ASSERTED: it returned neither `server/config/crypto-universe-filter.json` nor `data/models/ara_model.json`.** The latter is `path.join(MODELS_DIR, \`${component.toLowerCase()}_model.json\`)` at `training-audit-service.ts:159` — **no `cwd`/`__dirname` token on that line, so it is invisible to this instrument BY CONSTRUCTION.**

**INSTRUMENT 2 — from the FILE SIDE: 1,377 tracked data files (`.json .yaml .yml .txt .ndjson .csv`, excluding `client/`, the lockfile, `tsconfig`, `drizzle/migrations/`), each basename grepped against the production source.**
**23 hits.**
⛔ **ITS OWN FAILURE MODE, AND IT FIRED: BASENAME COLLISION.** It reported `scripts/codex-export/MANIFEST.txt` as read by `scripts/db-migrate.ts` — **false. `db-migrate.ts` reads `drizzle/migrations/MANIFEST.txt`.** It also returned `server/tsconfig.json ← server/tsconfig.json` (self-reference) and several `audit/reports/*.json` read only by hand-run diagnostic scripts.

⇒ ★★ **INSTRUMENT 1 UNDER-REPORTS (9); INSTRUMENT 2 OVER-REPORTS (23). NEITHER IS THE ANSWER, AND THEIR UNION IS A CANDIDATE SET, NOT A PROOF.**

### A1.4 ⛔ WHAT NEITHER INSTRUMENT CAN REACH — STATED, AS CONDITION 1 REQUIRES
**THE VARIABLE-PATH CLASS IS UNREACHABLE BY ANY GREP, BY CONSTRUCTION.** Four sites found, and **the count is a floor, not a population**:
- `server/routes/vts.ts:1440` — `logs/virtual_trades/${dateStr}.json`
- `server/services/c13-validation-service.ts:76`, `:227` — `logs/validation/...${sessionId}...`
- `server/services/training-audit-service.ts:159` — `${component.toLowerCase()}_model.json`

✅ **THE FIRST THREE ARE HARMLESS AND THAT IS MEASURED, NOT ASSUMED: `.gitignore:35` is `logs/`, so their targets are UNTRACKED ⇒ they cannot be sink-4 members.** The fourth resolves to `data/models/ara_model.json`, which **is** tracked and **is** in the set.
⛔ **A future variable-path read of a tracked file would be invisible to every instrument used here. That is a permanent limit of this method, not a gap I can close with one more search.**

### A1.4b ⭐ THE STANDARD, MADE EXPLICIT BECAUSE THE DRAFT APPLIED TWO OF THEM
⛔ **A SINK-4 MEMBER NEEDS AT LEAST ONE *REACHABLE* READER.** If no live path reads it, an undeployed change to it cannot change what the server does — which is the criterion, so a dead reader cannot qualify a file.
⚠️ **The draft struck `replit.md` for the reason *"the app writes it, not a config it reads"* — THAT REASON IS FALSE: `context-loader.ts:88-90` does read it via `parseFile`.** It is struck anyway, on the correct reason: **`context-loader` has zero importers, so the read is dead.** ⚠️ **And the draft simultaneously KEPT `mapping-regime-strategy.json` while noting *"no callers found"* against it — two standards in one table.** Under the rule above that file still qualifies, but **on its OTHER, live readers**, not on the dead one I had cited.

### A1.5 THE RESULTING SINK-4 SET

**(a) NOT under a sink-1 prefix ⇒ NEW `OBJ-2` ENTRIES:**
| file | reader | note |
|---|---|---|
| ⛔ `audit/coherency_rules.yaml` | `guardrail-policy.ts:191`, singleton `:742`, **THROWS `:197`** | **the Core-Four risk envelope** |
| ⛔ `config/vts.json` | `vts-runner.ts:519` | stop/target geometry, universe filter |
| `1-system-manual/authority-baseline-v1.json` | `authority-baseline.ts:88`, boot via `boot_orchestrator.ts:76` | warns and continues if absent |
| ⭐ `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` | `price-discontinuity-detector.ts:157` | **NEW — a LIVE SERVICE, found only by instrument 2** |
| ⛔ ~~`audit/reports/regime_entropy_monitor.json`~~ | **STRUCK — IT IS A LOG THE APP APPENDS TO, NOT A CONFIG IT READS** | `telemetry-aggregator.ts:388-417`: the read at `:406` exists only so `history.push()` can append and truncate to 100 before `:416` **rewrites the file**. **Nothing in its content reaches a decision** ⇒ a false positive in the predicate. **Moves to the A2 writer class.** |
| `bridge/canonical/phase9_predictive-learning.json` | ⛔ **NOT `regime-archiver.ts:26` — that line is `export const CANONICAL_PATH = path.join(...)`, a DECLARATION, never dereferenced in that file.** The live reader is `recalibrate-predictive-weights.ts:221,:273`, reached from `routes/calibration.ts:177`, mounted at `routes.ts:22441` | ⚠️ **and it is ALSO written from that route — see A2** |
| `bridge/canonical/mapping-regime-strategy.json` | ⛔ **`schema-validator.ts:37` is real but `validateSchemaVersions` has ZERO callers — a dead reader, which under A1.4b cannot qualify it.** It qualifies on its LIVE readers: **static JSON imports** at `strategy-mapper.ts:22` and `validate-canonical.ts:18` (live via `market-indicators.ts`), **plus a runtime read at `routes.ts:2083-2085`** | ⚠️ **the static import is BUNDLED ⇒ sink 1 — but `bridge/` is not a sink-1 prefix, so the path is still needed. The SINK TAG changes, the entry does not.** |
| `data/models/ara_model.json` | `training-audit-service.ts:159` | ⛔ **single-file entry, never a `data/models/**` prefix — it is the only tracked file there** (Langston) |

**(b) ALREADY under `server/` ⇒ NO new entry, but LISTED — condition 2, so the derivation records the RIGHT reason:**
`server/config/crypto-universe-filter.json` (`passive-archive/universe-loader.ts:162`) · `server/config/equity-perp-universe.json` (`:44`) · and `back_audit_engine.ts:200,:545`, which reads **TypeScript source** off disk at runtime.
★ **All are caught today for SINK 1's reason. esbuild does not bundle a `readFile` target — so the prefix is right and the reason recorded against it was wrong.**

⛔⛔ **AND `server/legacy/data/legacy_metrics_snapshot.json` IS STRUCK FROM (b) — INSTRUMENT 2's BASENAME FAILURE FIRING A *SECOND* TIME, AND I DID NOT CATCH IT.** Its only occurrence in production source is a **doc comment**, `metrics_archive.ts:28` (`* See: ... for archived data`); that file imports only `crypto` and its banner reads `ARCHIVE SEALED — DO NOT USE IN PRODUCTION CODE`. ⚠️ **I led §0 with instrument 2's collision failure as a caught error, and shipped a second instance of it three lines later.**

**(c) ⛔ EXCLUDED, WITH THE DISCRIMINATOR NAMED:** `server/legacy/data/legacy_metrics_snapshot.json` (comment-only) · `server/version.json` — **static `import` at `server/index.ts:16` ⇒ BUNDLED ⇒ sink 1.** `.claude/cc-session-roster.json` and `.tsc-baseline.json` — **mentioned only in COMMENTS** (`system-alerts.ts:206`, `routes.ts:12473`). `audit/reports/*` other than the entropy monitor — read only by hand-run `server/scripts/diagnostic-*.ts`, never on a live path.

## A2. 🟨 AUDIT FINDING — **SEVEN** TRACKED FILES HAVE RUNTIME WRITERS. ALL LATENT ON STAGING TODAY.

**A write to a tracked file dirties the worktree, and `dt-deploy.sh:194-196` REFUSES a dirty worktree** — the `replit.md` family Langston named at Step 1. ⛔ **The draft said THREE and did not name them, so the one correction it made was the only thing a reviewer could check. Named in full now.**

| # | tracked file | writer | reached by |
|---|---|---|---|
| 1 | `audit/reports/regime_entropy_monitor.json` | `telemetry-aggregator.ts:416` | live aggregation — ⛔ **also struck from sink 4 (A1.5): it is this, a log, not a config** |
| 2 | `diagnostic-reports/phase-41F-L-e2e-lineage.ndjson` | `lineage.ts:32` append | live tracing |
| 3 | ~~`diagnostics/external-pack-v2/proofs/phase2f_route_manifest.json`~~ | ⛔ **NOT A MEMBER — see the correction below** | — |
| 4 | ⭐ `bridge/canonical/phase9_predictive-learning.json` | **`recalibrate-predictive-weights.ts:269` `fs.writeFileSync(CANONICAL_PATH, ...)`** (+ `copyFileSync:190`, `unlinkSync:196`) | ⛔⛔ **the authenticated route `POST /api/calibration/ml/recalibration/trigger`** |
| 5 | ⭐ `docs/strategy-validation-report.md` | `routes.ts:15600` `fs.writeFile` | an API route |
| 6 | ⭐ `docs/strategy-validation-stageb-report.md` | `routes.ts:15637,:15645-15646` | an API route |
| 7 | ⭐ `data/models/ara_model.json` | `training-audit-service.ts:270` | — |
| — | `replit.md` (Langston, Step 1) | `routes.ts:21998` append | an authenticated API route |

⛔⛔ **#4 IS THE ONE THAT MATTERS AND IT IS A DOUBLE: `phase9_predictive-learning.json` IS SIMULTANEOUSLY A SINK-4 MEMBER *AND* A ROUTE-WRITABLE TRACKED FILE.** ★ **So one authenticated call both changes what the running system reads AND can block every subsequent deploy.** ⚠️ **The draft listed it as a plain read.**

⛔ **WHY MY WRITER CENSUS MISSED FOUR OF THESE, STATED AS AN INSTRUMENT LIMIT RATHER THAN AN OVERSIGHT:** instrument 2's population was `.json .yaml .yml .txt .ndjson .csv` — **`.md` IS EXCLUDED BY CONSTRUCTION**, so both `docs/*.md` writers were unreachable by it; and instrument 1 anchors on `cwd`/`__dirname` **at the call site**, so a write through a module constant (`CANONICAL_PATH`, `MODELS_DIR`) is invisible to it. ⇒ **the two instruments' blind spots OVERLAP on exactly this class, which is why a third reader found it and neither of mine could have.**

### THE LATENCY MEASUREMENT — CONTROL FIRST, AND ONE READING IS DESTROYED
**POSITIVE CONTROL, RUN BEFORE THE MEASUREMENT:** appending one byte to a tracked file made `git status --porcelain --untracked-files=no` report ` M replit.md`, **dirty count 1**; restoring returned it to **0** ⇒ **the instrument can speak.** With that established: **dirty tracked files on staging = 0**, and files 1, 2 and 3 carry mtime **`2026-03-30T14:40:56Z`**, the clone date — **never written.**
⚠️⚠️ **I USED `replit.md` AS THE CONTROL TARGET AND `replit.md` IS ONE OF THE FILES UNDER MEASUREMENT.** Its mtime now reads `2026-09-08T03:30:19Z` — **my control write, 45 seconds before I read it.** ⛔ **I cannot say whether the app had ever written it. `P19-B12` re-measures on a fresh clone; DO NOT CITE THAT READING.** ⚠️ **Files 4-7 were not mtime-checked at all** — stated rather than implied.

⛔ **AND THE STARTUP WRITER IS SAFE FOR A REASON I FIRST GOT WRONG.** `dumpRoutes` **IS** called, at `server/index.ts:873` — my first read said it never was, **because I piped `git grep` through `head` and the call site was the line after the cut** (`instrument-too-narrow`, inside the audit about instrument reach). It is safe because **it writes `diagnostics/phase2f_route_manifest.json`, which `git ls-files --error-unmatch` reports is NOT TRACKED**; the tracked file is `diagnostics/external-pack-v2/proofs/...`, **a different path with the same basename** ⇒ instrument 2's failure mode firing on my own finding.

**DISPOSITION (§9.4 #2): all seven added to the `P19-B12` residual list.** **LATENT on today's evidence, and the evidence covers three of seven.**

## A3. §9.5(a) CENSUS AT THE HOP + ENTRY-POINT ENUMERATION
**Entry points to the predicate, repo-wide:** `runtime()` at `dt-deploy-drift.sh:265` is called from **exactly one** place — the list comprehension at `:266-268` inside the same embedded reader. **One producer, one consumer.** No scheduler, timer or second caller: the script's only entry point is the `17 * * * *` cron installed by `comms-infra/discord/deploy.sh`.
**Who WRITES / READS / MUTATES / DELETES the value:** `RUNTIME_N` written once (`:409`), read at `:429 :443 :459 :489`; `runtime_files` written to `$WORK/rtlist.txt` (`:277`), read as `LIST`/`SHOWN` (`:411`, `:458`). **Deleters: none — `$WORK` is an `mktemp -d` removed on exit.**
**Sources consulted:** the code at the ref · the live alert store and staging worktree · `SYSTEM_IMPACT_MAP.md:3627` · `SYSTEM_MANUAL.md` **(judged N/A — no architecture, strategy, regime, filter, pipeline or maths surface)** · `RUNNING_ISSUES` `#1016`/`#1004`/`#652` + `BATCH_CATALOG` + the drift-line progress report · **`bridge/canonical/` NOT consulted — every component here postdates the 2026-01/02 governance change, so it has no coverage.**

---

# PART B — THE IMPLEMENTATION PLAN
> **Every item names the audit finding it falls out of. Anything with no audit treatment is flagged `UNAUDITED`.**

| # | item | falls out of |
|---|---|---|
| **P-1** | Replace `RUNTIME = ('server/','client/','shared/')` with a **sink-tagged set**; every entry carries its sink number and its reader/executor line as an in-file comment. Add the in-file note that *"what the deploy executes"* is **not** the criterion, citing `dt-deploy.sh:204`. | **A1.5**, scope §4 |
| **P-2** | Add the **eight** A1.5(a) paths. `data/models/ara_model.json` as a **single-file** entry, not a prefix. | **A1.5(a)** |
| **P-3** | Add the A1.5(b) files to the in-file comment as **already-covered-by-`server/`, listed so the reason is recorded** — no path-set change. | **A1.5(b)**, condition 2 |
| **P-4** | `MANIFEST.txt` gets its own body line naming the **hard-fail** (`db-migrate.ts:140-148`, validating on every invocation via `:152-156`). | scope §4b, OBJ-3 |
| **P-5** | In-file note that `CODE_PREFIXES` (`config.mjs:92`) was read, is wider, and is **deliberately not imported** — different question. **No shared constant.** | scope §5, OBJ-5 |
| **P-6** | Extend `scripts/analysis/test-drift-shape-guards.sh`: a range of only a migration **opens** the gate; only `authority-baseline-v1.json` **opens** it; only `BATCH_CATALOG.md` does **not**. **Each states its expected output in-file BEFORE it runs**, and each is run against the **pre-fix** reader first as the positive control. | **A1.3**, `#744` rider, OBJ-6 |
| **P-7** | Record in-file the **unreachable variable-path class** (A1.4) as a permanent limit of the predicate. | **A1.4**, condition 1 |
| **P-8** | `SYSTEM_IMPACT_MAP.md:3627` — update the drift-job entry's predicate description. | scope §2 |
| **P-9** | `RUNNING_ISSUES` `#1016`: record the census, the four `P19-B12` residuals, and the contaminated `replit.md` reading. | **A2** |

⛔ **NOT IN THE PLAN, AND DELIBERATELY SO:** OBJ-4 (**CUT** by Langston) · `dt-deploy.sh` (the authority, unmodified) · `--pre-restart` (caller-supplied, unknowable statically) · `ecosystem.config.cjs` (`#652`) · the four `P19-B12` residuals.

## PLAIN-LANGUAGE SUMMARY
The job that warns us when the live server is behind decides "does this waiting work matter?" by looking at which folder a file is in. The audit's job was to find every file that can change what the server does but doesn't live in one of those folders.

**I used two different search methods on purpose, chosen so they would fail in opposite ways — and they did.** One found nine files and missed the two most important; the other found twenty-three but wrongly included several, including one it matched only because two different files share a name. Neither was right alone. That matters more than the list itself: Langston's own single search for this had come back "nothing new," and it had missed the file holding our risk limits.

**There is also a limit I can't search my way out of, and I've written it down rather than papered over it:** some code builds a filename while it runs, so no search of the text can find what it opens. Four such places exist; three are harmless because their files aren't stored in the repository at all, and the fourth I already know about.

**A third reader then found six more things, and four of them were mine to own.** The list of files was wrong in both directions: one I had included is really just a logbook the program writes to itself, and one I had included is mentioned only in a comment — the second time that same mistake got through, three lines after I had written up the first time as an example of catching it. Two of the files were listed against the wrong piece of code: one pointed at a line that only *names* the file without opening it, and another at a function nothing ever calls. **And my list of ways a program can open a file was missing one of the commonest** — the very one I had used, by hand, to correctly rule a file out. A check I applied by hand once and never wrote into the method is a check that works once.

**The most consequential thing it found:** one of these files is *both* something the program reads *and* something an ordinary authenticated request can rewrite. So a single call can change what the running system reads **and** block every deployment afterwards.

**Two things I got wrong earlier in the audit and corrected before finishing.** I reported a startup hazard that turned out to be safe for a different reason than I first gave — the file it writes isn't the tracked one, just one with the same name. And I ruined one of my own measurements by using the file I was measuring as my test subject; that one has to be re-taken on a clean copy, and I've said so rather than quoting the number I got.
