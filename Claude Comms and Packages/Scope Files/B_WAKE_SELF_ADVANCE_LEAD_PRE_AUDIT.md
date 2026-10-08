# B-WAKE-SELF-ADVANCE-LEAD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1 — APPROVED by Langston 2026-10-08, PROCEED with two conditions, folded below)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1v · **Issue:** `#1177` · **Scope:** r2 `68af4ccbf` (r1 `c71170fbb` APPROVED by Langston 2026-10-08 with conditions 1-2, folded in r2).
All `path:line` at `origin/migration/aws-supabase` `d2a1f903f`.

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope r2 OBJ-1): "Runs in CI." NOW: it does not run in CI today — this batch adds the step.** REASON: `.github/workflows/ci.yml` runs `test-wake-filter-cuts.py` (`:155`) but NOT `comms-infra/discord/langston_queue_test.py`; and that suite cannot run on Windows (`langston_queue.py` imports `fcntl`), so CI on Linux is its only grader.
- **PREVIOUSLY STATED (scope r2 §2): the recipient rule stays in the bridge. NOW: it moves to `langston_queue.py` as a pure function.** REASON: the bridge loads tokens and config at import (`discord-langston-bridge.py:108-110`), so no test can import it; `langston_queue.py` is pure and already has a suite.

## 1. AUDIT

### A. The addressee is resolved in one place and the queue stores something else (code, source 1)
- `resolve_recipient_name(task)` (`discord-langston-bridge.py:97-106`): `Kyle` when `author_id == CFG["kyle_id"]`, else `author_display or author_name`, stripped.
- Enqueue (`:447`) stores `requester = task.get("author_display") or task.get("author_name", "?")` — the RAW field, not the resolver's output. ⇒ a Kyle item stores his username.
- **Live queue** (`/home/langston/.langston-review-queue.json`, read 2026-10-08 ~04:00Z): 677 items — `NEW Claude` 221 · `OLD Claude` 217 · `ANALYST Claude` 188 · `Infra Claude` 40 · `Claude Analyst` 8 · `kylegjordan` 3. States: done 626 · noop 30 · blocked 21 (none ready at the read).

**The size of it (Langston condition 2; his read, 2026-06-22 → 2026-10-07, `kind=langston_outbound`): 421 of 6,308 replies open `self-advance`** — the replies whose opening name could wake nobody. Positive control on the same read: 1,502 open `NEW Claude`, 1,047 `OLD Claude`. ⚠️ **A ceiling, not a count of lost wakes:** an explicit `@CC-WAKE` still delivers (filter branch (a)), and before `6f14d6a12` (2026-09-30) a name anywhere woke (scope r2 §0: 2 of 2 lost since that cut).

### B. The self-advance task carries a label, not an addressee (code)
`_self_advance` (`:283-326`) queues `author_name/author_display: "self-advance"`, `author_id: None`, `self_advance: True` (`:322-325`). At post time (`:554-557`) `resolve_recipient_name` returns `self-advance` and the reply opens `self-advance — `.

### C. The prefix guard and the marker (code)
`:556`: the prefix is skipped when `cleaned[:len(recipient)+2]` already starts with the recipient (case-insensitive). Langston's own replies to a queue item often open `**OLD Claude —**` (bold) — that does NOT start with `OLD Claude`, so the bridge will prefix it (a doubled name, display only, out of scope §4).

### D. Census of the field (§9.5(a)) — repo-wide `git grep` at the ref, plus the Helsinki install
| question | `requester` | `resolve_recipient_name` |
|---|---|---|
| writes | ONE: `discord-langston-bridge.py:447` (via `lq.new_item`, `langston_queue.py:93-101`) | — |
| reads | ONE: the self-advance prompt `:318` (`from {requester}`) | ONE call site: `:555` |
| on Helsinki outside the repo | none (`/usr/local/bin`, `/opt/discord-bridges/*.py`, Langston's files: only doc copies of `RUNNING_ISSUES` match) | — |
| deletes / mutates | none (items are marked by `id`, never by requester) | — |
**Entry points into `_self_advance`: one** — the call at `:621`, after a reply is settled, behind `SELF_ADVANCE_ENABLED` and not for alerts (`:620`); it picks only `state=ready` items (`langston_queue.py:249-254`). Exactly one; said so.

### E. The install surface (source 2, measured on Helsinki)
| file | live sha256 | blob at the ref | |
|---|---|---|---|
| `discord-langston-bridge.py` | `29074992…` | `bb97931a…` | **behind** — live = blob at `5ec1a8227` (Infra Claude, measured); the gap is `B-CREDENTIALS-PRIVATE-REPO` OBJ-4a P4 |
| `langston_queue.py` | `33bd4af5…` | `33bd4af5…` | equal |
| `discord_common.py`, `discord-cc-bridge.py` | equal | equal | untouched by this batch |
| `deploy.sh` (the installer) | `6ca16eea…` | `f907b1d7…` | differs — not run by this batch (§F) |

### F. Out-of-scope finding — the installed `deploy.sh` is not the repo's
The installer on the box differs from the repo copy. This batch does not run it (OBJ-3 copies two files), so it does not bear on the result. **DISPOSITION: added to `B-CREDENTIALS-PRIVATE-REPO` (Infra Claude) — their GB-8 bridges increment owns the installer;** told to Infra Claude in the install-coordination thread.

### G. Sources read
1 code (above) · 2 live queue file, installed shas, the inbox log (scope r2 §0) · 3 SIM "Discord Comms Fabric" (`SYSTEM_IMPACT_MAP.md:2848`; its bridge row says the reply "auto-leads with addressee" — silent on self-advance: **a governance gap, closed by OBJ-5**) · 4 System Manual: N/A, no trading component · 5 ledger + reports: `#1040` (B-WAKE-LEAD-NAME), `B-TOKEN-BURN-CUT` am. 1 OBJ-5, `B_LANGSTON_QUEUE_COMPLETION_REPORT.md`, `#1004` (the install class) · 6 `bridge/canonical/`: not applicable — the bridge and the queue post-date the 2026-01/02 change (built 2026-06-20/22).

## 2. PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| **P1** | `langston_queue.recipient_name(task, kyle_id)` — pure: `task["addressee"]` when non-empty → else `Kyle` when `author_id == kyle_id` → else `author_display or author_name`, stripped. The bridge's `resolve_recipient_name(task)` becomes a one-line call to it with `CFG.get("kyle_id")`. | A, B |
| **P2** | Enqueue (`:447`) stores `requester = resolve_recipient_name(task)` (fallback `"?"` kept). A Kyle item stores `Kyle`. Existing items are not rewritten. | A (Langston condition 2) |
| **P3** | `_self_advance` adds `"addressee": nxt["requester"]` to the queued task. | B |
| **P4** | Prefix: when `task.get("self_advance")` the added prefix is `"{recipient} — (self-advance) "`; otherwise unchanged. Guard `:556` unchanged (so the marker appears only when the bridge adds the name — scope §2). | C |
| **P5** | Tests in `langston_queue_test.py`: self-advance with requester `OLD Claude` → `OLD Claude`; direct CC post → its display name; Kyle direct post → `Kyle`; **Kyle item enqueued then self-advanced → `Kyle`** (P2 + P3 composed: `recipient_name` of the enqueue task gives the stored requester, which the self-advance task carries); self-advance with empty requester → falls back to `self-advance` (today's behaviour, stated); `addressee` whitespace-only → falls through. **CI: add a step running `python3 comms-infra/discord/langston_queue_test.py`.** | A-C; OBJ-1 |
| **P6** | Filter test (`test-wake-filter-cuts.py`, already in CI): a `langston_outbound` reading `OLD Claude — (self-advance) **OLD Claude —** …` wakes CC-A and not CC-B; **control:** `self-advance — **OLD Claude —** …` wakes nobody. | OBJ-2 |
| **P7** | Install (OBJ-3), when Step 4 approves. ⛔ **WHAT RIDES ALONG, NAMED (Langston condition 1):** the install CLOSES the §E gap — `B-CREDENTIALS-PRIVATE-REPO` OBJ-4a P4 (`b4db96b9c`..`9c3afd18c`, reviewed with OBJ-4a by Langston): `REVIEW_REMOTE` moves to SSH with langston's read-only deploy key; `ls-remote` gains a retry and logs every failure; the `[REVIEW SOURCE]` preamble drops `raw.githubusercontent.com` and makes `dt-review show <sha>` the only pinned single-file read — **it changes Langston's read model on every future dispatch.** Infra Claude co-signs the install (agreed in channel 2026-10-08). ⛔ **PRE-RESTART GATE:** as `langston`, `GIT_SSH_COMMAND='ssh -o BatchMode=yes' git ls-remote git@github.com:kylegjordan/DawnTraderV3.git refs/heads/migration/aws-supabase` must return a sha BEFORE the restart (a failed resolve costs every later dispatch its sha pin; Langston ran it once: `74cc6494d`). Then: back up the live bridge; copy the bridge blob at the approved sha; `langston_queue.py` the same; restart only when idle (no `claude -p` child, the bridge log shows no invocation in flight); sha256 of both = the blobs; a Langston reply comes back; Infra Claude checks the `[REVIEW SOURCE …]` line. `#1004` class. | E |
| **P8** | Docs: SIM fabric bridge row (the self-advance case); `cc-wake-filter.py:185` and `:1085` comments — the prefix site is `:554-557` and the self-advance case is named; `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`. | G, OBJ-5 |

## 3. JUDGEMENT CALLS TO ATTACK
1. Moving the rule into `langston_queue.py` (a queue module) rather than a new module — chosen because it is already pure, tested and installed beside the bridge; the cost is a naming mismatch.
2. Not rewriting the 3 `kylegjordan` items already stored — all are terminal (2 `done`, 1 `noop`; `pick_next_ready` takes only `ready`, `langston_queue.py:249-254`), so none can self-advance again without a re-mark.
3. P7 copies two files by hand instead of running `deploy.sh` (whose installed copy differs and which also runs `pip install -U`).

**NOT RE-READ** (no fresh reader routed): the census table §D — repo grep plus a Helsinki grep, both named.
