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
