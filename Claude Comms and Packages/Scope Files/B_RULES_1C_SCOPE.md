# B-RULES-1c — SCOPE: path-scoped rules extraction (`.claude/rules/`)

change-class: non_architecture
**Owner:** CC-A · 2026-08-07 · Sequence: the Langston-approved 1a→1e order (1a + 1b CLOSED).

## 1. THE MECHANISM — CONFIRMED AT ANTHROPIC'S OFFICIAL DOCS (not assumed)
`.claude/rules/*.md`, discovered **recursively**; YAML frontmatter `paths:` with glob patterns scopes a rule so it **loads only when Claude READS a matching file**. Rules **without** `paths` load at launch **with the same priority as `.claude/CLAUDE.md`** ⇒ **a rules file without `paths` saves ZERO context — only the path-scoped ones do.** User-level `~/.claude/rules/` loads before project rules. Symlinks supported.

## 2. ⛔ TWO FINDINGS THAT GATE THIS LEG (both from the official docs, this session)

**(A) VERSION RISK — the feature's SAFETY fixes post-date our measured CLI versions.** Documented gates: **v2.1.207** — *before it, ONE invalid glob pattern made the **Read tool FAIL for every file** the rule was evaluated against* (not "match nothing" — fail). **v2.1.217** — *before it, a `paths` value with many brace groups **stalled or crashed the CLI at startup***. Also v2.1.198 (symlink matching) and v2.1.211 (`--setting-sources` interaction).
**MEASURED IN OUR ESTATE: `claude --version` on the CC-A host = 2.1.87; Langston's box = 2.1.159. BOTH are below every gate above.** ⚠️ **HONEST BOUNDARY: 2.1.87 is the CLI on PATH — whether the DESKTOP app session (where these rules would actually load) uses that binary or its own bundled one is NOT established.** ⇒ **PRECONDITION, non-negotiable: establish the version the desktop sessions actually run (`/context` or the app's own report) BEFORE any `.claude/rules/` file exists.** If < 2.1.217: **no brace expansion in any `paths` value** (write patterns out longhand) and **every glob validated** before commit, because the pre-2.1.207 failure mode is a broken Read tool across the repo — a self-inflicted outage, not a degraded rule.

**(B) A NATIVE `InstructionsLoaded` HOOK EXISTS — and it is exactly what OBJ-1 built by hand.** The docs name it for logging *"which instruction files are loaded, when they load, and why… useful for debugging path-specific rules or lazy-loaded files."* Our OBJ-1 instrument stats a hardcoded candidate list and honestly labels itself *"NOT proof the harness loaded them."* **The native hook reports what the harness ACTUALLY loaded.** ⇒ **Fold into this leg: replace/augment the manual instrument with the native hook (same JSONL sink, keep the `degraded` + `population` contract), which also upgrades the OBJ-5 baseline from candidate-set to ground truth.** Version-gate this the same way.

## 3. ⚠️ THE COMPACTION PROPERTY — LOAD-BEARING FOR WHAT MAY MOVE
Docs, verbatim in substance: **project-root `CLAUDE.md` survives compaction (re-read and re-injected); rules with `paths:` frontmatter are NOT re-injected — they reload only the next time Claude reads a matching file.**
⇒ **SELECTION RULE — SHARPENED BY ANALYST CLAUDE’S CHALLENGE (2026-08-07, adopted; the second clause does the real work):** a rule may move ONLY IF it is **worthless until you touch its files AND ITS BLAST RADIUS CANNOT EXTEND BEYOND THEM.**
⚠ **WHY THE FIRST CLAUSE ALONE IS NOT ENOUGH — his evidence, from his own week:** (i) a writer-census concluded every insert flows through one chokepoint — **TRUE of production and silently FALSE of his own test fixtures, which insert directly**; a server-scoped rule would NOT have loaded while he edited the fixtures. (ii) a deletion fence needed to know a server-side namespace sweep would break CLIENT screens — **a server-scoped rule, invisible from the client file that would have been damaged.**
⇒ **"Worthless until you touch its files" ASSUMES YOU CAN PREDICT WHICH FILES A RULE IS ABOUT — and this project’s actual failures are precisely the ones where that prediction was wrong.** A `paths` glob that mispredicts does not degrade loudly; **the rule simply never loads, which is indistinguishable from a rule with nothing to say — the absent-as-valid class, one layer up.**
⛔ **CONSEQUENCE, ADOPTED: anything about DELETION, SCHEMA, or a SHARED CONTRACT is DISQUALIFIED** — those are exactly the rules whose whole job is to fire in a file you did NOT think was related. Anything a session must hold *before* touching anything — the non-negotiables, comms protocol, the workflow's shape, measurement discipline — **STAYS in `CLAUDE.md`.** Moving those would create a rule that vanishes at compaction and returns only by luck of which file is opened next; **that is strictly worse than the bytes it saves.**

## 4. CANDIDATES (each: the files that trigger it, and why it is worthless until then)
| candidate | `paths:` trigger | why safe to scope |
|---|---|---|
| Migration MECHANICS only (`git add -f`, MANIFEST registration) | `drizzle/migrations/**` | ⚠ **NARROWED: the mechanics move; anything SCHEMA-shaped (what a migration may do to a shared table) is DISQUALIFIED by the blast-radius clause and stays.** |
| Test conventions (SUBJECT-vs-PROBE, fence shapes, run-the-FULL-suite) | `server/tests/**` | inert unless writing tests |
| ~~Storage/tiering rules~~ **DISQUALIFIED at r1 by the blast-radius clause** | — | **move-not-delete IS a deletion rule; its job is to fire where someone did not think deletion was involved. STAYS in `CLAUDE.md`.** |
| Comms-bridge specifics | `/opt`-mirroring repo paths + `.claude/hooks/**` | inert unless touching the fabric |
**NOT candidates (compaction rule §3):** THE EIGHT · §1 persona/plain-language · §2 workflow · rules 22/24/25/29 · §6 comms protocol · §7.1 storage flow.

## 5. VERIFICATION
Precondition met (version stated with its source) · each moved passage findable at its new home · **the native-hook baseline shows the auto-loaded byte total DROP by the moved bytes** (ground truth, not candidate-set) · ★ **POSITIVE CONTROL ON THE COMPACTION CLAIM ITSELF (Analyst’s second point, adopted — "your evidence is docs-says"): put a KNOWN MARKER in a path-scoped file, COMPACT, then read a matching file and confirm the marker appears.** Cheap, and this crew has been wrong about mechanisms all week that the docs described correctly. **Until that control runs, §3’s compaction property is DOCS-SAYS, not measured** · plus the ordinary probe: read a matching file, confirm the rule loads; read a non-matching file, confirm it does not · §339 old→new table.

## 6. OUT OF SCOPE
Skills (1d) · ordering (1e) · Langston's files (INFRA lane) · any rule whose absence-at-compaction would matter.
