# B-PM-CLAUDE P4 — PM CODEX BUILD SCOPE r1 (2026-11-09, KD-62–64)

change-class: sub_batch

**Parent:** `B-PM-CLAUDE`, existing OBJ-4. **Owner for this increment:** OLD Codex (`codex-a`) until PM Codex is active, then PM Codex owns its own operating procedures under the session identity `codex-pm`. `codex-pm` is not a permission-bearing actor. **Board:** parent card `PVTI_lAHODmulEM4BfQP4zhGEKyM`. **Directive:** KD-62, KD-63 and KD-64; build brief `1-system-manual/pm/reviews/2026-11-09_PM_CODEX_BUILD_BRIEF.md`.

## 1. Why this is an increment, not a second PM batch

The approved parent scope already names PM Codex in OBJ-4 and planned P4 as the Codex mirror. That increment never landed. KD-62 pulls it forward as the first job of the Codex shift, and KD-63 adds two requirements that did not exist at the parent Step 1: PM Codex owns the return trip to Claude and owns a Codex-specific usage stop. This file narrows the work to that increment and amends, rather than duplicates, the approved parent scope.

The change class is `sub_batch`: this is a bounded delivery increment under an already approved `non_architecture` parent. It changes crew identity, coordination, comms attribution and operator procedures. It changes no trading behaviour, strategy, regime, filter, signal pipeline, maths, database object or market-data component.

## 2. Objectives and verification

### OBJ-1 — PM Codex identity, read order and activation

Add `C:\DawnTraderV3-pm` → **PM Codex**, session identity `codex-pm`, standing in for PM Claude (CC-PM) to the root Codex instruction surface. `codex-pm` identifies the session in instructions, handovers and PM-owned records; it grants no alert, deployment or governance-confirmation permission. Give PM Codex a dedicated short section with this read order: the PM role rules; `MEMORY_PM.md` CURRENT POSITION first; the decision ledger, decision protocol and open-batch register; then the sprint and pre-live plans. Name both historical sources: the local CC-PM transcript archive plus its index, and `git log -p -- .claude/memory/MEMORY_PM.md`. Point the same section at the reverse-switch and Codex-usage-stop skills. Change the existing PM Codex roster record from planned to active only after those instructions are present.

*Verify:* from the PM folder, a fresh Codex session identifies itself as PM Codex, names `codex-pm` as its session identity, reads the CURRENT POSITION first, resolves every required pointer, and can find one older PM fact through each history route. The same test positively proves `codex-pm` is refused by the alert allowlist, both deployment-actor surfaces and governance-exception confirmation. The roster record says active. The exact first message Kyle pastes is recorded in the Step-0 handover and names the 2026-11-09 crew handover sheet.

### OBJ-2 — Discord attribution without sender impersonation

PM Codex posts as **PM Codex**. The body cannot select its sender. Extend the actual Codex send/outbox boundary so its fixed sender is derived from an allowlisted working folder: `C:\DawnTraderV3-pm` maps to `PM Codex`; the existing Codex folder retains its existing identity; an unmapped folder is refused, not silently posted as either one. Do not add a `--sender` input. **Step-1 discrepancy for Coltrane to settle:** the brief names `comms-infra/codex/codex-send`, but that reviewed wrapper is the Helsinki headless Codex path and fixes its sender to `Codex`; the laptop file-drop watcher is `comms-infra/codex-discord-outbox.py`, while the failover crew's current `AGENTS.md` tells the four Codex builders to call `cc-send` directly. Step 2 must trace the path PM Codex can actually invoke from the Codex desktop before choosing the edit site; no implementation is allowed to claim folder-derived identity from a process that cannot observe that folder.

*Verify:* mutation-proved tests cover PM folder → PM Codex, existing folder → existing sender, unmapped folder → refusal, and message content containing another sender name cannot change attribution. One live line is read back from the Discord inbox as sender PM Codex.

### OBJ-3 — PM participates in every crew switch and receipt check

Append PM Claude and PM Codex at the same index in both `crew-switch` crews. Remove the two-word-name assumption in alias construction because `PM Claude` and `PM Codex` happen to fit it today but the invariant is the canonical list, not word count. A whole-crew switch includes PM in outgoing and incoming lists, status, open-order receipts and retained history. The existing honest limit remains: a receipt is self-asserted and no Codex session can be woken.

*Verify:* the crew-switch suite proves both directions name five outgoing and five incoming participants; counterpart mapping is PM Claude ↔ PM Codex; missing PM outgoing receipt keeps the order open and is nagged under the same rule as the other outgoing sessions; incoming PM receipt is tracked but not nagged; Helsinki installed hash equals the reviewed blob. The watched end-to-end round trip is OBJ-8.

### OBJ-4 — PM alert identities remain advisory only

Add canonical alert actors `pm-claude` and `pm-codex` under the approved `advisory` category: they may acknowledge or resolve alerts but never deploy and never confirm governance exceptions. The Codex session identity (`codex-pm`) and the canonical alert actor (`pm-codex`) are deliberately different namespaces; the instructions state which is used where. `codex-pm` is refused at every permission-bearing surface. Do not add bare `pm` aliases.

*Verify:* the actor allowlist and client union accept the advisory tag; the advisory set is exactly the two PM actors; an alert action by `pm-claude` and `pm-codex` is accepted; `pm` and `codex-pm` are refused; both PM alert actors and the `codex-pm` session identity are positively asserted absent from both deploy actor lists and from exception confirmers. CI is green per job before any deploy. The code may ride the next safe deploy because the current deployment line is held by B-DB-SIZE-RELIEF.

### OBJ-5 — Transcript and backup reach is stated truthfully

Re-prove that the Claude-side transcript archive and its nightly Drive backup cover the PM clone. Determine whether the Codex desktop has a supported export or backup surface for PM Codex. Do not call the Claude transcript archive a Codex backup: the two products store different conversations. If no supported Codex equivalent exists, record the honest gap against the already placed after-live item `B-CODEX-CONVERSATION-BACKUP` (`#1238`) and do not invent an unreviewed local-store scraper.

*Verify:* the current archive classifier maps `C--DawnTraderV3-pm` to CC-PM; one current archive run names that folder and the next backup reproduces its archive bytes. The Codex conclusion cites the current supported surface or explicitly says none was found, with its search scope and a positive control. No file under `G:\My Drive\Misc\I.T. and Security` is read, listed or searched.

### OBJ-6 — PM Codex owns the return trip to Claude

Create a PM-Codex-only reverse-switch skill. It runs only when Kyle tells PM Codex in its chat to switch back. Before the order it gathers and pushes a Codex-to-Claude handover sheet, checks all five clone/folder states, held deploys, timed checks and unanswered Coltrane reviews. It then issues `crew-switch start claude`, checks crew mode and Langston read-back, tells Kyle which Claude windows must be opened, chases outgoing receipts, re-sends unanswered Coltrane reviews to Langston, updates `MEMORY_PM.md`, and reports complete only when the defined checks pass. It never switches on its own judgement.

*Verify:* static tests pin the trigger, order direction and required checklist; a dry rehearsal produces a complete dated handover sheet without changing mode; OBJ-8 runs the live return with Kyle watching.

### OBJ-7 — PM Codex usage stop uses Codex mechanisms

Create a PM-Codex-only usage-stop skill after settling four facts with evidence: where Kyle can read the relevant ChatGPT/Codex allowance; Kyle's stop line (asked, never assumed from Claude's 85%); every Dawn Trader consumer of that allowance (four Codex builders, PM Codex, Coltrane and any scheduled Codex work); and what can actually be stopped remotely. Because Codex has no session messaging or wake path, the skill must state the reliable route and its limit: PM records and announces the stop, stops every remotely controlled consumer, and gives Kyle one exact instruction for any open Codex turns that only he can stop. Resume reverses the recorded list only on Kyle's word.

Coltrane control is an explicit dependency, not folded into this PM increment. The current service can be stopped safely only when no Coltrane invocation is active; `#1198` / `B-AGENT-INVOKE-FAILURE-NOTICE` owns the unsafe mid-invoke stop, orphan and false-failure-page path. PM Codex therefore must not add or claim a general Coltrane off/on control until that dependency lands. Until then the skill may perform an idle-only stop with the existing `pgrep -u coltrane -f "codex exec"` guard and service-state read-back; an active invocation is a loud refusal, not a kill or restart. OBJ-7 and the watched round trip cannot close while the dependency remains open unless Coltrane separately reviews an equivalent safe-stop implementation.

*Verify:* Kyle's supplied line is written into the skill and PM memory; the consumer census is source-backed; all relevant Codex app automations/schedules are listed and one pause/resume rehearsal is observed; Coltrane's bridge state has an explicit read-back; a planted already-stopped consumer stays idempotent; the record enumerates exactly what was stopped and what requires Kyle. Before `#1198` lands, an active real Coltrane invocation makes the stop refuse without killing, restarting, orphaning or paging; an idle real-process case stops and reads back disabled state. After the dependency lands, its active-invoke mutation and real-process proof are cited rather than duplicated.

### OBJ-8 — One watched round trip proves the system

With Kyle watching, prove PM Claude → PM Codex → PM Claude. This is not replaced by unit tests or manually typed receipts. The first half is the active KD-64 switch plus PM Codex startup; the return half is driven by PM Codex under OBJ-6 after Kyle gives the word. Every outgoing participant reaches a step boundary, pushes, updates its POSITION, and receipts are checked. PM Codex re-sends unanswered Coltrane reviews to Langston and restores only the Claude-side items recorded as paused.

*Verify:* `crew-switch status` shows five-person crews, no open order at each settled end, the correct reviewer bridge state, all clone sync checks, pushed handover sheets in both directions, and PM memory naming the active crew and next action. Kyle confirms the PM Codex session opened and the final Claude handover is usable.

## 3. Architectural read

**System Impact Map, read at `origin/migration/aws-supabase`:**

- `B-CODEX-FAILOVER` (§ around 4092): `AGENTS.md` is the Codex instruction surface; crew-switch owns one state record and the handover receipt checklist; downstream is operator coordination only.
- Discord Comms Fabric (§ around 3067): sender display names drive attribution and routing; `cc-send` is the live boundary. A sender-map change therefore belongs at the boundary, not in message content.
- Discord Comms Fabric (§ around 3078): Coltrane restart recovery exists, but the clean-stop leg did not port because `sudo use_pty` separates the invoked Codex process from the group that a service stop can safely terminate.
- Alert actor registry (§ around 985 and 4094): `ALERT_ACTORS` is the canonical alert identity source. The parent pre-audit already settled the PM-specific advisory category so deploy rights do not follow.
- Session-Instruction Loading Estate (§ around 1095): the PM folder is a distinct clone identity; missing/mis-mapped instructions are a crew-wide coordination risk, not a trading risk.
- Transcript Archive (§ around 1136): `dt_folder_class` is the single classifier, the archive is Claude-conversation-specific, and the Drive job backs up that archive. Its known reach does not establish a Codex desktop backup.

**System Manual:** no relevant trading-system entry. At the same ref, exact searches over the one System Manual file returned 0 lines for `PM Codex`, `crew-switch`, `ALERT_ACTORS`, `codex-send` and `transcript archive`; the same instrument returned 430 lines for the positive control `strategy`. The two `AGENTS.md` lines are historical OpenClaw file inventories, not this root Codex instruction surface. This increment is SIM-scope and System-Manual N/A.

**Blast radius:** high for crew coordination and identity attribution; none for trading behaviour. The only staging code is the alert actor allowlist, and its deploy is explicitly separated from the held trading deployment line.

## 4. Provenance and dispositions

Corpora searched: `BATCH_CATALOG.md`, completion reports, `RUNNING_ISSUES.md`, the parent B-PM scope and pre-audit, KD-62–64 and their brief; then repo-wide `git log -S`/path history and the introducing commits. `bridge/canonical/` is not applicable: every touched component was introduced after governance began.

- **Root `AGENTS.md`, TIER 1.** `ae9b039a2`: *“Kyle directed a Codex crew to stand in for the four Claude sessions when his weekly Claude allowance runs out … This file maps folder -> session”*. **Disposition 2:** relevant, add the fifth counterpart and PM-specific read/return/stop rules.
- **Crew switch, TIER 1.** `33fed96c4`: *“crew-switch (Kyle's one-message trigger with a confirmation checklist)”* and *“A handover on EVERY switch, both directions.”* **Disposition 2:** correct mechanism; extend the population from four counterparts to five and add the PM-run trigger already decided in KD-63.
- **Alert actors, TIER 1.** `dbcca4a9f`: *“ALERT_ACTORS, nine entries, each tagged roster | machine | human”*; Codex extension `bac793f92`: *“Both gates (dt-deploy --by and the alert ack/resolve --by) are exact-match against ALERT_ACTORS”*. **Disposition 2:** PM needs alert identity without deploy authority; the approved advisory category preserves that boundary.
- **Codex outbox/sender boundary, TIER 1.** `aba41a602`: *“THE SENDER NAME IS SET BY THE WATCHER AND CANNOT BE SET BY THE FILE.”* **Disposition 2:** preserve the control and choose the fixed sender from an allowlisted folder, never from body data.
- **PM Codex parent objective, TIER 1.** `f17130187`: *“PM Claude joins the crew's shared machinery (roster, loader, wake filter, alert actors, Codex mirror, backups, status board)”*; `f6227fd49` records the approved PM alert/deploy separation. **Disposition 2:** still the correct parent, amended by KD-63's return-trip and usage-stop duties.
- **Transition and usage-stop skills, TIER 1.** `193a65b32`: *“PM skills: pm-usage-stop and pm-transition-to-codex … PM Codex brief adds the return-trip procedure”*; `9a23a12ea`: *“PM Codex gets its own stop and switch-back.”* **Disposition 2:** mirror the responsibility, not the Claude mechanism.
- **Coltrane safe-stop gap, TIER 1 dependency.** The SIM records that crew-switch controls Langston only and that Coltrane's clean-stop leg did not port because of `sudo use_pty`. `RUNNING_ISSUES` `#1198` records the measured hang/orphan and false-failure-page path and places it in `B-AGENT-INVOKE-FAILURE-NOTICE`, owner Infra Claude. **Disposition 4:** dependency, not folded in. This PM increment may use only the existing idle guard and cannot close OBJ-7/8 until the owned safe-stop path lands or Coltrane reviews an equivalent replacement.
- **Transcript archive, TIER 2 (read-only proof).** Its current classifier explicitly maps `C--DawnTraderV3-pm` to CC-PM and the SIM defines it as a Claude conversation archive. **Disposition 1** for PM Claude coverage; **disposition 3** for Codex conversation backup remains the already placed `#1238`, unless a supported current Codex export changes that fact.
- **Roster, TIER 1.** The PM Codex record was created in the parent scope as `planned (active once P4 lands)`. **Disposition 2:** flip only when the instructions and procedures land.

## 5. Delivery order and review gates

Each brief build step is a separate pushed increment and a separate Coltrane review, with the Discord post starting `Coltrane`:

1. identity/read order (brief 1) and roster activation held until the last required procedure exists;
2. Discord sender mapping (brief 2);
3. crew-switch population and receipt tests (brief 3), then give Kyle the checked PM-Codex opening steps;
4. advisory alert actors (brief 4; deploy may wait);
5. roster activation (brief 5);
6. backup proof and honest Codex gap/result (brief 6);
7. reverse-switch skill (brief 7);
8. Codex usage-stop skill (brief 7b), after Kyle supplies the stop line and the `#1198` safe-stop dependency is satisfied or an equivalent implementation is separately reviewed;
9. watched round trip (brief 8).

Normal workflow gates still apply around those increments: Step 2 audits the current code and current Codex product surfaces; Step 4 reviews implementation; Steps 5–9 verify and review; Step 10 updates the System Impact Map; Step 11 closes the parent increment record. No other OLD work resumes before this is complete.

## 6. Risks and rollback

- **Identity collision:** session identity `codex-pm` and alert actor `pm-codex` can be confused. Both are named with their use sites and tested; `codex-pm` is positively refused at every permission surface and there is no bare `pm` alias.
- **Wrong Discord boundary:** three Codex-era send paths exist for different actors. Step 2 proves which one PM Codex actually uses before any sender map is written.
- **False delivery guarantee:** neither PM Codex nor crew-switch can wake Codex sessions. Procedures say what Kyle must do rather than claiming delivery.
- **Reviewer stop safety:** crew-switch currently does not control Coltrane, and `#1198` records that a mid-invoke stop can orphan Codex and trigger a false failure page. OBJ-7 depends on that owned safe-stop work; before it lands, only an idle-guarded stop may run and an active invocation must cause a loud refusal.
- **Held deploy:** alert actors are a staging code change, but the current branch includes held database migrations. The implementation is reviewable and CI-able without deploying; any deploy needs the existing hold owner's explicit release.
- **Backup overclaim:** Claude transcript coverage is not Codex coverage. A missing supported Codex export stays an explicit after-live gap.

Repo changes roll back by reverting their individual increment commits. Helsinki-installed crew-switch and any reviewer control are restored from the previous reviewed blob with hash read-back. A live crew switch is not rolled back by editing state; it is reversed through a new `crew-switch start` order on Kyle's word.
