# B-MEASURE-GATE leg 2 — Step-4 change list r1 (Langston code review at the graded ref)

**READY-AT:** the commit that carries this file on `origin/migration/aws-supabase` (subject begins `B-MEASURE-GATE Step-4: change list r1`; the code it describes is unchanged from `fcabe3254`, the r7 head) · **owner:** CC-A (OLD Claude) · **change-class:** architecture (scope header) · **ONE GATE THIS DISPATCH:** *does the code at the ref do what the scope's OBJ-0 → OBJ-6 say it does, within the pre-registered constraints — warn-only, fail-open, never on a value, silence non-evidential.* Design rulings are all already made (scope r3-r12); this is the diff.

## 1. The change set — enumerated, and what is NOT in it
Base for the diff: `66f7c7500` (the commit before the Step-2 amendment `24f4b39bb`, 08-31 14:50). **Every path below is untracked-checked: `git status --porcelain` at the ref shows only `.claude/launch.json` (local config, deliberately unversioned).**
| path | status | lines | role |
|---|---|---|---|
| `.claude/hooks/guard-measurement-shape.mjs` | NEW | 349 | **OBJ-4** — PreToolUse, three pre-execution measurement shapes |
| `.claude/hooks/guard-stale-fetch.mjs` | NEW | ~132 (r2) | **OBJ-2** — PreToolUse, §7.1 step 0 |
| `.claude/hooks/guard-ci-cited.mjs` | NEW | 246 | **OBJ-3** — PreToolUse, rule 19's citation (r7 at `fcabe3254`: the turn-start read widened to 8 MB) |
| `.claude/hooks/guard-result-shape.mjs` | NEW | 285 | **OBJ-6c** — PostToolUse, result-vs-request |
| `.claude/hooks/observe-userpromptsubmit.mjs` · `observe-posttooluse.mjs` | NEW | 62 · 51 | **OBJ-1 / 6c stage 1** — payload-shape observers, keys+types only |
| `.claude/hooks/inject-due-alerts.mjs` | NEW | 149 | **OBJ-1 stage 2** — UserPromptSubmit, §10.5 whole-file alert read |
| `.claude/hooks/probe-warn-delivery.mjs` | MODIFIED, **UNREGISTERED at r2** | +129 / −9 (12 → 132 lines) | **OBJ-4's gate instrument** — six delivery arms. ⛔ **Langston BLOCKER-1: the one file in the set that can block, with a raw substring sentinel match and no mention-elision. Registration removed at r2; **file DELETED at r3** — the hook self-test flagged it *present but NOT REGISTERED*, the very class it exists to catch — archived as `.removed`, `DELETED_COMPONENTS_LOG` entry updated.** |
| `.claude/settings.local.json` | MODIFIED | +57 at r1, +48 at r2 | registrations: PreToolUse ×2 new blocks after r2 (measurement-shape, stale-fetch, ci-cited in two blocks), PostToolUse (new event), UserPromptSubmit (new event); **the OBJ-6d agent-hook probe was registered and REMOVED within the batch** — not at any ref; logged in `DELETED_COMPONENTS_LOG` on Langston's ruling |
| `scripts/measure-gate/hook-selftest.mjs` + `test-hook-selftest.mjs` | NEW | 220 · 103 | **OBJ-5** — REGISTERED / PRESENT / CURRENT / RUNNING per hook, 5/5 |
| `scripts/measure-gate/test-guard-measurement-shape.mjs` | NEW | 424 | 79/79, 11 mutations |
| `scripts/measure-gate/test-guards-obj23.mjs` | NEW | ~365 | 69/69, 20 mutations (r2: +5 arms, +2 mutations for findings 2 and 3) |
| `scripts/measure-gate/test-guard-result-shape.mjs` | NEW | 160 | 76/76, 21 mutations |
| `scripts/measure-gate/obj6b_*.py` (7) + `README.md` | NEW | — | **OBJ-6b** instruments, as run; enumeration cleared by you, split vacated |
**NOT mine, in the same base..ref range (enumerated from the full compare, 105 files at r2):** under `.claude/` — `.claude/hooks/fresh-rules.mjs` (+308) and `.claude/skills/workflow-03-implementation/SKILL.md` (+2/−1), both `B-CROSS-SESSION-BLEED` (CC-B, `c37c212fb` family), and the three other sessions' memory mirrors `MEMORY_CC_B.md` / `MEMORY_CC_C.md` / `MEMORY_CC_INFRA.md` (per-session state, not code) — **`MEMORY_CC_A.md` IS mine and is modified in these commits; it is state, not code, and is not reviewed here** *(Langston: the glob had swallowed it)*; elsewhere `.gitattributes`, `server/**`, `token-watch/**`, `drizzle/**`, `client/**` — other batches. *(r1 named the sibling and missed the SKILL.md — `enumerator-blind-spot`, Langston finding 7.)* `CLAUDE.md`/`CONDUCT.md`/`MISTAKE_PATTERNS.md`/scope/pre-audit edits are governance, reviewed at Step 10.

## 2. What every hook shares (the constraints, and where they are enforced)
- **Warn-only, fail-open:** every hook's LAST line is `process.exit(0)` (`guard-measurement-shape.mjs:349`, `guard-result-shape.mjs:285`, `guard-ci-cited.mjs:246`, `guard-stale-fetch.mjs:116`, `inject-due-alerts.mjs:149`) and the only output is `hookSpecificOutput.additionalContext` (the emit sites: `:341`, `:279`, `:235`, `:106`, `:58` respectively). Each suite has a *"make it block (exit 2)"* and *"emit a permission decision"* mutation that fails it.
- **Sink rows carry `hook_sha`** (sha256 of the file, CRLF-normalised — one source, one identity), `synthetic` (`GUARD_SYNTHETIC=1` marks suite traffic), `project_dir`, and `decided:false` for "bailed", distinct from "clean".
- **Self-reference:** heredoc bodies and quoted message strings are elided before any shape is read (`guard-measurement-shape.mjs:154-201`, `guard-ci-cited.mjs:130-155`, `guard-result-shape.mjs:95-104`).
- **Silence is non-evidential** — in those words in every header, with a KNOWN GAPS table per hook.

## 3. The load-bearing hunks, per hook
### OBJ-4 `guard-measurement-shape.mjs` — shipped under your condition 5 (2d0cc33af); unchanged since except the KNOWN GAPS text
Three shapes at `:250-295`: `worktree-not-ref` (size/hash on the working tree in a CRLF repo), `truncation-is-not-population` (`head -N`, `git log -N`; `tail` deliberately NOT a shape — gap 1b; `/var/log/` exempt only inside the truncation's own pipeline, `sequenceOf` at `:224`), `count-from-search` (`grep -c`). Pre-registered window opens at batch close: ≥50 real fires · precision ≥20 % · ≥1 published-claim catch · adjudicated by a non-author · enumerated · n<50 extend once then delete.
**Attack:** the `/var/log/` exemption's scoping (`:224-249`) — it was widened, then whole-command, then pipeline-scoped across four rounds; the mutation *"WIDEN exemption"* fails the suite, but the honest question is whether pipeline-scoped is still too wide.

### OBJ-2 `guard-stale-fetch.mjs`
```js
// :63-91 (r2, Langston finding 2) — the gate and the silencer, BOTH quote-aware, ordered
const GIT = /\bgit\b(?:\s+-[Cc]\s*(?:"[^"]*"|'[^']*'|\S+))*\s+/;
const stages = [];  /* :66-80 quote-aware split on && || ; newline — a ";" inside quotes is not a stage break */
const substitutions = (s) => (s.match(/\$\(([^()]*)\)/g) || []).join(' ');
const unquoted = (s) => s.replace(/"[^"]*"|'[^']*'/g, 'QUOTED') + ' ' + substitutions(s);   // a placeholder TOKEN, so `git -C "C:/x y" push` still reads as a push
const gatedAt = stages.findIndex((s) => new RegExp(GIT.source + '(commit|push)\\b').test(unquoted(s)));
if (!gated) return;                                   // :89 — no sink row for non-git calls
const fetching = stages.slice(0, gatedAt).map(unquoted).some((s) =>
  new RegExp(GIT.source + '(fetch|pull)\\b').test(s) && !/--dry-run\b/.test(s));
```
Clock: `.git/FETCH_HEAD` mtime (`:97`), threshold 30 min; absent → `.git/description` age (`:107`; written once at clone, verified on git 2.53; `.git/config` is rewritten by `git config user.name`, the step before a new clone's first commit).
**Attack:** the KNOWN LIMIT — FETCH_HEAD says WHEN you fetched, not WHETHER origin moved since; the guard does not claim the race.

### OBJ-3 `guard-ci-cited.mjs` — six reader rounds; the message source is the whole design
```js
// :195-223 — where the message comes from, in priority order (paraphrased where marked /* … */; verbatim otherwise)
const writtenInCommand = p === '-' || (base && new RegExp('(?:>{1,2}\\|?|\\btee\\b(?:\\s+-a)?)\\s*(?:"[^"]*"|\'[^\']*\'|\\S*)?' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(cmd.slice(0, ci)));
if (writtenInCommand) { msgSource = 'written-in-command'; }            // file is stale BY CONSTRUCTION → command text
else {
  /* :201-204 stat the MSYS-resolved candidates → statMtime, found; then: */
  const turnStart = turnStartMs(payload && payload.transcript_path);   // :59-104 — last REAL user message, read backwards in 512 KB chunks to 8 MB; tool_result + task-notification entries skipped
  if (turnStart !== null && statMtime < turnStart) {
    msgSource = 'msgfile-predates-turn';                               // earlier turn → command text
  } else {
    try { msg = readFileSync(found, 'utf8'); msgSource = turnStart === null ? 'msgfile(age-undetermined: transcript unreadable)' : 'msgfile'; }
    catch { msgSource = 'msgfile-unreadable'; }
  }
}
if (msg === null) { msg = commandText; msgSource = (msgSource ? msgSource + '+' : '') + 'command-text'; } // :220 — raw command up to the END OF THE COMMIT STAGE (:188)
const cited = /\b\d{10,11}\b/.test(msg);                               // :223
```
Trigger: the commit stage that names `COMPLETION_REPORT`, found by a quote-aware split (`:130-155`) — an echoed `git commit` no longer hides the real one; `-m "close; see R"` no longer breaks the trigger (5 of 58 real closes had). **Stated limits (header + scope [r12]):** the trigger sees 53 of 527 real report-touching commits — the rest name the report only in `git add` (staged-index blindness); a 10-11-digit non-run-id in the pre-commit text silences (74 of 3,948 commands, 0 of the 58 closes); the earlier-turn stale read is **measured free** (0 of 58; your ruling 09:09).
**Attack:** the `\b\d{10,11}\b` citation test itself — a run id is checked for EXISTENCE, not greenness (limit 1, by design); and `turnStartMs` reading up to 8 MB of the transcript backwards on every completion-report commit (measured need: 32 of 94 real cases sat beyond a single 512 KB tail, max 2.5 MB; the four with no user entry at all read the file labelled `age-undetermined`).

### OBJ-6c `guard-result-shape.mjs` — four rounds against 75,819 replayed results
```js
// :126-142 — the harness's stdout belongs to ONE pipeline or to nothing
function singlePipeline(ec, depth = 0) {
  const body = splitStages(ec).filter((s) => !/^(cd|export|set|source|pushd|popd)\b/.test(s));
  if (body.length !== 1) return null;
  const w = /^(?:ssh\b[^"']*|(?:bash|sh|su\b[^"']*)\s+(?:-l?c|-c)\s*)("([^"]*)"|'([^']*)')((?:\s*\d?>[>&]?\S*)*(?:\s*\|\s*(?:head|tail)\s+(?:-n\s*|-)\d+\b\S*)?)\s*$/.exec(one);
  if (w && depth < 2) { const inner = singlePipeline(w[2] !== undefined ? w[2] : w[3], depth + 1); if (inner === null) return null; return w[4] && w[4].trim() ? one : inner; }
  return one;
}
// :173-219 — the four legs; each needs a COMMAND property and an OUTPUT property
cap-bound:      pipe && cap >= 5 && nLines === cap                       // "MAY have bounded it"
error-counted:  pipe && ERROR_SIG on stdout && last line bare integer && COUNTER_LAST(pipe)
html-not-json:  asksApi(ec) && body starts <!DOCTYPE|<html|<title>
other-document: pipe && pathIdWords(pipe) && H1 within 20 lines && NO shared word
// :236-238 — the wire: stderr is structurally EMPTY (merged into stdout); the cwd notice begins with "\n"
const rawErr = typeof resp.stderr === 'string' ? resp.stderr : '';
const errRest = rawErr.replace(/^\s*Shell cwd was reset[^\n]*\n?/gm, '').trim();
let stdout = (errRest ? errRest + '\n' : '') + (typeof resp.stdout === 'string' ? resp.stdout : '');
// :251-275 — TWO CHANNELS (your ruling): cap-bound one terse deduped line; the other legs the full warning
```
Replayed rates at r3 (your `RULED ON REPORTED FACT` stands — the corpus is on the laptop): cap-bound 2,273 / 75,819 · html-not-json 1 (true) · error-counted 0 · other-document 0. **Stated:** instance 8 as it occurred is NOT caught (pinned as a known-gap control); `error-counted` has zero real fires — proven on fixtures; the split is escape-blind (`\"`), silence-direction only.
**Attack:** `COUNTER_LAST` (`:160`) and `ERROR_SIG` (`:158`) — the r3 reader showed several signature alternatives are mutually redundant against the fixtures (dropping `Not Found` alone survives). I did not add fixtures per alternative; say whether that is a gap or ticket tax.

### OBJ-1 `inject-due-alerts.mjs`
`spawnSync('ssh', ['-o','ConnectTimeout=3','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes', HOST, 'python3','-'], {input: REMOTE, timeout: 3000})` — the filter runs on staging over the WHOLE file (`#980`: the mandated `tail -50` saw 4 of 11 due), emits `ALERT|id|sev|title` (title sanitised of `\r\n|`) then `COUNT|n|total`; the LAST count line is authoritative; any failure emits a VISIBLE *"could not run — not 'no alerts'"* line; `MAX_INJECT = 25` with an explicit *"+N more"*. Measured: unroutable 3.2 s exit 0 visible; live 2.0-2.5 s. **Attack:** an SSH to Frankfurt on every prompt is the wedge surface you named; the 3 s cap is enforced twice (ssh connect + spawnSync kill). Is `StrictHostKeyChecking=yes` the right failure mode when Kyle's known_hosts rotates?

### OBJ-5 `hook-selftest.mjs`
Four columns per registered hook: REGISTERED (settings) · PRESENT (file) · CURRENT (sha vs origin) · RUNNING (a sink row FROM THIS CLONE, attributed by `project_dir`; hooks with no sink read `unknown`, never `NO`). Control D: an untouched fixture reports no problems — **red while any hook is edited-uncommitted, which is the correct reading of a diverged tree.**

## 4. Judgement calls I want attacked
1. ~~probe stays through Step 7~~ **RULED (BLOCKER-1): unregistered at r2.** The shipped set's delivery is demonstrable from the four guards' own `additionalContext` fires; the probe's marginal evidence was its deny/exit-2 arms, which the shipped set does not use. File deleted at r3 (the self-test would not let it linger), logged.
2. **Per-Bash-call cost — the ABSOLUTE beside the delta (Langston):** at r2 the Bash matcher carries **six PreToolUse hooks across four blocks** (governed-read, bare-commit, tsc-baseline in one block; measurement-shape, stale-fetch, ci-cited in three) **plus two PostToolUse** — **eight node spawns per Bash call** (nine before the probe came out). *(Langston corrected my "seven": the prose listed six and the sentence said five.)* The 47-85 ms/hook figure is mine, from one laptop, unreplicated; ~376-680 ms per call at the absolute. Judged acceptable for warn-only instruments; the absolute is what decides tolerability and is now stated.
3. **`cap-bound` dedupe state** (`~/.claude/result-shape-dedupe.json`, session + pipeline hash, 500 keys) — scope confirmed as intended: session-keyed, so no cross-clone silencing. **Stated (Langston):** it is a shared-`$HOME` read-modify-write with no atomic rename and four sessions share that home; worst case a lost key and one extra terse line. In the hook's KNOWN GAPS as (7).
4. **The OBJ-6d agent-hook probe** — **RULED: logged anyway.** One `DELETED_COMPONENTS_LOG` entry naming the measurement it produced and pointing at scope [r7]; landed at r2.

## 5. Reviewer rounds on this dispatch (the record, not evidence)
The hooks themselves went through: OBJ-4 four rounds (r1-r4 + your condition 5); OBJ-2/3 six rounds (r1 reader → r3 → r4 object → r5 → r6 on your ruling → the measurement); OBJ-6c three rounds at the cap, ending on an object round, plus r4 from that round's one contradiction; OBJ-1 one round. **This change list itself:** `REVIEWER r1: object (the ref + this file) · PARTLY on 3 of 6 claims · re-derived y — READY-AT was stale (the OBJ-3 hook moved to r7 after the draft), the probe's delta read +138 for +129/−9, one citation pointed at a comment not the join, two quoted lines paraphrased the code (a non-existent esc() helper; a msgSource assignment that would read "null+command-text"); all corrected above, every citation re-anchored at the current head.` · `REVIEWER r2: object (4d55fd2ee) · all six called-out items satisfied; three one-line range offsets noted, none misdirecting · loop closed on an object round.`
**Langston Step-4 verdict (09:46): CHANGES-NEEDED, one blocker + seven findings, then APPROVED on the diff of those.** Applied at r2 (the commit carrying this line): BLOCKER-1 probe unregistered; F1 full alert ids on the wire (the CLI no-ops on a prefix); F2 stale-fetch gate quote-aware (arm + mutation); F3 msgfile basename anchored to a path separator (arm + mutation); F4 KNOWN GAP (5) reworded — above 128 KB the whole guard runs on the window; F5 bare `Not Found` dropped from `ERROR_SIG`; F6 the measurement-shape header sentence reworded so a mechanical grep of the claim passes; F7 the five `.claude/` paths added to the exclusion list. Judgement calls 2-4: the absolute per-call cost stated (seven spawns per Bash call after the probe's removal), the dedupe file's non-atomic shared-`$HOME` write stated as gap (7), the agent probe logged in `DELETED_COMPONENTS_LOG`.
