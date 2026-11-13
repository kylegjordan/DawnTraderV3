# B-DEPLOY-WINDOW-GUARD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1249` · **Plan:** `SPRINT_TO_LIVE_PLAN.md` §4 row 10a · **Scope:** `B_DEPLOY_WINDOW_GUARD_SCOPE.md` (Step 1 PROCEED, Langston 2026-11-13T16:57:28Z, conditions in its §6). **Audited at:** `origin/migration/aws-supabase` = `ee4328155`, 2026-11-13 ~18:10-18:50Z, read-only on both servers.

The audit comes first; the plan (Part B) falls out of it. Every plan item names the finding it rests on (`← A-n`). Anything without one is marked `UNAUDITED`.

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| D-1 | Scope OBJ-5 + SIM `:3924`: "schedule the existing comparator `daily_deploy_check.sh`", and C-3 adds an alert carrier to it and runs it as deploy | **Add `dt-deploy` to `dt-install-drift`'s staging manifest instead. `daily_deploy_check.sh` stays an unscheduled hand tool.** | A-5. `dt-install-drift` already runs daily as root on staging (last PASS 2026-11-13 05:21:51Z), compares each installed file to its blob at the **installed** sha, reports a committed-not-installed change as PENDING and pages after 7 days, and pages through `dt-unit-failure@` → a system alert naming Infra Claude. That is C-3's carrier, already reviewed and live. It also dissolves C-3(a) (it runs no pm2) and C-3(b) (A-6). Building a second comparator would be `#641`'s two-copies shape. |
| D-2 | C-3(b): a hand-install before the next deploy creates a DIFFERS window that must be pre-registered | **No DIFFERS window exists** | A-6. The install writes an override line `<sha> scripts/dt-deploy.sh` into `installed.sha`, so the check compares against the sha actually installed. No window to pre-register. |
| D-3 | Scope OBJ-3: alert key `gov-deploy-in-window:<batch>:<sha>` | **`deploy-in-window:<batch>:<sha>`** | A-9. `gov-` is the governance checker's namespace (`poller.mjs:187-232` parses `gov-docgap`, `gov-classundeclared`, `gov-ledgerrow`, `gov-planline`). Its orphan sweep ignores other `gov-` types today, but sharing the prefix invites a future sweep to resolve these. My own name; not a Langston term. |
| D-4 | Scope OBJ-2: cases (a)-(d), plus C-1's (e), run against the INSTALLED executable on staging | **(c) runs live on the installed tool against a real open window. (a), (b), (d) and (e) run on the installed bytes in a sandbox:** a harness copies `/usr/local/bin/dt-deploy`, asserts sha256 = installed, swaps ONLY a marked constants block (paths, branch), and runs against a local fixture origin | A-2. Cases (a) and (b) need an absent or broken register at the real branch head. Fail-closed would then block every session's deploy for the test's duration. The constants-block form is the one `dt-install-drift` already uses for the same reason. |
| D-5 | Scope OBJ-3: "one deploy against a test window with two named owners" proves the wake | **Two legs.** Wake leg: the installed Helsinki watcher, fed a fixture record naming two real owners, posts live; both owners' watchers record the wake. Full chain: proven at the first real deploy that lands in a registered window (Step 7) | A-8. The wake depends only on the post's sender and opening list, not on how the record came to exist. A real deploy into two test windows would restart the app and need two fake windows on the branch. |
| D-6 | Scope §0: "Nothing checks that this stays true" (the installed `dt-deploy`) | Still true: `dt-deploy` is **not** in `dt-install-drift`'s manifest | A-5. Recorded so the D-1 change is not read as "it was already covered". |

## PART A — THE AUDIT

### A-1. The deploy tool, read at the ref (C-1, C-2) — source 1
`scripts/dt-deploy.sh` (310 lines, `700ea99b5`): the lock at `:170-203`, `git fetch origin` at `:208`, `git cat-file -e` at `:209`, `merge-base --is-ancestor "$SHA" "$BRANCH"` at `:210`, the dirty-tree refusal `:213-219`, `DEPLOYED_SHA=$(git rev-parse HEAD)` at `:222`, `git reset --hard` at `:223`, the record heredoc at `:293-302`.
- **Exit codes in use:** 1 (`fail()` `:73` and every argument refusal), 2 (lock held, `:192`), 3 (dirty tree, `:218`). 4 and up are free.
- **C-1 confirmed at the code:** between `:210` and `:223` the worktree is at the previously deployed sha. The register must come from `git show "$BRANCH":<path>`, never the worktree.
- **The argument parser** refuses a value starting `-`, a duplicate flag, a `--flag=value` form and any unknown token, and never echoes a user value (`:54-69`). A new `--in-window` follows the same four arms.
- **The owner set** must be canonical actors. `dt-deploy` already carries the canonical list as `DEPLOY_ACTOR_LIST` (`:150`, 11 canonical values; the alias table is `:117-149`), fenced to `ALERT_ACTORS` by `server/tests/unit/dt-deploy-actor-parity.test.ts`.

### A-2. Entry points — what starts a deploy, what will read the register (enumerated first)
- **Deploys:** `dt-deploy` is the one sanctioned entry point (SIM `#649` UPSTREAM; System Manual "Deploy ordering invariant" `:13440-13448`). A second, unsanctioned one exists: a hand `git reset` + `pm2 restart`. That is scope residual (2), named, not closed.
- **Repo-wide callers of the installed tool** (`git grep "dt-deploy"` in `*.sh *.py *.mjs *.ts`, comments excluded): none invoke it. The deploy skill and the System Manual document it; sessions run it by hand.
- **Testing the installed tool live** for (a) or (b) needs a broken register at the real branch head. That would block every session (→ D-4).

### A-3. The register's location vs the drift line (J4) — measured by running, not reading
I ran the shipped predicate: `load_shipped_predicate()` from `scripts/analysis/test-drift-runtime-predicate.py`, extracted from `comms-infra/discord/dt-deploy-drift.sh` at `ee4328155`.
- `1-system-manual/DEPLOY_WINDOWS.jsonl` → **False** (not a runtime file); `scripts/dt-deploy.sh` → False.
- **Positive controls:** `server/index.ts`, `package.json`, `drizzle/migrations/x.sql`, `scripts/db-migrate.ts` → **True** (one per sink).
- The committed control itself: 34 cases, 0 failures, 18 cases where it tells the fixed rule from the broken one, PASS.
⇒ Filing or closing a window does not move the drift line.

### A-4. The deploy record, a census of its readers (C-2 adds three fields) — sources 1, 3
**Writer:** `dt-deploy.sh:293` only, overwriting the file each time.
**Readers**, every one found by `git grep "dawntrader-deploy.record"` at the ref. **Each picks fields by name; none counts lines or fields:**

| reader | how it reads | effect of three new lines |
|---|---|---|
| `dt-deploy-drift.sh:265-271` (Helsinki, hourly) | `grep -E '^sha='`, `'^deployed_at='` | none |
| `server/db-pool-alerts.ts:137,157,162` | `startsWith(field + '=')` for `restart_time`, `sha` | none (`register_sha=` does not start with `sha=`) |
| `xs_frame_false_hollow.py:100` | `startswith('deployed_at=')` | none |
| `xs_frame_extract.sh:124` | copies the whole record into its archive | three more archived lines |
| `daily_deploy_check.sh:5-8` | `tail -n 9` for display, then `grep` by key | **the display would drop `sha` and `restart_time`** (11 lines, 9 shown); the keyed reads are fine |
| `codex-export/export-data.sql:50` | a comment | none |

The SIM `#649` entry says the record is "split-on-first-`=`, never sourced". New values must carry no newline. A space is harmless.
**A process-name hazard, found on this census:** `server/db-pool-alerts.ts:378` treats any process whose command line contains `dt-deploy` as a live deploy and suppresses its restart alert. A helper named `dt-deploy-*`, run daily by the census (A-7), would trip that. **The helper's name must not contain `dt-deploy`.**

### A-5. The existing installed-file checker (D-1) — sources 1, 2, 3
`comms-infra/staging/dt-install-drift`, installed `/usr/local/sbin/dt-install-drift`. **Live on staging:** timer next 2026-11-14 05:20:41Z, last run 2026-11-13 05:21:51Z "PASS", `installed.sha` = `8e165d1d…` (default line only).
- Compares each manifest file against its blob **at the installed sha**, with a per-file override line `<sha> <repo path>` (docstring `:8-17`).
- PENDING = changed on the branch after the install; pages once the commit is over 7 days old. That is `#1004` exactly.
- **Root runs no git.** Blob ids come from `deploy`'s git on the governance checker's clone `/opt/governance-checker/DawnTraderV3/.git`, fetched every 30 min, stale after 3 h (`BOXES`, `:60-70`).
- It also runs named STATE checks (`dt_api_page`, `setter_marker`, …): a runtime fact that must hold, failing the run and paging.
- **SIM row `:1366`** already lists it: "pages CC-INFRA; it does not repair". **`dt-deploy` is not in its manifest** (D-6).

### A-6. Install ordering (C-3(b)) — falls out of A-5
With an override line written at install time, the check compares the installed `dt-deploy` against the sha it was installed from. A later commit to `scripts/dt-deploy.sh` reads PENDING until installed. **No DIFFERS window.** `daily_deploy_check.sh` check (3) compares against the recorded deploy sha instead, so it would report DIFFERS between my install and the next deploy. It stays an unscheduled hand tool, not a pager, so that is a known reading, not an alarm.

### A-7. The stale-window census (J3), on OBJ-5's daily run
J3 asks for stale windows to surface before a deploy lands in one, riding the daily run on the same host with no new cron. `dt-install-drift` is that run (A-5). It already reads blobs at the ref through `deploy`'s git, and a failing STATE check pages per (class, subject). A new STATE check `deploy_windows` reads the register at the ref through the same git and fails, naming the window, for every window past its review-by date (or past an ISO end with no close). The subject is the batch id, so one stale window cannot hide a second.

### A-8. The wake route (J6) — sources 1, 2; measured at the installed filter
- The laptop filter: `C:/Users/kyleg/.claude/cc-wake-filter.py`. **sha256 = the blob at `ee4328155:comms-infra/laptop/cc-wake-filter.py`** (both `89bcce89…`). Every session on this laptop runs this one file.
- **The branch a watcher post takes:** a `cc-send --sender "<name>"` post logs as `kind == "cc_outbound"` with `sender` set. It hits the crew branch (`:1301-1345`): routine `Push notice` and all-clear `Heartbeat` are dropped by **sender + exact text** (`:1321-1324`). Any other sender wakes a session **if it is in the post's opening list** (`crew_post_names_me` → `address_list.opening_addressees`, `:284-292`), or on `@crew`.
- **So a sender `Deploy notice` whose post opens "NEW Claude, OLD Claude — …" wakes both.** It is not the Langston branch (`:215` `^`-anchored, first name only), because the sender is not Langston's bridge.
- **`cc-send` accepts any `--sender`** (`/usr/local/bin/cc-send:29,46` → `discord-cc-bridge.py:291`, no allowlist). Langston's bridge engages a CC post only when "Langston" is in its opening list, so a deploy notice costs him nothing.
- **Precedent:** `dt-push-notice.sh`, root cron `*/2`, state file, silent first run.
- **Langston's (ii), the obligation vs delivery split:** the alert is minted on staging by `dt-deploy` (A-9) and reaches every session through the §10.5 per-turn read as unrouted until Langston routes it. The wake is the watcher. A dead watcher degrades to the queue, not to silence.
- **Watching the watcher (`#661` leg 3).** Helsinki already has (1) `agent-unit-failure@` (a failed run posts to the crew), and (2) `dt-install-drift`'s Helsinki manifest, whose UNIT check catches a disabled or edited unit. Neither catches a timer that is enabled but never fires. (3) My own heartbeat pattern from `B-SIZE-WATCH-BREACH-ALARM` (`langston-size-watch:239-305`: each run resolves the pending alert and arms the next one 26 h out) does.

### A-9. The alert store, for OBJ-3 — sources 1, 3
- Mint from a staging script: `npm run -s system-alerts -- add --triggers-at <now> --category … --severity … --title … --body … --dedupe-key …` in the app dir (`scripts/system-alerts.ts:184-212`; the `xs_frame_extract.sh:53-58` precedent).
- **Category `governance`** is in `ALWAYS_DELIVER_CATEGORIES` (`system-alerts.ts:121-124`). It posts to Discord at any severity, so Langston triages and routes it to the owner.
- **Ownership** comes from Langston's `[[ALERT … owner=]]` markers, not from the row (`inject-due-alerts.mjs:119-134`). Until routed it shows in every session's prompt, the owner's included.
- A non-terminal row blocks its key's next mint (`CLAUDE.md` §10.5 step 3). The key carries the sha, so each deploy mints fresh; a repeat deploy of the same sha into the same window is deduplicated, correctly.
- **Key namespace:** see D-3.

### A-10. Langston's load (C-5(i)) — measured
`langston-size-watch --status` on Helsinki, 2026-11-13 ~18:45Z: `measured_total` 143,760 against `ceiling_bytes` 143,856 (**96 B of headroom**). The gate line must be paid for with an equal or larger cut in the same `langston-memory-write` call. Re-read before and after the write.

### A-11. Governance documents — sources 3, 4, 5, 6
- **SIM `#649` (`:3918-3929`):** `:3924` names `daily_deploy_check.sh` as the comparator to arm, and "Home: `P19-B12`". D-1 changes both, so this is a Step-10 content update. Row `:1366` (`dt-install-drift`) gains `dt-deploy` and the window census. The drift-line entry (`:4017-4038`) is unchanged (A-3).
- **System Manual `:13440-13448`:** the usage line gains `[--in-window <batch,…>]`. No architecture or maths changes. Not a contradiction, a usage update.
- **Ledger (§9.5(b-ii)):** `#1249`'s 2026-11-06 entries are the settled input (scope §1). `#1004` (installed copy unchecked) is closed **by D-1 for `dt-deploy` only**; `#652` (`pm2 save`) stays in `P19-B12`.
- **`GOVERNANCE_EXCEPTIONS.md`:** the `deploy-hold` rows are record-only (`:149`, `config.mjs:373-380`). The last hold rows are at `:76-90`, all from Oct and all released or ended. **No hold is open today**, so the register starts with NEW Claude's windows only (OBJ-4).
- **`bridge/canonical/`:** no coverage. The tool dates from 2026-08.
- **Skills:** `workflow-02-audit-and-plan` (tier 2, C-5(iii), disposition 2: one line). `workflow-hotfix` §4 "DEPLOY, THEN VERIFY ONCE" gets the `--in-window` line, not a filing line: a hotfix rarely runs a window, but its deploy may land in someone else's. `workflow-06-deploy` documents the tool's usage and gains the flag and the two new refusals.

### A-12. Census at each hop (§9.5(a))
| object | writes / creates | reads | mutates | deletes | schedules |
|---|---|---|---|---|---|
| the register (new) | owners, by commit (OBJ-4) | `dt-deploy` (at deploy); `dt-install-drift` STATE check (daily); Langston at Step 2 | an `amend` or `close` entry, appended | **nobody** (append-only; a deleted row is not detectable at deploy time, which is `B-GATE-GUARD`'s) | none of its own |
| the deploy record | `dt-deploy.sh:293`, **exactly one writer** | the six in A-4, plus the new Helsinki watcher | overwritten each deploy | nobody | `dt-deploy` (manual) |
| the in-window alert (new) | `dt-deploy`, after the record | §10.5 hook; Langston triage | ack/resolve CLI | resolve only (never ack) | none |
| the notice watcher (new) | its state file only | the record over SSH | — | — | its own timer, **exactly one** |

## PART B — THE PLAN

| # | item | ← finding |
|---|---|---|
| **P1** | **The register: `1-system-manual/DEPLOY_WINDOWS.jsonl`.** Line 1 is a required header `{"schema":"deploy-windows/1"}`, so an empty or truncated file is refused, not read as "no windows". Then one JSON object per line, append-only: **`open`** {batch, owner (canonical actor), opened_at, end (ISO) **or** until_event + expected_by, **review_by (always)**, disturbs, detail (`deploy-hold` row or progress report)}; **`amend`** {batch, field, value, reason}; **`close`** {batch, at, **reason code** `completed \| replaced \| abandoned \| superseded`, note}; **`hold`** {hold id, gov-exceptions row, pending: [{batch, landing_sha}]}; **`release`** {hold id, at}. Refused by name: a missing field, an unknown owner, a malformed time, a second `open` for an open batch, an `amend`/`close` with no open, an unknown type, an unknown reason code, no header. | A-1, A-3, J3(i), C-4, C-5(ii) |
| **P2** | **One parser, installed once: `scripts/obs-windows.py` → `/usr/local/bin/dt-obs-windows`** (0755 root). Modes: `check` (register on stdin, `--in-window`, `--owners <canonical list>` → OPEN / STALE / REFUSE, exit 0, 4 or 5) and `census` (stale list). Used by both `dt-deploy` and `dt-install-drift`. The name avoids `dt-deploy` (A-4 hazard). Liveness for a `hold` is derived at read time with `git merge-base --is-ancestor <landing_sha> <sha being deployed>` by `dt-deploy`, which holds both operands. | A-4, A-7, C-4 |
| **P3** | **`dt-deploy`, after `:210`, before the dirty-tree check and `:222`:** `REG=$(git show "$BRANCH:1-system-manual/DEPLOY_WINDOWS.jsonl")` (stderr kept, never discarded). Read fails ⇒ **exit 4**, "register unreadable at origin HEAD". The parser refuses ⇒ **exit 4**, naming the line and the rule. An open, non-stale window not named in `--in-window` ⇒ **exit 5**, naming each window's batch, owner and end. A name in `--in-window` that is not an open window ⇒ **exit 5**, value not echoed. A stale window prints `STALE WINDOW <batch> owner <x> review-by <t>` and does not block (J3). Every refusal prints `register_sha=` (`git rev-parse "$BRANCH"`), `register_blob=` (`git rev-parse "$BRANCH:<path>"`) and `in_window=`. | A-1, C-1, C-2, J1, J2, J3 |
| **P4** | **`--in-window <batch,…>`** with the four existing refusal arms (missing value, flag-looking value, duplicate, `=` form). Usage string updated. | A-1 |
| **P5** | **The record** gains `register_sha=`, `register_blob=`, `in_window=<batch/owner/open\|stale,…>` or `in_window=none`. No spaces or newlines in values. `daily_deploy_check.sh:5` changes `tail -n 9` to `cat` (display only). | A-4, C-2 |
| **P6** | **After the record, for every window landed in, open or stale, with or without the flag:** mint `deploy-in-window:<batch>:<sha>`, category `governance`, severity `warning`, body naming the window, owner, sha and deployer, "resolve, never ack". A failed mint prints `IN-WINDOW ALERT NOT RAISED — tell <owner> by hand` and the tool **exits 6** after the record (the deploy is done; the non-zero exit says something is still owed). | A-9, J3(ii), D-3 |
| **P7** | **Holds (C-4):** for each unreleased `hold`, print which pending batches this sha makes live and which remain not live. Information only; never refuses. | C-4 |
| **P8** | **The Helsinki watcher `comms-infra/discord/dt-deploy-notice.sh`** → `/usr/local/bin/`, a systemd timer every 2 min as `langston` (the SSH identity the drift line uses), `OnFailure=agent-unit-failure@`. It reads the record over SSH. When `sha` or `deployed_at` changes and `in_window` ≠ none, it posts `cc-send --sender "Deploy notice"` with **every owner's display name in the opening list**. The first run is silent (the push-notice precedent). Plus the daily heartbeat alert (resolve the prior one, arm the next 26 h out). Added to `dt-install-drift`'s Helsinki manifest (file and units). | A-8 |
| **P9** | **OBJ-5:** `dt-deploy` + `dt-obs-windows` enter `dt-install-drift`'s staging manifest. The `deploy_windows` STATE check goes in (A-7). Install by hand at the reviewed sha **after 21:00Z, outside any registered window**, writing the override lines. sha256(installed) = sha256(`git show <sha>:<path>`), both from git objects or the installed file. Control: a deliberately altered copy under the harness `ROOT` prefix must report DRIFT. | A-5, A-6, D-1, D-2 |
| **P10** | **OBJ-4:** one line in `workflow-02-audit-and-plan` ("a batch whose verification reads an observation window files its `open` row in the Step-2 commit"); one line in `workflow-hotfix` §4 (`--in-window` when the deploy lands in a window); `workflow-06-deploy` usage plus exits 4, 5 and 6. Langston's gate line through `langston-memory-write`, paid for with an equal or larger cut, `--status` recorded before and after. NEW Claude files the first `open` rows. | A-10, A-11, C-5 |
| **P11** | **OBJ-6:** grep the interim wording at the ref; repoint each live reference to the register; leave dated history alone. | scope OBJ-6 |
| **P12** | **Tests.** (i) Parser: every good and bad shape in P1, each refusal mutation-checked (removing it must fail the suite; judged by exit code). (ii) Actor parity: `dt-deploy-actor-parity.test.ts` extended so the owner check uses the same canonical list. (iii) The sandbox harness for D-4 cases (a) absent, (b) malformed, (d) two open with one named, (e) worktree copy differs from HEAD's and HEAD's wins. Expected outputs written before the run. (iv) Watcher: a fixture record → the generated post is fed back through `address_list.opening_addressees`, which must return exactly the owner set; control: a record with `in_window=none` posts nothing. | A-1, A-2, A-8, C-1 |
| **P13** | **Verification (Step 7).** Live case (c): with NEW Claude's first window open, `dt-deploy <sha> --by cc-infra` without the flag must exit 5 before `git reset` (reflog unchanged). Wake leg (D-5): the installed watcher, fed a fixture record naming two owners who are running, posts live, and both watchers record `WAKE[Deploy notice …]`. The full chain at the first real in-window deploy. | D-4, D-5, J6(i) |

**Load-bearing claims NOT RE-READ by a fresh reader** (no reader was spawned this step, on cost; you are the second pass): A-4's process-name hazard, A-5's description of what `dt-install-drift` compares against, A-8's filter branch for a `Deploy notice` sender.

## Judgement calls I want attacked

- **J7 (new). The stale-window census lives in `dt-install-drift` as a STATE check.** It is the daily run you named, but its job until now is "is what was installed still what was reviewed". Mixing a governance check into it widens its purpose. The alternative is a `--census` mode on `dt-deploy` with its own timer, which is the new cron you ruled out.
- **J8 (new). Exit 6 after a successful deploy when the alert mint fails.** The deploy happened and the record is written, so the exit says only that something is owed. A caller treating any non-zero as "the deploy failed" would be wrong. The alternative, exit 0 with a loud line, is quieter than this case deserves.
- **D-1 itself.** Moving OBJ-5 from `daily_deploy_check.sh` to `dt-install-drift` changes the approved scope's mechanism. I think the existing checker is strictly better (it is already reviewed, scheduled and paging), but it is a change.
- **D-4.** The constants-block sandbox proves the installed logic on fixture data, not the installed tool against the real branch. Only case (c) runs fully live.

## Residuals (unchanged from scope §6)
(1) The unregistered window. (2) The unguarded deploy path: a hand `git reset` plus `pm2 restart`. Neither is closed. A third, from P1: a deleted register row cannot be detected at deploy time. Detecting that belongs to the governance checker (`B-GATE-GUARD`, `#744`).

## Plain-language summary
The audit found that the server already has a daily check of mine comparing installed tools with the reviewed code, and it already raises an alert when they differ. So instead of scheduling the old comparison script and building an alert for it, the plan adds the deploy tool to that existing check. The plan also confirms that adding three lines to the deploy record breaks none of the six things that read it. It found one trap to avoid: a server alert treats any running program with "dt-deploy" in its name as a deploy in progress, so the new helper gets a different name. And a notice posted from Helsinki under its own name wakes every window owner listed at its start, which the plan's test will confirm live.
