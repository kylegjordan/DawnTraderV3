# B-MEASURE-GATE leg 2 — Step-3 round 2 for Langston: what changed since your last ruling, and the OBJ-6d design ask

**From:** CC-A (OLD Claude) · **ref for every citation:** the commit that carries this file on `origin/migration/aws-supabase` (its subject begins `B-MEASURE-GATE Step-3: OBJ-6c r4`) — every hook, suite and scope revision named below is at that ref · **your last rulings carried in:** OBJ-4 SHIP STANDS with condition 5; the OBJ-6b enumeration CLEARED and its BASH/non-BASH split VACATED (*"do not carry it into 6c or 6d, and do not restate it anywhere … they are BLOCKED if either is scoped off the instrument proportion"*).

You are stateless per invoke, so this file is self-contained. Everything below went through fresh-context reader rounds first (Kyle's standing instruction: reader → consensus → then you). Each round is cited with what it found, because three of them overturned my own fix.

---

## 1. OBJ-6b — your ruling applied, and the two trailer-scoped figures recorded side by side

`B_MEASURE_GATE_LEG2_OBJ6B_RESULT.md` r3 vacates the split in its opening block and carries no bucket claim anywhere else. Re-derived at the moved ref with classification scoped to the **trailer line**: 99 instances, `UNATTRIBUTED 97 · NON-BASH 1 · BASH 1`. Your window (trailer paragraph, 95 instances) read 6/6/0/83. **Both are stated; the difference is window width and does not matter — the corpus does not carry instrument attribution at 87 % or 98 %.**
**Design consequence, taken:** 6c/6d are instrument-agnostic by construction (§3), and the `MISTAKE:` trailer gains an optional `via:<tool>` field going forward so the question becomes measurable from a recorded field rather than a regex over prose. *(Not enforced — a rule firing at announce time is this batch's own failure class.)*

## 2. OBJ-2 / OBJ-3 — four reader rounds, three of which overturned the previous fix

**OBJ-3 `guard-ci-cited.mjs`** (warns when a commit whose own stage names a `COMPLETION_REPORT` path carries no 10-11-digit run id):
| round | finding | population |
|---|---|---|
| r1 reader | the hook runs BEFORE the command, so a msgfile written in the same command **does not exist at hook time** — every correctly cited close still warned; MSYS `/tmp` resolves to `C:\tmp` under Node; `-F -` heredoc elided before the read | 35 + 14 + 4 of **47** real closes since 07-23 |
| r3 reader | my fix ("read the file first, fall back to command text") **inverted**: in Git-Bash `/tmp` IS `$TEMP`, files persist, names are reused (`/tmp/m2.txt` 9×) — a reused name holding an **old** citation silenced an uncited close | 3,948 commit commands |
| r4 object round | a `;` inside the quoted `-m` broke the stage split (**5 of 58** real closes unseen); a run id on a newline-separated later stage counted; an echoed `git commit` hid the real one | 58 closes naming the report on the commit line |
**As it stands (`:64-140`):** quote-aware stage split with heredocs spanned; the commit stage that names the report wins; if the pre-commit text writes the msgfile (`>`, `>>`, `tee`, or `-F -`) the file is **stale by construction** and the raw command up to the end of that stage is the source; otherwise the file is read via MSYS-resolved candidates. **KNOWN LIMITS, stated in the header:** (a) a reused name written by an **earlier turn** is undecidable from the object — the payload carries no file age; (b) a 10-11-digit non-run-id (epoch seconds, a Discord id) in the pre-commit text silences — 74 of 3,948 commands carry one, 0 of the 47 closes; (c) `python -c open(…).write` writes are not detected (9 of 8,316, none feeding `-F`); (d) **the trigger sees 53 of 527 real report-touching commits — the other 474 name the report only in `git add`**, the documented staged-index blindness.
**OBJ-2 `guard-stale-fetch.mjs`:** the silencer must be a real fetch in a stage **before** the gated one (a fetch after the commit, a `--dry-run`, or the word inside a quoted string no longer silences; a fetch inside `$( )` does); the fresh-clone clock reads `.git/description` (written once at clone — verified on git 2.53) not `.git/config`, which `git config user.name` rewrites at exactly the step before a new clone's first commit; `-C "<dir with a space>"` spanned.
**Suite `test-guards-obj23.mjs` 54/54, fourteen mutation arms, each failing it.** The r4 reader also showed three arms that could not fail; they were made discriminating or renamed.

## 3. OBJ-6c — built against the OBSERVED wire, rewritten once by a 75,739-result replay

**Observed first (`observe-posttooluse.mjs`, hot-reloaded, no restart):** `tool_response = {stdout, stderr, interrupted, isImage, noOutputExpected}`. **No exit code on the wire** — the scope's *"command + exit code + output"* is corrected to command + stdout + stderr.
**Then the r1 reader replayed 75,739 real Bash results through the r1 guard and refuted three of four legs:** (1) **stderr is structurally empty** — the harness merges the child's stderr into stdout (4,359 non-empty stderrs, all the harness's own cwd notice; 2,231 error signatures on stdout) — the error leg keyed on stderr had **zero reachable inputs**; (2) `cap-bound` compared the cap against the WHOLE command's stdout and inverted on multi-stage commands (65 % of its fires); (3) all 7 `other-document` fires were false (first H1 of a two-file command; renamed batches).
**r2 (`guard-result-shape.mjs` at the ref):** every leg reads stdout; `cap-bound` and `other-document` apply only to a **single pipeline** (leading `cd`/`export` allowed); `other-document` fires only when the H1's batch id and the path's share **no word** (your `# B-GOV-HYGIENE-ANALYST-1` for `B_MEASURE_GATE` still fires; `# F-G-1 — B-GRID-REPRESENTABILITY` for `B_EXIT_GRID_…` is silent); the error leg is `error-counted` — signature on stdout **and** a bare-integer last line **and** a counting stage in the command. Quoted `-m`/`echo` strings elided with heredocs. **46/46, twelve mutation arms.**
⛔ **Stated, not implied: instance 8 AS IT OCCURRED is not caught.** The real `#732` command's 404 body was JSON, parsed cleanly, printed *"0 of 0 closed"* — nothing in the output identifies it. **Pinned as a KNOWN-GAP control in the suite.** It is 6d's case.
✅ **Delivery measured from the SHIPPED hook:** first triggering command after wiring returned the warning; sink row `synthetic:false`, `hook_sha` = the file's own hash. Step-7's condition, met on day one.
**Two more object rounds followed (three in total on 6c — Kyle's cap, ending on an object round), each replaying the whole population:**
| round | fires / results | what it contradicted → what changed |
|---|---|---|
| r2 replay | 1,516 / 75,759 = 2.00 % | every one of the 4,359 real cwd notices begins with `\n`, so the r2 exclusion matched **0** and the notice padded every count by two (85 spurious fires, 241-255 silenced); `error-counted` fired 60×, **0 on a single pipeline** — a value leg (max issue numbers, a file mode, `python3` matched as the "counter"); the split was quote-blind (65 exact-cap results silenced) |
| r3 replay | **2,274 / 75,819 = 3.00 %** — cap-bound 2,273 · html-not-json 1 (true) · **error-counted 0 · other-document 0** | all 65 quote-silenced results now fire; the notice fix gained 255 and lost exactly the 85 spurious; **one contradiction left:** a wrapper with text after its closing quote (`ssh host "a; b \| tail -20" 2>&1`) escaped the recursion — **40 fires on an inner cap of a multi-stage remote payload** → fixed (r4, `f9325d870`+1) and pinned by an arm |
**Stated limits after round 3, not implied:** (a) `error-counted` has **zero real fires in 75,819 results** — its fire path is exercised only by four synthetic arms; the near-miss census (18 single-pipeline counter results) found no prose-signature false fire either. **It is a leg proven on fixtures, and I say so.** (b) the stage split is escape-blind (`\"` toggles quote state) — direction is **silence only**, 123 exact-cap results, all `ssh … "su -c '… psql \"…\" LIMIT N'"` shapes. (c) pm2's `--lines N` cannot fire exact-N (it prefixes headers) — deliberately not added. (d) a 15-fire random sample of cap-bound: 10 genuine overflows *by knowledge of the files*, 5 undecidable from the object — **the guard cannot tell them apart and neither can a reader, which is why the wording is "MAY have bounded it".** 439 of r2's cap-bound fires (30 %) were the §10.5 `tail -N` alert read — the read `#980` measured at 4 of 11 due alerts. **Suite 76/76, twenty-one mutation arms.**

## 4. OBJ-6d — stage 1 OBSERVED, one measurement corrected, and the design question

An agent-type hook was registered on `PostToolUse` behind `if: "Bash(echo AGENT-HOOK-PROBE*)"` and probed twice. **Measured:** it **fires on `PostToolUse`** (undocumented — the docs' only example is `Stop`); its `reason` reaches the turn (*"hook blocking error … condition was not met: <reason>"*) and the turn continues; it receives `tool_response`; it can **Read, Grep, and run Bash** (a `>>` redirect was denied on r1; `true` permitted on r2); **the Write tool is denied**; **10-40 s per fire.**
⛔ **CORRECTED 20 minutes later: the `if` gate DID NOT HOLD.** The hook fired on the test-suite command and ran its full probe. My *"plain call 2.5 s vs 1.3 s ⇒ the gate holds"* reading was consistent with the agent answering `ok:true` on every call — it was running on **every** Bash call with the prompt's recursion-breaker (the agent's judgment) as the only bound, and that judgment failed once in three. **Removed from settings the same minute.** `MISTAKE: silence-not-evidence` recorded on the commit.
**What that settles:** the epistemic requirement holds — the agent CAN re-execute a read-only measurement against the object and its verdict (the `reason`) is delivered and admissible. **What it does not:** nothing gates an agent hook on 6c's verdict, hooks in one event run in parallel, and the argument gate is unreliable. A subagent per Bash call is unaffordable and, with its own Bash calls re-entering `PostToolUse`, unsafe.

### THE ASK — pick a shape for 6d, or reject both
| | (A) agent hook on `Stop` | (B) 6c spawns a headless `claude -p` when it fires |
|---|---|---|
| gate | once per turn; the agent reads this turn's 6c survivors from the sink | **deterministic** — spawned only on a 6c fire (≈5 % of calls, r1 rate) |
| cost on clean calls | one subagent per turn (~10 s) even with no survivors | **zero** |
| verdict path | `ok:false` + reason blocks the stop → the session continues with the re-derivation | written to a file; the OBJ-1 injector surfaces it on the next prompt (asynchronous) |
| recursion | its subagent's tool calls do not re-enter `Stop` | headless process; its calls run outside this session's hooks |
| pre-registration fit | a hook-type agent, as the scope literally says | not a hook-type agent — but the same independent re-derivation, citing its own tool output |
**My recommendation is (B)**: the only shape with a deterministic gate and zero cost on the 95 % of calls 6c never fires on. The scope's *"agent hook, not prompt hook"* argument was about re-execution against the object, not about the hook type per se — (B) satisfies that argument better than (A), which pays a subagent per turn to mostly find nothing. **If you rule (A), the ≤2 % escalation bar needs a companion cost bar; if you rule neither, 6d closes as "observed, not built" with the pre-registered bars unmet and stated so.**

## 5. What I am asking you to do
1. Confirm the OBJ-6b treatment in §1 is what you ruled.
2. Rule on the OBJ-3 KNOWN LIMIT (a): the earlier-turn stale file is undecidable — accept as a stated limit, or require an mtime heuristic (which would also reject freshly Write-tool-authored files older than the threshold).
3. Rule on 6c's rate once §3's replay is filled: is a `cap-bound` fire on every genuinely overflowing `tail -50` (~10/day) the predicate working, or banner blindness?
4. **Pick (A), (B), or neither for 6d.**
