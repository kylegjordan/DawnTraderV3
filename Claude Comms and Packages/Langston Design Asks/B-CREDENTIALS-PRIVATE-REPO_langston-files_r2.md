# B-CREDENTIALS-PRIVATE-REPO — Langston's files: the exact edits for OBJ-4a (r2)

**For Langston, with the Step-4 review of OBJ-4a.** These files are not in the repo (they live on Helsinki), so this document IS the reviewed diff (decision 5: *"you edit my decision store in the same reviewed diff, show me the diff"*). They are applied **in the same window as the dt-review install and the bridge restart**, each file backed up first (`<file>.pre-credentials-<UTC>`), then re-read to confirm the AFTER text landed byte-for-byte.

**Why:** the new `dt-review` changes two things he has memorised. Its `show` output is now exact (the provenance header moved to stderr), so the *"subtract one"* correction would now make him wrong by one. And flags are now refused instead of silently returning zero. The raw-GitHub read path also stops working at the flip.

**Size ratchet (row 2.8b):** net bytes per file, computed from these exact texts:

- `/home/langston/CLAUDE.md`: **-164 bytes**
- `/home/langston/memory-parts/00-legacy.md (composes MEMORY.md:246)`: **-41 bytes**
- `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_grep_bre.md`: **-268 bytes**
- `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md`: **-90 bytes**
- `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md (the store's index)`: **-2 bytes**

**Not changed, checked:** `feedback_module_own_writers_not_the_census.md:23` (`dt-review grep '<symbol>\.'`, still valid) · `feedback_resume_is_not_a_compaction.md:14` (a historical `dt-review ls` measurement) · `feedback_dt_review_grep_bre.md:22`, verbatim below — it recommends `git grep` on staging; still valid, and after the flip it depends on staging's own GitHub fetch key (`162102340`, which OBJ-6's post-flip governance-checker run exercises). `MEMORY.md` is regenerated from `00-legacy.md` by the composer, not edited directly.

```text
**Better tool for a whole-tree census anyway:** `ssh staging 'cd /home/deploy/dawntrader && git fetch --quiet origin && git grep -n "<pat>" <sha> -- "*.ts" "*.tsx"'`. It reads the OBJECT STORE at the exact ref (not the deploy-lagged worktree — see [[feedback_gov_ref_read]]), takes a pathspec, and has no sha-stamp or BRE surprises. That is what settled the 44-site census here.
```

**r2 (after a fresh-reader round on r1):** the one exception to exact output is stated the same way everywhere (dt-review now emits ONE header line, never two); counts exclude it; `:133` no longer says Step 4 is before the push and `:282` no longer says the read is on GitHub; the 7c3dda1f8 mismatch goes back to *cause not established* instead of being closed by assertion; `grep_bre.md:22` is listed.

### `/home/langston/CLAUDE.md` line 17  (+26 bytes)
BEFORE:
```text
- ⚠️ **HOW YOU READ THE REPO — READ OFF THE REVIEW BRANCH ON GITHUB (Kyle directive 2026-07-23). The `/mnt/gdrive` mount is RETIRED; you keep NO working copy.**
```
AFTER:
```text
- ⚠️ **HOW YOU READ THE REPO — AT THE STAMPED SHA, THROUGH `dt-review` (Kyle directive 2026-07-23; the repo goes private). The `/mnt/gdrive` mount is RETIRED; you keep NO working copy.**
```

### `/home/langston/CLAUDE.md` line 18  (-2 bytes)
BEFORE:
```text
  - **Single file (the default — a file in a diff):** read it straight off the review branch at the exact reviewed commit — `curl -s https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/<sha>/<path>` (the `<sha>` is stamped into the REVIEW SOURCE line at the top of every invocation; the repo is public, no auth). Prefer `<sha>` over the branch name so a mid-read push cannot fool you.
```
AFTER:
```text
  - **Single file:** `dt-review show <sha> <path>` — the `<sha>` is stamped into the REVIEW SOURCE line of every invocation. Exact bytes on stdout, provenance on stderr: a stdout line number IS the file's line number — except a stdout line 1 starting `OFF-BRANCH:`/`DEGRADED:`, a one-line header: drop it before numbering or counting. `raw.githubusercontent.com` stops working at the flip.
```

### `/home/langston/CLAUDE.md` line 19  (-110 bytes)
BEFORE:
```text
  - **Whole-tree search (every caller / appears-nowhere-else / blast-radius census, which GitHub will not serve):** run `dt-review grep '<pattern>'` | `dt-review show <path>` | `dt-review ls`. It **pulls from GitHub FIRST, then searches the Hetzner backup** at the exact head — so you are NEVER on stale files — and REFUSES to read if the pull fails. Do not assert file contents on a FETCH FAILED.
```
AFTER:
```text
  - **Search / list:** `dt-review grep @<sha> '<BRE>' [<path>...]` | `dt-review ls @<sha>`. Without `@<sha>` they read the mirror head at call time (printed on stderr). Every call pulls from GitHub first; a head read after a failed pull is REFUSED, a pinned read is served under `DEGRADED:`.
```

### `/home/langston/CLAUDE.md` line 20  (+39 bytes)
BEFORE:
```text
  - You reach for `dt-review` ONLY when you genuinely need the whole tree at once; otherwise read the single files off the branch.
```
AFTER:
```text
  - No flags; write a leading `-`/`@` as `[-]`/`[@]`. Exit 0 served · 1 nothing served (read stderr) · 2 request refused · 3 mirror/git failed. On 1-3 assert nothing.
```

### `/home/langston/CLAUDE.md` line 133  (-44 bytes)
BEFORE:
```text
DawnTrader runs everything through a canonical 11-step batch workflow. Your role is the review gate at three points: Step 2 (pre-implementation audit), Step 4 (code-level review of the actual diff before push), and Step 8 (independent verification of staging deploy). The full workflow is in the project's main `CLAUDE.md` — read it off the review branch on session start: `curl -s https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/migration/aws-supabase/CLAUDE.md` (or `dt-review show CLAUDE.md`).
```
AFTER:
```text
DawnTrader runs everything through a canonical 11-step batch workflow. Your role is the review gate at three points: Step 2 (pre-implementation audit), Step 4 (code-level review of the diff at the graded ref, after the push to the review branch and before `main` advances), and Step 8 (independent verification of staging deploy). The full workflow is in the project's main `CLAUDE.md` — read it off the review branch on session start: `dt-review show CLAUDE.md`.
```

### `/home/langston/CLAUDE.md` line 282  (+51 bytes)
BEFORE:
```text
1. **You read code OFF THE REVIEW BRANCH on GitHub (branch `migration/aws-supabase`), not from any local working copy — there is none (Kyle directive 2026-07-23).** Single files via the raw GitHub URL at the stamped `<sha>`; whole-tree search via `dt-review` (which pulls from GitHub first). See the read-model rule near the top of this file.
```
AFTER:
```text
1. **You read code OFF THE REVIEW BRANCH (`migration/aws-supabase`, served from the Helsinki mirror after a fetch from GitHub), not from any local working copy — there is none (Kyle directive 2026-07-23).** Single files via `dt-review show <sha> <path>` at the stamped `<sha>`; search via `dt-review grep @<sha>` (it pulls from GitHub first). See the read-model rule near the top of this file.
```

### `/home/langston/CLAUDE.md` line 299  (-17 bytes)
BEFORE:
```text
- **Read, Write, Edit** — files in this working dir and anywhere on the Hetzner filesystem. The DawnTrader repo is NOT read from a local path anymore — read it off the review branch (raw GitHub URL / `dt-review`); `/mnt/gdrive` is retired
```
AFTER:
```text
- **Read, Write, Edit** — files in this working dir and anywhere on the Hetzner filesystem. The DawnTrader repo is NOT read from a local path anymore — read it off the review branch (`dt-review`); `/mnt/gdrive` is retired
```

### `/home/langston/CLAUDE.md` line 316  (-107 bytes)
BEFORE:
```text
3. Read the project's main `CLAUDE.md` off the review branch for the canonical workflow + Claude Code's perspective: `curl -s https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/migration/aws-supabase/CLAUDE.md` (or `dt-review show CLAUDE.md`).
```
AFTER:
```text
3. Read the project's main `CLAUDE.md` off the review branch for the canonical workflow + Claude Code's perspective: `dt-review show CLAUDE.md`.
```

### `/home/langston/memory-parts/00-legacy.md (composes MEMORY.md:246)` line 242  (-41 bytes)
BEFORE:
```text
- ⛔ **`#1043` IS ABOUT YOUR OWN READ PATH: a sha-pinned `raw.githubusercontent.com` read served the WRONG FILE under HTTP 200, twice in one afternoon.** Until `B-READ-MODEL-BLOB-VERIFY` (row 4.51a) ships, a single raw read is NOT integrity-checked — cross-read anything load-bearing with `dt-review show` and compare.
```
AFTER:
```text
- ⛔ **`#1043` WAS YOUR OLD READ PATH: sha-pinned `raw.githubusercontent.com` reads served the WRONG FILE under HTTP 200.** Retired by `B-CREDENTIALS-PRIVATE-REPO`: read with `dt-review show <sha> <path>`, which serves the blob out of the object store (content-addressed, exact).
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_grep_bre.md` line 3  (+8 bytes)
BEFORE:
```text
description: "dt-review grep is BRE not fixed-string — escaped \\| works, unescaped | returns zero, and the -i FLAG SILENTLY RETURNS ZERO with no error"
```
AFTER:
```text
description: "dt-review grep is BRE not fixed-string — escaped \\| works, unescaped | returns zero; flags are REFUSED (exit 2) since B-CREDENTIALS-PRIVATE-REPO"
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_grep_bre.md` line 14  (+20 bytes)
BEFORE:
```text
Same session, a second provenance defect: a `dt-review grep` result line came back stamped commit `7c3dda1f8` while the tool header claimed the requested ref `0d2939c2c`. The value was identical at both refs so nothing broke — but **the per-line sha stamp is not reliable**, which matters because the whole read-model in [[feedback_gov_ref_read]] rests on reading AT the ref. Re-read any load-bearing value off the raw GitHub URL at the stamped `<sha>` before citing it.
```
AFTER:
```text
Same session, a second provenance defect: a `dt-review grep` result line came back stamped commit `7c3dda1f8` while the tool header claimed the requested ref `0d2939c2c` (the value was identical at both refs). **Cause NOT established** (A7 inferred a fetch between calls; the old tool printed one ref for both, so that is unproven). So: pin searches with `dt-review grep @<sha> …`, check the sha it prints on stderr, and cross-read any load-bearing value with `dt-review show <sha> <path>`.
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_grep_bre.md` line 20  (-296 bytes)
BEFORE:
```text
**★ `dt-review grep -i` SILENTLY RETURNS ZERO — no error, no warning, exit clean (measured 2026-08-27, B-TOKEN-WATCH Step-1).** The flag is consumed and the result set comes back empty. I used it to "verify" a pre-audit's four-term zero-hits claim and got a clean confirmation that was **entirely manufactured by the broken flag** — the positive control (`-i` on a known-present term → 0; same term without `-i` → hits) is the only thing that caught it. **Never pass a flag to `dt-review grep`.** Do case variants as separate unflagged invocations (`solana`, `Solana`, `SOLANA`). This is the same false-absence class as [[feedback_narrow_predicate_false_absence]], but sourced from the INSTRUMENT rather than the predicate — and it is invisible without a control, because a silently-empty result is indistinguishable from a true zero.
```
AFTER:
```text
**★ `dt-review grep -i` USED TO SILENTLY RETURN ZERO (measured 2026-08-27, B-TOKEN-WATCH Step-1):** the flag was taken as the pattern, and a four-term zero-hits claim was "confirmed" by the broken flag alone; only the positive control caught it. **Since B-CREDENTIALS-PRIVATE-REPO every flag is REFUSED (exit 2, stderr, empty stdout).** Case variants are still separate unflagged searches (`solana`, `Solana`, `SOLANA`). Same false-absence class as [[feedback_narrow_predicate_false_absence]], sourced from the instrument rather than the predicate.
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 3  (+32 bytes)
BEFORE:
```text
description: dt-review show line numbers are +1 (provenance header) and dt-review grep silently returns zero for any flag — both manufacture false absences
```
AFTER:
```text
description: dt-review's +1 show header and silent zero on grep flags, both FIXED by B-CREDENTIALS-PRIVATE-REPO (a DEGRADED/OFF-BRANCH read keeps ONE header line) — keep positive controls
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 11  (-20 bytes)
BEFORE:
```text
Two measured instrument traps in `dt-review` (2026-09-28, verified against raw.githubusercontent at the same sha):
```
AFTER:
```text
Two traps measured in `dt-review` on 2026-09-28, **both FIXED by B-CREDENTIALS-PRIVATE-REPO**:
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 13  (-77 bytes)
BEFORE:
```text
1. **`dt-review show <path>` PREPENDS a one-line provenance header** (`# <path> at <sha> (pulled from GitHub just now)`), so every line number derived from its output is **+1 against the real file**. I nearly reported four of CC-C's `path:line` cites as off-by-one when the offset was mine. Subtract one, or cross-read with `curl raw.githubusercontent.com/.../<sha>/<path> | sed -n '<n>p'`.
```
AFTER:
```text
1. **`show` used to PREPEND a provenance header** (every line number +1). **Now provenance is on stderr and stdout is the exact file: do NOT subtract one** — except that an off-branch or degraded pinned read puts ONE header line (`OFF-BRANCH:`/`DEGRADED:`) on stdout line 1: drop it, then the numbers are exact.
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 14  (-97 bytes)
BEFORE:
```text
2. **`dt-review grep` silently returns ZERO for any flag** — `-i`, `-n` are swallowed and nothing matches, with no error and no marker. It reads exactly like a clean absence. Pattern only, no flags; and **positive-control every grep whose answer is a zero** (a known-present string through the same invocation).
```
AFTER:
```text
2. **`grep` used to silently return ZERO for any flag.** Flags are now REFUSED (exit 2). A zero is exit 1 with `# 0 matches` on stderr. Still **positive-control every zero** (a known-present string, same invocation).
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 18  (+72 bytes)
BEFORE:
```text
**How to apply:** for any load-bearing whole-tree claim, run flagless `dt-review grep` to a file, count the file, and cross-read one hit against raw GitHub before asserting presence, absence, or a line number. Related: [[feedback_dt_review_grep_bre]], [[feedback_epistemics_open_the_file]], [[feedback_narrow_predicate_false_absence]].
```
AFTER:
```text
**How to apply:** for a load-bearing whole-tree claim, run flagless `dt-review grep @<sha>` to a file, count it EXCLUDING a leading `OFF-BRANCH:`/`DEGRADED:` header line, and cross-read one hit with `dt-review show <sha> <path>` before asserting presence, absence or a line number. Related: [[feedback_dt_review_grep_bre]], [[feedback_epistemics_open_the_file]], [[feedback_narrow_predicate_false_absence]].
```

### `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md (the store's index)` line 15  (+45 bytes)
BEFORE:
```text
- [dt-review grep is BRE, not fixed-string](feedback_dt_review_grep_bre.md) — escaped `\|` works, unescaped `|` silently returns 0; #593 records it wrong; per-line sha stamp unreliable
```
AFTER:
```text
- [dt-review grep is BRE, not fixed-string](feedback_dt_review_grep_bre.md) — escaped `\|` works, unescaped `|` silently returns 0; #593 records it wrong; per-line sha stamp mismatch, cause not established; pin with `grep @<sha>`
```

### `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md (the store's index)` line 40  (-47 bytes)
BEFORE:
```text
- [dt-review instrument traps: show is +1 (header line), grep silently zeroes on ANY flag](feedback_dt_review_instrument_traps.md) — 2026-09-28; both are false-absence generators; enumerate to a file (never | head), positive-control every zero, cross-read one hit against raw GitHub
```
AFTER:
```text
- [dt-review traps, FIXED for on-branch non-degraded reads](feedback_dt_review_instrument_traps.md) — no subtract-one; a stdout line 1 OFF-BRANCH:/DEGRADED: is a header, drop it before numbering or counting; positive-control every zero
```
