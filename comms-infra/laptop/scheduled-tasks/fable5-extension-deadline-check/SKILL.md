---
name: fable5-extension-deadline-check
description: One-time check at 12:00 AM PT July 20 2026 — did Anthropic extend Fable 5 subscription inclusion again, or did it go credits-only?
---

This is an automated one-time run for DawnTrader V3 (governed by CLAUDE.md rule 21 + the standing Fable-5-back-in-Max watch). Kyle is not present — execute autonomously, make reasonable choices, and report.

CONTEXT (as of 2026-07-19): Anthropic included Claude Fable 5 (`claude-fable-5`) in Pro/Max/Team subscriptions on a temporary promotional basis — free for up to 50% of weekly limits, alongside a 50% boost to Claude Code weekly rate limits. That promo window was extended TWICE at the last minute (July 7 -> July 12 -> July 19), each announced only hours before the deadline. As announced, it ends 2026-07-19 at 11:59pm Pacific, after which ALL Fable 5 usage bills as prepaid usage credits ON TOP of the subscription at $10 per million input tokens / $50 per million output tokens. Anthropic has said it aims to restore Fable 5 to standard subscription inclusion "once capacity allows" but has given NO date. This run fires one minute after that deadline specifically to find out which way it went.

DO:
1. Determine from Anthropic OFFICIAL sources whether the deadline actually hit or was extended AGAIN: check anthropic.com/news, anthropic.com/claude/fable, support.claude.com plan/pricing pages, platform.claude.com docs (models overview / pricing), status.anthropic.com, and Anthropic's official X/social announcements. Reputable tech press may corroborate but the official source governs. Look specifically for a NEW extension date, or confirmation that credits-only billing began July 20.
2. Run a LIVE one-off test on Langston's Hetzner box to confirm the model still responds for our account (this proves ACCESS, not billing):
   ssh root@204.168.141.77 "sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=\$(cat /etc/langston/oauth.env | cut -d= -f2-) && export HOME=/home/langston && /usr/bin/claude -p --model claude-fable-5 --permission-mode bypassPermissions \"reply with the single word OK\"'"
   Returns text = accessible. Errors = not accessible. IMPORTANT: a passing test does NOT mean it is included in the Max subscription — billing status must come from the official sources in step 1.
3. Classify the outcome as exactly one of: (a) EXTENDED AGAIN — note the new date; (b) CREDITS-ONLY NOW — the promo ended as scheduled; (c) PERMANENTLY FOLDED BACK INTO MAX — the outcome Kyle's standing watch is actually waiting for; (d) UNCLEAR from official public pages.

REPORT (always report — this is a Kyle-requested check, so do NOT finish silently):
Post ONE plain-language message to Discord #general:
  ssh root@204.168.141.77 'cc-send --sender "OLD Claude" --message "**CLAUDE OLD (CC) SPEAKING — FABLE 5 DEADLINE CHECK:** <plain language>"'
For a multi-line body, write it to a local file, scp it to root@204.168.141.77:/tmp/, and pass "$(cat /tmp/<file>)" inside single quotes so expansion happens remotely.
Add --notify (which @-mentions Kyle for a phone push) ONLY for outcome (a) or (c) — a genuine change. For (b), the expected outcome, post without --notify.
PLAIN LANGUAGE IS MANDATORY (CLAUDE.md §1): no file paths, no model-id strings in the body beyond calling it "Fable 5", no jargon. Say what happened, what it costs now, and what it means for us. Also state the standing recommendation unless something changed: stay on Opus 4.8 for both CC sessions and Langston, and do NOT switch anything unilaterally — Kyle decides.

THEN: append a dated row to the dedup ledger G:/My Drive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md under "Surfaced to Kyle" (newest first) recording the outcome, then commit + push ONLY that file from the Google Drive repo (git pull --ff-only first; check `gh run list --branch migration/aws-supabase --limit 1` is green before pushing; plain descriptor commit subject, no batch-id token). Do NOT switch any model or change any config.