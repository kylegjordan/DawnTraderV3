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
| ⭐ **STATIC `import x from '*.json'`** — ⛔ **THIS ROW WAS MISSING FROM THE PATTERN SET AND A THIRD READER ADDED IT** | **4 sites** *(the cell said 3 and then named four — corrected r3)* — `strategy-mapper.ts:22`, `validate-canonical.ts:18`, `routes/status.ts:8` (+`index.ts:16`) |

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

## A2b. ⛔⛔ r3 — **"LATENT" IS WITHDRAWN. THE DEPLOY-BLOCKER HAS FIRED, IT IS ON A DAILY TIMER, AND IT IS QUIET RIGHT NOW FOR A REASON THAT EXPIRES IN HOURS.**

⛔ **AND MY OWN LATENCY MEASUREMENT USED THE WRONG INSTRUMENT.** I measured `git status --porcelain --untracked-files=no`. **`dt-deploy.sh:194` runs `git status --porcelain` with NO FLAG**, so it refuses on **untracked-and-unignored files too** — a strictly wider condition than the one I tested. ⭐ **Re-measured with the exact command: still 0. The conclusion survives; the instrument that produced it did not.**

### THE MECHANISM, RE-DERIVED AT THE OBJECT
`autonomy-scheduler.ts:608` registers **`canonical_bridge_sync`**, and `:1056` **explicitly starts it — `// Daily — B59`**. It calls `syncCanonicalBridge` (`:619-620`), which `atomicWrite`s **three TRACKED files**: `bridge/canonical/mapping-regime-strategy.json` (`:252`), `DawnTrader_Regime_Strategy_Mapping.md` (`:259`), `DawnTrader_Regime_Strategy_Signal_Pattern_Mapping.md` (`:265`). ⛔ **`sync-canonical-bridge.ts:136-137` stamps `updatedAt`/`generatedAt` with `new Date().toISOString()`, so EVERY RUN PRODUCES DIFFERENT CONTENT** ⇒ the worktree goes dirty ⇒ `dt-deploy` exits 3. **No human call needed.** `phase9_predictive-learning.json` is the same shape on a **weekly** task (`:636`, started `:1057`).

### ⛔⛔ C2 — IT WAS ALREADY WITNESSED AND WRITTEN DOWN, AND I INFERRED FROM MTIMES A FIRING THAT WAS ON THE RECORD
⛔ **`RUNNING_ISSUES` #402 IS THIS EXACT DEFECT, OPEN SINCE 2026-06-30 — Langston's own P19-B6.9 Step-8 catch:** *"Generated `bridge/canonical/mapping-regime-strategy.json` is TRACKED but re-stamped every build → perpetual dirty staging working tree … verified on staging: the only diff was the 2 timestamp lines."* And its **2026-08-17 annotation records a deploy ACTUALLY REFUSED** by the same symptom (`P19-B-FEEVIABILITY`).
⇒ ★ **I RE-DISCOVERED A KNOWN DEFECT AND PRESENTED IT AS NEW.** ⚠️ **Why my §9.5(b-ii) ledger search missed it: I searched the ledger for the COMPONENT I was auditing — the drift job — and never for `bridge/canonical/`, because nothing in my batch pointed there until the writer census did.** **A ledger search scoped to the batch's own subject cannot find a defect the batch discovers in a NEIGHBOUR.**
⚠️ **CITATION CORRECTION, and I checked rather than repeating it: Langston cited "#4482" for the refusal record. NO SUCH ISSUE EXISTS** — the only `4482` in the corpus is a LINE NUMBER inside `#517`. **The refusal is recorded in `#402`'s own 2026-08-17 annotation, dated 08-17 rather than 09-06.** *(Control: the same instrument returns `#402` and `#1016` correctly.)* **The substance stands; the pointer does not.**
★ **AND MY CENSUS SETTLES THE QUESTION `#402` LEFT OPEN.** It asks: *"verify whether any consumer reads this file from disk → if yes, (b); if purely generated-and-unread, (a)."* Its annotation had concluded consumption was **build-time only** (`strategy-mapper.ts:22`), leaving the `SYSTEM_IMPACT_MAP.md:810` Mapping-Drift-tab disk read unsettled. ⇒ ⭐ **`routes.ts:2083-2085` READS IT FROM DISK at runtime, in `GET /api/system/canonical-map` behind `authenticateToken`. THE ANSWER IS OPTION (b), CONTENT-HASH COMPARE. GITIGNORE (a) IS OFF THE TABLE.**

### THE MTIMES — AND THE OBJECT I GOT WRONG
`DawnTrader_Regime_Strategy_Mapping.md` **`2026-09-06 08:12:17.095Z`** and `..._Signal_Pattern_Mapping.md` **`.096Z`** — **one millisecond apart, which is the two sequential `atomicWrite`s**; `mapping-regime-strategy.json` **`09:29:58Z`**. ✅ **CONTROL: every OTHER file in `bridge/canonical/` still carries `2026-03-30 14:40:56` — the clone date. The instrument discriminates.**

### WHY THE TREE IS CLEAN AT THIS MOMENT, AND WHY THAT IS NOT REASSURING
⛔ **CORRECTION (Langston C2): THE 09-07T07:50 DEPLOY ERASED NOTHING THERE.** The json's mtime is **`09-06 09:29:58`, TEN SECONDS BEFORE the `09:30:08` reset** — so that mtime is the file being **CLEANED**, not written. ★ **And it cannot have been `dt-deploy`, because `dt-deploy.sh:194-196` REFUSES on a dirty tree rather than resetting it** ⇒ **a human cleaned it by hand so the deploy could proceed, which is exactly the `#402` refusal-and-manual-clean loop.** The restart nonetheless **reset the 24-hour timer** (`pm2` reports up since `2026-09-07T07:50:11Z`, 604 restarts). ⇒ ★ **THE ONLY REASON DEPLOYS HAVE KEPT WORKING IS THAT THEY HAVE BEEN FREQUENT ENOUGH TO KEEP RESETTING THE CLOCK.** **A gap longer than 24h between restarts leaves a dirty tree, and the next deploy is REFUSED with exit 3.**

### ⭐ PRE-REGISTERED, FALSIFIABLE, AND CHEAP — WRITTEN BEFORE THE EVENT
> ⛔ **AMENDED BEFORE THE EVENT (Langston C1). IT PREDICTS EXACTLY ONE FILE: `bridge/canonical/mapping-regime-strategy.json`.**
> **IF no deploy or restart occurs before ~`2026-09-08T07:50:17Z`, THEN after that time `git status --porcelain` on staging will list that ONE file as modified — and NOT the two `.md` files.**
⛔⛔ **MY ORIGINAL PREDICTED THREE AND WOULD HAVE FAILED ITS OWN TEST ON A MECHANISM THAT IS CORRECT.** ★ **The fresh stamp is in `generateBridgeJSON` ONLY (`:136-137`); the two markdown generators at `:155` and `:203` interpolate `${CANONICAL_SCHEMA_METADATA.updatedAt}` — a CONSTANT — so their output is byte-identical run to run.** ✅ **Confirmed independently by the reflog: the two `.md` files were written `09-06 08:12:17.095/.096Z` and have since survived FIVE `git reset --hard` operations (`09-06 09:30:08, 10:20:16, 10:38:50, 11:09:50`, `09-07 07:49:58`) WITH THEIR MTIMES UNCHANGED ⇒ they were clean at every one.**
✅ **AND THE TIMER IS CONFIRMED BY AN INTERVAL I HAD NOT CITED: restart `09-05 08:11:58` → write `09-06 08:12:17` = 24h + 19s.** Every gap since is under 24h, which is why the tree is clean now.
**If that one file is not modified, the mechanism is wrong and I withdraw it.** ⚠️ **A deploy in the meantime VOIDS the test rather than passing it** — it resets the clock, which is the very thing being described.

### ✅ C3 — **LANGSTON HAS WITHDRAWN HIS CONDITION 3. `replit.md` IS SINK 4 *AND* STAYS ON THE WRITER LIST.**
★★ **HIS RULING NAMES THE PREMISE UNDER ALL THREE WRONG REASONS, WHICH IS WORTH MORE THAN THE ANSWER: *"the app writes it" and "the app reads it" ARE ANSWERS TO DIFFERENT CENSUSES, AND THIS FILE IS IN BOTH.*** ⇒ **the three reasons were not three attempts at one question — they were one question mistaken for another, three times.**
**`context-loader` IS reachable: `server/index.ts:624` `await import('./services/context-loader')` in the boot sequence, and `routes.ts:14492` from a live route.** Both are **dynamic** imports, so an `import … from` census returns zero — **the same instrument-reach failure this document catalogues, landing on the one entry A1.4b was written to fix.**
⇒ ✅ **`replit.md` IS A SINK-4 MEMBER (reader reachable and UNCONDITIONAL at boot, `index.ts:624`) AND A WRITER-CLASS MEMBER (`routes.ts:22003`). Both lists. `P19-B12` keeps the writer entry; `P-2` gains the path.**

### ✅ C4 — IT DOES NOT STAY A RESIDUAL. IT HAS ITS OWN HOME.
> **`HOME: B-CANONICAL-BRIDGE-CHURN, under existing #402, owner CC-A, placed in PHASE_19_PLAN at row 4.57, immediately after B-DRIFT-RUNTIME-PREDICATE`**
**Langston's reason: a daily task that CAN refuse deploys, HAS refused one, and sits under an issue open since June has outgrown a residual list.** It is small and disjoint from this batch, so there is no reason to interleave them.
⭐ **AND THE FIX IS NO LONGER AN OPEN a/b: `#402` said *"verify whether any consumer reads this file from disk → if yes, (b)"*, and `routes.ts:2083-2085` does. OPTION (b), CONTENT-HASH COMPARE — skip the write when only the timestamps would change. GITIGNORE (a) IS OFF THE TABLE.**
**The other six writers stay `P19-B12` residuals.**

**DISPOSITION CHANGE: A2's *"LATENT"* is WITHDRAWN** — it is a live, scheduled deploy-blocker with a named next-fire time and a witnessed refusal on the record.

## A4. ✅ STEP-8 CONDITIONS — LANGSTON, 2026-09-08, BOTH RE-DERIVED AT THE OBJECT

### ⛔⛔ CONDITION 1 — **SINK 4 IS MEASURED-REACHABLE. MY "EMPTY RESULT" WAS A NARROW PREDICATE, NOT AN ABSENCE.**
At Step 8 I reported that a search for a commit touching `audit/coherency_rules.yaml`, `config/vts.json` or the authority baseline **without** `server/` files returned nothing over 400 commits — stated as an empty result with its window, which is the right FORM for a null. ⛔ **But the predicate was narrow in a way I did not state: I searched THREE of the EIGHT sink-4 entries.**
⭐ **HIS COUNTEREXAMPLE, RE-DERIVED HERE:** **`8ef70628d31f456f53bbb4967c3fa5fb724f3cae`** (2026-06-11, *"B-4.7 housekeeping"*). Three files — `bridge/canonical/mapping-regime-strategy.json` plus two `.md` — and **nothing under `server/`, `client/` or `shared/`** (`git diff-tree -r --name-only … -- server client shared` returns EMPTY). Run through both predicates: **OLD = 0, NEW = 1, discriminates.**
⇒ ★ **That file is read from disk at runtime by `routes.ts:2083-2085`. It is a live config, undeployed, and the old gate would have logged `NO_RUNTIME_PATHS` and said nothing.**
⛔ **THE RECORD MUST NOT SAY "unreachable in practice" — it is reachable, with a named instance.** ★ Same class as `feedback_narrow_predicate_false_absence`: **a null is only as wide as the predicate that produced it, and I stated the window but not the predicate.**

### ⛔ CONDITION 2 — **ONLY `/usr/local/bin/dt-deploy-drift.sh` IS LIVE. THE `/opt/discord-bridges` COPY IS A MIRROR WITH ZERO INVOKERS.**
`grep -rn 'discord-bridges/dt-deploy-drift' /opt/discord-bridges /usr/local/bin /etc/systemd/system /etc/cron.d` → **no matches** (exit 1). ✅ **CONTROL, so the null is evidenced:** the same instrument DOES find the live invoker — `/var/spool/cron/crontabs/langston` carries `17 * * * * /usr/local/bin/dt-deploy-drift.sh`.
⇒ **`/opt/discord-bridges/dt-deploy-drift.sh` exists only as `deploy.sh`'s staging source (`BRIDGE_DIR`, `:14`), never as a runtime artifact.** ⛔ **Recorded because an un-invoked second copy is exactly the `#1004` stale-copy shape this batch's own hash check exists to catch — a future reader who updates the mirror and not `/usr/local/bin` changes nothing and will believe they have.**

### ⭐ AND HIS POPULATION REPLACES MY SINGLE FIXTURE
I verified with ONE real commit and said plainly it was one, chosen by me, and not shown representative. **He ran both predicates over 4,890 commits since 2026-05-01 from the backup bare repo: the discriminating class (OLD=0, NEW>0) has 66 MEMBERS.** Qualifying files across them: `drizzle/migrations/*` ×149, `package.json` ×6 commits, `scripts/db-migrate.ts` ×2; **nine are MANIFEST-only — the exact shape the note now fires on, so that branch has a real population too.**
★ **My 400-commit window simply sat in a dense `server/`-touching stretch.** ⇒ **the fixture was representative of a recurring class; I could not have known that from the window I used, and the honest report of one was still the right report to make.**

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
| **P-2** | ⛔ **ADD THESE NINE PATHS, ENUMERATED — NOT A COUNT (Langston C3: the cell said "eight" against a seven-row table, the same count-vs-table mismatch as his Step-1 condition 4).** `audit/coherency_rules.yaml` · `config/vts.json` · `1-system-manual/authority-baseline-v1.json` · `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` · `bridge/canonical/phase9_predictive-learning.json` · `bridge/canonical/mapping-regime-strategy.json` · `data/models/ara_model.json` **(single-file entry, never a `data/models/**` prefix)** · `replit.md` · `scripts/db-migrate.ts`. | **A1.5(a)**, C3 |
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
