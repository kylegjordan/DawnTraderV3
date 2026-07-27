# B-TSC-BASELINE-FIX (#579) — Scope

**change-class: non_architecture** (CI/governance-tooling script + its baseline data; no trading engine / strategy / regime / filter / signal-pipeline / math change → SIM + SYSTEM_MANUAL N/A).
**Owner:** CC-B (NEW Claude) · **Drafted:** 2026-07-27 · **Issue:** #579.

## 1. The hole (root cause, code+data-confirmed)
`scripts/check-tsc-baseline.mjs` compares tsc output to `.tsc-baseline.json` as **per-(file,code) COUNTS**. The gate fails only when `current_count > baseline_count` (`:178`); `current < baseline` is an allowed "drop." **The baseline count is a stale CEILING** — as errors get fixed but the baseline isn't `--sync`'d down, HEADROOM accumulates. Confirmed: `vts-runner.ts` baseline `TS2339: 25` while a recent run had `6` → **19 errors of headroom**. A NEW error that fits under the stale ceiling passes GREEN. That is #579 (A0's 2 new `TS2339`s at `vts-runner.ts:4957/4979` passed green — they fit under 25).

The baseline stores `errors: {code: count}` — **count-only, no per-error identity**, so a new error is indistinguishable from headroom.

## 2. Fix — MESSAGE-IDENTITY tracking (recommended; approach A)
Track errors by **identity**, not just count, so a new error is detected regardless of (file,code) headroom.
- **Identity = (file, code, primary-line MESSAGE).** ★ `parseErrors`'s regex only matches the PRIMARY error line (`file(line,col): error TSxxxx: <message>`); the multi-line type-expansion continuation lines are NOT captured — so the message is the short primary-line text (e.g. `Property 'costFeeFraction' does not exist on type 'OpenVirtualTrade'.`, `No overload matches this call.`), which is stable and carries the distinguishing detail (the property/type name that makes a NEW error distinct). Normalize: collapse whitespace + strip volatile `... N more ...` counts; keep it human-readable (the file's ethos).
- **Baseline format:** `errors: {code: count}` → `errors: {code: {"<normalized message>": count}}` (still per-file, still human-readable/reviewable; regenerate as part of this batch).
- **Compare:** for each current (file, code, message): regression if the (message) is NOT in the baseline for that (file, code), OR its count exceeds the baseline count. This closes the headroom hole — a new error has a new message-identity even under a stale (file,code) ceiling.
- **Residual (documented, benign):** re-introducing the SAME error message at a new line (same identity) isn't flagged — arguably "the same error"; the A0 case was DISTINCT messages, caught.

## 3. Alternative considered — NO-HEADROOM invariant (approach B, NOT recommended)
Also fail when `current < baseline` (headroom exists), forcing the baseline `--sync`'d tight on every fix. Tiny code change, but (a) a WORKFLOW change — every error-fixing commit must sync the baseline in the same commit, and (b) a big one-time sync-down of the ~existing headroom before it can pass. More disruptive than A for the same guarantee. **Langston: steer to B (or a hybrid) at Step-1 if you prefer the tight-baseline discipline over the format change.**

## 4. Objectives
- **OBJ-1:** `parseErrors` captures the normalized primary-line message; `generateBaseline`/`syncBaseline` write the `{code: {message: count}}` shape; `compareBaseline` gates on identity (new message OR count-rise).
- **OBJ-2:** regenerate `.tsc-baseline.json` to the new shape (preserving `phase_tag`/`context`/`frozen_*` where possible; document the regeneration).
- **OBJ-3:** a unit test proving the hole is CLOSED — a synthetic "new error, distinct message, under the (file,code) ceiling" is now caught (would have passed under the old count-gate), and a "same message, shifted line" still passes.
- **OBJ-4:** the silent-tsc-crash sanity check + drops-reporting + `--sync`/`--generate` modes stay working.

## 5. Verification
Unit test (OBJ-3) green · run the checker against current head (should still PASS — no NEW distinct-message errors vs the regenerated baseline) · a NEGATIVE proof (inject a synthetic new-message error → gate FAILS) · tsc gate + full vitest unaffected · CI 4/4 green. No deploy (CI-tooling only; not runtime).

## 6. Governance
Tier-1 (completion report, BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES #579 RESOLVED, MEMORY) + pre-audit. SIM/SYSTEM_MANUAL N/A (CI-tooling, not trading architecture). PHASE_19_PLAN: a line (governance-tooling, Phase-19-era).
