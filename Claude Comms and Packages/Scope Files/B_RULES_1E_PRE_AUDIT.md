# B-RULES-1e — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**One document. The AUDIT comes first; the PLAN falls out of it. Every plan item back-references the finding it comes from.**

**Owner:** CC-A · **Opened:** 2026-08-26 · **Scope:** `B_RULES_1E_SCOPE.md` @ `650dd2209` (Step-1 approved with conditions) · **Card:** `PVTI_lAHODmulEM4BfQP4zg4BQXs`

---

## 0. THE SIX SOURCES — WHICH WERE READ, AND WHICH WERE JUDGED NOT APPLICABLE

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | **The CODE** at `origin/migration/aws-supabase` | ✅ | the bridge suppression path, the live `langston-call`, `ci.yml`, the hook family |
| 2 | **RUNTIME LOGS + registry** | ✅ | `journalctl`, **`/var/log/langston-call.log`** (the decisive instrument — see A1), the scheduled-task registry |
| 3 | **`SYSTEM_IMPACT_MAP.md`** per component | ✅ | the Discord fabric entry; **it is what told us the bridge is repo-canonical** |
| 4 | **`SYSTEM_MANUAL.md`** | **JUDGED NOT APPLICABLE, explicitly** | no architecture, strategy, regime, filter, signal-pipeline or math change. ⚠️ **Its SILENCE here is not a governance gap** — this batch changes how sessions are instructed and how failures announce themselves, which is out of its stated scope (§9 rule 4). |
| 5 | **BATCH REPORTS + LEDGER** | ✅ | see A6 |
| 6 | **`bridge/canonical/`** | ✅ **CONSULTED — NO COVERAGE, and that is recorded as a finding** | `langston` **0** files · `Discord` **0** · `scheduled task` **0** · `model check` **0**; `skill` 2, both unrelated senses. **Positive control: `SQE` returns 5**, so the corpus and the query both work. ⇒ **every component here post-dates the 2026-01/02 governance change; there is no original intent to recover.** |

---

## 1. AUDIT FINDINGS

### ⛔⛔ A1 — `langston-call` HAS NO PROGRAMMATIC CALLER, AND TWO ALWAYS-LOADED GOVERNANCE CLAIMS SAY IT DOES

**`CLAUDE.md` §8 states it is *"the generic invoker the **alert/queue** path uses."* The shared `MEMORY.md` repeats it. Both are load-bearing: they are the basis of the *"switch BOTH sites or he runs split"* rule.**

**MEASURED, whole box, with a positive control:**
- `grep -rl 'langston-call'` across `/usr/local/bin /opt /etc /root /home/langston` returns **only documents, memory files, archives and its own backups. NOT ONE EXECUTABLE, SERVICE OR CRON ENTRY.**
- **POSITIVE CONTROL:** the identical grep for `cc-send` returns **six real callers** (`dt-push-notice.sh`, `dt-backup-sync.sh`, `helsinki-staging-probe.sh`, `bridge-failed-notify.sh`, …). **The search works; the absence is real.**
- **No cron entry. No systemd unit.** The only active Langston unit is `discord-langston-bridge.service`.

**THE DECISIVE INSTRUMENT — its own log, `/var/log/langston-call.log` (30,739 B, last written Aug 22):**
| when | what | prompt |
|---|---|---|
| 2026-08-07T13:49Z | `output=/tmp/model_probe_out.txt` | **76 bytes** — this is the daily currency check's live model test |
| 2026-08-22T21:08Z | `output=/tmp/langston_indep_report.txt` | 4,285 bytes — a manual independent report |

⇒ **TWO INVOCATIONS IN THREE WEEKS, BOTH AD-HOC. It is a hand-run probe tool, not an automated path.**

★★ **AND THE CONSEQUENCE IS SHARPER THAN "A DOC IS WRONG", WHICH IS WHY THIS IS THE HEADLINE FINDING: one of the two invocations IS THE DAILY CURRENCY CHECK'S LIVE MODEL TEST.** So `langston-call`'s `MODEL` is **the model that the check testing for model changes runs its probe against.** A stale value there corrupts **the very instrument whose job is to notice a stale model.**

⚠️ **RULE 24 — I AM NOT CALLING THIS OUTCOME (1).** Langston invokes it by hand from his own session; **a tool with no automated caller is not thereby dead.** The defect I am asserting is **narrow and only this: the claim that it sits on the ALERT/QUEUE path is unsupported by the box.** Whether that claim was once true and the path moved to the bridge, or was never true, **I cannot tell from here — and Langston is the one who would know.** Outcome **(2) — working-as-designed but the DOCUMENTATION is wrong** is my reading; his call.

### A2 — NINE COPIES OF ONE 6 KB SCRIPT, NAMING AT LEAST FOUR DIFFERENT MODELS
`ls -1 /usr/local/bin/langston-call* /opt/discord-bridges/langston-call*` ⇒ **7 files — the LIVE one plus SIX backups**: `.bak-fable`, `.pre-opus5-20260727-234713`, `.pre-4.8-backup-20260601`, `.pre-1m-20260601`, `.v1.backup`, `.pre-fable5-20260806`. **Plus the two repo forks = NINE copies total.**
⚠️ **The count above initially read "seven backups"; re-derived, the 7 INCLUDES the live file, so it is six.** The nine-total figure is unchanged. **The reconnect must not add a tenth.**

### A3 — `CLAUDE_CODE_FEATURE_WATCH.md` HAS NO PROGRAMMATIC WRITER **AND** NO PROGRAMMATIC READER
**SEVEN pre-existing files reference it, and ALL are Markdown** — `CLAUDE.md`, the shared `MEMORY.md`, `RUNNING_ISSUES.md`, two completion reports, a Langston design ask, and `B_MISTAKES_FILE_SCOPE_AND_PREAUDIT.md`. *(`git grep` returns 9; two are this batch's own documents.)* **No `.mjs`, `.js`, `.py` or `.sh` touches it.**

⚠⚠ **THIS NUMBER WAS WRONG AT FIRST DISPATCH — IT READ "SIX" — AND HOW IT WAS WRONG IS ITSELF A FINDING FOR THIS BATCH.** I ran the census on **two** instruments. **BOTH RETURNED 6, AND EACH MISSED A DIFFERENT FILE:** the indexed search missed `B_MISTAKES_FILE_SCOPE_AND_PREAUDIT.md`; the shell `grep -rln --include=*.md` missed `CLAUDE.md`. **Neither reported a truncation, and the two counts AGREED, which is precisely what made the error invisible** — agreement between instruments reads as corroboration and here it was coincidence.
★ **RESOLVED BY A THIRD INSTRUMENT THAT READS A DIFFERENT OBJECT: `git grep`, which searches the INDEX rather than the filesystem.** ⇒ **TWO INSTRUMENTS AGREEING IS NOT A CONTROL. A control is an instrument that would FAIL DIFFERENTLY.** *(Recorded because it is the same family as everything else in this batch, and it happened inside the audit written to close that family.)*
★ **The load-bearing claim SURVIVES and is strengthened: 9 of 9 hits are `.md`.** The count was wrong; the conclusion — **no programmatic writer, no programmatic reader** — is not.
⇒ **The writer is a sentence in a prompt asking a session to remember; the reader is a human.** That is A3 stated structurally, and it is exactly why nineteen days produced zero rows: **the liveness artifact and the thing it measures are the same actor.**
★ **AND IT MAKES THE FIX EASIER, NOT HARDER: because nothing reads the file programmatically, deriving liveness from the scheduler's own `lastRunAt` breaks no consumer.** The census is what licenses that design.

### ★★ A8 — THE RECORDED MECHANISM FOR #740 IS WRONG. THE PARSER DOES NOT "DROP THE `description` KEY" — THE WHOLE FRONTMATTER BLOCK RAISES.

**#740 and OBJ-2 both state:** *"an unquoted scalar containing a colon-space is ambiguous, so the parser **drops the `description` key**."* **That was inferred from the LISTING’s behaviour and never tested against a parser. I tested it.**

**REPRODUCED, both directions, one variable changed:**
| input | result |
|---|---|
| `description: STEP 5 ONLY - CI gate, four jobs` **(control)** | **parses**, `keys=['name','description']`, value intact |
| `description: STEP 5 ONLY: TypeScript Check, Test Suite` **(suspect)** | ⛔ **`ScannerError: mapping values are not allowed here`, line 2 col 25 — THE ENTIRE BLOCK FAILS TO PARSE. `name` does not survive either.** |

⇒ **THE REAL MECHANISM: strict YAML RAISES on the whole document; the app then RECOVERS LENIENTLY and falls back to the first heading.** Nothing is "dropped" — **the app is catching a total parse failure and papering over it.** *(That the skill still appeared in the listing at all is the evidence for the lenient recovery; I have not read the app’s parser and do not claim its implementation — only that a strict parse raises and the app did not hard-fail.)*

**WHY THIS CHANGES P3 RATHER THAN JUST TIDYING IT:**
- A check written as *"assert a `description` key exists"* would work **by accident** — it would fail because the parse throws before any key check happens. **The design must treat a RAISE as the failure**, and say so, or the next maintainer "fixes" it into a `.get('description')` on a dict that was never produced.
- **`name` is lost too.** So the blast radius of a colon-space is larger than #740 recorded — it is not a degraded skill, it is **a skill whose entire frontmatter is unreadable to a strict parser.**
★ **AND IT STRENGTHENS THE "PARSE, DON’T PATTERN-MATCH" ARGUMENT that OBJ-2 already made on principle: the principle turns out to be load-bearing rather than stylistic**, because the observable symptom (a populated-looking listing) is produced by the app’s recovery, not by the data.

### A4 — CI HAS EXACTLY FOUR JOBS, AND RULE 19 NAMES THEM. A FIFTH JOB WOULD SILENTLY BREAK A GOVERNANCE CONTRACT
`ci.yml` defines **TypeScript Check (baseline gate) · Test Suite · Build · Docker Build**. **`CLAUDE.md` rule 19 enumerates those four by name and requires every batch close to cite "all 4 GREEN."**
⇒ ⛔ **Adding a fifth job for the skill check would make every future "4/4" citation wrong and every past one ambiguous** — a governance-doc drift introduced by a fix aimed at governance drift. **The check must ride INSIDE an existing job.** *(The `TypeScript Check` job already runs a bare `node scripts/…` script, so the precedent exists.)*

### A5 — THE BRIDGE SUPPRESSION COLLAPSES TWO DIFFERENT FAILURES
`comms-infra/discord/discord-langston-bridge.py:513-517`: any reply starting `_Langston bridge error:` is mirrored and **not posted**, with the stated intent *"infra error, not a real reply — mirror only, don't spam the channel."* A **timeout** produces exactly that shape.
⇒ **A transient blip (correctly suppressed) and a review that will never arrive (must not be) are indistinguishable to the sender.** Confirmed against #741's measured trace: three failures at ~15-min intervals, then PARKED, **never posted**.

### A6 — LEDGER CHECK (§9.5(b-ii)): nothing here is a re-report of a decided thing
Searched `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports **by component and by symbol**. #739, #740, #741(CC-A) and #746 are open and homed to this batch. **No prior Kyle-approved or Langston-reviewed decision covers any of them.** ⚠️ **One near-miss recorded:** the 2026-08-06 commit *"Reconcile Langston comms files to live Helsinki state"* **is** a prior deliberate action on A1/A2's territory — **it is not a decision that forecloses this work; it is evidence that the manual approach fails** (it was correct on the day and stale within 19 days).

### A7 — OUT OF REPO AND NOT MINE TO FIX: Langston's own always-loaded memory asserts a false model
His words: *"my own always-loaded `/home/langston/MEMORY.md` told me this invoke that I am `claude-fable-5[1m]`. Both live sites say otherwise."* **Recorded here because it is the strongest instance of the class this batch exists to close, and because it is invisible from inside the repo.** **His file, his fix.**

---

## 2. THE IMPLEMENTATION PLAN — every item names its finding

| # | item | falls out of |
|---|---|---|
| **P1** | **Derive the daily check's liveness from the scheduler's `lastRunAt`, not from a self-written row.** The check becomes: registry says it ran within 48 h ⇒ alive. **Retire the "append a row" instruction rather than repeating it.** | **A3** — no programmatic reader exists, so nothing breaks; and the self-report is structurally unable to prove its own author ran |
| **P2** | **Correct the RUN LOG section to say what the absence of rows actually means** — and keep the two existing rows, both honestly labelled, as history. | **A3** |
| **P3** | **A frontmatter check that PARSES the YAML and asserts a surviving `description` key**, over `.claude/skills/*/SKILL.md`. Ships as `scripts/check-skill-frontmatter.mjs` **plus** a `PreToolUse` push guard, mirroring the `check-tsc-baseline.mjs` + `guard-push-tsc-baseline.mjs` pair. **Wired into the EXISTING `TypeScript Check` job — NOT a fifth job.** | **A4** (job count is a governance contract) + scope OBJ-2 |
| **P4** | **Make a bridge TIMEOUT post a short explicit failure naming the dispatch; leave every other bridge error suppressed.** Discriminate on the timeout, not on `is_bridge_error` as a whole. | **A5** — the two cases are collapsed today |
| **P5** | **RECONNECT `langston-call`** into `comms-infra/discord/`, **named as installed (no `.sh`)**, body **byte-exact from the live file** (`md5 150eba15…`, verified after commit), and **installed by `deploy.sh` using the `cc-send` pattern** (`install -m 0755`). **REMOVE** `Claude Comms and Packages/Langston/langston-call.sh` and `Claude Comms and Packages/comms-infra/langston-call.sh` under rule 18 with `DELETED_COMPONENTS_LOG` entries. | **A1 + A2**, and Langston's three Step-1 conditions |
| **P6** | **Correct `CLAUDE.md` §8 and the shared `MEMORY.md`: `langston-call` is a HAND-RUN probe tool, and it is what the daily currency check probes with — NOT the alert/queue invoker.** Replace the asserted model values at both sites with **pointers to the two read sites.** ⛔ **Dated change-log rows are NOT touched** (`LANGSTON_ARCHITECTURE.md:149`, `BATCH_CATALOG`, completion reports) — a row true at its date is not drift. | **A1** (the claim is unsupported) + Langston's Q2 ruling (convert **asserters**, not mentions) |
| **P7** | **Relay A7 to Langston** — his own memory file, his fix. Not actioned by this batch. | **A7** |

### ⚠️ `UNAUDITED` — declared rather than hidden
**NONE.** Every plan item above traces to a finding. **OBJ-4 (the ORDERING question) carries no plan item by design** — it is a decision to be recorded, not work to be done, and the scope asks Langston to rule.

---

## 3. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The headline is not one of the three issues we started with. **The command that launches Langston for one-off checks has no automated caller at all** — its own log shows two hand-run uses in three weeks — **yet two of our always-loaded rule files state that it sits on the alert path.** One of those two hand-run uses is the daily check's live model test, which means **the stale model name sits inside the very tool whose job is to notice stale models.** Nine copies of that one script exist across the server and the repository, naming at least four different models.

Separately: the file that is meant to prove the daily check is alive **has no program writing it and no program reading it** — the writer is a sentence asking a session to remember, which is why nineteen days produced nothing. And adding a new automated test would have quietly broken a rule that names our four existing ones by name.

**The plan** fixes each at its mechanism rather than by adding instructions: liveness comes from the scheduler instead of a self-report; the skill check parses rather than pattern-matches and rides inside an existing test; a timed-out review announces itself while genuine blips stay quiet; and the forked command becomes one versioned copy, taken byte-for-byte from the live one.
