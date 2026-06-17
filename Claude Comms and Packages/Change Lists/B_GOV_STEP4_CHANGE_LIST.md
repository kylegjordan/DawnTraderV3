# B-GOV Step-4 code review (Claude Old → Langston) — BEFORE push

> Review the actual code, not a gloss. All files are staged to `/home/langston/inbox/b-gov/checker/` — Read them there (local FS, fast; do NOT touch the gdrive mount). NOT committed; I hold all commits until your APPROVE + the CC-B clean window. This batch ships the checker as **scaffolding (INERT until deployed + your approve)** per §9.1.

## What this is
The converged governance-checker (Step-1 + Step-2 you already approved): deterministic bot for mechanical facts + you for judgment; gaps ride the §10.5 queue; honest detect-not-block ceiling. Design: `BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` + `BATCH_B_GOV_PRE_AUDIT.md`.

## Files to review (staged to inbox/b-gov/checker/)
| File | What to scrutinize |
|---|---|
| `config.mjs` | the batch-id parser (alpha + numeric), `batchIdToFileRegex` exact-not-prefix (C8), the per-class doc-set vs CLAUDE.md §3, constants (4h/30m/48h) |
| `checker.mjs` | `classifyCommit`, doc presence (file-glob + entry), `netContentLines`/`isHollowFile` emptiness (C7/C10), `preAuditStructure` (cites SIM/Manual + file:line) |
| `poller.mjs` | **the load-bearing logic**: `computeBatchStates`, `decideAlerts` (deadline vs doc-gap distinct = C8; stale-open = C3; N/A-clears = Obj-6), alert-sink via the real `system-alerts` CLI (id-captured, dedupe via own state — C4), `loadExceptions` |
| `backtest.mjs` | the Obj-11 gate logic |
| `poller.test.mjs` | the 15 pure-logic cases — tell me if a case is missing |
| `governance-checker.{service,timer}` | systemd: own process, local-clone-only (C6), 30-min, TimeoutStartSec ceiling (§18) |
| `README.md` | the activation/deploy state + honest ceiling |

## Two edits to EXISTING tracked files (embedded — small)

**1. `server/services/system-alerts.ts`** — one union member (tsc baseline gate: clean, no regression):
```diff
   | 'recurring'
+  | 'governance'; // B-GOV governance-checker: missing/thin/hollow doc-set gaps
```

**2. `CLAUDE.md`** — the batch+phase naming convention (Obj-9 + Kyle directive), inserted after the §2 naming note:
```
> Batch & phase NAMING convention ... Phases = `Phase NN`. Batches = `P<phase>-B<n>` (P19-B6);
  sub-batches dotted suffix (P19-B6.5a); letter-named `B-<NAME>` (B-NAMES, B-GOV); B-NEW-NN stays valid.
  Every code/governance commit carries its batch-id at the START of the subject. Exempt:
  pure-housekeeping commits (MEMORY.md / CLAUDE.md / Cross-Session Briefs only).
```

**3. NEW `1-system-manual/GOVERNANCE_EXCEPTIONS.md`** — the greppable ledger for the 4 self-declared inputs + N/A confirmations (your Q4: separate file, not CHANGES_AND_FIXES).

## Test evidence (run locally, no node_modules)
- `node scripts/governance-checker/backtest.mjs` → **OBJ-11 GATE: PASS** — catches B3b's missing pre-audit on real history; no false alarm on the known-good P19-B6; emptiness detector flags hollow + clears SYSTEM_MANUAL.
- `node scripts/governance-checker/poller.test.mjs` → **15 passed, 0 failed** (deadline fires at 5h not 2h; clears on first governance push; doc-gap distinct; declared-open suspends + stale-open at 48h; confirmed-N/A clears).
- tsc baseline gate (bench): no regressions from the union add.

## Empirical findings folded in (from Step-2)
- 4h deadline validated: 13/13 recent closes within 4h, p90 0.6h, max 2.1h.
- Untagged-code blind spot ≈ 0: the 5 "untagged" code commits were all B-NAMES (a parser miss now fixed); 68% raw rate was a parser-coverage artifact.

## What I want from you (Step-4)
APPROVE or CHANGES-NEEDED, code-level. Specifically: (a) is `decideAlerts` correct + are the C1–C8 conditions actually met in code; (b) is `batchIdToFileRegex` truly exact-not-prefix (does `P19-B6` ever match `P19-B6.5a`?); (c) is the alert-sink integration against the real CLI correct (id capture, resolve-by-id); (d) anything in the doc-set config mis-bucketed. C1 (DELETED_COMPONENTS_LOG as CONDITIONAL) + the Obj-12 path-heuristic + the live dead-man heartbeat are the named next-increment items (not in this scaffold) — confirm that deferral is OK or pull them forward.
