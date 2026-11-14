# B-SIZE-WATCH-BREACH-ALARM — CHANGE LIST (Step 4)

**Graded ref: `b427f75584e6b2c0f3882b1c19ef5bad0bae3e6b`** (the Step-3 commit). CI run `43444457637` at that sha: TypeScript Check, Test Suite, Build, Docker Build all success.

## The dispatch header
| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (scope header) |
| ii | **that class's doc set** (`scripts/governance-checker/config.mjs:141-142`) | scope — **present** `Scope Files/B_SIZE_WATCH_BREACH_ALARM_SCOPE.md` · pre_audit — **present** `Scope Files/B_SIZE_WATCH_BREACH_ALARM_PRE_AUDIT.md` (r2, PROCEED) · completion_report — **absent**, owed at Step 11 · batch_catalog — **absent**, owed at Step 10 · phase_history — **absent**, owed at Step 10. Conditional and judged: `SYSTEM_IMPACT_MAP.md` applicable (Step 10), `DELETED_COMPONENTS_LOG.md` applicable and **present** in this commit, `SYSTEM_MANUAL.md` N/A (crew tooling, not trading architecture). |
| iii | **Step-2 reference** | `Scope Files/B_SIZE_WATCH_BREACH_ALARM_PRE_AUDIT.md`, PROCEED on r2 at `a99e43e73` (Discord `1570807421163536539`), recorded at `7362e4cc8` |

## Files at the ref
| file | change |
|---|---|
| `comms-infra/langston-memory/bin/langston-size-watch` | +174 / −… : the four condition rows, episodes, the drill row |
| `comms-infra/codex/coltrane-size-watch` | +184 / −… : the same rows over his key, a staging heartbeat, `cmd_heartbeat` removed |
| `comms-infra/systemd/coltrane-size-watch.service` | the `ExecStartPost=-… --heartbeat` line and its comment removed; `OnFailure=` untouched (drop-in) |
| `comms-infra/tools/verify-agent-artifacts.py` | `langston-size-watch` added to `PAIRS` |
| `comms-infra/langston-memory/bin/test_size_watch_alerts.py` | NEW — drives `run()` / `cmd_run()` against a fake store |
| `comms-infra/langston-memory/bin/mutate_size_watch_alerts.py` | NEW — 12 mutants |
| `1-system-manual/DELETED_COMPONENTS_LOG.md` + `_archive/deleted-code/coltrane-size-watch.cmd_heartbeat.20261113.removed` | the rule-18 record |

Nothing is installed yet. Both watches are hand-installed timers (Step 6), so no app deploy and nothing touches NEW Claude's 14:30-21:00Z window.

## Load-bearing code (line numbers at the ref)

**`langston-size-watch:343-363` — one condition, one key, one stored id.**
```python
def condition_alert(st, name, active, clean, title, body, evidence):
    field, key = CONDITION_ALERTS[name]
    prev = st.get(field)
    if active:
        new_id, failure = _alert_add(key, "warning", title, body)
        if not new_id:
            return failure          # the stored id (if any) is kept; the next run tries again
        st[field] = new_id
        save_state(st)              # C-3: persisted before anything else can fail
        return ("same %s" if new_id == prev else "new %s") % new_id
    if clean:
        if not prev:
            return "none"
        ok, note = _alert_resolve(prev, evidence)
        if ok:
            st[field] = None
            save_state(st)
        return note                 # a failed resolve keeps the id; the next clean run retries
    return ("not established - %s left as it is" % prev) if prev else "not established"
```
The add runs on every run while `active` (your BLOCKER-2). `_alert_resolve` treats "already resolved" and "not found" as discharged, the heartbeat's rule.

**`langston-size-watch:614-649` (inside `run()`, only when `injected_total is None`) — the four predicates.**
| condition | active | clean (resolves) |
|---|---|---|
| missing | `bool(missing)` | `not missing` |
| breach | `status == "BREACH"` | `status in ("UNDER", "AT-CEILING")` — **C-1**: a MISSING-FILE run is neither, so it touches nothing |
| archive | `archive["over"] or archive["unreadable"]` | `not over and not unreadable` |
| tamper | `bool(rules["tamper"])` | `not rules["tamper"] and tamper_established(rules)` |

⚠️ **One deliberate refinement of the plan's wording, for you to attack.** The plan said tamper resolves only when `unknown` is empty. But `rules_check` also appends to `unknown` when the **assertion-(3)** GitHub-head comparison cannot run (`:482` at the ref, a network failure), and that says nothing about tampering. So `tamper_established()` (`:386-390`) requires the install record to have been read **and** no `lsattr` unknown, which covers assertions (1) and (2), and ignores an assertion-(3) unknown. Fixture L9 covers both cases.

Every body ends with `stamp` = ` Measured <ts>; this row is NOT updated while the condition lasts - the live number is langston-size-watch --status on Helsinki, or its run log /opt/langston-memory/state/size-watch.jsonl. Owner CC-INFRA.` — **your Step-2 condition.** Fixture L1 asserts the timestamp, the live-read site, the owner and the per-file sizes are in the body.

**`langston-size-watch:365-384` — episodes.** Open on BREACH, peak updated, closed only on UNDER or AT-CEILING (a MISSING-FILE run leaves the episode alone); capped at 100 with the drop recorded in the run row (`episodes_note`).

**`langston-size-watch:392-401` + `:680` — the drill.** `--fire-drill` calls `run(..., drill_store=True)`, which adds and resolves one `info` row under `langston-size-watch-breach-drill`; a failed drill resolve makes `run()` return 3, so `--fire-drill` exits 1. A real key is never touched by a drill (fixture L8, mutant 5).

**`coltrane-size-watch:127-139` — his own key.**
```python
cmd = ["sudo", "-u", "coltrane", "ssh", "-i", STAGING_KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
       "-o", "ConnectTimeout=25", STAGING_HOST, inner]     # inner = STAGING_CMD + shlex.quote(each arg)
```
`cwd="/home/coltrane"` on the `subprocess.run`, so the sudo'd ssh never inherits root's unreadable working directory.

**`coltrane-size-watch:197-224` — the heartbeat.** It resolves the prior, and on a failed resolve returns **without** re-arming, because the add would collapse onto the unresolved row and keep its old fire time. Then it arms 26 h out with `--triggers-at`.

**`coltrane-size-watch:274-345` — `cmd_run`.** On a MISSING file it raises the missing row, leaves the breach row alone and still arms the heartbeat (the run happened), then exits 4. Otherwise it resolves the missing row, raises or resolves the breach, and heartbeats. `store = getattr(a, "store", True)`; the self-test's `Args` sets `store = False` (`:366`), so the self-test never writes to the shared store (fixture CS, mutant 12).

**REMOVED** (archive file at the ref): `cmd_heartbeat`, `--heartbeat`, and the unit's `ExecStartPost=-…--heartbeat`.

## Evidence
- **Tests at the exact ref**, on Helsinki, from `/root/b-sizewatch/ref` (each file `git show b427f7558:<path>`, and `git hash-object --no-filters` on the box equals the ref blob: `langston-size-watch` `7ac67e3f…`, `coltrane-size-watch` `3e3809f7…`, test `1df47d97…`): **67 passed, 0 failed.**
- **Mutations at the exact ref:** **12/12 caught by an assertion, 0 crashed or unapplied.** Each mutant's first FAIL line:

| mutant | caught by |
|---|---|
| the breach add is dropped | L1 exactly one breach row exists |
| C-1: resolve on `over <= 0` | L4 the breach id is NOT cleared |
| C-2: missing shares the breach key | L4 a missing-file row is raised |
| C-3: the immediate save is dropped | C3 the breach id was persisted before the crash |
| (b): the drill writes the real key | L8 the drill row exists and is resolved |
| BLOCKER-2: skip the add while an id is stored | L2 a second over run still calls add |
| tamper resolves while lsattr could not answer | L9 tamper NOT resolved while lsattr could not answer |
| an episode closes on a missing-file run | L4 the open episode is NOT closed |
| the cap drops silently | G the run row says an episode was dropped |
| Coltrane: skip the add while an id is stored | C2a after a hand-resolve a new breach row exists |
| Coltrane: the heartbeat re-arms after a failed resolve | C11 and does NOT attempt a re-arm |
| Coltrane: the self-test writes to the store | CS the self-test wrote nothing to the alert store |

- **A weak test my own mutation run found, and fixed before this ref:** the first version of C11 asserted only the heartbeat **row count**. A wrong re-arm collapses onto the unresolved row (same id, old fire time), so the count could not change and that mutant survived (11/12). C11 now also asserts that **no re-arm `add` was attempted**, and the mutant is caught.
- **`read_ratchet()` (R10):** `langston-memory-write`, loaded with `LANGSTON_HOME` and `LMW_RATCHET_STATE` pointed at a state file the watch wrote with the new fields, reads `ceiling_bytes` 1000 and returns no `unknown`.
- FakeStore reproduces exactly two behaviours of `addAlert` (`server/services/system-alerts.ts:576-585`, `:380-382`), and its docstring says so. If the real store changes either, these fixtures stop describing production.

## Judgement calls I want attacked
1. `tamper_established()` (above): is "record read and lsattr answered" the right definition of "assertions (1)-(2) ran"?
2. Coltrane's missing-file run still arms the heartbeat. My reason: the watch did run, and the heartbeat's subject is "the watch is down", not "the watch found a fault"; the missing row carries the fault.
3. The episode timestamp comes from `iso()` at the condition block, a second or so before the row's own `ts`. Should it be the row's `ts` exactly?

**STEP: 4 of 11 — this is the review.**

---

## r2 — Langston CHANGES-NEEDED on `b427f7558` (Discord `1570813707393573050`), fixed at graded ref **`0bbe866b6d9dede34472a493ba7d0f50c8609097`**

CI run `43447612279` at that sha: TypeScript Check, Test Suite, Build, Docker Build all success.

**BLOCKER — fixed.** `_not_found(rc, err, alert_id)` (`langston-size-watch:231-236`, `coltrane-size-watch:164-169`) is the ONE discharge test: `rc == 1` and a stderr line equal to `Alert <id> not found`, the CLI's own shape (`scripts/system-alerts.ts` cmdResolve, `console.error(\`Alert ${id} not found\`); process.exit(1)`).
- `_alert_resolve` (`:340`; Coltrane `:172`) uses it. **The `already` arm is deleted**, because `resolveAlert` has no state guard and a re-resolve exits 0.
- **The same defect in the original heartbeat** (`:268`, previously the `blob` scan) is fixed the same way. You claimed only the clean branch, but it is one shape and one helper now.

**FakeStore now models resolve faithfully** (its docstring says what it models and that the first version got this wrong):
- a re-resolve of a resolved row → exit 0;
- an unknown id → exit 1 with `Alert <id> not found`;
- a transport failure → its own error string.

New and changed fixtures:
- **L6** drives your four transport strings (`cd: … No such file or directory`, `bash: npm: command not found`, `sudo: ssh: command not found`, `ssh: … Connection timed out`). Each must keep the stored id.
- **L7** is now a real hand-resolve (exit 0), and **L7b** a deleted row (exact not-found shape), both discharged.
- C11 and L8's failure modes use real strings.

**PAIRS — added** (`verify-agent-artifacts.py`): `coltrane-size-watch.service`, `langston-size-watch.service`, and each one's drop-in mapped to the shared `comms-infra/systemd/onfailure.conf`.

**Your call 1, the hole beside it — fixed.** `lsattr` is guarded on its own (`:483-487`), so a missing binary lands in `unknown` and the content or mode mismatches already found are kept. An absent rules file reads `<path> does not exist` (`:456`), not as a link attack. Fixture **LR** covers both.

**Your call 3 — fixed.** One `run_ts = iso()` at the top of `run()` (`:506`) feeds the row's `ts`, every body's `Measured`, the episode, and `last_run_ts` (which takes the row's).

**Evidence at the exact ref,** on Helsinki (`/root/b-sizewatch/ref2`; each file `git show 0bbe866b6:<path>`, and `git hash-object --no-filters` on the box equals the ref blob for all five):
- tests **75 passed, 0 failed**;
- mutations **15/15 caught by an assertion, 0 crashed or unapplied**. The three new mutants are the broad discharge scan, an `lsattr` guard that catches the wrong exception, and the ENOENT branch removed. Each fails on its own fixture.

**STEP: 4 of 11 — r2 for review.**

## Step 4 r2 — PROCEED (Langston, Discord `1570818119545520294`), with one finding folded in before the install
- **His own positive control:** a real resolve of an unknown id over the production transport → rc 1, empty stdout, stderr exactly `Alert 00000000-0000-0000-0000-000000000000 not found`. He re-ran the tests (75/0) and the mutants (15/15) himself from the ref blobs. The r1→r2 delta is only the four items.
- **Folded (his §13 disposition 1):** Coltrane's missing-file run exits 4, outside his unit's `SuccessExitStatus=0 1`, so the drop-in `onfailure.conf` would ALSO page "the watch failed" for a run that worked: two pages for one condition. `coltrane-size-watch.service` now says `SuccessExitStatus=0 1 4` (a crash still exits 2 and pages). Langston's unit comment claimed "Parity with coltrane-size-watch.service", which is false for exit 4, so it is corrected in the comment only (his missing file exits 1, so `0 1` is the same rule there).
- Cosmetic, recorded: the ENOENT line is `:457`, not `:456`.

## Step 5 — CI green at the install ref
`8a2cdefbb594754422fac1b5395d47a7ec8b9e30`, run `43450215613`: TypeScript Check, Test Suite, Build, Docker Build all success.

## Step 6 — installed 2026-11-13 ~15:16Z (Infra Claude), Helsinki only; no app deploy, no restart of anything that trades
- **Files** (`git show 8a2cdefbb:<path>` staged in `/root/b-sizewatch/inst`, each `git hash-object --no-filters` equal to its ref blob before install; installed with `install -o root -g root`, mode 0755 scripts / 0644 units):

| file | before | after |
|---|---|---|
| `/usr/local/bin/langston-size-watch` | `336f8e9a…` (= the old repo blob, no prior drift) | `818a5d89…` |
| `/usr/local/bin/coltrane-size-watch` | `ac244b69…` (the A8 drift) | `ded9da66…` — **ends the drift; transferred from B-CREW-ACCESS-HARDEN, noted in its change list** |
| `/etc/systemd/system/langston-size-watch.service` | `6a4ebdae…` | `8f2ce658…` (comment only) |
| `/etc/systemd/system/coltrane-size-watch.service` | `5e79dd9e…` | `80f7ce6f…` |

- **Retired, not deleted:** all four old copies plus the stale `langston-size-watch.service.pre-successexit-20260911` moved to `/root/deploy-retired/20261113T151620Z-size-watch/`. `systemctl daemon-reload`.
- **Read back:** `coltrane-size-watch.service` `SuccessExitStatus=0 1 4`, no `ExecStartPost`, `OnFailure=agent-unit-failure@coltrane-size-watch.service`. `langston-size-watch.service` `SuccessExitStatus=0 1`, `OnFailure=agent-unit-failure@langston-size-watch.service`. The drop-ins are untouched.
- **`verify-agent-artifacts.py 8a2cdefbb`:** both scripts, both units and both drop-ins (mapped to `systemd/onfailure.conf`) MATCH. `match 23 | DIFFER 2 | missing 0`; the 2 are `AGENT_AUTHORING_GUIDE.md`, B-CREW-ACCESS-HARDEN's, and the tool's own positive control printed "DIFFERS — comparator works".
- The timers were inactive at install (next runs 2026-11-14 05:41Z / 05:50Z), so no run raced the install.

## Step 7 — first-pass live verification
- **`langston-size-watch --fire-drill`** (15:16:52Z): exit 0. The Discord drill post `delivery: sent`. **Drill row `9f2d9024-1710-48c2-9e1f-4574510cd961`** under `langston-size-watch-breach-drill`, `info`, read back from the staging store as `resolved` by `cc-infra`, evidence its own id. `alerts: {}` (a drill touches no real key) and `heartbeat: skipped (drill)`.
- **One real run of each through its unit** (`systemctl start`): both `Result=success`, `ExecMainStatus=0`.
  - Langston, run row `2026-11-13T15:17:04Z`: `UNDER`, `alerts {missing: none, breach: none, archive: none, tamper: none}`, heartbeat `resolved c2dcb922…; armed 93dbb56c-06d1-467a-8d4a-bb9f7f53bcf4 for 2026-11-14T17:17:06Z`.
  - Coltrane, run row `2026-11-13T15:17:07Z`: `UNDER`, `alerts {missing: none, breach: none}`, **his first staging heartbeat** `armed aa78ec84-a761-450e-85a7-56b0a0d6bdde for 2026-11-14T17:17:07Z`.
- **Store census of the new keys** (whole file, 3,216 ids): 3 rows. `coltrane-size-watch-write-probe` resolved (the Step-2 probe), `langston-size-watch-breach-drill` resolved, `coltrane-size-watch-heartbeat` scheduled; Langston's heartbeat `93dbb56c` is scheduled. **No row under any real condition key**, which is right on an UNDER day. The same query found the drill and both heartbeats, so its silence on the real keys is not blind.
- **Not reachable live, stated (P7):** a real breach, a missing file, an archive over 500 MiB and a tamper cannot be produced on demand and must not be forced. The real keys' add and resolve are shown by the drill (same helper, different key) plus fixtures L1-L9, LA, LR and C1-C5. The re-mint after a hand-resolve is carried by fixtures 2a and C2a alone.
- **The first SCHEDULED runs (2026-11-14), read 06:02Z — each timer, not my hand, resolved its heartbeat and re-armed:**
  - `langston-size-watch.timer` fired 05:40:05Z; the service finished `Deactivated successfully`. Run row: `status UNDER`, `total_bytes 143646`, `ceiling_bytes 143856`, `alerts {missing: none, breach: none, archive: none, tamper: none}`, `drill_alert null`, heartbeat `resolved 93dbb56c-06d1-467a-8d4a-bb9f7f53bcf4; armed da0f0d23-1789-48ac-97b2-858c250bd216 for 2026-11-15T07:40:07Z`.
  - `coltrane-size-watch.timer` fired 05:51:07Z; same. Row `/opt/coltrane-memory/size-watch.jsonl` line `2026-11-14T05:51:07Z`: `UNDER`, `14437` against `15118`, `alerts {missing: none, breach: none}`, heartbeat `resolved aa78ec84-a761-450e-85a7-56b0a0d6bdde; armed f7ef1287-4d72-45f4-8f3a-76aed729cf24 for 2026-11-15T07:51:08Z`. The journal shows the resolve and the add both going over his own staging key (`id_ed25519_staging`, `--by cc-infra`).
  - **Read back from the staging store** (whole file, merged by id): `93dbb56c` resolved 05:40:07.652Z, `aa78ec84` resolved 05:51:08.486Z, `da0f0d23` and `f7ef1287` scheduled for 11-15. Neither prior heartbeat fired: both were resolved ~11h25m before their 17:17Z trigger, as designed.
  - The failure-page units `agent-unit-failure@{langston,coltrane}-size-watch.service` have no entries since 05:30Z.
  - Reminder alert `37c776a5` resolved by `cc-infra` with this evidence.

**STEP: 7 of 11 · NEXT STEP: 8 of 11** — Langston's independent second pass.
