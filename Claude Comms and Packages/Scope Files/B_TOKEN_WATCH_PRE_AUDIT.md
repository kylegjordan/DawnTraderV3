# B-TOKEN-WATCH — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**One document. Langston signs off once, on both.** · **Owner:** CC-INFRA (Infra Claude) · **2026-08-28**
**change-class:** `non_architecture` (declared at Step 1; **re-examined below at F-4 and it survives, but only under the amendment F-4 requires**)

**Upstream, at the ref:** scope r3 + pre-registration + AMENDMENT 1 + AMENDMENT 2 + `RUNNING_ISSUES` `#920`, all pushed at **`8c5412f38`**. Langston APPROVED at Step 1 with three conditions; all three are discharged in that commit.

> ⛔ **WHY THIS DOCUMENT EXISTS AT ALL, STATED BLUNTLY:** I went from Step-1 approval straight to "build" and skipped Step 2 entirely. **Kyle caught it.** The step is not ceremony — the audit below overturned one thing in the approved scope (F-4) and forced a pre-data amendment to the observation grid (F-9). Under the ordering I was about to use, both would have surfaced *after* the build.

> ★ **ORDERING (the skill's binding rule): THE AUDIT IS FIRST AND THE PLAN FALLS OUT OF IT.** Every plan item back-references the finding it derives from. Anything with no audit treatment is flagged `UNAUDITED` in-document. **There are no `UNAUDITED` items.**

---

## PART 0 — NEW SCOPE ARRIVING AT STEP 2 (Kyle, 2026-08-28)

Kyle added a **tracking page on the staging site** — accepted as **OBJ-10**, explicitly sequenced **after the collector is built and proven**, but part of this study rather than a separate batch.

**What he asked for, in his words, reduced to four panels:**
1. Aggregate data for **tokens launched**.
2. Aggregate data for **tokens still alive**, with an **aging tracker**: how many have survived **5 / 15 / 30 / 45 / 60 / 75 / 90 days**.
3. The same aging for **tokens that died**, showing **where they died**.
4. Below those, a table of the **oldest 100 survivors still alive**.

**This addition is the single largest source of findings in this audit.** It is the only part of the batch that touches the trading application, and it collides with the fence Langston wrote at his own condition (F-4). It also asks for ages the pre-registered observation grid cannot answer (F-9).

---

# PART A — THE AUDIT

## THE SIX SOURCES — WHICH I READ, AND WHAT EACH RETURNED

| # | source | read? | what it returned |
|---|---|---|---|
| 1 | **The actual CODE at `origin/migration/aws-supabase`** | ✅ | `client/src/App.tsx`, `client/src/components/layout/sidebar.tsx`, `server/routes.ts`, `server/routes/audit.ts`, `server/routes/health.ts`. **Findings F-5, F-6, F-7.** |
| 2 | **RUNTIME state — the hosts themselves** | ✅ | Helsinki measured live (CPU, memory, disk, load, process table, listening ports, mount table, journal). **Findings F-1, F-2, F-3.** |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | ✅ | It DOES track client pages as components. **Finding F-8.** |
| 4 | **`SYSTEM_MANUAL.md`** | ✅ | Applicability judged explicitly, not skipped by default. **Finding F-11.** |
| 5 | **`RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + the runbooks** | ✅ | The wedged-mount class is already documented. **Findings F-2, F-3** — both become cross-references rather than fresh findings, per §9.5(b-ii). |
| 6 | **`bridge/canonical/`** | ✅ | Partial coverage of the front end, total silence on the study. **Finding F-10.** |

---

## F-1 — HOST CAPACITY: THE FENCE'S CO-TENANCY PREMISE IS DISCHARGED, AND THE FIRST NUMBER I READ WAS A TRAP

**Object:** Helsinki, `204.168.141.77` — the host §0 of the scope names for the collector. **Measured live, 2026-08-28.**

| | measured |
|---|---|
| CPU | **2 cores** |
| Memory | **3,814 MB total · 1,017 MB used · 2,797 MB available** |
| Disk | **75 GB total · 21 GB used · 51 GB free (29%)** |
| Publicly listening | **SSH only.** Everything else binds `127.0.0.1`. |
| Running DawnTrader services | `discord-cc-bridge.service`, `discord-langston-bridge.service` |

⛔ **THE TRAP, AND IT IS THE `wrong-object` PATTERN AGAIN IF TAKEN AT FACE VALUE.** Load average read **1.01 / 1.00 / 1.00** — on a 2-core box that reads as **50% permanently consumed**, which would have been a real argument against co-tenancy. **It was false.**

**The discriminating measurement:** CPU was **98.9% idle** across a 3-second sample while load sat at exactly 1.00, and load did not vary across three samples six seconds apart (1.00 / 1.00 / 1.00 — a *real* workload fluctuates). A process table sorted by CPU showed **no process above 1.0%**. The explanation was a **process in uninterruptible-sleep state**, which Linux counts in load but which consumes no CPU. That is F-2.

⇒ **DISCHARGED. Helsinki is an idle 2-core box, not a half-loaded one.**

**Demand, stated against that supply rather than asserted:**
- **Births:** ~20,700/day inbound = **0.24 requests/second.**
- **Follow-ups:** ~19,000/day outbound = **0.22 requests/second.**
- **Disk, upper bound over the full 90 days:** births 20,700/day × 90 = **1.86M records** at ~300 B ≈ **560 MB**; follow-ups bounded above at 4,640 followed tokens/day × 12 checkpoints × ~200 B ≈ **11 MB/day → ~1 GB**. **Total under 1.6 GB against 51 GB free.** ⚠️ **The follow-up figure is a deliberate over-estimate** — it assumes every followed token survives to every checkpoint, and the published day-one death rate is 68.67%, so the true figure is far lower. **An upper bound is the right shape here: if the ceiling fits, the actual fits.**

---

## F-2 — THE DRIVE MOUNT ON HELSINKI WAS WEDGED, HAD BEEN FOR 20 DAYS, AND NOTHING DETECTED IT

**Found while measuring F-1. Fixed during this audit** (rule 23, fix-on-find — this host is my lane).

**What was wrong:** the Google Drive mount on Helsinki was hung. Three file-searches were stuck on it in uninterruptible I/O, unable to be killed and unable to finish:

| process | age when found | what it was searching for |
|---|---|---|
| `find / -name langston-call*` | **20 days 16 hours** (started 2026-08-07 13:49) | `langston-call` — a session looking up how Langston is invoked |
| `bash -c … \|\| find / -name 'dt-push-notice.sh'` | **9 days 15 hours** | the push-notice script |
| `find / -name dt-push-notice.sh` | **9 days 15 hours** | (the child of the above) |

All three were blocked in the **same single directory** inside a personal archive folder on the Drive, nothing to do with DawnTrader. Each contributed exactly 1.00 to load average forever.

⛔ **§9.5(b-ii) — SEARCHED THE LEDGER BEFORE FILING, AND IT IS ALREADY THERE.** `COMMS_BRIDGE_RUNBOOK.md` documents this exact class verbatim: *"processes stuck in D-state I/O wait… the rclone Google-Drive FUSE mount has WEDGED… anything Langston reads from the gdrive-mounted repo blocks"*, and it carries the remedy (sweep the stale processes, restart the mount, force-unmount if the stop hangs). ⇒ **This is a CROSS-REFERENCE, not a new defect.** Filing it as a discovery would have been the exact failure §9.5(b-ii) exists to prevent.

**The remedy applied, and verified by measurement rather than by assertion:**

| | before | after |
|---|---|---|
| mount probe | **timed out (exit 124)** | **responsive, exit 0** |
| stuck processes | **3** | **0** |
| load average | 1.11 / 1.04 / 1.01 | **0.56 and decaying** |
| directory listing | *(could not complete)* | **23 entries, service `active`** |

★ **AND A POSITIVE CONTROL CAUGHT A FALSE PASS IN MY OWN VERIFICATION.** My first post-fix listing returned **empty** — which, taken as read, says the mount came back holding nothing. It was a cold cache racing a freshly-restarted mount. **An empty result is exactly the absent-as-valid trap**, so I re-probed explicitly with an exit code and a count: 23 entries, exit 0.

★ **WHAT IS GENUINELY NEW, AND IT IS NOT THE HANG: NOTHING DETECTED IT FOR 20 DAYS.** The runbook tells you how to fix it once you suspect it. **No monitor, alert or heartbeat looks for it**, and its only symptom on a casual glance is a load average that reads as normal-ish. It was found by accident because this batch happened to need the number. **That is a detection gap, and it needs a home rather than a mention.**

---

## F-3 — A DECOMMISSIONED SERVICE IS STILL RUNNING ON THE PROPOSED HOST

`openclaw-gateway.service` is **`loaded active running`** on Helsinki, holding **242 MB** — about **6% of the box's memory** — with two loopback ports open.

⛔ **§9.5(b-ii): ALREADY RECORDED. `CLAUDE.md` §8.1 states it verbatim** — *"openclaw-gateway user-systemd service may still be running but idle. Optional cleanup"* — and gives the stop/disable commands. **Cross-reference, not a finding.** I am recording it here only because it sits on the host this batch is about to add a service to, and because "optional" was written when nothing else wanted that memory.

**It does not block anything:** 2.8 GB is available and the collector's footprint is a single append-only process.

---

## F-4 — ⛔ THE TRACKING PAGE BREACHES LANGSTON'S FENCE, AND THE BREACH MUST BE ARGUED, NOT SLID THROUGH

**This is the most important finding in the audit.**

§0 of the approved scope is Langston's condition, written in his words at his instruction, and its test is deliberately mechanical:

> *"no entry in the canonical regime-strategy map · no strategy · no orchestrator contact · no appearance on the mode axis · no wallet, custody, execution or order path.* **If any live-path file appears in this batch's diff, the change class is wrong and it has drifted."**

**OBJ-10 requires live-path files in the diff.** A page on the staging site cannot exist without touching the trading application. **By the fence's own stated test, the batch has drifted.**

★ **AND THE TEST IS DOING EXACTLY WHAT IT WAS BUILT TO DO.** He wrote it because *"point DawnTrader at a new market"* hides inside *"build a recorder"*. It fired on the first change that touched the app. **A fence that never fires was never a fence** — so the correct response is not to argue it away, and certainly not to route around it by calling a page "just a display".

⚠️ **WHAT THE FENCE IS ACTUALLY PROTECTING, WHICH IS NARROWER THAN ITS TEST.** His reasoning was arithmetic: bounded-loss/frequent-modest-win and near-total-loss-on-nearly-all need **opposite sizing, opposite position counts and opposite kill-switch semantics** — so the risk is a token *reaching the trading pipeline*, and the co-tenancy clause protects the trading box's *compute*. **A read-only page reaches neither.** But that is an argument for an **amendment**, and it is Langston's fence to amend.

⇒ **PROPOSED AMENDMENT, deliberately narrow — the fence keeps its teeth by naming exactly what may cross and testing it:**

| the fence stays | the amendment permits |
|---|---|
| no strategy, no regime-strategy map entry, no orchestrator contact, no mode-axis appearance | — |
| no wallet, custody, execution or order path | — |
| **no study data in the trading database** | — |
| **no query load on the trading box from the study** | — |
| **the collector is never hosted on the trading box** | — |
| — | ✅ **exactly three live-path files may appear in the diff**, all display-only: the route table, the nav list, and one new page |
| — | ✅ **one read-only endpoint** that reads one pre-computed file and returns it |

★ **THE NEW TEST, and it is mechanical in the same way the old one was:** **every one of this batch's live-path changes must be display-only, and the study's data must never enter the trading database or be computed on the trading box.** If a change to the trading application does anything other than render a file the collector already wrote, the class is wrong.

⛔ **THIS IS A LANGSTON DECISION, NOT MINE.** The fence was his condition. **I am proposing; he rules.**

---

## F-5 — FRONT-END ROUTE CENSUS: **EXACTLY ONE** DECLARATION SITE (§9.5(a))

**Repo-wide census at the ref, every `.tsx` file under the client, tests excluded.** Files declaring a route: **exactly one — `client/src/App.tsx`, carrying 21 route declarations.** ⛔ **Stated explicitly because an asserted absence needs presence-evidence (rule 22): there is no second router, no route config file, no lazily-registered route table.**

**Nav census: exactly one source — `client/src/components/layout/sidebar.tsx`, 13 navigation targets.** `top-bar.tsx` declares **zero**.

★ **AND THE TWO NUMBERS DISAGREEING IS ITSELF THE FINDING: 21 routes, 13 nav entries.** **Eight pages are reachable by address but not linked anywhere.** ⇒ **a nav entry is a CHOICE, not a requirement.** That matters for F-4: the smallest possible footprint is a page with no nav entry at all. **I recommend against taking it** — Kyle asked for something he will actually look at, and a page he has to remember the address of is a page he will not use. **But the option exists and Langston should know the cheaper one was declined deliberately.**

---

## F-6 — SERVER ROUTER CENSUS: **EXACTLY ONE** MOUNTING POINT (§9.5(a))

`server/routes.ts` builds a single API router, and every sub-router is mounted in **one contiguous block** (`:22263`–`:22331`) — status, health, VTS, audit, signal-audit, TLVA, VTS-audit, predictive-adjustments, back-audit, calibration, regime-archive. **Exactly one mounting point; no second registration path, no dynamic route discovery.**

⇒ **The entire server-side footprint of OBJ-10 is one added line in that block plus one new self-contained file.**

---

## F-7 — ★ THE PRECEDENT ALREADY EXISTS: A READ-ONLY ROUTE THAT SERVES A FILE FROM DISK

**This is the finding that makes OBJ-10 cheap, and it means no new architecture is needed.**

`server/routes/audit.ts` is a self-contained router that **reads JSON files from a `reports` directory under the application's working directory and serves them** — `fs.readFileSync(filePath, "utf-8")` at **`:99`** and **`:132`**, with the directory resolved at `:49`, `:93` and `:115`. It touches no database, no engine and no trading state.

**That is precisely the shape OBJ-10 needs:** the collector writes a file, a route reads it, a page renders it. Six of the server's route files already read the filesystem (`routes.ts`, `audit.ts`, `health.ts`, `signal-audit.ts`, `tlva.ts`, `vts.ts`). **Use what already exists** rather than proposing new plumbing.

⚠️ **ONE DIFFERENCE I MUST NOT COPY BLINDLY, and it is a real one.** The `audit.ts` routes as written carry **no authentication**. The system-alerts routes **do** (`authenticateToken`, `server/routes.ts:6703` and `:6757`). ⇒ **the tracker route follows the system-alerts pattern, not the audit pattern.** A precedent is evidence that a shape works, **not permission to copy its weakest property.**

---

## F-8 — THE SYSTEM IMPACT MAP TRACKS CLIENT PAGES, SO OBJ-7 IS WIDER THAN THE COLLECTOR

Step 1 recorded **zero mentions** of anything token-launch related in the System Impact Map — still true, and still the presence-evidence rule 22 requires for a claimed absence.

**But the map does track client pages as components** — it names specific pages and the panels inside them, with their feeding endpoints. ⇒ **OBJ-7's new node must cover the whole chain: collector → summary file → endpoint → page.** A node describing only the collector would leave the visible half of the batch undocumented, which is the buried-detail failure §9 exists to prevent.

---

## F-9 — ⛔ THE DISPLAY ASKS FOR AGES THE PRE-REGISTERED GRID CANNOT ANSWER

**Found by reading Kyle's request against the pre-registration rather than against my memory of it.**

| | ages |
|---|---|
| **Pre-registered observation grid** | 1h · 6h · 24h · **3d** · **7d** · **30d** · **90d** |
| **Kyle's aging tracker** | **5d** · **15d** · 30d · **45d** · **60d** · **75d** · 90d |

**Five of his seven columns are ages we never look.** With checkpoints at 3 and 7 days, *"how many survived 5 days"* is **not derivable** — we would know a token was alive at 3 days and dead at 7, and nothing in between. **Three of the seven columns would be permanently blank, and two more would be guesses.** ⚠️ **A page with columns it cannot fill is worse than a page without them** — it reads as a data problem rather than a design choice.

**Why this is fixable at almost no cost, measured rather than assumed:** the follow-up leg runs on the free service at **300 requests/minute (432,000/day)** against a need of about **19,000/day** — under 5% of capacity. **Additional checkpoints cost nothing on the leg that carries them.** The budgeted leg is the on-chain liquidity read, which follows the same schedule but is capped by the shed order already in the scope.

⇒ **PROPOSED AMENDMENT 3 to the pre-registration — a SUPERSET, not a replacement:**

> **1h · 6h · 24h · 3d · 5d · 7d · 15d · 30d · 45d · 60d · 75d · 90d**

★ **A superset is what makes this legitimate rather than convenient.** Langston's stated reason for a fixed grid was *"fixed ages, not an adaptive taper, so cohorts pool across launch days"*. **Every original age survives unchanged**, so every pre-registered analysis is computed on exactly the data it was registered against. **Adding fixed ages refines the resolution; it does not move the goalposts.**

⛔ **AND THE WINDOW FOR THIS CLOSES ONCE.** The pre-registration may only be amended before data exists — that is its entire value, and AMENDMENT 2 was written on the same reasoning. **This is still pre-data: no collector, no rows.** ⇒ **it lands before the collector runs, or it does not land at all.**

---

## F-10 — THE PROVENANCE READ (§9.5(b)), INCLUDING WHAT IT DID NOT FIND

- **`bridge/canonical/DawnTrader_Core_System_Files_Reference.md`** describes `client/src/App.tsx` as *"Main app component with routing"* and enumerates the pages beneath it. ⇒ **the single-router design in F-5 is ORIGINAL INTENT, not accumulated drift.** One added route is consistent with how the application was designed to grow.
- **`DawnTrader_Current_State_Reference.md`** carries a *"UI & Monitoring"* part with dashboard tabs, confirming display surfaces were always a first-class part of the design.
- ⚠️ **RECORDED ABSENCE, which the recording rule requires me to state:** `DawnTrader_System_Architecture_Execution_Flow.md` — the document that traces the system end to end — **contains no front-end coverage at all.** The execution-flow corpus stops at the server. **That silence is itself a governance gap**, and it means no canonical intent exists for how display surfaces should be fed.
- ⚠️ **AND THE STUDY HAS NO CANONICAL COVERAGE WHATSOEVER** (recorded at Step 1, re-confirmed): nothing on tokens, launches, or survival analysis. **This batch is new ground, and a canonical corpus that is silent cannot be cited either for or against it.**

---

## F-11 — SYSTEM MANUAL: NOT APPLICABLE, JUDGED EXPLICITLY

The System Manual owns architecture, strategy logic, regime detection, filter design, the signal pipeline and quantitative math. **This batch changes none of them** — it records an external population and renders a summary of it. **No strategy, no regime, no filter, no signal, no math that feeds a trading decision.**

⛔ **Stated as an explicit judgement rather than an omission, per §9's own rule that Tier-2 applicability is judged and never skipped by default.** If Langston reads the survival machinery as architecture, I will take the correction — but **not updating it must be a decision on the record, not a gap.**

---

## F-12 — DELETION-TIME STATE-WRITE CENSUS (§9.5(a-ii)): **NOTHING IS DELETED**

**This batch removes no code, no route, no service and no file.** Every change is additive. ⇒ **the removed-writer-with-a-surviving-reader failure has no surface here.** ⛔ **Recorded rather than skipped, because "nothing was deleted" is an absence claim and the step requires it to be stated rather than assumed.**

---

## F-13 — ★ FOUR SCHEDULERS OVER ONE STORE: THE MUTUAL-EXCLUSION CHECK, DONE AT DESIGN TIME

⛔ **§9.5(a) requires that two or more schedulers over one component get a mutual-exclusion check.** Nothing exists yet, so this is a census of the **design** rather than a discovery in code — **and that is the point: the answer is fixed now, in writing, instead of being discovered in seven months.** That is exactly how the dual-mechanism defect the rule was written for survived two audits.

| census question, against the study store | answer, fixed here |
|---|---|
| who **writes/creates**? | **Exactly one** — the webhook receiver, appending birth records. |
| who **reads**? | Three: the follow-up scheduler, the daily coverage audit, the summary publisher. |
| who **mutates**? | **Exactly one** — the follow-up scheduler, appending observations. **Birth records are never modified.** |
| ★ who **DELETES**? | **Exactly one** — the tiering job, and **only** payload data past its hot window. ⛔ **Birth records are never deleted by anything, ever** — the scope makes that loss irreversible because a sampled birth record destroys the base rate. |
| who **schedules**? | **Four:** follow-up scheduler, coverage audit, summary publisher, tiering job. |

⇒ **FOUR SCHEDULERS ON A 2-CORE BOX, ALL TOUCHING ONE STORE.** They must not overlap. **Mutual exclusion is a build requirement, not a hope:** a single-writer discipline where the receiver is the only writer, and the three periodic jobs hold an exclusive lock so no two run at once. **Named here so the requirement exists before the code does.**

---

## F-14 — THE PAGE WILL BE MOSTLY EMPTY FOR MONTHS, AND KYLE SHOULD BE TOLD THAT BEFORE HE SEES IT

**Not a defect — arithmetic.** The aging tracker counts tokens that have *reached* each age. On the day the page goes live nothing is more than a day old. **The 90-day column stays empty until day 90; the 30-day column until day 30.** The oldest-100-survivors table is short at first and grows.

⚠️ **RECORDED BECAUSE AN EMPTY PANEL IS INDISTINGUISHABLE FROM A BROKEN ONE**, and the person most likely to read it as broken is the person who asked for it. ⇒ **the page must state the age of the oldest cohort on its face**, so *"empty because nothing is that old yet"* is visible rather than inferred.

---

# PART B — THE IMPLEMENTATION PLAN

> ⛔ **Every item back-references the audit finding it falls out of. There are no `UNAUDITED` items.**
> **Sequencing is Kyle's: OBJ-10 is built only after the collector is standing and proven.**

## PHASE 1 — GATES THAT MUST CLEAR BEFORE ANY CODE (both are one-way doors)

| # | item | from | why it is first |
|---|---|---|---|
| **P1.1** | **Fence amendment put to Langston and ruled on.** | **F-4** | It is his fence and his condition. Building against an un-amended fence means building something the reviewer has already said no to. |
| **P1.2** | **AMENDMENT 3 to the pre-registration — the superset grid.** | **F-9** | ⛔ **Pre-data only. The window closes the moment the collector runs and does not reopen.** |

## PHASE 2 — THE COLLECTOR (the batch as originally approved)

| # | item | from |
|---|---|---|
| **P2.1** | Birth-capture receiver on Helsinki — single process, append-only, **the only writer** to the store. | **F-1** (capacity measured), **F-13** (single-writer discipline) |
| **P2.2** | Both timestamps persisted on every birth record — on-chain creation and first sight — and the discovery-lag distribution reported. | scope OBJ-2 · **F-13** |
| **P2.3** | Follow-up scheduler on the **superset** grid, holding an exclusive lock against the other periodic jobs. | **F-9**, **F-13** |
| **P2.4** | Split store — working index hot for the full 90 days, bulky payload tiered — with the cold hand-off built on day one. | scope §4 · **F-1** (disk headroom measured) |
| **P2.5** | Windowed chain re-census for coverage, reach stated honestly: catches delivery loss, **not** provider-side indexing gaps. | scope OBJ-3 · pre-reg AMENDMENT 2 |
| **P2.6** | Credit reserve, shed order and burn monitor — births never shed; projection from both the trailing rate and the peak hour. | scope OBJ-9 |
| **P2.7** | Alert routing on the non-trading stream. | scope OBJ-8 · **F-4** (nothing on the trading box) |

## PHASE 3 — PROVE IT (the gate between the collector and the page)

| # | item | from |
|---|---|---|
| **P3.1** | 72-hour run: measured credits/day against the reserve; coverage audit reporting; discovery-lag distribution published. | scope §8 |
| **P3.2** | ⛔ **HARD CLOSE CONDITION — the shed order observed firing under deliberate injection.** *"It ran and never had to fire"* is absence of opportunity, not evidence of capability. | scope §8.9 |
| **P3.3** | **Kyle's "proven" gate.** OBJ-10 does not start until P3.1 and P3.2 are green. | Kyle, 2026-08-28 |

## PHASE 4 — OBJ-10, THE TRACKING PAGE (only after Phase 3)

| # | item | from | footprint |
|---|---|---|---|
| **P4.1** | **Summary publisher on Helsinki** — computes the four panels once daily and writes **one small file**. All aggregation happens on Helsinki. | **F-4** (no computation on the trading box), **F-13** (fourth scheduler, holds the lock) | Helsinki only — **zero live-path files** |
| **P4.2** | **Delivery: Helsinki pushes the file to the staging box over the existing SSH path**, on a timer. ⛔ **Rejected alternatives, recorded: (a) exposing a public port on Helsinki** — it currently exposes SSH and nothing else (**F-1**), and a new public listener is a security-surface change this batch has no business making; **(b) putting study data in the trading database** — the deepest possible fence breach (**F-4**). | **F-1**, **F-4** | no new listening port anywhere |
| **P4.3** | **One read-only endpoint** that reads that one file and returns it — self-contained, **authenticated like the system-alerts routes, not unauthenticated like the audit routes**, mounted with one added line in the single mounting block. | **F-6**, **F-7** | **2 live-path files** |
| **P4.4** | **One new page** rendering the four panels, plus **the age of the oldest cohort shown on its face** so an empty column reads as young rather than broken. | Kyle's Part-0 request, **F-14** | **1 live-path file** |
| **P4.5** | **One route declaration and one nav entry.** The URL-only option (**F-5**) is available and **deliberately declined** — a page Kyle has to remember the address of is a page he will not use. | **F-5** | *(the route file, already counted)* |

★ **TOTAL LIVE-PATH FOOTPRINT: three files** — the route table, the nav list, and the page — **plus one new self-contained endpoint file.** **Every one display-only. That is the amendment's test in F-4, and it is checkable in the diff.**

## PHASE 5 — GOVERNANCE

| # | item | from |
|---|---|---|
| **P5.1** | System Impact Map node covering the **whole chain** — collector → summary file → endpoint → page — not the collector alone. | **F-8** |
| **P5.2** | System Manual **not** updated — recorded as an explicit judgement with its reasoning, not left as a gap. | **F-11** |
| **P5.3** | Tier-1 documents; completion report naming every governance file changed. | `CLAUDE.md` §3, `workflow-10-governance` |

---

# PART C — FINDINGS NEEDING A DISPOSITION (§9.4)

⛔ **The rule fires on the FIND, not on the judgement that it is worth fixing. Five findings, five dispositions, no blanks.**

| # | finding | **DISPOSITION** |
|---|---|---|
| **F-2a** | The Drive mount on Helsinki was wedged for 20+ days with three stuck searches. | **FOLDED INTO THE WORK IN HAND — already fixed and verified during this audit** (rule 23, fix-on-find; this host is my lane). |
| **F-2b** | ★ **Nothing detects a wedged mount.** The remedy is documented; the detection is not. It was found by accident. | **OWN BATCH — `B-HELSINKI-MOUNT-WATCH`, owner CC-INFRA, placed in `PHASE_19_PLAN.md` immediately after `B-TOKEN-WATCH`**, because this batch puts a second long-running service on that host and doubles what a silent wedge would take down. Ledger entry to follow with the placement cited. |
| **F-3** | `openclaw-gateway` still running, 242 MB, decommissioned. | **NO WORK — CROSS-REFERENCE.** Already recorded in `CLAUDE.md` §8.1 as known, with the stop commands, and explicitly marked optional. Not re-filed. Re-opens only if memory becomes scarce, which **F-1** measures it is not (2.8 GB available). |
| **F-4** | The tracking page breaches the fence's stated test. | **FOLDED INTO THIS BATCH as a gate — `P1.1`, ruled by Langston before any code.** |
| **F-9** | The display asks for ages the observation grid cannot answer. | **FOLDED INTO THIS BATCH as a gate — `P1.2`, AMENDMENT 3, pre-data, before the collector runs.** |
| **F-10** | The canonical execution-flow corpus has **no front-end coverage at all**. | **NO WORK — RECORDED.** The canonical corpus is a frozen historical record and is never edited (§9.5(b)). The gap is stated so no future reader mistakes its silence for evidence. |

---

# PART D — WHAT THIS AUDIT DID **NOT** ESTABLISH

⛔ **Stated because an audit that lists only what it found reads as complete when it is not.**

- **The staging box was not measured.** F-1 measures Helsinki because that is where the collector lives. **P4.2 through P4.5 touch the trading box**, and their load — one daily file arriving, one file read per page view — is *reasoned* to be negligible, **not measured**. It is measurable before Phase 4 and should be.
- **The page has no design beyond its four panels.** Layout, and how the death panel expresses *where* tokens died, are Phase-4 work.
- **No claim is made that the free follow-up service will still exist in 90 days.** It needs no account, so there is no agreement behind it. The scope already names the fallback; **this audit does not strengthen that.**
- **`REVIEWER:` — no fresh-context reviewer was spawned for this step.** The load-bearing claims here (F-1's capacity, F-5/F-6's "exactly one", F-7's precedent) were each re-derived directly from the object at the ref rather than from memory, and F-2's verification was re-run after a positive control caught a false pass. ⚠️ **Recorded as a denominator entry: without one, the bar can never rise above anecdote.**

---

# PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The server we want to record on is genuinely idle and has plenty of room — but the first number I read said the opposite, and it took a second measurement to show that the "half loaded" reading was three file-searches jammed on a hung Google Drive connection, one of them stuck since the 7th of August. That is fixed and verified. The bigger catch is Kyle's new tracking page: Langston's rule for this batch says nothing may touch the trading application, and a page on the staging site cannot avoid it. **The rule fired exactly as designed, so it gets amended openly by him rather than argued around by me** — and the amendment is narrow, with the footprint held to three files that only display things. Separately, the aging columns Kyle asked for ask about days we were not planning to look, so five of his seven columns would have sat permanently blank. **That is fixable for nothing, but only before the recording starts.**

**The plan.** Two gates first, both one-way doors: Langston rules on the fence, and the observation schedule gets widened while it still can be. Then the collector, then a 72-hour proving run including a deliberate test that the safety valve actually fires. **Only then the page.**


---

# PART E — KYLE'S RULINGS, 2026-08-28, ARRIVING **DURING** LANGSTON'S REVIEW

> ⚠️ **APPENDED, NOT EDITED INTO THE BODY ABOVE.** Langston was mid-review of this document when these landed. **Silently rewriting a document under review is how a reviewer ends up ruling on text that no longer exists** — so the body stands as he received it and the changes are recorded here, with the two affected findings named.

## E-1 — ⛔ **AMENDMENT 3 IS WITHDRAWN. THE GRID DOES NOT CHANGE.**

**F-9 proposed a superset observation grid** so Kyle's 5/15/45/60/75-day columns could be filled. **Kyle withdrew the requirement rather than accept the amendment:**

> *"Regarding the aging, three and seven days are fine. We don't need to do five days. I just threw that out there not knowing what the daily checks were, so that's fine. We can limit this to the days that you'd already set to track."*

⇒ **The pre-registered grid stands EXACTLY as written: 1h · 6h · 24h · 3d · 7d · 30d · 90d.** The aging tracker's columns become **3d · 7d · 30d · 90d** — the ages we actually observe.

★ **AND THIS IS THE BETTER OUTCOME, not merely the cheaper one.** The proposed amendment was defensible, but it was **a design change made to serve a display**. Kyle's version removes the change entirely: **no pre-data amendment is needed, the pre-registration is never touched, and the one gate that had a closing window no longer exists.** ⇒ **`P1.2` IS STRUCK FROM THE PLAN.** *(The general form is worth keeping: when a display asks for something the measurement does not produce, changing the display is the first option to price, not the last.)*

## E-2 — THE FENCE: KYLE RULES THE PAGE PROCEEDS, AND ADDS A CONSTRAINT STRONGER THAN MINE

**On the substance he overrides the defensive reading, explicitly and with the reasoning stated:**

> *"if it's just running in the background, then I can't see what's happening and won't know anything until the ninety days are up. Plus, it gives me a way of eyeballing it quickly to make sure that things are still moving and being recorded."*
> *"we're not going to just flip, say, hey, let's start trading these. We need the data, and then we need to analyze that data. So I'm not as worried about it as Langston is, and I get why he's being defensive, but let's not be so defensive."*

★ **HIS ARGUMENT IS ONE THE AUDIT DID NOT MAKE, AND IT IS AN OPERATIONAL ONE:** a collector with no visible surface is **unfalsifiable for 90 days.** If it silently stops on day 3, nothing tells anyone until the read-out. **The page is not a convenience — it is the liveness check on the study**, and F-14 (the page will look empty early) is what makes that check legible rather than confusing.

⇒ **PART D's "the staging box was never measured" is now load-bearing rather than a caveat, because the page is going ahead. It gets measured before Phase 4.**

**AND HE ADDS A CONSTRAINT I HAD NOT PROPOSED, which is tighter than my own amendment:**

> *"this can be a page that sits at the bottom of our menu, and we could even fence it off from the rest of the staging site, meaning it sits on the same server, but... it sits in a different folder than the rest of the staging site files. That would be my preference."*

⇒ **PHYSICAL SEPARATION, NOT JUST LOGICAL.** The study's page, its endpoint and its data file live in **their own directory**, not interleaved with the trading application's files. **This is a better answer to Langston's fence than the one I proposed**, and it converts his test from a judgement into a location:

| my proposal (F-4) | Kyle's, which supersedes it |
|---|---|
| three display-only files, mixed in among the app's own | **the study's files live in their own folder**, so the fence is a **path**, not an opinion |
| test = *"is this change display-only?"* — a judgement | test = ***"is this file inside the study's folder?"*** — **a fact anyone can check in a diff, in a listing, or in a file browser** |

⚠️ **THE HONEST RESIDUAL, which the folder does not remove and I will not pretend it does: the route declaration and the menu entry MUST live in the application's own files** (F-5/F-6 measured exactly one of each, and neither can be extended from outside). ⇒ **the irreducible footprint is two lines in two existing files — one route, one menu entry — plus a self-contained folder.** **Two lines, not three files.** That is smaller than what F-4 proposed and it is the number Langston should rule against.

## E-3 — THE DRIVE MOUNT: KYLE CONFIRMS NOTHING SHOULD BE USING IT

> *"What files are you looking at on Google Drive? There's nothing that we're doing on Google Drive anymore. It should all be in your repo."*

**Answer, precisely: nothing was reading Drive deliberately, and no DawnTrader file was involved.** The three stuck processes were **`find /` whole-disk searches** — sessions looking up `langston-call` and `dt-push-notice.sh`, both of which live in ordinary server directories. **A whole-disk search walks into every mounted path**, and these wandered into the Drive mount and blocked in a personal archive folder (an old website's media directory) that has nothing to do with this project. **The mount was not being used; it was being tripped over.**

⇒ **This converts `#921` from a detection question into a removal one.** The audit already found **no cron entry, no script and no service references `/mnt/gdrive`**, the Drive repo path was retired from §7.1, and `CLAUDE.md` §8 already instructs Langston to **never** read from it. **Kyle's statement closes the last gap in that census: it is not merely unreferenced, it is not wanted.**

⇒ **`B-HELSINKI-MOUNT-WATCH` IS RE-AIMED — from *"watch the mount"* to *"remove it, and watch what remains."*** ★ **A watcher for something that should not exist is a monitor for a self-inflicted problem** — the strictly better fix is that the searches have nothing to fall into. **`#921` updated accordingly.** ⚠️ **What still needs a detector after removal is narrower and real: a process stuck in uninterruptible I/O on that host at all**, which is the symptom that hid for 20 days and is not specific to this mount.
