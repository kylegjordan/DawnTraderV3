"""Coltrane's Discord bot — its OWN identity on the channel, and its own DM inbox.

⛔⛔ THIS REPLACES THE LOG-TAILING BRIDGE, AND THE REASON IS DMs. Tailing
    `cc-discord-inbox.jsonl` worked for channel traffic and could never work for
    direct messages: a bot receives those over the gateway, and nothing writes
    them to that file. Kyle asked to message Coltrane privately, so the bridge had
    to become a real gateway client. Posting under its own identity — rather than
    the shared CC webhook — came with it rather than being a second job.

★ WHAT CHANGED FOR EVERYONE ELSE: Coltrane's posts now come from the Coltrane bot,
  not from the webhook the four Claude sessions share. Kyle's concern about
  messages getting crossed is answered structurally: it is a different Discord
  identity, so it can carry its own colour and take its own DMs.

⛔ THE LOOP GUARD IS NOT A BLANKET BOT-IGNORE, AND THAT DISTINCTION MATTERS.
   Langston is ALSO a bot, and Coltrane iterating with Langston is the entire
   point of putting them in one channel. So:
     · IGNORE our own messages — the only genuinely unbounded loop.
     · IGNORE the automated notice senders by NAME (push notices, heartbeats).
     · ENGAGE everything else that names us, human or bot.
   ⚠️ A blanket `if message.author.bot: return` would have silently made
     Langston unable to reach Coltrane, and it would have looked like working code.

⛔ NO RATE LIMIT. Kyle, 2026-09-08: *"I don't want any limitations on that. If that
   happens, it's a cost. I will make sure to pay."* Every invoke is logged with its
   token count so the spend is readable; nothing is throttled.
"""

import asyncio, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

import discord

TOKEN_FILE = "/etc/coltrane/discord-coltrane-bot.env"
COMMS_FILE = "/etc/dawntrader/discord-comms.env"
RUNLOG = "/var/log/coltrane-invokes.jsonl"
INBOX = "/var/log/cc-discord-inbox.jsonl"
USER, HOME = "coltrane", "/home/coltrane"
# ⛔ cwd is a SCRATCH directory, and that is the fence rather than a tidiness choice.
#    Codex's workspace-write sandbox makes the working directory writable. With cwd
#    = /home/coltrane that would have handed the agent write access to its whole home,
#    including ~/.codex. Pointing cwd at a scratch dir means the writable set is exactly
#    scratch + its memory store (config.toml writable_roots), and nothing else.
WORKDIR = "/home/coltrane/work"
MEMDIR = "/home/coltrane/memory"
# ⛔⛔ THE SANDBOX IS SET BY THESE FLAGS, NOT BY config.toml — MEASURED, AND THE CONFIG
#    ROUTE LOOKS LIKE IT WORKS. `sandbox_mode = "workspace-write"` was written into
#    ~/.codex/config.toml and the very next probe still came back
#    "mkdir: cannot create directory: Read-only file system" for the agent's OWN store.
#    `codex exec` defaults to read-only and takes the flag; nothing warns that the config
#    key was ignored.
#    ⇒ WITHOUT THIS LINE the agent is told in its instructions to record what it learns,
#      is handed a store it cannot write to, and every write fails silently inside its own
#      shell. The store would read as "it never had anything worth recording."
# ★ MEASURED FENCE, with the negative controls that make it mean something:
#      writable: the memory store, and the scratch cwd
#      REFUSED:  /home/coltrane itself, /etc, and Langston's OAuth token
#                (`cat /etc/langston/oauth.env` -> Permission denied)
# ⛔ NETWORK IS ON, AND IT IS ON FOR EXACTLY ONE REASON: PUSHING ITS OWN WORK.
#    MEASURED 2026-09-08 with it off: the agent could `git commit` fine and the push died
#    with "Could not resolve hostname github.com". Committing without pushing is the worst
#    of both — work exists, nobody can see it, and the agent reports success on the commit.
# ⚠️ THIS IS A REAL WIDENING AND IS NOT DRESSED UP AS ANYTHING ELSE: the shell can now reach
#    the internet generally, not just GitHub. Codex's workspace-write sandbox has no
#    per-host allowlist to narrow it to.
# ★ WHAT STILL HOLDS, measured, so the widening is bounded rather than trusted:
#      · it can write ONLY its memory store and its scratch cwd — /home/coltrane itself,
#        /etc, /opt and /var all still refuse
#      · `cat /etc/langston/oauth.env` -> Permission denied
#      · its GitHub key reaches the WORK repo alone: aimed at the real repo, GitHub answers
#        "Permission to kylegjordan/DawnTraderV3.git denied to deploy key"
#      · every invoke is logged with its token count
# ⇒ THE ALTERNATIVE, IF THIS EVER NEEDS TIGHTENING: keep the network off and have a timer
#   OUTSIDE the sandbox push whatever it has committed. Costs a delay and a background
#   actor; it was not worth those today.
# ⛔⛔ `--approve-for-me` REPLACED `-s workspace-write`, AND THE TWO CANNOT BOTH BE PASSED
#    (codex refuses the combination). The reason is the BROWSER: an MCP tool call raises an
#    approval request, and under the headless default policy of "never" every single one is
#    REFUSED — measured, three navigations in a row came back "MCP tool call requires
#    approval, but approval policy is never".
# ★ THE FENCE WAS RE-PROVED UNDER THE NEW FLAG RATHER THAN ASSUMED TO SURVIVE IT, because
#   swapping the flag that names the sandbox is exactly when a fence quietly disappears.
#   Identical results to the -s form: /home/coltrane read-only, /etc read-only,
#   `cat /etc/langston/oauth.env` -> Permission denied, memory store writable.
#   The refusals are the OS sandbox, not the approval layer, which is why they still fire.
SANDBOX = ("--add-dir " + MEMDIR
           + " -c sandbox_workspace_write.network_access=true --approve-for-me")
NL = chr(10)

NAME_RE = re.compile(r"\b(coltrane|codex)\b", re.I)
CREW_RE = re.compile(r"@crew\b|\bALL SESSIONS\b", re.I)
# ⛔ By NAME, not by bot-ness — see the docstring. These are automated notices only.
MUTE_SENDERS = {"push notice", "heartbeat"}
PROMPT_MAX = 12_000


def env(path, key):
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def mirror_to_inbox(text, channel_id, is_dm):
    """⛔⛔ WRITE OUR OWN POSTS INTO THE SHARED INBOX LOG, OR THEY WAKE NOBODY.

    MEASURED 2026-09-08: Coltrane's first reply through its own bot landed in the channel
    correctly — and was ABSENT from `cc-discord-inbox.jsonl`. That file is written by the
    CC bridge, which does not observe another bot's messages, and it is what the CC wake
    filter tails.
    ⇒ A Coltrane reply naming OLD Claude would have woken NOBODY. It would sit in the
      channel looking perfectly answered while reaching no one — the worst shape of
      failure, because it is invisible from both ends.
    ★ Fixed HERE rather than in the CC bridge on purpose: that bridge carries Langston's
      traffic and Kyle's inbound, and this does not need to touch it. The row shape
      matches what the filter already parses (`kind: cc_outbound` + `sender`), so the
      existing routing applies with no filter change.
    ⚠️ DMs are deliberately NOT mirrored — a private message is not channel traffic, and
      copying it into a log four sessions read would be a disclosure nobody asked for."""
    if is_dm:
        return "not mirrored (DM)"
    try:
        row = {"ts": utc(), "kind": "cc_outbound", "sender": "Coltrane",
               "text": text, "channel_id": str(channel_id),
               # transport MUST read "discord" verbatim. MEASURED 2026-09-08: with
               # "coltrane-bot" here the wake line came out as "via Telegram" — the filter
               # tests that one string and falls back to Telegram for anything else
               # (cc-wake-filter.py:326). Telegram was decommissioned in July, so a woken
               # session would have been pointed at a channel that no longer exists, and
               # MEMORY 4.6 keys the reply channel off exactly that label.
               "transport": "discord", "source": "coltrane-bot.py"}
        with open(INBOX, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + NL)
        return "mirrored"
    except Exception as e:
        return "MIRROR FAILED: %s: %s" % (type(e).__name__, e)


def log(row):
    try:
        with open(RUNLOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + NL)
    except Exception:
        pass


def invoke(message_text, why, history):
    """Run codex as the coltrane user. ⛔ Prompt on STDIN, never argv."""
    prompt = (
        "You have been addressed on Discord." + NL
        + "Reason you were woken: " + why + "." + NL + NL
        + "⛔ Follow your AGENTS.md. You are NOT part of the routine batch and review "
        + "loop — that is Langston's. You are here because someone asked for you." + NL
        + "⛔ Reply with the MESSAGE TEXT ONLY. It is posted verbatim." + NL
        + "⛔ LEAD your reply with the NAME of whoever you are answering so their session "
        + "wakes. Answering Langston? His name must be the FIRST WORD." + NL
        + "✅ Nothing worth saying? Reply with exactly: SILENT" + NL + NL
        + "--- recent context (oldest first) ---" + NL + history + NL + NL
        + "--- the message that woke you ---" + NL + message_text + NL
    )
    p = "/tmp/coltrane-prompt-%d.md" % int(time.time() * 1000)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(prompt)
    os.chmod(p, 0o644)
    try:
        with open(p, encoding="utf-8") as fh:
            r = subprocess.run(
                ["sudo", "-u", USER, "env", "HOME=" + HOME, "sh", "-c",
                 "cd " + WORKDIR + " && codex exec --skip-git-repo-check "
                 + SANDBOX + " -"],
                stdin=fh, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=900)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "")
    finally:
        try:
            os.unlink(p)
        except OSError:
            pass


def chunks(text, n=1900):
    """Discord caps a message at 2000 characters. Split on line boundaries so a
    `path:line`, a sha or a URL is never cut in half — this project has been bitten
    by exactly that in the Langston dispatch path."""
    out, cur = [], ""
    for line in text.split(NL):
        if len(cur) + len(line) + 1 > n:
            if cur:
                out.append(cur)
            while len(line) > n:            # a single unbreakable long line
                out.append(line[:n])
                line = line[n:]
            cur = line
        else:
            cur = (cur + NL + line) if cur else line
    if cur:
        out.append(cur)
    return out or [text[:n]]


class Coltrane(discord.Client):
    async def on_ready(self):
        log({"ts": utc(), "event": "bot online", "as": str(self.user),
             "id": self.user.id})
        print("Coltrane online as", self.user, flush=True)

    async def on_message(self, m):
        # ⛔ BRAKE 1 — self. The only unbounded loop.
        if m.author.id == self.user.id:
            return
        text = (m.content or "").strip()
        if not text:
            return
        who = str(m.author.display_name or m.author.name)
        # ⛔ BRAKE 2 — automated notices, matched by NAME so Langston still gets through.
        if who.strip().lower() in MUTE_SENDERS:
            return

        is_dm = isinstance(m.channel, discord.DMChannel)
        if is_dm:
            why = "direct message from " + who
        elif NAME_RE.search(text):
            why = "named directly by " + who
        elif CREW_RE.search(text):
            why = "crew-wide call from " + who
        else:
            return

        history = ""
        if not is_dm:
            try:
                msgs = [x async for x in m.channel.history(limit=25)]
                msgs.reverse()
                buf, used = [], 0
                for x in msgs:
                    piece = "[%s] %s: %s" % (str(x.created_at)[:19],
                                             x.author.display_name, (x.content or "")[:600])
                    if used + len(piece) > PROMPT_MAX:
                        break
                    buf.append(piece)
                    used += len(piece)
                history = NL.join(buf)
            except Exception:
                history = ""

        async with m.channel.typing():
            t0 = time.time()
            rc, out, err = await asyncio.to_thread(invoke, text, why, history)

        toks = ""
        mt = re.search(r"tokens used[\s:]*([\d,]+)", err)
        if mt:
            toks = mt.group(1)

        posted, silent, mirrored = None, (out.strip().upper() == "SILENT" if out else False), None
        if rc == 0 and out and not silent:
            try:
                for part in chunks(out):
                    await m.channel.send(part)
                posted = "ok (%d part(s))" % len(chunks(out))
                mirrored = mirror_to_inbox(out, m.channel.id, is_dm)
            except Exception as e:
                posted = "SEND FAILED: %s: %s" % (type(e).__name__, e)
                mirrored = "not attempted (send failed)"
        elif rc != 0:
            posted = "invoke failed rc=%d" % rc

        log({"ts": utc(), "why": why, "dm": is_dm, "rc": rc,
             "seconds": round(time.time() - t0, 1), "tokens_used": toks,
             "silent": silent, "posted": posted, "mirrored": mirrored, "woken_by": who,
             "measures": ("one row per wake that led to an invoke; token count is the "
                          "spend surface, and nothing here is rate-limited by design")})


def main():
    token = env(TOKEN_FILE, "DISCORD_COLTRANE_BOT_TOKEN")
    if not token:
        print("no token at " + TOKEN_FILE, file=sys.stderr)
        return 2
    intents = discord.Intents.default()
    intents.message_content = True      # matches the portal toggle; without it, content is blank
    intents.dm_messages = True
    Coltrane(intents=intents).run(token, log_handler=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
