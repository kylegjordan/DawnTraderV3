# B-WAKE-STATE-UNSAVED-LOUD — STEP 7 VERIFICATION (CC-A, 2026-10-07)

**No UI surface, stated:** the wake filter runs on Kyle's laptop under each Claude session; it has no screen. The evidence is the installed file, the live process, and the suite run against the installed file and in CI.

## Landing and CI (Step 5)
- Approved branch fast-forwarded onto `migration/aws-supabase` at **`6cb848b22`** (Step-4 r2 approval + Langston's two nits and runbook item).
- CI run `37590389291` at `6cb848b22`: **TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅** (per job). The new step *"Wake filter tests (position save and read failures)"* ran as **uid 1001 (non-root)**: **12 passed, 0 failed, 0 skipped** — the deny arms executed, none skipped.

## Install (Step 6) — by hand, `#1004` class
- `~/.claude/cc-wake-filter.py` written from `git show 6cb848b22:comms-infra/laptop/cc-wake-filter.py` at 07:55:48Z (old file kept as `cc-wake-filter.py.pre-1151`).
- **sha256 installed = blob at `6cb848b22`: `101d646bbb89f66e…`** (both computed; equal). Markers present: `WATCHER-STATE-UNSAVED`, `WATCHER-STATE-UNREADABLE`, `LEASE_V1`.
- The suite run **against the installed file**: 12/12 (Windows; the ACL deny verified refusing before each failure case).

## The PROCESS runs the new code (not just the file)
- CC-A's watcher was armed after the install: lease `{"loop": 5836, "taken_at": "2026-10-07T07:56:32Z"}`; reader process 37520 started **07:56:33Z** (`--once --loop 5836`), 45 s after the install; `cc-wake-count.sh CC-A` = **1**; `.alive` written 07:56:34Z.
- ⚠️ **The other three sessions hold the code they armed with** until their next re-arm (every wake re-arms, so it propagates on their next message). Not measured here; the shared MEMORY §4.5 vocabulary already names the new lines.

## Objectives
| obj | result | where |
|---|---|---|
| OBJ-1 a failed save after a delivery ends the run and says so | PASS (CI uid 1001; laptop; installed file) | suite |
| OBJ-2 writable: saves, no re-delivery | PASS | suite |
| OBJ-3 the stale-resume and end-of-input sites | PASS (line twice / exit 3 diagnostic) | suite |
| OBJ-4 the residual pinned (exit 0, `.alive` still at its keepalive mtime) | PASS | suite |
| OBJ-5 the comment no longer argues the old rule | "A save that still fails RAISES" and "Corrected per Langston" grep 0; `_replace_retrying` present | file |
| OBJ-6 docs + the installed file is the reviewed one | MEMORY §4.5, runbook, SIM; sha256 equal | above |
| OBJ-7 no regression | filter-cuts (incl. `#1142` P4 now asserting rc 0), follow: ALL PASS; CI 4/4 | suite |
| OBJ-8 `--positions` stale reset | PASS + restored control PASS | suite |
| C1 unreadable / unparseable state refuses | PASS ×5 (directory, intact control, zero-length, truncated, undecodable) | suite |
Controls: the pre-fix filter fails all 6 failure cases; `87552a8e3` fails the 3 unparseable bodies.
