# B-DTREVIEW-ABSENCE-PROVENANCE — SCOPE

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 1w1 (on Kyle's agreed list; scope moved 2026-11-14 from "reproduce" to "change the review read path", Langston ruling (b)) · **Issue:** `#1181` · **Reviewer:** Langston

## Why this batch exists

Objective 1 of the original row was "reproduce the false absence, or record why it does not reproduce". Done 2026-11-14 (`c0250099b`). It was not a false absence: Langston's own session record shows the four refusals of `2bfe98d4d` at 06:59:54Z. The commit had been pushed to a side branch at 06:55:23Z and reached the mirror on the 07:00:04Z sync pass. `dt-review` fetches only `migration/aws-supabase`, so at that moment the mirror genuinely lacked the commit. Langston re-derived this and withdrew the claim (retraction in his `LEDGER.md`; ruling Discord `1571115568788934797`).

**What remains is real.** For up to 15 minutes after a side-branch push, `dt-review` truthfully says a commit is "not in the mirror", and a reviewer can read that as "not at origin". That is how `#1181` was filed, by a reviewer who had both timestamps in hand. Langston: *"the 0–15 min window is not a corner: Step-4 dispatches land minutes after the push, so the gap is the hot path."*

**The batch:** when a pinned read misses, `dt-review` asks origin for that exact commit before refusing. Its refusal then says which of three things happened: origin does not have the commit, the fetch failed or the lock was busy, or no origin check was possible.

## 1.a — Architectural read

- **System Impact Map**, Langston Server row (`:1375`) and the B-CREDENTIALS-PRIVATE-REPO OBJ-4a block (`:3117-3127`):
  - `dt-review` fetches the review branch only, under the shared lock, with auto-gc off.
  - The mirror `/srv/dawntrader-backup.git` is langston-owned, its push URL is `DISABLED://`, it has no configured `remote.origin.fetch`, and `core.logAllRefUpdates=always`.
  - `dt-fetch.lock` is shared with `dt-backup-sync.sh`. `dt-review` waits 90 s for it and `dt-backup-sync` waits 300 s.
  - The success stamps `DT_REVIEW_FETCH_OK` and `DT_SYNC_PASS` supply the ages that every refusal quotes.
- **System Manual:** silent on `dt-review`. That is correct, not a gap: this is crew tooling on Helsinki, with no trading architecture involved.
- **`LANGSTON_ARCHITECTURE.md`:**
  - `:128-131`: every Langston read goes through `dt-review`, pinned to the stamped sha.
  - Change log `:191`: OBJ-4a, installed 2026-09-29 from `445b6a505`.
- **Census of everything that references `dt-review`** (`git grep -l dt-review -- comms-infra scripts .github ':!*.md'` at `4ee9b3069`):
  - `comms-infra/helsinki/dt-review` (the tool).
  - `comms-infra/helsinki/tests/dt-review_tests.sh` (its suite).
  - `comms-infra/discord/deploy.sh` (installs it: group `readers`, `:84`).
  - `comms-infra/discord/discord-langston-bridge.py` (`:218-235`, the prompt text that teaches Langston the read forms).
  - `comms-infra/discord/dt-push-notice.sh` (`:90`, the watched-files list).
  - `comms-infra/discord/live-vs-sha.py` (`:22`, a comment).
  - `comms-infra/codex/coltrane-review` and `coltrane-repo-refresh` (parity comments).
  - `scripts/inventory/items_v3.json` (inventory).
  - The tool itself has no programmatic caller. Langston runs it by hand inside his sessions.

## 1.b — Provenance read

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, `LANGSTON_ARCHITECTURE.md` change log, and `git log -S "dt-review" --reverse` (not path-limited). `bridge/canonical/` does not apply: the tool was created 2026-07-23, after the governance change.

**Tier 1, `comms-infra/helsinki/dt-review` (behaviour changes):**
- Created 2026-07-23 by `B-REPO-RELOCATE` (`2a42c49e0`: *"Langston reads off the review branch; the over-built 929MB clone removed"*). The change-log row at `LANGSTON_ARCHITECTURE.md:196` reads *"Pull-before-read enforced in the tool"*.
- The tool's header carries Kyle's rule verbatim: *"PULL FROM GITHUB FIRST so the files are current. Every call fetches the branch before it reads."*
- The pinned reader came from `a1ea15b50` (B-CREDENTIALS-PRIVATE-REPO P2), verbatim: *"a positive control before any absence claim: an unreadable branch head refuses with git's words; a missing path quotes git's own message instead of saying 'absent'"*.
- **Disposition (2), relevant but needs updating to today's intent.** The intent was always "a refusal never claims more than the tool saw". The pin-miss refusal is accurate about the mirror, but because it only fetches one branch, a reader takes it as a claim about origin.

**Tier 2 (read or called, unchanged):**
- `dt-backup-sync.sh`: the 15-minute all-branch sync (`+refs/heads/*:refs/heads/*` with `--prune`, `:137`), the shared lock, and `gc --auto` inside the lock (`:231`). It is the reason a side branch arrives late. Intent: a backup gated by reproduction. Disposition (1).
- `deploy.sh --only readers`: the installer, intent "installs from a reviewed sha" (`a1ea15b50`). Disposition (1).
- `coltrane-review`: by design it has no network, so it cannot fetch on demand. It refuses with the mirror's refresh age instead (`:9-14`). Disposition (1). **Out of scope, stated:** Kyle's standing parity rule ("what you add for Langston, add for Coltrane") cannot apply to the fetch itself. Whether Coltrane's refusal wording should also name its sync gap is judgement call J4 below.

**The five-disposition read on `dt-review`'s existing pin-miss refusal branches** (Langston's §13 note) is objective OBJ-3. Each branch is read at the ref and dispositioned in the pre-audit.

## Objectives

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | A **full 40-character** pin that the mirror lacks is fetched from origin **by sha** before any refusal, under the same lock hold as the branch fetch. If it arrives, it is served exactly as today (re-hashed, OFF-BRANCH labelled when not on the review branch). | Test: a side-branch commit pushed after the last sync pass is served on the first call (objective 1 of the old row, run forward). Control: the same test against the installed copy refuses. |
| **OBJ-2** | **Three-way, self-describing refusals** (Langston condition 1). (a) *origin does not have this commit* may be written **only** after a by-sha fetch that actually ran and failed with git's "not our ref" class of error. (b) *the fetch failed / timed out / the lock was busy*, with git's own first line. (c) *no origin check was made*, for a **short** pin (GitHub serves a by-sha fetch only for a full id), or when the branch fetch was not attempted. No refusal states origin's absence after a fetch that did not run. | Tests for each: a fabricated full sha origin lacks gives (a); a fetch pointed at an unreachable remote gives (b); a short pin miss gives (c) and asks for the full id. Controls: each wording is absent from the installed copy's output on the same input. |
| **OBJ-3** | The **five-disposition read** on every existing pin-miss branch (blob or tree sharing the prefix, unresolvable tag, ambiguous prefix, damaged commit, unreadable store, plain miss), each kept, reworded or removed with a reason. | Pre-audit table at the ref; any change gets its own test. |
| **OBJ-4** | **The fetched commit does not depend on gc timing** (condition 2). It is anchored under `refs/dt-review/pins/<sha>`, a namespace that `dt-backup-sync`'s `--prune` cannot touch because its refspec covers only `refs/heads/*`. **No `--depth`.** The mirror stays complete and non-shallow. | `git rev-parse --is-shallow-repository` is `false` after the test. The anchor ref exists. A `gc --prune=now` on the test clone keeps the object. Control: without the anchor, the same gc drops it. |
| **OBJ-5** | **Latency is bounded and stated** (condition 3). The extra fetch adds at most `FETCH_TIMEOUT` (120 s) and never a second lock wait, because it runs inside the existing hold. The `busy` and timeout wording is unchanged. The measured typical added time for a successful pin fetch is recorded. | Timed test runs (typical and timeout), recorded in the change list. |
| **OBJ-6** | **Shipped = committed and installed** (condition 4, `#1004` class). `deploy.sh --sha <head> --only readers`, with the installed `/usr/local/bin/dt-review` sha256 equal to the blob at the shipping head, quoted in Step 11. | sha256 comparison on Helsinki at Step 7, re-derived by Langston at Step 8. |
| **OBJ-7** | **Docs follow the change.** The System Impact Map's `dt-review` row (what it fetches, the new ref namespace as mirror state). A `LANGSTON_ARCHITECTURE.md` change-log row. The bridge prompt text (`discord-langston-bridge.py:218-235`) only if it describes pin-miss semantics (checked in Step 2; a bridge install is out of scope unless needed). | Step-10 ledger. |

**Already done in this row, not re-done:** condition 6. The false claim in `#1181`'s title and in plan row 1w1 was corrected in `4ee9b3069`; the error record stays in the issue body and in Langston's `LEDGER.md`.

## Judgement calls I want attacked

- **J1. Short pins.** I propose a short-pin miss refuses as (c), "no origin check made, give the full 40-character id", rather than fetching all ~135 branches to find a prefix match. Reason: a full-branch sweep is a different, heavier operation under the shared lock, and the caller always has the full id one command away.
- **J2. Pin refs accumulate.** One ref per side-branch miss, never removed by `dt-backup-sync`. They are rare (side-branch reviews inside a 15-minute window) and each one keeps only objects that origin also has. I propose leaving them, with the count visible in the System Impact Map. The alternative is pruning a pin once its commit is reachable from a head, which adds a walk to every call.
- **J3. Where the fetch sits.** Inside the existing lock hold, which means the pin check moves before the lock release. The alternative is a second lock acquisition, which risks a 90 s wait that reads as a hang. I propose inside.
- **J4. Coltrane.** His reader cannot fetch (no network by design). I propose no change to `coltrane-review` in this batch. Whether its refusal should name its sync gap the same way is a separate question for him.

## Out of scope

- Any change to `dt-backup-sync.sh`'s schedule or refspecs.
- `coltrane-review` (J4).
- The bridge's sha stamping (`resolve_review_ref`).

## Verification standard

Tests run on Helsinki as langston in `/tmp/dtr-test` against `--shared` clones, per the suite's existing harness. Every new check has a CONTROL that fails against the installed copy. Langston re-derives at Step 8 on the box.
