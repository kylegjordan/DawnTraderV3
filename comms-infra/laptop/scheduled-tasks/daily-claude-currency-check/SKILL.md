---
name: daily-claude-currency-check
description: Daily check for (1) a newer/stronger Claude model AND (2) new Claude Code features/functionality useful to DawnTrader — both confirmed from Anthropic official sources; surface to Kyle only if genuinely new + useful. Replaces daily-claude-model-check, whose working folder was the retired Drive path (#739).
---

Daily DawnTrader V3 currency check (governed by CLAUDE.md rule 21). TWO parts: (PART A) is a newer/stronger Claude model available; (PART B) are there new Claude Code features worth adopting.

⛔ THIS IS A SCHEDULED, SESSION-LESS RUN. Post to Discord as sender "OLD Claude" via `cc-send`. On Discord the `--sender` value IS the speaker label — do NOT add any in-body "SPEAKING:" prefix. Post ONLY if there is a finding; otherwise stay silent on Discord. The RUN LOG row in step D is written on EVERY run, finding or not.

⛔ PROVENANCE OF THIS TASK (do not re-derive): this replaces `daily-claude-model-check`, which was created with its working folder set to `G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3`. That folder was retired 2026-07-24 (CLAUDE.md §7.1) and the app has SKIPPED every dispatch since — last genuine run 2026-07-23, and `lastRunAt` is stamped on the skip, so the registry read green while nothing ran. Full record: RUNNING_ISSUES #739 addenda; batch `B-ROUTINE-REHOME`, PHASE_19_PLAN governance queue row 6.95. The old task is disabled; do not re-enable it.

═══ PART A — MODEL CHECK ═══
⚠️ The Claude Code app's model-selector dropdown is NOT a reliable source — it lists shut-down models. Confirm availability TWO ways, never the dropdown:
1. Check Anthropic OFFICIAL sources for the newest lineup and exact model IDs: docs.claude.com (models overview), anthropic.com/news, status.anthropic.com. Use WebSearch/WebFetch (load them via ToolSearch if they are not already available).
2. For EACH candidate (any new or stronger ID found, PLUS always re-test `claude-fable-5`), run a LIVE one-off test on Langston's box to prove it functions for our account:
   ssh root@204.168.141.77 "sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=$(cat /etc/langston/oauth.env | cut -d= -f2-) && export HOME=/home/langston && /usr/bin/claude -p --model <CANDIDATE_ID> \"OK\"'"
   SUCCESS = returns text ⇒ functioning. FAILURE = errors ("model may not exist or you may not have access") ⇒ NOT usable; do not recommend.
3. A new/stronger model is report-worthy ONLY if confirmed on the official site AND it passes the live test.
4. STANDING FABLE-5-BACK-IN-MAX WATCH (Kyle directive 2026-07-07): the live test proves ACCESS, not BILLING. If `claude-fable-5` passes, say explicitly that billing status is unconfirmed and must be checked before any switch.
5. NEVER switch anything unilaterally. Surface and recommend; Kyle decides. If he approves a Langston switch, the model is set at TWO live sites and both must change or he runs split: `/opt/discord-bridges/discord-langston-bridge.py` (CLAUDE_MODEL, the chat path) and `/usr/local/bin/langston-call` (MODEL, the alert/queue path). Snapshot rollback copies of both first.

═══ PART B — CLAUDE CODE FEATURE CHECK ═══
Goal (Kyle directive 2026-06-16): adopt useful new Claude Code capabilities quickly. Check Anthropic's official changelog/news for new features and functionality. For each, assess whether it would help how DawnTrader actually works (three concurrent sessions, a reviewer on a remote box, Discord comms, scheduled tasks, hooks, governance documents in git).

═══ STEP C — DEDUP BEFORE REPORTING ═══
Refresh the working clone and read the ledger from it:
  cd /c/DawnTraderV3-old && git fetch origin && git pull --ff-only origin migration/aws-supabase
Read `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md`. Anything already listed under "Already adopted / known" or already surfaced is NOT re-reported. Items under "WATCHING FOR" are report-worthy the moment they land.

═══ STEP D — THE RUN LOG ROW (EVERY RUN, INCLUDING SILENT ONES) ═══
This row is the committed liveness artifact — it is the ONLY evidence, readable at the ref by Langston and Kyle, that this routine ran. `lastRunAt` in the app registry is NOT evidence: it is stamped even when the app skips the task (#739).
Append ONE row to the RUN LOG section of `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md`, newest first:
  - YYYY-MM-DD | ran HH:MMZ | <finding summary, or "no findings">
Then commit and push from /c/DawnTraderV3-old with explicit paths (CLAUDE.md rule 25 — a bare `git commit` is blocked by a hook):
  git add -- 1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md
  git commit -F <msgfile> -- 1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md
  git push origin migration/aws-supabase
If the push is rejected because the branch moved: `git fetch origin && git pull --rebase origin migration/aws-supabase`, then push again. A rejected push is the system working.
If you surfaced a FEATURE, also append a dedup row in the same file and same commit: `- YYYY-MM-DD | <feature> | <why it helps DawnTrader> | (Kyle decision: pending)`.

═══ STEP E — REPORT ═══
Only if PART A or PART B produced something genuinely new and useful:
  ssh root@204.168.141.77 'cc-send --sender "OLD Claude" --message "..."'
Plain language, two or three sentences, no file paths and no jargon: what is new, what it would do for us, and your recommendation. Name the exact model ID only if it is a model finding. Silent otherwise — the RUN LOG row is not a Kyle-facing message.