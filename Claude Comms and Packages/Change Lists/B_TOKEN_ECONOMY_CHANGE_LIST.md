# B-TOKEN-ECONOMY — Step-4 change list (Langston code review)

**READY-AT: `eafd993eb` on `origin/migration/aws-supabase`** (pushed; local = origin, 0 ahead / 0 behind after fetch). Range reviewed: `2392829c0^..eafd993eb`.
Owner: PM Claude (KD-103). Author date 2026-11-19.

## Dispatch header (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `non_architecture` (scope header, `Scope Files/B_TOKEN_ECONOMY_SCOPE.md:3`) |
| ii | DOC SET for non_architecture | SCOPE — **present** `Scope Files/B_TOKEN_ECONOMY_SCOPE.md` · PRE_AUDIT — **present** `Scope Files/B_TOKEN_ECONOMY_PRE_AUDIT.md` · COMPLETION_REPORT — **absent** (Step 11) · BATCH_CATALOG — **absent** (Step 10) · PHASE_HISTORY — **absent** (Step 10) · SYSTEM_MANUAL — **judged N/A**: no trading architecture, formula or threshold changes; crew tooling only · SYSTEM_IMPACT_MAP — **judged N/A**: same reason; no app component touched · CHANGES_AND_FIXES — judged at Step 10 · RUNNING_ISSUES — judged at Step 10 (three pre-existing test fails, below) · POST_AUDIT_ROADMAP — judged N/A (no roadmap item) · DELETED_COMPONENTS_LOG — judged N/A (nothing deleted; P5 moved text, ledger proves it) · ADJUSTMENT_FRAMEWORK — judged N/A · PHASE_19_PLAN — N/A (not a `P19-*` batch) · SPRINT_TO_LIVE_PLAN row — **absent**, judged at Step 10 (check whether the batch has a row) · shared MEMORY + MEMORY_PM + Langston MEMORY — MEMORY_PM **present** (updated each leg); shared + Langston at Step 10 · PM task list — Step 10 |
| iii | STEP-2 REFERENCE | `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_PRE_AUDIT.md` |

## What was built (by leg, commit, objective)

| leg | commit | OBJ | what |
|---|---|---|---|
| P0 | `2392829c0` | 0 | Pre-registered baseline + `scripts/crew-tooling/token-baseline.py` |
| P1/P4 | `424a61945`, `4ce227502` | 1, 4 | `autoCompactWindow: 250000`, `idleCompaction: false` in `.claude/settings.local.json`; `.claude/agents/Explore.md` (Haiku). Canary verdict `B_TOKEN_ECONOMY_CANARY.md` Obs 2 |
| P6 | `ea9c7c1dc` | 6 | `alert-delta.mjs` **shadow only** — the full alert list is still injected |
| P7 | `14cee87c9` | 7 | `warn-dedupe.mjs`: warn-only guards show each kind once per session; sinks unchanged |
| P5 | `198e6ddcb` | 5 | CLAUDE.md 122,263 → 77,480 B (LF, measured at the two refs); 55 passages moved verbatim; ledger + `move-ledger-check.mjs` + `claude-md-cap.mjs`; warn-only CI step |
| P8 | `6bfb3613d` | 9 | Four PM handover skills name the settings + smoke check |
| P9 | `eafd993eb` | 10 | Canary Obs 5 (measurement record) |

Not yet run: OBJ-2 crew rollout of the 250k window (waits for crew resume), OBJ-3 Codex canary (next Codex session), P6 switch from shadow to live (gate: ≥50 prompts or 3 days + `alert-delta.mjs --verify` PASS + your ruling, separate commit).

## Load-bearing hunks

**settings (`.claude/settings.local.json`, tracked, loaded by every Claude clone):**
```diff
+          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/crew-tooling/alert-delta.mjs\" --reset" },
+          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/crew-tooling/warn-dedupe.mjs\" --reset" },
+          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/crew-tooling/claude-md-cap.mjs\"" }
...
-  "defaultMode": "bypassPermissions"
+  "defaultMode": "bypassPermissions",
+  "autoCompactWindow": 250000,
+  "idleCompaction": false
```
(the three hooks are in the SessionStart `startup|resume|compact` group, after `log-instructions-loaded.mjs`)

**P6 shadow in `.claude/hooks/inject-due-alerts.mjs` — fail-open, display unchanged:**
```js
+let AD = null;
+try { AD = await import(new URL('../../scripts/crew-tooling/alert-delta.mjs', import.meta.url)); } catch { AD = null; }
+let SESSION_ID = null;
+try { SESSION_ID = JSON.parse(readFileSync(0, 'utf8') || '{}').session_id || null; } catch { SESSION_ID = null; }
+function shadow(args) {
+  if (!AD || !SESSION_ID) return;
+  try { AD.shadowStep({ sessionId: SESSION_ID, ...args }); } catch { /* shadow only */ }
+}
...
+  shadow({ alias, ok: true, alerts: parsed, owners, visible: s.narrowed ? [...s.mine, ...s.unrouted, ...s.critical].map((a) => a.id) : null });
```
The hook now reads its own stdin (`readFileSync(0)`, line 40 at the ref). Checked: before P6 the hook never read its own stdin (`git show ea9c7c1dc^:` has no `readFileSync(0`/`process.stdin`); the remote script goes to ssh through `spawnSync(..., { input: REMOTE })` (line ~123), the child's stdin, not the hook's. So this is the only read of the hook's input.

**P7 dedupe in each warn-only guard (`guard-stale-fetch.mjs` shown; `guard-measurement-shape.mjs` and `guard-result-shape.mjs` rare legs the same):**
```js
+let WD = null;
+try { WD = await import(new URL('../../scripts/crew-tooling/warn-dedupe.mjs', import.meta.url)); } catch { WD = null; }
+const wdUnseen = (sid, kinds) => { try { return WD ? WD.unseen(sid, kinds) : kinds; } catch { return kinds; } };
...
   note({ decided: true, fired, age_min: ... });   // sink still written every time
   if (!fired) return;
+  if (!wdUnseen(payload && payload.session_id, ['stale-fetch']).length) return;
```
`warn-dedupe.mjs unseen()`: state file per session id under `~/.claude/cc-wake-state/warn-dedupe/`, SAFE_ID `^[A-Za-z0-9_-]{1,80}$`, any error ⇒ show all; `--reset` at SessionStart deletes the session's file so the first warning after a compaction shows again. Blocking guards untouched.

**Explore override (`.claude/agents/Explore.md`, new):** `model: haiku`, `tools: Glob, Grep, Read`, literal finding only; "a search returning nothing is not proof of absence; name what you searched".

**P5 — CLAUDE.md pointer form (one of 55):**
```diff
-<full passage, e.g. the Telegram-era apparatus paragraph>
+> *(Telegram apparatus archived — `CLAUDE_MD_RULE_HISTORY.md` · `P5-57`.)*
```
Destination wrapper: `<!-- P5-MOVED id=P5-57 -->\n### <origin heading>\n\n<passage, byte-identical>\n<!-- /P5-MOVED id=P5-57 -->`. Sheet: `Change Lists/B_TOKEN_ECONOMY_REACHABILITY.md`. Ledger: `Change Lists/B_TOKEN_ECONOMY_MOVE_LEDGER.json` (id, origin heading, destination, sha256, bytes, pointer text).

**P5 checks, run at `eafd993eb` today:**
- `move-ledger-check.mjs --dupes` → `OK — 55 moves, each present once at its destination, unchanged, gone from CLAUDE.md, one home each.`
- `move-ledger-check.mjs --self-test` → `5/5 PASS` (real tree passes; missing / edited / put-back / lost-pointer each FAIL — the mutation proof).
- `claude-md-cap.mjs --report` → `77480 B of 78000 B (LF bytes), 520 B headroom.`
- Heading count 44 before, 44 after.

**CI step (Test Suite job, `.github/workflows/ci.yml`), warn-only:**
```yaml
+    - name: CLAUDE.md size cap and move ledger (warn-only)
+      if: ${{ !cancelled() }}
+      run: |
+        node scripts/crew-tooling/claude-md-cap.mjs --self-test
+        node scripts/crew-tooling/move-ledger-check.mjs --self-test
+        node scripts/crew-tooling/claude-md-cap.mjs --ci --report
+        node scripts/crew-tooling/move-ledger-check.mjs --ci --dupes
```
CI: P5 run 44567580494 4/4 green; P8 run 44609599518 4/4 green; P9 run 44612602370 (in progress at writing).

## Judgement calls — please attack these

1. **P5-34.** The §7.1 crew-board paragraph ("claim shared paths") moved to the history doc, with a pointer saying it is superseded by rule 25.a (board retired 2026-08-23). Is that a move, or a rule change dressed as one?
2. **Frozen line citations mapped, not rewritten.** *(Count corrected after Step 4: 109 citations = 107 frozen at 95 distinct sites + 2 re-pointed; the dispatched text read "107 exist / 105 frozen".)* 2 live ones were re-pointed by section; 107 in frozen records (issues, plan rows, reports) are mapped in the ledger's `citations` key to where the pre-P5 line now lives. Acceptable, or must live-ish records (open RUNNING_ISSUES entries) be rewritten?
3. **The ledger and cap checks are warn-only in CI.** Should either be blocking now? My lean: make `move-ledger-check --dupes` blocking (it is deterministic and mutation-proved), keep the cap warn-only until the next deliberate CLAUDE.md edit shows how tight 520 B headroom is.
4. **P6 shadow placement.** The shadow call sits on all three paths (unreachable, zero due, due list) and can only log. Anything that would let it change what is injected?
5. **The general-purpose agent mechanism change.** `CLAUDE_CODE_SUBAGENT_MODEL` env FAILED the canary and was removed. The replacement, `.claude/agents/general-purpose.md` (`model: sonnet`), overrides the built-in general-purpose agent. It is **local and uncommitted** until a restart shows a no-model call serving Sonnet. Is overriding a built-in agent by name an acceptable mechanism for the crew? (Explore is overridden the same way and passed its canary.)
6. **P7's rare-leg dedupe in `guard-result-shape.mjs`.** The cap-bound leg keeps its own per-command dedupe; only the rare legs use per-session kind dedupe. Is it right to show a rare warning once per session rather than every time?
7. **Three pre-existing local test failures**, the same on the baseline before any change: `test-guard-result-shape` (1), `test-hook-selftest` (2). Not caused here; I plan to log them in RUNNING_ISSUES at Step 10 unless you want them folded in.

Load-bearing claims in this list that were **NOT RE-READ** by a fresh reader: the "nothing lost" claim (P5) rests on the mutation-proved checker above, not on a reader; the stdin single-read finding above.

---

## AMENDMENT 1 — P6, the alert lane routes by the crew's owner table (Infra Claude, OBJ-13)

**READY-AT: `57415baae08bae3d6f5de93c3129200b2a857635` on `origin/migration/aws-supabase`.** One commit, `57415baae^..57415baae`, 9 files, +826 / -103. CI run `44753262508` (result in the dispatch).

### Dispatch header (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `non_architecture` (`Scope Files/B_TOKEN_ECONOMY_SCOPE.md:3`, unchanged by the amendment) |
| ii | DOC SET | SCOPE **present** (`B_TOKEN_ECONOMY_SCOPE.md`) · PRE_AUDIT **present** (`B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md`, the P6 rows) · COMPLETION_REPORT **absent** (Step 11) · BATCH_CATALOG, PHASE_HISTORY **absent** (Step 10) · SYSTEM_MANUAL **judged N/A**: crew tooling, no trading architecture · SYSTEM_IMPACT_MAP **judged at Step 10**: the alert lane has a SIM entry (`SYSTEM_IMPACT_MAP.md:3119`), and P6 adds three governed files as its inputs — expected to be an applicable content update · CHANGES_AND_FIXES, RUNNING_ISSUES **judged at Step 10** · POST_AUDIT_ROADMAP, ADJUSTMENT_FRAMEWORK, DELETED_COMPONENTS_LOG **judged N/A** (nothing removed: the builder's own copies of the rules moved into `alert_owner_route.py` and the builder imports them) · PHASE_19_PLAN N/A (not `P19-*`) · SPRINT_TO_LIVE_PLAN row — judged at Step 10 · MEMORY files + task list — Step 10 |
| iii | STEP-2 REFERENCE | `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md` — R2-1…R2-6, the Step-4 riders C-1…C-5, and the P6 plan row |

### What was built

| file | what |
|---|---|
| `comms-infra/discord/alert_owner_route.py` (NEW) | The ONE home of the routing rules: `parse_register`, `parse_plan`, `batch_owners`, `family`, `table_route`, `load_table`, `dedupe_key_of`. Every parser RAISES rather than return an empty map. |
| `scripts/pm/build-alert-owner-table.py` | Now imports those rules instead of carrying its own copy — the builder and the lane cannot drift. |
| `comms-infra/discord/alert_lane.py` | `owner_routing(read)`, `table_routes`, `owner_table_line`, `apply_table`; `precedent_line` and `build_prompt` show the table owner to the lane. |
| `comms-infra/discord/discord-langston-bridge.py` | `read_mirror_file(path)` = `git --git-dir /srv/dawntrader-backup.git show refs/heads/migration/aws-supabase:<path>`, raises on failure; the R2-4 block; the order read_answer → apply_table → apply_precedent(rest) → enforce_live_rows. |
| `comms-infra/discord/alert-lane/CLAUDE.md` | Step 2 follows the OWNER TABLE line; a table/precedent mismatch is an escalation. |
| `comms-infra/discord/deploy.sh` | Installs `alert_owner_route.py` beside the bridge (0644). |
| `alert_owner_route_test.py` + `mutate_alert_owner_route.py` (NEW) | ~100 checks; 28 mutations, judged by exit code, each anchor unique or reported NOT APPLIED. 28/28 caught on Helsinki. |
| `.github/workflows/ci.yml` | New step "Alert lane owner-table tests (P6)": suite + mutation runner. |

### Load-bearing hunks

**Bridge — the failed read escalates the whole batch; the lane is not invoked (R2-4):**
```python
    if ided:
        try:
            table, batch_owner = al.owner_routing(read_mirror_file)
        except Exception as e:
            why = f"the owner table/register/plan could not be read ({type(e).__name__}: {e}) - R2-4"
            log(f"alert lane: {why} - escalating all {len(ided)} alert(s) of this batch to Langston")
            escalate += [(t, why) for _, t in ided]
            ided = []
```
`read_mirror_file` raises on a non-zero exit; `load_table` raises on empty text, a missing section, zero rows, or an owner/fallback outside CC-A/B/C/INFRA; `parse_register`/`parse_plan` raise on zero parsed batches. That covers all three failure shapes in R2-1/R2-4 (exit ≠ 0, empty stdout, zero rows).

**Lane — `apply_table` (`alert_lane.py:411`), run BEFORE `apply_precedent`:**
```python
        if tr is None:                       # no live row -> no route; enforce_live_rows escalates it later
            rest[aid] = (owner, action); continue
        t_owner, rule = tr
        if owner == "Kyle":                  # only Langston decides an instance needs Kyle
            escalate[aid] = "..."; continue
        if rule == "fallback":
            if rows: rest[aid] = (owner, action); continue      # his precedent rules, exactly as before
            routed[aid] = (t_owner, action + " (owner table: fallback - no rule matched, no Langston precedent)")
            continue
        tag = "owner table: " + rule
        if rows:
            eff, _sup, ok = effective_owner(rows)
            if ok and eff == "Kyle":   escalate[aid] = "..."; continue
            if ok and eff != t_owner:  escalate[aid] = "...the table or his ruling is stale; he decides"; continue
            if not ok:                 tag += "; settles Langston's back-and-forth"      # R2-6
        routed[aid] = (t_owner, action + " (" + tag + ")")      # a different lane choice is noted, never silent
```

**Rule order (`alert_owner_route.table_route`):** owner named in the title → table row (batch / prefix / title stem) → register/plan owner of a batch-keyed row → a register/plan batch named anywhere in the title → fallback (CC-INFRA). Every post states which rule set the owner (R2-5).

### Judgement calls — please attack these

1. **Rule (b), the batch-id leading the most recent commit subject, is NOT implemented.** R2-2 listed it "as a recency check only". I left it out: it routes nothing, and a commit subject is a weaker owner signal than the register or plan. If you want it, say whether it should only annotate or also escalate a disagreement.
2. **The sprint plan is in the chain** (register wins where both name a batch), exactly as the builder's refusal uses it (C-5). A plan row with two owners is left out, never guessed.
3. **`dedupe_key_of` falls back to `metadata.dedupe_key`** when the row's top-level key is empty (the governance checker writes it only under metadata and leaves the top level null — measured 2026-11-20 on `c9b493ad`, `gov-staleopen:B-CLOSE-WRITER-COSTS`). A mutation that drops the fallback is caught.
4. **A clean Langston precedent that names a different session than the table ESCALATES** rather than letting either side win. That will escalate any family whose owner he has changed since the table was built, until the table is rebuilt. I chose that over silently preferring one source.
5. **The unanimity guard in `apply_precedent` now sees only the `rest` set**, not the table-routed alerts. A batch where the table routes everything therefore cannot trip the "every alert to one owner" alarm. I think that is right — the table is a governed input, not the lane's guess — but it does narrow a guard you asked for.

**Not yet done (after your verdict):** idle-bridge install via `deploy.sh --only bridges`, the drift pin moved in the same sitting (`#1004`), the seeded-failure check before install (R2-4: table path renamed ⇒ escalation, not fallback), then the 7-day legs.

## AMENDMENT 1 r3 — answers to Step-4 verdict 2 (Discord `1573415701635403989`, 2026-11-20 19:12Z)

**READY-AT: `8db7c021313ac090699ce488a60bbff2fe806e0a`** (r3 code, `8db7c0213^..8db7c0213`) — plus this section and the one-line builder row below. Tests at r3: `alert_owner_route_test.py` 138 passed, 0 failed on Helsinki (as `nobody`, scratch dir); mutation runner 40/40 caught, judged by exit code. **Not installed.**

| rider | what r3 did | still open |
|---|---|---|
| **C-1** (non-building owner) | `_batch_route` returns an ESCALATION when the register/plan owner of a batch is not one of CC-A/B/C/INFRA (PM Claude's register section maps to CC-PM). `apply_table` escalates it to you whatever the lane chose; `owner_table_line` prints `ESCALATE`. | **Your ruling: escalation (r3) or fallback (your suggestion).** My case for escalation: a fallback puts a PM-owned alert in front of CC-INFRA, which does not own the batch, so neither session treats it as theirs — a silent misroute. An escalation puts it to you, and you can route it anywhere, PM included. Cost not measured; the 7-day read publishes escalations by reason. |
| **C-2** (unanimity guard has no reach) | Unchanged in r3: `apply_precedent` still runs on `rest` only (bridge, the `apply_table` → `apply_precedent(rest)` → `routed.update(rest)` order). | **I choose your option 2: publish the per-day largest (template → owner) group in the 7-day read.** Reason against re-pointing the guard at the merged `routed`: `apply_table` already escalates every alert whose key carries a clean precedent naming another owner, so what the merged guard would add is a sample pulled from correctly-routed alerts, every batch, for any template whose keys are split or interleaved — the r2 BLOCKER-3 "fires forever" shape. The read gives the measurement without that churn. |
| **C-3** (stale mirror) | Age = newest of `DT_SYNC_PASS` / `DT_REVIEW_FETCH_OK` (first field, digits, no leading zero), never FETCH_HEAD's mtime; future stamp, stale mirror, no stamp or unresolvable ref escalates the whole batch (R2-4). Limit `OWNER_MIRROR_MAX_AGE_S = 1800`. | none — see the block below. |
| **C-4** (rule (b) withdrawn) | — | Strike it from the P6 plan row and pre-audit `:39` at Step 10 (owed). |
| **C-5** (`GIT_*`) | Every `GIT_*` variable is cleared from the mirror git environment. | none |

> **PREVIOUSLY STATED: the lane should refuse a mirror older than 90 minutes (5,400 s), "as coltrane-review does" (my P6 Step-2 note, Discord `1573292904590606459`, item 3). NOW: 1,800 s. REASON: your C-3 sets the limit at two sync periods, and the sync runs every 15 minutes (`/var/spool/cron/crontabs/langston:4`, `*/15 * * * * /usr/local/bin/dt-backup-sync.sh`, read 2026-11-20 21:0xZ); the 90 minutes was borrowed from a different consumer with a different tolerance.**

**Routing row (owed from the birth-cap batch, `#1247`):** `scripts/pm/build-alert-owner-table.py` `'birthcap-divergence-': (None, None)` → `'birthcap-': ('B-TOKEN-WATCH-BIRTH-CAP', '#1247')`. The batch emits three key families — `birthcap-divergence-`, `birthcap-vendor-meter-{backwards,frozen}-window-` (`token-watch/birthcap.py:716-733`) and `birthcap-mint-drill-` — and only the first had a row. **Routing outcome today is already CC-INFRA** (2 of 2 markers on the divergence row; the other two families reach the CC-INFRA fallback), so this makes the owner batch-keyed and cross-checked rather than changing who gets paged. The generated `alert_owner_table.json` is NOT hand-edited: its counts come from PM's marker and queue extracts, so the row lands at the next table build.

**Before install — the seeded-failure check (R2-4):** rename the table path on a scratch copy ⇒ expect a whole-batch ESCALATION, not a fallback. Run and recorded before the bridge is touched.

**⚠️ Install entanglement — please read before ruling on either gate.** The installed bridge is the blob at `27ef0d3f7` (sha256 `1b967553a1a5`, read back on Helsinki 2026-11-20 21:0xZ; service active). The branch head carries `discord-langston-bridge.py` blob `db478856d70b`, which contains **both** P6 (`57415baae`, `8db7c0213`) **and** the two-workers fold (`021d015d4`, which you cleared to install at idle). `deploy.sh --only bridges` installs the whole file at a sha, so **installing the fold at head would ship P6 before its PROCEED** — and your ref-versus-installed comparison for the fold spanned the P6 hunks as well. Plan: no bridge install until P6 has its PROCEED; then ONE combined install at idle (`live-vs-sha.py` → `deploy.sh --sha <graded> --only bridges` → `langston-bridge-restart`), moving the `#1004` drift pin in the same sitting.

**For Kyle's list, via PM (owner CC-INFRA, pre-audit §13):** should CC-PM be a routable alert owner? Until he rules, C-1 stands as above.

## AMENDMENT 1 r4 — the Step-6 install refusal and the restart-tool fix (2026-11-20/21)

**READY-AT: `39a3849c2cb1b8be4a20b0d5c92c6972e4eedad8`** on `origin/migration/aws-supabase` — one commit, `39a3849c2^..39a3849c2`, 2 files, +47 / -4: `comms-infra/discord/langston-bridge-restart` and `comms-infra/discord/test_langston_bridge_restart.py`. No change to anything you cleared at `0c9274a21`.

### Dispatch header (workflow-04, three fields)

| # | field | value |
|---|---|---|
| i | DECLARED CHANGE-CLASS | `non_architecture` (`Scope Files/B_TOKEN_ECONOMY_SCOPE.md:3`, unchanged) |
| ii | DOC SET | as in the AMENDMENT 1 header above, unchanged: SCOPE present · PRE_AUDIT present · COMPLETION_REPORT, BATCH_CATALOG, PHASE_HISTORY absent (Steps 10-11) · SYSTEM_MANUAL judged N/A (crew tooling) · SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES, RUNNING_ISSUES, SPRINT row, MEMORY files, task list judged at Step 10 · POST_AUDIT_ROADMAP, ADJUSTMENT_FRAMEWORK, DELETED_COMPONENTS_LOG judged N/A (nothing removed) · PHASE_19_PLAN N/A (not `P19-*`) |
| iii | STEP-2 REFERENCE | `Scope Files/B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md` (P6 rows). This increment is a Step-9 fix to the install tool found AT Step 6; the pre-audit's P6 install plan named `langston-bridge-restart` as the restart path and did not audit its import of the installed `alert_lane.py` — **that gap is what this increment closes.** |

### What happened at Step 6

After your PROCEED at `0c9274a21`, CI `44832950713` 4/4 green, and the seeded-failure check passing, I installed `0c9274a21` with `deploy.sh --only bridges` (install-verify clean, `alert_owner_route.py` present 0644 beside the bridge). `langston-bridge-restart` then died **before acting**: `ModuleNotFoundError: No module named 'alert_owner_route'` in `load_predicate` → `exec_module` at `alert_lane.py:19`. **The bridge was not restarted** — the running process stayed the `27ef0d3f7` code throughout.

**Rollback (a deploy, not a command):** `deploy.sh --sha 27ef0d3f7cc3a88419afa19f6e12412f5ed57772 --only bridges`. Read back: bridge blob `faa03f41`, `alert_lane.py` `14861b2d` = the running code (MainPID 3937692, active since 2026-11-19 23:03:16); the tool's predicate then loaded clean. The stray `alert_owner_route.py` from the `0c9274a21` install remains in `/opt/discord-bridges` (unused by `27ef0d3f7`'s `alert_lane.py`; the next install overwrites it).

**Cause:** the tool loads `alert_lane.py` BY FILE PATH (`spec_from_file_location`). Running the bridge as a script puts its own directory on `sys.path`, which is why the bridge itself imports the sibling fine; a file-path load does not. P6 gave `alert_lane.py` its first sibling import, so this was the first install the tool could not load.

**Why the suite missed it:** section 5 runs in-process after `sys.path.insert(0, HERE)` (`test_langston_bridge_restart.py:8`), so the branch's own `alert_owner_route.py` satisfied the import whatever the temp dir held. `MISTAKE: wrong-object` trailer on the commit.

### Load-bearing hunk — `load_predicate`

BEFORE:
```python
    d = bridge_dir or BRIDGE_DIR
    spec = importlib.util.spec_from_file_location("lbr_alert_lane", os.path.join(d, "alert_lane.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
```
AFTER:
```python
    d = bridge_dir or BRIDGE_DIR
    sys.path.insert(0, d)
    try:
        spec = importlib.util.spec_from_file_location("lbr_alert_lane", os.path.join(d, "alert_lane.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    except ImportError as e:
        raise Refusal(12, "refusing: the installed %s/alert_lane.py cannot import a module it needs (%s) - the "
                          "bridges group is incomplete. Install it (deploy.sh --only bridges) first." % (d, e))
    finally:
        sys.path.remove(d)
```
Docstring exit list gains `12 the installed alert_lane.py cannot import a sibling it needs (an incomplete bridges install)`. The predicate self-check (exit 10) and everything after it is unchanged.

### New test 5b — the load in a CHILD with `python -I`, `cwd` = the dir under test

```python
def _child_load(d):
    r = _sp.run([sys.executable, "-I", "-c", _CHILD, os.path.join(HERE, "langston-bridge-restart"), d],
                capture_output=True, text=True, cwd=d)
    out = r.stdout.strip()
    return out if out else (r.stderr.strip().splitlines() or ["<no output>"])[-1]
```
`-I` drops the script dir, `PYTHONPATH` and user site; `_CHILD` is passed with `-c`, so the child has nothing of this test's folder. Cases: complete dir (`alert_lane.py` + `alert_owner_route.py`) → `loaded`; control, `alert_lane.py` alone → `refused 12`. A traceback returns its last stderr line, so it reads as itself and never as a pass.

**Results, on Helsinki in a scratch dir (Windows has no `pwd`):** suite EXIT=0, 0 FAIL. Mutants, judged by exit code, each applied by line number and the applied line printed:
| mutant | EXIT | caught by |
|---|---|---|
| `sys.path.insert` AND `sys.path.remove` → `pass` | 1 | 5b positive case: got `'refused 12'` |
| `except ImportError` → `except ZeroDivisionError` | 1 | 5b control: got the raw `ModuleNotFoundError` |
| `sys.path.insert` alone → `pass` | 1 | crash: `remove` of a dir not on the path (exit only, no FAIL line) |

### Judgement calls — please attack these

1. **`sys.modules` is not cleared.** If a module named `alert_owner_route` were already imported in the tool's process, the load would reuse it rather than the installed one. In the tool's real run nothing imports it before `load_predicate`, and 5b's child starts clean. I did not add a `sys.modules.pop` because it would mask exactly what 5b exists to catch in-process. Say if you want it.
2. **Exit 12 refuses on ANY `ImportError` from the installed `alert_lane.py`**, not only a missing sibling — a broken third-party import would also read as "incomplete bridges install". I judged the message still points at the right action (install the group); the exception text is carried in the refusal.
3. **Reach, stated:** 5b proves the tool can load a complete install dir and refuses an incomplete one. It does not prove the installed group matches a sha — that remains `live-vs-sha.py` + install-verify, as the docstring's reach note already says.

**Next, after your verdict:** CI on `39a3849c2` → `deploy.sh --sha 39a3849c2… --only bridges` (carries P6 + the two-workers fold + this fix; the bridge files are byte-identical to what you graded at `0c9274a21` — verified by blob at install) → `langston-bridge-restart` while you are idle → read back + move the `#1004` drift pin in the same sitting.
