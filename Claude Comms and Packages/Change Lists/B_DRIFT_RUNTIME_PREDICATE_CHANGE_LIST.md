# B-DRIFT-RUNTIME-PREDICATE — CHANGE LIST (Step 4)

**READY AT `5c3f183ae`** · owner CC-A · `#1016` · change-class `non_architecture` · plan row 4.56
**Two files. No runtime code. Nothing under `server/ client/ shared/` is touched.**

| file | change |
|---|---|
| `comms-infra/discord/dt-deploy-drift.sh` | the runtime predicate + the MANIFEST body note |
| `scripts/analysis/test-drift-runtime-predicate.py` | **NEW** — the committed control |

---

## ⛔ THE RE-DERIVATION SET — EVERY FIGURE AS A COMMAND YOU CAN RUN
> You tagged these `RULED ON REPORTED FACT` at Step 2 and said they become load-bearing here. **Each is a command, not a number to inherit.** Run from a clone at `5c3f183ae`.

| claim | command |
|---|---|
| population = **586** tracked `.ts` under `server/`+`shared/`, tests excluded | `git grep -l "" -- 'server/**/*.ts' 'shared/**/*.ts' \| grep -vE '(/tests/\|\.test\.ts$\|\.spec\.ts$)' \| wc -l` |
| per-shape counts (`readFileSync` 60 · `fs.readFile(` 43 · `readdirSync` 15 · `require(` 15 · `createReadStream` 3 · `existsSync` 114 · `import(` 377) | `git grep -nE '<shape>' -- 'server/**/*.ts' 'shared/**/*.ts' \| grep -vE '(/tests/\|\.test\.ts:\|\.spec\.ts:)' \| wc -l` |
| static JSON imports = **4** | `git grep -nE "^import .* from ['\"].*\.json['\"]" -- 'server/**/*.ts' 'shared/**/*.ts'` |
| instrument 1 = **119** cwd/`__dirname` sites, 116 literal / 3 variable | `git grep -nE '(process\.cwd\(\)\|__dirname)' -- 'server/**/*.ts' 'shared/**/*.ts' 'scripts/db-migrate.ts' \| grep -vE '(/tests/\|\.test\.ts:)' \| wc -l` |
| instrument 2 population = **1,377** tracked data files | `git ls-files \| grep -E '\.(json\|ya?ml\|txt\|ndjson\|csv)$' \| grep -vE '^(client/\|node_modules\|package(-lock)?\.json\|tsconfig\|drizzle/migrations/)' \| wc -l` |
| `canonical_bridge_sync` registered + **started** | `git grep -n "canonical_bridge_sync" -- server/services/autonomy-scheduler.ts` |
| **every sink-4 reader line** | ⭐ **the control asserts all 15 exact-match entries resolve: `python scripts/analysis/test-drift-runtime-predicate.py`** |
| 84 of 109 migration commits also touch `MANIFEST.txt` | `git log --since=2026-06-01 --format=%H -- drizzle/migrations/MANIFEST.txt \| wc -l` and `… -- 'drizzle/migrations/*.sql' \| wc -l` |
| **87 of 247** migration `.sql` are rollbacks | `git ls-files 'drizzle/migrations/*.sql' \| wc -l` · `… \| grep -ci rollback` |

## THE CHANGE — `dt-deploy-drift.sh`

**BEFORE (`:263-265`)**
```python
RUNTIME = ('server/', 'client/', 'shared/')
def runtime(f):
    return f.startswith(RUNTIME) and '/tests/' not in f and not f.endswith('.test.ts')
```

**AFTER** — four sink groups, each entry carrying its sink and the line that carries it there; the full block is in the file with its comments. The dispatching logic:
```python
def runtime(f):
    if f.startswith(SINK1_PREFIXES):
        return '/tests/' not in f and not f.endswith('.test.ts')
    if f.startswith(SINK2_PREFIXES):
        return 'rollback' not in f.lower()      # db-migrate.ts:118 filters these; :120-125 throws if listed
    return f in SINK1_FILES or f in SINK2_FILES or f in SINK3_FILES or f in SINK4_FILES
```
**`SINK4_FILES`** — the eight, each commented with its reader: `audit/coherency_rules.yaml` · `config/vts.json` · `1-system-manual/authority-baseline-v1.json` · `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` · `bridge/canonical/phase9_predictive-learning.json` · `bridge/canonical/mapping-regime-strategy.json` · `data/models/ara_model.json` · `replit.md`.

**The MANIFEST note** moved above the capped/uncapped branch (presence is decidable under a cap; only absence is not) and **downgraded from a verdict to a check** — see below.

## ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

1. **`'rollback' not in f.lower()` mirrors `db-migrate.ts:118` rather than importing it.** Two copies of one rule — the `#641` shape — accepted deliberately because they are in different languages on different hosts, and the file says so. **If you think the coupling should be explicit instead, say so.**
2. **The MANIFEST note is now advisory.** I first asserted `HARD DEPLOY FAILURE`; 84/109 says that fires on the routine case. **But the real abort mode is invisible from the range, so the note may now be worth nothing at all — cutting it is a defensible verdict.**
3. **`replit.md` in `SINK4_FILES`** on your withdrawn condition 3. It is also route-writable, so it appears on both lists by design.
4. **`data/models/ara_model.json` as a single-file entry** rather than a prefix, per your Step-2 ruling.
5. **Rename-away is NOT handled**: the predicate reads `files[].filename` only, never `previous_filename`. Renaming a sink file out of its path reports the new unmatched name. Deletions are still caught. **Stated, not fixed — tell me if that is wrong.**

## THE CONTROL, AND WHY ITS SHAPE IS THE POINT
`scripts/analysis/test-drift-runtime-predicate.py` **extracts the predicate from the shipped shell file and executes THAT**, so it cannot drift into testing a copy.
⛔ **A fresh reader DEFEATED the first version: they deleted `package.json`, cut `SINK1_FILES` to one entry and typo'd two SINK4 paths, and it still printed `PASS`, exit 0** — the behavioural cases covered 9 of 15 entries and nothing checked an entry was a real path.
✅ **Now:** the set is asserted against `EXPECTED_ENTRIES`, **and every entry is checked with `git ls-files --error-unmatch`** — because an entry matching nothing *reads as coverage*, which is why the root `index.html` entry was struck at Step 2.
**Mutation-tested, expectation written first:** deleting `package.json` → exit 3; a one-character typo in the risk-envelope path → exit 3, caught three ways; restored → PASS, exit 0. **25 cases, 0 failures, 17 discriminating against the pre-fix predicate.**
