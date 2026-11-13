# B-SIZE-WATCH-BREACH-ALARM — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN — r1

change-class: non_architecture · owner Infra Claude (CC-INFRA) · scope r1 + Step-1 ruling at `ca92bcc80` (`Scope Files/B_SIZE_WATCH_BREACH_ALARM_SCOPE.md` §6) · written 2026-11-13

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope §0): "55 real BREACH runs … a floor; whether any older file was already dropped is NOT established." NOW: the retained log starts 2026-09-13T05:41:58Z against the 2026-09-05 seed, so roughly 8 days of runs are already gone (Langston's measurement, §6). REASON: the floor now has a measured bound; 55 stays a floor.**
- **PREVIOUSLY STATED (scope §2 OBJ-3): Coltrane's alarm goes "through his own staging access", an untested claim. NOW: proven — see A6. REASON: Langston's condition (d)(i).**
- **PREVIOUSLY STATED (scope §0): "Coltrane's watch has neither alarm." NOW: it HAS a liveness check, but one that cannot fire — see A5. REASON: read in full for this audit.**

## SOURCES READ (the six, named)
1. **Code**, at `origin/migration/aws-supabase` (`ca92bcc80`): `comms-infra/langston-memory/bin/langston-size-watch` (all 690 lines), `comms-infra/codex/coltrane-size-watch` (all 333), both units in `comms-infra/systemd/`, `langston-memory-write` `read_ratchet()` (`:856-890`), `server/services/system-alerts.ts` (`shouldDeliverToDiscord` `:131-134`, `ALWAYS_DELIVER_CATEGORIES` `:121-124`), `comms-infra/tools/verify-agent-artifacts.py` `PAIRS`.
2. **Runtime + store:** Helsinki run logs and state (scope §0), the staging alert store, and the live probe in A6.
3. **`SYSTEM_IMPACT_MAP.md`:** the Langston-memory block (`:4075-4095`), the `langston-privacy-check` block (`:4035-4050`) as the model for an out-of-process alert writer, and the drift monitor's `dedupe_key` row (`:4021`).
4. **`SYSTEM_MANUAL.md`:** silent on both watches. Judged correct, not a gap: they are crew tooling, not trading architecture.
5. **Ledger:** `RUNNING_ISSUES.md` `#1215` (the finding and its 2026-11-05 correction), `#1007` (the ratchet rule), `#979` (shared `/tmp`).
6. **`bridge/canonical/`:** no coverage (both tools are from 2026-09). Recorded as consulted.

---

## PART A — THE AUDIT

**A1 — Who WRITES, READS, MUTATES, DELETES and SCHEDULES each object (§9.5(a) census, tests excluded).**

| object | writes | reads | deletes | schedules |
|---|---|---|---|---|
| `/opt/langston-memory/state/ratchet-state.json` | `langston-size-watch` only (`save_state`, `:151-159`) | the watch; **`langston-memory-write` `read_ratchet()`** (reads `ceiling_bytes` and `watched` only, `:877-890`) | nobody | — |
| `/opt/langston-memory/state/size-watch.jsonl` | the watch (`:503-508`) | humans; logrotate `comms-infra/langston-memory/logrotate/langston-state` (weekly, 8 kept) | logrotate | — |
| staging alert rows for the watch | the watch via `_alerts()` over `sudo -u langston ssh staging` (`:178-204`) | every session's §10.5 read; the dispatcher | **nothing deletes from the store** (SIM `:4032`) | `langston-size-watch.timer`, daily ~05:40Z |
| `/opt/coltrane-memory/ratchet-state.json` | `coltrane-size-watch` only | the watch only (no other reader in the repo; census by `git grep`) | nobody | `coltrane-size-watch.timer`, daily ~05:50Z |

⇒ **Exactly one writer per state file; exactly one non-watch reader (`read_ratchet`).** That reader takes two keys and ignores the rest, so new fields are additive and safe (Risk 3 in the scope is discharged by reading, and the plan still adds a test).

**A2 — The breach path today (Langston's, re-stated with lines).** Status ladder `:413-420` (MISSING-FILE before BREACH); alarm text `:429-446`; delivery `post()` only (`:448`). The only alert written is the heartbeat (`:253-265`, key `:95`). **No alert row has ever had a breach subject** (Langston, 75 of 75 rows under the heartbeat key).

**A3 — The two other unalerted posts (ruling (c)).** The archive alarm (`:450-458`: over its 500 MiB threshold, or a file it could not measure) and the rules-file tamper alarm (`:479-484`: assertions (1) and (2) only). Both go only to `post()`. The tamper check also reports assertion (3), "PENDING", in the run row only (`:286-290`), and that stays as it is.

**A4 — The facts the C-conditions rest on.**
- **C-1:** `measure()` leaves a missing file out of `total` (`:112-123`), so on a run with a missing file, `total - ceiling` can be ≤ 0. Only the status ladder (`:413`, MISSING-FILE checked first) stops that run reading as UNDER. A resolve keyed on the over-test alone would fire with the file still missing.
- **C-2:** `addAlert` returns the EXISTING row on a dedupe hit (the heartbeat's own comment `:241-247`; SIM `:4047`, which records the same behaviour for the privacy check). With one shared key, the row's title stays whatever the first event was.
- **C-3:** resolve needs the full uuid. The heartbeat keeps `heartbeat_alert_id` in state and saves at once (`:266-274`) because a crash between the add and the save would orphan a live row.
- **The resolve evidence must be a reference token, not prose** (`:215-224`, measured 2026-09-06). The heartbeat uses the run-log line this run is about to write (`RUNLOG:N`); the same form works here.

**A5 — Coltrane's liveness check cannot fire.** `cmd_heartbeat` (`coltrane-size-watch:272-293`) alarms if the last run is more than `HEARTBEAT_HOURS` old, but its only caller is `ExecStartPost=-…--heartbeat` in the SAME unit (`coltrane-size-watch.service:11`). It runs only when the watch has just run, so the age is always about zero. A dead timer runs nothing, including this check. **This is the self-attesting shape `9e8bbd69b` named for Langston: "a watchdog that can only bark while it is alive is not a watchdog."** Also: a MISSING file exits **4** (`cmd_run`, `coltrane-size-watch:170`), which the unit (`SuccessExitStatus=0 1`, no `OnFailure=`) marks as failed with nothing listening, so it is silent apart from the Discord post.

**A6 — Coltrane's staging write access: PROVEN, measured 2026-11-13 ~14:15Z.** As `coltrane`, with `/home/coltrane/.ssh/id_ed25519_staging` to `deploy@188.245.193.8`: `add` (category `health_check`, `info`, `triggers_at 2030-01-01T00:00:00Z` so it could not fire, dedupe key `coltrane-size-watch-write-probe`) → rc 0, id `f8443eef-8075-4535-9490-635a8a4350d3`; `resolve … --by cc-infra` → rc 0; the store reads `resolved`, `resolved_by_claimed cc-infra`, `resolved_by_transport cli`. Coltrane has no `Host staging` alias (his ssh config names only the agent-work repo), so his path names the key and host explicitly. ⇒ **OBJ-3 is not blocked on a key change.** ⚠️ **What this does NOT show:** that this is the right grant. `deploy` is a full account and its intended reviewer use is read-only (`CLAUDE.md` §8, `#110`). Using his key for alert writes widens its actual use, though not its access. Stated, not decided here — judgement call (e).

**A7 — Delivery and severity.** `shouldDeliverToDiscord` posts `warning` and `critical`, plus any `governance` or `breakage` row (`system-alerts.ts:131-134`). A `health_check` `warning` therefore posts to `#general` when it fires, and Langston's bridge triages webhook posts. An `info` `health_check` row does not post, but is still listed in every session's §10.5 read.

**A8 — Install path and drift.**
- Neither watch goes through `deploy.sh`. Both are hand-installed (sha256 = blob).
- `verify-agent-artifacts.py` checks `coltrane-size-watch` and says it does NOT cover `langston-size-watch` (`:44`).
- **Measured divergence (Langston's):** installed `coltrane-size-watch` blob `ac244b69…` vs repo `e7f49690…`, header prose only. This batch's install replaces it with the repo version, which ends the divergence; the Step-6 record states the old and new blobs.

**A9 — Provenance:** scope §1 (Langston's tool `f2a90077a`, its heartbeat `9e8bbd69b`). Coltrane's watch is from 2026-09-09; its header (`:5-17`) states the alert path was deliberately not ported, and the 2026-10-15 key update removed that reason. **Dispositions:** both tools (2) relevant, update to today's intent; Coltrane's `cmd_heartbeat` and its `ExecStartPost` line (4) connected but should be REMOVED, because they can never fire → rule 18, deleted in this batch with a `DELETED_COMPONENTS_LOG` row.

**A10 — Gaps in the maps (flagged).** `SYSTEM_IMPACT_MAP.md` has no block for either size watch as an out-of-process writer of staging alert rows. Langston's heartbeat has written one daily since 2026-09-06 and appears only in passing (`:4093`). Coltrane's watch is absent. Step 10 writes a block covering both (the privacy-check block is the model).

---

## PART B — THE PLAN (each item → its finding)

**P1 — one alert helper in `langston-size-watch`, used by every alarm** (A2, A3, A4-C-2/C-3). `_condition_alert(st, key, active, title, body, resolve_ok, evidence)`, keyed by a dict of `(state field, dedupe key)`:
| condition | dedupe key | severity / category | state field |
|---|---|---|---|
| load set over its ceiling | `langston-size-watch-breach` | `warning` / `health_check` | `breach_alert_id` |
| a watched file missing | `langston-size-watch-missing-file` | `warning` / `health_check` | `missing_alert_id` |
| archive over threshold or unreadable | `langston-size-watch-archive` | `warning` / `health_check` | `archive_alert_id` |
| rules file tamper, assertions (1)-(2) | `langston-rules-tamper` | `warning` / `health_check` | `rules_tamper_alert_id` |
- **Add:** when the condition holds and no id is stored. `triggers_at` = now, so the next dispatcher tick promotes and posts it. The id is saved **immediately** after the add (C-3). Every body carries the numbers, the per-file sizes (so the reader sees which file grew), **the owner (CC-INFRA)** and the **action that discharges it** (Langston's minors).
- **Already open** (an id is stored and the condition still holds): no add; the run row records `still open <id>`.
- **Resolve** only on positive evidence of the clean state (**C-1**): breach on `status in ("UNDER", "AT-CEILING")`; missing-file on `missing == []`; archive on `not over and not unreadable`; tamper on `tamper == []` **AND** the rules check actually ran (`unknown` empty). **A run that could not establish the clean state resolves nothing.** Evidence = `RUNLOG:<line this run writes>` (A4). On success the stored id is cleared and saved.
- **Failed resolve:** the id is kept, the run row records the failure, and the next run retries. No re-add while an id is stored, so nothing collapses onto a stale row (A4-C-2).
- **An already-resolved or missing prior counts as discharged**, the same rule as the heartbeat (`:229-237`), so a human's hand-resolve never latches the tool.
- The Discord posts stay as they are (they are the immediate signal; the row is what the §10.5 read sees).

**P2 — breach episodes in state** (OBJ-2; A1 says additive is safe). `breach_episodes: [{start, end|null, peak_over, peak_total}]`. A breach run opens an episode or updates its peak; the first UNDER or AT-CEILING run closes it (C-1 predicate again); a MISSING-FILE run leaves it unchanged, because the total is not trustworthy. Cap: the last 100 episodes kept in state, and older ones are not lost because the run log keeps them. `--status` prints `history` and `breach_episodes`.

**P3 — the drill under its own key** (ruling (b)). `--fire-drill` additionally adds a row under `langston-size-watch-breach-drill` (`info`, title starting `DRILL`), resolves it in the same run, **asserts the resolve returned 0 and exits non-zero otherwise**, and writes the drill row id into the run row. A drill never reads or writes `breach_alert_id`. The real key is never touched by a drill, and the existing `injected_total` short-circuit (`:485`) is kept for the heartbeat.

**P4 — Coltrane: the same helper and a real heartbeat** (OBJ-3 and the folded liveness, A5, A6).
- `coltrane-size-watch` gains `_alerts()` over `sudo -u coltrane ssh -i /home/coltrane/.ssh/id_ed25519_staging -o IdentitiesOnly=yes -o BatchMode=yes deploy@188.245.193.8`, with `shlex.quote` (Langston's BLOCKER-3 lesson).
- Keys `coltrane-size-watch-breach`, `coltrane-size-watch-missing-file`, and **`coltrane-size-watch-heartbeat`**: each run resolves the pending heartbeat and arms the next 26 h out, the same discipline as `heartbeat()` (`:207-280`), including refusing to re-arm on a failed resolve.
- **Deleted:** `cmd_heartbeat` and the `ExecStartPost` line (A5, rule 18), archived under `_archive/deleted-code/` with a `DELETED_COMPONENTS_LOG` row.
- The MISSING exit stays 4. The row now carries it, and the unit gains `OnFailure=agent-unit-failure@%N.service` as the privacy check's unit has it (`langston-privacy-check.service:7`), so a crash pages.
- ⚠️ **Coltrane is OFF in Claude mode**, but the watch is a root timer, not his bot. It runs either way, and the probe in A6 ran in Claude mode.

**P5 — tests that drive the production entry** (CONDUCT §6b; my standing lesson). A new `test_size_watch_alerts.py` for each tool runs `run()` / `cmd_run()` with `_alerts` replaced by a recorder and the state and run-log paths redirected to a private directory (never `/tmp`, `#979`). Cases, with expected outcomes written before running:
1. over → one add on `…-breach`, id saved;
2. over again → no add;
3. under → resolve with `RUNLOG:N` evidence, id cleared, episode closed;
4. **file missing with total under the ceiling → missing-file add, NO breach resolve** (C-1's fixture);
5. file restored, set still over → missing-file resolved, breach still open (C-2);
6. resolve fails → id kept, no add next run;
7. prior already resolved by hand → discharged;
8. drill → drill key only, real id untouched, non-zero exit if its resolve fails;
9. tamper with `unknown` set → no resolve;
10. `read_ratchet()` reads a state file carrying the new fields unchanged;
11. Coltrane heartbeat → resolve-then-arm, with re-arm skipped on a failed resolve.
- **Mutations, judged by exit code with each mutant verified applied:** drop the add · resolve on `over <= 0` · share one key between breach and missing-file · drop the immediate save · let a drill write the real key.

**P6 — install (Step 6), hand-installed as today** (A8). Both scripts and the Coltrane unit, each `git hash-object --no-filters` = blob at the reviewed ref, with old and new blobs recorded (ending A8's divergence). `systemctl daemon-reload`. No restart is needed: both are timers. `langston-size-watch` is added to `verify-agent-artifacts.py` `PAIRS` (A8 gap).

**P7 — live checks (Step 7).**
- Each tool's `--fire-drill`: one drill row added and resolved, read back from the store and enumerated at close.
- The next scheduled runs: on an UNDER day, run rows show `no breach row needed`, the heartbeats re-armed, and no breach key active. ⚠️ **A real breach cannot be produced on demand and must not be forced.** The live add-and-resolve of the real keys is therefore shown only by the drill path (same helper, different key) plus the fixtures. That is stated as the limit, not claimed as more.

**P8 — governance (Step 10)** (A10, Langston's minors).
- `SYSTEM_IMPACT_MAP.md`: one block for both watches as alert writers, with keys, state fields and failure modes.
- `LANGSTON_ARCHITECTURE.md`: the size-watch line and its change log.
- `DELETED_COMPONENTS_LOG.md`: `cmd_heartbeat`.
- `RUNNING_ISSUES.md` `#1215`: closed.
- `SPRINT_TO_LIVE_PLAN.md` row 10, plus the class's Tier-1 set.

**No item is UNAUDITED.**

## JUDGEMENT CALLS FOR THIS GATE
- **(e)** Using Coltrane's reviewer staging key to write alerts (A6). It works, and widens how the key is used without widening what it can reach. The alternative is routing Coltrane's alerts through Langston's path, which ties his watch's alarms to the other reviewer's key. I propose his own key.
- **(f)** All four Langston keys at `warning`, so they post (A7). An archive-over or tamper event is rare and wants a person; `info` would sit silently in the §10.5 list.
- **(g)** The 100-episode cap on `breach_episodes` (P2). In 2 months there have been 55+ breach runs but very few distinct episodes, so 100 is years of history.

## BOOKKEEPING
I resolved `gov-staleopen:B-DISK-HEADROOM` (`222b57b4`) at ~14:00Z with evidence `7b3cb3a2b` (the commit that armed the 12-01 carrier), following the precedent of the earlier stale-open nags (resolved with a sha). That was before Langston's routing line said "leave active, do not ack". The batch stays declared open at `GOVERNANCE_EXCEPTIONS:30`; if the checker re-raises it, I will leave it active.

**STEP: 2 of 11 — this document is the gate.**
