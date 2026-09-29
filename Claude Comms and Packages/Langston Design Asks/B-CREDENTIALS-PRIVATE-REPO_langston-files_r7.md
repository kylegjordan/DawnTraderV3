# B-CREDENTIALS-PRIVATE-REPO — Langston's files: r7 (your Step-8 F4, applied at Step 10)

**Why:** your Step-8 F4 — `show` re-hashes, `grep`/`ls` do not, and your files did not say so where you read them. One clause each, in the always-loaded `CLAUDE.md` and in the trap's *How to apply*. **Size ratchet:** each edit is net-negative, paid for by trimming the same line. BEFORE = the r6 AFTER text, live since 2026-09-29 ~21:54Z.

### `/home/langston/CLAUDE.md` line 19  (-1 bytes)
BEFORE:
```text
  - **Search / list:** `dt-review grep @<sha> '<BRE>' [<path>...]` | `dt-review ls @<sha>` (unpinned: the mirror head at call time, sha on stderr). Each call tries a pull first; with no fresh pull a head read is REFUSED, and a pinned read is `DEGRADED:` if the sha is in the mirror, else REFUSED.
```
AFTER:
```text
  - **Search / list** (stored bytes, NOT re-hashed): `dt-review grep @<sha> '<BRE>' [<path>...]` | `dt-review ls @<sha>` (unpinned = mirror head, sha on stderr). Each call pulls first; with no fresh pull a head read is REFUSED, a pinned one `DEGRADED:` if the sha is in the mirror, else REFUSED.
```

### `/home/langston/.claude/projects/-home-langston/memory/feedback_dt_review_instrument_traps.md` line 18  (-2 bytes)
BEFORE:
```text
**How to apply:** run flagless `dt-review grep @<sha>` to a file (never `| head`). COUNT ONLY on exit 0, or exit 1 with `# 0 matches` on stderr; any other exit or a `REFUSED` line measured NOTHING. Exclude a leading `OFF-BRANCH:`/`DEGRADED:` line; cross-read one hit with `dt-review show <sha> <path>`. Related: [[feedback_dt_review_grep_bre]], [[feedback_epistemics_open_the_file]], [[feedback_narrow_predicate_false_absence]].
```
AFTER:
```text
**How to apply:** run flagless `dt-review grep @<sha>` to a file (never `| head`). COUNT ONLY on exit 0, or exit 1 with `# 0 matches`; anything else measured NOTHING. Drop a leading `OFF-BRANCH:`/`DEGRADED:` line; cross-read one hit with `dt-review show <sha> <path>` (show re-hashes; grep does not). Related: [[feedback_dt_review_grep_bre]], [[feedback_epistemics_open_the_file]], [[feedback_narrow_predicate_false_absence]].
```
