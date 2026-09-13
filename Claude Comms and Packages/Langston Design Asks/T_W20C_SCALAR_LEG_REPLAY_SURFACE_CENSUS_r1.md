# T-W20C-SCALAR-LEG — REPLAY-SURFACE CENSUS r1 (CC-B, 2026-09-13)

**Purpose:** the census Langston made a gating item, redone against the **transitive closure** of the
harness entry point rather than its direct imports. **It overturns my own previous report.**

## 0. WHAT I GOT WRONG, STATED FIRST

I reported the replay surface changed on **3 distinct days / 4 commits** and told Langston his figure of
20 days was not a miscount but measured a different thing. **That was wrong, and it was wrong in my own
favour** — it made the leg look buildable. The error was the population: I enumerated the harness's
**direct imports** (6 modules) and called that the surface. Langston's correction — *"direct imports are
not the replay surface … the surface is their transitive closure"* — is right, and his `20` was if
anything an UNDERCOUNT.

**MISTAKE: wrong-object [T-W20C-SCALAR-LEG] — I measured direct imports and called it the replay surface; the surface is the transitive closure, which is 254 files, not 6.**

## 1. THE INSTRUMENT

Langston's own suggestion, run verbatim: `tsc --listFiles` on the harness entry.
The project `tsconfig.json` does **not** include `scripts/**`, so the harness is in **no** compilation
graph; the census used a throwaway config extending the base (same `paths`, same `moduleResolution`)
with the harness as the single root file:

```
tsconfig.w20c-census.json  ->  extends ./tsconfig.json, include: [], files: [scripts/b5-w20c-provenance-replay.ts]
npx tsc -p tsconfig.w20c-census.json --listFiles   (node_modules excluded from the count)
```

## 2. THE CLOSURE

| measure | value |
|---|---|
| repo files in the harness transitive closure | **254** |
| of which touched inside the pinned window | **73** |
| `server/services/signal-orchestrator.ts` in the closure | ⛔ **YES** |

⛔ **The orchestrator is in the closure, six hops from the harness, and it enters on a VALUE import
(`active-portfolio-manager.ts:6`, `import { SignalOrchestrator } from './signal-orchestrator'`), not a
type-only one.** Chain, from `tsc --explainFiles`:

```
scripts/b5-w20c-provenance-replay.ts
  -> server/services/strategy-engine.ts
    -> server/storage.ts
      -> server/services/guardrail-policy.ts
        -> server/services/active-engine-service.ts
          -> server/services/active-portfolio-manager.ts
            -> server/services/signal-orchestrator.ts
```

My earlier claim that the harness "does NOT import signal-orchestrator.ts" was true of the DIRECT
imports and false of the surface. `storage.ts` is the edge that drags the whole active engine in.

## 3. THE CENSUS, over the pinned window (2026-08-01T00:00:00Z .. 2026-09-11T20:09:47Z exclusive)

| measure | previously reported | **measured over the closure** |
|---|---|---|
| commits touching the surface | 4 | **163** |
| distinct days | 3 | **25** |
| closure files touched | 6 (the direct imports) | **73 of 254** |
| line churn on closure files | not measured | **+10,909 / −1,923 across 321 file-touches** |

**Commits per day** (25 days, 2026-08-06 .. 2026-09-11):
```
2026-08-06  3     2026-08-20  9     2026-08-28  25    2026-09-06  7
2026-08-07  11    2026-08-21  9     2026-08-30  8     2026-09-07  2
2026-08-11  1     2026-08-22  4     2026-08-31  5     2026-09-08  1
2026-08-16  3     2026-08-23  3     2026-09-02  4     2026-09-09  1
2026-08-17  13    2026-08-24  2     2026-09-03  13    2026-09-11  21
2026-08-18  1     2026-08-26  6     2026-09-04  2
                  2026-08-27  1     2026-09-05  8
```

**Most-changed closure files:**

```
 36  server/services/active-execution-engine.ts
 29  server/services/signal-orchestrator.ts
 18  server/exchanges/kraken/kraken-websocket-adapter.ts
 18  server/storage.ts
 17  server/services/live-pricing-adapter.ts
 14  server/services/vts-runner.ts
 14  shared/schema.ts
 11  server/services/passive-archive/ohlc-batch-writer.ts
 10  server/core/calculations/level-basis.ts
 10  server/core/calculations/venue-price-grid.ts
```

**The four commits I previously reported are all still in the census** — they were real, they were just
4 of 163, and `152367088` touches 14 closure files rather than the one hunk I described.

## 4. WHAT THIS DOES TO THE LEG — the consequence, not just the correction

The leg's design rested on the replay surface being near-invariant across the window, so that a
divergence could be attributed to drifted windows or recompute rather than to code movement. **163
commits and +10,909 lines over 73 files does not support that premise as stated.** I am NOT claiming
the leg is dead — a file being in the closure is not proof its changed lines EXECUTE on the replay
path, and I have not established that either way. **But the burden has inverted:** invariance is now
the thing that must be demonstrated, not assumed.

⚠️ **NOT ESTABLISHED, and I am explicitly not claiming it:** whether the orchestrator's changed lines
are reachable from `strategyEngine.detectVWAPPullback(...)`, the only call the harness makes. A narrow
grep for module-level instantiation in `signal-orchestrator.ts` came back empty, but that grep is a
weak instrument for an absence and I ran no positive control, so **it carries no weight** (`#453`).
The reachability triage is a Step-4 item.

## 5. RE-DERIVATION

Everything above is re-derivable at `origin/migration/aws-supabase`:
- closure: the `tsc` invocation in §1
- census: `git log --since=2026-08-01T00:00:00Z --until=2026-09-11T20:09:47Z --name-only -- <the 254 closure paths>`
- the per-commit, per-file diffstat is committed alongside this file as
  `T_W20C_SCALAR_LEG_REPLAY_SURFACE_CENSUS_r1_diffstat.txt` (163 commits, 321 file-touches).
