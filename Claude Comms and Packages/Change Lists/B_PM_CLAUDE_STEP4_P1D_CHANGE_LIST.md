# B-PM-CLAUDE — Step 4 change list, increment P1d (the enforced slot check, KD-28)

**READY AT:** `fd3af2c5cfed5726e822ef366e82622ed476145c` on `origin/migration/aws-supabase`. CI run `41977541713`: TypeScript Check (baseline gate) success · Build success · Test Suite success · Docker Build success.

| # | field | value |
|---|---|---|
| i | declared change-class | `non_architecture` (scope header, re-declared by Langston at Step 2 of r3; unchanged for OBJ-9, Langston at Step 1 r4) |
| ii | that class's doc set | scope `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_SCOPE.md` **present** (r4a, OBJ-9) · pre-audit `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_PRE_AUDIT.md` **present** (section 9, r7) · this change list **present** · System Impact Map entries for `slot-check.mjs`, both hooks and the `kind` column **absent, owed at Step 10 under OBJ-8** (finding 9.5) · System Manual **N/A** (no trading architecture; `na-skip` row for B-PM-CLAUDE in `GOVERNANCE_EXCEPTIONS.md`, Langston-confirmed) · BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES, completion report **absent, owed at Steps 10-11 at batch close** (the batch has P1c and P2-P10 still to run) |
| iii | Step-2 reference | `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_PRE_AUDIT.md` section 9, r7 at `d3958eca5`, PROCEED Discord `1567777711483789496` |

## What changed (9 files, +975 / -47)

| file | kind | what |
|---|---|---|
| `scripts/pm/slot-check.mjs` | NEW, 274 lines | the gatherer (P1d-2): fetch first; header with ref sha, origin head sha, FRESH/DEGRADED, owner, item; sections: open plan rows, pre-sprint rows, task list (CC_A parsed, others verbatim `UNPARSEABLE`), decisions binding the owner and not DONE (48 h flagged), plan-vs-task-list disagreements, `EMPTY` for an empty section, `UNREADABLE` (and DEGRADED) for an unreadable source. Exports `resolveBinds`, `buildSections`. Never overwrites a record (`-2`, `-3` suffix). |
| `.claude/skills/pm-slotting/SKILL.md` | NEW | the reader (P1d-3): one Agent call on `model: sonnet` runs the script, appends push-back per position ranked on Kyle's priorities, repeats every `UNPARSEABLE` line, returns ≤ 200 words; PM commits the record with the decision row. |
| `.claude/hooks/guard-pm-slot.mjs` | NEW, 102 lines | Guard 1 (P1d-4) + the P1d-1 probe log. |
| `.claude/hooks/guard-pm-decisions.mjs` | NEW, 79 lines | Guard 2 (P1d-5). |
| `scripts/pm/reconcile-decisions.mjs` | MODIFIED | `kind` column; placement citation; `--index` mode; miss-log reader. |
| `1-system-manual/pm/DECISIONS.md` | MODIFIED | `kind` column appended, KD-1..28 backfilled `pre-guard`, method item 9. No other cell changed. |
| `.claude/settings.local.json` | MODIFIED, +22 / -0 | wires Guard 1 and Guard 2 on `Bash`, and Guard 1 on `mcp__ccd_turn__wrap_up`. |
| `1-system-manual/PM_CLAUDE_RULES.md` | MODIFIED, one sentence | the slot rule points at the skill. |
| `scripts/pm/test-slot-check.mjs` | NEW, 343 lines | 65 cases, all PASS. |

## Load-bearing snippets

**Guard 2 trigger set (r5 C5, r6 C5-B1/B2, Step-3 item A)** — `guard-pm-decisions.mjs:53-57`:
```js
const trigger = new Set(names(dirEnv, ['diff', '--cached', '--name-only']));
let viaFallback = false;
try { for (const f of names(dirEnv, ['diff', '--cached', '--name-only', 'HEAD^'])) trigger.add(f); }
catch { viaFallback = true; for (const f of names(dirEnv, ['ls-files'])) trigger.add(f); } // no HEAD / root commit: the whole index
if (!trigger.has(LEDGER)) process.exit(0);
```
No `--amend` parsing anywhere; the command is only tested for being a `git … commit` (`:30`).

**Scoping (r4 C4)** — both hooks, `CLONES` map on `basename(CLAUDE_PROJECT_DIR)`; mapped non-PM clone exits 0 silently; unreadable or unmapped writes a miss-log line then exits 0. Guard 1 `:64-68`:
```js
if (!proj) { probe(); miss(`unreadable CLAUDE_PROJECT_DIR (tool ${tool})`); process.exit(0); }
const kind = CLONES[proj];
if (kind === undefined) { probe(); miss(`unmapped project dir "${proj}" (tool ${tool}); the gate did not run`); process.exit(0); }
if (kind !== 'PM') process.exit(0); // other clones: no probe line, no miss line
probe();
```
**Review change by PM Claude:** the agent's first version wrote the probe line on EVERY invocation in every clone (every Bash call crew-wide); it now writes only in the PM clone and for unreadable/unmapped dirs.

**`binds` resolver (r4 C1, items f/h/i, Step-3 item B)** — `slot-check.mjs:46-71`: `(released)` is marked first; every other parenthetical is stripped before tokens are read (so `OLD Claude (NEW Claude has the adjacent row)` resolves to CC-A only — the fixture that kills the clause); bare `OLD`/`NEW`/`ANALYST` count only in capitals, so prose "old"/"new" never bind; `all sessions`/`all four`/`the crew` → all four; Langston/Coltrane/Kyle/PM Codex → parties; nothing recognised and not empty → `unresolved`.

## Test output (run at `fd3af2c5c`, `node scripts/pm/test-slot-check.mjs`)
`65/65 passed`, including: binds fixtures KD-2, KD-4, KD-18, KD-24, KD-25, KD-26 and the crafted (B); the 11-04 replay at `226a5fc8d` (KD-13/14 listed for CC-A) vs its parent `94b5dafe8` (not listed); DEGRADED behind origin; EMPTY owner from a fixture; CC_B verbatim UNPARSEABLE; Guard 1 refuse/allow/old/DEGRADED/non-slotting/fault/scoping; Guard 2 uncited, `--amend`, attested, cited-from-index, DEGRADED, non-ancestor, empty kind, `other`; case (i) incl. `--ame` (and proof `--cached` alone misses it); case (ii) with REF pinned before the row (refused, `cited record … NOT FOUND`) plus two controls; root commit / no HEAD → whole-index fallback, no miss-log line.

## Judgement calls to attack
1. **Beyond the spec, chosen by the builder and kept:** reconcile refuses `pre-guard` on any KD above 28, and refuses an empty or invalid `kind`. Right, or too tight for a hand-written row?
2. **Guard 1's wording net** (`guard-pm-slot.mjs:32`) is broad (`owns`, `queue`, `ahead of`, `pick up`…) AND requires a session name. It will catch ordinary recaps that mention who owns what; the cost is a reworded message or a fresh record. Too broad?
3. **Bare `Infra` counts as CC-INFRA in Guard 1** (case-insensitive): "the token-watch infra" would name CC-INFRA. Accept, or require `Infra Claude` / `CC-INFRA` there?
4. **Not verifiable in this session:** hooks load at session start, so the live P1d-1 probe on `wrap_up` and Guard 1 in real use are read in the next PM session (`~/.claude/pm-slot-probe.log`). The tracked settings file means every clone loads both hooks at its next start; each exits on its first lines outside the PM clone.

## r2 — Langston's Step-4 CHANGES folded (READY AT `d771465c1fbe7799da0eb9ada88685570f0c9ccb`)
Langston r1: CHANGES, Discord `1567804765252100148`. **CI run `41989275257`: TypeScript Check (baseline gate) success · Build success · Test Suite success · Docker Build success; the Test Suite log carries the new step's own line `PM slot check tests (gatherer, guards, ledger) … 70/70 passed`.**
- **C1** — new Test Suite step in `.github/workflows/ci.yml` runs `node scripts/pm/test-slot-check.mjs` after `git fetch --unshallow --quiet || true` (the replay reads the ledger's history; the checkout is shallow).
- **C2** — `reconcile-decisions.mjs` reads the probe log: prints its line count, how many are `mcp__ccd_turn__wrap_up`, and the last five of those (or "absent").
- **C3** — Guard 1 ages a record by its own `- generated:` header; file mtime only as fallback.
- **Call 3** — Guard 1 binds CC-INFRA only on `Infra Claude` / `CC-INFRA`.
- **Notes a, b** — malformed section-4/5 plan rows are listed in the record; the DEGRADED reason reads "not at or ahead of origin head (behind or diverged)".
- **Tests 70/70 (5 new), mutation-checked by RUNNING:** age source reverted to mtime → both C3 cases FAIL (68/70); Infra pattern reverted → the bare-"infra" case FAILS (69/70); restored → 70/70.
