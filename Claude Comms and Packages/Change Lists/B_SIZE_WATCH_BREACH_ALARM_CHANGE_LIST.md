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
