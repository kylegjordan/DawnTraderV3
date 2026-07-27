# B-TSC-BASELINE-FIX (#579) — Completion Report

**Owner:** CC-B (NEW Claude) · **Closed:** 2026-07-27 · **change-class:** non_architecture (CI/governance-tooling; SIM/SYSTEM_MANUAL N/A) · **Langston:** APPROVED (Step-4 at `b7e34ea`, addendum at `9103f6402`, contingent on cold CI green).

## What #579 was
CI's `check-tsc-baseline` gate could pass a **NEW** type error GREEN if the file already held a baselined error of the same code. It graded per-(file, code) COUNTS against a frozen baseline; a stale ceiling with accumulated headroom absorbed new errors. Surfaced by A0's Step-4 (two phantom `TS2339`s at `vts-runner.ts:4957/4979` went green under a 19-error headroom).

## Objectives — all YES
- **OBJ-1 (message-identity gate) — YES.** `parseErrors` now captures the normalized tsc primary-line MESSAGE → nested `counts {file:{code:{message:n}}}`. A pure, exported `computeDiff(counts, baselineFiles)` gates on (file, code, MESSAGE): a current identity absent from the baseline (baselineCount 0) is a regression regardless of (file,code) headroom; a same-message count-rise still fails. `compareBaseline`/`syncBaseline` use the nested shape; `sumFileErrors` sums it. This is exactly the "(file, code, message)" candidate Langston listed on the #579 entry.
- **OBJ-2 (baseline regenerated) — YES.** `.tsc-baseline.json` → v2 (`format` field records the change): 394 errors / 48 files, message-keyed. Regenerated under the deterministic path (below), so its identities are the authoritative CI-matching set.
- **OBJ-3 (proof the hole is closed) — YES.** `server/tests/unit/b-tsc-baseline-fix.test.ts`, 5/5, all against the REAL exported fns: parse-nesting; **CASE 1** new distinct message UNDER the ceiling → CAUGHT (the #579 incident a count-gate passes); **CASE 2** same message shifted line → PASSES; **CASE 3** the 1-for-1 swap (count UNCHANGED, distinct message) → CAUGHT — the case even a zero-headroom count invariant (approach B) misses, which is why Langston steered to A; + same-message count-rise → CAUGHT.
- **OBJ-4 (modes preserved) — YES.** `--generate`/`--sync`/`--regen-acknowledged` + the silent-tsc-crash sanity check (now on the re-derived `derivedTotal`) + drops reporting all intact. CLI dispatch `isMain`-guarded (`import.meta.url === pathToFileURL(argv[1])`) so the test imports the pure fns without triggering tsc.

## ★ Three deeper reliability holes surfaced during verification (each caught by real cold-CI evidence, folded into #579)
Message-identity is only reliable if the message is DETERMINISTIC and HOST-PORTABLE. Verification (and two red cold-CI runs) surfaced three ways it wasn't, each fixed:
- **Step-3b — determinism (`--incremental false`).** The compare flickered: 401 right after a `git pull`, 394 next run. `tsconfig` sets `incremental:true` + a persisted `tsBuildInfoFile`, so `runTsc()` inherited cache state — a stale buildinfo (post-pull) reports a partial/wrong set, and rendering shifts with cache depth. Regenerating deterministically changed 43 of the committed baseline's identities (same 394 total) — cache-artifacts that would have failed cold CI. Fix: `npx tsc --noEmit --incremental false` (no cache read/write; CI is cold anyway via npm ci). All three call sites share the one `runTsc()`.
- **Step-3c — path portability (`<ROOT>`).** 1st cold CI FAILED: 9 identical errors keyed apart because tsc embeds ABSOLUTE paths in messages (`import("C:/DawnTraderV3-new/…")` local vs `import("/home/runner/work/DawnTraderV3/DawnTraderV3/…")` CI). Fix: `normalizeMessage` canonicalizes the repo-root prefix to `<ROOT>` (runtime-cwd strip + a host-independent anchor pass before known repo dirs). Cut regressions 9→2.
- **Step-3d — truncation divergence (`--noErrorTruncation` + 300-clip).** 2nd cold CI FAILED on 2 long drizzle `TS2741`s: tsc truncates long type messages at a fixed CHARACTER budget that includes the host-varying-length paths, so a long-path host truncates at a different point (content path-normalization can't recover). Fix: `--noErrorTruncation` renders the full type identically on every host; `normalizeMessage` then clips to a fixed 300 chars (safe — applied to the now host-identical string; keeps the property+table+type-head discrimination; holds the baseline at 64KB).
Safety of all path/clip normalization: it runs IDENTICALLY at generate + compare and only erases host-varying prefix/tail, so it can only ever under-normalize into a (loud, caught) false regression — never collapse two real errors into a hidden one (Langston verified this property independently).

## Verification
- Unit test **6/6** on the real exported fns (the 5 identity cases + a PORTABILITY case: Windows/Linux/analyst-clone paths → identical identity).
- `--incremental false` returns 394 back-to-back even with a warm buildinfo between runs (deterministic); no `tsBuildInfoFile` conflict; no CI slowdown.
- Regenerated baseline: 394 errors / 48 files, message-keyed, **0 absolute paths**, max message 300 chars, 64KB.
- **Cold CI — the definitive proof — GREEN:** run `30298671677` on `a587408bd`, all 4 jobs success (TypeScript Check / Test Suite / Build / Docker Build). (Two earlier cold runs went red and drove Steps 3c/3d — the gate proving itself.)
- No deploy (CI-tooling only; not runtime).

## Governance files updated
RUNNING_ISSUES.md (#579 RESOLVED), BATCH_CATALOG.md, PHASE_HISTORY.md, PHASE_19_PLAN.md (governance-tooling line), this completion report, B_TSC_BASELINE_FIX_SCOPE.md + _PRE_AUDIT.md, MEMORY_CC_B.md, Langston's /home/langston/MEMORY.md (§10.b). SIM/SYSTEM_MANUAL: N/A (CI-tooling, not trading architecture).

## Note for the crew (method lesson)
The gate now runs cold + deterministic + message-keyed. Two consequences for everyone: (1) a benign refactor that changes a tsc message's TEXT will read as a regression and force a deliberate `--sync`/`--generate` in the same commit — correct governance direction (Langston flagged this at Step-4), just expect it; (2) because the gate is now honest and tight, keeping the branch tsc-clean is a shared responsibility — a genuinely new error will red CI rather than hide under headroom.
