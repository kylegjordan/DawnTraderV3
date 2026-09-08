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

### A1.5 THE RESULTING SINK-4 SET

**(a) NOT under a sink-1 prefix ⇒ NEW `OBJ-2` ENTRIES:**
| file | reader | note |
|---|---|---|
| ⛔ `audit/coherency_rules.yaml` | `guardrail-policy.ts:191`, singleton `:742`, **THROWS `:197`** | **the Core-Four risk envelope** |
| ⛔ `config/vts.json` | `vts-runner.ts:519` | stop/target geometry, universe filter |
| `1-system-manual/authority-baseline-v1.json` | `authority-baseline.ts:88`, boot via `boot_orchestrator.ts:76` | warns and continues if absent |
| ⭐ `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` | `price-discontinuity-detector.ts:157` | **NEW — a LIVE SERVICE, found only by instrument 2** |
| ⭐ `audit/reports/regime_entropy_monitor.json` | `telemetry-aggregator.ts:406` (`await fs.readFile`) | **NEW — the `fs.readFile` shape** |
| `bridge/canonical/phase9_predictive-learning.json` | `regime-archiver.ts:26` | |
| `bridge/canonical/mapping-regime-strategy.json` | `schema-validator.ts:37` | no callers found |
| `data/models/ara_model.json` | `training-audit-service.ts:159` | ⛔ **single-file entry, never a `data/models/**` prefix — it is the only tracked file there** (Langston) |

**(b) ALREADY under `server/` ⇒ NO new entry, but LISTED — condition 2, so the derivation records the RIGHT reason:**
`server/config/crypto-universe-filter.json` (`passive-archive/universe-loader.ts:162`) · `server/config/equity-perp-universe.json` (`:44`) · ⭐ `server/legacy/data/legacy_metrics_snapshot.json` (`legacy/metrics_archive.ts`) · and `back_audit_engine.ts:200,:545`, which reads **TypeScript source** off disk at runtime.
★ **All are caught today for SINK 1's reason. esbuild does not bundle a `readFile` target — so the prefix is right and the reason recorded against it was wrong.**

**(c) ⛔ EXCLUDED, WITH THE DISCRIMINATOR NAMED:** `server/version.json` — **static `import` at `server/index.ts:16` ⇒ BUNDLED ⇒ sink 1.** `.claude/cc-session-roster.json` and `.tsc-baseline.json` — **mentioned only in COMMENTS** (`system-alerts.ts:206`, `routes.ts:12473`). `audit/reports/*` other than the entropy monitor — read only by hand-run `server/scripts/diagnostic-*.ts`, never on a live path.

## A2. 🟨 AUDIT FINDING — THREE TRACKED FILES HAVE RUNTIME **WRITERS**, AND ALL THREE ARE LATENT

Instrument 2 surfaced three *tracked* files with writers in production source. **A write to a tracked file dirties the worktree, and `dt-deploy.sh:194-196` REFUSES a dirty worktree** — the `replit.md` family.

**MEASURED ON STAGING, WITH A POSITIVE CONTROL RUN FIRST:** appending one byte to a tracked file made `git status --porcelain --untracked-files=no` report ` M replit.md`, **dirty count 1**; restoring returned it to **0**. ⇒ **the instrument can speak.** With that established: **dirty tracked files on staging = 0**, and all three write targets carry mtime **`2026-03-30T14:40:56Z`** — the clone date. **They have never been written.**

⛔ **AND THE REASON THE STARTUP ONE IS SAFE IS *NOT* THE ONE I FIRST WROTE.** `dumpRoutes` **IS** called, at `server/index.ts:873`. **It writes `diagnostics/phase2f_route_manifest.json` — which `git ls-files --error-unmatch` reports is NOT TRACKED.** The tracked file is `diagnostics/external-pack-v2/proofs/phase2f_route_manifest.json`, **a different path with the same basename** ⇒ **instrument 2's predicted failure mode, firing on my own finding.**
⚠️ **MY FIRST READ SAID `dumpRoutes` WAS NEVER CALLED. That was wrong, and it was wrong because I piped the `git grep` through `head` and the call site was the line after the cut** — `instrument-too-narrow`, again, inside the audit that is about instrument reach.

⚠️⚠️ **AND I DESTROYED ONE OF MY OWN MEASUREMENTS: I used `replit.md` as the positive-control target, and `replit.md` is one of the four files under measurement.** Its mtime now reads `2026-09-08T03:30:19Z` — **that is my control write, 45 seconds before I read it, not the application.** ⇒ ⛔ **I can no longer say whether the app had ever written it on staging. `P19-B12` must re-measure that on a fresh clone; do not cite this reading.**

**DISPOSITION (§9.4 #2): all three added to the `P19-B12` residual list** with `replit.md`. **Latent, not live — same standing as Langston's own `#1016` measurement.**

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

**Two things I got wrong during the audit and corrected before finishing.** I reported a startup hazard that turned out to be safe for a different reason than I first gave — the file it writes isn't the tracked one, just one with the same name. And I ruined one of my own measurements by using the file I was measuring as my test subject; that one has to be re-taken on a clean copy, and I've said so rather than quoting the number I got.
