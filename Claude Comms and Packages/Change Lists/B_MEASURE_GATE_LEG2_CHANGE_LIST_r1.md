# B-MEASURE-GATE leg 2 — Step-4 change list r1 (Langston code review at the graded ref)

**READY-AT:** the commit that carries this file on `origin/migration/aws-supabase` (subject begins `B-MEASURE-GATE Step-4: change list r1`; the code it describes is unchanged from `fcabe3254`, the r7 head) · **owner:** CC-A (OLD Claude) · **change-class:** architecture (scope header) · **ONE GATE THIS DISPATCH:** *does the code at the ref do what the scope's OBJ-0 → OBJ-6 say it does, within the pre-registered constraints — warn-only, fail-open, never on a value, silence non-evidential.* Design rulings are all already made (scope r3-r12); this is the diff.

## 1. The change set — enumerated, and what is NOT in it
Base for the diff: `66f7c7500` (the commit before the Step-2 amendment `24f4b39bb`, 08-31 14:50). **Every path below is untracked-checked: `git status --porcelain` at the ref shows only `.claude/launch.json` (local config, deliberately unversioned).**
| path | status | lines | role |
|---|---|---|---|
| `.claude/hooks/guard-measurement-shape.mjs` | NEW | 349 | **OBJ-4** — PreToolUse, three pre-execution measurement shapes |
| `.claude/hooks/guard-stale-fetch.mjs` | NEW | 116 | **OBJ-2** — PreToolUse, §7.1 step 0 |
| `.claude/hooks/guard-ci-cited.mjs` | NEW | 246 | **OBJ-3** — PreToolUse, rule 19's citation (r7 at `fcabe3254`: the turn-start read widened to 8 MB) |
| `.claude/hooks/guard-result-shape.mjs` | NEW | 285 | **OBJ-6c** — PostToolUse, result-vs-request |
| `.claude/hooks/observe-userpromptsubmit.mjs` · `observe-posttooluse.mjs` | NEW | 62 · 51 | **OBJ-1 / 6c stage 1** — payload-shape observers, keys+types only |
| `.claude/hooks/inject-due-alerts.mjs` | NEW | 149 | **OBJ-1 stage 2** — UserPromptSubmit, §10.5 whole-file alert read |
| `.claude/hooks/probe-warn-delivery.mjs` | MODIFIED | +129 / −9 (12 → 132 lines) | **OBJ-4's gate instrument** — six delivery arms; **judgement call 1 below** |
| `.claude/settings.local.json` | MODIFIED | +57 | registrations: PreToolUse ×3 new blocks, PostToolUse (new event), UserPromptSubmit (new event); **the OBJ-6d agent-hook probe was registered and REMOVED within the batch** — not at the ref |
| `scripts/measure-gate/hook-selftest.mjs` + `test-hook-selftest.mjs` | NEW | 220 · 103 | **OBJ-5** — REGISTERED / PRESENT / CURRENT / RUNNING per hook, 5/5 |
| `scripts/measure-gate/test-guard-measurement-shape.mjs` | NEW | 424 | 79/79, 11 mutations |
| `scripts/measure-gate/test-guards-obj23.mjs` | NEW | 347 | 64/64, 18 mutations |
| `scripts/measure-gate/test-guard-result-shape.mjs` | NEW | 160 | 76/76, 21 mutations |
| `scripts/measure-gate/obj6b_*.py` (7) + `README.md` | NEW | — | **OBJ-6b** instruments, as run; enumeration cleared by you, split vacated |
**NOT mine, in the same base..ref range:** `.claude/hooks/fresh-rules.mjs` (+308, `B-CROSS-SESSION-BLEED`, CC-B), `.gitattributes`, `server/**`, `token-watch/**`, `drizzle/**`, `client/**` — other batches. `CLAUDE.md`/`CONDUCT.md`/`MISTAKE_PATTERNS.md`/scope/pre-audit edits are governance, reviewed at Step 10.

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
// :61-75 — the gate and the silencer, quote-aware, ordered
const GIT = /\bgit\b(?:\s+-[Cc]\s*(?:"[^"]*"|'[^']*'|\S+))*\s+/;
const stages = cmd.split(/&&|\|\||[;\n]/);
const gatedAt = stages.findIndex((s) => new RegExp(GIT.source + '(commit|push)\\b').test(s));
if (!gated) return;                                   // no sink row for non-git calls
const substitutions = (s) => (s.match(/\$\(([^()]*)\)/g) || []).join(' ');
const unquoted = (s) => s.replace(/"[^"]*"|'[^']*'/g, ' ') + ' ' + substitutions(s);
const fetching = stages.slice(0, gatedAt).map(unquoted).some((s) =>
  new RegExp(GIT.source + '(fetch|pull)\\b').test(s) && !/--dry-run\b/.test(s));
```
Clock: `.git/FETCH_HEAD` mtime, threshold 30 min; absent → `.git/description` age (written once at clone, verified on git 2.53; `.git/config` is rewritten by `git config user.name`, the step before a new clone's first commit) — `:80-88`.
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
1. **`probe-warn-delivery.mjs` is still registered at the ref** (`settings.local.json:144`). Its purpose — measuring the delivery channel — is discharged (scope r7). I propose it stays through Step 7 so the shipped set's delivery can be shown from its own sink rows, then is unregistered at Step 10 with a `DELETED_COMPONENTS_LOG` entry. Alternative: unregister now. Your call.
2. **Two guards per event fire on every Bash call** (measurement-shape, stale-fetch, ci-cited pre; observe + result-shape post): measured ~47-85 ms each. Five hooks ≈ 250-400 ms added per Bash call. I judged that acceptable for warn-only instruments; say if not.
3. **`cap-bound` dedupe state lives in `~/.claude/result-shape-dedupe.json`** keyed by session + pipeline hash, bounded at 500 keys. It is per-laptop, not per-clone — a pipeline first seen in one clone is silenced in another clone's session only if the session_id matches, which it never does. Confirm that is the intended scope.
4. **The OBJ-6d agent-hook probe was registered and removed inside the batch** — nothing of it is at the ref; the measurements are in scope [r7] only. Is a settings change that never reached a graded ref reviewable, or does it need a note in `DELETED_COMPONENTS_LOG` anyway?

## 5. Reviewer rounds on this dispatch (the record, not evidence)
The hooks themselves went through: OBJ-4 four rounds (r1-r4 + your condition 5); OBJ-2/3 six rounds (r1 reader → r3 → r4 object → r5 → r6 on your ruling → the measurement); OBJ-6c three rounds at the cap, ending on an object round, plus r4 from that round's one contradiction; OBJ-1 one round. **This change list itself:** `REVIEWER r1: object (the ref + this file) · PARTLY on 3 of 6 claims · re-derived y — READY-AT was stale (the OBJ-3 hook moved to r7 after the draft), the probe's delta read +138 for +129/−9, one citation pointed at a comment not the join, two quoted lines paraphrased the code (a non-existent esc() helper; a msgSource assignment that would read "null+command-text"); all corrected above, every citation re-anchored at the current head.`
