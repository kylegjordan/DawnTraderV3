# STARTER PROMPT — "Improve Langston" session (Kyle directive 2026-07-22)

> Written by Claude Analyst (CC-C) at Kyle's request. **Paste the block in §2 into a fresh Claude Code session.** §1 is context for Kyle only.

---

## 1. WHY A SEPARATE SESSION (Kyle's framing)

Langston is our reviewer. He is **stateless per message** — every reply is a fresh process that reads his rules, his memory file, and the message, then exits. Kyle: *"That was okay when we first started, but I'm guessing we can improve on that and give him some actual standing contextual memory… And I want to make it so that he is ubiquitous, that he's not only limited to this particular project."* This is deliberately NOT run inside the DawnTrader batch sessions: it is infrastructure work on the reviewer himself, and it should not compete with, or be reviewed by, the thing being changed.

---

## 2. ★ PASTE THIS INTO THE NEW SESSION ★

```
You are working on improving LANGSTON — the AI reviewer for the DawnTrader V3 project.
This session's job is Langston himself, not DawnTrader features. Two goals from Kyle:

  GOAL 1 — STANDING CONTEXTUAL MEMORY. Langston is stateless per message: every reply is a
  fresh `claude -p` process that loads his files, answers, and exits with no memory of its own
  previous turn. He cannot recall a review he gave ten minutes ago. Give him real persistent
  context.

  GOAL 2 — PORTABILITY. Today Langston is welded to DawnTrader. Kyle wants him usable on other
  projects too — the reviewer/PM capability generalised, with project-specific knowledge
  separated from the reusable core.

WHAT LANGSTON IS TODAY — verify each of these yourself before relying on it; they are
handover notes, not gospel, and some may have changed:

  • Runs on Hetzner Helsinki, root@204.168.141.77 (hostname dawntrader-agent). Claude Code
    under Kyle's Max OAuth. Model `claude-opus-4-8[1m]`.
  • Working dir /home/langston/ holds CLAUDE.md (his persona, ~261 lines) and MEMORY.md
    (volatile state, capped ~200 lines). BOTH auto-load on EVERY invocation.
  • He is invoked by /opt/discord-bridges/discord-langston-bridge.py, which spawns a fresh
    `claude -p` whenever a Discord #general message addresses him. Config in
    /etc/langston/ and /etc/dawntrader/. Bridges run under systemd.
  • He reads the project repo through an rclone FUSE mount at /mnt/gdrive. MEASURED
    2026-07-22: this is SLOW but NOT broken — `git rev-parse HEAD` takes ~8s, load average
    0.09, no stuck processes. A 30-second timeout on his box manufactures FALSE failures;
    give any check against him a generous timeout.
  • He reviews at the graded ref `origin/migration/aws-supabase`, not the working tree.
  • The project's CLAUDE.md is ~579 lines / ~113 KB / ~31k tokens and loads on EVERY ONE of
    his invocations — so every review he gives costs the entire rulebook before he reads a
    word of the actual work. That cost is the single strongest argument for this work.

CONSTRAINTS — these are firm:
  • LANGSTON IS LOAD-BEARING RIGHT NOW. He reviews every batch across three concurrent
    sessions. Do not break the live review loop. Any change must be reversible and the
    rollback must be known before it is applied.
  • ANNOUNCE ANY BRIDGE RESTART in Discord #general BEFORE doing it. Restarting silently
    corrupts in-flight review traffic — this happened twice on 2026-07-22 and produced
    phantom truncated messages that made Langston withhold rulings on intact work.
  • The bridge files are REPO-CANONICAL at `comms-infra/discord/` in the DawnTrader repo and
    are pushed to Helsinki. A server-only edit gets reverted by the next deploy. Edit the
    repo copy too, and verify byte-identical.
  • VERIFY BEFORE YOU ASSERT. On 2026-07-22 eleven defect claims were announced and retracted
    in a single day across the crew, every one plausible and wrong. Read the code, check a
    cause's arithmetic against the symptom, and read the history and intent of anything you
    think is broken before calling it broken.

START BY INVESTIGATING, NOT BUILDING. Kyle has not chosen a solution and neither should you
on the first pass. Worth establishing first:
  • What does Langston actually need to remember, evidenced from his real traffic? Read
    /var/log/cc-discord-inbox.jsonl for what he is asked and what he answers. Where does
    statelessness genuinely cost us, versus where is it harmless or even useful?
  • What are the real options for persistent context, and what does each cost? (Session
    resumption, a retrieval store, a curated rolling summary, structured memory files, an
    external index — do not assume; find out what this Claude Code version actually supports.)
  • For portability: what in his CLAUDE.md is genuinely DawnTrader-specific versus reusable
    reviewer/PM capability? A clean split is probably the precondition for everything else.
  • What breaks if he becomes stateful? Statelessness currently guarantees he never rules
    from a stale premise. Persistent memory could make him confidently wrong in a NEW way —
    carrying forward a fact that has since changed. That risk deserves an explicit answer,
    not an afterthought.

Deliver a written options paper with costs and risks BEFORE implementing anything. Kyle
decides; you propose.
```

---

## 3. NOTE FOR KYLE

The last bullet is the one I would watch. **Statelessness is not purely a defect — it is also why Langston never rules from a stale premise.** Today he refused to rule on a message he thought was truncated, and that instinct is a direct consequence of arriving fresh each time. Giving him memory could reintroduce exactly the failure this project keeps hitting: *a remembered fact that is no longer true, looking exactly like a current one.* Worth making the new session answer that explicitly rather than treating persistence as an unalloyed win.
