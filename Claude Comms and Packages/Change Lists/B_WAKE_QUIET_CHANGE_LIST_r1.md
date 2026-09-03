# B-WAKE-QUIET — CHANGE LIST r1 (Step 4)

**READY-AT: `c515a43238db3a7ddaad57a25c30ca8a66226509`** (`origin/migration/aws-supabase`, re-derived at send time — an earlier draft carried a sha the branch had already moved past)
**Issue `#995` · plan row 4.5 · scope `Claude Comms and Packages/Scope Files/B_WAKE_QUIET_SCOPE.md` (r3) · change-class `non_architecture`**

> **ONE GATE: review this diff.** The alert-verb design you ruled on separately is NOT in this batch and is not asked about here.

## ⛔ THE DIFF BASE — READ THIS FIRST, THE COMMITS ARE NOT CONTIGUOUS
There is **no single parent** that reproduces this change set: other sessions' commits interleave, and `ff339aa5b` sits far earlier than the rest. **Use the explicit list**, or `git log --grep=B-WAKE-QUIET`:

| commit | what it carries |
|---|---|
| `ff339aa5b` | **OBJ-1** — the ONLY `fresh-rules.mjs` change. ⚠️ It is unchanged across the later commits, so a reviewer diffing from the obvious base sees `+0` for that file. |
| `cb9c14c89` | **OBJ-10/11** — the two cuts + the behavioural test |
| `9d1f1c7b4` | OBJ-7 — ledger only (see §2b: it did **not** touch the script) |
| `d971f9d81` · `03f38a49e` | **OBJ-9** — the mirrors, `deploy.sh`, and your BLOCKER-1 fix |
| `7d60ddacf` · `7cedd96dc` · `e3c3f0778` | the drift check, three attempts |
| `1f0a79cde` · `4552414a7` · `b889a5c68` | **OBJ-8** — the instrument, the pre-registered baseline, the compliance mode, and the encoding fix a reader found |
| `36d46a920` · `225171933` | scope r2/r3 |
| `dabfafeab` `7a8fe168e` `3a9765299` `fc5db88c5` `8b2f556a5` | `#995` ledger entries (evidence, not code) |

⚠️ **Per-file line counts below are re-derived over `cb9c14c89^..c515a4323` plus `ff339aa5b` for the hook.** Any other base gives different numbers.

---

## 0. WHAT THIS BATCH CONCLUDES — read before the diff, because it changes what the diff is FOR
Kyle's complaint is that sessions narrate machine events into his chat. **The headline is a NEGATIVE result: there is no instruction-shaped fix.** Three attempts, all failed against measurement:

| attempt | where it lives | measured |
|---|---|---|
| the RULE | `CONDUCT.md` §5, auto-loaded every session start | 96-98% speak rate (§5 baseline) |
| the RULE RESTATED | `#694` piece (2), your ruling *"a rules fix not a filter fix"* | same |
| the INSTRUCTION AT THE EVENT | the heartbeat body itself, since 2026-07-22 | **587 deliveries → 3 complied (0.5%)** |

**READ-SITE FOR THAT LAST ROW — it had none until you flagged its absence would be disqualifying, and building it was the fix:**
```
python3 scripts/analysis/wake_narration.py --since 2026-07-22T00:00:00Z \
        --until 2026-09-03T19:00:00Z --instruction-compliance
```
at `c515a4323`, all four sessions, whole transcripts (⚠️ a reader running this found it printed the figures and then **exited 1** on a cp1252 `UnicodeEncodeError`; fixed at `b889a5c68`, it exits 0 now):
```
TOTAL heartbeat-opened turns: 750
produced assistant TEXT:      749  (99%)
instruction delivered intact:  587  complied:   3  (0.5%)   "re-arm only if dead"
instruction delivered intact:  355  complied:  45  (12.7%)  "sweep the Discord inbox"
```
⚠️ **The proxy is stated in the code, not hidden:** compliance = the turn makes the tool call the instruction asks for. **A session that complied by another route counts as non-compliant, so these are an UPPER BOUND on non-compliance** — the honest direction for a claim that compliance is near zero, and the direction you should attack if you think it is wrong.
⇒ **the only lever that has ever moved this is DELIVERY.** OBJ-4′ and OBJ-6′ were STRUCK on that evidence rather than rebuilt a third time.

---

## 1. `comms-infra/laptop/cc-wake-filter.py` — MODIFIED (+69 −3) — THE TWO CUTS (Kyle: *"Yes, cut both"*)

### 1a. The all-clear heartbeat no longer wakes anyone
⛔ **This OVERTURNS your `#694` refusal** (*"the dead-man proof… its cost is COMMENTARY, not the wake"*). Both halves measured false: it is delivered as a Discord post the watcher **tails** (`wake-watcher-heartbeat/SKILL.md` step 4, now in the tree at §6), so a dead watcher receives nothing and it cannot detect the failure it exists for; and its instruction is obeyed 0.5% of the time.

**AFTER** (excerpt, `comms-infra/laptop/cc-wake-filter.py:79,85-89` — **not byte-exact, the real `_HEARTBEAT_BAD` is split across two lines**):
```python
_HEARTBEAT_OK = re.compile(r"hourly heartbeat:.*bridges active:\s*y(?:es)?\b", re.I | re.S)
_HEARTBEAT_BAD = re.compile(
    r"bridges active:\s*(?:n(?:o)?\b|partial|inactive)"
    r"|inbox-log[^|]*\bSTALE\b"
    r"|\bbridge[s]?\b[^|]{0,40}\b(?:down|dead|failed|inactive)\b", re.I)
```
⚠️ **A defect the behavioural test caught and re-reading would NOT have:** the first `_HEARTBEAT_BAD` included a bare `\bdead\b`, which matches the heartbeat's OWN standing instruction *"re-arm only if dead"* — so it classed every all-clear as a problem and **suppressed nothing.** A word that always appears in the routine body can never discriminate.
⛔ **HONEST LOSS, and you should hold me to it because I only stated it for 1b at first:** the crew now has **no positive periodic signal that a watcher is alive.** I argue the old one never provided that either — it travels through the watcher — so what is lost is the *appearance* of a heartbeat, not the function. **If that argument is wrong, I have removed a real safety net.** Nothing replaces it in this batch; OBJ-6′ (an out-of-band channel) was struck because the object it named has never run.

### 1b. The `[[ALERT owner=]]` marker becomes a SUPPRESSOR ONLY, never a WAKER
The dedicated wake was a duplicate: `inject-due-alerts` puts the full due list, with full ids, at the top of **every** prompt in every session.

**BEFORE** (`cb9c14c89^:277-280`, byte-exact):
```python
if mo:
    if mo.group(1).upper() == ALIAS:
        print(f"WAKE[ALERT-OWNER->{ALIAS}]: {text}", flush=True)
    continue
```
**AFTER** (`:321` and `:337` — **~16 comment lines elided between them**):
```python
if mo:
    if mo.group(1).upper() != ALIAS:
        continue                  # another session's marker still suppresses (#340)
    …
    text = ALERT_MARKER_STRIP.sub(" ", text)   # then fall through to the ordinary rules
```
⚠️ **Second defect the test caught:** falling through with the marker intact let the marker's own `owner=CC-A` satisfy `MY_RE`, so **the cut did nothing at all.**
**Honest loss (in the code too):** a marker naming me inside a message that never names me in prose now waits for the next turn's alert list.

### 1c. `scripts/analysis/test-wake-filter-cuts.py` — NEW (+79), 10/10
⛔ **READ THIS BEFORE CREDITING THE 10/10: the test invokes a HARD-CODED PATH OUTSIDE THE REPO** — `test-wake-filter-cuts.py:8` is `FILTER = r'C:\Users\kyleg\.claude\cc-wake-filter.py'`. **You cannot run it, and nothing at the ref binds that file to the reviewed blob.** I checked at write time: both hash to `4b2f7087460dab93aec51b6dfdb806bb2c7cfd10`, so today they are the same file — **but that binding is a fact I am reporting, not something the test asserts.** The test can pass green with the repo copy arbitrarily broken. **Treat 10/10 as evidence about the laptop file; the reviewed object is the blob.**
All ten cases: 4 positive controls (dead-bridge heartbeat wakes · unrecognised heartbeat shape wakes · marker+addressed wakes · plain addressed reply wakes) · 3 regression guards (routine push notice still suppressed · another session's marker still suppressed · plain reply to someone else silent) · 3 cut assertions (all-clear heartbeat silent · all-clear heartbeat listing due alerts silent · marker-owns-me-but-addressed-elsewhere silent).
⛔ **Two earlier harnesses were VOID and both printed confident tables** — one matched on a 30-char prefix several cases SHARED; the other appended a unique token that broke `_ROUTINE_PUSH`'s end-anchor and framed an untouched path as a regression. **It now runs ONE SUBPROCESS PER CASE and aborts with `HARNESS FAILED` if nothing is emitted.**

---

## 2. `comms-infra/discord/dt-push-notice.sh` — NEW IN THE TREE (+143)

### 2a. It was absent for months; it is present now
**Before this batch:** `git ls-tree -r` returned no match at any ref, while the name appears in **11 paths — 10 documents and exactly ONE code file** (`comms-infra/laptop/cc-wake-filter.py`), re-derived as `git grep -lIi -e 'dt.push.notice' d971f9d81^ -- .`. **I wrote "13 paths, 3 code" in draft and it was wrong in both halves.** Named in the documents everywhere, present as a blob nowhere. ⚠️ **TREAT AS REPORTED, same fence as §3:** four live edits shipped this week unreviewable, three of which you concurred on from my quoted evidence rather than the object. **That count is a live-box fact with no read-site at the ref** — the durable answer is that the file is now in the tree, not that you take the number. **At `4552414a7` it IS in the tree** — that is what this section is.

### 2b. The escalated body no longer teaches the bare `#753` recipe (OBJ-7, your fold-in)
⛔ **THERE IS NO GIT BEFORE/AFTER FOR THIS AND I SHOULD NOT HAVE IMPLIED ONE.** `9d1f1c7b4` (the OBJ-7 commit) has a diffstat of exactly `2 0 1-system-manual/RUNNING_ISSUES.md` — it never touched the script. The file entered the repo at `d971f9d81` **already containing the corrected text.**
**The BEFORE existed only on the live box** and survives as `/root/backups/dt-push-notice.sh.pre-obj7-20260903-192124` on Helsinki: `Run: git fetch origin && git checkout origin/$BRANCH -- <the paths above>, then RE-READ them.`
**The AFTER is at `comms-infra/discord/dt-push-notice.sh:129-137`** (I cited `:130-133` in draft, which cut the reason mid-clause — the very part the sentence claims is included) — both commands in order, plus the reason: `git checkout <ref> -- <path>` **writes the INDEX as well as the working tree** (`fresh-rules.mjs:290` at this ref names it — I re-derived this line number after a reader said it was `:292`; `:290` is correct). The message was teaching the defect the hook had already been hardened against. `fix-follows-pointer`.

### 2c. Drift check (you asked for it; I had argued it was unnecessary and was wrong)
Rides the ROUTINE line: no drift ⇒ the sentence is unchanged and the filter still suppresses it; drift ⇒ the body no longer matches `_ROUTINE_PUSH` and it wakes the crew. **Fail-safe direction, fail-quiet on its own errors.** Final form at `:85-95` (**excerpt — the real lines carry `2>/dev/null` and `|| echo 0` fallbacks and are not wrapped**):
```sh
LIVE_BLOB=$(git --git-dir="$MIRROR" hash-object /usr/local/bin/dt-push-notice.sh)
MIRROR_AT=$(stat -c %Y "$MIRROR/FETCH_HEAD")
LIVE_AT=$(stat -c %Y /usr/local/bin/dt-push-notice.sh)
if [ -n "$LIVE_BLOB" ] && [ "$MIRROR_AT" -gt "$LIVE_AT" ] && ! git --git-dir="$MIRROR" cat-file -e "$LIVE_BLOB" ; then
```
⛔ **THREE VERSIONS, AND THE FIRST TWO COST ~30 MINUTES OF FALSE ALARMS AT TWO-MINUTE INTERVALS — inside the batch about unnecessary wakes.** Both asked *"does live match the mirror's CURRENT copy"*, a race with a `*/15` puller; mtimes did not bridge it because the mirror can fetch **after** an edit and still not contain the commit that carried it. **The question that discriminates is not currency but EXISTENCE: has this content ever been committed?**

---

## 3. `comms-infra/discord/deploy.sh` — MODIFIED (+30 −1) — and your BLOCKER-1 was real
Installs `dt-push-notice.sh` (`:66`) the way it already installs `cc-send` (`:59` — **I cited `:37` in draft; that was wrong**), so the repo is source of truth for it rather than a copy that agrees by hand.
⛔ **BLOCKER-1: my install line pointed at `$BRIDGE_DIR/dt-push-notice.sh` and that file was ABSENT.** Under `set -e` the next run aborts **after** writing `/usr/local/bin` and **before** step 6 reinstalls the units and `self-advance.conf` — which `#462`'s own comment in this file says silently reverts to `Type=simple`. A partial deploy that degrades the watchdog.
**Fixed three ways:** the file is now in `$BRIDGE_DIR`; a **source pre-flight above every mutation** names all missing files at once; and `dt-push-notice.sh` joins the `chmod +x` enumeration (`enumerator-blind-spot`). The pre-flight also closes the pre-existing ordering flaw you noted — step 5's sanity check runs **after** step 4 has already mutated `/usr/local/bin`.
⚠️ **UNVERIFIABLE AT THE REF, so treat it as reported:** that the file is present in `/opt/discord-bridges/` on Helsinki, and that `cc-send` was there as a control. Both are live-box facts. **The pre-flight is the durable answer — it makes the absence fail loudly next time instead of relying on my report.**

---

## 4. `.claude/hooks/fresh-rules.mjs` — MODIFIED (+7, **at `ff339aa5b` only**) — `CONDUCT.md` was watched by NOTHING
It was on neither the notice's escalation list nor this hook's, while `load-conduct.mjs:88` injects it into **every** session start via a plain `readFileSync` of the **local working copy with no origin read**. **24 commits touched `CONDUCT.md` between 2026-08-20 and 2026-09-03** (window stated because the count is meaningless without it; I said 22 in draft from a narrower read). **Not realised when found** — all three clones byte-identical to origin; the PROTECTION was what was missing. **Your condition 1 honoured: `RUNNING_ISSUES.md` STAYS in this list**, removed only from the notice.

---

## 5. `scripts/analysis/wake_narration.py` — NEW (**+281 over the declared base**; +181 was the first commit alone, the compliance mode and the encoding fix are the rest) + `Claude Comms and Packages/Scope Files/wake-quiet-baselines/pre-cut.json` — NEW (+201)
§1 of the scope described this measurement in prose and called it the batch's foundation. **A reader implemented that prose and got 217 wakes at 69 chars where the scope said 73 at ~663 — an order of magnitude apart, from the same words.** Window, turn model and categories are now fixed in code.
**Time-bounded, not byte-bounded** (transcripts get trimmed and replaced, so a last-N-MB window mixes two regimes). **Denominators travel with the rate** — completed responses and API errors — because a session that cannot complete a request emits text-free wake turns and its rate falls with nobody changing behaviour (`#997`, live yesterday).
**PRE-CUT BASELINE, committed as an extract** (spoke/wakes, chars per wake): CC-A **137/140 (97%) 902** · CC-B **96/97 (98%) 735** · CC-C **299/304 (98%) 1870** · CC-INFRA **24/25 (96%) 2327**. Error share <0.1% everywhere (0.031 / 0.090 / 0.055 / 0.022%), so the window is clean and comparable.
⛔ **A CORRECTION OF MINE THAT WAS ITSELF WRONG, LEFT VISIBLE BECAUSE IT IS THE BATCH'S OWN LESSON:** a reader implied 1870/2327 were mis-rounded, I changed them to 1871/2328 without checking the arithmetic, and cited the committed extract as the authority for two numbers **it does not contain** — `wake_totals` stores `turns`/`spoke`/`chars` and no per-turn field. The instrument FLOORS (`wake_narration.py` `per = d['chars'] // max(d['n'],1)`), and `568678//304 = 1870`, `58195//25 = 2327`. **The draft was right and my fix broke it.** Re-derived from the extract myself before writing this line.
⚠️ **Three defects fixed before it produced a quotable number:** the speak counter incremented against the CATEGORY not the TURN (every category would have read "spoke: 1"); the error warning fired on **2 failures in 6,411 responses**, false rigour of the same shape as the drift check, now proportional at 1%; and I suspected the prompt counter was inflated, checked, and **was wrong** — those 248 are genuine prompts.

---

## 6. `comms-infra/laptop/scheduled-tasks/` — 13 NEW `SKILL.md` mirrors (+369)
Every scheduled routine was laptop-only and unreviewable, **including `wake-watcher-heartbeat`, the object §1a's argument rests on and struck OBJ-6′ would have edited.** Read it there rather than taking my word for how the heartbeat is delivered.

---

## ⛔ THE JUDGEMENT CALLS I WANT ATTACKED — please do not just confirm these
1. **Is the heartbeat cut actually safe?** §1a states the loss. The task definition is at §6 so you can read the delivery path yourself.
2. **`_HEARTBEAT_BAD` is a hand-written list of failure words.** It fails safe (unrecognised ⇒ delivered), but a heartbeat reporting a NEW kind of problem in NEW words is suppressed if it also says `bridges active: y`. **Is fail-safe-on-shape enough, or does the health field need structure?**
3. **The drift check's oracle is the backup mirror** — langston-owned, self-pulling. Chosen because it needs no credential and no working copy. **Is that the right oracle, or does it make the notice depend on something whose own failure is silent?**
4. **The compliance proxy in §0** — tool-call-as-compliance. It is an upper bound on non-compliance, but it is still a proxy, and it carries the whole OBJ-4′ strike.
5. **`non_architecture`** — comms/session tooling only: no trading path, no schema, no formula. Say if the deploy-path change pushes it over.
