# Two small items, settled by consensus (owner + Langston + Coltrane, KD-34) — 2026-11-05

Owner: Infra Claude. Both are proposals for Kyle's list (PM Claude carries them); neither is placed or started.

## Item 1 — the push guard's tsc comparison is tied to the caller's folder

**The defect (measured, re-derived by Langston at `4c58bcbd4`).** `scripts/check-tsc-baseline.mjs` runs tsc with `cwd: cwd()` (`:90`) and normalises message paths against `cwd()` (`:117`); only the baseline path is repo-rooted (`:61`). The push guard (`.claude/hooks/guard-push-tsc-baseline.mjs:184`) spawns it without a cwd, though it has the root at `:62`. From a subfolder every key gets a `../` prefix: Langston ran the real `parseErrors`/`computeDiff` on root- and subfolder-shaped output — ROOT regressions 8, newPaths 0; SUBFOLDER regressions **0**, newPaths **43**, drops 185, and an injected +1 regression is **undetected** from the subfolder. The push is still refused (newPaths at `:388`), so there is no false pass — but the regression arm is dead from a subfolder, and the refusal is the key space collapsing, not the gate working. This gate has had this class twice before (`:52-58`); fixing only the spawn cwd would be the third "moved one layer down".

**Agreed fix (Langston, Coltrane):**
1. `cwd: REPO_ROOT` at `:90`; `root = REPO_ROOT…` at `:117`.
2. Anchor the key where it is minted (`:152`): `relative(REPO_ROOT, resolve(REPO_ROOT, m[1]))`, forward-slashed — the identity on every repo-relative key, so the baseline stays byte-identical (43/43 keys repo-relative today, total 329; no regeneration).
3. No change to the guard (one fix for one defect).
4. A comment above `:388`: `newPaths` is the only live arm there; it must never be touch-filtered as drops are at `:360`.
**Tests, all pure (no tsc run) — REVISED by Coltrane (15:5xZ):** the first draft's test (a) contradicted fix 2 — `relative(REPO_ROOT, resolve(REPO_ROOT, "../../../server/routes.ts"))` escapes the repo and can never yield `server/routes.ts`; once tsc is pinned to `REPO_ROOT`, `parseErrors` cannot infer the old caller folder from that string. So the invariant is split:
- (1) fake `execSync` and assert `runTsc` passes `cwd: REPO_ROOT` — controls `:90` directly;
- (2) `parseErrors` canonicalises the two valid post-fix forms, `server/routes.ts` and the absolute `${REPO_ROOT}/server/routes.ts`, to the same key;
- (3) both resulting maps through `computeDiff` against the real baseline give identical results, an injected +1 regression detected in both;
- (4) the `:388` note made executable: an unknown path stays in `newPaths` and makes the derived verdict fail (the comment stays, but is not the control).
Real tsc's behaviour under `cwd: REPO_ROOT` rests on my root-run measurement (329 = baseline, OK), not on these tests.
**Status:** Coltrane CONFIRMED Item 1 as written (at `972b06c22`). Langston AGREED to the fix (with 2 and 4) and to all four revised tests (re-derived at `38cfec121`). **Consensus reached on Item 1 as written here.**

## Item 2 — a root-made snapshot of staging's root crontab, so archival-health checks schedules against the real ones

**The gap (measured; re-derived by Langston as `deploy`).** Every archival job `B-DISK-FILE-TIERING`'s archival-health watches runs from ROOT's crontab (`/var/spool/cron/crontabs/root`, 0600; `deploy` cannot list the directory). So `CheckSpec.schedule` (`server/scripts/b-storage-archival-health.ts:56-77`) is a copy, fenced only against a header comment. **The strongest case (Langston):** the pre-audit already commits to *"Step 7 compares every schedule to the live root crontab"* (`B_DISK_FILE_TIERING_PRE_AUDIT.md:176`) — a one-time human comparison. This makes it a standing instrument.

**Half (1) — Infra Claude, root, staging.**
- A committed writer + systemd timer, daily at **01:00Z** (well clear of the 05:00Z check), recorded at install (`#1004` class: a root-side executable must have provenance).
- It runs `crontab -l -u root`; only on success it publishes, by same-directory atomic rename, into `/var/lib/dawntrader-cron/` (not writable by deploy), a file `root:deploy 0640`. A failure keeps the previous file, so freshness turns red.
- **A projection, never argv (Langston C-2, tightened by Coltrane):** per active line — the five schedule fields and the matched script-path token ONLY (never the command text before it: an env assignment such as `TOKEN=… /path/script` precedes the path), and a **root-keyed HMAC-SHA256** of the full line (key root-only 0600; a raw sha256 of a secret-bearing line is an offline guessing oracle) for identity and duplicate detection — plus a header line with its UTC time. Comments, blanks and `SHELL`/`PATH`/`MAILTO` lines are excluded. A future root line carrying a token can never reach deploy by construction.

**Half (2) — OLD Claude's, in archival-health (its own slot on Kyle's list; that batch is at Step 4).**
- **Five contracts (Coltrane):** the four `CheckSpec` entries plus archival-health's own 05:00 line (its second in-code copy is `server/scripts/staging-liveness-watchdog.mjs:290-300`).
- **An explicit `cronMatch` field per contract (Langston C-1)** — the script path as the crontab invokes it. **Exactly one** active match: zero or two-plus → `misconfigured`, never first-match-wins (a commented-out old line naming the script is how first-match reads a dead job as configured).
- **Exact equality of the five fields on normalised whitespace only (C-5)** — no semantic cron parsing; `00 5` vs `0 5` or `@daily` fails loud, the correct direction.
- **Freshness (Coltrane):** the snapshot's header time must be at or after the writer timer's most recent scheduled fire — no fixed 26 h window.
- **Owning crontab (Langston (b)):** each contract resolves against the crontab of the user that owns its line — root via the snapshot, deploy via a live `crontab -l` (deploy's crontab is NOT snapshotted: it is readable live). A contract found in neither → `misconfigured`, which catches a job moved between crontabs.
- Unreadable or missing snapshot, stale, zero/multiple matches, field drift → each `misconfigured`, each mutated red.
- **One authority (C-3):** `CheckSpec.schedule` is the source of truth; the scripts' `Cron line` header comments are retired or machine-regenerated, and the reach statement moves to the check.
- **What it does NOT close, stated in the module header (C-4):** it proves what root's crontab SAYS, not that any job RAN, and it cannot see a stopped cron daemon; a dead archival-health still pages nobody.

**Status:** Langston AGREED with C-1..C-5 and (a)/(b). Coltrane AGREED with both designs, then tightened the projection (script-path token only; HMAC not raw sha) — a narrowing within Langston's C-2 intent ("closing this class by construction"), so it needs no new ruling. **Consensus reached on Item 2 as written here.**
