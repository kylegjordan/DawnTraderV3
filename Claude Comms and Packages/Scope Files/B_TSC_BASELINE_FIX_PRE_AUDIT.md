# B-TSC-BASELINE-FIX (#579) — Pre-Audit (Step-2)

**Owner:** CC-B · **Read at:** `origin/migration/aws-supabase` · **change-class:** non_architecture (CI-tooling script + its data; SIM/SYSTEM_MANUAL N/A).

## 1. The hole (code+data-confirmed; Langston independently re-read)
`check-tsc-baseline.mjs` compared per-(file,code) COUNTS; the gate failed only on `current > baseline` (`:178`), so `current < baseline` fell to `drops[]` (`:184-193`) and passed. The baseline count is a stale CEILING; as errors are fixed but the baseline isn't `--sync`'d down, HEADROOM accumulates and a NEW error under the ceiling passes green. **Measured: `.tsc-baseline.json` had `vts-runner.ts TS2339: 25` vs a current run of 6 → 19 headroom** — exactly how A0's 2 new `TS2339`s passed. Format was `errors: {code: count}` — no per-error identity.

## 2. parseErrors message-identity is sound (Langston-confirmed)
The regex (`:69` originally) matches ONLY the primary error line (`file(line,col): error TSxxxx: msg`); tsc's continuation/type-expansion lines never start with `file(line,col): error`, so they're not captured. The primary-line message is short + stable + carries the distinguishing detail (property/type name). So (file, code, message) is a valid identity.

## 3. Fix (approach A, Langston-signed-off; B rejected because it misses the 1-for-1 swap)
- `parseErrors` now captures the normalized message → `counts: {file: {code: {message: n}}}`.
- Pure exported `computeDiff(counts, baselineFiles)` gates on identity: a current (file,code,message) NOT in the baseline (baselineCount 0) is a regression regardless of (file,code) headroom; a count-rise on the same message still fails. `compareBaseline`/`syncBaseline` use the nested shape; `sumFileErrors` helper for totals.
- Baseline REGENERATED to **v2** (`format` field records the change): `394` errors / 48 files (down from v1 `490`/64 — the tight regen ALSO eliminates the existing headroom). phase_tag/context were all "TBD" placeholder in v1 → nothing meaningful lost.
- CLI dispatch guarded by `isMain` (`import.meta.url === pathToFileURL(argv[1])`) so the test can `import` the pure functions without triggering a tsc run/exit. Exports: `parseErrors, normalizeMessage, sumFileErrors, computeDiff`.

## 4. Test (OBJ-3) — the 3-case proof on the REAL computeDiff
`server/tests/unit/b-tsc-baseline-fix.test.ts` (5/5): parseErrors nesting; **CASE 1** new distinct message UNDER the (file,code) ceiling → CAUGHT (the #579 incident; a count-gate passes it); **CASE 2** same message shifted line → PASSES; **CASE 3** the 1-for-1 swap (count UNCHANGED, distinct message) → CAUGHT — the case a per-(file,code)-count gate (approach B, even zero-headroom) silently passes; + count-rise-same-message → caught. **Negative-proof note:** a live single-error inject would fail under BOTH old and new logic on the now-tight baseline (count rises), so it can't isolate the fix — CASE 3 (count-flat) is the only clean demonstration, and it runs the real exported computeDiff.

## 5. Verification done
new test 5/5 · `--generate` produced the v2 baseline · `compareBaseline` PASSES against it (394=394, exit 0 — full parse→computeDiff path) · node `--check` + `--help` confirm the script runs standalone (isMain guard works). No deploy (CI-tooling; not runtime). CI will run the gate against the v2 baseline.

## 5a. ★ DETERMINISM FINDING (surfaced during verification — a second, deeper reliability hole; folded into #579)
While verifying, the compare flickered: 401 errors right after a `git pull`, 394 on the next run. Root cause: `tsconfig.json` sets `incremental: true` + a persisted `tsBuildInfoFile`, so `runTsc()` inherited whatever cache state existed — a STALE buildinfo (post-pull) reports a partial/incorrect set (401), and the exact (file, code, MESSAGE) attribution of long anonymous-type errors shifts with cache depth. So a baseline generated in one cache state throws FALSE regressions when compared in another — and message-identity (approach A) is MORE sensitive to this than the old count gate. **Proof it was live: regenerating the baseline via a deterministic full check changed 43 of the committed baseline's message-identities (same 394 total) — 43 cache-artifacts that would have failed CI (CI is always cold: npm ci wipes node_modules → no buildinfo).**
**Fix:** `runTsc()` now runs `npx tsc --noEmit --incremental false` — disables the cache entirely (no read/write) → every run is a full check → generate, compare, and CI are byte-identical. Verified: `--incremental false` returns 394 on back-to-back runs even with a warm buildinfo written in between; no `tsBuildInfoFile` config conflict; no CI slowdown (CI already runs cold). Baseline REGENERATED under the deterministic path (the authoritative, CI-matching identities).

## 5b. ★ PORTABILITY FINDING (cold CI on 9103f6402 caught it; Step-3c)
The first cold CI run FAILED the gate: 9 identical errors reported as 9 drops + 9 regressions, differing only by an ABSOLUTE PATH baked into the tsc message — `import("C:/DawnTraderV3-new/server/routes")` locally vs `import("/home/runner/work/DawnTraderV3/DawnTraderV3/server/routes")` on CI. Message-identity was not host-portable. **Fix:** `normalizeMessage` now canonicalizes the repo-root prefix to `<ROOT>` — (1) strips the actual runtime cwd (case-insensitive), (2) a host-independent anchor pass strips any absolute prefix before a known repo top-level dir (server/client/shared/node_modules/scripts/drizzle/migrations), covering every dev clone + CI + staging. Safe because the normalizer runs identically at generate + compare, so canonicalizing host-varying text can only under-normalize (false regression), never hide a real error. **Verified:** portability unit test (Windows/Linux/analyst-clone paths → identical identity); regenerated baseline has 0 absolute paths + 9 `<ROOT>` tokens; compare exit 0. Cold CI re-run is the final proof.

## 6. Blast radius
Edits: `scripts/check-tsc-baseline.mjs` (logic + exports + guard), `.tsc-baseline.json` (regenerated v2 — big but mechanical diff), new test. No app-code change; the .mjs is imported only by the new test. Board: n/a (isolated CI-tooling files).
