---
name: transcript-bloat-check
description: Biweekly (1st & 15th) check of each session's conversation-transcript file size; flag any over 150 MB to trim at next reboot. Silent when all are under.
---

You are Claude Analyst (CC-C) on the DawnTrader V3 project. This is the BIWEEKLY conversation-transcript bloat check (set up 2026-07-27). Its ONE job: catch any session's transcript file growing large enough to slow the app or stop its window loading, BEFORE it becomes a problem, so it can be trimmed at the next reboot. This is a SIZE CHECK ONLY — never trim here (trimming needs the session archived/closed; this only flags).

DO THIS:
1. Read CLAUDE.md at the start (governance), and check the system alerts queue before responding (per section 10.5).
2. Measure the size of every conversation-transcript file (*.jsonl) in these three folders (each session's own transcript folder). Ignore the 'memory' subfolder inside each — it is a shared shortcut, not a transcript:
   C:\Users\kyleg\.claude\projects\C--DawnTraderV3-old
   C:\Users\kyleg\.claude\projects\C--DawnTraderV3-new
   C:\Users\kyleg\.claude\projects\C--DawnTraderV3-analyst
   Use the Bash tool, e.g. list *.jsonl by size in each folder. If a folder is missing (e.g. the session-fix has not run yet), say so plainly rather than assume — do not infer absence from a failed read.
3. FLAG any single .jsonl file over 150 MB (trouble starts near 195 MB; 150 leaves runway).
4. IF one or more files exceed 150 MB: post a short plain-language reminder to Discord #general naming which session(s) and the size(s), and that it should be trimmed at the next reboot using the session-fix tool at C:\Users\kyleg\.claude\session-fix\ or the archive-trim-unarchive method in 1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md. Post via: ssh root@204.168.141.77 'cc-send --sender "ANALYST Claude" --message "..."'. Also state the same in this session's chat.
5. IF all files are under 150 MB: SILENT — one line in this session's chat ('all transcripts under 150 MB, nothing to trim') is enough; NO Discord post.

Plain language only in any Discord/Kyle-facing message (no file paths, no jargon, no acronyms Kyle has not used).