# B-DEPLOY-DRIFT-LINE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

> ✅✅ **STEP 2 ACCEPTED by Langston 2026-09-05 08:39Z, at `6a33848dd`.** *"Both gates pass, the A7 correction is right, and I'm not reversing anything."* He re-derived `shouldDeliverToDiscord` and the hook's filter himself rather than taking them reported. **Both open questions RULED; his conditions are folded in below and marked ⭐ LANGSTON.**

**change-class: non_architecture** · **owner:** CC-A · **issue:** `#1002` · **plan row:** `PHASE_19_PLAN` 4.55
**Scope approved at `25f64f93c`** (Langston, r4 → r5 folded). **Step-2 order was fixed by his ruling: the two gates first, everything else behind them.**

---

## ⛔ PREVIOUSLY STATED vs NOW — AT THE TOP, BECAUSE THE PLAN RESTS ON IT

> **PREVIOUSLY STATED:** *"the age of the oldest undeployed commit is an UPPER BOUND on the oldest runtime-touching one. Over-states age ⇒ fires early ⇒ FAIL-SAFE."* (Langston's feasibility ruling, adopted into the scope at r5.)
> **NOW:** ⛔ **THAT REASONING INVERTS UNDER TRUNCATION, AND TRUNCATION IS EXACTLY WHEN THE GAP IS WORST.** Measured: the compare API returns the **LAST** 250 commits, not the first. `commits[0]` is therefore the *2,237th* commit of a 2,486-commit range — **the age reads 2 days when the truth is 47.**
> **REASON:** the bound runs the wrong way — under-stated by 45 days in the measured case.
>
> ✅✅ **AND THEN I WITHDREW MY OWN REVERSAL, ONE ROUND LATER. PREVIOUSLY STATED (my first draft of this document): *"the plan switches the trigger to the count and demotes age to context."* NOW: ⛔ NO REVERSAL. LANGSTON'S AGE PREDICATE STANDS.**
> **REASON: the trigger is not truncation at all — it is the ABSENCE OF A PAGINATION PARAMETER, and a fresh reader found it where I had stopped looking.** Adding **any** pagination parameter returns page 1, oldest-first. **Re-derived by me, unauthenticated, at the API:** `(no params)` → `871d04570` 2026-09-03 (position 2237); `?page=1` → **`e31d8f306` 2026-07-20 — the TRUE oldest**; same for `?per_page=250`, `?per_page=250&page=1`, `?per_page=100`.
> ★ **`?per_page=250` is NUMERICALLY IDENTICAL to the implicit cap, so it cannot change HOW MANY are dropped — only WHICH. That is the observation that separates "truncation returns the tail" from "the default parameterization selects the tail," and it is the second.**
> ⇒ **THE FIX IS ONE QUERY PARAMETER, NOT A DESIGN REVERSAL.**

> **PREVIOUSLY STATED (my scope, §5 OBJ-3):** an alert *"reaches people without interrupting them."*
> **NOW:** **true only at `info` severity.** `warning` and `critical` post to the Discord alerts webhook **and always-engage Langston's bridge**; `info` skips it. **The no-interrupt property is severity-dependent and my scope asserted it unconditionally.**
> **REASON:** I had not read the dispatcher's delivery branch when I wrote the claim.

---

# PART A — THE AUDIT

## A0. THE TWO GATES LANGSTON ORDERED FIRST

### ✅ GATE 1 — THE WRITE PATH **WORKS**. Positive control, not an inspection.
**Run from Helsinki, end to end:** minted a throwaway `health_check`/`info` alert through the supported CLI, read the row back independently, resolved it. **Result: `id a581ca9d-…`, one occurrence in the store, final `state = resolved`, `resolved_by_claimed = cc-a`, `resolution_evidence = #1002`.**
⇒ ⛔ **THE SCOPE'S CONDITIONAL STOP DOES NOT FIRE. The batch proceeds.**

**FOUR CONSTRAINTS THE CONTROL SURFACED, none of which were in the scope:**

| # | constraint | evidence |
|---|---|---|
| **A1** | ⛔ **The `staging` host alias resolves ONLY as the `langston` user.** As `root` it fails: *"Could not resolve hostname staging: Temporary failure in name resolution."* | the alias lives in `/home/langston/.ssh/config` |
| **A2** | ⛔ **`category` is a creatable-allowlist.** My first attempt used `infra` and was **REFUSED**: *"not creatable. Allowed: governance \| breakage \| soak_verification \| one_off \| verification \| reminder \| health_check."* | `system-alerts.ts:103` `assertCategoryCreatable` |
| **A3** | ⛔ **`resolve --evidence` must be a REFERENCE TOKEN, not prose.** A 56-character sentence was refused: *"must be a reference token (`path:line` \| sha \| uuid \| §/#ref) or a sanctioned sentinel."* | the refusal, and it names its own allowed forms |
| **A4** | ⚠️ **BY INSPECTION ONLY — the gate did NOT exercise it, and P7 rests entirely on it (object round).** **STEP-3 REQUIREMENT: mint twice with the same key and confirm ONE row.** ✅ **`--dedupe-key` IS A CLI FLAG** (`scripts/system-alerts.ts:204-210`, exposed by `B-STAGING-LIVENESS-WATCH`). ⇒ **Langston's age-bucket replacement is buildable with NO change to the alert service.** | the flag, and the comment naming why it exists |

### ✅ GATE 2 — TRUNCATION **IS** DETECTABLE. And it hides something worse than he predicted.
**Probe: a deliberately oversized range (2,486 commits / 761 files by local count).**

| field | returned | local truth |
|---|---|---|
| `status` | `ahead` | — |
| `ahead_by` / `total_commits` | **2486** | 2486 ✅ **TRUE even when truncated** |
| `len(commits)` | **250** | 2486 ⇒ **truncated** |
| `len(files)` | **300** | 761 ⇒ **truncated, sitting exactly at the cap** |

✅ **A5 — THE DISCRIMINATOR LANGSTON SPECIFIED WORKS: `total_commits > len(commits)` detects commit truncation, and `len(files) == 300` detects file truncation.** His fallback-to-authentication is not needed.
✅ **A6 — `status` exists with the named values** (`identical|ahead|behind|diverged`) ⇒ **CONFLICT-1's ruling is implementable as he wrote it.**

⛔ **A7 — THE UNPARAMETERIZED COMPARE CALL RETURNS A TRAILING WINDOW. ✅ FIXED BY ONE PARAMETER; THE DESIGN IS NOT AFFECTED.**
Measured: `commits[0]` = `871d04570`, dated **2026-09-03**; the true oldest commit in the range is `e31d8f306`, dated **2026-07-20**. Position of `871d04570` in the range: **2,237 of 2,486.**
⇒ **`commits[0]` is NOT the oldest undeployed commit. Under truncation the age predicate reads ~2 days against a truth of ~47.**
⇒ ⚠️ **UNCORRECTED, this would invert the "upper bound ⇒ fires early ⇒ fail-safe" reasoning: a drift alarm that goes quiet as drift grows.**
✅✅ **CORRECTED, AND THE CORRECTION IS ONE QUERY PARAMETER: `?page=1` (or any pagination parameter) RETURNS THE OLDEST-FIRST PAGE. Re-derived unauthenticated — `?page=1` → `e31d8f306` 2026-07-20, the true oldest.**
⛔⛔ **AND MY OWN WORDING WAS WRONG IN A WAY THAT WOULD HAVE MIS-BUILT THE FIX: it is NOT "the last page."** The last page at `per_page=250` is **236 commits starting at index 2251**; the unparameterized response is **250 commits starting at index 2237** — a trailing WINDOW, not a page. ★ **Code written to "fetch the last page" from my description would have landed on the wrong 236 commits.**
⚠️ **AND THE SEVERITY-SCALING HALF OF MY CLAIM WAS INFERENCE, NOT MEASUREMENT:** I tested **two** range sizes, 249 (untruncated) and 2486. *"Under-states most when the range is largest"* follows from a fixed trailing window **if** that window is invariant across sizes, **which I did not measure.** Stated as inference.
✅ **A8 — AND `total_commits` IS THE TRUE COUNT REGARDLESS** (2486 even when only 250 are returned), so it is a reliable truncation detector and a reliable magnitude. ⇒ **BOTH arms are safe once the pagination parameter is passed.**
⚠️ **A8b — THE FILE ARRAY IS STILL CAPPED AT 300 EVEN WITH PAGINATION** (measured: 300 returned against a local truth of 761). ⇒ **the runtime-path GATE still needs the truncation check; only the AGE operand is repaired by the parameter.**
⚠️ **A8c — NO `Link` HEADER IS EMITTED** on the compare response (it is listed in `Access-Control-Expose-Headers` and not sent), and there is no `truncated` flag in the body. ⇒ **`total_commits > len(commits)` is the ONLY tell, which is what makes A5 load-bearing rather than convenient.**

**A9 — RATE LIMIT: 60/hr unauthenticated, shared per-IP.** Observed `x-ratelimit-remaining` 51 then 59 across the probes. ⛔ **CORRECTED BY THE OBJECT ROUND — MY CONTENTION FIGURE WAS WRONG IN BOTH DIRECTIONS.** `dt-push-notice.sh`'s compare call sits **AFTER** the head-unchanged early exit, so **in steady state it spends ZERO calls, not 30/hr** — I over-stated routine contention. ⚠️ **And I said nothing about the burst case, which is the one that matters: a heavy push day.**
⚠️ **AND MY "51 then 59" READING PROVES LESS THAN IT LOOKS:** remaining *increasing* is consistent with a window reset **and** with the two probes leaving from different egress addresses. **The budget that matters is HELSINKI's, because that is where P1 puts the job** ⇒ **read `X-RateLimit-Remaining` from Helsinki itself, at run time, and refuse rather than half-measure.**

## A1x. SEVERITY DECIDES WHO IS INTERRUPTED — AND MY SCOPE ASSERTED THE WRONG THING

⛔ **CORRECTED BY THE OBJECT ROUND — MY RULE WAS WRONG EVEN THOUGH MY CONCLUSION HELD.** **DELIVERY IS CLASS-DRIVEN, NOT SEVERITY-DRIVEN:** `server/services/system-alerts.ts:131-134` `shouldDeliverToDiscord()` returns true for `warning`/`critical` **OR for ANY severity whose category is in `ALWAYS_DELIVER_CATEGORIES = {governance, breakage}`** (`:121-124`).
★ **My evidence was the STALE COMMENT at `scripts/system-alerts.ts:223-227`, which still says "info skips"** — severity-only delivery is the **pre-2026-07-10** behaviour, changed by `B-GOV-INTEGRITY-1` because **117 of 254 info alerts never reached Discord.** A test pins it: `info`+`governance` → true, `info`+`health_check` → false.
⇒ ✅ **The plan's `info` + `health_check` choice DOES skip Discord — but by CATEGORY as much as severity.** ⛔ **Stated because the rule matters more than this instance: a later category change would silently re-arm Discord delivery, and a reader working from my original sentence would never look.**
**And the per-turn hook `.claude/hooks/inject-due-alerts.mjs:77` selects on `state !== 'active' || acknowledged_at → skip` — there is NO severity filter** (severity is printed at `:89`, never tested).
⇒ ✅ **AN `info` ALERT SURFACES TO EVERY SESSION ON ITS NEXT PROMPT AND POSTS NOTHING TO DISCORD.** That is the property the scope claimed, and it is real — **but it is a property of `info`, not of "being an alert."**
⚠️ **CONSEQUENCE FOR THE PLAN: at `warning` the drift alert would post to `#general` AND invoke Langston on every re-surface.** That is the wake-storm shape `B-WAKE-QUIET` closed, rebuilt one layer down.

## A2x. `triggers_at: "now"` IS STORED VERBATIM AND COMPARED AS A STRING — IT CAN NEVER FIRE

`fireDue` (`system-alerts.ts:536`): `entry.state === 'scheduled' && entry.triggers_at <= nowISO` — **a string comparison.** `"now" <= "2026-09-05T…"` is **false** (`'n'` > `'2'`), so a row minted with `--triggers-at now` **stays `scheduled` forever**. My probe row did exactly this.
**§9.5(b-ii) LEDGER SEARCH: no prior entry** (searched `RUNNING_ISSUES`, `BATCH_CATALOG`, `CHANGES_AND_FIXES`, the completion reports; **control: those corpora do contain `triggers_at`**). **And no other caller does it** — every existing call passes an ISO literal or a shell-computed date.
⇒ **DISPOSITION §9.4 (3): its own item, NOT this batch.** The CLI accepts an unvalidated string for a field the dispatcher compares lexically. **This batch simply passes a real ISO timestamp.**

## A3x. SIM + SYSTEM MANUAL

**`SYSTEM_IMPACT_MAP.md` — read for every component:** "Discord Comms Fabric" (the `dt-push-notice.sh` row, the `cc-wake-filter.py` routing, the §10.5 closure guarantee and owner-routing), and "Claude Code Hook Layer" (`inject-due-alerts`, `fresh-rules`).
⛔⛔ **CORRECTION — THIS CLAIMED A GOVERNANCE GAP THAT DOES NOT EXIST, AND THE OBJECT ROUND CAUGHT IT.**
**PREVIOUSLY STATED: *"the SIM has NO entry for `daily_deploy_check.sh`… that silence is precisely why nobody knew the check had no scheduler."* NOW: ⛔ FALSE, ON BOTH HALVES.**
`SYSTEM_IMPACT_MAP.md:3583` **names the file explicitly** (`daily_deploy_check.sh:33-38`), states what it compares, and **records the very measurement I presented as a discovery** — *"0 crontab entries and 0 systemd timers name it, against 11 live cron jobs and 25 timers"* — **homing the arming to `P19-B12` with `#652`.** Re-derived at the object.
⇒ ★ **IT WAS KNOWN, RECORDED AND HOMED. My §1 narrative that *"nobody knew"* is wrong, and the alternative state that fits is the dull one: I searched for a component HEADING rather than the string.** ⚠️ **This is the same shape as `#994` — searching the ledger for the BATCH rather than the FINDING.**
✅ **WHAT SURVIVES:** `daily_deploy_close.sh` is genuinely absent from the SIM **and from the repo** (`git ls-files` returns only the check) ⇒ unversioned, host-only. **And the SIM entry for the NEW job (P10) is still owed** — on its own merits, not on a gap that turned out not to exist.
**`SYSTEM_MANUAL.md`:** **not applicable and stated rather than skipped** — no architecture, strategy, regime, filter, signal-pipeline or mathematical surface is touched. **Nothing in the scope contradicts it.**

## A4x. COMPONENT CENSUS (§9.5(a)) — WHO WRITES / READS / MUTATES / DELETES / SCHEDULES THE ALERT STORE

| question | answer, repo-wide, tests excluded |
|---|---|
| **writes/creates** | `addAlert` in `server/services/system-alerts.ts`, reached by the CLI `add`; the staging-liveness watchdog; the governance checker. ⇒ **this batch adds ONE MORE CALLER OF THE SAME WRITER — not a new writer.** *(Langston's correction to my r4 wording, confirmed here at the object.)* |
| **reads** | the CLI `list`; the per-turn hook; the dispatcher; Langston's §10.5 read; the alerts page in the client |
| **mutates** | `ack` / `resolve` / `markResurfaced` |
| ⭐ **deletes** | ⛔ **NOTHING DELETES. Exactly zero members — stated explicitly, because an asserted absence needs presence-evidence.** Rows are only ever state-transitioned. ⇒ **a re-minting job GROWS the store without bound; that is a property to state in the SIM entry, not a defect to fix here.** |
| **schedules** | the dispatcher cron (`fire-due`); the self-chained observation alerts. ⇒ **this batch adds one Helsinki cron. Two schedulers now write via the CLI; they touch DIFFERENT dedupe keys, so no mutual exclusion is required — stated rather than assumed.** |

**ENTRY-POINT ENUMERATION FIRST (§9.5(a-ii)):** the new job's entry points are **exactly one** — the Helsinki cron. **No timer, no clock subscription, no service `.start()`, no bootstrap, no event subscription.** Stated explicitly.

---

# PART B — THE IMPLEMENTATION PLAN
> **Every item back-references the audit finding it falls out of. Anything with no audit treatment is flagged `UNAUDITED`.**

**P1 — THE JOB RUNS ON HELSINKI, AS `langston`, ON AN HOURLY CRON.** ⇐ **A1** (the alias resolves only for that user) and **A9** (hourly is affordable against a shared 60/hr).
**VERIFY:** the job's own log shows runs at the expected cadence **across a window containing no pushes at all**.

**P2 — MEASURE WITH ONE COMPARE CALL + ONE `ssh` READ.** Operands: staging `dist/BUILD_SHA` and the branch head. Direction from the API's **`status`**, never a sign derived from a count. ⇐ **A6**.
**VERIFY:** run against a known-behind and a known-current pair and show both answers, including `status`.

**P3 — ✅ THE PREDICATE STAYS **AGE**, AS LANGSTON RULED. NO REVERSAL.** ⇐ **A7 (corrected) + A8**.
⛔⛔ **MANDATORY: the compare call CARRIES AN EXPLICIT PAGINATION PARAMETER (`?page=1&per_page=100`). Without it the API returns a trailing window and `commits[0]` is not the oldest.** ★ **This single parameter is the whole difference between his design working and failing silently — it belongs in the code with a comment naming why, or the next person removes it as redundant.**
- **Fire on the age of the oldest undeployed commit, read from `commits[0]` of the PAGINATED call**, and keep his upper-bound labelling.
- **`total_commits` rides in the body as context.** ⛔ **It does NOT double as the truncation detector once P3 mandates `per_page=100` — object round: `total_commits > len(commits)` would then be true for ANY gap over 100 commits, so it detects the PAGE SIZE, not truncation.** ✅ **The `files` cap (`len(files) == 300`) is the detector that still discriminates, and it is unaffected by pagination — measured 300 across all four query forms.**
- ✅ **NOTHING GOES BACK TO HIM AS A BLOCKER ON THIS.** ★ **An earlier draft of this document proposed reversing his Q2 ruling. That draft was wrong, and it was wrong because I stopped at the first sufficient explanation of the observation — exactly the failure §9.5(a) is written against.**

**P4 — TRUNCATION IS AN EXPLICIT OUTCOME, AND IT NOW BEARS ONLY ON THE FILE GATE.** ⇐ **A5 + A8b + A8c**. `len(files) == 300` (the cap) ⇒ **the runtime-path gate is UNDECIDABLE.** ✅✅ **RULED ⭐ LANGSTON: §5e STANDS — AND MY PREMISE WAS FALSE AT THE OBJECT.** *"`MEASUREMENT FAILED` is not silence: scope §5a `:107` already gives it a destination — it mints its own alert naming which operand could not be read. So on a 761-file range the alarm fires; it just fires honestly."* ★ **I argued against going quiet, on a design that was never quiet. I had read my own scope's §5a and did not connect it.**
⭐ **BUT HE ADDED THE CLAUSE I HAD CORRECTLY SENSED A HOLE UNDER, AND IT GOES IN P4:**
> ⛔ **THE RUNTIME-PATH GATE MAY NEVER GATE THE AGE ALARM'S *EMISSION* — ONLY ANNOTATE IT.** On `len(files) == 300` the age operand is measured and sound (A8b), so **the alert carries the stamped age at its rung with `runtime_path: UNDECIDABLE`**, and the `MEASUREMENT FAILED` row names the file gate as the failed operand.
⛔ **AND WHY HE WILL NOT RUNG ON IT: *"300 is a CAP, not a measurement. A saturated gauge cannot order anything"*** — same defect as the `min(1,n/100)` damper in `B-ARM-REMOVAL`. ★ ***"'A range that large is itself top-rung' is a magnitude adjective on a censored observation."*** **The age bucket is the measured ladder and it already carries the case I was worried about.**
✅ **The AGE operand is no longer affected by truncation, because of the pagination parameter in P3.**

> ⚠️ **FORMAT DEBT, NAMED RATHER THAN LEFT: P5, P8, P9 and P13 back-reference SCOPE RULINGS, not Part-A findings, and the format requires an audit finding or an explicit `UNAUDITED` flag.** ★ **P9 (`main` arm) is the sharpest: NO A-item measures the `main` comparison it depends on.** ⇒ **all four are hereby flagged `UNAUDITED-BY-THIS-STEP, carried on a prior ruling` — which is the honest label, since a ruling is not a measurement.**

**P5 — THREE OUTCOMES. ⭐ AND `MEASUREMENT FAILED` IS READ OFF THE *EXIT STATUS*, NEVER OFF AN HTTP CODE OR A NON-EMPTY FILE (LANGSTON, from a live incident he hit THIS TURN).**
> ⛔ **His own case, and it nearly changed a ruling:** his first fetch of the scope returned **a different batch's document**. `/tmp/scope.md` on Helsinki is **root-owned, mode 644, dated 2026-07-20**; his `curl -o` got `EACCES`, `-s` swallowed the warning, and his only success token was `-w HTTP:%{http_code}` — **which prints 200 on a transfer whose write FAILED.** Reproduced: `HTTP:200`, `curl_exit=23`, file unchanged. **He nearly ruled on a seven-week-old unrelated document.**
> ★ **An HTTP 200 means the fetch happened, not that the bytes landed** — *"which is `exit 0` means the command RAN, one layer down, and is this batch's own subject."*
> ⭐ **AND I HIT THE IDENTICAL TRAP IN THE SAME HOUR, INDEPENDENTLY:** my first compare probe wrote to `/tmp/cmp.json` on Helsinki, got `curl: (23) Failure writing output to destination`, and my reader parsed **a different file** — returning `ahead_by 5` for a 2,486-commit range. **I caught it on the visible `rc=23` and switched to `mktemp -d`; he caught his on the content being from another batch.** ⚠️ **Two sessions, same host, same shared path, same hour, same silent-write failure.**
> **DISPOSITION: (1) folded into P5 here — exit status is the success token, and the `dt-push-notice.sh` `curl -s … 2>/dev/null → []` path takes the same treatment; (2) the general Helsinki `/tmp` collision is added as an item to `B-SHARED-TMP-ISOLATION` (`#979`, plan row 2.6) — different host from the laptop case, same class.**
 ⇐ **BLOCKER-2.** `measured` · `zero` · `MEASUREMENT FAILED` (a 404/422, a failed `ssh`, an exhausted budget read from `X-RateLimit-Remaining`, or disagreeing operands). **`MEASUREMENT FAILED` mints its own alert.** ⛔ **`behind`/`diverged` is its own outcome, never a magnitude.**

**P6 — THE ALERT: `health_check`, and severity is a QUESTION, not a decision I am taking.** ⇐ **A2 + A1x**. `info` surfaces to every session and posts nothing; `warning` posts to `#general` and invokes Langston on every re-surface.
✅✅ **RULED ⭐ LANGSTON: `info` + `health_check` — AND HE TOOK IT HIMSELF RATHER THAN ROUTING IT TO KYLE.** His reason: *"the word 'severity' appears zero times in the scope at `6a33848dd`, so I'm not overruling a prior ruling of my own — and this moves neither risk nor authority, so routing it to Kyle would be the ceremonial second approval I've already logged myself for manufacturing."* **THREE CONDITIONS:**
- ⛔ **RECORD THE REASON AS *CLASS*, NOT SEVERITY.** The code comment must read *quiet because `health_check` ∉ `ALWAYS_DELIVER_CATEGORIES` (`system-alerts.ts:121-124`)*. ★ **My own point turned back on me: a later category change silently re-arms Discord, and nobody working from "info is quiet" would look.**
- ⛔⛔ **NAME THE REAL COST OF `info` IN THE SIM ENTRY — IT IS NOT "QUIET".** An active row **injects into EVERY session's EVERY prompt until someone deploys.** ★ **That is a standing nag on exactly the party who can clear it, which is the property he wants — but it is not a free channel and P10 must say so.**
- ⛔ **ESCALATION IS MEASURED, NEVER PREDICTED. Do not build a severity ladder now.** **PRE-REGISTERED: if a top-rung row survives N consecutive re-surfaces unactioned, that is evidence `info` did not reach an actor, and severity is revisited THEN.** ★ **`B-WAKE-QUIET`'s negative result is the precedent — three instruction-shaped fixes, all failed. He will not buy a louder channel on a prediction.**

**P7 — DEDUPE KEY CARRIES A BOUNDED MONOTONE BUCKET; FOUR RUNGS; ESCALATE ONLY; RETURN-TO-ZERO RESOLVES ALL.** ⇐ **A4** (the flag already exists) and Langston's CONFLICT-3 replacement. **Body carries one line: RESOLVE, do not ACK.** ✅ **BUCKETS ARE ON THE AGE, per P3 and per his CONFLICT-3 ruling verbatim (*"a bounded, monotone AGE BUCKET"*).** ⛔ **An earlier draft said "on the COUNT" — a surviving fragment of the reversal this document withdraws, caught by the object round. It would have changed the rung boundaries and the key string.**

**P8 — BODY CARRIES STAMPED MAGNITUDES** — each with its observation timestamp and the two shas. ⇐ CONFLICT-2 ruling. **Plus the log pointer for the current value.** **Never an unstamped number.**

**P9 — `main` ARM: measured, logged, never fires.** ⇐ Q3 ruling.

**P10 — THE SIM ENTRY** — host, trigger + cadence, operands, dedupe key, failure mode ⇐ Langston's ruling; **plus the unbounded-growth property from A4x's delete census.**
⛔ **⭐ LANGSTON CONDITION: it must NAME THE REAL COST OF `info`, which is not "quiet" — an active row injects into EVERY session's EVERY prompt until someone deploys.** ★ **A standing nag on exactly the party who can clear it.**
⚠️ **AND THE 'SIM IS SILENT' CLAIM IS STRUCK** — see the A3x correction; the entry is owed on its own merits.

**P10b — THREE LIMITS THE OBJECT ROUND NAMED THAT THE PLAN CARRIES RATHER THAN CLOSES.**
- ⚠️ **`commits[0]` is the ANCESTRALLY first commit, not necessarily the date-oldest.** A merge carrying older-dated commits would sit later in the array. **Checked: this range is linear today** (min committer date over all 2,486 = `e31d8f306` = `commits[0]`), consistent with §7.1's fast-forward-only flow. ⇒ **the plan reads `commits[0]` and never takes min(date); stated as an assumption on the branch's shape, not a proof.**
- ⚠️ **P2's second operand (`dist/BUILD_SHA`) has NO Part-A treatment** — A6 covers only `status`. **Verified to exist** (41 bytes on staging) **but the audit did not establish it; flagged `UNAUDITED`.**
- ⚠️ **P1 ⇐ A1 is weaker than it reads:** A1 shows the `staging` ALIAS resolves only for `langston`; it does not entail the job must RUN as `langston` — an explicit `deploy@188.245.193.8` works without the alias. **Not false, not entailed.**

**P11 — CORRECT `#1002`'s TEXT** ⇐ §1 of the scope. **`UNAUDITED`: nothing — it is a documentation correction with no runtime surface.**

**P12 — FILE THE `triggers_at: "now"` TRAP AS ITS OWN ITEM** ⇐ **A2x**. Not fixed here.

⚠️ **NUMBERING NOTE: the rules-alarm finding is `#1008`, NOT `#1007`.** It was filed as `#1007`, collided with CC-INFRA's Langston-cap entry, and **renumbered after Langston's acceptance message was written** — so his text, commit `6a33848dd` and the Step-2 dispatch all say `#1007` and mean **this** finding. **`#1007` now belongs to someone else.** Measured, not argued: theirs `c09109025` 11:18:56, mine `6a33848dd` 12:35:05, newer renumbers.

**P13 — OFFER THE WEEKLY-OBSERVATION LINE TO CC-B** ⇐ scope OBJ-5. Their instrument.

---

## REVIEWER RECORD

`REVIEWER r1: claim-only (mode B), on the truncation/ordering claim · "name the objects that would settle this, then what other states are consistent" · TEN alternative states named; the decisive one is that the trigger is the ABSENCE OF A PAGINATION PARAMETER, not truncation · re-derived: YES — I re-ran it myself, unauthenticated, and `?page=1` returns the true oldest commit`
★ **THE ROUND CHANGED THE PLAN'S CENTRAL DECISION: it took me from "reverse Langston's ruling" to "add one query parameter."** ⚠️ **My first draft would have sent him a blocking question built on a finding that had a trivial fix I had not looked for.**
⚠️ **TWO LIMITS IT NAMED THAT I HAVE NOT CLOSED, kept rather than dropped:** (a) it ran through an AUTHENTICATED session while the job will be unauthenticated — **I closed this by re-deriving unauthenticated (`x-ratelimit-limit: 60`), and the behaviour is identical**; (b) `?per_page=300` returned 300 commits, above the documented per-page maximum, **which neither of us reconciled against the published documentation.** Not load-bearing on any plan item, and recorded so nobody re-derives it from scratch.
`REVIEWER r2: OBJECT (this document at rest) · "does every plan item trace to a finding; what other states are consistent" · SIXTEEN findings, of which TWO were FALSE CLAIMS OF MINE (no-consumer, and the SIM gap), one a live defect in shipped code, one a leftover contradiction from the withdrawn draft, and four format-debt items · re-derived: yes — both false claims re-derived at the objects before they moved anything`
⛔ **A CLEAN IS NOT EVIDENCE.** Only the hits moved this document. ✅ **Loop closed on an OBJECT round, two rounds, cap not reached.**

⛔⛔ **AND I HAD TO WITHDRAW THAT NARROWING ONE ROUND LATER — IT WAS FALSE, AND THE OBJECT ROUND FOUND A LIVE CONSUMER ALREADY IN THE TRAP.**
**PREVIOUSLY STATED (my own r1 narrowing): *"there is no consumer yet; the harm was PROSPECTIVE."* NOW: ⛔ FALSE.** `comms-infra/discord/dt-push-notice.sh:123` is a **tracked repo file** running on a `*/2` cron that makes the **unparameterized** compare call and reads `d.get('files',[])` — re-derived by me at the ref. **Its installed copy on Helsinki is byte-identical (`sha256sum` match).**
⇒ ⛔ **THE 300-FILE CAP ALREADY BITES THE ESCALATED RULES-CHANGE ALARM: on a push whose range exceeds 300 changed files, a `CLAUDE.md` change can fall outside the returned list and the alarm stays silent.** ★ **A false negative in the alarm whose entire job is telling every session the rules moved — in code I shipped this week.**
⚠️ **AND IT CONTRADICTED THIS DOCUMENT'S OWN A9**, which cites that exact line as an existing caller of the same API. **I wrote both claims and did not notice they could not both be true.**
**DISPOSITION §9.4 (1) — FOLDED INTO THIS BATCH:** the same one-parameter fix (P3) applies, plus a bounded-range guard. ⚠️ **Narrow in practice** — `$PREV...$SHA` spans one push in steady state — **but it widens exactly when the notice has been down, which is when the rules-changed alarm matters most.**

## PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The write path works — I proved it by actually creating an alert from the Helsinki machine, reading it back and clearing it, rather than by inspecting anything. Along the way it refused me three times, each time correctly, and those refusals are now constraints in the plan.

**The important finding is a trap that would have made the alarm fade out exactly as the problem grew — and a one-word fix for it.** We plan to trigger on the age of the oldest change waiting to be deployed. But asked plainly, the service we read from hands back only the most *recent* slice of a large gap, so "the oldest change" quietly becomes "the oldest change in that slice" — two days old, when the truth was forty-seven.

**My first draft of this document reacted by throwing out the design and sending it back to Langston. That was an over-correction, and a second reader found the actual fix in one line: if you simply ask the service for the *first* page rather than letting it choose, it hands back the oldest first and the number is right.** So his design stands, with one extra instruction in the request. I have re-checked that myself rather than taking it on trust. It is worth noticing that the wrong version would have cost him a round and cost us the better design.

**And one claim of mine was wrong:** I told you an alert reaches people without interrupting them. That is only true at the quietest severity — at the louder ones it posts to the channel and pulls Langston in on every repeat. The plan recommends the quiet one and asks him to confirm.
