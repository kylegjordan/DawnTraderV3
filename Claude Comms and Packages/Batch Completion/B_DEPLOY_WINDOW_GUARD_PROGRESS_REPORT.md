# OPEN — B-DEPLOY-WINDOW-GUARD: waiting on the first real deploy into an observation window, and the first stale window

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1249` · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §0 Infra order 10a (Kyle KD-56, option A) · **Scope:** `Scope Files/B_DEPLOY_WINDOW_GUARD_SCOPE.md` · **Audit and plan:** `Scope Files/B_DEPLOY_WINDOW_GUARD_PRE_AUDIT.md` (r3 + Part E) · **Change list:** `Change Lists/B_DEPLOY_WINDOW_GUARD_CHANGE_LIST.md`

This is a progress report. It becomes the completion report once the observation below has its data **and** a decision has been taken on it (`workflow-10-governance`). The batch is declared OPEN in `GOVERNANCE_EXCEPTIONS.md` (Langston C-11), because the checker's `completion_report` key cannot be met by this file.

## 1. What the batch is for, and what shipped

Before a staging deploy, `dt-deploy` now reads a register of other batches' open observation windows, `1-system-manual/DEPLOY_WINDOWS.jsonl`, at the branch head. A deploy that would land in an open window is refused (exit 5) unless it names every open window. A missing or broken register refuses too (exit 4). A deploy that does land in a window, open or stale, writes a notice line and raises one alert per window **before** the tree is touched (C-12/C-13). A Helsinki watcher turns that notice into a wake for every owner, then posts whether the deploy completed, and closes the alert with evidence. This fixes the 2026-11-05 case: three deploys followed `#1235`'s own, and one landed nine minutes into its US-session window with no one told.

| piece | file | installed |
|---|---|---|
| the register | `1-system-manual/DEPLOY_WINDOWS.jsonl` | read at the branch head, never installed |
| its parser | `scripts/obs-windows.py` | staging `/usr/local/bin/dt-obs-windows` at `7429799c9` |
| the deploy check, notice, alert and record fields | `scripts/dt-deploy.sh` | staging `/usr/local/bin/dt-deploy` at `7429799c9` |
| the watcher's forced command | `comms-infra/staging/dt-deploy-notice-gate` | staging `/usr/local/bin/dt-deploy-notice-gate` at `831591e7b` |
| the watcher's key line | staging `/home/deploy/.ssh/authorized_keys` | appended 2026-11-13 22:50Z (backup `/root/authorized_keys.deploy.pre-dwg-*`) |
| the watcher | `comms-infra/discord/dt-deploy-notice.py` + `comms-infra/systemd/dt-deploy-notice.{service,timer}` | Helsinki, timer enabled 22:51Z |
| the daily check (installed-file match, 1-day grace, window census, key check) | `comms-infra/staging/dt-install-drift` | both boxes at `831591e7b` |
| two machine actors | `server/services/system-alerts.ts` | live in the joint deploy `77f6fd598` (2026-11-13 21:03:55Z) |
| skill lines | `workflow-02-audit-and-plan` item 5, `workflow-hotfix` §4, `workflow-06-deploy` | at the ref |

`daily_deploy_check.sh` is **kept** (pre-audit Part E, A-15): a self-chained weekly alert runs it by hand; only its display line changed.

## 2. Every step, with its evidence

| step | result | evidence |
|---|---|---|
| 1 scope | Langston PROCEED 2026-11-13 16:57Z | Discord `1570845045228179588`; conditions C-1 to C-5 and J1 to J6 in scope §6 |
| 2 audit and plan | PROCEED at r2, C-12 to C-17 settled before code | `1570868199694803055` (changes), `1570874939672764589` (PROCEED); pre-audit Part D |
| 3 build | three commits, `033d7f6da`, `be9ca2128`, `dd7e4c6f1` | change list |
| 4 code review | gate A cleared r3; gate B cleared r6 at `831591e7b` | gate A `1570893221679210630`; gate B `1570933493955825666`. Langston re-derived the B-4 to B-9 key-check legs himself on a real sshd |
| 5 CI | 4/4 per job | run `43521590941` at `a6cad854b` (contains `831591e7b`) |
| 6 install | order as Langston set: key line, gate, parser, dt-install-drift; then the Helsinki watcher and units; dt-deploy last | every installed file's sha256 equals its blob; dt-install-drift PASS on both boxes |
| 7 my verification | live exit-5 refusal; wake observed | test window `9adc77f2b` (closed `d7b2f9f76`): EXIT=5, HEAD and reflog unchanged, no lock left, no notice, record unchanged; post `1570934576606486681` logged `cc_outbound` / `Deploy notice`, `WAKE[Deploy notice via Discord->CC-INFRA]` |
| 8 Langston's verification | PROCEED, one finding | `1570938318558986322`; he re-ran the parser (13 arms), the installed dt-deploy end to end, and the key gate (seven requests) |
| 9 iterate | FINDING-1 fixed: a bad `--in-window` name gets its own refusal text | `7429799c9`; Langston PROCEED `1570940052807090277`; reinstalled; dt-install-drift PASS 23:22Z |

**No UI surface.** The batch changes deploy tooling, a root check and a Discord watcher; nothing on the staging dashboard changed. Stated per `workflow-07-verify-cc`.

## 3. ⛔ PRE-REGISTERED CLOSE CRITERION — written before the data (do not mine the window) — r2 (Langston A-1 to A-4, Discord `1570944885559791717`)

**PREREQUISITE — THE CLOCK HAS NOT STARTED (A-3).** At `75aa89868` the register holds one `open` and its `close`, both my own Step-7 test: **zero windows filed by anyone else.** O-1, O-2 and O-3 all need someone else to file a window, which is OBJ-4 (NEW Claude's first rows). **The observation starts at the first window filed by another owner.** Until then nothing below can occur and nothing is being measured.

**O-1, the first deploy that PROCEEDS with `--in-window` into a registered window (A-2).** A deploy that is refused is neither pass nor fail for O-1; it is O-3. PASS when, for that deploy:
- (a) **a notice line appears**, carrying its `attempt_key`. Read-site: staging `/home/deploy/dawntrader-deploy.notice`.
- **(b-i) the START post accounts for EVERY owner:** the opening list names every owner `WAKE_NAME` maps (`cc-a`, `cc-b`, `cc-c`, `cc-infra`, `pm-claude`), plus Kyle as `Kyle`; every other canonical owner (`codex-a/b/c/infra`, `langston`, `coltrane`, `pm-codex`) appears in the post's `others` tail. FAIL if an owner appears in neither. Always testable, and it covers all 13 canonical owners. Read-site: Helsinki `/var/log/cc-discord-inbox.jsonl`, the `kind=cc_outbound`, `sender=Deploy notice` row.
- **(b-ii) a wake record, but only for owners that are Claude-backed AND open at that moment**, enumerated when the result is judged. Read-site: that owner's watcher line `WAKE[Deploy notice via Discord-><ALIAS>]`, quoted by the owner in-channel with the post's message id. An owner that cannot be woken (a closed session, or a seat held by the Codex crew) is discharged by the alert row plus the post, and recorded as a residual, never as a FAIL.
- (c) **within 30 minutes, a COMPLETED or DID NOT COMPLETE post** goes to the same owners. Same read-site as (b-i).
- (d) **the watcher logs `RESOLVED deploy-in-window:<batch>:<sha>:<attempt_key> rows=1` for each window**, and the alert rows read `resolved` by `deploy-notice-watcher`. Read-sites: Helsinki `/var/log/dt-deploy-notice/log`; staging `/var/log/dawntrader/system-alerts.jsonl`, rows merged by id, keys `deploy-in-window:*`.

FAIL if (a), (b-i), (c) or (d) is missing; if `rows=0` where an alert was raised (a broken key join); **or if (b-ii) is missing for an owner that was Claude-backed and open at that moment** — the case the guard exists to catch. The one exception is an owner that could not be woken (closed, or a seat the Codex crew holds): discharged by the alert row plus the post, recorded as a residual.

**O-2, the first stale window the daily census finds.** PASS when:
- the daily `dt-install-drift` run raises `deploy-window-stale:<batch>` naming that window's owner, with its verdict still PASS;
- once the owner amends or closes the window, a later run resolves that alert as `dt-install-drift`.

Read-sites: staging `journalctl -u dt-install-drift.service` (the `deploy_windows` OK line) and `/var/log/dawntrader/system-alerts.jsonl` (keys `deploy-window-stale:*`). FAIL if the alert never mints, if the verdict goes red, or if the alert stays active after the register no longer shows the window stale.

**O-3, the first refusal in the wild (A-2): a deploy that does NOT name an open window.** PASS when it exits 5, the app clone's HEAD and reflog are unchanged, and no notice line or alert is written. Read-sites: the deployer's own output; staging `git -C /home/deploy/dawntrader reflog`; the notice file; the alert store.

**Window shape:** a quantity, not a period: one occurrence each. **What closes it:** the data above **and** a decision recorded on it, by me with Langston.

**Report-back point, not a date (A-3).** If **5** deploys pass after the first filed window without an O-1 occurrence, I report to Langston rather than letting the row age.

**The governance nags this row will mint (A-3):**
- the declared-open row draws `gov-staleopen` at 48 h and `gov-openmaxage` at 7 days, and keeps re-minting for the whole observation;
- both are mine, and I never acknowledge them; re-justifying does not clear `gov-openmaxage`;
- at close: flip the row to `open-retired` and push **before** resolving the nag, or the next checker tick re-mints it.

**Known code residual surfaced by A-1, recorded rather than fixed here:** `WAKE_NAME` maps a SEAT (`cc-c` → "ANALYST Claude"), so when the Codex crew holds that seat, the owner still lands in the post's opening list (the head), though nothing wakes it. (The line *"the alert reaches every session"* renders in the TAIL, beside *"not woken from here"*, `dt-deploy-notice.py:149`, not in the head — corrected per Langston.) The adjudication rule in (b-ii) keeps this from deciding O-1; the wording in the post is the residual.

## 4. What is unproven, stated as unproven

- **LIMIT-2 (Langston, Step 8): none of the new paths has had a real input.** The notice file does not exist on staging yet; the stale-alert mint has never run (zero `deploy-window-stale:*` rows all-time). Every count so far is from a sandbox or a fixture: parser 52/0 with 15/15 mutants; sandbox 27/27; drift 87/87 with 51/51 mutants; watcher 29/29 with 10/10; gate 16/16.
- **LIMIT-1 (Langston, Step 8): the watcher arms its own heartbeat through the key it supervises.** The heartbeat may never be cited as an independent witness to watcher liveness.
- **The second exit 6 (Langston, gate A):** if the notice append fails AFTER the alerts were raised (a full disk), those alerts have no notice line. Neither the watcher nor the daily check sees them; only the deployer reading the refusal closes them, and their body's promise of an automatic resolve is false on that one path.
- **The weekly hand check (`7164d7ab`, 2026-11-18) will read DIFFERS** until a deploy carries `7429799c9`: it compares the installed dt-deploy with the blob at the RECORDED deploy sha (`77f6fd598`). dt-install-drift compares against the installed sha and reads MATCH throughout.
- **Residuals carried from the scope:**
  1. the unregistered window;
  2. the unguarded deploy path (a hand `git reset` plus `pm2 restart`);
  3. a deleted register row cannot be detected at deploy time (`B-GATE-GUARD`, `#744`);
  4. the daily check's git argv carries the `dt-deploy` substring for a sub-second spawn;
  5. a Codex-owned window gets the alert but no wake from this channel.

## 5. Still owed before close (not part of the observation)

- **OBJ-4 first entries:** NEW Claude files the windows open at go-live (`CC_B_SESSION_TASK_LIST.md` item 2a).
- **Langston's gate line:** written this step through `langston-memory-write` (ledger below).

## 6. Governance files changed so far

The Step 10 ledger (section 7) is the list; it is transcribed from the governance commit.

## 7. Step 10 tier ledger (transcribed from the governance commit)

CHANGE-CLASS: non_architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | section added: built, installed 2026-11-13, OPEN in observation |
| T1 | `PHASE_HISTORY.md` | ✅ | 2026-11-13 entry: OPEN, in observation |
| T1 | `SPRINT_TO_LIVE_PLAN.md` (row 10a) | ✅ | status IN OBSERVATION, Step 10; progress report linked; interim discipline retired |
| T1 | `PHASE_19_PLAN.md` | N/A | no row there (a `B-*` batch, not `P19-*`) |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | ✅ | my position line moved to Step 10; shared file unchanged (no consensus truth moved; the rule lives in `workflow-06`), and measured at 24,583 B, already over cap from another session's edit |
| T1 | the batch `SCOPE` | ✅ | Step 1, with Langston's conditions in §6 |
| T1 | the batch `PRE_AUDIT` | ✅ | r3, Parts C, D and E (the C-7 reversal) |
| T1 | `COMPLETION_REPORT` | BLOCKED — progress report §3 | owed at close; the pre-registered observation holds it |
| T1 | the `Observation` column | ✅ | two waits: the first real in-window deploy, and the first stale window |
| T1 | session task lists (`CC_A` / `CC_B` / `CC_C` / `CC_INFRA`) | ✅ mine / N/A ×3 | open-and-stalled row added to `CC_INFRA_SESSION_TASK_LIST.md`; the other three are not mine |
| T1 | Langston's `MEMORY.md` | ✅ | OBJ-4 Step-2 gate line in, paid for by a stale #987 line and a closed batch's mechanics clause; load 143,753 → 143,695 B vs ceiling 143,856 |
| T2 | `SYSTEM_MANUAL.md` | ✅ | usage line gains `--in-window`, plus the exit 4/5/6 meanings |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | `#649` comparator note superseded, new component entry, row `:1366` widened |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1249` annotated (installed, in observation); `#1004` closed for `dt-deploy` |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-13-A |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change; the item is a sprint-plan row |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no trading parameter or threshold changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional rule changed |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention changed; the notice file is uncapped by Langston's ruling |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no trading path changed; the only `server/` change is two `ALERT_ACTORS` rows |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no asset-class learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | no role or review gate changed; the new Step-2 filing duty is a skill line in `workflow-02` |
| T2 | `LANGSTON_ARCHITECTURE.md` | ✅ | change-log row: the deploy-notice watcher runs under `langston` with its own pinned key |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | neither file changed; the deploy rule lives in the `workflow-06`/`02`/`hotfix` skills |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | `CLAUDE.md` untouched |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | nothing removed (`daily_deploy_check.sh` kept, pre-audit Part E) |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | `wrong-object` ×2 (the repo-only absence; the `base_ambiguous` overclaim) |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | declared-`open` row (Langston C-11) |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | ack/resolve process unchanged; the new keys follow resolve-never-ack |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | board columns and fields unchanged |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily model check did not run in this batch |
