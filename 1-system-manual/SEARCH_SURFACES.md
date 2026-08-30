# SEARCH SURFACES — WHAT A SESSION MAY NEED TO SEARCH, AND THE RIGHT INSTRUMENT FOR EACH

> **Kyle-directed 2026-08-30**, during `B-INSTRUMENTS-OVER-RULES` Step 1: *"You should catalog all surfaces we'd need to search and the best way to search them."*
> ⛔ **EVERY FIGURE HERE IS MEASURED, at `origin/migration/aws-supabase` or on the live host, on 2026-08-30 — NOT estimated.** ⚠️ **AND FIGURES GO STALE: this file names the surface and the METHOD; re-measure the SIZE before quoting one.** *(The `#739`/`#740` lesson: a document that asserts a live value is wrong the moment it is written.)*

---

## THE ONE-PAGE ANSWER

| # | surface | size (2026-08-30) | right instrument | state |
|---|---|---|---|---|
| **1** | **TypeScript / JS code** | 1,160 files · 133,372 lines | ✅ **language server** — `typescript-lsp` | ✅ **LIVE, proven** |
| **2** | **Governance prose** | **1,944 `.md` · 64.3 MB** | ⛔ **UNSOLVED — see §2** | ⛔ **THE REAL GAP** |
| **3** | **Git history** | 9,774 commits · 11,366 files ever touched | `git log -S`, **never path-limited** | ✅ adequate, under-used |
| **4** | **Skills + hooks** | 13 skills · 10 hooks | **read end to end** | ✅ small enough |
| **5** | **Live logs** | Discord inbox 15,821 lines/28 MB · alerts 755 lines | **structured parse, never `tail -N`** | ⚠️ see §5 |
| **6** | **Session transcripts** | ⛔ **32 files · 2.65 GB** | ⛔ **NOTHING** | ⛔ **UNSEARCHABLE** |
| **7** | **The database** | Supabase Postgres | app's authenticated API | ⚠️ see §7 |
| **8** | **Server config / filesystem** | two hosts | `ssh` + grep **a named directory** | ⚠️ hard rule, §8 |
| **9** | **GitHub — CI, PRs, board** | — | `gh` | ✅ adequate |

⛔⛔ **THE HEADLINE: WE JUST INSTRUMENTED SURFACE 1, AND SURFACE 1 IS NOT WHERE OUR ERRORS COME FROM.** ★ **Re-read the six instruments that called content "absent" in one day and were ALL WRONG — exact-phrase, concept-word, the pointer-vs-body checker, the case-sensitive grep, and Langston's own two. EVERY ONE WAS SEARCHING SURFACE 2.** *(`#946`, and the `B-CLAUDEMD-SLIM` completion report §5.)*

---

## 1. CODE — ✅ SOLVED

**Instrument:** `typescript-lsp@claude-plugins-official`, installed 2026-08-30. Drives `typescript-language-server` (5.3.0) over the compiler's own symbol graph.
**MEASURED, the discriminating test** (object: `toCanonical`; population: the whole repo at `e16767ef7`):

| method | files | what they were |
|---|---|---|
| text search | **25** | 10 code · **15 PROSE (60%)** |
| language server | **10** | **65 exact references, all code** |

★ **Both agree on the underlying 10 code files. The right answer was always in the grep output, buried under 60% noise — and the session had to guess its way to it.** ⇒ **that is the failure mode, quantified.**
★ **AND THE BLAST-RADIUS POINT: `toCanonical` has 65 references across 10 files including tests, a telemetry service and a diagnostic. `B-SCANNER-EGRESS-NORMALISE` treated it as a one-line change.**
⛔ **USE IT FOR: "who calls this", "where is this defined", "what breaks if I change this."** ⛔ **NOT FOR: anything not code — it declares eight extensions and `.md` is not among them.**

## 2. GOVERNANCE PROSE — ⛔ THE REAL GAP, DELIBERATELY LEFT OPEN

**1,944 tracked markdown files, 64.3 MB** — of which **1,028 are batch reports** (scope · pre-audit · change list · completion) and **53 are frozen/archived** (`_archive/`, `bridge/canonical/`, which are never edited and are the provenance corpus §9.5(b) sends every batch to).

⛔⛔ **THIS IS WHERE OUR ERRORS ACTUALLY COME FROM, AND IT HAS NO INSTRUMENT.**
★ **WHY A BETTER MATCHER IS NOT THE FIX, and this is measured, not argued: FOUR OF THE SIX FAILED INSTRUMENTS WERE BETTER MATCHERS THAN THE ONE BEFORE.** The failures are **paraphrase** (the same proposition in different words) and **first-sufficient-explanation** (one plausible line read, reader stops) — **neither is a lexical problem.**

✅ **THE ONLY METHOD THAT HAS NEVER FAILED (Langston's ruling, adopted):** **read the destination end to end and CITE THE LINE YOU REJECTED beside the line you accepted.**
⚠️ **HONEST LIMIT: that works on a 43-119-line skill file. It does not obviously scale to 1,944 files.**

⛔ **NO SOLUTION IS PROPOSED HERE, AND THAT IS DELIBERATE.** The question is with Langston under his own P1 approach round. **The candidate shapes, none adopted:** a semantic/index search exposed as a tool · discipline alone · **or the possibility that the corpus is unsearchable because it is 64 MB of overlapping prose, in which case the defect is the CORPUS, not the search.**
⚠️ **The instinct to build a search tool is exactly the instinct that produced the guard Langston had to delete (`#756`). It is not being acted on unprompted.**

## 3. GIT HISTORY — ✅ ADEQUATE, AND UNDER-USED

**9,774 commits; 11,366 distinct files ever touched.** This is the **provenance** surface — mandatory 1.b sends every scope here.
⛔ **`git log -S "<symbol>" --reverse`, NEVER PATH-LIMITED — a path limit does not survive a rename**, and the `active-*` family was renamed wholesale on 2026-07-03, so searching the new name returns nothing written under the old one.
⛔ **READ THE INTRODUCING COMMIT AND QUOTE IT VERBATIM** — a reviewer ruling on your gloss is ruling on the wrong thing (`#452`).
⚠️ **`git grep` searches the INDEX, not the filesystem — which is why it resolved a count two other instruments got wrong** (`B-RULES-1e` A3). ★ **Its blind spot is the mirror image: it cannot see uncommitted work.**

## 4. SKILLS + HOOKS — ✅ SMALL ENOUGH TO READ WHOLE

**13 skills, 10 hooks.** ★ **The whole eleven-step skill set is smaller than the rules file it was cut from.** ⇒ **read them end to end; do not grep them.** ⚠️ **A skill's `description` is what decides whether it fires — and a colon-space in it silently voids the description (`#740`), which no content search would show you.**

## 5. LIVE LOGS — ⚠️ THE TRAP IS THE READ, NOT THE SEARCH

| log | host | size |
|---|---|---|
| `cc-discord-inbox.jsonl` | Helsinki | **15,821 lines · 28 MB** |
| `system-alerts.jsonl` | staging | 755 lines · 1.1 MB |
| `cc-wake.log` | Helsinki | 142 lines |

⛔⛔ **NEVER `tail -N` A LOG AND CALL THE RESULT THE POPULATION.** ★ **MEASURED (`#759`): the mandatory §10.5 alert check is written as `tail -50` against a file that was 736 rows — it saw ZERO of the six live alerts.** **The check ran, returned clean, and was blind.** ⇒ **parse the whole file and filter on the FIELD (`state`, `acknowledged_at`), never on position.**

> ⛔⛔ **FINDING, 2026-08-30 — A DOCUMENTED WAKE SOURCE HAS BEEN DEAD FOR 63 DAYS.**
> **`/var/log/langston-alert-invokes.log` is 0 bytes, last written 2026-06-28.** **`CLAUDE.md` §6.9 lists it as wake source 2 of 3, and the `MEMORY.md` §4.5 arm command tails it in every session.**
> **CONFIRMED, not inferred: there is NO live writer.** The handler `langston-alert-handler.sh` **does not exist** — only two dated backups predating the 2026-06-01 model switches. The only live references are `logrotate` (faithfully rotating an empty file) and a memory-index record. **POSITIVE CONTROL: a genuinely live log, `cc-discord-inbox.jsonl`, has findable writers in the bridge scripts.**
> ✅ **IT IS NOT BREAKING ALERTS — the Discord path carries `langston_alert_inbound` × 1,151 and is alive.** ⇒ **the log is VESTIGIAL, superseded by Discord at the `#333` cutover.**
> ⚠️ **BUT EVERY SESSION TAILS A DEAD FILE AND WOULD READ ITS SILENCE AS "NO ALERTS" — the absence-as-evidence failure, baked into our own architecture document.**
> ⇒ **DISPOSITION (§9.4): folded into `B-INSTRUMENTS-OVER-RULES`** — the §5 correction lands with this file.

## 6. SESSION TRANSCRIPTS — ⛔ 2.65 GB, AND NOTHING SEARCHES THEM

| session | files | size |
|---|---|---|
| CC-B (`-new`) | 11 | **1,090 MB** |
| CC-C (`-analyst`) | 9 | **935 MB** |
| CC-A (`-old`) | 2 | **603 MB** |
| Infra | 10 | 26 MB |
| **total** | **32** | ⛔ **2.65 GB** |

⛔ **This holds the actual reasoning history of every session — what was tried, what was rejected and why — and there is NO instrument for it.** ★ **When Kyle asks *"why did that session do X"*, the answer is in here and is effectively unreachable.**
⚠️ **The tooling that exists is for TRIMMING, not searching** (`CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`; the biweekly `transcript-bloat-check` flags >150 MB).
★ **NAMED AS A SURFACE RATHER THAN SOLVED. It may not be worth solving — but it should be a decision, not an omission.**

## 7. THE DATABASE — ⚠️ THE PROBLEM IS NOT LOOKUP

**Supabase PostgreSQL 17.6.** **Access: the app's authenticated API** (`/api/...` via the staging login), **or `psql` with credentials.** ⛔ **A session may not handle a password — so the API is the only route a session actually has.**

⛔⛔ **DO NOT ADD A DATABASE TOOL ON INSTINCT. MEASURED IN `RUNNING_ISSUES.md` BEFORE RECOMMENDING:**
| shape | hits |
|---|---|
| `column does not exist` / `no such table` | **0** |
| **`denominator`** | ⛔ **46** |
| `wrong population` | 3 |
| *(positive control)* `wrong-object` | 20 |

⇒ ★★ **OUR DATABASE ERROR CLASS IS NOT *"I COULD NOT FIND THE TABLE."* IT IS *"I COUNTED THE WRONG ROWS."*** **A schema-aware connector fixes the first and does nothing for the second** — the same shape as *a better matcher is not the fix.*
⇒ **THE POPULATION CLASS BELONGS TO RULE 29 AND `B-MEASURE-GATE`, NOT TO A TOOL.**
⚠️ **A `supabase` MCP plugin exists in the official marketplace, but it is COMMUNITY-published, not Anthropic — unlike `typescript-lsp` — and adopting it means a third-party component holding credentials to the database carrying our trading data. ⛔ A KYLE DECISION, deliberately, never folded into a batch as a step.**

## 8. SERVER CONFIG + FILESYSTEM — ⚠️ ONE HARD RULE

Two hosts: **staging `188.245.193.8`**, **Helsinki `204.168.141.77`**. `ssh` + grep.
⛔⛔ **NEVER A WHOLE-FILESYSTEM SCAN — no `find /`, no `grep -r /`, no `/mnt/gdrive`. NAME THE DIRECTORY.** On Helsinki that mount wedges, the scan blocks in uninterruptible IO, **cannot be killed**, and the session reads as idle while work queues. ⛔ **THIS IS A RULE, NOT A GUARD — the hook written to enforce it was deleted as unenforceable (`#756`). Nothing checks it.**

## 9. GITHUB — ✅ ADEQUATE
`gh` for CI runs, PRs and the delivery board. ⛔ **Verify the PER-JOB `conclusion`, never the run-level summary — with three sessions pushing, runs CANCEL each other and `cancelled` reads as not-green.**

---

## THE PATTERN ACROSS ALL NINE

★★ **THREE OF THE FOUR SURFACES THAT ACTUALLY HURT US SHARE ONE SHAPE, AND IT IS NOT "WE NEED A BETTER SEARCH":**
1. **A search that returns a plausible answer and stops** — first-sufficient-explanation, applied to a file instead of a code path.
2. **A read that is not the population** — `tail -N`, a `head` slice, a snapshot mistaken for a window.
3. **A silence treated as evidence** — an empty result, an unwritten log, an instrument that could never have spoken.
⇒ ⛔ **A TOOL FIXES (1) ONLY WHERE THE CORPUS HAS STRUCTURE — WHICH IS CODE, AND ONLY CODE. (2) AND (3) ARE MEASUREMENT DISCIPLINE, AND THEIR HOME IS RULE 29 AND `B-MEASURE-GATE`, NOT AN INSTALL.**
