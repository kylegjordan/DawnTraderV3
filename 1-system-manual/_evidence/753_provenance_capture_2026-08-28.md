# #753 PROVENANCE CAPTURE — taken 2026-08-28, at Langston's instruction

> He is right that the stashes preserve CONTENT, not PROVENANCE. This captures what is still
> observable before it ages out. It is a SNAPSHOT, not a conclusion.

## reflog around the two incidents (the only surviving record of what moved the tree)
```
37633550d HEAD@{2026-08-28 11:33:45 +0400}: commit: Langston's four corrections to the loop, plus his derived sibling check (built, controlled)
a187db156 HEAD@{2026-08-28 11:25:16 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
a187db156 HEAD@{2026-08-28 11:25:16 +0400}: rebase (pick): Edit 10 completed: the loop added to all four workflow skills, and the "collision" retracted
c8db0f80e HEAD@{2026-08-28 11:25:16 +0400}: rebase (start): checkout origin/migration/aws-supabase
31b9cf343 HEAD@{2026-08-28 11:25:14 +0400}: commit: Edit 10 completed: the loop added to all four workflow skills, and the "collision" retracted
5cbbfc224 HEAD@{2026-08-28 11:13:10 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
5cbbfc224 HEAD@{2026-08-28 11:13:10 +0400}: rebase (pick): B-GOV-REPORTING edit 10: the fresh reviewer is a LOOP, not a one-shot (Kyle 2026-08-27)
83ecde5cb HEAD@{2026-08-28 11:13:10 +0400}: rebase (start): checkout origin/migration/aws-supabase
e2f080830 HEAD@{2026-08-28 11:13:09 +0400}: commit: B-GOV-REPORTING edit 10: the fresh reviewer is a LOOP, not a one-shot (Kyle 2026-08-27)
dab6316f9 HEAD@{2026-08-28 10:53:10 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
dab6316f9 HEAD@{2026-08-28 10:53:10 +0400}: rebase (pick): #732 SPLIT: the investigation is its own item ahead of the fix (Kyle 2026-08-27)
42abd1a5f HEAD@{2026-08-28 10:53:10 +0400}: rebase (start): checkout origin/migration/aws-supabase
82c0d4ac1 HEAD@{2026-08-28 10:53:09 +0400}: commit: #732 SPLIT: the investigation is its own item ahead of the fix (Kyle 2026-08-27)
7cb9feeda HEAD@{2026-08-28 10:42:16 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
7cb9feeda HEAD@{2026-08-28 10:42:16 +0400}: rebase (pick): #753 + B-CROSS-SESSION-BLEED placed next-up; trailing-stop label moved to the back of Phase 19
dbeaa5049 HEAD@{2026-08-28 10:42:16 +0400}: rebase (start): checkout origin/migration/aws-supabase
cd3d081db HEAD@{2026-08-28 10:42:15 +0400}: commit: #753 + B-CROSS-SESSION-BLEED placed next-up; trailing-stop label moved to the back of Phase 19
0b00e9e25 HEAD@{2026-08-28 10:13:19 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
0b00e9e25 HEAD@{2026-08-28 10:13:19 +0400}: rebase (pick): Kyle's two placements: B-MEASURE-GATE moved to next-up, and #732 placed for the first time
f5a328dff HEAD@{2026-08-28 10:13:19 +0400}: rebase (start): checkout origin/migration/aws-supabase
55beaed54 HEAD@{2026-08-28 10:12:56 +0400}: commit: Kyle's two placements: B-MEASURE-GATE moved to next-up, and #732 placed for the first time
b3749c531 HEAD@{2026-08-27 23:18:56 +0400}: rebase (finish): returning to refs/heads/migration/aws-supabase
b3749c531 HEAD@{2026-08-27 23:18:56 +0400}: rebase (pick): B-CLAUDEMD-SLIM r4 + the weekly mistake pass: three of my eight absences were FALSE
49731af9f HEAD@{2026-08-27 23:18:56 +0400}: rebase (start): checkout origin/migration/aws-supabase
a50c14d3d HEAD@{2026-08-27 23:18:55 +0400}: commit: B-CLAUDEMD-SLIM r4 + the weekly mistake pass: three of my eight absences were FALSE
```

## stash metadata
```
stash@{2026-08-28 10:13:19 +0400}: On migration/aws-supabase: CC-C content found in my tree 2026-08-27 - KEEP until cause established
stash@{2026-08-21 14:26:08 +0200}: On migration/aws-supabase: 25.c: CC-C's #736/#737 found staged in MY index 2026-08-21 — KEEP until cause established
stash@{2026-08-18 15:03:55 +0200}: On migration/aws-supabase: CC-C-685-not-mine-2026-08-09
```

## file identity — RUNNING_ISSUES.md in this clone
```
inode=124411939706114452 size=1934087 mtime=2026-08-28 11:25:16.161161200 +0400 ctime=2026-08-28 11:25:16.161161200 +0400 links=1
```

## is .git a real directory, and is this clone genuinely separate?
```
toplevel: C:/DawnTraderV3-old
gitdir:   .git
drwxr-xr-x 1 kyleg 197609 0 Aug 28 11:33 .git
```

## hooks that touch the tree or index (candidate writers)
```
drwxr-xr-x 1 kyleg 197609     0 Aug 26 22:36 .
drwxr-xr-x 1 kyleg 197609     0 Aug 28 10:13 ..
-rwxr-xr-x 1 kyleg 197609  9061 Aug 21 16:44 fresh-rules.mjs
-rwxr-xr-x 1 kyleg 197609 15435 Jul 23 15:10 guard-bare-commit.mjs
-rwxr-xr-x 1 kyleg 197609  2205 Jul 23 15:10 guard-governed-read.mjs
-rwxr-xr-x 1 kyleg 197609 12443 Aug 21 16:44 guard-push-tsc-baseline.mjs
-rwxr-xr-x 1 kyleg 197609  2382 Aug  7 15:16 instructions-loaded-native.mjs
-rwxr-xr-x 1 kyleg 197609 11444 Aug 25 04:37 load-conduct.mjs
-rwxr-xr-x 1 kyleg 197609  7380 Aug 26 22:36 load-own-memory.mjs
-rwxr-xr-x 1 kyleg 197609  6648 Aug 21 15:36 log-instructions-loaded.mjs
-rwxr-xr-x 1 kyleg 197609   637 Aug  3 18:45 probe-warn-delivery.mjs
-rwxr-xr-x 1 kyleg 197609  1258 Jul 23 15:10 session-reminder.mjs
```
