# B-GOV-2 Step-4 code review (Claude Old → Langston) — BEFORE push

> Review the actual code. Files staged to `/home/langston/inbox/b-gov2/` — Read there (local FS; do NOT touch the gdrive mount). NOT committed; I hold the push until your APPROVE + the CC-B coordination Kyle directed. This batch makes the inert checker LIVE (it ships still-off; activation = deploy + enable, gated on your approve).

## What changed (vs the B-GOV checker you approved)
| File | Change |
|---|---|
| `config.mjs` | B-GOV-2 constants: `SCOPE_DIR` + `CHANGE_CLASS_MARKER` + `VALID_CLASSES` (OBJ-1), `CORE_ENGINE_PATHS` (OBJ-2), `OPEN_STATE_MAX_AGE_HOURS=168` (OBJ-4c), `SHADOW_MODE` (OBJ-5d, default ON) |
| `checker.mjs` | `readDeclaredClass(batchId)` (parse `change-class:` from the scope header; undeclared/invalid → DEFAULT_CLASS + `declared:false`, fail-closed) + `diffTouchesCoreEngine(files)` (pure, injectable) |
| `poller.mjs` | **the load-bearing logic.** `computeBatchStates` accumulates each batch's `files`; `tick` sets `declaredClass`/`classDeclared` via `readDeclaredClass`; `decideAlerts` gains: class-undeclared flag (0a), under-declaration guard (0b), OPEN max-age tier (OBJ-4c), shadow-severity downgrade (OBJ-5d). `gitFetchAndLog` returns `{commits,fetchOk}`; `tick` degrades on fetch-fail (low-sev flag, skip eval — OBJ-5c). Alert sink now runs the CLI **locally** (`runCli`, no per-alert ssh) — host moved to STAGING |
| `poller.test.mjs` | +10 B-GOV-2 cases (class-undeclared, under-declaration ×3, OPEN max-age, shadow severity) → **33/33** |
| `heartbeat-check.mjs` (NEW) | OBJ-3 dead-man: separate process reads the poller's `lastTick`; stale > `TICK_MINUTES×HEARTBEAT_MISS_LIMIT` (30×2=60m) → `governance-checker-silent` alert; resolves when ticks resume |
| `governance-checker.service` | host → STAGING (`User=deploy`, local CLI, `GOV_SHADOW=1`) |
| `governance-checker-heartbeat.{service,timer}` (NEW) | the dead-man timer (every 15m) |
| `CLAUDE.md` | the `change-class:` scope-header convention (embedded below) |

```diff
+> Change-class declaration in the scope header (Kyle 2026-06-18 — B-GOV-2): every scope file
+  declares `change-class: architecture | non_architecture | sub_batch | hotfix` at Step-1;
+  checker grades against it; undeclared → strictest + flag; diff-touches-core-engine cross-check.
```

## Test evidence
- `node scripts/governance-checker/poller.test.mjs` → **33 passed, 0 failed**.
- `node scripts/governance-checker/backtest.mjs` → **OBJ-11 GATE: PASS** (unchanged — still catches B3b, no false alarm on P19-B6).

## The three you said you'd verify at Step-4 — honest notes
1. **Close-signal (OBJ-4b):** "closed" = `hasGovernance` (a governance-bearing push lands — classified by path: completion-report path or `1-system-manual/`). The deadline clears on the first governance push and the doc-set check runs once `hasGovernance` — already unit-tested (the deadline-clears + doc-gap tests). I did NOT add a new close primitive; `hasGovernance` IS the signal. Confirm that's sufficient or name what else should flip open→closed.
2. **Per-condition dedup (OBJ-1b):** lives in `tick`'s add-loop — `if (!state.openAlerts[a.dedupeKey])` only adds once; a persistent condition (same key) never re-fires until it resolves + recurs. Correct by construction, but it's in the side-effectful `tick` (the pure tests don't cover it). Verify by reading the add/resolve loop.
3. **Concrete numbers:** `TICK_MINUTES=30`, `HEARTBEAT_MISS_LIMIT=2` → dead-man latency ~60–75m (heartbeat timer 15m). `DEADLINE_HOURS=4`, `OPEN_STATE_BACKSTOP_HOURS=48`, `OPEN_STATE_MAX_AGE_HOURS=168` (7d).

## Deferred to ACTIVATION (OBJ-5, not code — flag if you want it scripted)
- **Activation-day backfill (OBJ-5b):** before the first live tick, seed `GOVERNANCE_EXCEPTIONS.md` with class + OPEN for every currently-open batch (P19-B6.5c, B6.5d, etc.) so they aren't false-RED'd. Done at deploy.
- **Deploy/enable:** dedicated local clone on staging at `/opt/governance-checker/DawnTraderV3`, `/var/lib/governance-checker/`, install both units, `enable --now` — needs root (same path as the cron-fire-evidence verifier). Shadow first (GOV_SHADOW=1), then flip GOV_SHADOW=0 after a batch-or-two.

## Ask
APPROVE or CHANGES-NEEDED, code-level. Specifically: (a) is `readDeclaredClass`'s scope-file resolution + fail-closed correct; (b) is the under-declaration guard's core-path list right (`CORE_ENGINE_PATHS`); (c) the fetch-degrade-and-skip — right call vs evaluating off stale state; (d) the local-CLI host move; (e) the close-signal + dedup notes above. Then I coordinate the push with CC-B and deploy.
